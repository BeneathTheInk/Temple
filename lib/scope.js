var _ = require("underscore"),
	util = require("./util"),
	Deps = require("./deps"),
	EventEmitter = require("events").EventEmitter,
	handlers = require("./handlers");

var Scope =
module.exports = util.subclass.call(EventEmitter, {

	constructor: function(value) {
		EventEmitter.call(this);
		this.setMaxListeners(0);
		
		this.hidden = {};
		this._deps = {};
		this._fallbacks = [];
		this._observers = [];
		this._handlers = [];
		this.children = {};
		
		// set initial value
		var def = _.result(this, "defaults");
		if (def != null) this.set([], _.clone(def));
		if (value != null) this.set([], value);
		
		this.initialize();
	},

	// For subclasses
	initialize: function(){},

	// creates scope with matching value, fallbacks and handlers
	fork: function() {
		var fork = new Scope(this.value);
		fork._handlers = _.clone(this._handlers);
		fork._fallbacks = _.clone(this._fallbacks);
		return fork;
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

	// adds a handler to use on any future scope values
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
				handle = util.createHandle(this, this.value);
				handle.value = this.value;
				this.__handle__ = handle;
			}

			return handle.apply(null, _.toArray(arguments));
		}
	},

	// passed in scope will be searched when value isn't found locally
	fallback: function(scope) {
		if (!Scope.isScope(scope)) throw new Error("Expecting scope.");
		if (this._fallbacks.indexOf(scope) < 0) this._fallbacks.push(scope);
		return this;
	},

	// removes a previously added fallback scope
	removeFallback: function(scope) {
		var index = this._fallbacks.indexOf(scope);
		if (index > -1) this._fallbacks.splice(index, 1);
		return this;
	},

	// creates/caches/retrieves a child scope from a value at local path
	_spawn: function(path, val) {
		if (!_.isString(path)) throw new Error("Expecting path to be a string.");
		if (this.children[path] != null) return this.children[path];

		var child, self = this;
		this.children[path] = child = new Scope(val);
		
		child.parent = this;
		child.on("change", onChange);
		
		return child;

		function onChange(c) {
			switch(c.type) {
				case "reset":
					self.set(path, c.value, { reset: true });
					break;

				case "update":
				case "add":
				case "delete":
					c = _.clone(c);
					c.keypath = [ path ].concat(c.keypath);
					self.emit("change", c);
					break;
			}
		}
	},

	// returns the scope at path, deeply
	getScope: function(parts) {
		parts = util.splitPath(parts);
		if (!parts.length) return this;

		var path = parts[0],
			val = this.handle("get", path),
			child = this._spawn(path, val);

		return child.getScope(_.rest(parts));
	},

	// return the value of the scope at path, deeply
	get: function(parts) {
		var val, stayLocal = false;
		parts = util.splitPath(parts);

		if (parts[0] === "this") {
			stayLocal = true;
			parts = parts.slice(1);
		}

		// get the local value
		val = this.getScope(parts).value;

		// next check hidden values
		if (_.isUndefined(val) && parts.length) val = util.get(this.hidden, parts);

		// lastly check fallbacks for value
		if (_.isUndefined(val) && !stayLocal) {
			this._fallbacks.some(function(s) {
				return !_.isUndefined(val = s.get(parts));
			});
		}

		// execute function values
		if (_.isFunction(val)) val = val.call(this);

		// always depend
		if (Deps.active) this.depend(parts);
		
		return val;
	},

	// reruns fn anytime dependencies change
	autorun: function(fn) {
		return Deps.autorun(fn.bind(this));
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

	// sets a value at path, deeply
	set: function(parts, value, options) {
		// accept .set(value)
		if (value == null && parts != null && !_.isArray(parts) && !_.isString(parts)) {
			value = parts;
			parts = [];
		}

		parts = util.splitPath(parts);
		options = options || {};

		var remove = options.remove,
			reset = options.reset;
		
		// no path is a merge or reset
		if (!parts.length) {
			
			var oval = this.value;

			// try merge or reset
			if (reset || this.handle("merge", value) === false) {
				
				this.handle("destroy");
				this.value = remove ? void 0 : value;
				this.handle("construct");

				this.notify([], this.value, oval, options);

			}

		// single path is a basic set
		} else if (parts.length === 1) {
			
			var path = parts[0],
				oval = this.handle("get", path),
				nval;

			// try to merge value with the child scope
			if (remove || reset || this.getScope(path).handle("merge", value) === false) {
				
				// delete property if specified
				if (remove) this.handle("deleteProperty", path);

				// or we try a basic set
				if (remove || this.handle("set", path, value) !== false) {
					
					nval = this.handle("get", path);
					this.notify(path, nval, oval, options);

				}

				// and when all else fails, we reset the current scope value to a basic object
				else {
					(nval = {})[path] = value;
					this.set([], nval);
				}
			}

		// otherwise recurse to the correct scope and try again
		} else {
			this.getScope(_.initial(parts)).set(_.last(parts), value, options);
		}

		return this;
	},

	// let's the scope and its children know that something changed
	notify: function(parts, nval, oval, options) {
		parts = util.splitPath(parts);

		if (parts.length > 1) {
			return this.getScope(_.initial(parts)).notify(_.last(parts), nval, oval, options);
		}

		var silent, summary, child, childOptions;
		options = options || {};
		silent = options.silent;
		childOptions = _.extend({ reset: true }, options, { silent: true });

		summary = {
			scope: this,
			value: nval,
			oldValue: oval
		};

		if (!parts.length) {
			_.each(this.children, function(c, p) {
				c.set([], this.handle("get", p), childOptions);
			}, this);

			summary.type = "reset";
		}

		else {
			// check if the child scope already has the value to save some time
			child = this.getScope(parts[0]);
			if (child.value !== nval) child.set([], nval, childOptions);

			summary.type = util.changeType(nval, oval);
			summary.keypath = parts;
		}

		if (nval !== oval && !silent) this.emit("change", summary);

		return summary;
	},

	// removes the value at path
	unset: function(path, options) {
		return this.set(path || [], true, _.extend({ remove: true }, options));
	},

	// enumeration
	forEach: function(fn, ctx) {
		this.handle("enumerate", fn, ctx != null ? ctx : this);
		return this;
	},

	// the own properties of the scope's value
	keys: function() { return this.handle("keys"); },
	
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
			var keys, newval, oldval, scope,
				getter, parts, part, base, paths, i;

			// clone parts so we don't affect the original
			parts = matchParts.slice(0);
			keys = _.isArray(chg.keypath) ? chg.keypath : [];
			newval = chg.value;
			oldval = chg.oldValue;
			scope = chg.scope;

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
			this._findAllMatchingPaths(scope, newval, parts, paths);
			this._findAllMatchingPaths(scope, oldval, parts, paths);
			paths = util.findShallowestUniquePaths(paths);

			// getter for retrieving values at path
			getter = function(obj, path) {
				return util.createHandle(scope, obj)("get", path);
			}
			
			// fire the callback on each path that changed
			paths.forEach(function(keys, index, list) {
				var path = util.joinPathParts(base, keys),
					nval = util.get(newval, keys, getter),
					oval = util.get(oldval, keys, getter);

				if (nval !== oval) fn.call(self, {
					scope: self,
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
				if (!removeAll) indexes.push(index);
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
	_findAllMatchingPaths: function(scope, value, parts, paths, base) {
		if (paths == null) paths = [];
		if (base == null) base = [];

		if (!parts.length) {
			paths.push(base);
			return paths;
		}

		var handle = util.createHandle(scope, value),
			part = parts[0],
			rest = parts.slice(1),
			isEdge = true;

		if (_.isRegExp(part)) {
			handle("enumerate", function(v, k) {
				this._findAllMatchingPaths(scope, v, rest, paths, base.concat(k));
			}, this);
		} else if (part === "**") {
			handle("enumerate", function(v, k) {
				isEdge = false;

				var _rest = rest,
					_base = base;

				// look ahead
				if (rest[0] == null || rest[0] !== k) {
					_rest = [part].concat(rest);
					_base = base.concat(k);
				}

				this._findAllMatchingPaths(scope, v, _rest, paths, _base);
			}, this);

			// edges are scopes that don't enumerate
			if (isEdge && !rest.length) paths.push(base);
		} else {
			this._findAllMatchingPaths(scope, handle("get", part), rest, paths, base.concat(part));
		}

		return paths;
	}

}, {

	extend: util.subclass,

	isScope: function(obj) {
		return obj instanceof Scope;
	}

});