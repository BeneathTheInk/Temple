/*
 * Temple (with Source Map)
 * (c) 2014-2015 Beneath the Ink, Inc.
 * Copyright (C) 2011--2015 Meteor Development Group
 * MIT License
 * Version 0.5.0
 */

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Temple = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
//////////////////////////////////////////////////
// This is a heavily modified version of Meteor's DOMRange //
// Last merge: https://github.com/meteor/meteor/blob/405009a2c3dcd3c1fe780adb2867d38a6a42fff1/packages/blaze/domrange.js //
//////////////////////////////////////////////////

var _ = require("underscore"),
	Events = require("./events"),
	util = require("./util");

function isArrayLike(a) {
	return a != null && typeof a.length === "number";
}

// `[new] Blaze._DOMRange([nodeAndRangeArray])`
//
// A DOMRange consists of an array of consecutive nodes and DOMRanges,
// which may be replaced at any time with a new array.  If the DOMRange
// has been attached to the DOM at some location, then updating
// the array will cause the DOM to be updated at that location.
function DOMRange(nodeAndRangeArray) {
	// called without `new`
	if (!(this instanceof DOMRange)) {
		return new DOMRange(nodeAndRangeArray);
	}

	var members = (nodeAndRangeArray || []);
	if (!isArrayLike(members)) throw new Error("Expected array");

	for (var i = 0; i < members.length; i++) {
		this._memberIn(members[i]);
	}

	this.members = members;
	this.placeholder = null;
	this.attached = false;
	this.parentElement = null;
	this.parentRange = null;
};

module.exports = DOMRange;
DOMRange.extend = util.subclass;

// finds the DOMRange the element is a part of
DOMRange.forElement = function (elem) {
	if (elem.nodeType !== 1) throw new Error("Expected element, found: " + elem);
	
	var range = null;
	
	while (elem && !range) {
		range = (elem.$domrange || null);
		elem = elem.parentNode;
	}

	return range;
};

_.extend(DOMRange.prototype, Events, {

	// This method is called to insert the DOMRange into the DOM for
	// the first time, but it's also used internally when
	// updating the DOM.
	// If _isMove is true, move this attached range to a different
	// location under the same parentElement.
	attach: function(parentElement, nextNode, _isMove, _isReplace) {
		if (typeof parentElement === "string") parentElement = document.querySelector(parentElement);
		if (typeof nextNode === "string") nextNode = parent.querySelector(nextNode);
		if (parentElement == null) throw new Error("Expecting a valid DOM element to attach in.");

		if ((_isMove || _isReplace) && !(this.parentElement === parentElement && this.attached)) {
			throw new Error("Can only move or replace an attached DOMRange, and only under the same parent element");
		}

		var members = this.members;
		if (members.length) {
			this.placeholder = null;
			for (var i = 0; i < members.length; i++) {
				insertIntoDOM(members[i], parentElement, nextNode, _isMove);
			}
		} else {
			var placeholder = placeholderNode();
			this.placeholder = placeholder;
			parentElement.insertBefore(placeholder, nextNode);
		}

		this.attached = true;
		this.parentElement = parentElement;

		// trigger events only on fresh attachments
		if (!(_isMove || _isReplace)) this.trigger("attach", parentElement);

		return this;
	},

	detach: function(_isReplace) {
		if (!this.attached) return this;

		var oldParentElement = this.parentElement;
		var members = this.members;
		if (members.length) {
			for (var i = 0; i < members.length; i++) {
				removeFromDOM(members[i]);
			}
		} else {
			var placeholder = this.placeholder;
			this.parentElement.removeChild(placeholder);
			this.placeholder = null;
		}

		if (!_isReplace) {
			this.attached = false;
			this.parentElement = null;
			this.trigger("detach", oldParentElement);
		}
	},

	firstNode: function() {
		if (!this.attached) throw new Error("Must be attached");
		if (!this.members.length) return this.placeholder;
		var m = this.members[0];
		return (m instanceof DOMRange) ? m.firstNode() : m;
	},

	lastNode: function() {
		if (!this.attached) throw new Error("Must be attached");
		if (!this.members.length) return this.placeholder;
		var m = this.members[this.members.length - 1];
		return (m instanceof DOMRange) ? m.lastNode() : m;
	},

	getMember: function(atIndex) {
		var members = this.members;
		if (!(atIndex >= 0 && atIndex < members.length)) {
			throw new Error("Bad index in range.getMember: " + atIndex);
		}
		return this.members[atIndex];
	},

	// resets the DOMRange with new content
	setMembers: function(newNodeAndRangeArray) {
		var newMembers = newNodeAndRangeArray;
		if (!isArrayLike(newMembers)) throw new Error("Expected array");
		var oldMembers = this.members;
		var _isReplace = this.attached && (newMembers.length || oldMembers.length);

		// dereference old members
		for (var i = 0; i < oldMembers.length; i++) this._memberOut(oldMembers[i], false, _isReplace);

		// reference new members
		for (var i = 0; i < newMembers.length; i++) this._memberIn(newMembers[i]);

		if (_isReplace) {
			// detach the old members and insert the new members
			var nextNode = this.lastNode().nextSibling;
			var parentElement = this.parentElement;
			// Use detach/attach, but don't trigger events
			this.detach(true /*_isReplace*/);
			this.members = newMembers;
			this.attach(parentElement, nextNode, false, true /*_isReplace*/);
		} else {
			// don't do anything if we're going from empty to empty
			this.members = newMembers;
		}

		return this;
	},

	addMember: function(newMember, atIndex, _isMove) {
		var members = this.members;
		
		// validate the index
		if (typeof atIndex !== "number" || isNaN(atIndex) ||
			atIndex < 0 || atIndex > members.length) {
			atIndex = members.length;
		}

		// add references to the new member
		if (!_isMove) this._memberIn(newMember);

		// currently detached; just updated members
		if (!this.attached) {
			members.splice(atIndex, 0, newMember);
		}

		// empty; use the empty-to-nonempty handling of setMembers
		else if (members.length === 0) {
			this.setMembers([ newMember ]);
		}

		// otherwise add at location
		else {
			var nextNode;
			if (atIndex === members.length) {
				// insert at end
				nextNode = this.lastNode().nextSibling;
			} else {
				var m = members[atIndex];
				nextNode = (m instanceof DOMRange) ? m.firstNode() : m;
			}

			members.splice(atIndex, 0, newMember);
			insertIntoDOM(newMember, this.parentElement, nextNode, _isMove);
		}

		return this;
	},

	removeMember: function(atIndex, _isMove) {
		var members = this.members;
		
		// also accepts the member to remove
		if (typeof atIndex !== "number" || isNaN(atIndex)) {
			atIndex = this.indexOf(atIndex);
		}

		// validate the index
		if (atIndex < 0 || atIndex >= members.length) {
			throw new Error("Bad index in range.removeMember: " + atIndex);
		}

		if (_isMove) {
			members.splice(atIndex, 1);
		} else {
			var oldMember = members[atIndex];

			if (members.length === 1) {
				// becoming empty; use the logic in setMembers
				this.setMembers([]);
			} else {
				this._memberOut(oldMember);
				members.splice(atIndex, 1);
				if (this.attached) removeFromDOM(oldMember);
			}
		}

		return this;
	},

	moveMember: function(oldIndex, newIndex) {
		var member = this.members[oldIndex];
		this.removeMember(oldIndex, true /*_isMove*/);
		this.addMember(member, newIndex, true /*_isMove*/);
		return this;
	},

	indexOf: function(member) {
		return this.members.indexOf(member);
	},

	contains: function(member) {
		return this.indexOf(member) > -1;
	},

	_memberIn: function(m) {
		if (m instanceof DOMRange) {
			m.parentRange = this;
		} else if (m.nodeType === 1) { // DOM Element
			m.$domrange = this;
		}
	},

	_memberOut: function (m, _skipNodes, _isReplace) {
		if (m instanceof DOMRange) {
			if (_isReplace) m.destroyMembers(_skipNodes, _isReplace);
			else m.destroy(_skipNodes);
		}

		else if (!_skipNodes && m.nodeType === 1 && m.$domrange) {
			m.$domrange = null;
		}
	},

	// Tear down, but don't remove, the members.  Used when chunks
	// of DOM are being torn down or replaced.
	destroyMembers: function(_skipNodes, _isReplace) {
		var members = this.members;
		for (var i = 0; i < members.length; i++) {
			this._memberOut(members[i], _skipNodes, _isReplace);
		}
		return this;
	},

	destroy: function(_skipNodes) {
		this.detach();
		this.trigger("destroy", _skipNodes);
		this.destroyMembers(_skipNodes);
		this.members = [];
		return this;
	},

	containsElement: function(elem) {
		if (!this.attached) throw new Error("Must be attached");

		// An element is contained in this DOMRange if it's possible to
		// reach it by walking parent pointers, first through the DOM and
		// then parentRange pointers.  In other words, the element or some
		// ancestor of it is at our level of the DOM (a child of our
		// parentElement), and this element is one of our members or
		// is a member of a descendant Range.

		// First check that elem is a descendant of this.parentElement,
		// according to the DOM.
		if (!elementContains(this.parentElement, elem)) return false;

		// If elem is not an immediate child of this.parentElement,
		// walk up to its ancestor that is.
		while (elem.parentNode !== this.parentElement) elem = elem.parentNode;

		var range = elem.$domrange;
		while (range && range !== this) {
			range = range.parentRange;
		}

		return range === this;
	},

	containsRange: function(range) {
		if (!this.attached) throw new Error("Must be attached");
		if (!range.attached) return false;

		// A DOMRange is contained in this DOMRange if it's possible
		// to reach this range by following parent pointers.  If the
		// DOMRange has the same parentElement, then it should be
		// a member, or a member of a member etc.  Otherwise, we must
		// contain its parentElement.

		if (range.parentElement !== this.parentElement) {
			return this.containsElement(range.parentElement);
		}

		// don't contain self
		if (range === this) return false;

		while (range && range !== this) {
			range = range.parentRange;
		}

		return range === this;
	},

	findAll: function(selector) {
		var matches = [],
			el;

		for (var i in this.members) {
			el = this.members[i];
			if (el instanceof DOMRange) {
				matches.push.apply(matches, el.findAll(selector));
			} else if (typeof el.querySelectorAll === "function") {
				if (el.nodeType === 1 && util.matchesSelector(el, selector)) matches.push(el);
				matches.push.apply(matches, el.querySelectorAll(selector));
			}
		}

		return matches
	},

	find: function(selector) {
		var el, res;

		for (var i in this.members) {
			el = this.members[i];
			if (el instanceof DOMRange) {
				res = el.find(selector);
			} else if (el.nodeType === 1 && util.matchesSelector(el, selector)) {
				res = el;
			} else if (typeof el.querySelector === "function") {
				res = el.querySelector(selector);
			}

			if (res != null) return res;
		}

		return null;
	}

});

// Returns true if element a contains node b and is not node b.
//
// The restriction that `a` be an element (not a document fragment,
// say) is based on what's easy to implement cross-browser.
function elementContains(a, b) {
	if (a.nodeType !== 1) return false;
	if (a === b) return false;

	if (a.compareDocumentPosition) {
		return a.compareDocumentPosition(b) & 0x10;
	} else {
		// Should be only old IE and maybe other old browsers here.
		// Modern Safari has both functions but seems to get contains() wrong.
		// IE can't handle b being a text node.  We work around this
		// by doing a direct parent test now.
		b = b.parentNode;
		if (!(b && b.nodeType === 1)) // ELEMENT
			return false;
		if (a === b)
			return true;

		return a.contains(b);
	}
};

// In IE 8, don't use empty text nodes as placeholders
// in empty DOMRanges, use comment nodes instead.  Using
// empty text nodes in modern browsers is great because
// it doesn't clutter the web inspector.  In IE 8, however,
// it seems to lead in some roundabout way to the OAuth
// pop-up crashing the browser completely.  In the past,
// we didn't use empty text nodes on IE 8 because they
// don't accept JS properties, so just use the same logic
// even though we don't need to set properties on the
// placeholder anymore.
var USE_COMMENT_PLACEHOLDERS = (function () {
	var result = false;
	var textNode = document.createTextNode("");
	try {
		textNode.someProp = true;
	} catch (e) {
		// IE 8
		result = true;
	}
	return result;
})();

function placeholderNode() {
	return USE_COMMENT_PLACEHOLDERS ?
		document.createComment("") :
		document.createTextNode("");
}

// private methods
function insertIntoDOM(rangeOrNode, parentElement, nextNode, _isMove) {
	var m = rangeOrNode;
	if (m instanceof DOMRange) {
		m.attach(parentElement, nextNode, _isMove);
	} else {
		if (_isMove) {
			moveNodeWithHooks(m, parentElement, nextNode);
		} else {
			insertNodeWithHooks(m, parentElement, nextNode);
		}
	}
};

function removeFromDOM(rangeOrNode) {
	var m = rangeOrNode;
	if (m instanceof DOMRange) {
		m.detach();
	} else {
		removeNodeWithHooks(m);
	}
};

function removeNodeWithHooks(n) {
	if (!n.parentNode) return;
	if (n.nodeType === 1 && n.parentNode._uihooks && n.parentNode._uihooks.removeElement) {
		n.parentNode._uihooks.removeElement(n);
	} else {
		n.parentNode.removeChild(n);
	}
};

function insertNodeWithHooks(n, parent, next) {
	// `|| null` because IE throws an error if 'next' is undefined
	next = next || null;
	if (n.nodeType === 1 && parent._uihooks && parent._uihooks.insertElement) {
		parent._uihooks.insertElement(n, next);
	} else {
		parent.insertBefore(n, next);
	}
};

function moveNodeWithHooks(n, parent, next) {
	if (n.parentNode !== parent)
		return;
	// `|| null` because IE throws an error if 'next' is undefined
	next = next || null;
	if (n.nodeType === 1 && parent._uihooks && parent._uihooks.moveElement) {
		parent._uihooks.moveElement(n, next);
	} else {
		parent.insertBefore(n, next);
	}
};
},{"./events":2,"./util":13,"underscore":17}],2:[function(require,module,exports){
var _ = require("underscore");

// Backbone.Events
// ---------------

// A module that can be mixed in to *any object* in order to provide it with
// custom events. You may bind with `on` or remove with `off` callback
// functions to an event; `trigger`-ing an event fires all callbacks in
// succession.
//
//     var object = {};
//     _.extend(object, Backbone.Events);
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
_.each(listenMethods, function(implementation, method) {
	Events[method] = function(obj, name, callback) {
		var listeningTo = this._listeningTo || (this._listeningTo = {});
		var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
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
	for (var key in obj) if (_.has(obj, key)) return false;
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
},{"underscore":17}],3:[function(require,module,exports){
var _ = require("underscore"),
	Trackr = require("trackr"),
	parse = require("./m+xml").parse,
	NODE_TYPE = require("./types"),
	track = require("./track");

// properties that Node.js and the browser can handle
var Temple = module.exports = _.defaults({
	VERSION: "0.5.0",
	NODE_TYPE: NODE_TYPE,

	// other parts
	util: require("./util"),
	Events: require("./events"),
	Model: require("./model"),

	// trackr short pointers
	Trackr: Trackr,
	Dependency: Trackr.Dependency,
	autorun: Trackr.autorun,

	// all the parsers, declared here for easier access
	parse: parse,
	parsePath: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "path" }));
	},
	parsePathQuery: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "pathQuery" }));
	},
	parseAttributeValue: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "attrValue" }));
	},
	parseArguments: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "attrArguments" }));
	},

	// converts raw html str to template tree
	parseHTML: function(str) {
		return {
			type: NODE_TYPE.ROOT,
			children: [ {
				type: NODE_TYPE.HTML,
				value: str
			} ],
			version: Temple.VERSION
		};
	}
}, track);

// no need for node js to hurt itself on any hard edges
if (typeof document === "undefined") return;

// load the real class for the browser
Temple = module.exports = _.extend(require("./mustache"), module.exports);

// load the plugin API
_.extend(Temple, require("./plugins"));

// and attach the rest of the parts that Node can't use
Temple.DOMRange = require("./domrange");
Temple.View = require("./view");
Temple.Section = require("./section");
},{"./domrange":1,"./events":2,"./m+xml":4,"./model":5,"./mustache":6,"./plugins":8,"./section":10,"./track":11,"./types":12,"./util":13,"./view":14,"trackr":16,"underscore":17}],4:[function(require,module,exports){
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

        peg$startRuleFunctions = { start: peg$parsestart, attrValue: peg$parseattrValue, attrArguments: peg$parseattrArguments, pathQuery: peg$parsepathQuery, path: peg$parsepath },
        peg$startRuleFunction  = peg$parsestart,

        peg$c0 = function(html) {
        	return {
        		type: NODE_TYPE.ROOT,
        		children: html,
        		version: Mustache.VERSION
        	}
        },
        peg$c1 = [],
        peg$c2 = function(nodes) { return _.compact(nodes); },
        peg$c3 = peg$FAILED,
        peg$c4 = /^[^<{]/,
        peg$c5 = { type: "class", value: "[^<{]", description: "[^<{]" },
        peg$c6 = function(text) { return { type: NODE_TYPE.TEXT, value: text.join("") }; },
        peg$c7 = "<!--",
        peg$c8 = { type: "literal", value: "<!--", description: "\"<!--\"" },
        peg$c9 = "-->",
        peg$c10 = { type: "literal", value: "-->", description: "\"-->\"" },
        peg$c11 = function(v) {
        		return { type: NODE_TYPE.XCOMMENT, value: v.trim() };
        	},
        peg$c12 = void 0,
        peg$c13 = { type: "any", description: "any character" },
        peg$c14 = null,
        peg$c15 = function(l, r) { return l + (r != null ? r : ""); },
        peg$c16 = function(start, nodes, end) {
        		if (start.name.toLowerCase() !== end.toLowerCase()) {
        			throw new Error("Element tag mismatch: " + start.name + " !== " + end);
        		}

        		start.type = NODE_TYPE.ELEMENT;
        		start.children = nodes;
        		return start;
        	},
        peg$c17 = "<",
        peg$c18 = { type: "literal", value: "<", description: "\"<\"" },
        peg$c19 = "/>",
        peg$c20 = { type: "literal", value: "/>", description: "\"/>\"" },
        peg$c21 = function(tagname, attributes) {
        		return {
        			name: tagname,
        			type: NODE_TYPE.ELEMENT,
        			attributes: attributes,
        			children: []
        		}
        	},
        peg$c22 = ">",
        peg$c23 = { type: "literal", value: ">", description: "\">\"" },
        peg$c24 = function(tagname, attributes) {
        		return { name: tagname, attributes: attributes };
        	},
        peg$c25 = "</",
        peg$c26 = { type: "literal", value: "</", description: "\"</\"" },
        peg$c27 = function(tagname) { return tagname; },
        peg$c28 = "=",
        peg$c29 = { type: "literal", value: "=", description: "\"=\"" },
        peg$c30 = function(key, value) {
        		value = value != null ? value[2] : "";
        		
        		return {
        			type: NODE_TYPE.ATTRIBUTE,
        			name: key,
        			value: value,
        			children: parse(value, _.extend({}, options, { startRule: "attrValue" })),
        			arguments: parse(value,  _.extend({}, options, { startRule: "attrArguments" }))
        		}
        	},
        peg$c31 = ",",
        peg$c32 = { type: "literal", value: ",", description: "\",\"" },
        peg$c33 = function(l, r) { return r != null && r[1] != null ? [l].concat(r[1]) : [l]; },
        peg$c34 = function(v) { return v; },
        peg$c35 = /^[^,]/,
        peg$c36 = { type: "class", value: "[^,]", description: "[^,]" },
        peg$c37 = function(v) { return v.trim(); },
        peg$c38 = function(val) {
        		if (_.isObject(val)) return val;
        		else return { type: NODE_TYPE.LITERAL, value: val };
        	},
        peg$c39 = /^[,]/,
        peg$c40 = { type: "class", value: "[,]", description: "[,]" },
        peg$c41 = function(start, nodes, end) {
        		if (options.strict && !_.isEqual(start.value.raw, end)) {
        			throw new Error("Section tag mismatch: " + start.value.raw + " !== " + end);
        		}

        		start.value = start.value.result;
        		start.children = nodes;
        		return start;
        	},
        peg$c42 = "{{",
        peg$c43 = { type: "literal", value: "{{", description: "\"{{\"" },
        peg$c44 = /^[#\^]/,
        peg$c45 = { type: "class", value: "[#\\^]", description: "[#\\^]" },
        peg$c46 = "}}",
        peg$c47 = { type: "literal", value: "}}", description: "\"}}\"" },
        peg$c48 = function(type, value) {
        		return {
        			type: NODE_TYPE[type === "#" ? "SECTION" : "INVERTED"],
        			value: value
        		}
        	},
        peg$c49 = "{{/",
        peg$c50 = { type: "literal", value: "{{/", description: "\"{{/\"" },
        peg$c51 = /^[^}]/,
        peg$c52 = { type: "class", value: "[^}]", description: "[^}]" },
        peg$c53 = function(value) { return value.join(""); },
        peg$c54 = "{{{",
        peg$c55 = { type: "literal", value: "{{{", description: "\"{{{\"" },
        peg$c56 = "}}}",
        peg$c57 = { type: "literal", value: "}}}", description: "\"}}}\"" },
        peg$c58 = function(value) {
        		return {
        			type: NODE_TYPE.INTERPOLATOR,
        			value: value[1]
        		}
        	},
        peg$c59 = /^[\/#{!>\^]/,
        peg$c60 = { type: "class", value: "[\\/#{!>\\^]", description: "[\\/#{!>\\^]" },
        peg$c61 = "&",
        peg$c62 = { type: "literal", value: "&", description: "\"&\"" },
        peg$c63 = function(m, value) {
        		return {
        			type: m ? NODE_TYPE.TRIPLE : NODE_TYPE.INTERPOLATOR,
        			value: value
        		}
        	},
        peg$c64 = function(value) {
        		return {
        			type: NODE_TYPE.TRIPLE,
        			value: value
        		}
        	},
        peg$c65 = /^[!>]/,
        peg$c66 = { type: "class", value: "[!>]", description: "[!>]" },
        peg$c67 = function(m, value) {
        		return {
        			type: m === ">" ? NODE_TYPE.PARTIAL : NODE_TYPE.MCOMMENT,
        			value: value.join("").trim()
        		}
        	},
        peg$c68 = "|",
        peg$c69 = { type: "literal", value: "|", description: "\"|\"" },
        peg$c70 = function(m) { return { raw: text(), result: m } },
        peg$c71 = function(p, c) {
        		if (p == null) p = { type: "all" };
        		p.parts = c;
        		return p;
        	},
        peg$c72 = function(p) { p.parts = []; return p; },
        peg$c73 = "../",
        peg$c74 = { type: "literal", value: "../", description: "\"../\"" },
        peg$c75 = function(d) { return { type: "parent", distance: d.length }; },
        peg$c76 = "./",
        peg$c77 = { type: "literal", value: "./", description: "\"./\"" },
        peg$c78 = function() { return { type: "local" }; },
        peg$c79 = ".",
        peg$c80 = { type: "literal", value: ".", description: "\".\"" },
        peg$c81 = "/",
        peg$c82 = { type: "literal", value: "/", description: "\"/\"" },
        peg$c83 = function() { return { type: "root" }; },
        peg$c84 = /^[a-z0-9$_]/i,
        peg$c85 = { type: "class", value: "[a-z0-9$_]i", description: "[a-z0-9$_]i" },
        peg$c86 = /^[a-z0-9:\-_$]/i,
        peg$c87 = { type: "class", value: "[a-z0-9:\\-_$]i", description: "[a-z0-9:\\-_$]i" },
        peg$c88 = function(k, c) { return { key: k, children: c } },
        peg$c89 = "[",
        peg$c90 = { type: "literal", value: "[", description: "\"[\"" },
        peg$c91 = "]",
        peg$c92 = { type: "literal", value: "]", description: "\"]\"" },
        peg$c93 = function(c) { return c; },
        peg$c94 = "true",
        peg$c95 = { type: "literal", value: "true", description: "\"true\"" },
        peg$c96 = function() { return true; },
        peg$c97 = "false",
        peg$c98 = { type: "literal", value: "false", description: "\"false\"" },
        peg$c99 = function() { return false; },
        peg$c100 = "-",
        peg$c101 = { type: "literal", value: "-", description: "\"-\"" },
        peg$c102 = /^[0-9]/,
        peg$c103 = { type: "class", value: "[0-9]", description: "[0-9]" },
        peg$c104 = function() { return parseFloat(text(), 10); },
        peg$c105 = function() { return parseInt(text(), 10); },
        peg$c106 = "\"",
        peg$c107 = { type: "literal", value: "\"", description: "\"\\\"\"" },
        peg$c108 = /^[^"]/,
        peg$c109 = { type: "class", value: "[^\"]", description: "[^\"]" },
        peg$c110 = function(v) { return v.join(""); },
        peg$c111 = "'",
        peg$c112 = { type: "literal", value: "'", description: "\"'\"" },
        peg$c113 = /^[^']/,
        peg$c114 = { type: "class", value: "[^']", description: "[^']" },
        peg$c115 = "null",
        peg$c116 = { type: "literal", value: "null", description: "\"null\"" },
        peg$c117 = function() { return null; },
        peg$c118 = "undefined",
        peg$c119 = { type: "literal", value: "undefined", description: "\"undefined\"" },
        peg$c120 = "void",
        peg$c121 = { type: "literal", value: "void", description: "\"void\"" },
        peg$c122 = /^[,; \t\n\r]/,
        peg$c123 = { type: "class", value: "[,; \\t\\n\\r]", description: "[,; \\t\\n\\r]" },
        peg$c124 = function() { return void 0; },
        peg$c125 = /^[a-z0-9_\-]/i,
        peg$c126 = { type: "class", value: "[a-z0-9_\\-]i", description: "[a-z0-9_\\-]i" },
        peg$c127 = function(k) { return k; },
        peg$c128 = { type: "other", description: "whitespace" },
        peg$c129 = /^[ \t\n\r]/,
        peg$c130 = { type: "class", value: "[ \\t\\n\\r]", description: "[ \\t\\n\\r]" },
        peg$c131 = "\\",
        peg$c132 = { type: "literal", value: "\\", description: "\"\\\\\"" },
        peg$c133 = function(char) { return char; },

        peg$currPos          = 0,
        peg$reportedPos      = 0,
        peg$cachedPos        = 0,
        peg$cachedPosDetails = { line: 1, column: 1, seenCR: false },
        peg$maxFailPos       = 0,
        peg$maxFailExpected  = [],
        peg$silentFails      = 0,

        peg$result;

    if ("startRule" in options) {
      if (!(options.startRule in peg$startRuleFunctions)) {
        throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
      }

      peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
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

    function peg$parsestart() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parsehtml();
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c0(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsehtml() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parsesection();
      if (s2 === peg$FAILED) {
        s2 = peg$parseextraStache();
        if (s2 === peg$FAILED) {
          s2 = peg$parsedoubleStache();
          if (s2 === peg$FAILED) {
            s2 = peg$parsetripleStache();
            if (s2 === peg$FAILED) {
              s2 = peg$parsecommentNode();
              if (s2 === peg$FAILED) {
                s2 = peg$parseelementNode();
                if (s2 === peg$FAILED) {
                  s2 = peg$parsetextNode();
                }
              }
            }
          }
        }
      }
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parsesection();
        if (s2 === peg$FAILED) {
          s2 = peg$parseextraStache();
          if (s2 === peg$FAILED) {
            s2 = peg$parsedoubleStache();
            if (s2 === peg$FAILED) {
              s2 = peg$parsetripleStache();
              if (s2 === peg$FAILED) {
                s2 = peg$parsecommentNode();
                if (s2 === peg$FAILED) {
                  s2 = peg$parseelementNode();
                  if (s2 === peg$FAILED) {
                    s2 = peg$parsetextNode();
                  }
                }
              }
            }
          }
        }
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c2(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsetextNode() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      if (peg$c4.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c5); }
      }
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          if (peg$c4.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c5); }
          }
        }
      } else {
        s1 = peg$c3;
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c6(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsecommentNode() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4) === peg$c7) {
        s1 = peg$c7;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c8); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsecommentValue();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c9) {
            s3 = peg$c9;
            peg$currPos += 3;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c10); }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c11(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsecommentValue() {
      var s0, s1, s2;

      s0 = peg$currPos;
      peg$silentFails++;
      if (input.substr(peg$currPos, 3) === peg$c9) {
        s1 = peg$c9;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c10); }
      }
      peg$silentFails--;
      if (s1 !== peg$FAILED) {
        peg$currPos = s0;
        s0 = peg$c12;
      } else {
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.length > peg$currPos) {
          s1 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c13); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$parsecommentValue();
          if (s2 === peg$FAILED) {
            s2 = peg$c14;
          }
          if (s2 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c15(s1, s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      }

      return s0;
    }

    function peg$parseelementNode() {
      var s0, s1, s2, s3;

      s0 = peg$parseelementSelfClosed();
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parseelementStart();
        if (s1 !== peg$FAILED) {
          s2 = peg$parsehtml();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseelementEnd();
            if (s3 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c16(s1, s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      }

      return s0;
    }

    function peg$parseelementSelfClosed() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 60) {
        s1 = peg$c17;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsekey();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseattribute();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseattribute();
          }
          if (s3 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c19) {
              s4 = peg$c19;
              peg$currPos += 2;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c20); }
            }
            if (s4 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c21(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseelementStart() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 60) {
        s1 = peg$c17;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c18); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsekey();
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseattribute();
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseattribute();
          }
          if (s3 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 62) {
              s4 = peg$c22;
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c23); }
            }
            if (s4 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c24(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseelementEnd() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c25) {
        s1 = peg$c25;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c26); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsekey();
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 62) {
            s3 = peg$c22;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c23); }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c27(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseattribute() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      s1 = peg$parsekey();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 61) {
          s3 = peg$c28;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c29); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsews();
          if (s4 !== peg$FAILED) {
            s5 = peg$parsestrict_string();
            if (s5 !== peg$FAILED) {
              s6 = peg$parsews();
              if (s6 !== peg$FAILED) {
                s3 = [s3, s4, s5, s6];
                s2 = s3;
              } else {
                peg$currPos = s2;
                s2 = peg$c3;
              }
            } else {
              peg$currPos = s2;
              s2 = peg$c3;
            }
          } else {
            peg$currPos = s2;
            s2 = peg$c3;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$c3;
        }
        if (s2 === peg$FAILED) {
          s2 = peg$c14;
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c30(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseattrValue() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      s2 = peg$parsesection();
      if (s2 === peg$FAILED) {
        s2 = peg$parseextraStache();
        if (s2 === peg$FAILED) {
          s2 = peg$parsedoubleStache();
          if (s2 === peg$FAILED) {
            s2 = peg$parsetripleStache();
            if (s2 === peg$FAILED) {
              s2 = peg$parsetextNode();
            }
          }
        }
      }
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        s2 = peg$parsesection();
        if (s2 === peg$FAILED) {
          s2 = peg$parseextraStache();
          if (s2 === peg$FAILED) {
            s2 = peg$parsedoubleStache();
            if (s2 === peg$FAILED) {
              s2 = peg$parsetripleStache();
              if (s2 === peg$FAILED) {
                s2 = peg$parsetextNode();
              }
            }
          }
        }
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c2(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseattrArguments() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parseattrArgValue();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 44) {
          s3 = peg$c31;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c32); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parseattrArguments();
          if (s4 !== peg$FAILED) {
            s3 = [s3, s4];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$c3;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$c3;
        }
        if (s2 === peg$FAILED) {
          s2 = peg$c14;
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c33(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseattrArgValue() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$parsews();
      if (s2 !== peg$FAILED) {
        s3 = peg$parsestache();
        if (s3 !== peg$FAILED) {
          s4 = peg$parsews();
          if (s4 !== peg$FAILED) {
            s5 = peg$parseattrArgNotEnd();
            if (s5 !== peg$FAILED) {
              peg$reportedPos = s1;
              s2 = peg$c34(s3);
              s1 = s2;
            } else {
              peg$currPos = s1;
              s1 = peg$c3;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$c3;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$c3;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$c3;
      }
      if (s1 === peg$FAILED) {
        s1 = peg$currPos;
        s2 = peg$parsews();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsestring();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsews();
            if (s4 !== peg$FAILED) {
              s5 = peg$parseattrArgNotEnd();
              if (s5 !== peg$FAILED) {
                peg$reportedPos = s1;
                s2 = peg$c34(s3);
                s1 = s2;
              } else {
                peg$currPos = s1;
                s1 = peg$c3;
              }
            } else {
              peg$currPos = s1;
              s1 = peg$c3;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$c3;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$c3;
        }
        if (s1 === peg$FAILED) {
          s1 = peg$currPos;
          s2 = peg$parsews();
          if (s2 !== peg$FAILED) {
            s3 = peg$parseboolean();
            if (s3 !== peg$FAILED) {
              s4 = peg$parsews();
              if (s4 !== peg$FAILED) {
                s5 = peg$parseattrArgNotEnd();
                if (s5 !== peg$FAILED) {
                  peg$reportedPos = s1;
                  s2 = peg$c34(s3);
                  s1 = s2;
                } else {
                  peg$currPos = s1;
                  s1 = peg$c3;
                }
              } else {
                peg$currPos = s1;
                s1 = peg$c3;
              }
            } else {
              peg$currPos = s1;
              s1 = peg$c3;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$c3;
          }
          if (s1 === peg$FAILED) {
            s1 = peg$currPos;
            s2 = peg$parsews();
            if (s2 !== peg$FAILED) {
              s3 = peg$parsenumber();
              if (s3 !== peg$FAILED) {
                s4 = peg$parsews();
                if (s4 !== peg$FAILED) {
                  s5 = peg$parseattrArgNotEnd();
                  if (s5 !== peg$FAILED) {
                    peg$reportedPos = s1;
                    s2 = peg$c34(s3);
                    s1 = s2;
                  } else {
                    peg$currPos = s1;
                    s1 = peg$c3;
                  }
                } else {
                  peg$currPos = s1;
                  s1 = peg$c3;
                }
              } else {
                peg$currPos = s1;
                s1 = peg$c3;
              }
            } else {
              peg$currPos = s1;
              s1 = peg$c3;
            }
            if (s1 === peg$FAILED) {
              s1 = peg$currPos;
              s2 = peg$parsews();
              if (s2 !== peg$FAILED) {
                s3 = peg$parsenull();
                if (s3 !== peg$FAILED) {
                  s4 = peg$parsews();
                  if (s4 !== peg$FAILED) {
                    s5 = peg$parseattrArgNotEnd();
                    if (s5 !== peg$FAILED) {
                      peg$reportedPos = s1;
                      s2 = peg$c34(s3);
                      s1 = s2;
                    } else {
                      peg$currPos = s1;
                      s1 = peg$c3;
                    }
                  } else {
                    peg$currPos = s1;
                    s1 = peg$c3;
                  }
                } else {
                  peg$currPos = s1;
                  s1 = peg$c3;
                }
              } else {
                peg$currPos = s1;
                s1 = peg$c3;
              }
              if (s1 === peg$FAILED) {
                s1 = peg$currPos;
                s2 = peg$parsews();
                if (s2 !== peg$FAILED) {
                  s3 = peg$parseundefined();
                  if (s3 !== peg$FAILED) {
                    s4 = peg$parsews();
                    if (s4 !== peg$FAILED) {
                      s5 = peg$parseattrArgNotEnd();
                      if (s5 !== peg$FAILED) {
                        peg$reportedPos = s1;
                        s2 = peg$c34(s3);
                        s1 = s2;
                      } else {
                        peg$currPos = s1;
                        s1 = peg$c3;
                      }
                    } else {
                      peg$currPos = s1;
                      s1 = peg$c3;
                    }
                  } else {
                    peg$currPos = s1;
                    s1 = peg$c3;
                  }
                } else {
                  peg$currPos = s1;
                  s1 = peg$c3;
                }
                if (s1 === peg$FAILED) {
                  s1 = peg$currPos;
                  s2 = peg$currPos;
                  s3 = [];
                  if (peg$c35.test(input.charAt(peg$currPos))) {
                    s4 = input.charAt(peg$currPos);
                    peg$currPos++;
                  } else {
                    s4 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c36); }
                  }
                  while (s4 !== peg$FAILED) {
                    s3.push(s4);
                    if (peg$c35.test(input.charAt(peg$currPos))) {
                      s4 = input.charAt(peg$currPos);
                      peg$currPos++;
                    } else {
                      s4 = peg$FAILED;
                      if (peg$silentFails === 0) { peg$fail(peg$c36); }
                    }
                  }
                  if (s3 !== peg$FAILED) {
                    s3 = input.substring(s2, peg$currPos);
                  }
                  s2 = s3;
                  if (s2 !== peg$FAILED) {
                    peg$reportedPos = s1;
                    s2 = peg$c37(s2);
                  }
                  s1 = s2;
                }
              }
            }
          }
        }
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c38(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parseattrArgNotEnd() {
      var s0, s1, s2;

      s0 = peg$currPos;
      peg$silentFails++;
      if (peg$c39.test(input.charAt(peg$currPos))) {
        s1 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c40); }
      }
      if (s1 === peg$FAILED) {
        s1 = peg$currPos;
        peg$silentFails++;
        if (input.length > peg$currPos) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c13); }
        }
        peg$silentFails--;
        if (s2 === peg$FAILED) {
          s1 = peg$c12;
        } else {
          peg$currPos = s1;
          s1 = peg$c3;
        }
      }
      peg$silentFails--;
      if (s1 !== peg$FAILED) {
        peg$currPos = s0;
        s0 = peg$c12;
      } else {
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsesection() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      s1 = peg$parsesectionStart();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsehtml();
        if (s2 !== peg$FAILED) {
          s3 = peg$parsesectionEnd();
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c41(s1, s2, s3);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsesectionStart() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c42) {
        s1 = peg$c42;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c43); }
      }
      if (s1 !== peg$FAILED) {
        if (peg$c44.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c45); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsepathQueryWithRaw();
          if (s3 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c46) {
              s4 = peg$c46;
              peg$currPos += 2;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c47); }
            }
            if (s4 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c48(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsesectionEnd() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c49) {
        s1 = peg$c49;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c50); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseescape();
        if (s3 === peg$FAILED) {
          if (peg$c51.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c52); }
          }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseescape();
          if (s3 === peg$FAILED) {
            if (peg$c51.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c52); }
            }
          }
        }
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 2) === peg$c46) {
            s3 = peg$c46;
            peg$currPos += 2;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c47); }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c53(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsestache() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c54) {
        s2 = peg$c54;
        peg$currPos += 3;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c55); }
      }
      if (s2 !== peg$FAILED) {
        s3 = peg$parsepathQuery();
        if (s3 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c56) {
            s4 = peg$c56;
            peg$currPos += 3;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c57); }
          }
          if (s4 !== peg$FAILED) {
            s2 = [s2, s3, s4];
            s1 = s2;
          } else {
            peg$currPos = s1;
            s1 = peg$c3;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$c3;
        }
      } else {
        peg$currPos = s1;
        s1 = peg$c3;
      }
      if (s1 === peg$FAILED) {
        s1 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c42) {
          s2 = peg$c42;
          peg$currPos += 2;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c43); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsepathQuery();
          if (s3 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c46) {
              s4 = peg$c46;
              peg$currPos += 2;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c47); }
            }
            if (s4 !== peg$FAILED) {
              s2 = [s2, s3, s4];
              s1 = s2;
            } else {
              peg$currPos = s1;
              s1 = peg$c3;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$c3;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$c3;
        }
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c58(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsedoubleStache() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c42) {
        s1 = peg$c42;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c43); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        peg$silentFails++;
        if (peg$c59.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c60); }
        }
        peg$silentFails--;
        if (s3 === peg$FAILED) {
          s2 = peg$c12;
        } else {
          peg$currPos = s2;
          s2 = peg$c3;
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 38) {
            s3 = peg$c61;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c62); }
          }
          if (s3 === peg$FAILED) {
            s3 = peg$c14;
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsepathQuery();
            if (s4 !== peg$FAILED) {
              if (input.substr(peg$currPos, 2) === peg$c46) {
                s5 = peg$c46;
                peg$currPos += 2;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c47); }
              }
              if (s5 !== peg$FAILED) {
                peg$reportedPos = s0;
                s1 = peg$c63(s3, s4);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsetripleStache() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 3) === peg$c54) {
        s1 = peg$c54;
        peg$currPos += 3;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c55); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsepathQuery();
        if (s2 !== peg$FAILED) {
          if (input.substr(peg$currPos, 3) === peg$c56) {
            s3 = peg$c56;
            peg$currPos += 3;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c57); }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c64(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseextraStache() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 2) === peg$c42) {
        s1 = peg$c42;
        peg$currPos += 2;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c43); }
      }
      if (s1 !== peg$FAILED) {
        if (peg$c65.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c66); }
        }
        if (s2 !== peg$FAILED) {
          s3 = [];
          s4 = peg$parseescape();
          if (s4 === peg$FAILED) {
            if (peg$c51.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c52); }
            }
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            s4 = peg$parseescape();
            if (s4 === peg$FAILED) {
              if (peg$c51.test(input.charAt(peg$currPos))) {
                s4 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s4 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c52); }
              }
            }
          }
          if (s3 !== peg$FAILED) {
            if (input.substr(peg$currPos, 2) === peg$c46) {
              s4 = peg$c46;
              peg$currPos += 2;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c47); }
            }
            if (s4 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c67(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsepathQuery() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parsepath();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 124) {
          s3 = peg$c68;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c69); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsepathQuery();
          if (s4 !== peg$FAILED) {
            s3 = [s3, s4];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$c3;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$c3;
        }
        if (s2 === peg$FAILED) {
          s2 = peg$c14;
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c33(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsepathQueryWithRaw() {
      var s0, s1;

      s0 = peg$currPos;
      s1 = peg$parsepathQuery();
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c70(s1);
      }
      s0 = s1;

      return s0;
    }

    function peg$parsepath() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        s2 = peg$parsepathPrefix();
        if (s2 === peg$FAILED) {
          s2 = peg$c14;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsepathCore();
          if (s3 !== peg$FAILED) {
            s4 = peg$parsews();
            if (s4 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c71(s2, s3);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        s1 = peg$parsews();
        if (s1 !== peg$FAILED) {
          s2 = peg$parsepathPrefix();
          if (s2 !== peg$FAILED) {
            s3 = peg$parsews();
            if (s3 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c72(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      }

      return s0;
    }

    function peg$parsepathPrefix() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      if (input.substr(peg$currPos, 3) === peg$c73) {
        s2 = peg$c73;
        peg$currPos += 3;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c74); }
      }
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          if (input.substr(peg$currPos, 3) === peg$c73) {
            s2 = peg$c73;
            peg$currPos += 3;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c74); }
          }
        }
      } else {
        s1 = peg$c3;
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c75(s1);
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 2) === peg$c76) {
          s1 = peg$c76;
          peg$currPos += 2;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c77); }
        }
        if (s1 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c78();
        }
        s0 = s1;
        if (s0 === peg$FAILED) {
          s0 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 46) {
            s1 = peg$c79;
            peg$currPos++;
          } else {
            s1 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c80); }
          }
          if (s1 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c78();
          }
          s0 = s1;
          if (s0 === peg$FAILED) {
            s0 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 47) {
              s1 = peg$c81;
              peg$currPos++;
            } else {
              s1 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c82); }
            }
            if (s1 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c83();
            }
            s0 = s1;
          }
        }
      }

      return s0;
    }

    function peg$parsepathCore() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parsepathPart();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 46) {
          s3 = peg$c79;
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c80); }
        }
        if (s3 !== peg$FAILED) {
          s4 = peg$parsepathCore();
          if (s4 !== peg$FAILED) {
            s3 = [s3, s4];
            s2 = s3;
          } else {
            peg$currPos = s2;
            s2 = peg$c3;
          }
        } else {
          peg$currPos = s2;
          s2 = peg$c3;
        }
        if (s2 === peg$FAILED) {
          s2 = peg$c14;
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c33(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsepathPart() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      s1 = peg$currPos;
      s2 = peg$currPos;
      if (peg$c84.test(input.charAt(peg$currPos))) {
        s3 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s3 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c85); }
      }
      if (s3 !== peg$FAILED) {
        s4 = [];
        if (peg$c86.test(input.charAt(peg$currPos))) {
          s5 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s5 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c87); }
        }
        while (s5 !== peg$FAILED) {
          s4.push(s5);
          if (peg$c86.test(input.charAt(peg$currPos))) {
            s5 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s5 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c87); }
          }
        }
        if (s4 !== peg$FAILED) {
          s3 = [s3, s4];
          s2 = s3;
        } else {
          peg$currPos = s2;
          s2 = peg$c3;
        }
      } else {
        peg$currPos = s2;
        s2 = peg$c3;
      }
      if (s2 !== peg$FAILED) {
        s2 = input.substring(s1, peg$currPos);
      }
      s1 = s2;
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parsepathDynamic();
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parsepathDynamic();
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c88(s1, s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsepathDynamic() {
      var s0, s1, s2, s3, s4, s5;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 91) {
        s1 = peg$c89;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c90); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$parsews();
        if (s2 !== peg$FAILED) {
          s3 = peg$parseinteger();
          if (s3 === peg$FAILED) {
            s3 = peg$parsestring();
            if (s3 === peg$FAILED) {
              s3 = peg$parsepath();
            }
          }
          if (s3 !== peg$FAILED) {
            s4 = peg$parsews();
            if (s4 !== peg$FAILED) {
              if (input.charCodeAt(peg$currPos) === 93) {
                s5 = peg$c91;
                peg$currPos++;
              } else {
                s5 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c92); }
              }
              if (s5 !== peg$FAILED) {
                peg$reportedPos = s0;
                s1 = peg$c93(s3);
                s0 = s1;
              } else {
                peg$currPos = s0;
                s0 = peg$c3;
              }
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseboolean() {
      var s0, s1;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4) === peg$c94) {
        s1 = peg$c94;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c95); }
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c96();
      }
      s0 = s1;
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.substr(peg$currPos, 5) === peg$c97) {
          s1 = peg$c97;
          peg$currPos += 5;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c98); }
        }
        if (s1 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c99();
        }
        s0 = s1;
      }

      return s0;
    }

    function peg$parsenumber() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 45) {
        s1 = peg$c100;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c101); }
      }
      if (s1 === peg$FAILED) {
        s1 = peg$c14;
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        if (peg$c102.test(input.charAt(peg$currPos))) {
          s3 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s3 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c103); }
        }
        if (s3 !== peg$FAILED) {
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            if (peg$c102.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c103); }
            }
          }
        } else {
          s2 = peg$c3;
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$currPos;
          if (input.charCodeAt(peg$currPos) === 46) {
            s4 = peg$c79;
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c80); }
          }
          if (s4 !== peg$FAILED) {
            s5 = [];
            if (peg$c102.test(input.charAt(peg$currPos))) {
              s6 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c103); }
            }
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                if (peg$c102.test(input.charAt(peg$currPos))) {
                  s6 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s6 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c103); }
                }
              }
            } else {
              s5 = peg$c3;
            }
            if (s5 !== peg$FAILED) {
              s4 = [s4, s5];
              s3 = s4;
            } else {
              peg$currPos = s3;
              s3 = peg$c3;
            }
          } else {
            peg$currPos = s3;
            s3 = peg$c3;
          }
          if (s3 === peg$FAILED) {
            s3 = peg$c14;
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c104();
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parseinteger() {
      var s0, s1, s2;

      s0 = peg$currPos;
      s1 = [];
      if (peg$c102.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c103); }
      }
      if (s2 !== peg$FAILED) {
        while (s2 !== peg$FAILED) {
          s1.push(s2);
          if (peg$c102.test(input.charAt(peg$currPos))) {
            s2 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s2 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c103); }
          }
        }
      } else {
        s1 = peg$c3;
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c105();
      }
      s0 = s1;

      return s0;
    }

    function peg$parsestring() {
      var s0, s1, s2, s3;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 34) {
        s1 = peg$c106;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c107); }
      }
      if (s1 !== peg$FAILED) {
        s2 = [];
        s3 = peg$parseescape();
        if (s3 === peg$FAILED) {
          if (peg$c108.test(input.charAt(peg$currPos))) {
            s3 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c109); }
          }
        }
        while (s3 !== peg$FAILED) {
          s2.push(s3);
          s3 = peg$parseescape();
          if (s3 === peg$FAILED) {
            if (peg$c108.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c109); }
            }
          }
        }
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 34) {
            s3 = peg$c106;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c107); }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c110(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 39) {
          s1 = peg$c111;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c112); }
        }
        if (s1 !== peg$FAILED) {
          s2 = [];
          s3 = peg$parseescape();
          if (s3 === peg$FAILED) {
            if (peg$c113.test(input.charAt(peg$currPos))) {
              s3 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c114); }
            }
          }
          while (s3 !== peg$FAILED) {
            s2.push(s3);
            s3 = peg$parseescape();
            if (s3 === peg$FAILED) {
              if (peg$c113.test(input.charAt(peg$currPos))) {
                s3 = input.charAt(peg$currPos);
                peg$currPos++;
              } else {
                s3 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c114); }
              }
            }
          }
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 39) {
              s3 = peg$c111;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c112); }
            }
            if (s3 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c110(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      }

      return s0;
    }

    function peg$parsestrict_string() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 34) {
        s1 = peg$c106;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c107); }
      }
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        s3 = [];
        if (peg$c108.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c109); }
        }
        while (s4 !== peg$FAILED) {
          s3.push(s4);
          if (peg$c108.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c109); }
          }
        }
        if (s3 !== peg$FAILED) {
          s3 = input.substring(s2, peg$currPos);
        }
        s2 = s3;
        if (s2 !== peg$FAILED) {
          if (input.charCodeAt(peg$currPos) === 34) {
            s3 = peg$c106;
            peg$currPos++;
          } else {
            s3 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c107); }
          }
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c34(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }
      if (s0 === peg$FAILED) {
        s0 = peg$currPos;
        if (input.charCodeAt(peg$currPos) === 39) {
          s1 = peg$c111;
          peg$currPos++;
        } else {
          s1 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c112); }
        }
        if (s1 !== peg$FAILED) {
          s2 = peg$currPos;
          s3 = [];
          if (peg$c113.test(input.charAt(peg$currPos))) {
            s4 = input.charAt(peg$currPos);
            peg$currPos++;
          } else {
            s4 = peg$FAILED;
            if (peg$silentFails === 0) { peg$fail(peg$c114); }
          }
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c113.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c114); }
            }
          }
          if (s3 !== peg$FAILED) {
            s3 = input.substring(s2, peg$currPos);
          }
          s2 = s3;
          if (s2 !== peg$FAILED) {
            if (input.charCodeAt(peg$currPos) === 39) {
              s3 = peg$c111;
              peg$currPos++;
            } else {
              s3 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c112); }
            }
            if (s3 !== peg$FAILED) {
              peg$reportedPos = s0;
              s1 = peg$c34(s2);
              s0 = s1;
            } else {
              peg$currPos = s0;
              s0 = peg$c3;
            }
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      }

      return s0;
    }

    function peg$parsenull() {
      var s0, s1;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 4) === peg$c115) {
        s1 = peg$c115;
        peg$currPos += 4;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c116); }
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c117();
      }
      s0 = s1;

      return s0;
    }

    function peg$parseundefined() {
      var s0, s1, s2, s3, s4, s5, s6;

      s0 = peg$currPos;
      if (input.substr(peg$currPos, 9) === peg$c118) {
        s1 = peg$c118;
        peg$currPos += 9;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c119); }
      }
      if (s1 === peg$FAILED) {
        s1 = peg$currPos;
        if (input.substr(peg$currPos, 4) === peg$c120) {
          s2 = peg$c120;
          peg$currPos += 4;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c121); }
        }
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            s4 = peg$currPos;
            peg$silentFails++;
            s5 = [];
            if (peg$c122.test(input.charAt(peg$currPos))) {
              s6 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s6 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c123); }
            }
            if (s6 !== peg$FAILED) {
              while (s6 !== peg$FAILED) {
                s5.push(s6);
                if (peg$c122.test(input.charAt(peg$currPos))) {
                  s6 = input.charAt(peg$currPos);
                  peg$currPos++;
                } else {
                  s6 = peg$FAILED;
                  if (peg$silentFails === 0) { peg$fail(peg$c123); }
                }
              }
            } else {
              s5 = peg$c3;
            }
            peg$silentFails--;
            if (s5 === peg$FAILED) {
              s4 = peg$c12;
            } else {
              peg$currPos = s4;
              s4 = peg$c3;
            }
            if (s4 !== peg$FAILED) {
              s2 = [s2, s3, s4];
              s1 = s2;
            } else {
              peg$currPos = s1;
              s1 = peg$c3;
            }
          } else {
            peg$currPos = s1;
            s1 = peg$c3;
          }
        } else {
          peg$currPos = s1;
          s1 = peg$c3;
        }
      }
      if (s1 !== peg$FAILED) {
        peg$reportedPos = s0;
        s1 = peg$c124();
      }
      s0 = s1;

      return s0;
    }

    function peg$parsekey() {
      var s0, s1, s2, s3, s4;

      s0 = peg$currPos;
      s1 = peg$parsews();
      if (s1 !== peg$FAILED) {
        s2 = peg$currPos;
        s3 = [];
        if (peg$c125.test(input.charAt(peg$currPos))) {
          s4 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s4 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c126); }
        }
        if (s4 !== peg$FAILED) {
          while (s4 !== peg$FAILED) {
            s3.push(s4);
            if (peg$c125.test(input.charAt(peg$currPos))) {
              s4 = input.charAt(peg$currPos);
              peg$currPos++;
            } else {
              s4 = peg$FAILED;
              if (peg$silentFails === 0) { peg$fail(peg$c126); }
            }
          }
        } else {
          s3 = peg$c3;
        }
        if (s3 !== peg$FAILED) {
          s3 = input.substring(s2, peg$currPos);
        }
        s2 = s3;
        if (s2 !== peg$FAILED) {
          s3 = peg$parsews();
          if (s3 !== peg$FAILED) {
            peg$reportedPos = s0;
            s1 = peg$c127(s2);
            s0 = s1;
          } else {
            peg$currPos = s0;
            s0 = peg$c3;
          }
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }

    function peg$parsews() {
      var s0, s1, s2;

      peg$silentFails++;
      s0 = peg$currPos;
      s1 = [];
      if (peg$c129.test(input.charAt(peg$currPos))) {
        s2 = input.charAt(peg$currPos);
        peg$currPos++;
      } else {
        s2 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c130); }
      }
      while (s2 !== peg$FAILED) {
        s1.push(s2);
        if (peg$c129.test(input.charAt(peg$currPos))) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c130); }
        }
      }
      if (s1 !== peg$FAILED) {
        s1 = input.substring(s0, peg$currPos);
      }
      s0 = s1;
      peg$silentFails--;
      if (s0 === peg$FAILED) {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c128); }
      }

      return s0;
    }

    function peg$parseescape() {
      var s0, s1, s2;

      s0 = peg$currPos;
      if (input.charCodeAt(peg$currPos) === 92) {
        s1 = peg$c131;
        peg$currPos++;
      } else {
        s1 = peg$FAILED;
        if (peg$silentFails === 0) { peg$fail(peg$c132); }
      }
      if (s1 !== peg$FAILED) {
        if (input.length > peg$currPos) {
          s2 = input.charAt(peg$currPos);
          peg$currPos++;
        } else {
          s2 = peg$FAILED;
          if (peg$silentFails === 0) { peg$fail(peg$c13); }
        }
        if (s2 !== peg$FAILED) {
          peg$reportedPos = s0;
          s1 = peg$c133(s2);
          s0 = s1;
        } else {
          peg$currPos = s0;
          s0 = peg$c3;
        }
      } else {
        peg$currPos = s0;
        s0 = peg$c3;
      }

      return s0;
    }


    	var _ = require("underscore"),
    		NODE_TYPE = require("./types"),
    		Mustache = require("./");

    	options = _.defaults(options || {}, {
    		strict: true
    	});


    peg$result = peg$startRuleFunction();

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
},{"./":3,"./types":12,"underscore":17}],5:[function(require,module,exports){
var Trackr = require("trackr"),
	_ = require("underscore"),
	util = require("./util"),
	parse = require("./m+xml").parse,
	$track = require("./track").track;

var Model =
module.exports = function Model(data, parent, options) {
	this.proxies = [];
	this._dep = new Trackr.Dependency();
	if (Model.isModel(parent)) this.parent = parent;
	this.set(data, options && options.track);
}

Model.isModel = function(o) {
	return o instanceof Model;
}

Model.extend = util.subclass;

Model._defaultProxies = [ {
	isList:  true,
	match:   function(arr)    { return _.isArray(arr); },
	get:     function(arr, k) { return k === "length" ? this.length(arr) : arr[k]; },
	length:  function(arr)    { var len; return typeof(len = arr.$length) === "number" ? len : arr.length; },
	keys:    function(arr)    { return _.range(this.length(arr)); },
	isEmpty: function(arr)    { return !!this.length(arr); }
}, {
	match: function()     { return true; },
	get:   function(t, k) { if (t != null) return t[k]; }
} ];

Model.callProxyMethod = function(proxy, target, method, args, ctx) {
	var args = _.isArray(args) ? _.clone(args) : [];
	args.unshift(proxy, method, target);
	args.push(ctx);
	return util.result.apply(null, args);
}

_.extend(Model.prototype, {

	// sets the data on the model
	set: function(data, track) {
		if (track !== false) data = $track(data, track);
		this.data = data;
		this._dep.changed();
		return this;
	},

	// an array of models in the current stack, with the root as the first
	getAllModels: function() {
		var models = [ this ],
			model = this;

		while (model.parent) {
			models.unshift(model = model.parent);
		}

		return models
	},

	// gets the model in the stack at the index
	// negative values start at root
	getModelAtOffset: function(index) {
		if (!_.isNumber(index) || isNaN(index)) index = 0;
		if (index < 0) return this.getAllModels()[~index];

		var model = this;
		
		while (index && model) {
			model = model.parent;
			index--;
		}
		
		return model;
	},

	// gets the last model in the stack
	getRootModel: function() {
		var model = this;
		while (model.parent != null) model = model.parent;
		return model;
	},

	// returns the first model which passes the function
	findModel: function(fn) {
		var index = 0,
			model = this;

		while (model != null) {
			if (fn.call(this, model, index++)) return model;
			model = model.parent;
		}
	},

	// returns the value at path, but only looks in the data on this model
	getLocal: function(path) {
		if (typeof path === "string") path = parse(path, { startRule: "path" });
		if (path == null) path = { parts: [] };
		if (!_.isObject(path)) throw new Error("Expecting string or object for path.");
		
		var self = this;
		this._dep.depend();

		return _.reduce(path.parts, function(target, part) {
			target = self._get(target, part.key);

			_.each(part.children, function(k) {
				if (_.isObject(k)) k = self.get(k);
				target = self._get(target, k);
			});

			return target;
		}, this.data);
	},

	// retrieves value with path query
	get: function(paths) {
		var self = this;

		if (typeof paths === "string") paths = parse(paths, { startRule: "pathQuery" });
		if (!_.isArray(paths)) paths = paths != null ? [ paths ] : [];
		
		if (!paths.length) {
			var model = this.findModel(function(m) { return !_.isUndefined(m.data); });
			if (model == null) return;
			var val = model.data;
			if (_.isFunction(val)) val = val.call(this, null);
			return val;
		}

		return _.reduce(paths, function(result, path, index) {
			var model = self,
				scope = true,
				val;

			if (path.type === "root") {
				model = self.getRootModel();
			} else if (path.type === "parent") {
				model = self.getModelAtOffset(path.distance);
				scope = false;
			} else if (path.type === "all") {
				scope = false;
			}

			if (model == null) return;

			while (_.isUndefined(val) && model != null) {
				val = model.getLocal(path);
				model = model.parent;
				if (scope) break;
			}

			if (_.isFunction(val)) {
				val = val.call(self, index === 0 ? null : result);
			}

			return val;
		}, void 0);
	},

	_get: function(target, key) {
		return this.callProxyMethod(this.getProxyByValue(target), target, "get", key);
	},

	proxy: function(key) {
		var proxy = this.getProxyByValue(this.data);
		if (key == null) return proxy;
		var args = _.toArray(arguments);
		args.unshift(proxy, this.data);
		return this.callProxyMethod.apply(this, args);
	},

	callProxyMethod: function(proxy, target, method) {
		return Model.callProxyMethod(proxy, target, method, Array.prototype.slice.call(arguments, 3), this);
	},

	getAllProxies: function() {
		var proxies = [],
			model = this;

		while (model != null) {
			proxies.push.apply(proxies, model.proxies);
			model = model.parent;
		}

		return proxies;
	},

	registerProxy: function(proxy) {
		if (typeof proxy !== "object" || proxy == null) throw new Error("Expecting object for proxy.");
		if (typeof proxy.match !== "function") throw new Error("Layer missing required match method.");
		if (typeof proxy.get !== "function") throw new Error("Layer missing required get method.");
		this.proxies.unshift(proxy);
		return this;
	},

	getProxyByValue: function(target) {
		var proxy;
		
		// look locally first
		proxy = _.find(this.proxies, function(p) {
			return p.match(target);
		});

		// then recursively check the parents
		if (proxy == null && this.parent != null) {
			proxy = this.parent.getProxyByValue(target);
		}

		// otherwise look through the defaults
		if (proxy == null) {
			proxy = _.find(Model._defaultProxies, function(p) {
				return p.match(target);
			});
		}

		return proxy;
	}

});

},{"./m+xml":4,"./track":11,"./util":13,"trackr":16,"underscore":17}],6:[function(require,module,exports){
var Trackr = require("trackr"),
	_ = require("underscore"),
	NODE_TYPE = require("./types"),
	parse = require("./m+xml").parse,
	util = require("./util"),
	View = require("./view"),
	Model = require("./model"),
	Section = require("./section"),
	$track = require("./track").track,
	DOMRange = require("./domrange");

var Mustache =
module.exports = View.extend({
	constructor: function(data, options) {
		options = options || {};
		this._partials = {};
		this._components = {};

		// add template
		var template = options.template || _.result(this, "template");
		if (template != null) this.setTemplate(template);

		// add decorators
		this.decorate(_.extend({}, options.decorators, _.result(this, "decorators")));

		// add partials
		this.setPartial(_.extend({}, options.partials, _.result(this, "partials")));

		// initiate like a normal view
		View.call(this, data, options);
	},

	// parses and sets the root template
	setTemplate: function(template) {
		if (_.isString(template)) template = parse(template);

		if (!_.isObject(template) || template.type !== NODE_TYPE.ROOT)
			throw new Error("Expecting string or parsed template.");

		this._template = template;
		return this;
	},

	// creates a decorator
	decorate: function(name, fn, options) {
		if (typeof name === "object" && fn == null) {
			_.each(name, function(fn, n) {
				if (_.isArray(fn)) this.decorate(n, fn[0], fn[1]);
				else this.decorate(n, fn, options);
			}, this);
			return this;
		}

		if (typeof name !== "string" || name === "") throw new Error("Expecting non-empty string for decorator name.");
		if (typeof fn !== "function") throw new Error("Expecting function for decorator.");

		if (this._decorators == null) this._decorators = {};
		if (this._decorators[name] == null) this._decorators[name] = [];
		var decorators = this._decorators[name];

		if (!_.findWhere(decorators, { callback: fn })) {
			decorators.push({
				callback: fn,
				options: options || {}
			});
		}

		return this;
	},

	// finds all decorators, locally and in parent
	findDecorators: function(name) {
		var decorators = [],
			c = this;


		while (c != null) {
			if (c._decorators != null && _.isArray(c._decorators[name])) {
				c._decorators[name].forEach(function(d) {
					if (!_.findWhere(decorators, { callback: d.callback })) {
						decorators.push(_.extend({ context: c }, d));
					}
				});
			}

			c = c.parentRange;
		}

		return decorators;
	},

	// removes a decorator
	stopDecorating: function(name, fn) {
		if (typeof name === "function" && fn == null) {
			fn = name;
			name = null;
		}

		if (this._decorators == null || (name == null && fn == null)) {
			this._decorators = {};
		}

		else if (fn == null) {
			delete this._decorators[name];
		}

		else if (name == null) {
			_.each(this._decorators, function(d, n) {
				this._decorators[n] = _.filter(d, function(_d) {
					return _d.callback !== fn;
				});
			}, this);
		}

		else {
			var d = this._decorators[name];
			this._decorators[name] = _.filter(d, function(_d) {
				return _d.callback !== fn;
			});
		}

		return this;
	},

	// sets partial by name
	setPartial: function(name, partial) {
		if (_.isObject(name) && partial == null) {
			_.each(name, function(p, n) { this.setPartial(n, p); }, this);
			return this;
		}

		if (!_.isString(name) && name !== "")
			throw new Error("Expecting non-empty string for partial name.");

		if (_.isString(partial)) partial = parse(partial);
		if (_.isObject(partial) && partial.type === NODE_TYPE.ROOT) partial = Mustache.extend({ template: partial });
		if (partial != null && !util.isSubClass(View, partial))
			throw new Error("Expecting string template, parsed template, View subclass or function for partial.");

		if (partial == null) {
			delete this._partials[name];
			partial = void 0;
		} else {
			this._partials[name] = partial;
		}

		this.trigger("partial", name, partial);
		this.trigger("partial:" + name, partial);

		return this;
	},

	// looks through parents for partial
	findPartial: function(name) {
		var c = this;

		while (c != null) {
			if (c._partials != null && c._partials[name] != null) return c._partials[name];
			c = c.parentRange;
		}
	},

	// returns first rendered partial by name
	getComponent: function(name) {
		var comps, comp, res, n, i;

		comps = this._components;
		if (comps[name] != null && comps[name].length) return comps[name][0];

		for (n in comps) {
			for (i in comps[n]) {
				comp = comps[n][i]
				if (!(comp instanceof Mustache)) continue;
				res = comp.getComponent(name);
				if (res != null) return res;
			}
		}

		return null;
	},

	// returns all rendered partials by name
	getComponents: function(name) {
		return _.reduce(this._components, function(m, comps, n) {
			if (n === name) m.push.apply(m, comps);
			
			comps.forEach(function(c) {
				if (c instanceof Mustache) m.push.apply(m, c.getComponents(name));
			});

			return m;
		}, []);
	},

	// the main render function called by mount
	render: function() {
		if (this._template == null)
			throw new Error("Expected a template to be set before rendering.");

		var toMount;
		this.setMembers(this.renderTemplate(this._template, null, toMount = []));
		_.invoke(toMount, "mount");
	},

	// converts a template into an array of elements and DOMRanges
	renderTemplate: function(template, view, toMount) {
		if (view == null) view = this;
		if (toMount == null) toMount = [];
		var self = this;

		if (_.isArray(template)) return template.reduce(function(r, t) {
			var b = self.renderTemplate(t, view, toMount);
			if (_.isArray(b)) r.push.apply(r, b);
			else if (b != null) r.push(b);
			return r;
		}, []);

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return this.renderTemplate(template.children, view, toMount);

			case NODE_TYPE.ELEMENT:
				var part = this.renderPartial(template.name, view);
				var obj;

				if (part != null) {
					part.addData(obj = $track({}));

					template.attributes.forEach(function(attr) {
						self.autorun(function(c) {
							var val = this.renderArguments(attr.arguments, view);
							if (val.length === 1) val = val[0];
							else if (!val.length) val = void 0;

							if (c.firstRun) obj.defineProperty(attr.name, val);
							else obj[attr.name] = val;
						});
					});

					toMount.push(part);
					return part;
				}

				else {
					var el = document.createElement(template.name);
					
					template.attributes.forEach(function(attr) {
						if (this.renderDecorations(el, attr, view)) return;
						
						this.autorun(function() {
							el.setAttribute(attr.name, this.renderTemplateAsString(attr.children, view));
						});
					}, this);

					var children = this.renderTemplate(template.children, view, toMount),
						child, i;

					for (i in children) {
						child = children[i];
						if (child instanceof DOMRange) {
							child.parentRange = view; // fake the parent
							child.attach(el);
						} else {
							el.appendChild(child);
						}
					}
					
					return el;
				}

			case NODE_TYPE.TEXT:
				return document.createTextNode(util.decodeEntities(template.value));

			case NODE_TYPE.HTML:
				return new DOMRange(util.parseHTML(template.value));

			case NODE_TYPE.XCOMMENT:
				return document.createComment(template.value);

			case NODE_TYPE.INTERPOLATOR:
				var node = document.createTextNode("");
				
				this.autorun(function() {
					var val = view.get(template.value);
					node.nodeValue = typeof val === "string" ? val : val != null ? val.toString() : "";
				});

				return node;

			case NODE_TYPE.TRIPLE:
				var range = new DOMRange();
				
				this.autorun(function() {
					range.setMembers(util.parseHTML(view.get(template.value)));
				});

				return range;

			case NODE_TYPE.INVERTED:
			case NODE_TYPE.SECTION:
				var section = new Section(view.model)
					.invert(template.type === NODE_TYPE.INVERTED)
					.setPath(template.value)
					.onRow(function() {
						var _toMount;
						this.setMembers(self.renderTemplate(template.children, this, _toMount = []));
						_.invoke(_toMount, "mount");
					});

				toMount.push(section);
				return section;

			case NODE_TYPE.PARTIAL:
				var partial = this.renderPartial(template.value, view);
				if (partial) toMount.push(partial);
				return partial;
		}
	},

	// converts a template into a string
	renderTemplateAsString: function(template, ctx) {
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;
		var self = this;

		if (_.isArray(template)) return template.map(function(t) {
			return self.renderTemplateAsString(t, ctx);
		}).filter(function(b) { return b != null; }).join("");

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return this.renderTemplateAsString(template.children, ctx);

			case NODE_TYPE.TEXT:
				return template.value;

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				var val = ctx.get(template.value);
				return val != null ? val.toString() : "";

			case NODE_TYPE.SECTION:
			case NODE_TYPE.INVERTED:
				var inverted, model, val, isEmpty, makeRow, proxy, isList;

				inverted = template.type === NODE_TYPE.INVERTED;
				val = ctx.get(template.value);
				model = new Model(val, ctx);
				proxy = model.getProxyByValue(val);
				isList = model.callProxyMethod(proxy, val, "isList");
				isEmpty = Section.isEmpty(model, proxy);
				
				makeRow = function(i) {
					var row, data;

					if (i == null) {
						data = model;
					} else {
						data = model.callProxyMethod(proxy, val, "get", i);
						data = new Model(data, new Model({ $key: i }, ctx));
					}

					return self.renderTemplateAsString(template.children, data);
				}

				if (!(isEmpty ^ inverted)) {
					return isList && !inverted ?
						model.callProxyMethod(proxy, val, "keys").map(makeRow).join("") :
						makeRow();
				}
		}
	},

	// converts an argument template into an array of values
	renderArguments: function(arg, ctx) {
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;
		var self = this;

		if (_.isArray(arg)) return arg.map(function(a) {
			return self.renderArguments(a, ctx);
		}).filter(function(b) { return b != null; });

		switch(arg.type) {
			case NODE_TYPE.INTERPOLATOR:
				return ctx.get(arg.value);

			case NODE_TYPE.LITERAL:
				return arg.value;
		}
	},

	// generates a new component from a View subclass or partial's name
	renderPartial: function(klass, ctx, options) {
		var comps, name;

		// look up the partial by name
		if (typeof klass === "string") {
			name = klass;
			klass = this.findPartial(klass);
		}

		// class must be a view
		if (!util.isSubClass(View, klass)) return null;
		
		// normalize context
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;

		// create it non-reactively
		var component = Trackr.nonreactive(function() {
			return new klass(ctx, options);
		});

		// add it to the list
		if (name) {
			comps = this._components;
			if (comps[name] == null) comps[name] = [];
			comps[name].push(component);

			// auto remove when the partial is "stopped"
			component.once("stop", function() {
				comps[name] = _.without(comps[name], component);
			});
		}

		return component;
	},

	// renders decorations on an element by template
	renderDecorations: function(el, attr, ctx) {
		var self = this;

		// look up decorator by name
		var decorators = this.findDecorators(attr.name);
		if (!decorators.length) return;

		// normalize the context
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;

		// a wrapper computation to ez-clean the rest
		return this.autorun(function() {
			decorators.forEach(function(d) {
				self.autorun(function(comp) {
					// assemble the arguments!
					var args = [ {
						target: el,
						model: ctx,
						view: self,
						template: attr,
						comp: comp,
						options: d.options
					} ];

					// render arguments based on options
					if (d.options && d.options.parse === "string") {
						args.push(self.renderTemplateAsString(attr.children, ctx));
					} else if (d.options == null || d.options.parse !== false) {
						args = args.concat(self.renderArguments(attr.arguments, ctx));
					}

					// execute the callback
					d.callback.apply(d.context || self, args);
				});
			});
		});
	}

}, {

	render: function(template, data, options) {
		options = _.extend({}, options || {}, {
			template: template
		});

		return new Mustache(data || null, options);
	}

});

},{"./domrange":1,"./m+xml":4,"./model":5,"./section":10,"./track":11,"./types":12,"./util":13,"./view":14,"trackr":16,"underscore":17}],7:[function(require,module,exports){
var _ = require("underscore"),
	Mustache = require("../");

// the plugin
module.exports = function() {
	this.addAction = addAction;
	this.addActionOnce = addActionOnce;
	this.removeAction = removeAction;
	this.fireAction = fireAction;
	this.decorate(decorators);

	var initActions = _.result(this, "actions");
	if (initActions != null) this.addAction(initActions);
}

// generate decorators
var eventNames = [
	'change', 'click', 'dblclick', 'mousedown', 'mouseup',
	'mouseenter', 'mouseleave', 'scroll', 'blur', 'focus',
	'input', 'submit', 'reset', 'keydown', 'keypress', 'keyup',
	'drag', 'dragdrop', 'dragend', 'dragenter', 'dragexit',
	'dragleave', 'dragover', 'dragstart', 'drop'
];

var slice = Array.prototype.slice;
var decorators = {};

eventNames.forEach(function(event) {
	decorators["on-" + event] = function(decor, key) {
		var self = this,
			args, node;

		function listener(e) {
			// create a new action object
			var action = new Action(key);
			action.original = e;
			action.target = action.node = node;
			action.context = action.model = decor.model;
			action.view = decor.view;

			// find the first parent with the fire method
			var fireOn = self;
			while (typeof fireOn.fireAction !== "function") {
				// if it has no parent, we can't do anything
				if (fireOn.parent == null) return;
				fireOn = fireOn.parent;
			}

			// fire the action
			fireOn.fireAction.apply(fireOn, [ action ].concat(args));
		}

		node = decor.target;
		args = _.toArray(arguments).slice(2);
		node.addEventListener(event, listener);

		decor.comp.onInvalidate(function() {
			node.removeEventListener(event, listener);
		});
	}
});

// Action Class
function Action(name) {
	this.name = name;
}

Mustache.Action = Action;

Action.prototype.bubbles = true;

Action.prototype.stopPropagation = function() {
	this.bubbles = false;
	return this;
}

// Msutache Instance Methods
function addAction(name, fn) {
	if (typeof name === "object" && fn == null) {
		_.each(name, function(fn, n) { this.addAction(n, fn); }, this);
		return this;
	}

	if (typeof name !== "string" || name === "") throw new Error("Expecting non-empty string for action name.");
	if (typeof fn !== "function") throw new Error("Expecting function for action.");

	if (this._actions == null) this._actions = {};
	if (this._actions[name] == null) this._actions[name] = [];
	if (!~this._actions[name].indexOf(fn)) this._actions[name].push(fn);
	
	return this;
}

function addActionOnce(name, fn) {
	if (typeof name === "object" && fn == null) {
		_.each(name, function(fn, n) { this.addActionOnce(n, fn); }, this);
		return this;
	}

	var onAction;

	this.addAction(name, onAction = function () {
		this.removeAction(name, onAction);
		fn.apply(this, arguments);
	});

	return this;
}

function removeAction(name, fn) {
	if (typeof name === "function" && fn == null) {
		fn = name;
		name = null;
	}

	if (this._actions == null || (name == null && fn == null)) {
		this._actions = {};
	}

	else if (fn == null) {
		delete this._actions[name];
	}

	else if (name == null) {
		_.each(this._actions, function(d, n) {
			this._actions[n] = d.filter(function(f) { return f !== fn; });
		}, this);
	}

	else if (this._actions[name] != null) {
		this._actions[name] = _.without(this._actions[name], fn);
	}

	return this;
}

function fireAction(action) {
	if (typeof action === "string") action = new Action(action);
	if (_.isObject(action) && !(action instanceof Action)) action = _.extend(new Action, action);
	if (!(action instanceof Action)) throw new Error("Expecting action name, object or instance of Action.");
	
	var name = action.name,
		args = slice.call(arguments, 1);

	args.unshift(action);

	if (this._actions != null && Array.isArray(this._actions[name])) {
		this._actions[name].some(function(fn) {
			if (!action.bubbles) return true;
			fn.apply(this, args);
		}, this);
	}

	if (action.bubbles && this.parent != null) {
		// find the first parent with the fire method
		var fireOn = this.parent;
		while (typeof fireOn.fireAction !== "function") {
			// if it has no parent, we can't do anything
			if (fireOn.parent == null) return;
			fireOn = fireOn.parent;
		}

		fireOn.fireAction.apply(fireOn, args);
	}
	
	return this;
}
},{"../":3,"underscore":17}],8:[function(require,module,exports){
var _ = require("underscore");

var plugins =
exports._plugins = {};

exports.loadPlugin = function(tpl, plugin, args) {
	if (_.isString(plugin)) {
		if (plugins[plugin] == null)
			throw new Error("No plugin exists with id '" + plugin + "'.");

		plugin = plugins[plugin];
	}

	if (!_.isFunction(plugin))
		throw new Error("Expecting string or function for plugin");

	// check if plugin is already loaded on this template
	if (tpl._loaded_plugins == null) tpl._loaded_plugins = [];
	if (~tpl._loaded_plugins.indexOf(plugin)) return tpl;
	tpl._loaded_plugins.push(plugin);

	if (args == null) args = [];
	if (!_.isArray(args)) args = [ args ];

	plugin.apply(tpl, args);
	return tpl;
}

var registerPlugin =
exports.registerPlugin = function(name, fn) {
	if (typeof name !== "string") {
		throw new Error("Expecting string name for plugin.");
	}

	if (typeof fn !== "function") {
		throw new Error("Expecting function for plugin.");
	}

	if (fn === plugins[name]) return;
	if (plugins[name] != null) {
		throw new Error("Refusing to overwrite existing plugin \"name\".");
	}

	plugins[name] = fn;
}

// load built in plugins
registerPlugin("actions", require("./actions"));
registerPlugin("twoway", require("./twoway"));
},{"./actions":7,"./twoway":9,"underscore":17}],9:[function(require,module,exports){
var _ = require("underscore");

var value_types = [ "radio", "option" ];

module.exports = function(options) {
	options = options || {};

	// add methods
	this.addFormBinding = addFormBinding;
	this.getFormBinding = getFormBinding;
	this.removeFormBinding = removeFormBinding;

	// add main binding decorator
	this.decorate("bind-to", function bindTo(d, id, lazy) {
		var fbind = this.getFormBinding(id);
		if (fbind == null) return;

		var el = d.target,
			type = getType(el),
			self = this,
			onChange, lazy;

		// detect changes to the input's value
		if (typeof fbind.change === "function") {
			onChange = function(e) {
				fbind.change.call(self, getNodeValue(el, type), d.model, e);
			};

			el.addEventListener("change", onChange);
			if (!(options.lazy || lazy)) el.addEventListener("keyup", onChange);

			d.comp.onInvalidate(function() {
				el.removeEventListener("change", onChange);
				el.removeEventListener("keyup", onChange);
			});
		}

		// reactively set the value on the input
		var c = this.autorun(function() {
			setNodeValue(el, fbind.get.call(self, d.model), type);
		});

		// setNodeValue relies on the children elements
		// those won't be in the DOM till at least the next tick
		c.invalidate();
	});

	// add value decorator for radios and options
	this.decorate("value", function valueOf(d, strval) {
		var el = d.target,
			type = getType(el),
			self = this;
		
		if (!_.contains(value_types, type)) {
			el.value = strval;
			return;
		}

		var args = this.renderArguments(d.template.arguments, d.model);
		el.$bound_value = args.length <= 1 ? args[0] : args;
		el.value = strval;
	}, { parse: "string" });

	// add initial form bindings
	var initialBinds = _.result(this, "twoway");
	if (_.isObject(initialBinds)) this.addFormBinding(initialBinds);
}

function addFormBinding(id, getter, onChange) {
	if (_.isObject(id)) {
		_.each(id, function(v, k) {
			addFormBinding.call(this, k, v);
		}, this);
		return this;
	}

	if (typeof id !== "string") throw new Error("Expecting a string for the form binding ID.");
	if (this._formBindings == null) this._formBindings = {};
	if (this._formBindings[id] != null) throw new Error("A form binding with id '" + id + "' already exists.");

	if (_.isObject(getter) && onChange == null) {
		onChange = getter.change;
		getter = getter.get;
	}

	if (typeof getter !== "function") throw new Error("Expecting a function or object for the form binding getter.");
	if (typeof onChange !== "function") onChange = null;

	this._formBindings[id] = {
		get: getter,
		change: onChange
	};

	return this;
}

function getFormBinding(id) {
	if (typeof id !== "string") return;
	var c = this, bindings;

	while (c != null) {
		bindings = c._formBindings;
		if (bindings != null && bindings[id] != null) return bindings[id];
		c = c.parent;
	}
}

function removeFormBinding(id) {
	var exists = this._formBindings[id] != null;
	delete this._formBindings[id];
	return exists;
}

var type_map = {
	"text": [ "text", "color", "email", "password", "search", "tel", "url", "hidden" ],
	"number": [ "number", "range" ],
	"date": [ "date", "datetime", "datetime-local", "month", "time", "week" ],
	"file": [ "file" ],
	"checkbox": [ "checkbox" ],
	"radio": [ "radio" ]
}

function getType(el) {
	switch (el.tagName.toLowerCase()) {
		case "input":
			for (var type in type_map) {
				if (_.contains(type_map[type], el.type)) return type;
			}
			break;

		case "select":
			return "select";

		case "option":
			return "option";

		case "textarea":
			return "text";
	}
}

function getNodeValue(node, type) {
	if (type == null) type = getType(node);
	var val;

	switch (type) {
		case "number":
			val = node.valueAsNumber;
			break;
		case "text":
			val = node.value;
			break;

		case "checkbox":
			val = node.checked;
			break;

		case "date":
			val = node.valueAsDate;
			break;

		case "select":
			var opt = node.querySelector("option:checked");
			if (opt != null) val = opt.$bound_value;
			break;

		case "file":
			val = !node.multiple ? node.files[0] : _.toArray(node.files);
			break;

		case "radio":
			val = node.$bound_value;
			break;
	}

	return val;
}

function setNodeValue(el, val, type) {
	if (type == null) type = getType(el);

	switch (type) {
		case "number":
			if (document.activeElement === el) return;
			if (_.isNumber(val)) el.valueAsNumber = val;
			else el.value = val;
			break;

		case "text":
			if (document.activeElement === el) return;
			el.value = val == null ? "" : val.toString();
			break;

		case "checkbox":
			el.checked = !!val;
			break;

		case "date":
			if (document.activeElement === el) return;
			if (_.isDate(val)) el.valueAsDate = val;
			else el.value = val;
			break;

		case "select":
			_.toArray(el.querySelectorAll("option")).forEach(function(opt) {
				opt.selected = opt.$bound_value === val;
			});
			break;

		case "radio":
			el.checked = el.$bound_value === val;
			break;
	}
}
},{"underscore":17}],10:[function(require,module,exports){
var _ = require("underscore"),
	Trackr = require("trackr"),
	util = require("./util"),
	Model = require("./model"),
	View = require("./view");

var Section =
module.exports = View.extend({
	constructor: function() {
		this.rows = {};
		this._row_deps = {};
		View.apply(this, arguments);
	},

	invert: function(val) {
		if (!_.isBoolean(val)) val = !this._inverted;
		this._inverted = val;
		return this;
	},

	isInverted: function() {
		return !!this._inverted;
	},

	setPath: function(path) {
		this._path = path;
		return this;
	},

	onRow: function(fn) {
		if (!_.isFunction(fn))
			throw new Error("Expecting function for row handler.");

		this._onRow = fn;
		return this;
	},

	addRow: function(key, data) {
		// remove existing
		this.removeRow(key);

		// convert data to model
		if (!Model.isModel(data)) {
			data = new Model(data, this.model);
		}

		// create a new row
		var row = new View(data);
		
		// set up render and mount it
		row.render = this._onRow;
		this.rows[key] = row;
		this.addMember(row);
		row.mount();

		return row;
	},

	hasRow: function(key) {
		return this.getRow(key) != null;
	},

	getRow: function(key) {
		return this.rows[key];
	},

	removeRow: function(key) {
		if (this.rows[key] == null) return this;

		var row = this.rows[key];
		this.removeMember(row);
		delete this.rows[key];

		return this;
	},

	removeAllRows: function() {
		Object.keys(this.rows).forEach(this.removeRow, this);
		return this;
	},

	render: function() {
		if (this._path == null) throw new Error("Missing path.");

		var self = this,
			val, isEmpty, inverted, isList,
			rowSort, model, proxy, keys;

		val = this.get(this._path);
		model = new Model(val, this.model);
		proxy = model.getProxyByValue(val);
		inverted = this.isInverted();
		isList = model.callProxyMethod(proxy, val, "isList");

		function getEmptiness() {
			return model.callProxyMethod(proxy, val, "isEmpty");
		}

		Trackr.nonreactive(function() {
			isEmpty = !val || (isList && !getEmptiness())
		});

		if (isEmpty && inverted) {
			if (isList) getEmptiness();
			this.addRow(0, model);
		} else if (!isEmpty && !inverted) {
			if (isList) {
				keys = [];

				this.autorun(function(comp) {
					var nkeys = model.callProxyMethod(proxy, val, "keys");

					// trick Trackr so autoruns aren't controlled by this one
					Trackr.currentComputation = comp._parent;

					// remove removed rows
					_.difference(keys, nkeys).forEach(function(key) {
						if (this._row_deps[key]) {
							this._row_deps[key].stop();
							delete this._row_deps[key];
						}

						this.removeRow(key);
					}, this);

					// add added rows
					_.difference(nkeys, keys).forEach(function(key) {
						var row, rmodel;

						row = this.getRow(key);
						rmodel = row != null ? row.model :
							new Model(null, new Model({ $key: key }, this.model));

						this._row_deps[key] = this.autorun(function(c) {
							rmodel.set(model.callProxyMethod(proxy, val, "get", key));
							// if (rowSort != null) rowSort.invalidate();
						});

						// add the row after we set the data
						if (row == null) this.addRow(key, rmodel);
					}, this);
						
					// pretend like nothing happened
					Trackr.currentComputation = comp;

					// the new set of keys
					keys = nkeys;
				});

				// a reactive context that continuously sorts rows
				// rowSort = this.autorun(function() {
					// console.log(keys);
					// var before = null, i, row;

					// for (i = keys.length - 1; i >= 0; i--) {
					// 	row = this.getRow(keys[i]);
					// 	if (row == null) continue;
					// 	this.insertBefore(row, before);
					// 	before = row;
					// }
				// });
			} else {
				this.addRow(0, model);
			}
		} else if (isList) {
			getEmptiness();
		}

		// auto clean
		this.once("invalidate", function() {
			this._row_deps = {};
			this.removeAllRows();
		});
	}

}, {

	isEmpty: function(model, proxy) {
		if (!model.data) return true;
		if (proxy == null) proxy = model.getProxyByValue(model.data);
		return model.callProxyMethod(proxy, model.data, "isList") &&
			model.callProxyMethod(proxy, model.data, "isEmpty");
	}

});

},{"./model":5,"./util":13,"./view":14,"trackr":16,"underscore":17}],11:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var util = require("./util");

var track =
exports.track = function(obj, replacer) {
	function replace(k, v) {
		var nval;
		if (typeof replacer === "function") nval = replacer.apply(this, arguments);
		if (typeof nval === "undefined" && typeof v !== "undefined") nval = track(v);
		return nval;
	}

	if (_.isArray(obj)) return trackArray(obj, replace)
	if (util.isPlainObject(obj)) return trackObject(obj, replace);
	return obj;
}

var trackProperty =
exports.trackProperty = function(obj, prop, value, options) {
	if (!_.isObject(obj)) throw new Error("Expecting object to define the reactive property on.");
	if (typeof prop !== "string") throw new Error("Expecting string for property name.");

	var dep = new Trackr.Dependency;
	
	Object.defineProperty(obj, prop, {
		configurable: options == null || options.configurable !== false,
		enumerable: options == null || options.enumerable !== false,
		set: function(val) {
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

var trackObject =
exports.trackObject = function(props, replacer) {
	if (props.__reactive) return props;

	var values = {};
	var deps = {};
	var mainDep = new Trackr.Dependency();

	function replace(ctx, name, value) {
		if (typeof value === "undefined") return;
		return Trackr.nonreactive(function() {
			return typeof replacer === "function" ? replacer.call(ctx, name, value) : value;
		});
	}

	function getter(name) {
		deps[name].depend();
		return values[name];
	}

	function setter(name, value) {
		var old = values[name];
		values[name] = replace(this, name, value);

		var dep = deps[name];
		if (dep == null) dep = deps[name] = new Trackr.Dependency();
		if (old !== values[name]) dep.changed();

		mainDep.changed();
		return values[name];
	}

	var _proto = typeof props.constructor === "function" ? Object.create(props.constructor.prototype) : {};

	_.extend(_proto, {

		defineProperty: function(name, value, options) {
			Object.defineProperty(this, name, {
				configurable: options == null || options.configurable !== false,
				enumerable: options == null || options.enumerable !== false,
				get: getter.bind(this, name),
				set: setter.bind(this, name)
			});

			this[name] = value;
			return this;
		},

		deleteProperty: function(name) {
			var dep = deps[name];
			if (delete this[name]) { // in case configurable === false
				delete values[name];
				delete deps[name];
				if (dep) dep.changed();
			}
			return this;
		},

		toJSON: function() {
			mainDep.depend();
			return _.clone(values);
		}

	});

	Object.defineProperty(_proto, "__reactive", {
		configurable: false,
		enumerable: false,
		value: true,
		writeable: false
	});

	var robj = Object.create(_proto);

	_.each(props, function(value, key) {
		robj.defineProperty(key, value);
	});

	return robj;
}

var trackArray =
exports.trackArray = function(arr, replacer) {
	if (!_.isArray(arr)) throw new Error("Expecting array.");
	if (arr.__reactive) return arr;
	
	var deps = { length: new Trackr.Dependency() };
	var values = {};
	var narr = util.patchArray([]);

	function replace(ctx, name, value) {
		if (typeof value === "undefined") return;
		return Trackr.nonreactive(function() {
			return typeof replacer === "function" ? replacer.call(ctx, name, value) : value;
		});
	}

	function getter(name) {
		deps[name].depend();
		return values[name];
	}

	function setter(name, value) {
		var old = values[name];
		values[name] = replace(this, name, value);

		var dep = deps[name];
		if (dep == null) dep = deps[name] = new Trackr.Dependency();
		if (old !== values[name]) dep.changed();

		return values[name];
	}

	function define(i) {
		var dep;

		if (typeof i === "number" && i >= narr.length) {
			if ((dep = deps[i]) != null) {
				delete deps[i];
			}

			delete narr[i];
			delete values[i];
			dep.changed();
			return;
		}

		setter.call(this, i, narr[i]);

		Object.defineProperty(narr, i.toString(), {
			configurable: true,
			enumerable: true,
			get: getter.bind(narr, i),
			set: setter.bind(narr, i)
		});
	}

	narr.observe(function(chg) {		
		var balance, start, end, len, i, prevlen;

		if (chg == null) return;

		balance = chg.added - chg.removed;
		if (!balance) return;

		len = narr.length;
		prevlen = len - balance;
		start = Math.min(prevlen, len);
		end = Math.max(prevlen, len);

		for (i = start; i < end; i++) define(i);
		deps.length.changed();
	});

	Object.defineProperty(narr, "__reactive", {
		configurable: false,
		enumerable: false,
		value: true,
		writeable: false
	});

	Object.defineProperty(narr, "$length", {
		configurable: false,
		enumerable: false,
		get: function() {
			deps.length.depend();
			return this.length;
		}
	});

	narr.push.apply(narr, arr);
	return narr;
}
},{"./util":13,"trackr":16,"underscore":17}],12:[function(require,module,exports){
module.exports = {
	ROOT              : 1,

	// XML/HTML
	HTML              : 2,
	TEXT              : 3,
	ELEMENT           : 4,
	ATTRIBUTE         : 5,
	XCOMMENT          : 6,

	// Mustache
	INTERPOLATOR      : 7,
	TRIPLE            : 8,
	SECTION           : 9,
	INVERTED          : 10,
	PARTIAL           : 11,
	MCOMMENT          : 12,

	// MISC
	LITERAL           : 13
}

},{}],13:[function(require,module,exports){
var _ = require("underscore");

// like underscore's result, but pass arguments through
exports.result = function(object, property) {
	var value = object == null ? void 0 : object[property];
	return _.isFunction(value) ? value.apply(object, Array.prototype.slice.call(arguments, 2)) : value;
};

// tests value as pojo (plain old javascript object)
var isPlainObject =
exports.isPlainObject = function(obj) {
	return obj != null && (obj.constructor === Object || obj.__proto__ === Object.prototype);
}

// tests function as a subclass of a parent function
// here, a class is technically a subclass of itself
exports.isSubClass = function(parent, fn) {
	return fn === parent || (fn != null && fn.prototype instanceof parent);
}

// cleans html, then converts html entities to unicode
exports.decodeEntities = (function() {
	if (typeof document === "undefined") return;

	// this prevents any overhead from creating the object each time
	var element = document.createElement('div');
	var entity = /&(?:#x[a-f0-9]+|#[0-9]+|[a-z0-9]+);?/ig;

	return function decodeHTMLEntities(str) {
		str = str.replace(entity, function(m) {
			element.innerHTML = m;
			return element.textContent;
		});

		element.textContent = '';
		return str;
	}
})();

// convert html into DOM nodes
exports.parseHTML = (function() {
	if (typeof document === "undefined") return;

	// this prevents any overhead from creating the object each time
	var element = document.createElement('div');

	return function parseHTML(html) {
		element.innerHTML = html != null ? html.toString() : "";
		var nodes = _.toArray(element.childNodes);
		for (var i in nodes) element.removeChild(nodes[i]);
		return nodes;
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

// array write operations
var mutatorMethods = [ 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ];

// patches an array so we can listen to write operations
var patchArray =
exports.patchArray = function(arr) {
	if (arr._patched) return arr;
	
	var patchedArrayProto = [],
		observers = [];

	mutatorMethods.forEach(function(methodName) {
		Object.defineProperty(patchedArrayProto, methodName, {
			value: method
		});

		function method() {
			var spliceEquivalent, summary, args, res;

			args = _.toArray(arguments);

			// convert the operation into a splice
			spliceEquivalent = getSpliceEquivalent(this, methodName, args);
			summary = summariseSpliceOperation(this, spliceEquivalent);

			// run the intended method
			res = Array.prototype[methodName].apply(this, args);

			// call the obersvsers
			observers.forEach(function(fn) {
				fn.call(this, summary);
			}, this);

			// return the result of the method
			return res;
		};
	});

	if (({}).__proto__) arr.__proto__ = patchedArrayProto;
	else {
		mutatorMethods.forEach(function(methodName) {
			Object.defineProperty(arr, methodName, {
				value: patchedArrayProto[methodName],
				configurable: true
			});
		});
	}

	_.each({
		_patched: true,
		observe: function(fn) {
			if (typeof fn !== "function") throw new Error("Expecting function to observe with.");
			observers.push(fn);
			return this;
		},
		stopObserving: function(fn) {
			var index = observers.indexOf(fn);
			if (index > -1) observers.splice(index, 1);
			return this;
		}
	}, function(v, k) {
		Object.defineProperty(arr, k, {
			configurable: false,
			enumerable: false,
			value: v,
			writeable: false
		});
	});

	return arr;
}

// converts array write operations into splice equivalent arguments
var getSpliceEquivalent =
exports.getSpliceEquivalent = function ( array, methodName, args ) {
	switch ( methodName ) {
		case 'splice':
			return args;

		case 'sort':
		case 'reverse':
			return null;

		case 'pop':
			if ( array.length ) {
				return [ -1 ];
			}
			return null;

		case 'push':
			return [ array.length, 0 ].concat( args );

		case 'shift':
			return [ 0, 1 ];

		case 'unshift':
			return [ 0, 0 ].concat( args );
	}
}

// returns a summary pf how an array will be changed after the splice operation
var summariseSpliceOperation =
exports.summariseSpliceOperation = function ( array, args ) {
	var index, addedItems, removedItems;

	if (!args) return null;

	// figure out where the changes started...
	index = +( args[0] < 0 ? array.length + args[0] : args[0] );

	// ...and how many items were added to or removed from the array
	addedItems = Math.max( 0, args.length - 2 );
	removedItems = ( args[1] !== undefined ? args[1] : array.length - index );

	// It's possible to do e.g. [ 1, 2, 3 ].splice( 2, 2 ) - i.e. the second argument
	// means removing more items from the end of the array than there are. In these
	// cases we need to curb JavaScript's enthusiasm or we'll get out of sync
	removedItems = Math.min( removedItems, array.length - index );

	return {
		index: index,
		added: addedItems,
		removed: removedItems
	};
}

},{"underscore":17}],14:[function(require,module,exports){
var _ = require("underscore"),
	Trackr = require("trackr"),
	Events = require("./events"),
	util = require("./util"),
	Model = require("./model"),
	Plugins = require("./plugins"),
	DOMRange = require("./domrange");

var View =
module.exports = DOMRange.extend({

	constructor: function(data, options) {
		// first we create the initial view state
		var state = _.result(this, "initialState") || _.result(this, "defaults");
		if (typeof state !== "undefined") {
			if (!Model.isModel(state)) {
				state = new Model(state, null, options && options.state);
			}
			
			// shove state between contexts
			if (Model.isModel(data)) {
				state.parent = data.parent;
				data.parent = state;
			}

			// add to the stack before the real data
			this.addData(state);
			this.stateModel = state;
			util.defineComputedProperty(this, "state", function() {
				return this.stateModel.data;
			});
		}

		// quick access to the top model data
		util.defineComputedProperty(this, "data", function() {
			return this.model.data;
		});

		// set the passed in data
		if (typeof data !== "undefined") this.addData(data, options);

		// initiate like a normal dom range
		DOMRange.call(this);

		// initialize with options
		this.initialize.call(this, options);
	},

	initialize: function(){},

	use: function(p) {
		return Plugins.loadPlugin(this, p, _.toArray(arguments).slice(1));
	},

	// adds data to the current stack
	addData: function(data, options) {
		if (!Model.isModel(data)) data = new Model(data, this.model, options);
		this.model = data;
		return this;
	},

	// attach + mount
	paint: function(p, n, _isMove, _isReplace) {
		DOMRange.prototype.attach.apply(this, arguments);
		if (!(_isMove || _isReplace || this.isMounted())) this.mount();
		return this;
	},

	// auto stop on detach
	detach: function(_isReplace) {
		if (!_isReplace) this.stop();
		DOMRange.prototype.detach.apply(this, arguments);
		return this;
	},

	autorun: function(fn, onlyOnActive) {
		var comp = Trackr.autorun(fn, this);
		if (onlyOnActive && !Trackr.active) comp.stop();
		return comp;
	},

	// a generalized reactive workflow helper
	mount: function() {
		var args = _.toArray(arguments), comp;

		Trackr.nonreactive(function() {
			// stop existing mount
			this.stop();

			// the first event in the cycle, before everything else
			this._mounting = true;
			this.trigger("mount:before", args);
		}, this);

		// the autorun computation
		comp = this._comp = this.autorun(function(comp) {
			this.render.apply(this, args);
			this.trigger("render", args, comp);

			// auto clean up
			comp.onInvalidate(function() {
				// remaining invalidate events
				this.trigger("invalidate", args, comp);

				// detect if the computation stopped
				if (comp.stopped) {
					this.trigger("stop", args);
					delete this._comp;
				}
			});
		});

		// remaining mount events happen after the first render
		Trackr.nonreactive(function() {
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

// chainable methods to proxy to model
[ "registerProxy" ]
.forEach(function(method) {
	View.prototype[method] = function() {
		this.model[method].apply(this.model, arguments);
		return this;
	}
});

// methods to proxy to model which don't return this
[ "set", "get", "getLocal", "getProxyByValue", "getModelAtOffset",
  "getRootModel", "findModel", "getContainerValue", "getAllModels"
].forEach(function(method) {
	View.prototype[method] = function() {
		return this.model[method].apply(this.model, arguments);
	}
});
},{"./domrange":1,"./events":2,"./model":5,"./plugins":8,"./util":13,"trackr":16,"underscore":17}],15:[function(require,module,exports){
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

},{}],16:[function(require,module,exports){
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

},{"_process":15}],17:[function(require,module,exports){
//     Underscore.js 1.8.2
//     http://underscorejs.org
//     (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.

(function() {

  // Baseline setup
  // --------------

  // Establish the root object, `window` in the browser, or `exports` on the server.
  var root = this;

  // Save the previous value of the `_` variable.
  var previousUnderscore = root._;

  // Save bytes in the minified (but not gzipped) version:
  var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;

  // Create quick reference variables for speed access to core prototypes.
  var
    push             = ArrayProto.push,
    slice            = ArrayProto.slice,
    toString         = ObjProto.toString,
    hasOwnProperty   = ObjProto.hasOwnProperty;

  // All **ECMAScript 5** native function implementations that we hope to use
  // are declared here.
  var
    nativeIsArray      = Array.isArray,
    nativeKeys         = Object.keys,
    nativeBind         = FuncProto.bind,
    nativeCreate       = Object.create;

  // Naked function reference for surrogate-prototype-swapping.
  var Ctor = function(){};

  // Create a safe reference to the Underscore object for use below.
  var _ = function(obj) {
    if (obj instanceof _) return obj;
    if (!(this instanceof _)) return new _(obj);
    this._wrapped = obj;
  };

  // Export the Underscore object for **Node.js**, with
  // backwards-compatibility for the old `require()` API. If we're in
  // the browser, add `_` as a global object.
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = _;
    }
    exports._ = _;
  } else {
    root._ = _;
  }

  // Current version.
  _.VERSION = '1.8.2';

  // Internal function that returns an efficient (for current engines) version
  // of the passed-in callback, to be repeatedly applied in other Underscore
  // functions.
  var optimizeCb = function(func, context, argCount) {
    if (context === void 0) return func;
    switch (argCount == null ? 3 : argCount) {
      case 1: return function(value) {
        return func.call(context, value);
      };
      case 2: return function(value, other) {
        return func.call(context, value, other);
      };
      case 3: return function(value, index, collection) {
        return func.call(context, value, index, collection);
      };
      case 4: return function(accumulator, value, index, collection) {
        return func.call(context, accumulator, value, index, collection);
      };
    }
    return function() {
      return func.apply(context, arguments);
    };
  };

  // A mostly-internal function to generate callbacks that can be applied
  // to each element in a collection, returning the desired result — either
  // identity, an arbitrary callback, a property matcher, or a property accessor.
  var cb = function(value, context, argCount) {
    if (value == null) return _.identity;
    if (_.isFunction(value)) return optimizeCb(value, context, argCount);
    if (_.isObject(value)) return _.matcher(value);
    return _.property(value);
  };
  _.iteratee = function(value, context) {
    return cb(value, context, Infinity);
  };

  // An internal function for creating assigner functions.
  var createAssigner = function(keysFunc, undefinedOnly) {
    return function(obj) {
      var length = arguments.length;
      if (length < 2 || obj == null) return obj;
      for (var index = 1; index < length; index++) {
        var source = arguments[index],
            keys = keysFunc(source),
            l = keys.length;
        for (var i = 0; i < l; i++) {
          var key = keys[i];
          if (!undefinedOnly || obj[key] === void 0) obj[key] = source[key];
        }
      }
      return obj;
    };
  };

  // An internal function for creating a new object that inherits from another.
  var baseCreate = function(prototype) {
    if (!_.isObject(prototype)) return {};
    if (nativeCreate) return nativeCreate(prototype);
    Ctor.prototype = prototype;
    var result = new Ctor;
    Ctor.prototype = null;
    return result;
  };

  // Helper for collection methods to determine whether a collection
  // should be iterated as an array or as an object
  // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  var isArrayLike = function(collection) {
    var length = collection && collection.length;
    return typeof length == 'number' && length >= 0 && length <= MAX_ARRAY_INDEX;
  };

  // Collection Functions
  // --------------------

  // The cornerstone, an `each` implementation, aka `forEach`.
  // Handles raw objects in addition to array-likes. Treats all
  // sparse array-likes as if they were dense.
  _.each = _.forEach = function(obj, iteratee, context) {
    iteratee = optimizeCb(iteratee, context);
    var i, length;
    if (isArrayLike(obj)) {
      for (i = 0, length = obj.length; i < length; i++) {
        iteratee(obj[i], i, obj);
      }
    } else {
      var keys = _.keys(obj);
      for (i = 0, length = keys.length; i < length; i++) {
        iteratee(obj[keys[i]], keys[i], obj);
      }
    }
    return obj;
  };

  // Return the results of applying the iteratee to each element.
  _.map = _.collect = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length,
        results = Array(length);
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      results[index] = iteratee(obj[currentKey], currentKey, obj);
    }
    return results;
  };

  // Create a reducing function iterating left or right.
  function createReduce(dir) {
    // Optimized iterator function as using arguments.length
    // in the main function will deoptimize the, see #1991.
    function iterator(obj, iteratee, memo, keys, index, length) {
      for (; index >= 0 && index < length; index += dir) {
        var currentKey = keys ? keys[index] : index;
        memo = iteratee(memo, obj[currentKey], currentKey, obj);
      }
      return memo;
    }

    return function(obj, iteratee, memo, context) {
      iteratee = optimizeCb(iteratee, context, 4);
      var keys = !isArrayLike(obj) && _.keys(obj),
          length = (keys || obj).length,
          index = dir > 0 ? 0 : length - 1;
      // Determine the initial value if none is provided.
      if (arguments.length < 3) {
        memo = obj[keys ? keys[index] : index];
        index += dir;
      }
      return iterator(obj, iteratee, memo, keys, index, length);
    };
  }

  // **Reduce** builds up a single result from a list of values, aka `inject`,
  // or `foldl`.
  _.reduce = _.foldl = _.inject = createReduce(1);

  // The right-associative version of reduce, also known as `foldr`.
  _.reduceRight = _.foldr = createReduce(-1);

  // Return the first value which passes a truth test. Aliased as `detect`.
  _.find = _.detect = function(obj, predicate, context) {
    var key;
    if (isArrayLike(obj)) {
      key = _.findIndex(obj, predicate, context);
    } else {
      key = _.findKey(obj, predicate, context);
    }
    if (key !== void 0 && key !== -1) return obj[key];
  };

  // Return all the elements that pass a truth test.
  // Aliased as `select`.
  _.filter = _.select = function(obj, predicate, context) {
    var results = [];
    predicate = cb(predicate, context);
    _.each(obj, function(value, index, list) {
      if (predicate(value, index, list)) results.push(value);
    });
    return results;
  };

  // Return all the elements for which a truth test fails.
  _.reject = function(obj, predicate, context) {
    return _.filter(obj, _.negate(cb(predicate)), context);
  };

  // Determine whether all of the elements match a truth test.
  // Aliased as `all`.
  _.every = _.all = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (!predicate(obj[currentKey], currentKey, obj)) return false;
    }
    return true;
  };

  // Determine if at least one element in the object matches a truth test.
  // Aliased as `any`.
  _.some = _.any = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = !isArrayLike(obj) && _.keys(obj),
        length = (keys || obj).length;
    for (var index = 0; index < length; index++) {
      var currentKey = keys ? keys[index] : index;
      if (predicate(obj[currentKey], currentKey, obj)) return true;
    }
    return false;
  };

  // Determine if the array or object contains a given value (using `===`).
  // Aliased as `includes` and `include`.
  _.contains = _.includes = _.include = function(obj, target, fromIndex) {
    if (!isArrayLike(obj)) obj = _.values(obj);
    return _.indexOf(obj, target, typeof fromIndex == 'number' && fromIndex) >= 0;
  };

  // Invoke a method (with arguments) on every item in a collection.
  _.invoke = function(obj, method) {
    var args = slice.call(arguments, 2);
    var isFunc = _.isFunction(method);
    return _.map(obj, function(value) {
      var func = isFunc ? method : value[method];
      return func == null ? func : func.apply(value, args);
    });
  };

  // Convenience version of a common use case of `map`: fetching a property.
  _.pluck = function(obj, key) {
    return _.map(obj, _.property(key));
  };

  // Convenience version of a common use case of `filter`: selecting only objects
  // containing specific `key:value` pairs.
  _.where = function(obj, attrs) {
    return _.filter(obj, _.matcher(attrs));
  };

  // Convenience version of a common use case of `find`: getting the first object
  // containing specific `key:value` pairs.
  _.findWhere = function(obj, attrs) {
    return _.find(obj, _.matcher(attrs));
  };

  // Return the maximum element (or element-based computation).
  _.max = function(obj, iteratee, context) {
    var result = -Infinity, lastComputed = -Infinity,
        value, computed;
    if (iteratee == null && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value > result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index, list) {
        computed = iteratee(value, index, list);
        if (computed > lastComputed || computed === -Infinity && result === -Infinity) {
          result = value;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Return the minimum element (or element-based computation).
  _.min = function(obj, iteratee, context) {
    var result = Infinity, lastComputed = Infinity,
        value, computed;
    if (iteratee == null && obj != null) {
      obj = isArrayLike(obj) ? obj : _.values(obj);
      for (var i = 0, length = obj.length; i < length; i++) {
        value = obj[i];
        if (value < result) {
          result = value;
        }
      }
    } else {
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index, list) {
        computed = iteratee(value, index, list);
        if (computed < lastComputed || computed === Infinity && result === Infinity) {
          result = value;
          lastComputed = computed;
        }
      });
    }
    return result;
  };

  // Shuffle a collection, using the modern version of the
  // [Fisher-Yates shuffle](http://en.wikipedia.org/wiki/Fisher–Yates_shuffle).
  _.shuffle = function(obj) {
    var set = isArrayLike(obj) ? obj : _.values(obj);
    var length = set.length;
    var shuffled = Array(length);
    for (var index = 0, rand; index < length; index++) {
      rand = _.random(0, index);
      if (rand !== index) shuffled[index] = shuffled[rand];
      shuffled[rand] = set[index];
    }
    return shuffled;
  };

  // Sample **n** random values from a collection.
  // If **n** is not specified, returns a single random element.
  // The internal `guard` argument allows it to work with `map`.
  _.sample = function(obj, n, guard) {
    if (n == null || guard) {
      if (!isArrayLike(obj)) obj = _.values(obj);
      return obj[_.random(obj.length - 1)];
    }
    return _.shuffle(obj).slice(0, Math.max(0, n));
  };

  // Sort the object's values by a criterion produced by an iteratee.
  _.sortBy = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    return _.pluck(_.map(obj, function(value, index, list) {
      return {
        value: value,
        index: index,
        criteria: iteratee(value, index, list)
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
    return function(obj, iteratee, context) {
      var result = {};
      iteratee = cb(iteratee, context);
      _.each(obj, function(value, index) {
        var key = iteratee(value, index, obj);
        behavior(result, value, key);
      });
      return result;
    };
  };

  // Groups the object's values by a criterion. Pass either a string attribute
  // to group by, or a function that returns the criterion.
  _.groupBy = group(function(result, value, key) {
    if (_.has(result, key)) result[key].push(value); else result[key] = [value];
  });

  // Indexes the object's values by a criterion, similar to `groupBy`, but for
  // when you know that your index values will be unique.
  _.indexBy = group(function(result, value, key) {
    result[key] = value;
  });

  // Counts instances of an object that group by a certain criterion. Pass
  // either a string attribute to count by, or a function that returns the
  // criterion.
  _.countBy = group(function(result, value, key) {
    if (_.has(result, key)) result[key]++; else result[key] = 1;
  });

  // Safely create a real, live array from anything iterable.
  _.toArray = function(obj) {
    if (!obj) return [];
    if (_.isArray(obj)) return slice.call(obj);
    if (isArrayLike(obj)) return _.map(obj, _.identity);
    return _.values(obj);
  };

  // Return the number of elements in an object.
  _.size = function(obj) {
    if (obj == null) return 0;
    return isArrayLike(obj) ? obj.length : _.keys(obj).length;
  };

  // Split a collection into two arrays: one whose elements all satisfy the given
  // predicate, and one whose elements all do not satisfy the predicate.
  _.partition = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var pass = [], fail = [];
    _.each(obj, function(value, key, obj) {
      (predicate(value, key, obj) ? pass : fail).push(value);
    });
    return [pass, fail];
  };

  // Array Functions
  // ---------------

  // Get the first element of an array. Passing **n** will return the first N
  // values in the array. Aliased as `head` and `take`. The **guard** check
  // allows it to work with `_.map`.
  _.first = _.head = _.take = function(array, n, guard) {
    if (array == null) return void 0;
    if (n == null || guard) return array[0];
    return _.initial(array, array.length - n);
  };

  // Returns everything but the last entry of the array. Especially useful on
  // the arguments object. Passing **n** will return all the values in
  // the array, excluding the last N.
  _.initial = function(array, n, guard) {
    return slice.call(array, 0, Math.max(0, array.length - (n == null || guard ? 1 : n)));
  };

  // Get the last element of an array. Passing **n** will return the last N
  // values in the array.
  _.last = function(array, n, guard) {
    if (array == null) return void 0;
    if (n == null || guard) return array[array.length - 1];
    return _.rest(array, Math.max(0, array.length - n));
  };

  // Returns everything but the first entry of the array. Aliased as `tail` and `drop`.
  // Especially useful on the arguments object. Passing an **n** will return
  // the rest N values in the array.
  _.rest = _.tail = _.drop = function(array, n, guard) {
    return slice.call(array, n == null || guard ? 1 : n);
  };

  // Trim out all falsy values from an array.
  _.compact = function(array) {
    return _.filter(array, _.identity);
  };

  // Internal implementation of a recursive `flatten` function.
  var flatten = function(input, shallow, strict, startIndex) {
    var output = [], idx = 0;
    for (var i = startIndex || 0, length = input && input.length; i < length; i++) {
      var value = input[i];
      if (isArrayLike(value) && (_.isArray(value) || _.isArguments(value))) {
        //flatten current level of array or arguments object
        if (!shallow) value = flatten(value, shallow, strict);
        var j = 0, len = value.length;
        output.length += len;
        while (j < len) {
          output[idx++] = value[j++];
        }
      } else if (!strict) {
        output[idx++] = value;
      }
    }
    return output;
  };

  // Flatten out an array, either recursively (by default), or just one level.
  _.flatten = function(array, shallow) {
    return flatten(array, shallow, false);
  };

  // Return a version of the array that does not contain the specified value(s).
  _.without = function(array) {
    return _.difference(array, slice.call(arguments, 1));
  };

  // Produce a duplicate-free version of the array. If the array has already
  // been sorted, you have the option of using a faster algorithm.
  // Aliased as `unique`.
  _.uniq = _.unique = function(array, isSorted, iteratee, context) {
    if (array == null) return [];
    if (!_.isBoolean(isSorted)) {
      context = iteratee;
      iteratee = isSorted;
      isSorted = false;
    }
    if (iteratee != null) iteratee = cb(iteratee, context);
    var result = [];
    var seen = [];
    for (var i = 0, length = array.length; i < length; i++) {
      var value = array[i],
          computed = iteratee ? iteratee(value, i, array) : value;
      if (isSorted) {
        if (!i || seen !== computed) result.push(value);
        seen = computed;
      } else if (iteratee) {
        if (!_.contains(seen, computed)) {
          seen.push(computed);
          result.push(value);
        }
      } else if (!_.contains(result, value)) {
        result.push(value);
      }
    }
    return result;
  };

  // Produce an array that contains the union: each distinct element from all of
  // the passed-in arrays.
  _.union = function() {
    return _.uniq(flatten(arguments, true, true));
  };

  // Produce an array that contains every item shared between all the
  // passed-in arrays.
  _.intersection = function(array) {
    if (array == null) return [];
    var result = [];
    var argsLength = arguments.length;
    for (var i = 0, length = array.length; i < length; i++) {
      var item = array[i];
      if (_.contains(result, item)) continue;
      for (var j = 1; j < argsLength; j++) {
        if (!_.contains(arguments[j], item)) break;
      }
      if (j === argsLength) result.push(item);
    }
    return result;
  };

  // Take the difference between one array and a number of other arrays.
  // Only the elements present in just the first array will remain.
  _.difference = function(array) {
    var rest = flatten(arguments, true, true, 1);
    return _.filter(array, function(value){
      return !_.contains(rest, value);
    });
  };

  // Zip together multiple lists into a single array -- elements that share
  // an index go together.
  _.zip = function() {
    return _.unzip(arguments);
  };

  // Complement of _.zip. Unzip accepts an array of arrays and groups
  // each array's elements on shared indices
  _.unzip = function(array) {
    var length = array && _.max(array, 'length').length || 0;
    var result = Array(length);

    for (var index = 0; index < length; index++) {
      result[index] = _.pluck(array, index);
    }
    return result;
  };

  // Converts lists into objects. Pass either a single array of `[key, value]`
  // pairs, or two parallel arrays of the same length -- one of keys, and one of
  // the corresponding values.
  _.object = function(list, values) {
    var result = {};
    for (var i = 0, length = list && list.length; i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // Return the position of the first occurrence of an item in an array,
  // or -1 if the item is not included in the array.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = function(array, item, isSorted) {
    var i = 0, length = array && array.length;
    if (typeof isSorted == 'number') {
      i = isSorted < 0 ? Math.max(0, length + isSorted) : isSorted;
    } else if (isSorted && length) {
      i = _.sortedIndex(array, item);
      return array[i] === item ? i : -1;
    }
    if (item !== item) {
      return _.findIndex(slice.call(array, i), _.isNaN);
    }
    for (; i < length; i++) if (array[i] === item) return i;
    return -1;
  };

  _.lastIndexOf = function(array, item, from) {
    var idx = array ? array.length : 0;
    if (typeof from == 'number') {
      idx = from < 0 ? idx + from + 1 : Math.min(idx, from + 1);
    }
    if (item !== item) {
      return _.findLastIndex(slice.call(array, 0, idx), _.isNaN);
    }
    while (--idx >= 0) if (array[idx] === item) return idx;
    return -1;
  };

  // Generator function to create the findIndex and findLastIndex functions
  function createIndexFinder(dir) {
    return function(array, predicate, context) {
      predicate = cb(predicate, context);
      var length = array != null && array.length;
      var index = dir > 0 ? 0 : length - 1;
      for (; index >= 0 && index < length; index += dir) {
        if (predicate(array[index], index, array)) return index;
      }
      return -1;
    };
  }

  // Returns the first index on an array-like that passes a predicate test
  _.findIndex = createIndexFinder(1);

  _.findLastIndex = createIndexFinder(-1);

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iteratee, context) {
    iteratee = cb(iteratee, context, 1);
    var value = iteratee(obj);
    var low = 0, high = array.length;
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      if (iteratee(array[mid]) < value) low = mid + 1; else high = mid;
    }
    return low;
  };

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (arguments.length <= 1) {
      stop = start || 0;
      start = 0;
    }
    step = step || 1;

    var length = Math.max(Math.ceil((stop - start) / step), 0);
    var range = Array(length);

    for (var idx = 0; idx < length; idx++, start += step) {
      range[idx] = start;
    }

    return range;
  };

  // Function (ahem) Functions
  // ------------------

  // Determines whether to execute a function as a constructor
  // or a normal function with the provided arguments
  var executeBound = function(sourceFunc, boundFunc, context, callingContext, args) {
    if (!(callingContext instanceof boundFunc)) return sourceFunc.apply(context, args);
    var self = baseCreate(sourceFunc.prototype);
    var result = sourceFunc.apply(self, args);
    if (_.isObject(result)) return result;
    return self;
  };

  // Create a function bound to a given object (assigning `this`, and arguments,
  // optionally). Delegates to **ECMAScript 5**'s native `Function.bind` if
  // available.
  _.bind = function(func, context) {
    if (nativeBind && func.bind === nativeBind) return nativeBind.apply(func, slice.call(arguments, 1));
    if (!_.isFunction(func)) throw new TypeError('Bind must be called on a function');
    var args = slice.call(arguments, 2);
    var bound = function() {
      return executeBound(func, bound, context, this, args.concat(slice.call(arguments)));
    };
    return bound;
  };

  // Partially apply a function by creating a version that has had some of its
  // arguments pre-filled, without changing its dynamic `this` context. _ acts
  // as a placeholder, allowing any combination of arguments to be pre-filled.
  _.partial = function(func) {
    var boundArgs = slice.call(arguments, 1);
    var bound = function() {
      var position = 0, length = boundArgs.length;
      var args = Array(length);
      for (var i = 0; i < length; i++) {
        args[i] = boundArgs[i] === _ ? arguments[position++] : boundArgs[i];
      }
      while (position < arguments.length) args.push(arguments[position++]);
      return executeBound(func, bound, this, this, args);
    };
    return bound;
  };

  // Bind a number of an object's methods to that object. Remaining arguments
  // are the method names to be bound. Useful for ensuring that all callbacks
  // defined on an object belong to it.
  _.bindAll = function(obj) {
    var i, length = arguments.length, key;
    if (length <= 1) throw new Error('bindAll must be passed function names');
    for (i = 1; i < length; i++) {
      key = arguments[i];
      obj[key] = _.bind(obj[key], obj);
    }
    return obj;
  };

  // Memoize an expensive function by storing its results.
  _.memoize = function(func, hasher) {
    var memoize = function(key) {
      var cache = memoize.cache;
      var address = '' + (hasher ? hasher.apply(this, arguments) : key);
      if (!_.has(cache, address)) cache[address] = func.apply(this, arguments);
      return cache[address];
    };
    memoize.cache = {};
    return memoize;
  };

  // Delays a function for the given number of milliseconds, and then calls
  // it with the arguments supplied.
  _.delay = function(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function(){
      return func.apply(null, args);
    }, wait);
  };

  // Defers a function, scheduling it to run after the current call stack has
  // cleared.
  _.defer = _.partial(_.delay, _, 1);

  // Returns a function, that, when invoked, will only be triggered at most once
  // during a given window of time. Normally, the throttled function will run
  // as much as it can, without ever going more than once per `wait` duration;
  // but if you'd like to disable the execution on the leading edge, pass
  // `{leading: false}`. To disable execution on the trailing edge, ditto.
  _.throttle = function(func, wait, options) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    if (!options) options = {};
    var later = function() {
      previous = options.leading === false ? 0 : _.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    };
    return function() {
      var now = _.now();
      if (!previous && options.leading === false) previous = now;
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) context = args = null;
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

      if (last < wait && last >= 0) {
        timeout = setTimeout(later, wait - last);
      } else {
        timeout = null;
        if (!immediate) {
          result = func.apply(context, args);
          if (!timeout) context = args = null;
        }
      }
    };

    return function() {
      context = this;
      args = arguments;
      timestamp = _.now();
      var callNow = immediate && !timeout;
      if (!timeout) timeout = setTimeout(later, wait);
      if (callNow) {
        result = func.apply(context, args);
        context = args = null;
      }

      return result;
    };
  };

  // Returns the first function passed as an argument to the second,
  // allowing you to adjust arguments, run code before and after, and
  // conditionally execute the original function.
  _.wrap = function(func, wrapper) {
    return _.partial(wrapper, func);
  };

  // Returns a negated version of the passed-in predicate.
  _.negate = function(predicate) {
    return function() {
      return !predicate.apply(this, arguments);
    };
  };

  // Returns a function that is the composition of a list of functions, each
  // consuming the return value of the function that follows.
  _.compose = function() {
    var args = arguments;
    var start = args.length - 1;
    return function() {
      var i = start;
      var result = args[start].apply(this, arguments);
      while (i--) result = args[i].call(this, result);
      return result;
    };
  };

  // Returns a function that will only be executed on and after the Nth call.
  _.after = function(times, func) {
    return function() {
      if (--times < 1) {
        return func.apply(this, arguments);
      }
    };
  };

  // Returns a function that will only be executed up to (but not including) the Nth call.
  _.before = function(times, func) {
    var memo;
    return function() {
      if (--times > 0) {
        memo = func.apply(this, arguments);
      }
      if (times <= 1) func = null;
      return memo;
    };
  };

  // Returns a function that will be executed at most one time, no matter how
  // often you call it. Useful for lazy initialization.
  _.once = _.partial(_.before, 2);

  // Object Functions
  // ----------------

  // Keys in IE < 9 that won't be iterated by `for key in ...` and thus missed.
  var hasEnumBug = !{toString: null}.propertyIsEnumerable('toString');
  var nonEnumerableProps = ['valueOf', 'isPrototypeOf', 'toString',
                      'propertyIsEnumerable', 'hasOwnProperty', 'toLocaleString'];

  function collectNonEnumProps(obj, keys) {
    var nonEnumIdx = nonEnumerableProps.length;
    var constructor = obj.constructor;
    var proto = (_.isFunction(constructor) && constructor.prototype) || ObjProto;

    // Constructor is a special case.
    var prop = 'constructor';
    if (_.has(obj, prop) && !_.contains(keys, prop)) keys.push(prop);

    while (nonEnumIdx--) {
      prop = nonEnumerableProps[nonEnumIdx];
      if (prop in obj && obj[prop] !== proto[prop] && !_.contains(keys, prop)) {
        keys.push(prop);
      }
    }
  }

  // Retrieve the names of an object's own properties.
  // Delegates to **ECMAScript 5**'s native `Object.keys`
  _.keys = function(obj) {
    if (!_.isObject(obj)) return [];
    if (nativeKeys) return nativeKeys(obj);
    var keys = [];
    for (var key in obj) if (_.has(obj, key)) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve all the property names of an object.
  _.allKeys = function(obj) {
    if (!_.isObject(obj)) return [];
    var keys = [];
    for (var key in obj) keys.push(key);
    // Ahem, IE < 9.
    if (hasEnumBug) collectNonEnumProps(obj, keys);
    return keys;
  };

  // Retrieve the values of an object's properties.
  _.values = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var values = Array(length);
    for (var i = 0; i < length; i++) {
      values[i] = obj[keys[i]];
    }
    return values;
  };

  // Returns the results of applying the iteratee to each element of the object
  // In contrast to _.map it returns an object
  _.mapObject = function(obj, iteratee, context) {
    iteratee = cb(iteratee, context);
    var keys =  _.keys(obj),
          length = keys.length,
          results = {},
          currentKey;
      for (var index = 0; index < length; index++) {
        currentKey = keys[index];
        results[currentKey] = iteratee(obj[currentKey], currentKey, obj);
      }
      return results;
  };

  // Convert an object into a list of `[key, value]` pairs.
  _.pairs = function(obj) {
    var keys = _.keys(obj);
    var length = keys.length;
    var pairs = Array(length);
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
  _.extend = createAssigner(_.allKeys);

  // Assigns a given object with all the own properties in the passed-in object(s)
  // (https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object/assign)
  _.extendOwn = _.assign = createAssigner(_.keys);

  // Returns the first key on an object that passes a predicate test
  _.findKey = function(obj, predicate, context) {
    predicate = cb(predicate, context);
    var keys = _.keys(obj), key;
    for (var i = 0, length = keys.length; i < length; i++) {
      key = keys[i];
      if (predicate(obj[key], key, obj)) return key;
    }
  };

  // Return a copy of the object only containing the whitelisted properties.
  _.pick = function(object, oiteratee, context) {
    var result = {}, obj = object, iteratee, keys;
    if (obj == null) return result;
    if (_.isFunction(oiteratee)) {
      keys = _.allKeys(obj);
      iteratee = optimizeCb(oiteratee, context);
    } else {
      keys = flatten(arguments, false, false, 1);
      iteratee = function(value, key, obj) { return key in obj; };
      obj = Object(obj);
    }
    for (var i = 0, length = keys.length; i < length; i++) {
      var key = keys[i];
      var value = obj[key];
      if (iteratee(value, key, obj)) result[key] = value;
    }
    return result;
  };

   // Return a copy of the object without the blacklisted properties.
  _.omit = function(obj, iteratee, context) {
    if (_.isFunction(iteratee)) {
      iteratee = _.negate(iteratee);
    } else {
      var keys = _.map(flatten(arguments, false, false, 1), String);
      iteratee = function(value, key) {
        return !_.contains(keys, key);
      };
    }
    return _.pick(obj, iteratee, context);
  };

  // Fill in a given object with default properties.
  _.defaults = createAssigner(_.allKeys, true);

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

  // Returns whether an object has a given set of `key:value` pairs.
  _.isMatch = function(object, attrs) {
    var keys = _.keys(attrs), length = keys.length;
    if (object == null) return !length;
    var obj = Object(object);
    for (var i = 0; i < length; i++) {
      var key = keys[i];
      if (attrs[key] !== obj[key] || !(key in obj)) return false;
    }
    return true;
  };


  // Internal recursive comparison function for `isEqual`.
  var eq = function(a, b, aStack, bStack) {
    // Identical objects are equal. `0 === -0`, but they aren't identical.
    // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
    if (a === b) return a !== 0 || 1 / a === 1 / b;
    // A strict comparison is necessary because `null == undefined`.
    if (a == null || b == null) return a === b;
    // Unwrap any wrapped objects.
    if (a instanceof _) a = a._wrapped;
    if (b instanceof _) b = b._wrapped;
    // Compare `[[Class]]` names.
    var className = toString.call(a);
    if (className !== toString.call(b)) return false;
    switch (className) {
      // Strings, numbers, regular expressions, dates, and booleans are compared by value.
      case '[object RegExp]':
      // RegExps are coerced to strings for comparison (Note: '' + /a/i === '/a/i')
      case '[object String]':
        // Primitives and their corresponding object wrappers are equivalent; thus, `"5"` is
        // equivalent to `new String("5")`.
        return '' + a === '' + b;
      case '[object Number]':
        // `NaN`s are equivalent, but non-reflexive.
        // Object(NaN) is equivalent to NaN
        if (+a !== +a) return +b !== +b;
        // An `egal` comparison is performed for other numeric values.
        return +a === 0 ? 1 / +a === 1 / b : +a === +b;
      case '[object Date]':
      case '[object Boolean]':
        // Coerce dates and booleans to numeric primitive values. Dates are compared by their
        // millisecond representations. Note that invalid dates with millisecond representations
        // of `NaN` are not equivalent.
        return +a === +b;
    }

    var areArrays = className === '[object Array]';
    if (!areArrays) {
      if (typeof a != 'object' || typeof b != 'object') return false;

      // Objects with different constructors are not equivalent, but `Object`s or `Array`s
      // from different frames are.
      var aCtor = a.constructor, bCtor = b.constructor;
      if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor &&
                               _.isFunction(bCtor) && bCtor instanceof bCtor)
                          && ('constructor' in a && 'constructor' in b)) {
        return false;
      }
    }
    // Assume equality for cyclic structures. The algorithm for detecting cyclic
    // structures is adapted from ES 5.1 section 15.12.3, abstract operation `JO`.
    
    // Initializing stack of traversed objects.
    // It's done here since we only need them for objects and arrays comparison.
    aStack = aStack || [];
    bStack = bStack || [];
    var length = aStack.length;
    while (length--) {
      // Linear search. Performance is inversely proportional to the number of
      // unique nested structures.
      if (aStack[length] === a) return bStack[length] === b;
    }

    // Add the first object to the stack of traversed objects.
    aStack.push(a);
    bStack.push(b);

    // Recursively compare objects and arrays.
    if (areArrays) {
      // Compare array lengths to determine if a deep comparison is necessary.
      length = a.length;
      if (length !== b.length) return false;
      // Deep compare the contents, ignoring non-numeric properties.
      while (length--) {
        if (!eq(a[length], b[length], aStack, bStack)) return false;
      }
    } else {
      // Deep compare objects.
      var keys = _.keys(a), key;
      length = keys.length;
      // Ensure that both objects contain the same number of properties before comparing deep equality.
      if (_.keys(b).length !== length) return false;
      while (length--) {
        // Deep compare each member
        key = keys[length];
        if (!(_.has(b, key) && eq(a[key], b[key], aStack, bStack))) return false;
      }
    }
    // Remove the first object from the stack of traversed objects.
    aStack.pop();
    bStack.pop();
    return true;
  };

  // Perform a deep comparison to check if two objects are equal.
  _.isEqual = function(a, b) {
    return eq(a, b);
  };

  // Is a given array, string, or object empty?
  // An "empty" object has no enumerable own-properties.
  _.isEmpty = function(obj) {
    if (obj == null) return true;
    if (isArrayLike(obj) && (_.isArray(obj) || _.isString(obj) || _.isArguments(obj))) return obj.length === 0;
    return _.keys(obj).length === 0;
  };

  // Is a given value a DOM element?
  _.isElement = function(obj) {
    return !!(obj && obj.nodeType === 1);
  };

  // Is a given value an array?
  // Delegates to ECMA5's native Array.isArray
  _.isArray = nativeIsArray || function(obj) {
    return toString.call(obj) === '[object Array]';
  };

  // Is a given variable an object?
  _.isObject = function(obj) {
    var type = typeof obj;
    return type === 'function' || type === 'object' && !!obj;
  };

  // Add some isType methods: isArguments, isFunction, isString, isNumber, isDate, isRegExp, isError.
  _.each(['Arguments', 'Function', 'String', 'Number', 'Date', 'RegExp', 'Error'], function(name) {
    _['is' + name] = function(obj) {
      return toString.call(obj) === '[object ' + name + ']';
    };
  });

  // Define a fallback version of the method in browsers (ahem, IE < 9), where
  // there isn't any inspectable "Arguments" type.
  if (!_.isArguments(arguments)) {
    _.isArguments = function(obj) {
      return _.has(obj, 'callee');
    };
  }

  // Optimize `isFunction` if appropriate. Work around some typeof bugs in old v8,
  // IE 11 (#1621), and in Safari 8 (#1929).
  if (typeof /./ != 'function' && typeof Int8Array != 'object') {
    _.isFunction = function(obj) {
      return typeof obj == 'function' || false;
    };
  }

  // Is a given object a finite number?
  _.isFinite = function(obj) {
    return isFinite(obj) && !isNaN(parseFloat(obj));
  };

  // Is the given value `NaN`? (NaN is the only number which does not equal itself).
  _.isNaN = function(obj) {
    return _.isNumber(obj) && obj !== +obj;
  };

  // Is a given value a boolean?
  _.isBoolean = function(obj) {
    return obj === true || obj === false || toString.call(obj) === '[object Boolean]';
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
    return obj != null && hasOwnProperty.call(obj, key);
  };

  // Utility Functions
  // -----------------

  // Run Underscore.js in *noConflict* mode, returning the `_` variable to its
  // previous owner. Returns a reference to the Underscore object.
  _.noConflict = function() {
    root._ = previousUnderscore;
    return this;
  };

  // Keep the identity function around for default iteratees.
  _.identity = function(value) {
    return value;
  };

  // Predicate-generating functions. Often useful outside of Underscore.
  _.constant = function(value) {
    return function() {
      return value;
    };
  };

  _.noop = function(){};

  _.property = function(key) {
    return function(obj) {
      return obj == null ? void 0 : obj[key];
    };
  };

  // Generates a function for a given object that returns a given property.
  _.propertyOf = function(obj) {
    return obj == null ? function(){} : function(key) {
      return obj[key];
    };
  };

  // Returns a predicate for checking whether an object has a given set of 
  // `key:value` pairs.
  _.matcher = _.matches = function(attrs) {
    attrs = _.extendOwn({}, attrs);
    return function(obj) {
      return _.isMatch(obj, attrs);
    };
  };

  // Run a function **n** times.
  _.times = function(n, iteratee, context) {
    var accum = Array(Math.max(0, n));
    iteratee = optimizeCb(iteratee, context, 1);
    for (var i = 0; i < n; i++) accum[i] = iteratee(i);
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
  _.now = Date.now || function() {
    return new Date().getTime();
  };

   // List of HTML entities for escaping.
  var escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '`': '&#x60;'
  };
  var unescapeMap = _.invert(escapeMap);

  // Functions for escaping and unescaping strings to/from HTML interpolation.
  var createEscaper = function(map) {
    var escaper = function(match) {
      return map[match];
    };
    // Regexes for identifying a key that needs to be escaped
    var source = '(?:' + _.keys(map).join('|') + ')';
    var testRegexp = RegExp(source);
    var replaceRegexp = RegExp(source, 'g');
    return function(string) {
      string = string == null ? '' : '' + string;
      return testRegexp.test(string) ? string.replace(replaceRegexp, escaper) : string;
    };
  };
  _.escape = createEscaper(escapeMap);
  _.unescape = createEscaper(unescapeMap);

  // If the value of the named `property` is a function then invoke it with the
  // `object` as context; otherwise, return it.
  _.result = function(object, property, fallback) {
    var value = object == null ? void 0 : object[property];
    if (value === void 0) {
      value = fallback;
    }
    return _.isFunction(value) ? value.call(object) : value;
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
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  var escaper = /\\|'|\r|\n|\u2028|\u2029/g;

  var escapeChar = function(match) {
    return '\\' + escapes[match];
  };

  // JavaScript micro-templating, similar to John Resig's implementation.
  // Underscore templating handles arbitrary delimiters, preserves whitespace,
  // and correctly escapes quotes within interpolated code.
  // NB: `oldSettings` only exists for backwards compatibility.
  _.template = function(text, settings, oldSettings) {
    if (!settings && oldSettings) settings = oldSettings;
    settings = _.defaults({}, settings, _.templateSettings);

    // Combine delimiters into one regular expression via alternation.
    var matcher = RegExp([
      (settings.escape || noMatch).source,
      (settings.interpolate || noMatch).source,
      (settings.evaluate || noMatch).source
    ].join('|') + '|$', 'g');

    // Compile the template source, escaping string literals appropriately.
    var index = 0;
    var source = "__p+='";
    text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
      source += text.slice(index, offset).replace(escaper, escapeChar);
      index = offset + match.length;

      if (escape) {
        source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'";
      } else if (interpolate) {
        source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
      } else if (evaluate) {
        source += "';\n" + evaluate + "\n__p+='";
      }

      // Adobe VMs need the match returned to produce the correct offest.
      return match;
    });
    source += "';\n";

    // If a variable is not specified, place data values in local scope.
    if (!settings.variable) source = 'with(obj||{}){\n' + source + '}\n';

    source = "var __t,__p='',__j=Array.prototype.join," +
      "print=function(){__p+=__j.call(arguments,'');};\n" +
      source + 'return __p;\n';

    try {
      var render = new Function(settings.variable || 'obj', '_', source);
    } catch (e) {
      e.source = source;
      throw e;
    }

    var template = function(data) {
      return render.call(this, data, _);
    };

    // Provide the compiled source as a convenience for precompilation.
    var argument = settings.variable || 'obj';
    template.source = 'function(' + argument + '){\n' + source + '}';

    return template;
  };

  // Add a "chain" function. Start chaining a wrapped Underscore object.
  _.chain = function(obj) {
    var instance = _(obj);
    instance._chain = true;
    return instance;
  };

  // OOP
  // ---------------
  // If Underscore is called as a function, it returns a wrapped object that
  // can be used OO-style. This wrapper holds altered versions of all the
  // underscore functions. Wrapped objects may be chained.

  // Helper function to continue chaining intermediate results.
  var result = function(instance, obj) {
    return instance._chain ? _(obj).chain() : obj;
  };

  // Add your own custom functions to the Underscore object.
  _.mixin = function(obj) {
    _.each(_.functions(obj), function(name) {
      var func = _[name] = obj[name];
      _.prototype[name] = function() {
        var args = [this._wrapped];
        push.apply(args, arguments);
        return result(this, func.apply(_, args));
      };
    });
  };

  // Add all of the Underscore functions to the wrapper object.
  _.mixin(_);

  // Add all mutator Array functions to the wrapper.
  _.each(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      var obj = this._wrapped;
      method.apply(obj, arguments);
      if ((name === 'shift' || name === 'splice') && obj.length === 0) delete obj[0];
      return result(this, obj);
    };
  });

  // Add all accessor Array functions to the wrapper.
  _.each(['concat', 'join', 'slice'], function(name) {
    var method = ArrayProto[name];
    _.prototype[name] = function() {
      return result(this, method.apply(this._wrapped, arguments));
    };
  });

  // Extracts the result from a wrapped and chained object.
  _.prototype.value = function() {
    return this._wrapped;
  };

  // Provide unwrapping proxy for some methods used in engine operations
  // such as arithmetic and JSON stringification.
  _.prototype.valueOf = _.prototype.toJSON = _.prototype.value;
  
  _.prototype.toString = function() {
    return '' + this._wrapped;
  };

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
}.call(this));

},{}]},{},[3])(3)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZG9tcmFuZ2UuanMiLCJsaWIvZXZlbnRzLmpzIiwibGliL2luZGV4LmpzIiwibGliL20reG1sLmpzIiwibGliL21vZGVsLmpzIiwibGliL211c3RhY2hlLmpzIiwibGliL3BsdWdpbnMvYWN0aW9ucy5qcyIsImxpYi9wbHVnaW5zL2luZGV4LmpzIiwibGliL3BsdWdpbnMvdHdvd2F5LmpzIiwibGliL3NlY3Rpb24uanMiLCJsaWIvdHJhY2suanMiLCJsaWIvdHlwZXMuanMiLCJsaWIvdXRpbC5qcyIsImxpYi92aWV3LmpzIiwibm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIiwibm9kZV9tb2R1bGVzL3VuZGVyc2NvcmUvdW5kZXJzY29yZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNubUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaGVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7QUN6REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUN6aEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBUaGlzIGlzIGEgaGVhdmlseSBtb2RpZmllZCB2ZXJzaW9uIG9mIE1ldGVvcidzIERPTVJhbmdlIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iLzQwNTAwOWEyYzNkY2QzYzFmZTc4MGFkYjI4NjdkMzhhNmE0MmZmZjEvcGFja2FnZXMvYmxhemUvZG9tcmFuZ2UuanMgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdEV2ZW50cyA9IHJlcXVpcmUoXCIuL2V2ZW50c1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKGEpIHtcblx0cmV0dXJuIGEgIT0gbnVsbCAmJiB0eXBlb2YgYS5sZW5ndGggPT09IFwibnVtYmVyXCI7XG59XG5cbi8vIGBbbmV3XSBCbGF6ZS5fRE9NUmFuZ2UoW25vZGVBbmRSYW5nZUFycmF5XSlgXG4vL1xuLy8gQSBET01SYW5nZSBjb25zaXN0cyBvZiBhbiBhcnJheSBvZiBjb25zZWN1dGl2ZSBub2RlcyBhbmQgRE9NUmFuZ2VzLFxuLy8gd2hpY2ggbWF5IGJlIHJlcGxhY2VkIGF0IGFueSB0aW1lIHdpdGggYSBuZXcgYXJyYXkuICBJZiB0aGUgRE9NUmFuZ2Vcbi8vIGhhcyBiZWVuIGF0dGFjaGVkIHRvIHRoZSBET00gYXQgc29tZSBsb2NhdGlvbiwgdGhlbiB1cGRhdGluZ1xuLy8gdGhlIGFycmF5IHdpbGwgY2F1c2UgdGhlIERPTSB0byBiZSB1cGRhdGVkIGF0IHRoYXQgbG9jYXRpb24uXG5mdW5jdGlvbiBET01SYW5nZShub2RlQW5kUmFuZ2VBcnJheSkge1xuXHQvLyBjYWxsZWQgd2l0aG91dCBgbmV3YFxuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgRE9NUmFuZ2UpKSB7XG5cdFx0cmV0dXJuIG5ldyBET01SYW5nZShub2RlQW5kUmFuZ2VBcnJheSk7XG5cdH1cblxuXHR2YXIgbWVtYmVycyA9IChub2RlQW5kUmFuZ2VBcnJheSB8fCBbXSk7XG5cdGlmICghaXNBcnJheUxpa2UobWVtYmVycykpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGFycmF5XCIpO1xuXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdHRoaXMuX21lbWJlckluKG1lbWJlcnNbaV0pO1xuXHR9XG5cblx0dGhpcy5tZW1iZXJzID0gbWVtYmVycztcblx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdHRoaXMuYXR0YWNoZWQgPSBmYWxzZTtcblx0dGhpcy5wYXJlbnRFbGVtZW50ID0gbnVsbDtcblx0dGhpcy5wYXJlbnRSYW5nZSA9IG51bGw7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTVJhbmdlO1xuRE9NUmFuZ2UuZXh0ZW5kID0gdXRpbC5zdWJjbGFzcztcblxuLy8gZmluZHMgdGhlIERPTVJhbmdlIHRoZSBlbGVtZW50IGlzIGEgcGFydCBvZlxuRE9NUmFuZ2UuZm9yRWxlbWVudCA9IGZ1bmN0aW9uIChlbGVtKSB7XG5cdGlmIChlbGVtLm5vZGVUeXBlICE9PSAxKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBlbGVtZW50LCBmb3VuZDogXCIgKyBlbGVtKTtcblx0XG5cdHZhciByYW5nZSA9IG51bGw7XG5cdFxuXHR3aGlsZSAoZWxlbSAmJiAhcmFuZ2UpIHtcblx0XHRyYW5nZSA9IChlbGVtLiRkb21yYW5nZSB8fCBudWxsKTtcblx0XHRlbGVtID0gZWxlbS5wYXJlbnROb2RlO1xuXHR9XG5cblx0cmV0dXJuIHJhbmdlO1xufTtcblxuXy5leHRlbmQoRE9NUmFuZ2UucHJvdG90eXBlLCBFdmVudHMsIHtcblxuXHQvLyBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgdG8gaW5zZXJ0IHRoZSBET01SYW5nZSBpbnRvIHRoZSBET00gZm9yXG5cdC8vIHRoZSBmaXJzdCB0aW1lLCBidXQgaXQncyBhbHNvIHVzZWQgaW50ZXJuYWxseSB3aGVuXG5cdC8vIHVwZGF0aW5nIHRoZSBET00uXG5cdC8vIElmIF9pc01vdmUgaXMgdHJ1ZSwgbW92ZSB0aGlzIGF0dGFjaGVkIHJhbmdlIHRvIGEgZGlmZmVyZW50XG5cdC8vIGxvY2F0aW9uIHVuZGVyIHRoZSBzYW1lIHBhcmVudEVsZW1lbnQuXG5cdGF0dGFjaDogZnVuY3Rpb24ocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUsIF9pc1JlcGxhY2UpIHtcblx0XHRpZiAodHlwZW9mIHBhcmVudEVsZW1lbnQgPT09IFwic3RyaW5nXCIpIHBhcmVudEVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHBhcmVudEVsZW1lbnQpO1xuXHRcdGlmICh0eXBlb2YgbmV4dE5vZGUgPT09IFwic3RyaW5nXCIpIG5leHROb2RlID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IobmV4dE5vZGUpO1xuXHRcdGlmIChwYXJlbnRFbGVtZW50ID09IG51bGwpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIHZhbGlkIERPTSBlbGVtZW50IHRvIGF0dGFjaCBpbi5cIik7XG5cblx0XHRpZiAoKF9pc01vdmUgfHwgX2lzUmVwbGFjZSkgJiYgISh0aGlzLnBhcmVudEVsZW1lbnQgPT09IHBhcmVudEVsZW1lbnQgJiYgdGhpcy5hdHRhY2hlZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkNhbiBvbmx5IG1vdmUgb3IgcmVwbGFjZSBhbiBhdHRhY2hlZCBET01SYW5nZSwgYW5kIG9ubHkgdW5kZXIgdGhlIHNhbWUgcGFyZW50IGVsZW1lbnRcIik7XG5cdFx0fVxuXG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0aWYgKG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gbnVsbDtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpbnNlcnRJbnRvRE9NKG1lbWJlcnNbaV0sIHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXJOb2RlKCk7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0XHRwYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZShwbGFjZWhvbGRlciwgbmV4dE5vZGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuYXR0YWNoZWQgPSB0cnVlO1xuXHRcdHRoaXMucGFyZW50RWxlbWVudCA9IHBhcmVudEVsZW1lbnQ7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50cyBvbmx5IG9uIGZyZXNoIGF0dGFjaG1lbnRzXG5cdFx0aWYgKCEoX2lzTW92ZSB8fCBfaXNSZXBsYWNlKSkgdGhpcy50cmlnZ2VyKFwiYXR0YWNoXCIsIHBhcmVudEVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZGV0YWNoOiBmdW5jdGlvbihfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSByZXR1cm4gdGhpcztcblxuXHRcdHZhciBvbGRQYXJlbnRFbGVtZW50ID0gdGhpcy5wYXJlbnRFbGVtZW50O1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGlmIChtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtZW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHJlbW92ZUZyb21ET00obWVtYmVyc1tpXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwbGFjZWhvbGRlciA9IHRoaXMucGxhY2Vob2xkZXI7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQocGxhY2Vob2xkZXIpO1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCFfaXNSZXBsYWNlKSB7XG5cdFx0XHR0aGlzLmF0dGFjaGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQgPSBudWxsO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiZGV0YWNoXCIsIG9sZFBhcmVudEVsZW1lbnQpO1xuXHRcdH1cblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkgdGhyb3cgbmV3IEVycm9yKFwiTXVzdCBiZSBhdHRhY2hlZFwiKTtcblx0XHRpZiAoIXRoaXMubWVtYmVycy5sZW5ndGgpIHJldHVybiB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdHZhciBtID0gdGhpcy5tZW1iZXJzWzBdO1xuXHRcdHJldHVybiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0uZmlyc3ROb2RlKCkgOiBtO1xuXHR9LFxuXG5cdGxhc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHRocm93IG5ldyBFcnJvcihcIk11c3QgYmUgYXR0YWNoZWRcIik7XG5cdFx0aWYgKCF0aGlzLm1lbWJlcnMubGVuZ3RoKSByZXR1cm4gdGhpcy5wbGFjZWhvbGRlcjtcblx0XHR2YXIgbSA9IHRoaXMubWVtYmVyc1t0aGlzLm1lbWJlcnMubGVuZ3RoIC0gMV07XG5cdFx0cmV0dXJuIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpID8gbS5sYXN0Tm9kZSgpIDogbTtcblx0fSxcblxuXHRnZXRNZW1iZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRpZiAoIShhdEluZGV4ID49IDAgJiYgYXRJbmRleCA8IG1lbWJlcnMubGVuZ3RoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIGluZGV4IGluIHJhbmdlLmdldE1lbWJlcjogXCIgKyBhdEluZGV4KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWVtYmVyc1thdEluZGV4XTtcblx0fSxcblxuXHQvLyByZXNldHMgdGhlIERPTVJhbmdlIHdpdGggbmV3IGNvbnRlbnRcblx0c2V0TWVtYmVyczogZnVuY3Rpb24obmV3Tm9kZUFuZFJhbmdlQXJyYXkpIHtcblx0XHR2YXIgbmV3TWVtYmVycyA9IG5ld05vZGVBbmRSYW5nZUFycmF5O1xuXHRcdGlmICghaXNBcnJheUxpa2UobmV3TWVtYmVycykpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGFycmF5XCIpO1xuXHRcdHZhciBvbGRNZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdHZhciBfaXNSZXBsYWNlID0gdGhpcy5hdHRhY2hlZCAmJiAobmV3TWVtYmVycy5sZW5ndGggfHwgb2xkTWVtYmVycy5sZW5ndGgpO1xuXG5cdFx0Ly8gZGVyZWZlcmVuY2Ugb2xkIG1lbWJlcnNcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG9sZE1lbWJlcnMubGVuZ3RoOyBpKyspIHRoaXMuX21lbWJlck91dChvbGRNZW1iZXJzW2ldLCBmYWxzZSwgX2lzUmVwbGFjZSk7XG5cblx0XHQvLyByZWZlcmVuY2UgbmV3IG1lbWJlcnNcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG5ld01lbWJlcnMubGVuZ3RoOyBpKyspIHRoaXMuX21lbWJlckluKG5ld01lbWJlcnNbaV0pO1xuXG5cdFx0aWYgKF9pc1JlcGxhY2UpIHtcblx0XHRcdC8vIGRldGFjaCB0aGUgb2xkIG1lbWJlcnMgYW5kIGluc2VydCB0aGUgbmV3IG1lbWJlcnNcblx0XHRcdHZhciBuZXh0Tm9kZSA9IHRoaXMubGFzdE5vZGUoKS5uZXh0U2libGluZztcblx0XHRcdHZhciBwYXJlbnRFbGVtZW50ID0gdGhpcy5wYXJlbnRFbGVtZW50O1xuXHRcdFx0Ly8gVXNlIGRldGFjaC9hdHRhY2gsIGJ1dCBkb24ndCB0cmlnZ2VyIGV2ZW50c1xuXHRcdFx0dGhpcy5kZXRhY2godHJ1ZSAvKl9pc1JlcGxhY2UqLyk7XG5cdFx0XHR0aGlzLm1lbWJlcnMgPSBuZXdNZW1iZXJzO1xuXHRcdFx0dGhpcy5hdHRhY2gocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIGZhbHNlLCB0cnVlIC8qX2lzUmVwbGFjZSovKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZG9uJ3QgZG8gYW55dGhpbmcgaWYgd2UncmUgZ29pbmcgZnJvbSBlbXB0eSB0byBlbXB0eVxuXHRcdFx0dGhpcy5tZW1iZXJzID0gbmV3TWVtYmVycztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhZGRNZW1iZXI6IGZ1bmN0aW9uKG5ld01lbWJlciwgYXRJbmRleCwgX2lzTW92ZSkge1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdFxuXHRcdC8vIHZhbGlkYXRlIHRoZSBpbmRleFxuXHRcdGlmICh0eXBlb2YgYXRJbmRleCAhPT0gXCJudW1iZXJcIiB8fCBpc05hTihhdEluZGV4KSB8fFxuXHRcdFx0YXRJbmRleCA8IDAgfHwgYXRJbmRleCA+IG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHRhdEluZGV4ID0gbWVtYmVycy5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Ly8gYWRkIHJlZmVyZW5jZXMgdG8gdGhlIG5ldyBtZW1iZXJcblx0XHRpZiAoIV9pc01vdmUpIHRoaXMuX21lbWJlckluKG5ld01lbWJlcik7XG5cblx0XHQvLyBjdXJyZW50bHkgZGV0YWNoZWQ7IGp1c3QgdXBkYXRlZCBtZW1iZXJzXG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSB7XG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAwLCBuZXdNZW1iZXIpO1xuXHRcdH1cblxuXHRcdC8vIGVtcHR5OyB1c2UgdGhlIGVtcHR5LXRvLW5vbmVtcHR5IGhhbmRsaW5nIG9mIHNldE1lbWJlcnNcblx0XHRlbHNlIGlmIChtZW1iZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5zZXRNZW1iZXJzKFsgbmV3TWVtYmVyIF0pO1xuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBhZGQgYXQgbG9jYXRpb25cblx0XHRlbHNlIHtcblx0XHRcdHZhciBuZXh0Tm9kZTtcblx0XHRcdGlmIChhdEluZGV4ID09PSBtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBpbnNlcnQgYXQgZW5kXG5cdFx0XHRcdG5leHROb2RlID0gdGhpcy5sYXN0Tm9kZSgpLm5leHRTaWJsaW5nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIG0gPSBtZW1iZXJzW2F0SW5kZXhdO1xuXHRcdFx0XHRuZXh0Tm9kZSA9IChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpID8gbS5maXJzdE5vZGUoKSA6IG07XG5cdFx0XHR9XG5cblx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDAsIG5ld01lbWJlcik7XG5cdFx0XHRpbnNlcnRJbnRvRE9NKG5ld01lbWJlciwgdGhpcy5wYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlTWVtYmVyOiBmdW5jdGlvbihhdEluZGV4LCBfaXNNb3ZlKSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0XG5cdFx0Ly8gYWxzbyBhY2NlcHRzIHRoZSBtZW1iZXIgdG8gcmVtb3ZlXG5cdFx0aWYgKHR5cGVvZiBhdEluZGV4ICE9PSBcIm51bWJlclwiIHx8IGlzTmFOKGF0SW5kZXgpKSB7XG5cdFx0XHRhdEluZGV4ID0gdGhpcy5pbmRleE9mKGF0SW5kZXgpO1xuXHRcdH1cblxuXHRcdC8vIHZhbGlkYXRlIHRoZSBpbmRleFxuXHRcdGlmIChhdEluZGV4IDwgMCB8fCBhdEluZGV4ID49IG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJCYWQgaW5kZXggaW4gcmFuZ2UucmVtb3ZlTWVtYmVyOiBcIiArIGF0SW5kZXgpO1xuXHRcdH1cblxuXHRcdGlmIChfaXNNb3ZlKSB7XG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIG9sZE1lbWJlciA9IG1lbWJlcnNbYXRJbmRleF07XG5cblx0XHRcdGlmIChtZW1iZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBiZWNvbWluZyBlbXB0eTsgdXNlIHRoZSBsb2dpYyBpbiBzZXRNZW1iZXJzXG5cdFx0XHRcdHRoaXMuc2V0TWVtYmVycyhbXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9tZW1iZXJPdXQob2xkTWVtYmVyKTtcblx0XHRcdFx0bWVtYmVycy5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdFx0XHRcdGlmICh0aGlzLmF0dGFjaGVkKSByZW1vdmVGcm9tRE9NKG9sZE1lbWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0bW92ZU1lbWJlcjogZnVuY3Rpb24ob2xkSW5kZXgsIG5ld0luZGV4KSB7XG5cdFx0dmFyIG1lbWJlciA9IHRoaXMubWVtYmVyc1tvbGRJbmRleF07XG5cdFx0dGhpcy5yZW1vdmVNZW1iZXIob2xkSW5kZXgsIHRydWUgLypfaXNNb3ZlKi8pO1xuXHRcdHRoaXMuYWRkTWVtYmVyKG1lbWJlciwgbmV3SW5kZXgsIHRydWUgLypfaXNNb3ZlKi8pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGluZGV4T2Y6IGZ1bmN0aW9uKG1lbWJlcikge1xuXHRcdHJldHVybiB0aGlzLm1lbWJlcnMuaW5kZXhPZihtZW1iZXIpO1xuXHR9LFxuXG5cdGNvbnRhaW5zOiBmdW5jdGlvbihtZW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5pbmRleE9mKG1lbWJlcikgPiAtMTtcblx0fSxcblxuXHRfbWVtYmVySW46IGZ1bmN0aW9uKG0pIHtcblx0XHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRtLnBhcmVudFJhbmdlID0gdGhpcztcblx0XHR9IGVsc2UgaWYgKG0ubm9kZVR5cGUgPT09IDEpIHsgLy8gRE9NIEVsZW1lbnRcblx0XHRcdG0uJGRvbXJhbmdlID0gdGhpcztcblx0XHR9XG5cdH0sXG5cblx0X21lbWJlck91dDogZnVuY3Rpb24gKG0sIF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpIHtcblx0XHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRpZiAoX2lzUmVwbGFjZSkgbS5kZXN0cm95TWVtYmVycyhfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKTtcblx0XHRcdGVsc2UgbS5kZXN0cm95KF9za2lwTm9kZXMpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKCFfc2tpcE5vZGVzICYmIG0ubm9kZVR5cGUgPT09IDEgJiYgbS4kZG9tcmFuZ2UpIHtcblx0XHRcdG0uJGRvbXJhbmdlID0gbnVsbDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gVGVhciBkb3duLCBidXQgZG9uJ3QgcmVtb3ZlLCB0aGUgbWVtYmVycy4gIFVzZWQgd2hlbiBjaHVua3Ncblx0Ly8gb2YgRE9NIGFyZSBiZWluZyB0b3JuIGRvd24gb3IgcmVwbGFjZWQuXG5cdGRlc3Ryb3lNZW1iZXJzOiBmdW5jdGlvbihfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtZW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9tZW1iZXJPdXQobWVtYmVyc1tpXSwgX3NraXBOb2RlcywgX2lzUmVwbGFjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKF9za2lwTm9kZXMpIHtcblx0XHR0aGlzLmRldGFjaCgpO1xuXHRcdHRoaXMudHJpZ2dlcihcImRlc3Ryb3lcIiwgX3NraXBOb2Rlcyk7XG5cdFx0dGhpcy5kZXN0cm95TWVtYmVycyhfc2tpcE5vZGVzKTtcblx0XHR0aGlzLm1lbWJlcnMgPSBbXTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRjb250YWluc0VsZW1lbnQ6IGZ1bmN0aW9uKGVsZW0pIHtcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHRocm93IG5ldyBFcnJvcihcIk11c3QgYmUgYXR0YWNoZWRcIik7XG5cblx0XHQvLyBBbiBlbGVtZW50IGlzIGNvbnRhaW5lZCBpbiB0aGlzIERPTVJhbmdlIGlmIGl0J3MgcG9zc2libGUgdG9cblx0XHQvLyByZWFjaCBpdCBieSB3YWxraW5nIHBhcmVudCBwb2ludGVycywgZmlyc3QgdGhyb3VnaCB0aGUgRE9NIGFuZFxuXHRcdC8vIHRoZW4gcGFyZW50UmFuZ2UgcG9pbnRlcnMuICBJbiBvdGhlciB3b3JkcywgdGhlIGVsZW1lbnQgb3Igc29tZVxuXHRcdC8vIGFuY2VzdG9yIG9mIGl0IGlzIGF0IG91ciBsZXZlbCBvZiB0aGUgRE9NIChhIGNoaWxkIG9mIG91clxuXHRcdC8vIHBhcmVudEVsZW1lbnQpLCBhbmQgdGhpcyBlbGVtZW50IGlzIG9uZSBvZiBvdXIgbWVtYmVycyBvclxuXHRcdC8vIGlzIGEgbWVtYmVyIG9mIGEgZGVzY2VuZGFudCBSYW5nZS5cblxuXHRcdC8vIEZpcnN0IGNoZWNrIHRoYXQgZWxlbSBpcyBhIGRlc2NlbmRhbnQgb2YgdGhpcy5wYXJlbnRFbGVtZW50LFxuXHRcdC8vIGFjY29yZGluZyB0byB0aGUgRE9NLlxuXHRcdGlmICghZWxlbWVudENvbnRhaW5zKHRoaXMucGFyZW50RWxlbWVudCwgZWxlbSkpIHJldHVybiBmYWxzZTtcblxuXHRcdC8vIElmIGVsZW0gaXMgbm90IGFuIGltbWVkaWF0ZSBjaGlsZCBvZiB0aGlzLnBhcmVudEVsZW1lbnQsXG5cdFx0Ly8gd2FsayB1cCB0byBpdHMgYW5jZXN0b3IgdGhhdCBpcy5cblx0XHR3aGlsZSAoZWxlbS5wYXJlbnROb2RlICE9PSB0aGlzLnBhcmVudEVsZW1lbnQpIGVsZW0gPSBlbGVtLnBhcmVudE5vZGU7XG5cblx0XHR2YXIgcmFuZ2UgPSBlbGVtLiRkb21yYW5nZTtcblx0XHR3aGlsZSAocmFuZ2UgJiYgcmFuZ2UgIT09IHRoaXMpIHtcblx0XHRcdHJhbmdlID0gcmFuZ2UucGFyZW50UmFuZ2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJhbmdlID09PSB0aGlzO1xuXHR9LFxuXG5cdGNvbnRhaW5zUmFuZ2U6IGZ1bmN0aW9uKHJhbmdlKSB7XG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJNdXN0IGJlIGF0dGFjaGVkXCIpO1xuXHRcdGlmICghcmFuZ2UuYXR0YWNoZWQpIHJldHVybiBmYWxzZTtcblxuXHRcdC8vIEEgRE9NUmFuZ2UgaXMgY29udGFpbmVkIGluIHRoaXMgRE9NUmFuZ2UgaWYgaXQncyBwb3NzaWJsZVxuXHRcdC8vIHRvIHJlYWNoIHRoaXMgcmFuZ2UgYnkgZm9sbG93aW5nIHBhcmVudCBwb2ludGVycy4gIElmIHRoZVxuXHRcdC8vIERPTVJhbmdlIGhhcyB0aGUgc2FtZSBwYXJlbnRFbGVtZW50LCB0aGVuIGl0IHNob3VsZCBiZVxuXHRcdC8vIGEgbWVtYmVyLCBvciBhIG1lbWJlciBvZiBhIG1lbWJlciBldGMuICBPdGhlcndpc2UsIHdlIG11c3Rcblx0XHQvLyBjb250YWluIGl0cyBwYXJlbnRFbGVtZW50LlxuXG5cdFx0aWYgKHJhbmdlLnBhcmVudEVsZW1lbnQgIT09IHRoaXMucGFyZW50RWxlbWVudCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY29udGFpbnNFbGVtZW50KHJhbmdlLnBhcmVudEVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIGRvbid0IGNvbnRhaW4gc2VsZlxuXHRcdGlmIChyYW5nZSA9PT0gdGhpcykgcmV0dXJuIGZhbHNlO1xuXG5cdFx0d2hpbGUgKHJhbmdlICYmIHJhbmdlICE9PSB0aGlzKSB7XG5cdFx0XHRyYW5nZSA9IHJhbmdlLnBhcmVudFJhbmdlO1xuXHRcdH1cblxuXHRcdHJldHVybiByYW5nZSA9PT0gdGhpcztcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBtYXRjaGVzID0gW10sXG5cdFx0XHRlbDtcblxuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5tZW1iZXJzKSB7XG5cdFx0XHRlbCA9IHRoaXMubWVtYmVyc1tpXTtcblx0XHRcdGlmIChlbCBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRcdG1hdGNoZXMucHVzaC5hcHBseShtYXRjaGVzLCBlbC5maW5kQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBlbC5xdWVyeVNlbGVjdG9yQWxsID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0aWYgKGVsLm5vZGVUeXBlID09PSAxICYmIHV0aWwubWF0Y2hlc1NlbGVjdG9yKGVsLCBzZWxlY3RvcikpIG1hdGNoZXMucHVzaChlbCk7XG5cdFx0XHRcdG1hdGNoZXMucHVzaC5hcHBseShtYXRjaGVzLCBlbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hdGNoZXNcblx0fSxcblxuXHRmaW5kOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBlbCwgcmVzO1xuXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLm1lbWJlcnMpIHtcblx0XHRcdGVsID0gdGhpcy5tZW1iZXJzW2ldO1xuXHRcdFx0aWYgKGVsIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0cmVzID0gZWwuZmluZChzZWxlY3Rvcik7XG5cdFx0XHR9IGVsc2UgaWYgKGVsLm5vZGVUeXBlID09PSAxICYmIHV0aWwubWF0Y2hlc1NlbGVjdG9yKGVsLCBzZWxlY3RvcikpIHtcblx0XHRcdFx0cmVzID0gZWw7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBlbC5xdWVyeVNlbGVjdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0cmVzID0gZWwucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXMgIT0gbnVsbCkgcmV0dXJuIHJlcztcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG59KTtcblxuLy8gUmV0dXJucyB0cnVlIGlmIGVsZW1lbnQgYSBjb250YWlucyBub2RlIGIgYW5kIGlzIG5vdCBub2RlIGIuXG4vL1xuLy8gVGhlIHJlc3RyaWN0aW9uIHRoYXQgYGFgIGJlIGFuIGVsZW1lbnQgKG5vdCBhIGRvY3VtZW50IGZyYWdtZW50LFxuLy8gc2F5KSBpcyBiYXNlZCBvbiB3aGF0J3MgZWFzeSB0byBpbXBsZW1lbnQgY3Jvc3MtYnJvd3Nlci5cbmZ1bmN0aW9uIGVsZW1lbnRDb250YWlucyhhLCBiKSB7XG5cdGlmIChhLm5vZGVUeXBlICE9PSAxKSByZXR1cm4gZmFsc2U7XG5cdGlmIChhID09PSBiKSByZXR1cm4gZmFsc2U7XG5cblx0aWYgKGEuY29tcGFyZURvY3VtZW50UG9zaXRpb24pIHtcblx0XHRyZXR1cm4gYS5jb21wYXJlRG9jdW1lbnRQb3NpdGlvbihiKSAmIDB4MTA7XG5cdH0gZWxzZSB7XG5cdFx0Ly8gU2hvdWxkIGJlIG9ubHkgb2xkIElFIGFuZCBtYXliZSBvdGhlciBvbGQgYnJvd3NlcnMgaGVyZS5cblx0XHQvLyBNb2Rlcm4gU2FmYXJpIGhhcyBib3RoIGZ1bmN0aW9ucyBidXQgc2VlbXMgdG8gZ2V0IGNvbnRhaW5zKCkgd3JvbmcuXG5cdFx0Ly8gSUUgY2FuJ3QgaGFuZGxlIGIgYmVpbmcgYSB0ZXh0IG5vZGUuICBXZSB3b3JrIGFyb3VuZCB0aGlzXG5cdFx0Ly8gYnkgZG9pbmcgYSBkaXJlY3QgcGFyZW50IHRlc3Qgbm93LlxuXHRcdGIgPSBiLnBhcmVudE5vZGU7XG5cdFx0aWYgKCEoYiAmJiBiLm5vZGVUeXBlID09PSAxKSkgLy8gRUxFTUVOVFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdGlmIChhID09PSBiKVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cblx0XHRyZXR1cm4gYS5jb250YWlucyhiKTtcblx0fVxufTtcblxuLy8gSW4gSUUgOCwgZG9uJ3QgdXNlIGVtcHR5IHRleHQgbm9kZXMgYXMgcGxhY2Vob2xkZXJzXG4vLyBpbiBlbXB0eSBET01SYW5nZXMsIHVzZSBjb21tZW50IG5vZGVzIGluc3RlYWQuICBVc2luZ1xuLy8gZW1wdHkgdGV4dCBub2RlcyBpbiBtb2Rlcm4gYnJvd3NlcnMgaXMgZ3JlYXQgYmVjYXVzZVxuLy8gaXQgZG9lc24ndCBjbHV0dGVyIHRoZSB3ZWIgaW5zcGVjdG9yLiAgSW4gSUUgOCwgaG93ZXZlcixcbi8vIGl0IHNlZW1zIHRvIGxlYWQgaW4gc29tZSByb3VuZGFib3V0IHdheSB0byB0aGUgT0F1dGhcbi8vIHBvcC11cCBjcmFzaGluZyB0aGUgYnJvd3NlciBjb21wbGV0ZWx5LiAgSW4gdGhlIHBhc3QsXG4vLyB3ZSBkaWRuJ3QgdXNlIGVtcHR5IHRleHQgbm9kZXMgb24gSUUgOCBiZWNhdXNlIHRoZXlcbi8vIGRvbid0IGFjY2VwdCBKUyBwcm9wZXJ0aWVzLCBzbyBqdXN0IHVzZSB0aGUgc2FtZSBsb2dpY1xuLy8gZXZlbiB0aG91Z2ggd2UgZG9uJ3QgbmVlZCB0byBzZXQgcHJvcGVydGllcyBvbiB0aGVcbi8vIHBsYWNlaG9sZGVyIGFueW1vcmUuXG52YXIgVVNFX0NPTU1FTlRfUExBQ0VIT0xERVJTID0gKGZ1bmN0aW9uICgpIHtcblx0dmFyIHJlc3VsdCA9IGZhbHNlO1xuXHR2YXIgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblx0dHJ5IHtcblx0XHR0ZXh0Tm9kZS5zb21lUHJvcCA9IHRydWU7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHQvLyBJRSA4XG5cdFx0cmVzdWx0ID0gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufSkoKTtcblxuZnVuY3Rpb24gcGxhY2Vob2xkZXJOb2RlKCkge1xuXHRyZXR1cm4gVVNFX0NPTU1FTlRfUExBQ0VIT0xERVJTID9cblx0XHRkb2N1bWVudC5jcmVhdGVDb21tZW50KFwiXCIpIDpcblx0XHRkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcbn1cblxuLy8gcHJpdmF0ZSBtZXRob2RzXG5mdW5jdGlvbiBpbnNlcnRJbnRvRE9NKHJhbmdlT3JOb2RlLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSkge1xuXHR2YXIgbSA9IHJhbmdlT3JOb2RlO1xuXHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0bS5hdHRhY2gocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUpO1xuXHR9IGVsc2Uge1xuXHRcdGlmIChfaXNNb3ZlKSB7XG5cdFx0XHRtb3ZlTm9kZVdpdGhIb29rcyhtLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluc2VydE5vZGVXaXRoSG9va3MobSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUpO1xuXHRcdH1cblx0fVxufTtcblxuZnVuY3Rpb24gcmVtb3ZlRnJvbURPTShyYW5nZU9yTm9kZSkge1xuXHR2YXIgbSA9IHJhbmdlT3JOb2RlO1xuXHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0bS5kZXRhY2goKTtcblx0fSBlbHNlIHtcblx0XHRyZW1vdmVOb2RlV2l0aEhvb2tzKG0pO1xuXHR9XG59O1xuXG5mdW5jdGlvbiByZW1vdmVOb2RlV2l0aEhvb2tzKG4pIHtcblx0aWYgKCFuLnBhcmVudE5vZGUpIHJldHVybjtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgbi5wYXJlbnROb2RlLl91aWhvb2tzICYmIG4ucGFyZW50Tm9kZS5fdWlob29rcy5yZW1vdmVFbGVtZW50KSB7XG5cdFx0bi5wYXJlbnROb2RlLl91aWhvb2tzLnJlbW92ZUVsZW1lbnQobik7XG5cdH0gZWxzZSB7XG5cdFx0bi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG4pO1xuXHR9XG59O1xuXG5mdW5jdGlvbiBpbnNlcnROb2RlV2l0aEhvb2tzKG4sIHBhcmVudCwgbmV4dCkge1xuXHQvLyBgfHwgbnVsbGAgYmVjYXVzZSBJRSB0aHJvd3MgYW4gZXJyb3IgaWYgJ25leHQnIGlzIHVuZGVmaW5lZFxuXHRuZXh0ID0gbmV4dCB8fCBudWxsO1xuXHRpZiAobi5ub2RlVHlwZSA9PT0gMSAmJiBwYXJlbnQuX3VpaG9va3MgJiYgcGFyZW50Ll91aWhvb2tzLmluc2VydEVsZW1lbnQpIHtcblx0XHRwYXJlbnQuX3VpaG9va3MuaW5zZXJ0RWxlbWVudChuLCBuZXh0KTtcblx0fSBlbHNlIHtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG4sIG5leHQpO1xuXHR9XG59O1xuXG5mdW5jdGlvbiBtb3ZlTm9kZVdpdGhIb29rcyhuLCBwYXJlbnQsIG5leHQpIHtcblx0aWYgKG4ucGFyZW50Tm9kZSAhPT0gcGFyZW50KVxuXHRcdHJldHVybjtcblx0Ly8gYHx8IG51bGxgIGJlY2F1c2UgSUUgdGhyb3dzIGFuIGVycm9yIGlmICduZXh0JyBpcyB1bmRlZmluZWRcblx0bmV4dCA9IG5leHQgfHwgbnVsbDtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgcGFyZW50Ll91aWhvb2tzICYmIHBhcmVudC5fdWlob29rcy5tb3ZlRWxlbWVudCkge1xuXHRcdHBhcmVudC5fdWlob29rcy5tb3ZlRWxlbWVudChuLCBuZXh0KTtcblx0fSBlbHNlIHtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG4sIG5leHQpO1xuXHR9XG59OyIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbi8vIEJhY2tib25lLkV2ZW50c1xuLy8gLS0tLS0tLS0tLS0tLS0tXG5cbi8vIEEgbW9kdWxlIHRoYXQgY2FuIGJlIG1peGVkIGluIHRvICphbnkgb2JqZWN0KiBpbiBvcmRlciB0byBwcm92aWRlIGl0IHdpdGhcbi8vIGN1c3RvbSBldmVudHMuIFlvdSBtYXkgYmluZCB3aXRoIGBvbmAgb3IgcmVtb3ZlIHdpdGggYG9mZmAgY2FsbGJhY2tcbi8vIGZ1bmN0aW9ucyB0byBhbiBldmVudDsgYHRyaWdnZXJgLWluZyBhbiBldmVudCBmaXJlcyBhbGwgY2FsbGJhY2tzIGluXG4vLyBzdWNjZXNzaW9uLlxuLy9cbi8vICAgICB2YXIgb2JqZWN0ID0ge307XG4vLyAgICAgXy5leHRlbmQob2JqZWN0LCBCYWNrYm9uZS5FdmVudHMpO1xuLy8gICAgIG9iamVjdC5vbignZXhwYW5kJywgZnVuY3Rpb24oKXsgYWxlcnQoJ2V4cGFuZGVkJyk7IH0pO1xuLy8gICAgIG9iamVjdC50cmlnZ2VyKCdleHBhbmQnKTtcbi8vXG52YXIgRXZlbnRzID0gbW9kdWxlLmV4cG9ydHMgPSB7XG5cblx0Ly8gQmluZCBhbiBldmVudCB0byBhIGBjYWxsYmFja2AgZnVuY3Rpb24uIFBhc3NpbmcgYFwiYWxsXCJgIHdpbGwgYmluZFxuXHQvLyB0aGUgY2FsbGJhY2sgdG8gYWxsIGV2ZW50cyBmaXJlZC5cblx0b246IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ29uJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcblx0XHR0aGlzLl9ldmVudHMgfHwgKHRoaXMuX2V2ZW50cyA9IHt9KTtcblx0XHR2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdIHx8ICh0aGlzLl9ldmVudHNbbmFtZV0gPSBbXSk7XG5cdFx0ZXZlbnRzLnB1c2goe2NhbGxiYWNrOiBjYWxsYmFjaywgY29udGV4dDogY29udGV4dCwgY3R4OiBjb250ZXh0IHx8IHRoaXN9KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBCaW5kIGFuIGV2ZW50IHRvIG9ubHkgYmUgdHJpZ2dlcmVkIGEgc2luZ2xlIHRpbWUuIEFmdGVyIHRoZSBmaXJzdCB0aW1lXG5cdC8vIHRoZSBjYWxsYmFjayBpcyBpbnZva2VkLCBpdCB3aWxsIGJlIHJlbW92ZWQuXG5cdG9uY2U6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ29uY2UnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSB8fCAhY2FsbGJhY2spIHJldHVybiB0aGlzO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHR2YXIgZm4gPSBvbmNlKGZ1bmN0aW9uKCkge1xuXHRcdFx0c2VsZi5vZmYobmFtZSwgZm4pO1xuXHRcdFx0Y2FsbGJhY2suYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHR9KTtcblx0XHRmbi5fY2FsbGJhY2sgPSBjYWxsYmFjaztcblx0XHRyZXR1cm4gdGhpcy5vbihuYW1lLCBmbiwgY29udGV4dCk7XG5cdH0sXG5cblx0Ly8gUmVtb3ZlIG9uZSBvciBtYW55IGNhbGxiYWNrcy4gSWYgYGNvbnRleHRgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG5cdC8vIGNhbGxiYWNrcyB3aXRoIHRoYXQgZnVuY3Rpb24uIElmIGBjYWxsYmFja2AgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcblx0Ly8gY2FsbGJhY2tzIGZvciB0aGUgZXZlbnQuIElmIGBuYW1lYCBpcyBudWxsLCByZW1vdmVzIGFsbCBib3VuZFxuXHQvLyBjYWxsYmFja3MgZm9yIGFsbCBldmVudHMuXG5cdG9mZjogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblx0XHR2YXIgcmV0YWluLCBldiwgZXZlbnRzLCBuYW1lcywgaSwgbCwgaiwgaztcblx0XHRpZiAoIXRoaXMuX2V2ZW50cyB8fCAhZXZlbnRzQXBpKHRoaXMsICdvZmYnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSkgcmV0dXJuIHRoaXM7XG5cdFx0aWYgKCFuYW1lICYmICFjYWxsYmFjayAmJiAhY29udGV4dCkge1xuXHRcdFx0dGhpcy5fZXZlbnRzID0gdm9pZCAwO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdG5hbWVzID0gbmFtZSA/IFtuYW1lXSA6IE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XG5cdFx0Zm9yIChpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0bmFtZSA9IG5hbWVzW2ldO1xuXHRcdFx0aWYgKGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSkge1xuXHRcdFx0XHR0aGlzLl9ldmVudHNbbmFtZV0gPSByZXRhaW4gPSBbXTtcblx0XHRcdFx0aWYgKGNhbGxiYWNrIHx8IGNvbnRleHQpIHtcblx0XHRcdFx0XHRmb3IgKGogPSAwLCBrID0gZXZlbnRzLmxlbmd0aDsgaiA8IGs7IGorKykge1xuXHRcdFx0XHRcdFx0ZXYgPSBldmVudHNbal07XG5cdFx0XHRcdFx0XHRpZiAoKGNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2suX2NhbGxiYWNrKSB8fFxuXHRcdFx0XHRcdFx0XHRcdChjb250ZXh0ICYmIGNvbnRleHQgIT09IGV2LmNvbnRleHQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldGFpbi5wdXNoKGV2KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFyZXRhaW4ubGVuZ3RoKSBkZWxldGUgdGhpcy5fZXZlbnRzW25hbWVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIFRyaWdnZXIgb25lIG9yIG1hbnkgZXZlbnRzLCBmaXJpbmcgYWxsIGJvdW5kIGNhbGxiYWNrcy4gQ2FsbGJhY2tzIGFyZVxuXHQvLyBwYXNzZWQgdGhlIHNhbWUgYXJndW1lbnRzIGFzIGB0cmlnZ2VyYCBpcywgYXBhcnQgZnJvbSB0aGUgZXZlbnQgbmFtZVxuXHQvLyAodW5sZXNzIHlvdSdyZSBsaXN0ZW5pbmcgb24gYFwiYWxsXCJgLCB3aGljaCB3aWxsIGNhdXNlIHlvdXIgY2FsbGJhY2sgdG9cblx0Ly8gcmVjZWl2ZSB0aGUgdHJ1ZSBuYW1lIG9mIHRoZSBldmVudCBhcyB0aGUgZmlyc3QgYXJndW1lbnQpLlxuXHR0cmlnZ2VyOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0aWYgKCF0aGlzLl9ldmVudHMpIHJldHVybiB0aGlzO1xuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblx0XHRpZiAoIWV2ZW50c0FwaSh0aGlzLCAndHJpZ2dlcicsIG5hbWUsIGFyZ3MpKSByZXR1cm4gdGhpcztcblx0XHR2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdO1xuXHRcdHZhciBhbGxFdmVudHMgPSB0aGlzLl9ldmVudHMuYWxsO1xuXHRcdGlmIChldmVudHMpIHRyaWdnZXJFdmVudHMoZXZlbnRzLCBhcmdzKTtcblx0XHRpZiAoYWxsRXZlbnRzKSB0cmlnZ2VyRXZlbnRzKGFsbEV2ZW50cywgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBUZWxsIHRoaXMgb2JqZWN0IHRvIHN0b3AgbGlzdGVuaW5nIHRvIGVpdGhlciBzcGVjaWZpYyBldmVudHMgLi4uIG9yXG5cdC8vIHRvIGV2ZXJ5IG9iamVjdCBpdCdzIGN1cnJlbnRseSBsaXN0ZW5pbmcgdG8uXG5cdHN0b3BMaXN0ZW5pbmc6IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcblx0XHR2YXIgbGlzdGVuaW5nVG8gPSB0aGlzLl9saXN0ZW5pbmdUbztcblx0XHRpZiAoIWxpc3RlbmluZ1RvKSByZXR1cm4gdGhpcztcblx0XHR2YXIgcmVtb3ZlID0gIW5hbWUgJiYgIWNhbGxiYWNrO1xuXHRcdGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG5cdFx0aWYgKG9iaikgKGxpc3RlbmluZ1RvID0ge30pW29iai5fbGlzdGVuSWRdID0gb2JqO1xuXHRcdGZvciAodmFyIGlkIGluIGxpc3RlbmluZ1RvKSB7XG5cdFx0XHRvYmogPSBsaXN0ZW5pbmdUb1tpZF07XG5cdFx0XHRvYmoub2ZmKG5hbWUsIGNhbGxiYWNrLCB0aGlzKTtcblx0XHRcdGlmIChyZW1vdmUgfHwgaXNFbXB0eShvYmouX2V2ZW50cykpIGRlbGV0ZSB0aGlzLl9saXN0ZW5pbmdUb1tpZF07XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cbn07XG5cbi8vIFJlZ3VsYXIgZXhwcmVzc2lvbiB1c2VkIHRvIHNwbGl0IGV2ZW50IHN0cmluZ3MuXG52YXIgZXZlbnRTcGxpdHRlciA9IC9cXHMrLztcblxuLy8gSW1wbGVtZW50IGZhbmN5IGZlYXR1cmVzIG9mIHRoZSBFdmVudHMgQVBJIHN1Y2ggYXMgbXVsdGlwbGUgZXZlbnRcbi8vIG5hbWVzIGBcImNoYW5nZSBibHVyXCJgIGFuZCBqUXVlcnktc3R5bGUgZXZlbnQgbWFwcyBge2NoYW5nZTogYWN0aW9ufWBcbi8vIGluIHRlcm1zIG9mIHRoZSBleGlzdGluZyBBUEkuXG52YXIgZXZlbnRzQXBpID0gZnVuY3Rpb24ob2JqLCBhY3Rpb24sIG5hbWUsIHJlc3QpIHtcblx0aWYgKCFuYW1lKSByZXR1cm4gdHJ1ZTtcblxuXHQvLyBIYW5kbGUgZXZlbnQgbWFwcy5cblx0aWYgKHR5cGVvZiBuYW1lID09PSAnb2JqZWN0Jykge1xuXHRcdGZvciAodmFyIGtleSBpbiBuYW1lKSB7XG5cdFx0XHRvYmpbYWN0aW9uXS5hcHBseShvYmosIFtrZXksIG5hbWVba2V5XV0uY29uY2F0KHJlc3QpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8gSGFuZGxlIHNwYWNlIHNlcGFyYXRlZCBldmVudCBuYW1lcy5cblx0aWYgKGV2ZW50U3BsaXR0ZXIudGVzdChuYW1lKSkge1xuXHRcdHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoZXZlbnRTcGxpdHRlcik7XG5cdFx0Zm9yICh2YXIgaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcblx0XHRcdG9ialthY3Rpb25dLmFwcGx5KG9iaiwgW25hbWVzW2ldXS5jb25jYXQocmVzdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgZGlmZmljdWx0LXRvLWJlbGlldmUsIGJ1dCBvcHRpbWl6ZWQgaW50ZXJuYWwgZGlzcGF0Y2ggZnVuY3Rpb24gZm9yXG4vLyB0cmlnZ2VyaW5nIGV2ZW50cy4gVHJpZXMgdG8ga2VlcCB0aGUgdXN1YWwgY2FzZXMgc3BlZWR5IChtb3N0IGludGVybmFsXG4vLyBCYWNrYm9uZSBldmVudHMgaGF2ZSAzIGFyZ3VtZW50cykuXG52YXIgdHJpZ2dlckV2ZW50cyA9IGZ1bmN0aW9uKGV2ZW50cywgYXJncykge1xuXHR2YXIgZXYsIGkgPSAtMSwgbCA9IGV2ZW50cy5sZW5ndGgsIGExID0gYXJnc1swXSwgYTIgPSBhcmdzWzFdLCBhMyA9IGFyZ3NbMl07XG5cdHN3aXRjaCAoYXJncy5sZW5ndGgpIHtcblx0XHRjYXNlIDA6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4KTsgcmV0dXJuO1xuXHRcdGNhc2UgMTogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExKTsgcmV0dXJuO1xuXHRcdGNhc2UgMjogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMik7IHJldHVybjtcblx0XHRjYXNlIDM6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSwgYTIsIGEzKTsgcmV0dXJuO1xuXHRcdGRlZmF1bHQ6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmFwcGx5KGV2LmN0eCwgYXJncyk7IHJldHVybjtcblx0fVxufTtcblxudmFyIGxpc3Rlbk1ldGhvZHMgPSB7bGlzdGVuVG86ICdvbicsIGxpc3RlblRvT25jZTogJ29uY2UnfTtcblxuLy8gSW52ZXJzaW9uLW9mLWNvbnRyb2wgdmVyc2lvbnMgb2YgYG9uYCBhbmQgYG9uY2VgLiBUZWxsICp0aGlzKiBvYmplY3QgdG9cbi8vIGxpc3RlbiB0byBhbiBldmVudCBpbiBhbm90aGVyIG9iamVjdCAuLi4ga2VlcGluZyB0cmFjayBvZiB3aGF0IGl0J3Ncbi8vIGxpc3RlbmluZyB0by5cbl8uZWFjaChsaXN0ZW5NZXRob2RzLCBmdW5jdGlvbihpbXBsZW1lbnRhdGlvbiwgbWV0aG9kKSB7XG5cdEV2ZW50c1ttZXRob2RdID0gZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuXHRcdHZhciBsaXN0ZW5pbmdUbyA9IHRoaXMuX2xpc3RlbmluZ1RvIHx8ICh0aGlzLl9saXN0ZW5pbmdUbyA9IHt9KTtcblx0XHR2YXIgaWQgPSBvYmouX2xpc3RlbklkIHx8IChvYmouX2xpc3RlbklkID0gXy51bmlxdWVJZCgnbCcpKTtcblx0XHRsaXN0ZW5pbmdUb1tpZF0gPSBvYmo7XG5cdFx0aWYgKCFjYWxsYmFjayAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcblx0XHRvYmpbaW1wbGVtZW50YXRpb25dKG5hbWUsIGNhbGxiYWNrLCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcbn0pO1xuXG4vLyBBbGlhc2VzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbkV2ZW50cy5iaW5kICAgPSBFdmVudHMub247XG5FdmVudHMudW5iaW5kID0gRXZlbnRzLm9mZjtcblxuZnVuY3Rpb24gaXNFbXB0eShvYmopIHtcblx0aWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcblx0aWYgKEFycmF5LmlzQXJyYXkob2JqKSB8fCB0eXBlb2Ygb2JqID09PSBcInN0cmluZ1wiKSByZXR1cm4gb2JqLmxlbmd0aCA9PT0gMDtcblx0Zm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkgcmV0dXJuIGZhbHNlO1xuXHRyZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gb25jZShmdW5jKSB7XG5cdHZhciByYW4gPSBmYWxzZSwgbWVtbztcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdGlmIChyYW4pIHJldHVybiBtZW1vO1xuXHRcdHJhbiA9IHRydWU7XG5cdFx0bWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRmdW5jID0gbnVsbDtcblx0XHRyZXR1cm4gbWVtbztcblx0fVxufSIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIiksXG5cdHBhcnNlID0gcmVxdWlyZShcIi4vbSt4bWxcIikucGFyc2UsXG5cdE5PREVfVFlQRSA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpLFxuXHR0cmFjayA9IHJlcXVpcmUoXCIuL3RyYWNrXCIpO1xuXG4vLyBwcm9wZXJ0aWVzIHRoYXQgTm9kZS5qcyBhbmQgdGhlIGJyb3dzZXIgY2FuIGhhbmRsZVxudmFyIFRlbXBsZSA9IG1vZHVsZS5leHBvcnRzID0gXy5kZWZhdWx0cyh7XG5cdFZFUlNJT046IFwiMC41LjBcIixcblx0Tk9ERV9UWVBFOiBOT0RFX1RZUEUsXG5cblx0Ly8gb3RoZXIgcGFydHNcblx0dXRpbDogcmVxdWlyZShcIi4vdXRpbFwiKSxcblx0RXZlbnRzOiByZXF1aXJlKFwiLi9ldmVudHNcIiksXG5cdE1vZGVsOiByZXF1aXJlKFwiLi9tb2RlbFwiKSxcblxuXHQvLyB0cmFja3Igc2hvcnQgcG9pbnRlcnNcblx0VHJhY2tyOiBUcmFja3IsXG5cdERlcGVuZGVuY3k6IFRyYWNrci5EZXBlbmRlbmN5LFxuXHRhdXRvcnVuOiBUcmFja3IuYXV0b3J1bixcblxuXHQvLyBhbGwgdGhlIHBhcnNlcnMsIGRlY2xhcmVkIGhlcmUgZm9yIGVhc2llciBhY2Nlc3Ncblx0cGFyc2U6IHBhcnNlLFxuXHRwYXJzZVBhdGg6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcInBhdGhcIiB9KSk7XG5cdH0sXG5cdHBhcnNlUGF0aFF1ZXJ5OiBmdW5jdGlvbihzLCBvcHRzKSB7XG5cdFx0cmV0dXJuIHBhcnNlKHMsIF8uZXh0ZW5kKHt9LCBvcHRzLCB7IHN0YXJ0UnVsZTogXCJwYXRoUXVlcnlcIiB9KSk7XG5cdH0sXG5cdHBhcnNlQXR0cmlidXRlVmFsdWU6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcImF0dHJWYWx1ZVwiIH0pKTtcblx0fSxcblx0cGFyc2VBcmd1bWVudHM6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcImF0dHJBcmd1bWVudHNcIiB9KSk7XG5cdH0sXG5cblx0Ly8gY29udmVydHMgcmF3IGh0bWwgc3RyIHRvIHRlbXBsYXRlIHRyZWVcblx0cGFyc2VIVE1MOiBmdW5jdGlvbihzdHIpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogTk9ERV9UWVBFLlJPT1QsXG5cdFx0XHRjaGlsZHJlbjogWyB7XG5cdFx0XHRcdHR5cGU6IE5PREVfVFlQRS5IVE1MLFxuXHRcdFx0XHR2YWx1ZTogc3RyXG5cdFx0XHR9IF0sXG5cdFx0XHR2ZXJzaW9uOiBUZW1wbGUuVkVSU0lPTlxuXHRcdH07XG5cdH1cbn0sIHRyYWNrKTtcblxuLy8gbm8gbmVlZCBmb3Igbm9kZSBqcyB0byBodXJ0IGl0c2VsZiBvbiBhbnkgaGFyZCBlZGdlc1xuaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXG4vLyBsb2FkIHRoZSByZWFsIGNsYXNzIGZvciB0aGUgYnJvd3NlclxuVGVtcGxlID0gbW9kdWxlLmV4cG9ydHMgPSBfLmV4dGVuZChyZXF1aXJlKFwiLi9tdXN0YWNoZVwiKSwgbW9kdWxlLmV4cG9ydHMpO1xuXG4vLyBsb2FkIHRoZSBwbHVnaW4gQVBJXG5fLmV4dGVuZChUZW1wbGUsIHJlcXVpcmUoXCIuL3BsdWdpbnNcIikpO1xuXG4vLyBhbmQgYXR0YWNoIHRoZSByZXN0IG9mIHRoZSBwYXJ0cyB0aGF0IE5vZGUgY2FuJ3QgdXNlXG5UZW1wbGUuRE9NUmFuZ2UgPSByZXF1aXJlKFwiLi9kb21yYW5nZVwiKTtcblRlbXBsZS5WaWV3ID0gcmVxdWlyZShcIi4vdmlld1wiKTtcblRlbXBsZS5TZWN0aW9uID0gcmVxdWlyZShcIi4vc2VjdGlvblwiKTsiLCJtb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpIHtcbiAgLypcbiAgICogR2VuZXJhdGVkIGJ5IFBFRy5qcyAwLjguMC5cbiAgICpcbiAgICogaHR0cDovL3BlZ2pzLm1hamRhLmN6L1xuICAgKi9cblxuICBmdW5jdGlvbiBwZWckc3ViY2xhc3MoY2hpbGQsIHBhcmVudCkge1xuICAgIGZ1bmN0aW9uIGN0b3IoKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfVxuICAgIGN0b3IucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcbiAgICBjaGlsZC5wcm90b3R5cGUgPSBuZXcgY3RvcigpO1xuICB9XG5cbiAgZnVuY3Rpb24gU3ludGF4RXJyb3IobWVzc2FnZSwgZXhwZWN0ZWQsIGZvdW5kLCBvZmZzZXQsIGxpbmUsIGNvbHVtbikge1xuICAgIHRoaXMubWVzc2FnZSAgPSBtZXNzYWdlO1xuICAgIHRoaXMuZXhwZWN0ZWQgPSBleHBlY3RlZDtcbiAgICB0aGlzLmZvdW5kICAgID0gZm91bmQ7XG4gICAgdGhpcy5vZmZzZXQgICA9IG9mZnNldDtcbiAgICB0aGlzLmxpbmUgICAgID0gbGluZTtcbiAgICB0aGlzLmNvbHVtbiAgID0gY29sdW1uO1xuXG4gICAgdGhpcy5uYW1lICAgICA9IFwiU3ludGF4RXJyb3JcIjtcbiAgfVxuXG4gIHBlZyRzdWJjbGFzcyhTeW50YXhFcnJvciwgRXJyb3IpO1xuXG4gIGZ1bmN0aW9uIHBhcnNlKGlucHV0KSB7XG4gICAgdmFyIG9wdGlvbnMgPSBhcmd1bWVudHMubGVuZ3RoID4gMSA/IGFyZ3VtZW50c1sxXSA6IHt9LFxuXG4gICAgICAgIHBlZyRGQUlMRUQgPSB7fSxcblxuICAgICAgICBwZWckc3RhcnRSdWxlRnVuY3Rpb25zID0geyBzdGFydDogcGVnJHBhcnNlc3RhcnQsIGF0dHJWYWx1ZTogcGVnJHBhcnNlYXR0clZhbHVlLCBhdHRyQXJndW1lbnRzOiBwZWckcGFyc2VhdHRyQXJndW1lbnRzLCBwYXRoUXVlcnk6IHBlZyRwYXJzZXBhdGhRdWVyeSwgcGF0aDogcGVnJHBhcnNlcGF0aCB9LFxuICAgICAgICBwZWckc3RhcnRSdWxlRnVuY3Rpb24gID0gcGVnJHBhcnNlc3RhcnQsXG5cbiAgICAgICAgcGVnJGMwID0gZnVuY3Rpb24oaHRtbCkge1xuICAgICAgICBcdHJldHVybiB7XG4gICAgICAgIFx0XHR0eXBlOiBOT0RFX1RZUEUuUk9PVCxcbiAgICAgICAgXHRcdGNoaWxkcmVuOiBodG1sLFxuICAgICAgICBcdFx0dmVyc2lvbjogTXVzdGFjaGUuVkVSU0lPTlxuICAgICAgICBcdH1cbiAgICAgICAgfSxcbiAgICAgICAgcGVnJGMxID0gW10sXG4gICAgICAgIHBlZyRjMiA9IGZ1bmN0aW9uKG5vZGVzKSB7IHJldHVybiBfLmNvbXBhY3Qobm9kZXMpOyB9LFxuICAgICAgICBwZWckYzMgPSBwZWckRkFJTEVELFxuICAgICAgICBwZWckYzQgPSAvXltePHtdLyxcbiAgICAgICAgcGVnJGM1ID0geyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIltePHtdXCIsIGRlc2NyaXB0aW9uOiBcIltePHtdXCIgfSxcbiAgICAgICAgcGVnJGM2ID0gZnVuY3Rpb24odGV4dCkgeyByZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuVEVYVCwgdmFsdWU6IHRleHQuam9pbihcIlwiKSB9OyB9LFxuICAgICAgICBwZWckYzcgPSBcIjwhLS1cIixcbiAgICAgICAgcGVnJGM4ID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPCEtLVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPCEtLVxcXCJcIiB9LFxuICAgICAgICBwZWckYzkgPSBcIi0tPlwiLFxuICAgICAgICBwZWckYzEwID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLS0+XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCItLT5cXFwiXCIgfSxcbiAgICAgICAgcGVnJGMxMSA9IGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgXHRcdHJldHVybiB7IHR5cGU6IE5PREVfVFlQRS5YQ09NTUVOVCwgdmFsdWU6IHYudHJpbSgpIH07XG4gICAgICAgIFx0fSxcbiAgICAgICAgcGVnJGMxMiA9IHZvaWQgMCxcbiAgICAgICAgcGVnJGMxMyA9IHsgdHlwZTogXCJhbnlcIiwgZGVzY3JpcHRpb246IFwiYW55IGNoYXJhY3RlclwiIH0sXG4gICAgICAgIHBlZyRjMTQgPSBudWxsLFxuICAgICAgICBwZWckYzE1ID0gZnVuY3Rpb24obCwgcikgeyByZXR1cm4gbCArIChyICE9IG51bGwgPyByIDogXCJcIik7IH0sXG4gICAgICAgIHBlZyRjMTYgPSBmdW5jdGlvbihzdGFydCwgbm9kZXMsIGVuZCkge1xuICAgICAgICBcdFx0aWYgKHN0YXJ0Lm5hbWUudG9Mb3dlckNhc2UoKSAhPT0gZW5kLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudCB0YWcgbWlzbWF0Y2g6IFwiICsgc3RhcnQubmFtZSArIFwiICE9PSBcIiArIGVuZCk7XG4gICAgICAgIFx0XHR9XG5cbiAgICAgICAgXHRcdHN0YXJ0LnR5cGUgPSBOT0RFX1RZUEUuRUxFTUVOVDtcbiAgICAgICAgXHRcdHN0YXJ0LmNoaWxkcmVuID0gbm9kZXM7XG4gICAgICAgIFx0XHRyZXR1cm4gc3RhcnQ7XG4gICAgICAgIFx0fSxcbiAgICAgICAgcGVnJGMxNyA9IFwiPFwiLFxuICAgICAgICBwZWckYzE4ID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPFxcXCJcIiB9LFxuICAgICAgICBwZWckYzE5ID0gXCIvPlwiLFxuICAgICAgICBwZWckYzIwID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLz5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi8+XFxcIlwiIH0sXG4gICAgICAgIHBlZyRjMjEgPSBmdW5jdGlvbih0YWduYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICBcdFx0XHRuYW1lOiB0YWduYW1lLFxuICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuRUxFTUVOVCxcbiAgICAgICAgXHRcdFx0YXR0cmlidXRlczogYXR0cmlidXRlcyxcbiAgICAgICAgXHRcdFx0Y2hpbGRyZW46IFtdXG4gICAgICAgIFx0XHR9XG4gICAgICAgIFx0fSxcbiAgICAgICAgcGVnJGMyMiA9IFwiPlwiLFxuICAgICAgICBwZWckYzIzID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPlxcXCJcIiB9LFxuICAgICAgICBwZWckYzI0ID0gZnVuY3Rpb24odGFnbmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICBcdFx0cmV0dXJuIHsgbmFtZTogdGFnbmFtZSwgYXR0cmlidXRlczogYXR0cmlidXRlcyB9O1xuICAgICAgICBcdH0sXG4gICAgICAgIHBlZyRjMjUgPSBcIjwvXCIsXG4gICAgICAgIHBlZyRjMjYgPSB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI8L1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiPC9cXFwiXCIgfSxcbiAgICAgICAgcGVnJGMyNyA9IGZ1bmN0aW9uKHRhZ25hbWUpIHsgcmV0dXJuIHRhZ25hbWU7IH0sXG4gICAgICAgIHBlZyRjMjggPSBcIj1cIixcbiAgICAgICAgcGVnJGMyOSA9IHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIj1cIiwgZGVzY3JpcHRpb246IFwiXFxcIj1cXFwiXCIgfSxcbiAgICAgICAgcGVnJGMzMCA9IGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgICAgXHRcdHZhbHVlID0gdmFsdWUgIT0gbnVsbCA/IHZhbHVlWzJdIDogXCJcIjtcbiAgICAgICAgXHRcdFxuICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLkFUVFJJQlVURSxcbiAgICAgICAgXHRcdFx0bmFtZToga2V5LFxuICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWUsXG4gICAgICAgIFx0XHRcdGNoaWxkcmVuOiBwYXJzZSh2YWx1ZSwgXy5leHRlbmQoe30sIG9wdGlvbnMsIHsgc3RhcnRSdWxlOiBcImF0dHJWYWx1ZVwiIH0pKSxcbiAgICAgICAgXHRcdFx0YXJndW1lbnRzOiBwYXJzZSh2YWx1ZSwgIF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7IHN0YXJ0UnVsZTogXCJhdHRyQXJndW1lbnRzXCIgfSkpXG4gICAgICAgIFx0XHR9XG4gICAgICAgIFx0fSxcbiAgICAgICAgcGVnJGMzMSA9IFwiLFwiLFxuICAgICAgICBwZWckYzMyID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLFxcXCJcIiB9LFxuICAgICAgICBwZWckYzMzID0gZnVuY3Rpb24obCwgcikgeyByZXR1cm4gciAhPSBudWxsICYmIHJbMV0gIT0gbnVsbCA/IFtsXS5jb25jYXQoclsxXSkgOiBbbF07IH0sXG4gICAgICAgIHBlZyRjMzQgPSBmdW5jdGlvbih2KSB7IHJldHVybiB2OyB9LFxuICAgICAgICBwZWckYzM1ID0gL15bXixdLyxcbiAgICAgICAgcGVnJGMzNiA9IHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXixdXCIsIGRlc2NyaXB0aW9uOiBcIlteLF1cIiB9LFxuICAgICAgICBwZWckYzM3ID0gZnVuY3Rpb24odikgeyByZXR1cm4gdi50cmltKCk7IH0sXG4gICAgICAgIHBlZyRjMzggPSBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgXHRcdGlmIChfLmlzT2JqZWN0KHZhbCkpIHJldHVybiB2YWw7XG4gICAgICAgIFx0XHRlbHNlIHJldHVybiB7IHR5cGU6IE5PREVfVFlQRS5MSVRFUkFMLCB2YWx1ZTogdmFsIH07XG4gICAgICAgIFx0fSxcbiAgICAgICAgcGVnJGMzOSA9IC9eWyxdLyxcbiAgICAgICAgcGVnJGM0MCA9IHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbLF1cIiwgZGVzY3JpcHRpb246IFwiWyxdXCIgfSxcbiAgICAgICAgcGVnJGM0MSA9IGZ1bmN0aW9uKHN0YXJ0LCBub2RlcywgZW5kKSB7XG4gICAgICAgIFx0XHRpZiAob3B0aW9ucy5zdHJpY3QgJiYgIV8uaXNFcXVhbChzdGFydC52YWx1ZS5yYXcsIGVuZCkpIHtcbiAgICAgICAgXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiU2VjdGlvbiB0YWcgbWlzbWF0Y2g6IFwiICsgc3RhcnQudmFsdWUucmF3ICsgXCIgIT09IFwiICsgZW5kKTtcbiAgICAgICAgXHRcdH1cblxuICAgICAgICBcdFx0c3RhcnQudmFsdWUgPSBzdGFydC52YWx1ZS5yZXN1bHQ7XG4gICAgICAgIFx0XHRzdGFydC5jaGlsZHJlbiA9IG5vZGVzO1xuICAgICAgICBcdFx0cmV0dXJuIHN0YXJ0O1xuICAgICAgICBcdH0sXG4gICAgICAgIHBlZyRjNDIgPSBcInt7XCIsXG4gICAgICAgIHBlZyRjNDMgPSB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ7e1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3tcXFwiXCIgfSxcbiAgICAgICAgcGVnJGM0NCA9IC9eWyNcXF5dLyxcbiAgICAgICAgcGVnJGM0NSA9IHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbI1xcXFxeXVwiLCBkZXNjcmlwdGlvbjogXCJbI1xcXFxeXVwiIH0sXG4gICAgICAgIHBlZyRjNDYgPSBcIn19XCIsXG4gICAgICAgIHBlZyRjNDcgPSB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ9fVwiLCBkZXNjcmlwdGlvbjogXCJcXFwifX1cXFwiXCIgfSxcbiAgICAgICAgcGVnJGM0OCA9IGZ1bmN0aW9uKHR5cGUsIHZhbHVlKSB7XG4gICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEVbdHlwZSA9PT0gXCIjXCIgPyBcIlNFQ1RJT05cIiA6IFwiSU5WRVJURURcIl0sXG4gICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZVxuICAgICAgICBcdFx0fVxuICAgICAgICBcdH0sXG4gICAgICAgIHBlZyRjNDkgPSBcInt7L1wiLFxuICAgICAgICBwZWckYzUwID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwie3svXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ7ey9cXFwiXCIgfSxcbiAgICAgICAgcGVnJGM1MSA9IC9eW159XS8sXG4gICAgICAgIHBlZyRjNTIgPSB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW159XVwiLCBkZXNjcmlwdGlvbjogXCJbXn1dXCIgfSxcbiAgICAgICAgcGVnJGM1MyA9IGZ1bmN0aW9uKHZhbHVlKSB7IHJldHVybiB2YWx1ZS5qb2luKFwiXCIpOyB9LFxuICAgICAgICBwZWckYzU0ID0gXCJ7e3tcIixcbiAgICAgICAgcGVnJGM1NSA9IHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7e1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3t7XFxcIlwiIH0sXG4gICAgICAgIHBlZyRjNTYgPSBcIn19fVwiLFxuICAgICAgICBwZWckYzU3ID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwifX19XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ9fX1cXFwiXCIgfSxcbiAgICAgICAgcGVnJGM1OCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuSU5URVJQT0xBVE9SLFxuICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVbMV1cbiAgICAgICAgXHRcdH1cbiAgICAgICAgXHR9LFxuICAgICAgICBwZWckYzU5ID0gL15bXFwvI3shPlxcXl0vLFxuICAgICAgICBwZWckYzYwID0geyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIltcXFxcLyN7IT5cXFxcXl1cIiwgZGVzY3JpcHRpb246IFwiW1xcXFwvI3shPlxcXFxeXVwiIH0sXG4gICAgICAgIHBlZyRjNjEgPSBcIiZcIixcbiAgICAgICAgcGVnJGM2MiA9IHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIiZcIiwgZGVzY3JpcHRpb246IFwiXFxcIiZcXFwiXCIgfSxcbiAgICAgICAgcGVnJGM2MyA9IGZ1bmN0aW9uKG0sIHZhbHVlKSB7XG4gICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICBcdFx0XHR0eXBlOiBtID8gTk9ERV9UWVBFLlRSSVBMRSA6IE5PREVfVFlQRS5JTlRFUlBPTEFUT1IsXG4gICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZVxuICAgICAgICBcdFx0fVxuICAgICAgICBcdH0sXG4gICAgICAgIHBlZyRjNjQgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLlRSSVBMRSxcbiAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlXG4gICAgICAgIFx0XHR9XG4gICAgICAgIFx0fSxcbiAgICAgICAgcGVnJGM2NSA9IC9eWyE+XS8sXG4gICAgICAgIHBlZyRjNjYgPSB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyE+XVwiLCBkZXNjcmlwdGlvbjogXCJbIT5dXCIgfSxcbiAgICAgICAgcGVnJGM2NyA9IGZ1bmN0aW9uKG0sIHZhbHVlKSB7XG4gICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICBcdFx0XHR0eXBlOiBtID09PSBcIj5cIiA/IE5PREVfVFlQRS5QQVJUSUFMIDogTk9ERV9UWVBFLk1DT01NRU5ULFxuICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWUuam9pbihcIlwiKS50cmltKClcbiAgICAgICAgXHRcdH1cbiAgICAgICAgXHR9LFxuICAgICAgICBwZWckYzY4ID0gXCJ8XCIsXG4gICAgICAgIHBlZyRjNjkgPSB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ8XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ8XFxcIlwiIH0sXG4gICAgICAgIHBlZyRjNzAgPSBmdW5jdGlvbihtKSB7IHJldHVybiB7IHJhdzogdGV4dCgpLCByZXN1bHQ6IG0gfSB9LFxuICAgICAgICBwZWckYzcxID0gZnVuY3Rpb24ocCwgYykge1xuICAgICAgICBcdFx0aWYgKHAgPT0gbnVsbCkgcCA9IHsgdHlwZTogXCJhbGxcIiB9O1xuICAgICAgICBcdFx0cC5wYXJ0cyA9IGM7XG4gICAgICAgIFx0XHRyZXR1cm4gcDtcbiAgICAgICAgXHR9LFxuICAgICAgICBwZWckYzcyID0gZnVuY3Rpb24ocCkgeyBwLnBhcnRzID0gW107IHJldHVybiBwOyB9LFxuICAgICAgICBwZWckYzczID0gXCIuLi9cIixcbiAgICAgICAgcGVnJGM3NCA9IHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi4uL1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiLi4vXFxcIlwiIH0sXG4gICAgICAgIHBlZyRjNzUgPSBmdW5jdGlvbihkKSB7IHJldHVybiB7IHR5cGU6IFwicGFyZW50XCIsIGRpc3RhbmNlOiBkLmxlbmd0aCB9OyB9LFxuICAgICAgICBwZWckYzc2ID0gXCIuL1wiLFxuICAgICAgICBwZWckYzc3ID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLi9cIiwgZGVzY3JpcHRpb246IFwiXFxcIi4vXFxcIlwiIH0sXG4gICAgICAgIHBlZyRjNzggPSBmdW5jdGlvbigpIHsgcmV0dXJuIHsgdHlwZTogXCJsb2NhbFwiIH07IH0sXG4gICAgICAgIHBlZyRjNzkgPSBcIi5cIixcbiAgICAgICAgcGVnJGM4MCA9IHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi5cXFwiXCIgfSxcbiAgICAgICAgcGVnJGM4MSA9IFwiL1wiLFxuICAgICAgICBwZWckYzgyID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiL1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiL1xcXCJcIiB9LFxuICAgICAgICBwZWckYzgzID0gZnVuY3Rpb24oKSB7IHJldHVybiB7IHR5cGU6IFwicm9vdFwiIH07IH0sXG4gICAgICAgIHBlZyRjODQgPSAvXlthLXowLTkkX10vaSxcbiAgICAgICAgcGVnJGM4NSA9IHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05JF9daVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05JF9daVwiIH0sXG4gICAgICAgIHBlZyRjODYgPSAvXlthLXowLTk6XFwtXyRdL2ksXG4gICAgICAgIHBlZyRjODcgPSB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOTpcXFxcLV8kXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOTpcXFxcLV8kXWlcIiB9LFxuICAgICAgICBwZWckYzg4ID0gZnVuY3Rpb24oaywgYykgeyByZXR1cm4geyBrZXk6IGssIGNoaWxkcmVuOiBjIH0gfSxcbiAgICAgICAgcGVnJGM4OSA9IFwiW1wiLFxuICAgICAgICBwZWckYzkwID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiW1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiW1xcXCJcIiB9LFxuICAgICAgICBwZWckYzkxID0gXCJdXCIsXG4gICAgICAgIHBlZyRjOTIgPSB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJdXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJdXFxcIlwiIH0sXG4gICAgICAgIHBlZyRjOTMgPSBmdW5jdGlvbihjKSB7IHJldHVybiBjOyB9LFxuICAgICAgICBwZWckYzk0ID0gXCJ0cnVlXCIsXG4gICAgICAgIHBlZyRjOTUgPSB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ0cnVlXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ0cnVlXFxcIlwiIH0sXG4gICAgICAgIHBlZyRjOTYgPSBmdW5jdGlvbigpIHsgcmV0dXJuIHRydWU7IH0sXG4gICAgICAgIHBlZyRjOTcgPSBcImZhbHNlXCIsXG4gICAgICAgIHBlZyRjOTggPSB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJmYWxzZVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiZmFsc2VcXFwiXCIgfSxcbiAgICAgICAgcGVnJGM5OSA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH0sXG4gICAgICAgIHBlZyRjMTAwID0gXCItXCIsXG4gICAgICAgIHBlZyRjMTAxID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLVxcXCJcIiB9LFxuICAgICAgICBwZWckYzEwMiA9IC9eWzAtOV0vLFxuICAgICAgICBwZWckYzEwMyA9IHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbMC05XVwiLCBkZXNjcmlwdGlvbjogXCJbMC05XVwiIH0sXG4gICAgICAgIHBlZyRjMTA0ID0gZnVuY3Rpb24oKSB7IHJldHVybiBwYXJzZUZsb2F0KHRleHQoKSwgMTApOyB9LFxuICAgICAgICBwZWckYzEwNSA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gcGFyc2VJbnQodGV4dCgpLCAxMCk7IH0sXG4gICAgICAgIHBlZyRjMTA2ID0gXCJcXFwiXCIsXG4gICAgICAgIHBlZyRjMTA3ID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXFxcIlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXFxcXFxcXCJcXFwiXCIgfSxcbiAgICAgICAgcGVnJGMxMDggPSAvXlteXCJdLyxcbiAgICAgICAgcGVnJGMxMDkgPSB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW15cXFwiXVwiLCBkZXNjcmlwdGlvbjogXCJbXlxcXCJdXCIgfSxcbiAgICAgICAgcGVnJGMxMTAgPSBmdW5jdGlvbih2KSB7IHJldHVybiB2LmpvaW4oXCJcIik7IH0sXG4gICAgICAgIHBlZyRjMTExID0gXCInXCIsXG4gICAgICAgIHBlZyRjMTEyID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiJ1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiJ1xcXCJcIiB9LFxuICAgICAgICBwZWckYzExMyA9IC9eW14nXS8sXG4gICAgICAgIHBlZyRjMTE0ID0geyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlteJ11cIiwgZGVzY3JpcHRpb246IFwiW14nXVwiIH0sXG4gICAgICAgIHBlZyRjMTE1ID0gXCJudWxsXCIsXG4gICAgICAgIHBlZyRjMTE2ID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwibnVsbFwiLCBkZXNjcmlwdGlvbjogXCJcXFwibnVsbFxcXCJcIiB9LFxuICAgICAgICBwZWckYzExNyA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gbnVsbDsgfSxcbiAgICAgICAgcGVnJGMxMTggPSBcInVuZGVmaW5lZFwiLFxuICAgICAgICBwZWckYzExOSA9IHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInVuZGVmaW5lZFwiLCBkZXNjcmlwdGlvbjogXCJcXFwidW5kZWZpbmVkXFxcIlwiIH0sXG4gICAgICAgIHBlZyRjMTIwID0gXCJ2b2lkXCIsXG4gICAgICAgIHBlZyRjMTIxID0geyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidm9pZFwiLCBkZXNjcmlwdGlvbjogXCJcXFwidm9pZFxcXCJcIiB9LFxuICAgICAgICBwZWckYzEyMiA9IC9eWyw7IFxcdFxcblxccl0vLFxuICAgICAgICBwZWckYzEyMyA9IHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbLDsgXFxcXHRcXFxcblxcXFxyXVwiLCBkZXNjcmlwdGlvbjogXCJbLDsgXFxcXHRcXFxcblxcXFxyXVwiIH0sXG4gICAgICAgIHBlZyRjMTI0ID0gZnVuY3Rpb24oKSB7IHJldHVybiB2b2lkIDA7IH0sXG4gICAgICAgIHBlZyRjMTI1ID0gL15bYS16MC05X1xcLV0vaSxcbiAgICAgICAgcGVnJGMxMjYgPSB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOV9cXFxcLV1pXCIsIGRlc2NyaXB0aW9uOiBcIlthLXowLTlfXFxcXC1daVwiIH0sXG4gICAgICAgIHBlZyRjMTI3ID0gZnVuY3Rpb24oaykgeyByZXR1cm4gazsgfSxcbiAgICAgICAgcGVnJGMxMjggPSB7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IFwid2hpdGVzcGFjZVwiIH0sXG4gICAgICAgIHBlZyRjMTI5ID0gL15bIFxcdFxcblxccl0vLFxuICAgICAgICBwZWckYzEzMCA9IHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbIFxcXFx0XFxcXG5cXFxccl1cIiwgZGVzY3JpcHRpb246IFwiWyBcXFxcdFxcXFxuXFxcXHJdXCIgfSxcbiAgICAgICAgcGVnJGMxMzEgPSBcIlxcXFxcIixcbiAgICAgICAgcGVnJGMxMzIgPSB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJcXFxcXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJcXFxcXFxcXFxcXCJcIiB9LFxuICAgICAgICBwZWckYzEzMyA9IGZ1bmN0aW9uKGNoYXIpIHsgcmV0dXJuIGNoYXI7IH0sXG5cbiAgICAgICAgcGVnJGN1cnJQb3MgICAgICAgICAgPSAwLFxuICAgICAgICBwZWckcmVwb3J0ZWRQb3MgICAgICA9IDAsXG4gICAgICAgIHBlZyRjYWNoZWRQb3MgICAgICAgID0gMCxcbiAgICAgICAgcGVnJGNhY2hlZFBvc0RldGFpbHMgPSB7IGxpbmU6IDEsIGNvbHVtbjogMSwgc2VlbkNSOiBmYWxzZSB9LFxuICAgICAgICBwZWckbWF4RmFpbFBvcyAgICAgICA9IDAsXG4gICAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQgID0gW10sXG4gICAgICAgIHBlZyRzaWxlbnRGYWlscyAgICAgID0gMCxcblxuICAgICAgICBwZWckcmVzdWx0O1xuXG4gICAgaWYgKFwic3RhcnRSdWxlXCIgaW4gb3B0aW9ucykge1xuICAgICAgaWYgKCEob3B0aW9ucy5zdGFydFJ1bGUgaW4gcGVnJHN0YXJ0UnVsZUZ1bmN0aW9ucykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3Qgc3RhcnQgcGFyc2luZyBmcm9tIHJ1bGUgXFxcIlwiICsgb3B0aW9ucy5zdGFydFJ1bGUgKyBcIlxcXCIuXCIpO1xuICAgICAgfVxuXG4gICAgICBwZWckc3RhcnRSdWxlRnVuY3Rpb24gPSBwZWckc3RhcnRSdWxlRnVuY3Rpb25zW29wdGlvbnMuc3RhcnRSdWxlXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0ZXh0KCkge1xuICAgICAgcmV0dXJuIGlucHV0LnN1YnN0cmluZyhwZWckcmVwb3J0ZWRQb3MsIHBlZyRjdXJyUG9zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvZmZzZXQoKSB7XG4gICAgICByZXR1cm4gcGVnJHJlcG9ydGVkUG9zO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpbmUoKSB7XG4gICAgICByZXR1cm4gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBlZyRyZXBvcnRlZFBvcykubGluZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb2x1bW4oKSB7XG4gICAgICByZXR1cm4gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBlZyRyZXBvcnRlZFBvcykuY29sdW1uO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4cGVjdGVkKGRlc2NyaXB0aW9uKSB7XG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24oXG4gICAgICAgIG51bGwsXG4gICAgICAgIFt7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uIH1dLFxuICAgICAgICBwZWckcmVwb3J0ZWRQb3NcbiAgICAgICk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IobWVzc2FnZSkge1xuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKG1lc3NhZ2UsIG51bGwsIHBlZyRyZXBvcnRlZFBvcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBvcykge1xuICAgICAgZnVuY3Rpb24gYWR2YW5jZShkZXRhaWxzLCBzdGFydFBvcywgZW5kUG9zKSB7XG4gICAgICAgIHZhciBwLCBjaDtcblxuICAgICAgICBmb3IgKHAgPSBzdGFydFBvczsgcCA8IGVuZFBvczsgcCsrKSB7XG4gICAgICAgICAgY2ggPSBpbnB1dC5jaGFyQXQocCk7XG4gICAgICAgICAgaWYgKGNoID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICBpZiAoIWRldGFpbHMuc2VlbkNSKSB7IGRldGFpbHMubGluZSsrOyB9XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbiA9IDE7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IGZhbHNlO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY2ggPT09IFwiXFxyXCIgfHwgY2ggPT09IFwiXFx1MjAyOFwiIHx8IGNoID09PSBcIlxcdTIwMjlcIikge1xuICAgICAgICAgICAgZGV0YWlscy5saW5lKys7XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbiA9IDE7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uKys7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocGVnJGNhY2hlZFBvcyAhPT0gcG9zKSB7XG4gICAgICAgIGlmIChwZWckY2FjaGVkUG9zID4gcG9zKSB7XG4gICAgICAgICAgcGVnJGNhY2hlZFBvcyA9IDA7XG4gICAgICAgICAgcGVnJGNhY2hlZFBvc0RldGFpbHMgPSB7IGxpbmU6IDEsIGNvbHVtbjogMSwgc2VlbkNSOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2UocGVnJGNhY2hlZFBvc0RldGFpbHMsIHBlZyRjYWNoZWRQb3MsIHBvcyk7XG4gICAgICAgIHBlZyRjYWNoZWRQb3MgPSBwb3M7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwZWckY2FjaGVkUG9zRGV0YWlscztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckZmFpbChleHBlY3RlZCkge1xuICAgICAgaWYgKHBlZyRjdXJyUG9zIDwgcGVnJG1heEZhaWxQb3MpIHsgcmV0dXJuOyB9XG5cbiAgICAgIGlmIChwZWckY3VyclBvcyA+IHBlZyRtYXhGYWlsUG9zKSB7XG4gICAgICAgIHBlZyRtYXhGYWlsUG9zID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQgPSBbXTtcbiAgICAgIH1cblxuICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZC5wdXNoKGV4cGVjdGVkKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckYnVpbGRFeGNlcHRpb24obWVzc2FnZSwgZXhwZWN0ZWQsIHBvcykge1xuICAgICAgZnVuY3Rpb24gY2xlYW51cEV4cGVjdGVkKGV4cGVjdGVkKSB7XG4gICAgICAgIHZhciBpID0gMTtcblxuICAgICAgICBleHBlY3RlZC5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICBpZiAoYS5kZXNjcmlwdGlvbiA8IGIuZGVzY3JpcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGEuZGVzY3JpcHRpb24gPiBiLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB3aGlsZSAoaSA8IGV4cGVjdGVkLmxlbmd0aCkge1xuICAgICAgICAgIGlmIChleHBlY3RlZFtpIC0gMV0gPT09IGV4cGVjdGVkW2ldKSB7XG4gICAgICAgICAgICBleHBlY3RlZC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRNZXNzYWdlKGV4cGVjdGVkLCBmb3VuZCkge1xuICAgICAgICBmdW5jdGlvbiBzdHJpbmdFc2NhcGUocykge1xuICAgICAgICAgIGZ1bmN0aW9uIGhleChjaCkgeyByZXR1cm4gY2guY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTsgfVxuXG4gICAgICAgICAgcmV0dXJuIHNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcL2csICAgJ1xcXFxcXFxcJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cIi9nLCAgICAnXFxcXFwiJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHgwOC9nLCAnXFxcXGInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcdC9nLCAgICdcXFxcdCcpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csICAgJ1xcXFxuJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGYvZywgICAnXFxcXGYnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAgICdcXFxccicpXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xceDAwLVxceDA3XFx4MEJcXHgwRVxceDBGXS9nLCBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx4MCcgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHgxMC1cXHgxRlxceDgwLVxceEZGXS9nLCAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx4JyAgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHUwMTgwLVxcdTBGRkZdL2csICAgICAgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxcdTAnICsgaGV4KGNoKTsgfSlcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx1MTA4MC1cXHVGRkZGXS9nLCAgICAgICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHUnICArIGhleChjaCk7IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGV4cGVjdGVkRGVzY3MgPSBuZXcgQXJyYXkoZXhwZWN0ZWQubGVuZ3RoKSxcbiAgICAgICAgICAgIGV4cGVjdGVkRGVzYywgZm91bmREZXNjLCBpO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBleHBlY3RlZC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGV4cGVjdGVkRGVzY3NbaV0gPSBleHBlY3RlZFtpXS5kZXNjcmlwdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGV4cGVjdGVkRGVzYyA9IGV4cGVjdGVkLmxlbmd0aCA+IDFcbiAgICAgICAgICA/IGV4cGVjdGVkRGVzY3Muc2xpY2UoMCwgLTEpLmpvaW4oXCIsIFwiKVxuICAgICAgICAgICAgICArIFwiIG9yIFwiXG4gICAgICAgICAgICAgICsgZXhwZWN0ZWREZXNjc1tleHBlY3RlZC5sZW5ndGggLSAxXVxuICAgICAgICAgIDogZXhwZWN0ZWREZXNjc1swXTtcblxuICAgICAgICBmb3VuZERlc2MgPSBmb3VuZCA/IFwiXFxcIlwiICsgc3RyaW5nRXNjYXBlKGZvdW5kKSArIFwiXFxcIlwiIDogXCJlbmQgb2YgaW5wdXRcIjtcblxuICAgICAgICByZXR1cm4gXCJFeHBlY3RlZCBcIiArIGV4cGVjdGVkRGVzYyArIFwiIGJ1dCBcIiArIGZvdW5kRGVzYyArIFwiIGZvdW5kLlwiO1xuICAgICAgfVxuXG4gICAgICB2YXIgcG9zRGV0YWlscyA9IHBlZyRjb21wdXRlUG9zRGV0YWlscyhwb3MpLFxuICAgICAgICAgIGZvdW5kICAgICAgPSBwb3MgPCBpbnB1dC5sZW5ndGggPyBpbnB1dC5jaGFyQXQocG9zKSA6IG51bGw7XG5cbiAgICAgIGlmIChleHBlY3RlZCAhPT0gbnVsbCkge1xuICAgICAgICBjbGVhbnVwRXhwZWN0ZWQoZXhwZWN0ZWQpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmV3IFN5bnRheEVycm9yKFxuICAgICAgICBtZXNzYWdlICE9PSBudWxsID8gbWVzc2FnZSA6IGJ1aWxkTWVzc2FnZShleHBlY3RlZCwgZm91bmQpLFxuICAgICAgICBleHBlY3RlZCxcbiAgICAgICAgZm91bmQsXG4gICAgICAgIHBvcyxcbiAgICAgICAgcG9zRGV0YWlscy5saW5lLFxuICAgICAgICBwb3NEZXRhaWxzLmNvbHVtblxuICAgICAgKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2VzdGFydCgpIHtcbiAgICAgIHZhciBzMCwgczE7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMSA9IHBlZyRwYXJzZWh0bWwoKTtcbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgczEgPSBwZWckYzAoczEpO1xuICAgICAgfVxuICAgICAgczAgPSBzMTtcblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZWh0bWwoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMjtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gW107XG4gICAgICBzMiA9IHBlZyRwYXJzZXNlY3Rpb24oKTtcbiAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IHBlZyRwYXJzZWV4dHJhU3RhY2hlKCk7XG4gICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMyID0gcGVnJHBhcnNlZG91YmxlU3RhY2hlKCk7XG4gICAgICAgICAgaWYgKHMyID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMiA9IHBlZyRwYXJzZXRyaXBsZVN0YWNoZSgpO1xuICAgICAgICAgICAgaWYgKHMyID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIHMyID0gcGVnJHBhcnNlY29tbWVudE5vZGUoKTtcbiAgICAgICAgICAgICAgaWYgKHMyID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgczIgPSBwZWckcGFyc2VlbGVtZW50Tm9kZSgpO1xuICAgICAgICAgICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgICAgczIgPSBwZWckcGFyc2V0ZXh0Tm9kZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgd2hpbGUgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMxLnB1c2goczIpO1xuICAgICAgICBzMiA9IHBlZyRwYXJzZXNlY3Rpb24oKTtcbiAgICAgICAgaWYgKHMyID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczIgPSBwZWckcGFyc2VleHRyYVN0YWNoZSgpO1xuICAgICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczIgPSBwZWckcGFyc2Vkb3VibGVTdGFjaGUoKTtcbiAgICAgICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBzMiA9IHBlZyRwYXJzZXRyaXBsZVN0YWNoZSgpO1xuICAgICAgICAgICAgICBpZiAoczIgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBzMiA9IHBlZyRwYXJzZWNvbW1lbnROb2RlKCk7XG4gICAgICAgICAgICAgICAgaWYgKHMyID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgICBzMiA9IHBlZyRwYXJzZWVsZW1lbnROb2RlKCk7XG4gICAgICAgICAgICAgICAgICBpZiAoczIgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgczIgPSBwZWckcGFyc2V0ZXh0Tm9kZSgpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICBzMSA9IHBlZyRjMihzMSk7XG4gICAgICB9XG4gICAgICBzMCA9IHMxO1xuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNldGV4dE5vZGUoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMjtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gW107XG4gICAgICBpZiAocGVnJGM0LnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgczIgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczIgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNSk7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICB3aGlsZSAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMS5wdXNoKHMyKTtcbiAgICAgICAgICBpZiAocGVnJGM0LnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgIHMyID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHMyID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM1KTsgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgIHMxID0gcGVnJGM2KHMxKTtcbiAgICAgIH1cbiAgICAgIHMwID0gczE7XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2Vjb21tZW50Tm9kZSgpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMztcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDQpID09PSBwZWckYzcpIHtcbiAgICAgICAgczEgPSBwZWckYzc7XG4gICAgICAgIHBlZyRjdXJyUG9zICs9IDQ7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM4KTsgfVxuICAgICAgfVxuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMyID0gcGVnJHBhcnNlY29tbWVudFZhbHVlKCk7XG4gICAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDMpID09PSBwZWckYzkpIHtcbiAgICAgICAgICAgIHMzID0gcGVnJGM5O1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgKz0gMztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwKTsgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICAgICAgczEgPSBwZWckYzExKHMyKTtcbiAgICAgICAgICAgIHMwID0gczE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2Vjb21tZW50VmFsdWUoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMjtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHBlZyRzaWxlbnRGYWlscysrO1xuICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgMykgPT09IHBlZyRjOSkge1xuICAgICAgICBzMSA9IHBlZyRjOTtcbiAgICAgICAgcGVnJGN1cnJQb3MgKz0gMztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHMxID0gcGVnJEZBSUxFRDtcbiAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwKTsgfVxuICAgICAgfVxuICAgICAgcGVnJHNpbGVudEZhaWxzLS07XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgczAgPSBwZWckYzEyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICB9XG4gICAgICBpZiAoczAgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgICAgaWYgKGlucHV0Lmxlbmd0aCA+IHBlZyRjdXJyUG9zKSB7XG4gICAgICAgICAgczEgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMyk7IH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMiA9IHBlZyRwYXJzZWNvbW1lbnRWYWx1ZSgpO1xuICAgICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczIgPSBwZWckYzE0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICAgICAgczEgPSBwZWckYzE1KHMxLCBzMik7XG4gICAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZWVsZW1lbnROb2RlKCkge1xuICAgICAgdmFyIHMwLCBzMSwgczIsIHMzO1xuXG4gICAgICBzMCA9IHBlZyRwYXJzZWVsZW1lbnRTZWxmQ2xvc2VkKCk7XG4gICAgICBpZiAoczAgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgICAgczEgPSBwZWckcGFyc2VlbGVtZW50U3RhcnQoKTtcbiAgICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczIgPSBwZWckcGFyc2VodG1sKCk7XG4gICAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMyA9IHBlZyRwYXJzZWVsZW1lbnRFbmQoKTtcbiAgICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICAgICAgczEgPSBwZWckYzE2KHMxLCBzMiwgczMpO1xuICAgICAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlZWxlbWVudFNlbGZDbG9zZWQoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMiwgczMsIHM0O1xuXG4gICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgaWYgKGlucHV0LmNoYXJDb2RlQXQocGVnJGN1cnJQb3MpID09PSA2MCkge1xuICAgICAgICBzMSA9IHBlZyRjMTc7XG4gICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxOCk7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IHBlZyRwYXJzZWtleSgpO1xuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMyA9IFtdO1xuICAgICAgICAgIHM0ID0gcGVnJHBhcnNlYXR0cmlidXRlKCk7XG4gICAgICAgICAgd2hpbGUgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMy5wdXNoKHM0KTtcbiAgICAgICAgICAgIHM0ID0gcGVnJHBhcnNlYXR0cmlidXRlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgMikgPT09IHBlZyRjMTkpIHtcbiAgICAgICAgICAgICAgczQgPSBwZWckYzE5O1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyArPSAyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgczQgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMjApOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoczQgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICAgIHMxID0gcGVnJGMyMShzMiwgczMpO1xuICAgICAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2VlbGVtZW50U3RhcnQoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMiwgczMsIHM0O1xuXG4gICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgaWYgKGlucHV0LmNoYXJDb2RlQXQocGVnJGN1cnJQb3MpID09PSA2MCkge1xuICAgICAgICBzMSA9IHBlZyRjMTc7XG4gICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxOCk7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IHBlZyRwYXJzZWtleSgpO1xuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMyA9IFtdO1xuICAgICAgICAgIHM0ID0gcGVnJHBhcnNlYXR0cmlidXRlKCk7XG4gICAgICAgICAgd2hpbGUgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMy5wdXNoKHM0KTtcbiAgICAgICAgICAgIHM0ID0gcGVnJHBhcnNlYXR0cmlidXRlKCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgaWYgKGlucHV0LmNoYXJDb2RlQXQocGVnJGN1cnJQb3MpID09PSA2Mikge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRjMjI7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMyMyk7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICAgICAgczEgPSBwZWckYzI0KHMyLCBzMyk7XG4gICAgICAgICAgICAgIHMwID0gczE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZWVsZW1lbnRFbmQoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMiwgczM7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCAyKSA9PT0gcGVnJGMyNSkge1xuICAgICAgICBzMSA9IHBlZyRjMjU7XG4gICAgICAgIHBlZyRjdXJyUG9zICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMyNik7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IHBlZyRwYXJzZWtleSgpO1xuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBpZiAoaW5wdXQuY2hhckNvZGVBdChwZWckY3VyclBvcykgPT09IDYyKSB7XG4gICAgICAgICAgICBzMyA9IHBlZyRjMjI7XG4gICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzMyA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMjMpOyB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICBzMSA9IHBlZyRjMjcoczIpO1xuICAgICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZWF0dHJpYnV0ZSgpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQsIHM1LCBzNjtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gcGVnJHBhcnNla2V5KCk7XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczIgPSBwZWckY3VyclBvcztcbiAgICAgICAgaWYgKGlucHV0LmNoYXJDb2RlQXQocGVnJGN1cnJQb3MpID09PSA2MSkge1xuICAgICAgICAgIHMzID0gcGVnJGMyODtcbiAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHMzID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMjkpOyB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczQgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczUgPSBwZWckcGFyc2VzdHJpY3Rfc3RyaW5nKCk7XG4gICAgICAgICAgICBpZiAoczUgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgczYgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICAgICAgICBpZiAoczYgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBzMyA9IFtzMywgczQsIHM1LCBzNl07XG4gICAgICAgICAgICAgICAgczIgPSBzMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMyO1xuICAgICAgICAgICAgICAgIHMyID0gcGVnJGMzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMyO1xuICAgICAgICAgICAgICBzMiA9IHBlZyRjMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMjtcbiAgICAgICAgICAgIHMyID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMyO1xuICAgICAgICAgIHMyID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMyID0gcGVnJGMxNDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICBzMSA9IHBlZyRjMzAoczEsIHMyKTtcbiAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlYXR0clZhbHVlKCkge1xuICAgICAgdmFyIHMwLCBzMSwgczI7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMSA9IFtdO1xuICAgICAgczIgPSBwZWckcGFyc2VzZWN0aW9uKCk7XG4gICAgICBpZiAoczIgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczIgPSBwZWckcGFyc2VleHRyYVN0YWNoZSgpO1xuICAgICAgICBpZiAoczIgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMiA9IHBlZyRwYXJzZWRvdWJsZVN0YWNoZSgpO1xuICAgICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczIgPSBwZWckcGFyc2V0cmlwbGVTdGFjaGUoKTtcbiAgICAgICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBzMiA9IHBlZyRwYXJzZXRleHROb2RlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICB3aGlsZSAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczEucHVzaChzMik7XG4gICAgICAgIHMyID0gcGVnJHBhcnNlc2VjdGlvbigpO1xuICAgICAgICBpZiAoczIgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMiA9IHBlZyRwYXJzZWV4dHJhU3RhY2hlKCk7XG4gICAgICAgICAgaWYgKHMyID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMiA9IHBlZyRwYXJzZWRvdWJsZVN0YWNoZSgpO1xuICAgICAgICAgICAgaWYgKHMyID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIHMyID0gcGVnJHBhcnNldHJpcGxlU3RhY2hlKCk7XG4gICAgICAgICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHMyID0gcGVnJHBhcnNldGV4dE5vZGUoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICBzMSA9IHBlZyRjMihzMSk7XG4gICAgICB9XG4gICAgICBzMCA9IHMxO1xuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlYXR0ckFyZ3VtZW50cygpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQ7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMSA9IHBlZyRwYXJzZWF0dHJBcmdWYWx1ZSgpO1xuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMyID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gNDQpIHtcbiAgICAgICAgICBzMyA9IHBlZyRjMzE7XG4gICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzMyA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzMyKTsgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHM0ID0gcGVnJHBhcnNlYXR0ckFyZ3VtZW50cygpO1xuICAgICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczMgPSBbczMsIHM0XTtcbiAgICAgICAgICAgIHMyID0gczM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczI7XG4gICAgICAgICAgICBzMiA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMjtcbiAgICAgICAgICBzMiA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgICBpZiAoczIgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMiA9IHBlZyRjMTQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgczEgPSBwZWckYzMzKHMxLCBzMik7XG4gICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZWF0dHJBcmdWYWx1ZSgpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQsIHM1O1xuXG4gICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgczEgPSBwZWckY3VyclBvcztcbiAgICAgIHMyID0gcGVnJHBhcnNld3MoKTtcbiAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMyA9IHBlZyRwYXJzZXN0YWNoZSgpO1xuICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzNCA9IHBlZyRwYXJzZXdzKCk7XG4gICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzNSA9IHBlZyRwYXJzZWF0dHJBcmdOb3RFbmQoKTtcbiAgICAgICAgICAgIGlmIChzNSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMTtcbiAgICAgICAgICAgICAgczIgPSBwZWckYzM0KHMzKTtcbiAgICAgICAgICAgICAgczEgPSBzMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgfVxuICAgICAgaWYgKHMxID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMxID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIHMyID0gcGVnJHBhcnNld3MoKTtcbiAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczMgPSBwZWckcGFyc2VzdHJpbmcoKTtcbiAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHM0ID0gcGVnJHBhcnNld3MoKTtcbiAgICAgICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBzNSA9IHBlZyRwYXJzZWF0dHJBcmdOb3RFbmQoKTtcbiAgICAgICAgICAgICAgaWYgKHM1ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczE7XG4gICAgICAgICAgICAgICAgczIgPSBwZWckYzM0KHMzKTtcbiAgICAgICAgICAgICAgICBzMSA9IHMyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMxID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczEgPSBwZWckY3VyclBvcztcbiAgICAgICAgICBzMiA9IHBlZyRwYXJzZXdzKCk7XG4gICAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMyA9IHBlZyRwYXJzZWJvb2xlYW4oKTtcbiAgICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRwYXJzZXdzKCk7XG4gICAgICAgICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHM1ID0gcGVnJHBhcnNlYXR0ckFyZ05vdEVuZCgpO1xuICAgICAgICAgICAgICAgIGlmIChzNSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczE7XG4gICAgICAgICAgICAgICAgICBzMiA9IHBlZyRjMzQoczMpO1xuICAgICAgICAgICAgICAgICAgczEgPSBzMjtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoczEgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHMxID0gcGVnJGN1cnJQb3M7XG4gICAgICAgICAgICBzMiA9IHBlZyRwYXJzZXdzKCk7XG4gICAgICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgczMgPSBwZWckcGFyc2VudW1iZXIoKTtcbiAgICAgICAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgczQgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICAgICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgICAgczUgPSBwZWckcGFyc2VhdHRyQXJnTm90RW5kKCk7XG4gICAgICAgICAgICAgICAgICBpZiAoczUgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczE7XG4gICAgICAgICAgICAgICAgICAgIHMyID0gcGVnJGMzNChzMyk7XG4gICAgICAgICAgICAgICAgICAgIHMxID0gczI7XG4gICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzMSA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBzMSA9IHBlZyRjdXJyUG9zO1xuICAgICAgICAgICAgICBzMiA9IHBlZyRwYXJzZXdzKCk7XG4gICAgICAgICAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHMzID0gcGVnJHBhcnNlbnVsbCgpO1xuICAgICAgICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgICAgczQgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICAgICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgICAgIHM1ID0gcGVnJHBhcnNlYXR0ckFyZ05vdEVuZCgpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoczUgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMTtcbiAgICAgICAgICAgICAgICAgICAgICBzMiA9IHBlZyRjMzQoczMpO1xuICAgICAgICAgICAgICAgICAgICAgIHMxID0gczI7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoczEgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBzMSA9IHBlZyRjdXJyUG9zO1xuICAgICAgICAgICAgICAgIHMyID0gcGVnJHBhcnNld3MoKTtcbiAgICAgICAgICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICAgIHMzID0gcGVnJHBhcnNldW5kZWZpbmVkKCk7XG4gICAgICAgICAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgczQgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoczQgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgICBzNSA9IHBlZyRwYXJzZWF0dHJBcmdOb3RFbmQoKTtcbiAgICAgICAgICAgICAgICAgICAgICBpZiAoczUgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMxO1xuICAgICAgICAgICAgICAgICAgICAgICAgczIgPSBwZWckYzM0KHMzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHMxID0gczI7XG4gICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKHMxID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgICBzMSA9IHBlZyRjdXJyUG9zO1xuICAgICAgICAgICAgICAgICAgczIgPSBwZWckY3VyclBvcztcbiAgICAgICAgICAgICAgICAgIHMzID0gW107XG4gICAgICAgICAgICAgICAgICBpZiAocGVnJGMzNS50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICAgICAgICAgIHM0ID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHM0ID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzM2KTsgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgd2hpbGUgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgICAgIHMzLnB1c2goczQpO1xuICAgICAgICAgICAgICAgICAgICBpZiAocGVnJGMzNS50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgczQgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgczQgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMzNik7IH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgICAgIHMzID0gaW5wdXQuc3Vic3RyaW5nKHMyLCBwZWckY3VyclBvcyk7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICBzMiA9IHMzO1xuICAgICAgICAgICAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMxO1xuICAgICAgICAgICAgICAgICAgICBzMiA9IHBlZyRjMzcoczIpO1xuICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgczEgPSBzMjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgczEgPSBwZWckYzM4KHMxKTtcbiAgICAgIH1cbiAgICAgIHMwID0gczE7XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2VhdHRyQXJnTm90RW5kKCkge1xuICAgICAgdmFyIHMwLCBzMSwgczI7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBwZWckc2lsZW50RmFpbHMrKztcbiAgICAgIGlmIChwZWckYzM5LnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgczEgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNDApOyB9XG4gICAgICB9XG4gICAgICBpZiAoczEgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczEgPSBwZWckY3VyclBvcztcbiAgICAgICAgcGVnJHNpbGVudEZhaWxzKys7XG4gICAgICAgIGlmIChpbnB1dC5sZW5ndGggPiBwZWckY3VyclBvcykge1xuICAgICAgICAgIHMyID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHMyID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTMpOyB9XG4gICAgICAgIH1cbiAgICAgICAgcGVnJHNpbGVudEZhaWxzLS07XG4gICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMxID0gcGVnJGMxMjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBwZWckc2lsZW50RmFpbHMtLTtcbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMTI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZXNlY3Rpb24oKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMiwgczM7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMSA9IHBlZyRwYXJzZXNlY3Rpb25TdGFydCgpO1xuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMyID0gcGVnJHBhcnNlaHRtbCgpO1xuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMyA9IHBlZyRwYXJzZXNlY3Rpb25FbmQoKTtcbiAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICAgICAgczEgPSBwZWckYzQxKHMxLCBzMiwgczMpO1xuICAgICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZXNlY3Rpb25TdGFydCgpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQ7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCAyKSA9PT0gcGVnJGM0Mikge1xuICAgICAgICBzMSA9IHBlZyRjNDI7XG4gICAgICAgIHBlZyRjdXJyUG9zICs9IDI7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM0Myk7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBpZiAocGVnJGM0NC50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgczIgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgczIgPSBwZWckRkFJTEVEO1xuICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM0NSk7IH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMyA9IHBlZyRwYXJzZXBhdGhRdWVyeVdpdGhSYXcoKTtcbiAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDIpID09PSBwZWckYzQ2KSB7XG4gICAgICAgICAgICAgIHM0ID0gcGVnJGM0NjtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgKz0gMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHM0ID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzQ3KTsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICAgICAgICBzMSA9IHBlZyRjNDgoczIsIHMzKTtcbiAgICAgICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlc2VjdGlvbkVuZCgpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMztcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDMpID09PSBwZWckYzQ5KSB7XG4gICAgICAgIHMxID0gcGVnJGM0OTtcbiAgICAgICAgcGVnJGN1cnJQb3MgKz0gMztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHMxID0gcGVnJEZBSUxFRDtcbiAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzUwKTsgfVxuICAgICAgfVxuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMyID0gW107XG4gICAgICAgIHMzID0gcGVnJHBhcnNlZXNjYXBlKCk7XG4gICAgICAgIGlmIChzMyA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIGlmIChwZWckYzUxLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgIHMzID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHMzID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM1Mik7IH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczIucHVzaChzMyk7XG4gICAgICAgICAgczMgPSBwZWckcGFyc2Vlc2NhcGUoKTtcbiAgICAgICAgICBpZiAoczMgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIGlmIChwZWckYzUxLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgICAgczMgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNTIpOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDIpID09PSBwZWckYzQ2KSB7XG4gICAgICAgICAgICBzMyA9IHBlZyRjNDY7XG4gICAgICAgICAgICBwZWckY3VyclBvcyArPSAyO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzMyA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNDcpOyB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICBzMSA9IHBlZyRjNTMoczIpO1xuICAgICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZXN0YWNoZSgpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQ7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMSA9IHBlZyRjdXJyUG9zO1xuICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgMykgPT09IHBlZyRjNTQpIHtcbiAgICAgICAgczIgPSBwZWckYzU0O1xuICAgICAgICBwZWckY3VyclBvcyArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczIgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNTUpOyB9XG4gICAgICB9XG4gICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczMgPSBwZWckcGFyc2VwYXRoUXVlcnkoKTtcbiAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgMykgPT09IHBlZyRjNTYpIHtcbiAgICAgICAgICAgIHM0ID0gcGVnJGM1NjtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IDM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHM0ID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM1Nyk7IH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMiA9IFtzMiwgczMsIHM0XTtcbiAgICAgICAgICAgIHMxID0gczI7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICB9XG4gICAgICBpZiAoczEgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczEgPSBwZWckY3VyclBvcztcbiAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgMikgPT09IHBlZyRjNDIpIHtcbiAgICAgICAgICBzMiA9IHBlZyRjNDI7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgKz0gMjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzMiA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzQzKTsgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMzID0gcGVnJHBhcnNlcGF0aFF1ZXJ5KCk7XG4gICAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCAyKSA9PT0gcGVnJGM0Nikge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRjNDY7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IDI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM0Nyk7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBzMiA9IFtzMiwgczMsIHM0XTtcbiAgICAgICAgICAgICAgczEgPSBzMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICAgIHMxID0gcGVnJGMzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMxO1xuICAgICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgczEgPSBwZWckYzU4KHMxKTtcbiAgICAgIH1cbiAgICAgIHMwID0gczE7XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2Vkb3VibGVTdGFjaGUoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMiwgczMsIHM0LCBzNTtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDIpID09PSBwZWckYzQyKSB7XG4gICAgICAgIHMxID0gcGVnJGM0MjtcbiAgICAgICAgcGVnJGN1cnJQb3MgKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHMxID0gcGVnJEZBSUxFRDtcbiAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzQzKTsgfVxuICAgICAgfVxuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMyID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIHBlZyRzaWxlbnRGYWlscysrO1xuICAgICAgICBpZiAocGVnJGM1OS50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgczMgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM2MCk7IH1cbiAgICAgICAgfVxuICAgICAgICBwZWckc2lsZW50RmFpbHMtLTtcbiAgICAgICAgaWYgKHMzID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczIgPSBwZWckYzEyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczI7XG4gICAgICAgICAgczIgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgaWYgKGlucHV0LmNoYXJDb2RlQXQocGVnJGN1cnJQb3MpID09PSAzOCkge1xuICAgICAgICAgICAgczMgPSBwZWckYzYxO1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzYyKTsgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoczMgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHMzID0gcGVnJGMxNDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzNCA9IHBlZyRwYXJzZXBhdGhRdWVyeSgpO1xuICAgICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDIpID09PSBwZWckYzQ2KSB7XG4gICAgICAgICAgICAgICAgczUgPSBwZWckYzQ2O1xuICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgczUgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM0Nyk7IH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpZiAoczUgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICAgICAgICBzMSA9IHBlZyRjNjMoczMsIHM0KTtcbiAgICAgICAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNldHJpcGxlU3RhY2hlKCkge1xuICAgICAgdmFyIHMwLCBzMSwgczIsIHMzO1xuXG4gICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgMykgPT09IHBlZyRjNTQpIHtcbiAgICAgICAgczEgPSBwZWckYzU0O1xuICAgICAgICBwZWckY3VyclBvcyArPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNTUpOyB9XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczIgPSBwZWckcGFyc2VwYXRoUXVlcnkoKTtcbiAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgMykgPT09IHBlZyRjNTYpIHtcbiAgICAgICAgICAgIHMzID0gcGVnJGM1NjtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IDM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHMzID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM1Nyk7IH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICAgIHMxID0gcGVnJGM2NChzMik7XG4gICAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlZXh0cmFTdGFjaGUoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMiwgczMsIHM0O1xuXG4gICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgMikgPT09IHBlZyRjNDIpIHtcbiAgICAgICAgczEgPSBwZWckYzQyO1xuICAgICAgICBwZWckY3VyclBvcyArPSAyO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNDMpOyB9XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgaWYgKHBlZyRjNjUudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgIHMyID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHMyID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNjYpOyB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczMgPSBbXTtcbiAgICAgICAgICBzNCA9IHBlZyRwYXJzZWVzY2FwZSgpO1xuICAgICAgICAgIGlmIChzNCA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgaWYgKHBlZyRjNTEudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgICBzNCA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM1Mik7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgd2hpbGUgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMy5wdXNoKHM0KTtcbiAgICAgICAgICAgIHM0ID0gcGVnJHBhcnNlZXNjYXBlKCk7XG4gICAgICAgICAgICBpZiAoczQgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgaWYgKHBlZyRjNTEudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgICAgIHM0ID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHM0ID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNTIpOyB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCAyKSA9PT0gcGVnJGM0Nikge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRjNDY7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IDI7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM0Nyk7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICAgICAgczEgPSBwZWckYzY3KHMyLCBzMyk7XG4gICAgICAgICAgICAgIHMwID0gczE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZXBhdGhRdWVyeSgpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQ7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMSA9IHBlZyRwYXJzZXBhdGgoKTtcbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IHBlZyRjdXJyUG9zO1xuICAgICAgICBpZiAoaW5wdXQuY2hhckNvZGVBdChwZWckY3VyclBvcykgPT09IDEyNCkge1xuICAgICAgICAgIHMzID0gcGVnJGM2ODtcbiAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHMzID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjNjkpOyB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczQgPSBwZWckcGFyc2VwYXRoUXVlcnkoKTtcbiAgICAgICAgICBpZiAoczQgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHMzID0gW3MzLCBzNF07XG4gICAgICAgICAgICBzMiA9IHMzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMyO1xuICAgICAgICAgICAgczIgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczI7XG4gICAgICAgICAgczIgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMyID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczIgPSBwZWckYzE0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICAgIHMxID0gcGVnJGMzMyhzMSwgczIpO1xuICAgICAgICAgIHMwID0gczE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2VwYXRoUXVlcnlXaXRoUmF3KCkge1xuICAgICAgdmFyIHMwLCBzMTtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gcGVnJHBhcnNlcGF0aFF1ZXJ5KCk7XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgIHMxID0gcGVnJGM3MChzMSk7XG4gICAgICB9XG4gICAgICBzMCA9IHMxO1xuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlcGF0aCgpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQ7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMSA9IHBlZyRwYXJzZXdzKCk7XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczIgPSBwZWckcGFyc2VwYXRoUHJlZml4KCk7XG4gICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMyID0gcGVnJGMxNDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMyA9IHBlZyRwYXJzZXBhdGhDb3JlKCk7XG4gICAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzNCA9IHBlZyRwYXJzZXdzKCk7XG4gICAgICAgICAgICBpZiAoczQgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICAgIHMxID0gcGVnJGM3MShzMiwgczMpO1xuICAgICAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICB9XG4gICAgICBpZiAoczAgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgICAgczEgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMiA9IHBlZyRwYXJzZXBhdGhQcmVmaXgoKTtcbiAgICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHMzID0gcGVnJHBhcnNld3MoKTtcbiAgICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICAgICAgczEgPSBwZWckYzcyKHMyKTtcbiAgICAgICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZXBhdGhQcmVmaXgoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMjtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gW107XG4gICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCAzKSA9PT0gcGVnJGM3Mykge1xuICAgICAgICBzMiA9IHBlZyRjNzM7XG4gICAgICAgIHBlZyRjdXJyUG9zICs9IDM7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMiA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM3NCk7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICB3aGlsZSAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMS5wdXNoKHMyKTtcbiAgICAgICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCAzKSA9PT0gcGVnJGM3Mykge1xuICAgICAgICAgICAgczIgPSBwZWckYzczO1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgKz0gMztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgczIgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzc0KTsgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgIHMxID0gcGVnJGM3NShzMSk7XG4gICAgICB9XG4gICAgICBzMCA9IHMxO1xuICAgICAgaWYgKHMwID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDIpID09PSBwZWckYzc2KSB7XG4gICAgICAgICAgczEgPSBwZWckYzc2O1xuICAgICAgICAgIHBlZyRjdXJyUG9zICs9IDI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM3Nyk7IH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICBzMSA9IHBlZyRjNzgoKTtcbiAgICAgICAgfVxuICAgICAgICBzMCA9IHMxO1xuICAgICAgICBpZiAoczAgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gNDYpIHtcbiAgICAgICAgICAgIHMxID0gcGVnJGM3OTtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHMxID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM4MCk7IH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICAgIHMxID0gcGVnJGM3OCgpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgIGlmIChzMCA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgICAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gNDcpIHtcbiAgICAgICAgICAgICAgczEgPSBwZWckYzgxO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjODIpOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICAgIHMxID0gcGVnJGM4MygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZXBhdGhDb3JlKCkge1xuICAgICAgdmFyIHMwLCBzMSwgczIsIHMzLCBzNDtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gcGVnJHBhcnNlcGF0aFBhcnQoKTtcbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IHBlZyRjdXJyUG9zO1xuICAgICAgICBpZiAoaW5wdXQuY2hhckNvZGVBdChwZWckY3VyclBvcykgPT09IDQ2KSB7XG4gICAgICAgICAgczMgPSBwZWckYzc5O1xuICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM4MCk7IH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzNCA9IHBlZyRwYXJzZXBhdGhDb3JlKCk7XG4gICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzMyA9IFtzMywgczRdO1xuICAgICAgICAgICAgczIgPSBzMztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMjtcbiAgICAgICAgICAgIHMyID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMyO1xuICAgICAgICAgIHMyID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzMiA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMyID0gcGVnJGMxNDtcbiAgICAgICAgfVxuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICBzMSA9IHBlZyRjMzMoczEsIHMyKTtcbiAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlcGF0aFBhcnQoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMiwgczMsIHM0LCBzNTtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMiA9IHBlZyRjdXJyUG9zO1xuICAgICAgaWYgKHBlZyRjODQudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICBzMyA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMyA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM4NSk7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzNCA9IFtdO1xuICAgICAgICBpZiAocGVnJGM4Ni50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgczUgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgczUgPSBwZWckRkFJTEVEO1xuICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM4Nyk7IH1cbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAoczUgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzNC5wdXNoKHM1KTtcbiAgICAgICAgICBpZiAocGVnJGM4Ni50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICBzNSA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzNSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjODcpOyB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMzID0gW3MzLCBzNF07XG4gICAgICAgICAgczIgPSBzMztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMyO1xuICAgICAgICAgIHMyID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMyO1xuICAgICAgICBzMiA9IHBlZyRjMztcbiAgICAgIH1cbiAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IGlucHV0LnN1YnN0cmluZyhzMSwgcGVnJGN1cnJQb3MpO1xuICAgICAgfVxuICAgICAgczEgPSBzMjtcbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IFtdO1xuICAgICAgICBzMyA9IHBlZyRwYXJzZXBhdGhEeW5hbWljKCk7XG4gICAgICAgIHdoaWxlIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMyLnB1c2goczMpO1xuICAgICAgICAgIHMzID0gcGVnJHBhcnNlcGF0aER5bmFtaWMoKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICBzMSA9IHBlZyRjODgoczEsIHMyKTtcbiAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlcGF0aER5bmFtaWMoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMiwgczMsIHM0LCBzNTtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gOTEpIHtcbiAgICAgICAgczEgPSBwZWckYzg5O1xuICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjOTApOyB9XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczIgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMyA9IHBlZyRwYXJzZWludGVnZXIoKTtcbiAgICAgICAgICBpZiAoczMgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHMzID0gcGVnJHBhcnNlc3RyaW5nKCk7XG4gICAgICAgICAgICBpZiAoczMgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgczMgPSBwZWckcGFyc2VwYXRoKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczQgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gOTMpIHtcbiAgICAgICAgICAgICAgICBzNSA9IHBlZyRjOTE7XG4gICAgICAgICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBzNSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzkyKTsgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlmIChzNSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICAgICAgICAgIHMxID0gcGVnJGM5MyhzMyk7XG4gICAgICAgICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZWJvb2xlYW4oKSB7XG4gICAgICB2YXIgczAsIHMxO1xuXG4gICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgNCkgPT09IHBlZyRjOTQpIHtcbiAgICAgICAgczEgPSBwZWckYzk0O1xuICAgICAgICBwZWckY3VyclBvcyArPSA0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjOTUpOyB9XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgIHMxID0gcGVnJGM5NigpO1xuICAgICAgfVxuICAgICAgczAgPSBzMTtcbiAgICAgIGlmIChzMCA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCA1KSA9PT0gcGVnJGM5Nykge1xuICAgICAgICAgIHMxID0gcGVnJGM5NztcbiAgICAgICAgICBwZWckY3VyclBvcyArPSA1O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHMxID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjOTgpOyB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgczEgPSBwZWckYzk5KCk7XG4gICAgICAgIH1cbiAgICAgICAgczAgPSBzMTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZW51bWJlcigpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQsIHM1LCBzNjtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gNDUpIHtcbiAgICAgICAgczEgPSBwZWckYzEwMDtcbiAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHMxID0gcGVnJEZBSUxFRDtcbiAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwMSk7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMSA9IHBlZyRjMTQ7XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczIgPSBbXTtcbiAgICAgICAgaWYgKHBlZyRjMTAyLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICBzMyA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzMyA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwMyk7IH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICB3aGlsZSAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHMyLnB1c2goczMpO1xuICAgICAgICAgICAgaWYgKHBlZyRjMTAyLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgICAgczMgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTAzKTsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzMiA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMyA9IHBlZyRjdXJyUG9zO1xuICAgICAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gNDYpIHtcbiAgICAgICAgICAgIHM0ID0gcGVnJGM3OTtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHM0ID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGM4MCk7IH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBzNSA9IFtdO1xuICAgICAgICAgICAgaWYgKHBlZyRjMTAyLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgICAgczYgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgczYgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTAzKTsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHM2ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIHdoaWxlIChzNiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHM1LnB1c2goczYpO1xuICAgICAgICAgICAgICAgIGlmIChwZWckYzEwMi50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICAgICAgICBzNiA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICBzNiA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTAzKTsgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgczUgPSBwZWckYzM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoczUgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgczQgPSBbczQsIHM1XTtcbiAgICAgICAgICAgICAgczMgPSBzNDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczM7XG4gICAgICAgICAgICAgIHMzID0gcGVnJGMzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMzO1xuICAgICAgICAgICAgczMgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzMyA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczMgPSBwZWckYzE0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICAgICAgczEgPSBwZWckYzEwNCgpO1xuICAgICAgICAgICAgczAgPSBzMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZWludGVnZXIoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMjtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gW107XG4gICAgICBpZiAocGVnJGMxMDIudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICBzMiA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMiA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMDMpOyB9XG4gICAgICB9XG4gICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgd2hpbGUgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczEucHVzaChzMik7XG4gICAgICAgICAgaWYgKHBlZyRjMTAyLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgIHMyID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHMyID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMDMpOyB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgczEgPSBwZWckYzEwNSgpO1xuICAgICAgfVxuICAgICAgczAgPSBzMTtcblxuICAgICAgcmV0dXJuIHMwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZXN0cmluZygpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMztcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gMzQpIHtcbiAgICAgICAgczEgPSBwZWckYzEwNjtcbiAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHMxID0gcGVnJEZBSUxFRDtcbiAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwNyk7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IFtdO1xuICAgICAgICBzMyA9IHBlZyRwYXJzZWVzY2FwZSgpO1xuICAgICAgICBpZiAoczMgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBpZiAocGVnJGMxMDgudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgczMgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwOSk7IH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgd2hpbGUgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczIucHVzaChzMyk7XG4gICAgICAgICAgczMgPSBwZWckcGFyc2Vlc2NhcGUoKTtcbiAgICAgICAgICBpZiAoczMgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIGlmIChwZWckYzEwOC50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICAgIHMzID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHMzID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwOSk7IH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgaWYgKGlucHV0LmNoYXJDb2RlQXQocGVnJGN1cnJQb3MpID09PSAzNCkge1xuICAgICAgICAgICAgczMgPSBwZWckYzEwNjtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHMzID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMDcpOyB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICBzMSA9IHBlZyRjMTEwKHMyKTtcbiAgICAgICAgICAgIHMwID0gczE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICB9XG4gICAgICBpZiAoczAgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgICAgaWYgKGlucHV0LmNoYXJDb2RlQXQocGVnJGN1cnJQb3MpID09PSAzOSkge1xuICAgICAgICAgIHMxID0gcGVnJGMxMTE7XG4gICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzExMik7IH1cbiAgICAgICAgfVxuICAgICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMiA9IFtdO1xuICAgICAgICAgIHMzID0gcGVnJHBhcnNlZXNjYXBlKCk7XG4gICAgICAgICAgaWYgKHMzID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBpZiAocGVnJGMxMTMudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgICBzMyA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzMyA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMTQpOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHdoaWxlIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczIucHVzaChzMyk7XG4gICAgICAgICAgICBzMyA9IHBlZyRwYXJzZWVzY2FwZSgpO1xuICAgICAgICAgICAgaWYgKHMzID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIGlmIChwZWckYzExMy50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICAgICAgczMgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMTQpOyB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBpZiAoaW5wdXQuY2hhckNvZGVBdChwZWckY3VyclBvcykgPT09IDM5KSB7XG4gICAgICAgICAgICAgIHMzID0gcGVnJGMxMTE7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzMyA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMTIpOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICAgIHMxID0gcGVnJGMxMTAoczIpO1xuICAgICAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlc3RyaWN0X3N0cmluZygpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyLCBzMywgczQ7XG5cbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBpZiAoaW5wdXQuY2hhckNvZGVBdChwZWckY3VyclBvcykgPT09IDM0KSB7XG4gICAgICAgIHMxID0gcGVnJGMxMDY7XG4gICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMDcpOyB9XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczIgPSBwZWckY3VyclBvcztcbiAgICAgICAgczMgPSBbXTtcbiAgICAgICAgaWYgKHBlZyRjMTA4LnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICBzNCA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzNCA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwOSk7IH1cbiAgICAgICAgfVxuICAgICAgICB3aGlsZSAoczQgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBzMy5wdXNoKHM0KTtcbiAgICAgICAgICBpZiAocGVnJGMxMDgudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgczQgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgczQgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwOSk7IH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczMgPSBpbnB1dC5zdWJzdHJpbmcoczIsIHBlZyRjdXJyUG9zKTtcbiAgICAgICAgfVxuICAgICAgICBzMiA9IHMzO1xuICAgICAgICBpZiAoczIgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICBpZiAoaW5wdXQuY2hhckNvZGVBdChwZWckY3VyclBvcykgPT09IDM0KSB7XG4gICAgICAgICAgICBzMyA9IHBlZyRjMTA2O1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgczMgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEwNyk7IH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHMzICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzMDtcbiAgICAgICAgICAgIHMxID0gcGVnJGMzNChzMik7XG4gICAgICAgICAgICBzMCA9IHMxO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgfVxuICAgICAgaWYgKHMwID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gMzkpIHtcbiAgICAgICAgICBzMSA9IHBlZyRjMTExO1xuICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMTIpOyB9XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczIgPSBwZWckY3VyclBvcztcbiAgICAgICAgICBzMyA9IFtdO1xuICAgICAgICAgIGlmIChwZWckYzExMy50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICBzNCA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzNCA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTE0KTsgfVxuICAgICAgICAgIH1cbiAgICAgICAgICB3aGlsZSAoczQgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHMzLnB1c2goczQpO1xuICAgICAgICAgICAgaWYgKHBlZyRjMTEzLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgICAgczQgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgczQgPSBwZWckRkFJTEVEO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTE0KTsgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHMzID0gaW5wdXQuc3Vic3RyaW5nKHMyLCBwZWckY3VyclBvcyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHMyID0gczM7XG4gICAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICBpZiAoaW5wdXQuY2hhckNvZGVBdChwZWckY3VyclBvcykgPT09IDM5KSB7XG4gICAgICAgICAgICAgIHMzID0gcGVnJGMxMTE7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzMyA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMTIpOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICAgIHMxID0gcGVnJGMzNChzMik7XG4gICAgICAgICAgICAgIHMwID0gczE7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBwZWckY3VyclBvcyA9IHMwO1xuICAgICAgICAgIHMwID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2VudWxsKCkge1xuICAgICAgdmFyIHMwLCBzMTtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIDQpID09PSBwZWckYzExNSkge1xuICAgICAgICBzMSA9IHBlZyRjMTE1O1xuICAgICAgICBwZWckY3VyclBvcyArPSA0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczEgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTE2KTsgfVxuICAgICAgfVxuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICBzMSA9IHBlZyRjMTE3KCk7XG4gICAgICB9XG4gICAgICBzMCA9IHMxO1xuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNldW5kZWZpbmVkKCkge1xuICAgICAgdmFyIHMwLCBzMSwgczIsIHMzLCBzNCwgczUsIHM2O1xuXG4gICAgICBzMCA9IHBlZyRjdXJyUG9zO1xuICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgOSkgPT09IHBlZyRjMTE4KSB7XG4gICAgICAgIHMxID0gcGVnJGMxMTg7XG4gICAgICAgIHBlZyRjdXJyUG9zICs9IDk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMTkpOyB9XG4gICAgICB9XG4gICAgICBpZiAoczEgPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczEgPSBwZWckY3VyclBvcztcbiAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgNCkgPT09IHBlZyRjMTIwKSB7XG4gICAgICAgICAgczIgPSBwZWckYzEyMDtcbiAgICAgICAgICBwZWckY3VyclBvcyArPSA0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHMyID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTIxKTsgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMzID0gcGVnJHBhcnNld3MoKTtcbiAgICAgICAgICBpZiAoczMgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgIHM0ID0gcGVnJGN1cnJQb3M7XG4gICAgICAgICAgICBwZWckc2lsZW50RmFpbHMrKztcbiAgICAgICAgICAgIHM1ID0gW107XG4gICAgICAgICAgICBpZiAocGVnJGMxMjIudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgICBzNiA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzNiA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMjMpOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoczYgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgd2hpbGUgKHM2ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgczUucHVzaChzNik7XG4gICAgICAgICAgICAgICAgaWYgKHBlZyRjMTIyLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgICAgICAgIHM2ID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgIHM2ID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMjMpOyB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzNSA9IHBlZyRjMztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHBlZyRzaWxlbnRGYWlscy0tO1xuICAgICAgICAgICAgaWYgKHM1ID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIHM0ID0gcGVnJGMxMjtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczQ7XG4gICAgICAgICAgICAgIHM0ID0gcGVnJGMzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHM0ICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgIHMyID0gW3MyLCBzMywgczRdO1xuICAgICAgICAgICAgICBzMSA9IHMyO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICAgICAgczEgPSBwZWckYzM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczE7XG4gICAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMTtcbiAgICAgICAgICBzMSA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgaWYgKHMxICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICBzMSA9IHBlZyRjMTI0KCk7XG4gICAgICB9XG4gICAgICBzMCA9IHMxO1xuXG4gICAgICByZXR1cm4gczA7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNla2V5KCkge1xuICAgICAgdmFyIHMwLCBzMSwgczIsIHMzLCBzNDtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIHMxID0gcGVnJHBhcnNld3MoKTtcbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMiA9IHBlZyRjdXJyUG9zO1xuICAgICAgICBzMyA9IFtdO1xuICAgICAgICBpZiAocGVnJGMxMjUudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgIHM0ID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHM0ID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTI2KTsgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHdoaWxlIChzNCAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgczMucHVzaChzNCk7XG4gICAgICAgICAgICBpZiAocGVnJGMxMjUudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgICBzNCA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zKys7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBzNCA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMjYpOyB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHMzID0gcGVnJGMzO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHMzID0gaW5wdXQuc3Vic3RyaW5nKHMyLCBwZWckY3VyclBvcyk7XG4gICAgICAgIH1cbiAgICAgICAgczIgPSBzMztcbiAgICAgICAgaWYgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgczMgPSBwZWckcGFyc2V3cygpO1xuICAgICAgICAgIGlmIChzMyAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gczA7XG4gICAgICAgICAgICBzMSA9IHBlZyRjMTI3KHMyKTtcbiAgICAgICAgICAgIHMwID0gczE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gczA7XG4gICAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2V3cygpIHtcbiAgICAgIHZhciBzMCwgczEsIHMyO1xuXG4gICAgICBwZWckc2lsZW50RmFpbHMrKztcbiAgICAgIHMwID0gcGVnJGN1cnJQb3M7XG4gICAgICBzMSA9IFtdO1xuICAgICAgaWYgKHBlZyRjMTI5LnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgczIgPSBpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpO1xuICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgczIgPSBwZWckRkFJTEVEO1xuICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTMwKTsgfVxuICAgICAgfVxuICAgICAgd2hpbGUgKHMyICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgIHMxLnB1c2goczIpO1xuICAgICAgICBpZiAocGVnJGMxMjkudGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgIHMyID0gaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICBwZWckY3VyclBvcysrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHMyID0gcGVnJEZBSUxFRDtcbiAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7IHBlZyRmYWlsKHBlZyRjMTMwKTsgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoczEgIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgczEgPSBpbnB1dC5zdWJzdHJpbmcoczAsIHBlZyRjdXJyUG9zKTtcbiAgICAgIH1cbiAgICAgIHMwID0gczE7XG4gICAgICBwZWckc2lsZW50RmFpbHMtLTtcbiAgICAgIGlmIChzMCA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBzMSA9IHBlZyRGQUlMRUQ7XG4gICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHsgcGVnJGZhaWwocGVnJGMxMjgpOyB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2Vlc2NhcGUoKSB7XG4gICAgICB2YXIgczAsIHMxLCBzMjtcblxuICAgICAgczAgPSBwZWckY3VyclBvcztcbiAgICAgIGlmIChpbnB1dC5jaGFyQ29kZUF0KHBlZyRjdXJyUG9zKSA9PT0gOTIpIHtcbiAgICAgICAgczEgPSBwZWckYzEzMTtcbiAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHMxID0gcGVnJEZBSUxFRDtcbiAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEzMik7IH1cbiAgICAgIH1cbiAgICAgIGlmIChzMSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICBpZiAoaW5wdXQubGVuZ3RoID4gcGVnJGN1cnJQb3MpIHtcbiAgICAgICAgICBzMiA9IGlucHV0LmNoYXJBdChwZWckY3VyclBvcyk7XG4gICAgICAgICAgcGVnJGN1cnJQb3MrKztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzMiA9IHBlZyRGQUlMRUQ7XG4gICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkgeyBwZWckZmFpbChwZWckYzEzKTsgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChzMiAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHMwO1xuICAgICAgICAgIHMxID0gcGVnJGMxMzMoczIpO1xuICAgICAgICAgIHMwID0gczE7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgICBzMCA9IHBlZyRjMztcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcGVnJGN1cnJQb3MgPSBzMDtcbiAgICAgICAgczAgPSBwZWckYzM7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzMDtcbiAgICB9XG5cblxuICAgIFx0dmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcbiAgICBcdFx0Tk9ERV9UWVBFID0gcmVxdWlyZShcIi4vdHlwZXNcIiksXG4gICAgXHRcdE11c3RhY2hlID0gcmVxdWlyZShcIi4vXCIpO1xuXG4gICAgXHRvcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zIHx8IHt9LCB7XG4gICAgXHRcdHN0cmljdDogdHJ1ZVxuICAgIFx0fSk7XG5cblxuICAgIHBlZyRyZXN1bHQgPSBwZWckc3RhcnRSdWxlRnVuY3Rpb24oKTtcblxuICAgIGlmIChwZWckcmVzdWx0ICE9PSBwZWckRkFJTEVEICYmIHBlZyRjdXJyUG9zID09PSBpbnB1dC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBwZWckcmVzdWx0O1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAocGVnJHJlc3VsdCAhPT0gcGVnJEZBSUxFRCAmJiBwZWckY3VyclBvcyA8IGlucHV0Lmxlbmd0aCkge1xuICAgICAgICBwZWckZmFpbCh7IHR5cGU6IFwiZW5kXCIsIGRlc2NyaXB0aW9uOiBcImVuZCBvZiBpbnB1dFwiIH0pO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24obnVsbCwgcGVnJG1heEZhaWxFeHBlY3RlZCwgcGVnJG1heEZhaWxQb3MpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgU3ludGF4RXJyb3I6IFN5bnRheEVycm9yLFxuICAgIHBhcnNlOiAgICAgICBwYXJzZVxuICB9O1xufSkoKTsiLCJ2YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKSxcblx0XyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKSxcblx0cGFyc2UgPSByZXF1aXJlKFwiLi9tK3htbFwiKS5wYXJzZSxcblx0JHRyYWNrID0gcmVxdWlyZShcIi4vdHJhY2tcIikudHJhY2s7XG5cbnZhciBNb2RlbCA9XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIE1vZGVsKGRhdGEsIHBhcmVudCwgb3B0aW9ucykge1xuXHR0aGlzLnByb3hpZXMgPSBbXTtcblx0dGhpcy5fZGVwID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cdGlmIChNb2RlbC5pc01vZGVsKHBhcmVudCkpIHRoaXMucGFyZW50ID0gcGFyZW50O1xuXHR0aGlzLnNldChkYXRhLCBvcHRpb25zICYmIG9wdGlvbnMudHJhY2spO1xufVxuXG5Nb2RlbC5pc01vZGVsID0gZnVuY3Rpb24obykge1xuXHRyZXR1cm4gbyBpbnN0YW5jZW9mIE1vZGVsO1xufVxuXG5Nb2RlbC5leHRlbmQgPSB1dGlsLnN1YmNsYXNzO1xuXG5Nb2RlbC5fZGVmYXVsdFByb3hpZXMgPSBbIHtcblx0aXNMaXN0OiAgdHJ1ZSxcblx0bWF0Y2g6ICAgZnVuY3Rpb24oYXJyKSAgICB7IHJldHVybiBfLmlzQXJyYXkoYXJyKTsgfSxcblx0Z2V0OiAgICAgZnVuY3Rpb24oYXJyLCBrKSB7IHJldHVybiBrID09PSBcImxlbmd0aFwiID8gdGhpcy5sZW5ndGgoYXJyKSA6IGFycltrXTsgfSxcblx0bGVuZ3RoOiAgZnVuY3Rpb24oYXJyKSAgICB7IHZhciBsZW47IHJldHVybiB0eXBlb2YobGVuID0gYXJyLiRsZW5ndGgpID09PSBcIm51bWJlclwiID8gbGVuIDogYXJyLmxlbmd0aDsgfSxcblx0a2V5czogICAgZnVuY3Rpb24oYXJyKSAgICB7IHJldHVybiBfLnJhbmdlKHRoaXMubGVuZ3RoKGFycikpOyB9LFxuXHRpc0VtcHR5OiBmdW5jdGlvbihhcnIpICAgIHsgcmV0dXJuICEhdGhpcy5sZW5ndGgoYXJyKTsgfVxufSwge1xuXHRtYXRjaDogZnVuY3Rpb24oKSAgICAgeyByZXR1cm4gdHJ1ZTsgfSxcblx0Z2V0OiAgIGZ1bmN0aW9uKHQsIGspIHsgaWYgKHQgIT0gbnVsbCkgcmV0dXJuIHRba107IH1cbn0gXTtcblxuTW9kZWwuY2FsbFByb3h5TWV0aG9kID0gZnVuY3Rpb24ocHJveHksIHRhcmdldCwgbWV0aG9kLCBhcmdzLCBjdHgpIHtcblx0dmFyIGFyZ3MgPSBfLmlzQXJyYXkoYXJncykgPyBfLmNsb25lKGFyZ3MpIDogW107XG5cdGFyZ3MudW5zaGlmdChwcm94eSwgbWV0aG9kLCB0YXJnZXQpO1xuXHRhcmdzLnB1c2goY3R4KTtcblx0cmV0dXJuIHV0aWwucmVzdWx0LmFwcGx5KG51bGwsIGFyZ3MpO1xufVxuXG5fLmV4dGVuZChNb2RlbC5wcm90b3R5cGUsIHtcblxuXHQvLyBzZXRzIHRoZSBkYXRhIG9uIHRoZSBtb2RlbFxuXHRzZXQ6IGZ1bmN0aW9uKGRhdGEsIHRyYWNrKSB7XG5cdFx0aWYgKHRyYWNrICE9PSBmYWxzZSkgZGF0YSA9ICR0cmFjayhkYXRhLCB0cmFjayk7XG5cdFx0dGhpcy5kYXRhID0gZGF0YTtcblx0XHR0aGlzLl9kZXAuY2hhbmdlZCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGFuIGFycmF5IG9mIG1vZGVscyBpbiB0aGUgY3VycmVudCBzdGFjaywgd2l0aCB0aGUgcm9vdCBhcyB0aGUgZmlyc3Rcblx0Z2V0QWxsTW9kZWxzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbW9kZWxzID0gWyB0aGlzIF0sXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwucGFyZW50KSB7XG5cdFx0XHRtb2RlbHMudW5zaGlmdChtb2RlbCA9IG1vZGVsLnBhcmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsc1xuXHR9LFxuXG5cdC8vIGdldHMgdGhlIG1vZGVsIGluIHRoZSBzdGFjayBhdCB0aGUgaW5kZXhcblx0Ly8gbmVnYXRpdmUgdmFsdWVzIHN0YXJ0IGF0IHJvb3Rcblx0Z2V0TW9kZWxBdE9mZnNldDogZnVuY3Rpb24oaW5kZXgpIHtcblx0XHRpZiAoIV8uaXNOdW1iZXIoaW5kZXgpIHx8IGlzTmFOKGluZGV4KSkgaW5kZXggPSAwO1xuXHRcdGlmIChpbmRleCA8IDApIHJldHVybiB0aGlzLmdldEFsbE1vZGVscygpW35pbmRleF07XG5cblx0XHR2YXIgbW9kZWwgPSB0aGlzO1xuXHRcdFxuXHRcdHdoaWxlIChpbmRleCAmJiBtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0XHRpbmRleC0tO1xuXHRcdH1cblx0XHRcblx0XHRyZXR1cm4gbW9kZWw7XG5cdH0sXG5cblx0Ly8gZ2V0cyB0aGUgbGFzdCBtb2RlbCBpbiB0aGUgc3RhY2tcblx0Z2V0Um9vdE1vZGVsOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbW9kZWwgPSB0aGlzO1xuXHRcdHdoaWxlIChtb2RlbC5wYXJlbnQgIT0gbnVsbCkgbW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9LFxuXG5cdC8vIHJldHVybnMgdGhlIGZpcnN0IG1vZGVsIHdoaWNoIHBhc3NlcyB0aGUgZnVuY3Rpb25cblx0ZmluZE1vZGVsOiBmdW5jdGlvbihmbikge1xuXHRcdHZhciBpbmRleCA9IDAsXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGZuLmNhbGwodGhpcywgbW9kZWwsIGluZGV4KyspKSByZXR1cm4gbW9kZWw7XG5cdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gcmV0dXJucyB0aGUgdmFsdWUgYXQgcGF0aCwgYnV0IG9ubHkgbG9va3MgaW4gdGhlIGRhdGEgb24gdGhpcyBtb2RlbFxuXHRnZXRMb2NhbDogZnVuY3Rpb24ocGF0aCkge1xuXHRcdGlmICh0eXBlb2YgcGF0aCA9PT0gXCJzdHJpbmdcIikgcGF0aCA9IHBhcnNlKHBhdGgsIHsgc3RhcnRSdWxlOiBcInBhdGhcIiB9KTtcblx0XHRpZiAocGF0aCA9PSBudWxsKSBwYXRoID0geyBwYXJ0czogW10gfTtcblx0XHRpZiAoIV8uaXNPYmplY3QocGF0aCkpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgb3Igb2JqZWN0IGZvciBwYXRoLlwiKTtcblx0XHRcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0dGhpcy5fZGVwLmRlcGVuZCgpO1xuXG5cdFx0cmV0dXJuIF8ucmVkdWNlKHBhdGgucGFydHMsIGZ1bmN0aW9uKHRhcmdldCwgcGFydCkge1xuXHRcdFx0dGFyZ2V0ID0gc2VsZi5fZ2V0KHRhcmdldCwgcGFydC5rZXkpO1xuXG5cdFx0XHRfLmVhY2gocGFydC5jaGlsZHJlbiwgZnVuY3Rpb24oaykge1xuXHRcdFx0XHRpZiAoXy5pc09iamVjdChrKSkgayA9IHNlbGYuZ2V0KGspO1xuXHRcdFx0XHR0YXJnZXQgPSBzZWxmLl9nZXQodGFyZ2V0LCBrKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH0sIHRoaXMuZGF0YSk7XG5cdH0sXG5cblx0Ly8gcmV0cmlldmVzIHZhbHVlIHdpdGggcGF0aCBxdWVyeVxuXHRnZXQ6IGZ1bmN0aW9uKHBhdGhzKSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKHR5cGVvZiBwYXRocyA9PT0gXCJzdHJpbmdcIikgcGF0aHMgPSBwYXJzZShwYXRocywgeyBzdGFydFJ1bGU6IFwicGF0aFF1ZXJ5XCIgfSk7XG5cdFx0aWYgKCFfLmlzQXJyYXkocGF0aHMpKSBwYXRocyA9IHBhdGhzICE9IG51bGwgPyBbIHBhdGhzIF0gOiBbXTtcblx0XHRcblx0XHRpZiAoIXBhdGhzLmxlbmd0aCkge1xuXHRcdFx0dmFyIG1vZGVsID0gdGhpcy5maW5kTW9kZWwoZnVuY3Rpb24obSkgeyByZXR1cm4gIV8uaXNVbmRlZmluZWQobS5kYXRhKTsgfSk7XG5cdFx0XHRpZiAobW9kZWwgPT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0dmFyIHZhbCA9IG1vZGVsLmRhdGE7XG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHZhbCkpIHZhbCA9IHZhbC5jYWxsKHRoaXMsIG51bGwpO1xuXHRcdFx0cmV0dXJuIHZhbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gXy5yZWR1Y2UocGF0aHMsIGZ1bmN0aW9uKHJlc3VsdCwgcGF0aCwgaW5kZXgpIHtcblx0XHRcdHZhciBtb2RlbCA9IHNlbGYsXG5cdFx0XHRcdHNjb3BlID0gdHJ1ZSxcblx0XHRcdFx0dmFsO1xuXG5cdFx0XHRpZiAocGF0aC50eXBlID09PSBcInJvb3RcIikge1xuXHRcdFx0XHRtb2RlbCA9IHNlbGYuZ2V0Um9vdE1vZGVsKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGgudHlwZSA9PT0gXCJwYXJlbnRcIikge1xuXHRcdFx0XHRtb2RlbCA9IHNlbGYuZ2V0TW9kZWxBdE9mZnNldChwYXRoLmRpc3RhbmNlKTtcblx0XHRcdFx0c2NvcGUgPSBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAocGF0aC50eXBlID09PSBcImFsbFwiKSB7XG5cdFx0XHRcdHNjb3BlID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlbCA9PSBudWxsKSByZXR1cm47XG5cblx0XHRcdHdoaWxlIChfLmlzVW5kZWZpbmVkKHZhbCkgJiYgbW9kZWwgIT0gbnVsbCkge1xuXHRcdFx0XHR2YWwgPSBtb2RlbC5nZXRMb2NhbChwYXRoKTtcblx0XHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0XHRcdGlmIChzY29wZSkgYnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odmFsKSkge1xuXHRcdFx0XHR2YWwgPSB2YWwuY2FsbChzZWxmLCBpbmRleCA9PT0gMCA/IG51bGwgOiByZXN1bHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsO1xuXHRcdH0sIHZvaWQgMCk7XG5cdH0sXG5cblx0X2dldDogZnVuY3Rpb24odGFyZ2V0LCBrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5jYWxsUHJveHlNZXRob2QodGhpcy5nZXRQcm94eUJ5VmFsdWUodGFyZ2V0KSwgdGFyZ2V0LCBcImdldFwiLCBrZXkpO1xuXHR9LFxuXG5cdHByb3h5OiBmdW5jdGlvbihrZXkpIHtcblx0XHR2YXIgcHJveHkgPSB0aGlzLmdldFByb3h5QnlWYWx1ZSh0aGlzLmRhdGEpO1xuXHRcdGlmIChrZXkgPT0gbnVsbCkgcmV0dXJuIHByb3h5O1xuXHRcdHZhciBhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyk7XG5cdFx0YXJncy51bnNoaWZ0KHByb3h5LCB0aGlzLmRhdGEpO1xuXHRcdHJldHVybiB0aGlzLmNhbGxQcm94eU1ldGhvZC5hcHBseSh0aGlzLCBhcmdzKTtcblx0fSxcblxuXHRjYWxsUHJveHlNZXRob2Q6IGZ1bmN0aW9uKHByb3h5LCB0YXJnZXQsIG1ldGhvZCkge1xuXHRcdHJldHVybiBNb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHRhcmdldCwgbWV0aG9kLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDMpLCB0aGlzKTtcblx0fSxcblxuXHRnZXRBbGxQcm94aWVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgcHJveGllcyA9IFtdLFxuXHRcdFx0bW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKG1vZGVsICE9IG51bGwpIHtcblx0XHRcdHByb3hpZXMucHVzaC5hcHBseShwcm94aWVzLCBtb2RlbC5wcm94aWVzKTtcblx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm94aWVzO1xuXHR9LFxuXG5cdHJlZ2lzdGVyUHJveHk6IGZ1bmN0aW9uKHByb3h5KSB7XG5cdFx0aWYgKHR5cGVvZiBwcm94eSAhPT0gXCJvYmplY3RcIiB8fCBwcm94eSA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgb2JqZWN0IGZvciBwcm94eS5cIik7XG5cdFx0aWYgKHR5cGVvZiBwcm94eS5tYXRjaCAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJMYXllciBtaXNzaW5nIHJlcXVpcmVkIG1hdGNoIG1ldGhvZC5cIik7XG5cdFx0aWYgKHR5cGVvZiBwcm94eS5nZXQgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiTGF5ZXIgbWlzc2luZyByZXF1aXJlZCBnZXQgbWV0aG9kLlwiKTtcblx0XHR0aGlzLnByb3hpZXMudW5zaGlmdChwcm94eSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Z2V0UHJveHlCeVZhbHVlOiBmdW5jdGlvbih0YXJnZXQpIHtcblx0XHR2YXIgcHJveHk7XG5cdFx0XG5cdFx0Ly8gbG9vayBsb2NhbGx5IGZpcnN0XG5cdFx0cHJveHkgPSBfLmZpbmQodGhpcy5wcm94aWVzLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRyZXR1cm4gcC5tYXRjaCh0YXJnZXQpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gdGhlbiByZWN1cnNpdmVseSBjaGVjayB0aGUgcGFyZW50c1xuXHRcdGlmIChwcm94eSA9PSBudWxsICYmIHRoaXMucGFyZW50ICE9IG51bGwpIHtcblx0XHRcdHByb3h5ID0gdGhpcy5wYXJlbnQuZ2V0UHJveHlCeVZhbHVlKHRhcmdldCk7XG5cdFx0fVxuXG5cdFx0Ly8gb3RoZXJ3aXNlIGxvb2sgdGhyb3VnaCB0aGUgZGVmYXVsdHNcblx0XHRpZiAocHJveHkgPT0gbnVsbCkge1xuXHRcdFx0cHJveHkgPSBfLmZpbmQoTW9kZWwuX2RlZmF1bHRQcm94aWVzLCBmdW5jdGlvbihwKSB7XG5cdFx0XHRcdHJldHVybiBwLm1hdGNoKHRhcmdldCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcHJveHk7XG5cdH1cblxufSk7XG4iLCJ2YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKSxcblx0XyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHROT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKSxcblx0cGFyc2UgPSByZXF1aXJlKFwiLi9tK3htbFwiKS5wYXJzZSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIiksXG5cdFZpZXcgPSByZXF1aXJlKFwiLi92aWV3XCIpLFxuXHRNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXHRTZWN0aW9uID0gcmVxdWlyZShcIi4vc2VjdGlvblwiKSxcblx0JHRyYWNrID0gcmVxdWlyZShcIi4vdHJhY2tcIikudHJhY2ssXG5cdERPTVJhbmdlID0gcmVxdWlyZShcIi4vZG9tcmFuZ2VcIik7XG5cbnZhciBNdXN0YWNoZSA9XG5tb2R1bGUuZXhwb3J0cyA9IFZpZXcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblx0XHR0aGlzLl9wYXJ0aWFscyA9IHt9O1xuXHRcdHRoaXMuX2NvbXBvbmVudHMgPSB7fTtcblxuXHRcdC8vIGFkZCB0ZW1wbGF0ZVxuXHRcdHZhciB0ZW1wbGF0ZSA9IG9wdGlvbnMudGVtcGxhdGUgfHwgXy5yZXN1bHQodGhpcywgXCJ0ZW1wbGF0ZVwiKTtcblx0XHRpZiAodGVtcGxhdGUgIT0gbnVsbCkgdGhpcy5zZXRUZW1wbGF0ZSh0ZW1wbGF0ZSk7XG5cblx0XHQvLyBhZGQgZGVjb3JhdG9yc1xuXHRcdHRoaXMuZGVjb3JhdGUoXy5leHRlbmQoe30sIG9wdGlvbnMuZGVjb3JhdG9ycywgXy5yZXN1bHQodGhpcywgXCJkZWNvcmF0b3JzXCIpKSk7XG5cblx0XHQvLyBhZGQgcGFydGlhbHNcblx0XHR0aGlzLnNldFBhcnRpYWwoXy5leHRlbmQoe30sIG9wdGlvbnMucGFydGlhbHMsIF8ucmVzdWx0KHRoaXMsIFwicGFydGlhbHNcIikpKTtcblxuXHRcdC8vIGluaXRpYXRlIGxpa2UgYSBub3JtYWwgdmlld1xuXHRcdFZpZXcuY2FsbCh0aGlzLCBkYXRhLCBvcHRpb25zKTtcblx0fSxcblxuXHQvLyBwYXJzZXMgYW5kIHNldHMgdGhlIHJvb3QgdGVtcGxhdGVcblx0c2V0VGVtcGxhdGU6IGZ1bmN0aW9uKHRlbXBsYXRlKSB7XG5cdFx0aWYgKF8uaXNTdHJpbmcodGVtcGxhdGUpKSB0ZW1wbGF0ZSA9IHBhcnNlKHRlbXBsYXRlKTtcblxuXHRcdGlmICghXy5pc09iamVjdCh0ZW1wbGF0ZSkgfHwgdGVtcGxhdGUudHlwZSAhPT0gTk9ERV9UWVBFLlJPT1QpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG9yIHBhcnNlZCB0ZW1wbGF0ZS5cIik7XG5cblx0XHR0aGlzLl90ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGNyZWF0ZXMgYSBkZWNvcmF0b3Jcblx0ZGVjb3JhdGU6IGZ1bmN0aW9uKG5hbWUsIGZuLCBvcHRpb25zKSB7XG5cdFx0aWYgKHR5cGVvZiBuYW1lID09PSBcIm9iamVjdFwiICYmIGZuID09IG51bGwpIHtcblx0XHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihmbiwgbikge1xuXHRcdFx0XHRpZiAoXy5pc0FycmF5KGZuKSkgdGhpcy5kZWNvcmF0ZShuLCBmblswXSwgZm5bMV0pO1xuXHRcdFx0XHRlbHNlIHRoaXMuZGVjb3JhdGUobiwgZm4sIG9wdGlvbnMpO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIgfHwgbmFtZSA9PT0gXCJcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZm9yIGRlY29yYXRvciBuYW1lLlwiKTtcblx0XHRpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgZGVjb3JhdG9yLlwiKTtcblxuXHRcdGlmICh0aGlzLl9kZWNvcmF0b3JzID09IG51bGwpIHRoaXMuX2RlY29yYXRvcnMgPSB7fTtcblx0XHRpZiAodGhpcy5fZGVjb3JhdG9yc1tuYW1lXSA9PSBudWxsKSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdID0gW107XG5cdFx0dmFyIGRlY29yYXRvcnMgPSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdO1xuXG5cdFx0aWYgKCFfLmZpbmRXaGVyZShkZWNvcmF0b3JzLCB7IGNhbGxiYWNrOiBmbiB9KSkge1xuXHRcdFx0ZGVjb3JhdG9ycy5wdXNoKHtcblx0XHRcdFx0Y2FsbGJhY2s6IGZuLFxuXHRcdFx0XHRvcHRpb25zOiBvcHRpb25zIHx8IHt9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBmaW5kcyBhbGwgZGVjb3JhdG9ycywgbG9jYWxseSBhbmQgaW4gcGFyZW50XG5cdGZpbmREZWNvcmF0b3JzOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGRlY29yYXRvcnMgPSBbXSxcblx0XHRcdGMgPSB0aGlzO1xuXG5cblx0XHR3aGlsZSAoYyAhPSBudWxsKSB7XG5cdFx0XHRpZiAoYy5fZGVjb3JhdG9ycyAhPSBudWxsICYmIF8uaXNBcnJheShjLl9kZWNvcmF0b3JzW25hbWVdKSkge1xuXHRcdFx0XHRjLl9kZWNvcmF0b3JzW25hbWVdLmZvckVhY2goZnVuY3Rpb24oZCkge1xuXHRcdFx0XHRcdGlmICghXy5maW5kV2hlcmUoZGVjb3JhdG9ycywgeyBjYWxsYmFjazogZC5jYWxsYmFjayB9KSkge1xuXHRcdFx0XHRcdFx0ZGVjb3JhdG9ycy5wdXNoKF8uZXh0ZW5kKHsgY29udGV4dDogYyB9LCBkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YyA9IGMucGFyZW50UmFuZ2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlY29yYXRvcnM7XG5cdH0sXG5cblx0Ly8gcmVtb3ZlcyBhIGRlY29yYXRvclxuXHRzdG9wRGVjb3JhdGluZzogZnVuY3Rpb24obmFtZSwgZm4pIHtcblx0XHRpZiAodHlwZW9mIG5hbWUgPT09IFwiZnVuY3Rpb25cIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0XHRmbiA9IG5hbWU7XG5cdFx0XHRuYW1lID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZGVjb3JhdG9ycyA9PSBudWxsIHx8IChuYW1lID09IG51bGwgJiYgZm4gPT0gbnVsbCkpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRvcnMgPSB7fTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChmbiA9PSBudWxsKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fZGVjb3JhdG9yc1tuYW1lXTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChuYW1lID09IG51bGwpIHtcblx0XHRcdF8uZWFjaCh0aGlzLl9kZWNvcmF0b3JzLCBmdW5jdGlvbihkLCBuKSB7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRvcnNbbl0gPSBfLmZpbHRlcihkLCBmdW5jdGlvbihfZCkge1xuXHRcdFx0XHRcdHJldHVybiBfZC5jYWxsYmFjayAhPT0gZm47XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXG5cdFx0ZWxzZSB7XG5cdFx0XHR2YXIgZCA9IHRoaXMuX2RlY29yYXRvcnNbbmFtZV07XG5cdFx0XHR0aGlzLl9kZWNvcmF0b3JzW25hbWVdID0gXy5maWx0ZXIoZCwgZnVuY3Rpb24oX2QpIHtcblx0XHRcdFx0cmV0dXJuIF9kLmNhbGxiYWNrICE9PSBmbjtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIHNldHMgcGFydGlhbCBieSBuYW1lXG5cdHNldFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUsIHBhcnRpYWwpIHtcblx0XHRpZiAoXy5pc09iamVjdChuYW1lKSAmJiBwYXJ0aWFsID09IG51bGwpIHtcblx0XHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihwLCBuKSB7IHRoaXMuc2V0UGFydGlhbChuLCBwKTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAoIV8uaXNTdHJpbmcobmFtZSkgJiYgbmFtZSAhPT0gXCJcIilcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBub24tZW1wdHkgc3RyaW5nIGZvciBwYXJ0aWFsIG5hbWUuXCIpO1xuXG5cdFx0aWYgKF8uaXNTdHJpbmcocGFydGlhbCkpIHBhcnRpYWwgPSBwYXJzZShwYXJ0aWFsKTtcblx0XHRpZiAoXy5pc09iamVjdChwYXJ0aWFsKSAmJiBwYXJ0aWFsLnR5cGUgPT09IE5PREVfVFlQRS5ST09UKSBwYXJ0aWFsID0gTXVzdGFjaGUuZXh0ZW5kKHsgdGVtcGxhdGU6IHBhcnRpYWwgfSk7XG5cdFx0aWYgKHBhcnRpYWwgIT0gbnVsbCAmJiAhdXRpbC5pc1N1YkNsYXNzKFZpZXcsIHBhcnRpYWwpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyB0ZW1wbGF0ZSwgcGFyc2VkIHRlbXBsYXRlLCBWaWV3IHN1YmNsYXNzIG9yIGZ1bmN0aW9uIGZvciBwYXJ0aWFsLlwiKTtcblxuXHRcdGlmIChwYXJ0aWFsID09IG51bGwpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9wYXJ0aWFsc1tuYW1lXTtcblx0XHRcdHBhcnRpYWwgPSB2b2lkIDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3BhcnRpYWxzW25hbWVdID0gcGFydGlhbDtcblx0XHR9XG5cblx0XHR0aGlzLnRyaWdnZXIoXCJwYXJ0aWFsXCIsIG5hbWUsIHBhcnRpYWwpO1xuXHRcdHRoaXMudHJpZ2dlcihcInBhcnRpYWw6XCIgKyBuYW1lLCBwYXJ0aWFsKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGxvb2tzIHRocm91Z2ggcGFyZW50cyBmb3IgcGFydGlhbFxuXHRmaW5kUGFydGlhbDogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBjID0gdGhpcztcblxuXHRcdHdoaWxlIChjICE9IG51bGwpIHtcblx0XHRcdGlmIChjLl9wYXJ0aWFscyAhPSBudWxsICYmIGMuX3BhcnRpYWxzW25hbWVdICE9IG51bGwpIHJldHVybiBjLl9wYXJ0aWFsc1tuYW1lXTtcblx0XHRcdGMgPSBjLnBhcmVudFJhbmdlO1xuXHRcdH1cblx0fSxcblxuXHQvLyByZXR1cm5zIGZpcnN0IHJlbmRlcmVkIHBhcnRpYWwgYnkgbmFtZVxuXHRnZXRDb21wb25lbnQ6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgY29tcHMsIGNvbXAsIHJlcywgbiwgaTtcblxuXHRcdGNvbXBzID0gdGhpcy5fY29tcG9uZW50cztcblx0XHRpZiAoY29tcHNbbmFtZV0gIT0gbnVsbCAmJiBjb21wc1tuYW1lXS5sZW5ndGgpIHJldHVybiBjb21wc1tuYW1lXVswXTtcblxuXHRcdGZvciAobiBpbiBjb21wcykge1xuXHRcdFx0Zm9yIChpIGluIGNvbXBzW25dKSB7XG5cdFx0XHRcdGNvbXAgPSBjb21wc1tuXVtpXVxuXHRcdFx0XHRpZiAoIShjb21wIGluc3RhbmNlb2YgTXVzdGFjaGUpKSBjb250aW51ZTtcblx0XHRcdFx0cmVzID0gY29tcC5nZXRDb21wb25lbnQobmFtZSk7XG5cdFx0XHRcdGlmIChyZXMgIT0gbnVsbCkgcmV0dXJuIHJlcztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHQvLyByZXR1cm5zIGFsbCByZW5kZXJlZCBwYXJ0aWFscyBieSBuYW1lXG5cdGdldENvbXBvbmVudHM6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gXy5yZWR1Y2UodGhpcy5fY29tcG9uZW50cywgZnVuY3Rpb24obSwgY29tcHMsIG4pIHtcblx0XHRcdGlmIChuID09PSBuYW1lKSBtLnB1c2guYXBwbHkobSwgY29tcHMpO1xuXHRcdFx0XG5cdFx0XHRjb21wcy5mb3JFYWNoKGZ1bmN0aW9uKGMpIHtcblx0XHRcdFx0aWYgKGMgaW5zdGFuY2VvZiBNdXN0YWNoZSkgbS5wdXNoLmFwcGx5KG0sIGMuZ2V0Q29tcG9uZW50cyhuYW1lKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIG07XG5cdFx0fSwgW10pO1xuXHR9LFxuXG5cdC8vIHRoZSBtYWluIHJlbmRlciBmdW5jdGlvbiBjYWxsZWQgYnkgbW91bnRcblx0cmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5fdGVtcGxhdGUgPT0gbnVsbClcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGEgdGVtcGxhdGUgdG8gYmUgc2V0IGJlZm9yZSByZW5kZXJpbmcuXCIpO1xuXG5cdFx0dmFyIHRvTW91bnQ7XG5cdFx0dGhpcy5zZXRNZW1iZXJzKHRoaXMucmVuZGVyVGVtcGxhdGUodGhpcy5fdGVtcGxhdGUsIG51bGwsIHRvTW91bnQgPSBbXSkpO1xuXHRcdF8uaW52b2tlKHRvTW91bnQsIFwibW91bnRcIik7XG5cdH0sXG5cblx0Ly8gY29udmVydHMgYSB0ZW1wbGF0ZSBpbnRvIGFuIGFycmF5IG9mIGVsZW1lbnRzIGFuZCBET01SYW5nZXNcblx0cmVuZGVyVGVtcGxhdGU6IGZ1bmN0aW9uKHRlbXBsYXRlLCB2aWV3LCB0b01vdW50KSB7XG5cdFx0aWYgKHZpZXcgPT0gbnVsbCkgdmlldyA9IHRoaXM7XG5cdFx0aWYgKHRvTW91bnQgPT0gbnVsbCkgdG9Nb3VudCA9IFtdO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmIChfLmlzQXJyYXkodGVtcGxhdGUpKSByZXR1cm4gdGVtcGxhdGUucmVkdWNlKGZ1bmN0aW9uKHIsIHQpIHtcblx0XHRcdHZhciBiID0gc2VsZi5yZW5kZXJUZW1wbGF0ZSh0LCB2aWV3LCB0b01vdW50KTtcblx0XHRcdGlmIChfLmlzQXJyYXkoYikpIHIucHVzaC5hcHBseShyLCBiKTtcblx0XHRcdGVsc2UgaWYgKGIgIT0gbnVsbCkgci5wdXNoKGIpO1xuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fSwgW10pO1xuXG5cdFx0c3dpdGNoKHRlbXBsYXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgTk9ERV9UWVBFLlJPT1Q6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB2aWV3LCB0b01vdW50KTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuRUxFTUVOVDpcblx0XHRcdFx0dmFyIHBhcnQgPSB0aGlzLnJlbmRlclBhcnRpYWwodGVtcGxhdGUubmFtZSwgdmlldyk7XG5cdFx0XHRcdHZhciBvYmo7XG5cblx0XHRcdFx0aWYgKHBhcnQgIT0gbnVsbCkge1xuXHRcdFx0XHRcdHBhcnQuYWRkRGF0YShvYmogPSAkdHJhY2soe30pKTtcblxuXHRcdFx0XHRcdHRlbXBsYXRlLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG5cdFx0XHRcdFx0XHRzZWxmLmF1dG9ydW4oZnVuY3Rpb24oYykge1xuXHRcdFx0XHRcdFx0XHR2YXIgdmFsID0gdGhpcy5yZW5kZXJBcmd1bWVudHMoYXR0ci5hcmd1bWVudHMsIHZpZXcpO1xuXHRcdFx0XHRcdFx0XHRpZiAodmFsLmxlbmd0aCA9PT0gMSkgdmFsID0gdmFsWzBdO1xuXHRcdFx0XHRcdFx0XHRlbHNlIGlmICghdmFsLmxlbmd0aCkgdmFsID0gdm9pZCAwO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChjLmZpcnN0UnVuKSBvYmouZGVmaW5lUHJvcGVydHkoYXR0ci5uYW1lLCB2YWwpO1xuXHRcdFx0XHRcdFx0XHRlbHNlIG9ialthdHRyLm5hbWVdID0gdmFsO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR0b01vdW50LnB1c2gocGFydCk7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRlbXBsYXRlLm5hbWUpO1xuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdHRlbXBsYXRlLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5yZW5kZXJEZWNvcmF0aW9ucyhlbCwgYXR0ciwgdmlldykpIHJldHVybjtcblx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoYXR0ci5uYW1lLCB0aGlzLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcoYXR0ci5jaGlsZHJlbiwgdmlldykpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0XHR2YXIgY2hpbGRyZW4gPSB0aGlzLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB2aWV3LCB0b01vdW50KSxcblx0XHRcdFx0XHRcdGNoaWxkLCBpO1xuXG5cdFx0XHRcdFx0Zm9yIChpIGluIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRjaGlsZCA9IGNoaWxkcmVuW2ldO1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0Y2hpbGQucGFyZW50UmFuZ2UgPSB2aWV3OyAvLyBmYWtlIHRoZSBwYXJlbnRcblx0XHRcdFx0XHRcdFx0Y2hpbGQuYXR0YWNoKGVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGVsLmFwcGVuZENoaWxkKGNoaWxkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0cmV0dXJuIGVsO1xuXHRcdFx0XHR9XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRFWFQ6XG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh1dGlsLmRlY29kZUVudGl0aWVzKHRlbXBsYXRlLnZhbHVlKSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLkhUTUw6XG5cdFx0XHRcdHJldHVybiBuZXcgRE9NUmFuZ2UodXRpbC5wYXJzZUhUTUwodGVtcGxhdGUudmFsdWUpKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuWENPTU1FTlQ6XG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVDb21tZW50KHRlbXBsYXRlLnZhbHVlKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5URVJQT0xBVE9SOlxuXHRcdFx0XHR2YXIgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiXCIpO1xuXHRcdFx0XHRcblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHZhciB2YWwgPSB2aWV3LmdldCh0ZW1wbGF0ZS52YWx1ZSk7XG5cdFx0XHRcdFx0bm9kZS5ub2RlVmFsdWUgPSB0eXBlb2YgdmFsID09PSBcInN0cmluZ1wiID8gdmFsIDogdmFsICE9IG51bGwgPyB2YWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBub2RlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5UUklQTEU6XG5cdFx0XHRcdHZhciByYW5nZSA9IG5ldyBET01SYW5nZSgpO1xuXHRcdFx0XHRcblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHJhbmdlLnNldE1lbWJlcnModXRpbC5wYXJzZUhUTUwodmlldy5nZXQodGVtcGxhdGUudmFsdWUpKSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiByYW5nZTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5WRVJURUQ6XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5TRUNUSU9OOlxuXHRcdFx0XHR2YXIgc2VjdGlvbiA9IG5ldyBTZWN0aW9uKHZpZXcubW9kZWwpXG5cdFx0XHRcdFx0LmludmVydCh0ZW1wbGF0ZS50eXBlID09PSBOT0RFX1RZUEUuSU5WRVJURUQpXG5cdFx0XHRcdFx0LnNldFBhdGgodGVtcGxhdGUudmFsdWUpXG5cdFx0XHRcdFx0Lm9uUm93KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0dmFyIF90b01vdW50O1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRNZW1iZXJzKHNlbGYucmVuZGVyVGVtcGxhdGUodGVtcGxhdGUuY2hpbGRyZW4sIHRoaXMsIF90b01vdW50ID0gW10pKTtcblx0XHRcdFx0XHRcdF8uaW52b2tlKF90b01vdW50LCBcIm1vdW50XCIpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRvTW91bnQucHVzaChzZWN0aW9uKTtcblx0XHRcdFx0cmV0dXJuIHNlY3Rpb247XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlBBUlRJQUw6XG5cdFx0XHRcdHZhciBwYXJ0aWFsID0gdGhpcy5yZW5kZXJQYXJ0aWFsKHRlbXBsYXRlLnZhbHVlLCB2aWV3KTtcblx0XHRcdFx0aWYgKHBhcnRpYWwpIHRvTW91bnQucHVzaChwYXJ0aWFsKTtcblx0XHRcdFx0cmV0dXJuIHBhcnRpYWw7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIGNvbnZlcnRzIGEgdGVtcGxhdGUgaW50byBhIHN0cmluZ1xuXHRyZW5kZXJUZW1wbGF0ZUFzU3RyaW5nOiBmdW5jdGlvbih0ZW1wbGF0ZSwgY3R4KSB7XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKF8uaXNBcnJheSh0ZW1wbGF0ZSkpIHJldHVybiB0ZW1wbGF0ZS5tYXAoZnVuY3Rpb24odCkge1xuXHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0LCBjdHgpO1xuXHRcdH0pLmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9IG51bGw7IH0pLmpvaW4oXCJcIik7XG5cblx0XHRzd2l0Y2godGVtcGxhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuUk9PVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0ZW1wbGF0ZS5jaGlsZHJlbiwgY3R4KTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVEVYVDpcblx0XHRcdFx0cmV0dXJuIHRlbXBsYXRlLnZhbHVlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlRFUlBPTEFUT1I6XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5UUklQTEU6XG5cdFx0XHRcdHZhciB2YWwgPSBjdHguZ2V0KHRlbXBsYXRlLnZhbHVlKTtcblx0XHRcdFx0cmV0dXJuIHZhbCAhPSBudWxsID8gdmFsLnRvU3RyaW5nKCkgOiBcIlwiO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5TRUNUSU9OOlxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5WRVJURUQ6XG5cdFx0XHRcdHZhciBpbnZlcnRlZCwgbW9kZWwsIHZhbCwgaXNFbXB0eSwgbWFrZVJvdywgcHJveHksIGlzTGlzdDtcblxuXHRcdFx0XHRpbnZlcnRlZCA9IHRlbXBsYXRlLnR5cGUgPT09IE5PREVfVFlQRS5JTlZFUlRFRDtcblx0XHRcdFx0dmFsID0gY3R4LmdldCh0ZW1wbGF0ZS52YWx1ZSk7XG5cdFx0XHRcdG1vZGVsID0gbmV3IE1vZGVsKHZhbCwgY3R4KTtcblx0XHRcdFx0cHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUodmFsKTtcblx0XHRcdFx0aXNMaXN0ID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiaXNMaXN0XCIpO1xuXHRcdFx0XHRpc0VtcHR5ID0gU2VjdGlvbi5pc0VtcHR5KG1vZGVsLCBwcm94eSk7XG5cdFx0XHRcdFxuXHRcdFx0XHRtYWtlUm93ID0gZnVuY3Rpb24oaSkge1xuXHRcdFx0XHRcdHZhciByb3csIGRhdGE7XG5cblx0XHRcdFx0XHRpZiAoaSA9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRkYXRhID0gbW9kZWw7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGRhdGEgPSBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJnZXRcIiwgaSk7XG5cdFx0XHRcdFx0XHRkYXRhID0gbmV3IE1vZGVsKGRhdGEsIG5ldyBNb2RlbCh7ICRrZXk6IGkgfSwgY3R4KSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0ZW1wbGF0ZS5jaGlsZHJlbiwgZGF0YSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIShpc0VtcHR5IF4gaW52ZXJ0ZWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGlzTGlzdCAmJiAhaW52ZXJ0ZWQgP1xuXHRcdFx0XHRcdFx0bW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwia2V5c1wiKS5tYXAobWFrZVJvdykuam9pbihcIlwiKSA6XG5cdFx0XHRcdFx0XHRtYWtlUm93KCk7XG5cdFx0XHRcdH1cblx0XHR9XG5cdH0sXG5cblx0Ly8gY29udmVydHMgYW4gYXJndW1lbnQgdGVtcGxhdGUgaW50byBhbiBhcnJheSBvZiB2YWx1ZXNcblx0cmVuZGVyQXJndW1lbnRzOiBmdW5jdGlvbihhcmcsIGN0eCkge1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgVmlldykgY3R4ID0gY3R4Lm1vZGVsO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmIChfLmlzQXJyYXkoYXJnKSkgcmV0dXJuIGFyZy5tYXAoZnVuY3Rpb24oYSkge1xuXHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyQXJndW1lbnRzKGEsIGN0eCk7XG5cdFx0fSkuZmlsdGVyKGZ1bmN0aW9uKGIpIHsgcmV0dXJuIGIgIT0gbnVsbDsgfSk7XG5cblx0XHRzd2l0Y2goYXJnLnR5cGUpIHtcblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVEVSUE9MQVRPUjpcblx0XHRcdFx0cmV0dXJuIGN0eC5nZXQoYXJnLnZhbHVlKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuTElURVJBTDpcblx0XHRcdFx0cmV0dXJuIGFyZy52YWx1ZTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gZ2VuZXJhdGVzIGEgbmV3IGNvbXBvbmVudCBmcm9tIGEgVmlldyBzdWJjbGFzcyBvciBwYXJ0aWFsJ3MgbmFtZVxuXHRyZW5kZXJQYXJ0aWFsOiBmdW5jdGlvbihrbGFzcywgY3R4LCBvcHRpb25zKSB7XG5cdFx0dmFyIGNvbXBzLCBuYW1lO1xuXG5cdFx0Ly8gbG9vayB1cCB0aGUgcGFydGlhbCBieSBuYW1lXG5cdFx0aWYgKHR5cGVvZiBrbGFzcyA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0bmFtZSA9IGtsYXNzO1xuXHRcdFx0a2xhc3MgPSB0aGlzLmZpbmRQYXJ0aWFsKGtsYXNzKTtcblx0XHR9XG5cblx0XHQvLyBjbGFzcyBtdXN0IGJlIGEgdmlld1xuXHRcdGlmICghdXRpbC5pc1N1YkNsYXNzKFZpZXcsIGtsYXNzKSkgcmV0dXJuIG51bGw7XG5cdFx0XG5cdFx0Ly8gbm9ybWFsaXplIGNvbnRleHRcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblxuXHRcdC8vIGNyZWF0ZSBpdCBub24tcmVhY3RpdmVseVxuXHRcdHZhciBjb21wb25lbnQgPSBUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gbmV3IGtsYXNzKGN0eCwgb3B0aW9ucyk7XG5cdFx0fSk7XG5cblx0XHQvLyBhZGQgaXQgdG8gdGhlIGxpc3Rcblx0XHRpZiAobmFtZSkge1xuXHRcdFx0Y29tcHMgPSB0aGlzLl9jb21wb25lbnRzO1xuXHRcdFx0aWYgKGNvbXBzW25hbWVdID09IG51bGwpIGNvbXBzW25hbWVdID0gW107XG5cdFx0XHRjb21wc1tuYW1lXS5wdXNoKGNvbXBvbmVudCk7XG5cblx0XHRcdC8vIGF1dG8gcmVtb3ZlIHdoZW4gdGhlIHBhcnRpYWwgaXMgXCJzdG9wcGVkXCJcblx0XHRcdGNvbXBvbmVudC5vbmNlKFwic3RvcFwiLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0Y29tcHNbbmFtZV0gPSBfLndpdGhvdXQoY29tcHNbbmFtZV0sIGNvbXBvbmVudCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcG9uZW50O1xuXHR9LFxuXG5cdC8vIHJlbmRlcnMgZGVjb3JhdGlvbnMgb24gYW4gZWxlbWVudCBieSB0ZW1wbGF0ZVxuXHRyZW5kZXJEZWNvcmF0aW9uczogZnVuY3Rpb24oZWwsIGF0dHIsIGN0eCkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdC8vIGxvb2sgdXAgZGVjb3JhdG9yIGJ5IG5hbWVcblx0XHR2YXIgZGVjb3JhdG9ycyA9IHRoaXMuZmluZERlY29yYXRvcnMoYXR0ci5uYW1lKTtcblx0XHRpZiAoIWRlY29yYXRvcnMubGVuZ3RoKSByZXR1cm47XG5cblx0XHQvLyBub3JtYWxpemUgdGhlIGNvbnRleHRcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblxuXHRcdC8vIGEgd3JhcHBlciBjb21wdXRhdGlvbiB0byBlei1jbGVhbiB0aGUgcmVzdFxuXHRcdHJldHVybiB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRkZWNvcmF0b3JzLmZvckVhY2goZnVuY3Rpb24oZCkge1xuXHRcdFx0XHRzZWxmLmF1dG9ydW4oZnVuY3Rpb24oY29tcCkge1xuXHRcdFx0XHRcdC8vIGFzc2VtYmxlIHRoZSBhcmd1bWVudHMhXG5cdFx0XHRcdFx0dmFyIGFyZ3MgPSBbIHtcblx0XHRcdFx0XHRcdHRhcmdldDogZWwsXG5cdFx0XHRcdFx0XHRtb2RlbDogY3R4LFxuXHRcdFx0XHRcdFx0dmlldzogc2VsZixcblx0XHRcdFx0XHRcdHRlbXBsYXRlOiBhdHRyLFxuXHRcdFx0XHRcdFx0Y29tcDogY29tcCxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IGQub3B0aW9uc1xuXHRcdFx0XHRcdH0gXTtcblxuXHRcdFx0XHRcdC8vIHJlbmRlciBhcmd1bWVudHMgYmFzZWQgb24gb3B0aW9uc1xuXHRcdFx0XHRcdGlmIChkLm9wdGlvbnMgJiYgZC5vcHRpb25zLnBhcnNlID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRcdFx0XHRhcmdzLnB1c2goc2VsZi5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKGF0dHIuY2hpbGRyZW4sIGN0eCkpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZC5vcHRpb25zID09IG51bGwgfHwgZC5vcHRpb25zLnBhcnNlICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0YXJncyA9IGFyZ3MuY29uY2F0KHNlbGYucmVuZGVyQXJndW1lbnRzKGF0dHIuYXJndW1lbnRzLCBjdHgpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBleGVjdXRlIHRoZSBjYWxsYmFja1xuXHRcdFx0XHRcdGQuY2FsbGJhY2suYXBwbHkoZC5jb250ZXh0IHx8IHNlbGYsIGFyZ3MpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cbn0sIHtcblxuXHRyZW5kZXI6IGZ1bmN0aW9uKHRlbXBsYXRlLCBkYXRhLCBvcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zIHx8IHt9LCB7XG5cdFx0XHR0ZW1wbGF0ZTogdGVtcGxhdGVcblx0XHR9KTtcblxuXHRcdHJldHVybiBuZXcgTXVzdGFjaGUoZGF0YSB8fCBudWxsLCBvcHRpb25zKTtcblx0fVxuXG59KTtcbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdE11c3RhY2hlID0gcmVxdWlyZShcIi4uL1wiKTtcblxuLy8gdGhlIHBsdWdpblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcblx0dGhpcy5hZGRBY3Rpb24gPSBhZGRBY3Rpb247XG5cdHRoaXMuYWRkQWN0aW9uT25jZSA9IGFkZEFjdGlvbk9uY2U7XG5cdHRoaXMucmVtb3ZlQWN0aW9uID0gcmVtb3ZlQWN0aW9uO1xuXHR0aGlzLmZpcmVBY3Rpb24gPSBmaXJlQWN0aW9uO1xuXHR0aGlzLmRlY29yYXRlKGRlY29yYXRvcnMpO1xuXG5cdHZhciBpbml0QWN0aW9ucyA9IF8ucmVzdWx0KHRoaXMsIFwiYWN0aW9uc1wiKTtcblx0aWYgKGluaXRBY3Rpb25zICE9IG51bGwpIHRoaXMuYWRkQWN0aW9uKGluaXRBY3Rpb25zKTtcbn1cblxuLy8gZ2VuZXJhdGUgZGVjb3JhdG9yc1xudmFyIGV2ZW50TmFtZXMgPSBbXG5cdCdjaGFuZ2UnLCAnY2xpY2snLCAnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLFxuXHQnbW91c2VlbnRlcicsICdtb3VzZWxlYXZlJywgJ3Njcm9sbCcsICdibHVyJywgJ2ZvY3VzJyxcblx0J2lucHV0JywgJ3N1Ym1pdCcsICdyZXNldCcsICdrZXlkb3duJywgJ2tleXByZXNzJywgJ2tleXVwJyxcblx0J2RyYWcnLCAnZHJhZ2Ryb3AnLCAnZHJhZ2VuZCcsICdkcmFnZW50ZXInLCAnZHJhZ2V4aXQnLFxuXHQnZHJhZ2xlYXZlJywgJ2RyYWdvdmVyJywgJ2RyYWdzdGFydCcsICdkcm9wJ1xuXTtcblxudmFyIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xudmFyIGRlY29yYXRvcnMgPSB7fTtcblxuZXZlbnROYW1lcy5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XG5cdGRlY29yYXRvcnNbXCJvbi1cIiArIGV2ZW50XSA9IGZ1bmN0aW9uKGRlY29yLCBrZXkpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXMsXG5cdFx0XHRhcmdzLCBub2RlO1xuXG5cdFx0ZnVuY3Rpb24gbGlzdGVuZXIoZSkge1xuXHRcdFx0Ly8gY3JlYXRlIGEgbmV3IGFjdGlvbiBvYmplY3Rcblx0XHRcdHZhciBhY3Rpb24gPSBuZXcgQWN0aW9uKGtleSk7XG5cdFx0XHRhY3Rpb24ub3JpZ2luYWwgPSBlO1xuXHRcdFx0YWN0aW9uLnRhcmdldCA9IGFjdGlvbi5ub2RlID0gbm9kZTtcblx0XHRcdGFjdGlvbi5jb250ZXh0ID0gYWN0aW9uLm1vZGVsID0gZGVjb3IubW9kZWw7XG5cdFx0XHRhY3Rpb24udmlldyA9IGRlY29yLnZpZXc7XG5cblx0XHRcdC8vIGZpbmQgdGhlIGZpcnN0IHBhcmVudCB3aXRoIHRoZSBmaXJlIG1ldGhvZFxuXHRcdFx0dmFyIGZpcmVPbiA9IHNlbGY7XG5cdFx0XHR3aGlsZSAodHlwZW9mIGZpcmVPbi5maXJlQWN0aW9uICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0Ly8gaWYgaXQgaGFzIG5vIHBhcmVudCwgd2UgY2FuJ3QgZG8gYW55dGhpbmdcblx0XHRcdFx0aWYgKGZpcmVPbi5wYXJlbnQgPT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0XHRmaXJlT24gPSBmaXJlT24ucGFyZW50O1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBmaXJlIHRoZSBhY3Rpb25cblx0XHRcdGZpcmVPbi5maXJlQWN0aW9uLmFwcGx5KGZpcmVPbiwgWyBhY3Rpb24gXS5jb25jYXQoYXJncykpO1xuXHRcdH1cblxuXHRcdG5vZGUgPSBkZWNvci50YXJnZXQ7XG5cdFx0YXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDIpO1xuXHRcdG5vZGUuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXIpO1xuXG5cdFx0ZGVjb3IuY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGxpc3RlbmVyKTtcblx0XHR9KTtcblx0fVxufSk7XG5cbi8vIEFjdGlvbiBDbGFzc1xuZnVuY3Rpb24gQWN0aW9uKG5hbWUpIHtcblx0dGhpcy5uYW1lID0gbmFtZTtcbn1cblxuTXVzdGFjaGUuQWN0aW9uID0gQWN0aW9uO1xuXG5BY3Rpb24ucHJvdG90eXBlLmJ1YmJsZXMgPSB0cnVlO1xuXG5BY3Rpb24ucHJvdG90eXBlLnN0b3BQcm9wYWdhdGlvbiA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLmJ1YmJsZXMgPSBmYWxzZTtcblx0cmV0dXJuIHRoaXM7XG59XG5cbi8vIE1zdXRhY2hlIEluc3RhbmNlIE1ldGhvZHNcbmZ1bmN0aW9uIGFkZEFjdGlvbihuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgPT09IFwib2JqZWN0XCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihmbiwgbikgeyB0aGlzLmFkZEFjdGlvbihuLCBmbik7IH0sIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBuYW1lICE9PSBcInN0cmluZ1wiIHx8IG5hbWUgPT09IFwiXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBub24tZW1wdHkgc3RyaW5nIGZvciBhY3Rpb24gbmFtZS5cIik7XG5cdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciBhY3Rpb24uXCIpO1xuXG5cdGlmICh0aGlzLl9hY3Rpb25zID09IG51bGwpIHRoaXMuX2FjdGlvbnMgPSB7fTtcblx0aWYgKHRoaXMuX2FjdGlvbnNbbmFtZV0gPT0gbnVsbCkgdGhpcy5fYWN0aW9uc1tuYW1lXSA9IFtdO1xuXHRpZiAoIX50aGlzLl9hY3Rpb25zW25hbWVdLmluZGV4T2YoZm4pKSB0aGlzLl9hY3Rpb25zW25hbWVdLnB1c2goZm4pO1xuXHRcblx0cmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGFkZEFjdGlvbk9uY2UobmFtZSwgZm4pIHtcblx0aWYgKHR5cGVvZiBuYW1lID09PSBcIm9iamVjdFwiICYmIGZuID09IG51bGwpIHtcblx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24oZm4sIG4pIHsgdGhpcy5hZGRBY3Rpb25PbmNlKG4sIGZuKTsgfSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHR2YXIgb25BY3Rpb247XG5cblx0dGhpcy5hZGRBY3Rpb24obmFtZSwgb25BY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5yZW1vdmVBY3Rpb24obmFtZSwgb25BY3Rpb24pO1xuXHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH0pO1xuXG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiByZW1vdmVBY3Rpb24obmFtZSwgZm4pIHtcblx0aWYgKHR5cGVvZiBuYW1lID09PSBcImZ1bmN0aW9uXCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdGZuID0gbmFtZTtcblx0XHRuYW1lID0gbnVsbDtcblx0fVxuXG5cdGlmICh0aGlzLl9hY3Rpb25zID09IG51bGwgfHwgKG5hbWUgPT0gbnVsbCAmJiBmbiA9PSBudWxsKSkge1xuXHRcdHRoaXMuX2FjdGlvbnMgPSB7fTtcblx0fVxuXG5cdGVsc2UgaWYgKGZuID09IG51bGwpIHtcblx0XHRkZWxldGUgdGhpcy5fYWN0aW9uc1tuYW1lXTtcblx0fVxuXG5cdGVsc2UgaWYgKG5hbWUgPT0gbnVsbCkge1xuXHRcdF8uZWFjaCh0aGlzLl9hY3Rpb25zLCBmdW5jdGlvbihkLCBuKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb25zW25dID0gZC5maWx0ZXIoZnVuY3Rpb24oZikgeyByZXR1cm4gZiAhPT0gZm47IH0pO1xuXHRcdH0sIHRoaXMpO1xuXHR9XG5cblx0ZWxzZSBpZiAodGhpcy5fYWN0aW9uc1tuYW1lXSAhPSBudWxsKSB7XG5cdFx0dGhpcy5fYWN0aW9uc1tuYW1lXSA9IF8ud2l0aG91dCh0aGlzLl9hY3Rpb25zW25hbWVdLCBmbik7XG5cdH1cblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gZmlyZUFjdGlvbihhY3Rpb24pIHtcblx0aWYgKHR5cGVvZiBhY3Rpb24gPT09IFwic3RyaW5nXCIpIGFjdGlvbiA9IG5ldyBBY3Rpb24oYWN0aW9uKTtcblx0aWYgKF8uaXNPYmplY3QoYWN0aW9uKSAmJiAhKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbikpIGFjdGlvbiA9IF8uZXh0ZW5kKG5ldyBBY3Rpb24sIGFjdGlvbik7XG5cdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhY3Rpb24gbmFtZSwgb2JqZWN0IG9yIGluc3RhbmNlIG9mIEFjdGlvbi5cIik7XG5cdFxuXHR2YXIgbmFtZSA9IGFjdGlvbi5uYW1lLFxuXHRcdGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cblx0YXJncy51bnNoaWZ0KGFjdGlvbik7XG5cblx0aWYgKHRoaXMuX2FjdGlvbnMgIT0gbnVsbCAmJiBBcnJheS5pc0FycmF5KHRoaXMuX2FjdGlvbnNbbmFtZV0pKSB7XG5cdFx0dGhpcy5fYWN0aW9uc1tuYW1lXS5zb21lKGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRpZiAoIWFjdGlvbi5idWJibGVzKSByZXR1cm4gdHJ1ZTtcblx0XHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH0sIHRoaXMpO1xuXHR9XG5cblx0aWYgKGFjdGlvbi5idWJibGVzICYmIHRoaXMucGFyZW50ICE9IG51bGwpIHtcblx0XHQvLyBmaW5kIHRoZSBmaXJzdCBwYXJlbnQgd2l0aCB0aGUgZmlyZSBtZXRob2Rcblx0XHR2YXIgZmlyZU9uID0gdGhpcy5wYXJlbnQ7XG5cdFx0d2hpbGUgKHR5cGVvZiBmaXJlT24uZmlyZUFjdGlvbiAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHQvLyBpZiBpdCBoYXMgbm8gcGFyZW50LCB3ZSBjYW4ndCBkbyBhbnl0aGluZ1xuXHRcdFx0aWYgKGZpcmVPbi5wYXJlbnQgPT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0ZmlyZU9uID0gZmlyZU9uLnBhcmVudDtcblx0XHR9XG5cblx0XHRmaXJlT24uZmlyZUFjdGlvbi5hcHBseShmaXJlT24sIGFyZ3MpO1xuXHR9XG5cdFxuXHRyZXR1cm4gdGhpcztcbn0iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG52YXIgcGx1Z2lucyA9XG5leHBvcnRzLl9wbHVnaW5zID0ge307XG5cbmV4cG9ydHMubG9hZFBsdWdpbiA9IGZ1bmN0aW9uKHRwbCwgcGx1Z2luLCBhcmdzKSB7XG5cdGlmIChfLmlzU3RyaW5nKHBsdWdpbikpIHtcblx0XHRpZiAocGx1Z2luc1twbHVnaW5dID09IG51bGwpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJObyBwbHVnaW4gZXhpc3RzIHdpdGggaWQgJ1wiICsgcGx1Z2luICsgXCInLlwiKTtcblxuXHRcdHBsdWdpbiA9IHBsdWdpbnNbcGx1Z2luXTtcblx0fVxuXG5cdGlmICghXy5pc0Z1bmN0aW9uKHBsdWdpbikpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBvciBmdW5jdGlvbiBmb3IgcGx1Z2luXCIpO1xuXG5cdC8vIGNoZWNrIGlmIHBsdWdpbiBpcyBhbHJlYWR5IGxvYWRlZCBvbiB0aGlzIHRlbXBsYXRlXG5cdGlmICh0cGwuX2xvYWRlZF9wbHVnaW5zID09IG51bGwpIHRwbC5fbG9hZGVkX3BsdWdpbnMgPSBbXTtcblx0aWYgKH50cGwuX2xvYWRlZF9wbHVnaW5zLmluZGV4T2YocGx1Z2luKSkgcmV0dXJuIHRwbDtcblx0dHBsLl9sb2FkZWRfcGx1Z2lucy5wdXNoKHBsdWdpbik7XG5cblx0aWYgKGFyZ3MgPT0gbnVsbCkgYXJncyA9IFtdO1xuXHRpZiAoIV8uaXNBcnJheShhcmdzKSkgYXJncyA9IFsgYXJncyBdO1xuXG5cdHBsdWdpbi5hcHBseSh0cGwsIGFyZ3MpO1xuXHRyZXR1cm4gdHBsO1xufVxuXG52YXIgcmVnaXN0ZXJQbHVnaW4gPVxuZXhwb3J0cy5yZWdpc3RlclBsdWdpbiA9IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIikge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgbmFtZSBmb3IgcGx1Z2luLlwiKTtcblx0fVxuXG5cdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgcGx1Z2luLlwiKTtcblx0fVxuXG5cdGlmIChmbiA9PT0gcGx1Z2luc1tuYW1lXSkgcmV0dXJuO1xuXHRpZiAocGx1Z2luc1tuYW1lXSAhPSBudWxsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiUmVmdXNpbmcgdG8gb3ZlcndyaXRlIGV4aXN0aW5nIHBsdWdpbiBcXFwibmFtZVxcXCIuXCIpO1xuXHR9XG5cblx0cGx1Z2luc1tuYW1lXSA9IGZuO1xufVxuXG4vLyBsb2FkIGJ1aWx0IGluIHBsdWdpbnNcbnJlZ2lzdGVyUGx1Z2luKFwiYWN0aW9uc1wiLCByZXF1aXJlKFwiLi9hY3Rpb25zXCIpKTtcbnJlZ2lzdGVyUGx1Z2luKFwidHdvd2F5XCIsIHJlcXVpcmUoXCIuL3R3b3dheVwiKSk7IiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcblxudmFyIHZhbHVlX3R5cGVzID0gWyBcInJhZGlvXCIsIFwib3B0aW9uXCIgXTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdC8vIGFkZCBtZXRob2RzXG5cdHRoaXMuYWRkRm9ybUJpbmRpbmcgPSBhZGRGb3JtQmluZGluZztcblx0dGhpcy5nZXRGb3JtQmluZGluZyA9IGdldEZvcm1CaW5kaW5nO1xuXHR0aGlzLnJlbW92ZUZvcm1CaW5kaW5nID0gcmVtb3ZlRm9ybUJpbmRpbmc7XG5cblx0Ly8gYWRkIG1haW4gYmluZGluZyBkZWNvcmF0b3Jcblx0dGhpcy5kZWNvcmF0ZShcImJpbmQtdG9cIiwgZnVuY3Rpb24gYmluZFRvKGQsIGlkLCBsYXp5KSB7XG5cdFx0dmFyIGZiaW5kID0gdGhpcy5nZXRGb3JtQmluZGluZyhpZCk7XG5cdFx0aWYgKGZiaW5kID09IG51bGwpIHJldHVybjtcblxuXHRcdHZhciBlbCA9IGQudGFyZ2V0LFxuXHRcdFx0dHlwZSA9IGdldFR5cGUoZWwpLFxuXHRcdFx0c2VsZiA9IHRoaXMsXG5cdFx0XHRvbkNoYW5nZSwgbGF6eTtcblxuXHRcdC8vIGRldGVjdCBjaGFuZ2VzIHRvIHRoZSBpbnB1dCdzIHZhbHVlXG5cdFx0aWYgKHR5cGVvZiBmYmluZC5jaGFuZ2UgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0b25DaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdGZiaW5kLmNoYW5nZS5jYWxsKHNlbGYsIGdldE5vZGVWYWx1ZShlbCwgdHlwZSksIGQubW9kZWwsIGUpO1xuXHRcdFx0fTtcblxuXHRcdFx0ZWwuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBvbkNoYW5nZSk7XG5cdFx0XHRpZiAoIShvcHRpb25zLmxhenkgfHwgbGF6eSkpIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCBvbkNoYW5nZSk7XG5cblx0XHRcdGQuY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgb25DaGFuZ2UpO1xuXHRcdFx0XHRlbC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5dXBcIiwgb25DaGFuZ2UpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gcmVhY3RpdmVseSBzZXQgdGhlIHZhbHVlIG9uIHRoZSBpbnB1dFxuXHRcdHZhciBjID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0c2V0Tm9kZVZhbHVlKGVsLCBmYmluZC5nZXQuY2FsbChzZWxmLCBkLm1vZGVsKSwgdHlwZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBzZXROb2RlVmFsdWUgcmVsaWVzIG9uIHRoZSBjaGlsZHJlbiBlbGVtZW50c1xuXHRcdC8vIHRob3NlIHdvbid0IGJlIGluIHRoZSBET00gdGlsbCBhdCBsZWFzdCB0aGUgbmV4dCB0aWNrXG5cdFx0Yy5pbnZhbGlkYXRlKCk7XG5cdH0pO1xuXG5cdC8vIGFkZCB2YWx1ZSBkZWNvcmF0b3IgZm9yIHJhZGlvcyBhbmQgb3B0aW9uc1xuXHR0aGlzLmRlY29yYXRlKFwidmFsdWVcIiwgZnVuY3Rpb24gdmFsdWVPZihkLCBzdHJ2YWwpIHtcblx0XHR2YXIgZWwgPSBkLnRhcmdldCxcblx0XHRcdHR5cGUgPSBnZXRUeXBlKGVsKSxcblx0XHRcdHNlbGYgPSB0aGlzO1xuXHRcdFxuXHRcdGlmICghXy5jb250YWlucyh2YWx1ZV90eXBlcywgdHlwZSkpIHtcblx0XHRcdGVsLnZhbHVlID0gc3RydmFsO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBhcmdzID0gdGhpcy5yZW5kZXJBcmd1bWVudHMoZC50ZW1wbGF0ZS5hcmd1bWVudHMsIGQubW9kZWwpO1xuXHRcdGVsLiRib3VuZF92YWx1ZSA9IGFyZ3MubGVuZ3RoIDw9IDEgPyBhcmdzWzBdIDogYXJncztcblx0XHRlbC52YWx1ZSA9IHN0cnZhbDtcblx0fSwgeyBwYXJzZTogXCJzdHJpbmdcIiB9KTtcblxuXHQvLyBhZGQgaW5pdGlhbCBmb3JtIGJpbmRpbmdzXG5cdHZhciBpbml0aWFsQmluZHMgPSBfLnJlc3VsdCh0aGlzLCBcInR3b3dheVwiKTtcblx0aWYgKF8uaXNPYmplY3QoaW5pdGlhbEJpbmRzKSkgdGhpcy5hZGRGb3JtQmluZGluZyhpbml0aWFsQmluZHMpO1xufVxuXG5mdW5jdGlvbiBhZGRGb3JtQmluZGluZyhpZCwgZ2V0dGVyLCBvbkNoYW5nZSkge1xuXHRpZiAoXy5pc09iamVjdChpZCkpIHtcblx0XHRfLmVhY2goaWQsIGZ1bmN0aW9uKHYsIGspIHtcblx0XHRcdGFkZEZvcm1CaW5kaW5nLmNhbGwodGhpcywgaywgdik7XG5cdFx0fSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRpZiAodHlwZW9mIGlkICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSBzdHJpbmcgZm9yIHRoZSBmb3JtIGJpbmRpbmcgSUQuXCIpO1xuXHRpZiAodGhpcy5fZm9ybUJpbmRpbmdzID09IG51bGwpIHRoaXMuX2Zvcm1CaW5kaW5ncyA9IHt9O1xuXHRpZiAodGhpcy5fZm9ybUJpbmRpbmdzW2lkXSAhPSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvcm0gYmluZGluZyB3aXRoIGlkICdcIiArIGlkICsgXCInIGFscmVhZHkgZXhpc3RzLlwiKTtcblxuXHRpZiAoXy5pc09iamVjdChnZXR0ZXIpICYmIG9uQ2hhbmdlID09IG51bGwpIHtcblx0XHRvbkNoYW5nZSA9IGdldHRlci5jaGFuZ2U7XG5cdFx0Z2V0dGVyID0gZ2V0dGVyLmdldDtcblx0fVxuXG5cdGlmICh0eXBlb2YgZ2V0dGVyICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIGZ1bmN0aW9uIG9yIG9iamVjdCBmb3IgdGhlIGZvcm0gYmluZGluZyBnZXR0ZXIuXCIpO1xuXHRpZiAodHlwZW9mIG9uQ2hhbmdlICE9PSBcImZ1bmN0aW9uXCIpIG9uQ2hhbmdlID0gbnVsbDtcblxuXHR0aGlzLl9mb3JtQmluZGluZ3NbaWRdID0ge1xuXHRcdGdldDogZ2V0dGVyLFxuXHRcdGNoYW5nZTogb25DaGFuZ2Vcblx0fTtcblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gZ2V0Rm9ybUJpbmRpbmcoaWQpIHtcblx0aWYgKHR5cGVvZiBpZCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuO1xuXHR2YXIgYyA9IHRoaXMsIGJpbmRpbmdzO1xuXG5cdHdoaWxlIChjICE9IG51bGwpIHtcblx0XHRiaW5kaW5ncyA9IGMuX2Zvcm1CaW5kaW5ncztcblx0XHRpZiAoYmluZGluZ3MgIT0gbnVsbCAmJiBiaW5kaW5nc1tpZF0gIT0gbnVsbCkgcmV0dXJuIGJpbmRpbmdzW2lkXTtcblx0XHRjID0gYy5wYXJlbnQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVtb3ZlRm9ybUJpbmRpbmcoaWQpIHtcblx0dmFyIGV4aXN0cyA9IHRoaXMuX2Zvcm1CaW5kaW5nc1tpZF0gIT0gbnVsbDtcblx0ZGVsZXRlIHRoaXMuX2Zvcm1CaW5kaW5nc1tpZF07XG5cdHJldHVybiBleGlzdHM7XG59XG5cbnZhciB0eXBlX21hcCA9IHtcblx0XCJ0ZXh0XCI6IFsgXCJ0ZXh0XCIsIFwiY29sb3JcIiwgXCJlbWFpbFwiLCBcInBhc3N3b3JkXCIsIFwic2VhcmNoXCIsIFwidGVsXCIsIFwidXJsXCIsIFwiaGlkZGVuXCIgXSxcblx0XCJudW1iZXJcIjogWyBcIm51bWJlclwiLCBcInJhbmdlXCIgXSxcblx0XCJkYXRlXCI6IFsgXCJkYXRlXCIsIFwiZGF0ZXRpbWVcIiwgXCJkYXRldGltZS1sb2NhbFwiLCBcIm1vbnRoXCIsIFwidGltZVwiLCBcIndlZWtcIiBdLFxuXHRcImZpbGVcIjogWyBcImZpbGVcIiBdLFxuXHRcImNoZWNrYm94XCI6IFsgXCJjaGVja2JveFwiIF0sXG5cdFwicmFkaW9cIjogWyBcInJhZGlvXCIgXVxufVxuXG5mdW5jdGlvbiBnZXRUeXBlKGVsKSB7XG5cdHN3aXRjaCAoZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0Y2FzZSBcImlucHV0XCI6XG5cdFx0XHRmb3IgKHZhciB0eXBlIGluIHR5cGVfbWFwKSB7XG5cdFx0XHRcdGlmIChfLmNvbnRhaW5zKHR5cGVfbWFwW3R5cGVdLCBlbC50eXBlKSkgcmV0dXJuIHR5cGU7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJzZWxlY3RcIjpcblx0XHRcdHJldHVybiBcInNlbGVjdFwiO1xuXG5cdFx0Y2FzZSBcIm9wdGlvblwiOlxuXHRcdFx0cmV0dXJuIFwib3B0aW9uXCI7XG5cblx0XHRjYXNlIFwidGV4dGFyZWFcIjpcblx0XHRcdHJldHVybiBcInRleHRcIjtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXROb2RlVmFsdWUobm9kZSwgdHlwZSkge1xuXHRpZiAodHlwZSA9PSBudWxsKSB0eXBlID0gZ2V0VHlwZShub2RlKTtcblx0dmFyIHZhbDtcblxuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFwibnVtYmVyXCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlQXNOdW1iZXI7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwidGV4dFwiOlxuXHRcdFx0dmFsID0gbm9kZS52YWx1ZTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImNoZWNrYm94XCI6XG5cdFx0XHR2YWwgPSBub2RlLmNoZWNrZWQ7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJkYXRlXCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlQXNEYXRlO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwic2VsZWN0XCI6XG5cdFx0XHR2YXIgb3B0ID0gbm9kZS5xdWVyeVNlbGVjdG9yKFwib3B0aW9uOmNoZWNrZWRcIik7XG5cdFx0XHRpZiAob3B0ICE9IG51bGwpIHZhbCA9IG9wdC4kYm91bmRfdmFsdWU7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJmaWxlXCI6XG5cdFx0XHR2YWwgPSAhbm9kZS5tdWx0aXBsZSA/IG5vZGUuZmlsZXNbMF0gOiBfLnRvQXJyYXkobm9kZS5maWxlcyk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJyYWRpb1wiOlxuXHRcdFx0dmFsID0gbm9kZS4kYm91bmRfdmFsdWU7XG5cdFx0XHRicmVhaztcblx0fVxuXG5cdHJldHVybiB2YWw7XG59XG5cbmZ1bmN0aW9uIHNldE5vZGVWYWx1ZShlbCwgdmFsLCB0eXBlKSB7XG5cdGlmICh0eXBlID09IG51bGwpIHR5cGUgPSBnZXRUeXBlKGVsKTtcblxuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFwibnVtYmVyXCI6XG5cdFx0XHRpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZWwpIHJldHVybjtcblx0XHRcdGlmIChfLmlzTnVtYmVyKHZhbCkpIGVsLnZhbHVlQXNOdW1iZXIgPSB2YWw7XG5cdFx0XHRlbHNlIGVsLnZhbHVlID0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwidGV4dFwiOlxuXHRcdFx0aWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVsKSByZXR1cm47XG5cdFx0XHRlbC52YWx1ZSA9IHZhbCA9PSBudWxsID8gXCJcIiA6IHZhbC50b1N0cmluZygpO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiY2hlY2tib3hcIjpcblx0XHRcdGVsLmNoZWNrZWQgPSAhIXZhbDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImRhdGVcIjpcblx0XHRcdGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBlbCkgcmV0dXJuO1xuXHRcdFx0aWYgKF8uaXNEYXRlKHZhbCkpIGVsLnZhbHVlQXNEYXRlID0gdmFsO1xuXHRcdFx0ZWxzZSBlbC52YWx1ZSA9IHZhbDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInNlbGVjdFwiOlxuXHRcdFx0Xy50b0FycmF5KGVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJvcHRpb25cIikpLmZvckVhY2goZnVuY3Rpb24ob3B0KSB7XG5cdFx0XHRcdG9wdC5zZWxlY3RlZCA9IG9wdC4kYm91bmRfdmFsdWUgPT09IHZhbDtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwicmFkaW9cIjpcblx0XHRcdGVsLmNoZWNrZWQgPSBlbC4kYm91bmRfdmFsdWUgPT09IHZhbDtcblx0XHRcdGJyZWFrO1xuXHR9XG59IiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0VHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIiksXG5cdE1vZGVsID0gcmVxdWlyZShcIi4vbW9kZWxcIiksXG5cdFZpZXcgPSByZXF1aXJlKFwiLi92aWV3XCIpO1xuXG52YXIgU2VjdGlvbiA9XG5tb2R1bGUuZXhwb3J0cyA9IFZpZXcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMucm93cyA9IHt9O1xuXHRcdHRoaXMuX3Jvd19kZXBzID0ge307XG5cdFx0Vmlldy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9LFxuXG5cdGludmVydDogZnVuY3Rpb24odmFsKSB7XG5cdFx0aWYgKCFfLmlzQm9vbGVhbih2YWwpKSB2YWwgPSAhdGhpcy5faW52ZXJ0ZWQ7XG5cdFx0dGhpcy5faW52ZXJ0ZWQgPSB2YWw7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aXNJbnZlcnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5faW52ZXJ0ZWQ7XG5cdH0sXG5cblx0c2V0UGF0aDogZnVuY3Rpb24ocGF0aCkge1xuXHRcdHRoaXMuX3BhdGggPSBwYXRoO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdG9uUm93OiBmdW5jdGlvbihmbikge1xuXHRcdGlmICghXy5pc0Z1bmN0aW9uKGZuKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3Igcm93IGhhbmRsZXIuXCIpO1xuXG5cdFx0dGhpcy5fb25Sb3cgPSBmbjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhZGRSb3c6IGZ1bmN0aW9uKGtleSwgZGF0YSkge1xuXHRcdC8vIHJlbW92ZSBleGlzdGluZ1xuXHRcdHRoaXMucmVtb3ZlUm93KGtleSk7XG5cblx0XHQvLyBjb252ZXJ0IGRhdGEgdG8gbW9kZWxcblx0XHRpZiAoIU1vZGVsLmlzTW9kZWwoZGF0YSkpIHtcblx0XHRcdGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgdGhpcy5tb2RlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gY3JlYXRlIGEgbmV3IHJvd1xuXHRcdHZhciByb3cgPSBuZXcgVmlldyhkYXRhKTtcblx0XHRcblx0XHQvLyBzZXQgdXAgcmVuZGVyIGFuZCBtb3VudCBpdFxuXHRcdHJvdy5yZW5kZXIgPSB0aGlzLl9vblJvdztcblx0XHR0aGlzLnJvd3Nba2V5XSA9IHJvdztcblx0XHR0aGlzLmFkZE1lbWJlcihyb3cpO1xuXHRcdHJvdy5tb3VudCgpO1xuXG5cdFx0cmV0dXJuIHJvdztcblx0fSxcblxuXHRoYXNSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdHJldHVybiB0aGlzLmdldFJvdyhrZXkpICE9IG51bGw7XG5cdH0sXG5cblx0Z2V0Um93OiBmdW5jdGlvbihrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5yb3dzW2tleV07XG5cdH0sXG5cblx0cmVtb3ZlUm93OiBmdW5jdGlvbihrZXkpIHtcblx0XHRpZiAodGhpcy5yb3dzW2tleV0gPT0gbnVsbCkgcmV0dXJuIHRoaXM7XG5cblx0XHR2YXIgcm93ID0gdGhpcy5yb3dzW2tleV07XG5cdFx0dGhpcy5yZW1vdmVNZW1iZXIocm93KTtcblx0XHRkZWxldGUgdGhpcy5yb3dzW2tleV07XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVBbGxSb3dzOiBmdW5jdGlvbigpIHtcblx0XHRPYmplY3Qua2V5cyh0aGlzLnJvd3MpLmZvckVhY2godGhpcy5yZW1vdmVSb3csIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX3BhdGggPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyBwYXRoLlwiKTtcblxuXHRcdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdHZhbCwgaXNFbXB0eSwgaW52ZXJ0ZWQsIGlzTGlzdCxcblx0XHRcdHJvd1NvcnQsIG1vZGVsLCBwcm94eSwga2V5cztcblxuXHRcdHZhbCA9IHRoaXMuZ2V0KHRoaXMuX3BhdGgpO1xuXHRcdG1vZGVsID0gbmV3IE1vZGVsKHZhbCwgdGhpcy5tb2RlbCk7XG5cdFx0cHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUodmFsKTtcblx0XHRpbnZlcnRlZCA9IHRoaXMuaXNJbnZlcnRlZCgpO1xuXHRcdGlzTGlzdCA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImlzTGlzdFwiKTtcblxuXHRcdGZ1bmN0aW9uIGdldEVtcHRpbmVzcygpIHtcblx0XHRcdHJldHVybiBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJpc0VtcHR5XCIpO1xuXHRcdH1cblxuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdGlzRW1wdHkgPSAhdmFsIHx8IChpc0xpc3QgJiYgIWdldEVtcHRpbmVzcygpKVxuXHRcdH0pO1xuXG5cdFx0aWYgKGlzRW1wdHkgJiYgaW52ZXJ0ZWQpIHtcblx0XHRcdGlmIChpc0xpc3QpIGdldEVtcHRpbmVzcygpO1xuXHRcdFx0dGhpcy5hZGRSb3coMCwgbW9kZWwpO1xuXHRcdH0gZWxzZSBpZiAoIWlzRW1wdHkgJiYgIWludmVydGVkKSB7XG5cdFx0XHRpZiAoaXNMaXN0KSB7XG5cdFx0XHRcdGtleXMgPSBbXTtcblxuXHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oY29tcCkge1xuXHRcdFx0XHRcdHZhciBua2V5cyA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImtleXNcIik7XG5cblx0XHRcdFx0XHQvLyB0cmljayBUcmFja3Igc28gYXV0b3J1bnMgYXJlbid0IGNvbnRyb2xsZWQgYnkgdGhpcyBvbmVcblx0XHRcdFx0XHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gY29tcC5fcGFyZW50O1xuXG5cdFx0XHRcdFx0Ly8gcmVtb3ZlIHJlbW92ZWQgcm93c1xuXHRcdFx0XHRcdF8uZGlmZmVyZW5jZShrZXlzLCBua2V5cykuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLl9yb3dfZGVwc1trZXldKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Jvd19kZXBzW2tleV0uc3RvcCgpO1xuXHRcdFx0XHRcdFx0XHRkZWxldGUgdGhpcy5fcm93X2RlcHNba2V5XTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhpcy5yZW1vdmVSb3coa2V5KTtcblx0XHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRcdC8vIGFkZCBhZGRlZCByb3dzXG5cdFx0XHRcdFx0Xy5kaWZmZXJlbmNlKG5rZXlzLCBrZXlzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuXHRcdFx0XHRcdFx0dmFyIHJvdywgcm1vZGVsO1xuXG5cdFx0XHRcdFx0XHRyb3cgPSB0aGlzLmdldFJvdyhrZXkpO1xuXHRcdFx0XHRcdFx0cm1vZGVsID0gcm93ICE9IG51bGwgPyByb3cubW9kZWwgOlxuXHRcdFx0XHRcdFx0XHRuZXcgTW9kZWwobnVsbCwgbmV3IE1vZGVsKHsgJGtleToga2V5IH0sIHRoaXMubW9kZWwpKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5fcm93X2RlcHNba2V5XSA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbihjKSB7XG5cdFx0XHRcdFx0XHRcdHJtb2RlbC5zZXQobW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiZ2V0XCIsIGtleSkpO1xuXHRcdFx0XHRcdFx0XHQvLyBpZiAocm93U29ydCAhPSBudWxsKSByb3dTb3J0LmludmFsaWRhdGUoKTtcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHQvLyBhZGQgdGhlIHJvdyBhZnRlciB3ZSBzZXQgdGhlIGRhdGFcblx0XHRcdFx0XHRcdGlmIChyb3cgPT0gbnVsbCkgdGhpcy5hZGRSb3coa2V5LCBybW9kZWwpO1xuXHRcdFx0XHRcdH0sIHRoaXMpO1xuXHRcdFx0XHRcdFx0XG5cdFx0XHRcdFx0Ly8gcHJldGVuZCBsaWtlIG5vdGhpbmcgaGFwcGVuZWRcblx0XHRcdFx0XHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gY29tcDtcblxuXHRcdFx0XHRcdC8vIHRoZSBuZXcgc2V0IG9mIGtleXNcblx0XHRcdFx0XHRrZXlzID0gbmtleXM7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIGEgcmVhY3RpdmUgY29udGV4dCB0aGF0IGNvbnRpbnVvdXNseSBzb3J0cyByb3dzXG5cdFx0XHRcdC8vIHJvd1NvcnQgPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0Ly8gY29uc29sZS5sb2coa2V5cyk7XG5cdFx0XHRcdFx0Ly8gdmFyIGJlZm9yZSA9IG51bGwsIGksIHJvdztcblxuXHRcdFx0XHRcdC8vIGZvciAoaSA9IGtleXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHQvLyBcdHJvdyA9IHRoaXMuZ2V0Um93KGtleXNbaV0pO1xuXHRcdFx0XHRcdC8vIFx0aWYgKHJvdyA9PSBudWxsKSBjb250aW51ZTtcblx0XHRcdFx0XHQvLyBcdHRoaXMuaW5zZXJ0QmVmb3JlKHJvdywgYmVmb3JlKTtcblx0XHRcdFx0XHQvLyBcdGJlZm9yZSA9IHJvdztcblx0XHRcdFx0XHQvLyB9XG5cdFx0XHRcdC8vIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hZGRSb3coMCwgbW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNMaXN0KSB7XG5cdFx0XHRnZXRFbXB0aW5lc3MoKTtcblx0XHR9XG5cblx0XHQvLyBhdXRvIGNsZWFuXG5cdFx0dGhpcy5vbmNlKFwiaW52YWxpZGF0ZVwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHRoaXMuX3Jvd19kZXBzID0ge307XG5cdFx0XHR0aGlzLnJlbW92ZUFsbFJvd3MoKTtcblx0XHR9KTtcblx0fVxuXG59LCB7XG5cblx0aXNFbXB0eTogZnVuY3Rpb24obW9kZWwsIHByb3h5KSB7XG5cdFx0aWYgKCFtb2RlbC5kYXRhKSByZXR1cm4gdHJ1ZTtcblx0XHRpZiAocHJveHkgPT0gbnVsbCkgcHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUobW9kZWwuZGF0YSk7XG5cdFx0cmV0dXJuIG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgbW9kZWwuZGF0YSwgXCJpc0xpc3RcIikgJiZcblx0XHRcdG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgbW9kZWwuZGF0YSwgXCJpc0VtcHR5XCIpO1xuXHR9XG5cbn0pO1xuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG52YXIgdHJhY2sgPVxuZXhwb3J0cy50cmFjayA9IGZ1bmN0aW9uKG9iaiwgcmVwbGFjZXIpIHtcblx0ZnVuY3Rpb24gcmVwbGFjZShrLCB2KSB7XG5cdFx0dmFyIG52YWw7XG5cdFx0aWYgKHR5cGVvZiByZXBsYWNlciA9PT0gXCJmdW5jdGlvblwiKSBudmFsID0gcmVwbGFjZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIG52YWwgPT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHYgIT09IFwidW5kZWZpbmVkXCIpIG52YWwgPSB0cmFjayh2KTtcblx0XHRyZXR1cm4gbnZhbDtcblx0fVxuXG5cdGlmIChfLmlzQXJyYXkob2JqKSkgcmV0dXJuIHRyYWNrQXJyYXkob2JqLCByZXBsYWNlKVxuXHRpZiAodXRpbC5pc1BsYWluT2JqZWN0KG9iaikpIHJldHVybiB0cmFja09iamVjdChvYmosIHJlcGxhY2UpO1xuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgdHJhY2tQcm9wZXJ0eSA9XG5leHBvcnRzLnRyYWNrUHJvcGVydHkgPSBmdW5jdGlvbihvYmosIHByb3AsIHZhbHVlLCBvcHRpb25zKSB7XG5cdGlmICghXy5pc09iamVjdChvYmopKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgb2JqZWN0IHRvIGRlZmluZSB0aGUgcmVhY3RpdmUgcHJvcGVydHkgb24uXCIpO1xuXHRpZiAodHlwZW9mIHByb3AgIT09IFwic3RyaW5nXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgZm9yIHByb3BlcnR5IG5hbWUuXCIpO1xuXG5cdHZhciBkZXAgPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3k7XG5cdFxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5jb25maWd1cmFibGUgIT09IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmVudW1lcmFibGUgIT09IGZhbHNlLFxuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRpZiAodmFsICE9PSB2YWx1ZSkge1xuXHRcdFx0XHR2YWx1ZSA9IHZhbDtcblx0XHRcdFx0ZGVwLmNoYW5nZWQoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0sXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdGRlcC5kZXBlbmQoKTtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBvYmo7XG59XG5cbnZhciB0cmFja09iamVjdCA9XG5leHBvcnRzLnRyYWNrT2JqZWN0ID0gZnVuY3Rpb24ocHJvcHMsIHJlcGxhY2VyKSB7XG5cdGlmIChwcm9wcy5fX3JlYWN0aXZlKSByZXR1cm4gcHJvcHM7XG5cblx0dmFyIHZhbHVlcyA9IHt9O1xuXHR2YXIgZGVwcyA9IHt9O1xuXHR2YXIgbWFpbkRlcCA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXG5cdGZ1bmN0aW9uIHJlcGxhY2UoY3R4LCBuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiByZXBsYWNlciA9PT0gXCJmdW5jdGlvblwiID8gcmVwbGFjZXIuY2FsbChjdHgsIG5hbWUsIHZhbHVlKSA6IHZhbHVlO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0dGVyKG5hbWUpIHtcblx0XHRkZXBzW25hbWVdLmRlcGVuZCgpO1xuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR0ZXIobmFtZSwgdmFsdWUpIHtcblx0XHR2YXIgb2xkID0gdmFsdWVzW25hbWVdO1xuXHRcdHZhbHVlc1tuYW1lXSA9IHJlcGxhY2UodGhpcywgbmFtZSwgdmFsdWUpO1xuXG5cdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0aWYgKGRlcCA9PSBudWxsKSBkZXAgPSBkZXBzW25hbWVdID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cdFx0aWYgKG9sZCAhPT0gdmFsdWVzW25hbWVdKSBkZXAuY2hhbmdlZCgpO1xuXG5cdFx0bWFpbkRlcC5jaGFuZ2VkKCk7XG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdHZhciBfcHJvdG8gPSB0eXBlb2YgcHJvcHMuY29uc3RydWN0b3IgPT09IFwiZnVuY3Rpb25cIiA/IE9iamVjdC5jcmVhdGUocHJvcHMuY29uc3RydWN0b3IucHJvdG90eXBlKSA6IHt9O1xuXG5cdF8uZXh0ZW5kKF9wcm90bywge1xuXG5cdFx0ZGVmaW5lUHJvcGVydHk6IGZ1bmN0aW9uKG5hbWUsIHZhbHVlLCBvcHRpb25zKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgbmFtZSwge1xuXHRcdFx0XHRjb25maWd1cmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmNvbmZpZ3VyYWJsZSAhPT0gZmFsc2UsXG5cdFx0XHRcdGVudW1lcmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmVudW1lcmFibGUgIT09IGZhbHNlLFxuXHRcdFx0XHRnZXQ6IGdldHRlci5iaW5kKHRoaXMsIG5hbWUpLFxuXHRcdFx0XHRzZXQ6IHNldHRlci5iaW5kKHRoaXMsIG5hbWUpXG5cdFx0XHR9KTtcblxuXHRcdFx0dGhpc1tuYW1lXSA9IHZhbHVlO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdGRlbGV0ZVByb3BlcnR5OiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0XHR2YXIgZGVwID0gZGVwc1tuYW1lXTtcblx0XHRcdGlmIChkZWxldGUgdGhpc1tuYW1lXSkgeyAvLyBpbiBjYXNlIGNvbmZpZ3VyYWJsZSA9PT0gZmFsc2Vcblx0XHRcdFx0ZGVsZXRlIHZhbHVlc1tuYW1lXTtcblx0XHRcdFx0ZGVsZXRlIGRlcHNbbmFtZV07XG5cdFx0XHRcdGlmIChkZXApIGRlcC5jaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXG5cdFx0dG9KU09OOiBmdW5jdGlvbigpIHtcblx0XHRcdG1haW5EZXAuZGVwZW5kKCk7XG5cdFx0XHRyZXR1cm4gXy5jbG9uZSh2YWx1ZXMpO1xuXHRcdH1cblxuXHR9KTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkoX3Byb3RvLCBcIl9fcmVhY3RpdmVcIiwge1xuXHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0dmFsdWU6IHRydWUsXG5cdFx0d3JpdGVhYmxlOiBmYWxzZVxuXHR9KTtcblxuXHR2YXIgcm9iaiA9IE9iamVjdC5jcmVhdGUoX3Byb3RvKTtcblxuXHRfLmVhY2gocHJvcHMsIGZ1bmN0aW9uKHZhbHVlLCBrZXkpIHtcblx0XHRyb2JqLmRlZmluZVByb3BlcnR5KGtleSwgdmFsdWUpO1xuXHR9KTtcblxuXHRyZXR1cm4gcm9iajtcbn1cblxudmFyIHRyYWNrQXJyYXkgPVxuZXhwb3J0cy50cmFja0FycmF5ID0gZnVuY3Rpb24oYXJyLCByZXBsYWNlcikge1xuXHRpZiAoIV8uaXNBcnJheShhcnIpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYXJyYXkuXCIpO1xuXHRpZiAoYXJyLl9fcmVhY3RpdmUpIHJldHVybiBhcnI7XG5cdFxuXHR2YXIgZGVwcyA9IHsgbGVuZ3RoOiBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKSB9O1xuXHR2YXIgdmFsdWVzID0ge307XG5cdHZhciBuYXJyID0gdXRpbC5wYXRjaEFycmF5KFtdKTtcblxuXHRmdW5jdGlvbiByZXBsYWNlKGN0eCwgbmFtZSwgdmFsdWUpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cdFx0cmV0dXJuIFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0eXBlb2YgcmVwbGFjZXIgPT09IFwiZnVuY3Rpb25cIiA/IHJlcGxhY2VyLmNhbGwoY3R4LCBuYW1lLCB2YWx1ZSkgOiB2YWx1ZTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldHRlcihuYW1lKSB7XG5cdFx0ZGVwc1tuYW1lXS5kZXBlbmQoKTtcblx0XHRyZXR1cm4gdmFsdWVzW25hbWVdO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dGVyKG5hbWUsIHZhbHVlKSB7XG5cdFx0dmFyIG9sZCA9IHZhbHVlc1tuYW1lXTtcblx0XHR2YWx1ZXNbbmFtZV0gPSByZXBsYWNlKHRoaXMsIG5hbWUsIHZhbHVlKTtcblxuXHRcdHZhciBkZXAgPSBkZXBzW25hbWVdO1xuXHRcdGlmIChkZXAgPT0gbnVsbCkgZGVwID0gZGVwc1tuYW1lXSA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXHRcdGlmIChvbGQgIT09IHZhbHVlc1tuYW1lXSkgZGVwLmNoYW5nZWQoKTtcblxuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHRmdW5jdGlvbiBkZWZpbmUoaSkge1xuXHRcdHZhciBkZXA7XG5cblx0XHRpZiAodHlwZW9mIGkgPT09IFwibnVtYmVyXCIgJiYgaSA+PSBuYXJyLmxlbmd0aCkge1xuXHRcdFx0aWYgKChkZXAgPSBkZXBzW2ldKSAhPSBudWxsKSB7XG5cdFx0XHRcdGRlbGV0ZSBkZXBzW2ldO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWxldGUgbmFycltpXTtcblx0XHRcdGRlbGV0ZSB2YWx1ZXNbaV07XG5cdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNldHRlci5jYWxsKHRoaXMsIGksIG5hcnJbaV0pO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG5hcnIsIGkudG9TdHJpbmcoKSwge1xuXHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlLFxuXHRcdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRcdGdldDogZ2V0dGVyLmJpbmQobmFyciwgaSksXG5cdFx0XHRzZXQ6IHNldHRlci5iaW5kKG5hcnIsIGkpXG5cdFx0fSk7XG5cdH1cblxuXHRuYXJyLm9ic2VydmUoZnVuY3Rpb24oY2hnKSB7XHRcdFxuXHRcdHZhciBiYWxhbmNlLCBzdGFydCwgZW5kLCBsZW4sIGksIHByZXZsZW47XG5cblx0XHRpZiAoY2hnID09IG51bGwpIHJldHVybjtcblxuXHRcdGJhbGFuY2UgPSBjaGcuYWRkZWQgLSBjaGcucmVtb3ZlZDtcblx0XHRpZiAoIWJhbGFuY2UpIHJldHVybjtcblxuXHRcdGxlbiA9IG5hcnIubGVuZ3RoO1xuXHRcdHByZXZsZW4gPSBsZW4gLSBiYWxhbmNlO1xuXHRcdHN0YXJ0ID0gTWF0aC5taW4ocHJldmxlbiwgbGVuKTtcblx0XHRlbmQgPSBNYXRoLm1heChwcmV2bGVuLCBsZW4pO1xuXG5cdFx0Zm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykgZGVmaW5lKGkpO1xuXHRcdGRlcHMubGVuZ3RoLmNoYW5nZWQoKTtcblx0fSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG5hcnIsIFwiX19yZWFjdGl2ZVwiLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHR2YWx1ZTogdHJ1ZSxcblx0XHR3cml0ZWFibGU6IGZhbHNlXG5cdH0pO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBcIiRsZW5ndGhcIiwge1xuXHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdGRlcHMubGVuZ3RoLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHRoaXMubGVuZ3RoO1xuXHRcdH1cblx0fSk7XG5cblx0bmFyci5wdXNoLmFwcGx5KG5hcnIsIGFycik7XG5cdHJldHVybiBuYXJyO1xufSIsIm1vZHVsZS5leHBvcnRzID0ge1xuXHRST09UICAgICAgICAgICAgICA6IDEsXG5cblx0Ly8gWE1ML0hUTUxcblx0SFRNTCAgICAgICAgICAgICAgOiAyLFxuXHRURVhUICAgICAgICAgICAgICA6IDMsXG5cdEVMRU1FTlQgICAgICAgICAgIDogNCxcblx0QVRUUklCVVRFICAgICAgICAgOiA1LFxuXHRYQ09NTUVOVCAgICAgICAgICA6IDYsXG5cblx0Ly8gTXVzdGFjaGVcblx0SU5URVJQT0xBVE9SICAgICAgOiA3LFxuXHRUUklQTEUgICAgICAgICAgICA6IDgsXG5cdFNFQ1RJT04gICAgICAgICAgIDogOSxcblx0SU5WRVJURUQgICAgICAgICAgOiAxMCxcblx0UEFSVElBTCAgICAgICAgICAgOiAxMSxcblx0TUNPTU1FTlQgICAgICAgICAgOiAxMixcblxuXHQvLyBNSVNDXG5cdExJVEVSQUwgICAgICAgICAgIDogMTNcbn1cbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbi8vIGxpa2UgdW5kZXJzY29yZSdzIHJlc3VsdCwgYnV0IHBhc3MgYXJndW1lbnRzIHRocm91Z2hcbmV4cG9ydHMucmVzdWx0ID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSkge1xuXHR2YXIgdmFsdWUgPSBvYmplY3QgPT0gbnVsbCA/IHZvaWQgMCA6IG9iamVjdFtwcm9wZXJ0eV07XG5cdHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUuYXBwbHkob2JqZWN0LCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpKSA6IHZhbHVlO1xufTtcblxuLy8gdGVzdHMgdmFsdWUgYXMgcG9qbyAocGxhaW4gb2xkIGphdmFzY3JpcHQgb2JqZWN0KVxudmFyIGlzUGxhaW5PYmplY3QgPVxuZXhwb3J0cy5pc1BsYWluT2JqZWN0ID0gZnVuY3Rpb24ob2JqKSB7XG5cdHJldHVybiBvYmogIT0gbnVsbCAmJiAob2JqLmNvbnN0cnVjdG9yID09PSBPYmplY3QgfHwgb2JqLl9fcHJvdG9fXyA9PT0gT2JqZWN0LnByb3RvdHlwZSk7XG59XG5cbi8vIHRlc3RzIGZ1bmN0aW9uIGFzIGEgc3ViY2xhc3Mgb2YgYSBwYXJlbnQgZnVuY3Rpb25cbi8vIGhlcmUsIGEgY2xhc3MgaXMgdGVjaG5pY2FsbHkgYSBzdWJjbGFzcyBvZiBpdHNlbGZcbmV4cG9ydHMuaXNTdWJDbGFzcyA9IGZ1bmN0aW9uKHBhcmVudCwgZm4pIHtcblx0cmV0dXJuIGZuID09PSBwYXJlbnQgfHwgKGZuICE9IG51bGwgJiYgZm4ucHJvdG90eXBlIGluc3RhbmNlb2YgcGFyZW50KTtcbn1cblxuLy8gY2xlYW5zIGh0bWwsIHRoZW4gY29udmVydHMgaHRtbCBlbnRpdGllcyB0byB1bmljb2RlXG5leHBvcnRzLmRlY29kZUVudGl0aWVzID0gKGZ1bmN0aW9uKCkge1xuXHRpZiAodHlwZW9mIGRvY3VtZW50ID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cblx0Ly8gdGhpcyBwcmV2ZW50cyBhbnkgb3ZlcmhlYWQgZnJvbSBjcmVhdGluZyB0aGUgb2JqZWN0IGVhY2ggdGltZVxuXHR2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHR2YXIgZW50aXR5ID0gLyYoPzojeFthLWYwLTldK3wjWzAtOV0rfFthLXowLTldKyk7Py9pZztcblxuXHRyZXR1cm4gZnVuY3Rpb24gZGVjb2RlSFRNTEVudGl0aWVzKHN0cikge1xuXHRcdHN0ciA9IHN0ci5yZXBsYWNlKGVudGl0eSwgZnVuY3Rpb24obSkge1xuXHRcdFx0ZWxlbWVudC5pbm5lckhUTUwgPSBtO1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ7XG5cdFx0fSk7XG5cblx0XHRlbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG5cdFx0cmV0dXJuIHN0cjtcblx0fVxufSkoKTtcblxuLy8gY29udmVydCBodG1sIGludG8gRE9NIG5vZGVzXG5leHBvcnRzLnBhcnNlSFRNTCA9IChmdW5jdGlvbigpIHtcblx0aWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXG5cdC8vIHRoaXMgcHJldmVudHMgYW55IG92ZXJoZWFkIGZyb20gY3JlYXRpbmcgdGhlIG9iamVjdCBlYWNoIHRpbWVcblx0dmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRyZXR1cm4gZnVuY3Rpb24gcGFyc2VIVE1MKGh0bWwpIHtcblx0XHRlbGVtZW50LmlubmVySFRNTCA9IGh0bWwgIT0gbnVsbCA/IGh0bWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0dmFyIG5vZGVzID0gXy50b0FycmF5KGVsZW1lbnQuY2hpbGROb2Rlcyk7XG5cdFx0Zm9yICh2YXIgaSBpbiBub2RlcykgZWxlbWVudC5yZW1vdmVDaGlsZChub2Rlc1tpXSk7XG5cdFx0cmV0dXJuIG5vZGVzO1xuXHR9XG59KSgpO1xuXG4vLyB0aGUgc3ViY2xhc3NpbmcgZnVuY3Rpb24gZm91bmQgaW4gQmFja2JvbmVcbnZhciBzdWJjbGFzcyA9XG5leHBvcnRzLnN1YmNsYXNzID0gZnVuY3Rpb24ocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcblx0dmFyIHBhcmVudCA9IHRoaXM7XG5cdHZhciBjaGlsZDtcblxuXHQvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG5cdC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuXHQvLyBieSB1cyB0byBzaW1wbHkgY2FsbCB0aGUgcGFyZW50J3MgY29uc3RydWN0b3IuXG5cdGlmIChwcm90b1Byb3BzICYmIF8uaGFzKHByb3RvUHJvcHMsICdjb25zdHJ1Y3RvcicpKSB7XG5cdFx0Y2hpbGQgPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdGNoaWxkID0gZnVuY3Rpb24oKXsgcmV0dXJuIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9O1xuXHR9XG5cblx0Ly8gQWRkIHN0YXRpYyBwcm9wZXJ0aWVzIHRvIHRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiwgaWYgc3VwcGxpZWQuXG5cdF8uZXh0ZW5kKGNoaWxkLCBwYXJlbnQsIHN0YXRpY1Byb3BzKTtcblxuXHQvLyBTZXQgdGhlIHByb3RvdHlwZSBjaGFpbiB0byBpbmhlcml0IGZyb20gYHBhcmVudGAsIHdpdGhvdXQgY2FsbGluZ1xuXHQvLyBgcGFyZW50YCdzIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLlxuXHR2YXIgU3Vycm9nYXRlID0gZnVuY3Rpb24oKXsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9O1xuXHRTdXJyb2dhdGUucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcblx0Y2hpbGQucHJvdG90eXBlID0gbmV3IFN1cnJvZ2F0ZTtcblxuXHQvLyBBZGQgcHJvdG90eXBlIHByb3BlcnRpZXMgKGluc3RhbmNlIHByb3BlcnRpZXMpIHRvIHRoZSBzdWJjbGFzcyxcblx0Ly8gaWYgc3VwcGxpZWQuXG5cdGlmIChwcm90b1Byb3BzKSBfLmV4dGVuZChjaGlsZC5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuXG5cdC8vIFNldCBhIGNvbnZlbmllbmNlIHByb3BlcnR5IGluIGNhc2UgdGhlIHBhcmVudCdzIHByb3RvdHlwZSBpcyBuZWVkZWRcblx0Ly8gbGF0ZXIuXG5cdGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cblx0cmV0dXJuIGNoaWxkO1xufVxuXG52YXIgbWF0Y2hlc1NlbGVjdG9yID0gdHlwZW9mIEVsZW1lbnQgIT09IFwidW5kZWZpbmVkXCIgP1xuXHRFbGVtZW50LnByb3RvdHlwZS5tYXRjaGVzIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLndlYmtpdE1hdGNoZXNTZWxlY3RvciB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS5tb3pNYXRjaGVzU2VsZWN0b3IgfHxcblx0RWxlbWVudC5wcm90b3R5cGUubXNNYXRjaGVzU2VsZWN0b3IgOlxuXHRmdW5jdGlvbigpIHsgcmV0dXJuIGZhbHNlOyB9O1xuXG5leHBvcnRzLm1hdGNoZXNTZWxlY3RvciA9IGZ1bmN0aW9uKGVsZW0sIHNlbGVjdG9yKSB7XG5cdHJldHVybiBtYXRjaGVzU2VsZWN0b3IuY2FsbChlbGVtLCBzZWxlY3Rvcilcbn1cblxudmFyIG1hdGNoZXMgPSBleHBvcnRzLm1hdGNoZXMgPSBmdW5jdGlvbihub2RlLCBzZWxlY3Rvcikge1xuXHRpZiAoXy5pc0FycmF5KHNlbGVjdG9yKSkgcmV0dXJuIHNlbGVjdG9yLnNvbWUoZnVuY3Rpb24ocykge1xuXHRcdHJldHVybiBtYXRjaGVzKG5vZGUsIHMpO1xuXHR9KTtcblxuXHRpZiAoc2VsZWN0b3IgaW5zdGFuY2VvZiB3aW5kb3cuTm9kZSkge1xuXHRcdHJldHVybiBub2RlID09PSBzZWxlY3Rvcjtcblx0fVxuXHRcblx0aWYgKHR5cGVvZiBzZWxlY3RvciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0cmV0dXJuICEhc2VsZWN0b3Iobm9kZSk7XG5cdH1cblx0XG5cdGlmIChub2RlLm5vZGVUeXBlID09PSB3aW5kb3cuTm9kZS5FTEVNRU5UX05PREUpIHtcblx0XHRyZXR1cm4gbWF0Y2hlc1NlbGVjdG9yLmNhbGwobm9kZSwgc2VsZWN0b3IpO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5leHBvcnRzLmNsb3Nlc3QgPSBmdW5jdGlvbihlbGVtLCBzZWxlY3Rvcikge1xuXHR3aGlsZSAoZWxlbSAhPSBudWxsKSB7XG5cdFx0aWYgKGVsZW0ubm9kZVR5cGUgPT09IDEgJiYgbWF0Y2hlcyhlbGVtLCBzZWxlY3RvcikpIHJldHVybiBlbGVtO1xuXHRcdGVsZW0gPSBlbGVtLnBhcmVudE5vZGU7XG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cblxudmFyIGRlZmluZUNvbXB1dGVkUHJvcGVydHkgPVxuZXhwb3J0cy5kZWZpbmVDb21wdXRlZFByb3BlcnR5ID0gZnVuY3Rpb24ob2JqLCBwcm9wLCB2YWx1ZSkge1xuXHRpZiAodHlwZW9mIHZhbHVlICE9PSBcImZ1bmN0aW9uXCIpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciBjb21wdXRlZCBwcm9wZXJ0eSB2YWx1ZS5cIik7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdmFsdWUuY2FsbChvYmopO1xuXHRcdH1cblx0fSk7XG59XG5cbmV4cG9ydHMuZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0aWVzID0gZnVuY3Rpb24ob2JqLCBwcm9wcykge1xuXHRPYmplY3Qua2V5cyhwcm9wcykuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcblx0XHRkZWZpbmVDb21wdXRlZFByb3BlcnR5KG9iaiwga2V5LCBwcm9wc1trZXldKTtcblx0fSk7XG59XG5cbi8vIGFycmF5IHdyaXRlIG9wZXJhdGlvbnNcbnZhciBtdXRhdG9yTWV0aG9kcyA9IFsgJ3BvcCcsICdwdXNoJywgJ3JldmVyc2UnLCAnc2hpZnQnLCAnc29ydCcsICdzcGxpY2UnLCAndW5zaGlmdCcgXTtcblxuLy8gcGF0Y2hlcyBhbiBhcnJheSBzbyB3ZSBjYW4gbGlzdGVuIHRvIHdyaXRlIG9wZXJhdGlvbnNcbnZhciBwYXRjaEFycmF5ID1cbmV4cG9ydHMucGF0Y2hBcnJheSA9IGZ1bmN0aW9uKGFycikge1xuXHRpZiAoYXJyLl9wYXRjaGVkKSByZXR1cm4gYXJyO1xuXHRcblx0dmFyIHBhdGNoZWRBcnJheVByb3RvID0gW10sXG5cdFx0b2JzZXJ2ZXJzID0gW107XG5cblx0bXV0YXRvck1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHBhdGNoZWRBcnJheVByb3RvLCBtZXRob2ROYW1lLCB7XG5cdFx0XHR2YWx1ZTogbWV0aG9kXG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiBtZXRob2QoKSB7XG5cdFx0XHR2YXIgc3BsaWNlRXF1aXZhbGVudCwgc3VtbWFyeSwgYXJncywgcmVzO1xuXG5cdFx0XHRhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyk7XG5cblx0XHRcdC8vIGNvbnZlcnQgdGhlIG9wZXJhdGlvbiBpbnRvIGEgc3BsaWNlXG5cdFx0XHRzcGxpY2VFcXVpdmFsZW50ID0gZ2V0U3BsaWNlRXF1aXZhbGVudCh0aGlzLCBtZXRob2ROYW1lLCBhcmdzKTtcblx0XHRcdHN1bW1hcnkgPSBzdW1tYXJpc2VTcGxpY2VPcGVyYXRpb24odGhpcywgc3BsaWNlRXF1aXZhbGVudCk7XG5cblx0XHRcdC8vIHJ1biB0aGUgaW50ZW5kZWQgbWV0aG9kXG5cdFx0XHRyZXMgPSBBcnJheS5wcm90b3R5cGVbbWV0aG9kTmFtZV0uYXBwbHkodGhpcywgYXJncyk7XG5cblx0XHRcdC8vIGNhbGwgdGhlIG9iZXJzdnNlcnNcblx0XHRcdG9ic2VydmVycy5mb3JFYWNoKGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRcdGZuLmNhbGwodGhpcywgc3VtbWFyeSk7XG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0Ly8gcmV0dXJuIHRoZSByZXN1bHQgb2YgdGhlIG1ldGhvZFxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9O1xuXHR9KTtcblxuXHRpZiAoKHt9KS5fX3Byb3RvX18pIGFyci5fX3Byb3RvX18gPSBwYXRjaGVkQXJyYXlQcm90bztcblx0ZWxzZSB7XG5cdFx0bXV0YXRvck1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoYXJyLCBtZXRob2ROYW1lLCB7XG5cdFx0XHRcdHZhbHVlOiBwYXRjaGVkQXJyYXlQcm90b1ttZXRob2ROYW1lXSxcblx0XHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdF8uZWFjaCh7XG5cdFx0X3BhdGNoZWQ6IHRydWUsXG5cdFx0b2JzZXJ2ZTogZnVuY3Rpb24oZm4pIHtcblx0XHRcdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIHRvIG9ic2VydmUgd2l0aC5cIik7XG5cdFx0XHRvYnNlcnZlcnMucHVzaChmbik7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXHRcdHN0b3BPYnNlcnZpbmc6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHR2YXIgaW5kZXggPSBvYnNlcnZlcnMuaW5kZXhPZihmbik7XG5cdFx0XHRpZiAoaW5kZXggPiAtMSkgb2JzZXJ2ZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdH0sIGZ1bmN0aW9uKHYsIGspIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoYXJyLCBrLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0XHR2YWx1ZTogdixcblx0XHRcdHdyaXRlYWJsZTogZmFsc2Vcblx0XHR9KTtcblx0fSk7XG5cblx0cmV0dXJuIGFycjtcbn1cblxuLy8gY29udmVydHMgYXJyYXkgd3JpdGUgb3BlcmF0aW9ucyBpbnRvIHNwbGljZSBlcXVpdmFsZW50IGFyZ3VtZW50c1xudmFyIGdldFNwbGljZUVxdWl2YWxlbnQgPVxuZXhwb3J0cy5nZXRTcGxpY2VFcXVpdmFsZW50ID0gZnVuY3Rpb24gKCBhcnJheSwgbWV0aG9kTmFtZSwgYXJncyApIHtcblx0c3dpdGNoICggbWV0aG9kTmFtZSApIHtcblx0XHRjYXNlICdzcGxpY2UnOlxuXHRcdFx0cmV0dXJuIGFyZ3M7XG5cblx0XHRjYXNlICdzb3J0Jzpcblx0XHRjYXNlICdyZXZlcnNlJzpcblx0XHRcdHJldHVybiBudWxsO1xuXG5cdFx0Y2FzZSAncG9wJzpcblx0XHRcdGlmICggYXJyYXkubGVuZ3RoICkge1xuXHRcdFx0XHRyZXR1cm4gWyAtMSBdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cblx0XHRjYXNlICdwdXNoJzpcblx0XHRcdHJldHVybiBbIGFycmF5Lmxlbmd0aCwgMCBdLmNvbmNhdCggYXJncyApO1xuXG5cdFx0Y2FzZSAnc2hpZnQnOlxuXHRcdFx0cmV0dXJuIFsgMCwgMSBdO1xuXG5cdFx0Y2FzZSAndW5zaGlmdCc6XG5cdFx0XHRyZXR1cm4gWyAwLCAwIF0uY29uY2F0KCBhcmdzICk7XG5cdH1cbn1cblxuLy8gcmV0dXJucyBhIHN1bW1hcnkgcGYgaG93IGFuIGFycmF5IHdpbGwgYmUgY2hhbmdlZCBhZnRlciB0aGUgc3BsaWNlIG9wZXJhdGlvblxudmFyIHN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbiA9XG5leHBvcnRzLnN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICggYXJyYXksIGFyZ3MgKSB7XG5cdHZhciBpbmRleCwgYWRkZWRJdGVtcywgcmVtb3ZlZEl0ZW1zO1xuXG5cdGlmICghYXJncykgcmV0dXJuIG51bGw7XG5cblx0Ly8gZmlndXJlIG91dCB3aGVyZSB0aGUgY2hhbmdlcyBzdGFydGVkLi4uXG5cdGluZGV4ID0gKyggYXJnc1swXSA8IDAgPyBhcnJheS5sZW5ndGggKyBhcmdzWzBdIDogYXJnc1swXSApO1xuXG5cdC8vIC4uLmFuZCBob3cgbWFueSBpdGVtcyB3ZXJlIGFkZGVkIHRvIG9yIHJlbW92ZWQgZnJvbSB0aGUgYXJyYXlcblx0YWRkZWRJdGVtcyA9IE1hdGgubWF4KCAwLCBhcmdzLmxlbmd0aCAtIDIgKTtcblx0cmVtb3ZlZEl0ZW1zID0gKCBhcmdzWzFdICE9PSB1bmRlZmluZWQgPyBhcmdzWzFdIDogYXJyYXkubGVuZ3RoIC0gaW5kZXggKTtcblxuXHQvLyBJdCdzIHBvc3NpYmxlIHRvIGRvIGUuZy4gWyAxLCAyLCAzIF0uc3BsaWNlKCAyLCAyICkgLSBpLmUuIHRoZSBzZWNvbmQgYXJndW1lbnRcblx0Ly8gbWVhbnMgcmVtb3ZpbmcgbW9yZSBpdGVtcyBmcm9tIHRoZSBlbmQgb2YgdGhlIGFycmF5IHRoYW4gdGhlcmUgYXJlLiBJbiB0aGVzZVxuXHQvLyBjYXNlcyB3ZSBuZWVkIHRvIGN1cmIgSmF2YVNjcmlwdCdzIGVudGh1c2lhc20gb3Igd2UnbGwgZ2V0IG91dCBvZiBzeW5jXG5cdHJlbW92ZWRJdGVtcyA9IE1hdGgubWluKCByZW1vdmVkSXRlbXMsIGFycmF5Lmxlbmd0aCAtIGluZGV4ICk7XG5cblx0cmV0dXJuIHtcblx0XHRpbmRleDogaW5kZXgsXG5cdFx0YWRkZWQ6IGFkZGVkSXRlbXMsXG5cdFx0cmVtb3ZlZDogcmVtb3ZlZEl0ZW1zXG5cdH07XG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpLFxuXHRFdmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpLFxuXHRNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXHRQbHVnaW5zID0gcmVxdWlyZShcIi4vcGx1Z2luc1wiKSxcblx0RE9NUmFuZ2UgPSByZXF1aXJlKFwiLi9kb21yYW5nZVwiKTtcblxudmFyIFZpZXcgPVxubW9kdWxlLmV4cG9ydHMgPSBET01SYW5nZS5leHRlbmQoe1xuXG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihkYXRhLCBvcHRpb25zKSB7XG5cdFx0Ly8gZmlyc3Qgd2UgY3JlYXRlIHRoZSBpbml0aWFsIHZpZXcgc3RhdGVcblx0XHR2YXIgc3RhdGUgPSBfLnJlc3VsdCh0aGlzLCBcImluaXRpYWxTdGF0ZVwiKSB8fCBfLnJlc3VsdCh0aGlzLCBcImRlZmF1bHRzXCIpO1xuXHRcdGlmICh0eXBlb2Ygc3RhdGUgIT09IFwidW5kZWZpbmVkXCIpIHtcblx0XHRcdGlmICghTW9kZWwuaXNNb2RlbChzdGF0ZSkpIHtcblx0XHRcdFx0c3RhdGUgPSBuZXcgTW9kZWwoc3RhdGUsIG51bGwsIG9wdGlvbnMgJiYgb3B0aW9ucy5zdGF0ZSk7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdC8vIHNob3ZlIHN0YXRlIGJldHdlZW4gY29udGV4dHNcblx0XHRcdGlmIChNb2RlbC5pc01vZGVsKGRhdGEpKSB7XG5cdFx0XHRcdHN0YXRlLnBhcmVudCA9IGRhdGEucGFyZW50O1xuXHRcdFx0XHRkYXRhLnBhcmVudCA9IHN0YXRlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhZGQgdG8gdGhlIHN0YWNrIGJlZm9yZSB0aGUgcmVhbCBkYXRhXG5cdFx0XHR0aGlzLmFkZERhdGEoc3RhdGUpO1xuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsID0gc3RhdGU7XG5cdFx0XHR1dGlsLmRlZmluZUNvbXB1dGVkUHJvcGVydHkodGhpcywgXCJzdGF0ZVwiLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc3RhdGVNb2RlbC5kYXRhO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gcXVpY2sgYWNjZXNzIHRvIHRoZSB0b3AgbW9kZWwgZGF0YVxuXHRcdHV0aWwuZGVmaW5lQ29tcHV0ZWRQcm9wZXJ0eSh0aGlzLCBcImRhdGFcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC5kYXRhO1xuXHRcdH0pO1xuXG5cdFx0Ly8gc2V0IHRoZSBwYXNzZWQgaW4gZGF0YVxuXHRcdGlmICh0eXBlb2YgZGF0YSAhPT0gXCJ1bmRlZmluZWRcIikgdGhpcy5hZGREYXRhKGRhdGEsIG9wdGlvbnMpO1xuXG5cdFx0Ly8gaW5pdGlhdGUgbGlrZSBhIG5vcm1hbCBkb20gcmFuZ2Vcblx0XHRET01SYW5nZS5jYWxsKHRoaXMpO1xuXG5cdFx0Ly8gaW5pdGlhbGl6ZSB3aXRoIG9wdGlvbnNcblx0XHR0aGlzLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcblx0fSxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbigpe30sXG5cblx0dXNlOiBmdW5jdGlvbihwKSB7XG5cdFx0cmV0dXJuIFBsdWdpbnMubG9hZFBsdWdpbih0aGlzLCBwLCBfLnRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKSk7XG5cdH0sXG5cblx0Ly8gYWRkcyBkYXRhIHRvIHRoZSBjdXJyZW50IHN0YWNrXG5cdGFkZERhdGE6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRpZiAoIU1vZGVsLmlzTW9kZWwoZGF0YSkpIGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgdGhpcy5tb2RlbCwgb3B0aW9ucyk7XG5cdFx0dGhpcy5tb2RlbCA9IGRhdGE7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gYXR0YWNoICsgbW91bnRcblx0cGFpbnQ6IGZ1bmN0aW9uKHAsIG4sIF9pc01vdmUsIF9pc1JlcGxhY2UpIHtcblx0XHRET01SYW5nZS5wcm90b3R5cGUuYXR0YWNoLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKCEoX2lzTW92ZSB8fCBfaXNSZXBsYWNlIHx8IHRoaXMuaXNNb3VudGVkKCkpKSB0aGlzLm1vdW50KCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gYXV0byBzdG9wIG9uIGRldGFjaFxuXHRkZXRhY2g6IGZ1bmN0aW9uKF9pc1JlcGxhY2UpIHtcblx0XHRpZiAoIV9pc1JlcGxhY2UpIHRoaXMuc3RvcCgpO1xuXHRcdERPTVJhbmdlLnByb3RvdHlwZS5kZXRhY2guYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhdXRvcnVuOiBmdW5jdGlvbihmbiwgb25seU9uQWN0aXZlKSB7XG5cdFx0dmFyIGNvbXAgPSBUcmFja3IuYXV0b3J1bihmbiwgdGhpcyk7XG5cdFx0aWYgKG9ubHlPbkFjdGl2ZSAmJiAhVHJhY2tyLmFjdGl2ZSkgY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIGNvbXA7XG5cdH0sXG5cblx0Ly8gYSBnZW5lcmFsaXplZCByZWFjdGl2ZSB3b3JrZmxvdyBoZWxwZXJcblx0bW91bnQ6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyksIGNvbXA7XG5cblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHQvLyBzdG9wIGV4aXN0aW5nIG1vdW50XG5cdFx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdFx0Ly8gdGhlIGZpcnN0IGV2ZW50IGluIHRoZSBjeWNsZSwgYmVmb3JlIGV2ZXJ5dGhpbmcgZWxzZVxuXHRcdFx0dGhpcy5fbW91bnRpbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnQ6YmVmb3JlXCIsIGFyZ3MpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0Ly8gdGhlIGF1dG9ydW4gY29tcHV0YXRpb25cblx0XHRjb21wID0gdGhpcy5fY29tcCA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHR0aGlzLnJlbmRlci5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlclwiLCBhcmdzLCBjb21wKTtcblxuXHRcdFx0Ly8gYXV0byBjbGVhbiB1cFxuXHRcdFx0Y29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdC8vIHJlbWFpbmluZyBpbnZhbGlkYXRlIGV2ZW50c1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJpbnZhbGlkYXRlXCIsIGFyZ3MsIGNvbXApO1xuXG5cdFx0XHRcdC8vIGRldGVjdCBpZiB0aGUgY29tcHV0YXRpb24gc3RvcHBlZFxuXHRcdFx0XHRpZiAoY29tcC5zdG9wcGVkKSB7XG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyKFwic3RvcFwiLCBhcmdzKTtcblx0XHRcdFx0XHRkZWxldGUgdGhpcy5fY29tcDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyByZW1haW5pbmcgbW91bnQgZXZlbnRzIGhhcHBlbiBhZnRlciB0aGUgZmlyc3QgcmVuZGVyXG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnQ6YWZ0ZXJcIiwgYXJncywgY29tcCk7XG5cdFx0XHRkZWxldGUgdGhpcy5fbW91bnRpbmc7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW5kZXI6IGZ1bmN0aW9uKCl7fSxcblxuXHRpc01vdW50ZWQ6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmlzTW91bnRpbmcoKSB8fCB0aGlzLl9jb21wICE9IG51bGw7XG5cdH0sXG5cblx0aXNNb3VudGluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5fbW91bnRpbmc7XG5cdH0sXG5cblx0Z2V0Q29tcHV0YXRpb246IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9jb21wO1xuXHR9LFxuXG5cdGludmFsaWRhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzTW91bnRlZCgpKSB0aGlzLl9jb21wLmludmFsaWRhdGUoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRvbkludmFsaWRhdGU6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0aWYgKHRoaXMuaXNNb3VudGVkKCkpIHRoaXMuX2NvbXAub25JbnZhbGlkYXRlKGZuKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRzdG9wOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc01vdW50ZWQoKSkgdGhpcy5fY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxufSk7XG5cbi8vIGNoYWluYWJsZSBtZXRob2RzIHRvIHByb3h5IHRvIG1vZGVsXG5bIFwicmVnaXN0ZXJQcm94eVwiIF1cbi5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuXHRWaWV3LnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5tb2RlbFttZXRob2RdLmFwcGx5KHRoaXMubW9kZWwsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn0pO1xuXG4vLyBtZXRob2RzIHRvIHByb3h5IHRvIG1vZGVsIHdoaWNoIGRvbid0IHJldHVybiB0aGlzXG5bIFwic2V0XCIsIFwiZ2V0XCIsIFwiZ2V0TG9jYWxcIiwgXCJnZXRQcm94eUJ5VmFsdWVcIiwgXCJnZXRNb2RlbEF0T2Zmc2V0XCIsXG4gIFwiZ2V0Um9vdE1vZGVsXCIsIFwiZmluZE1vZGVsXCIsIFwiZ2V0Q29udGFpbmVyVmFsdWVcIiwgXCJnZXRBbGxNb2RlbHNcIlxuXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuXHRWaWV3LnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxbbWV0aG9kXS5hcHBseSh0aGlzLm1vZGVsLCBhcmd1bWVudHMpO1xuXHR9XG59KTsiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IHRydWU7XG4gICAgdmFyIGN1cnJlbnRRdWV1ZTtcbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgdmFyIGkgPSAtMTtcbiAgICAgICAgd2hpbGUgKCsraSA8IGxlbikge1xuICAgICAgICAgICAgY3VycmVudFF1ZXVlW2ldKCk7XG4gICAgICAgIH1cbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xufVxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICBxdWV1ZS5wdXNoKGZ1bik7XG4gICAgaWYgKCFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iL2QwN2ZmOGU5OWNmZGUyMWNmMTEzZGExM2QzNWQzODdiMGVkMzA5YTMvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vKipcbiAqIEBuYW1lc3BhY2UgVHJhY2tyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja3ItcmVsYXRlZCBtZXRob2RzLlxuICovXG52YXIgVHJhY2tyID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hY3RpdmVcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoZXJlIGlzIGEgY3VycmVudCBjb21wdXRhdGlvbiwgbWVhbmluZyB0aGF0IGRlcGVuZGVuY2llcyBvbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgd2lsbCBiZSB0cmFja2VkIGFuZCBwb3RlbnRpYWxseSBjYXVzZSB0aGUgY3VycmVudCBjb21wdXRhdGlvbiB0byBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtCb29sZWFufVxuICovXG5UcmFja3IuYWN0aXZlID0gZmFsc2U7XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY3VycmVudGNvbXB1dGF0aW9uXG5cbi8qKlxuICogQHN1bW1hcnkgVGhlIGN1cnJlbnQgY29tcHV0YXRpb24sIG9yIGBudWxsYCBpZiB0aGVyZSBpc24ndCBvbmUuICBUaGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyB0aGUgW2BUcmFja3IuQ29tcHV0YXRpb25gXSgjdHJhY2tlcl9jb21wdXRhdGlvbikgb2JqZWN0IGNyZWF0ZWQgYnkgdGhlIGlubmVybW9zdCBhY3RpdmUgY2FsbCB0byBgVHJhY2tyLmF1dG9ydW5gLCBhbmQgaXQncyB0aGUgY29tcHV0YXRpb24gdGhhdCBnYWlucyBkZXBlbmRlbmNpZXMgd2hlbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYXJlIGFjY2Vzc2VkLlxuICogQGxvY3VzIENsaWVudFxuICogQHR5cGUge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IG51bGw7XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gYztcblx0VHJhY2tyLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG52YXIgX2RlYnVnRnVuYyA9IGZ1bmN0aW9uICgpIHtcblx0Ly8gV2Ugd2FudCB0aGlzIGNvZGUgdG8gd29yayB3aXRob3V0IE1ldGVvciwgYW5kIGFsc28gd2l0aG91dFxuXHQvLyBcImNvbnNvbGVcIiAod2hpY2ggaXMgdGVjaG5pY2FsbHkgbm9uLXN0YW5kYXJkIGFuZCBtYXkgYmUgbWlzc2luZ1xuXHQvLyBvbiBzb21lIGJyb3dzZXIgd2UgY29tZSBhY3Jvc3MsIGxpa2UgaXQgd2FzIG9uIElFIDcpLlxuXHQvL1xuXHQvLyBMYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5Lig/Pylcblx0cmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG5cdFx0XHRcdFx0KCh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5sb2cgP1xuXHRcdFx0XHRcdCBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuXHRcdFx0XHRcdCBmdW5jdGlvbiAoKSB7fSkpO1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcblx0aWYgKHRocm93Rmlyc3RFcnJvcikge1xuXHRcdHRocm93IGU7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIG1lc3NhZ2VBbmRTdGFjaztcblx0XHRpZiAoZS5zdGFjayAmJiBlLm1lc3NhZ2UpIHtcblx0XHRcdHZhciBpZHggPSBlLnN0YWNrLmluZGV4T2YoZS5tZXNzYWdlKTtcblx0XHRcdGlmIChpZHggPj0gMCAmJiBpZHggPD0gMTApIC8vIGFsbG93IGZvciBcIkVycm9yOiBcIiAoYXQgbGVhc3QgNylcblx0XHRcdFx0bWVzc2FnZUFuZFN0YWNrID0gZS5zdGFjazsgLy8gbWVzc2FnZSBpcyBwYXJ0IG9mIGUuc3RhY2ssIGFzIGluIENocm9tZVxuXHRcdFx0ZWxzZVxuXHRcdFx0XHRtZXNzYWdlQW5kU3RhY2sgPSBlLm1lc3NhZ2UgK1xuXHRcdFx0XHQoZS5zdGFjay5jaGFyQXQoMCkgPT09ICdcXG4nID8gJycgOiAnXFxuJykgKyBlLnN0YWNrOyAvLyBlLmcuIFNhZmFyaVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlQW5kU3RhY2sgPSBlLnN0YWNrIHx8IGUubWVzc2FnZTtcblx0XHR9XG5cdFx0X2RlYnVnRnVuYygpKFwiRXhjZXB0aW9uIGZyb20gVHJhY2tyIFwiICsgZnJvbSArIFwiIGZ1bmN0aW9uOlwiLFxuXHRcdFx0XHRcdFx0XHRcdCBtZXNzYWdlQW5kU3RhY2spO1xuXHR9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcblx0aWYgKCh0eXBlb2YgTWV0ZW9yID09PSAndW5kZWZpbmVkJykgfHwgTWV0ZW9yLmlzQ2xpZW50KSB7XG5cdFx0cmV0dXJuIGY7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdFx0TWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRmLmFwcGx5KG51bGwsIGFyZ3MpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxufTtcblxudmFyIG5leHRJZCA9IDE7XG4vLyBjb21wdXRhdGlvbnMgd2hvc2UgY2FsbGJhY2tzIHdlIHNob3VsZCBjYWxsIGF0IGZsdXNoIHRpbWVcbnZhciBwZW5kaW5nQ29tcHV0YXRpb25zID0gW107XG4vLyBgdHJ1ZWAgaWYgYSBUcmFja3IuZmx1c2ggaXMgc2NoZWR1bGVkLCBvciBpZiB3ZSBhcmUgaW4gVHJhY2tyLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgaW5GbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lXG4vLyBvciByZWNvbXB1dGUuICBUaGlzIG1hdGNoZXMgVHJhY2tyLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZVxuLy8gVHJhY2tyLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBUcmFja3IuZmx1c2ggdGhhdCB3ZSBhcmUgaW4uIFdoZW4gc2V0LCB0aHJvdyByYXRoZXIgdGhhbiBsb2cgdGhlXG4vLyBmaXJzdCBlcnJvciBlbmNvdW50ZXJlZCB3aGlsZSBmbHVzaGluZy4gQmVmb3JlIHRocm93aW5nIHRoZSBlcnJvcixcbi8vIGZpbmlzaCBmbHVzaGluZyAoZnJvbSBhIGZpbmFsbHkgYmxvY2spLCBsb2dnaW5nIGFueSBzdWJzZXF1ZW50XG4vLyBlcnJvcnMuXG52YXIgdGhyb3dGaXJzdEVycm9yID0gZmFsc2U7XG5cbnZhciBhZnRlckZsdXNoQ2FsbGJhY2tzID0gW107XG5cbi8vIGxvb2sgZm9yIGEgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGFzIHRoYXQgaXMgcHJlZmVyYWJsZSBvdmVyIG5leHRUaWNrIG9yIHNldEltbWVkaWF0ZVxudmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgP1xuXHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG5cdHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcblx0d2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuXHR3aW5kb3cub1JlcXVlc3RBbmltYXRpb25GcmFtZSA6XG5cdG51bGw7XG5cbi8vIGNvbnRyb2xzIHRoZSBkZWZlcnJhbFxuVHJhY2tyLm5leHRUaWNrID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lICE9IG51bGwgPyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUuYmluZCh3aW5kb3cpIDpcblx0dHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgPyBwcm9jZXNzLm5leHRUaWNrIDpcblx0ZnVuY3Rpb24gKGYpIHsgc2V0VGltZW91dChmLCAxNik7IH07XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG5cdGlmICghIHdpbGxGbHVzaCkge1xuXHRcdFRyYWNrci5uZXh0VGljayhUcmFja3IuZmx1c2gpO1xuXHRcdHdpbGxGbHVzaCA9IHRydWU7XG5cdH1cbn07XG5cbi8vIFRyYWNrci5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyB2aXNpYmxlIGJ1dCBwcml2YXRlXG4vLyAodGhyb3dzIGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gY2FsbCBpdClcbnZhciBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9jb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IEEgQ29tcHV0YXRpb24gb2JqZWN0IHJlcHJlc2VudHMgY29kZSB0aGF0IGlzIHJlcGVhdGVkbHkgcmVydW5cbiAqIGluIHJlc3BvbnNlIHRvXG4gKiByZWFjdGl2ZSBkYXRhIGNoYW5nZXMuIENvbXB1dGF0aW9ucyBkb24ndCBoYXZlIHJldHVybiB2YWx1ZXM7IHRoZXkganVzdFxuICogcGVyZm9ybSBhY3Rpb25zLCBzdWNoIGFzIHJlcmVuZGVyaW5nIGEgdGVtcGxhdGUgb24gdGhlIHNjcmVlbi4gQ29tcHV0YXRpb25zXG4gKiBhcmUgY3JlYXRlZCB1c2luZyBUcmFja3IuYXV0b3J1bi4gVXNlIHN0b3AgdG8gcHJldmVudCBmdXJ0aGVyIHJlcnVubmluZyBvZiBhXG4gKiBjb21wdXRhdGlvbi5cbiAqIEBpbnN0YW5jZW5hbWUgY29tcHV0YXRpb25cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGYsIHBhcmVudCwgY3R4KSB7XG5cdGlmICghIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uKVxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFwiVHJhY2tyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBUcmFja3IuYXV0b3J1blwiKTtcblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cblx0ICogQGxvY3VzIENsaWVudFxuXHQgKiBAbWVtYmVyT2YgVHJhY2tyLkNvbXB1dGF0aW9uXG5cdCAqIEBpbnN0YW5jZVxuXHQgKiBAbmFtZSAgc3RvcHBlZFxuXHQgKi9cblx0c2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIGludmFsaWRhdGVkXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrci5hdXRvcnVuYCBpcyBjYWxsZWQsIGFuZCBmYWxzZSBvbiBzdWJzZXF1ZW50IHJlcnVucyBhbmQgYXQgb3RoZXIgdGltZXMuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIGZpcnN0UnVuXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5maXJzdFJ1biA9IHRydWU7XG5cblx0c2VsZi5faWQgPSBuZXh0SWQrKztcblx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG5cdC8vIHRoZSBwbGFuIGlzIGF0IHNvbWUgcG9pbnQgdG8gdXNlIHRoZSBwYXJlbnQgcmVsYXRpb25cblx0Ly8gdG8gY29uc3RyYWluIHRoZSBvcmRlciB0aGF0IGNvbXB1dGF0aW9ucyBhcmUgcHJvY2Vzc2VkXG5cdHNlbGYuX3BhcmVudCA9IHBhcmVudDtcblx0c2VsZi5fZnVuYyA9IGY7XG5cdHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cdHNlbGYuX2NvbnRleHQgPSBjdHggfHwgbnVsbDtcblxuXHR2YXIgZXJyb3JlZCA9IHRydWU7XG5cdHRyeSB7XG5cdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdGVycm9yZWQgPSBmYWxzZTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0aWYgKGVycm9yZWQpXG5cdFx0XHRzZWxmLnN0b3AoKTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLiAgVGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gaW52YWxpZGF0aW9uLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBpbnZhbGlkYXRlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCAhPT0gdm9pZCAwID8gY3R4IDogc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlcyB0aGlzIGNvbXB1dGF0aW9uIHNvIHRoYXQgaXQgd2lsbCBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHQvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG5cdFx0Ly8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG5cdFx0aWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcblx0XHRcdHJlcXVpcmVGbHVzaCgpO1xuXHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuXHRcdH1cblxuXHRcdHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2Vcblx0XHQvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4ICE9PSB2b2lkIDAgPyBmLmN0eCA6IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5cbi8qKlxuICogQHN1bW1hcnkgUHJldmVudHMgdGhpcyBjb21wdXRhdGlvbiBmcm9tIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoISB0aGlzLnN0b3BwZWQpIHtcblx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXHRcdHRoaXMuaW52YWxpZGF0ZSgpO1xuXHR9XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG5cdHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcblx0aW5Db21wdXRlID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0XHRpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fcmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0c2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuXHR0cnkge1xuXHRcdHdoaWxlIChzZWxmLmludmFsaWRhdGVkICYmICEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZWxmLl9jb21wdXRlKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgX2NvbXB1dGUoKSBpbnZhbGlkYXRlZCB1cywgd2UgcnVuIGFnYWluIGltbWVkaWF0ZWx5LlxuXHRcdFx0Ly8gQSBjb21wdXRhdGlvbiB0aGF0IGludmFsaWRhdGVzIGl0c2VsZiBpbmRlZmluaXRlbHkgaXMgYW5cblx0XHRcdC8vIGluZmluaXRlIGxvb3AsIG9mIGNvdXJzZS5cblx0XHRcdC8vXG5cdFx0XHQvLyBXZSBjb3VsZCBwdXQgYW4gaXRlcmF0aW9uIGNvdW50ZXIgaGVyZSBhbmQgY2F0Y2ggcnVuLWF3YXlcblx0XHRcdC8vIGxvb3BzLlxuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHR9XG59O1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9kZXBlbmRlbmN5XG5cbi8qKlxuICogQHN1bW1hcnkgQSBEZXBlbmRlbmN5IHJlcHJlc2VudHMgYW4gYXRvbWljIHVuaXQgb2YgcmVhY3RpdmUgZGF0YSB0aGF0IGFcbiAqIGNvbXB1dGF0aW9uIG1pZ2h0IGRlcGVuZCBvbi4gUmVhY3RpdmUgZGF0YSBzb3VyY2VzIHN1Y2ggYXMgU2Vzc2lvbiBvclxuICogTWluaW1vbmdvIGludGVybmFsbHkgY3JlYXRlIGRpZmZlcmVudCBEZXBlbmRlbmN5IG9iamVjdHMgZm9yIGRpZmZlcmVudFxuICogcGllY2VzIG9mIGRhdGEsIGVhY2ggb2Ygd2hpY2ggbWF5IGJlIGRlcGVuZGVkIG9uIGJ5IG11bHRpcGxlIGNvbXB1dGF0aW9ucy5cbiAqIFdoZW4gdGhlIGRhdGEgY2hhbmdlcywgdGhlIGNvbXB1dGF0aW9ucyBhcmUgaW52YWxpZGF0ZWQuXG4gKiBAY2xhc3NcbiAqIEBpbnN0YW5jZU5hbWUgZGVwZW5kZW5jeVxuICovXG5UcmFja3IuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4vL1xuLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4vLyBwcmVzZW50LiAgUmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4vLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbi8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cblxuLyoqXG4gKiBAc3VtbWFyeSBEZWNsYXJlcyB0aGF0IHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIChvciBgZnJvbUNvbXB1dGF0aW9uYCBpZiBnaXZlbikgZGVwZW5kcyBvbiBgZGVwZW5kZW5jeWAuICBUaGUgY29tcHV0YXRpb24gd2lsbCBiZSBpbnZhbGlkYXRlZCB0aGUgbmV4dCB0aW1lIGBkZXBlbmRlbmN5YCBjaGFuZ2VzLlxuXG5JZiB0aGVyZSBpcyBubyBjdXJyZW50IGNvbXB1dGF0aW9uIGFuZCBgZGVwZW5kKClgIGlzIGNhbGxlZCB3aXRoIG5vIGFyZ3VtZW50cywgaXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zIGZhbHNlLlxuXG5SZXR1cm5zIHRydWUgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGEgbmV3IGRlcGVuZGVudCBvZiBgZGVwZW5kZW5jeWAgcmF0aGVyIHRoYW4gYW4gZXhpc3Rpbmcgb25lLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb259IFtmcm9tQ29tcHV0YXRpb25dIEFuIG9wdGlvbmFsIGNvbXB1dGF0aW9uIGRlY2xhcmVkIHRvIGRlcGVuZCBvbiBgZGVwZW5kZW5jeWAgaW5zdGVhZCBvZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbi5cbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24gKGNvbXB1dGF0aW9uKSB7XG5cdGlmICghIGNvbXB1dGF0aW9uKSB7XG5cdFx0aWYgKCEgVHJhY2tyLmFjdGl2ZSlcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdGNvbXB1dGF0aW9uID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0fVxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcblx0aWYgKCEgKGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKSkge1xuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXSA9IGNvbXB1dGF0aW9uO1xuXHRcdGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRkZWxldGUgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfY2hhbmdlZFxuXG4vKipcbiAqIEBzdW1tYXJ5IEludmFsaWRhdGUgYWxsIGRlcGVuZGVudCBjb21wdXRhdGlvbnMgaW1tZWRpYXRlbHkgYW5kIHJlbW92ZSB0aGVtIGFzIGRlcGVuZGVudHMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvciAodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2hhc2RlcGVuZGVudHNcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgRGVwZW5kZW5jeSBoYXMgb25lIG9yIG1vcmUgZGVwZW5kZW50IENvbXB1dGF0aW9ucywgd2hpY2ggd291bGQgYmUgaW52YWxpZGF0ZWQgaWYgdGhpcyBEZXBlbmRlbmN5IHdlcmUgdG8gY2hhbmdlLlxuICogQGxvY3VzIENsaWVudFxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5oYXNEZXBlbmRlbnRzID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0cmV0dXJuIHRydWU7XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZmx1c2hcblxuLyoqXG4gKiBAc3VtbWFyeSBQcm9jZXNzIGFsbCByZWFjdGl2ZSB1cGRhdGVzIGltbWVkaWF0ZWx5IGFuZCBlbnN1cmUgdGhhdCBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGFyZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLmZsdXNoID0gZnVuY3Rpb24gKF9vcHRzKSB7XG5cdC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuXHQvLyBoYXZlIFNwYXJrKVxuXHQvL1xuXHQvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuXHQvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG5cdC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tyLmZsdXNoLiAgQXQgdGhlIG1vbWVudFxuXHQvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG5cdC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLiAgQW5kIHdlIGRvbid0IGhhdmVcblx0Ly8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG5cdC8vXG5cdC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcblx0aWYgKGluRmx1c2gpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja3IuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cblx0aWYgKGluQ29tcHV0ZSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tyLmF1dG9ydW5cIik7XG5cblx0aW5GbHVzaCA9IHRydWU7XG5cdHdpbGxGbHVzaCA9IHRydWU7XG5cdHRocm93Rmlyc3RFcnJvciA9ICEhIChfb3B0cyAmJiBfb3B0cy5fdGhyb3dGaXJzdEVycm9yKTtcblxuXHR2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcblx0XHRcdFx0XHQgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuXHRcdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHRjb21wLl9yZWNvbXB1dGUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuXHRcdFx0XHQvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG5cdFx0XHRcdHZhciBjYiA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjYi5mbi5jYWxsKGNiLmN0eCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRfdGhyb3dPckxvZyhcImFmdGVyRmx1c2hcIiwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmICghIGZpbmlzaGVkVHJ5KSB7XG5cdFx0XHQvLyB3ZSdyZSBlcnJvcmluZ1xuXHRcdFx0aW5GbHVzaCA9IGZhbHNlOyAvLyBuZWVkZWQgYmVmb3JlIGNhbGxpbmcgYFRyYWNrci5mbHVzaCgpYCBhZ2FpblxuXHRcdFx0VHJhY2tyLmZsdXNoKHtfdGhyb3dGaXJzdEVycm9yOiBmYWxzZX0pOyAvLyBmaW5pc2ggZmx1c2hpbmdcblx0XHR9XG5cdFx0d2lsbEZsdXNoID0gZmFsc2U7XG5cdFx0aW5GbHVzaCA9IGZhbHNlO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2F1dG9ydW5cbi8vXG4vLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4vLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuLy9cbi8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4vL1xuLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4vLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gbm93IGFuZCByZXJ1biBpdCBsYXRlciB3aGVuZXZlciBpdHMgZGVwZW5kZW5jaWVzIGNoYW5nZS4gUmV0dXJucyBhIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IGNhbiBiZSB1c2VkIHRvIHN0b3Agb3Igb2JzZXJ2ZSB0aGUgcmVydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlcyBvbmUgYXJndW1lbnQ6IHRoZSBDb21wdXRhdGlvbiBvYmplY3QgdGhhdCB3aWxsIGJlIHJldHVybmVkLlxuICogQHJldHVybnMge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyYWNrci5hdXRvcnVuIHJlcXVpcmVzIGEgZnVuY3Rpb24gYXJndW1lbnQnKTtcblxuXHRjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IHRydWU7XG5cdHZhciBjID0gbmV3IFRyYWNrci5Db21wdXRhdGlvbihmLCBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLCBjdHgpO1xuXG5cdGlmIChUcmFja3IuYWN0aXZlKVxuXHRcdFRyYWNrci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuXHRcdFx0Yy5zdG9wKCk7XG5cdFx0fSk7XG5cblx0cmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuICBVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIHdpdGhvdXQgdHJhY2tpbmcgZGVwZW5kZW5jaWVzLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBBIGZ1bmN0aW9uIHRvIGNhbGwgaW1tZWRpYXRlbHkuXG4gKi9cblRyYWNrci5ub25SZWFjdGl2ZSA9IFxuVHJhY2tyLm5vbnJlYWN0aXZlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24obnVsbCk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGYuY2FsbChjdHgpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG5cdH1cbn07XG5cbi8vIGxpa2Ugbm9ucmVhY3RpdmUgYnV0IG1ha2VzIGEgZnVuY3Rpb24gaW5zdGVhZFxuVHJhY2tyLm5vblJlYWN0YWJsZSA9IFxuVHJhY2tyLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGYuYXBwbHkoY3R4LCBhcmdzKTtcblx0XHR9KTtcblx0fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IFtgb25JbnZhbGlkYXRlYF0oI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZSkgY2FsbGJhY2sgb24gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKHdoaWNoIG11c3QgZXhpc3QpLCB0byBiZSBjYWxsZWQgaW1tZWRpYXRlbHkgd2hlbiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZCBvciBzdG9wcGVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgaW52b2tlZCBhcyBgZnVuYyhjKWAsIHdoZXJlIGBjYCBpcyB0aGUgY29tcHV0YXRpb24gb24gd2hpY2ggdGhlIGNhbGxiYWNrIGlzIHJlZ2lzdGVyZWQuXG4gKi9cblRyYWNrci5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVHJhY2tyLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hZnRlcmZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgU2NoZWR1bGVzIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGR1cmluZyB0aGUgbmV4dCBmbHVzaCwgb3IgbGF0ZXIgaW4gdGhlIGN1cnJlbnQgZmx1c2ggaWYgb25lIGlzIGluIHByb2dyZXNzLCBhZnRlciBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGhhdmUgYmVlbiByZXJ1bi4gIFRoZSBmdW5jdGlvbiB3aWxsIGJlIHJ1biBvbmNlIGFuZCBub3Qgb24gc3Vic2VxdWVudCBmbHVzaGVzIHVubGVzcyBgYWZ0ZXJGbHVzaGAgaXMgY2FsbGVkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBjYWxsIGF0IGZsdXNoIHRpbWUuXG4gKi9cblRyYWNrci5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdHJlcXVpcmVGbHVzaCgpO1xufTsiLCIvLyAgICAgVW5kZXJzY29yZS5qcyAxLjguMlxuLy8gICAgIGh0dHA6Ly91bmRlcnNjb3JlanMub3JnXG4vLyAgICAgKGMpIDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuLy8gICAgIFVuZGVyc2NvcmUgbWF5IGJlIGZyZWVseSBkaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG5cbihmdW5jdGlvbigpIHtcblxuICAvLyBCYXNlbGluZSBzZXR1cFxuICAvLyAtLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEVzdGFibGlzaCB0aGUgcm9vdCBvYmplY3QsIGB3aW5kb3dgIGluIHRoZSBicm93c2VyLCBvciBgZXhwb3J0c2Agb24gdGhlIHNlcnZlci5cbiAgdmFyIHJvb3QgPSB0aGlzO1xuXG4gIC8vIFNhdmUgdGhlIHByZXZpb3VzIHZhbHVlIG9mIHRoZSBgX2AgdmFyaWFibGUuXG4gIHZhciBwcmV2aW91c1VuZGVyc2NvcmUgPSByb290Ll87XG5cbiAgLy8gU2F2ZSBieXRlcyBpbiB0aGUgbWluaWZpZWQgKGJ1dCBub3QgZ3ppcHBlZCkgdmVyc2lvbjpcbiAgdmFyIEFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGUsIE9ialByb3RvID0gT2JqZWN0LnByb3RvdHlwZSwgRnVuY1Byb3RvID0gRnVuY3Rpb24ucHJvdG90eXBlO1xuXG4gIC8vIENyZWF0ZSBxdWljayByZWZlcmVuY2UgdmFyaWFibGVzIGZvciBzcGVlZCBhY2Nlc3MgdG8gY29yZSBwcm90b3R5cGVzLlxuICB2YXJcbiAgICBwdXNoICAgICAgICAgICAgID0gQXJyYXlQcm90by5wdXNoLFxuICAgIHNsaWNlICAgICAgICAgICAgPSBBcnJheVByb3RvLnNsaWNlLFxuICAgIHRvU3RyaW5nICAgICAgICAgPSBPYmpQcm90by50b1N0cmluZyxcbiAgICBoYXNPd25Qcm9wZXJ0eSAgID0gT2JqUHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbiAgLy8gQWxsICoqRUNNQVNjcmlwdCA1KiogbmF0aXZlIGZ1bmN0aW9uIGltcGxlbWVudGF0aW9ucyB0aGF0IHdlIGhvcGUgdG8gdXNlXG4gIC8vIGFyZSBkZWNsYXJlZCBoZXJlLlxuICB2YXJcbiAgICBuYXRpdmVJc0FycmF5ICAgICAgPSBBcnJheS5pc0FycmF5LFxuICAgIG5hdGl2ZUtleXMgICAgICAgICA9IE9iamVjdC5rZXlzLFxuICAgIG5hdGl2ZUJpbmQgICAgICAgICA9IEZ1bmNQcm90by5iaW5kLFxuICAgIG5hdGl2ZUNyZWF0ZSAgICAgICA9IE9iamVjdC5jcmVhdGU7XG5cbiAgLy8gTmFrZWQgZnVuY3Rpb24gcmVmZXJlbmNlIGZvciBzdXJyb2dhdGUtcHJvdG90eXBlLXN3YXBwaW5nLlxuICB2YXIgQ3RvciA9IGZ1bmN0aW9uKCl7fTtcblxuICAvLyBDcmVhdGUgYSBzYWZlIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yIHVzZSBiZWxvdy5cbiAgdmFyIF8gPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqIGluc3RhbmNlb2YgXykgcmV0dXJuIG9iajtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgXykpIHJldHVybiBuZXcgXyhvYmopO1xuICAgIHRoaXMuX3dyYXBwZWQgPSBvYmo7XG4gIH07XG5cbiAgLy8gRXhwb3J0IHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgKipOb2RlLmpzKiosIHdpdGhcbiAgLy8gYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgZm9yIHRoZSBvbGQgYHJlcXVpcmUoKWAgQVBJLiBJZiB3ZSdyZSBpblxuICAvLyB0aGUgYnJvd3NlciwgYWRkIGBfYCBhcyBhIGdsb2JhbCBvYmplY3QuXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IF87XG4gICAgfVxuICAgIGV4cG9ydHMuXyA9IF87XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5fID0gXztcbiAgfVxuXG4gIC8vIEN1cnJlbnQgdmVyc2lvbi5cbiAgXy5WRVJTSU9OID0gJzEuOC4yJztcblxuICAvLyBJbnRlcm5hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gZWZmaWNpZW50IChmb3IgY3VycmVudCBlbmdpbmVzKSB2ZXJzaW9uXG4gIC8vIG9mIHRoZSBwYXNzZWQtaW4gY2FsbGJhY2ssIHRvIGJlIHJlcGVhdGVkbHkgYXBwbGllZCBpbiBvdGhlciBVbmRlcnNjb3JlXG4gIC8vIGZ1bmN0aW9ucy5cbiAgdmFyIG9wdGltaXplQ2IgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0LCBhcmdDb3VudCkge1xuICAgIGlmIChjb250ZXh0ID09PSB2b2lkIDApIHJldHVybiBmdW5jO1xuICAgIHN3aXRjaCAoYXJnQ291bnQgPT0gbnVsbCA/IDMgOiBhcmdDb3VudCkge1xuICAgICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSk7XG4gICAgICB9O1xuICAgICAgY2FzZSAyOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIG90aGVyKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIG90aGVyKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDM6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgICAgfTtcbiAgICAgIGNhc2UgNDogcmV0dXJuIGZ1bmN0aW9uKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCBhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBBIG1vc3RseS1pbnRlcm5hbCBmdW5jdGlvbiB0byBnZW5lcmF0ZSBjYWxsYmFja3MgdGhhdCBjYW4gYmUgYXBwbGllZFxuICAvLyB0byBlYWNoIGVsZW1lbnQgaW4gYSBjb2xsZWN0aW9uLCByZXR1cm5pbmcgdGhlIGRlc2lyZWQgcmVzdWx0IOKAlCBlaXRoZXJcbiAgLy8gaWRlbnRpdHksIGFuIGFyYml0cmFyeSBjYWxsYmFjaywgYSBwcm9wZXJ0eSBtYXRjaGVyLCBvciBhIHByb3BlcnR5IGFjY2Vzc29yLlxuICB2YXIgY2IgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCwgYXJnQ291bnQpIHtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkgcmV0dXJuIF8uaWRlbnRpdHk7XG4gICAgaWYgKF8uaXNGdW5jdGlvbih2YWx1ZSkpIHJldHVybiBvcHRpbWl6ZUNiKHZhbHVlLCBjb250ZXh0LCBhcmdDb3VudCk7XG4gICAgaWYgKF8uaXNPYmplY3QodmFsdWUpKSByZXR1cm4gXy5tYXRjaGVyKHZhbHVlKTtcbiAgICByZXR1cm4gXy5wcm9wZXJ0eSh2YWx1ZSk7XG4gIH07XG4gIF8uaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBjYih2YWx1ZSwgY29udGV4dCwgSW5maW5pdHkpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhc3NpZ25lciBmdW5jdGlvbnMuXG4gIHZhciBjcmVhdGVBc3NpZ25lciA9IGZ1bmN0aW9uKGtleXNGdW5jLCB1bmRlZmluZWRPbmx5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICBpZiAobGVuZ3RoIDwgMiB8fCBvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMTsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpbmRleF0sXG4gICAgICAgICAgICBrZXlzID0ga2V5c0Z1bmMoc291cmNlKSxcbiAgICAgICAgICAgIGwgPSBrZXlzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICBpZiAoIXVuZGVmaW5lZE9ubHkgfHwgb2JqW2tleV0gPT09IHZvaWQgMCkgb2JqW2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhIG5ldyBvYmplY3QgdGhhdCBpbmhlcml0cyBmcm9tIGFub3RoZXIuXG4gIHZhciBiYXNlQ3JlYXRlID0gZnVuY3Rpb24ocHJvdG90eXBlKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KHByb3RvdHlwZSkpIHJldHVybiB7fTtcbiAgICBpZiAobmF0aXZlQ3JlYXRlKSByZXR1cm4gbmF0aXZlQ3JlYXRlKHByb3RvdHlwZSk7XG4gICAgQ3Rvci5wcm90b3R5cGUgPSBwcm90b3R5cGU7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBDdG9yO1xuICAgIEN0b3IucHJvdG90eXBlID0gbnVsbDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIEhlbHBlciBmb3IgY29sbGVjdGlvbiBtZXRob2RzIHRvIGRldGVybWluZSB3aGV0aGVyIGEgY29sbGVjdGlvblxuICAvLyBzaG91bGQgYmUgaXRlcmF0ZWQgYXMgYW4gYXJyYXkgb3IgYXMgYW4gb2JqZWN0XG4gIC8vIFJlbGF0ZWQ6IGh0dHA6Ly9wZW9wbGUubW96aWxsYS5vcmcvfmpvcmVuZG9yZmYvZXM2LWRyYWZ0Lmh0bWwjc2VjLXRvbGVuZ3RoXG4gIHZhciBNQVhfQVJSQVlfSU5ERVggPSBNYXRoLnBvdygyLCA1MykgLSAxO1xuICB2YXIgaXNBcnJheUxpa2UgPSBmdW5jdGlvbihjb2xsZWN0aW9uKSB7XG4gICAgdmFyIGxlbmd0aCA9IGNvbGxlY3Rpb24gJiYgY29sbGVjdGlvbi5sZW5ndGg7XG4gICAgcmV0dXJuIHR5cGVvZiBsZW5ndGggPT0gJ251bWJlcicgJiYgbGVuZ3RoID49IDAgJiYgbGVuZ3RoIDw9IE1BWF9BUlJBWV9JTkRFWDtcbiAgfTtcblxuICAvLyBDb2xsZWN0aW9uIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFRoZSBjb3JuZXJzdG9uZSwgYW4gYGVhY2hgIGltcGxlbWVudGF0aW9uLCBha2EgYGZvckVhY2hgLlxuICAvLyBIYW5kbGVzIHJhdyBvYmplY3RzIGluIGFkZGl0aW9uIHRvIGFycmF5LWxpa2VzLiBUcmVhdHMgYWxsXG4gIC8vIHNwYXJzZSBhcnJheS1saWtlcyBhcyBpZiB0aGV5IHdlcmUgZGVuc2UuXG4gIF8uZWFjaCA9IF8uZm9yRWFjaCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBpLCBsZW5ndGg7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHtcbiAgICAgIGZvciAoaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpdGVyYXRlZShvYmpbaV0sIGksIG9iaik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgICBmb3IgKGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGl0ZXJhdGVlKG9ialtrZXlzW2ldXSwga2V5c1tpXSwgb2JqKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIHJlc3VsdHMgb2YgYXBwbHlpbmcgdGhlIGl0ZXJhdGVlIHRvIGVhY2ggZWxlbWVudC5cbiAgXy5tYXAgPSBfLmNvbGxlY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGgsXG4gICAgICAgIHJlc3VsdHMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICByZXN1bHRzW2luZGV4XSA9IGl0ZXJhdGVlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgcmVkdWNpbmcgZnVuY3Rpb24gaXRlcmF0aW5nIGxlZnQgb3IgcmlnaHQuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlZHVjZShkaXIpIHtcbiAgICAvLyBPcHRpbWl6ZWQgaXRlcmF0b3IgZnVuY3Rpb24gYXMgdXNpbmcgYXJndW1lbnRzLmxlbmd0aFxuICAgIC8vIGluIHRoZSBtYWluIGZ1bmN0aW9uIHdpbGwgZGVvcHRpbWl6ZSB0aGUsIHNlZSAjMTk5MS5cbiAgICBmdW5jdGlvbiBpdGVyYXRvcihvYmosIGl0ZXJhdGVlLCBtZW1vLCBrZXlzLCBpbmRleCwgbGVuZ3RoKSB7XG4gICAgICBmb3IgKDsgaW5kZXggPj0gMCAmJiBpbmRleCA8IGxlbmd0aDsgaW5kZXggKz0gZGlyKSB7XG4gICAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICAgIG1lbW8gPSBpdGVyYXRlZShtZW1vLCBvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgICB9XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgbWVtbywgY29udGV4dCkge1xuICAgICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0LCA0KTtcbiAgICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGgsXG4gICAgICAgICAgaW5kZXggPSBkaXIgPiAwID8gMCA6IGxlbmd0aCAtIDE7XG4gICAgICAvLyBEZXRlcm1pbmUgdGhlIGluaXRpYWwgdmFsdWUgaWYgbm9uZSBpcyBwcm92aWRlZC5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMykge1xuICAgICAgICBtZW1vID0gb2JqW2tleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4XTtcbiAgICAgICAgaW5kZXggKz0gZGlyO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGl0ZXJhdG9yKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGtleXMsIGluZGV4LCBsZW5ndGgpO1xuICAgIH07XG4gIH1cblxuICAvLyAqKlJlZHVjZSoqIGJ1aWxkcyB1cCBhIHNpbmdsZSByZXN1bHQgZnJvbSBhIGxpc3Qgb2YgdmFsdWVzLCBha2EgYGluamVjdGAsXG4gIC8vIG9yIGBmb2xkbGAuXG4gIF8ucmVkdWNlID0gXy5mb2xkbCA9IF8uaW5qZWN0ID0gY3JlYXRlUmVkdWNlKDEpO1xuXG4gIC8vIFRoZSByaWdodC1hc3NvY2lhdGl2ZSB2ZXJzaW9uIG9mIHJlZHVjZSwgYWxzbyBrbm93biBhcyBgZm9sZHJgLlxuICBfLnJlZHVjZVJpZ2h0ID0gXy5mb2xkciA9IGNyZWF0ZVJlZHVjZSgtMSk7XG5cbiAgLy8gUmV0dXJuIHRoZSBmaXJzdCB2YWx1ZSB3aGljaCBwYXNzZXMgYSB0cnV0aCB0ZXN0LiBBbGlhc2VkIGFzIGBkZXRlY3RgLlxuICBfLmZpbmQgPSBfLmRldGVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgdmFyIGtleTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSkge1xuICAgICAga2V5ID0gXy5maW5kSW5kZXgob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrZXkgPSBfLmZpbmRLZXkob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIH1cbiAgICBpZiAoa2V5ICE9PSB2b2lkIDAgJiYga2V5ICE9PSAtMSkgcmV0dXJuIG9ialtrZXldO1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIHRoYXQgcGFzcyBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYHNlbGVjdGAuXG4gIF8uZmlsdGVyID0gXy5zZWxlY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChwcmVkaWNhdGUodmFsdWUsIGluZGV4LCBsaXN0KSkgcmVzdWx0cy5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyBmb3Igd2hpY2ggYSB0cnV0aCB0ZXN0IGZhaWxzLlxuICBfLnJlamVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgXy5uZWdhdGUoY2IocHJlZGljYXRlKSksIGNvbnRleHQpO1xuICB9O1xuXG4gIC8vIERldGVybWluZSB3aGV0aGVyIGFsbCBvZiB0aGUgZWxlbWVudHMgbWF0Y2ggYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBhbGxgLlxuICBfLmV2ZXJ5ID0gXy5hbGwgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgIGlmICghcHJlZGljYXRlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgYXQgbGVhc3Qgb25lIGVsZW1lbnQgaW4gdGhlIG9iamVjdCBtYXRjaGVzIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgYW55YC5cbiAgXy5zb21lID0gXy5hbnkgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgIGlmIChwcmVkaWNhdGUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiB0aGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5zIGEgZ2l2ZW4gdmFsdWUgKHVzaW5nIGA9PT1gKS5cbiAgLy8gQWxpYXNlZCBhcyBgaW5jbHVkZXNgIGFuZCBgaW5jbHVkZWAuXG4gIF8uY29udGFpbnMgPSBfLmluY2x1ZGVzID0gXy5pbmNsdWRlID0gZnVuY3Rpb24ob2JqLCB0YXJnZXQsIGZyb21JbmRleCkge1xuICAgIGlmICghaXNBcnJheUxpa2Uob2JqKSkgb2JqID0gXy52YWx1ZXMob2JqKTtcbiAgICByZXR1cm4gXy5pbmRleE9mKG9iaiwgdGFyZ2V0LCB0eXBlb2YgZnJvbUluZGV4ID09ICdudW1iZXInICYmIGZyb21JbmRleCkgPj0gMDtcbiAgfTtcblxuICAvLyBJbnZva2UgYSBtZXRob2QgKHdpdGggYXJndW1lbnRzKSBvbiBldmVyeSBpdGVtIGluIGEgY29sbGVjdGlvbi5cbiAgXy5pbnZva2UgPSBmdW5jdGlvbihvYmosIG1ldGhvZCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBpc0Z1bmMgPSBfLmlzRnVuY3Rpb24obWV0aG9kKTtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgdmFyIGZ1bmMgPSBpc0Z1bmMgPyBtZXRob2QgOiB2YWx1ZVttZXRob2RdO1xuICAgICAgcmV0dXJuIGZ1bmMgPT0gbnVsbCA/IGZ1bmMgOiBmdW5jLmFwcGx5KHZhbHVlLCBhcmdzKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBtYXBgOiBmZXRjaGluZyBhIHByb3BlcnR5LlxuICBfLnBsdWNrID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBfLnByb3BlcnR5KGtleSkpO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYGZpbHRlcmA6IHNlbGVjdGluZyBvbmx5IG9iamVjdHNcbiAgLy8gY29udGFpbmluZyBzcGVjaWZpYyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy53aGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIob2JqLCBfLm1hdGNoZXIoYXR0cnMpKTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaW5kYDogZ2V0dGluZyB0aGUgZmlyc3Qgb2JqZWN0XG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uZmluZFdoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycykge1xuICAgIHJldHVybiBfLmZpbmQob2JqLCBfLm1hdGNoZXIoYXR0cnMpKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG1heGltdW0gZWxlbWVudCAob3IgZWxlbWVudC1iYXNlZCBjb21wdXRhdGlvbikuXG4gIF8ubWF4ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQgPSAtSW5maW5pdHksIGxhc3RDb21wdXRlZCA9IC1JbmZpbml0eSxcbiAgICAgICAgdmFsdWUsIGNvbXB1dGVkO1xuICAgIGlmIChpdGVyYXRlZSA9PSBudWxsICYmIG9iaiAhPSBudWxsKSB7XG4gICAgICBvYmogPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFsdWUgPSBvYmpbaV07XG4gICAgICAgIGlmICh2YWx1ZSA+IHJlc3VsdCkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICAgICAgaWYgKGNvbXB1dGVkID4gbGFzdENvbXB1dGVkIHx8IGNvbXB1dGVkID09PSAtSW5maW5pdHkgJiYgcmVzdWx0ID09PSAtSW5maW5pdHkpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgICBsYXN0Q29tcHV0ZWQgPSBjb21wdXRlZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtaW5pbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1pbiA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gSW5maW5pdHksIGxhc3RDb21wdXRlZCA9IEluZmluaXR5LFxuICAgICAgICB2YWx1ZSwgY29tcHV0ZWQ7XG4gICAgaWYgKGl0ZXJhdGVlID09IG51bGwgJiYgb2JqICE9IG51bGwpIHtcbiAgICAgIG9iaiA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB2YWx1ZSA9IG9ialtpXTtcbiAgICAgICAgaWYgKHZhbHVlIDwgcmVzdWx0KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgICAgICBpZiAoY29tcHV0ZWQgPCBsYXN0Q29tcHV0ZWQgfHwgY29tcHV0ZWQgPT09IEluZmluaXR5ICYmIHJlc3VsdCA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgICBsYXN0Q29tcHV0ZWQgPSBjb21wdXRlZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gU2h1ZmZsZSBhIGNvbGxlY3Rpb24sIHVzaW5nIHRoZSBtb2Rlcm4gdmVyc2lvbiBvZiB0aGVcbiAgLy8gW0Zpc2hlci1ZYXRlcyBzaHVmZmxlXShodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0Zpc2hlcuKAk1lhdGVzX3NodWZmbGUpLlxuICBfLnNodWZmbGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgc2V0ID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IHNldC5sZW5ndGg7XG4gICAgdmFyIHNodWZmbGVkID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpbmRleCA9IDAsIHJhbmQ7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICByYW5kID0gXy5yYW5kb20oMCwgaW5kZXgpO1xuICAgICAgaWYgKHJhbmQgIT09IGluZGV4KSBzaHVmZmxlZFtpbmRleF0gPSBzaHVmZmxlZFtyYW5kXTtcbiAgICAgIHNodWZmbGVkW3JhbmRdID0gc2V0W2luZGV4XTtcbiAgICB9XG4gICAgcmV0dXJuIHNodWZmbGVkO1xuICB9O1xuXG4gIC8vIFNhbXBsZSAqKm4qKiByYW5kb20gdmFsdWVzIGZyb20gYSBjb2xsZWN0aW9uLlxuICAvLyBJZiAqKm4qKiBpcyBub3Qgc3BlY2lmaWVkLCByZXR1cm5zIGEgc2luZ2xlIHJhbmRvbSBlbGVtZW50LlxuICAvLyBUaGUgaW50ZXJuYWwgYGd1YXJkYCBhcmd1bWVudCBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBtYXBgLlxuICBfLnNhbXBsZSA9IGZ1bmN0aW9uKG9iaiwgbiwgZ3VhcmQpIHtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSB7XG4gICAgICBpZiAoIWlzQXJyYXlMaWtlKG9iaikpIG9iaiA9IF8udmFsdWVzKG9iaik7XG4gICAgICByZXR1cm4gb2JqW18ucmFuZG9tKG9iai5sZW5ndGggLSAxKV07XG4gICAgfVxuICAgIHJldHVybiBfLnNodWZmbGUob2JqKS5zbGljZSgwLCBNYXRoLm1heCgwLCBuKSk7XG4gIH07XG5cbiAgLy8gU29ydCB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uIHByb2R1Y2VkIGJ5IGFuIGl0ZXJhdGVlLlxuICBfLnNvcnRCeSA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICByZXR1cm4gXy5wbHVjayhfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICBpbmRleDogaW5kZXgsXG4gICAgICAgIGNyaXRlcmlhOiBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIGxpc3QpXG4gICAgICB9O1xuICAgIH0pLnNvcnQoZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgIHZhciBhID0gbGVmdC5jcml0ZXJpYTtcbiAgICAgIHZhciBiID0gcmlnaHQuY3JpdGVyaWE7XG4gICAgICBpZiAoYSAhPT0gYikge1xuICAgICAgICBpZiAoYSA+IGIgfHwgYSA9PT0gdm9pZCAwKSByZXR1cm4gMTtcbiAgICAgICAgaWYgKGEgPCBiIHx8IGIgPT09IHZvaWQgMCkgcmV0dXJuIC0xO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxlZnQuaW5kZXggLSByaWdodC5pbmRleDtcbiAgICB9KSwgJ3ZhbHVlJyk7XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gdXNlZCBmb3IgYWdncmVnYXRlIFwiZ3JvdXAgYnlcIiBvcGVyYXRpb25zLlxuICB2YXIgZ3JvdXAgPSBmdW5jdGlvbihiZWhhdmlvcikge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCkge1xuICAgICAgICB2YXIga2V5ID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBvYmopO1xuICAgICAgICBiZWhhdmlvcihyZXN1bHQsIHZhbHVlLCBrZXkpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gR3JvdXBzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24uIFBhc3MgZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZVxuICAvLyB0byBncm91cCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIGNyaXRlcmlvbi5cbiAgXy5ncm91cEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCB2YWx1ZSwga2V5KSB7XG4gICAgaWYgKF8uaGFzKHJlc3VsdCwga2V5KSkgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSk7IGVsc2UgcmVzdWx0W2tleV0gPSBbdmFsdWVdO1xuICB9KTtcblxuICAvLyBJbmRleGVzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24sIHNpbWlsYXIgdG8gYGdyb3VwQnlgLCBidXQgZm9yXG4gIC8vIHdoZW4geW91IGtub3cgdGhhdCB5b3VyIGluZGV4IHZhbHVlcyB3aWxsIGJlIHVuaXF1ZS5cbiAgXy5pbmRleEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCB2YWx1ZSwga2V5KSB7XG4gICAgcmVzdWx0W2tleV0gPSB2YWx1ZTtcbiAgfSk7XG5cbiAgLy8gQ291bnRzIGluc3RhbmNlcyBvZiBhbiBvYmplY3QgdGhhdCBncm91cCBieSBhIGNlcnRhaW4gY3JpdGVyaW9uLiBQYXNzXG4gIC8vIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGUgdG8gY291bnQgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZVxuICAvLyBjcml0ZXJpb24uXG4gIF8uY291bnRCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIGlmIChfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldKys7IGVsc2UgcmVzdWx0W2tleV0gPSAxO1xuICB9KTtcblxuICAvLyBTYWZlbHkgY3JlYXRlIGEgcmVhbCwgbGl2ZSBhcnJheSBmcm9tIGFueXRoaW5nIGl0ZXJhYmxlLlxuICBfLnRvQXJyYXkgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIW9iaikgcmV0dXJuIFtdO1xuICAgIGlmIChfLmlzQXJyYXkob2JqKSkgcmV0dXJuIHNsaWNlLmNhbGwob2JqKTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSkgcmV0dXJuIF8ubWFwKG9iaiwgXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIF8udmFsdWVzKG9iaik7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBudW1iZXIgb2YgZWxlbWVudHMgaW4gYW4gb2JqZWN0LlxuICBfLnNpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiAwO1xuICAgIHJldHVybiBpc0FycmF5TGlrZShvYmopID8gb2JqLmxlbmd0aCA6IF8ua2V5cyhvYmopLmxlbmd0aDtcbiAgfTtcblxuICAvLyBTcGxpdCBhIGNvbGxlY3Rpb24gaW50byB0d28gYXJyYXlzOiBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIHNhdGlzZnkgdGhlIGdpdmVuXG4gIC8vIHByZWRpY2F0ZSwgYW5kIG9uZSB3aG9zZSBlbGVtZW50cyBhbGwgZG8gbm90IHNhdGlzZnkgdGhlIHByZWRpY2F0ZS5cbiAgXy5wYXJ0aXRpb24gPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIHBhc3MgPSBbXSwgZmFpbCA9IFtdO1xuICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXksIG9iaikge1xuICAgICAgKHByZWRpY2F0ZSh2YWx1ZSwga2V5LCBvYmopID8gcGFzcyA6IGZhaWwpLnB1c2godmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiBbcGFzcywgZmFpbF07XG4gIH07XG5cbiAgLy8gQXJyYXkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEdldCB0aGUgZmlyc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgZmlyc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LiBBbGlhc2VkIGFzIGBoZWFkYCBhbmQgYHRha2VgLiBUaGUgKipndWFyZCoqIGNoZWNrXG4gIC8vIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5maXJzdCA9IF8uaGVhZCA9IF8udGFrZSA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gdm9pZCAwO1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHJldHVybiBhcnJheVswXTtcbiAgICByZXR1cm4gXy5pbml0aWFsKGFycmF5LCBhcnJheS5sZW5ndGggLSBuKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGV2ZXJ5dGhpbmcgYnV0IHRoZSBsYXN0IGVudHJ5IG9mIHRoZSBhcnJheS4gRXNwZWNpYWxseSB1c2VmdWwgb25cbiAgLy8gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gYWxsIHRoZSB2YWx1ZXMgaW5cbiAgLy8gdGhlIGFycmF5LCBleGNsdWRpbmcgdGhlIGxhc3QgTi5cbiAgXy5pbml0aWFsID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIDAsIE1hdGgubWF4KDAsIGFycmF5Lmxlbmd0aCAtIChuID09IG51bGwgfHwgZ3VhcmQgPyAxIDogbikpKTtcbiAgfTtcblxuICAvLyBHZXQgdGhlIGxhc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgbGFzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuXG4gIF8ubGFzdCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gdm9pZCAwO1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHJldHVybiBhcnJheVthcnJheS5sZW5ndGggLSAxXTtcbiAgICByZXR1cm4gXy5yZXN0KGFycmF5LCBNYXRoLm1heCgwLCBhcnJheS5sZW5ndGggLSBuKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgZmlyc3QgZW50cnkgb2YgdGhlIGFycmF5LiBBbGlhc2VkIGFzIGB0YWlsYCBhbmQgYGRyb3BgLlxuICAvLyBFc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgYXJndW1lbnRzIG9iamVjdC4gUGFzc2luZyBhbiAqKm4qKiB3aWxsIHJldHVyblxuICAvLyB0aGUgcmVzdCBOIHZhbHVlcyBpbiB0aGUgYXJyYXkuXG4gIF8ucmVzdCA9IF8udGFpbCA9IF8uZHJvcCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCBuID09IG51bGwgfHwgZ3VhcmQgPyAxIDogbik7XG4gIH07XG5cbiAgLy8gVHJpbSBvdXQgYWxsIGZhbHN5IHZhbHVlcyBmcm9tIGFuIGFycmF5LlxuICBfLmNvbXBhY3QgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgXy5pZGVudGl0eSk7XG4gIH07XG5cbiAgLy8gSW50ZXJuYWwgaW1wbGVtZW50YXRpb24gb2YgYSByZWN1cnNpdmUgYGZsYXR0ZW5gIGZ1bmN0aW9uLlxuICB2YXIgZmxhdHRlbiA9IGZ1bmN0aW9uKGlucHV0LCBzaGFsbG93LCBzdHJpY3QsIHN0YXJ0SW5kZXgpIHtcbiAgICB2YXIgb3V0cHV0ID0gW10sIGlkeCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0SW5kZXggfHwgMCwgbGVuZ3RoID0gaW5wdXQgJiYgaW5wdXQubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB2YWx1ZSA9IGlucHV0W2ldO1xuICAgICAgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSAmJiAoXy5pc0FycmF5KHZhbHVlKSB8fCBfLmlzQXJndW1lbnRzKHZhbHVlKSkpIHtcbiAgICAgICAgLy9mbGF0dGVuIGN1cnJlbnQgbGV2ZWwgb2YgYXJyYXkgb3IgYXJndW1lbnRzIG9iamVjdFxuICAgICAgICBpZiAoIXNoYWxsb3cpIHZhbHVlID0gZmxhdHRlbih2YWx1ZSwgc2hhbGxvdywgc3RyaWN0KTtcbiAgICAgICAgdmFyIGogPSAwLCBsZW4gPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgIG91dHB1dC5sZW5ndGggKz0gbGVuO1xuICAgICAgICB3aGlsZSAoaiA8IGxlbikge1xuICAgICAgICAgIG91dHB1dFtpZHgrK10gPSB2YWx1ZVtqKytdO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFzdHJpY3QpIHtcbiAgICAgICAgb3V0cHV0W2lkeCsrXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0O1xuICB9O1xuXG4gIC8vIEZsYXR0ZW4gb3V0IGFuIGFycmF5LCBlaXRoZXIgcmVjdXJzaXZlbHkgKGJ5IGRlZmF1bHQpLCBvciBqdXN0IG9uZSBsZXZlbC5cbiAgXy5mbGF0dGVuID0gZnVuY3Rpb24oYXJyYXksIHNoYWxsb3cpIHtcbiAgICByZXR1cm4gZmxhdHRlbihhcnJheSwgc2hhbGxvdywgZmFsc2UpO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHZlcnNpb24gb2YgdGhlIGFycmF5IHRoYXQgZG9lcyBub3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIHZhbHVlKHMpLlxuICBfLndpdGhvdXQgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmRpZmZlcmVuY2UoYXJyYXksIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhIGR1cGxpY2F0ZS1mcmVlIHZlcnNpb24gb2YgdGhlIGFycmF5LiBJZiB0aGUgYXJyYXkgaGFzIGFscmVhZHlcbiAgLy8gYmVlbiBzb3J0ZWQsIHlvdSBoYXZlIHRoZSBvcHRpb24gb2YgdXNpbmcgYSBmYXN0ZXIgYWxnb3JpdGhtLlxuICAvLyBBbGlhc2VkIGFzIGB1bmlxdWVgLlxuICBfLnVuaXEgPSBfLnVuaXF1ZSA9IGZ1bmN0aW9uKGFycmF5LCBpc1NvcnRlZCwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIFtdO1xuICAgIGlmICghXy5pc0Jvb2xlYW4oaXNTb3J0ZWQpKSB7XG4gICAgICBjb250ZXh0ID0gaXRlcmF0ZWU7XG4gICAgICBpdGVyYXRlZSA9IGlzU29ydGVkO1xuICAgICAgaXNTb3J0ZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGl0ZXJhdGVlICE9IG51bGwpIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgc2VlbiA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBhcnJheS5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHZhbHVlID0gYXJyYXlbaV0sXG4gICAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZSA/IGl0ZXJhdGVlKHZhbHVlLCBpLCBhcnJheSkgOiB2YWx1ZTtcbiAgICAgIGlmIChpc1NvcnRlZCkge1xuICAgICAgICBpZiAoIWkgfHwgc2VlbiAhPT0gY29tcHV0ZWQpIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgICAgc2VlbiA9IGNvbXB1dGVkO1xuICAgICAgfSBlbHNlIGlmIChpdGVyYXRlZSkge1xuICAgICAgICBpZiAoIV8uY29udGFpbnMoc2VlbiwgY29tcHV0ZWQpKSB7XG4gICAgICAgICAgc2Vlbi5wdXNoKGNvbXB1dGVkKTtcbiAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIV8uY29udGFpbnMocmVzdWx0LCB2YWx1ZSkpIHtcbiAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYW4gYXJyYXkgdGhhdCBjb250YWlucyB0aGUgdW5pb246IGVhY2ggZGlzdGluY3QgZWxlbWVudCBmcm9tIGFsbCBvZlxuICAvLyB0aGUgcGFzc2VkLWluIGFycmF5cy5cbiAgXy51bmlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuaXEoZmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgZXZlcnkgaXRlbSBzaGFyZWQgYmV0d2VlbiBhbGwgdGhlXG4gIC8vIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8uaW50ZXJzZWN0aW9uID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIFtdO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgYXJnc0xlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGFycmF5Lmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaXRlbSA9IGFycmF5W2ldO1xuICAgICAgaWYgKF8uY29udGFpbnMocmVzdWx0LCBpdGVtKSkgY29udGludWU7XG4gICAgICBmb3IgKHZhciBqID0gMTsgaiA8IGFyZ3NMZW5ndGg7IGorKykge1xuICAgICAgICBpZiAoIV8uY29udGFpbnMoYXJndW1lbnRzW2pdLCBpdGVtKSkgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoaiA9PT0gYXJnc0xlbmd0aCkgcmVzdWx0LnB1c2goaXRlbSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gVGFrZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIG9uZSBhcnJheSBhbmQgYSBudW1iZXIgb2Ygb3RoZXIgYXJyYXlzLlxuICAvLyBPbmx5IHRoZSBlbGVtZW50cyBwcmVzZW50IGluIGp1c3QgdGhlIGZpcnN0IGFycmF5IHdpbGwgcmVtYWluLlxuICBfLmRpZmZlcmVuY2UgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN0ID0gZmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUsIDEpO1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgZnVuY3Rpb24odmFsdWUpe1xuICAgICAgcmV0dXJuICFfLmNvbnRhaW5zKHJlc3QsIHZhbHVlKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBaaXAgdG9nZXRoZXIgbXVsdGlwbGUgbGlzdHMgaW50byBhIHNpbmdsZSBhcnJheSAtLSBlbGVtZW50cyB0aGF0IHNoYXJlXG4gIC8vIGFuIGluZGV4IGdvIHRvZ2V0aGVyLlxuICBfLnppcCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuemlwKGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgLy8gQ29tcGxlbWVudCBvZiBfLnppcC4gVW56aXAgYWNjZXB0cyBhbiBhcnJheSBvZiBhcnJheXMgYW5kIGdyb3Vwc1xuICAvLyBlYWNoIGFycmF5J3MgZWxlbWVudHMgb24gc2hhcmVkIGluZGljZXNcbiAgXy51bnppcCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIGxlbmd0aCA9IGFycmF5ICYmIF8ubWF4KGFycmF5LCAnbGVuZ3RoJykubGVuZ3RoIHx8IDA7XG4gICAgdmFyIHJlc3VsdCA9IEFycmF5KGxlbmd0aCk7XG5cbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICByZXN1bHRbaW5kZXhdID0gXy5wbHVjayhhcnJheSwgaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIENvbnZlcnRzIGxpc3RzIGludG8gb2JqZWN0cy4gUGFzcyBlaXRoZXIgYSBzaW5nbGUgYXJyYXkgb2YgYFtrZXksIHZhbHVlXWBcbiAgLy8gcGFpcnMsIG9yIHR3byBwYXJhbGxlbCBhcnJheXMgb2YgdGhlIHNhbWUgbGVuZ3RoIC0tIG9uZSBvZiBrZXlzLCBhbmQgb25lIG9mXG4gIC8vIHRoZSBjb3JyZXNwb25kaW5nIHZhbHVlcy5cbiAgXy5vYmplY3QgPSBmdW5jdGlvbihsaXN0LCB2YWx1ZXMpIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGxpc3QgJiYgbGlzdC5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHZhbHVlcykge1xuICAgICAgICByZXN1bHRbbGlzdFtpXV0gPSB2YWx1ZXNbaV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRbbGlzdFtpXVswXV0gPSBsaXN0W2ldWzFdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYW4gaXRlbSBpbiBhbiBhcnJheSxcbiAgLy8gb3IgLTEgaWYgdGhlIGl0ZW0gaXMgbm90IGluY2x1ZGVkIGluIHRoZSBhcnJheS5cbiAgLy8gSWYgdGhlIGFycmF5IGlzIGxhcmdlIGFuZCBhbHJlYWR5IGluIHNvcnQgb3JkZXIsIHBhc3MgYHRydWVgXG4gIC8vIGZvciAqKmlzU29ydGVkKiogdG8gdXNlIGJpbmFyeSBzZWFyY2guXG4gIF8uaW5kZXhPZiA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBpc1NvcnRlZCkge1xuICAgIHZhciBpID0gMCwgbGVuZ3RoID0gYXJyYXkgJiYgYXJyYXkubGVuZ3RoO1xuICAgIGlmICh0eXBlb2YgaXNTb3J0ZWQgPT0gJ251bWJlcicpIHtcbiAgICAgIGkgPSBpc1NvcnRlZCA8IDAgPyBNYXRoLm1heCgwLCBsZW5ndGggKyBpc1NvcnRlZCkgOiBpc1NvcnRlZDtcbiAgICB9IGVsc2UgaWYgKGlzU29ydGVkICYmIGxlbmd0aCkge1xuICAgICAgaSA9IF8uc29ydGVkSW5kZXgoYXJyYXksIGl0ZW0pO1xuICAgICAgcmV0dXJuIGFycmF5W2ldID09PSBpdGVtID8gaSA6IC0xO1xuICAgIH1cbiAgICBpZiAoaXRlbSAhPT0gaXRlbSkge1xuICAgICAgcmV0dXJuIF8uZmluZEluZGV4KHNsaWNlLmNhbGwoYXJyYXksIGkpLCBfLmlzTmFOKTtcbiAgICB9XG4gICAgZm9yICg7IGkgPCBsZW5ndGg7IGkrKykgaWYgKGFycmF5W2ldID09PSBpdGVtKSByZXR1cm4gaTtcbiAgICByZXR1cm4gLTE7XG4gIH07XG5cbiAgXy5sYXN0SW5kZXhPZiA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBmcm9tKSB7XG4gICAgdmFyIGlkeCA9IGFycmF5ID8gYXJyYXkubGVuZ3RoIDogMDtcbiAgICBpZiAodHlwZW9mIGZyb20gPT0gJ251bWJlcicpIHtcbiAgICAgIGlkeCA9IGZyb20gPCAwID8gaWR4ICsgZnJvbSArIDEgOiBNYXRoLm1pbihpZHgsIGZyb20gKyAxKTtcbiAgICB9XG4gICAgaWYgKGl0ZW0gIT09IGl0ZW0pIHtcbiAgICAgIHJldHVybiBfLmZpbmRMYXN0SW5kZXgoc2xpY2UuY2FsbChhcnJheSwgMCwgaWR4KSwgXy5pc05hTik7XG4gICAgfVxuICAgIHdoaWxlICgtLWlkeCA+PSAwKSBpZiAoYXJyYXlbaWR4XSA9PT0gaXRlbSkgcmV0dXJuIGlkeDtcbiAgICByZXR1cm4gLTE7XG4gIH07XG5cbiAgLy8gR2VuZXJhdG9yIGZ1bmN0aW9uIHRvIGNyZWF0ZSB0aGUgZmluZEluZGV4IGFuZCBmaW5kTGFzdEluZGV4IGZ1bmN0aW9uc1xuICBmdW5jdGlvbiBjcmVhdGVJbmRleEZpbmRlcihkaXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oYXJyYXksIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICAgIHZhciBsZW5ndGggPSBhcnJheSAhPSBudWxsICYmIGFycmF5Lmxlbmd0aDtcbiAgICAgIHZhciBpbmRleCA9IGRpciA+IDAgPyAwIDogbGVuZ3RoIC0gMTtcbiAgICAgIGZvciAoOyBpbmRleCA+PSAwICYmIGluZGV4IDwgbGVuZ3RoOyBpbmRleCArPSBkaXIpIHtcbiAgICAgICAgaWYgKHByZWRpY2F0ZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSkpIHJldHVybiBpbmRleDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgaW5kZXggb24gYW4gYXJyYXktbGlrZSB0aGF0IHBhc3NlcyBhIHByZWRpY2F0ZSB0ZXN0XG4gIF8uZmluZEluZGV4ID0gY3JlYXRlSW5kZXhGaW5kZXIoMSk7XG5cbiAgXy5maW5kTGFzdEluZGV4ID0gY3JlYXRlSW5kZXhGaW5kZXIoLTEpO1xuXG4gIC8vIFVzZSBhIGNvbXBhcmF0b3IgZnVuY3Rpb24gdG8gZmlndXJlIG91dCB0aGUgc21hbGxlc3QgaW5kZXggYXQgd2hpY2hcbiAgLy8gYW4gb2JqZWN0IHNob3VsZCBiZSBpbnNlcnRlZCBzbyBhcyB0byBtYWludGFpbiBvcmRlci4gVXNlcyBiaW5hcnkgc2VhcmNoLlxuICBfLnNvcnRlZEluZGV4ID0gZnVuY3Rpb24oYXJyYXksIG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0LCAxKTtcbiAgICB2YXIgdmFsdWUgPSBpdGVyYXRlZShvYmopO1xuICAgIHZhciBsb3cgPSAwLCBoaWdoID0gYXJyYXkubGVuZ3RoO1xuICAgIHdoaWxlIChsb3cgPCBoaWdoKSB7XG4gICAgICB2YXIgbWlkID0gTWF0aC5mbG9vcigobG93ICsgaGlnaCkgLyAyKTtcbiAgICAgIGlmIChpdGVyYXRlZShhcnJheVttaWRdKSA8IHZhbHVlKSBsb3cgPSBtaWQgKyAxOyBlbHNlIGhpZ2ggPSBtaWQ7XG4gICAgfVxuICAgIHJldHVybiBsb3c7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgYW4gaW50ZWdlciBBcnJheSBjb250YWluaW5nIGFuIGFyaXRobWV0aWMgcHJvZ3Jlc3Npb24uIEEgcG9ydCBvZlxuICAvLyB0aGUgbmF0aXZlIFB5dGhvbiBgcmFuZ2UoKWAgZnVuY3Rpb24uIFNlZVxuICAvLyBbdGhlIFB5dGhvbiBkb2N1bWVudGF0aW9uXShodHRwOi8vZG9jcy5weXRob24ub3JnL2xpYnJhcnkvZnVuY3Rpb25zLmh0bWwjcmFuZ2UpLlxuICBfLnJhbmdlID0gZnVuY3Rpb24oc3RhcnQsIHN0b3AsIHN0ZXApIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8PSAxKSB7XG4gICAgICBzdG9wID0gc3RhcnQgfHwgMDtcbiAgICAgIHN0YXJ0ID0gMDtcbiAgICB9XG4gICAgc3RlcCA9IHN0ZXAgfHwgMTtcblxuICAgIHZhciBsZW5ndGggPSBNYXRoLm1heChNYXRoLmNlaWwoKHN0b3AgLSBzdGFydCkgLyBzdGVwKSwgMCk7XG4gICAgdmFyIHJhbmdlID0gQXJyYXkobGVuZ3RoKTtcblxuICAgIGZvciAodmFyIGlkeCA9IDA7IGlkeCA8IGxlbmd0aDsgaWR4KyssIHN0YXJ0ICs9IHN0ZXApIHtcbiAgICAgIHJhbmdlW2lkeF0gPSBzdGFydDtcbiAgICB9XG5cbiAgICByZXR1cm4gcmFuZ2U7XG4gIH07XG5cbiAgLy8gRnVuY3Rpb24gKGFoZW0pIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBEZXRlcm1pbmVzIHdoZXRoZXIgdG8gZXhlY3V0ZSBhIGZ1bmN0aW9uIGFzIGEgY29uc3RydWN0b3JcbiAgLy8gb3IgYSBub3JtYWwgZnVuY3Rpb24gd2l0aCB0aGUgcHJvdmlkZWQgYXJndW1lbnRzXG4gIHZhciBleGVjdXRlQm91bmQgPSBmdW5jdGlvbihzb3VyY2VGdW5jLCBib3VuZEZ1bmMsIGNvbnRleHQsIGNhbGxpbmdDb250ZXh0LCBhcmdzKSB7XG4gICAgaWYgKCEoY2FsbGluZ0NvbnRleHQgaW5zdGFuY2VvZiBib3VuZEZ1bmMpKSByZXR1cm4gc291cmNlRnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICB2YXIgc2VsZiA9IGJhc2VDcmVhdGUoc291cmNlRnVuYy5wcm90b3R5cGUpO1xuICAgIHZhciByZXN1bHQgPSBzb3VyY2VGdW5jLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgIGlmIChfLmlzT2JqZWN0KHJlc3VsdCkpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHNlbGY7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgZnVuY3Rpb24gYm91bmQgdG8gYSBnaXZlbiBvYmplY3QgKGFzc2lnbmluZyBgdGhpc2AsIGFuZCBhcmd1bWVudHMsXG4gIC8vIG9wdGlvbmFsbHkpLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgRnVuY3Rpb24uYmluZGAgaWZcbiAgLy8gYXZhaWxhYmxlLlxuICBfLmJpbmQgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0KSB7XG4gICAgaWYgKG5hdGl2ZUJpbmQgJiYgZnVuYy5iaW5kID09PSBuYXRpdmVCaW5kKSByZXR1cm4gbmF0aXZlQmluZC5hcHBseShmdW5jLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIGlmICghXy5pc0Z1bmN0aW9uKGZ1bmMpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdCaW5kIG11c3QgYmUgY2FsbGVkIG9uIGEgZnVuY3Rpb24nKTtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgYm91bmQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleGVjdXRlQm91bmQoZnVuYywgYm91bmQsIGNvbnRleHQsIHRoaXMsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICAgIH07XG4gICAgcmV0dXJuIGJvdW5kO1xuICB9O1xuXG4gIC8vIFBhcnRpYWxseSBhcHBseSBhIGZ1bmN0aW9uIGJ5IGNyZWF0aW5nIGEgdmVyc2lvbiB0aGF0IGhhcyBoYWQgc29tZSBvZiBpdHNcbiAgLy8gYXJndW1lbnRzIHByZS1maWxsZWQsIHdpdGhvdXQgY2hhbmdpbmcgaXRzIGR5bmFtaWMgYHRoaXNgIGNvbnRleHQuIF8gYWN0c1xuICAvLyBhcyBhIHBsYWNlaG9sZGVyLCBhbGxvd2luZyBhbnkgY29tYmluYXRpb24gb2YgYXJndW1lbnRzIHRvIGJlIHByZS1maWxsZWQuXG4gIF8ucGFydGlhbCA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICB2YXIgYm91bmRBcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHZhciBib3VuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHBvc2l0aW9uID0gMCwgbGVuZ3RoID0gYm91bmRBcmdzLmxlbmd0aDtcbiAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuZ3RoKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXJnc1tpXSA9IGJvdW5kQXJnc1tpXSA9PT0gXyA/IGFyZ3VtZW50c1twb3NpdGlvbisrXSA6IGJvdW5kQXJnc1tpXTtcbiAgICAgIH1cbiAgICAgIHdoaWxlIChwb3NpdGlvbiA8IGFyZ3VtZW50cy5sZW5ndGgpIGFyZ3MucHVzaChhcmd1bWVudHNbcG9zaXRpb24rK10pO1xuICAgICAgcmV0dXJuIGV4ZWN1dGVCb3VuZChmdW5jLCBib3VuZCwgdGhpcywgdGhpcywgYXJncyk7XG4gICAgfTtcbiAgICByZXR1cm4gYm91bmQ7XG4gIH07XG5cbiAgLy8gQmluZCBhIG51bWJlciBvZiBhbiBvYmplY3QncyBtZXRob2RzIHRvIHRoYXQgb2JqZWN0LiBSZW1haW5pbmcgYXJndW1lbnRzXG4gIC8vIGFyZSB0aGUgbWV0aG9kIG5hbWVzIHRvIGJlIGJvdW5kLiBVc2VmdWwgZm9yIGVuc3VyaW5nIHRoYXQgYWxsIGNhbGxiYWNrc1xuICAvLyBkZWZpbmVkIG9uIGFuIG9iamVjdCBiZWxvbmcgdG8gaXQuXG4gIF8uYmluZEFsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBpLCBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoLCBrZXk7XG4gICAgaWYgKGxlbmd0aCA8PSAxKSB0aHJvdyBuZXcgRXJyb3IoJ2JpbmRBbGwgbXVzdCBiZSBwYXNzZWQgZnVuY3Rpb24gbmFtZXMnKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgIG9ialtrZXldID0gXy5iaW5kKG9ialtrZXldLCBvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIE1lbW9pemUgYW4gZXhwZW5zaXZlIGZ1bmN0aW9uIGJ5IHN0b3JpbmcgaXRzIHJlc3VsdHMuXG4gIF8ubWVtb2l6ZSA9IGZ1bmN0aW9uKGZ1bmMsIGhhc2hlcikge1xuICAgIHZhciBtZW1vaXplID0gZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgY2FjaGUgPSBtZW1vaXplLmNhY2hlO1xuICAgICAgdmFyIGFkZHJlc3MgPSAnJyArIChoYXNoZXIgPyBoYXNoZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKSA6IGtleSk7XG4gICAgICBpZiAoIV8uaGFzKGNhY2hlLCBhZGRyZXNzKSkgY2FjaGVbYWRkcmVzc10gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gY2FjaGVbYWRkcmVzc107XG4gICAgfTtcbiAgICBtZW1vaXplLmNhY2hlID0ge307XG4gICAgcmV0dXJuIG1lbW9pemU7XG4gIH07XG5cbiAgLy8gRGVsYXlzIGEgZnVuY3Rpb24gZm9yIHRoZSBnaXZlbiBudW1iZXIgb2YgbWlsbGlzZWNvbmRzLCBhbmQgdGhlbiBjYWxsc1xuICAvLyBpdCB3aXRoIHRoZSBhcmd1bWVudHMgc3VwcGxpZWQuXG4gIF8uZGVsYXkgPSBmdW5jdGlvbihmdW5jLCB3YWl0KSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgIH0sIHdhaXQpO1xuICB9O1xuXG4gIC8vIERlZmVycyBhIGZ1bmN0aW9uLCBzY2hlZHVsaW5nIGl0IHRvIHJ1biBhZnRlciB0aGUgY3VycmVudCBjYWxsIHN0YWNrIGhhc1xuICAvLyBjbGVhcmVkLlxuICBfLmRlZmVyID0gXy5wYXJ0aWFsKF8uZGVsYXksIF8sIDEpO1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgd2hlbiBpbnZva2VkLCB3aWxsIG9ubHkgYmUgdHJpZ2dlcmVkIGF0IG1vc3Qgb25jZVxuICAvLyBkdXJpbmcgYSBnaXZlbiB3aW5kb3cgb2YgdGltZS4gTm9ybWFsbHksIHRoZSB0aHJvdHRsZWQgZnVuY3Rpb24gd2lsbCBydW5cbiAgLy8gYXMgbXVjaCBhcyBpdCBjYW4sIHdpdGhvdXQgZXZlciBnb2luZyBtb3JlIHRoYW4gb25jZSBwZXIgYHdhaXRgIGR1cmF0aW9uO1xuICAvLyBidXQgaWYgeW91J2QgbGlrZSB0byBkaXNhYmxlIHRoZSBleGVjdXRpb24gb24gdGhlIGxlYWRpbmcgZWRnZSwgcGFzc1xuICAvLyBge2xlYWRpbmc6IGZhbHNlfWAuIFRvIGRpc2FibGUgZXhlY3V0aW9uIG9uIHRoZSB0cmFpbGluZyBlZGdlLCBkaXR0by5cbiAgXy50aHJvdHRsZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcbiAgICB2YXIgY29udGV4dCwgYXJncywgcmVzdWx0O1xuICAgIHZhciB0aW1lb3V0ID0gbnVsbDtcbiAgICB2YXIgcHJldmlvdXMgPSAwO1xuICAgIGlmICghb3B0aW9ucykgb3B0aW9ucyA9IHt9O1xuICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcHJldmlvdXMgPSBvcHRpb25zLmxlYWRpbmcgPT09IGZhbHNlID8gMCA6IF8ubm93KCk7XG4gICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICB9O1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBub3cgPSBfLm5vdygpO1xuICAgICAgaWYgKCFwcmV2aW91cyAmJiBvcHRpb25zLmxlYWRpbmcgPT09IGZhbHNlKSBwcmV2aW91cyA9IG5vdztcbiAgICAgIHZhciByZW1haW5pbmcgPSB3YWl0IC0gKG5vdyAtIHByZXZpb3VzKTtcbiAgICAgIGNvbnRleHQgPSB0aGlzO1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIGlmIChyZW1haW5pbmcgPD0gMCB8fCByZW1haW5pbmcgPiB3YWl0KSB7XG4gICAgICAgIGlmICh0aW1lb3V0KSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIHByZXZpb3VzID0gbm93O1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH0gZWxzZSBpZiAoIXRpbWVvdXQgJiYgb3B0aW9ucy50cmFpbGluZyAhPT0gZmFsc2UpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHJlbWFpbmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCBhcyBsb25nIGFzIGl0IGNvbnRpbnVlcyB0byBiZSBpbnZva2VkLCB3aWxsIG5vdFxuICAvLyBiZSB0cmlnZ2VyZWQuIFRoZSBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCBhZnRlciBpdCBzdG9wcyBiZWluZyBjYWxsZWQgZm9yXG4gIC8vIE4gbWlsbGlzZWNvbmRzLiBJZiBgaW1tZWRpYXRlYCBpcyBwYXNzZWQsIHRyaWdnZXIgdGhlIGZ1bmN0aW9uIG9uIHRoZVxuICAvLyBsZWFkaW5nIGVkZ2UsIGluc3RlYWQgb2YgdGhlIHRyYWlsaW5nLlxuICBfLmRlYm91bmNlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgaW1tZWRpYXRlKSB7XG4gICAgdmFyIHRpbWVvdXQsIGFyZ3MsIGNvbnRleHQsIHRpbWVzdGFtcCwgcmVzdWx0O1xuXG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbGFzdCA9IF8ubm93KCkgLSB0aW1lc3RhbXA7XG5cbiAgICAgIGlmIChsYXN0IDwgd2FpdCAmJiBsYXN0ID49IDApIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHdhaXQgLSBsYXN0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICBpZiAoIWltbWVkaWF0ZSkge1xuICAgICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgICAgaWYgKCF0aW1lb3V0KSBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgdGltZXN0YW1wID0gXy5ub3coKTtcbiAgICAgIHZhciBjYWxsTm93ID0gaW1tZWRpYXRlICYmICF0aW1lb3V0O1xuICAgICAgaWYgKCF0aW1lb3V0KSB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCk7XG4gICAgICBpZiAoY2FsbE5vdykge1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBmdW5jdGlvbiBwYXNzZWQgYXMgYW4gYXJndW1lbnQgdG8gdGhlIHNlY29uZCxcbiAgLy8gYWxsb3dpbmcgeW91IHRvIGFkanVzdCBhcmd1bWVudHMsIHJ1biBjb2RlIGJlZm9yZSBhbmQgYWZ0ZXIsIGFuZFxuICAvLyBjb25kaXRpb25hbGx5IGV4ZWN1dGUgdGhlIG9yaWdpbmFsIGZ1bmN0aW9uLlxuICBfLndyYXAgPSBmdW5jdGlvbihmdW5jLCB3cmFwcGVyKSB7XG4gICAgcmV0dXJuIF8ucGFydGlhbCh3cmFwcGVyLCBmdW5jKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgbmVnYXRlZCB2ZXJzaW9uIG9mIHRoZSBwYXNzZWQtaW4gcHJlZGljYXRlLlxuICBfLm5lZ2F0ZSA9IGZ1bmN0aW9uKHByZWRpY2F0ZSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAhcHJlZGljYXRlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCBpcyB0aGUgY29tcG9zaXRpb24gb2YgYSBsaXN0IG9mIGZ1bmN0aW9ucywgZWFjaFxuICAvLyBjb25zdW1pbmcgdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZnVuY3Rpb24gdGhhdCBmb2xsb3dzLlxuICBfLmNvbXBvc2UgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICB2YXIgc3RhcnQgPSBhcmdzLmxlbmd0aCAtIDE7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGkgPSBzdGFydDtcbiAgICAgIHZhciByZXN1bHQgPSBhcmdzW3N0YXJ0XS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgd2hpbGUgKGktLSkgcmVzdWx0ID0gYXJnc1tpXS5jYWxsKHRoaXMsIHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIG9uIGFuZCBhZnRlciB0aGUgTnRoIGNhbGwuXG4gIF8uYWZ0ZXIgPSBmdW5jdGlvbih0aW1lcywgZnVuYykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLXRpbWVzIDwgMSkge1xuICAgICAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIHVwIHRvIChidXQgbm90IGluY2x1ZGluZykgdGhlIE50aCBjYWxsLlxuICBfLmJlZm9yZSA9IGZ1bmN0aW9uKHRpbWVzLCBmdW5jKSB7XG4gICAgdmFyIG1lbW87XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKC0tdGltZXMgPiAwKSB7XG4gICAgICAgIG1lbW8gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgICBpZiAodGltZXMgPD0gMSkgZnVuYyA9IG51bGw7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgZXhlY3V0ZWQgYXQgbW9zdCBvbmUgdGltZSwgbm8gbWF0dGVyIGhvd1xuICAvLyBvZnRlbiB5b3UgY2FsbCBpdC4gVXNlZnVsIGZvciBsYXp5IGluaXRpYWxpemF0aW9uLlxuICBfLm9uY2UgPSBfLnBhcnRpYWwoXy5iZWZvcmUsIDIpO1xuXG4gIC8vIE9iamVjdCBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEtleXMgaW4gSUUgPCA5IHRoYXQgd29uJ3QgYmUgaXRlcmF0ZWQgYnkgYGZvciBrZXkgaW4gLi4uYCBhbmQgdGh1cyBtaXNzZWQuXG4gIHZhciBoYXNFbnVtQnVnID0gIXt0b1N0cmluZzogbnVsbH0ucHJvcGVydHlJc0VudW1lcmFibGUoJ3RvU3RyaW5nJyk7XG4gIHZhciBub25FbnVtZXJhYmxlUHJvcHMgPSBbJ3ZhbHVlT2YnLCAnaXNQcm90b3R5cGVPZicsICd0b1N0cmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgJ3Byb3BlcnR5SXNFbnVtZXJhYmxlJywgJ2hhc093blByb3BlcnR5JywgJ3RvTG9jYWxlU3RyaW5nJ107XG5cbiAgZnVuY3Rpb24gY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpIHtcbiAgICB2YXIgbm9uRW51bUlkeCA9IG5vbkVudW1lcmFibGVQcm9wcy5sZW5ndGg7XG4gICAgdmFyIGNvbnN0cnVjdG9yID0gb2JqLmNvbnN0cnVjdG9yO1xuICAgIHZhciBwcm90byA9IChfLmlzRnVuY3Rpb24oY29uc3RydWN0b3IpICYmIGNvbnN0cnVjdG9yLnByb3RvdHlwZSkgfHwgT2JqUHJvdG87XG5cbiAgICAvLyBDb25zdHJ1Y3RvciBpcyBhIHNwZWNpYWwgY2FzZS5cbiAgICB2YXIgcHJvcCA9ICdjb25zdHJ1Y3Rvcic7XG4gICAgaWYgKF8uaGFzKG9iaiwgcHJvcCkgJiYgIV8uY29udGFpbnMoa2V5cywgcHJvcCkpIGtleXMucHVzaChwcm9wKTtcblxuICAgIHdoaWxlIChub25FbnVtSWR4LS0pIHtcbiAgICAgIHByb3AgPSBub25FbnVtZXJhYmxlUHJvcHNbbm9uRW51bUlkeF07XG4gICAgICBpZiAocHJvcCBpbiBvYmogJiYgb2JqW3Byb3BdICE9PSBwcm90b1twcm9wXSAmJiAhXy5jb250YWlucyhrZXlzLCBwcm9wKSkge1xuICAgICAgICBrZXlzLnB1c2gocHJvcCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0cmlldmUgdGhlIG5hbWVzIG9mIGFuIG9iamVjdCdzIG93biBwcm9wZXJ0aWVzLlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgT2JqZWN0LmtleXNgXG4gIF8ua2V5cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gW107XG4gICAgaWYgKG5hdGl2ZUtleXMpIHJldHVybiBuYXRpdmVLZXlzKG9iaik7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSBrZXlzLnB1c2goa2V5KTtcbiAgICAvLyBBaGVtLCBJRSA8IDkuXG4gICAgaWYgKGhhc0VudW1CdWcpIGNvbGxlY3ROb25FbnVtUHJvcHMob2JqLCBrZXlzKTtcbiAgICByZXR1cm4ga2V5cztcbiAgfTtcblxuICAvLyBSZXRyaWV2ZSBhbGwgdGhlIHByb3BlcnR5IG5hbWVzIG9mIGFuIG9iamVjdC5cbiAgXy5hbGxLZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBbXTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGtleXMucHVzaChrZXkpO1xuICAgIC8vIEFoZW0sIElFIDwgOS5cbiAgICBpZiAoaGFzRW51bUJ1ZykgY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpO1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIHRoZSB2YWx1ZXMgb2YgYW4gb2JqZWN0J3MgcHJvcGVydGllcy5cbiAgXy52YWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB2YXIgdmFsdWVzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YWx1ZXNbaV0gPSBvYmpba2V5c1tpXV07XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZXM7XG4gIH07XG5cbiAgLy8gUmV0dXJucyB0aGUgcmVzdWx0cyBvZiBhcHBseWluZyB0aGUgaXRlcmF0ZWUgdG8gZWFjaCBlbGVtZW50IG9mIHRoZSBvYmplY3RcbiAgLy8gSW4gY29udHJhc3QgdG8gXy5tYXAgaXQgcmV0dXJucyBhbiBvYmplY3RcbiAgXy5tYXBPYmplY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAgXy5rZXlzKG9iaiksXG4gICAgICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICAgICAgcmVzdWx0cyA9IHt9LFxuICAgICAgICAgIGN1cnJlbnRLZXk7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIGN1cnJlbnRLZXkgPSBrZXlzW2luZGV4XTtcbiAgICAgICAgcmVzdWx0c1tjdXJyZW50S2V5XSA9IGl0ZXJhdGVlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENvbnZlcnQgYW4gb2JqZWN0IGludG8gYSBsaXN0IG9mIGBba2V5LCB2YWx1ZV1gIHBhaXJzLlxuICBfLnBhaXJzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgdmFyIHBhaXJzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBwYWlyc1tpXSA9IFtrZXlzW2ldLCBvYmpba2V5c1tpXV1dO1xuICAgIH1cbiAgICByZXR1cm4gcGFpcnM7XG4gIH07XG5cbiAgLy8gSW52ZXJ0IHRoZSBrZXlzIGFuZCB2YWx1ZXMgb2YgYW4gb2JqZWN0LiBUaGUgdmFsdWVzIG11c3QgYmUgc2VyaWFsaXphYmxlLlxuICBfLmludmVydCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICByZXN1bHRbb2JqW2tleXNbaV1dXSA9IGtleXNbaV07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgc29ydGVkIGxpc3Qgb2YgdGhlIGZ1bmN0aW9uIG5hbWVzIGF2YWlsYWJsZSBvbiB0aGUgb2JqZWN0LlxuICAvLyBBbGlhc2VkIGFzIGBtZXRob2RzYFxuICBfLmZ1bmN0aW9ucyA9IF8ubWV0aG9kcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBuYW1lcyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChfLmlzRnVuY3Rpb24ob2JqW2tleV0pKSBuYW1lcy5wdXNoKGtleSk7XG4gICAgfVxuICAgIHJldHVybiBuYW1lcy5zb3J0KCk7XG4gIH07XG5cbiAgLy8gRXh0ZW5kIGEgZ2l2ZW4gb2JqZWN0IHdpdGggYWxsIHRoZSBwcm9wZXJ0aWVzIGluIHBhc3NlZC1pbiBvYmplY3QocykuXG4gIF8uZXh0ZW5kID0gY3JlYXRlQXNzaWduZXIoXy5hbGxLZXlzKTtcblxuICAvLyBBc3NpZ25zIGEgZ2l2ZW4gb2JqZWN0IHdpdGggYWxsIHRoZSBvd24gcHJvcGVydGllcyBpbiB0aGUgcGFzc2VkLWluIG9iamVjdChzKVxuICAvLyAoaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2Fzc2lnbilcbiAgXy5leHRlbmRPd24gPSBfLmFzc2lnbiA9IGNyZWF0ZUFzc2lnbmVyKF8ua2V5cyk7XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3Qga2V5IG9uIGFuIG9iamVjdCB0aGF0IHBhc3NlcyBhIHByZWRpY2F0ZSB0ZXN0XG4gIF8uZmluZEtleSA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopLCBrZXk7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleSA9IGtleXNbaV07XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtrZXldLCBrZXksIG9iaikpIHJldHVybiBrZXk7XG4gICAgfVxuICB9O1xuXG4gIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCBvbmx5IGNvbnRhaW5pbmcgdGhlIHdoaXRlbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ucGljayA9IGZ1bmN0aW9uKG9iamVjdCwgb2l0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9LCBvYmogPSBvYmplY3QsIGl0ZXJhdGVlLCBrZXlzO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKG9pdGVyYXRlZSkpIHtcbiAgICAgIGtleXMgPSBfLmFsbEtleXMob2JqKTtcbiAgICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihvaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrZXlzID0gZmxhdHRlbihhcmd1bWVudHMsIGZhbHNlLCBmYWxzZSwgMSk7XG4gICAgICBpdGVyYXRlZSA9IGZ1bmN0aW9uKHZhbHVlLCBrZXksIG9iaikgeyByZXR1cm4ga2V5IGluIG9iajsgfTtcbiAgICAgIG9iaiA9IE9iamVjdChvYmopO1xuICAgIH1cbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICB2YXIgdmFsdWUgPSBvYmpba2V5XTtcbiAgICAgIGlmIChpdGVyYXRlZSh2YWx1ZSwga2V5LCBvYmopKSByZXN1bHRba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgd2l0aG91dCB0aGUgYmxhY2tsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5vbWl0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGlmIChfLmlzRnVuY3Rpb24oaXRlcmF0ZWUpKSB7XG4gICAgICBpdGVyYXRlZSA9IF8ubmVnYXRlKGl0ZXJhdGVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGtleXMgPSBfLm1hcChmbGF0dGVuKGFyZ3VtZW50cywgZmFsc2UsIGZhbHNlLCAxKSwgU3RyaW5nKTtcbiAgICAgIGl0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgICAgICByZXR1cm4gIV8uY29udGFpbnMoa2V5cywga2V5KTtcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBfLnBpY2sob2JqLCBpdGVyYXRlZSwgY29udGV4dCk7XG4gIH07XG5cbiAgLy8gRmlsbCBpbiBhIGdpdmVuIG9iamVjdCB3aXRoIGRlZmF1bHQgcHJvcGVydGllcy5cbiAgXy5kZWZhdWx0cyA9IGNyZWF0ZUFzc2lnbmVyKF8uYWxsS2V5cywgdHJ1ZSk7XG5cbiAgLy8gQ3JlYXRlIGEgKHNoYWxsb3ctY2xvbmVkKSBkdXBsaWNhdGUgb2YgYW4gb2JqZWN0LlxuICBfLmNsb25lID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBvYmo7XG4gICAgcmV0dXJuIF8uaXNBcnJheShvYmopID8gb2JqLnNsaWNlKCkgOiBfLmV4dGVuZCh7fSwgb2JqKTtcbiAgfTtcblxuICAvLyBJbnZva2VzIGludGVyY2VwdG9yIHdpdGggdGhlIG9iaiwgYW5kIHRoZW4gcmV0dXJucyBvYmouXG4gIC8vIFRoZSBwcmltYXJ5IHB1cnBvc2Ugb2YgdGhpcyBtZXRob2QgaXMgdG8gXCJ0YXAgaW50b1wiIGEgbWV0aG9kIGNoYWluLCBpblxuICAvLyBvcmRlciB0byBwZXJmb3JtIG9wZXJhdGlvbnMgb24gaW50ZXJtZWRpYXRlIHJlc3VsdHMgd2l0aGluIHRoZSBjaGFpbi5cbiAgXy50YXAgPSBmdW5jdGlvbihvYmosIGludGVyY2VwdG9yKSB7XG4gICAgaW50ZXJjZXB0b3Iob2JqKTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybnMgd2hldGhlciBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gc2V0IG9mIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmlzTWF0Y2ggPSBmdW5jdGlvbihvYmplY3QsIGF0dHJzKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMoYXR0cnMpLCBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICBpZiAob2JqZWN0ID09IG51bGwpIHJldHVybiAhbGVuZ3RoO1xuICAgIHZhciBvYmogPSBPYmplY3Qob2JqZWN0KTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIGlmIChhdHRyc1trZXldICE9PSBvYmpba2V5XSB8fCAhKGtleSBpbiBvYmopKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG5cbiAgLy8gSW50ZXJuYWwgcmVjdXJzaXZlIGNvbXBhcmlzb24gZnVuY3Rpb24gZm9yIGBpc0VxdWFsYC5cbiAgdmFyIGVxID0gZnVuY3Rpb24oYSwgYiwgYVN0YWNrLCBiU3RhY2spIHtcbiAgICAvLyBJZGVudGljYWwgb2JqZWN0cyBhcmUgZXF1YWwuIGAwID09PSAtMGAsIGJ1dCB0aGV5IGFyZW4ndCBpZGVudGljYWwuXG4gICAgLy8gU2VlIHRoZSBbSGFybW9ueSBgZWdhbGAgcHJvcG9zYWxdKGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPWhhcm1vbnk6ZWdhbCkuXG4gICAgaWYgKGEgPT09IGIpIHJldHVybiBhICE9PSAwIHx8IDEgLyBhID09PSAxIC8gYjtcbiAgICAvLyBBIHN0cmljdCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIGBudWxsID09IHVuZGVmaW5lZGAuXG4gICAgaWYgKGEgPT0gbnVsbCB8fCBiID09IG51bGwpIHJldHVybiBhID09PSBiO1xuICAgIC8vIFVud3JhcCBhbnkgd3JhcHBlZCBvYmplY3RzLlxuICAgIGlmIChhIGluc3RhbmNlb2YgXykgYSA9IGEuX3dyYXBwZWQ7XG4gICAgaWYgKGIgaW5zdGFuY2VvZiBfKSBiID0gYi5fd3JhcHBlZDtcbiAgICAvLyBDb21wYXJlIGBbW0NsYXNzXV1gIG5hbWVzLlxuICAgIHZhciBjbGFzc05hbWUgPSB0b1N0cmluZy5jYWxsKGEpO1xuICAgIGlmIChjbGFzc05hbWUgIT09IHRvU3RyaW5nLmNhbGwoYikpIHJldHVybiBmYWxzZTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgLy8gU3RyaW5ncywgbnVtYmVycywgcmVndWxhciBleHByZXNzaW9ucywgZGF0ZXMsIGFuZCBib29sZWFucyBhcmUgY29tcGFyZWQgYnkgdmFsdWUuXG4gICAgICBjYXNlICdbb2JqZWN0IFJlZ0V4cF0nOlxuICAgICAgLy8gUmVnRXhwcyBhcmUgY29lcmNlZCB0byBzdHJpbmdzIGZvciBjb21wYXJpc29uIChOb3RlOiAnJyArIC9hL2kgPT09ICcvYS9pJylcbiAgICAgIGNhc2UgJ1tvYmplY3QgU3RyaW5nXSc6XG4gICAgICAgIC8vIFByaW1pdGl2ZXMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgb2JqZWN0IHdyYXBwZXJzIGFyZSBlcXVpdmFsZW50OyB0aHVzLCBgXCI1XCJgIGlzXG4gICAgICAgIC8vIGVxdWl2YWxlbnQgdG8gYG5ldyBTdHJpbmcoXCI1XCIpYC5cbiAgICAgICAgcmV0dXJuICcnICsgYSA9PT0gJycgKyBiO1xuICAgICAgY2FzZSAnW29iamVjdCBOdW1iZXJdJzpcbiAgICAgICAgLy8gYE5hTmBzIGFyZSBlcXVpdmFsZW50LCBidXQgbm9uLXJlZmxleGl2ZS5cbiAgICAgICAgLy8gT2JqZWN0KE5hTikgaXMgZXF1aXZhbGVudCB0byBOYU5cbiAgICAgICAgaWYgKCthICE9PSArYSkgcmV0dXJuICtiICE9PSArYjtcbiAgICAgICAgLy8gQW4gYGVnYWxgIGNvbXBhcmlzb24gaXMgcGVyZm9ybWVkIGZvciBvdGhlciBudW1lcmljIHZhbHVlcy5cbiAgICAgICAgcmV0dXJuICthID09PSAwID8gMSAvICthID09PSAxIC8gYiA6ICthID09PSArYjtcbiAgICAgIGNhc2UgJ1tvYmplY3QgRGF0ZV0nOlxuICAgICAgY2FzZSAnW29iamVjdCBCb29sZWFuXSc6XG4gICAgICAgIC8vIENvZXJjZSBkYXRlcyBhbmQgYm9vbGVhbnMgdG8gbnVtZXJpYyBwcmltaXRpdmUgdmFsdWVzLiBEYXRlcyBhcmUgY29tcGFyZWQgYnkgdGhlaXJcbiAgICAgICAgLy8gbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zLiBOb3RlIHRoYXQgaW52YWxpZCBkYXRlcyB3aXRoIG1pbGxpc2Vjb25kIHJlcHJlc2VudGF0aW9uc1xuICAgICAgICAvLyBvZiBgTmFOYCBhcmUgbm90IGVxdWl2YWxlbnQuXG4gICAgICAgIHJldHVybiArYSA9PT0gK2I7XG4gICAgfVxuXG4gICAgdmFyIGFyZUFycmF5cyA9IGNsYXNzTmFtZSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICBpZiAoIWFyZUFycmF5cykge1xuICAgICAgaWYgKHR5cGVvZiBhICE9ICdvYmplY3QnIHx8IHR5cGVvZiBiICE9ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgIC8vIE9iamVjdHMgd2l0aCBkaWZmZXJlbnQgY29uc3RydWN0b3JzIGFyZSBub3QgZXF1aXZhbGVudCwgYnV0IGBPYmplY3RgcyBvciBgQXJyYXlgc1xuICAgICAgLy8gZnJvbSBkaWZmZXJlbnQgZnJhbWVzIGFyZS5cbiAgICAgIHZhciBhQ3RvciA9IGEuY29uc3RydWN0b3IsIGJDdG9yID0gYi5jb25zdHJ1Y3RvcjtcbiAgICAgIGlmIChhQ3RvciAhPT0gYkN0b3IgJiYgIShfLmlzRnVuY3Rpb24oYUN0b3IpICYmIGFDdG9yIGluc3RhbmNlb2YgYUN0b3IgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmlzRnVuY3Rpb24oYkN0b3IpICYmIGJDdG9yIGluc3RhbmNlb2YgYkN0b3IpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICYmICgnY29uc3RydWN0b3InIGluIGEgJiYgJ2NvbnN0cnVjdG9yJyBpbiBiKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIEFzc3VtZSBlcXVhbGl0eSBmb3IgY3ljbGljIHN0cnVjdHVyZXMuIFRoZSBhbGdvcml0aG0gZm9yIGRldGVjdGluZyBjeWNsaWNcbiAgICAvLyBzdHJ1Y3R1cmVzIGlzIGFkYXB0ZWQgZnJvbSBFUyA1LjEgc2VjdGlvbiAxNS4xMi4zLCBhYnN0cmFjdCBvcGVyYXRpb24gYEpPYC5cbiAgICBcbiAgICAvLyBJbml0aWFsaXppbmcgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgLy8gSXQncyBkb25lIGhlcmUgc2luY2Ugd2Ugb25seSBuZWVkIHRoZW0gZm9yIG9iamVjdHMgYW5kIGFycmF5cyBjb21wYXJpc29uLlxuICAgIGFTdGFjayA9IGFTdGFjayB8fCBbXTtcbiAgICBiU3RhY2sgPSBiU3RhY2sgfHwgW107XG4gICAgdmFyIGxlbmd0aCA9IGFTdGFjay5sZW5ndGg7XG4gICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAvLyBMaW5lYXIgc2VhcmNoLiBQZXJmb3JtYW5jZSBpcyBpbnZlcnNlbHkgcHJvcG9ydGlvbmFsIHRvIHRoZSBudW1iZXIgb2ZcbiAgICAgIC8vIHVuaXF1ZSBuZXN0ZWQgc3RydWN0dXJlcy5cbiAgICAgIGlmIChhU3RhY2tbbGVuZ3RoXSA9PT0gYSkgcmV0dXJuIGJTdGFja1tsZW5ndGhdID09PSBiO1xuICAgIH1cblxuICAgIC8vIEFkZCB0aGUgZmlyc3Qgb2JqZWN0IHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucHVzaChhKTtcbiAgICBiU3RhY2sucHVzaChiKTtcblxuICAgIC8vIFJlY3Vyc2l2ZWx5IGNvbXBhcmUgb2JqZWN0cyBhbmQgYXJyYXlzLlxuICAgIGlmIChhcmVBcnJheXMpIHtcbiAgICAgIC8vIENvbXBhcmUgYXJyYXkgbGVuZ3RocyB0byBkZXRlcm1pbmUgaWYgYSBkZWVwIGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5LlxuICAgICAgbGVuZ3RoID0gYS5sZW5ndGg7XG4gICAgICBpZiAobGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgLy8gRGVlcCBjb21wYXJlIHRoZSBjb250ZW50cywgaWdub3Jpbmcgbm9uLW51bWVyaWMgcHJvcGVydGllcy5cbiAgICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgICBpZiAoIWVxKGFbbGVuZ3RoXSwgYltsZW5ndGhdLCBhU3RhY2ssIGJTdGFjaykpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGVlcCBjb21wYXJlIG9iamVjdHMuXG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhhKSwga2V5O1xuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgICAvLyBFbnN1cmUgdGhhdCBib3RoIG9iamVjdHMgY29udGFpbiB0aGUgc2FtZSBudW1iZXIgb2YgcHJvcGVydGllcyBiZWZvcmUgY29tcGFyaW5nIGRlZXAgZXF1YWxpdHkuXG4gICAgICBpZiAoXy5rZXlzKGIpLmxlbmd0aCAhPT0gbGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgICAgLy8gRGVlcCBjb21wYXJlIGVhY2ggbWVtYmVyXG4gICAgICAgIGtleSA9IGtleXNbbGVuZ3RoXTtcbiAgICAgICAgaWYgKCEoXy5oYXMoYiwga2V5KSAmJiBlcShhW2tleV0sIGJba2V5XSwgYVN0YWNrLCBiU3RhY2spKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBSZW1vdmUgdGhlIGZpcnN0IG9iamVjdCBmcm9tIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucG9wKCk7XG4gICAgYlN0YWNrLnBvcCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIFBlcmZvcm0gYSBkZWVwIGNvbXBhcmlzb24gdG8gY2hlY2sgaWYgdHdvIG9iamVjdHMgYXJlIGVxdWFsLlxuICBfLmlzRXF1YWwgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGVxKGEsIGIpO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gYXJyYXksIHN0cmluZywgb3Igb2JqZWN0IGVtcHR5P1xuICAvLyBBbiBcImVtcHR5XCIgb2JqZWN0IGhhcyBubyBlbnVtZXJhYmxlIG93bi1wcm9wZXJ0aWVzLlxuICBfLmlzRW1wdHkgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiB0cnVlO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopICYmIChfLmlzQXJyYXkob2JqKSB8fCBfLmlzU3RyaW5nKG9iaikgfHwgXy5pc0FyZ3VtZW50cyhvYmopKSkgcmV0dXJuIG9iai5sZW5ndGggPT09IDA7XG4gICAgcmV0dXJuIF8ua2V5cyhvYmopLmxlbmd0aCA9PT0gMDtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgRE9NIGVsZW1lbnQ/XG4gIF8uaXNFbGVtZW50ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuICEhKG9iaiAmJiBvYmoubm9kZVR5cGUgPT09IDEpO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYW4gYXJyYXk/XG4gIC8vIERlbGVnYXRlcyB0byBFQ01BNSdzIG5hdGl2ZSBBcnJheS5pc0FycmF5XG4gIF8uaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIGFuIG9iamVjdD9cbiAgXy5pc09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciB0eXBlID0gdHlwZW9mIG9iajtcbiAgICByZXR1cm4gdHlwZSA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlID09PSAnb2JqZWN0JyAmJiAhIW9iajtcbiAgfTtcblxuICAvLyBBZGQgc29tZSBpc1R5cGUgbWV0aG9kczogaXNBcmd1bWVudHMsIGlzRnVuY3Rpb24sIGlzU3RyaW5nLCBpc051bWJlciwgaXNEYXRlLCBpc1JlZ0V4cCwgaXNFcnJvci5cbiAgXy5lYWNoKFsnQXJndW1lbnRzJywgJ0Z1bmN0aW9uJywgJ1N0cmluZycsICdOdW1iZXInLCAnRGF0ZScsICdSZWdFeHAnLCAnRXJyb3InXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIF9bJ2lzJyArIG5hbWVdID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCAnICsgbmFtZSArICddJztcbiAgICB9O1xuICB9KTtcblxuICAvLyBEZWZpbmUgYSBmYWxsYmFjayB2ZXJzaW9uIG9mIHRoZSBtZXRob2QgaW4gYnJvd3NlcnMgKGFoZW0sIElFIDwgOSksIHdoZXJlXG4gIC8vIHRoZXJlIGlzbid0IGFueSBpbnNwZWN0YWJsZSBcIkFyZ3VtZW50c1wiIHR5cGUuXG4gIGlmICghXy5pc0FyZ3VtZW50cyhhcmd1bWVudHMpKSB7XG4gICAgXy5pc0FyZ3VtZW50cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIF8uaGFzKG9iaiwgJ2NhbGxlZScpO1xuICAgIH07XG4gIH1cblxuICAvLyBPcHRpbWl6ZSBgaXNGdW5jdGlvbmAgaWYgYXBwcm9wcmlhdGUuIFdvcmsgYXJvdW5kIHNvbWUgdHlwZW9mIGJ1Z3MgaW4gb2xkIHY4LFxuICAvLyBJRSAxMSAoIzE2MjEpLCBhbmQgaW4gU2FmYXJpIDggKCMxOTI5KS5cbiAgaWYgKHR5cGVvZiAvLi8gIT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgSW50OEFycmF5ICE9ICdvYmplY3QnKSB7XG4gICAgXy5pc0Z1bmN0aW9uID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PSAnZnVuY3Rpb24nIHx8IGZhbHNlO1xuICAgIH07XG4gIH1cblxuICAvLyBJcyBhIGdpdmVuIG9iamVjdCBhIGZpbml0ZSBudW1iZXI/XG4gIF8uaXNGaW5pdGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gaXNGaW5pdGUob2JqKSAmJiAhaXNOYU4ocGFyc2VGbG9hdChvYmopKTtcbiAgfTtcblxuICAvLyBJcyB0aGUgZ2l2ZW4gdmFsdWUgYE5hTmA/IChOYU4gaXMgdGhlIG9ubHkgbnVtYmVyIHdoaWNoIGRvZXMgbm90IGVxdWFsIGl0c2VsZikuXG4gIF8uaXNOYU4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gXy5pc051bWJlcihvYmopICYmIG9iaiAhPT0gK29iajtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgYm9vbGVhbj9cbiAgXy5pc0Jvb2xlYW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB0cnVlIHx8IG9iaiA9PT0gZmFsc2UgfHwgdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBCb29sZWFuXSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBlcXVhbCB0byBudWxsP1xuICBfLmlzTnVsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IG51bGw7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSB1bmRlZmluZWQ/XG4gIF8uaXNVbmRlZmluZWQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB2b2lkIDA7XG4gIH07XG5cbiAgLy8gU2hvcnRjdXQgZnVuY3Rpb24gZm9yIGNoZWNraW5nIGlmIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBwcm9wZXJ0eSBkaXJlY3RseVxuICAvLyBvbiBpdHNlbGYgKGluIG90aGVyIHdvcmRzLCBub3Qgb24gYSBwcm90b3R5cGUpLlxuICBfLmhhcyA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIG9iaiAhPSBudWxsICYmIGhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xuICB9O1xuXG4gIC8vIFV0aWxpdHkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gUnVuIFVuZGVyc2NvcmUuanMgaW4gKm5vQ29uZmxpY3QqIG1vZGUsIHJldHVybmluZyB0aGUgYF9gIHZhcmlhYmxlIHRvIGl0c1xuICAvLyBwcmV2aW91cyBvd25lci4gUmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8ubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xuICAgIHJvb3QuXyA9IHByZXZpb3VzVW5kZXJzY29yZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvLyBLZWVwIHRoZSBpZGVudGl0eSBmdW5jdGlvbiBhcm91bmQgZm9yIGRlZmF1bHQgaXRlcmF0ZWVzLlxuICBfLmlkZW50aXR5ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH07XG5cbiAgLy8gUHJlZGljYXRlLWdlbmVyYXRpbmcgZnVuY3Rpb25zLiBPZnRlbiB1c2VmdWwgb3V0c2lkZSBvZiBVbmRlcnNjb3JlLlxuICBfLmNvbnN0YW50ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfTtcbiAgfTtcblxuICBfLm5vb3AgPSBmdW5jdGlvbigpe307XG5cbiAgXy5wcm9wZXJ0eSA9IGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBvYmogPT0gbnVsbCA/IHZvaWQgMCA6IG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gR2VuZXJhdGVzIGEgZnVuY3Rpb24gZm9yIGEgZ2l2ZW4gb2JqZWN0IHRoYXQgcmV0dXJucyBhIGdpdmVuIHByb3BlcnR5LlxuICBfLnByb3BlcnR5T2YgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09IG51bGwgPyBmdW5jdGlvbigpe30gOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBvYmpba2V5XTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBwcmVkaWNhdGUgZm9yIGNoZWNraW5nIHdoZXRoZXIgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHNldCBvZiBcbiAgLy8gYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ubWF0Y2hlciA9IF8ubWF0Y2hlcyA9IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgYXR0cnMgPSBfLmV4dGVuZE93bih7fSwgYXR0cnMpO1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBfLmlzTWF0Y2gob2JqLCBhdHRycyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSdW4gYSBmdW5jdGlvbiAqKm4qKiB0aW1lcy5cbiAgXy50aW1lcyA9IGZ1bmN0aW9uKG4sIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIGFjY3VtID0gQXJyYXkoTWF0aC5tYXgoMCwgbikpO1xuICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCwgMSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIGFjY3VtW2ldID0gaXRlcmF0ZWUoaSk7XG4gICAgcmV0dXJuIGFjY3VtO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHJhbmRvbSBpbnRlZ2VyIGJldHdlZW4gbWluIGFuZCBtYXggKGluY2x1c2l2ZSkuXG4gIF8ucmFuZG9tID0gZnVuY3Rpb24obWluLCBtYXgpIHtcbiAgICBpZiAobWF4ID09IG51bGwpIHtcbiAgICAgIG1heCA9IG1pbjtcbiAgICAgIG1pbiA9IDA7XG4gICAgfVxuICAgIHJldHVybiBtaW4gKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluICsgMSkpO1xuICB9O1xuXG4gIC8vIEEgKHBvc3NpYmx5IGZhc3Rlcikgd2F5IHRvIGdldCB0aGUgY3VycmVudCB0aW1lc3RhbXAgYXMgYW4gaW50ZWdlci5cbiAgXy5ub3cgPSBEYXRlLm5vdyB8fCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH07XG5cbiAgIC8vIExpc3Qgb2YgSFRNTCBlbnRpdGllcyBmb3IgZXNjYXBpbmcuXG4gIHZhciBlc2NhcGVNYXAgPSB7XG4gICAgJyYnOiAnJmFtcDsnLFxuICAgICc8JzogJyZsdDsnLFxuICAgICc+JzogJyZndDsnLFxuICAgICdcIic6ICcmcXVvdDsnLFxuICAgIFwiJ1wiOiAnJiN4Mjc7JyxcbiAgICAnYCc6ICcmI3g2MDsnXG4gIH07XG4gIHZhciB1bmVzY2FwZU1hcCA9IF8uaW52ZXJ0KGVzY2FwZU1hcCk7XG5cbiAgLy8gRnVuY3Rpb25zIGZvciBlc2NhcGluZyBhbmQgdW5lc2NhcGluZyBzdHJpbmdzIHRvL2Zyb20gSFRNTCBpbnRlcnBvbGF0aW9uLlxuICB2YXIgY3JlYXRlRXNjYXBlciA9IGZ1bmN0aW9uKG1hcCkge1xuICAgIHZhciBlc2NhcGVyID0gZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgIHJldHVybiBtYXBbbWF0Y2hdO1xuICAgIH07XG4gICAgLy8gUmVnZXhlcyBmb3IgaWRlbnRpZnlpbmcgYSBrZXkgdGhhdCBuZWVkcyB0byBiZSBlc2NhcGVkXG4gICAgdmFyIHNvdXJjZSA9ICcoPzonICsgXy5rZXlzKG1hcCkuam9pbignfCcpICsgJyknO1xuICAgIHZhciB0ZXN0UmVnZXhwID0gUmVnRXhwKHNvdXJjZSk7XG4gICAgdmFyIHJlcGxhY2VSZWdleHAgPSBSZWdFeHAoc291cmNlLCAnZycpO1xuICAgIHJldHVybiBmdW5jdGlvbihzdHJpbmcpIHtcbiAgICAgIHN0cmluZyA9IHN0cmluZyA9PSBudWxsID8gJycgOiAnJyArIHN0cmluZztcbiAgICAgIHJldHVybiB0ZXN0UmVnZXhwLnRlc3Qoc3RyaW5nKSA/IHN0cmluZy5yZXBsYWNlKHJlcGxhY2VSZWdleHAsIGVzY2FwZXIpIDogc3RyaW5nO1xuICAgIH07XG4gIH07XG4gIF8uZXNjYXBlID0gY3JlYXRlRXNjYXBlcihlc2NhcGVNYXApO1xuICBfLnVuZXNjYXBlID0gY3JlYXRlRXNjYXBlcih1bmVzY2FwZU1hcCk7XG5cbiAgLy8gSWYgdGhlIHZhbHVlIG9mIHRoZSBuYW1lZCBgcHJvcGVydHlgIGlzIGEgZnVuY3Rpb24gdGhlbiBpbnZva2UgaXQgd2l0aCB0aGVcbiAgLy8gYG9iamVjdGAgYXMgY29udGV4dDsgb3RoZXJ3aXNlLCByZXR1cm4gaXQuXG4gIF8ucmVzdWx0ID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSwgZmFsbGJhY2spIHtcbiAgICB2YXIgdmFsdWUgPSBvYmplY3QgPT0gbnVsbCA/IHZvaWQgMCA6IG9iamVjdFtwcm9wZXJ0eV07XG4gICAgaWYgKHZhbHVlID09PSB2b2lkIDApIHtcbiAgICAgIHZhbHVlID0gZmFsbGJhY2s7XG4gICAgfVxuICAgIHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUuY2FsbChvYmplY3QpIDogdmFsdWU7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgYSB1bmlxdWUgaW50ZWdlciBpZCAodW5pcXVlIHdpdGhpbiB0aGUgZW50aXJlIGNsaWVudCBzZXNzaW9uKS5cbiAgLy8gVXNlZnVsIGZvciB0ZW1wb3JhcnkgRE9NIGlkcy5cbiAgdmFyIGlkQ291bnRlciA9IDA7XG4gIF8udW5pcXVlSWQgPSBmdW5jdGlvbihwcmVmaXgpIHtcbiAgICB2YXIgaWQgPSArK2lkQ291bnRlciArICcnO1xuICAgIHJldHVybiBwcmVmaXggPyBwcmVmaXggKyBpZCA6IGlkO1xuICB9O1xuXG4gIC8vIEJ5IGRlZmF1bHQsIFVuZGVyc2NvcmUgdXNlcyBFUkItc3R5bGUgdGVtcGxhdGUgZGVsaW1pdGVycywgY2hhbmdlIHRoZVxuICAvLyBmb2xsb3dpbmcgdGVtcGxhdGUgc2V0dGluZ3MgdG8gdXNlIGFsdGVybmF0aXZlIGRlbGltaXRlcnMuXG4gIF8udGVtcGxhdGVTZXR0aW5ncyA9IHtcbiAgICBldmFsdWF0ZSAgICA6IC88JShbXFxzXFxTXSs/KSU+L2csXG4gICAgaW50ZXJwb2xhdGUgOiAvPCU9KFtcXHNcXFNdKz8pJT4vZyxcbiAgICBlc2NhcGUgICAgICA6IC88JS0oW1xcc1xcU10rPyklPi9nXG4gIH07XG5cbiAgLy8gV2hlbiBjdXN0b21pemluZyBgdGVtcGxhdGVTZXR0aW5nc2AsIGlmIHlvdSBkb24ndCB3YW50IHRvIGRlZmluZSBhblxuICAvLyBpbnRlcnBvbGF0aW9uLCBldmFsdWF0aW9uIG9yIGVzY2FwaW5nIHJlZ2V4LCB3ZSBuZWVkIG9uZSB0aGF0IGlzXG4gIC8vIGd1YXJhbnRlZWQgbm90IHRvIG1hdGNoLlxuICB2YXIgbm9NYXRjaCA9IC8oLileLztcblxuICAvLyBDZXJ0YWluIGNoYXJhY3RlcnMgbmVlZCB0byBiZSBlc2NhcGVkIHNvIHRoYXQgdGhleSBjYW4gYmUgcHV0IGludG8gYVxuICAvLyBzdHJpbmcgbGl0ZXJhbC5cbiAgdmFyIGVzY2FwZXMgPSB7XG4gICAgXCInXCI6ICAgICAgXCInXCIsXG4gICAgJ1xcXFwnOiAgICAgJ1xcXFwnLFxuICAgICdcXHInOiAgICAgJ3InLFxuICAgICdcXG4nOiAgICAgJ24nLFxuICAgICdcXHUyMDI4JzogJ3UyMDI4JyxcbiAgICAnXFx1MjAyOSc6ICd1MjAyOSdcbiAgfTtcblxuICB2YXIgZXNjYXBlciA9IC9cXFxcfCd8XFxyfFxcbnxcXHUyMDI4fFxcdTIwMjkvZztcblxuICB2YXIgZXNjYXBlQ2hhciA9IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgcmV0dXJuICdcXFxcJyArIGVzY2FwZXNbbWF0Y2hdO1xuICB9O1xuXG4gIC8vIEphdmFTY3JpcHQgbWljcm8tdGVtcGxhdGluZywgc2ltaWxhciB0byBKb2huIFJlc2lnJ3MgaW1wbGVtZW50YXRpb24uXG4gIC8vIFVuZGVyc2NvcmUgdGVtcGxhdGluZyBoYW5kbGVzIGFyYml0cmFyeSBkZWxpbWl0ZXJzLCBwcmVzZXJ2ZXMgd2hpdGVzcGFjZSxcbiAgLy8gYW5kIGNvcnJlY3RseSBlc2NhcGVzIHF1b3RlcyB3aXRoaW4gaW50ZXJwb2xhdGVkIGNvZGUuXG4gIC8vIE5COiBgb2xkU2V0dGluZ3NgIG9ubHkgZXhpc3RzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgXy50ZW1wbGF0ZSA9IGZ1bmN0aW9uKHRleHQsIHNldHRpbmdzLCBvbGRTZXR0aW5ncykge1xuICAgIGlmICghc2V0dGluZ3MgJiYgb2xkU2V0dGluZ3MpIHNldHRpbmdzID0gb2xkU2V0dGluZ3M7XG4gICAgc2V0dGluZ3MgPSBfLmRlZmF1bHRzKHt9LCBzZXR0aW5ncywgXy50ZW1wbGF0ZVNldHRpbmdzKTtcblxuICAgIC8vIENvbWJpbmUgZGVsaW1pdGVycyBpbnRvIG9uZSByZWd1bGFyIGV4cHJlc3Npb24gdmlhIGFsdGVybmF0aW9uLlxuICAgIHZhciBtYXRjaGVyID0gUmVnRXhwKFtcbiAgICAgIChzZXR0aW5ncy5lc2NhcGUgfHwgbm9NYXRjaCkuc291cmNlLFxuICAgICAgKHNldHRpbmdzLmludGVycG9sYXRlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5ldmFsdWF0ZSB8fCBub01hdGNoKS5zb3VyY2VcbiAgICBdLmpvaW4oJ3wnKSArICd8JCcsICdnJyk7XG5cbiAgICAvLyBDb21waWxlIHRoZSB0ZW1wbGF0ZSBzb3VyY2UsIGVzY2FwaW5nIHN0cmluZyBsaXRlcmFscyBhcHByb3ByaWF0ZWx5LlxuICAgIHZhciBpbmRleCA9IDA7XG4gICAgdmFyIHNvdXJjZSA9IFwiX19wKz0nXCI7XG4gICAgdGV4dC5yZXBsYWNlKG1hdGNoZXIsIGZ1bmN0aW9uKG1hdGNoLCBlc2NhcGUsIGludGVycG9sYXRlLCBldmFsdWF0ZSwgb2Zmc2V0KSB7XG4gICAgICBzb3VyY2UgKz0gdGV4dC5zbGljZShpbmRleCwgb2Zmc2V0KS5yZXBsYWNlKGVzY2FwZXIsIGVzY2FwZUNoYXIpO1xuICAgICAgaW5kZXggPSBvZmZzZXQgKyBtYXRjaC5sZW5ndGg7XG5cbiAgICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBlc2NhcGUgKyBcIikpPT1udWxsPycnOl8uZXNjYXBlKF9fdCkpK1xcbidcIjtcbiAgICAgIH0gZWxzZSBpZiAoaW50ZXJwb2xhdGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBpbnRlcnBvbGF0ZSArIFwiKSk9PW51bGw/Jyc6X190KStcXG4nXCI7XG4gICAgICB9IGVsc2UgaWYgKGV2YWx1YXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIic7XFxuXCIgKyBldmFsdWF0ZSArIFwiXFxuX19wKz0nXCI7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkb2JlIFZNcyBuZWVkIHRoZSBtYXRjaCByZXR1cm5lZCB0byBwcm9kdWNlIHRoZSBjb3JyZWN0IG9mZmVzdC5cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcbiAgICBzb3VyY2UgKz0gXCInO1xcblwiO1xuXG4gICAgLy8gSWYgYSB2YXJpYWJsZSBpcyBub3Qgc3BlY2lmaWVkLCBwbGFjZSBkYXRhIHZhbHVlcyBpbiBsb2NhbCBzY29wZS5cbiAgICBpZiAoIXNldHRpbmdzLnZhcmlhYmxlKSBzb3VyY2UgPSAnd2l0aChvYmp8fHt9KXtcXG4nICsgc291cmNlICsgJ31cXG4nO1xuXG4gICAgc291cmNlID0gXCJ2YXIgX190LF9fcD0nJyxfX2o9QXJyYXkucHJvdG90eXBlLmpvaW4sXCIgK1xuICAgICAgXCJwcmludD1mdW5jdGlvbigpe19fcCs9X19qLmNhbGwoYXJndW1lbnRzLCcnKTt9O1xcblwiICtcbiAgICAgIHNvdXJjZSArICdyZXR1cm4gX19wO1xcbic7XG5cbiAgICB0cnkge1xuICAgICAgdmFyIHJlbmRlciA9IG5ldyBGdW5jdGlvbihzZXR0aW5ncy52YXJpYWJsZSB8fCAnb2JqJywgJ18nLCBzb3VyY2UpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGUuc291cmNlID0gc291cmNlO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICB2YXIgdGVtcGxhdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICByZXR1cm4gcmVuZGVyLmNhbGwodGhpcywgZGF0YSwgXyk7XG4gICAgfTtcblxuICAgIC8vIFByb3ZpZGUgdGhlIGNvbXBpbGVkIHNvdXJjZSBhcyBhIGNvbnZlbmllbmNlIGZvciBwcmVjb21waWxhdGlvbi5cbiAgICB2YXIgYXJndW1lbnQgPSBzZXR0aW5ncy52YXJpYWJsZSB8fCAnb2JqJztcbiAgICB0ZW1wbGF0ZS5zb3VyY2UgPSAnZnVuY3Rpb24oJyArIGFyZ3VtZW50ICsgJyl7XFxuJyArIHNvdXJjZSArICd9JztcblxuICAgIHJldHVybiB0ZW1wbGF0ZTtcbiAgfTtcblxuICAvLyBBZGQgYSBcImNoYWluXCIgZnVuY3Rpb24uIFN0YXJ0IGNoYWluaW5nIGEgd3JhcHBlZCBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5jaGFpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBpbnN0YW5jZSA9IF8ob2JqKTtcbiAgICBpbnN0YW5jZS5fY2hhaW4gPSB0cnVlO1xuICAgIHJldHVybiBpbnN0YW5jZTtcbiAgfTtcblxuICAvLyBPT1BcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gIC8vIElmIFVuZGVyc2NvcmUgaXMgY2FsbGVkIGFzIGEgZnVuY3Rpb24sIGl0IHJldHVybnMgYSB3cmFwcGVkIG9iamVjdCB0aGF0XG4gIC8vIGNhbiBiZSB1c2VkIE9PLXN0eWxlLiBUaGlzIHdyYXBwZXIgaG9sZHMgYWx0ZXJlZCB2ZXJzaW9ucyBvZiBhbGwgdGhlXG4gIC8vIHVuZGVyc2NvcmUgZnVuY3Rpb25zLiBXcmFwcGVkIG9iamVjdHMgbWF5IGJlIGNoYWluZWQuXG5cbiAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGNvbnRpbnVlIGNoYWluaW5nIGludGVybWVkaWF0ZSByZXN1bHRzLlxuICB2YXIgcmVzdWx0ID0gZnVuY3Rpb24oaW5zdGFuY2UsIG9iaikge1xuICAgIHJldHVybiBpbnN0YW5jZS5fY2hhaW4gPyBfKG9iaikuY2hhaW4oKSA6IG9iajtcbiAgfTtcblxuICAvLyBBZGQgeW91ciBvd24gY3VzdG9tIGZ1bmN0aW9ucyB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8ubWl4aW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICBfLmVhY2goXy5mdW5jdGlvbnMob2JqKSwgZnVuY3Rpb24obmFtZSkge1xuICAgICAgdmFyIGZ1bmMgPSBfW25hbWVdID0gb2JqW25hbWVdO1xuICAgICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBbdGhpcy5fd3JhcHBlZF07XG4gICAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBmdW5jLmFwcGx5KF8sIGFyZ3MpKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQWRkIGFsbCBvZiB0aGUgVW5kZXJzY29yZSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIgb2JqZWN0LlxuICBfLm1peGluKF8pO1xuXG4gIC8vIEFkZCBhbGwgbXV0YXRvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIF8uZWFjaChbJ3BvcCcsICdwdXNoJywgJ3JldmVyc2UnLCAnc2hpZnQnLCAnc29ydCcsICdzcGxpY2UnLCAndW5zaGlmdCddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIG1ldGhvZCA9IEFycmF5UHJvdG9bbmFtZV07XG4gICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBvYmogPSB0aGlzLl93cmFwcGVkO1xuICAgICAgbWV0aG9kLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcbiAgICAgIGlmICgobmFtZSA9PT0gJ3NoaWZ0JyB8fCBuYW1lID09PSAnc3BsaWNlJykgJiYgb2JqLmxlbmd0aCA9PT0gMCkgZGVsZXRlIG9ialswXTtcbiAgICAgIHJldHVybiByZXN1bHQodGhpcywgb2JqKTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBBZGQgYWxsIGFjY2Vzc29yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgXy5lYWNoKFsnY29uY2F0JywgJ2pvaW4nLCAnc2xpY2UnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIG1ldGhvZC5hcHBseSh0aGlzLl93cmFwcGVkLCBhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBFeHRyYWN0cyB0aGUgcmVzdWx0IGZyb20gYSB3cmFwcGVkIGFuZCBjaGFpbmVkIG9iamVjdC5cbiAgXy5wcm90b3R5cGUudmFsdWUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fd3JhcHBlZDtcbiAgfTtcblxuICAvLyBQcm92aWRlIHVud3JhcHBpbmcgcHJveHkgZm9yIHNvbWUgbWV0aG9kcyB1c2VkIGluIGVuZ2luZSBvcGVyYXRpb25zXG4gIC8vIHN1Y2ggYXMgYXJpdGhtZXRpYyBhbmQgSlNPTiBzdHJpbmdpZmljYXRpb24uXG4gIF8ucHJvdG90eXBlLnZhbHVlT2YgPSBfLnByb3RvdHlwZS50b0pTT04gPSBfLnByb3RvdHlwZS52YWx1ZTtcbiAgXG4gIF8ucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICcnICsgdGhpcy5fd3JhcHBlZDtcbiAgfTtcblxuICAvLyBBTUQgcmVnaXN0cmF0aW9uIGhhcHBlbnMgYXQgdGhlIGVuZCBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIEFNRCBsb2FkZXJzXG4gIC8vIHRoYXQgbWF5IG5vdCBlbmZvcmNlIG5leHQtdHVybiBzZW1hbnRpY3Mgb24gbW9kdWxlcy4gRXZlbiB0aG91Z2ggZ2VuZXJhbFxuICAvLyBwcmFjdGljZSBmb3IgQU1EIHJlZ2lzdHJhdGlvbiBpcyB0byBiZSBhbm9ueW1vdXMsIHVuZGVyc2NvcmUgcmVnaXN0ZXJzXG4gIC8vIGFzIGEgbmFtZWQgbW9kdWxlIGJlY2F1c2UsIGxpa2UgalF1ZXJ5LCBpdCBpcyBhIGJhc2UgbGlicmFyeSB0aGF0IGlzXG4gIC8vIHBvcHVsYXIgZW5vdWdoIHRvIGJlIGJ1bmRsZWQgaW4gYSB0aGlyZCBwYXJ0eSBsaWIsIGJ1dCBub3QgYmUgcGFydCBvZlxuICAvLyBhbiBBTUQgbG9hZCByZXF1ZXN0LiBUaG9zZSBjYXNlcyBjb3VsZCBnZW5lcmF0ZSBhbiBlcnJvciB3aGVuIGFuXG4gIC8vIGFub255bW91cyBkZWZpbmUoKSBpcyBjYWxsZWQgb3V0c2lkZSBvZiBhIGxvYWRlciByZXF1ZXN0LlxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKCd1bmRlcnNjb3JlJywgW10sIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIF87XG4gICAgfSk7XG4gIH1cbn0uY2FsbCh0aGlzKSk7XG4iXX0=
