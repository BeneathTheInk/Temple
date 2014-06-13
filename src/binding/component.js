var _ = require("underscore"),
	Binding = require("./index");

module.exports = Binding.extend({
	constructor: function(view) {
		if (_.isFunction(view)) view = new view();
		if (!(view instanceof require("../temple"))) throw new Error("Expecting subclass or instance of Temple for component.");

		this.view = view;
		this.previousScope = null;

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Component bindings cannot have children.");
	},

	clean: function() {
		if (this.previousScope != null)
			this.view.removeModel(this.previousScope);

		return this;
	},

	render: function(scope) {
		this.clean();
		this.previousScope = scope;
		this.view.addModel(scope);
		this.view.forceUpdate();
		return this;
	},

	appendTo: function(parent, before) {
		this.view.paint(parent, before);
		return this;
	},

	toString: function() {
		return this.view.toString();
	},

	find: function(selector) {
		return this.view.find(selector);
	},

	findAll: function(selector) {
		return this.view.findAll(selector);
	},

	destroy: function() {
		this.clean();
		this.view.erase();
		return Binding.prototype.destroy.apply(this, arguments);
	}
});