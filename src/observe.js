var _ = require("underscore"),
	Deps = require("./deps"),
	util = require("./util");

module.exports = {
	// registers a dependency at path and observes changes
	depend: function(parts) {
		if (!Deps.active) return this;
		if (this._deps == null) this._deps = {};

		var path = util.joinPathParts(parts),
			dep = this._deps[path];

		// create if doesn't exist
		if (dep == null) {
			dep = this._deps[path] = new Deps.Dependency;
			this.observe(parts, dep._observer = function() { dep.changed(); });
		}

		dep.depend();
		return this;
	},

	// calls fn when path changes
	observe: function(path, fn) {
		if (!_.isFunction(fn)) throw new Error("Expecting a function to call on change.");
		if (this._observers == null) this._observers = [];

		this._observers.push({
			path: path,
			parts: _.isArray(path) ? path : util.parsePath(path),
			fn: fn
		});

		return this;
	},

	stopObserving: function(path, fn) {
		if (this._observers == null) this._observers = [];

		if (path == null && fn == null) {
			this._observers.splice(0, this._observers.length);
			return this;
		}

		if (_.isFunction(path) && fn == null) {
			fn = path;
			path = null;
		}

		this._observers.filter(function(o) {
			return (path == null || path === o.path) && (fn == null || fn === o.fn);
		}).forEach(function(o) {
			var index = this._observers.indexOf(o);
			if (~index) this._observers.splice(index, 1);
		}, this);

		return this;
	},

	// model onChange event
	_onChange: function() {
		var args = _.toArray(arguments);

		// handle all the observers
		if (this._observers != null) {
			this._observers.forEach(function(ob) {
				handleObserver.apply(this, [ob].concat(args));
			}, this);
		}

		// pass up changes
		this.trigger.apply(this, ["change"].concat(args));
	}
}

// handles an observer and a change summary
function handleObserver(ob, chg) {
	var parts, paths, base, getter,
		args = _.toArray(arguments).slice(2),
		ctx = this;

	// clone parts so we don't affect the original
	parts = ob.parts.slice(0);

	// match the beginning of parts
	if (!matchPathStart(chg.keypath, parts)) return;

	paths = [];
	base = util.joinPathParts(chg.keypath);
	getter = function(obj, path) {
		return chg.model.createHandle(obj)("get", path);
	}

	// generate a list of effected paths
	findAllMatchingPaths(chg.model, chg.value, parts, paths);
	findAllMatchingPaths(chg.model, chg.oldValue, parts, paths);
	paths = util.findShallowestUniquePaths(paths);

	// fire the callback on each path that changed
	paths.forEach(function(keys, index, list) {
		var nval, oval, summary;

		nval = util.get(chg.value, keys, getter);
		oval = util.get(chg.oldValue, keys, getter);
		if (nval === oval) return;

		ob.fn.apply(ctx, [{
			model: chg.model.getModel(keys),
			keypath: chg.keypath.concat(keys),
			type: util.changeType(nval, oval),
			value: nval,
			oldValue: oval
		}].concat(args));
	});
}

// matchs the start of a keypath to a list of match parts
// parts is modified to the remaining segments that were not matched
function matchPathStart(keys, parts) {
	var i, part;

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
		if (part !== keys[i]) return false;
	}

	return true;
}

// deeply traverses a value in search of all paths that match parts
function findAllMatchingPaths(model, value, parts, paths, base) {
	if (paths == null) paths = [];
	if (base == null) base = [];

	if (!parts.length) {
		paths.push(base);
		return paths;
	}

	var handle = model.createHandle(value),
		part = parts[0],
		rest = parts.slice(1);

	if (_.isRegExp(part)) {
		handle("keys").forEach(function(k) {
			findAllMatchingPaths(model.getModel(k), handle("get", k), rest, paths, base.concat(k));
		});
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

			findAllMatchingPaths(model.getModel(k), handle("get", k), _rest, paths, _base);
		});
	} else {
		findAllMatchingPaths(model.getModel(part), handle("get", part), rest, paths, base.concat(part));
	}

	return paths;
}