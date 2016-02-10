import * as _ from "underscore";
import { register } from "./";
import { getPropertyFromClass } from "../utils";

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
	this.fireAction = fire;
	this.decorate(decorators, { inline: true });

	// copy inherited actions
	if (typeof this !== "function") {
		var decs = getPropertyFromClass(this, "_actions");
		this._actions = _.extend(this._actions || {}, decs);
	}
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

	decorators["on-" + event] = function(decor, key) {
		var self = this,
			args, node;

		function listener(e) {
			// create a new action object
			var action = new Action(key);
			action.original = e;
			action.target = action.node = node;
			action.context = decor.context;
			action.view = decor.view;

			// find the first parent with the fire method
			var fireOn = self;
			while (typeof fireOn.fireAction !== "function") {
				// if it has no parent, we can't do anything
				if (fireOn.parent == null) return;
				fireOn = fireOn.parent;
			}

			// fire the action
			return fireOn.fireAction.apply(fireOn, [ action ].concat(args));
		}

		node = decor.target;
		args = _.toArray(arguments).slice(2);
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

	var name = action.name,
		args = slice.call(arguments, 1),
		view = this;

	args.unshift(action);

	// runs function, unless propagation is stopped
	function run(fn) {
		if (fn.apply(view, args) === false) {
			action.bubbles = false;
		}
		
		return !action.bubbles;
	}

	// bubble the action up through all the views
	while (action.bubbles && view) {
		if (view._actions != null && Array.isArray(view._actions[name])) {
			view._actions[name].some(run);
		}

		view = view.parent;
	}

	// bubble action to the global actions
	if (action.bubbles && Array.isArray(actions[name])) {
		actions[name].some(run);
	}

	return Boolean(action.bubbles);
}
