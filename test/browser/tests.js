(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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
},{}],2:[function(require,module,exports){
var parse = require("./parse"),
	util = require("./util"),
	_ = require("underscore"),
	NODE_TYPE = parse.NODE_TYPE;

exports.setTemplate = function(template) {
	if (_.isString(template)) template = parse(template);
	this._template = template;
	return this;
}

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
	this.nodes = this._buildElements(this._template);
	this._rendered = true;
	this.emit("render", this.nodes);
	return this;
}

exports._buildElements = function(tree, ctx) {
	if (ctx == null) ctx = this.scope();

	return tree.map(function(node) {
		var build = _build.element[node.type];
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
		var build = _build.attribute[node.type];
		if (build != null) return build.call(this, node, ctx);
		console.log(node);
	}, this).join("");
}

var _build = {
	element: {},
	attribute: {}
}

_build.element[ NODE_TYPE.ELEMENT ] = function(node, ctx) {
	var el = document.createElement(node.name);
	
	node.attributes.forEach(function(attr) {
		el.setAttribute(attr.name, this._buildAttribute(attr.children, ctx));
	}, this);

	this._buildElements(node.children, ctx).forEach(function(child) {
		el.appendChild(child);
	});

	return el;
}

_build.element[ NODE_TYPE.TEXT ] = function(node, ctx) {
	return document.createTextNode(node.value);
}

_build.element[ NODE_TYPE.INTERPOLATOR ] = function(node, ctx) {
	var val = ctx.get(node.value);
	return document.createTextNode(val == null ? "" : val);
}

_build.element[ NODE_TYPE.TRIPLE ] = function(node, ctx) {
	var val = ctx.get(node.value),
		div = document.createElement("div"),
		children = [], i;

	div.innerHTML = val == null ? "" : val;

	for (i = 0; i < div.childNodes.length; i++) {
		children.push(div.childNodes[i]);
	}

	return children;
}

_build.element[ NODE_TYPE.SECTION ] = function(node, ctx) {
	var self = this, els = [];

	processSection(ctx, node.value, function(nctx) {
		els.push(self._buildElements(node.children, nctx));
	});

	return els;
}

_build.element[ NODE_TYPE.INVERTED ] = function(node, ctx) {
	if (isEmptySection(ctx.get(node.value)))
		return this._buildElements(node.children, ctx);
}

_build.attribute[ NODE_TYPE.TEXT ] = function(node, ctx) {
	return node.value;
}

_build.attribute[ NODE_TYPE.INTERPOLATOR ] = function(node, ctx) {
	var val = ctx.get(node.value);
	return val != null ? _.escape(val) : "";
}

_build.attribute[ NODE_TYPE.SECTION ] = function(node, ctx) {
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
},{"./parse":3,"./util":8,"underscore":20}],3:[function(require,module,exports){
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
},{"./types":4,"./xml":5,"hogan.js":18}],4:[function(require,module,exports){
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
},{}],5:[function(require,module,exports){

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
},{}],6:[function(require,module,exports){
var Temple = require("./temple"),
	_ = require("underscore"),
	util = require("./util"),
	Deps = require("./deps"),
	EventEmitter = require("events").EventEmitter;

var Scope =
module.exports = util.subclass(EventEmitter, {

	constructor: function(val, parent) {
		EventEmitter.call(this);
		
		this.value = val;
		this.parent = null;
		this.closed = false;
		this.hidden = {};
		this._deps = {};
		
		if (parent != null) this.attach(parent); 
	},

	_attach: function(parent) {
		if (!(parent instanceof Scope))
			throw new Error("Expecting scope to attach to.");

		this._detach();
		this.parent = parent;
		parent.on("close", this._parentEvent = this._detach.bind(this));

		return this;
	},

	_detach: function() {
		if (this.parent != null) {
			this.parent.removeListener("close", this._parentEvent);
			this.parent = null;
		}

		return this;
	},

	spawn: function(scope) {
		if (!(scope instanceof Scope))
			scope = new Scope(scope);
		
		scope._attach(this);
		return scope;
	},

	close: function() {
		this.closed = true;
		this.emit("close");
		return this;
	},

	get: function(parts) {
		var ctx, val;
		
		if (_.isString(parts)) parts = util.splitPath(parts);
		if (!_.isArray(parts)) parts = [];

		// don't traverse parents if specified
		if (parts[0] === "this" || parts[0] === "") {
			val = this._find(parts.slice(1));
		} else {
			ctx = this;

			while (ctx != null) {
				val = ctx._find(parts, this);
				if (val != null) break;
				ctx = ctx.parent;
			}
		}

		if (Deps.active) this.depend(parts);
		return val;
	},

	_find: function(parts, ctx) {
		if (_.isString(parts)) parts = util.splitPath(parts);
		if (!_.isArray(parts)) parts = [];
		var val = this._get(this.value, parts, ctx);
		if (val == null) val = this._get(this.hidden, parts, ctx);
		return val;
	},

	_get: function(obj, parts, ctx) {
		parts = !_.isArray(parts) ? [] : parts.slice(0);

		while (parts.length) {
			if (obj == null) return;
			obj = obj[parts.shift()];
		}

		if (typeof obj === "function") {
			if (ctx == null) ctx = this;
			obj = obj.call(ctx, ctx);
		}

		return obj;
	},

	depend: function(path) {
		if (_.isString(path)) path = util.splitPath(path);
		path = util.joinPath(path);
		var dep = this._deps[path];

		// create if doesn't exist
		if (dep == null) {
			dep = this._deps[path] = new Deps.Dependency;
			dep._observer = this.observe(path, function() { dep.changed(); });
		}

		dep.depend();
		return this;
	},

	set: function(key, val) {
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

		this.value = this._set(this.value, mixin, changes = []);
		
		changes.forEach(function(args) {
			this.emit.apply(this, ["change"].concat(args));
		}, this);

		return this;
	},

	_set: function(base, mixin, changes, keys) {
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
	},

	unset: function(parts) {
		var initial, data, oldval, last;

		parts = _.isString(parts) ? util.splitPath(parts) : parts != null ? parts : [];

		if (!parts.length) {
			oldval = this.value;
			delete this.value;
		} else {
			initial = _.initial(parts);
			data = this.value;

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

		if (oldval != null) this.emit("change", parts, void 0, oldval);

		return this;
	},

	observe: function(path, fn) {
		if (!_.isFunction(fn)) throw new Error("Expecting a function.");

		var matchParts = _.isArray(path) ? path : util.parsePath(path),
			self = this;

		this.on("change", onChange);

		return {
			parts: matchParts,
			stop: function() {
				self.removeListener("change", onChange);
			}
		};

		function onChange(keys, newval, oldval) {
			var parts, part, base, paths;

			// clone parts so we don't affect the original
			parts = matchParts.slice(0);
			
			// traverse through cparts
			// a mismatch means we don't need to be here
			for (var i = 0; i < keys.length; i++) {
				part = parts.shift();
				if (_.isRegExp(part) && part.test(keys[i])) continue;
				if (part === "**") {
					console.log("star star!");
					return;
				}
				if (part !== keys[i]) return;
			}

			paths = [];
			base = util.joinPath(keys);

			// generate a list of effected paths
			generatePaths(newval, parts, paths);
			generatePaths(oldval, parts, paths);
			paths = _.unique(paths);

			// fire the callback on each path that changed
			paths.forEach(function(keys) {
				var nval = self._get(newval, keys),
					oval = self._get(oldval, keys);

				if (nval !== oval) {
					fn.call(self, nval, oval, util.joinPath(base, keys));
				}
			});
		}
	}

});

// recursively search obj of all paths that match parts
function generatePaths(obj, parts, paths, base) {
	if (paths == null) paths = [];
	if (base == null) base = [];

	if (!parts.length) {
		paths.push(base);
		return paths;
	}

	if (obj == null) return paths;

	var part = parts[0],
		rest = parts.slice(1);

	if (_.isRegExp(part)) {
		for (var k in obj) {
			if (part.test(k)) generatePaths(obj[k], rest, paths, base.concat(k));
		}
	} else if (part === "**") {
		console.log("star star!");
	} else {
		generatePaths(obj[part], rest, paths, base.concat(part));
	}

	return paths;
}
},{"./deps":1,"./temple":7,"./util":8,"events":12,"underscore":20}],7:[function(require,module,exports){
var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util");

// base prototype
var proto = {

	constructor: function(template, scope) {
		if (!(this instanceof Temple))
			return new (this.prototype.constructor)(template, scope);
		
		EventEmitter.call(this);
		this._deps = {};
		this._observers = [];
		this.scope(scope || {});

		template = template || this.template;
		if (template != null) this.setTemplate(template);
	},

	initialize: function() {},

	use: function(fn) {
		var args = _.toArray(arguments).slice(1);
		args.unshift(this);
		fn.apply(this, args);
		return this;
	},

	autorun: function(fn) {
		return Temple.Deps.autorun(fn.bind(this));
	},

	scope: function(scope) {
		if (scope == null) return this._scope;

		if (!(scope instanceof Temple.Scope))
			scope = new Temple.Scope(scope, this._scope);

		// This is particularly weak. Only the first scope passed
		// is useful, after that passing in scope objects just
		// replaces the whole tree.
		this._scope = scope;
		return this;
	},

	get: function(path) { return this._scope.get(path); },
	depend: function(path) { return this._scope.depend(path); },
	set: function(path, val) { return this._scope.set(path, val); },
	unset: function(path) { return this._scope.unset(path); },
	observe: function(path, fn) { return this._scope.observe(path, fn); }

};

// core methods
var core = [
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
Temple.Deps = require("./deps");
Temple.Scope = require("./scope");
},{"./deps":1,"./dom":2,"./parse":3,"./scope":6,"./util":8,"events":12,"underscore":20}],8:[function(require,module,exports){
var _ = require("underscore");

var isGenericObject =
exports.isGenericObject = function(obj) {
	return obj != null && obj.__proto__ === Object.prototype;
}

var splitPath =
exports.splitPath = function(path) {
	var parts = typeof path !== "string" ? [] : path.split(".");
	if (parts[0] === "") parts[0] = "this";
	return _.compact(parts);
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
},{"underscore":20}],9:[function(require,module,exports){
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

},{"util/":11}],10:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],11:[function(require,module,exports){
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
},{"./support/isBuffer":10,"/Users/Tyler/Dropbox/Clients/TJCrap/Dev/temple/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":14,"inherits":13}],12:[function(require,module,exports){
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

},{}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
module.exports=require(10)
},{}],16:[function(require,module,exports){
module.exports=require(11)
},{"./support/isBuffer":15,"/Users/Tyler/Dropbox/Clients/TJCrap/Dev/temple/node_modules/browserify/node_modules/insert-module-globals/node_modules/process/browser.js":14,"inherits":13}],17:[function(require,module,exports){
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

},{}],18:[function(require,module,exports){
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
},{"./compiler":17,"./template":19}],19:[function(require,module,exports){
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


},{}],20:[function(require,module,exports){
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

},{}],21:[function(require,module,exports){
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
},{"assert":9}],22:[function(require,module,exports){
(function (global){

global.Temple = require("../lib/temple");

mocha.setup('bdd');

describe("Temple", function() {
	require("./class");
	require("./parse");
});

describe("new Temple()", function() {
	require("./scope");
	require("./reactive");
	require("./render");
});

mocha.run();
}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../lib/temple":7,"./class":21,"./parse":24,"./reactive":25,"./render":26,"./scope":27}],23:[function(require,module,exports){
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
		"js": "({\n  header: function () {\n    return \"Colors\";\n  },\n  item: [\n      {name: \"red\", current: true, url: \"#Red\"},\n      {name: \"green\", current: false, url: \"#Green\"},\n      {name: \"blue\", current: false, url: \"#Blue\"}\n  ],\n  link: function () {\n    return this.get(\"current\") !== true;\n  },\n  list: function () {\n    return this.get(\"item.length\") !== 0;\n  },\n  empty: function () {\n    return this.get(\"item.length\") === 0;\n  }\n})",
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
		"js": "({\n  name: \"A Book\",\n  authors: [\"John Power\", \"Jamie Walsh\"],\n  price: {\n    value: 200,\n    vat: function () {\n      return this.get(\"value\") * 0.2;\n    },\n    currency: {\n      symbol: '$',\n      name: 'USD'\n    }\n  },\n  availability: {\n    status: true,\n    text: \"In Stock\"\n  },\n  // And now, some truthy false values\n  truthy: {\n    zero: 0,\n    notTrue: false\n  }\n})",
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
},{}],24:[function(require,module,exports){
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
},{"../lib/parse":3,"assert":9,"util":16}],25:[function(require,module,exports){
var assert = require("assert");

describe("Reactivity", function() {
	var tpl;

	before(function() {
		tpl = new Temple();
	});

	beforeEach(function() {
		tpl.set("foo", "bar");
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
			this.timeout(500);
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
});
},{"assert":9}],26:[function(require,module,exports){
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
					tpl = new Temple(test.template, test.view);
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
},{"./mustache.json":23,"assert":9}],27:[function(require,module,exports){
var assert = require("assert");

describe("Scope", function() {
	var scope;

	before(function() {
		scope = new Temple.Scope();
	});

	beforeEach(function() {
		scope.set("foo", "bar");
	});

	describe("#get() & #set()", function() {
		it("sets data on construction", function() {
			var scope = new Temple(null, { foo: "bar" });
			assert.deepEqual(scope.get(), { foo: "bar" });
		});

		it("returns `scope.value` on null or empty path", function() {
			assert.strictEqual(scope.get(), scope.value);
		});

		it("gets & sets shallow path", function() {
			scope.set("foo", { bar: "baz" });
			assert.deepEqual(scope.get("foo"), { bar: "baz" });
		});

		it("gets & sets deep path", function() {
			scope.set("foo.bar", "baz");
			assert.equal(scope.get("foo.bar"), "baz");
		});

		it("get(path) executes function value iff value at path is function", function() {
			scope.set("foo", function() {
				assert.strictEqual(this, scope);
				return true;
			});

			assert.strictEqual(scope.get("foo"), true);
		});

		it("deep copies generic objects on set", function() {
			var data = { bar: { baz: "buz" } };
			scope.set("foo", data);
			assert.deepEqual(scope.get("foo"), data);
			assert.notStrictEqual(scope.get("foo"), data);
			assert.notStrictEqual(scope.get("foo.bar"), data.foo);
		});

		it("directly points to non-generic objects on set", function() {
			var data = [];
			scope.set("foo", data);
			assert.strictEqual(scope.get("foo"), data);
		});

		it("unsets", function() {
			scope.unset("foo");
			assert.strictEqual(typeof scope.get("foo"), "undefined");
		});

		it("only unsets deeply on generic objects", function() {
			scope.set("foo", [ 0, 1, 2 ]);
			assert.equal(scope.get("foo.length"), 3);
			scope.unset("foo.length");
			assert.equal(scope.get("foo.length"), 3);
		});

		it("unset() sets `this.data` to undefined on null or empty path", function() {
			scope.unset();
			assert.strictEqual(typeof scope.data, "undefined");
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
			o = scope.observe("foo", function(){});
			assert.ok(o);
			o.stop();
		});

		it("observes nothing when nothing changes", function() {
			var seen = false;
			o = scope.observe("foo", function() { seen = true; });
			scope.set("foo", "bar");
			assert.ok(!seen);
		});

		it("observes static path changes", function() {
			var seen = false;
			o = scope.observe("foo.bar", function(nval, oval, path) {
				assert.strictEqual(nval, "baz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar");
				seen = true;
			});

			scope.set("foo", { bar: "baz" });
			assert.ok(seen);
		});

		it("observes unset", function() {
			var seen = false;
			o = scope.observe("foo", function(nval, oval, path) {
				assert.strictEqual(typeof nval, "undefined");
				assert.strictEqual(oval, "bar");
				assert.strictEqual(path, "foo");
				seen = true;
			});

			scope.unset("foo");
			assert.ok(seen);
		});

		it("observes dynamic path: *", function() {
			var seen = false;
			o = scope.observe("*", function(nval, oval, path) {
				assert.deepEqual(nval, { bar: "baz" });
				assert.strictEqual(oval, "bar");
				assert.strictEqual(path, "foo");
				seen = true;
			});

			scope.set("foo", { bar: "baz" });
			assert.ok(seen);
		});

		it("observes dynamic path: *.bar.baz", function() {
			var seen = false;
			o = scope.observe("*.bar.baz", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			scope.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("observes dynamic path: foo.*.baz", function() {
			var seen = false;
			o = scope.observe("foo.*.baz", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			scope.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("observes dynamic path: foo.bar.*", function() {
			var seen = false;
			o = scope.observe("foo.bar.*", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			scope.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("calling get() in an observer returns the new value", function() {
			var seen = false;
			o = scope.observe("foo.bar", function(nval, oval, path) {
				assert.strictEqual(this.get(path), nval);
				seen = true;
			});

			scope.set("foo.bar", "baz");
			assert.ok(seen);
		});
	});

	describe("#spawn() & nested scope", function() {
		var child;

		beforeEach(function() {
			child = scope.spawn();
			child.set("bar", "baz");
		});

		afterEach(function() {
			child.close();
			child = null;
		});

		it("scope.spawn() returns an instance of Temple.Scope whose parent is scope", function() {
			assert.ok(child instanceof Temple.Scope);
			assert.strictEqual(child.parent, scope);
		});

		it("child scope returns parent value at path iff child value at path is undefined", function() {
			assert.equal(child.get("bar"), "baz");
			assert.strictEqual(typeof child.value.foo, "undefined");
			assert.equal(child.get("foo"), "bar");
		});

		it("destroying parent scope detaches it from children", function() {
			var grandchild = child.spawn();
			assert.strictEqual(grandchild.parent, child);

			child.close();
			assert.equal(grandchild.parent, null);
			assert.strictEqual(child.closed, true);
			assert.notEqual(grandchild.closed, true);
			grandchild.close();
		});
	});
});
},{"assert":9}]},{},[22])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlcyI6WyIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL2xpYi9kZXBzLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvZG9tLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvcGFyc2UvaW5kZXguanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL2xpYi9wYXJzZS90eXBlcy5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbGliL3BhcnNlL3htbC5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbGliL3Njb3BlLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvdGVtcGxlLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9saWIvdXRpbC5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Fzc2VydC9hc3NlcnQuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9hc3NlcnQvbm9kZV9tb2R1bGVzL3V0aWwvc3VwcG9ydC9pc0J1ZmZlckJyb3dzZXIuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9hc3NlcnQvbm9kZV9tb2R1bGVzL3V0aWwvdXRpbC5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2V2ZW50cy9ldmVudHMuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9pbmhlcml0cy9pbmhlcml0c19icm93c2VyLmpzIiwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9ob2dhbi5qcy9saWIvY29tcGlsZXIuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9ob2dhbi5qcy9saWIvaG9nYW4uanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy9ob2dhbi5qcy9saWIvdGVtcGxhdGUuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL25vZGVfbW9kdWxlcy91bmRlcnNjb3JlL3VuZGVyc2NvcmUuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL3Rlc3QvY2xhc3MuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL3Rlc3QvaW5kZXguanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL3Rlc3QvbXVzdGFjaGUuanNvbiIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvdGVzdC9wYXJzZS5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvdGVzdC9yZWFjdGl2ZS5qcyIsIi9Vc2Vycy9UeWxlci9Ecm9wYm94L0NsaWVudHMvVEpDcmFwL0Rldi90ZW1wbGUvdGVzdC9yZW5kZXIuanMiLCIvVXNlcnMvVHlsZXIvRHJvcGJveC9DbGllbnRzL1RKQ3JhcC9EZXYvdGVtcGxlL3Rlc3Qvc2NvcGUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1pBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVrQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNVNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7OztBQzVEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDalBBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG52YXIgRGVwcyA9XG5tb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2FjdGl2ZVxuRGVwcy5hY3RpdmUgPSBmYWxzZTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19jdXJyZW50Y29tcHV0YXRpb25cbkRlcHMuY3VycmVudENvbXB1dGF0aW9uID0gbnVsbDtcblxudmFyIHNldEN1cnJlbnRDb21wdXRhdGlvbiA9IGZ1bmN0aW9uIChjKSB7XG4gIERlcHMuY3VycmVudENvbXB1dGF0aW9uID0gYztcbiAgRGVwcy5hY3RpdmUgPSAhISBjO1xufTtcblxuLy8gX2Fzc2lnbiBpcyBsaWtlIF8uZXh0ZW5kIG9yIHRoZSB1cGNvbWluZyBPYmplY3QuYXNzaWduLlxuLy8gQ29weSBzcmMncyBvd24sIGVudW1lcmFibGUgcHJvcGVydGllcyBvbnRvIHRndCBhbmQgcmV0dXJuXG4vLyB0Z3QuXG52YXIgX2hhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcbnZhciBfYXNzaWduID0gZnVuY3Rpb24gKHRndCwgc3JjKSB7XG4gIGZvciAodmFyIGsgaW4gc3JjKSB7XG4gICAgaWYgKF9oYXNPd25Qcm9wZXJ0eS5jYWxsKHNyYywgaykpXG4gICAgICB0Z3Rba10gPSBzcmNba107XG4gIH1cbiAgcmV0dXJuIHRndDtcbn07XG5cbnZhciBfZGVidWdGdW5jID0gZnVuY3Rpb24gKCkge1xuICAvLyBsYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5XG4gIHJldHVybiAodHlwZW9mIE1ldGVvciAhPT0gXCJ1bmRlZmluZWRcIiA/IE1ldGVvci5fZGVidWcgOlxuICAgICAgICAgICgodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUubG9nID9cbiAgICAgICAgICAgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcbiAgICAgICAgICAgZnVuY3Rpb24gKCkge30pKTtcbn07XG5cbnZhciBfdGhyb3dPckxvZyA9IGZ1bmN0aW9uIChmcm9tLCBlKSB7XG4gIGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcbiAgICB0aHJvdyBlO1xuICB9IGVsc2Uge1xuICAgIF9kZWJ1Z0Z1bmMoKShcIkV4Y2VwdGlvbiBmcm9tIERlcHMgXCIgKyBmcm9tICsgXCIgZnVuY3Rpb246XCIsXG4gICAgICAgICAgICAgICAgIGUuc3RhY2sgfHwgZS5tZXNzYWdlKTtcbiAgfVxufTtcblxuLy8gTGlrZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkgeyBmKGNvbXApOyB9KWAgYnV0IHNob3J0ZXIsXG4vLyBhbmQgZG9lc24ndCBjbHV0dGVyIHRoZSBzdGFjayB3aXRoIGFuIGV4dHJhIGZyYW1lIG9uIHRoZSBjbGllbnQsXG4vLyB3aGVyZSBgX25vWWllbGRzQWxsb3dlZGAgaXMgYSBuby1vcC4gIGBmYCBtYXkgYmUgYSBjb21wdXRhdGlvblxuLy8gZnVuY3Rpb24gb3IgYW4gb25JbnZhbGlkYXRlIGNhbGxiYWNrLlxudmFyIGNhbGxXaXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYsIGNvbXApIHtcbiAgaWYgKCh0eXBlb2YgTWV0ZW9yID09PSAndW5kZWZpbmVkJykgfHwgTWV0ZW9yLmlzQ2xpZW50KSB7XG4gICAgZihjb21wKTtcbiAgfSBlbHNlIHtcbiAgICBNZXRlb3IuX25vWWllbGRzQWxsb3dlZChmdW5jdGlvbiAoKSB7XG4gICAgICBmKGNvbXApO1xuICAgIH0pO1xuICB9XG59O1xuXG52YXIgbmV4dElkID0gMTtcbi8vIGNvbXB1dGF0aW9ucyB3aG9zZSBjYWxsYmFja3Mgd2Ugc2hvdWxkIGNhbGwgYXQgZmx1c2ggdGltZVxudmFyIHBlbmRpbmdDb21wdXRhdGlvbnMgPSBbXTtcbi8vIGB0cnVlYCBpZiBhIERlcHMuZmx1c2ggaXMgc2NoZWR1bGVkLCBvciBpZiB3ZSBhcmUgaW4gRGVwcy5mbHVzaCBub3dcbnZhciB3aWxsRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgaW4gRGVwcy5mbHVzaCBub3dcbnZhciBpbkZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGNvbXB1dGluZyBhIGNvbXB1dGF0aW9uIG5vdywgZWl0aGVyIGZpcnN0IHRpbWVcbi8vIG9yIHJlY29tcHV0ZS4gIFRoaXMgbWF0Y2hlcyBEZXBzLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZVxuLy8gRGVwcy5ub25yZWFjdGl2ZSwgd2hpY2ggbnVsbGZpZXMgY3VycmVudENvbXB1dGF0aW9uIGV2ZW4gdGhvdWdoXG4vLyBhbiBlbmNsb3NpbmcgY29tcHV0YXRpb24gbWF5IHN0aWxsIGJlIHJ1bm5pbmcuXG52YXIgaW5Db21wdXRlID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgdGhlIGBfdGhyb3dGaXJzdEVycm9yYCBvcHRpb24gd2FzIHBhc3NlZCBpbiB0byB0aGUgY2FsbFxuLy8gdG8gRGVwcy5mbHVzaCB0aGF0IHdlIGFyZSBpbi4gV2hlbiBzZXQsIHRocm93IHJhdGhlciB0aGFuIGxvZyB0aGVcbi8vIGZpcnN0IGVycm9yIGVuY291bnRlcmVkIHdoaWxlIGZsdXNoaW5nLiBCZWZvcmUgdGhyb3dpbmcgdGhlIGVycm9yLFxuLy8gZmluaXNoIGZsdXNoaW5nIChmcm9tIGEgZmluYWxseSBibG9jayksIGxvZ2dpbmcgYW55IHN1YnNlcXVlbnRcbi8vIGVycm9ycy5cbnZhciB0aHJvd0ZpcnN0RXJyb3IgPSBmYWxzZTtcblxudmFyIGFmdGVyRmx1c2hDYWxsYmFja3MgPSBbXTtcblxudmFyIHJlcXVpcmVGbHVzaCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCEgd2lsbEZsdXNoKSB7XG4gICAgc2V0VGltZW91dChEZXBzLmZsdXNoLCAwKTtcbiAgICB3aWxsRmx1c2ggPSB0cnVlO1xuICB9XG59O1xuXG4vLyBEZXBzLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHZpc2libGUgYnV0IHByaXZhdGVcbi8vICh0aHJvd3MgYW4gZXJyb3IgaWYgeW91IHRyeSB0byBjYWxsIGl0KVxudmFyIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2NvbXB1dGF0aW9uXG4vL1xuRGVwcy5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQpIHtcbiAgaWYgKCEgY29uc3RydWN0aW5nQ29tcHV0YXRpb24pXG4gICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgXCJEZXBzLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBEZXBzLmF1dG9ydW5cIik7XG4gIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbiAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX3N0b3BwZWRcbiAgc2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcbiAgc2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG4gIHNlbGYuZmlyc3RSdW4gPSB0cnVlO1xuXG4gIHNlbGYuX2lkID0gbmV4dElkKys7XG4gIHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuICAvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG4gIC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuICBzZWxmLl9wYXJlbnQgPSBwYXJlbnQ7XG4gIHNlbGYuX2Z1bmMgPSBmO1xuICBzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXG4gIHZhciBlcnJvcmVkID0gdHJ1ZTtcbiAgdHJ5IHtcbiAgICBzZWxmLl9jb21wdXRlKCk7XG4gICAgZXJyb3JlZCA9IGZhbHNlO1xuICB9IGZpbmFsbHkge1xuICAgIHNlbGYuZmlyc3RSdW4gPSBmYWxzZTtcbiAgICBpZiAoZXJyb3JlZClcbiAgICAgIHNlbGYuc3RvcCgpO1xuICB9XG59O1xuXG5fYXNzaWduKERlcHMuQ29tcHV0YXRpb24ucHJvdG90eXBlLCB7XG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG4gIG9uSW52YWxpZGF0ZTogZnVuY3Rpb24gKGYpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICBpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvbkludmFsaWRhdGUgcmVxdWlyZXMgYSBmdW5jdGlvblwiKTtcblxuICAgIGlmIChzZWxmLmludmFsaWRhdGVkKSB7XG4gICAgICBEZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgY2FsbFdpdGhOb1lpZWxkc0FsbG93ZWQoZiwgc2VsZik7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzLnB1c2goZik7XG4gICAgfVxuICB9LFxuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcbiAgaW52YWxpZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBpZiAoISBzZWxmLmludmFsaWRhdGVkKSB7XG4gICAgICAvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG4gICAgICAvLyBvdXJzZWx2ZXMsIHNpbmNlIHdlJ2xsIHJlcnVuIGltbWVkaWF0ZWx5IGFueXdheS5cbiAgICAgIGlmICghIHNlbGYuX3JlY29tcHV0aW5nICYmICEgc2VsZi5zdG9wcGVkKSB7XG4gICAgICAgIHJlcXVpcmVGbHVzaCgpO1xuICAgICAgICBwZW5kaW5nQ29tcHV0YXRpb25zLnB1c2godGhpcyk7XG4gICAgICB9XG5cbiAgICAgIHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG4gICAgICAvLyBjYWxsYmFja3MgY2FuJ3QgYWRkIGNhbGxiYWNrcywgYmVjYXVzZVxuICAgICAgLy8gc2VsZi5pbnZhbGlkYXRlZCA9PT0gdHJ1ZS5cbiAgICAgIGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuICAgICAgICBEZXBzLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBjYWxsV2l0aE5vWWllbGRzQWxsb3dlZChmLCBzZWxmKTtcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuICBzdG9wOiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKCEgdGhpcy5zdG9wcGVkKSB7XG4gICAgICB0aGlzLnN0b3BwZWQgPSB0cnVlO1xuICAgICAgdGhpcy5pbnZhbGlkYXRlKCk7XG4gICAgfVxuICB9LFxuXG4gIF9jb21wdXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuICAgIHZhciBwcmV2aW91cyA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICAgIHNldEN1cnJlbnRDb21wdXRhdGlvbihzZWxmKTtcbiAgICB2YXIgcHJldmlvdXNJbkNvbXB1dGUgPSBpbkNvbXB1dGU7XG4gICAgaW5Db21wdXRlID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgY2FsbFdpdGhOb1lpZWxkc0FsbG93ZWQoc2VsZi5fZnVuYywgc2VsZik7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG4gICAgICBpbkNvbXB1dGUgPSBmYWxzZTtcbiAgICB9XG4gIH0sXG5cbiAgX3JlY29tcHV0ZTogZnVuY3Rpb24gKCkge1xuICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgIHNlbGYuX3JlY29tcHV0aW5nID0gdHJ1ZTtcbiAgICB0cnkge1xuICAgICAgd2hpbGUgKHNlbGYuaW52YWxpZGF0ZWQgJiYgISBzZWxmLnN0b3BwZWQpIHtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICBzZWxmLl9jb21wdXRlKCk7XG4gICAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgICBfdGhyb3dPckxvZyhcInJlY29tcHV0ZVwiLCBlKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiBfY29tcHV0ZSgpIGludmFsaWRhdGVkIHVzLCB3ZSBydW4gYWdhaW4gaW1tZWRpYXRlbHkuXG4gICAgICAgIC8vIEEgY29tcHV0YXRpb24gdGhhdCBpbnZhbGlkYXRlcyBpdHNlbGYgaW5kZWZpbml0ZWx5IGlzIGFuXG4gICAgICAgIC8vIGluZmluaXRlIGxvb3AsIG9mIGNvdXJzZS5cbiAgICAgICAgLy9cbiAgICAgICAgLy8gV2UgY291bGQgcHV0IGFuIGl0ZXJhdGlvbiBjb3VudGVyIGhlcmUgYW5kIGNhdGNoIHJ1bi1hd2F5XG4gICAgICAgIC8vIGxvb3BzLlxuICAgICAgfVxuICAgIH0gZmluYWxseSB7XG4gICAgICBzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuICAgIH1cbiAgfVxufSk7XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBzX2RlcGVuZGVuY3lcbi8vXG5EZXBzLkRlcGVuZGVuY3kgPSBmdW5jdGlvbiAoKSB7XG4gIHRoaXMuX2RlcGVuZGVudHNCeUlkID0ge307XG59O1xuXG5fYXNzaWduKERlcHMuRGVwZW5kZW5jeS5wcm90b3R5cGUsIHtcbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9kZXBlbmRcbiAgLy9cbiAgLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4gIC8vIHByZXNlbnQuICBSZXR1cm5zIHRydWUgaWYgYGNvbXB1dGF0aW9uYCBpcyBhIG5ldyBtZW1iZXIgb2YgdGhlIHNldC5cbiAgLy8gSWYgbm8gYXJndW1lbnQsIGRlZmF1bHRzIHRvIGN1cnJlbnRDb21wdXRhdGlvbiwgb3IgZG9lcyBub3RoaW5nXG4gIC8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cbiAgZGVwZW5kOiBmdW5jdGlvbiAoY29tcHV0YXRpb24pIHtcbiAgICBpZiAoISBjb21wdXRhdGlvbikge1xuICAgICAgaWYgKCEgRGVwcy5hY3RpdmUpXG4gICAgICAgIHJldHVybiBmYWxzZTtcblxuICAgICAgY29tcHV0YXRpb24gPSBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbjtcbiAgICB9XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcbiAgICBpZiAoISAoaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpKSB7XG4gICAgICBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0gPSBjb21wdXRhdGlvbjtcbiAgICAgIGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG4gICAgICAgIGRlbGV0ZSBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF07XG4gICAgICB9KTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9jaGFuZ2VkXG4gIGNoYW5nZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgZm9yICh2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG4gICAgICBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0uaW52YWxpZGF0ZSgpO1xuICB9LFxuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfaGFzZGVwZW5kZW50c1xuICBoYXNEZXBlbmRlbnRzOiBmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbn0pO1xuXG5fYXNzaWduKERlcHMsIHtcbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19mbHVzaFxuICBmbHVzaDogZnVuY3Rpb24gKF9vcHRzKSB7XG4gICAgLy8gWFhYIFdoYXQgcGFydCBvZiB0aGUgY29tbWVudCBiZWxvdyBpcyBzdGlsbCB0cnVlPyAoV2Ugbm8gbG9uZ2VyXG4gICAgLy8gaGF2ZSBTcGFyaylcbiAgICAvL1xuICAgIC8vIE5lc3RlZCBmbHVzaCBjb3VsZCBwbGF1c2libHkgaGFwcGVuIGlmLCBzYXksIGEgZmx1c2ggY2F1c2VzXG4gICAgLy8gRE9NIG11dGF0aW9uLCB3aGljaCBjYXVzZXMgYSBcImJsdXJcIiBldmVudCwgd2hpY2ggcnVucyBhblxuICAgIC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgRGVwcy5mbHVzaC4gIEF0IHRoZSBtb21lbnRcbiAgICAvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG4gICAgLy8gYmVjYXVzZSB0aGUgTGl2ZVJhbmdlIHRyZWUgaXNuJ3QgdmFsaWQuICBBbmQgd2UgZG9uJ3QgaGF2ZVxuICAgIC8vIGFueSB1c2VmdWwgbm90aW9uIG9mIGEgbmVzdGVkIGZsdXNoLlxuICAgIC8vXG4gICAgLy8gaHR0cHM6Ly9hcHAuYXNhbmEuY29tLzAvMTU5OTA4MzMwMjQ0LzM4NTEzODIzMzg1NlxuICAgIGlmIChpbkZsdXNoKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBEZXBzLmZsdXNoIHdoaWxlIGZsdXNoaW5nXCIpO1xuXG4gICAgaWYgKGluQ29tcHV0ZSlcbiAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IGZsdXNoIGluc2lkZSBEZXBzLmF1dG9ydW5cIik7XG5cbiAgICBpbkZsdXNoID0gdHJ1ZTtcbiAgICB3aWxsRmx1c2ggPSB0cnVlO1xuICAgIHRocm93Rmlyc3RFcnJvciA9ICEhIChfb3B0cyAmJiBfb3B0cy5fdGhyb3dGaXJzdEVycm9yKTtcblxuICAgIHZhciBmaW5pc2hlZFRyeSA9IGZhbHNlO1xuICAgIHRyeSB7XG4gICAgICB3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcbiAgICAgICAgICAgICBhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuXG4gICAgICAgIC8vIHJlY29tcHV0ZSBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnNcbiAgICAgICAgd2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgdmFyIGNvbXAgPSBwZW5kaW5nQ29tcHV0YXRpb25zLnNoaWZ0KCk7XG4gICAgICAgICAgY29tcC5fcmVjb21wdXRlKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAvLyBjYWxsIG9uZSBhZnRlckZsdXNoIGNhbGxiYWNrLCB3aGljaCBtYXlcbiAgICAgICAgICAvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG4gICAgICAgICAgdmFyIGZ1bmMgPSBhZnRlckZsdXNoQ2FsbGJhY2tzLnNoaWZ0KCk7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGZ1bmMoKTtcbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICBfdGhyb3dPckxvZyhcImFmdGVyRmx1c2ggZnVuY3Rpb25cIiwgZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmaW5pc2hlZFRyeSA9IHRydWU7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmICghIGZpbmlzaGVkVHJ5KSB7XG4gICAgICAgIC8vIHdlJ3JlIGVycm9yaW5nXG4gICAgICAgIGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBEZXBzLmZsdXNoKClgIGFnYWluXG4gICAgICAgIERlcHMuZmx1c2goe190aHJvd0ZpcnN0RXJyb3I6IGZhbHNlfSk7IC8vIGZpbmlzaCBmbHVzaGluZ1xuICAgICAgfVxuICAgICAgd2lsbEZsdXNoID0gZmFsc2U7XG4gICAgICBpbkZsdXNoID0gZmFsc2U7XG4gICAgfVxuICB9LFxuXG4gIC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcHNfYXV0b3J1blxuICAvL1xuICAvLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4gIC8vIGRlcGVuZGVuY2llcyBjaGFuZ2UuXG4gIC8vXG4gIC8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4gIC8vXG4gIC8vIExpbmtzIHRoZSBjb21wdXRhdGlvbiB0byB0aGUgY3VycmVudCBjb21wdXRhdGlvblxuICAvLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG4gIGF1dG9ydW46IGZ1bmN0aW9uIChmKSB7XG4gICAgaWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdEZXBzLmF1dG9ydW4gcmVxdWlyZXMgYSBmdW5jdGlvbiBhcmd1bWVudCcpO1xuXG4gICAgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuICAgIHZhciBjID0gbmV3IERlcHMuQ29tcHV0YXRpb24oZiwgRGVwcy5jdXJyZW50Q29tcHV0YXRpb24pO1xuXG4gICAgaWYgKERlcHMuYWN0aXZlKVxuICAgICAgRGVwcy5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuICAgICAgICBjLnN0b3AoKTtcbiAgICAgIH0pO1xuXG4gICAgcmV0dXJuIGM7XG4gIH0sXG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19ub25yZWFjdGl2ZVxuICAvL1xuICAvLyBSdW4gYGZgIHdpdGggbm8gY3VycmVudCBjb21wdXRhdGlvbiwgcmV0dXJuaW5nIHRoZSByZXR1cm4gdmFsdWVcbiAgLy8gb2YgYGZgLiAgVXNlZCB0byB0dXJuIG9mZiByZWFjdGl2aXR5IGZvciB0aGUgZHVyYXRpb24gb2YgYGZgLFxuICAvLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuICAvLyBjb21wdXRhdGlvbnMgYmVpbmcgaW52YWxpZGF0ZWQuXG4gIG5vbnJlYWN0aXZlOiBmdW5jdGlvbiAoZikge1xuICAgIHZhciBwcmV2aW91cyA9IERlcHMuY3VycmVudENvbXB1dGF0aW9uO1xuICAgIHNldEN1cnJlbnRDb21wdXRhdGlvbihudWxsKTtcbiAgICB0cnkge1xuICAgICAgcmV0dXJuIGYoKTtcbiAgICB9IGZpbmFsbHkge1xuICAgICAgc2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcbiAgICB9XG4gIH0sXG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19vbmludmFsaWRhdGVcbiAgb25JbnZhbGlkYXRlOiBmdW5jdGlvbiAoZikge1xuICAgIGlmICghIERlcHMuYWN0aXZlKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRGVwcy5vbkludmFsaWRhdGUgcmVxdWlyZXMgYSBjdXJyZW50Q29tcHV0YXRpb25cIik7XG5cbiAgICBEZXBzLmN1cnJlbnRDb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZik7XG4gIH0sXG5cbiAgLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwc19hZnRlcmZsdXNoXG4gIGFmdGVyRmx1c2g6IGZ1bmN0aW9uIChmKSB7XG4gICAgYWZ0ZXJGbHVzaENhbGxiYWNrcy5wdXNoKGYpO1xuICAgIHJlcXVpcmVGbHVzaCgpO1xuICB9XG59KTsiLCJ2YXIgcGFyc2UgPSByZXF1aXJlKFwiLi9wYXJzZVwiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIiksXG5cdF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0Tk9ERV9UWVBFID0gcGFyc2UuTk9ERV9UWVBFO1xuXG5leHBvcnRzLnNldFRlbXBsYXRlID0gZnVuY3Rpb24odGVtcGxhdGUpIHtcblx0aWYgKF8uaXNTdHJpbmcodGVtcGxhdGUpKSB0ZW1wbGF0ZSA9IHBhcnNlKHRlbXBsYXRlKTtcblx0dGhpcy5fdGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblx0cmV0dXJuIHRoaXM7XG59XG5cbmV4cG9ydHMucGFpbnQgPSBmdW5jdGlvbigpIHtcblx0dGhpcy5yZW5kZXIoKTtcbn1cblxuZXhwb3J0cy50b0hUTUwgPSBmdW5jdGlvbigpIHtcblx0dGhpcy5wYWludCgpO1xuXHRcblx0dmFyIGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XG5cdFxuXHRmb3IgKHZhciBpIGluIHRoaXMubm9kZXMpIHtcblx0XHRkaXYuYXBwZW5kQ2hpbGQodGhpcy5ub2Rlc1tpXS5jbG9uZU5vZGUodHJ1ZSkpO1xuXHR9XG5cblx0cmV0dXJuIGRpdi5pbm5lckhUTUwudHJpbSgpO1xufVxuXG5leHBvcnRzLnJlbmRlciA9IGZ1bmN0aW9uKCkge1xuXHRpZiAodGhpcy5fcmVuZGVyZWQpIHJldHVybiB0aGlzLm5vZGVzO1xuXHR0aGlzLm5vZGVzID0gdGhpcy5fYnVpbGRFbGVtZW50cyh0aGlzLl90ZW1wbGF0ZSk7XG5cdHRoaXMuX3JlbmRlcmVkID0gdHJ1ZTtcblx0dGhpcy5lbWl0KFwicmVuZGVyXCIsIHRoaXMubm9kZXMpO1xuXHRyZXR1cm4gdGhpcztcbn1cblxuZXhwb3J0cy5fYnVpbGRFbGVtZW50cyA9IGZ1bmN0aW9uKHRyZWUsIGN0eCkge1xuXHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXMuc2NvcGUoKTtcblxuXHRyZXR1cm4gdHJlZS5tYXAoZnVuY3Rpb24obm9kZSkge1xuXHRcdHZhciBidWlsZCA9IF9idWlsZC5lbGVtZW50W25vZGUudHlwZV07XG5cdFx0aWYgKGJ1aWxkICE9IG51bGwpIHJldHVybiBidWlsZC5jYWxsKHRoaXMsIG5vZGUsIGN0eCk7XG5cdFx0Y29uc29sZS5sb2cobm9kZSk7XG5cdH0sIHRoaXMpLnJlZHVjZShmdW5jdGlvbihub2Rlcywgbm9kZSkge1xuXHRcdHJldHVybiBub2Rlcy5jb25jYXQoQXJyYXkuaXNBcnJheShub2RlKSA/IF8uZmxhdHRlbihub2RlKSA6IG5vZGUpO1xuXHR9LCBbXSkuZmlsdGVyKGZ1bmN0aW9uKGMpIHtcblx0XHRyZXR1cm4gYyAhPSBudWxsO1xuXHR9KTtcbn1cblxuZXhwb3J0cy5fYnVpbGRBdHRyaWJ1dGUgPSBmdW5jdGlvbihub2RlcywgY3R4KSB7XG5cdHJldHVybiBub2Rlcy5tYXAoZnVuY3Rpb24obm9kZSkge1xuXHRcdHZhciBidWlsZCA9IF9idWlsZC5hdHRyaWJ1dGVbbm9kZS50eXBlXTtcblx0XHRpZiAoYnVpbGQgIT0gbnVsbCkgcmV0dXJuIGJ1aWxkLmNhbGwodGhpcywgbm9kZSwgY3R4KTtcblx0XHRjb25zb2xlLmxvZyhub2RlKTtcblx0fSwgdGhpcykuam9pbihcIlwiKTtcbn1cblxudmFyIF9idWlsZCA9IHtcblx0ZWxlbWVudDoge30sXG5cdGF0dHJpYnV0ZToge31cbn1cblxuX2J1aWxkLmVsZW1lbnRbIE5PREVfVFlQRS5FTEVNRU5UIF0gPSBmdW5jdGlvbihub2RlLCBjdHgpIHtcblx0dmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChub2RlLm5hbWUpO1xuXHRcblx0bm9kZS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24oYXR0cikge1xuXHRcdGVsLnNldEF0dHJpYnV0ZShhdHRyLm5hbWUsIHRoaXMuX2J1aWxkQXR0cmlidXRlKGF0dHIuY2hpbGRyZW4sIGN0eCkpO1xuXHR9LCB0aGlzKTtcblxuXHR0aGlzLl9idWlsZEVsZW1lbnRzKG5vZGUuY2hpbGRyZW4sIGN0eCkuZm9yRWFjaChmdW5jdGlvbihjaGlsZCkge1xuXHRcdGVsLmFwcGVuZENoaWxkKGNoaWxkKTtcblx0fSk7XG5cblx0cmV0dXJuIGVsO1xufVxuXG5fYnVpbGQuZWxlbWVudFsgTk9ERV9UWVBFLlRFWFQgXSA9IGZ1bmN0aW9uKG5vZGUsIGN0eCkge1xuXHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUobm9kZS52YWx1ZSk7XG59XG5cbl9idWlsZC5lbGVtZW50WyBOT0RFX1RZUEUuSU5URVJQT0xBVE9SIF0gPSBmdW5jdGlvbihub2RlLCBjdHgpIHtcblx0dmFyIHZhbCA9IGN0eC5nZXQobm9kZS52YWx1ZSk7XG5cdHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2YWwgPT0gbnVsbCA/IFwiXCIgOiB2YWwpO1xufVxuXG5fYnVpbGQuZWxlbWVudFsgTk9ERV9UWVBFLlRSSVBMRSBdID0gZnVuY3Rpb24obm9kZSwgY3R4KSB7XG5cdHZhciB2YWwgPSBjdHguZ2V0KG5vZGUudmFsdWUpLFxuXHRcdGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIiksXG5cdFx0Y2hpbGRyZW4gPSBbXSwgaTtcblxuXHRkaXYuaW5uZXJIVE1MID0gdmFsID09IG51bGwgPyBcIlwiIDogdmFsO1xuXG5cdGZvciAoaSA9IDA7IGkgPCBkaXYuY2hpbGROb2Rlcy5sZW5ndGg7IGkrKykge1xuXHRcdGNoaWxkcmVuLnB1c2goZGl2LmNoaWxkTm9kZXNbaV0pO1xuXHR9XG5cblx0cmV0dXJuIGNoaWxkcmVuO1xufVxuXG5fYnVpbGQuZWxlbWVudFsgTk9ERV9UWVBFLlNFQ1RJT04gXSA9IGZ1bmN0aW9uKG5vZGUsIGN0eCkge1xuXHR2YXIgc2VsZiA9IHRoaXMsIGVscyA9IFtdO1xuXG5cdHByb2Nlc3NTZWN0aW9uKGN0eCwgbm9kZS52YWx1ZSwgZnVuY3Rpb24obmN0eCkge1xuXHRcdGVscy5wdXNoKHNlbGYuX2J1aWxkRWxlbWVudHMobm9kZS5jaGlsZHJlbiwgbmN0eCkpO1xuXHR9KTtcblxuXHRyZXR1cm4gZWxzO1xufVxuXG5fYnVpbGQuZWxlbWVudFsgTk9ERV9UWVBFLklOVkVSVEVEIF0gPSBmdW5jdGlvbihub2RlLCBjdHgpIHtcblx0aWYgKGlzRW1wdHlTZWN0aW9uKGN0eC5nZXQobm9kZS52YWx1ZSkpKVxuXHRcdHJldHVybiB0aGlzLl9idWlsZEVsZW1lbnRzKG5vZGUuY2hpbGRyZW4sIGN0eCk7XG59XG5cbl9idWlsZC5hdHRyaWJ1dGVbIE5PREVfVFlQRS5URVhUIF0gPSBmdW5jdGlvbihub2RlLCBjdHgpIHtcblx0cmV0dXJuIG5vZGUudmFsdWU7XG59XG5cbl9idWlsZC5hdHRyaWJ1dGVbIE5PREVfVFlQRS5JTlRFUlBPTEFUT1IgXSA9IGZ1bmN0aW9uKG5vZGUsIGN0eCkge1xuXHR2YXIgdmFsID0gY3R4LmdldChub2RlLnZhbHVlKTtcblx0cmV0dXJuIHZhbCAhPSBudWxsID8gXy5lc2NhcGUodmFsKSA6IFwiXCI7XG59XG5cbl9idWlsZC5hdHRyaWJ1dGVbIE5PREVfVFlQRS5TRUNUSU9OIF0gPSBmdW5jdGlvbihub2RlLCBjdHgpIHtcblx0dmFyIHNlbGYgPSB0aGlzLCBlbHMgPSBbXTtcblxuXHRwcm9jZXNzU2VjdGlvbihjdHgsIG5vZGUudmFsdWUsIGZ1bmN0aW9uKG5jdHgpIHtcblx0XHRlbHMucHVzaChzZWxmLl9idWlsZEF0dHJpYnV0ZShub2RlLmNoaWxkcmVuLCBuY3R4KSk7XG5cdH0pO1xuXG5cdHJldHVybiBlbHMuam9pbihcIlwiKTtcbn1cblxuZnVuY3Rpb24gaXNFbXB0eVNlY3Rpb24odmFsKSB7XG5cdHJldHVybiAhdmFsIHx8IChfLmlzQXJyYXkodmFsKSAmJiAhdmFsLmxlbmd0aCk7XG59XG5cbmZ1bmN0aW9uIHByb2Nlc3NTZWN0aW9uKGN0eCwgcGF0aCwgZm4pIHtcblx0dmFyIHZhbCA9IGN0eC5nZXQocGF0aCk7XG5cdGlmIChpc0VtcHR5U2VjdGlvbih2YWwpKSByZXR1cm4gZmFsc2U7XG5cblx0aWYgKF8uaXNBcnJheSh2YWwpKSB7XG5cdFx0dmFsLmZvckVhY2goZnVuY3Rpb24odiwgaW5kZXgpIHtcblx0XHRcdHZhciBuY3R4ID0gY3R4LnNwYXduKHYpO1xuXHRcdFx0bmN0eC5oaWRkZW4uJGluZGV4ID0gaW5kZXg7XG5cdFx0XHRmbihuY3R4KTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRmbihjdHguc3Bhd24odmFsKSk7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn0iLCJ2YXIgSG9nYW4gPSByZXF1aXJlKFwiaG9nYW4uanNcIiksXG5cdHhtbCA9IHJlcXVpcmUoJy4veG1sJyksXG5cdE5PREVfVFlQRSA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpLFxuXHRIVE1MX0RFTElNSVRFUlMgPSBbIFwiWyNAIVwiLCBcIiFAI11cIiBdO1xuXG52YXIgcGFyc2UgPVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih0ZXh0LCBkZWxpbWl0ZXJzKSB7XG5cdHZhciB0cmVlID0gdG9UcmVlKHRleHQudHJpbSgpLCBkZWxpbWl0ZXJzKTtcblx0cmV0dXJuIGNvbXBpbGVYTUwodHJlZSk7XG59XG5cbnBhcnNlLk5PREVfVFlQRSA9IE5PREVfVFlQRTtcblxuZnVuY3Rpb24gdG9UcmVlKHRleHQsIGRlbGltaXRlcnMpe1xuXHRyZXR1cm4gSG9nYW4ucGFyc2UoSG9nYW4uc2Nhbih0ZXh0LCBkZWxpbWl0ZXJzKSk7XG59XG5cbmZ1bmN0aW9uIHBhcnNlWE1MKHRyZWUpIHtcblx0dmFyIHNyYyA9IFwiXCIsXG5cdFx0ZCA9IEhUTUxfREVMSU1JVEVSUztcblxuXHR0cmVlLmZvckVhY2goZnVuY3Rpb24obm9kZSwgaW5kZXgpIHtcblx0XHRpZiAodHlwZW9mIG5vZGUgPT09IFwic3RyaW5nXCIgfHwgbm9kZSBpbnN0YW5jZW9mIFN0cmluZykge1xuXHRcdFx0c3JjICs9IFwiXCIgKyBub2RlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzcmMgKz0gZFswXSArIGluZGV4ICsgZFsxXTtcblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiB4bWwoc3JjKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VYTUxUZXh0KHRleHQsIHRyZWUpIHtcblx0dmFyIGQgPSBIVE1MX0RFTElNSVRFUlM7XG5cblx0cmV0dXJuIHRleHQuc3BsaXQoZFswXSkucmVkdWNlKGZ1bmN0aW9uKG0sIHYpIHtcblx0XHR2YXIgZW5kID0gdi5pbmRleE9mKGRbMV0pLCB0b1B1c2g7XG5cdFx0XG5cdFx0aWYgKGVuZCA+PSAwKSB7XG5cdFx0XHR2YXIgaW5kZXggPSBwYXJzZUludCh2LnN1YnN0cigwLCBlbmQpLCAxMCk7XG5cdFx0XHRpZiAoIWlzTmFOKGluZGV4KSAmJiBpbmRleCA+PSAwKSBtLnB1c2goaW5kZXgpO1xuXHRcdFx0XG5cdFx0XHR0b1B1c2ggPSB2LnN1YnN0cihlbmQgKyBkWzFdLmxlbmd0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRvUHVzaCA9IHY7XG5cdFx0fVxuXG5cdFx0aWYgKHRvUHVzaCAhPT0gXCJcIikgbS5wdXNoKHRvUHVzaCk7XG5cblx0XHRyZXR1cm4gbTtcblx0fSwgW10pLm1hcChmdW5jdGlvbih2KSB7XG5cdFx0aWYgKHR5cGVvZiB2ICE9PSBcIm51bWJlclwiKSByZXR1cm4gdjtcblx0XHRyZXR1cm4gdHJlZVt2XTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGFwcGVuZFRleHQobSwgdGV4dCkge1xuXHR2YXIgbGFzdCA9IG1bbS5sZW5ndGggLSAxXTtcblx0aWYgKGxhc3QgIT0gbnVsbCAmJiBsYXN0LnR5cGUgPT09IE5PREVfVFlQRS5URVhUKSB7XG5cdFx0bGFzdC52YWx1ZSArPSB0ZXh0O1xuXHR9IGVsc2Uge1xuXHRcdG0ucHVzaCh7XG5cdFx0XHR0eXBlOiBOT0RFX1RZUEUuVEVYVCxcblx0XHRcdHZhbHVlOiB0ZXh0XG5cdFx0fSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcGlsZVN0YXNoKG5vZGVzLCBpc1hNTCkge1xuXHRwcm9jZXNzTm9kZXMgPSBpc1hNTCA/IGNvbXBpbGVYTUwgOiBjb21waWxlU3Rhc2g7XG5cblx0cmV0dXJuIG5vZGVzLnJlZHVjZShmdW5jdGlvbihtLCBwYXJ0KSB7XG5cdFx0aWYgKHR5cGVvZiBwYXJ0ID09PSBcInN0cmluZ1wiIHx8IHBhcnQgaW5zdGFuY2VvZiBTdHJpbmcpIHtcblx0XHRcdGFwcGVuZFRleHQobSwgXCJcIiArIHBhcnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzd2l0Y2ggKHBhcnQudGFnKSB7XG5cdFx0XHRcdGNhc2UgXCJcXG5cIjpcblx0XHRcdFx0XHRhcHBlbmRUZXh0KG0sIFwiXFxuXCIpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgXCJfdlwiOlxuXHRcdFx0XHRcdG0ucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiBOT0RFX1RZUEUuSU5URVJQT0xBVE9SLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHBhcnQublxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgXCImXCI6XG5cdFx0XHRcdGNhc2UgXCJ7XCI6XG5cdFx0XHRcdFx0bS5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6IE5PREVfVFlQRS5UUklQTEUsXG5cdFx0XHRcdFx0XHR2YWx1ZTogcGFydC5uXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0Y2FzZSBcIiNcIjpcblx0XHRcdFx0XHRtLnB1c2goe1xuXHRcdFx0XHRcdFx0dHlwZTogTk9ERV9UWVBFLlNFQ1RJT04sXG5cdFx0XHRcdFx0XHR2YWx1ZTogcGFydC5uLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IHByb2Nlc3NOb2RlcyhwYXJ0Lm5vZGVzLCBpc1hNTClcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFwiXlwiOlxuXHRcdFx0XHRcdG0ucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiBOT0RFX1RZUEUuSU5WRVJURUQsXG5cdFx0XHRcdFx0XHR2YWx1ZTogcGFydC5uLFxuXHRcdFx0XHRcdFx0Y2hpbGRyZW46IHByb2Nlc3NOb2RlcyhwYXJ0Lm5vZGVzLCBpc1hNTClcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFwiPlwiOlxuXHRcdFx0XHRcdG0ucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiBOT0RFX1RZUEUuUEFSVElBTCxcblx0XHRcdFx0XHRcdHZhbHVlOiBwYXJ0Lm5cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRjYXNlIFwiIVwiOlxuXHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0Y29uc29sZS5sb2cocGFydCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG07XG5cdH0sIFtdKTtcbn1cblxuZnVuY3Rpb24gY29tcGlsZUF0dHJpYnV0ZXMoYXR0cnMsIHRyZWUpIHtcblx0dmFyIHBhcnNlZCA9IFtdO1xuXG5cdGZvciAodmFyIGtleSBpbiBhdHRycykge1xuXHRcdHBhcnNlZC5wdXNoKHtcblx0XHRcdHR5cGU6IE5PREVfVFlQRS5BVFRSSUJVVEUsXG5cdFx0XHRuYW1lOiBrZXksXG5cdFx0XHRjaGlsZHJlbjogY29tcGlsZVN0YXNoKHBhcnNlWE1MVGV4dChhdHRyc1trZXldLCB0cmVlKSwgZmFsc2UpXG5cdFx0fSk7XG5cdH1cblxuXHRyZXR1cm4gcGFyc2VkO1xufVxuXG5mdW5jdGlvbiBjb21waWxlRWxlbWVudHMobm9kZXMsIHRyZWUpIHtcblx0cmV0dXJuIG5vZGVzLm1hcChmdW5jdGlvbihlbCkge1xuXHRcdGlmICh0eXBlb2YgZWwgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdHJldHVybiBjb21waWxlU3Rhc2gocGFyc2VYTUxUZXh0KGVsLCB0cmVlKSwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IE5PREVfVFlQRS5FTEVNRU5ULFxuXHRcdFx0XHRuYW1lOiBlbC5uYW1lLFxuXHRcdFx0XHRhdHRyaWJ1dGVzOiBjb21waWxlQXR0cmlidXRlcyhlbC5hdHRyaWJ1dGVzLCB0cmVlKSxcblx0XHRcdFx0Y2hpbGRyZW46IGNvbXBpbGVFbGVtZW50cyhlbC5jaGlsZHJlbiwgdHJlZSlcblx0XHRcdH1cblx0XHR9XG5cdH0pLnJlZHVjZShmdW5jdGlvbihtLCBlbCkge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGVsKSkgbSA9IG0uY29uY2F0KGVsKTtcblx0XHRlbHNlIG0ucHVzaChlbCk7XG5cdFx0cmV0dXJuIG07XG5cdH0sIFtdKTtcbn1cblxuZnVuY3Rpb24gY29tcGlsZVhNTCh0cmVlKSB7XG5cdHJldHVybiBjb21waWxlRWxlbWVudHMocGFyc2VYTUwodHJlZSksIHRyZWUpO1xufSIsIm1vZHVsZS5leHBvcnRzID0ge1xuXHQvLyBYTUwvSFRNTFxuXHRURVhUICAgICAgICAgICAgICA6IDAsXG5cdEVMRU1FTlQgICAgICAgICAgIDogMSxcblx0QVRUUklCVVRFICAgICAgICAgOiAyLFxuXHRcblx0Ly8gTXVzdGFjaGVcblx0SU5URVJQT0xBVE9SICAgICAgOiAzLFxuXHRUUklQTEUgICAgICAgICAgICA6IDQsXG5cdFNFQ1RJT04gICAgICAgICAgIDogNSxcblx0SU5WRVJURUQgICAgICAgICAgOiA2LFxuXHRQQVJUSUFMICAgICAgICAgICA6IDdcbn0iLCJcbi8qKlxuICogRXhwb3NlIGBwYXJzZWAuXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBwYXJzZTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gc3RyaW5nIG9mIGB4bWxgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSB4bWxcbiAqIEByZXR1cm4ge09iamVjdH1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gcGFyc2UoeG1sKSB7XG5cdC8vIHN0cmlwIGNvbW1lbnRzXG5cdHhtbCA9IHhtbC5yZXBsYWNlKC88IS0tLio/LS0+L2csICcnKTtcblxuXHRyZXR1cm4gY2hpbGRyZW4oKTtcblxuXHQvKipcblx0ICogVGFnLlxuXHQgKi9cblxuXHRmdW5jdGlvbiB0YWcoKSB7XG5cdFx0dmFyIG0gPSBtYXRjaCgvXjwoW1xcdys6XSspXFxzKi8pO1xuXHRcdGlmICghbSkgcmV0dXJuO1xuXG5cdFx0Ly8gbmFtZVxuXHRcdHZhciBub2RlID0ge1xuXHRcdFx0bmFtZTogbVsxXSxcblx0XHRcdGF0dHJpYnV0ZXM6IHt9XG5cdFx0fTtcblxuXHRcdC8vIGF0dHJpYnV0ZXNcblx0XHR3aGlsZSAoIShlb3MoKSB8fCBpcygnPicpIHx8IGlzKCc/PicpKSkge1xuXHRcdFx0dmFyIGF0dHIgPSBhdHRyaWJ1dGUoKTtcblx0XHRcdGlmICghYXR0cikgcmV0dXJuIG5vZGU7XG5cdFx0XHRub2RlLmF0dHJpYnV0ZXNbYXR0ci5uYW1lXSA9IGF0dHIudmFsdWU7XG5cdFx0fVxuXG5cdFx0bWF0Y2goL1xcPz8+XFxzKi8pO1xuXG5cdFx0Ly8gY2hpbGRyZW5cblx0XHRub2RlLmNoaWxkcmVuID0gY2hpbGRyZW4oKTtcblxuXHRcdC8vIGNsb3Npbmdcblx0XHRtYXRjaCgvXjxcXC9bXFx3Ol0rPlxccyovKTtcblxuXHRcdHJldHVybiBub2RlO1xuXHR9XG5cblx0ZnVuY3Rpb24gY2hpbGRyZW4oKSB7XG5cdFx0dmFyIGNoaWxkcyA9IFtdO1xuXG5cdFx0Ly8gaW5pdGlhbCB0ZXh0IG5vZGVcblx0XHR2YXIgdGV4dCA9IGNvbnRlbnQoKTtcblx0XHRpZiAodGV4dCAhPSBcIlwiKSBjaGlsZHMucHVzaCh0ZXh0KTtcblxuXHRcdC8vIGNoaWxkcmVuXG5cdFx0dmFyIGNoaWxkO1xuXHRcdHdoaWxlIChjaGlsZCA9IHRhZygpKSB7XG5cdFx0XHRjaGlsZHMucHVzaChjaGlsZCk7XG5cdFx0XHRpZiAoKHRleHQgPSBjb250ZW50KCkpICE9IFwiXCIpIGNoaWxkcy5wdXNoKHRleHQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBjaGlsZHM7XG5cdH1cblxuXHQvKipcblx0ICogVGV4dCBjb250ZW50LlxuXHQgKi9cblxuXHRmdW5jdGlvbiBjb250ZW50KCkge1xuXHRcdHZhciBtID0gbWF0Y2goL14oW148XSopLyk7XG5cdFx0aWYgKG0pIHJldHVybiBtWzFdO1xuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdC8qKlxuXHQgKiBBdHRyaWJ1dGUuXG5cdCAqL1xuXG5cdGZ1bmN0aW9uIGF0dHJpYnV0ZSgpIHtcblx0XHR2YXIgbSA9IG1hdGNoKC8oW1xcdzpdKylcXHMqPVxccyooXCJbXlwiXSpcInwnW14nXSonfFxcdyspXFxzKi8pO1xuXHRcdGlmICghbSkgcmV0dXJuO1xuXHRcdHJldHVybiB7IG5hbWU6IG1bMV0sIHZhbHVlOiBzdHJpcChtWzJdKSB9XG5cdH1cblxuXHQvKipcblx0ICogU3RyaXAgcXVvdGVzIGZyb20gYHZhbGAuXG5cdCAqL1xuXG5cdGZ1bmN0aW9uIHN0cmlwKHZhbCkge1xuXHRcdHJldHVybiB2YWwucmVwbGFjZSgvXlsnXCJdfFsnXCJdJC9nLCAnJyk7XG5cdH1cblxuXHQvKipcblx0ICogTWF0Y2ggYHJlYCBhbmQgYWR2YW5jZSB0aGUgc3RyaW5nLlxuXHQgKi9cblxuXHRmdW5jdGlvbiBtYXRjaChyZSkge1xuXHRcdHZhciBtID0geG1sLm1hdGNoKHJlKTtcblx0XHRpZiAoIW0pIHJldHVybjtcblx0XHR4bWwgPSB4bWwuc2xpY2UobVswXS5sZW5ndGgpO1xuXHRcdHJldHVybiBtO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVuZC1vZi1zb3VyY2UuXG5cdCAqL1xuXG5cdGZ1bmN0aW9uIGVvcygpIHtcblx0XHRyZXR1cm4gMCA9PSB4bWwubGVuZ3RoO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrIGZvciBgcHJlZml4YC5cblx0ICovXG5cblx0ZnVuY3Rpb24gaXMocHJlZml4KSB7XG5cdFx0cmV0dXJuIDAgPT0geG1sLmluZGV4T2YocHJlZml4KTtcblx0fVxufSIsInZhciBUZW1wbGUgPSByZXF1aXJlKFwiLi90ZW1wbGVcIiksXG5cdF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIiksXG5cdERlcHMgPSByZXF1aXJlKFwiLi9kZXBzXCIpLFxuXHRFdmVudEVtaXR0ZXIgPSByZXF1aXJlKFwiZXZlbnRzXCIpLkV2ZW50RW1pdHRlcjtcblxudmFyIFNjb3BlID1cbm1vZHVsZS5leHBvcnRzID0gdXRpbC5zdWJjbGFzcyhFdmVudEVtaXR0ZXIsIHtcblxuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24odmFsLCBwYXJlbnQpIHtcblx0XHRFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKTtcblx0XHRcblx0XHR0aGlzLnZhbHVlID0gdmFsO1xuXHRcdHRoaXMucGFyZW50ID0gbnVsbDtcblx0XHR0aGlzLmNsb3NlZCA9IGZhbHNlO1xuXHRcdHRoaXMuaGlkZGVuID0ge307XG5cdFx0dGhpcy5fZGVwcyA9IHt9O1xuXHRcdFxuXHRcdGlmIChwYXJlbnQgIT0gbnVsbCkgdGhpcy5hdHRhY2gocGFyZW50KTsgXG5cdH0sXG5cblx0X2F0dGFjaDogZnVuY3Rpb24ocGFyZW50KSB7XG5cdFx0aWYgKCEocGFyZW50IGluc3RhbmNlb2YgU2NvcGUpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHNjb3BlIHRvIGF0dGFjaCB0by5cIik7XG5cblx0XHR0aGlzLl9kZXRhY2goKTtcblx0XHR0aGlzLnBhcmVudCA9IHBhcmVudDtcblx0XHRwYXJlbnQub24oXCJjbG9zZVwiLCB0aGlzLl9wYXJlbnRFdmVudCA9IHRoaXMuX2RldGFjaC5iaW5kKHRoaXMpKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdF9kZXRhY2g6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLnBhcmVudCAhPSBudWxsKSB7XG5cdFx0XHR0aGlzLnBhcmVudC5yZW1vdmVMaXN0ZW5lcihcImNsb3NlXCIsIHRoaXMuX3BhcmVudEV2ZW50KTtcblx0XHRcdHRoaXMucGFyZW50ID0gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRzcGF3bjogZnVuY3Rpb24oc2NvcGUpIHtcblx0XHRpZiAoIShzY29wZSBpbnN0YW5jZW9mIFNjb3BlKSlcblx0XHRcdHNjb3BlID0gbmV3IFNjb3BlKHNjb3BlKTtcblx0XHRcblx0XHRzY29wZS5fYXR0YWNoKHRoaXMpO1xuXHRcdHJldHVybiBzY29wZTtcblx0fSxcblxuXHRjbG9zZTogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5jbG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuZW1pdChcImNsb3NlXCIpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGdldDogZnVuY3Rpb24ocGFydHMpIHtcblx0XHR2YXIgY3R4LCB2YWw7XG5cdFx0XG5cdFx0aWYgKF8uaXNTdHJpbmcocGFydHMpKSBwYXJ0cyA9IHV0aWwuc3BsaXRQYXRoKHBhcnRzKTtcblx0XHRpZiAoIV8uaXNBcnJheShwYXJ0cykpIHBhcnRzID0gW107XG5cblx0XHQvLyBkb24ndCB0cmF2ZXJzZSBwYXJlbnRzIGlmIHNwZWNpZmllZFxuXHRcdGlmIChwYXJ0c1swXSA9PT0gXCJ0aGlzXCIgfHwgcGFydHNbMF0gPT09IFwiXCIpIHtcblx0XHRcdHZhbCA9IHRoaXMuX2ZpbmQocGFydHMuc2xpY2UoMSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjdHggPSB0aGlzO1xuXG5cdFx0XHR3aGlsZSAoY3R4ICE9IG51bGwpIHtcblx0XHRcdFx0dmFsID0gY3R4Ll9maW5kKHBhcnRzLCB0aGlzKTtcblx0XHRcdFx0aWYgKHZhbCAhPSBudWxsKSBicmVhaztcblx0XHRcdFx0Y3R4ID0gY3R4LnBhcmVudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoRGVwcy5hY3RpdmUpIHRoaXMuZGVwZW5kKHBhcnRzKTtcblx0XHRyZXR1cm4gdmFsO1xuXHR9LFxuXG5cdF9maW5kOiBmdW5jdGlvbihwYXJ0cywgY3R4KSB7XG5cdFx0aWYgKF8uaXNTdHJpbmcocGFydHMpKSBwYXJ0cyA9IHV0aWwuc3BsaXRQYXRoKHBhcnRzKTtcblx0XHRpZiAoIV8uaXNBcnJheShwYXJ0cykpIHBhcnRzID0gW107XG5cdFx0dmFyIHZhbCA9IHRoaXMuX2dldCh0aGlzLnZhbHVlLCBwYXJ0cywgY3R4KTtcblx0XHRpZiAodmFsID09IG51bGwpIHZhbCA9IHRoaXMuX2dldCh0aGlzLmhpZGRlbiwgcGFydHMsIGN0eCk7XG5cdFx0cmV0dXJuIHZhbDtcblx0fSxcblxuXHRfZ2V0OiBmdW5jdGlvbihvYmosIHBhcnRzLCBjdHgpIHtcblx0XHRwYXJ0cyA9ICFfLmlzQXJyYXkocGFydHMpID8gW10gOiBwYXJ0cy5zbGljZSgwKTtcblxuXHRcdHdoaWxlIChwYXJ0cy5sZW5ndGgpIHtcblx0XHRcdGlmIChvYmogPT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0b2JqID0gb2JqW3BhcnRzLnNoaWZ0KCldO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygb2JqID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRcdG9iaiA9IG9iai5jYWxsKGN0eCwgY3R4KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gb2JqO1xuXHR9LFxuXG5cdGRlcGVuZDogZnVuY3Rpb24ocGF0aCkge1xuXHRcdGlmIChfLmlzU3RyaW5nKHBhdGgpKSBwYXRoID0gdXRpbC5zcGxpdFBhdGgocGF0aCk7XG5cdFx0cGF0aCA9IHV0aWwuam9pblBhdGgocGF0aCk7XG5cdFx0dmFyIGRlcCA9IHRoaXMuX2RlcHNbcGF0aF07XG5cblx0XHQvLyBjcmVhdGUgaWYgZG9lc24ndCBleGlzdFxuXHRcdGlmIChkZXAgPT0gbnVsbCkge1xuXHRcdFx0ZGVwID0gdGhpcy5fZGVwc1twYXRoXSA9IG5ldyBEZXBzLkRlcGVuZGVuY3k7XG5cdFx0XHRkZXAuX29ic2VydmVyID0gdGhpcy5vYnNlcnZlKHBhdGgsIGZ1bmN0aW9uKCkgeyBkZXAuY2hhbmdlZCgpOyB9KTtcblx0XHR9XG5cblx0XHRkZXAuZGVwZW5kKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0c2V0OiBmdW5jdGlvbihrZXksIHZhbCkge1xuXHRcdHZhciBtaXhpbiA9IGtleSxcblx0XHRcdHNlbGYgPSB0aGlzLFxuXHRcdFx0cGFydHMsIGN1ciwgcGFydCwgY2hhbmdlcztcblxuXHRcdGlmICh0eXBlb2Yga2V5ID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRtaXhpbiA9IHt9O1xuXHRcdFx0cGFydHMgPSB1dGlsLnNwbGl0UGF0aChrZXkpO1xuXHRcdFx0Y3VyID0gbWl4aW47XG5cblx0XHRcdHdoaWxlIChwYXJ0cy5sZW5ndGgpIHtcblx0XHRcdFx0cGFydCA9IHBhcnRzLnNoaWZ0KCk7XG5cdFx0XHRcdGN1ciA9IChjdXJbcGFydF0gPSBwYXJ0cy5sZW5ndGggPT09IDAgPyB2YWwgOiB7fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZSA9IHRoaXMuX3NldCh0aGlzLnZhbHVlLCBtaXhpbiwgY2hhbmdlcyA9IFtdKTtcblx0XHRcblx0XHRjaGFuZ2VzLmZvckVhY2goZnVuY3Rpb24oYXJncykge1xuXHRcdFx0dGhpcy5lbWl0LmFwcGx5KHRoaXMsIFtcImNoYW5nZVwiXS5jb25jYXQoYXJncykpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0X3NldDogZnVuY3Rpb24oYmFzZSwgbWl4aW4sIGNoYW5nZXMsIGtleXMpIHtcblx0XHR2YXIgb2xkdmFsLCBrLCBfY2hhbmdlcztcblxuXHRcdGlmIChrZXlzID09IG51bGwpIGtleXMgPSBbXTtcblxuXHRcdC8vIGdlbmVyaWMgb2JqZWN0cyBhcmUgZGVlcCBjb3BpZWQgb250byBiYXNlXG5cdFx0aWYgKHV0aWwuaXNHZW5lcmljT2JqZWN0KG1peGluKSkge1xuXHRcdFx0aWYgKCF1dGlsLmlzR2VuZXJpY09iamVjdChiYXNlKSkge1xuXHRcdFx0XHRvbGR2YWwgPSBiYXNlO1xuXHRcdFx0XHRiYXNlID0ge307XG5cdFx0XHRcdF9jaGFuZ2VzID0gY2hhbmdlcztcblx0XHRcdFx0Y2hhbmdlcyA9IG51bGw7XG5cdFx0XHR9XG5cdFx0XHRcdFxuXHRcdFx0Zm9yIChrIGluIG1peGluKSB7XG5cdFx0XHRcdGJhc2Vba10gPSB0aGlzLl9zZXQoYmFzZVtrXSwgbWl4aW5ba10sIGNoYW5nZXMsIGtleXMuY29uY2F0KGspKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKF8uaXNBcnJheShfY2hhbmdlcykpIF9jaGFuZ2VzLnB1c2goWyBrZXlzLCBiYXNlLCBvbGR2YWwgXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChfLmlzQXJyYXkoY2hhbmdlcykpIGNoYW5nZXMucHVzaChbIGtleXMsIG1peGluLCBiYXNlIF0pO1xuXHRcdFx0YmFzZSA9IG1peGluO1xuXHRcdH1cblxuXHRcdHJldHVybiBiYXNlO1xuXHR9LFxuXG5cdHVuc2V0OiBmdW5jdGlvbihwYXJ0cykge1xuXHRcdHZhciBpbml0aWFsLCBkYXRhLCBvbGR2YWwsIGxhc3Q7XG5cblx0XHRwYXJ0cyA9IF8uaXNTdHJpbmcocGFydHMpID8gdXRpbC5zcGxpdFBhdGgocGFydHMpIDogcGFydHMgIT0gbnVsbCA/IHBhcnRzIDogW107XG5cblx0XHRpZiAoIXBhcnRzLmxlbmd0aCkge1xuXHRcdFx0b2xkdmFsID0gdGhpcy52YWx1ZTtcblx0XHRcdGRlbGV0ZSB0aGlzLnZhbHVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbml0aWFsID0gXy5pbml0aWFsKHBhcnRzKTtcblx0XHRcdGRhdGEgPSB0aGlzLnZhbHVlO1xuXG5cdFx0XHR3aGlsZSAoaW5pdGlhbC5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKCF1dGlsLmlzR2VuZXJpY09iamVjdChkYXRhKSkgcmV0dXJuIHRoaXM7XG5cdFx0XHRcdGRhdGEgPSBkYXRhW2luaXRpYWwuc2hpZnQoKV07XG5cdFx0XHR9XG5cblx0XHRcdGlmICh1dGlsLmlzR2VuZXJpY09iamVjdChkYXRhKSkge1xuXHRcdFx0XHRsYXN0ID0gXy5sYXN0KHBhcnRzKTtcblx0XHRcdFx0b2xkdmFsID0gZGF0YVtsYXN0XTtcblx0XHRcdFx0ZGVsZXRlIGRhdGFbbGFzdF07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG9sZHZhbCAhPSBudWxsKSB0aGlzLmVtaXQoXCJjaGFuZ2VcIiwgcGFydHMsIHZvaWQgMCwgb2xkdmFsKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdG9ic2VydmU6IGZ1bmN0aW9uKHBhdGgsIGZuKSB7XG5cdFx0aWYgKCFfLmlzRnVuY3Rpb24oZm4pKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSBmdW5jdGlvbi5cIik7XG5cblx0XHR2YXIgbWF0Y2hQYXJ0cyA9IF8uaXNBcnJheShwYXRoKSA/IHBhdGggOiB1dGlsLnBhcnNlUGF0aChwYXRoKSxcblx0XHRcdHNlbGYgPSB0aGlzO1xuXG5cdFx0dGhpcy5vbihcImNoYW5nZVwiLCBvbkNoYW5nZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFydHM6IG1hdGNoUGFydHMsXG5cdFx0XHRzdG9wOiBmdW5jdGlvbigpIHtcblx0XHRcdFx0c2VsZi5yZW1vdmVMaXN0ZW5lcihcImNoYW5nZVwiLCBvbkNoYW5nZSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGZ1bmN0aW9uIG9uQ2hhbmdlKGtleXMsIG5ld3ZhbCwgb2xkdmFsKSB7XG5cdFx0XHR2YXIgcGFydHMsIHBhcnQsIGJhc2UsIHBhdGhzO1xuXG5cdFx0XHQvLyBjbG9uZSBwYXJ0cyBzbyB3ZSBkb24ndCBhZmZlY3QgdGhlIG9yaWdpbmFsXG5cdFx0XHRwYXJ0cyA9IG1hdGNoUGFydHMuc2xpY2UoMCk7XG5cdFx0XHRcblx0XHRcdC8vIHRyYXZlcnNlIHRocm91Z2ggY3BhcnRzXG5cdFx0XHQvLyBhIG1pc21hdGNoIG1lYW5zIHdlIGRvbid0IG5lZWQgdG8gYmUgaGVyZVxuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBrZXlzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHBhcnQgPSBwYXJ0cy5zaGlmdCgpO1xuXHRcdFx0XHRpZiAoXy5pc1JlZ0V4cChwYXJ0KSAmJiBwYXJ0LnRlc3Qoa2V5c1tpXSkpIGNvbnRpbnVlO1xuXHRcdFx0XHRpZiAocGFydCA9PT0gXCIqKlwiKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coXCJzdGFyIHN0YXIhXCIpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGFydCAhPT0ga2V5c1tpXSkgcmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRwYXRocyA9IFtdO1xuXHRcdFx0YmFzZSA9IHV0aWwuam9pblBhdGgoa2V5cyk7XG5cblx0XHRcdC8vIGdlbmVyYXRlIGEgbGlzdCBvZiBlZmZlY3RlZCBwYXRoc1xuXHRcdFx0Z2VuZXJhdGVQYXRocyhuZXd2YWwsIHBhcnRzLCBwYXRocyk7XG5cdFx0XHRnZW5lcmF0ZVBhdGhzKG9sZHZhbCwgcGFydHMsIHBhdGhzKTtcblx0XHRcdHBhdGhzID0gXy51bmlxdWUocGF0aHMpO1xuXG5cdFx0XHQvLyBmaXJlIHRoZSBjYWxsYmFjayBvbiBlYWNoIHBhdGggdGhhdCBjaGFuZ2VkXG5cdFx0XHRwYXRocy5mb3JFYWNoKGZ1bmN0aW9uKGtleXMpIHtcblx0XHRcdFx0dmFyIG52YWwgPSBzZWxmLl9nZXQobmV3dmFsLCBrZXlzKSxcblx0XHRcdFx0XHRvdmFsID0gc2VsZi5fZ2V0KG9sZHZhbCwga2V5cyk7XG5cblx0XHRcdFx0aWYgKG52YWwgIT09IG92YWwpIHtcblx0XHRcdFx0XHRmbi5jYWxsKHNlbGYsIG52YWwsIG92YWwsIHV0aWwuam9pblBhdGgoYmFzZSwga2V5cykpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxufSk7XG5cbi8vIHJlY3Vyc2l2ZWx5IHNlYXJjaCBvYmogb2YgYWxsIHBhdGhzIHRoYXQgbWF0Y2ggcGFydHNcbmZ1bmN0aW9uIGdlbmVyYXRlUGF0aHMob2JqLCBwYXJ0cywgcGF0aHMsIGJhc2UpIHtcblx0aWYgKHBhdGhzID09IG51bGwpIHBhdGhzID0gW107XG5cdGlmIChiYXNlID09IG51bGwpIGJhc2UgPSBbXTtcblxuXHRpZiAoIXBhcnRzLmxlbmd0aCkge1xuXHRcdHBhdGhzLnB1c2goYmFzZSk7XG5cdFx0cmV0dXJuIHBhdGhzO1xuXHR9XG5cblx0aWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcGF0aHM7XG5cblx0dmFyIHBhcnQgPSBwYXJ0c1swXSxcblx0XHRyZXN0ID0gcGFydHMuc2xpY2UoMSk7XG5cblx0aWYgKF8uaXNSZWdFeHAocGFydCkpIHtcblx0XHRmb3IgKHZhciBrIGluIG9iaikge1xuXHRcdFx0aWYgKHBhcnQudGVzdChrKSkgZ2VuZXJhdGVQYXRocyhvYmpba10sIHJlc3QsIHBhdGhzLCBiYXNlLmNvbmNhdChrKSk7XG5cdFx0fVxuXHR9IGVsc2UgaWYgKHBhcnQgPT09IFwiKipcIikge1xuXHRcdGNvbnNvbGUubG9nKFwic3RhciBzdGFyIVwiKTtcblx0fSBlbHNlIHtcblx0XHRnZW5lcmF0ZVBhdGhzKG9ialtwYXJ0XSwgcmVzdCwgcGF0aHMsIGJhc2UuY29uY2F0KHBhcnQpKTtcblx0fVxuXG5cdHJldHVybiBwYXRocztcbn0iLCJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZShcImV2ZW50c1wiKS5FdmVudEVtaXR0ZXIsXG5cdF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbi8vIGJhc2UgcHJvdG90eXBlXG52YXIgcHJvdG8gPSB7XG5cblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKHRlbXBsYXRlLCBzY29wZSkge1xuXHRcdGlmICghKHRoaXMgaW5zdGFuY2VvZiBUZW1wbGUpKVxuXHRcdFx0cmV0dXJuIG5ldyAodGhpcy5wcm90b3R5cGUuY29uc3RydWN0b3IpKHRlbXBsYXRlLCBzY29wZSk7XG5cdFx0XG5cdFx0RXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cdFx0dGhpcy5fZGVwcyA9IHt9O1xuXHRcdHRoaXMuX29ic2VydmVycyA9IFtdO1xuXHRcdHRoaXMuc2NvcGUoc2NvcGUgfHwge30pO1xuXG5cdFx0dGVtcGxhdGUgPSB0ZW1wbGF0ZSB8fCB0aGlzLnRlbXBsYXRlO1xuXHRcdGlmICh0ZW1wbGF0ZSAhPSBudWxsKSB0aGlzLnNldFRlbXBsYXRlKHRlbXBsYXRlKTtcblx0fSxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbigpIHt9LFxuXG5cdHVzZTogZnVuY3Rpb24oZm4pIHtcblx0XHR2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpO1xuXHRcdGFyZ3MudW5zaGlmdCh0aGlzKTtcblx0XHRmbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhdXRvcnVuOiBmdW5jdGlvbihmbikge1xuXHRcdHJldHVybiBUZW1wbGUuRGVwcy5hdXRvcnVuKGZuLmJpbmQodGhpcykpO1xuXHR9LFxuXG5cdHNjb3BlOiBmdW5jdGlvbihzY29wZSkge1xuXHRcdGlmIChzY29wZSA9PSBudWxsKSByZXR1cm4gdGhpcy5fc2NvcGU7XG5cblx0XHRpZiAoIShzY29wZSBpbnN0YW5jZW9mIFRlbXBsZS5TY29wZSkpXG5cdFx0XHRzY29wZSA9IG5ldyBUZW1wbGUuU2NvcGUoc2NvcGUsIHRoaXMuX3Njb3BlKTtcblxuXHRcdC8vIFRoaXMgaXMgcGFydGljdWxhcmx5IHdlYWsuIE9ubHkgdGhlIGZpcnN0IHNjb3BlIHBhc3NlZFxuXHRcdC8vIGlzIHVzZWZ1bCwgYWZ0ZXIgdGhhdCBwYXNzaW5nIGluIHNjb3BlIG9iamVjdHMganVzdFxuXHRcdC8vIHJlcGxhY2VzIHRoZSB3aG9sZSB0cmVlLlxuXHRcdHRoaXMuX3Njb3BlID0gc2NvcGU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Z2V0OiBmdW5jdGlvbihwYXRoKSB7IHJldHVybiB0aGlzLl9zY29wZS5nZXQocGF0aCk7IH0sXG5cdGRlcGVuZDogZnVuY3Rpb24ocGF0aCkgeyByZXR1cm4gdGhpcy5fc2NvcGUuZGVwZW5kKHBhdGgpOyB9LFxuXHRzZXQ6IGZ1bmN0aW9uKHBhdGgsIHZhbCkgeyByZXR1cm4gdGhpcy5fc2NvcGUuc2V0KHBhdGgsIHZhbCk7IH0sXG5cdHVuc2V0OiBmdW5jdGlvbihwYXRoKSB7IHJldHVybiB0aGlzLl9zY29wZS51bnNldChwYXRoKTsgfSxcblx0b2JzZXJ2ZTogZnVuY3Rpb24ocGF0aCwgZm4pIHsgcmV0dXJuIHRoaXMuX3Njb3BlLm9ic2VydmUocGF0aCwgZm4pOyB9XG5cbn07XG5cbi8vIGNvcmUgbWV0aG9kc1xudmFyIGNvcmUgPSBbXG5cdHJlcXVpcmUoXCIuL2RvbVwiKSxcdC8vIERPTSBIYW5kbGVyXG5dO1xuXG5jb3JlLmZvckVhY2goZnVuY3Rpb24obWV0aG9kcykge1xuXHRmb3IgKHZhciBtZXRob2QgaW4gbWV0aG9kcykge1xuXHRcdHByb3RvW21ldGhvZF0gPSBtZXRob2RzW21ldGhvZF07XG5cdH1cbn0pO1xuXG4vLyBleHBvcnRcbnZhciBUZW1wbGUgPVxubW9kdWxlLmV4cG9ydHMgPSB1dGlsLnN1YmNsYXNzKEV2ZW50RW1pdHRlciwgcHJvdG8pO1xuXG4vLyBjbGFzcyBwcm9wZXJ0aWVzL21ldGhvZHNcblRlbXBsZS5leHRlbmQgPSB1dGlsLnN1YmNsYXNzLmJpbmQobnVsbCwgVGVtcGxlKTtcblRlbXBsZS5wYXJzZSA9IHJlcXVpcmUoXCIuL3BhcnNlXCIpO1xuVGVtcGxlLkRlcHMgPSByZXF1aXJlKFwiLi9kZXBzXCIpO1xuVGVtcGxlLlNjb3BlID0gcmVxdWlyZShcIi4vc2NvcGVcIik7IiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcblxudmFyIGlzR2VuZXJpY09iamVjdCA9XG5leHBvcnRzLmlzR2VuZXJpY09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gb2JqICE9IG51bGwgJiYgb2JqLl9fcHJvdG9fXyA9PT0gT2JqZWN0LnByb3RvdHlwZTtcbn1cblxudmFyIHNwbGl0UGF0aCA9XG5leHBvcnRzLnNwbGl0UGF0aCA9IGZ1bmN0aW9uKHBhdGgpIHtcblx0dmFyIHBhcnRzID0gdHlwZW9mIHBhdGggIT09IFwic3RyaW5nXCIgPyBbXSA6IHBhdGguc3BsaXQoXCIuXCIpO1xuXHRpZiAocGFydHNbMF0gPT09IFwiXCIpIHBhcnRzWzBdID0gXCJ0aGlzXCI7XG5cdHJldHVybiBfLmNvbXBhY3QocGFydHMpO1xufVxuXG52YXIgcGFyc2VQYXRoID1cbmV4cG9ydHMucGFyc2VQYXRoID0gZnVuY3Rpb24ocGF0aCkge1xuXHRyZXR1cm4gc3BsaXRQYXRoKHBhdGgpLm1hcChmdW5jdGlvbihwYXJ0KSB7XG5cdFx0aWYgKHBhcnQuaW5kZXhPZihcIipcIikgPiAtMSAmJiBwYXJ0ICE9PSBcIioqXCIpIHtcblx0XHRcdHJldHVybiBuZXcgUmVnRXhwKFwiXlwiICsgcGFydC5zcGxpdChcIipcIikuam9pbihcIihbXlxcXFwuXSopXCIpICsgXCIkXCIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9KTtcbn1cblxudmFyIGpvaW5QYXRoID1cbmV4cG9ydHMuam9pblBhdGggPSBmdW5jdGlvbigpIHtcblx0cmV0dXJuIF8uY29tcGFjdChfLmZsYXR0ZW4oXy50b0FycmF5KGFyZ3VtZW50cykpKS5qb2luKFwiLlwiKTtcbn1cblxudmFyIHN1YmNsYXNzID1cbmV4cG9ydHMuc3ViY2xhc3MgPSBmdW5jdGlvbihwYXJlbnQsIHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7XG5cdHZhciBjaGlsZDtcblxuXHQvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG5cdC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuXHQvLyBieSB1cyB0byBzaW1wbHkgY2FsbCB0aGUgcGFyZW50J3MgY29uc3RydWN0b3IuXG5cdGlmIChwcm90b1Byb3BzICYmIF8uaGFzKHByb3RvUHJvcHMsICdjb25zdHJ1Y3RvcicpKSB7XG5cdFx0Y2hpbGQgPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdGNoaWxkID0gZnVuY3Rpb24oKXsgcmV0dXJuIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9O1xuXHR9XG5cblx0Ly8gQWRkIHN0YXRpYyBwcm9wZXJ0aWVzIHRvIHRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiwgaWYgc3VwcGxpZWQuXG5cdF8uZXh0ZW5kKGNoaWxkLCBwYXJlbnQsIHN0YXRpY1Byb3BzKTtcblxuXHQvLyBTZXQgdGhlIHByb3RvdHlwZSBjaGFpbiB0byBpbmhlcml0IGZyb20gYHBhcmVudGAsIHdpdGhvdXQgY2FsbGluZ1xuXHQvLyBgcGFyZW50YCdzIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLlxuXHR2YXIgU3Vycm9nYXRlID0gZnVuY3Rpb24oKXsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9O1xuXHRTdXJyb2dhdGUucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcblx0Y2hpbGQucHJvdG90eXBlID0gbmV3IFN1cnJvZ2F0ZTtcblxuXHQvLyBBZGQgcHJvdG90eXBlIHByb3BlcnRpZXMgKGluc3RhbmNlIHByb3BlcnRpZXMpIHRvIHRoZSBzdWJjbGFzcyxcblx0Ly8gaWYgc3VwcGxpZWQuXG5cdGlmIChwcm90b1Byb3BzKSBfLmV4dGVuZChjaGlsZC5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuXG5cdC8vIFNldCBhIGNvbnZlbmllbmNlIHByb3BlcnR5IGluIGNhc2UgdGhlIHBhcmVudCdzIHByb3RvdHlwZSBpcyBuZWVkZWRcblx0Ly8gbGF0ZXIuXG5cdGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cblx0cmV0dXJuIGNoaWxkO1xufSIsIi8vIGh0dHA6Ly93aWtpLmNvbW1vbmpzLm9yZy93aWtpL1VuaXRfVGVzdGluZy8xLjBcbi8vXG4vLyBUSElTIElTIE5PVCBURVNURUQgTk9SIExJS0VMWSBUTyBXT1JLIE9VVFNJREUgVjghXG4vL1xuLy8gT3JpZ2luYWxseSBmcm9tIG5hcndoYWwuanMgKGh0dHA6Ly9uYXJ3aGFsanMub3JnKVxuLy8gQ29weXJpZ2h0IChjKSAyMDA5IFRob21hcyBSb2JpbnNvbiA8Mjgwbm9ydGguY29tPlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhIGNvcHlcbi8vIG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlICdTb2Z0d2FyZScpLCB0b1xuLy8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nIHdpdGhvdXQgbGltaXRhdGlvbiB0aGVcbi8vIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vclxuLy8gc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0IHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXNcbi8vIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWQgaW5cbi8vIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCAnQVMgSVMnLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTIE9SXG4vLyBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSxcbi8vIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRVxuLy8gQVVUSE9SUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSwgREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU5cbi8vIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUiBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT05cbi8vIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRSBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyB3aGVuIHVzZWQgaW4gbm9kZSwgdGhpcyB3aWxsIGFjdHVhbGx5IGxvYWQgdGhlIHV0aWwgbW9kdWxlIHdlIGRlcGVuZCBvblxuLy8gdmVyc3VzIGxvYWRpbmcgdGhlIGJ1aWx0aW4gdXRpbCBtb2R1bGUgYXMgaGFwcGVucyBvdGhlcndpc2Vcbi8vIHRoaXMgaXMgYSBidWcgaW4gbm9kZSBtb2R1bGUgbG9hZGluZyBhcyBmYXIgYXMgSSBhbSBjb25jZXJuZWRcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbC8nKTtcblxudmFyIHBTbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbnZhciBoYXNPd24gPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG4vLyAxLiBUaGUgYXNzZXJ0IG1vZHVsZSBwcm92aWRlcyBmdW5jdGlvbnMgdGhhdCB0aHJvd1xuLy8gQXNzZXJ0aW9uRXJyb3IncyB3aGVuIHBhcnRpY3VsYXIgY29uZGl0aW9ucyBhcmUgbm90IG1ldC4gVGhlXG4vLyBhc3NlcnQgbW9kdWxlIG11c3QgY29uZm9ybSB0byB0aGUgZm9sbG93aW5nIGludGVyZmFjZS5cblxudmFyIGFzc2VydCA9IG1vZHVsZS5leHBvcnRzID0gb2s7XG5cbi8vIDIuIFRoZSBBc3NlcnRpb25FcnJvciBpcyBkZWZpbmVkIGluIGFzc2VydC5cbi8vIG5ldyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3IoeyBtZXNzYWdlOiBtZXNzYWdlLFxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGFjdHVhbDogYWN0dWFsLFxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4cGVjdGVkOiBleHBlY3RlZCB9KVxuXG5hc3NlcnQuQXNzZXJ0aW9uRXJyb3IgPSBmdW5jdGlvbiBBc3NlcnRpb25FcnJvcihvcHRpb25zKSB7XG4gIHRoaXMubmFtZSA9ICdBc3NlcnRpb25FcnJvcic7XG4gIHRoaXMuYWN0dWFsID0gb3B0aW9ucy5hY3R1YWw7XG4gIHRoaXMuZXhwZWN0ZWQgPSBvcHRpb25zLmV4cGVjdGVkO1xuICB0aGlzLm9wZXJhdG9yID0gb3B0aW9ucy5vcGVyYXRvcjtcbiAgaWYgKG9wdGlvbnMubWVzc2FnZSkge1xuICAgIHRoaXMubWVzc2FnZSA9IG9wdGlvbnMubWVzc2FnZTtcbiAgICB0aGlzLmdlbmVyYXRlZE1lc3NhZ2UgPSBmYWxzZTtcbiAgfSBlbHNlIHtcbiAgICB0aGlzLm1lc3NhZ2UgPSBnZXRNZXNzYWdlKHRoaXMpO1xuICAgIHRoaXMuZ2VuZXJhdGVkTWVzc2FnZSA9IHRydWU7XG4gIH1cbiAgdmFyIHN0YWNrU3RhcnRGdW5jdGlvbiA9IG9wdGlvbnMuc3RhY2tTdGFydEZ1bmN0aW9uIHx8IGZhaWw7XG5cbiAgaWYgKEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKSB7XG4gICAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UodGhpcywgc3RhY2tTdGFydEZ1bmN0aW9uKTtcbiAgfVxuICBlbHNlIHtcbiAgICAvLyBub24gdjggYnJvd3NlcnMgc28gd2UgY2FuIGhhdmUgYSBzdGFja3RyYWNlXG4gICAgdmFyIGVyciA9IG5ldyBFcnJvcigpO1xuICAgIGlmIChlcnIuc3RhY2spIHtcbiAgICAgIHZhciBvdXQgPSBlcnIuc3RhY2s7XG5cbiAgICAgIC8vIHRyeSB0byBzdHJpcCB1c2VsZXNzIGZyYW1lc1xuICAgICAgdmFyIGZuX25hbWUgPSBzdGFja1N0YXJ0RnVuY3Rpb24ubmFtZTtcbiAgICAgIHZhciBpZHggPSBvdXQuaW5kZXhPZignXFxuJyArIGZuX25hbWUpO1xuICAgICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICAgIC8vIG9uY2Ugd2UgaGF2ZSBsb2NhdGVkIHRoZSBmdW5jdGlvbiBmcmFtZVxuICAgICAgICAvLyB3ZSBuZWVkIHRvIHN0cmlwIG91dCBldmVyeXRoaW5nIGJlZm9yZSBpdCAoYW5kIGl0cyBsaW5lKVxuICAgICAgICB2YXIgbmV4dF9saW5lID0gb3V0LmluZGV4T2YoJ1xcbicsIGlkeCArIDEpO1xuICAgICAgICBvdXQgPSBvdXQuc3Vic3RyaW5nKG5leHRfbGluZSArIDEpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLnN0YWNrID0gb3V0O1xuICAgIH1cbiAgfVxufTtcblxuLy8gYXNzZXJ0LkFzc2VydGlvbkVycm9yIGluc3RhbmNlb2YgRXJyb3JcbnV0aWwuaW5oZXJpdHMoYXNzZXJ0LkFzc2VydGlvbkVycm9yLCBFcnJvcik7XG5cbmZ1bmN0aW9uIHJlcGxhY2VyKGtleSwgdmFsdWUpIHtcbiAgaWYgKHV0aWwuaXNVbmRlZmluZWQodmFsdWUpKSB7XG4gICAgcmV0dXJuICcnICsgdmFsdWU7XG4gIH1cbiAgaWYgKHV0aWwuaXNOdW1iZXIodmFsdWUpICYmIChpc05hTih2YWx1ZSkgfHwgIWlzRmluaXRlKHZhbHVlKSkpIHtcbiAgICByZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcbiAgfVxuICBpZiAodXRpbC5pc0Z1bmN0aW9uKHZhbHVlKSB8fCB1dGlsLmlzUmVnRXhwKHZhbHVlKSkge1xuICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICB9XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gdHJ1bmNhdGUocywgbikge1xuICBpZiAodXRpbC5pc1N0cmluZyhzKSkge1xuICAgIHJldHVybiBzLmxlbmd0aCA8IG4gPyBzIDogcy5zbGljZSgwLCBuKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gcztcbiAgfVxufVxuXG5mdW5jdGlvbiBnZXRNZXNzYWdlKHNlbGYpIHtcbiAgcmV0dXJuIHRydW5jYXRlKEpTT04uc3RyaW5naWZ5KHNlbGYuYWN0dWFsLCByZXBsYWNlciksIDEyOCkgKyAnICcgK1xuICAgICAgICAgc2VsZi5vcGVyYXRvciArICcgJyArXG4gICAgICAgICB0cnVuY2F0ZShKU09OLnN0cmluZ2lmeShzZWxmLmV4cGVjdGVkLCByZXBsYWNlciksIDEyOCk7XG59XG5cbi8vIEF0IHByZXNlbnQgb25seSB0aGUgdGhyZWUga2V5cyBtZW50aW9uZWQgYWJvdmUgYXJlIHVzZWQgYW5kXG4vLyB1bmRlcnN0b29kIGJ5IHRoZSBzcGVjLiBJbXBsZW1lbnRhdGlvbnMgb3Igc3ViIG1vZHVsZXMgY2FuIHBhc3Ncbi8vIG90aGVyIGtleXMgdG8gdGhlIEFzc2VydGlvbkVycm9yJ3MgY29uc3RydWN0b3IgLSB0aGV5IHdpbGwgYmVcbi8vIGlnbm9yZWQuXG5cbi8vIDMuIEFsbCBvZiB0aGUgZm9sbG93aW5nIGZ1bmN0aW9ucyBtdXN0IHRocm93IGFuIEFzc2VydGlvbkVycm9yXG4vLyB3aGVuIGEgY29ycmVzcG9uZGluZyBjb25kaXRpb24gaXMgbm90IG1ldCwgd2l0aCBhIG1lc3NhZ2UgdGhhdFxuLy8gbWF5IGJlIHVuZGVmaW5lZCBpZiBub3QgcHJvdmlkZWQuICBBbGwgYXNzZXJ0aW9uIG1ldGhvZHMgcHJvdmlkZVxuLy8gYm90aCB0aGUgYWN0dWFsIGFuZCBleHBlY3RlZCB2YWx1ZXMgdG8gdGhlIGFzc2VydGlvbiBlcnJvciBmb3Jcbi8vIGRpc3BsYXkgcHVycG9zZXMuXG5cbmZ1bmN0aW9uIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgb3BlcmF0b3IsIHN0YWNrU3RhcnRGdW5jdGlvbikge1xuICB0aHJvdyBuZXcgYXNzZXJ0LkFzc2VydGlvbkVycm9yKHtcbiAgICBtZXNzYWdlOiBtZXNzYWdlLFxuICAgIGFjdHVhbDogYWN0dWFsLFxuICAgIGV4cGVjdGVkOiBleHBlY3RlZCxcbiAgICBvcGVyYXRvcjogb3BlcmF0b3IsXG4gICAgc3RhY2tTdGFydEZ1bmN0aW9uOiBzdGFja1N0YXJ0RnVuY3Rpb25cbiAgfSk7XG59XG5cbi8vIEVYVEVOU0lPTiEgYWxsb3dzIGZvciB3ZWxsIGJlaGF2ZWQgZXJyb3JzIGRlZmluZWQgZWxzZXdoZXJlLlxuYXNzZXJ0LmZhaWwgPSBmYWlsO1xuXG4vLyA0LiBQdXJlIGFzc2VydGlvbiB0ZXN0cyB3aGV0aGVyIGEgdmFsdWUgaXMgdHJ1dGh5LCBhcyBkZXRlcm1pbmVkXG4vLyBieSAhIWd1YXJkLlxuLy8gYXNzZXJ0Lm9rKGd1YXJkLCBtZXNzYWdlX29wdCk7XG4vLyBUaGlzIHN0YXRlbWVudCBpcyBlcXVpdmFsZW50IHRvIGFzc2VydC5lcXVhbCh0cnVlLCAhIWd1YXJkLFxuLy8gbWVzc2FnZV9vcHQpOy4gVG8gdGVzdCBzdHJpY3RseSBmb3IgdGhlIHZhbHVlIHRydWUsIHVzZVxuLy8gYXNzZXJ0LnN0cmljdEVxdWFsKHRydWUsIGd1YXJkLCBtZXNzYWdlX29wdCk7LlxuXG5mdW5jdGlvbiBvayh2YWx1ZSwgbWVzc2FnZSkge1xuICBpZiAoIXZhbHVlKSBmYWlsKHZhbHVlLCB0cnVlLCBtZXNzYWdlLCAnPT0nLCBhc3NlcnQub2spO1xufVxuYXNzZXJ0Lm9rID0gb2s7XG5cbi8vIDUuIFRoZSBlcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgc2hhbGxvdywgY29lcmNpdmUgZXF1YWxpdHkgd2l0aFxuLy8gPT0uXG4vLyBhc3NlcnQuZXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQuZXF1YWwgPSBmdW5jdGlvbiBlcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgIT0gZXhwZWN0ZWQpIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJz09JywgYXNzZXJ0LmVxdWFsKTtcbn07XG5cbi8vIDYuIFRoZSBub24tZXF1YWxpdHkgYXNzZXJ0aW9uIHRlc3RzIGZvciB3aGV0aGVyIHR3byBvYmplY3RzIGFyZSBub3QgZXF1YWxcbi8vIHdpdGggIT0gYXNzZXJ0Lm5vdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0Lm5vdEVxdWFsID0gZnVuY3Rpb24gbm90RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsID09IGV4cGVjdGVkKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnIT0nLCBhc3NlcnQubm90RXF1YWwpO1xuICB9XG59O1xuXG4vLyA3LiBUaGUgZXF1aXZhbGVuY2UgYXNzZXJ0aW9uIHRlc3RzIGEgZGVlcCBlcXVhbGl0eSByZWxhdGlvbi5cbi8vIGFzc2VydC5kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQuZGVlcEVxdWFsID0gZnVuY3Rpb24gZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKCFfZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnZGVlcEVxdWFsJywgYXNzZXJ0LmRlZXBFcXVhbCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIF9kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCkge1xuICAvLyA3LjEuIEFsbCBpZGVudGljYWwgdmFsdWVzIGFyZSBlcXVpdmFsZW50LCBhcyBkZXRlcm1pbmVkIGJ5ID09PS5cbiAgaWYgKGFjdHVhbCA9PT0gZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcblxuICB9IGVsc2UgaWYgKHV0aWwuaXNCdWZmZXIoYWN0dWFsKSAmJiB1dGlsLmlzQnVmZmVyKGV4cGVjdGVkKSkge1xuICAgIGlmIChhY3R1YWwubGVuZ3RoICE9IGV4cGVjdGVkLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhY3R1YWwubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChhY3R1YWxbaV0gIT09IGV4cGVjdGVkW2ldKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG5cbiAgLy8gNy4yLiBJZiB0aGUgZXhwZWN0ZWQgdmFsdWUgaXMgYSBEYXRlIG9iamVjdCwgdGhlIGFjdHVhbCB2YWx1ZSBpc1xuICAvLyBlcXVpdmFsZW50IGlmIGl0IGlzIGFsc28gYSBEYXRlIG9iamVjdCB0aGF0IHJlZmVycyB0byB0aGUgc2FtZSB0aW1lLlxuICB9IGVsc2UgaWYgKHV0aWwuaXNEYXRlKGFjdHVhbCkgJiYgdXRpbC5pc0RhdGUoZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuIGFjdHVhbC5nZXRUaW1lKCkgPT09IGV4cGVjdGVkLmdldFRpbWUoKTtcblxuICAvLyA3LjMgSWYgdGhlIGV4cGVjdGVkIHZhbHVlIGlzIGEgUmVnRXhwIG9iamVjdCwgdGhlIGFjdHVhbCB2YWx1ZSBpc1xuICAvLyBlcXVpdmFsZW50IGlmIGl0IGlzIGFsc28gYSBSZWdFeHAgb2JqZWN0IHdpdGggdGhlIHNhbWUgc291cmNlIGFuZFxuICAvLyBwcm9wZXJ0aWVzIChgZ2xvYmFsYCwgYG11bHRpbGluZWAsIGBsYXN0SW5kZXhgLCBgaWdub3JlQ2FzZWApLlxuICB9IGVsc2UgaWYgKHV0aWwuaXNSZWdFeHAoYWN0dWFsKSAmJiB1dGlsLmlzUmVnRXhwKGV4cGVjdGVkKSkge1xuICAgIHJldHVybiBhY3R1YWwuc291cmNlID09PSBleHBlY3RlZC5zb3VyY2UgJiZcbiAgICAgICAgICAgYWN0dWFsLmdsb2JhbCA9PT0gZXhwZWN0ZWQuZ2xvYmFsICYmXG4gICAgICAgICAgIGFjdHVhbC5tdWx0aWxpbmUgPT09IGV4cGVjdGVkLm11bHRpbGluZSAmJlxuICAgICAgICAgICBhY3R1YWwubGFzdEluZGV4ID09PSBleHBlY3RlZC5sYXN0SW5kZXggJiZcbiAgICAgICAgICAgYWN0dWFsLmlnbm9yZUNhc2UgPT09IGV4cGVjdGVkLmlnbm9yZUNhc2U7XG5cbiAgLy8gNy40LiBPdGhlciBwYWlycyB0aGF0IGRvIG5vdCBib3RoIHBhc3MgdHlwZW9mIHZhbHVlID09ICdvYmplY3QnLFxuICAvLyBlcXVpdmFsZW5jZSBpcyBkZXRlcm1pbmVkIGJ5ID09LlxuICB9IGVsc2UgaWYgKCF1dGlsLmlzT2JqZWN0KGFjdHVhbCkgJiYgIXV0aWwuaXNPYmplY3QoZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuIGFjdHVhbCA9PSBleHBlY3RlZDtcblxuICAvLyA3LjUgRm9yIGFsbCBvdGhlciBPYmplY3QgcGFpcnMsIGluY2x1ZGluZyBBcnJheSBvYmplY3RzLCBlcXVpdmFsZW5jZSBpc1xuICAvLyBkZXRlcm1pbmVkIGJ5IGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoYXMgdmVyaWZpZWRcbiAgLy8gd2l0aCBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwpLCB0aGUgc2FtZSBzZXQgb2Yga2V5c1xuICAvLyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSwgZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5XG4gIC8vIGNvcnJlc3BvbmRpbmcga2V5LCBhbmQgYW4gaWRlbnRpY2FsICdwcm90b3R5cGUnIHByb3BlcnR5LiBOb3RlOiB0aGlzXG4gIC8vIGFjY291bnRzIGZvciBib3RoIG5hbWVkIGFuZCBpbmRleGVkIHByb3BlcnRpZXMgb24gQXJyYXlzLlxuICB9IGVsc2Uge1xuICAgIHJldHVybiBvYmpFcXVpdihhY3R1YWwsIGV4cGVjdGVkKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpc0FyZ3VtZW50cyhvYmplY3QpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvYmplY3QpID09ICdbb2JqZWN0IEFyZ3VtZW50c10nO1xufVxuXG5mdW5jdGlvbiBvYmpFcXVpdihhLCBiKSB7XG4gIGlmICh1dGlsLmlzTnVsbE9yVW5kZWZpbmVkKGEpIHx8IHV0aWwuaXNOdWxsT3JVbmRlZmluZWQoYikpXG4gICAgcmV0dXJuIGZhbHNlO1xuICAvLyBhbiBpZGVudGljYWwgJ3Byb3RvdHlwZScgcHJvcGVydHkuXG4gIGlmIChhLnByb3RvdHlwZSAhPT0gYi5wcm90b3R5cGUpIHJldHVybiBmYWxzZTtcbiAgLy9+fn5JJ3ZlIG1hbmFnZWQgdG8gYnJlYWsgT2JqZWN0LmtleXMgdGhyb3VnaCBzY3Jld3kgYXJndW1lbnRzIHBhc3NpbmcuXG4gIC8vICAgQ29udmVydGluZyB0byBhcnJheSBzb2x2ZXMgdGhlIHByb2JsZW0uXG4gIGlmIChpc0FyZ3VtZW50cyhhKSkge1xuICAgIGlmICghaXNBcmd1bWVudHMoYikpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgYSA9IHBTbGljZS5jYWxsKGEpO1xuICAgIGIgPSBwU2xpY2UuY2FsbChiKTtcbiAgICByZXR1cm4gX2RlZXBFcXVhbChhLCBiKTtcbiAgfVxuICB0cnkge1xuICAgIHZhciBrYSA9IG9iamVjdEtleXMoYSksXG4gICAgICAgIGtiID0gb2JqZWN0S2V5cyhiKSxcbiAgICAgICAga2V5LCBpO1xuICB9IGNhdGNoIChlKSB7Ly9oYXBwZW5zIHdoZW4gb25lIGlzIGEgc3RyaW5nIGxpdGVyYWwgYW5kIHRoZSBvdGhlciBpc24ndFxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvLyBoYXZpbmcgdGhlIHNhbWUgbnVtYmVyIG9mIG93bmVkIHByb3BlcnRpZXMgKGtleXMgaW5jb3Jwb3JhdGVzXG4gIC8vIGhhc093blByb3BlcnR5KVxuICBpZiAoa2EubGVuZ3RoICE9IGtiLmxlbmd0aClcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vdGhlIHNhbWUgc2V0IG9mIGtleXMgKGFsdGhvdWdoIG5vdCBuZWNlc3NhcmlseSB0aGUgc2FtZSBvcmRlciksXG4gIGthLnNvcnQoKTtcbiAga2Iuc29ydCgpO1xuICAvL35+fmNoZWFwIGtleSB0ZXN0XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgaWYgKGthW2ldICE9IGtiW2ldKVxuICAgICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vZXF1aXZhbGVudCB2YWx1ZXMgZm9yIGV2ZXJ5IGNvcnJlc3BvbmRpbmcga2V5LCBhbmRcbiAgLy9+fn5wb3NzaWJseSBleHBlbnNpdmUgZGVlcCB0ZXN0XG4gIGZvciAoaSA9IGthLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAga2V5ID0ga2FbaV07XG4gICAgaWYgKCFfZGVlcEVxdWFsKGFba2V5XSwgYltrZXldKSkgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG4vLyA4LiBUaGUgbm9uLWVxdWl2YWxlbmNlIGFzc2VydGlvbiB0ZXN0cyBmb3IgYW55IGRlZXAgaW5lcXVhbGl0eS5cbi8vIGFzc2VydC5ub3REZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQubm90RGVlcEVxdWFsID0gZnVuY3Rpb24gbm90RGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKF9kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICdub3REZWVwRXF1YWwnLCBhc3NlcnQubm90RGVlcEVxdWFsKTtcbiAgfVxufTtcblxuLy8gOS4gVGhlIHN0cmljdCBlcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgc3RyaWN0IGVxdWFsaXR5LCBhcyBkZXRlcm1pbmVkIGJ5ID09PS5cbi8vIGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5zdHJpY3RFcXVhbCA9IGZ1bmN0aW9uIHN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCAhPT0gZXhwZWN0ZWQpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICc9PT0nLCBhc3NlcnQuc3RyaWN0RXF1YWwpO1xuICB9XG59O1xuXG4vLyAxMC4gVGhlIHN0cmljdCBub24tZXF1YWxpdHkgYXNzZXJ0aW9uIHRlc3RzIGZvciBzdHJpY3QgaW5lcXVhbGl0eSwgYXNcbi8vIGRldGVybWluZWQgYnkgIT09LiAgYXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0Lm5vdFN0cmljdEVxdWFsID0gZnVuY3Rpb24gbm90U3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsID09PSBleHBlY3RlZCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJyE9PScsIGFzc2VydC5ub3RTdHJpY3RFcXVhbCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGV4cGVjdGVkRXhjZXB0aW9uKGFjdHVhbCwgZXhwZWN0ZWQpIHtcbiAgaWYgKCFhY3R1YWwgfHwgIWV4cGVjdGVkKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChleHBlY3RlZCkgPT0gJ1tvYmplY3QgUmVnRXhwXScpIHtcbiAgICByZXR1cm4gZXhwZWN0ZWQudGVzdChhY3R1YWwpO1xuICB9IGVsc2UgaWYgKGFjdHVhbCBpbnN0YW5jZW9mIGV4cGVjdGVkKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gZWxzZSBpZiAoZXhwZWN0ZWQuY2FsbCh7fSwgYWN0dWFsKSA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG5mdW5jdGlvbiBfdGhyb3dzKHNob3VsZFRocm93LCBibG9jaywgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgdmFyIGFjdHVhbDtcblxuICBpZiAodXRpbC5pc1N0cmluZyhleHBlY3RlZCkpIHtcbiAgICBtZXNzYWdlID0gZXhwZWN0ZWQ7XG4gICAgZXhwZWN0ZWQgPSBudWxsO1xuICB9XG5cbiAgdHJ5IHtcbiAgICBibG9jaygpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgYWN0dWFsID0gZTtcbiAgfVxuXG4gIG1lc3NhZ2UgPSAoZXhwZWN0ZWQgJiYgZXhwZWN0ZWQubmFtZSA/ICcgKCcgKyBleHBlY3RlZC5uYW1lICsgJykuJyA6ICcuJykgK1xuICAgICAgICAgICAgKG1lc3NhZ2UgPyAnICcgKyBtZXNzYWdlIDogJy4nKTtcblxuICBpZiAoc2hvdWxkVGhyb3cgJiYgIWFjdHVhbCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgJ01pc3NpbmcgZXhwZWN0ZWQgZXhjZXB0aW9uJyArIG1lc3NhZ2UpO1xuICB9XG5cbiAgaWYgKCFzaG91bGRUaHJvdyAmJiBleHBlY3RlZEV4Y2VwdGlvbihhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgJ0dvdCB1bndhbnRlZCBleGNlcHRpb24nICsgbWVzc2FnZSk7XG4gIH1cblxuICBpZiAoKHNob3VsZFRocm93ICYmIGFjdHVhbCAmJiBleHBlY3RlZCAmJlxuICAgICAgIWV4cGVjdGVkRXhjZXB0aW9uKGFjdHVhbCwgZXhwZWN0ZWQpKSB8fCAoIXNob3VsZFRocm93ICYmIGFjdHVhbCkpIHtcbiAgICB0aHJvdyBhY3R1YWw7XG4gIH1cbn1cblxuLy8gMTEuIEV4cGVjdGVkIHRvIHRocm93IGFuIGVycm9yOlxuLy8gYXNzZXJ0LnRocm93cyhibG9jaywgRXJyb3Jfb3B0LCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC50aHJvd3MgPSBmdW5jdGlvbihibG9jaywgLypvcHRpb25hbCovZXJyb3IsIC8qb3B0aW9uYWwqL21lc3NhZ2UpIHtcbiAgX3Rocm93cy5hcHBseSh0aGlzLCBbdHJ1ZV0uY29uY2F0KHBTbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbn07XG5cbi8vIEVYVEVOU0lPTiEgVGhpcyBpcyBhbm5veWluZyB0byB3cml0ZSBvdXRzaWRlIHRoaXMgbW9kdWxlLlxuYXNzZXJ0LmRvZXNOb3RUaHJvdyA9IGZ1bmN0aW9uKGJsb2NrLCAvKm9wdGlvbmFsKi9tZXNzYWdlKSB7XG4gIF90aHJvd3MuYXBwbHkodGhpcywgW2ZhbHNlXS5jb25jYXQocFNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xufTtcblxuYXNzZXJ0LmlmRXJyb3IgPSBmdW5jdGlvbihlcnIpIHsgaWYgKGVycikge3Rocm93IGVycjt9fTtcblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciBrZXlzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoaGFzT3duLmNhbGwob2JqLCBrZXkpKSBrZXlzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4ga2V5cztcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiL1VzZXJzL1R5bGVyL0Ryb3Bib3gvQ2xpZW50cy9USkNyYXAvRGV2L3RlbXBsZS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5zZXJ0LW1vZHVsZS1nbG9iYWxzL25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanNcIiksdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KSIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gIHRoaXMuX2V2ZW50cyA9IHRoaXMuX2V2ZW50cyB8fCB7fTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gdGhpcy5fbWF4TGlzdGVuZXJzIHx8IHVuZGVmaW5lZDtcbn1cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjEwLnhcbkV2ZW50RW1pdHRlci5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX2V2ZW50cyA9IHVuZGVmaW5lZDtcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX21heExpc3RlbmVycyA9IHVuZGVmaW5lZDtcblxuLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhbiAxMCBsaXN0ZW5lcnMgYXJlXG4vLyBhZGRlZCB0byBpdC4gVGhpcyBpcyBhIHVzZWZ1bCBkZWZhdWx0IHdoaWNoIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxuRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnMgPSAxMDtcblxuLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXG4vLyB0aGF0IHRvIGJlIGluY3JlYXNlZC4gU2V0IHRvIHplcm8gZm9yIHVubGltaXRlZC5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24obikge1xuICBpZiAoIWlzTnVtYmVyKG4pIHx8IG4gPCAwIHx8IGlzTmFOKG4pKVxuICAgIHRocm93IFR5cGVFcnJvcignbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJyk7XG4gIHRoaXMuX21heExpc3RlbmVycyA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgZXIsIGhhbmRsZXIsIGxlbiwgYXJncywgaSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIElmIHRoZXJlIGlzIG5vICdlcnJvcicgZXZlbnQgbGlzdGVuZXIgdGhlbiB0aHJvdy5cbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICBpZiAoIXRoaXMuX2V2ZW50cy5lcnJvciB8fFxuICAgICAgICAoaXNPYmplY3QodGhpcy5fZXZlbnRzLmVycm9yKSAmJiAhdGhpcy5fZXZlbnRzLmVycm9yLmxlbmd0aCkpIHtcbiAgICAgIGVyID0gYXJndW1lbnRzWzFdO1xuICAgICAgaWYgKGVyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXI7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBUeXBlRXJyb3IoJ1VuY2F1Z2h0LCB1bnNwZWNpZmllZCBcImVycm9yXCIgZXZlbnQuJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNVbmRlZmluZWQoaGFuZGxlcikpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG4gICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAvLyBmYXN0IGNhc2VzXG4gICAgICBjYXNlIDE6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAvLyBzbG93ZXJcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoaXNPYmplY3QoaGFuZGxlcikpIHtcbiAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG5cbiAgICBsaXN0ZW5lcnMgPSBoYW5kbGVyLnNsaWNlKCk7XG4gICAgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgYXJncyk7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gVG8gYXZvaWQgcmVjdXJzaW9uIGluIHRoZSBjYXNlIHRoYXQgdHlwZSA9PT0gXCJuZXdMaXN0ZW5lclwiISBCZWZvcmVcbiAgLy8gYWRkaW5nIGl0IHRvIHRoZSBsaXN0ZW5lcnMsIGZpcnN0IGVtaXQgXCJuZXdMaXN0ZW5lclwiLlxuICBpZiAodGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKVxuICAgIHRoaXMuZW1pdCgnbmV3TGlzdGVuZXInLCB0eXBlLFxuICAgICAgICAgICAgICBpc0Z1bmN0aW9uKGxpc3RlbmVyLmxpc3RlbmVyKSA/XG4gICAgICAgICAgICAgIGxpc3RlbmVyLmxpc3RlbmVyIDogbGlzdGVuZXIpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIC8vIE9wdGltaXplIHRoZSBjYXNlIG9mIG9uZSBsaXN0ZW5lci4gRG9uJ3QgbmVlZCB0aGUgZXh0cmEgYXJyYXkgb2JqZWN0LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IGxpc3RlbmVyO1xuICBlbHNlIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFwcGVuZC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gIGVsc2VcbiAgICAvLyBBZGRpbmcgdGhlIHNlY29uZCBlbGVtZW50LCBuZWVkIHRvIGNoYW5nZSB0byBhcnJheS5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdLCBsaXN0ZW5lcl07XG5cbiAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcbiAgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkgJiYgIXRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQpIHtcbiAgICB2YXIgbTtcbiAgICBpZiAoIWlzVW5kZWZpbmVkKHRoaXMuX21heExpc3RlbmVycykpIHtcbiAgICAgIG0gPSB0aGlzLl9tYXhMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSBFdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycztcbiAgICB9XG5cbiAgICBpZiAobSAmJiBtID4gMCAmJiB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoID4gbSkge1xuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XG4gICAgICBjb25zb2xlLmVycm9yKCcobm9kZSkgd2FybmluZzogcG9zc2libGUgRXZlbnRFbWl0dGVyIG1lbW9yeSAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICVkIGxpc3RlbmVycyBhZGRlZC4gJyArXG4gICAgICAgICAgICAgICAgICAgICdVc2UgZW1pdHRlci5zZXRNYXhMaXN0ZW5lcnMoKSB0byBpbmNyZWFzZSBsaW1pdC4nLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoKTtcbiAgICAgIGNvbnNvbGUudHJhY2UoKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgdmFyIGZpcmVkID0gZmFsc2U7XG5cbiAgZnVuY3Rpb24gZygpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGcpO1xuXG4gICAgaWYgKCFmaXJlZCkge1xuICAgICAgZmlyZWQgPSB0cnVlO1xuICAgICAgbGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9XG4gIH1cblxuICBnLmxpc3RlbmVyID0gbGlzdGVuZXI7XG4gIHRoaXMub24odHlwZSwgZyk7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBlbWl0cyBhICdyZW1vdmVMaXN0ZW5lcicgZXZlbnQgaWZmIHRoZSBsaXN0ZW5lciB3YXMgcmVtb3ZlZFxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBsaXN0LCBwb3NpdGlvbiwgbGVuZ3RoLCBpO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIGxpc3QgPSB0aGlzLl9ldmVudHNbdHlwZV07XG4gIGxlbmd0aCA9IGxpc3QubGVuZ3RoO1xuICBwb3NpdGlvbiA9IC0xO1xuXG4gIGlmIChsaXN0ID09PSBsaXN0ZW5lciB8fFxuICAgICAgKGlzRnVuY3Rpb24obGlzdC5saXN0ZW5lcikgJiYgbGlzdC5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcblxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGxpc3QpKSB7XG4gICAgZm9yIChpID0gbGVuZ3RoOyBpLS0gPiAwOykge1xuICAgICAgaWYgKGxpc3RbaV0gPT09IGxpc3RlbmVyIHx8XG4gICAgICAgICAgKGxpc3RbaV0ubGlzdGVuZXIgJiYgbGlzdFtpXS5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgICAgIHBvc2l0aW9uID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBvc2l0aW9uIDwgMClcbiAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgICBsaXN0Lmxlbmd0aCA9IDA7XG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaXN0LnNwbGljZShwb3NpdGlvbiwgMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIga2V5LCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgLy8gbm90IGxpc3RlbmluZyBmb3IgcmVtb3ZlTGlzdGVuZXIsIG5vIG5lZWQgdG8gZW1pdFxuICBpZiAoIXRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcikge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIGVtaXQgcmVtb3ZlTGlzdGVuZXIgZm9yIGFsbCBsaXN0ZW5lcnMgb24gYWxsIGV2ZW50c1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGZvciAoa2V5IGluIHRoaXMuX2V2ZW50cykge1xuICAgICAgaWYgKGtleSA9PT0gJ3JlbW92ZUxpc3RlbmVyJykgY29udGludWU7XG4gICAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycyhrZXkpO1xuICAgIH1cbiAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycygncmVtb3ZlTGlzdGVuZXInKTtcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNGdW5jdGlvbihsaXN0ZW5lcnMpKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnMpO1xuICB9IGVsc2Uge1xuICAgIC8vIExJRk8gb3JkZXJcbiAgICB3aGlsZSAobGlzdGVuZXJzLmxlbmd0aClcbiAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzW2xpc3RlbmVycy5sZW5ndGggLSAxXSk7XG4gIH1cbiAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IFtdO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XG4gIGVsc2VcbiAgICByZXQgPSB0aGlzLl9ldmVudHNbdHlwZV0uc2xpY2UoKTtcbiAgcmV0dXJuIHJldDtcbn07XG5cbkV2ZW50RW1pdHRlci5saXN0ZW5lckNvdW50ID0gZnVuY3Rpb24oZW1pdHRlciwgdHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIWVtaXR0ZXIuX2V2ZW50cyB8fCAhZW1pdHRlci5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IDA7XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24oZW1pdHRlci5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSAxO1xuICBlbHNlXG4gICAgcmV0ID0gZW1pdHRlci5fZXZlbnRzW3R5cGVdLmxlbmd0aDtcbiAgcmV0dXJuIHJldDtcbn07XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbiIsImlmICh0eXBlb2YgT2JqZWN0LmNyZWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAvLyBpbXBsZW1lbnRhdGlvbiBmcm9tIHN0YW5kYXJkIG5vZGUuanMgJ3V0aWwnIG1vZHVsZVxuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgY3Rvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHN1cGVyQ3Rvci5wcm90b3R5cGUsIHtcbiAgICAgIGNvbnN0cnVjdG9yOiB7XG4gICAgICAgIHZhbHVlOiBjdG9yLFxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuICB9O1xufSBlbHNlIHtcbiAgLy8gb2xkIHNjaG9vbCBzaGltIGZvciBvbGQgYnJvd3NlcnNcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIHZhciBUZW1wQ3RvciA9IGZ1bmN0aW9uICgpIHt9XG4gICAgVGVtcEN0b3IucHJvdG90eXBlID0gc3VwZXJDdG9yLnByb3RvdHlwZVxuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKClcbiAgICBjdG9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGN0b3JcbiAgfVxufVxuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIi8qXG4gKiAgQ29weXJpZ2h0IDIwMTEgVHdpdHRlciwgSW5jLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiAgeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiAgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAqICBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiAgbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxuKGZ1bmN0aW9uIChIb2dhbikge1xuICAvLyBTZXR1cCByZWdleCAgYXNzaWdubWVudHNcbiAgLy8gcmVtb3ZlIHdoaXRlc3BhY2UgYWNjb3JkaW5nIHRvIE11c3RhY2hlIHNwZWNcbiAgdmFyIHJJc1doaXRlc3BhY2UgPSAvXFxTLyxcbiAgICAgIHJRdW90ID0gL1xcXCIvZyxcbiAgICAgIHJOZXdsaW5lID0gIC9cXG4vZyxcbiAgICAgIHJDciA9IC9cXHIvZyxcbiAgICAgIHJTbGFzaCA9IC9cXFxcL2csXG4gICAgICB0YWdUeXBlcyA9IHtcbiAgICAgICAgJyMnOiAxLCAnXic6IDIsICcvJzogMywgICchJzogNCwgJz4nOiA1LFxuICAgICAgICAnPCc6IDYsICc9JzogNywgJ192JzogOCwgJ3snOiA5LCAnJic6IDEwXG4gICAgICB9O1xuXG4gIEhvZ2FuLnNjYW4gPSBmdW5jdGlvbiBzY2FuKHRleHQsIGRlbGltaXRlcnMpIHtcbiAgICB2YXIgbGVuID0gdGV4dC5sZW5ndGgsXG4gICAgICAgIElOX1RFWFQgPSAwLFxuICAgICAgICBJTl9UQUdfVFlQRSA9IDEsXG4gICAgICAgIElOX1RBRyA9IDIsXG4gICAgICAgIHN0YXRlID0gSU5fVEVYVCxcbiAgICAgICAgdGFnVHlwZSA9IG51bGwsXG4gICAgICAgIHRhZyA9IG51bGwsXG4gICAgICAgIGJ1ZiA9ICcnLFxuICAgICAgICB0b2tlbnMgPSBbXSxcbiAgICAgICAgc2VlblRhZyA9IGZhbHNlLFxuICAgICAgICBpID0gMCxcbiAgICAgICAgbGluZVN0YXJ0ID0gMCxcbiAgICAgICAgb3RhZyA9ICd7eycsXG4gICAgICAgIGN0YWcgPSAnfX0nO1xuXG4gICAgZnVuY3Rpb24gYWRkQnVmKCkge1xuICAgICAgaWYgKGJ1Zi5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRva2Vucy5wdXNoKG5ldyBTdHJpbmcoYnVmKSk7XG4gICAgICAgIGJ1ZiA9ICcnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpbmVJc1doaXRlc3BhY2UoKSB7XG4gICAgICB2YXIgaXNBbGxXaGl0ZXNwYWNlID0gdHJ1ZTtcbiAgICAgIGZvciAodmFyIGogPSBsaW5lU3RhcnQ7IGogPCB0b2tlbnMubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgaXNBbGxXaGl0ZXNwYWNlID1cbiAgICAgICAgICAodG9rZW5zW2pdLnRhZyAmJiB0YWdUeXBlc1t0b2tlbnNbal0udGFnXSA8IHRhZ1R5cGVzWydfdiddKSB8fFxuICAgICAgICAgICghdG9rZW5zW2pdLnRhZyAmJiB0b2tlbnNbal0ubWF0Y2gocklzV2hpdGVzcGFjZSkgPT09IG51bGwpO1xuICAgICAgICBpZiAoIWlzQWxsV2hpdGVzcGFjZSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gaXNBbGxXaGl0ZXNwYWNlO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGZpbHRlckxpbmUoaGF2ZVNlZW5UYWcsIG5vTmV3TGluZSkge1xuICAgICAgYWRkQnVmKCk7XG5cbiAgICAgIGlmIChoYXZlU2VlblRhZyAmJiBsaW5lSXNXaGl0ZXNwYWNlKCkpIHtcbiAgICAgICAgZm9yICh2YXIgaiA9IGxpbmVTdGFydCwgbmV4dDsgaiA8IHRva2Vucy5sZW5ndGg7IGorKykge1xuICAgICAgICAgIGlmICghdG9rZW5zW2pdLnRhZykge1xuICAgICAgICAgICAgaWYgKChuZXh0ID0gdG9rZW5zW2orMV0pICYmIG5leHQudGFnID09ICc+Jykge1xuICAgICAgICAgICAgICAvLyBzZXQgaW5kZW50IHRvIHRva2VuIHZhbHVlXG4gICAgICAgICAgICAgIG5leHQuaW5kZW50ID0gdG9rZW5zW2pdLnRvU3RyaW5nKClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRva2Vucy5zcGxpY2UoaiwgMSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFub05ld0xpbmUpIHtcbiAgICAgICAgdG9rZW5zLnB1c2goe3RhZzonXFxuJ30pO1xuICAgICAgfVxuXG4gICAgICBzZWVuVGFnID0gZmFsc2U7XG4gICAgICBsaW5lU3RhcnQgPSB0b2tlbnMubGVuZ3RoO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNoYW5nZURlbGltaXRlcnModGV4dCwgaW5kZXgpIHtcbiAgICAgIHZhciBjbG9zZSA9ICc9JyArIGN0YWcsXG4gICAgICAgICAgY2xvc2VJbmRleCA9IHRleHQuaW5kZXhPZihjbG9zZSwgaW5kZXgpLFxuICAgICAgICAgIGRlbGltaXRlcnMgPSB0cmltKFxuICAgICAgICAgICAgdGV4dC5zdWJzdHJpbmcodGV4dC5pbmRleE9mKCc9JywgaW5kZXgpICsgMSwgY2xvc2VJbmRleClcbiAgICAgICAgICApLnNwbGl0KCcgJyk7XG5cbiAgICAgIG90YWcgPSBkZWxpbWl0ZXJzWzBdO1xuICAgICAgY3RhZyA9IGRlbGltaXRlcnNbMV07XG5cbiAgICAgIHJldHVybiBjbG9zZUluZGV4ICsgY2xvc2UubGVuZ3RoIC0gMTtcbiAgICB9XG5cbiAgICBpZiAoZGVsaW1pdGVycykge1xuICAgICAgZGVsaW1pdGVycyA9IGRlbGltaXRlcnMuc3BsaXQoJyAnKTtcbiAgICAgIG90YWcgPSBkZWxpbWl0ZXJzWzBdO1xuICAgICAgY3RhZyA9IGRlbGltaXRlcnNbMV07XG4gICAgfVxuXG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICBpZiAoc3RhdGUgPT0gSU5fVEVYVCkge1xuICAgICAgICBpZiAodGFnQ2hhbmdlKG90YWcsIHRleHQsIGkpKSB7XG4gICAgICAgICAgLS1pO1xuICAgICAgICAgIGFkZEJ1ZigpO1xuICAgICAgICAgIHN0YXRlID0gSU5fVEFHX1RZUEU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKHRleHQuY2hhckF0KGkpID09ICdcXG4nKSB7XG4gICAgICAgICAgICBmaWx0ZXJMaW5lKHNlZW5UYWcpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBidWYgKz0gdGV4dC5jaGFyQXQoaSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHN0YXRlID09IElOX1RBR19UWVBFKSB7XG4gICAgICAgIGkgKz0gb3RhZy5sZW5ndGggLSAxO1xuICAgICAgICB0YWcgPSB0YWdUeXBlc1t0ZXh0LmNoYXJBdChpICsgMSldO1xuICAgICAgICB0YWdUeXBlID0gdGFnID8gdGV4dC5jaGFyQXQoaSArIDEpIDogJ192JztcbiAgICAgICAgaWYgKHRhZ1R5cGUgPT0gJz0nKSB7XG4gICAgICAgICAgaSA9IGNoYW5nZURlbGltaXRlcnModGV4dCwgaSk7XG4gICAgICAgICAgc3RhdGUgPSBJTl9URVhUO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0YWcpIHtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICB9XG4gICAgICAgICAgc3RhdGUgPSBJTl9UQUc7XG4gICAgICAgIH1cbiAgICAgICAgc2VlblRhZyA9IGk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpZiAodGFnQ2hhbmdlKGN0YWcsIHRleHQsIGkpKSB7XG4gICAgICAgICAgdG9rZW5zLnB1c2goe3RhZzogdGFnVHlwZSwgbjogdHJpbShidWYpLCBvdGFnOiBvdGFnLCBjdGFnOiBjdGFnLFxuICAgICAgICAgICAgICAgICAgICAgICBpOiAodGFnVHlwZSA9PSAnLycpID8gc2VlblRhZyAtIGN0YWcubGVuZ3RoIDogaSArIG90YWcubGVuZ3RofSk7XG4gICAgICAgICAgYnVmID0gJyc7XG4gICAgICAgICAgaSArPSBjdGFnLmxlbmd0aCAtIDE7XG4gICAgICAgICAgc3RhdGUgPSBJTl9URVhUO1xuICAgICAgICAgIGlmICh0YWdUeXBlID09ICd7Jykge1xuICAgICAgICAgICAgaWYgKGN0YWcgPT0gJ319Jykge1xuICAgICAgICAgICAgICBpKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBjbGVhblRyaXBsZVN0YWNoZSh0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnVmICs9IHRleHQuY2hhckF0KGkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZmlsdGVyTGluZShzZWVuVGFnLCB0cnVlKTtcblxuICAgIHJldHVybiB0b2tlbnM7XG4gIH1cblxuICBmdW5jdGlvbiBjbGVhblRyaXBsZVN0YWNoZSh0b2tlbikge1xuICAgIGlmICh0b2tlbi5uLnN1YnN0cih0b2tlbi5uLmxlbmd0aCAtIDEpID09PSAnfScpIHtcbiAgICAgIHRva2VuLm4gPSB0b2tlbi5uLnN1YnN0cmluZygwLCB0b2tlbi5uLmxlbmd0aCAtIDEpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHRyaW0ocykge1xuICAgIGlmIChzLnRyaW0pIHtcbiAgICAgIHJldHVybiBzLnRyaW0oKTtcbiAgICB9XG5cbiAgICByZXR1cm4gcy5yZXBsYWNlKC9eXFxzKnxcXHMqJC9nLCAnJyk7XG4gIH1cblxuICBmdW5jdGlvbiB0YWdDaGFuZ2UodGFnLCB0ZXh0LCBpbmRleCkge1xuICAgIGlmICh0ZXh0LmNoYXJBdChpbmRleCkgIT0gdGFnLmNoYXJBdCgwKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIGZvciAodmFyIGkgPSAxLCBsID0gdGFnLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgaWYgKHRleHQuY2hhckF0KGluZGV4ICsgaSkgIT0gdGFnLmNoYXJBdChpKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBmdW5jdGlvbiBidWlsZFRyZWUodG9rZW5zLCBraW5kLCBzdGFjaywgY3VzdG9tVGFncykge1xuICAgIHZhciBpbnN0cnVjdGlvbnMgPSBbXSxcbiAgICAgICAgb3BlbmVyID0gbnVsbCxcbiAgICAgICAgdG9rZW4gPSBudWxsO1xuXG4gICAgd2hpbGUgKHRva2Vucy5sZW5ndGggPiAwKSB7XG4gICAgICB0b2tlbiA9IHRva2Vucy5zaGlmdCgpO1xuICAgICAgaWYgKHRva2VuLnRhZyA9PSAnIycgfHwgdG9rZW4udGFnID09ICdeJyB8fCBpc09wZW5lcih0b2tlbiwgY3VzdG9tVGFncykpIHtcbiAgICAgICAgc3RhY2sucHVzaCh0b2tlbik7XG4gICAgICAgIHRva2VuLm5vZGVzID0gYnVpbGRUcmVlKHRva2VucywgdG9rZW4udGFnLCBzdGFjaywgY3VzdG9tVGFncyk7XG4gICAgICAgIGluc3RydWN0aW9ucy5wdXNoKHRva2VuKTtcbiAgICAgIH0gZWxzZSBpZiAodG9rZW4udGFnID09ICcvJykge1xuICAgICAgICBpZiAoc3RhY2subGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDbG9zaW5nIHRhZyB3aXRob3V0IG9wZW5lcjogLycgKyB0b2tlbi5uKTtcbiAgICAgICAgfVxuICAgICAgICBvcGVuZXIgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgaWYgKHRva2VuLm4gIT0gb3BlbmVyLm4gJiYgIWlzQ2xvc2VyKHRva2VuLm4sIG9wZW5lci5uLCBjdXN0b21UYWdzKSkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignTmVzdGluZyBlcnJvcjogJyArIG9wZW5lci5uICsgJyB2cy4gJyArIHRva2VuLm4pO1xuICAgICAgICB9XG4gICAgICAgIG9wZW5lci5lbmQgPSB0b2tlbi5pO1xuICAgICAgICByZXR1cm4gaW5zdHJ1Y3Rpb25zO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaW5zdHJ1Y3Rpb25zLnB1c2godG9rZW4pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChzdGFjay5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21pc3NpbmcgY2xvc2luZyB0YWc6ICcgKyBzdGFjay5wb3AoKS5uKTtcbiAgICB9XG5cbiAgICByZXR1cm4gaW5zdHJ1Y3Rpb25zO1xuICB9XG5cbiAgZnVuY3Rpb24gaXNPcGVuZXIodG9rZW4sIHRhZ3MpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IHRhZ3MubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICBpZiAodGFnc1tpXS5vID09IHRva2VuLm4pIHtcbiAgICAgICAgdG9rZW4udGFnID0gJyMnO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBpc0Nsb3NlcihjbG9zZSwgb3BlbiwgdGFncykge1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gdGFncy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgIGlmICh0YWdzW2ldLmMgPT0gY2xvc2UgJiYgdGFnc1tpXS5vID09IG9wZW4pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgSG9nYW4uZ2VuZXJhdGUgPSBmdW5jdGlvbiAodHJlZSwgdGV4dCwgb3B0aW9ucykge1xuICAgIHZhciBjb2RlID0gJ3ZhciBfPXRoaXM7Xy5iKGk9aXx8XCJcIik7JyArIHdhbGsodHJlZSkgKyAncmV0dXJuIF8uZmwoKTsnO1xuICAgIGlmIChvcHRpb25zLmFzU3RyaW5nKSB7XG4gICAgICByZXR1cm4gJ2Z1bmN0aW9uKGMscCxpKXsnICsgY29kZSArICc7fSc7XG4gICAgfVxuXG4gICAgcmV0dXJuIG5ldyBIb2dhbi5UZW1wbGF0ZShuZXcgRnVuY3Rpb24oJ2MnLCAncCcsICdpJywgY29kZSksIHRleHQsIEhvZ2FuLCBvcHRpb25zKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGVzYyhzKSB7XG4gICAgcmV0dXJuIHMucmVwbGFjZShyU2xhc2gsICdcXFxcXFxcXCcpXG4gICAgICAgICAgICAucmVwbGFjZShyUXVvdCwgJ1xcXFxcXFwiJylcbiAgICAgICAgICAgIC5yZXBsYWNlKHJOZXdsaW5lLCAnXFxcXG4nKVxuICAgICAgICAgICAgLnJlcGxhY2UockNyLCAnXFxcXHInKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNob29zZU1ldGhvZChzKSB7XG4gICAgcmV0dXJuICh+cy5pbmRleE9mKCcuJykpID8gJ2QnIDogJ2YnO1xuICB9XG5cbiAgZnVuY3Rpb24gd2Fsayh0cmVlKSB7XG4gICAgdmFyIGNvZGUgPSAnJztcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IHRyZWUubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICB2YXIgdGFnID0gdHJlZVtpXS50YWc7XG4gICAgICBpZiAodGFnID09ICcjJykge1xuICAgICAgICBjb2RlICs9IHNlY3Rpb24odHJlZVtpXS5ub2RlcywgdHJlZVtpXS5uLCBjaG9vc2VNZXRob2QodHJlZVtpXS5uKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyZWVbaV0uaSwgdHJlZVtpXS5lbmQsIHRyZWVbaV0ub3RhZyArIFwiIFwiICsgdHJlZVtpXS5jdGFnKTtcbiAgICAgIH0gZWxzZSBpZiAodGFnID09ICdeJykge1xuICAgICAgICBjb2RlICs9IGludmVydGVkU2VjdGlvbih0cmVlW2ldLm5vZGVzLCB0cmVlW2ldLm4sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNob29zZU1ldGhvZCh0cmVlW2ldLm4pKTtcbiAgICAgIH0gZWxzZSBpZiAodGFnID09ICc8JyB8fCB0YWcgPT0gJz4nKSB7XG4gICAgICAgIGNvZGUgKz0gcGFydGlhbCh0cmVlW2ldKTtcbiAgICAgIH0gZWxzZSBpZiAodGFnID09ICd7JyB8fCB0YWcgPT0gJyYnKSB7XG4gICAgICAgIGNvZGUgKz0gdHJpcGxlU3RhY2hlKHRyZWVbaV0ubiwgY2hvb3NlTWV0aG9kKHRyZWVbaV0ubikpO1xuICAgICAgfSBlbHNlIGlmICh0YWcgPT0gJ1xcbicpIHtcbiAgICAgICAgY29kZSArPSB0ZXh0KCdcIlxcXFxuXCInICsgKHRyZWUubGVuZ3RoLTEgPT0gaSA/ICcnIDogJyArIGknKSk7XG4gICAgICB9IGVsc2UgaWYgKHRhZyA9PSAnX3YnKSB7XG4gICAgICAgIGNvZGUgKz0gdmFyaWFibGUodHJlZVtpXS5uLCBjaG9vc2VNZXRob2QodHJlZVtpXS5uKSk7XG4gICAgICB9IGVsc2UgaWYgKHRhZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvZGUgKz0gdGV4dCgnXCInICsgZXNjKHRyZWVbaV0pICsgJ1wiJyk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjb2RlO1xuICB9XG5cbiAgZnVuY3Rpb24gc2VjdGlvbihub2RlcywgaWQsIG1ldGhvZCwgc3RhcnQsIGVuZCwgdGFncykge1xuICAgIHJldHVybiAnaWYoXy5zKF8uJyArIG1ldGhvZCArICcoXCInICsgZXNjKGlkKSArICdcIixjLHAsMSksJyArXG4gICAgICAgICAgICdjLHAsMCwnICsgc3RhcnQgKyAnLCcgKyBlbmQgKyAnLFwiJyArIHRhZ3MgKyAnXCIpKXsnICtcbiAgICAgICAgICAgJ18ucnMoYyxwLCcgK1xuICAgICAgICAgICAnZnVuY3Rpb24oYyxwLF8peycgK1xuICAgICAgICAgICB3YWxrKG5vZGVzKSArXG4gICAgICAgICAgICd9KTtjLnBvcCgpO30nO1xuICB9XG5cbiAgZnVuY3Rpb24gaW52ZXJ0ZWRTZWN0aW9uKG5vZGVzLCBpZCwgbWV0aG9kKSB7XG4gICAgcmV0dXJuICdpZighXy5zKF8uJyArIG1ldGhvZCArICcoXCInICsgZXNjKGlkKSArICdcIixjLHAsMSksYyxwLDEsMCwwLFwiXCIpKXsnICtcbiAgICAgICAgICAgd2Fsayhub2RlcykgK1xuICAgICAgICAgICAnfTsnO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFydGlhbCh0b2spIHtcbiAgICByZXR1cm4gJ18uYihfLnJwKFwiJyArICBlc2ModG9rLm4pICsgJ1wiLGMscCxcIicgKyAodG9rLmluZGVudCB8fCAnJykgKyAnXCIpKTsnO1xuICB9XG5cbiAgZnVuY3Rpb24gdHJpcGxlU3RhY2hlKGlkLCBtZXRob2QpIHtcbiAgICByZXR1cm4gJ18uYihfLnQoXy4nICsgbWV0aG9kICsgJyhcIicgKyBlc2MoaWQpICsgJ1wiLGMscCwwKSkpOyc7XG4gIH1cblxuICBmdW5jdGlvbiB2YXJpYWJsZShpZCwgbWV0aG9kKSB7XG4gICAgcmV0dXJuICdfLmIoXy52KF8uJyArIG1ldGhvZCArICcoXCInICsgZXNjKGlkKSArICdcIixjLHAsMCkpKTsnO1xuICB9XG5cbiAgZnVuY3Rpb24gdGV4dChpZCkge1xuICAgIHJldHVybiAnXy5iKCcgKyBpZCArICcpOyc7XG4gIH1cblxuICBIb2dhbi5wYXJzZSA9IGZ1bmN0aW9uKHRva2VucywgdGV4dCwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHJldHVybiBidWlsZFRyZWUodG9rZW5zLCAnJywgW10sIG9wdGlvbnMuc2VjdGlvblRhZ3MgfHwgW10pO1xuICB9LFxuXG4gIEhvZ2FuLmNhY2hlID0ge307XG5cbiAgSG9nYW4uY29tcGlsZSA9IGZ1bmN0aW9uKHRleHQsIG9wdGlvbnMpIHtcbiAgICAvLyBvcHRpb25zXG4gICAgLy9cbiAgICAvLyBhc1N0cmluZzogZmFsc2UgKGRlZmF1bHQpXG4gICAgLy9cbiAgICAvLyBzZWN0aW9uVGFnczogW3tvOiAnX2ZvbycsIGM6ICdmb28nfV1cbiAgICAvLyBBbiBhcnJheSBvZiBvYmplY3Qgd2l0aCBvIGFuZCBjIGZpZWxkcyB0aGF0IGluZGljYXRlIG5hbWVzIGZvciBjdXN0b21cbiAgICAvLyBzZWN0aW9uIHRhZ3MuIFRoZSBleGFtcGxlIGFib3ZlIGFsbG93cyBwYXJzaW5nIG9mIHt7X2Zvb319e3svZm9vfX0uXG4gICAgLy9cbiAgICAvLyBkZWxpbWl0ZXJzOiBBIHN0cmluZyB0aGF0IG92ZXJyaWRlcyB0aGUgZGVmYXVsdCBkZWxpbWl0ZXJzLlxuICAgIC8vIEV4YW1wbGU6IFwiPCUgJT5cIlxuICAgIC8vXG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICB2YXIga2V5ID0gdGV4dCArICd8fCcgKyAhIW9wdGlvbnMuYXNTdHJpbmc7XG5cbiAgICB2YXIgdCA9IHRoaXMuY2FjaGVba2V5XTtcblxuICAgIGlmICh0KSB7XG4gICAgICByZXR1cm4gdDtcbiAgICB9XG5cbiAgICB0ID0gdGhpcy5nZW5lcmF0ZSh0aGlzLnBhcnNlKHRoaXMuc2Nhbih0ZXh0LCBvcHRpb25zLmRlbGltaXRlcnMpLCB0ZXh0LCBvcHRpb25zKSwgdGV4dCwgb3B0aW9ucyk7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGVba2V5XSA9IHQ7XG4gIH07XG59KSh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcgPyBleHBvcnRzIDogSG9nYW4pO1xuIiwiLypcbiAqICBDb3B5cmlnaHQgMjAxMSBUd2l0dGVyLCBJbmMuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqICB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqICBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICogIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG4vLyBUaGlzIGZpbGUgaXMgZm9yIHVzZSB3aXRoIE5vZGUuanMuIFNlZSBkaXN0LyBmb3IgYnJvd3NlciBmaWxlcy5cblxudmFyIEhvZ2FuID0gcmVxdWlyZSgnLi9jb21waWxlcicpO1xuSG9nYW4uVGVtcGxhdGUgPSByZXF1aXJlKCcuL3RlbXBsYXRlJykuVGVtcGxhdGU7XG5tb2R1bGUuZXhwb3J0cyA9IEhvZ2FuOyAiLCIvKlxuICogIENvcHlyaWdodCAyMDExIFR3aXR0ZXIsIEluYy5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqICBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqICBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4gKiAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbnZhciBIb2dhbiA9IHt9O1xuXG4oZnVuY3Rpb24gKEhvZ2FuLCB1c2VBcnJheUJ1ZmZlcikge1xuICBIb2dhbi5UZW1wbGF0ZSA9IGZ1bmN0aW9uIChyZW5kZXJGdW5jLCB0ZXh0LCBjb21waWxlciwgb3B0aW9ucykge1xuICAgIHRoaXMuciA9IHJlbmRlckZ1bmMgfHwgdGhpcy5yO1xuICAgIHRoaXMuYyA9IGNvbXBpbGVyO1xuICAgIHRoaXMub3B0aW9ucyA9IG9wdGlvbnM7XG4gICAgdGhpcy50ZXh0ID0gdGV4dCB8fCAnJztcbiAgICB0aGlzLmJ1ZiA9ICh1c2VBcnJheUJ1ZmZlcikgPyBbXSA6ICcnO1xuICB9XG5cbiAgSG9nYW4uVGVtcGxhdGUucHJvdG90eXBlID0ge1xuICAgIC8vIHJlbmRlcjogcmVwbGFjZWQgYnkgZ2VuZXJhdGVkIGNvZGUuXG4gICAgcjogZnVuY3Rpb24gKGNvbnRleHQsIHBhcnRpYWxzLCBpbmRlbnQpIHsgcmV0dXJuICcnOyB9LFxuXG4gICAgLy8gdmFyaWFibGUgZXNjYXBpbmdcbiAgICB2OiBob2dhbkVzY2FwZSxcblxuICAgIC8vIHRyaXBsZSBzdGFjaGVcbiAgICB0OiBjb2VyY2VUb1N0cmluZyxcblxuICAgIHJlbmRlcjogZnVuY3Rpb24gcmVuZGVyKGNvbnRleHQsIHBhcnRpYWxzLCBpbmRlbnQpIHtcbiAgICAgIHJldHVybiB0aGlzLnJpKFtjb250ZXh0XSwgcGFydGlhbHMgfHwge30sIGluZGVudCk7XG4gICAgfSxcblxuICAgIC8vIHJlbmRlciBpbnRlcm5hbCAtLSBhIGhvb2sgZm9yIG92ZXJyaWRlcyB0aGF0IGNhdGNoZXMgcGFydGlhbHMgdG9vXG4gICAgcmk6IGZ1bmN0aW9uIChjb250ZXh0LCBwYXJ0aWFscywgaW5kZW50KSB7XG4gICAgICByZXR1cm4gdGhpcy5yKGNvbnRleHQsIHBhcnRpYWxzLCBpbmRlbnQpO1xuICAgIH0sXG5cbiAgICAvLyB0cmllcyB0byBmaW5kIGEgcGFydGlhbCBpbiB0aGUgY3VyZW50IHNjb3BlIGFuZCByZW5kZXIgaXRcbiAgICBycDogZnVuY3Rpb24obmFtZSwgY29udGV4dCwgcGFydGlhbHMsIGluZGVudCkge1xuICAgICAgdmFyIHBhcnRpYWwgPSBwYXJ0aWFsc1tuYW1lXTtcblxuICAgICAgaWYgKCFwYXJ0aWFsKSB7XG4gICAgICAgIHJldHVybiAnJztcbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuYyAmJiB0eXBlb2YgcGFydGlhbCA9PSAnc3RyaW5nJykge1xuICAgICAgICBwYXJ0aWFsID0gdGhpcy5jLmNvbXBpbGUocGFydGlhbCwgdGhpcy5vcHRpb25zKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHBhcnRpYWwucmkoY29udGV4dCwgcGFydGlhbHMsIGluZGVudCk7XG4gICAgfSxcblxuICAgIC8vIHJlbmRlciBhIHNlY3Rpb25cbiAgICByczogZnVuY3Rpb24oY29udGV4dCwgcGFydGlhbHMsIHNlY3Rpb24pIHtcbiAgICAgIHZhciB0YWlsID0gY29udGV4dFtjb250ZXh0Lmxlbmd0aCAtIDFdO1xuXG4gICAgICBpZiAoIWlzQXJyYXkodGFpbCkpIHtcbiAgICAgICAgc2VjdGlvbihjb250ZXh0LCBwYXJ0aWFscywgdGhpcyk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0YWlsLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGNvbnRleHQucHVzaCh0YWlsW2ldKTtcbiAgICAgICAgc2VjdGlvbihjb250ZXh0LCBwYXJ0aWFscywgdGhpcyk7XG4gICAgICAgIGNvbnRleHQucG9wKCk7XG4gICAgICB9XG4gICAgfSxcblxuICAgIC8vIG1heWJlIHN0YXJ0IGEgc2VjdGlvblxuICAgIHM6IGZ1bmN0aW9uKHZhbCwgY3R4LCBwYXJ0aWFscywgaW52ZXJ0ZWQsIHN0YXJ0LCBlbmQsIHRhZ3MpIHtcbiAgICAgIHZhciBwYXNzO1xuXG4gICAgICBpZiAoaXNBcnJheSh2YWwpICYmIHZhbC5sZW5ndGggPT09IDApIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBpZiAodHlwZW9mIHZhbCA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHZhbCA9IHRoaXMubHModmFsLCBjdHgsIHBhcnRpYWxzLCBpbnZlcnRlZCwgc3RhcnQsIGVuZCwgdGFncyk7XG4gICAgICB9XG5cbiAgICAgIHBhc3MgPSAodmFsID09PSAnJykgfHwgISF2YWw7XG5cbiAgICAgIGlmICghaW52ZXJ0ZWQgJiYgcGFzcyAmJiBjdHgpIHtcbiAgICAgICAgY3R4LnB1c2goKHR5cGVvZiB2YWwgPT0gJ29iamVjdCcpID8gdmFsIDogY3R4W2N0eC5sZW5ndGggLSAxXSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwYXNzO1xuICAgIH0sXG5cbiAgICAvLyBmaW5kIHZhbHVlcyB3aXRoIGRvdHRlZCBuYW1lc1xuICAgIGQ6IGZ1bmN0aW9uKGtleSwgY3R4LCBwYXJ0aWFscywgcmV0dXJuRm91bmQpIHtcbiAgICAgIHZhciBuYW1lcyA9IGtleS5zcGxpdCgnLicpLFxuICAgICAgICAgIHZhbCA9IHRoaXMuZihuYW1lc1swXSwgY3R4LCBwYXJ0aWFscywgcmV0dXJuRm91bmQpLFxuICAgICAgICAgIGN4ID0gbnVsbDtcblxuICAgICAgaWYgKGtleSA9PT0gJy4nICYmIGlzQXJyYXkoY3R4W2N0eC5sZW5ndGggLSAyXSkpIHtcbiAgICAgICAgcmV0dXJuIGN0eFtjdHgubGVuZ3RoIC0gMV07XG4gICAgICB9XG5cbiAgICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKHZhbCAmJiB0eXBlb2YgdmFsID09ICdvYmplY3QnICYmIG5hbWVzW2ldIGluIHZhbCkge1xuICAgICAgICAgIGN4ID0gdmFsO1xuICAgICAgICAgIHZhbCA9IHZhbFtuYW1lc1tpXV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsID0gJyc7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHJldHVybkZvdW5kICYmICF2YWwpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJldHVybkZvdW5kICYmIHR5cGVvZiB2YWwgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBjdHgucHVzaChjeCk7XG4gICAgICAgIHZhbCA9IHRoaXMubHYodmFsLCBjdHgsIHBhcnRpYWxzKTtcbiAgICAgICAgY3R4LnBvcCgpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdmFsO1xuICAgIH0sXG5cbiAgICAvLyBmaW5kIHZhbHVlcyB3aXRoIG5vcm1hbCBuYW1lc1xuICAgIGY6IGZ1bmN0aW9uKGtleSwgY3R4LCBwYXJ0aWFscywgcmV0dXJuRm91bmQpIHtcbiAgICAgIHZhciB2YWwgPSBmYWxzZSxcbiAgICAgICAgICB2ID0gbnVsbCxcbiAgICAgICAgICBmb3VuZCA9IGZhbHNlO1xuXG4gICAgICBmb3IgKHZhciBpID0gY3R4Lmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgIHYgPSBjdHhbaV07XG4gICAgICAgIGlmICh2ICYmIHR5cGVvZiB2ID09ICdvYmplY3QnICYmIGtleSBpbiB2KSB7XG4gICAgICAgICAgdmFsID0gdltrZXldO1xuICAgICAgICAgIGZvdW5kID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoIWZvdW5kKSB7XG4gICAgICAgIHJldHVybiAocmV0dXJuRm91bmQpID8gZmFsc2UgOiBcIlwiO1xuICAgICAgfVxuXG4gICAgICBpZiAoIXJldHVybkZvdW5kICYmIHR5cGVvZiB2YWwgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB2YWwgPSB0aGlzLmx2KHZhbCwgY3R4LCBwYXJ0aWFscyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB2YWw7XG4gICAgfSxcblxuICAgIC8vIGhpZ2hlciBvcmRlciB0ZW1wbGF0ZXNcbiAgICBobzogZnVuY3Rpb24odmFsLCBjeCwgcGFydGlhbHMsIHRleHQsIHRhZ3MpIHtcbiAgICAgIHZhciBjb21waWxlciA9IHRoaXMuYztcbiAgICAgIHZhciBvcHRpb25zID0gdGhpcy5vcHRpb25zO1xuICAgICAgb3B0aW9ucy5kZWxpbWl0ZXJzID0gdGFncztcbiAgICAgIHZhciB0ZXh0ID0gdmFsLmNhbGwoY3gsIHRleHQpO1xuICAgICAgdGV4dCA9ICh0ZXh0ID09IG51bGwpID8gU3RyaW5nKHRleHQpIDogdGV4dC50b1N0cmluZygpO1xuICAgICAgdGhpcy5iKGNvbXBpbGVyLmNvbXBpbGUodGV4dCwgb3B0aW9ucykucmVuZGVyKGN4LCBwYXJ0aWFscykpO1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH0sXG5cbiAgICAvLyB0ZW1wbGF0ZSByZXN1bHQgYnVmZmVyaW5nXG4gICAgYjogKHVzZUFycmF5QnVmZmVyKSA/IGZ1bmN0aW9uKHMpIHsgdGhpcy5idWYucHVzaChzKTsgfSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKHMpIHsgdGhpcy5idWYgKz0gczsgfSxcbiAgICBmbDogKHVzZUFycmF5QnVmZmVyKSA/IGZ1bmN0aW9uKCkgeyB2YXIgciA9IHRoaXMuYnVmLmpvaW4oJycpOyB0aGlzLmJ1ZiA9IFtdOyByZXR1cm4gcjsgfSA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbigpIHsgdmFyIHIgPSB0aGlzLmJ1ZjsgdGhpcy5idWYgPSAnJzsgcmV0dXJuIHI7IH0sXG5cbiAgICAvLyBsYW1iZGEgcmVwbGFjZSBzZWN0aW9uXG4gICAgbHM6IGZ1bmN0aW9uKHZhbCwgY3R4LCBwYXJ0aWFscywgaW52ZXJ0ZWQsIHN0YXJ0LCBlbmQsIHRhZ3MpIHtcbiAgICAgIHZhciBjeCA9IGN0eFtjdHgubGVuZ3RoIC0gMV0sXG4gICAgICAgICAgdCA9IG51bGw7XG5cbiAgICAgIGlmICghaW52ZXJ0ZWQgJiYgdGhpcy5jICYmIHZhbC5sZW5ndGggPiAwKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmhvKHZhbCwgY3gsIHBhcnRpYWxzLCB0aGlzLnRleHQuc3Vic3RyaW5nKHN0YXJ0LCBlbmQpLCB0YWdzKTtcbiAgICAgIH1cblxuICAgICAgdCA9IHZhbC5jYWxsKGN4KTtcblxuICAgICAgaWYgKHR5cGVvZiB0ID09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgaWYgKGludmVydGVkKSB7XG4gICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5jKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuaG8odCwgY3gsIHBhcnRpYWxzLCB0aGlzLnRleHQuc3Vic3RyaW5nKHN0YXJ0LCBlbmQpLCB0YWdzKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdDtcbiAgICB9LFxuXG4gICAgLy8gbGFtYmRhIHJlcGxhY2UgdmFyaWFibGVcbiAgICBsdjogZnVuY3Rpb24odmFsLCBjdHgsIHBhcnRpYWxzKSB7XG4gICAgICB2YXIgY3ggPSBjdHhbY3R4Lmxlbmd0aCAtIDFdO1xuICAgICAgdmFyIHJlc3VsdCA9IHZhbC5jYWxsKGN4KTtcblxuICAgICAgaWYgKHR5cGVvZiByZXN1bHQgPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICByZXN1bHQgPSBjb2VyY2VUb1N0cmluZyhyZXN1bHQuY2FsbChjeCkpO1xuICAgICAgICBpZiAodGhpcy5jICYmIH5yZXN1bHQuaW5kZXhPZihcIntcXHUwMDdCXCIpKSB7XG4gICAgICAgICAgcmV0dXJuIHRoaXMuYy5jb21waWxlKHJlc3VsdCwgdGhpcy5vcHRpb25zKS5yZW5kZXIoY3gsIHBhcnRpYWxzKTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gY29lcmNlVG9TdHJpbmcocmVzdWx0KTtcbiAgICB9XG5cbiAgfTtcblxuICB2YXIgckFtcCA9IC8mL2csXG4gICAgICByTHQgPSAvPC9nLFxuICAgICAgckd0ID0gLz4vZyxcbiAgICAgIHJBcG9zID0vXFwnL2csXG4gICAgICByUXVvdCA9IC9cXFwiL2csXG4gICAgICBoQ2hhcnMgPS9bJjw+XFxcIlxcJ10vO1xuXG5cbiAgZnVuY3Rpb24gY29lcmNlVG9TdHJpbmcodmFsKSB7XG4gICAgcmV0dXJuIFN0cmluZygodmFsID09PSBudWxsIHx8IHZhbCA9PT0gdW5kZWZpbmVkKSA/ICcnIDogdmFsKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGhvZ2FuRXNjYXBlKHN0cikge1xuICAgIHN0ciA9IGNvZXJjZVRvU3RyaW5nKHN0cik7XG4gICAgcmV0dXJuIGhDaGFycy50ZXN0KHN0cikgP1xuICAgICAgc3RyXG4gICAgICAgIC5yZXBsYWNlKHJBbXAsJyZhbXA7JylcbiAgICAgICAgLnJlcGxhY2Uockx0LCcmbHQ7JylcbiAgICAgICAgLnJlcGxhY2Uockd0LCcmZ3Q7JylcbiAgICAgICAgLnJlcGxhY2UockFwb3MsJyYjMzk7JylcbiAgICAgICAgLnJlcGxhY2UoclF1b3QsICcmcXVvdDsnKSA6XG4gICAgICBzdHI7XG4gIH1cblxuICB2YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24oYSkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoYSkgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG5cbn0pKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJyA/IGV4cG9ydHMgOiBIb2dhbik7XG5cbiIsIi8vICAgICBVbmRlcnNjb3JlLmpzIDEuNi4wXG4vLyAgICAgaHR0cDovL3VuZGVyc2NvcmVqcy5vcmdcbi8vICAgICAoYykgMjAwOS0yMDE0IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4vLyAgICAgVW5kZXJzY29yZSBtYXkgYmUgZnJlZWx5IGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cblxuKGZ1bmN0aW9uKCkge1xuXG4gIC8vIEJhc2VsaW5lIHNldHVwXG4gIC8vIC0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gRXN0YWJsaXNoIHRoZSByb290IG9iamVjdCwgYHdpbmRvd2AgaW4gdGhlIGJyb3dzZXIsIG9yIGBleHBvcnRzYCBvbiB0aGUgc2VydmVyLlxuICB2YXIgcm9vdCA9IHRoaXM7XG5cbiAgLy8gU2F2ZSB0aGUgcHJldmlvdXMgdmFsdWUgb2YgdGhlIGBfYCB2YXJpYWJsZS5cbiAgdmFyIHByZXZpb3VzVW5kZXJzY29yZSA9IHJvb3QuXztcblxuICAvLyBFc3RhYmxpc2ggdGhlIG9iamVjdCB0aGF0IGdldHMgcmV0dXJuZWQgdG8gYnJlYWsgb3V0IG9mIGEgbG9vcCBpdGVyYXRpb24uXG4gIHZhciBicmVha2VyID0ge307XG5cbiAgLy8gU2F2ZSBieXRlcyBpbiB0aGUgbWluaWZpZWQgKGJ1dCBub3QgZ3ppcHBlZCkgdmVyc2lvbjpcbiAgdmFyIEFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGUsIE9ialByb3RvID0gT2JqZWN0LnByb3RvdHlwZSwgRnVuY1Byb3RvID0gRnVuY3Rpb24ucHJvdG90eXBlO1xuXG4gIC8vIENyZWF0ZSBxdWljayByZWZlcmVuY2UgdmFyaWFibGVzIGZvciBzcGVlZCBhY2Nlc3MgdG8gY29yZSBwcm90b3R5cGVzLlxuICB2YXJcbiAgICBwdXNoICAgICAgICAgICAgID0gQXJyYXlQcm90by5wdXNoLFxuICAgIHNsaWNlICAgICAgICAgICAgPSBBcnJheVByb3RvLnNsaWNlLFxuICAgIGNvbmNhdCAgICAgICAgICAgPSBBcnJheVByb3RvLmNvbmNhdCxcbiAgICB0b1N0cmluZyAgICAgICAgID0gT2JqUHJvdG8udG9TdHJpbmcsXG4gICAgaGFzT3duUHJvcGVydHkgICA9IE9ialByb3RvLmhhc093blByb3BlcnR5O1xuXG4gIC8vIEFsbCAqKkVDTUFTY3JpcHQgNSoqIG5hdGl2ZSBmdW5jdGlvbiBpbXBsZW1lbnRhdGlvbnMgdGhhdCB3ZSBob3BlIHRvIHVzZVxuICAvLyBhcmUgZGVjbGFyZWQgaGVyZS5cbiAgdmFyXG4gICAgbmF0aXZlRm9yRWFjaCAgICAgID0gQXJyYXlQcm90by5mb3JFYWNoLFxuICAgIG5hdGl2ZU1hcCAgICAgICAgICA9IEFycmF5UHJvdG8ubWFwLFxuICAgIG5hdGl2ZVJlZHVjZSAgICAgICA9IEFycmF5UHJvdG8ucmVkdWNlLFxuICAgIG5hdGl2ZVJlZHVjZVJpZ2h0ICA9IEFycmF5UHJvdG8ucmVkdWNlUmlnaHQsXG4gICAgbmF0aXZlRmlsdGVyICAgICAgID0gQXJyYXlQcm90by5maWx0ZXIsXG4gICAgbmF0aXZlRXZlcnkgICAgICAgID0gQXJyYXlQcm90by5ldmVyeSxcbiAgICBuYXRpdmVTb21lICAgICAgICAgPSBBcnJheVByb3RvLnNvbWUsXG4gICAgbmF0aXZlSW5kZXhPZiAgICAgID0gQXJyYXlQcm90by5pbmRleE9mLFxuICAgIG5hdGl2ZUxhc3RJbmRleE9mICA9IEFycmF5UHJvdG8ubGFzdEluZGV4T2YsXG4gICAgbmF0aXZlSXNBcnJheSAgICAgID0gQXJyYXkuaXNBcnJheSxcbiAgICBuYXRpdmVLZXlzICAgICAgICAgPSBPYmplY3Qua2V5cyxcbiAgICBuYXRpdmVCaW5kICAgICAgICAgPSBGdW5jUHJvdG8uYmluZDtcblxuICAvLyBDcmVhdGUgYSBzYWZlIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yIHVzZSBiZWxvdy5cbiAgdmFyIF8gPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqIGluc3RhbmNlb2YgXykgcmV0dXJuIG9iajtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgXykpIHJldHVybiBuZXcgXyhvYmopO1xuICAgIHRoaXMuX3dyYXBwZWQgPSBvYmo7XG4gIH07XG5cbiAgLy8gRXhwb3J0IHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgKipOb2RlLmpzKiosIHdpdGhcbiAgLy8gYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgZm9yIHRoZSBvbGQgYHJlcXVpcmUoKWAgQVBJLiBJZiB3ZSdyZSBpblxuICAvLyB0aGUgYnJvd3NlciwgYWRkIGBfYCBhcyBhIGdsb2JhbCBvYmplY3QgdmlhIGEgc3RyaW5nIGlkZW50aWZpZXIsXG4gIC8vIGZvciBDbG9zdXJlIENvbXBpbGVyIFwiYWR2YW5jZWRcIiBtb2RlLlxuICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBfO1xuICAgIH1cbiAgICBleHBvcnRzLl8gPSBfO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuXyA9IF87XG4gIH1cblxuICAvLyBDdXJyZW50IHZlcnNpb24uXG4gIF8uVkVSU0lPTiA9ICcxLjYuMCc7XG5cbiAgLy8gQ29sbGVjdGlvbiBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBUaGUgY29ybmVyc3RvbmUsIGFuIGBlYWNoYCBpbXBsZW1lbnRhdGlvbiwgYWthIGBmb3JFYWNoYC5cbiAgLy8gSGFuZGxlcyBvYmplY3RzIHdpdGggdGhlIGJ1aWx0LWluIGBmb3JFYWNoYCwgYXJyYXlzLCBhbmQgcmF3IG9iamVjdHMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBmb3JFYWNoYCBpZiBhdmFpbGFibGUuXG4gIHZhciBlYWNoID0gXy5lYWNoID0gXy5mb3JFYWNoID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcbiAgICBpZiAobmF0aXZlRm9yRWFjaCAmJiBvYmouZm9yRWFjaCA9PT0gbmF0aXZlRm9yRWFjaCkge1xuICAgICAgb2JqLmZvckVhY2goaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgIH0gZWxzZSBpZiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpIHtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2ldLCBpLCBvYmopID09PSBicmVha2VyKSByZXR1cm47XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpZiAoaXRlcmF0b3IuY2FsbChjb250ZXh0LCBvYmpba2V5c1tpXV0sIGtleXNbaV0sIG9iaikgPT09IGJyZWFrZXIpIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIHJlc3VsdHMgb2YgYXBwbHlpbmcgdGhlIGl0ZXJhdG9yIHRvIGVhY2ggZWxlbWVudC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYG1hcGAgaWYgYXZhaWxhYmxlLlxuICBfLm1hcCA9IF8uY29sbGVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdHM7XG4gICAgaWYgKG5hdGl2ZU1hcCAmJiBvYmoubWFwID09PSBuYXRpdmVNYXApIHJldHVybiBvYmoubWFwKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICByZXN1bHRzLnB1c2goaXRlcmF0b3IuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICB2YXIgcmVkdWNlRXJyb3IgPSAnUmVkdWNlIG9mIGVtcHR5IGFycmF5IHdpdGggbm8gaW5pdGlhbCB2YWx1ZSc7XG5cbiAgLy8gKipSZWR1Y2UqKiBidWlsZHMgdXAgYSBzaW5nbGUgcmVzdWx0IGZyb20gYSBsaXN0IG9mIHZhbHVlcywgYWthIGBpbmplY3RgLFxuICAvLyBvciBgZm9sZGxgLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgcmVkdWNlYCBpZiBhdmFpbGFibGUuXG4gIF8ucmVkdWNlID0gXy5mb2xkbCA9IF8uaW5qZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgbWVtbywgY29udGV4dCkge1xuICAgIHZhciBpbml0aWFsID0gYXJndW1lbnRzLmxlbmd0aCA+IDI7XG4gICAgaWYgKG9iaiA9PSBudWxsKSBvYmogPSBbXTtcbiAgICBpZiAobmF0aXZlUmVkdWNlICYmIG9iai5yZWR1Y2UgPT09IG5hdGl2ZVJlZHVjZSkge1xuICAgICAgaWYgKGNvbnRleHQpIGl0ZXJhdG9yID0gXy5iaW5kKGl0ZXJhdG9yLCBjb250ZXh0KTtcbiAgICAgIHJldHVybiBpbml0aWFsID8gb2JqLnJlZHVjZShpdGVyYXRvciwgbWVtbykgOiBvYmoucmVkdWNlKGl0ZXJhdG9yKTtcbiAgICB9XG4gICAgZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKCFpbml0aWFsKSB7XG4gICAgICAgIG1lbW8gPSB2YWx1ZTtcbiAgICAgICAgaW5pdGlhbCA9IHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBtZW1vID0gaXRlcmF0b3IuY2FsbChjb250ZXh0LCBtZW1vLCB2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmICghaW5pdGlhbCkgdGhyb3cgbmV3IFR5cGVFcnJvcihyZWR1Y2VFcnJvcik7XG4gICAgcmV0dXJuIG1lbW87XG4gIH07XG5cbiAgLy8gVGhlIHJpZ2h0LWFzc29jaWF0aXZlIHZlcnNpb24gb2YgcmVkdWNlLCBhbHNvIGtub3duIGFzIGBmb2xkcmAuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGByZWR1Y2VSaWdodGAgaWYgYXZhaWxhYmxlLlxuICBfLnJlZHVjZVJpZ2h0ID0gXy5mb2xkciA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIG1lbW8sIGNvbnRleHQpIHtcbiAgICB2YXIgaW5pdGlhbCA9IGFyZ3VtZW50cy5sZW5ndGggPiAyO1xuICAgIGlmIChvYmogPT0gbnVsbCkgb2JqID0gW107XG4gICAgaWYgKG5hdGl2ZVJlZHVjZVJpZ2h0ICYmIG9iai5yZWR1Y2VSaWdodCA9PT0gbmF0aXZlUmVkdWNlUmlnaHQpIHtcbiAgICAgIGlmIChjb250ZXh0KSBpdGVyYXRvciA9IF8uYmluZChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgICByZXR1cm4gaW5pdGlhbCA/IG9iai5yZWR1Y2VSaWdodChpdGVyYXRvciwgbWVtbykgOiBvYmoucmVkdWNlUmlnaHQoaXRlcmF0b3IpO1xuICAgIH1cbiAgICB2YXIgbGVuZ3RoID0gb2JqLmxlbmd0aDtcbiAgICBpZiAobGVuZ3RoICE9PSArbGVuZ3RoKSB7XG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgfVxuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGluZGV4ID0ga2V5cyA/IGtleXNbLS1sZW5ndGhdIDogLS1sZW5ndGg7XG4gICAgICBpZiAoIWluaXRpYWwpIHtcbiAgICAgICAgbWVtbyA9IG9ialtpbmRleF07XG4gICAgICAgIGluaXRpYWwgPSB0cnVlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbWVtbyA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgbWVtbywgb2JqW2luZGV4XSwgaW5kZXgsIGxpc3QpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmICghaW5pdGlhbCkgdGhyb3cgbmV3IFR5cGVFcnJvcihyZWR1Y2VFcnJvcik7XG4gICAgcmV0dXJuIG1lbW87XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBmaXJzdCB2YWx1ZSB3aGljaCBwYXNzZXMgYSB0cnV0aCB0ZXN0LiBBbGlhc2VkIGFzIGBkZXRlY3RgLlxuICBfLmZpbmQgPSBfLmRldGVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdDtcbiAgICBhbnkob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChwcmVkaWNhdGUuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKSB7XG4gICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIHRoYXQgcGFzcyBhIHRydXRoIHRlc3QuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBmaWx0ZXJgIGlmIGF2YWlsYWJsZS5cbiAgLy8gQWxpYXNlZCBhcyBgc2VsZWN0YC5cbiAgXy5maWx0ZXIgPSBfLnNlbGVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHRzO1xuICAgIGlmIChuYXRpdmVGaWx0ZXIgJiYgb2JqLmZpbHRlciA9PT0gbmF0aXZlRmlsdGVyKSByZXR1cm4gb2JqLmZpbHRlcihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChwcmVkaWNhdGUuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGxpc3QpKSByZXN1bHRzLnB1c2godmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIGZvciB3aGljaCBhIHRydXRoIHRlc3QgZmFpbHMuXG4gIF8ucmVqZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiAhcHJlZGljYXRlLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICB9LCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgd2hldGhlciBhbGwgb2YgdGhlIGVsZW1lbnRzIG1hdGNoIGEgdHJ1dGggdGVzdC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGV2ZXJ5YCBpZiBhdmFpbGFibGUuXG4gIC8vIEFsaWFzZWQgYXMgYGFsbGAuXG4gIF8uZXZlcnkgPSBfLmFsbCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlIHx8IChwcmVkaWNhdGUgPSBfLmlkZW50aXR5KTtcbiAgICB2YXIgcmVzdWx0ID0gdHJ1ZTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5hdGl2ZUV2ZXJ5ICYmIG9iai5ldmVyeSA9PT0gbmF0aXZlRXZlcnkpIHJldHVybiBvYmouZXZlcnkocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAoIShyZXN1bHQgPSByZXN1bHQgJiYgcHJlZGljYXRlLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSkpIHJldHVybiBicmVha2VyO1xuICAgIH0pO1xuICAgIHJldHVybiAhIXJlc3VsdDtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgYXQgbGVhc3Qgb25lIGVsZW1lbnQgaW4gdGhlIG9iamVjdCBtYXRjaGVzIGEgdHJ1dGggdGVzdC5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYHNvbWVgIGlmIGF2YWlsYWJsZS5cbiAgLy8gQWxpYXNlZCBhcyBgYW55YC5cbiAgdmFyIGFueSA9IF8uc29tZSA9IF8uYW55ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgfHwgKHByZWRpY2F0ZSA9IF8uaWRlbnRpdHkpO1xuICAgIHZhciByZXN1bHQgPSBmYWxzZTtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKG5hdGl2ZVNvbWUgJiYgb2JqLnNvbWUgPT09IG5hdGl2ZVNvbWUpIHJldHVybiBvYmouc29tZShwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChyZXN1bHQgfHwgKHJlc3VsdCA9IHByZWRpY2F0ZS5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgbGlzdCkpKSByZXR1cm4gYnJlYWtlcjtcbiAgICB9KTtcbiAgICByZXR1cm4gISFyZXN1bHQ7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIHRoZSBhcnJheSBvciBvYmplY3QgY29udGFpbnMgYSBnaXZlbiB2YWx1ZSAodXNpbmcgYD09PWApLlxuICAvLyBBbGlhc2VkIGFzIGBpbmNsdWRlYC5cbiAgXy5jb250YWlucyA9IF8uaW5jbHVkZSA9IGZ1bmN0aW9uKG9iaiwgdGFyZ2V0KSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gZmFsc2U7XG4gICAgaWYgKG5hdGl2ZUluZGV4T2YgJiYgb2JqLmluZGV4T2YgPT09IG5hdGl2ZUluZGV4T2YpIHJldHVybiBvYmouaW5kZXhPZih0YXJnZXQpICE9IC0xO1xuICAgIHJldHVybiBhbnkob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmV0dXJuIHZhbHVlID09PSB0YXJnZXQ7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gSW52b2tlIGEgbWV0aG9kICh3aXRoIGFyZ3VtZW50cykgb24gZXZlcnkgaXRlbSBpbiBhIGNvbGxlY3Rpb24uXG4gIF8uaW52b2tlID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgaXNGdW5jID0gXy5pc0Z1bmN0aW9uKG1ldGhvZCk7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHJldHVybiAoaXNGdW5jID8gbWV0aG9kIDogdmFsdWVbbWV0aG9kXSkuYXBwbHkodmFsdWUsIGFyZ3MpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYG1hcGA6IGZldGNoaW5nIGEgcHJvcGVydHkuXG4gIF8ucGx1Y2sgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBfLm1hcChvYmosIF8ucHJvcGVydHkoa2V5KSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmlsdGVyYDogc2VsZWN0aW5nIG9ubHkgb2JqZWN0c1xuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLndoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycykge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIF8ubWF0Y2hlcyhhdHRycykpO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYGZpbmRgOiBnZXR0aW5nIHRoZSBmaXJzdCBvYmplY3RcbiAgLy8gY29udGFpbmluZyBzcGVjaWZpYyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5maW5kV2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8uZmluZChvYmosIF8ubWF0Y2hlcyhhdHRycykpO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWF4aW11bSBlbGVtZW50IG9yIChlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgLy8gQ2FuJ3Qgb3B0aW1pemUgYXJyYXlzIG9mIGludGVnZXJzIGxvbmdlciB0aGFuIDY1LDUzNSBlbGVtZW50cy5cbiAgLy8gU2VlIFtXZWJLaXQgQnVnIDgwNzk3XShodHRwczovL2J1Z3Mud2Via2l0Lm9yZy9zaG93X2J1Zy5jZ2k/aWQ9ODA3OTcpXG4gIF8ubWF4ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmICghaXRlcmF0b3IgJiYgXy5pc0FycmF5KG9iaikgJiYgb2JqWzBdID09PSArb2JqWzBdICYmIG9iai5sZW5ndGggPCA2NTUzNSkge1xuICAgICAgcmV0dXJuIE1hdGgubWF4LmFwcGx5KE1hdGgsIG9iaik7XG4gICAgfVxuICAgIHZhciByZXN1bHQgPSAtSW5maW5pdHksIGxhc3RDb21wdXRlZCA9IC1JbmZpbml0eTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICB2YXIgY29tcHV0ZWQgPSBpdGVyYXRvciA/IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSA6IHZhbHVlO1xuICAgICAgaWYgKGNvbXB1dGVkID4gbGFzdENvbXB1dGVkKSB7XG4gICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICBsYXN0Q29tcHV0ZWQgPSBjb21wdXRlZDtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWluaW11bSBlbGVtZW50IChvciBlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgXy5taW4gPSBmdW5jdGlvbihvYmosIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgaWYgKCFpdGVyYXRvciAmJiBfLmlzQXJyYXkob2JqKSAmJiBvYmpbMF0gPT09ICtvYmpbMF0gJiYgb2JqLmxlbmd0aCA8IDY1NTM1KSB7XG4gICAgICByZXR1cm4gTWF0aC5taW4uYXBwbHkoTWF0aCwgb2JqKTtcbiAgICB9XG4gICAgdmFyIHJlc3VsdCA9IEluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSBJbmZpbml0eTtcbiAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICB2YXIgY29tcHV0ZWQgPSBpdGVyYXRvciA/IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KSA6IHZhbHVlO1xuICAgICAgaWYgKGNvbXB1dGVkIDwgbGFzdENvbXB1dGVkKSB7XG4gICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICBsYXN0Q29tcHV0ZWQgPSBjb21wdXRlZDtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFNodWZmbGUgYW4gYXJyYXksIHVzaW5nIHRoZSBtb2Rlcm4gdmVyc2lvbiBvZiB0aGVcbiAgLy8gW0Zpc2hlci1ZYXRlcyBzaHVmZmxlXShodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0Zpc2hlcuKAk1lhdGVzX3NodWZmbGUpLlxuICBfLnNodWZmbGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcmFuZDtcbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzaHVmZmxlZCA9IFtdO1xuICAgIGVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgcmFuZCA9IF8ucmFuZG9tKGluZGV4KyspO1xuICAgICAgc2h1ZmZsZWRbaW5kZXggLSAxXSA9IHNodWZmbGVkW3JhbmRdO1xuICAgICAgc2h1ZmZsZWRbcmFuZF0gPSB2YWx1ZTtcbiAgICB9KTtcbiAgICByZXR1cm4gc2h1ZmZsZWQ7XG4gIH07XG5cbiAgLy8gU2FtcGxlICoqbioqIHJhbmRvbSB2YWx1ZXMgZnJvbSBhIGNvbGxlY3Rpb24uXG4gIC8vIElmICoqbioqIGlzIG5vdCBzcGVjaWZpZWQsIHJldHVybnMgYSBzaW5nbGUgcmFuZG9tIGVsZW1lbnQuXG4gIC8vIFRoZSBpbnRlcm5hbCBgZ3VhcmRgIGFyZ3VtZW50IGFsbG93cyBpdCB0byB3b3JrIHdpdGggYG1hcGAuXG4gIF8uc2FtcGxlID0gZnVuY3Rpb24ob2JqLCBuLCBndWFyZCkge1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHtcbiAgICAgIGlmIChvYmoubGVuZ3RoICE9PSArb2JqLmxlbmd0aCkgb2JqID0gXy52YWx1ZXMob2JqKTtcbiAgICAgIHJldHVybiBvYmpbXy5yYW5kb20ob2JqLmxlbmd0aCAtIDEpXTtcbiAgICB9XG4gICAgcmV0dXJuIF8uc2h1ZmZsZShvYmopLnNsaWNlKDAsIE1hdGgubWF4KDAsIG4pKTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiB0byBnZW5lcmF0ZSBsb29rdXAgaXRlcmF0b3JzLlxuICB2YXIgbG9va3VwSXRlcmF0b3IgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIGlmICh2YWx1ZSA9PSBudWxsKSByZXR1cm4gXy5pZGVudGl0eTtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKHZhbHVlKSkgcmV0dXJuIHZhbHVlO1xuICAgIHJldHVybiBfLnByb3BlcnR5KHZhbHVlKTtcbiAgfTtcblxuICAvLyBTb3J0IHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24gcHJvZHVjZWQgYnkgYW4gaXRlcmF0b3IuXG4gIF8uc29ydEJ5ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGl0ZXJhdG9yID0gbG9va3VwSXRlcmF0b3IoaXRlcmF0b3IpO1xuICAgIHJldHVybiBfLnBsdWNrKF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgIGluZGV4OiBpbmRleCxcbiAgICAgICAgY3JpdGVyaWE6IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBsaXN0KVxuICAgICAgfTtcbiAgICB9KS5zb3J0KGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWE7XG4gICAgICB2YXIgYiA9IHJpZ2h0LmNyaXRlcmlhO1xuICAgICAgaWYgKGEgIT09IGIpIHtcbiAgICAgICAgaWYgKGEgPiBiIHx8IGEgPT09IHZvaWQgMCkgcmV0dXJuIDE7XG4gICAgICAgIGlmIChhIDwgYiB8fCBiID09PSB2b2lkIDApIHJldHVybiAtMTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsZWZ0LmluZGV4IC0gcmlnaHQuaW5kZXg7XG4gICAgfSksICd2YWx1ZScpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIHVzZWQgZm9yIGFnZ3JlZ2F0ZSBcImdyb3VwIGJ5XCIgb3BlcmF0aW9ucy5cbiAgdmFyIGdyb3VwID0gZnVuY3Rpb24oYmVoYXZpb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgICAgaXRlcmF0b3IgPSBsb29rdXBJdGVyYXRvcihpdGVyYXRvcik7XG4gICAgICBlYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4KSB7XG4gICAgICAgIHZhciBrZXkgPSBpdGVyYXRvci5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgb2JqKTtcbiAgICAgICAgYmVoYXZpb3IocmVzdWx0LCBrZXksIHZhbHVlKTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEdyb3VwcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLiBQYXNzIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGVcbiAgLy8gdG8gZ3JvdXAgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBjcml0ZXJpb24uXG4gIF8uZ3JvdXBCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwga2V5LCB2YWx1ZSkge1xuICAgIF8uaGFzKHJlc3VsdCwga2V5KSA/IHJlc3VsdFtrZXldLnB1c2godmFsdWUpIDogcmVzdWx0W2tleV0gPSBbdmFsdWVdO1xuICB9KTtcblxuICAvLyBJbmRleGVzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24sIHNpbWlsYXIgdG8gYGdyb3VwQnlgLCBidXQgZm9yXG4gIC8vIHdoZW4geW91IGtub3cgdGhhdCB5b3VyIGluZGV4IHZhbHVlcyB3aWxsIGJlIHVuaXF1ZS5cbiAgXy5pbmRleEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCBrZXksIHZhbHVlKSB7XG4gICAgcmVzdWx0W2tleV0gPSB2YWx1ZTtcbiAgfSk7XG5cbiAgLy8gQ291bnRzIGluc3RhbmNlcyBvZiBhbiBvYmplY3QgdGhhdCBncm91cCBieSBhIGNlcnRhaW4gY3JpdGVyaW9uLiBQYXNzXG4gIC8vIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGUgdG8gY291bnQgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZVxuICAvLyBjcml0ZXJpb24uXG4gIF8uY291bnRCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwga2V5KSB7XG4gICAgXy5oYXMocmVzdWx0LCBrZXkpID8gcmVzdWx0W2tleV0rKyA6IHJlc3VsdFtrZXldID0gMTtcbiAgfSk7XG5cbiAgLy8gVXNlIGEgY29tcGFyYXRvciBmdW5jdGlvbiB0byBmaWd1cmUgb3V0IHRoZSBzbWFsbGVzdCBpbmRleCBhdCB3aGljaFxuICAvLyBhbiBvYmplY3Qgc2hvdWxkIGJlIGluc2VydGVkIHNvIGFzIHRvIG1haW50YWluIG9yZGVyLiBVc2VzIGJpbmFyeSBzZWFyY2guXG4gIF8uc29ydGVkSW5kZXggPSBmdW5jdGlvbihhcnJheSwgb2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGl0ZXJhdG9yID0gbG9va3VwSXRlcmF0b3IoaXRlcmF0b3IpO1xuICAgIHZhciB2YWx1ZSA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqKTtcbiAgICB2YXIgbG93ID0gMCwgaGlnaCA9IGFycmF5Lmxlbmd0aDtcbiAgICB3aGlsZSAobG93IDwgaGlnaCkge1xuICAgICAgdmFyIG1pZCA9IChsb3cgKyBoaWdoKSA+Pj4gMTtcbiAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgYXJyYXlbbWlkXSkgPCB2YWx1ZSA/IGxvdyA9IG1pZCArIDEgOiBoaWdoID0gbWlkO1xuICAgIH1cbiAgICByZXR1cm4gbG93O1xuICB9O1xuXG4gIC8vIFNhZmVseSBjcmVhdGUgYSByZWFsLCBsaXZlIGFycmF5IGZyb20gYW55dGhpbmcgaXRlcmFibGUuXG4gIF8udG9BcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghb2JqKSByZXR1cm4gW107XG4gICAgaWYgKF8uaXNBcnJheShvYmopKSByZXR1cm4gc2xpY2UuY2FsbChvYmopO1xuICAgIGlmIChvYmoubGVuZ3RoID09PSArb2JqLmxlbmd0aCkgcmV0dXJuIF8ubWFwKG9iaiwgXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIF8udmFsdWVzKG9iaik7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBudW1iZXIgb2YgZWxlbWVudHMgaW4gYW4gb2JqZWN0LlxuICBfLnNpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiAwO1xuICAgIHJldHVybiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpID8gb2JqLmxlbmd0aCA6IF8ua2V5cyhvYmopLmxlbmd0aDtcbiAgfTtcblxuICAvLyBBcnJheSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gR2V0IHRoZSBmaXJzdCBlbGVtZW50IG9mIGFuIGFycmF5LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIHRoZSBmaXJzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYGhlYWRgIGFuZCBgdGFrZWAuIFRoZSAqKmd1YXJkKiogY2hlY2tcbiAgLy8gYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLmZpcnN0ID0gXy5oZWFkID0gXy50YWtlID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgaWYgKChuID09IG51bGwpIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbMF07XG4gICAgaWYgKG4gPCAwKSByZXR1cm4gW107XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIDAsIG4pO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGxhc3QgZW50cnkgb2YgdGhlIGFycmF5LiBFc3BlY2lhbGx5IHVzZWZ1bCBvblxuICAvLyB0aGUgYXJndW1lbnRzIG9iamVjdC4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiBhbGwgdGhlIHZhbHVlcyBpblxuICAvLyB0aGUgYXJyYXksIGV4Y2x1ZGluZyB0aGUgbGFzdCBOLiBUaGUgKipndWFyZCoqIGNoZWNrIGFsbG93cyBpdCB0byB3b3JrIHdpdGhcbiAgLy8gYF8ubWFwYC5cbiAgXy5pbml0aWFsID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIDAsIGFycmF5Lmxlbmd0aCAtICgobiA9PSBudWxsKSB8fCBndWFyZCA/IDEgOiBuKSk7XG4gIH07XG5cbiAgLy8gR2V0IHRoZSBsYXN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGxhc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LiBUaGUgKipndWFyZCoqIGNoZWNrIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5sYXN0ID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgaWYgKChuID09IG51bGwpIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbYXJyYXkubGVuZ3RoIC0gMV07XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIE1hdGgubWF4KGFycmF5Lmxlbmd0aCAtIG4sIDApKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGV2ZXJ5dGhpbmcgYnV0IHRoZSBmaXJzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYHRhaWxgIGFuZCBgZHJvcGAuXG4gIC8vIEVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nIGFuICoqbioqIHdpbGwgcmV0dXJuXG4gIC8vIHRoZSByZXN0IE4gdmFsdWVzIGluIHRoZSBhcnJheS4gVGhlICoqZ3VhcmQqKlxuICAvLyBjaGVjayBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8ucmVzdCA9IF8udGFpbCA9IF8uZHJvcCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCAobiA9PSBudWxsKSB8fCBndWFyZCA/IDEgOiBuKTtcbiAgfTtcblxuICAvLyBUcmltIG91dCBhbGwgZmFsc3kgdmFsdWVzIGZyb20gYW4gYXJyYXkuXG4gIF8uY29tcGFjdCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKGFycmF5LCBfLmlkZW50aXR5KTtcbiAgfTtcblxuICAvLyBJbnRlcm5hbCBpbXBsZW1lbnRhdGlvbiBvZiBhIHJlY3Vyc2l2ZSBgZmxhdHRlbmAgZnVuY3Rpb24uXG4gIHZhciBmbGF0dGVuID0gZnVuY3Rpb24oaW5wdXQsIHNoYWxsb3csIG91dHB1dCkge1xuICAgIGlmIChzaGFsbG93ICYmIF8uZXZlcnkoaW5wdXQsIF8uaXNBcnJheSkpIHtcbiAgICAgIHJldHVybiBjb25jYXQuYXBwbHkob3V0cHV0LCBpbnB1dCk7XG4gICAgfVxuICAgIGVhY2goaW5wdXQsIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICBpZiAoXy5pc0FycmF5KHZhbHVlKSB8fCBfLmlzQXJndW1lbnRzKHZhbHVlKSkge1xuICAgICAgICBzaGFsbG93ID8gcHVzaC5hcHBseShvdXRwdXQsIHZhbHVlKSA6IGZsYXR0ZW4odmFsdWUsIHNoYWxsb3csIG91dHB1dCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBvdXRwdXQucHVzaCh2YWx1ZSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG91dHB1dDtcbiAgfTtcblxuICAvLyBGbGF0dGVuIG91dCBhbiBhcnJheSwgZWl0aGVyIHJlY3Vyc2l2ZWx5IChieSBkZWZhdWx0KSwgb3IganVzdCBvbmUgbGV2ZWwuXG4gIF8uZmxhdHRlbiA9IGZ1bmN0aW9uKGFycmF5LCBzaGFsbG93KSB7XG4gICAgcmV0dXJuIGZsYXR0ZW4oYXJyYXksIHNoYWxsb3csIFtdKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSB2ZXJzaW9uIG9mIHRoZSBhcnJheSB0aGF0IGRvZXMgbm90IGNvbnRhaW4gdGhlIHNwZWNpZmllZCB2YWx1ZShzKS5cbiAgXy53aXRob3V0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5kaWZmZXJlbmNlKGFycmF5LCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICB9O1xuXG4gIC8vIFNwbGl0IGFuIGFycmF5IGludG8gdHdvIGFycmF5czogb25lIHdob3NlIGVsZW1lbnRzIGFsbCBzYXRpc2Z5IHRoZSBnaXZlblxuICAvLyBwcmVkaWNhdGUsIGFuZCBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIGRvIG5vdCBzYXRpc2Z5IHRoZSBwcmVkaWNhdGUuXG4gIF8ucGFydGl0aW9uID0gZnVuY3Rpb24oYXJyYXksIHByZWRpY2F0ZSkge1xuICAgIHZhciBwYXNzID0gW10sIGZhaWwgPSBbXTtcbiAgICBlYWNoKGFycmF5LCBmdW5jdGlvbihlbGVtKSB7XG4gICAgICAocHJlZGljYXRlKGVsZW0pID8gcGFzcyA6IGZhaWwpLnB1c2goZWxlbSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFtwYXNzLCBmYWlsXTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGEgZHVwbGljYXRlLWZyZWUgdmVyc2lvbiBvZiB0aGUgYXJyYXkuIElmIHRoZSBhcnJheSBoYXMgYWxyZWFkeVxuICAvLyBiZWVuIHNvcnRlZCwgeW91IGhhdmUgdGhlIG9wdGlvbiBvZiB1c2luZyBhIGZhc3RlciBhbGdvcml0aG0uXG4gIC8vIEFsaWFzZWQgYXMgYHVuaXF1ZWAuXG4gIF8udW5pcSA9IF8udW5pcXVlID0gZnVuY3Rpb24oYXJyYXksIGlzU29ydGVkLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgIGlmIChfLmlzRnVuY3Rpb24oaXNTb3J0ZWQpKSB7XG4gICAgICBjb250ZXh0ID0gaXRlcmF0b3I7XG4gICAgICBpdGVyYXRvciA9IGlzU29ydGVkO1xuICAgICAgaXNTb3J0ZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgdmFyIGluaXRpYWwgPSBpdGVyYXRvciA/IF8ubWFwKGFycmF5LCBpdGVyYXRvciwgY29udGV4dCkgOiBhcnJheTtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIHZhciBzZWVuID0gW107XG4gICAgZWFjaChpbml0aWFsLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgIGlmIChpc1NvcnRlZCA/ICghaW5kZXggfHwgc2VlbltzZWVuLmxlbmd0aCAtIDFdICE9PSB2YWx1ZSkgOiAhXy5jb250YWlucyhzZWVuLCB2YWx1ZSkpIHtcbiAgICAgICAgc2Vlbi5wdXNoKHZhbHVlKTtcbiAgICAgICAgcmVzdWx0cy5wdXNoKGFycmF5W2luZGV4XSk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIHRoZSB1bmlvbjogZWFjaCBkaXN0aW5jdCBlbGVtZW50IGZyb20gYWxsIG9mXG4gIC8vIHRoZSBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLnVuaW9uID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIF8udW5pcShfLmZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIGV2ZXJ5IGl0ZW0gc2hhcmVkIGJldHdlZW4gYWxsIHRoZVxuICAvLyBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLmludGVyc2VjdGlvbiA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3QgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgcmV0dXJuIF8uZmlsdGVyKF8udW5pcShhcnJheSksIGZ1bmN0aW9uKGl0ZW0pIHtcbiAgICAgIHJldHVybiBfLmV2ZXJ5KHJlc3QsIGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgICAgIHJldHVybiBfLmNvbnRhaW5zKG90aGVyLCBpdGVtKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIFRha2UgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBvbmUgYXJyYXkgYW5kIGEgbnVtYmVyIG9mIG90aGVyIGFycmF5cy5cbiAgLy8gT25seSB0aGUgZWxlbWVudHMgcHJlc2VudCBpbiBqdXN0IHRoZSBmaXJzdCBhcnJheSB3aWxsIHJlbWFpbi5cbiAgXy5kaWZmZXJlbmNlID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdCA9IGNvbmNhdC5hcHBseShBcnJheVByb3RvLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgZnVuY3Rpb24odmFsdWUpeyByZXR1cm4gIV8uY29udGFpbnMocmVzdCwgdmFsdWUpOyB9KTtcbiAgfTtcblxuICAvLyBaaXAgdG9nZXRoZXIgbXVsdGlwbGUgbGlzdHMgaW50byBhIHNpbmdsZSBhcnJheSAtLSBlbGVtZW50cyB0aGF0IHNoYXJlXG4gIC8vIGFuIGluZGV4IGdvIHRvZ2V0aGVyLlxuICBfLnppcCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBsZW5ndGggPSBfLm1heChfLnBsdWNrKGFyZ3VtZW50cywgJ2xlbmd0aCcpLmNvbmNhdCgwKSk7XG4gICAgdmFyIHJlc3VsdHMgPSBuZXcgQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICByZXN1bHRzW2ldID0gXy5wbHVjayhhcmd1bWVudHMsICcnICsgaSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENvbnZlcnRzIGxpc3RzIGludG8gb2JqZWN0cy4gUGFzcyBlaXRoZXIgYSBzaW5nbGUgYXJyYXkgb2YgYFtrZXksIHZhbHVlXWBcbiAgLy8gcGFpcnMsIG9yIHR3byBwYXJhbGxlbCBhcnJheXMgb2YgdGhlIHNhbWUgbGVuZ3RoIC0tIG9uZSBvZiBrZXlzLCBhbmQgb25lIG9mXG4gIC8vIHRoZSBjb3JyZXNwb25kaW5nIHZhbHVlcy5cbiAgXy5vYmplY3QgPSBmdW5jdGlvbihsaXN0LCB2YWx1ZXMpIHtcbiAgICBpZiAobGlzdCA9PSBudWxsKSByZXR1cm4ge307XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBsaXN0Lmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAodmFsdWVzKSB7XG4gICAgICAgIHJlc3VsdFtsaXN0W2ldXSA9IHZhbHVlc1tpXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdFtsaXN0W2ldWzBdXSA9IGxpc3RbaV1bMV07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gSWYgdGhlIGJyb3dzZXIgZG9lc24ndCBzdXBwbHkgdXMgd2l0aCBpbmRleE9mIChJJ20gbG9va2luZyBhdCB5b3UsICoqTVNJRSoqKSxcbiAgLy8gd2UgbmVlZCB0aGlzIGZ1bmN0aW9uLiBSZXR1cm4gdGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBvY2N1cnJlbmNlIG9mIGFuXG4gIC8vIGl0ZW0gaW4gYW4gYXJyYXksIG9yIC0xIGlmIHRoZSBpdGVtIGlzIG5vdCBpbmNsdWRlZCBpbiB0aGUgYXJyYXkuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBpbmRleE9mYCBpZiBhdmFpbGFibGUuXG4gIC8vIElmIHRoZSBhcnJheSBpcyBsYXJnZSBhbmQgYWxyZWFkeSBpbiBzb3J0IG9yZGVyLCBwYXNzIGB0cnVlYFxuICAvLyBmb3IgKippc1NvcnRlZCoqIHRvIHVzZSBiaW5hcnkgc2VhcmNoLlxuICBfLmluZGV4T2YgPSBmdW5jdGlvbihhcnJheSwgaXRlbSwgaXNTb3J0ZWQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIC0xO1xuICAgIHZhciBpID0gMCwgbGVuZ3RoID0gYXJyYXkubGVuZ3RoO1xuICAgIGlmIChpc1NvcnRlZCkge1xuICAgICAgaWYgKHR5cGVvZiBpc1NvcnRlZCA9PSAnbnVtYmVyJykge1xuICAgICAgICBpID0gKGlzU29ydGVkIDwgMCA/IE1hdGgubWF4KDAsIGxlbmd0aCArIGlzU29ydGVkKSA6IGlzU29ydGVkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGkgPSBfLnNvcnRlZEluZGV4KGFycmF5LCBpdGVtKTtcbiAgICAgICAgcmV0dXJuIGFycmF5W2ldID09PSBpdGVtID8gaSA6IC0xO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAobmF0aXZlSW5kZXhPZiAmJiBhcnJheS5pbmRleE9mID09PSBuYXRpdmVJbmRleE9mKSByZXR1cm4gYXJyYXkuaW5kZXhPZihpdGVtLCBpc1NvcnRlZCk7XG4gICAgZm9yICg7IGkgPCBsZW5ndGg7IGkrKykgaWYgKGFycmF5W2ldID09PSBpdGVtKSByZXR1cm4gaTtcbiAgICByZXR1cm4gLTE7XG4gIH07XG5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYGxhc3RJbmRleE9mYCBpZiBhdmFpbGFibGUuXG4gIF8ubGFzdEluZGV4T2YgPSBmdW5jdGlvbihhcnJheSwgaXRlbSwgZnJvbSkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gLTE7XG4gICAgdmFyIGhhc0luZGV4ID0gZnJvbSAhPSBudWxsO1xuICAgIGlmIChuYXRpdmVMYXN0SW5kZXhPZiAmJiBhcnJheS5sYXN0SW5kZXhPZiA9PT0gbmF0aXZlTGFzdEluZGV4T2YpIHtcbiAgICAgIHJldHVybiBoYXNJbmRleCA/IGFycmF5Lmxhc3RJbmRleE9mKGl0ZW0sIGZyb20pIDogYXJyYXkubGFzdEluZGV4T2YoaXRlbSk7XG4gICAgfVxuICAgIHZhciBpID0gKGhhc0luZGV4ID8gZnJvbSA6IGFycmF5Lmxlbmd0aCk7XG4gICAgd2hpbGUgKGktLSkgaWYgKGFycmF5W2ldID09PSBpdGVtKSByZXR1cm4gaTtcbiAgICByZXR1cm4gLTE7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgYW4gaW50ZWdlciBBcnJheSBjb250YWluaW5nIGFuIGFyaXRobWV0aWMgcHJvZ3Jlc3Npb24uIEEgcG9ydCBvZlxuICAvLyB0aGUgbmF0aXZlIFB5dGhvbiBgcmFuZ2UoKWAgZnVuY3Rpb24uIFNlZVxuICAvLyBbdGhlIFB5dGhvbiBkb2N1bWVudGF0aW9uXShodHRwOi8vZG9jcy5weXRob24ub3JnL2xpYnJhcnkvZnVuY3Rpb25zLmh0bWwjcmFuZ2UpLlxuICBfLnJhbmdlID0gZnVuY3Rpb24oc3RhcnQsIHN0b3AsIHN0ZXApIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8PSAxKSB7XG4gICAgICBzdG9wID0gc3RhcnQgfHwgMDtcbiAgICAgIHN0YXJ0ID0gMDtcbiAgICB9XG4gICAgc3RlcCA9IGFyZ3VtZW50c1syXSB8fCAxO1xuXG4gICAgdmFyIGxlbmd0aCA9IE1hdGgubWF4KE1hdGguY2VpbCgoc3RvcCAtIHN0YXJ0KSAvIHN0ZXApLCAwKTtcbiAgICB2YXIgaWR4ID0gMDtcbiAgICB2YXIgcmFuZ2UgPSBuZXcgQXJyYXkobGVuZ3RoKTtcblxuICAgIHdoaWxlKGlkeCA8IGxlbmd0aCkge1xuICAgICAgcmFuZ2VbaWR4KytdID0gc3RhcnQ7XG4gICAgICBzdGFydCArPSBzdGVwO1xuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfTtcblxuICAvLyBGdW5jdGlvbiAoYWhlbSkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJldXNhYmxlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIGZvciBwcm90b3R5cGUgc2V0dGluZy5cbiAgdmFyIGN0b3IgPSBmdW5jdGlvbigpe307XG5cbiAgLy8gQ3JlYXRlIGEgZnVuY3Rpb24gYm91bmQgdG8gYSBnaXZlbiBvYmplY3QgKGFzc2lnbmluZyBgdGhpc2AsIGFuZCBhcmd1bWVudHMsXG4gIC8vIG9wdGlvbmFsbHkpLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgRnVuY3Rpb24uYmluZGAgaWZcbiAgLy8gYXZhaWxhYmxlLlxuICBfLmJpbmQgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0KSB7XG4gICAgdmFyIGFyZ3MsIGJvdW5kO1xuICAgIGlmIChuYXRpdmVCaW5kICYmIGZ1bmMuYmluZCA9PT0gbmF0aXZlQmluZCkgcmV0dXJuIG5hdGl2ZUJpbmQuYXBwbHkoZnVuYywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICBpZiAoIV8uaXNGdW5jdGlvbihmdW5jKSkgdGhyb3cgbmV3IFR5cGVFcnJvcjtcbiAgICBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBib3VuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIGJvdW5kKSkgcmV0dXJuIGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgICBjdG9yLnByb3RvdHlwZSA9IGZ1bmMucHJvdG90eXBlO1xuICAgICAgdmFyIHNlbGYgPSBuZXcgY3RvcjtcbiAgICAgIGN0b3IucHJvdG90eXBlID0gbnVsbDtcbiAgICAgIHZhciByZXN1bHQgPSBmdW5jLmFwcGx5KHNlbGYsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICAgICAgaWYgKE9iamVjdChyZXN1bHQpID09PSByZXN1bHQpIHJldHVybiByZXN1bHQ7XG4gICAgICByZXR1cm4gc2VsZjtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFBhcnRpYWxseSBhcHBseSBhIGZ1bmN0aW9uIGJ5IGNyZWF0aW5nIGEgdmVyc2lvbiB0aGF0IGhhcyBoYWQgc29tZSBvZiBpdHNcbiAgLy8gYXJndW1lbnRzIHByZS1maWxsZWQsIHdpdGhvdXQgY2hhbmdpbmcgaXRzIGR5bmFtaWMgYHRoaXNgIGNvbnRleHQuIF8gYWN0c1xuICAvLyBhcyBhIHBsYWNlaG9sZGVyLCBhbGxvd2luZyBhbnkgY29tYmluYXRpb24gb2YgYXJndW1lbnRzIHRvIGJlIHByZS1maWxsZWQuXG4gIF8ucGFydGlhbCA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICB2YXIgYm91bmRBcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBwb3NpdGlvbiA9IDA7XG4gICAgICB2YXIgYXJncyA9IGJvdW5kQXJncy5zbGljZSgpO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGFyZ3MubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGFyZ3NbaV0gPT09IF8pIGFyZ3NbaV0gPSBhcmd1bWVudHNbcG9zaXRpb24rK107XG4gICAgICB9XG4gICAgICB3aGlsZSAocG9zaXRpb24gPCBhcmd1bWVudHMubGVuZ3RoKSBhcmdzLnB1c2goYXJndW1lbnRzW3Bvc2l0aW9uKytdKTtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gQmluZCBhIG51bWJlciBvZiBhbiBvYmplY3QncyBtZXRob2RzIHRvIHRoYXQgb2JqZWN0LiBSZW1haW5pbmcgYXJndW1lbnRzXG4gIC8vIGFyZSB0aGUgbWV0aG9kIG5hbWVzIHRvIGJlIGJvdW5kLiBVc2VmdWwgZm9yIGVuc3VyaW5nIHRoYXQgYWxsIGNhbGxiYWNrc1xuICAvLyBkZWZpbmVkIG9uIGFuIG9iamVjdCBiZWxvbmcgdG8gaXQuXG4gIF8uYmluZEFsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBmdW5jcyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICBpZiAoZnVuY3MubGVuZ3RoID09PSAwKSB0aHJvdyBuZXcgRXJyb3IoJ2JpbmRBbGwgbXVzdCBiZSBwYXNzZWQgZnVuY3Rpb24gbmFtZXMnKTtcbiAgICBlYWNoKGZ1bmNzLCBmdW5jdGlvbihmKSB7IG9ialtmXSA9IF8uYmluZChvYmpbZl0sIG9iaik7IH0pO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gTWVtb2l6ZSBhbiBleHBlbnNpdmUgZnVuY3Rpb24gYnkgc3RvcmluZyBpdHMgcmVzdWx0cy5cbiAgXy5tZW1vaXplID0gZnVuY3Rpb24oZnVuYywgaGFzaGVyKSB7XG4gICAgdmFyIG1lbW8gPSB7fTtcbiAgICBoYXNoZXIgfHwgKGhhc2hlciA9IF8uaWRlbnRpdHkpO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBrZXkgPSBoYXNoZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBfLmhhcyhtZW1vLCBrZXkpID8gbWVtb1trZXldIDogKG1lbW9ba2V5XSA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKSk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBEZWxheXMgYSBmdW5jdGlvbiBmb3IgdGhlIGdpdmVuIG51bWJlciBvZiBtaWxsaXNlY29uZHMsIGFuZCB0aGVuIGNhbGxzXG4gIC8vIGl0IHdpdGggdGhlIGFyZ3VtZW50cyBzdXBwbGllZC5cbiAgXy5kZWxheSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpeyByZXR1cm4gZnVuYy5hcHBseShudWxsLCBhcmdzKTsgfSwgd2FpdCk7XG4gIH07XG5cbiAgLy8gRGVmZXJzIGEgZnVuY3Rpb24sIHNjaGVkdWxpbmcgaXQgdG8gcnVuIGFmdGVyIHRoZSBjdXJyZW50IGNhbGwgc3RhY2sgaGFzXG4gIC8vIGNsZWFyZWQuXG4gIF8uZGVmZXIgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgcmV0dXJuIF8uZGVsYXkuYXBwbHkoXywgW2Z1bmMsIDFdLmNvbmNhdChzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIHdoZW4gaW52b2tlZCwgd2lsbCBvbmx5IGJlIHRyaWdnZXJlZCBhdCBtb3N0IG9uY2VcbiAgLy8gZHVyaW5nIGEgZ2l2ZW4gd2luZG93IG9mIHRpbWUuIE5vcm1hbGx5LCB0aGUgdGhyb3R0bGVkIGZ1bmN0aW9uIHdpbGwgcnVuXG4gIC8vIGFzIG11Y2ggYXMgaXQgY2FuLCB3aXRob3V0IGV2ZXIgZ29pbmcgbW9yZSB0aGFuIG9uY2UgcGVyIGB3YWl0YCBkdXJhdGlvbjtcbiAgLy8gYnV0IGlmIHlvdSdkIGxpa2UgdG8gZGlzYWJsZSB0aGUgZXhlY3V0aW9uIG9uIHRoZSBsZWFkaW5nIGVkZ2UsIHBhc3NcbiAgLy8gYHtsZWFkaW5nOiBmYWxzZX1gLiBUbyBkaXNhYmxlIGV4ZWN1dGlvbiBvbiB0aGUgdHJhaWxpbmcgZWRnZSwgZGl0dG8uXG4gIF8udGhyb3R0bGUgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBvcHRpb25zKSB7XG4gICAgdmFyIGNvbnRleHQsIGFyZ3MsIHJlc3VsdDtcbiAgICB2YXIgdGltZW91dCA9IG51bGw7XG4gICAgdmFyIHByZXZpb3VzID0gMDtcbiAgICBvcHRpb25zIHx8IChvcHRpb25zID0ge30pO1xuICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcHJldmlvdXMgPSBvcHRpb25zLmxlYWRpbmcgPT09IGZhbHNlID8gMCA6IF8ubm93KCk7XG4gICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgfTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbm93ID0gXy5ub3coKTtcbiAgICAgIGlmICghcHJldmlvdXMgJiYgb3B0aW9ucy5sZWFkaW5nID09PSBmYWxzZSkgcHJldmlvdXMgPSBub3c7XG4gICAgICB2YXIgcmVtYWluaW5nID0gd2FpdCAtIChub3cgLSBwcmV2aW91cyk7XG4gICAgICBjb250ZXh0ID0gdGhpcztcbiAgICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICBpZiAocmVtYWluaW5nIDw9IDApIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgcHJldmlvdXMgPSBub3c7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH0gZWxzZSBpZiAoIXRpbWVvdXQgJiYgb3B0aW9ucy50cmFpbGluZyAhPT0gZmFsc2UpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHJlbWFpbmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCBhcyBsb25nIGFzIGl0IGNvbnRpbnVlcyB0byBiZSBpbnZva2VkLCB3aWxsIG5vdFxuICAvLyBiZSB0cmlnZ2VyZWQuIFRoZSBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCBhZnRlciBpdCBzdG9wcyBiZWluZyBjYWxsZWQgZm9yXG4gIC8vIE4gbWlsbGlzZWNvbmRzLiBJZiBgaW1tZWRpYXRlYCBpcyBwYXNzZWQsIHRyaWdnZXIgdGhlIGZ1bmN0aW9uIG9uIHRoZVxuICAvLyBsZWFkaW5nIGVkZ2UsIGluc3RlYWQgb2YgdGhlIHRyYWlsaW5nLlxuICBfLmRlYm91bmNlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgaW1tZWRpYXRlKSB7XG4gICAgdmFyIHRpbWVvdXQsIGFyZ3MsIGNvbnRleHQsIHRpbWVzdGFtcCwgcmVzdWx0O1xuXG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbGFzdCA9IF8ubm93KCkgLSB0aW1lc3RhbXA7XG4gICAgICBpZiAobGFzdCA8IHdhaXQpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHdhaXQgLSBsYXN0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICBpZiAoIWltbWVkaWF0ZSkge1xuICAgICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgICAgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnRleHQgPSB0aGlzO1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHRpbWVzdGFtcCA9IF8ubm93KCk7XG4gICAgICB2YXIgY2FsbE5vdyA9IGltbWVkaWF0ZSAmJiAhdGltZW91dDtcbiAgICAgIGlmICghdGltZW91dCkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCk7XG4gICAgICB9XG4gICAgICBpZiAoY2FsbE5vdykge1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGV4ZWN1dGVkIGF0IG1vc3Qgb25lIHRpbWUsIG5vIG1hdHRlciBob3dcbiAgLy8gb2Z0ZW4geW91IGNhbGwgaXQuIFVzZWZ1bCBmb3IgbGF6eSBpbml0aWFsaXphdGlvbi5cbiAgXy5vbmNlID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciByYW4gPSBmYWxzZSwgbWVtbztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAocmFuKSByZXR1cm4gbWVtbztcbiAgICAgIHJhbiA9IHRydWU7XG4gICAgICBtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgZnVuYyA9IG51bGw7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGZ1bmN0aW9uIHBhc3NlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgc2Vjb25kLFxuICAvLyBhbGxvd2luZyB5b3UgdG8gYWRqdXN0IGFyZ3VtZW50cywgcnVuIGNvZGUgYmVmb3JlIGFuZCBhZnRlciwgYW5kXG4gIC8vIGNvbmRpdGlvbmFsbHkgZXhlY3V0ZSB0aGUgb3JpZ2luYWwgZnVuY3Rpb24uXG4gIF8ud3JhcCA9IGZ1bmN0aW9uKGZ1bmMsIHdyYXBwZXIpIHtcbiAgICByZXR1cm4gXy5wYXJ0aWFsKHdyYXBwZXIsIGZ1bmMpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGlzIHRoZSBjb21wb3NpdGlvbiBvZiBhIGxpc3Qgb2YgZnVuY3Rpb25zLCBlYWNoXG4gIC8vIGNvbnN1bWluZyB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmdW5jdGlvbiB0aGF0IGZvbGxvd3MuXG4gIF8uY29tcG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBmdW5jcyA9IGFyZ3VtZW50cztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIGZvciAodmFyIGkgPSBmdW5jcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICBhcmdzID0gW2Z1bmNzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBhcmdzWzBdO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIGFmdGVyIGJlaW5nIGNhbGxlZCBOIHRpbWVzLlxuICBfLmFmdGVyID0gZnVuY3Rpb24odGltZXMsIGZ1bmMpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoLS10aW1lcyA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIC8vIE9iamVjdCBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJldHJpZXZlIHRoZSBuYW1lcyBvZiBhbiBvYmplY3QncyBwcm9wZXJ0aWVzLlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgT2JqZWN0LmtleXNgXG4gIF8ua2V5cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gW107XG4gICAgaWYgKG5hdGl2ZUtleXMpIHJldHVybiBuYXRpdmVLZXlzKG9iaik7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSBrZXlzLnB1c2goa2V5KTtcbiAgICByZXR1cm4ga2V5cztcbiAgfTtcblxuICAvLyBSZXRyaWV2ZSB0aGUgdmFsdWVzIG9mIGFuIG9iamVjdCdzIHByb3BlcnRpZXMuXG4gIF8udmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgdmFyIHZhbHVlcyA9IG5ldyBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhbHVlc1tpXSA9IG9ialtrZXlzW2ldXTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfTtcblxuICAvLyBDb252ZXJ0IGFuIG9iamVjdCBpbnRvIGEgbGlzdCBvZiBgW2tleSwgdmFsdWVdYCBwYWlycy5cbiAgXy5wYWlycyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIHZhciBwYWlycyA9IG5ldyBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHBhaXJzW2ldID0gW2tleXNbaV0sIG9ialtrZXlzW2ldXV07XG4gICAgfVxuICAgIHJldHVybiBwYWlycztcbiAgfTtcblxuICAvLyBJbnZlcnQgdGhlIGtleXMgYW5kIHZhbHVlcyBvZiBhbiBvYmplY3QuIFRoZSB2YWx1ZXMgbXVzdCBiZSBzZXJpYWxpemFibGUuXG4gIF8uaW52ZXJ0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHJlc3VsdFtvYmpba2V5c1tpXV1dID0ga2V5c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBzb3J0ZWQgbGlzdCBvZiB0aGUgZnVuY3Rpb24gbmFtZXMgYXZhaWxhYmxlIG9uIHRoZSBvYmplY3QuXG4gIC8vIEFsaWFzZWQgYXMgYG1ldGhvZHNgXG4gIF8uZnVuY3Rpb25zID0gXy5tZXRob2RzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIG5hbWVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKF8uaXNGdW5jdGlvbihvYmpba2V5XSkpIG5hbWVzLnB1c2goa2V5KTtcbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzLnNvcnQoKTtcbiAgfTtcblxuICAvLyBFeHRlbmQgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIHByb3BlcnRpZXMgaW4gcGFzc2VkLWluIG9iamVjdChzKS5cbiAgXy5leHRlbmQgPSBmdW5jdGlvbihvYmopIHtcbiAgICBlYWNoKHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSwgZnVuY3Rpb24oc291cmNlKSB7XG4gICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgIGZvciAodmFyIHByb3AgaW4gc291cmNlKSB7XG4gICAgICAgICAgb2JqW3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgb25seSBjb250YWluaW5nIHRoZSB3aGl0ZWxpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLnBpY2sgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgY29weSA9IHt9O1xuICAgIHZhciBrZXlzID0gY29uY2F0LmFwcGx5KEFycmF5UHJvdG8sIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgZWFjaChrZXlzLCBmdW5jdGlvbihrZXkpIHtcbiAgICAgIGlmIChrZXkgaW4gb2JqKSBjb3B5W2tleV0gPSBvYmpba2V5XTtcbiAgICB9KTtcbiAgICByZXR1cm4gY29weTtcbiAgfTtcblxuICAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IHdpdGhvdXQgdGhlIGJsYWNrbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ub21pdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBjb3B5ID0ge307XG4gICAgdmFyIGtleXMgPSBjb25jYXQuYXBwbHkoQXJyYXlQcm90bywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoIV8uY29udGFpbnMoa2V5cywga2V5KSkgY29weVtrZXldID0gb2JqW2tleV07XG4gICAgfVxuICAgIHJldHVybiBjb3B5O1xuICB9O1xuXG4gIC8vIEZpbGwgaW4gYSBnaXZlbiBvYmplY3Qgd2l0aCBkZWZhdWx0IHByb3BlcnRpZXMuXG4gIF8uZGVmYXVsdHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICBlYWNoKHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSwgZnVuY3Rpb24oc291cmNlKSB7XG4gICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgIGZvciAodmFyIHByb3AgaW4gc291cmNlKSB7XG4gICAgICAgICAgaWYgKG9ialtwcm9wXSA9PT0gdm9pZCAwKSBvYmpbcHJvcF0gPSBzb3VyY2VbcHJvcF07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIChzaGFsbG93LWNsb25lZCkgZHVwbGljYXRlIG9mIGFuIG9iamVjdC5cbiAgXy5jbG9uZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gb2JqO1xuICAgIHJldHVybiBfLmlzQXJyYXkob2JqKSA/IG9iai5zbGljZSgpIDogXy5leHRlbmQoe30sIG9iaik7XG4gIH07XG5cbiAgLy8gSW52b2tlcyBpbnRlcmNlcHRvciB3aXRoIHRoZSBvYmosIGFuZCB0aGVuIHJldHVybnMgb2JqLlxuICAvLyBUaGUgcHJpbWFyeSBwdXJwb3NlIG9mIHRoaXMgbWV0aG9kIGlzIHRvIFwidGFwIGludG9cIiBhIG1ldGhvZCBjaGFpbiwgaW5cbiAgLy8gb3JkZXIgdG8gcGVyZm9ybSBvcGVyYXRpb25zIG9uIGludGVybWVkaWF0ZSByZXN1bHRzIHdpdGhpbiB0aGUgY2hhaW4uXG4gIF8udGFwID0gZnVuY3Rpb24ob2JqLCBpbnRlcmNlcHRvcikge1xuICAgIGludGVyY2VwdG9yKG9iaik7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBJbnRlcm5hbCByZWN1cnNpdmUgY29tcGFyaXNvbiBmdW5jdGlvbiBmb3IgYGlzRXF1YWxgLlxuICB2YXIgZXEgPSBmdW5jdGlvbihhLCBiLCBhU3RhY2ssIGJTdGFjaykge1xuICAgIC8vIElkZW50aWNhbCBvYmplY3RzIGFyZSBlcXVhbC4gYDAgPT09IC0wYCwgYnV0IHRoZXkgYXJlbid0IGlkZW50aWNhbC5cbiAgICAvLyBTZWUgdGhlIFtIYXJtb255IGBlZ2FsYCBwcm9wb3NhbF0oaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9aGFybW9ueTplZ2FsKS5cbiAgICBpZiAoYSA9PT0gYikgcmV0dXJuIGEgIT09IDAgfHwgMSAvIGEgPT0gMSAvIGI7XG4gICAgLy8gQSBzdHJpY3QgY29tcGFyaXNvbiBpcyBuZWNlc3NhcnkgYmVjYXVzZSBgbnVsbCA9PSB1bmRlZmluZWRgLlxuICAgIGlmIChhID09IG51bGwgfHwgYiA9PSBudWxsKSByZXR1cm4gYSA9PT0gYjtcbiAgICAvLyBVbndyYXAgYW55IHdyYXBwZWQgb2JqZWN0cy5cbiAgICBpZiAoYSBpbnN0YW5jZW9mIF8pIGEgPSBhLl93cmFwcGVkO1xuICAgIGlmIChiIGluc3RhbmNlb2YgXykgYiA9IGIuX3dyYXBwZWQ7XG4gICAgLy8gQ29tcGFyZSBgW1tDbGFzc11dYCBuYW1lcy5cbiAgICB2YXIgY2xhc3NOYW1lID0gdG9TdHJpbmcuY2FsbChhKTtcbiAgICBpZiAoY2xhc3NOYW1lICE9IHRvU3RyaW5nLmNhbGwoYikpIHJldHVybiBmYWxzZTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgLy8gU3RyaW5ncywgbnVtYmVycywgZGF0ZXMsIGFuZCBib29sZWFucyBhcmUgY29tcGFyZWQgYnkgdmFsdWUuXG4gICAgICBjYXNlICdbb2JqZWN0IFN0cmluZ10nOlxuICAgICAgICAvLyBQcmltaXRpdmVzIGFuZCB0aGVpciBjb3JyZXNwb25kaW5nIG9iamVjdCB3cmFwcGVycyBhcmUgZXF1aXZhbGVudDsgdGh1cywgYFwiNVwiYCBpc1xuICAgICAgICAvLyBlcXVpdmFsZW50IHRvIGBuZXcgU3RyaW5nKFwiNVwiKWAuXG4gICAgICAgIHJldHVybiBhID09IFN0cmluZyhiKTtcbiAgICAgIGNhc2UgJ1tvYmplY3QgTnVtYmVyXSc6XG4gICAgICAgIC8vIGBOYU5gcyBhcmUgZXF1aXZhbGVudCwgYnV0IG5vbi1yZWZsZXhpdmUuIEFuIGBlZ2FsYCBjb21wYXJpc29uIGlzIHBlcmZvcm1lZCBmb3JcbiAgICAgICAgLy8gb3RoZXIgbnVtZXJpYyB2YWx1ZXMuXG4gICAgICAgIHJldHVybiBhICE9ICthID8gYiAhPSArYiA6IChhID09IDAgPyAxIC8gYSA9PSAxIC8gYiA6IGEgPT0gK2IpO1xuICAgICAgY2FzZSAnW29iamVjdCBEYXRlXSc6XG4gICAgICBjYXNlICdbb2JqZWN0IEJvb2xlYW5dJzpcbiAgICAgICAgLy8gQ29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1lcmljIHByaW1pdGl2ZSB2YWx1ZXMuIERhdGVzIGFyZSBjb21wYXJlZCBieSB0aGVpclxuICAgICAgICAvLyBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnMuIE5vdGUgdGhhdCBpbnZhbGlkIGRhdGVzIHdpdGggbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zXG4gICAgICAgIC8vIG9mIGBOYU5gIGFyZSBub3QgZXF1aXZhbGVudC5cbiAgICAgICAgcmV0dXJuICthID09ICtiO1xuICAgICAgLy8gUmVnRXhwcyBhcmUgY29tcGFyZWQgYnkgdGhlaXIgc291cmNlIHBhdHRlcm5zIGFuZCBmbGFncy5cbiAgICAgIGNhc2UgJ1tvYmplY3QgUmVnRXhwXSc6XG4gICAgICAgIHJldHVybiBhLnNvdXJjZSA9PSBiLnNvdXJjZSAmJlxuICAgICAgICAgICAgICAgYS5nbG9iYWwgPT0gYi5nbG9iYWwgJiZcbiAgICAgICAgICAgICAgIGEubXVsdGlsaW5lID09IGIubXVsdGlsaW5lICYmXG4gICAgICAgICAgICAgICBhLmlnbm9yZUNhc2UgPT0gYi5pZ25vcmVDYXNlO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGEgIT0gJ29iamVjdCcgfHwgdHlwZW9mIGIgIT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcbiAgICAvLyBBc3N1bWUgZXF1YWxpdHkgZm9yIGN5Y2xpYyBzdHJ1Y3R1cmVzLiBUaGUgYWxnb3JpdGhtIGZvciBkZXRlY3RpbmcgY3ljbGljXG4gICAgLy8gc3RydWN0dXJlcyBpcyBhZGFwdGVkIGZyb20gRVMgNS4xIHNlY3Rpb24gMTUuMTIuMywgYWJzdHJhY3Qgb3BlcmF0aW9uIGBKT2AuXG4gICAgdmFyIGxlbmd0aCA9IGFTdGFjay5sZW5ndGg7XG4gICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAvLyBMaW5lYXIgc2VhcmNoLiBQZXJmb3JtYW5jZSBpcyBpbnZlcnNlbHkgcHJvcG9ydGlvbmFsIHRvIHRoZSBudW1iZXIgb2ZcbiAgICAgIC8vIHVuaXF1ZSBuZXN0ZWQgc3RydWN0dXJlcy5cbiAgICAgIGlmIChhU3RhY2tbbGVuZ3RoXSA9PSBhKSByZXR1cm4gYlN0YWNrW2xlbmd0aF0gPT0gYjtcbiAgICB9XG4gICAgLy8gT2JqZWN0cyB3aXRoIGRpZmZlcmVudCBjb25zdHJ1Y3RvcnMgYXJlIG5vdCBlcXVpdmFsZW50LCBidXQgYE9iamVjdGBzXG4gICAgLy8gZnJvbSBkaWZmZXJlbnQgZnJhbWVzIGFyZS5cbiAgICB2YXIgYUN0b3IgPSBhLmNvbnN0cnVjdG9yLCBiQ3RvciA9IGIuY29uc3RydWN0b3I7XG4gICAgaWYgKGFDdG9yICE9PSBiQ3RvciAmJiAhKF8uaXNGdW5jdGlvbihhQ3RvcikgJiYgKGFDdG9yIGluc3RhbmNlb2YgYUN0b3IpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uaXNGdW5jdGlvbihiQ3RvcikgJiYgKGJDdG9yIGluc3RhbmNlb2YgYkN0b3IpKVxuICAgICAgICAgICAgICAgICAgICAgICAgJiYgKCdjb25zdHJ1Y3RvcicgaW4gYSAmJiAnY29uc3RydWN0b3InIGluIGIpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIC8vIEFkZCB0aGUgZmlyc3Qgb2JqZWN0IHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucHVzaChhKTtcbiAgICBiU3RhY2sucHVzaChiKTtcbiAgICB2YXIgc2l6ZSA9IDAsIHJlc3VsdCA9IHRydWU7XG4gICAgLy8gUmVjdXJzaXZlbHkgY29tcGFyZSBvYmplY3RzIGFuZCBhcnJheXMuXG4gICAgaWYgKGNsYXNzTmFtZSA9PSAnW29iamVjdCBBcnJheV0nKSB7XG4gICAgICAvLyBDb21wYXJlIGFycmF5IGxlbmd0aHMgdG8gZGV0ZXJtaW5lIGlmIGEgZGVlcCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeS5cbiAgICAgIHNpemUgPSBhLmxlbmd0aDtcbiAgICAgIHJlc3VsdCA9IHNpemUgPT0gYi5sZW5ndGg7XG4gICAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIC8vIERlZXAgY29tcGFyZSB0aGUgY29udGVudHMsIGlnbm9yaW5nIG5vbi1udW1lcmljIHByb3BlcnRpZXMuXG4gICAgICAgIHdoaWxlIChzaXplLS0pIHtcbiAgICAgICAgICBpZiAoIShyZXN1bHQgPSBlcShhW3NpemVdLCBiW3NpemVdLCBhU3RhY2ssIGJTdGFjaykpKSBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEZWVwIGNvbXBhcmUgb2JqZWN0cy5cbiAgICAgIGZvciAodmFyIGtleSBpbiBhKSB7XG4gICAgICAgIGlmIChfLmhhcyhhLCBrZXkpKSB7XG4gICAgICAgICAgLy8gQ291bnQgdGhlIGV4cGVjdGVkIG51bWJlciBvZiBwcm9wZXJ0aWVzLlxuICAgICAgICAgIHNpemUrKztcbiAgICAgICAgICAvLyBEZWVwIGNvbXBhcmUgZWFjaCBtZW1iZXIuXG4gICAgICAgICAgaWYgKCEocmVzdWx0ID0gXy5oYXMoYiwga2V5KSAmJiBlcShhW2tleV0sIGJba2V5XSwgYVN0YWNrLCBiU3RhY2spKSkgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIEVuc3VyZSB0aGF0IGJvdGggb2JqZWN0cyBjb250YWluIHRoZSBzYW1lIG51bWJlciBvZiBwcm9wZXJ0aWVzLlxuICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICBmb3IgKGtleSBpbiBiKSB7XG4gICAgICAgICAgaWYgKF8uaGFzKGIsIGtleSkgJiYgIShzaXplLS0pKSBicmVhaztcbiAgICAgICAgfVxuICAgICAgICByZXN1bHQgPSAhc2l6ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gUmVtb3ZlIHRoZSBmaXJzdCBvYmplY3QgZnJvbSB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnBvcCgpO1xuICAgIGJTdGFjay5wb3AoKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFBlcmZvcm0gYSBkZWVwIGNvbXBhcmlzb24gdG8gY2hlY2sgaWYgdHdvIG9iamVjdHMgYXJlIGVxdWFsLlxuICBfLmlzRXF1YWwgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGVxKGEsIGIsIFtdLCBbXSk7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiBhcnJheSwgc3RyaW5nLCBvciBvYmplY3QgZW1wdHk/XG4gIC8vIEFuIFwiZW1wdHlcIiBvYmplY3QgaGFzIG5vIGVudW1lcmFibGUgb3duLXByb3BlcnRpZXMuXG4gIF8uaXNFbXB0eSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHRydWU7XG4gICAgaWYgKF8uaXNBcnJheShvYmopIHx8IF8uaXNTdHJpbmcob2JqKSkgcmV0dXJuIG9iai5sZW5ndGggPT09IDA7XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBET00gZWxlbWVudD9cbiAgXy5pc0VsZW1lbnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gISEob2JqICYmIG9iai5ub2RlVHlwZSA9PT0gMSk7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhbiBhcnJheT9cbiAgLy8gRGVsZWdhdGVzIHRvIEVDTUE1J3MgbmF0aXZlIEFycmF5LmlzQXJyYXlcbiAgXy5pc0FycmF5ID0gbmF0aXZlSXNBcnJheSB8fCBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSBhbiBvYmplY3Q/XG4gIF8uaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBPYmplY3Qob2JqKTtcbiAgfTtcblxuICAvLyBBZGQgc29tZSBpc1R5cGUgbWV0aG9kczogaXNBcmd1bWVudHMsIGlzRnVuY3Rpb24sIGlzU3RyaW5nLCBpc051bWJlciwgaXNEYXRlLCBpc1JlZ0V4cC5cbiAgZWFjaChbJ0FyZ3VtZW50cycsICdGdW5jdGlvbicsICdTdHJpbmcnLCAnTnVtYmVyJywgJ0RhdGUnLCAnUmVnRXhwJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBfWydpcycgKyBuYW1lXSA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PSAnW29iamVjdCAnICsgbmFtZSArICddJztcbiAgICB9O1xuICB9KTtcblxuICAvLyBEZWZpbmUgYSBmYWxsYmFjayB2ZXJzaW9uIG9mIHRoZSBtZXRob2QgaW4gYnJvd3NlcnMgKGFoZW0sIElFKSwgd2hlcmVcbiAgLy8gdGhlcmUgaXNuJ3QgYW55IGluc3BlY3RhYmxlIFwiQXJndW1lbnRzXCIgdHlwZS5cbiAgaWYgKCFfLmlzQXJndW1lbnRzKGFyZ3VtZW50cykpIHtcbiAgICBfLmlzQXJndW1lbnRzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gISEob2JqICYmIF8uaGFzKG9iaiwgJ2NhbGxlZScpKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gT3B0aW1pemUgYGlzRnVuY3Rpb25gIGlmIGFwcHJvcHJpYXRlLlxuICBpZiAodHlwZW9mICgvLi8pICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgXy5pc0Z1bmN0aW9uID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PT0gJ2Z1bmN0aW9uJztcbiAgICB9O1xuICB9XG5cbiAgLy8gSXMgYSBnaXZlbiBvYmplY3QgYSBmaW5pdGUgbnVtYmVyP1xuICBfLmlzRmluaXRlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIGlzRmluaXRlKG9iaikgJiYgIWlzTmFOKHBhcnNlRmxvYXQob2JqKSk7XG4gIH07XG5cbiAgLy8gSXMgdGhlIGdpdmVuIHZhbHVlIGBOYU5gPyAoTmFOIGlzIHRoZSBvbmx5IG51bWJlciB3aGljaCBkb2VzIG5vdCBlcXVhbCBpdHNlbGYpLlxuICBfLmlzTmFOID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8uaXNOdW1iZXIob2JqKSAmJiBvYmogIT0gK29iajtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgYm9vbGVhbj9cbiAgXy5pc0Jvb2xlYW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB0cnVlIHx8IG9iaiA9PT0gZmFsc2UgfHwgdG9TdHJpbmcuY2FsbChvYmopID09ICdbb2JqZWN0IEJvb2xlYW5dJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGVxdWFsIHRvIG51bGw/XG4gIF8uaXNOdWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gbnVsbDtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIHVuZGVmaW5lZD9cbiAgXy5pc1VuZGVmaW5lZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHZvaWQgMDtcbiAgfTtcblxuICAvLyBTaG9ydGN1dCBmdW5jdGlvbiBmb3IgY2hlY2tpbmcgaWYgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHByb3BlcnR5IGRpcmVjdGx5XG4gIC8vIG9uIGl0c2VsZiAoaW4gb3RoZXIgd29yZHMsIG5vdCBvbiBhIHByb3RvdHlwZSkuXG4gIF8uaGFzID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSk7XG4gIH07XG5cbiAgLy8gVXRpbGl0eSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBSdW4gVW5kZXJzY29yZS5qcyBpbiAqbm9Db25mbGljdCogbW9kZSwgcmV0dXJuaW5nIHRoZSBgX2AgdmFyaWFibGUgdG8gaXRzXG4gIC8vIHByZXZpb3VzIG93bmVyLiBSZXR1cm5zIGEgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5ub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgcm9vdC5fID0gcHJldmlvdXNVbmRlcnNjb3JlO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xuXG4gIC8vIEtlZXAgdGhlIGlkZW50aXR5IGZ1bmN0aW9uIGFyb3VuZCBmb3IgZGVmYXVsdCBpdGVyYXRvcnMuXG4gIF8uaWRlbnRpdHkgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfTtcblxuICBfLmNvbnN0YW50ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH07XG4gIH07XG5cbiAgXy5wcm9wZXJ0eSA9IGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBvYmpba2V5XTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBwcmVkaWNhdGUgZm9yIGNoZWNraW5nIHdoZXRoZXIgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHNldCBvZiBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5tYXRjaGVzID0gZnVuY3Rpb24oYXR0cnMpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICBpZiAob2JqID09PSBhdHRycykgcmV0dXJuIHRydWU7IC8vYXZvaWQgY29tcGFyaW5nIGFuIG9iamVjdCB0byBpdHNlbGYuXG4gICAgICBmb3IgKHZhciBrZXkgaW4gYXR0cnMpIHtcbiAgICAgICAgaWYgKGF0dHJzW2tleV0gIT09IG9ialtrZXldKVxuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfTtcblxuICAvLyBSdW4gYSBmdW5jdGlvbiAqKm4qKiB0aW1lcy5cbiAgXy50aW1lcyA9IGZ1bmN0aW9uKG4sIGl0ZXJhdG9yLCBjb250ZXh0KSB7XG4gICAgdmFyIGFjY3VtID0gQXJyYXkoTWF0aC5tYXgoMCwgbikpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSBhY2N1bVtpXSA9IGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgaSk7XG4gICAgcmV0dXJuIGFjY3VtO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHJhbmRvbSBpbnRlZ2VyIGJldHdlZW4gbWluIGFuZCBtYXggKGluY2x1c2l2ZSkuXG4gIF8ucmFuZG9tID0gZnVuY3Rpb24obWluLCBtYXgpIHtcbiAgICBpZiAobWF4ID09IG51bGwpIHtcbiAgICAgIG1heCA9IG1pbjtcbiAgICAgIG1pbiA9IDA7XG4gICAgfVxuICAgIHJldHVybiBtaW4gKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluICsgMSkpO1xuICB9O1xuXG4gIC8vIEEgKHBvc3NpYmx5IGZhc3Rlcikgd2F5IHRvIGdldCB0aGUgY3VycmVudCB0aW1lc3RhbXAgYXMgYW4gaW50ZWdlci5cbiAgXy5ub3cgPSBEYXRlLm5vdyB8fCBmdW5jdGlvbigpIHsgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpOyB9O1xuXG4gIC8vIExpc3Qgb2YgSFRNTCBlbnRpdGllcyBmb3IgZXNjYXBpbmcuXG4gIHZhciBlbnRpdHlNYXAgPSB7XG4gICAgZXNjYXBlOiB7XG4gICAgICAnJic6ICcmYW1wOycsXG4gICAgICAnPCc6ICcmbHQ7JyxcbiAgICAgICc+JzogJyZndDsnLFxuICAgICAgJ1wiJzogJyZxdW90OycsXG4gICAgICBcIidcIjogJyYjeDI3OydcbiAgICB9XG4gIH07XG4gIGVudGl0eU1hcC51bmVzY2FwZSA9IF8uaW52ZXJ0KGVudGl0eU1hcC5lc2NhcGUpO1xuXG4gIC8vIFJlZ2V4ZXMgY29udGFpbmluZyB0aGUga2V5cyBhbmQgdmFsdWVzIGxpc3RlZCBpbW1lZGlhdGVseSBhYm92ZS5cbiAgdmFyIGVudGl0eVJlZ2V4ZXMgPSB7XG4gICAgZXNjYXBlOiAgIG5ldyBSZWdFeHAoJ1snICsgXy5rZXlzKGVudGl0eU1hcC5lc2NhcGUpLmpvaW4oJycpICsgJ10nLCAnZycpLFxuICAgIHVuZXNjYXBlOiBuZXcgUmVnRXhwKCcoJyArIF8ua2V5cyhlbnRpdHlNYXAudW5lc2NhcGUpLmpvaW4oJ3wnKSArICcpJywgJ2cnKVxuICB9O1xuXG4gIC8vIEZ1bmN0aW9ucyBmb3IgZXNjYXBpbmcgYW5kIHVuZXNjYXBpbmcgc3RyaW5ncyB0by9mcm9tIEhUTUwgaW50ZXJwb2xhdGlvbi5cbiAgXy5lYWNoKFsnZXNjYXBlJywgJ3VuZXNjYXBlJ10sIGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgIF9bbWV0aG9kXSA9IGZ1bmN0aW9uKHN0cmluZykge1xuICAgICAgaWYgKHN0cmluZyA9PSBudWxsKSByZXR1cm4gJyc7XG4gICAgICByZXR1cm4gKCcnICsgc3RyaW5nKS5yZXBsYWNlKGVudGl0eVJlZ2V4ZXNbbWV0aG9kXSwgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgICAgcmV0dXJuIGVudGl0eU1hcFttZXRob2RdW21hdGNoXTtcbiAgICAgIH0pO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIElmIHRoZSB2YWx1ZSBvZiB0aGUgbmFtZWQgYHByb3BlcnR5YCBpcyBhIGZ1bmN0aW9uIHRoZW4gaW52b2tlIGl0IHdpdGggdGhlXG4gIC8vIGBvYmplY3RgIGFzIGNvbnRleHQ7IG90aGVyd2lzZSwgcmV0dXJuIGl0LlxuICBfLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHkpIHtcbiAgICBpZiAob2JqZWN0ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgdmFyIHZhbHVlID0gb2JqZWN0W3Byb3BlcnR5XTtcbiAgICByZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmNhbGwob2JqZWN0KSA6IHZhbHVlO1xuICB9O1xuXG4gIC8vIEFkZCB5b3VyIG93biBjdXN0b20gZnVuY3Rpb25zIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5taXhpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGVhY2goXy5mdW5jdGlvbnMob2JqKSwgZnVuY3Rpb24obmFtZSkge1xuICAgICAgdmFyIGZ1bmMgPSBfW25hbWVdID0gb2JqW25hbWVdO1xuICAgICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBbdGhpcy5fd3JhcHBlZF07XG4gICAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdC5jYWxsKHRoaXMsIGZ1bmMuYXBwbHkoXywgYXJncykpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZSBhIHVuaXF1ZSBpbnRlZ2VyIGlkICh1bmlxdWUgd2l0aGluIHRoZSBlbnRpcmUgY2xpZW50IHNlc3Npb24pLlxuICAvLyBVc2VmdWwgZm9yIHRlbXBvcmFyeSBET00gaWRzLlxuICB2YXIgaWRDb3VudGVyID0gMDtcbiAgXy51bmlxdWVJZCA9IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgIHZhciBpZCA9ICsraWRDb3VudGVyICsgJyc7XG4gICAgcmV0dXJuIHByZWZpeCA/IHByZWZpeCArIGlkIDogaWQ7XG4gIH07XG5cbiAgLy8gQnkgZGVmYXVsdCwgVW5kZXJzY29yZSB1c2VzIEVSQi1zdHlsZSB0ZW1wbGF0ZSBkZWxpbWl0ZXJzLCBjaGFuZ2UgdGhlXG4gIC8vIGZvbGxvd2luZyB0ZW1wbGF0ZSBzZXR0aW5ncyB0byB1c2UgYWx0ZXJuYXRpdmUgZGVsaW1pdGVycy5cbiAgXy50ZW1wbGF0ZVNldHRpbmdzID0ge1xuICAgIGV2YWx1YXRlICAgIDogLzwlKFtcXHNcXFNdKz8pJT4vZyxcbiAgICBpbnRlcnBvbGF0ZSA6IC88JT0oW1xcc1xcU10rPyklPi9nLFxuICAgIGVzY2FwZSAgICAgIDogLzwlLShbXFxzXFxTXSs/KSU+L2dcbiAgfTtcblxuICAvLyBXaGVuIGN1c3RvbWl6aW5nIGB0ZW1wbGF0ZVNldHRpbmdzYCwgaWYgeW91IGRvbid0IHdhbnQgdG8gZGVmaW5lIGFuXG4gIC8vIGludGVycG9sYXRpb24sIGV2YWx1YXRpb24gb3IgZXNjYXBpbmcgcmVnZXgsIHdlIG5lZWQgb25lIHRoYXQgaXNcbiAgLy8gZ3VhcmFudGVlZCBub3QgdG8gbWF0Y2guXG4gIHZhciBub01hdGNoID0gLyguKV4vO1xuXG4gIC8vIENlcnRhaW4gY2hhcmFjdGVycyBuZWVkIHRvIGJlIGVzY2FwZWQgc28gdGhhdCB0aGV5IGNhbiBiZSBwdXQgaW50byBhXG4gIC8vIHN0cmluZyBsaXRlcmFsLlxuICB2YXIgZXNjYXBlcyA9IHtcbiAgICBcIidcIjogICAgICBcIidcIixcbiAgICAnXFxcXCc6ICAgICAnXFxcXCcsXG4gICAgJ1xccic6ICAgICAncicsXG4gICAgJ1xcbic6ICAgICAnbicsXG4gICAgJ1xcdCc6ICAgICAndCcsXG4gICAgJ1xcdTIwMjgnOiAndTIwMjgnLFxuICAgICdcXHUyMDI5JzogJ3UyMDI5J1xuICB9O1xuXG4gIHZhciBlc2NhcGVyID0gL1xcXFx8J3xcXHJ8XFxufFxcdHxcXHUyMDI4fFxcdTIwMjkvZztcblxuICAvLyBKYXZhU2NyaXB0IG1pY3JvLXRlbXBsYXRpbmcsIHNpbWlsYXIgdG8gSm9obiBSZXNpZydzIGltcGxlbWVudGF0aW9uLlxuICAvLyBVbmRlcnNjb3JlIHRlbXBsYXRpbmcgaGFuZGxlcyBhcmJpdHJhcnkgZGVsaW1pdGVycywgcHJlc2VydmVzIHdoaXRlc3BhY2UsXG4gIC8vIGFuZCBjb3JyZWN0bHkgZXNjYXBlcyBxdW90ZXMgd2l0aGluIGludGVycG9sYXRlZCBjb2RlLlxuICBfLnRlbXBsYXRlID0gZnVuY3Rpb24odGV4dCwgZGF0YSwgc2V0dGluZ3MpIHtcbiAgICB2YXIgcmVuZGVyO1xuICAgIHNldHRpbmdzID0gXy5kZWZhdWx0cyh7fSwgc2V0dGluZ3MsIF8udGVtcGxhdGVTZXR0aW5ncyk7XG5cbiAgICAvLyBDb21iaW5lIGRlbGltaXRlcnMgaW50byBvbmUgcmVndWxhciBleHByZXNzaW9uIHZpYSBhbHRlcm5hdGlvbi5cbiAgICB2YXIgbWF0Y2hlciA9IG5ldyBSZWdFeHAoW1xuICAgICAgKHNldHRpbmdzLmVzY2FwZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuaW50ZXJwb2xhdGUgfHwgbm9NYXRjaCkuc291cmNlLFxuICAgICAgKHNldHRpbmdzLmV2YWx1YXRlIHx8IG5vTWF0Y2gpLnNvdXJjZVxuICAgIF0uam9pbignfCcpICsgJ3wkJywgJ2cnKTtcblxuICAgIC8vIENvbXBpbGUgdGhlIHRlbXBsYXRlIHNvdXJjZSwgZXNjYXBpbmcgc3RyaW5nIGxpdGVyYWxzIGFwcHJvcHJpYXRlbHkuXG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICB2YXIgc291cmNlID0gXCJfX3ArPSdcIjtcbiAgICB0ZXh0LnJlcGxhY2UobWF0Y2hlciwgZnVuY3Rpb24obWF0Y2gsIGVzY2FwZSwgaW50ZXJwb2xhdGUsIGV2YWx1YXRlLCBvZmZzZXQpIHtcbiAgICAgIHNvdXJjZSArPSB0ZXh0LnNsaWNlKGluZGV4LCBvZmZzZXQpXG4gICAgICAgIC5yZXBsYWNlKGVzY2FwZXIsIGZ1bmN0aW9uKG1hdGNoKSB7IHJldHVybiAnXFxcXCcgKyBlc2NhcGVzW21hdGNoXTsgfSk7XG5cbiAgICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBlc2NhcGUgKyBcIikpPT1udWxsPycnOl8uZXNjYXBlKF9fdCkpK1xcbidcIjtcbiAgICAgIH1cbiAgICAgIGlmIChpbnRlcnBvbGF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGludGVycG9sYXRlICsgXCIpKT09bnVsbD8nJzpfX3QpK1xcbidcIjtcbiAgICAgIH1cbiAgICAgIGlmIChldmFsdWF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInO1xcblwiICsgZXZhbHVhdGUgKyBcIlxcbl9fcCs9J1wiO1xuICAgICAgfVxuICAgICAgaW5kZXggPSBvZmZzZXQgKyBtYXRjaC5sZW5ndGg7XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG4gICAgc291cmNlICs9IFwiJztcXG5cIjtcblxuICAgIC8vIElmIGEgdmFyaWFibGUgaXMgbm90IHNwZWNpZmllZCwgcGxhY2UgZGF0YSB2YWx1ZXMgaW4gbG9jYWwgc2NvcGUuXG4gICAgaWYgKCFzZXR0aW5ncy52YXJpYWJsZSkgc291cmNlID0gJ3dpdGgob2JqfHx7fSl7XFxuJyArIHNvdXJjZSArICd9XFxuJztcblxuICAgIHNvdXJjZSA9IFwidmFyIF9fdCxfX3A9JycsX19qPUFycmF5LnByb3RvdHlwZS5qb2luLFwiICtcbiAgICAgIFwicHJpbnQ9ZnVuY3Rpb24oKXtfX3ArPV9fai5jYWxsKGFyZ3VtZW50cywnJyk7fTtcXG5cIiArXG4gICAgICBzb3VyY2UgKyBcInJldHVybiBfX3A7XFxuXCI7XG5cbiAgICB0cnkge1xuICAgICAgcmVuZGVyID0gbmV3IEZ1bmN0aW9uKHNldHRpbmdzLnZhcmlhYmxlIHx8ICdvYmonLCAnXycsIHNvdXJjZSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgZS5zb3VyY2UgPSBzb3VyY2U7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cblxuICAgIGlmIChkYXRhKSByZXR1cm4gcmVuZGVyKGRhdGEsIF8pO1xuICAgIHZhciB0ZW1wbGF0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHJldHVybiByZW5kZXIuY2FsbCh0aGlzLCBkYXRhLCBfKTtcbiAgICB9O1xuXG4gICAgLy8gUHJvdmlkZSB0aGUgY29tcGlsZWQgZnVuY3Rpb24gc291cmNlIGFzIGEgY29udmVuaWVuY2UgZm9yIHByZWNvbXBpbGF0aW9uLlxuICAgIHRlbXBsYXRlLnNvdXJjZSA9ICdmdW5jdGlvbignICsgKHNldHRpbmdzLnZhcmlhYmxlIHx8ICdvYmonKSArICcpe1xcbicgKyBzb3VyY2UgKyAnfSc7XG5cbiAgICByZXR1cm4gdGVtcGxhdGU7XG4gIH07XG5cbiAgLy8gQWRkIGEgXCJjaGFpblwiIGZ1bmN0aW9uLCB3aGljaCB3aWxsIGRlbGVnYXRlIHRvIHRoZSB3cmFwcGVyLlxuICBfLmNoYWluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8ob2JqKS5jaGFpbigpO1xuICB9O1xuXG4gIC8vIE9PUFxuICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgLy8gSWYgVW5kZXJzY29yZSBpcyBjYWxsZWQgYXMgYSBmdW5jdGlvbiwgaXQgcmV0dXJucyBhIHdyYXBwZWQgb2JqZWN0IHRoYXRcbiAgLy8gY2FuIGJlIHVzZWQgT08tc3R5bGUuIFRoaXMgd3JhcHBlciBob2xkcyBhbHRlcmVkIHZlcnNpb25zIG9mIGFsbCB0aGVcbiAgLy8gdW5kZXJzY29yZSBmdW5jdGlvbnMuIFdyYXBwZWQgb2JqZWN0cyBtYXkgYmUgY2hhaW5lZC5cblxuICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY29udGludWUgY2hhaW5pbmcgaW50ZXJtZWRpYXRlIHJlc3VsdHMuXG4gIHZhciByZXN1bHQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gdGhpcy5fY2hhaW4gPyBfKG9iaikuY2hhaW4oKSA6IG9iajtcbiAgfTtcblxuICAvLyBBZGQgYWxsIG9mIHRoZSBVbmRlcnNjb3JlIGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlciBvYmplY3QuXG4gIF8ubWl4aW4oXyk7XG5cbiAgLy8gQWRkIGFsbCBtdXRhdG9yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgZWFjaChbJ3BvcCcsICdwdXNoJywgJ3JldmVyc2UnLCAnc2hpZnQnLCAnc29ydCcsICdzcGxpY2UnLCAndW5zaGlmdCddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIG1ldGhvZCA9IEFycmF5UHJvdG9bbmFtZV07XG4gICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBvYmogPSB0aGlzLl93cmFwcGVkO1xuICAgICAgbWV0aG9kLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcbiAgICAgIGlmICgobmFtZSA9PSAnc2hpZnQnIHx8IG5hbWUgPT0gJ3NwbGljZScpICYmIG9iai5sZW5ndGggPT09IDApIGRlbGV0ZSBvYmpbMF07XG4gICAgICByZXR1cm4gcmVzdWx0LmNhbGwodGhpcywgb2JqKTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBBZGQgYWxsIGFjY2Vzc29yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgZWFjaChbJ2NvbmNhdCcsICdqb2luJywgJ3NsaWNlJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHJlc3VsdC5jYWxsKHRoaXMsIG1ldGhvZC5hcHBseSh0aGlzLl93cmFwcGVkLCBhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9KTtcblxuICBfLmV4dGVuZChfLnByb3RvdHlwZSwge1xuXG4gICAgLy8gU3RhcnQgY2hhaW5pbmcgYSB3cmFwcGVkIFVuZGVyc2NvcmUgb2JqZWN0LlxuICAgIGNoYWluOiBmdW5jdGlvbigpIHtcbiAgICAgIHRoaXMuX2NoYWluID0gdHJ1ZTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvLyBFeHRyYWN0cyB0aGUgcmVzdWx0IGZyb20gYSB3cmFwcGVkIGFuZCBjaGFpbmVkIG9iamVjdC5cbiAgICB2YWx1ZTogZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdGhpcy5fd3JhcHBlZDtcbiAgICB9XG5cbiAgfSk7XG5cbiAgLy8gQU1EIHJlZ2lzdHJhdGlvbiBoYXBwZW5zIGF0IHRoZSBlbmQgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBBTUQgbG9hZGVyc1xuICAvLyB0aGF0IG1heSBub3QgZW5mb3JjZSBuZXh0LXR1cm4gc2VtYW50aWNzIG9uIG1vZHVsZXMuIEV2ZW4gdGhvdWdoIGdlbmVyYWxcbiAgLy8gcHJhY3RpY2UgZm9yIEFNRCByZWdpc3RyYXRpb24gaXMgdG8gYmUgYW5vbnltb3VzLCB1bmRlcnNjb3JlIHJlZ2lzdGVyc1xuICAvLyBhcyBhIG5hbWVkIG1vZHVsZSBiZWNhdXNlLCBsaWtlIGpRdWVyeSwgaXQgaXMgYSBiYXNlIGxpYnJhcnkgdGhhdCBpc1xuICAvLyBwb3B1bGFyIGVub3VnaCB0byBiZSBidW5kbGVkIGluIGEgdGhpcmQgcGFydHkgbGliLCBidXQgbm90IGJlIHBhcnQgb2ZcbiAgLy8gYW4gQU1EIGxvYWQgcmVxdWVzdC4gVGhvc2UgY2FzZXMgY291bGQgZ2VuZXJhdGUgYW4gZXJyb3Igd2hlbiBhblxuICAvLyBhbm9ueW1vdXMgZGVmaW5lKCkgaXMgY2FsbGVkIG91dHNpZGUgb2YgYSBsb2FkZXIgcmVxdWVzdC5cbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZSgndW5kZXJzY29yZScsIFtdLCBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBfO1xuICAgIH0pO1xuICB9XG59KS5jYWxsKHRoaXMpO1xuIiwidmFyIGFzc2VydCA9IHJlcXVpcmUoXCJhc3NlcnRcIik7XG5cbmRlc2NyaWJlKFwiQmFzaWMgQ2xhc3MgUHJvcGVydGllc1wiLCBmdW5jdGlvbigpIHtcblxuXHRpdChcImV4dGVuZCgpIHNob3VsZCBjcmVhdGUgYSB2YWxpZCBzdWJjbGFzc1wiLCBmdW5jdGlvbigpIHtcblx0XHR2YXIgU3ViVGVtcGxlID0gVGVtcGxlLmV4dGVuZCh7XG5cdFx0XHRmb286IGZ1bmN0aW9uKCl7fVxuXHRcdH0pO1xuXG5cdFx0dmFyIHRwbCA9IG5ldyBTdWJUZW1wbGUoKTtcblxuXHRcdGFzc2VydC5vayh0cGwgaW5zdGFuY2VvZiBUZW1wbGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgdHBsLmZvbywgXCJmdW5jdGlvblwiKTtcblx0fSk7XG5cbn0pOyIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcblxuZ2xvYmFsLlRlbXBsZSA9IHJlcXVpcmUoXCIuLi9saWIvdGVtcGxlXCIpO1xuXG5tb2NoYS5zZXR1cCgnYmRkJyk7XG5cbmRlc2NyaWJlKFwiVGVtcGxlXCIsIGZ1bmN0aW9uKCkge1xuXHRyZXF1aXJlKFwiLi9jbGFzc1wiKTtcblx0cmVxdWlyZShcIi4vcGFyc2VcIik7XG59KTtcblxuZGVzY3JpYmUoXCJuZXcgVGVtcGxlKClcIiwgZnVuY3Rpb24oKSB7XG5cdHJlcXVpcmUoXCIuL3Njb3BlXCIpO1xuXHRyZXF1aXJlKFwiLi9yZWFjdGl2ZVwiKTtcblx0cmVxdWlyZShcIi4vcmVuZGVyXCIpO1xufSk7XG5cbm1vY2hhLnJ1bigpO1xufSkuY2FsbCh0aGlzLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCJtb2R1bGUuZXhwb3J0cz17XG5cdFwiYW1wZXJzYW5kX2VzY2FwZVwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBtZXNzYWdlOiBcXFwiU29tZSA8Y29kZT5cXFwiXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3smbWVzc2FnZX19XCIsXG5cdFx0XCJ0eHRcIjogXCJTb21lIDxjb2RlPjwvY29kZT5cIlxuXHR9LFxuXHRcImFycmF5X29mX3N0cmluZ3NcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgYXJyYXlfb2Zfc3RyaW5nczogWydoZWxsbycsICd3b3JsZCddXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjYXJyYXlfb2Zfc3RyaW5nc319e3sufX0ge3svYXJyYXlfb2Zfc3RyaW5nc319XCIsXG5cdFx0XCJ0eHRcIjogXCJoZWxsbyB3b3JsZFwiXG5cdH0sXG5cdFwiYnVnXzExX2VhdGluZ193aGl0ZXNwYWNlXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIHRhZzogXFxcInlvXFxcIlxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7dGFnfX0gZm9vXCIsXG5cdFx0XCJ0eHRcIjogXCJ5byBmb29cIlxuXHR9LFxuXHRcImNoYW5naW5nX2RlbGltaXRlcnNcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgXFxcImZvb1xcXCI6IFxcXCJmb29vb29vb29vb29vb29cXFwiLFxcbiAgXFxcImJhclxcXCI6IFxcXCI8Yj5iYXIhPC9iPlxcXCJcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7ez08JSAlPj19fTwlIGZvbyAlPiB7e2Zvb319IDwle2Jhcn0lPiB7e3tiYXJ9fX1cIixcblx0XHRcInR4dFwiOiBcImZvb29vb29vb29vb29vbyB7e2Zvb319IDxiPmJhciE8L2I+IHt7e2Jhcn19fVwiXG5cdH0sXG5cdFwiY2hlY2tfZmFsc3lcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgbnVtYmVyOiBmdW5jdGlvbih0ZXh0LCByZW5kZXIpIHtcXG4gICAgcmV0dXJuIGZ1bmN0aW9uKHRleHQsIHJlbmRlcikge1xcbiAgICAgIHJldHVybiArcmVuZGVyKHRleHQpO1xcbiAgICB9XFxuICB9XFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwiPHA+e3sjbnVtYmVyfX0we3svbnVtYmVyfX08L3A+XCIsXG5cdFx0XCJ0eHRcIjogXCI8cD4wPC9wPlwiXG5cdH0sXG5cdFwiY29tbWVudHNcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgdGl0bGU6IGZ1bmN0aW9uICgpIHtcXG4gICAgcmV0dXJuIFxcXCJBIENvbWVkeSBvZiBFcnJvcnNcXFwiO1xcbiAgfVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcIjxoMT57e3RpdGxlfX17eyEganVzdCBzb21ldGhpbmcgaW50ZXJlc3RpbmcuLi4gb3Igbm90Li4uIH19PC9oMT5cIixcblx0XHRcInR4dFwiOiBcIjxoMT5BIENvbWVkeSBvZiBFcnJvcnM8L2gxPlwiXG5cdH0sXG5cdFwiY29tcGxleFwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBoZWFkZXI6IGZ1bmN0aW9uICgpIHtcXG4gICAgcmV0dXJuIFxcXCJDb2xvcnNcXFwiO1xcbiAgfSxcXG4gIGl0ZW06IFtcXG4gICAgICB7bmFtZTogXFxcInJlZFxcXCIsIGN1cnJlbnQ6IHRydWUsIHVybDogXFxcIiNSZWRcXFwifSxcXG4gICAgICB7bmFtZTogXFxcImdyZWVuXFxcIiwgY3VycmVudDogZmFsc2UsIHVybDogXFxcIiNHcmVlblxcXCJ9LFxcbiAgICAgIHtuYW1lOiBcXFwiYmx1ZVxcXCIsIGN1cnJlbnQ6IGZhbHNlLCB1cmw6IFxcXCIjQmx1ZVxcXCJ9XFxuICBdLFxcbiAgbGluazogZnVuY3Rpb24gKCkge1xcbiAgICByZXR1cm4gdGhpcy5nZXQoXFxcImN1cnJlbnRcXFwiKSAhPT0gdHJ1ZTtcXG4gIH0sXFxuICBsaXN0OiBmdW5jdGlvbiAoKSB7XFxuICAgIHJldHVybiB0aGlzLmdldChcXFwiaXRlbS5sZW5ndGhcXFwiKSAhPT0gMDtcXG4gIH0sXFxuICBlbXB0eTogZnVuY3Rpb24gKCkge1xcbiAgICByZXR1cm4gdGhpcy5nZXQoXFxcIml0ZW0ubGVuZ3RoXFxcIikgPT09IDA7XFxuICB9XFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwiPGgxPnt7aGVhZGVyfX08L2gxPlxcbnt7I2xpc3R9fVxcbiAgPHVsPlxcbiAge3sjaXRlbX19XFxuICB7eyNjdXJyZW50fX1cXG4gIDxsaT48c3Ryb25nPnt7bmFtZX19PC9zdHJvbmc+PC9saT5cXG4gIHt7L2N1cnJlbnR9fVxcbiAge3sjbGlua319XFxuICA8bGk+PGEgaHJlZj1cXFwie3t1cmx9fVxcXCI+e3tuYW1lfX08L2E+PC9saT5cXG4gIHt7L2xpbmt9fVxcbiAge3svaXRlbX19XFxuICA8L3VsPlxcbnt7L2xpc3R9fVxcbnt7I2VtcHR5fX1cXG4gIDxwPlRoZSBsaXN0IGlzIGVtcHR5LjwvcD5cXG57ey9lbXB0eX19XCIsXG5cdFx0XCJ0eHRcIjogXCI8aDE+Q29sb3JzPC9oMT5cXG4gIDx1bD5cXG4gIDxsaT48c3Ryb25nPnJlZDwvc3Ryb25nPjwvbGk+XFxuICA8bGk+PGEgaHJlZj1cXFwiI0dyZWVuXFxcIj5ncmVlbjwvYT48L2xpPlxcbiAgPGxpPjxhIGhyZWY9XFxcIiNCbHVlXFxcIj5ibHVlPC9hPjwvbGk+XFxuICA8L3VsPlwiXG5cdH0sXG5cdFwiY29udGV4dF9sb29rdXBcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgXFxcIm91dGVyXFxcIjoge1xcbiAgICBcXFwiaWRcXFwiOiAxLFxcbiAgICBcXFwic2Vjb25kXFxcIjoge1xcbiAgICAgIFxcXCJub3RoaW5nXFxcIjogMlxcbiAgICB9XFxuICB9XFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjb3V0ZXJ9fXt7I3NlY29uZH19e3tpZH19e3svc2Vjb25kfX17ey9vdXRlcn19XCIsXG5cdFx0XCJ0eHRcIjogXCIxXCJcblx0fSxcblx0XCJkZWxpbWl0ZXJzXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGZpcnN0OiBcXFwiSXQgd29ya2VkIHRoZSBmaXJzdCB0aW1lLlxcXCIsXFxuICBzZWNvbmQ6IFxcXCJBbmQgaXQgd29ya2VkIHRoZSBzZWNvbmQgdGltZS5cXFwiLFxcbiAgdGhpcmQ6IFxcXCJUaGVuLCBzdXJwcmlzaW5nbHksIGl0IHdvcmtlZCB0aGUgdGhpcmQgdGltZS5cXFwiLFxcbiAgZm91cnRoOiBcXFwiRm91cnRoIHRpbWUgYWxzbyBmaW5lIS5cXFwiXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3s9PCUgJT49fX0qXFxuPCUgZmlyc3QgJT5cXG4qIDwlIHNlY29uZCAlPlxcbjwlPXwgfD0lPlxcbiogfCB0aGlyZCB8XFxufD17eyB9fT18XFxuKiB7eyBmb3VydGggfX1cIixcblx0XHRcInR4dFwiOiBcIipcXG5JdCB3b3JrZWQgdGhlIGZpcnN0IHRpbWUuXFxuKiBBbmQgaXQgd29ya2VkIHRoZSBzZWNvbmQgdGltZS5cXG4qIFRoZW4sIHN1cnByaXNpbmdseSwgaXQgd29ya2VkIHRoZSB0aGlyZCB0aW1lLlxcbiogRm91cnRoIHRpbWUgYWxzbyBmaW5lIS5cIlxuXHR9LFxuXHRcImRpc2FwcGVhcmluZ193aGl0ZXNwYWNlXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGJlZHJvb21zOiB0cnVlLFxcbiAgdG90YWw6IDFcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyNiZWRyb29tc319e3t0b3RhbH19e3svYmVkcm9vbXN9fSBCRURcIixcblx0XHRcInR4dFwiOiBcIjEgQkVEXCJcblx0fSxcblx0XCJkb3Rfbm90YXRpb25cIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgbmFtZTogXFxcIkEgQm9va1xcXCIsXFxuICBhdXRob3JzOiBbXFxcIkpvaG4gUG93ZXJcXFwiLCBcXFwiSmFtaWUgV2Fsc2hcXFwiXSxcXG4gIHByaWNlOiB7XFxuICAgIHZhbHVlOiAyMDAsXFxuICAgIHZhdDogZnVuY3Rpb24gKCkge1xcbiAgICAgIHJldHVybiB0aGlzLmdldChcXFwidmFsdWVcXFwiKSAqIDAuMjtcXG4gICAgfSxcXG4gICAgY3VycmVuY3k6IHtcXG4gICAgICBzeW1ib2w6ICckJyxcXG4gICAgICBuYW1lOiAnVVNEJ1xcbiAgICB9XFxuICB9LFxcbiAgYXZhaWxhYmlsaXR5OiB7XFxuICAgIHN0YXR1czogdHJ1ZSxcXG4gICAgdGV4dDogXFxcIkluIFN0b2NrXFxcIlxcbiAgfSxcXG4gIC8vIEFuZCBub3csIHNvbWUgdHJ1dGh5IGZhbHNlIHZhbHVlc1xcbiAgdHJ1dGh5OiB7XFxuICAgIHplcm86IDAsXFxuICAgIG5vdFRydWU6IGZhbHNlXFxuICB9XFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwiPCEtLSBleGNpdGluZyBwYXJ0IC0tPlxcbjxoMT57e25hbWV9fTwvaDE+XFxuPHA+QXV0aG9yczogPHVsPnt7I2F1dGhvcnN9fTxsaT57ey59fTwvbGk+e3svYXV0aG9yc319PC91bD48L3A+XFxuPHA+UHJpY2U6IHt7e3ByaWNlLmN1cnJlbmN5LnN5bWJvbH19fXt7cHJpY2UudmFsdWV9fSB7eyNwcmljZS5jdXJyZW5jeX19e3tuYW1lfX0gPGI+e3thdmFpbGFiaWxpdHkudGV4dH19PC9iPnt7L3ByaWNlLmN1cnJlbmN5fX08L3A+XFxuPHA+VkFUOiB7e3twcmljZS5jdXJyZW5jeS5zeW1ib2x9fX17eyNwcmljZX19e3t2YXR9fXt7L3ByaWNlfX08L3A+XFxuPCEtLSBib3JpbmcgcGFydCAtLT5cXG48aDI+VGVzdCB0cnV0aHkgZmFsc2UgdmFsdWVzOjwvaDI+XFxuPHA+WmVybzoge3t0cnV0aHkuemVyb319PC9wPlxcbjxwPkZhbHNlOiB7e3RydXRoeS5ub3RUcnVlfX08L3A+XCIsXG5cdFx0XCJ0eHRcIjogXCI8aDE+QSBCb29rPC9oMT5cXG48cD5BdXRob3JzOiA8dWw+PGxpPkpvaG4gUG93ZXI8L2xpPjxsaT5KYW1pZSBXYWxzaDwvbGk+PC91bD48L3A+XFxuPHA+UHJpY2U6ICQyMDAgVVNEIDxiPkluIFN0b2NrPC9iPjwvcD5cXG48cD5WQVQ6ICQ0MDwvcD5cXG5cXG48aDI+VGVzdCB0cnV0aHkgZmFsc2UgdmFsdWVzOjwvaDI+XFxuPHA+WmVybzogMDwvcD5cXG48cD5GYWxzZTogZmFsc2U8L3A+XCJcblx0fSxcblx0XCJkb3VibGVfcmVuZGVyXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGZvbzogdHJ1ZSxcXG4gIGJhcjogXFxcInt7d2lufX1cXFwiLFxcbiAgd2luOiBcXFwiRkFJTFxcXCJcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyNmb299fXt7YmFyfX17ey9mb299fVwiLFxuXHRcdFwidHh0XCI6IFwie3t3aW59fVwiXG5cdH0sXG5cdFwiZW1wdHlfbGlzdFwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBqb2JzOiBbXVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcIlRoZXNlIGFyZSB0aGUgam9iczpcXG57eyNqb2JzfX1cXG57ey59fVxcbnt7L2pvYnN9fVwiLFxuXHRcdFwidHh0XCI6IFwiVGhlc2UgYXJlIHRoZSBqb2JzOlwiXG5cdH0sXG5cdFwiZW1wdHlfc2VjdGlvbnNcIjoge1xuXHRcdFwianNcIjogXCIoe30pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I2Zvb319e3svZm9vfX1mb297eyNiYXJ9fXt7L2Jhcn19XCIsXG5cdFx0XCJ0eHRcIjogXCJmb29cIlxuXHR9LFxuXHRcImVtcHR5X3N0cmluZ1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBkZXNjcmlwdGlvbjogXFxcIlRoYXQgaXMgYWxsIVxcXCIsXFxuICBjaGlsZDoge1xcbiAgICBkZXNjcmlwdGlvbjogXFxcIlxcXCJcXG4gIH1cXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7e2Rlc2NyaXB0aW9ufX17eyNjaGlsZH19e3tkZXNjcmlwdGlvbn19e3svY2hpbGR9fVwiLFxuXHRcdFwidHh0XCI6IFwiVGhhdCBpcyBhbGwhXCJcblx0fSxcblx0XCJlbXB0eV90ZW1wbGF0ZVwiOiB7XG5cdFx0XCJqc1wiOiBcIih7fSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwiPGh0bWw+PGhlYWQ+PC9oZWFkPjxib2R5PjxoMT5UZXN0PC9oMT48L2JvZHk+PC9odG1sPlwiLFxuXHRcdFwidHh0XCI6IFwiPGh0bWw+PGhlYWQ+PC9oZWFkPjxib2R5PjxoMT5UZXN0PC9oMT48L2JvZHk+PC9odG1sPlwiXG5cdH0sXG5cdFwiZXJyb3Jfbm90X2ZvdW5kXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGJhcjogMlxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7Zm9vfX1cIixcblx0XHRcInR4dFwiOiBcIlwiXG5cdH0sXG5cdFwiZmFsc3lcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgXFxcImVtcHR5U3RyaW5nXFxcIjogXFxcIlxcXCIsXFxuICBcXFwiZW1wdHlBcnJheVxcXCI6IFtdLFxcbiAgXFxcInplcm9cXFwiOiAwLFxcbiAgXFxcIm51bGxcXFwiOiBudWxsLFxcbiAgXFxcInVuZGVmaW5lZFxcXCI6IHVuZGVmaW5lZCxcXG4gIFxcXCJOYU5cXFwiOiAwLzBcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyNlbXB0eVN0cmluZ319ZW1wdHkgc3RyaW5ne3svZW1wdHlTdHJpbmd9fVxcbnt7XmVtcHR5U3RyaW5nfX1pbnZlcnRlZCBlbXB0eSBzdHJpbmd7ey9lbXB0eVN0cmluZ319XFxue3sjZW1wdHlBcnJheX19ZW1wdHkgYXJyYXl7ey9lbXB0eUFycmF5fX1cXG57e15lbXB0eUFycmF5fX1pbnZlcnRlZCBlbXB0eSBhcnJheXt7L2VtcHR5QXJyYXl9fVxcbnt7I3plcm99fXplcm97ey96ZXJvfX1cXG57e156ZXJvfX1pbnZlcnRlZCB6ZXJve3svemVyb319XFxue3sjbnVsbH19bnVsbHt7L251bGx9fVxcbnt7Xm51bGx9fWludmVydGVkIG51bGx7ey9udWxsfX1cXG57eyN1bmRlZmluZWR9fXVuZGVmaW5lZHt7L3VuZGVmaW5lZH19XFxue3tedW5kZWZpbmVkfX1pbnZlcnRlZCB1bmRlZmluZWR7ey91bmRlZmluZWR9fVxcbnt7I05hTn19TmFOe3svTmFOfX1cXG57e15OYU59fWludmVydGVkIE5hTnt7L05hTn19XCIsXG5cdFx0XCJ0eHRcIjogXCJpbnZlcnRlZCBlbXB0eSBzdHJpbmdcXG5cXG5pbnZlcnRlZCBlbXB0eSBhcnJheVxcblxcbmludmVydGVkIHplcm9cXG5cXG5pbnZlcnRlZCBudWxsXFxuXFxuaW52ZXJ0ZWQgdW5kZWZpbmVkXFxuXFxuaW52ZXJ0ZWQgTmFOXCJcblx0fSxcblx0XCJncmFuZHBhcmVudF9jb250ZXh0XCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGdyYW5kX3BhcmVudF9pZDogJ2dyYW5kX3BhcmVudDEnLFxcbiAgcGFyZW50X2NvbnRleHRzOiBbXFxuICAgIHtcXG4gICAgICBwYXJlbnRfaWQ6ICdwYXJlbnQxJyxcXG4gICAgICBjaGlsZF9jb250ZXh0czogW1xcbiAgICAgICAgeyBjaGlsZF9pZDogJ3BhcmVudDEtY2hpbGQxJyB9LFxcbiAgICAgICAgeyBjaGlsZF9pZDogJ3BhcmVudDEtY2hpbGQyJyB9XFxuICAgICAgXVxcbiAgICB9LFxcbiAgICB7XFxuICAgICAgcGFyZW50X2lkOiAncGFyZW50MicsXFxuICAgICAgY2hpbGRfY29udGV4dHM6IFtcXG4gICAgICAgIHsgY2hpbGRfaWQ6ICdwYXJlbnQyLWNoaWxkMScgfSxcXG4gICAgICAgIHsgY2hpbGRfaWQ6ICdwYXJlbnQyLWNoaWxkMicgfVxcbiAgICAgIF1cXG4gICAgfVxcbiAgXVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7Z3JhbmRfcGFyZW50X2lkfX1cXG57eyNwYXJlbnRfY29udGV4dHN9fVxcbnt7Z3JhbmRfcGFyZW50X2lkfX1cXG57e3BhcmVudF9pZH19XFxue3sjY2hpbGRfY29udGV4dHN9fVxcbnt7Z3JhbmRfcGFyZW50X2lkfX1cXG57e3BhcmVudF9pZH19XFxue3tjaGlsZF9pZH19XFxue3svY2hpbGRfY29udGV4dHN9fVxcbnt7L3BhcmVudF9jb250ZXh0c319XCIsXG5cdFx0XCJ0eHRcIjogXCJncmFuZF9wYXJlbnQxXFxuZ3JhbmRfcGFyZW50MVxcbnBhcmVudDFcXG5ncmFuZF9wYXJlbnQxXFxucGFyZW50MVxcbnBhcmVudDEtY2hpbGQxXFxuZ3JhbmRfcGFyZW50MVxcbnBhcmVudDFcXG5wYXJlbnQxLWNoaWxkMlxcbmdyYW5kX3BhcmVudDFcXG5wYXJlbnQyXFxuZ3JhbmRfcGFyZW50MVxcbnBhcmVudDJcXG5wYXJlbnQyLWNoaWxkMVxcbmdyYW5kX3BhcmVudDFcXG5wYXJlbnQyXFxucGFyZW50Mi1jaGlsZDJcIlxuXHR9LFxuXHRcImluY2x1ZGVkX3RhZ1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBodG1sOiBcXFwiSSBsaWtlIHt7bXVzdGFjaGV9fVxcXCJcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJZb3Ugc2FpZCBcXFwie3t7aHRtbH19fVxcXCIgdG9kYXlcIixcblx0XHRcInR4dFwiOiBcIllvdSBzYWlkIFxcXCJJIGxpa2Uge3ttdXN0YWNoZX19XFxcIiB0b2RheVwiXG5cdH0sXG5cdFwiaW52ZXJ0ZWRfc2VjdGlvblwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBcXFwicmVwb3NcXFwiOiBbXVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I3JlcG9zfX08Yj57e25hbWV9fTwvYj57ey9yZXBvc319XFxue3tecmVwb3N9fU5vIHJlcG9zIDooe3svcmVwb3N9fVxcbnt7Xm5vdGhpbn19SGVsbG8he3svbm90aGlufX1cIixcblx0XHRcInR4dFwiOiBcIk5vIHJlcG9zIDooXFxuSGVsbG8hXCJcblx0fSxcblx0XCJrZXlzX3dpdGhfcXVlc3Rpb25tYXJrc1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBcXFwicGVyc29uP1xcXCI6IHtcXG4gICAgbmFtZTogXFxcIkpvblxcXCJcXG4gIH1cXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyNwZXJzb24/fX1cXG4gIEhpIHt7bmFtZX19IVxcbnt7L3BlcnNvbj99fVwiLFxuXHRcdFwidHh0XCI6IFwiSGkgSm9uIVwiXG5cdH0sXG5cdFwibWFsaWNpb3VzX3RlbXBsYXRlXCI6IHtcblx0XHRcImpzXCI6IFwiKHt9KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7e1xcXCIrKGZ1bmN0aW9uICgpIHt0aHJvdyBcXFwiZXZpbFxcXCJ9KSgpK1xcXCJ9fVxcbnt7e1xcXCIrKGZ1bmN0aW9uICgpIHt0aHJvdyBcXFwiZXZpbFxcXCJ9KSgpK1xcXCJ9fX1cXG57ez4gXFxcIisoZnVuY3Rpb24gKCkge3Rocm93IFxcXCJldmlsXFxcIn0pKCkrXFxcIn19XFxue3sjIFxcXCIrKGZ1bmN0aW9uICgpIHt0aHJvdyBcXFwiZXZpbFxcXCJ9KSgpK1xcXCJ9fVxcbnt7LyBcXFwiKyhmdW5jdGlvbiAoKSB7dGhyb3cgXFxcImV2aWxcXFwifSkoKStcXFwifX1cIixcblx0XHRcInR4dFwiOiBcIlwiXG5cdH0sXG5cdFwibXVsdGlsaW5lX2NvbW1lbnRcIjoge1xuXHRcdFwianNcIjogXCIoe30pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7IVxcblxcblRoaXMgaXMgYSBtdWx0aS1saW5lIGNvbW1lbnQuXFxuXFxufX1cXG5IZWxsbyB3b3JsZCFcIixcblx0XHRcInR4dFwiOiBcIkhlbGxvIHdvcmxkIVwiXG5cdH0sXG5cdFwibmVzdGVkX2RvdFwiOiB7XG5cdFx0XCJqc1wiOiBcIih7IG5hbWU6ICdCcnVubycgfSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjbmFtZX19SGVsbG8ge3sufX17ey9uYW1lfX1cIixcblx0XHRcInR4dFwiOiBcIkhlbGxvIEJydW5vXCJcblx0fSxcblx0XCJuZXN0ZWRfaXRlcmF0aW5nXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGlubmVyOiBbe1xcbiAgICBmb286ICdmb28nLFxcbiAgICBpbm5lcjogW3tcXG4gICAgICBiYXI6ICdiYXInXFxuICAgIH1dXFxuICB9XVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I2lubmVyfX17e2Zvb319e3sjaW5uZXJ9fXt7YmFyfX17ey9pbm5lcn19e3svaW5uZXJ9fVwiLFxuXHRcdFwidHh0XCI6IFwiZm9vYmFyXCJcblx0fSxcblx0XCJuZXN0aW5nXCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGZvbzogW1xcbiAgICB7YToge2I6IDF9fSxcXG4gICAge2E6IHtiOiAyfX0sXFxuICAgIHthOiB7YjogM319XFxuICBdXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjZm9vfX1cXG4gIHt7I2F9fVxcbiAgICB7e2J9fVxcbiAge3svYX19XFxue3svZm9vfX1cIixcblx0XHRcInR4dFwiOiBcIjFcXG4gICAgMlxcbiAgICAzXCJcblx0fSxcblx0XCJuZXN0aW5nX3NhbWVfbmFtZVwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBpdGVtczogW1xcbiAgICB7XFxuICAgICAgbmFtZTogJ25hbWUnLFxcbiAgICAgIGl0ZW1zOiBbMSwgMiwgMywgNF1cXG4gICAgfVxcbiAgXVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I2l0ZW1zfX17e25hbWV9fXt7I2l0ZW1zfX17ey59fXt7L2l0ZW1zfX17ey9pdGVtc319XCIsXG5cdFx0XCJ0eHRcIjogXCJuYW1lMTIzNFwiXG5cdH0sXG5cdFwibnVsbF9zdHJpbmdcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgbmFtZTogXFxcIkVsaXNlXFxcIixcXG4gIGdseXRjaDogdHJ1ZSxcXG4gIGJpbmFyeTogZmFsc2UsXFxuICB2YWx1ZTogbnVsbCxcXG4gIHVuZGVmOiB1bmRlZmluZWQsXFxuICBudW1lcmljOiBmdW5jdGlvbigpIHtcXG4gICAgcmV0dXJuIE5hTjtcXG4gIH1cXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJIZWxsbyB7e25hbWV9fVxcbmdseXRjaCB7e2dseXRjaH19XFxuYmluYXJ5IHt7YmluYXJ5fX1cXG52YWx1ZSB7e3ZhbHVlfX1cXG51bmRlZiB7e3VuZGVmfX1cXG5udW1lcmljIHt7bnVtZXJpY319XCIsXG5cdFx0XCJ0eHRcIjogXCJIZWxsbyBFbGlzZVxcbmdseXRjaCB0cnVlXFxuYmluYXJ5IGZhbHNlXFxudmFsdWUgXFxudW5kZWYgXFxubnVtZXJpYyBOYU5cIlxuXHR9LFxuXHRcIm51bGxfdmlld1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBuYW1lOiAnSm9lJyxcXG4gIGZyaWVuZHM6IG51bGxcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7e25hbWV9fSdzIGZyaWVuZHM6IHt7I2ZyaWVuZHN9fXt7bmFtZX19LCB7ey9mcmllbmRzfX1cIixcblx0XHRcInR4dFwiOiBcIkpvZSdzIGZyaWVuZHM6XCJcblx0fSxcblx0XCJwYXJ0aWFsX2VtcHR5XCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIGZvbzogMVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcImhleSB7e2Zvb319XFxue3s+cGFydGlhbH19XCIsXG5cdFx0XCJwYXJ0aWFsXCI6IFwiXCIsXG5cdFx0XCJ0eHRcIjogXCJoZXkgMVwiXG5cdH0sXG5cdFwicmVjdXJzaW9uX3dpdGhfc2FtZV9uYW1lc1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBuYW1lOiAnbmFtZScsXFxuICBkZXNjcmlwdGlvbjogJ2Rlc2MnLFxcbiAgdGVybXM6IFtcXG4gICAge25hbWU6ICd0MScsIGluZGV4OiAwfSxcXG4gICAge25hbWU6ICd0MicsIGluZGV4OiAxfVxcbiAgXVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7IG5hbWUgfX1cXG57eyBkZXNjcmlwdGlvbiB9fVxcblxcbnt7I3Rlcm1zfX1cXG4gIHt7bmFtZX19XFxuICB7e2luZGV4fX1cXG57ey90ZXJtc319XCIsXG5cdFx0XCJ0eHRcIjogXCJuYW1lXFxuZGVzY1xcblxcbiAgdDFcXG4gIDBcXG4gIHQyXFxuICAxXCJcblx0fSxcblx0XCJyZXVzZV9vZl9lbnVtZXJhYmxlc1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICB0ZXJtczogW1xcbiAgICB7bmFtZTogJ3QxJywgaW5kZXg6IDB9LFxcbiAgICB7bmFtZTogJ3QyJywgaW5kZXg6IDF9XFxuICBdXFxufSlcIixcblx0XHRcIm11c3RhY2hlXCI6IFwie3sjdGVybXN9fVxcbiAge3tuYW1lfX1cXG4gIHt7aW5kZXh9fVxcbnt7L3Rlcm1zfX1cXG57eyN0ZXJtc319XFxuICB7e25hbWV9fVxcbiAge3tpbmRleH19XFxue3svdGVybXN9fVwiLFxuXHRcdFwidHh0XCI6IFwidDFcXG4gIDBcXG4gIHQyXFxuICAxXFxuICB0MVxcbiAgMFxcbiAgdDJcXG4gIDFcIlxuXHR9LFxuXHRcInNlY3Rpb25fYXNfY29udGV4dFwiOiB7XG5cdFx0XCJqc1wiOiBcIih7XFxuICBhX29iamVjdDoge1xcbiAgICB0aXRsZTogJ3RoaXMgaXMgYW4gb2JqZWN0JyxcXG4gICAgZGVzY3JpcHRpb246ICdvbmUgb2YgaXRzIGF0dHJpYnV0ZXMgaXMgYSBsaXN0JyxcXG4gICAgYV9saXN0OiBbXFxuICAgICAge2xhYmVsOiAnbGlzdGl0ZW0xJ30sXFxuICAgICAge2xhYmVsOiAnbGlzdGl0ZW0yJ31cXG4gICAgXVxcbiAgfVxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I2Ffb2JqZWN0fX1cXG4gIDxoMT57e3RpdGxlfX08L2gxPlxcbiAgPHA+e3tkZXNjcmlwdGlvbn19PC9wPlxcbiAgPHVsPlxcbiAgICB7eyNhX2xpc3R9fVxcbiAgICA8bGk+e3tsYWJlbH19PC9saT5cXG4gICAge3svYV9saXN0fX1cXG4gIDwvdWw+XFxue3svYV9vYmplY3R9fVwiLFxuXHRcdFwidHh0XCI6IFwiPGgxPnRoaXMgaXMgYW4gb2JqZWN0PC9oMT5cXG4gIDxwPm9uZSBvZiBpdHMgYXR0cmlidXRlcyBpcyBhIGxpc3Q8L3A+XFxuICA8dWw+XFxuICAgIDxsaT5saXN0aXRlbTE8L2xpPlxcbiAgICA8bGk+bGlzdGl0ZW0yPC9saT5cXG4gIDwvdWw+XCJcblx0fSxcblx0XCJzaW1wbGVcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgbmFtZTogXFxcIkNocmlzXFxcIixcXG4gIHZhbHVlOiAxMDAwMCxcXG4gIHRheGVkX3ZhbHVlOiBmdW5jdGlvbiAodHBsLCBjdHgpIHtcXG4gIFxcdHZhciB2YWwgPSB0cGwuZ2V0KFxcXCJ2YWx1ZVxcXCIpO1xcbiAgICByZXR1cm4gdmFsIC0gKHZhbCAqIDAuNCk7XFxuICB9LFxcbiAgaW5fY2E6IHRydWVcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJIZWxsbyB7e25hbWV9fVxcbllvdSBoYXZlIGp1c3Qgd29uICR7e3ZhbHVlfX0hXFxue3sjaW5fY2F9fVxcbldlbGwsICR7eyB0YXhlZF92YWx1ZSB9fSwgYWZ0ZXIgdGF4ZXMuXFxue3svaW5fY2F9fVwiLFxuXHRcdFwidHh0XCI6IFwiSGVsbG8gQ2hyaXNcXG5Zb3UgaGF2ZSBqdXN0IHdvbiAkMTAwMDAhXFxuV2VsbCwgJDYwMDAsIGFmdGVyIHRheGVzLlwiXG5cdH0sXG5cdFwic3RyaW5nX2FzX2NvbnRleHRcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgYV9zdHJpbmc6ICdhYScsXFxuICBhX2xpc3Q6IFsnYScsJ2InLCdjJ11cXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCI8dWw+XFxue3sjYV9saXN0fX1cXG4gIDxsaT57e2Ffc3RyaW5nfX0ve3sufX08L2xpPlxcbnt7L2FfbGlzdH19XFxuPC91bD5cIixcblx0XHRcInR4dFwiOiBcIjx1bD5cXG4gIDxsaT5hYS9hPC9saT5cXG4gIDxsaT5hYS9iPC9saT5cXG4gIDxsaT5hYS9jPC9saT5cXG48L3VsPlwiXG5cdH0sXG5cdFwidHdvX2luX2Ffcm93XCI6IHtcblx0XHRcImpzXCI6IFwiKHtcXG4gIG5hbWU6IFxcXCJKb2VcXFwiLFxcbiAgZ3JlZXRpbmc6IFxcXCJXZWxjb21lXFxcIlxcbn0pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7Z3JlZXRpbmd9fSwge3tuYW1lfX0hXCIsXG5cdFx0XCJ0eHRcIjogXCJXZWxjb21lLCBKb2UhXCJcblx0fSxcblx0XCJ0d29fc2VjdGlvbnNcIjoge1xuXHRcdFwianNcIjogXCIoe30pXCIsXG5cdFx0XCJtdXN0YWNoZVwiOiBcInt7I2Zvb319XFxue3svZm9vfX1cXG57eyNiYXJ9fVxcbnt7L2Jhcn19XCIsXG5cdFx0XCJ0eHRcIjogXCJcIlxuXHR9LFxuXHRcIndoaXRlc3BhY2VcIjoge1xuXHRcdFwianNcIjogXCIoe1xcbiAgdGFnMTogXFxcIkhlbGxvXFxcIixcXG4gIHRhZzI6IFxcXCJXb3JsZFxcXCJcXG59KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7e3RhZzF9fVxcblxcblxcbnt7dGFnMn19LlwiLFxuXHRcdFwidHh0XCI6IFwiSGVsbG9cXG5cXG5cXG5Xb3JsZC5cIlxuXHR9LFxuXHRcInplcm9fdmlld1wiOiB7XG5cdFx0XCJqc1wiOiBcIih7IG51bXM6IFswLCAxLCAyXSB9KVwiLFxuXHRcdFwibXVzdGFjaGVcIjogXCJ7eyNudW1zfX17ey59fSx7ey9udW1zfX1cIixcblx0XHRcInR4dFwiOiBcIjAsMSwyLFwiXG5cdH1cbn0iLCJ2YXIgYXNzZXJ0ID0gcmVxdWlyZShcImFzc2VydFwiKSxcblx0cGFyc2UgPSByZXF1aXJlKFwiLi4vbGliL3BhcnNlXCIpLFxuXHRpbnNwZWN0ID0gcmVxdWlyZSgndXRpbCcpLmluc3BlY3Q7XG5cbmRlc2NyaWJlKFwiI3BhcnNlKClcIiwgZnVuY3Rpb24oKSB7XG5cblx0aXQoXCJwYXJzZXMgYmFzaWMgaHRtbFwiLCBmdW5jdGlvbigpIHtcblx0XHR2YXIgdGVtcGxhdGUgPSBwYXJzZShcIjxkaXYgY2xhc3M9XFxcImNvbnRhaW5lclxcXCI+SGVsbG8gV29ybGQ8L2Rpdj5cIik7XG5cdFx0XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbCh0ZW1wbGF0ZSwgW3tcblx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5FTEVNRU5ULFxuXHRcdFx0bmFtZTogXCJkaXZcIixcblx0XHRcdGF0dHJpYnV0ZXM6IFt7XG5cdFx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5BVFRSSUJVVEUsXG5cdFx0XHRcdG5hbWU6IFwiY2xhc3NcIixcblx0XHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLlRFWFQsXG5cdFx0XHRcdFx0dmFsdWU6IFwiY29udGFpbmVyXCJcblx0XHRcdFx0fV1cblx0XHRcdH1dLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5URVhULFxuXHRcdFx0XHR2YWx1ZTogXCJIZWxsbyBXb3JsZFwiXG5cdFx0XHR9XVxuXHRcdH1dKTtcblx0fSk7XG5cblx0aXQoXCJwYXJzZXMgbXVzdGFjaGUgdmFyaWFibGVzXCIsIGZ1bmN0aW9uKCkge1xuXHRcdHZhciB0ZW1wbGF0ZSA9IHBhcnNlKFwie3sgaGVsbG8gfX17e3sgd29ybGQgfX19e3smIHVuZXNjYXBlZCB9fVwiKTtcblx0XHQvLyBjb25zb2xlLmxvZyhpbnNwZWN0KHRlbXBsYXRlKSk7XG5cdFx0XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbCh0ZW1wbGF0ZSwgW3tcblx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5JTlRFUlBPTEFUT1IsXG5cdFx0XHR2YWx1ZTogXCJoZWxsb1wiXG5cdFx0fSx7XG5cdFx0XHR0eXBlOiBwYXJzZS5OT0RFX1RZUEUuVFJJUExFLFxuXHRcdFx0dmFsdWU6IFwid29ybGRcIlxuXHRcdH0se1xuXHRcdFx0dHlwZTogcGFyc2UuTk9ERV9UWVBFLlRSSVBMRSxcblx0XHRcdHZhbHVlOiBcInVuZXNjYXBlZFwiXG5cdFx0fV0pO1xuXHR9KTtcblxuXHRpdChcInBhcnNlcyBtdXN0YWNoZSBzZWN0aW9uc1wiLCBmdW5jdGlvbigpIHtcblx0XHR2YXIgdGVtcGxhdGUgPSBwYXJzZShcInt7I2dvb2R9fUhlbGxve3svZ29vZH19e3teYmFkfX1Xb3JsZHt7L2JhZH19XCIpO1xuXHRcdFxuXHRcdGFzc2VydC5kZWVwRXF1YWwodGVtcGxhdGUsIFt7XG5cdFx0XHR0eXBlOiBwYXJzZS5OT0RFX1RZUEUuU0VDVElPTixcblx0XHRcdHZhbHVlOiBcImdvb2RcIixcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHR0eXBlOiBwYXJzZS5OT0RFX1RZUEUuVEVYVCxcblx0XHRcdFx0dmFsdWU6IFwiSGVsbG9cIlxuXHRcdFx0fV1cblx0XHR9LHtcblx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5JTlZFUlRFRCxcblx0XHRcdHZhbHVlOiBcImJhZFwiLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5URVhULFxuXHRcdFx0XHR2YWx1ZTogXCJXb3JsZFwiXG5cdFx0XHR9XVxuXHRcdH1dKTtcblx0fSk7XG5cblx0aXQoXCJwYXJzZXMgbXVzdGFjaGUgcGFydGlhbHNcIiwgZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHRlbXBsYXRlID0gcGFyc2UoXCJ7ez5wYXJ0aWFsfX1cIik7XG5cdFx0XG5cdFx0YXNzZXJ0LmRlZXBFcXVhbCh0ZW1wbGF0ZSwgW3tcblx0XHRcdHR5cGU6IHBhcnNlLk5PREVfVFlQRS5QQVJUSUFMLFxuXHRcdFx0dmFsdWU6IFwicGFydGlhbFwiXG5cdFx0fV0pO1xuXHR9KTtcblxuXHRpdChcInBhcnNlcyBkZWVwbHlcIiwgZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHRlbXBsYXRlID0gcGFyc2UoXCI8ZGl2Pnt7IHZhciB9fTwvZGl2PlwiKTtcblxuXHRcdGFzc2VydC5kZWVwRXF1YWwodGVtcGxhdGUsIFt7XG5cdFx0XHR0eXBlOiBwYXJzZS5OT0RFX1RZUEUuRUxFTUVOVCxcblx0XHRcdG5hbWU6IFwiZGl2XCIsXG5cdFx0XHRhdHRyaWJ1dGVzOiBbXSxcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHR0eXBlOiBwYXJzZS5OT0RFX1RZUEUuSU5URVJQT0xBVE9SLFxuXHRcdFx0XHR2YWx1ZTogXCJ2YXJcIlxuXHRcdFx0fV1cblx0XHR9XSk7XG5cdH0pO1xuXG59KTsiLCJ2YXIgYXNzZXJ0ID0gcmVxdWlyZShcImFzc2VydFwiKTtcblxuZGVzY3JpYmUoXCJSZWFjdGl2aXR5XCIsIGZ1bmN0aW9uKCkge1xuXHR2YXIgdHBsO1xuXG5cdGJlZm9yZShmdW5jdGlvbigpIHtcblx0XHR0cGwgPSBuZXcgVGVtcGxlKCk7XG5cdH0pO1xuXG5cdGJlZm9yZUVhY2goZnVuY3Rpb24oKSB7XG5cdFx0dHBsLnNldChcImZvb1wiLCBcImJhclwiKTtcblx0fSk7XG5cblx0ZGVzY3JpYmUoXCIjYXV0b3J1bigpXCIsIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBjb21wO1xuXHRcdFxuXHRcdGFmdGVyRWFjaChmdW5jdGlvbigpIHtcblx0XHRcdGlmIChjb21wICE9IG51bGwpIHtcblx0XHRcdFx0Y29tcC5zdG9wKCk7XG5cdFx0XHRcdGNvbXAgPSBudWxsO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aXQoXCJhdXRvcnVuKCkgY29udGV4dCBhbHdheXMgcnVucyBvbmNlLCBpbW1lZGlhdGVseVwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRjb21wID0gdHBsLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGFzc2VydC5vayh0cGwuZ2V0KFwiZm9vXCIpKTtcblx0XHRcdFx0c2VlbiA9IHRydWU7XG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhzZWVuKTtcblx0XHR9KTtcblxuXHRcdGl0KFwiYHRoaXNgIGluIGF1dG9ydW4oKSBjb250ZXh0cyBwb2ludHMgdG8gVGVtcGxlIGluc3RhbmNlXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0Y29tcCA9IHRwbC5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRhc3NlcnQub2sodHBsLmdldChcImZvb1wiKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzLCB0cGwpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRpdChcImNoYW5naW5nIHZhbHVlIGF0IGBrZXlgIGFmdGVyIGNhbGxpbmcgZ2V0KGtleSkgaW4gYSBjb250ZXh0IGNhdXNlcyBjb250ZXh0IHRvIHJ1biBhZ2FpblwiLCBmdW5jdGlvbihkb25lKSB7XG5cdFx0XHR0aGlzLnRpbWVvdXQoNTAwKTtcblx0XHRcdHZhciBydW4gPSAyO1xuXG5cdFx0XHRjb21wID0gdHBsLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGFzc2VydC5vayh0cGwuZ2V0KFwiZm9vXCIpKTtcblx0XHRcdFx0aWYgKCEoLS1ydW4pKSBkb25lKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0c2V0VGltZW91dChmdW5jdGlvbigpIHtcblx0XHRcdFx0dHBsLnNldChcImZvb1wiLCB7IGJhcjogXCJiYXpcIiB9KTtcblx0XHRcdH0sIDEwKTtcblx0XHR9KTtcblx0fSk7XG59KTsiLCJ2YXIgc3BlYyA9IHJlcXVpcmUoXCIuL211c3RhY2hlLmpzb25cIiksXG5cdGFzc2VydCA9IHJlcXVpcmUoXCJhc3NlcnRcIik7XG5cbmRlc2NyaWJlKCdET00gUmVuZGVyaW5nJywgZnVuY3Rpb24gKCkge1xuXHRkZXNjcmliZSgnTXVzdGFjaGUgVGVzdCBTdWl0ZScsIGZ1bmN0aW9uICgpIHtcblx0XHRmdW5jdGlvbiBnZXRDb250ZW50cyh0ZXN0TmFtZSwgZXh0KSB7XG5cdFx0XHRyZXR1cm4gc3BlY1t0ZXN0TmFtZV1bZXh0XTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRWaWV3KHRlc3ROYW1lKSB7XG5cdFx0XHR2YXIgdmlldyA9IGdldENvbnRlbnRzKHRlc3ROYW1lLCAnanMnKTtcblx0XHRcdGlmICghdmlldykgdGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZmluZCB2aWV3IGZvciB0ZXN0IFwiJyArIHRlc3ROYW1lICsgJ1wiJyk7XG5cdFx0XHRyZXR1cm4gZXZhbCh2aWV3KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRQYXJ0aWFsKHRlc3ROYW1lKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gZ2V0Q29udGVudHModGVzdE5hbWUsICdwYXJ0aWFsJyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHQvLyBObyBiaWcgZGVhbC4gTm90IGFsbCB0ZXN0cyBuZWVkIHRvIHRlc3QgcGFydGlhbCBzdXBwb3J0LlxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldFRlc3QodGVzdE5hbWUpIHtcblx0XHRcdHZhciB0ZXN0ID0ge307XG5cdFx0XHR0ZXN0Lm5hbWUgPSB0ZXN0TmFtZTtcblx0XHRcdHRlc3QudmlldyA9IGdldFZpZXcodGVzdE5hbWUpO1xuXHRcdFx0dGVzdC50ZW1wbGF0ZSA9IGdldENvbnRlbnRzKHRlc3ROYW1lLCAnbXVzdGFjaGUnKTtcblx0XHRcdHRlc3QucGFydGlhbCA9IGdldFBhcnRpYWwodGVzdE5hbWUpO1xuXHRcdFx0dGVzdC5leHBlY3QgPSBnZXRDb250ZW50cyh0ZXN0TmFtZSwgJ3R4dCcpO1xuXHRcdFx0cmV0dXJuIHRlc3Q7XG5cdFx0fVxuXG5cdFx0dGVzdE5hbWVzID0gT2JqZWN0LmtleXMoc3BlYykuZmlsdGVyKGZ1bmN0aW9uIChuYW1lKSB7XG5cdFx0XHRyZXR1cm4gc3BlY1tuYW1lXS5qcyAhPSBudWxsO1xuXHRcdH0pO1xuXG5cdFx0dGVzdE5hbWVzLmZvckVhY2goZnVuY3Rpb24gKHRlc3ROYW1lKSB7XG5cdFx0XHR2YXIgdGVzdCA9IGdldFRlc3QodGVzdE5hbWUpO1xuXG5cdFx0XHR2YXIgZm4gPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0dmFyIHRwbDtcblxuXHRcdFx0XHRpZiAodGVzdC5wYXJ0aWFsKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnRocm93KFwiT29wcyEgcGFydGlhbCFcIik7XG5cdFx0XHRcdFx0Ly8gb3V0cHV0ID0gTXVzdGFjaGUucmVuZGVyKHRlc3QudGVtcGxhdGUsIHRlc3QudmlldywgeyBwYXJ0aWFsOiB0ZXN0LnBhcnRpYWwgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dHBsID0gbmV3IFRlbXBsZSh0ZXN0LnRlbXBsYXRlLCB0ZXN0LnZpZXcpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXNzZXJ0LmVxdWFsKHRwbC50b0hUTUwoKSwgdGVzdC5leHBlY3QpO1xuXHRcdFx0fVxuXG5cdFx0XHRmbi50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRyZXR1cm4gIHRlc3QudGVtcGxhdGUgKyBcIlxcbj09PT1cXG5cIiArXG5cdFx0XHRcdFx0Z2V0Q29udGVudHModGVzdC5uYW1lLCBcImpzXCIpICsgXCJcXG49PT09XFxuXCIgK1xuXHRcdFx0XHRcdHRlc3QuZXhwZWN0ICsgXCJcXG5cIjtcblx0XHRcdH1cblxuXHRcdFx0aXQoXCJrbm93cyBob3cgdG8gcmVuZGVyICdcIiArIHRlc3ROYW1lLnNwbGl0KFwiX1wiKS5qb2luKFwiIFwiKSArIFwiJ1wiLCBmbik7XG5cdFx0fSk7XG5cdH0pO1xufSk7IiwidmFyIGFzc2VydCA9IHJlcXVpcmUoXCJhc3NlcnRcIik7XG5cbmRlc2NyaWJlKFwiU2NvcGVcIiwgZnVuY3Rpb24oKSB7XG5cdHZhciBzY29wZTtcblxuXHRiZWZvcmUoZnVuY3Rpb24oKSB7XG5cdFx0c2NvcGUgPSBuZXcgVGVtcGxlLlNjb3BlKCk7XG5cdH0pO1xuXG5cdGJlZm9yZUVhY2goZnVuY3Rpb24oKSB7XG5cdFx0c2NvcGUuc2V0KFwiZm9vXCIsIFwiYmFyXCIpO1xuXHR9KTtcblxuXHRkZXNjcmliZShcIiNnZXQoKSAmICNzZXQoKVwiLCBmdW5jdGlvbigpIHtcblx0XHRpdChcInNldHMgZGF0YSBvbiBjb25zdHJ1Y3Rpb25cIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgc2NvcGUgPSBuZXcgVGVtcGxlKG51bGwsIHsgZm9vOiBcImJhclwiIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChzY29wZS5nZXQoKSwgeyBmb286IFwiYmFyXCIgfSk7XG5cdFx0fSk7XG5cblx0XHRpdChcInJldHVybnMgYHNjb3BlLnZhbHVlYCBvbiBudWxsIG9yIGVtcHR5IHBhdGhcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2NvcGUuZ2V0KCksIHNjb3BlLnZhbHVlKTtcblx0XHR9KTtcblxuXHRcdGl0KFwiZ2V0cyAmIHNldHMgc2hhbGxvdyBwYXRoXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0c2NvcGUuc2V0KFwiZm9vXCIsIHsgYmFyOiBcImJhelwiIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChzY29wZS5nZXQoXCJmb29cIiksIHsgYmFyOiBcImJhelwiIH0pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJnZXRzICYgc2V0cyBkZWVwIHBhdGhcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRzY29wZS5zZXQoXCJmb28uYmFyXCIsIFwiYmF6XCIpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKHNjb3BlLmdldChcImZvby5iYXJcIiksIFwiYmF6XCIpO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJnZXQocGF0aCkgZXhlY3V0ZXMgZnVuY3Rpb24gdmFsdWUgaWZmIHZhbHVlIGF0IHBhdGggaXMgZnVuY3Rpb25cIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRzY29wZS5zZXQoXCJmb29cIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGlzLCBzY29wZSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzY29wZS5nZXQoXCJmb29cIiksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJkZWVwIGNvcGllcyBnZW5lcmljIG9iamVjdHMgb24gc2V0XCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dmFyIGRhdGEgPSB7IGJhcjogeyBiYXo6IFwiYnV6XCIgfSB9O1xuXHRcdFx0c2NvcGUuc2V0KFwiZm9vXCIsIGRhdGEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChzY29wZS5nZXQoXCJmb29cIiksIGRhdGEpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNjb3BlLmdldChcImZvb1wiKSwgZGF0YSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc2NvcGUuZ2V0KFwiZm9vLmJhclwiKSwgZGF0YS5mb28pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJkaXJlY3RseSBwb2ludHMgdG8gbm9uLWdlbmVyaWMgb2JqZWN0cyBvbiBzZXRcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgZGF0YSA9IFtdO1xuXHRcdFx0c2NvcGUuc2V0KFwiZm9vXCIsIGRhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNjb3BlLmdldChcImZvb1wiKSwgZGF0YSk7XG5cdFx0fSk7XG5cblx0XHRpdChcInVuc2V0c1wiLCBmdW5jdGlvbigpIHtcblx0XHRcdHNjb3BlLnVuc2V0KFwiZm9vXCIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBzY29wZS5nZXQoXCJmb29cIiksIFwidW5kZWZpbmVkXCIpO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJvbmx5IHVuc2V0cyBkZWVwbHkgb24gZ2VuZXJpYyBvYmplY3RzXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0c2NvcGUuc2V0KFwiZm9vXCIsIFsgMCwgMSwgMiBdKTtcblx0XHRcdGFzc2VydC5lcXVhbChzY29wZS5nZXQoXCJmb28ubGVuZ3RoXCIpLCAzKTtcblx0XHRcdHNjb3BlLnVuc2V0KFwiZm9vLmxlbmd0aFwiKTtcblx0XHRcdGFzc2VydC5lcXVhbChzY29wZS5nZXQoXCJmb28ubGVuZ3RoXCIpLCAzKTtcblx0XHR9KTtcblxuXHRcdGl0KFwidW5zZXQoKSBzZXRzIGB0aGlzLmRhdGFgIHRvIHVuZGVmaW5lZCBvbiBudWxsIG9yIGVtcHR5IHBhdGhcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRzY29wZS51bnNldCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBzY29wZS5kYXRhLCBcInVuZGVmaW5lZFwiKTtcblx0XHR9KTtcblx0fSk7XG5cblx0ZGVzY3JpYmUoXCIjb2JzZXJ2ZSgpXCIsIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBvO1xuXG5cdFx0YWZ0ZXJFYWNoKGZ1bmN0aW9uKCkge1xuXHRcdFx0aWYgKG8gIT0gbnVsbCkge1xuXHRcdFx0XHRvLnN0b3AoKTtcblx0XHRcdFx0byA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpdChcInN1Y2Nlc3NmdWxseSBhZGRzICYgcmVtb3ZlcyBvYnNlcnZlclwiLCBmdW5jdGlvbigpIHtcblx0XHRcdG8gPSBzY29wZS5vYnNlcnZlKFwiZm9vXCIsIGZ1bmN0aW9uKCl7fSk7XG5cdFx0XHRhc3NlcnQub2sobyk7XG5cdFx0XHRvLnN0b3AoKTtcblx0XHR9KTtcblxuXHRcdGl0KFwib2JzZXJ2ZXMgbm90aGluZyB3aGVuIG5vdGhpbmcgY2hhbmdlc1wiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gc2NvcGUub2JzZXJ2ZShcImZvb1wiLCBmdW5jdGlvbigpIHsgc2VlbiA9IHRydWU7IH0pO1xuXHRcdFx0c2NvcGUuc2V0KFwiZm9vXCIsIFwiYmFyXCIpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFzZWVuKTtcblx0XHR9KTtcblxuXHRcdGl0KFwib2JzZXJ2ZXMgc3RhdGljIHBhdGggY2hhbmdlc1wiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gc2NvcGUub2JzZXJ2ZShcImZvby5iYXJcIiwgZnVuY3Rpb24obnZhbCwgb3ZhbCwgcGF0aCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnZhbCwgXCJiYXpcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2Ygb3ZhbCwgXCJ1bmRlZmluZWRcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLCBcImZvby5iYXJcIik7XG5cdFx0XHRcdHNlZW4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNjb3BlLnNldChcImZvb1wiLCB7IGJhcjogXCJiYXpcIiB9KTtcblx0XHRcdGFzc2VydC5vayhzZWVuKTtcblx0XHR9KTtcblxuXHRcdGl0KFwib2JzZXJ2ZXMgdW5zZXRcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHR2YXIgc2VlbiA9IGZhbHNlO1xuXHRcdFx0byA9IHNjb3BlLm9ic2VydmUoXCJmb29cIiwgZnVuY3Rpb24obnZhbCwgb3ZhbCwgcGF0aCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIG52YWwsIFwidW5kZWZpbmVkXCIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3ZhbCwgXCJiYXJcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLCBcImZvb1wiKTtcblx0XHRcdFx0c2VlbiA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0c2NvcGUudW5zZXQoXCJmb29cIik7XG5cdFx0XHRhc3NlcnQub2soc2Vlbik7XG5cdFx0fSk7XG5cblx0XHRpdChcIm9ic2VydmVzIGR5bmFtaWMgcGF0aDogKlwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gc2NvcGUub2JzZXJ2ZShcIipcIiwgZnVuY3Rpb24obnZhbCwgb3ZhbCwgcGF0aCkge1xuXHRcdFx0XHRhc3NlcnQuZGVlcEVxdWFsKG52YWwsIHsgYmFyOiBcImJhelwiIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3ZhbCwgXCJiYXJcIik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXRoLCBcImZvb1wiKTtcblx0XHRcdFx0c2VlbiA9IHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdFx0c2NvcGUuc2V0KFwiZm9vXCIsIHsgYmFyOiBcImJhelwiIH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlZW4pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJvYnNlcnZlcyBkeW5hbWljIHBhdGg6ICouYmFyLmJhelwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gc2NvcGUub2JzZXJ2ZShcIiouYmFyLmJhelwiLCBmdW5jdGlvbihudmFsLCBvdmFsLCBwYXRoKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChudmFsLCBcImJ1elwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBvdmFsLCBcInVuZGVmaW5lZFwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgsIFwiZm9vLmJhci5iYXpcIik7XG5cdFx0XHRcdHNlZW4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNjb3BlLnNldChcImZvby5iYXIuYmF6XCIsIFwiYnV6XCIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlZW4pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJvYnNlcnZlcyBkeW5hbWljIHBhdGg6IGZvby4qLmJhelwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gc2NvcGUub2JzZXJ2ZShcImZvby4qLmJhelwiLCBmdW5jdGlvbihudmFsLCBvdmFsLCBwYXRoKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChudmFsLCBcImJ1elwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBvdmFsLCBcInVuZGVmaW5lZFwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgsIFwiZm9vLmJhci5iYXpcIik7XG5cdFx0XHRcdHNlZW4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNjb3BlLnNldChcImZvby5iYXIuYmF6XCIsIFwiYnV6XCIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlZW4pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJvYnNlcnZlcyBkeW5hbWljIHBhdGg6IGZvby5iYXIuKlwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gc2NvcGUub2JzZXJ2ZShcImZvby5iYXIuKlwiLCBmdW5jdGlvbihudmFsLCBvdmFsLCBwYXRoKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChudmFsLCBcImJ1elwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBvdmFsLCBcInVuZGVmaW5lZFwiKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhdGgsIFwiZm9vLmJhci5iYXpcIik7XG5cdFx0XHRcdHNlZW4gPSB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdHNjb3BlLnNldChcImZvby5iYXIuYmF6XCIsIFwiYnV6XCIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlZW4pO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJjYWxsaW5nIGdldCgpIGluIGFuIG9ic2VydmVyIHJldHVybnMgdGhlIG5ldyB2YWx1ZVwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBzZWVuID0gZmFsc2U7XG5cdFx0XHRvID0gc2NvcGUub2JzZXJ2ZShcImZvby5iYXJcIiwgZnVuY3Rpb24obnZhbCwgb3ZhbCwgcGF0aCkge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpcy5nZXQocGF0aCksIG52YWwpO1xuXHRcdFx0XHRzZWVuID0gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRzY29wZS5zZXQoXCJmb28uYmFyXCIsIFwiYmF6XCIpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlZW4pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRkZXNjcmliZShcIiNzcGF3bigpICYgbmVzdGVkIHNjb3BlXCIsIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBjaGlsZDtcblxuXHRcdGJlZm9yZUVhY2goZnVuY3Rpb24oKSB7XG5cdFx0XHRjaGlsZCA9IHNjb3BlLnNwYXduKCk7XG5cdFx0XHRjaGlsZC5zZXQoXCJiYXJcIiwgXCJiYXpcIik7XG5cdFx0fSk7XG5cblx0XHRhZnRlckVhY2goZnVuY3Rpb24oKSB7XG5cdFx0XHRjaGlsZC5jbG9zZSgpO1xuXHRcdFx0Y2hpbGQgPSBudWxsO1xuXHRcdH0pO1xuXG5cdFx0aXQoXCJzY29wZS5zcGF3bigpIHJldHVybnMgYW4gaW5zdGFuY2Ugb2YgVGVtcGxlLlNjb3BlIHdob3NlIHBhcmVudCBpcyBzY29wZVwiLCBmdW5jdGlvbigpIHtcblx0XHRcdGFzc2VydC5vayhjaGlsZCBpbnN0YW5jZW9mIFRlbXBsZS5TY29wZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hpbGQucGFyZW50LCBzY29wZSk7XG5cdFx0fSk7XG5cblx0XHRpdChcImNoaWxkIHNjb3BlIHJldHVybnMgcGFyZW50IHZhbHVlIGF0IHBhdGggaWZmIGNoaWxkIHZhbHVlIGF0IHBhdGggaXMgdW5kZWZpbmVkXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0YXNzZXJ0LmVxdWFsKGNoaWxkLmdldChcImJhclwiKSwgXCJiYXpcIik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGNoaWxkLnZhbHVlLmZvbywgXCJ1bmRlZmluZWRcIik7XG5cdFx0XHRhc3NlcnQuZXF1YWwoY2hpbGQuZ2V0KFwiZm9vXCIpLCBcImJhclwiKTtcblx0XHR9KTtcblxuXHRcdGl0KFwiZGVzdHJveWluZyBwYXJlbnQgc2NvcGUgZGV0YWNoZXMgaXQgZnJvbSBjaGlsZHJlblwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHZhciBncmFuZGNoaWxkID0gY2hpbGQuc3Bhd24oKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChncmFuZGNoaWxkLnBhcmVudCwgY2hpbGQpO1xuXG5cdFx0XHRjaGlsZC5jbG9zZSgpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKGdyYW5kY2hpbGQucGFyZW50LCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGlsZC5jbG9zZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0Lm5vdEVxdWFsKGdyYW5kY2hpbGQuY2xvc2VkLCB0cnVlKTtcblx0XHRcdGdyYW5kY2hpbGQuY2xvc2UoKTtcblx0XHR9KTtcblx0fSk7XG59KTsiXX0=
