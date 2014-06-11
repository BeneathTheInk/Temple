var util = require("./util"),
	_ = require("underscore"),
	Binding = require("./binding"),
	Scope = require("./scope");

exports.forceUpdate = function() {
	if (this.binding != null) this.binding.render(this);
	return this;
}

exports.paint = function(parent, beforeNode) {
	if (this.binding == null) {
		var binding = this.render();
		if (Array.isArray(binding)) binding = new Binding(binding);
		if (!(binding instanceof Binding)) throw new Error("Expecting template render method to return an instance of Binding.");
		this.binding = binding;

		this.forceUpdate();
		this.emit("render", this.binding);
	}

	if (_.isString(parent)) parent = document.querySelector(parent);
	if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
	if (parent == null) parent = document.createDocumentFragment();
	
	this.binding.appendTo(parent, beforeNode);
	this.emit("paint", parent, beforeNode);

	return this;
}

exports.render = function() {
	throw new Error("Missing render method.");
}

exports.erase = function() {
	if (this.binding != null) {
		this.binding.destroy();
		delete this.binding;
		this.emit("erase");
	}

	return this;
}

exports.toString =
exports.toHTML = function() {
	var binding, html;

	binding = this.render();
	binding.render(this);
	html = binding.toString();
	binding.destroy();
	
	return html;
}

exports.find = function(selector) {
	if (this.binding != null) return this.binding.find(selector);
	return null;
}

exports.findAll = function(selector) {
	if (this.binding != null) return this.binding.findAll(selector);
	return [];
}

exports.destroy = function() {
	this.erase();
	return Scope.prototype.destroy.apply(this, arguments);
}