import * as _ from "underscore";
import { getPropertyFromClass } from "../utils";
import { register } from "./";

export function plugin() {
	// add the method
	this.helpers = helpers;

	// set the rendering context with helpers
	if (this._helpers == null) this._helpers = {};

	// copy inherited helpers
	if (typeof this !== "function") {
		_.extend(this._helpers, getPropertyFromClass(this, "_helpers"));
	}

	// push helpers onto context stack
	if (this.context) {
		this.context = this.context.append(this._helpers, { transparent: true });
	}
}

export default plugin;
register("helpers", plugin);

export function helpers(obj) {
	if (this._helpers == null) this._helpers = {};

	for (let k of _.keys(obj)) {
		let v = obj[k];
		if (v == null) delete this._helpers[k];
		else this._helpers[k] = v;
	}

	return this;
}
