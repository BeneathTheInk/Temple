var Temple = require("./temple"),
	_ = require("underscore"),
	util = require("./util"),
	EventEmitter = require("events").EventEmitter;

var Adaptor =
module.exports = util.subclass(EventEmitter, {

	constructor: function(value) {
		EventEmitter.call(this);
		this.value = value;
		this.initialize();
	},

	initialize: function(){},

	depth: -1,

	get: function(path) {

	},

	set: function() {

	},

	destroy: function() {

	}

});