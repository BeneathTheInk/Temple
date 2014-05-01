var parse = require("./parse"),
	util = require("./util"),
	_ = require("underscore"),
	NODE_TYPE = parse.NODE_TYPE;

exports.setTemplate = function(template) {
	if (_.isString(template)) template = parse(template);
	this._template = template;
	return this;
}

exports.paint = function() {
	this.render();
}

exports.toHTML = function() {
	this.paint();
	
	var div = document.createElement("div");
	
	for (var i in this.nodes) {
		div.appendChild(this.nodes[i].cloneNode(true));
	}

	return div.innerHTML.trim();
}

exports.render = function() {
	if (this._rendered) return this.nodes;
	this.nodes = this._buildElements(this._template);
	this._rendered = true;
	this.emit("render", this.nodes);
	return this;
}

exports._buildElements = function(tree, ctx) {
	if (ctx == null) ctx = this.scope();

	return tree.map(function(node) {
		var build = _build.element[node.type];
		if (build != null) return build.call(this, node, ctx);
		console.log(node);
	}, this).reduce(function(nodes, node) {
		return nodes.concat(Array.isArray(node) ? _.flatten(node) : node);
	}, []).filter(function(c) {
		return c != null;
	});
}

exports._buildAttribute = function(nodes, ctx) {
	return nodes.map(function(node) {
		var build = _build.attribute[node.type];
		if (build != null) return build.call(this, node, ctx);
		console.log(node);
	}, this).join("");
}

var _build = {
	element: {},
	attribute: {}
}

_build.element[ NODE_TYPE.ELEMENT ] = function(node, ctx) {
	var el = document.createElement(node.name);
	
	node.attributes.forEach(function(attr) {
		el.setAttribute(attr.name, this._buildAttribute(attr.children, ctx));
	}, this);

	this._buildElements(node.children, ctx).forEach(function(child) {
		el.appendChild(child);
	});

	return el;
}

_build.element[ NODE_TYPE.TEXT ] = function(node, ctx) {
	return document.createTextNode(node.value);
}

_build.element[ NODE_TYPE.INTERPOLATOR ] = function(node, ctx) {
	var val = ctx.get(node.value);
	return document.createTextNode(val == null ? "" : val);
}

_build.element[ NODE_TYPE.TRIPLE ] = function(node, ctx) {
	var val = ctx.get(node.value),
		div = document.createElement("div"),
		children = [], i;

	div.innerHTML = val == null ? "" : val;

	for (i = 0; i < div.childNodes.length; i++) {
		children.push(div.childNodes[i]);
	}

	return children;
}

_build.element[ NODE_TYPE.SECTION ] = function(node, ctx) {
	var self = this, els = [];

	processSection(ctx, node.value, function(nctx) {
		els.push(self._buildElements(node.children, nctx));
	});

	return els;
}

_build.element[ NODE_TYPE.INVERTED ] = function(node, ctx) {
	if (isEmptySection(ctx.get(node.value)))
		return this._buildElements(node.children, ctx);
}

_build.attribute[ NODE_TYPE.TEXT ] = function(node, ctx) {
	return node.value;
}

_build.attribute[ NODE_TYPE.INTERPOLATOR ] = function(node, ctx) {
	var val = ctx.get(node.value);
	return val != null ? _.escape(val) : "";
}

_build.attribute[ NODE_TYPE.SECTION ] = function(node, ctx) {
	var self = this, els = [];

	processSection(ctx, node.value, function(nctx) {
		els.push(self._buildAttribute(node.children, nctx));
	});

	return els.join("");
}

function isEmptySection(val) {
	return !val || (_.isArray(val) && !val.length);
}

function processSection(ctx, path, fn) {
	var val = ctx.get(path);
	if (isEmptySection(val)) return false;

	if (_.isArray(val)) {
		val.forEach(function(v, index) {
			var nctx = ctx.spawn(v);
			nctx.hidden.$index = index;
			fn(nctx);
		});
	} else {
		fn(ctx.spawn(val));
	}

	return true;
}