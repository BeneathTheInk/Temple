import * as _ from "lodash";
import { register } from "./";

var decorators = {};
var actions = {};

// Action Class
export class Action {
	constructor(name, context) {
		this.name = name;
		this.context = context;
		this.bubbles = true;
	}

	stopPropagation() {
		this.bubbles = false;
		return this;
	}

	static create(name, context) {
		let action;

		if (typeof name === "string") {
			action = new Action(name, context);
		} else if (_.isObject(name) && !(name instanceof Action)) {
			action = _.extend(new Action(), action);
		} else {
			action = name;
		}

		if (!(action instanceof Action)) {
			throw new Error("Expecting action name, object or instance of Action.");
		}

		return action;
	}
}

// the plugin
export function plugin() {
	this.use("decorators");
	this._actions = {};
	this.actions = this.addAction = add;
	this.addActionOnce = addOnce;
	this.removeAction = remove;
	this.fireAction = fireTemplate;
	this.decorate(decorators);
}

export default plugin;
register("actions", plugin);

// standard dom events
defineEvent([
	'load', 'scroll',
	'click', 'dblclick', 'mousedown', 'mouseup', 'mouseenter', 'mouseleave',
	'keydown', 'keypress', 'keyup',
	'blur', 'focus', 'change', 'input', 'submit', 'reset',
	'drag', 'dragdrop', 'dragend', 'dragenter', 'dragexit', 'dragleave', 'dragover', 'dragstart', 'drop'
]);

export function defineEvent(event) {
	if (_.isArray(event)) return event.forEach(defineEvent);

	decorators["on-" + event] = function(decor, args) {
		let node, key;

		function listener(e) {
			// create a new action object
			var action = new Action(key, decor.context);
			action.original = e;
			action.target = action.node = node;
			action.template = decor.template;

			// fire the action
			fire(action, null, args);
		}

		node = decor.target;
		args = [].concat(args);
		key = args.shift();
		if (!key) return;

		node.addEventListener(event, listener);
		decor.comp.onInvalidate(function() {
			node.removeEventListener(event, listener);
		});
	};
}

// Msutache Instance Methods
export function add(name, fn) {
	if (typeof name === "object" && fn == null) {
		_.each(name, function(fn, n) { add.call(this, n, fn); }, this);
		return this;
	}

	if (typeof name !== "string" || name === "") throw new Error("Expecting non-empty string for action name.");
	if (typeof fn !== "function") throw new Error("Expecting function for action.");

	var obj = this._actions;
	if (!obj) obj = actions;
	if (obj[name] == null) obj[name] = [];
	if (!~obj[name].indexOf(fn)) obj[name].push(fn);

	return this;
}

export function addOnce(name, fn) {
	if (typeof name === "object" && fn == null) {
		_.each(name, function(fn, n) { addOnce.call(this, n, fn); }, this);
		return this;
	}

	var onAction;

	add.call(this, name, onAction = function () {
		remove.call(this, name, onAction);
		fn.apply(this, arguments);
	});

	return this;
}

export function remove(name, fn) {
	if (typeof name === "function" && fn == null) {
		fn = name;
		name = null;
	}

	var obj = this._actions;
	if (!obj) obj = actions;

	if (name == null && fn == null) {
		// clear actions, but never on the global
		if (this._actions != null) this._actions = {};
	}

	else if (fn == null) {
		delete obj[name];
	}

	else if (name == null) {
		_.each(obj, function(d, n) {
			obj[n] = d.filter(function(f) { return f !== fn; });
		});
	}

	else if (obj[name] != null) {
		obj[name] = _.without(obj[name], fn);
	}

	return this;
}

export function fire(a, b, args) {
	let action = Action.create(a, b);

	if (!action.context) {
		throw new Error("Action is missing a context.");
	}

	let ctx = action.context;
	let name = action.name;
	args = [].concat(action, args);

	// runs function, unless propagation is stopped
	function run(fn) {
		if (!action.bubbles) return true;
		fn.apply(ctx && ctx.template, args);
	}

	// bubble the action up through all the contexts
	while (action.bubbles && ctx) {
		if (ctx.template) {
			let acts = ctx.template._actions;
			if (acts != null && Array.isArray(acts[name])) {
				acts[name].some(run);
			}
		}

		ctx = ctx.parent;
	}

	// bubble action to the global actions
	if (action.bubbles && Array.isArray(actions[name])) {
		actions[name].some(run);
	}

	return action;
}

function fireTemplate(name, ctx, value) {
	return fire(name, ctx, this, value);
}
