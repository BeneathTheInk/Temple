var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util"),
	Model = require("./model"),
	Plugins = require("./plugins");

var Context =
module.exports = Temple.extend({

	constructor: function(data, options) {
		// first we set the initial view state
		var state = _.result(this, "defaults");
		var stateOptions = (options && options.state) || { track: true };
		if (state != null) {
			// shove state between contexts
			if (Model.isModel(data)) {
				state = data.parent = new Model(state, data.parent, stateOptions);
			}

			// add to the stack before the real data
			this.addData(state, stateOptions);
			this.state = this.model.data;
		}

		// set the passed in data
		if (data != null) this.addData(data, options);

		// construct like a normal binding
		Temple.call(this);
	},

	use: function(p) {
		return Plugins.loadPlugin(this, p, _.toArray(arguments).slice(1));
	},

	// adds data to the current stack
	addData: function(data, options) {
		if (!Model.isModel(data)) data = new Model(data, this.model, options);
		this.model = data;
		return this;
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
	}

});

// chainable methods to proxy to model
[ "registerProxy" ]
.forEach(function(method) {
	Context.prototype[method] = function() {
		this.model[method].apply(this.model, arguments);
		return this;
	}
});

// methods to proxy to model which don't return this
[ "set", "get", "getLocal", "getProxyByValue", "getModelAtOffset",
  "getRootModel", "findModel", "getContainerValue", "getAllModels"
].forEach(function(method) {
	Context.prototype[method] = function() {
		return this.model[method].apply(this.model, arguments);
	}
});