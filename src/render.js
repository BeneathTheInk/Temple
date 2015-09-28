import * as NODE_TYPE from "./types";
import { text, elementOpen, elementClose, patch as ipatch } from "./incremental-dom";
import { getData } from "./incremental-dom/src/node_data";
import { getContext } from "./incremental-dom/src/context";
import { firstChild, nextSibling, parentNode, markVisited } from './incremental-dom/src/traversal';
import { clearUnvisitedDOM } from './incremental-dom/src/alignment';
import * as utils from "./utils";
import * as _ from "underscore";
import { get as getView } from "./globals";
import Context from "./context";
import Trackr from "trackr";
import * as proxies from "./proxies";
// import assignProps from "assign-props";
import html from "./html-parser";
import Section from "./section";

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
		ipatch(node, fn);
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
			ipatch(frag, run);
			attachNodes();
		}
	});

	comp.onStop(function() {
		detachNodes();
		detachPlaceholder();
	});

	return patcher;
}

export function attributes(el, attrs, ctx) {
	_.each(attrs.reduce(function(res, a) {
		if (!decorations(el, a, ctx)) res[a.name] = a;
		return res;
	}, {}), function(attr) {
		Trackr.autorun(function() {
			el.setAttribute(attr.name, toString(attr.children, ctx));
		});
	});
}

export function decorations(el, attr, ctx) {
	// find the first parent context that is a view
	let view = ctx;
	while (view && !view.findDecorators) {
		view = ctx.parent;
	}

	// look up decorator by name
	let decorators = view.findDecorators(attr.name);
	if (!decorators.length) return false;

	// render each decorator
	decorators.forEach(function(d) {
		let _comp = Trackr.currentComputation;

		// defer computation because we cannot have unknown changes happening to the DOM
		_.defer(function() {
			let dcomp = Trackr.autorun(function(comp) {
				// assemble the arguments!
				var args = [ {
					target: el,
					owner: d.context,
					context: ctx,
					view: view,
					template: attr,
					comp: comp,
					options: d.options
				} ];

				// render arguments based on options
				if (d.options && d.options.parse === "string") {
					args.push(toString(attr.children, ctx));
				} else if (d.options == null || d.options.parse !== false) {
					args = args.concat(toArguments(attr.arguments, ctx));
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

export function incremental(template, ctx, key) {
	if (_.isArray(template)) {
		return _.flatten(template.map((t, i) => incremental(t, ctx, i))).filter(Boolean);
	}

	switch (template.type) {
		case NODE_TYPE.TEXT: {
			return text(utils.decodeEntities(template.value));
		}

		case NODE_TYPE.ELEMENT: {
			let Partial = getView(template.name);
			if (Partial) {
				let p = new Partial(null, ctx, { transparent: true }).mount();
				return p.el;
			}

			else {
				let el = elementOpen(template.name, key);
				attributes(el, template.attributes, ctx);
				incremental(template.children, ctx);
				elementClose(template.name);
				return el;
			}

			break;
		}

		case NODE_TYPE.INTERPOLATOR: {
			let node = text("");

			Trackr.autorun(function() {
			    let data = getData(node);
				let value = utils.toString(ctx.query(template.value));
			    if (data.text !== value) node.data = data.text = value;
			});

			return node;
		}

		case NODE_TYPE.TRIPLE: {
			let p = autopatch(function() {
				return html(ctx.query(template.value));
			});

			return p.getNodes();
		}

		case NODE_TYPE.PARTIAL: {
			let Partial = getView(template.value);
			if (Partial) new Partial(null, ctx, { transparent: true }).mount();
			break;
		}

		case NODE_TYPE.INVERTED:
		case NODE_TYPE.SECTION: {
			let p = autopatch(function() {
				let running = true;
				let inverted = template.type === NODE_TYPE.INVERTED;
				let val = ctx.query(template.value);
				let proxy = proxies.getByTarget(val, [ "empty", "section" ]);
				let isEmpty = Boolean(proxies.run(proxy, "empty", val));
				let nodes = [];

				function render(data) {
					if (running) {
						nodes = nodes.concat(incremental(template.children, new Context(data, ctx)));
					}
				}

				// run the section with the new data
				if (isEmpty && inverted) {
					render(val);
				} else if (!isEmpty && !inverted) {
					proxies.run(proxy, "section", val, render);
				}

				running = false;
				return nodes;
			});

			return p.getNodes();

			// let inverted = template.type === NODE_TYPE.INVERTED;
			// let val = ctx.query(template.value);

			// let rows = [];
			// let api = {};
			// let ph = document.createTextNode("");
			// let touched;
			//
			// api.create = function(data, index) {
			// 	let rowCtx = new Context(data, ctx);
			// 	let frag = document.createDocumentFragment();
			// 	let nodes = [];
			// 	let placeholder = document.createTextNode("");
			//
			// 	let row = {
			// 		setData: rowCtx.set.bind(rowCtx)
			// 	};
			//
			// 	assignProps(row, "parentNode", function() {
			// 		let ictx = getContext();
			// 		if (ictx) return ictx.walker.getCurrentParent();
			// 		else if (nodes.length) return nodes[0].parentNode;
			// 		else if (placeholder.parentNode)  return placeholder.parentNode;
			// 		else if (ph.parentNode) return ph.parentNode;
			// 	});
			//
			// 	assignProps(row, "nextSibling", function() {
			// 		let ictx = getContext();
			// 		if (ictx) return ictx.walker.currentNode;
			// 		else if (nodes.length) return _.last(nodes).nextSibling;
			// 		else if (placeholder.parentNode) return placeholder.nextSibling;
			// 		else if (ph.parentNode) return ph;
			// 	});
			//
			// 	assignProps(row, "firstNode", function() {
			// 		return nodes.length ? nodes[0] : placeholder;
			// 	});
			//
			// 	row.render = function() {
			// 		let parent = row.parentNode;
			// 		let before = row.nextSibling;
			//
			// 		utils.insertNodes(nodes, frag);
			//
			// 		ipatch(frag, function() {
			// 			incremental(template.children, rowCtx);
			// 		});
			//
			// 		nodes = _.toArray(frag.childNodes);
			// 		if (parent) {
			// 			if (nodes.length) {
			// 				if (placeholder.parentNode) {
			// 					placeholder.parentNode.removeChild(placeholder);
			// 				}
			//
			// 				parent.insertBefore(frag, before);
			// 			} else {
			// 				parent.insertBefore(placeholder, before);
			// 			}
			// 		}
			// 	};
			//
			// 	row.index = function() {
			// 		return rows.indexOf(row);
			// 	};
			//
			// 	row.remove = function() {
			// 		for (let node of nodes.splice(0, nodes.length)) {
			// 			if (node.parentNode) node.parentNode.removeChild(node);
			// 		}
			//
			// 		if (placeholder.parentNode) {
			// 			placeholder.parentNode.removeChild(placeholder);
			// 		}
			//
			// 		let i = row.index();
			// 		if (i >= 0) rows.splice(i, 1);
			// 	};
			//
			// 	row.moveTo = function(beforeRow) {
			// 		let index;
			// 		if (typeof beforeRow === "number") index = beforeRow;
			// 		else index = rows.indexOf(beforeRow);
			// 		if (isNaN(beforeRow) || index < 0) index = rows.length;
			// 		beforeRow = rows[index];
			//
			// 		let before = beforeRow.firstNode;
			// 		if (before && before.parentNode) {
			// 			utils.insertNodes(nodes, before.parentNode, before);
			// 		} else {
			// 			utils.insertNodes(nodes, frag);
			// 		}
			//
			// 		rows.splice(index, 0, row);
			// 	};
			//
			// 	if (typeof index !== "number" || isNaN(index) || index < 0) index = rows.length;
			// 	rows.splice(index, 0, row);
			// 	if (touched) touched.push(row);
			// 	rowCtx.on("change", row.render, row);
			// 	row.render();
			//
			// 	return row;
			// };
			//
			// api.get = function(index) {
			// 	return rows[index];
			// };
			//
			// api.set = function(data, index) {
			// 	if (typeof index !== "number" || isNaN(index) || index < 0) index = 0;
			//
			// 	let row;
			// 	if (index >= rows.length) row = api.create(data);
			// 	else row = api.get(index);
			//
			// 	if (touched) touched.push(row);
			// 	row.setData(data);
			//
			// 	return row;
			// };
			//
			// api.clear = function() {
			// 	_.invoke(rows.slice(), "remove");
			// };
			//
			// let comp = Trackr.autorun(function(c) {
			// 	let val = ctx.query(template.value);
			// 	let proxy = proxies.getByTarget(val, [ "empty", "section" ]);
			// 	let isEmpty = Boolean(proxies.run(proxy, "empty", val));
			//
			// 	// put placeholder in dom
			// 	c.onInvalidate(function() {
			// 		if (rows.length) {
			// 			let row = _.last(rows);
			// 			row.parentNode.insertBefore(ph, row.nextSibling);
			// 		}
			// 	});
			//
			// 	// record rows that will be modified
			// 	touched = [];
			//
			// 	// run the section with the new data
			// 	if (isEmpty && inverted) {
			// 		api.set(val);
			// 	} else if (!isEmpty && !inverted) {
			// 		proxies.run(proxy, "section", val, api);
			// 	}
			//
			// 	// remove rows that were not used
			// 	let clean = _.difference(rows, touched);
			// 	touched = null;
			// 	_.invoke(clean, "remove");
			//
			// 	// put placeholder in dom if there are no rows
			// 	let ictx;
			// 	if (!rows.length && (ictx = getContext())) {
			// 		ictx.walker.getCurrentParent().insertBefore(ph, ictx.walker.currentNode);
			// 	}
			// });
			//
			// comp.onStop(function() {
			// 	api.clear();
			// 	if (ph.parentNode) ph.parentNode.removeChild(ph);
			// });

			// break;
		}
	}

}

export function toString(template, ctx) {
	if (_.isArray(template)) {
		return template.map((t, i) => toString(t, ctx, i))
			.filter(b => typeof b === "string")
			.join("");
	}

	switch (template.type) {
		case NODE_TYPE.TEXT:
			return template.value;

		case NODE_TYPE.INTERPOLATOR:
		case NODE_TYPE.TRIPLE:
			return utils.toString(ctx.query(template.value));
	}
}

// converts an argument template into an array of values
export function toArguments(arg, ctx) {
	if (_.isArray(arg)) return arg.map(a => toArguments(a, ctx));

	switch(arg.type) {
		case NODE_TYPE.INTERPOLATOR:
			return ctx.query(arg.value);

		case NODE_TYPE.LITERAL:
			return arg.value;
	}
}
