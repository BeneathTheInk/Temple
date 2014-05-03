var parse = require("../parse"),
	util = require("../util"),
	_ = require("underscore"),
	NODE_TYPE = require("../types");

var Binding = exports.Binding = require("./binding");

exports.setTemplate = function(template) {
	if (_.isString(template)) template = parse(template);
	this._template = template;
	return this;
}

exports.paint = function(parent, beforeNode) {
	this.render().update();

	if (parent != null) {
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = document.querySelector(beforeNode);
		this._bindings.forEach(function(binding) {
			binding.appendTo(parent, beforeNode);
		});
	}

	return this;
}

exports.toHTML = function() {
	
}

exports.render = function() {
	if (this.rendered) return this;

	this._bindings = Binding.buildDOM(this._template);

	this.rendered = true;
	return this;
}

exports.update = function() {
	this._bindings.forEach(function(binding) {
		binding.update(this.scope());
	}, this);
	return this;
}