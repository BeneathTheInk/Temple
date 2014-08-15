/* Temple / (c) 2014 Beneath the Ink, Inc. / MIT License / Version 0.3.0, Build 126 */
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy90eWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9ub2RlX21vZHVsZXMvZ3J1bnQtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9iaW5kaW5nLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9kZXBzLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ldmVudHMuanMiLCIvVXNlcnMvdHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2h0bWwuanMiLCIvVXNlcnMvdHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2luZGV4LmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ub2RlLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9yZWFjdC5qcyIsIi9Vc2Vycy90eWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9saWIvdXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1WEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgRXZlbnRzID0gcmVxdWlyZShcIi4vZXZlbnRzXCIpLFxuXHREZXBzID0gcmVxdWlyZShcIi4vZGVwc1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbnZhciBjb21wdXRlZFByb3BzID0gW1xuXHRcImlzUm9vdFwiLCBcImhhc0NoaWxkcmVuXCIsIFwiZmlyc3RDaGlsZFwiLCBcImxhc3RDaGlsZFwiLCBcIm5leHRTaWJsaW5nXCIsXG5cdFwicHJldmlvdXNTaWJsaW5nXCIsIFwicGFyZW50Tm9kZVwiLCBcImZpcnN0Tm9kZVwiLCBcIm5leHRTaWJsaW5nTm9kZVwiXG5dO1xuXG5mdW5jdGlvbiBCaW5kaW5nKCkge1xuXHR0aGlzLmNoaWxkcmVuID0gW107XG5cdHRoaXMucGFyZW50ID0gbnVsbDtcblx0dXRpbC5kZWZpbmVDb21wdXRlZFByb3BlcnRpZXModGhpcywgdXRpbC5waWNrKHRoaXMsIGNvbXB1dGVkUHJvcHMpKTtcblx0dXRpbC50b0FycmF5KGFyZ3VtZW50cykuZm9yRWFjaCh0aGlzLmFwcGVuZENoaWxkLCB0aGlzKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCaW5kaW5nO1xuQmluZGluZy5leHRlbmQgPSB1dGlsLnN1YmNsYXNzO1xuQmluZGluZy5pc0JpbmRpbmcgPSBmdW5jdGlvbihvKSB7XG5cdHJldHVybiBvIGluc3RhbmNlb2YgQmluZGluZztcbn1cblxudXRpbC5leHRlbmQoQmluZGluZy5wcm90b3R5cGUsIEV2ZW50cywge1xuXHR1c2U6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0dmFyIGFyZ3MgPSB1dGlsLnRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKTtcblx0XHRmbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblx0XG5cdGluc2VydEJlZm9yZTogZnVuY3Rpb24oY2hpbGQsIGJlZm9yZSkge1xuXHRcdC8vIHNwZWNpYWwgY2FzZSBmb3Igc3RyaW5nc1xuXHRcdGlmICh0eXBlb2YgY2hpbGQgPT09IFwic3RyaW5nXCIpIGNoaWxkID0gbmV3IEJpbmRpbmcuVGV4dChjaGlsZCk7XG5cblx0XHRpZiAoIUJpbmRpbmcuaXNCaW5kaW5nKGNoaWxkKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBjaGlsZCB0byBiZSBhIGJpbmRpbmcuXCIpO1xuXG5cdFx0aWYgKGNoaWxkID09PSB0aGlzKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGFkZCBiaW5kaW5nIGFzIGEgY2hpbGQgb2YgaXRzZWxmLlwiKTtcblxuXHRcdC8vIGRlZmF1bHQgaW5kZXggaXMgdGhlIGVuZFxuXHRcdHZhciBpbmRleCA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoLFxuXHRcdFx0b3BhcmVudCA9IGNoaWxkLnBhcmVudCxcblx0XHRcdGNpbmRleCwgbW92ZWQgPSBmYWxzZTtcblxuXHRcdC8vIG9idGFpbiB0aGUgaW5kZXggdG8gaW5zZXJ0IGF0XG5cdFx0aWYgKGJlZm9yZSAhPSBudWxsKSB7XG5cdFx0XHRpZiAoIUJpbmRpbmcuaXNCaW5kaW5nKGJlZm9yZSkpXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBiZWZvcmUgY2hpbGQgdG8gYmUgYSBiaW5kaW5nLlwiKTtcblxuXHRcdFx0aW5kZXggPSB0aGlzLmluZGV4T2YoYmVmb3JlKTtcblx0XHRcdGlmICghfmluZGV4KSB0aHJvdyBuZXcgRXJyb3IoXCJCZWZvcmUgYmluZGluZyBpcyBub3QgYSBjaGlsZCBvZiB0aGlzIGJpbmRpbmcuXCIpO1xuXHRcdFx0aWYgKGJlZm9yZSA9PT0gY2hpbGQpIHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBhZGQgY2hpbGQgYmVmb3JlIGl0c2VsZi5cIik7XG5cblx0XHRcdC8vIGlmIG5vZGUgaXMgYWxyZWFkeSBhdCB0aGlzIGxvY2F0aW9uLCBubyBuZWVkIHRvIGNvbnRpbnVlXG5cdFx0XHRpZiAoYmVmb3JlLnByZXZpb3VzU2libGluZyA9PT0gY2hpbGQpIHJldHVybiBjaGlsZDtcblx0XHR9XG5cblx0XHQvLyBkbyBzcGVjaWFsIHRoaW5ncyBpZiBjaGlsZCBpcyBhbHJlYWR5IGEgY2hpbGQgb2YgdGhpcyBwYXJlbnRcblx0XHRpZiAob3BhcmVudCA9PT0gdGhpcykge1xuXHRcdFx0Y2luZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkKTtcblxuXHRcdFx0Ly8gaWYgdGhlIGNoaWxkIGlzIGFscmVhZHkgdGhlIG5vZGUgYmVmb3JlIHRoZSBpbmRleCwgbm8gbmVlZCB0byBjb250aW51ZVxuXHRcdFx0aWYgKGNpbmRleCA9PT0gaW5kZXggLSAxKSByZXR1cm4gY2hpbGQ7XG5cblx0XHRcdC8vIHJlbW92ZSB0aGUgY2hpbGRcblx0XHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGNpbmRleCwgMSk7XG5cblx0XHRcdC8vIHVwZGF0ZSB0aGUgaW5kZXggc2luY2UgaXQgbWF5IGhhdmUgY2hhbmdlZFxuXHRcdFx0aW5kZXggPSBiZWZvcmUgIT0gbnVsbCA/IHRoaXMuaW5kZXhPZihiZWZvcmUpIDogdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Ly8gb3Igc2ltdWxhdGUgcmVtb3ZlIGZyb20gZXhpc3RpbmcgcGFyZW50XG5cdFx0ZWxzZSBpZiAob3BhcmVudCAhPSBudWxsKSB7XG5cdFx0XHRvcGFyZW50LmNoaWxkcmVuLnNwbGljZShvcGFyZW50LmluZGV4T2YoY2hpbGQpLCAxKTtcblx0XHRcdGNoaWxkLnBhcmVudCA9IG51bGw7XG5cdFx0XHRvcGFyZW50LnRyaWdnZXIoXCJjaGlsZDpyZW1vdmVcIiwgY2hpbGQpO1xuXHRcdH1cblxuXHRcdC8vIGFkZCB0aGUgY2hpbGRcblx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZShpbmRleCwgMCwgY2hpbGQpO1xuXHRcdGNoaWxkLnBhcmVudCA9IHRoaXM7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50c1xuXHRcdGlmIChvcGFyZW50ID09PSB0aGlzKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJjaGlsZDptb3ZlXCIsIGNoaWxkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiY2hpbGQ6YWRkXCIsIGNoaWxkKTtcblx0XHRcdGNoaWxkLnRyaWdnZXIoXCJwYXJlbnRcIiwgdGhpcywgb3BhcmVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIG5vZGVzIGxhc3Rcblx0XHRjaGlsZC51cGRhdGVOb2RlcygpO1xuXG5cdFx0cmV0dXJuIGNoaWxkO1xuXHR9LFxuXG5cdGFwcGVuZENoaWxkOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHJldHVybiB0aGlzLmluc2VydEJlZm9yZShjaGlsZCk7XG5cdH0sXG5cblx0cmVtb3ZlQ2hpbGQ6IGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0dmFyIGluZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkKTtcblx0XHRpZiAoIX5pbmRleCkgcmV0dXJuO1xuXG5cdFx0Ly8gcmVtb3ZlIGNoaWxkXG5cdFx0d2hpbGUgKGluZGV4ID4gLTEpIHtcblx0XHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdGluZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkLCBpbmRleCk7XG5cdFx0fVxuXG5cdFx0Y2hpbGQucGFyZW50ID0gbnVsbDtcblxuXHRcdC8vIHRyaWdnZXIgZXZlbnRzXG5cdFx0dGhpcy50cmlnZ2VyKFwiY2hpbGQ6cmVtb3ZlXCIsIGNoaWxkKTtcblx0XHRjaGlsZC50cmlnZ2VyKFwicGFyZW50XCIsIG51bGwsIHRoaXMpO1xuXG5cdFx0Ly8gdXBkYXRlIG5vZGVzIGxhc3Rcblx0XHRjaGlsZC51cGRhdGVOb2RlcygpO1xuXG5cdFx0cmV0dXJuIGNoaWxkO1xuXHR9LFxuXG5cdGNvbnRhaW5zOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHJldHVybiB0aGlzLmluZGV4T2YoY2hpbGQpID4gLTE7XG5cdH0sXG5cblx0aW5kZXhPZjogZnVuY3Rpb24oY2hpbGQpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGNoaWxkKTtcblx0fSxcblxuXHRmaXJzdENoaWxkOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlblswXSB8fCBudWxsO1xuXHR9LFxuXG5cdGxhc3RDaGlsZDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGxlbiA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdHJldHVybiBsZW4gPyB0aGlzLmNoaWxkcmVuW2xlbiAtIDFdIDogbnVsbDtcblx0fSxcblxuXHRuZXh0U2libGluZzogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNSb290KSByZXR1cm4gbnVsbDtcblxuXHRcdHZhciBpbmRleCA9IHRoaXMucGFyZW50LmluZGV4T2YodGhpcyksXG5cdFx0XHRjaGlsZHJlbiA9IHRoaXMucGFyZW50LmNoaWxkcmVuO1xuXG5cdFx0cmV0dXJuIGluZGV4ID4gLTEgJiYgaW5kZXggPCBjaGlsZHJlbi5sZW5ndGggLSAxID8gY2hpbGRyZW5baW5kZXggKyAxXSA6IG51bGw7XG5cdH0sXG5cblx0cHJldmlvdXNTaWJsaW5nOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHJldHVybiBudWxsO1xuXG5cdFx0dmFyIGluZGV4ID0gdGhpcy5wYXJlbnQuaW5kZXhPZih0aGlzKSxcblx0XHRcdGNoaWxkcmVuID0gdGhpcy5wYXJlbnQuY2hpbGRyZW47XG5cblx0XHRyZXR1cm4gaW5kZXggPiAwICYmIGluZGV4IDwgY2hpbGRyZW4ubGVuZ3RoID8gY2hpbGRyZW5baW5kZXggLSAxXSA6IG51bGw7XG5cdH0sXG5cblx0aGFzQ2hpbGRyZW46IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDA7XG5cdH0sXG5cblx0aXNSb290OiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJlbnQgPT0gbnVsbDtcblx0fSxcblxuXHR1cGRhdGVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0Ly8gd2UgbXVzdCB1cGRhdGUgaW4gcmV2ZXJzZSB0byBlbnN1cmUgdGhhdCBiZWZvcmUgbm9kZXNcblx0XHQvLyBhcmUgYWxyZWFkeSBpbiB0aGUgRE9NIHdoZW4gY2hpbGRyZW4gYXJlIHBsYWNlZFxuXHRcdGZvciAodmFyIGkgPSB0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHR0aGlzLmNoaWxkcmVuW2ldLnVwZGF0ZU5vZGVzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gZXZlbnQgaXMgZmlyZWQgYWZ0ZXIsIG1lYW5pbmcgY2hpbGRyZW4gd2lsbCBmaXJlIHRoZWlyIGV2ZW50cyBmaXJzdFxuXHRcdHRoaXMudHJpZ2dlcihcInVwZGF0ZVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHR0b05vZGVzOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5yZWR1Y2UoZnVuY3Rpb24obm9kZXMsIGNoaWxkKSB7XG5cdFx0XHRub2Rlcy5wdXNoLmFwcGx5KG5vZGVzLCBjaGlsZC50b05vZGVzKCkpO1xuXHRcdFx0cmV0dXJuIG5vZGVzO1xuXHRcdH0sIFtdKTtcblx0fSxcblxuXHRwYXJlbnROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHtcblx0XHRcdHJldHVybiB0aGlzLnBsYWNlaG9sZGVyICE9IG51bGwgP1xuXHRcdFx0XHR0aGlzLnBsYWNlaG9sZGVyLnBhcmVudE5vZGUgOlxuXHRcdFx0XHRudWxsO1xuXHRcdH1cblxuXHRcdHZhciBwYXJlbnQgPSB0aGlzLnBhcmVudDtcblxuXHRcdHdoaWxlIChwYXJlbnQgIT0gbnVsbCkge1xuXHRcdFx0aWYgKHBhcmVudCBpbnN0YW5jZW9mIEJpbmRpbmcuTm9kZSkgcmV0dXJuIHBhcmVudC5ub2RlO1xuXHRcdFx0aWYgKHBhcmVudC5pc1Jvb3QpIHJldHVybiBwYXJlbnQucGFyZW50Tm9kZTtcblx0XHRcdHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZmlyc3RDaGlsZCA9IHRoaXMuZmlyc3RDaGlsZDtcblx0XHRyZXR1cm4gZmlyc3RDaGlsZCAhPSBudWxsID8gZmlyc3RDaGlsZC5maXJzdE5vZGUgOiBudWxsO1xuXHR9LFxuXG5cdG5leHRTaWJsaW5nTm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNSb290KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wbGFjZWhvbGRlciAhPSBudWxsID9cblx0XHRcdFx0dGhpcy5wbGFjZWhvbGRlciA6XG5cdFx0XHRcdG51bGw7XG5cdFx0fVxuXG5cdFx0dmFyIG5leHRTaWJsaW5nID0gdGhpcy5uZXh0U2libGluZztcblx0XHRyZXR1cm4gbmV4dFNpYmxpbmcgIT0gbnVsbCA/IG5leHRTaWJsaW5nLmZpcnN0Tm9kZSA6XG5cdFx0XHR0aGlzLnBhcmVudCBpbnN0YW5jZW9mIEJpbmRpbmcuTm9kZSA/IG51bGwgOlxuXHRcdFx0dGhpcy5wYXJlbnQubmV4dFNpYmxpbmdOb2RlO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGVsLCBpO1xuXG5cdFx0Zm9yIChpIGluIHRoaXMuY2hpbGRyZW4pIHtcblx0XHRcdGVsID0gdGhpcy5jaGlsZHJlbltpXS5maW5kKHNlbGVjdG9yKTtcblx0XHRcdGlmIChlbCAhPSBudWxsKSByZXR1cm4gZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5yZWR1Y2UoZnVuY3Rpb24obm9kZXMsIGNoaWxkKSB7XG5cdFx0XHRub2Rlcy5wdXNoLmFwcGx5KG5vZGVzLCBjaGlsZC5maW5kQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHRyZXR1cm4gbm9kZXM7XG5cdFx0fSwgW10pO1xuXHR9LFxuXG5cdHBhaW50OiBmdW5jdGlvbihwYXJlbnQsIGJlZm9yZU5vZGUpIHtcblx0XHRpZiAodHlwZW9mIHBhcmVudCA9PT0gXCJzdHJpbmdcIikgcGFyZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihwYXJlbnQpO1xuXHRcdGlmICh0eXBlb2YgYmVmb3JlTm9kZSA9PT0gXCJzdHJpbmdcIikgYmVmb3JlTm9kZSA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKGJlZm9yZU5vZGUpO1xuXHRcdGlmIChwYXJlbnQgPT0gbnVsbCkgcGFyZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdGlmICh0aGlzLnBsYWNlaG9sZGVyID09IG51bGwpIHRoaXMucGxhY2Vob2xkZXIgPSBkb2N1bWVudC5jcmVhdGVDb21tZW50KHV0aWwudW5pcXVlSWQoXCIkXCIpKTtcblxuXHRcdHBhcmVudC5pbnNlcnRCZWZvcmUodGhpcy5wbGFjZWhvbGRlciwgYmVmb3JlTm9kZSk7XG5cdFx0dGhpcy51cGRhdGVOb2RlcygpO1xuXHRcdHRoaXMudHJpZ2dlcihcInBhaW50XCIsIHBhcmVudCwgYmVmb3JlTm9kZSk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRkZXRhY2g6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLnBsYWNlaG9sZGVyICE9IG51bGwgJiYgdGhpcy5wbGFjZWhvbGRlci5wYXJlbnROb2RlKSB7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5wbGFjZWhvbGRlcik7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVOb2RlcygpO1xuXHRcdHRoaXMudHJpZ2dlcihcImRldGFjaFwiKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGF1dG9ydW46IGZ1bmN0aW9uKGZuLCBvbmx5T25BY3RpdmUpIHtcblx0XHR2YXIgY29tcCA9IERlcHMuYXV0b3J1bihmbiwgdGhpcyk7XG5cdFx0aWYgKG9ubHlPbkFjdGl2ZSAmJiAhRGVwcy5hY3RpdmUpIGNvbXAuc3RvcCgpO1xuXHRcdHJldHVybiBjb21wO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5tYXAoZnVuY3Rpb24oY2hpbGQpIHtcblx0XHRcdHJldHVybiBjaGlsZC50b1N0cmluZygpO1xuXHRcdH0pLmpvaW4oXCJcIik7XG5cdH1cbn0pO1xuXG4vLyBhbGlhc2VzXG5CaW5kaW5nLnByb3RvdHlwZS5oYXNDaGlsZCA9IEJpbmRpbmcucHJvdG90eXBlLmNvbnRhaW5zO1xuQmluZGluZy5wcm90b3R5cGUudG9IVE1MID0gQmluZGluZy5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8vIExvYWQgdGhlIGJpbmRpbmdzXG51dGlsLmV4dGVuZChCaW5kaW5nLCByZXF1aXJlKFwiLi9ub2RlXCIpKTtcbkJpbmRpbmcuSFRNTCA9IHJlcXVpcmUoXCIuL2h0bWxcIik7XG5CaW5kaW5nLlJlYWN0ID0gcmVxdWlyZShcIi4vcmVhY3RcIik7XG4iLCIvLyBDb3B5IG9mIGh0dHBzOi8vZ2l0aHViLmNvbS9tZXRlb3IvbWV0ZW9yL2NvbW1pdHMvZTc4ODYxYjdkMGRiYjYwZTVlMmJmNTliYWIyY2IwNmNlNjU5NmMwNC9wYWNrYWdlcy9kZXBzL2RlcHMuanNcbi8vIChjKSAyMDExLTIwMTQgTWV0ZW9yIERldmVsb3BtZW50IEdyb3VwXG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBQYWNrYWdlIGRvY3MgYXQgaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwcyAvL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxudmFyIERlcHMgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2FjdGl2ZVxuRGVwcy5hY3RpdmUgPSBmYWxzZTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19jdXJyZW50Y29tcHV0YXRpb25cbkRlcHMuY3VycmVudENvbXB1dGF0aW9uID0gbnVsbDtcblxudmFyIHNldEN1cnJlbnRDb21wdXRhdGlvbiA9IGZ1bmN0aW9uIChjKSB7XG4gIERlcHMuY3VycmVudENvbXB1dGF0aW9uID0gYztcbiAgRGVwcy5hY3RpdmUgPSAhISBjO1xufTtcblxudmFyIF9kZWJ1Z0Z1bmMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGxhenkgZXZhbHVhdGlvbiBiZWNhdXNlIGBNZXRlb3JgIGRvZXMgbm90IGV4aXN0IHJpZ2h0IGF3YXlcbiAgcmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG4gICAgICAgICAgKCh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5sb2cgP1xuICAgICAgICAgICBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuICAgICAgICAgICBmdW5jdGlvbiAoKSB7fSkpO1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcbiAgaWYgKHRocm93Rmlyc3RFcnJvcikge1xuICAgIHRocm93IGU7XG4gIH0gZWxzZSB7XG4gICAgX2RlYnVnRnVuYygpKFwiRXhjZXB0aW9uIGZyb20gRGVwcyBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIixcbiAgICAgICAgICAgICAgICAgZS5zdGFjayB8fCBlLm1lc3NhZ2UpO1xuICB9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcbiAgaWYgKCh0eXBlb2YgTWV0ZW9yID09PSAndW5kZWZpbmVkJykgfHwgTWV0ZW9yLmlzQ2xpZW50KSB7XG4gICAgcmV0dXJuIGY7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgICBmLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfVxufTtcblxudmFyIG5leHRJZCA9IDE7XG4vLyBjb21wdXRhdGlvbnMgd2hvc2UgY2FsbGJhY2tzIHdlIHNob3VsZCBjYWxsIGF0IGZsdXNoIHRpbWVcbnZhciBwZW5kaW5nQ29tcHV0YXRpb25zID0gW107XG4vLyBgdHJ1ZWAgaWYgYSBEZXBzLmZsdXNoIGlzIHNjaGVkdWxlZCwgb3IgaWYgd2UgYXJlIGluIERlcHMuZmx1c2ggbm93XG52YXIgd2lsbEZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGluIERlcHMuZmx1c2ggbm93XG52YXIgaW5GbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lXG4vLyBvciByZWNvbXB1dGUuICBUaGlzIG1hdGNoZXMgRGVwcy5hY3RpdmUgdW5sZXNzIHdlIGFyZSBpbnNpZGVcbi8vIERlcHMubm9ucmVhY3RpdmUsIHdoaWNoIG51bGxmaWVzIGN1cnJlbnRDb21wdXRhdGlvbiBldmVuIHRob3VnaFxuLy8gYW4gZW5jbG9zaW5nIGNvbXB1dGF0aW9uIG1heSBzdGlsbCBiZSBydW5uaW5nLlxudmFyIGluQ29tcHV0ZSA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHRoZSBgX3Rocm93Rmlyc3RFcnJvcmAgb3B0aW9uIHdhcyBwYXNzZWQgaW4gdG8gdGhlIGNhbGxcbi8vIHRvIERlcHMuZmx1c2ggdGhhdCB3ZSBhcmUgaW4uIFdoZW4gc2V0LCB0aHJvdyByYXRoZXIgdGhhbiBsb2cgdGhlXG4vLyBmaXJzdCBlcnJvciBlbmNvdW50ZXJlZCB3aGlsZSBmbHVzaGluZy4gQmVmb3JlIHRocm93aW5nIHRoZSBlcnJvcixcbi8vIGZpbmlzaCBmbHVzaGluZyAoZnJvbSBhIGZpbmFsbHkgYmxvY2spLCBsb2dnaW5nIGFueSBzdWJzZXF1ZW50XG4vLyBlcnJvcnMuXG52YXIgdGhyb3dGaXJzdEVycm9yID0gZmFsc2U7XG5cbnZhciBhZnRlckZsdXNoQ2FsbGJhY2tzID0gW107XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghIHdpbGxGbHVzaCkge1xuICAgIHNldFRpbWVvdXQoRGVwcy5mbHVzaCwgMCk7XG4gICAgd2lsbEZsdXNoID0gdHJ1ZTtcbiAgfVxufTtcblxuLy8gRGVwcy5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyB2aXNpYmxlIGJ1dCBwcml2YXRlXG4vLyAodGhyb3dzIGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gY2FsbCBpdClcbnZhciBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19jb21wdXRhdGlvblxuLy9cbkRlcHMuQ29tcHV0YXRpb24gPSBmdW5jdGlvbiAoZiwgcGFyZW50LCBjdHgpIHtcbiAgaWYgKCEgY29uc3RydWN0aW5nQ29tcHV0YXRpb24pXG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJEZXBzLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBEZXBzLmF1dG9ydW5cIik7XG4gIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX3N0b3BwZWRcbiAgc2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcbiAgc2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG4gIHNlbGYuZmlyc3RSdW4gPSB0cnVlO1xuXG4gIHNlbGYuX2lkID0gbmV4dElkKys7XG4gIHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICAvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG4gIC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuICBzZWxmLl9wYXJlbnQgPSBwYXJlbnQ7XG4gIHNlbGYuX2Z1bmMgPSBmO1xuICBzZWxmLl9jb250ZXh0ID0gY3R4IHx8IHRoaXM7XG4gIHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cbiAgdmFyIGVycm9yZWQgPSB0cnVlO1xuICB0cnkge1xuICAgIHNlbGYuX2NvbXB1dGUoKTtcbiAgICBlcnJvcmVkID0gZmFsc2U7XG4gIH0gZmluYWxseSB7XG4gICAgc2VsZi5maXJzdFJ1biA9IGZhbHNlO1xuICAgIGlmIChlcnJvcmVkKVxuICAgICAgc2VsZi5zdG9wKCk7XG4gIH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZVxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgaWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBFcnJvcihcIm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGZ1bmN0aW9uXCIpO1xuXG4gIGlmIChzZWxmLmludmFsaWRhdGVkKSB7XG4gICAgRGVwcy5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG4gICAgICB3aXRoTm9ZaWVsZHNBbGxvd2VkKGYpLmNhbGwoY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIGYuX2NvbnRleHQgPSBjdHg7XG4gICAgc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzLnB1c2goZik7XG4gIH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcbkRlcHMuQ29tcHV0YXRpb24ucHJvdG90eXBlLmludmFsaWRhdGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgaWYgKCEgc2VsZi5pbnZhbGlkYXRlZCkge1xuICAgIC8vIGlmIHdlJ3JlIGN1cnJlbnRseSBpbiBfcmVjb21wdXRlKCksIGRvbid0IGVucXVldWVcbiAgICAvLyBvdXJzZWx2ZXMsIHNpbmNlIHdlJ2xsIHJlcnVuIGltbWVkaWF0ZWx5IGFueXdheS5cbiAgICBpZiAoISBzZWxmLl9yZWNvbXB1dGluZyAmJiAhIHNlbGYuc3RvcHBlZCkge1xuICAgICAgcmVxdWlyZUZsdXNoKCk7XG4gICAgICBwZW5kaW5nQ29tcHV0YXRpb25zLnB1c2godGhpcyk7XG4gICAgfVxuXG4gICAgc2VsZi5pbnZhbGlkYXRlZCA9IHRydWU7XG5cbiAgICAvLyBjYWxsYmFja3MgY2FuJ3QgYWRkIGNhbGxiYWNrcywgYmVjYXVzZVxuICAgIC8vIHNlbGYuaW52YWxpZGF0ZWQgPT09IHRydWUuXG4gICAgZm9yKHZhciBpID0gMCwgZjsgZiA9IHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrc1tpXTsgaSsrKSB7XG4gICAgICBEZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgd2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGYuX2NvbnRleHQgfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG4gICAgICB9KTtcbiAgICB9XG4gICAgc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG4gIH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX3N0b3BcbkRlcHMuQ29tcHV0YXRpb24ucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghIHRoaXMuc3RvcHBlZCkge1xuICAgIHRoaXMuc3RvcHBlZCA9IHRydWU7XG4gICAgdGhpcy5pbnZhbGlkYXRlKCk7XG4gIH1cbn07XG5cbkRlcHMuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuICB2YXIgcHJldmlvdXMgPSBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbjtcbiAgc2V0Q3VycmVudENvbXB1dGF0aW9uKHNlbGYpO1xuICB2YXIgcHJldmlvdXNJbkNvbXB1dGUgPSBpbkNvbXB1dGU7XG4gIGluQ29tcHV0ZSA9IHRydWU7XG4gIHRyeSB7XG4gICAgd2l0aE5vWWllbGRzQWxsb3dlZChzZWxmLl9mdW5jKS5jYWxsKHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuICB9IGZpbmFsbHkge1xuICAgIHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG4gICAgaW5Db21wdXRlID0gZmFsc2U7XG4gIH1cbn07XG5cbkRlcHMuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9yZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBzZWxmLl9yZWNvbXB1dGluZyA9IHRydWU7XG4gIHRyeSB7XG4gICAgd2hpbGUgKHNlbGYuaW52YWxpZGF0ZWQgJiYgISBzZWxmLnN0b3BwZWQpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIHNlbGYuX2NvbXB1dGUoKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgX3Rocm93T3JMb2coXCJyZWNvbXB1dGVcIiwgZSk7XG4gICAgICB9XG4gICAgICAvLyBJZiBfY29tcHV0ZSgpIGludmFsaWRhdGVkIHVzLCB3ZSBydW4gYWdhaW4gaW1tZWRpYXRlbHkuXG4gICAgICAvLyBBIGNvbXB1dGF0aW9uIHRoYXQgaW52YWxpZGF0ZXMgaXRzZWxmIGluZGVmaW5pdGVseSBpcyBhblxuICAgICAgLy8gaW5maW5pdGUgbG9vcCwgb2YgY291cnNlLlxuICAgICAgLy9cbiAgICAgIC8vIFdlIGNvdWxkIHB1dCBhbiBpdGVyYXRpb24gY291bnRlciBoZXJlIGFuZCBjYXRjaCBydW4tYXdheVxuICAgICAgLy8gbG9vcHMuXG4gICAgfVxuICB9IGZpbmFsbHkge1xuICAgIHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG4gIH1cbn07XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2RlcGVuZGVuY3lcbi8vXG5EZXBzLkRlcGVuZGVuY3kgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuX2RlcGVuZGVudHNCeUlkID0ge307XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2RlcGVuZFxuLy9cbi8vIEFkZHMgYGNvbXB1dGF0aW9uYCB0byB0aGlzIHNldCBpZiBpdCBpcyBub3QgYWxyZWFkeVxuLy8gcHJlc2VudC4gIFJldHVybnMgdHJ1ZSBpZiBgY29tcHV0YXRpb25gIGlzIGEgbmV3IG1lbWJlciBvZiB0aGUgc2V0LlxuLy8gSWYgbm8gYXJndW1lbnQsIGRlZmF1bHRzIHRvIGN1cnJlbnRDb21wdXRhdGlvbiwgb3IgZG9lcyBub3RoaW5nXG4vLyBpZiB0aGVyZSBpcyBubyBjdXJyZW50Q29tcHV0YXRpb24uXG5EZXBzLkRlcGVuZGVuY3kucHJvdG90eXBlLmRlcGVuZCA9IGZ1bmN0aW9uIChjb21wdXRhdGlvbikge1xuICBpZiAoISBjb21wdXRhdGlvbikge1xuICAgIGlmICghIERlcHMuYWN0aXZlKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29tcHV0YXRpb24gPSBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbjtcbiAgfVxuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcbiAgaWYgKCEgKGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKSkge1xuICAgIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXSA9IGNvbXB1dGF0aW9uO1xuICAgIGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG4gICAgICBkZWxldGUgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdO1xuICAgIH0pO1xuICAgIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfY2hhbmdlZFxuRGVwcy5EZXBlbmRlbmN5LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGZvciAodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuICAgIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2hhc2RlcGVuZGVudHNcbkRlcHMuRGVwZW5kZW5jeS5wcm90b3R5cGUuaGFzRGVwZW5kZW50cyA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBmb3IodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuICAgIHJldHVybiB0cnVlO1xuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2ZsdXNoXG5EZXBzLmZsdXNoID0gZnVuY3Rpb24gKF9vcHRzKSB7XG4gIC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuICAvLyBoYXZlIFNwYXJrKVxuICAvL1xuICAvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuICAvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG4gIC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgRGVwcy5mbHVzaC4gIEF0IHRoZSBtb21lbnRcbiAgLy8gU3BhcmsgYmxvY2tzIGV2ZW50IGhhbmRsZXJzIGR1cmluZyBET00gbXV0YXRpb24gYW55d2F5LFxuICAvLyBiZWNhdXNlIHRoZSBMaXZlUmFuZ2UgdHJlZSBpc24ndCB2YWxpZC4gIEFuZCB3ZSBkb24ndCBoYXZlXG4gIC8vIGFueSB1c2VmdWwgbm90aW9uIG9mIGEgbmVzdGVkIGZsdXNoLlxuICAvL1xuICAvLyBodHRwczovL2FwcC5hc2FuYS5jb20vMC8xNTk5MDgzMzAyNDQvMzg1MTM4MjMzODU2XG4gIGlmIChpbkZsdXNoKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNhbGwgRGVwcy5mbHVzaCB3aGlsZSBmbHVzaGluZ1wiKTtcblxuICBpZiAoaW5Db21wdXRlKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGZsdXNoIGluc2lkZSBEZXBzLmF1dG9ydW5cIik7XG5cbiAgaW5GbHVzaCA9IHRydWU7XG4gIHdpbGxGbHVzaCA9IHRydWU7XG4gIHRocm93Rmlyc3RFcnJvciA9ICEhIChfb3B0cyAmJiBfb3B0cy5fdGhyb3dGaXJzdEVycm9yKTtcblxuICB2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcbiAgdHJ5IHtcbiAgICB3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcbiAgICAgICAgICAgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuICAgICAgLy8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuICAgICAgd2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgIHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuICAgICAgICBjb21wLl9yZWNvbXB1dGUoKTtcbiAgICAgIH1cblxuICAgICAgaWYgKGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG4gICAgICAgIC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuICAgICAgICAvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG4gICAgICAgIHZhciBmdW5jID0gYWZ0ZXJGbHVzaENhbGxiYWNrcy5zaGlmdCgpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgIGZ1bmMuY2FsbChmdW5jLl9jb250ZXh0KTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIF90aHJvd09yTG9nKFwiYWZ0ZXJGbHVzaCBmdW5jdGlvblwiLCBlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICBmaW5pc2hlZFRyeSA9IHRydWU7XG4gIH0gZmluYWxseSB7XG4gICAgaWYgKCEgZmluaXNoZWRUcnkpIHtcbiAgICAgIC8vIHdlJ3JlIGVycm9yaW5nXG4gICAgICBpbkZsdXNoID0gZmFsc2U7IC8vIG5lZWRlZCBiZWZvcmUgY2FsbGluZyBgRGVwcy5mbHVzaCgpYCBhZ2FpblxuICAgICAgRGVwcy5mbHVzaCh7X3Rocm93Rmlyc3RFcnJvcjogZmFsc2V9KTsgLy8gZmluaXNoIGZsdXNoaW5nXG4gICAgfVxuICAgIHdpbGxGbHVzaCA9IGZhbHNlO1xuICAgIGluRmx1c2ggPSBmYWxzZTtcbiAgfVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19hdXRvcnVuXG4vL1xuLy8gUnVuIGYoKS4gUmVjb3JkIGl0cyBkZXBlbmRlbmNpZXMuIFJlcnVuIGl0IHdoZW5ldmVyIHRoZVxuLy8gZGVwZW5kZW5jaWVzIGNoYW5nZS5cbi8vXG4vLyBSZXR1cm5zIGEgbmV3IENvbXB1dGF0aW9uLCB3aGljaCBpcyBhbHNvIHBhc3NlZCB0byBmLlxuLy9cbi8vIExpbmtzIHRoZSBjb21wdXRhdGlvbiB0byB0aGUgY3VycmVudCBjb21wdXRhdGlvblxuLy8gc28gdGhhdCBpdCBpcyBzdG9wcGVkIGlmIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIGlzIGludmFsaWRhdGVkLlxuRGVwcy5hdXRvcnVuID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICBpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdEZXBzLmF1dG9ydW4gcmVxdWlyZXMgYSBmdW5jdGlvbiBhcmd1bWVudCcpO1xuXG4gIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gdHJ1ZTtcbiAgdmFyIGMgPSBuZXcgRGVwcy5Db21wdXRhdGlvbihmLCBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbiwgY3R4KTtcblxuICBpZiAoRGVwcy5hY3RpdmUpXG4gICAgRGVwcy5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgYy5zdG9wKCk7XG4gICAgfSk7XG5cbiAgcmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuICBVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuRGVwcy5ub25yZWFjdGl2ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcbiAgdmFyIHByZXZpb3VzID0gRGVwcy5jdXJyZW50Q29tcHV0YXRpb247XG4gIHNldEN1cnJlbnRDb21wdXRhdGlvbihudWxsKTtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZi5jYWxsKGN0eCk7XG4gIH0gZmluYWxseSB7XG4gICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcbiAgfVxufTtcblxuLy8gc2ltaWxhciB0byBub25yZWFjdGl2ZSBidXQgcmV0dXJucyBhIGZ1bmN0aW9uIGluc3RlYWQgb2Zcbi8vIGV4ZWN0dWluZyBmbiBpbW1lZGlhdGVseS4gcmVhbGx5IGp1c3Qgc29tZSBzdWdhclxuRGVwcy5ub25yZWFjdGFibGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gRGVwcy5ub25yZWFjdGl2ZShmLCBjdHggfHwgdGhpcyk7XG4gIH1cbn1cblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19vbmludmFsaWRhdGVcbkRlcHMub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICBpZiAoISBEZXBzLmFjdGl2ZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJEZXBzLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuICBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZiwgY3R4KTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfYWZ0ZXJmbHVzaFxuRGVwcy5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICBmLl9jb250ZXh0ID0gY3R4O1xuICBhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goZik7XG4gIHJlcXVpcmVGbHVzaCgpO1xufTsiLCJ2YXIgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbi8vIEJhY2tib25lLkV2ZW50c1xuLy8gLS0tLS0tLS0tLS0tLS0tXG5cbi8vIEEgbW9kdWxlIHRoYXQgY2FuIGJlIG1peGVkIGluIHRvICphbnkgb2JqZWN0KiBpbiBvcmRlciB0byBwcm92aWRlIGl0IHdpdGhcbi8vIGN1c3RvbSBldmVudHMuIFlvdSBtYXkgYmluZCB3aXRoIGBvbmAgb3IgcmVtb3ZlIHdpdGggYG9mZmAgY2FsbGJhY2tcbi8vIGZ1bmN0aW9ucyB0byBhbiBldmVudDsgYHRyaWdnZXJgLWluZyBhbiBldmVudCBmaXJlcyBhbGwgY2FsbGJhY2tzIGluXG4vLyBzdWNjZXNzaW9uLlxuLy9cbi8vICAgICB2YXIgb2JqZWN0ID0ge307XG4vLyAgICAgdXRpbC5leHRlbmQob2JqZWN0LCBCYWNrYm9uZS5FdmVudHMpO1xuLy8gICAgIG9iamVjdC5vbignZXhwYW5kJywgZnVuY3Rpb24oKXsgYWxlcnQoJ2V4cGFuZGVkJyk7IH0pO1xuLy8gICAgIG9iamVjdC50cmlnZ2VyKCdleHBhbmQnKTtcbi8vXG52YXIgRXZlbnRzID0gbW9kdWxlLmV4cG9ydHMgPSB7XG5cblx0Ly8gQmluZCBhbiBldmVudCB0byBhIGBjYWxsYmFja2AgZnVuY3Rpb24uIFBhc3NpbmcgYFwiYWxsXCJgIHdpbGwgYmluZFxuXHQvLyB0aGUgY2FsbGJhY2sgdG8gYWxsIGV2ZW50cyBmaXJlZC5cblx0b246IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ29uJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcblx0XHR0aGlzLl9ldmVudHMgfHwgKHRoaXMuX2V2ZW50cyA9IHt9KTtcblx0XHR2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdIHx8ICh0aGlzLl9ldmVudHNbbmFtZV0gPSBbXSk7XG5cdFx0ZXZlbnRzLnB1c2goe2NhbGxiYWNrOiBjYWxsYmFjaywgY29udGV4dDogY29udGV4dCwgY3R4OiBjb250ZXh0IHx8IHRoaXN9KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBCaW5kIGFuIGV2ZW50IHRvIG9ubHkgYmUgdHJpZ2dlcmVkIGEgc2luZ2xlIHRpbWUuIEFmdGVyIHRoZSBmaXJzdCB0aW1lXG5cdC8vIHRoZSBjYWxsYmFjayBpcyBpbnZva2VkLCBpdCB3aWxsIGJlIHJlbW92ZWQuXG5cdG9uY2U6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ29uY2UnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSB8fCAhY2FsbGJhY2spIHJldHVybiB0aGlzO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHR2YXIgZm4gPSBvbmNlKGZ1bmN0aW9uKCkge1xuXHRcdFx0c2VsZi5vZmYobmFtZSwgZm4pO1xuXHRcdFx0Y2FsbGJhY2suYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHR9KTtcblx0XHRmbi5fY2FsbGJhY2sgPSBjYWxsYmFjaztcblx0XHRyZXR1cm4gdGhpcy5vbihuYW1lLCBmbiwgY29udGV4dCk7XG5cdH0sXG5cblx0Ly8gUmVtb3ZlIG9uZSBvciBtYW55IGNhbGxiYWNrcy4gSWYgYGNvbnRleHRgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG5cdC8vIGNhbGxiYWNrcyB3aXRoIHRoYXQgZnVuY3Rpb24uIElmIGBjYWxsYmFja2AgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcblx0Ly8gY2FsbGJhY2tzIGZvciB0aGUgZXZlbnQuIElmIGBuYW1lYCBpcyBudWxsLCByZW1vdmVzIGFsbCBib3VuZFxuXHQvLyBjYWxsYmFja3MgZm9yIGFsbCBldmVudHMuXG5cdG9mZjogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblx0XHR2YXIgcmV0YWluLCBldiwgZXZlbnRzLCBuYW1lcywgaSwgbCwgaiwgaztcblx0XHRpZiAoIXRoaXMuX2V2ZW50cyB8fCAhZXZlbnRzQXBpKHRoaXMsICdvZmYnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSkgcmV0dXJuIHRoaXM7XG5cdFx0aWYgKCFuYW1lICYmICFjYWxsYmFjayAmJiAhY29udGV4dCkge1xuXHRcdFx0dGhpcy5fZXZlbnRzID0gdm9pZCAwO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdG5hbWVzID0gbmFtZSA/IFtuYW1lXSA6IE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XG5cdFx0Zm9yIChpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0bmFtZSA9IG5hbWVzW2ldO1xuXHRcdFx0aWYgKGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSkge1xuXHRcdFx0XHR0aGlzLl9ldmVudHNbbmFtZV0gPSByZXRhaW4gPSBbXTtcblx0XHRcdFx0aWYgKGNhbGxiYWNrIHx8IGNvbnRleHQpIHtcblx0XHRcdFx0XHRmb3IgKGogPSAwLCBrID0gZXZlbnRzLmxlbmd0aDsgaiA8IGs7IGorKykge1xuXHRcdFx0XHRcdFx0ZXYgPSBldmVudHNbal07XG5cdFx0XHRcdFx0XHRpZiAoKGNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2suX2NhbGxiYWNrKSB8fFxuXHRcdFx0XHRcdFx0XHRcdChjb250ZXh0ICYmIGNvbnRleHQgIT09IGV2LmNvbnRleHQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldGFpbi5wdXNoKGV2KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFyZXRhaW4ubGVuZ3RoKSBkZWxldGUgdGhpcy5fZXZlbnRzW25hbWVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIFRyaWdnZXIgb25lIG9yIG1hbnkgZXZlbnRzLCBmaXJpbmcgYWxsIGJvdW5kIGNhbGxiYWNrcy4gQ2FsbGJhY2tzIGFyZVxuXHQvLyBwYXNzZWQgdGhlIHNhbWUgYXJndW1lbnRzIGFzIGB0cmlnZ2VyYCBpcywgYXBhcnQgZnJvbSB0aGUgZXZlbnQgbmFtZVxuXHQvLyAodW5sZXNzIHlvdSdyZSBsaXN0ZW5pbmcgb24gYFwiYWxsXCJgLCB3aGljaCB3aWxsIGNhdXNlIHlvdXIgY2FsbGJhY2sgdG9cblx0Ly8gcmVjZWl2ZSB0aGUgdHJ1ZSBuYW1lIG9mIHRoZSBldmVudCBhcyB0aGUgZmlyc3QgYXJndW1lbnQpLlxuXHR0cmlnZ2VyOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0aWYgKCF0aGlzLl9ldmVudHMpIHJldHVybiB0aGlzO1xuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblx0XHRpZiAoIWV2ZW50c0FwaSh0aGlzLCAndHJpZ2dlcicsIG5hbWUsIGFyZ3MpKSByZXR1cm4gdGhpcztcblx0XHR2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdO1xuXHRcdHZhciBhbGxFdmVudHMgPSB0aGlzLl9ldmVudHMuYWxsO1xuXHRcdGlmIChldmVudHMpIHRyaWdnZXJFdmVudHMoZXZlbnRzLCBhcmdzKTtcblx0XHRpZiAoYWxsRXZlbnRzKSB0cmlnZ2VyRXZlbnRzKGFsbEV2ZW50cywgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBUZWxsIHRoaXMgb2JqZWN0IHRvIHN0b3AgbGlzdGVuaW5nIHRvIGVpdGhlciBzcGVjaWZpYyBldmVudHMgLi4uIG9yXG5cdC8vIHRvIGV2ZXJ5IG9iamVjdCBpdCdzIGN1cnJlbnRseSBsaXN0ZW5pbmcgdG8uXG5cdHN0b3BMaXN0ZW5pbmc6IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcblx0XHR2YXIgbGlzdGVuaW5nVG8gPSB0aGlzLl9saXN0ZW5pbmdUbztcblx0XHRpZiAoIWxpc3RlbmluZ1RvKSByZXR1cm4gdGhpcztcblx0XHR2YXIgcmVtb3ZlID0gIW5hbWUgJiYgIWNhbGxiYWNrO1xuXHRcdGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG5cdFx0aWYgKG9iaikgKGxpc3RlbmluZ1RvID0ge30pW29iai5fbGlzdGVuSWRdID0gb2JqO1xuXHRcdGZvciAodmFyIGlkIGluIGxpc3RlbmluZ1RvKSB7XG5cdFx0XHRvYmogPSBsaXN0ZW5pbmdUb1tpZF07XG5cdFx0XHRvYmoub2ZmKG5hbWUsIGNhbGxiYWNrLCB0aGlzKTtcblx0XHRcdGlmIChyZW1vdmUgfHwgaXNFbXB0eShvYmouX2V2ZW50cykpIGRlbGV0ZSB0aGlzLl9saXN0ZW5pbmdUb1tpZF07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cbn07XG5cbi8vIFJlZ3VsYXIgZXhwcmVzc2lvbiB1c2VkIHRvIHNwbGl0IGV2ZW50IHN0cmluZ3MuXG52YXIgZXZlbnRTcGxpdHRlciA9IC9cXHMrLztcblxuLy8gSW1wbGVtZW50IGZhbmN5IGZlYXR1cmVzIG9mIHRoZSBFdmVudHMgQVBJIHN1Y2ggYXMgbXVsdGlwbGUgZXZlbnRcbi8vIG5hbWVzIGBcImNoYW5nZSBibHVyXCJgIGFuZCBqUXVlcnktc3R5bGUgZXZlbnQgbWFwcyBge2NoYW5nZTogYWN0aW9ufWBcbi8vIGluIHRlcm1zIG9mIHRoZSBleGlzdGluZyBBUEkuXG52YXIgZXZlbnRzQXBpID0gZnVuY3Rpb24ob2JqLCBhY3Rpb24sIG5hbWUsIHJlc3QpIHtcblx0aWYgKCFuYW1lKSByZXR1cm4gdHJ1ZTtcblxuXHQvLyBIYW5kbGUgZXZlbnQgbWFwcy5cblx0aWYgKHR5cGVvZiBuYW1lID09PSAnb2JqZWN0Jykge1xuXHRcdGZvciAodmFyIGtleSBpbiBuYW1lKSB7XG5cdFx0XHRvYmpbYWN0aW9uXS5hcHBseShvYmosIFtrZXksIG5hbWVba2V5XV0uY29uY2F0KHJlc3QpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gSGFuZGxlIHNwYWNlIHNlcGFyYXRlZCBldmVudCBuYW1lcy5cblx0aWYgKGV2ZW50U3BsaXR0ZXIudGVzdChuYW1lKSkge1xuXHRcdHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoZXZlbnRTcGxpdHRlcik7XG5cdFx0Zm9yICh2YXIgaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdG9ialthY3Rpb25dLmFwcGx5KG9iaiwgW25hbWVzW2ldXS5jb25jYXQocmVzdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgZGlmZmljdWx0LXRvLWJlbGlldmUsIGJ1dCBvcHRpbWl6ZWQgaW50ZXJuYWwgZGlzcGF0Y2ggZnVuY3Rpb24gZm9yXG4vLyB0cmlnZ2VyaW5nIGV2ZW50cy4gVHJpZXMgdG8ga2VlcCB0aGUgdXN1YWwgY2FzZXMgc3BlZWR5IChtb3N0IGludGVybmFsXG4vLyBCYWNrYm9uZSBldmVudHMgaGF2ZSAzIGFyZ3VtZW50cykuXG52YXIgdHJpZ2dlckV2ZW50cyA9IGZ1bmN0aW9uKGV2ZW50cywgYXJncykge1xuXHR2YXIgZXYsIGkgPSAtMSwgbCA9IGV2ZW50cy5sZW5ndGgsIGExID0gYXJnc1swXSwgYTIgPSBhcmdzWzFdLCBhMyA9IGFyZ3NbMl07XG5cdHN3aXRjaCAoYXJncy5sZW5ndGgpIHtcblx0XHRjYXNlIDA6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4KTsgcmV0dXJuO1xuXHRcdGNhc2UgMTogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExKTsgcmV0dXJuO1xuXHRcdGNhc2UgMjogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMik7IHJldHVybjtcblx0XHRjYXNlIDM6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSwgYTIsIGEzKTsgcmV0dXJuO1xuXHRcdGRlZmF1bHQ6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmFwcGx5KGV2LmN0eCwgYXJncyk7IHJldHVybjtcblx0fVxufTtcblxudmFyIGxpc3Rlbk1ldGhvZHMgPSB7bGlzdGVuVG86ICdvbicsIGxpc3RlblRvT25jZTogJ29uY2UnfTtcblxuLy8gSW52ZXJzaW9uLW9mLWNvbnRyb2wgdmVyc2lvbnMgb2YgYG9uYCBhbmQgYG9uY2VgLiBUZWxsICp0aGlzKiBvYmplY3QgdG9cbi8vIGxpc3RlbiB0byBhbiBldmVudCBpbiBhbm90aGVyIG9iamVjdCAuLi4ga2VlcGluZyB0cmFjayBvZiB3aGF0IGl0J3Ncbi8vIGxpc3RlbmluZyB0by5cbnV0aWwuZWFjaChsaXN0ZW5NZXRob2RzLCBmdW5jdGlvbihpbXBsZW1lbnRhdGlvbiwgbWV0aG9kKSB7XG5cdEV2ZW50c1ttZXRob2RdID0gZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuXHRcdHZhciBsaXN0ZW5pbmdUbyA9IHRoaXMuX2xpc3RlbmluZ1RvIHx8ICh0aGlzLl9saXN0ZW5pbmdUbyA9IHt9KTtcblx0XHR2YXIgaWQgPSBvYmouX2xpc3RlbklkIHx8IChvYmouX2xpc3RlbklkID0gdXRpbC51bmlxdWVJZCgnbCcpKTtcblx0XHRsaXN0ZW5pbmdUb1tpZF0gPSBvYmo7XG5cdFx0aWYgKCFjYWxsYmFjayAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcblx0XHRvYmpbaW1wbGVtZW50YXRpb25dKG5hbWUsIGNhbGxiYWNrLCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcbn0pO1xuXG4vLyBBbGlhc2VzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbkV2ZW50cy5iaW5kICAgPSBFdmVudHMub247XG5FdmVudHMudW5iaW5kID0gRXZlbnRzLm9mZjtcblxuZnVuY3Rpb24gaXNFbXB0eShvYmopIHtcblx0aWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcblx0aWYgKEFycmF5LmlzQXJyYXkob2JqKSB8fCB0eXBlb2Ygb2JqID09PSBcInN0cmluZ1wiKSByZXR1cm4gb2JqLmxlbmd0aCA9PT0gMDtcblx0Zm9yICh2YXIga2V5IGluIG9iaikgaWYgKHV0aWwuaGFzKG9iaiwga2V5KSkgcmV0dXJuIGZhbHNlO1xuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gb25jZShmdW5jKSB7XG5cdHZhciByYW4gPSBmYWxzZSwgbWVtbztcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdGlmIChyYW4pIHJldHVybiBtZW1vO1xuXHRcdHJhbiA9IHRydWU7XG5cdFx0bWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRmdW5jID0gbnVsbDtcblx0XHRyZXR1cm4gbWVtbztcblx0fVxufSIsInZhciBCaW5kaW5nID0gcmVxdWlyZShcIi4vYmluZGluZ1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gQmluZGluZy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24odmFsdWUpIHtcblx0XHRCaW5kaW5nLmNhbGwodGhpcyk7XG5cdFx0dGhpcy5ub2RlcyA9IFtdO1xuXHRcdHRoaXMuc2V0VmFsdWUodmFsdWUpO1xuXHR9LFxuXG5cdGluc2VydEJlZm9yZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiSFRNTCBiaW5kaW5ncyBjYW4ndCBoYXZlIGNoaWxkcmVuLlwiKTtcblx0fSxcblxuXHR1cGRhdGVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHBhcmVudE5vZGUgPSB0aGlzLnBhcmVudE5vZGUsXG5cdFx0XHRiZWZvcmVOb2RlLCBub2RlLCBpO1xuXG5cdFx0Ly8gcGxhY2UgdGhlIG5vZGVzIGluIHRoZSBkb21cblx0XHRpZiAocGFyZW50Tm9kZSAhPSBudWxsKSB7XG5cdFx0XHRiZWZvcmVOb2RlID0gdGhpcy5uZXh0U2libGluZ05vZGU7XG5cblx0XHRcdGZvciAoaSA9IHRoaXMubm9kZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0bm9kZSA9IHRoaXMubm9kZXNbaV07XG5cblx0XHRcdFx0aWYgKCF1dGlsLmlzTm9kZUF0RE9NUG9zaXRpb24obm9kZSwgcGFyZW50Tm9kZSwgYmVmb3JlTm9kZSkpIHtcblx0XHRcdFx0XHRwYXJlbnROb2RlLmluc2VydEJlZm9yZShub2RlLCBiZWZvcmVOb2RlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJlZm9yZU5vZGUgPSBub2RlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIG9yIHRha2UgdGhlbSBvdXRcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMucmVtb3ZlTm9kZXMoKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyaWdnZXIoXCJ1cGRhdGVcIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBub2RlLCBpO1xuXG5cdFx0Zm9yIChpID0gMDsgaSA8IHRoaXMubm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdG5vZGUgPSB0aGlzLm5vZGVzW2ldO1xuXHRcdFx0aWYgKG5vZGUucGFyZW50Tm9kZSAhPSBudWxsKSBub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0c2V0VmFsdWU6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdHZhbCA9IHZhbCAhPSBudWxsID8gdmFsLnRvU3RyaW5nKCkgOiBcIlwiO1xuXHRcdGlmICh2YWwgPT09IHRoaXMudmFsdWUpIHJldHVybiB0aGlzO1xuXG5cdFx0dGhpcy5yZW1vdmVOb2RlcygpO1xuXHRcdHRoaXMudmFsdWUgPSB2YWw7XG5cblx0XHQvLyBjb252ZXJ0IGh0bWwgaW50byBET00gbm9kZXNcblx0XHRkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXHRcdGRpdi5pbm5lckhUTUwgPSB2YWw7XG5cdFx0dGhpcy5ub2RlcyA9IHV0aWwudG9BcnJheShkaXYuY2hpbGROb2Rlcyk7XG5cblx0XHR0aGlzLnVwZGF0ZU5vZGVzKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0dG9Ob2RlczogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZXMuc2xpY2UoMCk7XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlc1swXSB8fCBudWxsO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGssIG5vZGUsIHJlc3VsdDtcblxuXHRcdGZvciAoayBpbiB0aGlzLm5vZGVzKSB7XG5cdFx0XHRub2RlID0gdGhpcy5ub2Rlc1trXTtcblx0XHRcdGlmIChub2RlLm5vZGVUeXBlICE9PSAxKSBjb250aW51ZTtcblxuXHRcdFx0aWYgKHV0aWwubWF0Y2hlc1NlbGVjdG9yKG5vZGUsIHNlbGVjdG9yKSkgcmV0dXJuIG5vZGU7XG5cdFx0XHRyZXN1bHQgPSBub2RlLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXHRcdFx0aWYgKHJlc3VsdCAhPSBudWxsKSByZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdGZpbmRBbGw6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGssIG5vZGUsIGVscyA9IFtdO1xuXG5cdFx0Zm9yIChrIGluIHRoaXMubm9kZXMpIHtcblx0XHRcdG5vZGUgPSB0aGlzLm5vZGVzW2tdO1xuXHRcdFx0aWYgKG5vZGUubm9kZVR5cGUgIT09IDEpIGNvbnRpbnVlO1xuXG5cdFx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3Iobm9kZSwgc2VsZWN0b3IpKSBtYXRjaGVzLnB1c2gobm9kZSk7XG5cdFx0XHRlbHMucHVzaC5hcHBseShlbHMsIHV0aWwudG9BcnJheShub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVscztcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZXMubWFwKGZ1bmN0aW9uKG5vZGUpIHtcblx0XHRcdHJldHVybiBub2RlLm5vZGVUeXBlID09PSAxID8gbm9kZS5vdXRlckhUTUwgOiBub2RlLm5vZGVWYWx1ZTtcblx0XHR9KS5qb2luKFwiXCIpO1xuXHR9XG59KTtcbiIsInZhciBCaW5kaW5nID0gcmVxdWlyZShcIi4vYmluZGluZ1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbi8vIGV4cG9ydFxudmFyIFRlbXBsZSA9XG5tb2R1bGUuZXhwb3J0cyA9IEJpbmRpbmc7XG5cbi8vIHN0YXRpYyBwcm9wZXJ0aWVzL21ldGhvZHNcblRlbXBsZS5WRVJTSU9OID0gXCIwLjMuMC1hbHBoYVwiO1xuVGVtcGxlLnV0aWwgPSB1dGlsO1xuVGVtcGxlLkV2ZW50cyA9IHJlcXVpcmUoXCIuL2V2ZW50c1wiKTtcblxuLy8gZGVwcyBzZXR1cFxudmFyIERlcHMgPSBUZW1wbGUuRGVwcyA9IHJlcXVpcmUoXCIuL2RlcHNcIik7XG5UZW1wbGUuYXV0b3J1biA9IERlcHMuYXV0b3J1bjtcblRlbXBsZS5EZXBlbmRlbmN5ID0gRGVwcy5EZXBlbmRlbmN5OyIsInZhciBCaW5kaW5nID0gcmVxdWlyZShcIi4vYmluZGluZ1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbnZhciBOb2RlID1cbmV4cG9ydHMuTm9kZSA9IEJpbmRpbmcuZXh0ZW5kKHtcblx0dXBkYXRlTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBwYXJlbnROb2RlID0gdGhpcy5wYXJlbnROb2RlLFxuXHRcdFx0YmVmb3JlTm9kZSA9IHRoaXMubmV4dFNpYmxpbmdOb2RlO1xuXG5cdFx0Ly8gcGxhY2UgdGhlIG5vZGUgaW4gdGhlIGRvbVxuXHRcdGlmIChwYXJlbnROb2RlICE9IG51bGwgJiYgIXV0aWwuaXNOb2RlQXRET01Qb3NpdGlvbih0aGlzLm5vZGUsIHBhcmVudE5vZGUsIGJlZm9yZU5vZGUpKSB7XG5cdFx0XHRwYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLm5vZGUsIGJlZm9yZU5vZGUpO1xuXHRcdH1cblxuXHRcdC8vIG9yIHRha2UgaXQgb3V0XG5cdFx0ZWxzZSBpZiAocGFyZW50Tm9kZSA9PSBudWxsICYmIHRoaXMubm9kZS5wYXJlbnROb2RlICE9IG51bGwpIHtcblx0XHRcdHRoaXMubm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMubm9kZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmlnZ2VyKFwidXBkYXRlXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHRvTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiBbIHRoaXMubm9kZSBdO1xuXHR9LFxuXG5cdGZpcnN0Tm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZTtcblx0fSxcblxuXHRmaW5kOiBmdW5jdGlvbigpIHsgcmV0dXJuIG51bGw7IH0sXG5cdGZpbmRBbGw6IGZ1bmN0aW9uKCkgeyByZXR1cm4gW107IH1cbn0pO1xuXG5leHBvcnRzLlRleHQgPSBOb2RlLmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdE5vZGUuY2FsbCh0aGlzKTtcblx0XHR0aGlzLm5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblx0XHR0aGlzLnNldFZhbHVlKHZhbHVlKTtcblx0fSxcblxuXHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIlRleHQgYmluZGluZ3MgY2FuJ3QgaGF2ZSBjaGlsZHJlbi5cIik7XG5cdH0sXG5cblx0c2V0VmFsdWU6IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0dmFsdWUgPSB2YWx1ZSAhPSBudWxsID8gdmFsdWUudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0aWYgKHZhbHVlICE9PSB0aGlzLm5vZGUubm9kZVZhbHVlKSB0aGlzLm5vZGUubm9kZVZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLm5vZGVWYWx1ZTtcblx0fVxufSk7XG5cbnZhciBFbGVtZW50ID1cbmV4cG9ydHMuRWxlbWVudCA9IE5vZGUuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKHRhZ25hbWUpIHtcblx0XHRpZiAodHlwZW9mIHRhZ25hbWUgIT09IFwic3RyaW5nXCIpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIGZvciBlbGVtZW50IHRhZyBuYW1lLlwiKTtcblxuXHRcdHRoaXMudGFnbmFtZSA9IHRhZ25hbWU7XG5cdFx0dGhpcy5ub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0YWduYW1lKTtcblxuXHRcdE5vZGUuYXBwbHkodGhpcywgdXRpbC50b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSkpO1xuXHR9LFxuXG5cdGdldEF0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUuZ2V0QXR0cmlidXRlKG5hbWUpO1xuXHR9LFxuXG5cdHNldEF0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcblx0XHR0aGlzLm5vZGUuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR0aGlzLm5vZGUucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGF0dHI6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QobmFtZSkgJiYgdmFsdWUgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKG5hbWUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5hdHRyKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0aGlzLmdldEF0dHJpYnV0ZShuYW1lKTtcblx0XHRlbHNlIHRoaXMuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHByb3A6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QobmFtZSkgJiYgdmFsdWUgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKG5hbWUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5wcm9wKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0aGlzLm5vZGVbbmFtZV07XG5cdFx0ZWxzZSB0aGlzLm5vZGVbbmFtZV0gPSB2YWx1ZTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHN0eWxlOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KG5hbWUpICYmIHZhbHVlID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaChuYW1lLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMuc3R5bGUobiwgdik7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIGdldENvbXB1dGVkU3R5bGUodGhpcy5ub2RlKVtuYW1lXTtcblx0XHRlbHNlIHRoaXMubm9kZS5zdHlsZVtuYW1lXSA9IHZhbHVlO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aGFzQ2xhc3M6IGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKGNsYXNzTmFtZSk7XG5cdH0sXG5cblx0YWRkQ2xhc3M6IGZ1bmN0aW9uKCkge1xuXHRcdHV0aWwuZmxhdHRlbih1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSkuZm9yRWFjaChmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRcdHRoaXMubm9kZS5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVDbGFzczogZnVuY3Rpb24oKSB7XG5cdFx0dXRpbC5mbGF0dGVuKHV0aWwudG9BcnJheShhcmd1bWVudHMpKS5mb3JFYWNoKGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuXHRcdFx0dGhpcy5ub2RlLmNsYXNzTGlzdC5yZW1vdmUoY2xhc3NOYW1lKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFkZEV2ZW50TGlzdGVuZXI6IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QodHlwZSkgJiYgbGlzdGVuZXIgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKHR5cGUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5hZGRFdmVudExpc3RlbmVyKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdHRoaXMubm9kZS5hZGRFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVFdmVudExpc3RlbmVyOiBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KHR5cGUpICYmIGxpc3RlbmVyID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaCh0eXBlLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMucmVtb3ZlRXZlbnRMaXN0ZW5lcihuLCB2KTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHR0aGlzLm5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3IodGhpcy5ub2RlLCBzZWxlY3RvcikpIHJldHVybiB0aGlzLm5vZGU7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBlbHMgPSBbXTtcblx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3IodGhpcy5ub2RlLCBzZWxlY3RvcikpIGVscy5wdXNoKHRoaXMubm9kZSk7XG5cdFx0ZWxzLnB1c2guYXBwbHkoZWxzLCB1dGlsLnRvQXJyYXkodGhpcy5ub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSk7XG5cdFx0cmV0dXJuIGVscztcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5vdXRlckhUTUw7XG5cdH1cbn0pO1xuXG4vLyBmYXN0IGNvbnN0cnVjdG9ycyBmb3IgdHlwaWNhbCBET00gZWxlbWVudCB0YWduYW1lc1xuZXhwb3J0cy5ET00gPSB7fTtcblxuWyAvLyBIVE1MIHRhZ25hbWVzOyB0aGlzIGxpc3QgaXMgdGFrZW4gZnJvbSBGQidzIFJlYWN0XG5cblwiYVwiLCBcImFiYnJcIiwgXCJhZGRyZXNzXCIsIFwiYXJlYVwiLCBcImFydGljbGVcIiwgXCJhc2lkZVwiLCBcImF1ZGlvXCIsIFwiYlwiLCBcImJhc2VcIiwgXCJiZGlcIixcblwiYmRvXCIsIFwiYmlnXCIsIFwiYmxvY2txdW90ZVwiLCBcImJvZHlcIiwgXCJiclwiLCBcImJ1dHRvblwiLCBcImNhbnZhc1wiLCBcImNhcHRpb25cIiwgXCJjaXRlXCIsXG5cImNvZGVcIiwgXCJjb2xcIiwgXCJjb2xncm91cFwiLCBcImRhdGFcIiwgXCJkYXRhbGlzdFwiLCBcImRkXCIsIFwiZGVsXCIsIFwiZGV0YWlsc1wiLCBcImRmblwiLFxuXCJkaXZcIiwgXCJkbFwiLCBcImR0XCIsIFwiZW1cIiwgXCJlbWJlZFwiLCBcImZpZWxkc2V0XCIsIFwiZmlnY2FwdGlvblwiLCBcImZpZ3VyZVwiLCBcImZvb3RlclwiLFxuXCJmb3JtXCIsIFwiaDFcIiwgXCJoMlwiLCBcImgzXCIsIFwiaDRcIiwgXCJoNVwiLCBcImg2XCIsIFwiaGVhZFwiLCBcImhlYWRlclwiLCBcImhyXCIsIFwiaHRtbFwiLCBcImlcIixcblwiaWZyYW1lXCIsIFwiaW1nXCIsIFwiaW5wdXRcIiwgXCJpbnNcIiwgXCJrYmRcIiwgXCJrZXlnZW5cIiwgXCJsYWJlbFwiLCBcImxlZ2VuZFwiLCBcImxpXCIsXG5cImxpbmtcIiwgXCJtYWluXCIsIFwibWFwXCIsIFwibWFya1wiLCBcIm1lbnVcIiwgXCJtZW51aXRlbVwiLCBcIm1ldGFcIiwgXCJtZXRlclwiLCBcIm5hdlwiLFxuXCJub3NjcmlwdFwiLCBcIm9iamVjdFwiLCBcIm9sXCIsIFwib3B0Z3JvdXBcIiwgXCJvcHRpb25cIiwgXCJvdXRwdXRcIiwgXCJwXCIsIFwicGFyYW1cIiwgXCJwcmVcIixcblwicHJvZ3Jlc3NcIiwgXCJxXCIsIFwicnBcIiwgXCJydFwiLCBcInJ1YnlcIiwgXCJzXCIsIFwic2FtcFwiLCBcInNjcmlwdFwiLCBcInNlY3Rpb25cIiwgXCJzZWxlY3RcIixcblwic21hbGxcIiwgXCJzb3VyY2VcIiwgXCJzcGFuXCIsIFwic3Ryb25nXCIsIFwic3R5bGVcIiwgXCJzdWJcIiwgXCJzdW1tYXJ5XCIsIFwic3VwXCIsIFwidGFibGVcIixcblwidGJvZHlcIiwgXCJ0ZFwiLCBcInRleHRhcmVhXCIsIFwidGZvb3RcIiwgXCJ0aFwiLCBcInRoZWFkXCIsIFwidGltZVwiLCBcInRpdGxlXCIsIFwidHJcIixcblwidHJhY2tcIiwgXCJ1XCIsIFwidWxcIiwgXCJ2YXJcIiwgXCJ2aWRlb1wiLCBcIndiclwiXG5cbl0uZm9yRWFjaChmdW5jdGlvbih0KSB7XG5cdGV4cG9ydHMuRE9NW3RdID0gRWxlbWVudC5leHRlbmQoe1xuXHRcdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBhcmdzID0gdXRpbC50b0FycmF5KGFyZ3VtZW50cyk7XG5cdFx0XHRhcmdzLnVuc2hpZnQodCk7XG5cdFx0XHRFbGVtZW50LmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH1cblx0fSk7XG59KTtcbiIsInZhciBCaW5kaW5nID0gcmVxdWlyZShcIi4vYmluZGluZ1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gQmluZGluZy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oKSB7XG5cdFx0Ly8gdHVybnMgYSBmZXcgZXZlbnRzIGludG8gaW5zdGFuY2UgbWV0aG9kcyB0byBtYWtlIHRoaXMgY2xhc3MgbW9yZSBmdW5jdGlvbmFsXG5cdFx0Ly8gYnV0IGFsc28gdG8gbWF0Y2ggY2xvc2VyIHRvIEZCJ3MgUmVhY3QgY29tcG9uZW50IEFQSVxuXHRcdFtcIm1vdW50XCIsXCJyZW5kZXJcIixcImludmFsaWRhdGVcIl0uZm9yRWFjaChmdW5jdGlvbihldnQpIHtcblx0XHRcdHZhciBjYXBzID0gZXZ0WzBdLnRvVXBwZXJDYXNlKCkgKyBldnQuc3Vic3RyKDEpO1xuXHRcdFx0dGhpcy5vbihldnQgKyBcIjpiZWZvcmVcIiwgcnVuSWZFeGlzdHModGhpcywgXCJiZWZvcmVcIiArIGNhcHMpKTtcblx0XHRcdHRoaXMub24oZXZ0LCBydW5JZkV4aXN0cyh0aGlzLCBcIm9uXCIgKyBjYXBzKSk7XG5cdFx0XHR0aGlzLm9uKGV2dCArIFwiOmFmdGVyXCIsIHJ1bklmRXhpc3RzKHRoaXMsIFwiYWZ0ZXJcIiArIGNhcHMpKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHRoaXMub24oXCJzdG9wXCIsIHJ1bklmRXhpc3RzKHRoaXMsIFwib25TdG9wXCIpKTtcblxuXHRcdEJpbmRpbmcuYXBwbHkodGhpcyk7XG5cdFx0dGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH0sXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oKXt9LFxuXHRyZW5kZXI6IGZ1bmN0aW9uKCl7fSxcblxuXHRtb3VudDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGFyZ3MgPSB1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSwgY29tcDtcblxuXHRcdC8vIHN0b3AgZXhpc3RpbmcgbW91bnRcblx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdC8vIHRoZSBmaXJzdCBldmVudCBpbiB0aGUgY3ljbGUsIGJlZm9yZSBldmVyeXRoaW5nIGVsc2Vcblx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDpiZWZvcmVcIiwgYXJncyk7XG5cblx0XHQvLyB0aGUgYXV0b3J1biBjb21wdXRhdGlvblxuXHRcdGNvbXAgPSB0aGlzLl9jb21wID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdC8vIG9ubHkgcmVuZGVyIGV2ZW50IHdpdGhvdXQgYmluZGluZ3Ncblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjpiZWZvcmVcIiwgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIHJ1biByZW5kZXIgYW5kIHByb2Nlc3MgdGhlIHJlc3VsdGluZyBiaW5kaW5ncyBpbnRvIGFuIGFycmF5XG5cdFx0XHR2YXIgYmluZGluZ3MgPSB0aGlzLnJlbmRlci5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdGlmIChCaW5kaW5nLmlzQmluZGluZyhiaW5kaW5ncykpIGJpbmRpbmdzID0gWyBiaW5kaW5ncyBdO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGJpbmRpbmdzKSkgYmluZGluZ3MgPSBbXTtcblxuXHRcdFx0Ly8gbWFpbiByZW5kZXIgZXZlbnQgZXhlY3MgYWZ0ZXIgcmVuZGVyIGJ1dCBiZWZvcmUgYXBwZW5kaW5nXG5cdFx0XHQvLyB0aGUgYmluZGluZ3MgYXJyYXkgY2FuIGJlIGFmZmVjdGVkIGJ5IHRoaXMgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlclwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIGFwcGVuZCB0aGUgYmluZGluZ3MgaW4gb3JkZXJcblx0XHRcdGJpbmRpbmdzID0gYmluZGluZ3MubWFwKHRoaXMuYXBwZW5kQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XG5cdFx0XHQvLyB0aGUgbGFzdCByZW5kZXIgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjphZnRlclwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIGF1dG8gY2xlYW4gdXBcblx0XHRcdGNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQvLyBvbmx5IGludmFsaWRhdGUgZXZlbnQgd2l0aCBiaW5kaW5nc1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJpbnZhbGlkYXRlOmJlZm9yZVwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyByZW1vdmUgdGhlIGJpbmRpbmdzIGFkZGVkIGJlZm9yZVxuXHRcdFx0XHRiaW5kaW5ncy5mb3JFYWNoKHRoaXMucmVtb3ZlQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XHRcblx0XHRcdFx0Ly8gcmVtYWluaW5nIGludmFsaWRhdGUgZXZlbnRzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGVcIiwgY29tcCwgYXJncyk7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGU6YWZ0ZXJcIiwgY29tcCwgYXJncyk7XG5cblx0XHRcdFx0Ly8gZGV0ZWN0IGlmIHRoZSBjb21wdXRhdGlvbiBzdG9wcGVkXG5cdFx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJzdG9wXCIsIGFyZ3MpO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9jb21wO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIHJlbWFpbmluZyBtb3VudCBldmVudHMgaGFwcGVuIGFmdGVyIHRoZSBmaXJzdCByZW5kZXJcblx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudFwiLCBjb21wLCBhcmdzKTtcblx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDphZnRlclwiLCBjb21wLCBhcmdzKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGlzTW91bnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXAgIT0gbnVsbDtcblx0fSxcblxuXHRpbnZhbGlkYXRlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc01vdW50ZWQoKSkgdGhpcy5fY29tcC5pbnZhbGlkYXRlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0c3RvcDogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNNb3VudGVkKCkpIHRoaXMuX2NvbXAuc3RvcCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59KTtcblxuZnVuY3Rpb24gcnVuSWZFeGlzdHMob2JqLCBtZXRob2QpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0eXBlb2Ygb2JqW21ldGhvZF0gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0cmV0dXJuIG9ialttZXRob2RdLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcblx0XHR9XG5cdH1cbn1cbiIsInZhciB0b0FycmF5ID1cbmV4cG9ydHMudG9BcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwob2JqLCAwKTtcbn1cblxudmFyIGhhcyA9XG5leHBvcnRzLmhhcyA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG5cdHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xufVxuXG52YXIgZXh0ZW5kID1cbmV4cG9ydHMuZXh0ZW5kID0gZnVuY3Rpb24ob2JqKSB7XG5cdHRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKS5mb3JFYWNoKGZ1bmN0aW9uKG1peGluKSB7XG5cdFx0aWYgKCFtaXhpbikgcmV0dXJuO1xuXG5cdFx0Zm9yICh2YXIga2V5IGluIG1peGluKSB7XG5cdFx0XHRvYmpba2V5XSA9IG1peGluW2tleV07XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgZWFjaCA9XG5leHBvcnRzLmVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG5cdGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcblxuXHRpZiAob2JqLmZvckVhY2ggPT09IEFycmF5LnByb3RvdHlwZS5mb3JFYWNoKSB7XG5cdFx0b2JqLmZvckVhY2goaXRlcmF0b3IsIGNvbnRleHQpO1xuXHR9IGVsc2UgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSB7XG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0aXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpbaV0sIGksIG9iaik7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0aXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5c1tpXV0sIGtleXNbaV0sIG9iaik7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG9iajtcbn1cblxudmFyIGZsYXR0ZW4gPVxuZXhwb3J0cy5mbGF0dGVuID0gZnVuY3Rpb24oaW5wdXQsIG91dHB1dCkge1xuXHRpZiAob3V0cHV0ID09IG51bGwpIG91dHB1dCA9IFtdO1xuXG5cdGVhY2goaW5wdXQsIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSBmbGF0dGVuKHZhbHVlLCBvdXRwdXQpO1xuXHRcdGVsc2Ugb3V0cHV0LnB1c2godmFsdWUpO1xuXHR9KTtcblxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5leHBvcnRzLnBpY2sgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIGZsYXR0ZW4odG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpKVxuXG5cdC5yZWR1Y2UoZnVuY3Rpb24obm9iaiwga2V5KSB7XG5cdFx0bm9ialtrZXldID0gb2JqW2tleV07XG5cdFx0cmV0dXJuIG5vYmo7XG5cdH0sIHt9KTtcbn1cblxudmFyIGlzT2JqZWN0ID1cbmV4cG9ydHMuaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIG9iaiA9PT0gT2JqZWN0KG9iaik7XG59XG5cbmV4cG9ydHMudW5pcXVlSWQgPSAoZnVuY3Rpb24oKSB7XG5cdHZhciBpZCA9IDA7XG5cdHJldHVybiBmdW5jdGlvbihwcmVmaXgpIHtcblx0XHRyZXR1cm4gKHByZWZpeCB8fCBcIlwiKSArICgrK2lkKTtcblx0fVxufSkoKTtcblxuLy8gdGhlIHN1YmNsYXNzaW5nIGZ1bmN0aW9uIGZvdW5kIGluIEJhY2tib25lXG5leHBvcnRzLnN1YmNsYXNzID0gZnVuY3Rpb24ocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcblx0dmFyIHBhcmVudCA9IHRoaXM7XG5cdHZhciBjaGlsZDtcblxuXHQvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG5cdC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuXHQvLyBieSB1cyB0byBzaW1wbHkgY2FsbCB0aGUgcGFyZW50J3MgY29uc3RydWN0b3IuXG5cdGlmIChwcm90b1Byb3BzICYmIGhhcyhwcm90b1Byb3BzLCAnY29uc3RydWN0b3InKSkge1xuXHRcdGNoaWxkID0gcHJvdG9Qcm9wcy5jb25zdHJ1Y3Rvcjtcblx0fSBlbHNlIHtcblx0XHRjaGlsZCA9IGZ1bmN0aW9uKCl7IHJldHVybiBwYXJlbnQuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfTtcblx0fVxuXG5cdC8vIEFkZCBzdGF0aWMgcHJvcGVydGllcyB0byB0aGUgY29uc3RydWN0b3IgZnVuY3Rpb24sIGlmIHN1cHBsaWVkLlxuXHRleHRlbmQoY2hpbGQsIHBhcmVudCwgc3RhdGljUHJvcHMpO1xuXG5cdC8vIFNldCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIGluaGVyaXQgZnJvbSBgcGFyZW50YCwgd2l0aG91dCBjYWxsaW5nXG5cdC8vIGBwYXJlbnRgJ3MgY29uc3RydWN0b3IgZnVuY3Rpb24uXG5cdHZhciBTdXJyb2dhdGUgPSBmdW5jdGlvbigpeyB0aGlzLmNvbnN0cnVjdG9yID0gY2hpbGQ7IH07XG5cdFN1cnJvZ2F0ZS5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuXHRjaGlsZC5wcm90b3R5cGUgPSBuZXcgU3Vycm9nYXRlO1xuXG5cdC8vIEFkZCBwcm90b3R5cGUgcHJvcGVydGllcyAoaW5zdGFuY2UgcHJvcGVydGllcykgdG8gdGhlIHN1YmNsYXNzLFxuXHQvLyBpZiBzdXBwbGllZC5cblx0aWYgKHByb3RvUHJvcHMpIGV4dGVuZChjaGlsZC5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuXG5cdC8vIFNldCBhIGNvbnZlbmllbmNlIHByb3BlcnR5IGluIGNhc2UgdGhlIHBhcmVudCdzIHByb3RvdHlwZSBpcyBuZWVkZWRcblx0Ly8gbGF0ZXIuXG5cdGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cblx0cmV0dXJuIGNoaWxkO1xufVxuXG5leHBvcnRzLmlzTm9kZUF0RE9NUG9zaXRpb24gPSBmdW5jdGlvbihub2RlLCBwYXJlbnQsIGJlZm9yZSkge1xuXHRyZXR1cm4gbm9kZS5wYXJlbnROb2RlID09PSBwYXJlbnQgJiYgbm9kZS5uZXh0U2libGluZyA9PT0gYmVmb3JlO1xufVxuXG52YXIgbWF0Y2hlc1NlbGVjdG9yID0gRWxlbWVudC5wcm90b3R5cGUubWF0Y2hlcyB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS53ZWJraXRNYXRjaGVzU2VsZWN0b3IgfHxcblx0RWxlbWVudC5wcm90b3R5cGUubW96TWF0Y2hlc1NlbGVjdG9yIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLm1zTWF0Y2hlc1NlbGVjdG9yO1xuXG5leHBvcnRzLm1hdGNoZXNTZWxlY3RvciA9IGZ1bmN0aW9uKGVsZW0sIHNlbGVjdG9yKSB7XG5cdHJldHVybiBtYXRjaGVzU2VsZWN0b3IuY2FsbChlbGVtLCBzZWxlY3Rvcilcbn1cblxudmFyIERlcHMgPSByZXF1aXJlKFwiLi9kZXBzXCIpO1xuXG52YXIgZGVmaW5lUmVhY3RpdmVQcm9wZXJ0eSA9XG5leHBvcnRzLmRlZmluZVJlYWN0aXZlUHJvcGVydHkgPSBmdW5jdGlvbihvYmosIHByb3AsIHZhbHVlLCBjb2VyY2UpIHtcblx0aWYgKCFpc09iamVjdChvYmopKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgb2JqZWN0IHRvIGRlZmluZSB0aGUgcmVhY3RpdmUgcHJvcGVydHkgb24uXCIpO1xuXHRpZiAodHlwZW9mIHByb3AgIT09IFwic3RyaW5nXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgZm9yIHByb3BlcnR5IG5hbWUuXCIpO1xuXG5cdGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIiAmJiBjb2VyY2UgPT0gbnVsbCkge1xuXHRcdGNvZXJjZSA9IHZhbHVlO1xuXHRcdHZhbHVlID0gdm9pZCAwO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBjb2VyY2UgIT09IFwiZnVuY3Rpb25cIikgY29lcmNlID0gZnVuY3Rpb24odikgeyByZXR1cm4gdjsgfTtcblxuXHQvLyBydW5zIHRoZSBjb2VyY2lvbiBmdW5jdGlvbiBub24tcmVhY3RpdmVseSB0byBwcmV2ZW50IGluZmluaXRlIGxvb3BzXG5cdGZ1bmN0aW9uIHByb2Nlc3Modikge1xuXHRcdHJldHVybiBEZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGNvZXJjZS5jYWxsKG9iaiwgdiwgcHJvcCwgb2JqKTtcblx0XHR9KTtcblx0fVxuXG5cdHZhciBkZXAgPSBuZXcgRGVwcy5EZXBlbmRlbmN5O1xuXHR2YWx1ZSA9IHByb2Nlc3ModmFsdWUpO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0dmFsID0gcHJvY2Vzcyh2YWwpO1xuXG5cdFx0XHRpZiAodmFsICE9PSB2YWx1ZSkge1xuXHRcdFx0XHR2YWx1ZSA9IHZhbDtcblx0XHRcdFx0ZGVwLmNoYW5nZWQoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0sXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdGRlcC5kZXBlbmQoKTtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBvYmo7XG59XG5cbmV4cG9ydHMuZGVmaW5lUmVhY3RpdmVQcm9wZXJ0aWVzID0gZnVuY3Rpb24ob2JqLCBwcm9wcywgY29lcmNlKSB7XG5cdGZvciAodmFyIHByb3AgaW4gcHJvcHMpIHtcblx0XHRkZWZpbmVSZWFjdGl2ZVByb3BlcnR5KG9iaiwgcHJvcCwgcHJvcHNbcHJvcF0sIGNvZXJjZSB8fCBmYWxzZSk7XG5cdH1cblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eSA9XG5leHBvcnRzLmRlZmluZUNvbXB1dGVkUHJvcGVydHkgPSBmdW5jdGlvbihvYmosIHByb3AsIHZhbHVlKSB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09IFwiZnVuY3Rpb25cIilcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGNvbXB1dGVkIHByb3BlcnR5IHZhbHVlLlwiKTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCB7XG5cdFx0Y29uZmlndXJhYmxlOiB0cnVlLFxuXHRcdGVudW1lcmFibGU6IHRydWUsXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5jYWxsKG9iaik7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0cy5kZWZpbmVDb21wdXRlZFByb3BlcnRpZXMgPSBmdW5jdGlvbihvYmosIHByb3BzKSB7XG5cdE9iamVjdC5rZXlzKHByb3BzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuXHRcdGRlZmluZUNvbXB1dGVkUHJvcGVydHkob2JqLCBrZXksIHByb3BzW2tleV0pO1xuXHR9KTtcbn1cbiJdfQ==
(5)
});
