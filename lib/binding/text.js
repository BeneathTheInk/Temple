var _ = require("underscore"),
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

		// clean up
		this.once("destroy", function() {
			var parent = this.node.parentNode;
			if (parent != null) parent.removeChild(this.node);
		});

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Text bindings can't have children.");
	},

	render: function(scope) {
		if (this._comp != null) this._comp.stop();
		this._comp = this.autorun(function(comp) {
			var val = this.compute(scope);
			val = val != null ? val.toString() : "";
			this.node.nodeValue = this.value = val;
		});

		return this;
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.node, before);
		return Binding.prototype.appendTo.apply(this, arguments);
	},

	toString: function() {
		return this.value;
	}
});