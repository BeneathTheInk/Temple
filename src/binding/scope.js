var _ = require("underscore"),
	util = require("../util"),
	Binding = require("./index"),
	Model = require("../model"),
	Observe = require("../observe");

var Scope =
module.exports = Binding.extend(_.extend(Observe, {
	constructor: function(data) {
		// binding constructor
		Binding.call(this);

		// set the initial model
		this.setModel(data);
	},

	setModel: function(model) {
		if (!Model.isModel(model)) {
			var data = model;
			model = new Model(_.result(this, "defaults"));
			if (!_.isUndefined(data)) model.set([], data);
		}

		// clear existing model
		this.clearModel();

		// add the new one
		this.model = model;
		this.listenTo(model, "change", this._onChange);
		this.trigger("model", model);

		return this;
	},

	clearModel: function() {
		if (this.model != null) {
			delete this.model;
			this.stopListening(model);
			this.trigger("model");
		}

		return this;
	}
}));

// chainable proxy methods
[ "handle", "set", "unset" ]
.forEach(function(method) {
	Scope.prototype[method] = function() {
		var model = this.model;
		model[method].apply(model, arguments);
		return this;
	}
});

// proxy methods which don't return this
[ "getModel", "notify", "get", "keys" ]
.forEach(function(method) {
	Scope.prototype[method] = function() {
		var model = this.model;
		return model[method].apply(model, arguments);
	}
});