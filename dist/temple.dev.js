/* Temple / (c) 2014 Beneath the Ink, Inc. / MIT License / Version 0.3.4, Build 143 */
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.Temple=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var Events = require("./events"),
	Deps = require("./deps"),
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
	},

	// a generalized reactive workflow helper
	mount: function() {
		var args = util.toArray(arguments), comp;

		Deps.nonreactive(function() {
			// stop existing mount
			this.stop();

			// init the function event methods
			this._initEventMethods();

			// the first event in the cycle, before everything else
			this._mounting = true;
			this.trigger("mount:before", args);
		}, this);

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
		Deps.nonreactive(function() {
			this.trigger("mount", comp, args);
			this.trigger("mount:after", comp, args);
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

	stop: function() {
		if (this.isMounted()) this._comp.stop();
		return this;
	},

	// turns a few events into instance methods to make this class more functional
	// but also to match closer to FB's React component API
	_initEventMethods: function() {
		if (this._eventMethods) return this;
		this._eventMethods = true;

		["mount","render","invalidate"].forEach(function(evt) {
			var caps = evt[0].toUpperCase() + evt.substr(1);
			this.on(evt + ":before", util.runIfExists(this, "before" + caps));
			this.on(evt, util.runIfExists(this, "on" + caps));
			this.on(evt + ":after", util.runIfExists(this, "after" + caps));
		}, this);

		this.on("stop", util.runIfExists(this, "onStop"));

		return this;
	}

});

// aliases
Binding.prototype.hasChild = Binding.prototype.contains;
Binding.prototype.toHTML = Binding.prototype.toString;

// Load the bindings
util.extend(Binding, require("./node"));
Binding.HTML = require("./html");
},{"./deps":2,"./events":3,"./html":4,"./node":6,"./util":8}],2:[function(require,module,exports){
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

var requestAnimationFrame = typeof window !== "undefined" ?
  window.requestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.oRequestAnimationFrame :
  function(f) {
    setTimeout(function() {
      f(Date.now());
    }, 1000 / 30);
  };

var requireFlush = function () {
  if (! willFlush) {
    requestAnimationFrame(Deps.flush);
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
// exectuing fn immediately. forwards any arguments passed to the function
Deps.nonreactable = function (f, ctx) {
  return function() {
    var previous = Deps.currentComputation;
    setCurrentComputation(null);
    try {
      return f.apply(ctx || this, arguments);
    } finally {
      setCurrentComputation(previous);
    }
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
},{}],3:[function(require,module,exports){
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
},{"./util":8}],4:[function(require,module,exports){
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

},{"./binding":1,"./util":8}],5:[function(require,module,exports){
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
Temple.VERSION = "0.3.4";
Temple.util = util;
Temple.Events = require("./events");
Temple.Binding = Binding;

// deps setup
var Deps = Temple.Deps = require("./deps");
Temple.autorun = Deps.autorun;
Temple.nonreactive = Deps.nonreactive;
Temple.nonreactable = Deps.nonreactable;
Temple.Dependency = Deps.Dependency;
},{"./binding":1,"./deps":2,"./events":3,"./util":8}],6:[function(require,module,exports){
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

	addEventListener: function(type, sel, listener) {
		// syntax: addEventListener({ "type selector": listener })
		if (util.isObject(type)) {
			util.each(type, function(v, n) {
				var m = n.match(delegateEventSplitter);
				this.addEventListener(m[1], m[2], v);
			}, this);
			
			return this;
		}

		// syntax: addEventListener(type, listener)
		if (typeof sel === "function" && listener == null) {
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

			listener.call(self, e, delegate);
		}
	},

	removeEventListener: function(type, listener) {
		var evts = [];

		if (typeof type === "function" && listener == null) {
			listener = type;
			type = null;
		}

		if (util.isObject(type)) {
			util.each(type, function(v, n) {
				var m = n.match(delegateEventSplitter);
				evts.push.apply(evts, this._eventListeners.filter(function(e) {
					return e.type === m[1] && e.listener === v && !~evts.indexOf(e);
				}));
			}, this);
		} else {
			evts = this._eventListeners.filter(function(e) {
				return (type == null || type === e.type) && (listener == null || listener === e.listener);
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
	nodes = util.toArray(cont.childNodes);
	return fromNode(nodes.length === 1 ? nodes[0] : new Binding().append(nodes));
}

// converts a simple css selector to an element binding
exports.fromSelector = function(sel) {
	if (typeof sel !== "object") {
		sel = util.parseSelector(sel);
	}

	var el = new Temple.Element(sel.tagname);
	if (sel.id != null) el.prop("id", sel.id);
	el.addClass(sel.classes);
	el.attr(sel.attributes);
	el.append(util.toArray(arguments).slice(1));

	return el;
}
},{"./binding":1,"./util":8}],7:[function(require,module,exports){
module.exports = (function() {
  /*
   * Generated by PEG.js 0.8.0.
   *
   * http://pegjs.majda.cz/
   */

  function peg$subclass(child, parent) {
    function ctor() { this.constructor = child; }
    ctor.prototype = parent.prototype;
    child.prototype = new ctor();
  }

  function SyntaxError(message, expected, found, offset, line, column) {
    this.message  = message;
    this.expected = expected;
    this.found    = found;
    this.offset   = offset;
    this.line     = line;
    this.column   = column;

    this.name     = "SyntaxError";
  }

  peg$subclass(SyntaxError, Error);

  function parse(input) {
    var options = arguments.length > 1 ? arguments[1] : {},

        peg$FAILED = {},

        peg$startRuleIndices = { start: 0 },
        peg$startRuleIndex   = 0,

        peg$consts = [
          peg$FAILED,
          null,
          [],
          function(tag, props) {
          	var el = {
          		tagname: tag,
          		id: null,
          		classes: [],
          		attributes: {}
          	};

          	props.forEach(function(prop) {
          		switch (prop.type) {
          			case "id":
          				el.id = prop.value;
          				break;

          			case "class":
          				el.classes.push(prop.value);
          				break;

          			case "attr":
          				el.attributes[prop.name] = prop.value;
          				break;
          		}
          	});

          	return el;
          },
          function(name) { return name.join(""); },
          function(i, j) { return i + j.join(''); },
          "#",
          { type: "literal", value: "#", description: "\"#\"" },
          function(h) {
          	if (hasId) throw new Error("Elements cannot have multiple IDs.");
          	hasId = true;

          	return {
          		type: "id",
          		value: h
          	}
          },
          ".",
          { type: "literal", value: ".", description: "\".\"" },
          function(c) {
          	return {
          		type: "class",
          		value: c
          	}
          },
          "[",
          { type: "literal", value: "[", description: "\"[\"" },
          "]",
          { type: "literal", value: "]", description: "\"]\"" },
          function(key, value) {
          	return {
          		type: "attr",
          		name: key,
          		value: value || ""
          	}
          },
          /^[a-z0-9_\-]/i,
          { type: "class", value: "[a-z0-9_\\-]i", description: "[a-z0-9_\\-]i" },
          function(k) { return k.join(""); },
          "=",
          { type: "literal", value: "=", description: "\"=\"" },
          function(v) { return v; },
          "\"",
          { type: "literal", value: "\"", description: "\"\\\"\"" },
          /^[^"]/,
          { type: "class", value: "[^\"]", description: "[^\"]" },
          function(v) { return v.join(""); },
          "'",
          { type: "literal", value: "'", description: "\"'\"" },
          /^[^']/,
          { type: "class", value: "[^']", description: "[^']" },
          /^[^\]]/,
          { type: "class", value: "[^\\]]", description: "[^\\]]" },
          function(v) { return v.join("").trim(); },
          /^[a-z]/,
          { type: "class", value: "[a-z]", description: "[a-z]" },
          /^[a-z0-9\-]/,
          { type: "class", value: "[a-z0-9\\-]", description: "[a-z0-9\\-]" },
          /^[\x80-\xFF]/,
          { type: "class", value: "[\\x80-\\xFF]", description: "[\\x80-\\xFF]" },
          { type: "other", description: "whitespace" },
          /^[ \t\n\r]/,
          { type: "class", value: "[ \\t\\n\\r]", description: "[ \\t\\n\\r]" },
          "\\",
          { type: "literal", value: "\\", description: "\"\\\\\"" },
          { type: "any", description: "any character" },
          function(char) { return char; }
        ],

        peg$bytecode = [
          peg$decode("!7!*# \" !+S$ \"7#*) \"7$*# \"7%,/&7#*) \"7$*# \"7%\"+)%4\"6#\"\"! %$\"#  \"#  "),
          peg$decode("! \"7*,#&7*\"+' 4!6$!! %"),
          peg$decode("!7*+;$ \"7+,#&7+\"+)%4\"6%\"\"! %$\"#  \"#  "),
          peg$decode("!.&\"\"2&3'+2$7\"+(%4\"6(\"! %$\"#  \"#  "),
          peg$decode("!.)\"\"2)3*+2$7\"+(%4\"6+\"! %$\"#  \"#  "),
          peg$decode("!.,\"\"2,3-+S$7&+I%7'*# \" !+9%..\"\"2.3/+)%4$60$\"\"!%$$#  $##  $\"#  \"#  "),
          peg$decode("!7-+W$ \"01\"\"1!32+,$,)&01\"\"1!32\"\"\"  +2%7-+(%4#63#!!%$##  $\"#  \"#  "),
          peg$decode("!.4\"\"2435+L$7-+B%7(*# \"7)+2%7-+(%4$66$!!%$$#  $##  $\"#  \"#  "),
          peg$decode("!.7\"\"2738+b$ \"7.*) \"09\"\"1!3:,/&7.*) \"09\"\"1!3:\"+8%.7\"\"2738+(%4#6;#!!%$##  $\"#  \"#  *s \"!.<\"\"2<3=+b$ \"7.*) \"0>\"\"1!3?,/&7.*) \"0>\"\"1!3?\"+8%.<\"\"2<3=+(%4#6;#!!%$##  $\"#  \"#  "),
          peg$decode("! \"0@\"\"1!3A,)&0@\"\"1!3A\"+' 4!6B!! %"),
          peg$decode("0C\"\"1!3D*# \"7,"),
          peg$decode("0E\"\"1!3F*# \"7,"),
          peg$decode("0G\"\"1!3H"),
          peg$decode("8 \"0J\"\"1!3K,)&0J\"\"1!3K\"9*\" 3I"),
          peg$decode("!.L\"\"2L3M+7$-\"\"1!3N+(%4\"6O\"! %$\"#  \"#  ")
        ],

        peg$currPos          = 0,
        peg$reportedPos      = 0,
        peg$cachedPos        = 0,
        peg$cachedPosDetails = { line: 1, column: 1, seenCR: false },
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleIndices)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleIndex = peg$startRuleIndices[options.startRule];
    }

    function text() {
      return input.substring(peg$reportedPos, peg$currPos);
    }

    function offset() {
      return peg$reportedPos;
    }

    function line() {
      return peg$computePosDetails(peg$reportedPos).line;
    }

    function column() {
      return peg$computePosDetails(peg$reportedPos).column;
    }

    function expected(description) {
      throw peg$buildException(
        null,
        [{ type: "other", description: description }],
        peg$reportedPos
      );
    }

    function error(message) {
      throw peg$buildException(message, null, peg$reportedPos);
    }

    function peg$computePosDetails(pos) {
      function advance(details, startPos, endPos) {
        var p, ch;

        for (p = startPos; p < endPos; p++) {
          ch = input.charAt(p);
          if (ch === "\n") {
            if (!details.seenCR) { details.line++; }
            details.column = 1;
            details.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            details.line++;
            details.column = 1;
            details.seenCR = true;
          } else {
            details.column++;
            details.seenCR = false;
          }
        }
      }

      if (peg$cachedPos !== pos) {
        if (peg$cachedPos > pos) {
          peg$cachedPos = 0;
          peg$cachedPosDetails = { line: 1, column: 1, seenCR: false };
        }
        advance(peg$cachedPosDetails, peg$cachedPos, pos);
        peg$cachedPos = pos;
      }

      return peg$cachedPosDetails;
    }

    function peg$fail(expected) {
      if (peg$currPos < peg$maxFailPos) { return; }

      if (peg$currPos > peg$maxFailPos) {
        peg$maxFailPos = peg$currPos;
        peg$maxFailExpected = [];
      }

      peg$maxFailExpected.push(expected);
    }

    function peg$buildException(message, expected, pos) {
      function cleanupExpected(expected) {
        var i = 1;

        expected.sort(function(a, b) {
          if (a.description < b.description) {
            return -1;
          } else if (a.description > b.description) {
            return 1;
          } else {
            return 0;
          }
        });

        while (i < expected.length) {
          if (expected[i - 1] === expected[i]) {
            expected.splice(i, 1);
          } else {
            i++;
          }
        }
      }

      function buildMessage(expected, found) {
        function stringEscape(s) {
          function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

          return s
            .replace(/\\/g,   '\\\\')
            .replace(/"/g,    '\\"')
            .replace(/\x08/g, '\\b')
            .replace(/\t/g,   '\\t')
            .replace(/\n/g,   '\\n')
            .replace(/\f/g,   '\\f')
            .replace(/\r/g,   '\\r')
            .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
            .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
            .replace(/[\u0180-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
            .replace(/[\u1080-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
        }

        var expectedDescs = new Array(expected.length),
            expectedDesc, foundDesc, i;

        for (i = 0; i < expected.length; i++) {
          expectedDescs[i] = expected[i].description;
        }

        expectedDesc = expected.length > 1
          ? expectedDescs.slice(0, -1).join(", ")
              + " or "
              + expectedDescs[expected.length - 1]
          : expectedDescs[0];

        foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

        return "Expected " + expectedDesc + " but " + foundDesc + " found.";
      }

      var posDetails = peg$computePosDetails(pos),
          found      = pos < input.length ? input.charAt(pos) : null;

      if (expected !== null) {
        cleanupExpected(expected);
      }

      return new SyntaxError(
        message !== null ? message : buildMessage(expected, found),
        expected,
        found,
        pos,
        posDetails.line,
        posDetails.column
      );
    }

    function peg$decode(s) {
      var bc = new Array(s.length), i;

      for (i = 0; i < s.length; i++) {
        bc[i] = s.charCodeAt(i) - 32;
      }

      return bc;
    }

    function peg$parseRule(index) {
      var bc    = peg$bytecode[index],
          ip    = 0,
          ips   = [],
          end   = bc.length,
          ends  = [],
          stack = [],
          params, i;

      function protect(object) {
        return Object.prototype.toString.apply(object) === "[object Array]" ? [] : object;
      }

      while (true) {
        while (ip < end) {
          switch (bc[ip]) {
            case 0:
              stack.push(protect(peg$consts[bc[ip + 1]]));
              ip += 2;
              break;

            case 1:
              stack.push(peg$currPos);
              ip++;
              break;

            case 2:
              stack.pop();
              ip++;
              break;

            case 3:
              peg$currPos = stack.pop();
              ip++;
              break;

            case 4:
              stack.length -= bc[ip + 1];
              ip += 2;
              break;

            case 5:
              stack.splice(-2, 1);
              ip++;
              break;

            case 6:
              stack[stack.length - 2].push(stack.pop());
              ip++;
              break;

            case 7:
              stack.push(stack.splice(stack.length - bc[ip + 1], bc[ip + 1]));
              ip += 2;
              break;

            case 8:
              stack.pop();
              stack.push(input.substring(stack[stack.length - 1], peg$currPos));
              ip++;
              break;

            case 9:
              ends.push(end);
              ips.push(ip + 3 + bc[ip + 1] + bc[ip + 2]);

              if (stack[stack.length - 1]) {
                end = ip + 3 + bc[ip + 1];
                ip += 3;
              } else {
                end = ip + 3 + bc[ip + 1] + bc[ip + 2];
                ip += 3 + bc[ip + 1];
              }

              break;

            case 10:
              ends.push(end);
              ips.push(ip + 3 + bc[ip + 1] + bc[ip + 2]);

              if (stack[stack.length - 1] === peg$FAILED) {
                end = ip + 3 + bc[ip + 1];
                ip += 3;
              } else {
                end = ip + 3 + bc[ip + 1] + bc[ip + 2];
                ip += 3 + bc[ip + 1];
              }

              break;

            case 11:
              ends.push(end);
              ips.push(ip + 3 + bc[ip + 1] + bc[ip + 2]);

              if (stack[stack.length - 1] !== peg$FAILED) {
                end = ip + 3 + bc[ip + 1];
                ip += 3;
              } else {
                end = ip + 3 + bc[ip + 1] + bc[ip + 2];
                ip += 3 + bc[ip + 1];
              }

              break;

            case 12:
              if (stack[stack.length - 1] !== peg$FAILED) {
                ends.push(end);
                ips.push(ip);

                end = ip + 2 + bc[ip + 1];
                ip += 2;
              } else {
                ip += 2 + bc[ip + 1];
              }

              break;

            case 13:
              ends.push(end);
              ips.push(ip + 3 + bc[ip + 1] + bc[ip + 2]);

              if (input.length > peg$currPos) {
                end = ip + 3 + bc[ip + 1];
                ip += 3;
              } else {
                end = ip + 3 + bc[ip + 1] + bc[ip + 2];
                ip += 3 + bc[ip + 1];
              }

              break;

            case 14:
              ends.push(end);
              ips.push(ip + 4 + bc[ip + 2] + bc[ip + 3]);

              if (input.substr(peg$currPos, peg$consts[bc[ip + 1]].length) === peg$consts[bc[ip + 1]]) {
                end = ip + 4 + bc[ip + 2];
                ip += 4;
              } else {
                end = ip + 4 + bc[ip + 2] + bc[ip + 3];
                ip += 4 + bc[ip + 2];
              }

              break;

            case 15:
              ends.push(end);
              ips.push(ip + 4 + bc[ip + 2] + bc[ip + 3]);

              if (input.substr(peg$currPos, peg$consts[bc[ip + 1]].length).toLowerCase() === peg$consts[bc[ip + 1]]) {
                end = ip + 4 + bc[ip + 2];
                ip += 4;
              } else {
                end = ip + 4 + bc[ip + 2] + bc[ip + 3];
                ip += 4 + bc[ip + 2];
              }

              break;

            case 16:
              ends.push(end);
              ips.push(ip + 4 + bc[ip + 2] + bc[ip + 3]);

              if (peg$consts[bc[ip + 1]].test(input.charAt(peg$currPos))) {
                end = ip + 4 + bc[ip + 2];
                ip += 4;
              } else {
                end = ip + 4 + bc[ip + 2] + bc[ip + 3];
                ip += 4 + bc[ip + 2];
              }

              break;

            case 17:
              stack.push(input.substr(peg$currPos, bc[ip + 1]));
              peg$currPos += bc[ip + 1];
              ip += 2;
              break;

            case 18:
              stack.push(peg$consts[bc[ip + 1]]);
              peg$currPos += peg$consts[bc[ip + 1]].length;
              ip += 2;
              break;

            case 19:
              stack.push(peg$FAILED);
              if (peg$silentFails === 0) {
                peg$fail(peg$consts[bc[ip + 1]]);
              }
              ip += 2;
              break;

            case 20:
              peg$reportedPos = stack[stack.length - 1 - bc[ip + 1]];
              ip += 2;
              break;

            case 21:
              peg$reportedPos = peg$currPos;
              ip++;
              break;

            case 22:
              params = bc.slice(ip + 4, ip + 4 + bc[ip + 3]);
              for (i = 0; i < bc[ip + 3]; i++) {
                params[i] = stack[stack.length - 1 - params[i]];
              }

              stack.splice(
                stack.length - bc[ip + 2],
                bc[ip + 2],
                peg$consts[bc[ip + 1]].apply(null, params)
              );

              ip += 4 + bc[ip + 3];
              break;

            case 23:
              stack.push(peg$parseRule(bc[ip + 1]));
              ip += 2;
              break;

            case 24:
              peg$silentFails++;
              ip++;
              break;

            case 25:
              peg$silentFails--;
              ip++;
              break;

            default:
              throw new Error("Invalid opcode: " + bc[ip] + ".");
          }
        }

        if (ends.length > 0) {
          end = ends.pop();
          ip = ips.pop();
        } else {
          break;
        }
      }

      return stack[0];
    }


    	var hasId = false;


    peg$result = peg$parseRule(peg$startRuleIndex);

    if (peg$result !== peg$FAILED && peg$currPos === input.length) {
      return peg$result;
    } else {
      if (peg$result !== peg$FAILED && peg$currPos < input.length) {
        peg$fail({ type: "end", description: "end of input" });
      }

      throw peg$buildException(null, peg$maxFailExpected, peg$maxFailPos);
    }
  }

  return {
    SyntaxError: SyntaxError,
    parse:       parse
  };
})();
},{}],8:[function(require,module,exports){
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

var matchesSelector = typeof Element !== "undefined" ?
	Element.prototype.matches ||
	Element.prototype.webkitMatchesSelector ||
	Element.prototype.mozMatchesSelector ||
	Element.prototype.msMatchesSelector :
	function() { return false; };

exports.matchesSelector = function(elem, selector) {
	return matchesSelector.call(elem, selector)
}

var Deps = require("./deps");

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

exports.runIfExists = function(obj, method) {
	return function() {
		if (typeof obj[method] === "function") {
			return obj[method].apply(obj, arguments);
		}
	}
}

var SelectorParser = require("./selector")
exports.parseSelector = function(sel) {
	return SelectorParser.parse(sel);
}

exports.closest = function(elem, selector) {
	while (elem != null) {
		if (elem.nodeType === 1 && matchesSelector.call(elem, selector)) return elem;
		elem = elem.parentNode;
	}

	return false;
}
},{"./deps":2,"./selector":7}]},{},[5])(5)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9ub2RlX21vZHVsZXMvZ3J1bnQtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9iaW5kaW5nLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9kZXBzLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ldmVudHMuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2h0bWwuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2luZGV4LmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ub2RlLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9zZWxlY3Rvci5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9saWIvdXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzWUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3WUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbFdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqbEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBFdmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIiksXG5cdERlcHMgPSByZXF1aXJlKFwiLi9kZXBzXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxudmFyIGNvbXB1dGVkUHJvcHMgPSBbXG5cdFwiaXNSb290XCIsIFwiaGFzQ2hpbGRyZW5cIiwgXCJmaXJzdENoaWxkXCIsIFwibGFzdENoaWxkXCIsIFwibmV4dFNpYmxpbmdcIixcblx0XCJwcmV2aW91c1NpYmxpbmdcIiwgXCJwYXJlbnROb2RlXCIsIFwiZmlyc3ROb2RlXCIsIFwibmV4dFNpYmxpbmdOb2RlXCJcbl07XG5cbmZ1bmN0aW9uIEJpbmRpbmcoKSB7XG5cdHRoaXMuY2hpbGRyZW4gPSBbXTtcblx0dGhpcy5wYXJlbnQgPSBudWxsO1xuXHR1dGlsLmRlZmluZUNvbXB1dGVkUHJvcGVydGllcyh0aGlzLCB1dGlsLnBpY2sodGhpcywgY29tcHV0ZWRQcm9wcykpO1xuXHR1dGlsLnRvQXJyYXkoYXJndW1lbnRzKS5mb3JFYWNoKHRoaXMuYXBwZW5kQ2hpbGQsIHRoaXMpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEJpbmRpbmc7XG5CaW5kaW5nLmV4dGVuZCA9IHV0aWwuc3ViY2xhc3M7XG5CaW5kaW5nLmlzQmluZGluZyA9IGZ1bmN0aW9uKG8pIHtcblx0cmV0dXJuIG8gaW5zdGFuY2VvZiBCaW5kaW5nO1xufVxuXG51dGlsLmV4dGVuZChCaW5kaW5nLnByb3RvdHlwZSwgRXZlbnRzLCB7XG5cdHVzZTogZnVuY3Rpb24oZm4pIHtcblx0XHR2YXIgYXJncyA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xuXHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXHRcblx0aW5zZXJ0QmVmb3JlOiBmdW5jdGlvbihjaGlsZCwgYmVmb3JlKSB7XG5cdFx0Ly8gc3BlY2lhbCBjYXNlIGZvciBzdHJpbmdzXG5cdFx0aWYgKHR5cGVvZiBjaGlsZCA9PT0gXCJzdHJpbmdcIikgY2hpbGQgPSBuZXcgQmluZGluZy5UZXh0KGNoaWxkKTtcblxuXHRcdGlmICghQmluZGluZy5pc0JpbmRpbmcoY2hpbGQpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGNoaWxkIHRvIGJlIGEgYmluZGluZy5cIik7XG5cblx0XHRpZiAoY2hpbGQgPT09IHRoaXMpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgYWRkIGJpbmRpbmcgYXMgYSBjaGlsZCBvZiBpdHNlbGYuXCIpO1xuXG5cdFx0Ly8gZGVmYXVsdCBpbmRleCBpcyB0aGUgZW5kXG5cdFx0dmFyIGluZGV4ID0gdGhpcy5jaGlsZHJlbi5sZW5ndGgsXG5cdFx0XHRvcGFyZW50ID0gY2hpbGQucGFyZW50LFxuXHRcdFx0Y2luZGV4LCBtb3ZlZCA9IGZhbHNlO1xuXG5cdFx0Ly8gb2J0YWluIHRoZSBpbmRleCB0byBpbnNlcnQgYXRcblx0XHRpZiAoYmVmb3JlICE9IG51bGwpIHtcblx0XHRcdGlmICghQmluZGluZy5pc0JpbmRpbmcoYmVmb3JlKSlcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGJlZm9yZSBjaGlsZCB0byBiZSBhIGJpbmRpbmcuXCIpO1xuXG5cdFx0XHRpbmRleCA9IHRoaXMuaW5kZXhPZihiZWZvcmUpO1xuXHRcdFx0aWYgKCF+aW5kZXgpIHRocm93IG5ldyBFcnJvcihcIkJlZm9yZSBiaW5kaW5nIGlzIG5vdCBhIGNoaWxkIG9mIHRoaXMgYmluZGluZy5cIik7XG5cdFx0XHRpZiAoYmVmb3JlID09PSBjaGlsZCkgdGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGFkZCBjaGlsZCBiZWZvcmUgaXRzZWxmLlwiKTtcblxuXHRcdFx0Ly8gaWYgbm9kZSBpcyBhbHJlYWR5IGF0IHRoaXMgbG9jYXRpb24sIG5vIG5lZWQgdG8gY29udGludWVcblx0XHRcdGlmIChiZWZvcmUucHJldmlvdXNTaWJsaW5nID09PSBjaGlsZCkgcmV0dXJuIGNoaWxkO1xuXHRcdH1cblxuXHRcdC8vIGRvIHNwZWNpYWwgdGhpbmdzIGlmIGNoaWxkIGlzIGFscmVhZHkgYSBjaGlsZCBvZiB0aGlzIHBhcmVudFxuXHRcdGlmIChvcGFyZW50ID09PSB0aGlzKSB7XG5cdFx0XHRjaW5kZXggPSB0aGlzLmluZGV4T2YoY2hpbGQpO1xuXG5cdFx0XHQvLyBpZiB0aGUgY2hpbGQgaXMgYWxyZWFkeSB0aGUgbm9kZSBiZWZvcmUgdGhlIGluZGV4LCBubyBuZWVkIHRvIGNvbnRpbnVlXG5cdFx0XHRpZiAoY2luZGV4ID09PSBpbmRleCAtIDEpIHJldHVybiBjaGlsZDtcblxuXHRcdFx0Ly8gcmVtb3ZlIHRoZSBjaGlsZFxuXHRcdFx0dGhpcy5jaGlsZHJlbi5zcGxpY2UoY2luZGV4LCAxKTtcblxuXHRcdFx0Ly8gdXBkYXRlIHRoZSBpbmRleCBzaW5jZSBpdCBtYXkgaGF2ZSBjaGFuZ2VkXG5cdFx0XHRpbmRleCA9IGJlZm9yZSAhPSBudWxsID8gdGhpcy5pbmRleE9mKGJlZm9yZSkgOiB0aGlzLmNoaWxkcmVuLmxlbmd0aDtcblx0XHR9XG5cblx0XHQvLyBvciBzaW11bGF0ZSByZW1vdmUgZnJvbSBleGlzdGluZyBwYXJlbnRcblx0XHRlbHNlIGlmIChvcGFyZW50ICE9IG51bGwpIHtcblx0XHRcdG9wYXJlbnQuY2hpbGRyZW4uc3BsaWNlKG9wYXJlbnQuaW5kZXhPZihjaGlsZCksIDEpO1xuXHRcdFx0Y2hpbGQucGFyZW50ID0gbnVsbDtcblx0XHRcdG9wYXJlbnQudHJpZ2dlcihcImNoaWxkOnJlbW92ZVwiLCBjaGlsZCk7XG5cdFx0fVxuXG5cdFx0Ly8gYWRkIHRoZSBjaGlsZFxuXHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAwLCBjaGlsZCk7XG5cdFx0Y2hpbGQucGFyZW50ID0gdGhpcztcblxuXHRcdC8vIHRyaWdnZXIgZXZlbnRzXG5cdFx0aWYgKG9wYXJlbnQgPT09IHRoaXMpIHtcblx0XHRcdHRoaXMudHJpZ2dlcihcImNoaWxkOm1vdmVcIiwgY2hpbGQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJjaGlsZDphZGRcIiwgY2hpbGQpO1xuXHRcdFx0Y2hpbGQudHJpZ2dlcihcInBhcmVudFwiLCB0aGlzLCBvcGFyZW50KTtcblx0XHR9XG5cblx0XHQvLyB1cGRhdGUgbm9kZXMgbGFzdFxuXHRcdGNoaWxkLnVwZGF0ZU5vZGVzKCk7XG5cblx0XHRyZXR1cm4gY2hpbGQ7XG5cdH0sXG5cblx0YXBwZW5kQ2hpbGQ6IGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zZXJ0QmVmb3JlKGNoaWxkKTtcblx0fSxcblxuXHRhcHBlbmQ6IGZ1bmN0aW9uKCkge1xuXHRcdHV0aWwuZmxhdHRlbih1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSkuZm9yRWFjaCh0aGlzLmFwcGVuZENoaWxkLCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVDaGlsZDogZnVuY3Rpb24oY2hpbGQpIHtcblx0XHR2YXIgaW5kZXggPSB0aGlzLmluZGV4T2YoY2hpbGQpO1xuXHRcdGlmICghfmluZGV4KSByZXR1cm47XG5cblx0XHQvLyByZW1vdmUgY2hpbGRcblx0XHR3aGlsZSAoaW5kZXggPiAtMSkge1xuXHRcdFx0dGhpcy5jaGlsZHJlbi5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0aW5kZXggPSB0aGlzLmluZGV4T2YoY2hpbGQsIGluZGV4KTtcblx0XHR9XG5cblx0XHRjaGlsZC5wYXJlbnQgPSBudWxsO1xuXG5cdFx0Ly8gdHJpZ2dlciBldmVudHNcblx0XHR0aGlzLnRyaWdnZXIoXCJjaGlsZDpyZW1vdmVcIiwgY2hpbGQpO1xuXHRcdGNoaWxkLnRyaWdnZXIoXCJwYXJlbnRcIiwgbnVsbCwgdGhpcyk7XG5cblx0XHQvLyB1cGRhdGUgbm9kZXMgbGFzdFxuXHRcdGNoaWxkLnVwZGF0ZU5vZGVzKCk7XG5cblx0XHRyZXR1cm4gY2hpbGQ7XG5cdH0sXG5cblx0Y29udGFpbnM6IGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5kZXhPZihjaGlsZCkgPiAtMTtcblx0fSxcblxuXHRpbmRleE9mOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLmluZGV4T2YoY2hpbGQpO1xuXHR9LFxuXG5cdGZpcnN0Q2hpbGQ6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuWzBdIHx8IG51bGw7XG5cdH0sXG5cblx0bGFzdENoaWxkOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbGVuID0gdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG5cdFx0cmV0dXJuIGxlbiA/IHRoaXMuY2hpbGRyZW5bbGVuIC0gMV0gOiBudWxsO1xuXHR9LFxuXG5cdG5leHRTaWJsaW5nOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHJldHVybiBudWxsO1xuXG5cdFx0dmFyIGluZGV4ID0gdGhpcy5wYXJlbnQuaW5kZXhPZih0aGlzKSxcblx0XHRcdGNoaWxkcmVuID0gdGhpcy5wYXJlbnQuY2hpbGRyZW47XG5cblx0XHRyZXR1cm4gaW5kZXggPiAtMSAmJiBpbmRleCA8IGNoaWxkcmVuLmxlbmd0aCAtIDEgPyBjaGlsZHJlbltpbmRleCArIDFdIDogbnVsbDtcblx0fSxcblxuXHRwcmV2aW91c1NpYmxpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzUm9vdCkgcmV0dXJuIG51bGw7XG5cblx0XHR2YXIgaW5kZXggPSB0aGlzLnBhcmVudC5pbmRleE9mKHRoaXMpLFxuXHRcdFx0Y2hpbGRyZW4gPSB0aGlzLnBhcmVudC5jaGlsZHJlbjtcblxuXHRcdHJldHVybiBpbmRleCA+IDAgJiYgaW5kZXggPCBjaGlsZHJlbi5sZW5ndGggPyBjaGlsZHJlbltpbmRleCAtIDFdIDogbnVsbDtcblx0fSxcblxuXHRoYXNDaGlsZHJlbjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4ubGVuZ3RoID4gMDtcblx0fSxcblxuXHRpc1Jvb3Q6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnBhcmVudCA9PSBudWxsO1xuXHR9LFxuXG5cdHVwZGF0ZU5vZGVzOiBmdW5jdGlvbigpIHtcblx0XHQvLyB3ZSBtdXN0IHVwZGF0ZSBpbiByZXZlcnNlIHRvIGVuc3VyZSB0aGF0IGJlZm9yZSBub2Rlc1xuXHRcdC8vIGFyZSBhbHJlYWR5IGluIHRoZSBET00gd2hlbiBjaGlsZHJlbiBhcmUgcGxhY2VkXG5cdFx0Zm9yICh2YXIgaSA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdHRoaXMuY2hpbGRyZW5baV0udXBkYXRlTm9kZXMoKTtcblx0XHR9XG5cblx0XHQvLyBldmVudCBpcyBmaXJlZCBhZnRlciwgbWVhbmluZyBjaGlsZHJlbiB3aWxsIGZpcmUgdGhlaXIgZXZlbnRzIGZpcnN0XG5cdFx0dGhpcy50cmlnZ2VyKFwidXBkYXRlXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHRvTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLnJlZHVjZShmdW5jdGlvbihub2RlcywgY2hpbGQpIHtcblx0XHRcdG5vZGVzLnB1c2guYXBwbHkobm9kZXMsIGNoaWxkLnRvTm9kZXMoKSk7XG5cdFx0XHRyZXR1cm4gbm9kZXM7XG5cdFx0fSwgW10pO1xuXHR9LFxuXG5cdHBhcmVudE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzUm9vdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGxhY2Vob2xkZXIgIT0gbnVsbCA/XG5cdFx0XHRcdHRoaXMucGxhY2Vob2xkZXIucGFyZW50Tm9kZSA6XG5cdFx0XHRcdG51bGw7XG5cdFx0fVxuXG5cdFx0dmFyIHBhcmVudCA9IHRoaXMucGFyZW50O1xuXG5cdFx0d2hpbGUgKHBhcmVudCAhPSBudWxsKSB7XG5cdFx0XHRpZiAocGFyZW50IGluc3RhbmNlb2YgQmluZGluZy5Ob2RlKSByZXR1cm4gcGFyZW50Lm5vZGU7XG5cdFx0XHRpZiAocGFyZW50LmlzUm9vdCkgcmV0dXJuIHBhcmVudC5wYXJlbnROb2RlO1xuXHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBmaXJzdENoaWxkID0gdGhpcy5maXJzdENoaWxkO1xuXHRcdHJldHVybiBmaXJzdENoaWxkICE9IG51bGwgPyBmaXJzdENoaWxkLmZpcnN0Tm9kZSA6IG51bGw7XG5cdH0sXG5cblx0bmV4dFNpYmxpbmdOb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHtcblx0XHRcdHJldHVybiB0aGlzLnBsYWNlaG9sZGVyICE9IG51bGwgP1xuXHRcdFx0XHR0aGlzLnBsYWNlaG9sZGVyIDpcblx0XHRcdFx0bnVsbDtcblx0XHR9XG5cblx0XHR2YXIgbmV4dFNpYmxpbmcgPSB0aGlzLm5leHRTaWJsaW5nO1xuXHRcdHJldHVybiBuZXh0U2libGluZyAhPSBudWxsID8gbmV4dFNpYmxpbmcuZmlyc3ROb2RlIDpcblx0XHRcdHRoaXMucGFyZW50IGluc3RhbmNlb2YgQmluZGluZy5Ob2RlID8gbnVsbCA6XG5cdFx0XHR0aGlzLnBhcmVudC5uZXh0U2libGluZ05vZGU7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgZWwsIGk7XG5cblx0XHRmb3IgKGkgaW4gdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0ZWwgPSB0aGlzLmNoaWxkcmVuW2ldLmZpbmQoc2VsZWN0b3IpO1xuXHRcdFx0aWYgKGVsICE9IG51bGwpIHJldHVybiBlbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLnJlZHVjZShmdW5jdGlvbihub2RlcywgY2hpbGQpIHtcblx0XHRcdG5vZGVzLnB1c2guYXBwbHkobm9kZXMsIGNoaWxkLmZpbmRBbGwoc2VsZWN0b3IpKTtcblx0XHRcdHJldHVybiBub2Rlcztcblx0XHR9LCBbXSk7XG5cdH0sXG5cblx0cGFpbnQ6IGZ1bmN0aW9uKHBhcmVudCwgYmVmb3JlTm9kZSkge1xuXHRcdGlmICh0eXBlb2YgcGFyZW50ID09PSBcInN0cmluZ1wiKSBwYXJlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHBhcmVudCk7XG5cdFx0aWYgKHR5cGVvZiBiZWZvcmVOb2RlID09PSBcInN0cmluZ1wiKSBiZWZvcmVOb2RlID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IoYmVmb3JlTm9kZSk7XG5cdFx0aWYgKHBhcmVudCA9PSBudWxsKSBwYXJlbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cdFx0aWYgKHRoaXMucGxhY2Vob2xkZXIgPT0gbnVsbCkgdGhpcy5wbGFjZWhvbGRlciA9IGRvY3VtZW50LmNyZWF0ZUNvbW1lbnQodXRpbC51bmlxdWVJZChcIiRcIikpO1xuXG5cdFx0cGFyZW50Lmluc2VydEJlZm9yZSh0aGlzLnBsYWNlaG9sZGVyLCBiZWZvcmVOb2RlKTtcblx0XHR0aGlzLnVwZGF0ZU5vZGVzKCk7XG5cdFx0dGhpcy50cmlnZ2VyKFwicGFpbnRcIiwgcGFyZW50LCBiZWZvcmVOb2RlKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGRldGFjaDogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMucGxhY2Vob2xkZXIgIT0gbnVsbCAmJiB0aGlzLnBsYWNlaG9sZGVyLnBhcmVudE5vZGUpIHtcblx0XHRcdHRoaXMucGxhY2Vob2xkZXIucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLnBsYWNlaG9sZGVyKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZU5vZGVzKCk7XG5cdFx0dGhpcy50cmlnZ2VyKFwiZGV0YWNoXCIpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YXV0b3J1bjogZnVuY3Rpb24oZm4sIG9ubHlPbkFjdGl2ZSkge1xuXHRcdHZhciBjb21wID0gRGVwcy5hdXRvcnVuKGZuLCB0aGlzKTtcblx0XHRpZiAob25seU9uQWN0aXZlICYmICFEZXBzLmFjdGl2ZSkgY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIGNvbXA7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLm1hcChmdW5jdGlvbihjaGlsZCkge1xuXHRcdFx0cmV0dXJuIGNoaWxkLnRvU3RyaW5nKCk7XG5cdFx0fSkuam9pbihcIlwiKTtcblx0fSxcblxuXHQvLyBhIGdlbmVyYWxpemVkIHJlYWN0aXZlIHdvcmtmbG93IGhlbHBlclxuXHRtb3VudDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGFyZ3MgPSB1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSwgY29tcDtcblxuXHRcdERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHQvLyBzdG9wIGV4aXN0aW5nIG1vdW50XG5cdFx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdFx0Ly8gaW5pdCB0aGUgZnVuY3Rpb24gZXZlbnQgbWV0aG9kc1xuXHRcdFx0dGhpcy5faW5pdEV2ZW50TWV0aG9kcygpO1xuXG5cdFx0XHQvLyB0aGUgZmlyc3QgZXZlbnQgaW4gdGhlIGN5Y2xlLCBiZWZvcmUgZXZlcnl0aGluZyBlbHNlXG5cdFx0XHR0aGlzLl9tb3VudGluZyA9IHRydWU7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDpiZWZvcmVcIiwgYXJncyk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHQvLyB0aGUgYXV0b3J1biBjb21wdXRhdGlvblxuXHRcdGNvbXAgPSB0aGlzLl9jb21wID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdC8vIG9ubHkgcmVuZGVyIGV2ZW50IHdpdGhvdXQgYmluZGluZ3Ncblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjpiZWZvcmVcIiwgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIHJ1biByZW5kZXIgYW5kIHByb2Nlc3MgdGhlIHJlc3VsdGluZyBiaW5kaW5ncyBpbnRvIGFuIGFycmF5XG5cdFx0XHR2YXIgYmluZGluZ3MgPSB0aGlzLnJlbmRlci5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdGlmIChCaW5kaW5nLmlzQmluZGluZyhiaW5kaW5ncykpIGJpbmRpbmdzID0gWyBiaW5kaW5ncyBdO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGJpbmRpbmdzKSkgYmluZGluZ3MgPSBbXTtcblxuXHRcdFx0Ly8gbWFpbiByZW5kZXIgZXZlbnQgZXhlY3MgYWZ0ZXIgcmVuZGVyIGJ1dCBiZWZvcmUgYXBwZW5kaW5nXG5cdFx0XHQvLyB0aGUgYmluZGluZ3MgYXJyYXkgY2FuIGJlIGFmZmVjdGVkIGJ5IHRoaXMgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlclwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIGFwcGVuZCB0aGUgYmluZGluZ3MgaW4gb3JkZXJcblx0XHRcdGJpbmRpbmdzID0gYmluZGluZ3MubWFwKHRoaXMuYXBwZW5kQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XG5cdFx0XHQvLyB0aGUgbGFzdCByZW5kZXIgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjphZnRlclwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIGF1dG8gY2xlYW4gdXBcblx0XHRcdGNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQvLyBvbmx5IGludmFsaWRhdGUgZXZlbnQgd2l0aCBiaW5kaW5nc1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJpbnZhbGlkYXRlOmJlZm9yZVwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyByZW1vdmUgdGhlIGJpbmRpbmdzIGFkZGVkIGJlZm9yZVxuXHRcdFx0XHRiaW5kaW5ncy5mb3JFYWNoKHRoaXMucmVtb3ZlQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XHRcblx0XHRcdFx0Ly8gcmVtYWluaW5nIGludmFsaWRhdGUgZXZlbnRzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGVcIiwgY29tcCwgYXJncyk7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGU6YWZ0ZXJcIiwgY29tcCwgYXJncyk7XG5cblx0XHRcdFx0Ly8gZGV0ZWN0IGlmIHRoZSBjb21wdXRhdGlvbiBzdG9wcGVkXG5cdFx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJzdG9wXCIsIGFyZ3MpO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9jb21wO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIHJlbWFpbmluZyBtb3VudCBldmVudHMgaGFwcGVuIGFmdGVyIHRoZSBmaXJzdCByZW5kZXJcblx0XHREZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnRcIiwgY29tcCwgYXJncyk7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDphZnRlclwiLCBjb21wLCBhcmdzKTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9tb3VudGluZztcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbmRlcjogZnVuY3Rpb24oKXt9LFxuXG5cdGlzTW91bnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuaXNNb3VudGluZygpIHx8IHRoaXMuX2NvbXAgIT0gbnVsbDtcblx0fSxcblxuXHRpc01vdW50aW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9tb3VudGluZztcblx0fSxcblxuXHRnZXRDb21wdXRhdGlvbjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXA7XG5cdH0sXG5cblx0aW52YWxpZGF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNNb3VudGVkKCkpIHRoaXMuX2NvbXAuaW52YWxpZGF0ZSgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHN0b3A6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzTW91bnRlZCgpKSB0aGlzLl9jb21wLnN0b3AoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyB0dXJucyBhIGZldyBldmVudHMgaW50byBpbnN0YW5jZSBtZXRob2RzIHRvIG1ha2UgdGhpcyBjbGFzcyBtb3JlIGZ1bmN0aW9uYWxcblx0Ly8gYnV0IGFsc28gdG8gbWF0Y2ggY2xvc2VyIHRvIEZCJ3MgUmVhY3QgY29tcG9uZW50IEFQSVxuXHRfaW5pdEV2ZW50TWV0aG9kczogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX2V2ZW50TWV0aG9kcykgcmV0dXJuIHRoaXM7XG5cdFx0dGhpcy5fZXZlbnRNZXRob2RzID0gdHJ1ZTtcblxuXHRcdFtcIm1vdW50XCIsXCJyZW5kZXJcIixcImludmFsaWRhdGVcIl0uZm9yRWFjaChmdW5jdGlvbihldnQpIHtcblx0XHRcdHZhciBjYXBzID0gZXZ0WzBdLnRvVXBwZXJDYXNlKCkgKyBldnQuc3Vic3RyKDEpO1xuXHRcdFx0dGhpcy5vbihldnQgKyBcIjpiZWZvcmVcIiwgdXRpbC5ydW5JZkV4aXN0cyh0aGlzLCBcImJlZm9yZVwiICsgY2FwcykpO1xuXHRcdFx0dGhpcy5vbihldnQsIHV0aWwucnVuSWZFeGlzdHModGhpcywgXCJvblwiICsgY2FwcykpO1xuXHRcdFx0dGhpcy5vbihldnQgKyBcIjphZnRlclwiLCB1dGlsLnJ1bklmRXhpc3RzKHRoaXMsIFwiYWZ0ZXJcIiArIGNhcHMpKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHRoaXMub24oXCJzdG9wXCIsIHV0aWwucnVuSWZFeGlzdHModGhpcywgXCJvblN0b3BcIikpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxufSk7XG5cbi8vIGFsaWFzZXNcbkJpbmRpbmcucHJvdG90eXBlLmhhc0NoaWxkID0gQmluZGluZy5wcm90b3R5cGUuY29udGFpbnM7XG5CaW5kaW5nLnByb3RvdHlwZS50b0hUTUwgPSBCaW5kaW5nLnByb3RvdHlwZS50b1N0cmluZztcblxuLy8gTG9hZCB0aGUgYmluZGluZ3NcbnV0aWwuZXh0ZW5kKEJpbmRpbmcsIHJlcXVpcmUoXCIuL25vZGVcIikpO1xuQmluZGluZy5IVE1MID0gcmVxdWlyZShcIi4vaHRtbFwiKTsiLCIvLyBDb3B5IG9mIGh0dHBzOi8vZ2l0aHViLmNvbS9tZXRlb3IvbWV0ZW9yL2NvbW1pdHMvZTc4ODYxYjdkMGRiYjYwZTVlMmJmNTliYWIyY2IwNmNlNjU5NmMwNC9wYWNrYWdlcy9kZXBzL2RlcHMuanNcbi8vIChjKSAyMDExLTIwMTQgTWV0ZW9yIERldmVsb3BtZW50IEdyb3VwXG5cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBQYWNrYWdlIGRvY3MgYXQgaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwcyAvL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxudmFyIERlcHMgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2FjdGl2ZVxuRGVwcy5hY3RpdmUgPSBmYWxzZTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19jdXJyZW50Y29tcHV0YXRpb25cbkRlcHMuY3VycmVudENvbXB1dGF0aW9uID0gbnVsbDtcblxudmFyIHNldEN1cnJlbnRDb21wdXRhdGlvbiA9IGZ1bmN0aW9uIChjKSB7XG4gIERlcHMuY3VycmVudENvbXB1dGF0aW9uID0gYztcbiAgRGVwcy5hY3RpdmUgPSAhISBjO1xufTtcblxudmFyIF9kZWJ1Z0Z1bmMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGxhenkgZXZhbHVhdGlvbiBiZWNhdXNlIGBNZXRlb3JgIGRvZXMgbm90IGV4aXN0IHJpZ2h0IGF3YXlcbiAgcmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG4gICAgICAgICAgKCh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5sb2cgP1xuICAgICAgICAgICBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuICAgICAgICAgICBmdW5jdGlvbiAoKSB7fSkpO1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcbiAgaWYgKHRocm93Rmlyc3RFcnJvcikge1xuICAgIHRocm93IGU7XG4gIH0gZWxzZSB7XG4gICAgX2RlYnVnRnVuYygpKFwiRXhjZXB0aW9uIGZyb20gRGVwcyBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIixcbiAgICAgICAgICAgICAgICAgZS5zdGFjayB8fCBlLm1lc3NhZ2UpO1xuICB9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcbiAgaWYgKCh0eXBlb2YgTWV0ZW9yID09PSAndW5kZWZpbmVkJykgfHwgTWV0ZW9yLmlzQ2xpZW50KSB7XG4gICAgcmV0dXJuIGY7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuICAgICAgICBmLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfVxufTtcblxudmFyIG5leHRJZCA9IDE7XG4vLyBjb21wdXRhdGlvbnMgd2hvc2UgY2FsbGJhY2tzIHdlIHNob3VsZCBjYWxsIGF0IGZsdXNoIHRpbWVcbnZhciBwZW5kaW5nQ29tcHV0YXRpb25zID0gW107XG4vLyBgdHJ1ZWAgaWYgYSBEZXBzLmZsdXNoIGlzIHNjaGVkdWxlZCwgb3IgaWYgd2UgYXJlIGluIERlcHMuZmx1c2ggbm93XG52YXIgd2lsbEZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGluIERlcHMuZmx1c2ggbm93XG52YXIgaW5GbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lXG4vLyBvciByZWNvbXB1dGUuICBUaGlzIG1hdGNoZXMgRGVwcy5hY3RpdmUgdW5sZXNzIHdlIGFyZSBpbnNpZGVcbi8vIERlcHMubm9ucmVhY3RpdmUsIHdoaWNoIG51bGxmaWVzIGN1cnJlbnRDb21wdXRhdGlvbiBldmVuIHRob3VnaFxuLy8gYW4gZW5jbG9zaW5nIGNvbXB1dGF0aW9uIG1heSBzdGlsbCBiZSBydW5uaW5nLlxudmFyIGluQ29tcHV0ZSA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHRoZSBgX3Rocm93Rmlyc3RFcnJvcmAgb3B0aW9uIHdhcyBwYXNzZWQgaW4gdG8gdGhlIGNhbGxcbi8vIHRvIERlcHMuZmx1c2ggdGhhdCB3ZSBhcmUgaW4uIFdoZW4gc2V0LCB0aHJvdyByYXRoZXIgdGhhbiBsb2cgdGhlXG4vLyBmaXJzdCBlcnJvciBlbmNvdW50ZXJlZCB3aGlsZSBmbHVzaGluZy4gQmVmb3JlIHRocm93aW5nIHRoZSBlcnJvcixcbi8vIGZpbmlzaCBmbHVzaGluZyAoZnJvbSBhIGZpbmFsbHkgYmxvY2spLCBsb2dnaW5nIGFueSBzdWJzZXF1ZW50XG4vLyBlcnJvcnMuXG52YXIgdGhyb3dGaXJzdEVycm9yID0gZmFsc2U7XG5cbnZhciBhZnRlckZsdXNoQ2FsbGJhY2tzID0gW107XG5cbnZhciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID9cbiAgd2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICB3aW5kb3cubW96UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gIHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgd2luZG93Lm9SZXF1ZXN0QW5pbWF0aW9uRnJhbWUgOlxuICBmdW5jdGlvbihmKSB7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIGYoRGF0ZS5ub3coKSk7XG4gICAgfSwgMTAwMCAvIDMwKTtcbiAgfTtcblxudmFyIHJlcXVpcmVGbHVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCEgd2lsbEZsdXNoKSB7XG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKERlcHMuZmx1c2gpO1xuICAgIHdpbGxGbHVzaCA9IHRydWU7XG4gIH1cbn07XG5cbi8vIERlcHMuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfY29tcHV0YXRpb25cbi8vXG5EZXBzLkNvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGYsIHBhcmVudCwgY3R4KSB7XG4gIGlmICghIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uKVxuICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgIFwiRGVwcy5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyBwcml2YXRlOyB1c2UgRGVwcy5hdXRvcnVuXCIpO1xuICBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG4gIHZhciBzZWxmID0gdGhpcztcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wcGVkXG4gIHNlbGYuc3RvcHBlZCA9IGZhbHNlO1xuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVkXG4gIHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9maXJzdHJ1blxuICBzZWxmLmZpcnN0UnVuID0gdHJ1ZTtcblxuICBzZWxmLl9pZCA9IG5leHRJZCsrO1xuICBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcbiAgLy8gdGhlIHBsYW4gaXMgYXQgc29tZSBwb2ludCB0byB1c2UgdGhlIHBhcmVudCByZWxhdGlvblxuICAvLyB0byBjb25zdHJhaW4gdGhlIG9yZGVyIHRoYXQgY29tcHV0YXRpb25zIGFyZSBwcm9jZXNzZWRcbiAgc2VsZi5fcGFyZW50ID0gcGFyZW50O1xuICBzZWxmLl9mdW5jID0gZjtcbiAgc2VsZi5fY29udGV4dCA9IGN0eCB8fCB0aGlzO1xuICBzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXG4gIHZhciBlcnJvcmVkID0gdHJ1ZTtcbiAgdHJ5IHtcbiAgICBzZWxmLl9jb21wdXRlKCk7XG4gICAgZXJyb3JlZCA9IGZhbHNlO1xuICB9IGZpbmFsbHkge1xuICAgIHNlbGYuZmlyc3RSdW4gPSBmYWxzZTtcbiAgICBpZiAoZXJyb3JlZClcbiAgICAgIHNlbGYuc3RvcCgpO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9vbmludmFsaWRhdGVcbkRlcHMuQ29tcHV0YXRpb24ucHJvdG90eXBlLm9uSW52YWxpZGF0ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvbkludmFsaWRhdGUgcmVxdWlyZXMgYSBmdW5jdGlvblwiKTtcblxuICBpZiAoc2VsZi5pbnZhbGlkYXRlZCkge1xuICAgIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuICAgICAgd2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICBmLl9jb250ZXh0ID0gY3R4O1xuICAgIHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcy5wdXNoKGYpO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcbiAgICAvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG4gICAgLy8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG4gICAgaWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcbiAgICAgIHJlcXVpcmVGbHVzaCgpO1xuICAgICAgcGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuICAgIH1cblxuICAgIHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG4gICAgLy8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2VcbiAgICAvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuICAgIGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuICAgICAgRGVwcy5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChmLl9jb250ZXh0IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuICAgICAgfSk7XG4gICAgfVxuICAgIHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuICBpZiAoISB0aGlzLnN0b3BwZWQpIHtcbiAgICB0aGlzLnN0b3BwZWQgPSB0cnVlO1xuICAgIHRoaXMuaW52YWxpZGF0ZSgpO1xuICB9XG59O1xuXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cbiAgdmFyIHByZXZpb3VzID0gRGVwcy5jdXJyZW50Q29tcHV0YXRpb247XG4gIHNldEN1cnJlbnRDb21wdXRhdGlvbihzZWxmKTtcbiAgdmFyIHByZXZpb3VzSW5Db21wdXRlID0gaW5Db21wdXRlO1xuICBpbkNvbXB1dGUgPSB0cnVlO1xuICB0cnkge1xuICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoc2VsZi5fZnVuYykuY2FsbChzZWxmLl9jb250ZXh0LCBzZWxmKTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuICAgIGluQ29tcHV0ZSA9IGZhbHNlO1xuICB9XG59O1xuXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fcmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgc2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuICB0cnkge1xuICAgIHdoaWxlIChzZWxmLmludmFsaWRhdGVkICYmICEgc2VsZi5zdG9wcGVkKSB7XG4gICAgICB0cnkge1xuICAgICAgICBzZWxmLl9jb21wdXRlKCk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuICAgICAgfVxuICAgICAgLy8gSWYgX2NvbXB1dGUoKSBpbnZhbGlkYXRlZCB1cywgd2UgcnVuIGFnYWluIGltbWVkaWF0ZWx5LlxuICAgICAgLy8gQSBjb21wdXRhdGlvbiB0aGF0IGludmFsaWRhdGVzIGl0c2VsZiBpbmRlZmluaXRlbHkgaXMgYW5cbiAgICAgIC8vIGluZmluaXRlIGxvb3AsIG9mIGNvdXJzZS5cbiAgICAgIC8vXG4gICAgICAvLyBXZSBjb3VsZCBwdXQgYW4gaXRlcmF0aW9uIGNvdW50ZXIgaGVyZSBhbmQgY2F0Y2ggcnVuLWF3YXlcbiAgICAgIC8vIGxvb3BzLlxuICAgIH1cbiAgfSBmaW5hbGx5IHtcbiAgICBzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuICB9XG59O1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19kZXBlbmRlbmN5XG4vL1xuRGVwcy5EZXBlbmRlbmN5ID0gZnVuY3Rpb24gKCkge1xuICB0aGlzLl9kZXBlbmRlbnRzQnlJZCA9IHt9O1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9kZXBlbmRcbi8vXG4vLyBBZGRzIGBjb21wdXRhdGlvbmAgdG8gdGhpcyBzZXQgaWYgaXQgaXMgbm90IGFscmVhZHlcbi8vIHByZXNlbnQuICBSZXR1cm5zIHRydWUgaWYgYGNvbXB1dGF0aW9uYCBpcyBhIG5ldyBtZW1iZXIgb2YgdGhlIHNldC5cbi8vIElmIG5vIGFyZ3VtZW50LCBkZWZhdWx0cyB0byBjdXJyZW50Q29tcHV0YXRpb24sIG9yIGRvZXMgbm90aGluZ1xuLy8gaWYgdGhlcmUgaXMgbm8gY3VycmVudENvbXB1dGF0aW9uLlxuRGVwcy5EZXBlbmRlbmN5LnByb3RvdHlwZS5kZXBlbmQgPSBmdW5jdGlvbiAoY29tcHV0YXRpb24pIHtcbiAgaWYgKCEgY29tcHV0YXRpb24pIHtcbiAgICBpZiAoISBEZXBzLmFjdGl2ZSlcbiAgICAgIHJldHVybiBmYWxzZTtcblxuICAgIGNvbXB1dGF0aW9uID0gRGVwcy5jdXJyZW50Q29tcHV0YXRpb247XG4gIH1cbiAgdmFyIHNlbGYgPSB0aGlzO1xuICB2YXIgaWQgPSBjb21wdXRhdGlvbi5faWQ7XG4gIGlmICghIChpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZCkpIHtcbiAgICBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0gPSBjb21wdXRhdGlvbjtcbiAgICBjb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgZGVsZXRlIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXTtcbiAgICB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2NoYW5nZWRcbkRlcHMuRGVwZW5kZW5jeS5wcm90b3R5cGUuY2hhbmdlZCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBmb3IgKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcbiAgICBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0uaW52YWxpZGF0ZSgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9oYXNkZXBlbmRlbnRzXG5EZXBzLkRlcGVuZGVuY3kucHJvdG90eXBlLmhhc0RlcGVuZGVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgZm9yKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcbiAgICByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19mbHVzaFxuRGVwcy5mbHVzaCA9IGZ1bmN0aW9uIChfb3B0cykge1xuICAvLyBYWFggV2hhdCBwYXJ0IG9mIHRoZSBjb21tZW50IGJlbG93IGlzIHN0aWxsIHRydWU/IChXZSBubyBsb25nZXJcbiAgLy8gaGF2ZSBTcGFyaylcbiAgLy9cbiAgLy8gTmVzdGVkIGZsdXNoIGNvdWxkIHBsYXVzaWJseSBoYXBwZW4gaWYsIHNheSwgYSBmbHVzaCBjYXVzZXNcbiAgLy8gRE9NIG11dGF0aW9uLCB3aGljaCBjYXVzZXMgYSBcImJsdXJcIiBldmVudCwgd2hpY2ggcnVucyBhblxuICAvLyBhcHAgZXZlbnQgaGFuZGxlciB0aGF0IGNhbGxzIERlcHMuZmx1c2guICBBdCB0aGUgbW9tZW50XG4gIC8vIFNwYXJrIGJsb2NrcyBldmVudCBoYW5kbGVycyBkdXJpbmcgRE9NIG11dGF0aW9uIGFueXdheSxcbiAgLy8gYmVjYXVzZSB0aGUgTGl2ZVJhbmdlIHRyZWUgaXNuJ3QgdmFsaWQuICBBbmQgd2UgZG9uJ3QgaGF2ZVxuICAvLyBhbnkgdXNlZnVsIG5vdGlvbiBvZiBhIG5lc3RlZCBmbHVzaC5cbiAgLy9cbiAgLy8gaHR0cHM6Ly9hcHAuYXNhbmEuY29tLzAvMTU5OTA4MzMwMjQ0LzM4NTEzODIzMzg1NlxuICBpZiAoaW5GbHVzaClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBjYWxsIERlcHMuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cbiAgaWYgKGluQ29tcHV0ZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgRGVwcy5hdXRvcnVuXCIpO1xuXG4gIGluRmx1c2ggPSB0cnVlO1xuICB3aWxsRmx1c2ggPSB0cnVlO1xuICB0aHJvd0ZpcnN0RXJyb3IgPSAhISAoX29wdHMgJiYgX29wdHMuX3Rocm93Rmlyc3RFcnJvcik7XG5cbiAgdmFyIGZpbmlzaGVkVHJ5ID0gZmFsc2U7XG4gIHRyeSB7XG4gICAgd2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8XG4gICAgICAgICAgIGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cbiAgICAgIC8vIHJlY29tcHV0ZSBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnNcbiAgICAgIHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCkge1xuICAgICAgICB2YXIgY29tcCA9IHBlbmRpbmdDb21wdXRhdGlvbnMuc2hpZnQoKTtcbiAgICAgICAgY29tcC5fcmVjb21wdXRlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmIChhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuICAgICAgICAvLyBjYWxsIG9uZSBhZnRlckZsdXNoIGNhbGxiYWNrLCB3aGljaCBtYXlcbiAgICAgICAgLy8gaW52YWxpZGF0ZSBtb3JlIGNvbXB1dGF0aW9uc1xuICAgICAgICB2YXIgZnVuYyA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBmdW5jLmNhbGwoZnVuYy5fY29udGV4dCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBfdGhyb3dPckxvZyhcImFmdGVyRmx1c2ggZnVuY3Rpb25cIiwgZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgZmluaXNoZWRUcnkgPSB0cnVlO1xuICB9IGZpbmFsbHkge1xuICAgIGlmICghIGZpbmlzaGVkVHJ5KSB7XG4gICAgICAvLyB3ZSdyZSBlcnJvcmluZ1xuICAgICAgaW5GbHVzaCA9IGZhbHNlOyAvLyBuZWVkZWQgYmVmb3JlIGNhbGxpbmcgYERlcHMuZmx1c2goKWAgYWdhaW5cbiAgICAgIERlcHMuZmx1c2goe190aHJvd0ZpcnN0RXJyb3I6IGZhbHNlfSk7IC8vIGZpbmlzaCBmbHVzaGluZ1xuICAgIH1cbiAgICB3aWxsRmx1c2ggPSBmYWxzZTtcbiAgICBpbkZsdXNoID0gZmFsc2U7XG4gIH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfYXV0b3J1blxuLy9cbi8vIFJ1biBmKCkuIFJlY29yZCBpdHMgZGVwZW5kZW5jaWVzLiBSZXJ1biBpdCB3aGVuZXZlciB0aGVcbi8vIGRlcGVuZGVuY2llcyBjaGFuZ2UuXG4vL1xuLy8gUmV0dXJucyBhIG5ldyBDb21wdXRhdGlvbiwgd2hpY2ggaXMgYWxzbyBwYXNzZWQgdG8gZi5cbi8vXG4vLyBMaW5rcyB0aGUgY29tcHV0YXRpb24gdG8gdGhlIGN1cnJlbnQgY29tcHV0YXRpb25cbi8vIHNvIHRoYXQgaXQgaXMgc3RvcHBlZCBpZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZC5cbkRlcHMuYXV0b3J1biA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcbiAgaWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBFcnJvcignRGVwcy5hdXRvcnVuIHJlcXVpcmVzIGEgZnVuY3Rpb24gYXJndW1lbnQnKTtcblxuICBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IHRydWU7XG4gIHZhciBjID0gbmV3IERlcHMuQ29tcHV0YXRpb24oZiwgRGVwcy5jdXJyZW50Q29tcHV0YXRpb24sIGN0eCk7XG5cbiAgaWYgKERlcHMuYWN0aXZlKVxuICAgIERlcHMub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgIGMuc3RvcCgpO1xuICAgIH0pO1xuXG4gIHJldHVybiBjO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19ub25yZWFjdGl2ZVxuLy9cbi8vIFJ1biBgZmAgd2l0aCBubyBjdXJyZW50IGNvbXB1dGF0aW9uLCByZXR1cm5pbmcgdGhlIHJldHVybiB2YWx1ZVxuLy8gb2YgYGZgLiAgVXNlZCB0byB0dXJuIG9mZiByZWFjdGl2aXR5IGZvciB0aGUgZHVyYXRpb24gb2YgYGZgLFxuLy8gc28gdGhhdCByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYWNjZXNzZWQgYnkgYGZgIHdpbGwgbm90IHJlc3VsdCBpbiBhbnlcbi8vIGNvbXB1dGF0aW9ucyBiZWluZyBpbnZhbGlkYXRlZC5cbkRlcHMubm9ucmVhY3RpdmUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIHZhciBwcmV2aW91cyA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICBzZXRDdXJyZW50Q29tcHV0YXRpb24obnVsbCk7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGYuY2FsbChjdHgpO1xuICB9IGZpbmFsbHkge1xuICAgIHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG4gIH1cbn07XG5cbi8vIHNpbWlsYXIgdG8gbm9ucmVhY3RpdmUgYnV0IHJldHVybnMgYSBmdW5jdGlvbiBpbnN0ZWFkIG9mXG4vLyBleGVjdHVpbmcgZm4gaW1tZWRpYXRlbHkuIGZvcndhcmRzIGFueSBhcmd1bWVudHMgcGFzc2VkIHRvIHRoZSBmdW5jdGlvblxuRGVwcy5ub25yZWFjdGFibGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICB2YXIgcHJldmlvdXMgPSBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbjtcbiAgICBzZXRDdXJyZW50Q29tcHV0YXRpb24obnVsbCk7XG4gICAgdHJ5IHtcbiAgICAgIHJldHVybiBmLmFwcGx5KGN0eCB8fCB0aGlzLCBhcmd1bWVudHMpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuICAgIH1cbiAgfVxufVxuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX29uaW52YWxpZGF0ZVxuRGVwcy5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIGlmICghIERlcHMuYWN0aXZlKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkRlcHMub25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgY3VycmVudENvbXB1dGF0aW9uXCIpO1xuXG4gIERlcHMuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19hZnRlcmZsdXNoXG5EZXBzLmFmdGVyRmx1c2ggPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIGYuX2NvbnRleHQgPSBjdHg7XG4gIGFmdGVyRmx1c2hDYWxsYmFja3MucHVzaChmKTtcbiAgcmVxdWlyZUZsdXNoKCk7XG59OyIsInZhciB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxuLy8gQmFja2JvbmUuRXZlbnRzXG4vLyAtLS0tLS0tLS0tLS0tLS1cblxuLy8gQSBtb2R1bGUgdGhhdCBjYW4gYmUgbWl4ZWQgaW4gdG8gKmFueSBvYmplY3QqIGluIG9yZGVyIHRvIHByb3ZpZGUgaXQgd2l0aFxuLy8gY3VzdG9tIGV2ZW50cy4gWW91IG1heSBiaW5kIHdpdGggYG9uYCBvciByZW1vdmUgd2l0aCBgb2ZmYCBjYWxsYmFja1xuLy8gZnVuY3Rpb25zIHRvIGFuIGV2ZW50OyBgdHJpZ2dlcmAtaW5nIGFuIGV2ZW50IGZpcmVzIGFsbCBjYWxsYmFja3MgaW5cbi8vIHN1Y2Nlc3Npb24uXG4vL1xuLy8gICAgIHZhciBvYmplY3QgPSB7fTtcbi8vICAgICB1dGlsLmV4dGVuZChvYmplY3QsIEJhY2tib25lLkV2ZW50cyk7XG4vLyAgICAgb2JqZWN0Lm9uKCdleHBhbmQnLCBmdW5jdGlvbigpeyBhbGVydCgnZXhwYW5kZWQnKTsgfSk7XG4vLyAgICAgb2JqZWN0LnRyaWdnZXIoJ2V4cGFuZCcpO1xuLy9cbnZhciBFdmVudHMgPSBtb2R1bGUuZXhwb3J0cyA9IHtcblxuXHQvLyBCaW5kIGFuIGV2ZW50IHRvIGEgYGNhbGxiYWNrYCBmdW5jdGlvbi4gUGFzc2luZyBgXCJhbGxcImAgd2lsbCBiaW5kXG5cdC8vIHRoZSBjYWxsYmFjayB0byBhbGwgZXZlbnRzIGZpcmVkLlxuXHRvbjogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblx0XHRpZiAoIWV2ZW50c0FwaSh0aGlzLCAnb24nLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSB8fCAhY2FsbGJhY2spIHJldHVybiB0aGlzO1xuXHRcdHRoaXMuX2V2ZW50cyB8fCAodGhpcy5fZXZlbnRzID0ge30pO1xuXHRcdHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV0gfHwgKHRoaXMuX2V2ZW50c1tuYW1lXSA9IFtdKTtcblx0XHRldmVudHMucHVzaCh7Y2FsbGJhY2s6IGNhbGxiYWNrLCBjb250ZXh0OiBjb250ZXh0LCBjdHg6IGNvbnRleHQgfHwgdGhpc30pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIEJpbmQgYW4gZXZlbnQgdG8gb25seSBiZSB0cmlnZ2VyZWQgYSBzaW5nbGUgdGltZS4gQWZ0ZXIgdGhlIGZpcnN0IHRpbWVcblx0Ly8gdGhlIGNhbGxiYWNrIGlzIGludm9rZWQsIGl0IHdpbGwgYmUgcmVtb3ZlZC5cblx0b25jZTogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblx0XHRpZiAoIWV2ZW50c0FwaSh0aGlzLCAnb25jZScsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHZhciBmbiA9IG9uY2UoZnVuY3Rpb24oKSB7XG5cdFx0XHRzZWxmLm9mZihuYW1lLCBmbik7XG5cdFx0XHRjYWxsYmFjay5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdH0pO1xuXHRcdGZuLl9jYWxsYmFjayA9IGNhbGxiYWNrO1xuXHRcdHJldHVybiB0aGlzLm9uKG5hbWUsIGZuLCBjb250ZXh0KTtcblx0fSxcblxuXHQvLyBSZW1vdmUgb25lIG9yIG1hbnkgY2FsbGJhY2tzLiBJZiBgY29udGV4dGAgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcblx0Ly8gY2FsbGJhY2tzIHdpdGggdGhhdCBmdW5jdGlvbi4gSWYgYGNhbGxiYWNrYCBpcyBudWxsLCByZW1vdmVzIGFsbFxuXHQvLyBjYWxsYmFja3MgZm9yIHRoZSBldmVudC4gSWYgYG5hbWVgIGlzIG51bGwsIHJlbW92ZXMgYWxsIGJvdW5kXG5cdC8vIGNhbGxiYWNrcyBmb3IgYWxsIGV2ZW50cy5cblx0b2ZmOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdHZhciByZXRhaW4sIGV2LCBldmVudHMsIG5hbWVzLCBpLCBsLCBqLCBrO1xuXHRcdGlmICghdGhpcy5fZXZlbnRzIHx8ICFldmVudHNBcGkodGhpcywgJ29mZicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pKSByZXR1cm4gdGhpcztcblx0XHRpZiAoIW5hbWUgJiYgIWNhbGxiYWNrICYmICFjb250ZXh0KSB7XG5cdFx0XHR0aGlzLl9ldmVudHMgPSB2b2lkIDA7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0bmFtZXMgPSBuYW1lID8gW25hbWVdIDogT2JqZWN0LmtleXModGhpcy5fZXZlbnRzKTtcblx0XHRmb3IgKGkgPSAwLCBsID0gbmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRuYW1lID0gbmFtZXNbaV07XG5cdFx0XHRpZiAoZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdKSB7XG5cdFx0XHRcdHRoaXMuX2V2ZW50c1tuYW1lXSA9IHJldGFpbiA9IFtdO1xuXHRcdFx0XHRpZiAoY2FsbGJhY2sgfHwgY29udGV4dCkge1xuXHRcdFx0XHRcdGZvciAoaiA9IDAsIGsgPSBldmVudHMubGVuZ3RoOyBqIDwgazsgaisrKSB7XG5cdFx0XHRcdFx0XHRldiA9IGV2ZW50c1tqXTtcblx0XHRcdFx0XHRcdGlmICgoY2FsbGJhY2sgJiYgY2FsbGJhY2sgIT09IGV2LmNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjay5fY2FsbGJhY2spIHx8XG5cdFx0XHRcdFx0XHRcdFx0KGNvbnRleHQgJiYgY29udGV4dCAhPT0gZXYuY29udGV4dCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0YWluLnB1c2goZXYpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXJldGFpbi5sZW5ndGgpIGRlbGV0ZSB0aGlzLl9ldmVudHNbbmFtZV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gVHJpZ2dlciBvbmUgb3IgbWFueSBldmVudHMsIGZpcmluZyBhbGwgYm91bmQgY2FsbGJhY2tzLiBDYWxsYmFja3MgYXJlXG5cdC8vIHBhc3NlZCB0aGUgc2FtZSBhcmd1bWVudHMgYXMgYHRyaWdnZXJgIGlzLCBhcGFydCBmcm9tIHRoZSBldmVudCBuYW1lXG5cdC8vICh1bmxlc3MgeW91J3JlIGxpc3RlbmluZyBvbiBgXCJhbGxcImAsIHdoaWNoIHdpbGwgY2F1c2UgeW91ciBjYWxsYmFjayB0b1xuXHQvLyByZWNlaXZlIHRoZSB0cnVlIG5hbWUgb2YgdGhlIGV2ZW50IGFzIHRoZSBmaXJzdCBhcmd1bWVudCkuXG5cdHRyaWdnZXI6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRpZiAoIXRoaXMuX2V2ZW50cykgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICd0cmlnZ2VyJywgbmFtZSwgYXJncykpIHJldHVybiB0aGlzO1xuXHRcdHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV07XG5cdFx0dmFyIGFsbEV2ZW50cyA9IHRoaXMuX2V2ZW50cy5hbGw7XG5cdFx0aWYgKGV2ZW50cykgdHJpZ2dlckV2ZW50cyhldmVudHMsIGFyZ3MpO1xuXHRcdGlmIChhbGxFdmVudHMpIHRyaWdnZXJFdmVudHMoYWxsRXZlbnRzLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIFRlbGwgdGhpcyBvYmplY3QgdG8gc3RvcCBsaXN0ZW5pbmcgdG8gZWl0aGVyIHNwZWNpZmljIGV2ZW50cyAuLi4gb3Jcblx0Ly8gdG8gZXZlcnkgb2JqZWN0IGl0J3MgY3VycmVudGx5IGxpc3RlbmluZyB0by5cblx0c3RvcExpc3RlbmluZzogZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuXHRcdHZhciBsaXN0ZW5pbmdUbyA9IHRoaXMuX2xpc3RlbmluZ1RvO1xuXHRcdGlmICghbGlzdGVuaW5nVG8pIHJldHVybiB0aGlzO1xuXHRcdHZhciByZW1vdmUgPSAhbmFtZSAmJiAhY2FsbGJhY2s7XG5cdFx0aWYgKCFjYWxsYmFjayAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcblx0XHRpZiAob2JqKSAobGlzdGVuaW5nVG8gPSB7fSlbb2JqLl9saXN0ZW5JZF0gPSBvYmo7XG5cdFx0Zm9yICh2YXIgaWQgaW4gbGlzdGVuaW5nVG8pIHtcblx0XHRcdG9iaiA9IGxpc3RlbmluZ1RvW2lkXTtcblx0XHRcdG9iai5vZmYobmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuXHRcdFx0aWYgKHJlbW92ZSB8fCBpc0VtcHR5KG9iai5fZXZlbnRzKSkgZGVsZXRlIHRoaXMuX2xpc3RlbmluZ1RvW2lkXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxufTtcblxuLy8gUmVndWxhciBleHByZXNzaW9uIHVzZWQgdG8gc3BsaXQgZXZlbnQgc3RyaW5ncy5cbnZhciBldmVudFNwbGl0dGVyID0gL1xccysvO1xuXG4vLyBJbXBsZW1lbnQgZmFuY3kgZmVhdHVyZXMgb2YgdGhlIEV2ZW50cyBBUEkgc3VjaCBhcyBtdWx0aXBsZSBldmVudFxuLy8gbmFtZXMgYFwiY2hhbmdlIGJsdXJcImAgYW5kIGpRdWVyeS1zdHlsZSBldmVudCBtYXBzIGB7Y2hhbmdlOiBhY3Rpb259YFxuLy8gaW4gdGVybXMgb2YgdGhlIGV4aXN0aW5nIEFQSS5cbnZhciBldmVudHNBcGkgPSBmdW5jdGlvbihvYmosIGFjdGlvbiwgbmFtZSwgcmVzdCkge1xuXHRpZiAoIW5hbWUpIHJldHVybiB0cnVlO1xuXG5cdC8vIEhhbmRsZSBldmVudCBtYXBzLlxuXHRpZiAodHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIG5hbWUpIHtcblx0XHRcdG9ialthY3Rpb25dLmFwcGx5KG9iaiwgW2tleSwgbmFtZVtrZXldXS5jb25jYXQocmVzdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBIYW5kbGUgc3BhY2Ugc2VwYXJhdGVkIGV2ZW50IG5hbWVzLlxuXHRpZiAoZXZlbnRTcGxpdHRlci50ZXN0KG5hbWUpKSB7XG5cdFx0dmFyIG5hbWVzID0gbmFtZS5zcGxpdChldmVudFNwbGl0dGVyKTtcblx0XHRmb3IgKHZhciBpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0b2JqW2FjdGlvbl0uYXBwbHkob2JqLCBbbmFtZXNbaV1dLmNvbmNhdChyZXN0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBkaWZmaWN1bHQtdG8tYmVsaWV2ZSwgYnV0IG9wdGltaXplZCBpbnRlcm5hbCBkaXNwYXRjaCBmdW5jdGlvbiBmb3Jcbi8vIHRyaWdnZXJpbmcgZXZlbnRzLiBUcmllcyB0byBrZWVwIHRoZSB1c3VhbCBjYXNlcyBzcGVlZHkgKG1vc3QgaW50ZXJuYWxcbi8vIEJhY2tib25lIGV2ZW50cyBoYXZlIDMgYXJndW1lbnRzKS5cbnZhciB0cmlnZ2VyRXZlbnRzID0gZnVuY3Rpb24oZXZlbnRzLCBhcmdzKSB7XG5cdHZhciBldiwgaSA9IC0xLCBsID0gZXZlbnRzLmxlbmd0aCwgYTEgPSBhcmdzWzBdLCBhMiA9IGFyZ3NbMV0sIGEzID0gYXJnc1syXTtcblx0c3dpdGNoIChhcmdzLmxlbmd0aCkge1xuXHRcdGNhc2UgMDogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgpOyByZXR1cm47XG5cdFx0Y2FzZSAxOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEpOyByZXR1cm47XG5cdFx0Y2FzZSAyOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyKTsgcmV0dXJuO1xuXHRcdGNhc2UgMzogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMiwgYTMpOyByZXR1cm47XG5cdFx0ZGVmYXVsdDogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suYXBwbHkoZXYuY3R4LCBhcmdzKTsgcmV0dXJuO1xuXHR9XG59O1xuXG52YXIgbGlzdGVuTWV0aG9kcyA9IHtsaXN0ZW5UbzogJ29uJywgbGlzdGVuVG9PbmNlOiAnb25jZSd9O1xuXG4vLyBJbnZlcnNpb24tb2YtY29udHJvbCB2ZXJzaW9ucyBvZiBgb25gIGFuZCBgb25jZWAuIFRlbGwgKnRoaXMqIG9iamVjdCB0b1xuLy8gbGlzdGVuIHRvIGFuIGV2ZW50IGluIGFub3RoZXIgb2JqZWN0IC4uLiBrZWVwaW5nIHRyYWNrIG9mIHdoYXQgaXQnc1xuLy8gbGlzdGVuaW5nIHRvLlxudXRpbC5lYWNoKGxpc3Rlbk1ldGhvZHMsIGZ1bmN0aW9uKGltcGxlbWVudGF0aW9uLCBtZXRob2QpIHtcblx0RXZlbnRzW21ldGhvZF0gPSBmdW5jdGlvbihvYmosIG5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0dmFyIGxpc3RlbmluZ1RvID0gdGhpcy5fbGlzdGVuaW5nVG8gfHwgKHRoaXMuX2xpc3RlbmluZ1RvID0ge30pO1xuXHRcdHZhciBpZCA9IG9iai5fbGlzdGVuSWQgfHwgKG9iai5fbGlzdGVuSWQgPSB1dGlsLnVuaXF1ZUlkKCdsJykpO1xuXHRcdGxpc3RlbmluZ1RvW2lkXSA9IG9iajtcblx0XHRpZiAoIWNhbGxiYWNrICYmIHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JykgY2FsbGJhY2sgPSB0aGlzO1xuXHRcdG9ialtpbXBsZW1lbnRhdGlvbl0obmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xufSk7XG5cbi8vIEFsaWFzZXMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuRXZlbnRzLmJpbmQgICA9IEV2ZW50cy5vbjtcbkV2ZW50cy51bmJpbmQgPSBFdmVudHMub2ZmO1xuXG5mdW5jdGlvbiBpc0VtcHR5KG9iaikge1xuXHRpZiAob2JqID09IG51bGwpIHJldHVybiB0cnVlO1xuXHRpZiAoQXJyYXkuaXNBcnJheShvYmopIHx8IHR5cGVvZiBvYmogPT09IFwic3RyaW5nXCIpIHJldHVybiBvYmoubGVuZ3RoID09PSAwO1xuXHRmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAodXRpbC5oYXMob2JqLCBrZXkpKSByZXR1cm4gZmFsc2U7XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBvbmNlKGZ1bmMpIHtcblx0dmFyIHJhbiA9IGZhbHNlLCBtZW1vO1xuXHRyZXR1cm4gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHJhbikgcmV0dXJuIG1lbW87XG5cdFx0cmFuID0gdHJ1ZTtcblx0XHRtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdGZ1bmMgPSBudWxsO1xuXHRcdHJldHVybiBtZW1vO1xuXHR9XG59IiwidmFyIEJpbmRpbmcgPSByZXF1aXJlKFwiLi9iaW5kaW5nXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBCaW5kaW5nLmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdEJpbmRpbmcuY2FsbCh0aGlzKTtcblx0XHR0aGlzLm5vZGVzID0gW107XG5cdFx0dGhpcy5zZXRWYWx1ZSh2YWx1ZSk7XG5cdH0sXG5cblx0aW5zZXJ0QmVmb3JlOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJIVE1MIGJpbmRpbmdzIGNhbid0IGhhdmUgY2hpbGRyZW4uXCIpO1xuXHR9LFxuXG5cdHVwZGF0ZU5vZGVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgcGFyZW50Tm9kZSA9IHRoaXMucGFyZW50Tm9kZSxcblx0XHRcdGJlZm9yZU5vZGUsIG5vZGUsIGk7XG5cblx0XHQvLyBwbGFjZSB0aGUgbm9kZXMgaW4gdGhlIGRvbVxuXHRcdGlmIChwYXJlbnROb2RlICE9IG51bGwpIHtcblx0XHRcdGJlZm9yZU5vZGUgPSB0aGlzLm5leHRTaWJsaW5nTm9kZTtcblxuXHRcdFx0Zm9yIChpID0gdGhpcy5ub2Rlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRub2RlID0gdGhpcy5ub2Rlc1tpXTtcblxuXHRcdFx0XHRpZiAoIXV0aWwuaXNOb2RlQXRET01Qb3NpdGlvbihub2RlLCBwYXJlbnROb2RlLCBiZWZvcmVOb2RlKSkge1xuXHRcdFx0XHRcdHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKG5vZGUsIGJlZm9yZU5vZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmVmb3JlTm9kZSA9IG5vZGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gb3IgdGFrZSB0aGVtIG91dFxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5yZW1vdmVOb2RlcygpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJpZ2dlcihcInVwZGF0ZVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIG5vZGUsIGk7XG5cblx0XHRmb3IgKGkgPSAwOyBpIDwgdGhpcy5ub2Rlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0bm9kZSA9IHRoaXMubm9kZXNbaV07XG5cdFx0XHRpZiAobm9kZS5wYXJlbnROb2RlICE9IG51bGwpIG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRzZXRWYWx1ZTogZnVuY3Rpb24odmFsKSB7XG5cdFx0aWYgKHZhbCBpbnN0YW5jZW9mIE5vZGUpIHtcblx0XHRcdHZhbCA9IHZhbC5ub2RlVHlwZSA9PT0gMTEgPyB1dGlsLnRvQXJyYXkodmFsLmNoaWxkTm9kZXMpIDogWyB2YWwgXTtcblx0XHR9XG5cblx0XHRpZiAoIUFycmF5LmlzQXJyYXkodmFsKSkge1xuXHRcdFx0dmFsID0gdmFsICE9IG51bGwgPyB2YWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0XHRcblx0XHRcdC8vIGNvbnZlcnQgaHRtbCBpbnRvIERPTSBub2Rlc1xuXHRcdFx0dmFyIGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdFx0XHRkaXYuaW5uZXJIVE1MID0gdmFsO1xuXHRcdFx0dmFsID0gdXRpbC50b0FycmF5KGRpdi5jaGlsZE5vZGVzKTtcblx0XHR9XG5cblx0XHR0aGlzLnJlbW92ZU5vZGVzKCk7XG5cdFx0dGhpcy5ub2RlcyA9IHZhbDtcblx0XHR0aGlzLnVwZGF0ZU5vZGVzKCk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHR0b05vZGVzOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlcy5zbGljZSgwKTtcblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGVzWzBdIHx8IG51bGw7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgaywgbm9kZSwgcmVzdWx0O1xuXG5cdFx0Zm9yIChrIGluIHRoaXMubm9kZXMpIHtcblx0XHRcdG5vZGUgPSB0aGlzLm5vZGVzW2tdO1xuXHRcdFx0aWYgKG5vZGUubm9kZVR5cGUgIT09IDEpIGNvbnRpbnVlO1xuXG5cdFx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3Iobm9kZSwgc2VsZWN0b3IpKSByZXR1cm4gbm9kZTtcblx0XHRcdHJlc3VsdCA9IG5vZGUucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdFx0XHRpZiAocmVzdWx0ICE9IG51bGwpIHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgaywgbm9kZSwgZWxzID0gW107XG5cblx0XHRmb3IgKGsgaW4gdGhpcy5ub2Rlcykge1xuXHRcdFx0bm9kZSA9IHRoaXMubm9kZXNba107XG5cdFx0XHRpZiAobm9kZS5ub2RlVHlwZSAhPT0gMSkgY29udGludWU7XG5cblx0XHRcdGlmICh1dGlsLm1hdGNoZXNTZWxlY3Rvcihub2RlLCBzZWxlY3RvcikpIG1hdGNoZXMucHVzaChub2RlKTtcblx0XHRcdGVscy5wdXNoLmFwcGx5KGVscywgdXRpbC50b0FycmF5KG5vZGUucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxzO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlcy5tYXAoZnVuY3Rpb24obm9kZSkge1xuXHRcdFx0cmV0dXJuIG5vZGUubm9kZVR5cGUgPT09IDEgPyBub2RlLm91dGVySFRNTCA6IG5vZGUubm9kZVZhbHVlO1xuXHRcdH0pLmpvaW4oXCJcIik7XG5cdH1cbn0pO1xuIiwidmFyIEJpbmRpbmcgPSByZXF1aXJlKFwiLi9iaW5kaW5nXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxuLy8gZXhwb3J0XG52YXIgVGVtcGxlID1cbm1vZHVsZS5leHBvcnRzID0gQmluZGluZy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oKSB7XG5cdFx0QmluZGluZy5jYWxsKHRoaXMpO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9LFxuXHRpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmFwcGVuZCh1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSk7XG5cdH1cbn0pO1xuXG4vLyBzdGF0aWMgcHJvcGVydGllcy9tZXRob2RzXG5UZW1wbGUuVkVSU0lPTiA9IFwiMC4zLjRcIjtcblRlbXBsZS51dGlsID0gdXRpbDtcblRlbXBsZS5FdmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIik7XG5UZW1wbGUuQmluZGluZyA9IEJpbmRpbmc7XG5cbi8vIGRlcHMgc2V0dXBcbnZhciBEZXBzID0gVGVtcGxlLkRlcHMgPSByZXF1aXJlKFwiLi9kZXBzXCIpO1xuVGVtcGxlLmF1dG9ydW4gPSBEZXBzLmF1dG9ydW47XG5UZW1wbGUubm9ucmVhY3RpdmUgPSBEZXBzLm5vbnJlYWN0aXZlO1xuVGVtcGxlLm5vbnJlYWN0YWJsZSA9IERlcHMubm9ucmVhY3RhYmxlO1xuVGVtcGxlLkRlcGVuZGVuY3kgPSBEZXBzLkRlcGVuZGVuY3k7IiwidmFyIEJpbmRpbmcgPSByZXF1aXJlKFwiLi9iaW5kaW5nXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxudmFyIGRlbGVnYXRlRXZlbnRTcGxpdHRlciA9IC9eKFxcUyspXFxzKiguKikkLztcblxudmFyIE5vZGUgPVxuZXhwb3J0cy5Ob2RlID0gQmluZGluZy5leHRlbmQoe1xuXHR1cGRhdGVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHBhcmVudE5vZGUgPSB0aGlzLnBhcmVudE5vZGUsXG5cdFx0XHRiZWZvcmVOb2RlID0gdGhpcy5uZXh0U2libGluZ05vZGU7XG5cblx0XHQvLyBwbGFjZSB0aGUgbm9kZSBpbiB0aGUgZG9tXG5cdFx0aWYgKHBhcmVudE5vZGUgIT0gbnVsbCAmJiAhdXRpbC5pc05vZGVBdERPTVBvc2l0aW9uKHRoaXMubm9kZSwgcGFyZW50Tm9kZSwgYmVmb3JlTm9kZSkpIHtcblx0XHRcdHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMubm9kZSwgYmVmb3JlTm9kZSk7XG5cdFx0fVxuXG5cdFx0Ly8gb3IgdGFrZSBpdCBvdXRcblx0XHRlbHNlIGlmIChwYXJlbnROb2RlID09IG51bGwgJiYgdGhpcy5ub2RlLnBhcmVudE5vZGUgIT0gbnVsbCkge1xuXHRcdFx0dGhpcy5ub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5ub2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyaWdnZXIoXCJ1cGRhdGVcIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0dG9Ob2RlczogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIFsgdGhpcy5ub2RlIF07XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbnVsbDsgfSxcblx0ZmluZEFsbDogZnVuY3Rpb24oKSB7IHJldHVybiBbXTsgfVxufSk7XG5cbmZ1bmN0aW9uIGxlYWZOb2RlKG5vZGVUeXBlLCBtZXRob2ROYW1lLCBodW1hblR5cGUpIHtcblx0cmV0dXJuIE5vZGUuZXh0ZW5kKHtcblx0XHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24obm9kZU9yVmFsdWUpIHtcblx0XHRcdC8vIHRleHQgbm9kZVxuXHRcdFx0aWYgKG5vZGVPclZhbHVlIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUgJiYgbm9kZU9yVmFsdWUubm9kZVR5cGUgPT09IG5vZGVUeXBlKSB7XG5cdFx0XHRcdHRoaXMubm9kZSA9IG5vZGVPclZhbHVlO1xuXHRcdFx0XHR0aGlzLnZhbHVlID0gbm9kZU9yVmFsdWUubm9kZVZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhbnl0aGluZyBlbHNlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy5ub2RlID0gZG9jdW1lbnRbbWV0aG9kTmFtZV0oXCJcIik7XG5cdFx0XHRcdHRoaXMuc2V0VmFsdWUobm9kZU9yVmFsdWUpO1xuXHRcdFx0fVxuXG5cdFx0XHROb2RlLmNhbGwodGhpcyk7XG5cdFx0fSxcblxuXHRcdGluc2VydEJlZm9yZTogZnVuY3Rpb24oKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoaHVtYW5UeXBlICsgXCIgYmluZGluZ3MgY2FuJ3QgaGF2ZSBjaGlsZHJlbi5cIik7XG5cdFx0fSxcblxuXHRcdHNldFZhbHVlOiBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFsdWUgPSB2YWx1ZSAhPSBudWxsID8gdmFsdWUudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0XHRpZiAodmFsdWUgIT09IHRoaXMubm9kZS5ub2RlVmFsdWUpIHRoaXMubm9kZS5ub2RlVmFsdWUgPSB2YWx1ZTtcblx0XHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0sXG5cblx0XHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ub2RlLm5vZGVWYWx1ZTtcblx0XHR9XG5cdH0pO1xufVxuXG52YXIgVGV4dCA9IGV4cG9ydHMuVGV4dCA9IGxlYWZOb2RlKDMsIFwiY3JlYXRlVGV4dE5vZGVcIiwgXCJUZXh0XCIpO1xudmFyIENvbW1lbnQgPSBleHBvcnRzLkNvbW1lbnQgPSBsZWFmTm9kZSg4LCBcImNyZWF0ZUNvbW1lbnRcIiwgXCJDb21tZW50XCIpO1xuXG5Db21tZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gXCI8IS0tXCIgKyB0aGlzLm5vZGUubm9kZVZhbHVlICsgXCItLT5cIjtcbn1cblxudmFyIEVsZW1lbnQgPVxuZXhwb3J0cy5FbGVtZW50ID0gTm9kZS5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24obm9kZU9yVGFnTmFtZSkge1xuXHRcdHZhciBjaGlsZHJlbiA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xuXG5cdFx0Ly8gZWxlbWVudFxuXHRcdGlmIChub2RlT3JUYWdOYW1lIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUgJiYgbm9kZU9yVGFnTmFtZS5ub2RlVHlwZSA9PT0gMSkge1xuXHRcdFx0dGhpcy5ub2RlID0gbm9kZU9yVGFnTmFtZTtcblx0XHRcdHRoaXMudGFnbmFtZSA9IG5vZGVPclRhZ05hbWUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0XHQvLyBhZGQgY2hpbGQgbm9kZXMgYXMgZnVydGhlciBjaGlsZHJlblxuXHRcdFx0Ly8gbm90ZTogdGhpcyBtYXkgYWZmZWN0IHRoZSBvcmlnaW5hbCBub2RlJ3MgY2hpbGRyZW5cblx0XHRcdGZyb21Ob2RlKHV0aWwudG9BcnJheShub2RlT3JUYWdOYW1lLmNoaWxkTm9kZXMpKVxuXHRcdFx0XHQuZm9yRWFjaChmdW5jdGlvbihiKSB7IGNoaWxkcmVuLnB1c2goYik7IH0pO1xuXHRcdH1cblxuXHRcdC8vIHN0cmluZ1xuXHRcdGVsc2UgaWYgKHR5cGVvZiBub2RlT3JUYWdOYW1lID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHR0aGlzLnRhZ25hbWUgPSBub2RlT3JUYWdOYW1lO1xuXHRcdFx0dGhpcy5ub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChub2RlT3JUYWdOYW1lKTtcblx0XHR9XG5cblx0XHQvLyBvciBlcnJvclxuXHRcdGVsc2UgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgZWxlbWVudCB0YWcgbmFtZS5cIik7XG5cblx0XHQvLyBydW4gcGFyZW50IGNvbnRzdHJ1Y3RvclxuXHRcdE5vZGUuYXBwbHkodGhpcywgY2hpbGRyZW4pO1xuXG5cdFx0Ly8gYXBwbHkgZXZlbnRzXG5cdFx0dmFyIGV2ZW50cyA9IHR5cGVvZiB0aGlzLmV2ZW50cyA9PT0gXCJmdW5jdGlvblwiID8gdGhpcy5ldmVudHMuY2FsbCh0aGlzKSA6IHRoaXMuZXZlbnRzO1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KGV2ZW50cykpIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihldmVudHMpO1xuXHR9LFxuXG5cdGdldEF0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUuZ2V0QXR0cmlidXRlKG5hbWUpO1xuXHR9LFxuXG5cdHNldEF0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcblx0XHR0aGlzLm5vZGUuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR0aGlzLm5vZGUucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGF0dHI6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QobmFtZSkgJiYgdmFsdWUgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKG5hbWUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5hdHRyKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0aGlzLmdldEF0dHJpYnV0ZShuYW1lKTtcblx0XHRlbHNlIHRoaXMuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHByb3A6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QobmFtZSkgJiYgdmFsdWUgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKG5hbWUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5wcm9wKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0aGlzLm5vZGVbbmFtZV07XG5cdFx0ZWxzZSB0aGlzLm5vZGVbbmFtZV0gPSB2YWx1ZTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHN0eWxlOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KG5hbWUpICYmIHZhbHVlID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaChuYW1lLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMuc3R5bGUobiwgdik7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIGdldENvbXB1dGVkU3R5bGUodGhpcy5ub2RlKVtuYW1lXTtcblx0XHRlbHNlIHRoaXMubm9kZS5zdHlsZVtuYW1lXSA9IHZhbHVlO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aGFzQ2xhc3M6IGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKGNsYXNzTmFtZSk7XG5cdH0sXG5cblx0YWRkQ2xhc3M6IGZ1bmN0aW9uKCkge1xuXHRcdHV0aWwuZmxhdHRlbih1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSkuZm9yRWFjaChmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRcdHRoaXMubm9kZS5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZS5zcGxpdChcIiBcIikpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQ2xhc3M6IGZ1bmN0aW9uKCkge1xuXHRcdHV0aWwuZmxhdHRlbih1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSkuZm9yRWFjaChmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRcdHRoaXMubm9kZS5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzTmFtZS5zcGxpdChcIiBcIikpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24odHlwZSwgc2VsLCBsaXN0ZW5lcikge1xuXHRcdC8vIHN5bnRheDogYWRkRXZlbnRMaXN0ZW5lcih7IFwidHlwZSBzZWxlY3RvclwiOiBsaXN0ZW5lciB9KVxuXHRcdGlmICh1dGlsLmlzT2JqZWN0KHR5cGUpKSB7XG5cdFx0XHR1dGlsLmVhY2godHlwZSwgZnVuY3Rpb24odiwgbikge1xuXHRcdFx0XHR2YXIgbSA9IG4ubWF0Y2goZGVsZWdhdGVFdmVudFNwbGl0dGVyKTtcblx0XHRcdFx0dGhpcy5hZGRFdmVudExpc3RlbmVyKG1bMV0sIG1bMl0sIHYpO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0XHRcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdC8vIHN5bnRheDogYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcilcblx0XHRpZiAodHlwZW9mIHNlbCA9PT0gXCJmdW5jdGlvblwiICYmIGxpc3RlbmVyID09IG51bGwpIHtcblx0XHRcdGxpc3RlbmVyID0gc2VsO1xuXHRcdFx0c2VsID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHR5cGUgIT09IFwic3RyaW5nXCIgfHwgdHlwZSA9PT0gXCJcIikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZXZlbnQgbmFtZS5cIik7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGxpc3RlbmVyLlwiKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZXZlbnRMaXN0ZW5lcnMgPT0gbnVsbCkgdGhpcy5fZXZlbnRMaXN0ZW5lcnMgPSBbXTtcblx0XHR0aGlzLl9ldmVudExpc3RlbmVycy5wdXNoKHsgdHlwZTogdHlwZSwgbGlzdGVuZXI6IGxpc3RlbmVyLCBldmVudDogZXZlbnRMaXN0ZW5lciB9KTtcblx0XHR0aGlzLm5vZGUuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBldmVudExpc3RlbmVyKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXG5cdFx0ZnVuY3Rpb24gZXZlbnRMaXN0ZW5lcihlKSB7XG5cdFx0XHR2YXIgZGVsZWdhdGU7XG5cblx0XHRcdGlmICh0eXBlb2Ygc2VsID09PSBcInN0cmluZ1wiICYmIHNlbCAhPT0gXCJcIikge1xuXHRcdFx0XHRkZWxlZ2F0ZSA9IHV0aWwuY2xvc2VzdChlLnRhcmdldCwgc2VsKTtcblx0XHRcdFx0aWYgKCFkZWxlZ2F0ZSkgcmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsaXN0ZW5lci5jYWxsKHNlbGYsIGUsIGRlbGVnYXRlKTtcblx0XHR9XG5cdH0sXG5cblx0cmVtb3ZlRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcblx0XHR2YXIgZXZ0cyA9IFtdO1xuXG5cdFx0aWYgKHR5cGVvZiB0eXBlID09PSBcImZ1bmN0aW9uXCIgJiYgbGlzdGVuZXIgPT0gbnVsbCkge1xuXHRcdFx0bGlzdGVuZXIgPSB0eXBlO1xuXHRcdFx0dHlwZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHV0aWwuaXNPYmplY3QodHlwZSkpIHtcblx0XHRcdHV0aWwuZWFjaCh0eXBlLCBmdW5jdGlvbih2LCBuKSB7XG5cdFx0XHRcdHZhciBtID0gbi5tYXRjaChkZWxlZ2F0ZUV2ZW50U3BsaXR0ZXIpO1xuXHRcdFx0XHRldnRzLnB1c2guYXBwbHkoZXZ0cywgdGhpcy5fZXZlbnRMaXN0ZW5lcnMuZmlsdGVyKGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZS50eXBlID09PSBtWzFdICYmIGUubGlzdGVuZXIgPT09IHYgJiYgIX5ldnRzLmluZGV4T2YoZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRldnRzID0gdGhpcy5fZXZlbnRMaXN0ZW5lcnMuZmlsdGVyKGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0cmV0dXJuICh0eXBlID09IG51bGwgfHwgdHlwZSA9PT0gZS50eXBlKSAmJiAobGlzdGVuZXIgPT0gbnVsbCB8fCBsaXN0ZW5lciA9PT0gZS5saXN0ZW5lcik7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRldnRzLmZvckVhY2goZnVuY3Rpb24oZSkge1xuXHRcdFx0dmFyIGluZGV4ID0gdGhpcy5fZXZlbnRMaXN0ZW5lcnMuaW5kZXhPZihlKTtcblxuXHRcdFx0aWYgKH5pbmRleCkge1xuXHRcdFx0XHR0aGlzLm5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihlLnR5cGUsIGUuZXZlbnQpO1xuXHRcdFx0XHR0aGlzLl9ldmVudExpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3IodGhpcy5ub2RlLCBzZWxlY3RvcikpIHJldHVybiB0aGlzLm5vZGU7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBlbHMgPSBbXTtcblx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3IodGhpcy5ub2RlLCBzZWxlY3RvcikpIGVscy5wdXNoKHRoaXMubm9kZSk7XG5cdFx0ZWxzLnB1c2guYXBwbHkoZWxzLCB1dGlsLnRvQXJyYXkodGhpcy5ub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSk7XG5cdFx0cmV0dXJuIGVscztcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5vdXRlckhUTUw7XG5cdH1cbn0pO1xuXG4vLyBmYXN0IGNvbnN0cnVjdG9ycyBmb3IgdHlwaWNhbCBET00gZWxlbWVudCB0YWduYW1lc1xuZXhwb3J0cy5ET00gPSB7fTtcblxuWyAvLyBIVE1MIHRhZ25hbWVzOyB0aGlzIGxpc3QgaXMgdGFrZW4gZnJvbSBGQidzIFJlYWN0XG5cblwiYVwiLCBcImFiYnJcIiwgXCJhZGRyZXNzXCIsIFwiYXJlYVwiLCBcImFydGljbGVcIiwgXCJhc2lkZVwiLCBcImF1ZGlvXCIsIFwiYlwiLCBcImJhc2VcIiwgXCJiZGlcIixcblwiYmRvXCIsIFwiYmlnXCIsIFwiYmxvY2txdW90ZVwiLCBcImJvZHlcIiwgXCJiclwiLCBcImJ1dHRvblwiLCBcImNhbnZhc1wiLCBcImNhcHRpb25cIiwgXCJjaXRlXCIsXG5cImNvZGVcIiwgXCJjb2xcIiwgXCJjb2xncm91cFwiLCBcImRhdGFcIiwgXCJkYXRhbGlzdFwiLCBcImRkXCIsIFwiZGVsXCIsIFwiZGV0YWlsc1wiLCBcImRmblwiLFxuXCJkaXZcIiwgXCJkbFwiLCBcImR0XCIsIFwiZW1cIiwgXCJlbWJlZFwiLCBcImZpZWxkc2V0XCIsIFwiZmlnY2FwdGlvblwiLCBcImZpZ3VyZVwiLCBcImZvb3RlclwiLFxuXCJmb3JtXCIsIFwiaDFcIiwgXCJoMlwiLCBcImgzXCIsIFwiaDRcIiwgXCJoNVwiLCBcImg2XCIsIFwiaGVhZFwiLCBcImhlYWRlclwiLCBcImhyXCIsIFwiaHRtbFwiLCBcImlcIixcblwiaWZyYW1lXCIsIFwiaW1nXCIsIFwiaW5wdXRcIiwgXCJpbnNcIiwgXCJrYmRcIiwgXCJrZXlnZW5cIiwgXCJsYWJlbFwiLCBcImxlZ2VuZFwiLCBcImxpXCIsXG5cImxpbmtcIiwgXCJtYWluXCIsIFwibWFwXCIsIFwibWFya1wiLCBcIm1lbnVcIiwgXCJtZW51aXRlbVwiLCBcIm1ldGFcIiwgXCJtZXRlclwiLCBcIm5hdlwiLFxuXCJub3NjcmlwdFwiLCBcIm9iamVjdFwiLCBcIm9sXCIsIFwib3B0Z3JvdXBcIiwgXCJvcHRpb25cIiwgXCJvdXRwdXRcIiwgXCJwXCIsIFwicGFyYW1cIiwgXCJwcmVcIixcblwicHJvZ3Jlc3NcIiwgXCJxXCIsIFwicnBcIiwgXCJydFwiLCBcInJ1YnlcIiwgXCJzXCIsIFwic2FtcFwiLCBcInNjcmlwdFwiLCBcInNlY3Rpb25cIiwgXCJzZWxlY3RcIixcblwic21hbGxcIiwgXCJzb3VyY2VcIiwgXCJzcGFuXCIsIFwic3Ryb25nXCIsIFwic3R5bGVcIiwgXCJzdWJcIiwgXCJzdW1tYXJ5XCIsIFwic3VwXCIsIFwidGFibGVcIixcblwidGJvZHlcIiwgXCJ0ZFwiLCBcInRleHRhcmVhXCIsIFwidGZvb3RcIiwgXCJ0aFwiLCBcInRoZWFkXCIsIFwidGltZVwiLCBcInRpdGxlXCIsIFwidHJcIixcblwidHJhY2tcIiwgXCJ1XCIsIFwidWxcIiwgXCJ2YXJcIiwgXCJ2aWRlb1wiLCBcIndiclwiXG5cbl0uZm9yRWFjaChmdW5jdGlvbih0KSB7XG5cdGV4cG9ydHMuRE9NW3RdID0gRWxlbWVudC5leHRlbmQoe1xuXHRcdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBhcmdzID0gdXRpbC50b0FycmF5KGFyZ3VtZW50cyk7XG5cdFx0XHRhcmdzLnVuc2hpZnQodCk7XG5cdFx0XHRFbGVtZW50LmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH1cblx0fSk7XG59KTtcblxuLy8gY29udmVydHMgZG9tIG5vZGVzIGludG8gYmluZGluZyBlcXVpdmFsZW50c1xudmFyIGZyb21Ob2RlID1cbmV4cG9ydHMuZnJvbU5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG5cdGlmIChBcnJheS5pc0FycmF5KG5vZGUpKSB7XG5cdFx0cmV0dXJuIG5vZGUubWFwKGZyb21Ob2RlKVxuXHRcdFx0LmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9IG51bGw7IH0pO1xuXHR9XG5cblx0c3dpdGNoIChub2RlLm5vZGVUeXBlKSB7XG5cdFx0Ly8gRWxlbWVudFxuXHRcdGNhc2UgMTogcmV0dXJuIG5ldyBFbGVtZW50KG5vZGUpO1xuXHRcdFxuXHRcdC8vIFRleHQgTm9kZVxuXHRcdGNhc2UgMzogcmV0dXJuIG5ldyBUZXh0KG5vZGUpO1xuXHRcdFxuXHRcdC8vIENvbW1lbnQgTm9kZVxuXHRcdGNhc2UgODogcmV0dXJuIG5ldyBDb21tZW50KG5vZGUpO1xuXG5cdFx0Ly8gRG9jdW1lbnQgRnJhZ21lbnRcblx0XHRjYXNlIDExOlxuXHRcdFx0dmFyIGJpbmRpbmcgPSBuZXcgQmluZGluZztcblxuXHRcdFx0ZnJvbU5vZGUodXRpbC50b0FycmF5KG5vZGUuY2hpbGROb2RlcykpXG5cdFx0XHRcdC5mb3JFYWNoKGJpbmRpbmcuYXBwZW5kQ2hpbGQsIGJpbmRpbmcpO1xuXG5cdFx0XHRyZXR1cm4gYmluZGluZztcblx0fVxufVxuXG4vLyBjb252ZXJ0cyBhIHN0cmluZyBvZiBIVE1MIGludG8gYSBzZXQgb2Ygc3RhdGljIGJpbmRpbmdzXG5leHBvcnRzLmZyb21IVE1MID0gZnVuY3Rpb24oaHRtbCkge1xuXHR2YXIgY29udCwgbm9kZXM7XG5cdGNvbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpXG5cdGNvbnQuaW5uZXJIVE1MID0gaHRtbDtcblx0bm9kZXMgPSB1dGlsLnRvQXJyYXkoY29udC5jaGlsZE5vZGVzKTtcblx0cmV0dXJuIGZyb21Ob2RlKG5vZGVzLmxlbmd0aCA9PT0gMSA/IG5vZGVzWzBdIDogbmV3IEJpbmRpbmcoKS5hcHBlbmQobm9kZXMpKTtcbn1cblxuLy8gY29udmVydHMgYSBzaW1wbGUgY3NzIHNlbGVjdG9yIHRvIGFuIGVsZW1lbnQgYmluZGluZ1xuZXhwb3J0cy5mcm9tU2VsZWN0b3IgPSBmdW5jdGlvbihzZWwpIHtcblx0aWYgKHR5cGVvZiBzZWwgIT09IFwib2JqZWN0XCIpIHtcblx0XHRzZWwgPSB1dGlsLnBhcnNlU2VsZWN0b3Ioc2VsKTtcblx0fVxuXG5cdHZhciBlbCA9IG5ldyBUZW1wbGUuRWxlbWVudChzZWwudGFnbmFtZSk7XG5cdGlmIChzZWwuaWQgIT0gbnVsbCkgZWwucHJvcChcImlkXCIsIHNlbC5pZCk7XG5cdGVsLmFkZENsYXNzKHNlbC5jbGFzc2VzKTtcblx0ZWwuYXR0cihzZWwuYXR0cmlidXRlcyk7XG5cdGVsLmFwcGVuZCh1dGlsLnRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKSk7XG5cblx0cmV0dXJuIGVsO1xufSIsIm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuICAvKlxuICAgKiBHZW5lcmF0ZWQgYnkgUEVHLmpzIDAuOC4wLlxuICAgKlxuICAgKiBodHRwOi8vcGVnanMubWFqZGEuY3ovXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHBlZyRzdWJjbGFzcyhjaGlsZCwgcGFyZW50KSB7XG4gICAgZnVuY3Rpb24gY3RvcigpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9XG4gICAgY3Rvci5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuICAgIGNoaWxkLnByb3RvdHlwZSA9IG5ldyBjdG9yKCk7XG4gIH1cblxuICBmdW5jdGlvbiBTeW50YXhFcnJvcihtZXNzYWdlLCBleHBlY3RlZCwgZm91bmQsIG9mZnNldCwgbGluZSwgY29sdW1uKSB7XG4gICAgdGhpcy5tZXNzYWdlICA9IG1lc3NhZ2U7XG4gICAgdGhpcy5leHBlY3RlZCA9IGV4cGVjdGVkO1xuICAgIHRoaXMuZm91bmQgICAgPSBmb3VuZDtcbiAgICB0aGlzLm9mZnNldCAgID0gb2Zmc2V0O1xuICAgIHRoaXMubGluZSAgICAgPSBsaW5lO1xuICAgIHRoaXMuY29sdW1uICAgPSBjb2x1bW47XG5cbiAgICB0aGlzLm5hbWUgICAgID0gXCJTeW50YXhFcnJvclwiO1xuICB9XG5cbiAgcGVnJHN1YmNsYXNzKFN5bnRheEVycm9yLCBFcnJvcik7XG5cbiAgZnVuY3Rpb24gcGFyc2UoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGFyZ3VtZW50cy5sZW5ndGggPiAxID8gYXJndW1lbnRzWzFdIDoge30sXG5cbiAgICAgICAgcGVnJEZBSUxFRCA9IHt9LFxuXG4gICAgICAgIHBlZyRzdGFydFJ1bGVJbmRpY2VzID0geyBzdGFydDogMCB9LFxuICAgICAgICBwZWckc3RhcnRSdWxlSW5kZXggICA9IDAsXG5cbiAgICAgICAgcGVnJGNvbnN0cyA9IFtcbiAgICAgICAgICBwZWckRkFJTEVELFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgW10sXG4gICAgICAgICAgZnVuY3Rpb24odGFnLCBwcm9wcykge1xuICAgICAgICAgIFx0dmFyIGVsID0ge1xuICAgICAgICAgIFx0XHR0YWduYW1lOiB0YWcsXG4gICAgICAgICAgXHRcdGlkOiBudWxsLFxuICAgICAgICAgIFx0XHRjbGFzc2VzOiBbXSxcbiAgICAgICAgICBcdFx0YXR0cmlidXRlczoge31cbiAgICAgICAgICBcdH07XG5cbiAgICAgICAgICBcdHByb3BzLmZvckVhY2goZnVuY3Rpb24ocHJvcCkge1xuICAgICAgICAgIFx0XHRzd2l0Y2ggKHByb3AudHlwZSkge1xuICAgICAgICAgIFx0XHRcdGNhc2UgXCJpZFwiOlxuICAgICAgICAgIFx0XHRcdFx0ZWwuaWQgPSBwcm9wLnZhbHVlO1xuICAgICAgICAgIFx0XHRcdFx0YnJlYWs7XG5cbiAgICAgICAgICBcdFx0XHRjYXNlIFwiY2xhc3NcIjpcbiAgICAgICAgICBcdFx0XHRcdGVsLmNsYXNzZXMucHVzaChwcm9wLnZhbHVlKTtcbiAgICAgICAgICBcdFx0XHRcdGJyZWFrO1xuXG4gICAgICAgICAgXHRcdFx0Y2FzZSBcImF0dHJcIjpcbiAgICAgICAgICBcdFx0XHRcdGVsLmF0dHJpYnV0ZXNbcHJvcC5uYW1lXSA9IHByb3AudmFsdWU7XG4gICAgICAgICAgXHRcdFx0XHRicmVhaztcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSk7XG5cbiAgICAgICAgICBcdHJldHVybiBlbDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIGZ1bmN0aW9uKG5hbWUpIHsgcmV0dXJuIG5hbWUuam9pbihcIlwiKTsgfSxcbiAgICAgICAgICBmdW5jdGlvbihpLCBqKSB7IHJldHVybiBpICsgai5qb2luKCcnKTsgfSxcbiAgICAgICAgICBcIiNcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIjXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIjXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oaCkge1xuICAgICAgICAgIFx0aWYgKGhhc0lkKSB0aHJvdyBuZXcgRXJyb3IoXCJFbGVtZW50cyBjYW5ub3QgaGF2ZSBtdWx0aXBsZSBJRHMuXCIpO1xuICAgICAgICAgIFx0aGFzSWQgPSB0cnVlO1xuXG4gICAgICAgICAgXHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHR0eXBlOiBcImlkXCIsXG4gICAgICAgICAgXHRcdHZhbHVlOiBoXG4gICAgICAgICAgXHR9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIi5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oYykge1xuICAgICAgICAgIFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0dHlwZTogXCJjbGFzc1wiLFxuICAgICAgICAgIFx0XHR2YWx1ZTogY1xuICAgICAgICAgIFx0fVxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJbXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiW1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiW1xcXCJcIiB9LFxuICAgICAgICAgIFwiXVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIl1cIiwgZGVzY3JpcHRpb246IFwiXFxcIl1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICAgICAgXHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHR0eXBlOiBcImF0dHJcIixcbiAgICAgICAgICBcdFx0bmFtZToga2V5LFxuICAgICAgICAgIFx0XHR2YWx1ZTogdmFsdWUgfHwgXCJcIlxuICAgICAgICAgIFx0fVxuICAgICAgICAgIH0sXG4gICAgICAgICAgL15bYS16MC05X1xcLV0vaSxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOV9cXFxcLV1pXCIsIGRlc2NyaXB0aW9uOiBcIlthLXowLTlfXFxcXC1daVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oaykgeyByZXR1cm4gay5qb2luKFwiXCIpOyB9LFxuICAgICAgICAgIFwiPVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIj1cIiwgZGVzY3JpcHRpb246IFwiXFxcIj1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2KSB7IHJldHVybiB2OyB9LFxuICAgICAgICAgIFwiXFxcIlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIlxcXCJcIiwgZGVzY3JpcHRpb246IFwiXFxcIlxcXFxcXFwiXFxcIlwiIH0sXG4gICAgICAgICAgL15bXlwiXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlteXFxcIl1cIiwgZGVzY3JpcHRpb246IFwiW15cXFwiXVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odikgeyByZXR1cm4gdi5qb2luKFwiXCIpOyB9LFxuICAgICAgICAgIFwiJ1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIidcIiwgZGVzY3JpcHRpb246IFwiXFxcIidcXFwiXCIgfSxcbiAgICAgICAgICAvXlteJ10vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXiddXCIsIGRlc2NyaXB0aW9uOiBcIlteJ11cIiB9LFxuICAgICAgICAgIC9eW15cXF1dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW15cXFxcXV1cIiwgZGVzY3JpcHRpb246IFwiW15cXFxcXV1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHYpIHsgcmV0dXJuIHYuam9pbihcIlwiKS50cmltKCk7IH0sXG4gICAgICAgICAgL15bYS16XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlthLXpdXCIsIGRlc2NyaXB0aW9uOiBcIlthLXpdXCIgfSxcbiAgICAgICAgICAvXlthLXowLTlcXC1dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOVxcXFwtXVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05XFxcXC1dXCIgfSxcbiAgICAgICAgICAvXltcXHg4MC1cXHhGRl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXFxcXHg4MC1cXFxceEZGXVwiLCBkZXNjcmlwdGlvbjogXCJbXFxcXHg4MC1cXFxceEZGXVwiIH0sXG4gICAgICAgICAgeyB0eXBlOiBcIm90aGVyXCIsIGRlc2NyaXB0aW9uOiBcIndoaXRlc3BhY2VcIiB9LFxuICAgICAgICAgIC9eWyBcXHRcXG5cXHJdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyBcXFxcdFxcXFxuXFxcXHJdXCIsIGRlc2NyaXB0aW9uOiBcIlsgXFxcXHRcXFxcblxcXFxyXVwiIH0sXG4gICAgICAgICAgXCJcXFxcXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXFxcXFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXFxcXFxcXFxcXFwiXCIgfSxcbiAgICAgICAgICB7IHR5cGU6IFwiYW55XCIsIGRlc2NyaXB0aW9uOiBcImFueSBjaGFyYWN0ZXJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGNoYXIpIHsgcmV0dXJuIGNoYXI7IH1cbiAgICAgICAgXSxcblxuICAgICAgICBwZWckYnl0ZWNvZGUgPSBbXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3ISojIFxcXCIgIStTJCBcXFwiNyMqKSBcXFwiNyQqIyBcXFwiNyUsLyY3IyopIFxcXCI3JCojIFxcXCI3JVxcXCIrKSU0XFxcIjYjXFxcIlxcXCIhICUkXFxcIiMgIFxcXCIjICBcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgXFxcIjcqLCMmNypcXFwiKycgNCE2JCEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3Kis7JCBcXFwiNyssIyY3K1xcXCIrKSU0XFxcIjYlXFxcIlxcXCIhICUkXFxcIiMgIFxcXCIjICBcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuJlxcXCJcXFwiMiYzJysyJDdcXFwiKyglNFxcXCI2KFxcXCIhICUkXFxcIiMgIFxcXCIjICBcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuKVxcXCJcXFwiMikzKisyJDdcXFwiKyglNFxcXCI2K1xcXCIhICUkXFxcIiMgIFxcXCIjICBcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuLFxcXCJcXFwiMiwzLStTJDcmK0klNycqIyBcXFwiICErOSUuLlxcXCJcXFwiMi4zLyspJTQkNjAkXFxcIlxcXCIhJSQkIyAgJCMjICAkXFxcIiMgIFxcXCIjICBcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3LStXJCBcXFwiMDFcXFwiXFxcIjEhMzIrLCQsKSYwMVxcXCJcXFwiMSEzMlxcXCJcXFwiXFxcIiAgKzIlNy0rKCU0IzYzIyEhJSQjIyAgJFxcXCIjICBcXFwiIyAgXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLjRcXFwiXFxcIjI0MzUrTCQ3LStCJTcoKiMgXFxcIjcpKzIlNy0rKCU0JDY2JCEhJSQkIyAgJCMjICAkXFxcIiMgIFxcXCIjICBcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuN1xcXCJcXFwiMjczOCtiJCBcXFwiNy4qKSBcXFwiMDlcXFwiXFxcIjEhMzosLyY3LiopIFxcXCIwOVxcXCJcXFwiMSEzOlxcXCIrOCUuN1xcXCJcXFwiMjczOCsoJTQjNjsjISElJCMjICAkXFxcIiMgIFxcXCIjICAqcyBcXFwiIS48XFxcIlxcXCIyPDM9K2IkIFxcXCI3LiopIFxcXCIwPlxcXCJcXFwiMSEzPywvJjcuKikgXFxcIjA+XFxcIlxcXCIxITM/XFxcIis4JS48XFxcIlxcXCIyPDM9KyglNCM2OyMhISUkIyMgICRcXFwiIyAgXFxcIiMgIFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISBcXFwiMEBcXFwiXFxcIjEhM0EsKSYwQFxcXCJcXFwiMSEzQVxcXCIrJyA0ITZCISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiMENcXFwiXFxcIjEhM0QqIyBcXFwiNyxcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIjBFXFxcIlxcXCIxITNGKiMgXFxcIjcsXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIwR1xcXCJcXFwiMSEzSFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiOCBcXFwiMEpcXFwiXFxcIjEhM0ssKSYwSlxcXCJcXFwiMSEzS1xcXCI5KlxcXCIgM0lcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuTFxcXCJcXFwiMkwzTSs3JC1cXFwiXFxcIjEhM04rKCU0XFxcIjZPXFxcIiEgJSRcXFwiIyAgXFxcIiMgIFwiKVxuICAgICAgICBdLFxuXG4gICAgICAgIHBlZyRjdXJyUG9zICAgICAgICAgID0gMCxcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zICAgICAgPSAwLFxuICAgICAgICBwZWckY2FjaGVkUG9zICAgICAgICA9IDAsXG4gICAgICAgIHBlZyRjYWNoZWRQb3NEZXRhaWxzID0geyBsaW5lOiAxLCBjb2x1bW46IDEsIHNlZW5DUjogZmFsc2UgfSxcbiAgICAgICAgcGVnJG1heEZhaWxQb3MgICAgICAgPSAwLFxuICAgICAgICBwZWckbWF4RmFpbEV4cGVjdGVkICA9IFtdLFxuICAgICAgICBwZWckc2lsZW50RmFpbHMgICAgICA9IDAsXG5cbiAgICAgICAgcGVnJHJlc3VsdDtcblxuICAgIGlmIChcInN0YXJ0UnVsZVwiIGluIG9wdGlvbnMpIHtcbiAgICAgIGlmICghKG9wdGlvbnMuc3RhcnRSdWxlIGluIHBlZyRzdGFydFJ1bGVJbmRpY2VzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBzdGFydCBwYXJzaW5nIGZyb20gcnVsZSBcXFwiXCIgKyBvcHRpb25zLnN0YXJ0UnVsZSArIFwiXFxcIi5cIik7XG4gICAgICB9XG5cbiAgICAgIHBlZyRzdGFydFJ1bGVJbmRleCA9IHBlZyRzdGFydFJ1bGVJbmRpY2VzW29wdGlvbnMuc3RhcnRSdWxlXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0ZXh0KCkge1xuICAgICAgcmV0dXJuIGlucHV0LnN1YnN0cmluZyhwZWckcmVwb3J0ZWRQb3MsIHBlZyRjdXJyUG9zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvZmZzZXQoKSB7XG4gICAgICByZXR1cm4gcGVnJHJlcG9ydGVkUG9zO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpbmUoKSB7XG4gICAgICByZXR1cm4gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBlZyRyZXBvcnRlZFBvcykubGluZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb2x1bW4oKSB7XG4gICAgICByZXR1cm4gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBlZyRyZXBvcnRlZFBvcykuY29sdW1uO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4cGVjdGVkKGRlc2NyaXB0aW9uKSB7XG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24oXG4gICAgICAgIG51bGwsXG4gICAgICAgIFt7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uIH1dLFxuICAgICAgICBwZWckcmVwb3J0ZWRQb3NcbiAgICAgICk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IobWVzc2FnZSkge1xuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKG1lc3NhZ2UsIG51bGwsIHBlZyRyZXBvcnRlZFBvcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBvcykge1xuICAgICAgZnVuY3Rpb24gYWR2YW5jZShkZXRhaWxzLCBzdGFydFBvcywgZW5kUG9zKSB7XG4gICAgICAgIHZhciBwLCBjaDtcblxuICAgICAgICBmb3IgKHAgPSBzdGFydFBvczsgcCA8IGVuZFBvczsgcCsrKSB7XG4gICAgICAgICAgY2ggPSBpbnB1dC5jaGFyQXQocCk7XG4gICAgICAgICAgaWYgKGNoID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICBpZiAoIWRldGFpbHMuc2VlbkNSKSB7IGRldGFpbHMubGluZSsrOyB9XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbiA9IDE7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IGZhbHNlO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY2ggPT09IFwiXFxyXCIgfHwgY2ggPT09IFwiXFx1MjAyOFwiIHx8IGNoID09PSBcIlxcdTIwMjlcIikge1xuICAgICAgICAgICAgZGV0YWlscy5saW5lKys7XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbiA9IDE7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uKys7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocGVnJGNhY2hlZFBvcyAhPT0gcG9zKSB7XG4gICAgICAgIGlmIChwZWckY2FjaGVkUG9zID4gcG9zKSB7XG4gICAgICAgICAgcGVnJGNhY2hlZFBvcyA9IDA7XG4gICAgICAgICAgcGVnJGNhY2hlZFBvc0RldGFpbHMgPSB7IGxpbmU6IDEsIGNvbHVtbjogMSwgc2VlbkNSOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2UocGVnJGNhY2hlZFBvc0RldGFpbHMsIHBlZyRjYWNoZWRQb3MsIHBvcyk7XG4gICAgICAgIHBlZyRjYWNoZWRQb3MgPSBwb3M7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwZWckY2FjaGVkUG9zRGV0YWlscztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckZmFpbChleHBlY3RlZCkge1xuICAgICAgaWYgKHBlZyRjdXJyUG9zIDwgcGVnJG1heEZhaWxQb3MpIHsgcmV0dXJuOyB9XG5cbiAgICAgIGlmIChwZWckY3VyclBvcyA+IHBlZyRtYXhGYWlsUG9zKSB7XG4gICAgICAgIHBlZyRtYXhGYWlsUG9zID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQgPSBbXTtcbiAgICAgIH1cblxuICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZC5wdXNoKGV4cGVjdGVkKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckYnVpbGRFeGNlcHRpb24obWVzc2FnZSwgZXhwZWN0ZWQsIHBvcykge1xuICAgICAgZnVuY3Rpb24gY2xlYW51cEV4cGVjdGVkKGV4cGVjdGVkKSB7XG4gICAgICAgIHZhciBpID0gMTtcblxuICAgICAgICBleHBlY3RlZC5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICBpZiAoYS5kZXNjcmlwdGlvbiA8IGIuZGVzY3JpcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGEuZGVzY3JpcHRpb24gPiBiLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB3aGlsZSAoaSA8IGV4cGVjdGVkLmxlbmd0aCkge1xuICAgICAgICAgIGlmIChleHBlY3RlZFtpIC0gMV0gPT09IGV4cGVjdGVkW2ldKSB7XG4gICAgICAgICAgICBleHBlY3RlZC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRNZXNzYWdlKGV4cGVjdGVkLCBmb3VuZCkge1xuICAgICAgICBmdW5jdGlvbiBzdHJpbmdFc2NhcGUocykge1xuICAgICAgICAgIGZ1bmN0aW9uIGhleChjaCkgeyByZXR1cm4gY2guY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTsgfVxuXG4gICAgICAgICAgcmV0dXJuIHNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcL2csICAgJ1xcXFxcXFxcJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cIi9nLCAgICAnXFxcXFwiJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHgwOC9nLCAnXFxcXGInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcdC9nLCAgICdcXFxcdCcpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csICAgJ1xcXFxuJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGYvZywgICAnXFxcXGYnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAgICdcXFxccicpXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xceDAwLVxceDA3XFx4MEJcXHgwRVxceDBGXS9nLCBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx4MCcgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHgxMC1cXHgxRlxceDgwLVxceEZGXS9nLCAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx4JyAgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHUwMTgwLVxcdTBGRkZdL2csICAgICAgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxcdTAnICsgaGV4KGNoKTsgfSlcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx1MTA4MC1cXHVGRkZGXS9nLCAgICAgICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHUnICArIGhleChjaCk7IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGV4cGVjdGVkRGVzY3MgPSBuZXcgQXJyYXkoZXhwZWN0ZWQubGVuZ3RoKSxcbiAgICAgICAgICAgIGV4cGVjdGVkRGVzYywgZm91bmREZXNjLCBpO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBleHBlY3RlZC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGV4cGVjdGVkRGVzY3NbaV0gPSBleHBlY3RlZFtpXS5kZXNjcmlwdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGV4cGVjdGVkRGVzYyA9IGV4cGVjdGVkLmxlbmd0aCA+IDFcbiAgICAgICAgICA/IGV4cGVjdGVkRGVzY3Muc2xpY2UoMCwgLTEpLmpvaW4oXCIsIFwiKVxuICAgICAgICAgICAgICArIFwiIG9yIFwiXG4gICAgICAgICAgICAgICsgZXhwZWN0ZWREZXNjc1tleHBlY3RlZC5sZW5ndGggLSAxXVxuICAgICAgICAgIDogZXhwZWN0ZWREZXNjc1swXTtcblxuICAgICAgICBmb3VuZERlc2MgPSBmb3VuZCA/IFwiXFxcIlwiICsgc3RyaW5nRXNjYXBlKGZvdW5kKSArIFwiXFxcIlwiIDogXCJlbmQgb2YgaW5wdXRcIjtcblxuICAgICAgICByZXR1cm4gXCJFeHBlY3RlZCBcIiArIGV4cGVjdGVkRGVzYyArIFwiIGJ1dCBcIiArIGZvdW5kRGVzYyArIFwiIGZvdW5kLlwiO1xuICAgICAgfVxuXG4gICAgICB2YXIgcG9zRGV0YWlscyA9IHBlZyRjb21wdXRlUG9zRGV0YWlscyhwb3MpLFxuICAgICAgICAgIGZvdW5kICAgICAgPSBwb3MgPCBpbnB1dC5sZW5ndGggPyBpbnB1dC5jaGFyQXQocG9zKSA6IG51bGw7XG5cbiAgICAgIGlmIChleHBlY3RlZCAhPT0gbnVsbCkge1xuICAgICAgICBjbGVhbnVwRXhwZWN0ZWQoZXhwZWN0ZWQpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmV3IFN5bnRheEVycm9yKFxuICAgICAgICBtZXNzYWdlICE9PSBudWxsID8gbWVzc2FnZSA6IGJ1aWxkTWVzc2FnZShleHBlY3RlZCwgZm91bmQpLFxuICAgICAgICBleHBlY3RlZCxcbiAgICAgICAgZm91bmQsXG4gICAgICAgIHBvcyxcbiAgICAgICAgcG9zRGV0YWlscy5saW5lLFxuICAgICAgICBwb3NEZXRhaWxzLmNvbHVtblxuICAgICAgKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckZGVjb2RlKHMpIHtcbiAgICAgIHZhciBiYyA9IG5ldyBBcnJheShzLmxlbmd0aCksIGk7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGJjW2ldID0gcy5jaGFyQ29kZUF0KGkpIC0gMzI7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBiYztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2VSdWxlKGluZGV4KSB7XG4gICAgICB2YXIgYmMgICAgPSBwZWckYnl0ZWNvZGVbaW5kZXhdLFxuICAgICAgICAgIGlwICAgID0gMCxcbiAgICAgICAgICBpcHMgICA9IFtdLFxuICAgICAgICAgIGVuZCAgID0gYmMubGVuZ3RoLFxuICAgICAgICAgIGVuZHMgID0gW10sXG4gICAgICAgICAgc3RhY2sgPSBbXSxcbiAgICAgICAgICBwYXJhbXMsIGk7XG5cbiAgICAgIGZ1bmN0aW9uIHByb3RlY3Qob2JqZWN0KSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmFwcGx5KG9iamVjdCkgPT09IFwiW29iamVjdCBBcnJheV1cIiA/IFtdIDogb2JqZWN0O1xuICAgICAgfVxuXG4gICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICB3aGlsZSAoaXAgPCBlbmQpIHtcbiAgICAgICAgICBzd2l0Y2ggKGJjW2lwXSkge1xuICAgICAgICAgICAgY2FzZSAwOlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHByb3RlY3QocGVnJGNvbnN0c1tiY1tpcCArIDFdXSkpO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gc3RhY2sucG9wKCk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDQ6XG4gICAgICAgICAgICAgIHN0YWNrLmxlbmd0aCAtPSBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA1OlxuICAgICAgICAgICAgICBzdGFjay5zcGxpY2UoLTIsIDEpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA2OlxuICAgICAgICAgICAgICBzdGFja1tzdGFjay5sZW5ndGggLSAyXS5wdXNoKHN0YWNrLnBvcCgpKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNzpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChzdGFjay5zcGxpY2Uoc3RhY2subGVuZ3RoIC0gYmNbaXAgKyAxXSwgYmNbaXAgKyAxXSkpO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA4OlxuICAgICAgICAgICAgICBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChpbnB1dC5zdWJzdHJpbmcoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0sIHBlZyRjdXJyUG9zKSk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDk6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTA6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTE6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTI6XG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICAgIGlwcy5wdXNoKGlwKTtcblxuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMiArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpcCArPSAyICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDEzOlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5sZW5ndGggPiBwZWckY3VyclBvcykge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE0OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM10pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0ubGVuZ3RoKSA9PT0gcGVnJGNvbnN0c1tiY1tpcCArIDFdXSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gNDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE1OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM10pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0ubGVuZ3RoKS50b0xvd2VyQ2FzZSgpID09PSBwZWckY29uc3RzW2JjW2lwICsgMV1dKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTY6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHBlZyRjb25zdHNbYmNbaXAgKyAxXV0udGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gNDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE3OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgYmNbaXAgKyAxXSkpO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyArPSBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxODpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckY29uc3RzW2JjW2lwICsgMV1dKTtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgKz0gcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGg7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE5OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRGQUlMRUQpO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcGVnJGZhaWwocGVnJGNvbnN0c1tiY1tpcCArIDFdXSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjA6XG4gICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDEgLSBiY1tpcCArIDFdXTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjE6XG4gICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHBlZyRjdXJyUG9zO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMjpcbiAgICAgICAgICAgICAgcGFyYW1zID0gYmMuc2xpY2UoaXAgKyA0LCBpcCArIDQgKyBiY1tpcCArIDNdKTtcbiAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGJjW2lwICsgM107IGkrKykge1xuICAgICAgICAgICAgICAgIHBhcmFtc1tpXSA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDEgLSBwYXJhbXNbaV1dO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgc3RhY2suc3BsaWNlKFxuICAgICAgICAgICAgICAgIHN0YWNrLmxlbmd0aCAtIGJjW2lwICsgMl0sXG4gICAgICAgICAgICAgICAgYmNbaXAgKyAyXSxcbiAgICAgICAgICAgICAgICBwZWckY29uc3RzW2JjW2lwICsgMV1dLmFwcGx5KG51bGwsIHBhcmFtcylcbiAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjM6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJHBhcnNlUnVsZShiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDI0OlxuICAgICAgICAgICAgICBwZWckc2lsZW50RmFpbHMrKztcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjU6XG4gICAgICAgICAgICAgIHBlZyRzaWxlbnRGYWlscy0tO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBvcGNvZGU6IFwiICsgYmNbaXBdICsgXCIuXCIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbmRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBlbmQgPSBlbmRzLnBvcCgpO1xuICAgICAgICAgIGlwID0gaXBzLnBvcCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzdGFja1swXTtcbiAgICB9XG5cblxuICAgIFx0dmFyIGhhc0lkID0gZmFsc2U7XG5cblxuICAgIHBlZyRyZXN1bHQgPSBwZWckcGFyc2VSdWxlKHBlZyRzdGFydFJ1bGVJbmRleCk7XG5cbiAgICBpZiAocGVnJHJlc3VsdCAhPT0gcGVnJEZBSUxFRCAmJiBwZWckY3VyclBvcyA9PT0gaW5wdXQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gcGVnJHJlc3VsdDtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHBlZyRyZXN1bHQgIT09IHBlZyRGQUlMRUQgJiYgcGVnJGN1cnJQb3MgPCBpbnB1dC5sZW5ndGgpIHtcbiAgICAgICAgcGVnJGZhaWwoeyB0eXBlOiBcImVuZFwiLCBkZXNjcmlwdGlvbjogXCJlbmQgb2YgaW5wdXRcIiB9KTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKG51bGwsIHBlZyRtYXhGYWlsRXhwZWN0ZWQsIHBlZyRtYXhGYWlsUG9zKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIFN5bnRheEVycm9yOiBTeW50YXhFcnJvcixcbiAgICBwYXJzZTogICAgICAgcGFyc2VcbiAgfTtcbn0pKCk7IiwidmFyIHRvQXJyYXkgPVxuZXhwb3J0cy50b0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XG5cdHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChvYmosIDApO1xufVxuXG52YXIgaGFzID1cbmV4cG9ydHMuaGFzID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcblx0cmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSk7XG59XG5cbnZhciBleHRlbmQgPVxuZXhwb3J0cy5leHRlbmQgPSBmdW5jdGlvbihvYmopIHtcblx0dG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpLmZvckVhY2goZnVuY3Rpb24obWl4aW4pIHtcblx0XHRpZiAoIW1peGluKSByZXR1cm47XG5cblx0XHRmb3IgKHZhciBrZXkgaW4gbWl4aW4pIHtcblx0XHRcdG9ialtrZXldID0gbWl4aW5ba2V5XTtcblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBvYmo7XG59XG5cbnZhciBlYWNoID1cbmV4cG9ydHMuZWFjaCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcblx0aWYgKG9iaiA9PSBudWxsKSByZXR1cm4gb2JqO1xuXG5cdGlmIChvYmouZm9yRWFjaCA9PT0gQXJyYXkucHJvdG90eXBlLmZvckVhY2gpIHtcblx0XHRvYmouZm9yRWFjaChpdGVyYXRvciwgY29udGV4dCk7XG5cdH0gZWxzZSBpZiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpIHtcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtpXSwgaSwgb2JqKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0dmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmopO1xuXHRcdGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXlzW2ldXSwga2V5c1tpXSwgb2JqKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgZmxhdHRlbiA9XG5leHBvcnRzLmZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgb3V0cHV0KSB7XG5cdGlmIChvdXRwdXQgPT0gbnVsbCkgb3V0cHV0ID0gW107XG5cblx0ZWFjaChpbnB1dCwgZnVuY3Rpb24odmFsdWUpIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIGZsYXR0ZW4odmFsdWUsIG91dHB1dCk7XG5cdFx0ZWxzZSBvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdH0pO1xuXG5cdHJldHVybiBvdXRwdXQ7XG59XG5cbmV4cG9ydHMucGljayA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gZmxhdHRlbih0b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSkpXG5cblx0LnJlZHVjZShmdW5jdGlvbihub2JqLCBrZXkpIHtcblx0XHRub2JqW2tleV0gPSBvYmpba2V5XTtcblx0XHRyZXR1cm4gbm9iajtcblx0fSwge30pO1xufVxuXG52YXIgaXNPYmplY3QgPVxuZXhwb3J0cy5pc09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gb2JqID09PSBPYmplY3Qob2JqKTtcbn1cblxuZXhwb3J0cy51bmlxdWVJZCA9IChmdW5jdGlvbigpIHtcblx0dmFyIGlkID0gMDtcblx0cmV0dXJuIGZ1bmN0aW9uKHByZWZpeCkge1xuXHRcdHJldHVybiAocHJlZml4IHx8IFwiXCIpICsgKCsraWQpO1xuXHR9XG59KSgpO1xuXG4vLyB0aGUgc3ViY2xhc3NpbmcgZnVuY3Rpb24gZm91bmQgaW4gQmFja2JvbmVcbmV4cG9ydHMuc3ViY2xhc3MgPSBmdW5jdGlvbihwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuXHR2YXIgcGFyZW50ID0gdGhpcztcblx0dmFyIGNoaWxkO1xuXG5cdC8vIFRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiBmb3IgdGhlIG5ldyBzdWJjbGFzcyBpcyBlaXRoZXIgZGVmaW5lZCBieSB5b3Vcblx0Ly8gKHRoZSBcImNvbnN0cnVjdG9yXCIgcHJvcGVydHkgaW4geW91ciBgZXh0ZW5kYCBkZWZpbml0aW9uKSwgb3IgZGVmYXVsdGVkXG5cdC8vIGJ5IHVzIHRvIHNpbXBseSBjYWxsIHRoZSBwYXJlbnQncyBjb25zdHJ1Y3Rvci5cblx0aWYgKHByb3RvUHJvcHMgJiYgaGFzKHByb3RvUHJvcHMsICdjb25zdHJ1Y3RvcicpKSB7XG5cdFx0Y2hpbGQgPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdGNoaWxkID0gZnVuY3Rpb24oKXsgcmV0dXJuIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9O1xuXHR9XG5cblx0Ly8gQWRkIHN0YXRpYyBwcm9wZXJ0aWVzIHRvIHRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiwgaWYgc3VwcGxpZWQuXG5cdGV4dGVuZChjaGlsZCwgcGFyZW50LCBzdGF0aWNQcm9wcyk7XG5cblx0Ly8gU2V0IHRoZSBwcm90b3R5cGUgY2hhaW4gdG8gaW5oZXJpdCBmcm9tIGBwYXJlbnRgLCB3aXRob3V0IGNhbGxpbmdcblx0Ly8gYHBhcmVudGAncyBjb25zdHJ1Y3RvciBmdW5jdGlvbi5cblx0dmFyIFN1cnJvZ2F0ZSA9IGZ1bmN0aW9uKCl7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfTtcblx0U3Vycm9nYXRlLnByb3RvdHlwZSA9IHBhcmVudC5wcm90b3R5cGU7XG5cdGNoaWxkLnByb3RvdHlwZSA9IG5ldyBTdXJyb2dhdGU7XG5cblx0Ly8gQWRkIHByb3RvdHlwZSBwcm9wZXJ0aWVzIChpbnN0YW5jZSBwcm9wZXJ0aWVzKSB0byB0aGUgc3ViY2xhc3MsXG5cdC8vIGlmIHN1cHBsaWVkLlxuXHRpZiAocHJvdG9Qcm9wcykgZXh0ZW5kKGNoaWxkLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyk7XG5cblx0Ly8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZFxuXHQvLyBsYXRlci5cblx0Y2hpbGQuX19zdXBlcl9fID0gcGFyZW50LnByb3RvdHlwZTtcblxuXHRyZXR1cm4gY2hpbGQ7XG59XG5cbmV4cG9ydHMuaXNOb2RlQXRET01Qb3NpdGlvbiA9IGZ1bmN0aW9uKG5vZGUsIHBhcmVudCwgYmVmb3JlKSB7XG5cdHJldHVybiBub2RlLnBhcmVudE5vZGUgPT09IHBhcmVudCAmJiBub2RlLm5leHRTaWJsaW5nID09PSBiZWZvcmU7XG59XG5cbnZhciBtYXRjaGVzU2VsZWN0b3IgPSB0eXBlb2YgRWxlbWVudCAhPT0gXCJ1bmRlZmluZWRcIiA/XG5cdEVsZW1lbnQucHJvdG90eXBlLm1hdGNoZXMgfHxcblx0RWxlbWVudC5wcm90b3R5cGUud2Via2l0TWF0Y2hlc1NlbGVjdG9yIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLm1vek1hdGNoZXNTZWxlY3RvciB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS5tc01hdGNoZXNTZWxlY3RvciA6XG5cdGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH07XG5cbmV4cG9ydHMubWF0Y2hlc1NlbGVjdG9yID0gZnVuY3Rpb24oZWxlbSwgc2VsZWN0b3IpIHtcblx0cmV0dXJuIG1hdGNoZXNTZWxlY3Rvci5jYWxsKGVsZW0sIHNlbGVjdG9yKVxufVxuXG52YXIgRGVwcyA9IHJlcXVpcmUoXCIuL2RlcHNcIik7XG5cbnZhciBkZWZpbmVSZWFjdGl2ZVByb3BlcnR5ID1cbmV4cG9ydHMuZGVmaW5lUmVhY3RpdmVQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUsIGNvZXJjZSkge1xuXHRpZiAoIWlzT2JqZWN0KG9iaikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBvYmplY3QgdG8gZGVmaW5lIHRoZSByZWFjdGl2ZSBwcm9wZXJ0eSBvbi5cIik7XG5cdGlmICh0eXBlb2YgcHJvcCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgcHJvcGVydHkgbmFtZS5cIik7XG5cblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiICYmIGNvZXJjZSA9PSBudWxsKSB7XG5cdFx0Y29lcmNlID0gdmFsdWU7XG5cdFx0dmFsdWUgPSB2b2lkIDA7XG5cdH1cblxuXHRpZiAodHlwZW9mIGNvZXJjZSAhPT0gXCJmdW5jdGlvblwiKSBjb2VyY2UgPSBmdW5jdGlvbih2KSB7IHJldHVybiB2OyB9O1xuXG5cdC8vIHJ1bnMgdGhlIGNvZXJjaW9uIGZ1bmN0aW9uIG5vbi1yZWFjdGl2ZWx5IHRvIHByZXZlbnQgaW5maW5pdGUgbG9vcHNcblx0ZnVuY3Rpb24gcHJvY2Vzcyh2KSB7XG5cdFx0cmV0dXJuIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gY29lcmNlLmNhbGwob2JqLCB2LCBwcm9wLCBvYmopO1xuXHRcdH0pO1xuXHR9XG5cblx0dmFyIGRlcCA9IG5ldyBEZXBzLkRlcGVuZGVuY3k7XG5cdHZhbHVlID0gcHJvY2Vzcyh2YWx1ZSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHR2YWwgPSBwcm9jZXNzKHZhbCk7XG5cblx0XHRcdGlmICh2YWwgIT09IHZhbHVlKSB7XG5cdFx0XHRcdHZhbHVlID0gdmFsO1xuXHRcdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG9iajtcbn1cblxuZXhwb3J0cy5kZWZpbmVSZWFjdGl2ZVByb3BlcnRpZXMgPSBmdW5jdGlvbihvYmosIHByb3BzLCBjb2VyY2UpIHtcblx0Zm9yICh2YXIgcHJvcCBpbiBwcm9wcykge1xuXHRcdGRlZmluZVJlYWN0aXZlUHJvcGVydHkob2JqLCBwcm9wLCBwcm9wc1twcm9wXSwgY29lcmNlIHx8IGZhbHNlKTtcblx0fVxuXG5cdHJldHVybiBvYmo7XG59XG5cbnZhciBkZWZpbmVDb21wdXRlZFByb3BlcnR5ID1cbmV4cG9ydHMuZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUpIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJmdW5jdGlvblwiKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgY29tcHV0ZWQgcHJvcGVydHkgdmFsdWUuXCIpO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLmNhbGwob2JqKTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnRzLmRlZmluZUNvbXB1dGVkUHJvcGVydGllcyA9IGZ1bmN0aW9uKG9iaiwgcHJvcHMpIHtcblx0T2JqZWN0LmtleXMocHJvcHMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0ZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eShvYmosIGtleSwgcHJvcHNba2V5XSk7XG5cdH0pO1xufVxuXG5leHBvcnRzLnJ1bklmRXhpc3RzID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0eXBlb2Ygb2JqW21ldGhvZF0gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0cmV0dXJuIG9ialttZXRob2RdLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcblx0XHR9XG5cdH1cbn1cblxudmFyIFNlbGVjdG9yUGFyc2VyID0gcmVxdWlyZShcIi4vc2VsZWN0b3JcIilcbmV4cG9ydHMucGFyc2VTZWxlY3RvciA9IGZ1bmN0aW9uKHNlbCkge1xuXHRyZXR1cm4gU2VsZWN0b3JQYXJzZXIucGFyc2Uoc2VsKTtcbn1cblxuZXhwb3J0cy5jbG9zZXN0ID0gZnVuY3Rpb24oZWxlbSwgc2VsZWN0b3IpIHtcblx0d2hpbGUgKGVsZW0gIT0gbnVsbCkge1xuXHRcdGlmIChlbGVtLm5vZGVUeXBlID09PSAxICYmIG1hdGNoZXNTZWxlY3Rvci5jYWxsKGVsZW0sIHNlbGVjdG9yKSkgcmV0dXJuIGVsZW07XG5cdFx0ZWxlbSA9IGVsZW0ucGFyZW50Tm9kZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn0iXX0=
