/* Temple / (c) 2014 Beneath the Ink, Inc. / MIT License / Version 0.3.2, Build 133 */
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

		// stop existing mount
		this.stop();

		// init the function event methods
		this._initEventMethods();

		// the first event in the cycle, before everything else
		this.trigger("mount:before", args);

		// the autorun computation
		this._mounting = true;
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
		delete this._mounting;

		this.trigger("mount:after", comp, args);

		return this;
	},

	render: function(){},

	isMounted: function() {
		return this._comp != null && !this._mounting;
	},

	isMounting: function() {
		return this._comp != null && this._mounting;
	},

	getComputation: function() {
		return this._comp;
	},

	invalidate: function() {
		if (this._comp != null) this._comp.invalidate();
		return this;
	},

	stop: function() {
		if (this._comp != null) this._comp.stop();
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
util.extend(Binding, _dereq_("./node"));
Binding.HTML = _dereq_("./html");
},{"./deps":2,"./events":3,"./html":4,"./node":6,"./util":7}],2:[function(_dereq_,module,exports){
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
},{"./util":7}],4:[function(_dereq_,module,exports){
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

},{"./binding":1,"./util":7}],5:[function(_dereq_,module,exports){
var Binding = _dereq_("./binding"),
	util = _dereq_("./util");

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
Temple.VERSION = "0.3.2";
Temple.util = util;
Temple.Events = _dereq_("./events");
Temple.Binding = Binding;

// deps setup
var Deps = Temple.Deps = _dereq_("./deps");
Temple.autorun = Deps.autorun;
Temple.nonreactive = Deps.nonreactive;
Temple.Dependency = Deps.Dependency;
},{"./binding":1,"./deps":2,"./events":3,"./util":7}],6:[function(_dereq_,module,exports){
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

var Comment =
exports.Comment = Node.extend({
	constructor: function(nodeOrValue) {
		// comment node
		if (nodeOrValue instanceof window.Node && nodeOrValue.nodeType === 8) {
			this.node = nodeOrValue;
			this.value = nodeOrValue.nodeValue;
		}

		// anything else
		else {
			this.node = document.createComment("");
			this.setValue(nodeOrValue);
		}

		Node.call(this);
	},

	insertBefore: function() {
		throw new Error("Comment bindings can't have children.");
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
	var cont = document.createElement("div"),
		binding = new Binding;

	cont.innerHTML = html;

	fromNode(util.toArray(cont.childNodes))
		.forEach(binding.appendChild, binding);

	return binding;
}
},{"./binding":1,"./util":7}],7:[function(_dereq_,module,exports){
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

exports.runIfExists = function(obj, method) {
	return function() {
		if (typeof obj[method] === "function") {
			return obj[method].apply(obj, arguments);
		}
	}
}
},{"./deps":2}]},{},[5])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy90eWxlci9Ecm9wYm94L0NsaWVudHMvQlRJL3RlbXBsZS9ub2RlX21vZHVsZXMvZ3J1bnQtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9iaW5kaW5nLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9kZXBzLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ldmVudHMuanMiLCIvVXNlcnMvdHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2h0bWwuanMiLCIvVXNlcnMvdHlsZXIvRHJvcGJveC9DbGllbnRzL0JUSS90ZW1wbGUvbGliL2luZGV4LmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi9ub2RlLmpzIiwiL1VzZXJzL3R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9CVEkvdGVtcGxlL2xpYi91dGlsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgRXZlbnRzID0gcmVxdWlyZShcIi4vZXZlbnRzXCIpLFxuXHREZXBzID0gcmVxdWlyZShcIi4vZGVwc1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbnZhciBjb21wdXRlZFByb3BzID0gW1xuXHRcImlzUm9vdFwiLCBcImhhc0NoaWxkcmVuXCIsIFwiZmlyc3RDaGlsZFwiLCBcImxhc3RDaGlsZFwiLCBcIm5leHRTaWJsaW5nXCIsXG5cdFwicHJldmlvdXNTaWJsaW5nXCIsIFwicGFyZW50Tm9kZVwiLCBcImZpcnN0Tm9kZVwiLCBcIm5leHRTaWJsaW5nTm9kZVwiXG5dO1xuXG5mdW5jdGlvbiBCaW5kaW5nKCkge1xuXHR0aGlzLmNoaWxkcmVuID0gW107XG5cdHRoaXMucGFyZW50ID0gbnVsbDtcblx0dXRpbC5kZWZpbmVDb21wdXRlZFByb3BlcnRpZXModGhpcywgdXRpbC5waWNrKHRoaXMsIGNvbXB1dGVkUHJvcHMpKTtcblx0dXRpbC50b0FycmF5KGFyZ3VtZW50cykuZm9yRWFjaCh0aGlzLmFwcGVuZENoaWxkLCB0aGlzKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCaW5kaW5nO1xuQmluZGluZy5leHRlbmQgPSB1dGlsLnN1YmNsYXNzO1xuQmluZGluZy5pc0JpbmRpbmcgPSBmdW5jdGlvbihvKSB7XG5cdHJldHVybiBvIGluc3RhbmNlb2YgQmluZGluZztcbn1cblxudXRpbC5leHRlbmQoQmluZGluZy5wcm90b3R5cGUsIEV2ZW50cywge1xuXHR1c2U6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0dmFyIGFyZ3MgPSB1dGlsLnRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKTtcblx0XHRmbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblx0XG5cdGluc2VydEJlZm9yZTogZnVuY3Rpb24oY2hpbGQsIGJlZm9yZSkge1xuXHRcdC8vIHNwZWNpYWwgY2FzZSBmb3Igc3RyaW5nc1xuXHRcdGlmICh0eXBlb2YgY2hpbGQgPT09IFwic3RyaW5nXCIpIGNoaWxkID0gbmV3IEJpbmRpbmcuVGV4dChjaGlsZCk7XG5cblx0XHRpZiAoIUJpbmRpbmcuaXNCaW5kaW5nKGNoaWxkKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBjaGlsZCB0byBiZSBhIGJpbmRpbmcuXCIpO1xuXG5cdFx0aWYgKGNoaWxkID09PSB0aGlzKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGFkZCBiaW5kaW5nIGFzIGEgY2hpbGQgb2YgaXRzZWxmLlwiKTtcblxuXHRcdC8vIGRlZmF1bHQgaW5kZXggaXMgdGhlIGVuZFxuXHRcdHZhciBpbmRleCA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoLFxuXHRcdFx0b3BhcmVudCA9IGNoaWxkLnBhcmVudCxcblx0XHRcdGNpbmRleCwgbW92ZWQgPSBmYWxzZTtcblxuXHRcdC8vIG9idGFpbiB0aGUgaW5kZXggdG8gaW5zZXJ0IGF0XG5cdFx0aWYgKGJlZm9yZSAhPSBudWxsKSB7XG5cdFx0XHRpZiAoIUJpbmRpbmcuaXNCaW5kaW5nKGJlZm9yZSkpXG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBiZWZvcmUgY2hpbGQgdG8gYmUgYSBiaW5kaW5nLlwiKTtcblxuXHRcdFx0aW5kZXggPSB0aGlzLmluZGV4T2YoYmVmb3JlKTtcblx0XHRcdGlmICghfmluZGV4KSB0aHJvdyBuZXcgRXJyb3IoXCJCZWZvcmUgYmluZGluZyBpcyBub3QgYSBjaGlsZCBvZiB0aGlzIGJpbmRpbmcuXCIpO1xuXHRcdFx0aWYgKGJlZm9yZSA9PT0gY2hpbGQpIHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBhZGQgY2hpbGQgYmVmb3JlIGl0c2VsZi5cIik7XG5cblx0XHRcdC8vIGlmIG5vZGUgaXMgYWxyZWFkeSBhdCB0aGlzIGxvY2F0aW9uLCBubyBuZWVkIHRvIGNvbnRpbnVlXG5cdFx0XHRpZiAoYmVmb3JlLnByZXZpb3VzU2libGluZyA9PT0gY2hpbGQpIHJldHVybiBjaGlsZDtcblx0XHR9XG5cblx0XHQvLyBkbyBzcGVjaWFsIHRoaW5ncyBpZiBjaGlsZCBpcyBhbHJlYWR5IGEgY2hpbGQgb2YgdGhpcyBwYXJlbnRcblx0XHRpZiAob3BhcmVudCA9PT0gdGhpcykge1xuXHRcdFx0Y2luZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkKTtcblxuXHRcdFx0Ly8gaWYgdGhlIGNoaWxkIGlzIGFscmVhZHkgdGhlIG5vZGUgYmVmb3JlIHRoZSBpbmRleCwgbm8gbmVlZCB0byBjb250aW51ZVxuXHRcdFx0aWYgKGNpbmRleCA9PT0gaW5kZXggLSAxKSByZXR1cm4gY2hpbGQ7XG5cblx0XHRcdC8vIHJlbW92ZSB0aGUgY2hpbGRcblx0XHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGNpbmRleCwgMSk7XG5cblx0XHRcdC8vIHVwZGF0ZSB0aGUgaW5kZXggc2luY2UgaXQgbWF5IGhhdmUgY2hhbmdlZFxuXHRcdFx0aW5kZXggPSBiZWZvcmUgIT0gbnVsbCA/IHRoaXMuaW5kZXhPZihiZWZvcmUpIDogdGhpcy5jaGlsZHJlbi5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Ly8gb3Igc2ltdWxhdGUgcmVtb3ZlIGZyb20gZXhpc3RpbmcgcGFyZW50XG5cdFx0ZWxzZSBpZiAob3BhcmVudCAhPSBudWxsKSB7XG5cdFx0XHRvcGFyZW50LmNoaWxkcmVuLnNwbGljZShvcGFyZW50LmluZGV4T2YoY2hpbGQpLCAxKTtcblx0XHRcdGNoaWxkLnBhcmVudCA9IG51bGw7XG5cdFx0XHRvcGFyZW50LnRyaWdnZXIoXCJjaGlsZDpyZW1vdmVcIiwgY2hpbGQpO1xuXHRcdH1cblxuXHRcdC8vIGFkZCB0aGUgY2hpbGRcblx0XHR0aGlzLmNoaWxkcmVuLnNwbGljZShpbmRleCwgMCwgY2hpbGQpO1xuXHRcdGNoaWxkLnBhcmVudCA9IHRoaXM7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50c1xuXHRcdGlmIChvcGFyZW50ID09PSB0aGlzKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJjaGlsZDptb3ZlXCIsIGNoaWxkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiY2hpbGQ6YWRkXCIsIGNoaWxkKTtcblx0XHRcdGNoaWxkLnRyaWdnZXIoXCJwYXJlbnRcIiwgdGhpcywgb3BhcmVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gdXBkYXRlIG5vZGVzIGxhc3Rcblx0XHRjaGlsZC51cGRhdGVOb2RlcygpO1xuXG5cdFx0cmV0dXJuIGNoaWxkO1xuXHR9LFxuXG5cdGFwcGVuZENoaWxkOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHJldHVybiB0aGlzLmluc2VydEJlZm9yZShjaGlsZCk7XG5cdH0sXG5cblx0YXBwZW5kOiBmdW5jdGlvbigpIHtcblx0XHR1dGlsLmZsYXR0ZW4odXRpbC50b0FycmF5KGFyZ3VtZW50cykpLmZvckVhY2godGhpcy5hcHBlbmRDaGlsZCwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQ2hpbGQ6IGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0dmFyIGluZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkKTtcblx0XHRpZiAoIX5pbmRleCkgcmV0dXJuO1xuXG5cdFx0Ly8gcmVtb3ZlIGNoaWxkXG5cdFx0d2hpbGUgKGluZGV4ID4gLTEpIHtcblx0XHRcdHRoaXMuY2hpbGRyZW4uc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdGluZGV4ID0gdGhpcy5pbmRleE9mKGNoaWxkLCBpbmRleCk7XG5cdFx0fVxuXG5cdFx0Y2hpbGQucGFyZW50ID0gbnVsbDtcblxuXHRcdC8vIHRyaWdnZXIgZXZlbnRzXG5cdFx0dGhpcy50cmlnZ2VyKFwiY2hpbGQ6cmVtb3ZlXCIsIGNoaWxkKTtcblx0XHRjaGlsZC50cmlnZ2VyKFwicGFyZW50XCIsIG51bGwsIHRoaXMpO1xuXG5cdFx0Ly8gdXBkYXRlIG5vZGVzIGxhc3Rcblx0XHRjaGlsZC51cGRhdGVOb2RlcygpO1xuXG5cdFx0cmV0dXJuIGNoaWxkO1xuXHR9LFxuXG5cdGNvbnRhaW5zOiBmdW5jdGlvbihjaGlsZCkge1xuXHRcdHJldHVybiB0aGlzLmluZGV4T2YoY2hpbGQpID4gLTE7XG5cdH0sXG5cblx0aW5kZXhPZjogZnVuY3Rpb24oY2hpbGQpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5pbmRleE9mKGNoaWxkKTtcblx0fSxcblxuXHRmaXJzdENoaWxkOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlblswXSB8fCBudWxsO1xuXHR9LFxuXG5cdGxhc3RDaGlsZDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGxlbiA9IHRoaXMuY2hpbGRyZW4ubGVuZ3RoO1xuXHRcdHJldHVybiBsZW4gPyB0aGlzLmNoaWxkcmVuW2xlbiAtIDFdIDogbnVsbDtcblx0fSxcblxuXHRuZXh0U2libGluZzogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNSb290KSByZXR1cm4gbnVsbDtcblxuXHRcdHZhciBpbmRleCA9IHRoaXMucGFyZW50LmluZGV4T2YodGhpcyksXG5cdFx0XHRjaGlsZHJlbiA9IHRoaXMucGFyZW50LmNoaWxkcmVuO1xuXG5cdFx0cmV0dXJuIGluZGV4ID4gLTEgJiYgaW5kZXggPCBjaGlsZHJlbi5sZW5ndGggLSAxID8gY2hpbGRyZW5baW5kZXggKyAxXSA6IG51bGw7XG5cdH0sXG5cblx0cHJldmlvdXNTaWJsaW5nOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHJldHVybiBudWxsO1xuXG5cdFx0dmFyIGluZGV4ID0gdGhpcy5wYXJlbnQuaW5kZXhPZih0aGlzKSxcblx0XHRcdGNoaWxkcmVuID0gdGhpcy5wYXJlbnQuY2hpbGRyZW47XG5cblx0XHRyZXR1cm4gaW5kZXggPiAwICYmIGluZGV4IDwgY2hpbGRyZW4ubGVuZ3RoID8gY2hpbGRyZW5baW5kZXggLSAxXSA6IG51bGw7XG5cdH0sXG5cblx0aGFzQ2hpbGRyZW46IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA+IDA7XG5cdH0sXG5cblx0aXNSb290OiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5wYXJlbnQgPT0gbnVsbDtcblx0fSxcblxuXHR1cGRhdGVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0Ly8gd2UgbXVzdCB1cGRhdGUgaW4gcmV2ZXJzZSB0byBlbnN1cmUgdGhhdCBiZWZvcmUgbm9kZXNcblx0XHQvLyBhcmUgYWxyZWFkeSBpbiB0aGUgRE9NIHdoZW4gY2hpbGRyZW4gYXJlIHBsYWNlZFxuXHRcdGZvciAodmFyIGkgPSB0aGlzLmNoaWxkcmVuLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHR0aGlzLmNoaWxkcmVuW2ldLnVwZGF0ZU5vZGVzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gZXZlbnQgaXMgZmlyZWQgYWZ0ZXIsIG1lYW5pbmcgY2hpbGRyZW4gd2lsbCBmaXJlIHRoZWlyIGV2ZW50cyBmaXJzdFxuXHRcdHRoaXMudHJpZ2dlcihcInVwZGF0ZVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHR0b05vZGVzOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5yZWR1Y2UoZnVuY3Rpb24obm9kZXMsIGNoaWxkKSB7XG5cdFx0XHRub2Rlcy5wdXNoLmFwcGx5KG5vZGVzLCBjaGlsZC50b05vZGVzKCkpO1xuXHRcdFx0cmV0dXJuIG5vZGVzO1xuXHRcdH0sIFtdKTtcblx0fSxcblxuXHRwYXJlbnROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc1Jvb3QpIHtcblx0XHRcdHJldHVybiB0aGlzLnBsYWNlaG9sZGVyICE9IG51bGwgP1xuXHRcdFx0XHR0aGlzLnBsYWNlaG9sZGVyLnBhcmVudE5vZGUgOlxuXHRcdFx0XHRudWxsO1xuXHRcdH1cblxuXHRcdHZhciBwYXJlbnQgPSB0aGlzLnBhcmVudDtcblxuXHRcdHdoaWxlIChwYXJlbnQgIT0gbnVsbCkge1xuXHRcdFx0aWYgKHBhcmVudCBpbnN0YW5jZW9mIEJpbmRpbmcuTm9kZSkgcmV0dXJuIHBhcmVudC5ub2RlO1xuXHRcdFx0aWYgKHBhcmVudC5pc1Jvb3QpIHJldHVybiBwYXJlbnQucGFyZW50Tm9kZTtcblx0XHRcdHBhcmVudCA9IHBhcmVudC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgZmlyc3RDaGlsZCA9IHRoaXMuZmlyc3RDaGlsZDtcblx0XHRyZXR1cm4gZmlyc3RDaGlsZCAhPSBudWxsID8gZmlyc3RDaGlsZC5maXJzdE5vZGUgOiBudWxsO1xuXHR9LFxuXG5cdG5leHRTaWJsaW5nTm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNSb290KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wbGFjZWhvbGRlciAhPSBudWxsID9cblx0XHRcdFx0dGhpcy5wbGFjZWhvbGRlciA6XG5cdFx0XHRcdG51bGw7XG5cdFx0fVxuXG5cdFx0dmFyIG5leHRTaWJsaW5nID0gdGhpcy5uZXh0U2libGluZztcblx0XHRyZXR1cm4gbmV4dFNpYmxpbmcgIT0gbnVsbCA/IG5leHRTaWJsaW5nLmZpcnN0Tm9kZSA6XG5cdFx0XHR0aGlzLnBhcmVudCBpbnN0YW5jZW9mIEJpbmRpbmcuTm9kZSA/IG51bGwgOlxuXHRcdFx0dGhpcy5wYXJlbnQubmV4dFNpYmxpbmdOb2RlO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGVsLCBpO1xuXG5cdFx0Zm9yIChpIGluIHRoaXMuY2hpbGRyZW4pIHtcblx0XHRcdGVsID0gdGhpcy5jaGlsZHJlbltpXS5maW5kKHNlbGVjdG9yKTtcblx0XHRcdGlmIChlbCAhPSBudWxsKSByZXR1cm4gZWw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5yZWR1Y2UoZnVuY3Rpb24obm9kZXMsIGNoaWxkKSB7XG5cdFx0XHRub2Rlcy5wdXNoLmFwcGx5KG5vZGVzLCBjaGlsZC5maW5kQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHRyZXR1cm4gbm9kZXM7XG5cdFx0fSwgW10pO1xuXHR9LFxuXG5cdHBhaW50OiBmdW5jdGlvbihwYXJlbnQsIGJlZm9yZU5vZGUpIHtcblx0XHRpZiAodHlwZW9mIHBhcmVudCA9PT0gXCJzdHJpbmdcIikgcGFyZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihwYXJlbnQpO1xuXHRcdGlmICh0eXBlb2YgYmVmb3JlTm9kZSA9PT0gXCJzdHJpbmdcIikgYmVmb3JlTm9kZSA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKGJlZm9yZU5vZGUpO1xuXHRcdGlmIChwYXJlbnQgPT0gbnVsbCkgcGFyZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdGlmICh0aGlzLnBsYWNlaG9sZGVyID09IG51bGwpIHRoaXMucGxhY2Vob2xkZXIgPSBkb2N1bWVudC5jcmVhdGVDb21tZW50KHV0aWwudW5pcXVlSWQoXCIkXCIpKTtcblxuXHRcdHBhcmVudC5pbnNlcnRCZWZvcmUodGhpcy5wbGFjZWhvbGRlciwgYmVmb3JlTm9kZSk7XG5cdFx0dGhpcy51cGRhdGVOb2RlcygpO1xuXHRcdHRoaXMudHJpZ2dlcihcInBhaW50XCIsIHBhcmVudCwgYmVmb3JlTm9kZSk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRkZXRhY2g6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLnBsYWNlaG9sZGVyICE9IG51bGwgJiYgdGhpcy5wbGFjZWhvbGRlci5wYXJlbnROb2RlKSB7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5wbGFjZWhvbGRlcik7XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVOb2RlcygpO1xuXHRcdHRoaXMudHJpZ2dlcihcImRldGFjaFwiKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGF1dG9ydW46IGZ1bmN0aW9uKGZuLCBvbmx5T25BY3RpdmUpIHtcblx0XHR2YXIgY29tcCA9IERlcHMuYXV0b3J1bihmbiwgdGhpcyk7XG5cdFx0aWYgKG9ubHlPbkFjdGl2ZSAmJiAhRGVwcy5hY3RpdmUpIGNvbXAuc3RvcCgpO1xuXHRcdHJldHVybiBjb21wO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5jaGlsZHJlbi5tYXAoZnVuY3Rpb24oY2hpbGQpIHtcblx0XHRcdHJldHVybiBjaGlsZC50b1N0cmluZygpO1xuXHRcdH0pLmpvaW4oXCJcIik7XG5cdH0sXG5cblx0Ly8gYSBnZW5lcmFsaXplZCByZWFjdGl2ZSB3b3JrZmxvdyBoZWxwZXJcblx0bW91bnQ6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gdXRpbC50b0FycmF5KGFyZ3VtZW50cyksIGNvbXA7XG5cblx0XHQvLyBzdG9wIGV4aXN0aW5nIG1vdW50XG5cdFx0dGhpcy5zdG9wKCk7XG5cblx0XHQvLyBpbml0IHRoZSBmdW5jdGlvbiBldmVudCBtZXRob2RzXG5cdFx0dGhpcy5faW5pdEV2ZW50TWV0aG9kcygpO1xuXG5cdFx0Ly8gdGhlIGZpcnN0IGV2ZW50IGluIHRoZSBjeWNsZSwgYmVmb3JlIGV2ZXJ5dGhpbmcgZWxzZVxuXHRcdHRoaXMudHJpZ2dlcihcIm1vdW50OmJlZm9yZVwiLCBhcmdzKTtcblxuXHRcdC8vIHRoZSBhdXRvcnVuIGNvbXB1dGF0aW9uXG5cdFx0dGhpcy5fbW91bnRpbmcgPSB0cnVlO1xuXHRcdGNvbXAgPSB0aGlzLl9jb21wID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdC8vIG9ubHkgcmVuZGVyIGV2ZW50IHdpdGhvdXQgYmluZGluZ3Ncblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjpiZWZvcmVcIiwgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIHJ1biByZW5kZXIgYW5kIHByb2Nlc3MgdGhlIHJlc3VsdGluZyBiaW5kaW5ncyBpbnRvIGFuIGFycmF5XG5cdFx0XHR2YXIgYmluZGluZ3MgPSB0aGlzLnJlbmRlci5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdGlmIChCaW5kaW5nLmlzQmluZGluZyhiaW5kaW5ncykpIGJpbmRpbmdzID0gWyBiaW5kaW5ncyBdO1xuXHRcdFx0aWYgKCFBcnJheS5pc0FycmF5KGJpbmRpbmdzKSkgYmluZGluZ3MgPSBbXTtcblxuXHRcdFx0Ly8gbWFpbiByZW5kZXIgZXZlbnQgZXhlY3MgYWZ0ZXIgcmVuZGVyIGJ1dCBiZWZvcmUgYXBwZW5kaW5nXG5cdFx0XHQvLyB0aGUgYmluZGluZ3MgYXJyYXkgY2FuIGJlIGFmZmVjdGVkIGJ5IHRoaXMgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlclwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIGFwcGVuZCB0aGUgYmluZGluZ3MgaW4gb3JkZXJcblx0XHRcdGJpbmRpbmdzID0gYmluZGluZ3MubWFwKHRoaXMuYXBwZW5kQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XG5cdFx0XHQvLyB0aGUgbGFzdCByZW5kZXIgZXZlbnRcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlcjphZnRlclwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cblx0XHRcdC8vIGF1dG8gY2xlYW4gdXBcblx0XHRcdGNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQvLyBvbmx5IGludmFsaWRhdGUgZXZlbnQgd2l0aCBiaW5kaW5nc1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJpbnZhbGlkYXRlOmJlZm9yZVwiLCBiaW5kaW5ncywgY29tcCwgYXJncyk7XG5cdFx0XHRcdFxuXHRcdFx0XHQvLyByZW1vdmUgdGhlIGJpbmRpbmdzIGFkZGVkIGJlZm9yZVxuXHRcdFx0XHRiaW5kaW5ncy5mb3JFYWNoKHRoaXMucmVtb3ZlQ2hpbGQsIHRoaXMpO1xuXHRcdFx0XHRcblx0XHRcdFx0Ly8gcmVtYWluaW5nIGludmFsaWRhdGUgZXZlbnRzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGVcIiwgY29tcCwgYXJncyk7XG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGU6YWZ0ZXJcIiwgY29tcCwgYXJncyk7XG5cblx0XHRcdFx0Ly8gZGV0ZWN0IGlmIHRoZSBjb21wdXRhdGlvbiBzdG9wcGVkXG5cdFx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJzdG9wXCIsIGFyZ3MpO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9jb21wO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIHJlbWFpbmluZyBtb3VudCBldmVudHMgaGFwcGVuIGFmdGVyIHRoZSBmaXJzdCByZW5kZXJcblx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudFwiLCBjb21wLCBhcmdzKTtcblx0XHRkZWxldGUgdGhpcy5fbW91bnRpbmc7XG5cblx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDphZnRlclwiLCBjb21wLCBhcmdzKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbmRlcjogZnVuY3Rpb24oKXt9LFxuXG5cdGlzTW91bnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXAgIT0gbnVsbCAmJiAhdGhpcy5fbW91bnRpbmc7XG5cdH0sXG5cblx0aXNNb3VudGluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXAgIT0gbnVsbCAmJiB0aGlzLl9tb3VudGluZztcblx0fSxcblxuXHRnZXRDb21wdXRhdGlvbjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXA7XG5cdH0sXG5cblx0aW52YWxpZGF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX2NvbXAgIT0gbnVsbCkgdGhpcy5fY29tcC5pbnZhbGlkYXRlKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0c3RvcDogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX2NvbXAgIT0gbnVsbCkgdGhpcy5fY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gdHVybnMgYSBmZXcgZXZlbnRzIGludG8gaW5zdGFuY2UgbWV0aG9kcyB0byBtYWtlIHRoaXMgY2xhc3MgbW9yZSBmdW5jdGlvbmFsXG5cdC8vIGJ1dCBhbHNvIHRvIG1hdGNoIGNsb3NlciB0byBGQidzIFJlYWN0IGNvbXBvbmVudCBBUElcblx0X2luaXRFdmVudE1ldGhvZHM6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLl9ldmVudE1ldGhvZHMpIHJldHVybiB0aGlzO1xuXHRcdHRoaXMuX2V2ZW50TWV0aG9kcyA9IHRydWU7XG5cblx0XHRbXCJtb3VudFwiLFwicmVuZGVyXCIsXCJpbnZhbGlkYXRlXCJdLmZvckVhY2goZnVuY3Rpb24oZXZ0KSB7XG5cdFx0XHR2YXIgY2FwcyA9IGV2dFswXS50b1VwcGVyQ2FzZSgpICsgZXZ0LnN1YnN0cigxKTtcblx0XHRcdHRoaXMub24oZXZ0ICsgXCI6YmVmb3JlXCIsIHV0aWwucnVuSWZFeGlzdHModGhpcywgXCJiZWZvcmVcIiArIGNhcHMpKTtcblx0XHRcdHRoaXMub24oZXZ0LCB1dGlsLnJ1bklmRXhpc3RzKHRoaXMsIFwib25cIiArIGNhcHMpKTtcblx0XHRcdHRoaXMub24oZXZ0ICsgXCI6YWZ0ZXJcIiwgdXRpbC5ydW5JZkV4aXN0cyh0aGlzLCBcImFmdGVyXCIgKyBjYXBzKSk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHR0aGlzLm9uKFwic3RvcFwiLCB1dGlsLnJ1bklmRXhpc3RzKHRoaXMsIFwib25TdG9wXCIpKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cbn0pO1xuXG4vLyBhbGlhc2VzXG5CaW5kaW5nLnByb3RvdHlwZS5oYXNDaGlsZCA9IEJpbmRpbmcucHJvdG90eXBlLmNvbnRhaW5zO1xuQmluZGluZy5wcm90b3R5cGUudG9IVE1MID0gQmluZGluZy5wcm90b3R5cGUudG9TdHJpbmc7XG5cbi8vIExvYWQgdGhlIGJpbmRpbmdzXG51dGlsLmV4dGVuZChCaW5kaW5nLCByZXF1aXJlKFwiLi9ub2RlXCIpKTtcbkJpbmRpbmcuSFRNTCA9IHJlcXVpcmUoXCIuL2h0bWxcIik7IiwiLy8gQ29weSBvZiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9jb21taXRzL2U3ODg2MWI3ZDBkYmI2MGU1ZTJiZjU5YmFiMmNiMDZjZTY1OTZjMDQvcGFja2FnZXMvZGVwcy9kZXBzLmpzXG4vLyAoYykgMjAxMS0yMDE0IE1ldGVvciBEZXZlbG9wbWVudCBHcm91cFxuXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gUGFja2FnZSBkb2NzIGF0IGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHMgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciBEZXBzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19hY3RpdmVcbkRlcHMuYWN0aXZlID0gZmFsc2U7XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfY3VycmVudGNvbXB1dGF0aW9uXG5EZXBzLmN1cnJlbnRDb21wdXRhdGlvbiA9IG51bGw7XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuICBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbiA9IGM7XG4gIERlcHMuYWN0aXZlID0gISEgYztcbn07XG5cbnZhciBfZGVidWdGdW5jID0gZnVuY3Rpb24gKCkge1xuICAvLyBsYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5XG4gIHJldHVybiAodHlwZW9mIE1ldGVvciAhPT0gXCJ1bmRlZmluZWRcIiA/IE1ldGVvci5fZGVidWcgOlxuICAgICAgICAgICgodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUubG9nID9cbiAgICAgICAgICAgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcbiAgICAgICAgICAgZnVuY3Rpb24gKCkge30pKTtcbn07XG5cbnZhciBfdGhyb3dPckxvZyA9IGZ1bmN0aW9uIChmcm9tLCBlKSB7XG4gIGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcbiAgICB0aHJvdyBlO1xuICB9IGVsc2Uge1xuICAgIF9kZWJ1Z0Z1bmMoKShcIkV4Y2VwdGlvbiBmcm9tIERlcHMgXCIgKyBmcm9tICsgXCIgZnVuY3Rpb246XCIsXG4gICAgICAgICAgICAgICAgIGUuc3RhY2sgfHwgZS5tZXNzYWdlKTtcbiAgfVxufTtcblxuLy8gVGFrZXMgYSBmdW5jdGlvbiBgZmAsIGFuZCB3cmFwcyBpdCBpbiBhIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZGBcbi8vIGJsb2NrIGlmIHdlIGFyZSBydW5uaW5nIG9uIHRoZSBzZXJ2ZXIuIE9uIHRoZSBjbGllbnQsIHJldHVybnMgdGhlXG4vLyBvcmlnaW5hbCBmdW5jdGlvbiAoc2luY2UgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYCBpcyBhXG4vLyBuby1vcCkuIFRoaXMgaGFzIHRoZSBiZW5lZml0IG9mIG5vdCBhZGRpbmcgYW4gdW5uZWNlc3Nhcnkgc3RhY2tcbi8vIGZyYW1lIG9uIHRoZSBjbGllbnQuXG52YXIgd2l0aE5vWWllbGRzQWxsb3dlZCA9IGZ1bmN0aW9uIChmKSB7XG4gIGlmICgodHlwZW9mIE1ldGVvciA9PT0gJ3VuZGVmaW5lZCcpIHx8IE1ldGVvci5pc0NsaWVudCkge1xuICAgIHJldHVybiBmO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZi5hcHBseShudWxsLCBhcmdzKTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH1cbn07XG5cbnZhciBuZXh0SWQgPSAxO1xuLy8gY29tcHV0YXRpb25zIHdob3NlIGNhbGxiYWNrcyB3ZSBzaG91bGQgY2FsbCBhdCBmbHVzaCB0aW1lXG52YXIgcGVuZGluZ0NvbXB1dGF0aW9ucyA9IFtdO1xuLy8gYHRydWVgIGlmIGEgRGVwcy5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBEZXBzLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBEZXBzLmZsdXNoIG5vd1xudmFyIGluRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgY29tcHV0aW5nIGEgY29tcHV0YXRpb24gbm93LCBlaXRoZXIgZmlyc3QgdGltZVxuLy8gb3IgcmVjb21wdXRlLiAgVGhpcyBtYXRjaGVzIERlcHMuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBEZXBzLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBEZXBzLmZsdXNoIHRoYXQgd2UgYXJlIGluLiBXaGVuIHNldCwgdGhyb3cgcmF0aGVyIHRoYW4gbG9nIHRoZVxuLy8gZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQgd2hpbGUgZmx1c2hpbmcuIEJlZm9yZSB0aHJvd2luZyB0aGUgZXJyb3IsXG4vLyBmaW5pc2ggZmx1c2hpbmcgKGZyb20gYSBmaW5hbGx5IGJsb2NrKSwgbG9nZ2luZyBhbnkgc3Vic2VxdWVudFxuLy8gZXJyb3JzLlxudmFyIHRocm93Rmlyc3RFcnJvciA9IGZhbHNlO1xuXG52YXIgYWZ0ZXJGbHVzaENhbGxiYWNrcyA9IFtdO1xuXG52YXIgcmVxdWVzdEFuaW1hdGlvbkZyYW1lID0gdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/XG4gIHdpbmRvdy5yZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcbiAgd2luZG93Lm1velJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuICB3aW5kb3cud2Via2l0UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG4gIHdpbmRvdy5vUmVxdWVzdEFuaW1hdGlvbkZyYW1lIDpcbiAgZnVuY3Rpb24oZikge1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICBmKERhdGUubm93KCkpO1xuICAgIH0sIDEwMDAgLyAzMCk7XG4gIH07XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghIHdpbGxGbHVzaCkge1xuICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZShEZXBzLmZsdXNoKTtcbiAgICB3aWxsRmx1c2ggPSB0cnVlO1xuICB9XG59O1xuXG4vLyBEZXBzLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHZpc2libGUgYnV0IHByaXZhdGVcbi8vICh0aHJvd3MgYW4gZXJyb3IgaWYgeW91IHRyeSB0byBjYWxsIGl0KVxudmFyIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2NvbXB1dGF0aW9uXG4vL1xuRGVwcy5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQsIGN0eCkge1xuICBpZiAoISBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbilcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIkRlcHMuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgcHJpdmF0ZTsgdXNlIERlcHMuYXV0b3J1blwiKTtcbiAgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuICBzZWxmLnN0b3BwZWQgPSBmYWxzZTtcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlZFxuICBzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fZmlyc3RydW5cbiAgc2VsZi5maXJzdFJ1biA9IHRydWU7XG5cbiAgc2VsZi5faWQgPSBuZXh0SWQrKztcbiAgc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG4gIC8vIHRoZSBwbGFuIGlzIGF0IHNvbWUgcG9pbnQgdG8gdXNlIHRoZSBwYXJlbnQgcmVsYXRpb25cbiAgLy8gdG8gY29uc3RyYWluIHRoZSBvcmRlciB0aGF0IGNvbXB1dGF0aW9ucyBhcmUgcHJvY2Vzc2VkXG4gIHNlbGYuX3BhcmVudCA9IHBhcmVudDtcbiAgc2VsZi5fZnVuYyA9IGY7XG4gIHNlbGYuX2NvbnRleHQgPSBjdHggfHwgdGhpcztcbiAgc2VsZi5fcmVjb21wdXRpbmcgPSBmYWxzZTtcblxuICB2YXIgZXJyb3JlZCA9IHRydWU7XG4gIHRyeSB7XG4gICAgc2VsZi5fY29tcHV0ZSgpO1xuICAgIGVycm9yZWQgPSBmYWxzZTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG4gICAgaWYgKGVycm9yZWQpXG4gICAgICBzZWxmLnN0b3AoKTtcbiAgfVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5EZXBzLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIHZhciBzZWxmID0gdGhpcztcblxuICBpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cbiAgaWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcbiAgICBEZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgIHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgZi5fY29udGV4dCA9IGN0eDtcbiAgICBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MucHVzaChmKTtcbiAgfVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZVxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUuaW52YWxpZGF0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBpZiAoISBzZWxmLmludmFsaWRhdGVkKSB7XG4gICAgLy8gaWYgd2UncmUgY3VycmVudGx5IGluIF9yZWNvbXB1dGUoKSwgZG9uJ3QgZW5xdWV1ZVxuICAgIC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuICAgIGlmICghIHNlbGYuX3JlY29tcHV0aW5nICYmICEgc2VsZi5zdG9wcGVkKSB7XG4gICAgICByZXF1aXJlRmx1c2goKTtcbiAgICAgIHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcbiAgICB9XG5cbiAgICBzZWxmLmludmFsaWRhdGVkID0gdHJ1ZTtcblxuICAgIC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG4gICAgLy8gc2VsZi5pbnZhbGlkYXRlZCA9PT0gdHJ1ZS5cbiAgICBmb3IodmFyIGkgPSAwLCBmOyBmID0gc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzW2ldOyBpKyspIHtcbiAgICAgIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuICAgICAgICB3aXRoTm9ZaWVsZHNBbGxvd2VkKGYpLmNhbGwoZi5fY29udGV4dCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcbiAgfVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCEgdGhpcy5zdG9wcGVkKSB7XG4gICAgdGhpcy5zdG9wcGVkID0gdHJ1ZTtcbiAgICB0aGlzLmludmFsaWRhdGUoKTtcbiAgfVxufTtcblxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUuX2NvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgc2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG4gIHZhciBwcmV2aW91cyA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICBzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG4gIHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcbiAgaW5Db21wdXRlID0gdHJ1ZTtcbiAgdHJ5IHtcbiAgICB3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG4gIH0gZmluYWxseSB7XG4gICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcbiAgICBpbkNvbXB1dGUgPSBmYWxzZTtcbiAgfVxufTtcblxuRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUuX3JlY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIHNlbGYuX3JlY29tcHV0aW5nID0gdHJ1ZTtcbiAgdHJ5IHtcbiAgICB3aGlsZSAoc2VsZi5pbnZhbGlkYXRlZCAmJiAhIHNlbGYuc3RvcHBlZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc2VsZi5fY29tcHV0ZSgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBfdGhyb3dPckxvZyhcInJlY29tcHV0ZVwiLCBlKTtcbiAgICAgIH1cbiAgICAgIC8vIElmIF9jb21wdXRlKCkgaW52YWxpZGF0ZWQgdXMsIHdlIHJ1biBhZ2FpbiBpbW1lZGlhdGVseS5cbiAgICAgIC8vIEEgY29tcHV0YXRpb24gdGhhdCBpbnZhbGlkYXRlcyBpdHNlbGYgaW5kZWZpbml0ZWx5IGlzIGFuXG4gICAgICAvLyBpbmZpbml0ZSBsb29wLCBvZiBjb3Vyc2UuXG4gICAgICAvL1xuICAgICAgLy8gV2UgY291bGQgcHV0IGFuIGl0ZXJhdGlvbiBjb3VudGVyIGhlcmUgYW5kIGNhdGNoIHJ1bi1hd2F5XG4gICAgICAvLyBsb29wcy5cbiAgICB9XG4gIH0gZmluYWxseSB7XG4gICAgc2VsZi5fcmVjb21wdXRpbmcgPSBmYWxzZTtcbiAgfVxufTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfZGVwZW5kZW5jeVxuLy9cbkRlcHMuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4vL1xuLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4vLyBwcmVzZW50LiAgUmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4vLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbi8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cbkRlcHMuRGVwZW5kZW5jeS5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24gKGNvbXB1dGF0aW9uKSB7XG4gIGlmICghIGNvbXB1dGF0aW9uKSB7XG4gICAgaWYgKCEgRGVwcy5hY3RpdmUpXG4gICAgICByZXR1cm4gZmFsc2U7XG5cbiAgICBjb21wdXRhdGlvbiA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICB9XG4gIHZhciBzZWxmID0gdGhpcztcbiAgdmFyIGlkID0gY29tcHV0YXRpb24uX2lkO1xuICBpZiAoISAoaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpKSB7XG4gICAgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdID0gY29tcHV0YXRpb247XG4gICAgY29tcHV0YXRpb24ub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgIGRlbGV0ZSBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF07XG4gICAgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9jaGFuZ2VkXG5EZXBzLkRlcGVuZGVuY3kucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBzZWxmID0gdGhpcztcbiAgZm9yICh2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG4gICAgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdLmludmFsaWRhdGUoKTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfaGFzZGVwZW5kZW50c1xuRGVwcy5EZXBlbmRlbmN5LnByb3RvdHlwZS5oYXNEZXBlbmRlbnRzID0gZnVuY3Rpb24gKCkge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG4gICAgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfZmx1c2hcbkRlcHMuZmx1c2ggPSBmdW5jdGlvbiAoX29wdHMpIHtcbiAgLy8gWFhYIFdoYXQgcGFydCBvZiB0aGUgY29tbWVudCBiZWxvdyBpcyBzdGlsbCB0cnVlPyAoV2Ugbm8gbG9uZ2VyXG4gIC8vIGhhdmUgU3BhcmspXG4gIC8vXG4gIC8vIE5lc3RlZCBmbHVzaCBjb3VsZCBwbGF1c2libHkgaGFwcGVuIGlmLCBzYXksIGEgZmx1c2ggY2F1c2VzXG4gIC8vIERPTSBtdXRhdGlvbiwgd2hpY2ggY2F1c2VzIGEgXCJibHVyXCIgZXZlbnQsIHdoaWNoIHJ1bnMgYW5cbiAgLy8gYXBwIGV2ZW50IGhhbmRsZXIgdGhhdCBjYWxscyBEZXBzLmZsdXNoLiAgQXQgdGhlIG1vbWVudFxuICAvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG4gIC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLiAgQW5kIHdlIGRvbid0IGhhdmVcbiAgLy8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG4gIC8vXG4gIC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcbiAgaWYgKGluRmx1c2gpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBEZXBzLmZsdXNoIHdoaWxlIGZsdXNoaW5nXCIpO1xuXG4gIGlmIChpbkNvbXB1dGUpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmx1c2ggaW5zaWRlIERlcHMuYXV0b3J1blwiKTtcblxuICBpbkZsdXNoID0gdHJ1ZTtcbiAgd2lsbEZsdXNoID0gdHJ1ZTtcbiAgdGhyb3dGaXJzdEVycm9yID0gISEgKF9vcHRzICYmIF9vcHRzLl90aHJvd0ZpcnN0RXJyb3IpO1xuXG4gIHZhciBmaW5pc2hlZFRyeSA9IGZhbHNlO1xuICB0cnkge1xuICAgIHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCB8fFxuICAgICAgICAgICBhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuXG4gICAgICAvLyByZWNvbXB1dGUgYWxsIHBlbmRpbmcgY29tcHV0YXRpb25zXG4gICAgICB3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgdmFyIGNvbXAgPSBwZW5kaW5nQ29tcHV0YXRpb25zLnNoaWZ0KCk7XG4gICAgICAgIGNvbXAuX3JlY29tcHV0ZSgpO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcbiAgICAgICAgLy8gY2FsbCBvbmUgYWZ0ZXJGbHVzaCBjYWxsYmFjaywgd2hpY2ggbWF5XG4gICAgICAgIC8vIGludmFsaWRhdGUgbW9yZSBjb21wdXRhdGlvbnNcbiAgICAgICAgdmFyIGZ1bmMgPSBhZnRlckZsdXNoQ2FsbGJhY2tzLnNoaWZ0KCk7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgZnVuYy5jYWxsKGZ1bmMuX2NvbnRleHQpO1xuICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgX3Rocm93T3JMb2coXCJhZnRlckZsdXNoIGZ1bmN0aW9uXCIsIGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGZpbmlzaGVkVHJ5ID0gdHJ1ZTtcbiAgfSBmaW5hbGx5IHtcbiAgICBpZiAoISBmaW5pc2hlZFRyeSkge1xuICAgICAgLy8gd2UncmUgZXJyb3JpbmdcbiAgICAgIGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBEZXBzLmZsdXNoKClgIGFnYWluXG4gICAgICBEZXBzLmZsdXNoKHtfdGhyb3dGaXJzdEVycm9yOiBmYWxzZX0pOyAvLyBmaW5pc2ggZmx1c2hpbmdcbiAgICB9XG4gICAgd2lsbEZsdXNoID0gZmFsc2U7XG4gICAgaW5GbHVzaCA9IGZhbHNlO1xuICB9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2F1dG9ydW5cbi8vXG4vLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4vLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuLy9cbi8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4vL1xuLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4vLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG5EZXBzLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0RlcHMuYXV0b3J1biByZXF1aXJlcyBhIGZ1bmN0aW9uIGFyZ3VtZW50Jyk7XG5cbiAgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuICB2YXIgYyA9IG5ldyBEZXBzLkNvbXB1dGF0aW9uKGYsIERlcHMuY3VycmVudENvbXB1dGF0aW9uLCBjdHgpO1xuXG4gIGlmIChEZXBzLmFjdGl2ZSlcbiAgICBEZXBzLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG4gICAgICBjLnN0b3AoKTtcbiAgICB9KTtcblxuICByZXR1cm4gYztcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfbm9ucmVhY3RpdmVcbi8vXG4vLyBSdW4gYGZgIHdpdGggbm8gY3VycmVudCBjb21wdXRhdGlvbiwgcmV0dXJuaW5nIHRoZSByZXR1cm4gdmFsdWVcbi8vIG9mIGBmYC4gIFVzZWQgdG8gdHVybiBvZmYgcmVhY3Rpdml0eSBmb3IgdGhlIGR1cmF0aW9uIG9mIGBmYCxcbi8vIHNvIHRoYXQgcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFjY2Vzc2VkIGJ5IGBmYCB3aWxsIG5vdCByZXN1bHQgaW4gYW55XG4vLyBjb21wdXRhdGlvbnMgYmVpbmcgaW52YWxpZGF0ZWQuXG5EZXBzLm5vbnJlYWN0aXZlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuICB2YXIgcHJldmlvdXMgPSBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbjtcbiAgc2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuICB0cnkge1xuICAgIHJldHVybiBmLmNhbGwoY3R4KTtcbiAgfSBmaW5hbGx5IHtcbiAgICBzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuICB9XG59O1xuXG4vLyBzaW1pbGFyIHRvIG5vbnJlYWN0aXZlIGJ1dCByZXR1cm5zIGEgZnVuY3Rpb24gaW5zdGVhZCBvZlxuLy8gZXhlY3R1aW5nIGZuIGltbWVkaWF0ZWx5LiByZWFsbHkganVzdCBzb21lIHN1Z2FyXG5EZXBzLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBEZXBzLm5vbnJlYWN0aXZlKGYsIGN0eCB8fCB0aGlzKTtcbiAgfVxufVxuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX29uaW52YWxpZGF0ZVxuRGVwcy5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIGlmICghIERlcHMuYWN0aXZlKVxuICAgIHRocm93IG5ldyBFcnJvcihcIkRlcHMub25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgY3VycmVudENvbXB1dGF0aW9uXCIpO1xuXG4gIERlcHMuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19hZnRlcmZsdXNoXG5EZXBzLmFmdGVyRmx1c2ggPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG4gIGYuX2NvbnRleHQgPSBjdHg7XG4gIGFmdGVyRmx1c2hDYWxsYmFja3MucHVzaChmKTtcbiAgcmVxdWlyZUZsdXNoKCk7XG59OyIsInZhciB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxuLy8gQmFja2JvbmUuRXZlbnRzXG4vLyAtLS0tLS0tLS0tLS0tLS1cblxuLy8gQSBtb2R1bGUgdGhhdCBjYW4gYmUgbWl4ZWQgaW4gdG8gKmFueSBvYmplY3QqIGluIG9yZGVyIHRvIHByb3ZpZGUgaXQgd2l0aFxuLy8gY3VzdG9tIGV2ZW50cy4gWW91IG1heSBiaW5kIHdpdGggYG9uYCBvciByZW1vdmUgd2l0aCBgb2ZmYCBjYWxsYmFja1xuLy8gZnVuY3Rpb25zIHRvIGFuIGV2ZW50OyBgdHJpZ2dlcmAtaW5nIGFuIGV2ZW50IGZpcmVzIGFsbCBjYWxsYmFja3MgaW5cbi8vIHN1Y2Nlc3Npb24uXG4vL1xuLy8gICAgIHZhciBvYmplY3QgPSB7fTtcbi8vICAgICB1dGlsLmV4dGVuZChvYmplY3QsIEJhY2tib25lLkV2ZW50cyk7XG4vLyAgICAgb2JqZWN0Lm9uKCdleHBhbmQnLCBmdW5jdGlvbigpeyBhbGVydCgnZXhwYW5kZWQnKTsgfSk7XG4vLyAgICAgb2JqZWN0LnRyaWdnZXIoJ2V4cGFuZCcpO1xuLy9cbnZhciBFdmVudHMgPSBtb2R1bGUuZXhwb3J0cyA9IHtcblxuXHQvLyBCaW5kIGFuIGV2ZW50IHRvIGEgYGNhbGxiYWNrYCBmdW5jdGlvbi4gUGFzc2luZyBgXCJhbGxcImAgd2lsbCBiaW5kXG5cdC8vIHRoZSBjYWxsYmFjayB0byBhbGwgZXZlbnRzIGZpcmVkLlxuXHRvbjogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblx0XHRpZiAoIWV2ZW50c0FwaSh0aGlzLCAnb24nLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSB8fCAhY2FsbGJhY2spIHJldHVybiB0aGlzO1xuXHRcdHRoaXMuX2V2ZW50cyB8fCAodGhpcy5fZXZlbnRzID0ge30pO1xuXHRcdHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV0gfHwgKHRoaXMuX2V2ZW50c1tuYW1lXSA9IFtdKTtcblx0XHRldmVudHMucHVzaCh7Y2FsbGJhY2s6IGNhbGxiYWNrLCBjb250ZXh0OiBjb250ZXh0LCBjdHg6IGNvbnRleHQgfHwgdGhpc30pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIEJpbmQgYW4gZXZlbnQgdG8gb25seSBiZSB0cmlnZ2VyZWQgYSBzaW5nbGUgdGltZS4gQWZ0ZXIgdGhlIGZpcnN0IHRpbWVcblx0Ly8gdGhlIGNhbGxiYWNrIGlzIGludm9rZWQsIGl0IHdpbGwgYmUgcmVtb3ZlZC5cblx0b25jZTogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblx0XHRpZiAoIWV2ZW50c0FwaSh0aGlzLCAnb25jZScsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHZhciBmbiA9IG9uY2UoZnVuY3Rpb24oKSB7XG5cdFx0XHRzZWxmLm9mZihuYW1lLCBmbik7XG5cdFx0XHRjYWxsYmFjay5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdH0pO1xuXHRcdGZuLl9jYWxsYmFjayA9IGNhbGxiYWNrO1xuXHRcdHJldHVybiB0aGlzLm9uKG5hbWUsIGZuLCBjb250ZXh0KTtcblx0fSxcblxuXHQvLyBSZW1vdmUgb25lIG9yIG1hbnkgY2FsbGJhY2tzLiBJZiBgY29udGV4dGAgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcblx0Ly8gY2FsbGJhY2tzIHdpdGggdGhhdCBmdW5jdGlvbi4gSWYgYGNhbGxiYWNrYCBpcyBudWxsLCByZW1vdmVzIGFsbFxuXHQvLyBjYWxsYmFja3MgZm9yIHRoZSBldmVudC4gSWYgYG5hbWVgIGlzIG51bGwsIHJlbW92ZXMgYWxsIGJvdW5kXG5cdC8vIGNhbGxiYWNrcyBmb3IgYWxsIGV2ZW50cy5cblx0b2ZmOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdHZhciByZXRhaW4sIGV2LCBldmVudHMsIG5hbWVzLCBpLCBsLCBqLCBrO1xuXHRcdGlmICghdGhpcy5fZXZlbnRzIHx8ICFldmVudHNBcGkodGhpcywgJ29mZicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pKSByZXR1cm4gdGhpcztcblx0XHRpZiAoIW5hbWUgJiYgIWNhbGxiYWNrICYmICFjb250ZXh0KSB7XG5cdFx0XHR0aGlzLl9ldmVudHMgPSB2b2lkIDA7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0bmFtZXMgPSBuYW1lID8gW25hbWVdIDogT2JqZWN0LmtleXModGhpcy5fZXZlbnRzKTtcblx0XHRmb3IgKGkgPSAwLCBsID0gbmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRuYW1lID0gbmFtZXNbaV07XG5cdFx0XHRpZiAoZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdKSB7XG5cdFx0XHRcdHRoaXMuX2V2ZW50c1tuYW1lXSA9IHJldGFpbiA9IFtdO1xuXHRcdFx0XHRpZiAoY2FsbGJhY2sgfHwgY29udGV4dCkge1xuXHRcdFx0XHRcdGZvciAoaiA9IDAsIGsgPSBldmVudHMubGVuZ3RoOyBqIDwgazsgaisrKSB7XG5cdFx0XHRcdFx0XHRldiA9IGV2ZW50c1tqXTtcblx0XHRcdFx0XHRcdGlmICgoY2FsbGJhY2sgJiYgY2FsbGJhY2sgIT09IGV2LmNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjay5fY2FsbGJhY2spIHx8XG5cdFx0XHRcdFx0XHRcdFx0KGNvbnRleHQgJiYgY29udGV4dCAhPT0gZXYuY29udGV4dCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0YWluLnB1c2goZXYpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXJldGFpbi5sZW5ndGgpIGRlbGV0ZSB0aGlzLl9ldmVudHNbbmFtZV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gVHJpZ2dlciBvbmUgb3IgbWFueSBldmVudHMsIGZpcmluZyBhbGwgYm91bmQgY2FsbGJhY2tzLiBDYWxsYmFja3MgYXJlXG5cdC8vIHBhc3NlZCB0aGUgc2FtZSBhcmd1bWVudHMgYXMgYHRyaWdnZXJgIGlzLCBhcGFydCBmcm9tIHRoZSBldmVudCBuYW1lXG5cdC8vICh1bmxlc3MgeW91J3JlIGxpc3RlbmluZyBvbiBgXCJhbGxcImAsIHdoaWNoIHdpbGwgY2F1c2UgeW91ciBjYWxsYmFjayB0b1xuXHQvLyByZWNlaXZlIHRoZSB0cnVlIG5hbWUgb2YgdGhlIGV2ZW50IGFzIHRoZSBmaXJzdCBhcmd1bWVudCkuXG5cdHRyaWdnZXI6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRpZiAoIXRoaXMuX2V2ZW50cykgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICd0cmlnZ2VyJywgbmFtZSwgYXJncykpIHJldHVybiB0aGlzO1xuXHRcdHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV07XG5cdFx0dmFyIGFsbEV2ZW50cyA9IHRoaXMuX2V2ZW50cy5hbGw7XG5cdFx0aWYgKGV2ZW50cykgdHJpZ2dlckV2ZW50cyhldmVudHMsIGFyZ3MpO1xuXHRcdGlmIChhbGxFdmVudHMpIHRyaWdnZXJFdmVudHMoYWxsRXZlbnRzLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIFRlbGwgdGhpcyBvYmplY3QgdG8gc3RvcCBsaXN0ZW5pbmcgdG8gZWl0aGVyIHNwZWNpZmljIGV2ZW50cyAuLi4gb3Jcblx0Ly8gdG8gZXZlcnkgb2JqZWN0IGl0J3MgY3VycmVudGx5IGxpc3RlbmluZyB0by5cblx0c3RvcExpc3RlbmluZzogZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuXHRcdHZhciBsaXN0ZW5pbmdUbyA9IHRoaXMuX2xpc3RlbmluZ1RvO1xuXHRcdGlmICghbGlzdGVuaW5nVG8pIHJldHVybiB0aGlzO1xuXHRcdHZhciByZW1vdmUgPSAhbmFtZSAmJiAhY2FsbGJhY2s7XG5cdFx0aWYgKCFjYWxsYmFjayAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcblx0XHRpZiAob2JqKSAobGlzdGVuaW5nVG8gPSB7fSlbb2JqLl9saXN0ZW5JZF0gPSBvYmo7XG5cdFx0Zm9yICh2YXIgaWQgaW4gbGlzdGVuaW5nVG8pIHtcblx0XHRcdG9iaiA9IGxpc3RlbmluZ1RvW2lkXTtcblx0XHRcdG9iai5vZmYobmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuXHRcdFx0aWYgKHJlbW92ZSB8fCBpc0VtcHR5KG9iai5fZXZlbnRzKSkgZGVsZXRlIHRoaXMuX2xpc3RlbmluZ1RvW2lkXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxufTtcblxuLy8gUmVndWxhciBleHByZXNzaW9uIHVzZWQgdG8gc3BsaXQgZXZlbnQgc3RyaW5ncy5cbnZhciBldmVudFNwbGl0dGVyID0gL1xccysvO1xuXG4vLyBJbXBsZW1lbnQgZmFuY3kgZmVhdHVyZXMgb2YgdGhlIEV2ZW50cyBBUEkgc3VjaCBhcyBtdWx0aXBsZSBldmVudFxuLy8gbmFtZXMgYFwiY2hhbmdlIGJsdXJcImAgYW5kIGpRdWVyeS1zdHlsZSBldmVudCBtYXBzIGB7Y2hhbmdlOiBhY3Rpb259YFxuLy8gaW4gdGVybXMgb2YgdGhlIGV4aXN0aW5nIEFQSS5cbnZhciBldmVudHNBcGkgPSBmdW5jdGlvbihvYmosIGFjdGlvbiwgbmFtZSwgcmVzdCkge1xuXHRpZiAoIW5hbWUpIHJldHVybiB0cnVlO1xuXG5cdC8vIEhhbmRsZSBldmVudCBtYXBzLlxuXHRpZiAodHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIG5hbWUpIHtcblx0XHRcdG9ialthY3Rpb25dLmFwcGx5KG9iaiwgW2tleSwgbmFtZVtrZXldXS5jb25jYXQocmVzdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBIYW5kbGUgc3BhY2Ugc2VwYXJhdGVkIGV2ZW50IG5hbWVzLlxuXHRpZiAoZXZlbnRTcGxpdHRlci50ZXN0KG5hbWUpKSB7XG5cdFx0dmFyIG5hbWVzID0gbmFtZS5zcGxpdChldmVudFNwbGl0dGVyKTtcblx0XHRmb3IgKHZhciBpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0b2JqW2FjdGlvbl0uYXBwbHkob2JqLCBbbmFtZXNbaV1dLmNvbmNhdChyZXN0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBkaWZmaWN1bHQtdG8tYmVsaWV2ZSwgYnV0IG9wdGltaXplZCBpbnRlcm5hbCBkaXNwYXRjaCBmdW5jdGlvbiBmb3Jcbi8vIHRyaWdnZXJpbmcgZXZlbnRzLiBUcmllcyB0byBrZWVwIHRoZSB1c3VhbCBjYXNlcyBzcGVlZHkgKG1vc3QgaW50ZXJuYWxcbi8vIEJhY2tib25lIGV2ZW50cyBoYXZlIDMgYXJndW1lbnRzKS5cbnZhciB0cmlnZ2VyRXZlbnRzID0gZnVuY3Rpb24oZXZlbnRzLCBhcmdzKSB7XG5cdHZhciBldiwgaSA9IC0xLCBsID0gZXZlbnRzLmxlbmd0aCwgYTEgPSBhcmdzWzBdLCBhMiA9IGFyZ3NbMV0sIGEzID0gYXJnc1syXTtcblx0c3dpdGNoIChhcmdzLmxlbmd0aCkge1xuXHRcdGNhc2UgMDogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgpOyByZXR1cm47XG5cdFx0Y2FzZSAxOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEpOyByZXR1cm47XG5cdFx0Y2FzZSAyOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyKTsgcmV0dXJuO1xuXHRcdGNhc2UgMzogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMiwgYTMpOyByZXR1cm47XG5cdFx0ZGVmYXVsdDogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suYXBwbHkoZXYuY3R4LCBhcmdzKTsgcmV0dXJuO1xuXHR9XG59O1xuXG52YXIgbGlzdGVuTWV0aG9kcyA9IHtsaXN0ZW5UbzogJ29uJywgbGlzdGVuVG9PbmNlOiAnb25jZSd9O1xuXG4vLyBJbnZlcnNpb24tb2YtY29udHJvbCB2ZXJzaW9ucyBvZiBgb25gIGFuZCBgb25jZWAuIFRlbGwgKnRoaXMqIG9iamVjdCB0b1xuLy8gbGlzdGVuIHRvIGFuIGV2ZW50IGluIGFub3RoZXIgb2JqZWN0IC4uLiBrZWVwaW5nIHRyYWNrIG9mIHdoYXQgaXQnc1xuLy8gbGlzdGVuaW5nIHRvLlxudXRpbC5lYWNoKGxpc3Rlbk1ldGhvZHMsIGZ1bmN0aW9uKGltcGxlbWVudGF0aW9uLCBtZXRob2QpIHtcblx0RXZlbnRzW21ldGhvZF0gPSBmdW5jdGlvbihvYmosIG5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0dmFyIGxpc3RlbmluZ1RvID0gdGhpcy5fbGlzdGVuaW5nVG8gfHwgKHRoaXMuX2xpc3RlbmluZ1RvID0ge30pO1xuXHRcdHZhciBpZCA9IG9iai5fbGlzdGVuSWQgfHwgKG9iai5fbGlzdGVuSWQgPSB1dGlsLnVuaXF1ZUlkKCdsJykpO1xuXHRcdGxpc3RlbmluZ1RvW2lkXSA9IG9iajtcblx0XHRpZiAoIWNhbGxiYWNrICYmIHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JykgY2FsbGJhY2sgPSB0aGlzO1xuXHRcdG9ialtpbXBsZW1lbnRhdGlvbl0obmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xufSk7XG5cbi8vIEFsaWFzZXMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuRXZlbnRzLmJpbmQgICA9IEV2ZW50cy5vbjtcbkV2ZW50cy51bmJpbmQgPSBFdmVudHMub2ZmO1xuXG5mdW5jdGlvbiBpc0VtcHR5KG9iaikge1xuXHRpZiAob2JqID09IG51bGwpIHJldHVybiB0cnVlO1xuXHRpZiAoQXJyYXkuaXNBcnJheShvYmopIHx8IHR5cGVvZiBvYmogPT09IFwic3RyaW5nXCIpIHJldHVybiBvYmoubGVuZ3RoID09PSAwO1xuXHRmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAodXRpbC5oYXMob2JqLCBrZXkpKSByZXR1cm4gZmFsc2U7XG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBvbmNlKGZ1bmMpIHtcblx0dmFyIHJhbiA9IGZhbHNlLCBtZW1vO1xuXHRyZXR1cm4gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHJhbikgcmV0dXJuIG1lbW87XG5cdFx0cmFuID0gdHJ1ZTtcblx0XHRtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdGZ1bmMgPSBudWxsO1xuXHRcdHJldHVybiBtZW1vO1xuXHR9XG59IiwidmFyIEJpbmRpbmcgPSByZXF1aXJlKFwiLi9iaW5kaW5nXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBCaW5kaW5nLmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbih2YWx1ZSkge1xuXHRcdEJpbmRpbmcuY2FsbCh0aGlzKTtcblx0XHR0aGlzLm5vZGVzID0gW107XG5cdFx0dGhpcy5zZXRWYWx1ZSh2YWx1ZSk7XG5cdH0sXG5cblx0aW5zZXJ0QmVmb3JlOiBmdW5jdGlvbigpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJIVE1MIGJpbmRpbmdzIGNhbid0IGhhdmUgY2hpbGRyZW4uXCIpO1xuXHR9LFxuXG5cdHVwZGF0ZU5vZGVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgcGFyZW50Tm9kZSA9IHRoaXMucGFyZW50Tm9kZSxcblx0XHRcdGJlZm9yZU5vZGUsIG5vZGUsIGk7XG5cblx0XHQvLyBwbGFjZSB0aGUgbm9kZXMgaW4gdGhlIGRvbVxuXHRcdGlmIChwYXJlbnROb2RlICE9IG51bGwpIHtcblx0XHRcdGJlZm9yZU5vZGUgPSB0aGlzLm5leHRTaWJsaW5nTm9kZTtcblxuXHRcdFx0Zm9yIChpID0gdGhpcy5ub2Rlcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRub2RlID0gdGhpcy5ub2Rlc1tpXTtcblxuXHRcdFx0XHRpZiAoIXV0aWwuaXNOb2RlQXRET01Qb3NpdGlvbihub2RlLCBwYXJlbnROb2RlLCBiZWZvcmVOb2RlKSkge1xuXHRcdFx0XHRcdHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKG5vZGUsIGJlZm9yZU5vZGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YmVmb3JlTm9kZSA9IG5vZGU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gb3IgdGFrZSB0aGVtIG91dFxuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5yZW1vdmVOb2RlcygpO1xuXHRcdH1cblxuXHRcdHRoaXMudHJpZ2dlcihcInVwZGF0ZVwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIG5vZGUsIGk7XG5cblx0XHRmb3IgKGkgPSAwOyBpIDwgdGhpcy5ub2Rlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0bm9kZSA9IHRoaXMubm9kZXNbaV07XG5cdFx0XHRpZiAobm9kZS5wYXJlbnROb2RlICE9IG51bGwpIG5vZGUucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChub2RlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRzZXRWYWx1ZTogZnVuY3Rpb24odmFsKSB7XG5cdFx0dmFsID0gdmFsICE9IG51bGwgPyB2YWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0aWYgKHZhbCA9PT0gdGhpcy52YWx1ZSkgcmV0dXJuIHRoaXM7XG5cblx0XHR0aGlzLnJlbW92ZU5vZGVzKCk7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbDtcblxuXHRcdC8vIGNvbnZlcnQgaHRtbCBpbnRvIERPTSBub2Rlc1xuXHRcdGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdFx0ZGl2LmlubmVySFRNTCA9IHZhbDtcblx0XHR0aGlzLm5vZGVzID0gdXRpbC50b0FycmF5KGRpdi5jaGlsZE5vZGVzKTtcblxuXHRcdHRoaXMudXBkYXRlTm9kZXMoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHR0b05vZGVzOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlcy5zbGljZSgwKTtcblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGVzWzBdIHx8IG51bGw7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgaywgbm9kZSwgcmVzdWx0O1xuXG5cdFx0Zm9yIChrIGluIHRoaXMubm9kZXMpIHtcblx0XHRcdG5vZGUgPSB0aGlzLm5vZGVzW2tdO1xuXHRcdFx0aWYgKG5vZGUubm9kZVR5cGUgIT09IDEpIGNvbnRpbnVlO1xuXG5cdFx0XHRpZiAodXRpbC5tYXRjaGVzU2VsZWN0b3Iobm9kZSwgc2VsZWN0b3IpKSByZXR1cm4gbm9kZTtcblx0XHRcdHJlc3VsdCA9IG5vZGUucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdFx0XHRpZiAocmVzdWx0ICE9IG51bGwpIHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgaywgbm9kZSwgZWxzID0gW107XG5cblx0XHRmb3IgKGsgaW4gdGhpcy5ub2Rlcykge1xuXHRcdFx0bm9kZSA9IHRoaXMubm9kZXNba107XG5cdFx0XHRpZiAobm9kZS5ub2RlVHlwZSAhPT0gMSkgY29udGludWU7XG5cblx0XHRcdGlmICh1dGlsLm1hdGNoZXNTZWxlY3Rvcihub2RlLCBzZWxlY3RvcikpIG1hdGNoZXMucHVzaChub2RlKTtcblx0XHRcdGVscy5wdXNoLmFwcGx5KGVscywgdXRpbC50b0FycmF5KG5vZGUucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxzO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlcy5tYXAoZnVuY3Rpb24obm9kZSkge1xuXHRcdFx0cmV0dXJuIG5vZGUubm9kZVR5cGUgPT09IDEgPyBub2RlLm91dGVySFRNTCA6IG5vZGUubm9kZVZhbHVlO1xuXHRcdH0pLmpvaW4oXCJcIik7XG5cdH1cbn0pO1xuIiwidmFyIEJpbmRpbmcgPSByZXF1aXJlKFwiLi9iaW5kaW5nXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxuLy8gZXhwb3J0XG52YXIgVGVtcGxlID1cbm1vZHVsZS5leHBvcnRzID0gQmluZGluZy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oKSB7XG5cdFx0QmluZGluZy5jYWxsKHRoaXMpO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9LFxuXHRpbml0aWFsaXplOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLmFwcGVuZCh1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSk7XG5cdH1cbn0pO1xuXG4vLyBzdGF0aWMgcHJvcGVydGllcy9tZXRob2RzXG5UZW1wbGUuVkVSU0lPTiA9IFwiMC4zLjJcIjtcblRlbXBsZS51dGlsID0gdXRpbDtcblRlbXBsZS5FdmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIik7XG5UZW1wbGUuQmluZGluZyA9IEJpbmRpbmc7XG5cbi8vIGRlcHMgc2V0dXBcbnZhciBEZXBzID0gVGVtcGxlLkRlcHMgPSByZXF1aXJlKFwiLi9kZXBzXCIpO1xuVGVtcGxlLmF1dG9ydW4gPSBEZXBzLmF1dG9ydW47XG5UZW1wbGUubm9ucmVhY3RpdmUgPSBEZXBzLm5vbnJlYWN0aXZlO1xuVGVtcGxlLkRlcGVuZGVuY3kgPSBEZXBzLkRlcGVuZGVuY3k7IiwidmFyIEJpbmRpbmcgPSByZXF1aXJlKFwiLi9iaW5kaW5nXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxudmFyIE5vZGUgPVxuZXhwb3J0cy5Ob2RlID0gQmluZGluZy5leHRlbmQoe1xuXHR1cGRhdGVOb2RlczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHBhcmVudE5vZGUgPSB0aGlzLnBhcmVudE5vZGUsXG5cdFx0XHRiZWZvcmVOb2RlID0gdGhpcy5uZXh0U2libGluZ05vZGU7XG5cblx0XHQvLyBwbGFjZSB0aGUgbm9kZSBpbiB0aGUgZG9tXG5cdFx0aWYgKHBhcmVudE5vZGUgIT0gbnVsbCAmJiAhdXRpbC5pc05vZGVBdERPTVBvc2l0aW9uKHRoaXMubm9kZSwgcGFyZW50Tm9kZSwgYmVmb3JlTm9kZSkpIHtcblx0XHRcdHBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKHRoaXMubm9kZSwgYmVmb3JlTm9kZSk7XG5cdFx0fVxuXG5cdFx0Ly8gb3IgdGFrZSBpdCBvdXRcblx0XHRlbHNlIGlmIChwYXJlbnROb2RlID09IG51bGwgJiYgdGhpcy5ub2RlLnBhcmVudE5vZGUgIT0gbnVsbCkge1xuXHRcdFx0dGhpcy5ub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodGhpcy5ub2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLnRyaWdnZXIoXCJ1cGRhdGVcIik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0dG9Ob2RlczogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIFsgdGhpcy5ub2RlIF07XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbnVsbDsgfSxcblx0ZmluZEFsbDogZnVuY3Rpb24oKSB7IHJldHVybiBbXTsgfVxufSk7XG5cbnZhciBUZXh0ID1cbmV4cG9ydHMuVGV4dCA9IE5vZGUuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKG5vZGVPclZhbHVlKSB7XG5cdFx0Ly8gdGV4dCBub2RlXG5cdFx0aWYgKG5vZGVPclZhbHVlIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUgJiYgbm9kZU9yVmFsdWUubm9kZVR5cGUgPT09IDMpIHtcblx0XHRcdHRoaXMubm9kZSA9IG5vZGVPclZhbHVlO1xuXHRcdFx0dGhpcy52YWx1ZSA9IG5vZGVPclZhbHVlLm5vZGVWYWx1ZTtcblx0XHR9XG5cblx0XHQvLyBhbnl0aGluZyBlbHNlXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLm5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblx0XHRcdHRoaXMuc2V0VmFsdWUobm9kZU9yVmFsdWUpO1xuXHRcdH1cblxuXHRcdE5vZGUuY2FsbCh0aGlzKTtcblx0fSxcblxuXHRpbnNlcnRCZWZvcmU6IGZ1bmN0aW9uKCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIlRleHQgYmluZGluZ3MgY2FuJ3QgaGF2ZSBjaGlsZHJlbi5cIik7XG5cdH0sXG5cblx0c2V0VmFsdWU6IGZ1bmN0aW9uKHZhbHVlKSB7XG5cdFx0dmFsdWUgPSB2YWx1ZSAhPSBudWxsID8gdmFsdWUudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0aWYgKHZhbHVlICE9PSB0aGlzLm5vZGUubm9kZVZhbHVlKSB0aGlzLm5vZGUubm9kZVZhbHVlID0gdmFsdWU7XG5cdFx0dGhpcy52YWx1ZSA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHRvU3RyaW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLm5vZGVWYWx1ZTtcblx0fVxufSk7XG5cbnZhciBDb21tZW50ID1cbmV4cG9ydHMuQ29tbWVudCA9IE5vZGUuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKG5vZGVPclZhbHVlKSB7XG5cdFx0Ly8gY29tbWVudCBub2RlXG5cdFx0aWYgKG5vZGVPclZhbHVlIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUgJiYgbm9kZU9yVmFsdWUubm9kZVR5cGUgPT09IDgpIHtcblx0XHRcdHRoaXMubm9kZSA9IG5vZGVPclZhbHVlO1xuXHRcdFx0dGhpcy52YWx1ZSA9IG5vZGVPclZhbHVlLm5vZGVWYWx1ZTtcblx0XHR9XG5cblx0XHQvLyBhbnl0aGluZyBlbHNlXG5cdFx0ZWxzZSB7XG5cdFx0XHR0aGlzLm5vZGUgPSBkb2N1bWVudC5jcmVhdGVDb21tZW50KFwiXCIpO1xuXHRcdFx0dGhpcy5zZXRWYWx1ZShub2RlT3JWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0Tm9kZS5jYWxsKHRoaXMpO1xuXHR9LFxuXG5cdGluc2VydEJlZm9yZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ29tbWVudCBiaW5kaW5ncyBjYW4ndCBoYXZlIGNoaWxkcmVuLlwiKTtcblx0fSxcblxuXHRzZXRWYWx1ZTogZnVuY3Rpb24odmFsdWUpIHtcblx0XHR2YWx1ZSA9IHZhbHVlICE9IG51bGwgPyB2YWx1ZS50b1N0cmluZygpIDogXCJcIjtcblx0XHRpZiAodmFsdWUgIT09IHRoaXMubm9kZS5ub2RlVmFsdWUpIHRoaXMubm9kZS5ub2RlVmFsdWUgPSB2YWx1ZTtcblx0XHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUubm9kZVZhbHVlO1xuXHR9XG59KTtcblxudmFyIEVsZW1lbnQgPVxuZXhwb3J0cy5FbGVtZW50ID0gTm9kZS5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24obm9kZU9yVGFnTmFtZSkge1xuXHRcdHZhciBjaGlsZHJlbiA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xuXG5cdFx0Ly8gZWxlbWVudFxuXHRcdGlmIChub2RlT3JUYWdOYW1lIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUgJiYgbm9kZU9yVGFnTmFtZS5ub2RlVHlwZSA9PT0gMSkge1xuXHRcdFx0dGhpcy5ub2RlID0gbm9kZU9yVGFnTmFtZTtcblx0XHRcdHRoaXMudGFnbmFtZSA9IG5vZGVPclRhZ05hbWUudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG5cdFx0XHQvLyBhZGQgY2hpbGQgbm9kZXMgYXMgZnVydGhlciBjaGlsZHJlblxuXHRcdFx0Ly8gbm90ZTogdGhpcyBtYXkgYWZmZWN0IHRoZSBvcmlnaW5hbCBub2RlJ3MgY2hpbGRyZW5cblx0XHRcdGZyb21Ob2RlKHV0aWwudG9BcnJheShub2RlT3JUYWdOYW1lLmNoaWxkTm9kZXMpKVxuXHRcdFx0XHQuZm9yRWFjaChmdW5jdGlvbihiKSB7IGNoaWxkcmVuLnB1c2goYik7IH0pO1xuXHRcdH1cblxuXHRcdC8vIHN0cmluZ1xuXHRcdGVsc2UgaWYgKHR5cGVvZiBub2RlT3JUYWdOYW1lID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHR0aGlzLnRhZ25hbWUgPSBub2RlT3JUYWdOYW1lO1xuXHRcdFx0dGhpcy5ub2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChub2RlT3JUYWdOYW1lKTtcblx0XHR9XG5cblx0XHQvLyBvciBlcnJvclxuXHRcdGVsc2UgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgZWxlbWVudCB0YWcgbmFtZS5cIik7XG5cblx0XHROb2RlLmFwcGx5KHRoaXMsIGNoaWxkcmVuKTtcblx0fSxcblxuXHRnZXRBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLmdldEF0dHJpYnV0ZShuYW1lKTtcblx0fSxcblxuXHRzZXRBdHRyaWJ1dGU6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG5cdFx0dGhpcy5ub2RlLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQXR0cmlidXRlOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dGhpcy5ub2RlLnJlbW92ZUF0dHJpYnV0ZShuYW1lKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhdHRyOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KG5hbWUpICYmIHZhbHVlID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaChuYW1lLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMuYXR0cihuLCB2KTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdGhpcy5nZXRBdHRyaWJ1dGUobmFtZSk7XG5cdFx0ZWxzZSB0aGlzLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRwcm9wOiBmdW5jdGlvbihuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KG5hbWUpICYmIHZhbHVlID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaChuYW1lLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMucHJvcChuLCB2KTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm4gdGhpcy5ub2RlW25hbWVdO1xuXHRcdGVsc2UgdGhpcy5ub2RlW25hbWVdID0gdmFsdWU7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRzdHlsZTogZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcblx0XHRpZiAodXRpbC5pc09iamVjdChuYW1lKSAmJiB2YWx1ZSA9PSBudWxsKSB7XG5cdFx0XHR1dGlsLmVhY2gobmFtZSwgZnVuY3Rpb24odiwgbikgeyB0aGlzLnN0eWxlKG4sIHYpOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybiBnZXRDb21wdXRlZFN0eWxlKHRoaXMubm9kZSlbbmFtZV07XG5cdFx0ZWxzZSB0aGlzLm5vZGUuc3R5bGVbbmFtZV0gPSB2YWx1ZTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGhhc0NsYXNzOiBmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlLmNsYXNzTGlzdC5jb250YWlucyhjbGFzc05hbWUpO1xuXHR9LFxuXG5cdGFkZENsYXNzOiBmdW5jdGlvbigpIHtcblx0XHR1dGlsLmZsYXR0ZW4odXRpbC50b0FycmF5KGFyZ3VtZW50cykpLmZvckVhY2goZnVuY3Rpb24oY2xhc3NOYW1lKSB7XG5cdFx0XHR0aGlzLm5vZGUuY2xhc3NMaXN0LmFkZChjbGFzc05hbWUpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQ2xhc3M6IGZ1bmN0aW9uKCkge1xuXHRcdHV0aWwuZmxhdHRlbih1dGlsLnRvQXJyYXkoYXJndW1lbnRzKSkuZm9yRWFjaChmdW5jdGlvbihjbGFzc05hbWUpIHtcblx0XHRcdHRoaXMubm9kZS5jbGFzc0xpc3QucmVtb3ZlKGNsYXNzTmFtZSk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhZGRFdmVudExpc3RlbmVyOiBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuXHRcdGlmICh1dGlsLmlzT2JqZWN0KHR5cGUpICYmIGxpc3RlbmVyID09IG51bGwpIHtcblx0XHRcdHV0aWwuZWFjaCh0eXBlLCBmdW5jdGlvbih2LCBuKSB7IHRoaXMuYWRkRXZlbnRMaXN0ZW5lcihuLCB2KTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHR0aGlzLm5vZGUuYWRkRXZlbnRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcik7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlRXZlbnRMaXN0ZW5lcjogZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcblx0XHRpZiAodXRpbC5pc09iamVjdCh0eXBlKSAmJiBsaXN0ZW5lciA9PSBudWxsKSB7XG5cdFx0XHR1dGlsLmVhY2godHlwZSwgZnVuY3Rpb24odiwgbikgeyB0aGlzLnJlbW92ZUV2ZW50TGlzdGVuZXIobiwgdik7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0dGhpcy5ub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIodHlwZSwgbGlzdGVuZXIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0aWYgKHV0aWwubWF0Y2hlc1NlbGVjdG9yKHRoaXMubm9kZSwgc2VsZWN0b3IpKSByZXR1cm4gdGhpcy5ub2RlO1xuXHRcdHJldHVybiB0aGlzLm5vZGUucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgZWxzID0gW107XG5cdFx0aWYgKHV0aWwubWF0Y2hlc1NlbGVjdG9yKHRoaXMubm9kZSwgc2VsZWN0b3IpKSBlbHMucHVzaCh0aGlzLm5vZGUpO1xuXHRcdGVscy5wdXNoLmFwcGx5KGVscywgdXRpbC50b0FycmF5KHRoaXMubm9kZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSkpO1xuXHRcdHJldHVybiBlbHM7XG5cdH0sXG5cblx0dG9TdHJpbmc6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm5vZGUub3V0ZXJIVE1MO1xuXHR9XG59KTtcblxuLy8gZmFzdCBjb25zdHJ1Y3RvcnMgZm9yIHR5cGljYWwgRE9NIGVsZW1lbnQgdGFnbmFtZXNcbmV4cG9ydHMuRE9NID0ge307XG5cblsgLy8gSFRNTCB0YWduYW1lczsgdGhpcyBsaXN0IGlzIHRha2VuIGZyb20gRkIncyBSZWFjdFxuXG5cImFcIiwgXCJhYmJyXCIsIFwiYWRkcmVzc1wiLCBcImFyZWFcIiwgXCJhcnRpY2xlXCIsIFwiYXNpZGVcIiwgXCJhdWRpb1wiLCBcImJcIiwgXCJiYXNlXCIsIFwiYmRpXCIsXG5cImJkb1wiLCBcImJpZ1wiLCBcImJsb2NrcXVvdGVcIiwgXCJib2R5XCIsIFwiYnJcIiwgXCJidXR0b25cIiwgXCJjYW52YXNcIiwgXCJjYXB0aW9uXCIsIFwiY2l0ZVwiLFxuXCJjb2RlXCIsIFwiY29sXCIsIFwiY29sZ3JvdXBcIiwgXCJkYXRhXCIsIFwiZGF0YWxpc3RcIiwgXCJkZFwiLCBcImRlbFwiLCBcImRldGFpbHNcIiwgXCJkZm5cIixcblwiZGl2XCIsIFwiZGxcIiwgXCJkdFwiLCBcImVtXCIsIFwiZW1iZWRcIiwgXCJmaWVsZHNldFwiLCBcImZpZ2NhcHRpb25cIiwgXCJmaWd1cmVcIiwgXCJmb290ZXJcIixcblwiZm9ybVwiLCBcImgxXCIsIFwiaDJcIiwgXCJoM1wiLCBcImg0XCIsIFwiaDVcIiwgXCJoNlwiLCBcImhlYWRcIiwgXCJoZWFkZXJcIiwgXCJoclwiLCBcImh0bWxcIiwgXCJpXCIsXG5cImlmcmFtZVwiLCBcImltZ1wiLCBcImlucHV0XCIsIFwiaW5zXCIsIFwia2JkXCIsIFwia2V5Z2VuXCIsIFwibGFiZWxcIiwgXCJsZWdlbmRcIiwgXCJsaVwiLFxuXCJsaW5rXCIsIFwibWFpblwiLCBcIm1hcFwiLCBcIm1hcmtcIiwgXCJtZW51XCIsIFwibWVudWl0ZW1cIiwgXCJtZXRhXCIsIFwibWV0ZXJcIiwgXCJuYXZcIixcblwibm9zY3JpcHRcIiwgXCJvYmplY3RcIiwgXCJvbFwiLCBcIm9wdGdyb3VwXCIsIFwib3B0aW9uXCIsIFwib3V0cHV0XCIsIFwicFwiLCBcInBhcmFtXCIsIFwicHJlXCIsXG5cInByb2dyZXNzXCIsIFwicVwiLCBcInJwXCIsIFwicnRcIiwgXCJydWJ5XCIsIFwic1wiLCBcInNhbXBcIiwgXCJzY3JpcHRcIiwgXCJzZWN0aW9uXCIsIFwic2VsZWN0XCIsXG5cInNtYWxsXCIsIFwic291cmNlXCIsIFwic3BhblwiLCBcInN0cm9uZ1wiLCBcInN0eWxlXCIsIFwic3ViXCIsIFwic3VtbWFyeVwiLCBcInN1cFwiLCBcInRhYmxlXCIsXG5cInRib2R5XCIsIFwidGRcIiwgXCJ0ZXh0YXJlYVwiLCBcInRmb290XCIsIFwidGhcIiwgXCJ0aGVhZFwiLCBcInRpbWVcIiwgXCJ0aXRsZVwiLCBcInRyXCIsXG5cInRyYWNrXCIsIFwidVwiLCBcInVsXCIsIFwidmFyXCIsIFwidmlkZW9cIiwgXCJ3YnJcIlxuXG5dLmZvckVhY2goZnVuY3Rpb24odCkge1xuXHRleHBvcnRzLkRPTVt0XSA9IEVsZW1lbnQuZXh0ZW5kKHtcblx0XHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgYXJncyA9IHV0aWwudG9BcnJheShhcmd1bWVudHMpO1xuXHRcdFx0YXJncy51bnNoaWZ0KHQpO1xuXHRcdFx0RWxlbWVudC5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHR9XG5cdH0pO1xufSk7XG5cbi8vIGNvbnZlcnRzIGRvbSBub2RlcyBpbnRvIGJpbmRpbmcgZXF1aXZhbGVudHNcbnZhciBmcm9tTm9kZSA9XG5leHBvcnRzLmZyb21Ob2RlID0gZnVuY3Rpb24obm9kZSkge1xuXHRpZiAoQXJyYXkuaXNBcnJheShub2RlKSkge1xuXHRcdHJldHVybiBub2RlLm1hcChmcm9tTm9kZSlcblx0XHRcdC5maWx0ZXIoZnVuY3Rpb24oYikgeyByZXR1cm4gYiAhPSBudWxsOyB9KTtcblx0fVxuXG5cdHN3aXRjaCAobm9kZS5ub2RlVHlwZSkge1xuXHRcdC8vIEVsZW1lbnRcblx0XHRjYXNlIDE6IHJldHVybiBuZXcgRWxlbWVudChub2RlKTtcblx0XHRcblx0XHQvLyBUZXh0IE5vZGVcblx0XHRjYXNlIDM6IHJldHVybiBuZXcgVGV4dChub2RlKTtcblx0XHRcblx0XHQvLyBDb21tZW50IE5vZGVcblx0XHRjYXNlIDg6IHJldHVybiBuZXcgQ29tbWVudChub2RlKTtcblxuXHRcdC8vIERvY3VtZW50IEZyYWdtZW50XG5cdFx0Y2FzZSAxMTpcblx0XHRcdHZhciBiaW5kaW5nID0gbmV3IEJpbmRpbmc7XG5cblx0XHRcdGZyb21Ob2RlKHV0aWwudG9BcnJheShub2RlLmNoaWxkTm9kZXMpKVxuXHRcdFx0XHQuZm9yRWFjaChiaW5kaW5nLmFwcGVuZENoaWxkLCBiaW5kaW5nKTtcblxuXHRcdFx0cmV0dXJuIGJpbmRpbmc7XG5cdH1cbn1cblxuLy8gY29udmVydHMgYSBzdHJpbmcgb2YgSFRNTCBpbnRvIGEgc2V0IG9mIHN0YXRpYyBiaW5kaW5nc1xuZXhwb3J0cy5mcm9tSFRNTCA9IGZ1bmN0aW9uKGh0bWwpIHtcblx0dmFyIGNvbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLFxuXHRcdGJpbmRpbmcgPSBuZXcgQmluZGluZztcblxuXHRjb250LmlubmVySFRNTCA9IGh0bWw7XG5cblx0ZnJvbU5vZGUodXRpbC50b0FycmF5KGNvbnQuY2hpbGROb2RlcykpXG5cdFx0LmZvckVhY2goYmluZGluZy5hcHBlbmRDaGlsZCwgYmluZGluZyk7XG5cblx0cmV0dXJuIGJpbmRpbmc7XG59IiwidmFyIHRvQXJyYXkgPVxuZXhwb3J0cy50b0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XG5cdHJldHVybiBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChvYmosIDApO1xufVxuXG52YXIgaGFzID1cbmV4cG9ydHMuaGFzID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcblx0cmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSk7XG59XG5cbnZhciBleHRlbmQgPVxuZXhwb3J0cy5leHRlbmQgPSBmdW5jdGlvbihvYmopIHtcblx0dG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpLmZvckVhY2goZnVuY3Rpb24obWl4aW4pIHtcblx0XHRpZiAoIW1peGluKSByZXR1cm47XG5cblx0XHRmb3IgKHZhciBrZXkgaW4gbWl4aW4pIHtcblx0XHRcdG9ialtrZXldID0gbWl4aW5ba2V5XTtcblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBvYmo7XG59XG5cbnZhciBlYWNoID1cbmV4cG9ydHMuZWFjaCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcblx0aWYgKG9iaiA9PSBudWxsKSByZXR1cm4gb2JqO1xuXG5cdGlmIChvYmouZm9yRWFjaCA9PT0gQXJyYXkucHJvdG90eXBlLmZvckVhY2gpIHtcblx0XHRvYmouZm9yRWFjaChpdGVyYXRvciwgY29udGV4dCk7XG5cdH0gZWxzZSBpZiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpIHtcblx0XHRmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtpXSwgaSwgb2JqKTtcblx0XHR9XG5cdH0gZWxzZSB7XG5cdFx0dmFyIGtleXMgPSBPYmplY3Qua2V5cyhvYmopO1xuXHRcdGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXlzW2ldXSwga2V5c1tpXSwgb2JqKTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgZmxhdHRlbiA9XG5leHBvcnRzLmZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgb3V0cHV0KSB7XG5cdGlmIChvdXRwdXQgPT0gbnVsbCkgb3V0cHV0ID0gW107XG5cblx0ZWFjaChpbnB1dCwgZnVuY3Rpb24odmFsdWUpIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIGZsYXR0ZW4odmFsdWUsIG91dHB1dCk7XG5cdFx0ZWxzZSBvdXRwdXQucHVzaCh2YWx1ZSk7XG5cdH0pO1xuXG5cdHJldHVybiBvdXRwdXQ7XG59XG5cbmV4cG9ydHMucGljayA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gZmxhdHRlbih0b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSkpXG5cblx0LnJlZHVjZShmdW5jdGlvbihub2JqLCBrZXkpIHtcblx0XHRub2JqW2tleV0gPSBvYmpba2V5XTtcblx0XHRyZXR1cm4gbm9iajtcblx0fSwge30pO1xufVxuXG52YXIgaXNPYmplY3QgPVxuZXhwb3J0cy5pc09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gb2JqID09PSBPYmplY3Qob2JqKTtcbn1cblxuZXhwb3J0cy51bmlxdWVJZCA9IChmdW5jdGlvbigpIHtcblx0dmFyIGlkID0gMDtcblx0cmV0dXJuIGZ1bmN0aW9uKHByZWZpeCkge1xuXHRcdHJldHVybiAocHJlZml4IHx8IFwiXCIpICsgKCsraWQpO1xuXHR9XG59KSgpO1xuXG4vLyB0aGUgc3ViY2xhc3NpbmcgZnVuY3Rpb24gZm91bmQgaW4gQmFja2JvbmVcbmV4cG9ydHMuc3ViY2xhc3MgPSBmdW5jdGlvbihwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuXHR2YXIgcGFyZW50ID0gdGhpcztcblx0dmFyIGNoaWxkO1xuXG5cdC8vIFRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiBmb3IgdGhlIG5ldyBzdWJjbGFzcyBpcyBlaXRoZXIgZGVmaW5lZCBieSB5b3Vcblx0Ly8gKHRoZSBcImNvbnN0cnVjdG9yXCIgcHJvcGVydHkgaW4geW91ciBgZXh0ZW5kYCBkZWZpbml0aW9uKSwgb3IgZGVmYXVsdGVkXG5cdC8vIGJ5IHVzIHRvIHNpbXBseSBjYWxsIHRoZSBwYXJlbnQncyBjb25zdHJ1Y3Rvci5cblx0aWYgKHByb3RvUHJvcHMgJiYgaGFzKHByb3RvUHJvcHMsICdjb25zdHJ1Y3RvcicpKSB7XG5cdFx0Y2hpbGQgPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdGNoaWxkID0gZnVuY3Rpb24oKXsgcmV0dXJuIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9O1xuXHR9XG5cblx0Ly8gQWRkIHN0YXRpYyBwcm9wZXJ0aWVzIHRvIHRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiwgaWYgc3VwcGxpZWQuXG5cdGV4dGVuZChjaGlsZCwgcGFyZW50LCBzdGF0aWNQcm9wcyk7XG5cblx0Ly8gU2V0IHRoZSBwcm90b3R5cGUgY2hhaW4gdG8gaW5oZXJpdCBmcm9tIGBwYXJlbnRgLCB3aXRob3V0IGNhbGxpbmdcblx0Ly8gYHBhcmVudGAncyBjb25zdHJ1Y3RvciBmdW5jdGlvbi5cblx0dmFyIFN1cnJvZ2F0ZSA9IGZ1bmN0aW9uKCl7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfTtcblx0U3Vycm9nYXRlLnByb3RvdHlwZSA9IHBhcmVudC5wcm90b3R5cGU7XG5cdGNoaWxkLnByb3RvdHlwZSA9IG5ldyBTdXJyb2dhdGU7XG5cblx0Ly8gQWRkIHByb3RvdHlwZSBwcm9wZXJ0aWVzIChpbnN0YW5jZSBwcm9wZXJ0aWVzKSB0byB0aGUgc3ViY2xhc3MsXG5cdC8vIGlmIHN1cHBsaWVkLlxuXHRpZiAocHJvdG9Qcm9wcykgZXh0ZW5kKGNoaWxkLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyk7XG5cblx0Ly8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZFxuXHQvLyBsYXRlci5cblx0Y2hpbGQuX19zdXBlcl9fID0gcGFyZW50LnByb3RvdHlwZTtcblxuXHRyZXR1cm4gY2hpbGQ7XG59XG5cbmV4cG9ydHMuaXNOb2RlQXRET01Qb3NpdGlvbiA9IGZ1bmN0aW9uKG5vZGUsIHBhcmVudCwgYmVmb3JlKSB7XG5cdHJldHVybiBub2RlLnBhcmVudE5vZGUgPT09IHBhcmVudCAmJiBub2RlLm5leHRTaWJsaW5nID09PSBiZWZvcmU7XG59XG5cbnZhciBtYXRjaGVzU2VsZWN0b3IgPSB0eXBlb2YgRWxlbWVudCAhPT0gXCJ1bmRlZmluZWRcIiA/XG5cdEVsZW1lbnQucHJvdG90eXBlLm1hdGNoZXMgfHxcblx0RWxlbWVudC5wcm90b3R5cGUud2Via2l0TWF0Y2hlc1NlbGVjdG9yIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLm1vek1hdGNoZXNTZWxlY3RvciB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS5tc01hdGNoZXNTZWxlY3RvciA6XG5cdGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH07XG5cbmV4cG9ydHMubWF0Y2hlc1NlbGVjdG9yID0gZnVuY3Rpb24oZWxlbSwgc2VsZWN0b3IpIHtcblx0cmV0dXJuIG1hdGNoZXNTZWxlY3Rvci5jYWxsKGVsZW0sIHNlbGVjdG9yKVxufVxuXG52YXIgRGVwcyA9IHJlcXVpcmUoXCIuL2RlcHNcIik7XG5cbnZhciBkZWZpbmVSZWFjdGl2ZVByb3BlcnR5ID1cbmV4cG9ydHMuZGVmaW5lUmVhY3RpdmVQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUsIGNvZXJjZSkge1xuXHRpZiAoIWlzT2JqZWN0KG9iaikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBvYmplY3QgdG8gZGVmaW5lIHRoZSByZWFjdGl2ZSBwcm9wZXJ0eSBvbi5cIik7XG5cdGlmICh0eXBlb2YgcHJvcCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgcHJvcGVydHkgbmFtZS5cIik7XG5cblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJmdW5jdGlvblwiICYmIGNvZXJjZSA9PSBudWxsKSB7XG5cdFx0Y29lcmNlID0gdmFsdWU7XG5cdFx0dmFsdWUgPSB2b2lkIDA7XG5cdH1cblxuXHRpZiAodHlwZW9mIGNvZXJjZSAhPT0gXCJmdW5jdGlvblwiKSBjb2VyY2UgPSBmdW5jdGlvbih2KSB7IHJldHVybiB2OyB9O1xuXG5cdC8vIHJ1bnMgdGhlIGNvZXJjaW9uIGZ1bmN0aW9uIG5vbi1yZWFjdGl2ZWx5IHRvIHByZXZlbnQgaW5maW5pdGUgbG9vcHNcblx0ZnVuY3Rpb24gcHJvY2Vzcyh2KSB7XG5cdFx0cmV0dXJuIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gY29lcmNlLmNhbGwob2JqLCB2LCBwcm9wLCBvYmopO1xuXHRcdH0pO1xuXHR9XG5cblx0dmFyIGRlcCA9IG5ldyBEZXBzLkRlcGVuZGVuY3k7XG5cdHZhbHVlID0gcHJvY2Vzcyh2YWx1ZSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHR2YWwgPSBwcm9jZXNzKHZhbCk7XG5cblx0XHRcdGlmICh2YWwgIT09IHZhbHVlKSB7XG5cdFx0XHRcdHZhbHVlID0gdmFsO1xuXHRcdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG9iajtcbn1cblxuZXhwb3J0cy5kZWZpbmVSZWFjdGl2ZVByb3BlcnRpZXMgPSBmdW5jdGlvbihvYmosIHByb3BzLCBjb2VyY2UpIHtcblx0Zm9yICh2YXIgcHJvcCBpbiBwcm9wcykge1xuXHRcdGRlZmluZVJlYWN0aXZlUHJvcGVydHkob2JqLCBwcm9wLCBwcm9wc1twcm9wXSwgY29lcmNlIHx8IGZhbHNlKTtcblx0fVxuXG5cdHJldHVybiBvYmo7XG59XG5cbnZhciBkZWZpbmVDb21wdXRlZFByb3BlcnR5ID1cbmV4cG9ydHMuZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUpIHtcblx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gXCJmdW5jdGlvblwiKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgY29tcHV0ZWQgcHJvcGVydHkgdmFsdWUuXCIpO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlLmNhbGwob2JqKTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnRzLmRlZmluZUNvbXB1dGVkUHJvcGVydGllcyA9IGZ1bmN0aW9uKG9iaiwgcHJvcHMpIHtcblx0T2JqZWN0LmtleXMocHJvcHMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0ZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eShvYmosIGtleSwgcHJvcHNba2V5XSk7XG5cdH0pO1xufVxuXG5leHBvcnRzLnJ1bklmRXhpc3RzID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0eXBlb2Ygb2JqW21ldGhvZF0gPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0cmV0dXJuIG9ialttZXRob2RdLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcblx0XHR9XG5cdH1cbn0iXX0=
(5)
});
