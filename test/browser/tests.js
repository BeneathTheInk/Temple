(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){


module.exports = Context;

function Context(value, parent, temple) {
	this.value = value;
	this.parent = parent;
	this.temple = temple;
	this.hidden = {};
}

Context.prototype.find = function(path, ctx) {
	if (ctx == null) ctx = this;
	val = this.temple._get(this.value, path, ctx);
	if (val == null) val = this.temple._get(this.hidden, path, ctx);
	return val;
}

Context.prototype.get = function(path) {
	var ctx = this, val;

	// don't traverse parents if specified
	if (typeof path === "string" && (path.indexOf(".") === 0 || path === "this" || path.indexOf("this.") === 0)) {
		if (path.indexOf("this") === 0) path = path.substr(4);
		if (path.indexOf(".") === 0) path = path.substr(1);
		val = this.find(path);
	} else {
		while (ctx != null) {
			val = ctx.find(path, this);
			if (val != null) break;
			ctx = ctx.parent;
		}
	}

	return val;
}

Context.prototype.spawn = function(val) {
	return new Context(val, this, this.temple);
}
},{}],2:[function(require,module,exports){
//////////////////////////////////////////////////
// Package docs at http://docs.meteor.com/#deps //
//////////////////////////////////////////////////

var Deps =
module.exports = {};

// http://docs.meteor.com/#deps_active
Deps.active = false;

// http://docs.meteor.com/#deps_currentcomputation
Deps.currentComputation = null;

var setCurrentComputation = function (c) {
  Deps.currentComputation = c;
  Deps.active = !! c;
};

// _assign is like _.extend or the upcoming Object.assign.
// Copy src's own, enumerable properties onto tgt and return
// tgt.
var _hasOwnProperty = Object.prototype.hasOwnProperty;
var _assign = function (tgt, src) {
  for (var k in src) {
    if (_hasOwnProperty.call(src, k))
      tgt[k] = src[k];
  }
  return tgt;
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

// Like `Meteor._noYieldsAllowed(function () { f(comp); })` but shorter,
// and doesn't clutter the stack with an extra frame on the client,
// where `_noYieldsAllowed` is a no-op.  `f` may be a computation
// function or an onInvalidate callback.
var callWithNoYieldsAllowed = function (f, comp) {
  if ((typeof Meteor === 'undefined') || Meteor.isClient) {
    f(comp);
  } else {
    Meteor._noYieldsAllowed(function () {
      f(comp);
    });
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
Deps.Computation = function (f, parent) {
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

_assign(Deps.Computation.prototype, {

  // http://docs.meteor.com/#computation_oninvalidate
  onInvalidate: function (f) {
    var self = this;

    if (typeof f !== 'function')
      throw new Error("onInvalidate requires a function");

    if (self.invalidated) {
      Deps.nonreactive(function () {
        callWithNoYieldsAllowed(f, self);
      });
    } else {
      self._onInvalidateCallbacks.push(f);
    }
  },

  // http://docs.meteor.com/#computation_invalidate
  invalidate: function () {
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
          callWithNoYieldsAllowed(f, self);
        });
      }
      self._onInvalidateCallbacks = [];
    }
  },

  // http://docs.meteor.com/#computation_stop
  stop: function () {
    if (! this.stopped) {
      this.stopped = true;
      this.invalidate();
    }
  },

  _compute: function () {
    var self = this;
    self.invalidated = false;

    var previous = Deps.currentComputation;
    setCurrentComputation(self);
    var previousInCompute = inCompute;
    inCompute = true;
    try {
      callWithNoYieldsAllowed(self._func, self);
    } finally {
      setCurrentComputation(previous);
      inCompute = false;
    }
  },

  _recompute: function () {
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
  }
});

//
// http://docs.meteor.com/#deps_dependency
//
Deps.Dependency = function () {
  this._dependentsById = {};
};

_assign(Deps.Dependency.prototype, {
  // http://docs.meteor.com/#dependency_depend
  //
  // Adds `computation` to this set if it is not already
  // present.  Returns true if `computation` is a new member of the set.
  // If no argument, defaults to currentComputation, or does nothing
  // if there is no currentComputation.
  depend: function (computation) {
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
  },

  // http://docs.meteor.com/#dependency_changed
  changed: function () {
    var self = this;
    for (var id in self._dependentsById)
      self._dependentsById[id].invalidate();
  },

  // http://docs.meteor.com/#dependency_hasdependents
  hasDependents: function () {
    var self = this;
    for(var id in self._dependentsById)
      return true;
    return false;
  }
});

_assign(Deps, {
  // http://docs.meteor.com/#deps_flush
  flush: function (_opts) {
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
            func();
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
  },

  // http://docs.meteor.com/#deps_autorun
  //
  // Run f(). Record its dependencies. Rerun it whenever the
  // dependencies change.
  //
  // Returns a new Computation, which is also passed to f.
  //
  // Links the computation to the current computation
  // so that it is stopped if the current computation is invalidated.
  autorun: function (f) {
    if (typeof f !== 'function')
      throw new Error('Deps.autorun requires a function argument');

    constructingComputation = true;
    var c = new Deps.Computation(f, Deps.currentComputation);

    if (Deps.active)
      Deps.onInvalidate(function () {
        c.stop();
      });

    return c;
  },

  // http://docs.meteor.com/#deps_nonreactive
  //
  // Run `f` with no current computation, returning the return value
  // of `f`.  Used to turn off reactivity for the duration of `f`,
  // so that reactive data sources accessed by `f` will not result in any
  // computations being invalidated.
  nonreactive: function (f) {
    var previous = Deps.currentComputation;
    setCurrentComputation(null);
    try {
      return f();
    } finally {
      setCurrentComputation(previous);
    }
  },

  // http://docs.meteor.com/#deps_oninvalidate
  onInvalidate: function (f) {
    if (! Deps.active)
      throw new Error("Deps.onInvalidate requires a currentComputation");

    Deps.currentComputation.onInvalidate(f);
  },

  // http://docs.meteor.com/#deps_afterflush
  afterFlush: function (f) {
    afterFlushCallbacks.push(f);
    requireFlush();
  }
});
},{}],3:[function(require,module,exports){
var parse = require("./parse"),
	util = require("./util"),
	_ = require("underscore"),
	NODE_TYPE = parse.NODE_TYPE;

exports.paint = function() {
	this.render();
}

exports.toHTML = function() {
	this.paint();
	
	var div = document.createElement("div");
	
	for (var i in this.nodes) {
		div.appendChild(this.nodes[i].cloneNode(true));
	}

	return div.innerHTML.trim();
}

exports.render = function() {
	if (this._rendered) return this.nodes;
	this.nodes = this._render();
	this._rendered = true;
	this.emit("render", this.nodes);
	return this;
}

exports._render = function(tokens) {
	if (tokens == null) tokens = parse(this.template);
	return this._buildElements(tokens);
}

exports._buildElements = function(tree, ctx) {
	if (ctx == null) ctx = this.createContext();

	return tree.map(function(node) {
		var build = this._build.element[node.type];
		if (build != null) return build.call(this, node, ctx);
		console.log(node);
	}, this).reduce(function(nodes, node) {
		return nodes.concat(Array.isArray(node) ? _.flatten(node) : node);
	}, []).filter(function(c) {
		return c != null;
	});
}

exports._buildAttribute = function(nodes, ctx) {
	return nodes.map(function(node) {
		var build = this._build.attribute[node.type];
		if (build != null) return build.call(this, node, ctx);
		console.log(node);
	}, this).join("");
}

var _build =
exports._build = {
	element: {},
	attribute: {}
}

_build.element[NODE_TYPE.ELEMENT] = function(node, ctx) {
	var el = document.createElement(node.name);
	
	node.attributes.forEach(function(attr) {
		el.setAttribute(attr.name, this._buildAttribute(attr.children, ctx));
	}, this);

	this._buildElements(node.children, ctx).forEach(function(child) {
		el.appendChild(child);
	});

	return el;
}

_build.element[NODE_TYPE.TEXT] = function(node, ctx) {
	return document.createTextNode(node.value);
}

_build.element[NODE_TYPE.INTERPOLATOR] = function(node, ctx) {
	var val = ctx.get(node.value);
	return document.createTextNode(val == null ? "" : val);
}

_build.element[NODE_TYPE.TRIPLE] = function(node, ctx) {
	var val = ctx.get(node.value),
		div = document.createElement("div"),
		children = [], i;

	div.innerHTML = val == null ? "" : val;

	for (i = 0; i < div.childNodes.length; i++) {
		children.push(div.childNodes[i]);
	}

	return children;
}

_build.element[NODE_TYPE.SECTION] = function(node, ctx) {
	var self = this, els = [];

	processSection(ctx, node.value, function(nctx) {
		els.push(self._buildElements(node.children, nctx));
	});

	return els;
}

_build.element[NODE_TYPE.INVERTED] = function(node, ctx) {
	if (isEmptySection(ctx.get(node.value)))
		return this._buildElements(node.children, ctx);
}

_build.attribute[NODE_TYPE.TEXT] = function(node, ctx) {
	return node.value;
}

_build.attribute[NODE_TYPE.INTERPOLATOR] = function(node, ctx) {
	var val = ctx.get(node.value);
	return val != null ? _.escape(val) : "";
}

_build.attribute[NODE_TYPE.SECTION] = function(node, ctx) {
	var self = this, els = [];

	processSection(ctx, node.value, function(nctx) {
		els.push(self._buildAttribute(node.children, nctx));
	});

	return els.join("");
}

function isEmptySection(val) {
	return !val || (_.isArray(val) && !val.length);
}

function processSection(ctx, path, fn) {
	var val = ctx.get(path);
	if (isEmptySection(val)) return false;

	if (_.isArray(val)) {
		val.forEach(function(v, index) {
			var nctx = ctx.spawn(v);
			nctx.hidden.$index = index;
			fn(nctx);
		});
	} else {
		fn(ctx.spawn(val));
	}

	return true;
}
},{"./parse":6,"./util":10,"underscore":22}],4:[function(require,module,exports){
var util = require("./util"),
	Deps = require("./deps"),
	_ = require("underscore"),
	Context = require("./context"),
	Observer = require("./observer");

exports.createContext = function(val) {
	return new Context(_.isUndefined(val) ? this.data : val, null, this);
}

exports.autorun = function(fn) {
	return Temple.Deps.autorun(fn.bind(this));
}

exports.get = function(path) {		
	if (Deps.active) this.depend(path);
	return this._get(this.data, path);
}

exports._get = function(obj, path, ctx) {
	var parts = util.splitPath(path);
	
	while (parts.length) {
		if (obj == null) return;
		obj = obj[parts.shift()];
	}

	if (typeof obj === "function") {
		if (ctx == null) ctx = this.createContext();
		obj = obj.call(ctx.get(), this, ctx);
	}

	return obj;
}

exports.depend = function(path) {
	path = util.joinPath(util.splitPath(path)); // ensure validity
	var dep = this._deps[path];

	// create if doesn't exist
	if (dep == null) {
		dep = this._deps[path] = new Deps.Dependency;
		dep._observer = this.observe(path, function() { dep.changed(); });
	}

	dep.depend();
	return this;
}

exports.set = function(key, val) {
	var mixin = key,
		self = this,
		parts, cur, part, changes;

	if (typeof key === "string") {
		mixin = {};
		parts = util.splitPath(key);
		cur = mixin;

		while (parts.length) {
			part = parts.shift();
			cur = (cur[part] = parts.length === 0 ? val : {});
		}
	}

	changes = [];
	this.data = this._set(this.data, mixin, changes);
	
	changes.forEach(function(args) { this._handleChange.apply(this, args); }, this);

	this.emit("change");

	return this;
}

exports._set = function(base, mixin, changes, keys) {
	var oldval, k, _changes;

	if (keys == null) keys = [];

	// generic objects are deep copied onto base
	if (util.isGenericObject(mixin)) {
		if (!util.isGenericObject(base)) {
			oldval = base;
			base = {};
			_changes = changes;
			changes = null;
		}
			
		for (k in mixin) {
			base[k] = this._set(base[k], mixin[k], changes, keys.concat(k));
		}

		if (_.isArray(_changes)) _changes.push([ keys, base, oldval ]);
	} else {
		if (_.isArray(changes)) changes.push([ keys, mixin, base ]);
		base = mixin;
	}

	return base;
}

exports.unset = function(key) {
	var parts = util.splitPath(key),
		initial, data, oldval, last;

	if (!parts.length) {
		oldval = this.data;
		delete this.data;
	} else {
		initial = _.initial(parts);
		data = this.data;

		while (initial.length) {
			if (!util.isGenericObject(data)) return this;
			data = data[initial.shift()];
		}

		if (util.isGenericObject(data)) {
			last = _.last(parts);
			oldval = data[last];
			delete data[last];
		}
	}

	if (oldval != null) this._handleChange(parts, void 0, oldval);

	return this;
}

exports._handleChange = function(keys, newval, oldval) {
	this._observers.forEach(function(o) {
		o.handle(keys, newval, oldval);
	});
	this.emit("change:" + util.joinPath(keys), newval, oldval);
}

exports.observe = function(path, fn) {
	return new Observer(path, fn, this);
}
},{"./context":1,"./deps":2,"./observer":5,"./util":10,"underscore":22}],5:[function(require,module,exports){
var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util");

module.exports = util.subclass(EventEmitter, {

	constructor: function(path, fn, temple) {
		if (typeof fn !== "function") throw new Error("Expected function to call on change.");
		EventEmitter.call(this);

		this.path = path;
		this.parts = util.parsePath(path);
		this.callback = fn;
		this.stopped = false;

		this.temple = temple;
		temple._observers.push(this);
	},

	stop: function() {
		if (this.stopped) return;
		this.stopped = true;

		// remove from temple instance
		var index = this.temple._observers.indexOf(this);
		if (index > -1) this.temple._observers.splice(index, 1);
		
		this.emit("stop");
		return this;
	},

	exec: function() {
		var args = _.toArray(arguments);
		this.callback.apply(this.temple, args);
		this.emit.apply(this, ["handle"].concat(args));
		return this;
	},

	handle: function(keys, newval, oldval) {
		var parts, part, base, self, paths, didExec;

		// clone parts so we don't affect the original
		parts = this.parts.slice(0);
		
		// traverse through cparts
		// a mismatch means we don't need to be here
		for (var i = 0; i < keys.length; i++) {
			part = parts.shift();
			if (_.isRegExp(part) && part.test(keys[i])) continue;
			if (part === "**") {
				console.log("star star!");
				return;
			}
			if (part !== keys[i]) return false;
		}

		self = this;
		didExec = false;
		paths = {};
		base = util.joinPath(keys);

		// generate a list of effected paths
		generatePaths(newval, parts, paths);
		generatePaths(oldval, parts, paths);

		// fire the callback on each path that changed
		_.each(paths, function(v, path) {
			var nval = self.temple._get(newval, path),
				oval = self.temple._get(oldval, path);

			if (nval !== oval) {
				self.exec(nval, oval, util.joinPath(base, path));
				didExec = true;
			}
		});

		return didExec;
	}
	
});

// recursively search obj of all paths that match parts
function generatePaths(obj, parts, paths, base) {
	if (paths == null) paths = {};
	if (base == null) base = "";

	if (!parts.length) {
		paths[base] = true;
		return paths;
	}

	if (obj == null) return paths;

	var part = parts[0],
		rest = parts.slice(1);

	if (_.isRegExp(part)) {
		for (var k in obj) {
			if (part.test(k)) generatePaths(obj[k], rest, paths, util.joinPath(base, k));
		}
	} else if (part === "**") {
		console.log("star star!");
	} else {
		generatePaths(obj[part], rest, paths, util.joinPath(base, part));
	}

	return paths;
}
},{"./util":10,"events":14,"underscore":22}],6:[function(require,module,exports){
var Hogan = require("hogan.js"),
	xml = require('./xml'),
	NODE_TYPE = require("./types"),
	HTML_DELIMITERS = [ "[#@!", "!@#]" ];

var parse =
module.exports = function(text, delimiters) {
	var tree = toTree(text.trim(), delimiters);
	return compileXML(tree);
}

parse.NODE_TYPE = NODE_TYPE;

function toTree(text, delimiters){
	return Hogan.parse(Hogan.scan(text, delimiters));
}

function parseXML(tree) {
	var src = "",
		d = HTML_DELIMITERS;

	tree.forEach(function(node, index) {
		if (typeof node === "string" || node instanceof String) {
			src += "" + node;
		} else {
			src += d[0] + index + d[1];
		}
	});

	return xml(src);
}

function parseXMLText(text, tree) {
	var d = HTML_DELIMITERS;

	return text.split(d[0]).reduce(function(m, v) {
		var end = v.indexOf(d[1]), toPush;
		
		if (end >= 0) {
			var index = parseInt(v.substr(0, end), 10);
			if (!isNaN(index) && index >= 0) m.push(index);
			
			toPush = v.substr(end + d[1].length);
		} else {
			toPush = v;
		}

		if (toPush !== "") m.push(toPush);

		return m;
	}, []).map(function(v) {
		if (typeof v !== "number") return v;
		return tree[v];
	});
}

function appendText(m, text) {
	var last = m[m.length - 1];
	if (last != null && last.type === NODE_TYPE.TEXT) {
		last.value += text;
	} else {
		m.push({
			type: NODE_TYPE.TEXT,
			value: text
		});
	}
}

function compileStash(nodes, isXML) {
	processNodes = isXML ? compileXML : compileStash;

	return nodes.reduce(function(m, part) {
		if (typeof part === "string" || part instanceof String) {
			appendText(m, "" + part);
		} else {
			switch (part.tag) {
				case "\n":
					appendText(m, "\n");
					break;

				case "_v":
					m.push({
						type: NODE_TYPE.INTERPOLATOR,
						value: part.n
					});
					break;

				case "&":
				case "{":
					m.push({
						type: NODE_TYPE.TRIPLE,
						value: part.n
					});
					break;

				case "#":
					m.push({
						type: NODE_TYPE.SECTION,
						value: part.n,
						children: processNodes(part.nodes, isXML)
					});
					break;

				case "^":
					m.push({
						type: NODE_TYPE.INVERTED,
						value: part.n,
						children: processNodes(part.nodes, isXML)
					});
					break;

				case ">":
					m.push({
						type: NODE_TYPE.PARTIAL,
						value: part.n
					});
					break;

				case "!":
					break;

				default:
					console.log(part);
					break;
			}
		}

		return m;
	}, []);
}

function compileAttributes(attrs, tree) {
	var parsed = [];

	for (var key in attrs) {
		parsed.push({
			type: NODE_TYPE.ATTRIBUTE,
			name: key,
			children: compileStash(parseXMLText(attrs[key], tree), false)
		});
	}

	return parsed;
}

function compileElements(nodes, tree) {
	return nodes.map(function(el) {
		if (typeof el === "string") {
			return compileStash(parseXMLText(el, tree), true);
		} else {
			return {
				type: NODE_TYPE.ELEMENT,
				name: el.name,
				attributes: compileAttributes(el.attributes, tree),
				children: compileElements(el.children, tree)
			}
		}
	}).reduce(function(m, el) {
		if (Array.isArray(el)) m = m.concat(el);
		else m.push(el);
		return m;
	}, []);
}

function compileXML(tree) {
	return compileElements(parseXML(tree), tree);
}
},{"./types":7,"./xml":8,"hogan.js":20}],7:[function(require,module,exports){
module.exports = {
	// XML/HTML
	TEXT              : 0,
	ELEMENT           : 1,
	ATTRIBUTE         : 2,
	
	// Mustache
	INTERPOLATOR      : 3,
	TRIPLE            : 4,
	SECTION           : 5,
	INVERTED          : 6,
	PARTIAL           : 7
}
},{}],8:[function(require,module,exports){

/**
 * Expose `parse`.
 */

module.exports = parse;

/**
 * Parse the given string of `xml`.
 *
 * @param {String} xml
 * @return {Object}
 * @api public
 */

function parse(xml) {
	// strip comments
	xml = xml.replace(/<!--.*?-->/g, '');

	return children();

	/**
	 * Tag.
	 */

	function tag() {
		var m = match(/^<([\w+:]+)\s*/);
		if (!m) return;

		// name
		var node = {
			name: m[1],
			attributes: {}
		};

		// attributes
		while (!(eos() || is('>') || is('?>'))) {
			var attr = attribute();
			if (!attr) return node;
			node.attributes[attr.name] = attr.value;
		}

		match(/\??>\s*/);

		// children
		node.children = children();

		// closing
		match(/^<\/[\w:]+>\s*/);

		return node;
	}

	function children() {
		var childs = [];

		// initial text node
		var text = content();
		if (text != "") childs.push(text);

		// children
		var child;
		while (child = tag()) {
			childs.push(child);
			if ((text = content()) != "") childs.push(text);
		}

		return childs;
	}

	/**
	 * Text content.
	 */

	function content() {
		var m = match(/^([^<]*)/);
		if (m) return m[1];
		return '';
	}

	/**
	 * Attribute.
	 */

	function attribute() {
		var m = match(/([\w:]+)\s*=\s*("[^"]*"|'[^']*'|\w+)\s*/);
		if (!m) return;
		return { name: m[1], value: strip(m[2]) }
	}

	/**
	 * Strip quotes from `val`.
	 */

	function strip(val) {
		return val.replace(/^['"]|['"]$/g, '');
	}

	/**
	 * Match `re` and advance the string.
	 */

	function match(re) {
		var m = xml.match(re);
		if (!m) return;
		xml = xml.slice(m[0].length);
		return m;
	}

	/**
	 * End-of-source.
	 */

	function eos() {
		return 0 == xml.length;
	}

	/**
	 * Check for `prefix`.
	 */

	function is(prefix) {
		return 0 == xml.indexOf(prefix);
	}
}
},{}],9:[function(require,module,exports){
var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util");

// default options
var defaults = {
	data: {},
	template: ""
};

// options to copy onto the object
var toCopy = [ "template" ];

// base prototype
var proto = {

	constructor: function(options) {
		EventEmitter.call(this);

		options = _.defaults(options || {}, defaults);
		toCopy.forEach(function(k) {
			this[k] = options[k];
		}, this);

		this._deps = {};
		this._observers = [];
		this.set(options.data);

		this.paint();
	},

	initialize: function() {},

	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		args.unshift(this);
		fn.apply(this, args);
		return this;
	}

};

// core methods
var core = [
	require("./model"),	// Data Model
	require("./dom"),	// DOM Handler
];

core.forEach(function(methods) {
	for (var method in methods) {
		proto[method] = methods[method];
	}
});

// export
var Temple =
module.exports = util.subclass(EventEmitter, proto);

// class properties/methods
Temple.extend = util.subclass.bind(null, Temple);
Temple.parse = require("./parse");
Temple.Observer = require("./observer");
Temple.Deps = require("./deps");
},{"./deps":2,"./dom":3,"./model":4,"./observer":5,"./parse":6,"./util":10,"events":14,"underscore":22}],10:[function(require,module,exports){
var _ = require("underscore");

var isGenericObject =
exports.isGenericObject = function(obj) {
	return obj != null && obj.__proto__ === Object.prototype;
}

var splitPath =
exports.splitPath = function(path) {
	return _.compact(typeof path !== "string" ? [] : path.split("."));
}

var parsePath =
exports.parsePath = function(path) {
	return splitPath(path).map(function(part) {
		if (part.indexOf("*") > -1 && part !== "**") {
			return new RegExp("^" + part.split("*").join("([^\\.]*)") + "$");
		}

		return part;
	});
}

var joinPath =
exports.joinPath = function() {
	return _.compact(_.flatten(_.toArray(arguments))).join(".");
}

var subclass =
exports.subclass = function(parent, protoProps, staticProps) {
	var child;

	// The constructor function for the new subclass is either defined by you
	// (the "constructor" property in your `extend` definition), or defaulted
	// by us to simply call the parent's constructor.
	if (protoProps && _.has(protoProps, 'constructor')) {
		child = protoProps.constructor;
	} else {
		child = function(){ return parent.apply(this, arguments); };
	}

	// Add static properties to the constructor function, if supplied.
	_.extend(child, parent, staticProps);

	// Set the prototype chain to inherit from `parent`, without calling
	// `parent`'s constructor function.
	var Surrogate = function(){ this.constructor = child; };
	Surrogate.prototype = parent.prototype;
	child.prototype = new Surrogate;

	// Add prototype properties (instance properties) to the subclass,
	// if supplied.
	if (protoProps) _.extend(child.prototype, protoProps);

	// Set a convenience property in case the parent's prototype is needed
	// later.
	child.__super__ = parent.prototype;

	return child;
}
},{"underscore":22}],11:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":13}],12:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],13:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("/Users/Tyler/Dropbox/Clients/TJCrap/Dev/temple/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":12,"/Users/Tyler/Dropbox/Clients/TJCrap/Dev/temple/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":16,"inherits":15}],14:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      } else {
        throw TypeError('Uncaught, unspecified "error" event.');
      }
      return false;
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      console.trace();
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],15:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],16:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.once = noop;
process.off = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],17:[function(require,module,exports){
module.exports=require(12)
},{}],18:[function(require,module,exports){
module.exports=require(13)
},{"./support/isBuffer":17,"/Users/Tyler/Dropbox/Clients/TJCrap/Dev/temple/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":16,"inherits":15}],19:[function(require,module,exports){
/*
 *  Copyright 2011 Twitter, Inc.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

(function (Hogan) {
  // Setup regex  assignments
  // remove whitespace according to Mustache spec
  var rIsWhitespace = /\S/,
      rQuot = /\"/g,
      rNewline =  /\n/g,
      rCr = /\r/g,
      rSlash = /\\/g,
      tagTypes = {
        '#': 1, '^': 2, '/': 3,  '!': 4, '>': 5,
        '<': 6, '=': 7, '_v': 8, '{': 9, '&': 10
      };

  Hogan.scan = function scan(text, delimiters) {
    var len = text.length,
        IN_TEXT = 0,
        IN_TAG_TYPE = 1,
        IN_TAG = 2,
        state = IN_TEXT,
        tagType = null,
        tag = null,
        buf = '',
        tokens = [],
        seenTag = false,
        i = 0,
        lineStart = 0,
        otag = '{{',
        ctag = '}}';

    function addBuf() {
      if (buf.length > 0) {
        tokens.push(new String(buf));
        buf = '';
      }
    }

    function lineIsWhitespace() {
      var isAllWhitespace = true;
      for (var j = lineStart; j < tokens.length; j++) {
        isAllWhitespace =
          (tokens[j].tag && tagTypes[tokens[j].tag] < tagTypes['_v']) ||
          (!tokens[j].tag && tokens[j].match(rIsWhitespace) === null);
        if (!isAllWhitespace) {
          return false;
        }
      }

      return isAllWhitespace;
    }

    function filterLine(haveSeenTag, noNewLine) {
      addBuf();

      if (haveSeenTag && lineIsWhitespace()) {
        for (var j = lineStart, next; j < tokens.length; j++) {
          if (!tokens[j].tag) {
            if ((next = tokens[j+1]) && next.tag == '>') {
              // set indent to token value
              next.indent = tokens[j].toString()
            }
            tokens.splice(j, 1);
          }
        }
      } else if (!noNewLine) {
        tokens.push({tag:'\n'});
      }

      seenTag = false;
      lineStart = tokens.length;
    }

    function changeDelimiters(text, index) {
      var close = '=' + ctag,
          closeIndex = text.indexOf(close, index),
          delimiters = trim(
            text.substring(text.indexOf('=', index) + 1, closeIndex)
          ).split(' ');

      otag = delimiters[0];
      ctag = delimiters[1];

      return closeIndex + close.length - 1;
    }

    if (delimiters) {
      delimiters = delimiters.split(' ');
      otag = delimiters[0];
      ctag = delimiters[1];
    }

    for (i = 0; i < len; i++) {
      if (state == IN_TEXT) {
        if (tagChange(otag, text, i)) {
          --i;
          addBuf();
          state = IN_TAG_TYPE;
        } else {
          if (text.charAt(i) == '\n') {
            filterLine(seenTag);
          } else {
            buf += text.charAt(i);
          }
        }
      } else if (state == IN_TAG_TYPE) {
        i += otag.length - 1;
        tag = tagTypes[text.charAt(i + 1)];
        tagType = tag ? text.charAt(i + 1) : '_v';
        if (tagType == '=') {
          i = changeDelimiters(text, i);
          state = IN_TEXT;
        } else {
          if (tag) {
            i++;
          }
          state = IN_TAG;
        }
        seenTag = i;
      } else {
        if (tagChange(ctag, text, i)) {
          tokens.push({tag: tagType, n: trim(buf), otag: otag, ctag: ctag,
                       i: (tagType == '/') ? seenTag - ctag.length : i + otag.length});
          buf = '';
          i += ctag.length - 1;
          state = IN_TEXT;
          if (tagType == '{') {
            if (ctag == '}}') {
              i++;
            } else {
              cleanTripleStache(tokens[tokens.length - 1]);
            }
          }
        } else {
          buf += text.charAt(i);
        }
      }
    }

    filterLine(seenTag, true);

    return tokens;
  }

  function cleanTripleStache(token) {
    if (token.n.substr(token.n.length - 1) === '}') {
      token.n = token.n.substring(0, token.n.length - 1);
    }
  }

  function trim(s) {
    if (s.trim) {
      return s.trim();
    }

    return s.replace(/^\s*|\s*$/g, '');
  }

  function tagChange(tag, text, index) {
    if (text.charAt(index) != tag.charAt(0)) {
      return false;
    }

    for (var i = 1, l = tag.length; i < l; i++) {
      if (text.charAt(index + i) != tag.charAt(i)) {
        return false;
      }
    }

    return true;
  }

  function buildTree(tokens, kind, stack, customTags) {
    var instructions = [],
        opener = null,
        token = null;

    while (tokens.length > 0) {
      token = tokens.shift();
      if (token.tag == '#' || token.tag == '^' || isOpener(token, customTags)) {
        stack.push(token);
        token.nodes = buildTree(tokens, token.tag, stack, customTags);
        instructions.push(token);
      } else if (token.tag == '/') {
        if (stack.length === 0) {
          throw new Error('Closing tag without opener: /' + token.n);
        }
        opener = stack.pop();
        if (token.n != opener.n && !isCloser(token.n, opener.n, customTags)) {
          throw new Error('Nesting error: ' + opener.n + ' vs. ' + token.n);
        }
        opener.end = token.i;
        return instructions;
      } else {
        instructions.push(token);
      }
    }

    if (stack.length > 0) {
      throw new Error('missing closing tag: ' + stack.pop().n);
    }

    return instructions;
  }

  function isOpener(token, tags) {
    for (var i = 0, l = tags.length; i < l; i++) {
      if (tags[i].o == token.n) {
        token.tag = '#';
        return true;
      }
    }
  }

  function isCloser(close, open, tags) {
    for (var i = 0, l = tags.length; i < l; i++) {
      if (tags[i].c == close && tags[i].o == open) {
        return true;
      }
    }
  }

  Hogan.generate = function (tree, text, options) {
    var code = 'var _=this;_.b(i=i||"");' + walk(tree) + 'return _.fl();';
    if (options.asString) {
      return 'function(c,p,i){' + code + ';}';
    }

    return new Hogan.Template(new Function('c', 'p', 'i', code), text, Hogan, options);
  }

  function esc(s) {
    return s.replace(rSlash, '\\\\')
            .replace(rQuot, '\\\"')
            .replace(rNewline, '\\n')
            .replace(rCr, '\\r');
  }

  function chooseMethod(s) {
    return (~s.indexOf('.')) ? 'd' : 'f';
  }

  function walk(tree) {
    var code = '';
    for (var i = 0, l = tree.length; i < l; i++) {
      var tag = tree[i].tag;
      if (tag == '#') {
        code += section(tree[i].nodes, tree[i].n, chooseMethod(tree[i].n),
                        tree[i].i, tree[i].end, tree[i].otag + " " + tree[i].ctag);
      } else if (tag == '^') {
        code += invertedSection(tree[i].nodes, tree[i].n,
                                chooseMethod(tree[i].n));
      } else if (tag == '<' || tag == '>') {
        code += partial(tree[i]);
      } else if (tag == '{' || tag == '&') {
        code += tripleStache(tree[i].n, chooseMethod(tree[i].n));
      } else if (tag == '\n') {
        code += text('"\\n"' + (tree.length-1 == i ? '' : ' + i'));
      } else if (tag == '_v') {
        code += variable(tree[i].n, chooseMethod(tree[i].n));
      } else if (tag === undefined) {
        code += text('"' + esc(tree[i]) + '"');
      }
    }
    return code;
  }

  function section(nodes, id, method, start, end, tags) {
    return 'if(_.s(_.' + method + '("' + esc(id) + '",c,p,1),' +
           'c,p,0,' + start + ',' + end + ',"' + tags + '")){' +
           '_.rs(c,p,' +
           'function(c,p,_){' +
           walk(nodes) +
           '});c.pop();}';
  }

  function invertedSection(nodes, id, method) {
    return 'if(!_.s(_.' + method + '("' + esc(id) + '",c,p,1),c,p,1,0,0,"")){' +
           walk(nodes) +
           '};';
  }

  function partial(tok) {
    return '_.b(_.rp("' +  esc(tok.n) + '",c,p,"' + (tok.indent || '') + '"));';
  }

  function tripleStache(id, method) {
    return '_.b(_.t(_.' + method + '("' + esc(id) + '",c,p,0)));';
  }

  function variable(id, method) {
    return '_.b(_.v(_.' + method + '("' + esc(id) + '",c,p,0)));';
  }

  function text(id) {
    return '_.b(' + id + ');';
  }

  Hogan.parse = function(tokens, text, options) {
    options = options || {};
    return buildTree(tokens, '', [], options.sectionTags || []);
  },

  Hogan.cache = {};

  Hogan.compile = function(text, options) {
    // options
    //
    // asString: false (default)
    //
    // sectionTags: [{o: '_foo', c: 'foo'}]
    // An array of object with o and c fields that indicate names for custom
    // section tags. The example above allows parsing of {{_foo}}{{/foo}}.
    //
    // delimiters: A string that overrides the default delimiters.
    // Example: "<% %>"
    //
    options = options || {};

    var key = text + '||' + !!options.asString;

    var t = this.cache[key];

    if (t) {
      return t;
    }

    t = this.generate(this.parse(this.scan(text, options.delimiters), text, options), text, options);
    return this.cache[key] = t;
  };
})(typeof exports !== 'undefined' ? exports : Hogan);

},{}],20:[function(require,module,exports){
/*
 *  Copyright 2011 Twitter, Inc.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

// This file is for use with Node.js. See dist/ for browser files.

var Hogan = require('./compiler');
Hogan.Template = require('./template').Template;
module.exports = Hogan; 
},{"./compiler":19,"./template":21}],21:[function(require,module,exports){
/*
 *  Copyright 2011 Twitter, Inc.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

var Hogan = {};

(function (Hogan, useArrayBuffer) {
  Hogan.Template = function (renderFunc, text, compiler, options) {
    this.r = renderFunc || this.r;
    this.c = compiler;
    this.options = options;
    this.text = text || '';
    this.buf = (useArrayBuffer) ? [] : '';
  }

  Hogan.Template.prototype = {
    // render: replaced by generated code.
    r: function (context, partials, indent) { return ''; },

    // variable escaping
    v: hoganEscape,

    // triple stache
    t: coerceToString,

    render: function render(context, partials, indent) {
      return this.ri([context], partials || {}, indent);
    },

    // render internal -- a hook for overrides that catches partials too
    ri: function (context, partials, indent) {
      return this.r(context, partials, indent);
    },

    // tries to find a partial in the curent scope and render it
    rp: function(name, context, partials, indent) {
      var partial = partials[name];

      if (!partial) {
        return '';
      }

      if (this.c && typeof partial == 'string') {
        partial = this.c.compile(partial, this.options);
      }

      return partial.ri(context, partials, indent);
    },

    // render a section
    rs: function(context, partials, section) {
      var tail = context[context.length - 1];

      if (!isArray(tail)) {
        section(context, partials, this);
        return;
      }

      for (var i = 0; i < tail.length; i++) {
        context.push(tail[i]);
        section(context, partials, this);
        context.pop();
      }
    },

    // maybe start a section
    s: function(val, ctx, partials, inverted, start, end, tags) {
      var pass;

      if (isArray(val) && val.length === 0) {
        return false;
      }

      if (typeof val == 'function') {
        val = this.ls(val, ctx, partials, inverted, start, end, tags);
      }

      pass = (val === '') || !!val;

      if (!inverted && pass && ctx) {
        ctx.push((typeof val == 'object') ? val : ctx[ctx.length - 1]);
      }

      return pass;
    },

    // find values with dotted names
    d: function(key, ctx, partials, returnFound) {
      var names = key.split('.'),
          val = this.f(names[0], ctx, partials, returnFound),
          cx = null;

      if (key === '.' && isArray(ctx[ctx.length - 2])) {
        return ctx[ctx.length - 1];
      }

      for (var i = 1; i < names.length; i++) {
        if (val && typeof val == 'object' && names[i] in val) {
          cx = val;
          val = val[names[i]];
        } else {
          val = '';
        }
      }

      if (returnFound && !val) {
        return false;
      }

      if (!returnFound && typeof val == 'function') {
        ctx.push(cx);
        val = this.lv(val, ctx, partials);
        ctx.pop();
      }

      return val;
    },

    // find values with normal names
    f: function(key, ctx, partials, returnFound) {
      var val = false,
          v = null,
          found = false;

      for (var i = ctx.length - 1; i >= 0; i--) {
        v = ctx[i];
        if (v && typeof v == 'object' && key in v) {
          val = v[key];
          found = true;
          break;
        }
      }

      if (!found) {
        return (returnFound) ? false : "";
      }

      if (!returnFound && typeof val == 'function') {
        val = this.lv(val, ctx, partials);
      }

      return val;
    },

    // higher order templates
    ho: function(val, cx, partials, text, tags) {
      var compiler = this.c;
      var options = this.options;
      options.delimiters = tags;
      var text = val.call(cx, text);
      text = (text == null) ? String(text) : text.toString();
      this.b(compiler.compile(text, options).render(cx, partials));
      return false;
    },

    // template result buffering
    b: (useArrayBuffer) ? function(s) { this.buf.push(s); } :
                          function(s) { this.buf += s; },
    fl: (useArrayBuffer) ? function() { var r = this.buf.join(''); this.buf = []; return r; } :
                           function() { var r = this.buf; this.buf = ''; return r; },

    // lambda replace section
    ls: function(val, ctx, partials, inverted, start, end, tags) {
      var cx = ctx[ctx.length - 1],
          t = null;

      if (!inverted && this.c && val.length > 0) {
        return this.ho(val, cx, partials, this.text.substring(start, end), tags);
      }

      t = val.call(cx);

      if (typeof t == 'function') {
        if (inverted) {
          return true;
        } else if (this.c) {
          return this.ho(t, cx, partials, this.text.substring(start, end), tags);
        }
      }

      return t;
    },

    // lambda replace variable
    lv: function(val, ctx, partials) {
      var cx = ctx[ctx.length - 1];
      var result = val.call(cx);

      if (typeof result == 'function') {
        result = coerceToString(result.call(cx));
        if (this.c && ~result.indexOf("{\u007B")) {
          return this.c.compile(result, this.options).render(cx, partials);
        }
      }

      return coerceToString(result);
    }

  };

  var rAmp = /&/g,
      rLt = /</g,
      rGt = />/g,
      rApos =/\'/g,
      rQuot = /\"/g,
      hChars =/[&<>\"\']/;


  function coerceToString(val) {
    return String((val === null || val === undefined) ? '' : val);
  }

  function hoganEscape(str) {
    str = coerceToString(str);
    return hChars.test(str) ?
      str
        .replace(rAmp,'&amp;')
        .replace(rLt,'&lt;')
        .replace(rGt,'&gt;')
        .replace(rApos,'&#39;')
        .replace(rQuot, '&quot;') :
      str;
  }

  var isArray = Array.isArray || function(a) {
    return Object.prototype.toString.call(a) === '[object Array]';
  };

})(typeof exports !== 'undefined' ? exports : Hogan);


},{}],22:[function(require,module,exports){
//     Underscore.js 1.6.0
//     http://underscorejs.org
//     (c) 2009-2014 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Establish the object that gets returned to break out of a loop iteration.
  var breaker = {};

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    concat           = ArrayProto.concat,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeForEach      = ArrayProto.forEach,
    nativeMap          = ArrayProto.map,
    nativeReduce       = ArrayProto.reduce,
    nativeReduceRight  = ArrayProto.reduceRight,
    nativeFilter       = ArrayProto.filter,
    nativeEvery        = ArrayProto.every,
    nativeSome         = ArrayProto.some,
    nativeIndexOf      = ArrayProto.indexOf,
    nativeLastIndexOf  = ArrayProto.lastIndexOf,
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind;

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object via a string identifier,
  // for Closure Compiler "advanced" mode.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.6.0';

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles objects with the built-in `forEach`, arrays, and raw objects.
  // Delegates to **ECMAScript 5**'s native `forEach` if available.
  var each = _.each = _.forEach = function(obj, iterator, context) {
    if (obj == null) return obj;
    if (nativeForEach && obj.forEach === nativeForEach) {
      obj.forEach(iterator, context);
    } else if (obj.length === +obj.length) {
      for (var i = 0, length = obj.length; i < length; i++) {
        if (iterator.call(context, obj[i], i, obj) === breaker) return;
      }
    } else {
      var keys = _.keys(obj);
      for (var i = 0, length = keys.length; i < length; i++) {
        if (iterator.call(context, obj[keys[i]], keys[i], obj) === breaker) return;
      }
    }
    return obj;
  };

  // Return the results of applying the iterator to each element.
  // Delegates to **ECMAScript 5**'s native `map` if available.
  _.map = _.collect = function(obj, iterator, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeMap && obj.map === nativeMap) return obj.map(iterator, context);
    each(obj, function(value, index, list) {
      results.push(iterator.call(context, value, index, list));
    });
    return results;
  };

  var reduceError = 'Reduce of empty array with no initial value';

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`. Delegates to **ECMAScript 5**'s native `reduce` if available.
  _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduce && obj.reduce === nativeReduce) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator);
    }
    each(obj, function(value, index, list) {
      if (!initial) {
        memo = value;
        initial = true;
      } else {
        memo = iterator.call(context, memo, value, index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // The right-associative version of reduce, also known as `foldr`.
  // Delegates to **ECMAScript 5**'s native `reduceRight` if available.
  _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
    var initial = arguments.length > 2;
    if (obj == null) obj = [];
    if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
      if (context) iterator = _.bind(iterator, context);
      return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator);
    }
    var length = obj.length;
    if (length !== +length) {
      var keys = _.keys(obj);
      length = keys.length;
    }
    each(obj, function(value, index, list) {
      index = keys ? keys[--length] : --length;
      if (!initial) {
        memo = obj[index];
        initial = true;
      } else {
        memo = iterator.call(context, memo, obj[index], index, list);
      }
    });
    if (!initial) throw new TypeError(reduceError);
    return memo;
  };

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var result;
    any(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) {
        result = value;
        return true;
      }
    });
    return result;
  };

  // Return all the elements that pass a truth test.
  // Delegates to **ECMAScript 5**'s native `filter` if available.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    if (obj == null) return results;
    if (nativeFilter && obj.filter === nativeFilter) return obj.filter(predicate, context);
    each(obj, function(value, index, list) {
      if (predicate.call(context, value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, function(value, index, list) {
      return !predicate.call(context, value, index, list);
    }, context);
  };

  // Determine whether all of the elements match a truth test.
  // Delegates to **ECMAScript 5**'s native `every` if available.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = true;
    if (obj == null) return result;
    if (nativeEvery && obj.every === nativeEvery) return obj.every(predicate, context);
    each(obj, function(value, index, list) {
      if (!(result = result && predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if at least one element in the object matches a truth test.
  // Delegates to **ECMAScript 5**'s native `some` if available.
  // Aliased as `any`.
  var any = _.some = _.any = function(obj, predicate, context) {
    predicate || (predicate = _.identity);
    var result = false;
    if (obj == null) return result;
    if (nativeSome && obj.some === nativeSome) return obj.some(predicate, context);
    each(obj, function(value, index, list) {
      if (result || (result = predicate.call(context, value, index, list))) return breaker;
    });
    return !!result;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `include`.
  _.contains = _.include = function(obj, target) {
    if (obj == null) return false;
    if (nativeIndexOf && obj.indexOf === nativeIndexOf) return obj.indexOf(target) != -1;
    return any(obj, function(value) {
      return value === target;
    });
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      return (isFunc ? method : value[method]).apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matches(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matches(attrs));
  };

  // Return the maximum element or (element-based computation).
  // Can't optimize arrays of integers longer than 65,535 elements.
  // See [WebKit Bug 80797](https://bugs.webkit.org/show_bug.cgi?id=80797)
  _.max = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.max.apply(Math, obj);
    }
    var result = -Infinity, lastComputed = -Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed > lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iterator, context) {
    if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
      return Math.min.apply(Math, obj);
    }
    var result = Infinity, lastComputed = Infinity;
    each(obj, function(value, index, list) {
      var computed = iterator ? iterator.call(context, value, index, list) : value;
      if (computed < lastComputed) {
        result = value;
        lastComputed = computed;
      }
    });
    return result;
  };

  // Shuffle an array, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var rand;
    var index = 0;
    var shuffled = [];
    each(obj, function(value) {
      rand = _.random(index++);
      shuffled[index - 1] = shuffled[rand];
      shuffled[rand] = value;
    });
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (obj.length !== +obj.length) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // An internal function to generate lookup iterators.
  var lookupIterator = function(value) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return value;
    return _.property(value);
  };

  // Sort the object's values by a criterion produced by an iterator.
  _.sortBy = function(obj, iterator, context) {
    iterator = lookupIterator(iterator);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iterator.call(context, value, index, list)
      };
    }).sort(function(left, right) {
      var a = left.criteria;
      var b = right.criteria;
      if (a !== b) {
        if (a > b || a === void 0) return 1;
        if (a < b || b === void 0) return -1;
      }
      return left.index - right.index;
    }), 'value');
  };

  // An internal function used for aggregate "group by" operations.
  var group = function(behavior) {
    return function(obj, iterator, context) {
      var result = {};
      iterator = lookupIterator(iterator);
      each(obj, function(value, index) {
        var key = iterator.call(context, value, index, obj);
        behavior(result, key, value);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, key, value) {
    _.has(result, key) ? result[key].push(value) : result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, key, value) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, key) {
    _.has(result, key) ? result[key]++ : result[key] = 1;
  });

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iterator, context) {
    iterator = lookupIterator(iterator);
    var value = iterator.call(context, obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = (low + high) >>> 1;
      iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid;
    }
    return low;
  };

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (obj.length === +obj.length) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return (obj.length === +obj.length) ? obj.length : _.keys(obj).length;
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[0];
    if (n < 0) return [];
    return slice.call(array, 0, n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N. The **guard** check allows it to work with
  // `_.map`.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, array.length - ((n == null) || guard ? 1 : n));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array. The **guard** check allows it to work with `_.map`.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if ((n == null) || guard) return array[array.length - 1];
    return slice.call(array, Math.max(array.length - n, 0));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array. The **guard**
  // check allows it to work with `_.map`.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, (n == null) || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, output) {
    if (shallow && _.every(input, _.isArray)) {
      return concat.apply(output, input);
    }
    each(input, function(value) {
      if (_.isArray(value) || _.isArguments(value)) {
        shallow ? push.apply(output, value) : flatten(value, shallow, output);
      } else {
        output.push(value);
      }
    });
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, []);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Split an array into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(array, predicate) {
    var pass = [], fail = [];
    each(array, function(elem) {
      (predicate(elem) ? pass : fail).push(elem);
    });
    return [pass, fail];
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iterator, context) {
    if (_.isFunction(isSorted)) {
      context = iterator;
      iterator = isSorted;
      isSorted = false;
    }
    var initial = iterator ? _.map(array, iterator, context) : array;
    var results = [];
    var seen = [];
    each(initial, function(value, index) {
      if (isSorted ? (!index || seen[seen.length - 1] !== value) : !_.contains(seen, value)) {
        seen.push(value);
        results.push(array[index]);
      }
    });
    return results;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(_.flatten(arguments, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    var rest = slice.call(arguments, 1);
    return _.filter(_.uniq(array), function(item) {
      return _.every(rest, function(other) {
        return _.contains(other, item);
      });
    });
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
    return _.filter(array, function(value){ return !_.contains(rest, value); });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    var length = _.max(_.pluck(arguments, 'length').concat(0));
    var results = new Array(length);
    for (var i = 0; i < length; i++) {
      results[i] = _.pluck(arguments, '' + i);
    }
    return results;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    if (list == null) return {};
    var result = {};
    for (var i = 0, length = list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // If the browser doesn't supply us with indexOf (I'm looking at you, **MSIE**),
  // we need this function. Return the position of the first occurrence of an
  // item in an array, or -1 if the item is not included in the array.
  // Delegates to **ECMAScript 5**'s native `indexOf` if available.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    if (array == null) return -1;
    var i = 0, length = array.length;
    if (isSorted) {
      if (typeof isSorted == 'number') {
        i = (isSorted < 0 ? Math.max(0, length + isSorted) : isSorted);
      } else {
        i = _.sortedIndex(array, item);
        return array[i] === item ? i : -1;
      }
    }
    if (nativeIndexOf && array.indexOf === nativeIndexOf) return array.indexOf(item, isSorted);
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  // Delegates to **ECMAScript 5**'s native `lastIndexOf` if available.
  _.lastIndexOf = function(array, item, from) {
    if (array == null) return -1;
    var hasIndex = from != null;
    if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
      return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item);
    }
    var i = (hasIndex ? from : array.length);
    while (i--) if (array[i] === item) return i;
    return -1;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = arguments[2] || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var idx = 0;
    var range = new Array(length);

    while(idx < length) {
      range[idx++] = start;
      start += step;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Reusable constructor function for prototype setting.
  var ctor = function(){};

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    var args, bound;
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError;
    args = slice.call(arguments, 2);
    return bound = function() {
      if (!(this instanceof bound)) return func.apply(context, args.concat(slice.call(arguments)));
      ctor.prototype = func.prototype;
      var self = new ctor;
      ctor.prototype = null;
      var result = func.apply(self, args.concat(slice.call(arguments)));
      if (Object(result) === result) return result;
      return self;
    };
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    return function() {
      var position = 0;
      var args = boundArgs.slice();
      for (var i = 0, length = args.length; i < length; i++) {
        if (args[i] === _) args[i] = arguments[position++];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return func.apply(this, args);
    };
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var funcs = slice.call(arguments, 1);
    if (funcs.length === 0) throw new Error('bindAll must be passed function names');
    each(funcs, function(f) { obj[f] = _.bind(obj[f], obj); });
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memo = {};
    hasher || (hasher = _.identity);
    return function() {
      var key = hasher.apply(this, arguments);
      return _.has(memo, key) ? memo[key] : (memo[key] = func.apply(this, arguments));
    };
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){ return func.apply(null, args); }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = function(func) {
    return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)));
  };

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    options || (options = {});
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0) {
        clearTimeout(timeout);
        timeout = null;
        previous = now;
        result = func.apply(context, args);
        context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  };

  // Returns a function, that, as long as it continues to be invoked, will not
  // be triggered. The function will be called after it stops being called for
  // N milliseconds. If `immediate` is passed, trigger the function on the
  // leading edge, instead of the trailing.
  _.debounce = function(func, wait, immediate) {
    var timeout, args, context, timestamp, result;

    var later = function() {
      var last = _.now() - timestamp;
      if (last < wait) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) {
        timeout = setTimeout(later, wait);
      }
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = function(func) {
    var ran = false, memo;
    return function() {
      if (ran) return memo;
      ran = true;
      memo = func.apply(this, arguments);
      func = null;
      return memo;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var funcs = arguments;
    return function() {
      var args = arguments;
      for (var i = funcs.length - 1; i >= 0; i--) {
        args = [funcs[i].apply(this, args)];
      }
      return args[0];
    };
  };

  // Returns a function that will only be executed after being called N times.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Object Functions
  // ----------------

  // Retrieve the names of an object's properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = new Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = new Array(length);
    for (var i = 0; i < length; i++) {
      pairs[i] = [keys[i], obj[keys[i]]];
    }
    return pairs;
  };

  // Invert the keys and values of an object. The values must be serializable.
  _.invert = function(obj) {
    var result = {};
    var keys = _.keys(obj);
    for (var i = 0, length = keys.length; i < length; i++) {
      result[obj[keys[i]]] = keys[i];
    }
    return result;
  };

  // Return a sorted list of the function names available on the object.
  // Aliased as `methods`
  _.functions = _.methods = function(obj) {
    var names = [];
    for (var key in obj) {
      if (_.isFunction(obj[key])) names.push(key);
    }
    return names.sort();
  };

  // Extend a given object with all the properties in passed-in object(s).
  _.extend = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    each(keys, function(key) {
      if (key in obj) copy[key] = obj[key];
    });
    return copy;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj) {
    var copy = {};
    var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
    for (var key in obj) {
      if (!_.contains(keys, key)) copy[key] = obj[key];
    }
    return copy;
  };

  // Fill in a given object with default properties.
  _.defaults = function(obj) {
    each(slice.call(arguments, 1), function(source) {
      if (source) {
        for (var prop in source) {
          if (obj[prop] === void 0) obj[prop] = source[prop];
        }
      }
    });
    return obj;
  };

  // Create a (shallow-cloned) duplicate of an object.
  _.clone = function(obj) {
    if (!_.isObject(obj)) return obj;
    return _.isArray(obj) ? obj.slice() : _.extend({}, obj);
  };

  // Invokes interceptor with the obj, and then returns obj.
  // The primary purpose of this method is to "tap into" a method chain, in
  // order to perform operations on intermediate results within the chain.
  _.tap = function(obj, interceptor) {
    interceptor(obj);
    return obj;
  };

  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a == 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className != toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, dates, and booleans are compared by value.
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return a == String(b);
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
        // other numeric values.
        return a != +a ? b != +b : (a == 0 ? 1 / a == 1 / b : a == +b);
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a == +b;
      // RegExps are compared by their source patterns and flags.
      case '[object RegExp]':
        return a.source == b.source &&
               a.global == b.global &&
               a.multiline == b.multiline &&
               a.ignoreCase == b.ignoreCase;
    }
    if (typeof a != 'object' || typeof b != 'object') return false;
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] == a) return bStack[length] == b;
    }
    // Objects with different constructors are not equivalent, but `Object`s
    // from different frames are.
    var aCtor = a.constructor, bCtor = b.constructor;
    if (aCtor !== bCtor && !(_.isFunction(aCtor) && (aCtor instanceof aCtor) &&
                             _.isFunction(bCtor) && (bCtor instanceof bCtor))
                        && ('constructor' in a && 'constructor' in b)) {
      return false;
    }
    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);
    var size = 0, result = true;
    // Recursively compare objects and arrays.
    if (className == '[object Array]') {
      // Compare array lengths to determine if a deep comparison is necessary.
      size = a.length;
      result = size == b.length;
      if (result) {
        // Deep compare the contents, ignoring non-numeric properties.
        while (size--) {
          if (!(result = eq(a[size], b[size], aStack, bStack))) break;
        }
      }
    } else {
      // Deep compare objects.
      for (var key in a) {
        if (_.has(a, key)) {
          // Count the expected number of properties.
          size++;
          // Deep compare each member.
          if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack))) break;
        }
      }
      // Ensure that both objects contain the same number of properties.
      if (result) {
        for (key in b) {
          if (_.has(b, key) && !(size--)) break;
        }
        result = !size;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return result;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b, [], []);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (_.isArray(obj) || _.isString(obj)) return obj.length === 0;
    for (var key in obj) if (_.has(obj, key)) return false;
    return true;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) == '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    return obj === Object(obj);
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp.
  each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) == '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return !!(obj && _.has(obj, 'callee'));
    };
  }

  // Optimize `isFunction` if appropriate.
  if (typeof (/./) !== 'function') {
    _.isFunction = function(obj) {
      return typeof obj === 'function';
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj != +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) == '[object Boolean]';
  };

  // Is a given value equal to null?
  _.isNull = function(obj) {
    return obj === null;
  };

  // Is a given variable undefined?
  _.isUndefined = function(obj) {
    return obj === void 0;
  };

  // Shortcut function for checking if an object has a given property directly
  // on itself (in other words, not on a prototype).
  _.has = function(obj, key) {
    return hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iterators.
  _.identity = function(value) {
    return value;
  };

  _.constant = function(value) {
    return function () {
      return value;
    };
  };

  _.property = function(key) {
    return function(obj) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of `key:value` pairs.
  _.matches = function(attrs) {
    return function(obj) {
      if (obj === attrs) return true; //avoid comparing an object to itself.
      for (var key in attrs) {
        if (attrs[key] !== obj[key])
          return false;
      }
      return true;
    }
  };

  // Run a function **n** times.
  _.times = function(n, iterator, context) {
    var accum = Array(Math.max(0, n));
    for (var i = 0; i < n; i++) accum[i] = iterator.call(context, i);
    return accum;
  };

  // Return a random integer between min and max (inclusive).
  _.random = function(min, max) {
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + Math.floor(Math.random() * (max - min + 1));
  };

  // A (possibly faster) way to get the current timestamp as an integer.
  _.now = Date.now || function() { return new Date().getTime(); };

  // List of HTML entities for escaping.
  var entityMap = {
    escape: {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;'
    }
  };
  entityMap.unescape = _.invert(entityMap.escape);

  // Regexes containing the keys and values listed immediately above.
  var entityRegexes = {
    escape:   new RegExp('[' + _.keys(entityMap.escape).join('') + ']', 'g'),
    unescape: new RegExp('(' + _.keys(entityMap.unescape).join('|') + ')', 'g')
  };

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  _.each(['escape', 'unescape'], function(method) {
    _[method] = function(string) {
      if (string == null) return '';
      return ('' + string).replace(entityRegexes[method], function(match) {
        return entityMap[method][match];
      });
    };
  });

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property) {
    if (object == null) return void 0;
    var value = object[property];
    return _.isFunction(value) ? value.call(object) : value;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result.call(this, func.apply(_, args));
      };
    });
  };

  // Generate a unique integer id (unique within the entire client session).
  // Useful for temporary DOM ids.
  var idCounter = 0;
  _.uniqueId = function(prefix) {
    var id = ++idCounter + '';
    return prefix ? prefix + id : id;
  };

  // By default, Underscore uses ERB-style template delimiters, change the
  // following template settings to use alternative delimiters.
  _.templateSettings = {
    evaluate    : /<%([\s\S]+?)%>/g,
    interpolate : /<%=([\s\S]+?)%>/g,
    escape      : /<%-([\s\S]+?)%>/g
  };

  // When customizing `templateSettings`, if you don't want to define an
  // interpolation, evaluation or escaping regex, we need one that is
  // guaranteed not to match.
  var noMatch = /(.)^/;

  // Certain characters need to be escaped so that they can be put into a
  // string literal.
  var escapes = {
    "'":      "'",
    '\\':     '\\',
    '\r':     'r',
    '\n':     'n',
    '\t':     't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  _.template = function(text, data, settings) {
    var render;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = new RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset)
        .replace(escaper, function(match) { return '\\' + escapes[match]; });

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      }
      if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      }
      if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }
      index = offset + match.length;
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + "return __p;\n";

    try {
      render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    if (data) return render(data, _);
    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled function source as a convenience for precompilation.
    template.source = 'function(' + (settings.variable || 'obj') + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function, which will delegate to the wrapper.
  _.chain = function(obj) {
    return _(obj).chain();
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(obj) {
    return this._chain ? _(obj).chain() : obj;
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name == 'shift' || name == 'splice') && obj.length === 0) delete obj[0];
      return result.call(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result.call(this, method.apply(this._wrapped, arguments));
    };
  });

  _.extend(_.prototype, {

    // Start chaining a wrapped Underscore object.
    chain: function() {
      this._chain = true;
      return this;
    },

    // Extracts the result from a wrapped and chained object.
    value: function() {
      return this._wrapped;
    }

  });

  // AMD registration happens at the end for compatibility with AMD loaders
  // that may not enforce next-turn semantics on modules. Even though general
  // practice for AMD registration is to be anonymous, underscore registers
  // as a named module because, like jQuery, it is a base library that is
  // popular enough to be bundled in a third party lib, but not be part of
  // an AMD load request. Those cases could generate an error when an
  // anonymous define() is called outside of a loader request.
  if (typeof define === 'function' && define.amd) {
    define('underscore', [], function() {
      return _;
    });
  }
}).call(this);

},{}],23:[function(require,module,exports){
var assert = require("assert");

describe("Basic Class Properties", function() {

	it("extend() should create a valid subclass", function() {
		var SubTemple = Temple.extend({
			foo: function(){}
		});

		var tpl = new SubTemple();

		assert.ok(tpl instanceof Temple);
		assert.strictEqual(typeof tpl.foo, "function");
	});

});
},{"assert":11}],24:[function(require,module,exports){
(function (global){

global.Temple = require("../lib/temple");

mocha.setup('bdd');

describe("Temple", function() {
	require("./class");
	require("./parse");
});

describe("new Temple()", function() {
	require("./model");
	require("./render");
});

mocha.run();
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/temple":9,"./class":23,"./model":25,"./parse":27,"./render":28}],25:[function(require,module,exports){
var assert = require("assert");

describe("Data", function() {
	var tpl;

	before(function() {
		tpl = new Temple();
	});

	beforeEach(function() {
		tpl.set("foo", "bar");
	});

	describe("#get() & #set()", function() {
		it("sets data on construction", function() {
			var tpl = new Temple({
				data: { foo: "bar" }
			});

			assert.deepEqual(tpl.get(), { foo: "bar" });
		});

		it("returns `this.data` value on null or empty path", function() {
			assert.strictEqual(tpl.get(), tpl.data);
		});

		it("gets & sets shallow path", function() {
			tpl.set("foo", { bar: "baz" });
			assert.deepEqual(tpl.get("foo"), { bar: "baz" });
		});

		it("gets & sets deep path", function() {
			tpl.set("foo.bar", "baz");
			assert.equal(tpl.get("foo.bar"), "baz");
		});

		it("get(path) executes function value iff value at path is function", function() {
			tpl.set("foo", function(_tpl) {
				seen = true;
				assert.strictEqual(this, tpl.data);
				assert.strictEqual(_tpl, tpl);
				return true;
			});

			assert.strictEqual(tpl.get("foo"), true);
		});

		it("deep copies generic objects on set", function() {
			var data = { bar: { baz: "buz" } };
			tpl.set("foo", data);
			assert.deepEqual(tpl.get("foo"), data);
			assert.notStrictEqual(tpl.get("foo"), data);
			assert.notStrictEqual(tpl.get("foo.bar"), data.foo);
		});

		it("directly points to non-generic objects on set", function() {
			var data = [];
			tpl.set("foo", data);
			assert.strictEqual(tpl.get("foo"), data);
		});

		it("unsets", function() {
			tpl.unset("foo");
			assert.strictEqual(typeof tpl.get("foo"), "undefined");
		});

		it("only unsets deeply on generic objects", function() {
			tpl.set("foo", [ 0, 1, 2 ]);
			assert.equal(tpl.get("foo.length"), 3);
			tpl.unset("foo.length");
			assert.equal(tpl.get("foo.length"), 3);
		});

		it("unset() sets `this.data` to undefined on null or empty path", function() {
			tpl.unset();
			assert.strictEqual(typeof tpl.data, "undefined");
		});
	});


	describe("#autorun()", function() {
		var comp;
		
		afterEach(function() {
			if (comp != null) {
				comp.stop();
				comp = null;
			}
		});

		it("autorun() context always runs once, immediately", function() {
			var seen = false;
			comp = tpl.autorun(function() {
				assert.ok(tpl.get("foo"));
				seen = true;
			});
			assert.ok(seen);
		});

		it("`this` in autorun() contexts points to Temple instance", function() {
			comp = tpl.autorun(function() {
				assert.ok(tpl.get("foo"));
				assert.strictEqual(this, tpl);
			});
		});

		it("changing value at `key` after calling get(key) in a context causes context to run again", function(done) {
			this.timeout(100);
			var run = 2;

			comp = tpl.autorun(function() {
				assert.ok(tpl.get("foo"));
				if (!(--run)) done();
			});

			setTimeout(function() {
				tpl.set("foo", { bar: "baz" });
			}, 10);
		});
	});

	describe("#observe()", function() {
		var o;

		afterEach(function() {
			if (o != null) {
				o.stop();
				o = null;
			}
		});

		it("successfully adds & removes observer", function() {
			o = tpl.observe("foo", function(){});
			assert.ok(tpl._observers.indexOf(o) > -1);
			o.stop();
			assert.strictEqual(tpl._observers.indexOf(o), -1);
		});

		it("observes nothing when nothing changes", function() {
			var seen = false;
			o = tpl.observe("foo", function() { seen = true; });
			tpl.set("foo", "bar");
			assert.ok(!seen);
		});

		it("observes static path changes", function() {
			var seen = false;
			o = tpl.observe("foo.bar", function(nval, oval, path) {
				assert.strictEqual(nval, "baz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar");
				seen = true;
			});

			tpl.set("foo", { bar: "baz" });
			assert.ok(seen);
		});

		it("observes unset", function() {
			var seen = false;
			o = tpl.observe("foo", function(nval, oval, path) {
				assert.strictEqual(typeof nval, "undefined");
				assert.strictEqual(oval, "bar");
				assert.strictEqual(path, "foo");
				seen = true;
			});

			tpl.unset("foo");
			assert.ok(seen);
		});

		it("observes dynamic path: *", function() {
			var seen = false;
			o = tpl.observe("*", function(nval, oval, path) {
				assert.deepEqual(nval, { bar: "baz" });
				assert.strictEqual(oval, "bar");
				assert.strictEqual(path, "foo");
				seen = true;
			});

			tpl.set("foo", { bar: "baz" });
			assert.ok(seen);
		});

		it("observes dynamic path: *.bar.baz", function() {
			var seen = false;
			o = tpl.observe("*.bar.baz", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			tpl.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("observes dynamic path: foo.*.baz", function() {
			var seen = false;
			o = tpl.observe("foo.*.baz", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			tpl.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("observes dynamic path: foo.bar.*", function() {
			var seen = false;
			o = tpl.observe("foo.bar.*", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			tpl.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("calling get() in an observer returns the new value", function() {
			var seen = false;
			o = tpl.observe("foo.bar", function(nval, oval, path) {
				assert.strictEqual(this.get(path), nval);
				seen = true;
			});

			tpl.set("foo.bar", "baz");
			assert.ok(seen);
		});
	});
});
},{"assert":11}],26:[function(require,module,exports){
module.exports={
	"ampersand_escape": {
		"js": "({\n  message: \"Some <code>\"\n})",
		"mustache": "{{&message}}",
		"txt": "Some <code></code>"
	},
	"array_of_strings": {
		"js": "({\n  array_of_strings: ['hello', 'world']\n})",
		"mustache": "{{#array_of_strings}}{{.}} {{/array_of_strings}}",
		"txt": "hello world"
	},
	"bug_11_eating_whitespace": {
		"js": "({\n  tag: \"yo\"\n})",
		"mustache": "{{tag}} foo",
		"txt": "yo foo"
	},
	"changing_delimiters": {
		"js": "({\n  \"foo\": \"foooooooooooooo\",\n  \"bar\": \"<b>bar!</b>\"\n})",
		"mustache": "{{=<% %>=}}<% foo %> {{foo}} <%{bar}%> {{{bar}}}",
		"txt": "foooooooooooooo {{foo}} <b>bar!</b> {{{bar}}}"
	},
	"check_falsy": {
		"js": "({\n  number: function(text, render) {\n    return function(text, render) {\n      return +render(text);\n    }\n  }\n})",
		"mustache": "<p>{{#number}}0{{/number}}</p>",
		"txt": "<p>0</p>"
	},
	"comments": {
		"js": "({\n  title: function () {\n    return \"A Comedy of Errors\";\n  }\n})",
		"mustache": "<h1>{{title}}{{! just something interesting... or not... }}</h1>",
		"txt": "<h1>A Comedy of Errors</h1>"
	},
	"complex": {
		"js": "({\n  header: function () {\n    return \"Colors\";\n  },\n  item: [\n      {name: \"red\", current: true, url: \"#Red\"},\n      {name: \"green\", current: false, url: \"#Green\"},\n      {name: \"blue\", current: false, url: \"#Blue\"}\n  ],\n  link: function () {\n    return this[\"current\"] !== true;\n  },\n  list: function () {\n    return this.item.length !== 0;\n  },\n  empty: function () {\n    return this.item.length === 0;\n  }\n})",
		"mustache": "<h1>{{header}}</h1>\n{{#list}}\n  <ul>\n  {{#item}}\n  {{#current}}\n  <li><strong>{{name}}</strong></li>\n  {{/current}}\n  {{#link}}\n  <li><a href=\"{{url}}\">{{name}}</a></li>\n  {{/link}}\n  {{/item}}\n  </ul>\n{{/list}}\n{{#empty}}\n  <p>The list is empty.</p>\n{{/empty}}",
		"txt": "<h1>Colors</h1>\n  <ul>\n  <li><strong>red</strong></li>\n  <li><a href=\"#Green\">green</a></li>\n  <li><a href=\"#Blue\">blue</a></li>\n  </ul>"
	},
	"context_lookup": {
		"js": "({\n  \"outer\": {\n    \"id\": 1,\n    \"second\": {\n      \"nothing\": 2\n    }\n  }\n})",
		"mustache": "{{#outer}}{{#second}}{{id}}{{/second}}{{/outer}}",
		"txt": "1"
	},
	"delimiters": {
		"js": "({\n  first: \"It worked the first time.\",\n  second: \"And it worked the second time.\",\n  third: \"Then, surprisingly, it worked the third time.\",\n  fourth: \"Fourth time also fine!.\"\n})",
		"mustache": "{{=<% %>=}}*\n<% first %>\n* <% second %>\n<%=| |=%>\n* | third |\n|={{ }}=|\n* {{ fourth }}",
		"txt": "*\nIt worked the first time.\n* And it worked the second time.\n* Then, surprisingly, it worked the third time.\n* Fourth time also fine!."
	},
	"disappearing_whitespace": {
		"js": "({\n  bedrooms: true,\n  total: 1\n})",
		"mustache": "{{#bedrooms}}{{total}}{{/bedrooms}} BED",
		"txt": "1 BED"
	},
	"dot_notation": {
		"js": "({\n  name: \"A Book\",\n  authors: [\"John Power\", \"Jamie Walsh\"],\n  price: {\n    value: 200,\n    vat: function () {\n      return this.value * 0.2;\n    },\n    currency: {\n      symbol: '$',\n      name: 'USD'\n    }\n  },\n  availability: {\n    status: true,\n    text: \"In Stock\"\n  },\n  // And now, some truthy false values\n  truthy: {\n    zero: 0,\n    notTrue: false\n  }\n})",
		"mustache": "<!-- exciting part -->\n<h1>{{name}}</h1>\n<p>Authors: <ul>{{#authors}}<li>{{.}}</li>{{/authors}}</ul></p>\n<p>Price: {{{price.currency.symbol}}}{{price.value}} {{#price.currency}}{{name}} <b>{{availability.text}}</b>{{/price.currency}}</p>\n<p>VAT: {{{price.currency.symbol}}}{{#price}}{{vat}}{{/price}}</p>\n<!-- boring part -->\n<h2>Test truthy false values:</h2>\n<p>Zero: {{truthy.zero}}</p>\n<p>False: {{truthy.notTrue}}</p>",
		"txt": "<h1>A Book</h1>\n<p>Authors: <ul><li>John Power</li><li>Jamie Walsh</li></ul></p>\n<p>Price: $200 USD <b>In Stock</b></p>\n<p>VAT: $40</p>\n\n<h2>Test truthy false values:</h2>\n<p>Zero: 0</p>\n<p>False: false</p>"
	},
	"double_render": {
		"js": "({\n  foo: true,\n  bar: \"{{win}}\",\n  win: \"FAIL\"\n})",
		"mustache": "{{#foo}}{{bar}}{{/foo}}",
		"txt": "{{win}}"
	},
	"empty_list": {
		"js": "({\n  jobs: []\n})",
		"mustache": "These are the jobs:\n{{#jobs}}\n{{.}}\n{{/jobs}}",
		"txt": "These are the jobs:"
	},
	"empty_sections": {
		"js": "({})",
		"mustache": "{{#foo}}{{/foo}}foo{{#bar}}{{/bar}}",
		"txt": "foo"
	},
	"empty_string": {
		"js": "({\n  description: \"That is all!\",\n  child: {\n    description: \"\"\n  }\n})",
		"mustache": "{{description}}{{#child}}{{description}}{{/child}}",
		"txt": "That is all!"
	},
	"empty_template": {
		"js": "({})",
		"mustache": "<html><head></head><body><h1>Test</h1></body></html>",
		"txt": "<html><head></head><body><h1>Test</h1></body></html>"
	},
	"error_not_found": {
		"js": "({\n  bar: 2\n})",
		"mustache": "{{foo}}",
		"txt": ""
	},
	"falsy": {
		"js": "({\n  \"emptyString\": \"\",\n  \"emptyArray\": [],\n  \"zero\": 0,\n  \"null\": null,\n  \"undefined\": undefined,\n  \"NaN\": 0/0\n})",
		"mustache": "{{#emptyString}}empty string{{/emptyString}}\n{{^emptyString}}inverted empty string{{/emptyString}}\n{{#emptyArray}}empty array{{/emptyArray}}\n{{^emptyArray}}inverted empty array{{/emptyArray}}\n{{#zero}}zero{{/zero}}\n{{^zero}}inverted zero{{/zero}}\n{{#null}}null{{/null}}\n{{^null}}inverted null{{/null}}\n{{#undefined}}undefined{{/undefined}}\n{{^undefined}}inverted undefined{{/undefined}}\n{{#NaN}}NaN{{/NaN}}\n{{^NaN}}inverted NaN{{/NaN}}",
		"txt": "inverted empty string\n\ninverted empty array\n\ninverted zero\n\ninverted null\n\ninverted undefined\n\ninverted NaN"
	},
	"grandparent_context": {
		"js": "({\n  grand_parent_id: 'grand_parent1',\n  parent_contexts: [\n    {\n      parent_id: 'parent1',\n      child_contexts: [\n        { child_id: 'parent1-child1' },\n        { child_id: 'parent1-child2' }\n      ]\n    },\n    {\n      parent_id: 'parent2',\n      child_contexts: [\n        { child_id: 'parent2-child1' },\n        { child_id: 'parent2-child2' }\n      ]\n    }\n  ]\n})",
		"mustache": "{{grand_parent_id}}\n{{#parent_contexts}}\n{{grand_parent_id}}\n{{parent_id}}\n{{#child_contexts}}\n{{grand_parent_id}}\n{{parent_id}}\n{{child_id}}\n{{/child_contexts}}\n{{/parent_contexts}}",
		"txt": "grand_parent1\ngrand_parent1\nparent1\ngrand_parent1\nparent1\nparent1-child1\ngrand_parent1\nparent1\nparent1-child2\ngrand_parent1\nparent2\ngrand_parent1\nparent2\nparent2-child1\ngrand_parent1\nparent2\nparent2-child2"
	},
	"included_tag": {
		"js": "({\n  html: \"I like {{mustache}}\"\n})",
		"mustache": "You said \"{{{html}}}\" today",
		"txt": "You said \"I like {{mustache}}\" today"
	},
	"inverted_section": {
		"js": "({\n  \"repos\": []\n})",
		"mustache": "{{#repos}}<b>{{name}}</b>{{/repos}}\n{{^repos}}No repos :({{/repos}}\n{{^nothin}}Hello!{{/nothin}}",
		"txt": "No repos :(\nHello!"
	},
	"keys_with_questionmarks": {
		"js": "({\n  \"person?\": {\n    name: \"Jon\"\n  }\n})",
		"mustache": "{{#person?}}\n  Hi {{name}}!\n{{/person?}}",
		"txt": "Hi Jon!"
	},
	"malicious_template": {
		"js": "({})",
		"mustache": "{{\"+(function () {throw \"evil\"})()+\"}}\n{{{\"+(function () {throw \"evil\"})()+\"}}}\n{{> \"+(function () {throw \"evil\"})()+\"}}\n{{# \"+(function () {throw \"evil\"})()+\"}}\n{{/ \"+(function () {throw \"evil\"})()+\"}}",
		"txt": ""
	},
	"multiline_comment": {
		"js": "({})",
		"mustache": "{{!\n\nThis is a multi-line comment.\n\n}}\nHello world!",
		"txt": "Hello world!"
	},
	"nested_dot": {
		"js": "({ name: 'Bruno' })",
		"mustache": "{{#name}}Hello {{.}}{{/name}}",
		"txt": "Hello Bruno"
	},
	"nested_iterating": {
		"js": "({\n  inner: [{\n    foo: 'foo',\n    inner: [{\n      bar: 'bar'\n    }]\n  }]\n})",
		"mustache": "{{#inner}}{{foo}}{{#inner}}{{bar}}{{/inner}}{{/inner}}",
		"txt": "foobar"
	},
	"nesting": {
		"js": "({\n  foo: [\n    {a: {b: 1}},\n    {a: {b: 2}},\n    {a: {b: 3}}\n  ]\n})",
		"mustache": "{{#foo}}\n  {{#a}}\n    {{b}}\n  {{/a}}\n{{/foo}}",
		"txt": "1\n    2\n    3"
	},
	"nesting_same_name": {
		"js": "({\n  items: [\n    {\n      name: 'name',\n      items: [1, 2, 3, 4]\n    }\n  ]\n})",
		"mustache": "{{#items}}{{name}}{{#items}}{{.}}{{/items}}{{/items}}",
		"txt": "name1234"
	},
	"null_string": {
		"js": "({\n  name: \"Elise\",\n  glytch: true,\n  binary: false,\n  value: null,\n  undef: undefined,\n  numeric: function() {\n    return NaN;\n  }\n})",
		"mustache": "Hello {{name}}\nglytch {{glytch}}\nbinary {{binary}}\nvalue {{value}}\nundef {{undef}}\nnumeric {{numeric}}",
		"txt": "Hello Elise\nglytch true\nbinary false\nvalue \nundef \nnumeric NaN"
	},
	"null_view": {
		"js": "({\n  name: 'Joe',\n  friends: null\n})",
		"mustache": "{{name}}'s friends: {{#friends}}{{name}}, {{/friends}}",
		"txt": "Joe's friends:"
	},
	"partial_empty": {
		"js": "({\n  foo: 1\n})",
		"mustache": "hey {{foo}}\n{{>partial}}",
		"partial": "",
		"txt": "hey 1"
	},
	"recursion_with_same_names": {
		"js": "({\n  name: 'name',\n  description: 'desc',\n  terms: [\n    {name: 't1', index: 0},\n    {name: 't2', index: 1}\n  ]\n})",
		"mustache": "{{ name }}\n{{ description }}\n\n{{#terms}}\n  {{name}}\n  {{index}}\n{{/terms}}",
		"txt": "name\ndesc\n\n  t1\n  0\n  t2\n  1"
	},
	"reuse_of_enumerables": {
		"js": "({\n  terms: [\n    {name: 't1', index: 0},\n    {name: 't2', index: 1}\n  ]\n})",
		"mustache": "{{#terms}}\n  {{name}}\n  {{index}}\n{{/terms}}\n{{#terms}}\n  {{name}}\n  {{index}}\n{{/terms}}",
		"txt": "t1\n  0\n  t2\n  1\n  t1\n  0\n  t2\n  1"
	},
	"section_as_context": {
		"js": "({\n  a_object: {\n    title: 'this is an object',\n    description: 'one of its attributes is a list',\n    a_list: [\n      {label: 'listitem1'},\n      {label: 'listitem2'}\n    ]\n  }\n})",
		"mustache": "{{#a_object}}\n  <h1>{{title}}</h1>\n  <p>{{description}}</p>\n  <ul>\n    {{#a_list}}\n    <li>{{label}}</li>\n    {{/a_list}}\n  </ul>\n{{/a_object}}",
		"txt": "<h1>this is an object</h1>\n  <p>one of its attributes is a list</p>\n  <ul>\n    <li>listitem1</li>\n    <li>listitem2</li>\n  </ul>"
	},
	"simple": {
		"js": "({\n  name: \"Chris\",\n  value: 10000,\n  taxed_value: function (tpl, ctx) {\n  \tvar val = tpl.get(\"value\");\n    return val - (val * 0.4);\n  },\n  in_ca: true\n})",
		"mustache": "Hello {{name}}\nYou have just won ${{value}}!\n{{#in_ca}}\nWell, ${{ taxed_value }}, after taxes.\n{{/in_ca}}",
		"txt": "Hello Chris\nYou have just won $10000!\nWell, $6000, after taxes."
	},
	"string_as_context": {
		"js": "({\n  a_string: 'aa',\n  a_list: ['a','b','c']\n})",
		"mustache": "<ul>\n{{#a_list}}\n  <li>{{a_string}}/{{.}}</li>\n{{/a_list}}\n</ul>",
		"txt": "<ul>\n  <li>aa/a</li>\n  <li>aa/b</li>\n  <li>aa/c</li>\n</ul>"
	},
	"two_in_a_row": {
		"js": "({\n  name: \"Joe\",\n  greeting: \"Welcome\"\n})",
		"mustache": "{{greeting}}, {{name}}!",
		"txt": "Welcome, Joe!"
	},
	"two_sections": {
		"js": "({})",
		"mustache": "{{#foo}}\n{{/foo}}\n{{#bar}}\n{{/bar}}",
		"txt": ""
	},
	"whitespace": {
		"js": "({\n  tag1: \"Hello\",\n  tag2: \"World\"\n})",
		"mustache": "{{tag1}}\n\n\n{{tag2}}.",
		"txt": "Hello\n\n\nWorld."
	},
	"zero_view": {
		"js": "({ nums: [0, 1, 2] })",
		"mustache": "{{#nums}}{{.}},{{/nums}}",
		"txt": "0,1,2,"
	}
}
},{}],27:[function(require,module,exports){
var assert = require("assert"),
	parse = require("../lib/parse"),
	inspect = require('util').inspect;

describe("#parse()", function() {

	it("parses basic html", function() {
		var template = parse("<div class=\"container\">Hello World</div>");
		
		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.ELEMENT,
			name: "div",
			attributes: [{
				type: parse.NODE_TYPE.ATTRIBUTE,
				name: "class",
				children: [{
					type: parse.NODE_TYPE.TEXT,
					value: "container"
				}]
			}],
			children: [{
				type: parse.NODE_TYPE.TEXT,
				value: "Hello World"
			}]
		}]);
	});

	it("parses mustache variables", function() {
		var template = parse("{{ hello }}{{{ world }}}{{& unescaped }}");
		// console.log(inspect(template));
		
		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.INTERPOLATOR,
			value: "hello"
		},{
			type: parse.NODE_TYPE.TRIPLE,
			value: "world"
		},{
			type: parse.NODE_TYPE.TRIPLE,
			value: "unescaped"
		}]);
	});

	it("parses mustache sections", function() {
		var template = parse("{{#good}}Hello{{/good}}{{^bad}}World{{/bad}}");
		
		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.SECTION,
			value: "good",
			children: [{
				type: parse.NODE_TYPE.TEXT,
				value: "Hello"
			}]
		},{
			type: parse.NODE_TYPE.INVERTED,
			value: "bad",
			children: [{
				type: parse.NODE_TYPE.TEXT,
				value: "World"
			}]
		}]);
	});

	it("parses mustache partials", function() {
		var template = parse("{{>partial}}");
		
		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.PARTIAL,
			value: "partial"
		}]);
	});

	it("parses deeply", function() {
		var template = parse("<div>{{ var }}</div>");

		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.ELEMENT,
			name: "div",
			attributes: [],
			children: [{
				type: parse.NODE_TYPE.INTERPOLATOR,
				value: "var"
			}]
		}]);
	});

});
},{"../lib/parse":6,"assert":11,"util":18}],28:[function(require,module,exports){
var spec = require("./mustache.json"),
	assert = require("assert");

describe('DOM Rendering', function () {
	describe('Mustache Test Suite', function () {
		function getContents(testName, ext) {
			return spec[testName][ext];
		}

		function getView(testName) {
			var view = getContents(testName, 'js');
			if (!view) throw new Error('Cannot find view for test "' + testName + '"');
			return eval(view);
		}

		function getPartial(testName) {
			try {
				return getContents(testName, 'partial');
			} catch (error) {
				// No big deal. Not all tests need to test partial support.
			}
		}

		function getTest(testName) {
			var test = {};
			test.name = testName;
			test.view = getView(testName);
			test.template = getContents(testName, 'mustache');
			test.partial = getPartial(testName);
			test.expect = getContents(testName, 'txt');
			return test;
		}

		testNames = Object.keys(spec).filter(function (name) {
			return spec[name].js != null;
		});

		testNames.forEach(function (testName) {
			var test = getTest(testName);

			var fn = function() {
				var tpl;

				if (test.partial) {
					assert.throw("Oops! partial!");
					// output = Mustache.render(test.template, test.view, { partial: test.partial });
				} else {
					tpl = new Temple({
						data: test.view,
						template: test.template
					});
				}

				assert.equal(tpl.toHTML(), test.expect);
			}

			fn.toString = function() {
				return  test.template + "\n====\n" +
					getContents(test.name, "js") + "\n====\n" +
					test.expect + "\n";
			}

			it("knows how to render '" + testName.split("_").join(" ") + "'", fn);
		});
	});
});
},{"./mustache.json":26,"assert":11}]},{},[24])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL2xpYi9jb250ZXh0LmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvZGVwcy5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbGliL2RvbS5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbGliL21vZGVsLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvb2JzZXJ2ZXIuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL2xpYi9wYXJzZS9pbmRleC5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbGliL3BhcnNlL3R5cGVzLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvcGFyc2UveG1sLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvdGVtcGxlLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvdXRpbC5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Fzc2VydC9hc3NlcnQuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9hc3NlcnQvbm9kZV9tb2R1bGVzL3V0aWwvc3VwcG9ydC9pc0J1ZmZlckJyb3dzZXIuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9hc3NlcnQvbm9kZV9tb2R1bGVzL3V0aWwvdXRpbC5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2V2ZW50cy9ldmVudHMuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbmhlcml0cy9pbmhlcml0c19icm93c2VyLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9ob2dhbi5qcy9saWIvY29tcGlsZXIuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9ob2dhbi5qcy9saWIvaG9nYW4uanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9ob2dhbi5qcy9saWIvdGVtcGxhdGUuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy91bmRlcnNjb3JlL3VuZGVyc2NvcmUuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL3Rlc3QvY2xhc3MuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL3Rlc3QvaW5kZXguanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL3Rlc3QvbW9kZWwuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL3Rlc3QvbXVzdGFjaGUuanNvbiIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvdGVzdC9wYXJzZS5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvdGVzdC9yZW5kZXIuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5WEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVrQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMU9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMU1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpfXZhciBmPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChmLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGYsZi5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcblxubW9kdWxlLmV4cG9ydHMgPSBDb250ZXh0O1xuXG5mdW5jdGlvbiBDb250ZXh0KHZhbHVlLCBwYXJlbnQsIHRlbXBsZSkge1xuXHR0aGlzLnZhbHVlID0gdmFsdWU7XG5cdHRoaXMucGFyZW50ID0gcGFyZW50O1xuXHR0aGlzLnRlbXBsZSA9IHRlbXBsZTtcblx0dGhpcy5oaWRkZW4gPSB7fTtcbn1cblxuQ29udGV4dC5wcm90b3R5cGUuZmluZCA9IGZ1bmN0aW9uKHBhdGgsIGN0eCkge1xuXHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdHZhbCA9IHRoaXMudGVtcGxlLl9nZXQodGhpcy52YWx1ZSwgcGF0aCwgY3R4KTtcblx0aWYgKHZhbCA9PSBudWxsKSB2YWwgPSB0aGlzLnRlbXBsZS5fZ2V0KHRoaXMuaGlkZGVuLCBwYXRoLCBjdHgpO1xuXHRyZXR1cm4gdmFsO1xufVxuXG5Db250ZXh0LnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbihwYXRoKSB7XG5cdHZhciBjdHggPSB0aGlzLCB2YWw7XG5cblx0Ly8gZG9uJ3QgdHJhdmVyc2UgcGFyZW50cyBpZiBzcGVjaWZpZWRcblx0aWYgKHR5cGVvZiBwYXRoID09PSBcInN0cmluZ1wiICYmIChwYXRoLmluZGV4T2YoXCIuXCIpID09PSAwIHx8IHBhdGggPT09IFwidGhpc1wiIHx8IHBhdGguaW5kZXhPZihcInRoaXMuXCIpID09PSAwKSkge1xuXHRcdGlmIChwYXRoLmluZGV4T2YoXCJ0aGlzXCIpID09PSAwKSBwYXRoID0gcGF0aC5zdWJzdHIoNCk7XG5cdFx0aWYgKHBhdGguaW5kZXhPZihcIi5cIikgPT09IDApIHBhdGggPSBwYXRoLnN1YnN0cigxKTtcblx0XHR2YWwgPSB0aGlzLmZpbmQocGF0aCk7XG5cdH0gZWxzZSB7XG5cdFx0d2hpbGUgKGN0eCAhPSBudWxsKSB7XG5cdFx0XHR2YWwgPSBjdHguZmluZChwYXRoLCB0aGlzKTtcblx0XHRcdGlmICh2YWwgIT0gbnVsbCkgYnJlYWs7XG5cdFx0XHRjdHggPSBjdHgucGFyZW50O1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiB2YWw7XG59XG5cbkNvbnRleHQucHJvdG90eXBlLnNwYXduID0gZnVuY3Rpb24odmFsKSB7XG5cdHJldHVybiBuZXcgQ29udGV4dCh2YWwsIHRoaXMsIHRoaXMudGVtcGxlKTtcbn0iLCIvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gUGFja2FnZSBkb2NzIGF0IGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHMgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciBEZXBzID1cbm1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfYWN0aXZlXG5EZXBzLmFjdGl2ZSA9IGZhbHNlO1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2N1cnJlbnRjb21wdXRhdGlvblxuRGVwcy5jdXJyZW50Q29tcHV0YXRpb24gPSBudWxsO1xuXG52YXIgc2V0Q3VycmVudENvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGMpIHtcbiAgRGVwcy5jdXJyZW50Q29tcHV0YXRpb24gPSBjO1xuICBEZXBzLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG4vLyBfYXNzaWduIGlzIGxpa2UgXy5leHRlbmQgb3IgdGhlIHVwY29taW5nIE9iamVjdC5hc3NpZ24uXG4vLyBDb3B5IHNyYydzIG93biwgZW51bWVyYWJsZSBwcm9wZXJ0aWVzIG9udG8gdGd0IGFuZCByZXR1cm5cbi8vIHRndC5cbnZhciBfaGFzT3duUHJvcGVydHkgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xudmFyIF9hc3NpZ24gPSBmdW5jdGlvbiAodGd0LCBzcmMpIHtcbiAgZm9yICh2YXIgayBpbiBzcmMpIHtcbiAgICBpZiAoX2hhc093blByb3BlcnR5LmNhbGwoc3JjLCBrKSlcbiAgICAgIHRndFtrXSA9IHNyY1trXTtcbiAgfVxuICByZXR1cm4gdGd0O1xufTtcblxudmFyIF9kZWJ1Z0Z1bmMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGxhenkgZXZhbHVhdGlvbiBiZWNhdXNlIGBNZXRlb3JgIGRvZXMgbm90IGV4aXN0IHJpZ2h0IGF3YXlcbiAgcmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG4gICAgICAgICAgKCh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5sb2cgP1xuICAgICAgICAgICBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuICAgICAgICAgICBmdW5jdGlvbiAoKSB7fSkpO1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcbiAgaWYgKHRocm93Rmlyc3RFcnJvcikge1xuICAgIHRocm93IGU7XG4gIH0gZWxzZSB7XG4gICAgX2RlYnVnRnVuYygpKFwiRXhjZXB0aW9uIGZyb20gRGVwcyBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIixcbiAgICAgICAgICAgICAgICAgZS5zdGFjayB8fCBlLm1lc3NhZ2UpO1xuICB9XG59O1xuXG4vLyBMaWtlIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7IGYoY29tcCk7IH0pYCBidXQgc2hvcnRlcixcbi8vIGFuZCBkb2Vzbid0IGNsdXR0ZXIgdGhlIHN0YWNrIHdpdGggYW4gZXh0cmEgZnJhbWUgb24gdGhlIGNsaWVudCxcbi8vIHdoZXJlIGBfbm9ZaWVsZHNBbGxvd2VkYCBpcyBhIG5vLW9wLiAgYGZgIG1heSBiZSBhIGNvbXB1dGF0aW9uXG4vLyBmdW5jdGlvbiBvciBhbiBvbkludmFsaWRhdGUgY2FsbGJhY2suXG52YXIgY2FsbFdpdGhOb1lpZWxkc0FsbG93ZWQgPSBmdW5jdGlvbiAoZiwgY29tcCkge1xuICBpZiAoKHR5cGVvZiBNZXRlb3IgPT09ICd1bmRlZmluZWQnKSB8fCBNZXRlb3IuaXNDbGllbnQpIHtcbiAgICBmKGNvbXApO1xuICB9IGVsc2Uge1xuICAgIE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcbiAgICAgIGYoY29tcCk7XG4gICAgfSk7XG4gIH1cbn07XG5cbnZhciBuZXh0SWQgPSAxO1xuLy8gY29tcHV0YXRpb25zIHdob3NlIGNhbGxiYWNrcyB3ZSBzaG91bGQgY2FsbCBhdCBmbHVzaCB0aW1lXG52YXIgcGVuZGluZ0NvbXB1dGF0aW9ucyA9IFtdO1xuLy8gYHRydWVgIGlmIGEgRGVwcy5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBEZXBzLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBEZXBzLmZsdXNoIG5vd1xudmFyIGluRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgY29tcHV0aW5nIGEgY29tcHV0YXRpb24gbm93LCBlaXRoZXIgZmlyc3QgdGltZVxuLy8gb3IgcmVjb21wdXRlLiAgVGhpcyBtYXRjaGVzIERlcHMuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBEZXBzLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBEZXBzLmZsdXNoIHRoYXQgd2UgYXJlIGluLiBXaGVuIHNldCwgdGhyb3cgcmF0aGVyIHRoYW4gbG9nIHRoZVxuLy8gZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQgd2hpbGUgZmx1c2hpbmcuIEJlZm9yZSB0aHJvd2luZyB0aGUgZXJyb3IsXG4vLyBmaW5pc2ggZmx1c2hpbmcgKGZyb20gYSBmaW5hbGx5IGJsb2NrKSwgbG9nZ2luZyBhbnkgc3Vic2VxdWVudFxuLy8gZXJyb3JzLlxudmFyIHRocm93Rmlyc3RFcnJvciA9IGZhbHNlO1xuXG52YXIgYWZ0ZXJGbHVzaENhbGxiYWNrcyA9IFtdO1xuXG52YXIgcmVxdWlyZUZsdXNoID0gZnVuY3Rpb24gKCkge1xuICBpZiAoISB3aWxsRmx1c2gpIHtcbiAgICBzZXRUaW1lb3V0KERlcHMuZmx1c2gsIDApO1xuICAgIHdpbGxGbHVzaCA9IHRydWU7XG4gIH1cbn07XG5cbi8vIERlcHMuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfY29tcHV0YXRpb25cbi8vXG5EZXBzLkNvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGYsIHBhcmVudCkge1xuICBpZiAoISBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbilcbiAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICBcIkRlcHMuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgcHJpdmF0ZTsgdXNlIERlcHMuYXV0b3J1blwiKTtcbiAgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuICBzZWxmLnN0b3BwZWQgPSBmYWxzZTtcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlZFxuICBzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fZmlyc3RydW5cbiAgc2VsZi5maXJzdFJ1biA9IHRydWU7XG5cbiAgc2VsZi5faWQgPSBuZXh0SWQrKztcbiAgc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG4gIC8vIHRoZSBwbGFuIGlzIGF0IHNvbWUgcG9pbnQgdG8gdXNlIHRoZSBwYXJlbnQgcmVsYXRpb25cbiAgLy8gdG8gY29uc3RyYWluIHRoZSBvcmRlciB0aGF0IGNvbXB1dGF0aW9ucyBhcmUgcHJvY2Vzc2VkXG4gIHNlbGYuX3BhcmVudCA9IHBhcmVudDtcbiAgc2VsZi5fZnVuYyA9IGY7XG4gIHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cbiAgdmFyIGVycm9yZWQgPSB0cnVlO1xuICB0cnkge1xuICAgIHNlbGYuX2NvbXB1dGUoKTtcbiAgICBlcnJvcmVkID0gZmFsc2U7XG4gIH0gZmluYWxseSB7XG4gICAgc2VsZi5maXJzdFJ1biA9IGZhbHNlO1xuICAgIGlmIChlcnJvcmVkKVxuICAgICAgc2VsZi5zdG9wKCk7XG4gIH1cbn07XG5cbl9hc3NpZ24oRGVwcy5Db21wdXRhdGlvbi5wcm90b3R5cGUsIHtcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9vbmludmFsaWRhdGVcbiAgb25JbnZhbGlkYXRlOiBmdW5jdGlvbiAoZikge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGZ1bmN0aW9uXCIpO1xuXG4gICAgaWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcbiAgICAgIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuICAgICAgICBjYWxsV2l0aE5vWWllbGRzQWxsb3dlZChmLCBzZWxmKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MucHVzaChmKTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZVxuICBpbnZhbGlkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcbiAgICAgIC8vIGlmIHdlJ3JlIGN1cnJlbnRseSBpbiBfcmVjb21wdXRlKCksIGRvbid0IGVucXVldWVcbiAgICAgIC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuICAgICAgaWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcbiAgICAgICAgcmVxdWlyZUZsdXNoKCk7XG4gICAgICAgIHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcbiAgICAgIH1cblxuICAgICAgc2VsZi5pbnZhbGlkYXRlZCA9IHRydWU7XG5cbiAgICAgIC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG4gICAgICAvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuICAgICAgZm9yKHZhciBpID0gMCwgZjsgZiA9IHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrc1tpXTsgaSsrKSB7XG4gICAgICAgIERlcHMubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGNhbGxXaXRoTm9ZaWVsZHNBbGxvd2VkKGYsIHNlbGYpO1xuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICAgIHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICAgIH1cbiAgfSxcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG4gIHN0b3A6IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoISB0aGlzLnN0b3BwZWQpIHtcbiAgICAgIHRoaXMuc3RvcHBlZCA9IHRydWU7XG4gICAgICB0aGlzLmludmFsaWRhdGUoKTtcbiAgICB9XG4gIH0sXG5cbiAgX2NvbXB1dGU6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgc2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG4gICAgdmFyIHByZXZpb3VzID0gRGVwcy5jdXJyZW50Q29tcHV0YXRpb247XG4gICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKHNlbGYpO1xuICAgIHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcbiAgICBpbkNvbXB1dGUgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICBjYWxsV2l0aE5vWWllbGRzQWxsb3dlZChzZWxmLl9mdW5jLCBzZWxmKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcbiAgICAgIGluQ29tcHV0ZSA9IGZhbHNlO1xuICAgIH1cbiAgfSxcblxuICBfcmVjb21wdXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgc2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuICAgIHRyeSB7XG4gICAgICB3aGlsZSAoc2VsZi5pbnZhbGlkYXRlZCAmJiAhIHNlbGYuc3RvcHBlZCkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgIHNlbGYuX2NvbXB1dGUoKTtcbiAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgIF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuICAgICAgICB9XG4gICAgICAgIC8vIElmIF9jb21wdXRlKCkgaW52YWxpZGF0ZWQgdXMsIHdlIHJ1biBhZ2FpbiBpbW1lZGlhdGVseS5cbiAgICAgICAgLy8gQSBjb21wdXRhdGlvbiB0aGF0IGludmFsaWRhdGVzIGl0c2VsZiBpbmRlZmluaXRlbHkgaXMgYW5cbiAgICAgICAgLy8gaW5maW5pdGUgbG9vcCwgb2YgY291cnNlLlxuICAgICAgICAvL1xuICAgICAgICAvLyBXZSBjb3VsZCBwdXQgYW4gaXRlcmF0aW9uIGNvdW50ZXIgaGVyZSBhbmQgY2F0Y2ggcnVuLWF3YXlcbiAgICAgICAgLy8gbG9vcHMuXG4gICAgICB9XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG4gICAgfVxuICB9XG59KTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfZGVwZW5kZW5jeVxuLy9cbkRlcHMuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcbiAgdGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbl9hc3NpZ24oRGVwcy5EZXBlbmRlbmN5LnByb3RvdHlwZSwge1xuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2RlcGVuZFxuICAvL1xuICAvLyBBZGRzIGBjb21wdXRhdGlvbmAgdG8gdGhpcyBzZXQgaWYgaXQgaXMgbm90IGFscmVhZHlcbiAgLy8gcHJlc2VudC4gIFJldHVybnMgdHJ1ZSBpZiBgY29tcHV0YXRpb25gIGlzIGEgbmV3IG1lbWJlciBvZiB0aGUgc2V0LlxuICAvLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbiAgLy8gaWYgdGhlcmUgaXMgbm8gY3VycmVudENvbXB1dGF0aW9uLlxuICBkZXBlbmQ6IGZ1bmN0aW9uIChjb21wdXRhdGlvbikge1xuICAgIGlmICghIGNvbXB1dGF0aW9uKSB7XG4gICAgICBpZiAoISBEZXBzLmFjdGl2ZSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuXG4gICAgICBjb21wdXRhdGlvbiA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICAgIH1cbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgdmFyIGlkID0gY29tcHV0YXRpb24uX2lkO1xuICAgIGlmICghIChpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZCkpIHtcbiAgICAgIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXSA9IGNvbXB1dGF0aW9uO1xuICAgICAgY29tcHV0YXRpb24ub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgZGVsZXRlIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfSxcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2NoYW5nZWRcbiAgY2hhbmdlZDogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBmb3IgKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcbiAgICAgIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG4gIH0sXG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9oYXNkZXBlbmRlbnRzXG4gIGhhc0RlcGVuZGVudHM6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgZm9yKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufSk7XG5cbl9hc3NpZ24oRGVwcywge1xuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2ZsdXNoXG4gIGZsdXNoOiBmdW5jdGlvbiAoX29wdHMpIHtcbiAgICAvLyBYWFggV2hhdCBwYXJ0IG9mIHRoZSBjb21tZW50IGJlbG93IGlzIHN0aWxsIHRydWU/IChXZSBubyBsb25nZXJcbiAgICAvLyBoYXZlIFNwYXJrKVxuICAgIC8vXG4gICAgLy8gTmVzdGVkIGZsdXNoIGNvdWxkIHBsYXVzaWJseSBoYXBwZW4gaWYsIHNheSwgYSBmbHVzaCBjYXVzZXNcbiAgICAvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG4gICAgLy8gYXBwIGV2ZW50IGhhbmRsZXIgdGhhdCBjYWxscyBEZXBzLmZsdXNoLiAgQXQgdGhlIG1vbWVudFxuICAgIC8vIFNwYXJrIGJsb2NrcyBldmVudCBoYW5kbGVycyBkdXJpbmcgRE9NIG11dGF0aW9uIGFueXdheSxcbiAgICAvLyBiZWNhdXNlIHRoZSBMaXZlUmFuZ2UgdHJlZSBpc24ndCB2YWxpZC4gIEFuZCB3ZSBkb24ndCBoYXZlXG4gICAgLy8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG4gICAgLy9cbiAgICAvLyBodHRwczovL2FwcC5hc2FuYS5jb20vMC8xNTk5MDgzMzAyNDQvMzg1MTM4MjMzODU2XG4gICAgaWYgKGluRmx1c2gpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBjYWxsIERlcHMuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cbiAgICBpZiAoaW5Db21wdXRlKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmx1c2ggaW5zaWRlIERlcHMuYXV0b3J1blwiKTtcblxuICAgIGluRmx1c2ggPSB0cnVlO1xuICAgIHdpbGxGbHVzaCA9IHRydWU7XG4gICAgdGhyb3dGaXJzdEVycm9yID0gISEgKF9vcHRzICYmIF9vcHRzLl90aHJvd0ZpcnN0RXJyb3IpO1xuXG4gICAgdmFyIGZpbmlzaGVkVHJ5ID0gZmFsc2U7XG4gICAgdHJ5IHtcbiAgICAgIHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCB8fFxuICAgICAgICAgICAgIGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cbiAgICAgICAgLy8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuICAgICAgICB3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGgpIHtcbiAgICAgICAgICB2YXIgY29tcCA9IHBlbmRpbmdDb21wdXRhdGlvbnMuc2hpZnQoKTtcbiAgICAgICAgICBjb21wLl9yZWNvbXB1dGUoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuICAgICAgICAgIC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuICAgICAgICAgIC8vIGludmFsaWRhdGUgbW9yZSBjb21wdXRhdGlvbnNcbiAgICAgICAgICB2YXIgZnVuYyA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcbiAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgZnVuYygpO1xuICAgICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICAgIF90aHJvd09yTG9nKFwiYWZ0ZXJGbHVzaCBmdW5jdGlvblwiLCBlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGZpbmlzaGVkVHJ5ID0gdHJ1ZTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgaWYgKCEgZmluaXNoZWRUcnkpIHtcbiAgICAgICAgLy8gd2UncmUgZXJyb3JpbmdcbiAgICAgICAgaW5GbHVzaCA9IGZhbHNlOyAvLyBuZWVkZWQgYmVmb3JlIGNhbGxpbmcgYERlcHMuZmx1c2goKWAgYWdhaW5cbiAgICAgICAgRGVwcy5mbHVzaCh7X3Rocm93Rmlyc3RFcnJvcjogZmFsc2V9KTsgLy8gZmluaXNoIGZsdXNoaW5nXG4gICAgICB9XG4gICAgICB3aWxsRmx1c2ggPSBmYWxzZTtcbiAgICAgIGluRmx1c2ggPSBmYWxzZTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19hdXRvcnVuXG4gIC8vXG4gIC8vIFJ1biBmKCkuIFJlY29yZCBpdHMgZGVwZW5kZW5jaWVzLiBSZXJ1biBpdCB3aGVuZXZlciB0aGVcbiAgLy8gZGVwZW5kZW5jaWVzIGNoYW5nZS5cbiAgLy9cbiAgLy8gUmV0dXJucyBhIG5ldyBDb21wdXRhdGlvbiwgd2hpY2ggaXMgYWxzbyBwYXNzZWQgdG8gZi5cbiAgLy9cbiAgLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4gIC8vIHNvIHRoYXQgaXQgaXMgc3RvcHBlZCBpZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZC5cbiAgYXV0b3J1bjogZnVuY3Rpb24gKGYpIHtcbiAgICBpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0RlcHMuYXV0b3J1biByZXF1aXJlcyBhIGZ1bmN0aW9uIGFyZ3VtZW50Jyk7XG5cbiAgICBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IHRydWU7XG4gICAgdmFyIGMgPSBuZXcgRGVwcy5Db21wdXRhdGlvbihmLCBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbik7XG5cbiAgICBpZiAoRGVwcy5hY3RpdmUpXG4gICAgICBEZXBzLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgIGMuc3RvcCgpO1xuICAgICAgfSk7XG5cbiAgICByZXR1cm4gYztcbiAgfSxcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX25vbnJlYWN0aXZlXG4gIC8vXG4gIC8vIFJ1biBgZmAgd2l0aCBubyBjdXJyZW50IGNvbXB1dGF0aW9uLCByZXR1cm5pbmcgdGhlIHJldHVybiB2YWx1ZVxuICAvLyBvZiBgZmAuICBVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4gIC8vIHNvIHRoYXQgcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFjY2Vzc2VkIGJ5IGBmYCB3aWxsIG5vdCByZXN1bHQgaW4gYW55XG4gIC8vIGNvbXB1dGF0aW9ucyBiZWluZyBpbnZhbGlkYXRlZC5cbiAgbm9ucmVhY3RpdmU6IGZ1bmN0aW9uIChmKSB7XG4gICAgdmFyIHByZXZpb3VzID0gRGVwcy5jdXJyZW50Q29tcHV0YXRpb247XG4gICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuICAgIHRyeSB7XG4gICAgICByZXR1cm4gZigpO1xuICAgIH0gZmluYWxseSB7XG4gICAgICBzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuICAgIH1cbiAgfSxcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX29uaW52YWxpZGF0ZVxuICBvbkludmFsaWRhdGU6IGZ1bmN0aW9uIChmKSB7XG4gICAgaWYgKCEgRGVwcy5hY3RpdmUpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJEZXBzLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuICAgIERlcHMuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmKTtcbiAgfSxcblxuICAvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2FmdGVyZmx1c2hcbiAgYWZ0ZXJGbHVzaDogZnVuY3Rpb24gKGYpIHtcbiAgICBhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goZik7XG4gICAgcmVxdWlyZUZsdXNoKCk7XG4gIH1cbn0pOyIsInZhciBwYXJzZSA9IHJlcXVpcmUoXCIuL3BhcnNlXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKSxcblx0XyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHROT0RFX1RZUEUgPSBwYXJzZS5OT0RFX1RZUEU7XG5cbmV4cG9ydHMucGFpbnQgPSBmdW5jdGlvbigpIHtcblx0dGhpcy5yZW5kZXIoKTtcbn1cblxuZXhwb3J0cy50b0hUTUwgPSBmdW5jdGlvbigpIHtcblx0dGhpcy5wYWludCgpO1xuXHRcblx0dmFyIGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdFxuXHRmb3IgKHZhciBpIGluIHRoaXMubm9kZXMpIHtcblx0XHRkaXYuYXBwZW5kQ2hpbGQodGhpcy5ub2Rlc1tpXS5jbG9uZU5vZGUodHJ1ZSkpO1xuXHR9XG5cblx0cmV0dXJuIGRpdi5pbm5lckhUTUwudHJpbSgpO1xufVxuXG5leHBvcnRzLnJlbmRlciA9IGZ1bmN0aW9uKCkge1xuXHRpZiAodGhpcy5fcmVuZGVyZWQpIHJldHVybiB0aGlzLm5vZGVzO1xuXHR0aGlzLm5vZGVzID0gdGhpcy5fcmVuZGVyKCk7XG5cdHRoaXMuX3JlbmRlcmVkID0gdHJ1ZTtcblx0dGhpcy5lbWl0KFwicmVuZGVyXCIsIHRoaXMubm9kZXMpO1xuXHRyZXR1cm4gdGhpcztcbn1cblxuZXhwb3J0cy5fcmVuZGVyID0gZnVuY3Rpb24odG9rZW5zKSB7XG5cdGlmICh0b2tlbnMgPT0gbnVsbCkgdG9rZW5zID0gcGFyc2UodGhpcy50ZW1wbGF0ZSk7XG5cdHJldHVybiB0aGlzLl9idWlsZEVsZW1lbnRzKHRva2Vucyk7XG59XG5cbmV4cG9ydHMuX2J1aWxkRWxlbWVudHMgPSBmdW5jdGlvbih0cmVlLCBjdHgpIHtcblx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzLmNyZWF0ZUNvbnRleHQoKTtcblxuXHRyZXR1cm4gdHJlZS5tYXAoZnVuY3Rpb24obm9kZSkge1xuXHRcdHZhciBidWlsZCA9IHRoaXMuX2J1aWxkLmVsZW1lbnRbbm9kZS50eXBlXTtcblx0XHRpZiAoYnVpbGQgIT0gbnVsbCkgcmV0dXJuIGJ1aWxkLmNhbGwodGhpcywgbm9kZSwgY3R4KTtcblx0XHRjb25zb2xlLmxvZyhub2RlKTtcblx0fSwgdGhpcykucmVkdWNlKGZ1bmN0aW9uKG5vZGVzLCBub2RlKSB7XG5cdFx0cmV0dXJuIG5vZGVzLmNvbmNhdChBcnJheS5pc0FycmF5KG5vZGUpID8gXy5mbGF0dGVuKG5vZGUpIDogbm9kZSk7XG5cdH0sIFtdKS5maWx0ZXIoZnVuY3Rpb24oYykge1xuXHRcdHJldHVybiBjICE9IG51bGw7XG5cdH0pO1xufVxuXG5leHBvcnRzLl9idWlsZEF0dHJpYnV0ZSA9IGZ1bmN0aW9uKG5vZGVzLCBjdHgpIHtcblx0cmV0dXJuIG5vZGVzLm1hcChmdW5jdGlvbihub2RlKSB7XG5cdFx0dmFyIGJ1aWxkID0gdGhpcy5fYnVpbGQuYXR0cmlidXRlW25vZGUudHlwZV07XG5cdFx0aWYgKGJ1aWxkICE9IG51bGwpIHJldHVybiBidWlsZC5jYWxsKHRoaXMsIG5vZGUsIGN0eCk7XG5cdFx0Y29uc29sZS5sb2cobm9kZSk7XG5cdH0sIHRoaXMpLmpvaW4oXCJcIik7XG59XG5cbnZhciBfYnVpbGQgPVxuZXhwb3J0cy5fYnVpbGQgPSB7XG5cdGVsZW1lbnQ6IHt9LFxuXHRhdHRyaWJ1dGU6IHt9XG59XG5cbl9idWlsZC5lbGVtZW50W05PREVfVFlQRS5FTEVNRU5UXSA9IGZ1bmN0aW9uKG5vZGUsIGN0eCkge1xuXHR2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KG5vZGUubmFtZSk7XG5cdFxuXHRub2RlLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG5cdFx0ZWwuc2V0QXR0cmlidXRlKGF0dHIubmFtZSwgdGhpcy5fYnVpbGRBdHRyaWJ1dGUoYXR0ci5jaGlsZHJlbiwgY3R4KSk7XG5cdH0sIHRoaXMpO1xuXG5cdHRoaXMuX2J1aWxkRWxlbWVudHMobm9kZS5jaGlsZHJlbiwgY3R4KS5mb3JFYWNoKGZ1bmN0aW9uKGNoaWxkKSB7XG5cdFx0ZWwuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXHR9KTtcblxuXHRyZXR1cm4gZWw7XG59XG5cbl9idWlsZC5lbGVtZW50W05PREVfVFlQRS5URVhUXSA9IGZ1bmN0aW9uKG5vZGUsIGN0eCkge1xuXHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobm9kZS52YWx1ZSk7XG59XG5cbl9idWlsZC5lbGVtZW50W05PREVfVFlQRS5JTlRFUlBPTEFUT1JdID0gZnVuY3Rpb24obm9kZSwgY3R4KSB7XG5cdHZhciB2YWwgPSBjdHguZ2V0KG5vZGUudmFsdWUpO1xuXHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodmFsID09IG51bGwgPyBcIlwiIDogdmFsKTtcbn1cblxuX2J1aWxkLmVsZW1lbnRbTk9ERV9UWVBFLlRSSVBMRV0gPSBmdW5jdGlvbihub2RlLCBjdHgpIHtcblx0dmFyIHZhbCA9IGN0eC5nZXQobm9kZS52YWx1ZSksXG5cdFx0ZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSxcblx0XHRjaGlsZHJlbiA9IFtdLCBpO1xuXG5cdGRpdi5pbm5lckhUTUwgPSB2YWwgPT0gbnVsbCA/IFwiXCIgOiB2YWw7XG5cblx0Zm9yIChpID0gMDsgaSA8IGRpdi5jaGlsZE5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0Y2hpbGRyZW4ucHVzaChkaXYuY2hpbGROb2Rlc1tpXSk7XG5cdH1cblxuXHRyZXR1cm4gY2hpbGRyZW47XG59XG5cbl9idWlsZC5lbGVtZW50W05PREVfVFlQRS5TRUNUSU9OXSA9IGZ1bmN0aW9uKG5vZGUsIGN0eCkge1xuXHR2YXIgc2VsZiA9IHRoaXMsIGVscyA9IFtdO1xuXG5cdHByb2Nlc3NTZWN0aW9uKGN0eCwgbm9kZS52YWx1ZSwgZnVuY3Rpb24obmN0eCkge1xuXHRcdGVscy5wdXNoKHNlbGYuX2J1aWxkRWxlbWVudHMobm9kZS5jaGlsZHJlbiwgbmN0eCkpO1xuXHR9KTtcblxuXHRyZXR1cm4gZWxzO1xufVxuXG5fYnVpbGQuZWxlbWVudFtOT0RFX1RZUEUuSU5WRVJURURdID0gZnVuY3Rpb24obm9kZSwgY3R4KSB7XG5cdGlmIChpc0VtcHR5U2VjdGlvbihjdHguZ2V0KG5vZGUudmFsdWUpKSlcblx0XHRyZXR1cm4gdGhpcy5fYnVpbGRFbGVtZW50cyhub2RlLmNoaWxkcmVuLCBjdHgpO1xufVxuXG5fYnVpbGQuYXR0cmlidXRlW05PREVfVFlQRS5URVhUXSA9IGZ1bmN0aW9uKG5vZGUsIGN0eCkge1xuXHRyZXR1cm4gbm9kZS52YWx1ZTtcbn1cblxuX2J1aWxkLmF0dHJpYnV0ZVtOT0RFX1RZUEUuSU5URVJQT0xBVE9SXSA9IGZ1bmN0aW9uKG5vZGUsIGN0eCkge1xuXHR2YXIgdmFsID0gY3R4LmdldChub2RlLnZhbHVlKTtcblx0cmV0dXJuIHZhbCAhPSBudWxsID8gXy5lc2NhcGUodmFsKSA6IFwiXCI7XG59XG5cbl9idWlsZC5hdHRyaWJ1dGVbTk9ERV9UWVBFLlNFQ1RJT05dID0gZnVuY3Rpb24obm9kZSwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcywgZWxzID0gW107XG5cblx0cHJvY2Vzc1NlY3Rpb24oY3R4LCBub2RlLnZhbHVlLCBmdW5jdGlvbihuY3R4KSB7XG5cdFx0ZWxzLnB1c2goc2VsZi5fYnVpbGRBdHRyaWJ1dGUobm9kZS5jaGlsZHJlbiwgbmN0eCkpO1xuXHR9KTtcblxuXHRyZXR1cm4gZWxzLmpvaW4oXCJcIik7XG59XG5cbmZ1bmN0aW9uIGlzRW1wdHlTZWN0aW9uKHZhbCkge1xuXHRyZXR1cm4gIXZhbCB8fCAoXy5pc0FycmF5KHZhbCkgJiYgIXZhbC5sZW5ndGgpO1xufVxuXG5mdW5jdGlvbiBwcm9jZXNzU2VjdGlvbihjdHgsIHBhdGgsIGZuKSB7XG5cdHZhciB2YWwgPSBjdHguZ2V0KHBhdGgpO1xuXHRpZiAoaXNFbXB0eVNlY3Rpb24odmFsKSkgcmV0dXJuIGZhbHNlO1xuXG5cdGlmIChfLmlzQXJyYXkodmFsKSkge1xuXHRcdHZhbC5mb3JFYWNoKGZ1bmN0aW9uKHYsIGluZGV4KSB7XG5cdFx0XHR2YXIgbmN0eCA9IGN0eC5zcGF3bih2KTtcblx0XHRcdG5jdHguaGlkZGVuLiRpbmRleCA9IGluZGV4O1xuXHRcdFx0Zm4obmN0eCk7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0Zm4oY3R4LnNwYXduKHZhbCkpO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59IiwidmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpLFxuXHREZXBzID0gcmVxdWlyZShcIi4vZGVwc1wiKSxcblx0XyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRDb250ZXh0ID0gcmVxdWlyZShcIi4vY29udGV4dFwiKSxcblx0T2JzZXJ2ZXIgPSByZXF1aXJlKFwiLi9vYnNlcnZlclwiKTtcblxuZXhwb3J0cy5jcmVhdGVDb250ZXh0ID0gZnVuY3Rpb24odmFsKSB7XG5cdHJldHVybiBuZXcgQ29udGV4dChfLmlzVW5kZWZpbmVkKHZhbCkgPyB0aGlzLmRhdGEgOiB2YWwsIG51bGwsIHRoaXMpO1xufVxuXG5leHBvcnRzLmF1dG9ydW4gPSBmdW5jdGlvbihmbikge1xuXHRyZXR1cm4gVGVtcGxlLkRlcHMuYXV0b3J1bihmbi5iaW5kKHRoaXMpKTtcbn1cblxuZXhwb3J0cy5nZXQgPSBmdW5jdGlvbihwYXRoKSB7XHRcdFxuXHRpZiAoRGVwcy5hY3RpdmUpIHRoaXMuZGVwZW5kKHBhdGgpO1xuXHRyZXR1cm4gdGhpcy5fZ2V0KHRoaXMuZGF0YSwgcGF0aCk7XG59XG5cbmV4cG9ydHMuX2dldCA9IGZ1bmN0aW9uKG9iaiwgcGF0aCwgY3R4KSB7XG5cdHZhciBwYXJ0cyA9IHV0aWwuc3BsaXRQYXRoKHBhdGgpO1xuXHRcblx0d2hpbGUgKHBhcnRzLmxlbmd0aCkge1xuXHRcdGlmIChvYmogPT0gbnVsbCkgcmV0dXJuO1xuXHRcdG9iaiA9IG9ialtwYXJ0cy5zaGlmdCgpXTtcblx0fVxuXG5cdGlmICh0eXBlb2Ygb2JqID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXMuY3JlYXRlQ29udGV4dCgpO1xuXHRcdG9iaiA9IG9iai5jYWxsKGN0eC5nZXQoKSwgdGhpcywgY3R4KTtcblx0fVxuXG5cdHJldHVybiBvYmo7XG59XG5cbmV4cG9ydHMuZGVwZW5kID0gZnVuY3Rpb24ocGF0aCkge1xuXHRwYXRoID0gdXRpbC5qb2luUGF0aCh1dGlsLnNwbGl0UGF0aChwYXRoKSk7IC8vIGVuc3VyZSB2YWxpZGl0eVxuXHR2YXIgZGVwID0gdGhpcy5fZGVwc1twYXRoXTtcblxuXHQvLyBjcmVhdGUgaWYgZG9lc24ndCBleGlzdFxuXHRpZiAoZGVwID09IG51bGwpIHtcblx0XHRkZXAgPSB0aGlzLl9kZXBzW3BhdGhdID0gbmV3IERlcHMuRGVwZW5kZW5jeTtcblx0XHRkZXAuX29ic2VydmVyID0gdGhpcy5vYnNlcnZlKHBhdGgsIGZ1bmN0aW9uKCkgeyBkZXAuY2hhbmdlZCgpOyB9KTtcblx0fVxuXG5cdGRlcC5kZXBlbmQoKTtcblx0cmV0dXJuIHRoaXM7XG59XG5cbmV4cG9ydHMuc2V0ID0gZnVuY3Rpb24oa2V5LCB2YWwpIHtcblx0dmFyIG1peGluID0ga2V5LFxuXHRcdHNlbGYgPSB0aGlzLFxuXHRcdHBhcnRzLCBjdXIsIHBhcnQsIGNoYW5nZXM7XG5cblx0aWYgKHR5cGVvZiBrZXkgPT09IFwic3RyaW5nXCIpIHtcblx0XHRtaXhpbiA9IHt9O1xuXHRcdHBhcnRzID0gdXRpbC5zcGxpdFBhdGgoa2V5KTtcblx0XHRjdXIgPSBtaXhpbjtcblxuXHRcdHdoaWxlIChwYXJ0cy5sZW5ndGgpIHtcblx0XHRcdHBhcnQgPSBwYXJ0cy5zaGlmdCgpO1xuXHRcdFx0Y3VyID0gKGN1cltwYXJ0XSA9IHBhcnRzLmxlbmd0aCA9PT0gMCA/IHZhbCA6IHt9KTtcblx0XHR9XG5cdH1cblxuXHRjaGFuZ2VzID0gW107XG5cdHRoaXMuZGF0YSA9IHRoaXMuX3NldCh0aGlzLmRhdGEsIG1peGluLCBjaGFuZ2VzKTtcblx0XG5cdGNoYW5nZXMuZm9yRWFjaChmdW5jdGlvbihhcmdzKSB7IHRoaXMuX2hhbmRsZUNoYW5nZS5hcHBseSh0aGlzLCBhcmdzKTsgfSwgdGhpcyk7XG5cblx0dGhpcy5lbWl0KFwiY2hhbmdlXCIpO1xuXG5cdHJldHVybiB0aGlzO1xufVxuXG5leHBvcnRzLl9zZXQgPSBmdW5jdGlvbihiYXNlLCBtaXhpbiwgY2hhbmdlcywga2V5cykge1xuXHR2YXIgb2xkdmFsLCBrLCBfY2hhbmdlcztcblxuXHRpZiAoa2V5cyA9PSBudWxsKSBrZXlzID0gW107XG5cblx0Ly8gZ2VuZXJpYyBvYmplY3RzIGFyZSBkZWVwIGNvcGllZCBvbnRvIGJhc2Vcblx0aWYgKHV0aWwuaXNHZW5lcmljT2JqZWN0KG1peGluKSkge1xuXHRcdGlmICghdXRpbC5pc0dlbmVyaWNPYmplY3QoYmFzZSkpIHtcblx0XHRcdG9sZHZhbCA9IGJhc2U7XG5cdFx0XHRiYXNlID0ge307XG5cdFx0XHRfY2hhbmdlcyA9IGNoYW5nZXM7XG5cdFx0XHRjaGFuZ2VzID0gbnVsbDtcblx0XHR9XG5cdFx0XHRcblx0XHRmb3IgKGsgaW4gbWl4aW4pIHtcblx0XHRcdGJhc2Vba10gPSB0aGlzLl9zZXQoYmFzZVtrXSwgbWl4aW5ba10sIGNoYW5nZXMsIGtleXMuY29uY2F0KGspKTtcblx0XHR9XG5cblx0XHRpZiAoXy5pc0FycmF5KF9jaGFuZ2VzKSkgX2NoYW5nZXMucHVzaChbIGtleXMsIGJhc2UsIG9sZHZhbCBdKTtcblx0fSBlbHNlIHtcblx0XHRpZiAoXy5pc0FycmF5KGNoYW5nZXMpKSBjaGFuZ2VzLnB1c2goWyBrZXlzLCBtaXhpbiwgYmFzZSBdKTtcblx0XHRiYXNlID0gbWl4aW47XG5cdH1cblxuXHRyZXR1cm4gYmFzZTtcbn1cblxuZXhwb3J0cy51bnNldCA9IGZ1bmN0aW9uKGtleSkge1xuXHR2YXIgcGFydHMgPSB1dGlsLnNwbGl0UGF0aChrZXkpLFxuXHRcdGluaXRpYWwsIGRhdGEsIG9sZHZhbCwgbGFzdDtcblxuXHRpZiAoIXBhcnRzLmxlbmd0aCkge1xuXHRcdG9sZHZhbCA9IHRoaXMuZGF0YTtcblx0XHRkZWxldGUgdGhpcy5kYXRhO1xuXHR9IGVsc2Uge1xuXHRcdGluaXRpYWwgPSBfLmluaXRpYWwocGFydHMpO1xuXHRcdGRhdGEgPSB0aGlzLmRhdGE7XG5cblx0XHR3aGlsZSAoaW5pdGlhbC5sZW5ndGgpIHtcblx0XHRcdGlmICghdXRpbC5pc0dlbmVyaWNPYmplY3QoZGF0YSkpIHJldHVybiB0aGlzO1xuXHRcdFx0ZGF0YSA9IGRhdGFbaW5pdGlhbC5zaGlmdCgpXTtcblx0XHR9XG5cblx0XHRpZiAodXRpbC5pc0dlbmVyaWNPYmplY3QoZGF0YSkpIHtcblx0XHRcdGxhc3QgPSBfLmxhc3QocGFydHMpO1xuXHRcdFx0b2xkdmFsID0gZGF0YVtsYXN0XTtcblx0XHRcdGRlbGV0ZSBkYXRhW2xhc3RdO1xuXHRcdH1cblx0fVxuXG5cdGlmIChvbGR2YWwgIT0gbnVsbCkgdGhpcy5faGFuZGxlQ2hhbmdlKHBhcnRzLCB2b2lkIDAsIG9sZHZhbCk7XG5cblx0cmV0dXJuIHRoaXM7XG59XG5cbmV4cG9ydHMuX2hhbmRsZUNoYW5nZSA9IGZ1bmN0aW9uKGtleXMsIG5ld3ZhbCwgb2xkdmFsKSB7XG5cdHRoaXMuX29ic2VydmVycy5mb3JFYWNoKGZ1bmN0aW9uKG8pIHtcblx0XHRvLmhhbmRsZShrZXlzLCBuZXd2YWwsIG9sZHZhbCk7XG5cdH0pO1xuXHR0aGlzLmVtaXQoXCJjaGFuZ2U6XCIgKyB1dGlsLmpvaW5QYXRoKGtleXMpLCBuZXd2YWwsIG9sZHZhbCk7XG59XG5cbmV4cG9ydHMub2JzZXJ2ZSA9IGZ1bmN0aW9uKHBhdGgsIGZuKSB7XG5cdHJldHVybiBuZXcgT2JzZXJ2ZXIocGF0aCwgZm4sIHRoaXMpO1xufSIsInZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKFwiZXZlbnRzXCIpLkV2ZW50RW1pdHRlcixcblx0XyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxubW9kdWxlLmV4cG9ydHMgPSB1dGlsLnN1YmNsYXNzKEV2ZW50RW1pdHRlciwge1xuXG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihwYXRoLCBmbiwgdGVtcGxlKSB7XG5cdFx0aWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBmdW5jdGlvbiB0byBjYWxsIG9uIGNoYW5nZS5cIik7XG5cdFx0RXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cblx0XHR0aGlzLnBhdGggPSBwYXRoO1xuXHRcdHRoaXMucGFydHMgPSB1dGlsLnBhcnNlUGF0aChwYXRoKTtcblx0XHR0aGlzLmNhbGxiYWNrID0gZm47XG5cdFx0dGhpcy5zdG9wcGVkID0gZmFsc2U7XG5cblx0XHR0aGlzLnRlbXBsZSA9IHRlbXBsZTtcblx0XHR0ZW1wbGUuX29ic2VydmVycy5wdXNoKHRoaXMpO1xuXHR9LFxuXG5cdHN0b3A6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLnN0b3BwZWQpIHJldHVybjtcblx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXG5cdFx0Ly8gcmVtb3ZlIGZyb20gdGVtcGxlIGluc3RhbmNlXG5cdFx0dmFyIGluZGV4ID0gdGhpcy50ZW1wbGUuX29ic2VydmVycy5pbmRleE9mKHRoaXMpO1xuXHRcdGlmIChpbmRleCA+IC0xKSB0aGlzLnRlbXBsZS5fb2JzZXJ2ZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XG5cdFx0dGhpcy5lbWl0KFwic3RvcFwiKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRleGVjOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuXHRcdHRoaXMuY2FsbGJhY2suYXBwbHkodGhpcy50ZW1wbGUsIGFyZ3MpO1xuXHRcdHRoaXMuZW1pdC5hcHBseSh0aGlzLCBbXCJoYW5kbGVcIl0uY29uY2F0KGFyZ3MpKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRoYW5kbGU6IGZ1bmN0aW9uKGtleXMsIG5ld3ZhbCwgb2xkdmFsKSB7XG5cdFx0dmFyIHBhcnRzLCBwYXJ0LCBiYXNlLCBzZWxmLCBwYXRocywgZGlkRXhlYztcblxuXHRcdC8vIGNsb25lIHBhcnRzIHNvIHdlIGRvbid0IGFmZmVjdCB0aGUgb3JpZ2luYWxcblx0XHRwYXJ0cyA9IHRoaXMucGFydHMuc2xpY2UoMCk7XG5cdFx0XG5cdFx0Ly8gdHJhdmVyc2UgdGhyb3VnaCBjcGFydHNcblx0XHQvLyBhIG1pc21hdGNoIG1lYW5zIHdlIGRvbid0IG5lZWQgdG8gYmUgaGVyZVxuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwga2V5cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0cGFydCA9IHBhcnRzLnNoaWZ0KCk7XG5cdFx0XHRpZiAoXy5pc1JlZ0V4cChwYXJ0KSAmJiBwYXJ0LnRlc3Qoa2V5c1tpXSkpIGNvbnRpbnVlO1xuXHRcdFx0aWYgKHBhcnQgPT09IFwiKipcIikge1xuXHRcdFx0XHRjb25zb2xlLmxvZyhcInN0YXIgc3RhciFcIik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChwYXJ0ICE9PSBrZXlzW2ldKSByZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0c2VsZiA9IHRoaXM7XG5cdFx0ZGlkRXhlYyA9IGZhbHNlO1xuXHRcdHBhdGhzID0ge307XG5cdFx0YmFzZSA9IHV0aWwuam9pblBhdGgoa2V5cyk7XG5cblx0XHQvLyBnZW5lcmF0ZSBhIGxpc3Qgb2YgZWZmZWN0ZWQgcGF0aHNcblx0XHRnZW5lcmF0ZVBhdGhzKG5ld3ZhbCwgcGFydHMsIHBhdGhzKTtcblx0XHRnZW5lcmF0ZVBhdGhzKG9sZHZhbCwgcGFydHMsIHBhdGhzKTtcblxuXHRcdC8vIGZpcmUgdGhlIGNhbGxiYWNrIG9uIGVhY2ggcGF0aCB0aGF0IGNoYW5nZWRcblx0XHRfLmVhY2gocGF0aHMsIGZ1bmN0aW9uKHYsIHBhdGgpIHtcblx0XHRcdHZhciBudmFsID0gc2VsZi50ZW1wbGUuX2dldChuZXd2YWwsIHBhdGgpLFxuXHRcdFx0XHRvdmFsID0gc2VsZi50ZW1wbGUuX2dldChvbGR2YWwsIHBhdGgpO1xuXG5cdFx0XHRpZiAobnZhbCAhPT0gb3ZhbCkge1xuXHRcdFx0XHRzZWxmLmV4ZWMobnZhbCwgb3ZhbCwgdXRpbC5qb2luUGF0aChiYXNlLCBwYXRoKSk7XG5cdFx0XHRcdGRpZEV4ZWMgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGRpZEV4ZWM7XG5cdH1cblx0XG59KTtcblxuLy8gcmVjdXJzaXZlbHkgc2VhcmNoIG9iaiBvZiBhbGwgcGF0aHMgdGhhdCBtYXRjaCBwYXJ0c1xuZnVuY3Rpb24gZ2VuZXJhdGVQYXRocyhvYmosIHBhcnRzLCBwYXRocywgYmFzZSkge1xuXHRpZiAocGF0aHMgPT0gbnVsbCkgcGF0aHMgPSB7fTtcblx0aWYgKGJhc2UgPT0gbnVsbCkgYmFzZSA9IFwiXCI7XG5cblx0aWYgKCFwYXJ0cy5sZW5ndGgpIHtcblx0XHRwYXRoc1tiYXNlXSA9IHRydWU7XG5cdFx0cmV0dXJuIHBhdGhzO1xuXHR9XG5cblx0aWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcGF0aHM7XG5cblx0dmFyIHBhcnQgPSBwYXJ0c1swXSxcblx0XHRyZXN0ID0gcGFydHMuc2xpY2UoMSk7XG5cblx0aWYgKF8uaXNSZWdFeHAocGFydCkpIHtcblx0XHRmb3IgKHZhciBrIGluIG9iaikge1xuXHRcdFx0aWYgKHBhcnQudGVzdChrKSkgZ2VuZXJhdGVQYXRocyhvYmpba10sIHJlc3QsIHBhdGhzLCB1dGlsLmpvaW5QYXRoKGJhc2UsIGspKTtcblx0XHR9XG5cdH0gZWxzZSBpZiAocGFydCA9PT0gXCIqKlwiKSB7XG5cdFx0Y29uc29sZS5sb2coXCJzdGFyIHN0YXIhXCIpO1xuXHR9IGVsc2Uge1xuXHRcdGdlbmVyYXRlUGF0aHMob2JqW3BhcnRdLCByZXN0LCBwYXRocywgdXRpbC5qb2luUGF0aChiYXNlLCBwYXJ0KSk7XG5cdH1cblxuXHRyZXR1cm4gcGF0aHM7XG59IiwidmFyIEhvZ2FuID0gcmVxdWlyZShcImhvZ2FuLmpzXCIpLFxuXHR4bWwgPSByZXF1aXJlKCcuL3htbCcpLFxuXHROT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKSxcblx0SFRNTF9ERUxJTUlURVJTID0gWyBcIlsjQCFcIiwgXCIhQCNdXCIgXTtcblxudmFyIHBhcnNlID1cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odGV4dCwgZGVsaW1pdGVycykge1xuXHR2YXIgdHJlZSA9IHRvVHJlZSh0ZXh0LnRyaW0oKSwgZGVsaW1pdGVycyk7XG5cdHJldHVybiBjb21waWxlWE1MKHRyZWUpO1xufVxuXG5wYXJzZS5OT0RFX1RZUEUgPSBOT0RFX1RZUEU7XG5cbmZ1bmN0aW9uIHRvVHJlZSh0ZXh0LCBkZWxpbWl0ZXJzKXtcblx0cmV0dXJuIEhvZ2FuLnBhcnNlKEhvZ2FuLnNjYW4odGV4dCwgZGVsaW1pdGVycykpO1xufVxuXG5mdW5jdGlvbiBwYXJzZVhNTCh0cmVlKSB7XG5cdHZhciBzcmMgPSBcIlwiLFxuXHRcdGQgPSBIVE1MX0RFTElNSVRFUlM7XG5cblx0dHJlZS5mb3JFYWNoKGZ1bmN0aW9uKG5vZGUsIGluZGV4KSB7XG5cdFx0aWYgKHR5cGVvZiBub2RlID09PSBcInN0cmluZ1wiIHx8IG5vZGUgaW5zdGFuY2VvZiBTdHJpbmcpIHtcblx0XHRcdHNyYyArPSBcIlwiICsgbm9kZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3JjICs9IGRbMF0gKyBpbmRleCArIGRbMV07XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4geG1sKHNyYyk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlWE1MVGV4dCh0ZXh0LCB0cmVlKSB7XG5cdHZhciBkID0gSFRNTF9ERUxJTUlURVJTO1xuXG5cdHJldHVybiB0ZXh0LnNwbGl0KGRbMF0pLnJlZHVjZShmdW5jdGlvbihtLCB2KSB7XG5cdFx0dmFyIGVuZCA9IHYuaW5kZXhPZihkWzFdKSwgdG9QdXNoO1xuXHRcdFxuXHRcdGlmIChlbmQgPj0gMCkge1xuXHRcdFx0dmFyIGluZGV4ID0gcGFyc2VJbnQodi5zdWJzdHIoMCwgZW5kKSwgMTApO1xuXHRcdFx0aWYgKCFpc05hTihpbmRleCkgJiYgaW5kZXggPj0gMCkgbS5wdXNoKGluZGV4KTtcblx0XHRcdFxuXHRcdFx0dG9QdXNoID0gdi5zdWJzdHIoZW5kICsgZFsxXS5sZW5ndGgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0b1B1c2ggPSB2O1xuXHRcdH1cblxuXHRcdGlmICh0b1B1c2ggIT09IFwiXCIpIG0ucHVzaCh0b1B1c2gpO1xuXG5cdFx0cmV0dXJuIG07XG5cdH0sIFtdKS5tYXAoZnVuY3Rpb24odikge1xuXHRcdGlmICh0eXBlb2YgdiAhPT0gXCJudW1iZXJcIikgcmV0dXJuIHY7XG5cdFx0cmV0dXJuIHRyZWVbdl07XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBhcHBlbmRUZXh0KG0sIHRleHQpIHtcblx0dmFyIGxhc3QgPSBtW20ubGVuZ3RoIC0gMV07XG5cdGlmIChsYXN0ICE9IG51bGwgJiYgbGFzdC50eXBlID09PSBOT0RFX1RZUEUuVEVYVCkge1xuXHRcdGxhc3QudmFsdWUgKz0gdGV4dDtcblx0fSBlbHNlIHtcblx0XHRtLnB1c2goe1xuXHRcdFx0dHlwZTogTk9ERV9UWVBFLlRFWFQsXG5cdFx0XHR2YWx1ZTogdGV4dFxuXHRcdH0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNvbXBpbGVTdGFzaChub2RlcywgaXNYTUwpIHtcblx0cHJvY2Vzc05vZGVzID0gaXNYTUwgPyBjb21waWxlWE1MIDogY29tcGlsZVN0YXNoO1xuXG5cdHJldHVybiBub2Rlcy5yZWR1Y2UoZnVuY3Rpb24obSwgcGFydCkge1xuXHRcdGlmICh0eXBlb2YgcGFydCA9PT0gXCJzdHJpbmdcIiB8fCBwYXJ0IGluc3RhbmNlb2YgU3RyaW5nKSB7XG5cdFx0XHRhcHBlbmRUZXh0KG0sIFwiXCIgKyBwYXJ0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3dpdGNoIChwYXJ0LnRhZykge1xuXHRcdFx0XHRjYXNlIFwiXFxuXCI6XG5cdFx0XHRcdFx0YXBwZW5kVGV4dChtLCBcIlxcblwiKTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFwiX3ZcIjpcblx0XHRcdFx0XHRtLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogTk9ERV9UWVBFLklOVEVSUE9MQVRPUixcblx0XHRcdFx0XHRcdHZhbHVlOiBwYXJ0Lm5cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFwiJlwiOlxuXHRcdFx0XHRjYXNlIFwie1wiOlxuXHRcdFx0XHRcdG0ucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiBOT0RFX1RZUEUuVFJJUExFLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHBhcnQublxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgXCIjXCI6XG5cdFx0XHRcdFx0bS5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6IE5PREVfVFlQRS5TRUNUSU9OLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHBhcnQubixcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBwcm9jZXNzTm9kZXMocGFydC5ub2RlcywgaXNYTUwpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBcIl5cIjpcblx0XHRcdFx0XHRtLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogTk9ERV9UWVBFLklOVkVSVEVELFxuXHRcdFx0XHRcdFx0dmFsdWU6IHBhcnQubixcblx0XHRcdFx0XHRcdGNoaWxkcmVuOiBwcm9jZXNzTm9kZXMocGFydC5ub2RlcywgaXNYTUwpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBcIj5cIjpcblx0XHRcdFx0XHRtLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogTk9ERV9UWVBFLlBBUlRJQUwsXG5cdFx0XHRcdFx0XHR2YWx1ZTogcGFydC5uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBcIiFcIjpcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGNvbnNvbGUubG9nKHBhcnQpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtO1xuXHR9LCBbXSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBpbGVBdHRyaWJ1dGVzKGF0dHJzLCB0cmVlKSB7XG5cdHZhciBwYXJzZWQgPSBbXTtcblxuXHRmb3IgKHZhciBrZXkgaW4gYXR0cnMpIHtcblx0XHRwYXJzZWQucHVzaCh7XG5cdFx0XHR0eXBlOiBOT0RFX1RZUEUuQVRUUklCVVRFLFxuXHRcdFx0bmFtZToga2V5LFxuXHRcdFx0Y2hpbGRyZW46IGNvbXBpbGVTdGFzaChwYXJzZVhNTFRleHQoYXR0cnNba2V5XSwgdHJlZSksIGZhbHNlKVxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIHBhcnNlZDtcbn1cblxuZnVuY3Rpb24gY29tcGlsZUVsZW1lbnRzKG5vZGVzLCB0cmVlKSB7XG5cdHJldHVybiBub2Rlcy5tYXAoZnVuY3Rpb24oZWwpIHtcblx0XHRpZiAodHlwZW9mIGVsID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRyZXR1cm4gY29tcGlsZVN0YXNoKHBhcnNlWE1MVGV4dChlbCwgdHJlZSksIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBOT0RFX1RZUEUuRUxFTUVOVCxcblx0XHRcdFx0bmFtZTogZWwubmFtZSxcblx0XHRcdFx0YXR0cmlidXRlczogY29tcGlsZUF0dHJpYnV0ZXMoZWwuYXR0cmlidXRlcywgdHJlZSksXG5cdFx0XHRcdGNoaWxkcmVuOiBjb21waWxlRWxlbWVudHMoZWwuY2hpbGRyZW4sIHRyZWUpXG5cdFx0XHR9XG5cdFx0fVxuXHR9KS5yZWR1Y2UoZnVuY3Rpb24obSwgZWwpIHtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShlbCkpIG0gPSBtLmNvbmNhdChlbCk7XG5cdFx0ZWxzZSBtLnB1c2goZWwpO1xuXHRcdHJldHVybiBtO1xuXHR9LCBbXSk7XG59XG5cbmZ1bmN0aW9uIGNvbXBpbGVYTUwodHJlZSkge1xuXHRyZXR1cm4gY29tcGlsZUVsZW1lbnRzKHBhcnNlWE1MKHRyZWUpLCB0cmVlKTtcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHtcblx0Ly8gWE1ML0hUTUxcblx0VEVYVCAgICAgICAgICAgICAgOiAwLFxuXHRFTEVNRU5UICAgICAgICAgICA6IDEsXG5cdEFUVFJJQlVURSAgICAgICAgIDogMixcblx0XG5cdC8vIE11c3RhY2hlXG5cdElOVEVSUE9MQVRPUiAgICAgIDogMyxcblx0VFJJUExFICAgICAgICAgICAgOiA0LFxuXHRTRUNUSU9OICAgICAgICAgICA6IDUsXG5cdElOVkVSVEVEICAgICAgICAgIDogNixcblx0UEFSVElBTCAgICAgICAgICAgOiA3XG59IiwiXG4vKipcbiAqIEV4cG9zZSBgcGFyc2VgLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gcGFyc2U7XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIHN0cmluZyBvZiBgeG1sYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30geG1sXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIHBhcnNlKHhtbCkge1xuXHQvLyBzdHJpcCBjb21tZW50c1xuXHR4bWwgPSB4bWwucmVwbGFjZSgvPCEtLS4qPy0tPi9nLCAnJyk7XG5cblx0cmV0dXJuIGNoaWxkcmVuKCk7XG5cblx0LyoqXG5cdCAqIFRhZy5cblx0ICovXG5cblx0ZnVuY3Rpb24gdGFnKCkge1xuXHRcdHZhciBtID0gbWF0Y2goL148KFtcXHcrOl0rKVxccyovKTtcblx0XHRpZiAoIW0pIHJldHVybjtcblxuXHRcdC8vIG5hbWVcblx0XHR2YXIgbm9kZSA9IHtcblx0XHRcdG5hbWU6IG1bMV0sXG5cdFx0XHRhdHRyaWJ1dGVzOiB7fVxuXHRcdH07XG5cblx0XHQvLyBhdHRyaWJ1dGVzXG5cdFx0d2hpbGUgKCEoZW9zKCkgfHwgaXMoJz4nKSB8fCBpcygnPz4nKSkpIHtcblx0XHRcdHZhciBhdHRyID0gYXR0cmlidXRlKCk7XG5cdFx0XHRpZiAoIWF0dHIpIHJldHVybiBub2RlO1xuXHRcdFx0bm9kZS5hdHRyaWJ1dGVzW2F0dHIubmFtZV0gPSBhdHRyLnZhbHVlO1xuXHRcdH1cblxuXHRcdG1hdGNoKC9cXD8/PlxccyovKTtcblxuXHRcdC8vIGNoaWxkcmVuXG5cdFx0bm9kZS5jaGlsZHJlbiA9IGNoaWxkcmVuKCk7XG5cblx0XHQvLyBjbG9zaW5nXG5cdFx0bWF0Y2goL148XFwvW1xcdzpdKz5cXHMqLyk7XG5cblx0XHRyZXR1cm4gbm9kZTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNoaWxkcmVuKCkge1xuXHRcdHZhciBjaGlsZHMgPSBbXTtcblxuXHRcdC8vIGluaXRpYWwgdGV4dCBub2RlXG5cdFx0dmFyIHRleHQgPSBjb250ZW50KCk7XG5cdFx0aWYgKHRleHQgIT0gXCJcIikgY2hpbGRzLnB1c2godGV4dCk7XG5cblx0XHQvLyBjaGlsZHJlblxuXHRcdHZhciBjaGlsZDtcblx0XHR3aGlsZSAoY2hpbGQgPSB0YWcoKSkge1xuXHRcdFx0Y2hpbGRzLnB1c2goY2hpbGQpO1xuXHRcdFx0aWYgKCh0ZXh0ID0gY29udGVudCgpKSAhPSBcIlwiKSBjaGlsZHMucHVzaCh0ZXh0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY2hpbGRzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRleHQgY29udGVudC5cblx0ICovXG5cblx0ZnVuY3Rpb24gY29udGVudCgpIHtcblx0XHR2YXIgbSA9IG1hdGNoKC9eKFtePF0qKS8pO1xuXHRcdGlmIChtKSByZXR1cm4gbVsxXTtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHQvKipcblx0ICogQXR0cmlidXRlLlxuXHQgKi9cblxuXHRmdW5jdGlvbiBhdHRyaWJ1dGUoKSB7XG5cdFx0dmFyIG0gPSBtYXRjaCgvKFtcXHc6XSspXFxzKj1cXHMqKFwiW15cIl0qXCJ8J1teJ10qJ3xcXHcrKVxccyovKTtcblx0XHRpZiAoIW0pIHJldHVybjtcblx0XHRyZXR1cm4geyBuYW1lOiBtWzFdLCB2YWx1ZTogc3RyaXAobVsyXSkgfVxuXHR9XG5cblx0LyoqXG5cdCAqIFN0cmlwIHF1b3RlcyBmcm9tIGB2YWxgLlxuXHQgKi9cblxuXHRmdW5jdGlvbiBzdHJpcCh2YWwpIHtcblx0XHRyZXR1cm4gdmFsLnJlcGxhY2UoL15bJ1wiXXxbJ1wiXSQvZywgJycpO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1hdGNoIGByZWAgYW5kIGFkdmFuY2UgdGhlIHN0cmluZy5cblx0ICovXG5cblx0ZnVuY3Rpb24gbWF0Y2gocmUpIHtcblx0XHR2YXIgbSA9IHhtbC5tYXRjaChyZSk7XG5cdFx0aWYgKCFtKSByZXR1cm47XG5cdFx0eG1sID0geG1sLnNsaWNlKG1bMF0ubGVuZ3RoKTtcblx0XHRyZXR1cm4gbTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbmQtb2Ytc291cmNlLlxuXHQgKi9cblxuXHRmdW5jdGlvbiBlb3MoKSB7XG5cdFx0cmV0dXJuIDAgPT0geG1sLmxlbmd0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDaGVjayBmb3IgYHByZWZpeGAuXG5cdCAqL1xuXG5cdGZ1bmN0aW9uIGlzKHByZWZpeCkge1xuXHRcdHJldHVybiAwID09IHhtbC5pbmRleE9mKHByZWZpeCk7XG5cdH1cbn0iLCJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZShcImV2ZW50c1wiKS5FdmVudEVtaXR0ZXIsXG5cdF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbi8vIGRlZmF1bHQgb3B0aW9uc1xudmFyIGRlZmF1bHRzID0ge1xuXHRkYXRhOiB7fSxcblx0dGVtcGxhdGU6IFwiXCJcbn07XG5cbi8vIG9wdGlvbnMgdG8gY29weSBvbnRvIHRoZSBvYmplY3RcbnZhciB0b0NvcHkgPSBbIFwidGVtcGxhdGVcIiBdO1xuXG4vLyBiYXNlIHByb3RvdHlwZVxudmFyIHByb3RvID0ge1xuXG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihvcHRpb25zKSB7XG5cdFx0RXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cblx0XHRvcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zIHx8IHt9LCBkZWZhdWx0cyk7XG5cdFx0dG9Db3B5LmZvckVhY2goZnVuY3Rpb24oaykge1xuXHRcdFx0dGhpc1trXSA9IG9wdGlvbnNba107XG5cdFx0fSwgdGhpcyk7XG5cblx0XHR0aGlzLl9kZXBzID0ge307XG5cdFx0dGhpcy5fb2JzZXJ2ZXJzID0gW107XG5cdFx0dGhpcy5zZXQob3B0aW9ucy5kYXRhKTtcblxuXHRcdHRoaXMucGFpbnQoKTtcblx0fSxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbigpIHt9LFxuXG5cdHVzZTogZnVuY3Rpb24oZm4pIHtcblx0XHR2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xuXHRcdGFyZ3MudW5zaGlmdCh0aGlzKTtcblx0XHRmbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG59O1xuXG4vLyBjb3JlIG1ldGhvZHNcbnZhciBjb3JlID0gW1xuXHRyZXF1aXJlKFwiLi9tb2RlbFwiKSxcdC8vIERhdGEgTW9kZWxcblx0cmVxdWlyZShcIi4vZG9tXCIpLFx0Ly8gRE9NIEhhbmRsZXJcbl07XG5cbmNvcmUuZm9yRWFjaChmdW5jdGlvbihtZXRob2RzKSB7XG5cdGZvciAodmFyIG1ldGhvZCBpbiBtZXRob2RzKSB7XG5cdFx0cHJvdG9bbWV0aG9kXSA9IG1ldGhvZHNbbWV0aG9kXTtcblx0fVxufSk7XG5cbi8vIGV4cG9ydFxudmFyIFRlbXBsZSA9XG5tb2R1bGUuZXhwb3J0cyA9IHV0aWwuc3ViY2xhc3MoRXZlbnRFbWl0dGVyLCBwcm90byk7XG5cbi8vIGNsYXNzIHByb3BlcnRpZXMvbWV0aG9kc1xuVGVtcGxlLmV4dGVuZCA9IHV0aWwuc3ViY2xhc3MuYmluZChudWxsLCBUZW1wbGUpO1xuVGVtcGxlLnBhcnNlID0gcmVxdWlyZShcIi4vcGFyc2VcIik7XG5UZW1wbGUuT2JzZXJ2ZXIgPSByZXF1aXJlKFwiLi9vYnNlcnZlclwiKTtcblRlbXBsZS5EZXBzID0gcmVxdWlyZShcIi4vZGVwc1wiKTsiLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG52YXIgaXNHZW5lcmljT2JqZWN0ID1cbmV4cG9ydHMuaXNHZW5lcmljT2JqZWN0ID0gZnVuY3Rpb24ob2JqKSB7XG5cdHJldHVybiBvYmogIT0gbnVsbCAmJiBvYmouX19wcm90b19fID09PSBPYmplY3QucHJvdG90eXBlO1xufVxuXG52YXIgc3BsaXRQYXRoID1cbmV4cG9ydHMuc3BsaXRQYXRoID0gZnVuY3Rpb24ocGF0aCkge1xuXHRyZXR1cm4gXy5jb21wYWN0KHR5cGVvZiBwYXRoICE9PSBcInN0cmluZ1wiID8gW10gOiBwYXRoLnNwbGl0KFwiLlwiKSk7XG59XG5cbnZhciBwYXJzZVBhdGggPVxuZXhwb3J0cy5wYXJzZVBhdGggPSBmdW5jdGlvbihwYXRoKSB7XG5cdHJldHVybiBzcGxpdFBhdGgocGF0aCkubWFwKGZ1bmN0aW9uKHBhcnQpIHtcblx0XHRpZiAocGFydC5pbmRleE9mKFwiKlwiKSA+IC0xICYmIHBhcnQgIT09IFwiKipcIikge1xuXHRcdFx0cmV0dXJuIG5ldyBSZWdFeHAoXCJeXCIgKyBwYXJ0LnNwbGl0KFwiKlwiKS5qb2luKFwiKFteXFxcXC5dKilcIikgKyBcIiRcIik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH0pO1xufVxuXG52YXIgam9pblBhdGggPVxuZXhwb3J0cy5qb2luUGF0aCA9IGZ1bmN0aW9uKCkge1xuXHRyZXR1cm4gXy5jb21wYWN0KF8uZmxhdHRlbihfLnRvQXJyYXkoYXJndW1lbnRzKSkpLmpvaW4oXCIuXCIpO1xufVxuXG52YXIgc3ViY2xhc3MgPVxuZXhwb3J0cy5zdWJjbGFzcyA9IGZ1bmN0aW9uKHBhcmVudCwgcHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcblx0dmFyIGNoaWxkO1xuXG5cdC8vIFRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiBmb3IgdGhlIG5ldyBzdWJjbGFzcyBpcyBlaXRoZXIgZGVmaW5lZCBieSB5b3Vcblx0Ly8gKHRoZSBcImNvbnN0cnVjdG9yXCIgcHJvcGVydHkgaW4geW91ciBgZXh0ZW5kYCBkZWZpbml0aW9uKSwgb3IgZGVmYXVsdGVkXG5cdC8vIGJ5IHVzIHRvIHNpbXBseSBjYWxsIHRoZSBwYXJlbnQncyBjb25zdHJ1Y3Rvci5cblx0aWYgKHByb3RvUHJvcHMgJiYgXy5oYXMocHJvdG9Qcm9wcywgJ2NvbnN0cnVjdG9yJykpIHtcblx0XHRjaGlsZCA9IHByb3RvUHJvcHMuY29uc3RydWN0b3I7XG5cdH0gZWxzZSB7XG5cdFx0Y2hpbGQgPSBmdW5jdGlvbigpeyByZXR1cm4gcGFyZW50LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IH07XG5cdH1cblxuXHQvLyBBZGQgc3RhdGljIHByb3BlcnRpZXMgdG8gdGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLCBpZiBzdXBwbGllZC5cblx0Xy5leHRlbmQoY2hpbGQsIHBhcmVudCwgc3RhdGljUHJvcHMpO1xuXG5cdC8vIFNldCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIGluaGVyaXQgZnJvbSBgcGFyZW50YCwgd2l0aG91dCBjYWxsaW5nXG5cdC8vIGBwYXJlbnRgJ3MgY29uc3RydWN0b3IgZnVuY3Rpb24uXG5cdHZhciBTdXJyb2dhdGUgPSBmdW5jdGlvbigpeyB0aGlzLmNvbnN0cnVjdG9yID0gY2hpbGQ7IH07XG5cdFN1cnJvZ2F0ZS5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuXHRjaGlsZC5wcm90b3R5cGUgPSBuZXcgU3Vycm9nYXRlO1xuXG5cdC8vIEFkZCBwcm90b3R5cGUgcHJvcGVydGllcyAoaW5zdGFuY2UgcHJvcGVydGllcykgdG8gdGhlIHN1YmNsYXNzLFxuXHQvLyBpZiBzdXBwbGllZC5cblx0aWYgKHByb3RvUHJvcHMpIF8uZXh0ZW5kKGNoaWxkLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyk7XG5cblx0Ly8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZFxuXHQvLyBsYXRlci5cblx0Y2hpbGQuX19zdXBlcl9fID0gcGFyZW50LnByb3RvdHlwZTtcblxuXHRyZXR1cm4gY2hpbGQ7XG59IiwiLy8gaHR0cDovL3dpa2kuY29tbW9uanMub3JnL3dpa2kvVW5pdF9UZXN0aW5nLzEuMFxuLy9cbi8vIFRISVMgSVMgTk9UIFRFU1RFRCBOT1IgTElLRUxZIFRPIFdPUksgT1VUU0lERSBWOCFcbi8vXG4vLyBPcmlnaW5hbGx5IGZyb20gbmFyd2hhbC5qcyAoaHR0cDovL25hcndoYWxqcy5vcmcpXG4vLyBDb3B5cmlnaHQgKGMpIDIwMDkgVGhvbWFzIFJvYmluc29uIDwyODBub3J0aC5jb20+XG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuLy8gb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgJ1NvZnR3YXJlJyksIHRvXG4vLyBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZVxuLy8gcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yXG4vLyBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuLy8gZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuLy8gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEICdBUyBJUycsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1Jcbi8vIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuLy8gRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4vLyBBVVRIT1JTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTlxuLy8gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTlxuLy8gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIHdoZW4gdXNlZCBpbiBub2RlLCB0aGlzIHdpbGwgYWN0dWFsbHkgbG9hZCB0aGUgdXRpbCBtb2R1bGUgd2UgZGVwZW5kIG9uXG4vLyB2ZXJzdXMgbG9hZGluZyB0aGUgYnVpbHRpbiB1dGlsIG1vZHVsZSBhcyBoYXBwZW5zIG90aGVyd2lzZVxuLy8gdGhpcyBpcyBhIGJ1ZyBpbiBub2RlIG1vZHVsZSBsb2FkaW5nIGFzIGZhciBhcyBJIGFtIGNvbmNlcm5lZFxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsLycpO1xuXG52YXIgcFNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xudmFyIGhhc093biA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbi8vIDEuIFRoZSBhc3NlcnQgbW9kdWxlIHByb3ZpZGVzIGZ1bmN0aW9ucyB0aGF0IHRocm93XG4vLyBBc3NlcnRpb25FcnJvcidzIHdoZW4gcGFydGljdWxhciBjb25kaXRpb25zIGFyZSBub3QgbWV0LiBUaGVcbi8vIGFzc2VydCBtb2R1bGUgbXVzdCBjb25mb3JtIHRvIHRoZSBmb2xsb3dpbmcgaW50ZXJmYWNlLlxuXG52YXIgYXNzZXJ0ID0gbW9kdWxlLmV4cG9ydHMgPSBvaztcblxuLy8gMi4gVGhlIEFzc2VydGlvbkVycm9yIGlzIGRlZmluZWQgaW4gYXNzZXJ0LlxuLy8gbmV3IGFzc2VydC5Bc3NlcnRpb25FcnJvcih7IG1lc3NhZ2U6IG1lc3NhZ2UsXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0dWFsOiBhY3R1YWwsXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IGV4cGVjdGVkIH0pXG5cbmFzc2VydC5Bc3NlcnRpb25FcnJvciA9IGZ1bmN0aW9uIEFzc2VydGlvbkVycm9yKG9wdGlvbnMpIHtcbiAgdGhpcy5uYW1lID0gJ0Fzc2VydGlvbkVycm9yJztcbiAgdGhpcy5hY3R1YWwgPSBvcHRpb25zLmFjdHVhbDtcbiAgdGhpcy5leHBlY3RlZCA9IG9wdGlvbnMuZXhwZWN0ZWQ7XG4gIHRoaXMub3BlcmF0b3IgPSBvcHRpb25zLm9wZXJhdG9yO1xuICBpZiAob3B0aW9ucy5tZXNzYWdlKSB7XG4gICAgdGhpcy5tZXNzYWdlID0gb3B0aW9ucy5tZXNzYWdlO1xuICAgIHRoaXMuZ2VuZXJhdGVkTWVzc2FnZSA9IGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHRoaXMubWVzc2FnZSA9IGdldE1lc3NhZ2UodGhpcyk7XG4gICAgdGhpcy5nZW5lcmF0ZWRNZXNzYWdlID0gdHJ1ZTtcbiAgfVxuICB2YXIgc3RhY2tTdGFydEZ1bmN0aW9uID0gb3B0aW9ucy5zdGFja1N0YXJ0RnVuY3Rpb24gfHwgZmFpbDtcblxuICBpZiAoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpIHtcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh0aGlzLCBzdGFja1N0YXJ0RnVuY3Rpb24pO1xuICB9XG4gIGVsc2Uge1xuICAgIC8vIG5vbiB2OCBicm93c2VycyBzbyB3ZSBjYW4gaGF2ZSBhIHN0YWNrdHJhY2VcbiAgICB2YXIgZXJyID0gbmV3IEVycm9yKCk7XG4gICAgaWYgKGVyci5zdGFjaykge1xuICAgICAgdmFyIG91dCA9IGVyci5zdGFjaztcblxuICAgICAgLy8gdHJ5IHRvIHN0cmlwIHVzZWxlc3MgZnJhbWVzXG4gICAgICB2YXIgZm5fbmFtZSA9IHN0YWNrU3RhcnRGdW5jdGlvbi5uYW1lO1xuICAgICAgdmFyIGlkeCA9IG91dC5pbmRleE9mKCdcXG4nICsgZm5fbmFtZSk7XG4gICAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgICAgLy8gb25jZSB3ZSBoYXZlIGxvY2F0ZWQgdGhlIGZ1bmN0aW9uIGZyYW1lXG4gICAgICAgIC8vIHdlIG5lZWQgdG8gc3RyaXAgb3V0IGV2ZXJ5dGhpbmcgYmVmb3JlIGl0IChhbmQgaXRzIGxpbmUpXG4gICAgICAgIHZhciBuZXh0X2xpbmUgPSBvdXQuaW5kZXhPZignXFxuJywgaWR4ICsgMSk7XG4gICAgICAgIG91dCA9IG91dC5zdWJzdHJpbmcobmV4dF9saW5lICsgMSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuc3RhY2sgPSBvdXQ7XG4gICAgfVxuICB9XG59O1xuXG4vLyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3IgaW5zdGFuY2VvZiBFcnJvclxudXRpbC5pbmhlcml0cyhhc3NlcnQuQXNzZXJ0aW9uRXJyb3IsIEVycm9yKTtcblxuZnVuY3Rpb24gcmVwbGFjZXIoa2V5LCB2YWx1ZSkge1xuICBpZiAodXRpbC5pc1VuZGVmaW5lZCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gJycgKyB2YWx1ZTtcbiAgfVxuICBpZiAodXRpbC5pc051bWJlcih2YWx1ZSkgJiYgKGlzTmFOKHZhbHVlKSB8fCAhaXNGaW5pdGUodmFsdWUpKSkge1xuICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICB9XG4gIGlmICh1dGlsLmlzRnVuY3Rpb24odmFsdWUpIHx8IHV0aWwuaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiB0cnVuY2F0ZShzLCBuKSB7XG4gIGlmICh1dGlsLmlzU3RyaW5nKHMpKSB7XG4gICAgcmV0dXJuIHMubGVuZ3RoIDwgbiA/IHMgOiBzLnNsaWNlKDAsIG4pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldE1lc3NhZ2Uoc2VsZikge1xuICByZXR1cm4gdHJ1bmNhdGUoSlNPTi5zdHJpbmdpZnkoc2VsZi5hY3R1YWwsIHJlcGxhY2VyKSwgMTI4KSArICcgJyArXG4gICAgICAgICBzZWxmLm9wZXJhdG9yICsgJyAnICtcbiAgICAgICAgIHRydW5jYXRlKEpTT04uc3RyaW5naWZ5KHNlbGYuZXhwZWN0ZWQsIHJlcGxhY2VyKSwgMTI4KTtcbn1cblxuLy8gQXQgcHJlc2VudCBvbmx5IHRoZSB0aHJlZSBrZXlzIG1lbnRpb25lZCBhYm92ZSBhcmUgdXNlZCBhbmRcbi8vIHVuZGVyc3Rvb2QgYnkgdGhlIHNwZWMuIEltcGxlbWVudGF0aW9ucyBvciBzdWIgbW9kdWxlcyBjYW4gcGFzc1xuLy8gb3RoZXIga2V5cyB0byB0aGUgQXNzZXJ0aW9uRXJyb3IncyBjb25zdHJ1Y3RvciAtIHRoZXkgd2lsbCBiZVxuLy8gaWdub3JlZC5cblxuLy8gMy4gQWxsIG9mIHRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zIG11c3QgdGhyb3cgYW4gQXNzZXJ0aW9uRXJyb3Jcbi8vIHdoZW4gYSBjb3JyZXNwb25kaW5nIGNvbmRpdGlvbiBpcyBub3QgbWV0LCB3aXRoIGEgbWVzc2FnZSB0aGF0XG4vLyBtYXkgYmUgdW5kZWZpbmVkIGlmIG5vdCBwcm92aWRlZC4gIEFsbCBhc3NlcnRpb24gbWV0aG9kcyBwcm92aWRlXG4vLyBib3RoIHRoZSBhY3R1YWwgYW5kIGV4cGVjdGVkIHZhbHVlcyB0byB0aGUgYXNzZXJ0aW9uIGVycm9yIGZvclxuLy8gZGlzcGxheSBwdXJwb3Nlcy5cblxuZnVuY3Rpb24gZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCBvcGVyYXRvciwgc3RhY2tTdGFydEZ1bmN0aW9uKSB7XG4gIHRocm93IG5ldyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3Ioe1xuICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgYWN0dWFsOiBhY3R1YWwsXG4gICAgZXhwZWN0ZWQ6IGV4cGVjdGVkLFxuICAgIG9wZXJhdG9yOiBvcGVyYXRvcixcbiAgICBzdGFja1N0YXJ0RnVuY3Rpb246IHN0YWNrU3RhcnRGdW5jdGlvblxuICB9KTtcbn1cblxuLy8gRVhURU5TSU9OISBhbGxvd3MgZm9yIHdlbGwgYmVoYXZlZCBlcnJvcnMgZGVmaW5lZCBlbHNld2hlcmUuXG5hc3NlcnQuZmFpbCA9IGZhaWw7XG5cbi8vIDQuIFB1cmUgYXNzZXJ0aW9uIHRlc3RzIHdoZXRoZXIgYSB2YWx1ZSBpcyB0cnV0aHksIGFzIGRldGVybWluZWRcbi8vIGJ5ICEhZ3VhcmQuXG4vLyBhc3NlcnQub2soZ3VhcmQsIG1lc3NhZ2Vfb3B0KTtcbi8vIFRoaXMgc3RhdGVtZW50IGlzIGVxdWl2YWxlbnQgdG8gYXNzZXJ0LmVxdWFsKHRydWUsICEhZ3VhcmQsXG4vLyBtZXNzYWdlX29wdCk7LiBUbyB0ZXN0IHN0cmljdGx5IGZvciB0aGUgdmFsdWUgdHJ1ZSwgdXNlXG4vLyBhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgZ3VhcmQsIG1lc3NhZ2Vfb3B0KTsuXG5cbmZ1bmN0aW9uIG9rKHZhbHVlLCBtZXNzYWdlKSB7XG4gIGlmICghdmFsdWUpIGZhaWwodmFsdWUsIHRydWUsIG1lc3NhZ2UsICc9PScsIGFzc2VydC5vayk7XG59XG5hc3NlcnQub2sgPSBvaztcblxuLy8gNS4gVGhlIGVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBzaGFsbG93LCBjb2VyY2l2ZSBlcXVhbGl0eSB3aXRoXG4vLyA9PS5cbi8vIGFzc2VydC5lcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5lcXVhbCA9IGZ1bmN0aW9uIGVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCAhPSBleHBlY3RlZCkgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnPT0nLCBhc3NlcnQuZXF1YWwpO1xufTtcblxuLy8gNi4gVGhlIG5vbi1lcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgZm9yIHdoZXRoZXIgdHdvIG9iamVjdHMgYXJlIG5vdCBlcXVhbFxuLy8gd2l0aCAhPSBhc3NlcnQubm90RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQubm90RXF1YWwgPSBmdW5jdGlvbiBub3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgPT0gZXhwZWN0ZWQpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICchPScsIGFzc2VydC5ub3RFcXVhbCk7XG4gIH1cbn07XG5cbi8vIDcuIFRoZSBlcXVpdmFsZW5jZSBhc3NlcnRpb24gdGVzdHMgYSBkZWVwIGVxdWFsaXR5IHJlbGF0aW9uLlxuLy8gYXNzZXJ0LmRlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5kZWVwRXF1YWwgPSBmdW5jdGlvbiBkZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoIV9kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICdkZWVwRXF1YWwnLCBhc3NlcnQuZGVlcEVxdWFsKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gX2RlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkKSB7XG4gIC8vIDcuMS4gQWxsIGlkZW50aWNhbCB2YWx1ZXMgYXJlIGVxdWl2YWxlbnQsIGFzIGRldGVybWluZWQgYnkgPT09LlxuICBpZiAoYWN0dWFsID09PSBleHBlY3RlZCkge1xuICAgIHJldHVybiB0cnVlO1xuXG4gIH0gZWxzZSBpZiAodXRpbC5pc0J1ZmZlcihhY3R1YWwpICYmIHV0aWwuaXNCdWZmZXIoZXhwZWN0ZWQpKSB7XG4gICAgaWYgKGFjdHVhbC5sZW5ndGggIT0gZXhwZWN0ZWQubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFjdHVhbC5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFjdHVhbFtpXSAhPT0gZXhwZWN0ZWRbaV0pIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcblxuICAvLyA3LjIuIElmIHRoZSBleHBlY3RlZCB2YWx1ZSBpcyBhIERhdGUgb2JqZWN0LCB0aGUgYWN0dWFsIHZhbHVlIGlzXG4gIC8vIGVxdWl2YWxlbnQgaWYgaXQgaXMgYWxzbyBhIERhdGUgb2JqZWN0IHRoYXQgcmVmZXJzIHRvIHRoZSBzYW1lIHRpbWUuXG4gIH0gZWxzZSBpZiAodXRpbC5pc0RhdGUoYWN0dWFsKSAmJiB1dGlsLmlzRGF0ZShleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gYWN0dWFsLmdldFRpbWUoKSA9PT0gZXhwZWN0ZWQuZ2V0VGltZSgpO1xuXG4gIC8vIDcuMyBJZiB0aGUgZXhwZWN0ZWQgdmFsdWUgaXMgYSBSZWdFeHAgb2JqZWN0LCB0aGUgYWN0dWFsIHZhbHVlIGlzXG4gIC8vIGVxdWl2YWxlbnQgaWYgaXQgaXMgYWxzbyBhIFJlZ0V4cCBvYmplY3Qgd2l0aCB0aGUgc2FtZSBzb3VyY2UgYW5kXG4gIC8vIHByb3BlcnRpZXMgKGBnbG9iYWxgLCBgbXVsdGlsaW5lYCwgYGxhc3RJbmRleGAsIGBpZ25vcmVDYXNlYCkuXG4gIH0gZWxzZSBpZiAodXRpbC5pc1JlZ0V4cChhY3R1YWwpICYmIHV0aWwuaXNSZWdFeHAoZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuIGFjdHVhbC5zb3VyY2UgPT09IGV4cGVjdGVkLnNvdXJjZSAmJlxuICAgICAgICAgICBhY3R1YWwuZ2xvYmFsID09PSBleHBlY3RlZC5nbG9iYWwgJiZcbiAgICAgICAgICAgYWN0dWFsLm11bHRpbGluZSA9PT0gZXhwZWN0ZWQubXVsdGlsaW5lICYmXG4gICAgICAgICAgIGFjdHVhbC5sYXN0SW5kZXggPT09IGV4cGVjdGVkLmxhc3RJbmRleCAmJlxuICAgICAgICAgICBhY3R1YWwuaWdub3JlQ2FzZSA9PT0gZXhwZWN0ZWQuaWdub3JlQ2FzZTtcblxuICAvLyA3LjQuIE90aGVyIHBhaXJzIHRoYXQgZG8gbm90IGJvdGggcGFzcyB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcsXG4gIC8vIGVxdWl2YWxlbmNlIGlzIGRldGVybWluZWQgYnkgPT0uXG4gIH0gZWxzZSBpZiAoIXV0aWwuaXNPYmplY3QoYWN0dWFsKSAmJiAhdXRpbC5pc09iamVjdChleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gYWN0dWFsID09IGV4cGVjdGVkO1xuXG4gIC8vIDcuNSBGb3IgYWxsIG90aGVyIE9iamVjdCBwYWlycywgaW5jbHVkaW5nIEFycmF5IG9iamVjdHMsIGVxdWl2YWxlbmNlIGlzXG4gIC8vIGRldGVybWluZWQgYnkgaGF2aW5nIHRoZSBzYW1lIG51bWJlciBvZiBvd25lZCBwcm9wZXJ0aWVzIChhcyB2ZXJpZmllZFxuICAvLyB3aXRoIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCksIHRoZSBzYW1lIHNldCBvZiBrZXlzXG4gIC8vIChhbHRob3VnaCBub3QgbmVjZXNzYXJpbHkgdGhlIHNhbWUgb3JkZXIpLCBlcXVpdmFsZW50IHZhbHVlcyBmb3IgZXZlcnlcbiAgLy8gY29ycmVzcG9uZGluZyBrZXksIGFuZCBhbiBpZGVudGljYWwgJ3Byb3RvdHlwZScgcHJvcGVydHkuIE5vdGU6IHRoaXNcbiAgLy8gYWNjb3VudHMgZm9yIGJvdGggbmFtZWQgYW5kIGluZGV4ZWQgcHJvcGVydGllcyBvbiBBcnJheXMuXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG9iakVxdWl2KGFjdHVhbCwgZXhwZWN0ZWQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzQXJndW1lbnRzKG9iamVjdCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iamVjdCkgPT0gJ1tvYmplY3QgQXJndW1lbnRzXSc7XG59XG5cbmZ1bmN0aW9uIG9iakVxdWl2KGEsIGIpIHtcbiAgaWYgKHV0aWwuaXNOdWxsT3JVbmRlZmluZWQoYSkgfHwgdXRpbC5pc051bGxPclVuZGVmaW5lZChiKSlcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vIGFuIGlkZW50aWNhbCAncHJvdG90eXBlJyBwcm9wZXJ0eS5cbiAgaWYgKGEucHJvdG90eXBlICE9PSBiLnByb3RvdHlwZSkgcmV0dXJuIGZhbHNlO1xuICAvL35+fkkndmUgbWFuYWdlZCB0byBicmVhayBPYmplY3Qua2V5cyB0aHJvdWdoIHNjcmV3eSBhcmd1bWVudHMgcGFzc2luZy5cbiAgLy8gICBDb252ZXJ0aW5nIHRvIGFycmF5IHNvbHZlcyB0aGUgcHJvYmxlbS5cbiAgaWYgKGlzQXJndW1lbnRzKGEpKSB7XG4gICAgaWYgKCFpc0FyZ3VtZW50cyhiKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBhID0gcFNsaWNlLmNhbGwoYSk7XG4gICAgYiA9IHBTbGljZS5jYWxsKGIpO1xuICAgIHJldHVybiBfZGVlcEVxdWFsKGEsIGIpO1xuICB9XG4gIHRyeSB7XG4gICAgdmFyIGthID0gb2JqZWN0S2V5cyhhKSxcbiAgICAgICAga2IgPSBvYmplY3RLZXlzKGIpLFxuICAgICAgICBrZXksIGk7XG4gIH0gY2F0Y2ggKGUpIHsvL2hhcHBlbnMgd2hlbiBvbmUgaXMgYSBzdHJpbmcgbGl0ZXJhbCBhbmQgdGhlIG90aGVyIGlzbid0XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoa2V5cyBpbmNvcnBvcmF0ZXNcbiAgLy8gaGFzT3duUHJvcGVydHkpXG4gIGlmIChrYS5sZW5ndGggIT0ga2IubGVuZ3RoKVxuICAgIHJldHVybiBmYWxzZTtcbiAgLy90aGUgc2FtZSBzZXQgb2Yga2V5cyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSxcbiAga2Euc29ydCgpO1xuICBrYi5zb3J0KCk7XG4gIC8vfn5+Y2hlYXAga2V5IHRlc3RcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoa2FbaV0gIT0ga2JbaV0pXG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy9lcXVpdmFsZW50IHZhbHVlcyBmb3IgZXZlcnkgY29ycmVzcG9uZGluZyBrZXksIGFuZFxuICAvL35+fnBvc3NpYmx5IGV4cGVuc2l2ZSBkZWVwIHRlc3RcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBrZXkgPSBrYVtpXTtcbiAgICBpZiAoIV9kZWVwRXF1YWwoYVtrZXldLCBiW2tleV0pKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIDguIFRoZSBub24tZXF1aXZhbGVuY2UgYXNzZXJ0aW9uIHRlc3RzIGZvciBhbnkgZGVlcCBpbmVxdWFsaXR5LlxuLy8gYXNzZXJ0Lm5vdERlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5ub3REZWVwRXF1YWwgPSBmdW5jdGlvbiBub3REZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoX2RlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJ25vdERlZXBFcXVhbCcsIGFzc2VydC5ub3REZWVwRXF1YWwpO1xuICB9XG59O1xuXG4vLyA5LiBUaGUgc3RyaWN0IGVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBzdHJpY3QgZXF1YWxpdHksIGFzIGRldGVybWluZWQgYnkgPT09LlxuLy8gYXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LnN0cmljdEVxdWFsID0gZnVuY3Rpb24gc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsICE9PSBleHBlY3RlZCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJz09PScsIGFzc2VydC5zdHJpY3RFcXVhbCk7XG4gIH1cbn07XG5cbi8vIDEwLiBUaGUgc3RyaWN0IG5vbi1lcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgZm9yIHN0cmljdCBpbmVxdWFsaXR5LCBhc1xuLy8gZGV0ZXJtaW5lZCBieSAhPT0uICBhc3NlcnQubm90U3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQubm90U3RyaWN0RXF1YWwgPSBmdW5jdGlvbiBub3RTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgPT09IGV4cGVjdGVkKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnIT09JywgYXNzZXJ0Lm5vdFN0cmljdEVxdWFsKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZXhwZWN0ZWRFeGNlcHRpb24oYWN0dWFsLCBleHBlY3RlZCkge1xuICBpZiAoIWFjdHVhbCB8fCAhZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGV4cGVjdGVkKSA9PSAnW29iamVjdCBSZWdFeHBdJykge1xuICAgIHJldHVybiBleHBlY3RlZC50ZXN0KGFjdHVhbCk7XG4gIH0gZWxzZSBpZiAoYWN0dWFsIGluc3RhbmNlb2YgZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIGlmIChleHBlY3RlZC5jYWxsKHt9LCBhY3R1YWwpID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIF90aHJvd3Moc2hvdWxkVGhyb3csIGJsb2NrLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICB2YXIgYWN0dWFsO1xuXG4gIGlmICh1dGlsLmlzU3RyaW5nKGV4cGVjdGVkKSkge1xuICAgIG1lc3NhZ2UgPSBleHBlY3RlZDtcbiAgICBleHBlY3RlZCA9IG51bGw7XG4gIH1cblxuICB0cnkge1xuICAgIGJsb2NrKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBhY3R1YWwgPSBlO1xuICB9XG5cbiAgbWVzc2FnZSA9IChleHBlY3RlZCAmJiBleHBlY3RlZC5uYW1lID8gJyAoJyArIGV4cGVjdGVkLm5hbWUgKyAnKS4nIDogJy4nKSArXG4gICAgICAgICAgICAobWVzc2FnZSA/ICcgJyArIG1lc3NhZ2UgOiAnLicpO1xuXG4gIGlmIChzaG91bGRUaHJvdyAmJiAhYWN0dWFsKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCAnTWlzc2luZyBleHBlY3RlZCBleGNlcHRpb24nICsgbWVzc2FnZSk7XG4gIH1cblxuICBpZiAoIXNob3VsZFRocm93ICYmIGV4cGVjdGVkRXhjZXB0aW9uKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCAnR290IHVud2FudGVkIGV4Y2VwdGlvbicgKyBtZXNzYWdlKTtcbiAgfVxuXG4gIGlmICgoc2hvdWxkVGhyb3cgJiYgYWN0dWFsICYmIGV4cGVjdGVkICYmXG4gICAgICAhZXhwZWN0ZWRFeGNlcHRpb24oYWN0dWFsLCBleHBlY3RlZCkpIHx8ICghc2hvdWxkVGhyb3cgJiYgYWN0dWFsKSkge1xuICAgIHRocm93IGFjdHVhbDtcbiAgfVxufVxuXG4vLyAxMS4gRXhwZWN0ZWQgdG8gdGhyb3cgYW4gZXJyb3I6XG4vLyBhc3NlcnQudGhyb3dzKGJsb2NrLCBFcnJvcl9vcHQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LnRocm93cyA9IGZ1bmN0aW9uKGJsb2NrLCAvKm9wdGlvbmFsKi9lcnJvciwgLypvcHRpb25hbCovbWVzc2FnZSkge1xuICBfdGhyb3dzLmFwcGx5KHRoaXMsIFt0cnVlXS5jb25jYXQocFNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xufTtcblxuLy8gRVhURU5TSU9OISBUaGlzIGlzIGFubm95aW5nIHRvIHdyaXRlIG91dHNpZGUgdGhpcyBtb2R1bGUuXG5hc3NlcnQuZG9lc05vdFRocm93ID0gZnVuY3Rpb24oYmxvY2ssIC8qb3B0aW9uYWwqL21lc3NhZ2UpIHtcbiAgX3Rocm93cy5hcHBseSh0aGlzLCBbZmFsc2VdLmNvbmNhdChwU2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG59O1xuXG5hc3NlcnQuaWZFcnJvciA9IGZ1bmN0aW9uKGVycikgeyBpZiAoZXJyKSB7dGhyb3cgZXJyO319O1xuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIGtleXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChoYXNPd24uY2FsbChvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiBrZXlzO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNCdWZmZXIoYXJnKSB7XG4gIHJldHVybiBhcmcgJiYgdHlwZW9mIGFyZyA9PT0gJ29iamVjdCdcbiAgICAmJiB0eXBlb2YgYXJnLmNvcHkgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLmZpbGwgPT09ICdmdW5jdGlvbidcbiAgICAmJiB0eXBlb2YgYXJnLnJlYWRVSW50OCA9PT0gJ2Z1bmN0aW9uJztcbn0iLCIoZnVuY3Rpb24gKHByb2Nlc3MsZ2xvYmFsKXtcbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG52YXIgZm9ybWF0UmVnRXhwID0gLyVbc2RqJV0vZztcbmV4cG9ydHMuZm9ybWF0ID0gZnVuY3Rpb24oZikge1xuICBpZiAoIWlzU3RyaW5nKGYpKSB7XG4gICAgdmFyIG9iamVjdHMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgb2JqZWN0cy5wdXNoKGluc3BlY3QoYXJndW1lbnRzW2ldKSk7XG4gICAgfVxuICAgIHJldHVybiBvYmplY3RzLmpvaW4oJyAnKTtcbiAgfVxuXG4gIHZhciBpID0gMTtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciBsZW4gPSBhcmdzLmxlbmd0aDtcbiAgdmFyIHN0ciA9IFN0cmluZyhmKS5yZXBsYWNlKGZvcm1hdFJlZ0V4cCwgZnVuY3Rpb24oeCkge1xuICAgIGlmICh4ID09PSAnJSUnKSByZXR1cm4gJyUnO1xuICAgIGlmIChpID49IGxlbikgcmV0dXJuIHg7XG4gICAgc3dpdGNoICh4KSB7XG4gICAgICBjYXNlICclcyc6IHJldHVybiBTdHJpbmcoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVkJzogcmV0dXJuIE51bWJlcihhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWonOlxuICAgICAgICB0cnkge1xuICAgICAgICAgIHJldHVybiBKU09OLnN0cmluZ2lmeShhcmdzW2krK10pO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuICdbQ2lyY3VsYXJdJztcbiAgICAgICAgfVxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgcmV0dXJuIHg7XG4gICAgfVxuICB9KTtcbiAgZm9yICh2YXIgeCA9IGFyZ3NbaV07IGkgPCBsZW47IHggPSBhcmdzWysraV0pIHtcbiAgICBpZiAoaXNOdWxsKHgpIHx8ICFpc09iamVjdCh4KSkge1xuICAgICAgc3RyICs9ICcgJyArIHg7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciArPSAnICcgKyBpbnNwZWN0KHgpO1xuICAgIH1cbiAgfVxuICByZXR1cm4gc3RyO1xufTtcblxuXG4vLyBNYXJrIHRoYXQgYSBtZXRob2Qgc2hvdWxkIG5vdCBiZSB1c2VkLlxuLy8gUmV0dXJucyBhIG1vZGlmaWVkIGZ1bmN0aW9uIHdoaWNoIHdhcm5zIG9uY2UgYnkgZGVmYXVsdC5cbi8vIElmIC0tbm8tZGVwcmVjYXRpb24gaXMgc2V0LCB0aGVuIGl0IGlzIGEgbm8tb3AuXG5leHBvcnRzLmRlcHJlY2F0ZSA9IGZ1bmN0aW9uKGZuLCBtc2cpIHtcbiAgLy8gQWxsb3cgZm9yIGRlcHJlY2F0aW5nIHRoaW5ncyBpbiB0aGUgcHJvY2VzcyBvZiBzdGFydGluZyB1cC5cbiAgaWYgKGlzVW5kZWZpbmVkKGdsb2JhbC5wcm9jZXNzKSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleHBvcnRzLmRlcHJlY2F0ZShmbiwgbXNnKS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH1cblxuICBpZiAocHJvY2Vzcy5ub0RlcHJlY2F0aW9uID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIGZuO1xuICB9XG5cbiAgdmFyIHdhcm5lZCA9IGZhbHNlO1xuICBmdW5jdGlvbiBkZXByZWNhdGVkKCkge1xuICAgIGlmICghd2FybmVkKSB7XG4gICAgICBpZiAocHJvY2Vzcy50aHJvd0RlcHJlY2F0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihtc2cpO1xuICAgICAgfSBlbHNlIGlmIChwcm9jZXNzLnRyYWNlRGVwcmVjYXRpb24pIHtcbiAgICAgICAgY29uc29sZS50cmFjZShtc2cpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihtc2cpO1xuICAgICAgfVxuICAgICAgd2FybmVkID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gIH1cblxuICByZXR1cm4gZGVwcmVjYXRlZDtcbn07XG5cblxudmFyIGRlYnVncyA9IHt9O1xudmFyIGRlYnVnRW52aXJvbjtcbmV4cG9ydHMuZGVidWdsb2cgPSBmdW5jdGlvbihzZXQpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKGRlYnVnRW52aXJvbikpXG4gICAgZGVidWdFbnZpcm9uID0gcHJvY2Vzcy5lbnYuTk9ERV9ERUJVRyB8fCAnJztcbiAgc2V0ID0gc2V0LnRvVXBwZXJDYXNlKCk7XG4gIGlmICghZGVidWdzW3NldF0pIHtcbiAgICBpZiAobmV3IFJlZ0V4cCgnXFxcXGInICsgc2V0ICsgJ1xcXFxiJywgJ2knKS50ZXN0KGRlYnVnRW52aXJvbikpIHtcbiAgICAgIHZhciBwaWQgPSBwcm9jZXNzLnBpZDtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBtc2cgPSBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpO1xuICAgICAgICBjb25zb2xlLmVycm9yKCclcyAlZDogJXMnLCBzZXQsIHBpZCwgbXNnKTtcbiAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGRlYnVnc1tzZXRdID0gZnVuY3Rpb24oKSB7fTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGRlYnVnc1tzZXRdO1xufTtcblxuXG4vKipcbiAqIEVjaG9zIHRoZSB2YWx1ZSBvZiBhIHZhbHVlLiBUcnlzIHRvIHByaW50IHRoZSB2YWx1ZSBvdXRcbiAqIGluIHRoZSBiZXN0IHdheSBwb3NzaWJsZSBnaXZlbiB0aGUgZGlmZmVyZW50IHR5cGVzLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmogVGhlIG9iamVjdCB0byBwcmludCBvdXQuXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0cyBPcHRpb25hbCBvcHRpb25zIG9iamVjdCB0aGF0IGFsdGVycyB0aGUgb3V0cHV0LlxuICovXG4vKiBsZWdhY3k6IG9iaiwgc2hvd0hpZGRlbiwgZGVwdGgsIGNvbG9ycyovXG5mdW5jdGlvbiBpbnNwZWN0KG9iaiwgb3B0cykge1xuICAvLyBkZWZhdWx0IG9wdGlvbnNcbiAgdmFyIGN0eCA9IHtcbiAgICBzZWVuOiBbXSxcbiAgICBzdHlsaXplOiBzdHlsaXplTm9Db2xvclxuICB9O1xuICAvLyBsZWdhY3kuLi5cbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gMykgY3R4LmRlcHRoID0gYXJndW1lbnRzWzJdO1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSA0KSBjdHguY29sb3JzID0gYXJndW1lbnRzWzNdO1xuICBpZiAoaXNCb29sZWFuKG9wdHMpKSB7XG4gICAgLy8gbGVnYWN5Li4uXG4gICAgY3R4LnNob3dIaWRkZW4gPSBvcHRzO1xuICB9IGVsc2UgaWYgKG9wdHMpIHtcbiAgICAvLyBnb3QgYW4gXCJvcHRpb25zXCIgb2JqZWN0XG4gICAgZXhwb3J0cy5fZXh0ZW5kKGN0eCwgb3B0cyk7XG4gIH1cbiAgLy8gc2V0IGRlZmF1bHQgb3B0aW9uc1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LnNob3dIaWRkZW4pKSBjdHguc2hvd0hpZGRlbiA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmRlcHRoKSkgY3R4LmRlcHRoID0gMjtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jb2xvcnMpKSBjdHguY29sb3JzID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY3VzdG9tSW5zcGVjdCkpIGN0eC5jdXN0b21JbnNwZWN0ID0gdHJ1ZTtcbiAgaWYgKGN0eC5jb2xvcnMpIGN0eC5zdHlsaXplID0gc3R5bGl6ZVdpdGhDb2xvcjtcbiAgcmV0dXJuIGZvcm1hdFZhbHVlKGN0eCwgb2JqLCBjdHguZGVwdGgpO1xufVxuZXhwb3J0cy5pbnNwZWN0ID0gaW5zcGVjdDtcblxuXG4vLyBodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0FOU0lfZXNjYXBlX2NvZGUjZ3JhcGhpY3Ncbmluc3BlY3QuY29sb3JzID0ge1xuICAnYm9sZCcgOiBbMSwgMjJdLFxuICAnaXRhbGljJyA6IFszLCAyM10sXG4gICd1bmRlcmxpbmUnIDogWzQsIDI0XSxcbiAgJ2ludmVyc2UnIDogWzcsIDI3XSxcbiAgJ3doaXRlJyA6IFszNywgMzldLFxuICAnZ3JleScgOiBbOTAsIDM5XSxcbiAgJ2JsYWNrJyA6IFszMCwgMzldLFxuICAnYmx1ZScgOiBbMzQsIDM5XSxcbiAgJ2N5YW4nIDogWzM2LCAzOV0sXG4gICdncmVlbicgOiBbMzIsIDM5XSxcbiAgJ21hZ2VudGEnIDogWzM1LCAzOV0sXG4gICdyZWQnIDogWzMxLCAzOV0sXG4gICd5ZWxsb3cnIDogWzMzLCAzOV1cbn07XG5cbi8vIERvbid0IHVzZSAnYmx1ZScgbm90IHZpc2libGUgb24gY21kLmV4ZVxuaW5zcGVjdC5zdHlsZXMgPSB7XG4gICdzcGVjaWFsJzogJ2N5YW4nLFxuICAnbnVtYmVyJzogJ3llbGxvdycsXG4gICdib29sZWFuJzogJ3llbGxvdycsXG4gICd1bmRlZmluZWQnOiAnZ3JleScsXG4gICdudWxsJzogJ2JvbGQnLFxuICAnc3RyaW5nJzogJ2dyZWVuJyxcbiAgJ2RhdGUnOiAnbWFnZW50YScsXG4gIC8vIFwibmFtZVwiOiBpbnRlbnRpb25hbGx5IG5vdCBzdHlsaW5nXG4gICdyZWdleHAnOiAncmVkJ1xufTtcblxuXG5mdW5jdGlvbiBzdHlsaXplV2l0aENvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHZhciBzdHlsZSA9IGluc3BlY3Quc3R5bGVzW3N0eWxlVHlwZV07XG5cbiAgaWYgKHN0eWxlKSB7XG4gICAgcmV0dXJuICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMF0gKyAnbScgKyBzdHIgK1xuICAgICAgICAgICAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzFdICsgJ20nO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzdHI7XG4gIH1cbn1cblxuXG5mdW5jdGlvbiBzdHlsaXplTm9Db2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICByZXR1cm4gc3RyO1xufVxuXG5cbmZ1bmN0aW9uIGFycmF5VG9IYXNoKGFycmF5KSB7XG4gIHZhciBoYXNoID0ge307XG5cbiAgYXJyYXkuZm9yRWFjaChmdW5jdGlvbih2YWwsIGlkeCkge1xuICAgIGhhc2hbdmFsXSA9IHRydWU7XG4gIH0pO1xuXG4gIHJldHVybiBoYXNoO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFZhbHVlKGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcykge1xuICAvLyBQcm92aWRlIGEgaG9vayBmb3IgdXNlci1zcGVjaWZpZWQgaW5zcGVjdCBmdW5jdGlvbnMuXG4gIC8vIENoZWNrIHRoYXQgdmFsdWUgaXMgYW4gb2JqZWN0IHdpdGggYW4gaW5zcGVjdCBmdW5jdGlvbiBvbiBpdFxuICBpZiAoY3R4LmN1c3RvbUluc3BlY3QgJiZcbiAgICAgIHZhbHVlICYmXG4gICAgICBpc0Z1bmN0aW9uKHZhbHVlLmluc3BlY3QpICYmXG4gICAgICAvLyBGaWx0ZXIgb3V0IHRoZSB1dGlsIG1vZHVsZSwgaXQncyBpbnNwZWN0IGZ1bmN0aW9uIGlzIHNwZWNpYWxcbiAgICAgIHZhbHVlLmluc3BlY3QgIT09IGV4cG9ydHMuaW5zcGVjdCAmJlxuICAgICAgLy8gQWxzbyBmaWx0ZXIgb3V0IGFueSBwcm90b3R5cGUgb2JqZWN0cyB1c2luZyB0aGUgY2lyY3VsYXIgY2hlY2suXG4gICAgICAhKHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLnByb3RvdHlwZSA9PT0gdmFsdWUpKSB7XG4gICAgdmFyIHJldCA9IHZhbHVlLmluc3BlY3QocmVjdXJzZVRpbWVzLCBjdHgpO1xuICAgIGlmICghaXNTdHJpbmcocmV0KSkge1xuICAgICAgcmV0ID0gZm9ybWF0VmFsdWUoY3R4LCByZXQsIHJlY3Vyc2VUaW1lcyk7XG4gICAgfVxuICAgIHJldHVybiByZXQ7XG4gIH1cblxuICAvLyBQcmltaXRpdmUgdHlwZXMgY2Fubm90IGhhdmUgcHJvcGVydGllc1xuICB2YXIgcHJpbWl0aXZlID0gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpO1xuICBpZiAocHJpbWl0aXZlKSB7XG4gICAgcmV0dXJuIHByaW1pdGl2ZTtcbiAgfVxuXG4gIC8vIExvb2sgdXAgdGhlIGtleXMgb2YgdGhlIG9iamVjdC5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyh2YWx1ZSk7XG4gIHZhciB2aXNpYmxlS2V5cyA9IGFycmF5VG9IYXNoKGtleXMpO1xuXG4gIGlmIChjdHguc2hvd0hpZGRlbikge1xuICAgIGtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSk7XG4gIH1cblxuICAvLyBJRSBkb2Vzbid0IG1ha2UgZXJyb3IgZmllbGRzIG5vbi1lbnVtZXJhYmxlXG4gIC8vIGh0dHA6Ly9tc2RuLm1pY3Jvc29mdC5jb20vZW4tdXMvbGlicmFyeS9pZS9kd3c1MnNidCh2PXZzLjk0KS5hc3B4XG4gIGlmIChpc0Vycm9yKHZhbHVlKVxuICAgICAgJiYgKGtleXMuaW5kZXhPZignbWVzc2FnZScpID49IDAgfHwga2V5cy5pbmRleE9mKCdkZXNjcmlwdGlvbicpID49IDApKSB7XG4gICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIC8vIFNvbWUgdHlwZSBvZiBvYmplY3Qgd2l0aG91dCBwcm9wZXJ0aWVzIGNhbiBiZSBzaG9ydGN1dHRlZC5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwKSB7XG4gICAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgICB2YXIgbmFtZSA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbRnVuY3Rpb24nICsgbmFtZSArICddJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9XG4gICAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShEYXRlLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ2RhdGUnKTtcbiAgICB9XG4gICAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICAgIH1cbiAgfVxuXG4gIHZhciBiYXNlID0gJycsIGFycmF5ID0gZmFsc2UsIGJyYWNlcyA9IFsneycsICd9J107XG5cbiAgLy8gTWFrZSBBcnJheSBzYXkgdGhhdCB0aGV5IGFyZSBBcnJheVxuICBpZiAoaXNBcnJheSh2YWx1ZSkpIHtcbiAgICBhcnJheSA9IHRydWU7XG4gICAgYnJhY2VzID0gWydbJywgJ10nXTtcbiAgfVxuXG4gIC8vIE1ha2UgZnVuY3Rpb25zIHNheSB0aGF0IHRoZXkgYXJlIGZ1bmN0aW9uc1xuICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICB2YXIgbiA9IHZhbHVlLm5hbWUgPyAnOiAnICsgdmFsdWUubmFtZSA6ICcnO1xuICAgIGJhc2UgPSAnIFtGdW5jdGlvbicgKyBuICsgJ10nO1xuICB9XG5cbiAgLy8gTWFrZSBSZWdFeHBzIHNheSB0aGF0IHRoZXkgYXJlIFJlZ0V4cHNcbiAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBkYXRlcyB3aXRoIHByb3BlcnRpZXMgZmlyc3Qgc2F5IHRoZSBkYXRlXG4gIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIERhdGUucHJvdG90eXBlLnRvVVRDU3RyaW5nLmNhbGwodmFsdWUpO1xuICB9XG5cbiAgLy8gTWFrZSBlcnJvciB3aXRoIG1lc3NhZ2UgZmlyc3Qgc2F5IHRoZSBlcnJvclxuICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgaWYgKGtleXMubGVuZ3RoID09PSAwICYmICghYXJyYXkgfHwgdmFsdWUubGVuZ3RoID09IDApKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyBicmFjZXNbMV07XG4gIH1cblxuICBpZiAocmVjdXJzZVRpbWVzIDwgMCkge1xuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW09iamVjdF0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuXG4gIGN0eC5zZWVuLnB1c2godmFsdWUpO1xuXG4gIHZhciBvdXRwdXQ7XG4gIGlmIChhcnJheSkge1xuICAgIG91dHB1dCA9IGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpO1xuICB9IGVsc2Uge1xuICAgIG91dHB1dCA9IGtleXMubWFwKGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpO1xuICAgIH0pO1xuICB9XG5cbiAgY3R4LnNlZW4ucG9wKCk7XG5cbiAgcmV0dXJuIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSkge1xuICBpZiAoaXNVbmRlZmluZWQodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgndW5kZWZpbmVkJywgJ3VuZGVmaW5lZCcpO1xuICBpZiAoaXNTdHJpbmcodmFsdWUpKSB7XG4gICAgdmFyIHNpbXBsZSA9ICdcXCcnICsgSlNPTi5zdHJpbmdpZnkodmFsdWUpLnJlcGxhY2UoL15cInxcIiQvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpICsgJ1xcJyc7XG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKHNpbXBsZSwgJ3N0cmluZycpO1xuICB9XG4gIGlmIChpc051bWJlcih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdudW1iZXInKTtcbiAgaWYgKGlzQm9vbGVhbih2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCcnICsgdmFsdWUsICdib29sZWFuJyk7XG4gIC8vIEZvciBzb21lIHJlYXNvbiB0eXBlb2YgbnVsbCBpcyBcIm9iamVjdFwiLCBzbyBzcGVjaWFsIGNhc2UgaGVyZS5cbiAgaWYgKGlzTnVsbCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCdudWxsJywgJ251bGwnKTtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRFcnJvcih2YWx1ZSkge1xuICByZXR1cm4gJ1snICsgRXJyb3IucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpICsgJ10nO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEFycmF5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleXMpIHtcbiAgdmFyIG91dHB1dCA9IFtdO1xuICBmb3IgKHZhciBpID0gMCwgbCA9IHZhbHVlLmxlbmd0aDsgaSA8IGw7ICsraSkge1xuICAgIGlmIChoYXNPd25Qcm9wZXJ0eSh2YWx1ZSwgU3RyaW5nKGkpKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBTdHJpbmcoaSksIHRydWUpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgb3V0cHV0LnB1c2goJycpO1xuICAgIH1cbiAgfVxuICBrZXlzLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgaWYgKCFrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIGtleSwgdHJ1ZSkpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSkge1xuICB2YXIgbmFtZSwgc3RyLCBkZXNjO1xuICBkZXNjID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcih2YWx1ZSwga2V5KSB8fCB7IHZhbHVlOiB2YWx1ZVtrZXldIH07XG4gIGlmIChkZXNjLmdldCkge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXIvU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmIChkZXNjLnNldCkge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tTZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKCFoYXNPd25Qcm9wZXJ0eSh2aXNpYmxlS2V5cywga2V5KSkge1xuICAgIG5hbWUgPSAnWycgKyBrZXkgKyAnXSc7XG4gIH1cbiAgaWYgKCFzdHIpIHtcbiAgICBpZiAoY3R4LnNlZW4uaW5kZXhPZihkZXNjLnZhbHVlKSA8IDApIHtcbiAgICAgIGlmIChpc051bGwocmVjdXJzZVRpbWVzKSkge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIG51bGwpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCByZWN1cnNlVGltZXMgLSAxKTtcbiAgICAgIH1cbiAgICAgIGlmIChzdHIuaW5kZXhPZignXFxuJykgPiAtMSkge1xuICAgICAgICBpZiAoYXJyYXkpIHtcbiAgICAgICAgICBzdHIgPSBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJykuc3Vic3RyKDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHN0ciA9ICdcXG4nICsgc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0NpcmN1bGFyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmIChpc1VuZGVmaW5lZChuYW1lKSkge1xuICAgIGlmIChhcnJheSAmJiBrZXkubWF0Y2goL15cXGQrJC8pKSB7XG4gICAgICByZXR1cm4gc3RyO1xuICAgIH1cbiAgICBuYW1lID0gSlNPTi5zdHJpbmdpZnkoJycgKyBrZXkpO1xuICAgIGlmIChuYW1lLm1hdGNoKC9eXCIoW2EtekEtWl9dW2EtekEtWl8wLTldKilcIiQvKSkge1xuICAgICAgbmFtZSA9IG5hbWUuc3Vic3RyKDEsIG5hbWUubGVuZ3RoIC0gMik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ25hbWUnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmFtZSA9IG5hbWUucmVwbGFjZSgvJy9nLCBcIlxcXFwnXCIpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJylcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLyheXCJ8XCIkKS9nLCBcIidcIik7XG4gICAgICBuYW1lID0gY3R4LnN0eWxpemUobmFtZSwgJ3N0cmluZycpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBuYW1lICsgJzogJyArIHN0cjtcbn1cblxuXG5mdW5jdGlvbiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcykge1xuICB2YXIgbnVtTGluZXNFc3QgPSAwO1xuICB2YXIgbGVuZ3RoID0gb3V0cHV0LnJlZHVjZShmdW5jdGlvbihwcmV2LCBjdXIpIHtcbiAgICBudW1MaW5lc0VzdCsrO1xuICAgIGlmIChjdXIuaW5kZXhPZignXFxuJykgPj0gMCkgbnVtTGluZXNFc3QrKztcbiAgICByZXR1cm4gcHJldiArIGN1ci5yZXBsYWNlKC9cXHUwMDFiXFxbXFxkXFxkP20vZywgJycpLmxlbmd0aCArIDE7XG4gIH0sIDApO1xuXG4gIGlmIChsZW5ndGggPiA2MCkge1xuICAgIHJldHVybiBicmFjZXNbMF0gK1xuICAgICAgICAgICAoYmFzZSA9PT0gJycgPyAnJyA6IGJhc2UgKyAnXFxuICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgb3V0cHV0LmpvaW4oJyxcXG4gICcpICtcbiAgICAgICAgICAgJyAnICtcbiAgICAgICAgICAgYnJhY2VzWzFdO1xuICB9XG5cbiAgcmV0dXJuIGJyYWNlc1swXSArIGJhc2UgKyAnICcgKyBvdXRwdXQuam9pbignLCAnKSArICcgJyArIGJyYWNlc1sxXTtcbn1cblxuXG4vLyBOT1RFOiBUaGVzZSB0eXBlIGNoZWNraW5nIGZ1bmN0aW9ucyBpbnRlbnRpb25hbGx5IGRvbid0IHVzZSBgaW5zdGFuY2VvZmBcbi8vIGJlY2F1c2UgaXQgaXMgZnJhZ2lsZSBhbmQgY2FuIGJlIGVhc2lseSBmYWtlZCB3aXRoIGBPYmplY3QuY3JlYXRlKClgLlxuZnVuY3Rpb24gaXNBcnJheShhcikge1xuICByZXR1cm4gQXJyYXkuaXNBcnJheShhcik7XG59XG5leHBvcnRzLmlzQXJyYXkgPSBpc0FycmF5O1xuXG5mdW5jdGlvbiBpc0Jvb2xlYW4oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnYm9vbGVhbic7XG59XG5leHBvcnRzLmlzQm9vbGVhbiA9IGlzQm9vbGVhbjtcblxuZnVuY3Rpb24gaXNOdWxsKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGwgPSBpc051bGw7XG5cbmZ1bmN0aW9uIGlzTnVsbE9yVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbE9yVW5kZWZpbmVkID0gaXNOdWxsT3JVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5leHBvcnRzLmlzTnVtYmVyID0gaXNOdW1iZXI7XG5cbmZ1bmN0aW9uIGlzU3RyaW5nKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N0cmluZyc7XG59XG5leHBvcnRzLmlzU3RyaW5nID0gaXNTdHJpbmc7XG5cbmZ1bmN0aW9uIGlzU3ltYm9sKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCc7XG59XG5leHBvcnRzLmlzU3ltYm9sID0gaXNTeW1ib2w7XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG5leHBvcnRzLmlzVW5kZWZpbmVkID0gaXNVbmRlZmluZWQ7XG5cbmZ1bmN0aW9uIGlzUmVnRXhwKHJlKSB7XG4gIHJldHVybiBpc09iamVjdChyZSkgJiYgb2JqZWN0VG9TdHJpbmcocmUpID09PSAnW29iamVjdCBSZWdFeHBdJztcbn1cbmV4cG9ydHMuaXNSZWdFeHAgPSBpc1JlZ0V4cDtcblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5leHBvcnRzLmlzT2JqZWN0ID0gaXNPYmplY3Q7XG5cbmZ1bmN0aW9uIGlzRGF0ZShkKSB7XG4gIHJldHVybiBpc09iamVjdChkKSAmJiBvYmplY3RUb1N0cmluZyhkKSA9PT0gJ1tvYmplY3QgRGF0ZV0nO1xufVxuZXhwb3J0cy5pc0RhdGUgPSBpc0RhdGU7XG5cbmZ1bmN0aW9uIGlzRXJyb3IoZSkge1xuICByZXR1cm4gaXNPYmplY3QoZSkgJiZcbiAgICAgIChvYmplY3RUb1N0cmluZyhlKSA9PT0gJ1tvYmplY3QgRXJyb3JdJyB8fCBlIGluc3RhbmNlb2YgRXJyb3IpO1xufVxuZXhwb3J0cy5pc0Vycm9yID0gaXNFcnJvcjtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5leHBvcnRzLmlzRnVuY3Rpb24gPSBpc0Z1bmN0aW9uO1xuXG5mdW5jdGlvbiBpc1ByaW1pdGl2ZShhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbCB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnbnVtYmVyJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N0cmluZycgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnIHx8ICAvLyBFUzYgc3ltYm9sXG4gICAgICAgICB0eXBlb2YgYXJnID09PSAndW5kZWZpbmVkJztcbn1cbmV4cG9ydHMuaXNQcmltaXRpdmUgPSBpc1ByaW1pdGl2ZTtcblxuZXhwb3J0cy5pc0J1ZmZlciA9IHJlcXVpcmUoJy4vc3VwcG9ydC9pc0J1ZmZlcicpO1xuXG5mdW5jdGlvbiBvYmplY3RUb1N0cmluZyhvKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobyk7XG59XG5cblxuZnVuY3Rpb24gcGFkKG4pIHtcbiAgcmV0dXJuIG4gPCAxMCA/ICcwJyArIG4udG9TdHJpbmcoMTApIDogbi50b1N0cmluZygxMCk7XG59XG5cblxudmFyIG1vbnRocyA9IFsnSmFuJywgJ0ZlYicsICdNYXInLCAnQXByJywgJ01heScsICdKdW4nLCAnSnVsJywgJ0F1ZycsICdTZXAnLFxuICAgICAgICAgICAgICAnT2N0JywgJ05vdicsICdEZWMnXTtcblxuLy8gMjYgRmViIDE2OjE5OjM0XG5mdW5jdGlvbiB0aW1lc3RhbXAoKSB7XG4gIHZhciBkID0gbmV3IERhdGUoKTtcbiAgdmFyIHRpbWUgPSBbcGFkKGQuZ2V0SG91cnMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldE1pbnV0ZXMoKSksXG4gICAgICAgICAgICAgIHBhZChkLmdldFNlY29uZHMoKSldLmpvaW4oJzonKTtcbiAgcmV0dXJuIFtkLmdldERhdGUoKSwgbW9udGhzW2QuZ2V0TW9udGgoKV0sIHRpbWVdLmpvaW4oJyAnKTtcbn1cblxuXG4vLyBsb2cgaXMganVzdCBhIHRoaW4gd3JhcHBlciB0byBjb25zb2xlLmxvZyB0aGF0IHByZXBlbmRzIGEgdGltZXN0YW1wXG5leHBvcnRzLmxvZyA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLmxvZygnJXMgLSAlcycsIHRpbWVzdGFtcCgpLCBleHBvcnRzLmZvcm1hdC5hcHBseShleHBvcnRzLCBhcmd1bWVudHMpKTtcbn07XG5cblxuLyoqXG4gKiBJbmhlcml0IHRoZSBwcm90b3R5cGUgbWV0aG9kcyBmcm9tIG9uZSBjb25zdHJ1Y3RvciBpbnRvIGFub3RoZXIuXG4gKlxuICogVGhlIEZ1bmN0aW9uLnByb3RvdHlwZS5pbmhlcml0cyBmcm9tIGxhbmcuanMgcmV3cml0dGVuIGFzIGEgc3RhbmRhbG9uZVxuICogZnVuY3Rpb24gKG5vdCBvbiBGdW5jdGlvbi5wcm90b3R5cGUpLiBOT1RFOiBJZiB0aGlzIGZpbGUgaXMgdG8gYmUgbG9hZGVkXG4gKiBkdXJpbmcgYm9vdHN0cmFwcGluZyB0aGlzIGZ1bmN0aW9uIG5lZWRzIHRvIGJlIHJld3JpdHRlbiB1c2luZyBzb21lIG5hdGl2ZVxuICogZnVuY3Rpb25zIGFzIHByb3RvdHlwZSBzZXR1cCB1c2luZyBub3JtYWwgSmF2YVNjcmlwdCBkb2VzIG5vdCB3b3JrIGFzXG4gKiBleHBlY3RlZCBkdXJpbmcgYm9vdHN0cmFwcGluZyAoc2VlIG1pcnJvci5qcyBpbiByMTE0OTAzKS5cbiAqXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBjdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHdoaWNoIG5lZWRzIHRvIGluaGVyaXQgdGhlXG4gKiAgICAgcHJvdG90eXBlLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gc3VwZXJDdG9yIENvbnN0cnVjdG9yIGZ1bmN0aW9uIHRvIGluaGVyaXQgcHJvdG90eXBlIGZyb20uXG4gKi9cbmV4cG9ydHMuaW5oZXJpdHMgPSByZXF1aXJlKCdpbmhlcml0cycpO1xuXG5leHBvcnRzLl9leHRlbmQgPSBmdW5jdGlvbihvcmlnaW4sIGFkZCkge1xuICAvLyBEb24ndCBkbyBhbnl0aGluZyBpZiBhZGQgaXNuJ3QgYW4gb2JqZWN0XG4gIGlmICghYWRkIHx8ICFpc09iamVjdChhZGQpKSByZXR1cm4gb3JpZ2luO1xuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXMoYWRkKTtcbiAgdmFyIGkgPSBrZXlzLmxlbmd0aDtcbiAgd2hpbGUgKGktLSkge1xuICAgIG9yaWdpbltrZXlzW2ldXSA9IGFkZFtrZXlzW2ldXTtcbiAgfVxuICByZXR1cm4gb3JpZ2luO1xufTtcblxuZnVuY3Rpb24gaGFzT3duUHJvcGVydHkob2JqLCBwcm9wKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKTtcbn1cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbnNlcnQtbW9kdWxlLWdsb2JhbHMvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qc1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbmZ1bmN0aW9uIEV2ZW50RW1pdHRlcigpIHtcbiAgdGhpcy5fZXZlbnRzID0gdGhpcy5fZXZlbnRzIHx8IHt9O1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSB0aGlzLl9tYXhMaXN0ZW5lcnMgfHwgdW5kZWZpbmVkO1xufVxubW9kdWxlLmV4cG9ydHMgPSBFdmVudEVtaXR0ZXI7XG5cbi8vIEJhY2t3YXJkcy1jb21wYXQgd2l0aCBub2RlIDAuMTAueFxuRXZlbnRFbWl0dGVyLkV2ZW50RW1pdHRlciA9IEV2ZW50RW1pdHRlcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fZXZlbnRzID0gdW5kZWZpbmVkO1xuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5fbWF4TGlzdGVuZXJzID0gdW5kZWZpbmVkO1xuXG4vLyBCeSBkZWZhdWx0IEV2ZW50RW1pdHRlcnMgd2lsbCBwcmludCBhIHdhcm5pbmcgaWYgbW9yZSB0aGFuIDEwIGxpc3RlbmVycyBhcmVcbi8vIGFkZGVkIHRvIGl0LiBUaGlzIGlzIGEgdXNlZnVsIGRlZmF1bHQgd2hpY2ggaGVscHMgZmluZGluZyBtZW1vcnkgbGVha3MuXG5FdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycyA9IDEwO1xuXG4vLyBPYnZpb3VzbHkgbm90IGFsbCBFbWl0dGVycyBzaG91bGQgYmUgbGltaXRlZCB0byAxMC4gVGhpcyBmdW5jdGlvbiBhbGxvd3Ncbi8vIHRoYXQgdG8gYmUgaW5jcmVhc2VkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5zZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbihuKSB7XG4gIGlmICghaXNOdW1iZXIobikgfHwgbiA8IDAgfHwgaXNOYU4obikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCduIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInKTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBlciwgaGFuZGxlciwgbGVuLCBhcmdzLCBpLCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAodHlwZSA9PT0gJ2Vycm9yJykge1xuICAgIGlmICghdGhpcy5fZXZlbnRzLmVycm9yIHx8XG4gICAgICAgIChpc09iamVjdCh0aGlzLl9ldmVudHMuZXJyb3IpICYmICF0aGlzLl9ldmVudHMuZXJyb3IubGVuZ3RoKSkge1xuICAgICAgZXIgPSBhcmd1bWVudHNbMV07XG4gICAgICBpZiAoZXIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgICB0aHJvdyBlcjsgLy8gVW5oYW5kbGVkICdlcnJvcicgZXZlbnRcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IFR5cGVFcnJvcignVW5jYXVnaHQsIHVuc3BlY2lmaWVkIFwiZXJyb3JcIiBldmVudC4nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVyID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc1VuZGVmaW5lZChoYW5kbGVyKSlcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgaWYgKGlzRnVuY3Rpb24oaGFuZGxlcikpIHtcbiAgICBzd2l0Y2ggKGFyZ3VtZW50cy5sZW5ndGgpIHtcbiAgICAgIC8vIGZhc3QgY2FzZXNcbiAgICAgIGNhc2UgMTpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMjpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAzOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0pO1xuICAgICAgICBicmVhaztcbiAgICAgIC8vIHNsb3dlclxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICAgICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBoYW5kbGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH1cbiAgfSBlbHNlIGlmIChpc09iamVjdChoYW5kbGVyKSkge1xuICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcblxuICAgIGxpc3RlbmVycyA9IGhhbmRsZXIuc2xpY2UoKTtcbiAgICBsZW4gPSBsaXN0ZW5lcnMubGVuZ3RoO1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIGxpc3RlbmVyc1tpXS5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBtO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBUbyBhdm9pZCByZWN1cnNpb24gaW4gdGhlIGNhc2UgdGhhdCB0eXBlID09PSBcIm5ld0xpc3RlbmVyXCIhIEJlZm9yZVxuICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyXCIuXG4gIGlmICh0aGlzLl9ldmVudHMubmV3TGlzdGVuZXIpXG4gICAgdGhpcy5lbWl0KCduZXdMaXN0ZW5lcicsIHR5cGUsXG4gICAgICAgICAgICAgIGlzRnVuY3Rpb24obGlzdGVuZXIubGlzdGVuZXIpID9cbiAgICAgICAgICAgICAgbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgLy8gT3B0aW1pemUgdGhlIGNhc2Ugb2Ygb25lIGxpc3RlbmVyLiBEb24ndCBuZWVkIHRoZSBleHRyYSBhcnJheSBvYmplY3QuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gbGlzdGVuZXI7XG4gIGVsc2UgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgLy8gSWYgd2UndmUgYWxyZWFkeSBnb3QgYW4gYXJyYXksIGp1c3QgYXBwZW5kLlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5wdXNoKGxpc3RlbmVyKTtcbiAgZWxzZVxuICAgIC8vIEFkZGluZyB0aGUgc2Vjb25kIGVsZW1lbnQsIG5lZWQgdG8gY2hhbmdlIHRvIGFycmF5LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IFt0aGlzLl9ldmVudHNbdHlwZV0sIGxpc3RlbmVyXTtcblxuICAvLyBDaGVjayBmb3IgbGlzdGVuZXIgbGVha1xuICBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSAmJiAhdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCkge1xuICAgIHZhciBtO1xuICAgIGlmICghaXNVbmRlZmluZWQodGhpcy5fbWF4TGlzdGVuZXJzKSkge1xuICAgICAgbSA9IHRoaXMuX21heExpc3RlbmVycztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IEV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzO1xuICAgIH1cblxuICAgIGlmIChtICYmIG0gPiAwICYmIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGggPiBtKSB7XG4gICAgICB0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkID0gdHJ1ZTtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJyhub2RlKSB3YXJuaW5nOiBwb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5ICcgK1xuICAgICAgICAgICAgICAgICAgICAnbGVhayBkZXRlY3RlZC4gJWQgbGlzdGVuZXJzIGFkZGVkLiAnICtcbiAgICAgICAgICAgICAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0LicsXG4gICAgICAgICAgICAgICAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS5sZW5ndGgpO1xuICAgICAgY29uc29sZS50cmFjZSgpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbiA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub25jZSA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICB2YXIgZmlyZWQgPSBmYWxzZTtcblxuICBmdW5jdGlvbiBnKCkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgZyk7XG5cbiAgICBpZiAoIWZpcmVkKSB7XG4gICAgICBmaXJlZCA9IHRydWU7XG4gICAgICBsaXN0ZW5lci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH1cbiAgfVxuXG4gIGcubGlzdGVuZXIgPSBsaXN0ZW5lcjtcbiAgdGhpcy5vbih0eXBlLCBnKTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8vIGVtaXRzIGEgJ3JlbW92ZUxpc3RlbmVyJyBldmVudCBpZmYgdGhlIGxpc3RlbmVyIHdhcyByZW1vdmVkXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUxpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIGxpc3QsIHBvc2l0aW9uLCBsZW5ndGgsIGk7XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgbGlzdCA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgbGVuZ3RoID0gbGlzdC5sZW5ndGg7XG4gIHBvc2l0aW9uID0gLTE7XG5cbiAgaWYgKGxpc3QgPT09IGxpc3RlbmVyIHx8XG4gICAgICAoaXNGdW5jdGlvbihsaXN0Lmxpc3RlbmVyKSAmJiBsaXN0Lmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuXG4gIH0gZWxzZSBpZiAoaXNPYmplY3QobGlzdCkpIHtcbiAgICBmb3IgKGkgPSBsZW5ndGg7IGktLSA+IDA7KSB7XG4gICAgICBpZiAobGlzdFtpXSA9PT0gbGlzdGVuZXIgfHxcbiAgICAgICAgICAobGlzdFtpXS5saXN0ZW5lciAmJiBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICAgICAgcG9zaXRpb24gPSBpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAocG9zaXRpb24gPCAwKVxuICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgIGxpc3QubGVuZ3RoID0gMDtcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgfSBlbHNlIHtcbiAgICAgIGxpc3Quc3BsaWNlKHBvc2l0aW9uLCAxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcbiAgfVxuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciBrZXksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICByZXR1cm4gdGhpcztcblxuICAvLyBub3QgbGlzdGVuaW5nIGZvciByZW1vdmVMaXN0ZW5lciwgbm8gbmVlZCB0byBlbWl0XG4gIGlmICghdGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKSB7XG4gICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApXG4gICAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICBlbHNlIGlmICh0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgLy8gZW1pdCByZW1vdmVMaXN0ZW5lciBmb3IgYWxsIGxpc3RlbmVycyBvbiBhbGwgZXZlbnRzXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgZm9yIChrZXkgaW4gdGhpcy5fZXZlbnRzKSB7XG4gICAgICBpZiAoa2V5ID09PSAncmVtb3ZlTGlzdGVuZXInKSBjb250aW51ZTtcbiAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKGtleSk7XG4gICAgfVxuICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdyZW1vdmVMaXN0ZW5lcicpO1xuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIHJldHVybiB0aGlzO1xuICB9XG5cbiAgbGlzdGVuZXJzID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGxpc3RlbmVycykpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVycyk7XG4gIH0gZWxzZSB7XG4gICAgLy8gTElGTyBvcmRlclxuICAgIHdoaWxlIChsaXN0ZW5lcnMubGVuZ3RoKVxuICAgICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnNbbGlzdGVuZXJzLmxlbmd0aCAtIDFdKTtcbiAgfVxuICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5saXN0ZW5lcnMgPSBmdW5jdGlvbih0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghdGhpcy5fZXZlbnRzIHx8ICF0aGlzLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gW107XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24odGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSBbdGhpcy5fZXZlbnRzW3R5cGVdXTtcbiAgZWxzZVxuICAgIHJldCA9IHRoaXMuX2V2ZW50c1t0eXBlXS5zbGljZSgpO1xuICByZXR1cm4gcmV0O1xufTtcblxuRXZlbnRFbWl0dGVyLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gIHZhciByZXQ7XG4gIGlmICghZW1pdHRlci5fZXZlbnRzIHx8ICFlbWl0dGVyLl9ldmVudHNbdHlwZV0pXG4gICAgcmV0ID0gMDtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbihlbWl0dGVyLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IDE7XG4gIGVsc2VcbiAgICByZXQgPSBlbWl0dGVyLl9ldmVudHNbdHlwZV0ubGVuZ3RoO1xuICByZXR1cm4gcmV0O1xufTtcblxuZnVuY3Rpb24gaXNGdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdmdW5jdGlvbic7XG59XG5cbmZ1bmN0aW9uIGlzTnVtYmVyKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ251bWJlcic7XG59XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuIiwiaWYgKHR5cGVvZiBPYmplY3QuY3JlYXRlID09PSAnZnVuY3Rpb24nKSB7XG4gIC8vIGltcGxlbWVudGF0aW9uIGZyb20gc3RhbmRhcmQgbm9kZS5qcyAndXRpbCcgbW9kdWxlXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICBjdG9yLnByb3RvdHlwZSA9IE9iamVjdC5jcmVhdGUoc3VwZXJDdG9yLnByb3RvdHlwZSwge1xuICAgICAgY29uc3RydWN0b3I6IHtcbiAgICAgICAgdmFsdWU6IGN0b3IsXG4gICAgICAgIGVudW1lcmFibGU6IGZhbHNlLFxuICAgICAgICB3cml0YWJsZTogdHJ1ZSxcbiAgICAgICAgY29uZmlndXJhYmxlOiB0cnVlXG4gICAgICB9XG4gICAgfSk7XG4gIH07XG59IGVsc2Uge1xuICAvLyBvbGQgc2Nob29sIHNoaW0gZm9yIG9sZCBicm93c2Vyc1xuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgdmFyIFRlbXBDdG9yID0gZnVuY3Rpb24gKCkge31cbiAgICBUZW1wQ3Rvci5wcm90b3R5cGUgPSBzdXBlckN0b3IucHJvdG90eXBlXG4gICAgY3Rvci5wcm90b3R5cGUgPSBuZXcgVGVtcEN0b3IoKVxuICAgIGN0b3IucHJvdG90eXBlLmNvbnN0cnVjdG9yID0gY3RvclxuICB9XG59XG4iLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn1cblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuIiwiLypcbiAqICBDb3B5cmlnaHQgMjAxMSBUd2l0dGVyLCBJbmMuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqICB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqICBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG4oZnVuY3Rpb24gKEhvZ2FuKSB7XG4gIC8vIFNldHVwIHJlZ2V4ICBhc3NpZ25tZW50c1xuICAvLyByZW1vdmUgd2hpdGVzcGFjZSBhY2NvcmRpbmcgdG8gTXVzdGFjaGUgc3BlY1xuICB2YXIgcklzV2hpdGVzcGFjZSA9IC9cXFMvLFxuICAgICAgclF1b3QgPSAvXFxcIi9nLFxuICAgICAgck5ld2xpbmUgPSAgL1xcbi9nLFxuICAgICAgckNyID0gL1xcci9nLFxuICAgICAgclNsYXNoID0gL1xcXFwvZyxcbiAgICAgIHRhZ1R5cGVzID0ge1xuICAgICAgICAnIyc6IDEsICdeJzogMiwgJy8nOiAzLCAgJyEnOiA0LCAnPic6IDUsXG4gICAgICAgICc8JzogNiwgJz0nOiA3LCAnX3YnOiA4LCAneyc6IDksICcmJzogMTBcbiAgICAgIH07XG5cbiAgSG9nYW4uc2NhbiA9IGZ1bmN0aW9uIHNjYW4odGV4dCwgZGVsaW1pdGVycykge1xuICAgIHZhciBsZW4gPSB0ZXh0Lmxlbmd0aCxcbiAgICAgICAgSU5fVEVYVCA9IDAsXG4gICAgICAgIElOX1RBR19UWVBFID0gMSxcbiAgICAgICAgSU5fVEFHID0gMixcbiAgICAgICAgc3RhdGUgPSBJTl9URVhULFxuICAgICAgICB0YWdUeXBlID0gbnVsbCxcbiAgICAgICAgdGFnID0gbnVsbCxcbiAgICAgICAgYnVmID0gJycsXG4gICAgICAgIHRva2VucyA9IFtdLFxuICAgICAgICBzZWVuVGFnID0gZmFsc2UsXG4gICAgICAgIGkgPSAwLFxuICAgICAgICBsaW5lU3RhcnQgPSAwLFxuICAgICAgICBvdGFnID0gJ3t7JyxcbiAgICAgICAgY3RhZyA9ICd9fSc7XG5cbiAgICBmdW5jdGlvbiBhZGRCdWYoKSB7XG4gICAgICBpZiAoYnVmLmxlbmd0aCA+IDApIHtcbiAgICAgICAgdG9rZW5zLnB1c2gobmV3IFN0cmluZyhidWYpKTtcbiAgICAgICAgYnVmID0gJyc7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGluZUlzV2hpdGVzcGFjZSgpIHtcbiAgICAgIHZhciBpc0FsbFdoaXRlc3BhY2UgPSB0cnVlO1xuICAgICAgZm9yICh2YXIgaiA9IGxpbmVTdGFydDsgaiA8IHRva2Vucy5sZW5ndGg7IGorKykge1xuICAgICAgICBpc0FsbFdoaXRlc3BhY2UgPVxuICAgICAgICAgICh0b2tlbnNbal0udGFnICYmIHRhZ1R5cGVzW3Rva2Vuc1tqXS50YWddIDwgdGFnVHlwZXNbJ192J10pIHx8XG4gICAgICAgICAgKCF0b2tlbnNbal0udGFnICYmIHRva2Vuc1tqXS5tYXRjaChySXNXaGl0ZXNwYWNlKSA9PT0gbnVsbCk7XG4gICAgICAgIGlmICghaXNBbGxXaGl0ZXNwYWNlKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBpc0FsbFdoaXRlc3BhY2U7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZmlsdGVyTGluZShoYXZlU2VlblRhZywgbm9OZXdMaW5lKSB7XG4gICAgICBhZGRCdWYoKTtcblxuICAgICAgaWYgKGhhdmVTZWVuVGFnICYmIGxpbmVJc1doaXRlc3BhY2UoKSkge1xuICAgICAgICBmb3IgKHZhciBqID0gbGluZVN0YXJ0LCBuZXh0OyBqIDwgdG9rZW5zLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgaWYgKCF0b2tlbnNbal0udGFnKSB7XG4gICAgICAgICAgICBpZiAoKG5leHQgPSB0b2tlbnNbaisxXSkgJiYgbmV4dC50YWcgPT0gJz4nKSB7XG4gICAgICAgICAgICAgIC8vIHNldCBpbmRlbnQgdG8gdG9rZW4gdmFsdWVcbiAgICAgICAgICAgICAgbmV4dC5pbmRlbnQgPSB0b2tlbnNbal0udG9TdHJpbmcoKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdG9rZW5zLnNwbGljZShqLCAxKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIW5vTmV3TGluZSkge1xuICAgICAgICB0b2tlbnMucHVzaCh7dGFnOidcXG4nfSk7XG4gICAgICB9XG5cbiAgICAgIHNlZW5UYWcgPSBmYWxzZTtcbiAgICAgIGxpbmVTdGFydCA9IHRva2Vucy5sZW5ndGg7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2hhbmdlRGVsaW1pdGVycyh0ZXh0LCBpbmRleCkge1xuICAgICAgdmFyIGNsb3NlID0gJz0nICsgY3RhZyxcbiAgICAgICAgICBjbG9zZUluZGV4ID0gdGV4dC5pbmRleE9mKGNsb3NlLCBpbmRleCksXG4gICAgICAgICAgZGVsaW1pdGVycyA9IHRyaW0oXG4gICAgICAgICAgICB0ZXh0LnN1YnN0cmluZyh0ZXh0LmluZGV4T2YoJz0nLCBpbmRleCkgKyAxLCBjbG9zZUluZGV4KVxuICAgICAgICAgICkuc3BsaXQoJyAnKTtcblxuICAgICAgb3RhZyA9IGRlbGltaXRlcnNbMF07XG4gICAgICBjdGFnID0gZGVsaW1pdGVyc1sxXTtcblxuICAgICAgcmV0dXJuIGNsb3NlSW5kZXggKyBjbG9zZS5sZW5ndGggLSAxO1xuICAgIH1cblxuICAgIGlmIChkZWxpbWl0ZXJzKSB7XG4gICAgICBkZWxpbWl0ZXJzID0gZGVsaW1pdGVycy5zcGxpdCgnICcpO1xuICAgICAgb3RhZyA9IGRlbGltaXRlcnNbMF07XG4gICAgICBjdGFnID0gZGVsaW1pdGVyc1sxXTtcbiAgICB9XG5cbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgIGlmIChzdGF0ZSA9PSBJTl9URVhUKSB7XG4gICAgICAgIGlmICh0YWdDaGFuZ2Uob3RhZywgdGV4dCwgaSkpIHtcbiAgICAgICAgICAtLWk7XG4gICAgICAgICAgYWRkQnVmKCk7XG4gICAgICAgICAgc3RhdGUgPSBJTl9UQUdfVFlQRTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpZiAodGV4dC5jaGFyQXQoaSkgPT0gJ1xcbicpIHtcbiAgICAgICAgICAgIGZpbHRlckxpbmUoc2VlblRhZyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGJ1ZiArPSB0ZXh0LmNoYXJBdChpKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc3RhdGUgPT0gSU5fVEFHX1RZUEUpIHtcbiAgICAgICAgaSArPSBvdGFnLmxlbmd0aCAtIDE7XG4gICAgICAgIHRhZyA9IHRhZ1R5cGVzW3RleHQuY2hhckF0KGkgKyAxKV07XG4gICAgICAgIHRhZ1R5cGUgPSB0YWcgPyB0ZXh0LmNoYXJBdChpICsgMSkgOiAnX3YnO1xuICAgICAgICBpZiAodGFnVHlwZSA9PSAnPScpIHtcbiAgICAgICAgICBpID0gY2hhbmdlRGVsaW1pdGVycyh0ZXh0LCBpKTtcbiAgICAgICAgICBzdGF0ZSA9IElOX1RFWFQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHRhZykge1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzdGF0ZSA9IElOX1RBRztcbiAgICAgICAgfVxuICAgICAgICBzZWVuVGFnID0gaTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGlmICh0YWdDaGFuZ2UoY3RhZywgdGV4dCwgaSkpIHtcbiAgICAgICAgICB0b2tlbnMucHVzaCh7dGFnOiB0YWdUeXBlLCBuOiB0cmltKGJ1ZiksIG90YWc6IG90YWcsIGN0YWc6IGN0YWcsXG4gICAgICAgICAgICAgICAgICAgICAgIGk6ICh0YWdUeXBlID09ICcvJykgPyBzZWVuVGFnIC0gY3RhZy5sZW5ndGggOiBpICsgb3RhZy5sZW5ndGh9KTtcbiAgICAgICAgICBidWYgPSAnJztcbiAgICAgICAgICBpICs9IGN0YWcubGVuZ3RoIC0gMTtcbiAgICAgICAgICBzdGF0ZSA9IElOX1RFWFQ7XG4gICAgICAgICAgaWYgKHRhZ1R5cGUgPT0gJ3snKSB7XG4gICAgICAgICAgICBpZiAoY3RhZyA9PSAnfX0nKSB7XG4gICAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGNsZWFuVHJpcGxlU3RhY2hlKHRva2Vuc1t0b2tlbnMubGVuZ3RoIC0gMV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBidWYgKz0gdGV4dC5jaGFyQXQoaSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmaWx0ZXJMaW5lKHNlZW5UYWcsIHRydWUpO1xuXG4gICAgcmV0dXJuIHRva2VucztcbiAgfVxuXG4gIGZ1bmN0aW9uIGNsZWFuVHJpcGxlU3RhY2hlKHRva2VuKSB7XG4gICAgaWYgKHRva2VuLm4uc3Vic3RyKHRva2VuLm4ubGVuZ3RoIC0gMSkgPT09ICd9Jykge1xuICAgICAgdG9rZW4ubiA9IHRva2VuLm4uc3Vic3RyaW5nKDAsIHRva2VuLm4ubGVuZ3RoIC0gMSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gdHJpbShzKSB7XG4gICAgaWYgKHMudHJpbSkge1xuICAgICAgcmV0dXJuIHMudHJpbSgpO1xuICAgIH1cblxuICAgIHJldHVybiBzLnJlcGxhY2UoL15cXHMqfFxccyokL2csICcnKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHRhZ0NoYW5nZSh0YWcsIHRleHQsIGluZGV4KSB7XG4gICAgaWYgKHRleHQuY2hhckF0KGluZGV4KSAhPSB0YWcuY2hhckF0KDApKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgZm9yICh2YXIgaSA9IDEsIGwgPSB0YWcubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBpZiAodGV4dC5jaGFyQXQoaW5kZXggKyBpKSAhPSB0YWcuY2hhckF0KGkpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGJ1aWxkVHJlZSh0b2tlbnMsIGtpbmQsIHN0YWNrLCBjdXN0b21UYWdzKSB7XG4gICAgdmFyIGluc3RydWN0aW9ucyA9IFtdLFxuICAgICAgICBvcGVuZXIgPSBudWxsLFxuICAgICAgICB0b2tlbiA9IG51bGw7XG5cbiAgICB3aGlsZSAodG9rZW5zLmxlbmd0aCA+IDApIHtcbiAgICAgIHRva2VuID0gdG9rZW5zLnNoaWZ0KCk7XG4gICAgICBpZiAodG9rZW4udGFnID09ICcjJyB8fCB0b2tlbi50YWcgPT0gJ14nIHx8IGlzT3BlbmVyKHRva2VuLCBjdXN0b21UYWdzKSkge1xuICAgICAgICBzdGFjay5wdXNoKHRva2VuKTtcbiAgICAgICAgdG9rZW4ubm9kZXMgPSBidWlsZFRyZWUodG9rZW5zLCB0b2tlbi50YWcsIHN0YWNrLCBjdXN0b21UYWdzKTtcbiAgICAgICAgaW5zdHJ1Y3Rpb25zLnB1c2godG9rZW4pO1xuICAgICAgfSBlbHNlIGlmICh0b2tlbi50YWcgPT0gJy8nKSB7XG4gICAgICAgIGlmIChzdGFjay5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nsb3NpbmcgdGFnIHdpdGhvdXQgb3BlbmVyOiAvJyArIHRva2VuLm4pO1xuICAgICAgICB9XG4gICAgICAgIG9wZW5lciA9IHN0YWNrLnBvcCgpO1xuICAgICAgICBpZiAodG9rZW4ubiAhPSBvcGVuZXIubiAmJiAhaXNDbG9zZXIodG9rZW4ubiwgb3BlbmVyLm4sIGN1c3RvbVRhZ3MpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdOZXN0aW5nIGVycm9yOiAnICsgb3BlbmVyLm4gKyAnIHZzLiAnICsgdG9rZW4ubik7XG4gICAgICAgIH1cbiAgICAgICAgb3BlbmVyLmVuZCA9IHRva2VuLmk7XG4gICAgICAgIHJldHVybiBpbnN0cnVjdGlvbnM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbnN0cnVjdGlvbnMucHVzaCh0b2tlbik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignbWlzc2luZyBjbG9zaW5nIHRhZzogJyArIHN0YWNrLnBvcCgpLm4pO1xuICAgIH1cblxuICAgIHJldHVybiBpbnN0cnVjdGlvbnM7XG4gIH1cblxuICBmdW5jdGlvbiBpc09wZW5lcih0b2tlbiwgdGFncykge1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gdGFncy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGlmICh0YWdzW2ldLm8gPT0gdG9rZW4ubikge1xuICAgICAgICB0b2tlbi50YWcgPSAnIyc7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGlzQ2xvc2VyKGNsb3NlLCBvcGVuLCB0YWdzKSB7XG4gICAgZm9yICh2YXIgaSA9IDAsIGwgPSB0YWdzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgaWYgKHRhZ3NbaV0uYyA9PSBjbG9zZSAmJiB0YWdzW2ldLm8gPT0gb3Blbikge1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBIb2dhbi5nZW5lcmF0ZSA9IGZ1bmN0aW9uICh0cmVlLCB0ZXh0LCBvcHRpb25zKSB7XG4gICAgdmFyIGNvZGUgPSAndmFyIF89dGhpcztfLmIoaT1pfHxcIlwiKTsnICsgd2Fsayh0cmVlKSArICdyZXR1cm4gXy5mbCgpOyc7XG4gICAgaWYgKG9wdGlvbnMuYXNTdHJpbmcpIHtcbiAgICAgIHJldHVybiAnZnVuY3Rpb24oYyxwLGkpeycgKyBjb2RlICsgJzt9JztcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEhvZ2FuLlRlbXBsYXRlKG5ldyBGdW5jdGlvbignYycsICdwJywgJ2knLCBjb2RlKSwgdGV4dCwgSG9nYW4sIG9wdGlvbnMpO1xuICB9XG5cbiAgZnVuY3Rpb24gZXNjKHMpIHtcbiAgICByZXR1cm4gcy5yZXBsYWNlKHJTbGFzaCwgJ1xcXFxcXFxcJylcbiAgICAgICAgICAgIC5yZXBsYWNlKHJRdW90LCAnXFxcXFxcXCInKVxuICAgICAgICAgICAgLnJlcGxhY2Uock5ld2xpbmUsICdcXFxcbicpXG4gICAgICAgICAgICAucmVwbGFjZShyQ3IsICdcXFxccicpO1xuICB9XG5cbiAgZnVuY3Rpb24gY2hvb3NlTWV0aG9kKHMpIHtcbiAgICByZXR1cm4gKH5zLmluZGV4T2YoJy4nKSkgPyAnZCcgOiAnZic7XG4gIH1cblxuICBmdW5jdGlvbiB3YWxrKHRyZWUpIHtcbiAgICB2YXIgY29kZSA9ICcnO1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gdHJlZS5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIHZhciB0YWcgPSB0cmVlW2ldLnRhZztcbiAgICAgIGlmICh0YWcgPT0gJyMnKSB7XG4gICAgICAgIGNvZGUgKz0gc2VjdGlvbih0cmVlW2ldLm5vZGVzLCB0cmVlW2ldLm4sIGNob29zZU1ldGhvZCh0cmVlW2ldLm4pLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHJlZVtpXS5pLCB0cmVlW2ldLmVuZCwgdHJlZVtpXS5vdGFnICsgXCIgXCIgKyB0cmVlW2ldLmN0YWcpO1xuICAgICAgfSBlbHNlIGlmICh0YWcgPT0gJ14nKSB7XG4gICAgICAgIGNvZGUgKz0gaW52ZXJ0ZWRTZWN0aW9uKHRyZWVbaV0ubm9kZXMsIHRyZWVbaV0ubixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2hvb3NlTWV0aG9kKHRyZWVbaV0ubikpO1xuICAgICAgfSBlbHNlIGlmICh0YWcgPT0gJzwnIHx8IHRhZyA9PSAnPicpIHtcbiAgICAgICAgY29kZSArPSBwYXJ0aWFsKHRyZWVbaV0pO1xuICAgICAgfSBlbHNlIGlmICh0YWcgPT0gJ3snIHx8IHRhZyA9PSAnJicpIHtcbiAgICAgICAgY29kZSArPSB0cmlwbGVTdGFjaGUodHJlZVtpXS5uLCBjaG9vc2VNZXRob2QodHJlZVtpXS5uKSk7XG4gICAgICB9IGVsc2UgaWYgKHRhZyA9PSAnXFxuJykge1xuICAgICAgICBjb2RlICs9IHRleHQoJ1wiXFxcXG5cIicgKyAodHJlZS5sZW5ndGgtMSA9PSBpID8gJycgOiAnICsgaScpKTtcbiAgICAgIH0gZWxzZSBpZiAodGFnID09ICdfdicpIHtcbiAgICAgICAgY29kZSArPSB2YXJpYWJsZSh0cmVlW2ldLm4sIGNob29zZU1ldGhvZCh0cmVlW2ldLm4pKTtcbiAgICAgIH0gZWxzZSBpZiAodGFnID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29kZSArPSB0ZXh0KCdcIicgKyBlc2ModHJlZVtpXSkgKyAnXCInKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNvZGU7XG4gIH1cblxuICBmdW5jdGlvbiBzZWN0aW9uKG5vZGVzLCBpZCwgbWV0aG9kLCBzdGFydCwgZW5kLCB0YWdzKSB7XG4gICAgcmV0dXJuICdpZihfLnMoXy4nICsgbWV0aG9kICsgJyhcIicgKyBlc2MoaWQpICsgJ1wiLGMscCwxKSwnICtcbiAgICAgICAgICAgJ2MscCwwLCcgKyBzdGFydCArICcsJyArIGVuZCArICcsXCInICsgdGFncyArICdcIikpeycgK1xuICAgICAgICAgICAnXy5ycyhjLHAsJyArXG4gICAgICAgICAgICdmdW5jdGlvbihjLHAsXyl7JyArXG4gICAgICAgICAgIHdhbGsobm9kZXMpICtcbiAgICAgICAgICAgJ30pO2MucG9wKCk7fSc7XG4gIH1cblxuICBmdW5jdGlvbiBpbnZlcnRlZFNlY3Rpb24obm9kZXMsIGlkLCBtZXRob2QpIHtcbiAgICByZXR1cm4gJ2lmKCFfLnMoXy4nICsgbWV0aG9kICsgJyhcIicgKyBlc2MoaWQpICsgJ1wiLGMscCwxKSxjLHAsMSwwLDAsXCJcIikpeycgK1xuICAgICAgICAgICB3YWxrKG5vZGVzKSArXG4gICAgICAgICAgICd9Oyc7XG4gIH1cblxuICBmdW5jdGlvbiBwYXJ0aWFsKHRvaykge1xuICAgIHJldHVybiAnXy5iKF8ucnAoXCInICsgIGVzYyh0b2subikgKyAnXCIsYyxwLFwiJyArICh0b2suaW5kZW50IHx8ICcnKSArICdcIikpOyc7XG4gIH1cblxuICBmdW5jdGlvbiB0cmlwbGVTdGFjaGUoaWQsIG1ldGhvZCkge1xuICAgIHJldHVybiAnXy5iKF8udChfLicgKyBtZXRob2QgKyAnKFwiJyArIGVzYyhpZCkgKyAnXCIsYyxwLDApKSk7JztcbiAgfVxuXG4gIGZ1bmN0aW9uIHZhcmlhYmxlKGlkLCBtZXRob2QpIHtcbiAgICByZXR1cm4gJ18uYihfLnYoXy4nICsgbWV0aG9kICsgJyhcIicgKyBlc2MoaWQpICsgJ1wiLGMscCwwKSkpOyc7XG4gIH1cblxuICBmdW5jdGlvbiB0ZXh0KGlkKSB7XG4gICAgcmV0dXJuICdfLmIoJyArIGlkICsgJyk7JztcbiAgfVxuXG4gIEhvZ2FuLnBhcnNlID0gZnVuY3Rpb24odG9rZW5zLCB0ZXh0LCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgcmV0dXJuIGJ1aWxkVHJlZSh0b2tlbnMsICcnLCBbXSwgb3B0aW9ucy5zZWN0aW9uVGFncyB8fCBbXSk7XG4gIH0sXG5cbiAgSG9nYW4uY2FjaGUgPSB7fTtcblxuICBIb2dhbi5jb21waWxlID0gZnVuY3Rpb24odGV4dCwgb3B0aW9ucykge1xuICAgIC8vIG9wdGlvbnNcbiAgICAvL1xuICAgIC8vIGFzU3RyaW5nOiBmYWxzZSAoZGVmYXVsdClcbiAgICAvL1xuICAgIC8vIHNlY3Rpb25UYWdzOiBbe286ICdfZm9vJywgYzogJ2Zvbyd9XVxuICAgIC8vIEFuIGFycmF5IG9mIG9iamVjdCB3aXRoIG8gYW5kIGMgZmllbGRzIHRoYXQgaW5kaWNhdGUgbmFtZXMgZm9yIGN1c3RvbVxuICAgIC8vIHNlY3Rpb24gdGFncy4gVGhlIGV4YW1wbGUgYWJvdmUgYWxsb3dzIHBhcnNpbmcgb2Yge3tfZm9vfX17ey9mb299fS5cbiAgICAvL1xuICAgIC8vIGRlbGltaXRlcnM6IEEgc3RyaW5nIHRoYXQgb3ZlcnJpZGVzIHRoZSBkZWZhdWx0IGRlbGltaXRlcnMuXG4gICAgLy8gRXhhbXBsZTogXCI8JSAlPlwiXG4gICAgLy9cbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuICAgIHZhciBrZXkgPSB0ZXh0ICsgJ3x8JyArICEhb3B0aW9ucy5hc1N0cmluZztcblxuICAgIHZhciB0ID0gdGhpcy5jYWNoZVtrZXldO1xuXG4gICAgaWYgKHQpIHtcbiAgICAgIHJldHVybiB0O1xuICAgIH1cblxuICAgIHQgPSB0aGlzLmdlbmVyYXRlKHRoaXMucGFyc2UodGhpcy5zY2FuKHRleHQsIG9wdGlvbnMuZGVsaW1pdGVycyksIHRleHQsIG9wdGlvbnMpLCB0ZXh0LCBvcHRpb25zKTtcbiAgICByZXR1cm4gdGhpcy5jYWNoZVtrZXldID0gdDtcbiAgfTtcbn0pKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJyA/IGV4cG9ydHMgOiBIb2dhbik7XG4iLCIvKlxuICogIENvcHlyaWdodCAyMDExIFR3aXR0ZXIsIEluYy5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbi8vIFRoaXMgZmlsZSBpcyBmb3IgdXNlIHdpdGggTm9kZS5qcy4gU2VlIGRpc3QvIGZvciBicm93c2VyIGZpbGVzLlxuXG52YXIgSG9nYW4gPSByZXF1aXJlKCcuL2NvbXBpbGVyJyk7XG5Ib2dhbi5UZW1wbGF0ZSA9IHJlcXVpcmUoJy4vdGVtcGxhdGUnKS5UZW1wbGF0ZTtcbm1vZHVsZS5leHBvcnRzID0gSG9nYW47ICIsIi8qXG4gKiAgQ29weXJpZ2h0IDIwMTEgVHdpdHRlciwgSW5jLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiAgeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiAgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiAgbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxudmFyIEhvZ2FuID0ge307XG5cbihmdW5jdGlvbiAoSG9nYW4sIHVzZUFycmF5QnVmZmVyKSB7XG4gIEhvZ2FuLlRlbXBsYXRlID0gZnVuY3Rpb24gKHJlbmRlckZ1bmMsIHRleHQsIGNvbXBpbGVyLCBvcHRpb25zKSB7XG4gICAgdGhpcy5yID0gcmVuZGVyRnVuYyB8fCB0aGlzLnI7XG4gICAgdGhpcy5jID0gY29tcGlsZXI7XG4gICAgdGhpcy5vcHRpb25zID0gb3B0aW9ucztcbiAgICB0aGlzLnRleHQgPSB0ZXh0IHx8ICcnO1xuICAgIHRoaXMuYnVmID0gKHVzZUFycmF5QnVmZmVyKSA/IFtdIDogJyc7XG4gIH1cblxuICBIb2dhbi5UZW1wbGF0ZS5wcm90b3R5cGUgPSB7XG4gICAgLy8gcmVuZGVyOiByZXBsYWNlZCBieSBnZW5lcmF0ZWQgY29kZS5cbiAgICByOiBmdW5jdGlvbiAoY29udGV4dCwgcGFydGlhbHMsIGluZGVudCkgeyByZXR1cm4gJyc7IH0sXG5cbiAgICAvLyB2YXJpYWJsZSBlc2NhcGluZ1xuICAgIHY6IGhvZ2FuRXNjYXBlLFxuXG4gICAgLy8gdHJpcGxlIHN0YWNoZVxuICAgIHQ6IGNvZXJjZVRvU3RyaW5nLFxuXG4gICAgcmVuZGVyOiBmdW5jdGlvbiByZW5kZXIoY29udGV4dCwgcGFydGlhbHMsIGluZGVudCkge1xuICAgICAgcmV0dXJuIHRoaXMucmkoW2NvbnRleHRdLCBwYXJ0aWFscyB8fCB7fSwgaW5kZW50KTtcbiAgICB9LFxuXG4gICAgLy8gcmVuZGVyIGludGVybmFsIC0tIGEgaG9vayBmb3Igb3ZlcnJpZGVzIHRoYXQgY2F0Y2hlcyBwYXJ0aWFscyB0b29cbiAgICByaTogZnVuY3Rpb24gKGNvbnRleHQsIHBhcnRpYWxzLCBpbmRlbnQpIHtcbiAgICAgIHJldHVybiB0aGlzLnIoY29udGV4dCwgcGFydGlhbHMsIGluZGVudCk7XG4gICAgfSxcblxuICAgIC8vIHRyaWVzIHRvIGZpbmQgYSBwYXJ0aWFsIGluIHRoZSBjdXJlbnQgc2NvcGUgYW5kIHJlbmRlciBpdFxuICAgIHJwOiBmdW5jdGlvbihuYW1lLCBjb250ZXh0LCBwYXJ0aWFscywgaW5kZW50KSB7XG4gICAgICB2YXIgcGFydGlhbCA9IHBhcnRpYWxzW25hbWVdO1xuXG4gICAgICBpZiAoIXBhcnRpYWwpIHtcbiAgICAgICAgcmV0dXJuICcnO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5jICYmIHR5cGVvZiBwYXJ0aWFsID09ICdzdHJpbmcnKSB7XG4gICAgICAgIHBhcnRpYWwgPSB0aGlzLmMuY29tcGlsZShwYXJ0aWFsLCB0aGlzLm9wdGlvbnMpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcGFydGlhbC5yaShjb250ZXh0LCBwYXJ0aWFscywgaW5kZW50KTtcbiAgICB9LFxuXG4gICAgLy8gcmVuZGVyIGEgc2VjdGlvblxuICAgIHJzOiBmdW5jdGlvbihjb250ZXh0LCBwYXJ0aWFscywgc2VjdGlvbikge1xuICAgICAgdmFyIHRhaWwgPSBjb250ZXh0W2NvbnRleHQubGVuZ3RoIC0gMV07XG5cbiAgICAgIGlmICghaXNBcnJheSh0YWlsKSkge1xuICAgICAgICBzZWN0aW9uKGNvbnRleHQsIHBhcnRpYWxzLCB0aGlzKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRhaWwubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgY29udGV4dC5wdXNoKHRhaWxbaV0pO1xuICAgICAgICBzZWN0aW9uKGNvbnRleHQsIHBhcnRpYWxzLCB0aGlzKTtcbiAgICAgICAgY29udGV4dC5wb3AoKTtcbiAgICAgIH1cbiAgICB9LFxuXG4gICAgLy8gbWF5YmUgc3RhcnQgYSBzZWN0aW9uXG4gICAgczogZnVuY3Rpb24odmFsLCBjdHgsIHBhcnRpYWxzLCBpbnZlcnRlZCwgc3RhcnQsIGVuZCwgdGFncykge1xuICAgICAgdmFyIHBhc3M7XG5cbiAgICAgIGlmIChpc0FycmF5KHZhbCkgJiYgdmFsLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGlmICh0eXBlb2YgdmFsID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdmFsID0gdGhpcy5scyh2YWwsIGN0eCwgcGFydGlhbHMsIGludmVydGVkLCBzdGFydCwgZW5kLCB0YWdzKTtcbiAgICAgIH1cblxuICAgICAgcGFzcyA9ICh2YWwgPT09ICcnKSB8fCAhIXZhbDtcblxuICAgICAgaWYgKCFpbnZlcnRlZCAmJiBwYXNzICYmIGN0eCkge1xuICAgICAgICBjdHgucHVzaCgodHlwZW9mIHZhbCA9PSAnb2JqZWN0JykgPyB2YWwgOiBjdHhbY3R4Lmxlbmd0aCAtIDFdKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHBhc3M7XG4gICAgfSxcblxuICAgIC8vIGZpbmQgdmFsdWVzIHdpdGggZG90dGVkIG5hbWVzXG4gICAgZDogZnVuY3Rpb24oa2V5LCBjdHgsIHBhcnRpYWxzLCByZXR1cm5Gb3VuZCkge1xuICAgICAgdmFyIG5hbWVzID0ga2V5LnNwbGl0KCcuJyksXG4gICAgICAgICAgdmFsID0gdGhpcy5mKG5hbWVzWzBdLCBjdHgsIHBhcnRpYWxzLCByZXR1cm5Gb3VuZCksXG4gICAgICAgICAgY3ggPSBudWxsO1xuXG4gICAgICBpZiAoa2V5ID09PSAnLicgJiYgaXNBcnJheShjdHhbY3R4Lmxlbmd0aCAtIDJdKSkge1xuICAgICAgICByZXR1cm4gY3R4W2N0eC5sZW5ndGggLSAxXTtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBuYW1lcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAodmFsICYmIHR5cGVvZiB2YWwgPT0gJ29iamVjdCcgJiYgbmFtZXNbaV0gaW4gdmFsKSB7XG4gICAgICAgICAgY3ggPSB2YWw7XG4gICAgICAgICAgdmFsID0gdmFsW25hbWVzW2ldXTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB2YWwgPSAnJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocmV0dXJuRm91bmQgJiYgIXZhbCkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG5cbiAgICAgIGlmICghcmV0dXJuRm91bmQgJiYgdHlwZW9mIHZhbCA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIGN0eC5wdXNoKGN4KTtcbiAgICAgICAgdmFsID0gdGhpcy5sdih2YWwsIGN0eCwgcGFydGlhbHMpO1xuICAgICAgICBjdHgucG9wKCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2YWw7XG4gICAgfSxcblxuICAgIC8vIGZpbmQgdmFsdWVzIHdpdGggbm9ybWFsIG5hbWVzXG4gICAgZjogZnVuY3Rpb24oa2V5LCBjdHgsIHBhcnRpYWxzLCByZXR1cm5Gb3VuZCkge1xuICAgICAgdmFyIHZhbCA9IGZhbHNlLFxuICAgICAgICAgIHYgPSBudWxsLFxuICAgICAgICAgIGZvdW5kID0gZmFsc2U7XG5cbiAgICAgIGZvciAodmFyIGkgPSBjdHgubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICAgICAgdiA9IGN0eFtpXTtcbiAgICAgICAgaWYgKHYgJiYgdHlwZW9mIHYgPT0gJ29iamVjdCcgJiYga2V5IGluIHYpIHtcbiAgICAgICAgICB2YWwgPSB2W2tleV07XG4gICAgICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICghZm91bmQpIHtcbiAgICAgICAgcmV0dXJuIChyZXR1cm5Gb3VuZCkgPyBmYWxzZSA6IFwiXCI7XG4gICAgICB9XG5cbiAgICAgIGlmICghcmV0dXJuRm91bmQgJiYgdHlwZW9mIHZhbCA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHZhbCA9IHRoaXMubHYodmFsLCBjdHgsIHBhcnRpYWxzKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHZhbDtcbiAgICB9LFxuXG4gICAgLy8gaGlnaGVyIG9yZGVyIHRlbXBsYXRlc1xuICAgIGhvOiBmdW5jdGlvbih2YWwsIGN4LCBwYXJ0aWFscywgdGV4dCwgdGFncykge1xuICAgICAgdmFyIGNvbXBpbGVyID0gdGhpcy5jO1xuICAgICAgdmFyIG9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG4gICAgICBvcHRpb25zLmRlbGltaXRlcnMgPSB0YWdzO1xuICAgICAgdmFyIHRleHQgPSB2YWwuY2FsbChjeCwgdGV4dCk7XG4gICAgICB0ZXh0ID0gKHRleHQgPT0gbnVsbCkgPyBTdHJpbmcodGV4dCkgOiB0ZXh0LnRvU3RyaW5nKCk7XG4gICAgICB0aGlzLmIoY29tcGlsZXIuY29tcGlsZSh0ZXh0LCBvcHRpb25zKS5yZW5kZXIoY3gsIHBhcnRpYWxzKSk7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfSxcblxuICAgIC8vIHRlbXBsYXRlIHJlc3VsdCBidWZmZXJpbmdcbiAgICBiOiAodXNlQXJyYXlCdWZmZXIpID8gZnVuY3Rpb24ocykgeyB0aGlzLmJ1Zi5wdXNoKHMpOyB9IDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24ocykgeyB0aGlzLmJ1ZiArPSBzOyB9LFxuICAgIGZsOiAodXNlQXJyYXlCdWZmZXIpID8gZnVuY3Rpb24oKSB7IHZhciByID0gdGhpcy5idWYuam9pbignJyk7IHRoaXMuYnVmID0gW107IHJldHVybiByOyB9IDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKCkgeyB2YXIgciA9IHRoaXMuYnVmOyB0aGlzLmJ1ZiA9ICcnOyByZXR1cm4gcjsgfSxcblxuICAgIC8vIGxhbWJkYSByZXBsYWNlIHNlY3Rpb25cbiAgICBsczogZnVuY3Rpb24odmFsLCBjdHgsIHBhcnRpYWxzLCBpbnZlcnRlZCwgc3RhcnQsIGVuZCwgdGFncykge1xuICAgICAgdmFyIGN4ID0gY3R4W2N0eC5sZW5ndGggLSAxXSxcbiAgICAgICAgICB0ID0gbnVsbDtcblxuICAgICAgaWYgKCFpbnZlcnRlZCAmJiB0aGlzLmMgJiYgdmFsLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaG8odmFsLCBjeCwgcGFydGlhbHMsIHRoaXMudGV4dC5zdWJzdHJpbmcoc3RhcnQsIGVuZCksIHRhZ3MpO1xuICAgICAgfVxuXG4gICAgICB0ID0gdmFsLmNhbGwoY3gpO1xuXG4gICAgICBpZiAodHlwZW9mIHQgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBpZiAoaW52ZXJ0ZWQpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLmMpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5obyh0LCBjeCwgcGFydGlhbHMsIHRoaXMudGV4dC5zdWJzdHJpbmcoc3RhcnQsIGVuZCksIHRhZ3MpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0O1xuICAgIH0sXG5cbiAgICAvLyBsYW1iZGEgcmVwbGFjZSB2YXJpYWJsZVxuICAgIGx2OiBmdW5jdGlvbih2YWwsIGN0eCwgcGFydGlhbHMpIHtcbiAgICAgIHZhciBjeCA9IGN0eFtjdHgubGVuZ3RoIC0gMV07XG4gICAgICB2YXIgcmVzdWx0ID0gdmFsLmNhbGwoY3gpO1xuXG4gICAgICBpZiAodHlwZW9mIHJlc3VsdCA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHJlc3VsdCA9IGNvZXJjZVRvU3RyaW5nKHJlc3VsdC5jYWxsKGN4KSk7XG4gICAgICAgIGlmICh0aGlzLmMgJiYgfnJlc3VsdC5pbmRleE9mKFwie1xcdTAwN0JcIikpIHtcbiAgICAgICAgICByZXR1cm4gdGhpcy5jLmNvbXBpbGUocmVzdWx0LCB0aGlzLm9wdGlvbnMpLnJlbmRlcihjeCwgcGFydGlhbHMpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBjb2VyY2VUb1N0cmluZyhyZXN1bHQpO1xuICAgIH1cblxuICB9O1xuXG4gIHZhciByQW1wID0gLyYvZyxcbiAgICAgIHJMdCA9IC88L2csXG4gICAgICByR3QgPSAvPi9nLFxuICAgICAgckFwb3MgPS9cXCcvZyxcbiAgICAgIHJRdW90ID0gL1xcXCIvZyxcbiAgICAgIGhDaGFycyA9L1smPD5cXFwiXFwnXS87XG5cblxuICBmdW5jdGlvbiBjb2VyY2VUb1N0cmluZyh2YWwpIHtcbiAgICByZXR1cm4gU3RyaW5nKCh2YWwgPT09IG51bGwgfHwgdmFsID09PSB1bmRlZmluZWQpID8gJycgOiB2YWwpO1xuICB9XG5cbiAgZnVuY3Rpb24gaG9nYW5Fc2NhcGUoc3RyKSB7XG4gICAgc3RyID0gY29lcmNlVG9TdHJpbmcoc3RyKTtcbiAgICByZXR1cm4gaENoYXJzLnRlc3Qoc3RyKSA/XG4gICAgICBzdHJcbiAgICAgICAgLnJlcGxhY2UockFtcCwnJmFtcDsnKVxuICAgICAgICAucmVwbGFjZShyTHQsJyZsdDsnKVxuICAgICAgICAucmVwbGFjZShyR3QsJyZndDsnKVxuICAgICAgICAucmVwbGFjZShyQXBvcywnJiMzOTsnKVxuICAgICAgICAucmVwbGFjZShyUXVvdCwgJyZxdW90OycpIDpcbiAgICAgIHN0cjtcbiAgfVxuXG4gIHZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbihhKSB7XG4gICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChhKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfTtcblxufSkodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnID8gZXhwb3J0cyA6IEhvZ2FuKTtcblxuIiwiLy8gICAgIFVuZGVyc2NvcmUuanMgMS42LjBcbi8vICAgICBodHRwOi8vdW5kZXJzY29yZWpzLm9yZ1xuLy8gICAgIChjKSAyMDA5LTIwMTQgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbi8vICAgICBVbmRlcnNjb3JlIG1heSBiZSBmcmVlbHkgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuXG4oZnVuY3Rpb24oKSB7XG5cbiAgLy8gQmFzZWxpbmUgc2V0dXBcbiAgLy8gLS0tLS0tLS0tLS0tLS1cblxuICAvLyBFc3RhYmxpc2ggdGhlIHJvb3Qgb2JqZWN0LCBgd2luZG93YCBpbiB0aGUgYnJvd3Nlciwgb3IgYGV4cG9ydHNgIG9uIHRoZSBzZXJ2ZXIuXG4gIHZhciByb290ID0gdGhpcztcblxuICAvLyBTYXZlIHRoZSBwcmV2aW91cyB2YWx1ZSBvZiB0aGUgYF9gIHZhcmlhYmxlLlxuICB2YXIgcHJldmlvdXNVbmRlcnNjb3JlID0gcm9vdC5fO1xuXG4gIC8vIEVzdGFibGlzaCB0aGUgb2JqZWN0IHRoYXQgZ2V0cyByZXR1cm5lZCB0byBicmVhayBvdXQgb2YgYSBsb29wIGl0ZXJhdGlvbi5cbiAgdmFyIGJyZWFrZXIgPSB7fTtcblxuICAvLyBTYXZlIGJ5dGVzIGluIHRoZSBtaW5pZmllZCAoYnV0IG5vdCBnemlwcGVkKSB2ZXJzaW9uOlxuICB2YXIgQXJyYXlQcm90byA9IEFycmF5LnByb3RvdHlwZSwgT2JqUHJvdG8gPSBPYmplY3QucHJvdG90eXBlLCBGdW5jUHJvdG8gPSBGdW5jdGlvbi5wcm90b3R5cGU7XG5cbiAgLy8gQ3JlYXRlIHF1aWNrIHJlZmVyZW5jZSB2YXJpYWJsZXMgZm9yIHNwZWVkIGFjY2VzcyB0byBjb3JlIHByb3RvdHlwZXMuXG4gIHZhclxuICAgIHB1c2ggICAgICAgICAgICAgPSBBcnJheVByb3RvLnB1c2gsXG4gICAgc2xpY2UgICAgICAgICAgICA9IEFycmF5UHJvdG8uc2xpY2UsXG4gICAgY29uY2F0ICAgICAgICAgICA9IEFycmF5UHJvdG8uY29uY2F0LFxuICAgIHRvU3RyaW5nICAgICAgICAgPSBPYmpQcm90by50b1N0cmluZyxcbiAgICBoYXNPd25Qcm9wZXJ0eSAgID0gT2JqUHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbiAgLy8gQWxsICoqRUNNQVNjcmlwdCA1KiogbmF0aXZlIGZ1bmN0aW9uIGltcGxlbWVudGF0aW9ucyB0aGF0IHdlIGhvcGUgdG8gdXNlXG4gIC8vIGFyZSBkZWNsYXJlZCBoZXJlLlxuICB2YXJcbiAgICBuYXRpdmVGb3JFYWNoICAgICAgPSBBcnJheVByb3RvLmZvckVhY2gsXG4gICAgbmF0aXZlTWFwICAgICAgICAgID0gQXJyYXlQcm90by5tYXAsXG4gICAgbmF0aXZlUmVkdWNlICAgICAgID0gQXJyYXlQcm90by5yZWR1Y2UsXG4gICAgbmF0aXZlUmVkdWNlUmlnaHQgID0gQXJyYXlQcm90by5yZWR1Y2VSaWdodCxcbiAgICBuYXRpdmVGaWx0ZXIgICAgICAgPSBBcnJheVByb3RvLmZpbHRlcixcbiAgICBuYXRpdmVFdmVyeSAgICAgICAgPSBBcnJheVByb3RvLmV2ZXJ5LFxuICAgIG5hdGl2ZVNvbWUgICAgICAgICA9IEFycmF5UHJvdG8uc29tZSxcbiAgICBuYXRpdmVJbmRleE9mICAgICAgPSBBcnJheVByb3RvLmluZGV4T2YsXG4gICAgbmF0aXZlTGFzdEluZGV4T2YgID0gQXJyYXlQcm90by5sYXN0SW5kZXhPZixcbiAgICBuYXRpdmVJc0FycmF5ICAgICAgPSBBcnJheS5pc0FycmF5LFxuICAgIG5hdGl2ZUtleXMgICAgICAgICA9IE9iamVjdC5rZXlzLFxuICAgIG5hdGl2ZUJpbmQgICAgICAgICA9IEZ1bmNQcm90by5iaW5kO1xuXG4gIC8vIENyZWF0ZSBhIHNhZmUgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgdXNlIGJlbG93LlxuICB2YXIgXyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogaW5zdGFuY2VvZiBfKSByZXR1cm4gb2JqO1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBfKSkgcmV0dXJuIG5ldyBfKG9iaik7XG4gICAgdGhpcy5fd3JhcHBlZCA9IG9iajtcbiAgfTtcblxuICAvLyBFeHBvcnQgdGhlIFVuZGVyc2NvcmUgb2JqZWN0IGZvciAqKk5vZGUuanMqKiwgd2l0aFxuICAvLyBiYWNrd2FyZHMtY29tcGF0aWJpbGl0eSBmb3IgdGhlIG9sZCBgcmVxdWlyZSgpYCBBUEkuIElmIHdlJ3JlIGluXG4gIC8vIHRoZSBicm93c2VyLCBhZGQgYF9gIGFzIGEgZ2xvYmFsIG9iamVjdCB2aWEgYSBzdHJpbmcgaWRlbnRpZmllcixcbiAgLy8gZm9yIENsb3N1cmUgQ29tcGlsZXIgXCJhZHZhbmNlZFwiIG1vZGUuXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IF87XG4gICAgfVxuICAgIGV4cG9ydHMuXyA9IF87XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5fID0gXztcbiAgfVxuXG4gIC8vIEN1cnJlbnQgdmVyc2lvbi5cbiAgXy5WRVJTSU9OID0gJzEuNi4wJztcblxuICAvLyBDb2xsZWN0aW9uIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFRoZSBjb3JuZXJzdG9uZSwgYW4gYGVhY2hgIGltcGxlbWVudGF0aW9uLCBha2EgYGZvckVhY2hgLlxuICAvLyBIYW5kbGVzIG9iamVjdHMgd2l0aCB0aGUgYnVpbHQtaW4gYGZvckVhY2hgLCBhcnJheXMsIGFuZCByYXcgb2JqZWN0cy5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGZvckVhY2hgIGlmIGF2YWlsYWJsZS5cbiAgdmFyIGVhY2ggPSBfLmVhY2ggPSBfLmZvckVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gb2JqO1xuICAgIGlmIChuYXRpdmVGb3JFYWNoICYmIG9iai5mb3JFYWNoID09PSBuYXRpdmVGb3JFYWNoKSB7XG4gICAgICBvYmouZm9yRWFjaChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgfSBlbHNlIGlmIChvYmoubGVuZ3RoID09PSArb2JqLmxlbmd0aCkge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpbaV0sIGksIG9iaikgPT09IGJyZWFrZXIpIHJldHVybjtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXlzW2ldXSwga2V5c1tpXSwgb2JqKSA9PT0gYnJlYWtlcikgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgcmVzdWx0cyBvZiBhcHBseWluZyB0aGUgaXRlcmF0b3IgdG8gZWFjaCBlbGVtZW50LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgbWFwYCBpZiBhdmFpbGFibGUuXG4gIF8ubWFwID0gXy5jb2xsZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0cztcbiAgICBpZiAobmF0aXZlTWFwICYmIG9iai5tYXAgPT09IG5hdGl2ZU1hcCkgcmV0dXJuIG9iai5tYXAoaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJlc3VsdHMucHVzaChpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkpO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIHZhciByZWR1Y2VFcnJvciA9ICdSZWR1Y2Ugb2YgZW1wdHkgYXJyYXkgd2l0aCBubyBpbml0aWFsIHZhbHVlJztcblxuICAvLyAqKlJlZHVjZSoqIGJ1aWxkcyB1cCBhIHNpbmdsZSByZXN1bHQgZnJvbSBhIGxpc3Qgb2YgdmFsdWVzLCBha2EgYGluamVjdGAsXG4gIC8vIG9yIGBmb2xkbGAuIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGByZWR1Y2VgIGlmIGF2YWlsYWJsZS5cbiAgXy5yZWR1Y2UgPSBfLmZvbGRsID0gXy5pbmplY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBtZW1vLCBjb250ZXh0KSB7XG4gICAgdmFyIGluaXRpYWwgPSBhcmd1bWVudHMubGVuZ3RoID4gMjtcbiAgICBpZiAob2JqID09IG51bGwpIG9iaiA9IFtdO1xuICAgIGlmIChuYXRpdmVSZWR1Y2UgJiYgb2JqLnJlZHVjZSA9PT0gbmF0aXZlUmVkdWNlKSB7XG4gICAgICBpZiAoY29udGV4dCkgaXRlcmF0b3IgPSBfLmJpbmQoaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgICAgcmV0dXJuIGluaXRpYWwgPyBvYmoucmVkdWNlKGl0ZXJhdG9yLCBtZW1vKSA6IG9iai5yZWR1Y2UoaXRlcmF0b3IpO1xuICAgIH1cbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAoIWluaXRpYWwpIHtcbiAgICAgICAgbWVtbyA9IHZhbHVlO1xuICAgICAgICBpbml0aWFsID0gdHJ1ZTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1lbW8gPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG1lbW8sIHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKCFpbml0aWFsKSB0aHJvdyBuZXcgVHlwZUVycm9yKHJlZHVjZUVycm9yKTtcbiAgICByZXR1cm4gbWVtbztcbiAgfTtcblxuICAvLyBUaGUgcmlnaHQtYXNzb2NpYXRpdmUgdmVyc2lvbiBvZiByZWR1Y2UsIGFsc28ga25vd24gYXMgYGZvbGRyYC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYHJlZHVjZVJpZ2h0YCBpZiBhdmFpbGFibGUuXG4gIF8ucmVkdWNlUmlnaHQgPSBfLmZvbGRyID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgbWVtbywgY29udGV4dCkge1xuICAgIHZhciBpbml0aWFsID0gYXJndW1lbnRzLmxlbmd0aCA+IDI7XG4gICAgaWYgKG9iaiA9PSBudWxsKSBvYmogPSBbXTtcbiAgICBpZiAobmF0aXZlUmVkdWNlUmlnaHQgJiYgb2JqLnJlZHVjZVJpZ2h0ID09PSBuYXRpdmVSZWR1Y2VSaWdodCkge1xuICAgICAgaWYgKGNvbnRleHQpIGl0ZXJhdG9yID0gXy5iaW5kKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICAgIHJldHVybiBpbml0aWFsID8gb2JqLnJlZHVjZVJpZ2h0KGl0ZXJhdG9yLCBtZW1vKSA6IG9iai5yZWR1Y2VSaWdodChpdGVyYXRvcik7XG4gICAgfVxuICAgIHZhciBsZW5ndGggPSBvYmoubGVuZ3RoO1xuICAgIGlmIChsZW5ndGggIT09ICtsZW5ndGgpIHtcbiAgICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB9XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaW5kZXggPSBrZXlzID8ga2V5c1stLWxlbmd0aF0gOiAtLWxlbmd0aDtcbiAgICAgIGlmICghaW5pdGlhbCkge1xuICAgICAgICBtZW1vID0gb2JqW2luZGV4XTtcbiAgICAgICAgaW5pdGlhbCA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtZW1vID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBtZW1vLCBvYmpbaW5kZXhdLCBpbmRleCwgbGlzdCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgaWYgKCFpbml0aWFsKSB0aHJvdyBuZXcgVHlwZUVycm9yKHJlZHVjZUVycm9yKTtcbiAgICByZXR1cm4gbWVtbztcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIGZpcnN0IHZhbHVlIHdoaWNoIHBhc3NlcyBhIHRydXRoIHRlc3QuIEFsaWFzZWQgYXMgYGRldGVjdGAuXG4gIF8uZmluZCA9IF8uZGV0ZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0O1xuICAgIGFueShvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKHByZWRpY2F0ZS5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkpIHtcbiAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgdGhhdCBwYXNzIGEgdHJ1dGggdGVzdC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGZpbHRlcmAgaWYgYXZhaWxhYmxlLlxuICAvLyBBbGlhc2VkIGFzIGBzZWxlY3RgLlxuICBfLmZpbHRlciA9IF8uc2VsZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdHM7XG4gICAgaWYgKG5hdGl2ZUZpbHRlciAmJiBvYmouZmlsdGVyID09PSBuYXRpdmVGaWx0ZXIpIHJldHVybiBvYmouZmlsdGVyKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKHByZWRpY2F0ZS5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkpIHJlc3VsdHMucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgZm9yIHdoaWNoIGEgdHJ1dGggdGVzdCBmYWlscy5cbiAgXy5yZWplY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgcmV0dXJuICFwcmVkaWNhdGUuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgIH0sIGNvbnRleHQpO1xuICB9O1xuXG4gIC8vIERldGVybWluZSB3aGV0aGVyIGFsbCBvZiB0aGUgZWxlbWVudHMgbWF0Y2ggYSB0cnV0aCB0ZXN0LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgZXZlcnlgIGlmIGF2YWlsYWJsZS5cbiAgLy8gQWxpYXNlZCBhcyBgYWxsYC5cbiAgXy5ldmVyeSA9IF8uYWxsID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgfHwgKHByZWRpY2F0ZSA9IF8uaWRlbnRpdHkpO1xuICAgIHZhciByZXN1bHQgPSB0cnVlO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmF0aXZlRXZlcnkgJiYgb2JqLmV2ZXJ5ID09PSBuYXRpdmVFdmVyeSkgcmV0dXJuIG9iai5ldmVyeShwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmICghKHJlc3VsdCA9IHJlc3VsdCAmJiBwcmVkaWNhdGUuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKSkgcmV0dXJuIGJyZWFrZXI7XG4gICAgfSk7XG4gICAgcmV0dXJuICEhcmVzdWx0O1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiBhdCBsZWFzdCBvbmUgZWxlbWVudCBpbiB0aGUgb2JqZWN0IG1hdGNoZXMgYSB0cnV0aCB0ZXN0LlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgc29tZWAgaWYgYXZhaWxhYmxlLlxuICAvLyBBbGlhc2VkIGFzIGBhbnlgLlxuICB2YXIgYW55ID0gXy5zb21lID0gXy5hbnkgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSB8fCAocHJlZGljYXRlID0gXy5pZGVudGl0eSk7XG4gICAgdmFyIHJlc3VsdCA9IGZhbHNlO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAobmF0aXZlU29tZSAmJiBvYmouc29tZSA9PT0gbmF0aXZlU29tZSkgcmV0dXJuIG9iai5zb21lKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKHJlc3VsdCB8fCAocmVzdWx0ID0gcHJlZGljYXRlLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkpIHJldHVybiBicmVha2VyO1xuICAgIH0pO1xuICAgIHJldHVybiAhIXJlc3VsdDtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgdGhlIGFycmF5IG9yIG9iamVjdCBjb250YWlucyBhIGdpdmVuIHZhbHVlICh1c2luZyBgPT09YCkuXG4gIC8vIEFsaWFzZWQgYXMgYGluY2x1ZGVgLlxuICBfLmNvbnRhaW5zID0gXy5pbmNsdWRlID0gZnVuY3Rpb24ob2JqLCB0YXJnZXQpIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiBmYWxzZTtcbiAgICBpZiAobmF0aXZlSW5kZXhPZiAmJiBvYmouaW5kZXhPZiA9PT0gbmF0aXZlSW5kZXhPZikgcmV0dXJuIG9iai5pbmRleE9mKHRhcmdldCkgIT0gLTE7XG4gICAgcmV0dXJuIGFueShvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICByZXR1cm4gdmFsdWUgPT09IHRhcmdldDtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBJbnZva2UgYSBtZXRob2QgKHdpdGggYXJndW1lbnRzKSBvbiBldmVyeSBpdGVtIGluIGEgY29sbGVjdGlvbi5cbiAgXy5pbnZva2UgPSBmdW5jdGlvbihvYmosIG1ldGhvZCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBpc0Z1bmMgPSBfLmlzRnVuY3Rpb24obWV0aG9kKTtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmV0dXJuIChpc0Z1bmMgPyBtZXRob2QgOiB2YWx1ZVttZXRob2RdKS5hcHBseSh2YWx1ZSwgYXJncyk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgbWFwYDogZmV0Y2hpbmcgYSBwcm9wZXJ0eS5cbiAgXy5wbHVjayA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgXy5wcm9wZXJ0eShrZXkpKTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaWx0ZXJgOiBzZWxlY3Rpbmcgb25seSBvYmplY3RzXG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ud2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgXy5tYXRjaGVzKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmluZGA6IGdldHRpbmcgdGhlIGZpcnN0IG9iamVjdFxuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmZpbmRXaGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy5maW5kKG9iaiwgXy5tYXRjaGVzKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtYXhpbXVtIGVsZW1lbnQgb3IgKGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICAvLyBDYW4ndCBvcHRpbWl6ZSBhcnJheXMgb2YgaW50ZWdlcnMgbG9uZ2VyIHRoYW4gNjUsNTM1IGVsZW1lbnRzLlxuICAvLyBTZWUgW1dlYktpdCBCdWcgODA3OTddKGh0dHBzOi8vYnVncy53ZWJraXQub3JnL3Nob3dfYnVnLmNnaT9pZD04MDc5NylcbiAgXy5tYXggPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKCFpdGVyYXRvciAmJiBfLmlzQXJyYXkob2JqKSAmJiBvYmpbMF0gPT09ICtvYmpbMF0gJiYgb2JqLmxlbmd0aCA8IDY1NTM1KSB7XG4gICAgICByZXR1cm4gTWF0aC5tYXguYXBwbHkoTWF0aCwgb2JqKTtcbiAgICB9XG4gICAgdmFyIHJlc3VsdCA9IC1JbmZpbml0eSwgbGFzdENvbXB1dGVkID0gLUluZmluaXR5O1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHZhciBjb21wdXRlZCA9IGl0ZXJhdG9yID8gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpIDogdmFsdWU7XG4gICAgICBpZiAoY29tcHV0ZWQgPiBsYXN0Q29tcHV0ZWQpIHtcbiAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIGxhc3RDb21wdXRlZCA9IGNvbXB1dGVkO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtaW5pbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1pbiA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICBpZiAoIWl0ZXJhdG9yICYmIF8uaXNBcnJheShvYmopICYmIG9ialswXSA9PT0gK29ialswXSAmJiBvYmoubGVuZ3RoIDwgNjU1MzUpIHtcbiAgICAgIHJldHVybiBNYXRoLm1pbi5hcHBseShNYXRoLCBvYmopO1xuICAgIH1cbiAgICB2YXIgcmVzdWx0ID0gSW5maW5pdHksIGxhc3RDb21wdXRlZCA9IEluZmluaXR5O1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHZhciBjb21wdXRlZCA9IGl0ZXJhdG9yID8gaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpIDogdmFsdWU7XG4gICAgICBpZiAoY29tcHV0ZWQgPCBsYXN0Q29tcHV0ZWQpIHtcbiAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIGxhc3RDb21wdXRlZCA9IGNvbXB1dGVkO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gU2h1ZmZsZSBhbiBhcnJheSwgdXNpbmcgdGhlIG1vZGVybiB2ZXJzaW9uIG9mIHRoZVxuICAvLyBbRmlzaGVyLVlhdGVzIHNodWZmbGVdKGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvRmlzaGVy4oCTWWF0ZXNfc2h1ZmZsZSkuXG4gIF8uc2h1ZmZsZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciByYW5kO1xuICAgIHZhciBpbmRleCA9IDA7XG4gICAgdmFyIHNodWZmbGVkID0gW107XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICByYW5kID0gXy5yYW5kb20oaW5kZXgrKyk7XG4gICAgICBzaHVmZmxlZFtpbmRleCAtIDFdID0gc2h1ZmZsZWRbcmFuZF07XG4gICAgICBzaHVmZmxlZFtyYW5kXSA9IHZhbHVlO1xuICAgIH0pO1xuICAgIHJldHVybiBzaHVmZmxlZDtcbiAgfTtcblxuICAvLyBTYW1wbGUgKipuKiogcmFuZG9tIHZhbHVlcyBmcm9tIGEgY29sbGVjdGlvbi5cbiAgLy8gSWYgKipuKiogaXMgbm90IHNwZWNpZmllZCwgcmV0dXJucyBhIHNpbmdsZSByYW5kb20gZWxlbWVudC5cbiAgLy8gVGhlIGludGVybmFsIGBndWFyZGAgYXJndW1lbnQgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgbWFwYC5cbiAgXy5zYW1wbGUgPSBmdW5jdGlvbihvYmosIG4sIGd1YXJkKSB7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkge1xuICAgICAgaWYgKG9iai5sZW5ndGggIT09ICtvYmoubGVuZ3RoKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgICAgcmV0dXJuIG9ialtfLnJhbmRvbShvYmoubGVuZ3RoIC0gMSldO1xuICAgIH1cbiAgICByZXR1cm4gXy5zaHVmZmxlKG9iaikuc2xpY2UoMCwgTWF0aC5tYXgoMCwgbikpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIHRvIGdlbmVyYXRlIGxvb2t1cCBpdGVyYXRvcnMuXG4gIHZhciBsb29rdXBJdGVyYXRvciA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHJldHVybiBfLmlkZW50aXR5O1xuICAgIGlmIChfLmlzRnVuY3Rpb24odmFsdWUpKSByZXR1cm4gdmFsdWU7XG4gICAgcmV0dXJuIF8ucHJvcGVydHkodmFsdWUpO1xuICB9O1xuXG4gIC8vIFNvcnQgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiBwcm9kdWNlZCBieSBhbiBpdGVyYXRvci5cbiAgXy5zb3J0QnkgPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0b3IgPSBsb29rdXBJdGVyYXRvcihpdGVyYXRvcik7XG4gICAgcmV0dXJuIF8ucGx1Y2soXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgaW5kZXg6IGluZGV4LFxuICAgICAgICBjcml0ZXJpYTogaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpXG4gICAgICB9O1xuICAgIH0pLnNvcnQoZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgIHZhciBhID0gbGVmdC5jcml0ZXJpYTtcbiAgICAgIHZhciBiID0gcmlnaHQuY3JpdGVyaWE7XG4gICAgICBpZiAoYSAhPT0gYikge1xuICAgICAgICBpZiAoYSA+IGIgfHwgYSA9PT0gdm9pZCAwKSByZXR1cm4gMTtcbiAgICAgICAgaWYgKGEgPCBiIHx8IGIgPT09IHZvaWQgMCkgcmV0dXJuIC0xO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxlZnQuaW5kZXggLSByaWdodC5pbmRleDtcbiAgICB9KSwgJ3ZhbHVlJyk7XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gdXNlZCBmb3IgYWdncmVnYXRlIFwiZ3JvdXAgYnlcIiBvcGVyYXRpb25zLlxuICB2YXIgZ3JvdXAgPSBmdW5jdGlvbihiZWhhdmlvcikge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgICBpdGVyYXRvciA9IGxvb2t1cEl0ZXJhdG9yKGl0ZXJhdG9yKTtcbiAgICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgICAgdmFyIGtleSA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBvYmopO1xuICAgICAgICBiZWhhdmlvcihyZXN1bHQsIGtleSwgdmFsdWUpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gR3JvdXBzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24uIFBhc3MgZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZVxuICAvLyB0byBncm91cCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIGNyaXRlcmlvbi5cbiAgXy5ncm91cEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCBrZXksIHZhbHVlKSB7XG4gICAgXy5oYXMocmVzdWx0LCBrZXkpID8gcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSkgOiByZXN1bHRba2V5XSA9IFt2YWx1ZV07XG4gIH0pO1xuXG4gIC8vIEluZGV4ZXMgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiwgc2ltaWxhciB0byBgZ3JvdXBCeWAsIGJ1dCBmb3JcbiAgLy8gd2hlbiB5b3Uga25vdyB0aGF0IHlvdXIgaW5kZXggdmFsdWVzIHdpbGwgYmUgdW5pcXVlLlxuICBfLmluZGV4QnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIGtleSwgdmFsdWUpIHtcbiAgICByZXN1bHRba2V5XSA9IHZhbHVlO1xuICB9KTtcblxuICAvLyBDb3VudHMgaW5zdGFuY2VzIG9mIGFuIG9iamVjdCB0aGF0IGdyb3VwIGJ5IGEgY2VydGFpbiBjcml0ZXJpb24uIFBhc3NcbiAgLy8gZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZSB0byBjb3VudCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlXG4gIC8vIGNyaXRlcmlvbi5cbiAgXy5jb3VudEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCBrZXkpIHtcbiAgICBfLmhhcyhyZXN1bHQsIGtleSkgPyByZXN1bHRba2V5XSsrIDogcmVzdWx0W2tleV0gPSAxO1xuICB9KTtcblxuICAvLyBVc2UgYSBjb21wYXJhdG9yIGZ1bmN0aW9uIHRvIGZpZ3VyZSBvdXQgdGhlIHNtYWxsZXN0IGluZGV4IGF0IHdoaWNoXG4gIC8vIGFuIG9iamVjdCBzaG91bGQgYmUgaW5zZXJ0ZWQgc28gYXMgdG8gbWFpbnRhaW4gb3JkZXIuIFVzZXMgYmluYXJ5IHNlYXJjaC5cbiAgXy5zb3J0ZWRJbmRleCA9IGZ1bmN0aW9uKGFycmF5LCBvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0b3IgPSBsb29rdXBJdGVyYXRvcihpdGVyYXRvcik7XG4gICAgdmFyIHZhbHVlID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmopO1xuICAgIHZhciBsb3cgPSAwLCBoaWdoID0gYXJyYXkubGVuZ3RoO1xuICAgIHdoaWxlIChsb3cgPCBoaWdoKSB7XG4gICAgICB2YXIgbWlkID0gKGxvdyArIGhpZ2gpID4+PiAxO1xuICAgICAgaXRlcmF0b3IuY2FsbChjb250ZXh0LCBhcnJheVttaWRdKSA8IHZhbHVlID8gbG93ID0gbWlkICsgMSA6IGhpZ2ggPSBtaWQ7XG4gICAgfVxuICAgIHJldHVybiBsb3c7XG4gIH07XG5cbiAgLy8gU2FmZWx5IGNyZWF0ZSBhIHJlYWwsIGxpdmUgYXJyYXkgZnJvbSBhbnl0aGluZyBpdGVyYWJsZS5cbiAgXy50b0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFvYmopIHJldHVybiBbXTtcbiAgICBpZiAoXy5pc0FycmF5KG9iaikpIHJldHVybiBzbGljZS5jYWxsKG9iaik7XG4gICAgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSByZXR1cm4gXy5tYXAob2JqLCBfLmlkZW50aXR5KTtcbiAgICByZXR1cm4gXy52YWx1ZXMob2JqKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG51bWJlciBvZiBlbGVtZW50cyBpbiBhbiBvYmplY3QuXG4gIF8uc2l6ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIDA7XG4gICAgcmV0dXJuIChvYmoubGVuZ3RoID09PSArb2JqLmxlbmd0aCkgPyBvYmoubGVuZ3RoIDogXy5rZXlzKG9iaikubGVuZ3RoO1xuICB9O1xuXG4gIC8vIEFycmF5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAvLyBHZXQgdGhlIGZpcnN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGZpcnN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgaGVhZGAgYW5kIGB0YWtlYC4gVGhlICoqZ3VhcmQqKiBjaGVja1xuICAvLyBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8uZmlyc3QgPSBfLmhlYWQgPSBfLnRha2UgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAoKG4gPT0gbnVsbCkgfHwgZ3VhcmQpIHJldHVybiBhcnJheVswXTtcbiAgICBpZiAobiA8IDApIHJldHVybiBbXTtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgMCwgbik7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgbGFzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEVzcGVjaWFsbHkgdXNlZnVsIG9uXG4gIC8vIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIGFsbCB0aGUgdmFsdWVzIGluXG4gIC8vIHRoZSBhcnJheSwgZXhjbHVkaW5nIHRoZSBsYXN0IE4uIFRoZSAqKmd1YXJkKiogY2hlY2sgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aFxuICAvLyBgXy5tYXBgLlxuICBfLmluaXRpYWwgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgMCwgYXJyYXkubGVuZ3RoIC0gKChuID09IG51bGwpIHx8IGd1YXJkID8gMSA6IG4pKTtcbiAgfTtcblxuICAvLyBHZXQgdGhlIGxhc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgbGFzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuIFRoZSAqKmd1YXJkKiogY2hlY2sgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLmxhc3QgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAoKG4gPT0gbnVsbCkgfHwgZ3VhcmQpIHJldHVybiBhcnJheVthcnJheS5sZW5ndGggLSAxXTtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgTWF0aC5tYXgoYXJyYXkubGVuZ3RoIC0gbiwgMCkpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGZpcnN0IGVudHJ5IG9mIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgdGFpbGAgYW5kIGBkcm9wYC5cbiAgLy8gRXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgYW4gKipuKiogd2lsbCByZXR1cm5cbiAgLy8gdGhlIHJlc3QgTiB2YWx1ZXMgaW4gdGhlIGFycmF5LiBUaGUgKipndWFyZCoqXG4gIC8vIGNoZWNrIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5yZXN0ID0gXy50YWlsID0gXy5kcm9wID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIChuID09IG51bGwpIHx8IGd1YXJkID8gMSA6IG4pO1xuICB9O1xuXG4gIC8vIFRyaW0gb3V0IGFsbCBmYWxzeSB2YWx1ZXMgZnJvbSBhbiBhcnJheS5cbiAgXy5jb21wYWN0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIF8uaWRlbnRpdHkpO1xuICB9O1xuXG4gIC8vIEludGVybmFsIGltcGxlbWVudGF0aW9uIG9mIGEgcmVjdXJzaXZlIGBmbGF0dGVuYCBmdW5jdGlvbi5cbiAgdmFyIGZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgc2hhbGxvdywgb3V0cHV0KSB7XG4gICAgaWYgKHNoYWxsb3cgJiYgXy5ldmVyeShpbnB1dCwgXy5pc0FycmF5KSkge1xuICAgICAgcmV0dXJuIGNvbmNhdC5hcHBseShvdXRwdXQsIGlucHV0KTtcbiAgICB9XG4gICAgZWFjaChpbnB1dCwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIGlmIChfLmlzQXJyYXkodmFsdWUpIHx8IF8uaXNBcmd1bWVudHModmFsdWUpKSB7XG4gICAgICAgIHNoYWxsb3cgPyBwdXNoLmFwcGx5KG91dHB1dCwgdmFsdWUpIDogZmxhdHRlbih2YWx1ZSwgc2hhbGxvdywgb3V0cHV0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG91dHB1dC5wdXNoKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gb3V0cHV0O1xuICB9O1xuXG4gIC8vIEZsYXR0ZW4gb3V0IGFuIGFycmF5LCBlaXRoZXIgcmVjdXJzaXZlbHkgKGJ5IGRlZmF1bHQpLCBvciBqdXN0IG9uZSBsZXZlbC5cbiAgXy5mbGF0dGVuID0gZnVuY3Rpb24oYXJyYXksIHNoYWxsb3cpIHtcbiAgICByZXR1cm4gZmxhdHRlbihhcnJheSwgc2hhbGxvdywgW10pO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHZlcnNpb24gb2YgdGhlIGFycmF5IHRoYXQgZG9lcyBub3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIHZhbHVlKHMpLlxuICBfLndpdGhvdXQgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmRpZmZlcmVuY2UoYXJyYXksIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gIH07XG5cbiAgLy8gU3BsaXQgYW4gYXJyYXkgaW50byB0d28gYXJyYXlzOiBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIHNhdGlzZnkgdGhlIGdpdmVuXG4gIC8vIHByZWRpY2F0ZSwgYW5kIG9uZSB3aG9zZSBlbGVtZW50cyBhbGwgZG8gbm90IHNhdGlzZnkgdGhlIHByZWRpY2F0ZS5cbiAgXy5wYXJ0aXRpb24gPSBmdW5jdGlvbihhcnJheSwgcHJlZGljYXRlKSB7XG4gICAgdmFyIHBhc3MgPSBbXSwgZmFpbCA9IFtdO1xuICAgIGVhY2goYXJyYXksIGZ1bmN0aW9uKGVsZW0pIHtcbiAgICAgIChwcmVkaWNhdGUoZWxlbSkgPyBwYXNzIDogZmFpbCkucHVzaChlbGVtKTtcbiAgICB9KTtcbiAgICByZXR1cm4gW3Bhc3MsIGZhaWxdO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYSBkdXBsaWNhdGUtZnJlZSB2ZXJzaW9uIG9mIHRoZSBhcnJheS4gSWYgdGhlIGFycmF5IGhhcyBhbHJlYWR5XG4gIC8vIGJlZW4gc29ydGVkLCB5b3UgaGF2ZSB0aGUgb3B0aW9uIG9mIHVzaW5nIGEgZmFzdGVyIGFsZ29yaXRobS5cbiAgLy8gQWxpYXNlZCBhcyBgdW5pcXVlYC5cbiAgXy51bmlxID0gXy51bmlxdWUgPSBmdW5jdGlvbihhcnJheSwgaXNTb3J0ZWQsIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihpc1NvcnRlZCkpIHtcbiAgICAgIGNvbnRleHQgPSBpdGVyYXRvcjtcbiAgICAgIGl0ZXJhdG9yID0gaXNTb3J0ZWQ7XG4gICAgICBpc1NvcnRlZCA9IGZhbHNlO1xuICAgIH1cbiAgICB2YXIgaW5pdGlhbCA9IGl0ZXJhdG9yID8gXy5tYXAoYXJyYXksIGl0ZXJhdG9yLCBjb250ZXh0KSA6IGFycmF5O1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgdmFyIHNlZW4gPSBbXTtcbiAgICBlYWNoKGluaXRpYWwsIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCkge1xuICAgICAgaWYgKGlzU29ydGVkID8gKCFpbmRleCB8fCBzZWVuW3NlZW4ubGVuZ3RoIC0gMV0gIT09IHZhbHVlKSA6ICFfLmNvbnRhaW5zKHNlZW4sIHZhbHVlKSkge1xuICAgICAgICBzZWVuLnB1c2godmFsdWUpO1xuICAgICAgICByZXN1bHRzLnB1c2goYXJyYXlbaW5kZXhdKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgdGhlIHVuaW9uOiBlYWNoIGRpc3RpbmN0IGVsZW1lbnQgZnJvbSBhbGwgb2ZcbiAgLy8gdGhlIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8udW5pb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bmlxKF8uZmxhdHRlbihhcmd1bWVudHMsIHRydWUpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgZXZlcnkgaXRlbSBzaGFyZWQgYmV0d2VlbiBhbGwgdGhlXG4gIC8vIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8uaW50ZXJzZWN0aW9uID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdCA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICByZXR1cm4gXy5maWx0ZXIoXy51bmlxKGFycmF5KSwgZnVuY3Rpb24oaXRlbSkge1xuICAgICAgcmV0dXJuIF8uZXZlcnkocmVzdCwgZnVuY3Rpb24ob3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIF8uY29udGFpbnMob3RoZXIsIGl0ZW0pO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gVGFrZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIG9uZSBhcnJheSBhbmQgYSBudW1iZXIgb2Ygb3RoZXIgYXJyYXlzLlxuICAvLyBPbmx5IHRoZSBlbGVtZW50cyBwcmVzZW50IGluIGp1c3QgdGhlIGZpcnN0IGFycmF5IHdpbGwgcmVtYWluLlxuICBfLmRpZmZlcmVuY2UgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN0ID0gY29uY2F0LmFwcGx5KEFycmF5UHJvdG8sIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgcmV0dXJuIF8uZmlsdGVyKGFycmF5LCBmdW5jdGlvbih2YWx1ZSl7IHJldHVybiAhXy5jb250YWlucyhyZXN0LCB2YWx1ZSk7IH0pO1xuICB9O1xuXG4gIC8vIFppcCB0b2dldGhlciBtdWx0aXBsZSBsaXN0cyBpbnRvIGEgc2luZ2xlIGFycmF5IC0tIGVsZW1lbnRzIHRoYXQgc2hhcmVcbiAgLy8gYW4gaW5kZXggZ28gdG9nZXRoZXIuXG4gIF8uemlwID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGxlbmd0aCA9IF8ubWF4KF8ucGx1Y2soYXJndW1lbnRzLCAnbGVuZ3RoJykuY29uY2F0KDApKTtcbiAgICB2YXIgcmVzdWx0cyA9IG5ldyBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHJlc3VsdHNbaV0gPSBfLnBsdWNrKGFyZ3VtZW50cywgJycgKyBpKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ29udmVydHMgbGlzdHMgaW50byBvYmplY3RzLiBQYXNzIGVpdGhlciBhIHNpbmdsZSBhcnJheSBvZiBgW2tleSwgdmFsdWVdYFxuICAvLyBwYWlycywgb3IgdHdvIHBhcmFsbGVsIGFycmF5cyBvZiB0aGUgc2FtZSBsZW5ndGggLS0gb25lIG9mIGtleXMsIGFuZCBvbmUgb2ZcbiAgLy8gdGhlIGNvcnJlc3BvbmRpbmcgdmFsdWVzLlxuICBfLm9iamVjdCA9IGZ1bmN0aW9uKGxpc3QsIHZhbHVlcykge1xuICAgIGlmIChsaXN0ID09IG51bGwpIHJldHVybiB7fTtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGxpc3QubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICh2YWx1ZXMpIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1dID0gdmFsdWVzW2ldO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1bMF1dID0gbGlzdFtpXVsxXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBJZiB0aGUgYnJvd3NlciBkb2Vzbid0IHN1cHBseSB1cyB3aXRoIGluZGV4T2YgKEknbSBsb29raW5nIGF0IHlvdSwgKipNU0lFKiopLFxuICAvLyB3ZSBuZWVkIHRoaXMgZnVuY3Rpb24uIFJldHVybiB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYW5cbiAgLy8gaXRlbSBpbiBhbiBhcnJheSwgb3IgLTEgaWYgdGhlIGl0ZW0gaXMgbm90IGluY2x1ZGVkIGluIHRoZSBhcnJheS5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGluZGV4T2ZgIGlmIGF2YWlsYWJsZS5cbiAgLy8gSWYgdGhlIGFycmF5IGlzIGxhcmdlIGFuZCBhbHJlYWR5IGluIHNvcnQgb3JkZXIsIHBhc3MgYHRydWVgXG4gIC8vIGZvciAqKmlzU29ydGVkKiogdG8gdXNlIGJpbmFyeSBzZWFyY2guXG4gIF8uaW5kZXhPZiA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBpc1NvcnRlZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gLTE7XG4gICAgdmFyIGkgPSAwLCBsZW5ndGggPSBhcnJheS5sZW5ndGg7XG4gICAgaWYgKGlzU29ydGVkKSB7XG4gICAgICBpZiAodHlwZW9mIGlzU29ydGVkID09ICdudW1iZXInKSB7XG4gICAgICAgIGkgPSAoaXNTb3J0ZWQgPCAwID8gTWF0aC5tYXgoMCwgbGVuZ3RoICsgaXNTb3J0ZWQpIDogaXNTb3J0ZWQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaSA9IF8uc29ydGVkSW5kZXgoYXJyYXksIGl0ZW0pO1xuICAgICAgICByZXR1cm4gYXJyYXlbaV0gPT09IGl0ZW0gPyBpIDogLTE7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChuYXRpdmVJbmRleE9mICYmIGFycmF5LmluZGV4T2YgPT09IG5hdGl2ZUluZGV4T2YpIHJldHVybiBhcnJheS5pbmRleE9mKGl0ZW0sIGlzU29ydGVkKTtcbiAgICBmb3IgKDsgaSA8IGxlbmd0aDsgaSsrKSBpZiAoYXJyYXlbaV0gPT09IGl0ZW0pIHJldHVybiBpO1xuICAgIHJldHVybiAtMTtcbiAgfTtcblxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgbGFzdEluZGV4T2ZgIGlmIGF2YWlsYWJsZS5cbiAgXy5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBmcm9tKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiAtMTtcbiAgICB2YXIgaGFzSW5kZXggPSBmcm9tICE9IG51bGw7XG4gICAgaWYgKG5hdGl2ZUxhc3RJbmRleE9mICYmIGFycmF5Lmxhc3RJbmRleE9mID09PSBuYXRpdmVMYXN0SW5kZXhPZikge1xuICAgICAgcmV0dXJuIGhhc0luZGV4ID8gYXJyYXkubGFzdEluZGV4T2YoaXRlbSwgZnJvbSkgOiBhcnJheS5sYXN0SW5kZXhPZihpdGVtKTtcbiAgICB9XG4gICAgdmFyIGkgPSAoaGFzSW5kZXggPyBmcm9tIDogYXJyYXkubGVuZ3RoKTtcbiAgICB3aGlsZSAoaS0tKSBpZiAoYXJyYXlbaV0gPT09IGl0ZW0pIHJldHVybiBpO1xuICAgIHJldHVybiAtMTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZSBhbiBpbnRlZ2VyIEFycmF5IGNvbnRhaW5pbmcgYW4gYXJpdGhtZXRpYyBwcm9ncmVzc2lvbi4gQSBwb3J0IG9mXG4gIC8vIHRoZSBuYXRpdmUgUHl0aG9uIGByYW5nZSgpYCBmdW5jdGlvbi4gU2VlXG4gIC8vIFt0aGUgUHl0aG9uIGRvY3VtZW50YXRpb25dKGh0dHA6Ly9kb2NzLnB5dGhvbi5vcmcvbGlicmFyeS9mdW5jdGlvbnMuaHRtbCNyYW5nZSkuXG4gIF8ucmFuZ2UgPSBmdW5jdGlvbihzdGFydCwgc3RvcCwgc3RlcCkge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDw9IDEpIHtcbiAgICAgIHN0b3AgPSBzdGFydCB8fCAwO1xuICAgICAgc3RhcnQgPSAwO1xuICAgIH1cbiAgICBzdGVwID0gYXJndW1lbnRzWzJdIHx8IDE7XG5cbiAgICB2YXIgbGVuZ3RoID0gTWF0aC5tYXgoTWF0aC5jZWlsKChzdG9wIC0gc3RhcnQpIC8gc3RlcCksIDApO1xuICAgIHZhciBpZHggPSAwO1xuICAgIHZhciByYW5nZSA9IG5ldyBBcnJheShsZW5ndGgpO1xuXG4gICAgd2hpbGUoaWR4IDwgbGVuZ3RoKSB7XG4gICAgICByYW5nZVtpZHgrK10gPSBzdGFydDtcbiAgICAgIHN0YXJ0ICs9IHN0ZXA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJhbmdlO1xuICB9O1xuXG4gIC8vIEZ1bmN0aW9uIChhaGVtKSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gUmV1c2FibGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHByb3RvdHlwZSBzZXR0aW5nLlxuICB2YXIgY3RvciA9IGZ1bmN0aW9uKCl7fTtcblxuICAvLyBDcmVhdGUgYSBmdW5jdGlvbiBib3VuZCB0byBhIGdpdmVuIG9iamVjdCAoYXNzaWduaW5nIGB0aGlzYCwgYW5kIGFyZ3VtZW50cyxcbiAgLy8gb3B0aW9uYWxseSkuIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBGdW5jdGlvbi5iaW5kYCBpZlxuICAvLyBhdmFpbGFibGUuXG4gIF8uYmluZCA9IGZ1bmN0aW9uKGZ1bmMsIGNvbnRleHQpIHtcbiAgICB2YXIgYXJncywgYm91bmQ7XG4gICAgaWYgKG5hdGl2ZUJpbmQgJiYgZnVuYy5iaW5kID09PSBuYXRpdmVCaW5kKSByZXR1cm4gbmF0aXZlQmluZC5hcHBseShmdW5jLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIGlmICghXy5pc0Z1bmN0aW9uKGZ1bmMpKSB0aHJvdyBuZXcgVHlwZUVycm9yO1xuICAgIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgcmV0dXJuIGJvdW5kID0gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgYm91bmQpKSByZXR1cm4gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzLmNvbmNhdChzbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbiAgICAgIGN0b3IucHJvdG90eXBlID0gZnVuYy5wcm90b3R5cGU7XG4gICAgICB2YXIgc2VsZiA9IG5ldyBjdG9yO1xuICAgICAgY3Rvci5wcm90b3R5cGUgPSBudWxsO1xuICAgICAgdmFyIHJlc3VsdCA9IGZ1bmMuYXBwbHkoc2VsZiwgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgICBpZiAoT2JqZWN0KHJlc3VsdCkgPT09IHJlc3VsdCkgcmV0dXJuIHJlc3VsdDtcbiAgICAgIHJldHVybiBzZWxmO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUGFydGlhbGx5IGFwcGx5IGEgZnVuY3Rpb24gYnkgY3JlYXRpbmcgYSB2ZXJzaW9uIHRoYXQgaGFzIGhhZCBzb21lIG9mIGl0c1xuICAvLyBhcmd1bWVudHMgcHJlLWZpbGxlZCwgd2l0aG91dCBjaGFuZ2luZyBpdHMgZHluYW1pYyBgdGhpc2AgY29udGV4dC4gXyBhY3RzXG4gIC8vIGFzIGEgcGxhY2Vob2xkZXIsIGFsbG93aW5nIGFueSBjb21iaW5hdGlvbiBvZiBhcmd1bWVudHMgdG8gYmUgcHJlLWZpbGxlZC5cbiAgXy5wYXJ0aWFsID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciBib3VuZEFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHBvc2l0aW9uID0gMDtcbiAgICAgIHZhciBhcmdzID0gYm91bmRBcmdzLnNsaWNlKCk7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gYXJncy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoYXJnc1tpXSA9PT0gXykgYXJnc1tpXSA9IGFyZ3VtZW50c1twb3NpdGlvbisrXTtcbiAgICAgIH1cbiAgICAgIHdoaWxlIChwb3NpdGlvbiA8IGFyZ3VtZW50cy5sZW5ndGgpIGFyZ3MucHVzaChhcmd1bWVudHNbcG9zaXRpb24rK10pO1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBCaW5kIGEgbnVtYmVyIG9mIGFuIG9iamVjdCdzIG1ldGhvZHMgdG8gdGhhdCBvYmplY3QuIFJlbWFpbmluZyBhcmd1bWVudHNcbiAgLy8gYXJlIHRoZSBtZXRob2QgbmFtZXMgdG8gYmUgYm91bmQuIFVzZWZ1bCBmb3IgZW5zdXJpbmcgdGhhdCBhbGwgY2FsbGJhY2tzXG4gIC8vIGRlZmluZWQgb24gYW4gb2JqZWN0IGJlbG9uZyB0byBpdC5cbiAgXy5iaW5kQWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGZ1bmNzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIGlmIChmdW5jcy5sZW5ndGggPT09IDApIHRocm93IG5ldyBFcnJvcignYmluZEFsbCBtdXN0IGJlIHBhc3NlZCBmdW5jdGlvbiBuYW1lcycpO1xuICAgIGVhY2goZnVuY3MsIGZ1bmN0aW9uKGYpIHsgb2JqW2ZdID0gXy5iaW5kKG9ialtmXSwgb2JqKTsgfSk7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBNZW1vaXplIGFuIGV4cGVuc2l2ZSBmdW5jdGlvbiBieSBzdG9yaW5nIGl0cyByZXN1bHRzLlxuICBfLm1lbW9pemUgPSBmdW5jdGlvbihmdW5jLCBoYXNoZXIpIHtcbiAgICB2YXIgbWVtbyA9IHt9O1xuICAgIGhhc2hlciB8fCAoaGFzaGVyID0gXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGtleSA9IGhhc2hlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIF8uaGFzKG1lbW8sIGtleSkgPyBtZW1vW2tleV0gOiAobWVtb1trZXldID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIERlbGF5cyBhIGZ1bmN0aW9uIGZvciB0aGUgZ2l2ZW4gbnVtYmVyIG9mIG1pbGxpc2Vjb25kcywgYW5kIHRoZW4gY2FsbHNcbiAgLy8gaXQgd2l0aCB0aGUgYXJndW1lbnRzIHN1cHBsaWVkLlxuICBfLmRlbGF5ID0gZnVuY3Rpb24oZnVuYywgd2FpdCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7IHJldHVybiBmdW5jLmFwcGx5KG51bGwsIGFyZ3MpOyB9LCB3YWl0KTtcbiAgfTtcblxuICAvLyBEZWZlcnMgYSBmdW5jdGlvbiwgc2NoZWR1bGluZyBpdCB0byBydW4gYWZ0ZXIgdGhlIGN1cnJlbnQgY2FsbCBzdGFjayBoYXNcbiAgLy8gY2xlYXJlZC5cbiAgXy5kZWZlciA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICByZXR1cm4gXy5kZWxheS5hcHBseShfLCBbZnVuYywgMV0uY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSkpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgd2hlbiBpbnZva2VkLCB3aWxsIG9ubHkgYmUgdHJpZ2dlcmVkIGF0IG1vc3Qgb25jZVxuICAvLyBkdXJpbmcgYSBnaXZlbiB3aW5kb3cgb2YgdGltZS4gTm9ybWFsbHksIHRoZSB0aHJvdHRsZWQgZnVuY3Rpb24gd2lsbCBydW5cbiAgLy8gYXMgbXVjaCBhcyBpdCBjYW4sIHdpdGhvdXQgZXZlciBnb2luZyBtb3JlIHRoYW4gb25jZSBwZXIgYHdhaXRgIGR1cmF0aW9uO1xuICAvLyBidXQgaWYgeW91J2QgbGlrZSB0byBkaXNhYmxlIHRoZSBleGVjdXRpb24gb24gdGhlIGxlYWRpbmcgZWRnZSwgcGFzc1xuICAvLyBge2xlYWRpbmc6IGZhbHNlfWAuIFRvIGRpc2FibGUgZXhlY3V0aW9uIG9uIHRoZSB0cmFpbGluZyBlZGdlLCBkaXR0by5cbiAgXy50aHJvdHRsZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcbiAgICB2YXIgY29udGV4dCwgYXJncywgcmVzdWx0O1xuICAgIHZhciB0aW1lb3V0ID0gbnVsbDtcbiAgICB2YXIgcHJldmlvdXMgPSAwO1xuICAgIG9wdGlvbnMgfHwgKG9wdGlvbnMgPSB7fSk7XG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICBwcmV2aW91cyA9IG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UgPyAwIDogXy5ub3coKTtcbiAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICB9O1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBub3cgPSBfLm5vdygpO1xuICAgICAgaWYgKCFwcmV2aW91cyAmJiBvcHRpb25zLmxlYWRpbmcgPT09IGZhbHNlKSBwcmV2aW91cyA9IG5vdztcbiAgICAgIHZhciByZW1haW5pbmcgPSB3YWl0IC0gKG5vdyAtIHByZXZpb3VzKTtcbiAgICAgIGNvbnRleHQgPSB0aGlzO1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIGlmIChyZW1haW5pbmcgPD0gMCkge1xuICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICBwcmV2aW91cyA9IG5vdztcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgfSBlbHNlIGlmICghdGltZW91dCAmJiBvcHRpb25zLnRyYWlsaW5nICE9PSBmYWxzZSkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIGFzIGxvbmcgYXMgaXQgY29udGludWVzIHRvIGJlIGludm9rZWQsIHdpbGwgbm90XG4gIC8vIGJlIHRyaWdnZXJlZC4gVGhlIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGFmdGVyIGl0IHN0b3BzIGJlaW5nIGNhbGxlZCBmb3JcbiAgLy8gTiBtaWxsaXNlY29uZHMuIElmIGBpbW1lZGlhdGVgIGlzIHBhc3NlZCwgdHJpZ2dlciB0aGUgZnVuY3Rpb24gb24gdGhlXG4gIC8vIGxlYWRpbmcgZWRnZSwgaW5zdGVhZCBvZiB0aGUgdHJhaWxpbmcuXG4gIF8uZGVib3VuY2UgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBpbW1lZGlhdGUpIHtcbiAgICB2YXIgdGltZW91dCwgYXJncywgY29udGV4dCwgdGltZXN0YW1wLCByZXN1bHQ7XG5cbiAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBsYXN0ID0gXy5ub3coKSAtIHRpbWVzdGFtcDtcbiAgICAgIGlmIChsYXN0IDwgd2FpdCkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCAtIGxhc3QpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIGlmICghaW1tZWRpYXRlKSB7XG4gICAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgICBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgdGltZXN0YW1wID0gXy5ub3coKTtcbiAgICAgIHZhciBjYWxsTm93ID0gaW1tZWRpYXRlICYmICF0aW1lb3V0O1xuICAgICAgaWYgKCF0aW1lb3V0KSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0KTtcbiAgICAgIH1cbiAgICAgIGlmIChjYWxsTm93KSB7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgZXhlY3V0ZWQgYXQgbW9zdCBvbmUgdGltZSwgbm8gbWF0dGVyIGhvd1xuICAvLyBvZnRlbiB5b3UgY2FsbCBpdC4gVXNlZnVsIGZvciBsYXp5IGluaXRpYWxpemF0aW9uLlxuICBfLm9uY2UgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgdmFyIHJhbiA9IGZhbHNlLCBtZW1vO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmIChyYW4pIHJldHVybiBtZW1vO1xuICAgICAgcmFuID0gdHJ1ZTtcbiAgICAgIG1lbW8gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICBmdW5jID0gbnVsbDtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgZnVuY3Rpb24gcGFzc2VkIGFzIGFuIGFyZ3VtZW50IHRvIHRoZSBzZWNvbmQsXG4gIC8vIGFsbG93aW5nIHlvdSB0byBhZGp1c3QgYXJndW1lbnRzLCBydW4gY29kZSBiZWZvcmUgYW5kIGFmdGVyLCBhbmRcbiAgLy8gY29uZGl0aW9uYWxseSBleGVjdXRlIHRoZSBvcmlnaW5hbCBmdW5jdGlvbi5cbiAgXy53cmFwID0gZnVuY3Rpb24oZnVuYywgd3JhcHBlcikge1xuICAgIHJldHVybiBfLnBhcnRpYWwod3JhcHBlciwgZnVuYyk7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgaXMgdGhlIGNvbXBvc2l0aW9uIG9mIGEgbGlzdCBvZiBmdW5jdGlvbnMsIGVhY2hcbiAgLy8gY29uc3VtaW5nIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZ1bmN0aW9uIHRoYXQgZm9sbG93cy5cbiAgXy5jb21wb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGZ1bmNzID0gYXJndW1lbnRzO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgZm9yICh2YXIgaSA9IGZ1bmNzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIGFyZ3MgPSBbZnVuY3NbaV0uYXBwbHkodGhpcywgYXJncyldO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGFyZ3NbMF07XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgYWZ0ZXIgYmVpbmcgY2FsbGVkIE4gdGltZXMuXG4gIF8uYWZ0ZXIgPSBmdW5jdGlvbih0aW1lcywgZnVuYykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLXRpbWVzIDwgMSkge1xuICAgICAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgLy8gT2JqZWN0IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gUmV0cmlldmUgdGhlIG5hbWVzIG9mIGFuIG9iamVjdCdzIHByb3BlcnRpZXMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBPYmplY3Qua2V5c2BcbiAgXy5rZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBbXTtcbiAgICBpZiAobmF0aXZlS2V5cykgcmV0dXJuIG5hdGl2ZUtleXMob2JqKTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIHRoZSB2YWx1ZXMgb2YgYW4gb2JqZWN0J3MgcHJvcGVydGllcy5cbiAgXy52YWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB2YXIgdmFsdWVzID0gbmV3IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFsdWVzW2ldID0gb2JqW2tleXNbaV1dO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWVzO1xuICB9O1xuXG4gIC8vIENvbnZlcnQgYW4gb2JqZWN0IGludG8gYSBsaXN0IG9mIGBba2V5LCB2YWx1ZV1gIHBhaXJzLlxuICBfLnBhaXJzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgdmFyIHBhaXJzID0gbmV3IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcGFpcnNbaV0gPSBba2V5c1tpXSwgb2JqW2tleXNbaV1dXTtcbiAgICB9XG4gICAgcmV0dXJuIHBhaXJzO1xuICB9O1xuXG4gIC8vIEludmVydCB0aGUga2V5cyBhbmQgdmFsdWVzIG9mIGFuIG9iamVjdC4gVGhlIHZhbHVlcyBtdXN0IGJlIHNlcmlhbGl6YWJsZS5cbiAgXy5pbnZlcnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcmVzdWx0W29ialtrZXlzW2ldXV0gPSBrZXlzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHNvcnRlZCBsaXN0IG9mIHRoZSBmdW5jdGlvbiBuYW1lcyBhdmFpbGFibGUgb24gdGhlIG9iamVjdC5cbiAgLy8gQWxpYXNlZCBhcyBgbWV0aG9kc2BcbiAgXy5mdW5jdGlvbnMgPSBfLm1ldGhvZHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgbmFtZXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoXy5pc0Z1bmN0aW9uKG9ialtrZXldKSkgbmFtZXMucHVzaChrZXkpO1xuICAgIH1cbiAgICByZXR1cm4gbmFtZXMuc29ydCgpO1xuICB9O1xuXG4gIC8vIEV4dGVuZCBhIGdpdmVuIG9iamVjdCB3aXRoIGFsbCB0aGUgcHJvcGVydGllcyBpbiBwYXNzZWQtaW4gb2JqZWN0KHMpLlxuICBfLmV4dGVuZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLCBmdW5jdGlvbihzb3VyY2UpIHtcbiAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICBvYmpbcHJvcF0gPSBzb3VyY2VbcHJvcF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCBvbmx5IGNvbnRhaW5pbmcgdGhlIHdoaXRlbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ucGljayA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBjb3B5ID0ge307XG4gICAgdmFyIGtleXMgPSBjb25jYXQuYXBwbHkoQXJyYXlQcm90bywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICBlYWNoKGtleXMsIGZ1bmN0aW9uKGtleSkge1xuICAgICAgaWYgKGtleSBpbiBvYmopIGNvcHlba2V5XSA9IG9ialtrZXldO1xuICAgIH0pO1xuICAgIHJldHVybiBjb3B5O1xuICB9O1xuXG4gICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgd2l0aG91dCB0aGUgYmxhY2tsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5vbWl0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGNvcHkgPSB7fTtcbiAgICB2YXIga2V5cyA9IGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmICghXy5jb250YWlucyhrZXlzLCBrZXkpKSBjb3B5W2tleV0gPSBvYmpba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGNvcHk7XG4gIH07XG5cbiAgLy8gRmlsbCBpbiBhIGdpdmVuIG9iamVjdCB3aXRoIGRlZmF1bHQgcHJvcGVydGllcy5cbiAgXy5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpLCBmdW5jdGlvbihzb3VyY2UpIHtcbiAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICBpZiAob2JqW3Byb3BdID09PSB2b2lkIDApIG9ialtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgKHNoYWxsb3ctY2xvbmVkKSBkdXBsaWNhdGUgb2YgYW4gb2JqZWN0LlxuICBfLmNsb25lID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBvYmo7XG4gICAgcmV0dXJuIF8uaXNBcnJheShvYmopID8gb2JqLnNsaWNlKCkgOiBfLmV4dGVuZCh7fSwgb2JqKTtcbiAgfTtcblxuICAvLyBJbnZva2VzIGludGVyY2VwdG9yIHdpdGggdGhlIG9iaiwgYW5kIHRoZW4gcmV0dXJucyBvYmouXG4gIC8vIFRoZSBwcmltYXJ5IHB1cnBvc2Ugb2YgdGhpcyBtZXRob2QgaXMgdG8gXCJ0YXAgaW50b1wiIGEgbWV0aG9kIGNoYWluLCBpblxuICAvLyBvcmRlciB0byBwZXJmb3JtIG9wZXJhdGlvbnMgb24gaW50ZXJtZWRpYXRlIHJlc3VsdHMgd2l0aGluIHRoZSBjaGFpbi5cbiAgXy50YXAgPSBmdW5jdGlvbihvYmosIGludGVyY2VwdG9yKSB7XG4gICAgaW50ZXJjZXB0b3Iob2JqKTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIEludGVybmFsIHJlY3Vyc2l2ZSBjb21wYXJpc29uIGZ1bmN0aW9uIGZvciBgaXNFcXVhbGAuXG4gIHZhciBlcSA9IGZ1bmN0aW9uKGEsIGIsIGFTdGFjaywgYlN0YWNrKSB7XG4gICAgLy8gSWRlbnRpY2FsIG9iamVjdHMgYXJlIGVxdWFsLiBgMCA9PT0gLTBgLCBidXQgdGhleSBhcmVuJ3QgaWRlbnRpY2FsLlxuICAgIC8vIFNlZSB0aGUgW0hhcm1vbnkgYGVnYWxgIHByb3Bvc2FsXShodHRwOi8vd2lraS5lY21hc2NyaXB0Lm9yZy9kb2t1LnBocD9pZD1oYXJtb255OmVnYWwpLlxuICAgIGlmIChhID09PSBiKSByZXR1cm4gYSAhPT0gMCB8fCAxIC8gYSA9PSAxIC8gYjtcbiAgICAvLyBBIHN0cmljdCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIGBudWxsID09IHVuZGVmaW5lZGAuXG4gICAgaWYgKGEgPT0gbnVsbCB8fCBiID09IG51bGwpIHJldHVybiBhID09PSBiO1xuICAgIC8vIFVud3JhcCBhbnkgd3JhcHBlZCBvYmplY3RzLlxuICAgIGlmIChhIGluc3RhbmNlb2YgXykgYSA9IGEuX3dyYXBwZWQ7XG4gICAgaWYgKGIgaW5zdGFuY2VvZiBfKSBiID0gYi5fd3JhcHBlZDtcbiAgICAvLyBDb21wYXJlIGBbW0NsYXNzXV1gIG5hbWVzLlxuICAgIHZhciBjbGFzc05hbWUgPSB0b1N0cmluZy5jYWxsKGEpO1xuICAgIGlmIChjbGFzc05hbWUgIT0gdG9TdHJpbmcuY2FsbChiKSkgcmV0dXJuIGZhbHNlO1xuICAgIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgICAvLyBTdHJpbmdzLCBudW1iZXJzLCBkYXRlcywgYW5kIGJvb2xlYW5zIGFyZSBjb21wYXJlZCBieSB2YWx1ZS5cbiAgICAgIGNhc2UgJ1tvYmplY3QgU3RyaW5nXSc6XG4gICAgICAgIC8vIFByaW1pdGl2ZXMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgb2JqZWN0IHdyYXBwZXJzIGFyZSBlcXVpdmFsZW50OyB0aHVzLCBgXCI1XCJgIGlzXG4gICAgICAgIC8vIGVxdWl2YWxlbnQgdG8gYG5ldyBTdHJpbmcoXCI1XCIpYC5cbiAgICAgICAgcmV0dXJuIGEgPT0gU3RyaW5nKGIpO1xuICAgICAgY2FzZSAnW29iamVjdCBOdW1iZXJdJzpcbiAgICAgICAgLy8gYE5hTmBzIGFyZSBlcXVpdmFsZW50LCBidXQgbm9uLXJlZmxleGl2ZS4gQW4gYGVnYWxgIGNvbXBhcmlzb24gaXMgcGVyZm9ybWVkIGZvclxuICAgICAgICAvLyBvdGhlciBudW1lcmljIHZhbHVlcy5cbiAgICAgICAgcmV0dXJuIGEgIT0gK2EgPyBiICE9ICtiIDogKGEgPT0gMCA/IDEgLyBhID09IDEgLyBiIDogYSA9PSArYik7XG4gICAgICBjYXNlICdbb2JqZWN0IERhdGVdJzpcbiAgICAgIGNhc2UgJ1tvYmplY3QgQm9vbGVhbl0nOlxuICAgICAgICAvLyBDb2VyY2UgZGF0ZXMgYW5kIGJvb2xlYW5zIHRvIG51bWVyaWMgcHJpbWl0aXZlIHZhbHVlcy4gRGF0ZXMgYXJlIGNvbXBhcmVkIGJ5IHRoZWlyXG4gICAgICAgIC8vIG1pbGxpc2Vjb25kIHJlcHJlc2VudGF0aW9ucy4gTm90ZSB0aGF0IGludmFsaWQgZGF0ZXMgd2l0aCBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnNcbiAgICAgICAgLy8gb2YgYE5hTmAgYXJlIG5vdCBlcXVpdmFsZW50LlxuICAgICAgICByZXR1cm4gK2EgPT0gK2I7XG4gICAgICAvLyBSZWdFeHBzIGFyZSBjb21wYXJlZCBieSB0aGVpciBzb3VyY2UgcGF0dGVybnMgYW5kIGZsYWdzLlxuICAgICAgY2FzZSAnW29iamVjdCBSZWdFeHBdJzpcbiAgICAgICAgcmV0dXJuIGEuc291cmNlID09IGIuc291cmNlICYmXG4gICAgICAgICAgICAgICBhLmdsb2JhbCA9PSBiLmdsb2JhbCAmJlxuICAgICAgICAgICAgICAgYS5tdWx0aWxpbmUgPT0gYi5tdWx0aWxpbmUgJiZcbiAgICAgICAgICAgICAgIGEuaWdub3JlQ2FzZSA9PSBiLmlnbm9yZUNhc2U7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgYSAhPSAnb2JqZWN0JyB8fCB0eXBlb2YgYiAhPSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuICAgIC8vIEFzc3VtZSBlcXVhbGl0eSBmb3IgY3ljbGljIHN0cnVjdHVyZXMuIFRoZSBhbGdvcml0aG0gZm9yIGRldGVjdGluZyBjeWNsaWNcbiAgICAvLyBzdHJ1Y3R1cmVzIGlzIGFkYXB0ZWQgZnJvbSBFUyA1LjEgc2VjdGlvbiAxNS4xMi4zLCBhYnN0cmFjdCBvcGVyYXRpb24gYEpPYC5cbiAgICB2YXIgbGVuZ3RoID0gYVN0YWNrLmxlbmd0aDtcbiAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgIC8vIExpbmVhciBzZWFyY2guIFBlcmZvcm1hbmNlIGlzIGludmVyc2VseSBwcm9wb3J0aW9uYWwgdG8gdGhlIG51bWJlciBvZlxuICAgICAgLy8gdW5pcXVlIG5lc3RlZCBzdHJ1Y3R1cmVzLlxuICAgICAgaWYgKGFTdGFja1tsZW5ndGhdID09IGEpIHJldHVybiBiU3RhY2tbbGVuZ3RoXSA9PSBiO1xuICAgIH1cbiAgICAvLyBPYmplY3RzIHdpdGggZGlmZmVyZW50IGNvbnN0cnVjdG9ycyBhcmUgbm90IGVxdWl2YWxlbnQsIGJ1dCBgT2JqZWN0YHNcbiAgICAvLyBmcm9tIGRpZmZlcmVudCBmcmFtZXMgYXJlLlxuICAgIHZhciBhQ3RvciA9IGEuY29uc3RydWN0b3IsIGJDdG9yID0gYi5jb25zdHJ1Y3RvcjtcbiAgICBpZiAoYUN0b3IgIT09IGJDdG9yICYmICEoXy5pc0Z1bmN0aW9uKGFDdG9yKSAmJiAoYUN0b3IgaW5zdGFuY2VvZiBhQ3RvcikgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXy5pc0Z1bmN0aW9uKGJDdG9yKSAmJiAoYkN0b3IgaW5zdGFuY2VvZiBiQ3RvcikpXG4gICAgICAgICAgICAgICAgICAgICAgICAmJiAoJ2NvbnN0cnVjdG9yJyBpbiBhICYmICdjb25zdHJ1Y3RvcicgaW4gYikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgLy8gQWRkIHRoZSBmaXJzdCBvYmplY3QgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIGFTdGFjay5wdXNoKGEpO1xuICAgIGJTdGFjay5wdXNoKGIpO1xuICAgIHZhciBzaXplID0gMCwgcmVzdWx0ID0gdHJ1ZTtcbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cy5cbiAgICBpZiAoY2xhc3NOYW1lID09ICdbb2JqZWN0IEFycmF5XScpIHtcbiAgICAgIC8vIENvbXBhcmUgYXJyYXkgbGVuZ3RocyB0byBkZXRlcm1pbmUgaWYgYSBkZWVwIGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5LlxuICAgICAgc2l6ZSA9IGEubGVuZ3RoO1xuICAgICAgcmVzdWx0ID0gc2l6ZSA9PSBiLmxlbmd0aDtcbiAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgLy8gRGVlcCBjb21wYXJlIHRoZSBjb250ZW50cywgaWdub3Jpbmcgbm9uLW51bWVyaWMgcHJvcGVydGllcy5cbiAgICAgICAgd2hpbGUgKHNpemUtLSkge1xuICAgICAgICAgIGlmICghKHJlc3VsdCA9IGVxKGFbc2l6ZV0sIGJbc2l6ZV0sIGFTdGFjaywgYlN0YWNrKSkpIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERlZXAgY29tcGFyZSBvYmplY3RzLlxuICAgICAgZm9yICh2YXIga2V5IGluIGEpIHtcbiAgICAgICAgaWYgKF8uaGFzKGEsIGtleSkpIHtcbiAgICAgICAgICAvLyBDb3VudCB0aGUgZXhwZWN0ZWQgbnVtYmVyIG9mIHByb3BlcnRpZXMuXG4gICAgICAgICAgc2l6ZSsrO1xuICAgICAgICAgIC8vIERlZXAgY29tcGFyZSBlYWNoIG1lbWJlci5cbiAgICAgICAgICBpZiAoIShyZXN1bHQgPSBfLmhhcyhiLCBrZXkpICYmIGVxKGFba2V5XSwgYltrZXldLCBhU3RhY2ssIGJTdGFjaykpKSBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gRW5zdXJlIHRoYXQgYm90aCBvYmplY3RzIGNvbnRhaW4gdGhlIHNhbWUgbnVtYmVyIG9mIHByb3BlcnRpZXMuXG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIGZvciAoa2V5IGluIGIpIHtcbiAgICAgICAgICBpZiAoXy5oYXMoYiwga2V5KSAmJiAhKHNpemUtLSkpIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJlc3VsdCA9ICFzaXplO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBSZW1vdmUgdGhlIGZpcnN0IG9iamVjdCBmcm9tIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucG9wKCk7XG4gICAgYlN0YWNrLnBvcCgpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUGVyZm9ybSBhIGRlZXAgY29tcGFyaXNvbiB0byBjaGVjayBpZiB0d28gb2JqZWN0cyBhcmUgZXF1YWwuXG4gIF8uaXNFcXVhbCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICByZXR1cm4gZXEoYSwgYiwgW10sIFtdKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIGFycmF5LCBzdHJpbmcsIG9yIG9iamVjdCBlbXB0eT9cbiAgLy8gQW4gXCJlbXB0eVwiIG9iamVjdCBoYXMgbm8gZW51bWVyYWJsZSBvd24tcHJvcGVydGllcy5cbiAgXy5pc0VtcHR5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoXy5pc0FycmF5KG9iaikgfHwgXy5pc1N0cmluZyhvYmopKSByZXR1cm4gb2JqLmxlbmd0aCA9PT0gMDtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSByZXR1cm4gZmFsc2U7XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIERPTSBlbGVtZW50P1xuICBfLmlzRWxlbWVudCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiAhIShvYmogJiYgb2JqLm5vZGVUeXBlID09PSAxKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGFuIGFycmF5P1xuICAvLyBEZWxlZ2F0ZXMgdG8gRUNNQTUncyBuYXRpdmUgQXJyYXkuaXNBcnJheVxuICBfLmlzQXJyYXkgPSBuYXRpdmVJc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIGFuIG9iamVjdD9cbiAgXy5pc09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IE9iamVjdChvYmopO1xuICB9O1xuXG4gIC8vIEFkZCBzb21lIGlzVHlwZSBtZXRob2RzOiBpc0FyZ3VtZW50cywgaXNGdW5jdGlvbiwgaXNTdHJpbmcsIGlzTnVtYmVyLCBpc0RhdGUsIGlzUmVnRXhwLlxuICBlYWNoKFsnQXJndW1lbnRzJywgJ0Z1bmN0aW9uJywgJ1N0cmluZycsICdOdW1iZXInLCAnRGF0ZScsICdSZWdFeHAnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIF9bJ2lzJyArIG5hbWVdID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0ICcgKyBuYW1lICsgJ10nO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIERlZmluZSBhIGZhbGxiYWNrIHZlcnNpb24gb2YgdGhlIG1ldGhvZCBpbiBicm93c2VycyAoYWhlbSwgSUUpLCB3aGVyZVxuICAvLyB0aGVyZSBpc24ndCBhbnkgaW5zcGVjdGFibGUgXCJBcmd1bWVudHNcIiB0eXBlLlxuICBpZiAoIV8uaXNBcmd1bWVudHMoYXJndW1lbnRzKSkge1xuICAgIF8uaXNBcmd1bWVudHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiAhIShvYmogJiYgXy5oYXMob2JqLCAnY2FsbGVlJykpO1xuICAgIH07XG4gIH1cblxuICAvLyBPcHRpbWl6ZSBgaXNGdW5jdGlvbmAgaWYgYXBwcm9wcmlhdGUuXG4gIGlmICh0eXBlb2YgKC8uLykgIT09ICdmdW5jdGlvbicpIHtcbiAgICBfLmlzRnVuY3Rpb24gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiB0eXBlb2Ygb2JqID09PSAnZnVuY3Rpb24nO1xuICAgIH07XG4gIH1cblxuICAvLyBJcyBhIGdpdmVuIG9iamVjdCBhIGZpbml0ZSBudW1iZXI/XG4gIF8uaXNGaW5pdGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gaXNGaW5pdGUob2JqKSAmJiAhaXNOYU4ocGFyc2VGbG9hdChvYmopKTtcbiAgfTtcblxuICAvLyBJcyB0aGUgZ2l2ZW4gdmFsdWUgYE5hTmA/IChOYU4gaXMgdGhlIG9ubHkgbnVtYmVyIHdoaWNoIGRvZXMgbm90IGVxdWFsIGl0c2VsZikuXG4gIF8uaXNOYU4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gXy5pc051bWJlcihvYmopICYmIG9iaiAhPSArb2JqO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBib29sZWFuP1xuICBfLmlzQm9vbGVhbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHRydWUgfHwgb2JqID09PSBmYWxzZSB8fCB0b1N0cmluZy5jYWxsKG9iaikgPT0gJ1tvYmplY3QgQm9vbGVhbl0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgZXF1YWwgdG8gbnVsbD9cbiAgXy5pc051bGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBudWxsO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgdW5kZWZpbmVkP1xuICBfLmlzVW5kZWZpbmVkID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdm9pZCAwO1xuICB9O1xuXG4gIC8vIFNob3J0Y3V0IGZ1bmN0aW9uIGZvciBjaGVja2luZyBpZiBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gcHJvcGVydHkgZGlyZWN0bHlcbiAgLy8gb24gaXRzZWxmIChpbiBvdGhlciB3b3Jkcywgbm90IG9uIGEgcHJvdG90eXBlKS5cbiAgXy5oYXMgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgfTtcblxuICAvLyBVdGlsaXR5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJ1biBVbmRlcnNjb3JlLmpzIGluICpub0NvbmZsaWN0KiBtb2RlLCByZXR1cm5pbmcgdGhlIGBfYCB2YXJpYWJsZSB0byBpdHNcbiAgLy8gcHJldmlvdXMgb3duZXIuIFJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICByb290Ll8gPSBwcmV2aW91c1VuZGVyc2NvcmU7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gS2VlcCB0aGUgaWRlbnRpdHkgZnVuY3Rpb24gYXJvdW5kIGZvciBkZWZhdWx0IGl0ZXJhdG9ycy5cbiAgXy5pZGVudGl0eSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9O1xuXG4gIF8uY29uc3RhbnQgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfTtcbiAgfTtcblxuICBfLnByb3BlcnR5ID0gZnVuY3Rpb24oa2V5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIHByZWRpY2F0ZSBmb3IgY2hlY2tpbmcgd2hldGhlciBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gc2V0IG9mIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLm1hdGNoZXMgPSBmdW5jdGlvbihhdHRycykge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIGlmIChvYmogPT09IGF0dHJzKSByZXR1cm4gdHJ1ZTsgLy9hdm9pZCBjb21wYXJpbmcgYW4gb2JqZWN0IHRvIGl0c2VsZi5cbiAgICAgIGZvciAodmFyIGtleSBpbiBhdHRycykge1xuICAgICAgICBpZiAoYXR0cnNba2V5XSAhPT0gb2JqW2tleV0pXG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9O1xuXG4gIC8vIFJ1biBhIGZ1bmN0aW9uICoqbioqIHRpbWVzLlxuICBfLnRpbWVzID0gZnVuY3Rpb24obiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgYWNjdW0gPSBBcnJheShNYXRoLm1heCgwLCBuKSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIGFjY3VtW2ldID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBpKTtcbiAgICByZXR1cm4gYWNjdW07XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgcmFuZG9tIGludGVnZXIgYmV0d2VlbiBtaW4gYW5kIG1heCAoaW5jbHVzaXZlKS5cbiAgXy5yYW5kb20gPSBmdW5jdGlvbihtaW4sIG1heCkge1xuICAgIGlmIChtYXggPT0gbnVsbCkge1xuICAgICAgbWF4ID0gbWluO1xuICAgICAgbWluID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIG1pbiArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSk7XG4gIH07XG5cbiAgLy8gQSAocG9zc2libHkgZmFzdGVyKSB3YXkgdG8gZ2V0IHRoZSBjdXJyZW50IHRpbWVzdGFtcCBhcyBhbiBpbnRlZ2VyLlxuICBfLm5vdyA9IERhdGUubm93IHx8IGZ1bmN0aW9uKCkgeyByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCk7IH07XG5cbiAgLy8gTGlzdCBvZiBIVE1MIGVudGl0aWVzIGZvciBlc2NhcGluZy5cbiAgdmFyIGVudGl0eU1hcCA9IHtcbiAgICBlc2NhcGU6IHtcbiAgICAgICcmJzogJyZhbXA7JyxcbiAgICAgICc8JzogJyZsdDsnLFxuICAgICAgJz4nOiAnJmd0OycsXG4gICAgICAnXCInOiAnJnF1b3Q7JyxcbiAgICAgIFwiJ1wiOiAnJiN4Mjc7J1xuICAgIH1cbiAgfTtcbiAgZW50aXR5TWFwLnVuZXNjYXBlID0gXy5pbnZlcnQoZW50aXR5TWFwLmVzY2FwZSk7XG5cbiAgLy8gUmVnZXhlcyBjb250YWluaW5nIHRoZSBrZXlzIGFuZCB2YWx1ZXMgbGlzdGVkIGltbWVkaWF0ZWx5IGFib3ZlLlxuICB2YXIgZW50aXR5UmVnZXhlcyA9IHtcbiAgICBlc2NhcGU6ICAgbmV3IFJlZ0V4cCgnWycgKyBfLmtleXMoZW50aXR5TWFwLmVzY2FwZSkuam9pbignJykgKyAnXScsICdnJyksXG4gICAgdW5lc2NhcGU6IG5ldyBSZWdFeHAoJygnICsgXy5rZXlzKGVudGl0eU1hcC51bmVzY2FwZSkuam9pbignfCcpICsgJyknLCAnZycpXG4gIH07XG5cbiAgLy8gRnVuY3Rpb25zIGZvciBlc2NhcGluZyBhbmQgdW5lc2NhcGluZyBzdHJpbmdzIHRvL2Zyb20gSFRNTCBpbnRlcnBvbGF0aW9uLlxuICBfLmVhY2goWydlc2NhcGUnLCAndW5lc2NhcGUnXSwgZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgX1ttZXRob2RdID0gZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgICBpZiAoc3RyaW5nID09IG51bGwpIHJldHVybiAnJztcbiAgICAgIHJldHVybiAoJycgKyBzdHJpbmcpLnJlcGxhY2UoZW50aXR5UmVnZXhlc1ttZXRob2RdLCBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgICByZXR1cm4gZW50aXR5TWFwW21ldGhvZF1bbWF0Y2hdO1xuICAgICAgfSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gSWYgdGhlIHZhbHVlIG9mIHRoZSBuYW1lZCBgcHJvcGVydHlgIGlzIGEgZnVuY3Rpb24gdGhlbiBpbnZva2UgaXQgd2l0aCB0aGVcbiAgLy8gYG9iamVjdGAgYXMgY29udGV4dDsgb3RoZXJ3aXNlLCByZXR1cm4gaXQuXG4gIF8ucmVzdWx0ID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSkge1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICB2YXIgdmFsdWUgPSBvYmplY3RbcHJvcGVydHldO1xuICAgIHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUuY2FsbChvYmplY3QpIDogdmFsdWU7XG4gIH07XG5cbiAgLy8gQWRkIHlvdXIgb3duIGN1c3RvbSBmdW5jdGlvbnMgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm1peGluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgZWFjaChfLmZ1bmN0aW9ucyhvYmopLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgICB2YXIgZnVuYyA9IF9bbmFtZV0gPSBvYmpbbmFtZV07XG4gICAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IFt0aGlzLl93cmFwcGVkXTtcbiAgICAgICAgcHVzaC5hcHBseShhcmdzLCBhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gcmVzdWx0LmNhbGwodGhpcywgZnVuYy5hcHBseShfLCBhcmdzKSk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIGEgdW5pcXVlIGludGVnZXIgaWQgKHVuaXF1ZSB3aXRoaW4gdGhlIGVudGlyZSBjbGllbnQgc2Vzc2lvbikuXG4gIC8vIFVzZWZ1bCBmb3IgdGVtcG9yYXJ5IERPTSBpZHMuXG4gIHZhciBpZENvdW50ZXIgPSAwO1xuICBfLnVuaXF1ZUlkID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgfTtcblxuICAvLyBCeSBkZWZhdWx0LCBVbmRlcnNjb3JlIHVzZXMgRVJCLXN0eWxlIHRlbXBsYXRlIGRlbGltaXRlcnMsIGNoYW5nZSB0aGVcbiAgLy8gZm9sbG93aW5nIHRlbXBsYXRlIHNldHRpbmdzIHRvIHVzZSBhbHRlcm5hdGl2ZSBkZWxpbWl0ZXJzLlxuICBfLnRlbXBsYXRlU2V0dGluZ3MgPSB7XG4gICAgZXZhbHVhdGUgICAgOiAvPCUoW1xcc1xcU10rPyklPi9nLFxuICAgIGludGVycG9sYXRlIDogLzwlPShbXFxzXFxTXSs/KSU+L2csXG4gICAgZXNjYXBlICAgICAgOiAvPCUtKFtcXHNcXFNdKz8pJT4vZ1xuICB9O1xuXG4gIC8vIFdoZW4gY3VzdG9taXppbmcgYHRlbXBsYXRlU2V0dGluZ3NgLCBpZiB5b3UgZG9uJ3Qgd2FudCB0byBkZWZpbmUgYW5cbiAgLy8gaW50ZXJwb2xhdGlvbiwgZXZhbHVhdGlvbiBvciBlc2NhcGluZyByZWdleCwgd2UgbmVlZCBvbmUgdGhhdCBpc1xuICAvLyBndWFyYW50ZWVkIG5vdCB0byBtYXRjaC5cbiAgdmFyIG5vTWF0Y2ggPSAvKC4pXi87XG5cbiAgLy8gQ2VydGFpbiBjaGFyYWN0ZXJzIG5lZWQgdG8gYmUgZXNjYXBlZCBzbyB0aGF0IHRoZXkgY2FuIGJlIHB1dCBpbnRvIGFcbiAgLy8gc3RyaW5nIGxpdGVyYWwuXG4gIHZhciBlc2NhcGVzID0ge1xuICAgIFwiJ1wiOiAgICAgIFwiJ1wiLFxuICAgICdcXFxcJzogICAgICdcXFxcJyxcbiAgICAnXFxyJzogICAgICdyJyxcbiAgICAnXFxuJzogICAgICduJyxcbiAgICAnXFx0JzogICAgICd0JyxcbiAgICAnXFx1MjAyOCc6ICd1MjAyOCcsXG4gICAgJ1xcdTIwMjknOiAndTIwMjknXG4gIH07XG5cbiAgdmFyIGVzY2FwZXIgPSAvXFxcXHwnfFxccnxcXG58XFx0fFxcdTIwMjh8XFx1MjAyOS9nO1xuXG4gIC8vIEphdmFTY3JpcHQgbWljcm8tdGVtcGxhdGluZywgc2ltaWxhciB0byBKb2huIFJlc2lnJ3MgaW1wbGVtZW50YXRpb24uXG4gIC8vIFVuZGVyc2NvcmUgdGVtcGxhdGluZyBoYW5kbGVzIGFyYml0cmFyeSBkZWxpbWl0ZXJzLCBwcmVzZXJ2ZXMgd2hpdGVzcGFjZSxcbiAgLy8gYW5kIGNvcnJlY3RseSBlc2NhcGVzIHF1b3RlcyB3aXRoaW4gaW50ZXJwb2xhdGVkIGNvZGUuXG4gIF8udGVtcGxhdGUgPSBmdW5jdGlvbih0ZXh0LCBkYXRhLCBzZXR0aW5ncykge1xuICAgIHZhciByZW5kZXI7XG4gICAgc2V0dGluZ3MgPSBfLmRlZmF1bHRzKHt9LCBzZXR0aW5ncywgXy50ZW1wbGF0ZVNldHRpbmdzKTtcblxuICAgIC8vIENvbWJpbmUgZGVsaW1pdGVycyBpbnRvIG9uZSByZWd1bGFyIGV4cHJlc3Npb24gdmlhIGFsdGVybmF0aW9uLlxuICAgIHZhciBtYXRjaGVyID0gbmV3IFJlZ0V4cChbXG4gICAgICAoc2V0dGluZ3MuZXNjYXBlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5pbnRlcnBvbGF0ZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuZXZhbHVhdGUgfHwgbm9NYXRjaCkuc291cmNlXG4gICAgXS5qb2luKCd8JykgKyAnfCQnLCAnZycpO1xuXG4gICAgLy8gQ29tcGlsZSB0aGUgdGVtcGxhdGUgc291cmNlLCBlc2NhcGluZyBzdHJpbmcgbGl0ZXJhbHMgYXBwcm9wcmlhdGVseS5cbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzb3VyY2UgPSBcIl9fcCs9J1wiO1xuICAgIHRleHQucmVwbGFjZShtYXRjaGVyLCBmdW5jdGlvbihtYXRjaCwgZXNjYXBlLCBpbnRlcnBvbGF0ZSwgZXZhbHVhdGUsIG9mZnNldCkge1xuICAgICAgc291cmNlICs9IHRleHQuc2xpY2UoaW5kZXgsIG9mZnNldClcbiAgICAgICAgLnJlcGxhY2UoZXNjYXBlciwgZnVuY3Rpb24obWF0Y2gpIHsgcmV0dXJuICdcXFxcJyArIGVzY2FwZXNbbWF0Y2hdOyB9KTtcblxuICAgICAgaWYgKGVzY2FwZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGVzY2FwZSArIFwiKSk9PW51bGw/Jyc6Xy5lc2NhcGUoX190KSkrXFxuJ1wiO1xuICAgICAgfVxuICAgICAgaWYgKGludGVycG9sYXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgaW50ZXJwb2xhdGUgKyBcIikpPT1udWxsPycnOl9fdCkrXFxuJ1wiO1xuICAgICAgfVxuICAgICAgaWYgKGV2YWx1YXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIic7XFxuXCIgKyBldmFsdWF0ZSArIFwiXFxuX19wKz0nXCI7XG4gICAgICB9XG4gICAgICBpbmRleCA9IG9mZnNldCArIG1hdGNoLmxlbmd0aDtcbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcbiAgICBzb3VyY2UgKz0gXCInO1xcblwiO1xuXG4gICAgLy8gSWYgYSB2YXJpYWJsZSBpcyBub3Qgc3BlY2lmaWVkLCBwbGFjZSBkYXRhIHZhbHVlcyBpbiBsb2NhbCBzY29wZS5cbiAgICBpZiAoIXNldHRpbmdzLnZhcmlhYmxlKSBzb3VyY2UgPSAnd2l0aChvYmp8fHt9KXtcXG4nICsgc291cmNlICsgJ31cXG4nO1xuXG4gICAgc291cmNlID0gXCJ2YXIgX190LF9fcD0nJyxfX2o9QXJyYXkucHJvdG90eXBlLmpvaW4sXCIgK1xuICAgICAgXCJwcmludD1mdW5jdGlvbigpe19fcCs9X19qLmNhbGwoYXJndW1lbnRzLCcnKTt9O1xcblwiICtcbiAgICAgIHNvdXJjZSArIFwicmV0dXJuIF9fcDtcXG5cIjtcblxuICAgIHRyeSB7XG4gICAgICByZW5kZXIgPSBuZXcgRnVuY3Rpb24oc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicsICdfJywgc291cmNlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlLnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuXG4gICAgaWYgKGRhdGEpIHJldHVybiByZW5kZXIoZGF0YSwgXyk7XG4gICAgdmFyIHRlbXBsYXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgcmV0dXJuIHJlbmRlci5jYWxsKHRoaXMsIGRhdGEsIF8pO1xuICAgIH07XG5cbiAgICAvLyBQcm92aWRlIHRoZSBjb21waWxlZCBmdW5jdGlvbiBzb3VyY2UgYXMgYSBjb252ZW5pZW5jZSBmb3IgcHJlY29tcGlsYXRpb24uXG4gICAgdGVtcGxhdGUuc291cmNlID0gJ2Z1bmN0aW9uKCcgKyAoc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicpICsgJyl7XFxuJyArIHNvdXJjZSArICd9JztcblxuICAgIHJldHVybiB0ZW1wbGF0ZTtcbiAgfTtcblxuICAvLyBBZGQgYSBcImNoYWluXCIgZnVuY3Rpb24sIHdoaWNoIHdpbGwgZGVsZWdhdGUgdG8gdGhlIHdyYXBwZXIuXG4gIF8uY2hhaW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gXyhvYmopLmNoYWluKCk7XG4gIH07XG5cbiAgLy8gT09QXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAvLyBJZiBVbmRlcnNjb3JlIGlzIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLCBpdCByZXR1cm5zIGEgd3JhcHBlZCBvYmplY3QgdGhhdFxuICAvLyBjYW4gYmUgdXNlZCBPTy1zdHlsZS4gVGhpcyB3cmFwcGVyIGhvbGRzIGFsdGVyZWQgdmVyc2lvbnMgb2YgYWxsIHRoZVxuICAvLyB1bmRlcnNjb3JlIGZ1bmN0aW9ucy4gV3JhcHBlZCBvYmplY3RzIG1heSBiZSBjaGFpbmVkLlxuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb250aW51ZSBjaGFpbmluZyBpbnRlcm1lZGlhdGUgcmVzdWx0cy5cbiAgdmFyIHJlc3VsdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0aGlzLl9jaGFpbiA/IF8ob2JqKS5jaGFpbigpIDogb2JqO1xuICB9O1xuXG4gIC8vIEFkZCBhbGwgb2YgdGhlIFVuZGVyc2NvcmUgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyIG9iamVjdC5cbiAgXy5taXhpbihfKTtcblxuICAvLyBBZGQgYWxsIG11dGF0b3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBlYWNoKFsncG9wJywgJ3B1c2gnLCAncmV2ZXJzZScsICdzaGlmdCcsICdzb3J0JywgJ3NwbGljZScsICd1bnNoaWZ0J10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG9iaiA9IHRoaXMuX3dyYXBwZWQ7XG4gICAgICBtZXRob2QuYXBwbHkob2JqLCBhcmd1bWVudHMpO1xuICAgICAgaWYgKChuYW1lID09ICdzaGlmdCcgfHwgbmFtZSA9PSAnc3BsaWNlJykgJiYgb2JqLmxlbmd0aCA9PT0gMCkgZGVsZXRlIG9ialswXTtcbiAgICAgIHJldHVybiByZXN1bHQuY2FsbCh0aGlzLCBvYmopO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIEFkZCBhbGwgYWNjZXNzb3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBlYWNoKFsnY29uY2F0JywgJ2pvaW4nLCAnc2xpY2UnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcmVzdWx0LmNhbGwodGhpcywgbWV0aG9kLmFwcGx5KHRoaXMuX3dyYXBwZWQsIGFyZ3VtZW50cykpO1xuICAgIH07XG4gIH0pO1xuXG4gIF8uZXh0ZW5kKF8ucHJvdG90eXBlLCB7XG5cbiAgICAvLyBTdGFydCBjaGFpbmluZyBhIHdyYXBwZWQgVW5kZXJzY29yZSBvYmplY3QuXG4gICAgY2hhaW46IGZ1bmN0aW9uKCkge1xuICAgICAgdGhpcy5fY2hhaW4gPSB0cnVlO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8vIEV4dHJhY3RzIHRoZSByZXN1bHQgZnJvbSBhIHdyYXBwZWQgYW5kIGNoYWluZWQgb2JqZWN0LlxuICAgIHZhbHVlOiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB0aGlzLl93cmFwcGVkO1xuICAgIH1cblxuICB9KTtcblxuICAvLyBBTUQgcmVnaXN0cmF0aW9uIGhhcHBlbnMgYXQgdGhlIGVuZCBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIEFNRCBsb2FkZXJzXG4gIC8vIHRoYXQgbWF5IG5vdCBlbmZvcmNlIG5leHQtdHVybiBzZW1hbnRpY3Mgb24gbW9kdWxlcy4gRXZlbiB0aG91Z2ggZ2VuZXJhbFxuICAvLyBwcmFjdGljZSBmb3IgQU1EIHJlZ2lzdHJhdGlvbiBpcyB0byBiZSBhbm9ueW1vdXMsIHVuZGVyc2NvcmUgcmVnaXN0ZXJzXG4gIC8vIGFzIGEgbmFtZWQgbW9kdWxlIGJlY2F1c2UsIGxpa2UgalF1ZXJ5LCBpdCBpcyBhIGJhc2UgbGlicmFyeSB0aGF0IGlzXG4gIC8vIHBvcHVsYXIgZW5vdWdoIHRvIGJlIGJ1bmRsZWQgaW4gYSB0aGlyZCBwYXJ0eSBsaWIsIGJ1dCBub3QgYmUgcGFydCBvZlxuICAvLyBhbiBBTUQgbG9hZCByZXF1ZXN0LiBUaG9zZSBjYXNlcyBjb3VsZCBnZW5lcmF0ZSBhbiBlcnJvciB3aGVuIGFuXG4gIC8vIGFub255bW91cyBkZWZpbmUoKSBpcyBjYWxsZWQgb3V0c2lkZSBvZiBhIGxvYWRlciByZXF1ZXN0LlxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKCd1bmRlcnNjb3JlJywgW10sIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIF87XG4gICAgfSk7XG4gIH1cbn0pLmNhbGwodGhpcyk7XG4iLCJ2YXIgYXNzZXJ0ID0gcmVxdWlyZShcImFzc2VydFwiKTtcblxuZGVzY3JpYmUoXCJCYXNpYyBDbGFzcyBQcm9wZXJ0aWVzXCIsIGZ1bmN0aW9uKCkge1xuXG5cdGl0KFwiZXh0ZW5kKCkgc2hvdWxkIGNyZWF0ZSBhIHZhbGlkIHN1YmNsYXNzXCIsIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBTdWJUZW1wbGUgPSBUZW1wbGUuZXh0ZW5kKHtcblx0XHRcdGZvbzogZnVuY3Rpb24oKXt9XG5cdFx0fSk7XG5cblx0XHR2YXIgdHBsID0gbmV3IFN1YlRlbXBsZSgpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRwbCBpbnN0YW5jZW9mIFRlbXBsZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiB0cGwuZm9vLCBcImZ1bmN0aW9uXCIpO1xuXHR9KTtcblxufSk7IiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuXG5nbG9iYWwuVGVtcGxlID0gcmVxdWlyZShcIi4uL2xpYi90ZW1wbGVcIik7XG5cbm1vY2hhLnNldHVwKCdiZGQnKTtcblxuZGVzY3JpYmUoXCJUZW1wbGVcIiwgZnVuY3Rpb24oKSB7XG5cdHJlcXVpcmUoXCIuL2NsYXNzXCIpO1xuXHRyZXF1aXJlKFwiLi9wYXJzZVwiKTtcbn0pO1xuXG5kZXNjcmliZShcIm5ldyBUZW1wbGUoKVwiLCBmdW5jdGlvbigpIHtcblx0cmVxdWlyZShcIi4vbW9kZWxcIik7XG5cdHJlcXVpcmUoXCIuL3JlbmRlclwiKTtcbn0pO1xuXG5tb2NoYS5ydW4oKTtcbn0pLmNhbGwodGhpcyx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwidmFyIGFzc2VydCA9IHJlcXVpcmUoXCJhc3NlcnRcIik7XG5cbmRlc2NyaWJlKFwiRGF0YVwiLCBmdW5jdGlvbigpIHtcblx0dmFyIHRwbDtcblxuXHRiZWZvcmUoZnVuY3Rpb24oKSB7XG5cdFx0dHBsID0gbmV3IFRlbXBsZSgpO1xuXHR9KTtcblxuXHRiZWZvcmVFYWNoKGZ1bmN0aW9uKCkge1xuXHRcdHRwbC5zZXQoXCJmb29cIiwgXCJiYXJcIik7XG5cdH0pO1xuXG5cdGRlc2NyaWJlKFwiI2dldCgpICYgI3NldCgpXCIsIGZ1bmN0aW9uKCkge1xuXHRcdGl0KFwic2V0cyBkYXRhIG9uIGNvbnN0cnVjdGlvblwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciB0cGwgPSBuZXcgVGVtcGxlKHtcblx0XHRcdFx0ZGF0YTogeyBmb286IFwiYmFyXCIgfVxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwRXF1YWwodHBsLmdldCgpLCB7IGZvbzogXCJiYXJcIiB9KTtcblx0XHR9KTtcblxuXHRcdGl0KFwicmV0dXJucyBgdGhpcy5kYXRhYCB2YWx1ZSBvbiBudWxsIG9yIGVtcHR5IHBhdGhcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHBsLmdldCgpLCB0cGwuZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRpdChcImdldHMgJiBzZXRzIHNoYWxsb3cgcGF0aFwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHRwbC5zZXQoXCJmb29cIiwgeyBiYXI6IFwiYmF6XCIgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHRwbC5nZXQoXCJmb29cIiksIHsgYmFyOiBcImJhelwiIH0pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJnZXRzICYgc2V0cyBkZWVwIHBhdGhcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHR0cGwuc2V0KFwiZm9vLmJhclwiLCBcImJhelwiKTtcblx0XHRcdGFzc2VydC5lcXVhbCh0cGwuZ2V0KFwiZm9vLmJhclwiKSwgXCJiYXpcIik7XG5cdFx0fSk7XG5cblx0XHRpdChcImdldChwYXRoKSBleGVjdXRlcyBmdW5jdGlvbiB2YWx1ZSBpZmYgdmFsdWUgYXQgcGF0aCBpcyBmdW5jdGlvblwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHRwbC5zZXQoXCJmb29cIiwgZnVuY3Rpb24oX3RwbCkge1xuXHRcdFx0XHRzZWVuID0gdHJ1ZTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXMsIHRwbC5kYXRhKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKF90cGwsIHRwbCk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cGwuZ2V0KFwiZm9vXCIpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdGl0KFwiZGVlcCBjb3BpZXMgZ2VuZXJpYyBvYmplY3RzIG9uIHNldFwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBkYXRhID0geyBiYXI6IHsgYmF6OiBcImJ1elwiIH0gfTtcblx0XHRcdHRwbC5zZXQoXCJmb29cIiwgZGF0YSk7XG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHRwbC5nZXQoXCJmb29cIiksIGRhdGEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRwbC5nZXQoXCJmb29cIiksIGRhdGEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHRwbC5nZXQoXCJmb28uYmFyXCIpLCBkYXRhLmZvbyk7XG5cdFx0fSk7XG5cblx0XHRpdChcImRpcmVjdGx5IHBvaW50cyB0byBub24tZ2VuZXJpYyBvYmplY3RzIG9uIHNldFwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBkYXRhID0gW107XG5cdFx0XHR0cGwuc2V0KFwiZm9vXCIsIGRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRwbC5nZXQoXCJmb29cIiksIGRhdGEpO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJ1bnNldHNcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHR0cGwudW5zZXQoXCJmb29cIik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHRwbC5nZXQoXCJmb29cIiksIFwidW5kZWZpbmVkXCIpO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJvbmx5IHVuc2V0cyBkZWVwbHkgb24gZ2VuZXJpYyBvYmplY3RzXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dHBsLnNldChcImZvb1wiLCBbIDAsIDEsIDIgXSk7XG5cdFx0XHRhc3NlcnQuZXF1YWwodHBsLmdldChcImZvby5sZW5ndGhcIiksIDMpO1xuXHRcdFx0dHBsLnVuc2V0KFwiZm9vLmxlbmd0aFwiKTtcblx0XHRcdGFzc2VydC5lcXVhbCh0cGwuZ2V0KFwiZm9vLmxlbmd0aFwiKSwgMyk7XG5cdFx0fSk7XG5cblx0XHRpdChcInVuc2V0KCkgc2V0cyBgdGhpcy5kYXRhYCB0byB1bmRlZmluZWQgb24gbnVsbCBvciBlbXB0eSBwYXRoXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dHBsLnVuc2V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHRwbC5kYXRhLCBcInVuZGVmaW5lZFwiKTtcblx0XHR9KTtcblx0fSk7XG5cblxuXHRkZXNjcmliZShcIiNhdXRvcnVuKClcIiwgZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGNvbXA7XG5cdFx0XG5cdFx0YWZ0ZXJFYWNoKGZ1bmN0aW9uKCkge1xuXHRcdFx0aWYgKGNvbXAgIT0gbnVsbCkge1xuXHRcdFx0XHRjb21wLnN0b3AoKTtcblx0XHRcdFx0Y29tcCA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpdChcImF1dG9ydW4oKSBjb250ZXh0IGFsd2F5cyBydW5zIG9uY2UsIGltbWVkaWF0ZWx5XCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIHNlZW4gPSBmYWxzZTtcblx0XHRcdGNvbXAgPSB0cGwuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRwbC5nZXQoXCJmb29cIikpO1xuXHRcdFx0XHRzZWVuID0gdHJ1ZTtcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlZW4pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJgdGhpc2AgaW4gYXV0b3J1bigpIGNvbnRleHRzIHBvaW50cyB0byBUZW1wbGUgaW5zdGFuY2VcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRjb21wID0gdHBsLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGFzc2VydC5vayh0cGwuZ2V0KFwiZm9vXCIpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaXMsIHRwbCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGl0KFwiY2hhbmdpbmcgdmFsdWUgYXQgYGtleWAgYWZ0ZXIgY2FsbGluZyBnZXQoa2V5KSBpbiBhIGNvbnRleHQgY2F1c2VzIGNvbnRleHQgdG8gcnVuIGFnYWluXCIsIGZ1bmN0aW9uKGRvbmUpIHtcblx0XHRcdHRoaXMudGltZW91dCgxMDApO1xuXHRcdFx0dmFyIHJ1biA9IDI7XG5cblx0XHRcdGNvbXAgPSB0cGwuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRwbC5nZXQoXCJmb29cIikpO1xuXHRcdFx0XHRpZiAoISgtLXJ1bikpIGRvbmUoKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR0cGwuc2V0KFwiZm9vXCIsIHsgYmFyOiBcImJhelwiIH0pO1xuXHRcdFx0fSwgMTApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRkZXNjcmliZShcIiNvYnNlcnZlKClcIiwgZnVuY3Rpb24oKSB7XG5cdFx0dmFyIG87XG5cblx0XHRhZnRlckVhY2goZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAobyAhPSBudWxsKSB7XG5cdFx0XHRcdG8uc3RvcCgpO1xuXHRcdFx0XHRvID0gbnVsbDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGl0KFwic3VjY2Vzc2Z1bGx5IGFkZHMgJiByZW1vdmVzIG9ic2VydmVyXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0byA9IHRwbC5vYnNlcnZlKFwiZm9vXCIsIGZ1bmN0aW9uKCl7fSk7XG5cdFx0XHRhc3NlcnQub2sodHBsLl9vYnNlcnZlcnMuaW5kZXhPZihvKSA+IC0xKTtcblx0XHRcdG8uc3RvcCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRwbC5fb2JzZXJ2ZXJzLmluZGV4T2YobyksIC0xKTtcblx0XHR9KTtcblxuXHRcdGl0KFwib2JzZXJ2ZXMgbm90aGluZyB3aGVuIG5vdGhpbmcgY2hhbmdlc1wiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gdHBsLm9ic2VydmUoXCJmb29cIiwgZnVuY3Rpb24oKSB7IHNlZW4gPSB0cnVlOyB9KTtcblx0XHRcdHRwbC5zZXQoXCJmb29cIiwgXCJiYXJcIik7XG5cdFx0XHRhc3NlcnQub2soIXNlZW4pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJvYnNlcnZlcyBzdGF0aWMgcGF0aCBjaGFuZ2VzXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIHNlZW4gPSBmYWxzZTtcblx0XHRcdG8gPSB0cGwub2JzZXJ2ZShcImZvby5iYXJcIiwgZnVuY3Rpb24obnZhbCwgb3ZhbCwgcGF0aCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnZhbCwgXCJiYXpcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2Ygb3ZhbCwgXCJ1bmRlZmluZWRcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLCBcImZvby5iYXJcIik7XG5cdFx0XHRcdHNlZW4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRwbC5zZXQoXCJmb29cIiwgeyBiYXI6IFwiYmF6XCIgfSk7XG5cdFx0XHRhc3NlcnQub2soc2Vlbik7XG5cdFx0fSk7XG5cblx0XHRpdChcIm9ic2VydmVzIHVuc2V0XCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIHNlZW4gPSBmYWxzZTtcblx0XHRcdG8gPSB0cGwub2JzZXJ2ZShcImZvb1wiLCBmdW5jdGlvbihudmFsLCBvdmFsLCBwYXRoKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgbnZhbCwgXCJ1bmRlZmluZWRcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdmFsLCBcImJhclwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgsIFwiZm9vXCIpO1xuXHRcdFx0XHRzZWVuID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0cGwudW5zZXQoXCJmb29cIik7XG5cdFx0XHRhc3NlcnQub2soc2Vlbik7XG5cdFx0fSk7XG5cblx0XHRpdChcIm9ic2VydmVzIGR5bmFtaWMgcGF0aDogKlwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gdHBsLm9ic2VydmUoXCIqXCIsIGZ1bmN0aW9uKG52YWwsIG92YWwsIHBhdGgpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChudmFsLCB7IGJhcjogXCJiYXpcIiB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG92YWwsIFwiYmFyXCIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aCwgXCJmb29cIik7XG5cdFx0XHRcdHNlZW4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRwbC5zZXQoXCJmb29cIiwgeyBiYXI6IFwiYmF6XCIgfSk7XG5cdFx0XHRhc3NlcnQub2soc2Vlbik7XG5cdFx0fSk7XG5cblx0XHRpdChcIm9ic2VydmVzIGR5bmFtaWMgcGF0aDogKi5iYXIuYmF6XCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIHNlZW4gPSBmYWxzZTtcblx0XHRcdG8gPSB0cGwub2JzZXJ2ZShcIiouYmFyLmJhelwiLCBmdW5jdGlvbihudmFsLCBvdmFsLCBwYXRoKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChudmFsLCBcImJ1elwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBvdmFsLCBcInVuZGVmaW5lZFwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgsIFwiZm9vLmJhci5iYXpcIik7XG5cdFx0XHRcdHNlZW4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRwbC5zZXQoXCJmb28uYmFyLmJhelwiLCBcImJ1elwiKTtcblx0XHRcdGFzc2VydC5vayhzZWVuKTtcblx0XHR9KTtcblxuXHRcdGl0KFwib2JzZXJ2ZXMgZHluYW1pYyBwYXRoOiBmb28uKi5iYXpcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgc2VlbiA9IGZhbHNlO1xuXHRcdFx0byA9IHRwbC5vYnNlcnZlKFwiZm9vLiouYmF6XCIsIGZ1bmN0aW9uKG52YWwsIG92YWwsIHBhdGgpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG52YWwsIFwiYnV6XCIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIG92YWwsIFwidW5kZWZpbmVkXCIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGF0aCwgXCJmb28uYmFyLmJhelwiKTtcblx0XHRcdFx0c2VlbiA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0dHBsLnNldChcImZvby5iYXIuYmF6XCIsIFwiYnV6XCIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlZW4pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJvYnNlcnZlcyBkeW5hbWljIHBhdGg6IGZvby5iYXIuKlwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gdHBsLm9ic2VydmUoXCJmb28uYmFyLipcIiwgZnVuY3Rpb24obnZhbCwgb3ZhbCwgcGF0aCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnZhbCwgXCJidXpcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2Ygb3ZhbCwgXCJ1bmRlZmluZWRcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLCBcImZvby5iYXIuYmF6XCIpO1xuXHRcdFx0XHRzZWVuID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0cGwuc2V0KFwiZm9vLmJhci5iYXpcIiwgXCJidXpcIik7XG5cdFx0XHRhc3NlcnQub2soc2Vlbik7XG5cdFx0fSk7XG5cblx0XHRpdChcImNhbGxpbmcgZ2V0KCkgaW4gYW4gb2JzZXJ2ZXIgcmV0dXJucyB0aGUgbmV3IHZhbHVlXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIHNlZW4gPSBmYWxzZTtcblx0XHRcdG8gPSB0cGwub2JzZXJ2ZShcImZvby5iYXJcIiwgZnVuY3Rpb24obnZhbCwgb3ZhbCwgcGF0aCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcy5nZXQocGF0aCksIG52YWwpO1xuXHRcdFx0XHRzZWVuID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0cGwuc2V0KFwiZm9vLmJhclwiLCBcImJhelwiKTtcblx0XHRcdGFzc2VydC5vayhzZWVuKTtcblx0XHR9KTtcblx0fSk7XG59KTsiLCJtb2R1bGUuZXhwb3J0cz17XG5cdFwiYW1wZXJzYW5kX2VzY2FwZVwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBtZXNzYWdlOiBcXFwiU29tZSA8Y29kZT5cXFwiXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3smbWVzc2FnZX19XCIsXG5cdFx0XCJ0eHRcIjogXCJTb21lIDxjb2RlPjwvY29kZT5cIlxuXHR9LFxuXHRcImFycmF5X29mX3N0cmluZ3NcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgYXJyYXlfb2Zfc3RyaW5nczogWydoZWxsbycsICd3b3JsZCddXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjYXJyYXlfb2Zfc3RyaW5nc319e3sufX0ge3svYXJyYXlfb2Zfc3RyaW5nc319XCIsXG5cdFx0XCJ0eHRcIjogXCJoZWxsbyB3b3JsZFwiXG5cdH0sXG5cdFwiYnVnXzExX2VhdGluZ193aGl0ZXNwYWNlXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIHRhZzogXFxcInlvXFxcIlxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7dGFnfX0gZm9vXCIsXG5cdFx0XCJ0eHRcIjogXCJ5byBmb29cIlxuXHR9LFxuXHRcImNoYW5naW5nX2RlbGltaXRlcnNcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgXFxcImZvb1xcXCI6IFxcXCJmb29vb29vb29vb29vb29cXFwiLFxcbiAgXFxcImJhclxcXCI6IFxcXCI8Yj5iYXIhPC9iPlxcXCJcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7ez08JSAlPj19fTwlIGZvbyAlPiB7e2Zvb319IDwle2Jhcn0lPiB7e3tiYXJ9fX1cIixcblx0XHRcInR4dFwiOiBcImZvb29vb29vb29vb29vbyB7e2Zvb319IDxiPmJhciE8L2I+IHt7e2Jhcn19fVwiXG5cdH0sXG5cdFwiY2hlY2tfZmFsc3lcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgbnVtYmVyOiBmdW5jdGlvbih0ZXh0LCByZW5kZXIpIHtcXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHRleHQsIHJlbmRlcikge1xcbiAgICAgIHJldHVybiArcmVuZGVyKHRleHQpO1xcbiAgICB9XFxuICB9XFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwiPHA+e3sjbnVtYmVyfX0we3svbnVtYmVyfX08L3A+XCIsXG5cdFx0XCJ0eHRcIjogXCI8cD4wPC9wPlwiXG5cdH0sXG5cdFwiY29tbWVudHNcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgdGl0bGU6IGZ1bmN0aW9uICgpIHtcXG4gICAgcmV0dXJuIFxcXCJBIENvbWVkeSBvZiBFcnJvcnNcXFwiO1xcbiAgfVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcIjxoMT57e3RpdGxlfX17eyEganVzdCBzb21ldGhpbmcgaW50ZXJlc3RpbmcuLi4gb3Igbm90Li4uIH19PC9oMT5cIixcblx0XHRcInR4dFwiOiBcIjxoMT5BIENvbWVkeSBvZiBFcnJvcnM8L2gxPlwiXG5cdH0sXG5cdFwiY29tcGxleFwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBoZWFkZXI6IGZ1bmN0aW9uICgpIHtcXG4gICAgcmV0dXJuIFxcXCJDb2xvcnNcXFwiO1xcbiAgfSxcXG4gIGl0ZW06IFtcXG4gICAgICB7bmFtZTogXFxcInJlZFxcXCIsIGN1cnJlbnQ6IHRydWUsIHVybDogXFxcIiNSZWRcXFwifSxcXG4gICAgICB7bmFtZTogXFxcImdyZWVuXFxcIiwgY3VycmVudDogZmFsc2UsIHVybDogXFxcIiNHcmVlblxcXCJ9LFxcbiAgICAgIHtuYW1lOiBcXFwiYmx1ZVxcXCIsIGN1cnJlbnQ6IGZhbHNlLCB1cmw6IFxcXCIjQmx1ZVxcXCJ9XFxuICBdLFxcbiAgbGluazogZnVuY3Rpb24gKCkge1xcbiAgICByZXR1cm4gdGhpc1tcXFwiY3VycmVudFxcXCJdICE9PSB0cnVlO1xcbiAgfSxcXG4gIGxpc3Q6IGZ1bmN0aW9uICgpIHtcXG4gICAgcmV0dXJuIHRoaXMuaXRlbS5sZW5ndGggIT09IDA7XFxuICB9LFxcbiAgZW1wdHk6IGZ1bmN0aW9uICgpIHtcXG4gICAgcmV0dXJuIHRoaXMuaXRlbS5sZW5ndGggPT09IDA7XFxuICB9XFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwiPGgxPnt7aGVhZGVyfX08L2gxPlxcbnt7I2xpc3R9fVxcbiAgPHVsPlxcbiAge3sjaXRlbX19XFxuICB7eyNjdXJyZW50fX1cXG4gIDxsaT48c3Ryb25nPnt7bmFtZX19PC9zdHJvbmc+PC9saT5cXG4gIHt7L2N1cnJlbnR9fVxcbiAge3sjbGlua319XFxuICA8bGk+PGEgaHJlZj1cXFwie3t1cmx9fVxcXCI+e3tuYW1lfX08L2E+PC9saT5cXG4gIHt7L2xpbmt9fVxcbiAge3svaXRlbX19XFxuICA8L3VsPlxcbnt7L2xpc3R9fVxcbnt7I2VtcHR5fX1cXG4gIDxwPlRoZSBsaXN0IGlzIGVtcHR5LjwvcD5cXG57ey9lbXB0eX19XCIsXG5cdFx0XCJ0eHRcIjogXCI8aDE+Q29sb3JzPC9oMT5cXG4gIDx1bD5cXG4gIDxsaT48c3Ryb25nPnJlZDwvc3Ryb25nPjwvbGk+XFxuICA8bGk+PGEgaHJlZj1cXFwiI0dyZWVuXFxcIj5ncmVlbjwvYT48L2xpPlxcbiAgPGxpPjxhIGhyZWY9XFxcIiNCbHVlXFxcIj5ibHVlPC9hPjwvbGk+XFxuICA8L3VsPlwiXG5cdH0sXG5cdFwiY29udGV4dF9sb29rdXBcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgXFxcIm91dGVyXFxcIjoge1xcbiAgICBcXFwiaWRcXFwiOiAxLFxcbiAgICBcXFwic2Vjb25kXFxcIjoge1xcbiAgICAgIFxcXCJub3RoaW5nXFxcIjogMlxcbiAgICB9XFxuICB9XFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjb3V0ZXJ9fXt7I3NlY29uZH19e3tpZH19e3svc2Vjb25kfX17ey9vdXRlcn19XCIsXG5cdFx0XCJ0eHRcIjogXCIxXCJcblx0fSxcblx0XCJkZWxpbWl0ZXJzXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGZpcnN0OiBcXFwiSXQgd29ya2VkIHRoZSBmaXJzdCB0aW1lLlxcXCIsXFxuICBzZWNvbmQ6IFxcXCJBbmQgaXQgd29ya2VkIHRoZSBzZWNvbmQgdGltZS5cXFwiLFxcbiAgdGhpcmQ6IFxcXCJUaGVuLCBzdXJwcmlzaW5nbHksIGl0IHdvcmtlZCB0aGUgdGhpcmQgdGltZS5cXFwiLFxcbiAgZm91cnRoOiBcXFwiRm91cnRoIHRpbWUgYWxzbyBmaW5lIS5cXFwiXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3s9PCUgJT49fX0qXFxuPCUgZmlyc3QgJT5cXG4qIDwlIHNlY29uZCAlPlxcbjwlPXwgfD0lPlxcbiogfCB0aGlyZCB8XFxufD17eyB9fT18XFxuKiB7eyBmb3VydGggfX1cIixcblx0XHRcInR4dFwiOiBcIipcXG5JdCB3b3JrZWQgdGhlIGZpcnN0IHRpbWUuXFxuKiBBbmQgaXQgd29ya2VkIHRoZSBzZWNvbmQgdGltZS5cXG4qIFRoZW4sIHN1cnByaXNpbmdseSwgaXQgd29ya2VkIHRoZSB0aGlyZCB0aW1lLlxcbiogRm91cnRoIHRpbWUgYWxzbyBmaW5lIS5cIlxuXHR9LFxuXHRcImRpc2FwcGVhcmluZ193aGl0ZXNwYWNlXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGJlZHJvb21zOiB0cnVlLFxcbiAgdG90YWw6IDFcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyNiZWRyb29tc319e3t0b3RhbH19e3svYmVkcm9vbXN9fSBCRURcIixcblx0XHRcInR4dFwiOiBcIjEgQkVEXCJcblx0fSxcblx0XCJkb3Rfbm90YXRpb25cIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgbmFtZTogXFxcIkEgQm9va1xcXCIsXFxuICBhdXRob3JzOiBbXFxcIkpvaG4gUG93ZXJcXFwiLCBcXFwiSmFtaWUgV2Fsc2hcXFwiXSxcXG4gIHByaWNlOiB7XFxuICAgIHZhbHVlOiAyMDAsXFxuICAgIHZhdDogZnVuY3Rpb24gKCkge1xcbiAgICAgIHJldHVybiB0aGlzLnZhbHVlICogMC4yO1xcbiAgICB9LFxcbiAgICBjdXJyZW5jeToge1xcbiAgICAgIHN5bWJvbDogJyQnLFxcbiAgICAgIG5hbWU6ICdVU0QnXFxuICAgIH1cXG4gIH0sXFxuICBhdmFpbGFiaWxpdHk6IHtcXG4gICAgc3RhdHVzOiB0cnVlLFxcbiAgICB0ZXh0OiBcXFwiSW4gU3RvY2tcXFwiXFxuICB9LFxcbiAgLy8gQW5kIG5vdywgc29tZSB0cnV0aHkgZmFsc2UgdmFsdWVzXFxuICB0cnV0aHk6IHtcXG4gICAgemVybzogMCxcXG4gICAgbm90VHJ1ZTogZmFsc2VcXG4gIH1cXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCI8IS0tIGV4Y2l0aW5nIHBhcnQgLS0+XFxuPGgxPnt7bmFtZX19PC9oMT5cXG48cD5BdXRob3JzOiA8dWw+e3sjYXV0aG9yc319PGxpPnt7Ln19PC9saT57ey9hdXRob3JzfX08L3VsPjwvcD5cXG48cD5QcmljZToge3t7cHJpY2UuY3VycmVuY3kuc3ltYm9sfX19e3twcmljZS52YWx1ZX19IHt7I3ByaWNlLmN1cnJlbmN5fX17e25hbWV9fSA8Yj57e2F2YWlsYWJpbGl0eS50ZXh0fX08L2I+e3svcHJpY2UuY3VycmVuY3l9fTwvcD5cXG48cD5WQVQ6IHt7e3ByaWNlLmN1cnJlbmN5LnN5bWJvbH19fXt7I3ByaWNlfX17e3ZhdH19e3svcHJpY2V9fTwvcD5cXG48IS0tIGJvcmluZyBwYXJ0IC0tPlxcbjxoMj5UZXN0IHRydXRoeSBmYWxzZSB2YWx1ZXM6PC9oMj5cXG48cD5aZXJvOiB7e3RydXRoeS56ZXJvfX08L3A+XFxuPHA+RmFsc2U6IHt7dHJ1dGh5Lm5vdFRydWV9fTwvcD5cIixcblx0XHRcInR4dFwiOiBcIjxoMT5BIEJvb2s8L2gxPlxcbjxwPkF1dGhvcnM6IDx1bD48bGk+Sm9obiBQb3dlcjwvbGk+PGxpPkphbWllIFdhbHNoPC9saT48L3VsPjwvcD5cXG48cD5QcmljZTogJDIwMCBVU0QgPGI+SW4gU3RvY2s8L2I+PC9wPlxcbjxwPlZBVDogJDQwPC9wPlxcblxcbjxoMj5UZXN0IHRydXRoeSBmYWxzZSB2YWx1ZXM6PC9oMj5cXG48cD5aZXJvOiAwPC9wPlxcbjxwPkZhbHNlOiBmYWxzZTwvcD5cIlxuXHR9LFxuXHRcImRvdWJsZV9yZW5kZXJcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgZm9vOiB0cnVlLFxcbiAgYmFyOiBcXFwie3t3aW59fVxcXCIsXFxuICB3aW46IFxcXCJGQUlMXFxcIlxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I2Zvb319e3tiYXJ9fXt7L2Zvb319XCIsXG5cdFx0XCJ0eHRcIjogXCJ7e3dpbn19XCJcblx0fSxcblx0XCJlbXB0eV9saXN0XCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGpvYnM6IFtdXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwiVGhlc2UgYXJlIHRoZSBqb2JzOlxcbnt7I2pvYnN9fVxcbnt7Ln19XFxue3svam9ic319XCIsXG5cdFx0XCJ0eHRcIjogXCJUaGVzZSBhcmUgdGhlIGpvYnM6XCJcblx0fSxcblx0XCJlbXB0eV9zZWN0aW9uc1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7fSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjZm9vfX17ey9mb299fWZvb3t7I2Jhcn19e3svYmFyfX1cIixcblx0XHRcInR4dFwiOiBcImZvb1wiXG5cdH0sXG5cdFwiZW1wdHlfc3RyaW5nXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGRlc2NyaXB0aW9uOiBcXFwiVGhhdCBpcyBhbGwhXFxcIixcXG4gIGNoaWxkOiB7XFxuICAgIGRlc2NyaXB0aW9uOiBcXFwiXFxcIlxcbiAgfVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7ZGVzY3JpcHRpb259fXt7I2NoaWxkfX17e2Rlc2NyaXB0aW9ufX17ey9jaGlsZH19XCIsXG5cdFx0XCJ0eHRcIjogXCJUaGF0IGlzIGFsbCFcIlxuXHR9LFxuXHRcImVtcHR5X3RlbXBsYXRlXCI6IHtcblx0XHRcImpzXCI6IFwiKHt9KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCI8aHRtbD48aGVhZD48L2hlYWQ+PGJvZHk+PGgxPlRlc3Q8L2gxPjwvYm9keT48L2h0bWw+XCIsXG5cdFx0XCJ0eHRcIjogXCI8aHRtbD48aGVhZD48L2hlYWQ+PGJvZHk+PGgxPlRlc3Q8L2gxPjwvYm9keT48L2h0bWw+XCJcblx0fSxcblx0XCJlcnJvcl9ub3RfZm91bmRcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgYmFyOiAyXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3tmb299fVwiLFxuXHRcdFwidHh0XCI6IFwiXCJcblx0fSxcblx0XCJmYWxzeVwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBcXFwiZW1wdHlTdHJpbmdcXFwiOiBcXFwiXFxcIixcXG4gIFxcXCJlbXB0eUFycmF5XFxcIjogW10sXFxuICBcXFwiemVyb1xcXCI6IDAsXFxuICBcXFwibnVsbFxcXCI6IG51bGwsXFxuICBcXFwidW5kZWZpbmVkXFxcIjogdW5kZWZpbmVkLFxcbiAgXFxcIk5hTlxcXCI6IDAvMFxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I2VtcHR5U3RyaW5nfX1lbXB0eSBzdHJpbmd7ey9lbXB0eVN0cmluZ319XFxue3teZW1wdHlTdHJpbmd9fWludmVydGVkIGVtcHR5IHN0cmluZ3t7L2VtcHR5U3RyaW5nfX1cXG57eyNlbXB0eUFycmF5fX1lbXB0eSBhcnJheXt7L2VtcHR5QXJyYXl9fVxcbnt7XmVtcHR5QXJyYXl9fWludmVydGVkIGVtcHR5IGFycmF5e3svZW1wdHlBcnJheX19XFxue3sjemVyb319emVyb3t7L3plcm99fVxcbnt7Xnplcm99fWludmVydGVkIHplcm97ey96ZXJvfX1cXG57eyNudWxsfX1udWxse3svbnVsbH19XFxue3tebnVsbH19aW52ZXJ0ZWQgbnVsbHt7L251bGx9fVxcbnt7I3VuZGVmaW5lZH19dW5kZWZpbmVke3svdW5kZWZpbmVkfX1cXG57e151bmRlZmluZWR9fWludmVydGVkIHVuZGVmaW5lZHt7L3VuZGVmaW5lZH19XFxue3sjTmFOfX1OYU57ey9OYU59fVxcbnt7Xk5hTn19aW52ZXJ0ZWQgTmFOe3svTmFOfX1cIixcblx0XHRcInR4dFwiOiBcImludmVydGVkIGVtcHR5IHN0cmluZ1xcblxcbmludmVydGVkIGVtcHR5IGFycmF5XFxuXFxuaW52ZXJ0ZWQgemVyb1xcblxcbmludmVydGVkIG51bGxcXG5cXG5pbnZlcnRlZCB1bmRlZmluZWRcXG5cXG5pbnZlcnRlZCBOYU5cIlxuXHR9LFxuXHRcImdyYW5kcGFyZW50X2NvbnRleHRcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgZ3JhbmRfcGFyZW50X2lkOiAnZ3JhbmRfcGFyZW50MScsXFxuICBwYXJlbnRfY29udGV4dHM6IFtcXG4gICAge1xcbiAgICAgIHBhcmVudF9pZDogJ3BhcmVudDEnLFxcbiAgICAgIGNoaWxkX2NvbnRleHRzOiBbXFxuICAgICAgICB7IGNoaWxkX2lkOiAncGFyZW50MS1jaGlsZDEnIH0sXFxuICAgICAgICB7IGNoaWxkX2lkOiAncGFyZW50MS1jaGlsZDInIH1cXG4gICAgICBdXFxuICAgIH0sXFxuICAgIHtcXG4gICAgICBwYXJlbnRfaWQ6ICdwYXJlbnQyJyxcXG4gICAgICBjaGlsZF9jb250ZXh0czogW1xcbiAgICAgICAgeyBjaGlsZF9pZDogJ3BhcmVudDItY2hpbGQxJyB9LFxcbiAgICAgICAgeyBjaGlsZF9pZDogJ3BhcmVudDItY2hpbGQyJyB9XFxuICAgICAgXVxcbiAgICB9XFxuICBdXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3tncmFuZF9wYXJlbnRfaWR9fVxcbnt7I3BhcmVudF9jb250ZXh0c319XFxue3tncmFuZF9wYXJlbnRfaWR9fVxcbnt7cGFyZW50X2lkfX1cXG57eyNjaGlsZF9jb250ZXh0c319XFxue3tncmFuZF9wYXJlbnRfaWR9fVxcbnt7cGFyZW50X2lkfX1cXG57e2NoaWxkX2lkfX1cXG57ey9jaGlsZF9jb250ZXh0c319XFxue3svcGFyZW50X2NvbnRleHRzfX1cIixcblx0XHRcInR4dFwiOiBcImdyYW5kX3BhcmVudDFcXG5ncmFuZF9wYXJlbnQxXFxucGFyZW50MVxcbmdyYW5kX3BhcmVudDFcXG5wYXJlbnQxXFxucGFyZW50MS1jaGlsZDFcXG5ncmFuZF9wYXJlbnQxXFxucGFyZW50MVxcbnBhcmVudDEtY2hpbGQyXFxuZ3JhbmRfcGFyZW50MVxcbnBhcmVudDJcXG5ncmFuZF9wYXJlbnQxXFxucGFyZW50MlxcbnBhcmVudDItY2hpbGQxXFxuZ3JhbmRfcGFyZW50MVxcbnBhcmVudDJcXG5wYXJlbnQyLWNoaWxkMlwiXG5cdH0sXG5cdFwiaW5jbHVkZWRfdGFnXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGh0bWw6IFxcXCJJIGxpa2Uge3ttdXN0YWNoZX19XFxcIlxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcIllvdSBzYWlkIFxcXCJ7e3todG1sfX19XFxcIiB0b2RheVwiLFxuXHRcdFwidHh0XCI6IFwiWW91IHNhaWQgXFxcIkkgbGlrZSB7e211c3RhY2hlfX1cXFwiIHRvZGF5XCJcblx0fSxcblx0XCJpbnZlcnRlZF9zZWN0aW9uXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIFxcXCJyZXBvc1xcXCI6IFtdXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjcmVwb3N9fTxiPnt7bmFtZX19PC9iPnt7L3JlcG9zfX1cXG57e15yZXBvc319Tm8gcmVwb3MgOih7ey9yZXBvc319XFxue3tebm90aGlufX1IZWxsbyF7ey9ub3RoaW59fVwiLFxuXHRcdFwidHh0XCI6IFwiTm8gcmVwb3MgOihcXG5IZWxsbyFcIlxuXHR9LFxuXHRcImtleXNfd2l0aF9xdWVzdGlvbm1hcmtzXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIFxcXCJwZXJzb24/XFxcIjoge1xcbiAgICBuYW1lOiBcXFwiSm9uXFxcIlxcbiAgfVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I3BlcnNvbj99fVxcbiAgSGkge3tuYW1lfX0hXFxue3svcGVyc29uP319XCIsXG5cdFx0XCJ0eHRcIjogXCJIaSBKb24hXCJcblx0fSxcblx0XCJtYWxpY2lvdXNfdGVtcGxhdGVcIjoge1xuXHRcdFwianNcIjogXCIoe30pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7XFxcIisoZnVuY3Rpb24gKCkge3Rocm93IFxcXCJldmlsXFxcIn0pKCkrXFxcIn19XFxue3t7XFxcIisoZnVuY3Rpb24gKCkge3Rocm93IFxcXCJldmlsXFxcIn0pKCkrXFxcIn19fVxcbnt7PiBcXFwiKyhmdW5jdGlvbiAoKSB7dGhyb3cgXFxcImV2aWxcXFwifSkoKStcXFwifX1cXG57eyMgXFxcIisoZnVuY3Rpb24gKCkge3Rocm93IFxcXCJldmlsXFxcIn0pKCkrXFxcIn19XFxue3svIFxcXCIrKGZ1bmN0aW9uICgpIHt0aHJvdyBcXFwiZXZpbFxcXCJ9KSgpK1xcXCJ9fVwiLFxuXHRcdFwidHh0XCI6IFwiXCJcblx0fSxcblx0XCJtdWx0aWxpbmVfY29tbWVudFwiOiB7XG5cdFx0XCJqc1wiOiBcIih7fSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3shXFxuXFxuVGhpcyBpcyBhIG11bHRpLWxpbmUgY29tbWVudC5cXG5cXG59fVxcbkhlbGxvIHdvcmxkIVwiLFxuXHRcdFwidHh0XCI6IFwiSGVsbG8gd29ybGQhXCJcblx0fSxcblx0XCJuZXN0ZWRfZG90XCI6IHtcblx0XHRcImpzXCI6IFwiKHsgbmFtZTogJ0JydW5vJyB9KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyNuYW1lfX1IZWxsbyB7ey59fXt7L25hbWV9fVwiLFxuXHRcdFwidHh0XCI6IFwiSGVsbG8gQnJ1bm9cIlxuXHR9LFxuXHRcIm5lc3RlZF9pdGVyYXRpbmdcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgaW5uZXI6IFt7XFxuICAgIGZvbzogJ2ZvbycsXFxuICAgIGlubmVyOiBbe1xcbiAgICAgIGJhcjogJ2JhcidcXG4gICAgfV1cXG4gIH1dXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjaW5uZXJ9fXt7Zm9vfX17eyNpbm5lcn19e3tiYXJ9fXt7L2lubmVyfX17ey9pbm5lcn19XCIsXG5cdFx0XCJ0eHRcIjogXCJmb29iYXJcIlxuXHR9LFxuXHRcIm5lc3RpbmdcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgZm9vOiBbXFxuICAgIHthOiB7YjogMX19LFxcbiAgICB7YToge2I6IDJ9fSxcXG4gICAge2E6IHtiOiAzfX1cXG4gIF1cXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyNmb299fVxcbiAge3sjYX19XFxuICAgIHt7Yn19XFxuICB7ey9hfX1cXG57ey9mb299fVwiLFxuXHRcdFwidHh0XCI6IFwiMVxcbiAgICAyXFxuICAgIDNcIlxuXHR9LFxuXHRcIm5lc3Rpbmdfc2FtZV9uYW1lXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGl0ZW1zOiBbXFxuICAgIHtcXG4gICAgICBuYW1lOiAnbmFtZScsXFxuICAgICAgaXRlbXM6IFsxLCAyLCAzLCA0XVxcbiAgICB9XFxuICBdXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjaXRlbXN9fXt7bmFtZX19e3sjaXRlbXN9fXt7Ln19e3svaXRlbXN9fXt7L2l0ZW1zfX1cIixcblx0XHRcInR4dFwiOiBcIm5hbWUxMjM0XCJcblx0fSxcblx0XCJudWxsX3N0cmluZ1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBuYW1lOiBcXFwiRWxpc2VcXFwiLFxcbiAgZ2x5dGNoOiB0cnVlLFxcbiAgYmluYXJ5OiBmYWxzZSxcXG4gIHZhbHVlOiBudWxsLFxcbiAgdW5kZWY6IHVuZGVmaW5lZCxcXG4gIG51bWVyaWM6IGZ1bmN0aW9uKCkge1xcbiAgICByZXR1cm4gTmFOO1xcbiAgfVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcIkhlbGxvIHt7bmFtZX19XFxuZ2x5dGNoIHt7Z2x5dGNofX1cXG5iaW5hcnkge3tiaW5hcnl9fVxcbnZhbHVlIHt7dmFsdWV9fVxcbnVuZGVmIHt7dW5kZWZ9fVxcbm51bWVyaWMge3tudW1lcmljfX1cIixcblx0XHRcInR4dFwiOiBcIkhlbGxvIEVsaXNlXFxuZ2x5dGNoIHRydWVcXG5iaW5hcnkgZmFsc2VcXG52YWx1ZSBcXG51bmRlZiBcXG5udW1lcmljIE5hTlwiXG5cdH0sXG5cdFwibnVsbF92aWV3XCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIG5hbWU6ICdKb2UnLFxcbiAgZnJpZW5kczogbnVsbFxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7bmFtZX19J3MgZnJpZW5kczoge3sjZnJpZW5kc319e3tuYW1lfX0sIHt7L2ZyaWVuZHN9fVwiLFxuXHRcdFwidHh0XCI6IFwiSm9lJ3MgZnJpZW5kczpcIlxuXHR9LFxuXHRcInBhcnRpYWxfZW1wdHlcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgZm9vOiAxXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwiaGV5IHt7Zm9vfX1cXG57ez5wYXJ0aWFsfX1cIixcblx0XHRcInBhcnRpYWxcIjogXCJcIixcblx0XHRcInR4dFwiOiBcImhleSAxXCJcblx0fSxcblx0XCJyZWN1cnNpb25fd2l0aF9zYW1lX25hbWVzXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIG5hbWU6ICduYW1lJyxcXG4gIGRlc2NyaXB0aW9uOiAnZGVzYycsXFxuICB0ZXJtczogW1xcbiAgICB7bmFtZTogJ3QxJywgaW5kZXg6IDB9LFxcbiAgICB7bmFtZTogJ3QyJywgaW5kZXg6IDF9XFxuICBdXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sgbmFtZSB9fVxcbnt7IGRlc2NyaXB0aW9uIH19XFxuXFxue3sjdGVybXN9fVxcbiAge3tuYW1lfX1cXG4gIHt7aW5kZXh9fVxcbnt7L3Rlcm1zfX1cIixcblx0XHRcInR4dFwiOiBcIm5hbWVcXG5kZXNjXFxuXFxuICB0MVxcbiAgMFxcbiAgdDJcXG4gIDFcIlxuXHR9LFxuXHRcInJldXNlX29mX2VudW1lcmFibGVzXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIHRlcm1zOiBbXFxuICAgIHtuYW1lOiAndDEnLCBpbmRleDogMH0sXFxuICAgIHtuYW1lOiAndDInLCBpbmRleDogMX1cXG4gIF1cXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyN0ZXJtc319XFxuICB7e25hbWV9fVxcbiAge3tpbmRleH19XFxue3svdGVybXN9fVxcbnt7I3Rlcm1zfX1cXG4gIHt7bmFtZX19XFxuICB7e2luZGV4fX1cXG57ey90ZXJtc319XCIsXG5cdFx0XCJ0eHRcIjogXCJ0MVxcbiAgMFxcbiAgdDJcXG4gIDFcXG4gIHQxXFxuICAwXFxuICB0MlxcbiAgMVwiXG5cdH0sXG5cdFwic2VjdGlvbl9hc19jb250ZXh0XCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGFfb2JqZWN0OiB7XFxuICAgIHRpdGxlOiAndGhpcyBpcyBhbiBvYmplY3QnLFxcbiAgICBkZXNjcmlwdGlvbjogJ29uZSBvZiBpdHMgYXR0cmlidXRlcyBpcyBhIGxpc3QnLFxcbiAgICBhX2xpc3Q6IFtcXG4gICAgICB7bGFiZWw6ICdsaXN0aXRlbTEnfSxcXG4gICAgICB7bGFiZWw6ICdsaXN0aXRlbTInfVxcbiAgICBdXFxuICB9XFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjYV9vYmplY3R9fVxcbiAgPGgxPnt7dGl0bGV9fTwvaDE+XFxuICA8cD57e2Rlc2NyaXB0aW9ufX08L3A+XFxuICA8dWw+XFxuICAgIHt7I2FfbGlzdH19XFxuICAgIDxsaT57e2xhYmVsfX08L2xpPlxcbiAgICB7ey9hX2xpc3R9fVxcbiAgPC91bD5cXG57ey9hX29iamVjdH19XCIsXG5cdFx0XCJ0eHRcIjogXCI8aDE+dGhpcyBpcyBhbiBvYmplY3Q8L2gxPlxcbiAgPHA+b25lIG9mIGl0cyBhdHRyaWJ1dGVzIGlzIGEgbGlzdDwvcD5cXG4gIDx1bD5cXG4gICAgPGxpPmxpc3RpdGVtMTwvbGk+XFxuICAgIDxsaT5saXN0aXRlbTI8L2xpPlxcbiAgPC91bD5cIlxuXHR9LFxuXHRcInNpbXBsZVwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBuYW1lOiBcXFwiQ2hyaXNcXFwiLFxcbiAgdmFsdWU6IDEwMDAwLFxcbiAgdGF4ZWRfdmFsdWU6IGZ1bmN0aW9uICh0cGwsIGN0eCkge1xcbiAgXFx0dmFyIHZhbCA9IHRwbC5nZXQoXFxcInZhbHVlXFxcIik7XFxuICAgIHJldHVybiB2YWwgLSAodmFsICogMC40KTtcXG4gIH0sXFxuICBpbl9jYTogdHJ1ZVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcIkhlbGxvIHt7bmFtZX19XFxuWW91IGhhdmUganVzdCB3b24gJHt7dmFsdWV9fSFcXG57eyNpbl9jYX19XFxuV2VsbCwgJHt7IHRheGVkX3ZhbHVlIH19LCBhZnRlciB0YXhlcy5cXG57ey9pbl9jYX19XCIsXG5cdFx0XCJ0eHRcIjogXCJIZWxsbyBDaHJpc1xcbllvdSBoYXZlIGp1c3Qgd29uICQxMDAwMCFcXG5XZWxsLCAkNjAwMCwgYWZ0ZXIgdGF4ZXMuXCJcblx0fSxcblx0XCJzdHJpbmdfYXNfY29udGV4dFwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBhX3N0cmluZzogJ2FhJyxcXG4gIGFfbGlzdDogWydhJywnYicsJ2MnXVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcIjx1bD5cXG57eyNhX2xpc3R9fVxcbiAgPGxpPnt7YV9zdHJpbmd9fS97ey59fTwvbGk+XFxue3svYV9saXN0fX1cXG48L3VsPlwiLFxuXHRcdFwidHh0XCI6IFwiPHVsPlxcbiAgPGxpPmFhL2E8L2xpPlxcbiAgPGxpPmFhL2I8L2xpPlxcbiAgPGxpPmFhL2M8L2xpPlxcbjwvdWw+XCJcblx0fSxcblx0XCJ0d29faW5fYV9yb3dcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgbmFtZTogXFxcIkpvZVxcXCIsXFxuICBncmVldGluZzogXFxcIldlbGNvbWVcXFwiXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3tncmVldGluZ319LCB7e25hbWV9fSFcIixcblx0XHRcInR4dFwiOiBcIldlbGNvbWUsIEpvZSFcIlxuXHR9LFxuXHRcInR3b19zZWN0aW9uc1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7fSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjZm9vfX1cXG57ey9mb299fVxcbnt7I2Jhcn19XFxue3svYmFyfX1cIixcblx0XHRcInR4dFwiOiBcIlwiXG5cdH0sXG5cdFwid2hpdGVzcGFjZVwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICB0YWcxOiBcXFwiSGVsbG9cXFwiLFxcbiAgdGFnMjogXFxcIldvcmxkXFxcIlxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7dGFnMX19XFxuXFxuXFxue3t0YWcyfX0uXCIsXG5cdFx0XCJ0eHRcIjogXCJIZWxsb1xcblxcblxcbldvcmxkLlwiXG5cdH0sXG5cdFwiemVyb192aWV3XCI6IHtcblx0XHRcImpzXCI6IFwiKHsgbnVtczogWzAsIDEsIDJdIH0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I251bXN9fXt7Ln19LHt7L251bXN9fVwiLFxuXHRcdFwidHh0XCI6IFwiMCwxLDIsXCJcblx0fVxufSIsInZhciBhc3NlcnQgPSByZXF1aXJlKFwiYXNzZXJ0XCIpLFxuXHRwYXJzZSA9IHJlcXVpcmUoXCIuLi9saWIvcGFyc2VcIiksXG5cdGluc3BlY3QgPSByZXF1aXJlKCd1dGlsJykuaW5zcGVjdDtcblxuZGVzY3JpYmUoXCIjcGFyc2UoKVwiLCBmdW5jdGlvbigpIHtcblxuXHRpdChcInBhcnNlcyBiYXNpYyBodG1sXCIsIGZ1bmN0aW9uKCkge1xuXHRcdHZhciB0ZW1wbGF0ZSA9IHBhcnNlKFwiPGRpdiBjbGFzcz1cXFwiY29udGFpbmVyXFxcIj5IZWxsbyBXb3JsZDwvZGl2PlwiKTtcblx0XHRcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHRlbXBsYXRlLCBbe1xuXHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLkVMRU1FTlQsXG5cdFx0XHRuYW1lOiBcImRpdlwiLFxuXHRcdFx0YXR0cmlidXRlczogW3tcblx0XHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLkFUVFJJQlVURSxcblx0XHRcdFx0bmFtZTogXCJjbGFzc1wiLFxuXHRcdFx0XHRjaGlsZHJlbjogW3tcblx0XHRcdFx0XHR0eXBlOiBwYXJzZS5OT0RFX1RZUEUuVEVYVCxcblx0XHRcdFx0XHR2YWx1ZTogXCJjb250YWluZXJcIlxuXHRcdFx0XHR9XVxuXHRcdFx0fV0sXG5cdFx0XHRjaGlsZHJlbjogW3tcblx0XHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLlRFWFQsXG5cdFx0XHRcdHZhbHVlOiBcIkhlbGxvIFdvcmxkXCJcblx0XHRcdH1dXG5cdFx0fV0pO1xuXHR9KTtcblxuXHRpdChcInBhcnNlcyBtdXN0YWNoZSB2YXJpYWJsZXNcIiwgZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHRlbXBsYXRlID0gcGFyc2UoXCJ7eyBoZWxsbyB9fXt7eyB3b3JsZCB9fX17eyYgdW5lc2NhcGVkIH19XCIpO1xuXHRcdC8vIGNvbnNvbGUubG9nKGluc3BlY3QodGVtcGxhdGUpKTtcblx0XHRcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHRlbXBsYXRlLCBbe1xuXHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLklOVEVSUE9MQVRPUixcblx0XHRcdHZhbHVlOiBcImhlbGxvXCJcblx0XHR9LHtcblx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5UUklQTEUsXG5cdFx0XHR2YWx1ZTogXCJ3b3JsZFwiXG5cdFx0fSx7XG5cdFx0XHR0eXBlOiBwYXJzZS5OT0RFX1RZUEUuVFJJUExFLFxuXHRcdFx0dmFsdWU6IFwidW5lc2NhcGVkXCJcblx0XHR9XSk7XG5cdH0pO1xuXG5cdGl0KFwicGFyc2VzIG11c3RhY2hlIHNlY3Rpb25zXCIsIGZ1bmN0aW9uKCkge1xuXHRcdHZhciB0ZW1wbGF0ZSA9IHBhcnNlKFwie3sjZ29vZH19SGVsbG97ey9nb29kfX17e15iYWR9fVdvcmxke3svYmFkfX1cIik7XG5cdFx0XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbCh0ZW1wbGF0ZSwgW3tcblx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5TRUNUSU9OLFxuXHRcdFx0dmFsdWU6IFwiZ29vZFwiLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5URVhULFxuXHRcdFx0XHR2YWx1ZTogXCJIZWxsb1wiXG5cdFx0XHR9XVxuXHRcdH0se1xuXHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLklOVkVSVEVELFxuXHRcdFx0dmFsdWU6IFwiYmFkXCIsXG5cdFx0XHRjaGlsZHJlbjogW3tcblx0XHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLlRFWFQsXG5cdFx0XHRcdHZhbHVlOiBcIldvcmxkXCJcblx0XHRcdH1dXG5cdFx0fV0pO1xuXHR9KTtcblxuXHRpdChcInBhcnNlcyBtdXN0YWNoZSBwYXJ0aWFsc1wiLCBmdW5jdGlvbigpIHtcblx0XHR2YXIgdGVtcGxhdGUgPSBwYXJzZShcInt7PnBhcnRpYWx9fVwiKTtcblx0XHRcblx0XHRhc3NlcnQuZGVlcEVxdWFsKHRlbXBsYXRlLCBbe1xuXHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLlBBUlRJQUwsXG5cdFx0XHR2YWx1ZTogXCJwYXJ0aWFsXCJcblx0XHR9XSk7XG5cdH0pO1xuXG5cdGl0KFwicGFyc2VzIGRlZXBseVwiLCBmdW5jdGlvbigpIHtcblx0XHR2YXIgdGVtcGxhdGUgPSBwYXJzZShcIjxkaXY+e3sgdmFyIH19PC9kaXY+XCIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBFcXVhbCh0ZW1wbGF0ZSwgW3tcblx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5FTEVNRU5ULFxuXHRcdFx0bmFtZTogXCJkaXZcIixcblx0XHRcdGF0dHJpYnV0ZXM6IFtdLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5JTlRFUlBPTEFUT1IsXG5cdFx0XHRcdHZhbHVlOiBcInZhclwiXG5cdFx0XHR9XVxuXHRcdH1dKTtcblx0fSk7XG5cbn0pOyIsInZhciBzcGVjID0gcmVxdWlyZShcIi4vbXVzdGFjaGUuanNvblwiKSxcblx0YXNzZXJ0ID0gcmVxdWlyZShcImFzc2VydFwiKTtcblxuZGVzY3JpYmUoJ0RPTSBSZW5kZXJpbmcnLCBmdW5jdGlvbiAoKSB7XG5cdGRlc2NyaWJlKCdNdXN0YWNoZSBUZXN0IFN1aXRlJywgZnVuY3Rpb24gKCkge1xuXHRcdGZ1bmN0aW9uIGdldENvbnRlbnRzKHRlc3ROYW1lLCBleHQpIHtcblx0XHRcdHJldHVybiBzcGVjW3Rlc3ROYW1lXVtleHRdO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldFZpZXcodGVzdE5hbWUpIHtcblx0XHRcdHZhciB2aWV3ID0gZ2V0Q29udGVudHModGVzdE5hbWUsICdqcycpO1xuXHRcdFx0aWYgKCF2aWV3KSB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBmaW5kIHZpZXcgZm9yIHRlc3QgXCInICsgdGVzdE5hbWUgKyAnXCInKTtcblx0XHRcdHJldHVybiBldmFsKHZpZXcpO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldFBhcnRpYWwodGVzdE5hbWUpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBnZXRDb250ZW50cyh0ZXN0TmFtZSwgJ3BhcnRpYWwnKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIE5vIGJpZyBkZWFsLiBOb3QgYWxsIHRlc3RzIG5lZWQgdG8gdGVzdCBwYXJ0aWFsIHN1cHBvcnQuXG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0VGVzdCh0ZXN0TmFtZSkge1xuXHRcdFx0dmFyIHRlc3QgPSB7fTtcblx0XHRcdHRlc3QubmFtZSA9IHRlc3ROYW1lO1xuXHRcdFx0dGVzdC52aWV3ID0gZ2V0Vmlldyh0ZXN0TmFtZSk7XG5cdFx0XHR0ZXN0LnRlbXBsYXRlID0gZ2V0Q29udGVudHModGVzdE5hbWUsICdtdXN0YWNoZScpO1xuXHRcdFx0dGVzdC5wYXJ0aWFsID0gZ2V0UGFydGlhbCh0ZXN0TmFtZSk7XG5cdFx0XHR0ZXN0LmV4cGVjdCA9IGdldENvbnRlbnRzKHRlc3ROYW1lLCAndHh0Jyk7XG5cdFx0XHRyZXR1cm4gdGVzdDtcblx0XHR9XG5cblx0XHR0ZXN0TmFtZXMgPSBPYmplY3Qua2V5cyhzcGVjKS5maWx0ZXIoZnVuY3Rpb24gKG5hbWUpIHtcblx0XHRcdHJldHVybiBzcGVjW25hbWVdLmpzICE9IG51bGw7XG5cdFx0fSk7XG5cblx0XHR0ZXN0TmFtZXMuZm9yRWFjaChmdW5jdGlvbiAodGVzdE5hbWUpIHtcblx0XHRcdHZhciB0ZXN0ID0gZ2V0VGVzdCh0ZXN0TmFtZSk7XG5cblx0XHRcdHZhciBmbiA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHR2YXIgdHBsO1xuXG5cdFx0XHRcdGlmICh0ZXN0LnBhcnRpYWwpIHtcblx0XHRcdFx0XHRhc3NlcnQudGhyb3coXCJPb3BzISBwYXJ0aWFsIVwiKTtcblx0XHRcdFx0XHQvLyBvdXRwdXQgPSBNdXN0YWNoZS5yZW5kZXIodGVzdC50ZW1wbGF0ZSwgdGVzdC52aWV3LCB7IHBhcnRpYWw6IHRlc3QucGFydGlhbCB9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0cGwgPSBuZXcgVGVtcGxlKHtcblx0XHRcdFx0XHRcdGRhdGE6IHRlc3Qudmlldyxcblx0XHRcdFx0XHRcdHRlbXBsYXRlOiB0ZXN0LnRlbXBsYXRlXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3NlcnQuZXF1YWwodHBsLnRvSFRNTCgpLCB0ZXN0LmV4cGVjdCk7XG5cdFx0XHR9XG5cblx0XHRcdGZuLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHJldHVybiAgdGVzdC50ZW1wbGF0ZSArIFwiXFxuPT09PVxcblwiICtcblx0XHRcdFx0XHRnZXRDb250ZW50cyh0ZXN0Lm5hbWUsIFwianNcIikgKyBcIlxcbj09PT1cXG5cIiArXG5cdFx0XHRcdFx0dGVzdC5leHBlY3QgKyBcIlxcblwiO1xuXHRcdFx0fVxuXG5cdFx0XHRpdChcImtub3dzIGhvdyB0byByZW5kZXIgJ1wiICsgdGVzdE5hbWUuc3BsaXQoXCJfXCIpLmpvaW4oXCIgXCIpICsgXCInXCIsIGZuKTtcblx0XHR9KTtcblx0fSk7XG59KTsiXX0=
