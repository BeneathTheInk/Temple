var Binding = require("./binding"),
	util = require("./util");

// export
var Temple =
module.exports = Binding;

// static properties/methods
Temple.VERSION = "0.3.1";
Temple.util = util;
Temple.Events = require("./events");

// deps setup
var Deps = Temple.Deps = require("./deps");
Temple.autorun = Deps.autorun;
Temple.Dependency = Deps.Dependency;