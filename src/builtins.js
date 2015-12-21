// import View from "./view";
import Context from "./context";
import {forEach} from "./utils";
//
// export function For(data, render, parent) {
// 	return View("for", function() {
// 		let loop = this;
//
// 		forEach(data, function(item, key) {
// 			let v = View("foritem", function() {
// 				render.call(this, key);
// 			}, loop);
//
// 			v.set({ $key: key, $item: item });
// 			v.dataVar.set(item);
// 			v.render();
// 		});
// 	}, parent);
// }

export function Each(val, ctx, fn, that) {
	forEach(val, function(item, key) {
		let nctx = new Context(ctx);
		nctx.set({ $key: key, $item: item });
		nctx.dataVar.set(item);
		fn.call(that, nctx, key, val);
	});
}
