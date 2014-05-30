var _ = require("underscore"),
	util = require("../util"),
	NODE_TYPE = require("../types"),
	Binding = require("./index.js"),
	Scope = require('../scope');

exports.Text = Binding.Text.extend({

	initialize: function(template, options) {
		options = options || {};
		var bindings = options.bindings || Binding._defaultTextBindings;
		this.section = new Section(template, bindings, options);
	},

	update: function(scope) {
		var text = "";
		this.section.update(scope).forEach(function(node) {
			text += node.value;
		});
		this.value = text;
	},

	destroy: function() {
		this.section.destroy();
	}

}, {

	match: function(template) {
		return ~[ NODE_TYPE.SECTION, NODE_TYPE.INVERTED ].indexOf(template.type);
	}

});

exports.DOM = Binding.DOM.extend({

	initialize: function(template, options) {
		options = options || {};
		var bindings = options.bindings || Binding._defaultDOMBindings;
		this.section = new Section(template, bindings, options);
		this.placeholder = document.createComment(_.uniqueId("$"));
		this.nodes.push(this.placeholder);
	},

	render: function(scope) {
		var len = this.section.length(),
			parentNode = this.placeholder.parentNode;
		
		this.section.update(scope);
		
		if (parentNode != null && this.section.length() - len > 0) {
			_.flatten(this.section.rows.slice(len)).forEach(function(binding) {
				binding.appendTo(parentNode, this.placeholder);
			}, this);
		}
	},

	appendTo: function(parent, before) {
		this.section.forEach(function(binding) {
			binding.appendTo(parent, before);
		});

		return Binding.DOM.prototype.appendTo.apply(this, arguments);
	},

	destroy: function() {
		this.section.destroy();
		return Binding.DOM.prototype.destroy.apply(this, arguments);
	}

}, {

	match: function(template) {
		return ~[ NODE_TYPE.SECTION, NODE_TYPE.INVERTED ].indexOf(template.type);
	}

});

/* Section Manager Class */

exports.Section = Section;

function Section(template, bindings, options) {
	this.template = template;
	this.inverted = template.type === NODE_TYPE.INVERTED;
	this.bindings = bindings;
	this.options = options;
	this.rows = [];
}

Section.isEmpty = function(val) {
	return !val || (_.isArray(val) && !val.length);
}

Section.prototype.buildRow = function() {
	return Binding.create(this.template.children, this.bindings, this.options);
}

Section.prototype.updateRow = function(index, scope) {
	var row = this.rows[index];
	if (row == null) row = this.rows[index] = this.buildRow();
	row.forEach(function(row) { row.update(scope); });
	return this;
}

Section.prototype.removeRow = function(index, howMany) {
	if (index == null) index = 0;
	if (howMany == null) howMany = this.rows.length - index;
	if (howMany < 1) return this;
	
	this.rows.splice(index, howMany).forEach(function(row) {
		_.invoke(row, "destroy");
	});

	return this;
}

Section.prototype.update = function(scope) {
	var path = this.template.value,
		model = (scope.findModel(path) || scope).getModel(path),
		val = model.get();

	// register dependencies
	scope.depend(path);
	scope.depend(util.joinPathParts(path, "*"));
	
	if (Section.isEmpty(val)) {
		if (this.inverted) {
			this.updateRow(0, (new Scope(model)).addModel(scope));
			this.removeRow(1);
		} else {
			this.removeRow(0);
		}
	} else {
		if (this.inverted) {
			this.removeRow(0);
		} else {
			if (_.isArray(val)) {
				val.forEach(function(v, index) {
					var nscope = new Scope(model.getModel(index));
					nscope.addModel(scope).setHidden("$index", index);
					this.updateRow(index, nscope);
				}, this);

				this.removeRow(val.length);
			} else {
				this.updateRow(0, (new Scope(model)).addModel(scope));
				this.removeRow(1);
			}
		}
	}

	return this;
}

// number of rows
Section.prototype.length = function() {
	return this.rows.length;
}

Section.prototype.destroy = function() {
	this.removeRow(0);
	return this;
}

// iterate cells
Section.prototype.forEach = function(it, ctx) {
	_.flatten(this.rows).forEach(it, ctx);
	return this;
}