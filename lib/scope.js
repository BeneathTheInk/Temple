var Temple = require("./temple"),
	_ = require("underscore"),
	util = require("./util"),
	Deps = require("./deps"),
	EventEmitter = require("events").EventEmitter;

var Scope =
module.exports = util.subclass.call(EventEmitter, {

	constructor: function(val, parent) {
		EventEmitter.call(this);
		
		this.value = val;
		this.parent = null;
		this.closed = false;
		this.hidden = {};
		this._deps = {};
		this._observers = [];

		// bind parent
		if (parent instanceof Scope) {
			this.parent = parent;
			parent.once("close", this.close.bind(this));
		}
	},

	spawn: function(val) {
		return new Scope(val, this);
	},

	close: function() {
		this.closed = true;
		this.parent = null;
		this.stopObserving();
		this.emit("close");
		return this;
	},

	get: function(parts) {
		var ctx, val;
		
		if (_.isString(parts)) parts = util.splitPath(parts);
		if (!_.isArray(parts)) parts = [];

		// don't traverse parents if specified
		if (parts[0] === "this" || parts[0] === "") {
			val = this._find(parts.slice(1));
		} else {
			ctx = this;

			while (ctx != null) {
				val = ctx._find(parts, this);
				if (val != null) break;
				ctx = ctx.parent;
			}
		}

		if (Deps.active) this.depend(parts);
		return val;
	},

	_find: function(parts, ctx) {
		if (_.isString(parts)) parts = util.splitPath(parts);
		if (!_.isArray(parts)) parts = [];
		var val = this._get(this.value, parts, ctx);
		if (val == null) val = this._get(this.hidden, parts, ctx);
		return val;
	},

	_get: function(obj, parts, ctx) {
		parts = !_.isArray(parts) ? [] : parts.slice(0);

		while (parts.length) {
			if (obj == null) return;
			obj = obj[parts.shift()];
		}

		if (typeof obj === "function") {
			if (ctx == null) ctx = this;
			obj = obj.call(ctx, ctx);
		}

		return obj;
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

	set: function(key, val) {
		var mixin = key,
			self = this,
			parts, cur, part, changes;

		if (typeof key === "string") {
			mixin = {};
			parts = util.splitPath(key);
			cur = mixin;

			while (parts.length) {
				part = parts.shift();
				cur = (cur[part] = parts.length === 0 ? val : {});
			}
		}

		this.value = this._set(this.value, mixin, changes = []);
		
		changes.forEach(function(args) {
			this.emit.apply(this, ["change"].concat(args));
		}, this);

		return this;
	},

	_set: function(base, mixin, changes, keys) {
		var oldval, k, _changes;

		if (keys == null) keys = [];

		// generic objects are deep copied onto base
		if (util.isPlainObject(mixin)) {
			if (!util.isPlainObject(base)) {
				oldval = base;
				base = {};
				_changes = changes;
				changes = null;
			}
				
			for (k in mixin) {
				base[k] = this._set(base[k], mixin[k], changes, keys.concat(k));
			}

			if (_.isArray(_changes)) _changes.push([ keys, base, oldval ]);
		} else {
			if (_.isArray(changes)) changes.push([ keys, mixin, base ]);
			base = mixin;
		}

		return base;
	},

	unset: function(parts) {
		var initial, data, oldval, last;

		parts = _.isString(parts) ? util.splitPath(parts) : parts != null ? parts : [];

		if (!parts.length) {
			oldval = this.value;
			delete this.value;
		} else {
			initial = _.initial(parts);
			data = this.value;

			while (initial.length) {
				if (!util.isPlainObject(data)) return this;
				data = data[initial.shift()];
			}

			if (util.isPlainObject(data)) {
				last = _.last(parts);
				oldval = data[last];
				delete data[last];
			}
		}

		if (oldval != null) this.emit("change", parts, void 0, oldval);

		return this;
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
			var parts, part, base, paths;

			// clone parts so we don't affect the original
			parts = matchParts.slice(0);
			
			// traverse through cparts
			// a mismatch means we don't need to be here
			for (var i = 0; i < keys.length; i++) {
				part = parts.shift();
				if (_.isRegExp(part) && part.test(keys[i])) continue;
				if (part === "**") {
					console.log("star star!");
					return;
				}
				if (part !== keys[i]) return;
			}

			paths = [];
			base = util.joinPath(keys);

			// generate a list of effected paths
			generatePaths(newval, parts, paths);
			generatePaths(oldval, parts, paths);
			
			// fire the callback on each path that changed
			_.unique(paths).forEach(function(keys) {
				var nval = self._get(newval, keys),
					oval = self._get(oldval, keys);

				if (nval !== oval) {
					fn.call(self, nval, oval, util.joinPath(base, keys));
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

// recursively search obj of all paths that match parts
function generatePaths(obj, parts, paths, base) {
	if (paths == null) paths = [];
	if (base == null) base = [];

	if (!parts.length) {
		paths.push(base);
		return paths;
	}

	if (obj == null) return paths;

	var part = parts[0],
		rest = parts.slice(1);

	if (_.isRegExp(part)) {
		for (var k in obj) {
			if (part.test(k)) generatePaths(obj[k], rest, paths, base.concat(k));
		}
	} else if (part === "**") {
		console.log("star star!");
	} else {
		generatePaths(obj[part], rest, paths, base.concat(part));
	}

	return paths;
}