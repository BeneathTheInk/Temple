var _ = require("underscore"),
	Binding = require("../binding"),
	util = require("../util"),
	Model = require("../model"),
	Deps = require("../deps");

var Section =
module.exports = Binding.React.extend({
	constructor: function(ctx, path, onRow, inverted) {
		this.path = path;
		this.ctx = ctx;
		this.onRow = onRow;
		this.inverted = !!inverted;

		Binding.React.call(this);
	},

	dependOnLength: function(model) {
		if (!Deps.active) return this;

		var dep = new Deps.Dependency,
			self = this;

		model.observe("length", onChange);

		function onChange(s) {
			if ((self.inverted && s.value > 0) ||
				(!self.inverted && s.value === 0)) dep.changed();
		}

		Deps.currentComputation.onInvalidate(function() {
			model.stopObserving("length", onChange);
		});

		dep.depend();
		return this;
	},

	dependOnModel: function(model) {
		if (!Deps.active) return this;
		
		var dep = new Deps.Dependency,
			self = this,
			value = model.value;

		model.observe("*", onChange);

		function onChange() {
			dep.changed();
		}

		Deps.currentComputation.onInvalidate(function() {
			model.stopObserving("*", onChange);
		});

		dep.depend();
		return this;
	},

	render: function() {
		var model, val, isEmpty;

		model = this.ctx.findModel(this.path).getModel(this.path);
		val = model.handle("toArray");
		if (!_.isArray(val)) val = model.get();
		if (_.isFunction(val)) val = val.call(this.ctx);
		isEmpty = Section.isEmpty(val);

		if (isEmpty && this.inverted) {
			if (_.isArray(val)) this.dependOnLength(model);
			return this.onRow(model, 0);
		} else if (!isEmpty && !this.inverted) {
			if (_.isArray(val)) {
				this.dependOnLength(model);
				return new Binding.Each(this.onRow.bind(this), model);
			} else {
				return this.onRow(model, 0);
			}
		} else {
			this.dependOnModel(model);
		}
	}
}, {
	isEmpty: function(val) {
		return !val || (_.isArray(val) && !val.length);
	}
});