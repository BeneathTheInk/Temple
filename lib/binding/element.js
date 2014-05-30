var _ = require("underscore"),
	Binding = require("./index"),
	NODE_TYPE = require("../types");

module.exports = [];

// Binding.Text[NODE_TYPE.ELEMENT] = Binding.Text.extend({
	
// });

module.exports.push(Binding.DOM.extend({

	initialize: function(template, options) {
		var el = this.node = document.createElement(template.name);
		this.nodes.push(el);

		// attributes
		var attrOptions = _.extend({}, options, { node: el });
		this.attributes = this.create(template.attributes, attrOptions);
		this.attributes.forEach(function(attr) { attr.appendTo(el); });

		// children nodes
		this.children = this.create(template.children, options);
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

	match: function(template, temple, options) {
		return (
			options.type === "dom" &&
			template.type === NODE_TYPE.ELEMENT
		);
	}

}));