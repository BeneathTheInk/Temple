/*
 * Temple
 * (c) 2014 Beneath the Ink, Inc.
 * MIT License
 * Version 0.3.0
 */

!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Temple=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(_dereq_,module,exports){
var Events = _dereq_("./events"),
	Deps = _dereq_("./deps"),
	util = _dereq_("./util");

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
		// special case for strings
		if (typeof child === "string") child = new Binding.Text(child);

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
		var comp = Deps.autorun(fn, this);
		if (onlyOnActive && !Deps.active) comp.stop();
		return comp;
	},

	toString: function() {
		return this.children.map(function(child) {
			return child.toString();
		}).join("");
	}
});

// aliases
Binding.prototype.hasChild = Binding.prototype.contains;
Binding.prototype.toHTML = Binding.prototype.toString;

// Load the bindings
util.extend(Binding, _dereq_("./node"));
Binding.HTML = _dereq_("./html");
Binding.React = _dereq_("./react");

},{"./deps":2,"./events":3,"./html":4,"./node":6,"./react":7,"./util":8}],2:[function(_dereq_,module,exports){
// Copy of https://github.com/meteor/meteor/commits/e78861b7d0dbb60e5e2bf59bab2cb06ce6596c04/packages/deps/deps.js
// (c) 2011-2014 Meteor Development Group

//////////////////////////////////////////////////
// Package docs at http://docs.meteor.com/#deps //
//////////////////////////////////////////////////

var Deps = module.exports = {};

// http://docs.meteor.com/#deps_active
Deps.active = false;

// http://docs.meteor.com/#deps_currentcomputation
Deps.currentComputation = null;

var setCurrentComputation = function (c) {
  Deps.currentComputation = c;
  Deps.active = !! c;
};

var _debugFunc = function () {
  // lazy evaluation because `Meteor` does not exist right away
  return (typeof Meteor !== "undefined" ? Meteor._debug :
          ((typeof console !== "undefined") && console.log ?
           function () { console.log.apply(console, arguments); } :
           function () {}));
};

var _throwOrLog = function (from, e) {
  if (throwFirstError) {
    throw e;
  } else {
    _debugFunc()("Exception from Deps " + from + " function:",
                 e.stack || e.message);
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
// `true` if a Deps.flush is scheduled, or if we are in Deps.flush now
var willFlush = false;
// `true` if we are in Deps.flush now
var inFlush = false;
// `true` if we are computing a computation now, either first time
// or recompute.  This matches Deps.active unless we are inside
// Deps.nonreactive, which nullfies currentComputation even though
// an enclosing computation may still be running.
var inCompute = false;
// `true` if the `_throwFirstError` option was passed in to the call
// to Deps.flush that we are in. When set, throw rather than log the
// first error encountered while flushing. Before throwing the error,
// finish flushing (from a finally block), logging any subsequent
// errors.
var throwFirstError = false;

var afterFlushCallbacks = [];

var requireFlush = function () {
  if (! willFlush) {
    setTimeout(Deps.flush, 0);
    willFlush = true;
  }
};

// Deps.Computation constructor is visible but private
// (throws an error if you try to call it)
var constructingComputation = false;

//
// http://docs.meteor.com/#deps_computation
//
Deps.Computation = function (f, parent, ctx) {
  if (! constructingComputation)
    throw new Error(
      "Deps.Computation constructor is private; use Deps.autorun");
  constructingComputation = false;

  var self = this;

  // http://docs.meteor.com/#computation_stopped
  self.stopped = false;

  // http://docs.meteor.com/#computation_invalidated
  self.invalidated = false;

  // http://docs.meteor.com/#computation_firstrun
  self.firstRun = true;

  self._id = nextId++;
  self._onInvalidateCallbacks = [];
  // the plan is at some point to use the parent relation
  // to constrain the order that computations are processed
  self._parent = parent;
  self._func = f;
  self._context = ctx || this;
  self._recomputing = false;

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
Deps.Computation.prototype.onInvalidate = function (f, ctx) {
  var self = this;

  if (typeof f !== 'function')
    throw new Error("onInvalidate requires a function");

  if (self.invalidated) {
    Deps.nonreactive(function () {
      withNoYieldsAllowed(f).call(ctx || self._context, self);
    });
  } else {
    f._context = ctx;
    self._onInvalidateCallbacks.push(f);
  }
};

// http://docs.meteor.com/#computation_invalidate
Deps.Computation.prototype.invalidate = function () {
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
      Deps.nonreactive(function () {
        withNoYieldsAllowed(f).call(f._context || self._context, self);
      });
    }
    self._onInvalidateCallbacks = [];
  }
};

// http://docs.meteor.com/#computation_stop
Deps.Computation.prototype.stop = function () {
  if (! this.stopped) {
    this.stopped = true;
    this.invalidate();
  }
};

Deps.Computation.prototype._compute = function () {
  var self = this;
  self.invalidated = false;

  var previous = Deps.currentComputation;
  setCurrentComputation(self);
  var previousInCompute = inCompute;
  inCompute = true;
  try {
    withNoYieldsAllowed(self._func).call(self._context, self);
  } finally {
    setCurrentComputation(previous);
    inCompute = false;
  }
};

Deps.Computation.prototype._recompute = function () {
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
// http://docs.meteor.com/#deps_dependency
//
Deps.Dependency = function () {
  this._dependentsById = {};
};

// http://docs.meteor.com/#dependency_depend
//
// Adds `computation` to this set if it is not already
// present.  Returns true if `computation` is a new member of the set.
// If no argument, defaults to currentComputation, or does nothing
// if there is no currentComputation.
Deps.Dependency.prototype.depend = function (computation) {
  if (! computation) {
    if (! Deps.active)
      return false;

    computation = Deps.currentComputation;
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
Deps.Dependency.prototype.changed = function () {
  var self = this;
  for (var id in self._dependentsById)
    self._dependentsById[id].invalidate();
};

// http://docs.meteor.com/#dependency_hasdependents
Deps.Dependency.prototype.hasDependents = function () {
  var self = this;
  for(var id in self._dependentsById)
    return true;
  return false;
};

// http://docs.meteor.com/#deps_flush
Deps.flush = function (_opts) {
  // XXX What part of the comment below is still true? (We no longer
  // have Spark)
  //
  // Nested flush could plausibly happen if, say, a flush causes
  // DOM mutation, which causes a "blur" event, which runs an
  // app event handler that calls Deps.flush.  At the moment
  // Spark blocks event handlers during DOM mutation anyway,
  // because the LiveRange tree isn't valid.  And we don't have
  // any useful notion of a nested flush.
  //
  // https://app.asana.com/0/159908330244/385138233856
  if (inFlush)
    throw new Error("Can't call Deps.flush while flushing");

  if (inCompute)
    throw new Error("Can't flush inside Deps.autorun");

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
        var func = afterFlushCallbacks.shift();
        try {
          func.call(func._context);
        } catch (e) {
          _throwOrLog("afterFlush function", e);
        }
      }
    }
    finishedTry = true;
  } finally {
    if (! finishedTry) {
      // we're erroring
      inFlush = false; // needed before calling `Deps.flush()` again
      Deps.flush({_throwFirstError: false}); // finish flushing
    }
    willFlush = false;
    inFlush = false;
  }
};

// http://docs.meteor.com/#deps_autorun
//
// Run f(). Record its dependencies. Rerun it whenever the
// dependencies change.
//
// Returns a new Computation, which is also passed to f.
//
// Links the computation to the current computation
// so that it is stopped if the current computation is invalidated.
Deps.autorun = function (f, ctx) {
  if (typeof f !== 'function')
    throw new Error('Deps.autorun requires a function argument');

  constructingComputation = true;
  var c = new Deps.Computation(f, Deps.currentComputation, ctx);

  if (Deps.active)
    Deps.onInvalidate(function () {
      c.stop();
    });

  return c;
};

// http://docs.meteor.com/#deps_nonreactive
//
// Run `f` with no current computation, returning the return value
// of `f`.  Used to turn off reactivity for the duration of `f`,
// so that reactive data sources accessed by `f` will not result in any
// computations being invalidated.
Deps.nonreactive = function (f, ctx) {
  var previous = Deps.currentComputation;
  setCurrentComputation(null);
  try {
    return f.call(ctx);
  } finally {
    setCurrentComputation(previous);
  }
};

// similar to nonreactive but returns a function instead of
// exectuing fn immediately. really just some sugar
Deps.nonreactable = function (f, ctx) {
  return function() {
    return Deps.nonreactive(f, ctx || this);
  }
}

// http://docs.meteor.com/#deps_oninvalidate
Deps.onInvalidate = function (f, ctx) {
  if (! Deps.active)
    throw new Error("Deps.onInvalidate requires a currentComputation");

  Deps.currentComputation.onInvalidate(f, ctx);
};

// http://docs.meteor.com/#deps_afterflush
Deps.afterFlush = function (f, ctx) {
  f._context = ctx;
  afterFlushCallbacks.push(f);
  requireFlush();
};
},{}],3:[function(_dereq_,module,exports){
var util = _dereq_("./util");

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
},{"./util":8}],4:[function(_dereq_,module,exports){
var Binding = _dereq_("./binding"),
	util = _dereq_("./util");

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
		val = val != null ? val.toString() : "";
		if (val === this.value) return this;

		this.removeNodes();
		this.value = val;

		// convert html into DOM nodes
		div = document.createElement("div");
		div.innerHTML = val;
		this.nodes = util.toArray(div.childNodes);

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

},{"./binding":1,"./util":8}],5:[function(_dereq_,module,exports){
var Binding = _dereq_("./binding"),
	util = _dereq_("./util");

// export
var Temple =
module.exports = Binding;

// static properties/methods
Temple.VERSION = "0.3.0-alpha";
Temple.util = util;
Temple.Events = _dereq_("./events");

// deps setup
var Deps = Temple.Deps = _dereq_("./deps");
Temple.autorun = Deps.autorun;
Temple.Dependency = Deps.Dependency;
},{"./binding":1,"./deps":2,"./events":3,"./util":8}],6:[function(_dereq_,module,exports){
var Binding = _dereq_("./binding"),
	util = _dereq_("./util");

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

	toNodes: function() {
		return [ this.node ];
	},

	firstNode: function() {
		return this.node;
	},

	find: function() { return null; },
	findAll: function() { return []; }
});

exports.Text = Node.extend({
	constructor: function(value) {
		Node.call(this);
		this.node = document.createTextNode("");
		this.setValue(value);
	},

	insertBefore: function() {
		throw new Error("Text bindings can't have children.");
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

var Element =
exports.Element = Node.extend({
	constructor: function(tagname) {
		if (typeof tagname !== "string")
			throw new Error("Expecting string for element tag name.");

		this.tagname = tagname;
		this.node = document.createElement(tagname);

		Node.apply(this, util.toArray(arguments).slice(1));
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

	prop: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.prop(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return this.node[name];
		else this.node[name] = value;

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
			this.node.classList.add(className);
		}, this);

		return this;
	},

	removeClass: function() {
		util.flatten(util.toArray(arguments)).forEach(function(className) {
			this.node.classList.remove(className);
		}, this);

		return this;
	},

	addEventListener: function(type, listener) {
		if (util.isObject(type) && listener == null) {
			util.each(type, function(v, n) { this.addEventListener(n, v); }, this);
			return this;
		}

		this.node.addEventListener(type, listener);
		return this;
	},

	removeEventListener: function(type, listener) {
		if (util.isObject(type) && listener == null) {
			util.each(type, function(v, n) { this.removeEventListener(n, v); }, this);
			return this;
		}

		this.node.removeEventListener(type, listener);
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

},{"./binding":1,"./util":8}],7:[function(_dereq_,module,exports){
var Binding = _dereq_("./binding"),
	util = _dereq_("./util");

module.exports = Binding.extend({
	constructor: function() {
		// turns a few events into instance methods to make this class more functional
		// but also to match closer to FB's React component API
		["mount","render","invalidate"].forEach(function(evt) {
			var caps = evt[0].toUpperCase() + evt.substr(1);
			this.on(evt + ":before", runIfExists(this, "before" + caps));
			this.on(evt, runIfExists(this, "on" + caps));
			this.on(evt + ":after", runIfExists(this, "after" + caps));
		}, this);

		this.on("stop", runIfExists(this, "onStop"));

		Binding.apply(this);
		this.initialize.apply(this, arguments);
	},

	initialize: function(){},
	render: function(){},

	mount: function() {
		var args = util.toArray(arguments), comp;

		// stop existing mount
		this.stop();

		// the first event in the cycle, before everything else
		this.trigger("mount:before", args);

		// the autorun computation
		comp = this._comp = this.autorun(function(comp) {
			// only render event without bindings
			this.trigger("render:before", comp, args);

			// run render and process the resulting bindings into an array
			var bindings = this.render.apply(this, args);
			if (Binding.isBinding(bindings)) bindings = [ bindings ];
			if (!Array.isArray(bindings)) bindings = [];

			// main render event execs after render but before appending
			// the bindings array can be affected by this event
			this.trigger("render", bindings, comp, args);

			// append the bindings in order
			bindings = bindings.map(this.appendChild, this);
			
			// the last render event
			this.trigger("render:after", bindings, comp, args);

			// auto clean up
			comp.onInvalidate(function() {
				// only invalidate event with bindings
				this.trigger("invalidate:before", bindings, comp, args);
				
				// remove the bindings added before
				bindings.forEach(this.removeChild, this);
				
				// remaining invalidate events
				this.trigger("invalidate", comp, args);
				this.trigger("invalidate:after", comp, args);

				// detect if the computation stopped
				if (comp.stopped) {
					this.trigger("stop", args);
					delete this._comp;
				}
			});
		});

		// remaining mount events happen after the first render
		this.trigger("mount", comp, args);
		this.trigger("mount:after", comp, args);

		return this;
	},

	isMounted: function() {
		return this._comp != null;
	},

	invalidate: function() {
		if (this.isMounted()) this._comp.invalidate();
		return this;
	},

	stop: function() {
		if (this.isMounted()) this._comp.stop();
		return this;
	}
});

function runIfExists(obj, method) {
	return function() {
		if (typeof obj[method] === "function") {
			return obj[method].apply(obj, arguments);
		}
	}
}

},{"./binding":1,"./util":8}],8:[function(_dereq_,module,exports){
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

var matchesSelector = Element.prototype.matches ||
	Element.prototype.webkitMatchesSelector ||
	Element.prototype.mozMatchesSelector ||
	Element.prototype.msMatchesSelector;

exports.matchesSelector = function(elem, selector) {
	return matchesSelector.call(elem, selector)
}

var Deps = _dereq_("./deps");

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
	function process(v) {
		return Deps.nonreactive(function() {
			return coerce.call(obj, v, prop, obj);
		});
	}

	var dep = new Deps.Dependency;
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

},{"./deps":2}]},{},[5])
(5)
});