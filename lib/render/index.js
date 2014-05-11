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
	var scope = this.scope();
	this._bindings.forEach(function(binding) { binding.update(scope); });
	return this;
}

exports.takedown = function() {
	if (!this.rendered) return;
	this._bindings.forEach(function(binding) { binding.destroy(); });
	delete this._bindings;
	this.rendered = false;
	return this;
}

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