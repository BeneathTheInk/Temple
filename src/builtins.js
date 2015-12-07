import View from "./view";
import {forEach} from "./utils";

export function For(data, render, parent) {
	return View("for", function() {
		let loop = this;

		forEach(data, function(item, key) {
			let v = View("foritem", function() {
				render.call(this, key);
			}, loop);

			v.set({ $key: key, $item: item });
			v.dataVar.set(item);
			v.render();
		});
	}, parent);
}
