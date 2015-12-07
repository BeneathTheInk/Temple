import { register } from "./";
import {Map as ReactiveMap} from "trackr-objects";
// import {getPropertyFromClass} from "../utils";

export function plugin() {
	this._helpers = new ReactiveMap();
	this.helpers = add;
	this.getHelper = get;

	// // copy inherited helpers
	// if (typeof this !== "function") {
	// 	var decs = getPropertyFromClass(this, "_helpers");
	// 	if (decs) this._helpers.set(decs);
	// }
}

export default plugin;
register("helpers", plugin);

function add(key, value) {
	if (typeof key === "object") {
		Object.keys(key).forEach((k) => this.helpers(k, key[k]));
		return this;
	}

	if (typeof value === "undefined") this._helpers.delete(key);
	else this._helpers.set(key, value);

	return this;
}

function get(key) {
	return this._helpers.get(key);
}
