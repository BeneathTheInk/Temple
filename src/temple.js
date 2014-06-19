var _ = require("underscore"),
	util = require("./util"),
	Binding = require("./binding");

// export
var Temple =
module.exports = Binding.React.extend({
	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		fn.apply(this, args);
		return this;
	}
});

// class properties/methods
Temple.VERSION = "0.2.10";
Temple.util = util;

Temple.Deps = require("./deps");
Temple.Scope = require("./scope");
Temple.Model = require("./model");
Temple.Binding = Binding;

Temple.Mustache = require("./mustache");