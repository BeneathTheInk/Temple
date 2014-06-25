var _ = require("underscore"),
	util = require("../util"),
	Events = require("../events"),
	Deps = require("../deps");

function Binding() {
	this.children = [];
	this._comps = {};

	var args = _.toArray(arguments);
	if (args.length) this.addChild(args);
}

module.exports = Binding;
Binding.extend = util.subclass;
Binding.isBinding = function(o) {
	return o instanceof Binding;
}

_.extend(Binding.prototype, Events, {
	addChild: function(child) {
		if (_.isArray(child)) {
			child.forEach(this.addChild, this);
			return this;
		}

		if (!Binding.isBinding(child))
			throw new Error("Expected array or instance of Binding for children.");

		// ensure the binding is not already a child
		if (~this.children.indexOf(child)) return this;

		// remove from existing parent
		if (child.parent != null) child.parent.removeChild(child);

		this.children.push(child);
		child.parent = this;

		this.trigger("child:add", child);
		child.trigger("parent:add", this);

		if (this.isMounted()) child.mount();
		return this;
	},

	removeChild: function(child) {
		if (_.isArray(child)) {
			child.forEach(this.removeChild, this);
			return this;
		}

		var index = this.children.indexOf(child);
		
		if (~index) {
			if (child.isMounted()) child.detach();

			this.children.splice(index, 1);
			if (child.parent === this) delete child.parent;
			this.stopListening(child);
			
			child.trigger("parent:remove", this);
			this.trigger("child:remove", child);
		}

		return this;
	},

	// runs fn when deps change
	autorun: function(name, fn) {
		if (_.isFunction(name) && fn == null) {
			fn = name;
			name = _.uniqueId("f");
		}

		if (!_.isString(name)) throw new Error("Expecting string for computation identifier.");
		if (!_.isFunction(fn)) throw new Error("Expecting function for computation.");

		this.stopComputation(name);
		var self = this;

		return this._comps[name] = Deps.autorun(function(comp) {
			fn.call(self, comp);
			
			comp.onInvalidate(function() {
				if (comp.stopped && self._comps[name] === comp) {
					delete self._comps[name];
				}
			});
		});
	},

	stopComputation: function(name) {
		if (name == null) {
			_.each(this._comps, function(c) {
				c.stop();
			});

			this._comps = {};
		}

		else if (this._comps[name] != null) {
			this._comps[name].stop();
		}

		return this;
	},

	_mount: function() {
		_.invoke(this.children, "mount");
	},

	mount: function() {
		if (this.isMounted()) return this;
		this._mounted = true;

		this._mount.apply(this, arguments);
		this.trigger("mount");

		return this;
	},

	isMounted: function() {
		return this._mounted || false;
	},

	_detach: function() {
		_.invoke(this.children, "detach");
	},

	detach: function() {
		if (!this.isMounted()) return this;
		this._detach.apply(this, arguments);
		delete this._mounted;
		this.trigger("detach");
		return this;
	},

	_appendTo: function(parent, before) {
		this.children.forEach(function(child) {
			child.appendTo(parent, before);
		});
	},

	appendTo: function(parent, before) {
		if (!this.isMounted()) return this;
		var self = this;

		Deps.nonreactive(function() {
			self._appendTo(parent, before);
			self.trigger("append", parent, before);
		});
		
		return this;
	},

	paint: function(parent, beforeNode) {
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		if (parent == null) parent = document.createDocumentFragment();
		
		this.mount();
		this.appendTo(parent, beforeNode);
		
		return this;
	},

	find: function(selector) {
		var el = null;
		
		this.children.some(function(child) {
			return !!(el = child.find(selector));
		});

		return el;
	},

	findAll: function(selector) {
		var els = []

		this.children.forEach(function(child) {
			els = els.concat(child.findAll(selector));
		});

		return els;
	},

	toString: function() {
		return this.children.map(function(child) {
			return child.toString();
		}).join("");
	},

	toHTML: function() { return this.toString(); }
});

// Load the bindings
Binding.React = require("./react");
Binding.Scope = require("./scope");
Binding.ReactScope = require("./reactscope");
Binding.Text = require("./text");
Binding.HTML = require("./html");
Binding.Element = require("./element");
Binding.Each = require("./each");