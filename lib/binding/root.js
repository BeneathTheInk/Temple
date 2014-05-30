var Binding = require("./index"),
	NODE_TYPE = require("../types");

module.exports = [];

module.exports.push(Binding.Text.extend({
	initialize: function(template, options) {
		this.children = this.create(template.children, options);
		this.value = "";
	},
	update: function(scope) {
		this.children.forEach(function(c) { c.update(scope); });
		this.value = this.children.map(function(c) { return c.value; }).join("");
	},
	destroy: function() {
		this.children.forEach(function(c) { c.destroy(); });
	}
}, {
	match: function(template, temple, options) {
		return (
			options.type === "text" &&
			template.type === NODE_TYPE.ROOT
		);
	}
}));

module.exports.push(Binding.DOM.extend({
	initialize: function(template, options) {
		this.children = this.create(template.children, options);
	},
	refreshNodes: function() {
		var nodes = [];
		this.children.forEach(function(c) {
			nodes = nodes.concat(c.nodes);
		});
		this.nodes = nodes;
	},
	update: function(scope) {
		this.children.forEach(function(c) { c.update(scope); });
		this.refreshNodes();
	},
	appendTo: function(parent, before) {
		this.children.forEach(function(c) { c.appendTo(parent, before); });
	},
	destroy: function() {
		this.children.forEach(function(c) { c.destroy(); });
	}
}, {
	match: function(template, temple, options) {
		return (
			options.type === "dom" &&
			template.type === NODE_TYPE.ROOT
		);
	}
}));