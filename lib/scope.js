var _ = require("underscore"),
	util = require("./util"),
	EventEmitter = require("events").EventEmitter,
	Model = require("./model"),
	Deps = require("./deps");

var proto = {

	constructor: function(model) {
		// convert data to model if isn't one already
		if (!Model.isModel(model)) {
			var CModel = Model;
			if (this.defaults != null) CModel = Model.extend({ defaults: this.defaults });
			model = new CModel(model);
		}

		EventEmitter.call(this);
		this.setMaxListeners(0);

		this.model = model;
		this.fallbacks = [];

		this.initialize();
	},

	initialize: function() {},

	// passed in model will be searched when value isn't found locally
	addFallback: function(model) {
		// accept scopes, but reduce them to models
		if (Scope.isScope(model)) {
			this.addFallback(model.model);
			model.fallbacks.forEach(function(m) {
				this.addFallback(m);
			}, this);
		}

		else {
			if (!Model.isModel(model)) throw new Error("Expecting model.");
			if (model !== this.model && this.fallbacks.indexOf(model) < 0) {
				this.fallbacks.push(model);
			}
		}

		return this;
	},
 
	// removes a previously added fallback model
	removeFallback: function(model) {
		if (Scope.isScope(model)) {
			this.removeFallback(model.model);
			model.fallbacks.forEach(function(m) {
				this.removeFallback(m);
			}, this);
		}

		else {
			var index = this.fallbacks.indexOf(model);
			if (index > -1) this.fallbacks.splice(index, 1);
		}

		return this;
	},

	// reruns fn anytime dependencies change
	autorun: function(fn) {
		return Deps.autorun(fn.bind(this));
	},

	// returns the first model, at parts, whose value isn't null
	findModel: function(parts) {
		parts = util.splitPath(parts);
		
		var models = [ this.model ].concat(this.fallbacks),
			model, child;

		while (models.length) {
			model = models.shift();
			if (model.get(parts) != null) return model;
		}
	},

	get: function(parts) {
		var val, model;

		parts = util.splitPath(parts);

		if (parts[0] === "this") {
			parts.shift();
			val = this.model.get(parts);
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
[ "handle", "getModel", "keys", "set", "notify", "unset", "observe", "stopObserving" ]
.forEach(function(method) {
	proto[method] = function() {
		var ret = this.model[method].apply(this.model, arguments);
		return ret === this.model ? this : ret;
	}
});

var Scope =
module.exports = util.subclass.call(EventEmitter, proto, {

	extend: util.subclass,

	isScope: function(obj) {
		return obj instanceof Scope;
	}

});