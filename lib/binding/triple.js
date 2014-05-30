var _ = require("underscore"),
	Binding = require("./index"),
	NODE_TYPE = require("../types");

module.exports = [];

module.exports.push(Binding.Text.extend({

	update: function(scope) {
		var val = scope.get(this.template.value);
		this.value = val;
	}

}, {

	match: function(template, temple, options) {
		return (
			options.type === "text" &&
			template.type === NODE_TYPE.TRIPLE
		);
	}

}));

module.exports.push(Binding.DOM.extend({
	
	initialize: function() {
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

	render: function(scope) {
		var val, cont, nodes, parentNode;

		val = scope.get(this.template.value);
		if (this.value === val) return;
		this.value = val;		

		parentNode = this.placeholder.parentNode;
		cont = document.createElement("div");
		cont.innerHTML = val;
		nodes = _.toArray(cont.childNodes);
		this.clean();

		if (parentNode) {
			nodes.forEach(function(node) {
				parentNode.insertBefore(node, this.placeholder);
			}, this);
		}

		nodes.push(this.placeholder);
		this.nodes = nodes;
	}

}, {

	match: function(template, temple, options) {
		return (
			options.type === "dom" &&
			template.type === NODE_TYPE.TRIPLE
		);
	}
}));