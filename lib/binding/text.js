var Binding = require("./index"),
	NODE_TYPE = require("../types");

module.exports = [];

module.exports.push(Binding.Text.extend({

	initialize: function() {
		this.value = this.template.value;
	}

}, {

	match: function(template, temple, options) {
		return (
			options.type === "text" &&
			template.type === NODE_TYPE.TEXT
		);
	}

}));

module.exports.push(Binding.DOM.extend({
	
	initialize: function() {
		this.nodes.push(document.createTextNode(this.template.value));
	}

}, {

	match: function(template, temple, options) {
		return (
			options.type === "dom" &&
			template.type === NODE_TYPE.TEXT
		);
	}

}));