import { register } from "./";
import { compile } from "../compile";
import { Map as ReactiveMap } from "trackr-objects";
import { getPropertyFromClass } from "../utils";

var partials = new ReactiveMap();

export function plugin() {
	this._partials = new ReactiveMap();
	this.setPartial = set;
	this.findPartial = find;
	this.renderPartial = render;

	if (typeof this !== "function") {
		// apply partials attached directly to prototype
		if (this.partials) {
			for (let k in this.partials) {
				this._partials.set(k, this.partials[k]);
			}
		}

		// apply partials from classes
		let partials = getPropertyFromClass(this, function(klass) {
			if (klass._partials) return klass._partials.toJSON();
		});

		for (let k in partials) {
			this._partials.set(k, partials[k]);
		}

		// apply partials from the options passed to the constructor
		if (this.options.partials) {
			for (let k in this.options.partials) {
				set.call(this, k, this.options.partials[k]);
			}
		}
	}
}

export default plugin;
register("partials", plugin);

export function set(name, src) {
	var p = this._partials || partials;

	if (typeof src === "string") {
		/* jshint -W054 */
		let opts = { startRule: "html", headers: [] };
		let inner = compile(src, opts);
		src = new Function("Temple", `return function(ctx) {
			${opts.headers.join("")}
			${inner}
		}`)(require("../"));
	}

	if (src == null) p.delete(name);
	else if (typeof src === "function") p.set(name, src);
	else throw new Error("Expecting function or string template.");

	return this;
}

export function find(name, options) {
	options = options || {};
	let view = this;

	while (view != null) {
		if (view._partials && view._partials.has(name)) {
			return view._partials.get(name);
		}

		if (options.local) return;
		view = view.parent === view ? null : view.parent;
	}

	return partials.get(name);
}

export function render(name, ctx, options) {
	var partial = find.call(this, name, options);
	if (partial) partial.call(this, ctx);
}
