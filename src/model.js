var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util"),
	parse = require("./m+xml").parse;

var Model =
module.exports = function Model(data, parent) {
	this.data = data;
	this.proxies = [];
	if (Model.isModel(parent)) this.parent = parent;
}

Model.isModel = function(o) {
	return o instanceof Model;
}

Model.extend = Temple.util.subclass;

Model._defaultProxies = [];

_.extend(Model.prototype, Temple.Events, {

	getModelAtOffset: function(index) {
		if (index == null) index = 0;
		var model = this;
		while (index && model) {
			model = model.parent;
			index--;
		}
		return model;
	},

	getRootModel: function() {
		var model = this;
		while (model.parent != null) model = model.parent;
		return model;
	},

	get: function(paths, options) {
		var self = this;

		options = options || {};
		if (typeof paths === "string") paths = parse(paths, { startRule: "pathQuery" });
		if (!_.isArray(paths)) paths = paths != null ? [ paths ] : [];
		
		return paths.reduce(function(result, path, index) {
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
				val = path.parts.reduce(function(target, part) {
					target = self._get(target, part.key, options);

					part.children.forEach(function(k) {
						if (_.isObject(k)) k = self.get(k, options);
						target = self._get(target, k, options);
					});

					return target;
				}, model.data);

				model = model.parent;
				if (scope) break;
			}

			if (_.isFunction(val)) val = val.apply(self.data, index === 0 ? [] : [ result ]);

			return val;
		}, void 0);
	},

	_get: function(target, key, options) {
		var proxy = this.getProxy(target, options);
		if (proxy != null) return proxy.get(target, key, options);
		else if (target != null) return target[key];
	},

	registerProxy: function(proxy) {
		if (typeof proxy !== "object" || proxy == null) throw new Error("Expecting object for proxy.");
		if (typeof proxy.match !== "function") throw new Error("Layer missing required match method.");
		if (typeof proxy.get !== "function") throw new Error("Layer missing required get method.");
		this.proxies.unshift(proxy);
		return this;
	},

	getProxy: function(target, options) {
		var model = this,
			index = 0,
			proxy;

		while (model != null && model.proxies.length) {
			proxy = model.proxies[index++];
			if (proxy.match(target, options)) return proxy;

			if (index >= model.proxies.length) {
				model = model.parent;
				index = 0;
			}
		}

		return _.find(Model._defaultProxies, function(l) { return l.match(target, options); });
	}

});
