var Deps = require("../deps");

var Binding =
module.exports = function(template) {
	this.template = template;
	this.initialize.apply(this, arguments);
}

Binding.extend = require("../util").subclass;

Binding.buildDOM = function(template) {
	return template.map(function(item) {
		var ctor = Binding.Node[item.type];
		if (ctor) return new ctor(item);
		console.log(item);
	}).filter(function(binding) {
		return binding != null;
	});
}

Binding.buildText = function(template) {

}

Binding.prototype.update = function(scope) {
	var self = this;
	if (this._comp != null) this._comp.stop();
	this._comp = Deps.autorun(function(comp) {
		self._update(scope, comp);
		comp.onInvalidate(function() {
			if (comp.stopped) delete self._comp;
		});
	});
	return this;
}

Binding.prototype.destroy = function() {
	if (this._comp != null) this._comp.stop();
	this._destroy();
}

// methods every child class should have
Binding.prototype.initialize = function(template) {}
Binding.prototype._update = function(ctx) {}
Binding.prototype._destroy = function() {}

Binding.Node = require("./node-binding");