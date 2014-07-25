var Binding = require("./binding"),
	util = require("./util");

// export
var Temple =
module.exports = Binding.React.extend({
	constructor: function() {
		Binding.React.apply(this, arguments);
		this.initialize.apply(this, arguments);
	},
	initialize: function(){},
	use: function(fn) {
		var args = util.toArray(arguments).slice(1);
		fn.apply(this, args);
		return this;
	}
}, Binding);

// static properties/methods
Temple.VERSION = "0.3.0-alpha";
Temple.Binding = Binding;
Temple.util = util;

// deps setup
var Deps = Temple.Deps = require("./deps");
Temple.autorun = Deps.autorun;
Temple.Dependency = Deps.Dependency;