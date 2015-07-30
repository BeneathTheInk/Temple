/*
 * Temple (with Source Map)
 * (c) 2014-2015 Beneath the Ink, Inc.
 * Copyright (C) 2011--2015 Meteor Development Group
 * MIT License
 * Version 0.5.7
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
},{"./events":2,"./util":15,"underscore":19}],2:[function(require,module,exports){
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
		var fn = _.once(function() {
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
			if (remove || _.isEmpty(obj._events)) delete this._listeningTo[id];
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

},{"underscore":19}],3:[function(require,module,exports){
var _ = require("underscore"),
	Trackr = require("trackr"),
	parse = require("./m+xml").parse,
	NODE_TYPE = require("./types"),
	track = require("./track");

// properties that Node.js and the browser can handle
var Temple = module.exports = _.defaults({
	VERSION: "0.5.7",
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

// attach the other parts that Node can't use
Temple.DOMRange = require("./domrange");
Temple.View = require("./view");
Temple.Section = require("./section");

// load the real class for the browser
Temple = module.exports = _.extend(require("./mustache"), Temple);

// load the plugin API
_.extend(Temple, require("./plugins"));

},{"./domrange":1,"./events":2,"./m+xml":4,"./model":5,"./mustache":6,"./plugins":9,"./section":12,"./track":13,"./types":14,"./util":15,"./view":16,"trackr":18,"underscore":19}],4:[function(require,module,exports){
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

        peg$startRuleIndices = { start: 0, attrValue: 9, attrArguments: 10, pathQuery: 19, path: 21 },
        peg$startRuleIndex   = 0,

        peg$consts = [
          function(html) {
          	return {
          		type: NODE_TYPE.ROOT,
          		children: html,
          		version: Mustache.VERSION
          	}
          },
          [],
          function(nodes) { return _.compact(nodes); },
          peg$FAILED,
          /^[^<{]/,
          { type: "class", value: "[^<{]", description: "[^<{]" },
          function(text) { return { type: NODE_TYPE.TEXT, value: text.join("") }; },
          "<!--",
          { type: "literal", value: "<!--", description: "\"<!--\"" },
          void 0,
          "-->",
          { type: "literal", value: "-->", description: "\"-->\"" },
          { type: "any", description: "any character" },
          function(v) {
          		return { type: NODE_TYPE.XCOMMENT, value: v };
          	},
          function(start, nodes, end) {
          		if (start.name.toLowerCase() !== end.toLowerCase()) {
          			throw new Error("Element tag mismatch: " + start.name + " !== " + end);
          		}

          		start.type = NODE_TYPE.ELEMENT;
          		start.children = nodes;
          		return start;
          	},
          "<",
          { type: "literal", value: "<", description: "\"<\"" },
          "/>",
          { type: "literal", value: "/>", description: "\"/>\"" },
          function(tagname, attributes) {
          		return {
          			name: tagname,
          			type: NODE_TYPE.ELEMENT,
          			attributes: attributes,
          			children: []
          		}
          	},
          ">",
          { type: "literal", value: ">", description: "\">\"" },
          function(tagname, attributes) {
          		return { name: tagname, attributes: attributes };
          	},
          "</",
          { type: "literal", value: "</", description: "\"</\"" },
          function(tagname) { return tagname; },
          null,
          "=",
          { type: "literal", value: "=", description: "\"=\"" },
          function(key, value) {
          		value = value != null ? value[2] : "";
          		var args

          		// could fail on complex attributes
          		try {
          			args = parse(value,  _.extend({}, options, { startRule: "attrArguments" }));
          		} catch(e) {
          			args = [{ type: NODE_TYPE.LITERAL, value: value }];
          		}

          		return {
          			type: NODE_TYPE.ATTRIBUTE,
          			name: key,
          			value: value,
          			children: parse(value, _.extend({}, options, { startRule: "attrValue" })),
          			arguments: args
          		}
          	},
          ",",
          { type: "literal", value: ",", description: "\",\"" },
          function(l, r) { return [].concat(l, _.pluck(r, 1)); },
          function(v) { return v.trim(); },
          function(val) {
          		if (val != null && val.type) return val;
          		return { type: NODE_TYPE.LITERAL, value: val };
          	},
          function(start, nodes, end) {
          		if (options.strict && !_.isEqual(start.value.raw, end)) {
          			throw new Error("Section tag mismatch: " + start.value.raw + " !== " + end);
          		}

          		start.value = start.value.result;
          		start.children = nodes;
          		return start;
          	},
          "{{",
          { type: "literal", value: "{{", description: "\"{{\"" },
          /^[#\^]/,
          { type: "class", value: "[#\\^]", description: "[#\\^]" },
          "}}",
          { type: "literal", value: "}}", description: "\"}}\"" },
          function(type, value) {
          		return {
          			type: NODE_TYPE[type === "#" ? "SECTION" : "INVERTED"],
          			value: value
          		}
          	},
          "{{/",
          { type: "literal", value: "{{/", description: "\"{{/\"" },
          /^[^}]/,
          { type: "class", value: "[^}]", description: "[^}]" },
          function(value) { return value.join(""); },
          "{{{",
          { type: "literal", value: "{{{", description: "\"{{{\"" },
          "}}}",
          { type: "literal", value: "}}}", description: "\"}}}\"" },
          function(value) {
          		return {
          			type: NODE_TYPE.INTERPOLATOR,
          			value: value[1]
          		}
          	},
          /^[\/#{!>\^]/,
          { type: "class", value: "[\\/#{!>\\^]", description: "[\\/#{!>\\^]" },
          "&",
          { type: "literal", value: "&", description: "\"&\"" },
          function(m, value) {
          		return {
          			type: m ? NODE_TYPE.TRIPLE : NODE_TYPE.INTERPOLATOR,
          			value: value
          		}
          	},
          function(value) {
          		return {
          			type: NODE_TYPE.TRIPLE,
          			value: value
          		}
          	},
          /^[!>]/,
          { type: "class", value: "[!>]", description: "[!>]" },
          function(m, value) {
          		return {
          			type: m === ">" ? NODE_TYPE.PARTIAL : NODE_TYPE.MCOMMENT,
          			value: value.join("").trim()
          		}
          	},
          "|",
          { type: "literal", value: "|", description: "\"|\"" },
          function(m) { return { raw: text(), result: m } },
          function(p, c) {
          		if (p == null) p = { type: "all" };
          		p.parts = c;
          		return p;
          	},
          function(p) { p.parts = []; return p; },
          "../",
          { type: "literal", value: "../", description: "\"../\"" },
          function(d) { return { type: "parent", distance: d.length }; },
          "./",
          { type: "literal", value: "./", description: "\"./\"" },
          function() { return { type: "local" }; },
          ".",
          { type: "literal", value: ".", description: "\".\"" },
          "/",
          { type: "literal", value: "/", description: "\"/\"" },
          function() { return { type: "root" }; },
          /^[a-z0-9$_]/i,
          { type: "class", value: "[a-z0-9$_]i", description: "[a-z0-9$_]i" },
          /^[a-z0-9:\-_$]/i,
          { type: "class", value: "[a-z0-9:\\-_$]i", description: "[a-z0-9:\\-_$]i" },
          function(k, c) { return { key: k, children: c } },
          "[",
          { type: "literal", value: "[", description: "\"[\"" },
          "]",
          { type: "literal", value: "]", description: "\"]\"" },
          function(c) { return c; },
          "true",
          { type: "literal", value: "true", description: "\"true\"" },
          function() { return true; },
          "false",
          { type: "literal", value: "false", description: "\"false\"" },
          function() { return false; },
          "-",
          { type: "literal", value: "-", description: "\"-\"" },
          /^[0-9]/,
          { type: "class", value: "[0-9]", description: "[0-9]" },
          function() { return parseFloat(text(), 10); },
          function() { return parseInt(text(), 10); },
          "\"",
          { type: "literal", value: "\"", description: "\"\\\"\"" },
          /^[^"]/,
          { type: "class", value: "[^\"]", description: "[^\"]" },
          function(v) { return v.join(""); },
          "'",
          { type: "literal", value: "'", description: "\"'\"" },
          /^[^']/,
          { type: "class", value: "[^']", description: "[^']" },
          "null",
          { type: "literal", value: "null", description: "\"null\"" },
          function() { return null; },
          "undefined",
          { type: "literal", value: "undefined", description: "\"undefined\"" },
          "void",
          { type: "literal", value: "void", description: "\"void\"" },
          /^[,; \t\n\r]/,
          { type: "class", value: "[,; \\t\\n\\r]", description: "[,; \\t\\n\\r]" },
          function() { return void 0; },
          /^[a-z0-9_\-]/i,
          { type: "class", value: "[a-z0-9_\\-]i", description: "[a-z0-9_\\-]i" },
          function(k) { return k; },
          { type: "other", description: "whitespace" },
          /^[ \t\n\r]/,
          { type: "class", value: "[ \\t\\n\\r]", description: "[ \\t\\n\\r]" },
          { type: "other", description: "guaranteed whitespace" },
          "\\",
          { type: "literal", value: "\\", description: "\"\\\\\"" },
          function(char) { return char; }
        ],

        peg$bytecode = [
          peg$decode("!7!+' 4!6 !! %"),
          peg$decode("! !7,*A \"72*; \"70*5 \"71*/ \"7#*) \"7$*# \"7\",G&7,*A \"72*; \"70*5 \"71*/ \"7#*) \"7$*# \"7\"\"+' 4!6\"!! %"),
          peg$decode("! !0$\"\"1!3%+,$,)&0$\"\"1!3%\"\"\" #+' 4!6&!! %"),
          peg$decode("!.'\"\"2'3(+\xAC$! !!!8.*\"\"2*3+9*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #,Q&!!8.*\"\"2*3+9*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #\"+! (%+8%.*\"\"2*3++(%4#6-#!!%$## #$\"# #\"# #"),
          peg$decode("7%*I \"!7&+>$7!+4%7'+*%4#6.##\"! %$## #$\"# #\"# #"),
          peg$decode("!./\"\"2/30+U$7@+K% !7(,#&7(\"+9%.1\"\"2132+)%4$63$\"\"!%$$# #$## #$\"# #\"# #"),
          peg$decode("!./\"\"2/30+U$7@+K% !7(,#&7(\"+9%.4\"\"2435+)%4$66$\"\"!%$$# #$## #$\"# #\"# #"),
          peg$decode("!.7\"\"2738+B$7@+8%.4\"\"2435+(%4#69#!!%$## #$\"# #\"# #"),
          peg$decode("!7@+h$!.;\"\"2;3<+A$7A+7%7=+-%7A+#%'$%$$# #$## #$\"# #\"# #*# \" :+)%4\"6=\"\"! %$\"# #\"# #"),
          peg$decode("! !7,*5 \"72*/ \"70*) \"71*# \"7\",;&7,*5 \"72*/ \"70*) \"71*# \"7\"\"+' 4!6\"!! %"),
          peg$decode("!7++q$ !!.>\"\"2>3?+-$7++#%'\"%$\"# #\"# #,>&!.>\"\"2>3?+-$7++#%'\"%$\"# #\"# #\"+)%4\"6@\"\"! %$\"# #\"# #"),
          peg$decode("!7A+\xD6$7/*\xB7 \"7=*\xB1 \"7:*\xAB \"7;*\xA5 \"7>*\x9F \"7?*\x99 \"!! !!!8.>\"\"2>3?9*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #,Q&!!8.>\"\"2>3?9*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #\"+! (%+' 4!6A!! %+2%7A+(%4#6B#!!%$## #$\"# #\"# #"),
          peg$decode("!7-+>$7!+4%7.+*%4#6C##\"! %$## #$\"# #\"# #"),
          peg$decode("!.D\"\"2D3E+S$0F\"\"1!3G+C%74+9%.H\"\"2H3I+)%4$6J$\"\"!%$$# #$## #$\"# #\"# #"),
          peg$decode("!.K\"\"2K3L+b$ !7C*) \"0M\"\"1!3N,/&7C*) \"0M\"\"1!3N\"+8%.H\"\"2H3I+(%4#6O#!!%$## #$\"# #\"# #"),
          peg$decode("!!.P\"\"2P3Q+=$73+3%.R\"\"2R3S+#%'#%$## #$\"# #\"# #*N \"!.D\"\"2D3E+=$73+3%.H\"\"2H3I+#%'#%$## #$\"# #\"# #+' 4!6T!! %"),
          peg$decode("!.D\"\"2D3E+w$!80U\"\"1!3V9*$$\"\" )\"# #+Y%.W\"\"2W3X*# \" :+C%73+9%.H\"\"2H3I+)%4%6Y%\"\"!%$%# #$$# #$## #$\"# #\"# #"),
          peg$decode("!.P\"\"2P3Q+B$73+8%.R\"\"2R3S+(%4#6Z#!!%$## #$\"# #\"# #"),
          peg$decode("!.D\"\"2D3E+s$0[\"\"1!3\\+c% !7C*) \"0M\"\"1!3N,/&7C*) \"0M\"\"1!3N\"+9%.H\"\"2H3I+)%4$6]$\"\"!%$$# #$## #$\"# #\"# #"),
          peg$decode("!75+q$ !!.^\"\"2^3_+-$75+#%'\"%$\"# #\"# #,>&!.^\"\"2^3_+-$75+#%'\"%$\"# #\"# #\"+)%4\"6@\"\"! %$\"# #\"# #"),
          peg$decode("!73+' 4!6`!! %"),
          peg$decode("!7A+M$76*# \" :+=%77+3%7A+)%4$6a$\"\"!%$$# #$## #$\"# #\"# #*G \"!7A+<$76+2%7A+(%4#6b#!!%$## #$\"# #\"# #"),
          peg$decode("! !.c\"\"2c3d+,$,)&.c\"\"2c3d\"\"\" #+' 4!6e!! %*b \"!.f\"\"2f3g+& 4!6h! %*K \"!.i\"\"2i3j+& 4!6h! %*4 \"!.k\"\"2k3l+& 4!6m! %"),
          peg$decode("!78+q$ !!.i\"\"2i3j+-$78+#%'\"%$\"# #\"# #,>&!.i\"\"2i3j+-$78+#%'\"%$\"# #\"# #\"+)%4\"6@\"\"! %$\"# #\"# #"),
          peg$decode("!!!0n\"\"1!3o+A$ !0p\"\"1!3q,)&0p\"\"1!3q\"+#%'\"%$\"# #\"# #+! (%+;$ !79,#&79\"+)%4\"6r\"\"! %$\"# #\"# #"),
          peg$decode("!.s\"\"2s3t+b$7A+X%7<*) \"7=*# \"75+B%7A+8%.u\"\"2u3v+(%4%6w%!\"%$%# #$$# #$## #$\"# #\"# #"),
          peg$decode("!.x\"\"2x3y+& 4!6z! %*4 \"!.{\"\"2{3|+& 4!6}! %"),
          peg$decode("!.~\"\"2~3*# \" :+\x92$ !0\x80\"\"1!3\x81+,$,)&0\x80\"\"1!3\x81\"\"\" #+m%!.i\"\"2i3j+H$ !0\x80\"\"1!3\x81+,$,)&0\x80\"\"1!3\x81\"\"\" #+#%'\"%$\"# #\"# #*# \" :+'%4#6\x82# %$## #$\"# #\"# #"),
          peg$decode("! !0\x80\"\"1!3\x81+,$,)&0\x80\"\"1!3\x81\"\"\" #+& 4!6\x83! %"),
          peg$decode("!.\x84\"\"2\x843\x85+b$ !7C*) \"0\x86\"\"1!3\x87,/&7C*) \"0\x86\"\"1!3\x87\"+8%.\x84\"\"2\x843\x85+(%4#6\x88#!!%$## #$\"# #\"# #*s \"!.\x89\"\"2\x893\x8A+b$ !7C*) \"0\x8B\"\"1!3\x8C,/&7C*) \"0\x8B\"\"1!3\x8C\"+8%.\x89\"\"2\x893\x8A+(%4#6\x88#!!%$## #$\"# #\"# #"),
          peg$decode("!.\x8D\"\"2\x8D3\x8E+& 4!6\x8F! %"),
          peg$decode("!.\x90\"\"2\x903\x91*\xB3 \"!.\x92\"\"2\x923\x93+\xA2$7B+\x98% !!!80\x94\"\"1!3\x959*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #+T$,Q&!!80\x94\"\"1!3\x959*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #\"\"\" #+#%'#%$## #$\"# #\"# #+& 4!6\x96! %"),
          peg$decode("!7A+]$! !0\x97\"\"1!3\x98+,$,)&0\x97\"\"1!3\x98\"\"\" #+! (%+2%7A+(%4#6\x99#!!%$## #$\"# #\"# #"),
          peg$decode("8! !0\x9B\"\"1!3\x9C,)&0\x9B\"\"1!3\x9C\"+! (%9*\" 3\x9A"),
          peg$decode("8! !0\x9B\"\"1!3\x9C+,$,)&0\x9B\"\"1!3\x9C\"\"\" #+! (%9*\" 3\x9D"),
          peg$decode("!.\x9E\"\"2\x9E3\x9F+7$-\"\"1!3,+(%4\"6\xA0\"! %$\"# #\"# #")
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


    	var _ = require("underscore"),
    		NODE_TYPE = require("./types"),
    		Mustache = require("./");

    	options = _.defaults(options || {}, {
    		strict: true
    	});


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
},{"./":3,"./types":14,"underscore":19}],5:[function(require,module,exports){
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
	getLocal: function(path, ctx) {
		if (typeof path === "string") path = parse(path, { startRule: "path" });
		if (path == null) path = { parts: [] };
		if (!_.isObject(path)) throw new Error("Expecting string or object for path.");
		if (ctx == null) ctx = this;

		var self = this;
		this._dep.depend();

		return _.reduce(path.parts, function(target, part) {
			target = self._get(target, part.key);

			_.each(part.children, function(k) {
				if (_.isObject(k)) k = ctx.get(k);
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
		if (!paths.length) paths.push({ type: "all", parts: [] });

		return _.reduce(paths, function(result, path, index) {
			var model = self,
				scope = true,
				val;

			if (path.type === "root") {
				model = self.getRootModel();
			} else if (path.type === "parent") {
				model = self.getModelAtOffset(path.distance);
			} else if (path.type === "all") {
				scope = false;
			}

			if (model == null) return;

			while (_.isUndefined(val) && model != null) {
				val = model.getLocal(path, self);
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

		proxies.push.apply(proxies, Model._defaultProxies);

		return proxies;
	},

	hasProxy: function(proxy, proxies) {
		if (proxies == null) proxies = this.getAllProxies();
		return _.contains(proxies, proxy);
	},

	registerProxy: function(proxy) {
		if (typeof proxy !== "object" || proxy == null) throw new Error("Expecting object for proxy.");
		if (typeof proxy.match !== "function") throw new Error("Layer missing required match method.");
		if (typeof proxy.get !== "function") throw new Error("Layer missing required get method.");
		if (!this.hasProxy(proxy)) this.proxies.unshift(proxy);
		return this;
	},

	getProxyByValue: function(target, proxies) {
		if (proxies == null) proxies = this.getAllProxies();
		return _.find(proxies, function(proxy) {
			return proxy.match(target);
		});
	},

	// defines a reactive property on an object that points to the data
	defineDataLink: function(obj, prop, options) {
		var model = this;

		Object.defineProperty(obj, prop, {
			configurable: options != null && options.configurable,
			enumerable: options == null || options.enumerable !== false,
			get: function() {
				model._dep.depend();
				return model.data;
			},
			set: function(val) {
				model.set(val);
			}
		});

		return obj;
	}

});

},{"./m+xml":4,"./track":13,"./util":15,"trackr":18,"underscore":19}],6:[function(require,module,exports){
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

		// add template
		var template = options.template || _.result(this, "template");
		if (template != null) this.setTemplate(template);

		// add decorators
		this.decorate(_.extend({}, options.decorators, _.result(this, "decorators")));

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

	// special partial setter that converts strings into mustache Views
	setPartial: function(name, partial) {
		if (_.isObject(name)) return View.prototype.setPartial.call(this, name);
		
		if (_.isString(partial)) partial = parse(partial);
		if (_.isObject(partial) && partial.type === NODE_TYPE.ROOT) partial = Mustache.extend({ template: partial });
		if (partial != null && !util.isSubClass(View, partial))
			throw new Error("Expecting string template, parsed template, View subclass or function for partial.");
		
		return View.prototype.setPartial.call(this, name, partial);
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
		return this.autorun(function(_comp) {
			decorators.forEach(function(d) {
				if (d.options && d.options.defer) _.defer(execDecorator);
				else execDecorator();

				function execDecorator() {
					var dcomp = self.autorun(function(comp) {
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

					// clean up
					_comp.onInvalidate(function() {
						dcomp.stop();
					});
				}
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

},{"./domrange":1,"./m+xml":4,"./model":5,"./section":12,"./track":13,"./types":14,"./util":15,"./view":16,"trackr":18,"underscore":19}],7:[function(require,module,exports){
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
	'load', 'scroll',
	'click', 'dblclick', 'mousedown', 'mouseup', 'mouseenter', 'mouseleave',
	'keydown', 'keypress', 'keyup',
	'blur', 'focus', 'change', 'input', 'submit', 'reset', 
	'drag', 'dragdrop', 'dragend', 'dragenter', 'dragexit', 'dragleave', 'dragover', 'dragstart', 'drop'
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
				if (fireOn.parentRange == null) return;
				fireOn = fireOn.parentRange;
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

	if (action.bubbles && this.parentRange != null) {
		// find the first parent with the fire method
		var fireOn = this.parentRange;
		while (typeof fireOn.fireAction !== "function") {
			// if it has no parent, we can't do anything
			if (fireOn.parentRange == null) return;
			fireOn = fireOn.parentRange;
		}

		fireOn.fireAction.apply(fireOn, args);
	}
	
	return this;
}
},{"../":3,"underscore":19}],8:[function(require,module,exports){
var Mustache = require("../");

module.exports = function() {
	this.adopt = adopt;
	this.disown = disown;
}

function adopt(view, parent, before) {
	if (!(view instanceof Mustache.View)) {
		throw new Error("Expecting instanceof Temple View.");
	}

	if (this._adopted == null) this._adopted = [];

	// make sure it is an independent
	view.detach();

	// hook navbar data up to this data
	view.getRootModel().parent = this.model;

	// render when not in loading mode
	var onRender;
	this.on("render", onRender = function(a, comp) {
		if (comp.firstRun) view.paint(parent, before);
		comp.onInvalidate(function() {
			if (comp.stopped) view.detach();
		});
	});

	this._adopted.push({
		render: onRender,
		view: view
	});

	return view;
}

function disown(view) {
	if (this._adopted == null) return;

	var index;
	if (this._adopted.some(function(a, i) {
		if (a.view === view) {
			index = i;
			return true;
		}
	})) return;

	this.off("render", this._adopted[i].render);
	this._adopted.splice(index, 1);

	return view;
}

},{"../":3}],9:[function(require,module,exports){
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
registerPlugin("adoption", require("./adoption"));
registerPlugin("refs", require("./refs"));

},{"./actions":7,"./adoption":8,"./refs":10,"./twoway":11,"underscore":19}],10:[function(require,module,exports){
module.exports = function() {
	this.refs = {};
	this.decorate("ref", ref);
	this.findByRef = findByRef;
}

function ref(d, key) {
	// don't overwrite
	if (this.refs[key] != null) {
		console.warn("Multiple elements with reference '%s'.", key);
		return;
	}

	// set the reference
	this.refs[key] = d.target;

	// remove the reference when the element disappears
	d.comp.onInvalidate(function() {
		delete this.refs[key];
	});
}

function findByRef(key) {
	var tpl = this;

	while (tpl != null) {
		if (tpl.refs && tpl.refs[key]) return tpl.refs[key];
		tpl = tpl.parentRange;
	}

	return null;
}

},{}],11:[function(require,module,exports){
var _ = require("underscore");

var input_types = [ "text", "number", "date" ];
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
			evtName, onChange, lazy;

		// detect changes to the input's value
		if (typeof fbind.change === "function") {
			onChange = function(e) {
				fbind.change.call(self, getNodeValue(el, type), d.model, e);
			};

			evtName = _.contains(input_types, type) ? "input" : "change";
			el.addEventListener(evtName, onChange);
			if (!(options.lazy || lazy)) el.addEventListener("keyup", onChange);

			d.comp.onInvalidate(function() {
				el.removeEventListener(evtName, onChange);
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
		c = c.parentRange;
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
},{"underscore":19}],12:[function(require,module,exports){
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

},{"./model":5,"./util":15,"./view":16,"trackr":18,"underscore":19}],13:[function(require,module,exports){
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
},{"./util":15,"trackr":18,"underscore":19}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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

// like jQuery's empty(), removes all children
var emptyNode =
exports.emptyNode = function(node) {
	while (node.lastChild) node.removeChild(node.lastChild);
	return node;
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

		emptyNode(element);

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
		emptyNode(element);
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

},{"underscore":19}],16:[function(require,module,exports){
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
		options = options || {};

		// first we create the initial view state
		var state = _.result(this, "initialState") || _.result(this, "defaults");
		if (typeof state !== "undefined") {
			if (!Model.isModel(state)) {
				state = new Model(state, null, options.state);
			}
			
			// shove state between contexts
			if (Model.isModel(data)) {
				state.parent = data.parent;
				data.parent = state;
			}

			// add to the stack before the real data
			this.addData(state);
			this.stateModel = state;

			// setup easy-access state property
			state.defineDataLink(this, "state");
		}
		
		// add partials
		this._partials = {};
		this._components = {};
		this.setPartial(_.extend({}, options.partials, _.result(this, "partials")));

		// set the passed in data
		if (typeof data !== "undefined") this.addData(data, options);
		
		// quick access to the top model data
		Object.defineProperty(this, "data", {
			configurable: true,
			enumerable: true,
			get: function() {
				this.model._dep.depend();
				return this.model.data;
			},
			set: function(val) {
				this.model.set(val);
			}
		});

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
	},

	// sets partial by name
	setPartial: function(name, partial) {
		if (_.isObject(name) && partial == null) {
			_.each(name, function(p, n) { this.setPartial(n, p); }, this);
			return this;
		}

		if (!_.isString(name) && name !== "")
			throw new Error("Expecting non-empty string for partial name.");

		if (partial != null && !util.isSubClass(View, partial))
			throw new Error("Expecting View subclass or function for partial.");

		if (partial == null) {
			delete this._partials[name];
			partial = void 0;
		} else {
			var p = this._getPartial(name);
			p.view = partial;
			p.dep.changed();
		}

		return this;
	},

	// ensures a partial's dependency exists
	_getPartial: function(name) {
		if (this._partials[name] == null)
			this._partials[name] = { dep: new Trackr.Dependency() };

		return this._partials[name];
	},

	// looks through parents for partial
	findPartial: function(name) {
		var c = this, p;

		while (c != null) {
			if (c._getPartial != null) {
				p = c._getPartial(name);
				p.dep.depend();
				if (p.view != null) return p.view;
			}

			c = c.parentRange;
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

	// returns first rendered partial by name
	getComponent: function(name) {
		var comps, comp, res, n, i;

		comps = this._components;
		if (comps[name] != null && comps[name].length) return comps[name][0];

		for (n in comps) {
			for (i in comps[n]) {
				comp = comps[n][i]
				if (!(comp instanceof View)) continue;
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
				if (c instanceof View) m.push.apply(m, c.getComponents(name));
			});

			return m;
		}, []);
	}

});

// chainable methods to proxy to model
[ "set", "registerProxy" ]
.forEach(function(method) {
	View.prototype[method] = function() {
		this.model[method].apply(this.model, arguments);
		return this;
	}
});

// methods to proxy to model which don't return this
[ "get", "getLocal", "getProxyByValue", "getModelAtOffset",
  "getRootModel", "findModel", "getAllModels"
].forEach(function(method) {
	View.prototype[method] = function() {
		return this.model[method].apply(this.model, arguments);
	}
});
},{"./domrange":1,"./events":2,"./model":5,"./plugins":9,"./util":15,"trackr":18,"underscore":19}],17:[function(require,module,exports){
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
process.versions = {};

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

},{}],18:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iL2QwN2ZmOGU5OWNmZGUyMWNmMTEzZGExM2QzNWQzODdiMGVkMzA5YTMvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vKipcbiAqIEBuYW1lc3BhY2UgVHJhY2tyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja3ItcmVsYXRlZCBtZXRob2RzLlxuICovXG52YXIgVHJhY2tyID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hY3RpdmVcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoZXJlIGlzIGEgY3VycmVudCBjb21wdXRhdGlvbiwgbWVhbmluZyB0aGF0IGRlcGVuZGVuY2llcyBvbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgd2lsbCBiZSB0cmFja2VkIGFuZCBwb3RlbnRpYWxseSBjYXVzZSB0aGUgY3VycmVudCBjb21wdXRhdGlvbiB0byBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtCb29sZWFufVxuICovXG5UcmFja3IuYWN0aXZlID0gZmFsc2U7XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY3VycmVudGNvbXB1dGF0aW9uXG5cbi8qKlxuICogQHN1bW1hcnkgVGhlIGN1cnJlbnQgY29tcHV0YXRpb24sIG9yIGBudWxsYCBpZiB0aGVyZSBpc24ndCBvbmUuICBUaGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyB0aGUgW2BUcmFja3IuQ29tcHV0YXRpb25gXSgjdHJhY2tlcl9jb21wdXRhdGlvbikgb2JqZWN0IGNyZWF0ZWQgYnkgdGhlIGlubmVybW9zdCBhY3RpdmUgY2FsbCB0byBgVHJhY2tyLmF1dG9ydW5gLCBhbmQgaXQncyB0aGUgY29tcHV0YXRpb24gdGhhdCBnYWlucyBkZXBlbmRlbmNpZXMgd2hlbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYXJlIGFjY2Vzc2VkLlxuICogQGxvY3VzIENsaWVudFxuICogQHR5cGUge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IG51bGw7XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gYztcblx0VHJhY2tyLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG52YXIgX2RlYnVnRnVuYyA9IGZ1bmN0aW9uICgpIHtcblx0Ly8gV2Ugd2FudCB0aGlzIGNvZGUgdG8gd29yayB3aXRob3V0IE1ldGVvciwgYW5kIGFsc28gd2l0aG91dFxuXHQvLyBcImNvbnNvbGVcIiAod2hpY2ggaXMgdGVjaG5pY2FsbHkgbm9uLXN0YW5kYXJkIGFuZCBtYXkgYmUgbWlzc2luZ1xuXHQvLyBvbiBzb21lIGJyb3dzZXIgd2UgY29tZSBhY3Jvc3MsIGxpa2UgaXQgd2FzIG9uIElFIDcpLlxuXHQvL1xuXHQvLyBMYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5Lig/Pylcblx0cmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG5cdFx0XHRcdFx0KCh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5sb2cgP1xuXHRcdFx0XHRcdCBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuXHRcdFx0XHRcdCBmdW5jdGlvbiAoKSB7fSkpO1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcblx0aWYgKHRocm93Rmlyc3RFcnJvcikge1xuXHRcdHRocm93IGU7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIG1lc3NhZ2VBbmRTdGFjaztcblx0XHRpZiAoZS5zdGFjayAmJiBlLm1lc3NhZ2UpIHtcblx0XHRcdHZhciBpZHggPSBlLnN0YWNrLmluZGV4T2YoZS5tZXNzYWdlKTtcblx0XHRcdGlmIChpZHggPj0gMCAmJiBpZHggPD0gMTApIC8vIGFsbG93IGZvciBcIkVycm9yOiBcIiAoYXQgbGVhc3QgNylcblx0XHRcdFx0bWVzc2FnZUFuZFN0YWNrID0gZS5zdGFjazsgLy8gbWVzc2FnZSBpcyBwYXJ0IG9mIGUuc3RhY2ssIGFzIGluIENocm9tZVxuXHRcdFx0ZWxzZVxuXHRcdFx0XHRtZXNzYWdlQW5kU3RhY2sgPSBlLm1lc3NhZ2UgK1xuXHRcdFx0XHQoZS5zdGFjay5jaGFyQXQoMCkgPT09ICdcXG4nID8gJycgOiAnXFxuJykgKyBlLnN0YWNrOyAvLyBlLmcuIFNhZmFyaVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlQW5kU3RhY2sgPSBlLnN0YWNrIHx8IGUubWVzc2FnZTtcblx0XHR9XG5cdFx0X2RlYnVnRnVuYygpKFwiRXhjZXB0aW9uIGZyb20gVHJhY2tyIFwiICsgZnJvbSArIFwiIGZ1bmN0aW9uOlwiLFxuXHRcdFx0XHRcdFx0XHRcdCBtZXNzYWdlQW5kU3RhY2spO1xuXHR9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcblx0aWYgKCh0eXBlb2YgTWV0ZW9yID09PSAndW5kZWZpbmVkJykgfHwgTWV0ZW9yLmlzQ2xpZW50KSB7XG5cdFx0cmV0dXJuIGY7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdFx0TWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRmLmFwcGx5KG51bGwsIGFyZ3MpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxufTtcblxudmFyIG5leHRJZCA9IDE7XG4vLyBjb21wdXRhdGlvbnMgd2hvc2UgY2FsbGJhY2tzIHdlIHNob3VsZCBjYWxsIGF0IGZsdXNoIHRpbWVcbnZhciBwZW5kaW5nQ29tcHV0YXRpb25zID0gW107XG4vLyBgdHJ1ZWAgaWYgYSBUcmFja3IuZmx1c2ggaXMgc2NoZWR1bGVkLCBvciBpZiB3ZSBhcmUgaW4gVHJhY2tyLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgaW5GbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lXG4vLyBvciByZWNvbXB1dGUuICBUaGlzIG1hdGNoZXMgVHJhY2tyLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZVxuLy8gVHJhY2tyLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBUcmFja3IuZmx1c2ggdGhhdCB3ZSBhcmUgaW4uIFdoZW4gc2V0LCB0aHJvdyByYXRoZXIgdGhhbiBsb2cgdGhlXG4vLyBmaXJzdCBlcnJvciBlbmNvdW50ZXJlZCB3aGlsZSBmbHVzaGluZy4gQmVmb3JlIHRocm93aW5nIHRoZSBlcnJvcixcbi8vIGZpbmlzaCBmbHVzaGluZyAoZnJvbSBhIGZpbmFsbHkgYmxvY2spLCBsb2dnaW5nIGFueSBzdWJzZXF1ZW50XG4vLyBlcnJvcnMuXG52YXIgdGhyb3dGaXJzdEVycm9yID0gZmFsc2U7XG5cbnZhciBhZnRlckZsdXNoQ2FsbGJhY2tzID0gW107XG5cbi8vIGxvb2sgZm9yIGEgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGFzIHRoYXQgaXMgcHJlZmVyYWJsZSBvdmVyIG5leHRUaWNrIG9yIHNldEltbWVkaWF0ZVxudmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgP1xuXHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG5cdHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcblx0d2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuXHR3aW5kb3cub1JlcXVlc3RBbmltYXRpb25GcmFtZSA6XG5cdG51bGw7XG5cbi8vIGNvbnRyb2xzIHRoZSBkZWZlcnJhbFxuVHJhY2tyLm5leHRUaWNrID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lICE9IG51bGwgPyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUuYmluZCh3aW5kb3cpIDpcblx0dHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgPyBwcm9jZXNzLm5leHRUaWNrIDpcblx0ZnVuY3Rpb24gKGYpIHsgc2V0VGltZW91dChmLCAxNik7IH07XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG5cdGlmICghIHdpbGxGbHVzaCkge1xuXHRcdFRyYWNrci5uZXh0VGljayhUcmFja3IuZmx1c2gpO1xuXHRcdHdpbGxGbHVzaCA9IHRydWU7XG5cdH1cbn07XG5cbi8vIFRyYWNrci5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyB2aXNpYmxlIGJ1dCBwcml2YXRlXG4vLyAodGhyb3dzIGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gY2FsbCBpdClcbnZhciBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9jb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IEEgQ29tcHV0YXRpb24gb2JqZWN0IHJlcHJlc2VudHMgY29kZSB0aGF0IGlzIHJlcGVhdGVkbHkgcmVydW5cbiAqIGluIHJlc3BvbnNlIHRvXG4gKiByZWFjdGl2ZSBkYXRhIGNoYW5nZXMuIENvbXB1dGF0aW9ucyBkb24ndCBoYXZlIHJldHVybiB2YWx1ZXM7IHRoZXkganVzdFxuICogcGVyZm9ybSBhY3Rpb25zLCBzdWNoIGFzIHJlcmVuZGVyaW5nIGEgdGVtcGxhdGUgb24gdGhlIHNjcmVlbi4gQ29tcHV0YXRpb25zXG4gKiBhcmUgY3JlYXRlZCB1c2luZyBUcmFja3IuYXV0b3J1bi4gVXNlIHN0b3AgdG8gcHJldmVudCBmdXJ0aGVyIHJlcnVubmluZyBvZiBhXG4gKiBjb21wdXRhdGlvbi5cbiAqIEBpbnN0YW5jZW5hbWUgY29tcHV0YXRpb25cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGYsIHBhcmVudCwgY3R4KSB7XG5cdGlmICghIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uKVxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFwiVHJhY2tyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBUcmFja3IuYXV0b3J1blwiKTtcblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cblx0ICogQGxvY3VzIENsaWVudFxuXHQgKiBAbWVtYmVyT2YgVHJhY2tyLkNvbXB1dGF0aW9uXG5cdCAqIEBpbnN0YW5jZVxuXHQgKiBAbmFtZSAgc3RvcHBlZFxuXHQgKi9cblx0c2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIGludmFsaWRhdGVkXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrci5hdXRvcnVuYCBpcyBjYWxsZWQsIGFuZCBmYWxzZSBvbiBzdWJzZXF1ZW50IHJlcnVucyBhbmQgYXQgb3RoZXIgdGltZXMuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIGZpcnN0UnVuXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5maXJzdFJ1biA9IHRydWU7XG5cblx0c2VsZi5faWQgPSBuZXh0SWQrKztcblx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG5cdC8vIHRoZSBwbGFuIGlzIGF0IHNvbWUgcG9pbnQgdG8gdXNlIHRoZSBwYXJlbnQgcmVsYXRpb25cblx0Ly8gdG8gY29uc3RyYWluIHRoZSBvcmRlciB0aGF0IGNvbXB1dGF0aW9ucyBhcmUgcHJvY2Vzc2VkXG5cdHNlbGYuX3BhcmVudCA9IHBhcmVudDtcblx0c2VsZi5fZnVuYyA9IGY7XG5cdHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cdHNlbGYuX2NvbnRleHQgPSBjdHggfHwgbnVsbDtcblxuXHR2YXIgZXJyb3JlZCA9IHRydWU7XG5cdHRyeSB7XG5cdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdGVycm9yZWQgPSBmYWxzZTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0aWYgKGVycm9yZWQpXG5cdFx0XHRzZWxmLnN0b3AoKTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLiAgVGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gaW52YWxpZGF0aW9uLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBpbnZhbGlkYXRlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCAhPT0gdm9pZCAwID8gY3R4IDogc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlcyB0aGlzIGNvbXB1dGF0aW9uIHNvIHRoYXQgaXQgd2lsbCBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHQvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG5cdFx0Ly8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG5cdFx0aWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcblx0XHRcdHJlcXVpcmVGbHVzaCgpO1xuXHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuXHRcdH1cblxuXHRcdHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2Vcblx0XHQvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4ICE9PSB2b2lkIDAgPyBmLmN0eCA6IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5cbi8qKlxuICogQHN1bW1hcnkgUHJldmVudHMgdGhpcyBjb21wdXRhdGlvbiBmcm9tIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoISB0aGlzLnN0b3BwZWQpIHtcblx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXHRcdHRoaXMuaW52YWxpZGF0ZSgpO1xuXHR9XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG5cdHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcblx0aW5Db21wdXRlID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0XHRpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fcmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0c2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuXHR0cnkge1xuXHRcdHdoaWxlIChzZWxmLmludmFsaWRhdGVkICYmICEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZWxmLl9jb21wdXRlKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgX2NvbXB1dGUoKSBpbnZhbGlkYXRlZCB1cywgd2UgcnVuIGFnYWluIGltbWVkaWF0ZWx5LlxuXHRcdFx0Ly8gQSBjb21wdXRhdGlvbiB0aGF0IGludmFsaWRhdGVzIGl0c2VsZiBpbmRlZmluaXRlbHkgaXMgYW5cblx0XHRcdC8vIGluZmluaXRlIGxvb3AsIG9mIGNvdXJzZS5cblx0XHRcdC8vXG5cdFx0XHQvLyBXZSBjb3VsZCBwdXQgYW4gaXRlcmF0aW9uIGNvdW50ZXIgaGVyZSBhbmQgY2F0Y2ggcnVuLWF3YXlcblx0XHRcdC8vIGxvb3BzLlxuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHR9XG59O1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9kZXBlbmRlbmN5XG5cbi8qKlxuICogQHN1bW1hcnkgQSBEZXBlbmRlbmN5IHJlcHJlc2VudHMgYW4gYXRvbWljIHVuaXQgb2YgcmVhY3RpdmUgZGF0YSB0aGF0IGFcbiAqIGNvbXB1dGF0aW9uIG1pZ2h0IGRlcGVuZCBvbi4gUmVhY3RpdmUgZGF0YSBzb3VyY2VzIHN1Y2ggYXMgU2Vzc2lvbiBvclxuICogTWluaW1vbmdvIGludGVybmFsbHkgY3JlYXRlIGRpZmZlcmVudCBEZXBlbmRlbmN5IG9iamVjdHMgZm9yIGRpZmZlcmVudFxuICogcGllY2VzIG9mIGRhdGEsIGVhY2ggb2Ygd2hpY2ggbWF5IGJlIGRlcGVuZGVkIG9uIGJ5IG11bHRpcGxlIGNvbXB1dGF0aW9ucy5cbiAqIFdoZW4gdGhlIGRhdGEgY2hhbmdlcywgdGhlIGNvbXB1dGF0aW9ucyBhcmUgaW52YWxpZGF0ZWQuXG4gKiBAY2xhc3NcbiAqIEBpbnN0YW5jZU5hbWUgZGVwZW5kZW5jeVxuICovXG5UcmFja3IuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4vL1xuLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4vLyBwcmVzZW50LiAgUmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4vLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbi8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cblxuLyoqXG4gKiBAc3VtbWFyeSBEZWNsYXJlcyB0aGF0IHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIChvciBgZnJvbUNvbXB1dGF0aW9uYCBpZiBnaXZlbikgZGVwZW5kcyBvbiBgZGVwZW5kZW5jeWAuICBUaGUgY29tcHV0YXRpb24gd2lsbCBiZSBpbnZhbGlkYXRlZCB0aGUgbmV4dCB0aW1lIGBkZXBlbmRlbmN5YCBjaGFuZ2VzLlxuXG5JZiB0aGVyZSBpcyBubyBjdXJyZW50IGNvbXB1dGF0aW9uIGFuZCBgZGVwZW5kKClgIGlzIGNhbGxlZCB3aXRoIG5vIGFyZ3VtZW50cywgaXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zIGZhbHNlLlxuXG5SZXR1cm5zIHRydWUgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGEgbmV3IGRlcGVuZGVudCBvZiBgZGVwZW5kZW5jeWAgcmF0aGVyIHRoYW4gYW4gZXhpc3Rpbmcgb25lLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb259IFtmcm9tQ29tcHV0YXRpb25dIEFuIG9wdGlvbmFsIGNvbXB1dGF0aW9uIGRlY2xhcmVkIHRvIGRlcGVuZCBvbiBgZGVwZW5kZW5jeWAgaW5zdGVhZCBvZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbi5cbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24gKGNvbXB1dGF0aW9uKSB7XG5cdGlmICghIGNvbXB1dGF0aW9uKSB7XG5cdFx0aWYgKCEgVHJhY2tyLmFjdGl2ZSlcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdGNvbXB1dGF0aW9uID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0fVxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcblx0aWYgKCEgKGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKSkge1xuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXSA9IGNvbXB1dGF0aW9uO1xuXHRcdGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRkZWxldGUgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfY2hhbmdlZFxuXG4vKipcbiAqIEBzdW1tYXJ5IEludmFsaWRhdGUgYWxsIGRlcGVuZGVudCBjb21wdXRhdGlvbnMgaW1tZWRpYXRlbHkgYW5kIHJlbW92ZSB0aGVtIGFzIGRlcGVuZGVudHMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvciAodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2hhc2RlcGVuZGVudHNcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgRGVwZW5kZW5jeSBoYXMgb25lIG9yIG1vcmUgZGVwZW5kZW50IENvbXB1dGF0aW9ucywgd2hpY2ggd291bGQgYmUgaW52YWxpZGF0ZWQgaWYgdGhpcyBEZXBlbmRlbmN5IHdlcmUgdG8gY2hhbmdlLlxuICogQGxvY3VzIENsaWVudFxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5oYXNEZXBlbmRlbnRzID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0cmV0dXJuIHRydWU7XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZmx1c2hcblxuLyoqXG4gKiBAc3VtbWFyeSBQcm9jZXNzIGFsbCByZWFjdGl2ZSB1cGRhdGVzIGltbWVkaWF0ZWx5IGFuZCBlbnN1cmUgdGhhdCBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGFyZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLmZsdXNoID0gZnVuY3Rpb24gKF9vcHRzKSB7XG5cdC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuXHQvLyBoYXZlIFNwYXJrKVxuXHQvL1xuXHQvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuXHQvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG5cdC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tyLmZsdXNoLiAgQXQgdGhlIG1vbWVudFxuXHQvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG5cdC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLiAgQW5kIHdlIGRvbid0IGhhdmVcblx0Ly8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG5cdC8vXG5cdC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcblx0aWYgKGluRmx1c2gpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja3IuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cblx0aWYgKGluQ29tcHV0ZSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tyLmF1dG9ydW5cIik7XG5cblx0aW5GbHVzaCA9IHRydWU7XG5cdHdpbGxGbHVzaCA9IHRydWU7XG5cdHRocm93Rmlyc3RFcnJvciA9ICEhIChfb3B0cyAmJiBfb3B0cy5fdGhyb3dGaXJzdEVycm9yKTtcblxuXHR2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcblx0XHRcdFx0XHQgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuXHRcdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHRjb21wLl9yZWNvbXB1dGUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuXHRcdFx0XHQvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG5cdFx0XHRcdHZhciBjYiA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjYi5mbi5jYWxsKGNiLmN0eCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRfdGhyb3dPckxvZyhcImFmdGVyRmx1c2hcIiwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmICghIGZpbmlzaGVkVHJ5KSB7XG5cdFx0XHQvLyB3ZSdyZSBlcnJvcmluZ1xuXHRcdFx0aW5GbHVzaCA9IGZhbHNlOyAvLyBuZWVkZWQgYmVmb3JlIGNhbGxpbmcgYFRyYWNrci5mbHVzaCgpYCBhZ2FpblxuXHRcdFx0VHJhY2tyLmZsdXNoKHtfdGhyb3dGaXJzdEVycm9yOiBmYWxzZX0pOyAvLyBmaW5pc2ggZmx1c2hpbmdcblx0XHR9XG5cdFx0d2lsbEZsdXNoID0gZmFsc2U7XG5cdFx0aW5GbHVzaCA9IGZhbHNlO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2F1dG9ydW5cbi8vXG4vLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4vLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuLy9cbi8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4vL1xuLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4vLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gbm93IGFuZCByZXJ1biBpdCBsYXRlciB3aGVuZXZlciBpdHMgZGVwZW5kZW5jaWVzIGNoYW5nZS4gUmV0dXJucyBhIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IGNhbiBiZSB1c2VkIHRvIHN0b3Agb3Igb2JzZXJ2ZSB0aGUgcmVydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlcyBvbmUgYXJndW1lbnQ6IHRoZSBDb21wdXRhdGlvbiBvYmplY3QgdGhhdCB3aWxsIGJlIHJldHVybmVkLlxuICogQHJldHVybnMge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyYWNrci5hdXRvcnVuIHJlcXVpcmVzIGEgZnVuY3Rpb24gYXJndW1lbnQnKTtcblxuXHRjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IHRydWU7XG5cdHZhciBjID0gbmV3IFRyYWNrci5Db21wdXRhdGlvbihmLCBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLCBjdHgpO1xuXG5cdGlmIChUcmFja3IuYWN0aXZlKVxuXHRcdFRyYWNrci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuXHRcdFx0Yy5zdG9wKCk7XG5cdFx0fSk7XG5cblx0cmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuICBVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIHdpdGhvdXQgdHJhY2tpbmcgZGVwZW5kZW5jaWVzLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBBIGZ1bmN0aW9uIHRvIGNhbGwgaW1tZWRpYXRlbHkuXG4gKi9cblRyYWNrci5ub25SZWFjdGl2ZSA9IFxuVHJhY2tyLm5vbnJlYWN0aXZlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24obnVsbCk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGYuY2FsbChjdHgpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG5cdH1cbn07XG5cbi8vIGxpa2Ugbm9ucmVhY3RpdmUgYnV0IG1ha2VzIGEgZnVuY3Rpb24gaW5zdGVhZFxuVHJhY2tyLm5vblJlYWN0YWJsZSA9IFxuVHJhY2tyLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGYuYXBwbHkoY3R4LCBhcmdzKTtcblx0XHR9KTtcblx0fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IFtgb25JbnZhbGlkYXRlYF0oI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZSkgY2FsbGJhY2sgb24gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKHdoaWNoIG11c3QgZXhpc3QpLCB0byBiZSBjYWxsZWQgaW1tZWRpYXRlbHkgd2hlbiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZCBvciBzdG9wcGVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgaW52b2tlZCBhcyBgZnVuYyhjKWAsIHdoZXJlIGBjYCBpcyB0aGUgY29tcHV0YXRpb24gb24gd2hpY2ggdGhlIGNhbGxiYWNrIGlzIHJlZ2lzdGVyZWQuXG4gKi9cblRyYWNrci5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVHJhY2tyLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hZnRlcmZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgU2NoZWR1bGVzIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGR1cmluZyB0aGUgbmV4dCBmbHVzaCwgb3IgbGF0ZXIgaW4gdGhlIGN1cnJlbnQgZmx1c2ggaWYgb25lIGlzIGluIHByb2dyZXNzLCBhZnRlciBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGhhdmUgYmVlbiByZXJ1bi4gIFRoZSBmdW5jdGlvbiB3aWxsIGJlIHJ1biBvbmNlIGFuZCBub3Qgb24gc3Vic2VxdWVudCBmbHVzaGVzIHVubGVzcyBgYWZ0ZXJGbHVzaGAgaXMgY2FsbGVkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBjYWxsIGF0IGZsdXNoIHRpbWUuXG4gKi9cblRyYWNrci5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdHJlcXVpcmVGbHVzaCgpO1xufTsiXX0=
},{"_process":17}],19:[function(require,module,exports){
//     Underscore.js 1.8.3
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
  _.VERSION = '1.8.3';

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

  var property = function(key) {
    return function(obj) {
      return obj == null ? void 0 : obj[key];
    };
  };

  // Helper for collection methods to determine whether a collection
  // should be iterated as an array or as an object
  // Related: http://people.mozilla.org/~jorendorff/es6-draft.html#sec-tolength
  // Avoids a very nasty iOS 8 JIT bug on ARM-64. #2094
  var MAX_ARRAY_INDEX = Math.pow(2, 53) - 1;
  var getLength = property('length');
  var isArrayLike = function(collection) {
    var length = getLength(collection);
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

  // Determine if the array or object contains a given item (using `===`).
  // Aliased as `includes` and `include`.
  _.contains = _.includes = _.include = function(obj, item, fromIndex, guard) {
    if (!isArrayLike(obj)) obj = _.values(obj);
    if (typeof fromIndex != 'number' || guard) fromIndex = 0;
    return _.indexOf(obj, item, fromIndex) >= 0;
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
    for (var i = startIndex || 0, length = getLength(input); i < length; i++) {
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
    if (!_.isBoolean(isSorted)) {
      context = iteratee;
      iteratee = isSorted;
      isSorted = false;
    }
    if (iteratee != null) iteratee = cb(iteratee, context);
    var result = [];
    var seen = [];
    for (var i = 0, length = getLength(array); i < length; i++) {
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
    var result = [];
    var argsLength = arguments.length;
    for (var i = 0, length = getLength(array); i < length; i++) {
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
    var length = array && _.max(array, getLength).length || 0;
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
    for (var i = 0, length = getLength(list); i < length; i++) {
      if (values) {
        result[list[i]] = values[i];
      } else {
        result[list[i][0]] = list[i][1];
      }
    }
    return result;
  };

  // Generator function to create the findIndex and findLastIndex functions
  function createPredicateIndexFinder(dir) {
    return function(array, predicate, context) {
      predicate = cb(predicate, context);
      var length = getLength(array);
      var index = dir > 0 ? 0 : length - 1;
      for (; index >= 0 && index < length; index += dir) {
        if (predicate(array[index], index, array)) return index;
      }
      return -1;
    };
  }

  // Returns the first index on an array-like that passes a predicate test
  _.findIndex = createPredicateIndexFinder(1);
  _.findLastIndex = createPredicateIndexFinder(-1);

  // Use a comparator function to figure out the smallest index at which
  // an object should be inserted so as to maintain order. Uses binary search.
  _.sortedIndex = function(array, obj, iteratee, context) {
    iteratee = cb(iteratee, context, 1);
    var value = iteratee(obj);
    var low = 0, high = getLength(array);
    while (low < high) {
      var mid = Math.floor((low + high) / 2);
      if (iteratee(array[mid]) < value) low = mid + 1; else high = mid;
    }
    return low;
  };

  // Generator function to create the indexOf and lastIndexOf functions
  function createIndexFinder(dir, predicateFind, sortedIndex) {
    return function(array, item, idx) {
      var i = 0, length = getLength(array);
      if (typeof idx == 'number') {
        if (dir > 0) {
            i = idx >= 0 ? idx : Math.max(idx + length, i);
        } else {
            length = idx >= 0 ? Math.min(idx + 1, length) : idx + length + 1;
        }
      } else if (sortedIndex && idx && length) {
        idx = sortedIndex(array, item);
        return array[idx] === item ? idx : -1;
      }
      if (item !== item) {
        idx = predicateFind(slice.call(array, i, length), _.isNaN);
        return idx >= 0 ? idx + i : -1;
      }
      for (idx = dir > 0 ? i : length - 1; idx >= 0 && idx < length; idx += dir) {
        if (array[idx] === item) return idx;
      }
      return -1;
    };
  }

  // Return the position of the first occurrence of an item in an array,
  // or -1 if the item is not included in the array.
  // If the array is large and already in sort order, pass `true`
  // for **isSorted** to use binary search.
  _.indexOf = createIndexFinder(1, _.findIndex, _.sortedIndex);
  _.lastIndexOf = createIndexFinder(-1, _.findLastIndex);

  // Generate an integer Array containing an arithmetic progression. A port of
  // the native Python `range()` function. See
  // [the Python documentation](http://docs.python.org/library/functions.html#range).
  _.range = function(start, stop, step) {
    if (stop == null) {
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

  // Creates an object that inherits from the given prototype object.
  // If additional properties are provided then they will be added to the
  // created object.
  _.create = function(prototype, props) {
    var result = baseCreate(prototype);
    if (props) _.extendOwn(result, props);
    return result;
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

  _.property = property;

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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZG9tcmFuZ2UuanMiLCJsaWIvZXZlbnRzLmpzIiwibGliL2luZGV4LmpzIiwibGliL20reG1sLmpzIiwibGliL21vZGVsLmpzIiwibGliL211c3RhY2hlLmpzIiwibGliL3BsdWdpbnMvYWN0aW9ucy5qcyIsImxpYi9wbHVnaW5zL2Fkb3B0aW9uLmpzIiwibGliL3BsdWdpbnMvaW5kZXguanMiLCJsaWIvcGx1Z2lucy9yZWZzLmpzIiwibGliL3BsdWdpbnMvdHdvd2F5LmpzIiwibGliL3NlY3Rpb24uanMiLCJsaWIvdHJhY2suanMiLCJsaWIvdHlwZXMuanMiLCJsaWIvdXRpbC5qcyIsImxpYi92aWV3LmpzIiwibm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIiwibm9kZV9tb2R1bGVzL3VuZGVyc2NvcmUvdW5kZXJzY29yZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2WkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwdUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDek5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNWhCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gVGhpcyBpcyBhIGhlYXZpbHkgbW9kaWZpZWQgdmVyc2lvbiBvZiBNZXRlb3IncyBET01SYW5nZSAvL1xuLy8gTGFzdCBtZXJnZTogaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvYmxvYi80MDUwMDlhMmMzZGNkM2MxZmU3ODBhZGIyODY3ZDM4YTZhNDJmZmYxL3BhY2thZ2VzL2JsYXplL2RvbXJhbmdlLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG52YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRFdmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuXG5mdW5jdGlvbiBpc0FycmF5TGlrZShhKSB7XG5cdHJldHVybiBhICE9IG51bGwgJiYgdHlwZW9mIGEubGVuZ3RoID09PSBcIm51bWJlclwiO1xufVxuXG4vLyBgW25ld10gQmxhemUuX0RPTVJhbmdlKFtub2RlQW5kUmFuZ2VBcnJheV0pYFxuLy9cbi8vIEEgRE9NUmFuZ2UgY29uc2lzdHMgb2YgYW4gYXJyYXkgb2YgY29uc2VjdXRpdmUgbm9kZXMgYW5kIERPTVJhbmdlcyxcbi8vIHdoaWNoIG1heSBiZSByZXBsYWNlZCBhdCBhbnkgdGltZSB3aXRoIGEgbmV3IGFycmF5LiAgSWYgdGhlIERPTVJhbmdlXG4vLyBoYXMgYmVlbiBhdHRhY2hlZCB0byB0aGUgRE9NIGF0IHNvbWUgbG9jYXRpb24sIHRoZW4gdXBkYXRpbmdcbi8vIHRoZSBhcnJheSB3aWxsIGNhdXNlIHRoZSBET00gdG8gYmUgdXBkYXRlZCBhdCB0aGF0IGxvY2F0aW9uLlxuZnVuY3Rpb24gRE9NUmFuZ2Uobm9kZUFuZFJhbmdlQXJyYXkpIHtcblx0Ly8gY2FsbGVkIHdpdGhvdXQgYG5ld2Bcblx0aWYgKCEodGhpcyBpbnN0YW5jZW9mIERPTVJhbmdlKSkge1xuXHRcdHJldHVybiBuZXcgRE9NUmFuZ2Uobm9kZUFuZFJhbmdlQXJyYXkpO1xuXHR9XG5cblx0dmFyIG1lbWJlcnMgPSAobm9kZUFuZFJhbmdlQXJyYXkgfHwgW10pO1xuXHRpZiAoIWlzQXJyYXlMaWtlKG1lbWJlcnMpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBhcnJheVwiKTtcblxuXHRmb3IgKHZhciBpID0gMDsgaSA8IG1lbWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHR0aGlzLl9tZW1iZXJJbihtZW1iZXJzW2ldKTtcblx0fVxuXG5cdHRoaXMubWVtYmVycyA9IG1lbWJlcnM7XG5cdHRoaXMucGxhY2Vob2xkZXIgPSBudWxsO1xuXHR0aGlzLmF0dGFjaGVkID0gZmFsc2U7XG5cdHRoaXMucGFyZW50RWxlbWVudCA9IG51bGw7XG5cdHRoaXMucGFyZW50UmFuZ2UgPSBudWxsO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBET01SYW5nZTtcbkRPTVJhbmdlLmV4dGVuZCA9IHV0aWwuc3ViY2xhc3M7XG5cbi8vIGZpbmRzIHRoZSBET01SYW5nZSB0aGUgZWxlbWVudCBpcyBhIHBhcnQgb2ZcbkRPTVJhbmdlLmZvckVsZW1lbnQgPSBmdW5jdGlvbiAoZWxlbSkge1xuXHRpZiAoZWxlbS5ub2RlVHlwZSAhPT0gMSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgZWxlbWVudCwgZm91bmQ6IFwiICsgZWxlbSk7XG5cdFxuXHR2YXIgcmFuZ2UgPSBudWxsO1xuXHRcblx0d2hpbGUgKGVsZW0gJiYgIXJhbmdlKSB7XG5cdFx0cmFuZ2UgPSAoZWxlbS4kZG9tcmFuZ2UgfHwgbnVsbCk7XG5cdFx0ZWxlbSA9IGVsZW0ucGFyZW50Tm9kZTtcblx0fVxuXG5cdHJldHVybiByYW5nZTtcbn07XG5cbl8uZXh0ZW5kKERPTVJhbmdlLnByb3RvdHlwZSwgRXZlbnRzLCB7XG5cblx0Ly8gVGhpcyBtZXRob2QgaXMgY2FsbGVkIHRvIGluc2VydCB0aGUgRE9NUmFuZ2UgaW50byB0aGUgRE9NIGZvclxuXHQvLyB0aGUgZmlyc3QgdGltZSwgYnV0IGl0J3MgYWxzbyB1c2VkIGludGVybmFsbHkgd2hlblxuXHQvLyB1cGRhdGluZyB0aGUgRE9NLlxuXHQvLyBJZiBfaXNNb3ZlIGlzIHRydWUsIG1vdmUgdGhpcyBhdHRhY2hlZCByYW5nZSB0byBhIGRpZmZlcmVudFxuXHQvLyBsb2NhdGlvbiB1bmRlciB0aGUgc2FtZSBwYXJlbnRFbGVtZW50LlxuXHRhdHRhY2g6IGZ1bmN0aW9uKHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlLCBfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKHR5cGVvZiBwYXJlbnRFbGVtZW50ID09PSBcInN0cmluZ1wiKSBwYXJlbnRFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihwYXJlbnRFbGVtZW50KTtcblx0XHRpZiAodHlwZW9mIG5leHROb2RlID09PSBcInN0cmluZ1wiKSBuZXh0Tm9kZSA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKG5leHROb2RlKTtcblx0XHRpZiAocGFyZW50RWxlbWVudCA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSB2YWxpZCBET00gZWxlbWVudCB0byBhdHRhY2ggaW4uXCIpO1xuXG5cdFx0aWYgKChfaXNNb3ZlIHx8IF9pc1JlcGxhY2UpICYmICEodGhpcy5wYXJlbnRFbGVtZW50ID09PSBwYXJlbnRFbGVtZW50ICYmIHRoaXMuYXR0YWNoZWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4gb25seSBtb3ZlIG9yIHJlcGxhY2UgYW4gYXR0YWNoZWQgRE9NUmFuZ2UsIGFuZCBvbmx5IHVuZGVyIHRoZSBzYW1lIHBhcmVudCBlbGVtZW50XCIpO1xuXHRcdH1cblxuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGlmIChtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG1lbWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aW5zZXJ0SW50b0RPTShtZW1iZXJzW2ldLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyTm9kZSgpO1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xuXHRcdFx0cGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUocGxhY2Vob2xkZXIsIG5leHROb2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLmF0dGFjaGVkID0gdHJ1ZTtcblx0XHR0aGlzLnBhcmVudEVsZW1lbnQgPSBwYXJlbnRFbGVtZW50O1xuXG5cdFx0Ly8gdHJpZ2dlciBldmVudHMgb25seSBvbiBmcmVzaCBhdHRhY2htZW50c1xuXHRcdGlmICghKF9pc01vdmUgfHwgX2lzUmVwbGFjZSkpIHRoaXMudHJpZ2dlcihcImF0dGFjaFwiLCBwYXJlbnRFbGVtZW50KTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGRldGFjaDogZnVuY3Rpb24oX2lzUmVwbGFjZSkge1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkgcmV0dXJuIHRoaXM7XG5cblx0XHR2YXIgb2xkUGFyZW50RWxlbWVudCA9IHRoaXMucGFyZW50RWxlbWVudDtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRpZiAobWVtYmVycy5sZW5ndGgpIHtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRyZW1vdmVGcm9tRE9NKG1lbWJlcnNbaV0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgcGxhY2Vob2xkZXIgPSB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKHBsYWNlaG9sZGVyKTtcblx0XHRcdHRoaXMucGxhY2Vob2xkZXIgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghX2lzUmVwbGFjZSkge1xuXHRcdFx0dGhpcy5hdHRhY2hlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50ID0gbnVsbDtcblx0XHRcdHRoaXMudHJpZ2dlcihcImRldGFjaFwiLCBvbGRQYXJlbnRFbGVtZW50KTtcblx0XHR9XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHRocm93IG5ldyBFcnJvcihcIk11c3QgYmUgYXR0YWNoZWRcIik7XG5cdFx0aWYgKCF0aGlzLm1lbWJlcnMubGVuZ3RoKSByZXR1cm4gdGhpcy5wbGFjZWhvbGRlcjtcblx0XHR2YXIgbSA9IHRoaXMubWVtYmVyc1swXTtcblx0XHRyZXR1cm4gKG0gaW5zdGFuY2VvZiBET01SYW5nZSkgPyBtLmZpcnN0Tm9kZSgpIDogbTtcblx0fSxcblxuXHRsYXN0Tm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJNdXN0IGJlIGF0dGFjaGVkXCIpO1xuXHRcdGlmICghdGhpcy5tZW1iZXJzLmxlbmd0aCkgcmV0dXJuIHRoaXMucGxhY2Vob2xkZXI7XG5cdFx0dmFyIG0gPSB0aGlzLm1lbWJlcnNbdGhpcy5tZW1iZXJzLmxlbmd0aCAtIDFdO1xuXHRcdHJldHVybiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0ubGFzdE5vZGUoKSA6IG07XG5cdH0sXG5cblx0Z2V0TWVtYmVyOiBmdW5jdGlvbihhdEluZGV4KSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0aWYgKCEoYXRJbmRleCA+PSAwICYmIGF0SW5kZXggPCBtZW1iZXJzLmxlbmd0aCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBpbmRleCBpbiByYW5nZS5nZXRNZW1iZXI6IFwiICsgYXRJbmRleCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1lbWJlcnNbYXRJbmRleF07XG5cdH0sXG5cblx0Ly8gcmVzZXRzIHRoZSBET01SYW5nZSB3aXRoIG5ldyBjb250ZW50XG5cdHNldE1lbWJlcnM6IGZ1bmN0aW9uKG5ld05vZGVBbmRSYW5nZUFycmF5KSB7XG5cdFx0dmFyIG5ld01lbWJlcnMgPSBuZXdOb2RlQW5kUmFuZ2VBcnJheTtcblx0XHRpZiAoIWlzQXJyYXlMaWtlKG5ld01lbWJlcnMpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBhcnJheVwiKTtcblx0XHR2YXIgb2xkTWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHR2YXIgX2lzUmVwbGFjZSA9IHRoaXMuYXR0YWNoZWQgJiYgKG5ld01lbWJlcnMubGVuZ3RoIHx8IG9sZE1lbWJlcnMubGVuZ3RoKTtcblxuXHRcdC8vIGRlcmVmZXJlbmNlIG9sZCBtZW1iZXJzXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBvbGRNZW1iZXJzLmxlbmd0aDsgaSsrKSB0aGlzLl9tZW1iZXJPdXQob2xkTWVtYmVyc1tpXSwgZmFsc2UsIF9pc1JlcGxhY2UpO1xuXG5cdFx0Ly8gcmVmZXJlbmNlIG5ldyBtZW1iZXJzXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBuZXdNZW1iZXJzLmxlbmd0aDsgaSsrKSB0aGlzLl9tZW1iZXJJbihuZXdNZW1iZXJzW2ldKTtcblxuXHRcdGlmIChfaXNSZXBsYWNlKSB7XG5cdFx0XHQvLyBkZXRhY2ggdGhlIG9sZCBtZW1iZXJzIGFuZCBpbnNlcnQgdGhlIG5ldyBtZW1iZXJzXG5cdFx0XHR2YXIgbmV4dE5vZGUgPSB0aGlzLmxhc3ROb2RlKCkubmV4dFNpYmxpbmc7XG5cdFx0XHR2YXIgcGFyZW50RWxlbWVudCA9IHRoaXMucGFyZW50RWxlbWVudDtcblx0XHRcdC8vIFVzZSBkZXRhY2gvYXR0YWNoLCBidXQgZG9uJ3QgdHJpZ2dlciBldmVudHNcblx0XHRcdHRoaXMuZGV0YWNoKHRydWUgLypfaXNSZXBsYWNlKi8pO1xuXHRcdFx0dGhpcy5tZW1iZXJzID0gbmV3TWVtYmVycztcblx0XHRcdHRoaXMuYXR0YWNoKHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBmYWxzZSwgdHJ1ZSAvKl9pc1JlcGxhY2UqLyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGRvbid0IGRvIGFueXRoaW5nIGlmIHdlJ3JlIGdvaW5nIGZyb20gZW1wdHkgdG8gZW1wdHlcblx0XHRcdHRoaXMubWVtYmVycyA9IG5ld01lbWJlcnM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkTWVtYmVyOiBmdW5jdGlvbihuZXdNZW1iZXIsIGF0SW5kZXgsIF9pc01vdmUpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRcblx0XHQvLyB2YWxpZGF0ZSB0aGUgaW5kZXhcblx0XHRpZiAodHlwZW9mIGF0SW5kZXggIT09IFwibnVtYmVyXCIgfHwgaXNOYU4oYXRJbmRleCkgfHxcblx0XHRcdGF0SW5kZXggPCAwIHx8IGF0SW5kZXggPiBtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0YXRJbmRleCA9IG1lbWJlcnMubGVuZ3RoO1xuXHRcdH1cblxuXHRcdC8vIGFkZCByZWZlcmVuY2VzIHRvIHRoZSBuZXcgbWVtYmVyXG5cdFx0aWYgKCFfaXNNb3ZlKSB0aGlzLl9tZW1iZXJJbihuZXdNZW1iZXIpO1xuXG5cdFx0Ly8gY3VycmVudGx5IGRldGFjaGVkOyBqdXN0IHVwZGF0ZWQgbWVtYmVyc1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkge1xuXHRcdFx0bWVtYmVycy5zcGxpY2UoYXRJbmRleCwgMCwgbmV3TWVtYmVyKTtcblx0XHR9XG5cblx0XHQvLyBlbXB0eTsgdXNlIHRoZSBlbXB0eS10by1ub25lbXB0eSBoYW5kbGluZyBvZiBzZXRNZW1iZXJzXG5cdFx0ZWxzZSBpZiAobWVtYmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuc2V0TWVtYmVycyhbIG5ld01lbWJlciBdKTtcblx0XHR9XG5cblx0XHQvLyBvdGhlcndpc2UgYWRkIGF0IGxvY2F0aW9uXG5cdFx0ZWxzZSB7XG5cdFx0XHR2YXIgbmV4dE5vZGU7XG5cdFx0XHRpZiAoYXRJbmRleCA9PT0gbWVtYmVycy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gaW5zZXJ0IGF0IGVuZFxuXHRcdFx0XHRuZXh0Tm9kZSA9IHRoaXMubGFzdE5vZGUoKS5uZXh0U2libGluZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciBtID0gbWVtYmVyc1thdEluZGV4XTtcblx0XHRcdFx0bmV4dE5vZGUgPSAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0uZmlyc3ROb2RlKCkgOiBtO1xuXHRcdFx0fVxuXG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAwLCBuZXdNZW1iZXIpO1xuXHRcdFx0aW5zZXJ0SW50b0RPTShuZXdNZW1iZXIsIHRoaXMucGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZU1lbWJlcjogZnVuY3Rpb24oYXRJbmRleCwgX2lzTW92ZSkge1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdFxuXHRcdC8vIGFsc28gYWNjZXB0cyB0aGUgbWVtYmVyIHRvIHJlbW92ZVxuXHRcdGlmICh0eXBlb2YgYXRJbmRleCAhPT0gXCJudW1iZXJcIiB8fCBpc05hTihhdEluZGV4KSkge1xuXHRcdFx0YXRJbmRleCA9IHRoaXMuaW5kZXhPZihhdEluZGV4KTtcblx0XHR9XG5cblx0XHQvLyB2YWxpZGF0ZSB0aGUgaW5kZXhcblx0XHRpZiAoYXRJbmRleCA8IDAgfHwgYXRJbmRleCA+PSBtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIGluZGV4IGluIHJhbmdlLnJlbW92ZU1lbWJlcjogXCIgKyBhdEluZGV4KTtcblx0XHR9XG5cblx0XHRpZiAoX2lzTW92ZSkge1xuXHRcdFx0bWVtYmVycy5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBvbGRNZW1iZXIgPSBtZW1iZXJzW2F0SW5kZXhdO1xuXG5cdFx0XHRpZiAobWVtYmVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gYmVjb21pbmcgZW1wdHk7IHVzZSB0aGUgbG9naWMgaW4gc2V0TWVtYmVyc1xuXHRcdFx0XHR0aGlzLnNldE1lbWJlcnMoW10pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbWVtYmVyT3V0KG9sZE1lbWJlcik7XG5cdFx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRcdFx0XHRpZiAodGhpcy5hdHRhY2hlZCkgcmVtb3ZlRnJvbURPTShvbGRNZW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdG1vdmVNZW1iZXI6IGZ1bmN0aW9uKG9sZEluZGV4LCBuZXdJbmRleCkge1xuXHRcdHZhciBtZW1iZXIgPSB0aGlzLm1lbWJlcnNbb2xkSW5kZXhdO1xuXHRcdHRoaXMucmVtb3ZlTWVtYmVyKG9sZEluZGV4LCB0cnVlIC8qX2lzTW92ZSovKTtcblx0XHR0aGlzLmFkZE1lbWJlcihtZW1iZXIsIG5ld0luZGV4LCB0cnVlIC8qX2lzTW92ZSovKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRpbmRleE9mOiBmdW5jdGlvbihtZW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5tZW1iZXJzLmluZGV4T2YobWVtYmVyKTtcblx0fSxcblxuXHRjb250YWluczogZnVuY3Rpb24obWVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5kZXhPZihtZW1iZXIpID4gLTE7XG5cdH0sXG5cblx0X21lbWJlckluOiBmdW5jdGlvbihtKSB7XG5cdFx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0bS5wYXJlbnRSYW5nZSA9IHRoaXM7XG5cdFx0fSBlbHNlIGlmIChtLm5vZGVUeXBlID09PSAxKSB7IC8vIERPTSBFbGVtZW50XG5cdFx0XHRtLiRkb21yYW5nZSA9IHRoaXM7XG5cdFx0fVxuXHR9LFxuXG5cdF9tZW1iZXJPdXQ6IGZ1bmN0aW9uIChtLCBfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0aWYgKF9pc1JlcGxhY2UpIG0uZGVzdHJveU1lbWJlcnMoX3NraXBOb2RlcywgX2lzUmVwbGFjZSk7XG5cdFx0XHRlbHNlIG0uZGVzdHJveShfc2tpcE5vZGVzKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICghX3NraXBOb2RlcyAmJiBtLm5vZGVUeXBlID09PSAxICYmIG0uJGRvbXJhbmdlKSB7XG5cdFx0XHRtLiRkb21yYW5nZSA9IG51bGw7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIFRlYXIgZG93biwgYnV0IGRvbid0IHJlbW92ZSwgdGhlIG1lbWJlcnMuICBVc2VkIHdoZW4gY2h1bmtzXG5cdC8vIG9mIERPTSBhcmUgYmVpbmcgdG9ybiBkb3duIG9yIHJlcGxhY2VkLlxuXHRkZXN0cm95TWVtYmVyczogZnVuY3Rpb24oX3NraXBOb2RlcywgX2lzUmVwbGFjZSkge1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5fbWVtYmVyT3V0KG1lbWJlcnNbaV0sIF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRkZXN0cm95OiBmdW5jdGlvbihfc2tpcE5vZGVzKSB7XG5cdFx0dGhpcy5kZXRhY2goKTtcblx0XHR0aGlzLnRyaWdnZXIoXCJkZXN0cm95XCIsIF9za2lwTm9kZXMpO1xuXHRcdHRoaXMuZGVzdHJveU1lbWJlcnMoX3NraXBOb2Rlcyk7XG5cdFx0dGhpcy5tZW1iZXJzID0gW107XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgbWF0Y2hlcyA9IFtdLFxuXHRcdFx0ZWw7XG5cblx0XHRmb3IgKHZhciBpIGluIHRoaXMubWVtYmVycykge1xuXHRcdFx0ZWwgPSB0aGlzLm1lbWJlcnNbaV07XG5cdFx0XHRpZiAoZWwgaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0XHRtYXRjaGVzLnB1c2guYXBwbHkobWF0Y2hlcywgZWwuZmluZEFsbChzZWxlY3RvcikpO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgZWwucXVlcnlTZWxlY3RvckFsbCA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdGlmIChlbC5ub2RlVHlwZSA9PT0gMSAmJiB1dGlsLm1hdGNoZXNTZWxlY3RvcihlbCwgc2VsZWN0b3IpKSBtYXRjaGVzLnB1c2goZWwpO1xuXHRcdFx0XHRtYXRjaGVzLnB1c2guYXBwbHkobWF0Y2hlcywgZWwucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtYXRjaGVzXG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgZWwsIHJlcztcblxuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5tZW1iZXJzKSB7XG5cdFx0XHRlbCA9IHRoaXMubWVtYmVyc1tpXTtcblx0XHRcdGlmIChlbCBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRcdHJlcyA9IGVsLmZpbmQoc2VsZWN0b3IpO1xuXHRcdFx0fSBlbHNlIGlmIChlbC5ub2RlVHlwZSA9PT0gMSAmJiB1dGlsLm1hdGNoZXNTZWxlY3RvcihlbCwgc2VsZWN0b3IpKSB7XG5cdFx0XHRcdHJlcyA9IGVsO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgZWwucXVlcnlTZWxlY3RvciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHJlcyA9IGVsLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzICE9IG51bGwpIHJldHVybiByZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxufSk7XG5cbi8vIEluIElFIDgsIGRvbid0IHVzZSBlbXB0eSB0ZXh0IG5vZGVzIGFzIHBsYWNlaG9sZGVyc1xuLy8gaW4gZW1wdHkgRE9NUmFuZ2VzLCB1c2UgY29tbWVudCBub2RlcyBpbnN0ZWFkLiAgVXNpbmdcbi8vIGVtcHR5IHRleHQgbm9kZXMgaW4gbW9kZXJuIGJyb3dzZXJzIGlzIGdyZWF0IGJlY2F1c2Vcbi8vIGl0IGRvZXNuJ3QgY2x1dHRlciB0aGUgd2ViIGluc3BlY3Rvci4gIEluIElFIDgsIGhvd2V2ZXIsXG4vLyBpdCBzZWVtcyB0byBsZWFkIGluIHNvbWUgcm91bmRhYm91dCB3YXkgdG8gdGhlIE9BdXRoXG4vLyBwb3AtdXAgY3Jhc2hpbmcgdGhlIGJyb3dzZXIgY29tcGxldGVseS4gIEluIHRoZSBwYXN0LFxuLy8gd2UgZGlkbid0IHVzZSBlbXB0eSB0ZXh0IG5vZGVzIG9uIElFIDggYmVjYXVzZSB0aGV5XG4vLyBkb24ndCBhY2NlcHQgSlMgcHJvcGVydGllcywgc28ganVzdCB1c2UgdGhlIHNhbWUgbG9naWNcbi8vIGV2ZW4gdGhvdWdoIHdlIGRvbid0IG5lZWQgdG8gc2V0IHByb3BlcnRpZXMgb24gdGhlXG4vLyBwbGFjZWhvbGRlciBhbnltb3JlLlxudmFyIFVTRV9DT01NRU5UX1BMQUNFSE9MREVSUyA9IChmdW5jdGlvbiAoKSB7XG5cdHZhciByZXN1bHQgPSBmYWxzZTtcblx0dmFyIHRleHROb2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJcIik7XG5cdHRyeSB7XG5cdFx0dGV4dE5vZGUuc29tZVByb3AgPSB0cnVlO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0Ly8gSUUgOFxuXHRcdHJlc3VsdCA9IHRydWU7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn0pKCk7XG5cbmZ1bmN0aW9uIHBsYWNlaG9sZGVyTm9kZSgpIHtcblx0cmV0dXJuIFVTRV9DT01NRU5UX1BMQUNFSE9MREVSUyA/XG5cdFx0ZG9jdW1lbnQuY3JlYXRlQ29tbWVudChcIlwiKSA6XG5cdFx0ZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJcIik7XG59XG5cbi8vIHByaXZhdGUgbWV0aG9kc1xuZnVuY3Rpb24gaW5zZXJ0SW50b0RPTShyYW5nZU9yTm9kZSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUpIHtcblx0dmFyIG0gPSByYW5nZU9yTm9kZTtcblx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdG0uYXR0YWNoKHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlKTtcblx0fSBlbHNlIHtcblx0XHRpZiAoX2lzTW92ZSkge1xuXHRcdFx0bW92ZU5vZGVXaXRoSG9va3MobSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbnNlcnROb2RlV2l0aEhvb2tzKG0sIHBhcmVudEVsZW1lbnQsIG5leHROb2RlKTtcblx0XHR9XG5cdH1cbn07XG5cbmZ1bmN0aW9uIHJlbW92ZUZyb21ET00ocmFuZ2VPck5vZGUpIHtcblx0dmFyIG0gPSByYW5nZU9yTm9kZTtcblx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdG0uZGV0YWNoKCk7XG5cdH0gZWxzZSB7XG5cdFx0cmVtb3ZlTm9kZVdpdGhIb29rcyhtKTtcblx0fVxufTtcblxuZnVuY3Rpb24gcmVtb3ZlTm9kZVdpdGhIb29rcyhuKSB7XG5cdGlmICghbi5wYXJlbnROb2RlKSByZXR1cm47XG5cdGlmIChuLm5vZGVUeXBlID09PSAxICYmIG4ucGFyZW50Tm9kZS5fdWlob29rcyAmJiBuLnBhcmVudE5vZGUuX3VpaG9va3MucmVtb3ZlRWxlbWVudCkge1xuXHRcdG4ucGFyZW50Tm9kZS5fdWlob29rcy5yZW1vdmVFbGVtZW50KG4pO1xuXHR9IGVsc2Uge1xuXHRcdG4ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChuKTtcblx0fVxufTtcblxuZnVuY3Rpb24gaW5zZXJ0Tm9kZVdpdGhIb29rcyhuLCBwYXJlbnQsIG5leHQpIHtcblx0Ly8gYHx8IG51bGxgIGJlY2F1c2UgSUUgdGhyb3dzIGFuIGVycm9yIGlmICduZXh0JyBpcyB1bmRlZmluZWRcblx0bmV4dCA9IG5leHQgfHwgbnVsbDtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgcGFyZW50Ll91aWhvb2tzICYmIHBhcmVudC5fdWlob29rcy5pbnNlcnRFbGVtZW50KSB7XG5cdFx0cGFyZW50Ll91aWhvb2tzLmluc2VydEVsZW1lbnQobiwgbmV4dCk7XG5cdH0gZWxzZSB7XG5cdFx0cGFyZW50Lmluc2VydEJlZm9yZShuLCBuZXh0KTtcblx0fVxufTtcblxuZnVuY3Rpb24gbW92ZU5vZGVXaXRoSG9va3MobiwgcGFyZW50LCBuZXh0KSB7XG5cdGlmIChuLnBhcmVudE5vZGUgIT09IHBhcmVudClcblx0XHRyZXR1cm47XG5cdC8vIGB8fCBudWxsYCBiZWNhdXNlIElFIHRocm93cyBhbiBlcnJvciBpZiAnbmV4dCcgaXMgdW5kZWZpbmVkXG5cdG5leHQgPSBuZXh0IHx8IG51bGw7XG5cdGlmIChuLm5vZGVUeXBlID09PSAxICYmIHBhcmVudC5fdWlob29rcyAmJiBwYXJlbnQuX3VpaG9va3MubW92ZUVsZW1lbnQpIHtcblx0XHRwYXJlbnQuX3VpaG9va3MubW92ZUVsZW1lbnQobiwgbmV4dCk7XG5cdH0gZWxzZSB7XG5cdFx0cGFyZW50Lmluc2VydEJlZm9yZShuLCBuZXh0KTtcblx0fVxufTsiLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG4vLyBCYWNrYm9uZS5FdmVudHNcbi8vIC0tLS0tLS0tLS0tLS0tLVxuXG4vLyBBIG1vZHVsZSB0aGF0IGNhbiBiZSBtaXhlZCBpbiB0byAqYW55IG9iamVjdCogaW4gb3JkZXIgdG8gcHJvdmlkZSBpdCB3aXRoXG4vLyBjdXN0b20gZXZlbnRzLiBZb3UgbWF5IGJpbmQgd2l0aCBgb25gIG9yIHJlbW92ZSB3aXRoIGBvZmZgIGNhbGxiYWNrXG4vLyBmdW5jdGlvbnMgdG8gYW4gZXZlbnQ7IGB0cmlnZ2VyYC1pbmcgYW4gZXZlbnQgZmlyZXMgYWxsIGNhbGxiYWNrcyBpblxuLy8gc3VjY2Vzc2lvbi5cbi8vXG4vLyAgICAgdmFyIG9iamVjdCA9IHt9O1xuLy8gICAgIF8uZXh0ZW5kKG9iamVjdCwgQmFja2JvbmUuRXZlbnRzKTtcbi8vICAgICBvYmplY3Qub24oJ2V4cGFuZCcsIGZ1bmN0aW9uKCl7IGFsZXJ0KCdleHBhbmRlZCcpOyB9KTtcbi8vICAgICBvYmplY3QudHJpZ2dlcignZXhwYW5kJyk7XG4vL1xudmFyIEV2ZW50cyA9IG1vZHVsZS5leHBvcnRzID0ge1xuXG5cdC8vIEJpbmQgYW4gZXZlbnQgdG8gYSBgY2FsbGJhY2tgIGZ1bmN0aW9uLiBQYXNzaW5nIGBcImFsbFwiYCB3aWxsIGJpbmRcblx0Ly8gdGhlIGNhbGxiYWNrIHRvIGFsbCBldmVudHMgZmlyZWQuXG5cdG9uOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICdvbicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG5cdFx0dGhpcy5fZXZlbnRzIHx8ICh0aGlzLl9ldmVudHMgPSB7fSk7XG5cdFx0dmFyIGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSB8fCAodGhpcy5fZXZlbnRzW25hbWVdID0gW10pO1xuXHRcdGV2ZW50cy5wdXNoKHtjYWxsYmFjazogY2FsbGJhY2ssIGNvbnRleHQ6IGNvbnRleHQsIGN0eDogY29udGV4dCB8fCB0aGlzfSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gQmluZCBhbiBldmVudCB0byBvbmx5IGJlIHRyaWdnZXJlZCBhIHNpbmdsZSB0aW1lLiBBZnRlciB0aGUgZmlyc3QgdGltZVxuXHQvLyB0aGUgY2FsbGJhY2sgaXMgaW52b2tlZCwgaXQgd2lsbCBiZSByZW1vdmVkLlxuXHRvbmNlOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICdvbmNlJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0dmFyIGZuID0gXy5vbmNlKGZ1bmN0aW9uKCkge1xuXHRcdFx0c2VsZi5vZmYobmFtZSwgZm4pO1xuXHRcdFx0Y2FsbGJhY2suYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHR9KTtcblx0XHRmbi5fY2FsbGJhY2sgPSBjYWxsYmFjaztcblx0XHRyZXR1cm4gdGhpcy5vbihuYW1lLCBmbiwgY29udGV4dCk7XG5cdH0sXG5cblx0Ly8gUmVtb3ZlIG9uZSBvciBtYW55IGNhbGxiYWNrcy4gSWYgYGNvbnRleHRgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG5cdC8vIGNhbGxiYWNrcyB3aXRoIHRoYXQgZnVuY3Rpb24uIElmIGBjYWxsYmFja2AgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcblx0Ly8gY2FsbGJhY2tzIGZvciB0aGUgZXZlbnQuIElmIGBuYW1lYCBpcyBudWxsLCByZW1vdmVzIGFsbCBib3VuZFxuXHQvLyBjYWxsYmFja3MgZm9yIGFsbCBldmVudHMuXG5cdG9mZjogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcblx0XHR2YXIgcmV0YWluLCBldiwgZXZlbnRzLCBuYW1lcywgaSwgbCwgaiwgaztcblx0XHRpZiAoIXRoaXMuX2V2ZW50cyB8fCAhZXZlbnRzQXBpKHRoaXMsICdvZmYnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSkgcmV0dXJuIHRoaXM7XG5cdFx0aWYgKCFuYW1lICYmICFjYWxsYmFjayAmJiAhY29udGV4dCkge1xuXHRcdFx0dGhpcy5fZXZlbnRzID0gdm9pZCAwO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHRcdG5hbWVzID0gbmFtZSA/IFtuYW1lXSA6IE9iamVjdC5rZXlzKHRoaXMuX2V2ZW50cyk7XG5cdFx0Zm9yIChpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0bmFtZSA9IG5hbWVzW2ldO1xuXHRcdFx0aWYgKGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSkge1xuXHRcdFx0XHR0aGlzLl9ldmVudHNbbmFtZV0gPSByZXRhaW4gPSBbXTtcblx0XHRcdFx0aWYgKGNhbGxiYWNrIHx8IGNvbnRleHQpIHtcblx0XHRcdFx0XHRmb3IgKGogPSAwLCBrID0gZXZlbnRzLmxlbmd0aDsgaiA8IGs7IGorKykge1xuXHRcdFx0XHRcdFx0ZXYgPSBldmVudHNbal07XG5cdFx0XHRcdFx0XHRpZiAoKGNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2suX2NhbGxiYWNrKSB8fFxuXHRcdFx0XHRcdFx0XHRcdChjb250ZXh0ICYmIGNvbnRleHQgIT09IGV2LmNvbnRleHQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldGFpbi5wdXNoKGV2KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFyZXRhaW4ubGVuZ3RoKSBkZWxldGUgdGhpcy5fZXZlbnRzW25hbWVdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIFRyaWdnZXIgb25lIG9yIG1hbnkgZXZlbnRzLCBmaXJpbmcgYWxsIGJvdW5kIGNhbGxiYWNrcy4gQ2FsbGJhY2tzIGFyZVxuXHQvLyBwYXNzZWQgdGhlIHNhbWUgYXJndW1lbnRzIGFzIGB0cmlnZ2VyYCBpcywgYXBhcnQgZnJvbSB0aGUgZXZlbnQgbmFtZVxuXHQvLyAodW5sZXNzIHlvdSdyZSBsaXN0ZW5pbmcgb24gYFwiYWxsXCJgLCB3aGljaCB3aWxsIGNhdXNlIHlvdXIgY2FsbGJhY2sgdG9cblx0Ly8gcmVjZWl2ZSB0aGUgdHJ1ZSBuYW1lIG9mIHRoZSBldmVudCBhcyB0aGUgZmlyc3QgYXJndW1lbnQpLlxuXHR0cmlnZ2VyOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0aWYgKCF0aGlzLl9ldmVudHMpIHJldHVybiB0aGlzO1xuXHRcdHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblx0XHRpZiAoIWV2ZW50c0FwaSh0aGlzLCAndHJpZ2dlcicsIG5hbWUsIGFyZ3MpKSByZXR1cm4gdGhpcztcblx0XHR2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdO1xuXHRcdHZhciBhbGxFdmVudHMgPSB0aGlzLl9ldmVudHMuYWxsO1xuXHRcdGlmIChldmVudHMpIHRyaWdnZXJFdmVudHMoZXZlbnRzLCBhcmdzKTtcblx0XHRpZiAoYWxsRXZlbnRzKSB0cmlnZ2VyRXZlbnRzKGFsbEV2ZW50cywgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBUZWxsIHRoaXMgb2JqZWN0IHRvIHN0b3AgbGlzdGVuaW5nIHRvIGVpdGhlciBzcGVjaWZpYyBldmVudHMgLi4uIG9yXG5cdC8vIHRvIGV2ZXJ5IG9iamVjdCBpdCdzIGN1cnJlbnRseSBsaXN0ZW5pbmcgdG8uXG5cdHN0b3BMaXN0ZW5pbmc6IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcblx0XHR2YXIgbGlzdGVuaW5nVG8gPSB0aGlzLl9saXN0ZW5pbmdUbztcblx0XHRpZiAoIWxpc3RlbmluZ1RvKSByZXR1cm4gdGhpcztcblx0XHR2YXIgcmVtb3ZlID0gIW5hbWUgJiYgIWNhbGxiYWNrO1xuXHRcdGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG5cdFx0aWYgKG9iaikgKGxpc3RlbmluZ1RvID0ge30pW29iai5fbGlzdGVuSWRdID0gb2JqO1xuXHRcdGZvciAodmFyIGlkIGluIGxpc3RlbmluZ1RvKSB7XG5cdFx0XHRvYmogPSBsaXN0ZW5pbmdUb1tpZF07XG5cdFx0XHRvYmoub2ZmKG5hbWUsIGNhbGxiYWNrLCB0aGlzKTtcblx0XHRcdGlmIChyZW1vdmUgfHwgXy5pc0VtcHR5KG9iai5fZXZlbnRzKSkgZGVsZXRlIHRoaXMuX2xpc3RlbmluZ1RvW2lkXTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxufTtcblxuLy8gUmVndWxhciBleHByZXNzaW9uIHVzZWQgdG8gc3BsaXQgZXZlbnQgc3RyaW5ncy5cbnZhciBldmVudFNwbGl0dGVyID0gL1xccysvO1xuXG4vLyBJbXBsZW1lbnQgZmFuY3kgZmVhdHVyZXMgb2YgdGhlIEV2ZW50cyBBUEkgc3VjaCBhcyBtdWx0aXBsZSBldmVudFxuLy8gbmFtZXMgYFwiY2hhbmdlIGJsdXJcImAgYW5kIGpRdWVyeS1zdHlsZSBldmVudCBtYXBzIGB7Y2hhbmdlOiBhY3Rpb259YFxuLy8gaW4gdGVybXMgb2YgdGhlIGV4aXN0aW5nIEFQSS5cbnZhciBldmVudHNBcGkgPSBmdW5jdGlvbihvYmosIGFjdGlvbiwgbmFtZSwgcmVzdCkge1xuXHRpZiAoIW5hbWUpIHJldHVybiB0cnVlO1xuXG5cdC8vIEhhbmRsZSBldmVudCBtYXBzLlxuXHRpZiAodHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSB7XG5cdFx0Zm9yICh2YXIga2V5IGluIG5hbWUpIHtcblx0XHRcdG9ialthY3Rpb25dLmFwcGx5KG9iaiwgW2tleSwgbmFtZVtrZXldXS5jb25jYXQocmVzdCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvLyBIYW5kbGUgc3BhY2Ugc2VwYXJhdGVkIGV2ZW50IG5hbWVzLlxuXHRpZiAoZXZlbnRTcGxpdHRlci50ZXN0KG5hbWUpKSB7XG5cdFx0dmFyIG5hbWVzID0gbmFtZS5zcGxpdChldmVudFNwbGl0dGVyKTtcblx0XHRmb3IgKHZhciBpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuXHRcdFx0b2JqW2FjdGlvbl0uYXBwbHkob2JqLCBbbmFtZXNbaV1dLmNvbmNhdChyZXN0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufTtcblxuLy8gQSBkaWZmaWN1bHQtdG8tYmVsaWV2ZSwgYnV0IG9wdGltaXplZCBpbnRlcm5hbCBkaXNwYXRjaCBmdW5jdGlvbiBmb3Jcbi8vIHRyaWdnZXJpbmcgZXZlbnRzLiBUcmllcyB0byBrZWVwIHRoZSB1c3VhbCBjYXNlcyBzcGVlZHkgKG1vc3QgaW50ZXJuYWxcbi8vIEJhY2tib25lIGV2ZW50cyBoYXZlIDMgYXJndW1lbnRzKS5cbnZhciB0cmlnZ2VyRXZlbnRzID0gZnVuY3Rpb24oZXZlbnRzLCBhcmdzKSB7XG5cdHZhciBldiwgaSA9IC0xLCBsID0gZXZlbnRzLmxlbmd0aCwgYTEgPSBhcmdzWzBdLCBhMiA9IGFyZ3NbMV0sIGEzID0gYXJnc1syXTtcblx0c3dpdGNoIChhcmdzLmxlbmd0aCkge1xuXHRcdGNhc2UgMDogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgpOyByZXR1cm47XG5cdFx0Y2FzZSAxOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEpOyByZXR1cm47XG5cdFx0Y2FzZSAyOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyKTsgcmV0dXJuO1xuXHRcdGNhc2UgMzogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMiwgYTMpOyByZXR1cm47XG5cdFx0ZGVmYXVsdDogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suYXBwbHkoZXYuY3R4LCBhcmdzKTsgcmV0dXJuO1xuXHR9XG59O1xuXG52YXIgbGlzdGVuTWV0aG9kcyA9IHtsaXN0ZW5UbzogJ29uJywgbGlzdGVuVG9PbmNlOiAnb25jZSd9O1xuXG4vLyBJbnZlcnNpb24tb2YtY29udHJvbCB2ZXJzaW9ucyBvZiBgb25gIGFuZCBgb25jZWAuIFRlbGwgKnRoaXMqIG9iamVjdCB0b1xuLy8gbGlzdGVuIHRvIGFuIGV2ZW50IGluIGFub3RoZXIgb2JqZWN0IC4uLiBrZWVwaW5nIHRyYWNrIG9mIHdoYXQgaXQnc1xuLy8gbGlzdGVuaW5nIHRvLlxuXy5lYWNoKGxpc3Rlbk1ldGhvZHMsIGZ1bmN0aW9uKGltcGxlbWVudGF0aW9uLCBtZXRob2QpIHtcblx0RXZlbnRzW21ldGhvZF0gPSBmdW5jdGlvbihvYmosIG5hbWUsIGNhbGxiYWNrKSB7XG5cdFx0dmFyIGxpc3RlbmluZ1RvID0gdGhpcy5fbGlzdGVuaW5nVG8gfHwgKHRoaXMuX2xpc3RlbmluZ1RvID0ge30pO1xuXHRcdHZhciBpZCA9IG9iai5fbGlzdGVuSWQgfHwgKG9iai5fbGlzdGVuSWQgPSBfLnVuaXF1ZUlkKCdsJykpO1xuXHRcdGxpc3RlbmluZ1RvW2lkXSA9IG9iajtcblx0XHRpZiAoIWNhbGxiYWNrICYmIHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JykgY2FsbGJhY2sgPSB0aGlzO1xuXHRcdG9ialtpbXBsZW1lbnRhdGlvbl0obmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xufSk7XG5cbi8vIEFsaWFzZXMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuRXZlbnRzLmJpbmQgICA9IEV2ZW50cy5vbjtcbkV2ZW50cy51bmJpbmQgPSBFdmVudHMub2ZmO1xuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0VHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKSxcblx0cGFyc2UgPSByZXF1aXJlKFwiLi9tK3htbFwiKS5wYXJzZSxcblx0Tk9ERV9UWVBFID0gcmVxdWlyZShcIi4vdHlwZXNcIiksXG5cdHRyYWNrID0gcmVxdWlyZShcIi4vdHJhY2tcIik7XG5cbi8vIHByb3BlcnRpZXMgdGhhdCBOb2RlLmpzIGFuZCB0aGUgYnJvd3NlciBjYW4gaGFuZGxlXG52YXIgVGVtcGxlID0gbW9kdWxlLmV4cG9ydHMgPSBfLmRlZmF1bHRzKHtcblx0VkVSU0lPTjogXCIwLjUuN1wiLFxuXHROT0RFX1RZUEU6IE5PREVfVFlQRSxcblxuXHQvLyBvdGhlciBwYXJ0c1xuXHR1dGlsOiByZXF1aXJlKFwiLi91dGlsXCIpLFxuXHRFdmVudHM6IHJlcXVpcmUoXCIuL2V2ZW50c1wiKSxcblx0TW9kZWw6IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXG5cdC8vIHRyYWNrciBzaG9ydCBwb2ludGVyc1xuXHRUcmFja3I6IFRyYWNrcixcblx0RGVwZW5kZW5jeTogVHJhY2tyLkRlcGVuZGVuY3ksXG5cdGF1dG9ydW46IFRyYWNrci5hdXRvcnVuLFxuXG5cdC8vIGFsbCB0aGUgcGFyc2VycywgZGVjbGFyZWQgaGVyZSBmb3IgZWFzaWVyIGFjY2Vzc1xuXHRwYXJzZTogcGFyc2UsXG5cdHBhcnNlUGF0aDogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwicGF0aFwiIH0pKTtcblx0fSxcblx0cGFyc2VQYXRoUXVlcnk6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcInBhdGhRdWVyeVwiIH0pKTtcblx0fSxcblx0cGFyc2VBdHRyaWJ1dGVWYWx1ZTogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwiYXR0clZhbHVlXCIgfSkpO1xuXHR9LFxuXHRwYXJzZUFyZ3VtZW50czogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwiYXR0ckFyZ3VtZW50c1wiIH0pKTtcblx0fSxcblxuXHQvLyBjb252ZXJ0cyByYXcgaHRtbCBzdHIgdG8gdGVtcGxhdGUgdHJlZVxuXHRwYXJzZUhUTUw6IGZ1bmN0aW9uKHN0cikge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBOT0RFX1RZUEUuUk9PVCxcblx0XHRcdGNoaWxkcmVuOiBbIHtcblx0XHRcdFx0dHlwZTogTk9ERV9UWVBFLkhUTUwsXG5cdFx0XHRcdHZhbHVlOiBzdHJcblx0XHRcdH0gXSxcblx0XHRcdHZlcnNpb246IFRlbXBsZS5WRVJTSU9OXG5cdFx0fTtcblx0fVxufSwgdHJhY2spO1xuXG4vLyBubyBuZWVkIGZvciBub2RlIGpzIHRvIGh1cnQgaXRzZWxmIG9uIGFueSBoYXJkIGVkZ2VzXG5pZiAodHlwZW9mIGRvY3VtZW50ID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cbi8vIGF0dGFjaCB0aGUgb3RoZXIgcGFydHMgdGhhdCBOb2RlIGNhbid0IHVzZVxuVGVtcGxlLkRPTVJhbmdlID0gcmVxdWlyZShcIi4vZG9tcmFuZ2VcIik7XG5UZW1wbGUuVmlldyA9IHJlcXVpcmUoXCIuL3ZpZXdcIik7XG5UZW1wbGUuU2VjdGlvbiA9IHJlcXVpcmUoXCIuL3NlY3Rpb25cIik7XG5cbi8vIGxvYWQgdGhlIHJlYWwgY2xhc3MgZm9yIHRoZSBicm93c2VyXG5UZW1wbGUgPSBtb2R1bGUuZXhwb3J0cyA9IF8uZXh0ZW5kKHJlcXVpcmUoXCIuL211c3RhY2hlXCIpLCBUZW1wbGUpO1xuXG4vLyBsb2FkIHRoZSBwbHVnaW4gQVBJXG5fLmV4dGVuZChUZW1wbGUsIHJlcXVpcmUoXCIuL3BsdWdpbnNcIikpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSAoZnVuY3Rpb24oKSB7XG4gIC8qXG4gICAqIEdlbmVyYXRlZCBieSBQRUcuanMgMC44LjAuXG4gICAqXG4gICAqIGh0dHA6Ly9wZWdqcy5tYWpkYS5jei9cbiAgICovXG5cbiAgZnVuY3Rpb24gcGVnJHN1YmNsYXNzKGNoaWxkLCBwYXJlbnQpIHtcbiAgICBmdW5jdGlvbiBjdG9yKCkgeyB0aGlzLmNvbnN0cnVjdG9yID0gY2hpbGQ7IH1cbiAgICBjdG9yLnByb3RvdHlwZSA9IHBhcmVudC5wcm90b3R5cGU7XG4gICAgY2hpbGQucHJvdG90eXBlID0gbmV3IGN0b3IoKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIFN5bnRheEVycm9yKG1lc3NhZ2UsIGV4cGVjdGVkLCBmb3VuZCwgb2Zmc2V0LCBsaW5lLCBjb2x1bW4pIHtcbiAgICB0aGlzLm1lc3NhZ2UgID0gbWVzc2FnZTtcbiAgICB0aGlzLmV4cGVjdGVkID0gZXhwZWN0ZWQ7XG4gICAgdGhpcy5mb3VuZCAgICA9IGZvdW5kO1xuICAgIHRoaXMub2Zmc2V0ICAgPSBvZmZzZXQ7XG4gICAgdGhpcy5saW5lICAgICA9IGxpbmU7XG4gICAgdGhpcy5jb2x1bW4gICA9IGNvbHVtbjtcblxuICAgIHRoaXMubmFtZSAgICAgPSBcIlN5bnRheEVycm9yXCI7XG4gIH1cblxuICBwZWckc3ViY2xhc3MoU3ludGF4RXJyb3IsIEVycm9yKTtcblxuICBmdW5jdGlvbiBwYXJzZShpbnB1dCkge1xuICAgIHZhciBvcHRpb25zID0gYXJndW1lbnRzLmxlbmd0aCA+IDEgPyBhcmd1bWVudHNbMV0gOiB7fSxcblxuICAgICAgICBwZWckRkFJTEVEID0ge30sXG5cbiAgICAgICAgcGVnJHN0YXJ0UnVsZUluZGljZXMgPSB7IHN0YXJ0OiAwLCBhdHRyVmFsdWU6IDksIGF0dHJBcmd1bWVudHM6IDEwLCBwYXRoUXVlcnk6IDE5LCBwYXRoOiAyMSB9LFxuICAgICAgICBwZWckc3RhcnRSdWxlSW5kZXggICA9IDAsXG5cbiAgICAgICAgcGVnJGNvbnN0cyA9IFtcbiAgICAgICAgICBmdW5jdGlvbihodG1sKSB7XG4gICAgICAgICAgXHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHR0eXBlOiBOT0RFX1RZUEUuUk9PVCxcbiAgICAgICAgICBcdFx0Y2hpbGRyZW46IGh0bWwsXG4gICAgICAgICAgXHRcdHZlcnNpb246IE11c3RhY2hlLlZFUlNJT05cbiAgICAgICAgICBcdH1cbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdLFxuICAgICAgICAgIGZ1bmN0aW9uKG5vZGVzKSB7IHJldHVybiBfLmNvbXBhY3Qobm9kZXMpOyB9LFxuICAgICAgICAgIHBlZyRGQUlMRUQsXG4gICAgICAgICAgL15bXjx7XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIltePHtdXCIsIGRlc2NyaXB0aW9uOiBcIltePHtdXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0ZXh0KSB7IHJldHVybiB7IHR5cGU6IE5PREVfVFlQRS5URVhULCB2YWx1ZTogdGV4dC5qb2luKFwiXCIpIH07IH0sXG4gICAgICAgICAgXCI8IS0tXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPCEtLVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPCEtLVxcXCJcIiB9LFxuICAgICAgICAgIHZvaWQgMCxcbiAgICAgICAgICBcIi0tPlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi0tPlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLS0+XFxcIlwiIH0sXG4gICAgICAgICAgeyB0eXBlOiBcImFueVwiLCBkZXNjcmlwdGlvbjogXCJhbnkgY2hhcmFjdGVyXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2KSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7IHR5cGU6IE5PREVfVFlQRS5YQ09NTUVOVCwgdmFsdWU6IHYgfTtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgZnVuY3Rpb24oc3RhcnQsIG5vZGVzLCBlbmQpIHtcbiAgICAgICAgICBcdFx0aWYgKHN0YXJ0Lm5hbWUudG9Mb3dlckNhc2UoKSAhPT0gZW5kLnRvTG93ZXJDYXNlKCkpIHtcbiAgICAgICAgICBcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFbGVtZW50IHRhZyBtaXNtYXRjaDogXCIgKyBzdGFydC5uYW1lICsgXCIgIT09IFwiICsgZW5kKTtcbiAgICAgICAgICBcdFx0fVxuXG4gICAgICAgICAgXHRcdHN0YXJ0LnR5cGUgPSBOT0RFX1RZUEUuRUxFTUVOVDtcbiAgICAgICAgICBcdFx0c3RhcnQuY2hpbGRyZW4gPSBub2RlcztcbiAgICAgICAgICBcdFx0cmV0dXJuIHN0YXJ0O1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcIjxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI8XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI8XFxcIlwiIH0sXG4gICAgICAgICAgXCIvPlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi8+XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIvPlxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHRhZ25hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHRuYW1lOiB0YWduYW1lLFxuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5FTEVNRU5ULFxuICAgICAgICAgIFx0XHRcdGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMsXG4gICAgICAgICAgXHRcdFx0Y2hpbGRyZW46IFtdXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCI+XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPlxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHRhZ25hbWUsIGF0dHJpYnV0ZXMpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHsgbmFtZTogdGFnbmFtZSwgYXR0cmlidXRlczogYXR0cmlidXRlcyB9O1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcIjwvXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPC9cIiwgZGVzY3JpcHRpb246IFwiXFxcIjwvXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odGFnbmFtZSkgeyByZXR1cm4gdGFnbmFtZTsgfSxcbiAgICAgICAgICBudWxsLFxuICAgICAgICAgIFwiPVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIj1cIiwgZGVzY3JpcHRpb246IFwiXFxcIj1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHZhbHVlID0gdmFsdWUgIT0gbnVsbCA/IHZhbHVlWzJdIDogXCJcIjtcbiAgICAgICAgICBcdFx0dmFyIGFyZ3NcblxuICAgICAgICAgIFx0XHQvLyBjb3VsZCBmYWlsIG9uIGNvbXBsZXggYXR0cmlidXRlc1xuICAgICAgICAgIFx0XHR0cnkge1xuICAgICAgICAgIFx0XHRcdGFyZ3MgPSBwYXJzZSh2YWx1ZSwgIF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7IHN0YXJ0UnVsZTogXCJhdHRyQXJndW1lbnRzXCIgfSkpO1xuICAgICAgICAgIFx0XHR9IGNhdGNoKGUpIHtcbiAgICAgICAgICBcdFx0XHRhcmdzID0gW3sgdHlwZTogTk9ERV9UWVBFLkxJVEVSQUwsIHZhbHVlOiB2YWx1ZSB9XTtcbiAgICAgICAgICBcdFx0fVxuXG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLkFUVFJJQlVURSxcbiAgICAgICAgICBcdFx0XHRuYW1lOiBrZXksXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlLFxuICAgICAgICAgIFx0XHRcdGNoaWxkcmVuOiBwYXJzZSh2YWx1ZSwgXy5leHRlbmQoe30sIG9wdGlvbnMsIHsgc3RhcnRSdWxlOiBcImF0dHJWYWx1ZVwiIH0pKSxcbiAgICAgICAgICBcdFx0XHRhcmd1bWVudHM6IGFyZ3NcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcIixcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIsXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIsXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24obCwgcikgeyByZXR1cm4gW10uY29uY2F0KGwsIF8ucGx1Y2sociwgMSkpOyB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHYpIHsgcmV0dXJuIHYudHJpbSgpOyB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgIFx0XHRpZiAodmFsICE9IG51bGwgJiYgdmFsLnR5cGUpIHJldHVybiB2YWw7XG4gICAgICAgICAgXHRcdHJldHVybiB7IHR5cGU6IE5PREVfVFlQRS5MSVRFUkFMLCB2YWx1ZTogdmFsIH07XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIGZ1bmN0aW9uKHN0YXJ0LCBub2RlcywgZW5kKSB7XG4gICAgICAgICAgXHRcdGlmIChvcHRpb25zLnN0cmljdCAmJiAhXy5pc0VxdWFsKHN0YXJ0LnZhbHVlLnJhdywgZW5kKSkge1xuICAgICAgICAgIFx0XHRcdHRocm93IG5ldyBFcnJvcihcIlNlY3Rpb24gdGFnIG1pc21hdGNoOiBcIiArIHN0YXJ0LnZhbHVlLnJhdyArIFwiICE9PSBcIiArIGVuZCk7XG4gICAgICAgICAgXHRcdH1cblxuICAgICAgICAgIFx0XHRzdGFydC52YWx1ZSA9IHN0YXJ0LnZhbHVlLnJlc3VsdDtcbiAgICAgICAgICBcdFx0c3RhcnQuY2hpbGRyZW4gPSBub2RlcztcbiAgICAgICAgICBcdFx0cmV0dXJuIHN0YXJ0O1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcInt7XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwie3tcIiwgZGVzY3JpcHRpb246IFwiXFxcInt7XFxcIlwiIH0sXG4gICAgICAgICAgL15bI1xcXl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbI1xcXFxeXVwiLCBkZXNjcmlwdGlvbjogXCJbI1xcXFxeXVwiIH0sXG4gICAgICAgICAgXCJ9fVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIn19XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ9fVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHR5cGUsIHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFW3R5cGUgPT09IFwiI1wiID8gXCJTRUNUSU9OXCIgOiBcIklOVkVSVEVEXCJdLFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwie3svXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwie3svXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ7ey9cXFwiXCIgfSxcbiAgICAgICAgICAvXltefV0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXn1dXCIsIGRlc2NyaXB0aW9uOiBcIltefV1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbHVlKSB7IHJldHVybiB2YWx1ZS5qb2luKFwiXCIpOyB9LFxuICAgICAgICAgIFwie3t7XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwie3t7XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ7e3tcXFwiXCIgfSxcbiAgICAgICAgICBcIn19fVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIn19fVwiLCBkZXNjcmlwdGlvbjogXCJcXFwifX19XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuSU5URVJQT0xBVE9SLFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZVsxXVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIC9eW1xcLyN7IT5cXF5dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW1xcXFwvI3shPlxcXFxeXVwiLCBkZXNjcmlwdGlvbjogXCJbXFxcXC8jeyE+XFxcXF5dXCIgfSxcbiAgICAgICAgICBcIiZcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCImXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCImXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24obSwgdmFsdWUpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBtID8gTk9ERV9UWVBFLlRSSVBMRSA6IE5PREVfVFlQRS5JTlRFUlBPTEFUT1IsXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuVFJJUExFLFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIC9eWyE+XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlshPl1cIiwgZGVzY3JpcHRpb246IFwiWyE+XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24obSwgdmFsdWUpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBtID09PSBcIj5cIiA/IE5PREVfVFlQRS5QQVJUSUFMIDogTk9ERV9UWVBFLk1DT01NRU5ULFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZS5qb2luKFwiXCIpLnRyaW0oKVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwifFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInxcIiwgZGVzY3JpcHRpb246IFwiXFxcInxcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihtKSB7IHJldHVybiB7IHJhdzogdGV4dCgpLCByZXN1bHQ6IG0gfSB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHAsIGMpIHtcbiAgICAgICAgICBcdFx0aWYgKHAgPT0gbnVsbCkgcCA9IHsgdHlwZTogXCJhbGxcIiB9O1xuICAgICAgICAgIFx0XHRwLnBhcnRzID0gYztcbiAgICAgICAgICBcdFx0cmV0dXJuIHA7XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIGZ1bmN0aW9uKHApIHsgcC5wYXJ0cyA9IFtdOyByZXR1cm4gcDsgfSxcbiAgICAgICAgICBcIi4uL1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi4uL1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiLi4vXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oZCkgeyByZXR1cm4geyB0eXBlOiBcInBhcmVudFwiLCBkaXN0YW5jZTogZC5sZW5ndGggfTsgfSxcbiAgICAgICAgICBcIi4vXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLi9cIiwgZGVzY3JpcHRpb246IFwiXFxcIi4vXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiB7IHR5cGU6IFwibG9jYWxcIiB9OyB9LFxuICAgICAgICAgIFwiLlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi5cXFwiXCIgfSxcbiAgICAgICAgICBcIi9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIvXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIvXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiB7IHR5cGU6IFwicm9vdFwiIH07IH0sXG4gICAgICAgICAgL15bYS16MC05JF9dL2ksXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlthLXowLTkkX11pXCIsIGRlc2NyaXB0aW9uOiBcIlthLXowLTkkX11pXCIgfSxcbiAgICAgICAgICAvXlthLXowLTk6XFwtXyRdL2ksXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlthLXowLTk6XFxcXC1fJF1pXCIsIGRlc2NyaXB0aW9uOiBcIlthLXowLTk6XFxcXC1fJF1pXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihrLCBjKSB7IHJldHVybiB7IGtleTogaywgY2hpbGRyZW46IGMgfSB9LFxuICAgICAgICAgIFwiW1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIltcIiwgZGVzY3JpcHRpb246IFwiXFxcIltcXFwiXCIgfSxcbiAgICAgICAgICBcIl1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJdXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJdXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oYykgeyByZXR1cm4gYzsgfSxcbiAgICAgICAgICBcInRydWVcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ0cnVlXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ0cnVlXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiB0cnVlOyB9LFxuICAgICAgICAgIFwiZmFsc2VcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJmYWxzZVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiZmFsc2VcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIGZhbHNlOyB9LFxuICAgICAgICAgIFwiLVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi1cIiwgZGVzY3JpcHRpb246IFwiXFxcIi1cXFwiXCIgfSxcbiAgICAgICAgICAvXlswLTldLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWzAtOV1cIiwgZGVzY3JpcHRpb246IFwiWzAtOV1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gcGFyc2VGbG9hdCh0ZXh0KCksIDEwKTsgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHBhcnNlSW50KHRleHQoKSwgMTApOyB9LFxuICAgICAgICAgIFwiXFxcIlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIlxcXCJcIiwgZGVzY3JpcHRpb246IFwiXFxcIlxcXFxcXFwiXFxcIlwiIH0sXG4gICAgICAgICAgL15bXlwiXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlteXFxcIl1cIiwgZGVzY3JpcHRpb246IFwiW15cXFwiXVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odikgeyByZXR1cm4gdi5qb2luKFwiXCIpOyB9LFxuICAgICAgICAgIFwiJ1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIidcIiwgZGVzY3JpcHRpb246IFwiXFxcIidcXFwiXCIgfSxcbiAgICAgICAgICAvXlteJ10vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXiddXCIsIGRlc2NyaXB0aW9uOiBcIlteJ11cIiB9LFxuICAgICAgICAgIFwibnVsbFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIm51bGxcIiwgZGVzY3JpcHRpb246IFwiXFxcIm51bGxcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIG51bGw7IH0sXG4gICAgICAgICAgXCJ1bmRlZmluZWRcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ1bmRlZmluZWRcIiwgZGVzY3JpcHRpb246IFwiXFxcInVuZGVmaW5lZFxcXCJcIiB9LFxuICAgICAgICAgIFwidm9pZFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInZvaWRcIiwgZGVzY3JpcHRpb246IFwiXFxcInZvaWRcXFwiXCIgfSxcbiAgICAgICAgICAvXlssOyBcXHRcXG5cXHJdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyw7IFxcXFx0XFxcXG5cXFxccl1cIiwgZGVzY3JpcHRpb246IFwiWyw7IFxcXFx0XFxcXG5cXFxccl1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gdm9pZCAwOyB9LFxuICAgICAgICAgIC9eW2EtejAtOV9cXC1dL2ksXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlthLXowLTlfXFxcXC1daVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05X1xcXFwtXWlcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGspIHsgcmV0dXJuIGs7IH0sXG4gICAgICAgICAgeyB0eXBlOiBcIm90aGVyXCIsIGRlc2NyaXB0aW9uOiBcIndoaXRlc3BhY2VcIiB9LFxuICAgICAgICAgIC9eWyBcXHRcXG5cXHJdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyBcXFxcdFxcXFxuXFxcXHJdXCIsIGRlc2NyaXB0aW9uOiBcIlsgXFxcXHRcXFxcblxcXFxyXVwiIH0sXG4gICAgICAgICAgeyB0eXBlOiBcIm90aGVyXCIsIGRlc2NyaXB0aW9uOiBcImd1YXJhbnRlZWQgd2hpdGVzcGFjZVwiIH0sXG4gICAgICAgICAgXCJcXFxcXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXFxcXFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXFxcXFxcXFxcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihjaGFyKSB7IHJldHVybiBjaGFyOyB9XG4gICAgICAgIF0sXG5cbiAgICAgICAgcGVnJGJ5dGVjb2RlID0gW1xuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNyErJyA0ITYgISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISAhNywqQSBcXFwiNzIqOyBcXFwiNzAqNSBcXFwiNzEqLyBcXFwiNyMqKSBcXFwiNyQqIyBcXFwiN1xcXCIsRyY3LCpBIFxcXCI3Mio7IFxcXCI3MCo1IFxcXCI3MSovIFxcXCI3IyopIFxcXCI3JCojIFxcXCI3XFxcIlxcXCIrJyA0ITZcXFwiISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISAhMCRcXFwiXFxcIjEhMyUrLCQsKSYwJFxcXCJcXFwiMSEzJVxcXCJcXFwiXFxcIiAjKycgNCE2JiEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuJ1xcXCJcXFwiMiczKCtcXHhBQyQhICEhITguKlxcXCJcXFwiMiozKzkqJCRcXFwiXFxcIiApXFxcIiMgIysyJC1cXFwiXFxcIjEhMywrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsUSYhITguKlxcXCJcXFwiMiozKzkqJCRcXFwiXFxcIiApXFxcIiMgIysyJC1cXFwiXFxcIjEhMywrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiKyEgKCUrOCUuKlxcXCJcXFwiMiozKysoJTQjNi0jISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIjclKkkgXFxcIiE3Jis+JDchKzQlNycrKiU0IzYuIyNcXFwiISAlJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuL1xcXCJcXFwiMi8zMCtVJDdAK0slICE3KCwjJjcoXFxcIis5JS4xXFxcIlxcXCIyMTMyKyklNCQ2MyRcXFwiXFxcIiElJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS4vXFxcIlxcXCIyLzMwK1UkN0ArSyUgITcoLCMmNyhcXFwiKzklLjRcXFwiXFxcIjI0MzUrKSU0JDY2JFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLjdcXFwiXFxcIjI3MzgrQiQ3QCs4JS40XFxcIlxcXCIyNDM1KyglNCM2OSMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITdAK2gkIS47XFxcIlxcXCIyOzM8K0EkN0ErNyU3PSstJTdBKyMlJyQlJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgIyojIFxcXCIgOispJTRcXFwiNj1cXFwiXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISAhNywqNSBcXFwiNzIqLyBcXFwiNzAqKSBcXFwiNzEqIyBcXFwiN1xcXCIsOyY3LCo1IFxcXCI3MiovIFxcXCI3MCopIFxcXCI3MSojIFxcXCI3XFxcIlxcXCIrJyA0ITZcXFwiISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITcrK3EkICEhLj5cXFwiXFxcIjI+Mz8rLSQ3KysjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyw+JiEuPlxcXCJcXFwiMj4zPystJDcrKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIispJTRcXFwiNkBcXFwiXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITdBK1xceEQ2JDcvKlxceEI3IFxcXCI3PSpcXHhCMSBcXFwiNzoqXFx4QUIgXFxcIjc7KlxceEE1IFxcXCI3PipcXHg5RiBcXFwiNz8qXFx4OTkgXFxcIiEhICEhITguPlxcXCJcXFwiMj4zPzkqJCRcXFwiXFxcIiApXFxcIiMgIysyJC1cXFwiXFxcIjEhMywrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsUSYhITguPlxcXCJcXFwiMj4zPzkqJCRcXFwiXFxcIiApXFxcIiMgIysyJC1cXFwiXFxcIjEhMywrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiKyEgKCUrJyA0ITZBISEgJSsyJTdBKyglNCM2QiMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITctKz4kNyErNCU3LisqJTQjNkMjI1xcXCIhICUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5EXFxcIlxcXCIyRDNFK1MkMEZcXFwiXFxcIjEhM0crQyU3NCs5JS5IXFxcIlxcXCIySDNJKyklNCQ2SiRcXFwiXFxcIiElJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5LXFxcIlxcXCIySzNMK2IkICE3QyopIFxcXCIwTVxcXCJcXFwiMSEzTiwvJjdDKikgXFxcIjBNXFxcIlxcXCIxITNOXFxcIis4JS5IXFxcIlxcXCIySDNJKyglNCM2TyMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISEuUFxcXCJcXFwiMlAzUSs9JDczKzMlLlJcXFwiXFxcIjJSM1MrIyUnIyUkIyMgIyRcXFwiIyAjXFxcIiMgIypOIFxcXCIhLkRcXFwiXFxcIjJEM0UrPSQ3MyszJS5IXFxcIlxcXCIySDNJKyMlJyMlJCMjICMkXFxcIiMgI1xcXCIjICMrJyA0ITZUISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5EXFxcIlxcXCIyRDNFK3ckITgwVVxcXCJcXFwiMSEzVjkqJCRcXFwiXFxcIiApXFxcIiMgIytZJS5XXFxcIlxcXCIyVzNYKiMgXFxcIiA6K0MlNzMrOSUuSFxcXCJcXFwiMkgzSSspJTQlNlklXFxcIlxcXCIhJSQlIyAjJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5QXFxcIlxcXCIyUDNRK0IkNzMrOCUuUlxcXCJcXFwiMlIzUysoJTQjNlojISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuRFxcXCJcXFwiMkQzRStzJDBbXFxcIlxcXCIxITNcXFxcK2MlICE3QyopIFxcXCIwTVxcXCJcXFwiMSEzTiwvJjdDKikgXFxcIjBNXFxcIlxcXCIxITNOXFxcIis5JS5IXFxcIlxcXCIySDNJKyklNCQ2XSRcXFwiXFxcIiElJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITc1K3EkICEhLl5cXFwiXFxcIjJeM18rLSQ3NSsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyw+JiEuXlxcXCJcXFwiMl4zXystJDc1KyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIispJTRcXFwiNkBcXFwiXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITczKycgNCE2YCEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QStNJDc2KiMgXFxcIiA6Kz0lNzcrMyU3QSspJTQkNmEkXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICMqRyBcXFwiITdBKzwkNzYrMiU3QSsoJTQjNmIjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgIS5jXFxcIlxcXCIyYzNkKywkLCkmLmNcXFwiXFxcIjJjM2RcXFwiXFxcIlxcXCIgIysnIDQhNmUhISAlKmIgXFxcIiEuZlxcXCJcXFwiMmYzZysmIDQhNmghICUqSyBcXFwiIS5pXFxcIlxcXCIyaTNqKyYgNCE2aCEgJSo0IFxcXCIhLmtcXFwiXFxcIjJrM2wrJiA0ITZtISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNzgrcSQgISEuaVxcXCJcXFwiMmkzaistJDc4KyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLD4mIS5pXFxcIlxcXCIyaTNqKy0kNzgrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiKyklNFxcXCI2QFxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhISEwblxcXCJcXFwiMSEzbytBJCAhMHBcXFwiXFxcIjEhM3EsKSYwcFxcXCJcXFwiMSEzcVxcXCIrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMrISAoJSs7JCAhNzksIyY3OVxcXCIrKSU0XFxcIjZyXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuc1xcXCJcXFwiMnMzdCtiJDdBK1glNzwqKSBcXFwiNz0qIyBcXFwiNzUrQiU3QSs4JS51XFxcIlxcXCIydTN2KyglNCU2dyUhXFxcIiUkJSMgIyQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEueFxcXCJcXFwiMngzeSsmIDQhNnohICUqNCBcXFwiIS57XFxcIlxcXCIyezN8KyYgNCE2fSEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5+XFxcIlxcXCIyfjN/KiMgXFxcIiA6K1xceDkyJCAhMFxceDgwXFxcIlxcXCIxITNcXHg4MSssJCwpJjBcXHg4MFxcXCJcXFwiMSEzXFx4ODFcXFwiXFxcIlxcXCIgIyttJSEuaVxcXCJcXFwiMmkzaitIJCAhMFxceDgwXFxcIlxcXCIxITNcXHg4MSssJCwpJjBcXHg4MFxcXCJcXFwiMSEzXFx4ODFcXFwiXFxcIlxcXCIgIysjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyojIFxcXCIgOisnJTQjNlxceDgyIyAlJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITBcXHg4MFxcXCJcXFwiMSEzXFx4ODErLCQsKSYwXFx4ODBcXFwiXFxcIjEhM1xceDgxXFxcIlxcXCJcXFwiICMrJiA0ITZcXHg4MyEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHg4NFxcXCJcXFwiMlxceDg0M1xceDg1K2IkICE3QyopIFxcXCIwXFx4ODZcXFwiXFxcIjEhM1xceDg3LC8mN0MqKSBcXFwiMFxceDg2XFxcIlxcXCIxITNcXHg4N1xcXCIrOCUuXFx4ODRcXFwiXFxcIjJcXHg4NDNcXHg4NSsoJTQjNlxceDg4IyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjKnMgXFxcIiEuXFx4ODlcXFwiXFxcIjJcXHg4OTNcXHg4QStiJCAhN0MqKSBcXFwiMFxceDhCXFxcIlxcXCIxITNcXHg4QywvJjdDKikgXFxcIjBcXHg4QlxcXCJcXFwiMSEzXFx4OENcXFwiKzglLlxceDg5XFxcIlxcXCIyXFx4ODkzXFx4OEErKCU0IzZcXHg4OCMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHg4RFxcXCJcXFwiMlxceDhEM1xceDhFKyYgNCE2XFx4OEYhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuXFx4OTBcXFwiXFxcIjJcXHg5MDNcXHg5MSpcXHhCMyBcXFwiIS5cXHg5MlxcXCJcXFwiMlxceDkyM1xceDkzK1xceEEyJDdCK1xceDk4JSAhISE4MFxceDk0XFxcIlxcXCIxITNcXHg5NTkqJCRcXFwiXFxcIiApXFxcIiMgIysyJC1cXFwiXFxcIjEhMywrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMrVCQsUSYhITgwXFx4OTRcXFwiXFxcIjEhM1xceDk1OSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCJcXFwiXFxcIiAjKyMlJyMlJCMjICMkXFxcIiMgI1xcXCIjICMrJiA0ITZcXHg5NiEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITdBK10kISAhMFxceDk3XFxcIlxcXCIxITNcXHg5OCssJCwpJjBcXHg5N1xcXCJcXFwiMSEzXFx4OThcXFwiXFxcIlxcXCIgIyshICglKzIlN0ErKCU0IzZcXHg5OSMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiOCEgITBcXHg5QlxcXCJcXFwiMSEzXFx4OUMsKSYwXFx4OUJcXFwiXFxcIjEhM1xceDlDXFxcIishICglOSpcXFwiIDNcXHg5QVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiOCEgITBcXHg5QlxcXCJcXFwiMSEzXFx4OUMrLCQsKSYwXFx4OUJcXFwiXFxcIjEhM1xceDlDXFxcIlxcXCJcXFwiICMrISAoJTkqXFxcIiAzXFx4OURcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuXFx4OUVcXFwiXFxcIjJcXHg5RTNcXHg5Ris3JC1cXFwiXFxcIjEhMywrKCU0XFxcIjZcXHhBMFxcXCIhICUkXFxcIiMgI1xcXCIjICNcIilcbiAgICAgICAgXSxcblxuICAgICAgICBwZWckY3VyclBvcyAgICAgICAgICA9IDAsXG4gICAgICAgIHBlZyRyZXBvcnRlZFBvcyAgICAgID0gMCxcbiAgICAgICAgcGVnJGNhY2hlZFBvcyAgICAgICAgPSAwLFxuICAgICAgICBwZWckY2FjaGVkUG9zRGV0YWlscyA9IHsgbGluZTogMSwgY29sdW1uOiAxLCBzZWVuQ1I6IGZhbHNlIH0sXG4gICAgICAgIHBlZyRtYXhGYWlsUG9zICAgICAgID0gMCxcbiAgICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZCAgPSBbXSxcbiAgICAgICAgcGVnJHNpbGVudEZhaWxzICAgICAgPSAwLFxuXG4gICAgICAgIHBlZyRyZXN1bHQ7XG5cbiAgICBpZiAoXCJzdGFydFJ1bGVcIiBpbiBvcHRpb25zKSB7XG4gICAgICBpZiAoIShvcHRpb25zLnN0YXJ0UnVsZSBpbiBwZWckc3RhcnRSdWxlSW5kaWNlcykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3Qgc3RhcnQgcGFyc2luZyBmcm9tIHJ1bGUgXFxcIlwiICsgb3B0aW9ucy5zdGFydFJ1bGUgKyBcIlxcXCIuXCIpO1xuICAgICAgfVxuXG4gICAgICBwZWckc3RhcnRSdWxlSW5kZXggPSBwZWckc3RhcnRSdWxlSW5kaWNlc1tvcHRpb25zLnN0YXJ0UnVsZV07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGV4dCgpIHtcbiAgICAgIHJldHVybiBpbnB1dC5zdWJzdHJpbmcocGVnJHJlcG9ydGVkUG9zLCBwZWckY3VyclBvcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb2Zmc2V0KCkge1xuICAgICAgcmV0dXJuIHBlZyRyZXBvcnRlZFBvcztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaW5lKCkge1xuICAgICAgcmV0dXJuIHBlZyRjb21wdXRlUG9zRGV0YWlscyhwZWckcmVwb3J0ZWRQb3MpLmxpbmU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29sdW1uKCkge1xuICAgICAgcmV0dXJuIHBlZyRjb21wdXRlUG9zRGV0YWlscyhwZWckcmVwb3J0ZWRQb3MpLmNvbHVtbjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBleHBlY3RlZChkZXNjcmlwdGlvbikge1xuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKFxuICAgICAgICBudWxsLFxuICAgICAgICBbeyB0eXBlOiBcIm90aGVyXCIsIGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbiB9XSxcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zXG4gICAgICApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yKG1lc3NhZ2UpIHtcbiAgICAgIHRocm93IHBlZyRidWlsZEV4Y2VwdGlvbihtZXNzYWdlLCBudWxsLCBwZWckcmVwb3J0ZWRQb3MpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRjb21wdXRlUG9zRGV0YWlscyhwb3MpIHtcbiAgICAgIGZ1bmN0aW9uIGFkdmFuY2UoZGV0YWlscywgc3RhcnRQb3MsIGVuZFBvcykge1xuICAgICAgICB2YXIgcCwgY2g7XG5cbiAgICAgICAgZm9yIChwID0gc3RhcnRQb3M7IHAgPCBlbmRQb3M7IHArKykge1xuICAgICAgICAgIGNoID0gaW5wdXQuY2hhckF0KHApO1xuICAgICAgICAgIGlmIChjaCA9PT0gXCJcXG5cIikge1xuICAgICAgICAgICAgaWYgKCFkZXRhaWxzLnNlZW5DUikgeyBkZXRhaWxzLmxpbmUrKzsgfVxuICAgICAgICAgICAgZGV0YWlscy5jb2x1bW4gPSAxO1xuICAgICAgICAgICAgZGV0YWlscy5zZWVuQ1IgPSBmYWxzZTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNoID09PSBcIlxcclwiIHx8IGNoID09PSBcIlxcdTIwMjhcIiB8fCBjaCA9PT0gXCJcXHUyMDI5XCIpIHtcbiAgICAgICAgICAgIGRldGFpbHMubGluZSsrO1xuICAgICAgICAgICAgZGV0YWlscy5jb2x1bW4gPSAxO1xuICAgICAgICAgICAgZGV0YWlscy5zZWVuQ1IgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbisrO1xuICAgICAgICAgICAgZGV0YWlscy5zZWVuQ1IgPSBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHBlZyRjYWNoZWRQb3MgIT09IHBvcykge1xuICAgICAgICBpZiAocGVnJGNhY2hlZFBvcyA+IHBvcykge1xuICAgICAgICAgIHBlZyRjYWNoZWRQb3MgPSAwO1xuICAgICAgICAgIHBlZyRjYWNoZWRQb3NEZXRhaWxzID0geyBsaW5lOiAxLCBjb2x1bW46IDEsIHNlZW5DUjogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgICBhZHZhbmNlKHBlZyRjYWNoZWRQb3NEZXRhaWxzLCBwZWckY2FjaGVkUG9zLCBwb3MpO1xuICAgICAgICBwZWckY2FjaGVkUG9zID0gcG9zO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcGVnJGNhY2hlZFBvc0RldGFpbHM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGZhaWwoZXhwZWN0ZWQpIHtcbiAgICAgIGlmIChwZWckY3VyclBvcyA8IHBlZyRtYXhGYWlsUG9zKSB7IHJldHVybjsgfVxuXG4gICAgICBpZiAocGVnJGN1cnJQb3MgPiBwZWckbWF4RmFpbFBvcykge1xuICAgICAgICBwZWckbWF4RmFpbFBvcyA9IHBlZyRjdXJyUG9zO1xuICAgICAgICBwZWckbWF4RmFpbEV4cGVjdGVkID0gW107XG4gICAgICB9XG5cbiAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQucHVzaChleHBlY3RlZCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGJ1aWxkRXhjZXB0aW9uKG1lc3NhZ2UsIGV4cGVjdGVkLCBwb3MpIHtcbiAgICAgIGZ1bmN0aW9uIGNsZWFudXBFeHBlY3RlZChleHBlY3RlZCkge1xuICAgICAgICB2YXIgaSA9IDE7XG5cbiAgICAgICAgZXhwZWN0ZWQuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgaWYgKGEuZGVzY3JpcHRpb24gPCBiLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgICAgfSBlbHNlIGlmIChhLmRlc2NyaXB0aW9uID4gYi5kZXNjcmlwdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgd2hpbGUgKGkgPCBleHBlY3RlZC5sZW5ndGgpIHtcbiAgICAgICAgICBpZiAoZXhwZWN0ZWRbaSAtIDFdID09PSBleHBlY3RlZFtpXSkge1xuICAgICAgICAgICAgZXhwZWN0ZWQuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkTWVzc2FnZShleHBlY3RlZCwgZm91bmQpIHtcbiAgICAgICAgZnVuY3Rpb24gc3RyaW5nRXNjYXBlKHMpIHtcbiAgICAgICAgICBmdW5jdGlvbiBoZXgoY2gpIHsgcmV0dXJuIGNoLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpLnRvVXBwZXJDYXNlKCk7IH1cblxuICAgICAgICAgIHJldHVybiBzXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxcXC9nLCAgICdcXFxcXFxcXCcpXG4gICAgICAgICAgICAucmVwbGFjZSgvXCIvZywgICAgJ1xcXFxcIicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx4MDgvZywgJ1xcXFxiJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHQvZywgICAnXFxcXHQnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcbi9nLCAgICdcXFxcbicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxmL2csICAgJ1xcXFxmJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZywgICAnXFxcXHInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHgwMC1cXHgwN1xceDBCXFx4MEVcXHgwRl0vZywgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxceDAnICsgaGV4KGNoKTsgfSlcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx4MTAtXFx4MUZcXHg4MC1cXHhGRl0vZywgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxceCcgICsgaGV4KGNoKTsgfSlcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx1MDE4MC1cXHUwRkZGXS9nLCAgICAgICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHUwJyArIGhleChjaCk7IH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcdTEwODAtXFx1RkZGRl0vZywgICAgICAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx1JyAgKyBoZXgoY2gpOyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBleHBlY3RlZERlc2NzID0gbmV3IEFycmF5KGV4cGVjdGVkLmxlbmd0aCksXG4gICAgICAgICAgICBleHBlY3RlZERlc2MsIGZvdW5kRGVzYywgaTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZXhwZWN0ZWQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBleHBlY3RlZERlc2NzW2ldID0gZXhwZWN0ZWRbaV0uZGVzY3JpcHRpb247XG4gICAgICAgIH1cblxuICAgICAgICBleHBlY3RlZERlc2MgPSBleHBlY3RlZC5sZW5ndGggPiAxXG4gICAgICAgICAgPyBleHBlY3RlZERlc2NzLnNsaWNlKDAsIC0xKS5qb2luKFwiLCBcIilcbiAgICAgICAgICAgICAgKyBcIiBvciBcIlxuICAgICAgICAgICAgICArIGV4cGVjdGVkRGVzY3NbZXhwZWN0ZWQubGVuZ3RoIC0gMV1cbiAgICAgICAgICA6IGV4cGVjdGVkRGVzY3NbMF07XG5cbiAgICAgICAgZm91bmREZXNjID0gZm91bmQgPyBcIlxcXCJcIiArIHN0cmluZ0VzY2FwZShmb3VuZCkgKyBcIlxcXCJcIiA6IFwiZW5kIG9mIGlucHV0XCI7XG5cbiAgICAgICAgcmV0dXJuIFwiRXhwZWN0ZWQgXCIgKyBleHBlY3RlZERlc2MgKyBcIiBidXQgXCIgKyBmb3VuZERlc2MgKyBcIiBmb3VuZC5cIjtcbiAgICAgIH1cblxuICAgICAgdmFyIHBvc0RldGFpbHMgPSBwZWckY29tcHV0ZVBvc0RldGFpbHMocG9zKSxcbiAgICAgICAgICBmb3VuZCAgICAgID0gcG9zIDwgaW5wdXQubGVuZ3RoID8gaW5wdXQuY2hhckF0KHBvcykgOiBudWxsO1xuXG4gICAgICBpZiAoZXhwZWN0ZWQgIT09IG51bGwpIHtcbiAgICAgICAgY2xlYW51cEV4cGVjdGVkKGV4cGVjdGVkKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5ldyBTeW50YXhFcnJvcihcbiAgICAgICAgbWVzc2FnZSAhPT0gbnVsbCA/IG1lc3NhZ2UgOiBidWlsZE1lc3NhZ2UoZXhwZWN0ZWQsIGZvdW5kKSxcbiAgICAgICAgZXhwZWN0ZWQsXG4gICAgICAgIGZvdW5kLFxuICAgICAgICBwb3MsXG4gICAgICAgIHBvc0RldGFpbHMubGluZSxcbiAgICAgICAgcG9zRGV0YWlscy5jb2x1bW5cbiAgICAgICk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGRlY29kZShzKSB7XG4gICAgICB2YXIgYmMgPSBuZXcgQXJyYXkocy5sZW5ndGgpLCBpO1xuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBiY1tpXSA9IHMuY2hhckNvZGVBdChpKSAtIDMyO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYmM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlUnVsZShpbmRleCkge1xuICAgICAgdmFyIGJjICAgID0gcGVnJGJ5dGVjb2RlW2luZGV4XSxcbiAgICAgICAgICBpcCAgICA9IDAsXG4gICAgICAgICAgaXBzICAgPSBbXSxcbiAgICAgICAgICBlbmQgICA9IGJjLmxlbmd0aCxcbiAgICAgICAgICBlbmRzICA9IFtdLFxuICAgICAgICAgIHN0YWNrID0gW10sXG4gICAgICAgICAgcGFyYW1zLCBpO1xuXG4gICAgICBmdW5jdGlvbiBwcm90ZWN0KG9iamVjdCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5hcHBseShvYmplY3QpID09PSBcIltvYmplY3QgQXJyYXldXCIgPyBbXSA6IG9iamVjdDtcbiAgICAgIH1cblxuICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgd2hpbGUgKGlwIDwgZW5kKSB7XG4gICAgICAgICAgc3dpdGNoIChiY1tpcF0pIHtcbiAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwcm90ZWN0KHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pKTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgIHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAzOlxuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA0OlxuICAgICAgICAgICAgICBzdGFjay5sZW5ndGggLT0gYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNTpcbiAgICAgICAgICAgICAgc3RhY2suc3BsaWNlKC0yLCAxKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNjpcbiAgICAgICAgICAgICAgc3RhY2tbc3RhY2subGVuZ3RoIC0gMl0ucHVzaChzdGFjay5wb3AoKSk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDc6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2goc3RhY2suc3BsaWNlKHN0YWNrLmxlbmd0aCAtIGJjW2lwICsgMV0sIGJjW2lwICsgMV0pKTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgODpcbiAgICAgICAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2goaW5wdXQuc3Vic3RyaW5nKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdLCBwZWckY3VyclBvcykpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA5OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDEwOlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDExOlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDEyOlxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgICBpcHMucHVzaChpcCk7XG5cbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDIgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaXAgKz0gMiArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMzpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoaW5wdXQubGVuZ3RoID4gcGVnJGN1cnJQb3MpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNDpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdKTtcblxuICAgICAgICAgICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCBwZWckY29uc3RzW2JjW2lwICsgMV1dLmxlbmd0aCkgPT09IHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQ7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNTpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdKTtcblxuICAgICAgICAgICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCBwZWckY29uc3RzW2JjW2lwICsgMV1dLmxlbmd0aCkudG9Mb3dlckNhc2UoKSA9PT0gcGVnJGNvbnN0c1tiY1tpcCArIDFdXSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gNDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE2OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM10pO1xuXG4gICAgICAgICAgICAgIGlmIChwZWckY29uc3RzW2JjW2lwICsgMV1dLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQ7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNzpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIGJjW2lwICsgMV0pKTtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgKz0gYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTg6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJGNvbnN0c1tiY1tpcCArIDFdXSk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IHBlZyRjb25zdHNbYmNbaXAgKyAxXV0ubGVuZ3RoO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxOTpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckRkFJTEVEKTtcbiAgICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHBlZyRmYWlsKHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIwOlxuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxIC0gYmNbaXAgKyAxXV07XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIxOlxuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBwZWckY3VyclBvcztcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjI6XG4gICAgICAgICAgICAgIHBhcmFtcyA9IGJjLnNsaWNlKGlwICsgNCwgaXAgKyA0ICsgYmNbaXAgKyAzXSk7XG4gICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBiY1tpcCArIDNdOyBpKyspIHtcbiAgICAgICAgICAgICAgICBwYXJhbXNbaV0gPSBzdGFja1tzdGFjay5sZW5ndGggLSAxIC0gcGFyYW1zW2ldXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHN0YWNrLnNwbGljZShcbiAgICAgICAgICAgICAgICBzdGFjay5sZW5ndGggLSBiY1tpcCArIDJdLFxuICAgICAgICAgICAgICAgIGJjW2lwICsgMl0sXG4gICAgICAgICAgICAgICAgcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5hcHBseShudWxsLCBwYXJhbXMpXG4gICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIzOlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRwYXJzZVJ1bGUoYmNbaXAgKyAxXSkpO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyNDpcbiAgICAgICAgICAgICAgcGVnJHNpbGVudEZhaWxzKys7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDI1OlxuICAgICAgICAgICAgICBwZWckc2lsZW50RmFpbHMtLTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgb3Bjb2RlOiBcIiArIGJjW2lwXSArIFwiLlwiKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZW5kcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgZW5kID0gZW5kcy5wb3AoKTtcbiAgICAgICAgICBpcCA9IGlwcy5wb3AoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gc3RhY2tbMF07XG4gICAgfVxuXG5cbiAgICBcdHZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG4gICAgXHRcdE5PREVfVFlQRSA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpLFxuICAgIFx0XHRNdXN0YWNoZSA9IHJlcXVpcmUoXCIuL1wiKTtcblxuICAgIFx0b3B0aW9ucyA9IF8uZGVmYXVsdHMob3B0aW9ucyB8fCB7fSwge1xuICAgIFx0XHRzdHJpY3Q6IHRydWVcbiAgICBcdH0pO1xuXG5cbiAgICBwZWckcmVzdWx0ID0gcGVnJHBhcnNlUnVsZShwZWckc3RhcnRSdWxlSW5kZXgpO1xuXG4gICAgaWYgKHBlZyRyZXN1bHQgIT09IHBlZyRGQUlMRUQgJiYgcGVnJGN1cnJQb3MgPT09IGlucHV0Lmxlbmd0aCkge1xuICAgICAgcmV0dXJuIHBlZyRyZXN1bHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChwZWckcmVzdWx0ICE9PSBwZWckRkFJTEVEICYmIHBlZyRjdXJyUG9zIDwgaW5wdXQubGVuZ3RoKSB7XG4gICAgICAgIHBlZyRmYWlsKHsgdHlwZTogXCJlbmRcIiwgZGVzY3JpcHRpb246IFwiZW5kIG9mIGlucHV0XCIgfSk7XG4gICAgICB9XG5cbiAgICAgIHRocm93IHBlZyRidWlsZEV4Y2VwdGlvbihudWxsLCBwZWckbWF4RmFpbEV4cGVjdGVkLCBwZWckbWF4RmFpbFBvcyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBTeW50YXhFcnJvcjogU3ludGF4RXJyb3IsXG4gICAgcGFyc2U6ICAgICAgIHBhcnNlXG4gIH07XG59KSgpOyIsInZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpLFxuXHRfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpLFxuXHRwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlLFxuXHQkdHJhY2sgPSByZXF1aXJlKFwiLi90cmFja1wiKS50cmFjaztcblxudmFyIE1vZGVsID1cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTW9kZWwoZGF0YSwgcGFyZW50LCBvcHRpb25zKSB7XG5cdHRoaXMucHJveGllcyA9IFtdO1xuXHR0aGlzLl9kZXAgPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKTtcblx0aWYgKE1vZGVsLmlzTW9kZWwocGFyZW50KSkgdGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG5cdHRoaXMuc2V0KGRhdGEsIG9wdGlvbnMgJiYgb3B0aW9ucy50cmFjayk7XG59XG5cbk1vZGVsLmlzTW9kZWwgPSBmdW5jdGlvbihvKSB7XG5cdHJldHVybiBvIGluc3RhbmNlb2YgTW9kZWw7XG59XG5cbk1vZGVsLmV4dGVuZCA9IHV0aWwuc3ViY2xhc3M7XG5cbk1vZGVsLl9kZWZhdWx0UHJveGllcyA9IFsge1xuXHRpc0xpc3Q6ICB0cnVlLFxuXHRtYXRjaDogICBmdW5jdGlvbihhcnIpICAgIHsgcmV0dXJuIF8uaXNBcnJheShhcnIpOyB9LFxuXHRnZXQ6ICAgICBmdW5jdGlvbihhcnIsIGspIHsgcmV0dXJuIGsgPT09IFwibGVuZ3RoXCIgPyB0aGlzLmxlbmd0aChhcnIpIDogYXJyW2tdOyB9LFxuXHRsZW5ndGg6ICBmdW5jdGlvbihhcnIpICAgIHsgdmFyIGxlbjsgcmV0dXJuIHR5cGVvZihsZW4gPSBhcnIuJGxlbmd0aCkgPT09IFwibnVtYmVyXCIgPyBsZW4gOiBhcnIubGVuZ3RoOyB9LFxuXHRrZXlzOiAgICBmdW5jdGlvbihhcnIpICAgIHsgcmV0dXJuIF8ucmFuZ2UodGhpcy5sZW5ndGgoYXJyKSk7IH0sXG5cdGlzRW1wdHk6IGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gISF0aGlzLmxlbmd0aChhcnIpOyB9XG59LCB7XG5cdG1hdGNoOiBmdW5jdGlvbigpICAgICB7IHJldHVybiB0cnVlOyB9LFxuXHRnZXQ6ICAgZnVuY3Rpb24odCwgaykgeyBpZiAodCAhPSBudWxsKSByZXR1cm4gdFtrXTsgfVxufSBdO1xuXG5Nb2RlbC5jYWxsUHJveHlNZXRob2QgPSBmdW5jdGlvbihwcm94eSwgdGFyZ2V0LCBtZXRob2QsIGFyZ3MsIGN0eCkge1xuXHR2YXIgYXJncyA9IF8uaXNBcnJheShhcmdzKSA/IF8uY2xvbmUoYXJncykgOiBbXTtcblx0YXJncy51bnNoaWZ0KHByb3h5LCBtZXRob2QsIHRhcmdldCk7XG5cdGFyZ3MucHVzaChjdHgpO1xuXHRyZXR1cm4gdXRpbC5yZXN1bHQuYXBwbHkobnVsbCwgYXJncyk7XG59XG5cbl8uZXh0ZW5kKE1vZGVsLnByb3RvdHlwZSwge1xuXG5cdC8vIHNldHMgdGhlIGRhdGEgb24gdGhlIG1vZGVsXG5cdHNldDogZnVuY3Rpb24oZGF0YSwgdHJhY2spIHtcblx0XHRpZiAodHJhY2sgIT09IGZhbHNlKSBkYXRhID0gJHRyYWNrKGRhdGEsIHRyYWNrKTtcblx0XHR0aGlzLmRhdGEgPSBkYXRhO1xuXHRcdHRoaXMuX2RlcC5jaGFuZ2VkKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gYW4gYXJyYXkgb2YgbW9kZWxzIGluIHRoZSBjdXJyZW50IHN0YWNrLCB3aXRoIHRoZSByb290IGFzIHRoZSBmaXJzdFxuXHRnZXRBbGxNb2RlbHM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBtb2RlbHMgPSBbIHRoaXMgXSxcblx0XHRcdG1vZGVsID0gdGhpcztcblxuXHRcdHdoaWxlIChtb2RlbC5wYXJlbnQpIHtcblx0XHRcdG1vZGVscy51bnNoaWZ0KG1vZGVsID0gbW9kZWwucGFyZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWxzXG5cdH0sXG5cblx0Ly8gZ2V0cyB0aGUgbW9kZWwgaW4gdGhlIHN0YWNrIGF0IHRoZSBpbmRleFxuXHQvLyBuZWdhdGl2ZSB2YWx1ZXMgc3RhcnQgYXQgcm9vdFxuXHRnZXRNb2RlbEF0T2Zmc2V0OiBmdW5jdGlvbihpbmRleCkge1xuXHRcdGlmICghXy5pc051bWJlcihpbmRleCkgfHwgaXNOYU4oaW5kZXgpKSBpbmRleCA9IDA7XG5cdFx0aWYgKGluZGV4IDwgMCkgcmV0dXJuIHRoaXMuZ2V0QWxsTW9kZWxzKClbfmluZGV4XTtcblxuXHRcdHZhciBtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAoaW5kZXggJiYgbW9kZWwpIHtcblx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdFx0aW5kZXgtLTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH0sXG5cblx0Ly8gZ2V0cyB0aGUgbGFzdCBtb2RlbCBpbiB0aGUgc3RhY2tcblx0Z2V0Um9vdE1vZGVsOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbW9kZWwgPSB0aGlzO1xuXHRcdHdoaWxlIChtb2RlbC5wYXJlbnQgIT0gbnVsbCkgbW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9LFxuXG5cdC8vIHJldHVybnMgdGhlIGZpcnN0IG1vZGVsIHdoaWNoIHBhc3NlcyB0aGUgZnVuY3Rpb25cblx0ZmluZE1vZGVsOiBmdW5jdGlvbihmbikge1xuXHRcdHZhciBpbmRleCA9IDAsXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGZuLmNhbGwodGhpcywgbW9kZWwsIGluZGV4KyspKSByZXR1cm4gbW9kZWw7XG5cdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gcmV0dXJucyB0aGUgdmFsdWUgYXQgcGF0aCwgYnV0IG9ubHkgbG9va3MgaW4gdGhlIGRhdGEgb24gdGhpcyBtb2RlbFxuXHRnZXRMb2NhbDogZnVuY3Rpb24ocGF0aCwgY3R4KSB7XG5cdFx0aWYgKHR5cGVvZiBwYXRoID09PSBcInN0cmluZ1wiKSBwYXRoID0gcGFyc2UocGF0aCwgeyBzdGFydFJ1bGU6IFwicGF0aFwiIH0pO1xuXHRcdGlmIChwYXRoID09IG51bGwpIHBhdGggPSB7IHBhcnRzOiBbXSB9O1xuXHRcdGlmICghXy5pc09iamVjdChwYXRoKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBvciBvYmplY3QgZm9yIHBhdGguXCIpO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblxuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHR0aGlzLl9kZXAuZGVwZW5kKCk7XG5cblx0XHRyZXR1cm4gXy5yZWR1Y2UocGF0aC5wYXJ0cywgZnVuY3Rpb24odGFyZ2V0LCBwYXJ0KSB7XG5cdFx0XHR0YXJnZXQgPSBzZWxmLl9nZXQodGFyZ2V0LCBwYXJ0LmtleSk7XG5cblx0XHRcdF8uZWFjaChwYXJ0LmNoaWxkcmVuLCBmdW5jdGlvbihrKSB7XG5cdFx0XHRcdGlmIChfLmlzT2JqZWN0KGspKSBrID0gY3R4LmdldChrKTtcblx0XHRcdFx0dGFyZ2V0ID0gc2VsZi5fZ2V0KHRhcmdldCwgayk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHR9LCB0aGlzLmRhdGEpO1xuXHR9LFxuXG5cdC8vIHJldHJpZXZlcyB2YWx1ZSB3aXRoIHBhdGggcXVlcnlcblx0Z2V0OiBmdW5jdGlvbihwYXRocykge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmICh0eXBlb2YgcGF0aHMgPT09IFwic3RyaW5nXCIpIHBhdGhzID0gcGFyc2UocGF0aHMsIHsgc3RhcnRSdWxlOiBcInBhdGhRdWVyeVwiIH0pO1xuXHRcdGlmICghXy5pc0FycmF5KHBhdGhzKSkgcGF0aHMgPSBwYXRocyAhPSBudWxsID8gWyBwYXRocyBdIDogW107XG5cdFx0aWYgKCFwYXRocy5sZW5ndGgpIHBhdGhzLnB1c2goeyB0eXBlOiBcImFsbFwiLCBwYXJ0czogW10gfSk7XG5cblx0XHRyZXR1cm4gXy5yZWR1Y2UocGF0aHMsIGZ1bmN0aW9uKHJlc3VsdCwgcGF0aCwgaW5kZXgpIHtcblx0XHRcdHZhciBtb2RlbCA9IHNlbGYsXG5cdFx0XHRcdHNjb3BlID0gdHJ1ZSxcblx0XHRcdFx0dmFsO1xuXG5cdFx0XHRpZiAocGF0aC50eXBlID09PSBcInJvb3RcIikge1xuXHRcdFx0XHRtb2RlbCA9IHNlbGYuZ2V0Um9vdE1vZGVsKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGgudHlwZSA9PT0gXCJwYXJlbnRcIikge1xuXHRcdFx0XHRtb2RlbCA9IHNlbGYuZ2V0TW9kZWxBdE9mZnNldChwYXRoLmRpc3RhbmNlKTtcblx0XHRcdH0gZWxzZSBpZiAocGF0aC50eXBlID09PSBcImFsbFwiKSB7XG5cdFx0XHRcdHNjb3BlID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlbCA9PSBudWxsKSByZXR1cm47XG5cblx0XHRcdHdoaWxlIChfLmlzVW5kZWZpbmVkKHZhbCkgJiYgbW9kZWwgIT0gbnVsbCkge1xuXHRcdFx0XHR2YWwgPSBtb2RlbC5nZXRMb2NhbChwYXRoLCBzZWxmKTtcblx0XHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0XHRcdGlmIChzY29wZSkgYnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odmFsKSkge1xuXHRcdFx0XHR2YWwgPSB2YWwuY2FsbChzZWxmLCBpbmRleCA9PT0gMCA/IG51bGwgOiByZXN1bHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsO1xuXHRcdH0sIHZvaWQgMCk7XG5cdH0sXG5cblx0X2dldDogZnVuY3Rpb24odGFyZ2V0LCBrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5jYWxsUHJveHlNZXRob2QodGhpcy5nZXRQcm94eUJ5VmFsdWUodGFyZ2V0KSwgdGFyZ2V0LCBcImdldFwiLCBrZXkpO1xuXHR9LFxuXG5cdHByb3h5OiBmdW5jdGlvbihrZXkpIHtcblx0XHR2YXIgcHJveHkgPSB0aGlzLmdldFByb3h5QnlWYWx1ZSh0aGlzLmRhdGEpO1xuXHRcdGlmIChrZXkgPT0gbnVsbCkgcmV0dXJuIHByb3h5O1xuXHRcdHZhciBhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyk7XG5cdFx0YXJncy51bnNoaWZ0KHByb3h5LCB0aGlzLmRhdGEpO1xuXHRcdHJldHVybiB0aGlzLmNhbGxQcm94eU1ldGhvZC5hcHBseSh0aGlzLCBhcmdzKTtcblx0fSxcblxuXHRjYWxsUHJveHlNZXRob2Q6IGZ1bmN0aW9uKHByb3h5LCB0YXJnZXQsIG1ldGhvZCkge1xuXHRcdHJldHVybiBNb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHRhcmdldCwgbWV0aG9kLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDMpLCB0aGlzKTtcblx0fSxcblxuXHRnZXRBbGxQcm94aWVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgcHJveGllcyA9IFtdLFxuXHRcdFx0bW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKG1vZGVsICE9IG51bGwpIHtcblx0XHRcdHByb3hpZXMucHVzaC5hcHBseShwcm94aWVzLCBtb2RlbC5wcm94aWVzKTtcblx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdH1cblxuXHRcdHByb3hpZXMucHVzaC5hcHBseShwcm94aWVzLCBNb2RlbC5fZGVmYXVsdFByb3hpZXMpO1xuXG5cdFx0cmV0dXJuIHByb3hpZXM7XG5cdH0sXG5cblx0aGFzUHJveHk6IGZ1bmN0aW9uKHByb3h5LCBwcm94aWVzKSB7XG5cdFx0aWYgKHByb3hpZXMgPT0gbnVsbCkgcHJveGllcyA9IHRoaXMuZ2V0QWxsUHJveGllcygpO1xuXHRcdHJldHVybiBfLmNvbnRhaW5zKHByb3hpZXMsIHByb3h5KTtcblx0fSxcblxuXHRyZWdpc3RlclByb3h5OiBmdW5jdGlvbihwcm94eSkge1xuXHRcdGlmICh0eXBlb2YgcHJveHkgIT09IFwib2JqZWN0XCIgfHwgcHJveHkgPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG9iamVjdCBmb3IgcHJveHkuXCIpO1xuXHRcdGlmICh0eXBlb2YgcHJveHkubWF0Y2ggIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiTGF5ZXIgbWlzc2luZyByZXF1aXJlZCBtYXRjaCBtZXRob2QuXCIpO1xuXHRcdGlmICh0eXBlb2YgcHJveHkuZ2V0ICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkxheWVyIG1pc3NpbmcgcmVxdWlyZWQgZ2V0IG1ldGhvZC5cIik7XG5cdFx0aWYgKCF0aGlzLmhhc1Byb3h5KHByb3h5KSkgdGhpcy5wcm94aWVzLnVuc2hpZnQocHJveHkpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGdldFByb3h5QnlWYWx1ZTogZnVuY3Rpb24odGFyZ2V0LCBwcm94aWVzKSB7XG5cdFx0aWYgKHByb3hpZXMgPT0gbnVsbCkgcHJveGllcyA9IHRoaXMuZ2V0QWxsUHJveGllcygpO1xuXHRcdHJldHVybiBfLmZpbmQocHJveGllcywgZnVuY3Rpb24ocHJveHkpIHtcblx0XHRcdHJldHVybiBwcm94eS5tYXRjaCh0YXJnZXQpO1xuXHRcdH0pO1xuXHR9LFxuXG5cdC8vIGRlZmluZXMgYSByZWFjdGl2ZSBwcm9wZXJ0eSBvbiBhbiBvYmplY3QgdGhhdCBwb2ludHMgdG8gdGhlIGRhdGFcblx0ZGVmaW5lRGF0YUxpbms6IGZ1bmN0aW9uKG9iaiwgcHJvcCwgb3B0aW9ucykge1xuXHRcdHZhciBtb2RlbCA9IHRoaXM7XG5cblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IG9wdGlvbnMgIT0gbnVsbCAmJiBvcHRpb25zLmNvbmZpZ3VyYWJsZSxcblx0XHRcdGVudW1lcmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmVudW1lcmFibGUgIT09IGZhbHNlLFxuXHRcdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdFx0bW9kZWwuX2RlcC5kZXBlbmQoKTtcblx0XHRcdFx0cmV0dXJuIG1vZGVsLmRhdGE7XG5cdFx0XHR9LFxuXHRcdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdFx0bW9kZWwuc2V0KHZhbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gb2JqO1xuXHR9XG5cbn0pO1xuIiwidmFyIFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIiksXG5cdF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0Tk9ERV9UWVBFID0gcmVxdWlyZShcIi4vdHlwZXNcIiksXG5cdHBhcnNlID0gcmVxdWlyZShcIi4vbSt4bWxcIikucGFyc2UsXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpLFxuXHRWaWV3ID0gcmVxdWlyZShcIi4vdmlld1wiKSxcblx0TW9kZWwgPSByZXF1aXJlKFwiLi9tb2RlbFwiKSxcblx0U2VjdGlvbiA9IHJlcXVpcmUoXCIuL3NlY3Rpb25cIiksXG5cdCR0cmFjayA9IHJlcXVpcmUoXCIuL3RyYWNrXCIpLnRyYWNrLFxuXHRET01SYW5nZSA9IHJlcXVpcmUoXCIuL2RvbXJhbmdlXCIpO1xuXG52YXIgTXVzdGFjaGUgPVxubW9kdWxlLmV4cG9ydHMgPSBWaWV3LmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihkYXRhLCBvcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHQvLyBhZGQgdGVtcGxhdGVcblx0XHR2YXIgdGVtcGxhdGUgPSBvcHRpb25zLnRlbXBsYXRlIHx8IF8ucmVzdWx0KHRoaXMsIFwidGVtcGxhdGVcIik7XG5cdFx0aWYgKHRlbXBsYXRlICE9IG51bGwpIHRoaXMuc2V0VGVtcGxhdGUodGVtcGxhdGUpO1xuXG5cdFx0Ly8gYWRkIGRlY29yYXRvcnNcblx0XHR0aGlzLmRlY29yYXRlKF8uZXh0ZW5kKHt9LCBvcHRpb25zLmRlY29yYXRvcnMsIF8ucmVzdWx0KHRoaXMsIFwiZGVjb3JhdG9yc1wiKSkpO1xuXG5cdFx0Ly8gaW5pdGlhdGUgbGlrZSBhIG5vcm1hbCB2aWV3XG5cdFx0Vmlldy5jYWxsKHRoaXMsIGRhdGEsIG9wdGlvbnMpO1xuXHR9LFxuXG5cdC8vIHBhcnNlcyBhbmQgc2V0cyB0aGUgcm9vdCB0ZW1wbGF0ZVxuXHRzZXRUZW1wbGF0ZTogZnVuY3Rpb24odGVtcGxhdGUpIHtcblx0XHRpZiAoXy5pc1N0cmluZyh0ZW1wbGF0ZSkpIHRlbXBsYXRlID0gcGFyc2UodGVtcGxhdGUpO1xuXG5cdFx0aWYgKCFfLmlzT2JqZWN0KHRlbXBsYXRlKSB8fCB0ZW1wbGF0ZS50eXBlICE9PSBOT0RFX1RZUEUuUk9PVClcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgb3IgcGFyc2VkIHRlbXBsYXRlLlwiKTtcblxuXHRcdHRoaXMuX3RlbXBsYXRlID0gdGVtcGxhdGU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gY3JlYXRlcyBhIGRlY29yYXRvclxuXHRkZWNvcmF0ZTogZnVuY3Rpb24obmFtZSwgZm4sIG9wdGlvbnMpIHtcblx0XHRpZiAodHlwZW9mIG5hbWUgPT09IFwib2JqZWN0XCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKGZuLCBuKSB7XG5cdFx0XHRcdGlmIChfLmlzQXJyYXkoZm4pKSB0aGlzLmRlY29yYXRlKG4sIGZuWzBdLCBmblsxXSk7XG5cdFx0XHRcdGVsc2UgdGhpcy5kZWNvcmF0ZShuLCBmbiwgb3B0aW9ucyk7XG5cdFx0XHR9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIiB8fCBuYW1lID09PSBcIlwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgbm9uLWVtcHR5IHN0cmluZyBmb3IgZGVjb3JhdG9yIG5hbWUuXCIpO1xuXHRcdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciBkZWNvcmF0b3IuXCIpO1xuXG5cdFx0aWYgKHRoaXMuX2RlY29yYXRvcnMgPT0gbnVsbCkgdGhpcy5fZGVjb3JhdG9ycyA9IHt9O1xuXHRcdGlmICh0aGlzLl9kZWNvcmF0b3JzW25hbWVdID09IG51bGwpIHRoaXMuX2RlY29yYXRvcnNbbmFtZV0gPSBbXTtcblx0XHR2YXIgZGVjb3JhdG9ycyA9IHRoaXMuX2RlY29yYXRvcnNbbmFtZV07XG5cblx0XHRpZiAoIV8uZmluZFdoZXJlKGRlY29yYXRvcnMsIHsgY2FsbGJhY2s6IGZuIH0pKSB7XG5cdFx0XHRkZWNvcmF0b3JzLnB1c2goe1xuXHRcdFx0XHRjYWxsYmFjazogZm4sXG5cdFx0XHRcdG9wdGlvbnM6IG9wdGlvbnMgfHwge31cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGZpbmRzIGFsbCBkZWNvcmF0b3JzLCBsb2NhbGx5IGFuZCBpbiBwYXJlbnRcblx0ZmluZERlY29yYXRvcnM6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgZGVjb3JhdG9ycyA9IFtdLFxuXHRcdFx0YyA9IHRoaXM7XG5cblxuXHRcdHdoaWxlIChjICE9IG51bGwpIHtcblx0XHRcdGlmIChjLl9kZWNvcmF0b3JzICE9IG51bGwgJiYgXy5pc0FycmF5KGMuX2RlY29yYXRvcnNbbmFtZV0pKSB7XG5cdFx0XHRcdGMuX2RlY29yYXRvcnNbbmFtZV0uZm9yRWFjaChmdW5jdGlvbihkKSB7XG5cdFx0XHRcdFx0aWYgKCFfLmZpbmRXaGVyZShkZWNvcmF0b3JzLCB7IGNhbGxiYWNrOiBkLmNhbGxiYWNrIH0pKSB7XG5cdFx0XHRcdFx0XHRkZWNvcmF0b3JzLnB1c2goXy5leHRlbmQoeyBjb250ZXh0OiBjIH0sIGQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjID0gYy5wYXJlbnRSYW5nZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVjb3JhdG9ycztcblx0fSxcblxuXHQvLyByZW1vdmVzIGEgZGVjb3JhdG9yXG5cdHN0b3BEZWNvcmF0aW5nOiBmdW5jdGlvbihuYW1lLCBmbikge1xuXHRcdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJmdW5jdGlvblwiICYmIGZuID09IG51bGwpIHtcblx0XHRcdGZuID0gbmFtZTtcblx0XHRcdG5hbWUgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9kZWNvcmF0b3JzID09IG51bGwgfHwgKG5hbWUgPT0gbnVsbCAmJiBmbiA9PSBudWxsKSkge1xuXHRcdFx0dGhpcy5fZGVjb3JhdG9ycyA9IHt9O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGZuID09IG51bGwpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKG5hbWUgPT0gbnVsbCkge1xuXHRcdFx0Xy5lYWNoKHRoaXMuX2RlY29yYXRvcnMsIGZ1bmN0aW9uKGQsIG4pIHtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdG9yc1tuXSA9IF8uZmlsdGVyKGQsIGZ1bmN0aW9uKF9kKSB7XG5cdFx0XHRcdFx0cmV0dXJuIF9kLmNhbGxiYWNrICE9PSBmbjtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdHZhciBkID0gdGhpcy5fZGVjb3JhdG9yc1tuYW1lXTtcblx0XHRcdHRoaXMuX2RlY29yYXRvcnNbbmFtZV0gPSBfLmZpbHRlcihkLCBmdW5jdGlvbihfZCkge1xuXHRcdFx0XHRyZXR1cm4gX2QuY2FsbGJhY2sgIT09IGZuO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gc3BlY2lhbCBwYXJ0aWFsIHNldHRlciB0aGF0IGNvbnZlcnRzIHN0cmluZ3MgaW50byBtdXN0YWNoZSBWaWV3c1xuXHRzZXRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lLCBwYXJ0aWFsKSB7XG5cdFx0aWYgKF8uaXNPYmplY3QobmFtZSkpIHJldHVybiBWaWV3LnByb3RvdHlwZS5zZXRQYXJ0aWFsLmNhbGwodGhpcywgbmFtZSk7XG5cdFx0XG5cdFx0aWYgKF8uaXNTdHJpbmcocGFydGlhbCkpIHBhcnRpYWwgPSBwYXJzZShwYXJ0aWFsKTtcblx0XHRpZiAoXy5pc09iamVjdChwYXJ0aWFsKSAmJiBwYXJ0aWFsLnR5cGUgPT09IE5PREVfVFlQRS5ST09UKSBwYXJ0aWFsID0gTXVzdGFjaGUuZXh0ZW5kKHsgdGVtcGxhdGU6IHBhcnRpYWwgfSk7XG5cdFx0aWYgKHBhcnRpYWwgIT0gbnVsbCAmJiAhdXRpbC5pc1N1YkNsYXNzKFZpZXcsIHBhcnRpYWwpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyB0ZW1wbGF0ZSwgcGFyc2VkIHRlbXBsYXRlLCBWaWV3IHN1YmNsYXNzIG9yIGZ1bmN0aW9uIGZvciBwYXJ0aWFsLlwiKTtcblx0XHRcblx0XHRyZXR1cm4gVmlldy5wcm90b3R5cGUuc2V0UGFydGlhbC5jYWxsKHRoaXMsIG5hbWUsIHBhcnRpYWwpO1xuXHR9LFxuXG5cdC8vIHRoZSBtYWluIHJlbmRlciBmdW5jdGlvbiBjYWxsZWQgYnkgbW91bnRcblx0cmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5fdGVtcGxhdGUgPT0gbnVsbClcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGEgdGVtcGxhdGUgdG8gYmUgc2V0IGJlZm9yZSByZW5kZXJpbmcuXCIpO1xuXG5cdFx0dmFyIHRvTW91bnQ7XG5cdFx0dGhpcy5zZXRNZW1iZXJzKHRoaXMucmVuZGVyVGVtcGxhdGUodGhpcy5fdGVtcGxhdGUsIG51bGwsIHRvTW91bnQgPSBbXSkpO1xuXHRcdF8uaW52b2tlKHRvTW91bnQsIFwibW91bnRcIik7XG5cdH0sXG5cblx0Ly8gY29udmVydHMgYSB0ZW1wbGF0ZSBpbnRvIGFuIGFycmF5IG9mIGVsZW1lbnRzIGFuZCBET01SYW5nZXNcblx0cmVuZGVyVGVtcGxhdGU6IGZ1bmN0aW9uKHRlbXBsYXRlLCB2aWV3LCB0b01vdW50KSB7XG5cdFx0aWYgKHZpZXcgPT0gbnVsbCkgdmlldyA9IHRoaXM7XG5cdFx0aWYgKHRvTW91bnQgPT0gbnVsbCkgdG9Nb3VudCA9IFtdO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmIChfLmlzQXJyYXkodGVtcGxhdGUpKSByZXR1cm4gdGVtcGxhdGUucmVkdWNlKGZ1bmN0aW9uKHIsIHQpIHtcblx0XHRcdHZhciBiID0gc2VsZi5yZW5kZXJUZW1wbGF0ZSh0LCB2aWV3LCB0b01vdW50KTtcblx0XHRcdGlmIChfLmlzQXJyYXkoYikpIHIucHVzaC5hcHBseShyLCBiKTtcblx0XHRcdGVsc2UgaWYgKGIgIT0gbnVsbCkgci5wdXNoKGIpO1xuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fSwgW10pO1xuXG5cdFx0c3dpdGNoKHRlbXBsYXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgTk9ERV9UWVBFLlJPT1Q6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB2aWV3LCB0b01vdW50KTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuRUxFTUVOVDpcblx0XHRcdFx0dmFyIHBhcnQgPSB0aGlzLnJlbmRlclBhcnRpYWwodGVtcGxhdGUubmFtZSwgdmlldyk7XG5cdFx0XHRcdHZhciBvYmo7XG5cblx0XHRcdFx0aWYgKHBhcnQgIT0gbnVsbCkge1xuXHRcdFx0XHRcdHBhcnQuYWRkRGF0YShvYmogPSAkdHJhY2soe30pKTtcblxuXHRcdFx0XHRcdHRlbXBsYXRlLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG5cdFx0XHRcdFx0XHRzZWxmLmF1dG9ydW4oZnVuY3Rpb24oYykge1xuXHRcdFx0XHRcdFx0XHR2YXIgdmFsID0gdGhpcy5yZW5kZXJBcmd1bWVudHMoYXR0ci5hcmd1bWVudHMsIHZpZXcpO1xuXHRcdFx0XHRcdFx0XHRpZiAodmFsLmxlbmd0aCA9PT0gMSkgdmFsID0gdmFsWzBdO1xuXHRcdFx0XHRcdFx0XHRlbHNlIGlmICghdmFsLmxlbmd0aCkgdmFsID0gdm9pZCAwO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChjLmZpcnN0UnVuKSBvYmouZGVmaW5lUHJvcGVydHkoYXR0ci5uYW1lLCB2YWwpO1xuXHRcdFx0XHRcdFx0XHRlbHNlIG9ialthdHRyLm5hbWVdID0gdmFsO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR0b01vdW50LnB1c2gocGFydCk7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRlbXBsYXRlLm5hbWUpO1xuXHRcdFx0XHRcdFxuXHRcdFx0XHRcdHRlbXBsYXRlLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5yZW5kZXJEZWNvcmF0aW9ucyhlbCwgYXR0ciwgdmlldykpIHJldHVybjtcblx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoYXR0ci5uYW1lLCB0aGlzLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcoYXR0ci5jaGlsZHJlbiwgdmlldykpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0XHR2YXIgY2hpbGRyZW4gPSB0aGlzLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB2aWV3LCB0b01vdW50KSxcblx0XHRcdFx0XHRcdGNoaWxkLCBpO1xuXG5cdFx0XHRcdFx0Zm9yIChpIGluIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRjaGlsZCA9IGNoaWxkcmVuW2ldO1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0Y2hpbGQucGFyZW50UmFuZ2UgPSB2aWV3OyAvLyBmYWtlIHRoZSBwYXJlbnRcblx0XHRcdFx0XHRcdFx0Y2hpbGQuYXR0YWNoKGVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGVsLmFwcGVuZENoaWxkKGNoaWxkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0cmV0dXJuIGVsO1xuXHRcdFx0XHR9XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRFWFQ6XG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh1dGlsLmRlY29kZUVudGl0aWVzKHRlbXBsYXRlLnZhbHVlKSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLkhUTUw6XG5cdFx0XHRcdHJldHVybiBuZXcgRE9NUmFuZ2UodXRpbC5wYXJzZUhUTUwodGVtcGxhdGUudmFsdWUpKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuWENPTU1FTlQ6XG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVDb21tZW50KHRlbXBsYXRlLnZhbHVlKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5URVJQT0xBVE9SOlxuXHRcdFx0XHR2YXIgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiXCIpO1xuXHRcdFx0XHRcblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHZhciB2YWwgPSB2aWV3LmdldCh0ZW1wbGF0ZS52YWx1ZSk7XG5cdFx0XHRcdFx0bm9kZS5ub2RlVmFsdWUgPSB0eXBlb2YgdmFsID09PSBcInN0cmluZ1wiID8gdmFsIDogdmFsICE9IG51bGwgPyB2YWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBub2RlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5UUklQTEU6XG5cdFx0XHRcdHZhciByYW5nZSA9IG5ldyBET01SYW5nZSgpO1xuXHRcdFx0XHRcblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHJhbmdlLnNldE1lbWJlcnModXRpbC5wYXJzZUhUTUwodmlldy5nZXQodGVtcGxhdGUudmFsdWUpKSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiByYW5nZTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5WRVJURUQ6XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5TRUNUSU9OOlxuXHRcdFx0XHR2YXIgc2VjdGlvbiA9IG5ldyBTZWN0aW9uKHZpZXcubW9kZWwpXG5cdFx0XHRcdFx0LmludmVydCh0ZW1wbGF0ZS50eXBlID09PSBOT0RFX1RZUEUuSU5WRVJURUQpXG5cdFx0XHRcdFx0LnNldFBhdGgodGVtcGxhdGUudmFsdWUpXG5cdFx0XHRcdFx0Lm9uUm93KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0dmFyIF90b01vdW50O1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRNZW1iZXJzKHNlbGYucmVuZGVyVGVtcGxhdGUodGVtcGxhdGUuY2hpbGRyZW4sIHRoaXMsIF90b01vdW50ID0gW10pKTtcblx0XHRcdFx0XHRcdF8uaW52b2tlKF90b01vdW50LCBcIm1vdW50XCIpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRvTW91bnQucHVzaChzZWN0aW9uKTtcblx0XHRcdFx0cmV0dXJuIHNlY3Rpb247XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlBBUlRJQUw6XG5cdFx0XHRcdHZhciBwYXJ0aWFsID0gdGhpcy5yZW5kZXJQYXJ0aWFsKHRlbXBsYXRlLnZhbHVlLCB2aWV3KTtcblx0XHRcdFx0aWYgKHBhcnRpYWwpIHRvTW91bnQucHVzaChwYXJ0aWFsKTtcblx0XHRcdFx0cmV0dXJuIHBhcnRpYWw7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIGNvbnZlcnRzIGEgdGVtcGxhdGUgaW50byBhIHN0cmluZ1xuXHRyZW5kZXJUZW1wbGF0ZUFzU3RyaW5nOiBmdW5jdGlvbih0ZW1wbGF0ZSwgY3R4KSB7XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKF8uaXNBcnJheSh0ZW1wbGF0ZSkpIHJldHVybiB0ZW1wbGF0ZS5tYXAoZnVuY3Rpb24odCkge1xuXHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0LCBjdHgpO1xuXHRcdH0pLmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9IG51bGw7IH0pLmpvaW4oXCJcIik7XG5cblx0XHRzd2l0Y2godGVtcGxhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuUk9PVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0ZW1wbGF0ZS5jaGlsZHJlbiwgY3R4KTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVEVYVDpcblx0XHRcdFx0cmV0dXJuIHRlbXBsYXRlLnZhbHVlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlRFUlBPTEFUT1I6XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5UUklQTEU6XG5cdFx0XHRcdHZhciB2YWwgPSBjdHguZ2V0KHRlbXBsYXRlLnZhbHVlKTtcblx0XHRcdFx0cmV0dXJuIHZhbCAhPSBudWxsID8gdmFsLnRvU3RyaW5nKCkgOiBcIlwiO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5TRUNUSU9OOlxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5WRVJURUQ6XG5cdFx0XHRcdHZhciBpbnZlcnRlZCwgbW9kZWwsIHZhbCwgaXNFbXB0eSwgbWFrZVJvdywgcHJveHksIGlzTGlzdDtcblxuXHRcdFx0XHRpbnZlcnRlZCA9IHRlbXBsYXRlLnR5cGUgPT09IE5PREVfVFlQRS5JTlZFUlRFRDtcblx0XHRcdFx0dmFsID0gY3R4LmdldCh0ZW1wbGF0ZS52YWx1ZSk7XG5cdFx0XHRcdG1vZGVsID0gbmV3IE1vZGVsKHZhbCwgY3R4KTtcblx0XHRcdFx0cHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUodmFsKTtcblx0XHRcdFx0aXNMaXN0ID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiaXNMaXN0XCIpO1xuXHRcdFx0XHRpc0VtcHR5ID0gU2VjdGlvbi5pc0VtcHR5KG1vZGVsLCBwcm94eSk7XG5cdFx0XHRcdFxuXHRcdFx0XHRtYWtlUm93ID0gZnVuY3Rpb24oaSkge1xuXHRcdFx0XHRcdHZhciByb3csIGRhdGE7XG5cblx0XHRcdFx0XHRpZiAoaSA9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRkYXRhID0gbW9kZWw7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGRhdGEgPSBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJnZXRcIiwgaSk7XG5cdFx0XHRcdFx0XHRkYXRhID0gbmV3IE1vZGVsKGRhdGEsIG5ldyBNb2RlbCh7ICRrZXk6IGkgfSwgY3R4KSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0ZW1wbGF0ZS5jaGlsZHJlbiwgZGF0YSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIShpc0VtcHR5IF4gaW52ZXJ0ZWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGlzTGlzdCAmJiAhaW52ZXJ0ZWQgP1xuXHRcdFx0XHRcdFx0bW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwia2V5c1wiKS5tYXAobWFrZVJvdykuam9pbihcIlwiKSA6XG5cdFx0XHRcdFx0XHRtYWtlUm93KCk7XG5cdFx0XHRcdH1cblx0XHR9XG5cdH0sXG5cblx0Ly8gY29udmVydHMgYW4gYXJndW1lbnQgdGVtcGxhdGUgaW50byBhbiBhcnJheSBvZiB2YWx1ZXNcblx0cmVuZGVyQXJndW1lbnRzOiBmdW5jdGlvbihhcmcsIGN0eCkge1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgVmlldykgY3R4ID0gY3R4Lm1vZGVsO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmIChfLmlzQXJyYXkoYXJnKSkgcmV0dXJuIGFyZy5tYXAoZnVuY3Rpb24oYSkge1xuXHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyQXJndW1lbnRzKGEsIGN0eCk7XG5cdFx0fSkuZmlsdGVyKGZ1bmN0aW9uKGIpIHsgcmV0dXJuIGIgIT0gbnVsbDsgfSk7XG5cblx0XHRzd2l0Y2goYXJnLnR5cGUpIHtcblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVEVSUE9MQVRPUjpcblx0XHRcdFx0cmV0dXJuIGN0eC5nZXQoYXJnLnZhbHVlKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuTElURVJBTDpcblx0XHRcdFx0cmV0dXJuIGFyZy52YWx1ZTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gcmVuZGVycyBkZWNvcmF0aW9ucyBvbiBhbiBlbGVtZW50IGJ5IHRlbXBsYXRlXG5cdHJlbmRlckRlY29yYXRpb25zOiBmdW5jdGlvbihlbCwgYXR0ciwgY3R4KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0Ly8gbG9vayB1cCBkZWNvcmF0b3IgYnkgbmFtZVxuXHRcdHZhciBkZWNvcmF0b3JzID0gdGhpcy5maW5kRGVjb3JhdG9ycyhhdHRyLm5hbWUpO1xuXHRcdGlmICghZGVjb3JhdG9ycy5sZW5ndGgpIHJldHVybjtcblxuXHRcdC8vIG5vcm1hbGl6ZSB0aGUgY29udGV4dFxuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgVmlldykgY3R4ID0gY3R4Lm1vZGVsO1xuXG5cdFx0Ly8gYSB3cmFwcGVyIGNvbXB1dGF0aW9uIHRvIGV6LWNsZWFuIHRoZSByZXN0XG5cdFx0cmV0dXJuIHRoaXMuYXV0b3J1bihmdW5jdGlvbihfY29tcCkge1xuXHRcdFx0ZGVjb3JhdG9ycy5mb3JFYWNoKGZ1bmN0aW9uKGQpIHtcblx0XHRcdFx0aWYgKGQub3B0aW9ucyAmJiBkLm9wdGlvbnMuZGVmZXIpIF8uZGVmZXIoZXhlY0RlY29yYXRvcik7XG5cdFx0XHRcdGVsc2UgZXhlY0RlY29yYXRvcigpO1xuXG5cdFx0XHRcdGZ1bmN0aW9uIGV4ZWNEZWNvcmF0b3IoKSB7XG5cdFx0XHRcdFx0dmFyIGRjb21wID0gc2VsZi5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdFx0XHRcdC8vIGFzc2VtYmxlIHRoZSBhcmd1bWVudHMhXG5cdFx0XHRcdFx0XHR2YXIgYXJncyA9IFsge1xuXHRcdFx0XHRcdFx0XHR0YXJnZXQ6IGVsLFxuXHRcdFx0XHRcdFx0XHRtb2RlbDogY3R4LFxuXHRcdFx0XHRcdFx0XHR2aWV3OiBzZWxmLFxuXHRcdFx0XHRcdFx0XHR0ZW1wbGF0ZTogYXR0cixcblx0XHRcdFx0XHRcdFx0Y29tcDogY29tcCxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogZC5vcHRpb25zXG5cdFx0XHRcdFx0XHR9IF07XG5cblx0XHRcdFx0XHRcdC8vIHJlbmRlciBhcmd1bWVudHMgYmFzZWQgb24gb3B0aW9uc1xuXHRcdFx0XHRcdFx0aWYgKGQub3B0aW9ucyAmJiBkLm9wdGlvbnMucGFyc2UgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdFx0XHRcdFx0YXJncy5wdXNoKHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyhhdHRyLmNoaWxkcmVuLCBjdHgpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZC5vcHRpb25zID09IG51bGwgfHwgZC5vcHRpb25zLnBhcnNlICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0XHRhcmdzID0gYXJncy5jb25jYXQoc2VsZi5yZW5kZXJBcmd1bWVudHMoYXR0ci5hcmd1bWVudHMsIGN0eCkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBleGVjdXRlIHRoZSBjYWxsYmFja1xuXHRcdFx0XHRcdFx0ZC5jYWxsYmFjay5hcHBseShkLmNvbnRleHQgfHwgc2VsZiwgYXJncyk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHQvLyBjbGVhbiB1cFxuXHRcdFx0XHRcdF9jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdGRjb21wLnN0b3AoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxufSwge1xuXG5cdHJlbmRlcjogZnVuY3Rpb24odGVtcGxhdGUsIGRhdGEsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gXy5leHRlbmQoe30sIG9wdGlvbnMgfHwge30sIHtcblx0XHRcdHRlbXBsYXRlOiB0ZW1wbGF0ZVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG5ldyBNdXN0YWNoZShkYXRhIHx8IG51bGwsIG9wdGlvbnMpO1xuXHR9XG5cbn0pO1xuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0TXVzdGFjaGUgPSByZXF1aXJlKFwiLi4vXCIpO1xuXG4vLyB0aGUgcGx1Z2luXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLmFkZEFjdGlvbiA9IGFkZEFjdGlvbjtcblx0dGhpcy5hZGRBY3Rpb25PbmNlID0gYWRkQWN0aW9uT25jZTtcblx0dGhpcy5yZW1vdmVBY3Rpb24gPSByZW1vdmVBY3Rpb247XG5cdHRoaXMuZmlyZUFjdGlvbiA9IGZpcmVBY3Rpb247XG5cdHRoaXMuZGVjb3JhdGUoZGVjb3JhdG9ycyk7XG5cblx0dmFyIGluaXRBY3Rpb25zID0gXy5yZXN1bHQodGhpcywgXCJhY3Rpb25zXCIpO1xuXHRpZiAoaW5pdEFjdGlvbnMgIT0gbnVsbCkgdGhpcy5hZGRBY3Rpb24oaW5pdEFjdGlvbnMpO1xufVxuXG4vLyBnZW5lcmF0ZSBkZWNvcmF0b3JzXG52YXIgZXZlbnROYW1lcyA9IFtcblx0J2xvYWQnLCAnc2Nyb2xsJyxcblx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdCdrZXlkb3duJywgJ2tleXByZXNzJywgJ2tleXVwJyxcblx0J2JsdXInLCAnZm9jdXMnLCAnY2hhbmdlJywgJ2lucHV0JywgJ3N1Ym1pdCcsICdyZXNldCcsIFxuXHQnZHJhZycsICdkcmFnZHJvcCcsICdkcmFnZW5kJywgJ2RyYWdlbnRlcicsICdkcmFnZXhpdCcsICdkcmFnbGVhdmUnLCAnZHJhZ292ZXInLCAnZHJhZ3N0YXJ0JywgJ2Ryb3AnXG5dO1xuXG52YXIgc2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2U7XG52YXIgZGVjb3JhdG9ycyA9IHt9O1xuXG5ldmVudE5hbWVzLmZvckVhY2goZnVuY3Rpb24oZXZlbnQpIHtcblx0ZGVjb3JhdG9yc1tcIm9uLVwiICsgZXZlbnRdID0gZnVuY3Rpb24oZGVjb3IsIGtleSkge1xuXHRcdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdGFyZ3MsIG5vZGU7XG5cblx0XHRmdW5jdGlvbiBsaXN0ZW5lcihlKSB7XG5cdFx0XHQvLyBjcmVhdGUgYSBuZXcgYWN0aW9uIG9iamVjdFxuXHRcdFx0dmFyIGFjdGlvbiA9IG5ldyBBY3Rpb24oa2V5KTtcblx0XHRcdGFjdGlvbi5vcmlnaW5hbCA9IGU7XG5cdFx0XHRhY3Rpb24udGFyZ2V0ID0gYWN0aW9uLm5vZGUgPSBub2RlO1xuXHRcdFx0YWN0aW9uLmNvbnRleHQgPSBhY3Rpb24ubW9kZWwgPSBkZWNvci5tb2RlbDtcblx0XHRcdGFjdGlvbi52aWV3ID0gZGVjb3IudmlldztcblxuXHRcdFx0Ly8gZmluZCB0aGUgZmlyc3QgcGFyZW50IHdpdGggdGhlIGZpcmUgbWV0aG9kXG5cdFx0XHR2YXIgZmlyZU9uID0gc2VsZjtcblx0XHRcdHdoaWxlICh0eXBlb2YgZmlyZU9uLmZpcmVBY3Rpb24gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHQvLyBpZiBpdCBoYXMgbm8gcGFyZW50LCB3ZSBjYW4ndCBkbyBhbnl0aGluZ1xuXHRcdFx0XHRpZiAoZmlyZU9uLnBhcmVudFJhbmdlID09IG51bGwpIHJldHVybjtcblx0XHRcdFx0ZmlyZU9uID0gZmlyZU9uLnBhcmVudFJhbmdlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBmaXJlIHRoZSBhY3Rpb25cblx0XHRcdGZpcmVPbi5maXJlQWN0aW9uLmFwcGx5KGZpcmVPbiwgWyBhY3Rpb24gXS5jb25jYXQoYXJncykpO1xuXHRcdH1cblxuXHRcdG5vZGUgPSBkZWNvci50YXJnZXQ7XG5cdFx0YXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDIpO1xuXHRcdG5vZGUuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXIpO1xuXG5cdFx0ZGVjb3IuY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGxpc3RlbmVyKTtcblx0XHR9KTtcblx0fVxufSk7XG5cbi8vIEFjdGlvbiBDbGFzc1xuZnVuY3Rpb24gQWN0aW9uKG5hbWUpIHtcblx0dGhpcy5uYW1lID0gbmFtZTtcbn1cblxuTXVzdGFjaGUuQWN0aW9uID0gQWN0aW9uO1xuXG5BY3Rpb24ucHJvdG90eXBlLmJ1YmJsZXMgPSB0cnVlO1xuXG5BY3Rpb24ucHJvdG90eXBlLnN0b3BQcm9wYWdhdGlvbiA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLmJ1YmJsZXMgPSBmYWxzZTtcblx0cmV0dXJuIHRoaXM7XG59XG5cbi8vIE1zdXRhY2hlIEluc3RhbmNlIE1ldGhvZHNcbmZ1bmN0aW9uIGFkZEFjdGlvbihuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgPT09IFwib2JqZWN0XCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihmbiwgbikgeyB0aGlzLmFkZEFjdGlvbihuLCBmbik7IH0sIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBuYW1lICE9PSBcInN0cmluZ1wiIHx8IG5hbWUgPT09IFwiXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBub24tZW1wdHkgc3RyaW5nIGZvciBhY3Rpb24gbmFtZS5cIik7XG5cdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciBhY3Rpb24uXCIpO1xuXG5cdGlmICh0aGlzLl9hY3Rpb25zID09IG51bGwpIHRoaXMuX2FjdGlvbnMgPSB7fTtcblx0aWYgKHRoaXMuX2FjdGlvbnNbbmFtZV0gPT0gbnVsbCkgdGhpcy5fYWN0aW9uc1tuYW1lXSA9IFtdO1xuXHRpZiAoIX50aGlzLl9hY3Rpb25zW25hbWVdLmluZGV4T2YoZm4pKSB0aGlzLl9hY3Rpb25zW25hbWVdLnB1c2goZm4pO1xuXHRcblx0cmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGFkZEFjdGlvbk9uY2UobmFtZSwgZm4pIHtcblx0aWYgKHR5cGVvZiBuYW1lID09PSBcIm9iamVjdFwiICYmIGZuID09IG51bGwpIHtcblx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24oZm4sIG4pIHsgdGhpcy5hZGRBY3Rpb25PbmNlKG4sIGZuKTsgfSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHR2YXIgb25BY3Rpb247XG5cblx0dGhpcy5hZGRBY3Rpb24obmFtZSwgb25BY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5yZW1vdmVBY3Rpb24obmFtZSwgb25BY3Rpb24pO1xuXHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH0pO1xuXG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiByZW1vdmVBY3Rpb24obmFtZSwgZm4pIHtcblx0aWYgKHR5cGVvZiBuYW1lID09PSBcImZ1bmN0aW9uXCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdGZuID0gbmFtZTtcblx0XHRuYW1lID0gbnVsbDtcblx0fVxuXG5cdGlmICh0aGlzLl9hY3Rpb25zID09IG51bGwgfHwgKG5hbWUgPT0gbnVsbCAmJiBmbiA9PSBudWxsKSkge1xuXHRcdHRoaXMuX2FjdGlvbnMgPSB7fTtcblx0fVxuXG5cdGVsc2UgaWYgKGZuID09IG51bGwpIHtcblx0XHRkZWxldGUgdGhpcy5fYWN0aW9uc1tuYW1lXTtcblx0fVxuXG5cdGVsc2UgaWYgKG5hbWUgPT0gbnVsbCkge1xuXHRcdF8uZWFjaCh0aGlzLl9hY3Rpb25zLCBmdW5jdGlvbihkLCBuKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb25zW25dID0gZC5maWx0ZXIoZnVuY3Rpb24oZikgeyByZXR1cm4gZiAhPT0gZm47IH0pO1xuXHRcdH0sIHRoaXMpO1xuXHR9XG5cblx0ZWxzZSBpZiAodGhpcy5fYWN0aW9uc1tuYW1lXSAhPSBudWxsKSB7XG5cdFx0dGhpcy5fYWN0aW9uc1tuYW1lXSA9IF8ud2l0aG91dCh0aGlzLl9hY3Rpb25zW25hbWVdLCBmbik7XG5cdH1cblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gZmlyZUFjdGlvbihhY3Rpb24pIHtcblx0aWYgKHR5cGVvZiBhY3Rpb24gPT09IFwic3RyaW5nXCIpIGFjdGlvbiA9IG5ldyBBY3Rpb24oYWN0aW9uKTtcblx0aWYgKF8uaXNPYmplY3QoYWN0aW9uKSAmJiAhKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbikpIGFjdGlvbiA9IF8uZXh0ZW5kKG5ldyBBY3Rpb24sIGFjdGlvbik7XG5cdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhY3Rpb24gbmFtZSwgb2JqZWN0IG9yIGluc3RhbmNlIG9mIEFjdGlvbi5cIik7XG5cdFxuXHR2YXIgbmFtZSA9IGFjdGlvbi5uYW1lLFxuXHRcdGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cblx0YXJncy51bnNoaWZ0KGFjdGlvbik7XG5cblx0aWYgKHRoaXMuX2FjdGlvbnMgIT0gbnVsbCAmJiBBcnJheS5pc0FycmF5KHRoaXMuX2FjdGlvbnNbbmFtZV0pKSB7XG5cdFx0dGhpcy5fYWN0aW9uc1tuYW1lXS5zb21lKGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRpZiAoIWFjdGlvbi5idWJibGVzKSByZXR1cm4gdHJ1ZTtcblx0XHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH0sIHRoaXMpO1xuXHR9XG5cblx0aWYgKGFjdGlvbi5idWJibGVzICYmIHRoaXMucGFyZW50UmFuZ2UgIT0gbnVsbCkge1xuXHRcdC8vIGZpbmQgdGhlIGZpcnN0IHBhcmVudCB3aXRoIHRoZSBmaXJlIG1ldGhvZFxuXHRcdHZhciBmaXJlT24gPSB0aGlzLnBhcmVudFJhbmdlO1xuXHRcdHdoaWxlICh0eXBlb2YgZmlyZU9uLmZpcmVBY3Rpb24gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0Ly8gaWYgaXQgaGFzIG5vIHBhcmVudCwgd2UgY2FuJ3QgZG8gYW55dGhpbmdcblx0XHRcdGlmIChmaXJlT24ucGFyZW50UmFuZ2UgPT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0ZmlyZU9uID0gZmlyZU9uLnBhcmVudFJhbmdlO1xuXHRcdH1cblxuXHRcdGZpcmVPbi5maXJlQWN0aW9uLmFwcGx5KGZpcmVPbiwgYXJncyk7XG5cdH1cblx0XG5cdHJldHVybiB0aGlzO1xufSIsInZhciBNdXN0YWNoZSA9IHJlcXVpcmUoXCIuLi9cIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMuYWRvcHQgPSBhZG9wdDtcblx0dGhpcy5kaXNvd24gPSBkaXNvd247XG59XG5cbmZ1bmN0aW9uIGFkb3B0KHZpZXcsIHBhcmVudCwgYmVmb3JlKSB7XG5cdGlmICghKHZpZXcgaW5zdGFuY2VvZiBNdXN0YWNoZS5WaWV3KSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBpbnN0YW5jZW9mIFRlbXBsZSBWaWV3LlwiKTtcblx0fVxuXG5cdGlmICh0aGlzLl9hZG9wdGVkID09IG51bGwpIHRoaXMuX2Fkb3B0ZWQgPSBbXTtcblxuXHQvLyBtYWtlIHN1cmUgaXQgaXMgYW4gaW5kZXBlbmRlbnRcblx0dmlldy5kZXRhY2goKTtcblxuXHQvLyBob29rIG5hdmJhciBkYXRhIHVwIHRvIHRoaXMgZGF0YVxuXHR2aWV3LmdldFJvb3RNb2RlbCgpLnBhcmVudCA9IHRoaXMubW9kZWw7XG5cblx0Ly8gcmVuZGVyIHdoZW4gbm90IGluIGxvYWRpbmcgbW9kZVxuXHR2YXIgb25SZW5kZXI7XG5cdHRoaXMub24oXCJyZW5kZXJcIiwgb25SZW5kZXIgPSBmdW5jdGlvbihhLCBjb21wKSB7XG5cdFx0aWYgKGNvbXAuZmlyc3RSdW4pIHZpZXcucGFpbnQocGFyZW50LCBiZWZvcmUpO1xuXHRcdGNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0aWYgKGNvbXAuc3RvcHBlZCkgdmlldy5kZXRhY2goKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGhpcy5fYWRvcHRlZC5wdXNoKHtcblx0XHRyZW5kZXI6IG9uUmVuZGVyLFxuXHRcdHZpZXc6IHZpZXdcblx0fSk7XG5cblx0cmV0dXJuIHZpZXc7XG59XG5cbmZ1bmN0aW9uIGRpc293bih2aWV3KSB7XG5cdGlmICh0aGlzLl9hZG9wdGVkID09IG51bGwpIHJldHVybjtcblxuXHR2YXIgaW5kZXg7XG5cdGlmICh0aGlzLl9hZG9wdGVkLnNvbWUoZnVuY3Rpb24oYSwgaSkge1xuXHRcdGlmIChhLnZpZXcgPT09IHZpZXcpIHtcblx0XHRcdGluZGV4ID0gaTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fSkpIHJldHVybjtcblxuXHR0aGlzLm9mZihcInJlbmRlclwiLCB0aGlzLl9hZG9wdGVkW2ldLnJlbmRlcik7XG5cdHRoaXMuX2Fkb3B0ZWQuc3BsaWNlKGluZGV4LCAxKTtcblxuXHRyZXR1cm4gdmlldztcbn1cbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbnZhciBwbHVnaW5zID1cbmV4cG9ydHMuX3BsdWdpbnMgPSB7fTtcblxuZXhwb3J0cy5sb2FkUGx1Z2luID0gZnVuY3Rpb24odHBsLCBwbHVnaW4sIGFyZ3MpIHtcblx0aWYgKF8uaXNTdHJpbmcocGx1Z2luKSkge1xuXHRcdGlmIChwbHVnaW5zW3BsdWdpbl0gPT0gbnVsbClcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIk5vIHBsdWdpbiBleGlzdHMgd2l0aCBpZCAnXCIgKyBwbHVnaW4gKyBcIicuXCIpO1xuXG5cdFx0cGx1Z2luID0gcGx1Z2luc1twbHVnaW5dO1xuXHR9XG5cblx0aWYgKCFfLmlzRnVuY3Rpb24ocGx1Z2luKSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG9yIGZ1bmN0aW9uIGZvciBwbHVnaW5cIik7XG5cblx0Ly8gY2hlY2sgaWYgcGx1Z2luIGlzIGFscmVhZHkgbG9hZGVkIG9uIHRoaXMgdGVtcGxhdGVcblx0aWYgKHRwbC5fbG9hZGVkX3BsdWdpbnMgPT0gbnVsbCkgdHBsLl9sb2FkZWRfcGx1Z2lucyA9IFtdO1xuXHRpZiAofnRwbC5fbG9hZGVkX3BsdWdpbnMuaW5kZXhPZihwbHVnaW4pKSByZXR1cm4gdHBsO1xuXHR0cGwuX2xvYWRlZF9wbHVnaW5zLnB1c2gocGx1Z2luKTtcblxuXHRpZiAoYXJncyA9PSBudWxsKSBhcmdzID0gW107XG5cdGlmICghXy5pc0FycmF5KGFyZ3MpKSBhcmdzID0gWyBhcmdzIF07XG5cblx0cGx1Z2luLmFwcGx5KHRwbCwgYXJncyk7XG5cdHJldHVybiB0cGw7XG59XG5cbnZhciByZWdpc3RlclBsdWdpbiA9XG5leHBvcnRzLnJlZ2lzdGVyUGx1Z2luID0gZnVuY3Rpb24obmFtZSwgZm4pIHtcblx0aWYgKHR5cGVvZiBuYW1lICE9PSBcInN0cmluZ1wiKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBuYW1lIGZvciBwbHVnaW4uXCIpO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciBwbHVnaW4uXCIpO1xuXHR9XG5cblx0aWYgKGZuID09PSBwbHVnaW5zW25hbWVdKSByZXR1cm47XG5cdGlmIChwbHVnaW5zW25hbWVdICE9IG51bGwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJSZWZ1c2luZyB0byBvdmVyd3JpdGUgZXhpc3RpbmcgcGx1Z2luIFxcXCJuYW1lXFxcIi5cIik7XG5cdH1cblxuXHRwbHVnaW5zW25hbWVdID0gZm47XG59XG5cbi8vIGxvYWQgYnVpbHQgaW4gcGx1Z2luc1xucmVnaXN0ZXJQbHVnaW4oXCJhY3Rpb25zXCIsIHJlcXVpcmUoXCIuL2FjdGlvbnNcIikpO1xucmVnaXN0ZXJQbHVnaW4oXCJ0d293YXlcIiwgcmVxdWlyZShcIi4vdHdvd2F5XCIpKTtcbnJlZ2lzdGVyUGx1Z2luKFwiYWRvcHRpb25cIiwgcmVxdWlyZShcIi4vYWRvcHRpb25cIikpO1xucmVnaXN0ZXJQbHVnaW4oXCJyZWZzXCIsIHJlcXVpcmUoXCIuL3JlZnNcIikpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcblx0dGhpcy5yZWZzID0ge307XG5cdHRoaXMuZGVjb3JhdGUoXCJyZWZcIiwgcmVmKTtcblx0dGhpcy5maW5kQnlSZWYgPSBmaW5kQnlSZWY7XG59XG5cbmZ1bmN0aW9uIHJlZihkLCBrZXkpIHtcblx0Ly8gZG9uJ3Qgb3ZlcndyaXRlXG5cdGlmICh0aGlzLnJlZnNba2V5XSAhPSBudWxsKSB7XG5cdFx0Y29uc29sZS53YXJuKFwiTXVsdGlwbGUgZWxlbWVudHMgd2l0aCByZWZlcmVuY2UgJyVzJy5cIiwga2V5KTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBzZXQgdGhlIHJlZmVyZW5jZVxuXHR0aGlzLnJlZnNba2V5XSA9IGQudGFyZ2V0O1xuXG5cdC8vIHJlbW92ZSB0aGUgcmVmZXJlbmNlIHdoZW4gdGhlIGVsZW1lbnQgZGlzYXBwZWFyc1xuXHRkLmNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdGRlbGV0ZSB0aGlzLnJlZnNba2V5XTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGZpbmRCeVJlZihrZXkpIHtcblx0dmFyIHRwbCA9IHRoaXM7XG5cblx0d2hpbGUgKHRwbCAhPSBudWxsKSB7XG5cdFx0aWYgKHRwbC5yZWZzICYmIHRwbC5yZWZzW2tleV0pIHJldHVybiB0cGwucmVmc1trZXldO1xuXHRcdHRwbCA9IHRwbC5wYXJlbnRSYW5nZTtcblx0fVxuXG5cdHJldHVybiBudWxsO1xufVxuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcblxudmFyIGlucHV0X3R5cGVzID0gWyBcInRleHRcIiwgXCJudW1iZXJcIiwgXCJkYXRlXCIgXTtcbnZhciB2YWx1ZV90eXBlcyA9IFsgXCJyYWRpb1wiLCBcIm9wdGlvblwiIF07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuXHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHQvLyBhZGQgbWV0aG9kc1xuXHR0aGlzLmFkZEZvcm1CaW5kaW5nID0gYWRkRm9ybUJpbmRpbmc7XG5cdHRoaXMuZ2V0Rm9ybUJpbmRpbmcgPSBnZXRGb3JtQmluZGluZztcblx0dGhpcy5yZW1vdmVGb3JtQmluZGluZyA9IHJlbW92ZUZvcm1CaW5kaW5nO1xuXG5cdC8vIGFkZCBtYWluIGJpbmRpbmcgZGVjb3JhdG9yXG5cdHRoaXMuZGVjb3JhdGUoXCJiaW5kLXRvXCIsIGZ1bmN0aW9uIGJpbmRUbyhkLCBpZCwgbGF6eSkge1xuXHRcdHZhciBmYmluZCA9IHRoaXMuZ2V0Rm9ybUJpbmRpbmcoaWQpO1xuXHRcdGlmIChmYmluZCA9PSBudWxsKSByZXR1cm47XG5cblx0XHR2YXIgZWwgPSBkLnRhcmdldCxcblx0XHRcdHR5cGUgPSBnZXRUeXBlKGVsKSxcblx0XHRcdHNlbGYgPSB0aGlzLFxuXHRcdFx0ZXZ0TmFtZSwgb25DaGFuZ2UsIGxhenk7XG5cblx0XHQvLyBkZXRlY3QgY2hhbmdlcyB0byB0aGUgaW5wdXQncyB2YWx1ZVxuXHRcdGlmICh0eXBlb2YgZmJpbmQuY2hhbmdlID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdG9uQ2hhbmdlID0gZnVuY3Rpb24oZSkge1xuXHRcdFx0XHRmYmluZC5jaGFuZ2UuY2FsbChzZWxmLCBnZXROb2RlVmFsdWUoZWwsIHR5cGUpLCBkLm1vZGVsLCBlKTtcblx0XHRcdH07XG5cblx0XHRcdGV2dE5hbWUgPSBfLmNvbnRhaW5zKGlucHV0X3R5cGVzLCB0eXBlKSA/IFwiaW5wdXRcIiA6IFwiY2hhbmdlXCI7XG5cdFx0XHRlbC5hZGRFdmVudExpc3RlbmVyKGV2dE5hbWUsIG9uQ2hhbmdlKTtcblx0XHRcdGlmICghKG9wdGlvbnMubGF6eSB8fCBsYXp5KSkgZWwuYWRkRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIG9uQ2hhbmdlKTtcblxuXHRcdFx0ZC5jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdFx0ZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihldnROYW1lLCBvbkNoYW5nZSk7XG5cdFx0XHRcdGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCBvbkNoYW5nZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyByZWFjdGl2ZWx5IHNldCB0aGUgdmFsdWUgb24gdGhlIGlucHV0XG5cdFx0dmFyIGMgPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRzZXROb2RlVmFsdWUoZWwsIGZiaW5kLmdldC5jYWxsKHNlbGYsIGQubW9kZWwpLCB0eXBlKTtcblx0XHR9KTtcblxuXHRcdC8vIHNldE5vZGVWYWx1ZSByZWxpZXMgb24gdGhlIGNoaWxkcmVuIGVsZW1lbnRzXG5cdFx0Ly8gdGhvc2Ugd29uJ3QgYmUgaW4gdGhlIERPTSB0aWxsIGF0IGxlYXN0IHRoZSBuZXh0IHRpY2tcblx0XHRjLmludmFsaWRhdGUoKTtcblx0fSk7XG5cblx0Ly8gYWRkIHZhbHVlIGRlY29yYXRvciBmb3IgcmFkaW9zIGFuZCBvcHRpb25zXG5cdHRoaXMuZGVjb3JhdGUoXCJ2YWx1ZVwiLCBmdW5jdGlvbiB2YWx1ZU9mKGQsIHN0cnZhbCkge1xuXHRcdHZhciBlbCA9IGQudGFyZ2V0LFxuXHRcdFx0dHlwZSA9IGdldFR5cGUoZWwpLFxuXHRcdFx0c2VsZiA9IHRoaXM7XG5cdFx0XG5cdFx0aWYgKCFfLmNvbnRhaW5zKHZhbHVlX3R5cGVzLCB0eXBlKSkge1xuXHRcdFx0ZWwudmFsdWUgPSBzdHJ2YWw7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmFyIGFyZ3MgPSB0aGlzLnJlbmRlckFyZ3VtZW50cyhkLnRlbXBsYXRlLmFyZ3VtZW50cywgZC5tb2RlbCk7XG5cdFx0ZWwuJGJvdW5kX3ZhbHVlID0gYXJncy5sZW5ndGggPD0gMSA/IGFyZ3NbMF0gOiBhcmdzO1xuXHRcdGVsLnZhbHVlID0gc3RydmFsO1xuXHR9LCB7IHBhcnNlOiBcInN0cmluZ1wiIH0pO1xuXG5cdC8vIGFkZCBpbml0aWFsIGZvcm0gYmluZGluZ3Ncblx0dmFyIGluaXRpYWxCaW5kcyA9IF8ucmVzdWx0KHRoaXMsIFwidHdvd2F5XCIpO1xuXHRpZiAoXy5pc09iamVjdChpbml0aWFsQmluZHMpKSB0aGlzLmFkZEZvcm1CaW5kaW5nKGluaXRpYWxCaW5kcyk7XG59XG5cbmZ1bmN0aW9uIGFkZEZvcm1CaW5kaW5nKGlkLCBnZXR0ZXIsIG9uQ2hhbmdlKSB7XG5cdGlmIChfLmlzT2JqZWN0KGlkKSkge1xuXHRcdF8uZWFjaChpZCwgZnVuY3Rpb24odiwgaykge1xuXHRcdFx0YWRkRm9ybUJpbmRpbmcuY2FsbCh0aGlzLCBrLCB2KTtcblx0XHR9LCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGlmICh0eXBlb2YgaWQgIT09IFwic3RyaW5nXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIHN0cmluZyBmb3IgdGhlIGZvcm0gYmluZGluZyBJRC5cIik7XG5cdGlmICh0aGlzLl9mb3JtQmluZGluZ3MgPT0gbnVsbCkgdGhpcy5fZm9ybUJpbmRpbmdzID0ge307XG5cdGlmICh0aGlzLl9mb3JtQmluZGluZ3NbaWRdICE9IG51bGwpIHRocm93IG5ldyBFcnJvcihcIkEgZm9ybSBiaW5kaW5nIHdpdGggaWQgJ1wiICsgaWQgKyBcIicgYWxyZWFkeSBleGlzdHMuXCIpO1xuXG5cdGlmIChfLmlzT2JqZWN0KGdldHRlcikgJiYgb25DaGFuZ2UgPT0gbnVsbCkge1xuXHRcdG9uQ2hhbmdlID0gZ2V0dGVyLmNoYW5nZTtcblx0XHRnZXR0ZXIgPSBnZXR0ZXIuZ2V0O1xuXHR9XG5cblx0aWYgKHR5cGVvZiBnZXR0ZXIgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGEgZnVuY3Rpb24gb3Igb2JqZWN0IGZvciB0aGUgZm9ybSBiaW5kaW5nIGdldHRlci5cIik7XG5cdGlmICh0eXBlb2Ygb25DaGFuZ2UgIT09IFwiZnVuY3Rpb25cIikgb25DaGFuZ2UgPSBudWxsO1xuXG5cdHRoaXMuX2Zvcm1CaW5kaW5nc1tpZF0gPSB7XG5cdFx0Z2V0OiBnZXR0ZXIsXG5cdFx0Y2hhbmdlOiBvbkNoYW5nZVxuXHR9O1xuXG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiBnZXRGb3JtQmluZGluZyhpZCkge1xuXHRpZiAodHlwZW9mIGlkICE9PSBcInN0cmluZ1wiKSByZXR1cm47XG5cdHZhciBjID0gdGhpcywgYmluZGluZ3M7XG5cblx0d2hpbGUgKGMgIT0gbnVsbCkge1xuXHRcdGJpbmRpbmdzID0gYy5fZm9ybUJpbmRpbmdzO1xuXHRcdGlmIChiaW5kaW5ncyAhPSBudWxsICYmIGJpbmRpbmdzW2lkXSAhPSBudWxsKSByZXR1cm4gYmluZGluZ3NbaWRdO1xuXHRcdGMgPSBjLnBhcmVudFJhbmdlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUZvcm1CaW5kaW5nKGlkKSB7XG5cdHZhciBleGlzdHMgPSB0aGlzLl9mb3JtQmluZGluZ3NbaWRdICE9IG51bGw7XG5cdGRlbGV0ZSB0aGlzLl9mb3JtQmluZGluZ3NbaWRdO1xuXHRyZXR1cm4gZXhpc3RzO1xufVxuXG52YXIgdHlwZV9tYXAgPSB7XG5cdFwidGV4dFwiOiBbIFwidGV4dFwiLCBcImNvbG9yXCIsIFwiZW1haWxcIiwgXCJwYXNzd29yZFwiLCBcInNlYXJjaFwiLCBcInRlbFwiLCBcInVybFwiLCBcImhpZGRlblwiIF0sXG5cdFwibnVtYmVyXCI6IFsgXCJudW1iZXJcIiwgXCJyYW5nZVwiIF0sXG5cdFwiZGF0ZVwiOiBbIFwiZGF0ZVwiLCBcImRhdGV0aW1lXCIsIFwiZGF0ZXRpbWUtbG9jYWxcIiwgXCJtb250aFwiLCBcInRpbWVcIiwgXCJ3ZWVrXCIgXSxcblx0XCJmaWxlXCI6IFsgXCJmaWxlXCIgXSxcblx0XCJjaGVja2JveFwiOiBbIFwiY2hlY2tib3hcIiBdLFxuXHRcInJhZGlvXCI6IFsgXCJyYWRpb1wiIF1cbn1cblxuZnVuY3Rpb24gZ2V0VHlwZShlbCkge1xuXHRzd2l0Y2ggKGVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKSkge1xuXHRcdGNhc2UgXCJpbnB1dFwiOlxuXHRcdFx0Zm9yICh2YXIgdHlwZSBpbiB0eXBlX21hcCkge1xuXHRcdFx0XHRpZiAoXy5jb250YWlucyh0eXBlX21hcFt0eXBlXSwgZWwudHlwZSkpIHJldHVybiB0eXBlO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwic2VsZWN0XCI6XG5cdFx0XHRyZXR1cm4gXCJzZWxlY3RcIjtcblxuXHRcdGNhc2UgXCJvcHRpb25cIjpcblx0XHRcdHJldHVybiBcIm9wdGlvblwiO1xuXG5cdFx0Y2FzZSBcInRleHRhcmVhXCI6XG5cdFx0XHRyZXR1cm4gXCJ0ZXh0XCI7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0Tm9kZVZhbHVlKG5vZGUsIHR5cGUpIHtcblx0aWYgKHR5cGUgPT0gbnVsbCkgdHlwZSA9IGdldFR5cGUobm9kZSk7XG5cdHZhciB2YWw7XG5cblx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSBcIm51bWJlclwiOlxuXHRcdFx0dmFsID0gbm9kZS52YWx1ZUFzTnVtYmVyO1xuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBcInRleHRcIjpcblx0XHRcdHZhbCA9IG5vZGUudmFsdWU7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJjaGVja2JveFwiOlxuXHRcdFx0dmFsID0gbm9kZS5jaGVja2VkO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiZGF0ZVwiOlxuXHRcdFx0dmFsID0gbm9kZS52YWx1ZUFzRGF0ZTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInNlbGVjdFwiOlxuXHRcdFx0dmFyIG9wdCA9IG5vZGUucXVlcnlTZWxlY3RvcihcIm9wdGlvbjpjaGVja2VkXCIpO1xuXHRcdFx0aWYgKG9wdCAhPSBudWxsKSB2YWwgPSBvcHQuJGJvdW5kX3ZhbHVlO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiZmlsZVwiOlxuXHRcdFx0dmFsID0gIW5vZGUubXVsdGlwbGUgPyBub2RlLmZpbGVzWzBdIDogXy50b0FycmF5KG5vZGUuZmlsZXMpO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwicmFkaW9cIjpcblx0XHRcdHZhbCA9IG5vZGUuJGJvdW5kX3ZhbHVlO1xuXHRcdFx0YnJlYWs7XG5cdH1cblxuXHRyZXR1cm4gdmFsO1xufVxuXG5mdW5jdGlvbiBzZXROb2RlVmFsdWUoZWwsIHZhbCwgdHlwZSkge1xuXHRpZiAodHlwZSA9PSBudWxsKSB0eXBlID0gZ2V0VHlwZShlbCk7XG5cblx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSBcIm51bWJlclwiOlxuXHRcdFx0aWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVsKSByZXR1cm47XG5cdFx0XHRpZiAoXy5pc051bWJlcih2YWwpKSBlbC52YWx1ZUFzTnVtYmVyID0gdmFsO1xuXHRcdFx0ZWxzZSBlbC52YWx1ZSA9IHZhbDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInRleHRcIjpcblx0XHRcdGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBlbCkgcmV0dXJuO1xuXHRcdFx0ZWwudmFsdWUgPSB2YWwgPT0gbnVsbCA/IFwiXCIgOiB2YWwudG9TdHJpbmcoKTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImNoZWNrYm94XCI6XG5cdFx0XHRlbC5jaGVja2VkID0gISF2YWw7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJkYXRlXCI6XG5cdFx0XHRpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZWwpIHJldHVybjtcblx0XHRcdGlmIChfLmlzRGF0ZSh2YWwpKSBlbC52YWx1ZUFzRGF0ZSA9IHZhbDtcblx0XHRcdGVsc2UgZWwudmFsdWUgPSB2YWw7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJzZWxlY3RcIjpcblx0XHRcdF8udG9BcnJheShlbC5xdWVyeVNlbGVjdG9yQWxsKFwib3B0aW9uXCIpKS5mb3JFYWNoKGZ1bmN0aW9uKG9wdCkge1xuXHRcdFx0XHRvcHQuc2VsZWN0ZWQgPSBvcHQuJGJvdW5kX3ZhbHVlID09PSB2YWw7XG5cdFx0XHR9KTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInJhZGlvXCI6XG5cdFx0XHRlbC5jaGVja2VkID0gZWwuJGJvdW5kX3ZhbHVlID09PSB2YWw7XG5cdFx0XHRicmVhaztcblx0fVxufSIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpLFxuXHRNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXHRWaWV3ID0gcmVxdWlyZShcIi4vdmlld1wiKTtcblxudmFyIFNlY3Rpb24gPVxubW9kdWxlLmV4cG9ydHMgPSBWaWV3LmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnJvd3MgPSB7fTtcblx0XHR0aGlzLl9yb3dfZGVwcyA9IHt9O1xuXHRcdFZpZXcuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fSxcblxuXHRpbnZlcnQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdGlmICghXy5pc0Jvb2xlYW4odmFsKSkgdmFsID0gIXRoaXMuX2ludmVydGVkO1xuXHRcdHRoaXMuX2ludmVydGVkID0gdmFsO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGlzSW52ZXJ0ZWQ6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2ludmVydGVkO1xuXHR9LFxuXG5cdHNldFBhdGg6IGZ1bmN0aW9uKHBhdGgpIHtcblx0XHR0aGlzLl9wYXRoID0gcGF0aDtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRvblJvdzogZnVuY3Rpb24oZm4pIHtcblx0XHRpZiAoIV8uaXNGdW5jdGlvbihmbikpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIHJvdyBoYW5kbGVyLlwiKTtcblxuXHRcdHRoaXMuX29uUm93ID0gZm47XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkUm93OiBmdW5jdGlvbihrZXksIGRhdGEpIHtcblx0XHQvLyByZW1vdmUgZXhpc3Rpbmdcblx0XHR0aGlzLnJlbW92ZVJvdyhrZXkpO1xuXG5cdFx0Ly8gY29udmVydCBkYXRhIHRvIG1vZGVsXG5cdFx0aWYgKCFNb2RlbC5pc01vZGVsKGRhdGEpKSB7XG5cdFx0XHRkYXRhID0gbmV3IE1vZGVsKGRhdGEsIHRoaXMubW9kZWwpO1xuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSBhIG5ldyByb3dcblx0XHR2YXIgcm93ID0gbmV3IFZpZXcoZGF0YSk7XG5cdFx0XG5cdFx0Ly8gc2V0IHVwIHJlbmRlciBhbmQgbW91bnQgaXRcblx0XHRyb3cucmVuZGVyID0gdGhpcy5fb25Sb3c7XG5cdFx0dGhpcy5yb3dzW2tleV0gPSByb3c7XG5cdFx0dGhpcy5hZGRNZW1iZXIocm93KTtcblx0XHRyb3cubW91bnQoKTtcblxuXHRcdHJldHVybiByb3c7XG5cdH0sXG5cblx0aGFzUm93OiBmdW5jdGlvbihrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRSb3coa2V5KSAhPSBudWxsO1xuXHR9LFxuXG5cdGdldFJvdzogZnVuY3Rpb24oa2V5KSB7XG5cdFx0cmV0dXJuIHRoaXMucm93c1trZXldO1xuXHR9LFxuXG5cdHJlbW92ZVJvdzogZnVuY3Rpb24oa2V5KSB7XG5cdFx0aWYgKHRoaXMucm93c1trZXldID09IG51bGwpIHJldHVybiB0aGlzO1xuXG5cdFx0dmFyIHJvdyA9IHRoaXMucm93c1trZXldO1xuXHRcdHRoaXMucmVtb3ZlTWVtYmVyKHJvdyk7XG5cdFx0ZGVsZXRlIHRoaXMucm93c1trZXldO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlQWxsUm93czogZnVuY3Rpb24oKSB7XG5cdFx0T2JqZWN0LmtleXModGhpcy5yb3dzKS5mb3JFYWNoKHRoaXMucmVtb3ZlUm93LCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLl9wYXRoID09IG51bGwpIHRocm93IG5ldyBFcnJvcihcIk1pc3NpbmcgcGF0aC5cIik7XG5cblx0XHR2YXIgc2VsZiA9IHRoaXMsXG5cdFx0XHR2YWwsIGlzRW1wdHksIGludmVydGVkLCBpc0xpc3QsXG5cdFx0XHRyb3dTb3J0LCBtb2RlbCwgcHJveHksIGtleXM7XG5cblx0XHR2YWwgPSB0aGlzLmdldCh0aGlzLl9wYXRoKTtcblx0XHRtb2RlbCA9IG5ldyBNb2RlbCh2YWwsIHRoaXMubW9kZWwpO1xuXHRcdHByb3h5ID0gbW9kZWwuZ2V0UHJveHlCeVZhbHVlKHZhbCk7XG5cdFx0aW52ZXJ0ZWQgPSB0aGlzLmlzSW52ZXJ0ZWQoKTtcblx0XHRpc0xpc3QgPSBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJpc0xpc3RcIik7XG5cblx0XHRmdW5jdGlvbiBnZXRFbXB0aW5lc3MoKSB7XG5cdFx0XHRyZXR1cm4gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiaXNFbXB0eVwiKTtcblx0XHR9XG5cblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRpc0VtcHR5ID0gIXZhbCB8fCAoaXNMaXN0ICYmICFnZXRFbXB0aW5lc3MoKSlcblx0XHR9KTtcblxuXHRcdGlmIChpc0VtcHR5ICYmIGludmVydGVkKSB7XG5cdFx0XHRpZiAoaXNMaXN0KSBnZXRFbXB0aW5lc3MoKTtcblx0XHRcdHRoaXMuYWRkUm93KDAsIG1vZGVsKTtcblx0XHR9IGVsc2UgaWYgKCFpc0VtcHR5ICYmICFpbnZlcnRlZCkge1xuXHRcdFx0aWYgKGlzTGlzdCkge1xuXHRcdFx0XHRrZXlzID0gW107XG5cblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdFx0XHR2YXIgbmtleXMgPSBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJrZXlzXCIpO1xuXG5cdFx0XHRcdFx0Ly8gdHJpY2sgVHJhY2tyIHNvIGF1dG9ydW5zIGFyZW4ndCBjb250cm9sbGVkIGJ5IHRoaXMgb25lXG5cdFx0XHRcdFx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IGNvbXAuX3BhcmVudDtcblxuXHRcdFx0XHRcdC8vIHJlbW92ZSByZW1vdmVkIHJvd3Ncblx0XHRcdFx0XHRfLmRpZmZlcmVuY2Uoa2V5cywgbmtleXMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcm93X2RlcHNba2V5XSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9yb3dfZGVwc1trZXldLnN0b3AoKTtcblx0XHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMuX3Jvd19kZXBzW2tleV07XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRoaXMucmVtb3ZlUm93KGtleSk7XG5cdFx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0XHQvLyBhZGQgYWRkZWQgcm93c1xuXHRcdFx0XHRcdF8uZGlmZmVyZW5jZShua2V5cywga2V5cykuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcblx0XHRcdFx0XHRcdHZhciByb3csIHJtb2RlbDtcblxuXHRcdFx0XHRcdFx0cm93ID0gdGhpcy5nZXRSb3coa2V5KTtcblx0XHRcdFx0XHRcdHJtb2RlbCA9IHJvdyAhPSBudWxsID8gcm93Lm1vZGVsIDpcblx0XHRcdFx0XHRcdFx0bmV3IE1vZGVsKG51bGwsIG5ldyBNb2RlbCh7ICRrZXk6IGtleSB9LCB0aGlzLm1vZGVsKSk7XG5cblx0XHRcdFx0XHRcdHRoaXMuX3Jvd19kZXBzW2tleV0gPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oYykge1xuXHRcdFx0XHRcdFx0XHRybW9kZWwuc2V0KG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImdldFwiLCBrZXkpKTtcblx0XHRcdFx0XHRcdFx0Ly8gaWYgKHJvd1NvcnQgIT0gbnVsbCkgcm93U29ydC5pbnZhbGlkYXRlKCk7XG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0Ly8gYWRkIHRoZSByb3cgYWZ0ZXIgd2Ugc2V0IHRoZSBkYXRhXG5cdFx0XHRcdFx0XHRpZiAocm93ID09IG51bGwpIHRoaXMuYWRkUm93KGtleSwgcm1vZGVsKTtcblx0XHRcdFx0XHR9LCB0aGlzKTtcblx0XHRcdFx0XHRcdFxuXHRcdFx0XHRcdC8vIHByZXRlbmQgbGlrZSBub3RoaW5nIGhhcHBlbmVkXG5cdFx0XHRcdFx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IGNvbXA7XG5cblx0XHRcdFx0XHQvLyB0aGUgbmV3IHNldCBvZiBrZXlzXG5cdFx0XHRcdFx0a2V5cyA9IG5rZXlzO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBhIHJlYWN0aXZlIGNvbnRleHQgdGhhdCBjb250aW51b3VzbHkgc29ydHMgcm93c1xuXHRcdFx0XHQvLyByb3dTb3J0ID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdC8vIGNvbnNvbGUubG9nKGtleXMpO1xuXHRcdFx0XHRcdC8vIHZhciBiZWZvcmUgPSBudWxsLCBpLCByb3c7XG5cblx0XHRcdFx0XHQvLyBmb3IgKGkgPSBrZXlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Ly8gXHRyb3cgPSB0aGlzLmdldFJvdyhrZXlzW2ldKTtcblx0XHRcdFx0XHQvLyBcdGlmIChyb3cgPT0gbnVsbCkgY29udGludWU7XG5cdFx0XHRcdFx0Ly8gXHR0aGlzLmluc2VydEJlZm9yZShyb3csIGJlZm9yZSk7XG5cdFx0XHRcdFx0Ly8gXHRiZWZvcmUgPSByb3c7XG5cdFx0XHRcdFx0Ly8gfVxuXHRcdFx0XHQvLyB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYWRkUm93KDAsIG1vZGVsKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzTGlzdCkge1xuXHRcdFx0Z2V0RW1wdGluZXNzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gYXV0byBjbGVhblxuXHRcdHRoaXMub25jZShcImludmFsaWRhdGVcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHR0aGlzLl9yb3dfZGVwcyA9IHt9O1xuXHRcdFx0dGhpcy5yZW1vdmVBbGxSb3dzKCk7XG5cdFx0fSk7XG5cdH1cblxufSwge1xuXG5cdGlzRW1wdHk6IGZ1bmN0aW9uKG1vZGVsLCBwcm94eSkge1xuXHRcdGlmICghbW9kZWwuZGF0YSkgcmV0dXJuIHRydWU7XG5cdFx0aWYgKHByb3h5ID09IG51bGwpIHByb3h5ID0gbW9kZWwuZ2V0UHJveHlCeVZhbHVlKG1vZGVsLmRhdGEpO1xuXHRcdHJldHVybiBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIG1vZGVsLmRhdGEsIFwiaXNMaXN0XCIpICYmXG5cdFx0XHRtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIG1vZGVsLmRhdGEsIFwiaXNFbXB0eVwiKTtcblx0fVxuXG59KTtcbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG52YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcblxudmFyIHRyYWNrID1cbmV4cG9ydHMudHJhY2sgPSBmdW5jdGlvbihvYmosIHJlcGxhY2VyKSB7XG5cdGZ1bmN0aW9uIHJlcGxhY2Uoaywgdikge1xuXHRcdHZhciBudmFsO1xuXHRcdGlmICh0eXBlb2YgcmVwbGFjZXIgPT09IFwiZnVuY3Rpb25cIikgbnZhbCA9IHJlcGxhY2VyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiBudmFsID09PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB2ICE9PSBcInVuZGVmaW5lZFwiKSBudmFsID0gdHJhY2sodik7XG5cdFx0cmV0dXJuIG52YWw7XG5cdH1cblxuXHRpZiAoXy5pc0FycmF5KG9iaikpIHJldHVybiB0cmFja0FycmF5KG9iaiwgcmVwbGFjZSlcblx0aWYgKHV0aWwuaXNQbGFpbk9iamVjdChvYmopKSByZXR1cm4gdHJhY2tPYmplY3Qob2JqLCByZXBsYWNlKTtcblx0cmV0dXJuIG9iajtcbn1cblxudmFyIHRyYWNrUHJvcGVydHkgPVxuZXhwb3J0cy50cmFja1Byb3BlcnR5ID0gZnVuY3Rpb24ob2JqLCBwcm9wLCB2YWx1ZSwgb3B0aW9ucykge1xuXHRpZiAoIV8uaXNPYmplY3Qob2JqKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG9iamVjdCB0byBkZWZpbmUgdGhlIHJlYWN0aXZlIHByb3BlcnR5IG9uLlwiKTtcblx0aWYgKHR5cGVvZiBwcm9wICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIGZvciBwcm9wZXJ0eSBuYW1lLlwiKTtcblxuXHR2YXIgZGVwID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5O1xuXHRcblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdGNvbmZpZ3VyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuY29uZmlndXJhYmxlICE9PSBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5lbnVtZXJhYmxlICE9PSBmYWxzZSxcblx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0aWYgKHZhbCAhPT0gdmFsdWUpIHtcblx0XHRcdFx0dmFsdWUgPSB2YWw7XG5cdFx0XHRcdGRlcC5jaGFuZ2VkKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9LFxuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRkZXAuZGVwZW5kKCk7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgdHJhY2tPYmplY3QgPVxuZXhwb3J0cy50cmFja09iamVjdCA9IGZ1bmN0aW9uKHByb3BzLCByZXBsYWNlcikge1xuXHRpZiAocHJvcHMuX19yZWFjdGl2ZSkgcmV0dXJuIHByb3BzO1xuXG5cdHZhciB2YWx1ZXMgPSB7fTtcblx0dmFyIGRlcHMgPSB7fTtcblx0dmFyIG1haW5EZXAgPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKTtcblxuXHRmdW5jdGlvbiByZXBsYWNlKGN0eCwgbmFtZSwgdmFsdWUpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cdFx0cmV0dXJuIFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0eXBlb2YgcmVwbGFjZXIgPT09IFwiZnVuY3Rpb25cIiA/IHJlcGxhY2VyLmNhbGwoY3R4LCBuYW1lLCB2YWx1ZSkgOiB2YWx1ZTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldHRlcihuYW1lKSB7XG5cdFx0ZGVwc1tuYW1lXS5kZXBlbmQoKTtcblx0XHRyZXR1cm4gdmFsdWVzW25hbWVdO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dGVyKG5hbWUsIHZhbHVlKSB7XG5cdFx0dmFyIG9sZCA9IHZhbHVlc1tuYW1lXTtcblx0XHR2YWx1ZXNbbmFtZV0gPSByZXBsYWNlKHRoaXMsIG5hbWUsIHZhbHVlKTtcblxuXHRcdHZhciBkZXAgPSBkZXBzW25hbWVdO1xuXHRcdGlmIChkZXAgPT0gbnVsbCkgZGVwID0gZGVwc1tuYW1lXSA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXHRcdGlmIChvbGQgIT09IHZhbHVlc1tuYW1lXSkgZGVwLmNoYW5nZWQoKTtcblxuXHRcdG1haW5EZXAuY2hhbmdlZCgpO1xuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHR2YXIgX3Byb3RvID0gdHlwZW9mIHByb3BzLmNvbnN0cnVjdG9yID09PSBcImZ1bmN0aW9uXCIgPyBPYmplY3QuY3JlYXRlKHByb3BzLmNvbnN0cnVjdG9yLnByb3RvdHlwZSkgOiB7fTtcblxuXHRfLmV4dGVuZChfcHJvdG8sIHtcblxuXHRcdGRlZmluZVByb3BlcnR5OiBmdW5jdGlvbihuYW1lLCB2YWx1ZSwgb3B0aW9ucykge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIG5hbWUsIHtcblx0XHRcdFx0Y29uZmlndXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5jb25maWd1cmFibGUgIT09IGZhbHNlLFxuXHRcdFx0XHRlbnVtZXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5lbnVtZXJhYmxlICE9PSBmYWxzZSxcblx0XHRcdFx0Z2V0OiBnZXR0ZXIuYmluZCh0aGlzLCBuYW1lKSxcblx0XHRcdFx0c2V0OiBzZXR0ZXIuYmluZCh0aGlzLCBuYW1lKVxuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXNbbmFtZV0gPSB2YWx1ZTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0sXG5cblx0XHRkZWxldGVQcm9wZXJ0eTogZnVuY3Rpb24obmFtZSkge1xuXHRcdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0XHRpZiAoZGVsZXRlIHRoaXNbbmFtZV0pIHsgLy8gaW4gY2FzZSBjb25maWd1cmFibGUgPT09IGZhbHNlXG5cdFx0XHRcdGRlbGV0ZSB2YWx1ZXNbbmFtZV07XG5cdFx0XHRcdGRlbGV0ZSBkZXBzW25hbWVdO1xuXHRcdFx0XHRpZiAoZGVwKSBkZXAuY2hhbmdlZCgpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblxuXHRcdHRvSlNPTjogZnVuY3Rpb24oKSB7XG5cdFx0XHRtYWluRGVwLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIF8uY2xvbmUodmFsdWVzKTtcblx0XHR9XG5cblx0fSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KF9wcm90bywgXCJfX3JlYWN0aXZlXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdHZhbHVlOiB0cnVlLFxuXHRcdHdyaXRlYWJsZTogZmFsc2Vcblx0fSk7XG5cblx0dmFyIHJvYmogPSBPYmplY3QuY3JlYXRlKF9wcm90byk7XG5cblx0Xy5lYWNoKHByb3BzLCBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG5cdFx0cm9iai5kZWZpbmVQcm9wZXJ0eShrZXksIHZhbHVlKTtcblx0fSk7XG5cblx0cmV0dXJuIHJvYmo7XG59XG5cbnZhciB0cmFja0FycmF5ID1cbmV4cG9ydHMudHJhY2tBcnJheSA9IGZ1bmN0aW9uKGFyciwgcmVwbGFjZXIpIHtcblx0aWYgKCFfLmlzQXJyYXkoYXJyKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGFycmF5LlwiKTtcblx0aWYgKGFyci5fX3JlYWN0aXZlKSByZXR1cm4gYXJyO1xuXHRcblx0dmFyIGRlcHMgPSB7IGxlbmd0aDogbmV3IFRyYWNrci5EZXBlbmRlbmN5KCkgfTtcblx0dmFyIHZhbHVlcyA9IHt9O1xuXHR2YXIgbmFyciA9IHV0aWwucGF0Y2hBcnJheShbXSk7XG5cblx0ZnVuY3Rpb24gcmVwbGFjZShjdHgsIG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXHRcdHJldHVybiBUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHJlcGxhY2VyID09PSBcImZ1bmN0aW9uXCIgPyByZXBsYWNlci5jYWxsKGN0eCwgbmFtZSwgdmFsdWUpIDogdmFsdWU7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXR0ZXIobmFtZSkge1xuXHRcdGRlcHNbbmFtZV0uZGVwZW5kKCk7XG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHRlcihuYW1lLCB2YWx1ZSkge1xuXHRcdHZhciBvbGQgPSB2YWx1ZXNbbmFtZV07XG5cdFx0dmFsdWVzW25hbWVdID0gcmVwbGFjZSh0aGlzLCBuYW1lLCB2YWx1ZSk7XG5cblx0XHR2YXIgZGVwID0gZGVwc1tuYW1lXTtcblx0XHRpZiAoZGVwID09IG51bGwpIGRlcCA9IGRlcHNbbmFtZV0gPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKTtcblx0XHRpZiAob2xkICE9PSB2YWx1ZXNbbmFtZV0pIGRlcC5jaGFuZ2VkKCk7XG5cblx0XHRyZXR1cm4gdmFsdWVzW25hbWVdO1xuXHR9XG5cblx0ZnVuY3Rpb24gZGVmaW5lKGkpIHtcblx0XHR2YXIgZGVwO1xuXG5cdFx0aWYgKHR5cGVvZiBpID09PSBcIm51bWJlclwiICYmIGkgPj0gbmFyci5sZW5ndGgpIHtcblx0XHRcdGlmICgoZGVwID0gZGVwc1tpXSkgIT0gbnVsbCkge1xuXHRcdFx0XHRkZWxldGUgZGVwc1tpXTtcblx0XHRcdH1cblxuXHRcdFx0ZGVsZXRlIG5hcnJbaV07XG5cdFx0XHRkZWxldGUgdmFsdWVzW2ldO1xuXHRcdFx0ZGVwLmNoYW5nZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzZXR0ZXIuY2FsbCh0aGlzLCBpLCBuYXJyW2ldKTtcblxuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBpLnRvU3RyaW5nKCksIHtcblx0XHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRcdGVudW1lcmFibGU6IHRydWUsXG5cdFx0XHRnZXQ6IGdldHRlci5iaW5kKG5hcnIsIGkpLFxuXHRcdFx0c2V0OiBzZXR0ZXIuYmluZChuYXJyLCBpKVxuXHRcdH0pO1xuXHR9XG5cblx0bmFyci5vYnNlcnZlKGZ1bmN0aW9uKGNoZykge1x0XHRcblx0XHR2YXIgYmFsYW5jZSwgc3RhcnQsIGVuZCwgbGVuLCBpLCBwcmV2bGVuO1xuXG5cdFx0aWYgKGNoZyA9PSBudWxsKSByZXR1cm47XG5cblx0XHRiYWxhbmNlID0gY2hnLmFkZGVkIC0gY2hnLnJlbW92ZWQ7XG5cdFx0aWYgKCFiYWxhbmNlKSByZXR1cm47XG5cblx0XHRsZW4gPSBuYXJyLmxlbmd0aDtcblx0XHRwcmV2bGVuID0gbGVuIC0gYmFsYW5jZTtcblx0XHRzdGFydCA9IE1hdGgubWluKHByZXZsZW4sIGxlbik7XG5cdFx0ZW5kID0gTWF0aC5tYXgocHJldmxlbiwgbGVuKTtcblxuXHRcdGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIGRlZmluZShpKTtcblx0XHRkZXBzLmxlbmd0aC5jaGFuZ2VkKCk7XG5cdH0pO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBcIl9fcmVhY3RpdmVcIiwge1xuXHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0dmFsdWU6IHRydWUsXG5cdFx0d3JpdGVhYmxlOiBmYWxzZVxuXHR9KTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgXCIkbGVuZ3RoXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRkZXBzLmxlbmd0aC5kZXBlbmQoKTtcblx0XHRcdHJldHVybiB0aGlzLmxlbmd0aDtcblx0XHR9XG5cdH0pO1xuXG5cdG5hcnIucHVzaC5hcHBseShuYXJyLCBhcnIpO1xuXHRyZXR1cm4gbmFycjtcbn0iLCJtb2R1bGUuZXhwb3J0cyA9IHtcblx0Uk9PVCAgICAgICAgICAgICAgOiAxLFxuXG5cdC8vIFhNTC9IVE1MXG5cdEhUTUwgICAgICAgICAgICAgIDogMixcblx0VEVYVCAgICAgICAgICAgICAgOiAzLFxuXHRFTEVNRU5UICAgICAgICAgICA6IDQsXG5cdEFUVFJJQlVURSAgICAgICAgIDogNSxcblx0WENPTU1FTlQgICAgICAgICAgOiA2LFxuXG5cdC8vIE11c3RhY2hlXG5cdElOVEVSUE9MQVRPUiAgICAgIDogNyxcblx0VFJJUExFICAgICAgICAgICAgOiA4LFxuXHRTRUNUSU9OICAgICAgICAgICA6IDksXG5cdElOVkVSVEVEICAgICAgICAgIDogMTAsXG5cdFBBUlRJQUwgICAgICAgICAgIDogMTEsXG5cdE1DT01NRU5UICAgICAgICAgIDogMTIsXG5cblx0Ly8gTUlTQ1xuXHRMSVRFUkFMICAgICAgICAgICA6IDEzXG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG4vLyBsaWtlIHVuZGVyc2NvcmUncyByZXN1bHQsIGJ1dCBwYXNzIGFyZ3VtZW50cyB0aHJvdWdoXG5leHBvcnRzLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHkpIHtcblx0dmFyIHZhbHVlID0gb2JqZWN0ID09IG51bGwgPyB2b2lkIDAgOiBvYmplY3RbcHJvcGVydHldO1xuXHRyZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmFwcGx5KG9iamVjdCwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKSkgOiB2YWx1ZTtcbn07XG5cbi8vIHRlc3RzIHZhbHVlIGFzIHBvam8gKHBsYWluIG9sZCBqYXZhc2NyaXB0IG9iamVjdClcbnZhciBpc1BsYWluT2JqZWN0ID1cbmV4cG9ydHMuaXNQbGFpbk9iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gb2JqICE9IG51bGwgJiYgKG9iai5jb25zdHJ1Y3RvciA9PT0gT2JqZWN0IHx8IG9iai5fX3Byb3RvX18gPT09IE9iamVjdC5wcm90b3R5cGUpO1xufVxuXG4vLyB0ZXN0cyBmdW5jdGlvbiBhcyBhIHN1YmNsYXNzIG9mIGEgcGFyZW50IGZ1bmN0aW9uXG4vLyBoZXJlLCBhIGNsYXNzIGlzIHRlY2huaWNhbGx5IGEgc3ViY2xhc3Mgb2YgaXRzZWxmXG5leHBvcnRzLmlzU3ViQ2xhc3MgPSBmdW5jdGlvbihwYXJlbnQsIGZuKSB7XG5cdHJldHVybiBmbiA9PT0gcGFyZW50IHx8IChmbiAhPSBudWxsICYmIGZuLnByb3RvdHlwZSBpbnN0YW5jZW9mIHBhcmVudCk7XG59XG5cbi8vIGxpa2UgalF1ZXJ5J3MgZW1wdHkoKSwgcmVtb3ZlcyBhbGwgY2hpbGRyZW5cbnZhciBlbXB0eU5vZGUgPVxuZXhwb3J0cy5lbXB0eU5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG5cdHdoaWxlIChub2RlLmxhc3RDaGlsZCkgbm9kZS5yZW1vdmVDaGlsZChub2RlLmxhc3RDaGlsZCk7XG5cdHJldHVybiBub2RlO1xufVxuXG4vLyBjbGVhbnMgaHRtbCwgdGhlbiBjb252ZXJ0cyBodG1sIGVudGl0aWVzIHRvIHVuaWNvZGVcbmV4cG9ydHMuZGVjb2RlRW50aXRpZXMgPSAoZnVuY3Rpb24oKSB7XG5cdGlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblxuXHQvLyB0aGlzIHByZXZlbnRzIGFueSBvdmVyaGVhZCBmcm9tIGNyZWF0aW5nIHRoZSBvYmplY3QgZWFjaCB0aW1lXG5cdHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdHZhciBlbnRpdHkgPSAvJig/OiN4W2EtZjAtOV0rfCNbMC05XSt8W2EtejAtOV0rKTs/L2lnO1xuXG5cdHJldHVybiBmdW5jdGlvbiBkZWNvZGVIVE1MRW50aXRpZXMoc3RyKSB7XG5cdFx0c3RyID0gc3RyLnJlcGxhY2UoZW50aXR5LCBmdW5jdGlvbihtKSB7XG5cdFx0XHRlbGVtZW50LmlubmVySFRNTCA9IG07XG5cdFx0XHRyZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudDtcblx0XHR9KTtcblxuXHRcdGVtcHR5Tm9kZShlbGVtZW50KTtcblxuXHRcdHJldHVybiBzdHI7XG5cdH1cbn0pKCk7XG5cbi8vIGNvbnZlcnQgaHRtbCBpbnRvIERPTSBub2Rlc1xuZXhwb3J0cy5wYXJzZUhUTUwgPSAoZnVuY3Rpb24oKSB7XG5cdGlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblxuXHQvLyB0aGlzIHByZXZlbnRzIGFueSBvdmVyaGVhZCBmcm9tIGNyZWF0aW5nIHRoZSBvYmplY3QgZWFjaCB0aW1lXG5cdHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0cmV0dXJuIGZ1bmN0aW9uIHBhcnNlSFRNTChodG1sKSB7XG5cdFx0ZWxlbWVudC5pbm5lckhUTUwgPSBodG1sICE9IG51bGwgPyBodG1sLnRvU3RyaW5nKCkgOiBcIlwiO1xuXHRcdHZhciBub2RlcyA9IF8udG9BcnJheShlbGVtZW50LmNoaWxkTm9kZXMpO1xuXHRcdGVtcHR5Tm9kZShlbGVtZW50KTtcblx0XHRyZXR1cm4gbm9kZXM7XG5cdH1cbn0pKCk7XG5cbi8vIHRoZSBzdWJjbGFzc2luZyBmdW5jdGlvbiBmb3VuZCBpbiBCYWNrYm9uZVxudmFyIHN1YmNsYXNzID1cbmV4cG9ydHMuc3ViY2xhc3MgPSBmdW5jdGlvbihwcm90b1Byb3BzLCBzdGF0aWNQcm9wcykge1xuXHR2YXIgcGFyZW50ID0gdGhpcztcblx0dmFyIGNoaWxkO1xuXG5cdC8vIFRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiBmb3IgdGhlIG5ldyBzdWJjbGFzcyBpcyBlaXRoZXIgZGVmaW5lZCBieSB5b3Vcblx0Ly8gKHRoZSBcImNvbnN0cnVjdG9yXCIgcHJvcGVydHkgaW4geW91ciBgZXh0ZW5kYCBkZWZpbml0aW9uKSwgb3IgZGVmYXVsdGVkXG5cdC8vIGJ5IHVzIHRvIHNpbXBseSBjYWxsIHRoZSBwYXJlbnQncyBjb25zdHJ1Y3Rvci5cblx0aWYgKHByb3RvUHJvcHMgJiYgXy5oYXMocHJvdG9Qcm9wcywgJ2NvbnN0cnVjdG9yJykpIHtcblx0XHRjaGlsZCA9IHByb3RvUHJvcHMuY29uc3RydWN0b3I7XG5cdH0gZWxzZSB7XG5cdFx0Y2hpbGQgPSBmdW5jdGlvbigpeyByZXR1cm4gcGFyZW50LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7IH07XG5cdH1cblxuXHQvLyBBZGQgc3RhdGljIHByb3BlcnRpZXMgdG8gdGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLCBpZiBzdXBwbGllZC5cblx0Xy5leHRlbmQoY2hpbGQsIHBhcmVudCwgc3RhdGljUHJvcHMpO1xuXG5cdC8vIFNldCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIGluaGVyaXQgZnJvbSBgcGFyZW50YCwgd2l0aG91dCBjYWxsaW5nXG5cdC8vIGBwYXJlbnRgJ3MgY29uc3RydWN0b3IgZnVuY3Rpb24uXG5cdHZhciBTdXJyb2dhdGUgPSBmdW5jdGlvbigpeyB0aGlzLmNvbnN0cnVjdG9yID0gY2hpbGQ7IH07XG5cdFN1cnJvZ2F0ZS5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuXHRjaGlsZC5wcm90b3R5cGUgPSBuZXcgU3Vycm9nYXRlO1xuXG5cdC8vIEFkZCBwcm90b3R5cGUgcHJvcGVydGllcyAoaW5zdGFuY2UgcHJvcGVydGllcykgdG8gdGhlIHN1YmNsYXNzLFxuXHQvLyBpZiBzdXBwbGllZC5cblx0aWYgKHByb3RvUHJvcHMpIF8uZXh0ZW5kKGNoaWxkLnByb3RvdHlwZSwgcHJvdG9Qcm9wcyk7XG5cblx0Ly8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZFxuXHQvLyBsYXRlci5cblx0Y2hpbGQuX19zdXBlcl9fID0gcGFyZW50LnByb3RvdHlwZTtcblxuXHRyZXR1cm4gY2hpbGQ7XG59XG5cbnZhciBtYXRjaGVzU2VsZWN0b3IgPSB0eXBlb2YgRWxlbWVudCAhPT0gXCJ1bmRlZmluZWRcIiA/XG5cdEVsZW1lbnQucHJvdG90eXBlLm1hdGNoZXMgfHxcblx0RWxlbWVudC5wcm90b3R5cGUud2Via2l0TWF0Y2hlc1NlbGVjdG9yIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLm1vek1hdGNoZXNTZWxlY3RvciB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS5tc01hdGNoZXNTZWxlY3RvciA6XG5cdGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH07XG5cbmV4cG9ydHMubWF0Y2hlc1NlbGVjdG9yID0gZnVuY3Rpb24oZWxlbSwgc2VsZWN0b3IpIHtcblx0cmV0dXJuIG1hdGNoZXNTZWxlY3Rvci5jYWxsKGVsZW0sIHNlbGVjdG9yKVxufVxuXG52YXIgbWF0Y2hlcyA9IGV4cG9ydHMubWF0Y2hlcyA9IGZ1bmN0aW9uKG5vZGUsIHNlbGVjdG9yKSB7XG5cdGlmIChfLmlzQXJyYXkoc2VsZWN0b3IpKSByZXR1cm4gc2VsZWN0b3Iuc29tZShmdW5jdGlvbihzKSB7XG5cdFx0cmV0dXJuIG1hdGNoZXMobm9kZSwgcyk7XG5cdH0pO1xuXG5cdGlmIChzZWxlY3RvciBpbnN0YW5jZW9mIHdpbmRvdy5Ob2RlKSB7XG5cdFx0cmV0dXJuIG5vZGUgPT09IHNlbGVjdG9yO1xuXHR9XG5cdFxuXHRpZiAodHlwZW9mIHNlbGVjdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRyZXR1cm4gISFzZWxlY3Rvcihub2RlKTtcblx0fVxuXHRcblx0aWYgKG5vZGUubm9kZVR5cGUgPT09IHdpbmRvdy5Ob2RlLkVMRU1FTlRfTk9ERSkge1xuXHRcdHJldHVybiBtYXRjaGVzU2VsZWN0b3IuY2FsbChub2RlLCBzZWxlY3Rvcik7XG5cdH1cblxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8vIGFycmF5IHdyaXRlIG9wZXJhdGlvbnNcbnZhciBtdXRhdG9yTWV0aG9kcyA9IFsgJ3BvcCcsICdwdXNoJywgJ3JldmVyc2UnLCAnc2hpZnQnLCAnc29ydCcsICdzcGxpY2UnLCAndW5zaGlmdCcgXTtcblxuLy8gcGF0Y2hlcyBhbiBhcnJheSBzbyB3ZSBjYW4gbGlzdGVuIHRvIHdyaXRlIG9wZXJhdGlvbnNcbnZhciBwYXRjaEFycmF5ID1cbmV4cG9ydHMucGF0Y2hBcnJheSA9IGZ1bmN0aW9uKGFycikge1xuXHRpZiAoYXJyLl9wYXRjaGVkKSByZXR1cm4gYXJyO1xuXHRcblx0dmFyIHBhdGNoZWRBcnJheVByb3RvID0gW10sXG5cdFx0b2JzZXJ2ZXJzID0gW107XG5cblx0bXV0YXRvck1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHBhdGNoZWRBcnJheVByb3RvLCBtZXRob2ROYW1lLCB7XG5cdFx0XHR2YWx1ZTogbWV0aG9kXG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiBtZXRob2QoKSB7XG5cdFx0XHR2YXIgc3BsaWNlRXF1aXZhbGVudCwgc3VtbWFyeSwgYXJncywgcmVzO1xuXG5cdFx0XHRhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyk7XG5cblx0XHRcdC8vIGNvbnZlcnQgdGhlIG9wZXJhdGlvbiBpbnRvIGEgc3BsaWNlXG5cdFx0XHRzcGxpY2VFcXVpdmFsZW50ID0gZ2V0U3BsaWNlRXF1aXZhbGVudCh0aGlzLCBtZXRob2ROYW1lLCBhcmdzKTtcblx0XHRcdHN1bW1hcnkgPSBzdW1tYXJpc2VTcGxpY2VPcGVyYXRpb24odGhpcywgc3BsaWNlRXF1aXZhbGVudCk7XG5cblx0XHRcdC8vIHJ1biB0aGUgaW50ZW5kZWQgbWV0aG9kXG5cdFx0XHRyZXMgPSBBcnJheS5wcm90b3R5cGVbbWV0aG9kTmFtZV0uYXBwbHkodGhpcywgYXJncyk7XG5cblx0XHRcdC8vIGNhbGwgdGhlIG9iZXJzdnNlcnNcblx0XHRcdG9ic2VydmVycy5mb3JFYWNoKGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRcdGZuLmNhbGwodGhpcywgc3VtbWFyeSk7XG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0Ly8gcmV0dXJuIHRoZSByZXN1bHQgb2YgdGhlIG1ldGhvZFxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9O1xuXHR9KTtcblxuXHRpZiAoKHt9KS5fX3Byb3RvX18pIGFyci5fX3Byb3RvX18gPSBwYXRjaGVkQXJyYXlQcm90bztcblx0ZWxzZSB7XG5cdFx0bXV0YXRvck1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoYXJyLCBtZXRob2ROYW1lLCB7XG5cdFx0XHRcdHZhbHVlOiBwYXRjaGVkQXJyYXlQcm90b1ttZXRob2ROYW1lXSxcblx0XHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdF8uZWFjaCh7XG5cdFx0X3BhdGNoZWQ6IHRydWUsXG5cdFx0b2JzZXJ2ZTogZnVuY3Rpb24oZm4pIHtcblx0XHRcdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIHRvIG9ic2VydmUgd2l0aC5cIik7XG5cdFx0XHRvYnNlcnZlcnMucHVzaChmbik7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXHRcdHN0b3BPYnNlcnZpbmc6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHR2YXIgaW5kZXggPSBvYnNlcnZlcnMuaW5kZXhPZihmbik7XG5cdFx0XHRpZiAoaW5kZXggPiAtMSkgb2JzZXJ2ZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdH0sIGZ1bmN0aW9uKHYsIGspIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoYXJyLCBrLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0XHR2YWx1ZTogdixcblx0XHRcdHdyaXRlYWJsZTogZmFsc2Vcblx0XHR9KTtcblx0fSk7XG5cblx0cmV0dXJuIGFycjtcbn1cblxuLy8gY29udmVydHMgYXJyYXkgd3JpdGUgb3BlcmF0aW9ucyBpbnRvIHNwbGljZSBlcXVpdmFsZW50IGFyZ3VtZW50c1xudmFyIGdldFNwbGljZUVxdWl2YWxlbnQgPVxuZXhwb3J0cy5nZXRTcGxpY2VFcXVpdmFsZW50ID0gZnVuY3Rpb24gKCBhcnJheSwgbWV0aG9kTmFtZSwgYXJncyApIHtcblx0c3dpdGNoICggbWV0aG9kTmFtZSApIHtcblx0XHRjYXNlICdzcGxpY2UnOlxuXHRcdFx0cmV0dXJuIGFyZ3M7XG5cblx0XHRjYXNlICdzb3J0Jzpcblx0XHRjYXNlICdyZXZlcnNlJzpcblx0XHRcdHJldHVybiBudWxsO1xuXG5cdFx0Y2FzZSAncG9wJzpcblx0XHRcdGlmICggYXJyYXkubGVuZ3RoICkge1xuXHRcdFx0XHRyZXR1cm4gWyAtMSBdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cblx0XHRjYXNlICdwdXNoJzpcblx0XHRcdHJldHVybiBbIGFycmF5Lmxlbmd0aCwgMCBdLmNvbmNhdCggYXJncyApO1xuXG5cdFx0Y2FzZSAnc2hpZnQnOlxuXHRcdFx0cmV0dXJuIFsgMCwgMSBdO1xuXG5cdFx0Y2FzZSAndW5zaGlmdCc6XG5cdFx0XHRyZXR1cm4gWyAwLCAwIF0uY29uY2F0KCBhcmdzICk7XG5cdH1cbn1cblxuLy8gcmV0dXJucyBhIHN1bW1hcnkgcGYgaG93IGFuIGFycmF5IHdpbGwgYmUgY2hhbmdlZCBhZnRlciB0aGUgc3BsaWNlIG9wZXJhdGlvblxudmFyIHN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbiA9XG5leHBvcnRzLnN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICggYXJyYXksIGFyZ3MgKSB7XG5cdHZhciBpbmRleCwgYWRkZWRJdGVtcywgcmVtb3ZlZEl0ZW1zO1xuXG5cdGlmICghYXJncykgcmV0dXJuIG51bGw7XG5cblx0Ly8gZmlndXJlIG91dCB3aGVyZSB0aGUgY2hhbmdlcyBzdGFydGVkLi4uXG5cdGluZGV4ID0gKyggYXJnc1swXSA8IDAgPyBhcnJheS5sZW5ndGggKyBhcmdzWzBdIDogYXJnc1swXSApO1xuXG5cdC8vIC4uLmFuZCBob3cgbWFueSBpdGVtcyB3ZXJlIGFkZGVkIHRvIG9yIHJlbW92ZWQgZnJvbSB0aGUgYXJyYXlcblx0YWRkZWRJdGVtcyA9IE1hdGgubWF4KCAwLCBhcmdzLmxlbmd0aCAtIDIgKTtcblx0cmVtb3ZlZEl0ZW1zID0gKCBhcmdzWzFdICE9PSB1bmRlZmluZWQgPyBhcmdzWzFdIDogYXJyYXkubGVuZ3RoIC0gaW5kZXggKTtcblxuXHQvLyBJdCdzIHBvc3NpYmxlIHRvIGRvIGUuZy4gWyAxLCAyLCAzIF0uc3BsaWNlKCAyLCAyICkgLSBpLmUuIHRoZSBzZWNvbmQgYXJndW1lbnRcblx0Ly8gbWVhbnMgcmVtb3ZpbmcgbW9yZSBpdGVtcyBmcm9tIHRoZSBlbmQgb2YgdGhlIGFycmF5IHRoYW4gdGhlcmUgYXJlLiBJbiB0aGVzZVxuXHQvLyBjYXNlcyB3ZSBuZWVkIHRvIGN1cmIgSmF2YVNjcmlwdCdzIGVudGh1c2lhc20gb3Igd2UnbGwgZ2V0IG91dCBvZiBzeW5jXG5cdHJlbW92ZWRJdGVtcyA9IE1hdGgubWluKCByZW1vdmVkSXRlbXMsIGFycmF5Lmxlbmd0aCAtIGluZGV4ICk7XG5cblx0cmV0dXJuIHtcblx0XHRpbmRleDogaW5kZXgsXG5cdFx0YWRkZWQ6IGFkZGVkSXRlbXMsXG5cdFx0cmVtb3ZlZDogcmVtb3ZlZEl0ZW1zXG5cdH07XG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpLFxuXHRFdmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIiksXG5cdHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpLFxuXHRNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXHRQbHVnaW5zID0gcmVxdWlyZShcIi4vcGx1Z2luc1wiKSxcblx0RE9NUmFuZ2UgPSByZXF1aXJlKFwiLi9kb21yYW5nZVwiKTtcblxudmFyIFZpZXcgPVxubW9kdWxlLmV4cG9ydHMgPSBET01SYW5nZS5leHRlbmQoe1xuXG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihkYXRhLCBvcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHQvLyBmaXJzdCB3ZSBjcmVhdGUgdGhlIGluaXRpYWwgdmlldyBzdGF0ZVxuXHRcdHZhciBzdGF0ZSA9IF8ucmVzdWx0KHRoaXMsIFwiaW5pdGlhbFN0YXRlXCIpIHx8IF8ucmVzdWx0KHRoaXMsIFwiZGVmYXVsdHNcIik7XG5cdFx0aWYgKHR5cGVvZiBzdGF0ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdFx0aWYgKCFNb2RlbC5pc01vZGVsKHN0YXRlKSkge1xuXHRcdFx0XHRzdGF0ZSA9IG5ldyBNb2RlbChzdGF0ZSwgbnVsbCwgb3B0aW9ucy5zdGF0ZSk7XG5cdFx0XHR9XG5cdFx0XHRcblx0XHRcdC8vIHNob3ZlIHN0YXRlIGJldHdlZW4gY29udGV4dHNcblx0XHRcdGlmIChNb2RlbC5pc01vZGVsKGRhdGEpKSB7XG5cdFx0XHRcdHN0YXRlLnBhcmVudCA9IGRhdGEucGFyZW50O1xuXHRcdFx0XHRkYXRhLnBhcmVudCA9IHN0YXRlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhZGQgdG8gdGhlIHN0YWNrIGJlZm9yZSB0aGUgcmVhbCBkYXRhXG5cdFx0XHR0aGlzLmFkZERhdGEoc3RhdGUpO1xuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsID0gc3RhdGU7XG5cblx0XHRcdC8vIHNldHVwIGVhc3ktYWNjZXNzIHN0YXRlIHByb3BlcnR5XG5cdFx0XHRzdGF0ZS5kZWZpbmVEYXRhTGluayh0aGlzLCBcInN0YXRlXCIpO1xuXHRcdH1cblx0XHRcblx0XHQvLyBhZGQgcGFydGlhbHNcblx0XHR0aGlzLl9wYXJ0aWFscyA9IHt9O1xuXHRcdHRoaXMuX2NvbXBvbmVudHMgPSB7fTtcblx0XHR0aGlzLnNldFBhcnRpYWwoXy5leHRlbmQoe30sIG9wdGlvbnMucGFydGlhbHMsIF8ucmVzdWx0KHRoaXMsIFwicGFydGlhbHNcIikpKTtcblxuXHRcdC8vIHNldCB0aGUgcGFzc2VkIGluIGRhdGFcblx0XHRpZiAodHlwZW9mIGRhdGEgIT09IFwidW5kZWZpbmVkXCIpIHRoaXMuYWRkRGF0YShkYXRhLCBvcHRpb25zKTtcblx0XHRcblx0XHQvLyBxdWljayBhY2Nlc3MgdG8gdGhlIHRvcCBtb2RlbCBkYXRhXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIFwiZGF0YVwiLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdFx0dGhpcy5tb2RlbC5fZGVwLmRlcGVuZCgpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5tb2RlbC5kYXRhO1xuXHRcdFx0fSxcblx0XHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuc2V0KHZhbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHQvLyBpbml0aWF0ZSBsaWtlIGEgbm9ybWFsIGRvbSByYW5nZVxuXHRcdERPTVJhbmdlLmNhbGwodGhpcyk7XG5cblx0XHQvLyBpbml0aWFsaXplIHdpdGggb3B0aW9uc1xuXHRcdHRoaXMuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuXHR9LFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKCl7fSxcblxuXHR1c2U6IGZ1bmN0aW9uKHApIHtcblx0XHRyZXR1cm4gUGx1Z2lucy5sb2FkUGx1Z2luKHRoaXMsIHAsIF8udG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpKTtcblx0fSxcblxuXHQvLyBhZGRzIGRhdGEgdG8gdGhlIGN1cnJlbnQgc3RhY2tcblx0YWRkRGF0YTogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdGlmICghTW9kZWwuaXNNb2RlbChkYXRhKSkgZGF0YSA9IG5ldyBNb2RlbChkYXRhLCB0aGlzLm1vZGVsLCBvcHRpb25zKTtcblx0XHR0aGlzLm1vZGVsID0gZGF0YTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBhdHRhY2ggKyBtb3VudFxuXHRwYWludDogZnVuY3Rpb24ocCwgbiwgX2lzTW92ZSwgX2lzUmVwbGFjZSkge1xuXHRcdERPTVJhbmdlLnByb3RvdHlwZS5hdHRhY2guYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRpZiAoIShfaXNNb3ZlIHx8IF9pc1JlcGxhY2UgfHwgdGhpcy5pc01vdW50ZWQoKSkpIHRoaXMubW91bnQoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBhdXRvIHN0b3Agb24gZGV0YWNoXG5cdGRldGFjaDogZnVuY3Rpb24oX2lzUmVwbGFjZSkge1xuXHRcdGlmICghX2lzUmVwbGFjZSkgdGhpcy5zdG9wKCk7XG5cdFx0RE9NUmFuZ2UucHJvdG90eXBlLmRldGFjaC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGF1dG9ydW46IGZ1bmN0aW9uKGZuLCBvbmx5T25BY3RpdmUpIHtcblx0XHR2YXIgY29tcCA9IFRyYWNrci5hdXRvcnVuKGZuLCB0aGlzKTtcblx0XHRpZiAob25seU9uQWN0aXZlICYmICFUcmFja3IuYWN0aXZlKSBjb21wLnN0b3AoKTtcblx0XHRyZXR1cm4gY29tcDtcblx0fSxcblxuXHQvLyBhIGdlbmVyYWxpemVkIHJlYWN0aXZlIHdvcmtmbG93IGhlbHBlclxuXHRtb3VudDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIGFyZ3MgPSBfLnRvQXJyYXkoYXJndW1lbnRzKSwgY29tcDtcblxuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdC8vIHN0b3AgZXhpc3RpbmcgbW91bnRcblx0XHRcdHRoaXMuc3RvcCgpO1xuXG5cdFx0XHQvLyB0aGUgZmlyc3QgZXZlbnQgaW4gdGhlIGN5Y2xlLCBiZWZvcmUgZXZlcnl0aGluZyBlbHNlXG5cdFx0XHR0aGlzLl9tb3VudGluZyA9IHRydWU7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDpiZWZvcmVcIiwgYXJncyk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHQvLyB0aGUgYXV0b3J1biBjb21wdXRhdGlvblxuXHRcdGNvbXAgPSB0aGlzLl9jb21wID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdHRoaXMucmVuZGVyLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwicmVuZGVyXCIsIGFyZ3MsIGNvbXApO1xuXG5cdFx0XHQvLyBhdXRvIGNsZWFuIHVwXG5cdFx0XHRjb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdFx0Ly8gcmVtYWluaW5nIGludmFsaWRhdGUgZXZlbnRzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGVcIiwgYXJncywgY29tcCk7XG5cblx0XHRcdFx0Ly8gZGV0ZWN0IGlmIHRoZSBjb21wdXRhdGlvbiBzdG9wcGVkXG5cdFx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJzdG9wXCIsIGFyZ3MpO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9jb21wO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIHJlbWFpbmluZyBtb3VudCBldmVudHMgaGFwcGVuIGFmdGVyIHRoZSBmaXJzdCByZW5kZXJcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDphZnRlclwiLCBhcmdzLCBjb21wKTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9tb3VudGluZztcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbmRlcjogZnVuY3Rpb24oKXt9LFxuXG5cdGlzTW91bnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuaXNNb3VudGluZygpIHx8IHRoaXMuX2NvbXAgIT0gbnVsbDtcblx0fSxcblxuXHRpc01vdW50aW5nOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9tb3VudGluZztcblx0fSxcblxuXHRnZXRDb21wdXRhdGlvbjogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbXA7XG5cdH0sXG5cblx0aW52YWxpZGF0ZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuaXNNb3VudGVkKCkpIHRoaXMuX2NvbXAuaW52YWxpZGF0ZSgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdG9uSW52YWxpZGF0ZTogZnVuY3Rpb24oZm4pIHtcblx0XHRpZiAodGhpcy5pc01vdW50ZWQoKSkgdGhpcy5fY29tcC5vbkludmFsaWRhdGUoZm4pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHN0b3A6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzTW91bnRlZCgpKSB0aGlzLl9jb21wLnN0b3AoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBzZXRzIHBhcnRpYWwgYnkgbmFtZVxuXHRzZXRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lLCBwYXJ0aWFsKSB7XG5cdFx0aWYgKF8uaXNPYmplY3QobmFtZSkgJiYgcGFydGlhbCA9PSBudWxsKSB7XG5cdFx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24ocCwgbikgeyB0aGlzLnNldFBhcnRpYWwobiwgcCk7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKCFfLmlzU3RyaW5nKG5hbWUpICYmIG5hbWUgIT09IFwiXCIpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgbm9uLWVtcHR5IHN0cmluZyBmb3IgcGFydGlhbCBuYW1lLlwiKTtcblxuXHRcdGlmIChwYXJ0aWFsICE9IG51bGwgJiYgIXV0aWwuaXNTdWJDbGFzcyhWaWV3LCBwYXJ0aWFsKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBWaWV3IHN1YmNsYXNzIG9yIGZ1bmN0aW9uIGZvciBwYXJ0aWFsLlwiKTtcblxuXHRcdGlmIChwYXJ0aWFsID09IG51bGwpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9wYXJ0aWFsc1tuYW1lXTtcblx0XHRcdHBhcnRpYWwgPSB2b2lkIDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwID0gdGhpcy5fZ2V0UGFydGlhbChuYW1lKTtcblx0XHRcdHAudmlldyA9IHBhcnRpYWw7XG5cdFx0XHRwLmRlcC5jaGFuZ2VkKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gZW5zdXJlcyBhIHBhcnRpYWwncyBkZXBlbmRlbmN5IGV4aXN0c1xuXHRfZ2V0UGFydGlhbDogZnVuY3Rpb24obmFtZSkge1xuXHRcdGlmICh0aGlzLl9wYXJ0aWFsc1tuYW1lXSA9PSBudWxsKVxuXHRcdFx0dGhpcy5fcGFydGlhbHNbbmFtZV0gPSB7IGRlcDogbmV3IFRyYWNrci5EZXBlbmRlbmN5KCkgfTtcblxuXHRcdHJldHVybiB0aGlzLl9wYXJ0aWFsc1tuYW1lXTtcblx0fSxcblxuXHQvLyBsb29rcyB0aHJvdWdoIHBhcmVudHMgZm9yIHBhcnRpYWxcblx0ZmluZFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgYyA9IHRoaXMsIHA7XG5cblx0XHR3aGlsZSAoYyAhPSBudWxsKSB7XG5cdFx0XHRpZiAoYy5fZ2V0UGFydGlhbCAhPSBudWxsKSB7XG5cdFx0XHRcdHAgPSBjLl9nZXRQYXJ0aWFsKG5hbWUpO1xuXHRcdFx0XHRwLmRlcC5kZXBlbmQoKTtcblx0XHRcdFx0aWYgKHAudmlldyAhPSBudWxsKSByZXR1cm4gcC52aWV3O1xuXHRcdFx0fVxuXG5cdFx0XHRjID0gYy5wYXJlbnRSYW5nZTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gZ2VuZXJhdGVzIGEgbmV3IGNvbXBvbmVudCBmcm9tIGEgVmlldyBzdWJjbGFzcyBvciBwYXJ0aWFsJ3MgbmFtZVxuXHRyZW5kZXJQYXJ0aWFsOiBmdW5jdGlvbihrbGFzcywgY3R4LCBvcHRpb25zKSB7XG5cdFx0dmFyIGNvbXBzLCBuYW1lO1xuXG5cdFx0Ly8gbG9vayB1cCB0aGUgcGFydGlhbCBieSBuYW1lXG5cdFx0aWYgKHR5cGVvZiBrbGFzcyA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0bmFtZSA9IGtsYXNzO1xuXHRcdFx0a2xhc3MgPSB0aGlzLmZpbmRQYXJ0aWFsKGtsYXNzKTtcblx0XHR9XG5cblx0XHQvLyBjbGFzcyBtdXN0IGJlIGEgdmlld1xuXHRcdGlmICghdXRpbC5pc1N1YkNsYXNzKFZpZXcsIGtsYXNzKSkgcmV0dXJuIG51bGw7XG5cdFx0XG5cdFx0Ly8gbm9ybWFsaXplIGNvbnRleHRcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblxuXHRcdC8vIGNyZWF0ZSBpdCBub24tcmVhY3RpdmVseVxuXHRcdHZhciBjb21wb25lbnQgPSBUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gbmV3IGtsYXNzKGN0eCwgb3B0aW9ucyk7XG5cdFx0fSk7XG5cblx0XHQvLyBhZGQgaXQgdG8gdGhlIGxpc3Rcblx0XHRpZiAobmFtZSkge1xuXHRcdFx0Y29tcHMgPSB0aGlzLl9jb21wb25lbnRzO1xuXHRcdFx0aWYgKGNvbXBzW25hbWVdID09IG51bGwpIGNvbXBzW25hbWVdID0gW107XG5cdFx0XHRjb21wc1tuYW1lXS5wdXNoKGNvbXBvbmVudCk7XG5cblx0XHRcdC8vIGF1dG8gcmVtb3ZlIHdoZW4gdGhlIHBhcnRpYWwgaXMgXCJzdG9wcGVkXCJcblx0XHRcdGNvbXBvbmVudC5vbmNlKFwic3RvcFwiLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0Y29tcHNbbmFtZV0gPSBfLndpdGhvdXQoY29tcHNbbmFtZV0sIGNvbXBvbmVudCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcG9uZW50O1xuXHR9LFxuXG5cdC8vIHJldHVybnMgZmlyc3QgcmVuZGVyZWQgcGFydGlhbCBieSBuYW1lXG5cdGdldENvbXBvbmVudDogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBjb21wcywgY29tcCwgcmVzLCBuLCBpO1xuXG5cdFx0Y29tcHMgPSB0aGlzLl9jb21wb25lbnRzO1xuXHRcdGlmIChjb21wc1tuYW1lXSAhPSBudWxsICYmIGNvbXBzW25hbWVdLmxlbmd0aCkgcmV0dXJuIGNvbXBzW25hbWVdWzBdO1xuXG5cdFx0Zm9yIChuIGluIGNvbXBzKSB7XG5cdFx0XHRmb3IgKGkgaW4gY29tcHNbbl0pIHtcblx0XHRcdFx0Y29tcCA9IGNvbXBzW25dW2ldXG5cdFx0XHRcdGlmICghKGNvbXAgaW5zdGFuY2VvZiBWaWV3KSkgY29udGludWU7XG5cdFx0XHRcdHJlcyA9IGNvbXAuZ2V0Q29tcG9uZW50KG5hbWUpO1xuXHRcdFx0XHRpZiAocmVzICE9IG51bGwpIHJldHVybiByZXM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0Ly8gcmV0dXJucyBhbGwgcmVuZGVyZWQgcGFydGlhbHMgYnkgbmFtZVxuXHRnZXRDb21wb25lbnRzOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0cmV0dXJuIF8ucmVkdWNlKHRoaXMuX2NvbXBvbmVudHMsIGZ1bmN0aW9uKG0sIGNvbXBzLCBuKSB7XG5cdFx0XHRpZiAobiA9PT0gbmFtZSkgbS5wdXNoLmFwcGx5KG0sIGNvbXBzKTtcblx0XHRcdFxuXHRcdFx0Y29tcHMuZm9yRWFjaChmdW5jdGlvbihjKSB7XG5cdFx0XHRcdGlmIChjIGluc3RhbmNlb2YgVmlldykgbS5wdXNoLmFwcGx5KG0sIGMuZ2V0Q29tcG9uZW50cyhuYW1lKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIG07XG5cdFx0fSwgW10pO1xuXHR9XG5cbn0pO1xuXG4vLyBjaGFpbmFibGUgbWV0aG9kcyB0byBwcm94eSB0byBtb2RlbFxuWyBcInNldFwiLCBcInJlZ2lzdGVyUHJveHlcIiBdXG4uZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcblx0Vmlldy5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMubW9kZWxbbWV0aG9kXS5hcHBseSh0aGlzLm1vZGVsLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59KTtcblxuLy8gbWV0aG9kcyB0byBwcm94eSB0byBtb2RlbCB3aGljaCBkb24ndCByZXR1cm4gdGhpc1xuWyBcImdldFwiLCBcImdldExvY2FsXCIsIFwiZ2V0UHJveHlCeVZhbHVlXCIsIFwiZ2V0TW9kZWxBdE9mZnNldFwiLFxuICBcImdldFJvb3RNb2RlbFwiLCBcImZpbmRNb2RlbFwiLCBcImdldEFsbE1vZGVsc1wiXG5dLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG5cdFZpZXcucHJvdG90eXBlW21ldGhvZF0gPSBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbFttZXRob2RdLmFwcGx5KHRoaXMubW9kZWwsIGFyZ3VtZW50cyk7XG5cdH1cbn0pOyIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gdHJ1ZTtcbiAgICB2YXIgY3VycmVudFF1ZXVlO1xuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB2YXIgaSA9IC0xO1xuICAgICAgICB3aGlsZSAoKytpIDwgbGVuKSB7XG4gICAgICAgICAgICBjdXJyZW50UXVldWVbaV0oKTtcbiAgICAgICAgfVxuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG59XG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHF1ZXVlLnB1c2goZnVuKTtcbiAgICBpZiAoIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iL2QwN2ZmOGU5OWNmZGUyMWNmMTEzZGExM2QzNWQzODdiMGVkMzA5YTMvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vKipcbiAqIEBuYW1lc3BhY2UgVHJhY2tyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja3ItcmVsYXRlZCBtZXRob2RzLlxuICovXG52YXIgVHJhY2tyID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hY3RpdmVcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoZXJlIGlzIGEgY3VycmVudCBjb21wdXRhdGlvbiwgbWVhbmluZyB0aGF0IGRlcGVuZGVuY2llcyBvbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgd2lsbCBiZSB0cmFja2VkIGFuZCBwb3RlbnRpYWxseSBjYXVzZSB0aGUgY3VycmVudCBjb21wdXRhdGlvbiB0byBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtCb29sZWFufVxuICovXG5UcmFja3IuYWN0aXZlID0gZmFsc2U7XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY3VycmVudGNvbXB1dGF0aW9uXG5cbi8qKlxuICogQHN1bW1hcnkgVGhlIGN1cnJlbnQgY29tcHV0YXRpb24sIG9yIGBudWxsYCBpZiB0aGVyZSBpc24ndCBvbmUuICBUaGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyB0aGUgW2BUcmFja3IuQ29tcHV0YXRpb25gXSgjdHJhY2tlcl9jb21wdXRhdGlvbikgb2JqZWN0IGNyZWF0ZWQgYnkgdGhlIGlubmVybW9zdCBhY3RpdmUgY2FsbCB0byBgVHJhY2tyLmF1dG9ydW5gLCBhbmQgaXQncyB0aGUgY29tcHV0YXRpb24gdGhhdCBnYWlucyBkZXBlbmRlbmNpZXMgd2hlbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYXJlIGFjY2Vzc2VkLlxuICogQGxvY3VzIENsaWVudFxuICogQHR5cGUge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IG51bGw7XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gYztcblx0VHJhY2tyLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG52YXIgX2RlYnVnRnVuYyA9IGZ1bmN0aW9uICgpIHtcblx0Ly8gV2Ugd2FudCB0aGlzIGNvZGUgdG8gd29yayB3aXRob3V0IE1ldGVvciwgYW5kIGFsc28gd2l0aG91dFxuXHQvLyBcImNvbnNvbGVcIiAod2hpY2ggaXMgdGVjaG5pY2FsbHkgbm9uLXN0YW5kYXJkIGFuZCBtYXkgYmUgbWlzc2luZ1xuXHQvLyBvbiBzb21lIGJyb3dzZXIgd2UgY29tZSBhY3Jvc3MsIGxpa2UgaXQgd2FzIG9uIElFIDcpLlxuXHQvL1xuXHQvLyBMYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5Lig/Pylcblx0cmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG5cdFx0XHRcdFx0KCh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5sb2cgP1xuXHRcdFx0XHRcdCBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuXHRcdFx0XHRcdCBmdW5jdGlvbiAoKSB7fSkpO1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcblx0aWYgKHRocm93Rmlyc3RFcnJvcikge1xuXHRcdHRocm93IGU7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIG1lc3NhZ2VBbmRTdGFjaztcblx0XHRpZiAoZS5zdGFjayAmJiBlLm1lc3NhZ2UpIHtcblx0XHRcdHZhciBpZHggPSBlLnN0YWNrLmluZGV4T2YoZS5tZXNzYWdlKTtcblx0XHRcdGlmIChpZHggPj0gMCAmJiBpZHggPD0gMTApIC8vIGFsbG93IGZvciBcIkVycm9yOiBcIiAoYXQgbGVhc3QgNylcblx0XHRcdFx0bWVzc2FnZUFuZFN0YWNrID0gZS5zdGFjazsgLy8gbWVzc2FnZSBpcyBwYXJ0IG9mIGUuc3RhY2ssIGFzIGluIENocm9tZVxuXHRcdFx0ZWxzZVxuXHRcdFx0XHRtZXNzYWdlQW5kU3RhY2sgPSBlLm1lc3NhZ2UgK1xuXHRcdFx0XHQoZS5zdGFjay5jaGFyQXQoMCkgPT09ICdcXG4nID8gJycgOiAnXFxuJykgKyBlLnN0YWNrOyAvLyBlLmcuIFNhZmFyaVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlQW5kU3RhY2sgPSBlLnN0YWNrIHx8IGUubWVzc2FnZTtcblx0XHR9XG5cdFx0X2RlYnVnRnVuYygpKFwiRXhjZXB0aW9uIGZyb20gVHJhY2tyIFwiICsgZnJvbSArIFwiIGZ1bmN0aW9uOlwiLFxuXHRcdFx0XHRcdFx0XHRcdCBtZXNzYWdlQW5kU3RhY2spO1xuXHR9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcblx0aWYgKCh0eXBlb2YgTWV0ZW9yID09PSAndW5kZWZpbmVkJykgfHwgTWV0ZW9yLmlzQ2xpZW50KSB7XG5cdFx0cmV0dXJuIGY7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdFx0TWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRmLmFwcGx5KG51bGwsIGFyZ3MpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxufTtcblxudmFyIG5leHRJZCA9IDE7XG4vLyBjb21wdXRhdGlvbnMgd2hvc2UgY2FsbGJhY2tzIHdlIHNob3VsZCBjYWxsIGF0IGZsdXNoIHRpbWVcbnZhciBwZW5kaW5nQ29tcHV0YXRpb25zID0gW107XG4vLyBgdHJ1ZWAgaWYgYSBUcmFja3IuZmx1c2ggaXMgc2NoZWR1bGVkLCBvciBpZiB3ZSBhcmUgaW4gVHJhY2tyLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgaW5GbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lXG4vLyBvciByZWNvbXB1dGUuICBUaGlzIG1hdGNoZXMgVHJhY2tyLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZVxuLy8gVHJhY2tyLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBUcmFja3IuZmx1c2ggdGhhdCB3ZSBhcmUgaW4uIFdoZW4gc2V0LCB0aHJvdyByYXRoZXIgdGhhbiBsb2cgdGhlXG4vLyBmaXJzdCBlcnJvciBlbmNvdW50ZXJlZCB3aGlsZSBmbHVzaGluZy4gQmVmb3JlIHRocm93aW5nIHRoZSBlcnJvcixcbi8vIGZpbmlzaCBmbHVzaGluZyAoZnJvbSBhIGZpbmFsbHkgYmxvY2spLCBsb2dnaW5nIGFueSBzdWJzZXF1ZW50XG4vLyBlcnJvcnMuXG52YXIgdGhyb3dGaXJzdEVycm9yID0gZmFsc2U7XG5cbnZhciBhZnRlckZsdXNoQ2FsbGJhY2tzID0gW107XG5cbi8vIGxvb2sgZm9yIGEgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGFzIHRoYXQgaXMgcHJlZmVyYWJsZSBvdmVyIG5leHRUaWNrIG9yIHNldEltbWVkaWF0ZVxudmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgP1xuXHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG5cdHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcblx0d2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuXHR3aW5kb3cub1JlcXVlc3RBbmltYXRpb25GcmFtZSA6XG5cdG51bGw7XG5cbi8vIGNvbnRyb2xzIHRoZSBkZWZlcnJhbFxuVHJhY2tyLm5leHRUaWNrID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lICE9IG51bGwgPyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUuYmluZCh3aW5kb3cpIDpcblx0dHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgPyBwcm9jZXNzLm5leHRUaWNrIDpcblx0ZnVuY3Rpb24gKGYpIHsgc2V0VGltZW91dChmLCAxNik7IH07XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG5cdGlmICghIHdpbGxGbHVzaCkge1xuXHRcdFRyYWNrci5uZXh0VGljayhUcmFja3IuZmx1c2gpO1xuXHRcdHdpbGxGbHVzaCA9IHRydWU7XG5cdH1cbn07XG5cbi8vIFRyYWNrci5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyB2aXNpYmxlIGJ1dCBwcml2YXRlXG4vLyAodGhyb3dzIGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gY2FsbCBpdClcbnZhciBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9jb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IEEgQ29tcHV0YXRpb24gb2JqZWN0IHJlcHJlc2VudHMgY29kZSB0aGF0IGlzIHJlcGVhdGVkbHkgcmVydW5cbiAqIGluIHJlc3BvbnNlIHRvXG4gKiByZWFjdGl2ZSBkYXRhIGNoYW5nZXMuIENvbXB1dGF0aW9ucyBkb24ndCBoYXZlIHJldHVybiB2YWx1ZXM7IHRoZXkganVzdFxuICogcGVyZm9ybSBhY3Rpb25zLCBzdWNoIGFzIHJlcmVuZGVyaW5nIGEgdGVtcGxhdGUgb24gdGhlIHNjcmVlbi4gQ29tcHV0YXRpb25zXG4gKiBhcmUgY3JlYXRlZCB1c2luZyBUcmFja3IuYXV0b3J1bi4gVXNlIHN0b3AgdG8gcHJldmVudCBmdXJ0aGVyIHJlcnVubmluZyBvZiBhXG4gKiBjb21wdXRhdGlvbi5cbiAqIEBpbnN0YW5jZW5hbWUgY29tcHV0YXRpb25cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGYsIHBhcmVudCwgY3R4KSB7XG5cdGlmICghIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uKVxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFwiVHJhY2tyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBUcmFja3IuYXV0b3J1blwiKTtcblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cblx0ICogQGxvY3VzIENsaWVudFxuXHQgKiBAbWVtYmVyT2YgVHJhY2tyLkNvbXB1dGF0aW9uXG5cdCAqIEBpbnN0YW5jZVxuXHQgKiBAbmFtZSAgc3RvcHBlZFxuXHQgKi9cblx0c2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIGludmFsaWRhdGVkXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrci5hdXRvcnVuYCBpcyBjYWxsZWQsIGFuZCBmYWxzZSBvbiBzdWJzZXF1ZW50IHJlcnVucyBhbmQgYXQgb3RoZXIgdGltZXMuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIGZpcnN0UnVuXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5maXJzdFJ1biA9IHRydWU7XG5cblx0c2VsZi5faWQgPSBuZXh0SWQrKztcblx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG5cdC8vIHRoZSBwbGFuIGlzIGF0IHNvbWUgcG9pbnQgdG8gdXNlIHRoZSBwYXJlbnQgcmVsYXRpb25cblx0Ly8gdG8gY29uc3RyYWluIHRoZSBvcmRlciB0aGF0IGNvbXB1dGF0aW9ucyBhcmUgcHJvY2Vzc2VkXG5cdHNlbGYuX3BhcmVudCA9IHBhcmVudDtcblx0c2VsZi5fZnVuYyA9IGY7XG5cdHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cdHNlbGYuX2NvbnRleHQgPSBjdHggfHwgbnVsbDtcblxuXHR2YXIgZXJyb3JlZCA9IHRydWU7XG5cdHRyeSB7XG5cdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdGVycm9yZWQgPSBmYWxzZTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0aWYgKGVycm9yZWQpXG5cdFx0XHRzZWxmLnN0b3AoKTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLiAgVGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gaW52YWxpZGF0aW9uLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBpbnZhbGlkYXRlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCAhPT0gdm9pZCAwID8gY3R4IDogc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlcyB0aGlzIGNvbXB1dGF0aW9uIHNvIHRoYXQgaXQgd2lsbCBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHQvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG5cdFx0Ly8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG5cdFx0aWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcblx0XHRcdHJlcXVpcmVGbHVzaCgpO1xuXHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuXHRcdH1cblxuXHRcdHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2Vcblx0XHQvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4ICE9PSB2b2lkIDAgPyBmLmN0eCA6IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5cbi8qKlxuICogQHN1bW1hcnkgUHJldmVudHMgdGhpcyBjb21wdXRhdGlvbiBmcm9tIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoISB0aGlzLnN0b3BwZWQpIHtcblx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXHRcdHRoaXMuaW52YWxpZGF0ZSgpO1xuXHR9XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG5cdHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcblx0aW5Db21wdXRlID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0XHRpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fcmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0c2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuXHR0cnkge1xuXHRcdHdoaWxlIChzZWxmLmludmFsaWRhdGVkICYmICEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZWxmLl9jb21wdXRlKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgX2NvbXB1dGUoKSBpbnZhbGlkYXRlZCB1cywgd2UgcnVuIGFnYWluIGltbWVkaWF0ZWx5LlxuXHRcdFx0Ly8gQSBjb21wdXRhdGlvbiB0aGF0IGludmFsaWRhdGVzIGl0c2VsZiBpbmRlZmluaXRlbHkgaXMgYW5cblx0XHRcdC8vIGluZmluaXRlIGxvb3AsIG9mIGNvdXJzZS5cblx0XHRcdC8vXG5cdFx0XHQvLyBXZSBjb3VsZCBwdXQgYW4gaXRlcmF0aW9uIGNvdW50ZXIgaGVyZSBhbmQgY2F0Y2ggcnVuLWF3YXlcblx0XHRcdC8vIGxvb3BzLlxuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHR9XG59O1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9kZXBlbmRlbmN5XG5cbi8qKlxuICogQHN1bW1hcnkgQSBEZXBlbmRlbmN5IHJlcHJlc2VudHMgYW4gYXRvbWljIHVuaXQgb2YgcmVhY3RpdmUgZGF0YSB0aGF0IGFcbiAqIGNvbXB1dGF0aW9uIG1pZ2h0IGRlcGVuZCBvbi4gUmVhY3RpdmUgZGF0YSBzb3VyY2VzIHN1Y2ggYXMgU2Vzc2lvbiBvclxuICogTWluaW1vbmdvIGludGVybmFsbHkgY3JlYXRlIGRpZmZlcmVudCBEZXBlbmRlbmN5IG9iamVjdHMgZm9yIGRpZmZlcmVudFxuICogcGllY2VzIG9mIGRhdGEsIGVhY2ggb2Ygd2hpY2ggbWF5IGJlIGRlcGVuZGVkIG9uIGJ5IG11bHRpcGxlIGNvbXB1dGF0aW9ucy5cbiAqIFdoZW4gdGhlIGRhdGEgY2hhbmdlcywgdGhlIGNvbXB1dGF0aW9ucyBhcmUgaW52YWxpZGF0ZWQuXG4gKiBAY2xhc3NcbiAqIEBpbnN0YW5jZU5hbWUgZGVwZW5kZW5jeVxuICovXG5UcmFja3IuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4vL1xuLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4vLyBwcmVzZW50LiAgUmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4vLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbi8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cblxuLyoqXG4gKiBAc3VtbWFyeSBEZWNsYXJlcyB0aGF0IHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIChvciBgZnJvbUNvbXB1dGF0aW9uYCBpZiBnaXZlbikgZGVwZW5kcyBvbiBgZGVwZW5kZW5jeWAuICBUaGUgY29tcHV0YXRpb24gd2lsbCBiZSBpbnZhbGlkYXRlZCB0aGUgbmV4dCB0aW1lIGBkZXBlbmRlbmN5YCBjaGFuZ2VzLlxuXG5JZiB0aGVyZSBpcyBubyBjdXJyZW50IGNvbXB1dGF0aW9uIGFuZCBgZGVwZW5kKClgIGlzIGNhbGxlZCB3aXRoIG5vIGFyZ3VtZW50cywgaXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zIGZhbHNlLlxuXG5SZXR1cm5zIHRydWUgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGEgbmV3IGRlcGVuZGVudCBvZiBgZGVwZW5kZW5jeWAgcmF0aGVyIHRoYW4gYW4gZXhpc3Rpbmcgb25lLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb259IFtmcm9tQ29tcHV0YXRpb25dIEFuIG9wdGlvbmFsIGNvbXB1dGF0aW9uIGRlY2xhcmVkIHRvIGRlcGVuZCBvbiBgZGVwZW5kZW5jeWAgaW5zdGVhZCBvZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbi5cbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24gKGNvbXB1dGF0aW9uKSB7XG5cdGlmICghIGNvbXB1dGF0aW9uKSB7XG5cdFx0aWYgKCEgVHJhY2tyLmFjdGl2ZSlcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdGNvbXB1dGF0aW9uID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0fVxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcblx0aWYgKCEgKGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKSkge1xuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXSA9IGNvbXB1dGF0aW9uO1xuXHRcdGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRkZWxldGUgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfY2hhbmdlZFxuXG4vKipcbiAqIEBzdW1tYXJ5IEludmFsaWRhdGUgYWxsIGRlcGVuZGVudCBjb21wdXRhdGlvbnMgaW1tZWRpYXRlbHkgYW5kIHJlbW92ZSB0aGVtIGFzIGRlcGVuZGVudHMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvciAodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2hhc2RlcGVuZGVudHNcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgRGVwZW5kZW5jeSBoYXMgb25lIG9yIG1vcmUgZGVwZW5kZW50IENvbXB1dGF0aW9ucywgd2hpY2ggd291bGQgYmUgaW52YWxpZGF0ZWQgaWYgdGhpcyBEZXBlbmRlbmN5IHdlcmUgdG8gY2hhbmdlLlxuICogQGxvY3VzIENsaWVudFxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5oYXNEZXBlbmRlbnRzID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0cmV0dXJuIHRydWU7XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZmx1c2hcblxuLyoqXG4gKiBAc3VtbWFyeSBQcm9jZXNzIGFsbCByZWFjdGl2ZSB1cGRhdGVzIGltbWVkaWF0ZWx5IGFuZCBlbnN1cmUgdGhhdCBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGFyZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLmZsdXNoID0gZnVuY3Rpb24gKF9vcHRzKSB7XG5cdC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuXHQvLyBoYXZlIFNwYXJrKVxuXHQvL1xuXHQvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuXHQvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG5cdC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tyLmZsdXNoLiAgQXQgdGhlIG1vbWVudFxuXHQvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG5cdC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLiAgQW5kIHdlIGRvbid0IGhhdmVcblx0Ly8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG5cdC8vXG5cdC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcblx0aWYgKGluRmx1c2gpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja3IuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cblx0aWYgKGluQ29tcHV0ZSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tyLmF1dG9ydW5cIik7XG5cblx0aW5GbHVzaCA9IHRydWU7XG5cdHdpbGxGbHVzaCA9IHRydWU7XG5cdHRocm93Rmlyc3RFcnJvciA9ICEhIChfb3B0cyAmJiBfb3B0cy5fdGhyb3dGaXJzdEVycm9yKTtcblxuXHR2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcblx0XHRcdFx0XHQgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuXHRcdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHRjb21wLl9yZWNvbXB1dGUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuXHRcdFx0XHQvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG5cdFx0XHRcdHZhciBjYiA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjYi5mbi5jYWxsKGNiLmN0eCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRfdGhyb3dPckxvZyhcImFmdGVyRmx1c2hcIiwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmICghIGZpbmlzaGVkVHJ5KSB7XG5cdFx0XHQvLyB3ZSdyZSBlcnJvcmluZ1xuXHRcdFx0aW5GbHVzaCA9IGZhbHNlOyAvLyBuZWVkZWQgYmVmb3JlIGNhbGxpbmcgYFRyYWNrci5mbHVzaCgpYCBhZ2FpblxuXHRcdFx0VHJhY2tyLmZsdXNoKHtfdGhyb3dGaXJzdEVycm9yOiBmYWxzZX0pOyAvLyBmaW5pc2ggZmx1c2hpbmdcblx0XHR9XG5cdFx0d2lsbEZsdXNoID0gZmFsc2U7XG5cdFx0aW5GbHVzaCA9IGZhbHNlO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2F1dG9ydW5cbi8vXG4vLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4vLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuLy9cbi8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4vL1xuLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4vLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gbm93IGFuZCByZXJ1biBpdCBsYXRlciB3aGVuZXZlciBpdHMgZGVwZW5kZW5jaWVzIGNoYW5nZS4gUmV0dXJucyBhIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IGNhbiBiZSB1c2VkIHRvIHN0b3Agb3Igb2JzZXJ2ZSB0aGUgcmVydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlcyBvbmUgYXJndW1lbnQ6IHRoZSBDb21wdXRhdGlvbiBvYmplY3QgdGhhdCB3aWxsIGJlIHJldHVybmVkLlxuICogQHJldHVybnMge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyYWNrci5hdXRvcnVuIHJlcXVpcmVzIGEgZnVuY3Rpb24gYXJndW1lbnQnKTtcblxuXHRjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IHRydWU7XG5cdHZhciBjID0gbmV3IFRyYWNrci5Db21wdXRhdGlvbihmLCBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLCBjdHgpO1xuXG5cdGlmIChUcmFja3IuYWN0aXZlKVxuXHRcdFRyYWNrci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuXHRcdFx0Yy5zdG9wKCk7XG5cdFx0fSk7XG5cblx0cmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuICBVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIHdpdGhvdXQgdHJhY2tpbmcgZGVwZW5kZW5jaWVzLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBBIGZ1bmN0aW9uIHRvIGNhbGwgaW1tZWRpYXRlbHkuXG4gKi9cblRyYWNrci5ub25SZWFjdGl2ZSA9IFxuVHJhY2tyLm5vbnJlYWN0aXZlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24obnVsbCk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGYuY2FsbChjdHgpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG5cdH1cbn07XG5cbi8vIGxpa2Ugbm9ucmVhY3RpdmUgYnV0IG1ha2VzIGEgZnVuY3Rpb24gaW5zdGVhZFxuVHJhY2tyLm5vblJlYWN0YWJsZSA9IFxuVHJhY2tyLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGYuYXBwbHkoY3R4LCBhcmdzKTtcblx0XHR9KTtcblx0fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IFtgb25JbnZhbGlkYXRlYF0oI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZSkgY2FsbGJhY2sgb24gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKHdoaWNoIG11c3QgZXhpc3QpLCB0byBiZSBjYWxsZWQgaW1tZWRpYXRlbHkgd2hlbiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZCBvciBzdG9wcGVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgaW52b2tlZCBhcyBgZnVuYyhjKWAsIHdoZXJlIGBjYCBpcyB0aGUgY29tcHV0YXRpb24gb24gd2hpY2ggdGhlIGNhbGxiYWNrIGlzIHJlZ2lzdGVyZWQuXG4gKi9cblRyYWNrci5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVHJhY2tyLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hZnRlcmZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgU2NoZWR1bGVzIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGR1cmluZyB0aGUgbmV4dCBmbHVzaCwgb3IgbGF0ZXIgaW4gdGhlIGN1cnJlbnQgZmx1c2ggaWYgb25lIGlzIGluIHByb2dyZXNzLCBhZnRlciBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGhhdmUgYmVlbiByZXJ1bi4gIFRoZSBmdW5jdGlvbiB3aWxsIGJlIHJ1biBvbmNlIGFuZCBub3Qgb24gc3Vic2VxdWVudCBmbHVzaGVzIHVubGVzcyBgYWZ0ZXJGbHVzaGAgaXMgY2FsbGVkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBjYWxsIGF0IGZsdXNoIHRpbWUuXG4gKi9cblRyYWNrci5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdHJlcXVpcmVGbHVzaCgpO1xufTtcbn0pLmNhbGwodGhpcyxyZXF1aXJlKCdfcHJvY2VzcycpKVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZGF0YTphcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ6dXRmLTg7YmFzZTY0LGV5SjJaWEp6YVc5dUlqb3pMQ0p6YjNWeVkyVnpJanBiSW01dlpHVmZiVzlrZFd4bGN5OTBjbUZqYTNJdmRISmhZMnR5TG1weklsMHNJbTVoYldWeklqcGJYU3dpYldGd2NHbHVaM01pT2lJN1FVRkJRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVNJc0ltWnBiR1VpT2lKblpXNWxjbUYwWldRdWFuTWlMQ0p6YjNWeVkyVlNiMjkwSWpvaUlpd2ljMjkxY21ObGMwTnZiblJsYm5RaU9sc2lMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk5Y2JpOHZJRkJoWTJ0aFoyVWdaRzlqY3lCaGRDQm9kSFJ3T2k4dlpHOWpjeTV0WlhSbGIzSXVZMjl0THlOMGNtRmphMlZ5SUM4dlhHNHZMeUJNWVhOMElHMWxjbWRsT2lCb2RIUndjem92TDJkcGRHaDFZaTVqYjIwdmJXVjBaVzl5TDIxbGRHVnZjaTlpYkc5aUwyUXdOMlptT0dVNU9XTm1aR1V5TVdObU1URXpaR0V4TTJRek5XUXpPRGRpTUdWa016QTVZVE12Y0dGamEyRm5aWE12ZEhKaFkydGxjaTkwY21GamEyVnlMbXB6SUM4dlhHNHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2TDF4dVhHNHZLaXBjYmlBcUlFQnVZVzFsYzNCaFkyVWdWSEpoWTJ0eVhHNGdLaUJBYzNWdGJXRnllU0JVYUdVZ2JtRnRaWE53WVdObElHWnZjaUJVY21GamEzSXRjbVZzWVhSbFpDQnRaWFJvYjJSekxseHVJQ292WEc1MllYSWdWSEpoWTJ0eUlEMGdiVzlrZFd4bExtVjRjRzl5ZEhNZ1BTQjdmVHRjYmx4dUx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4amRISmhZMnRsY2w5aFkzUnBkbVZjYmx4dUx5b3FYRzRnS2lCQWMzVnRiV0Z5ZVNCVWNuVmxJR2xtSUhSb1pYSmxJR2x6SUdFZ1kzVnljbVZ1ZENCamIyMXdkWFJoZEdsdmJpd2diV1ZoYm1sdVp5QjBhR0YwSUdSbGNHVnVaR1Z1WTJsbGN5QnZiaUJ5WldGamRHbDJaU0JrWVhSaElITnZkWEpqWlhNZ2QybHNiQ0JpWlNCMGNtRmphMlZrSUdGdVpDQndiM1JsYm5ScFlXeHNlU0JqWVhWelpTQjBhR1VnWTNWeWNtVnVkQ0JqYjIxd2RYUmhkR2x2YmlCMGJ5QmlaU0J5WlhKMWJpNWNiaUFxSUVCc2IyTjFjeUJEYkdsbGJuUmNiaUFxSUVCMGVYQmxJSHRDYjI5c1pXRnVmVnh1SUNvdlhHNVVjbUZqYTNJdVlXTjBhWFpsSUQwZ1ptRnNjMlU3WEc1Y2JpOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkzUnlZV05yWlhKZlkzVnljbVZ1ZEdOdmJYQjFkR0YwYVc5dVhHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dWR2hsSUdOMWNuSmxiblFnWTI5dGNIVjBZWFJwYjI0c0lHOXlJR0J1ZFd4c1lDQnBaaUIwYUdWeVpTQnBjMjRuZENCdmJtVXVJQ0JVYUdVZ1kzVnljbVZ1ZENCamIyMXdkWFJoZEdsdmJpQnBjeUIwYUdVZ1cyQlVjbUZqYTNJdVEyOXRjSFYwWVhScGIyNWdYU2dqZEhKaFkydGxjbDlqYjIxd2RYUmhkR2x2YmlrZ2IySnFaV04wSUdOeVpXRjBaV1FnWW5rZ2RHaGxJR2x1Ym1WeWJXOXpkQ0JoWTNScGRtVWdZMkZzYkNCMGJ5QmdWSEpoWTJ0eUxtRjFkRzl5ZFc1Z0xDQmhibVFnYVhRbmN5QjBhR1VnWTI5dGNIVjBZWFJwYjI0Z2RHaGhkQ0JuWVdsdWN5QmtaWEJsYm1SbGJtTnBaWE1nZDJobGJpQnlaV0ZqZEdsMlpTQmtZWFJoSUhOdmRYSmpaWE1nWVhKbElHRmpZMlZ6YzJWa0xseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhSNWNHVWdlMVJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZibjFjYmlBcUwxeHVWSEpoWTJ0eUxtTjFjbkpsYm5SRGIyMXdkWFJoZEdsdmJpQTlJRzUxYkd3N1hHNWNiblpoY2lCelpYUkRkWEp5Wlc1MFEyOXRjSFYwWVhScGIyNGdQU0JtZFc1amRHbHZiaUFvWXlrZ2UxeHVYSFJVY21GamEzSXVZM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVJRDBnWXp0Y2JseDBWSEpoWTJ0eUxtRmpkR2wyWlNBOUlDRWhJR003WEc1OU8xeHVYRzUyWVhJZ1gyUmxZblZuUm5WdVl5QTlJR1oxYm1OMGFXOXVJQ2dwSUh0Y2JseDBMeThnVjJVZ2QyRnVkQ0IwYUdseklHTnZaR1VnZEc4Z2QyOXlheUIzYVhSb2IzVjBJRTFsZEdWdmNpd2dZVzVrSUdGc2MyOGdkMmwwYUc5MWRGeHVYSFF2THlCY0ltTnZibk52YkdWY0lpQW9kMmhwWTJnZ2FYTWdkR1ZqYUc1cFkyRnNiSGtnYm05dUxYTjBZVzVrWVhKa0lHRnVaQ0J0WVhrZ1ltVWdiV2x6YzJsdVoxeHVYSFF2THlCdmJpQnpiMjFsSUdKeWIzZHpaWElnZDJVZ1kyOXRaU0JoWTNKdmMzTXNJR3hwYTJVZ2FYUWdkMkZ6SUc5dUlFbEZJRGNwTGx4dVhIUXZMMXh1WEhRdkx5Qk1ZWHA1SUdWMllXeDFZWFJwYjI0Z1ltVmpZWFZ6WlNCZ1RXVjBaVzl5WUNCa2IyVnpJRzV2ZENCbGVHbHpkQ0J5YVdkb2RDQmhkMkY1TGlnL1B5bGNibHgwY21WMGRYSnVJQ2gwZVhCbGIyWWdUV1YwWlc5eUlDRTlQU0JjSW5WdVpHVm1hVzVsWkZ3aUlEOGdUV1YwWlc5eUxsOWtaV0oxWnlBNlhHNWNkRngwWEhSY2RGeDBLQ2gwZVhCbGIyWWdZMjl1YzI5c1pTQWhQVDBnWENKMWJtUmxabWx1WldSY0lpa2dKaVlnWTI5dWMyOXNaUzVzYjJjZ1AxeHVYSFJjZEZ4MFhIUmNkQ0JtZFc1amRHbHZiaUFvS1NCN0lHTnZibk52YkdVdWJHOW5MbUZ3Y0d4NUtHTnZibk52YkdVc0lHRnlaM1Z0Wlc1MGN5azdJSDBnT2x4dVhIUmNkRngwWEhSY2RDQm1kVzVqZEdsdmJpQW9LU0I3ZlNrcE8xeHVmVHRjYmx4dWRtRnlJRjkwYUhKdmQwOXlURzluSUQwZ1puVnVZM1JwYjI0Z0tHWnliMjBzSUdVcElIdGNibHgwYVdZZ0tIUm9jbTkzUm1seWMzUkZjbkp2Y2lrZ2UxeHVYSFJjZEhSb2NtOTNJR1U3WEc1Y2RIMGdaV3h6WlNCN1hHNWNkRngwZG1GeUlHMWxjM05oWjJWQmJtUlRkR0ZqYXp0Y2JseDBYSFJwWmlBb1pTNXpkR0ZqYXlBbUppQmxMbTFsYzNOaFoyVXBJSHRjYmx4MFhIUmNkSFpoY2lCcFpIZ2dQU0JsTG5OMFlXTnJMbWx1WkdWNFQyWW9aUzV0WlhOellXZGxLVHRjYmx4MFhIUmNkR2xtSUNocFpIZ2dQajBnTUNBbUppQnBaSGdnUEQwZ01UQXBJQzh2SUdGc2JHOTNJR1p2Y2lCY0lrVnljbTl5T2lCY0lpQW9ZWFFnYkdWaGMzUWdOeWxjYmx4MFhIUmNkRngwYldWemMyRm5aVUZ1WkZOMFlXTnJJRDBnWlM1emRHRmphenNnTHk4Z2JXVnpjMkZuWlNCcGN5QndZWEowSUc5bUlHVXVjM1JoWTJzc0lHRnpJR2x1SUVOb2NtOXRaVnh1WEhSY2RGeDBaV3h6WlZ4dVhIUmNkRngwWEhSdFpYTnpZV2RsUVc1a1UzUmhZMnNnUFNCbExtMWxjM05oWjJVZ0sxeHVYSFJjZEZ4MFhIUW9aUzV6ZEdGamF5NWphR0Z5UVhRb01Da2dQVDA5SUNkY1hHNG5JRDhnSnljZ09pQW5YRnh1SnlrZ0t5QmxMbk4wWVdOck95QXZMeUJsTG1jdUlGTmhabUZ5YVZ4dVhIUmNkSDBnWld4elpTQjdYRzVjZEZ4MFhIUnRaWE56WVdkbFFXNWtVM1JoWTJzZ1BTQmxMbk4wWVdOcklIeDhJR1V1YldWemMyRm5aVHRjYmx4MFhIUjlYRzVjZEZ4MFgyUmxZblZuUm5WdVl5Z3BLRndpUlhoalpYQjBhVzl1SUdaeWIyMGdWSEpoWTJ0eUlGd2lJQ3NnWm5KdmJTQXJJRndpSUdaMWJtTjBhVzl1T2x3aUxGeHVYSFJjZEZ4MFhIUmNkRngwWEhSY2RDQnRaWE56WVdkbFFXNWtVM1JoWTJzcE8xeHVYSFI5WEc1OU8xeHVYRzR2THlCVVlXdGxjeUJoSUdaMWJtTjBhVzl1SUdCbVlDd2dZVzVrSUhkeVlYQnpJR2wwSUdsdUlHRWdZRTFsZEdWdmNpNWZibTlaYVdWc1pITkJiR3h2ZDJWa1lGeHVMeThnWW14dlkyc2dhV1lnZDJVZ1lYSmxJSEoxYm01cGJtY2diMjRnZEdobElITmxjblpsY2k0Z1QyNGdkR2hsSUdOc2FXVnVkQ3dnY21WMGRYSnVjeUIwYUdWY2JpOHZJRzl5YVdkcGJtRnNJR1oxYm1OMGFXOXVJQ2h6YVc1alpTQmdUV1YwWlc5eUxsOXViMWxwWld4a2MwRnNiRzkzWldSZ0lHbHpJR0ZjYmk4dklHNXZMVzl3S1M0Z1ZHaHBjeUJvWVhNZ2RHaGxJR0psYm1WbWFYUWdiMllnYm05MElHRmtaR2x1WnlCaGJpQjFibTVsWTJWemMyRnllU0J6ZEdGamExeHVMeThnWm5KaGJXVWdiMjRnZEdobElHTnNhV1Z1ZEM1Y2JuWmhjaUIzYVhSb1RtOVphV1ZzWkhOQmJHeHZkMlZrSUQwZ1puVnVZM1JwYjI0Z0tHWXBJSHRjYmx4MGFXWWdLQ2gwZVhCbGIyWWdUV1YwWlc5eUlEMDlQU0FuZFc1a1pXWnBibVZrSnlrZ2ZId2dUV1YwWlc5eUxtbHpRMnhwWlc1MEtTQjdYRzVjZEZ4MGNtVjBkWEp1SUdZN1hHNWNkSDBnWld4elpTQjdYRzVjZEZ4MGNtVjBkWEp1SUdaMWJtTjBhVzl1SUNncElIdGNibHgwWEhSY2RIWmhjaUJoY21keklEMGdZWEpuZFcxbGJuUnpPMXh1WEhSY2RGeDBUV1YwWlc5eUxsOXViMWxwWld4a2MwRnNiRzkzWldRb1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSY2RGeDBYSFJtTG1Gd2NHeDVLRzUxYkd3c0lHRnlaM01wTzF4dVhIUmNkRngwZlNrN1hHNWNkRngwZlR0Y2JseDBmVnh1ZlR0Y2JseHVkbUZ5SUc1bGVIUkpaQ0E5SURFN1hHNHZMeUJqYjIxd2RYUmhkR2x2Ym5NZ2QyaHZjMlVnWTJGc2JHSmhZMnR6SUhkbElITm9iM1ZzWkNCallXeHNJR0YwSUdac2RYTm9JSFJwYldWY2JuWmhjaUJ3Wlc1a2FXNW5RMjl0Y0hWMFlYUnBiMjV6SUQwZ1cxMDdYRzR2THlCZ2RISjFaV0FnYVdZZ1lTQlVjbUZqYTNJdVpteDFjMmdnYVhNZ2MyTm9aV1IxYkdWa0xDQnZjaUJwWmlCM1pTQmhjbVVnYVc0Z1ZISmhZMnR5TG1ac2RYTm9JRzV2ZDF4dWRtRnlJSGRwYkd4R2JIVnphQ0E5SUdaaGJITmxPMXh1THk4Z1lIUnlkV1ZnSUdsbUlIZGxJR0Z5WlNCcGJpQlVjbUZqYTNJdVpteDFjMmdnYm05M1hHNTJZWElnYVc1R2JIVnphQ0E5SUdaaGJITmxPMXh1THk4Z1lIUnlkV1ZnSUdsbUlIZGxJR0Z5WlNCamIyMXdkWFJwYm1jZ1lTQmpiMjF3ZFhSaGRHbHZiaUJ1YjNjc0lHVnBkR2hsY2lCbWFYSnpkQ0IwYVcxbFhHNHZMeUJ2Y2lCeVpXTnZiWEIxZEdVdUlDQlVhR2x6SUcxaGRHTm9aWE1nVkhKaFkydHlMbUZqZEdsMlpTQjFibXhsYzNNZ2QyVWdZWEpsSUdsdWMybGtaVnh1THk4Z1ZISmhZMnR5TG01dmJuSmxZV04wYVhabExDQjNhR2xqYUNCdWRXeHNabWxsY3lCamRYSnlaVzUwUTI5dGNIVjBZWFJwYjI0Z1pYWmxiaUIwYUc5MVoyaGNiaTh2SUdGdUlHVnVZMnh2YzJsdVp5QmpiMjF3ZFhSaGRHbHZiaUJ0WVhrZ2MzUnBiR3dnWW1VZ2NuVnVibWx1Wnk1Y2JuWmhjaUJwYmtOdmJYQjFkR1VnUFNCbVlXeHpaVHRjYmk4dklHQjBjblZsWUNCcFppQjBhR1VnWUY5MGFISnZkMFpwY25OMFJYSnliM0pnSUc5d2RHbHZiaUIzWVhNZ2NHRnpjMlZrSUdsdUlIUnZJSFJvWlNCallXeHNYRzR2THlCMGJ5QlVjbUZqYTNJdVpteDFjMmdnZEdoaGRDQjNaU0JoY21VZ2FXNHVJRmRvWlc0Z2MyVjBMQ0IwYUhKdmR5QnlZWFJvWlhJZ2RHaGhiaUJzYjJjZ2RHaGxYRzR2THlCbWFYSnpkQ0JsY25KdmNpQmxibU52ZFc1MFpYSmxaQ0IzYUdsc1pTQm1iSFZ6YUdsdVp5NGdRbVZtYjNKbElIUm9jbTkzYVc1bklIUm9aU0JsY25KdmNpeGNiaTh2SUdacGJtbHphQ0JtYkhWemFHbHVaeUFvWm5KdmJTQmhJR1pwYm1Gc2JIa2dZbXh2WTJzcExDQnNiMmRuYVc1bklHRnVlU0J6ZFdKelpYRjFaVzUwWEc0dkx5Qmxjbkp2Y25NdVhHNTJZWElnZEdoeWIzZEdhWEp6ZEVWeWNtOXlJRDBnWm1Gc2MyVTdYRzVjYm5aaGNpQmhablJsY2tac2RYTm9RMkZzYkdKaFkydHpJRDBnVzEwN1hHNWNiaTh2SUd4dmIyc2dabTl5SUdFZ2NtVnhkV1Z6ZEVGdWFXMWhkR2x2YmtaeVlXMWxJR0Z6SUhSb1lYUWdhWE1nY0hKbFptVnlZV0pzWlNCdmRtVnlJRzVsZUhSVWFXTnJJRzl5SUhObGRFbHRiV1ZrYVdGMFpWeHVkbUZ5SUhKbGNYVmxjM1JCYm1sdFlYUnBiMjVHY21GdFpTQTlJSFI1Y0dWdlppQjNhVzVrYjNjZ0lUMDlJRndpZFc1a1pXWnBibVZrWENJZ1AxeHVYSFIzYVc1a2IzY3VjbVZ4ZFdWemRFRnVhVzFoZEdsdmJrWnlZVzFsSUh4OFhHNWNkSGRwYm1SdmR5NXRiM3BTWlhGMVpYTjBRVzVwYldGMGFXOXVSbkpoYldVZ2ZIeGNibHgwZDJsdVpHOTNMbmRsWW10cGRGSmxjWFZsYzNSQmJtbHRZWFJwYjI1R2NtRnRaU0I4ZkZ4dVhIUjNhVzVrYjNjdWIxSmxjWFZsYzNSQmJtbHRZWFJwYjI1R2NtRnRaU0E2WEc1Y2RHNTFiR3c3WEc1Y2JpOHZJR052Ym5SeWIyeHpJSFJvWlNCa1pXWmxjbkpoYkZ4dVZISmhZMnR5TG01bGVIUlVhV05ySUQwZ2NtVnhkV1Z6ZEVGdWFXMWhkR2x2YmtaeVlXMWxJQ0U5SUc1MWJHd2dQeUJ5WlhGMVpYTjBRVzVwYldGMGFXOXVSbkpoYldVdVltbHVaQ2gzYVc1a2IzY3BJRHBjYmx4MGRIbHdaVzltSUhCeWIyTmxjM01nSVQwOUlGd2lkVzVrWldacGJtVmtYQ0lnUHlCd2NtOWpaWE56TG01bGVIUlVhV05ySURwY2JseDBablZ1WTNScGIyNGdLR1lwSUhzZ2MyVjBWR2x0Wlc5MWRDaG1MQ0F4TmlrN0lIMDdYRzVjYm5aaGNpQnlaWEYxYVhKbFJteDFjMmdnUFNCbWRXNWpkR2x2YmlBb0tTQjdYRzVjZEdsbUlDZ2hJSGRwYkd4R2JIVnphQ2tnZTF4dVhIUmNkRlJ5WVdOcmNpNXVaWGgwVkdsamF5aFVjbUZqYTNJdVpteDFjMmdwTzF4dVhIUmNkSGRwYkd4R2JIVnphQ0E5SUhSeWRXVTdYRzVjZEgxY2JuMDdYRzVjYmk4dklGUnlZV05yY2k1RGIyMXdkWFJoZEdsdmJpQmpiMjV6ZEhKMVkzUnZjaUJwY3lCMmFYTnBZbXhsSUdKMWRDQndjbWwyWVhSbFhHNHZMeUFvZEdoeWIzZHpJR0Z1SUdWeWNtOXlJR2xtSUhsdmRTQjBjbmtnZEc4Z1kyRnNiQ0JwZENsY2JuWmhjaUJqYjI1emRISjFZM1JwYm1kRGIyMXdkWFJoZEdsdmJpQTlJR1poYkhObE8xeHVYRzR2TDF4dUx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4amRISmhZMnRsY2w5amIyMXdkWFJoZEdsdmJseHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRUVnUTI5dGNIVjBZWFJwYjI0Z2IySnFaV04wSUhKbGNISmxjMlZ1ZEhNZ1kyOWtaU0IwYUdGMElHbHpJSEpsY0dWaGRHVmtiSGtnY21WeWRXNWNiaUFxSUdsdUlISmxjM0J2Ym5ObElIUnZYRzRnS2lCeVpXRmpkR2wyWlNCa1lYUmhJR05vWVc1blpYTXVJRU52YlhCMWRHRjBhVzl1Y3lCa2IyNG5kQ0JvWVhabElISmxkSFZ5YmlCMllXeDFaWE03SUhSb1pYa2dhblZ6ZEZ4dUlDb2djR1Z5Wm05eWJTQmhZM1JwYjI1ekxDQnpkV05vSUdGeklISmxjbVZ1WkdWeWFXNW5JR0VnZEdWdGNHeGhkR1VnYjI0Z2RHaGxJSE5qY21WbGJpNGdRMjl0Y0hWMFlYUnBiMjV6WEc0Z0tpQmhjbVVnWTNKbFlYUmxaQ0IxYzJsdVp5QlVjbUZqYTNJdVlYVjBiM0oxYmk0Z1ZYTmxJSE4wYjNBZ2RHOGdjSEpsZG1WdWRDQm1kWEowYUdWeUlISmxjblZ1Ym1sdVp5QnZaaUJoWEc0Z0tpQmpiMjF3ZFhSaGRHbHZiaTVjYmlBcUlFQnBibk4wWVc1alpXNWhiV1VnWTI5dGNIVjBZWFJwYjI1Y2JpQXFMMXh1VkhKaFkydHlMa052YlhCMWRHRjBhVzl1SUQwZ1puVnVZM1JwYjI0Z0tHWXNJSEJoY21WdWRDd2dZM1I0S1NCN1hHNWNkR2xtSUNnaElHTnZibk4wY25WamRHbHVaME52YlhCMWRHRjBhVzl1S1Z4dVhIUmNkSFJvY205M0lHNWxkeUJGY25KdmNpaGNibHgwWEhSY2RGd2lWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVJR052Ym5OMGNuVmpkRzl5SUdseklIQnlhWFpoZEdVN0lIVnpaU0JVY21GamEzSXVZWFYwYjNKMWJsd2lLVHRjYmx4MFkyOXVjM1J5ZFdOMGFXNW5RMjl0Y0hWMFlYUnBiMjRnUFNCbVlXeHpaVHRjYmx4dVhIUjJZWElnYzJWc1ppQTlJSFJvYVhNN1hHNWNibHgwTHk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqWTI5dGNIVjBZWFJwYjI1ZmMzUnZjSEJsWkZ4dVhHNWNkQzhxS2x4dVhIUWdLaUJBYzNWdGJXRnllU0JVY25WbElHbG1JSFJvYVhNZ1kyOXRjSFYwWVhScGIyNGdhR0Z6SUdKbFpXNGdjM1J2Y0hCbFpDNWNibHgwSUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1WEhRZ0tpQkFiV1Z0WW1WeVQyWWdWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVYRzVjZENBcUlFQnBibk4wWVc1alpWeHVYSFFnS2lCQWJtRnRaU0FnYzNSdmNIQmxaRnh1WEhRZ0tpOWNibHgwYzJWc1ppNXpkRzl3Y0dWa0lEMGdabUZzYzJVN1hHNWNibHgwTHk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqWTI5dGNIVjBZWFJwYjI1ZmFXNTJZV3hwWkdGMFpXUmNibHh1WEhRdktpcGNibHgwSUNvZ1FITjFiVzFoY25rZ1ZISjFaU0JwWmlCMGFHbHpJR052YlhCMWRHRjBhVzl1SUdoaGN5QmlaV1Z1SUdsdWRtRnNhV1JoZEdWa0lDaGhibVFnYm05MElIbGxkQ0J5WlhKMWJpa3NJRzl5SUdsbUlHbDBJR2hoY3lCaVpXVnVJSE4wYjNCd1pXUXVYRzVjZENBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmx4MElDb2dRRzFsYldKbGNrOW1JRlJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZibHh1WEhRZ0tpQkFhVzV6ZEdGdVkyVmNibHgwSUNvZ1FHNWhiV1VnSUdsdWRtRnNhV1JoZEdWa1hHNWNkQ0FxSUVCMGVYQmxJSHRDYjI5c1pXRnVmVnh1WEhRZ0tpOWNibHgwYzJWc1ppNXBiblpoYkdsa1lYUmxaQ0E5SUdaaGJITmxPMXh1WEc1Y2RDOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkyTnZiWEIxZEdGMGFXOXVYMlpwY25OMGNuVnVYRzVjYmx4MEx5b3FYRzVjZENBcUlFQnpkVzF0WVhKNUlGUnlkV1VnWkhWeWFXNW5JSFJvWlNCcGJtbDBhV0ZzSUhKMWJpQnZaaUIwYUdVZ1kyOXRjSFYwWVhScGIyNGdZWFFnZEdobElIUnBiV1VnWUZSeVlXTnJjaTVoZFhSdmNuVnVZQ0JwY3lCallXeHNaV1FzSUdGdVpDQm1ZV3h6WlNCdmJpQnpkV0p6WlhGMVpXNTBJSEpsY25WdWN5QmhibVFnWVhRZ2IzUm9aWElnZEdsdFpYTXVYRzVjZENBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmx4MElDb2dRRzFsYldKbGNrOW1JRlJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZibHh1WEhRZ0tpQkFhVzV6ZEdGdVkyVmNibHgwSUNvZ1FHNWhiV1VnSUdacGNuTjBVblZ1WEc1Y2RDQXFJRUIwZVhCbElIdENiMjlzWldGdWZWeHVYSFFnS2k5Y2JseDBjMlZzWmk1bWFYSnpkRkoxYmlBOUlIUnlkV1U3WEc1Y2JseDBjMlZzWmk1ZmFXUWdQU0J1WlhoMFNXUXJLenRjYmx4MGMyVnNaaTVmYjI1SmJuWmhiR2xrWVhSbFEyRnNiR0poWTJ0eklEMGdXMTA3WEc1Y2RDOHZJSFJvWlNCd2JHRnVJR2x6SUdGMElITnZiV1VnY0c5cGJuUWdkRzhnZFhObElIUm9aU0J3WVhKbGJuUWdjbVZzWVhScGIyNWNibHgwTHk4Z2RHOGdZMjl1YzNSeVlXbHVJSFJvWlNCdmNtUmxjaUIwYUdGMElHTnZiWEIxZEdGMGFXOXVjeUJoY21VZ2NISnZZMlZ6YzJWa1hHNWNkSE5sYkdZdVgzQmhjbVZ1ZENBOUlIQmhjbVZ1ZER0Y2JseDBjMlZzWmk1ZlpuVnVZeUE5SUdZN1hHNWNkSE5sYkdZdVgzSmxZMjl0Y0hWMGFXNW5JRDBnWm1Gc2MyVTdYRzVjZEhObGJHWXVYMk52Ym5SbGVIUWdQU0JqZEhnZ2ZId2diblZzYkR0Y2JseHVYSFIyWVhJZ1pYSnliM0psWkNBOUlIUnlkV1U3WEc1Y2RIUnllU0I3WEc1Y2RGeDBjMlZzWmk1ZlkyOXRjSFYwWlNncE8xeHVYSFJjZEdWeWNtOXlaV1FnUFNCbVlXeHpaVHRjYmx4MGZTQm1hVzVoYkd4NUlIdGNibHgwWEhSelpXeG1MbVpwY25OMFVuVnVJRDBnWm1Gc2MyVTdYRzVjZEZ4MGFXWWdLR1Z5Y205eVpXUXBYRzVjZEZ4MFhIUnpaV3htTG5OMGIzQW9LVHRjYmx4MGZWeHVmVHRjYmx4dUx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4alkyOXRjSFYwWVhScGIyNWZiMjVwYm5aaGJHbGtZWFJsWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1VtVm5hWE4wWlhKeklHQmpZV3hzWW1GamEyQWdkRzhnY25WdUlIZG9aVzRnZEdocGN5QmpiMjF3ZFhSaGRHbHZiaUJwY3lCdVpYaDBJR2x1ZG1Gc2FXUmhkR1ZrTENCdmNpQnlkVzV6SUdsMElHbHRiV1ZrYVdGMFpXeDVJR2xtSUhSb1pTQmpiMjF3ZFhSaGRHbHZiaUJwY3lCaGJISmxZV1I1SUdsdWRtRnNhV1JoZEdWa0xpQWdWR2hsSUdOaGJHeGlZV05ySUdseklISjFiaUJsZUdGamRHeDVJRzl1WTJVZ1lXNWtJRzV2ZENCMWNHOXVJR1oxZEhWeVpTQnBiblpoYkdsa1lYUnBiMjV6SUhWdWJHVnpjeUJnYjI1SmJuWmhiR2xrWVhSbFlDQnBjeUJqWVd4c1pXUWdZV2RoYVc0Z1lXWjBaWElnZEdobElHTnZiWEIxZEdGMGFXOXVJR0psWTI5dFpYTWdkbUZzYVdRZ1lXZGhhVzR1WEc0Z0tpQkFiRzlqZFhNZ1EyeHBaVzUwWEc0Z0tpQkFjR0Z5WVcwZ2UwWjFibU4wYVc5dWZTQmpZV3hzWW1GamF5QkdkVzVqZEdsdmJpQjBieUJpWlNCallXeHNaV1FnYjI0Z2FXNTJZV3hwWkdGMGFXOXVMaUJTWldObGFYWmxjeUJ2Ym1VZ1lYSm5kVzFsYm5Rc0lIUm9aU0JqYjIxd2RYUmhkR2x2YmlCMGFHRjBJSGRoY3lCcGJuWmhiR2xrWVhSbFpDNWNiaUFxTDF4dVZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dUxuQnliM1J2ZEhsd1pTNXZia2x1ZG1Gc2FXUmhkR1VnUFNCbWRXNWpkR2x2YmlBb1ppd2dZM1I0S1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHh1WEhScFppQW9kSGx3Wlc5bUlHWWdJVDA5SUNkbWRXNWpkR2x2YmljcFhHNWNkRngwZEdoeWIzY2dibVYzSUVWeWNtOXlLRndpYjI1SmJuWmhiR2xrWVhSbElISmxjWFZwY21WeklHRWdablZ1WTNScGIyNWNJaWs3WEc1Y2JseDBhV1lnS0hObGJHWXVhVzUyWVd4cFpHRjBaV1FwSUh0Y2JseDBYSFJVY21GamEzSXVibTl1Y21WaFkzUnBkbVVvWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFJjZEZ4MGQybDBhRTV2V1dsbGJHUnpRV3hzYjNkbFpDaG1LUzVqWVd4c0tHTjBlQ0FoUFQwZ2RtOXBaQ0F3SUQ4Z1kzUjRJRG9nYzJWc1ppNWZZMjl1ZEdWNGRDd2djMlZzWmlrN1hHNWNkRngwZlNrN1hHNWNkSDBnWld4elpTQjdYRzVjZEZ4MGMyVnNaaTVmYjI1SmJuWmhiR2xrWVhSbFEyRnNiR0poWTJ0ekxuQjFjMmdvZXlCbWJqb2daaXdnWTNSNE9pQmpkSGdnZlNrN1hHNWNkSDFjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJMk52YlhCMWRHRjBhVzl1WDJsdWRtRnNhV1JoZEdWY2JseHVMeW9xWEc0Z0tpQkFjM1Z0YldGeWVTQkpiblpoYkdsa1lYUmxjeUIwYUdseklHTnZiWEIxZEdGMGFXOXVJSE52SUhSb1lYUWdhWFFnZDJsc2JDQmlaU0J5WlhKMWJpNWNiaUFxSUVCc2IyTjFjeUJEYkdsbGJuUmNiaUFxTDF4dVZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dUxuQnliM1J2ZEhsd1pTNXBiblpoYkdsa1lYUmxJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFIyWVhJZ2MyVnNaaUE5SUhSb2FYTTdYRzVjZEdsbUlDZ2hJSE5sYkdZdWFXNTJZV3hwWkdGMFpXUXBJSHRjYmx4MFhIUXZMeUJwWmlCM1pTZHlaU0JqZFhKeVpXNTBiSGtnYVc0Z1gzSmxZMjl0Y0hWMFpTZ3BMQ0JrYjI0bmRDQmxibkYxWlhWbFhHNWNkRngwTHk4Z2IzVnljMlZzZG1WekxDQnphVzVqWlNCM1pTZHNiQ0J5WlhKMWJpQnBiVzFsWkdsaGRHVnNlU0JoYm5sM1lYa3VYRzVjZEZ4MGFXWWdLQ0VnYzJWc1ppNWZjbVZqYjIxd2RYUnBibWNnSmlZZ0lTQnpaV3htTG5OMGIzQndaV1FwSUh0Y2JseDBYSFJjZEhKbGNYVnBjbVZHYkhWemFDZ3BPMXh1WEhSY2RGeDBjR1Z1WkdsdVowTnZiWEIxZEdGMGFXOXVjeTV3ZFhOb0tIUm9hWE1wTzF4dVhIUmNkSDFjYmx4dVhIUmNkSE5sYkdZdWFXNTJZV3hwWkdGMFpXUWdQU0IwY25WbE8xeHVYRzVjZEZ4MEx5OGdZMkZzYkdKaFkydHpJR05oYmlkMElHRmtaQ0JqWVd4c1ltRmphM01zSUdKbFkyRjFjMlZjYmx4MFhIUXZMeUJ6Wld4bUxtbHVkbUZzYVdSaGRHVmtJRDA5UFNCMGNuVmxMbHh1WEhSY2RHWnZjaWgyWVhJZ2FTQTlJREFzSUdZN0lHWWdQU0J6Wld4bUxsOXZia2x1ZG1Gc2FXUmhkR1ZEWVd4c1ltRmphM05iYVYwN0lHa3JLeWtnZTF4dVhIUmNkRngwVkhKaFkydHlMbTV2Ym5KbFlXTjBhWFpsS0daMWJtTjBhVzl1SUNncElIdGNibHgwWEhSY2RGeDBkMmwwYUU1dldXbGxiR1J6UVd4c2IzZGxaQ2htTG1adUtTNWpZV3hzS0dZdVkzUjRJQ0U5UFNCMmIybGtJREFnUHlCbUxtTjBlQ0E2SUhObGJHWXVYMk52Ym5SbGVIUXNJSE5sYkdZcE8xeHVYSFJjZEZ4MGZTazdYRzVjZEZ4MGZWeHVYSFJjZEhObGJHWXVYMjl1U1c1MllXeHBaR0YwWlVOaGJHeGlZV05yY3lBOUlGdGRPMXh1WEhSOVhHNTlPMXh1WEc0dkx5Qm9kSFJ3T2k4dlpHOWpjeTV0WlhSbGIzSXVZMjl0THlOamIyMXdkWFJoZEdsdmJsOXpkRzl3WEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1VISmxkbVZ1ZEhNZ2RHaHBjeUJqYjIxd2RYUmhkR2x2YmlCbWNtOXRJSEpsY25WdWJtbHVaeTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUwxeHVWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVMbkJ5YjNSdmRIbHdaUzV6ZEc5d0lEMGdablZ1WTNScGIyNGdLQ2tnZTF4dVhIUnBaaUFvSVNCMGFHbHpMbk4wYjNCd1pXUXBJSHRjYmx4MFhIUjBhR2x6TG5OMGIzQndaV1FnUFNCMGNuVmxPMXh1WEhSY2RIUm9hWE11YVc1MllXeHBaR0YwWlNncE8xeHVYSFI5WEc1OU8xeHVYRzVVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjR1Y0hKdmRHOTBlWEJsTGw5amIyMXdkWFJsSUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2RITmxiR1l1YVc1MllXeHBaR0YwWldRZ1BTQm1ZV3h6WlR0Y2JseHVYSFIyWVhJZ2NISmxkbWx2ZFhNZ1BTQlVjbUZqYTNJdVkzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dU8xeHVYSFJ6WlhSRGRYSnlaVzUwUTI5dGNIVjBZWFJwYjI0b2MyVnNaaWs3WEc1Y2RIWmhjaUJ3Y21WMmFXOTFjMGx1UTI5dGNIVjBaU0E5SUdsdVEyOXRjSFYwWlR0Y2JseDBhVzVEYjIxd2RYUmxJRDBnZEhKMVpUdGNibHgwZEhKNUlIdGNibHgwWEhSM2FYUm9UbTlaYVdWc1pITkJiR3h2ZDJWa0tITmxiR1l1WDJaMWJtTXBMbU5oYkd3b2MyVnNaaTVmWTI5dWRHVjRkQ3dnYzJWc1ppazdYRzVjZEgwZ1ptbHVZV3hzZVNCN1hHNWNkRngwYzJWMFEzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dUtIQnlaWFpwYjNWektUdGNibHgwWEhScGJrTnZiWEIxZEdVZ1BTQndjbVYyYVc5MWMwbHVRMjl0Y0hWMFpUdGNibHgwZlZ4dWZUdGNibHh1VkhKaFkydHlMa052YlhCMWRHRjBhVzl1TG5CeWIzUnZkSGx3WlM1ZmNtVmpiMjF3ZFhSbElEMGdablZ1WTNScGIyNGdLQ2tnZTF4dVhIUjJZWElnYzJWc1ppQTlJSFJvYVhNN1hHNWNibHgwYzJWc1ppNWZjbVZqYjIxd2RYUnBibWNnUFNCMGNuVmxPMXh1WEhSMGNua2dlMXh1WEhSY2RIZG9hV3hsSUNoelpXeG1MbWx1ZG1Gc2FXUmhkR1ZrSUNZbUlDRWdjMlZzWmk1emRHOXdjR1ZrS1NCN1hHNWNkRngwWEhSMGNua2dlMXh1WEhSY2RGeDBYSFJ6Wld4bUxsOWpiMjF3ZFhSbEtDazdYRzVjZEZ4MFhIUjlJR05oZEdOb0lDaGxLU0I3WEc1Y2RGeDBYSFJjZEY5MGFISnZkMDl5VEc5bktGd2ljbVZqYjIxd2RYUmxYQ0lzSUdVcE8xeHVYSFJjZEZ4MGZWeHVYSFJjZEZ4MEx5OGdTV1lnWDJOdmJYQjFkR1VvS1NCcGJuWmhiR2xrWVhSbFpDQjFjeXdnZDJVZ2NuVnVJR0ZuWVdsdUlHbHRiV1ZrYVdGMFpXeDVMbHh1WEhSY2RGeDBMeThnUVNCamIyMXdkWFJoZEdsdmJpQjBhR0YwSUdsdWRtRnNhV1JoZEdWeklHbDBjMlZzWmlCcGJtUmxabWx1YVhSbGJIa2dhWE1nWVc1Y2JseDBYSFJjZEM4dklHbHVabWx1YVhSbElHeHZiM0FzSUc5bUlHTnZkWEp6WlM1Y2JseDBYSFJjZEM4dlhHNWNkRngwWEhRdkx5QlhaU0JqYjNWc1pDQndkWFFnWVc0Z2FYUmxjbUYwYVc5dUlHTnZkVzUwWlhJZ2FHVnlaU0JoYm1RZ1kyRjBZMmdnY25WdUxXRjNZWGxjYmx4MFhIUmNkQzh2SUd4dmIzQnpMbHh1WEhSY2RIMWNibHgwZlNCbWFXNWhiR3g1SUh0Y2JseDBYSFJ6Wld4bUxsOXlaV052YlhCMWRHbHVaeUE5SUdaaGJITmxPMXh1WEhSOVhHNTlPMXh1WEc0dkwxeHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpkSEpoWTJ0bGNsOWtaWEJsYm1SbGJtTjVYRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnUVNCRVpYQmxibVJsYm1ONUlISmxjSEpsYzJWdWRITWdZVzRnWVhSdmJXbGpJSFZ1YVhRZ2IyWWdjbVZoWTNScGRtVWdaR0YwWVNCMGFHRjBJR0ZjYmlBcUlHTnZiWEIxZEdGMGFXOXVJRzFwWjJoMElHUmxjR1Z1WkNCdmJpNGdVbVZoWTNScGRtVWdaR0YwWVNCemIzVnlZMlZ6SUhOMVkyZ2dZWE1nVTJWemMybHZiaUJ2Y2x4dUlDb2dUV2x1YVcxdmJtZHZJR2x1ZEdWeWJtRnNiSGtnWTNKbFlYUmxJR1JwWm1abGNtVnVkQ0JFWlhCbGJtUmxibU41SUc5aWFtVmpkSE1nWm05eUlHUnBabVpsY21WdWRGeHVJQ29nY0dsbFkyVnpJRzltSUdSaGRHRXNJR1ZoWTJnZ2IyWWdkMmhwWTJnZ2JXRjVJR0psSUdSbGNHVnVaR1ZrSUc5dUlHSjVJRzExYkhScGNHeGxJR052YlhCMWRHRjBhVzl1Y3k1Y2JpQXFJRmRvWlc0Z2RHaGxJR1JoZEdFZ1kyaGhibWRsY3l3Z2RHaGxJR052YlhCMWRHRjBhVzl1Y3lCaGNtVWdhVzUyWVd4cFpHRjBaV1F1WEc0Z0tpQkFZMnhoYzNOY2JpQXFJRUJwYm5OMFlXNWpaVTVoYldVZ1pHVndaVzVrWlc1amVWeHVJQ292WEc1VWNtRmphM0l1UkdWd1pXNWtaVzVqZVNBOUlHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MGRHaHBjeTVmWkdWd1pXNWtaVzUwYzBKNVNXUWdQU0I3ZlR0Y2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STJSbGNHVnVaR1Z1WTNsZlpHVndaVzVrWEc0dkwxeHVMeThnUVdSa2N5QmdZMjl0Y0hWMFlYUnBiMjVnSUhSdklIUm9hWE1nYzJWMElHbG1JR2wwSUdseklHNXZkQ0JoYkhKbFlXUjVYRzR2THlCd2NtVnpaVzUwTGlBZ1VtVjBkWEp1Y3lCMGNuVmxJR2xtSUdCamIyMXdkWFJoZEdsdmJtQWdhWE1nWVNCdVpYY2diV1Z0WW1WeUlHOW1JSFJvWlNCelpYUXVYRzR2THlCSlppQnVieUJoY21kMWJXVnVkQ3dnWkdWbVlYVnNkSE1nZEc4Z1kzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dUxDQnZjaUJrYjJWeklHNXZkR2hwYm1kY2JpOHZJR2xtSUhSb1pYSmxJR2x6SUc1dklHTjFjbkpsYm5SRGIyMXdkWFJoZEdsdmJpNWNibHh1THlvcVhHNGdLaUJBYzNWdGJXRnllU0JFWldOc1lYSmxjeUIwYUdGMElIUm9aU0JqZFhKeVpXNTBJR052YlhCMWRHRjBhVzl1SUNodmNpQmdabkp2YlVOdmJYQjFkR0YwYVc5dVlDQnBaaUJuYVhabGJpa2daR1Z3Wlc1a2N5QnZiaUJnWkdWd1pXNWtaVzVqZVdBdUlDQlVhR1VnWTI5dGNIVjBZWFJwYjI0Z2QybHNiQ0JpWlNCcGJuWmhiR2xrWVhSbFpDQjBhR1VnYm1WNGRDQjBhVzFsSUdCa1pYQmxibVJsYm1ONVlDQmphR0Z1WjJWekxseHVYRzVKWmlCMGFHVnlaU0JwY3lCdWJ5QmpkWEp5Wlc1MElHTnZiWEIxZEdGMGFXOXVJR0Z1WkNCZ1pHVndaVzVrS0NsZ0lHbHpJR05oYkd4bFpDQjNhWFJvSUc1dklHRnlaM1Z0Wlc1MGN5d2dhWFFnWkc5bGN5QnViM1JvYVc1bklHRnVaQ0J5WlhSMWNtNXpJR1poYkhObExseHVYRzVTWlhSMWNtNXpJSFJ5ZFdVZ2FXWWdkR2hsSUdOdmJYQjFkR0YwYVc5dUlHbHpJR0VnYm1WM0lHUmxjR1Z1WkdWdWRDQnZaaUJnWkdWd1pXNWtaVzVqZVdBZ2NtRjBhR1Z5SUhSb1lXNGdZVzRnWlhocGMzUnBibWNnYjI1bExseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjU5SUZ0bWNtOXRRMjl0Y0hWMFlYUnBiMjVkSUVGdUlHOXdkR2x2Ym1Gc0lHTnZiWEIxZEdGMGFXOXVJR1JsWTJ4aGNtVmtJSFJ2SUdSbGNHVnVaQ0J2YmlCZ1pHVndaVzVrWlc1amVXQWdhVzV6ZEdWaFpDQnZaaUIwYUdVZ1kzVnljbVZ1ZENCamIyMXdkWFJoZEdsdmJpNWNiaUFxSUVCeVpYUjFjbTV6SUh0Q2IyOXNaV0Z1ZlZ4dUlDb3ZYRzVVY21GamEzSXVSR1Z3Wlc1a1pXNWplUzV3Y205MGIzUjVjR1V1WkdWd1pXNWtJRDBnWm5WdVkzUnBiMjRnS0dOdmJYQjFkR0YwYVc5dUtTQjdYRzVjZEdsbUlDZ2hJR052YlhCMWRHRjBhVzl1S1NCN1hHNWNkRngwYVdZZ0tDRWdWSEpoWTJ0eUxtRmpkR2wyWlNsY2JseDBYSFJjZEhKbGRIVnliaUJtWVd4elpUdGNibHh1WEhSY2RHTnZiWEIxZEdGMGFXOXVJRDBnVkhKaFkydHlMbU4xY25KbGJuUkRiMjF3ZFhSaGRHbHZianRjYmx4MGZWeHVYSFIyWVhJZ2MyVnNaaUE5SUhSb2FYTTdYRzVjZEhaaGNpQnBaQ0E5SUdOdmJYQjFkR0YwYVc5dUxsOXBaRHRjYmx4MGFXWWdLQ0VnS0dsa0lHbHVJSE5sYkdZdVgyUmxjR1Z1WkdWdWRITkNlVWxrS1NrZ2UxeHVYSFJjZEhObGJHWXVYMlJsY0dWdVpHVnVkSE5DZVVsa1cybGtYU0E5SUdOdmJYQjFkR0YwYVc5dU8xeHVYSFJjZEdOdmJYQjFkR0YwYVc5dUxtOXVTVzUyWVd4cFpHRjBaU2htZFc1amRHbHZiaUFvS1NCN1hHNWNkRngwWEhSa1pXeGxkR1VnYzJWc1ppNWZaR1Z3Wlc1a1pXNTBjMEo1U1dSYmFXUmRPMXh1WEhSY2RIMHBPMXh1WEhSY2RISmxkSFZ5YmlCMGNuVmxPMXh1WEhSOVhHNWNkSEpsZEhWeWJpQm1ZV3h6WlR0Y2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STJSbGNHVnVaR1Z1WTNsZlkyaGhibWRsWkZ4dVhHNHZLaXBjYmlBcUlFQnpkVzF0WVhKNUlFbHVkbUZzYVdSaGRHVWdZV3hzSUdSbGNHVnVaR1Z1ZENCamIyMXdkWFJoZEdsdmJuTWdhVzF0WldScFlYUmxiSGtnWVc1a0lISmxiVzkyWlNCMGFHVnRJR0Z6SUdSbGNHVnVaR1Z1ZEhNdVhHNGdLaUJBYkc5amRYTWdRMnhwWlc1MFhHNGdLaTljYmxSeVlXTnJjaTVFWlhCbGJtUmxibU41TG5CeWIzUnZkSGx3WlM1amFHRnVaMlZrSUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2RHWnZjaUFvZG1GeUlHbGtJR2x1SUhObGJHWXVYMlJsY0dWdVpHVnVkSE5DZVVsa0tWeHVYSFJjZEhObGJHWXVYMlJsY0dWdVpHVnVkSE5DZVVsa1cybGtYUzVwYm5aaGJHbGtZWFJsS0NrN1hHNTlPMXh1WEc0dkx5Qm9kSFJ3T2k4dlpHOWpjeTV0WlhSbGIzSXVZMjl0THlOa1pYQmxibVJsYm1ONVgyaGhjMlJsY0dWdVpHVnVkSE5jYmx4dUx5b3FYRzRnS2lCQWMzVnRiV0Z5ZVNCVWNuVmxJR2xtSUhSb2FYTWdSR1Z3Wlc1a1pXNWplU0JvWVhNZ2IyNWxJRzl5SUcxdmNtVWdaR1Z3Wlc1a1pXNTBJRU52YlhCMWRHRjBhVzl1Y3l3Z2QyaHBZMmdnZDI5MWJHUWdZbVVnYVc1MllXeHBaR0YwWldRZ2FXWWdkR2hwY3lCRVpYQmxibVJsYm1ONUlIZGxjbVVnZEc4Z1kyaGhibWRsTGx4dUlDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dUlDb2dRSEpsZEhWeWJuTWdlMEp2YjJ4bFlXNTlYRzRnS2k5Y2JsUnlZV05yY2k1RVpYQmxibVJsYm1ONUxuQnliM1J2ZEhsd1pTNW9ZWE5FWlhCbGJtUmxiblJ6SUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2RHWnZjaWgyWVhJZ2FXUWdhVzRnYzJWc1ppNWZaR1Z3Wlc1a1pXNTBjMEo1U1dRcFhHNWNkRngwY21WMGRYSnVJSFJ5ZFdVN1hHNWNkSEpsZEhWeWJpQm1ZV3h6WlR0Y2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STNSeVlXTnJaWEpmWm14MWMyaGNibHh1THlvcVhHNGdLaUJBYzNWdGJXRnllU0JRY205alpYTnpJR0ZzYkNCeVpXRmpkR2wyWlNCMWNHUmhkR1Z6SUdsdGJXVmthV0YwWld4NUlHRnVaQ0JsYm5OMWNtVWdkR2hoZENCaGJHd2dhVzUyWVd4cFpHRjBaV1FnWTI5dGNIVjBZWFJwYjI1eklHRnlaU0J5WlhKMWJpNWNiaUFxSUVCc2IyTjFjeUJEYkdsbGJuUmNiaUFxTDF4dVZISmhZMnR5TG1ac2RYTm9JRDBnWm5WdVkzUnBiMjRnS0Y5dmNIUnpLU0I3WEc1Y2RDOHZJRmhZV0NCWGFHRjBJSEJoY25RZ2IyWWdkR2hsSUdOdmJXMWxiblFnWW1Wc2IzY2dhWE1nYzNScGJHd2dkSEoxWlQ4Z0tGZGxJRzV2SUd4dmJtZGxjbHh1WEhRdkx5Qm9ZWFpsSUZOd1lYSnJLVnh1WEhRdkwxeHVYSFF2THlCT1pYTjBaV1FnWm14MWMyZ2dZMjkxYkdRZ2NHeGhkWE5wWW14NUlHaGhjSEJsYmlCcFppd2djMkY1TENCaElHWnNkWE5vSUdOaGRYTmxjMXh1WEhRdkx5QkVUMDBnYlhWMFlYUnBiMjRzSUhkb2FXTm9JR05oZFhObGN5QmhJRndpWW14MWNsd2lJR1YyWlc1MExDQjNhR2xqYUNCeWRXNXpJR0Z1WEc1Y2RDOHZJR0Z3Y0NCbGRtVnVkQ0JvWVc1a2JHVnlJSFJvWVhRZ1kyRnNiSE1nVkhKaFkydHlMbVpzZFhOb0xpQWdRWFFnZEdobElHMXZiV1Z1ZEZ4dVhIUXZMeUJUY0dGeWF5QmliRzlqYTNNZ1pYWmxiblFnYUdGdVpHeGxjbk1nWkhWeWFXNW5JRVJQVFNCdGRYUmhkR2x2YmlCaGJubDNZWGtzWEc1Y2RDOHZJR0psWTJGMWMyVWdkR2hsSUV4cGRtVlNZVzVuWlNCMGNtVmxJR2x6YmlkMElIWmhiR2xrTGlBZ1FXNWtJSGRsSUdSdmJpZDBJR2hoZG1WY2JseDBMeThnWVc1NUlIVnpaV1oxYkNCdWIzUnBiMjRnYjJZZ1lTQnVaWE4wWldRZ1pteDFjMmd1WEc1Y2RDOHZYRzVjZEM4dklHaDBkSEJ6T2k4dllYQndMbUZ6WVc1aExtTnZiUzh3THpFMU9Ua3dPRE16TURJME5DOHpPRFV4TXpneU16TTROVFpjYmx4MGFXWWdLR2x1Um14MWMyZ3BYRzVjZEZ4MGRHaHliM2NnYm1WM0lFVnljbTl5S0Z3aVEyRnVKM1FnWTJGc2JDQlVjbUZqYTNJdVpteDFjMmdnZDJocGJHVWdabXgxYzJocGJtZGNJaWs3WEc1Y2JseDBhV1lnS0dsdVEyOXRjSFYwWlNsY2JseDBYSFIwYUhKdmR5QnVaWGNnUlhKeWIzSW9YQ0pEWVc0bmRDQm1iSFZ6YUNCcGJuTnBaR1VnVkhKaFkydHlMbUYxZEc5eWRXNWNJaWs3WEc1Y2JseDBhVzVHYkhWemFDQTlJSFJ5ZFdVN1hHNWNkSGRwYkd4R2JIVnphQ0E5SUhSeWRXVTdYRzVjZEhSb2NtOTNSbWx5YzNSRmNuSnZjaUE5SUNFaElDaGZiM0IwY3lBbUppQmZiM0IwY3k1ZmRHaHliM2RHYVhKemRFVnljbTl5S1R0Y2JseHVYSFIyWVhJZ1ptbHVhWE5vWldSVWNua2dQU0JtWVd4elpUdGNibHgwZEhKNUlIdGNibHgwWEhSM2FHbHNaU0FvY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1c1pXNW5kR2dnZkh4Y2JseDBYSFJjZEZ4MFhIUWdZV1owWlhKR2JIVnphRU5oYkd4aVlXTnJjeTVzWlc1bmRHZ3BJSHRjYmx4dVhIUmNkRngwTHk4Z2NtVmpiMjF3ZFhSbElHRnNiQ0J3Wlc1a2FXNW5JR052YlhCMWRHRjBhVzl1YzF4dVhIUmNkRngwZDJocGJHVWdLSEJsYm1ScGJtZERiMjF3ZFhSaGRHbHZibk11YkdWdVozUm9LU0I3WEc1Y2RGeDBYSFJjZEhaaGNpQmpiMjF3SUQwZ2NHVnVaR2x1WjBOdmJYQjFkR0YwYVc5dWN5NXphR2xtZENncE8xeHVYSFJjZEZ4MFhIUmpiMjF3TGw5eVpXTnZiWEIxZEdVb0tUdGNibHgwWEhSY2RIMWNibHh1WEhSY2RGeDBhV1lnS0dGbWRHVnlSbXgxYzJoRFlXeHNZbUZqYTNNdWJHVnVaM1JvS1NCN1hHNWNkRngwWEhSY2RDOHZJR05oYkd3Z2IyNWxJR0ZtZEdWeVJteDFjMmdnWTJGc2JHSmhZMnNzSUhkb2FXTm9JRzFoZVZ4dVhIUmNkRngwWEhRdkx5QnBiblpoYkdsa1lYUmxJRzF2Y21VZ1kyOXRjSFYwWVhScGIyNXpYRzVjZEZ4MFhIUmNkSFpoY2lCallpQTlJR0ZtZEdWeVJteDFjMmhEWVd4c1ltRmphM011YzJocFpuUW9LVHRjYmx4MFhIUmNkRngwZEhKNUlIdGNibHgwWEhSY2RGeDBYSFJqWWk1bWJpNWpZV3hzS0dOaUxtTjBlQ2s3WEc1Y2RGeDBYSFJjZEgwZ1kyRjBZMmdnS0dVcElIdGNibHgwWEhSY2RGeDBYSFJmZEdoeWIzZFBja3h2WnloY0ltRm1kR1Z5Um14MWMyaGNJaXdnWlNrN1hHNWNkRngwWEhSY2RIMWNibHgwWEhSY2RIMWNibHgwWEhSOVhHNWNkRngwWm1sdWFYTm9aV1JVY25rZ1BTQjBjblZsTzF4dVhIUjlJR1pwYm1Gc2JIa2dlMXh1WEhSY2RHbG1JQ2doSUdacGJtbHphR1ZrVkhKNUtTQjdYRzVjZEZ4MFhIUXZMeUIzWlNkeVpTQmxjbkp2Y21sdVoxeHVYSFJjZEZ4MGFXNUdiSFZ6YUNBOUlHWmhiSE5sT3lBdkx5QnVaV1ZrWldRZ1ltVm1iM0psSUdOaGJHeHBibWNnWUZSeVlXTnJjaTVtYkhWemFDZ3BZQ0JoWjJGcGJseHVYSFJjZEZ4MFZISmhZMnR5TG1ac2RYTm9LSHRmZEdoeWIzZEdhWEp6ZEVWeWNtOXlPaUJtWVd4elpYMHBPeUF2THlCbWFXNXBjMmdnWm14MWMyaHBibWRjYmx4MFhIUjlYRzVjZEZ4MGQybHNiRVpzZFhOb0lEMGdabUZzYzJVN1hHNWNkRngwYVc1R2JIVnphQ0E5SUdaaGJITmxPMXh1WEhSOVhHNTlPMXh1WEc0dkx5Qm9kSFJ3T2k4dlpHOWpjeTV0WlhSbGIzSXVZMjl0THlOMGNtRmphMlZ5WDJGMWRHOXlkVzVjYmk4dlhHNHZMeUJTZFc0Z1ppZ3BMaUJTWldOdmNtUWdhWFJ6SUdSbGNHVnVaR1Z1WTJsbGN5NGdVbVZ5ZFc0Z2FYUWdkMmhsYm1WMlpYSWdkR2hsWEc0dkx5QmtaWEJsYm1SbGJtTnBaWE1nWTJoaGJtZGxMbHh1THk5Y2JpOHZJRkpsZEhWeWJuTWdZU0J1WlhjZ1EyOXRjSFYwWVhScGIyNHNJSGRvYVdOb0lHbHpJR0ZzYzI4Z2NHRnpjMlZrSUhSdklHWXVYRzR2TDF4dUx5OGdUR2x1YTNNZ2RHaGxJR052YlhCMWRHRjBhVzl1SUhSdklIUm9aU0JqZFhKeVpXNTBJR052YlhCMWRHRjBhVzl1WEc0dkx5QnpieUIwYUdGMElHbDBJR2x6SUhOMGIzQndaV1FnYVdZZ2RHaGxJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjRnYVhNZ2FXNTJZV3hwWkdGMFpXUXVYRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnVW5WdUlHRWdablZ1WTNScGIyNGdibTkzSUdGdVpDQnlaWEoxYmlCcGRDQnNZWFJsY2lCM2FHVnVaWFpsY2lCcGRITWdaR1Z3Wlc1a1pXNWphV1Z6SUdOb1lXNW5aUzRnVW1WMGRYSnVjeUJoSUVOdmJYQjFkR0YwYVc5dUlHOWlhbVZqZENCMGFHRjBJR05oYmlCaVpTQjFjMlZrSUhSdklITjBiM0FnYjNJZ2IySnpaWEoyWlNCMGFHVWdjbVZ5ZFc1dWFXNW5MbHh1SUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1SUNvZ1FIQmhjbUZ0SUh0R2RXNWpkR2x2Ym4wZ2NuVnVSblZ1WXlCVWFHVWdablZ1WTNScGIyNGdkRzhnY25WdUxpQkpkQ0J5WldObGFYWmxjeUJ2Ym1VZ1lYSm5kVzFsYm5RNklIUm9aU0JEYjIxd2RYUmhkR2x2YmlCdlltcGxZM1FnZEdoaGRDQjNhV3hzSUdKbElISmxkSFZ5Ym1Wa0xseHVJQ29nUUhKbGRIVnlibk1nZTFSeVlXTnJjaTVEYjIxd2RYUmhkR2x2Ym4xY2JpQXFMMXh1VkhKaFkydHlMbUYxZEc5eWRXNGdQU0JtZFc1amRHbHZiaUFvWml3Z1kzUjRLU0I3WEc1Y2RHbG1JQ2gwZVhCbGIyWWdaaUFoUFQwZ0oyWjFibU4wYVc5dUp5bGNibHgwWEhSMGFISnZkeUJ1WlhjZ1JYSnliM0lvSjFSeVlXTnJjaTVoZFhSdmNuVnVJSEpsY1hWcGNtVnpJR0VnWm5WdVkzUnBiMjRnWVhKbmRXMWxiblFuS1R0Y2JseHVYSFJqYjI1emRISjFZM1JwYm1kRGIyMXdkWFJoZEdsdmJpQTlJSFJ5ZFdVN1hHNWNkSFpoY2lCaklEMGdibVYzSUZSeVlXTnJjaTVEYjIxd2RYUmhkR2x2YmlobUxDQlVjbUZqYTNJdVkzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dUxDQmpkSGdwTzF4dVhHNWNkR2xtSUNoVWNtRmphM0l1WVdOMGFYWmxLVnh1WEhSY2RGUnlZV05yY2k1dmJrbHVkbUZzYVdSaGRHVW9ablZ1WTNScGIyNGdLQ2tnZTF4dVhIUmNkRngwWXk1emRHOXdLQ2s3WEc1Y2RGeDBmU2s3WEc1Y2JseDBjbVYwZFhKdUlHTTdYRzU5TzF4dVhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TjBjbUZqYTJWeVgyNXZibkpsWVdOMGFYWmxYRzR2TDF4dUx5OGdVblZ1SUdCbVlDQjNhWFJvSUc1dklHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNHNJSEpsZEhWeWJtbHVaeUIwYUdVZ2NtVjBkWEp1SUhaaGJIVmxYRzR2THlCdlppQmdabUF1SUNCVmMyVmtJSFJ2SUhSMWNtNGdiMlptSUhKbFlXTjBhWFpwZEhrZ1ptOXlJSFJvWlNCa2RYSmhkR2x2YmlCdlppQmdabUFzWEc0dkx5QnpieUIwYUdGMElISmxZV04wYVhabElHUmhkR0VnYzI5MWNtTmxjeUJoWTJObGMzTmxaQ0JpZVNCZ1ptQWdkMmxzYkNCdWIzUWdjbVZ6ZFd4MElHbHVJR0Z1ZVZ4dUx5OGdZMjl0Y0hWMFlYUnBiMjV6SUdKbGFXNW5JR2x1ZG1Gc2FXUmhkR1ZrTGx4dVhHNHZLaXBjYmlBcUlFQnpkVzF0WVhKNUlGSjFiaUJoSUdaMWJtTjBhVzl1SUhkcGRHaHZkWFFnZEhKaFkydHBibWNnWkdWd1pXNWtaVzVqYVdWekxseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRHZFc1amRHbHZibjBnWm5WdVl5QkJJR1oxYm1OMGFXOXVJSFJ2SUdOaGJHd2dhVzF0WldScFlYUmxiSGt1WEc0Z0tpOWNibFJ5WVdOcmNpNXViMjVTWldGamRHbDJaU0E5SUZ4dVZISmhZMnR5TG01dmJuSmxZV04wYVhabElEMGdablZ1WTNScGIyNGdLR1lzSUdOMGVDa2dlMXh1WEhSMllYSWdjSEpsZG1sdmRYTWdQU0JVY21GamEzSXVZM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVPMXh1WEhSelpYUkRkWEp5Wlc1MFEyOXRjSFYwWVhScGIyNG9iblZzYkNrN1hHNWNkSFJ5ZVNCN1hHNWNkRngwY21WMGRYSnVJR1l1WTJGc2JDaGpkSGdwTzF4dVhIUjlJR1pwYm1Gc2JIa2dlMXh1WEhSY2RITmxkRU4xY25KbGJuUkRiMjF3ZFhSaGRHbHZiaWh3Y21WMmFXOTFjeWs3WEc1Y2RIMWNibjA3WEc1Y2JpOHZJR3hwYTJVZ2JtOXVjbVZoWTNScGRtVWdZblYwSUcxaGEyVnpJR0VnWm5WdVkzUnBiMjRnYVc1emRHVmhaRnh1VkhKaFkydHlMbTV2YmxKbFlXTjBZV0pzWlNBOUlGeHVWSEpoWTJ0eUxtNXZibkpsWVdOMFlXSnNaU0E5SUdaMWJtTjBhVzl1SUNobUxDQmpkSGdwSUh0Y2JseDBjbVYwZFhKdUlHWjFibU4wYVc5dUtDa2dlMXh1WEhSY2RIWmhjaUJoY21keklEMGdZWEpuZFcxbGJuUnpPMXh1WEhSY2RHbG1JQ2hqZEhnZ1BUMGdiblZzYkNrZ1kzUjRJRDBnZEdocGN6dGNibHgwWEhSeVpYUjFjbTRnVkhKaFkydHlMbTV2Ym5KbFlXTjBhWFpsS0daMWJtTjBhVzl1S0NrZ2UxeHVYSFJjZEZ4MGNtVjBkWEp1SUdZdVlYQndiSGtvWTNSNExDQmhjbWR6S1R0Y2JseDBYSFI5S1R0Y2JseDBmVHRjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZiMjVwYm5aaGJHbGtZWFJsWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1VtVm5hWE4wWlhKeklHRWdibVYzSUZ0Z2IyNUpiblpoYkdsa1lYUmxZRjBvSTJOdmJYQjFkR0YwYVc5dVgyOXVhVzUyWVd4cFpHRjBaU2tnWTJGc2JHSmhZMnNnYjI0Z2RHaGxJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjRnS0hkb2FXTm9JRzExYzNRZ1pYaHBjM1FwTENCMGJ5QmlaU0JqWVd4c1pXUWdhVzF0WldScFlYUmxiSGtnZDJobGJpQjBhR1VnWTNWeWNtVnVkQ0JqYjIxd2RYUmhkR2x2YmlCcGN5QnBiblpoYkdsa1lYUmxaQ0J2Y2lCemRHOXdjR1ZrTGx4dUlDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dUlDb2dRSEJoY21GdElIdEdkVzVqZEdsdmJuMGdZMkZzYkdKaFkyc2dRU0JqWVd4c1ltRmpheUJtZFc1amRHbHZiaUIwYUdGMElIZHBiR3dnWW1VZ2FXNTJiMnRsWkNCaGN5QmdablZ1WXloaktXQXNJSGRvWlhKbElHQmpZQ0JwY3lCMGFHVWdZMjl0Y0hWMFlYUnBiMjRnYjI0Z2QyaHBZMmdnZEdobElHTmhiR3hpWVdOcklHbHpJSEpsWjJsemRHVnlaV1F1WEc0Z0tpOWNibFJ5WVdOcmNpNXZia2x1ZG1Gc2FXUmhkR1VnUFNCbWRXNWpkR2x2YmlBb1ppd2dZM1I0S1NCN1hHNWNkR2xtSUNnaElGUnlZV05yY2k1aFkzUnBkbVVwWEc1Y2RGeDBkR2h5YjNjZ2JtVjNJRVZ5Y205eUtGd2lWSEpoWTJ0eUxtOXVTVzUyWVd4cFpHRjBaU0J5WlhGMWFYSmxjeUJoSUdOMWNuSmxiblJEYjIxd2RYUmhkR2x2Ymx3aUtUdGNibHh1WEhSVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1TG05dVNXNTJZV3hwWkdGMFpTaG1MQ0JqZEhncE8xeHVmVHRjYmx4dUx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4amRISmhZMnRsY2w5aFpuUmxjbVpzZFhOb1hHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVMk5vWldSMWJHVnpJR0VnWm5WdVkzUnBiMjRnZEc4Z1ltVWdZMkZzYkdWa0lHUjFjbWx1WnlCMGFHVWdibVY0ZENCbWJIVnphQ3dnYjNJZ2JHRjBaWElnYVc0Z2RHaGxJR04xY25KbGJuUWdabXgxYzJnZ2FXWWdiMjVsSUdseklHbHVJSEJ5YjJkeVpYTnpMQ0JoWm5SbGNpQmhiR3dnYVc1MllXeHBaR0YwWldRZ1kyOXRjSFYwWVhScGIyNXpJR2hoZG1VZ1ltVmxiaUJ5WlhKMWJpNGdJRlJvWlNCbWRXNWpkR2x2YmlCM2FXeHNJR0psSUhKMWJpQnZibU5sSUdGdVpDQnViM1FnYjI0Z2MzVmljMlZ4ZFdWdWRDQm1iSFZ6YUdWeklIVnViR1Z6Y3lCZ1lXWjBaWEpHYkhWemFHQWdhWE1nWTJGc2JHVmtJR0ZuWVdsdUxseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRHZFc1amRHbHZibjBnWTJGc2JHSmhZMnNnUVNCbWRXNWpkR2x2YmlCMGJ5QmpZV3hzSUdGMElHWnNkWE5vSUhScGJXVXVYRzRnS2k5Y2JsUnlZV05yY2k1aFpuUmxja1pzZFhOb0lEMGdablZ1WTNScGIyNGdLR1lzSUdOMGVDa2dlMXh1WEhSaFpuUmxja1pzZFhOb1EyRnNiR0poWTJ0ekxuQjFjMmdvZXlCbWJqb2daaXdnWTNSNE9pQmpkSGdnZlNrN1hHNWNkSEpsY1hWcGNtVkdiSFZ6YUNncE8xeHVmVHNpWFgwPSIsIi8vICAgICBVbmRlcnNjb3JlLmpzIDEuOC4zXG4vLyAgICAgaHR0cDovL3VuZGVyc2NvcmVqcy5vcmdcbi8vICAgICAoYykgMjAwOS0yMDE1IEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBhbmQgSW52ZXN0aWdhdGl2ZSBSZXBvcnRlcnMgJiBFZGl0b3JzXG4vLyAgICAgVW5kZXJzY29yZSBtYXkgYmUgZnJlZWx5IGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cblxuKGZ1bmN0aW9uKCkge1xuXG4gIC8vIEJhc2VsaW5lIHNldHVwXG4gIC8vIC0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gRXN0YWJsaXNoIHRoZSByb290IG9iamVjdCwgYHdpbmRvd2AgaW4gdGhlIGJyb3dzZXIsIG9yIGBleHBvcnRzYCBvbiB0aGUgc2VydmVyLlxuICB2YXIgcm9vdCA9IHRoaXM7XG5cbiAgLy8gU2F2ZSB0aGUgcHJldmlvdXMgdmFsdWUgb2YgdGhlIGBfYCB2YXJpYWJsZS5cbiAgdmFyIHByZXZpb3VzVW5kZXJzY29yZSA9IHJvb3QuXztcblxuICAvLyBTYXZlIGJ5dGVzIGluIHRoZSBtaW5pZmllZCAoYnV0IG5vdCBnemlwcGVkKSB2ZXJzaW9uOlxuICB2YXIgQXJyYXlQcm90byA9IEFycmF5LnByb3RvdHlwZSwgT2JqUHJvdG8gPSBPYmplY3QucHJvdG90eXBlLCBGdW5jUHJvdG8gPSBGdW5jdGlvbi5wcm90b3R5cGU7XG5cbiAgLy8gQ3JlYXRlIHF1aWNrIHJlZmVyZW5jZSB2YXJpYWJsZXMgZm9yIHNwZWVkIGFjY2VzcyB0byBjb3JlIHByb3RvdHlwZXMuXG4gIHZhclxuICAgIHB1c2ggICAgICAgICAgICAgPSBBcnJheVByb3RvLnB1c2gsXG4gICAgc2xpY2UgICAgICAgICAgICA9IEFycmF5UHJvdG8uc2xpY2UsXG4gICAgdG9TdHJpbmcgICAgICAgICA9IE9ialByb3RvLnRvU3RyaW5nLFxuICAgIGhhc093blByb3BlcnR5ICAgPSBPYmpQcm90by5oYXNPd25Qcm9wZXJ0eTtcblxuICAvLyBBbGwgKipFQ01BU2NyaXB0IDUqKiBuYXRpdmUgZnVuY3Rpb24gaW1wbGVtZW50YXRpb25zIHRoYXQgd2UgaG9wZSB0byB1c2VcbiAgLy8gYXJlIGRlY2xhcmVkIGhlcmUuXG4gIHZhclxuICAgIG5hdGl2ZUlzQXJyYXkgICAgICA9IEFycmF5LmlzQXJyYXksXG4gICAgbmF0aXZlS2V5cyAgICAgICAgID0gT2JqZWN0LmtleXMsXG4gICAgbmF0aXZlQmluZCAgICAgICAgID0gRnVuY1Byb3RvLmJpbmQsXG4gICAgbmF0aXZlQ3JlYXRlICAgICAgID0gT2JqZWN0LmNyZWF0ZTtcblxuICAvLyBOYWtlZCBmdW5jdGlvbiByZWZlcmVuY2UgZm9yIHN1cnJvZ2F0ZS1wcm90b3R5cGUtc3dhcHBpbmcuXG4gIHZhciBDdG9yID0gZnVuY3Rpb24oKXt9O1xuXG4gIC8vIENyZWF0ZSBhIHNhZmUgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgdXNlIGJlbG93LlxuICB2YXIgXyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogaW5zdGFuY2VvZiBfKSByZXR1cm4gb2JqO1xuICAgIGlmICghKHRoaXMgaW5zdGFuY2VvZiBfKSkgcmV0dXJuIG5ldyBfKG9iaik7XG4gICAgdGhpcy5fd3JhcHBlZCA9IG9iajtcbiAgfTtcblxuICAvLyBFeHBvcnQgdGhlIFVuZGVyc2NvcmUgb2JqZWN0IGZvciAqKk5vZGUuanMqKiwgd2l0aFxuICAvLyBiYWNrd2FyZHMtY29tcGF0aWJpbGl0eSBmb3IgdGhlIG9sZCBgcmVxdWlyZSgpYCBBUEkuIElmIHdlJ3JlIGluXG4gIC8vIHRoZSBicm93c2VyLCBhZGQgYF9gIGFzIGEgZ2xvYmFsIG9iamVjdC5cbiAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gXztcbiAgICB9XG4gICAgZXhwb3J0cy5fID0gXztcbiAgfSBlbHNlIHtcbiAgICByb290Ll8gPSBfO1xuICB9XG5cbiAgLy8gQ3VycmVudCB2ZXJzaW9uLlxuICBfLlZFUlNJT04gPSAnMS44LjMnO1xuXG4gIC8vIEludGVybmFsIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyBhbiBlZmZpY2llbnQgKGZvciBjdXJyZW50IGVuZ2luZXMpIHZlcnNpb25cbiAgLy8gb2YgdGhlIHBhc3NlZC1pbiBjYWxsYmFjaywgdG8gYmUgcmVwZWF0ZWRseSBhcHBsaWVkIGluIG90aGVyIFVuZGVyc2NvcmVcbiAgLy8gZnVuY3Rpb25zLlxuICB2YXIgb3B0aW1pemVDYiA9IGZ1bmN0aW9uKGZ1bmMsIGNvbnRleHQsIGFyZ0NvdW50KSB7XG4gICAgaWYgKGNvbnRleHQgPT09IHZvaWQgMCkgcmV0dXJuIGZ1bmM7XG4gICAgc3dpdGNoIChhcmdDb3VudCA9PSBudWxsID8gMyA6IGFyZ0NvdW50KSB7XG4gICAgICBjYXNlIDE6IHJldHVybiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gZnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDI6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgb3RoZXIpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwgb3RoZXIpO1xuICAgICAgfTtcbiAgICAgIGNhc2UgMzogcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbikge1xuICAgICAgICByZXR1cm4gZnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgICB9O1xuICAgICAgY2FzZSA0OiByZXR1cm4gZnVuY3Rpb24oYWNjdW11bGF0b3IsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbikge1xuICAgICAgICByZXR1cm4gZnVuYy5jYWxsKGNvbnRleHQsIGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkoY29udGV4dCwgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEEgbW9zdGx5LWludGVybmFsIGZ1bmN0aW9uIHRvIGdlbmVyYXRlIGNhbGxiYWNrcyB0aGF0IGNhbiBiZSBhcHBsaWVkXG4gIC8vIHRvIGVhY2ggZWxlbWVudCBpbiBhIGNvbGxlY3Rpb24sIHJldHVybmluZyB0aGUgZGVzaXJlZCByZXN1bHQg4oCUIGVpdGhlclxuICAvLyBpZGVudGl0eSwgYW4gYXJiaXRyYXJ5IGNhbGxiYWNrLCBhIHByb3BlcnR5IG1hdGNoZXIsIG9yIGEgcHJvcGVydHkgYWNjZXNzb3IuXG4gIHZhciBjYiA9IGZ1bmN0aW9uKHZhbHVlLCBjb250ZXh0LCBhcmdDb3VudCkge1xuICAgIGlmICh2YWx1ZSA9PSBudWxsKSByZXR1cm4gXy5pZGVudGl0eTtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKHZhbHVlKSkgcmV0dXJuIG9wdGltaXplQ2IodmFsdWUsIGNvbnRleHQsIGFyZ0NvdW50KTtcbiAgICBpZiAoXy5pc09iamVjdCh2YWx1ZSkpIHJldHVybiBfLm1hdGNoZXIodmFsdWUpO1xuICAgIHJldHVybiBfLnByb3BlcnR5KHZhbHVlKTtcbiAgfTtcbiAgXy5pdGVyYXRlZSA9IGZ1bmN0aW9uKHZhbHVlLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIGNiKHZhbHVlLCBjb250ZXh0LCBJbmZpbml0eSk7XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gZm9yIGNyZWF0aW5nIGFzc2lnbmVyIGZ1bmN0aW9ucy5cbiAgdmFyIGNyZWF0ZUFzc2lnbmVyID0gZnVuY3Rpb24oa2V5c0Z1bmMsIHVuZGVmaW5lZE9ubHkpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICB2YXIgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICAgIGlmIChsZW5ndGggPCAyIHx8IG9iaiA9PSBudWxsKSByZXR1cm4gb2JqO1xuICAgICAgZm9yICh2YXIgaW5kZXggPSAxOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2luZGV4XSxcbiAgICAgICAgICAgIGtleXMgPSBrZXlzRnVuYyhzb3VyY2UpLFxuICAgICAgICAgICAgbCA9IGtleXMubGVuZ3RoO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgICAgIGlmICghdW5kZWZpbmVkT25seSB8fCBvYmpba2V5XSA9PT0gdm9pZCAwKSBvYmpba2V5XSA9IHNvdXJjZVtrZXldO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gb2JqO1xuICAgIH07XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gZm9yIGNyZWF0aW5nIGEgbmV3IG9iamVjdCB0aGF0IGluaGVyaXRzIGZyb20gYW5vdGhlci5cbiAgdmFyIGJhc2VDcmVhdGUgPSBmdW5jdGlvbihwcm90b3R5cGUpIHtcbiAgICBpZiAoIV8uaXNPYmplY3QocHJvdG90eXBlKSkgcmV0dXJuIHt9O1xuICAgIGlmIChuYXRpdmVDcmVhdGUpIHJldHVybiBuYXRpdmVDcmVhdGUocHJvdG90eXBlKTtcbiAgICBDdG9yLnByb3RvdHlwZSA9IHByb3RvdHlwZTtcbiAgICB2YXIgcmVzdWx0ID0gbmV3IEN0b3I7XG4gICAgQ3Rvci5wcm90b3R5cGUgPSBudWxsO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgdmFyIHByb3BlcnR5ID0gZnVuY3Rpb24oa2V5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIG9iaiA9PSBudWxsID8gdm9pZCAwIDogb2JqW2tleV07XG4gICAgfTtcbiAgfTtcblxuICAvLyBIZWxwZXIgZm9yIGNvbGxlY3Rpb24gbWV0aG9kcyB0byBkZXRlcm1pbmUgd2hldGhlciBhIGNvbGxlY3Rpb25cbiAgLy8gc2hvdWxkIGJlIGl0ZXJhdGVkIGFzIGFuIGFycmF5IG9yIGFzIGFuIG9iamVjdFxuICAvLyBSZWxhdGVkOiBodHRwOi8vcGVvcGxlLm1vemlsbGEub3JnL35qb3JlbmRvcmZmL2VzNi1kcmFmdC5odG1sI3NlYy10b2xlbmd0aFxuICAvLyBBdm9pZHMgYSB2ZXJ5IG5hc3R5IGlPUyA4IEpJVCBidWcgb24gQVJNLTY0LiAjMjA5NFxuICB2YXIgTUFYX0FSUkFZX0lOREVYID0gTWF0aC5wb3coMiwgNTMpIC0gMTtcbiAgdmFyIGdldExlbmd0aCA9IHByb3BlcnR5KCdsZW5ndGgnKTtcbiAgdmFyIGlzQXJyYXlMaWtlID0gZnVuY3Rpb24oY29sbGVjdGlvbikge1xuICAgIHZhciBsZW5ndGggPSBnZXRMZW5ndGgoY29sbGVjdGlvbik7XG4gICAgcmV0dXJuIHR5cGVvZiBsZW5ndGggPT0gJ251bWJlcicgJiYgbGVuZ3RoID49IDAgJiYgbGVuZ3RoIDw9IE1BWF9BUlJBWV9JTkRFWDtcbiAgfTtcblxuICAvLyBDb2xsZWN0aW9uIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFRoZSBjb3JuZXJzdG9uZSwgYW4gYGVhY2hgIGltcGxlbWVudGF0aW9uLCBha2EgYGZvckVhY2hgLlxuICAvLyBIYW5kbGVzIHJhdyBvYmplY3RzIGluIGFkZGl0aW9uIHRvIGFycmF5LWxpa2VzLiBUcmVhdHMgYWxsXG4gIC8vIHNwYXJzZSBhcnJheS1saWtlcyBhcyBpZiB0aGV5IHdlcmUgZGVuc2UuXG4gIF8uZWFjaCA9IF8uZm9yRWFjaCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBpLCBsZW5ndGg7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHtcbiAgICAgIGZvciAoaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpdGVyYXRlZShvYmpbaV0sIGksIG9iaik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgICBmb3IgKGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGl0ZXJhdGVlKG9ialtrZXlzW2ldXSwga2V5c1tpXSwgb2JqKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIHJlc3VsdHMgb2YgYXBwbHlpbmcgdGhlIGl0ZXJhdGVlIHRvIGVhY2ggZWxlbWVudC5cbiAgXy5tYXAgPSBfLmNvbGxlY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGgsXG4gICAgICAgIHJlc3VsdHMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICByZXN1bHRzW2luZGV4XSA9IGl0ZXJhdGVlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgcmVkdWNpbmcgZnVuY3Rpb24gaXRlcmF0aW5nIGxlZnQgb3IgcmlnaHQuXG4gIGZ1bmN0aW9uIGNyZWF0ZVJlZHVjZShkaXIpIHtcbiAgICAvLyBPcHRpbWl6ZWQgaXRlcmF0b3IgZnVuY3Rpb24gYXMgdXNpbmcgYXJndW1lbnRzLmxlbmd0aFxuICAgIC8vIGluIHRoZSBtYWluIGZ1bmN0aW9uIHdpbGwgZGVvcHRpbWl6ZSB0aGUsIHNlZSAjMTk5MS5cbiAgICBmdW5jdGlvbiBpdGVyYXRvcihvYmosIGl0ZXJhdGVlLCBtZW1vLCBrZXlzLCBpbmRleCwgbGVuZ3RoKSB7XG4gICAgICBmb3IgKDsgaW5kZXggPj0gMCAmJiBpbmRleCA8IGxlbmd0aDsgaW5kZXggKz0gZGlyKSB7XG4gICAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICAgIG1lbW8gPSBpdGVyYXRlZShtZW1vLCBvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgICB9XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgbWVtbywgY29udGV4dCkge1xuICAgICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0LCA0KTtcbiAgICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGgsXG4gICAgICAgICAgaW5kZXggPSBkaXIgPiAwID8gMCA6IGxlbmd0aCAtIDE7XG4gICAgICAvLyBEZXRlcm1pbmUgdGhlIGluaXRpYWwgdmFsdWUgaWYgbm9uZSBpcyBwcm92aWRlZC5cbiAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoIDwgMykge1xuICAgICAgICBtZW1vID0gb2JqW2tleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4XTtcbiAgICAgICAgaW5kZXggKz0gZGlyO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGl0ZXJhdG9yKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGtleXMsIGluZGV4LCBsZW5ndGgpO1xuICAgIH07XG4gIH1cblxuICAvLyAqKlJlZHVjZSoqIGJ1aWxkcyB1cCBhIHNpbmdsZSByZXN1bHQgZnJvbSBhIGxpc3Qgb2YgdmFsdWVzLCBha2EgYGluamVjdGAsXG4gIC8vIG9yIGBmb2xkbGAuXG4gIF8ucmVkdWNlID0gXy5mb2xkbCA9IF8uaW5qZWN0ID0gY3JlYXRlUmVkdWNlKDEpO1xuXG4gIC8vIFRoZSByaWdodC1hc3NvY2lhdGl2ZSB2ZXJzaW9uIG9mIHJlZHVjZSwgYWxzbyBrbm93biBhcyBgZm9sZHJgLlxuICBfLnJlZHVjZVJpZ2h0ID0gXy5mb2xkciA9IGNyZWF0ZVJlZHVjZSgtMSk7XG5cbiAgLy8gUmV0dXJuIHRoZSBmaXJzdCB2YWx1ZSB3aGljaCBwYXNzZXMgYSB0cnV0aCB0ZXN0LiBBbGlhc2VkIGFzIGBkZXRlY3RgLlxuICBfLmZpbmQgPSBfLmRldGVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgdmFyIGtleTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSkge1xuICAgICAga2V5ID0gXy5maW5kSW5kZXgob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrZXkgPSBfLmZpbmRLZXkob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIH1cbiAgICBpZiAoa2V5ICE9PSB2b2lkIDAgJiYga2V5ICE9PSAtMSkgcmV0dXJuIG9ialtrZXldO1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIHRoYXQgcGFzcyBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYHNlbGVjdGAuXG4gIF8uZmlsdGVyID0gXy5zZWxlY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHRzID0gW107XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIGlmIChwcmVkaWNhdGUodmFsdWUsIGluZGV4LCBsaXN0KSkgcmVzdWx0cy5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyBmb3Igd2hpY2ggYSB0cnV0aCB0ZXN0IGZhaWxzLlxuICBfLnJlamVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgXy5uZWdhdGUoY2IocHJlZGljYXRlKSksIGNvbnRleHQpO1xuICB9O1xuXG4gIC8vIERldGVybWluZSB3aGV0aGVyIGFsbCBvZiB0aGUgZWxlbWVudHMgbWF0Y2ggYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBhbGxgLlxuICBfLmV2ZXJ5ID0gXy5hbGwgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgIGlmICghcHJlZGljYXRlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgYXQgbGVhc3Qgb25lIGVsZW1lbnQgaW4gdGhlIG9iamVjdCBtYXRjaGVzIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgYW55YC5cbiAgXy5zb21lID0gXy5hbnkgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgbGVuZ3RoID0gKGtleXMgfHwgb2JqKS5sZW5ndGg7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgIGlmIChwcmVkaWNhdGUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopKSByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiB0aGUgYXJyYXkgb3Igb2JqZWN0IGNvbnRhaW5zIGEgZ2l2ZW4gaXRlbSAodXNpbmcgYD09PWApLlxuICAvLyBBbGlhc2VkIGFzIGBpbmNsdWRlc2AgYW5kIGBpbmNsdWRlYC5cbiAgXy5jb250YWlucyA9IF8uaW5jbHVkZXMgPSBfLmluY2x1ZGUgPSBmdW5jdGlvbihvYmosIGl0ZW0sIGZyb21JbmRleCwgZ3VhcmQpIHtcbiAgICBpZiAoIWlzQXJyYXlMaWtlKG9iaikpIG9iaiA9IF8udmFsdWVzKG9iaik7XG4gICAgaWYgKHR5cGVvZiBmcm9tSW5kZXggIT0gJ251bWJlcicgfHwgZ3VhcmQpIGZyb21JbmRleCA9IDA7XG4gICAgcmV0dXJuIF8uaW5kZXhPZihvYmosIGl0ZW0sIGZyb21JbmRleCkgPj0gMDtcbiAgfTtcblxuICAvLyBJbnZva2UgYSBtZXRob2QgKHdpdGggYXJndW1lbnRzKSBvbiBldmVyeSBpdGVtIGluIGEgY29sbGVjdGlvbi5cbiAgXy5pbnZva2UgPSBmdW5jdGlvbihvYmosIG1ldGhvZCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBpc0Z1bmMgPSBfLmlzRnVuY3Rpb24obWV0aG9kKTtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgdmFyIGZ1bmMgPSBpc0Z1bmMgPyBtZXRob2QgOiB2YWx1ZVttZXRob2RdO1xuICAgICAgcmV0dXJuIGZ1bmMgPT0gbnVsbCA/IGZ1bmMgOiBmdW5jLmFwcGx5KHZhbHVlLCBhcmdzKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBtYXBgOiBmZXRjaGluZyBhIHByb3BlcnR5LlxuICBfLnBsdWNrID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gXy5tYXAob2JqLCBfLnByb3BlcnR5KGtleSkpO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYGZpbHRlcmA6IHNlbGVjdGluZyBvbmx5IG9iamVjdHNcbiAgLy8gY29udGFpbmluZyBzcGVjaWZpYyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy53aGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIob2JqLCBfLm1hdGNoZXIoYXR0cnMpKTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaW5kYDogZ2V0dGluZyB0aGUgZmlyc3Qgb2JqZWN0XG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uZmluZFdoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycykge1xuICAgIHJldHVybiBfLmZpbmQob2JqLCBfLm1hdGNoZXIoYXR0cnMpKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG1heGltdW0gZWxlbWVudCAob3IgZWxlbWVudC1iYXNlZCBjb21wdXRhdGlvbikuXG4gIF8ubWF4ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQgPSAtSW5maW5pdHksIGxhc3RDb21wdXRlZCA9IC1JbmZpbml0eSxcbiAgICAgICAgdmFsdWUsIGNvbXB1dGVkO1xuICAgIGlmIChpdGVyYXRlZSA9PSBudWxsICYmIG9iaiAhPSBudWxsKSB7XG4gICAgICBvYmogPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFsdWUgPSBvYmpbaV07XG4gICAgICAgIGlmICh2YWx1ZSA+IHJlc3VsdCkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICAgICAgaWYgKGNvbXB1dGVkID4gbGFzdENvbXB1dGVkIHx8IGNvbXB1dGVkID09PSAtSW5maW5pdHkgJiYgcmVzdWx0ID09PSAtSW5maW5pdHkpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgICBsYXN0Q29tcHV0ZWQgPSBjb21wdXRlZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtaW5pbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1pbiA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gSW5maW5pdHksIGxhc3RDb21wdXRlZCA9IEluZmluaXR5LFxuICAgICAgICB2YWx1ZSwgY29tcHV0ZWQ7XG4gICAgaWYgKGl0ZXJhdGVlID09IG51bGwgJiYgb2JqICE9IG51bGwpIHtcbiAgICAgIG9iaiA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB2YWx1ZSA9IG9ialtpXTtcbiAgICAgICAgaWYgKHZhbHVlIDwgcmVzdWx0KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgICAgICBpZiAoY29tcHV0ZWQgPCBsYXN0Q29tcHV0ZWQgfHwgY29tcHV0ZWQgPT09IEluZmluaXR5ICYmIHJlc3VsdCA9PT0gSW5maW5pdHkpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgICBsYXN0Q29tcHV0ZWQgPSBjb21wdXRlZDtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gU2h1ZmZsZSBhIGNvbGxlY3Rpb24sIHVzaW5nIHRoZSBtb2Rlcm4gdmVyc2lvbiBvZiB0aGVcbiAgLy8gW0Zpc2hlci1ZYXRlcyBzaHVmZmxlXShodHRwOi8vZW4ud2lraXBlZGlhLm9yZy93aWtpL0Zpc2hlcuKAk1lhdGVzX3NodWZmbGUpLlxuICBfLnNodWZmbGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgc2V0ID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IHNldC5sZW5ndGg7XG4gICAgdmFyIHNodWZmbGVkID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpbmRleCA9IDAsIHJhbmQ7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICByYW5kID0gXy5yYW5kb20oMCwgaW5kZXgpO1xuICAgICAgaWYgKHJhbmQgIT09IGluZGV4KSBzaHVmZmxlZFtpbmRleF0gPSBzaHVmZmxlZFtyYW5kXTtcbiAgICAgIHNodWZmbGVkW3JhbmRdID0gc2V0W2luZGV4XTtcbiAgICB9XG4gICAgcmV0dXJuIHNodWZmbGVkO1xuICB9O1xuXG4gIC8vIFNhbXBsZSAqKm4qKiByYW5kb20gdmFsdWVzIGZyb20gYSBjb2xsZWN0aW9uLlxuICAvLyBJZiAqKm4qKiBpcyBub3Qgc3BlY2lmaWVkLCByZXR1cm5zIGEgc2luZ2xlIHJhbmRvbSBlbGVtZW50LlxuICAvLyBUaGUgaW50ZXJuYWwgYGd1YXJkYCBhcmd1bWVudCBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBtYXBgLlxuICBfLnNhbXBsZSA9IGZ1bmN0aW9uKG9iaiwgbiwgZ3VhcmQpIHtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSB7XG4gICAgICBpZiAoIWlzQXJyYXlMaWtlKG9iaikpIG9iaiA9IF8udmFsdWVzKG9iaik7XG4gICAgICByZXR1cm4gb2JqW18ucmFuZG9tKG9iai5sZW5ndGggLSAxKV07XG4gICAgfVxuICAgIHJldHVybiBfLnNodWZmbGUob2JqKS5zbGljZSgwLCBNYXRoLm1heCgwLCBuKSk7XG4gIH07XG5cbiAgLy8gU29ydCB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uIHByb2R1Y2VkIGJ5IGFuIGl0ZXJhdGVlLlxuICBfLnNvcnRCeSA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICByZXR1cm4gXy5wbHVjayhfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdmFsdWU6IHZhbHVlLFxuICAgICAgICBpbmRleDogaW5kZXgsXG4gICAgICAgIGNyaXRlcmlhOiBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIGxpc3QpXG4gICAgICB9O1xuICAgIH0pLnNvcnQoZnVuY3Rpb24obGVmdCwgcmlnaHQpIHtcbiAgICAgIHZhciBhID0gbGVmdC5jcml0ZXJpYTtcbiAgICAgIHZhciBiID0gcmlnaHQuY3JpdGVyaWE7XG4gICAgICBpZiAoYSAhPT0gYikge1xuICAgICAgICBpZiAoYSA+IGIgfHwgYSA9PT0gdm9pZCAwKSByZXR1cm4gMTtcbiAgICAgICAgaWYgKGEgPCBiIHx8IGIgPT09IHZvaWQgMCkgcmV0dXJuIC0xO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGxlZnQuaW5kZXggLSByaWdodC5pbmRleDtcbiAgICB9KSwgJ3ZhbHVlJyk7XG4gIH07XG5cbiAgLy8gQW4gaW50ZXJuYWwgZnVuY3Rpb24gdXNlZCBmb3IgYWdncmVnYXRlIFwiZ3JvdXAgYnlcIiBvcGVyYXRpb25zLlxuICB2YXIgZ3JvdXAgPSBmdW5jdGlvbihiZWhhdmlvcikge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCkge1xuICAgICAgICB2YXIga2V5ID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBvYmopO1xuICAgICAgICBiZWhhdmlvcihyZXN1bHQsIHZhbHVlLCBrZXkpO1xuICAgICAgfSk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gR3JvdXBzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24uIFBhc3MgZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZVxuICAvLyB0byBncm91cCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlIGNyaXRlcmlvbi5cbiAgXy5ncm91cEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCB2YWx1ZSwga2V5KSB7XG4gICAgaWYgKF8uaGFzKHJlc3VsdCwga2V5KSkgcmVzdWx0W2tleV0ucHVzaCh2YWx1ZSk7IGVsc2UgcmVzdWx0W2tleV0gPSBbdmFsdWVdO1xuICB9KTtcblxuICAvLyBJbmRleGVzIHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24sIHNpbWlsYXIgdG8gYGdyb3VwQnlgLCBidXQgZm9yXG4gIC8vIHdoZW4geW91IGtub3cgdGhhdCB5b3VyIGluZGV4IHZhbHVlcyB3aWxsIGJlIHVuaXF1ZS5cbiAgXy5pbmRleEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCB2YWx1ZSwga2V5KSB7XG4gICAgcmVzdWx0W2tleV0gPSB2YWx1ZTtcbiAgfSk7XG5cbiAgLy8gQ291bnRzIGluc3RhbmNlcyBvZiBhbiBvYmplY3QgdGhhdCBncm91cCBieSBhIGNlcnRhaW4gY3JpdGVyaW9uLiBQYXNzXG4gIC8vIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGUgdG8gY291bnQgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZVxuICAvLyBjcml0ZXJpb24uXG4gIF8uY291bnRCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIGlmIChfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldKys7IGVsc2UgcmVzdWx0W2tleV0gPSAxO1xuICB9KTtcblxuICAvLyBTYWZlbHkgY3JlYXRlIGEgcmVhbCwgbGl2ZSBhcnJheSBmcm9tIGFueXRoaW5nIGl0ZXJhYmxlLlxuICBfLnRvQXJyYXkgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIW9iaikgcmV0dXJuIFtdO1xuICAgIGlmIChfLmlzQXJyYXkob2JqKSkgcmV0dXJuIHNsaWNlLmNhbGwob2JqKTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSkgcmV0dXJuIF8ubWFwKG9iaiwgXy5pZGVudGl0eSk7XG4gICAgcmV0dXJuIF8udmFsdWVzKG9iaik7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBudW1iZXIgb2YgZWxlbWVudHMgaW4gYW4gb2JqZWN0LlxuICBfLnNpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiAwO1xuICAgIHJldHVybiBpc0FycmF5TGlrZShvYmopID8gb2JqLmxlbmd0aCA6IF8ua2V5cyhvYmopLmxlbmd0aDtcbiAgfTtcblxuICAvLyBTcGxpdCBhIGNvbGxlY3Rpb24gaW50byB0d28gYXJyYXlzOiBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIHNhdGlzZnkgdGhlIGdpdmVuXG4gIC8vIHByZWRpY2F0ZSwgYW5kIG9uZSB3aG9zZSBlbGVtZW50cyBhbGwgZG8gbm90IHNhdGlzZnkgdGhlIHByZWRpY2F0ZS5cbiAgXy5wYXJ0aXRpb24gPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIHBhc3MgPSBbXSwgZmFpbCA9IFtdO1xuICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBrZXksIG9iaikge1xuICAgICAgKHByZWRpY2F0ZSh2YWx1ZSwga2V5LCBvYmopID8gcGFzcyA6IGZhaWwpLnB1c2godmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiBbcGFzcywgZmFpbF07XG4gIH07XG5cbiAgLy8gQXJyYXkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEdldCB0aGUgZmlyc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgZmlyc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LiBBbGlhc2VkIGFzIGBoZWFkYCBhbmQgYHRha2VgLiBUaGUgKipndWFyZCoqIGNoZWNrXG4gIC8vIGFsbG93cyBpdCB0byB3b3JrIHdpdGggYF8ubWFwYC5cbiAgXy5maXJzdCA9IF8uaGVhZCA9IF8udGFrZSA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gdm9pZCAwO1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHJldHVybiBhcnJheVswXTtcbiAgICByZXR1cm4gXy5pbml0aWFsKGFycmF5LCBhcnJheS5sZW5ndGggLSBuKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGV2ZXJ5dGhpbmcgYnV0IHRoZSBsYXN0IGVudHJ5IG9mIHRoZSBhcnJheS4gRXNwZWNpYWxseSB1c2VmdWwgb25cbiAgLy8gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gYWxsIHRoZSB2YWx1ZXMgaW5cbiAgLy8gdGhlIGFycmF5LCBleGNsdWRpbmcgdGhlIGxhc3QgTi5cbiAgXy5pbml0aWFsID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIDAsIE1hdGgubWF4KDAsIGFycmF5Lmxlbmd0aCAtIChuID09IG51bGwgfHwgZ3VhcmQgPyAxIDogbikpKTtcbiAgfTtcblxuICAvLyBHZXQgdGhlIGxhc3QgZWxlbWVudCBvZiBhbiBhcnJheS4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiB0aGUgbGFzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuXG4gIF8ubGFzdCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIGlmIChhcnJheSA9PSBudWxsKSByZXR1cm4gdm9pZCAwO1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHJldHVybiBhcnJheVthcnJheS5sZW5ndGggLSAxXTtcbiAgICByZXR1cm4gXy5yZXN0KGFycmF5LCBNYXRoLm1heCgwLCBhcnJheS5sZW5ndGggLSBuKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgZmlyc3QgZW50cnkgb2YgdGhlIGFycmF5LiBBbGlhc2VkIGFzIGB0YWlsYCBhbmQgYGRyb3BgLlxuICAvLyBFc3BlY2lhbGx5IHVzZWZ1bCBvbiB0aGUgYXJndW1lbnRzIG9iamVjdC4gUGFzc2luZyBhbiAqKm4qKiB3aWxsIHJldHVyblxuICAvLyB0aGUgcmVzdCBOIHZhbHVlcyBpbiB0aGUgYXJyYXkuXG4gIF8ucmVzdCA9IF8udGFpbCA9IF8uZHJvcCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCBuID09IG51bGwgfHwgZ3VhcmQgPyAxIDogbik7XG4gIH07XG5cbiAgLy8gVHJpbSBvdXQgYWxsIGZhbHN5IHZhbHVlcyBmcm9tIGFuIGFycmF5LlxuICBfLmNvbXBhY3QgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgXy5pZGVudGl0eSk7XG4gIH07XG5cbiAgLy8gSW50ZXJuYWwgaW1wbGVtZW50YXRpb24gb2YgYSByZWN1cnNpdmUgYGZsYXR0ZW5gIGZ1bmN0aW9uLlxuICB2YXIgZmxhdHRlbiA9IGZ1bmN0aW9uKGlucHV0LCBzaGFsbG93LCBzdHJpY3QsIHN0YXJ0SW5kZXgpIHtcbiAgICB2YXIgb3V0cHV0ID0gW10sIGlkeCA9IDA7XG4gICAgZm9yICh2YXIgaSA9IHN0YXJ0SW5kZXggfHwgMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGlucHV0KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgdmFsdWUgPSBpbnB1dFtpXTtcbiAgICAgIGlmIChpc0FycmF5TGlrZSh2YWx1ZSkgJiYgKF8uaXNBcnJheSh2YWx1ZSkgfHwgXy5pc0FyZ3VtZW50cyh2YWx1ZSkpKSB7XG4gICAgICAgIC8vZmxhdHRlbiBjdXJyZW50IGxldmVsIG9mIGFycmF5IG9yIGFyZ3VtZW50cyBvYmplY3RcbiAgICAgICAgaWYgKCFzaGFsbG93KSB2YWx1ZSA9IGZsYXR0ZW4odmFsdWUsIHNoYWxsb3csIHN0cmljdCk7XG4gICAgICAgIHZhciBqID0gMCwgbGVuID0gdmFsdWUubGVuZ3RoO1xuICAgICAgICBvdXRwdXQubGVuZ3RoICs9IGxlbjtcbiAgICAgICAgd2hpbGUgKGogPCBsZW4pIHtcbiAgICAgICAgICBvdXRwdXRbaWR4KytdID0gdmFsdWVbaisrXTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghc3RyaWN0KSB7XG4gICAgICAgIG91dHB1dFtpZHgrK10gPSB2YWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG91dHB1dDtcbiAgfTtcblxuICAvLyBGbGF0dGVuIG91dCBhbiBhcnJheSwgZWl0aGVyIHJlY3Vyc2l2ZWx5IChieSBkZWZhdWx0KSwgb3IganVzdCBvbmUgbGV2ZWwuXG4gIF8uZmxhdHRlbiA9IGZ1bmN0aW9uKGFycmF5LCBzaGFsbG93KSB7XG4gICAgcmV0dXJuIGZsYXR0ZW4oYXJyYXksIHNoYWxsb3csIGZhbHNlKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSB2ZXJzaW9uIG9mIHRoZSBhcnJheSB0aGF0IGRvZXMgbm90IGNvbnRhaW4gdGhlIHNwZWNpZmllZCB2YWx1ZShzKS5cbiAgXy53aXRob3V0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5kaWZmZXJlbmNlKGFycmF5LCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYSBkdXBsaWNhdGUtZnJlZSB2ZXJzaW9uIG9mIHRoZSBhcnJheS4gSWYgdGhlIGFycmF5IGhhcyBhbHJlYWR5XG4gIC8vIGJlZW4gc29ydGVkLCB5b3UgaGF2ZSB0aGUgb3B0aW9uIG9mIHVzaW5nIGEgZmFzdGVyIGFsZ29yaXRobS5cbiAgLy8gQWxpYXNlZCBhcyBgdW5pcXVlYC5cbiAgXy51bmlxID0gXy51bmlxdWUgPSBmdW5jdGlvbihhcnJheSwgaXNTb3J0ZWQsIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaWYgKCFfLmlzQm9vbGVhbihpc1NvcnRlZCkpIHtcbiAgICAgIGNvbnRleHQgPSBpdGVyYXRlZTtcbiAgICAgIGl0ZXJhdGVlID0gaXNTb3J0ZWQ7XG4gICAgICBpc1NvcnRlZCA9IGZhbHNlO1xuICAgIH1cbiAgICBpZiAoaXRlcmF0ZWUgIT0gbnVsbCkgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHZhciBzZWVuID0gW107XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHZhbHVlID0gYXJyYXlbaV0sXG4gICAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZSA/IGl0ZXJhdGVlKHZhbHVlLCBpLCBhcnJheSkgOiB2YWx1ZTtcbiAgICAgIGlmIChpc1NvcnRlZCkge1xuICAgICAgICBpZiAoIWkgfHwgc2VlbiAhPT0gY29tcHV0ZWQpIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgICAgc2VlbiA9IGNvbXB1dGVkO1xuICAgICAgfSBlbHNlIGlmIChpdGVyYXRlZSkge1xuICAgICAgICBpZiAoIV8uY29udGFpbnMoc2VlbiwgY29tcHV0ZWQpKSB7XG4gICAgICAgICAgc2Vlbi5wdXNoKGNvbXB1dGVkKTtcbiAgICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIV8uY29udGFpbnMocmVzdWx0LCB2YWx1ZSkpIHtcbiAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYW4gYXJyYXkgdGhhdCBjb250YWlucyB0aGUgdW5pb246IGVhY2ggZGlzdGluY3QgZWxlbWVudCBmcm9tIGFsbCBvZlxuICAvLyB0aGUgcGFzc2VkLWluIGFycmF5cy5cbiAgXy51bmlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuaXEoZmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgZXZlcnkgaXRlbSBzaGFyZWQgYmV0d2VlbiBhbGwgdGhlXG4gIC8vIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8uaW50ZXJzZWN0aW9uID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgdmFyIGFyZ3NMZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBpdGVtID0gYXJyYXlbaV07XG4gICAgICBpZiAoXy5jb250YWlucyhyZXN1bHQsIGl0ZW0pKSBjb250aW51ZTtcbiAgICAgIGZvciAodmFyIGogPSAxOyBqIDwgYXJnc0xlbmd0aDsgaisrKSB7XG4gICAgICAgIGlmICghXy5jb250YWlucyhhcmd1bWVudHNbal0sIGl0ZW0pKSBicmVhaztcbiAgICAgIH1cbiAgICAgIGlmIChqID09PSBhcmdzTGVuZ3RoKSByZXN1bHQucHVzaChpdGVtKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBUYWtlIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gb25lIGFycmF5IGFuZCBhIG51bWJlciBvZiBvdGhlciBhcnJheXMuXG4gIC8vIE9ubHkgdGhlIGVsZW1lbnRzIHByZXNlbnQgaW4ganVzdCB0aGUgZmlyc3QgYXJyYXkgd2lsbCByZW1haW4uXG4gIF8uZGlmZmVyZW5jZSA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3QgPSBmbGF0dGVuKGFyZ3VtZW50cywgdHJ1ZSwgdHJ1ZSwgMSk7XG4gICAgcmV0dXJuIF8uZmlsdGVyKGFycmF5LCBmdW5jdGlvbih2YWx1ZSl7XG4gICAgICByZXR1cm4gIV8uY29udGFpbnMocmVzdCwgdmFsdWUpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIFppcCB0b2dldGhlciBtdWx0aXBsZSBsaXN0cyBpbnRvIGEgc2luZ2xlIGFycmF5IC0tIGVsZW1lbnRzIHRoYXQgc2hhcmVcbiAgLy8gYW4gaW5kZXggZ28gdG9nZXRoZXIuXG4gIF8uemlwID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIF8udW56aXAoYXJndW1lbnRzKTtcbiAgfTtcblxuICAvLyBDb21wbGVtZW50IG9mIF8uemlwLiBVbnppcCBhY2NlcHRzIGFuIGFycmF5IG9mIGFycmF5cyBhbmQgZ3JvdXBzXG4gIC8vIGVhY2ggYXJyYXkncyBlbGVtZW50cyBvbiBzaGFyZWQgaW5kaWNlc1xuICBfLnVuemlwID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgbGVuZ3RoID0gYXJyYXkgJiYgXy5tYXgoYXJyYXksIGdldExlbmd0aCkubGVuZ3RoIHx8IDA7XG4gICAgdmFyIHJlc3VsdCA9IEFycmF5KGxlbmd0aCk7XG5cbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICByZXN1bHRbaW5kZXhdID0gXy5wbHVjayhhcnJheSwgaW5kZXgpO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIENvbnZlcnRzIGxpc3RzIGludG8gb2JqZWN0cy4gUGFzcyBlaXRoZXIgYSBzaW5nbGUgYXJyYXkgb2YgYFtrZXksIHZhbHVlXWBcbiAgLy8gcGFpcnMsIG9yIHR3byBwYXJhbGxlbCBhcnJheXMgb2YgdGhlIHNhbWUgbGVuZ3RoIC0tIG9uZSBvZiBrZXlzLCBhbmQgb25lIG9mXG4gIC8vIHRoZSBjb3JyZXNwb25kaW5nIHZhbHVlcy5cbiAgXy5vYmplY3QgPSBmdW5jdGlvbihsaXN0LCB2YWx1ZXMpIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChsaXN0KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAodmFsdWVzKSB7XG4gICAgICAgIHJlc3VsdFtsaXN0W2ldXSA9IHZhbHVlc1tpXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdFtsaXN0W2ldWzBdXSA9IGxpc3RbaV1bMV07XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gR2VuZXJhdG9yIGZ1bmN0aW9uIHRvIGNyZWF0ZSB0aGUgZmluZEluZGV4IGFuZCBmaW5kTGFzdEluZGV4IGZ1bmN0aW9uc1xuICBmdW5jdGlvbiBjcmVhdGVQcmVkaWNhdGVJbmRleEZpbmRlcihkaXIpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oYXJyYXksIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICAgIHZhciBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpO1xuICAgICAgdmFyIGluZGV4ID0gZGlyID4gMCA/IDAgOiBsZW5ndGggLSAxO1xuICAgICAgZm9yICg7IGluZGV4ID49IDAgJiYgaW5kZXggPCBsZW5ndGg7IGluZGV4ICs9IGRpcikge1xuICAgICAgICBpZiAocHJlZGljYXRlKGFycmF5W2luZGV4XSwgaW5kZXgsIGFycmF5KSkgcmV0dXJuIGluZGV4O1xuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBpbmRleCBvbiBhbiBhcnJheS1saWtlIHRoYXQgcGFzc2VzIGEgcHJlZGljYXRlIHRlc3RcbiAgXy5maW5kSW5kZXggPSBjcmVhdGVQcmVkaWNhdGVJbmRleEZpbmRlcigxKTtcbiAgXy5maW5kTGFzdEluZGV4ID0gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoLTEpO1xuXG4gIC8vIFVzZSBhIGNvbXBhcmF0b3IgZnVuY3Rpb24gdG8gZmlndXJlIG91dCB0aGUgc21hbGxlc3QgaW5kZXggYXQgd2hpY2hcbiAgLy8gYW4gb2JqZWN0IHNob3VsZCBiZSBpbnNlcnRlZCBzbyBhcyB0byBtYWludGFpbiBvcmRlci4gVXNlcyBiaW5hcnkgc2VhcmNoLlxuICBfLnNvcnRlZEluZGV4ID0gZnVuY3Rpb24oYXJyYXksIG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0LCAxKTtcbiAgICB2YXIgdmFsdWUgPSBpdGVyYXRlZShvYmopO1xuICAgIHZhciBsb3cgPSAwLCBoaWdoID0gZ2V0TGVuZ3RoKGFycmF5KTtcbiAgICB3aGlsZSAobG93IDwgaGlnaCkge1xuICAgICAgdmFyIG1pZCA9IE1hdGguZmxvb3IoKGxvdyArIGhpZ2gpIC8gMik7XG4gICAgICBpZiAoaXRlcmF0ZWUoYXJyYXlbbWlkXSkgPCB2YWx1ZSkgbG93ID0gbWlkICsgMTsgZWxzZSBoaWdoID0gbWlkO1xuICAgIH1cbiAgICByZXR1cm4gbG93O1xuICB9O1xuXG4gIC8vIEdlbmVyYXRvciBmdW5jdGlvbiB0byBjcmVhdGUgdGhlIGluZGV4T2YgYW5kIGxhc3RJbmRleE9mIGZ1bmN0aW9uc1xuICBmdW5jdGlvbiBjcmVhdGVJbmRleEZpbmRlcihkaXIsIHByZWRpY2F0ZUZpbmQsIHNvcnRlZEluZGV4KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFycmF5LCBpdGVtLCBpZHgpIHtcbiAgICAgIHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTtcbiAgICAgIGlmICh0eXBlb2YgaWR4ID09ICdudW1iZXInKSB7XG4gICAgICAgIGlmIChkaXIgPiAwKSB7XG4gICAgICAgICAgICBpID0gaWR4ID49IDAgPyBpZHggOiBNYXRoLm1heChpZHggKyBsZW5ndGgsIGkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGVuZ3RoID0gaWR4ID49IDAgPyBNYXRoLm1pbihpZHggKyAxLCBsZW5ndGgpIDogaWR4ICsgbGVuZ3RoICsgMTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChzb3J0ZWRJbmRleCAmJiBpZHggJiYgbGVuZ3RoKSB7XG4gICAgICAgIGlkeCA9IHNvcnRlZEluZGV4KGFycmF5LCBpdGVtKTtcbiAgICAgICAgcmV0dXJuIGFycmF5W2lkeF0gPT09IGl0ZW0gPyBpZHggOiAtMTtcbiAgICAgIH1cbiAgICAgIGlmIChpdGVtICE9PSBpdGVtKSB7XG4gICAgICAgIGlkeCA9IHByZWRpY2F0ZUZpbmQoc2xpY2UuY2FsbChhcnJheSwgaSwgbGVuZ3RoKSwgXy5pc05hTik7XG4gICAgICAgIHJldHVybiBpZHggPj0gMCA/IGlkeCArIGkgOiAtMTtcbiAgICAgIH1cbiAgICAgIGZvciAoaWR4ID0gZGlyID4gMCA/IGkgOiBsZW5ndGggLSAxOyBpZHggPj0gMCAmJiBpZHggPCBsZW5ndGg7IGlkeCArPSBkaXIpIHtcbiAgICAgICAgaWYgKGFycmF5W2lkeF0gPT09IGl0ZW0pIHJldHVybiBpZHg7XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG4gICAgfTtcbiAgfVxuXG4gIC8vIFJldHVybiB0aGUgcG9zaXRpb24gb2YgdGhlIGZpcnN0IG9jY3VycmVuY2Ugb2YgYW4gaXRlbSBpbiBhbiBhcnJheSxcbiAgLy8gb3IgLTEgaWYgdGhlIGl0ZW0gaXMgbm90IGluY2x1ZGVkIGluIHRoZSBhcnJheS5cbiAgLy8gSWYgdGhlIGFycmF5IGlzIGxhcmdlIGFuZCBhbHJlYWR5IGluIHNvcnQgb3JkZXIsIHBhc3MgYHRydWVgXG4gIC8vIGZvciAqKmlzU29ydGVkKiogdG8gdXNlIGJpbmFyeSBzZWFyY2guXG4gIF8uaW5kZXhPZiA9IGNyZWF0ZUluZGV4RmluZGVyKDEsIF8uZmluZEluZGV4LCBfLnNvcnRlZEluZGV4KTtcbiAgXy5sYXN0SW5kZXhPZiA9IGNyZWF0ZUluZGV4RmluZGVyKC0xLCBfLmZpbmRMYXN0SW5kZXgpO1xuXG4gIC8vIEdlbmVyYXRlIGFuIGludGVnZXIgQXJyYXkgY29udGFpbmluZyBhbiBhcml0aG1ldGljIHByb2dyZXNzaW9uLiBBIHBvcnQgb2ZcbiAgLy8gdGhlIG5hdGl2ZSBQeXRob24gYHJhbmdlKClgIGZ1bmN0aW9uLiBTZWVcbiAgLy8gW3RoZSBQeXRob24gZG9jdW1lbnRhdGlvbl0oaHR0cDovL2RvY3MucHl0aG9uLm9yZy9saWJyYXJ5L2Z1bmN0aW9ucy5odG1sI3JhbmdlKS5cbiAgXy5yYW5nZSA9IGZ1bmN0aW9uKHN0YXJ0LCBzdG9wLCBzdGVwKSB7XG4gICAgaWYgKHN0b3AgPT0gbnVsbCkge1xuICAgICAgc3RvcCA9IHN0YXJ0IHx8IDA7XG4gICAgICBzdGFydCA9IDA7XG4gICAgfVxuICAgIHN0ZXAgPSBzdGVwIHx8IDE7XG5cbiAgICB2YXIgbGVuZ3RoID0gTWF0aC5tYXgoTWF0aC5jZWlsKChzdG9wIC0gc3RhcnQpIC8gc3RlcCksIDApO1xuICAgIHZhciByYW5nZSA9IEFycmF5KGxlbmd0aCk7XG5cbiAgICBmb3IgKHZhciBpZHggPSAwOyBpZHggPCBsZW5ndGg7IGlkeCsrLCBzdGFydCArPSBzdGVwKSB7XG4gICAgICByYW5nZVtpZHhdID0gc3RhcnQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHJhbmdlO1xuICB9O1xuXG4gIC8vIEZ1bmN0aW9uIChhaGVtKSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gRGV0ZXJtaW5lcyB3aGV0aGVyIHRvIGV4ZWN1dGUgYSBmdW5jdGlvbiBhcyBhIGNvbnN0cnVjdG9yXG4gIC8vIG9yIGEgbm9ybWFsIGZ1bmN0aW9uIHdpdGggdGhlIHByb3ZpZGVkIGFyZ3VtZW50c1xuICB2YXIgZXhlY3V0ZUJvdW5kID0gZnVuY3Rpb24oc291cmNlRnVuYywgYm91bmRGdW5jLCBjb250ZXh0LCBjYWxsaW5nQ29udGV4dCwgYXJncykge1xuICAgIGlmICghKGNhbGxpbmdDb250ZXh0IGluc3RhbmNlb2YgYm91bmRGdW5jKSkgcmV0dXJuIHNvdXJjZUZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgdmFyIHNlbGYgPSBiYXNlQ3JlYXRlKHNvdXJjZUZ1bmMucHJvdG90eXBlKTtcbiAgICB2YXIgcmVzdWx0ID0gc291cmNlRnVuYy5hcHBseShzZWxmLCBhcmdzKTtcbiAgICBpZiAoXy5pc09iamVjdChyZXN1bHQpKSByZXR1cm4gcmVzdWx0O1xuICAgIHJldHVybiBzZWxmO1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIGZ1bmN0aW9uIGJvdW5kIHRvIGEgZ2l2ZW4gb2JqZWN0IChhc3NpZ25pbmcgYHRoaXNgLCBhbmQgYXJndW1lbnRzLFxuICAvLyBvcHRpb25hbGx5KS4gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYEZ1bmN0aW9uLmJpbmRgIGlmXG4gIC8vIGF2YWlsYWJsZS5cbiAgXy5iaW5kID0gZnVuY3Rpb24oZnVuYywgY29udGV4dCkge1xuICAgIGlmIChuYXRpdmVCaW5kICYmIGZ1bmMuYmluZCA9PT0gbmF0aXZlQmluZCkgcmV0dXJuIG5hdGl2ZUJpbmQuYXBwbHkoZnVuYywgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgICBpZiAoIV8uaXNGdW5jdGlvbihmdW5jKSkgdGhyb3cgbmV3IFR5cGVFcnJvcignQmluZCBtdXN0IGJlIGNhbGxlZCBvbiBhIGZ1bmN0aW9uJyk7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgdmFyIGJvdW5kID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhlY3V0ZUJvdW5kKGZ1bmMsIGJvdW5kLCBjb250ZXh0LCB0aGlzLCBhcmdzLmNvbmNhdChzbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbiAgICB9O1xuICAgIHJldHVybiBib3VuZDtcbiAgfTtcblxuICAvLyBQYXJ0aWFsbHkgYXBwbHkgYSBmdW5jdGlvbiBieSBjcmVhdGluZyBhIHZlcnNpb24gdGhhdCBoYXMgaGFkIHNvbWUgb2YgaXRzXG4gIC8vIGFyZ3VtZW50cyBwcmUtZmlsbGVkLCB3aXRob3V0IGNoYW5naW5nIGl0cyBkeW5hbWljIGB0aGlzYCBjb250ZXh0LiBfIGFjdHNcbiAgLy8gYXMgYSBwbGFjZWhvbGRlciwgYWxsb3dpbmcgYW55IGNvbWJpbmF0aW9uIG9mIGFyZ3VtZW50cyB0byBiZSBwcmUtZmlsbGVkLlxuICBfLnBhcnRpYWwgPSBmdW5jdGlvbihmdW5jKSB7XG4gICAgdmFyIGJvdW5kQXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICB2YXIgYm91bmQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBwb3NpdGlvbiA9IDAsIGxlbmd0aCA9IGJvdW5kQXJncy5sZW5ndGg7XG4gICAgICB2YXIgYXJncyA9IEFycmF5KGxlbmd0aCk7XG4gICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGFyZ3NbaV0gPSBib3VuZEFyZ3NbaV0gPT09IF8gPyBhcmd1bWVudHNbcG9zaXRpb24rK10gOiBib3VuZEFyZ3NbaV07XG4gICAgICB9XG4gICAgICB3aGlsZSAocG9zaXRpb24gPCBhcmd1bWVudHMubGVuZ3RoKSBhcmdzLnB1c2goYXJndW1lbnRzW3Bvc2l0aW9uKytdKTtcbiAgICAgIHJldHVybiBleGVjdXRlQm91bmQoZnVuYywgYm91bmQsIHRoaXMsIHRoaXMsIGFyZ3MpO1xuICAgIH07XG4gICAgcmV0dXJuIGJvdW5kO1xuICB9O1xuXG4gIC8vIEJpbmQgYSBudW1iZXIgb2YgYW4gb2JqZWN0J3MgbWV0aG9kcyB0byB0aGF0IG9iamVjdC4gUmVtYWluaW5nIGFyZ3VtZW50c1xuICAvLyBhcmUgdGhlIG1ldGhvZCBuYW1lcyB0byBiZSBib3VuZC4gVXNlZnVsIGZvciBlbnN1cmluZyB0aGF0IGFsbCBjYWxsYmFja3NcbiAgLy8gZGVmaW5lZCBvbiBhbiBvYmplY3QgYmVsb25nIHRvIGl0LlxuICBfLmJpbmRBbGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgaSwgbGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aCwga2V5O1xuICAgIGlmIChsZW5ndGggPD0gMSkgdGhyb3cgbmV3IEVycm9yKCdiaW5kQWxsIG11c3QgYmUgcGFzc2VkIGZ1bmN0aW9uIG5hbWVzJyk7XG4gICAgZm9yIChpID0gMTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBrZXkgPSBhcmd1bWVudHNbaV07XG4gICAgICBvYmpba2V5XSA9IF8uYmluZChvYmpba2V5XSwgb2JqKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBNZW1vaXplIGFuIGV4cGVuc2l2ZSBmdW5jdGlvbiBieSBzdG9yaW5nIGl0cyByZXN1bHRzLlxuICBfLm1lbW9pemUgPSBmdW5jdGlvbihmdW5jLCBoYXNoZXIpIHtcbiAgICB2YXIgbWVtb2l6ZSA9IGZ1bmN0aW9uKGtleSkge1xuICAgICAgdmFyIGNhY2hlID0gbWVtb2l6ZS5jYWNoZTtcbiAgICAgIHZhciBhZGRyZXNzID0gJycgKyAoaGFzaGVyID8gaGFzaGVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cykgOiBrZXkpO1xuICAgICAgaWYgKCFfLmhhcyhjYWNoZSwgYWRkcmVzcykpIGNhY2hlW2FkZHJlc3NdID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIGNhY2hlW2FkZHJlc3NdO1xuICAgIH07XG4gICAgbWVtb2l6ZS5jYWNoZSA9IHt9O1xuICAgIHJldHVybiBtZW1vaXplO1xuICB9O1xuXG4gIC8vIERlbGF5cyBhIGZ1bmN0aW9uIGZvciB0aGUgZ2l2ZW4gbnVtYmVyIG9mIG1pbGxpc2Vjb25kcywgYW5kIHRoZW4gY2FsbHNcbiAgLy8gaXQgd2l0aCB0aGUgYXJndW1lbnRzIHN1cHBsaWVkLlxuICBfLmRlbGF5ID0gZnVuY3Rpb24oZnVuYywgd2FpdCkge1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHJldHVybiBzZXRUaW1lb3V0KGZ1bmN0aW9uKCl7XG4gICAgICByZXR1cm4gZnVuYy5hcHBseShudWxsLCBhcmdzKTtcbiAgICB9LCB3YWl0KTtcbiAgfTtcblxuICAvLyBEZWZlcnMgYSBmdW5jdGlvbiwgc2NoZWR1bGluZyBpdCB0byBydW4gYWZ0ZXIgdGhlIGN1cnJlbnQgY2FsbCBzdGFjayBoYXNcbiAgLy8gY2xlYXJlZC5cbiAgXy5kZWZlciA9IF8ucGFydGlhbChfLmRlbGF5LCBfLCAxKTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIHdoZW4gaW52b2tlZCwgd2lsbCBvbmx5IGJlIHRyaWdnZXJlZCBhdCBtb3N0IG9uY2VcbiAgLy8gZHVyaW5nIGEgZ2l2ZW4gd2luZG93IG9mIHRpbWUuIE5vcm1hbGx5LCB0aGUgdGhyb3R0bGVkIGZ1bmN0aW9uIHdpbGwgcnVuXG4gIC8vIGFzIG11Y2ggYXMgaXQgY2FuLCB3aXRob3V0IGV2ZXIgZ29pbmcgbW9yZSB0aGFuIG9uY2UgcGVyIGB3YWl0YCBkdXJhdGlvbjtcbiAgLy8gYnV0IGlmIHlvdSdkIGxpa2UgdG8gZGlzYWJsZSB0aGUgZXhlY3V0aW9uIG9uIHRoZSBsZWFkaW5nIGVkZ2UsIHBhc3NcbiAgLy8gYHtsZWFkaW5nOiBmYWxzZX1gLiBUbyBkaXNhYmxlIGV4ZWN1dGlvbiBvbiB0aGUgdHJhaWxpbmcgZWRnZSwgZGl0dG8uXG4gIF8udGhyb3R0bGUgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBvcHRpb25zKSB7XG4gICAgdmFyIGNvbnRleHQsIGFyZ3MsIHJlc3VsdDtcbiAgICB2YXIgdGltZW91dCA9IG51bGw7XG4gICAgdmFyIHByZXZpb3VzID0gMDtcbiAgICBpZiAoIW9wdGlvbnMpIG9wdGlvbnMgPSB7fTtcbiAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIHByZXZpb3VzID0gb3B0aW9ucy5sZWFkaW5nID09PSBmYWxzZSA/IDAgOiBfLm5vdygpO1xuICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgaWYgKCF0aW1lb3V0KSBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgfTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbm93ID0gXy5ub3coKTtcbiAgICAgIGlmICghcHJldmlvdXMgJiYgb3B0aW9ucy5sZWFkaW5nID09PSBmYWxzZSkgcHJldmlvdXMgPSBub3c7XG4gICAgICB2YXIgcmVtYWluaW5nID0gd2FpdCAtIChub3cgLSBwcmV2aW91cyk7XG4gICAgICBjb250ZXh0ID0gdGhpcztcbiAgICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICBpZiAocmVtYWluaW5nIDw9IDAgfHwgcmVtYWluaW5nID4gd2FpdCkge1xuICAgICAgICBpZiAodGltZW91dCkge1xuICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgICBwcmV2aW91cyA9IG5vdztcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgaWYgKCF0aW1lb3V0KSBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICB9IGVsc2UgaWYgKCF0aW1lb3V0ICYmIG9wdGlvbnMudHJhaWxpbmcgIT09IGZhbHNlKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCByZW1haW5pbmcpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgYXMgbG9uZyBhcyBpdCBjb250aW51ZXMgdG8gYmUgaW52b2tlZCwgd2lsbCBub3RcbiAgLy8gYmUgdHJpZ2dlcmVkLiBUaGUgZnVuY3Rpb24gd2lsbCBiZSBjYWxsZWQgYWZ0ZXIgaXQgc3RvcHMgYmVpbmcgY2FsbGVkIGZvclxuICAvLyBOIG1pbGxpc2Vjb25kcy4gSWYgYGltbWVkaWF0ZWAgaXMgcGFzc2VkLCB0cmlnZ2VyIHRoZSBmdW5jdGlvbiBvbiB0aGVcbiAgLy8gbGVhZGluZyBlZGdlLCBpbnN0ZWFkIG9mIHRoZSB0cmFpbGluZy5cbiAgXy5kZWJvdW5jZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQsIGltbWVkaWF0ZSkge1xuICAgIHZhciB0aW1lb3V0LCBhcmdzLCBjb250ZXh0LCB0aW1lc3RhbXAsIHJlc3VsdDtcblxuICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGxhc3QgPSBfLm5vdygpIC0gdGltZXN0YW1wO1xuXG4gICAgICBpZiAobGFzdCA8IHdhaXQgJiYgbGFzdCA+PSAwKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0IC0gbGFzdCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgICAgaWYgKCFpbW1lZGlhdGUpIHtcbiAgICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfTtcblxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGNvbnRleHQgPSB0aGlzO1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIHRpbWVzdGFtcCA9IF8ubm93KCk7XG4gICAgICB2YXIgY2FsbE5vdyA9IGltbWVkaWF0ZSAmJiAhdGltZW91dDtcbiAgICAgIGlmICghdGltZW91dCkgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHdhaXQpO1xuICAgICAgaWYgKGNhbGxOb3cpIHtcbiAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgZnVuY3Rpb24gcGFzc2VkIGFzIGFuIGFyZ3VtZW50IHRvIHRoZSBzZWNvbmQsXG4gIC8vIGFsbG93aW5nIHlvdSB0byBhZGp1c3QgYXJndW1lbnRzLCBydW4gY29kZSBiZWZvcmUgYW5kIGFmdGVyLCBhbmRcbiAgLy8gY29uZGl0aW9uYWxseSBleGVjdXRlIHRoZSBvcmlnaW5hbCBmdW5jdGlvbi5cbiAgXy53cmFwID0gZnVuY3Rpb24oZnVuYywgd3JhcHBlcikge1xuICAgIHJldHVybiBfLnBhcnRpYWwod3JhcHBlciwgZnVuYyk7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIG5lZ2F0ZWQgdmVyc2lvbiBvZiB0aGUgcGFzc2VkLWluIHByZWRpY2F0ZS5cbiAgXy5uZWdhdGUgPSBmdW5jdGlvbihwcmVkaWNhdGUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gIXByZWRpY2F0ZS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgaXMgdGhlIGNvbXBvc2l0aW9uIG9mIGEgbGlzdCBvZiBmdW5jdGlvbnMsIGVhY2hcbiAgLy8gY29uc3VtaW5nIHRoZSByZXR1cm4gdmFsdWUgb2YgdGhlIGZ1bmN0aW9uIHRoYXQgZm9sbG93cy5cbiAgXy5jb21wb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgdmFyIHN0YXJ0ID0gYXJncy5sZW5ndGggLSAxO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBpID0gc3RhcnQ7XG4gICAgICB2YXIgcmVzdWx0ID0gYXJnc1tzdGFydF0uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHdoaWxlIChpLS0pIHJlc3VsdCA9IGFyZ3NbaV0uY2FsbCh0aGlzLCByZXN1bHQpO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgb25seSBiZSBleGVjdXRlZCBvbiBhbmQgYWZ0ZXIgdGhlIE50aCBjYWxsLlxuICBfLmFmdGVyID0gZnVuY3Rpb24odGltZXMsIGZ1bmMpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoLS10aW1lcyA8IDEpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgb25seSBiZSBleGVjdXRlZCB1cCB0byAoYnV0IG5vdCBpbmNsdWRpbmcpIHRoZSBOdGggY2FsbC5cbiAgXy5iZWZvcmUgPSBmdW5jdGlvbih0aW1lcywgZnVuYykge1xuICAgIHZhciBtZW1vO1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLXRpbWVzID4gMCkge1xuICAgICAgICBtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgICAgaWYgKHRpbWVzIDw9IDEpIGZ1bmMgPSBudWxsO1xuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGV4ZWN1dGVkIGF0IG1vc3Qgb25lIHRpbWUsIG5vIG1hdHRlciBob3dcbiAgLy8gb2Z0ZW4geW91IGNhbGwgaXQuIFVzZWZ1bCBmb3IgbGF6eSBpbml0aWFsaXphdGlvbi5cbiAgXy5vbmNlID0gXy5wYXJ0aWFsKF8uYmVmb3JlLCAyKTtcblxuICAvLyBPYmplY3QgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBLZXlzIGluIElFIDwgOSB0aGF0IHdvbid0IGJlIGl0ZXJhdGVkIGJ5IGBmb3Iga2V5IGluIC4uLmAgYW5kIHRodXMgbWlzc2VkLlxuICB2YXIgaGFzRW51bUJ1ZyA9ICF7dG9TdHJpbmc6IG51bGx9LnByb3BlcnR5SXNFbnVtZXJhYmxlKCd0b1N0cmluZycpO1xuICB2YXIgbm9uRW51bWVyYWJsZVByb3BzID0gWyd2YWx1ZU9mJywgJ2lzUHJvdG90eXBlT2YnLCAndG9TdHJpbmcnLFxuICAgICAgICAgICAgICAgICAgICAgICdwcm9wZXJ0eUlzRW51bWVyYWJsZScsICdoYXNPd25Qcm9wZXJ0eScsICd0b0xvY2FsZVN0cmluZyddO1xuXG4gIGZ1bmN0aW9uIGNvbGxlY3ROb25FbnVtUHJvcHMob2JqLCBrZXlzKSB7XG4gICAgdmFyIG5vbkVudW1JZHggPSBub25FbnVtZXJhYmxlUHJvcHMubGVuZ3RoO1xuICAgIHZhciBjb25zdHJ1Y3RvciA9IG9iai5jb25zdHJ1Y3RvcjtcbiAgICB2YXIgcHJvdG8gPSAoXy5pc0Z1bmN0aW9uKGNvbnN0cnVjdG9yKSAmJiBjb25zdHJ1Y3Rvci5wcm90b3R5cGUpIHx8IE9ialByb3RvO1xuXG4gICAgLy8gQ29uc3RydWN0b3IgaXMgYSBzcGVjaWFsIGNhc2UuXG4gICAgdmFyIHByb3AgPSAnY29uc3RydWN0b3InO1xuICAgIGlmIChfLmhhcyhvYmosIHByb3ApICYmICFfLmNvbnRhaW5zKGtleXMsIHByb3ApKSBrZXlzLnB1c2gocHJvcCk7XG5cbiAgICB3aGlsZSAobm9uRW51bUlkeC0tKSB7XG4gICAgICBwcm9wID0gbm9uRW51bWVyYWJsZVByb3BzW25vbkVudW1JZHhdO1xuICAgICAgaWYgKHByb3AgaW4gb2JqICYmIG9ialtwcm9wXSAhPT0gcHJvdG9bcHJvcF0gJiYgIV8uY29udGFpbnMoa2V5cywgcHJvcCkpIHtcbiAgICAgICAga2V5cy5wdXNoKHByb3ApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFJldHJpZXZlIHRoZSBuYW1lcyBvZiBhbiBvYmplY3QncyBvd24gcHJvcGVydGllcy5cbiAgLy8gRGVsZWdhdGVzIHRvICoqRUNNQVNjcmlwdCA1KioncyBuYXRpdmUgYE9iamVjdC5rZXlzYFxuICBfLmtleXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIFtdO1xuICAgIGlmIChuYXRpdmVLZXlzKSByZXR1cm4gbmF0aXZlS2V5cyhvYmopO1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikgaWYgKF8uaGFzKG9iaiwga2V5KSkga2V5cy5wdXNoKGtleSk7XG4gICAgLy8gQWhlbSwgSUUgPCA5LlxuICAgIGlmIChoYXNFbnVtQnVnKSBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cyk7XG4gICAgcmV0dXJuIGtleXM7XG4gIH07XG5cbiAgLy8gUmV0cmlldmUgYWxsIHRoZSBwcm9wZXJ0eSBuYW1lcyBvZiBhbiBvYmplY3QuXG4gIF8uYWxsS2V5cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gW107XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBrZXlzLnB1c2goa2V5KTtcbiAgICAvLyBBaGVtLCBJRSA8IDkuXG4gICAgaWYgKGhhc0VudW1CdWcpIGNvbGxlY3ROb25FbnVtUHJvcHMob2JqLCBrZXlzKTtcbiAgICByZXR1cm4ga2V5cztcbiAgfTtcblxuICAvLyBSZXRyaWV2ZSB0aGUgdmFsdWVzIG9mIGFuIG9iamVjdCdzIHByb3BlcnRpZXMuXG4gIF8udmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgdmFyIHZhbHVlcyA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFsdWVzW2ldID0gb2JqW2tleXNbaV1dO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWVzO1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIHJlc3VsdHMgb2YgYXBwbHlpbmcgdGhlIGl0ZXJhdGVlIHRvIGVhY2ggZWxlbWVudCBvZiB0aGUgb2JqZWN0XG4gIC8vIEluIGNvbnRyYXN0IHRvIF8ubWFwIGl0IHJldHVybnMgYW4gb2JqZWN0XG4gIF8ubWFwT2JqZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIF8ua2V5cyhvYmopLFxuICAgICAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoLFxuICAgICAgICAgIHJlc3VsdHMgPSB7fSxcbiAgICAgICAgICBjdXJyZW50S2V5O1xuICAgICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgICBjdXJyZW50S2V5ID0ga2V5c1tpbmRleF07XG4gICAgICAgIHJlc3VsdHNbY3VycmVudEtleV0gPSBpdGVyYXRlZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBDb252ZXJ0IGFuIG9iamVjdCBpbnRvIGEgbGlzdCBvZiBgW2tleSwgdmFsdWVdYCBwYWlycy5cbiAgXy5wYWlycyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIHZhciBwYWlycyA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcGFpcnNbaV0gPSBba2V5c1tpXSwgb2JqW2tleXNbaV1dXTtcbiAgICB9XG4gICAgcmV0dXJuIHBhaXJzO1xuICB9O1xuXG4gIC8vIEludmVydCB0aGUga2V5cyBhbmQgdmFsdWVzIG9mIGFuIG9iamVjdC4gVGhlIHZhbHVlcyBtdXN0IGJlIHNlcmlhbGl6YWJsZS5cbiAgXy5pbnZlcnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgcmVzdWx0ID0ge307XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgcmVzdWx0W29ialtrZXlzW2ldXV0gPSBrZXlzW2ldO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHNvcnRlZCBsaXN0IG9mIHRoZSBmdW5jdGlvbiBuYW1lcyBhdmFpbGFibGUgb24gdGhlIG9iamVjdC5cbiAgLy8gQWxpYXNlZCBhcyBgbWV0aG9kc2BcbiAgXy5mdW5jdGlvbnMgPSBfLm1ldGhvZHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgbmFtZXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICBpZiAoXy5pc0Z1bmN0aW9uKG9ialtrZXldKSkgbmFtZXMucHVzaChrZXkpO1xuICAgIH1cbiAgICByZXR1cm4gbmFtZXMuc29ydCgpO1xuICB9O1xuXG4gIC8vIEV4dGVuZCBhIGdpdmVuIG9iamVjdCB3aXRoIGFsbCB0aGUgcHJvcGVydGllcyBpbiBwYXNzZWQtaW4gb2JqZWN0KHMpLlxuICBfLmV4dGVuZCA9IGNyZWF0ZUFzc2lnbmVyKF8uYWxsS2V5cyk7XG5cbiAgLy8gQXNzaWducyBhIGdpdmVuIG9iamVjdCB3aXRoIGFsbCB0aGUgb3duIHByb3BlcnRpZXMgaW4gdGhlIHBhc3NlZC1pbiBvYmplY3QocylcbiAgLy8gKGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL09iamVjdC9hc3NpZ24pXG4gIF8uZXh0ZW5kT3duID0gXy5hc3NpZ24gPSBjcmVhdGVBc3NpZ25lcihfLmtleXMpO1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGtleSBvbiBhbiBvYmplY3QgdGhhdCBwYXNzZXMgYSBwcmVkaWNhdGUgdGVzdFxuICBfLmZpbmRLZXkgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKSwga2V5O1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBrZXkgPSBrZXlzW2ldO1xuICAgICAgaWYgKHByZWRpY2F0ZShvYmpba2V5XSwga2V5LCBvYmopKSByZXR1cm4ga2V5O1xuICAgIH1cbiAgfTtcblxuICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgb25seSBjb250YWluaW5nIHRoZSB3aGl0ZWxpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLnBpY2sgPSBmdW5jdGlvbihvYmplY3QsIG9pdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQgPSB7fSwgb2JqID0gb2JqZWN0LCBpdGVyYXRlZSwga2V5cztcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiByZXN1bHQ7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihvaXRlcmF0ZWUpKSB7XG4gICAgICBrZXlzID0gXy5hbGxLZXlzKG9iaik7XG4gICAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2Iob2l0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAga2V5cyA9IGZsYXR0ZW4oYXJndW1lbnRzLCBmYWxzZSwgZmFsc2UsIDEpO1xuICAgICAgaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwga2V5LCBvYmopIHsgcmV0dXJuIGtleSBpbiBvYmo7IH07XG4gICAgICBvYmogPSBPYmplY3Qob2JqKTtcbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgdmFyIHZhbHVlID0gb2JqW2tleV07XG4gICAgICBpZiAoaXRlcmF0ZWUodmFsdWUsIGtleSwgb2JqKSkgcmVzdWx0W2tleV0gPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IHdpdGhvdXQgdGhlIGJsYWNrbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ub21pdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKGl0ZXJhdGVlKSkge1xuICAgICAgaXRlcmF0ZWUgPSBfLm5lZ2F0ZShpdGVyYXRlZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBrZXlzID0gXy5tYXAoZmxhdHRlbihhcmd1bWVudHMsIGZhbHNlLCBmYWxzZSwgMSksIFN0cmluZyk7XG4gICAgICBpdGVyYXRlZSA9IGZ1bmN0aW9uKHZhbHVlLCBrZXkpIHtcbiAgICAgICAgcmV0dXJuICFfLmNvbnRhaW5zKGtleXMsIGtleSk7XG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gXy5waWNrKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpO1xuICB9O1xuXG4gIC8vIEZpbGwgaW4gYSBnaXZlbiBvYmplY3Qgd2l0aCBkZWZhdWx0IHByb3BlcnRpZXMuXG4gIF8uZGVmYXVsdHMgPSBjcmVhdGVBc3NpZ25lcihfLmFsbEtleXMsIHRydWUpO1xuXG4gIC8vIENyZWF0ZXMgYW4gb2JqZWN0IHRoYXQgaW5oZXJpdHMgZnJvbSB0aGUgZ2l2ZW4gcHJvdG90eXBlIG9iamVjdC5cbiAgLy8gSWYgYWRkaXRpb25hbCBwcm9wZXJ0aWVzIGFyZSBwcm92aWRlZCB0aGVuIHRoZXkgd2lsbCBiZSBhZGRlZCB0byB0aGVcbiAgLy8gY3JlYXRlZCBvYmplY3QuXG4gIF8uY3JlYXRlID0gZnVuY3Rpb24ocHJvdG90eXBlLCBwcm9wcykge1xuICAgIHZhciByZXN1bHQgPSBiYXNlQ3JlYXRlKHByb3RvdHlwZSk7XG4gICAgaWYgKHByb3BzKSBfLmV4dGVuZE93bihyZXN1bHQsIHByb3BzKTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIChzaGFsbG93LWNsb25lZCkgZHVwbGljYXRlIG9mIGFuIG9iamVjdC5cbiAgXy5jbG9uZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gb2JqO1xuICAgIHJldHVybiBfLmlzQXJyYXkob2JqKSA/IG9iai5zbGljZSgpIDogXy5leHRlbmQoe30sIG9iaik7XG4gIH07XG5cbiAgLy8gSW52b2tlcyBpbnRlcmNlcHRvciB3aXRoIHRoZSBvYmosIGFuZCB0aGVuIHJldHVybnMgb2JqLlxuICAvLyBUaGUgcHJpbWFyeSBwdXJwb3NlIG9mIHRoaXMgbWV0aG9kIGlzIHRvIFwidGFwIGludG9cIiBhIG1ldGhvZCBjaGFpbiwgaW5cbiAgLy8gb3JkZXIgdG8gcGVyZm9ybSBvcGVyYXRpb25zIG9uIGludGVybWVkaWF0ZSByZXN1bHRzIHdpdGhpbiB0aGUgY2hhaW4uXG4gIF8udGFwID0gZnVuY3Rpb24ob2JqLCBpbnRlcmNlcHRvcikge1xuICAgIGludGVyY2VwdG9yKG9iaik7XG4gICAgcmV0dXJuIG9iajtcbiAgfTtcblxuICAvLyBSZXR1cm5zIHdoZXRoZXIgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHNldCBvZiBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5pc01hdGNoID0gZnVuY3Rpb24ob2JqZWN0LCBhdHRycykge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKGF0dHJzKSwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgaWYgKG9iamVjdCA9PSBudWxsKSByZXR1cm4gIWxlbmd0aDtcbiAgICB2YXIgb2JqID0gT2JqZWN0KG9iamVjdCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICBpZiAoYXR0cnNba2V5XSAhPT0gb2JqW2tleV0gfHwgIShrZXkgaW4gb2JqKSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuXG4gIC8vIEludGVybmFsIHJlY3Vyc2l2ZSBjb21wYXJpc29uIGZ1bmN0aW9uIGZvciBgaXNFcXVhbGAuXG4gIHZhciBlcSA9IGZ1bmN0aW9uKGEsIGIsIGFTdGFjaywgYlN0YWNrKSB7XG4gICAgLy8gSWRlbnRpY2FsIG9iamVjdHMgYXJlIGVxdWFsLiBgMCA9PT0gLTBgLCBidXQgdGhleSBhcmVuJ3QgaWRlbnRpY2FsLlxuICAgIC8vIFNlZSB0aGUgW0hhcm1vbnkgYGVnYWxgIHByb3Bvc2FsXShodHRwOi8vd2lraS5lY21hc2NyaXB0Lm9yZy9kb2t1LnBocD9pZD1oYXJtb255OmVnYWwpLlxuICAgIGlmIChhID09PSBiKSByZXR1cm4gYSAhPT0gMCB8fCAxIC8gYSA9PT0gMSAvIGI7XG4gICAgLy8gQSBzdHJpY3QgY29tcGFyaXNvbiBpcyBuZWNlc3NhcnkgYmVjYXVzZSBgbnVsbCA9PSB1bmRlZmluZWRgLlxuICAgIGlmIChhID09IG51bGwgfHwgYiA9PSBudWxsKSByZXR1cm4gYSA9PT0gYjtcbiAgICAvLyBVbndyYXAgYW55IHdyYXBwZWQgb2JqZWN0cy5cbiAgICBpZiAoYSBpbnN0YW5jZW9mIF8pIGEgPSBhLl93cmFwcGVkO1xuICAgIGlmIChiIGluc3RhbmNlb2YgXykgYiA9IGIuX3dyYXBwZWQ7XG4gICAgLy8gQ29tcGFyZSBgW1tDbGFzc11dYCBuYW1lcy5cbiAgICB2YXIgY2xhc3NOYW1lID0gdG9TdHJpbmcuY2FsbChhKTtcbiAgICBpZiAoY2xhc3NOYW1lICE9PSB0b1N0cmluZy5jYWxsKGIpKSByZXR1cm4gZmFsc2U7XG4gICAgc3dpdGNoIChjbGFzc05hbWUpIHtcbiAgICAgIC8vIFN0cmluZ3MsIG51bWJlcnMsIHJlZ3VsYXIgZXhwcmVzc2lvbnMsIGRhdGVzLCBhbmQgYm9vbGVhbnMgYXJlIGNvbXBhcmVkIGJ5IHZhbHVlLlxuICAgICAgY2FzZSAnW29iamVjdCBSZWdFeHBdJzpcbiAgICAgIC8vIFJlZ0V4cHMgYXJlIGNvZXJjZWQgdG8gc3RyaW5ncyBmb3IgY29tcGFyaXNvbiAoTm90ZTogJycgKyAvYS9pID09PSAnL2EvaScpXG4gICAgICBjYXNlICdbb2JqZWN0IFN0cmluZ10nOlxuICAgICAgICAvLyBQcmltaXRpdmVzIGFuZCB0aGVpciBjb3JyZXNwb25kaW5nIG9iamVjdCB3cmFwcGVycyBhcmUgZXF1aXZhbGVudDsgdGh1cywgYFwiNVwiYCBpc1xuICAgICAgICAvLyBlcXVpdmFsZW50IHRvIGBuZXcgU3RyaW5nKFwiNVwiKWAuXG4gICAgICAgIHJldHVybiAnJyArIGEgPT09ICcnICsgYjtcbiAgICAgIGNhc2UgJ1tvYmplY3QgTnVtYmVyXSc6XG4gICAgICAgIC8vIGBOYU5gcyBhcmUgZXF1aXZhbGVudCwgYnV0IG5vbi1yZWZsZXhpdmUuXG4gICAgICAgIC8vIE9iamVjdChOYU4pIGlzIGVxdWl2YWxlbnQgdG8gTmFOXG4gICAgICAgIGlmICgrYSAhPT0gK2EpIHJldHVybiArYiAhPT0gK2I7XG4gICAgICAgIC8vIEFuIGBlZ2FsYCBjb21wYXJpc29uIGlzIHBlcmZvcm1lZCBmb3Igb3RoZXIgbnVtZXJpYyB2YWx1ZXMuXG4gICAgICAgIHJldHVybiArYSA9PT0gMCA/IDEgLyArYSA9PT0gMSAvIGIgOiArYSA9PT0gK2I7XG4gICAgICBjYXNlICdbb2JqZWN0IERhdGVdJzpcbiAgICAgIGNhc2UgJ1tvYmplY3QgQm9vbGVhbl0nOlxuICAgICAgICAvLyBDb2VyY2UgZGF0ZXMgYW5kIGJvb2xlYW5zIHRvIG51bWVyaWMgcHJpbWl0aXZlIHZhbHVlcy4gRGF0ZXMgYXJlIGNvbXBhcmVkIGJ5IHRoZWlyXG4gICAgICAgIC8vIG1pbGxpc2Vjb25kIHJlcHJlc2VudGF0aW9ucy4gTm90ZSB0aGF0IGludmFsaWQgZGF0ZXMgd2l0aCBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnNcbiAgICAgICAgLy8gb2YgYE5hTmAgYXJlIG5vdCBlcXVpdmFsZW50LlxuICAgICAgICByZXR1cm4gK2EgPT09ICtiO1xuICAgIH1cblxuICAgIHZhciBhcmVBcnJheXMgPSBjbGFzc05hbWUgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gICAgaWYgKCFhcmVBcnJheXMpIHtcbiAgICAgIGlmICh0eXBlb2YgYSAhPSAnb2JqZWN0JyB8fCB0eXBlb2YgYiAhPSAnb2JqZWN0JykgcmV0dXJuIGZhbHNlO1xuXG4gICAgICAvLyBPYmplY3RzIHdpdGggZGlmZmVyZW50IGNvbnN0cnVjdG9ycyBhcmUgbm90IGVxdWl2YWxlbnQsIGJ1dCBgT2JqZWN0YHMgb3IgYEFycmF5YHNcbiAgICAgIC8vIGZyb20gZGlmZmVyZW50IGZyYW1lcyBhcmUuXG4gICAgICB2YXIgYUN0b3IgPSBhLmNvbnN0cnVjdG9yLCBiQ3RvciA9IGIuY29uc3RydWN0b3I7XG4gICAgICBpZiAoYUN0b3IgIT09IGJDdG9yICYmICEoXy5pc0Z1bmN0aW9uKGFDdG9yKSAmJiBhQ3RvciBpbnN0YW5jZW9mIGFDdG9yICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXy5pc0Z1bmN0aW9uKGJDdG9yKSAmJiBiQ3RvciBpbnN0YW5jZW9mIGJDdG9yKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAmJiAoJ2NvbnN0cnVjdG9yJyBpbiBhICYmICdjb25zdHJ1Y3RvcicgaW4gYikpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBBc3N1bWUgZXF1YWxpdHkgZm9yIGN5Y2xpYyBzdHJ1Y3R1cmVzLiBUaGUgYWxnb3JpdGhtIGZvciBkZXRlY3RpbmcgY3ljbGljXG4gICAgLy8gc3RydWN0dXJlcyBpcyBhZGFwdGVkIGZyb20gRVMgNS4xIHNlY3Rpb24gMTUuMTIuMywgYWJzdHJhY3Qgb3BlcmF0aW9uIGBKT2AuXG5cbiAgICAvLyBJbml0aWFsaXppbmcgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgLy8gSXQncyBkb25lIGhlcmUgc2luY2Ugd2Ugb25seSBuZWVkIHRoZW0gZm9yIG9iamVjdHMgYW5kIGFycmF5cyBjb21wYXJpc29uLlxuICAgIGFTdGFjayA9IGFTdGFjayB8fCBbXTtcbiAgICBiU3RhY2sgPSBiU3RhY2sgfHwgW107XG4gICAgdmFyIGxlbmd0aCA9IGFTdGFjay5sZW5ndGg7XG4gICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAvLyBMaW5lYXIgc2VhcmNoLiBQZXJmb3JtYW5jZSBpcyBpbnZlcnNlbHkgcHJvcG9ydGlvbmFsIHRvIHRoZSBudW1iZXIgb2ZcbiAgICAgIC8vIHVuaXF1ZSBuZXN0ZWQgc3RydWN0dXJlcy5cbiAgICAgIGlmIChhU3RhY2tbbGVuZ3RoXSA9PT0gYSkgcmV0dXJuIGJTdGFja1tsZW5ndGhdID09PSBiO1xuICAgIH1cblxuICAgIC8vIEFkZCB0aGUgZmlyc3Qgb2JqZWN0IHRvIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucHVzaChhKTtcbiAgICBiU3RhY2sucHVzaChiKTtcblxuICAgIC8vIFJlY3Vyc2l2ZWx5IGNvbXBhcmUgb2JqZWN0cyBhbmQgYXJyYXlzLlxuICAgIGlmIChhcmVBcnJheXMpIHtcbiAgICAgIC8vIENvbXBhcmUgYXJyYXkgbGVuZ3RocyB0byBkZXRlcm1pbmUgaWYgYSBkZWVwIGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5LlxuICAgICAgbGVuZ3RoID0gYS5sZW5ndGg7XG4gICAgICBpZiAobGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgLy8gRGVlcCBjb21wYXJlIHRoZSBjb250ZW50cywgaWdub3Jpbmcgbm9uLW51bWVyaWMgcHJvcGVydGllcy5cbiAgICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgICBpZiAoIWVxKGFbbGVuZ3RoXSwgYltsZW5ndGhdLCBhU3RhY2ssIGJTdGFjaykpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gRGVlcCBjb21wYXJlIG9iamVjdHMuXG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhhKSwga2V5O1xuICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgICAvLyBFbnN1cmUgdGhhdCBib3RoIG9iamVjdHMgY29udGFpbiB0aGUgc2FtZSBudW1iZXIgb2YgcHJvcGVydGllcyBiZWZvcmUgY29tcGFyaW5nIGRlZXAgZXF1YWxpdHkuXG4gICAgICBpZiAoXy5rZXlzKGIpLmxlbmd0aCAhPT0gbGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgICAgLy8gRGVlcCBjb21wYXJlIGVhY2ggbWVtYmVyXG4gICAgICAgIGtleSA9IGtleXNbbGVuZ3RoXTtcbiAgICAgICAgaWYgKCEoXy5oYXMoYiwga2V5KSAmJiBlcShhW2tleV0sIGJba2V5XSwgYVN0YWNrLCBiU3RhY2spKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICAvLyBSZW1vdmUgdGhlIGZpcnN0IG9iamVjdCBmcm9tIHRoZSBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICBhU3RhY2sucG9wKCk7XG4gICAgYlN0YWNrLnBvcCgpO1xuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIFBlcmZvcm0gYSBkZWVwIGNvbXBhcmlzb24gdG8gY2hlY2sgaWYgdHdvIG9iamVjdHMgYXJlIGVxdWFsLlxuICBfLmlzRXF1YWwgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgcmV0dXJuIGVxKGEsIGIpO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gYXJyYXksIHN0cmluZywgb3Igb2JqZWN0IGVtcHR5P1xuICAvLyBBbiBcImVtcHR5XCIgb2JqZWN0IGhhcyBubyBlbnVtZXJhYmxlIG93bi1wcm9wZXJ0aWVzLlxuICBfLmlzRW1wdHkgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqID09IG51bGwpIHJldHVybiB0cnVlO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopICYmIChfLmlzQXJyYXkob2JqKSB8fCBfLmlzU3RyaW5nKG9iaikgfHwgXy5pc0FyZ3VtZW50cyhvYmopKSkgcmV0dXJuIG9iai5sZW5ndGggPT09IDA7XG4gICAgcmV0dXJuIF8ua2V5cyhvYmopLmxlbmd0aCA9PT0gMDtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgRE9NIGVsZW1lbnQ/XG4gIF8uaXNFbGVtZW50ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuICEhKG9iaiAmJiBvYmoubm9kZVR5cGUgPT09IDEpO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYW4gYXJyYXk/XG4gIC8vIERlbGVnYXRlcyB0byBFQ01BNSdzIG5hdGl2ZSBBcnJheS5pc0FycmF5XG4gIF8uaXNBcnJheSA9IG5hdGl2ZUlzQXJyYXkgfHwgZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIGFuIG9iamVjdD9cbiAgXy5pc09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciB0eXBlID0gdHlwZW9mIG9iajtcbiAgICByZXR1cm4gdHlwZSA9PT0gJ2Z1bmN0aW9uJyB8fCB0eXBlID09PSAnb2JqZWN0JyAmJiAhIW9iajtcbiAgfTtcblxuICAvLyBBZGQgc29tZSBpc1R5cGUgbWV0aG9kczogaXNBcmd1bWVudHMsIGlzRnVuY3Rpb24sIGlzU3RyaW5nLCBpc051bWJlciwgaXNEYXRlLCBpc1JlZ0V4cCwgaXNFcnJvci5cbiAgXy5lYWNoKFsnQXJndW1lbnRzJywgJ0Z1bmN0aW9uJywgJ1N0cmluZycsICdOdW1iZXInLCAnRGF0ZScsICdSZWdFeHAnLCAnRXJyb3InXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIF9bJ2lzJyArIG5hbWVdID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCAnICsgbmFtZSArICddJztcbiAgICB9O1xuICB9KTtcblxuICAvLyBEZWZpbmUgYSBmYWxsYmFjayB2ZXJzaW9uIG9mIHRoZSBtZXRob2QgaW4gYnJvd3NlcnMgKGFoZW0sIElFIDwgOSksIHdoZXJlXG4gIC8vIHRoZXJlIGlzbid0IGFueSBpbnNwZWN0YWJsZSBcIkFyZ3VtZW50c1wiIHR5cGUuXG4gIGlmICghXy5pc0FyZ3VtZW50cyhhcmd1bWVudHMpKSB7XG4gICAgXy5pc0FyZ3VtZW50cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIF8uaGFzKG9iaiwgJ2NhbGxlZScpO1xuICAgIH07XG4gIH1cblxuICAvLyBPcHRpbWl6ZSBgaXNGdW5jdGlvbmAgaWYgYXBwcm9wcmlhdGUuIFdvcmsgYXJvdW5kIHNvbWUgdHlwZW9mIGJ1Z3MgaW4gb2xkIHY4LFxuICAvLyBJRSAxMSAoIzE2MjEpLCBhbmQgaW4gU2FmYXJpIDggKCMxOTI5KS5cbiAgaWYgKHR5cGVvZiAvLi8gIT0gJ2Z1bmN0aW9uJyAmJiB0eXBlb2YgSW50OEFycmF5ICE9ICdvYmplY3QnKSB7XG4gICAgXy5pc0Z1bmN0aW9uID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gdHlwZW9mIG9iaiA9PSAnZnVuY3Rpb24nIHx8IGZhbHNlO1xuICAgIH07XG4gIH1cblxuICAvLyBJcyBhIGdpdmVuIG9iamVjdCBhIGZpbml0ZSBudW1iZXI/XG4gIF8uaXNGaW5pdGUgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gaXNGaW5pdGUob2JqKSAmJiAhaXNOYU4ocGFyc2VGbG9hdChvYmopKTtcbiAgfTtcblxuICAvLyBJcyB0aGUgZ2l2ZW4gdmFsdWUgYE5hTmA/IChOYU4gaXMgdGhlIG9ubHkgbnVtYmVyIHdoaWNoIGRvZXMgbm90IGVxdWFsIGl0c2VsZikuXG4gIF8uaXNOYU4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gXy5pc051bWJlcihvYmopICYmIG9iaiAhPT0gK29iajtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGEgYm9vbGVhbj9cbiAgXy5pc0Jvb2xlYW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB0cnVlIHx8IG9iaiA9PT0gZmFsc2UgfHwgdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBCb29sZWFuXSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBlcXVhbCB0byBudWxsP1xuICBfLmlzTnVsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IG51bGw7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSB1bmRlZmluZWQ/XG4gIF8uaXNVbmRlZmluZWQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSB2b2lkIDA7XG4gIH07XG5cbiAgLy8gU2hvcnRjdXQgZnVuY3Rpb24gZm9yIGNoZWNraW5nIGlmIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBwcm9wZXJ0eSBkaXJlY3RseVxuICAvLyBvbiBpdHNlbGYgKGluIG90aGVyIHdvcmRzLCBub3Qgb24gYSBwcm90b3R5cGUpLlxuICBfLmhhcyA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIG9iaiAhPSBudWxsICYmIGhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xuICB9O1xuXG4gIC8vIFV0aWxpdHkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gUnVuIFVuZGVyc2NvcmUuanMgaW4gKm5vQ29uZmxpY3QqIG1vZGUsIHJldHVybmluZyB0aGUgYF9gIHZhcmlhYmxlIHRvIGl0c1xuICAvLyBwcmV2aW91cyBvd25lci4gUmV0dXJucyBhIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8ubm9Db25mbGljdCA9IGZ1bmN0aW9uKCkge1xuICAgIHJvb3QuXyA9IHByZXZpb3VzVW5kZXJzY29yZTtcbiAgICByZXR1cm4gdGhpcztcbiAgfTtcblxuICAvLyBLZWVwIHRoZSBpZGVudGl0eSBmdW5jdGlvbiBhcm91bmQgZm9yIGRlZmF1bHQgaXRlcmF0ZWVzLlxuICBfLmlkZW50aXR5ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH07XG5cbiAgLy8gUHJlZGljYXRlLWdlbmVyYXRpbmcgZnVuY3Rpb25zLiBPZnRlbiB1c2VmdWwgb3V0c2lkZSBvZiBVbmRlcnNjb3JlLlxuICBfLmNvbnN0YW50ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfTtcbiAgfTtcblxuICBfLm5vb3AgPSBmdW5jdGlvbigpe307XG5cbiAgXy5wcm9wZXJ0eSA9IHByb3BlcnR5O1xuXG4gIC8vIEdlbmVyYXRlcyBhIGZ1bmN0aW9uIGZvciBhIGdpdmVuIG9iamVjdCB0aGF0IHJldHVybnMgYSBnaXZlbiBwcm9wZXJ0eS5cbiAgXy5wcm9wZXJ0eU9mID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PSBudWxsID8gZnVuY3Rpb24oKXt9IDogZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gb2JqW2tleV07XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgcHJlZGljYXRlIGZvciBjaGVja2luZyB3aGV0aGVyIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBzZXQgb2ZcbiAgLy8gYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ubWF0Y2hlciA9IF8ubWF0Y2hlcyA9IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgYXR0cnMgPSBfLmV4dGVuZE93bih7fSwgYXR0cnMpO1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBfLmlzTWF0Y2gob2JqLCBhdHRycyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSdW4gYSBmdW5jdGlvbiAqKm4qKiB0aW1lcy5cbiAgXy50aW1lcyA9IGZ1bmN0aW9uKG4sIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIGFjY3VtID0gQXJyYXkoTWF0aC5tYXgoMCwgbikpO1xuICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCwgMSk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuOyBpKyspIGFjY3VtW2ldID0gaXRlcmF0ZWUoaSk7XG4gICAgcmV0dXJuIGFjY3VtO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHJhbmRvbSBpbnRlZ2VyIGJldHdlZW4gbWluIGFuZCBtYXggKGluY2x1c2l2ZSkuXG4gIF8ucmFuZG9tID0gZnVuY3Rpb24obWluLCBtYXgpIHtcbiAgICBpZiAobWF4ID09IG51bGwpIHtcbiAgICAgIG1heCA9IG1pbjtcbiAgICAgIG1pbiA9IDA7XG4gICAgfVxuICAgIHJldHVybiBtaW4gKyBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiAobWF4IC0gbWluICsgMSkpO1xuICB9O1xuXG4gIC8vIEEgKHBvc3NpYmx5IGZhc3Rlcikgd2F5IHRvIGdldCB0aGUgY3VycmVudCB0aW1lc3RhbXAgYXMgYW4gaW50ZWdlci5cbiAgXy5ub3cgPSBEYXRlLm5vdyB8fCBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH07XG5cbiAgIC8vIExpc3Qgb2YgSFRNTCBlbnRpdGllcyBmb3IgZXNjYXBpbmcuXG4gIHZhciBlc2NhcGVNYXAgPSB7XG4gICAgJyYnOiAnJmFtcDsnLFxuICAgICc8JzogJyZsdDsnLFxuICAgICc+JzogJyZndDsnLFxuICAgICdcIic6ICcmcXVvdDsnLFxuICAgIFwiJ1wiOiAnJiN4Mjc7JyxcbiAgICAnYCc6ICcmI3g2MDsnXG4gIH07XG4gIHZhciB1bmVzY2FwZU1hcCA9IF8uaW52ZXJ0KGVzY2FwZU1hcCk7XG5cbiAgLy8gRnVuY3Rpb25zIGZvciBlc2NhcGluZyBhbmQgdW5lc2NhcGluZyBzdHJpbmdzIHRvL2Zyb20gSFRNTCBpbnRlcnBvbGF0aW9uLlxuICB2YXIgY3JlYXRlRXNjYXBlciA9IGZ1bmN0aW9uKG1hcCkge1xuICAgIHZhciBlc2NhcGVyID0gZnVuY3Rpb24obWF0Y2gpIHtcbiAgICAgIHJldHVybiBtYXBbbWF0Y2hdO1xuICAgIH07XG4gICAgLy8gUmVnZXhlcyBmb3IgaWRlbnRpZnlpbmcgYSBrZXkgdGhhdCBuZWVkcyB0byBiZSBlc2NhcGVkXG4gICAgdmFyIHNvdXJjZSA9ICcoPzonICsgXy5rZXlzKG1hcCkuam9pbignfCcpICsgJyknO1xuICAgIHZhciB0ZXN0UmVnZXhwID0gUmVnRXhwKHNvdXJjZSk7XG4gICAgdmFyIHJlcGxhY2VSZWdleHAgPSBSZWdFeHAoc291cmNlLCAnZycpO1xuICAgIHJldHVybiBmdW5jdGlvbihzdHJpbmcpIHtcbiAgICAgIHN0cmluZyA9IHN0cmluZyA9PSBudWxsID8gJycgOiAnJyArIHN0cmluZztcbiAgICAgIHJldHVybiB0ZXN0UmVnZXhwLnRlc3Qoc3RyaW5nKSA/IHN0cmluZy5yZXBsYWNlKHJlcGxhY2VSZWdleHAsIGVzY2FwZXIpIDogc3RyaW5nO1xuICAgIH07XG4gIH07XG4gIF8uZXNjYXBlID0gY3JlYXRlRXNjYXBlcihlc2NhcGVNYXApO1xuICBfLnVuZXNjYXBlID0gY3JlYXRlRXNjYXBlcih1bmVzY2FwZU1hcCk7XG5cbiAgLy8gSWYgdGhlIHZhbHVlIG9mIHRoZSBuYW1lZCBgcHJvcGVydHlgIGlzIGEgZnVuY3Rpb24gdGhlbiBpbnZva2UgaXQgd2l0aCB0aGVcbiAgLy8gYG9iamVjdGAgYXMgY29udGV4dDsgb3RoZXJ3aXNlLCByZXR1cm4gaXQuXG4gIF8ucmVzdWx0ID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSwgZmFsbGJhY2spIHtcbiAgICB2YXIgdmFsdWUgPSBvYmplY3QgPT0gbnVsbCA/IHZvaWQgMCA6IG9iamVjdFtwcm9wZXJ0eV07XG4gICAgaWYgKHZhbHVlID09PSB2b2lkIDApIHtcbiAgICAgIHZhbHVlID0gZmFsbGJhY2s7XG4gICAgfVxuICAgIHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUuY2FsbChvYmplY3QpIDogdmFsdWU7XG4gIH07XG5cbiAgLy8gR2VuZXJhdGUgYSB1bmlxdWUgaW50ZWdlciBpZCAodW5pcXVlIHdpdGhpbiB0aGUgZW50aXJlIGNsaWVudCBzZXNzaW9uKS5cbiAgLy8gVXNlZnVsIGZvciB0ZW1wb3JhcnkgRE9NIGlkcy5cbiAgdmFyIGlkQ291bnRlciA9IDA7XG4gIF8udW5pcXVlSWQgPSBmdW5jdGlvbihwcmVmaXgpIHtcbiAgICB2YXIgaWQgPSArK2lkQ291bnRlciArICcnO1xuICAgIHJldHVybiBwcmVmaXggPyBwcmVmaXggKyBpZCA6IGlkO1xuICB9O1xuXG4gIC8vIEJ5IGRlZmF1bHQsIFVuZGVyc2NvcmUgdXNlcyBFUkItc3R5bGUgdGVtcGxhdGUgZGVsaW1pdGVycywgY2hhbmdlIHRoZVxuICAvLyBmb2xsb3dpbmcgdGVtcGxhdGUgc2V0dGluZ3MgdG8gdXNlIGFsdGVybmF0aXZlIGRlbGltaXRlcnMuXG4gIF8udGVtcGxhdGVTZXR0aW5ncyA9IHtcbiAgICBldmFsdWF0ZSAgICA6IC88JShbXFxzXFxTXSs/KSU+L2csXG4gICAgaW50ZXJwb2xhdGUgOiAvPCU9KFtcXHNcXFNdKz8pJT4vZyxcbiAgICBlc2NhcGUgICAgICA6IC88JS0oW1xcc1xcU10rPyklPi9nXG4gIH07XG5cbiAgLy8gV2hlbiBjdXN0b21pemluZyBgdGVtcGxhdGVTZXR0aW5nc2AsIGlmIHlvdSBkb24ndCB3YW50IHRvIGRlZmluZSBhblxuICAvLyBpbnRlcnBvbGF0aW9uLCBldmFsdWF0aW9uIG9yIGVzY2FwaW5nIHJlZ2V4LCB3ZSBuZWVkIG9uZSB0aGF0IGlzXG4gIC8vIGd1YXJhbnRlZWQgbm90IHRvIG1hdGNoLlxuICB2YXIgbm9NYXRjaCA9IC8oLileLztcblxuICAvLyBDZXJ0YWluIGNoYXJhY3RlcnMgbmVlZCB0byBiZSBlc2NhcGVkIHNvIHRoYXQgdGhleSBjYW4gYmUgcHV0IGludG8gYVxuICAvLyBzdHJpbmcgbGl0ZXJhbC5cbiAgdmFyIGVzY2FwZXMgPSB7XG4gICAgXCInXCI6ICAgICAgXCInXCIsXG4gICAgJ1xcXFwnOiAgICAgJ1xcXFwnLFxuICAgICdcXHInOiAgICAgJ3InLFxuICAgICdcXG4nOiAgICAgJ24nLFxuICAgICdcXHUyMDI4JzogJ3UyMDI4JyxcbiAgICAnXFx1MjAyOSc6ICd1MjAyOSdcbiAgfTtcblxuICB2YXIgZXNjYXBlciA9IC9cXFxcfCd8XFxyfFxcbnxcXHUyMDI4fFxcdTIwMjkvZztcblxuICB2YXIgZXNjYXBlQ2hhciA9IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgcmV0dXJuICdcXFxcJyArIGVzY2FwZXNbbWF0Y2hdO1xuICB9O1xuXG4gIC8vIEphdmFTY3JpcHQgbWljcm8tdGVtcGxhdGluZywgc2ltaWxhciB0byBKb2huIFJlc2lnJ3MgaW1wbGVtZW50YXRpb24uXG4gIC8vIFVuZGVyc2NvcmUgdGVtcGxhdGluZyBoYW5kbGVzIGFyYml0cmFyeSBkZWxpbWl0ZXJzLCBwcmVzZXJ2ZXMgd2hpdGVzcGFjZSxcbiAgLy8gYW5kIGNvcnJlY3RseSBlc2NhcGVzIHF1b3RlcyB3aXRoaW4gaW50ZXJwb2xhdGVkIGNvZGUuXG4gIC8vIE5COiBgb2xkU2V0dGluZ3NgIG9ubHkgZXhpc3RzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgXy50ZW1wbGF0ZSA9IGZ1bmN0aW9uKHRleHQsIHNldHRpbmdzLCBvbGRTZXR0aW5ncykge1xuICAgIGlmICghc2V0dGluZ3MgJiYgb2xkU2V0dGluZ3MpIHNldHRpbmdzID0gb2xkU2V0dGluZ3M7XG4gICAgc2V0dGluZ3MgPSBfLmRlZmF1bHRzKHt9LCBzZXR0aW5ncywgXy50ZW1wbGF0ZVNldHRpbmdzKTtcblxuICAgIC8vIENvbWJpbmUgZGVsaW1pdGVycyBpbnRvIG9uZSByZWd1bGFyIGV4cHJlc3Npb24gdmlhIGFsdGVybmF0aW9uLlxuICAgIHZhciBtYXRjaGVyID0gUmVnRXhwKFtcbiAgICAgIChzZXR0aW5ncy5lc2NhcGUgfHwgbm9NYXRjaCkuc291cmNlLFxuICAgICAgKHNldHRpbmdzLmludGVycG9sYXRlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5ldmFsdWF0ZSB8fCBub01hdGNoKS5zb3VyY2VcbiAgICBdLmpvaW4oJ3wnKSArICd8JCcsICdnJyk7XG5cbiAgICAvLyBDb21waWxlIHRoZSB0ZW1wbGF0ZSBzb3VyY2UsIGVzY2FwaW5nIHN0cmluZyBsaXRlcmFscyBhcHByb3ByaWF0ZWx5LlxuICAgIHZhciBpbmRleCA9IDA7XG4gICAgdmFyIHNvdXJjZSA9IFwiX19wKz0nXCI7XG4gICAgdGV4dC5yZXBsYWNlKG1hdGNoZXIsIGZ1bmN0aW9uKG1hdGNoLCBlc2NhcGUsIGludGVycG9sYXRlLCBldmFsdWF0ZSwgb2Zmc2V0KSB7XG4gICAgICBzb3VyY2UgKz0gdGV4dC5zbGljZShpbmRleCwgb2Zmc2V0KS5yZXBsYWNlKGVzY2FwZXIsIGVzY2FwZUNoYXIpO1xuICAgICAgaW5kZXggPSBvZmZzZXQgKyBtYXRjaC5sZW5ndGg7XG5cbiAgICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBlc2NhcGUgKyBcIikpPT1udWxsPycnOl8uZXNjYXBlKF9fdCkpK1xcbidcIjtcbiAgICAgIH0gZWxzZSBpZiAoaW50ZXJwb2xhdGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJytcXG4oKF9fdD0oXCIgKyBpbnRlcnBvbGF0ZSArIFwiKSk9PW51bGw/Jyc6X190KStcXG4nXCI7XG4gICAgICB9IGVsc2UgaWYgKGV2YWx1YXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIic7XFxuXCIgKyBldmFsdWF0ZSArIFwiXFxuX19wKz0nXCI7XG4gICAgICB9XG5cbiAgICAgIC8vIEFkb2JlIFZNcyBuZWVkIHRoZSBtYXRjaCByZXR1cm5lZCB0byBwcm9kdWNlIHRoZSBjb3JyZWN0IG9mZmVzdC5cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcbiAgICBzb3VyY2UgKz0gXCInO1xcblwiO1xuXG4gICAgLy8gSWYgYSB2YXJpYWJsZSBpcyBub3Qgc3BlY2lmaWVkLCBwbGFjZSBkYXRhIHZhbHVlcyBpbiBsb2NhbCBzY29wZS5cbiAgICBpZiAoIXNldHRpbmdzLnZhcmlhYmxlKSBzb3VyY2UgPSAnd2l0aChvYmp8fHt9KXtcXG4nICsgc291cmNlICsgJ31cXG4nO1xuXG4gICAgc291cmNlID0gXCJ2YXIgX190LF9fcD0nJyxfX2o9QXJyYXkucHJvdG90eXBlLmpvaW4sXCIgK1xuICAgICAgXCJwcmludD1mdW5jdGlvbigpe19fcCs9X19qLmNhbGwoYXJndW1lbnRzLCcnKTt9O1xcblwiICtcbiAgICAgIHNvdXJjZSArICdyZXR1cm4gX19wO1xcbic7XG5cbiAgICB0cnkge1xuICAgICAgdmFyIHJlbmRlciA9IG5ldyBGdW5jdGlvbihzZXR0aW5ncy52YXJpYWJsZSB8fCAnb2JqJywgJ18nLCBzb3VyY2UpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGUuc291cmNlID0gc291cmNlO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICB2YXIgdGVtcGxhdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICByZXR1cm4gcmVuZGVyLmNhbGwodGhpcywgZGF0YSwgXyk7XG4gICAgfTtcblxuICAgIC8vIFByb3ZpZGUgdGhlIGNvbXBpbGVkIHNvdXJjZSBhcyBhIGNvbnZlbmllbmNlIGZvciBwcmVjb21waWxhdGlvbi5cbiAgICB2YXIgYXJndW1lbnQgPSBzZXR0aW5ncy52YXJpYWJsZSB8fCAnb2JqJztcbiAgICB0ZW1wbGF0ZS5zb3VyY2UgPSAnZnVuY3Rpb24oJyArIGFyZ3VtZW50ICsgJyl7XFxuJyArIHNvdXJjZSArICd9JztcblxuICAgIHJldHVybiB0ZW1wbGF0ZTtcbiAgfTtcblxuICAvLyBBZGQgYSBcImNoYWluXCIgZnVuY3Rpb24uIFN0YXJ0IGNoYWluaW5nIGEgd3JhcHBlZCBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5jaGFpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBpbnN0YW5jZSA9IF8ob2JqKTtcbiAgICBpbnN0YW5jZS5fY2hhaW4gPSB0cnVlO1xuICAgIHJldHVybiBpbnN0YW5jZTtcbiAgfTtcblxuICAvLyBPT1BcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG4gIC8vIElmIFVuZGVyc2NvcmUgaXMgY2FsbGVkIGFzIGEgZnVuY3Rpb24sIGl0IHJldHVybnMgYSB3cmFwcGVkIG9iamVjdCB0aGF0XG4gIC8vIGNhbiBiZSB1c2VkIE9PLXN0eWxlLiBUaGlzIHdyYXBwZXIgaG9sZHMgYWx0ZXJlZCB2ZXJzaW9ucyBvZiBhbGwgdGhlXG4gIC8vIHVuZGVyc2NvcmUgZnVuY3Rpb25zLiBXcmFwcGVkIG9iamVjdHMgbWF5IGJlIGNoYWluZWQuXG5cbiAgLy8gSGVscGVyIGZ1bmN0aW9uIHRvIGNvbnRpbnVlIGNoYWluaW5nIGludGVybWVkaWF0ZSByZXN1bHRzLlxuICB2YXIgcmVzdWx0ID0gZnVuY3Rpb24oaW5zdGFuY2UsIG9iaikge1xuICAgIHJldHVybiBpbnN0YW5jZS5fY2hhaW4gPyBfKG9iaikuY2hhaW4oKSA6IG9iajtcbiAgfTtcblxuICAvLyBBZGQgeW91ciBvd24gY3VzdG9tIGZ1bmN0aW9ucyB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8ubWl4aW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICBfLmVhY2goXy5mdW5jdGlvbnMob2JqKSwgZnVuY3Rpb24obmFtZSkge1xuICAgICAgdmFyIGZ1bmMgPSBfW25hbWVdID0gb2JqW25hbWVdO1xuICAgICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGFyZ3MgPSBbdGhpcy5fd3JhcHBlZF07XG4gICAgICAgIHB1c2guYXBwbHkoYXJncywgYXJndW1lbnRzKTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBmdW5jLmFwcGx5KF8sIGFyZ3MpKTtcbiAgICAgIH07XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQWRkIGFsbCBvZiB0aGUgVW5kZXJzY29yZSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIgb2JqZWN0LlxuICBfLm1peGluKF8pO1xuXG4gIC8vIEFkZCBhbGwgbXV0YXRvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIF8uZWFjaChbJ3BvcCcsICdwdXNoJywgJ3JldmVyc2UnLCAnc2hpZnQnLCAnc29ydCcsICdzcGxpY2UnLCAndW5zaGlmdCddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIG1ldGhvZCA9IEFycmF5UHJvdG9bbmFtZV07XG4gICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBvYmogPSB0aGlzLl93cmFwcGVkO1xuICAgICAgbWV0aG9kLmFwcGx5KG9iaiwgYXJndW1lbnRzKTtcbiAgICAgIGlmICgobmFtZSA9PT0gJ3NoaWZ0JyB8fCBuYW1lID09PSAnc3BsaWNlJykgJiYgb2JqLmxlbmd0aCA9PT0gMCkgZGVsZXRlIG9ialswXTtcbiAgICAgIHJldHVybiByZXN1bHQodGhpcywgb2JqKTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBBZGQgYWxsIGFjY2Vzc29yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgXy5lYWNoKFsnY29uY2F0JywgJ2pvaW4nLCAnc2xpY2UnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIG1ldGhvZC5hcHBseSh0aGlzLl93cmFwcGVkLCBhcmd1bWVudHMpKTtcbiAgICB9O1xuICB9KTtcblxuICAvLyBFeHRyYWN0cyB0aGUgcmVzdWx0IGZyb20gYSB3cmFwcGVkIGFuZCBjaGFpbmVkIG9iamVjdC5cbiAgXy5wcm90b3R5cGUudmFsdWUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fd3JhcHBlZDtcbiAgfTtcblxuICAvLyBQcm92aWRlIHVud3JhcHBpbmcgcHJveHkgZm9yIHNvbWUgbWV0aG9kcyB1c2VkIGluIGVuZ2luZSBvcGVyYXRpb25zXG4gIC8vIHN1Y2ggYXMgYXJpdGhtZXRpYyBhbmQgSlNPTiBzdHJpbmdpZmljYXRpb24uXG4gIF8ucHJvdG90eXBlLnZhbHVlT2YgPSBfLnByb3RvdHlwZS50b0pTT04gPSBfLnByb3RvdHlwZS52YWx1ZTtcblxuICBfLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAnJyArIHRoaXMuX3dyYXBwZWQ7XG4gIH07XG5cbiAgLy8gQU1EIHJlZ2lzdHJhdGlvbiBoYXBwZW5zIGF0IHRoZSBlbmQgZm9yIGNvbXBhdGliaWxpdHkgd2l0aCBBTUQgbG9hZGVyc1xuICAvLyB0aGF0IG1heSBub3QgZW5mb3JjZSBuZXh0LXR1cm4gc2VtYW50aWNzIG9uIG1vZHVsZXMuIEV2ZW4gdGhvdWdoIGdlbmVyYWxcbiAgLy8gcHJhY3RpY2UgZm9yIEFNRCByZWdpc3RyYXRpb24gaXMgdG8gYmUgYW5vbnltb3VzLCB1bmRlcnNjb3JlIHJlZ2lzdGVyc1xuICAvLyBhcyBhIG5hbWVkIG1vZHVsZSBiZWNhdXNlLCBsaWtlIGpRdWVyeSwgaXQgaXMgYSBiYXNlIGxpYnJhcnkgdGhhdCBpc1xuICAvLyBwb3B1bGFyIGVub3VnaCB0byBiZSBidW5kbGVkIGluIGEgdGhpcmQgcGFydHkgbGliLCBidXQgbm90IGJlIHBhcnQgb2ZcbiAgLy8gYW4gQU1EIGxvYWQgcmVxdWVzdC4gVGhvc2UgY2FzZXMgY291bGQgZ2VuZXJhdGUgYW4gZXJyb3Igd2hlbiBhblxuICAvLyBhbm9ueW1vdXMgZGVmaW5lKCkgaXMgY2FsbGVkIG91dHNpZGUgb2YgYSBsb2FkZXIgcmVxdWVzdC5cbiAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZSgndW5kZXJzY29yZScsIFtdLCBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBfO1xuICAgIH0pO1xuICB9XG59LmNhbGwodGhpcykpO1xuIl19
