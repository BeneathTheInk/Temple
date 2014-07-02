var _ = require("underscore"),
	util = require("./util"),
	Binding = require("./binding");

// export
var Temple =
module.exports = Binding.ReactScope.extend({
	constructor: function() {
		Binding.ReactScope.apply(this, arguments);
		this.initialize.apply(this, arguments);
	},
	initialize: function(){},
	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		fn.apply(this, args);
		return this;
	}
}, Binding);

// class properties/methods
Temple.VERSION = "0.2.12";
Temple.util = util;

Temple.Deps = require("./deps");
Temple.Model = require("./model");
Temple.Binding = Binding;

Temple.Mustache = require("./mustache");