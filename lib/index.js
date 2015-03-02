var Binding = require("./binding"),
	util = require("./util");

// export
var Temple =
module.exports = Binding.extend({
	constructor: function() {
		Binding.call(this);
		this.initialize.apply(this, arguments);
	},
	initialize: function() {
		this.append(util.toArray(arguments));
	}
});

// static properties/methods
Temple.VERSION = "0.4.2";
Temple.util = util;
Temple.Events = require("./events");
Temple.Binding = Binding;

// deps setup
var Deps = Temple.Trackr = Temple.Deps = require("trackr");
Temple.autorun = Deps.autorun;
Temple.nonreactive = Deps.nonreactive;
Temple.nonreactable = Deps.nonreactable;
Temple.Dependency = Deps.Dependency;