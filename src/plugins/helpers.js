import * as _ from "underscore";
import { getPropertyFromClass } from "../utils";
import { register } from "./";
import Context from "../context";

export function plugin() {
	// add the method
	this.helpers = helpers;

	// set the rendering context with helpers
	if (this._helpers == null) this._helpers = {};
	this._renderContext = new Context(this._helpers, this._renderContext, { transparent: true });

	// copy inherited helpers
	if (typeof this !== "function") {
		_.extend(this._helpers, getPropertyFromClass(this, "_helpers"));
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
