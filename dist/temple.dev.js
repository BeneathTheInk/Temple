/*
 * Temple (with Source Map)
 * (c) 2014 Beneath the Ink, Inc.
 * MIT License
 * Version 0.4.2
 */

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Temple = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
Temple.VERSION = "0.4.2";
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
			this.insertNode(parentNode, beforeNode);
		}

		// or take it out
		else if (parentNode == null && this.node.parentNode != null) {
			this.removeNode();
		}

		this.trigger("update");
		return this;
	},

	insertNode: function(parent, before) {
		parent.insertBefore(this.node, before);
	},

	removeNode: function() {
		this.node.parentNode.removeChild(this.node);
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
var Trackr = module.exports = {};

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

// look for a requestAnimationFrame as that is preferable over nextTick or setImmediate
var requestAnimationFrame = typeof window !== "undefined" ?
	window.requestAnimationFrame ||
	window.mozRequestAnimationFrame ||
	window.webkitRequestAnimationFrame ||
	window.oRequestAnimationFrame :
	null;

// controls the deferral
Trackr.nextTick = requestAnimationFrame != null ? requestAnimationFrame.bind(window) :
	typeof process !== "undefined" ? process.nextTick :
	function (f) { setTimeout(f, 16); };

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

// like nonreactive but makes a function instead
Trackr.nonReactable = 
Trackr.nonreactable = function (f, ctx) {
	return function() {
		var args = arguments;
		if (ctx == null) ctx = this;
		return Trackr.nonreactive(function() {
			return f.apply(ctx, args);
		});
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvYmluZGluZy5qcyIsImxpYi9ldmVudHMuanMiLCJsaWIvaHRtbC5qcyIsImxpYi9pbmRleC5qcyIsImxpYi9ub2RlLmpzIiwibGliL3V0aWwuanMiLCJub2RlX21vZHVsZXMvZ3J1bnQtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci90cmFja3IuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgRXZlbnRzID0gcmVxdWlyZShcIi4vZXZlbnRzXCIpLFxuXHRUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxudmFyIGNvbXB1dGVkUHJvcHMgPSBbXG5cdFwiaXNSb290XCIsIFwiaGFzQ2hpbGRyZW5cIiwgXCJmaXJzdENoaWxkXCIsIFwibGFzdENoaWxkXCIsIFwibmV4dFNpYmxpbmdcIixcblx0XCJwcmV2aW91c1NpYmxpbmdcIiwgXCJwYXJlbnROb2RlXCIsIFwiZmlyc3ROb2RlXCIsIFwibmV4dFNpYmxpbmdOb2RlXCJcbl07XG5cbmZ1bmN0aW9uIEJpbmRpbmcoKSB7XG5cdHRoaXMuY2hpbGRyZW4gPSBbXTtcblx0dGhpcy5wYXJlbnQgPSBudWxsO1xuXHR1dGlsLmRlZmluZUNvbXB1dGVkUHJvcGVydGllcyh0aGlzLCB1dGlsLnBpY2sodGhpcywgY29tcHV0ZWRQcm9wcykpO1xuXHR1dGlsLnRvQXJyYXkoYXJndW1lbnRzKS5mb3JFYWNoKHRoaXMuYXBwZW5kQ2hpbGQsIHRoaXMpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEJpbmRpbmc7XG5CaW5kaW5nLmV4dGVuZCA9IHV0aWwuc3ViY2xhc3M7XG5CaW5kaW5nLmlzQmluZGluZyA9IGZ1bmN0aW9uKG8pIHtcblx0cmV0dXJuIG8gaW5zdGFuY2VvZiBCaW5kaW5nO1xufVxuXG51dGlsLmV4dGVuZChCaW5kaW5nLnByb3RvdHlwZSwgRXZlbnRzLCB7XG5cdHVzZTogZnVuY3Rpb24oZm4pIHtcblx0XHR2YXIgYXJncyA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xuXHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXHRcblx0aW5zZXJ0QmVmb3JlOiBmdW5jdGlvbihjaGlsZCwgYmVmb3JlKSB7XG5cdFx0Ly8gc3BlY2lhbCBjYXNlIGZvciBzdHJpbmdzIGFuZCBudW1iZXJzXG5cdFx0aWYgKH5bXCJzdHJpbmdcIixcIm51bWJlclwiXS5pbmRleE9mKHR5cGVvZiBjaGlsZCkpXG5cdFx0XHRjaGlsZCA9IG5ldyBCaW5kaW5nLlRleHQoY2hpbGQpO1xuXG5cdFx0aWYgKCFCaW5kaW5nLmlzQmluZGluZyhjaGlsZCkpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgY2hpbGQgdG8gYmUgYSBiaW5kaW5nLlwiKTtcblxuXHRcdGlmIChjaGlsZCA9PT0gdGhpcylcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBhZGQgYmluZGluZyBhcyBhIGNoaWxkIG9mIGl0c2VsZi5cIik7XG5cblx0XHQvLyBkZWZhdWx0IGluZGV4IGlzIHRoZSBlbmRcblx0XHR2YXIgaW5kZXggPSB0aGlzLmNoaWxkcmVuLmxlbmd0aCxcblx0XHRcdG9wYXJlbnQgPSBjaGlsZC5wYXJlbnQsXG5cdFx0XHRjaW5kZXgsIG1vdmVkID0gZmFsc2U7XG5cblx0XHQvLyBvYnRhaW4gdGhlIGluZGV4IHRvIGluc2VydCBhdFxuXHRcdGlmIChiZWZvcmUgIT0gbnVsbCkge1xuXHRcdFx0aWYgKCFCaW5kaW5nLmlzQmluZGluZyhiZWZvcmUpKVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYmVmb3JlIGNoaWxkIHRvIGJlIGEgYmluZGluZy5cIik7XG5cblx0XHRcdGluZGV4ID0gdGhpcy5pbmRleE9mKGJlZm9yZSk7XG5cdFx0XHRpZiAoIX5pbmRleCkgdGhyb3cgbmV3IEVycm9yKFwiQmVmb3JlIGJpbmRpbmcgaXMgbm90IGEgY2hpbGQgb2YgdGhpcyBiaW5kaW5nLlwiKTtcblx0XHRcdGlmIChiZWZvcmUgPT09IGNoaWxkKSB0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgYWRkIGNoaWxkIGJlZm9yZSBpdHNlbGYuXCIpO1xuXG5cdFx0XHQvLyBpZiBub2RlIGlzIGFscmVhZHkgYXQgdGhpcyBsb2NhdGlvbiwgbm8gbmVlZCB0byBjb250aW51ZVxuXHRcdFx0aWYgKGJlZm9yZS5wcmV2aW91c1NpYmxpbmcgPT09IGNoaWxkKSByZXR1cm4gY2hpbGQ7XG5cdFx0fVxuXG5cdFx0Ly8gZG8gc3BlY2lhbCB0aGluZ3MgaWYgY2hpbGQgaXMgYWxyZWFkeSBhIGNoaWxkIG9mIHRoaXMgcGFyZW50XG5cdFx0aWYgKG9wYXJlbnQgPT09IHRoaXMpIHtcblx0XHRcdGNpbmRleCA9IHRoaXMuaW5kZXhPZihjaGlsZCk7XG5cblx0XHRcdC8vIGlmIHRoZSBjaGlsZCBpcyBhbHJlYWR5IHRoZSBub2RlIGJlZm9yZSB0aGUgaW5kZXgsIG5vIG5lZWQgdG8gY29udGludWVcblx0XHRcdGlmIChjaW5kZXggPT09IGluZGV4IC0gMSkgcmV0dXJuIGNoaWxkO1xuXG5cdFx0XHQvLyByZW1vdmUgdGhlIGNoaWxkXG5cdFx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZShjaW5kZXgsIDEpO1xuXG5cdFx0XHQvLyB1cGRhdGUgdGhlIGluZGV4IHNpbmNlIGl0IG1heSBoYXZlIGNoYW5nZWRcblx0XHRcdGluZGV4ID0gYmVmb3JlICE9IG51bGwgPyB0aGlzLmluZGV4T2YoYmVmb3JlKSA6IHRoaXMuY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdH1cblxuXHRcdC8vIG9yIHNpbXVsYXRlIHJlbW92ZSBmcm9tIGV4aXN0aW5nIHBhcmVudFxuXHRcdGVsc2UgaWYgKG9wYXJlbnQgIT0gbnVsbCkge1xuXHRcdFx0b3BhcmVudC5jaGlsZHJlbi5zcGxpY2Uob3BhcmVudC5pbmRleE9mKGNoaWxkKSwgMSk7XG5cdFx0XHRjaGlsZC5wYXJlbnQgPSBudWxsO1xuXHRcdFx0b3BhcmVudC50cmlnZ2VyKFwiY2hpbGQ6cmVtb3ZlXCIsIGNoaWxkKTtcblx0XHR9XG5cblx0XHQvLyBhZGQgdGhlIGNoaWxkXG5cdFx0dGhpcy5jaGlsZHJlbi5zcGxpY2UoaW5kZXgsIDAsIGNoaWxkKTtcblx0XHRjaGlsZC5wYXJlbnQgPSB0aGlzO1xuXG5cdFx0Ly8gdHJpZ2dlciBldmVudHNcblx0XHRpZiAob3BhcmVudCA9PT0gdGhpcykge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiY2hpbGQ6bW92ZVwiLCBjaGlsZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJpZ2dlcihcImNoaWxkOmFkZFwiLCBjaGlsZCk7XG5cdFx0XHRjaGlsZC50cmlnZ2VyKFwicGFyZW50XCIsIHRoaXMsIG9wYXJlbnQpO1xuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBub2RlcyBsYXN0XG5cdFx0Y2hpbGQudXBkYXRlTm9kZXMoKTtcblxuXHRcdHJldHVybiBjaGlsZDtcblx0fSxcblxuXHRhcHBlbmRDaGlsZDogZnVuY3Rpb24oY2hpbGQpIHtcblx0XHRyZXR1cm4gdGhpcy5pbnNlcnRCZWZvcmUoY2hpbGQpO1xuXHR9LFxuXG5cdGFwcGVuZDogZnVuY3Rpb24oKSB7XG5cdFx0dXRpbC5mbGF0dGVuKHV0aWwudG9BcnJheShhcmd1bWVudHMpKS5mb3JFYWNoKHRoaXMuYXBwZW5kQ2hpbGQsIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZUNoaWxkOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHZhciBpbmRleCA9IHRoaXMuaW5kZXhPZihjaGlsZCk7XG5cdFx0aWYgKCF+aW5kZXgpIHJldHVybjtcblxuXHRcdC8vIHJlbW92ZSBjaGlsZFxuXHRcdHdoaWxlIChpbmRleCA+IC0xKSB7XG5cdFx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRpbmRleCA9IHRoaXMuaW5kZXhPZihjaGlsZCwgaW5kZXgpO1xuXHRcdH1cblxuXHRcdGNoaWxkLnBhcmVudCA9IG51bGw7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50c1xuXHRcdHRoaXMudHJpZ2dlcihcImNoaWxkOnJlbW92ZVwiLCBjaGlsZCk7XG5cdFx0Y2hpbGQudHJpZ2dlcihcInBhcmVudFwiLCBudWxsLCB0aGlzKTtcblxuXHRcdC8vIHVwZGF0ZSBub2RlcyBsYXN0XG5cdFx0Y2hpbGQudXBkYXRlTm9kZXMoKTtcblxuXHRcdHJldHVybiBjaGlsZDtcblx0fSxcblxuXHRlbXB0eTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5jaGlsZHJlbi5zbGljZSgwKS5mb3JFYWNoKHRoaXMucmVtb3ZlQ2hpbGQsIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGNvbnRhaW5zOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHJldHVybiB0aGlzLmluZGV4T2YoY2hpbGQpID4gLTE7XG5cdH0sXG5cblx0aW5kZXhPZjogZnVuY3Rpb24oY2hpbGQpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGNoaWxkKTtcblx0fSxcblxuXHRmaXJzdENoaWxkOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlblswXSB8fCBudWxsO1xuXHR9LFxuXG5cdGxhc3RDaGlsZDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGxlbiA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdHJldHVybiBsZW4gPyB0aGlzLmNoaWxkcmVuW2xlbiAtIDFdIDogbnVsbDtcblx0fSxcblxuXHRuZXh0U2libGluZzogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNSb290KSByZXR1cm4gbnVsbDtcblxuXHRcdHZhciBpbmRleCA9IHRoaXMucGFyZW50LmluZGV4T2YodGhpcyksXG5cdFx0XHRjaGlsZHJlbiA9IHRoaXMucGFyZW50LmNoaWxkcmVuO1xuXG5cdFx0cmV0dXJuIGluZGV4ID4gLTEgJiYgaW5kZXggPCBjaGlsZHJlbi5sZW5ndGggLSAxID8gY2hpbGRyZW5baW5kZXggKyAxXSA6IG51bGw7XG5cdH0sXG5cblx0cHJldmlvdXNTaWJsaW5nOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHJldHVybiBudWxsO1xuXG5cdFx0dmFyIGluZGV4ID0gdGhpcy5wYXJlbnQuaW5kZXhPZih0aGlzKSxcblx0XHRcdGNoaWxkcmVuID0gdGhpcy5wYXJlbnQuY2hpbGRyZW47XG5cblx0XHRyZXR1cm4gaW5kZXggPiAwICYmIGluZGV4IDwgY2hpbGRyZW4ubGVuZ3RoID8gY2hpbGRyZW5baW5kZXggLSAxXSA6IG51bGw7XG5cdH0sXG5cblx0aGFzQ2hpbGRyZW46IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDA7XG5cdH0sXG5cblx0aXNSb290OiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJlbnQgPT0gbnVsbDtcblx0fSxcblxuXHR1cGRhdGVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0Ly8gd2UgbXVzdCB1cGRhdGUgaW4gcmV2ZXJzZSB0byBlbnN1cmUgdGhhdCBiZWZvcmUgbm9kZXNcblx0XHQvLyBhcmUgYWxyZWFkeSBpbiB0aGUgRE9NIHdoZW4gY2hpbGRyZW4gYXJlIHBsYWNlZFxuXHRcdGZvciAodmFyIGkgPSB0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHR0aGlzLmNoaWxkcmVuW2ldLnVwZGF0ZU5vZGVzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gZXZlbnQgaXMgZmlyZWQgYWZ0ZXIsIG1lYW5pbmcgY2hpbGRyZW4gd2lsbCBmaXJlIHRoZWlyIGV2ZW50cyBmaXJzdFxuXHRcdHRoaXMudHJpZ2dlcihcInVwZGF0ZVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHR0b05vZGVzOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5yZWR1Y2UoZnVuY3Rpb24obm9kZXMsIGNoaWxkKSB7XG5cdFx0XHRub2Rlcy5wdXNoLmFwcGx5KG5vZGVzLCBjaGlsZC50b05vZGVzKCkpO1xuXHRcdFx0cmV0dXJuIG5vZGVzO1xuXHRcdH0sIFtdKTtcblx0fSxcblxuXHRwYXJlbnROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHtcblx0XHRcdHJldHVybiB0aGlzLnBsYWNlaG9sZGVyICE9IG51bGwgP1xuXHRcdFx0XHR0aGlzLnBsYWNlaG9sZGVyLnBhcmVudE5vZGUgOlxuXHRcdFx0XHRudWxsO1xuXHRcdH1cblxuXHRcdHZhciBwYXJlbnQgPSB0aGlzLnBhcmVudDtcblxuXHRcdHdoaWxlIChwYXJlbnQgIT0gbnVsbCkge1xuXHRcdFx0aWYgKHBhcmVudCBpbnN0YW5jZW9mIEJpbmRpbmcuTm9kZSkgcmV0dXJuIHBhcmVudC5ub2RlO1xuXHRcdFx0aWYgKHBhcmVudC5pc1Jvb3QpIHJldHVybiBwYXJlbnQucGFyZW50Tm9kZTtcblx0XHRcdHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZmlyc3RDaGlsZCA9IHRoaXMuZmlyc3RDaGlsZDtcblx0XHRyZXR1cm4gZmlyc3RDaGlsZCAhPSBudWxsID8gZmlyc3RDaGlsZC5maXJzdE5vZGUgOiBudWxsO1xuXHR9LFxuXG5cdG5leHRTaWJsaW5nTm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNSb290KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wbGFjZWhvbGRlciAhPSBudWxsID9cblx0XHRcdFx0dGhpcy5wbGFjZWhvbGRlciA6XG5cdFx0XHRcdG51bGw7XG5cdFx0fVxuXG5cdFx0dmFyIG5leHRTaWJsaW5nID0gdGhpcy5uZXh0U2libGluZztcblx0XHRyZXR1cm4gbmV4dFNpYmxpbmcgIT0gbnVsbCA/IG5leHRTaWJsaW5nLmZpcnN0Tm9kZSA6XG5cdFx0XHR0aGlzLnBhcmVudCBpbnN0YW5jZW9mIEJpbmRpbmcuTm9kZSA/IG51bGwgOlxuXHRcdFx0dGhpcy5wYXJlbnQubmV4dFNpYmxpbmdOb2RlO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGVsLCBpO1xuXG5cdFx0Zm9yIChpIGluIHRoaXMuY2hpbGRyZW4pIHtcblx0XHRcdGVsID0gdGhpcy5jaGlsZHJlbltpXS5maW5kKHNlbGVjdG9yKTtcblx0XHRcdGlmIChlbCAhPSBudWxsKSByZXR1cm4gZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5yZWR1Y2UoZnVuY3Rpb24obm9kZXMsIGNoaWxkKSB7XG5cdFx0XHRub2Rlcy5wdXNoLmFwcGx5KG5vZGVzLCBjaGlsZC5maW5kQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHRyZXR1cm4gbm9kZXM7XG5cdFx0fSwgW10pO1xuXHR9LFxuXG5cdHBhaW50OiBmdW5jdGlvbihwYXJlbnQsIGJlZm9yZU5vZGUpIHtcblx0XHRpZiAodHlwZW9mIHBhcmVudCA9PT0gXCJzdHJpbmdcIikgcGFyZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihwYXJlbnQpO1xuXHRcdGlmICh0eXBlb2YgYmVmb3JlTm9kZSA9PT0gXCJzdHJpbmdcIikgYmVmb3JlTm9kZSA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKGJlZm9yZU5vZGUpO1xuXHRcdGlmIChwYXJlbnQgPT0gbnVsbCkgcGFyZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdGlmICh0aGlzLnBsYWNlaG9sZGVyID09IG51bGwpIHRoaXMucGxhY2Vob2xkZXIgPSBkb2N1bWVudC5jcmVhdGVDb21tZW50KHV0aWwudW5pcXVlSWQoXCIkXCIpKTtcblxuXHRcdHBhcmVudC5pbnNlcnRCZWZvcmUodGhpcy5wbGFjZWhvbGRlciwgYmVmb3JlTm9kZSk7XG5cdFx0dGhpcy51cGRhdGVOb2RlcygpO1xuXHRcdHRoaXMudHJpZ2dlcihcInBhaW50XCIsIHBhcmVudCwgYmVmb3JlTm9kZSk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRkZXRhY2g6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLnBsYWNlaG9sZGVyICE9IG51bGwgJiYgdGhpcy5wbGFjZWhvbGRlci5wYXJlbnROb2RlKSB7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5wbGFjZWhvbGRlcik7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVOb2RlcygpO1xuXHRcdHRoaXMudHJpZ2dlcihcImRldGFjaFwiKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGF1dG9ydW46IGZ1bmN0aW9uKGZuLCBvbmx5T25BY3RpdmUpIHtcblx0XHR2YXIgY29tcCA9IFRyYWNrci5hdXRvcnVuKGZuLCB0aGlzKTtcblx0XHRpZiAob25seU9uQWN0aXZlICYmICFUcmFja3IuYWN0aXZlKSBjb21wLnN0b3AoKTtcblx0XHRyZXR1cm4gY29tcDtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0XHRyZXR1cm4gY2hpbGQudG9TdHJpbmcoKTtcblx0XHR9KS5qb2luKFwiXCIpO1xuXHR9LFxuXG5cdC8vIGEgZ2VuZXJhbGl6ZWQgcmVhY3RpdmUgd29ya2Zsb3cgaGVscGVyXG5cdG1vdW50OiBmdW5jdGlvbigpIHtcblx0XHR2YXIgYXJncyA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpLCBjb21wO1xuXG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0Ly8gc3RvcCBleGlzdGluZyBtb3VudFxuXHRcdFx0dGhpcy5zdG9wKCk7XG5cblx0XHRcdC8vIHRoZSBmaXJzdCBldmVudCBpbiB0aGUgY3ljbGUsIGJlZm9yZSBldmVyeXRoaW5nIGVsc2Vcblx0XHRcdHRoaXMuX21vdW50aW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMudHJpZ2dlcihcIm1vdW50OmJlZm9yZVwiLCBhcmdzKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdC8vIHRoZSBhdXRvcnVuIGNvbXB1dGF0aW9uXG5cdFx0Y29tcCA9IHRoaXMuX2NvbXAgPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oY29tcCkge1xuXHRcdFx0Ly8gb25seSByZW5kZXIgZXZlbnQgd2l0aG91dCBiaW5kaW5nc1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwicmVuZGVyOmJlZm9yZVwiLCBhcmdzLCBjb21wKTtcblxuXHRcdFx0Ly8gcnVuIHJlbmRlciBhbmQgcHJvY2VzcyB0aGUgcmVzdWx0aW5nIGJpbmRpbmdzIGludG8gYW4gYXJyYXlcblx0XHRcdHZhciBiaW5kaW5ncyA9IHRoaXMucmVuZGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdFx0aWYgKEJpbmRpbmcuaXNCaW5kaW5nKGJpbmRpbmdzKSkgYmluZGluZ3MgPSBbIGJpbmRpbmdzIF07XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoYmluZGluZ3MpKSBiaW5kaW5ncyA9IFtdO1xuXG5cdFx0XHQvLyBtYWluIHJlbmRlciBldmVudCBleGVjcyBhZnRlciByZW5kZXIgYnV0IGJlZm9yZSBhcHBlbmRpbmdcblx0XHRcdC8vIHRoZSBiaW5kaW5ncyBhcnJheSBjYW4gYmUgYWZmZWN0ZWQgYnkgdGhpcyBldmVudFxuXHRcdFx0dGhpcy50cmlnZ2VyKFwicmVuZGVyXCIsIGFyZ3MsIGNvbXAsIGJpbmRpbmdzKTtcblxuXHRcdFx0Ly8gYXBwZW5kIHRoZSBiaW5kaW5ncyBpbiBvcmRlclxuXHRcdFx0YmluZGluZ3MgPSBiaW5kaW5ncy5tYXAodGhpcy5hcHBlbmRDaGlsZCwgdGhpcyk7XG5cdFx0XHRcblx0XHRcdC8vIHRoZSBsYXN0IHJlbmRlciBldmVudFxuXHRcdFx0dGhpcy50cmlnZ2VyKFwicmVuZGVyOmFmdGVyXCIsIGFyZ3MsIGNvbXAsIGJpbmRpbmdzKTtcblxuXHRcdFx0Ly8gYXV0byBjbGVhbiB1cFxuXHRcdFx0Y29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdC8vIG9ubHkgaW52YWxpZGF0ZSBldmVudCB3aXRoIGJpbmRpbmdzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGU6YmVmb3JlXCIsIGFyZ3MsIGNvbXAsIGJpbmRpbmdzKTtcblx0XHRcdFx0XG5cdFx0XHRcdC8vIHJlbW92ZSB0aGUgYmluZGluZ3MgYWRkZWQgYmVmb3JlXG5cdFx0XHRcdGJpbmRpbmdzLmZvckVhY2godGhpcy5yZW1vdmVDaGlsZCwgdGhpcyk7XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyByZW1haW5pbmcgaW52YWxpZGF0ZSBldmVudHNcblx0XHRcdFx0dGhpcy50cmlnZ2VyKFwiaW52YWxpZGF0ZVwiLCBhcmdzLCBjb21wKTtcblx0XHRcdFx0dGhpcy50cmlnZ2VyKFwiaW52YWxpZGF0ZTphZnRlclwiLCBhcmdzLCBjb21wKTtcblxuXHRcdFx0XHQvLyBkZXRlY3QgaWYgdGhlIGNvbXB1dGF0aW9uIHN0b3BwZWRcblx0XHRcdFx0aWYgKGNvbXAuc3RvcHBlZCkge1xuXHRcdFx0XHRcdHRoaXMudHJpZ2dlcihcInN0b3BcIiwgYXJncyk7XG5cdFx0XHRcdFx0ZGVsZXRlIHRoaXMuX2NvbXA7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gcmVtYWluaW5nIG1vdW50IGV2ZW50cyBoYXBwZW4gYWZ0ZXIgdGhlIGZpcnN0IHJlbmRlclxuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHRoaXMudHJpZ2dlcihcIm1vdW50XCIsIGFyZ3MsIGNvbXApO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnQ6YWZ0ZXJcIiwgYXJncywgY29tcCk7XG5cdFx0XHRkZWxldGUgdGhpcy5fbW91bnRpbmc7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW5kZXI6IGZ1bmN0aW9uKCl7fSxcblxuXHRpc01vdW50ZWQ6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmlzTW91bnRpbmcoKSB8fCB0aGlzLl9jb21wICE9IG51bGw7XG5cdH0sXG5cblx0aXNNb3VudGluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5fbW91bnRpbmc7XG5cdH0sXG5cblx0Z2V0Q29tcHV0YXRpb246IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9jb21wO1xuXHR9LFxuXG5cdGludmFsaWRhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzTW91bnRlZCgpKSB0aGlzLl9jb21wLmludmFsaWRhdGUoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRvbkludmFsaWRhdGU6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0aWYgKHRoaXMuaXNNb3VudGVkKCkpIHRoaXMuX2NvbXAub25JbnZhbGlkYXRlKGZuKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRzdG9wOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc01vdW50ZWQoKSkgdGhpcy5fY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxufSk7XG5cbi8vIGFsaWFzZXNcbkJpbmRpbmcucHJvdG90eXBlLmhhc0NoaWxkID0gQmluZGluZy5wcm90b3R5cGUuY29udGFpbnM7XG5CaW5kaW5nLnByb3RvdHlwZS5yZW1vdmVBbGxDaGlsZHJlbiA9IEJpbmRpbmcucHJvdG90eXBlLmVtcHR5O1xuQmluZGluZy5wcm90b3R5cGUudG9IVE1MID0gQmluZGluZy5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8vIExvYWQgdGhlIGJpbmRpbmdzXG51dGlsLmV4dGVuZChCaW5kaW5nLCByZXF1aXJlKFwiLi9ub2RlXCIpKTtcbkJpbmRpbmcuSFRNTCA9IHJlcXVpcmUoXCIuL2h0bWxcIik7IiwidmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG4vLyBCYWNrYm9uZS5FdmVudHNcbi8vIC0tLS0tLS0tLS0tLS0tLVxuXG4vLyBBIG1vZHVsZSB0aGF0IGNhbiBiZSBtaXhlZCBpbiB0byAqYW55IG9iamVjdCogaW4gb3JkZXIgdG8gcHJvdmlkZSBpdCB3aXRoXG4vLyBjdXN0b20gZXZlbnRzLiBZb3UgbWF5IGJpbmQgd2l0aCBgb25gIG9yIHJlbW92ZSB3aXRoIGBvZmZgIGNhbGxiYWNrXG4vLyBmdW5jdGlvbnMgdG8gYW4gZXZlbnQ7IGB0cmlnZ2VyYC1pbmcgYW4gZXZlbnQgZmlyZXMgYWxsIGNhbGxiYWNrcyBpblxuLy8gc3VjY2Vzc2lvbi5cbi8vXG4vLyAgICAgdmFyIG9iamVjdCA9IHt9O1xuLy8gICAgIHV0aWwuZXh0ZW5kKG9iamVjdCwgQmFja2JvbmUuRXZlbnRzKTtcbi8vICAgICBvYmplY3Qub24oJ2V4cGFuZCcsIGZ1bmN0aW9uKCl7IGFsZXJ0KCdleHBhbmRlZCcpOyB9KTtcbi8vICAgICBvYmplY3QudHJpZ2dlcignZXhwYW5kJyk7XG4vL1xudmFyIEV2ZW50cyA9IG1vZHVsZS5leHBvcnRzID0ge1xuXG5cdC8vIEJpbmQgYW4gZXZlbnQgdG8gYSBgY2FsbGJhY2tgIGZ1bmN0aW9uLiBQYXNzaW5nIGBcImFsbFwiYCB3aWxsIGJpbmRcblx0Ly8gdGhlIGNhbGxiYWNrIHRvIGFsbCBldmVudHMgZmlyZWQuXG5cdG9uOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICdvbicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG5cdFx0dGhpcy5fZXZlbnRzIHx8ICh0aGlzLl9ldmVudHMgPSB7fSk7XG5cdFx0dmFyIGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSB8fCAodGhpcy5fZXZlbnRzW25hbWVdID0gW10pO1xuXHRcdGV2ZW50cy5wdXNoKHtjYWxsYmFjazogY2FsbGJhY2ssIGNvbnRleHQ6IGNvbnRleHQsIGN0eDogY29udGV4dCB8fCB0aGlzfSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gQmluZCBhbiBldmVudCB0byBvbmx5IGJlIHRyaWdnZXJlZCBhIHNpbmdsZSB0aW1lLiBBZnRlciB0aGUgZmlyc3QgdGltZVxuXHQvLyB0aGUgY2FsbGJhY2sgaXMgaW52b2tlZCwgaXQgd2lsbCBiZSByZW1vdmVkLlxuXHRvbmNlOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICdvbmNlJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0dmFyIGZuID0gb25jZShmdW5jdGlvbigpIHtcblx0XHRcdHNlbGYub2ZmKG5hbWUsIGZuKTtcblx0XHRcdGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0fSk7XG5cdFx0Zm4uX2NhbGxiYWNrID0gY2FsbGJhY2s7XG5cdFx0cmV0dXJuIHRoaXMub24obmFtZSwgZm4sIGNvbnRleHQpO1xuXHR9LFxuXG5cdC8vIFJlbW92ZSBvbmUgb3IgbWFueSBjYWxsYmFja3MuIElmIGBjb250ZXh0YCBpcyBudWxsLCByZW1vdmVzIGFsbFxuXHQvLyBjYWxsYmFja3Mgd2l0aCB0aGF0IGZ1bmN0aW9uLiBJZiBgY2FsbGJhY2tgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG5cdC8vIGNhbGxiYWNrcyBmb3IgdGhlIGV2ZW50LiBJZiBgbmFtZWAgaXMgbnVsbCwgcmVtb3ZlcyBhbGwgYm91bmRcblx0Ly8gY2FsbGJhY2tzIGZvciBhbGwgZXZlbnRzLlxuXHRvZmY6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0dmFyIHJldGFpbiwgZXYsIGV2ZW50cywgbmFtZXMsIGksIGwsIGosIGs7XG5cdFx0aWYgKCF0aGlzLl9ldmVudHMgfHwgIWV2ZW50c0FwaSh0aGlzLCAnb2ZmJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkpIHJldHVybiB0aGlzO1xuXHRcdGlmICghbmFtZSAmJiAhY2FsbGJhY2sgJiYgIWNvbnRleHQpIHtcblx0XHRcdHRoaXMuX2V2ZW50cyA9IHZvaWQgMDtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0XHRuYW1lcyA9IG5hbWUgPyBbbmFtZV0gOiBPYmplY3Qua2V5cyh0aGlzLl9ldmVudHMpO1xuXHRcdGZvciAoaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdG5hbWUgPSBuYW1lc1tpXTtcblx0XHRcdGlmIChldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV0pIHtcblx0XHRcdFx0dGhpcy5fZXZlbnRzW25hbWVdID0gcmV0YWluID0gW107XG5cdFx0XHRcdGlmIChjYWxsYmFjayB8fCBjb250ZXh0KSB7XG5cdFx0XHRcdFx0Zm9yIChqID0gMCwgayA9IGV2ZW50cy5sZW5ndGg7IGogPCBrOyBqKyspIHtcblx0XHRcdFx0XHRcdGV2ID0gZXZlbnRzW2pdO1xuXHRcdFx0XHRcdFx0aWYgKChjYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2sgJiYgY2FsbGJhY2sgIT09IGV2LmNhbGxiYWNrLl9jYWxsYmFjaykgfHxcblx0XHRcdFx0XHRcdFx0XHQoY29udGV4dCAmJiBjb250ZXh0ICE9PSBldi5jb250ZXh0KSkge1xuXHRcdFx0XHRcdFx0XHRyZXRhaW4ucHVzaChldik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcmV0YWluLmxlbmd0aCkgZGVsZXRlIHRoaXMuX2V2ZW50c1tuYW1lXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBUcmlnZ2VyIG9uZSBvciBtYW55IGV2ZW50cywgZmlyaW5nIGFsbCBib3VuZCBjYWxsYmFja3MuIENhbGxiYWNrcyBhcmVcblx0Ly8gcGFzc2VkIHRoZSBzYW1lIGFyZ3VtZW50cyBhcyBgdHJpZ2dlcmAgaXMsIGFwYXJ0IGZyb20gdGhlIGV2ZW50IG5hbWVcblx0Ly8gKHVubGVzcyB5b3UncmUgbGlzdGVuaW5nIG9uIGBcImFsbFwiYCwgd2hpY2ggd2lsbCBjYXVzZSB5b3VyIGNhbGxiYWNrIHRvXG5cdC8vIHJlY2VpdmUgdGhlIHRydWUgbmFtZSBvZiB0aGUgZXZlbnQgYXMgdGhlIGZpcnN0IGFyZ3VtZW50KS5cblx0dHJpZ2dlcjogZnVuY3Rpb24obmFtZSkge1xuXHRcdGlmICghdGhpcy5fZXZlbnRzKSByZXR1cm4gdGhpcztcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ3RyaWdnZXInLCBuYW1lLCBhcmdzKSkgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXTtcblx0XHR2YXIgYWxsRXZlbnRzID0gdGhpcy5fZXZlbnRzLmFsbDtcblx0XHRpZiAoZXZlbnRzKSB0cmlnZ2VyRXZlbnRzKGV2ZW50cywgYXJncyk7XG5cdFx0aWYgKGFsbEV2ZW50cykgdHJpZ2dlckV2ZW50cyhhbGxFdmVudHMsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gVGVsbCB0aGlzIG9iamVjdCB0byBzdG9wIGxpc3RlbmluZyB0byBlaXRoZXIgc3BlY2lmaWMgZXZlbnRzIC4uLiBvclxuXHQvLyB0byBldmVyeSBvYmplY3QgaXQncyBjdXJyZW50bHkgbGlzdGVuaW5nIHRvLlxuXHRzdG9wTGlzdGVuaW5nOiBmdW5jdGlvbihvYmosIG5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0dmFyIGxpc3RlbmluZ1RvID0gdGhpcy5fbGlzdGVuaW5nVG87XG5cdFx0aWYgKCFsaXN0ZW5pbmdUbykgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIHJlbW92ZSA9ICFuYW1lICYmICFjYWxsYmFjaztcblx0XHRpZiAoIWNhbGxiYWNrICYmIHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JykgY2FsbGJhY2sgPSB0aGlzO1xuXHRcdGlmIChvYmopIChsaXN0ZW5pbmdUbyA9IHt9KVtvYmouX2xpc3RlbklkXSA9IG9iajtcblx0XHRmb3IgKHZhciBpZCBpbiBsaXN0ZW5pbmdUbykge1xuXHRcdFx0b2JqID0gbGlzdGVuaW5nVG9baWRdO1xuXHRcdFx0b2JqLm9mZihuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG5cdFx0XHRpZiAocmVtb3ZlIHx8IGlzRW1wdHkob2JqLl9ldmVudHMpKSBkZWxldGUgdGhpcy5fbGlzdGVuaW5nVG9baWRdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG59O1xuXG4vLyBSZWd1bGFyIGV4cHJlc3Npb24gdXNlZCB0byBzcGxpdCBldmVudCBzdHJpbmdzLlxudmFyIGV2ZW50U3BsaXR0ZXIgPSAvXFxzKy87XG5cbi8vIEltcGxlbWVudCBmYW5jeSBmZWF0dXJlcyBvZiB0aGUgRXZlbnRzIEFQSSBzdWNoIGFzIG11bHRpcGxlIGV2ZW50XG4vLyBuYW1lcyBgXCJjaGFuZ2UgYmx1clwiYCBhbmQgalF1ZXJ5LXN0eWxlIGV2ZW50IG1hcHMgYHtjaGFuZ2U6IGFjdGlvbn1gXG4vLyBpbiB0ZXJtcyBvZiB0aGUgZXhpc3RpbmcgQVBJLlxudmFyIGV2ZW50c0FwaSA9IGZ1bmN0aW9uKG9iaiwgYWN0aW9uLCBuYW1lLCByZXN0KSB7XG5cdGlmICghbmFtZSkgcmV0dXJuIHRydWU7XG5cblx0Ly8gSGFuZGxlIGV2ZW50IG1hcHMuXG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gbmFtZSkge1xuXHRcdFx0b2JqW2FjdGlvbl0uYXBwbHkob2JqLCBba2V5LCBuYW1lW2tleV1dLmNvbmNhdChyZXN0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIEhhbmRsZSBzcGFjZSBzZXBhcmF0ZWQgZXZlbnQgbmFtZXMuXG5cdGlmIChldmVudFNwbGl0dGVyLnRlc3QobmFtZSkpIHtcblx0XHR2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KGV2ZW50U3BsaXR0ZXIpO1xuXHRcdGZvciAodmFyIGkgPSAwLCBsID0gbmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRvYmpbYWN0aW9uXS5hcHBseShvYmosIFtuYW1lc1tpXV0uY29uY2F0KHJlc3QpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGRpZmZpY3VsdC10by1iZWxpZXZlLCBidXQgb3B0aW1pemVkIGludGVybmFsIGRpc3BhdGNoIGZ1bmN0aW9uIGZvclxuLy8gdHJpZ2dlcmluZyBldmVudHMuIFRyaWVzIHRvIGtlZXAgdGhlIHVzdWFsIGNhc2VzIHNwZWVkeSAobW9zdCBpbnRlcm5hbFxuLy8gQmFja2JvbmUgZXZlbnRzIGhhdmUgMyBhcmd1bWVudHMpLlxudmFyIHRyaWdnZXJFdmVudHMgPSBmdW5jdGlvbihldmVudHMsIGFyZ3MpIHtcblx0dmFyIGV2LCBpID0gLTEsIGwgPSBldmVudHMubGVuZ3RoLCBhMSA9IGFyZ3NbMF0sIGEyID0gYXJnc1sxXSwgYTMgPSBhcmdzWzJdO1xuXHRzd2l0Y2ggKGFyZ3MubGVuZ3RoKSB7XG5cdFx0Y2FzZSAwOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCk7IHJldHVybjtcblx0XHRjYXNlIDE6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSk7IHJldHVybjtcblx0XHRjYXNlIDI6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSwgYTIpOyByZXR1cm47XG5cdFx0Y2FzZSAzOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyLCBhMyk7IHJldHVybjtcblx0XHRkZWZhdWx0OiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5hcHBseShldi5jdHgsIGFyZ3MpOyByZXR1cm47XG5cdH1cbn07XG5cbnZhciBsaXN0ZW5NZXRob2RzID0ge2xpc3RlblRvOiAnb24nLCBsaXN0ZW5Ub09uY2U6ICdvbmNlJ307XG5cbi8vIEludmVyc2lvbi1vZi1jb250cm9sIHZlcnNpb25zIG9mIGBvbmAgYW5kIGBvbmNlYC4gVGVsbCAqdGhpcyogb2JqZWN0IHRvXG4vLyBsaXN0ZW4gdG8gYW4gZXZlbnQgaW4gYW5vdGhlciBvYmplY3QgLi4uIGtlZXBpbmcgdHJhY2sgb2Ygd2hhdCBpdCdzXG4vLyBsaXN0ZW5pbmcgdG8uXG51dGlsLmVhY2gobGlzdGVuTWV0aG9kcywgZnVuY3Rpb24oaW1wbGVtZW50YXRpb24sIG1ldGhvZCkge1xuXHRFdmVudHNbbWV0aG9kXSA9IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcblx0XHR2YXIgbGlzdGVuaW5nVG8gPSB0aGlzLl9saXN0ZW5pbmdUbyB8fCAodGhpcy5fbGlzdGVuaW5nVG8gPSB7fSk7XG5cdFx0dmFyIGlkID0gb2JqLl9saXN0ZW5JZCB8fCAob2JqLl9saXN0ZW5JZCA9IHV0aWwudW5pcXVlSWQoJ2wnKSk7XG5cdFx0bGlzdGVuaW5nVG9baWRdID0gb2JqO1xuXHRcdGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG5cdFx0b2JqW2ltcGxlbWVudGF0aW9uXShuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG59KTtcblxuLy8gQWxpYXNlcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG5FdmVudHMuYmluZCAgID0gRXZlbnRzLm9uO1xuRXZlbnRzLnVuYmluZCA9IEV2ZW50cy5vZmY7XG5cbmZ1bmN0aW9uIGlzRW1wdHkob2JqKSB7XG5cdGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHRydWU7XG5cdGlmIChBcnJheS5pc0FycmF5KG9iaikgfHwgdHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIG9iai5sZW5ndGggPT09IDA7XG5cdGZvciAodmFyIGtleSBpbiBvYmopIGlmICh1dGlsLmhhcyhvYmosIGtleSkpIHJldHVybiBmYWxzZTtcblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG9uY2UoZnVuYykge1xuXHR2YXIgcmFuID0gZmFsc2UsIG1lbW87XG5cdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHRpZiAocmFuKSByZXR1cm4gbWVtbztcblx0XHRyYW4gPSB0cnVlO1xuXHRcdG1lbW8gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0ZnVuYyA9IG51bGw7XG5cdFx0cmV0dXJuIG1lbW87XG5cdH1cbn0iLCJ2YXIgQmluZGluZyA9IHJlcXVpcmUoXCIuL2JpbmRpbmdcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJpbmRpbmcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0QmluZGluZy5jYWxsKHRoaXMpO1xuXHRcdHRoaXMubm9kZXMgPSBbXTtcblx0XHR0aGlzLnNldFZhbHVlKHZhbHVlKTtcblx0fSxcblxuXHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkhUTUwgYmluZGluZ3MgY2FuJ3QgaGF2ZSBjaGlsZHJlbi5cIik7XG5cdH0sXG5cblx0dXBkYXRlTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBwYXJlbnROb2RlID0gdGhpcy5wYXJlbnROb2RlLFxuXHRcdFx0YmVmb3JlTm9kZSwgbm9kZSwgaTtcblxuXHRcdC8vIHBsYWNlIHRoZSBub2RlcyBpbiB0aGUgZG9tXG5cdFx0aWYgKHBhcmVudE5vZGUgIT0gbnVsbCkge1xuXHRcdFx0YmVmb3JlTm9kZSA9IHRoaXMubmV4dFNpYmxpbmdOb2RlO1xuXG5cdFx0XHRmb3IgKGkgPSB0aGlzLm5vZGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdG5vZGUgPSB0aGlzLm5vZGVzW2ldO1xuXG5cdFx0XHRcdGlmICghdXRpbC5pc05vZGVBdERPTVBvc2l0aW9uKG5vZGUsIHBhcmVudE5vZGUsIGJlZm9yZU5vZGUpKSB7XG5cdFx0XHRcdFx0cGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobm9kZSwgYmVmb3JlTm9kZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiZWZvcmVOb2RlID0gbm9kZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBvciB0YWtlIHRoZW0gb3V0XG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLnJlbW92ZU5vZGVzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmlnZ2VyKFwidXBkYXRlXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZU5vZGVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbm9kZSwgaTtcblxuXHRcdGZvciAoaSA9IDA7IGkgPCB0aGlzLm5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRub2RlID0gdGhpcy5ub2Rlc1tpXTtcblx0XHRcdGlmIChub2RlLnBhcmVudE5vZGUgIT0gbnVsbCkgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHNldFZhbHVlOiBmdW5jdGlvbih2YWwpIHtcblx0XHRpZiAodmFsIGluc3RhbmNlb2YgTm9kZSkge1xuXHRcdFx0dmFsID0gdmFsLm5vZGVUeXBlID09PSAxMSA/IHV0aWwudG9BcnJheSh2YWwuY2hpbGROb2RlcykgOiBbIHZhbCBdO1xuXHRcdH1cblxuXHRcdGlmICghQXJyYXkuaXNBcnJheSh2YWwpKSB7XG5cdFx0XHR2YWwgPSB2YWwgIT0gbnVsbCA/IHZhbC50b1N0cmluZygpIDogXCJcIjtcblx0XHRcdFxuXHRcdFx0Ly8gY29udmVydCBodG1sIGludG8gRE9NIG5vZGVzXG5cdFx0XHR2YXIgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRcdGRpdi5pbm5lckhUTUwgPSB2YWw7XG5cdFx0XHR2YWwgPSB1dGlsLnRvQXJyYXkoZGl2LmNoaWxkTm9kZXMpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVtb3ZlTm9kZXMoKTtcblx0XHR0aGlzLm5vZGVzID0gdmFsO1xuXHRcdHRoaXMudXBkYXRlTm9kZXMoKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHRvTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGVzLnNsaWNlKDApO1xuXHR9LFxuXG5cdGZpcnN0Tm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZXNbMF0gfHwgbnVsbDtcblx0fSxcblxuXHRmaW5kOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBrLCBub2RlLCByZXN1bHQ7XG5cblx0XHRmb3IgKGsgaW4gdGhpcy5ub2Rlcykge1xuXHRcdFx0bm9kZSA9IHRoaXMubm9kZXNba107XG5cdFx0XHRpZiAobm9kZS5ub2RlVHlwZSAhPT0gMSkgY29udGludWU7XG5cblx0XHRcdGlmICh1dGlsLm1hdGNoZXNTZWxlY3Rvcihub2RlLCBzZWxlY3RvcikpIHJldHVybiBub2RlO1xuXHRcdFx0cmVzdWx0ID0gbm9kZS5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0XHRcdGlmIChyZXN1bHQgIT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBrLCBub2RlLCBlbHMgPSBbXTtcblxuXHRcdGZvciAoayBpbiB0aGlzLm5vZGVzKSB7XG5cdFx0XHRub2RlID0gdGhpcy5ub2Rlc1trXTtcblx0XHRcdGlmIChub2RlLm5vZGVUeXBlICE9PSAxKSBjb250aW51ZTtcblxuXHRcdFx0aWYgKHV0aWwubWF0Y2hlc1NlbGVjdG9yKG5vZGUsIHNlbGVjdG9yKSkgbWF0Y2hlcy5wdXNoKG5vZGUpO1xuXHRcdFx0ZWxzLnB1c2guYXBwbHkoZWxzLCB1dGlsLnRvQXJyYXkobm9kZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbHM7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGVzLm1hcChmdW5jdGlvbihub2RlKSB7XG5cdFx0XHRyZXR1cm4gbm9kZS5ub2RlVHlwZSA9PT0gMSA/IG5vZGUub3V0ZXJIVE1MIDogbm9kZS5ub2RlVmFsdWU7XG5cdFx0fSkuam9pbihcIlwiKTtcblx0fVxufSk7XG4iLCJ2YXIgQmluZGluZyA9IHJlcXVpcmUoXCIuL2JpbmRpbmdcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG4vLyBleHBvcnRcbnZhciBUZW1wbGUgPVxubW9kdWxlLmV4cG9ydHMgPSBCaW5kaW5nLmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHRCaW5kaW5nLmNhbGwodGhpcyk7XG5cdFx0dGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH0sXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMuYXBwZW5kKHV0aWwudG9BcnJheShhcmd1bWVudHMpKTtcblx0fVxufSk7XG5cbi8vIHN0YXRpYyBwcm9wZXJ0aWVzL21ldGhvZHNcblRlbXBsZS5WRVJTSU9OID0gXCIwLjQuMlwiO1xuVGVtcGxlLnV0aWwgPSB1dGlsO1xuVGVtcGxlLkV2ZW50cyA9IHJlcXVpcmUoXCIuL2V2ZW50c1wiKTtcblRlbXBsZS5CaW5kaW5nID0gQmluZGluZztcblxuLy8gZGVwcyBzZXR1cFxudmFyIERlcHMgPSBUZW1wbGUuVHJhY2tyID0gVGVtcGxlLkRlcHMgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xuVGVtcGxlLmF1dG9ydW4gPSBEZXBzLmF1dG9ydW47XG5UZW1wbGUubm9ucmVhY3RpdmUgPSBEZXBzLm5vbnJlYWN0aXZlO1xuVGVtcGxlLm5vbnJlYWN0YWJsZSA9IERlcHMubm9ucmVhY3RhYmxlO1xuVGVtcGxlLkRlcGVuZGVuY3kgPSBEZXBzLkRlcGVuZGVuY3k7IiwidmFyIEJpbmRpbmcgPSByZXF1aXJlKFwiLi9iaW5kaW5nXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxudmFyIGRlbGVnYXRlRXZlbnRTcGxpdHRlciA9IC9eKFxcUyspXFxzKiguKikkLztcblxudmFyIE5vZGUgPVxuZXhwb3J0cy5Ob2RlID0gQmluZGluZy5leHRlbmQoe1xuXHR1cGRhdGVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHBhcmVudE5vZGUgPSB0aGlzLnBhcmVudE5vZGUsXG5cdFx0XHRiZWZvcmVOb2RlID0gdGhpcy5uZXh0U2libGluZ05vZGU7XG5cblx0XHQvLyBwbGFjZSB0aGUgbm9kZSBpbiB0aGUgZG9tXG5cdFx0aWYgKHBhcmVudE5vZGUgIT0gbnVsbCAmJiAhdXRpbC5pc05vZGVBdERPTVBvc2l0aW9uKHRoaXMubm9kZSwgcGFyZW50Tm9kZSwgYmVmb3JlTm9kZSkpIHtcblx0XHRcdHRoaXMuaW5zZXJ0Tm9kZShwYXJlbnROb2RlLCBiZWZvcmVOb2RlKTtcblx0XHR9XG5cblx0XHQvLyBvciB0YWtlIGl0IG91dFxuXHRcdGVsc2UgaWYgKHBhcmVudE5vZGUgPT0gbnVsbCAmJiB0aGlzLm5vZGUucGFyZW50Tm9kZSAhPSBudWxsKSB7XG5cdFx0XHR0aGlzLnJlbW92ZU5vZGUoKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyaWdnZXIoXCJ1cGRhdGVcIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aW5zZXJ0Tm9kZTogZnVuY3Rpb24ocGFyZW50LCBiZWZvcmUpIHtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKHRoaXMubm9kZSwgYmVmb3JlKTtcblx0fSxcblxuXHRyZW1vdmVOb2RlOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLm5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLm5vZGUpO1xuXHR9LFxuXG5cdHByb3A6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QobmFtZSkgJiYgdmFsdWUgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKG5hbWUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5wcm9wKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0aGlzLm5vZGVbbmFtZV07XG5cdFx0ZWxzZSB0aGlzLm5vZGVbbmFtZV0gPSB2YWx1ZTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFkZEV2ZW50TGlzdGVuZXI6IGZ1bmN0aW9uKHR5cGUsIHNlbCwgbGlzdGVuZXIsIGN0eCkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRcblx0XHQvLyBzeW50YXg6IGFkZEV2ZW50TGlzdGVuZXIoeyBcInR5cGUgc2VsZWN0b3JcIjogbGlzdGVuZXIgfSwgY3R4KVxuXHRcdGlmICh1dGlsLmlzT2JqZWN0KHR5cGUpKSB7XG5cdFx0XHR1dGlsLmVhY2godHlwZSwgZnVuY3Rpb24odiwgbikge1xuXHRcdFx0XHR2YXIgbSA9IG4ubWF0Y2goZGVsZWdhdGVFdmVudFNwbGl0dGVyKTtcblx0XHRcdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKG1bMV0sIG1bMl0sIHYsIHNlbCk7XG5cdFx0XHR9LCB0aGlzKTtcblx0XHRcdFxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0Ly8gc3ludGF4OiBhZGRFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyLCBjdHgpXG5cdFx0aWYgKHR5cGVvZiBzZWwgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSBsaXN0ZW5lcjtcblx0XHRcdGxpc3RlbmVyID0gc2VsO1xuXHRcdFx0c2VsID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHR5cGUgIT09IFwic3RyaW5nXCIgfHwgdHlwZSA9PT0gXCJcIikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZXZlbnQgbmFtZS5cIik7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGxpc3RlbmVyLlwiKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZXZlbnRMaXN0ZW5lcnMgPT0gbnVsbCkgdGhpcy5fZXZlbnRMaXN0ZW5lcnMgPSBbXTtcblx0XHR0aGlzLl9ldmVudExpc3RlbmVycy5wdXNoKHsgdHlwZTogdHlwZSwgbGlzdGVuZXI6IGxpc3RlbmVyLCBldmVudDogZXZlbnRMaXN0ZW5lciB9KTtcblx0XHR0aGlzLm5vZGUuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBldmVudExpc3RlbmVyKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXG5cdFx0ZnVuY3Rpb24gZXZlbnRMaXN0ZW5lcihlKSB7XG5cdFx0XHR2YXIgZGVsZWdhdGU7XG5cblx0XHRcdGlmICh0eXBlb2Ygc2VsID09PSBcInN0cmluZ1wiICYmIHNlbCAhPT0gXCJcIikge1xuXHRcdFx0XHRkZWxlZ2F0ZSA9IHV0aWwuY2xvc2VzdChlLnRhcmdldCwgc2VsKTtcblx0XHRcdFx0aWYgKCFkZWxlZ2F0ZSkgcmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsaXN0ZW5lci5jYWxsKGN0eCB8fCBzZWxmLCBlLCBkZWxlZ2F0ZSk7XG5cdFx0fVxuXHR9LFxuXG5cdGFkZEV2ZW50TGlzdGVuZXJPbmNlOiBmdW5jdGlvbih0eXBlLCBzZWwsIGxpc3RlbmVyLCBjdHgpIHtcblx0XHQvLyBzeW50YXg6IGFkZEV2ZW50TGlzdGVuZXJPbmNlKHsgXCJ0eXBlIHNlbGVjdG9yXCI6IGxpc3RlbmVyIH0sIGN0eClcblx0XHRpZiAodXRpbC5pc09iamVjdCh0eXBlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWRkRXZlbnRMaXN0ZW5lck9uY2UodHlwZSwgc2VsKTtcblx0XHR9XG5cblx0XHQvLyBzeW50YXg6IGFkZEV2ZW50TGlzdGVuZXJPbmNlKHR5cGUsIGxpc3RlbmVyLCBjdHgpXG5cdFx0aWYgKHR5cGVvZiBzZWwgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSBsaXN0ZW5lcjtcblx0XHRcdGxpc3RlbmVyID0gc2VsO1xuXHRcdFx0c2VsID0gbnVsbDtcblx0XHR9XG5cblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0dmFyIHJhbiA9IGZhbHNlO1xuXG5cdFx0ZnVuY3Rpb24gZm4oKSB7XG5cdFx0XHRpZiAocmFuKSByZXR1cm47XG5cdFx0XHRyYW4gPSB0cnVlO1xuXHRcdFx0c2VsZi5vZmYobmFtZSwgZm4pO1xuXHRcdFx0bGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHR9XG5cblx0XHRmbi5fbGlzdGVuZXIgPSBsaXN0ZW5lcjtcblx0XHRcblx0XHRyZXR1cm4gdGhpcy5hZGRFdmVudExpc3RlbmVyKHR5cGUsIHNlbCwgZm4sIGN0eCk7XG5cdH0sXG5cblx0cmVtb3ZlRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcblx0XHRpZiAodGhpcy5fZXZlbnRMaXN0ZW5lcnMgPT0gbnVsbCkgcmV0dXJuIHRoaXM7XG5cblx0XHR2YXIgZXZ0cyA9IFtdO1xuXG5cdFx0Ly8gc3ludGF4OiByZW1vdmVFdmVudExpc3RlbmVyKGxpc3RlbmVyKVxuXHRcdGlmICh0eXBlb2YgdHlwZSA9PT0gXCJmdW5jdGlvblwiICYmIGxpc3RlbmVyID09IG51bGwpIHtcblx0XHRcdGxpc3RlbmVyID0gdHlwZTtcblx0XHRcdHR5cGUgPSBudWxsO1xuXHRcdH1cblxuXHRcdC8vIHN5bnRheDogcmVtb3ZlRXZlbnRMaXN0ZW5lcih7IFwidHlwZSBzZWxlY3RvclwiOiBsaXN0ZW5lciB9KVxuXHRcdGlmICh1dGlsLmlzT2JqZWN0KHR5cGUpKSB7XG5cdFx0XHR1dGlsLmVhY2godHlwZSwgZnVuY3Rpb24odiwgbikge1xuXHRcdFx0XHR2YXIgbSA9IG4ubWF0Y2goZGVsZWdhdGVFdmVudFNwbGl0dGVyKTtcblx0XHRcdFx0ZXZ0cy5wdXNoLmFwcGx5KGV2dHMsIHRoaXMuX2V2ZW50TGlzdGVuZXJzLmZpbHRlcihmdW5jdGlvbihlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGUudHlwZSA9PT0gbVsxXSAmJiAoZS5saXN0ZW5lciA9PT0gdiB8fCBlLmxpc3RlbmVyLl9saXN0ZW5lciA9PT0gdikgJiYgIX5ldnRzLmluZGV4T2YoZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblxuXHRcdC8vIHN5bnRheDogcmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlKVxuXHRcdGVsc2UgaWYgKGxpc3RlbmVyID09IG51bGwpIHtcblx0XHRcdGV2dHMgPSBfLmNsb25lKHRoaXMuX2V2ZW50TGlzdGVuZXJzKTtcblx0XHR9XG5cblx0XHQvLyBzeW50YXg6IHJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgc2VsZWN0b3IpXG5cdFx0ZWxzZSB7XG5cdFx0XHRldnRzID0gdGhpcy5fZXZlbnRMaXN0ZW5lcnMuZmlsdGVyKGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0cmV0dXJuICh0eXBlID09IG51bGwgfHwgdHlwZSA9PT0gZS50eXBlKSAmJiAobGlzdGVuZXIgPT09IGUubGlzdGVuZXIgfHwgbGlzdGVuZXIgPT09IGUubGlzdGVuZXIuX2xpc3RlbmVyKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGV2dHMuZm9yRWFjaChmdW5jdGlvbihlKSB7XG5cdFx0XHR2YXIgaW5kZXggPSB0aGlzLl9ldmVudExpc3RlbmVycy5pbmRleE9mKGUpO1xuXG5cdFx0XHRpZiAofmluZGV4KSB7XG5cdFx0XHRcdHRoaXMubm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKGUudHlwZSwgZS5ldmVudCk7XG5cdFx0XHRcdHRoaXMuX2V2ZW50TGlzdGVuZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR9XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHR0b05vZGVzOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gWyB0aGlzLm5vZGUgXTtcblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGU7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oKSB7IHJldHVybiBudWxsOyB9LFxuXHRmaW5kQWxsOiBmdW5jdGlvbigpIHsgcmV0dXJuIFtdOyB9XG59KTtcblxuZnVuY3Rpb24gbGVhZk5vZGUobm9kZVR5cGUsIG1ldGhvZE5hbWUsIGh1bWFuVHlwZSkge1xuXHRyZXR1cm4gTm9kZS5leHRlbmQoe1xuXHRcdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihub2RlT3JWYWx1ZSkge1xuXHRcdFx0Ly8gdGV4dCBub2RlXG5cdFx0XHRpZiAobm9kZU9yVmFsdWUgaW5zdGFuY2VvZiB3aW5kb3cuTm9kZSAmJiBub2RlT3JWYWx1ZS5ub2RlVHlwZSA9PT0gbm9kZVR5cGUpIHtcblx0XHRcdFx0dGhpcy5ub2RlID0gbm9kZU9yVmFsdWU7XG5cdFx0XHRcdHRoaXMudmFsdWUgPSBub2RlT3JWYWx1ZS5ub2RlVmFsdWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFueXRoaW5nIGVsc2Vcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLm5vZGUgPSBkb2N1bWVudFttZXRob2ROYW1lXShcIlwiKTtcblx0XHRcdFx0dGhpcy5zZXRWYWx1ZShub2RlT3JWYWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdE5vZGUuY2FsbCh0aGlzKTtcblx0XHR9LFxuXG5cdFx0aW5zZXJ0QmVmb3JlOiBmdW5jdGlvbigpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihodW1hblR5cGUgKyBcIiBiaW5kaW5ncyBjYW4ndCBoYXZlIGNoaWxkcmVuLlwiKTtcblx0XHR9LFxuXG5cdFx0c2V0VmFsdWU6IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0XHR2YWx1ZSA9IHZhbHVlICE9IG51bGwgPyB2YWx1ZS50b1N0cmluZygpIDogXCJcIjtcblx0XHRcdGlmICh2YWx1ZSAhPT0gdGhpcy5ub2RlLm5vZGVWYWx1ZSkgdGhpcy5ub2RlLm5vZGVWYWx1ZSA9IHZhbHVlO1xuXHRcdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0aGlzLm5vZGUubm9kZVZhbHVlO1xuXHRcdH1cblx0fSk7XG59XG5cbnZhciBUZXh0ID0gZXhwb3J0cy5UZXh0ID0gbGVhZk5vZGUoMywgXCJjcmVhdGVUZXh0Tm9kZVwiLCBcIlRleHRcIik7XG52YXIgQ29tbWVudCA9IGV4cG9ydHMuQ29tbWVudCA9IGxlYWZOb2RlKDgsIFwiY3JlYXRlQ29tbWVudFwiLCBcIkNvbW1lbnRcIik7XG5cbkNvbW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG5cdHJldHVybiBcIjwhLS1cIiArIHRoaXMubm9kZS5ub2RlVmFsdWUgKyBcIi0tPlwiO1xufVxuXG52YXIgRWxlbWVudCA9XG5leHBvcnRzLkVsZW1lbnQgPSBOb2RlLmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihub2RlT3JUYWdOYW1lKSB7XG5cdFx0dmFyIGNoaWxkcmVuID0gdXRpbC50b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSk7XG5cblx0XHQvLyBlbGVtZW50XG5cdFx0aWYgKG5vZGVPclRhZ05hbWUgaW5zdGFuY2VvZiB3aW5kb3cuTm9kZSAmJiBub2RlT3JUYWdOYW1lLm5vZGVUeXBlID09PSAxKSB7XG5cdFx0XHR0aGlzLm5vZGUgPSBub2RlT3JUYWdOYW1lO1xuXHRcdFx0dGhpcy50YWduYW1lID0gbm9kZU9yVGFnTmFtZS50YWdOYW1lLnRvTG93ZXJDYXNlKCk7XG5cblx0XHRcdC8vIGFkZCBjaGlsZCBub2RlcyBhcyBmdXJ0aGVyIGNoaWxkcmVuXG5cdFx0XHQvLyBub3RlOiB0aGlzIG1heSBhZmZlY3QgdGhlIG9yaWdpbmFsIG5vZGUncyBjaGlsZHJlblxuXHRcdFx0ZnJvbU5vZGUodXRpbC50b0FycmF5KG5vZGVPclRhZ05hbWUuY2hpbGROb2RlcykpXG5cdFx0XHRcdC5mb3JFYWNoKGZ1bmN0aW9uKGIpIHsgY2hpbGRyZW4ucHVzaChiKTsgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gc3RyaW5nXG5cdFx0ZWxzZSBpZiAodHlwZW9mIG5vZGVPclRhZ05hbWUgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdHRoaXMudGFnbmFtZSA9IG5vZGVPclRhZ05hbWU7XG5cdFx0XHR0aGlzLm5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KG5vZGVPclRhZ05hbWUpO1xuXHRcdH1cblxuXHRcdC8vIG9yIGVycm9yXG5cdFx0ZWxzZSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIGZvciBlbGVtZW50IHRhZyBuYW1lLlwiKTtcblxuXHRcdC8vIHJ1biBwYXJlbnQgY29udHN0cnVjdG9yXG5cdFx0Tm9kZS5hcHBseSh0aGlzLCBjaGlsZHJlbik7XG5cblx0XHQvLyBhcHBseSBldmVudHNcblx0XHR2YXIgZXZlbnRzID0gdHlwZW9mIHRoaXMuZXZlbnRzID09PSBcImZ1bmN0aW9uXCIgPyB0aGlzLmV2ZW50cy5jYWxsKHRoaXMpIDogdGhpcy5ldmVudHM7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QoZXZlbnRzKSkgdGhpcy5hZGRFdmVudExpc3RlbmVyKGV2ZW50cyk7XG5cdH0sXG5cblx0Z2V0QXR0cmlidXRlOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5nZXRBdHRyaWJ1dGUobmFtZSk7XG5cdH0sXG5cblx0c2V0QXR0cmlidXRlOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuXHRcdHRoaXMubm9kZS5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZUF0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHRoaXMubm9kZS5yZW1vdmVBdHRyaWJ1dGUobmFtZSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YXR0cjogZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcblx0XHRpZiAodXRpbC5pc09iamVjdChuYW1lKSAmJiB2YWx1ZSA9PSBudWxsKSB7XG5cdFx0XHR1dGlsLmVhY2gobmFtZSwgZnVuY3Rpb24odiwgbikgeyB0aGlzLmF0dHIobiwgdik7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHRoaXMuZ2V0QXR0cmlidXRlKG5hbWUpO1xuXHRcdGVsc2UgdGhpcy5zZXRBdHRyaWJ1dGUobmFtZSwgdmFsdWUpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0c3R5bGU6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QobmFtZSkgJiYgdmFsdWUgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKG5hbWUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5zdHlsZShuLCB2KTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gZ2V0Q29tcHV0ZWRTdHlsZSh0aGlzLm5vZGUpW25hbWVdO1xuXHRcdGVsc2UgdGhpcy5ub2RlLnN0eWxlW25hbWVdID0gdmFsdWU7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRoYXNDbGFzczogZnVuY3Rpb24oY2xhc3NOYW1lKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5jbGFzc0xpc3QuY29udGFpbnMoY2xhc3NOYW1lKTtcblx0fSxcblxuXHRhZGRDbGFzczogZnVuY3Rpb24oKSB7XG5cdFx0dXRpbC5mbGF0dGVuKHV0aWwudG9BcnJheShhcmd1bWVudHMpKS5mb3JFYWNoKGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuXHRcdFx0dGhpcy5ub2RlLmNsYXNzTGlzdC5hZGQoY2xhc3NOYW1lLnNwbGl0KFwiIFwiKSk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVDbGFzczogZnVuY3Rpb24oKSB7XG5cdFx0dXRpbC5mbGF0dGVuKHV0aWwudG9BcnJheShhcmd1bWVudHMpKS5mb3JFYWNoKGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuXHRcdFx0dGhpcy5ub2RlLmNsYXNzTGlzdC5yZW1vdmUoY2xhc3NOYW1lLnNwbGl0KFwiIFwiKSk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRmaW5kOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdGlmICh1dGlsLm1hdGNoZXNTZWxlY3Rvcih0aGlzLm5vZGUsIHNlbGVjdG9yKSkgcmV0dXJuIHRoaXMubm9kZTtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXHR9LFxuXG5cdGZpbmRBbGw6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGVscyA9IFtdO1xuXHRcdGlmICh1dGlsLm1hdGNoZXNTZWxlY3Rvcih0aGlzLm5vZGUsIHNlbGVjdG9yKSkgZWxzLnB1c2godGhpcy5ub2RlKTtcblx0XHRlbHMucHVzaC5hcHBseShlbHMsIHV0aWwudG9BcnJheSh0aGlzLm5vZGUucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpKTtcblx0XHRyZXR1cm4gZWxzO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLm91dGVySFRNTDtcblx0fVxufSk7XG5cbi8vIGZhc3QgY29uc3RydWN0b3JzIGZvciB0eXBpY2FsIERPTSBlbGVtZW50IHRhZ25hbWVzXG5leHBvcnRzLkRPTSA9IHt9O1xuXG5bIC8vIEhUTUwgdGFnbmFtZXM7IHRoaXMgbGlzdCBpcyB0YWtlbiBmcm9tIEZCJ3MgUmVhY3RcblxuXCJhXCIsIFwiYWJiclwiLCBcImFkZHJlc3NcIiwgXCJhcmVhXCIsIFwiYXJ0aWNsZVwiLCBcImFzaWRlXCIsIFwiYXVkaW9cIiwgXCJiXCIsIFwiYmFzZVwiLCBcImJkaVwiLFxuXCJiZG9cIiwgXCJiaWdcIiwgXCJibG9ja3F1b3RlXCIsIFwiYm9keVwiLCBcImJyXCIsIFwiYnV0dG9uXCIsIFwiY2FudmFzXCIsIFwiY2FwdGlvblwiLCBcImNpdGVcIixcblwiY29kZVwiLCBcImNvbFwiLCBcImNvbGdyb3VwXCIsIFwiZGF0YVwiLCBcImRhdGFsaXN0XCIsIFwiZGRcIiwgXCJkZWxcIiwgXCJkZXRhaWxzXCIsIFwiZGZuXCIsXG5cImRpdlwiLCBcImRsXCIsIFwiZHRcIiwgXCJlbVwiLCBcImVtYmVkXCIsIFwiZmllbGRzZXRcIiwgXCJmaWdjYXB0aW9uXCIsIFwiZmlndXJlXCIsIFwiZm9vdGVyXCIsXG5cImZvcm1cIiwgXCJoMVwiLCBcImgyXCIsIFwiaDNcIiwgXCJoNFwiLCBcImg1XCIsIFwiaDZcIiwgXCJoZWFkXCIsIFwiaGVhZGVyXCIsIFwiaHJcIiwgXCJodG1sXCIsIFwiaVwiLFxuXCJpZnJhbWVcIiwgXCJpbWdcIiwgXCJpbnB1dFwiLCBcImluc1wiLCBcImtiZFwiLCBcImtleWdlblwiLCBcImxhYmVsXCIsIFwibGVnZW5kXCIsIFwibGlcIixcblwibGlua1wiLCBcIm1haW5cIiwgXCJtYXBcIiwgXCJtYXJrXCIsIFwibWVudVwiLCBcIm1lbnVpdGVtXCIsIFwibWV0YVwiLCBcIm1ldGVyXCIsIFwibmF2XCIsXG5cIm5vc2NyaXB0XCIsIFwib2JqZWN0XCIsIFwib2xcIiwgXCJvcHRncm91cFwiLCBcIm9wdGlvblwiLCBcIm91dHB1dFwiLCBcInBcIiwgXCJwYXJhbVwiLCBcInByZVwiLFxuXCJwcm9ncmVzc1wiLCBcInFcIiwgXCJycFwiLCBcInJ0XCIsIFwicnVieVwiLCBcInNcIiwgXCJzYW1wXCIsIFwic2NyaXB0XCIsIFwic2VjdGlvblwiLCBcInNlbGVjdFwiLFxuXCJzbWFsbFwiLCBcInNvdXJjZVwiLCBcInNwYW5cIiwgXCJzdHJvbmdcIiwgXCJzdHlsZVwiLCBcInN1YlwiLCBcInN1bW1hcnlcIiwgXCJzdXBcIiwgXCJ0YWJsZVwiLFxuXCJ0Ym9keVwiLCBcInRkXCIsIFwidGV4dGFyZWFcIiwgXCJ0Zm9vdFwiLCBcInRoXCIsIFwidGhlYWRcIiwgXCJ0aW1lXCIsIFwidGl0bGVcIiwgXCJ0clwiLFxuXCJ0cmFja1wiLCBcInVcIiwgXCJ1bFwiLCBcInZhclwiLCBcInZpZGVvXCIsIFwid2JyXCJcblxuXS5mb3JFYWNoKGZ1bmN0aW9uKHQpIHtcblx0ZXhwb3J0cy5ET01bdF0gPSBFbGVtZW50LmV4dGVuZCh7XG5cdFx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGFyZ3MgPSB1dGlsLnRvQXJyYXkoYXJndW1lbnRzKTtcblx0XHRcdGFyZ3MudW5zaGlmdCh0KTtcblx0XHRcdEVsZW1lbnQuYXBwbHkodGhpcywgYXJncyk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG4vLyBjb252ZXJ0cyBkb20gbm9kZXMgaW50byBiaW5kaW5nIGVxdWl2YWxlbnRzXG52YXIgZnJvbU5vZGUgPVxuZXhwb3J0cy5mcm9tTm9kZSA9IGZ1bmN0aW9uKG5vZGUpIHtcblx0aWYgKEFycmF5LmlzQXJyYXkobm9kZSkpIHtcblx0XHRyZXR1cm4gbm9kZS5tYXAoZnJvbU5vZGUpXG5cdFx0XHQuZmlsdGVyKGZ1bmN0aW9uKGIpIHsgcmV0dXJuIGIgIT0gbnVsbDsgfSk7XG5cdH1cblxuXHRzd2l0Y2ggKG5vZGUubm9kZVR5cGUpIHtcblx0XHQvLyBFbGVtZW50XG5cdFx0Y2FzZSAxOiByZXR1cm4gbmV3IEVsZW1lbnQobm9kZSk7XG5cdFx0XG5cdFx0Ly8gVGV4dCBOb2RlXG5cdFx0Y2FzZSAzOiByZXR1cm4gbmV3IFRleHQobm9kZSk7XG5cdFx0XG5cdFx0Ly8gQ29tbWVudCBOb2RlXG5cdFx0Y2FzZSA4OiByZXR1cm4gbmV3IENvbW1lbnQobm9kZSk7XG5cblx0XHQvLyBEb2N1bWVudCBGcmFnbWVudFxuXHRcdGNhc2UgMTE6XG5cdFx0XHR2YXIgYmluZGluZyA9IG5ldyBCaW5kaW5nO1xuXG5cdFx0XHRmcm9tTm9kZSh1dGlsLnRvQXJyYXkobm9kZS5jaGlsZE5vZGVzKSlcblx0XHRcdFx0LmZvckVhY2goYmluZGluZy5hcHBlbmRDaGlsZCwgYmluZGluZyk7XG5cblx0XHRcdHJldHVybiBiaW5kaW5nO1xuXHR9XG59XG5cbi8vIGNvbnZlcnRzIGEgc3RyaW5nIG9mIEhUTUwgaW50byBhIHNldCBvZiBzdGF0aWMgYmluZGluZ3NcbmV4cG9ydHMuZnJvbUhUTUwgPSBmdW5jdGlvbihodG1sKSB7XG5cdHZhciBjb250LCBub2Rlcztcblx0Y29udCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIilcblx0Y29udC5pbm5lckhUTUwgPSBodG1sO1xuXHRub2RlcyA9IGZyb21Ob2RlKHV0aWwudG9BcnJheShjb250LmNoaWxkTm9kZXMpKTtcblx0cmV0dXJuIG5vZGVzLmxlbmd0aCA9PT0gMSA/IG5vZGVzWzBdIDogbmV3IEJpbmRpbmcoKS5hcHBlbmQobm9kZXMpO1xufSIsInZhciB0b0FycmF5ID1cbmV4cG9ydHMudG9BcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwob2JqLCAwKTtcbn1cblxudmFyIGhhcyA9XG5leHBvcnRzLmhhcyA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG5cdHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xufVxuXG52YXIgZXh0ZW5kID1cbmV4cG9ydHMuZXh0ZW5kID0gZnVuY3Rpb24ob2JqKSB7XG5cdHRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKS5mb3JFYWNoKGZ1bmN0aW9uKG1peGluKSB7XG5cdFx0aWYgKCFtaXhpbikgcmV0dXJuO1xuXG5cdFx0Zm9yICh2YXIga2V5IGluIG1peGluKSB7XG5cdFx0XHRvYmpba2V5XSA9IG1peGluW2tleV07XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgZWFjaCA9XG5leHBvcnRzLmVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG5cdGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcblxuXHRpZiAob2JqLmZvckVhY2ggPT09IEFycmF5LnByb3RvdHlwZS5mb3JFYWNoKSB7XG5cdFx0b2JqLmZvckVhY2goaXRlcmF0b3IsIGNvbnRleHQpO1xuXHR9IGVsc2UgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSB7XG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0aXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpbaV0sIGksIG9iaik7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0aXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5c1tpXV0sIGtleXNbaV0sIG9iaik7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG9iajtcbn1cblxudmFyIGZsYXR0ZW4gPVxuZXhwb3J0cy5mbGF0dGVuID0gZnVuY3Rpb24oaW5wdXQsIG91dHB1dCkge1xuXHRpZiAob3V0cHV0ID09IG51bGwpIG91dHB1dCA9IFtdO1xuXG5cdGVhY2goaW5wdXQsIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSBmbGF0dGVuKHZhbHVlLCBvdXRwdXQpO1xuXHRcdGVsc2Ugb3V0cHV0LnB1c2godmFsdWUpO1xuXHR9KTtcblxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5leHBvcnRzLnBpY2sgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIGZsYXR0ZW4odG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpKVxuXG5cdC5yZWR1Y2UoZnVuY3Rpb24obm9iaiwga2V5KSB7XG5cdFx0bm9ialtrZXldID0gb2JqW2tleV07XG5cdFx0cmV0dXJuIG5vYmo7XG5cdH0sIHt9KTtcbn1cblxudmFyIGlzT2JqZWN0ID1cbmV4cG9ydHMuaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIG9iaiA9PT0gT2JqZWN0KG9iaik7XG59XG5cbmV4cG9ydHMudW5pcXVlSWQgPSAoZnVuY3Rpb24oKSB7XG5cdHZhciBpZCA9IDA7XG5cdHJldHVybiBmdW5jdGlvbihwcmVmaXgpIHtcblx0XHRyZXR1cm4gKHByZWZpeCB8fCBcIlwiKSArICgrK2lkKTtcblx0fVxufSkoKTtcblxuLy8gdGhlIHN1YmNsYXNzaW5nIGZ1bmN0aW9uIGZvdW5kIGluIEJhY2tib25lXG52YXIgc3ViY2xhc3MgPVxuZXhwb3J0cy5zdWJjbGFzcyA9IGZ1bmN0aW9uKHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7XG5cdHZhciBwYXJlbnQgPSB0aGlzO1xuXHR2YXIgY2hpbGQ7XG5cblx0Ly8gVGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIGZvciB0aGUgbmV3IHN1YmNsYXNzIGlzIGVpdGhlciBkZWZpbmVkIGJ5IHlvdVxuXHQvLyAodGhlIFwiY29uc3RydWN0b3JcIiBwcm9wZXJ0eSBpbiB5b3VyIGBleHRlbmRgIGRlZmluaXRpb24pLCBvciBkZWZhdWx0ZWRcblx0Ly8gYnkgdXMgdG8gc2ltcGx5IGNhbGwgdGhlIHBhcmVudCdzIGNvbnN0cnVjdG9yLlxuXHRpZiAocHJvdG9Qcm9wcyAmJiBoYXMocHJvdG9Qcm9wcywgJ2NvbnN0cnVjdG9yJykpIHtcblx0XHRjaGlsZCA9IHByb3RvUHJvcHMuY29uc3RydWN0b3I7XG5cdH0gZWxzZSB7XG5cdFx0Y2hpbGQgPSBmdW5jdGlvbigpeyByZXR1cm4gcGFyZW50LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IH07XG5cdH1cblxuXHQvLyBBZGQgc3RhdGljIHByb3BlcnRpZXMgdG8gdGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLCBpZiBzdXBwbGllZC5cblx0ZXh0ZW5kKGNoaWxkLCBwYXJlbnQsIHN0YXRpY1Byb3BzKTtcblxuXHQvLyBTZXQgdGhlIHByb3RvdHlwZSBjaGFpbiB0byBpbmhlcml0IGZyb20gYHBhcmVudGAsIHdpdGhvdXQgY2FsbGluZ1xuXHQvLyBgcGFyZW50YCdzIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLlxuXHR2YXIgU3Vycm9nYXRlID0gZnVuY3Rpb24oKXsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9O1xuXHRTdXJyb2dhdGUucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcblx0Y2hpbGQucHJvdG90eXBlID0gbmV3IFN1cnJvZ2F0ZTtcblxuXHQvLyBBZGQgcHJvdG90eXBlIHByb3BlcnRpZXMgKGluc3RhbmNlIHByb3BlcnRpZXMpIHRvIHRoZSBzdWJjbGFzcyxcblx0Ly8gaWYgc3VwcGxpZWQuXG5cdGlmIChwcm90b1Byb3BzKSBleHRlbmQoY2hpbGQucHJvdG90eXBlLCBwcm90b1Byb3BzKTtcblxuXHQvLyBTZXQgYSBjb252ZW5pZW5jZSBwcm9wZXJ0eSBpbiBjYXNlIHRoZSBwYXJlbnQncyBwcm90b3R5cGUgaXMgbmVlZGVkXG5cdC8vIGxhdGVyLlxuXHRjaGlsZC5fX3N1cGVyX18gPSBwYXJlbnQucHJvdG90eXBlO1xuXG5cdHJldHVybiBjaGlsZDtcbn1cblxuZXhwb3J0cy5pc05vZGVBdERPTVBvc2l0aW9uID0gZnVuY3Rpb24obm9kZSwgcGFyZW50LCBiZWZvcmUpIHtcblx0cmV0dXJuIG5vZGUucGFyZW50Tm9kZSA9PT0gcGFyZW50ICYmIG5vZGUubmV4dFNpYmxpbmcgPT09IGJlZm9yZTtcbn1cblxudmFyIG1hdGNoZXNTZWxlY3RvciA9IHR5cGVvZiBFbGVtZW50ICE9PSBcInVuZGVmaW5lZFwiID9cblx0RWxlbWVudC5wcm90b3R5cGUubWF0Y2hlcyB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS53ZWJraXRNYXRjaGVzU2VsZWN0b3IgfHxcblx0RWxlbWVudC5wcm90b3R5cGUubW96TWF0Y2hlc1NlbGVjdG9yIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLm1zTWF0Y2hlc1NlbGVjdG9yIDpcblx0ZnVuY3Rpb24oKSB7IHJldHVybiBmYWxzZTsgfTtcblxuZXhwb3J0cy5tYXRjaGVzU2VsZWN0b3IgPSBmdW5jdGlvbihlbGVtLCBzZWxlY3Rvcikge1xuXHRyZXR1cm4gbWF0Y2hlc1NlbGVjdG9yLmNhbGwoZWxlbSwgc2VsZWN0b3IpXG59XG5cbnZhciBtYXRjaGVzID0gZXhwb3J0cy5tYXRjaGVzID0gZnVuY3Rpb24obm9kZSwgc2VsZWN0b3IpIHtcblx0aWYgKF8uaXNBcnJheShzZWxlY3RvcikpIHJldHVybiBzZWxlY3Rvci5zb21lKGZ1bmN0aW9uKHMpIHtcblx0XHRyZXR1cm4gbWF0Y2hlcyhub2RlLCBzKTtcblx0fSk7XG5cblx0aWYgKHNlbGVjdG9yIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUpIHtcblx0XHRyZXR1cm4gbm9kZSA9PT0gc2VsZWN0b3I7XG5cdH1cblx0XG5cdGlmICh0eXBlb2Ygc2VsZWN0b3IgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHJldHVybiAhIXNlbGVjdG9yKG5vZGUpO1xuXHR9XG5cdFxuXHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gd2luZG93Lk5vZGUuRUxFTUVOVF9OT0RFKSB7XG5cdFx0cmV0dXJuIG1hdGNoZXNTZWxlY3Rvci5jYWxsKG5vZGUsIHNlbGVjdG9yKTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0cy5jbG9zZXN0ID0gZnVuY3Rpb24oZWxlbSwgc2VsZWN0b3IpIHtcblx0d2hpbGUgKGVsZW0gIT0gbnVsbCkge1xuXHRcdGlmIChlbGVtLm5vZGVUeXBlID09PSAxICYmIG1hdGNoZXMoZWxlbSwgc2VsZWN0b3IpKSByZXR1cm4gZWxlbTtcblx0XHRlbGVtID0gZWxlbS5wYXJlbnROb2RlO1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG5cbnZhciBkZWZpbmVDb21wdXRlZFByb3BlcnR5ID1cbmV4cG9ydHMuZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUpIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJmdW5jdGlvblwiKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgY29tcHV0ZWQgcHJvcGVydHkgdmFsdWUuXCIpO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLmNhbGwob2JqKTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnRzLmRlZmluZUNvbXB1dGVkUHJvcGVydGllcyA9IGZ1bmN0aW9uKG9iaiwgcHJvcHMpIHtcblx0T2JqZWN0LmtleXMocHJvcHMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0ZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eShvYmosIGtleSwgcHJvcHNba2V5XSk7XG5cdH0pO1xufVxuXG52YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcblxudmFyIGRlZmluZVJlYWN0aXZlUHJvcGVydHkgPVxuZXhwb3J0cy5kZWZpbmVSZWFjdGl2ZVByb3BlcnR5ID0gZnVuY3Rpb24ob2JqLCBwcm9wLCB2YWx1ZSwgY29lcmNlKSB7XG5cdGlmICghaXNPYmplY3Qob2JqKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG9iamVjdCB0byBkZWZpbmUgdGhlIHJlYWN0aXZlIHByb3BlcnR5IG9uLlwiKTtcblx0aWYgKHR5cGVvZiBwcm9wICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIGZvciBwcm9wZXJ0eSBuYW1lLlwiKTtcblxuXHRpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIgJiYgY29lcmNlID09IG51bGwpIHtcblx0XHRjb2VyY2UgPSB2YWx1ZTtcblx0XHR2YWx1ZSA9IHZvaWQgMDtcblx0fVxuXG5cdGlmICh0eXBlb2YgY29lcmNlICE9PSBcImZ1bmN0aW9uXCIpIGNvZXJjZSA9IGZ1bmN0aW9uKHYpIHsgcmV0dXJuIHY7IH07XG5cblx0Ly8gcnVucyB0aGUgY29lcmNpb24gZnVuY3Rpb24gbm9uLXJlYWN0aXZlbHkgdG8gcHJldmVudCBpbmZpbml0ZSBsb29wc1xuXHR2YXIgcHJvY2VzcyA9IFRyYWNrci5ub25yZWFjdGFibGUoZnVuY3Rpb24odikge1xuXHRcdHJldHVybiBjb2VyY2UuY2FsbChvYmosIHYsIHByb3AsIG9iaik7XG5cdH0pO1xuXG5cdHZhciBkZXAgPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3k7XG5cdHZhbHVlID0gcHJvY2Vzcyh2YWx1ZSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHR2YWwgPSBwcm9jZXNzKHZhbCk7XG5cblx0XHRcdGlmICh2YWwgIT09IHZhbHVlKSB7XG5cdFx0XHRcdHZhbHVlID0gdmFsO1xuXHRcdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG9iajtcbn1cblxuZXhwb3J0cy5kZWZpbmVSZWFjdGl2ZVByb3BlcnRpZXMgPSBmdW5jdGlvbihvYmosIHByb3BzLCBjb2VyY2UpIHtcblx0Zm9yICh2YXIgcHJvcCBpbiBwcm9wcykge1xuXHRcdGRlZmluZVJlYWN0aXZlUHJvcGVydHkob2JqLCBwcm9wLCBwcm9wc1twcm9wXSwgY29lcmNlIHx8IGZhbHNlKTtcblx0fVxuXG5cdHJldHVybiBvYmo7XG59IiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuICAgIHZhciBjdXJyZW50UXVldWU7XG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHZhciBpID0gLTE7XG4gICAgICAgIHdoaWxlICgrK2kgPCBsZW4pIHtcbiAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtpXSgpO1xuICAgICAgICB9XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbn1cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgcXVldWUucHVzaChmdW4pO1xuICAgIGlmICghZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBQYWNrYWdlIGRvY3MgYXQgaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlciAvL1xuLy8gTGFzdCBtZXJnZTogaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvYmxvYi9kMDdmZjhlOTljZmRlMjFjZjExM2RhMTNkMzVkMzg3YjBlZDMwOWEzL3BhY2thZ2VzL3RyYWNrZXIvdHJhY2tlci5qcyAvL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuLyoqXG4gKiBAbmFtZXNwYWNlIFRyYWNrclxuICogQHN1bW1hcnkgVGhlIG5hbWVzcGFjZSBmb3IgVHJhY2tyLXJlbGF0ZWQgbWV0aG9kcy5cbiAqL1xudmFyIFRyYWNrciA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWN0aXZlXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGVyZSBpcyBhIGN1cnJlbnQgY29tcHV0YXRpb24sIG1lYW5pbmcgdGhhdCBkZXBlbmRlbmNpZXMgb24gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIHdpbGwgYmUgdHJhY2tlZCBhbmQgcG90ZW50aWFsbHkgY2F1c2UgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gdG8gYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLmFjdGl2ZSA9IGZhbHNlO1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2N1cnJlbnRjb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLCBvciBgbnVsbGAgaWYgdGhlcmUgaXNuJ3Qgb25lLiAgVGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgdGhlIFtgVHJhY2tyLkNvbXB1dGF0aW9uYF0oI3RyYWNrZXJfY29tcHV0YXRpb24pIG9iamVjdCBjcmVhdGVkIGJ5IHRoZSBpbm5lcm1vc3QgYWN0aXZlIGNhbGwgdG8gYFRyYWNrci5hdXRvcnVuYCwgYW5kIGl0J3MgdGhlIGNvbXB1dGF0aW9uIHRoYXQgZ2FpbnMgZGVwZW5kZW5jaWVzIHdoZW4gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFyZSBhY2Nlc3NlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtUcmFja3IuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBudWxsO1xuXG52YXIgc2V0Q3VycmVudENvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGMpIHtcblx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IGM7XG5cdFRyYWNrci5hY3RpdmUgPSAhISBjO1xufTtcblxudmFyIF9kZWJ1Z0Z1bmMgPSBmdW5jdGlvbiAoKSB7XG5cdC8vIFdlIHdhbnQgdGhpcyBjb2RlIHRvIHdvcmsgd2l0aG91dCBNZXRlb3IsIGFuZCBhbHNvIHdpdGhvdXRcblx0Ly8gXCJjb25zb2xlXCIgKHdoaWNoIGlzIHRlY2huaWNhbGx5IG5vbi1zdGFuZGFyZCBhbmQgbWF5IGJlIG1pc3Npbmdcblx0Ly8gb24gc29tZSBicm93c2VyIHdlIGNvbWUgYWNyb3NzLCBsaWtlIGl0IHdhcyBvbiBJRSA3KS5cblx0Ly9cblx0Ly8gTGF6eSBldmFsdWF0aW9uIGJlY2F1c2UgYE1ldGVvcmAgZG9lcyBub3QgZXhpc3QgcmlnaHQgYXdheS4oPz8pXG5cdHJldHVybiAodHlwZW9mIE1ldGVvciAhPT0gXCJ1bmRlZmluZWRcIiA/IE1ldGVvci5fZGVidWcgOlxuXHRcdFx0XHRcdCgodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUubG9nID9cblx0XHRcdFx0XHQgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcblx0XHRcdFx0XHQgZnVuY3Rpb24gKCkge30pKTtcbn07XG5cbnZhciBfdGhyb3dPckxvZyA9IGZ1bmN0aW9uIChmcm9tLCBlKSB7XG5cdGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcblx0XHR0aHJvdyBlO1xuXHR9IGVsc2Uge1xuXHRcdHZhciBtZXNzYWdlQW5kU3RhY2s7XG5cdFx0aWYgKGUuc3RhY2sgJiYgZS5tZXNzYWdlKSB7XG5cdFx0XHR2YXIgaWR4ID0gZS5zdGFjay5pbmRleE9mKGUubWVzc2FnZSk7XG5cdFx0XHRpZiAoaWR4ID49IDAgJiYgaWR4IDw9IDEwKSAvLyBhbGxvdyBmb3IgXCJFcnJvcjogXCIgKGF0IGxlYXN0IDcpXG5cdFx0XHRcdG1lc3NhZ2VBbmRTdGFjayA9IGUuc3RhY2s7IC8vIG1lc3NhZ2UgaXMgcGFydCBvZiBlLnN0YWNrLCBhcyBpbiBDaHJvbWVcblx0XHRcdGVsc2Vcblx0XHRcdFx0bWVzc2FnZUFuZFN0YWNrID0gZS5tZXNzYWdlICtcblx0XHRcdFx0KGUuc3RhY2suY2hhckF0KDApID09PSAnXFxuJyA/ICcnIDogJ1xcbicpICsgZS5zdGFjazsgLy8gZS5nLiBTYWZhcmlcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZUFuZFN0YWNrID0gZS5zdGFjayB8fCBlLm1lc3NhZ2U7XG5cdFx0fVxuXHRcdF9kZWJ1Z0Z1bmMoKShcIkV4Y2VwdGlvbiBmcm9tIFRyYWNrciBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIixcblx0XHRcdFx0XHRcdFx0XHQgbWVzc2FnZUFuZFN0YWNrKTtcblx0fVxufTtcblxuLy8gVGFrZXMgYSBmdW5jdGlvbiBgZmAsIGFuZCB3cmFwcyBpdCBpbiBhIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZGBcbi8vIGJsb2NrIGlmIHdlIGFyZSBydW5uaW5nIG9uIHRoZSBzZXJ2ZXIuIE9uIHRoZSBjbGllbnQsIHJldHVybnMgdGhlXG4vLyBvcmlnaW5hbCBmdW5jdGlvbiAoc2luY2UgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYCBpcyBhXG4vLyBuby1vcCkuIFRoaXMgaGFzIHRoZSBiZW5lZml0IG9mIG5vdCBhZGRpbmcgYW4gdW5uZWNlc3Nhcnkgc3RhY2tcbi8vIGZyYW1lIG9uIHRoZSBjbGllbnQuXG52YXIgd2l0aE5vWWllbGRzQWxsb3dlZCA9IGZ1bmN0aW9uIChmKSB7XG5cdGlmICgodHlwZW9mIE1ldGVvciA9PT0gJ3VuZGVmaW5lZCcpIHx8IE1ldGVvci5pc0NsaWVudCkge1xuXHRcdHJldHVybiBmO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgYXJncyA9IGFyZ3VtZW50cztcblx0XHRcdE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Zi5hcHBseShudWxsLCBhcmdzKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cbn07XG5cbnZhciBuZXh0SWQgPSAxO1xuLy8gY29tcHV0YXRpb25zIHdob3NlIGNhbGxiYWNrcyB3ZSBzaG91bGQgY2FsbCBhdCBmbHVzaCB0aW1lXG52YXIgcGVuZGluZ0NvbXB1dGF0aW9ucyA9IFtdO1xuLy8gYHRydWVgIGlmIGEgVHJhY2tyLmZsdXNoIGlzIHNjaGVkdWxlZCwgb3IgaWYgd2UgYXJlIGluIFRyYWNrci5mbHVzaCBub3dcbnZhciB3aWxsRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgaW4gVHJhY2tyLmZsdXNoIG5vd1xudmFyIGluRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgY29tcHV0aW5nIGEgY29tcHV0YXRpb24gbm93LCBlaXRoZXIgZmlyc3QgdGltZVxuLy8gb3IgcmVjb21wdXRlLiAgVGhpcyBtYXRjaGVzIFRyYWNrci5hY3RpdmUgdW5sZXNzIHdlIGFyZSBpbnNpZGVcbi8vIFRyYWNrci5ub25yZWFjdGl2ZSwgd2hpY2ggbnVsbGZpZXMgY3VycmVudENvbXB1dGF0aW9uIGV2ZW4gdGhvdWdoXG4vLyBhbiBlbmNsb3NpbmcgY29tcHV0YXRpb24gbWF5IHN0aWxsIGJlIHJ1bm5pbmcuXG52YXIgaW5Db21wdXRlID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgdGhlIGBfdGhyb3dGaXJzdEVycm9yYCBvcHRpb24gd2FzIHBhc3NlZCBpbiB0byB0aGUgY2FsbFxuLy8gdG8gVHJhY2tyLmZsdXNoIHRoYXQgd2UgYXJlIGluLiBXaGVuIHNldCwgdGhyb3cgcmF0aGVyIHRoYW4gbG9nIHRoZVxuLy8gZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQgd2hpbGUgZmx1c2hpbmcuIEJlZm9yZSB0aHJvd2luZyB0aGUgZXJyb3IsXG4vLyBmaW5pc2ggZmx1c2hpbmcgKGZyb20gYSBmaW5hbGx5IGJsb2NrKSwgbG9nZ2luZyBhbnkgc3Vic2VxdWVudFxuLy8gZXJyb3JzLlxudmFyIHRocm93Rmlyc3RFcnJvciA9IGZhbHNlO1xuXG52YXIgYWZ0ZXJGbHVzaENhbGxiYWNrcyA9IFtdO1xuXG4vLyBsb29rIGZvciBhIHJlcXVlc3RBbmltYXRpb25GcmFtZSBhcyB0aGF0IGlzIHByZWZlcmFibGUgb3ZlciBuZXh0VGljayBvciBzZXRJbW1lZGlhdGVcbnZhciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID9cblx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuXHR3aW5kb3cubW96UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG5cdHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcblx0d2luZG93Lm9SZXF1ZXN0QW5pbWF0aW9uRnJhbWUgOlxuXHRudWxsO1xuXG4vLyBjb250cm9scyB0aGUgZGVmZXJyYWxcblRyYWNrci5uZXh0VGljayA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSAhPSBudWxsID8gcmVxdWVzdEFuaW1hdGlvbkZyYW1lLmJpbmQod2luZG93KSA6XG5cdHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiID8gcHJvY2Vzcy5uZXh0VGljayA6XG5cdGZ1bmN0aW9uIChmKSB7IHNldFRpbWVvdXQoZiwgMTYpOyB9O1xuXG52YXIgcmVxdWlyZUZsdXNoID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoISB3aWxsRmx1c2gpIHtcblx0XHRUcmFja3IubmV4dFRpY2soVHJhY2tyLmZsdXNoKTtcblx0XHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR9XG59O1xuXG4vLyBUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBBIENvbXB1dGF0aW9uIG9iamVjdCByZXByZXNlbnRzIGNvZGUgdGhhdCBpcyByZXBlYXRlZGx5IHJlcnVuXG4gKiBpbiByZXNwb25zZSB0b1xuICogcmVhY3RpdmUgZGF0YSBjaGFuZ2VzLiBDb21wdXRhdGlvbnMgZG9uJ3QgaGF2ZSByZXR1cm4gdmFsdWVzOyB0aGV5IGp1c3RcbiAqIHBlcmZvcm0gYWN0aW9ucywgc3VjaCBhcyByZXJlbmRlcmluZyBhIHRlbXBsYXRlIG9uIHRoZSBzY3JlZW4uIENvbXB1dGF0aW9uc1xuICogYXJlIGNyZWF0ZWQgdXNpbmcgVHJhY2tyLmF1dG9ydW4uIFVzZSBzdG9wIHRvIHByZXZlbnQgZnVydGhlciByZXJ1bm5pbmcgb2YgYVxuICogY29tcHV0YXRpb24uXG4gKiBAaW5zdGFuY2VuYW1lIGNvbXB1dGF0aW9uXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQsIGN0eCkge1xuXHRpZiAoISBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbilcblx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcIlRyYWNrci5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyBwcml2YXRlOyB1c2UgVHJhY2tyLmF1dG9ydW5cIik7XG5cdGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX3N0b3BwZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIHN0b3BwZWRcblx0ICovXG5cdHNlbGYuc3RvcHBlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVkXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBjb21wdXRhdGlvbiBoYXMgYmVlbiBpbnZhbGlkYXRlZCAoYW5kIG5vdCB5ZXQgcmVydW4pLCBvciBpZiBpdCBoYXMgYmVlbiBzdG9wcGVkLlxuXHQgKiBAbG9jdXMgQ2xpZW50XG5cdCAqIEBtZW1iZXJPZiBUcmFja3IuQ29tcHV0YXRpb25cblx0ICogQGluc3RhbmNlXG5cdCAqIEBuYW1lICBpbnZhbGlkYXRlZFxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHQvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9maXJzdHJ1blxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGR1cmluZyB0aGUgaW5pdGlhbCBydW4gb2YgdGhlIGNvbXB1dGF0aW9uIGF0IHRoZSB0aW1lIGBUcmFja3IuYXV0b3J1bmAgaXMgY2FsbGVkLCBhbmQgZmFsc2Ugb24gc3Vic2VxdWVudCByZXJ1bnMgYW5kIGF0IG90aGVyIHRpbWVzLlxuXHQgKiBAbG9jdXMgQ2xpZW50XG5cdCAqIEBtZW1iZXJPZiBUcmFja3IuQ29tcHV0YXRpb25cblx0ICogQGluc3RhbmNlXG5cdCAqIEBuYW1lICBmaXJzdFJ1blxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHNlbGYuZmlyc3RSdW4gPSB0cnVlO1xuXG5cdHNlbGYuX2lkID0gbmV4dElkKys7XG5cdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHQvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG5cdC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuXHRzZWxmLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdHNlbGYuX2Z1bmMgPSBmO1xuXHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHRzZWxmLl9jb250ZXh0ID0gY3R4IHx8IG51bGw7XG5cblx0dmFyIGVycm9yZWQgPSB0cnVlO1xuXHR0cnkge1xuXHRcdHNlbGYuX2NvbXB1dGUoKTtcblx0XHRlcnJvcmVkID0gZmFsc2U7XG5cdH0gZmluYWxseSB7XG5cdFx0c2VsZi5maXJzdFJ1biA9IGZhbHNlO1xuXHRcdGlmIChlcnJvcmVkKVxuXHRcdFx0c2VsZi5zdG9wKCk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBgY2FsbGJhY2tgIHRvIHJ1biB3aGVuIHRoaXMgY29tcHV0YXRpb24gaXMgbmV4dCBpbnZhbGlkYXRlZCwgb3IgcnVucyBpdCBpbW1lZGlhdGVseSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYWxyZWFkeSBpbnZhbGlkYXRlZC4gIFRoZSBjYWxsYmFjayBpcyBydW4gZXhhY3RseSBvbmNlIGFuZCBub3QgdXBvbiBmdXR1cmUgaW52YWxpZGF0aW9ucyB1bmxlc3MgYG9uSW52YWxpZGF0ZWAgaXMgY2FsbGVkIGFnYWluIGFmdGVyIHRoZSBjb21wdXRhdGlvbiBiZWNvbWVzIHZhbGlkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGludmFsaWRhdGlvbi4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgaW52YWxpZGF0ZWQuXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGZ1bmN0aW9uXCIpO1xuXG5cdGlmIChzZWxmLmludmFsaWRhdGVkKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggIT09IHZvaWQgMCA/IGN0eCA6IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcy5wdXNoKHsgZm46IGYsIGN0eDogY3R4IH0pO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgSW52YWxpZGF0ZXMgdGhpcyBjb21wdXRhdGlvbiBzbyB0aGF0IGl0IHdpbGwgYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuaW52YWxpZGF0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRpZiAoISBzZWxmLmludmFsaWRhdGVkKSB7XG5cdFx0Ly8gaWYgd2UncmUgY3VycmVudGx5IGluIF9yZWNvbXB1dGUoKSwgZG9uJ3QgZW5xdWV1ZVxuXHRcdC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuXHRcdGlmICghIHNlbGYuX3JlY29tcHV0aW5nICYmICEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0XHRyZXF1aXJlRmx1c2goKTtcblx0XHRcdHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcblx0XHR9XG5cblx0XHRzZWxmLmludmFsaWRhdGVkID0gdHJ1ZTtcblxuXHRcdC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG5cdFx0Ly8gc2VsZi5pbnZhbGlkYXRlZCA9PT0gdHJ1ZS5cblx0XHRmb3IodmFyIGkgPSAwLCBmOyBmID0gc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzW2ldOyBpKyspIHtcblx0XHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZi5mbikuY2FsbChmLmN0eCAhPT0gdm9pZCAwID8gZi5jdHggOiBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuXG4vKipcbiAqIEBzdW1tYXJ5IFByZXZlbnRzIHRoaXMgY29tcHV0YXRpb24gZnJvbSByZXJ1bm5pbmcuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcblx0aWYgKCEgdGhpcy5zdG9wcGVkKSB7XG5cdFx0dGhpcy5zdG9wcGVkID0gdHJ1ZTtcblx0XHR0aGlzLmludmFsaWRhdGUoKTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHNlbGYpO1xuXHR2YXIgcHJldmlvdXNJbkNvbXB1dGUgPSBpbkNvbXB1dGU7XG5cdGluQ29tcHV0ZSA9IHRydWU7XG5cdHRyeSB7XG5cdFx0d2l0aE5vWWllbGRzQWxsb3dlZChzZWxmLl9mdW5jKS5jYWxsKHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG5cdFx0aW5Db21wdXRlID0gcHJldmlvdXNJbkNvbXB1dGU7XG5cdH1cbn07XG5cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuX3JlY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHNlbGYuX3JlY29tcHV0aW5nID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAoc2VsZi5pbnZhbGlkYXRlZCAmJiAhIHNlbGYuc3RvcHBlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRfdGhyb3dPckxvZyhcInJlY29tcHV0ZVwiLCBlKTtcblx0XHRcdH1cblx0XHRcdC8vIElmIF9jb21wdXRlKCkgaW52YWxpZGF0ZWQgdXMsIHdlIHJ1biBhZ2FpbiBpbW1lZGlhdGVseS5cblx0XHRcdC8vIEEgY29tcHV0YXRpb24gdGhhdCBpbnZhbGlkYXRlcyBpdHNlbGYgaW5kZWZpbml0ZWx5IGlzIGFuXG5cdFx0XHQvLyBpbmZpbml0ZSBsb29wLCBvZiBjb3Vyc2UuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gV2UgY291bGQgcHV0IGFuIGl0ZXJhdGlvbiBjb3VudGVyIGhlcmUgYW5kIGNhdGNoIHJ1bi1hd2F5XG5cdFx0XHQvLyBsb29wcy5cblx0XHR9XG5cdH0gZmluYWxseSB7XG5cdFx0c2VsZi5fcmVjb21wdXRpbmcgPSBmYWxzZTtcblx0fVxufTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZGVwZW5kZW5jeVxuXG4vKipcbiAqIEBzdW1tYXJ5IEEgRGVwZW5kZW5jeSByZXByZXNlbnRzIGFuIGF0b21pYyB1bml0IG9mIHJlYWN0aXZlIGRhdGEgdGhhdCBhXG4gKiBjb21wdXRhdGlvbiBtaWdodCBkZXBlbmQgb24uIFJlYWN0aXZlIGRhdGEgc291cmNlcyBzdWNoIGFzIFNlc3Npb24gb3JcbiAqIE1pbmltb25nbyBpbnRlcm5hbGx5IGNyZWF0ZSBkaWZmZXJlbnQgRGVwZW5kZW5jeSBvYmplY3RzIGZvciBkaWZmZXJlbnRcbiAqIHBpZWNlcyBvZiBkYXRhLCBlYWNoIG9mIHdoaWNoIG1heSBiZSBkZXBlbmRlZCBvbiBieSBtdWx0aXBsZSBjb21wdXRhdGlvbnMuXG4gKiBXaGVuIHRoZSBkYXRhIGNoYW5nZXMsIHRoZSBjb21wdXRhdGlvbnMgYXJlIGludmFsaWRhdGVkLlxuICogQGNsYXNzXG4gKiBAaW5zdGFuY2VOYW1lIGRlcGVuZGVuY3lcbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kgPSBmdW5jdGlvbiAoKSB7XG5cdHRoaXMuX2RlcGVuZGVudHNCeUlkID0ge307XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2RlcGVuZFxuLy9cbi8vIEFkZHMgYGNvbXB1dGF0aW9uYCB0byB0aGlzIHNldCBpZiBpdCBpcyBub3QgYWxyZWFkeVxuLy8gcHJlc2VudC4gIFJldHVybnMgdHJ1ZSBpZiBgY29tcHV0YXRpb25gIGlzIGEgbmV3IG1lbWJlciBvZiB0aGUgc2V0LlxuLy8gSWYgbm8gYXJndW1lbnQsIGRlZmF1bHRzIHRvIGN1cnJlbnRDb21wdXRhdGlvbiwgb3IgZG9lcyBub3RoaW5nXG4vLyBpZiB0aGVyZSBpcyBubyBjdXJyZW50Q29tcHV0YXRpb24uXG5cbi8qKlxuICogQHN1bW1hcnkgRGVjbGFyZXMgdGhhdCB0aGUgY3VycmVudCBjb21wdXRhdGlvbiAob3IgYGZyb21Db21wdXRhdGlvbmAgaWYgZ2l2ZW4pIGRlcGVuZHMgb24gYGRlcGVuZGVuY3lgLiAgVGhlIGNvbXB1dGF0aW9uIHdpbGwgYmUgaW52YWxpZGF0ZWQgdGhlIG5leHQgdGltZSBgZGVwZW5kZW5jeWAgY2hhbmdlcy5cblxuSWYgdGhlcmUgaXMgbm8gY3VycmVudCBjb21wdXRhdGlvbiBhbmQgYGRlcGVuZCgpYCBpcyBjYWxsZWQgd2l0aCBubyBhcmd1bWVudHMsIGl0IGRvZXMgbm90aGluZyBhbmQgcmV0dXJucyBmYWxzZS5cblxuUmV0dXJucyB0cnVlIGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhIG5ldyBkZXBlbmRlbnQgb2YgYGRlcGVuZGVuY3lgIHJhdGhlciB0aGFuIGFuIGV4aXN0aW5nIG9uZS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7VHJhY2tyLkNvbXB1dGF0aW9ufSBbZnJvbUNvbXB1dGF0aW9uXSBBbiBvcHRpb25hbCBjb21wdXRhdGlvbiBkZWNsYXJlZCB0byBkZXBlbmQgb24gYGRlcGVuZGVuY3lgIGluc3RlYWQgb2YgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24uXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmRlcGVuZCA9IGZ1bmN0aW9uIChjb21wdXRhdGlvbikge1xuXHRpZiAoISBjb21wdXRhdGlvbikge1xuXHRcdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cblx0XHRjb21wdXRhdGlvbiA9IFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb247XG5cdH1cblx0dmFyIHNlbGYgPSB0aGlzO1xuXHR2YXIgaWQgPSBjb21wdXRhdGlvbi5faWQ7XG5cdGlmICghIChpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZCkpIHtcblx0XHRzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0gPSBjb21wdXRhdGlvbjtcblx0XHRjb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuXHRcdFx0ZGVsZXRlIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2NoYW5nZWRcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlIGFsbCBkZXBlbmRlbnQgY29tcHV0YXRpb25zIGltbWVkaWF0ZWx5IGFuZCByZW1vdmUgdGhlbSBhcyBkZXBlbmRlbnRzLlxuICogQGxvY3VzIENsaWVudFxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuY2hhbmdlZCA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRmb3IgKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcblx0XHRzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0uaW52YWxpZGF0ZSgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9oYXNkZXBlbmRlbnRzXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIERlcGVuZGVuY3kgaGFzIG9uZSBvciBtb3JlIGRlcGVuZGVudCBDb21wdXRhdGlvbnMsIHdoaWNoIHdvdWxkIGJlIGludmFsaWRhdGVkIGlmIHRoaXMgRGVwZW5kZW5jeSB3ZXJlIHRvIGNoYW5nZS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuaGFzRGVwZW5kZW50cyA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRmb3IodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuXHRcdHJldHVybiB0cnVlO1xuXHRyZXR1cm4gZmFsc2U7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2ZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgUHJvY2VzcyBhbGwgcmVhY3RpdmUgdXBkYXRlcyBpbW1lZGlhdGVseSBhbmQgZW5zdXJlIHRoYXQgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBhcmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5mbHVzaCA9IGZ1bmN0aW9uIChfb3B0cykge1xuXHQvLyBYWFggV2hhdCBwYXJ0IG9mIHRoZSBjb21tZW50IGJlbG93IGlzIHN0aWxsIHRydWU/IChXZSBubyBsb25nZXJcblx0Ly8gaGF2ZSBTcGFyaylcblx0Ly9cblx0Ly8gTmVzdGVkIGZsdXNoIGNvdWxkIHBsYXVzaWJseSBoYXBwZW4gaWYsIHNheSwgYSBmbHVzaCBjYXVzZXNcblx0Ly8gRE9NIG11dGF0aW9uLCB3aGljaCBjYXVzZXMgYSBcImJsdXJcIiBldmVudCwgd2hpY2ggcnVucyBhblxuXHQvLyBhcHAgZXZlbnQgaGFuZGxlciB0aGF0IGNhbGxzIFRyYWNrci5mbHVzaC4gIEF0IHRoZSBtb21lbnRcblx0Ly8gU3BhcmsgYmxvY2tzIGV2ZW50IGhhbmRsZXJzIGR1cmluZyBET00gbXV0YXRpb24gYW55d2F5LFxuXHQvLyBiZWNhdXNlIHRoZSBMaXZlUmFuZ2UgdHJlZSBpc24ndCB2YWxpZC4gIEFuZCB3ZSBkb24ndCBoYXZlXG5cdC8vIGFueSB1c2VmdWwgbm90aW9uIG9mIGEgbmVzdGVkIGZsdXNoLlxuXHQvL1xuXHQvLyBodHRwczovL2FwcC5hc2FuYS5jb20vMC8xNTk5MDgzMzAyNDQvMzg1MTM4MjMzODU2XG5cdGlmIChpbkZsdXNoKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNhbGwgVHJhY2tyLmZsdXNoIHdoaWxlIGZsdXNoaW5nXCIpO1xuXG5cdGlmIChpbkNvbXB1dGUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmx1c2ggaW5zaWRlIFRyYWNrci5hdXRvcnVuXCIpO1xuXG5cdGluRmx1c2ggPSB0cnVlO1xuXHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR0aHJvd0ZpcnN0RXJyb3IgPSAhISAoX29wdHMgJiYgX29wdHMuX3Rocm93Rmlyc3RFcnJvcik7XG5cblx0dmFyIGZpbmlzaGVkVHJ5ID0gZmFsc2U7XG5cdHRyeSB7XG5cdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8XG5cdFx0XHRcdFx0IGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cblx0XHRcdC8vIHJlY29tcHV0ZSBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnNcblx0XHRcdHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR2YXIgY29tcCA9IHBlbmRpbmdDb21wdXRhdGlvbnMuc2hpZnQoKTtcblx0XHRcdFx0Y29tcC5fcmVjb21wdXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBjYWxsIG9uZSBhZnRlckZsdXNoIGNhbGxiYWNrLCB3aGljaCBtYXlcblx0XHRcdFx0Ly8gaW52YWxpZGF0ZSBtb3JlIGNvbXB1dGF0aW9uc1xuXHRcdFx0XHR2YXIgY2IgPSBhZnRlckZsdXNoQ2FsbGJhY2tzLnNoaWZ0KCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y2IuZm4uY2FsbChjYi5jdHgpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0X3Rocm93T3JMb2coXCJhZnRlckZsdXNoXCIsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZpbmlzaGVkVHJ5ID0gdHJ1ZTtcblx0fSBmaW5hbGx5IHtcblx0XHRpZiAoISBmaW5pc2hlZFRyeSkge1xuXHRcdFx0Ly8gd2UncmUgZXJyb3Jpbmdcblx0XHRcdGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBUcmFja3IuZmx1c2goKWAgYWdhaW5cblx0XHRcdFRyYWNrci5mbHVzaCh7X3Rocm93Rmlyc3RFcnJvcjogZmFsc2V9KTsgLy8gZmluaXNoIGZsdXNoaW5nXG5cdFx0fVxuXHRcdHdpbGxGbHVzaCA9IGZhbHNlO1xuXHRcdGluRmx1c2ggPSBmYWxzZTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hdXRvcnVuXG4vL1xuLy8gUnVuIGYoKS4gUmVjb3JkIGl0cyBkZXBlbmRlbmNpZXMuIFJlcnVuIGl0IHdoZW5ldmVyIHRoZVxuLy8gZGVwZW5kZW5jaWVzIGNoYW5nZS5cbi8vXG4vLyBSZXR1cm5zIGEgbmV3IENvbXB1dGF0aW9uLCB3aGljaCBpcyBhbHNvIHBhc3NlZCB0byBmLlxuLy9cbi8vIExpbmtzIHRoZSBjb21wdXRhdGlvbiB0byB0aGUgY3VycmVudCBjb21wdXRhdGlvblxuLy8gc28gdGhhdCBpdCBpcyBzdG9wcGVkIGlmIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIGlzIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIG5vdyBhbmQgcmVydW4gaXQgbGF0ZXIgd2hlbmV2ZXIgaXRzIGRlcGVuZGVuY2llcyBjaGFuZ2UuIFJldHVybnMgYSBDb21wdXRhdGlvbiBvYmplY3QgdGhhdCBjYW4gYmUgdXNlZCB0byBzdG9wIG9yIG9ic2VydmUgdGhlIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHJ1bkZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1bi4gSXQgcmVjZWl2ZXMgb25lIGFyZ3VtZW50OiB0aGUgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgd2lsbCBiZSByZXR1cm5lZC5cbiAqIEByZXR1cm5zIHtUcmFja3IuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrci5hdXRvcnVuID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdUcmFja3IuYXV0b3J1biByZXF1aXJlcyBhIGZ1bmN0aW9uIGFyZ3VtZW50Jyk7XG5cblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuXHR2YXIgYyA9IG5ldyBUcmFja3IuQ29tcHV0YXRpb24oZiwgVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiwgY3R4KTtcblxuXHRpZiAoVHJhY2tyLmFjdGl2ZSlcblx0XHRUcmFja3Iub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcblx0XHRcdGMuc3RvcCgpO1xuXHRcdH0pO1xuXG5cdHJldHVybiBjO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9ub25yZWFjdGl2ZVxuLy9cbi8vIFJ1biBgZmAgd2l0aCBubyBjdXJyZW50IGNvbXB1dGF0aW9uLCByZXR1cm5pbmcgdGhlIHJldHVybiB2YWx1ZVxuLy8gb2YgYGZgLiAgVXNlZCB0byB0dXJuIG9mZiByZWFjdGl2aXR5IGZvciB0aGUgZHVyYXRpb24gb2YgYGZgLFxuLy8gc28gdGhhdCByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYWNjZXNzZWQgYnkgYGZgIHdpbGwgbm90IHJlc3VsdCBpbiBhbnlcbi8vIGNvbXB1dGF0aW9ucyBiZWluZyBpbnZhbGlkYXRlZC5cblxuLyoqXG4gKiBAc3VtbWFyeSBSdW4gYSBmdW5jdGlvbiB3aXRob3V0IHRyYWNraW5nIGRlcGVuZGVuY2llcy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgQSBmdW5jdGlvbiB0byBjYWxsIGltbWVkaWF0ZWx5LlxuICovXG5UcmFja3Iubm9uUmVhY3RpdmUgPSBcblRyYWNrci5ub25yZWFjdGl2ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuXHR0cnkge1xuXHRcdHJldHVybiBmLmNhbGwoY3R4KTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuXHR9XG59O1xuXG4vLyBsaWtlIG5vbnJlYWN0aXZlIGJ1dCBtYWtlcyBhIGZ1bmN0aW9uIGluc3RlYWRcblRyYWNrci5ub25SZWFjdGFibGUgPSBcblRyYWNrci5ub25yZWFjdGFibGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHR2YXIgYXJncyA9IGFyZ3VtZW50cztcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0cmV0dXJuIFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBmLmFwcGx5KGN0eCwgYXJncyk7XG5cdFx0fSk7XG5cdH07XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBhIG5ldyBbYG9uSW52YWxpZGF0ZWBdKCNjb21wdXRhdGlvbl9vbmludmFsaWRhdGUpIGNhbGxiYWNrIG9uIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uICh3aGljaCBtdXN0IGV4aXN0KSwgdG8gYmUgY2FsbGVkIGltbWVkaWF0ZWx5IHdoZW4gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQgb3Igc3RvcHBlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGludm9rZWQgYXMgYGZ1bmMoYylgLCB3aGVyZSBgY2AgaXMgdGhlIGNvbXB1dGF0aW9uIG9uIHdoaWNoIHRoZSBjYWxsYmFjayBpcyByZWdpc3RlcmVkLlxuICovXG5UcmFja3Iub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRpZiAoISBUcmFja3IuYWN0aXZlKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIlRyYWNrci5vbkludmFsaWRhdGUgcmVxdWlyZXMgYSBjdXJyZW50Q29tcHV0YXRpb25cIik7XG5cblx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZiwgY3R4KTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWZ0ZXJmbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFNjaGVkdWxlcyBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBkdXJpbmcgdGhlIG5leHQgZmx1c2gsIG9yIGxhdGVyIGluIHRoZSBjdXJyZW50IGZsdXNoIGlmIG9uZSBpcyBpbiBwcm9ncmVzcywgYWZ0ZXIgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBoYXZlIGJlZW4gcmVydW4uICBUaGUgZnVuY3Rpb24gd2lsbCBiZSBydW4gb25jZSBhbmQgbm90IG9uIHN1YnNlcXVlbnQgZmx1c2hlcyB1bmxlc3MgYGFmdGVyRmx1c2hgIGlzIGNhbGxlZCBhZ2Fpbi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gY2FsbCBhdCBmbHVzaCB0aW1lLlxuICovXG5UcmFja3IuYWZ0ZXJGbHVzaCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0YWZ0ZXJGbHVzaENhbGxiYWNrcy5wdXNoKHsgZm46IGYsIGN0eDogY3R4IH0pO1xuXHRyZXF1aXJlRmx1c2goKTtcbn07Il19
