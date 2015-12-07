import * as _ from "lodash";
// import { getPropertyFromClass } from "../utils";
import { register } from "./";
import {getContext,getData,onDestroy,updateAttribute} from "../idom";
import Trackr from "trackr";
import raf from "raf";

var decorators = {};

export function plugin() {
	this._decorators = {};
	this.decorate = add;
	this.stopDecorating = remove;

	this.on("view", function(v) {
		v.findDecorator = find;
		v.renderDecorator = render;
	});
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

// finds first decorator in view scope
export function find(name) {
	let c = this;

	while (c != null) {
		if (c.type !== "template" || !c.template) continue;

		let decs = c.template._decorators;
		if (decs != null && decs[name]) {
			return _.extend({ context: c }, decs[name]);
		}

		c = c.parent === c ? null : c.parent;
	}

	if (decorators[name]) {
		return _.extend({ context: global }, decorators[name]);
	}
}

export function render(name, view, options) {
	options = options || {};
	let ictx = getContext();
	let el = ictx && ictx.walker.getCurrentParent();
	if (!el) throw new Error("Not patching any element");

	let pcomp = Trackr.currentComputation;
	if (!pcomp) {
		throw new Error("Can only render decorator in a computation.");
	}

	let anim, comp;
	let cancel = false;
	let call = (m) => options[m].call(view);

	pcomp.onInvalidate(() => {
		cancel = true;
		if (anim) raf.cancel(anim);
		if (comp) comp.stop();
	});

	// look up decorator by name
	let self = this;
	let d = this.findDecorator(name);

	// rendered in it's own autorun track
	let renderDecorator = Trackr.nonreactable(function() {
		if (cancel) return;
		anim = null;
		comp = Trackr.autorun(function(c) {
			if (!d) {
				if (typeof options.string === "function") {
					updateAttribute(el, name, call("string"));
				}
				return;
			}

			// assemble the arguments!
			let args = [ _.extend({
				target: el,
				owner: d.context,
				template: self.template,
				view: view,
				comp: c,
				options: d.options,
				render: options
			}, options.mixin) ];

			// render arguments based on options
			if (d.options && d.options.parse === "string") {
				if (typeof options.string === "function") args.push(call("string"));
			} else if (d.options == null || d.options.parse !== false) {
				if (typeof options["arguments"] === "function") args = args.concat(call("arguments"));
			}

			// execute the callback
			d.callback.apply(d.context, args);
		});
	});

	// defer computation because we cannot have unknown changes happening to the DOM
	let inline = !d || (d.options && (d.options.inline || d.options.instant));
	if (inline) renderDecorator();
	else anim = raf(renderDecorator);
}
