var _ = require("underscore"),
	util = require("../util"),
	Binding = require("./index");

module.exports = Binding.extend({
	constructor: function(value) {
		if (_.isString(value)) {
			var str = value;
			value = function() { return str; }
		}

		if (!_.isFunction(value))
			throw new Error("Expecting string or function for html binding value.");

		this.compute = value;
		this.value = "";
		this.nodes = [];
		this.placeholder = document.createComment(_.uniqueId("$"));
		
		// clean up
		this.once("destroy", function() {
			this.cleanNodes();
			var parent = this.placeholder.parentNode;
			if (parent != null) parent.removeChild(this.placeholder);
		});

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Triple bindings can't have children.");
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

		return this;
	},

	render: function(scope) {
		this.autorun("render", function(comp) {
			var val, cont;

			val = this.compute(scope);
			val = val != null ? val.toString() : "";
			this.value = val;
			
			this.cleanNodes();
			div = document.createElement("div");
			div.innerHTML = val;
			this.nodes = _.toArray(div.childNodes);
			this.refreshNodes();
		});

		return this;
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.refreshNodes();
		return this;
	},

	find: function(selector) {
		var k, node, queryResult;

		for (k in this.nodes) {
			node = this.nodes[k];
			if (util.matchSelector(node, selector)) return node;
			if (queryResult = node.querySelector(selector)) return queryResult;
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
			
			queryResult = _.toArray(node.querySelector(selector));
			if (queryResult.length) matches = matches.concat(queryResult);
		}

		return matches;
	},

	toString: function() {
		return this.value;
	}
});