var util = require("./util"),
	Deps = require("./deps"),
	_ = require("underscore"),
	Context = require("./context"),
	Observer = require("./observer");

exports.createContext = function(val) {
	return new Context(_.isUndefined(val) ? this.data : val, null, this);
}

exports.autorun = function(fn) {
	return Temple.Deps.autorun(fn.bind(this));
}

exports.get = function(path) {		
	if (Deps.active) this.depend(path);
	return this._get(this.data, path);
}

exports._get = function(obj, path, ctx) {
	var parts = util.splitPath(path);
	
	while (parts.length) {
		if (obj == null) return;
		obj = obj[parts.shift()];
	}

	if (typeof obj === "function") {
		if (ctx == null) ctx = this.createContext();
		obj = obj.call(ctx.get(), this, ctx);
	}

	return obj;
}

exports.depend = function(path) {
	path = util.joinPath(util.splitPath(path)); // ensure validity
	var dep = this._deps[path];

	// create if doesn't exist
	if (dep == null) {
		dep = this._deps[path] = new Deps.Dependency;
		dep._observer = this.observe(path, function() { dep.changed(); });
	}

	dep.depend();
	return this;
}

exports.set = function(key, val) {
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

	changes = [];
	this.data = this._set(this.data, mixin, changes);
	
	changes.forEach(function(args) { this._handleChange.apply(this, args); }, this);

	this.emit("change");

	return this;
}

exports._set = function(base, mixin, changes, keys) {
	var oldval, k, _changes;

	if (keys == null) keys = [];

	// generic objects are deep copied onto base
	if (util.isGenericObject(mixin)) {
		if (!util.isGenericObject(base)) {
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
}

exports.unset = function(key) {
	var parts = util.splitPath(key),
		initial, data, oldval, last;

	if (!parts.length) {
		oldval = this.data;
		delete this.data;
	} else {
		initial = _.initial(parts);
		data = this.data;

		while (initial.length) {
			if (!util.isGenericObject(data)) return this;
			data = data[initial.shift()];
		}

		if (util.isGenericObject(data)) {
			last = _.last(parts);
			oldval = data[last];
			delete data[last];
		}
	}

	if (oldval != null) this._handleChange(parts, void 0, oldval);

	return this;
}

exports._handleChange = function(keys, newval, oldval) {
	this._observers.forEach(function(o) {
		o.handle(keys, newval, oldval);
	});
	this.emit("change:" + util.joinPath(keys), newval, oldval);
}

exports.observe = function(path, fn) {
	return new Observer(path, fn, this);
}