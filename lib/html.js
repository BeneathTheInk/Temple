var _ = require("underscore"),
	Binding = require("./binding");

module.exports = Binding.extend({
	constructor: function(value) {
		this.nodes = [];
		this.textValue = "";
		this.setValue(value);
		Binding.call(this);
	},

	insertBefore: function() {
		throw new Error("Text bindings can't have children.");
	},

	updateNodes: function() {
		var parentNode = this.parentNode(),
			nextSiblingNode, node, i;

		// place the nodes in the dom
		if (parentNode != null) {
			nextSiblingNode = this.nextSiblingNode();

			for (i = this.nodes.length - 1; i >= 0; i--) {
				node = this.nodes[i];

				if (parentNode !== node.parentNode || (
					parentNode === node.parentNode &&
					nextSiblingNode !== node.nextSibling )) {
					parentNode.insertBefore(node, nextSiblingNode);
				}

				nextSiblingNode = node;
			}
		}

		// or take them out
		else {
			this.removeNodes();
		}

		return this;
	},

	removeNodes: function() {
		var node, i, parent;

		for (i = 0; i < this.nodes.length; i++) {
			node = this.nodes[i];
			if ((parent = node.parentNode) != null) parent.removeChild(node);
		}

		return this;
	},

	setValue: function(val) {
		val = val != null ? val.toString() : "";
		if (val === this.textValue) return this;

		this.removeNodes();
		this.textValue = val;
				
		// convert html into DOM nodes
		div = document.createElement("div");
		div.innerHTML = val;
		this.nodes = _.toArray(div.childNodes);

		this.updateNodes();
		return this;
	},

	toNodes: function() {
		return this.nodes.slice(0);
	},

	firstNode: function() {
		return this.nodes[0] || null;
	}
});