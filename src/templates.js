import * as _ from "lodash";
import View from "./view";
import { load as loadPlugin } from "./plugins";
import {EventEmitter} from "events";

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
		render: render
	};

	// attach globally
	templates[name] = this;

	// default plugins
	this.use("decorators");
	this.use("helpers");
}

Template.prototype = Object.create(EventEmitter.prototype);
Template.prototype.constructor = Template;

// plugin API
Template.prototype.use = function use(p) {
	return loadPlugin(this, p, _.toArray(arguments).slice(1));
};

Template.prototype.createView = function(parent) {
	let v = View("template", this.s.render, parent);
	v.template = this;
	this.emit("view", v);
	return v;
};

Template.prototype.render = function(data, parent) {
	let v = this.createView(parent);
	if (data) v.set(data);
	if (!v.parent) v.dataVar.set(data);
	return v;
};

Template.prototype.paint = function(data, node, parent) {
	return this.render(data, parent).paint(node);
};

export function getByName(name) {
	return templates[name];
}

export function render(name, data, parent) {
	let tpl = getByName(name);
	if (!tpl) throw new Error("No template exists with name '"+name+"'");
	return tpl.render(data, parent);
}
