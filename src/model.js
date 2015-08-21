var Trackr = require("trackr");
var track = require("trackr-objects");
var _ = require("underscore");
var utils = require("./utils");
var parse = require("./m+xml").parse;

var Model =
module.exports = function Model(data, parent, options) {
	this.proxies = [];
	this._dep = new Trackr.Dependency();
	if (Model.isModel(parent)) this.parent = parent;
	this.set(data, options);
}

Model.isModel = function(o) {
	return o instanceof Model;
}

Model.extend = require("backbone-extend-standalone");

Model._defaultProxies = [ {
	isList:  true,
	match:   function(arr)    { return _.isArray(arr); },
	get:     function(arr, k) { return k === "length" ? this.length(arr) : arr[k]; },
	length:  function(arr)    { var len; return typeof(len = arr.$length) === "number" ? len : arr.length; },
	keys:    function(arr)    { return _.range(this.length(arr)); },
	isEmpty: function(arr)    { return !!this.length(arr); }
}, {
	match: function()     { return true; },
	get:   function(t, k) { if (t != null) return t[k]; }
} ];

Model.callProxyMethod = function(proxy, target, method, args, ctx) {
	var args = _.isArray(args) ? _.clone(args) : [];
	args.unshift(proxy, method, target);
	args.push(ctx);
	return utils.result.apply(null, args);
}

_.extend(Model.prototype, {

	// sets the data on the model
	set: function(data, options) {
		options = options || {};

		if (options.track !== false) {
			data = track(data, options.track);
		}

		this.data = data;
		this._dep.changed();
		return this;
	},

	append: function(model, options) {
		if (Model.isModel(model)) model.parent = this;
		else model = new Model(model, this, options);
		return model;
	},

	// an array of models in the current stack, with the root as the first
	getAllModels: function() {
		var models = [ this ],
			model = this;

		while (model.parent) {
			models.unshift(model = model.parent);
		}

		return models
	},

	// gets the model in the stack at the index
	// negative values start at root
	getModelAtOffset: function(index) {
		if (!_.isNumber(index) || isNaN(index)) index = 0;
		if (index < 0) return this.getAllModels()[~index];

		var model = this;

		while (index && model) {
			model = model.parent;
			index--;
		}

		return model;
	},

	// gets the last model in the stack
	getRootModel: function() {
		var model = this;
		while (model.parent != null) model = model.parent;
		return model;
	},

	// returns the first model which passes the function
	findModel: function(fn) {
		var index = 0,
			model = this;

		while (model != null) {
			if (fn.call(this, model, index++)) return model;
			model = model.parent;
		}
	},

	// returns the value at path, but only looks in the data on this model
	getLocal: function(path, ctx) {
		if (typeof path === "string") path = parse(path, { startRule: "path" });
		if (path == null) path = { parts: [] };
		if (!_.isObject(path)) throw new Error("Expecting string or object for path.");
		if (ctx == null) ctx = this;

		var self = this;
		this._dep.depend();

		return _.reduce(path.parts, function(target, part) {
			target = self._get(target, part.key);

			_.each(part.children, function(k) {
				if (_.isObject(k)) k = ctx.get(k);
				target = self._get(target, k);
			});

			return target;
		}, this.data);
	},

	// retrieves value with path query
	get: function(paths) {
		var self = this;

		if (typeof paths === "string") paths = parse(paths, { startRule: "pathQuery" });
		if (!_.isArray(paths)) paths = paths != null ? [ paths ] : [];
		if (!paths.length) paths.push({ type: "all", parts: [] });

		return _.reduce(paths, function(result, path, index) {
			var model = self,
				scope = true,
				val;

			if (path.type === "root") {
				model = self.getRootModel();
			} else if (path.type === "parent") {
				model = self.getModelAtOffset(path.distance);
			} else if (path.type === "all") {
				scope = false;
			}

			if (model == null) return;

			while (_.isUndefined(val) && model != null) {
				val = model.getLocal(path, self);
				model = model.parent;
				if (scope) break;
			}

			if (_.isFunction(val)) {
				val = val.call(self, index === 0 ? null : result);
			}

			return val;
		}, void 0);
	},

	_get: function(target, key) {
		return this.callProxyMethod(this.getProxyByValue(target), target, "get", key);
	},

	proxy: function(key) {
		var proxy = this.getProxyByValue(this.data);
		if (key == null) return proxy;
		var args = _.toArray(arguments);
		args.unshift(proxy, this.data);
		return this.callProxyMethod.apply(this, args);
	},

	callProxyMethod: function(proxy, target, method) {
		return Model.callProxyMethod(proxy, target, method, Array.prototype.slice.call(arguments, 3), this);
	},

	getAllProxies: function() {
		var proxies = [],
			model = this;

		while (model != null) {
			proxies.push.apply(proxies, model.proxies);
			model = model.parent;
		}

		proxies.push.apply(proxies, Model._defaultProxies);

		return proxies;
	},

	hasProxy: function(proxy, proxies) {
		if (proxies == null) proxies = this.getAllProxies();
		return _.contains(proxies, proxy);
	},

	registerProxy: function(proxy) {
		if (typeof proxy !== "object" || proxy == null) throw new Error("Expecting object for proxy.");
		if (typeof proxy.match !== "function") throw new Error("Layer missing required match method.");
		if (typeof proxy.get !== "function") throw new Error("Layer missing required get method.");
		if (!this.hasProxy(proxy)) this.proxies.unshift(proxy);
		return this;
	},

	getProxyByValue: function(target, proxies) {
		if (proxies == null) proxies = this.getAllProxies();
		return _.find(proxies, function(proxy) {
			return proxy.match(target);
		});
	},

	// defines a reactive property on an object that points to the data
	defineDataLink: function(obj, prop, options) {
		var model = this;

		Object.defineProperty(obj, prop, {
			configurable: options != null && options.configurable,
			enumerable: options == null || options.enumerable !== false,
			get: function() {
				model._dep.depend();
				return model.data;
			},
			set: function(val) {
				model.set(val);
			}
		});

		return obj;
	}

});
