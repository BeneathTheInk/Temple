import {forEach,without} from "lodash";
import * as idom from "incremental-dom/index.js";
import { notifications } from "incremental-dom/src/notifications";
import { updateAttribute } from 'incremental-dom/src/attributes';
import { getData } from 'incremental-dom/src/node_data';
import { text as coreText } from 'incremental-dom/src/core';
import * as utils from "./utils";
import Trackr from "trackr";

export * from "incremental-dom/index.js";
export { updateAttribute, getData };

export function autotext(fn, that) {
	var node = coreText();

	function renderText(c) {
		c.node = node;
		var data = getData(node);
		var value = fn.call(that, node);

		if (data.text !== value) {
			data.text = value;
			node.data = utils.toString(value);
		}
	}

	return Trackr.autorun(renderText);
}

export function autoelement(node, fn) {
	return Trackr.autorun(function(c) {
		c.element = node;

		// catch errors that idom likes to throw
		let cur;
		try { cur = idom.currentElement(); }
		catch(e) {}

		// call straight or patch
		if (cur === node) fn(node, c);
		else idom.patch(node, () => fn(node, c));
	});
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
	forEach(nodes, (node) => {
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
		data.deletedCallbacks = without(data.deletedCallbacks, fn);
	}
}

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

export function updateProperty(el, name, value) {
	var data = getData(el);
	var attrs = data.attrs;

	if (attrs[name] === value) {
		return;
	}

	el[name] = value;
	attrs[name] = value;
}
