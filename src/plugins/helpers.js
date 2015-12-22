import { register } from "./";
import {Map as ReactiveMap} from "trackr-objects";

export function plugin() {
	this._helpers = new ReactiveMap();
	this.helpers = add;
	this.getHelper = get;
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
