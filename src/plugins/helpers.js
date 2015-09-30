import * as _ from "underscore";
import { getPropertyFromClass } from "../utils";
import { register } from "./";
import Context from "../context";

export function plugin() {
	console.log("here");

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
		else if (typeof v === "function") this._helpers[k] = v;
		else {
			throw new Error("Expecting function for helper.");
		}
	}

	return this;
}
