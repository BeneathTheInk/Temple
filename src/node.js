var Binding = require("./binding"),
	util = require("./util");

var delegateEventSplitter = /^(\S+)\s*(.*)$/;

var Node =
exports.Node = Binding.extend({
	updateNodes: function() {
		var parentNode = this.parentNode,
			beforeNode = this.nextSiblingNode;

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

	prop: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.prop(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return this.node[name];
		else this.node[name] = value;

		return this;
	},

	addEventListener: function(type, sel, listener, options) {
		var self = this;
		
		// syntax: addEventListener({ "type selector": listener }, options)
		if (util.isObject(type)) {
			util.each(type, function(v, n) {
				var m = n.match(delegateEventSplitter);
				this.addEventListener(m[1], m[2], v, sel);
			}, this);
			
			return this;
		}

		// syntax: addEventListener(type, listener, options)
		if (typeof sel === "function") {
			if (options == null) options = listener;
			listener = sel;
			sel = null;
		}

		options = options || {};

		if (typeof type !== "string" || type === "") {
			throw new Error("Expecting non-empty string event name.");
		}

		if (typeof listener !== "function") {
			throw new Error("Expecting function for listener.");
		}

		if (this._eventListeners == null) this._eventListeners = [];
		this._eventListeners.push({ type: type, listener: listener, event: eventListener, options: options });
		this.node.addEventListener(type, eventListener);

		return this;

		function eventListener(e) {
			var delegate;

			if (typeof sel === "string" && sel !== "") {
				delegate = util.closest(e.target, sel);
				if (!delegate) return;
			}

			if (options.once) self.removeEventListener(type, listener);
			listener.call(options.context || self, e, delegate);
		}
	},

	addEventListenerOnce: function(type, sel, listener, options) {
		if (util.isObject(type)) {
			return this.addEventListener(type, _.extend({ once: true }, sel || {}));
		}

		if (typeof sel === "function") {
			if (options == null) options = listener;
			listener = sel;
			sel = null;
		}
		
		return this.addEventListener(type, sel, listener, _.extend({ once: true }, options || {}));
	},

	removeEventListener: function(type, listener) {
		if (this._eventListeners == null) return this;

		var evts = [];

		if (typeof type === "function" && listener == null) {
			listener = type;
			type = null;
		}

		if (util.isObject(type)) {
			util.each(type, function(v, n) {
				var m = n.match(delegateEventSplitter);
				evts.push.apply(evts, this._eventListeners.filter(function(e) {
					return e.type === m[1] && e.listener === v && !~evts.indexOf(e);
				}));
			}, this);
		} else {
			evts = this._eventListeners.filter(function(e) {
				return (type == null || type === e.type) && (listener == null || listener === e.listener);
			});
		}

		evts.forEach(function(e) {
			var index = this._eventListeners.indexOf(e);

			if (~index) {
				this.node.removeEventListener(e.type, e.event);
				this._eventListeners.splice(index, 1);
			}
		}, this);

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

function leafNode(nodeType, methodName, humanType) {
	return Node.extend({
		constructor: function(nodeOrValue) {
			// text node
			if (nodeOrValue instanceof window.Node && nodeOrValue.nodeType === nodeType) {
				this.node = nodeOrValue;
				this.value = nodeOrValue.nodeValue;
			}

			// anything else
			else {
				this.node = document[methodName]("");
				this.setValue(nodeOrValue);
			}

			Node.call(this);
		},

		insertBefore: function() {
			throw new Error(humanType + " bindings can't have children.");
		},

		setValue: function(value) {
			value = value != null ? value.toString() : "";
			if (value !== this.node.nodeValue) this.node.nodeValue = value;
			this.value = value;
			return this;
		},

		toString: function() {
			return this.node.nodeValue;
		}
	});
}

var Text = exports.Text = leafNode(3, "createTextNode", "Text");
var Comment = exports.Comment = leafNode(8, "createComment", "Comment");

Comment.prototype.toString = function() {
	return "<!--" + this.node.nodeValue + "-->";
}

var Element =
exports.Element = Node.extend({
	constructor: function(nodeOrTagName) {
		var children = util.toArray(arguments).slice(1);

		// element
		if (nodeOrTagName instanceof window.Node && nodeOrTagName.nodeType === 1) {
			this.node = nodeOrTagName;
			this.tagname = nodeOrTagName.tagName.toLowerCase();

			// add child nodes as further children
			// note: this may affect the original node's children
			fromNode(util.toArray(nodeOrTagName.childNodes))
				.forEach(function(b) { children.push(b); });
		}

		// string
		else if (typeof nodeOrTagName === "string") {
			this.tagname = nodeOrTagName;
			this.node = document.createElement(nodeOrTagName);
		}

		// or error
		else throw new Error("Expecting string for element tag name.");

		// run parent contstructor
		Node.apply(this, children);

		// apply events
		var events = typeof this.events === "function" ? this.events.call(this) : this.events;
		if (util.isObject(events)) this.addEventListener(events);
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
			this.node.classList.add(className.split(" "));
		}, this);

		return this;
	},

	removeClass: function() {
		util.flatten(util.toArray(arguments)).forEach(function(className) {
			this.node.classList.remove(className.split(" "));
		}, this);

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
	},

	toString: function() {
		return this.node.outerHTML;
	}
});

// fast constructors for typical DOM element tagnames
exports.DOM = {};

[ // HTML tagnames; this list is taken from FB's React

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
			var args = util.toArray(arguments);
			args.unshift(t);
			Element.apply(this, args);
		}
	});
});

// converts dom nodes into binding equivalents
var fromNode =
exports.fromNode = function(node) {
	if (Array.isArray(node)) {
		return node.map(fromNode)
			.filter(function(b) { return b != null; });
	}

	switch (node.nodeType) {
		// Element
		case 1: return new Element(node);
		
		// Text Node
		case 3: return new Text(node);
		
		// Comment Node
		case 8: return new Comment(node);

		// Document Fragment
		case 11:
			var binding = new Binding;

			fromNode(util.toArray(node.childNodes))
				.forEach(binding.appendChild, binding);

			return binding;
	}
}

// converts a string of HTML into a set of static bindings
exports.fromHTML = function(html) {
	var cont, nodes;
	cont = document.createElement("div")
	cont.innerHTML = html;
	nodes = util.toArray(cont.childNodes);
	return fromNode(nodes.length === 1 ? nodes[0] : new Binding().append(nodes));
}

// converts a simple css selector to an element binding
exports.fromSelector = function(sel) {
	if (typeof sel !== "object") {
		sel = util.parseSelector(sel);
	}

	var el = new Element(sel.tagname);
	if (sel.id != null) el.prop("id", sel.id);
	el.addClass(sel.classes);
	el.attr(sel.attributes);
	el.append(util.toArray(arguments).slice(1));

	return el;
}