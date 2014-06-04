var util = require("./util"),
	_ = require("underscore"),
	Binding = require("./binding");

exports.forceUpdate = function() {
	if (this.binding != null) this.binding.render(this);
	return this;
}

exports.paint = function(parent, beforeNode) {
	if (this.binding == null) {
		this.binding = this.render();
		this.forceUpdate();
		this.emit("render", this.binding);
	}

	if (parent != null) {
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		this.binding.appendTo(parent, beforeNode);
		this.emit("paint", parent, beforeNode);
	}

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

exports.toHTML = function() {
	var binding, html;

	binding = this.render();
	html = binding.toString();
	binding.destroy();
	
	return html;
}

// // finds the first element that matches selector
// exports.find = function(selector) {
// 	var k, node, queryResult,
// 		binding = this._binding;

// 	for (k in binding.nodes) {
// 		node = binding.nodes[k];
// 		if (util.matchSelector(node, selector)) return node;
// 		if (queryResult = node.querySelector(selector)) return queryResult;
// 	}

// 	return null;
// }

// // finds all elements that match selector
// exports.findAll = function(selector) {
// 	var k, node, queryResult,
// 		binding = this._binding,
// 		matches = [];

// 	for (k in binding.nodes) {
// 		node = binding.nodes[k];
		
// 		if (util.matchSelector(node, selector)) {
// 			matches.push(node);
// 		}
		
// 		if (queryResult = node.querySelectorAll(selector)) {
// 			matches = matches.concat(_.toArray(queryResult));
// 		}
// 	}

// 	return matches;
// }

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