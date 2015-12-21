import * as _ from "lodash";
import { register } from "./";
// import { getPropertyFromClass } from "../utils";

var slice = Array.prototype.slice;
var decorators = {};
var actions = {};

// Action Class
export class Action {
	constructor(name) {
		this.name = name;
		this.bubbles = true;
	}

	stopPropagation() {
		this.bubbles = false;
		return this;
	}
}

// the plugin
export function plugin() {
	this.use("decorators");
	this._actions = {};
	this.actions = this.addAction = add;
	this.addActionOnce = addOnce;
	this.removeAction = remove;
	// this.fireAction = fire;
	this.decorate(decorators);

	this.on("context", function(c) {
		c.fireAction = fire;
	});

	// // copy inherited actions
	// if (typeof this !== "function") {
	// 	var decs = getPropertyFromClass(this, "_actions");
	// 	this._actions = _.extend(this._actions || {}, decs);
	// }
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
			var action = new Action(key);
			action.original = e;
			action.target = action.node = node;
			action.context = decor.context;
			action.template = decor.template;

			// find the first parent with the fire method
			let fireOn = decor.context;
			while (fireOn && !fireOn.fireAction) {
				fireOn = fireOn.parent;
			}

			// fire the action
			if (fireOn) {
				fireOn.fireAction.apply(fireOn, [ action ].concat(args));
			}
		}

		node = decor.target;
		args = _.isArray(args) ? args : [ args ];
		key = args.shift();

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

export function fire(action) {
	if (typeof action === "string") action = new Action(action);
	if (_.isObject(action) && !(action instanceof Action)) action = _.extend(new Action(), action);
	if (!(action instanceof Action)) throw new Error("Expecting action name, object or instance of Action.");

	var ctx = this,
		name = action.name,
		args = slice.call(arguments, 1);

	args.unshift(action);

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

	return this;
}
