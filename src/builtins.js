import Context from "./context";
import {forEach} from "./utils";

export function Each(val, ctx, fn, that) {
	forEach(val, function(item, key) {
		let nctx = new Context(ctx);
		nctx.set({ $key: key, $item: item });
		nctx.dataVar.set(item);
		fn.call(that, nctx, key, val);
	});
}

export function With(val, ctx, fn, that) {
	let nctx = new Context(ctx);
	nctx.set(val);
	nctx.dataVar.set(val);
	fn.call(that, nctx);
}
