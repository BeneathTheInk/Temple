var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util"),
	Scope = require("./scope"),
	Binding = require("./binding");

// base prototype
var proto = {
	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		fn.apply(this, args);
		return this;
	}
};

// render methods
_.each(require("./render"), function(method, key) {
	proto[key] = method;
});

// export
var Temple =
module.exports = Scope.extend(proto);

// class properties/methods
Temple.VERSION = "0.2.9-rc1";
Temple.util = util;

Temple.Deps = require("./deps");
Temple.Scope = Scope;
Temple.Model = require("./model");

Temple.Mustache = require("./mustache");
Temple.NODE_TYPE = require("./types");
Temple.Binding = Binding;