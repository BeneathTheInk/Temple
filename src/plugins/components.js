import * as _ from "underscore";
import { register } from "./";
import { get as getView } from "../globals";
import View from "../view";
import Trackr from "trackr";

export function plugin() {
	this._components = {};
	this.createComponent = create;
	this.addComponent = add;
	this.removeComponent = remove;
	this.getComponent = getOne;
	this.getComponents = getAll;
	this.findComponent = findOne;
	this.findComponents = findAll;
}

export default plugin;
register("components", plugin);

export function create(name, ctx, options) {
	let View = getView(name);
	if (!View) return;

	// create the view
	options = _.defaults({ transparent: true }, options);
	let v = Trackr.nonreactive(() => new View(ctx, options));

	// add it to the list
	add.call(this, v);

	return v;
}

export function add(view) {
	if (view.tagName && !view.parent) {
		let comps = this._components;
		if (comps[view.tagName] == null) comps[view.tagName] = [];
		comps[view.tagName].push(view);
		view.parent = this;
	}

	return this;
}

export function remove(view) {
	let comps = this._components;

	if (view == null) {
		this._components = {};
	}

	else if (typeof view == "string") {
		if (comps[view]) {
			comps[view].forEach(function(v) {
				if (view.parent === this) v.parent = null;
			});
			delete comps[view];
		}
	}

	else if (view.tagName) {
		comps[view.tagName] = _.without(comps[view.tagName], view);
		if (view.parent === this) view.parent = null;
	}

	return this;
}

// returns first rendered partial by name
export function getOne(name) {
	var comps, comp, res, n, i;

	comps = this._components;
	if (comps[name] != null && comps[name].length) return comps[name][0];

	for (n in comps) {
		for (i in comps[n]) {
			comp = comps[n][i];
			if (!View.isView(comp)) continue;
			res = comp.getComponent(name);
			if (res != null) return res;
		}
	}

	return null;
}

// returns all rendered partials by name
export function getAll(name) {
	if (name == null) return _.flatten(_.values(this._components));

	return _.reduce(this._components, function(m, comps, n) {
		if (n === name) m.push.apply(m, comps);

		comps.forEach(function(c) {
			if (View.isView(c)) m.push.apply(m, c.getComponents(name));
		});

		return m;
	}, []);
}

// returns rendered partials, searching children views
export function findOne(name) {
	var tpls = [ this ],
		tpl, comp;

	while (tpls.length) {
		tpl = tpls.shift();
		comp = tpl.getComponent(name);
		if (comp) return comp;
		tpls = tpls.concat(tpl.getComponents());
	}

	return null;
}

// returns rendered partials, searching children views
export function findAll(name) {
	var tpls = [ this ],
		comps = [],
		tpl;

	while (tpls.length) {
		tpl = tpls.shift();
		comps = comps.concat(tpl.getComponents(name));
		tpls.push(tpl.getComponents());
	}

	return comps;
}
