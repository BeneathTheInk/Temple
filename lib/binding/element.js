var _ = require("underscore"),
	Binding = require("./index");

module.exports = Binding.extend({
	constructor: function(tagname) {
		if (!_.isString(tagname))
			throw new Error("Expecting string for element binding tag name.");

		this.tagname = tagname;
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
		this.latestScope = scope;
		this.emit("render", scope);
		return Binding.prototype.render.apply(this, arguments);
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

		if (!_.isFunction(value))
			throw new Error("Expecting string or function for attribute value");

		if (!_.isString(name))
			throw new Error("Expecting string for attribute name");

		var comp,
			self = this;

		function run() {
			if (comp != null) comp.stop();
			comp = self.autorun(function() {
				if (this.latestScope == null) return;
				var val = value.call(this, this.latestScope);
				val = val != null ? val.toString() : "";
				this.node.setAttribute(name, val);
			});
		}

		this.on("render", run);
		run();

		return this;
	}
});