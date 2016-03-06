import {isObject,assign,isArray,forEach,without} from "lodash";

var decorators = {};
var actions = {};

// Action Class
export class Action {
	constructor(name, scope) {
		this.name = name;
		this.scope = scope;
		this.bubbles = true;
	}

	stopPropagation() {
		this.bubbles = false;
		return this;
	}

	static create(name, scope) {
		let action;

		if (typeof name === "string") {
			action = new Action(name, scope);
		} else if (isObject(name) && !(name instanceof Action)) {
			action = assign(new Action(), action);
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
	this.removeAction = remove;
	this.decorate(decorators);
}

export default plugin;

// standard dom events
defineEvent([
	'load', 'scroll',
	'click', 'dblclick', 'mousedown', 'mouseup', 'mouseenter', 'mouseleave',
	'keydown', 'keypress', 'keyup',
	'blur', 'focus', 'change', 'input', 'submit', 'reset',
	'drag', 'dragdrop', 'dragend', 'dragenter', 'dragexit', 'dragleave', 'dragover', 'dragstart', 'drop'
]);

export function defineEvent(event) {
	if (isArray(event)) return event.forEach(defineEvent);

	decorators["on-" + event] = function(decor, key) {
		let node, args;
		let listener = function(e) {
			// create a new action object
			var action = new Action(key, decor.scope);
			action.original = e;
			action.target = action.node = node;
			action.owner = decor.owner;
			action.template = decor.template;

			// fire the action
			return fire(action, null, args);
		};

		node = decor.target;
		args = Array.prototype.slice.call(arguments, 2);

		node.addEventListener(event, listener);
		decor.comp.onInvalidate(function() {
			node.removeEventListener(event, listener);
		});
	};
}

// Msutache Instance Methods
export function add(name, fn) {
	if (typeof name === "object" && fn == null) {
		forEach(name, (fn, n) => add.call(this, n, fn));
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
		forEach(obj, function(d, n) {
			obj[n] = d.filter(function(f) { return f !== fn; });
		});
	}

	else if (obj[name] != null) {
		obj[name] = without(obj[name], fn);
	}

	return this;
}

export function fire(a, b, args) {
	let action = Action.create(a, b);
	if (!action.scope) {
		throw new Error("Action is missing a scope.");
	}

	let scope = action.scope;
	let name = action.name;
	args = [].concat(action, args);

	// runs function, unless propagation is stopped
	function run(fn) {
		if (fn.apply(scope, args) === false) {
			action.bubbles = false;
		}

		return !action.bubbles;
	}

	// bubble the action up through all the scopes
	while (action.bubbles && scope) {
		if (scope.template) {
			let acts = scope.template._actions;
			if (acts != null && Array.isArray(acts[name])) {
				acts[name].some(run);
			}
		}

		scope = scope.parent;
	}

	// bubble action to the global actions
	if (action.bubbles && Array.isArray(actions[name])) {
		actions[name].some(run);
	}

	return Boolean(action.bubbles);
}
