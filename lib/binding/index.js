var _ = require("underscore"),
	Deps = require("../deps"),
	NODE_TYPE = require("../types");

var Binding =
module.exports = function(template, temple, options) {
	this.template = template;
	this.temple = temple;
	this.initialize.call(this, template, options);
}

Binding.extend = require("../util").subclass;

Binding.prototype.create = function(template, options) {
	if (_.isArray(template)) return template.map(function(t) {
		return this.create(t, options);
	}, this);

	if (this.temple == null) throw new Error("Expecting instance of temple to create bindings with.");
	return this.temple.createBinding(template, options);
}

// methods every child class should have
Binding.prototype.initialize = function(template, options) {}
Binding.prototype.update = function(scope) {}
Binding.prototype.destroy = function() {}

// determines if the binding should be used
Binding.match = function() { return false; }

// Base Text Binding class
Binding.Text = Binding.extend({
	constructor: function() {
		this.value = "";
		Binding.apply(this, arguments);
	}
});

// Base DOM Binding class
Binding.DOM = Binding.extend({
	constructor: function() {
		this.nodes = [];
		Binding.apply(this, arguments);
	},

	// update fires up an autorun context for a live dom
	update: function(scope) {
		var self = this;
		if (this._comp != null) this._comp.stop();
		this._comp = Deps.autorun(function(comp) {
			self.render(scope, comp);
			comp.onInvalidate(function() {
				if (comp.stopped) delete self._comp;
			});
		});
		return this;
	},

	// refresh takes data and makes sure the binding is up to date
	render: function(scope) {},

	// place the nodes here; update() will continue in place
	appendTo: function(parent, before) {
		this.nodes.forEach(function(node) {
			parent.insertBefore(node, before);
		}, this);

		return this;
	},

	// remove it from dom, but don't destroy
	detach: function() {
		var frag = document.createDocumentFragment();
		return this.appendTo(frag);
	},

	// destroy completely... sort of...
	destroy: function() {
		if (this._comp != null) this._comp.stop();
		this.detach();
		delete this.nodes;
		return this;
	}
});

Binding._defaultBindings = [];

// load binding classes
[	require("./root"),
	require("./text"),
	require("./element"),
	require("./attribute"),
	require("./interpolator"),
	require("./triple"),
	require("./section"),
	require("./partial")

].forEach(function(b) {
	if (_.isArray(b)) Binding._defaultBindings = Binding._defaultBindings.concat(b);
});