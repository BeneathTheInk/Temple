import * as _ from "lodash";
import matchesSelector from "matches-selector";
// import merge from "plain-merge";

export function assign() {
	return _.extend.apply(_, arguments);
}

// like jQuery's empty(), removes all children
export function emptyNode(node) {
	while (node.lastChild) node.removeChild(node.lastChild);
	return node;
}

// converts html entities to unicode
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
		return matchesSelector(node, selector);
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
//
// export function getPropertyFromClass(obj, prop) {
// 	var val;
// 	let proto = Object.getPrototypeOf(obj);
//
// 	if (typeof prop === "string" && prop) {
// 		let p = prop;
// 		prop = c => c[p];
// 	}
//
// 	if (typeof prop !== "function") {
// 		throw new Error("Expecting function or string for property.");
// 	}
//
// 	while (proto) {
// 		val = merge.defaults(val, prop(proto.constructor));
// 		proto = Object.getPrototypeOf(proto);
// 	}
//
// 	return val;
// }
