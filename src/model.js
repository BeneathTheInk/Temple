var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util"),
	Proxy = require("./proxy"),
	Observe = require("./observe");

var Model =
module.exports = function Model(data) {
	this._proxies = [];
	this.children = {};
	this.set([], data);
}

Model.extend = Temple.util.subclass;
Model._defaultProxies = [ Proxy.Array, Proxy.Object ];

Model.isModel = function(obj) {
	return obj instanceof Model;
}

_.extend(Model.prototype, Temple.Events, Observe, {
	// returns the correct proxy function based on a value
	getProxyByValue: function(val) {
		var proxy;

		// first look through local
		proxy = _.find(this._proxies, function(p) {
			return p.match(val);
		});

		// then try up the tree
		if (proxy == null && this.parent != null) {
			proxy = this.parent.getProxyByValue(val);
		}

		// lastly match global defaults
		if (proxy == null) {
			proxy = _.find(Model._defaultProxies, function(p) {
				return p.match(val);
			});
		}

		return proxy || Proxy;
	},

	getAllProxies: function() {
		var proxies = this._proxies.slice(0);
		if (this.parent != null) proxies.push.apply(proxies, this.parent.getAllProxies());
		return proxies;
	},

	registerProxy: function(proxy) {
		if (!util.isSubClass(Proxy, proxy))
			throw new Error("Expecting function for Proxy.");

		if (!_.isFunction(proxy.match))
			throw new Error("Proxy is missing required 'match()' method.");

		// push the proxy to the front
		this._proxies.unshift(proxy);

		// we have to tell all the models in the tree that
		// a new proxy was added otherwise models will
		// continue to use old proxies
		var models = [ this ], model;

		while (models.length) {
			model = models.shift();
			model._refreshLocalProxy();
			models.push.apply(models, _.values(model.children));
		}

		return this;
	},

	proxy: function(key) {
		if (this._proxy == null) this._refreshLocalProxy();

		var args = _.toArray(arguments).slice(1),
			method = this._proxy[key];

		return !_.isFunction(method) ? method : method.apply(this._proxy, args);
	},

	_clearLocalProxy: function() {
		if (this._proxy != null) {
			this.proxy("destroy");
			delete this._proxy;
		}

		return this;
	},

	_refreshLocalProxy: function() {
		this._clearLocalProxy();
		this._proxy = new (this.getProxyByValue(this.value))(this.value, this);
		return this;
	},

	// forcefully cleans up all proxies in the tree
	// proxies are a known source of memory leakage, so this method
	// is to make sure models are properly GC'd.
	cleanProxyTree: function() {
		var models = [ this ], model;

		while (models.length) {
			model = models.shift();
			model._clearLocalProxy();
			models.push.apply(models, _.values(model.children));
		}

		return this;
	},

	// creates a child model from a value at local path
	_spawn: function(path) {
		if (!_.isString(path)) throw new Error("Expecting path to be a string.");

		var child, parent, val;
		parent = this;

		this.children[path] = child = new (this.constructor)();
		child.parent = parent;
		child.set([], this.proxy("get", path));
		child.on("change", onChange);
		child.notify([], void 0, { initial: true });

		return child;

		function onChange(summary, options) {
			if (options.bubble === false) return;

			if (!summary.keypath.length) {
				// reset value to generic object if parent is a leaf node
				if (parent.proxy("isLeaf")) {
					if (!options.remove) {
						var reset = {};
						reset[path] = summary.value;
						parent.set([], reset, _.defaults({ reset: true }, options));
					}

					return;
				}

				// otherwise do a local set at the path
				else {
					if (options.remove) parent.proxy("unset", path);
					else parent.proxy("set", path, summary.value);
				}
			}

			// bubble the event
			parent._onChange(_.extend({}, summary, {
				keypath: [ path ].concat(summary.keypath)
			}), options, parent);
		}
	},

	// returns the model at path, deeply
	getModel: function(parts) {
		parts = util.path.split(parts);
		if (!parts.length) return this;

		var path = parts[0],
			rest = parts.slice(1),
			model;

		if (this.children[path] != null) model = this.children[path];
		else model = this._spawn(path);

		return model.getModel(rest);
	},

	// return the value of the model at path, deeply
	get: function(path, options) {
		options = options || {};
		if (options.depend !== false) this.depend(path);
		return this.getModel(path, options).value;
	},

	// value at property isn't undefined
	has: function(path, options) {
		return !_.isUndefined(this.get(path, options));
	},

	// the own properties of the model's value
	keys: function(parts) {
		parts = util.path.split(parts);
		if (parts.length) return this.getModel(parts).keys();
		return this.proxy("keys");
	},

	// sets a value at path, deeply
	set: function(parts, value, options) {
		// accept .set(value)
		if (value == null && parts != null && !_.isArray(parts) && !_.isString(parts)) {
			value = parts;
			parts = [];
		}

		parts = util.path.split(parts);
		options = options || {};

		// no path is a merge or reset
		if (!parts.length) {
			
			// try merge or reset
			if (options.reset || this.proxy("isLeaf") || this.proxy("merge", value) === false) {

				var oval = this.value;
				this.value = options.remove ? void 0 : value;
				this._refreshLocalProxy();

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

		// lol why are we here?
		if (oval === this.value) return this;

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
			c.set([], this.proxy("get", p), childOptions);
		}, this);

		// announce the change
		this._onChange(summary, options, this);

		return this;
	}
});
