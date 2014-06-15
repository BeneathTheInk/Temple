var _ = require("underscore"),
	util = require("./util"),
	Binding = require("./binding");

// export
var Temple =
module.exports = Binding.extend({
	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		fn.apply(this, args);
		return this;
	},

	render: function() {
		throw new Error("No render method implemented.");
	},

	paint: function() {
		if (!this._rendered) {
			this.appendChild(this.render());
			this._rendered = true;
		}

		return Binding.prototype.paint.apply(this, arguments);
	}
});

// class properties/methods
Temple.VERSION = "0.2.9";
Temple.util = util;

Temple.Deps = require("./deps");
Temple.Scope = require("./scope");
Temple.Model = require("./model");

Temple.Mustache = require("./mustache");
Temple.Binding = Binding;