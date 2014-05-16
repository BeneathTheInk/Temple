var parse = require("../parse"),
	util = require("../util"),
	_ = require("underscore"),
	NODE_TYPE = require("../types");

var Binding = exports.Binding = require("./binding");

// parses and sets the template data
exports.setTemplate = function(template) {
	if (_.isString(template)) template = parse(template);
	this._template = template;
	return this;
}

// creates and renders DOM bindings and attaches them to the DOM
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

// creates the DOM bindings for the template
exports.render = function() {
	if (this.rendered) return this;
	this._bindings = Binding.buildDOM(this._template, this);
	this.rendered = true;
	return this;
}

// forces the binding tree to re-render everything
exports.update = function() {
	this._bindings.forEach(function(binding) { binding.update(this); }, this);
	return this;
}

// removes the bindings from the DOM and destroys them
exports.takedown = function() {
	if (!this.rendered) return;
	this._bindings.forEach(function(binding) { binding.destroy(); });
	delete this._bindings;
	this.rendered = false;
	return this;
}

// finds the first element that matches selector
exports.find = function(selector) {
	var i, k, binding, node, queryResult;

	for (i in this._bindings) {
		binding = this._bindings[i];

		for (k in binding.nodes) {
			node = binding.nodes[k];
			if (util.matchSelector(node, selector)) return node;
			if (queryResult = node.querySelector(selector)) return queryResult;
		}
	}

	return null;
}

// finds all elements that match selector
exports.findAll = function(selector) {
	var i, k, binding, node, queryResult,
		matches = [];

	for (i in this._bindings) {
		binding = this._bindings[i];

		for (k in binding.nodes) {
			node = binding.nodes[k];
			
			if (util.matchSelector(node, selector)) {
				matches.push(node);
			}
			
			if (queryResult = node.querySelectorAll(selector)) {
				matches = matches.concat(_.toArray(queryResult));
			}
		}
	}

	return matches;
}

// creates a decorator
exports.decorate = function(name, fn) {
	if (!_.isString(name) || name === "") throw new Error("Expecting non-empty string for decorator name.");
	if (!_.isFunction(fn)) throw new Error("Expecting function for decorator.");
	this._decorators[name] = fn;
	return this;
}

// removes a decorator
exports.stopDecorating = function(name) {
	if (name != null) delete this._decorators[name];
	else this._decorators = {};
	return this;
}