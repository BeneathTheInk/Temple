var Temple = require("./temple"),
	_ = require("underscore"),
	util = require("./util"),
	Deps = require("./deps"),
	EventEmitter = require("events").EventEmitter,
	Adaptor = require("./adaptor");

var Scope =
module.exports = util.subclass.call(EventEmitter, {

	constructor: function(value) {
		EventEmitter.call(this);
		this.setMaxListeners(0);
		
		this.hidden = {};
		this._deps = {};
		this._fallbacks = [];
		this._observers = [];
		this._adaptors = [ Adaptor.Array, Adaptor.Object ];
		
		// set initial value
		this.value = this._set(void 0, {});
		this.set("", _.result(this, "defaults"));
		if (value != null) this.set("", value);

		this.initialize();
	},

	// For subclasses
	initialize: function(){},

	// default value
	defaults: {},

	// creates a child scope from a value at path
	spawn: function(parts) {
		var parts = util.splitPath(parts),
			val = this._find(parts),
			child = new Scope(val),
			self = this,
			setting = false,
			destroyChild;

		child.parent = this;
		child.fallback(this);

		// enable two way data binding
		this.observe(util.joinPath(parts, "**"), onLocalChange, { transparent: false });
		child.on("change", onChildChange);

		// clean up
		destroyChild = child.destroy.bind(child);
		this.on("destroy", destroyChild);
		child.once("destroy", function() {
			if (child.parent === self) delete child.parent;
			child.removeFallback(self);
			child.removeListener("change", onChildChange);
			self.stopObserving(null, onLocalChange);
			self.removeListener("destroy", destroyChild);
		});

		return child;

		function onLocalChange(nval, oval, keypath) {
			var base, keys, oneLevel, isParentSame;

			if (setting) return;
			setting = true;
						
			// make the path relative
			keypath = util.splitPath(keypath);
			base = keypath.slice(0, parts.length);
			keys = keypath.slice(parts.length);

			// check to see if one level up has an identical value
			oneLevel = _.initial(keys);
			isParentSame = child.get(oneLevel) === self.get(base.concat(oneLevel))

			// either make the change or announce it
			if (!isParentSame) child.set(keys, nval);
			else child.emit("change", keys, nval, oval);

			setting = false;
		}

		function onChildChange(keys, nval, oval) {
			if (setting) return;
			setting = true;
			self.emit("change", parts.concat(keys), nval, oval);
			setting = false;
		}
	},

	// passed in scope will be searched when value isn't
	// found locally.
	fallback: function(scope) {
		if (!(scope instanceof Scope)) throw new Error("Expecting scope.");
		if (this._fallbacks.indexOf(scope) < 0) this._fallbacks.push(scope);
		return this;
	},

	// removes a previously added fallback scope
	removeFallback: function(scope) {
		var index = this._fallbacks.indexOf(scope);
		if (index > -1) this._fallbacks.splice(index, 1);
		return this;
	},

	// "destroys" the scope which is basically just a state
	destroy: function() {
		if (this.destroyed) return;
		this.destroyed = true;
		this.stopObserving();
		this.emit("destroy");
		return this;
	},

	// adds adaptor classes to this scope
	adapt: function() {
		_.flatten(_.toArray(arguments)).filter(function(adaptor) {
			return Adaptor.isAdaptor(adaptor.prototype);
		}).forEach(function(adaptor) {
			this._adaptors.unshift(adaptor);
		}, this);
		
		return this;
	},

	// takes value at path and turns it into an adaptor instance
	_adapt: function(val, keys) {
		var AdaptorClass = _.find(this._adaptors, function(a) { return a.match(val); });
		if (AdaptorClass == null) return val;

		keys = _.isArray(keys) ? _.clone(keys) : [];

		var adaptor = new AdaptorClass(val),
			self = this,
			onChange, onDestroy, virtual;

		virtual = adaptor.__virtual__ = {};
		
		adaptor.on("change", onChange = function(path, nval, oval) {
			// check if old value was available virtually
			if (virtual[path] != null) oval = virtual[path];
			
			// resolve the new value
			nval = self._set(void 0, nval);
			if (Adaptor.isAdaptor(nval)) virtual[path] = nval;

			// kill the previous adaptor
			if (Adaptor.isAdaptor(oval) && oval !== nval) {
				oval.destroy();
				oval.emit("destroy");
			}

			// emit as a change
			self.emit("change", keys.concat(path.toString()), nval, oval);
		});

		adaptor.once("destroy", function() {
			adaptor.removeListener("change", onChange);
		});

		// go deep, man
		adaptor.keys().forEach(function(key) {
			var nval = this._set(void 0, adaptor.get(key), null, keys.concat(key));
			if (Adaptor.isAdaptor(nval)) virtual[key] = nval;
		}, this);

		return adaptor;
	},

	// returns the value at path, processes the results
	// as would be expected from a mustache tag
	get: function(parts) {
		var val, scopes, scope;
		parts = util.splitPath(parts);

		// don't traverse parents if specified
		if (parts[0] === "this") {
			val = this._find(parts.slice(1));
		} else {
			scopes = [ this ];

			while (scopes.length) {
				scope = scopes.shift();
				val = scope._find(parts);
				if (val != null) break;
				scopes = scopes.concat(scope._fallbacks);
			}
		}

		if (Adaptor.isAdaptor(val)) val = val.value;
		if (typeof val === "function") val = val.call(this, this);

		return val;
	},

	// locally searches for the value at path and depends on the path
	_find: function(parts) {
		var val = util.get(this.value, parts);
		if (val == null) val = util.get(this.hidden, parts);
		if (Deps.active) this.depend(parts); // always depend
		return val;
	},

	// registers a dependency at path and observes changes
	depend: function(path) {
		path = util.joinPath(path);
		var dep = this._deps[path];

		// create if doesn't exist
		if (dep == null) {
			dep = this._deps[path] = new Deps.Dependency;
			dep._observer = this.observe(path, function() { dep.changed(); });
		}

		dep.depend();
		return this;
	},

	set: function(parts, value) {
		var self = this,
			baseparts = [],
			base = this.value,
			lastval, val, part, mixin, changes;

		// accept set(value) syntax
		if (_.isObject(parts) && !_.isArray(parts) && value == null) {
			value = parts;
			parts = [];
		} else {
			parts = util.splitPath(parts);
		}

		// create a deep object from the keypath
		if (!parts.length) mixin = value;
		else {
			mixin = {};
			_.reduce(parts, function(obj, part, i) {
				return obj[part] = i === parts.length - 1 ? value : {};
			}, mixin);
		}

		// deep set the value
		this.value = this._set(this.value, mixin, changes = []);
		
		changes.forEach(function(args) {
			this.emit.apply(this, ["change"].concat(args));
		}, this);

		return this;
	},

	// sets value at path to undefined
	unset: function(path) {
		return this.set(path, void 0);
	},

	_set: function(base, mixin, changes, keys) {
		if (base === mixin) return base;
		if (changes == null) changes = [];
		if (keys == null) keys = [];

		// if mixin is an adaptor, reduce to value
		if (Adaptor.isAdaptor(mixin)) mixin = mixin.value;

		// if base is an adaptor, try to merge
		if (Adaptor.isAdaptor(base)) {
			var setter = _.bind(function(key, val) {
				var oval = base.__virtual__[key] ? base.__virtual__[key] : base.get(key),
					nval = this._set(oval, val, changes, keys.concat(key));

				// set the value
				if (Adaptor.isAdaptor(nval)) {
					base.set(key, nval.value);
					base.__virtual__[key] = nval;
				} else {
					base.set(key, nval);
					delete base.__virtual__[key];
				}

				// kill the previous adaptor
				if (Adaptor.isAdaptor(oval) && oval !== nval) {
					oval.destroy();
					oval.emit("destroy");
				}
			}, this);

			// unsuccessful merge must be overwritten
			if (base.merge(mixin, setter) === false) {
				// "clone" adaptor and replace mixin
				mixin = this._adapt(mixin, keys);
				
				// "destroy" the base adaptor
				base.destroy();
				base.emit("destroy");
				
				// save the changes
				changes.push([ keys, mixin, base ]);
				base = mixin;
			}
		}

		// otherwise we just overwrite
		else {
			mixin = this._adapt(mixin, keys);
					
			// save the changes
			changes.push([ keys, mixin, base ]);
			base = mixin;
		}

		return base;
	},

	observe: function(path, fn, options) {
		if (!_.isFunction(fn)) throw new Error("Expecting a function to call on change.");

		var matchParts = util.parsePath(path),
			self = this;

		options = _.defaults(options || {}, {
			transparent: true // returns value at adaptor
		});

		// remember the observer so we can kill it later
		this._observers.push({
			parts: matchParts,
			fn: fn,
			onChange: onChange
		});

		this.on("change", onChange);
		return this;

		function onChange(keys, newval, oldval) {
			var parts, part, base, paths, ranAt, i;

			// clone parts so we don't affect the original
			parts = matchParts.slice(0);

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
			ranAt = {};
			base = util.joinPath(keys);

			// generate a list of effected paths
			util.findAllMatchingPaths(newval, parts, paths);
			util.findAllMatchingPaths(oldval, parts, paths);
			paths = util.findShallowestUniquePaths(paths);

			// fire the callback on each path that changed
			paths.forEach(function(keys, index, list) {
				var path = util.joinPath(base, keys);
				if (ranAt[path]) return;
				ranAt[path] = true;
				
				var nval = util.get(newval, keys),
					oval = util.get(oldval, keys);
				
				if (nval !== oval) {
					if (options.transparent) {
						if (Adaptor.isAdaptor(nval)) nval = nval.value;
						if (Adaptor.isAdaptor(oval)) oval = oval.value;
					}

					fn.call(self, nval, oval, path);
				}
			});
		}
	},

	stopObserving: function(path, fn) {
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
	}

}, {

	// a very lonely method...
	extend: util.subclass

});