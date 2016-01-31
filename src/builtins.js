import Context from "./context";
import {forEach} from "./utils";

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
