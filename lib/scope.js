var Temple = require("./temple"),
	_ = require("underscore"),
	util = require("./util"),
	Deps = require("./deps"),
	EventEmitter = require("events").EventEmitter,
	Adaptor = require("./adaptor");

var Scope =
module.exports = util.subclass.call(EventEmitter, {

	constructor: function(value, parent) {
		EventEmitter.call(this);
		this.setMaxListeners(0);
		
		this.parent = null;
		this.closed = false;
		this.hidden = {};
		this._deps = {};
		this._observers = [];
		this._adaptors = [ Adaptor.Array ];

		// bind parent
		if (parent instanceof Scope) {
			this.parent = parent;
			parent.on("close", this._parentEvent = this.close.bind(this));
		}

		this.value = this._set(void 0, value);
	},

	spawn: function(val, path) {
		var nscope = new Scope(val, this);
		if (path != null) nscope.bubbleChangesAtPath(path, this);
		return nscope;
	},

	bubbleChangesAtPath: function(base, scope) {
		if (!(scope instanceof Scope)) {
			if (this.parent != null) scope = this.parent;
			else throw new Error("Expected instance of Scope to bubble event from.");
		}
		
		var parts = util.splitPath(base),
			self = this;
		
		scope.observe(util.joinPath(base, "**"), onChange);
		scope.on("close", clearObserver);
		this.on("close", clearObserver);

		return this;

		function onChange(nval, oval, keypath) {
			var keys = util.splitPath(keypath);
			
			// something is very wrong if this fails
			if (!util.arrayStartsWith(keys, parts)) return;
			keys = keys.slice(parts.length);

			self.set(keys, nval);
		}

		function clearObserver() {
			scope.stopObserving(null, onChange);
			scope.removeListener("close", clearObserver);
			self.removeListener("close", clearObserver);
		}
	},

	close: function() {
		if (this.closed) return;
		this.closed = true;
		if (this.parent != null && this._parentEvent != null) {
			this.parent.removeListener("close", this._parentEvent);
			delete this._parentEvent;
		}
		this.parent = null;
		this.stopObserving();
		this.emit("close");
		return this;
	},

	adapt: function() {
		_.flatten(_.toArray(arguments)).filter(function(adaptor) {
			return adaptor.prototype instanceof Adaptor;
		}).forEach(function(adaptor) {
			this._adaptors.push(adaptor);
		}, this);
		
		return this;
	},

	get: function(parts) {
		var ctx, val;
		
		if (_.isString(parts)) parts = util.splitPath(parts);
		if (!_.isArray(parts)) parts = [];

		// don't traverse parents if specified
		if (parts[0] === "this" || parts[0] === "") {
			val = this._find(parts.slice(1));
			if (Deps.active) this.depend(parts);
		} else {
			ctx = this;

			while (ctx != null) {
				val = ctx._find(parts);
				if (val != null) break;
				ctx = ctx.parent;
			}

			// always register the dependency on the parent
			if (val != null && Deps.active) ctx.depend(parts);
		}

		if (Adaptor.isAdaptor(val)) val = val.value;
		if (typeof val === "function") val = val.call(this, this);

		return val;
	},

	_find: function(parts) {
		if (_.isString(parts)) parts = util.splitPath(parts);
		if (!_.isArray(parts)) parts = [];
		var val = this._get(this.value, parts);
		if (val == null) val = this._get(this.hidden, parts);
		return val;
	},

	_get: function(obj, parts) {
		if (!_.isArray(parts) || !parts.length || obj == null) return obj;

		var part = parts[0],
			rest = parts.slice(1);

		if (Adaptor.isAdaptor(obj)) {
			if (obj.__virtual__[part] != null) obj = obj.__virtual__[part];
			else obj = obj.get(part);
		} else {
			obj = obj[part];
		}

		return this._get(obj, rest);
	},

	depend: function(path) {
		if (_.isString(path)) path = util.splitPath(path);
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
			mixin, cur, part, changes;

		if (_.isObject(parts) && !_.isArray(parts)) {
			mixin = parts;
		} else {
			if (_.isString(parts)) parts = util.splitPath(parts);
			if (!_.isArray(parts)) parts = [];
			
			if (!parts.length) mixin = value;
			else {
				cur = mixin = {};

				while (parts.length) {
					part = parts.shift();
					cur = (cur[part] = parts.length === 0 ? value : {});
				}
			}
		}

		this.value = this._set(this.value, mixin, changes = []);
		
		changes.forEach(function(args) {
			this.emit.apply(this, ["change"].concat(args));
		}, this);

		return this;
	},

	// sets value at path to undefined instead of deleteing the value
	// keep in mind that parent values will be reset to an object if
	// they aren't mergeable.
	unset: function(path) {
		return this.set(path, void 0);
	},

	_adapt: function(val, keys) {
		var AdaptorClass = _.find(this._adaptors, function(a) { return a.match(val); });
		if (AdaptorClass == null) return val;

		keys = _.isArray(keys) ? _.clone(keys) : [];

		var adaptor = new AdaptorClass(val, this),
			self = this,
			onChange, onDestroy, virtual;

		virtual = adaptor.__virtual__ = {};
		
		adaptor.on("change", onChange = function(path, nval, oval) {
			// check if old value was available virtually
			if (virtual[path] != null) oval = virtual[path];
			
			// resolve the new value
			nval = self._set(void 0, nval);
			if (Adaptor.isAdaptor(nval)) virtual[path] = nval;

			// emit as a change
			self.emit("change", keys.concat(path.toString()), nval, oval);
		});

		adaptor.on("destroy", onDestroy = function() {
			adaptor.removeListener("change", onChange);
			adaptor.removeListener("destroy", onDestroy);
		});

		// go deep, man
		adaptor.enumerate(function(val, key) {
			var nval = this._set(void 0, val);
			if (Adaptor.isAdaptor(nval)) virtual[key] = nval;
		}, this);

		return adaptor;
	},

	_set: function(base, mixin, changes, keys) {
		var adaptor, k, oldval

		if (changes == null) changes = [];
		if (keys == null) keys = [];

		if (util.isPlainObject(mixin)) {
			// obj x obj: straight copy
			if (util.isPlainObject(base)) {
				for (k in mixin) {
					base[k] = this._set(base[k], mixin[k], changes, keys.concat(k));
				}
			}

			// adaptor x obj: copy obj onto adaptor
			else if (Adaptor.isAdaptor(base)) {
				for (k in mixin) {
					var nval = this._set(base.get(k), mixin[k], changes, keys.concat(k));
					base.set(k, mixin[k]);
					if (Adaptor.isAdaptor(nval)) base.__virtual__[k] = nval;
				}
			}

			// other x obj: replace base with obj copy
			else {
				oldval = base;
				base = {};
				for (k in mixin) base[k] = this._set(void 0, mixin[k], null, keys.concat(k));
				changes.push([ keys, base, oldval ]);
			}
		} else {
			// mixin = adaptor: "clone" adaptor and replace mixed
			if (Adaptor.isAdaptor(mixin)) mixin = this._adapt(mixin.value, keys);
			
			// mixin = mixed: try to adapt or just straight set
			else mixin = this._adapt(mixin, keys);

			// base = adaptor: "destroy" the base adaptor
			if (Adaptor.isAdaptor(base)) {
				base.destroy();
				base.emit("destroy");
			}
			
			changes.push([ keys, mixin, base ]);
			base = mixin;
		}

		return base;
	},

	observe: function(path, fn) {
		if (!_.isFunction(fn)) throw new Error("Expecting a function to call on change.");

		var matchParts = _.isArray(path) ? path : util.parsePath(path),
			self = this;

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
				
				var nval = self._get(newval, keys),
					oval = self._get(oldval, keys);
				
				if (nval !== oval) {
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

});