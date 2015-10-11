import * as _ from "underscore";
import { getPropertyFromClass } from "../utils";
import { register } from "./";

export function plugin() {
	this.defaults = generateHelper.call(this, "defaults", "prepend");
	this.helpers = generateHelper.call(this, "helpers", "append");
}

export default plugin;
register("helpers", plugin);

function generateHelper(name, dir) {
	let storeKey = "_" + name;
	this[storeKey] = {};

	// push onto context stack
	if (dir === "prepend" && this.dataContext) {
		this.dataContext.prepend(this[storeKey], { transparent: true });
	} else if (dir === "append" && this.context) {
		this.context = this.context.append(this[storeKey], { transparent: true });
	}

	// copy inherited values
	if (typeof this !== "function") {
		let h = getPropertyFromClass(this, storeKey);
		if (h != null) merge.call(this, h);
	}

	return merge;

	function merge(obj) {
		if (!_.isObject(obj)) {
			throw new Error("Expecting object for " + name);
		}

		let keys = _.keys(obj);
		if (!keys.length) return;

		// add helpers
		for (let k of keys) {
			let v = obj[k];
			if (v == null) delete this[storeKey][k];
			else this[storeKey][k] = v;
		}

		return this;
	}
}
