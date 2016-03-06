import {toArray,isArray,forEach as _each} from "lodash";
import matchesSelector from "dom-matches";

export function forEach(val, fn, scope) {
	if (val && typeof val.forEach === "function") val.forEach(fn, scope);
	else _each(val, fn, scope);
}

export function map(val, fn, scope) {
	let res = [];
	forEach(val, (v, i, l) => {
		res.push(fn.call(scope, v, i, l));
	});
	return res;
}

// like jQuery's empty(), removes all children
export function emptyNode(node) {
	while (node.lastChild) node.removeChild(node.lastChild);
	return node;
}

var entity = /&(?:#x[a-f0-9]+|#[0-9]+|[a-z0-9]+);?/ig;

export function containsEntities(str) {
	return entity.test(str);
}

// converts html entities to unicode
export var decodeEntities = (function() {
	if (typeof document === "undefined") return;

	// this prevents any overhead from creating the object each time
	var element = document.createElement('div');

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

export function joinValues() {
	return toArray(arguments).map(toString).join("");
}

export function matches(node, selector) {
	if (isArray(selector)) return selector.some(function(s) {
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
