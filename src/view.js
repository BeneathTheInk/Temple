import Trackr from "trackr";
import {patch,getContext,getData} from "./idom";
import * as _ from "lodash";
import {EventEmitter} from "events";
import {Variable as ReactiveVar} from "trackr-objects";
import assignProps from "assign-props";

export var currentView;

export function View(type, key, render, parent) {
	if (!(this instanceof View)) {
		return new View(type, render, parent);
	}

	if (typeof render !== "function") {
		throw new Error("Expecting function for render.");
	}

	if (parent && !(parent instanceof View)) {
		throw new Error("Expecting instance of View for parent.");
	}

	let ctx = getContext();
	let el = ctx && ctx.walker.getCurrentParent();

	if (el) {
		let eldata = getData(el);
		// if (!eldata.templeViews) eldata.templeViews = {};
		// if (!eldata.templeViewsTouched) eldata.templeViewsTouched = [];

		console.log(eldata)
	}


	EventEmitter.call(this);
	this.setMaxListeners(0);

	// internal view state
	this.s = {
		// view type
		type: type || "view",
		// the element
		node: el,
		// render method
		render: render,
		// parent view for scope
		parent: parent || null,
		// holds lexical data
		scope: _.assign({}, _.result(this, "defaults")),
		// holds "this" data
		data: new ReactiveVar()
	};

	this.emit("create");
}

View.prototype = Object.create(EventEmitter.prototype);
View.prototype.constructor = View;

assignProps(View.prototype, {
	type: function() { return this.s.type; },
	node: function() { return this.s.node; },
	scope: function() { return this.s.scope; },
	dataVar: function() { return this.s.data; },
	data: function() { return this.s.data.get(); },
	parent: function() { return this.s.parent; },
	options: function() { return this.s.options; }
});

View.prototype.set = function(key, value) {
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

View.prototype.get = function(key) { return _.has(this.s.scope, key) ? this.s.scope[key] : void 0; };

View.prototype.parentData = function(dist) {
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

View.prototype.getClosest = function(type) {
	let view = this;
	while (view) {
		if (view.type === type) return view;
		view = view.parent;
	}
};

View.prototype.getTemplate = function() {
	let view = this.getClosest("template");
	return view && view.template;
};

View.prototype.lookup = function(key) {
	let view;

	// 0-0. check for this
	if (!key || key === "this") {
		view = this;
		while (view) {
			let val = view.data;
			if (val !== void 0) return val;
			view = view.parent;
		}
	}

	// 0-1. special method $this
	if (key === "$this") {
		return (d) => this.parentData(d);
	}

	// 1. check closest template helpers
	let tpl = this.getTemplate();
	if (tpl) {
		let val = tpl.getHelper(key);
		if (val !== void 0) return val;
	}

	// 2. check lexical scope
	view = this;
	while (view) {
		let val = view.get(key);
		if (val !== void 0) return val;
		view = view.parent;
	}

	// 3. check global helpers
};

View.prototype.render = function() {
	this.s.render.apply(this, arguments);
	this.emit("render");
};

View.prototype.paint = function(node) {
	if (typeof node === "string") node = document.querySelector(node);
	if (node == null) throw new Error("Expecting a valid DOM element to paint.");

	let c = Trackr.autorun(() => {
		patch(node, () => this.render());
	});

	c.view = this;

	c.onStop(() => {
		patch(node, ()=>{});
	});

	return c;
};

// View.render = function(type, key, data, parent, render, that, options) {
// 	let v;
// 	let ctx = getContext();
// 	let el = ctx && ctx.walker.getCurrentParent();
// 	if (!el) throw new Error("Not currently patching.");
//
// 	let isklass = typeof type === "function";
//
// 	// create the view non-reactively or pull from cache
// 	Trackr.nonreactive(() => {
// 		let eldata = getData(el);
// 		if (!eldata.templeViews) eldata.templeViews = {};
// 		if (!eldata.templeViewsTouched) eldata.templeViewsTouched = [];
//
// 		let existing = eldata.templeViews[key];
// 		let issame = existing &&
// 			(isklass ? existing.view instanceof type : existing.view.type === type) &&
// 			_.isEqual(existing.data, data) &&
// 			_.isEqual(existing["this"], that);
//
// 		if (issame) {
// 			v = existing.view;
// 		} else {
// 			if (existing) existing.view.destroy();
// 			if (isklass) {
// 				v = new type(data, parent, options);
// 			} else {
// 				v = new View(data, parent, options);
// 				v.type = type;
// 			}
// 			if (typeof render === "function") v.render = render;
// 			if (typeof that !== "undefined") v.dataVar.set(that);
// 			eldata.templeViews[key] = { view: v, data: data, "this": that };
//
// 			// clean up if parent's are destroyed
// 			let destroy = v.destroy.bind(v);
// 			parent.once("destroy", destroy);
// 			onDestroy(el, destroy);
//
// 			// remove from cache when view is destroyed
// 			v.once("destroy", function() {
// 				parent.removeListener("destroy", destroy);
// 				removeDestroyListener(el, destroy);
//
// 				let eldata = getData(el);
// 				let cached = eldata.templeViews[key];
// 				if (cached && cached.view === v) {
// 					delete eldata.templeViews[key];
// 				}
// 			});
// 		}
//
// 		eldata.templeViewsTouched.push(key);
// 	});
//
// 	// mount and render
// 	v.mount({ key: key });
//
// 	return v;
// };
//
// View.clearUnvisitedViews = function(node) {
// 	let eldata = getData(node);
// 	let destroyed = [];
//
// 	if (eldata.templeViewsTouched) {
// 		let touched = eldata.templeViewsTouched;
// 		touched = touched.splice(0, touched.length);
// 		let toRemove = _.difference(Object.keys(eldata.templeViews), touched);
//
// 		toRemove.forEach(function(k) {
// 			let v = eldata.templeViews[k];
// 			if (!v) return;
// 			delete eldata.templeViews[k];
// 			v.view.destroy();
// 			destroyed.push(v.view);
// 		});
// 	}
//
// 	return destroyed;
// };
//
// View.forIn = function(vars, val, key, parent, render, options) {
// 	return forEach(val, function(item, index) {
// 		var data = {};
//
// 		let vlen = vars.length;
// 		if (vlen === 1) data[vars[0]] = item;
// 		else if (vlen > 1) {
// 			data[vars[0]] = index;
// 			data[vars[1]] = item;
// 		}
//
// 		View.render("for", key + "-" + index, data, parent, function() {
// 			render.call(this, index);
// 		}, item, options);
// 	});
// };
