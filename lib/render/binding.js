var Binding =
module.exports = function(template, temple) {
	this.template = template;
	this.temple = temple;
	this.initialize.apply(this, arguments);
}

Binding.extend = require("../util").subclass;

Binding.buildDOM = function(template, temple) {
	return buildBindings(template, temple, Binding.Node);
}

Binding.buildText = function(template, temple) {
	return buildBindings(template, temple, Binding.Text);
}

function buildBindings(template, temple, bindings) {
	return template.map(function(item) {
		var ctor = bindings[item.type];
		if (ctor) return new ctor(item, temple);
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