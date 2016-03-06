import {forEach,has} from "lodash";
import {EventEmitter} from "events";
import {Variable as ReactiveVar} from "trackr-objects";
import assignProps from "assign-props";
import {getHelper} from "./templates";

export default function Scope(data, parent, template) {
	if (!(this instanceof Scope)) {
		return new Scope(parent);
	}

	EventEmitter.call(this);
	this.setMaxListeners(0);

	if (data instanceof Scope) {
		[template, parent, data] = [parent, data, null];
	}

	if (parent && !(parent instanceof Scope)) {
		throw new Error("Expecting an instance of Scope for parent.");
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
		data: new ReactiveVar()
	};

	// set initial data
	if (data != null) this.set(data);
	if (!this.parent) this.dataVar.set(data);
}

Scope.prototype = Object.create(EventEmitter.prototype);
Scope.prototype.constructor = Scope;

assignProps(Scope.prototype, {
	scope: function() { return this.s.scope; },
	dataVar: function() { return this.s.data; },
	data: function() { return this.s.data.get(); },
	template: function() { return this.s.template; },
	parent: function() { return this.s.parent; }
});

Scope.prototype.set = function(key, value) {
	if (typeof key === "object") {
		forEach(key, (v, k) => this.set(k, v));
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

Scope.prototype.get = function(key) { return has(this.s.scope, key) ? this.s.scope[key] : void 0; };

Scope.prototype.parentData = function(dist) {
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

Scope.prototype.getTemplateScope = function() {
	let view = this;

	while (view) {
		if (view.template != null) {
			return view;
		}

		view = view.parent;
	}
};

Scope.prototype.getTemplate = function() {
	let scope = this.getTemplateScope();
	return scope ? scope.template : void 0;
};

var lookup = function(tpl, scope, key) {
	let view;

	// 0-0. check for this
	if (!key || key === "this") {
		view = scope;
		while (view) {
			let val = view.data;
			if (val !== void 0) return val;
			view = view.parent;
		}
	}

	// 0-1. special method $this
	if (key === "$this") {
		return (d) => scope.parentData(d);
	}

	// 1. check closest template helpers
	if (tpl) {
		let val = tpl.getHelper(key);
		if (val !== void 0) return val;
	}

	// 2. check lexical scope
	view = scope;
	while (view) {
		let val = view.get(key);
		if (val !== void 0) return val;
		view = view.parent;
	}

	// 3. check global helpers
	let val = getHelper(key);
	if (val !== void 0) return val;
};

Scope.prototype.lookup = function(key) {
	return lookup(this.getTemplate(), this, key);
};
