import * as _ from "underscore";
import View from "./view";
import { Map as ReactiveMap } from "trackr-objects";
import Context from "./context";
import { patch } from "./idom";
// import { parse } from "./m+xml";
// import * as NODE_TYPE from "./types";
// import Trackr from "trackr";

module.exports = View.extend({
	constructor: function(data, parent, options) {
		if (!Context.isContext(parent)) {
			options = parent;
			parent = null;
		}

		options = options || {};
		//
		// // add template
		// var template = options.template || _.result(this, "template");
		// if (template != null) this.setTemplate(template);

		var tag = _.result(this, "tagName");
		if (!tag) throw new Error("Missing tag name.");
		this.el = document.createElement(this.extends || tag, this.extends ? tag : null);

		this._helpers = new ReactiveMap();
		this._helpersContext = new Context(this._helpers, this, { transparent: true });

		// add decorators
		this.decorate(_.extend({}, options.decorators, _.result(this, "decorators")));

		// super
		View.call(this, data, parent, options);
	},

	_mount: function() {
		patch(this.el, () => this.render(this._helpersContext));
	},

	// attach + mount
	attach: function(parent, before) {
		if (typeof parent === "string") parent = document.querySelector(parent);
		if (parent == null) throw new Error("Expecting a valid DOM element to attach in.");
		if (typeof before === "string") {
			before = parent.querySelector ?
				parent.querySelector(before) :
				document.querySelector(before);
		}

		parent.insertBefore(this.el, before);
		this.trigger("attach", this.el);

		return this;
	},

	paint: function(parent, before) {
		this.attach(parent, before);
		this.mount();
		return this;
	},

	// stop and remove dom
	detach: function() {
		this.stop();
		if (this.el && this.el.parentNode) {
			this.el.parentNode.removeChild(this.el);
		}
		return this;
	},

	helpers: function(obj) {
		for (let k of _.keys(obj)) {
			let v = obj[k];

			if (v == null) this._helpers.delete(k);
			else if (typeof v === "function") this._helpers.set(k, v);
			else {
				throw new Error("Expecting function for helper.");
			}
		}

		return this;
	},

	// creates a decorator
	decorate: function(name, fn, options) {
		if (typeof name === "object" && fn == null) {
			_.each(name, function(fn, n) {
				if (_.isArray(fn)) this.decorate(n, fn[0], fn[1]);
				else this.decorate(n, fn, options);
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
	},

	// finds all decorators, locally and in parent
	findDecorators: function(name) {
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
	},

	// removes a decorator
	stopDecorating: function(name, fn) {
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
});
