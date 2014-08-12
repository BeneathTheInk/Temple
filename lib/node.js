var Binding = require("./binding"),
	util = require("./util");

var Node =
exports.Node = Binding.extend({
	updateNodes: function() {
		var parentNode = this.parentNode(),
			beforeNode = this.nextSiblingNode();

		// place the node in the dom
		if (parentNode != null && !util.isNodeAtDOMPosition(this.node, parentNode, beforeNode)) {
			parentNode.insertBefore(this.node, beforeNode);
		}

		// or take it out
		else if (parentNode == null && this.node.parentNode != null) {
			this.node.parentNode.removeChild(this.node);
		}

		this.trigger("update");
		return this;
	},

	toNodes: function() {
		return [ this.node ];
	},

	firstNode: function() {
		return this.node;
	},

	find: function() { return null; },
	findAll: function() { return []; }
});

exports.Text = Node.extend({
	constructor: function(value) {
		Node.call(this);
		this.node = document.createTextNode("");
		this.setValue(value);
	},

	insertBefore: function() {
		throw new Error("Text bindings can't have children.");
	},

	setValue: function(value) {
		value = value != null ? value.toString() : "";
		if (value !== this.node.nodeValue) this.node.nodeValue = value;
		return this;
	}
});

var Element =
exports.Element = Node.extend({
	constructor: function(tagname) {
		if (typeof tagname !== "string")
			throw new Error("Expecting string for element tag name.");

		this.tagname = tagname;
		this.node = document.createElement(tagname);

		Node.apply(this, util.toArray(arguments).slice(1));
	},

	getAttribute: function(name) {
		return this.node.getAttribute(name);
	},

	setAttribute: function(name, value) {
		this.node.setAttribute(name, value);
		return this;
	},

	removeAttribute: function(name) {
		this.node.removeAttribute(name);
		return this;
	},

	attr: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.attr(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return this.getAttribute(name);
		else this.setAttribute(name, value);

		return this;
	},

	prop: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.prop(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return this.node[name];
		else this.node[name] = value;

		return this;
	},

	style: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.style(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return getComputedStyle(this.node)[name];
		else this.node.style[name] = value;

		return this;
	},

	hasClass: function(className) {
		return this.node.classList.contains(className);
	},

	addClass: function() {
		util.flatten(util.toArray(arguments)).forEach(function(className) {
			this.node.classList.add(className);
		}, this);

		return this;
	},

	removeClass: function() {
		util.flatten(util.toArray(arguments)).forEach(function(className) {
			this.node.classList.remove(className);
		}, this);

		return this;
	},

	addEventListener: function(type, listener) {
		if (util.isObject(type) && listener == null) {
			util.each(type, function(v, n) { this.addEventListener(n, v); }, this);
			return this;
		}

		this.node.addEventListener(type, listener);
		return this;
	},

	removeEventListener: function(type, listener) {
		if (util.isObject(type) && listener == null) {
			util.each(type, function(v, n) { this.removeEventListener(n, v); }, this);
			return this;
		}

		this.node.removeEventListener(type, listener);
		return this;
	},

	find: function(selector) {
		if (util.matchesSelector(this.node, selector)) return this.node;
		return this.node.querySelector(selector);
	},

	findAll: function(selector) {
		var els = [];
		if (util.matchesSelector(this.node, selector)) els.push(this.node);
		els.push.apply(els, util.toArray(this.node.querySelectorAll(selector)));
		return els;
	}
});

// create typical DOM nodes
exports.DOM = {};

[ // this list is taken from FB's React

"a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi",
"bdo", "big", "blockquote", "body", "br", "button", "canvas", "caption", "cite",
"code", "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn",
"div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer",
"form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "i",
"iframe", "img", "input", "ins", "kbd", "keygen", "label", "legend", "li",
"link", "main", "map", "mark", "menu", "menuitem", "meta", "meter", "nav",
"noscript", "object", "ol", "optgroup", "option", "output", "p", "param", "pre",
"progress", "q", "rp", "rt", "ruby", "s", "samp", "script", "section", "select",
"small", "source", "span", "strong", "style", "sub", "summary", "sup", "table",
"tbody", "td", "textarea", "tfoot", "th", "thead", "time", "title", "tr",
"track", "u", "ul", "var", "video", "wbr"

].forEach(function(t) {
	exports.DOM[t] = Element.extend({
		constructor: function() {
			Element.apply(this, [ t ].concat(util.toArray(arguments)));
		}
	});
});
