import * as NODE_TYPE from "./types";
import { text, elementOpen, elementClose } from "./incremental-dom";
import * as utils from "./utils";
import * as _ from "underscore";
import { get as getView } from "./globals";
import Context from "./context";

export function idom(template, ctx, key) {
	let Partial;

	if (_.isArray(template)) {
		template.forEach(function(t, i) {
			idom(t, ctx, i);
		});
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
				elementOpen(template.name, key);
				idom(template.children, ctx);
				elementClose(template.name);
			}
			break;

		case NODE_TYPE.INTERPOLATOR:
			text(utils.toString(ctx.query(template.value)));
			break;

		case NODE_TYPE.PARTIAL:
			Partial = getView(template.value);
			if (Partial) new Partial(null, ctx, { transparent: true }).mount();
			break;

		case NODE_TYPE.SECTION:
			let val = ctx.query(template.value);
			let newctx = new Context(val, ctx);
			idom(template.children, newctx);
			break;
	}

}
