var _ = require("underscore"),
	Binding = require("./index"),
	NODE_TYPE = require("../types");

module.exports = [];

module.exports.push(Binding.Text.extend({

	update: function(scope) {
		var val = scope.get(this.template.value);
		this.value = _.escape(val);
	}

}, {

	match: function(template, temple, options) {
		return (
			options.type === "text" &&
			template.type === NODE_TYPE.INTERPOLATOR
		);
	}

}));

// Unlike in true mustache, this version can never truly "escape"
// content since escaping is only for the HTML renderer's benefit,
// which we are essentially doing the job of. This means that this
// version converts interpolators to text nodes and parses triples
// as raw html nodes
module.exports.push(Binding.DOM.extend({

	initialize: function() {
		this.node = document.createTextNode("");
		this.nodes.push(this.node);
	},

	render: function(scope) {
		var val = scope.get(this.template.value);
		this.node.nodeValue = val != null ? val : "";
	}

}, {

	match: function(template, temple, options) {
		return (
			options.type === "dom" &&
			template.type === NODE_TYPE.INTERPOLATOR
		);
	}

}));