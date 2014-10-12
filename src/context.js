var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util"),
	Model = require("./model"),
	Observe = require("./observe");

var Context =
module.exports = Temple.extend(_.extend(Observe, {

	constructor: function(model, ctx) {
		this.models = [];
		this.setParentContext(ctx);

		// convert data to model if isn't one already
		if (!Model.isModel(model)) model = new Model(model);
		this.addModel(model);

		var defaults = _.result(this, "defaults");
		if (!_.isUndefined(defaults)) this.addModel(new Model(_.clone(defaults)));

		Temple.call(this);
	},

	use: function(p) {
		return require("./plugins").loadPlugin(this, p, _.toArray(arguments).slice(1));
	},

	defaults: function(){},

	setParentContext: function(ctx) {
		if (ctx != null && !Context.isContext(ctx))
			throw new Error("Expecting null or instance of context to set as parent.");

		var prevctx = this.parentContext;

		if (prevctx != null) {
			prevctx.off("change", this._onChange, this);
			this.parentContext = null;
		}

		if (ctx != null) {
			ctx.on("change", this._onChange, this);
			this.parentContext = ctx;
		}

		if (prevctx !== ctx) this.trigger("ctx", this.parentContext, prevctx);

		return this;
	},

	// adds a model to the set
	addModel: function(model) {
		// accept scopes and arrays, but reduce them to models
		if (_.isArray(model)) {
			model.forEach(function(m) { this.addModel(m); }, this);
			return this;
		}

		else if (!Model.isModel(model))
			throw new Error("Expecting model.");

		else if (!~this.models.indexOf(model)) {
			this.models.push(model);

			// add observer
			model.on("change", this._onChange, this);

			this.trigger("model:add", model);
		}

		return this;
	},

	// removes a previously added model
	removeModel: function(model) {
		var index;

		if (_.isArray(model)) {
			model.forEach(function(m) { this.removeModel(m); }, this);
		}

		else if (~(index = this.models.indexOf(model))) {
			this.models.splice(index, 1);

			// strip observer
			model.off("change", this._onChange, this);

			this.trigger("model:remove", model);
		}

		return this;
	},

	// returns all models this context has access too
	getModels: function() {
		var m = [],
			c = this;

		while (c != null) {
			if (_.isArray(c.models)) m = m.concat(c.models);
			c = c.parentContext;
		}

		return _.unique(m);
	},

	// returns the first model whose value at path isn't undefined
	firstModelWithValue: function(path, options) {
		var i, models;

		options = options || {};
		models = _.isArray(options.models) ? options.models :
			options.local ? this.models : this.getModels();

		for (i in models) {
			if (models[i].get(path, options) !== void 0) {
				return models[i];
			}
		}

		return null;
	},

	// returns an exact model specified by query
	findModel: function(parts, options) {
		var val, model, query;

		options = options || {};

		if (_.isString(parts)) query = util.parseContextQuery(parts);
		else if (_.isArray(parts)) query = util.path.split(parts);
		else query = [];

		// local model
		if (query.type === "local") {
			model = this.firstModelWithValue(query, _.extend({}, options, { local: true })) || this.models[0];
		}

		// the root model
		else if (query.type === "root") {
			model = _.last(this.getModels());
		}

		// specific parent context
		else if (query.type === "parent") {
			var dist = query.distance,
				ctx = this;
			
			while (dist && ctx) {
				ctx = ctx.parentContext;
				dist--;
			}

			if (ctx != null) model = ctx.firstModelWithValue(query, options);
		}

		// or normal look up
		else {
			model = this.firstModelWithValue(query, options) || this.models[0];
		}

		// return the exact model
		return model != null ? model.getModel(query) : null;
	},

	get: function(parts, options) {
		var val, model, filters, fmodel, fn, args;

		options = options || {};
		args = _.isArray(options.args) ? options.args :
			options.args != null ? [ options.args ] : [];

		// get all filters
		if (_.isString(parts)) {
			filters = parts.split("|");
			parts = filters.shift();
		} else {
			filters = [];
		}
		
		// get the model from the path and return if specified
		model = this.findModel(parts, options);
		if (model == null) return options.model ? null : void 0;
		if (options.model) return model;
		
		// get the value
		val = model.value;
		if (_.isFunction(val)) val = val.apply(this, args);

		// apply filters
		while (filters.length) {
			val = this.get(filters.shift(), _.extend({}, options, {
				args: [ val ].concat(args)
			}));
		}

		return val;
	},

	keys: function(path) {
		var model = this.findModel(path);
		return model != null ? model.keys() : [];
	},

	set: function(path, value, options) {
		var model, self = this;

		if (path != null && value == null && !_.isArray(path) && !_.isString(path)) {
			value = path;
			path = [];
		}

		model = this.findModel(path, { depend: false }) || this.getModel(path);
		model.set([], value, options);

		return this;
	},

	// removes the value at path
	unset: function(path, options) {
		return this.set(path || [], true, _.extend({ remove: true }, options));
	},

	// auto mount on paint
	paint: function() {
		Temple.prototype.paint.apply(this, arguments);
		if (!this.isMounted()) this.mount();
		return this;
	},

	// auto stop on detach
	detach: function() {
		this.stop();
		return Temple.prototype.detach.apply(this, arguments);
	},

	// registers proxy on all local models
	registerProxy: function(proxy) {
		_.invoke(this.models, "registerProxy", proxy);
		return this;
	},

	// returns all proxies associated with this context
	getAllProxies: function() {
		var proxies = [];

		this.getModels().forEach(function(model) {
			proxies = _.union(proxies, model.getAllProxies());
		});

		return proxies;
	},

	// cleans the proxy tree on all local models
	cleanProxyTree: function() {
		_.invoke(this.models, "cleanProxyTree");
		return this;
	},

	// cleans up the context so it can be GC'd
	clean: function() {
		this.detach();
		this.setParentContext(null);
		this.cleanProxyTree();
		this.trigger("clean");
		return this;
	},

	// custom observer handler
	_handleObserver: function(ob, chg, opts, model) {
		var self = this;
		util.findAllChanges(chg, ob.parts, function(nchg) {
			if (!intersectChange.call(self, model, nchg)) return;
			ob.fn.call(self, nchg, opts, model);
		});
	}

}), {
	isContext: function(o) {
		return o instanceof Context;
	}
});

// chainable proxy methods
// [ ]
// .forEach(function(method) {
// 	Context.prototype[method] = function() {
// 		var model = this.models[0];
// 		model[method].apply(model, arguments);
// 		return this;
// 	}
// });

// proxy methods which don't return this
[ "getModel", "getProxyByValue", "proxy" ]
.forEach(function(method) {
	Context.prototype[method] = function() {
		var model = this.models[0];
		return model[method].apply(model, arguments);
	}
});

// modifies a change summary to incorporate all models in context
function intersectChange(model, summary) {
	var models = this.getModels(),
		dindex = models.indexOf(model),
		cindex = -1;

	// delta model must exist in models or things go wacky
	if (!~dindex) return false;

	models.some(function(model, index) {
		if (model.get(summary.keypath) !== void 0) {
			cindex = index;
			return true;
		}
	}, model);

	// default previous is the delta model
	summary.previousModel = summary.model;

	switch(summary.type) {
		case "add":
			// if the delta index is after the current index, move along
			// if the delta index is before the current index, something went wrong
			if (dindex !== cindex) return false;

			// find the model after the current one that previously contained the value
			var pmodel = _.find(models.slice(cindex + 1), function(model) {
				return model.get(summary.keypath) !== void 0;
			});

			if (pmodel != null) {
				summary.previousModel = pmodel.getModel(summary.keypath);
				summary.oldValue = summary.previousModel.value;
			}

			break;

		case "update":
			// if the delta index is after the current index, move along
			// if the delta index is before the current index, something went wrong
			if (dindex !== cindex) return false;

			break;

		case "delete":
			// with deletes, only modify the summary if the current model exists
			if (cindex > -1) {
				// if the delta index isn't before the current index, something went wrong
				if (cindex <= dindex) return false;

				// a delete means the summary model is the delta model
				summary.model = models[cindex].getModel(summary.keypath);
				summary.value = summary.model.value;
			}
	}

	summary.type = util.changeType(summary.value, summary.oldValue);

	return summary;
}
