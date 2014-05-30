var parse = require("./parse"),
	util = require("./util"),
	_ = require("underscore"),
	NODE_TYPE = require("./types");

var Binding = require("./binding");

// parses and sets the root template
exports.setTemplate = function(template) {
	if (_.isString(template)) template = parse(template);
	
	if (!_.isObject(template) || template.type !== NODE_TYPE.ROOT)
		throw new Error("Expecting string or parsed template.");

	this._template = template;
	return this;
}

// adds a binding to be matched when rendering
exports.registerBinding = function(binding) {
	if (!(binding.prototype instanceof Binding))
		throw new Error("Expecting a subclass of Binding.");

	this.bindings.push(binding);
	return this;
}

// returns the binding class that matches
exports._findBinding = function(template, options) {
	var binding, self = this;

	// first try locally
	binding = _.find(this.bindings, function(b) {
		return b.match(template, self, options);
	});

	// then look through global defaults
	if (binding == null) {
		binding = _.find(Binding._defaultBindings, function(b) {
			return b.match(template, self, options);
		});
	}

	return binding;
}

// returns a new binding instance
exports.createBinding = function(template, options) {
	var ctor = this._findBinding(template, options);
	if (ctor == null) throw new Error("Couldn't find a binding class to match this template.");
	return new ctor(template, this, options);
}

// creates and renders DOM bindings and attaches them to the DOM
exports.paint = function(parent, beforeNode) {
	if (this._binding == null) {
		if (this._template == null) throw new Error("Expected a template to be set before painting.");
		this._binding = this.createBinding(this._template, { type: "dom" });
		this.emit("render", this._binding);
	}

	this.update();

	if (parent != null) {
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		this._binding.appendTo(parent, beforeNode);
		this.emit("paint", parent, beforeNode);
	}

	return this;
}

// forces the binding tree to re-render everything
exports.update = function() {
	if (this._binding == null) return;
	this._binding.update(this);
	this.emit("update");
	return this;
}

// removes the bindings from the DOM and destroys them
exports.erase = function() {
	if (this._binding == null) return;
	this._binding.destroy()
	delete this._binding;
	this.emit("erase");
	return this;
}

// finds the first element that matches selector
exports.find = function(selector) {
	var k, node, queryResult,
		binding = this._binding;

	for (k in binding.nodes) {
		node = binding.nodes[k];
		if (util.matchSelector(node, selector)) return node;
		if (queryResult = node.querySelector(selector)) return queryResult;
	}

	return null;
}

// finds all elements that match selector
exports.findAll = function(selector) {
	var k, node, queryResult,
		binding = this._binding,
		matches = [];

	for (k in binding.nodes) {
		node = binding.nodes[k];
		
		if (util.matchSelector(node, selector)) {
			matches.push(node);
		}
		
		if (queryResult = node.querySelectorAll(selector)) {
			matches = matches.concat(_.toArray(queryResult));
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