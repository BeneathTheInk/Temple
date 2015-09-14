var Trackr = require("trackr");
// var track = require("trackr-objects");
var _ = require("underscore");
// var utils = require("./utils");
var parse = require("./m+xml").parse;
var Events = require("backbone-events-standalone");
var assignProps = require("assign-props");

var Context =
module.exports = function Context(data, parent, options) {
	this._dep = new Trackr.Dependency();
	if (Context.isContext(parent)) this.parent = parent;
	this.set(data, options);
};

Context.isContext = function(o) {
	return o instanceof Context;
};

Context.extend = require("backbone-extend-standalone");

assignProps(Context.prototype, {
	data: function() {
		this._dep.depend();
		return this._data;
	}
});

_.extend(Context.prototype, Events, {

	// sets the data on the context
	set: function(data, options) {
		options = options || {};
		var previousData = this._data;
		this._data = data;
		this._dep.changed();
		if (!options.silent) this.trigger("change", data, previousData);
		return this;
	},

	append: function(context, options) {
		if (Context.isContext(context)) context.parent = this;
		else context = new Context(context, this, options);
		return context;
	},

	// an array of contexts in the current stack, with the root as the first
	getAllContexts: function() {
		var contexts = [ this ],
			context = this;

		while (context.parent) {
			contexts.unshift(context = context.parent);
		}

		return contexts;
	},

	// gets the context in the stack at the index
	// negative values start at root
	getContextAtOffset: function(index) {
		if (!_.isNumber(index) || isNaN(index)) index = 0;
		if (index < 0) return this.getAllContexts()[~index];

		var context = this;

		while (index && context) {
			context = context.parent;
			index--;
		}

		return context;
	},

	// gets the last context in the stack
	getRootContext: function() {
		var context = this;
		while (context.parent != null) context = context.parent;
		return context;
	},

	// returns the first context which passes the function
	findContext: function(fn) {
		var index = 0,
			context = this;

		while (context != null) {
			if (fn.call(this, context, index++)) return context;
			context = context.parent;
		}
	},

	// returns the value at path, but only looks in the data on this context
	get: function(path, options) {
		options = options || {};

		if (typeof path === "string") path = parse(path, { startRule: "path" });
		if (path == null) path = { parts: [] };
		if (!_.isObject(path)) throw new Error("Expecting string or object for path.");

		var self = this;
		if (options.reactive !== false) this._dep.depend();

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
	query: function(paths) {
		var self = this;

		if (typeof paths === "string") paths = parse(paths, { startRule: "pathQuery" });
		if (!_.isArray(paths)) paths = paths != null ? [ paths ] : [];
		if (!paths.length) paths.push({ type: "all", parts: [] });

		return _.reduce(paths, function(result, path) {
			var context = self;
			var scope = true;
			var val;

			if (path.type === "root") {
				context = self.getRootContext();
			} else if (path.type === "parent") {
				context = self.getContextAtOffset(path.distance);
			} else if (path.type === "all") {
				scope = false;
			}

			if (context == null) return;

			while (_.isUndefined(val) && context != null) {
				val = context.get(path);
				context = context.parent;
				if (scope) break;
			}

			if (_.isFunction(val)) val = val.call(self.data, result, self);

			return val;
		}, void 0);
	},

	_get: function(target, key) {
		return target == null ? void 0 : target[key];
	}

});
