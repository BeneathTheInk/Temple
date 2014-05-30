var parse = require("./parse"),
	util = require("./util"),
	_ = require("underscore");

var Binding = require("./binding");

// adds a binding to be matched when rendering
exports.registerBinding = function(binding) {
	if (!(binding.prototype instanceof Binding))
		throw new Error("Expecting a subclass of Binding.");

	this.bindings.unshift(binding);
	return this;
}

// parses and sets the template data
exports.setTemplate = function(template) {
	if (_.isString(template)) template = parse(template);
	if (!_.isArray(template)) throw new Error("Expecting string or parsed template.");
	this._template = template;
	return this;
}

// creates and renders DOM bindings and attaches them to the DOM
exports.paint = function(parent, beforeNode) {
	this.initBindings().update();

	if (parent != null) {
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		this._rendered.forEach(function(binding) {
			binding.appendTo(parent, beforeNode);
		});
		this.emit("paint", parent, beforeNode);
	}

	return this;
}

// creates the DOM bindings for the template
exports.initBindings = function(options) {
	if (this._rendered != null) return this;
	options = options || {};
	options.bindings = this.bindings;
	this._rendered = Binding.create(this._template, this.bindings, options);
	this.emit("render");
	return this;
}

// forces the binding tree to re-render everything
exports.update = function() {
	if (this._rendered == null) return;
	this._rendered.forEach(function(binding) { binding.update(this); }, this);
	this.emit("update");
	return this;
}

// removes the bindings from the DOM and destroys them
exports.erase = function() {
	if (this._rendered == null) return;
	this._rendered.forEach(function(binding) { binding.destroy(); });
	delete this._rendered;
	this.emit("erase");
	return this;
}

// finds the first element that matches selector
exports.find = function(selector) {
	var i, k, binding, node, queryResult;

	for (i in this._rendered) {
		binding = this._rendered[i];

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

	for (i in this._rendered) {
		binding = this._rendered[i];

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

// exports.setPartial = function(name, partial) {
// 	if (_.isObject(name)) {
// 		_.each(name, function(p, n) { this.setPartial(n, p); }, this);
// 		return this;
// 	}

// 	if (_.isString(partial)) partial = parse(partial);
// 	this._partials[name] = partial;
// 	this.emit("partial:" + name, partial);
	
// 	return this;
// }

// exports.removePartial = function(name) {
// 	delete this._partials[name];
// 	this.emit("partial:" + name);
// 	return this;
// }