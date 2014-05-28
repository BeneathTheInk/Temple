var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util"),
	Scope = require("./scope");

// base prototype
var proto = {
	constructor: function(template, data) {
		this._decorators = {};

		template = template || this.template;
		if (template != null) this.setTemplate(template);

		Scope.call(this, data);
	},

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
Temple.VERSION = "0.2.6";
Temple.util = util;

Temple.Deps = require("./deps");
Temple.Scope = Scope;
Temple.Model = require("./model");
Temple._defaultHandlers = require("./handlers");

Temple.parse = require("./parse");
Temple.NODE_TYPE = require("./types");
Temple.Binding = require("./render/binding");