var _ = require("underscore"),
	Deps = require("../deps");

var Binding =
module.exports = function(template, options) {
	this.template = template;
	this.initialize.apply(this, arguments);
}

Binding.extend = require("../util").subclass;

Binding.create = function(template, bindings, options) {
	if (_.isArray(template)) {
		return template.map(function(item) {
			return Binding.create(item, bindings, options);
		}).filter(function(binding) {
			return binding != null;
		});
	}

	var ctor = _.find(bindings, function(b) {
		return b.match(template, options);
	});

	if (ctor) return new ctor(template, options);
	console.log(template);
}

// methods every child class should have
Binding.prototype.initialize = function(template, options) {}
Binding.prototype.update = function(scope) {}
Binding.prototype.destroy = function() {}
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

Binding._defaultDOMBindings = [];
Binding._defaultTextBindings = [];

// load binding classes
[	require("./text"),
	require("./element"),
	require("./attribute"),
	require("./interpolator"),
	require("./triple"),
	require("./section"),
	require("./partial")

].forEach(function(b) {
	if (b.DOM) Binding._defaultDOMBindings.push(b.DOM);
	if (b.Text) Binding._defaultTextBindings.push(b.Text);
});