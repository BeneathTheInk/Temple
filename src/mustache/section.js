var _ = require("underscore"),
	Binding = require("../binding"),
	util = require("../util"),
	Model = require("../model"),
	Deps = require("../deps");

var Section =
module.exports = Binding.Scope.extend({
	constructor: function(value, onRow, inverted) {
		if (!_.isFunction(value))
			throw new Error("Expecting function for section value.");

		if (!_.isFunction(onRow))
			throw new Error("Expecting function for section onRow.");

		this.value = value;
		this.onRow = onRow;
		this.inverted = !!inverted;

		Binding.Scope.call(this);
	},

	dependOnLength: function(model) {
		if (!Deps.active) return this;

		var dep = new Deps.Dependency,
			self = this;

		model.on("change", onChange);

		function onChange(s) {
			if (s.keypath.length !== 1 || s.keypath[0] !== "length") return;
			
			if ((self.inverted && s.value > 0) ||
				(!self.inverted && s.value === 0)) dep.changed();
		}

		Deps.currentComputation.onInvalidate(function() {
			model.off("change", onChange);
		});

		dep.depend();
		return this;
	},

	dependOnModel: function(model) {
		if (!Deps.active) return this;
		
		var dep = new Deps.Dependency,
			self = this,
			value = model.value;

		model.on("change", onChange);

		function onChange(s) {
			if (s.keypath.length !== 1) return;
			dep.changed();
		}

		Deps.currentComputation.onInvalidate(function() {
			model.off("change", onChange);
		});

		dep.depend();
		return this;
	},

	makeBinding: function(model) {
		var binding = new Binding.Scope(model),
			self = this;

		binding.render = function() { return self.onRow(this, 0); }
		
		return binding;
	},

	render: function() {
		var model = this.value(),
			val, isEmpty;
		
		// must return a model
		if (!Model.isModel(model)) return;

		val = model.handle("toArray");
		if (!_.isArray(val)) val = model.get();
		if (_.isFunction(val)) val = val.call(this);
		isEmpty = Section.isEmpty(val);

		if (isEmpty && this.inverted) {
			if (_.isArray(val)) this.dependOnLength(model);
			return this.makeBinding(model);
		} else if (!isEmpty && !this.inverted) {
			if (_.isArray(val)) {
				this.dependOnLength(model);
				return new Binding.Each(this.onRow.bind(this), model);
			} else {
				return this.makeBinding(model);
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