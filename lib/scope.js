var _ = require("underscore"),
	util = require("./util"),
	EventEmitter = require("events").EventEmitter,
	Model = require("./model"),
	Deps = require("./deps");

var proto = {

	constructor: function(model) {
		EventEmitter.call(this);
		this.setMaxListeners(0);

		// convert data to model if isn't one already
		if (!Model.isModel(model)) {
			var data = model;
			model = new Model(_.result(this, "defaults"));
			if (!_.isUndefined(data)) model.set([], data);
		}

		this.models = [ model ];
		this.initialize();
	},

	initialize: function() {},

	// adds a model to the set
	addModel: function(model) {
		// accept scopes and arrays, but reduce them to models
		if (Scope.isScope(model)) this.addModel(model.models);
		else if (_.isArray(model)) {
			model.forEach(function(m) { this.addModel(m); }, this);
		}

		else {
			if (!Model.isModel(model)) throw new Error("Expecting model.");
			if (!~this.models.indexOf(model)) this.models.push(model);
		}

		return this;
	},
 
	// removes a previously added fallback model
	removeModel: function(model) {
		if (Scope.isScope(model)) this.removeModel(model.models);
		else if (_.isArray(model)) {
			model.forEach(function(m) { this.removeModel(m); }, this);
		}

		else {
			var index = this.models.indexOf(model);
			if (~index) this.models.splice(index, 1);
		}

		return this;
	},

	// reruns fn anytime dependencies change
	autorun: function(fn) {
		return Deps.autorun(fn.bind(this));
	},

	// returns the first model, at parts, whose value isn't null
	findModel: function(parts) {
		return _.find(this.models, function(model) {
			return model.get(parts) != null;
		});
	},

	get: function(parts) {
		var val, model;

		parts = util.splitPath(parts);

		if (parts[0] === "this") {
			parts.shift();
			val = this.models[0].get(parts);
		}

		else {
			model = this.findModel(parts);
			if (model != null) val = model.get(parts);
		}

		// execute functions
		if (_.isFunction(val)) val = val.call(this);

		return val;
	},

	depend: function(path) {
		// this is sort of a hack, basically gets the
		// value which registers dependencies at every
		// fallback until the value is found.
		this.get(path);
		return this;
	}

};

// Proxy Methods
[ "handle", "getModel", "keys", "set", "unset", "notify", "setHidden", "observe", "stopObserving" ]
.forEach(function(method) {
	proto[method] = function() {
		var model = this.models[0],
			ret = model[method].apply(model, arguments);
		
		return ret === model ? this : ret;
	}
});

var Scope =
module.exports = util.subclass.call(EventEmitter, proto, {

	extend: util.subclass,

	isScope: function(obj) {
		return obj instanceof Scope;
	}

});