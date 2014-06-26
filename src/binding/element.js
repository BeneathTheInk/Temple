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
		
		Binding.apply(this, _.toArray(arguments).slice(1));
	},

	_mount: function() {
		// cleverly wrapped so we can kill all of them at the same time
		this.autorun("attributes", function() {
			_.each(this.attributes, function(value, name) {
				this.autorun(function(comp) {
					var val = value.call(this);
					val = val != null ? val.toString() : "";
					this.node.setAttribute(name, val);
				});
			}, this);
		});

		Binding.prototype._mount.apply(this, arguments);
		Binding.prototype._appendTo.call(this, this.node);
	},

	_detach: function() {
		this.stopComputation("attributes");
		var parent = this.node.parentNode;
		if (parent != null) parent.removeChild(this.node);
		return Binding.prototype._detach.apply(this, arguments);
	},

	_appendTo: function(parent, before) {
		parent.insertBefore(this.node, before);
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

		this.attributes[name] = value;

		return this;
	}
});