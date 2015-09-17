import * as NODE_TYPE from "./types";
import { text, elementOpen, elementClose } from "./incremental-dom";
import { getData } from "./incremental-dom/src/node_data";
import * as utils from "./utils";
import * as _ from "underscore";
import { get as getView } from "./globals";
import Context from "./context";
import Trackr from "trackr";

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
	let Partial;

	if (_.isArray(template)) {
		template.forEach((t, i) => incremental(t, ctx, i));
		return;
	}

	switch (template.type) {
		case NODE_TYPE.TEXT:
			text(utils.decodeEntities(template.value));
			break;

		case NODE_TYPE.ELEMENT:
			Partial = getView(template.name);
			if (Partial) {
				new Partial(null, ctx, { transparent: true }).mount();
			}
			else {
				let el = elementOpen(template.name, key);
				attributes(el, template.attributes, ctx);
				incremental(template.children, ctx);
				elementClose(template.name);
			}
			break;

		case NODE_TYPE.INTERPOLATOR:
			let node = text("");

			Trackr.autorun(function() {
			    let data = getData(node);
				let value = utils.toString(ctx.query(template.value));
			    if (data.text !== value) node.data = data.text = value;
			});

			break;

		case NODE_TYPE.PARTIAL:
			Partial = getView(template.value);
			if (Partial) new Partial(null, ctx, { transparent: true }).mount();
			break;

		case NODE_TYPE.SECTION:
			let val = ctx.query(template.value);
			let newctx = new Context(val, ctx);
			incremental(template.children, newctx);
			break;
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
