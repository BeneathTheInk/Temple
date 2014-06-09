var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util"),
	Scope = require("../scope"),
	Model = require("../model");

var Context =
module.exports = Binding.extend({
	constructor: function(path) {
		if (!_.isString(path))
			throw new Error("Expecting string path.");

		this.path = path;
		Binding.call(this, _.toArray(arguments).slice(1));
	},

	render: function(scope) {
		var nscope = scope.createScopeFromPath(this.path);
		return Binding.prototype.render.call(this, nscope);
	}
});