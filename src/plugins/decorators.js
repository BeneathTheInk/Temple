import {forEach,isArray,assign} from "lodash";
import { currentElement, updateAttribute } from "../idom";
import Trackr from "trackr";
import raf from "raf";
import Context from "../context";

var decorators = {};

export function plugin() {
	this._decorators = {};
	this.decorate = add;
	this.stopDecorating = remove;
	this.findDecorator = find;
}

export default plugin;

// creates a decorator
export function add(name, fn, options) {
	if (typeof name === "object") {
		options = fn;
		forEach(name, (fn, n) => {
			if (isArray(fn)) add.call(this, n, fn[0], fn[1]);
			else add.call(this, n, fn, options);
		});
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

// finds the best decorator
export function lookup(ctx, name) {
	// look on the closest template
	let owner = ctx.getTemplateContext();
	if (owner) {
		let dec = owner.template.findDecorator(name);
		if (dec) return assign({ owner }, dec);
	}

	// look globally
	if (decorators[name]) {
		return assign({ owner: global }, decorators[name]);
	}
}

function setAttribute(node, name, values) {
	let v = !values || !values.length || values[0] == null ? "" : values[0];
	updateAttribute(node, name, v);
}

export function render(_ctx, name, value) {
	let node = currentElement();
	if (!node) throw new Error("Not currently patching.");

	// each decorator is given its own context
	let ctx = new Context(null, _ctx);

	let isStaticValue = typeof value !== "function";
	let getValue = () => {
		let val = isStaticValue ? value : value(ctx);
		if (!isArray(val)) val = [ val ];
		return val;
	};

	// look up decorator by name
	let d = lookup(ctx, name);

	// quick escape if static value and no decorator
	if (isStaticValue && !d) {
		setAttribute(node, name, getValue());
		return;
	}

	let anim, comp;
	let cancel = false;
	let decctx = assign({
		target: node,
		context: ctx
	}, d);

	let run = function(c) {
		decctx.comp = c;
		let val = getValue();

		if (!d) {
			setAttribute(node, name, val);
			return;
		}

		// execute the callback
		d.callback.apply(d.template, [decctx].concat(val));
	};

	// defer computation if desired
	if (d && d.options && d.options.defer) {
		// clean up when current computation reruns
		let pcomp = Trackr.currentComputation;
		if (!pcomp) throw new Error("Can only render decorator in a computation.");
		pcomp.onInvalidate(() => {
			cancel = true;
			if (anim) raf.cancel(anim);
			if (comp) comp.stop();
		});

		// run decorator on the next frame
		anim = raf(() => {
			if (cancel) return;
			anim = null;
			comp = Trackr.autorun(run);
		});
	} else {
		Trackr.autorun(run);
	}
}
