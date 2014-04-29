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
		this.set(options.data);

		this.paint();
	},

	initialize: function() {},

	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		args.unshift(this);
		fn.apply(this, args);
		return this;
	}

};

// core methods
var core = [
	require("./model"),	// Data Model
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
Temple.Observer = require("./observer");
Temple.Deps = require("./deps");