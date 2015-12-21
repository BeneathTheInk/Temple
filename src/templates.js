import * as _ from "lodash";
import Context from "./context";
import { load as loadPlugin } from "./plugins";
import {EventEmitter} from "events";
import Trackr from "trackr";
import {patch} from "./idom";
import {Variable as ReactiveVar} from "trackr-objects";
import assignProps from "assign-props";

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
		renderdep: new Trackr.Dependency()
	};

	// attach globally
	templates[name] = this;

	// default plugins
	this.use("decorators");
	this.use("helpers");
}

Template.prototype = Object.create(EventEmitter.prototype);
Template.prototype.constructor = Template;

assignProps(Template.prototype, {
	// render: function() { return this.s.render; }
});

// plugin API
Template.prototype.use = function use(p) {
	return loadPlugin(this, p, _.toArray(arguments).slice(1));
};

Template.prototype.createContext = function(data, parent) {
	let ctx = new Context(parent, this);
	ctx.set(data);
	if (!ctx.parent) ctx.dataVar.set(data);
	return ctx;
};

Template.prototype.invalidate = function() {
	this.s.renderdep.invalidate();
	return this;
};

Template.prototype.render = function(ctx, key) {
	this.s.renderdep.depend();
	this.s.render(ctx, key);
	this.emit("render", ctx);
	return this;
};

Template.prototype.paint = function(node, data) {
	if (typeof node === "string") node = document.querySelector(node);
	if (!node || node.nodeType !== Node.ELEMENT_NODE) {
		throw new Error("Expecting a valid DOM element to paint.");
	}

	let ctx = this.createContext(data);
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

export function getByName(name) {
	return templates[name];
}

export function paint(name, node, data) {
	let tpl = getByName(name);
	if (!tpl) throw new Error("No template exists with name '"+name+"'");
	return tpl.paint(node, data);
}
