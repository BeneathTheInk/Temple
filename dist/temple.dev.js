/* Temple / (c) 2014 Beneath the Ink, Inc. / MIT License / Version 0.3.5, Build 152 */
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
		Deps.nonreactive(function() {
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
Binding.prototype.removeAllChildren = Binding.prototype.empty;
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
Temple.VERSION = "0.3.5";
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

	prop: function(name, value) {
		if (util.isObject(name) && value == null) {
			util.each(name, function(v, n) { this.prop(n, v); }, this);
			return this;
		}

		if (typeof value === "undefined") return this.node[name];
		else this.node[name] = value;

		return this;
	},

	addEventListener: function(type, sel, listener, options) {
		var self = this;
		
		// syntax: addEventListener({ "type selector": listener }, options)
		if (util.isObject(type)) {
			util.each(type, function(v, n) {
				var m = n.match(delegateEventSplitter);
				this.addEventListener(m[1], m[2], v, sel);
			}, this);
			
			return this;
		}

		// syntax: addEventListener(type, listener, options)
		if (typeof sel === "function") {
			if (options == null) options = listener;
			listener = sel;
			sel = null;
		}

		options = options || {};

		if (typeof type !== "string" || type === "") {
			throw new Error("Expecting non-empty string event name.");
		}

		if (typeof listener !== "function") {
			throw new Error("Expecting function for listener.");
		}

		if (this._eventListeners == null) this._eventListeners = [];
		this._eventListeners.push({ type: type, listener: listener, event: eventListener, options: options });
		this.node.addEventListener(type, eventListener);

		return this;

		function eventListener(e) {
			var delegate;

			if (typeof sel === "string" && sel !== "") {
				delegate = util.closest(e.target, sel);
				if (!delegate) return;
			}

			if (options.once) self.removeEventListener(type, listener);
			listener.call(options.context || self, e, delegate);
		}
	},

	addEventListenerOnce: function(type, sel, listener, options) {
		if (util.isObject(type)) {
			return this.addEventListener(type, _.extend({ once: true }, sel || {}));
		}

		if (typeof sel === "function") {
			if (options == null) options = listener;
			listener = sel;
			sel = null;
		}
		
		return this.addEventListener(type, sel, listener, _.extend({ once: true }, options || {}));
	},

	removeEventListener: function(type, listener) {
		if (this._eventListeners == null) return this;

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

// converts a simple css selector to an element binding
exports.fromSelector = function(sel) {
	if (typeof sel !== "object") {
		sel = util.parseSelector(sel);
	}

	var el = new Element(sel.tagname);
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
          peg$decode("! \"7\",#&7\"\"+' 4!6$!! %"),
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

exports.ReactiveDict = (function() {
	function ReactiveDict() {
		this._masterDep = new Deps.Dependency;
		this._deps = {};
		this._values = {};
	}

	ReactiveDict.extend = subclass;

	ReactiveDict.prototype.get = function(key) {
		this.depend(key);
		return this.getValue(key);
	}

	ReactiveDict.prototype.getValue = function(key) {
		return this._values[key];
	}

	ReactiveDict.prototype.set = function(key, value) {
		if (this.getValue(key) === value) return this;
		this._values[key] = value;
		this.changed(key);
		return this;
	}

	ReactiveDict.prototype.unset = function(key) {
		if (typeof this.getValue(key) === "undefined") return this;
		delete this._values[key];
		this.changed(key);
		return this;
	}

	ReactiveDict.prototype.has = function(key) {
		return this.get(key) != null;
	}

	ReactiveDict.prototype.keys = function() {
		this._masterDep.depend();
		return Object.keys(this._values);
	}

	ReactiveDict.prototype.getDependency = function(key) {
		var dep = this._deps[key];
		if (dep == null) dep = this._deps[key] = new Deps.Dependency;
		return dep;
	}

	ReactiveDict.prototype.depend = function(key) {
		this.getDependency(key).depend();
		return this;
	}

	ReactiveDict.prototype.changed = function(key) {
		this.getDependency(key).changed();
		this._masterDep.changed();
		return this;
	}

	return ReactiveDict;
})();
},{"./deps":2,"./selector":7}]},{},[5])(5)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy90eWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9iaW5kaW5nLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9kZXBzLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ldmVudHMuanMiLCIvVXNlcnMvdHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2h0bWwuanMiLCIvVXNlcnMvdHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2luZGV4LmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ub2RlLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9zZWxlY3Rvci5qcyIsIi9Vc2Vycy90eWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9saWIvdXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xaQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNySEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDamxCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwidmFyIEV2ZW50cyA9IHJlcXVpcmUoXCIuL2V2ZW50c1wiKSxcblx0RGVwcyA9IHJlcXVpcmUoXCIuL2RlcHNcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG52YXIgY29tcHV0ZWRQcm9wcyA9IFtcblx0XCJpc1Jvb3RcIiwgXCJoYXNDaGlsZHJlblwiLCBcImZpcnN0Q2hpbGRcIiwgXCJsYXN0Q2hpbGRcIiwgXCJuZXh0U2libGluZ1wiLFxuXHRcInByZXZpb3VzU2libGluZ1wiLCBcInBhcmVudE5vZGVcIiwgXCJmaXJzdE5vZGVcIiwgXCJuZXh0U2libGluZ05vZGVcIlxuXTtcblxuZnVuY3Rpb24gQmluZGluZygpIHtcblx0dGhpcy5jaGlsZHJlbiA9IFtdO1xuXHR0aGlzLnBhcmVudCA9IG51bGw7XG5cdHV0aWwuZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0aWVzKHRoaXMsIHV0aWwucGljayh0aGlzLCBjb21wdXRlZFByb3BzKSk7XG5cdHV0aWwudG9BcnJheShhcmd1bWVudHMpLmZvckVhY2godGhpcy5hcHBlbmRDaGlsZCwgdGhpcyk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQmluZGluZztcbkJpbmRpbmcuZXh0ZW5kID0gdXRpbC5zdWJjbGFzcztcbkJpbmRpbmcuaXNCaW5kaW5nID0gZnVuY3Rpb24obykge1xuXHRyZXR1cm4gbyBpbnN0YW5jZW9mIEJpbmRpbmc7XG59XG5cbnV0aWwuZXh0ZW5kKEJpbmRpbmcucHJvdG90eXBlLCBFdmVudHMsIHtcblx0dXNlOiBmdW5jdGlvbihmbikge1xuXHRcdHZhciBhcmdzID0gdXRpbC50b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSk7XG5cdFx0Zm4uYXBwbHkodGhpcywgYXJncyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cdFxuXHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uKGNoaWxkLCBiZWZvcmUpIHtcblx0XHQvLyBzcGVjaWFsIGNhc2UgZm9yIHN0cmluZ3MgYW5kIG51bWJlcnNcblx0XHRpZiAofltcInN0cmluZ1wiLFwibnVtYmVyXCJdLmluZGV4T2YodHlwZW9mIGNoaWxkKSlcblx0XHRcdGNoaWxkID0gbmV3IEJpbmRpbmcuVGV4dChjaGlsZCk7XG5cblx0XHRpZiAoIUJpbmRpbmcuaXNCaW5kaW5nKGNoaWxkKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBjaGlsZCB0byBiZSBhIGJpbmRpbmcuXCIpO1xuXG5cdFx0aWYgKGNoaWxkID09PSB0aGlzKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGFkZCBiaW5kaW5nIGFzIGEgY2hpbGQgb2YgaXRzZWxmLlwiKTtcblxuXHRcdC8vIGRlZmF1bHQgaW5kZXggaXMgdGhlIGVuZFxuXHRcdHZhciBpbmRleCA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoLFxuXHRcdFx0b3BhcmVudCA9IGNoaWxkLnBhcmVudCxcblx0XHRcdGNpbmRleCwgbW92ZWQgPSBmYWxzZTtcblxuXHRcdC8vIG9idGFpbiB0aGUgaW5kZXggdG8gaW5zZXJ0IGF0XG5cdFx0aWYgKGJlZm9yZSAhPSBudWxsKSB7XG5cdFx0XHRpZiAoIUJpbmRpbmcuaXNCaW5kaW5nKGJlZm9yZSkpXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBiZWZvcmUgY2hpbGQgdG8gYmUgYSBiaW5kaW5nLlwiKTtcblxuXHRcdFx0aW5kZXggPSB0aGlzLmluZGV4T2YoYmVmb3JlKTtcblx0XHRcdGlmICghfmluZGV4KSB0aHJvdyBuZXcgRXJyb3IoXCJCZWZvcmUgYmluZGluZyBpcyBub3QgYSBjaGlsZCBvZiB0aGlzIGJpbmRpbmcuXCIpO1xuXHRcdFx0aWYgKGJlZm9yZSA9PT0gY2hpbGQpIHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBhZGQgY2hpbGQgYmVmb3JlIGl0c2VsZi5cIik7XG5cblx0XHRcdC8vIGlmIG5vZGUgaXMgYWxyZWFkeSBhdCB0aGlzIGxvY2F0aW9uLCBubyBuZWVkIHRvIGNvbnRpbnVlXG5cdFx0XHRpZiAoYmVmb3JlLnByZXZpb3VzU2libGluZyA9PT0gY2hpbGQpIHJldHVybiBjaGlsZDtcblx0XHR9XG5cblx0XHQvLyBkbyBzcGVjaWFsIHRoaW5ncyBpZiBjaGlsZCBpcyBhbHJlYWR5IGEgY2hpbGQgb2YgdGhpcyBwYXJlbnRcblx0XHRpZiAob3BhcmVudCA9PT0gdGhpcykge1xuXHRcdFx0Y2luZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkKTtcblxuXHRcdFx0Ly8gaWYgdGhlIGNoaWxkIGlzIGFscmVhZHkgdGhlIG5vZGUgYmVmb3JlIHRoZSBpbmRleCwgbm8gbmVlZCB0byBjb250aW51ZVxuXHRcdFx0aWYgKGNpbmRleCA9PT0gaW5kZXggLSAxKSByZXR1cm4gY2hpbGQ7XG5cblx0XHRcdC8vIHJlbW92ZSB0aGUgY2hpbGRcblx0XHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGNpbmRleCwgMSk7XG5cblx0XHRcdC8vIHVwZGF0ZSB0aGUgaW5kZXggc2luY2UgaXQgbWF5IGhhdmUgY2hhbmdlZFxuXHRcdFx0aW5kZXggPSBiZWZvcmUgIT0gbnVsbCA/IHRoaXMuaW5kZXhPZihiZWZvcmUpIDogdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Ly8gb3Igc2ltdWxhdGUgcmVtb3ZlIGZyb20gZXhpc3RpbmcgcGFyZW50XG5cdFx0ZWxzZSBpZiAob3BhcmVudCAhPSBudWxsKSB7XG5cdFx0XHRvcGFyZW50LmNoaWxkcmVuLnNwbGljZShvcGFyZW50LmluZGV4T2YoY2hpbGQpLCAxKTtcblx0XHRcdGNoaWxkLnBhcmVudCA9IG51bGw7XG5cdFx0XHRvcGFyZW50LnRyaWdnZXIoXCJjaGlsZDpyZW1vdmVcIiwgY2hpbGQpO1xuXHRcdH1cblxuXHRcdC8vIGFkZCB0aGUgY2hpbGRcblx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZShpbmRleCwgMCwgY2hpbGQpO1xuXHRcdGNoaWxkLnBhcmVudCA9IHRoaXM7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50c1xuXHRcdGlmIChvcGFyZW50ID09PSB0aGlzKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJjaGlsZDptb3ZlXCIsIGNoaWxkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiY2hpbGQ6YWRkXCIsIGNoaWxkKTtcblx0XHRcdGNoaWxkLnRyaWdnZXIoXCJwYXJlbnRcIiwgdGhpcywgb3BhcmVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIG5vZGVzIGxhc3Rcblx0XHRjaGlsZC51cGRhdGVOb2RlcygpO1xuXG5cdFx0cmV0dXJuIGNoaWxkO1xuXHR9LFxuXG5cdGFwcGVuZENoaWxkOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHJldHVybiB0aGlzLmluc2VydEJlZm9yZShjaGlsZCk7XG5cdH0sXG5cblx0YXBwZW5kOiBmdW5jdGlvbigpIHtcblx0XHR1dGlsLmZsYXR0ZW4odXRpbC50b0FycmF5KGFyZ3VtZW50cykpLmZvckVhY2godGhpcy5hcHBlbmRDaGlsZCwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQ2hpbGQ6IGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0dmFyIGluZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkKTtcblx0XHRpZiAoIX5pbmRleCkgcmV0dXJuO1xuXG5cdFx0Ly8gcmVtb3ZlIGNoaWxkXG5cdFx0d2hpbGUgKGluZGV4ID4gLTEpIHtcblx0XHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdGluZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkLCBpbmRleCk7XG5cdFx0fVxuXG5cdFx0Y2hpbGQucGFyZW50ID0gbnVsbDtcblxuXHRcdC8vIHRyaWdnZXIgZXZlbnRzXG5cdFx0dGhpcy50cmlnZ2VyKFwiY2hpbGQ6cmVtb3ZlXCIsIGNoaWxkKTtcblx0XHRjaGlsZC50cmlnZ2VyKFwicGFyZW50XCIsIG51bGwsIHRoaXMpO1xuXG5cdFx0Ly8gdXBkYXRlIG5vZGVzIGxhc3Rcblx0XHRjaGlsZC51cGRhdGVOb2RlcygpO1xuXG5cdFx0cmV0dXJuIGNoaWxkO1xuXHR9LFxuXG5cdGVtcHR5OiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmNoaWxkcmVuLnNsaWNlKDApLmZvckVhY2godGhpcy5yZW1vdmVDaGlsZCwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Y29udGFpbnM6IGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5kZXhPZihjaGlsZCkgPiAtMTtcblx0fSxcblxuXHRpbmRleE9mOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLmluZGV4T2YoY2hpbGQpO1xuXHR9LFxuXG5cdGZpcnN0Q2hpbGQ6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuWzBdIHx8IG51bGw7XG5cdH0sXG5cblx0bGFzdENoaWxkOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbGVuID0gdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG5cdFx0cmV0dXJuIGxlbiA/IHRoaXMuY2hpbGRyZW5bbGVuIC0gMV0gOiBudWxsO1xuXHR9LFxuXG5cdG5leHRTaWJsaW5nOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHJldHVybiBudWxsO1xuXG5cdFx0dmFyIGluZGV4ID0gdGhpcy5wYXJlbnQuaW5kZXhPZih0aGlzKSxcblx0XHRcdGNoaWxkcmVuID0gdGhpcy5wYXJlbnQuY2hpbGRyZW47XG5cblx0XHRyZXR1cm4gaW5kZXggPiAtMSAmJiBpbmRleCA8IGNoaWxkcmVuLmxlbmd0aCAtIDEgPyBjaGlsZHJlbltpbmRleCArIDFdIDogbnVsbDtcblx0fSxcblxuXHRwcmV2aW91c1NpYmxpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzUm9vdCkgcmV0dXJuIG51bGw7XG5cblx0XHR2YXIgaW5kZXggPSB0aGlzLnBhcmVudC5pbmRleE9mKHRoaXMpLFxuXHRcdFx0Y2hpbGRyZW4gPSB0aGlzLnBhcmVudC5jaGlsZHJlbjtcblxuXHRcdHJldHVybiBpbmRleCA+IDAgJiYgaW5kZXggPCBjaGlsZHJlbi5sZW5ndGggPyBjaGlsZHJlbltpbmRleCAtIDFdIDogbnVsbDtcblx0fSxcblxuXHRoYXNDaGlsZHJlbjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuY2hpbGRyZW4ubGVuZ3RoID4gMDtcblx0fSxcblxuXHRpc1Jvb3Q6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLnBhcmVudCA9PSBudWxsO1xuXHR9LFxuXG5cdHVwZGF0ZU5vZGVzOiBmdW5jdGlvbigpIHtcblx0XHQvLyB3ZSBtdXN0IHVwZGF0ZSBpbiByZXZlcnNlIHRvIGVuc3VyZSB0aGF0IGJlZm9yZSBub2Rlc1xuXHRcdC8vIGFyZSBhbHJlYWR5IGluIHRoZSBET00gd2hlbiBjaGlsZHJlbiBhcmUgcGxhY2VkXG5cdFx0Zm9yICh2YXIgaSA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdHRoaXMuY2hpbGRyZW5baV0udXBkYXRlTm9kZXMoKTtcblx0XHR9XG5cblx0XHQvLyBldmVudCBpcyBmaXJlZCBhZnRlciwgbWVhbmluZyBjaGlsZHJlbiB3aWxsIGZpcmUgdGhlaXIgZXZlbnRzIGZpcnN0XG5cdFx0dGhpcy50cmlnZ2VyKFwidXBkYXRlXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHRvTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLnJlZHVjZShmdW5jdGlvbihub2RlcywgY2hpbGQpIHtcblx0XHRcdG5vZGVzLnB1c2guYXBwbHkobm9kZXMsIGNoaWxkLnRvTm9kZXMoKSk7XG5cdFx0XHRyZXR1cm4gbm9kZXM7XG5cdFx0fSwgW10pO1xuXHR9LFxuXG5cdHBhcmVudE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzUm9vdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMucGxhY2Vob2xkZXIgIT0gbnVsbCA/XG5cdFx0XHRcdHRoaXMucGxhY2Vob2xkZXIucGFyZW50Tm9kZSA6XG5cdFx0XHRcdG51bGw7XG5cdFx0fVxuXG5cdFx0dmFyIHBhcmVudCA9IHRoaXMucGFyZW50O1xuXG5cdFx0d2hpbGUgKHBhcmVudCAhPSBudWxsKSB7XG5cdFx0XHRpZiAocGFyZW50IGluc3RhbmNlb2YgQmluZGluZy5Ob2RlKSByZXR1cm4gcGFyZW50Lm5vZGU7XG5cdFx0XHRpZiAocGFyZW50LmlzUm9vdCkgcmV0dXJuIHBhcmVudC5wYXJlbnROb2RlO1xuXHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBmaXJzdENoaWxkID0gdGhpcy5maXJzdENoaWxkO1xuXHRcdHJldHVybiBmaXJzdENoaWxkICE9IG51bGwgPyBmaXJzdENoaWxkLmZpcnN0Tm9kZSA6IG51bGw7XG5cdH0sXG5cblx0bmV4dFNpYmxpbmdOb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHtcblx0XHRcdHJldHVybiB0aGlzLnBsYWNlaG9sZGVyICE9IG51bGwgP1xuXHRcdFx0XHR0aGlzLnBsYWNlaG9sZGVyIDpcblx0XHRcdFx0bnVsbDtcblx0XHR9XG5cblx0XHR2YXIgbmV4dFNpYmxpbmcgPSB0aGlzLm5leHRTaWJsaW5nO1xuXHRcdHJldHVybiBuZXh0U2libGluZyAhPSBudWxsID8gbmV4dFNpYmxpbmcuZmlyc3ROb2RlIDpcblx0XHRcdHRoaXMucGFyZW50IGluc3RhbmNlb2YgQmluZGluZy5Ob2RlID8gbnVsbCA6XG5cdFx0XHR0aGlzLnBhcmVudC5uZXh0U2libGluZ05vZGU7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgZWwsIGk7XG5cblx0XHRmb3IgKGkgaW4gdGhpcy5jaGlsZHJlbikge1xuXHRcdFx0ZWwgPSB0aGlzLmNoaWxkcmVuW2ldLmZpbmQoc2VsZWN0b3IpO1xuXHRcdFx0aWYgKGVsICE9IG51bGwpIHJldHVybiBlbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLnJlZHVjZShmdW5jdGlvbihub2RlcywgY2hpbGQpIHtcblx0XHRcdG5vZGVzLnB1c2guYXBwbHkobm9kZXMsIGNoaWxkLmZpbmRBbGwoc2VsZWN0b3IpKTtcblx0XHRcdHJldHVybiBub2Rlcztcblx0XHR9LCBbXSk7XG5cdH0sXG5cblx0cGFpbnQ6IGZ1bmN0aW9uKHBhcmVudCwgYmVmb3JlTm9kZSkge1xuXHRcdGlmICh0eXBlb2YgcGFyZW50ID09PSBcInN0cmluZ1wiKSBwYXJlbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHBhcmVudCk7XG5cdFx0aWYgKHR5cGVvZiBiZWZvcmVOb2RlID09PSBcInN0cmluZ1wiKSBiZWZvcmVOb2RlID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IoYmVmb3JlTm9kZSk7XG5cdFx0aWYgKHBhcmVudCA9PSBudWxsKSBwYXJlbnQgPSBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50KCk7XG5cdFx0aWYgKHRoaXMucGxhY2Vob2xkZXIgPT0gbnVsbCkgdGhpcy5wbGFjZWhvbGRlciA9IGRvY3VtZW50LmNyZWF0ZUNvbW1lbnQodXRpbC51bmlxdWVJZChcIiRcIikpO1xuXG5cdFx0cGFyZW50Lmluc2VydEJlZm9yZSh0aGlzLnBsYWNlaG9sZGVyLCBiZWZvcmVOb2RlKTtcblx0XHR0aGlzLnVwZGF0ZU5vZGVzKCk7XG5cdFx0dGhpcy50cmlnZ2VyKFwicGFpbnRcIiwgcGFyZW50LCBiZWZvcmVOb2RlKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGRldGFjaDogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMucGxhY2Vob2xkZXIgIT0gbnVsbCAmJiB0aGlzLnBsYWNlaG9sZGVyLnBhcmVudE5vZGUpIHtcblx0XHRcdHRoaXMucGxhY2Vob2xkZXIucGFyZW50Tm9kZS5yZW1vdmVDaGlsZCh0aGlzLnBsYWNlaG9sZGVyKTtcblx0XHR9XG5cblx0XHR0aGlzLnVwZGF0ZU5vZGVzKCk7XG5cdFx0dGhpcy50cmlnZ2VyKFwiZGV0YWNoXCIpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YXV0b3J1bjogZnVuY3Rpb24oZm4sIG9ubHlPbkFjdGl2ZSkge1xuXHRcdHZhciBjb21wID0gRGVwcy5hdXRvcnVuKGZuLCB0aGlzKTtcblx0XHRpZiAob25seU9uQWN0aXZlICYmICFEZXBzLmFjdGl2ZSkgY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIGNvbXA7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLm1hcChmdW5jdGlvbihjaGlsZCkge1xuXHRcdFx0cmV0dXJuIGNoaWxkLnRvU3RyaW5nKCk7XG5cdFx0fSkuam9pbihcIlwiKTtcblx0fSxcblxuXHQvLyBhIGdlbmVyYWxpemVkIHJlYWN0aXZlIHdvcmtmbG93IGhlbHBlclxuXHRtb3VudDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGFyZ3MgPSB1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSwgY29tcDtcblxuXHRcdERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHQvLyBzdG9wIGV4aXN0aW5nIG1vdW50XG5cdFx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdFx0Ly8gaW5pdCB0aGUgZnVuY3Rpb24gZXZlbnQgbWV0aG9kc1xuXHRcdFx0dGhpcy5faW5pdEV2ZW50TWV0aG9kcygpO1xuXG5cdFx0XHQvLyB0aGUgZmlyc3QgZXZlbnQgaW4gdGhlIGN5Y2xlLCBiZWZvcmUgZXZlcnl0aGluZyBlbHNlXG5cdFx0XHR0aGlzLl9tb3VudGluZyA9IHRydWU7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDpiZWZvcmVcIiwgYXJncyk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHQvLyB0aGUgYXV0b3J1biBjb21wdXRhdGlvblxuXHRcdGNvbXAgPSB0aGlzLl9jb21wID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdC8vIG9ubHkgcmVuZGVyIGV2ZW50IHdpdGhvdXQgYmluZGluZ3Ncblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjpiZWZvcmVcIiwgYXJncywgY29tcCk7XG5cblx0XHRcdC8vIHJ1biByZW5kZXIgYW5kIHByb2Nlc3MgdGhlIHJlc3VsdGluZyBiaW5kaW5ncyBpbnRvIGFuIGFycmF5XG5cdFx0XHR2YXIgYmluZGluZ3MgPSB0aGlzLnJlbmRlci5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdGlmIChCaW5kaW5nLmlzQmluZGluZyhiaW5kaW5ncykpIGJpbmRpbmdzID0gWyBiaW5kaW5ncyBdO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGJpbmRpbmdzKSkgYmluZGluZ3MgPSBbXTtcblxuXHRcdFx0Ly8gbWFpbiByZW5kZXIgZXZlbnQgZXhlY3MgYWZ0ZXIgcmVuZGVyIGJ1dCBiZWZvcmUgYXBwZW5kaW5nXG5cdFx0XHQvLyB0aGUgYmluZGluZ3MgYXJyYXkgY2FuIGJlIGFmZmVjdGVkIGJ5IHRoaXMgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlclwiLCBhcmdzLCBjb21wLCBiaW5kaW5ncyk7XG5cblx0XHRcdC8vIGFwcGVuZCB0aGUgYmluZGluZ3MgaW4gb3JkZXJcblx0XHRcdGJpbmRpbmdzID0gYmluZGluZ3MubWFwKHRoaXMuYXBwZW5kQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XG5cdFx0XHQvLyB0aGUgbGFzdCByZW5kZXIgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjphZnRlclwiLCBhcmdzLCBjb21wLCBiaW5kaW5ncyk7XG5cblx0XHRcdC8vIGF1dG8gY2xlYW4gdXBcblx0XHRcdGNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQvLyBvbmx5IGludmFsaWRhdGUgZXZlbnQgd2l0aCBiaW5kaW5nc1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJpbnZhbGlkYXRlOmJlZm9yZVwiLCBhcmdzLCBjb21wLCBiaW5kaW5ncyk7XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyByZW1vdmUgdGhlIGJpbmRpbmdzIGFkZGVkIGJlZm9yZVxuXHRcdFx0XHRiaW5kaW5ncy5mb3JFYWNoKHRoaXMucmVtb3ZlQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XHRcblx0XHRcdFx0Ly8gcmVtYWluaW5nIGludmFsaWRhdGUgZXZlbnRzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGVcIiwgYXJncywgY29tcCk7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGU6YWZ0ZXJcIiwgYXJncywgY29tcCk7XG5cblx0XHRcdFx0Ly8gZGV0ZWN0IGlmIHRoZSBjb21wdXRhdGlvbiBzdG9wcGVkXG5cdFx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJzdG9wXCIsIGFyZ3MpO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9jb21wO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIHJlbWFpbmluZyBtb3VudCBldmVudHMgaGFwcGVuIGFmdGVyIHRoZSBmaXJzdCByZW5kZXJcblx0XHREZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnRcIiwgYXJncywgY29tcCk7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDphZnRlclwiLCBhcmdzLCBjb21wKTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9tb3VudGluZztcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbmRlcjogZnVuY3Rpb24oKXt9LFxuXG5cdGlzTW91bnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuaXNNb3VudGluZygpIHx8IHRoaXMuX2NvbXAgIT0gbnVsbDtcblx0fSxcblxuXHRpc01vdW50aW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9tb3VudGluZztcblx0fSxcblxuXHRnZXRDb21wdXRhdGlvbjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXA7XG5cdH0sXG5cblx0aW52YWxpZGF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNNb3VudGVkKCkpIHRoaXMuX2NvbXAuaW52YWxpZGF0ZSgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHN0b3A6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzTW91bnRlZCgpKSB0aGlzLl9jb21wLnN0b3AoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyB0dXJucyBhIGZldyBldmVudHMgaW50byBpbnN0YW5jZSBtZXRob2RzIHRvIG1ha2UgdGhpcyBjbGFzcyBtb3JlIGZ1bmN0aW9uYWxcblx0Ly8gYnV0IGFsc28gdG8gbWF0Y2ggY2xvc2VyIHRvIEZCJ3MgUmVhY3QgY29tcG9uZW50IEFQSVxuXHRfaW5pdEV2ZW50TWV0aG9kczogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX2V2ZW50TWV0aG9kcykgcmV0dXJuIHRoaXM7XG5cdFx0dGhpcy5fZXZlbnRNZXRob2RzID0gdHJ1ZTtcblxuXHRcdFtcIm1vdW50XCIsXCJyZW5kZXJcIixcImludmFsaWRhdGVcIl0uZm9yRWFjaChmdW5jdGlvbihldnQpIHtcblx0XHRcdHZhciBjYXBzID0gZXZ0WzBdLnRvVXBwZXJDYXNlKCkgKyBldnQuc3Vic3RyKDEpO1xuXHRcdFx0dGhpcy5vbihldnQgKyBcIjpiZWZvcmVcIiwgdXRpbC5ydW5JZkV4aXN0cyh0aGlzLCBcImJlZm9yZVwiICsgY2FwcykpO1xuXHRcdFx0dGhpcy5vbihldnQsIHV0aWwucnVuSWZFeGlzdHModGhpcywgXCJvblwiICsgY2FwcykpO1xuXHRcdFx0dGhpcy5vbihldnQgKyBcIjphZnRlclwiLCB1dGlsLnJ1bklmRXhpc3RzKHRoaXMsIFwiYWZ0ZXJcIiArIGNhcHMpKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHRoaXMub24oXCJzdG9wXCIsIHV0aWwucnVuSWZFeGlzdHModGhpcywgXCJvblN0b3BcIikpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxufSk7XG5cbi8vIGFsaWFzZXNcbkJpbmRpbmcucHJvdG90eXBlLmhhc0NoaWxkID0gQmluZGluZy5wcm90b3R5cGUuY29udGFpbnM7XG5CaW5kaW5nLnByb3RvdHlwZS5yZW1vdmVBbGxDaGlsZHJlbiA9IEJpbmRpbmcucHJvdG90eXBlLmVtcHR5O1xuQmluZGluZy5wcm90b3R5cGUudG9IVE1MID0gQmluZGluZy5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8vIExvYWQgdGhlIGJpbmRpbmdzXG51dGlsLmV4dGVuZChCaW5kaW5nLCByZXF1aXJlKFwiLi9ub2RlXCIpKTtcbkJpbmRpbmcuSFRNTCA9IHJlcXVpcmUoXCIuL2h0bWxcIik7IiwiLy8gQ29weSBvZiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9jb21taXRzL2U3ODg2MWI3ZDBkYmI2MGU1ZTJiZjU5YmFiMmNiMDZjZTY1OTZjMDQvcGFja2FnZXMvZGVwcy9kZXBzLmpzXG4vLyAoYykgMjAxMS0yMDE0IE1ldGVvciBEZXZlbG9wbWVudCBHcm91cFxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gUGFja2FnZSBkb2NzIGF0IGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHMgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciBEZXBzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19hY3RpdmVcbkRlcHMuYWN0aXZlID0gZmFsc2U7XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfY3VycmVudGNvbXB1dGF0aW9uXG5EZXBzLmN1cnJlbnRDb21wdXRhdGlvbiA9IG51bGw7XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuICBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbiA9IGM7XG4gIERlcHMuYWN0aXZlID0gISEgYztcbn07XG5cbnZhciBfZGVidWdGdW5jID0gZnVuY3Rpb24gKCkge1xuICAvLyBsYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5XG4gIHJldHVybiAodHlwZW9mIE1ldGVvciAhPT0gXCJ1bmRlZmluZWRcIiA/IE1ldGVvci5fZGVidWcgOlxuICAgICAgICAgICgodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUubG9nID9cbiAgICAgICAgICAgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcbiAgICAgICAgICAgZnVuY3Rpb24gKCkge30pKTtcbn07XG5cbnZhciBfdGhyb3dPckxvZyA9IGZ1bmN0aW9uIChmcm9tLCBlKSB7XG4gIGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcbiAgICB0aHJvdyBlO1xuICB9IGVsc2Uge1xuICAgIF9kZWJ1Z0Z1bmMoKShcIkV4Y2VwdGlvbiBmcm9tIERlcHMgXCIgKyBmcm9tICsgXCIgZnVuY3Rpb246XCIsXG4gICAgICAgICAgICAgICAgIGUuc3RhY2sgfHwgZS5tZXNzYWdlKTtcbiAgfVxufTtcblxuLy8gVGFrZXMgYSBmdW5jdGlvbiBgZmAsIGFuZCB3cmFwcyBpdCBpbiBhIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZGBcbi8vIGJsb2NrIGlmIHdlIGFyZSBydW5uaW5nIG9uIHRoZSBzZXJ2ZXIuIE9uIHRoZSBjbGllbnQsIHJldHVybnMgdGhlXG4vLyBvcmlnaW5hbCBmdW5jdGlvbiAoc2luY2UgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYCBpcyBhXG4vLyBuby1vcCkuIFRoaXMgaGFzIHRoZSBiZW5lZml0IG9mIG5vdCBhZGRpbmcgYW4gdW5uZWNlc3Nhcnkgc3RhY2tcbi8vIGZyYW1lIG9uIHRoZSBjbGllbnQuXG52YXIgd2l0aE5vWWllbGRzQWxsb3dlZCA9IGZ1bmN0aW9uIChmKSB7XG4gIGlmICgodHlwZW9mIE1ldGVvciA9PT0gJ3VuZGVmaW5lZCcpIHx8IE1ldGVvci5pc0NsaWVudCkge1xuICAgIHJldHVybiBmO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZi5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH1cbn07XG5cbnZhciBuZXh0SWQgPSAxO1xuLy8gY29tcHV0YXRpb25zIHdob3NlIGNhbGxiYWNrcyB3ZSBzaG91bGQgY2FsbCBhdCBmbHVzaCB0aW1lXG52YXIgcGVuZGluZ0NvbXB1dGF0aW9ucyA9IFtdO1xuLy8gYHRydWVgIGlmIGEgRGVwcy5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBEZXBzLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBEZXBzLmZsdXNoIG5vd1xudmFyIGluRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgY29tcHV0aW5nIGEgY29tcHV0YXRpb24gbm93LCBlaXRoZXIgZmlyc3QgdGltZVxuLy8gb3IgcmVjb21wdXRlLiAgVGhpcyBtYXRjaGVzIERlcHMuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBEZXBzLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBEZXBzLmZsdXNoIHRoYXQgd2UgYXJlIGluLiBXaGVuIHNldCwgdGhyb3cgcmF0aGVyIHRoYW4gbG9nIHRoZVxuLy8gZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQgd2hpbGUgZmx1c2hpbmcuIEJlZm9yZSB0aHJvd2luZyB0aGUgZXJyb3IsXG4vLyBmaW5pc2ggZmx1c2hpbmcgKGZyb20gYSBmaW5hbGx5IGJsb2NrKSwgbG9nZ2luZyBhbnkgc3Vic2VxdWVudFxuLy8gZXJyb3JzLlxudmFyIHRocm93Rmlyc3RFcnJvciA9IGZhbHNlO1xuXG52YXIgYWZ0ZXJGbHVzaENhbGxiYWNrcyA9IFtdO1xuXG52YXIgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID0gdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/XG4gIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gIHdpbmRvdy5vUmVxdWVzdEFuaW1hdGlvbkZyYW1lIDpcbiAgZnVuY3Rpb24oZikge1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBmKERhdGUubm93KCkpO1xuICAgIH0sIDEwMDAgLyAzMCk7XG4gIH07XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghIHdpbGxGbHVzaCkge1xuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShEZXBzLmZsdXNoKTtcbiAgICB3aWxsRmx1c2ggPSB0cnVlO1xuICB9XG59O1xuXG4vLyBEZXBzLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHZpc2libGUgYnV0IHByaXZhdGVcbi8vICh0aHJvd3MgYW4gZXJyb3IgaWYgeW91IHRyeSB0byBjYWxsIGl0KVxudmFyIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2NvbXB1dGF0aW9uXG4vL1xuRGVwcy5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQsIGN0eCkge1xuICBpZiAoISBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbilcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIkRlcHMuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgcHJpdmF0ZTsgdXNlIERlcHMuYXV0b3J1blwiKTtcbiAgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuICBzZWxmLnN0b3BwZWQgPSBmYWxzZTtcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlZFxuICBzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fZmlyc3RydW5cbiAgc2VsZi5maXJzdFJ1biA9IHRydWU7XG5cbiAgc2VsZi5faWQgPSBuZXh0SWQrKztcbiAgc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG4gIC8vIHRoZSBwbGFuIGlzIGF0IHNvbWUgcG9pbnQgdG8gdXNlIHRoZSBwYXJlbnQgcmVsYXRpb25cbiAgLy8gdG8gY29uc3RyYWluIHRoZSBvcmRlciB0aGF0IGNvbXB1dGF0aW9ucyBhcmUgcHJvY2Vzc2VkXG4gIHNlbGYuX3BhcmVudCA9IHBhcmVudDtcbiAgc2VsZi5fZnVuYyA9IGY7XG4gIHNlbGYuX2NvbnRleHQgPSBjdHggfHwgdGhpcztcbiAgc2VsZi5fcmVjb21wdXRpbmcgPSBmYWxzZTtcblxuICB2YXIgZXJyb3JlZCA9IHRydWU7XG4gIHRyeSB7XG4gICAgc2VsZi5fY29tcHV0ZSgpO1xuICAgIGVycm9yZWQgPSBmYWxzZTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG4gICAgaWYgKGVycm9yZWQpXG4gICAgICBzZWxmLnN0b3AoKTtcbiAgfVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cbiAgaWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcbiAgICBEZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgZi5fY29udGV4dCA9IGN0eDtcbiAgICBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MucHVzaChmKTtcbiAgfVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZVxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUuaW52YWxpZGF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBpZiAoISBzZWxmLmludmFsaWRhdGVkKSB7XG4gICAgLy8gaWYgd2UncmUgY3VycmVudGx5IGluIF9yZWNvbXB1dGUoKSwgZG9uJ3QgZW5xdWV1ZVxuICAgIC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuICAgIGlmICghIHNlbGYuX3JlY29tcHV0aW5nICYmICEgc2VsZi5zdG9wcGVkKSB7XG4gICAgICByZXF1aXJlRmx1c2goKTtcbiAgICAgIHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcbiAgICB9XG5cbiAgICBzZWxmLmludmFsaWRhdGVkID0gdHJ1ZTtcblxuICAgIC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG4gICAgLy8gc2VsZi5pbnZhbGlkYXRlZCA9PT0gdHJ1ZS5cbiAgICBmb3IodmFyIGkgPSAwLCBmOyBmID0gc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzW2ldOyBpKyspIHtcbiAgICAgIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuICAgICAgICB3aXRoTm9ZaWVsZHNBbGxvd2VkKGYpLmNhbGwoZi5fY29udGV4dCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcbiAgfVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCEgdGhpcy5zdG9wcGVkKSB7XG4gICAgdGhpcy5zdG9wcGVkID0gdHJ1ZTtcbiAgICB0aGlzLmludmFsaWRhdGUoKTtcbiAgfVxufTtcblxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUuX2NvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgc2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG4gIHZhciBwcmV2aW91cyA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICBzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG4gIHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcbiAgaW5Db21wdXRlID0gdHJ1ZTtcbiAgdHJ5IHtcbiAgICB3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG4gIH0gZmluYWxseSB7XG4gICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcbiAgICBpbkNvbXB1dGUgPSBmYWxzZTtcbiAgfVxufTtcblxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUuX3JlY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIHNlbGYuX3JlY29tcHV0aW5nID0gdHJ1ZTtcbiAgdHJ5IHtcbiAgICB3aGlsZSAoc2VsZi5pbnZhbGlkYXRlZCAmJiAhIHNlbGYuc3RvcHBlZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc2VsZi5fY29tcHV0ZSgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBfdGhyb3dPckxvZyhcInJlY29tcHV0ZVwiLCBlKTtcbiAgICAgIH1cbiAgICAgIC8vIElmIF9jb21wdXRlKCkgaW52YWxpZGF0ZWQgdXMsIHdlIHJ1biBhZ2FpbiBpbW1lZGlhdGVseS5cbiAgICAgIC8vIEEgY29tcHV0YXRpb24gdGhhdCBpbnZhbGlkYXRlcyBpdHNlbGYgaW5kZWZpbml0ZWx5IGlzIGFuXG4gICAgICAvLyBpbmZpbml0ZSBsb29wLCBvZiBjb3Vyc2UuXG4gICAgICAvL1xuICAgICAgLy8gV2UgY291bGQgcHV0IGFuIGl0ZXJhdGlvbiBjb3VudGVyIGhlcmUgYW5kIGNhdGNoIHJ1bi1hd2F5XG4gICAgICAvLyBsb29wcy5cbiAgICB9XG4gIH0gZmluYWxseSB7XG4gICAgc2VsZi5fcmVjb21wdXRpbmcgPSBmYWxzZTtcbiAgfVxufTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfZGVwZW5kZW5jeVxuLy9cbkRlcHMuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4vL1xuLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4vLyBwcmVzZW50LiAgUmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4vLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbi8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cbkRlcHMuRGVwZW5kZW5jeS5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24gKGNvbXB1dGF0aW9uKSB7XG4gIGlmICghIGNvbXB1dGF0aW9uKSB7XG4gICAgaWYgKCEgRGVwcy5hY3RpdmUpXG4gICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICBjb21wdXRhdGlvbiA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICB9XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIGlkID0gY29tcHV0YXRpb24uX2lkO1xuICBpZiAoISAoaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpKSB7XG4gICAgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdID0gY29tcHV0YXRpb247XG4gICAgY29tcHV0YXRpb24ub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlbGV0ZSBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF07XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9jaGFuZ2VkXG5EZXBzLkRlcGVuZGVuY3kucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgZm9yICh2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG4gICAgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdLmludmFsaWRhdGUoKTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfaGFzZGVwZW5kZW50c1xuRGVwcy5EZXBlbmRlbmN5LnByb3RvdHlwZS5oYXNEZXBlbmRlbnRzID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG4gICAgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfZmx1c2hcbkRlcHMuZmx1c2ggPSBmdW5jdGlvbiAoX29wdHMpIHtcbiAgLy8gWFhYIFdoYXQgcGFydCBvZiB0aGUgY29tbWVudCBiZWxvdyBpcyBzdGlsbCB0cnVlPyAoV2Ugbm8gbG9uZ2VyXG4gIC8vIGhhdmUgU3BhcmspXG4gIC8vXG4gIC8vIE5lc3RlZCBmbHVzaCBjb3VsZCBwbGF1c2libHkgaGFwcGVuIGlmLCBzYXksIGEgZmx1c2ggY2F1c2VzXG4gIC8vIERPTSBtdXRhdGlvbiwgd2hpY2ggY2F1c2VzIGEgXCJibHVyXCIgZXZlbnQsIHdoaWNoIHJ1bnMgYW5cbiAgLy8gYXBwIGV2ZW50IGhhbmRsZXIgdGhhdCBjYWxscyBEZXBzLmZsdXNoLiAgQXQgdGhlIG1vbWVudFxuICAvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG4gIC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLiAgQW5kIHdlIGRvbid0IGhhdmVcbiAgLy8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG4gIC8vXG4gIC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcbiAgaWYgKGluRmx1c2gpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBEZXBzLmZsdXNoIHdoaWxlIGZsdXNoaW5nXCIpO1xuXG4gIGlmIChpbkNvbXB1dGUpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmx1c2ggaW5zaWRlIERlcHMuYXV0b3J1blwiKTtcblxuICBpbkZsdXNoID0gdHJ1ZTtcbiAgd2lsbEZsdXNoID0gdHJ1ZTtcbiAgdGhyb3dGaXJzdEVycm9yID0gISEgKF9vcHRzICYmIF9vcHRzLl90aHJvd0ZpcnN0RXJyb3IpO1xuXG4gIHZhciBmaW5pc2hlZFRyeSA9IGZhbHNlO1xuICB0cnkge1xuICAgIHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCB8fFxuICAgICAgICAgICBhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuXG4gICAgICAvLyByZWNvbXB1dGUgYWxsIHBlbmRpbmcgY29tcHV0YXRpb25zXG4gICAgICB3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgdmFyIGNvbXAgPSBwZW5kaW5nQ29tcHV0YXRpb25zLnNoaWZ0KCk7XG4gICAgICAgIGNvbXAuX3JlY29tcHV0ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcbiAgICAgICAgLy8gY2FsbCBvbmUgYWZ0ZXJGbHVzaCBjYWxsYmFjaywgd2hpY2ggbWF5XG4gICAgICAgIC8vIGludmFsaWRhdGUgbW9yZSBjb21wdXRhdGlvbnNcbiAgICAgICAgdmFyIGZ1bmMgPSBhZnRlckZsdXNoQ2FsbGJhY2tzLnNoaWZ0KCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZnVuYy5jYWxsKGZ1bmMuX2NvbnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgX3Rocm93T3JMb2coXCJhZnRlckZsdXNoIGZ1bmN0aW9uXCIsIGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGZpbmlzaGVkVHJ5ID0gdHJ1ZTtcbiAgfSBmaW5hbGx5IHtcbiAgICBpZiAoISBmaW5pc2hlZFRyeSkge1xuICAgICAgLy8gd2UncmUgZXJyb3JpbmdcbiAgICAgIGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBEZXBzLmZsdXNoKClgIGFnYWluXG4gICAgICBEZXBzLmZsdXNoKHtfdGhyb3dGaXJzdEVycm9yOiBmYWxzZX0pOyAvLyBmaW5pc2ggZmx1c2hpbmdcbiAgICB9XG4gICAgd2lsbEZsdXNoID0gZmFsc2U7XG4gICAgaW5GbHVzaCA9IGZhbHNlO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2F1dG9ydW5cbi8vXG4vLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4vLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuLy9cbi8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4vL1xuLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4vLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG5EZXBzLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0RlcHMuYXV0b3J1biByZXF1aXJlcyBhIGZ1bmN0aW9uIGFyZ3VtZW50Jyk7XG5cbiAgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuICB2YXIgYyA9IG5ldyBEZXBzLkNvbXB1dGF0aW9uKGYsIERlcHMuY3VycmVudENvbXB1dGF0aW9uLCBjdHgpO1xuXG4gIGlmIChEZXBzLmFjdGl2ZSlcbiAgICBEZXBzLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG4gICAgICBjLnN0b3AoKTtcbiAgICB9KTtcblxuICByZXR1cm4gYztcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfbm9ucmVhY3RpdmVcbi8vXG4vLyBSdW4gYGZgIHdpdGggbm8gY3VycmVudCBjb21wdXRhdGlvbiwgcmV0dXJuaW5nIHRoZSByZXR1cm4gdmFsdWVcbi8vIG9mIGBmYC4gIFVzZWQgdG8gdHVybiBvZmYgcmVhY3Rpdml0eSBmb3IgdGhlIGR1cmF0aW9uIG9mIGBmYCxcbi8vIHNvIHRoYXQgcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFjY2Vzc2VkIGJ5IGBmYCB3aWxsIG5vdCByZXN1bHQgaW4gYW55XG4vLyBjb21wdXRhdGlvbnMgYmVpbmcgaW52YWxpZGF0ZWQuXG5EZXBzLm5vbnJlYWN0aXZlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICB2YXIgcHJldmlvdXMgPSBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbjtcbiAgc2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuICB0cnkge1xuICAgIHJldHVybiBmLmNhbGwoY3R4KTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuICB9XG59O1xuXG4vLyBzaW1pbGFyIHRvIG5vbnJlYWN0aXZlIGJ1dCByZXR1cm5zIGEgZnVuY3Rpb24gaW5zdGVhZCBvZlxuLy8gZXhlY3R1aW5nIGZuIGltbWVkaWF0ZWx5LiBmb3J3YXJkcyBhbnkgYXJndW1lbnRzIHBhc3NlZCB0byB0aGUgZnVuY3Rpb25cbkRlcHMubm9ucmVhY3RhYmxlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHByZXZpb3VzID0gRGVwcy5jdXJyZW50Q29tcHV0YXRpb247XG4gICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gZi5hcHBseShjdHggfHwgdGhpcywgYXJndW1lbnRzKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcbiAgICB9XG4gIH1cbn1cblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19vbmludmFsaWRhdGVcbkRlcHMub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICBpZiAoISBEZXBzLmFjdGl2ZSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJEZXBzLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuICBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZiwgY3R4KTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfYWZ0ZXJmbHVzaFxuRGVwcy5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICBmLl9jb250ZXh0ID0gY3R4O1xuICBhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goZik7XG4gIHJlcXVpcmVGbHVzaCgpO1xufTsiLCJ2YXIgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbi8vIEJhY2tib25lLkV2ZW50c1xuLy8gLS0tLS0tLS0tLS0tLS0tXG5cbi8vIEEgbW9kdWxlIHRoYXQgY2FuIGJlIG1peGVkIGluIHRvICphbnkgb2JqZWN0KiBpbiBvcmRlciB0byBwcm92aWRlIGl0IHdpdGhcbi8vIGN1c3RvbSBldmVudHMuIFlvdSBtYXkgYmluZCB3aXRoIGBvbmAgb3IgcmVtb3ZlIHdpdGggYG9mZmAgY2FsbGJhY2tcbi8vIGZ1bmN0aW9ucyB0byBhbiBldmVudDsgYHRyaWdnZXJgLWluZyBhbiBldmVudCBmaXJlcyBhbGwgY2FsbGJhY2tzIGluXG4vLyBzdWNjZXNzaW9uLlxuLy9cbi8vICAgICB2YXIgb2JqZWN0ID0ge307XG4vLyAgICAgdXRpbC5leHRlbmQob2JqZWN0LCBCYWNrYm9uZS5FdmVudHMpO1xuLy8gICAgIG9iamVjdC5vbignZXhwYW5kJywgZnVuY3Rpb24oKXsgYWxlcnQoJ2V4cGFuZGVkJyk7IH0pO1xuLy8gICAgIG9iamVjdC50cmlnZ2VyKCdleHBhbmQnKTtcbi8vXG52YXIgRXZlbnRzID0gbW9kdWxlLmV4cG9ydHMgPSB7XG5cblx0Ly8gQmluZCBhbiBldmVudCB0byBhIGBjYWxsYmFja2AgZnVuY3Rpb24uIFBhc3NpbmcgYFwiYWxsXCJgIHdpbGwgYmluZFxuXHQvLyB0aGUgY2FsbGJhY2sgdG8gYWxsIGV2ZW50cyBmaXJlZC5cblx0b246IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ29uJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcblx0XHR0aGlzLl9ldmVudHMgfHwgKHRoaXMuX2V2ZW50cyA9IHt9KTtcblx0XHR2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdIHx8ICh0aGlzLl9ldmVudHNbbmFtZV0gPSBbXSk7XG5cdFx0ZXZlbnRzLnB1c2goe2NhbGxiYWNrOiBjYWxsYmFjaywgY29udGV4dDogY29udGV4dCwgY3R4OiBjb250ZXh0IHx8IHRoaXN9KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBCaW5kIGFuIGV2ZW50IHRvIG9ubHkgYmUgdHJpZ2dlcmVkIGEgc2luZ2xlIHRpbWUuIEFmdGVyIHRoZSBmaXJzdCB0aW1lXG5cdC8vIHRoZSBjYWxsYmFjayBpcyBpbnZva2VkLCBpdCB3aWxsIGJlIHJlbW92ZWQuXG5cdG9uY2U6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ29uY2UnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSB8fCAhY2FsbGJhY2spIHJldHVybiB0aGlzO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHR2YXIgZm4gPSBvbmNlKGZ1bmN0aW9uKCkge1xuXHRcdFx0c2VsZi5vZmYobmFtZSwgZm4pO1xuXHRcdFx0Y2FsbGJhY2suYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHR9KTtcblx0XHRmbi5fY2FsbGJhY2sgPSBjYWxsYmFjaztcblx0XHRyZXR1cm4gdGhpcy5vbihuYW1lLCBmbiwgY29udGV4dCk7XG5cdH0sXG5cblx0Ly8gUmVtb3ZlIG9uZSBvciBtYW55IGNhbGxiYWNrcy4gSWYgYGNvbnRleHRgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG5cdC8vIGNhbGxiYWNrcyB3aXRoIHRoYXQgZnVuY3Rpb24uIElmIGBjYWxsYmFja2AgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcblx0Ly8gY2FsbGJhY2tzIGZvciB0aGUgZXZlbnQuIElmIGBuYW1lYCBpcyBudWxsLCByZW1vdmVzIGFsbCBib3VuZFxuXHQvLyBjYWxsYmFja3MgZm9yIGFsbCBldmVudHMuXG5cdG9mZjogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblx0XHR2YXIgcmV0YWluLCBldiwgZXZlbnRzLCBuYW1lcywgaSwgbCwgaiwgaztcblx0XHRpZiAoIXRoaXMuX2V2ZW50cyB8fCAhZXZlbnRzQXBpKHRoaXMsICdvZmYnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSkgcmV0dXJuIHRoaXM7XG5cdFx0aWYgKCFuYW1lICYmICFjYWxsYmFjayAmJiAhY29udGV4dCkge1xuXHRcdFx0dGhpcy5fZXZlbnRzID0gdm9pZCAwO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdG5hbWVzID0gbmFtZSA/IFtuYW1lXSA6IE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XG5cdFx0Zm9yIChpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0bmFtZSA9IG5hbWVzW2ldO1xuXHRcdFx0aWYgKGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSkge1xuXHRcdFx0XHR0aGlzLl9ldmVudHNbbmFtZV0gPSByZXRhaW4gPSBbXTtcblx0XHRcdFx0aWYgKGNhbGxiYWNrIHx8IGNvbnRleHQpIHtcblx0XHRcdFx0XHRmb3IgKGogPSAwLCBrID0gZXZlbnRzLmxlbmd0aDsgaiA8IGs7IGorKykge1xuXHRcdFx0XHRcdFx0ZXYgPSBldmVudHNbal07XG5cdFx0XHRcdFx0XHRpZiAoKGNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2suX2NhbGxiYWNrKSB8fFxuXHRcdFx0XHRcdFx0XHRcdChjb250ZXh0ICYmIGNvbnRleHQgIT09IGV2LmNvbnRleHQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldGFpbi5wdXNoKGV2KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFyZXRhaW4ubGVuZ3RoKSBkZWxldGUgdGhpcy5fZXZlbnRzW25hbWVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIFRyaWdnZXIgb25lIG9yIG1hbnkgZXZlbnRzLCBmaXJpbmcgYWxsIGJvdW5kIGNhbGxiYWNrcy4gQ2FsbGJhY2tzIGFyZVxuXHQvLyBwYXNzZWQgdGhlIHNhbWUgYXJndW1lbnRzIGFzIGB0cmlnZ2VyYCBpcywgYXBhcnQgZnJvbSB0aGUgZXZlbnQgbmFtZVxuXHQvLyAodW5sZXNzIHlvdSdyZSBsaXN0ZW5pbmcgb24gYFwiYWxsXCJgLCB3aGljaCB3aWxsIGNhdXNlIHlvdXIgY2FsbGJhY2sgdG9cblx0Ly8gcmVjZWl2ZSB0aGUgdHJ1ZSBuYW1lIG9mIHRoZSBldmVudCBhcyB0aGUgZmlyc3QgYXJndW1lbnQpLlxuXHR0cmlnZ2VyOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0aWYgKCF0aGlzLl9ldmVudHMpIHJldHVybiB0aGlzO1xuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblx0XHRpZiAoIWV2ZW50c0FwaSh0aGlzLCAndHJpZ2dlcicsIG5hbWUsIGFyZ3MpKSByZXR1cm4gdGhpcztcblx0XHR2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdO1xuXHRcdHZhciBhbGxFdmVudHMgPSB0aGlzLl9ldmVudHMuYWxsO1xuXHRcdGlmIChldmVudHMpIHRyaWdnZXJFdmVudHMoZXZlbnRzLCBhcmdzKTtcblx0XHRpZiAoYWxsRXZlbnRzKSB0cmlnZ2VyRXZlbnRzKGFsbEV2ZW50cywgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBUZWxsIHRoaXMgb2JqZWN0IHRvIHN0b3AgbGlzdGVuaW5nIHRvIGVpdGhlciBzcGVjaWZpYyBldmVudHMgLi4uIG9yXG5cdC8vIHRvIGV2ZXJ5IG9iamVjdCBpdCdzIGN1cnJlbnRseSBsaXN0ZW5pbmcgdG8uXG5cdHN0b3BMaXN0ZW5pbmc6IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcblx0XHR2YXIgbGlzdGVuaW5nVG8gPSB0aGlzLl9saXN0ZW5pbmdUbztcblx0XHRpZiAoIWxpc3RlbmluZ1RvKSByZXR1cm4gdGhpcztcblx0XHR2YXIgcmVtb3ZlID0gIW5hbWUgJiYgIWNhbGxiYWNrO1xuXHRcdGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG5cdFx0aWYgKG9iaikgKGxpc3RlbmluZ1RvID0ge30pW29iai5fbGlzdGVuSWRdID0gb2JqO1xuXHRcdGZvciAodmFyIGlkIGluIGxpc3RlbmluZ1RvKSB7XG5cdFx0XHRvYmogPSBsaXN0ZW5pbmdUb1tpZF07XG5cdFx0XHRvYmoub2ZmKG5hbWUsIGNhbGxiYWNrLCB0aGlzKTtcblx0XHRcdGlmIChyZW1vdmUgfHwgaXNFbXB0eShvYmouX2V2ZW50cykpIGRlbGV0ZSB0aGlzLl9saXN0ZW5pbmdUb1tpZF07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cbn07XG5cbi8vIFJlZ3VsYXIgZXhwcmVzc2lvbiB1c2VkIHRvIHNwbGl0IGV2ZW50IHN0cmluZ3MuXG52YXIgZXZlbnRTcGxpdHRlciA9IC9cXHMrLztcblxuLy8gSW1wbGVtZW50IGZhbmN5IGZlYXR1cmVzIG9mIHRoZSBFdmVudHMgQVBJIHN1Y2ggYXMgbXVsdGlwbGUgZXZlbnRcbi8vIG5hbWVzIGBcImNoYW5nZSBibHVyXCJgIGFuZCBqUXVlcnktc3R5bGUgZXZlbnQgbWFwcyBge2NoYW5nZTogYWN0aW9ufWBcbi8vIGluIHRlcm1zIG9mIHRoZSBleGlzdGluZyBBUEkuXG52YXIgZXZlbnRzQXBpID0gZnVuY3Rpb24ob2JqLCBhY3Rpb24sIG5hbWUsIHJlc3QpIHtcblx0aWYgKCFuYW1lKSByZXR1cm4gdHJ1ZTtcblxuXHQvLyBIYW5kbGUgZXZlbnQgbWFwcy5cblx0aWYgKHR5cGVvZiBuYW1lID09PSAnb2JqZWN0Jykge1xuXHRcdGZvciAodmFyIGtleSBpbiBuYW1lKSB7XG5cdFx0XHRvYmpbYWN0aW9uXS5hcHBseShvYmosIFtrZXksIG5hbWVba2V5XV0uY29uY2F0KHJlc3QpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gSGFuZGxlIHNwYWNlIHNlcGFyYXRlZCBldmVudCBuYW1lcy5cblx0aWYgKGV2ZW50U3BsaXR0ZXIudGVzdChuYW1lKSkge1xuXHRcdHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoZXZlbnRTcGxpdHRlcik7XG5cdFx0Zm9yICh2YXIgaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdG9ialthY3Rpb25dLmFwcGx5KG9iaiwgW25hbWVzW2ldXS5jb25jYXQocmVzdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgZGlmZmljdWx0LXRvLWJlbGlldmUsIGJ1dCBvcHRpbWl6ZWQgaW50ZXJuYWwgZGlzcGF0Y2ggZnVuY3Rpb24gZm9yXG4vLyB0cmlnZ2VyaW5nIGV2ZW50cy4gVHJpZXMgdG8ga2VlcCB0aGUgdXN1YWwgY2FzZXMgc3BlZWR5IChtb3N0IGludGVybmFsXG4vLyBCYWNrYm9uZSBldmVudHMgaGF2ZSAzIGFyZ3VtZW50cykuXG52YXIgdHJpZ2dlckV2ZW50cyA9IGZ1bmN0aW9uKGV2ZW50cywgYXJncykge1xuXHR2YXIgZXYsIGkgPSAtMSwgbCA9IGV2ZW50cy5sZW5ndGgsIGExID0gYXJnc1swXSwgYTIgPSBhcmdzWzFdLCBhMyA9IGFyZ3NbMl07XG5cdHN3aXRjaCAoYXJncy5sZW5ndGgpIHtcblx0XHRjYXNlIDA6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4KTsgcmV0dXJuO1xuXHRcdGNhc2UgMTogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExKTsgcmV0dXJuO1xuXHRcdGNhc2UgMjogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMik7IHJldHVybjtcblx0XHRjYXNlIDM6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSwgYTIsIGEzKTsgcmV0dXJuO1xuXHRcdGRlZmF1bHQ6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmFwcGx5KGV2LmN0eCwgYXJncyk7IHJldHVybjtcblx0fVxufTtcblxudmFyIGxpc3Rlbk1ldGhvZHMgPSB7bGlzdGVuVG86ICdvbicsIGxpc3RlblRvT25jZTogJ29uY2UnfTtcblxuLy8gSW52ZXJzaW9uLW9mLWNvbnRyb2wgdmVyc2lvbnMgb2YgYG9uYCBhbmQgYG9uY2VgLiBUZWxsICp0aGlzKiBvYmplY3QgdG9cbi8vIGxpc3RlbiB0byBhbiBldmVudCBpbiBhbm90aGVyIG9iamVjdCAuLi4ga2VlcGluZyB0cmFjayBvZiB3aGF0IGl0J3Ncbi8vIGxpc3RlbmluZyB0by5cbnV0aWwuZWFjaChsaXN0ZW5NZXRob2RzLCBmdW5jdGlvbihpbXBsZW1lbnRhdGlvbiwgbWV0aG9kKSB7XG5cdEV2ZW50c1ttZXRob2RdID0gZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuXHRcdHZhciBsaXN0ZW5pbmdUbyA9IHRoaXMuX2xpc3RlbmluZ1RvIHx8ICh0aGlzLl9saXN0ZW5pbmdUbyA9IHt9KTtcblx0XHR2YXIgaWQgPSBvYmouX2xpc3RlbklkIHx8IChvYmouX2xpc3RlbklkID0gdXRpbC51bmlxdWVJZCgnbCcpKTtcblx0XHRsaXN0ZW5pbmdUb1tpZF0gPSBvYmo7XG5cdFx0aWYgKCFjYWxsYmFjayAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcblx0XHRvYmpbaW1wbGVtZW50YXRpb25dKG5hbWUsIGNhbGxiYWNrLCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcbn0pO1xuXG4vLyBBbGlhc2VzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbkV2ZW50cy5iaW5kICAgPSBFdmVudHMub247XG5FdmVudHMudW5iaW5kID0gRXZlbnRzLm9mZjtcblxuZnVuY3Rpb24gaXNFbXB0eShvYmopIHtcblx0aWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcblx0aWYgKEFycmF5LmlzQXJyYXkob2JqKSB8fCB0eXBlb2Ygb2JqID09PSBcInN0cmluZ1wiKSByZXR1cm4gb2JqLmxlbmd0aCA9PT0gMDtcblx0Zm9yICh2YXIga2V5IGluIG9iaikgaWYgKHV0aWwuaGFzKG9iaiwga2V5KSkgcmV0dXJuIGZhbHNlO1xuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gb25jZShmdW5jKSB7XG5cdHZhciByYW4gPSBmYWxzZSwgbWVtbztcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdGlmIChyYW4pIHJldHVybiBtZW1vO1xuXHRcdHJhbiA9IHRydWU7XG5cdFx0bWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRmdW5jID0gbnVsbDtcblx0XHRyZXR1cm4gbWVtbztcblx0fVxufSIsInZhciBCaW5kaW5nID0gcmVxdWlyZShcIi4vYmluZGluZ1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbm1vZHVsZS5leHBvcnRzID0gQmluZGluZy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24odmFsdWUpIHtcblx0XHRCaW5kaW5nLmNhbGwodGhpcyk7XG5cdFx0dGhpcy5ub2RlcyA9IFtdO1xuXHRcdHRoaXMuc2V0VmFsdWUodmFsdWUpO1xuXHR9LFxuXG5cdGluc2VydEJlZm9yZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiSFRNTCBiaW5kaW5ncyBjYW4ndCBoYXZlIGNoaWxkcmVuLlwiKTtcblx0fSxcblxuXHR1cGRhdGVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHBhcmVudE5vZGUgPSB0aGlzLnBhcmVudE5vZGUsXG5cdFx0XHRiZWZvcmVOb2RlLCBub2RlLCBpO1xuXG5cdFx0Ly8gcGxhY2UgdGhlIG5vZGVzIGluIHRoZSBkb21cblx0XHRpZiAocGFyZW50Tm9kZSAhPSBudWxsKSB7XG5cdFx0XHRiZWZvcmVOb2RlID0gdGhpcy5uZXh0U2libGluZ05vZGU7XG5cblx0XHRcdGZvciAoaSA9IHRoaXMubm9kZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0bm9kZSA9IHRoaXMubm9kZXNbaV07XG5cblx0XHRcdFx0aWYgKCF1dGlsLmlzTm9kZUF0RE9NUG9zaXRpb24obm9kZSwgcGFyZW50Tm9kZSwgYmVmb3JlTm9kZSkpIHtcblx0XHRcdFx0XHRwYXJlbnROb2RlLmluc2VydEJlZm9yZShub2RlLCBiZWZvcmVOb2RlKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGJlZm9yZU5vZGUgPSBub2RlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIG9yIHRha2UgdGhlbSBvdXRcblx0XHRlbHNlIHtcblx0XHRcdHRoaXMucmVtb3ZlTm9kZXMoKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyaWdnZXIoXCJ1cGRhdGVcIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBub2RlLCBpO1xuXG5cdFx0Zm9yIChpID0gMDsgaSA8IHRoaXMubm9kZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdG5vZGUgPSB0aGlzLm5vZGVzW2ldO1xuXHRcdFx0aWYgKG5vZGUucGFyZW50Tm9kZSAhPSBudWxsKSBub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0c2V0VmFsdWU6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdGlmICh2YWwgaW5zdGFuY2VvZiBOb2RlKSB7XG5cdFx0XHR2YWwgPSB2YWwubm9kZVR5cGUgPT09IDExID8gdXRpbC50b0FycmF5KHZhbC5jaGlsZE5vZGVzKSA6IFsgdmFsIF07XG5cdFx0fVxuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHZhbCkpIHtcblx0XHRcdHZhbCA9IHZhbCAhPSBudWxsID8gdmFsLnRvU3RyaW5nKCkgOiBcIlwiO1xuXHRcdFx0XG5cdFx0XHQvLyBjb252ZXJ0IGh0bWwgaW50byBET00gbm9kZXNcblx0XHRcdHZhciBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXHRcdFx0ZGl2LmlubmVySFRNTCA9IHZhbDtcblx0XHRcdHZhbCA9IHV0aWwudG9BcnJheShkaXYuY2hpbGROb2Rlcyk7XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW1vdmVOb2RlcygpO1xuXHRcdHRoaXMubm9kZXMgPSB2YWw7XG5cdFx0dGhpcy51cGRhdGVOb2RlcygpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0dG9Ob2RlczogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZXMuc2xpY2UoMCk7XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlc1swXSB8fCBudWxsO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGssIG5vZGUsIHJlc3VsdDtcblxuXHRcdGZvciAoayBpbiB0aGlzLm5vZGVzKSB7XG5cdFx0XHRub2RlID0gdGhpcy5ub2Rlc1trXTtcblx0XHRcdGlmIChub2RlLm5vZGVUeXBlICE9PSAxKSBjb250aW51ZTtcblxuXHRcdFx0aWYgKHV0aWwubWF0Y2hlc1NlbGVjdG9yKG5vZGUsIHNlbGVjdG9yKSkgcmV0dXJuIG5vZGU7XG5cdFx0XHRyZXN1bHQgPSBub2RlLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXHRcdFx0aWYgKHJlc3VsdCAhPSBudWxsKSByZXR1cm4gcmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdGZpbmRBbGw6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGssIG5vZGUsIGVscyA9IFtdO1xuXG5cdFx0Zm9yIChrIGluIHRoaXMubm9kZXMpIHtcblx0XHRcdG5vZGUgPSB0aGlzLm5vZGVzW2tdO1xuXHRcdFx0aWYgKG5vZGUubm9kZVR5cGUgIT09IDEpIGNvbnRpbnVlO1xuXG5cdFx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3Iobm9kZSwgc2VsZWN0b3IpKSBtYXRjaGVzLnB1c2gobm9kZSk7XG5cdFx0XHRlbHMucHVzaC5hcHBseShlbHMsIHV0aWwudG9BcnJheShub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVscztcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZXMubWFwKGZ1bmN0aW9uKG5vZGUpIHtcblx0XHRcdHJldHVybiBub2RlLm5vZGVUeXBlID09PSAxID8gbm9kZS5vdXRlckhUTUwgOiBub2RlLm5vZGVWYWx1ZTtcblx0XHR9KS5qb2luKFwiXCIpO1xuXHR9XG59KTtcbiIsInZhciBCaW5kaW5nID0gcmVxdWlyZShcIi4vYmluZGluZ1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbi8vIGV4cG9ydFxudmFyIFRlbXBsZSA9XG5tb2R1bGUuZXhwb3J0cyA9IEJpbmRpbmcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKCkge1xuXHRcdEJpbmRpbmcuY2FsbCh0aGlzKTtcblx0XHR0aGlzLmluaXRpYWxpemUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fSxcblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5hcHBlbmQodXRpbC50b0FycmF5KGFyZ3VtZW50cykpO1xuXHR9XG59KTtcblxuLy8gc3RhdGljIHByb3BlcnRpZXMvbWV0aG9kc1xuVGVtcGxlLlZFUlNJT04gPSBcIjAuMy41XCI7XG5UZW1wbGUudXRpbCA9IHV0aWw7XG5UZW1wbGUuRXZlbnRzID0gcmVxdWlyZShcIi4vZXZlbnRzXCIpO1xuVGVtcGxlLkJpbmRpbmcgPSBCaW5kaW5nO1xuXG4vLyBkZXBzIHNldHVwXG52YXIgRGVwcyA9IFRlbXBsZS5EZXBzID0gcmVxdWlyZShcIi4vZGVwc1wiKTtcblRlbXBsZS5hdXRvcnVuID0gRGVwcy5hdXRvcnVuO1xuVGVtcGxlLm5vbnJlYWN0aXZlID0gRGVwcy5ub25yZWFjdGl2ZTtcblRlbXBsZS5ub25yZWFjdGFibGUgPSBEZXBzLm5vbnJlYWN0YWJsZTtcblRlbXBsZS5EZXBlbmRlbmN5ID0gRGVwcy5EZXBlbmRlbmN5OyIsInZhciBCaW5kaW5nID0gcmVxdWlyZShcIi4vYmluZGluZ1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbnZhciBkZWxlZ2F0ZUV2ZW50U3BsaXR0ZXIgPSAvXihcXFMrKVxccyooLiopJC87XG5cbnZhciBOb2RlID1cbmV4cG9ydHMuTm9kZSA9IEJpbmRpbmcuZXh0ZW5kKHtcblx0dXBkYXRlTm9kZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBwYXJlbnROb2RlID0gdGhpcy5wYXJlbnROb2RlLFxuXHRcdFx0YmVmb3JlTm9kZSA9IHRoaXMubmV4dFNpYmxpbmdOb2RlO1xuXG5cdFx0Ly8gcGxhY2UgdGhlIG5vZGUgaW4gdGhlIGRvbVxuXHRcdGlmIChwYXJlbnROb2RlICE9IG51bGwgJiYgIXV0aWwuaXNOb2RlQXRET01Qb3NpdGlvbih0aGlzLm5vZGUsIHBhcmVudE5vZGUsIGJlZm9yZU5vZGUpKSB7XG5cdFx0XHRwYXJlbnROb2RlLmluc2VydEJlZm9yZSh0aGlzLm5vZGUsIGJlZm9yZU5vZGUpO1xuXHRcdH1cblxuXHRcdC8vIG9yIHRha2UgaXQgb3V0XG5cdFx0ZWxzZSBpZiAocGFyZW50Tm9kZSA9PSBudWxsICYmIHRoaXMubm9kZS5wYXJlbnROb2RlICE9IG51bGwpIHtcblx0XHRcdHRoaXMubm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHRoaXMubm9kZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmlnZ2VyKFwidXBkYXRlXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHByb3A6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QobmFtZSkgJiYgdmFsdWUgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKG5hbWUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5wcm9wKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0aGlzLm5vZGVbbmFtZV07XG5cdFx0ZWxzZSB0aGlzLm5vZGVbbmFtZV0gPSB2YWx1ZTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFkZEV2ZW50TGlzdGVuZXI6IGZ1bmN0aW9uKHR5cGUsIHNlbCwgbGlzdGVuZXIsIG9wdGlvbnMpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0XG5cdFx0Ly8gc3ludGF4OiBhZGRFdmVudExpc3RlbmVyKHsgXCJ0eXBlIHNlbGVjdG9yXCI6IGxpc3RlbmVyIH0sIG9wdGlvbnMpXG5cdFx0aWYgKHV0aWwuaXNPYmplY3QodHlwZSkpIHtcblx0XHRcdHV0aWwuZWFjaCh0eXBlLCBmdW5jdGlvbih2LCBuKSB7XG5cdFx0XHRcdHZhciBtID0gbi5tYXRjaChkZWxlZ2F0ZUV2ZW50U3BsaXR0ZXIpO1xuXHRcdFx0XHR0aGlzLmFkZEV2ZW50TGlzdGVuZXIobVsxXSwgbVsyXSwgdiwgc2VsKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdFx0XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHQvLyBzeW50YXg6IGFkZEV2ZW50TGlzdGVuZXIodHlwZSwgbGlzdGVuZXIsIG9wdGlvbnMpXG5cdFx0aWYgKHR5cGVvZiBzZWwgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0aWYgKG9wdGlvbnMgPT0gbnVsbCkgb3B0aW9ucyA9IGxpc3RlbmVyO1xuXHRcdFx0bGlzdGVuZXIgPSBzZWw7XG5cdFx0XHRzZWwgPSBudWxsO1xuXHRcdH1cblxuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0aWYgKHR5cGVvZiB0eXBlICE9PSBcInN0cmluZ1wiIHx8IHR5cGUgPT09IFwiXCIpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBub24tZW1wdHkgc3RyaW5nIGV2ZW50IG5hbWUuXCIpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbGlzdGVuZXIgIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciBsaXN0ZW5lci5cIik7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2V2ZW50TGlzdGVuZXJzID09IG51bGwpIHRoaXMuX2V2ZW50TGlzdGVuZXJzID0gW107XG5cdFx0dGhpcy5fZXZlbnRMaXN0ZW5lcnMucHVzaCh7IHR5cGU6IHR5cGUsIGxpc3RlbmVyOiBsaXN0ZW5lciwgZXZlbnQ6IGV2ZW50TGlzdGVuZXIsIG9wdGlvbnM6IG9wdGlvbnMgfSk7XG5cdFx0dGhpcy5ub2RlLmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgZXZlbnRMaXN0ZW5lcik7XG5cblx0XHRyZXR1cm4gdGhpcztcblxuXHRcdGZ1bmN0aW9uIGV2ZW50TGlzdGVuZXIoZSkge1xuXHRcdFx0dmFyIGRlbGVnYXRlO1xuXG5cdFx0XHRpZiAodHlwZW9mIHNlbCA9PT0gXCJzdHJpbmdcIiAmJiBzZWwgIT09IFwiXCIpIHtcblx0XHRcdFx0ZGVsZWdhdGUgPSB1dGlsLmNsb3Nlc3QoZS50YXJnZXQsIHNlbCk7XG5cdFx0XHRcdGlmICghZGVsZWdhdGUpIHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG9wdGlvbnMub25jZSkgc2VsZi5yZW1vdmVFdmVudExpc3RlbmVyKHR5cGUsIGxpc3RlbmVyKTtcblx0XHRcdGxpc3RlbmVyLmNhbGwob3B0aW9ucy5jb250ZXh0IHx8IHNlbGYsIGUsIGRlbGVnYXRlKTtcblx0XHR9XG5cdH0sXG5cblx0YWRkRXZlbnRMaXN0ZW5lck9uY2U6IGZ1bmN0aW9uKHR5cGUsIHNlbCwgbGlzdGVuZXIsIG9wdGlvbnMpIHtcblx0XHRpZiAodXRpbC5pc09iamVjdCh0eXBlKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBfLmV4dGVuZCh7IG9uY2U6IHRydWUgfSwgc2VsIHx8IHt9KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBzZWwgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0aWYgKG9wdGlvbnMgPT0gbnVsbCkgb3B0aW9ucyA9IGxpc3RlbmVyO1xuXHRcdFx0bGlzdGVuZXIgPSBzZWw7XG5cdFx0XHRzZWwgPSBudWxsO1xuXHRcdH1cblx0XHRcblx0XHRyZXR1cm4gdGhpcy5hZGRFdmVudExpc3RlbmVyKHR5cGUsIHNlbCwgbGlzdGVuZXIsIF8uZXh0ZW5kKHsgb25jZTogdHJ1ZSB9LCBvcHRpb25zIHx8IHt9KSk7XG5cdH0sXG5cblx0cmVtb3ZlRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcblx0XHRpZiAodGhpcy5fZXZlbnRMaXN0ZW5lcnMgPT0gbnVsbCkgcmV0dXJuIHRoaXM7XG5cblx0XHR2YXIgZXZ0cyA9IFtdO1xuXG5cdFx0aWYgKHR5cGVvZiB0eXBlID09PSBcImZ1bmN0aW9uXCIgJiYgbGlzdGVuZXIgPT0gbnVsbCkge1xuXHRcdFx0bGlzdGVuZXIgPSB0eXBlO1xuXHRcdFx0dHlwZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHV0aWwuaXNPYmplY3QodHlwZSkpIHtcblx0XHRcdHV0aWwuZWFjaCh0eXBlLCBmdW5jdGlvbih2LCBuKSB7XG5cdFx0XHRcdHZhciBtID0gbi5tYXRjaChkZWxlZ2F0ZUV2ZW50U3BsaXR0ZXIpO1xuXHRcdFx0XHRldnRzLnB1c2guYXBwbHkoZXZ0cywgdGhpcy5fZXZlbnRMaXN0ZW5lcnMuZmlsdGVyKGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZS50eXBlID09PSBtWzFdICYmIGUubGlzdGVuZXIgPT09IHYgJiYgIX5ldnRzLmluZGV4T2YoZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRldnRzID0gdGhpcy5fZXZlbnRMaXN0ZW5lcnMuZmlsdGVyKGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0cmV0dXJuICh0eXBlID09IG51bGwgfHwgdHlwZSA9PT0gZS50eXBlKSAmJiAobGlzdGVuZXIgPT0gbnVsbCB8fCBsaXN0ZW5lciA9PT0gZS5saXN0ZW5lcik7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRldnRzLmZvckVhY2goZnVuY3Rpb24oZSkge1xuXHRcdFx0dmFyIGluZGV4ID0gdGhpcy5fZXZlbnRMaXN0ZW5lcnMuaW5kZXhPZihlKTtcblxuXHRcdFx0aWYgKH5pbmRleCkge1xuXHRcdFx0XHR0aGlzLm5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihlLnR5cGUsIGUuZXZlbnQpO1xuXHRcdFx0XHR0aGlzLl9ldmVudExpc3RlbmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0fVxuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0dG9Ob2RlczogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIFsgdGhpcy5ub2RlIF07XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbnVsbDsgfSxcblx0ZmluZEFsbDogZnVuY3Rpb24oKSB7IHJldHVybiBbXTsgfVxufSk7XG5cbmZ1bmN0aW9uIGxlYWZOb2RlKG5vZGVUeXBlLCBtZXRob2ROYW1lLCBodW1hblR5cGUpIHtcblx0cmV0dXJuIE5vZGUuZXh0ZW5kKHtcblx0XHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24obm9kZU9yVmFsdWUpIHtcblx0XHRcdC8vIHRleHQgbm9kZVxuXHRcdFx0aWYgKG5vZGVPclZhbHVlIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUgJiYgbm9kZU9yVmFsdWUubm9kZVR5cGUgPT09IG5vZGVUeXBlKSB7XG5cdFx0XHRcdHRoaXMubm9kZSA9IG5vZGVPclZhbHVlO1xuXHRcdFx0XHR0aGlzLnZhbHVlID0gbm9kZU9yVmFsdWUubm9kZVZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhbnl0aGluZyBlbHNlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0dGhpcy5ub2RlID0gZG9jdW1lbnRbbWV0aG9kTmFtZV0oXCJcIik7XG5cdFx0XHRcdHRoaXMuc2V0VmFsdWUobm9kZU9yVmFsdWUpO1xuXHRcdFx0fVxuXG5cdFx0XHROb2RlLmNhbGwodGhpcyk7XG5cdFx0fSxcblxuXHRcdGluc2VydEJlZm9yZTogZnVuY3Rpb24oKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoaHVtYW5UeXBlICsgXCIgYmluZGluZ3MgY2FuJ3QgaGF2ZSBjaGlsZHJlbi5cIik7XG5cdFx0fSxcblxuXHRcdHNldFZhbHVlOiBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdFx0dmFsdWUgPSB2YWx1ZSAhPSBudWxsID8gdmFsdWUudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0XHRpZiAodmFsdWUgIT09IHRoaXMubm9kZS5ub2RlVmFsdWUpIHRoaXMubm9kZS5ub2RlVmFsdWUgPSB2YWx1ZTtcblx0XHRcdHRoaXMudmFsdWUgPSB2YWx1ZTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0sXG5cblx0XHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ub2RlLm5vZGVWYWx1ZTtcblx0XHR9XG5cdH0pO1xufVxuXG52YXIgVGV4dCA9IGV4cG9ydHMuVGV4dCA9IGxlYWZOb2RlKDMsIFwiY3JlYXRlVGV4dE5vZGVcIiwgXCJUZXh0XCIpO1xudmFyIENvbW1lbnQgPSBleHBvcnRzLkNvbW1lbnQgPSBsZWFmTm9kZSg4LCBcImNyZWF0ZUNvbW1lbnRcIiwgXCJDb21tZW50XCIpO1xuXG5Db21tZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gXCI8IS0tXCIgKyB0aGlzLm5vZGUubm9kZVZhbHVlICsgXCItLT5cIjtcbn1cblxudmFyIEVsZW1lbnQgPVxuZXhwb3J0cy5FbGVtZW50ID0gTm9kZS5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24obm9kZU9yVGFnTmFtZSkge1xuXHRcdHZhciBjaGlsZHJlbiA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xuXG5cdFx0Ly8gZWxlbWVudFxuXHRcdGlmIChub2RlT3JUYWdOYW1lIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUgJiYgbm9kZU9yVGFnTmFtZS5ub2RlVHlwZSA9PT0gMSkge1xuXHRcdFx0dGhpcy5ub2RlID0gbm9kZU9yVGFnTmFtZTtcblx0XHRcdHRoaXMudGFnbmFtZSA9IG5vZGVPclRhZ05hbWUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0XHQvLyBhZGQgY2hpbGQgbm9kZXMgYXMgZnVydGhlciBjaGlsZHJlblxuXHRcdFx0Ly8gbm90ZTogdGhpcyBtYXkgYWZmZWN0IHRoZSBvcmlnaW5hbCBub2RlJ3MgY2hpbGRyZW5cblx0XHRcdGZyb21Ob2RlKHV0aWwudG9BcnJheShub2RlT3JUYWdOYW1lLmNoaWxkTm9kZXMpKVxuXHRcdFx0XHQuZm9yRWFjaChmdW5jdGlvbihiKSB7IGNoaWxkcmVuLnB1c2goYik7IH0pO1xuXHRcdH1cblxuXHRcdC8vIHN0cmluZ1xuXHRcdGVsc2UgaWYgKHR5cGVvZiBub2RlT3JUYWdOYW1lID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHR0aGlzLnRhZ25hbWUgPSBub2RlT3JUYWdOYW1lO1xuXHRcdFx0dGhpcy5ub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChub2RlT3JUYWdOYW1lKTtcblx0XHR9XG5cblx0XHQvLyBvciBlcnJvclxuXHRcdGVsc2UgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgZWxlbWVudCB0YWcgbmFtZS5cIik7XG5cblx0XHQvLyBydW4gcGFyZW50IGNvbnRzdHJ1Y3RvclxuXHRcdE5vZGUuYXBwbHkodGhpcywgY2hpbGRyZW4pO1xuXG5cdFx0Ly8gYXBwbHkgZXZlbnRzXG5cdFx0dmFyIGV2ZW50cyA9IHR5cGVvZiB0aGlzLmV2ZW50cyA9PT0gXCJmdW5jdGlvblwiID8gdGhpcy5ldmVudHMuY2FsbCh0aGlzKSA6IHRoaXMuZXZlbnRzO1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KGV2ZW50cykpIHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihldmVudHMpO1xuXHR9LFxuXG5cdGdldEF0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUuZ2V0QXR0cmlidXRlKG5hbWUpO1xuXHR9LFxuXG5cdHNldEF0dHJpYnV0ZTogZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcblx0XHR0aGlzLm5vZGUuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR0aGlzLm5vZGUucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGF0dHI6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHV0aWwuaXNPYmplY3QobmFtZSkgJiYgdmFsdWUgPT0gbnVsbCkge1xuXHRcdFx0dXRpbC5lYWNoKG5hbWUsIGZ1bmN0aW9uKHYsIG4pIHsgdGhpcy5hdHRyKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiB0aGlzLmdldEF0dHJpYnV0ZShuYW1lKTtcblx0XHRlbHNlIHRoaXMuc2V0QXR0cmlidXRlKG5hbWUsIHZhbHVlKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHN0eWxlOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KG5hbWUpICYmIHZhbHVlID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaChuYW1lLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMuc3R5bGUobiwgdik7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIGdldENvbXB1dGVkU3R5bGUodGhpcy5ub2RlKVtuYW1lXTtcblx0XHRlbHNlIHRoaXMubm9kZS5zdHlsZVtuYW1lXSA9IHZhbHVlO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aGFzQ2xhc3M6IGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKGNsYXNzTmFtZSk7XG5cdH0sXG5cblx0YWRkQ2xhc3M6IGZ1bmN0aW9uKCkge1xuXHRcdHV0aWwuZmxhdHRlbih1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSkuZm9yRWFjaChmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRcdHRoaXMubm9kZS5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZS5zcGxpdChcIiBcIikpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQ2xhc3M6IGZ1bmN0aW9uKCkge1xuXHRcdHV0aWwuZmxhdHRlbih1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSkuZm9yRWFjaChmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRcdHRoaXMubm9kZS5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzTmFtZS5zcGxpdChcIiBcIikpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3IodGhpcy5ub2RlLCBzZWxlY3RvcikpIHJldHVybiB0aGlzLm5vZGU7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBlbHMgPSBbXTtcblx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3IodGhpcy5ub2RlLCBzZWxlY3RvcikpIGVscy5wdXNoKHRoaXMubm9kZSk7XG5cdFx0ZWxzLnB1c2guYXBwbHkoZWxzLCB1dGlsLnRvQXJyYXkodGhpcy5ub2RlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKSk7XG5cdFx0cmV0dXJuIGVscztcblx0fSxcblxuXHR0b1N0cmluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubm9kZS5vdXRlckhUTUw7XG5cdH1cbn0pO1xuXG4vLyBmYXN0IGNvbnN0cnVjdG9ycyBmb3IgdHlwaWNhbCBET00gZWxlbWVudCB0YWduYW1lc1xuZXhwb3J0cy5ET00gPSB7fTtcblxuWyAvLyBIVE1MIHRhZ25hbWVzOyB0aGlzIGxpc3QgaXMgdGFrZW4gZnJvbSBGQidzIFJlYWN0XG5cblwiYVwiLCBcImFiYnJcIiwgXCJhZGRyZXNzXCIsIFwiYXJlYVwiLCBcImFydGljbGVcIiwgXCJhc2lkZVwiLCBcImF1ZGlvXCIsIFwiYlwiLCBcImJhc2VcIiwgXCJiZGlcIixcblwiYmRvXCIsIFwiYmlnXCIsIFwiYmxvY2txdW90ZVwiLCBcImJvZHlcIiwgXCJiclwiLCBcImJ1dHRvblwiLCBcImNhbnZhc1wiLCBcImNhcHRpb25cIiwgXCJjaXRlXCIsXG5cImNvZGVcIiwgXCJjb2xcIiwgXCJjb2xncm91cFwiLCBcImRhdGFcIiwgXCJkYXRhbGlzdFwiLCBcImRkXCIsIFwiZGVsXCIsIFwiZGV0YWlsc1wiLCBcImRmblwiLFxuXCJkaXZcIiwgXCJkbFwiLCBcImR0XCIsIFwiZW1cIiwgXCJlbWJlZFwiLCBcImZpZWxkc2V0XCIsIFwiZmlnY2FwdGlvblwiLCBcImZpZ3VyZVwiLCBcImZvb3RlclwiLFxuXCJmb3JtXCIsIFwiaDFcIiwgXCJoMlwiLCBcImgzXCIsIFwiaDRcIiwgXCJoNVwiLCBcImg2XCIsIFwiaGVhZFwiLCBcImhlYWRlclwiLCBcImhyXCIsIFwiaHRtbFwiLCBcImlcIixcblwiaWZyYW1lXCIsIFwiaW1nXCIsIFwiaW5wdXRcIiwgXCJpbnNcIiwgXCJrYmRcIiwgXCJrZXlnZW5cIiwgXCJsYWJlbFwiLCBcImxlZ2VuZFwiLCBcImxpXCIsXG5cImxpbmtcIiwgXCJtYWluXCIsIFwibWFwXCIsIFwibWFya1wiLCBcIm1lbnVcIiwgXCJtZW51aXRlbVwiLCBcIm1ldGFcIiwgXCJtZXRlclwiLCBcIm5hdlwiLFxuXCJub3NjcmlwdFwiLCBcIm9iamVjdFwiLCBcIm9sXCIsIFwib3B0Z3JvdXBcIiwgXCJvcHRpb25cIiwgXCJvdXRwdXRcIiwgXCJwXCIsIFwicGFyYW1cIiwgXCJwcmVcIixcblwicHJvZ3Jlc3NcIiwgXCJxXCIsIFwicnBcIiwgXCJydFwiLCBcInJ1YnlcIiwgXCJzXCIsIFwic2FtcFwiLCBcInNjcmlwdFwiLCBcInNlY3Rpb25cIiwgXCJzZWxlY3RcIixcblwic21hbGxcIiwgXCJzb3VyY2VcIiwgXCJzcGFuXCIsIFwic3Ryb25nXCIsIFwic3R5bGVcIiwgXCJzdWJcIiwgXCJzdW1tYXJ5XCIsIFwic3VwXCIsIFwidGFibGVcIixcblwidGJvZHlcIiwgXCJ0ZFwiLCBcInRleHRhcmVhXCIsIFwidGZvb3RcIiwgXCJ0aFwiLCBcInRoZWFkXCIsIFwidGltZVwiLCBcInRpdGxlXCIsIFwidHJcIixcblwidHJhY2tcIiwgXCJ1XCIsIFwidWxcIiwgXCJ2YXJcIiwgXCJ2aWRlb1wiLCBcIndiclwiXG5cbl0uZm9yRWFjaChmdW5jdGlvbih0KSB7XG5cdGV4cG9ydHMuRE9NW3RdID0gRWxlbWVudC5leHRlbmQoe1xuXHRcdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBhcmdzID0gdXRpbC50b0FycmF5KGFyZ3VtZW50cyk7XG5cdFx0XHRhcmdzLnVuc2hpZnQodCk7XG5cdFx0XHRFbGVtZW50LmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH1cblx0fSk7XG59KTtcblxuLy8gY29udmVydHMgZG9tIG5vZGVzIGludG8gYmluZGluZyBlcXVpdmFsZW50c1xudmFyIGZyb21Ob2RlID1cbmV4cG9ydHMuZnJvbU5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG5cdGlmIChBcnJheS5pc0FycmF5KG5vZGUpKSB7XG5cdFx0cmV0dXJuIG5vZGUubWFwKGZyb21Ob2RlKVxuXHRcdFx0LmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9IG51bGw7IH0pO1xuXHR9XG5cblx0c3dpdGNoIChub2RlLm5vZGVUeXBlKSB7XG5cdFx0Ly8gRWxlbWVudFxuXHRcdGNhc2UgMTogcmV0dXJuIG5ldyBFbGVtZW50KG5vZGUpO1xuXHRcdFxuXHRcdC8vIFRleHQgTm9kZVxuXHRcdGNhc2UgMzogcmV0dXJuIG5ldyBUZXh0KG5vZGUpO1xuXHRcdFxuXHRcdC8vIENvbW1lbnQgTm9kZVxuXHRcdGNhc2UgODogcmV0dXJuIG5ldyBDb21tZW50KG5vZGUpO1xuXG5cdFx0Ly8gRG9jdW1lbnQgRnJhZ21lbnRcblx0XHRjYXNlIDExOlxuXHRcdFx0dmFyIGJpbmRpbmcgPSBuZXcgQmluZGluZztcblxuXHRcdFx0ZnJvbU5vZGUodXRpbC50b0FycmF5KG5vZGUuY2hpbGROb2RlcykpXG5cdFx0XHRcdC5mb3JFYWNoKGJpbmRpbmcuYXBwZW5kQ2hpbGQsIGJpbmRpbmcpO1xuXG5cdFx0XHRyZXR1cm4gYmluZGluZztcblx0fVxufVxuXG4vLyBjb252ZXJ0cyBhIHN0cmluZyBvZiBIVE1MIGludG8gYSBzZXQgb2Ygc3RhdGljIGJpbmRpbmdzXG5leHBvcnRzLmZyb21IVE1MID0gZnVuY3Rpb24oaHRtbCkge1xuXHR2YXIgY29udCwgbm9kZXM7XG5cdGNvbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpXG5cdGNvbnQuaW5uZXJIVE1MID0gaHRtbDtcblx0bm9kZXMgPSBmcm9tTm9kZSh1dGlsLnRvQXJyYXkoY29udC5jaGlsZE5vZGVzKSk7XG5cdHJldHVybiBub2Rlcy5sZW5ndGggPT09IDEgPyBub2Rlc1swXSA6IG5ldyBCaW5kaW5nKCkuYXBwZW5kKG5vZGVzKTtcbn1cblxuLy8gY29udmVydHMgYSBzaW1wbGUgY3NzIHNlbGVjdG9yIHRvIGFuIGVsZW1lbnQgYmluZGluZ1xuZXhwb3J0cy5mcm9tU2VsZWN0b3IgPSBmdW5jdGlvbihzZWwpIHtcblx0aWYgKHR5cGVvZiBzZWwgIT09IFwib2JqZWN0XCIpIHtcblx0XHRzZWwgPSB1dGlsLnBhcnNlU2VsZWN0b3Ioc2VsKTtcblx0fVxuXG5cdHZhciBlbCA9IG5ldyBFbGVtZW50KHNlbC50YWduYW1lKTtcblx0aWYgKHNlbC5pZCAhPSBudWxsKSBlbC5wcm9wKFwiaWRcIiwgc2VsLmlkKTtcblx0ZWwuYWRkQ2xhc3Moc2VsLmNsYXNzZXMpO1xuXHRlbC5hdHRyKHNlbC5hdHRyaWJ1dGVzKTtcblx0ZWwuYXBwZW5kKHV0aWwudG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpKTtcblxuXHRyZXR1cm4gZWw7XG59IiwibW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKSB7XG4gIC8qXG4gICAqIEdlbmVyYXRlZCBieSBQRUcuanMgMC44LjAuXG4gICAqXG4gICAqIGh0dHA6Ly9wZWdqcy5tYWpkYS5jei9cbiAgICovXG5cbiAgZnVuY3Rpb24gcGVnJHN1YmNsYXNzKGNoaWxkLCBwYXJlbnQpIHtcbiAgICBmdW5jdGlvbiBjdG9yKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gY2hpbGQ7IH1cbiAgICBjdG9yLnByb3RvdHlwZSA9IHBhcmVudC5wcm90b3R5cGU7XG4gICAgY2hpbGQucHJvdG90eXBlID0gbmV3IGN0b3IoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIFN5bnRheEVycm9yKG1lc3NhZ2UsIGV4cGVjdGVkLCBmb3VuZCwgb2Zmc2V0LCBsaW5lLCBjb2x1bW4pIHtcbiAgICB0aGlzLm1lc3NhZ2UgID0gbWVzc2FnZTtcbiAgICB0aGlzLmV4cGVjdGVkID0gZXhwZWN0ZWQ7XG4gICAgdGhpcy5mb3VuZCAgICA9IGZvdW5kO1xuICAgIHRoaXMub2Zmc2V0ICAgPSBvZmZzZXQ7XG4gICAgdGhpcy5saW5lICAgICA9IGxpbmU7XG4gICAgdGhpcy5jb2x1bW4gICA9IGNvbHVtbjtcblxuICAgIHRoaXMubmFtZSAgICAgPSBcIlN5bnRheEVycm9yXCI7XG4gIH1cblxuICBwZWckc3ViY2xhc3MoU3ludGF4RXJyb3IsIEVycm9yKTtcblxuICBmdW5jdGlvbiBwYXJzZShpbnB1dCkge1xuICAgIHZhciBvcHRpb25zID0gYXJndW1lbnRzLmxlbmd0aCA+IDEgPyBhcmd1bWVudHNbMV0gOiB7fSxcblxuICAgICAgICBwZWckRkFJTEVEID0ge30sXG5cbiAgICAgICAgcGVnJHN0YXJ0UnVsZUluZGljZXMgPSB7IHN0YXJ0OiAwIH0sXG4gICAgICAgIHBlZyRzdGFydFJ1bGVJbmRleCAgID0gMCxcblxuICAgICAgICBwZWckY29uc3RzID0gW1xuICAgICAgICAgIHBlZyRGQUlMRUQsXG4gICAgICAgICAgbnVsbCxcbiAgICAgICAgICBbXSxcbiAgICAgICAgICBmdW5jdGlvbih0YWcsIHByb3BzKSB7XG4gICAgICAgICAgXHR2YXIgZWwgPSB7XG4gICAgICAgICAgXHRcdHRhZ25hbWU6IHRhZyxcbiAgICAgICAgICBcdFx0aWQ6IG51bGwsXG4gICAgICAgICAgXHRcdGNsYXNzZXM6IFtdLFxuICAgICAgICAgIFx0XHRhdHRyaWJ1dGVzOiB7fVxuICAgICAgICAgIFx0fTtcblxuICAgICAgICAgIFx0cHJvcHMuZm9yRWFjaChmdW5jdGlvbihwcm9wKSB7XG4gICAgICAgICAgXHRcdHN3aXRjaCAocHJvcC50eXBlKSB7XG4gICAgICAgICAgXHRcdFx0Y2FzZSBcImlkXCI6XG4gICAgICAgICAgXHRcdFx0XHRlbC5pZCA9IHByb3AudmFsdWU7XG4gICAgICAgICAgXHRcdFx0XHRicmVhaztcblxuICAgICAgICAgIFx0XHRcdGNhc2UgXCJjbGFzc1wiOlxuICAgICAgICAgIFx0XHRcdFx0ZWwuY2xhc3Nlcy5wdXNoKHByb3AudmFsdWUpO1xuICAgICAgICAgIFx0XHRcdFx0YnJlYWs7XG5cbiAgICAgICAgICBcdFx0XHRjYXNlIFwiYXR0clwiOlxuICAgICAgICAgIFx0XHRcdFx0ZWwuYXR0cmlidXRlc1twcm9wLm5hbWVdID0gcHJvcC52YWx1ZTtcbiAgICAgICAgICBcdFx0XHRcdGJyZWFrO1xuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9KTtcblxuICAgICAgICAgIFx0cmV0dXJuIGVsO1xuICAgICAgICAgIH0sXG4gICAgICAgICAgZnVuY3Rpb24obmFtZSkgeyByZXR1cm4gbmFtZS5qb2luKFwiXCIpOyB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGksIGopIHsgcmV0dXJuIGkgKyBqLmpvaW4oJycpOyB9LFxuICAgICAgICAgIFwiI1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIiNcIiwgZGVzY3JpcHRpb246IFwiXFxcIiNcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihoKSB7XG4gICAgICAgICAgXHRpZiAoaGFzSWQpIHRocm93IG5ldyBFcnJvcihcIkVsZW1lbnRzIGNhbm5vdCBoYXZlIG11bHRpcGxlIElEcy5cIik7XG4gICAgICAgICAgXHRoYXNJZCA9IHRydWU7XG5cbiAgICAgICAgICBcdHJldHVybiB7XG4gICAgICAgICAgXHRcdHR5cGU6IFwiaWRcIixcbiAgICAgICAgICBcdFx0dmFsdWU6IGhcbiAgICAgICAgICBcdH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFwiLlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi5cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihjKSB7XG4gICAgICAgICAgXHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHR0eXBlOiBcImNsYXNzXCIsXG4gICAgICAgICAgXHRcdHZhbHVlOiBjXG4gICAgICAgICAgXHR9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIltcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJbXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJbXFxcIlwiIH0sXG4gICAgICAgICAgXCJdXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgICAgICBcdHJldHVybiB7XG4gICAgICAgICAgXHRcdHR5cGU6IFwiYXR0clwiLFxuICAgICAgICAgIFx0XHRuYW1lOiBrZXksXG4gICAgICAgICAgXHRcdHZhbHVlOiB2YWx1ZSB8fCBcIlwiXG4gICAgICAgICAgXHR9XG4gICAgICAgICAgfSxcbiAgICAgICAgICAvXlthLXowLTlfXFwtXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05X1xcXFwtXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOV9cXFxcLV1pXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihrKSB7IHJldHVybiBrLmpvaW4oXCJcIik7IH0sXG4gICAgICAgICAgXCI9XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHYpIHsgcmV0dXJuIHY7IH0sXG4gICAgICAgICAgXCJcXFwiXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXFxcIlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXFxcXFxcXCJcXFwiXCIgfSxcbiAgICAgICAgICAvXlteXCJdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW15cXFwiXVwiLCBkZXNjcmlwdGlvbjogXCJbXlxcXCJdXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2KSB7IHJldHVybiB2LmpvaW4oXCJcIik7IH0sXG4gICAgICAgICAgXCInXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiJ1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiJ1xcXCJcIiB9LFxuICAgICAgICAgIC9eW14nXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlteJ11cIiwgZGVzY3JpcHRpb246IFwiW14nXVwiIH0sXG4gICAgICAgICAgL15bXlxcXV0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXlxcXFxdXVwiLCBkZXNjcmlwdGlvbjogXCJbXlxcXFxdXVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odikgeyByZXR1cm4gdi5qb2luKFwiXCIpLnRyaW0oKTsgfSxcbiAgICAgICAgICAvXlthLXpdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2Etel1cIiwgZGVzY3JpcHRpb246IFwiW2Etel1cIiB9LFxuICAgICAgICAgIC9eW2EtejAtOVxcLV0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05XFxcXC1dXCIsIGRlc2NyaXB0aW9uOiBcIlthLXowLTlcXFxcLV1cIiB9LFxuICAgICAgICAgIC9eW1xceDgwLVxceEZGXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIltcXFxceDgwLVxcXFx4RkZdXCIsIGRlc2NyaXB0aW9uOiBcIltcXFxceDgwLVxcXFx4RkZdXCIgfSxcbiAgICAgICAgICB7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IFwid2hpdGVzcGFjZVwiIH0sXG4gICAgICAgICAgL15bIFxcdFxcblxccl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbIFxcXFx0XFxcXG5cXFxccl1cIiwgZGVzY3JpcHRpb246IFwiWyBcXFxcdFxcXFxuXFxcXHJdXCIgfSxcbiAgICAgICAgICBcIlxcXFxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJcXFxcXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJcXFxcXFxcXFxcXCJcIiB9LFxuICAgICAgICAgIHsgdHlwZTogXCJhbnlcIiwgZGVzY3JpcHRpb246IFwiYW55IGNoYXJhY3RlclwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oY2hhcikgeyByZXR1cm4gY2hhcjsgfVxuICAgICAgICBdLFxuXG4gICAgICAgIHBlZyRieXRlY29kZSA9IFtcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITchKiMgXFxcIiAhK1MkIFxcXCI3IyopIFxcXCI3JCojIFxcXCI3JSwvJjcjKikgXFxcIjckKiMgXFxcIjclXFxcIispJTRcXFwiNiNcXFwiXFxcIiEgJSRcXFwiIyAgXFxcIiMgIFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISBcXFwiN1xcXCIsIyY3XFxcIlxcXCIrJyA0ITYkISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITcqKzskIFxcXCI3KywjJjcrXFxcIispJTRcXFwiNiVcXFwiXFxcIiEgJSRcXFwiIyAgXFxcIiMgIFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS4mXFxcIlxcXCIyJjMnKzIkN1xcXCIrKCU0XFxcIjYoXFxcIiEgJSRcXFwiIyAgXFxcIiMgIFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS4pXFxcIlxcXCIyKTMqKzIkN1xcXCIrKCU0XFxcIjYrXFxcIiEgJSRcXFwiIyAgXFxcIiMgIFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS4sXFxcIlxcXCIyLDMtK1MkNyYrSSU3JyojIFxcXCIgISs5JS4uXFxcIlxcXCIyLjMvKyklNCQ2MCRcXFwiXFxcIiElJCQjICAkIyMgICRcXFwiIyAgXFxcIiMgIFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITctK1ckIFxcXCIwMVxcXCJcXFwiMSEzMissJCwpJjAxXFxcIlxcXCIxITMyXFxcIlxcXCJcXFwiICArMiU3LSsoJTQjNjMjISElJCMjICAkXFxcIiMgIFxcXCIjICBcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuNFxcXCJcXFwiMjQzNStMJDctK0IlNygqIyBcXFwiNykrMiU3LSsoJTQkNjYkISElJCQjICAkIyMgICRcXFwiIyAgXFxcIiMgIFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS43XFxcIlxcXCIyNzM4K2IkIFxcXCI3LiopIFxcXCIwOVxcXCJcXFwiMSEzOiwvJjcuKikgXFxcIjA5XFxcIlxcXCIxITM6XFxcIis4JS43XFxcIlxcXCIyNzM4KyglNCM2OyMhISUkIyMgICRcXFwiIyAgXFxcIiMgICpzIFxcXCIhLjxcXFwiXFxcIjI8Mz0rYiQgXFxcIjcuKikgXFxcIjA+XFxcIlxcXCIxITM/LC8mNy4qKSBcXFwiMD5cXFwiXFxcIjEhMz9cXFwiKzglLjxcXFwiXFxcIjI8Mz0rKCU0IzY7IyEhJSQjIyAgJFxcXCIjICBcXFwiIyAgXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhIFxcXCIwQFxcXCJcXFwiMSEzQSwpJjBAXFxcIlxcXCIxITNBXFxcIisnIDQhNkIhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIwQ1xcXCJcXFwiMSEzRCojIFxcXCI3LFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiMEVcXFwiXFxcIjEhM0YqIyBcXFwiNyxcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIjBHXFxcIlxcXCIxITNIXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCI4IFxcXCIwSlxcXCJcXFwiMSEzSywpJjBKXFxcIlxcXCIxITNLXFxcIjkqXFxcIiAzSVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5MXFxcIlxcXCIyTDNNKzckLVxcXCJcXFwiMSEzTisoJTRcXFwiNk9cXFwiISAlJFxcXCIjICBcXFwiIyAgXCIpXG4gICAgICAgIF0sXG5cbiAgICAgICAgcGVnJGN1cnJQb3MgICAgICAgICAgPSAwLFxuICAgICAgICBwZWckcmVwb3J0ZWRQb3MgICAgICA9IDAsXG4gICAgICAgIHBlZyRjYWNoZWRQb3MgICAgICAgID0gMCxcbiAgICAgICAgcGVnJGNhY2hlZFBvc0RldGFpbHMgPSB7IGxpbmU6IDEsIGNvbHVtbjogMSwgc2VlbkNSOiBmYWxzZSB9LFxuICAgICAgICBwZWckbWF4RmFpbFBvcyAgICAgICA9IDAsXG4gICAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQgID0gW10sXG4gICAgICAgIHBlZyRzaWxlbnRGYWlscyAgICAgID0gMCxcblxuICAgICAgICBwZWckcmVzdWx0O1xuXG4gICAgaWYgKFwic3RhcnRSdWxlXCIgaW4gb3B0aW9ucykge1xuICAgICAgaWYgKCEob3B0aW9ucy5zdGFydFJ1bGUgaW4gcGVnJHN0YXJ0UnVsZUluZGljZXMpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHN0YXJ0IHBhcnNpbmcgZnJvbSBydWxlIFxcXCJcIiArIG9wdGlvbnMuc3RhcnRSdWxlICsgXCJcXFwiLlwiKTtcbiAgICAgIH1cblxuICAgICAgcGVnJHN0YXJ0UnVsZUluZGV4ID0gcGVnJHN0YXJ0UnVsZUluZGljZXNbb3B0aW9ucy5zdGFydFJ1bGVdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRleHQoKSB7XG4gICAgICByZXR1cm4gaW5wdXQuc3Vic3RyaW5nKHBlZyRyZXBvcnRlZFBvcywgcGVnJGN1cnJQb3MpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9mZnNldCgpIHtcbiAgICAgIHJldHVybiBwZWckcmVwb3J0ZWRQb3M7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGluZSgpIHtcbiAgICAgIHJldHVybiBwZWckY29tcHV0ZVBvc0RldGFpbHMocGVnJHJlcG9ydGVkUG9zKS5saW5lO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbHVtbigpIHtcbiAgICAgIHJldHVybiBwZWckY29tcHV0ZVBvc0RldGFpbHMocGVnJHJlcG9ydGVkUG9zKS5jb2x1bW47XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXhwZWN0ZWQoZGVzY3JpcHRpb24pIHtcbiAgICAgIHRocm93IHBlZyRidWlsZEV4Y2VwdGlvbihcbiAgICAgICAgbnVsbCxcbiAgICAgICAgW3sgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb24gfV0sXG4gICAgICAgIHBlZyRyZXBvcnRlZFBvc1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvcihtZXNzYWdlKSB7XG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24obWVzc2FnZSwgbnVsbCwgcGVnJHJlcG9ydGVkUG9zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckY29tcHV0ZVBvc0RldGFpbHMocG9zKSB7XG4gICAgICBmdW5jdGlvbiBhZHZhbmNlKGRldGFpbHMsIHN0YXJ0UG9zLCBlbmRQb3MpIHtcbiAgICAgICAgdmFyIHAsIGNoO1xuXG4gICAgICAgIGZvciAocCA9IHN0YXJ0UG9zOyBwIDwgZW5kUG9zOyBwKyspIHtcbiAgICAgICAgICBjaCA9IGlucHV0LmNoYXJBdChwKTtcbiAgICAgICAgICBpZiAoY2ggPT09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgIGlmICghZGV0YWlscy5zZWVuQ1IpIHsgZGV0YWlscy5saW5lKys7IH1cbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uID0gMTtcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gZmFsc2U7XG4gICAgICAgICAgfSBlbHNlIGlmIChjaCA9PT0gXCJcXHJcIiB8fCBjaCA9PT0gXCJcXHUyMDI4XCIgfHwgY2ggPT09IFwiXFx1MjAyOVwiKSB7XG4gICAgICAgICAgICBkZXRhaWxzLmxpbmUrKztcbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uID0gMTtcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gdHJ1ZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGV0YWlscy5jb2x1bW4rKztcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChwZWckY2FjaGVkUG9zICE9PSBwb3MpIHtcbiAgICAgICAgaWYgKHBlZyRjYWNoZWRQb3MgPiBwb3MpIHtcbiAgICAgICAgICBwZWckY2FjaGVkUG9zID0gMDtcbiAgICAgICAgICBwZWckY2FjaGVkUG9zRGV0YWlscyA9IHsgbGluZTogMSwgY29sdW1uOiAxLCBzZWVuQ1I6IGZhbHNlIH07XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZShwZWckY2FjaGVkUG9zRGV0YWlscywgcGVnJGNhY2hlZFBvcywgcG9zKTtcbiAgICAgICAgcGVnJGNhY2hlZFBvcyA9IHBvcztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHBlZyRjYWNoZWRQb3NEZXRhaWxzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRmYWlsKGV4cGVjdGVkKSB7XG4gICAgICBpZiAocGVnJGN1cnJQb3MgPCBwZWckbWF4RmFpbFBvcykgeyByZXR1cm47IH1cblxuICAgICAgaWYgKHBlZyRjdXJyUG9zID4gcGVnJG1heEZhaWxQb3MpIHtcbiAgICAgICAgcGVnJG1heEZhaWxQb3MgPSBwZWckY3VyclBvcztcbiAgICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZCA9IFtdO1xuICAgICAgfVxuXG4gICAgICBwZWckbWF4RmFpbEV4cGVjdGVkLnB1c2goZXhwZWN0ZWQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRidWlsZEV4Y2VwdGlvbihtZXNzYWdlLCBleHBlY3RlZCwgcG9zKSB7XG4gICAgICBmdW5jdGlvbiBjbGVhbnVwRXhwZWN0ZWQoZXhwZWN0ZWQpIHtcbiAgICAgICAgdmFyIGkgPSAxO1xuXG4gICAgICAgIGV4cGVjdGVkLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgIGlmIChhLmRlc2NyaXB0aW9uIDwgYi5kZXNjcmlwdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgIH0gZWxzZSBpZiAoYS5kZXNjcmlwdGlvbiA+IGIuZGVzY3JpcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHdoaWxlIChpIDwgZXhwZWN0ZWQubGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKGV4cGVjdGVkW2kgLSAxXSA9PT0gZXhwZWN0ZWRbaV0pIHtcbiAgICAgICAgICAgIGV4cGVjdGVkLnNwbGljZShpLCAxKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZE1lc3NhZ2UoZXhwZWN0ZWQsIGZvdW5kKSB7XG4gICAgICAgIGZ1bmN0aW9uIHN0cmluZ0VzY2FwZShzKSB7XG4gICAgICAgICAgZnVuY3Rpb24gaGV4KGNoKSB7IHJldHVybiBjaC5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpOyB9XG5cbiAgICAgICAgICByZXR1cm4gc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFwvZywgICAnXFxcXFxcXFwnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1wiL2csICAgICdcXFxcXCInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xceDA4L2csICdcXFxcYicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csICAgJ1xcXFx0JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXG4vZywgICAnXFxcXG4nKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcZi9nLCAgICdcXFxcZicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxyL2csICAgJ1xcXFxyJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx4MDAtXFx4MDdcXHgwQlxceDBFXFx4MEZdL2csIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHgwJyArIGhleChjaCk7IH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xceDEwLVxceDFGXFx4ODAtXFx4RkZdL2csICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHgnICArIGhleChjaCk7IH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcdTAxODAtXFx1MEZGRl0vZywgICAgICAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx1MCcgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHUxMDgwLVxcdUZGRkZdL2csICAgICAgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxcdScgICsgaGV4KGNoKTsgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZXhwZWN0ZWREZXNjcyA9IG5ldyBBcnJheShleHBlY3RlZC5sZW5ndGgpLFxuICAgICAgICAgICAgZXhwZWN0ZWREZXNjLCBmb3VuZERlc2MsIGk7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGV4cGVjdGVkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgZXhwZWN0ZWREZXNjc1tpXSA9IGV4cGVjdGVkW2ldLmRlc2NyaXB0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgZXhwZWN0ZWREZXNjID0gZXhwZWN0ZWQubGVuZ3RoID4gMVxuICAgICAgICAgID8gZXhwZWN0ZWREZXNjcy5zbGljZSgwLCAtMSkuam9pbihcIiwgXCIpXG4gICAgICAgICAgICAgICsgXCIgb3IgXCJcbiAgICAgICAgICAgICAgKyBleHBlY3RlZERlc2NzW2V4cGVjdGVkLmxlbmd0aCAtIDFdXG4gICAgICAgICAgOiBleHBlY3RlZERlc2NzWzBdO1xuXG4gICAgICAgIGZvdW5kRGVzYyA9IGZvdW5kID8gXCJcXFwiXCIgKyBzdHJpbmdFc2NhcGUoZm91bmQpICsgXCJcXFwiXCIgOiBcImVuZCBvZiBpbnB1dFwiO1xuXG4gICAgICAgIHJldHVybiBcIkV4cGVjdGVkIFwiICsgZXhwZWN0ZWREZXNjICsgXCIgYnV0IFwiICsgZm91bmREZXNjICsgXCIgZm91bmQuXCI7XG4gICAgICB9XG5cbiAgICAgIHZhciBwb3NEZXRhaWxzID0gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBvcyksXG4gICAgICAgICAgZm91bmQgICAgICA9IHBvcyA8IGlucHV0Lmxlbmd0aCA/IGlucHV0LmNoYXJBdChwb3MpIDogbnVsbDtcblxuICAgICAgaWYgKGV4cGVjdGVkICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFudXBFeHBlY3RlZChleHBlY3RlZCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuZXcgU3ludGF4RXJyb3IoXG4gICAgICAgIG1lc3NhZ2UgIT09IG51bGwgPyBtZXNzYWdlIDogYnVpbGRNZXNzYWdlKGV4cGVjdGVkLCBmb3VuZCksXG4gICAgICAgIGV4cGVjdGVkLFxuICAgICAgICBmb3VuZCxcbiAgICAgICAgcG9zLFxuICAgICAgICBwb3NEZXRhaWxzLmxpbmUsXG4gICAgICAgIHBvc0RldGFpbHMuY29sdW1uXG4gICAgICApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRkZWNvZGUocykge1xuICAgICAgdmFyIGJjID0gbmV3IEFycmF5KHMubGVuZ3RoKSwgaTtcblxuICAgICAgZm9yIChpID0gMDsgaSA8IHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYmNbaV0gPSBzLmNoYXJDb2RlQXQoaSkgLSAzMjtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGJjO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZVJ1bGUoaW5kZXgpIHtcbiAgICAgIHZhciBiYyAgICA9IHBlZyRieXRlY29kZVtpbmRleF0sXG4gICAgICAgICAgaXAgICAgPSAwLFxuICAgICAgICAgIGlwcyAgID0gW10sXG4gICAgICAgICAgZW5kICAgPSBiYy5sZW5ndGgsXG4gICAgICAgICAgZW5kcyAgPSBbXSxcbiAgICAgICAgICBzdGFjayA9IFtdLFxuICAgICAgICAgIHBhcmFtcywgaTtcblxuICAgICAgZnVuY3Rpb24gcHJvdGVjdChvYmplY3QpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuYXBwbHkob2JqZWN0KSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiID8gW10gOiBvYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIHdoaWxlIChpcCA8IGVuZCkge1xuICAgICAgICAgIHN3aXRjaCAoYmNbaXBdKSB7XG4gICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocHJvdGVjdChwZWckY29uc3RzW2JjW2lwICsgMV1dKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNDpcbiAgICAgICAgICAgICAgc3RhY2subGVuZ3RoIC09IGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDU6XG4gICAgICAgICAgICAgIHN0YWNrLnNwbGljZSgtMiwgMSk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDY6XG4gICAgICAgICAgICAgIHN0YWNrW3N0YWNrLmxlbmd0aCAtIDJdLnB1c2goc3RhY2sucG9wKCkpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA3OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHN0YWNrLnNwbGljZShzdGFjay5sZW5ndGggLSBiY1tpcCArIDFdLCBiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDg6XG4gICAgICAgICAgICAgIHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgICBzdGFjay5wdXNoKGlucHV0LnN1YnN0cmluZyhzdGFja1tzdGFjay5sZW5ndGggLSAxXSwgcGVnJGN1cnJQb3MpKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgOTpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0pIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMDpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMTpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMjpcbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgICAgaXBzLnB1c2goaXApO1xuXG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAyICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlwICs9IDIgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTM6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0Lmxlbmd0aCA+IHBlZyRjdXJyUG9zKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTQ6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGgpID09PSBwZWckY29uc3RzW2JjW2lwICsgMV1dKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTU6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGgpLnRvTG93ZXJDYXNlKCkgPT09IHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQ7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNjpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdKTtcblxuICAgICAgICAgICAgICBpZiAocGVnJGNvbnN0c1tiY1tpcCArIDFdXS50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTc6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2goaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCBiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE4OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyArPSBwZWckY29uc3RzW2JjW2lwICsgMV1dLmxlbmd0aDtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTk6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJEZBSUxFRCk7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHtcbiAgICAgICAgICAgICAgICBwZWckZmFpbChwZWckY29uc3RzW2JjW2lwICsgMV1dKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMDpcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMSAtIGJjW2lwICsgMV1dO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMTpcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gcGVnJGN1cnJQb3M7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIyOlxuICAgICAgICAgICAgICBwYXJhbXMgPSBiYy5zbGljZShpcCArIDQsIGlwICsgNCArIGJjW2lwICsgM10pO1xuICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYmNbaXAgKyAzXTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcGFyYW1zW2ldID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMSAtIHBhcmFtc1tpXV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBzdGFjay5zcGxpY2UoXG4gICAgICAgICAgICAgICAgc3RhY2subGVuZ3RoIC0gYmNbaXAgKyAyXSxcbiAgICAgICAgICAgICAgICBiY1tpcCArIDJdLFxuICAgICAgICAgICAgICAgIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0uYXBwbHkobnVsbCwgcGFyYW1zKVxuICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMzpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckcGFyc2VSdWxlKGJjW2lwICsgMV0pKTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjQ6XG4gICAgICAgICAgICAgIHBlZyRzaWxlbnRGYWlscysrO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyNTpcbiAgICAgICAgICAgICAgcGVnJHNpbGVudEZhaWxzLS07XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIG9wY29kZTogXCIgKyBiY1tpcF0gKyBcIi5cIik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVuZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGVuZCA9IGVuZHMucG9wKCk7XG4gICAgICAgICAgaXAgPSBpcHMucG9wKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN0YWNrWzBdO1xuICAgIH1cblxuXG4gICAgXHR2YXIgaGFzSWQgPSBmYWxzZTtcblxuXG4gICAgcGVnJHJlc3VsdCA9IHBlZyRwYXJzZVJ1bGUocGVnJHN0YXJ0UnVsZUluZGV4KTtcblxuICAgIGlmIChwZWckcmVzdWx0ICE9PSBwZWckRkFJTEVEICYmIHBlZyRjdXJyUG9zID09PSBpbnB1dC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBwZWckcmVzdWx0O1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAocGVnJHJlc3VsdCAhPT0gcGVnJEZBSUxFRCAmJiBwZWckY3VyclBvcyA8IGlucHV0Lmxlbmd0aCkge1xuICAgICAgICBwZWckZmFpbCh7IHR5cGU6IFwiZW5kXCIsIGRlc2NyaXB0aW9uOiBcImVuZCBvZiBpbnB1dFwiIH0pO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24obnVsbCwgcGVnJG1heEZhaWxFeHBlY3RlZCwgcGVnJG1heEZhaWxQb3MpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgU3ludGF4RXJyb3I6IFN5bnRheEVycm9yLFxuICAgIHBhcnNlOiAgICAgICBwYXJzZVxuICB9O1xufSkoKTsiLCJ2YXIgdG9BcnJheSA9XG5leHBvcnRzLnRvQXJyYXkgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKG9iaiwgMCk7XG59XG5cbnZhciBoYXMgPVxuZXhwb3J0cy5oYXMgPSBmdW5jdGlvbihvYmosIGtleSkge1xuXHRyZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbn1cblxudmFyIGV4dGVuZCA9XG5leHBvcnRzLmV4dGVuZCA9IGZ1bmN0aW9uKG9iaikge1xuXHR0b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSkuZm9yRWFjaChmdW5jdGlvbihtaXhpbikge1xuXHRcdGlmICghbWl4aW4pIHJldHVybjtcblxuXHRcdGZvciAodmFyIGtleSBpbiBtaXhpbikge1xuXHRcdFx0b2JqW2tleV0gPSBtaXhpbltrZXldO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG9iajtcbn1cblxudmFyIGVhY2ggPVxuZXhwb3J0cy5lYWNoID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuXHRpZiAob2JqID09IG51bGwpIHJldHVybiBvYmo7XG5cblx0aWYgKG9iai5mb3JFYWNoID09PSBBcnJheS5wcm90b3R5cGUuZm9yRWFjaCkge1xuXHRcdG9iai5mb3JFYWNoKGl0ZXJhdG9yLCBjb250ZXh0KTtcblx0fSBlbHNlIGlmIChvYmoubGVuZ3RoID09PSArb2JqLmxlbmd0aCkge1xuXHRcdGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2ldLCBpLCBvYmopO1xuXHRcdH1cblx0fSBlbHNlIHtcblx0XHR2YXIga2V5cyA9IE9iamVjdC5rZXlzKG9iaik7XG5cdFx0Zm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcblx0XHRcdGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2tleXNbaV1dLCBrZXlzW2ldLCBvYmopO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBvYmo7XG59XG5cbnZhciBmbGF0dGVuID1cbmV4cG9ydHMuZmxhdHRlbiA9IGZ1bmN0aW9uKGlucHV0LCBvdXRwdXQpIHtcblx0aWYgKG91dHB1dCA9PSBudWxsKSBvdXRwdXQgPSBbXTtcblxuXHRlYWNoKGlucHV0LCBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkgZmxhdHRlbih2YWx1ZSwgb3V0cHV0KTtcblx0XHRlbHNlIG91dHB1dC5wdXNoKHZhbHVlKTtcblx0fSk7XG5cblx0cmV0dXJuIG91dHB1dDtcbn1cblxuZXhwb3J0cy5waWNrID0gZnVuY3Rpb24ob2JqKSB7XG5cdHJldHVybiBmbGF0dGVuKHRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKSlcblxuXHQucmVkdWNlKGZ1bmN0aW9uKG5vYmosIGtleSkge1xuXHRcdG5vYmpba2V5XSA9IG9ialtrZXldO1xuXHRcdHJldHVybiBub2JqO1xuXHR9LCB7fSk7XG59XG5cbnZhciBpc09iamVjdCA9XG5leHBvcnRzLmlzT2JqZWN0ID0gZnVuY3Rpb24ob2JqKSB7XG5cdHJldHVybiBvYmogPT09IE9iamVjdChvYmopO1xufVxuXG5leHBvcnRzLnVuaXF1ZUlkID0gKGZ1bmN0aW9uKCkge1xuXHR2YXIgaWQgPSAwO1xuXHRyZXR1cm4gZnVuY3Rpb24ocHJlZml4KSB7XG5cdFx0cmV0dXJuIChwcmVmaXggfHwgXCJcIikgKyAoKytpZCk7XG5cdH1cbn0pKCk7XG5cbi8vIHRoZSBzdWJjbGFzc2luZyBmdW5jdGlvbiBmb3VuZCBpbiBCYWNrYm9uZVxudmFyIHN1YmNsYXNzID1cbmV4cG9ydHMuc3ViY2xhc3MgPSBmdW5jdGlvbihwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuXHR2YXIgcGFyZW50ID0gdGhpcztcblx0dmFyIGNoaWxkO1xuXG5cdC8vIFRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiBmb3IgdGhlIG5ldyBzdWJjbGFzcyBpcyBlaXRoZXIgZGVmaW5lZCBieSB5b3Vcblx0Ly8gKHRoZSBcImNvbnN0cnVjdG9yXCIgcHJvcGVydHkgaW4geW91ciBgZXh0ZW5kYCBkZWZpbml0aW9uKSwgb3IgZGVmYXVsdGVkXG5cdC8vIGJ5IHVzIHRvIHNpbXBseSBjYWxsIHRoZSBwYXJlbnQncyBjb25zdHJ1Y3Rvci5cblx0aWYgKHByb3RvUHJvcHMgJiYgaGFzKHByb3RvUHJvcHMsICdjb25zdHJ1Y3RvcicpKSB7XG5cdFx0Y2hpbGQgPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdGNoaWxkID0gZnVuY3Rpb24oKXsgcmV0dXJuIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9O1xuXHR9XG5cblx0Ly8gQWRkIHN0YXRpYyBwcm9wZXJ0aWVzIHRvIHRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiwgaWYgc3VwcGxpZWQuXG5cdGV4dGVuZChjaGlsZCwgcGFyZW50LCBzdGF0aWNQcm9wcyk7XG5cblx0Ly8gU2V0IHRoZSBwcm90b3R5cGUgY2hhaW4gdG8gaW5oZXJpdCBmcm9tIGBwYXJlbnRgLCB3aXRob3V0IGNhbGxpbmdcblx0Ly8gYHBhcmVudGAncyBjb25zdHJ1Y3RvciBmdW5jdGlvbi5cblx0dmFyIFN1cnJvZ2F0ZSA9IGZ1bmN0aW9uKCl7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfTtcblx0U3Vycm9nYXRlLnByb3RvdHlwZSA9IHBhcmVudC5wcm90b3R5cGU7XG5cdGNoaWxkLnByb3RvdHlwZSA9IG5ldyBTdXJyb2dhdGU7XG5cblx0Ly8gQWRkIHByb3RvdHlwZSBwcm9wZXJ0aWVzIChpbnN0YW5jZSBwcm9wZXJ0aWVzKSB0byB0aGUgc3ViY2xhc3MsXG5cdC8vIGlmIHN1cHBsaWVkLlxuXHRpZiAocHJvdG9Qcm9wcykgZXh0ZW5kKGNoaWxkLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyk7XG5cblx0Ly8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZFxuXHQvLyBsYXRlci5cblx0Y2hpbGQuX19zdXBlcl9fID0gcGFyZW50LnByb3RvdHlwZTtcblxuXHRyZXR1cm4gY2hpbGQ7XG59XG5cbmV4cG9ydHMuaXNOb2RlQXRET01Qb3NpdGlvbiA9IGZ1bmN0aW9uKG5vZGUsIHBhcmVudCwgYmVmb3JlKSB7XG5cdHJldHVybiBub2RlLnBhcmVudE5vZGUgPT09IHBhcmVudCAmJiBub2RlLm5leHRTaWJsaW5nID09PSBiZWZvcmU7XG59XG5cbnZhciBtYXRjaGVzU2VsZWN0b3IgPSB0eXBlb2YgRWxlbWVudCAhPT0gXCJ1bmRlZmluZWRcIiA/XG5cdEVsZW1lbnQucHJvdG90eXBlLm1hdGNoZXMgfHxcblx0RWxlbWVudC5wcm90b3R5cGUud2Via2l0TWF0Y2hlc1NlbGVjdG9yIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLm1vek1hdGNoZXNTZWxlY3RvciB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS5tc01hdGNoZXNTZWxlY3RvciA6XG5cdGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH07XG5cbmV4cG9ydHMubWF0Y2hlc1NlbGVjdG9yID0gZnVuY3Rpb24oZWxlbSwgc2VsZWN0b3IpIHtcblx0cmV0dXJuIG1hdGNoZXNTZWxlY3Rvci5jYWxsKGVsZW0sIHNlbGVjdG9yKVxufVxuXG52YXIgRGVwcyA9IHJlcXVpcmUoXCIuL2RlcHNcIik7XG5cbnZhciBkZWZpbmVSZWFjdGl2ZVByb3BlcnR5ID1cbmV4cG9ydHMuZGVmaW5lUmVhY3RpdmVQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUsIGNvZXJjZSkge1xuXHRpZiAoIWlzT2JqZWN0KG9iaikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBvYmplY3QgdG8gZGVmaW5lIHRoZSByZWFjdGl2ZSBwcm9wZXJ0eSBvbi5cIik7XG5cdGlmICh0eXBlb2YgcHJvcCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgcHJvcGVydHkgbmFtZS5cIik7XG5cblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiICYmIGNvZXJjZSA9PSBudWxsKSB7XG5cdFx0Y29lcmNlID0gdmFsdWU7XG5cdFx0dmFsdWUgPSB2b2lkIDA7XG5cdH1cblxuXHRpZiAodHlwZW9mIGNvZXJjZSAhPT0gXCJmdW5jdGlvblwiKSBjb2VyY2UgPSBmdW5jdGlvbih2KSB7IHJldHVybiB2OyB9O1xuXG5cdC8vIHJ1bnMgdGhlIGNvZXJjaW9uIGZ1bmN0aW9uIG5vbi1yZWFjdGl2ZWx5IHRvIHByZXZlbnQgaW5maW5pdGUgbG9vcHNcblx0ZnVuY3Rpb24gcHJvY2Vzcyh2KSB7XG5cdFx0cmV0dXJuIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gY29lcmNlLmNhbGwob2JqLCB2LCBwcm9wLCBvYmopO1xuXHRcdH0pO1xuXHR9XG5cblx0dmFyIGRlcCA9IG5ldyBEZXBzLkRlcGVuZGVuY3k7XG5cdHZhbHVlID0gcHJvY2Vzcyh2YWx1ZSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHR2YWwgPSBwcm9jZXNzKHZhbCk7XG5cblx0XHRcdGlmICh2YWwgIT09IHZhbHVlKSB7XG5cdFx0XHRcdHZhbHVlID0gdmFsO1xuXHRcdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG9iajtcbn1cblxuZXhwb3J0cy5kZWZpbmVSZWFjdGl2ZVByb3BlcnRpZXMgPSBmdW5jdGlvbihvYmosIHByb3BzLCBjb2VyY2UpIHtcblx0Zm9yICh2YXIgcHJvcCBpbiBwcm9wcykge1xuXHRcdGRlZmluZVJlYWN0aXZlUHJvcGVydHkob2JqLCBwcm9wLCBwcm9wc1twcm9wXSwgY29lcmNlIHx8IGZhbHNlKTtcblx0fVxuXG5cdHJldHVybiBvYmo7XG59XG5cbnZhciBkZWZpbmVDb21wdXRlZFByb3BlcnR5ID1cbmV4cG9ydHMuZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUpIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJmdW5jdGlvblwiKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgY29tcHV0ZWQgcHJvcGVydHkgdmFsdWUuXCIpO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLmNhbGwob2JqKTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnRzLmRlZmluZUNvbXB1dGVkUHJvcGVydGllcyA9IGZ1bmN0aW9uKG9iaiwgcHJvcHMpIHtcblx0T2JqZWN0LmtleXMocHJvcHMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0ZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eShvYmosIGtleSwgcHJvcHNba2V5XSk7XG5cdH0pO1xufVxuXG5leHBvcnRzLnJ1bklmRXhpc3RzID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0eXBlb2Ygb2JqW21ldGhvZF0gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0cmV0dXJuIG9ialttZXRob2RdLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcblx0XHR9XG5cdH1cbn1cblxudmFyIFNlbGVjdG9yUGFyc2VyID0gcmVxdWlyZShcIi4vc2VsZWN0b3JcIilcbmV4cG9ydHMucGFyc2VTZWxlY3RvciA9IGZ1bmN0aW9uKHNlbCkge1xuXHRyZXR1cm4gU2VsZWN0b3JQYXJzZXIucGFyc2Uoc2VsKTtcbn1cblxuZXhwb3J0cy5jbG9zZXN0ID0gZnVuY3Rpb24oZWxlbSwgc2VsZWN0b3IpIHtcblx0d2hpbGUgKGVsZW0gIT0gbnVsbCkge1xuXHRcdGlmIChlbGVtLm5vZGVUeXBlID09PSAxICYmIG1hdGNoZXNTZWxlY3Rvci5jYWxsKGVsZW0sIHNlbGVjdG9yKSkgcmV0dXJuIGVsZW07XG5cdFx0ZWxlbSA9IGVsZW0ucGFyZW50Tm9kZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0cy5SZWFjdGl2ZURpY3QgPSAoZnVuY3Rpb24oKSB7XG5cdGZ1bmN0aW9uIFJlYWN0aXZlRGljdCgpIHtcblx0XHR0aGlzLl9tYXN0ZXJEZXAgPSBuZXcgRGVwcy5EZXBlbmRlbmN5O1xuXHRcdHRoaXMuX2RlcHMgPSB7fTtcblx0XHR0aGlzLl92YWx1ZXMgPSB7fTtcblx0fVxuXG5cdFJlYWN0aXZlRGljdC5leHRlbmQgPSBzdWJjbGFzcztcblxuXHRSZWFjdGl2ZURpY3QucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uKGtleSkge1xuXHRcdHRoaXMuZGVwZW5kKGtleSk7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VmFsdWUoa2V5KTtcblx0fVxuXG5cdFJlYWN0aXZlRGljdC5wcm90b3R5cGUuZ2V0VmFsdWUgPSBmdW5jdGlvbihrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5fdmFsdWVzW2tleV07XG5cdH1cblxuXHRSZWFjdGl2ZURpY3QucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcblx0XHRpZiAodGhpcy5nZXRWYWx1ZShrZXkpID09PSB2YWx1ZSkgcmV0dXJuIHRoaXM7XG5cdFx0dGhpcy5fdmFsdWVzW2tleV0gPSB2YWx1ZTtcblx0XHR0aGlzLmNoYW5nZWQoa2V5KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdFJlYWN0aXZlRGljdC5wcm90b3R5cGUudW5zZXQgPSBmdW5jdGlvbihrZXkpIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuZ2V0VmFsdWUoa2V5KSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuIHRoaXM7XG5cdFx0ZGVsZXRlIHRoaXMuX3ZhbHVlc1trZXldO1xuXHRcdHRoaXMuY2hhbmdlZChrZXkpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0UmVhY3RpdmVEaWN0LnByb3RvdHlwZS5oYXMgPSBmdW5jdGlvbihrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXQoa2V5KSAhPSBudWxsO1xuXHR9XG5cblx0UmVhY3RpdmVEaWN0LnByb3RvdHlwZS5rZXlzID0gZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5fbWFzdGVyRGVwLmRlcGVuZCgpO1xuXHRcdHJldHVybiBPYmplY3Qua2V5cyh0aGlzLl92YWx1ZXMpO1xuXHR9XG5cblx0UmVhY3RpdmVEaWN0LnByb3RvdHlwZS5nZXREZXBlbmRlbmN5ID0gZnVuY3Rpb24oa2V5KSB7XG5cdFx0dmFyIGRlcCA9IHRoaXMuX2RlcHNba2V5XTtcblx0XHRpZiAoZGVwID09IG51bGwpIGRlcCA9IHRoaXMuX2RlcHNba2V5XSA9IG5ldyBEZXBzLkRlcGVuZGVuY3k7XG5cdFx0cmV0dXJuIGRlcDtcblx0fVxuXG5cdFJlYWN0aXZlRGljdC5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24oa2V5KSB7XG5cdFx0dGhpcy5nZXREZXBlbmRlbmN5KGtleSkuZGVwZW5kKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRSZWFjdGl2ZURpY3QucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbihrZXkpIHtcblx0XHR0aGlzLmdldERlcGVuZGVuY3koa2V5KS5jaGFuZ2VkKCk7XG5cdFx0dGhpcy5fbWFzdGVyRGVwLmNoYW5nZWQoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHJldHVybiBSZWFjdGl2ZURpY3Q7XG59KSgpOyJdfQ==
