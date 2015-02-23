var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util"),
	Model = require("./model"),
	Plugins = require("./plugins");

var Context =
module.exports = Temple.extend({

	constructor: function(data) {
		if (!_.isUndefined(data)) this.addData(data);
		Temple.call(this);
	},

	use: function(p) {
		return Plugins.loadPlugin(this, p, _.toArray(arguments).slice(1));
	},

	addData: function(data) {
		if (!Model.isModel(data)) data = new Model(data, this.model);
		this.model = data;
		return this;
	},

	set: function(data) {
		if (!Model.isModel(data)) data = util.reactify(data);
		if (this.model) this.model.data = data;
		else this.addData(data);
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
[ "get", "getProxy", "getModelAtOffset", "getRootModel" ]
.forEach(function(method) {
	Context.prototype[method] = function() {
		return this.model[method].apply(this.model, arguments);
	}
});