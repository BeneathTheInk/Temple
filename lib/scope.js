var _ = require("underscore"),
	util = require("./util"),
	EventEmitter = require("events").EventEmitter,
	Model = require("./model");

var proto = {

	constructor: function(model) {
		// convert data to model if isn't one already
		if (!Model.isModel(model)) {
			model = new Model(model);
		}

		EventEmitter.call(this);
		this.setMaxListeners(0);

		this.model = model;
		this.fallbacks = [];
	},

	initialize: function() {},

	// passed in model will be searched when value isn't found locally
	addFallback: function(model) {
		if (!Model.isModel(model)) throw new Error("Expecting model.");
		if (this.fallbacks.indexOf(model) < 0) this.fallbacks.push(model);
		return this;
	},
 
	// removes a previously added fallback model
	removeFallback: function(model) {
		var index = this.fallbacks.indexOf(model);
		if (index > -1) this.fallbacks.splice(index, 1);
		return this;
	},

	// reruns fn anytime dependencies change
	autorun: function(fn) {
		return Deps.autorun(fn.bind(this));
	},

	get: function(parts) {
		var val, models, model;

		parts = util.splitPath(parts);

		if (parts[0] === "this") {
			parts.shift();
			val = this.model.get(parts);
		}

		else {
			models = [ this.model ].concat(this.fallbacks);

			while (models.length) {
				model = models.shift();
				val = model.get(parts);
				if (val != null) break;
			}
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
	extend: util.subclass
});