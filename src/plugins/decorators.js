import * as _ from "lodash";
import Trackr from "trackr";
import { updateAttribute, getContext } from "../idom";
import { getPropertyFromClass } from "../utils";
import { register } from "./";
import raf from "raf";

var decorators = {};

export function plugin() {
	this._decorators = {};
	this.decorate = add;
	this.stopDecorating = remove;
	this.findDecorator = find;
	this.renderDecorator = render;

	// copy inherited decorators
	if (typeof this !== "function") {
		var decs = getPropertyFromClass(this, "_decorators");
		this._decorators = _.extend(this._decorators || {}, decs);
	}
}

export default plugin;
register("decorators", plugin);

export function render(name, options) {
	options = options || {};
	let ictx = getContext();
	let el = ictx && ictx.walker.getCurrentParent();

	// look up decorator by name
	let d = find.call(this, name);

	// render as attribute if no decorators
	if (!d) {
		if (el && typeof options.string === "function") {
			Trackr.autorun(function() {
				updateAttribute(el, name, options.string());
			});
		}

		return;
	}

	let view = this;
	let _comp = Trackr.currentComputation;
	let dcomp, anim;

	_comp.onInvalidate(function() {
		if (anim) raf.cancel(anim);
		if (dcomp) dcomp.stop();
	});

	// render each decorator
	function runDecorator() {
		anim = null;
		dcomp = Trackr.autorun(function(comp) {
			// assemble the arguments!
			var args = [ _.extend({
				target: el,
				owner: d.context,
				view: view,
				comp: comp,
				options: d.options,
				render: options
			}, options.mixin) ];

			// render arguments based on options
			if (d.options && d.options.parse === "string") {
				if (typeof options.string === "function") args.push(options.string());
			} else if (d.options == null || d.options.parse !== false) {
				if (typeof options["arguments"] === "function") args = args.concat(options["arguments"]());
			}

			// execute the callback
			d.callback.apply(d.context, args);
		});
	}

	// defer computation because we cannot have unknown changes happening to the DOM
	let inline = d.options && (d.options.inline || d.options.instant);
	if (inline) runDecorator();
	else anim = raf(runDecorator);

	return true;
}

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

// finds first decorator
export function find(name) {
	let c = this;

	while (c != null) {
		let decs = c._decorators;
		if (decs != null && decs[name]) {
			return _.extend({ context: c }, decs[name]);
		}

		c = c.parent === c ? null : c.parent;
	}

	if (decorators[name]) {
		return _.extend({ context: global }, decorators[name]);
	}
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
