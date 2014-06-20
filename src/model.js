var _ = require("underscore"),
	util = require("./util"),
	Events = require("./events"),
	handlers = require("./handlers"),
	Observe = require("./observe");

var Model =
module.exports = function Model(data) {
	this._handlers = [];
	this.children = {};
	this.set([], data);
}

Model.extend = util.subclass;
Model._defaultHandlers = handlers;

Model.isModel = function(obj) {
	return obj instanceof Model;
}

_.extend(Model.prototype, Events, Observe, {
	// returns the correct handler based on a value
	_handler: function(val) {
		var handler;

		// first look through local
		handler = _.find(this._handlers, function(h) {
			return h.match(val);
		});

		// then try up the tree
		if (handler == null && this.parent != null) {
			handler = this.parent._handler(val);
		}

		// lastly look through global defaults
		if (handler == null) {
			handler = _.find(Model._defaultHandlers, function(h) {
				return h.match(val);
			});
		}

		return handler != null ? handler : handlers.default;
	},

	// creates a focused handle function from value
	createHandle: function(val) {
		var handler = this._handler(val),
			self = this;

		return function(m) {
			var args = _.toArray(arguments).slice(1),
				method = handler[m];

			return !_.isFunction(method) ? method : method.apply(self, [ val ].concat(args));
		}
	},

	// adds a handler to use on any future model values
	// secondary usage is to execute a handler method with arguments
	// handlers are really inefficient right now.
	handle: function(handler) {
		if (_.isObject(handler)) {
			handler = _.extend({}, handlers.default, handler);
			this._handlers.unshift(handler);

			// we have to tell all the models in the tree that
			// a new handler was added otherwise things will
			// use the old handler
			var m, models = [].concat(this);

			while (models.length) {
				m = models.shift();
				m.handle("destroy");
				m.handle("construct");
				models = models.concat(_.values(m.children));
			}

			return this;
		}

		else if (_.isString(handler)) {
			var handle = this.__handle__;

			// create if doesn't exist
			if (handler == "construct" || !_.isFunction(handle) || handle.value !== this.value) {
				handle = this.createHandle(this.value);
				handle.value = this.value;
				this.__handle__ = handle;
			}

			return handle.apply(null, _.toArray(arguments));
		}
	},

	// creates a child model from a value at local path
	_spawn: function(path) {
		if (!_.isString(path)) throw new Error("Expecting path to be a string.");

		var child, parent, val;
		parent = this;
		
		child = new (this.constructor)();
		child.parent = parent;
		child.set([], this.handle("get", path));
		child.on("change", onChange);
		
		return child;

		function onChange(summary, options) {
			if (options.bubble === false) return;
			
			if (!summary.keypath.length) {
				// reset value to generic object if parent is a leaf node
				if (parent.handle("isLeaf")) {
					if (!options.remove) {
						var reset = {};
						reset[path] = summary.value;
						parent.set([], reset, _.defaults({ reset: true }, options));
					}

					return;
				}

				// otherwise do a local set at the path
				else {
					if (options.remove) parent.handle("deleteProperty", path);
					else parent.handle("set", path, summary.value);
				}
			}
		
			// bubble the event
			parent._onChange(_.extend({}, summary, {
				keypath: [ path ].concat(summary.keypath)
			}), options, this);
		}
	},

	// returns the model at path, deeply
	getModel: function(parts) {
		parts = util.splitPath(parts);
		if (!parts.length) return this;

		var path = parts[0],
			rest = parts.slice(1),
			model;

		if (this.children[path] != null) model = this.children[path];
		else model = this.children[path] = this._spawn(path);

		return model.getModel(rest);
	},

	// return the value of the model at path, deeply
	get: function(path) {
		this.depend(path);
		return this.getModel(path).value;
	},

	// the own properties of the model's value
	keys: function(parts) {
		parts = util.splitPath(parts);
		if (parts.length) return this.getModel(parts).keys();
		return this.handle("keys");
	},

	// sets a value at path, deeply
	set: function(parts, value, options) {
		// accept .set(value)
		if (value == null && parts != null && !_.isArray(parts) && !_.isString(parts)) {
			value = parts;
			parts = [];
		}

		parts = util.splitPath(parts);
		options = options || {};

		// no path is a merge or reset
		if (!parts.length) {

			// try merge or reset
			if (options.reset || this.handle("isLeaf") || this.handle("merge", value) === false) {
				
				var oval = this.value;
				this.handle("destroy");
				this.value = options.remove ? void 0 : value;
				this.handle("construct");

				if (options.notify !== false && (oval !== this.value || options.remove)) {
					this.notify([], oval, options);
				}

			}
		}

		// otherwise recurse to the correct model and try again
		else {
			this.getModel(parts).set([], value, options);
		}

		return this;
	},

	// removes the value at path
	unset: function(path, options) {
		return this.set(path || [], true, _.extend({ remove: true }, options));
	},

	// let's the model and its children know that something changed
	notify: function(path, oval, options) {
		var summary, childOptions;
		options = options || {};

		// notify only works on the model at path
		if (!_.isArray(path) || path.length) {
			return this.getModel(path).notify([], oval, options);
		}

		childOptions = _.extend({ reset: true }, options, { bubble: false });
		summary = {
			model: this,
			keypath: [],
			value: this.value,
			oldValue: oval,
			type: util.changeType(this.value, oval)
		}

		// reset all the children values
		_.each(this.children, function(c, p) {
			c.set([], this.handle("get", p), childOptions);
		}, this);

		// announce the change
		this._onChange(summary, options, this);

		return this;
	}
});