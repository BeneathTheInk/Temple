import * as _ from "lodash";
import * as idom from "incremental-dom/index.js";
import { notifications } from "incremental-dom/src/notifications";
import { getContext } from "incremental-dom/src/context";
import { updateAttribute } from 'incremental-dom/src/attributes';
import { getData } from 'incremental-dom/src/node_data';
import * as utils from "./utils";
import Trackr from "trackr";

export * from "incremental-dom/index.js";
export { updateAttribute, getContext, getData };

export function autotext(fn, ctx) {
	var node = idom.text("");

	function renderText(c) {
		c.node = node;
		var data = getData(node);
		var value = utils.toString(fn.call(ctx, node));
		if (data.text !== value) node.data = data.text = value;
	}

	return Trackr.autorun(renderText);
}

export function autoelement(node, fn, ctx) {
	fn = fn.bind(ctx, node);
	return Trackr.autorun(function(c) {
		c.element = node;
		if (getContext()) fn();
		else idom.patch(node, fn);
	});
}

export function renderElement(tagname, key, body, ctx) {
	let node = idom.elementOpen(tagname, key);
	let comp = autoelement(node, body, ctx);
	idom.elementClose(tagname);
	return comp;
}

var execDeletedCallbacks = function(node) {
	let data = getData(node);
	let cbs = data.deletedCallbacks;
	if (!cbs) return;
	cbs.splice(0, cbs.length).forEach(function(fn) {
		fn.call(null, node);
	});
};

notifications.nodesDeleted = function(nodes) {
	_.forEach(nodes, (node) => {
		if (node.childNodes) notifications.nodesDeleted(node.childNodes);
		execDeletedCallbacks(node);
	});
};

export function onDestroy(node, fn) {
	if (typeof fn !== "function") {
		throw new Error("Expecting function.");
	}

	let data = getData(node);
	if (!data.deletedCallbacks) data.deletedCallbacks = [];
	data.deletedCallbacks.push(fn);
}

export function removeDestroyListener(node, fn) {
	let data = getData(node);
	if (data.deletedCallbacks) {
		data.deletedCallbacks = _.without(data.deletedCallbacks, fn);
	}
}

// // export every key in idom
// (function(doExport) {
// 	for (var k of Object.keys(idom)) doExport(k);
// })(function(k) {
// 	if (typeof exports[k] === "undefined") {
// 		Object.defineProperty(exports, k, {
// 			enumerable: true,
// 			get: function() { return idom[k]; }
// 		});
// 	}
// });

// export function patchElement(el, fn) {
// 	let ictx = getContext();
//
// 	if (ictx) {
// 		let walker = ictx.walker;
// 		walker.getCurrentParent().insertBefore(el, walker.currentNode);
// 		walker.currentNode = el;
//
// 		firstChild();
// 		fn();
// 		parentNode();
// 		clearUnvisitedDOM(el);
// 		nextSibling();
// 	} else {
// 		idom.patch(el, fn);
// 	}
// }

// function renderHTML(node) {
// 	if (node.type == "text") {
// 		return idom.text(node.content);
// 	}
//
// 	if (node.type == "tag") {
// 		var argsArray = [node.name, null, null];
//
// 		// convert attrs into a flat array
// 		for (var attr in node.attrs) {
// 			argsArray.push(attr);
// 			argsArray.push(node.attrs[attr]);
// 		}
//
// 		if (node.voidElement) {
// 			return idom.elementVoid.apply(idom, argsArray);
// 		} else {
// 			idom.elementOpen.apply(idom, argsArray);
//
// 			for (var i = 0; i < node.children.length; i++) {
// 				renderHTML(node.children[i]);
// 			}
//
// 			return idom.elementClose(node.name);
// 		}
// 	}
// }

// export function html(src) {
// 	var tree = parseHTML("<div>" + src + "</div>");
// 	if (_.isArray(tree)) tree = tree[0];
// 	return tree.children.map(renderHTML);
// }

// export function section(inverted, val, fn) {
// 	let proxy = proxies.getByTarget(val, [ "empty", "section" ]);
// 	let isEmpty = Boolean(proxies.run(proxy, "empty", val));
//
// 	if (inverted && isEmpty) {
// 		fn(val);
// 	} else if (!inverted && !isEmpty) {
// 		proxies.run(proxy, "section", val, fn);
// 	}
// }

export function updateProperty(el, name, value) {
	var data = getData(el);
	var attrs = data.attrs;

	if (attrs[name] === value) {
		return;
	}

	el[name] = value;
	attrs[name] = value;
}
