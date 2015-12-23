import * as _ from "lodash";
import Context from "./context";
import {EventEmitter} from "events";
import Trackr from "trackr";
import {patch} from "./idom";
import {Map as ReactiveMap} from "trackr-objects";
import { load as loadPlugin } from "./plugins";

export var templates = {};

export function Template(name, render) {
	if (!(this instanceof Template)) {
		return new Template(name, render);
	}

	if (typeof name !== "string" || name === "") {
		throw new Error("Expecting a non-empty string for template name.");
	}

	if (_.has(templates, name)) {
		throw new Error("Template already exists with name '"+name+"'");
	}

	if (typeof render !== "function") {
		throw new Error("Expecting a function for render.");
	}

	EventEmitter.call(this);
	this.setMaxListeners(0);

	// internal state
	this.s = {
		// template name
		name: name,
		// render method
		render: render,
		// dependency for easy invalidate
		renderdep: new Trackr.Dependency(),
		// holds the helpers
		helpers: new ReactiveMap()
	};

	// attach globally
	templates[name] = this;

	// default plugins
	this.use("decorators");
}

Template.prototype = Object.create(EventEmitter.prototype);
Template.prototype.constructor = Template;

// plugin proxy for contexts
Template.prototype.use = function use(p) {
	return loadPlugin(this, p, _.toArray(arguments).slice(1));
};

Template.prototype.createContext = function(data, parent) {
	if (data instanceof Context) [parent,data] = [data,null];
	let ctx = new Context(data, parent, this);
	this.emit("context", ctx);
	return ctx;
};

Template.prototype.invalidate = function() {
	this.s.renderdep.changed();
	return this;
};

Template.prototype.render = function(data, key) {
	this.s.renderdep.depend();
	let ctx = this.createContext(data);
	this.s.render(ctx, key);
	this.emit("render", ctx);
	return ctx;
};

Template.prototype.paint = function(node, data) {
	if (typeof node === "string") node = document.querySelector(node);
	if (!node || node.nodeType !== Node.ELEMENT_NODE) {
		throw new Error("Expecting a valid DOM element to paint.");
	}

	let ctx = new Context(data);
	let c = Trackr.autorun(() => {
		patch(node, () => this.render(ctx));
	});

	c.context = ctx;
	c.template = this;

	c.onStop(() => {
		patch(node, ()=>{});
	});

	return c;
};

Template.prototype.helpers = function(key, value) {
	if (typeof key === "object") {
		Object.keys(key).forEach((k) => this.helpers(k, key[k]));
		return this;
	}

	if (typeof value === "undefined") this.s.helpers.delete(key);
	else this.s.helpers.set(key, value);

	return this;
};

Template.prototype.getHelper = function(key) {
	return this.s.helpers.get(key);
};

Template.render = function(name, ctx, key) {
	let tpl = getByName(name);
	if (tpl) return tpl.render(ctx, key);
};

export function getByName(name) {
	return templates[name];
}

export function paint(name, node, data) {
	let tpl = getByName(name);
	if (!tpl) throw new Error("No template exists with name '"+name+"'");
	return tpl.paint(node, data);
}
