import * as _ from "lodash";
import {EventEmitter} from "events";
import {Variable as ReactiveVar} from "trackr-objects";
import assignProps from "assign-props";

export default function Context(data, parent, template) {
	if (!(this instanceof Context)) {
		return new Context(parent);
	}

	EventEmitter.call(this);
	this.setMaxListeners(0);

	if (data instanceof Context) {
		[template, parent, data] = [parent, data, null];
	}

	if (parent && !(parent instanceof Context)) {
		throw new Error("Expecting an instance of Context for parent.");
	}

	// internal view state
	this.s = {
		// parent view for scope
		parent: parent || null,
		// associated template object
		template: template || null,
		// holds lexical data
		scope: {},
		// holds "this" data
		data: new ReactiveVar(),
		// whether or not this view has been destroyed
		destroyed: false
	};

	// set initial data
	if (data != null) this.set(data);
	if (!this.parent) this.dataVar.set(data);
}

Context.prototype = Object.create(EventEmitter.prototype);
Context.prototype.constructor = Context;

assignProps(Context.prototype, {
	scope: function() { return this.s.scope; },
	dataVar: function() { return this.s.data; },
	data: function() { return this.s.data.get(); },
	template: function() { return this.s.template; },
	parent: function() { return this.s.parent; }
});

Context.prototype.set = function(key, value) {
	if (typeof key === "object") {
		_.forEach(key, (v, k) => this.set(k, v));
		return this;
	}

	if (key === "this") {
		this.s.data.set(value);
	} else {
		if (typeof value === "undefined") delete this.s.scope[key];
		else this.s.scope[key] = value;
	}

	return this;
};

Context.prototype.get = function(key) { return _.has(this.s.scope, key) ? this.s.scope[key] : void 0; };

Context.prototype.parentData = function(dist) {
	if (typeof dist !== "number" || isNaN(dist)) dist = 1;

	if (dist >= 0) {
		let v = this;
		while (dist && v) {
			dist--;
			v = v.parent;
		}
		return !dist && v ? v.data : void 0;
	}

	let views = [];
	let v = this;

	while (v) {
		views.push(v);
		v = v.parent;
	}

	let view = views[Math.abs(dist) - 1];
	return view ? view.data : void 0;
};

Context.prototype.getTemplate = function() {
	let view = this;

	while (view) {
		if (view.template != null) {
			return view.template;
		}

		view = view.parent;
	}
};

var lookup = function(tpl, ctx, key) {
	let view;

	// 0-0. check for this
	if (!key || key === "this") {
		view = ctx;
		while (view) {
			let val = view.data;
			if (val !== void 0) return val;
			view = view.parent;
		}
	}

	// 0-1. special method $this
	if (key === "$this") {
		return (d) => ctx.parentData(d);
	}

	// 1. check closest template helpers
	if (tpl) {
		let val = tpl.getHelper(key);
		if (val !== void 0) return val;
	}

	// 2. check lexical scope
	view = ctx;
	while (view) {
		let val = view.get(key);
		if (val !== void 0) return val;
		view = view.parent;
	}

	// 3. check global helpers
};

Context.prototype.lookup = function(key) {
	let val = lookup(this.getTemplate(), this, key);

	// reactive variables are always resolved
	if (val instanceof ReactiveVar) {
		val = val.get();
	}

	return val;
};
