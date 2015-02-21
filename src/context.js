var Temple = require("templejs"),
	_ = require("underscore"),
	util = require("./util"),
	Model = require("./model");

var Context =
module.exports = Temple.extend({

	constructor: function(data) {
		if (data != null) this.addData(data);
		Temple.call(this);
	},

	addData: function(data) {
		if (!Model.isModel(data)) data = new Model(data, this.model);
		this.model = data;
		return this;
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