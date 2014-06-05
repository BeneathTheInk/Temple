var _ = require("underscore"),
	util = require("../util"),
	Deps = require("../deps"),
	EventEmitter = require("events").EventEmitter;

var Binding = module.exports =
util.subclass.call(EventEmitter, {
	constructor: function() {
		this.children = [];
		this._comps = {};

		var children = _.toArray(arguments);
		if (children.length) this.addChild(children);
	},

	addChild: function(child) {
		_.flatten(_.toArray(arguments)).forEach(function(child) {
			if (!(child instanceof Binding))
				throw new Error("Can only add instances of Binding as children.");

			if (child.parent != null) {
				if (child.parent !== this) throw new Error("Child binding already has a parent.");
				return this;
			}

			var self, removeChild, destroyChild;

			this.children.push(child);
			self = child.parent = this;

			child.on("destroy", child._parentDestroyEvent = function() {
				self.removeChild(child);
			});

			this.emit("child:add", child);
		}, this);

		return this;
	},

	removeChild: function(child) {
		_.flatten(_.toArray(arguments)).forEach(function(child) {
			var index = this.children.indexOf(child);
			if (~index) {
				this.children.splice(index, 1);
				child.removeListener("destroy", child._parentDestroyEvent);
				this.emit("child:remove", child);
			}
		}, this);

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

	render: function(scope) {
		this.children.slice(0).forEach(function(child) {
			child.render(scope);
		});

		return this;
	},

	appendTo: function(parent, before) {
		this.children.slice(0).forEach(function(child) {
			child.appendTo(parent, before);
		});

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
		return this.children.slice(0).map(function(child) {
			return child.toString();
		}).join("");
	},

	destroy: function() {
		this.children.slice(0).forEach(function(child) {
			child.destroy();
		});

		this.stopComputation();
		this.emit("destroy");
		return this;
	}
}, {
	extend: util.subclass
});

// Load the real bindings
Binding.Text	= require("./text");
Binding.Element	= require("./element");
Binding.HTML	= require("./html");
Binding.Context	= require("./context");
Binding.Each	= require("./each");