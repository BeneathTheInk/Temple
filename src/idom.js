import * as _ from "underscore";
import * as idom from "./incremental-dom";
import { getContext } from "./incremental-dom/src/context";
import { firstChild, nextSibling, parentNode, } from './incremental-dom/src/traversal';
import { clearUnvisitedDOM } from './incremental-dom/src/alignment';
import { updateAttribute } from './incremental-dom/src/attributes';
import { getData } from './incremental-dom/src/node_data';
import { parse as parseHTML } from "html-parse-stringify";
import * as proxies from "./proxies";

export { updateAttribute, getContext, getData };

// export every key in idom
(function(doExport) {
	for (var k of Object.keys(idom)) doExport(k);
})(function(k) {
	if (typeof exports[k] === "undefined") {
		Object.defineProperty(exports, k, {
			enumerable: true,
			get: function() { return idom[k]; }
		});
	}
});

export function patchElement(el, fn) {
	let ictx = getContext();

	if (ictx) {
		let walker = ictx.walker;
		walker.getCurrentParent().insertBefore(el, walker.currentNode);
		walker.currentNode = el;

		firstChild();
		fn();
		parentNode();
		clearUnvisitedDOM(el);
		nextSibling();
	} else {
		idom.patch(el, fn);
	}
}

function renderHTML(node) {
	if (node.type == "text") {
		return idom.text(node.content);
	}

	if (node.type == "tag") {
		var argsArray = [node.name, null, null];

		// convert attrs into a flat array
		for (var attr in node.attrs) {
			argsArray.push(attr);
			argsArray.push(node.attrs[attr]);
		}

		if (node.voidElement) {
			return idom.elementVoid.apply(idom, argsArray);
		} else {
			idom.elementOpen.apply(idom, argsArray);

			for (var i = 0; i < node.children.length; i++) {
				renderHTML(node.children[i]);
			}

			return idom.elementClose(node.name);
		}
	}
}

export function html(src) {
	var tree = parseHTML("<div>" + src + "</div>");
	if (_.isArray(tree)) tree = tree[0];
	return tree.children.map(renderHTML);
}

export function section(inverted, val, fn) {
	let proxy = proxies.getByTarget(val, [ "empty", "section" ]);
	let isEmpty = Boolean(proxies.run(proxy, "empty", val));

	if (inverted && isEmpty) {
		fn(val);
	} else if (!inverted && !isEmpty) {
		proxies.run(proxy, "section", val, fn);
	}
}
