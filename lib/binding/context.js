var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util"),
	Scope = require("../scope"),
	Model = require("../model");

var Context =
module.exports = Binding.extend({
	constructor: function(value) {
		if (!_.isFunction(value)) {
			var val = value;
			value = function() { return val; }
		}

		this.compute = value;

		Binding.call(this, _.toArray(arguments).slice(1));
	},

	render: function(scope) {
		if (this._comp != null) this._comp.stop();
		this._comp = this.autorun(function(comp) {
			var model = this.compute(scope);
			if (!Model.isModel(model)) model = new Model(model);
			var nscope = new Scope(model).addModel(scope);

			this.children.slice(0).forEach(function(child) {
				child.render(nscope);
			});
		});

		return this;
	}
});