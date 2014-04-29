var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util");

// default options
var defaults = {
	data: {},
	template: ""
};

// options to copy onto the object
var toCopy = [ "template" ];

// base prototype
var proto = {

	constructor: function(options) {
		EventEmitter.call(this);

		options = _.defaults(options || {}, defaults);
		toCopy.forEach(function(k) {
			this[k] = options[k];
		}, this);

		this._deps = {};
		this._observers = [];
		
		this.scope = new Temple.Scope(options.data);
		this.set(options.data);
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

	get: function(path) { return this.scope.get(path); },
	depend: function(path) { return this.scope.depend(path); },
	set: function(path, val) { return this.scope.set(path, val); },
	unset: function(path) { return this.scope.unset(path); },
	observe: function(path, fn) { return this.scope.observe(path, fn); }

};

// core methods
var core = [
	require("./dom"),	// DOM Handler
];

core.forEach(function(methods) {
	for (var method in methods) {
		proto[method] = methods[method];
	}
});

// export
var Temple =
module.exports = util.subclass(EventEmitter, proto);

// class properties/methods
Temple.extend = util.subclass.bind(null, Temple);
Temple.parse = require("./parse");
Temple.Deps = require("./deps");
Temple.Scope = require("./scope");