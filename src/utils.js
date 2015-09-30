import * as _	from "underscore";
import merge from "plain-merge";

// like underscore's result, but pass arguments through
export function result(object, property) {
	var value = object == null ? void 0 : object[property];
	return _.isFunction(value) ? value.apply(object, Array.prototype.slice.call(arguments, 2)) : value;
}

// tests value as pojo (plain old javascript object)
export var isPlainObject = require("is-plain-object");

// tests function as a subclass of a parent function
// here, a class is technically a subclass of itself
export function isSubClass(parent, fn) {
	return fn === parent || (fn != null && fn.prototype instanceof parent);
}

// like jQuery's empty(), removes all children
export function emptyNode(node) {
	while (node.lastChild) node.removeChild(node.lastChild);
	return node;
}

// inserts an array nodes into a parent
export function insertNodes(nodes, parent, before) {
	var node, next, i;

	// we do it backwards so nodes don't get moved if they don't need to
	for (i = nodes.length - 1; i >= 0; i--) {
		node = nodes[i];
		next = nodes[i + 1] || before;

		if (node.nextSibling !== before) {
			parent.insertBefore(node, next);
		}
	}
}

// cleans html, then converts html entities to unicode
export var decodeEntities = (function() {
	if (typeof document === "undefined") return;

	// this prevents any overhead from creating the object each time
	var element = document.createElement('div');
	var entity = /&(?:#x[a-f0-9]+|#[0-9]+|[a-z0-9]+);?/ig;

	return function decodeHTMLEntities(str) {
		str = str.replace(entity, function(m) {
			element.innerHTML = m;
			return element.textContent;
		});

		emptyNode(element);

		return str;
	};
})();

// convert html into DOM nodes
export function toString(value) {
	if (typeof value !== "string") {
		value = value != null ? value.toString() : "";
	}

	return value;
}

export function matches(node, selector) {
	if (_.isArray(selector)) return selector.some(function(s) {
		return matches(node, s);
	});

	if (selector instanceof window.Node) {
		return node === selector;
	}

	if (typeof selector === "function") {
		return !!selector(node);
	}

	if (node.nodeType === window.Node.ELEMENT_NODE) {
		return require("matches-selector")(node, selector);
	}

	return false;
}

export function hash(str) {
	var h = 0, i, chr, len;

	if (str.length === 0) return h;

	for (i = 0, len = str.length; i < len; i++) {
		chr = str.charCodeAt(i);
		h = ((h << 5) - h) + chr;
		h |= 0; // Convert to 32bit integer
	}

	return h;
}

export function getPropertyFromClass(obj, prop) {
	// get all the class prototypes that make up this
	var val;
	let proto = Object.getPrototypeOf(obj);
	while (proto) {
		if (proto.constructor) val = merge.defaults(val, proto.constructor[prop]);
		proto = Object.getPrototypeOf(proto);
	}

	return val;
}
