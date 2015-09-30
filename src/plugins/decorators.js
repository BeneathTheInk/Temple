import * as _ from "underscore";
import Trackr from "trackr";
import { getContext } from "../incremental-dom/src/context";
import { updateAttribute } from '../incremental-dom/src/attributes';
import { getPropertyFromClass } from "../utils";
import { register } from "./";

export function plugin() {
	this.decorate = add;
	this.stopDecorating = remove;
	this.findDecorators = find;
	this.renderDecorator = render;

	// copy inherited decorators
	if (typeof this !== "function") {
		var decs = getPropertyFromClass(this, "_decorators");
		this._decorators = _.extend(this._decorators || {}, decs);
	}
}

export default plugin;
register("decorators", plugin);

export function render(view, name, el, options) {
	if (el && el.nodeType !== document.ELEMENT_NODE) {
		options = el;
		el = null;
	}

	options = options || {};

	if (el == null) {
		let ictx = getContext();
		el = ictx && ictx.walker.getCurrentParent();
	}

	// look up decorator by name
	let decorators = view.findDecorators(name);

	// render as attribute if no decorators
	if (!decorators.length) {
		if (el && typeof options.string === "function") {
			updateAttribute(el, name, options.string());
		}

		return;
	}

	// render each decorator
	decorators.forEach(function(d) {
		let _comp = Trackr.currentComputation;

		// defer computation because we cannot have unknown changes happening to the DOM
		_.defer(function() {
			let dcomp = Trackr.autorun(function(comp) {
				// assemble the arguments!
				var args = [ _.extend({
					target: el,
					owner: d.context,
					view: view,
					comp: comp,
					options: d.options
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

			// clean up
			if (_comp) {
				if (_comp.stopped || _comp.invalidated) dcomp.stop();
				else _comp.onInvalidate(() => dcomp.stop());
			}
		});
	});

	return true;
}

// creates a decorator
export function add(name, fn, options) {
	if (typeof name === "object" && fn == null) {
		_.each(name, function(fn, n) {
			if (_.isArray(fn)) add.call(this, n, fn[0], fn[1]);
			else add.call(this, n, fn, options);
		}, this);
		return this;
	}

	if (typeof name !== "string" || name === "") throw new Error("Expecting non-empty string for decorator name.");
	if (typeof fn !== "function") throw new Error("Expecting function for decorator.");

	if (this._decorators == null) this._decorators = {};
	if (this._decorators[name] == null) this._decorators[name] = [];
	var decorators = this._decorators[name];

	if (!_.findWhere(decorators, { callback: fn })) {
		decorators.push({
			callback: fn,
			options: options || {}
		});
	}

	return this;
}

// finds all decorators, locally and in parent
export function find(name) {
	let res = [];
	let c = this;

	while (c != null) {
		let decs = c._decorators;

		if (decs != null && _.isArray(decs[name])) {
			for (let d of decs[name]) {
				if (!_.findWhere(res, { callback: d.callback })) {
					res.push(_.extend({ context: c }, d));
				}
			}
		}

		c = c.parent;
	}

	return res;
}

// removes a decorator
export function remove(name, fn) {
	if (typeof name === "function" && fn == null) {
		fn = name;
		name = null;
	}

	if (this._decorators == null || (name == null && fn == null)) {
		this._decorators = {};
	}

	else if (fn == null) {
		delete this._decorators[name];
	}

	else if (name == null) {
		_.each(this._decorators, function(d, n) {
			this._decorators[n] = _.filter(d, function(_d) {
				return _d.callback !== fn;
			});
		}, this);
	}

	else {
		var d = this._decorators[name];
		this._decorators[name] = _.filter(d, function(_d) {
			return _d.callback !== fn;
		});
	}

	return this;
}
