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
			throw new Error("Expecting string or function for text binding value.");

		this.compute = value;
		this.value = "";
		this.node = document.createTextNode("");

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Text bindings can't have children.");
	},

	_mount: function() {
		var args = _.toArray(arguments);

		this.autorun("render", function() {
			var val = this.compute.apply(this, args);
			val = val != null ? val.toString() : "";
			this.node.nodeValue = this.value = val;
		});
	},

	_detach: function() {
		this.stopComputation("render");
		delete this.value;
		var parent = this.node.parentNode;
		if (parent != null) parent.removeChild(this.node);
	},

	_appendTo: function(parent, before) {
		parent.insertBefore(this.node, before);
	},

	toString: function() {
		return this.value;
	},

	find: function(selector) { return null; },
	findAll: function() { return []; }
});