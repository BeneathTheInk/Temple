var Binding =
module.exports = function(template) {
	this.template = template;
	this.initialize.apply(this, arguments);
}

Binding.extend = require("../util").subclass;

Binding.buildDOM = function(template) {
	return buildBindings(template, Binding.Node);
}

Binding.buildText = function(template) {
	return buildBindings(template, Binding.Text);
}

function buildBindings(template, bindings) {
	return template.map(function(item) {
		var ctor = bindings[item.type];
		if (ctor) return new ctor(item);
		console.log(item);
	}).filter(function(binding) {
		return binding != null;
	});	
}

// methods every child class should have
Binding.prototype.initialize = function(template) {}
Binding.prototype.update = function(scope) {}
Binding.prototype.destroy = function() {}

// the actual bindings
Binding.Node = require("./node-binding");
Binding.Text = require("./text-binding");