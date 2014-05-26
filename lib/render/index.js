var parse = require("../parse"),
	util = require("../util"),
	_ = require("underscore"),
	NODE_TYPE = require("../types");

var Binding = require("./binding");

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
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		this._bindings.forEach(function(binding) {
			binding.appendTo(parent, beforeNode);
		});
		this.emit("paint", parent, beforeNode);
	}

	return this;
}

// creates the DOM bindings for the template
exports.render = function() {
	if (this._bindings != null) return this;
	this._bindings = Binding.buildDOM(this._template, this);
	this.emit("render");
	return this;
}

// forces the binding tree to re-render everything
exports.update = function() {
	if (this._bindings == null) return;
	this._bindings.forEach(function(binding) { binding.update(this); }, this);
	this.emit("update");
	return this;
}

// removes the bindings from the DOM and destroys them
exports.erase = function() {
	if (this._bindings == null) return;
	this._bindings.forEach(function(binding) { binding.destroy(); });
	delete this._bindings;
	this.emit("erase");
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
	if (_.isObject(name) && fn == null) {
		_.each(name, function(fn, n) { this.decorate(n, fn); }, this);
		return this;
	}

	if (!_.isString(name) || name === "") throw new Error("Expecting non-empty string for decorator name.");
	if (!_.isFunction(fn)) throw new Error("Expecting function for decorator.");
	
	if (this._decorators[name] == null) this._decorators[name] = [];
	this._decorators[name].push(fn);
	
	return this;
}

// removes a decorator
exports.stopDecorating = function(name, fn) {
	if (_.isFunction(name) && fn == null) {
		fn = name;
		name = null;
	}

	if (name == null && fn == null) this._decorators = {};
	else if (fn == null) delete this._decorators[name];
	else if (name == null) {
		_.each(this._decorators, function(d, n) {
			this._decorators[n] = _.without(d, fn);
		}, this);
	} else {
		var d = this._decorators[name], index;
		
		if (_.isArray(d)) {
			index = d.indexOf(fn);
			if (index > -1) d.splice(index, 1);
		}
	}

	return this;
}

exports.toHTML = function() {
	var bindings = Binding.buildDOM(this._template, this),
		div = document.createElement("div"),
		html;
	
	bindings.forEach(function(b) {
		b.update(this);
		b.appendTo(div);
	}, this);

	html = div.innerHTML;

	bindings.forEach(function(b) {
		b.destroy();
	});

	return html;
}