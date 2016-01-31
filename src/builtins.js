import Context from "./context";
import {forEach} from "./utils";
import {elementOpen,elementClose,autoelement} from "./idom";

export function Each(val, vars, ctx, fn, that) {
	forEach(val, function(item, key) {
		let nctx = new Context(ctx);

		if (vars.length === 1) nctx.set(vars[0], item);
		else if (vars.length == 2) {
			nctx.set(vars[0], key);
			nctx.set(vars[1], item);
		}

		fn.call(that, nctx, key, val);
	});
}

export function With(val, ctx, fn, that) {
	let nctx = new Context(ctx);
	nctx.set(val);
	nctx.dataVar.set(val);
	fn.call(that, nctx);
}

export function Element(tagname, key, ctx, fn, that) {
	let node = elementOpen(tagname, key);
	let nctx = new Context(null, ctx);
	let comp = autoelement(node, () => fn.call(that, nctx, node));
	elementClose(tagname);
	return comp;
}
