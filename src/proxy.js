require("observe-js");

var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util");

function Proxy(target) {
	this.target = target;
}

module.exports = Proxy;
Proxy.extend = util.subclass;

Proxy.match = function(target) {
	return false;
}

_.extend(Proxy.prototype, Temple.Events, {
	isLeaf	: function()			{ return true; },
	get		: function(path)		{ },
	set		: function(path, val)	{ return false; },
	keys	: function()			{ return []; },
	unset	: function(path)		{ return false; },
	merge	: function(mixin)		{ return false; },
	destroy	: function()			{ }
});

// Plain object proxy
var ObjectProxy =
Proxy.Object = Proxy.extend({
	constructor: function(target, model) {
		this.target = target;
		this.model = model;

		var observer = this._observer = new ObjectObserver(target);

		observer.open(function(added, removed, changed) {
			_.flatten([ added, changed ].map(_.keys)).forEach(function(key) {
				model.set(key, target[key]);
			});

			Object.keys(removed).forEach(function(key) {
				model.unset(key);
			});
		});
	},
	isLeaf: function() {
		return false;
	},
	get: function(path) {
		return this.target[path];
	},
	set: function(path, val) {
		this.target[path] = val;
		Platform.performMicrotaskCheckpoint();
		return true;
	},
	keys: function() {
		return Object.keys(this.target);
	},
	merge: function(mixin, options) {
		if (!util.isPlainObject(mixin)) return false;
		_.each(mixin, function(v, k) { this.model.set(k, v, options); }, this);
		Platform.performMicrotaskCheckpoint();
		return true;
	},
	unset: function(path) {
		Platform.performMicrotaskCheckpoint();
		delete this.target[path];
	},
	destroy: function() {
		if (this._observer) this._observer.close();
	}
}, {
	match: function(target) {
		return _.isObject(target);
	},
	get: function(target, path) {
		return target[path];
	}
});

var mutatorMethods = [ 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ];

// plain array proxy
var ArrayProxy =
Proxy.Array = ObjectProxy.extend({
	constructor: function(target, model) {
		this.target = target;
		this.model = model;

		// watch for changes to the array
		var observer = this._observer = new ArrayObserver(target);

		observer.open(function(splices) {
			if (!splices.length) return;
			var start = 0, added = 0, removed = 0,
				balance, size, i, nval;

			splices.forEach(function(splice) {
				if (splice.index < start) start = splice.index;
				added += splice.addedCount;
				removed += splice.removed.length;
			});

			balance = added - removed;
			size = (balance > 0 ? added : 0) + (target.length - balance);

			for (i = start; i < start + size; i++) {
				model.set(i.toString(), target[i], {
					remove: i >= target.length
				});
			}

			model.set("length", target.length);
		});

		// if object.observe doesn't exist, we patch the common methods instead
		// this is basically for every browser except Chrome
		if (!Observer.hasObjectObserve) {
			mutatorMethods.forEach(function(m) {
				var orig = target[m];

				Object.defineProperty(target, m, {
					value: function() {
						var r = orig.apply(this, arguments);
						Platform.performMicrotaskCheckpoint();
						return r;
					},
					configurable: true,
					enumerable: false
				});
			});
		}
	},

	isArray: function() { return true; },

	set: function(path, val) {
		// sets on length *should* be ok but we need to notify
		// of any new or removed values. for now, ignored
		if (path === "length") return false;
		this.target[path] = val;
		Platform.performMicrotaskCheckpoint();
		return true;
	},

	unset: function(path) {
		var index = parseInt(path, 10);
		delete this.target[path];

		// make the array smaller if we are deleting the last element
		if (!isNaN(index) && index >= 0 && index === this.target.length - 1) {
			this.target.length = this.target.length - 1;
		}

		Platform.performMicrotaskCheckpoint();
		return true;
	},

	// arrays don't merge with any value
	merge: function() { return false; }
}, {
	match: function(val) {
		return Array.isArray(val);
	}
});

// Temple Mustache model proxy
var ModelProxy =
Proxy.Model = Proxy.extend({
	constructor: function(target, model) {
		this.target = target;
		this.model = model;

		target.observe("**", this._observer = function(s) {
			if (s.type === "delete") model.unset(s.keypath);
			else model.set(s.keypath, s.value, { reset: true });
		});
	},

	isArray: function() { return false; },
	isLeaf: function() { return false; },

	get: function(path) {
		return this.target.get(path);
	},

	set: function(path, val) {
		this.target.set(path, val, { reset: true });
		return true;
	},

	unset: function(path) {
		this.target.unset(path);
		return true;
	},

	merge: function(mixin) {
		if (!util.isPlainObject(mixin)) return false;
		this.target.set([], mixin);
		return true;
	},

	keys: function() {
		return this.target.keys();
	},

	destroy: function() {
		if (this._observer) this.target.stopObserving(this._observer);
	}
}, {
	match: function(val) {
		return val instanceof require("./model") || val instanceof require("./context");
	},

	get: function(target, key) {
		return target.get(key);
	}
});

// Temple Binding proxy
var BindingProxy =
Proxy.Binding = Proxy.extend({}, {
	match: function(val) {
		return val instanceof Temple.Binding;
	}
});