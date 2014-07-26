var Binding = require("./binding"),
	util = require("./util");

module.exports = Binding.extend({
	constructor: function(value) {
		this.nodes = [];
		this.textValue = "";
		this.setValue(value);
		Binding.call(this);
	},

	insertBefore: function() {
		throw new Error("HTML bindings can't have children.");
	},

	updateNodes: function() {
		var parentNode = this.parentNode(),
			beforeNode, node, i;

		// place the nodes in the dom
		if (parentNode != null) {
			beforeNode = this.nextSiblingNode();

			for (i = this.nodes.length - 1; i >= 0; i--) {
				node = this.nodes[i];

				if (!util.isNodeAtDOMPosition(node, parentNode, beforeNode)) {
					parentNode.insertBefore(node, beforeNode);
				}

				beforeNode = node;
			}
		}

		// or take them out
		else {
			this.removeNodes();
		}

		this.trigger("update");
		return this;
	},

	removeNodes: function() {
		var node, i;

		for (i = 0; i < this.nodes.length; i++) {
			node = this.nodes[i];
			if (node.parentNode != null) node.parentNode.removeChild(node);
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
		this.nodes = util.toArray(div.childNodes);

		this.updateNodes();
		return this;
	},

	toNodes: function() {
		return this.nodes.slice(0);
	},

	firstNode: function() {
		return this.nodes[0] || null;
	},

	find: function(selector) {
		var k, node, result;

		for (k in this.nodes) {
			node = this.nodes[k];
			if (node.nodeType !== 1) continue;

			if (util.matchesSelector(node, selector)) return node;
			result = node.querySelector(selector);
			if (result != null) return result;
		}

		return null;
	},

	findAll: function(selector) {
		var k, node, els = [];

		for (k in this.nodes) {
			node = this.nodes[k];
			if (node.nodeType !== 1) continue;

			if (util.matchesSelector(node, selector)) matches.push(node);
			els.push.apply(els, util.toArray(node.querySelectorAll(selector)));
		}

		return els;
	}
});
