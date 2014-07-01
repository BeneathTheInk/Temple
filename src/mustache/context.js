var _ = require("underscore"),
	Binding = require("../binding"),
	util = require("../util"),
	Model = require("../model"),
	Observe = require("../observe"),
	Deps = require("../deps");

var Context =
module.exports = Binding.extend(_.extend(Observe, {

	constructor: function(model) {
		Binding.call(this);
		this.models = [];
		this.parentContext = null;

		// convert data to model if isn't one already
		if (!Model.isModel(model)) {
			var data = model;
			model = new Model(_.clone(_.result(this, "defaults")));
			if (!_.isUndefined(data)) model.set([], data);
		}

		this.addModel(model);
	},

	spawnChildAtPath: function(path, klass) {
		var model, ctx;
		if (!util.isSubClass(Context, klass)) klass = Context;
		model = (this.findModel(path) || this).getModel(path);
		return new klass(model).setParentContext(this);
	},

	setParentContext: function(ctx) {
		if (ctx != null && !Context.isContext(ctx))
			throw new Error("Expecting null or instance of context to set as parent.");

		if (this.parentContext != null) {
			this.parentContext.off("change", this._onChange, this);
			this.parentContext = null;
		}

		if (ctx != null) {
			ctx.on("change", this._onChange, this);
			this.parentContext = ctx;
		}

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

	// returns the first model whose value at path isn't undefined
	findModel: function(path, options) {
		var i, models = this.getModels();

		for (var i in models)
			if (models[i].get(path, options) !== void 0)
				return models[i];

		return null;
	},

	getModels: function() {
		var m = [],
			c = this;

		while (c != null) {
			if (_.isArray(c.models)) m = m.concat(c.models);
			c = c.parentContext;
		}

		return _.unique(m);
	},

	get: function(parts, options) {
		var val, model;
		parts = util.splitPath(parts);
		options = options || {};

		if (parts[0] === "this") {
			parts.shift();
		} else {
			model = this.findModel(parts, options);
		}

		if (model == null) model = this.models[0];
		if (options.model) return model.getModel(parts);
		
		val = model.get(parts, options);
		if (_.isFunction(val)) val = val.call(this);
		
		return val;
	},

	keys: function(path) {
		return (this.findModel(path) || this).keys(path);
	},

	set: function(path) {
		var model, self = this;
		
		if (_.isArray(path) || _.isString(path)) {
			model = this.findModel(path, { depend: false });
		}
		
		if (model == null) model = this.getModel();
		model.set.apply(model, arguments);
		
		return this;
	},

	// removes the value at path
	unset: function(path, options) {
		return this.set(path || [], true, _.extend({ remove: true }, options));
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
[ "handle" ]
.forEach(function(method) {
	Context.prototype[method] = function() {
		var model = this.models[0];
		model[method].apply(model, arguments);
		return this;
	}
});

// proxy methods which don't return this
[ "getModel" ]
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
				if ( cindex <= dindex) return false;

				// a delete means the summary model is the delta model
				summary.model = models[cindex].getModel(summary.keypath);
				summary.value = summary.model.value;
			}
	}

	summary.type = util.changeType(summary.value, summary.oldValue);

	return summary;
}