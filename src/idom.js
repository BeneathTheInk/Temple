import * as idom from "./incremental-dom";
import { getContext } from "./incremental-dom/src/context";
import { firstChild, nextSibling, parentNode, markVisited } from './incremental-dom/src/traversal';
import { clearUnvisitedDOM } from './incremental-dom/src/alignment';
import { updateAttribute } from './incremental-dom/src/attributes';
import * as utils from "./utils";
import * as _ from "underscore";
import Trackr from "trackr";
import html from "./html-parser";

export { html, updateAttribute };

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

export function patch(node, fn) {
	let ictx = getContext();

	if (ictx) {
		let walker = ictx.walker;
		walker.getCurrentParent().insertBefore(node, walker.currentNode);
		walker.currentNode = node;

		firstChild();
		fn();
		parentNode();
		clearUnvisitedDOM(node);
		nextSibling();
	} else {
		idom.patch(node, fn);
	}
}

export function autopatch(fn) {
	let ictx = getContext();
	if (!ictx) throw new Error("Autopatch must be run in an autopatch or a normal patch.");

	let nodes = [];
	let ph = document.createTextNode("");
	let frag;
	let comp;
	let patcher = {};

	function reset(n) {
		nodes = [].concat(n).filter(Boolean);
	}

	function run() { reset(fn(patcher)); }

	function injectPlaceholder(parent, before) {
		if (!parent || _.isUndefined(before)) {
			let lastnode = _.last(nodes);
			if (!lastnode) return;

			if (!parent) parent = lastnode.parentNode;
			if (_.isUndefined(before)) before = lastnode.nextSibling;
		}

		// put placeholder as the location to replace nodes
		parent.insertBefore(ph, before);
	}

	function detachPlaceholder() {
		if (ph.parentNode) ph.parentNode.removeChild(ph);
	}

	function detachNodes() {
		// put nodes in fragment
		if (!frag) frag = document.createDocumentFragment();
		if (nodes) utils.insertNodes(nodes, frag);
	}

	function attachNodes() {
		if (!ph.parentNode) return;
		ph.parentNode.insertBefore(frag, ph);
		if (nodes.length) detachPlaceholder();
	}

	patcher.moveTo = function(parent, before) {
		injectPlaceholder(parent, before);
		detachNodes();
		attachNodes();
	};

	patcher.getNodes = function() {
		return nodes.length ? nodes.slice(0) : ph;
	};

	patcher.resetNodes = reset;

	comp = Trackr.autorun(function(c) {
		if (c.firstRun) {
			patcher.stop = c.stop.bind(c);
			patcher.invalidate = c.invalidate.bind(c);

			// render with normal incremental
			run();

			// put in placeholder if there are no nodes
			if (!nodes.length) {
				let walker = ictx.walker;
				let parent = walker.getCurrentParent();
				parent.insertBefore(ph, walker.currentNode);
				markVisited(ph);
			}
		} else {
			injectPlaceholder();
			detachNodes();
			idom.patch(frag, run);
			attachNodes();
		}
	});

	comp.onStop(function() {
		detachNodes();
		detachPlaceholder();
	});

	return patcher;
}

export function decorate(view, name, options) {
	options = options || {};
	let ictx = getContext();
	let el = ictx && ictx.walker.getCurrentParent();

	// look up decorator by name
	let decorators = view.findDecorators(name);

	// render as attribute if no decorators
	if (!decorators.length) {
		if (el && typeof options.string === "function") {
			updateAttribute(el, name, options.string());
		}

		return;
	}

	// render each decorator
	decorators.forEach(function(d) {
		let _comp = Trackr.currentComputation;

		// defer computation because we cannot have unknown changes happening to the DOM
		_.defer(function() {
			let dcomp = Trackr.autorun(function(comp) {
				// assemble the arguments!
				var args = [ _.extend({
					target: el,
					owner: d.context,
					view: view,
					comp: comp,
					options: d.options
				}, options.mixin) ];

				// render arguments based on options
				if (d.options && d.options.parse === "string") {
					if (typeof options.string === "function") args.push(options.string());
				} else if (d.options == null || d.options.parse !== false) {
					if (typeof options["arguments"] === "function") args = args.concat(options["arguments"]());
				}

				// execute the callback
				d.callback.apply(d.context, args);
			});

			// clean up
			if (_comp) {
				if (_comp.stopped || _comp.invalidated) dcomp.stop();
				else _comp.onInvalidate(() => dcomp.stop());
			}
		});
	});

	return true;
}
