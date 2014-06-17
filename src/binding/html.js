var _ = require("underscore"),
	util = require("../util"),
	Binding = require("./index");

module.exports = Binding.extend({
	constructor: function(value, data) {
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

		Binding.call(this, data);
	},

	appendChild: function() {
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

	render: function() {
		var val, cont;

		// compute html value
		val = this.compute();
		val = val != null ? val.toString() : "";
		
		// dirty check the value
		if (val !== this.value) {
			this.value = val;
			
			// remove existing html nodes
			this.cleanNodes();
			
			// convert html into DOM nodes
			div = document.createElement("div");
			div.innerHTML = val;
			this.nodes = _.toArray(div.childNodes);
		}

		// refresh node positions in DOM
		this.refreshNodes();
	},

	mount: function() {
		this.autorun("render", this.render);
		return Binding.prototype.mount.apply(this, arguments);
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.refreshNodes();
		return Binding.prototype.appendTo.apply(this, arguments);
	},

	detach: function() {
		this.stopComputation("render");
		this.cleanNodes();
		delete this.value;
		var parent = this.placeholder.parentNode;
		if (parent != null) parent.removeChild(this.placeholder);
		return Binding.prototype.detach.apply(this, arguments);
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
	},

	toString: function() {
		return this.value;
	}
});