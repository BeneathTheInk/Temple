var _ = require("underscore"),
	Binding = require("../binding"),
	util = require("../util"),
	Model = require("../model");

var Section =
module.exports = Binding.extend({
	constructor: function(value, result, inverted) {
		if (!_.isFunction(value)) {
			var val = value;
			value = function() { return val; }
		}

		if (!_.isFunction(result))
			throw new Error("Expecting function for result.");

		this.compute = value;
		this.result = result;
		this.inverted = !!inverted;
		this.binding = null;
		this.type = null;
		this.placeholder = document.createComment(_.uniqueId("$"));

		this.once("destroy", this.destroyBinding);

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Section bindings can't have children.");
	},

	destroyBinding: function() {
		if (this.binding != null) {
			this.binding.destroy();
			delete this.binding;
		}

		return this;
	},

	refreshBinding: function() {
		if (this.binding != null) {
			var parent = this.placeholder.parentNode;
			if (parent != null) this.binding.appendTo(parent, this.placeholder);
		}

		return this;
	},

	render: function(scope) {
		if (this._comp != null) this._comp.stop();
		this._comp = this.autorun(function(comp) {
			var model, val, isEmpty;
			this.destroyBinding();

			model = this.compute(scope);
			if (!Model.isModel(model)) model = new Model(model);
			val = model.get();
			isEmpty = Section.isEmpty(val);

			if (isEmpty && this.inverted) {
				this.binding = new Binding.Context(model, this.result(scope));
			} else if (!isEmpty && !this.inverted) {
				if (_.isArray(val)) this.binding = new Binding.Each(model, this.result.bind(this));
				else this.binding = new Binding.Context(model, this.result(scope));
			}

			if (this.binding != null) {
				this.binding.render(scope);
				this.refreshBinding();
			}
		});

		return this;
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.refreshBinding();
		return this;
	}
}, {
	isEmpty: function(val) {
		return !val || (_.isArray(val) && !val.length);
	}
});