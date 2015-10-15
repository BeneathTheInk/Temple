import { getPropertyFromClass } from "../utils";
import { register } from "./";
import { Map as ReactiveMap } from "trackr-objects";
import Context from "../context";

export function plugin() {
	this.defaults = generateHelper.call(this, "defaults", "prepend");
	this.helpers = generateHelper.call(this, "helpers", "append");
}

export default plugin;
register("helpers", plugin);

var globalData = Context.globals.data;
export var globals = generateHelper(globalData, "append");

function generateHelper(store, dir) {
	let storeKey;

	if (typeof store === "string") {
		storeKey = "_" + store;
		store = this[storeKey];
		if (!store) store = this[storeKey] = new ReactiveMap();
	}

	// push onto context stack
	if (this) { // chrome bug? this is undefined for the global
		if (dir === "prepend" && this.dataContext) {
			this.dataContext.prepend(store, { transparent: true });
		} else if (dir === "append" && this.context) {
			this.context = this.context.append(store, { transparent: true });
		}
	}

	// copy inherited values
	if (storeKey && typeof this !== "function") {
		let h = getPropertyFromClass(this, storeKey);
		if (h != null) merge.call(this, h);
	}

	return merge;

	function merge(key, value) {
		if (typeof key === "object") {
			Object.keys(key).forEach(function(k) {
				merge(k, key[k]);
			});
			return this;
		}

		if (typeof value === "undefined") store.delete(key);
		else store.set(key, value);

		return this;
	}
}
