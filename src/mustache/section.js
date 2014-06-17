var _ = require("underscore"),
	Binding = require("../binding"),
	util = require("../util"),
	Model = require("../model"),
	Deps = require("../deps");

var Section =
module.exports = Binding.React.extend({
	constructor: function(value, body, inverted, data) {
		if (!_.isFunction(value))
			throw new Error("Expecting function for section value.");

		if (!_.isFunction(body))
			throw new Error("Expecting function for section body.");

		this.value = value;
		this.body = body;
		this.inverted = !!inverted;

		Binding.React.call(this, null, data);
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
			var b = new Binding(model);
			b.addChild(this.body.call(this, model, 0));
			return b;
		} else if (!isEmpty && !this.inverted) {
			if (_.isArray(val)) {
				this.dependOnLength(model);
				return new Binding.Each(this.body, model);
			} else {
				var b = new Binding(model);
				b.addChild(this.body.call(this, model, 0));
				return b;
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