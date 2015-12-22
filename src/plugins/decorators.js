import * as _ from "lodash";
import { register } from "./";
import { currentElement, updateAttribute } from "../idom";
import Trackr from "trackr";
import raf from "raf";

var decorators = {};

export function plugin() {
	this._decorators = {};
	this.decorate = add;
	this.stopDecorating = remove;
	this.findDecorator = find;
}

export default plugin;
register("decorators", plugin);

// creates a decorator
export function add(name, fn, options) {
	if (typeof name === "object") {
		options = fn;
		_.each(name, function(fn, n) {
			if (_.isArray(fn)) add.call(this, n, fn[0], fn[1]);
			else add.call(this, n, fn, options);
		}, this);
		return this;
	}

	if (typeof name !== "string" || name === "") throw new Error("Expecting non-empty string for decorator name.");
	if (typeof fn !== "function") throw new Error("Expecting function for decorator.");

	var decs = this._decorators ? this._decorators : decorators;
	decs[name] = {
		template: this,
		callback: fn,
		options: options || {}
	};

	return this;
}

// removes a decorator
export function remove(name) {
	if (this._decorators) {
		if (name == null) this._decorators = {};
		else delete this._decorators[name];
	} else if (name) {
		delete decorators[name];
	}

	return this;
}

export function find(name) {
	let decs = this._decorators;
	if (decs != null && decs[name]) {
		return decs[name];
	}
}

// finds first decorator in template scope
export function lookup(ctx, name) {
	let c = ctx;

	while (c) {
		if (c.template) {
			let dec = c.template.findDecorator(name);
			if (dec) return dec;
		}

		c = c.parent;
	}

	if (decorators[name]) {
		return decorators[name];
	}
}

export function render(ctx, name, value) {
	let node = currentElement();
	if (!node) throw new Error("Not currently patching.");

	let isStatic = typeof value !== "function";

	// look up decorator by name
	let d = lookup(ctx, name);

	// quick escape if static value and no decorator
	if (isStatic && !d) {
		updateAttribute(node, name, value);
		return;
	}

	let anim, comp;
	let cancel = false;
	let getValue = (ctx) => isStatic ? value : value(ctx);

	// clean up when current computation reruns
	let pcomp = Trackr.currentComputation;
	if (!pcomp) {
		throw new Error("Can only render decorator in a computation.");
	}

	pcomp.onInvalidate(() => {
		cancel = true;
		if (anim) raf.cancel(anim);
		if (comp) comp.stop();
	});

	// rendered in it's own autorun track
	let renderDecorator = Trackr.nonreactable(function() {
		if (cancel) return;
		anim = null;
		comp = Trackr.autorun(function(c) {
			if (!d) {
				updateAttribute(node, name, getValue(ctx));
				return;
			}

			// execute the callback
			d.callback.call(d.template, {
				target: node,
				context: ctx,
				template: d.template,
				comp: c,
				options: d.options
			}, getValue(ctx));
		});
	});

	// defer computation if desired
	if (d && d.options && d.options.defer) anim = raf(renderDecorator);
	else renderDecorator();
}

// export function render(name, view, options) {
// 	options = options || {};
// 	let ictx = getContext();
// 	let el = ictx && ictx.walker.getCurrentParent();
// 	if (!el) throw new Error("Not patching any element");
//

// }
