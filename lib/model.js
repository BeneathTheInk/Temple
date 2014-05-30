var _ = require("underscore"),
	util = require("./util"),
	EventEmitter = require("events").EventEmitter,
	handlers = require("./handlers");

var Model =
module.exports = util.subclass.call(EventEmitter, {

	constructor: function(value) {
		EventEmitter.call(this);
		this.setMaxListeners(0);
		
		this._hidden = {};
		this._handlers = [];
		this.children = {};
		
		this.set([], value);
	},

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

	// adds a handler to use on any future model values
	// secondary usage is to execute a handler method with arguments
	handle: function(handler) {
		if (_.isObject(handler)) {
			handler = _.extend({}, defaultHandler, handler);
			this._handlers.unshift(handler);
			return this;
		}

		else if (_.isString(handler)) {
			var handle = this.__handle__;

			// create if doesn't exist
			if (handler == "construct" || !_.isFunction(handle) || handle.value !== this.value) {
				handle = Model.createHandle(this, this.value);
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
		val = this.handle("get", path);
		child = new (this.constructor)(val);
		
		child.parent = parent;
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
		
			parent.emit("change", _.defaults({
				keypath: [ path ].concat(summary.keypath)
			}, summary), options);
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
	get: function(parts) {
		parts = util.splitPath(parts);

		// get the value at the path
		var val = this.getModel(parts).value;

		// check hidden values
		if (_.isUndefined(val) && parts.length) {
			val = util.get(this._hidden, parts);
		}

		return val;
	},

	// the own properties of the model's value
	keys: function() { return this.handle("keys"); },

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
					this.notify([], this.value, oval, options);
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
	notify: function(path, nval, oval, options) {
		var silent, summary, child, childOptions, nval;

		// notify only works on the model at path
		if (!_.isArray(path) || path.length) {
			return this.getModel(path).notify([], nval, oval, options);
		}

		options = options || {};
		childOptions = _.extend({ reset: true }, options, { bubble: false });
		summary = {
			model: this,
			type: util.changeType(nval, oval),
			keypath: [],
			value: nval,
			oldValue: oval
		};

		// reset all the children values
		_.each(this.children, function(c, p) {
			c.set([], this.handle("get", p), childOptions);
		}, this);

		// announce the change
		this.emit("change", summary, options);

		return summary;
	},

	// set a hidden value
	setHidden: function(path, value) {
		if (_.isUndefined(value)) delete this._hidden[path];
		else this._hidden[path] = value;
		return this;
	}

}, {

	extend: util.subclass,
	_defaultHandlers: require("./handlers"),

	isModel: function(obj) {
		return obj instanceof Model;
	},

	// creates a focused handle function from model and value
	createHandle: function(model, val) {
		var handler = model._handler(val);

		return function(m) {
			var args = _.toArray(arguments).slice(1);
			args.unshift(val);
			return handler[m].apply(model, args);
		}
	}

});