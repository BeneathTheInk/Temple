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
			throw new Error("Expecting string or function for text binding value.");

		this.compute = value;
		this.value = "";
		this.node = document.createTextNode("");

		Binding.call(this, data);
	},

	addChild: function() {
		throw new Error("Text bindings can't have children.");
	},

	mount: function() {
		this.autorun("render", function() {
			var val = this.compute();
			val = val != null ? val.toString() : "";
			this.node.nodeValue = this.value = val;
		});

		return Binding.prototype.mount.apply(this, arguments);
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.node, before);
		return Binding.prototype.appendTo.apply(this, arguments);
	},

	detach: function() {
		this.stopComputation("render");
		delete this.value;
		var parent = this.node.parentNode;
		if (parent != null) parent.removeChild(this.node);
		return Binding.prototype.detach.apply(this, arguments);
	},

	find: function(selector) { return null; },
	findAll: function() { return []; },

	toString: function() {
		return this.value;
	}
});