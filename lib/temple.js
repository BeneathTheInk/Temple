var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util"),
	Scope = require("./scope"),
	Deps = require("./deps");

// base prototype
var proto = {
	constructor: function(template, data) {
		if (!(this instanceof Temple))
			return new (arguments.callee.prototype.constructor)(template, data);
		
		template = template || this.template;
		if (template != null) this.setTemplate(template);

		Scope.call(this, data);
	},

	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		args.unshift(this);
		fn.apply(this, args);
		return this;
	},

	autorun: function(fn) {
		return Deps.autorun(fn.bind(this));
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
Temple.extend = util.subclass;
Temple.parse = require("./parse");
Temple.Deps = Deps;
Temple.Scope = Scope;