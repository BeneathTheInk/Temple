import {toArray,includes,has,assign} from "lodash";
import Context from "./context";
import {EventEmitter} from "events";
import Trackr from "trackr";
import {patch} from "./idom";
import {Map as ReactiveMap} from "trackr-objects";
import { load as loadPlugin } from "./plugins";
import subclass from "backbone-extend-standalone";

export var templates = {};
export var types = {};

export function Template(name, render) {
	if (typeof name !== "string" || name === "") {
		throw new Error("Expecting a non-empty string for template name.");
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

	// default plugins
	this.use("decorators");
	this.initialize();
}

Template.extend = subclass;
Template.prototype = Object.create(EventEmitter.prototype);
Template.prototype.constructor = Template;
Template.prototype.type = "template";
Template.prototype.initialize = function(){};

// plugin proxy for contexts
Template.prototype.use = function use(p) {
	return loadPlugin(this, p, toArray(arguments).slice(1));
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

const injectable_nodes = [
	1,  // Node.ELEMENT_NODE,
	9,  // Node.DOCUMENT_NODE,
	11, // Node.DOCUMENT_FRAGMENT_NODE
];

Template.prototype.paint = function(node, data) {
	if (typeof node === "string") node = document.querySelector(node);
	if (!node || !includes(injectable_nodes, node.nodeType)) {
		throw new Error("Expecting a valid DOM element to paint.");
	}

	let ctx = data instanceof Context ? data : new Context(data);
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

var globalHelpers = new ReactiveMap();

export var helpers =
Template.prototype.helpers = function(key, value) {
	if (typeof key === "object") {
		Object.keys(key).forEach((k) => helpers.call(this, k, key[k]));
		return this;
	}

	var h = globalHelpers;
	if (this instanceof Template) h = this.s.helpers;

	if (typeof value === "undefined") h.delete(key);
	else h.set(key, value);

	return this;
};

export var getHelper =
Template.prototype.getHelper = function(key) {
	if (this instanceof Template) {
		return this.s.helpers.get(key);
	}

	return globalHelpers.get(key);
};

export function render(name, ctx, key) {
	let tpl = getByName(name);
	if (tpl) return tpl.render(ctx, key);
}

export function getByName(name) {
	return templates[name];
}

export function paint(tpl, node, data) {
	if (typeof tpl === "string") {
		tpl = getByName(tpl);
		if (!tpl) throw new Error("No template exists with name '"+tpl+"'");
	}
	if (!(tpl instanceof Template)) {
		throw new Error("Expecting template name or instance of Template.");
	}
	return tpl.paint(node, data);
}

export function registerType(type, props) {
	if (typeof type !== "string" || !type) {
		throw new Error("Expecting non-empty string for type.");
	}
	if (has(types, type)) {
		throw new Error(`Template type '${type}' already exists.`);
	}

	if (typeof props === "function") {
		props = { initialize: props };
	}

	props = assign({}, props, { type });

	let T = Template;
	if (props.extends && has(types, props.extends)) {
		T = types[props.extends];
		delete props.extends;
	}

	function wrap(k, f) {
		return function() {
			let osuper = this.super;
			this.super = T.prototype[k];
			let ret = f.apply(this, arguments);
			this.super = osuper;
			return ret;
		};
	}

	for (let k in props) {
		let fn = props[k];
		if (typeof fn !== "function") continue;
		if (/this\.super|this\["super"\]|this\['super'\]/.test(fn.toString())) {
			props[k] = wrap(k, fn);
		}
	}

	return (types[type] = T.extend(props));
}

export function create(name, type, render) {
	if (typeof name !== "string" || !name) {
		throw new Error("Expecting non-empty string for name.");
	}
	if (getByName(name)) {
		throw new Error(`Template '${name}' already exists.`);
	}

	if (typeof type === "function") [render,type] = [type,null];
	if (type && !has(types, type)) {
		throw new Error(`Template type ${type} does not exist.`);
	}

	let T = type ? types[type] : Template;
	return (templates[name] = new T(name, render));
}
