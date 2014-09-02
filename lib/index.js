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
		util.toArray(arguments).forEach(this.appendChild, this);
	}
});

// static properties/methods
Temple.VERSION = "0.3.2";
Temple.util = util;
Temple.Events = require("./events");
Temple.Binding = Binding;

// deps setup
var Deps = Temple.Deps = require("./deps");
Temple.autorun = Deps.autorun;
Temple.nonreactive = Deps.nonreactive;
Temple.Dependency = Deps.Dependency;