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
		this.scope = null;

		Binding.call(this, _.toArray(arguments).slice(1));
	},

	cleanScope: function() {
		if (this.scope != null) {
			this.scope.destroy();
			delete this.scope;
		}

		return this;
	},

	render: function(scope) {
		this.cleanScope();
		this.scope = scope.createScopeFromPath(this.path);
		return Binding.prototype.render.call(this, this.scope);
	},

	destroy: function() {
		this.cleanScope();
		return Binding.prototype.destroy.apply(this, arguments);
	}
});