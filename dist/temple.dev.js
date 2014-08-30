/* Temple / (c) 2014 Beneath the Ink, Inc. / MIT License / Version 0.3.1, Build 129 */
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
Temple.VERSION = "0.3.1";
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

var Text =
exports.Text = Node.extend({
	constructor: function(nodeOrValue) {
		// text node
		if (nodeOrValue instanceof window.Node && nodeOrValue.nodeType === 3) {
			this.node = nodeOrValue;
			this.value = nodeOrValue.nodeValue;
		}

		// anything else
		else {
			this.node = document.createTextNode("");
			this.setValue(nodeOrValue);
		}

		Node.call(this);
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
	constructor: function(nodeOrTagName) {
		var children = util.toArray(arguments).slice(1);

		// element
		if (nodeOrTagName instanceof window.Node && nodeOrTagName.nodeType === 1) {
			this.node = nodeOrTagName;
			this.tagname = nodeOrTagName.tagName.toLowerCase();

			// add child nodes as further children
			// note: this may affect the original node's children
			wrapNode(util.toArray(nodeOrTagName.childNodes))
				.forEach(function(b) { children.push(b); });
		}

		// string
		else if (typeof nodeOrTagName === "string") {
			this.tagname = nodeOrTagName;
			this.node = document.createElement(nodeOrTagName);
		}

		// or error
		else throw new Error("Expecting string for element tag name.");

		Node.apply(this, children);
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

// converts dom nodes into binding equivalents
var wrapNode =
exports.wrapNode = function(node) {
	if (Array.isArray(node)) {
		return node.map(wrapNode)
			.filter(function(b) { return b != null; });
	}

	switch (node.nodeType) {
		// Element
		case 1: return new Element(node);
		
		// Text Node
		case 3: return new Text(node);

		// Document Fragment
		case 11:
			var binding = new Binding;

			wrapNode(util.toArray(node.childNodes))
				.forEach(binding.appendChild, binding);

			return binding;
	}
}

// converts a string of HTML into a set of static bindings
exports.parseHTML = function(html) {
	var cont = document.createElement("div"),
		binding = new Binding;

	cont.innerHTML = html;

	wrapNode(util.toArray(cont.childNodes))
		.forEach(binding.appendChild, binding);

	return binding;
}
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9ub2RlX21vZHVsZXMvZ3J1bnQtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9iaW5kaW5nLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9kZXBzLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ldmVudHMuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2h0bWwuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2luZGV4LmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ub2RlLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9yZWFjdC5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9saWIvdXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1WEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDZkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIEV2ZW50cyA9IHJlcXVpcmUoXCIuL2V2ZW50c1wiKSxcblx0RGVwcyA9IHJlcXVpcmUoXCIuL2RlcHNcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG52YXIgY29tcHV0ZWRQcm9wcyA9IFtcblx0XCJpc1Jvb3RcIiwgXCJoYXNDaGlsZHJlblwiLCBcImZpcnN0Q2hpbGRcIiwgXCJsYXN0Q2hpbGRcIiwgXCJuZXh0U2libGluZ1wiLFxuXHRcInByZXZpb3VzU2libGluZ1wiLCBcInBhcmVudE5vZGVcIiwgXCJmaXJzdE5vZGVcIiwgXCJuZXh0U2libGluZ05vZGVcIlxuXTtcblxuZnVuY3Rpb24gQmluZGluZygpIHtcblx0dGhpcy5jaGlsZHJlbiA9IFtdO1xuXHR0aGlzLnBhcmVudCA9IG51bGw7XG5cdHV0aWwuZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0aWVzKHRoaXMsIHV0aWwucGljayh0aGlzLCBjb21wdXRlZFByb3BzKSk7XG5cdHV0aWwudG9BcnJheShhcmd1bWVudHMpLmZvckVhY2godGhpcy5hcHBlbmRDaGlsZCwgdGhpcyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQmluZGluZztcbkJpbmRpbmcuZXh0ZW5kID0gdXRpbC5zdWJjbGFzcztcbkJpbmRpbmcuaXNCaW5kaW5nID0gZnVuY3Rpb24obykge1xuXHRyZXR1cm4gbyBpbnN0YW5jZW9mIEJpbmRpbmc7XG59XG5cbnV0aWwuZXh0ZW5kKEJpbmRpbmcucHJvdG90eXBlLCBFdmVudHMsIHtcblx0dXNlOiBmdW5jdGlvbihmbikge1xuXHRcdHZhciBhcmdzID0gdXRpbC50b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSk7XG5cdFx0Zm4uYXBwbHkodGhpcywgYXJncyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cdFxuXHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uKGNoaWxkLCBiZWZvcmUpIHtcblx0XHQvLyBzcGVjaWFsIGNhc2UgZm9yIHN0cmluZ3Ncblx0XHRpZiAodHlwZW9mIGNoaWxkID09PSBcInN0cmluZ1wiKSBjaGlsZCA9IG5ldyBCaW5kaW5nLlRleHQoY2hpbGQpO1xuXG5cdFx0aWYgKCFCaW5kaW5nLmlzQmluZGluZyhjaGlsZCkpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgY2hpbGQgdG8gYmUgYSBiaW5kaW5nLlwiKTtcblxuXHRcdGlmIChjaGlsZCA9PT0gdGhpcylcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBhZGQgYmluZGluZyBhcyBhIGNoaWxkIG9mIGl0c2VsZi5cIik7XG5cblx0XHQvLyBkZWZhdWx0IGluZGV4IGlzIHRoZSBlbmRcblx0XHR2YXIgaW5kZXggPSB0aGlzLmNoaWxkcmVuLmxlbmd0aCxcblx0XHRcdG9wYXJlbnQgPSBjaGlsZC5wYXJlbnQsXG5cdFx0XHRjaW5kZXgsIG1vdmVkID0gZmFsc2U7XG5cblx0XHQvLyBvYnRhaW4gdGhlIGluZGV4IHRvIGluc2VydCBhdFxuXHRcdGlmIChiZWZvcmUgIT0gbnVsbCkge1xuXHRcdFx0aWYgKCFCaW5kaW5nLmlzQmluZGluZyhiZWZvcmUpKVxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYmVmb3JlIGNoaWxkIHRvIGJlIGEgYmluZGluZy5cIik7XG5cblx0XHRcdGluZGV4ID0gdGhpcy5pbmRleE9mKGJlZm9yZSk7XG5cdFx0XHRpZiAoIX5pbmRleCkgdGhyb3cgbmV3IEVycm9yKFwiQmVmb3JlIGJpbmRpbmcgaXMgbm90IGEgY2hpbGQgb2YgdGhpcyBiaW5kaW5nLlwiKTtcblx0XHRcdGlmIChiZWZvcmUgPT09IGNoaWxkKSB0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgYWRkIGNoaWxkIGJlZm9yZSBpdHNlbGYuXCIpO1xuXG5cdFx0XHQvLyBpZiBub2RlIGlzIGFscmVhZHkgYXQgdGhpcyBsb2NhdGlvbiwgbm8gbmVlZCB0byBjb250aW51ZVxuXHRcdFx0aWYgKGJlZm9yZS5wcmV2aW91c1NpYmxpbmcgPT09IGNoaWxkKSByZXR1cm4gY2hpbGQ7XG5cdFx0fVxuXG5cdFx0Ly8gZG8gc3BlY2lhbCB0aGluZ3MgaWYgY2hpbGQgaXMgYWxyZWFkeSBhIGNoaWxkIG9mIHRoaXMgcGFyZW50XG5cdFx0aWYgKG9wYXJlbnQgPT09IHRoaXMpIHtcblx0XHRcdGNpbmRleCA9IHRoaXMuaW5kZXhPZihjaGlsZCk7XG5cblx0XHRcdC8vIGlmIHRoZSBjaGlsZCBpcyBhbHJlYWR5IHRoZSBub2RlIGJlZm9yZSB0aGUgaW5kZXgsIG5vIG5lZWQgdG8gY29udGludWVcblx0XHRcdGlmIChjaW5kZXggPT09IGluZGV4IC0gMSkgcmV0dXJuIGNoaWxkO1xuXG5cdFx0XHQvLyByZW1vdmUgdGhlIGNoaWxkXG5cdFx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZShjaW5kZXgsIDEpO1xuXG5cdFx0XHQvLyB1cGRhdGUgdGhlIGluZGV4IHNpbmNlIGl0IG1heSBoYXZlIGNoYW5nZWRcblx0XHRcdGluZGV4ID0gYmVmb3JlICE9IG51bGwgPyB0aGlzLmluZGV4T2YoYmVmb3JlKSA6IHRoaXMuY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdH1cblxuXHRcdC8vIG9yIHNpbXVsYXRlIHJlbW92ZSBmcm9tIGV4aXN0aW5nIHBhcmVudFxuXHRcdGVsc2UgaWYgKG9wYXJlbnQgIT0gbnVsbCkge1xuXHRcdFx0b3BhcmVudC5jaGlsZHJlbi5zcGxpY2Uob3BhcmVudC5pbmRleE9mKGNoaWxkKSwgMSk7XG5cdFx0XHRjaGlsZC5wYXJlbnQgPSBudWxsO1xuXHRcdFx0b3BhcmVudC50cmlnZ2VyKFwiY2hpbGQ6cmVtb3ZlXCIsIGNoaWxkKTtcblx0XHR9XG5cblx0XHQvLyBhZGQgdGhlIGNoaWxkXG5cdFx0dGhpcy5jaGlsZHJlbi5zcGxpY2UoaW5kZXgsIDAsIGNoaWxkKTtcblx0XHRjaGlsZC5wYXJlbnQgPSB0aGlzO1xuXG5cdFx0Ly8gdHJpZ2dlciBldmVudHNcblx0XHRpZiAob3BhcmVudCA9PT0gdGhpcykge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiY2hpbGQ6bW92ZVwiLCBjaGlsZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudHJpZ2dlcihcImNoaWxkOmFkZFwiLCBjaGlsZCk7XG5cdFx0XHRjaGlsZC50cmlnZ2VyKFwicGFyZW50XCIsIHRoaXMsIG9wYXJlbnQpO1xuXHRcdH1cblxuXHRcdC8vIHVwZGF0ZSBub2RlcyBsYXN0XG5cdFx0Y2hpbGQudXBkYXRlTm9kZXMoKTtcblxuXHRcdHJldHVybiBjaGlsZDtcblx0fSxcblxuXHRhcHBlbmRDaGlsZDogZnVuY3Rpb24oY2hpbGQpIHtcblx0XHRyZXR1cm4gdGhpcy5pbnNlcnRCZWZvcmUoY2hpbGQpO1xuXHR9LFxuXG5cdHJlbW92ZUNoaWxkOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHZhciBpbmRleCA9IHRoaXMuaW5kZXhPZihjaGlsZCk7XG5cdFx0aWYgKCF+aW5kZXgpIHJldHVybjtcblxuXHRcdC8vIHJlbW92ZSBjaGlsZFxuXHRcdHdoaWxlIChpbmRleCA+IC0xKSB7XG5cdFx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRpbmRleCA9IHRoaXMuaW5kZXhPZihjaGlsZCwgaW5kZXgpO1xuXHRcdH1cblxuXHRcdGNoaWxkLnBhcmVudCA9IG51bGw7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50c1xuXHRcdHRoaXMudHJpZ2dlcihcImNoaWxkOnJlbW92ZVwiLCBjaGlsZCk7XG5cdFx0Y2hpbGQudHJpZ2dlcihcInBhcmVudFwiLCBudWxsLCB0aGlzKTtcblxuXHRcdC8vIHVwZGF0ZSBub2RlcyBsYXN0XG5cdFx0Y2hpbGQudXBkYXRlTm9kZXMoKTtcblxuXHRcdHJldHVybiBjaGlsZDtcblx0fSxcblxuXHRjb250YWluczogZnVuY3Rpb24oY2hpbGQpIHtcblx0XHRyZXR1cm4gdGhpcy5pbmRleE9mKGNoaWxkKSA+IC0xO1xuXHR9LFxuXG5cdGluZGV4T2Y6IGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4uaW5kZXhPZihjaGlsZCk7XG5cdH0sXG5cblx0Zmlyc3RDaGlsZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW5bMF0gfHwgbnVsbDtcblx0fSxcblxuXHRsYXN0Q2hpbGQ6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBsZW4gPSB0aGlzLmNoaWxkcmVuLmxlbmd0aDtcblx0XHRyZXR1cm4gbGVuID8gdGhpcy5jaGlsZHJlbltsZW4gLSAxXSA6IG51bGw7XG5cdH0sXG5cblx0bmV4dFNpYmxpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzUm9vdCkgcmV0dXJuIG51bGw7XG5cblx0XHR2YXIgaW5kZXggPSB0aGlzLnBhcmVudC5pbmRleE9mKHRoaXMpLFxuXHRcdFx0Y2hpbGRyZW4gPSB0aGlzLnBhcmVudC5jaGlsZHJlbjtcblxuXHRcdHJldHVybiBpbmRleCA+IC0xICYmIGluZGV4IDwgY2hpbGRyZW4ubGVuZ3RoIC0gMSA/IGNoaWxkcmVuW2luZGV4ICsgMV0gOiBudWxsO1xuXHR9LFxuXG5cdHByZXZpb3VzU2libGluZzogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNSb290KSByZXR1cm4gbnVsbDtcblxuXHRcdHZhciBpbmRleCA9IHRoaXMucGFyZW50LmluZGV4T2YodGhpcyksXG5cdFx0XHRjaGlsZHJlbiA9IHRoaXMucGFyZW50LmNoaWxkcmVuO1xuXG5cdFx0cmV0dXJuIGluZGV4ID4gMCAmJiBpbmRleCA8IGNoaWxkcmVuLmxlbmd0aCA/IGNoaWxkcmVuW2luZGV4IC0gMV0gOiBudWxsO1xuXHR9LFxuXG5cdGhhc0NoaWxkcmVuOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHR9LFxuXG5cdGlzUm9vdDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMucGFyZW50ID09IG51bGw7XG5cdH0sXG5cblx0dXBkYXRlTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdC8vIHdlIG11c3QgdXBkYXRlIGluIHJldmVyc2UgdG8gZW5zdXJlIHRoYXQgYmVmb3JlIG5vZGVzXG5cdFx0Ly8gYXJlIGFscmVhZHkgaW4gdGhlIERPTSB3aGVuIGNoaWxkcmVuIGFyZSBwbGFjZWRcblx0XHRmb3IgKHZhciBpID0gdGhpcy5jaGlsZHJlbi5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0dGhpcy5jaGlsZHJlbltpXS51cGRhdGVOb2RlcygpO1xuXHRcdH1cblxuXHRcdC8vIGV2ZW50IGlzIGZpcmVkIGFmdGVyLCBtZWFuaW5nIGNoaWxkcmVuIHdpbGwgZmlyZSB0aGVpciBldmVudHMgZmlyc3Rcblx0XHR0aGlzLnRyaWdnZXIoXCJ1cGRhdGVcIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0dG9Ob2RlczogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4ucmVkdWNlKGZ1bmN0aW9uKG5vZGVzLCBjaGlsZCkge1xuXHRcdFx0bm9kZXMucHVzaC5hcHBseShub2RlcywgY2hpbGQudG9Ob2RlcygpKTtcblx0XHRcdHJldHVybiBub2Rlcztcblx0XHR9LCBbXSk7XG5cdH0sXG5cblx0cGFyZW50Tm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNSb290KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wbGFjZWhvbGRlciAhPSBudWxsID9cblx0XHRcdFx0dGhpcy5wbGFjZWhvbGRlci5wYXJlbnROb2RlIDpcblx0XHRcdFx0bnVsbDtcblx0XHR9XG5cblx0XHR2YXIgcGFyZW50ID0gdGhpcy5wYXJlbnQ7XG5cblx0XHR3aGlsZSAocGFyZW50ICE9IG51bGwpIHtcblx0XHRcdGlmIChwYXJlbnQgaW5zdGFuY2VvZiBCaW5kaW5nLk5vZGUpIHJldHVybiBwYXJlbnQubm9kZTtcblx0XHRcdGlmIChwYXJlbnQuaXNSb290KSByZXR1cm4gcGFyZW50LnBhcmVudE5vZGU7XG5cdFx0XHRwYXJlbnQgPSBwYXJlbnQucGFyZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdGZpcnN0Tm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGZpcnN0Q2hpbGQgPSB0aGlzLmZpcnN0Q2hpbGQ7XG5cdFx0cmV0dXJuIGZpcnN0Q2hpbGQgIT0gbnVsbCA/IGZpcnN0Q2hpbGQuZmlyc3ROb2RlIDogbnVsbDtcblx0fSxcblxuXHRuZXh0U2libGluZ05vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzUm9vdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGxhY2Vob2xkZXIgIT0gbnVsbCA/XG5cdFx0XHRcdHRoaXMucGxhY2Vob2xkZXIgOlxuXHRcdFx0XHRudWxsO1xuXHRcdH1cblxuXHRcdHZhciBuZXh0U2libGluZyA9IHRoaXMubmV4dFNpYmxpbmc7XG5cdFx0cmV0dXJuIG5leHRTaWJsaW5nICE9IG51bGwgPyBuZXh0U2libGluZy5maXJzdE5vZGUgOlxuXHRcdFx0dGhpcy5wYXJlbnQgaW5zdGFuY2VvZiBCaW5kaW5nLk5vZGUgPyBudWxsIDpcblx0XHRcdHRoaXMucGFyZW50Lm5leHRTaWJsaW5nTm9kZTtcblx0fSxcblxuXHRmaW5kOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBlbCwgaTtcblxuXHRcdGZvciAoaSBpbiB0aGlzLmNoaWxkcmVuKSB7XG5cdFx0XHRlbCA9IHRoaXMuY2hpbGRyZW5baV0uZmluZChzZWxlY3Rvcik7XG5cdFx0XHRpZiAoZWwgIT0gbnVsbCkgcmV0dXJuIGVsO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdGZpbmRBbGw6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4ucmVkdWNlKGZ1bmN0aW9uKG5vZGVzLCBjaGlsZCkge1xuXHRcdFx0bm9kZXMucHVzaC5hcHBseShub2RlcywgY2hpbGQuZmluZEFsbChzZWxlY3RvcikpO1xuXHRcdFx0cmV0dXJuIG5vZGVzO1xuXHRcdH0sIFtdKTtcblx0fSxcblxuXHRwYWludDogZnVuY3Rpb24ocGFyZW50LCBiZWZvcmVOb2RlKSB7XG5cdFx0aWYgKHR5cGVvZiBwYXJlbnQgPT09IFwic3RyaW5nXCIpIHBhcmVudCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IocGFyZW50KTtcblx0XHRpZiAodHlwZW9mIGJlZm9yZU5vZGUgPT09IFwic3RyaW5nXCIpIGJlZm9yZU5vZGUgPSBwYXJlbnQucXVlcnlTZWxlY3RvcihiZWZvcmVOb2RlKTtcblx0XHRpZiAocGFyZW50ID09IG51bGwpIHBhcmVudCA9IGRvY3VtZW50LmNyZWF0ZURvY3VtZW50RnJhZ21lbnQoKTtcblx0XHRpZiAodGhpcy5wbGFjZWhvbGRlciA9PSBudWxsKSB0aGlzLnBsYWNlaG9sZGVyID0gZG9jdW1lbnQuY3JlYXRlQ29tbWVudCh1dGlsLnVuaXF1ZUlkKFwiJFwiKSk7XG5cblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKHRoaXMucGxhY2Vob2xkZXIsIGJlZm9yZU5vZGUpO1xuXHRcdHRoaXMudXBkYXRlTm9kZXMoKTtcblx0XHR0aGlzLnRyaWdnZXIoXCJwYWludFwiLCBwYXJlbnQsIGJlZm9yZU5vZGUpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZGV0YWNoOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5wbGFjZWhvbGRlciAhPSBudWxsICYmIHRoaXMucGxhY2Vob2xkZXIucGFyZW50Tm9kZSkge1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlci5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMucGxhY2Vob2xkZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlTm9kZXMoKTtcblx0XHR0aGlzLnRyaWdnZXIoXCJkZXRhY2hcIik7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhdXRvcnVuOiBmdW5jdGlvbihmbiwgb25seU9uQWN0aXZlKSB7XG5cdFx0dmFyIGNvbXAgPSBEZXBzLmF1dG9ydW4oZm4sIHRoaXMpO1xuXHRcdGlmIChvbmx5T25BY3RpdmUgJiYgIURlcHMuYWN0aXZlKSBjb21wLnN0b3AoKTtcblx0XHRyZXR1cm4gY29tcDtcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0XHRyZXR1cm4gY2hpbGQudG9TdHJpbmcoKTtcblx0XHR9KS5qb2luKFwiXCIpO1xuXHR9XG59KTtcblxuLy8gYWxpYXNlc1xuQmluZGluZy5wcm90b3R5cGUuaGFzQ2hpbGQgPSBCaW5kaW5nLnByb3RvdHlwZS5jb250YWlucztcbkJpbmRpbmcucHJvdG90eXBlLnRvSFRNTCA9IEJpbmRpbmcucHJvdG90eXBlLnRvU3RyaW5nO1xuXG4vLyBMb2FkIHRoZSBiaW5kaW5nc1xudXRpbC5leHRlbmQoQmluZGluZywgcmVxdWlyZShcIi4vbm9kZVwiKSk7XG5CaW5kaW5nLkhUTUwgPSByZXF1aXJlKFwiLi9odG1sXCIpO1xuQmluZGluZy5SZWFjdCA9IHJlcXVpcmUoXCIuL3JlYWN0XCIpO1xuIiwiLy8gQ29weSBvZiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9jb21taXRzL2U3ODg2MWI3ZDBkYmI2MGU1ZTJiZjU5YmFiMmNiMDZjZTY1OTZjMDQvcGFja2FnZXMvZGVwcy9kZXBzLmpzXG4vLyAoYykgMjAxMS0yMDE0IE1ldGVvciBEZXZlbG9wbWVudCBHcm91cFxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gUGFja2FnZSBkb2NzIGF0IGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHMgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciBEZXBzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19hY3RpdmVcbkRlcHMuYWN0aXZlID0gZmFsc2U7XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfY3VycmVudGNvbXB1dGF0aW9uXG5EZXBzLmN1cnJlbnRDb21wdXRhdGlvbiA9IG51bGw7XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuICBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbiA9IGM7XG4gIERlcHMuYWN0aXZlID0gISEgYztcbn07XG5cbnZhciBfZGVidWdGdW5jID0gZnVuY3Rpb24gKCkge1xuICAvLyBsYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5XG4gIHJldHVybiAodHlwZW9mIE1ldGVvciAhPT0gXCJ1bmRlZmluZWRcIiA/IE1ldGVvci5fZGVidWcgOlxuICAgICAgICAgICgodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUubG9nID9cbiAgICAgICAgICAgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcbiAgICAgICAgICAgZnVuY3Rpb24gKCkge30pKTtcbn07XG5cbnZhciBfdGhyb3dPckxvZyA9IGZ1bmN0aW9uIChmcm9tLCBlKSB7XG4gIGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcbiAgICB0aHJvdyBlO1xuICB9IGVsc2Uge1xuICAgIF9kZWJ1Z0Z1bmMoKShcIkV4Y2VwdGlvbiBmcm9tIERlcHMgXCIgKyBmcm9tICsgXCIgZnVuY3Rpb246XCIsXG4gICAgICAgICAgICAgICAgIGUuc3RhY2sgfHwgZS5tZXNzYWdlKTtcbiAgfVxufTtcblxuLy8gVGFrZXMgYSBmdW5jdGlvbiBgZmAsIGFuZCB3cmFwcyBpdCBpbiBhIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZGBcbi8vIGJsb2NrIGlmIHdlIGFyZSBydW5uaW5nIG9uIHRoZSBzZXJ2ZXIuIE9uIHRoZSBjbGllbnQsIHJldHVybnMgdGhlXG4vLyBvcmlnaW5hbCBmdW5jdGlvbiAoc2luY2UgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYCBpcyBhXG4vLyBuby1vcCkuIFRoaXMgaGFzIHRoZSBiZW5lZml0IG9mIG5vdCBhZGRpbmcgYW4gdW5uZWNlc3Nhcnkgc3RhY2tcbi8vIGZyYW1lIG9uIHRoZSBjbGllbnQuXG52YXIgd2l0aE5vWWllbGRzQWxsb3dlZCA9IGZ1bmN0aW9uIChmKSB7XG4gIGlmICgodHlwZW9mIE1ldGVvciA9PT0gJ3VuZGVmaW5lZCcpIHx8IE1ldGVvci5pc0NsaWVudCkge1xuICAgIHJldHVybiBmO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZi5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH1cbn07XG5cbnZhciBuZXh0SWQgPSAxO1xuLy8gY29tcHV0YXRpb25zIHdob3NlIGNhbGxiYWNrcyB3ZSBzaG91bGQgY2FsbCBhdCBmbHVzaCB0aW1lXG52YXIgcGVuZGluZ0NvbXB1dGF0aW9ucyA9IFtdO1xuLy8gYHRydWVgIGlmIGEgRGVwcy5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBEZXBzLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBEZXBzLmZsdXNoIG5vd1xudmFyIGluRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgY29tcHV0aW5nIGEgY29tcHV0YXRpb24gbm93LCBlaXRoZXIgZmlyc3QgdGltZVxuLy8gb3IgcmVjb21wdXRlLiAgVGhpcyBtYXRjaGVzIERlcHMuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBEZXBzLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBEZXBzLmZsdXNoIHRoYXQgd2UgYXJlIGluLiBXaGVuIHNldCwgdGhyb3cgcmF0aGVyIHRoYW4gbG9nIHRoZVxuLy8gZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQgd2hpbGUgZmx1c2hpbmcuIEJlZm9yZSB0aHJvd2luZyB0aGUgZXJyb3IsXG4vLyBmaW5pc2ggZmx1c2hpbmcgKGZyb20gYSBmaW5hbGx5IGJsb2NrKSwgbG9nZ2luZyBhbnkgc3Vic2VxdWVudFxuLy8gZXJyb3JzLlxudmFyIHRocm93Rmlyc3RFcnJvciA9IGZhbHNlO1xuXG52YXIgYWZ0ZXJGbHVzaENhbGxiYWNrcyA9IFtdO1xuXG52YXIgcmVxdWlyZUZsdXNoID0gZnVuY3Rpb24gKCkge1xuICBpZiAoISB3aWxsRmx1c2gpIHtcbiAgICBzZXRUaW1lb3V0KERlcHMuZmx1c2gsIDApO1xuICAgIHdpbGxGbHVzaCA9IHRydWU7XG4gIH1cbn07XG5cbi8vIERlcHMuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfY29tcHV0YXRpb25cbi8vXG5EZXBzLkNvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGYsIHBhcmVudCwgY3R4KSB7XG4gIGlmICghIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uKVxuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwiRGVwcy5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyBwcml2YXRlOyB1c2UgRGVwcy5hdXRvcnVuXCIpO1xuICBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG4gIHZhciBzZWxmID0gdGhpcztcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wcGVkXG4gIHNlbGYuc3RvcHBlZCA9IGZhbHNlO1xuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVkXG4gIHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9maXJzdHJ1blxuICBzZWxmLmZpcnN0UnVuID0gdHJ1ZTtcblxuICBzZWxmLl9pZCA9IG5leHRJZCsrO1xuICBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcbiAgLy8gdGhlIHBsYW4gaXMgYXQgc29tZSBwb2ludCB0byB1c2UgdGhlIHBhcmVudCByZWxhdGlvblxuICAvLyB0byBjb25zdHJhaW4gdGhlIG9yZGVyIHRoYXQgY29tcHV0YXRpb25zIGFyZSBwcm9jZXNzZWRcbiAgc2VsZi5fcGFyZW50ID0gcGFyZW50O1xuICBzZWxmLl9mdW5jID0gZjtcbiAgc2VsZi5fY29udGV4dCA9IGN0eCB8fCB0aGlzO1xuICBzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXG4gIHZhciBlcnJvcmVkID0gdHJ1ZTtcbiAgdHJ5IHtcbiAgICBzZWxmLl9jb21wdXRlKCk7XG4gICAgZXJyb3JlZCA9IGZhbHNlO1xuICB9IGZpbmFsbHkge1xuICAgIHNlbGYuZmlyc3RSdW4gPSBmYWxzZTtcbiAgICBpZiAoZXJyb3JlZClcbiAgICAgIHNlbGYuc3RvcCgpO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9vbmludmFsaWRhdGVcbkRlcHMuQ29tcHV0YXRpb24ucHJvdG90eXBlLm9uSW52YWxpZGF0ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvbkludmFsaWRhdGUgcmVxdWlyZXMgYSBmdW5jdGlvblwiKTtcblxuICBpZiAoc2VsZi5pbnZhbGlkYXRlZCkge1xuICAgIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuICAgICAgd2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBmLl9jb250ZXh0ID0gY3R4O1xuICAgIHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcy5wdXNoKGYpO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcbiAgICAvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG4gICAgLy8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG4gICAgaWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcbiAgICAgIHJlcXVpcmVGbHVzaCgpO1xuICAgICAgcGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuICAgIH1cblxuICAgIHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG4gICAgLy8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2VcbiAgICAvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuICAgIGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuICAgICAgRGVwcy5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChmLl9jb250ZXh0IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuICBpZiAoISB0aGlzLnN0b3BwZWQpIHtcbiAgICB0aGlzLnN0b3BwZWQgPSB0cnVlO1xuICAgIHRoaXMuaW52YWxpZGF0ZSgpO1xuICB9XG59O1xuXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cbiAgdmFyIHByZXZpb3VzID0gRGVwcy5jdXJyZW50Q29tcHV0YXRpb247XG4gIHNldEN1cnJlbnRDb21wdXRhdGlvbihzZWxmKTtcbiAgdmFyIHByZXZpb3VzSW5Db21wdXRlID0gaW5Db21wdXRlO1xuICBpbkNvbXB1dGUgPSB0cnVlO1xuICB0cnkge1xuICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoc2VsZi5fZnVuYykuY2FsbChzZWxmLl9jb250ZXh0LCBzZWxmKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuICAgIGluQ29tcHV0ZSA9IGZhbHNlO1xuICB9XG59O1xuXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fcmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgc2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuICB0cnkge1xuICAgIHdoaWxlIChzZWxmLmludmFsaWRhdGVkICYmICEgc2VsZi5zdG9wcGVkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzZWxmLl9jb21wdXRlKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuICAgICAgfVxuICAgICAgLy8gSWYgX2NvbXB1dGUoKSBpbnZhbGlkYXRlZCB1cywgd2UgcnVuIGFnYWluIGltbWVkaWF0ZWx5LlxuICAgICAgLy8gQSBjb21wdXRhdGlvbiB0aGF0IGludmFsaWRhdGVzIGl0c2VsZiBpbmRlZmluaXRlbHkgaXMgYW5cbiAgICAgIC8vIGluZmluaXRlIGxvb3AsIG9mIGNvdXJzZS5cbiAgICAgIC8vXG4gICAgICAvLyBXZSBjb3VsZCBwdXQgYW4gaXRlcmF0aW9uIGNvdW50ZXIgaGVyZSBhbmQgY2F0Y2ggcnVuLWF3YXlcbiAgICAgIC8vIGxvb3BzLlxuICAgIH1cbiAgfSBmaW5hbGx5IHtcbiAgICBzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuICB9XG59O1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19kZXBlbmRlbmN5XG4vL1xuRGVwcy5EZXBlbmRlbmN5ID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLl9kZXBlbmRlbnRzQnlJZCA9IHt9O1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9kZXBlbmRcbi8vXG4vLyBBZGRzIGBjb21wdXRhdGlvbmAgdG8gdGhpcyBzZXQgaWYgaXQgaXMgbm90IGFscmVhZHlcbi8vIHByZXNlbnQuICBSZXR1cm5zIHRydWUgaWYgYGNvbXB1dGF0aW9uYCBpcyBhIG5ldyBtZW1iZXIgb2YgdGhlIHNldC5cbi8vIElmIG5vIGFyZ3VtZW50LCBkZWZhdWx0cyB0byBjdXJyZW50Q29tcHV0YXRpb24sIG9yIGRvZXMgbm90aGluZ1xuLy8gaWYgdGhlcmUgaXMgbm8gY3VycmVudENvbXB1dGF0aW9uLlxuRGVwcy5EZXBlbmRlbmN5LnByb3RvdHlwZS5kZXBlbmQgPSBmdW5jdGlvbiAoY29tcHV0YXRpb24pIHtcbiAgaWYgKCEgY29tcHV0YXRpb24pIHtcbiAgICBpZiAoISBEZXBzLmFjdGl2ZSlcbiAgICAgIHJldHVybiBmYWxzZTtcblxuICAgIGNvbXB1dGF0aW9uID0gRGVwcy5jdXJyZW50Q29tcHV0YXRpb247XG4gIH1cbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgaWQgPSBjb21wdXRhdGlvbi5faWQ7XG4gIGlmICghIChpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZCkpIHtcbiAgICBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0gPSBjb21wdXRhdGlvbjtcbiAgICBjb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgZGVsZXRlIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2NoYW5nZWRcbkRlcHMuRGVwZW5kZW5jeS5wcm90b3R5cGUuY2hhbmdlZCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBmb3IgKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcbiAgICBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0uaW52YWxpZGF0ZSgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9oYXNkZXBlbmRlbnRzXG5EZXBzLkRlcGVuZGVuY3kucHJvdG90eXBlLmhhc0RlcGVuZGVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgZm9yKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcbiAgICByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19mbHVzaFxuRGVwcy5mbHVzaCA9IGZ1bmN0aW9uIChfb3B0cykge1xuICAvLyBYWFggV2hhdCBwYXJ0IG9mIHRoZSBjb21tZW50IGJlbG93IGlzIHN0aWxsIHRydWU/IChXZSBubyBsb25nZXJcbiAgLy8gaGF2ZSBTcGFyaylcbiAgLy9cbiAgLy8gTmVzdGVkIGZsdXNoIGNvdWxkIHBsYXVzaWJseSBoYXBwZW4gaWYsIHNheSwgYSBmbHVzaCBjYXVzZXNcbiAgLy8gRE9NIG11dGF0aW9uLCB3aGljaCBjYXVzZXMgYSBcImJsdXJcIiBldmVudCwgd2hpY2ggcnVucyBhblxuICAvLyBhcHAgZXZlbnQgaGFuZGxlciB0aGF0IGNhbGxzIERlcHMuZmx1c2guICBBdCB0aGUgbW9tZW50XG4gIC8vIFNwYXJrIGJsb2NrcyBldmVudCBoYW5kbGVycyBkdXJpbmcgRE9NIG11dGF0aW9uIGFueXdheSxcbiAgLy8gYmVjYXVzZSB0aGUgTGl2ZVJhbmdlIHRyZWUgaXNuJ3QgdmFsaWQuICBBbmQgd2UgZG9uJ3QgaGF2ZVxuICAvLyBhbnkgdXNlZnVsIG5vdGlvbiBvZiBhIG5lc3RlZCBmbHVzaC5cbiAgLy9cbiAgLy8gaHR0cHM6Ly9hcHAuYXNhbmEuY29tLzAvMTU5OTA4MzMwMjQ0LzM4NTEzODIzMzg1NlxuICBpZiAoaW5GbHVzaClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBjYWxsIERlcHMuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cbiAgaWYgKGluQ29tcHV0ZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgRGVwcy5hdXRvcnVuXCIpO1xuXG4gIGluRmx1c2ggPSB0cnVlO1xuICB3aWxsRmx1c2ggPSB0cnVlO1xuICB0aHJvd0ZpcnN0RXJyb3IgPSAhISAoX29wdHMgJiYgX29wdHMuX3Rocm93Rmlyc3RFcnJvcik7XG5cbiAgdmFyIGZpbmlzaGVkVHJ5ID0gZmFsc2U7XG4gIHRyeSB7XG4gICAgd2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8XG4gICAgICAgICAgIGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cbiAgICAgIC8vIHJlY29tcHV0ZSBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnNcbiAgICAgIHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCkge1xuICAgICAgICB2YXIgY29tcCA9IHBlbmRpbmdDb21wdXRhdGlvbnMuc2hpZnQoKTtcbiAgICAgICAgY29tcC5fcmVjb21wdXRlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuICAgICAgICAvLyBjYWxsIG9uZSBhZnRlckZsdXNoIGNhbGxiYWNrLCB3aGljaCBtYXlcbiAgICAgICAgLy8gaW52YWxpZGF0ZSBtb3JlIGNvbXB1dGF0aW9uc1xuICAgICAgICB2YXIgZnVuYyA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBmdW5jLmNhbGwoZnVuYy5fY29udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBfdGhyb3dPckxvZyhcImFmdGVyRmx1c2ggZnVuY3Rpb25cIiwgZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgZmluaXNoZWRUcnkgPSB0cnVlO1xuICB9IGZpbmFsbHkge1xuICAgIGlmICghIGZpbmlzaGVkVHJ5KSB7XG4gICAgICAvLyB3ZSdyZSBlcnJvcmluZ1xuICAgICAgaW5GbHVzaCA9IGZhbHNlOyAvLyBuZWVkZWQgYmVmb3JlIGNhbGxpbmcgYERlcHMuZmx1c2goKWAgYWdhaW5cbiAgICAgIERlcHMuZmx1c2goe190aHJvd0ZpcnN0RXJyb3I6IGZhbHNlfSk7IC8vIGZpbmlzaCBmbHVzaGluZ1xuICAgIH1cbiAgICB3aWxsRmx1c2ggPSBmYWxzZTtcbiAgICBpbkZsdXNoID0gZmFsc2U7XG4gIH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfYXV0b3J1blxuLy9cbi8vIFJ1biBmKCkuIFJlY29yZCBpdHMgZGVwZW5kZW5jaWVzLiBSZXJ1biBpdCB3aGVuZXZlciB0aGVcbi8vIGRlcGVuZGVuY2llcyBjaGFuZ2UuXG4vL1xuLy8gUmV0dXJucyBhIG5ldyBDb21wdXRhdGlvbiwgd2hpY2ggaXMgYWxzbyBwYXNzZWQgdG8gZi5cbi8vXG4vLyBMaW5rcyB0aGUgY29tcHV0YXRpb24gdG8gdGhlIGN1cnJlbnQgY29tcHV0YXRpb25cbi8vIHNvIHRoYXQgaXQgaXMgc3RvcHBlZCBpZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZC5cbkRlcHMuYXV0b3J1biA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcbiAgaWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBFcnJvcignRGVwcy5hdXRvcnVuIHJlcXVpcmVzIGEgZnVuY3Rpb24gYXJndW1lbnQnKTtcblxuICBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IHRydWU7XG4gIHZhciBjID0gbmV3IERlcHMuQ29tcHV0YXRpb24oZiwgRGVwcy5jdXJyZW50Q29tcHV0YXRpb24sIGN0eCk7XG5cbiAgaWYgKERlcHMuYWN0aXZlKVxuICAgIERlcHMub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgIGMuc3RvcCgpO1xuICAgIH0pO1xuXG4gIHJldHVybiBjO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19ub25yZWFjdGl2ZVxuLy9cbi8vIFJ1biBgZmAgd2l0aCBubyBjdXJyZW50IGNvbXB1dGF0aW9uLCByZXR1cm5pbmcgdGhlIHJldHVybiB2YWx1ZVxuLy8gb2YgYGZgLiAgVXNlZCB0byB0dXJuIG9mZiByZWFjdGl2aXR5IGZvciB0aGUgZHVyYXRpb24gb2YgYGZgLFxuLy8gc28gdGhhdCByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYWNjZXNzZWQgYnkgYGZgIHdpbGwgbm90IHJlc3VsdCBpbiBhbnlcbi8vIGNvbXB1dGF0aW9ucyBiZWluZyBpbnZhbGlkYXRlZC5cbkRlcHMubm9ucmVhY3RpdmUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIHZhciBwcmV2aW91cyA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICBzZXRDdXJyZW50Q29tcHV0YXRpb24obnVsbCk7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGYuY2FsbChjdHgpO1xuICB9IGZpbmFsbHkge1xuICAgIHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG4gIH1cbn07XG5cbi8vIHNpbWlsYXIgdG8gbm9ucmVhY3RpdmUgYnV0IHJldHVybnMgYSBmdW5jdGlvbiBpbnN0ZWFkIG9mXG4vLyBleGVjdHVpbmcgZm4gaW1tZWRpYXRlbHkuIHJlYWxseSBqdXN0IHNvbWUgc3VnYXJcbkRlcHMubm9ucmVhY3RhYmxlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIERlcHMubm9ucmVhY3RpdmUoZiwgY3R4IHx8IHRoaXMpO1xuICB9XG59XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfb25pbnZhbGlkYXRlXG5EZXBzLm9uSW52YWxpZGF0ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcbiAgaWYgKCEgRGVwcy5hY3RpdmUpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiRGVwcy5vbkludmFsaWRhdGUgcmVxdWlyZXMgYSBjdXJyZW50Q29tcHV0YXRpb25cIik7XG5cbiAgRGVwcy5jdXJyZW50Q29tcHV0YXRpb24ub25JbnZhbGlkYXRlKGYsIGN0eCk7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2FmdGVyZmx1c2hcbkRlcHMuYWZ0ZXJGbHVzaCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcbiAgZi5fY29udGV4dCA9IGN0eDtcbiAgYWZ0ZXJGbHVzaENhbGxiYWNrcy5wdXNoKGYpO1xuICByZXF1aXJlRmx1c2goKTtcbn07IiwidmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG4vLyBCYWNrYm9uZS5FdmVudHNcbi8vIC0tLS0tLS0tLS0tLS0tLVxuXG4vLyBBIG1vZHVsZSB0aGF0IGNhbiBiZSBtaXhlZCBpbiB0byAqYW55IG9iamVjdCogaW4gb3JkZXIgdG8gcHJvdmlkZSBpdCB3aXRoXG4vLyBjdXN0b20gZXZlbnRzLiBZb3UgbWF5IGJpbmQgd2l0aCBgb25gIG9yIHJlbW92ZSB3aXRoIGBvZmZgIGNhbGxiYWNrXG4vLyBmdW5jdGlvbnMgdG8gYW4gZXZlbnQ7IGB0cmlnZ2VyYC1pbmcgYW4gZXZlbnQgZmlyZXMgYWxsIGNhbGxiYWNrcyBpblxuLy8gc3VjY2Vzc2lvbi5cbi8vXG4vLyAgICAgdmFyIG9iamVjdCA9IHt9O1xuLy8gICAgIHV0aWwuZXh0ZW5kKG9iamVjdCwgQmFja2JvbmUuRXZlbnRzKTtcbi8vICAgICBvYmplY3Qub24oJ2V4cGFuZCcsIGZ1bmN0aW9uKCl7IGFsZXJ0KCdleHBhbmRlZCcpOyB9KTtcbi8vICAgICBvYmplY3QudHJpZ2dlcignZXhwYW5kJyk7XG4vL1xudmFyIEV2ZW50cyA9IG1vZHVsZS5leHBvcnRzID0ge1xuXG5cdC8vIEJpbmQgYW4gZXZlbnQgdG8gYSBgY2FsbGJhY2tgIGZ1bmN0aW9uLiBQYXNzaW5nIGBcImFsbFwiYCB3aWxsIGJpbmRcblx0Ly8gdGhlIGNhbGxiYWNrIHRvIGFsbCBldmVudHMgZmlyZWQuXG5cdG9uOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICdvbicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG5cdFx0dGhpcy5fZXZlbnRzIHx8ICh0aGlzLl9ldmVudHMgPSB7fSk7XG5cdFx0dmFyIGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSB8fCAodGhpcy5fZXZlbnRzW25hbWVdID0gW10pO1xuXHRcdGV2ZW50cy5wdXNoKHtjYWxsYmFjazogY2FsbGJhY2ssIGNvbnRleHQ6IGNvbnRleHQsIGN0eDogY29udGV4dCB8fCB0aGlzfSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gQmluZCBhbiBldmVudCB0byBvbmx5IGJlIHRyaWdnZXJlZCBhIHNpbmdsZSB0aW1lLiBBZnRlciB0aGUgZmlyc3QgdGltZVxuXHQvLyB0aGUgY2FsbGJhY2sgaXMgaW52b2tlZCwgaXQgd2lsbCBiZSByZW1vdmVkLlxuXHRvbmNlOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICdvbmNlJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0dmFyIGZuID0gb25jZShmdW5jdGlvbigpIHtcblx0XHRcdHNlbGYub2ZmKG5hbWUsIGZuKTtcblx0XHRcdGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0fSk7XG5cdFx0Zm4uX2NhbGxiYWNrID0gY2FsbGJhY2s7XG5cdFx0cmV0dXJuIHRoaXMub24obmFtZSwgZm4sIGNvbnRleHQpO1xuXHR9LFxuXG5cdC8vIFJlbW92ZSBvbmUgb3IgbWFueSBjYWxsYmFja3MuIElmIGBjb250ZXh0YCBpcyBudWxsLCByZW1vdmVzIGFsbFxuXHQvLyBjYWxsYmFja3Mgd2l0aCB0aGF0IGZ1bmN0aW9uLiBJZiBgY2FsbGJhY2tgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG5cdC8vIGNhbGxiYWNrcyBmb3IgdGhlIGV2ZW50LiBJZiBgbmFtZWAgaXMgbnVsbCwgcmVtb3ZlcyBhbGwgYm91bmRcblx0Ly8gY2FsbGJhY2tzIGZvciBhbGwgZXZlbnRzLlxuXHRvZmY6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0dmFyIHJldGFpbiwgZXYsIGV2ZW50cywgbmFtZXMsIGksIGwsIGosIGs7XG5cdFx0aWYgKCF0aGlzLl9ldmVudHMgfHwgIWV2ZW50c0FwaSh0aGlzLCAnb2ZmJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkpIHJldHVybiB0aGlzO1xuXHRcdGlmICghbmFtZSAmJiAhY2FsbGJhY2sgJiYgIWNvbnRleHQpIHtcblx0XHRcdHRoaXMuX2V2ZW50cyA9IHZvaWQgMDtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0XHRuYW1lcyA9IG5hbWUgPyBbbmFtZV0gOiBPYmplY3Qua2V5cyh0aGlzLl9ldmVudHMpO1xuXHRcdGZvciAoaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdG5hbWUgPSBuYW1lc1tpXTtcblx0XHRcdGlmIChldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV0pIHtcblx0XHRcdFx0dGhpcy5fZXZlbnRzW25hbWVdID0gcmV0YWluID0gW107XG5cdFx0XHRcdGlmIChjYWxsYmFjayB8fCBjb250ZXh0KSB7XG5cdFx0XHRcdFx0Zm9yIChqID0gMCwgayA9IGV2ZW50cy5sZW5ndGg7IGogPCBrOyBqKyspIHtcblx0XHRcdFx0XHRcdGV2ID0gZXZlbnRzW2pdO1xuXHRcdFx0XHRcdFx0aWYgKChjYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2sgJiYgY2FsbGJhY2sgIT09IGV2LmNhbGxiYWNrLl9jYWxsYmFjaykgfHxcblx0XHRcdFx0XHRcdFx0XHQoY29udGV4dCAmJiBjb250ZXh0ICE9PSBldi5jb250ZXh0KSkge1xuXHRcdFx0XHRcdFx0XHRyZXRhaW4ucHVzaChldik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcmV0YWluLmxlbmd0aCkgZGVsZXRlIHRoaXMuX2V2ZW50c1tuYW1lXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBUcmlnZ2VyIG9uZSBvciBtYW55IGV2ZW50cywgZmlyaW5nIGFsbCBib3VuZCBjYWxsYmFja3MuIENhbGxiYWNrcyBhcmVcblx0Ly8gcGFzc2VkIHRoZSBzYW1lIGFyZ3VtZW50cyBhcyBgdHJpZ2dlcmAgaXMsIGFwYXJ0IGZyb20gdGhlIGV2ZW50IG5hbWVcblx0Ly8gKHVubGVzcyB5b3UncmUgbGlzdGVuaW5nIG9uIGBcImFsbFwiYCwgd2hpY2ggd2lsbCBjYXVzZSB5b3VyIGNhbGxiYWNrIHRvXG5cdC8vIHJlY2VpdmUgdGhlIHRydWUgbmFtZSBvZiB0aGUgZXZlbnQgYXMgdGhlIGZpcnN0IGFyZ3VtZW50KS5cblx0dHJpZ2dlcjogZnVuY3Rpb24obmFtZSkge1xuXHRcdGlmICghdGhpcy5fZXZlbnRzKSByZXR1cm4gdGhpcztcblx0XHR2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ3RyaWdnZXInLCBuYW1lLCBhcmdzKSkgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXTtcblx0XHR2YXIgYWxsRXZlbnRzID0gdGhpcy5fZXZlbnRzLmFsbDtcblx0XHRpZiAoZXZlbnRzKSB0cmlnZ2VyRXZlbnRzKGV2ZW50cywgYXJncyk7XG5cdFx0aWYgKGFsbEV2ZW50cykgdHJpZ2dlckV2ZW50cyhhbGxFdmVudHMsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gVGVsbCB0aGlzIG9iamVjdCB0byBzdG9wIGxpc3RlbmluZyB0byBlaXRoZXIgc3BlY2lmaWMgZXZlbnRzIC4uLiBvclxuXHQvLyB0byBldmVyeSBvYmplY3QgaXQncyBjdXJyZW50bHkgbGlzdGVuaW5nIHRvLlxuXHRzdG9wTGlzdGVuaW5nOiBmdW5jdGlvbihvYmosIG5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0dmFyIGxpc3RlbmluZ1RvID0gdGhpcy5fbGlzdGVuaW5nVG87XG5cdFx0aWYgKCFsaXN0ZW5pbmdUbykgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIHJlbW92ZSA9ICFuYW1lICYmICFjYWxsYmFjaztcblx0XHRpZiAoIWNhbGxiYWNrICYmIHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JykgY2FsbGJhY2sgPSB0aGlzO1xuXHRcdGlmIChvYmopIChsaXN0ZW5pbmdUbyA9IHt9KVtvYmouX2xpc3RlbklkXSA9IG9iajtcblx0XHRmb3IgKHZhciBpZCBpbiBsaXN0ZW5pbmdUbykge1xuXHRcdFx0b2JqID0gbGlzdGVuaW5nVG9baWRdO1xuXHRcdFx0b2JqLm9mZihuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG5cdFx0XHRpZiAocmVtb3ZlIHx8IGlzRW1wdHkob2JqLl9ldmVudHMpKSBkZWxldGUgdGhpcy5fbGlzdGVuaW5nVG9baWRdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG59O1xuXG4vLyBSZWd1bGFyIGV4cHJlc3Npb24gdXNlZCB0byBzcGxpdCBldmVudCBzdHJpbmdzLlxudmFyIGV2ZW50U3BsaXR0ZXIgPSAvXFxzKy87XG5cbi8vIEltcGxlbWVudCBmYW5jeSBmZWF0dXJlcyBvZiB0aGUgRXZlbnRzIEFQSSBzdWNoIGFzIG11bHRpcGxlIGV2ZW50XG4vLyBuYW1lcyBgXCJjaGFuZ2UgYmx1clwiYCBhbmQgalF1ZXJ5LXN0eWxlIGV2ZW50IG1hcHMgYHtjaGFuZ2U6IGFjdGlvbn1gXG4vLyBpbiB0ZXJtcyBvZiB0aGUgZXhpc3RpbmcgQVBJLlxudmFyIGV2ZW50c0FwaSA9IGZ1bmN0aW9uKG9iaiwgYWN0aW9uLCBuYW1lLCByZXN0KSB7XG5cdGlmICghbmFtZSkgcmV0dXJuIHRydWU7XG5cblx0Ly8gSGFuZGxlIGV2ZW50IG1hcHMuXG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gbmFtZSkge1xuXHRcdFx0b2JqW2FjdGlvbl0uYXBwbHkob2JqLCBba2V5LCBuYW1lW2tleV1dLmNvbmNhdChyZXN0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIEhhbmRsZSBzcGFjZSBzZXBhcmF0ZWQgZXZlbnQgbmFtZXMuXG5cdGlmIChldmVudFNwbGl0dGVyLnRlc3QobmFtZSkpIHtcblx0XHR2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KGV2ZW50U3BsaXR0ZXIpO1xuXHRcdGZvciAodmFyIGkgPSAwLCBsID0gbmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRvYmpbYWN0aW9uXS5hcHBseShvYmosIFtuYW1lc1tpXV0uY29uY2F0KHJlc3QpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGRpZmZpY3VsdC10by1iZWxpZXZlLCBidXQgb3B0aW1pemVkIGludGVybmFsIGRpc3BhdGNoIGZ1bmN0aW9uIGZvclxuLy8gdHJpZ2dlcmluZyBldmVudHMuIFRyaWVzIHRvIGtlZXAgdGhlIHVzdWFsIGNhc2VzIHNwZWVkeSAobW9zdCBpbnRlcm5hbFxuLy8gQmFja2JvbmUgZXZlbnRzIGhhdmUgMyBhcmd1bWVudHMpLlxudmFyIHRyaWdnZXJFdmVudHMgPSBmdW5jdGlvbihldmVudHMsIGFyZ3MpIHtcblx0dmFyIGV2LCBpID0gLTEsIGwgPSBldmVudHMubGVuZ3RoLCBhMSA9IGFyZ3NbMF0sIGEyID0gYXJnc1sxXSwgYTMgPSBhcmdzWzJdO1xuXHRzd2l0Y2ggKGFyZ3MubGVuZ3RoKSB7XG5cdFx0Y2FzZSAwOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCk7IHJldHVybjtcblx0XHRjYXNlIDE6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSk7IHJldHVybjtcblx0XHRjYXNlIDI6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSwgYTIpOyByZXR1cm47XG5cdFx0Y2FzZSAzOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyLCBhMyk7IHJldHVybjtcblx0XHRkZWZhdWx0OiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5hcHBseShldi5jdHgsIGFyZ3MpOyByZXR1cm47XG5cdH1cbn07XG5cbnZhciBsaXN0ZW5NZXRob2RzID0ge2xpc3RlblRvOiAnb24nLCBsaXN0ZW5Ub09uY2U6ICdvbmNlJ307XG5cbi8vIEludmVyc2lvbi1vZi1jb250cm9sIHZlcnNpb25zIG9mIGBvbmAgYW5kIGBvbmNlYC4gVGVsbCAqdGhpcyogb2JqZWN0IHRvXG4vLyBsaXN0ZW4gdG8gYW4gZXZlbnQgaW4gYW5vdGhlciBvYmplY3QgLi4uIGtlZXBpbmcgdHJhY2sgb2Ygd2hhdCBpdCdzXG4vLyBsaXN0ZW5pbmcgdG8uXG51dGlsLmVhY2gobGlzdGVuTWV0aG9kcywgZnVuY3Rpb24oaW1wbGVtZW50YXRpb24sIG1ldGhvZCkge1xuXHRFdmVudHNbbWV0aG9kXSA9IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcblx0XHR2YXIgbGlzdGVuaW5nVG8gPSB0aGlzLl9saXN0ZW5pbmdUbyB8fCAodGhpcy5fbGlzdGVuaW5nVG8gPSB7fSk7XG5cdFx0dmFyIGlkID0gb2JqLl9saXN0ZW5JZCB8fCAob2JqLl9saXN0ZW5JZCA9IHV0aWwudW5pcXVlSWQoJ2wnKSk7XG5cdFx0bGlzdGVuaW5nVG9baWRdID0gb2JqO1xuXHRcdGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG5cdFx0b2JqW2ltcGxlbWVudGF0aW9uXShuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG59KTtcblxuLy8gQWxpYXNlcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG5FdmVudHMuYmluZCAgID0gRXZlbnRzLm9uO1xuRXZlbnRzLnVuYmluZCA9IEV2ZW50cy5vZmY7XG5cbmZ1bmN0aW9uIGlzRW1wdHkob2JqKSB7XG5cdGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHRydWU7XG5cdGlmIChBcnJheS5pc0FycmF5KG9iaikgfHwgdHlwZW9mIG9iaiA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIG9iai5sZW5ndGggPT09IDA7XG5cdGZvciAodmFyIGtleSBpbiBvYmopIGlmICh1dGlsLmhhcyhvYmosIGtleSkpIHJldHVybiBmYWxzZTtcblx0cmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIG9uY2UoZnVuYykge1xuXHR2YXIgcmFuID0gZmFsc2UsIG1lbW87XG5cdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHRpZiAocmFuKSByZXR1cm4gbWVtbztcblx0XHRyYW4gPSB0cnVlO1xuXHRcdG1lbW8gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0ZnVuYyA9IG51bGw7XG5cdFx0cmV0dXJuIG1lbW87XG5cdH1cbn0iLCJ2YXIgQmluZGluZyA9IHJlcXVpcmUoXCIuL2JpbmRpbmdcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEJpbmRpbmcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0QmluZGluZy5jYWxsKHRoaXMpO1xuXHRcdHRoaXMubm9kZXMgPSBbXTtcblx0XHR0aGlzLnNldFZhbHVlKHZhbHVlKTtcblx0fSxcblxuXHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkhUTUwgYmluZGluZ3MgY2FuJ3QgaGF2ZSBjaGlsZHJlbi5cIik7XG5cdH0sXG5cblx0dXBkYXRlTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBwYXJlbnROb2RlID0gdGhpcy5wYXJlbnROb2RlLFxuXHRcdFx0YmVmb3JlTm9kZSwgbm9kZSwgaTtcblxuXHRcdC8vIHBsYWNlIHRoZSBub2RlcyBpbiB0aGUgZG9tXG5cdFx0aWYgKHBhcmVudE5vZGUgIT0gbnVsbCkge1xuXHRcdFx0YmVmb3JlTm9kZSA9IHRoaXMubmV4dFNpYmxpbmdOb2RlO1xuXG5cdFx0XHRmb3IgKGkgPSB0aGlzLm5vZGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdG5vZGUgPSB0aGlzLm5vZGVzW2ldO1xuXG5cdFx0XHRcdGlmICghdXRpbC5pc05vZGVBdERPTVBvc2l0aW9uKG5vZGUsIHBhcmVudE5vZGUsIGJlZm9yZU5vZGUpKSB7XG5cdFx0XHRcdFx0cGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobm9kZSwgYmVmb3JlTm9kZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRiZWZvcmVOb2RlID0gbm9kZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBvciB0YWtlIHRoZW0gb3V0XG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLnJlbW92ZU5vZGVzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmlnZ2VyKFwidXBkYXRlXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZU5vZGVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbm9kZSwgaTtcblxuXHRcdGZvciAoaSA9IDA7IGkgPCB0aGlzLm5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRub2RlID0gdGhpcy5ub2Rlc1tpXTtcblx0XHRcdGlmIChub2RlLnBhcmVudE5vZGUgIT0gbnVsbCkgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHNldFZhbHVlOiBmdW5jdGlvbih2YWwpIHtcblx0XHR2YWwgPSB2YWwgIT0gbnVsbCA/IHZhbC50b1N0cmluZygpIDogXCJcIjtcblx0XHRpZiAodmFsID09PSB0aGlzLnZhbHVlKSByZXR1cm4gdGhpcztcblxuXHRcdHRoaXMucmVtb3ZlTm9kZXMoKTtcblx0XHR0aGlzLnZhbHVlID0gdmFsO1xuXG5cdFx0Ly8gY29udmVydCBodG1sIGludG8gRE9NIG5vZGVzXG5cdFx0ZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRkaXYuaW5uZXJIVE1MID0gdmFsO1xuXHRcdHRoaXMubm9kZXMgPSB1dGlsLnRvQXJyYXkoZGl2LmNoaWxkTm9kZXMpO1xuXG5cdFx0dGhpcy51cGRhdGVOb2RlcygpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHRvTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGVzLnNsaWNlKDApO1xuXHR9LFxuXG5cdGZpcnN0Tm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZXNbMF0gfHwgbnVsbDtcblx0fSxcblxuXHRmaW5kOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBrLCBub2RlLCByZXN1bHQ7XG5cblx0XHRmb3IgKGsgaW4gdGhpcy5ub2Rlcykge1xuXHRcdFx0bm9kZSA9IHRoaXMubm9kZXNba107XG5cdFx0XHRpZiAobm9kZS5ub2RlVHlwZSAhPT0gMSkgY29udGludWU7XG5cblx0XHRcdGlmICh1dGlsLm1hdGNoZXNTZWxlY3Rvcihub2RlLCBzZWxlY3RvcikpIHJldHVybiBub2RlO1xuXHRcdFx0cmVzdWx0ID0gbm9kZS5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0XHRcdGlmIChyZXN1bHQgIT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBrLCBub2RlLCBlbHMgPSBbXTtcblxuXHRcdGZvciAoayBpbiB0aGlzLm5vZGVzKSB7XG5cdFx0XHRub2RlID0gdGhpcy5ub2Rlc1trXTtcblx0XHRcdGlmIChub2RlLm5vZGVUeXBlICE9PSAxKSBjb250aW51ZTtcblxuXHRcdFx0aWYgKHV0aWwubWF0Y2hlc1NlbGVjdG9yKG5vZGUsIHNlbGVjdG9yKSkgbWF0Y2hlcy5wdXNoKG5vZGUpO1xuXHRcdFx0ZWxzLnB1c2guYXBwbHkoZWxzLCB1dGlsLnRvQXJyYXkobm9kZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbHM7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGVzLm1hcChmdW5jdGlvbihub2RlKSB7XG5cdFx0XHRyZXR1cm4gbm9kZS5ub2RlVHlwZSA9PT0gMSA/IG5vZGUub3V0ZXJIVE1MIDogbm9kZS5ub2RlVmFsdWU7XG5cdFx0fSkuam9pbihcIlwiKTtcblx0fVxufSk7XG4iLCJ2YXIgQmluZGluZyA9IHJlcXVpcmUoXCIuL2JpbmRpbmdcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG4vLyBleHBvcnRcbnZhciBUZW1wbGUgPVxubW9kdWxlLmV4cG9ydHMgPSBCaW5kaW5nO1xuXG4vLyBzdGF0aWMgcHJvcGVydGllcy9tZXRob2RzXG5UZW1wbGUuVkVSU0lPTiA9IFwiMC4zLjFcIjtcblRlbXBsZS51dGlsID0gdXRpbDtcblRlbXBsZS5FdmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIik7XG5cbi8vIGRlcHMgc2V0dXBcbnZhciBEZXBzID0gVGVtcGxlLkRlcHMgPSByZXF1aXJlKFwiLi9kZXBzXCIpO1xuVGVtcGxlLmF1dG9ydW4gPSBEZXBzLmF1dG9ydW47XG5UZW1wbGUuRGVwZW5kZW5jeSA9IERlcHMuRGVwZW5kZW5jeTsiLCJ2YXIgQmluZGluZyA9IHJlcXVpcmUoXCIuL2JpbmRpbmdcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG52YXIgTm9kZSA9XG5leHBvcnRzLk5vZGUgPSBCaW5kaW5nLmV4dGVuZCh7XG5cdHVwZGF0ZU5vZGVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgcGFyZW50Tm9kZSA9IHRoaXMucGFyZW50Tm9kZSxcblx0XHRcdGJlZm9yZU5vZGUgPSB0aGlzLm5leHRTaWJsaW5nTm9kZTtcblxuXHRcdC8vIHBsYWNlIHRoZSBub2RlIGluIHRoZSBkb21cblx0XHRpZiAocGFyZW50Tm9kZSAhPSBudWxsICYmICF1dGlsLmlzTm9kZUF0RE9NUG9zaXRpb24odGhpcy5ub2RlLCBwYXJlbnROb2RlLCBiZWZvcmVOb2RlKSkge1xuXHRcdFx0cGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUodGhpcy5ub2RlLCBiZWZvcmVOb2RlKTtcblx0XHR9XG5cblx0XHQvLyBvciB0YWtlIGl0IG91dFxuXHRcdGVsc2UgaWYgKHBhcmVudE5vZGUgPT0gbnVsbCAmJiB0aGlzLm5vZGUucGFyZW50Tm9kZSAhPSBudWxsKSB7XG5cdFx0XHR0aGlzLm5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLm5vZGUpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJpZ2dlcihcInVwZGF0ZVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHR0b05vZGVzOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gWyB0aGlzLm5vZGUgXTtcblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGU7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oKSB7IHJldHVybiBudWxsOyB9LFxuXHRmaW5kQWxsOiBmdW5jdGlvbigpIHsgcmV0dXJuIFtdOyB9XG59KTtcblxudmFyIFRleHQgPVxuZXhwb3J0cy5UZXh0ID0gTm9kZS5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24obm9kZU9yVmFsdWUpIHtcblx0XHQvLyB0ZXh0IG5vZGVcblx0XHRpZiAobm9kZU9yVmFsdWUgaW5zdGFuY2VvZiB3aW5kb3cuTm9kZSAmJiBub2RlT3JWYWx1ZS5ub2RlVHlwZSA9PT0gMykge1xuXHRcdFx0dGhpcy5ub2RlID0gbm9kZU9yVmFsdWU7XG5cdFx0XHR0aGlzLnZhbHVlID0gbm9kZU9yVmFsdWUubm9kZVZhbHVlO1xuXHRcdH1cblxuXHRcdC8vIGFueXRoaW5nIGVsc2Vcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMubm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiXCIpO1xuXHRcdFx0dGhpcy5zZXRWYWx1ZShub2RlT3JWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0Tm9kZS5jYWxsKHRoaXMpO1xuXHR9LFxuXG5cdGluc2VydEJlZm9yZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVGV4dCBiaW5kaW5ncyBjYW4ndCBoYXZlIGNoaWxkcmVuLlwiKTtcblx0fSxcblxuXHRzZXRWYWx1ZTogZnVuY3Rpb24odmFsdWUpIHtcblx0XHR2YWx1ZSA9IHZhbHVlICE9IG51bGwgPyB2YWx1ZS50b1N0cmluZygpIDogXCJcIjtcblx0XHRpZiAodmFsdWUgIT09IHRoaXMubm9kZS5ub2RlVmFsdWUpIHRoaXMubm9kZS5ub2RlVmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUubm9kZVZhbHVlO1xuXHR9XG59KTtcblxudmFyIEVsZW1lbnQgPVxuZXhwb3J0cy5FbGVtZW50ID0gTm9kZS5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24obm9kZU9yVGFnTmFtZSkge1xuXHRcdHZhciBjaGlsZHJlbiA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xuXG5cdFx0Ly8gZWxlbWVudFxuXHRcdGlmIChub2RlT3JUYWdOYW1lIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUgJiYgbm9kZU9yVGFnTmFtZS5ub2RlVHlwZSA9PT0gMSkge1xuXHRcdFx0dGhpcy5ub2RlID0gbm9kZU9yVGFnTmFtZTtcblx0XHRcdHRoaXMudGFnbmFtZSA9IG5vZGVPclRhZ05hbWUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0XHQvLyBhZGQgY2hpbGQgbm9kZXMgYXMgZnVydGhlciBjaGlsZHJlblxuXHRcdFx0Ly8gbm90ZTogdGhpcyBtYXkgYWZmZWN0IHRoZSBvcmlnaW5hbCBub2RlJ3MgY2hpbGRyZW5cblx0XHRcdHdyYXBOb2RlKHV0aWwudG9BcnJheShub2RlT3JUYWdOYW1lLmNoaWxkTm9kZXMpKVxuXHRcdFx0XHQuZm9yRWFjaChmdW5jdGlvbihiKSB7IGNoaWxkcmVuLnB1c2goYik7IH0pO1xuXHRcdH1cblxuXHRcdC8vIHN0cmluZ1xuXHRcdGVsc2UgaWYgKHR5cGVvZiBub2RlT3JUYWdOYW1lID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHR0aGlzLnRhZ25hbWUgPSBub2RlT3JUYWdOYW1lO1xuXHRcdFx0dGhpcy5ub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChub2RlT3JUYWdOYW1lKTtcblx0XHR9XG5cblx0XHQvLyBvciBlcnJvclxuXHRcdGVsc2UgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgZWxlbWVudCB0YWcgbmFtZS5cIik7XG5cblx0XHROb2RlLmFwcGx5KHRoaXMsIGNoaWxkcmVuKTtcblx0fSxcblxuXHRnZXRBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLmdldEF0dHJpYnV0ZShuYW1lKTtcblx0fSxcblxuXHRzZXRBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0dGhpcy5ub2RlLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQXR0cmlidXRlOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dGhpcy5ub2RlLnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhdHRyOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KG5hbWUpICYmIHZhbHVlID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaChuYW1lLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMuYXR0cihuLCB2KTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdGhpcy5nZXRBdHRyaWJ1dGUobmFtZSk7XG5cdFx0ZWxzZSB0aGlzLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRwcm9wOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KG5hbWUpICYmIHZhbHVlID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaChuYW1lLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMucHJvcChuLCB2KTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdGhpcy5ub2RlW25hbWVdO1xuXHRcdGVsc2UgdGhpcy5ub2RlW25hbWVdID0gdmFsdWU7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRzdHlsZTogZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcblx0XHRpZiAodXRpbC5pc09iamVjdChuYW1lKSAmJiB2YWx1ZSA9PSBudWxsKSB7XG5cdFx0XHR1dGlsLmVhY2gobmFtZSwgZnVuY3Rpb24odiwgbikgeyB0aGlzLnN0eWxlKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiBnZXRDb21wdXRlZFN0eWxlKHRoaXMubm9kZSlbbmFtZV07XG5cdFx0ZWxzZSB0aGlzLm5vZGUuc3R5bGVbbmFtZV0gPSB2YWx1ZTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGhhc0NsYXNzOiBmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLmNsYXNzTGlzdC5jb250YWlucyhjbGFzc05hbWUpO1xuXHR9LFxuXG5cdGFkZENsYXNzOiBmdW5jdGlvbigpIHtcblx0XHR1dGlsLmZsYXR0ZW4odXRpbC50b0FycmF5KGFyZ3VtZW50cykpLmZvckVhY2goZnVuY3Rpb24oY2xhc3NOYW1lKSB7XG5cdFx0XHR0aGlzLm5vZGUuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQ2xhc3M6IGZ1bmN0aW9uKCkge1xuXHRcdHV0aWwuZmxhdHRlbih1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSkuZm9yRWFjaChmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRcdHRoaXMubm9kZS5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzTmFtZSk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhZGRFdmVudExpc3RlbmVyOiBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KHR5cGUpICYmIGxpc3RlbmVyID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaCh0eXBlLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihuLCB2KTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHR0aGlzLm5vZGUuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcblx0XHRpZiAodXRpbC5pc09iamVjdCh0eXBlKSAmJiBsaXN0ZW5lciA9PSBudWxsKSB7XG5cdFx0XHR1dGlsLmVhY2godHlwZSwgZnVuY3Rpb24odiwgbikgeyB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIobiwgdik7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0dGhpcy5ub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgbGlzdGVuZXIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0aWYgKHV0aWwubWF0Y2hlc1NlbGVjdG9yKHRoaXMubm9kZSwgc2VsZWN0b3IpKSByZXR1cm4gdGhpcy5ub2RlO1xuXHRcdHJldHVybiB0aGlzLm5vZGUucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgZWxzID0gW107XG5cdFx0aWYgKHV0aWwubWF0Y2hlc1NlbGVjdG9yKHRoaXMubm9kZSwgc2VsZWN0b3IpKSBlbHMucHVzaCh0aGlzLm5vZGUpO1xuXHRcdGVscy5wdXNoLmFwcGx5KGVscywgdXRpbC50b0FycmF5KHRoaXMubm9kZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSkpO1xuXHRcdHJldHVybiBlbHM7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUub3V0ZXJIVE1MO1xuXHR9XG59KTtcblxuLy8gZmFzdCBjb25zdHJ1Y3RvcnMgZm9yIHR5cGljYWwgRE9NIGVsZW1lbnQgdGFnbmFtZXNcbmV4cG9ydHMuRE9NID0ge307XG5cblsgLy8gSFRNTCB0YWduYW1lczsgdGhpcyBsaXN0IGlzIHRha2VuIGZyb20gRkIncyBSZWFjdFxuXG5cImFcIiwgXCJhYmJyXCIsIFwiYWRkcmVzc1wiLCBcImFyZWFcIiwgXCJhcnRpY2xlXCIsIFwiYXNpZGVcIiwgXCJhdWRpb1wiLCBcImJcIiwgXCJiYXNlXCIsIFwiYmRpXCIsXG5cImJkb1wiLCBcImJpZ1wiLCBcImJsb2NrcXVvdGVcIiwgXCJib2R5XCIsIFwiYnJcIiwgXCJidXR0b25cIiwgXCJjYW52YXNcIiwgXCJjYXB0aW9uXCIsIFwiY2l0ZVwiLFxuXCJjb2RlXCIsIFwiY29sXCIsIFwiY29sZ3JvdXBcIiwgXCJkYXRhXCIsIFwiZGF0YWxpc3RcIiwgXCJkZFwiLCBcImRlbFwiLCBcImRldGFpbHNcIiwgXCJkZm5cIixcblwiZGl2XCIsIFwiZGxcIiwgXCJkdFwiLCBcImVtXCIsIFwiZW1iZWRcIiwgXCJmaWVsZHNldFwiLCBcImZpZ2NhcHRpb25cIiwgXCJmaWd1cmVcIiwgXCJmb290ZXJcIixcblwiZm9ybVwiLCBcImgxXCIsIFwiaDJcIiwgXCJoM1wiLCBcImg0XCIsIFwiaDVcIiwgXCJoNlwiLCBcImhlYWRcIiwgXCJoZWFkZXJcIiwgXCJoclwiLCBcImh0bWxcIiwgXCJpXCIsXG5cImlmcmFtZVwiLCBcImltZ1wiLCBcImlucHV0XCIsIFwiaW5zXCIsIFwia2JkXCIsIFwia2V5Z2VuXCIsIFwibGFiZWxcIiwgXCJsZWdlbmRcIiwgXCJsaVwiLFxuXCJsaW5rXCIsIFwibWFpblwiLCBcIm1hcFwiLCBcIm1hcmtcIiwgXCJtZW51XCIsIFwibWVudWl0ZW1cIiwgXCJtZXRhXCIsIFwibWV0ZXJcIiwgXCJuYXZcIixcblwibm9zY3JpcHRcIiwgXCJvYmplY3RcIiwgXCJvbFwiLCBcIm9wdGdyb3VwXCIsIFwib3B0aW9uXCIsIFwib3V0cHV0XCIsIFwicFwiLCBcInBhcmFtXCIsIFwicHJlXCIsXG5cInByb2dyZXNzXCIsIFwicVwiLCBcInJwXCIsIFwicnRcIiwgXCJydWJ5XCIsIFwic1wiLCBcInNhbXBcIiwgXCJzY3JpcHRcIiwgXCJzZWN0aW9uXCIsIFwic2VsZWN0XCIsXG5cInNtYWxsXCIsIFwic291cmNlXCIsIFwic3BhblwiLCBcInN0cm9uZ1wiLCBcInN0eWxlXCIsIFwic3ViXCIsIFwic3VtbWFyeVwiLCBcInN1cFwiLCBcInRhYmxlXCIsXG5cInRib2R5XCIsIFwidGRcIiwgXCJ0ZXh0YXJlYVwiLCBcInRmb290XCIsIFwidGhcIiwgXCJ0aGVhZFwiLCBcInRpbWVcIiwgXCJ0aXRsZVwiLCBcInRyXCIsXG5cInRyYWNrXCIsIFwidVwiLCBcInVsXCIsIFwidmFyXCIsIFwidmlkZW9cIiwgXCJ3YnJcIlxuXG5dLmZvckVhY2goZnVuY3Rpb24odCkge1xuXHRleHBvcnRzLkRPTVt0XSA9IEVsZW1lbnQuZXh0ZW5kKHtcblx0XHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgYXJncyA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpO1xuXHRcdFx0YXJncy51bnNoaWZ0KHQpO1xuXHRcdFx0RWxlbWVudC5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHR9XG5cdH0pO1xufSk7XG5cbi8vIGNvbnZlcnRzIGRvbSBub2RlcyBpbnRvIGJpbmRpbmcgZXF1aXZhbGVudHNcbnZhciB3cmFwTm9kZSA9XG5leHBvcnRzLndyYXBOb2RlID0gZnVuY3Rpb24obm9kZSkge1xuXHRpZiAoQXJyYXkuaXNBcnJheShub2RlKSkge1xuXHRcdHJldHVybiBub2RlLm1hcCh3cmFwTm9kZSlcblx0XHRcdC5maWx0ZXIoZnVuY3Rpb24oYikgeyByZXR1cm4gYiAhPSBudWxsOyB9KTtcblx0fVxuXG5cdHN3aXRjaCAobm9kZS5ub2RlVHlwZSkge1xuXHRcdC8vIEVsZW1lbnRcblx0XHRjYXNlIDE6IHJldHVybiBuZXcgRWxlbWVudChub2RlKTtcblx0XHRcblx0XHQvLyBUZXh0IE5vZGVcblx0XHRjYXNlIDM6IHJldHVybiBuZXcgVGV4dChub2RlKTtcblxuXHRcdC8vIERvY3VtZW50IEZyYWdtZW50XG5cdFx0Y2FzZSAxMTpcblx0XHRcdHZhciBiaW5kaW5nID0gbmV3IEJpbmRpbmc7XG5cblx0XHRcdHdyYXBOb2RlKHV0aWwudG9BcnJheShub2RlLmNoaWxkTm9kZXMpKVxuXHRcdFx0XHQuZm9yRWFjaChiaW5kaW5nLmFwcGVuZENoaWxkLCBiaW5kaW5nKTtcblxuXHRcdFx0cmV0dXJuIGJpbmRpbmc7XG5cdH1cbn1cblxuLy8gY29udmVydHMgYSBzdHJpbmcgb2YgSFRNTCBpbnRvIGEgc2V0IG9mIHN0YXRpYyBiaW5kaW5nc1xuZXhwb3J0cy5wYXJzZUhUTUwgPSBmdW5jdGlvbihodG1sKSB7XG5cdHZhciBjb250ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSxcblx0XHRiaW5kaW5nID0gbmV3IEJpbmRpbmc7XG5cblx0Y29udC5pbm5lckhUTUwgPSBodG1sO1xuXG5cdHdyYXBOb2RlKHV0aWwudG9BcnJheShjb250LmNoaWxkTm9kZXMpKVxuXHRcdC5mb3JFYWNoKGJpbmRpbmcuYXBwZW5kQ2hpbGQsIGJpbmRpbmcpO1xuXG5cdHJldHVybiBiaW5kaW5nO1xufSIsInZhciBCaW5kaW5nID0gcmVxdWlyZShcIi4vYmluZGluZ1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gQmluZGluZy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oKSB7XG5cdFx0Ly8gdHVybnMgYSBmZXcgZXZlbnRzIGludG8gaW5zdGFuY2UgbWV0aG9kcyB0byBtYWtlIHRoaXMgY2xhc3MgbW9yZSBmdW5jdGlvbmFsXG5cdFx0Ly8gYnV0IGFsc28gdG8gbWF0Y2ggY2xvc2VyIHRvIEZCJ3MgUmVhY3QgY29tcG9uZW50IEFQSVxuXHRcdFtcIm1vdW50XCIsXCJyZW5kZXJcIixcImludmFsaWRhdGVcIl0uZm9yRWFjaChmdW5jdGlvbihldnQpIHtcblx0XHRcdHZhciBjYXBzID0gZXZ0WzBdLnRvVXBwZXJDYXNlKCkgKyBldnQuc3Vic3RyKDEpO1xuXHRcdFx0dGhpcy5vbihldnQgKyBcIjpiZWZvcmVcIiwgcnVuSWZFeGlzdHModGhpcywgXCJiZWZvcmVcIiArIGNhcHMpKTtcblx0XHRcdHRoaXMub24oZXZ0LCBydW5JZkV4aXN0cyh0aGlzLCBcIm9uXCIgKyBjYXBzKSk7XG5cdFx0XHR0aGlzLm9uKGV2dCArIFwiOmFmdGVyXCIsIHJ1bklmRXhpc3RzKHRoaXMsIFwiYWZ0ZXJcIiArIGNhcHMpKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHRoaXMub24oXCJzdG9wXCIsIHJ1bklmRXhpc3RzKHRoaXMsIFwib25TdG9wXCIpKTtcblxuXHRcdEJpbmRpbmcuYXBwbHkodGhpcyk7XG5cdFx0dGhpcy5pbml0aWFsaXplLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH0sXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oKXt9LFxuXHRyZW5kZXI6IGZ1bmN0aW9uKCl7fSxcblxuXHRtb3VudDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGFyZ3MgPSB1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSwgY29tcDtcblxuXHRcdC8vIHN0b3AgZXhpc3RpbmcgbW91bnRcblx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdC8vIHRoZSBmaXJzdCBldmVudCBpbiB0aGUgY3ljbGUsIGJlZm9yZSBldmVyeXRoaW5nIGVsc2Vcblx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDpiZWZvcmVcIiwgYXJncyk7XG5cblx0XHQvLyB0aGUgYXV0b3J1biBjb21wdXRhdGlvblxuXHRcdGNvbXAgPSB0aGlzLl9jb21wID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdC8vIG9ubHkgcmVuZGVyIGV2ZW50IHdpdGhvdXQgYmluZGluZ3Ncblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjpiZWZvcmVcIiwgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIHJ1biByZW5kZXIgYW5kIHByb2Nlc3MgdGhlIHJlc3VsdGluZyBiaW5kaW5ncyBpbnRvIGFuIGFycmF5XG5cdFx0XHR2YXIgYmluZGluZ3MgPSB0aGlzLnJlbmRlci5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdGlmIChCaW5kaW5nLmlzQmluZGluZyhiaW5kaW5ncykpIGJpbmRpbmdzID0gWyBiaW5kaW5ncyBdO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGJpbmRpbmdzKSkgYmluZGluZ3MgPSBbXTtcblxuXHRcdFx0Ly8gbWFpbiByZW5kZXIgZXZlbnQgZXhlY3MgYWZ0ZXIgcmVuZGVyIGJ1dCBiZWZvcmUgYXBwZW5kaW5nXG5cdFx0XHQvLyB0aGUgYmluZGluZ3MgYXJyYXkgY2FuIGJlIGFmZmVjdGVkIGJ5IHRoaXMgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlclwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIGFwcGVuZCB0aGUgYmluZGluZ3MgaW4gb3JkZXJcblx0XHRcdGJpbmRpbmdzID0gYmluZGluZ3MubWFwKHRoaXMuYXBwZW5kQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XG5cdFx0XHQvLyB0aGUgbGFzdCByZW5kZXIgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjphZnRlclwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIGF1dG8gY2xlYW4gdXBcblx0XHRcdGNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQvLyBvbmx5IGludmFsaWRhdGUgZXZlbnQgd2l0aCBiaW5kaW5nc1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJpbnZhbGlkYXRlOmJlZm9yZVwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyByZW1vdmUgdGhlIGJpbmRpbmdzIGFkZGVkIGJlZm9yZVxuXHRcdFx0XHRiaW5kaW5ncy5mb3JFYWNoKHRoaXMucmVtb3ZlQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XHRcblx0XHRcdFx0Ly8gcmVtYWluaW5nIGludmFsaWRhdGUgZXZlbnRzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGVcIiwgY29tcCwgYXJncyk7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGU6YWZ0ZXJcIiwgY29tcCwgYXJncyk7XG5cblx0XHRcdFx0Ly8gZGV0ZWN0IGlmIHRoZSBjb21wdXRhdGlvbiBzdG9wcGVkXG5cdFx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJzdG9wXCIsIGFyZ3MpO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9jb21wO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIHJlbWFpbmluZyBtb3VudCBldmVudHMgaGFwcGVuIGFmdGVyIHRoZSBmaXJzdCByZW5kZXJcblx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudFwiLCBjb21wLCBhcmdzKTtcblx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDphZnRlclwiLCBjb21wLCBhcmdzKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGlzTW91bnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXAgIT0gbnVsbDtcblx0fSxcblxuXHRpbnZhbGlkYXRlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc01vdW50ZWQoKSkgdGhpcy5fY29tcC5pbnZhbGlkYXRlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0c3RvcDogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNNb3VudGVkKCkpIHRoaXMuX2NvbXAuc3RvcCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59KTtcblxuZnVuY3Rpb24gcnVuSWZFeGlzdHMob2JqLCBtZXRob2QpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0eXBlb2Ygb2JqW21ldGhvZF0gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0cmV0dXJuIG9ialttZXRob2RdLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcblx0XHR9XG5cdH1cbn1cbiIsInZhciB0b0FycmF5ID1cbmV4cG9ydHMudG9BcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwob2JqLCAwKTtcbn1cblxudmFyIGhhcyA9XG5leHBvcnRzLmhhcyA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG5cdHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xufVxuXG52YXIgZXh0ZW5kID1cbmV4cG9ydHMuZXh0ZW5kID0gZnVuY3Rpb24ob2JqKSB7XG5cdHRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKS5mb3JFYWNoKGZ1bmN0aW9uKG1peGluKSB7XG5cdFx0aWYgKCFtaXhpbikgcmV0dXJuO1xuXG5cdFx0Zm9yICh2YXIga2V5IGluIG1peGluKSB7XG5cdFx0XHRvYmpba2V5XSA9IG1peGluW2tleV07XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgZWFjaCA9XG5leHBvcnRzLmVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG5cdGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcblxuXHRpZiAob2JqLmZvckVhY2ggPT09IEFycmF5LnByb3RvdHlwZS5mb3JFYWNoKSB7XG5cdFx0b2JqLmZvckVhY2goaXRlcmF0b3IsIGNvbnRleHQpO1xuXHR9IGVsc2UgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSB7XG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0aXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpbaV0sIGksIG9iaik7XG5cdFx0fVxuXHR9IGVsc2Uge1xuXHRcdHZhciBrZXlzID0gT2JqZWN0LmtleXMob2JqKTtcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0aXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5c1tpXV0sIGtleXNbaV0sIG9iaik7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG9iajtcbn1cblxudmFyIGZsYXR0ZW4gPVxuZXhwb3J0cy5mbGF0dGVuID0gZnVuY3Rpb24oaW5wdXQsIG91dHB1dCkge1xuXHRpZiAob3V0cHV0ID09IG51bGwpIG91dHB1dCA9IFtdO1xuXG5cdGVhY2goaW5wdXQsIGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSBmbGF0dGVuKHZhbHVlLCBvdXRwdXQpO1xuXHRcdGVsc2Ugb3V0cHV0LnB1c2godmFsdWUpO1xuXHR9KTtcblxuXHRyZXR1cm4gb3V0cHV0O1xufVxuXG5leHBvcnRzLnBpY2sgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIGZsYXR0ZW4odG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpKVxuXG5cdC5yZWR1Y2UoZnVuY3Rpb24obm9iaiwga2V5KSB7XG5cdFx0bm9ialtrZXldID0gb2JqW2tleV07XG5cdFx0cmV0dXJuIG5vYmo7XG5cdH0sIHt9KTtcbn1cblxudmFyIGlzT2JqZWN0ID1cbmV4cG9ydHMuaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIG9iaiA9PT0gT2JqZWN0KG9iaik7XG59XG5cbmV4cG9ydHMudW5pcXVlSWQgPSAoZnVuY3Rpb24oKSB7XG5cdHZhciBpZCA9IDA7XG5cdHJldHVybiBmdW5jdGlvbihwcmVmaXgpIHtcblx0XHRyZXR1cm4gKHByZWZpeCB8fCBcIlwiKSArICgrK2lkKTtcblx0fVxufSkoKTtcblxuLy8gdGhlIHN1YmNsYXNzaW5nIGZ1bmN0aW9uIGZvdW5kIGluIEJhY2tib25lXG5leHBvcnRzLnN1YmNsYXNzID0gZnVuY3Rpb24ocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcblx0dmFyIHBhcmVudCA9IHRoaXM7XG5cdHZhciBjaGlsZDtcblxuXHQvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG5cdC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuXHQvLyBieSB1cyB0byBzaW1wbHkgY2FsbCB0aGUgcGFyZW50J3MgY29uc3RydWN0b3IuXG5cdGlmIChwcm90b1Byb3BzICYmIGhhcyhwcm90b1Byb3BzLCAnY29uc3RydWN0b3InKSkge1xuXHRcdGNoaWxkID0gcHJvdG9Qcm9wcy5jb25zdHJ1Y3Rvcjtcblx0fSBlbHNlIHtcblx0XHRjaGlsZCA9IGZ1bmN0aW9uKCl7IHJldHVybiBwYXJlbnQuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfTtcblx0fVxuXG5cdC8vIEFkZCBzdGF0aWMgcHJvcGVydGllcyB0byB0aGUgY29uc3RydWN0b3IgZnVuY3Rpb24sIGlmIHN1cHBsaWVkLlxuXHRleHRlbmQoY2hpbGQsIHBhcmVudCwgc3RhdGljUHJvcHMpO1xuXG5cdC8vIFNldCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIGluaGVyaXQgZnJvbSBgcGFyZW50YCwgd2l0aG91dCBjYWxsaW5nXG5cdC8vIGBwYXJlbnRgJ3MgY29uc3RydWN0b3IgZnVuY3Rpb24uXG5cdHZhciBTdXJyb2dhdGUgPSBmdW5jdGlvbigpeyB0aGlzLmNvbnN0cnVjdG9yID0gY2hpbGQ7IH07XG5cdFN1cnJvZ2F0ZS5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuXHRjaGlsZC5wcm90b3R5cGUgPSBuZXcgU3Vycm9nYXRlO1xuXG5cdC8vIEFkZCBwcm90b3R5cGUgcHJvcGVydGllcyAoaW5zdGFuY2UgcHJvcGVydGllcykgdG8gdGhlIHN1YmNsYXNzLFxuXHQvLyBpZiBzdXBwbGllZC5cblx0aWYgKHByb3RvUHJvcHMpIGV4dGVuZChjaGlsZC5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuXG5cdC8vIFNldCBhIGNvbnZlbmllbmNlIHByb3BlcnR5IGluIGNhc2UgdGhlIHBhcmVudCdzIHByb3RvdHlwZSBpcyBuZWVkZWRcblx0Ly8gbGF0ZXIuXG5cdGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cblx0cmV0dXJuIGNoaWxkO1xufVxuXG5leHBvcnRzLmlzTm9kZUF0RE9NUG9zaXRpb24gPSBmdW5jdGlvbihub2RlLCBwYXJlbnQsIGJlZm9yZSkge1xuXHRyZXR1cm4gbm9kZS5wYXJlbnROb2RlID09PSBwYXJlbnQgJiYgbm9kZS5uZXh0U2libGluZyA9PT0gYmVmb3JlO1xufVxuXG52YXIgbWF0Y2hlc1NlbGVjdG9yID0gRWxlbWVudC5wcm90b3R5cGUubWF0Y2hlcyB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS53ZWJraXRNYXRjaGVzU2VsZWN0b3IgfHxcblx0RWxlbWVudC5wcm90b3R5cGUubW96TWF0Y2hlc1NlbGVjdG9yIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLm1zTWF0Y2hlc1NlbGVjdG9yO1xuXG5leHBvcnRzLm1hdGNoZXNTZWxlY3RvciA9IGZ1bmN0aW9uKGVsZW0sIHNlbGVjdG9yKSB7XG5cdHJldHVybiBtYXRjaGVzU2VsZWN0b3IuY2FsbChlbGVtLCBzZWxlY3Rvcilcbn1cblxudmFyIERlcHMgPSByZXF1aXJlKFwiLi9kZXBzXCIpO1xuXG52YXIgZGVmaW5lUmVhY3RpdmVQcm9wZXJ0eSA9XG5leHBvcnRzLmRlZmluZVJlYWN0aXZlUHJvcGVydHkgPSBmdW5jdGlvbihvYmosIHByb3AsIHZhbHVlLCBjb2VyY2UpIHtcblx0aWYgKCFpc09iamVjdChvYmopKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgb2JqZWN0IHRvIGRlZmluZSB0aGUgcmVhY3RpdmUgcHJvcGVydHkgb24uXCIpO1xuXHRpZiAodHlwZW9mIHByb3AgIT09IFwic3RyaW5nXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgZm9yIHByb3BlcnR5IG5hbWUuXCIpO1xuXG5cdGlmICh0eXBlb2YgdmFsdWUgPT09IFwiZnVuY3Rpb25cIiAmJiBjb2VyY2UgPT0gbnVsbCkge1xuXHRcdGNvZXJjZSA9IHZhbHVlO1xuXHRcdHZhbHVlID0gdm9pZCAwO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBjb2VyY2UgIT09IFwiZnVuY3Rpb25cIikgY29lcmNlID0gZnVuY3Rpb24odikgeyByZXR1cm4gdjsgfTtcblxuXHQvLyBydW5zIHRoZSBjb2VyY2lvbiBmdW5jdGlvbiBub24tcmVhY3RpdmVseSB0byBwcmV2ZW50IGluZmluaXRlIGxvb3BzXG5cdGZ1bmN0aW9uIHByb2Nlc3Modikge1xuXHRcdHJldHVybiBEZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGNvZXJjZS5jYWxsKG9iaiwgdiwgcHJvcCwgb2JqKTtcblx0XHR9KTtcblx0fVxuXG5cdHZhciBkZXAgPSBuZXcgRGVwcy5EZXBlbmRlbmN5O1xuXHR2YWx1ZSA9IHByb2Nlc3ModmFsdWUpO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0dmFsID0gcHJvY2Vzcyh2YWwpO1xuXG5cdFx0XHRpZiAodmFsICE9PSB2YWx1ZSkge1xuXHRcdFx0XHR2YWx1ZSA9IHZhbDtcblx0XHRcdFx0ZGVwLmNoYW5nZWQoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0sXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdGRlcC5kZXBlbmQoKTtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBvYmo7XG59XG5cbmV4cG9ydHMuZGVmaW5lUmVhY3RpdmVQcm9wZXJ0aWVzID0gZnVuY3Rpb24ob2JqLCBwcm9wcywgY29lcmNlKSB7XG5cdGZvciAodmFyIHByb3AgaW4gcHJvcHMpIHtcblx0XHRkZWZpbmVSZWFjdGl2ZVByb3BlcnR5KG9iaiwgcHJvcCwgcHJvcHNbcHJvcF0sIGNvZXJjZSB8fCBmYWxzZSk7XG5cdH1cblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eSA9XG5leHBvcnRzLmRlZmluZUNvbXB1dGVkUHJvcGVydHkgPSBmdW5jdGlvbihvYmosIHByb3AsIHZhbHVlKSB7XG5cdGlmICh0eXBlb2YgdmFsdWUgIT09IFwiZnVuY3Rpb25cIilcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGNvbXB1dGVkIHByb3BlcnR5IHZhbHVlLlwiKTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCB7XG5cdFx0Y29uZmlndXJhYmxlOiB0cnVlLFxuXHRcdGVudW1lcmFibGU6IHRydWUsXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB2YWx1ZS5jYWxsKG9iaik7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0cy5kZWZpbmVDb21wdXRlZFByb3BlcnRpZXMgPSBmdW5jdGlvbihvYmosIHByb3BzKSB7XG5cdE9iamVjdC5rZXlzKHByb3BzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuXHRcdGRlZmluZUNvbXB1dGVkUHJvcGVydHkob2JqLCBrZXksIHByb3BzW2tleV0pO1xuXHR9KTtcbn1cbiJdfQ==
(5)
});
