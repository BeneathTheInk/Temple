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
		this.latestScope = null;
		
		// clean up
		this.once("destroy", function() {
			var parent = this.node.parentNode;
			if (parent != null) parent.removeChild(this.node);
		});

		// when children are added, append to element
		this.on("child:add", function(child) {
			child.appendTo(this.node);
		});

		Binding.call(this, _.toArray(arguments).slice(1));
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.node, before);
		return this;
	},

	toString: function() {
		return this.node.outerHTML;
	},

	render: function(scope) {
		_.each(this.attributes, function(run) { run(scope); });
		return Binding.prototype.render.apply(this, arguments);
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

		var self = this;

		this.attributes[name] = _.bind(function(scope) {
			self.autorun("attr-" + name, function() {
				var val = value.call(this, scope);
				val = val != null ? val.toString() : "";
				this.node.setAttribute(name, val);
			});
		}, this);

		return this;
	}
});