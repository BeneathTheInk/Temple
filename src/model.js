var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util"),
	parse = require("./m+xml").parse;

var Model =
module.exports = function Model(data, parent, options) {
	options = options || {};
	this.proxies = [];
	this._proxy_dep = new Temple.Dependency();
	if (Model.isModel(parent)) this.parent = parent;
	this.set(data, options.track);
}

Model.isModel = function(o) {
	return o instanceof Model;
}

Model.extend = Temple.util.subclass;

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
	return util.result.apply(null, args);
}

_.extend(Model.prototype, {

	// sets the data on the model
	set: function(data, track) {
		if (track) data = util.track(data, track);
		this.data = data;
		return this;
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

	// returns containing object's value 
	getContainerValue: function(path) {
		if (typeof path === "string") path = parse(path, { startRule: "path" });
		if (_.isUndefined(path)) return this.get();
		if (!_.isObject(path)) throw new Error("Expecting string or object for path.");

		// get the last key
		var key = _.last(path.parts);
		if (key == null) return this.get();

		if (!key.children.length) {
			key = key.key;
			path.parts.pop();
		} else {
			key = this.get(key.children.pop());
		}

		// find the first model with the key
		var value;
		this.findModel(function(m) {
			value = m.getLocal(path);
			if (_.isUndefined(value)) return false;
			var proxy = this.getProxyByValue(value);
			return !_.isUndefined(proxy.get(value, key));
		});

		return value;
	},

	getLocal: function(path) {
		if (typeof path === "string") path = parse(path, { startRule: "path" });
		if (!_.isObject(path)) throw new Error("Expecting string or object for path.");
		var self = this;

		return _.reduce(path.parts, function(target, part) {
			target = self._get(target, part.key);

			_.each(part.children, function(k) {
				if (_.isObject(k)) k = self.get(k);
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
		
		if (!paths.length) {
			var model = this.findModel(function(m) { return !_.isUndefined(m.data); });
			if (model == null) return;
			var val = model.data;
			if (_.isFunction(val)) val = val.call(this, null);
			return val;
		}

		return _.reduce(paths, function(result, path, index) {
			var model = self,
				scope = true,
				val;

			if (path.type === "root") {
				model = self.getRootModel();
			} else if (path.type === "parent") {
				model = self.getModelAtOffset(path.distance);
				scope = false;
			} else if (path.type === "all") {
				scope = false;
			}

			if (model == null) return;

			while (_.isUndefined(val) && model != null) {
				val = model.getLocal(path);
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

		return proxies;
	},

	registerProxy: function(proxy) {
		if (typeof proxy !== "object" || proxy == null) throw new Error("Expecting object for proxy.");
		if (typeof proxy.match !== "function") throw new Error("Layer missing required match method.");
		if (typeof proxy.get !== "function") throw new Error("Layer missing required get method.");
		
		// ensures it isn't already in the context before adding it
		// this is to prevent infinite loops, but maybe could be improved
		if (!_.contains(this.getAllProxies(), proxy)) {
			this.proxies.unshift(proxy);
			this._proxy_dep.changed();
		}
		
		return this;
	},

	getProxyByValue: function(target) {
		this._proxy_dep.depend();
		var proxy;
		
		proxy = _.find(this.proxies, function(p) {
			return p.match(target);
		});

		if (proxy == null && this.parent != null) {
			proxy = this.parent.getProxyByValue(target);
		}

		if (proxy == null) {
			proxy = _.find(Model._defaultProxies, function(p) {
				return p.match(target);
			});
		}

		return proxy;
	}

});
