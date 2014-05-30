var Binding = require("./index"),
	NODE_TYPE = require("../types");

exports.Text = Binding.Text.extend({

	initialize: function() {
		this.value = this.template.value;
	}

}, {

	match: function(template) {
		return template.type === NODE_TYPE.TEXT;
	}

});

exports.DOM = Binding.DOM.extend({
	
	initialize: function() {
		this.nodes.push(document.createTextNode(this.template.value));
	}

}, {

	match: function(template) {
		return template.type === NODE_TYPE.TEXT;
	}

});