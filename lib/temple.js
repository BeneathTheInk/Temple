var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util");

// base prototype
var proto = {

	constructor: function(template, scope) {
		if (!(this instanceof Temple))
			return new Temple(template, scope);
		
		EventEmitter.call(this);
		this._deps = {};
		this._observers = [];
		this.scope(scope || {});

		template = template || this.template;
		if (template != null) this.setTemplate(template);

		this.initialize();
	},

	initialize: function() {},

	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		args.unshift(this);
		fn.apply(this, args);
		return this;
	},

	autorun: function(fn) {
		return Temple.Deps.autorun(fn.bind(this));
	},

	scope: function(scope) {
		if (scope == null) return this._scope;

		if (!(scope instanceof Temple.Scope))
			scope = new Temple.Scope(scope, this._scope);

		// This is particularly weak. Only the first scope passed
		// is useful, after that passing in scope objects just
		// replaces the whole tree.
		this._scope = scope;
		return this;
	},

	get: function(path) { return this._scope.get(path); },
	depend: function(path) { return this._scope.depend(path); },
	set: function(path, val) { return this._scope.set(path, val); },
	unset: function(path) { return this._scope.unset(path); },
	observe: function(path, fn) { return this._scope.observe(path, fn); }

};

// core methods
var core = [
	require("./render"),	// DOM Handler
];

core.forEach(function(methods) {
	for (var method in methods) {
		proto[method] = methods[method];
	}
});

// export
var Temple =
module.exports = util.subclass.call(EventEmitter, proto);

// class properties/methods
Temple.extend = util.subclass;
Temple.parse = require("./parse");
Temple.Deps = require("./deps");
Temple.Scope = require("./scope");