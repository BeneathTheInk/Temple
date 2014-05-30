var _ = require("underscore"),
	Binding = require("./index"),
	NODE_TYPE = require("../types");

// Binding.Text[NODE_TYPE.ELEMENT] = Binding.Text.extend({
	
// });

exports.DOM = Binding.DOM.extend({

	initialize: function(template, options) {
		var el = this.node = document.createElement(template.name);
		this.nodes.push(el);

		options = options || {};
		var bindings = options.bindings || Binding._defaultDOMBindings;

		// attributes
		var attrOptions = _.extend({}, options, { node: el });
		this.attributes = Binding.create(template.attributes, bindings, attrOptions);
		this.attributes.forEach(function(attr) { attr.appendTo(el); });

		// children nodes
		this.children = Binding.create(template.children, bindings, options);
		this.children.forEach(function(child) { child.appendTo(el); });
	},

	render: function(scope) {
		this.attributes.forEach(function(attr) { attr.update(scope); });
		this.children.forEach(function(child) { child.update(scope); });
	},

	destroy: function() {
		this.attributes.forEach(function(attr) { attr.destroy(); });
		this.children.forEach(function(child) { child.destroy(); });
		return Binding.DOM.prototype.destroy.apply(this, arguments);
	}

}, {

	match: function(template) {
		return template.type === NODE_TYPE.ELEMENT;
	}

});