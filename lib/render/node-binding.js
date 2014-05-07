var _ = require("underscore"),
	util = require("../util"),
	NODE_TYPE = require("../types"),
	Binding = require("./binding"),
	Section = require("./section"),
	Deps = require("../deps");

var NodeBinding =
module.exports = Binding.extend({
	initialize: function() {
		_.extend(this, {
			fragment: document.createDocumentFragment(),
			nodes: []
		});

		this.render();
		this.detach();
	},

	// render creates the dom parts
	render: function() {},

	// update fires up an autorun context for a live dom
	update: function(scope) {
		var self = this;
		if (this._comp != null) this._comp.stop();
		this._comp = Deps.autorun(function(comp) {
			self._update(scope, comp);
			comp.onInvalidate(function() {
				if (comp.stopped) delete self._comp;
			});
		});
		return this;
	},

	// _update takes data and makes sure the element is up to snuff
	_update: function(scope) {},

	// render the nodes here; update() will continue in place
	appendTo: function(parent, before) {
		this.nodes.forEach(function(node) {
			parent.insertBefore(node, before);
		}, this);

		return this;
	},

	// remove it from dom, but don't destroy
	detach: function() {
		return this.appendTo(this.fragment);
	},

	// destroy completely... sort of...
	destroy: function() {
		if (this._comp != null) this._comp.stop();
		this.detach();
		delete this.fragment;
		delete this.nodes;
		return this;
	}
});

NodeBinding[NODE_TYPE.SECTION] =
NodeBinding[NODE_TYPE.INVERTED] = NodeBinding.extend({
	render: function() {
		this.section = new Section(this.template, Binding.buildDOM);
		this.placeholder = document.createComment(_.uniqueId("$"));
		this.nodes.push(this.placeholder);
	},

	_update: function(scope) {
		var len = this.section.length();
		this.section.process(scope);
		
		if (this.section.length() - len > 0) {
			_.flatten(this.section.rows.slice(len)).forEach(function(node) {
				node.appendTo(this.placeholder.parentNode, this.placeholder);
			}, this)
		}
	},

	appendTo: function(parent, before) {
		_.flatten(this.section.rows).forEach(function(node) {
			node.appendTo(parent, before);
		});

		return NodeBinding.prototype.appendTo.apply(this, arguments);
	},

	destroy: function() {
		this.section.destroy();
		return NodeBinding.prototype.destroy.apply(this, arguments);
	}
});

NodeBinding[NODE_TYPE.ELEMENT] = NodeBinding.extend({
	setAttribute: function(attr) {
		attr.value = _.pluck(attr.bindings, "value").join("");
		this.node.setAttribute(attr.name, attr.value);
	},

	render: function() {
		var el = this.node = document.createElement(this.template.name);
		this.nodes.push(el);

		// attributes
		this.attributes = [];
		this.template.attributes.forEach(function(attr) {
			var attribute = {
				bindings: Binding.buildText(attr.children),
				name: attr.name
			};

			this.attributes.push(attribute);
			this.setAttribute(attribute);
		}, this);

		// children nodes
		this.children = Binding.buildDOM(this.template.children);
		this.children.forEach(function(child) { child.appendTo(el); });
	},

	_update: function(scope) {
		var self = this;

		this.attributes.forEach(function(attr) {
			if (attr.comp) attr.comp.stop();
			attr.comp = Deps.autorun(function(comp) {
				attr.bindings.forEach(function(child) { child.update(scope); });
				self.setAttribute(attr);
				comp.onInvalidate(function() {
					if (comp.stopped) delete attr.comp;
				});
			});
		});

		this.children.forEach(function(child) { child.update(scope); });
	},

	destroy: function() {
		this.attributes.forEach(function(attr) {
			attr.bindings.forEach(function(child) { child.destroy(); });
			if (attr.comp) attr.comp.stop();
		});
		delete this.attributes;
		
		this.children.forEach(function(child) { child.destroy(); });
		delete this.children;

		return NodeBinding.prototype.destroy.apply(this, arguments);
	}
});

NodeBinding[NODE_TYPE.TEXT] = NodeBinding.extend({
	render: function() {
		this.nodes.push(document.createTextNode(this.template.value));
	}
});

NodeBinding[NODE_TYPE.INTERPOLATOR] = NodeBinding.extend({
	render: function() {
		this.node = document.createTextNode("");
		this.nodes.push(this.node);
	},

	_update: function(scope) {
		var val = scope.get(this.template.value);
		this.node.nodeValue = val != null ? val : "";
	}
});

NodeBinding[NODE_TYPE.TRIPLE] = NodeBinding.extend({
	render: function() {
		this.placeholder = document.createComment(_.uniqueId("$"));
		this.nodes.push(this.placeholder);
	},

	clean: function() {
		this.nodes.forEach(function(node) {
			if (node.parentNode == null || node === this.placeholder) return;
			node.parentNode.removeChild(node);
		}, this);
		this.nodes = [ this.placeholder ];
	},

	_update: function(scope) {
		this.clean();

		var val = scope.get(this.template.value),
			cont = document.createElement("div"),
			nodes, parentNode;

		cont.innerHTML = val;
		nodes = _.toArray(cont.childNodes);
		parentNode = this.placeholder.parentNode;

		if (parentNode) {
			nodes.forEach(function(node) {
				parentNode.insertBefore(node, this.placeholder);
			}, this);
		}

		this.nodes = nodes.concat(this.nodes);
	}
});