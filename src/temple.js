var _ = require("underscore"),
	util = require("./util"),
	Binding = require("./binding");

// export
var Temple =
module.exports = Binding.Scope.extend({
	constructor: function() {
		Binding.Scope.apply(this, arguments);
		this.initialize();
	},
	initialize: function(){},
	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		fn.apply(this, args);
		return this;
	}
}, Binding);

// class properties/methods
Temple.VERSION = "0.2.11-alpha";
Temple.util = util;

Temple.Deps = require("./deps");
Temple.Model = require("./model");
Temple.Binding = Binding;

Temple.Mustache = require("./mustache");