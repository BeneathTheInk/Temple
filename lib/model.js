var _ = require("underscore"),
	util = require("./util"),
	Deps = require("./deps"),
	EventEmitter = require("events").EventEmitter,
	handlers = require("./handlers");

var Model =
module.exports = util.subclass.call(EventEmitter, {

	constructor: function(value) {
		EventEmitter.call(this);
		this.setMaxListeners(0);
		
		this.cid = _.uniqueId('c');
		this._hidden = {};
		this._deps = {};
		this._observers = [];
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
			handler = _.find(require("./temple")._defaultHandlers, function(h) {
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
	get: function(parts, options) {
		parts = util.splitPath(parts);
		options = options || {};

		// get the value at the path
		var val = this.getModel(parts).value;

		// check hidden values
		if (options.hidden !== false && _.isUndefined(val) && parts.length) {
			val = util.get(this._hidden, parts);
		}

		// register dependency
		if (options.depend !== false && Deps.active) this.depend(parts);

		return val;
	},

	// registers a dependency at path and observes changes
	depend: function(path) {
		path = util.joinPathParts(path);
		var dep = this._deps[path];

		// create if doesn't exist
		if (dep == null) {
			dep = this._deps[path] = new Deps.Dependency;
			dep._observer = this.observe(path, function() { dep.changed(); });
		}

		dep.depend();
		return this;
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
	},
	
	// calls fn when path changes
	observe: function(path, fn) {
		if (!_.isFunction(fn)) throw new Error("Expecting a function to call on change.");

		var matchParts = util.parsePath(path),
			self = this;

		// remember the observer so we can kill it later
		this._observers.push({
			parts: matchParts,
			fn: fn,
			onChange: onChange
		});

		this.on("change", onChange);
		return this;

		function onChange(chg) {
			var keys, newval, oldval, model,
				getter, parts, part, base, paths, i;

			// clone parts so we don't affect the original
			parts = matchParts.slice(0);
			keys = _.isArray(chg.keypath) ? chg.keypath : [];
			newval = chg.value;
			oldval = chg.oldValue;
			model = chg.model;

			// traverse through cparts
			// a mismatch means we don't need to be here
			for (i = 0; i < keys.length; i++) {
				part = parts.shift();
				if (_.isRegExp(part) && part.test(keys[i])) continue;
				if (part === "**") {
					// look ahead
					if (parts[0] == null || parts[0] !== keys[i + 1]) {
						parts.unshift(part);
					}
					continue;
				}
				if (part !== keys[i]) return;
			}

			paths = [];
			base = util.joinPathParts(keys);

			// generate a list of effected paths
			this._findAllMatchingPaths(model, newval, parts, paths);
			this._findAllMatchingPaths(model, oldval, parts, paths);
			paths = util.findShallowestUniquePaths(paths);

			// getter for retrieving values at path
			getter = function(obj, path) {
				return Model.createHandle(model, obj)("get", path);
			}
			
			// fire the callback on each path that changed
			paths.forEach(function(keys, index, list) {
				var path = util.joinPathParts(base, keys),
					nval = util.get(newval, keys, getter),
					oval = util.get(oldval, keys, getter);

				if (nval !== oval) fn.call(self, {
					model: self,
					path: path,
					type: util.changeType(nval, oval),
					value: nval,
					oldValue: oval
				});
			});
		}
	},

	stopObserving: function(path, fn) {
		if (_.isFunction(path) && fn == null) {
			fn = path;
			path = null;
		}

		var parts = path == null ? null : _.isArray(path) ? path : util.parsePath(path),
			removeAll = parts == null && fn == null,
			indexes = [];

		this._observers.forEach(function(o, index) {
			if ((parts == null || _.isEqual(parts, o.parts)) && (fn == null || fn === o.fn)) {
				this.removeListener("change", o.onChange);
				if (!removeAll) indexes.unshift(index);
			}
		}, this);

		if (removeAll) this._observers = [];
		else {
			indexes.forEach(function(index) {
				this._observers.splice(index, 1);
			}, this);
		}

		return this;
	},

	// deeply traverses a value in search of all paths that match parts
	_findAllMatchingPaths: function(model, value, parts, paths, base) {
		if (paths == null) paths = [];
		if (base == null) base = [];

		if (!parts.length) {
			paths.push(base);
			return paths;
		}

		var handle = Model.createHandle(model, value),
			part = parts[0],
			rest = parts.slice(1);

		if (_.isRegExp(part)) {
			handle("keys").forEach(function(k) {
				this._findAllMatchingPaths(model.getModel(k), handle("get", k), rest, paths, base.concat(k));
			}, this);
		} else if (part === "**") {
			if (handle("isLeaf")) {
				if (!rest.length) paths.push(base);
				return paths;
			}

			handle("keys").forEach(function(k) {
				var _rest = rest,
					_base = base;

				// look ahead
				if (rest[0] == null || rest[0] !== k) {
					_rest = [part].concat(rest);
					_base = base.concat(k);
				}

				this._findAllMatchingPaths(model.getModel(k), handle("get", k), _rest, paths, _base);
			}, this);
		} else {
			this._findAllMatchingPaths(model.getModel(part), handle("get", part), rest, paths, base.concat(part));
		}

		return paths;
	}

}, {

	extend: util.subclass,

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