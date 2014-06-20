var _ = require("underscore"),
	util = require("../util"),
	Binding = require("./index");

module.exports = Binding.extend({
	constructor: function(value) {
		if (!_.isFunction(value)) {
			var v = value;
			value = function() { return v; }
		}

		this.compute = value;
		this.value = "";
		this.nodes = [];
		this.placeholder = document.createComment(_.uniqueId("$"));

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("HTML bindings can't have children.");
	},

	cleanNodes: function() {
		this.nodes.forEach(function(node) {
			var parent = node.parentNode;
			if (parent != null) parent.removeChild(node);
		});

		this.nodes = [];
		return this;
	},

	refreshNodes: function() {
		var parent = this.placeholder.parentNode;
		if (parent != null) this.nodes.forEach(function(node) {
			parent.insertBefore(node, this.placeholder);
		}, this);
	},

	_mount: function() {
		this.autorun("render", function(comp) {
			var val, cont, self = this;

			// compute html value
			val = this.compute();
			val = val != null ? val.toString() : "";
			
			// dirty check the value
			if (val !== this.value) {
				this.value = val;
				
				// convert html into DOM nodes
				div = document.createElement("div");
				div.innerHTML = val;
				this.nodes = _.toArray(div.childNodes);
			}

			// refresh the nodes in the DOM
			this.refreshNodes();

			comp.onInvalidate(function() {
				self.cleanNodes();
			});
		});
	},

	_detach: function() {
		this.stopComputation("render");
		this.nodes = [];
		delete this.value;
		var parent = this.placeholder.parentNode;
		if (parent != null) parent.removeChild(this.placeholder);
	},

	_appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.refreshNodes();
	},

	toString: function() {
		return this.value;
	},

	find: function(selector) {
		var k, node, queryResult;

		for (k in this.nodes) {
			node = this.nodes[k];
			if (util.matchSelector(node, selector)) return node;
			if (_.isFunction(node.querySelector)) {
				if (queryResult = node.querySelector(selector)) return queryResult;
			}
		}

		return null;
	},

	findAll: function(selector) {
		var k, node, queryResult,
			matches = [];

		for (k in this.nodes) {
			node = this.nodes[k];
			
			if (util.matchSelector(node, selector)) {
				matches.push(node);
			}
			
			if (_.isFunction(node.querySelector)) {
				queryResult = _.toArray(node.querySelector(selector));
				if (queryResult.length) matches = matches.concat(queryResult);
			}
		}

		return matches;
	}
});