var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util"),
	Model = require("./model"),
	Plugins = require("./plugins");

var Context =
module.exports = Temple.extend({

	constructor: function(data, options) {
		// first we create the initial view state
		var state = _.result(this, "initialState") || _.result(this, "defaults") || {};
		if (!Model.isModel(state)) state = new Model(state, null, options && options.state);
		
		// shove state between contexts
		if (Model.isModel(data)) {
			state.parent = data.parent;
			data.parent = state;
		}

		// add to the stack before the real data
		this.addData(state);
		this.stateModel = state;
		this.state = this.model.data;

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