var _ = require("underscore"),
	util = require("../util"),
	Binding = require("./index");

module.exports = Binding.extend({
	constructor: function(tagname) {
		if (!_.isString(tagname))
			throw new Error("Expecting string for element binding tag name.");

		this.tagname = tagname;
		this.attributes = {};
		this.node = document.createElement(tagname);
		
		// when children are added, append to element node
		this.on("child:add", function(child) {
			if (this.node.parentNode != null) child.appendTo(this.node);
		});

		this.on("child:remove", function(child) {
			child.detach();
		});

		Binding.apply(this, _.toArray(arguments).slice(1));
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.node, before);
		return Binding.prototype.appendTo.apply(this, arguments);
	},

	detach: function() {
		var parent = this.node.parentNode;
		if (parent != null) parent.removeChild(this.node);
		return Binding.prototype.detach.apply(this, arguments);
	},

	toString: function() {
		return this.node.outerHTML;
	},

	find: function(selector) {
		if (util.matchSelector(this.node, selector)) return this.node;
		return Binding.prototype.find.apply(this, arguments);
	},

	findAll: function(selector) {
		var els = [];
		if (util.matchSelector(this.node, selector)) els.push(this.node);
		els = els.concat(Binding.prototype.findAll.apply(this, arguments));
		return els;
	},

	attr: function(name, value) {
		if (_.isObject(name) && value == null) {
			_.each(name, function(v, n) { this.attr(n, v); }, this);
			return this;
		}

		if (_.isString(value)) {
			var str = value;
			value = function() { return str; };
		}

		if (!_.isFunction(value)) throw new Error("Expecting string or function for attribute value");
		if (!_.isString(name)) throw new Error("Expecting string for attribute name");

		this.autorun("__attr_" + name, function() {
			var val = value.call(this);
			val = val != null ? val.toString() : "";
			this.node.setAttribute(name, val);
		});

		return this;
	}
});