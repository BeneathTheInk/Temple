/*
 * Temple
 * (c) 2014 Beneath the Ink, Inc.
 * MIT License
 * Version 0.4.1
 */

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Temple=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Events = require("./events"),
	Trackr = require("trackr"),
	util = require("./util");

var computedProps = [
	"isRoot", "hasChildren", "firstChild", "lastChild", "nextSibling",
	"previousSibling", "parentNode", "firstNode", "nextSiblingNode"
];

function Binding() {
	this.children = [];
	this.parent = null;
	util.defineComputedProperties(this, util.pick(this, computedProps));
	util.toArray(arguments).forEach(this.appendChild, this);
}

module.exports = Binding;
Binding.extend = util.subclass;
Binding.isBinding = function(o) {
	return o instanceof Binding;
}

util.extend(Binding.prototype, Events, {
	use: function(fn) {
		var args = util.toArray(arguments).slice(1);
		fn.apply(this, args);
		return this;
	},
	
	insertBefore: function(child, before) {
		// special case for strings and numbers
		if (~["string","number"].indexOf(typeof child))
			child = new Binding.Text(child);

		if (!Binding.isBinding(child))
			throw new Error("Expecting child to be a binding.");

		if (child === this)
			throw new Error("Cannot add binding as a child of itself.");

		// default index is the end
		var index = this.children.length,
			oparent = child.parent,
			cindex, moved = false;

		// obtain the index to insert at
		if (before != null) {
			if (!Binding.isBinding(before))
				throw new Error("Expecting before child to be a binding.");

			index = this.indexOf(before);
			if (!~index) throw new Error("Before binding is not a child of this binding.");
			if (before === child) throw new Error("Cannot add child before itself.");

			// if node is already at this location, no need to continue
			if (before.previousSibling === child) return child;
		}

		// do special things if child is already a child of this parent
		if (oparent === this) {
			cindex = this.indexOf(child);

			// if the child is already the node before the index, no need to continue
			if (cindex === index - 1) return child;

			// remove the child
			this.children.splice(cindex, 1);

			// update the index since it may have changed
			index = before != null ? this.indexOf(before) : this.children.length;
		}

		// or simulate remove from existing parent
		else if (oparent != null) {
			oparent.children.splice(oparent.indexOf(child), 1);
			child.parent = null;
			oparent.trigger("child:remove", child);
		}

		// add the child
		this.children.splice(index, 0, child);
		child.parent = this;

		// trigger events
		if (oparent === this) {
			this.trigger("child:move", child);
		} else {
			this.trigger("child:add", child);
			child.trigger("parent", this, oparent);
		}

		// update nodes last
		child.updateNodes();

		return child;
	},

	appendChild: function(child) {
		return this.insertBefore(child);
	},

	append: function() {
		util.flatten(util.toArray(arguments)).forEach(this.appendChild, this);
		return this;
	},

	removeChild: function(child) {
		var index = this.indexOf(child);
		if (!~index) return;

		// remove child
		while (index > -1) {
			this.children.splice(index, 1);
			index = this.indexOf(child, index);
		}

		child.parent = null;

		// trigger events
		this.trigger("child:remove", child);
		child.trigger("parent", null, this);

		// update nodes last
		child.updateNodes();

		return child;
	},

	empty: function() {
		this.children.slice(0).forEach(this.removeChild, this);
		return this;
	},

	contains: function(child) {
		return this.indexOf(child) > -1;
	},

	indexOf: function(child) {
		return this.children.indexOf(child);
	},

	firstChild: function() {
		return this.children[0] || null;
	},

	lastChild: function() {
		var len = this.children.length;
		return len ? this.children[len - 1] : null;
	},

	nextSibling: function() {
		if (this.isRoot) return null;

		var index = this.parent.indexOf(this),
			children = this.parent.children;

		return index > -1 && index < children.length - 1 ? children[index + 1] : null;
	},

	previousSibling: function() {
		if (this.isRoot) return null;

		var index = this.parent.indexOf(this),
			children = this.parent.children;

		return index > 0 && index < children.length ? children[index - 1] : null;
	},

	hasChildren: function() {
		return this.children.length > 0;
	},

	isRoot: function() {
		return this.parent == null;
	},

	updateNodes: function() {
		// we must update in reverse to ensure that before nodes
		// are already in the DOM when children are placed
		for (var i = this.children.length - 1; i >= 0; i--) {
			this.children[i].updateNodes();
		}

		// event is fired after, meaning children will fire their events first
		this.trigger("update");
		return this;
	},

	toNodes: function() {
		return this.children.reduce(function(nodes, child) {
			nodes.push.apply(nodes, child.toNodes());
			return nodes;
		}, []);
	},

	parentNode: function() {
		if (this.isRoot) {
			return this.placeholder != null ?
				this.placeholder.parentNode :
				null;
		}

		var parent = this.parent;

		while (parent != null) {
			if (parent instanceof Binding.Node) return parent.node;
			if (parent.isRoot) return parent.parentNode;
			parent = parent.parent;
		}

		return null;
	},

	firstNode: function() {
		var firstChild = this.firstChild;
		return firstChild != null ? firstChild.firstNode : null;
	},

	nextSiblingNode: function() {
		if (this.isRoot) {
			return this.placeholder != null ?
				this.placeholder :
				null;
		}

		var nextSibling = this.nextSibling;
		return nextSibling != null ? nextSibling.firstNode :
			this.parent instanceof Binding.Node ? null :
			this.parent.nextSiblingNode;
	},

	find: function(selector) {
		var el, i;

		for (i in this.children) {
			el = this.children[i].find(selector);
			if (el != null) return el;
		}

		return null;
	},

	findAll: function(selector) {
		return this.children.reduce(function(nodes, child) {
			nodes.push.apply(nodes, child.findAll(selector));
			return nodes;
		}, []);
	},

	paint: function(parent, beforeNode) {
		if (typeof parent === "string") parent = document.querySelector(parent);
		if (typeof beforeNode === "string") beforeNode = parent.querySelector(beforeNode);
		if (parent == null) parent = document.createDocumentFragment();
		if (this.placeholder == null) this.placeholder = document.createComment(util.uniqueId("$"));

		parent.insertBefore(this.placeholder, beforeNode);
		this.updateNodes();
		this.trigger("paint", parent, beforeNode);

		return this;
	},

	detach: function() {
		if (this.placeholder != null && this.placeholder.parentNode) {
			this.placeholder.parentNode.removeChild(this.placeholder);
		}

		this.updateNodes();
		this.trigger("detach");

		return this;
	},

	autorun: function(fn, onlyOnActive) {
		var comp = Trackr.autorun(fn, this);
		if (onlyOnActive && !Trackr.active) comp.stop();
		return comp;
	},

	toString: function() {
		return this.children.map(function(child) {
			return child.toString();
		}).join("");
	},

	// a generalized reactive workflow helper
	mount: function() {
		var args = util.toArray(arguments), comp;

		Trackr.nonreactive(function() {
			// stop existing mount
			this.stop();

			// the first event in the cycle, before everything else
			this._mounting = true;
			this.trigger("mount:before", args);
		}, this);

		// the autorun computation
		comp = this._comp = this.autorun(function(comp) {
			// only render event without bindings
			this.trigger("render:before", args, comp);

			// run render and process the resulting bindings into an array
			var bindings = this.render.apply(this, args);
			if (Binding.isBinding(bindings)) bindings = [ bindings ];
			if (!Array.isArray(bindings)) bindings = [];

			// main render event execs after render but before appending
			// the bindings array can be affected by this event
			this.trigger("render", args, comp, bindings);

			// append the bindings in order
			bindings = bindings.map(this.appendChild, this);
			
			// the last render event
			this.trigger("render:after", args, comp, bindings);

			// auto clean up
			comp.onInvalidate(function() {
				// only invalidate event with bindings
				this.trigger("invalidate:before", args, comp, bindings);
				
				// remove the bindings added before
				bindings.forEach(this.removeChild, this);
				
				// remaining invalidate events
				this.trigger("invalidate", args, comp);
				this.trigger("invalidate:after", args, comp);

				// detect if the computation stopped
				if (comp.stopped) {
					this.trigger("stop", args);
					delete this._comp;
				}
			});
		});

		// remaining mount events happen after the first render
		Trackr.nonreactive(function() {
			this.trigger("mount", args, comp);
			this.trigger("mount:after", args, comp);
			delete this._mounting;
		}, this);

		return this;
	},

	render: function(){},

	isMounted: function() {
		return this.isMounting() || this._comp != null;
	},

	isMounting: function() {
		return !!this._mounting;
	},

	getComputation: function() {
		return this._comp;
	},

	invalidate: function() {
		if (this.isMounted()) this._comp.invalidate();
		return this;
	},

	onInvalidate: function(fn) {
		if (this.isMounted()) this._comp.onInvalidate(fn);
		return this;
	},

	stop: function() {
		if (this.isMounted()) this._comp.stop();
		return this;
	}

});

// aliases
Binding.prototype.hasChild = Binding.prototype.contains;
Binding.prototype.removeAllChildren = Binding.prototype.empty;
Binding.prototype.toHTML = Binding.prototype.toString;

// Load the bindings
util.extend(Binding, require("./node"));
Binding.HTML = require("./html");
},{"./events":2,"./html":3,"./node":5,"./util":6,"trackr":8}],2:[function(require,module,exports){
var util = require("./util");

// Backbone.Events
// ---------------

// A module that can be mixed in to *any object* in order to provide it with
// custom events. You may bind with `on` or remove with `off` callback
// functions to an event; `trigger`-ing an event fires all callbacks in
// succession.
//
//     var object = {};
//     util.extend(object, Backbone.Events);
//     object.on('expand', function(){ alert('expanded'); });
//     object.trigger('expand');
//
var Events = module.exports = {

	// Bind an event to a `callback` function. Passing `"all"` will bind
	// the callback to all events fired.
	on: function(name, callback, context) {
		if (!eventsApi(this, 'on', name, [callback, context]) || !callback) return this;
		this._events || (this._events = {});
		var events = this._events[name] || (this._events[name] = []);
		events.push({callback: callback, context: context, ctx: context || this});
		return this;
	},

	// Bind an event to only be triggered a single time. After the first time
	// the callback is invoked, it will be removed.
	once: function(name, callback, context) {
		if (!eventsApi(this, 'once', name, [callback, context]) || !callback) return this;
		var self = this;
		var fn = once(function() {
			self.off(name, fn);
			callback.apply(this, arguments);
		});
		fn._callback = callback;
		return this.on(name, fn, context);
	},

	// Remove one or many callbacks. If `context` is null, removes all
	// callbacks with that function. If `callback` is null, removes all
	// callbacks for the event. If `name` is null, removes all bound
	// callbacks for all events.
	off: function(name, callback, context) {
		var retain, ev, events, names, i, l, j, k;
		if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
		if (!name && !callback && !context) {
			this._events = void 0;
			return this;
		}
		names = name ? [name] : Object.keys(this._events);
		for (i = 0, l = names.length; i < l; i++) {
			name = names[i];
			if (events = this._events[name]) {
				this._events[name] = retain = [];
				if (callback || context) {
					for (j = 0, k = events.length; j < k; j++) {
						ev = events[j];
						if ((callback && callback !== ev.callback && callback !== ev.callback._callback) ||
								(context && context !== ev.context)) {
							retain.push(ev);
						}
					}
				}
				if (!retain.length) delete this._events[name];
			}
		}

		return this;
	},

	// Trigger one or many events, firing all bound callbacks. Callbacks are
	// passed the same arguments as `trigger` is, apart from the event name
	// (unless you're listening on `"all"`, which will cause your callback to
	// receive the true name of the event as the first argument).
	trigger: function(name) {
		if (!this._events) return this;
		var args = Array.prototype.slice.call(arguments, 1);
		if (!eventsApi(this, 'trigger', name, args)) return this;
		var events = this._events[name];
		var allEvents = this._events.all;
		if (events) triggerEvents(events, args);
		if (allEvents) triggerEvents(allEvents, arguments);
		return this;
	},

	// Tell this object to stop listening to either specific events ... or
	// to every object it's currently listening to.
	stopListening: function(obj, name, callback) {
		var listeningTo = this._listeningTo;
		if (!listeningTo) return this;
		var remove = !name && !callback;
		if (!callback && typeof name === 'object') callback = this;
		if (obj) (listeningTo = {})[obj._listenId] = obj;
		for (var id in listeningTo) {
			obj = listeningTo[id];
			obj.off(name, callback, this);
			if (remove || isEmpty(obj._events)) delete this._listeningTo[id];
		}
		return this;
	}

};

// Regular expression used to split event strings.
var eventSplitter = /\s+/;

// Implement fancy features of the Events API such as multiple event
// names `"change blur"` and jQuery-style event maps `{change: action}`
// in terms of the existing API.
var eventsApi = function(obj, action, name, rest) {
	if (!name) return true;

	// Handle event maps.
	if (typeof name === 'object') {
		for (var key in name) {
			obj[action].apply(obj, [key, name[key]].concat(rest));
		}
		return false;
	}

	// Handle space separated event names.
	if (eventSplitter.test(name)) {
		var names = name.split(eventSplitter);
		for (var i = 0, l = names.length; i < l; i++) {
			obj[action].apply(obj, [names[i]].concat(rest));
		}
		return false;
	}

	return true;
};

// A difficult-to-believe, but optimized internal dispatch function for
// triggering events. Tries to keep the usual cases speedy (most internal
// Backbone events have 3 arguments).
var triggerEvents = function(events, args) {
	var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];
	switch (args.length) {
		case 0: while (++i < l) (ev = events[i]).callback.call(ev.ctx); return;
		case 1: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1); return;
		case 2: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2); return;
		case 3: while (++i < l) (ev = events[i]).callback.call(ev.ctx, a1, a2, a3); return;
		default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args); return;
	}
};

var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

// Inversion-of-control versions of `on` and `once`. Tell *this* object to
// listen to an event in another object ... keeping track of what it's
// listening to.
util.each(listenMethods, function(implementation, method) {
	Events[method] = function(obj, name, callback) {
		var listeningTo = this._listeningTo || (this._listeningTo = {});
		var id = obj._listenId || (obj._listenId = util.uniqueId('l'));
		listeningTo[id] = obj;
		if (!callback && typeof name === 'object') callback = this;
		obj[implementation](name, callback, this);
		return this;
	};
});

// Aliases for backwards compatibility.
Events.bind   = Events.on;
Events.unbind = Events.off;

function isEmpty(obj) {
	if (obj == null) return true;
	if (Array.isArray(obj) || typeof obj === "string") return obj.length === 0;
	for (var key in obj) if (util.has(obj, key)) return false;
	return true;
}

function once(func) {
	var ran = false, memo;
	return function() {
		if (ran) return memo;
		ran = true;
		memo = func.apply(this, arguments);
		func = null;
		return memo;
	}
}
},{"./util":6}],3:[function(require,module,exports){
var Binding = require("./binding"),
	util = require("./util");

module.exports = Binding.extend({
	constructor: function(value) {
		Binding.call(this);
		this.nodes = [];
		this.setValue(value);
	},

	insertBefore: function() {
		throw new Error("HTML bindings can't have children.");
	},

	updateNodes: function() {
		var parentNode = this.parentNode,
			beforeNode, node, i;

		// place the nodes in the dom
		if (parentNode != null) {
			beforeNode = this.nextSiblingNode;

			for (i = this.nodes.length - 1; i >= 0; i--) {
				node = this.nodes[i];

				if (!util.isNodeAtDOMPosition(node, parentNode, beforeNode)) {
					parentNode.insertBefore(node, beforeNode);
				}

				beforeNode = node;
			}
		}

		// or take them out
		else {
			this.removeNodes();
		}

		this.trigger("update");
		return this;
	},

	removeNodes: function() {
		var node, i;

		for (i = 0; i < this.nodes.length; i++) {
			node = this.nodes[i];
			if (node.parentNode != null) node.parentNode.removeChild(node);
		}

		return this;
	},

	setValue: function(val) {
		if (val instanceof Node) {
			val = val.nodeType === 11 ? util.toArray(val.childNodes) : [ val ];
		}

		if (!Array.isArray(val)) {
			val = val != null ? val.toString() : "";
			
			// convert html into DOM nodes
			var div = document.createElement("div");
			div.innerHTML = val;
			val = util.toArray(div.childNodes);
		}

		this.removeNodes();
		this.nodes = val;
		this.updateNodes();

		return this;
	},

	toNodes: function() {
		return this.nodes.slice(0);
	},

	firstNode: function() {
		return this.nodes[0] || null;
	},

	find: function(selector) {
		var k, node, result;

		for (k in this.nodes) {
			node = this.nodes[k];
			if (node.nodeType !== 1) continue;

			if (util.matchesSelector(node, selector)) return node;
			result = node.querySelector(selector);
			if (result != null) return result;
		}

		return null;
	},

	findAll: function(selector) {
		var k, node, els = [];

		for (k in this.nodes) {
			node = this.nodes[k];
			if (node.nodeType !== 1) continue;

			if (util.matchesSelector(node, selector)) matches.push(node);
			els.push.apply(els, util.toArray(node.querySelectorAll(selector)));
		}

		return els;
	},

	toString: function() {
		return this.nodes.map(function(node) {
			return node.nodeType === 1 ? node.outerHTML : node.nodeValue;
		}).join("");
	}
});

},{"./binding":1,"./util":6}],4:[function(require,module,exports){
var Binding = require("./binding"),
	util = require("./util");

// export
var Temple =
module.exports = Binding.extend({
	constructor: function() {
		Binding.call(this);
		this.initialize.apply(this, arguments);
	},
	initialize: function() {
		this.append(util.toArray(arguments));
	}
});

// static properties/methods
Temple.VERSION = "0.4.1";
Temple.util = util;
Temple.Events = require("./events");
Temple.Binding = Binding;

// deps setup
var Deps = Temple.Trackr = Temple.Deps = require("trackr");
Temple.autorun = Deps.autorun;
Temple.nonreactive = Deps.nonreactive;
Temple.nonreactable = Deps.nonreactable;
Temple.Dependency = Deps.Dependency;
},{"./binding":1,"./events":2,"./util":6,"trackr":8}],5:[function(require,module,exports){
var Binding = require("./binding"),
	util = require("./util");

var delegateEventSplitter = /^(\S+)\s*(.*)$/;

var Node =
exports.Node = Binding.extend({
	updateNodes: function() {
		var parentNode = this.parentNode,
			beforeNode = this.nextSiblingNode;

		// place the node in the dom
		if (parentNode != null && !util.isNodeAtDOMPosition(this.node, parentNode, beforeNode)) {
			parentNode.insertBefore(this.node, beforeNode);
		}

		// or take it out
		else if (parentNode == null && this.node.parentNode != null) {
			this.node.parentNode.removeChild(this.node);
		}

		this.trigger("update");
		return this;
	},

	prop: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.prop(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return this.node[name];
		else this.node[name] = value;

		return this;
	},

	addEventListener: function(type, sel, listener, ctx) {
		var self = this;
		
		// syntax: addEventListener({ "type selector": listener }, ctx)
		if (util.isObject(type)) {
			util.each(type, function(v, n) {
				var m = n.match(delegateEventSplitter);
				this.addEventListener(m[1], m[2], v, sel);
			}, this);
			
			return this;
		}

		// syntax: addEventListener(type, listener, ctx)
		if (typeof sel === "function") {
			if (ctx == null) ctx = listener;
			listener = sel;
			sel = null;
		}

		if (typeof type !== "string" || type === "") {
			throw new Error("Expecting non-empty string event name.");
		}

		if (typeof listener !== "function") {
			throw new Error("Expecting function for listener.");
		}

		if (this._eventListeners == null) this._eventListeners = [];
		this._eventListeners.push({ type: type, listener: listener, event: eventListener });
		this.node.addEventListener(type, eventListener);

		return this;

		function eventListener(e) {
			var delegate;

			if (typeof sel === "string" && sel !== "") {
				delegate = util.closest(e.target, sel);
				if (!delegate) return;
			}

			listener.call(ctx || self, e, delegate);
		}
	},

	addEventListenerOnce: function(type, sel, listener, ctx) {
		// syntax: addEventListenerOnce({ "type selector": listener }, ctx)
		if (util.isObject(type)) {
			return this.addEventListenerOnce(type, sel);
		}

		// syntax: addEventListenerOnce(type, listener, ctx)
		if (typeof sel === "function") {
			if (ctx == null) ctx = listener;
			listener = sel;
			sel = null;
		}

		var self = this;
		var ran = false;

		function fn() {
			if (ran) return;
			ran = true;
			self.off(name, fn);
			listener.apply(this, arguments);
		}

		fn._listener = listener;
		
		return this.addEventListener(type, sel, fn, ctx);
	},

	removeEventListener: function(type, listener) {
		if (this._eventListeners == null) return this;

		var evts = [];

		// syntax: removeEventListener(listener)
		if (typeof type === "function" && listener == null) {
			listener = type;
			type = null;
		}

		// syntax: removeEventListener({ "type selector": listener })
		if (util.isObject(type)) {
			util.each(type, function(v, n) {
				var m = n.match(delegateEventSplitter);
				evts.push.apply(evts, this._eventListeners.filter(function(e) {
					return e.type === m[1] && (e.listener === v || e.listener._listener === v) && !~evts.indexOf(e);
				}));
			}, this);
		}

		// syntax: removeEventListener(type)
		else if (listener == null) {
			evts = _.clone(this._eventListeners);
		}

		// syntax: removeEventListener(type, selector)
		else {
			evts = this._eventListeners.filter(function(e) {
				return (type == null || type === e.type) && (listener === e.listener || listener === e.listener._listener);
			});
		}

		evts.forEach(function(e) {
			var index = this._eventListeners.indexOf(e);

			if (~index) {
				this.node.removeEventListener(e.type, e.event);
				this._eventListeners.splice(index, 1);
			}
		}, this);

		return this;
	},

	toNodes: function() {
		return [ this.node ];
	},

	firstNode: function() {
		return this.node;
	},

	find: function() { return null; },
	findAll: function() { return []; }
});

function leafNode(nodeType, methodName, humanType) {
	return Node.extend({
		constructor: function(nodeOrValue) {
			// text node
			if (nodeOrValue instanceof window.Node && nodeOrValue.nodeType === nodeType) {
				this.node = nodeOrValue;
				this.value = nodeOrValue.nodeValue;
			}

			// anything else
			else {
				this.node = document[methodName]("");
				this.setValue(nodeOrValue);
			}

			Node.call(this);
		},

		insertBefore: function() {
			throw new Error(humanType + " bindings can't have children.");
		},

		setValue: function(value) {
			value = value != null ? value.toString() : "";
			if (value !== this.node.nodeValue) this.node.nodeValue = value;
			this.value = value;
			return this;
		},

		toString: function() {
			return this.node.nodeValue;
		}
	});
}

var Text = exports.Text = leafNode(3, "createTextNode", "Text");
var Comment = exports.Comment = leafNode(8, "createComment", "Comment");

Comment.prototype.toString = function() {
	return "<!--" + this.node.nodeValue + "-->";
}

var Element =
exports.Element = Node.extend({
	constructor: function(nodeOrTagName) {
		var children = util.toArray(arguments).slice(1);

		// element
		if (nodeOrTagName instanceof window.Node && nodeOrTagName.nodeType === 1) {
			this.node = nodeOrTagName;
			this.tagname = nodeOrTagName.tagName.toLowerCase();

			// add child nodes as further children
			// note: this may affect the original node's children
			fromNode(util.toArray(nodeOrTagName.childNodes))
				.forEach(function(b) { children.push(b); });
		}

		// string
		else if (typeof nodeOrTagName === "string") {
			this.tagname = nodeOrTagName;
			this.node = document.createElement(nodeOrTagName);
		}

		// or error
		else throw new Error("Expecting string for element tag name.");

		// run parent contstructor
		Node.apply(this, children);

		// apply events
		var events = typeof this.events === "function" ? this.events.call(this) : this.events;
		if (util.isObject(events)) this.addEventListener(events);
	},

	getAttribute: function(name) {
		return this.node.getAttribute(name);
	},

	setAttribute: function(name, value) {
		this.node.setAttribute(name, value);
		return this;
	},

	removeAttribute: function(name) {
		this.node.removeAttribute(name);
		return this;
	},

	attr: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.attr(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return this.getAttribute(name);
		else this.setAttribute(name, value);

		return this;
	},

	style: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.style(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return getComputedStyle(this.node)[name];
		else this.node.style[name] = value;

		return this;
	},

	hasClass: function(className) {
		return this.node.classList.contains(className);
	},

	addClass: function() {
		util.flatten(util.toArray(arguments)).forEach(function(className) {
			this.node.classList.add(className.split(" "));
		}, this);

		return this;
	},

	removeClass: function() {
		util.flatten(util.toArray(arguments)).forEach(function(className) {
			this.node.classList.remove(className.split(" "));
		}, this);

		return this;
	},

	find: function(selector) {
		if (util.matchesSelector(this.node, selector)) return this.node;
		return this.node.querySelector(selector);
	},

	findAll: function(selector) {
		var els = [];
		if (util.matchesSelector(this.node, selector)) els.push(this.node);
		els.push.apply(els, util.toArray(this.node.querySelectorAll(selector)));
		return els;
	},

	toString: function() {
		return this.node.outerHTML;
	}
});

// fast constructors for typical DOM element tagnames
exports.DOM = {};

[ // HTML tagnames; this list is taken from FB's React

"a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi",
"bdo", "big", "blockquote", "body", "br", "button", "canvas", "caption", "cite",
"code", "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn",
"div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer",
"form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "i",
"iframe", "img", "input", "ins", "kbd", "keygen", "label", "legend", "li",
"link", "main", "map", "mark", "menu", "menuitem", "meta", "meter", "nav",
"noscript", "object", "ol", "optgroup", "option", "output", "p", "param", "pre",
"progress", "q", "rp", "rt", "ruby", "s", "samp", "script", "section", "select",
"small", "source", "span", "strong", "style", "sub", "summary", "sup", "table",
"tbody", "td", "textarea", "tfoot", "th", "thead", "time", "title", "tr",
"track", "u", "ul", "var", "video", "wbr"

].forEach(function(t) {
	exports.DOM[t] = Element.extend({
		constructor: function() {
			var args = util.toArray(arguments);
			args.unshift(t);
			Element.apply(this, args);
		}
	});
});

// converts dom nodes into binding equivalents
var fromNode =
exports.fromNode = function(node) {
	if (Array.isArray(node)) {
		return node.map(fromNode)
			.filter(function(b) { return b != null; });
	}

	switch (node.nodeType) {
		// Element
		case 1: return new Element(node);
		
		// Text Node
		case 3: return new Text(node);
		
		// Comment Node
		case 8: return new Comment(node);

		// Document Fragment
		case 11:
			var binding = new Binding;

			fromNode(util.toArray(node.childNodes))
				.forEach(binding.appendChild, binding);

			return binding;
	}
}

// converts a string of HTML into a set of static bindings
exports.fromHTML = function(html) {
	var cont, nodes;
	cont = document.createElement("div")
	cont.innerHTML = html;
	nodes = fromNode(util.toArray(cont.childNodes));
	return nodes.length === 1 ? nodes[0] : new Binding().append(nodes);
}
},{"./binding":1,"./util":6}],6:[function(require,module,exports){
var toArray =
exports.toArray = function(obj) {
	return Array.prototype.slice.call(obj, 0);
}

var has =
exports.has = function(obj, key) {
	return Object.prototype.hasOwnProperty.call(obj, key);
}

var extend =
exports.extend = function(obj) {
	toArray(arguments).slice(1).forEach(function(mixin) {
		if (!mixin) return;

		for (var key in mixin) {
			obj[key] = mixin[key];
		}
	});

	return obj;
}

var each =
exports.each = function(obj, iterator, context) {
	if (obj == null) return obj;

	if (obj.forEach === Array.prototype.forEach) {
		obj.forEach(iterator, context);
	} else if (obj.length === +obj.length) {
		for (var i = 0, length = obj.length; i < length; i++) {
			iterator.call(context, obj[i], i, obj);
		}
	} else {
		var keys = Object.keys(obj);
		for (var i = 0, length = keys.length; i < length; i++) {
			iterator.call(context, obj[keys[i]], keys[i], obj);
		}
	}

	return obj;
}

var flatten =
exports.flatten = function(input, output) {
	if (output == null) output = [];

	each(input, function(value) {
		if (Array.isArray(value)) flatten(value, output);
		else output.push(value);
	});

	return output;
}

exports.pick = function(obj) {
	return flatten(toArray(arguments).slice(1))

	.reduce(function(nobj, key) {
		nobj[key] = obj[key];
		return nobj;
	}, {});
}

var isObject =
exports.isObject = function(obj) {
	return obj === Object(obj);
}

exports.uniqueId = (function() {
	var id = 0;
	return function(prefix) {
		return (prefix || "") + (++id);
	}
})();

// the subclassing function found in Backbone
var subclass =
exports.subclass = function(protoProps, staticProps) {
	var parent = this;
	var child;

	// The constructor function for the new subclass is either defined by you
	// (the "constructor" property in your `extend` definition), or defaulted
	// by us to simply call the parent's constructor.
	if (protoProps && has(protoProps, 'constructor')) {
		child = protoProps.constructor;
	} else {
		child = function(){ return parent.apply(this, arguments); };
	}

	// Add static properties to the constructor function, if supplied.
	extend(child, parent, staticProps);

	// Set the prototype chain to inherit from `parent`, without calling
	// `parent`'s constructor function.
	var Surrogate = function(){ this.constructor = child; };
	Surrogate.prototype = parent.prototype;
	child.prototype = new Surrogate;

	// Add prototype properties (instance properties) to the subclass,
	// if supplied.
	if (protoProps) extend(child.prototype, protoProps);

	// Set a convenience property in case the parent's prototype is needed
	// later.
	child.__super__ = parent.prototype;

	return child;
}

exports.isNodeAtDOMPosition = function(node, parent, before) {
	return node.parentNode === parent && node.nextSibling === before;
}

var matchesSelector = typeof Element !== "undefined" ?
	Element.prototype.matches ||
	Element.prototype.webkitMatchesSelector ||
	Element.prototype.mozMatchesSelector ||
	Element.prototype.msMatchesSelector :
	function() { return false; };

exports.matchesSelector = function(elem, selector) {
	return matchesSelector.call(elem, selector)
}

var matches = exports.matches = function(node, selector) {
	if (_.isArray(selector)) return selector.some(function(s) {
		return matches(node, s);
	});

	if (selector instanceof window.Node) {
		return node === selector;
	}
	
	if (typeof selector === "function") {
		return !!selector(node);
	}
	
	if (node.nodeType === window.Node.ELEMENT_NODE) {
		return matchesSelector.call(node, selector);
	}

	return false;
}

exports.closest = function(elem, selector) {
	while (elem != null) {
		if (elem.nodeType === 1 && matches(elem, selector)) return elem;
		elem = elem.parentNode;
	}

	return null;
}

var defineComputedProperty =
exports.defineComputedProperty = function(obj, prop, value) {
	if (typeof value !== "function")
		throw new Error("Expecting function for computed property value.");

	Object.defineProperty(obj, prop, {
		configurable: true,
		enumerable: true,
		get: function() {
			return value.call(obj);
		}
	});
}

exports.defineComputedProperties = function(obj, props) {
	Object.keys(props).forEach(function(key) {
		defineComputedProperty(obj, key, props[key]);
	});
}

var Trackr = require("trackr");

var defineReactiveProperty =
exports.defineReactiveProperty = function(obj, prop, value, coerce) {
	if (!isObject(obj)) throw new Error("Expecting object to define the reactive property on.");
	if (typeof prop !== "string") throw new Error("Expecting string for property name.");

	if (typeof value === "function" && coerce == null) {
		coerce = value;
		value = void 0;
	}

	if (typeof coerce !== "function") coerce = function(v) { return v; };

	// runs the coercion function non-reactively to prevent infinite loops
	var process = Trackr.nonreactable(function(v) {
		return coerce.call(obj, v, prop, obj);
	});

	var dep = new Trackr.Dependency;
	value = process(value);

	Object.defineProperty(obj, prop, {
		configurable: true,
		enumerable: true,
		set: function(val) {
			val = process(val);

			if (val !== value) {
				value = val;
				dep.changed();
			}

			return value;
		},
		get: function() {
			dep.depend();
			return value;
		}
	});

	return obj;
}

exports.defineReactiveProperties = function(obj, props, coerce) {
	for (var prop in props) {
		defineReactiveProperty(obj, prop, props[prop], coerce || false);
	}

	return obj;
}
},{"trackr":8}],7:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;

function drainQueue() {
    if (draining) {
        return;
    }
    draining = true;
    var currentQueue;
    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        var i = -1;
        while (++i < len) {
            currentQueue[i]();
        }
        len = queue.length;
    }
    draining = false;
}
process.nextTick = function (fun) {
    queue.push(fun);
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],8:[function(require,module,exports){
(function (process){
//////////////////////////////////////////////////
// Package docs at http://docs.meteor.com/#tracker //
// Last merge: https://github.com/meteor/meteor/blob/d07ff8e99cfde21cf113da13d35d387b0ed309a3/packages/tracker/tracker.js //
//////////////////////////////////////////////////

/**
 * @namespace Trackr
 * @summary The namespace for Trackr-related methods.
 */
Trackr = module.exports = {};

// http://docs.meteor.com/#tracker_active

/**
 * @summary True if there is a current computation, meaning that dependencies on reactive data sources will be tracked and potentially cause the current computation to be rerun.
 * @locus Client
 * @type {Boolean}
 */
Trackr.active = false;

// http://docs.meteor.com/#tracker_currentcomputation

/**
 * @summary The current computation, or `null` if there isn't one.  The current computation is the [`Trackr.Computation`](#tracker_computation) object created by the innermost active call to `Trackr.autorun`, and it's the computation that gains dependencies when reactive data sources are accessed.
 * @locus Client
 * @type {Trackr.Computation}
 */
Trackr.currentComputation = null;

var setCurrentComputation = function (c) {
	Trackr.currentComputation = c;
	Trackr.active = !! c;
};

var _debugFunc = function () {
	// We want this code to work without Meteor, and also without
	// "console" (which is technically non-standard and may be missing
	// on some browser we come across, like it was on IE 7).
	//
	// Lazy evaluation because `Meteor` does not exist right away.(??)
	return (typeof Meteor !== "undefined" ? Meteor._debug :
					((typeof console !== "undefined") && console.log ?
					 function () { console.log.apply(console, arguments); } :
					 function () {}));
};

var _throwOrLog = function (from, e) {
	if (throwFirstError) {
		throw e;
	} else {
		var messageAndStack;
		if (e.stack && e.message) {
			var idx = e.stack.indexOf(e.message);
			if (idx >= 0 && idx <= 10) // allow for "Error: " (at least 7)
				messageAndStack = e.stack; // message is part of e.stack, as in Chrome
			else
				messageAndStack = e.message +
				(e.stack.charAt(0) === '\n' ? '' : '\n') + e.stack; // e.g. Safari
		} else {
			messageAndStack = e.stack || e.message;
		}
		_debugFunc()("Exception from Trackr " + from + " function:",
								 messageAndStack);
	}
};

// Takes a function `f`, and wraps it in a `Meteor._noYieldsAllowed`
// block if we are running on the server. On the client, returns the
// original function (since `Meteor._noYieldsAllowed` is a
// no-op). This has the benefit of not adding an unnecessary stack
// frame on the client.
var withNoYieldsAllowed = function (f) {
	if ((typeof Meteor === 'undefined') || Meteor.isClient) {
		return f;
	} else {
		return function () {
			var args = arguments;
			Meteor._noYieldsAllowed(function () {
				f.apply(null, args);
			});
		};
	}
};

var nextId = 1;
// computations whose callbacks we should call at flush time
var pendingComputations = [];
// `true` if a Trackr.flush is scheduled, or if we are in Trackr.flush now
var willFlush = false;
// `true` if we are in Trackr.flush now
var inFlush = false;
// `true` if we are computing a computation now, either first time
// or recompute.  This matches Trackr.active unless we are inside
// Trackr.nonreactive, which nullfies currentComputation even though
// an enclosing computation may still be running.
var inCompute = false;
// `true` if the `_throwFirstError` option was passed in to the call
// to Trackr.flush that we are in. When set, throw rather than log the
// first error encountered while flushing. Before throwing the error,
// finish flushing (from a finally block), logging any subsequent
// errors.
var throwFirstError = false;

var afterFlushCallbacks = [];

// controls the deferral
Trackr.nextTick = typeof process !== "undefined" ? process.nextTick : 
	function (f) { setTimeout(f, 0); };

var requireFlush = function () {
	if (! willFlush) {
		Trackr.nextTick(Trackr.flush);
		willFlush = true;
	}
};

// Trackr.Computation constructor is visible but private
// (throws an error if you try to call it)
var constructingComputation = false;

//
// http://docs.meteor.com/#tracker_computation

/**
 * @summary A Computation object represents code that is repeatedly rerun
 * in response to
 * reactive data changes. Computations don't have return values; they just
 * perform actions, such as rerendering a template on the screen. Computations
 * are created using Trackr.autorun. Use stop to prevent further rerunning of a
 * computation.
 * @instancename computation
 */
Trackr.Computation = function (f, parent, ctx) {
	if (! constructingComputation)
		throw new Error(
			"Trackr.Computation constructor is private; use Trackr.autorun");
	constructingComputation = false;

	var self = this;

	// http://docs.meteor.com/#computation_stopped

	/**
	 * @summary True if this computation has been stopped.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name  stopped
	 */
	self.stopped = false;

	// http://docs.meteor.com/#computation_invalidated

	/**
	 * @summary True if this computation has been invalidated (and not yet rerun), or if it has been stopped.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name  invalidated
	 * @type {Boolean}
	 */
	self.invalidated = false;

	// http://docs.meteor.com/#computation_firstrun

	/**
	 * @summary True during the initial run of the computation at the time `Trackr.autorun` is called, and false on subsequent reruns and at other times.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name  firstRun
	 * @type {Boolean}
	 */
	self.firstRun = true;

	self._id = nextId++;
	self._onInvalidateCallbacks = [];
	// the plan is at some point to use the parent relation
	// to constrain the order that computations are processed
	self._parent = parent;
	self._func = f;
	self._recomputing = false;
	self._context = ctx || null;

	var errored = true;
	try {
		self._compute();
		errored = false;
	} finally {
		self.firstRun = false;
		if (errored)
			self.stop();
	}
};

// http://docs.meteor.com/#computation_oninvalidate

/**
 * @summary Registers `callback` to run when this computation is next invalidated, or runs it immediately if the computation is already invalidated.  The callback is run exactly once and not upon future invalidations unless `onInvalidate` is called again after the computation becomes valid again.
 * @locus Client
 * @param {Function} callback Function to be called on invalidation. Receives one argument, the computation that was invalidated.
 */
Trackr.Computation.prototype.onInvalidate = function (f, ctx) {
	var self = this;

	if (typeof f !== 'function')
		throw new Error("onInvalidate requires a function");

	if (self.invalidated) {
		Trackr.nonreactive(function () {
			withNoYieldsAllowed(f).call(ctx !== void 0 ? ctx : self._context, self);
		});
	} else {
		self._onInvalidateCallbacks.push({ fn: f, ctx: ctx });
	}
};

// http://docs.meteor.com/#computation_invalidate

/**
 * @summary Invalidates this computation so that it will be rerun.
 * @locus Client
 */
Trackr.Computation.prototype.invalidate = function () {
	var self = this;
	if (! self.invalidated) {
		// if we're currently in _recompute(), don't enqueue
		// ourselves, since we'll rerun immediately anyway.
		if (! self._recomputing && ! self.stopped) {
			requireFlush();
			pendingComputations.push(this);
		}

		self.invalidated = true;

		// callbacks can't add callbacks, because
		// self.invalidated === true.
		for(var i = 0, f; f = self._onInvalidateCallbacks[i]; i++) {
			Trackr.nonreactive(function () {
				withNoYieldsAllowed(f.fn).call(f.ctx !== void 0 ? f.ctx : self._context, self);
			});
		}
		self._onInvalidateCallbacks = [];
	}
};

// http://docs.meteor.com/#computation_stop

/**
 * @summary Prevents this computation from rerunning.
 * @locus Client
 */
Trackr.Computation.prototype.stop = function () {
	if (! this.stopped) {
		this.stopped = true;
		this.invalidate();
	}
};

Trackr.Computation.prototype._compute = function () {
	var self = this;
	self.invalidated = false;

	var previous = Trackr.currentComputation;
	setCurrentComputation(self);
	var previousInCompute = inCompute;
	inCompute = true;
	try {
		withNoYieldsAllowed(self._func).call(self._context, self);
	} finally {
		setCurrentComputation(previous);
		inCompute = previousInCompute;
	}
};

Trackr.Computation.prototype._recompute = function () {
	var self = this;

	self._recomputing = true;
	try {
		while (self.invalidated && ! self.stopped) {
			try {
				self._compute();
			} catch (e) {
				_throwOrLog("recompute", e);
			}
			// If _compute() invalidated us, we run again immediately.
			// A computation that invalidates itself indefinitely is an
			// infinite loop, of course.
			//
			// We could put an iteration counter here and catch run-away
			// loops.
		}
	} finally {
		self._recomputing = false;
	}
};

//
// http://docs.meteor.com/#tracker_dependency

/**
 * @summary A Dependency represents an atomic unit of reactive data that a
 * computation might depend on. Reactive data sources such as Session or
 * Minimongo internally create different Dependency objects for different
 * pieces of data, each of which may be depended on by multiple computations.
 * When the data changes, the computations are invalidated.
 * @class
 * @instanceName dependency
 */
Trackr.Dependency = function () {
	this._dependentsById = {};
};

// http://docs.meteor.com/#dependency_depend
//
// Adds `computation` to this set if it is not already
// present.  Returns true if `computation` is a new member of the set.
// If no argument, defaults to currentComputation, or does nothing
// if there is no currentComputation.

/**
 * @summary Declares that the current computation (or `fromComputation` if given) depends on `dependency`.  The computation will be invalidated the next time `dependency` changes.

If there is no current computation and `depend()` is called with no arguments, it does nothing and returns false.

Returns true if the computation is a new dependent of `dependency` rather than an existing one.
 * @locus Client
 * @param {Trackr.Computation} [fromComputation] An optional computation declared to depend on `dependency` instead of the current computation.
 * @returns {Boolean}
 */
Trackr.Dependency.prototype.depend = function (computation) {
	if (! computation) {
		if (! Trackr.active)
			return false;

		computation = Trackr.currentComputation;
	}
	var self = this;
	var id = computation._id;
	if (! (id in self._dependentsById)) {
		self._dependentsById[id] = computation;
		computation.onInvalidate(function () {
			delete self._dependentsById[id];
		});
		return true;
	}
	return false;
};

// http://docs.meteor.com/#dependency_changed

/**
 * @summary Invalidate all dependent computations immediately and remove them as dependents.
 * @locus Client
 */
Trackr.Dependency.prototype.changed = function () {
	var self = this;
	for (var id in self._dependentsById)
		self._dependentsById[id].invalidate();
};

// http://docs.meteor.com/#dependency_hasdependents

/**
 * @summary True if this Dependency has one or more dependent Computations, which would be invalidated if this Dependency were to change.
 * @locus Client
 * @returns {Boolean}
 */
Trackr.Dependency.prototype.hasDependents = function () {
	var self = this;
	for(var id in self._dependentsById)
		return true;
	return false;
};

// http://docs.meteor.com/#tracker_flush

/**
 * @summary Process all reactive updates immediately and ensure that all invalidated computations are rerun.
 * @locus Client
 */
Trackr.flush = function (_opts) {
	// XXX What part of the comment below is still true? (We no longer
	// have Spark)
	//
	// Nested flush could plausibly happen if, say, a flush causes
	// DOM mutation, which causes a "blur" event, which runs an
	// app event handler that calls Trackr.flush.  At the moment
	// Spark blocks event handlers during DOM mutation anyway,
	// because the LiveRange tree isn't valid.  And we don't have
	// any useful notion of a nested flush.
	//
	// https://app.asana.com/0/159908330244/385138233856
	if (inFlush)
		throw new Error("Can't call Trackr.flush while flushing");

	if (inCompute)
		throw new Error("Can't flush inside Trackr.autorun");

	inFlush = true;
	willFlush = true;
	throwFirstError = !! (_opts && _opts._throwFirstError);

	var finishedTry = false;
	try {
		while (pendingComputations.length ||
					 afterFlushCallbacks.length) {

			// recompute all pending computations
			while (pendingComputations.length) {
				var comp = pendingComputations.shift();
				comp._recompute();
			}

			if (afterFlushCallbacks.length) {
				// call one afterFlush callback, which may
				// invalidate more computations
				var cb = afterFlushCallbacks.shift();
				try {
					cb.fn.call(cb.ctx);
				} catch (e) {
					_throwOrLog("afterFlush", e);
				}
			}
		}
		finishedTry = true;
	} finally {
		if (! finishedTry) {
			// we're erroring
			inFlush = false; // needed before calling `Trackr.flush()` again
			Trackr.flush({_throwFirstError: false}); // finish flushing
		}
		willFlush = false;
		inFlush = false;
	}
};

// http://docs.meteor.com/#tracker_autorun
//
// Run f(). Record its dependencies. Rerun it whenever the
// dependencies change.
//
// Returns a new Computation, which is also passed to f.
//
// Links the computation to the current computation
// so that it is stopped if the current computation is invalidated.

/**
 * @summary Run a function now and rerun it later whenever its dependencies change. Returns a Computation object that can be used to stop or observe the rerunning.
 * @locus Client
 * @param {Function} runFunc The function to run. It receives one argument: the Computation object that will be returned.
 * @returns {Trackr.Computation}
 */
Trackr.autorun = function (f, ctx) {
	if (typeof f !== 'function')
		throw new Error('Trackr.autorun requires a function argument');

	constructingComputation = true;
	var c = new Trackr.Computation(f, Trackr.currentComputation, ctx);

	if (Trackr.active)
		Trackr.onInvalidate(function () {
			c.stop();
		});

	return c;
};

// http://docs.meteor.com/#tracker_nonreactive
//
// Run `f` with no current computation, returning the return value
// of `f`.  Used to turn off reactivity for the duration of `f`,
// so that reactive data sources accessed by `f` will not result in any
// computations being invalidated.

/**
 * @summary Run a function without tracking dependencies.
 * @locus Client
 * @param {Function} func A function to call immediately.
 */
Trackr.nonReactive = 
Trackr.nonreactive = function (f, ctx) {
	var previous = Trackr.currentComputation;
	setCurrentComputation(null);
	try {
		return f.call(ctx);
	} finally {
		setCurrentComputation(previous);
	}
};

// like nonreactive but makes a function
Trackr.nonReactable = 
Trackr.nonreactable = function (f, ctx) {
	return function() {
		return Trackr.nonreactive(f, ctx);
	};
};

// http://docs.meteor.com/#tracker_oninvalidate

/**
 * @summary Registers a new [`onInvalidate`](#computation_oninvalidate) callback on the current computation (which must exist), to be called immediately when the current computation is invalidated or stopped.
 * @locus Client
 * @param {Function} callback A callback function that will be invoked as `func(c)`, where `c` is the computation on which the callback is registered.
 */
Trackr.onInvalidate = function (f, ctx) {
	if (! Trackr.active)
		throw new Error("Trackr.onInvalidate requires a currentComputation");

	Trackr.currentComputation.onInvalidate(f, ctx);
};

// http://docs.meteor.com/#tracker_afterflush

/**
 * @summary Schedules a function to be called during the next flush, or later in the current flush if one is in progress, after all invalidated computations have been rerun.  The function will be run once and not on subsequent flushes unless `afterFlush` is called again.
 * @locus Client
 * @param {Function} callback A function to call at flush time.
 */
Trackr.afterFlush = function (f, ctx) {
	afterFlushCallbacks.push({ fn: f, ctx: ctx });
	requireFlush();
};
}).call(this,require('_process'))
},{"_process":7}]},{},[4])(4)
});