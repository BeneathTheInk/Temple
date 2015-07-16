/*
 * Temple (with Source Map)
 * (c) 2014-2015 Beneath the Ink, Inc.
 * Copyright (C) 2011--2015 Meteor Development Group
 * MIT License
 * Version 0.5.6
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

},{"underscore":17}],3:[function(require,module,exports){
var _ = require("underscore"),
	Trackr = require("trackr"),
	parse = require("./m+xml").parse,
	NODE_TYPE = require("./types"),
	track = require("./track");

// properties that Node.js and the browser can handle
var Temple = module.exports = _.defaults({
	VERSION: "0.5.6",
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iL2QwN2ZmOGU5OWNmZGUyMWNmMTEzZGExM2QzNWQzODdiMGVkMzA5YTMvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vKipcbiAqIEBuYW1lc3BhY2UgVHJhY2tyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja3ItcmVsYXRlZCBtZXRob2RzLlxuICovXG52YXIgVHJhY2tyID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hY3RpdmVcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoZXJlIGlzIGEgY3VycmVudCBjb21wdXRhdGlvbiwgbWVhbmluZyB0aGF0IGRlcGVuZGVuY2llcyBvbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgd2lsbCBiZSB0cmFja2VkIGFuZCBwb3RlbnRpYWxseSBjYXVzZSB0aGUgY3VycmVudCBjb21wdXRhdGlvbiB0byBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtCb29sZWFufVxuICovXG5UcmFja3IuYWN0aXZlID0gZmFsc2U7XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY3VycmVudGNvbXB1dGF0aW9uXG5cbi8qKlxuICogQHN1bW1hcnkgVGhlIGN1cnJlbnQgY29tcHV0YXRpb24sIG9yIGBudWxsYCBpZiB0aGVyZSBpc24ndCBvbmUuICBUaGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyB0aGUgW2BUcmFja3IuQ29tcHV0YXRpb25gXSgjdHJhY2tlcl9jb21wdXRhdGlvbikgb2JqZWN0IGNyZWF0ZWQgYnkgdGhlIGlubmVybW9zdCBhY3RpdmUgY2FsbCB0byBgVHJhY2tyLmF1dG9ydW5gLCBhbmQgaXQncyB0aGUgY29tcHV0YXRpb24gdGhhdCBnYWlucyBkZXBlbmRlbmNpZXMgd2hlbiByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYXJlIGFjY2Vzc2VkLlxuICogQGxvY3VzIENsaWVudFxuICogQHR5cGUge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IG51bGw7XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gYztcblx0VHJhY2tyLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG52YXIgX2RlYnVnRnVuYyA9IGZ1bmN0aW9uICgpIHtcblx0Ly8gV2Ugd2FudCB0aGlzIGNvZGUgdG8gd29yayB3aXRob3V0IE1ldGVvciwgYW5kIGFsc28gd2l0aG91dFxuXHQvLyBcImNvbnNvbGVcIiAod2hpY2ggaXMgdGVjaG5pY2FsbHkgbm9uLXN0YW5kYXJkIGFuZCBtYXkgYmUgbWlzc2luZ1xuXHQvLyBvbiBzb21lIGJyb3dzZXIgd2UgY29tZSBhY3Jvc3MsIGxpa2UgaXQgd2FzIG9uIElFIDcpLlxuXHQvL1xuXHQvLyBMYXp5IGV2YWx1YXRpb24gYmVjYXVzZSBgTWV0ZW9yYCBkb2VzIG5vdCBleGlzdCByaWdodCBhd2F5Lig/Pylcblx0cmV0dXJuICh0eXBlb2YgTWV0ZW9yICE9PSBcInVuZGVmaW5lZFwiID8gTWV0ZW9yLl9kZWJ1ZyA6XG5cdFx0XHRcdFx0KCh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5sb2cgP1xuXHRcdFx0XHRcdCBmdW5jdGlvbiAoKSB7IGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuXHRcdFx0XHRcdCBmdW5jdGlvbiAoKSB7fSkpO1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcblx0aWYgKHRocm93Rmlyc3RFcnJvcikge1xuXHRcdHRocm93IGU7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIG1lc3NhZ2VBbmRTdGFjaztcblx0XHRpZiAoZS5zdGFjayAmJiBlLm1lc3NhZ2UpIHtcblx0XHRcdHZhciBpZHggPSBlLnN0YWNrLmluZGV4T2YoZS5tZXNzYWdlKTtcblx0XHRcdGlmIChpZHggPj0gMCAmJiBpZHggPD0gMTApIC8vIGFsbG93IGZvciBcIkVycm9yOiBcIiAoYXQgbGVhc3QgNylcblx0XHRcdFx0bWVzc2FnZUFuZFN0YWNrID0gZS5zdGFjazsgLy8gbWVzc2FnZSBpcyBwYXJ0IG9mIGUuc3RhY2ssIGFzIGluIENocm9tZVxuXHRcdFx0ZWxzZVxuXHRcdFx0XHRtZXNzYWdlQW5kU3RhY2sgPSBlLm1lc3NhZ2UgK1xuXHRcdFx0XHQoZS5zdGFjay5jaGFyQXQoMCkgPT09ICdcXG4nID8gJycgOiAnXFxuJykgKyBlLnN0YWNrOyAvLyBlLmcuIFNhZmFyaVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlQW5kU3RhY2sgPSBlLnN0YWNrIHx8IGUubWVzc2FnZTtcblx0XHR9XG5cdFx0X2RlYnVnRnVuYygpKFwiRXhjZXB0aW9uIGZyb20gVHJhY2tyIFwiICsgZnJvbSArIFwiIGZ1bmN0aW9uOlwiLFxuXHRcdFx0XHRcdFx0XHRcdCBtZXNzYWdlQW5kU3RhY2spO1xuXHR9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcblx0aWYgKCh0eXBlb2YgTWV0ZW9yID09PSAndW5kZWZpbmVkJykgfHwgTWV0ZW9yLmlzQ2xpZW50KSB7XG5cdFx0cmV0dXJuIGY7XG5cdH0gZWxzZSB7XG5cdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0XHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdFx0TWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWQoZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRmLmFwcGx5KG51bGwsIGFyZ3MpO1xuXHRcdFx0fSk7XG5cdFx0fTtcblx0fVxufTtcblxudmFyIG5leHRJZCA9IDE7XG4vLyBjb21wdXRhdGlvbnMgd2hvc2UgY2FsbGJhY2tzIHdlIHNob3VsZCBjYWxsIGF0IGZsdXNoIHRpbWVcbnZhciBwZW5kaW5nQ29tcHV0YXRpb25zID0gW107XG4vLyBgdHJ1ZWAgaWYgYSBUcmFja3IuZmx1c2ggaXMgc2NoZWR1bGVkLCBvciBpZiB3ZSBhcmUgaW4gVHJhY2tyLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgaW5GbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lXG4vLyBvciByZWNvbXB1dGUuICBUaGlzIG1hdGNoZXMgVHJhY2tyLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZVxuLy8gVHJhY2tyLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBUcmFja3IuZmx1c2ggdGhhdCB3ZSBhcmUgaW4uIFdoZW4gc2V0LCB0aHJvdyByYXRoZXIgdGhhbiBsb2cgdGhlXG4vLyBmaXJzdCBlcnJvciBlbmNvdW50ZXJlZCB3aGlsZSBmbHVzaGluZy4gQmVmb3JlIHRocm93aW5nIHRoZSBlcnJvcixcbi8vIGZpbmlzaCBmbHVzaGluZyAoZnJvbSBhIGZpbmFsbHkgYmxvY2spLCBsb2dnaW5nIGFueSBzdWJzZXF1ZW50XG4vLyBlcnJvcnMuXG52YXIgdGhyb3dGaXJzdEVycm9yID0gZmFsc2U7XG5cbnZhciBhZnRlckZsdXNoQ2FsbGJhY2tzID0gW107XG5cbi8vIGxvb2sgZm9yIGEgcmVxdWVzdEFuaW1hdGlvbkZyYW1lIGFzIHRoYXQgaXMgcHJlZmVyYWJsZSBvdmVyIG5leHRUaWNrIG9yIHNldEltbWVkaWF0ZVxudmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgP1xuXHR3aW5kb3cucmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG5cdHdpbmRvdy5tb3pSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcblx0d2luZG93LndlYmtpdFJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuXHR3aW5kb3cub1JlcXVlc3RBbmltYXRpb25GcmFtZSA6XG5cdG51bGw7XG5cbi8vIGNvbnRyb2xzIHRoZSBkZWZlcnJhbFxuVHJhY2tyLm5leHRUaWNrID0gcmVxdWVzdEFuaW1hdGlvbkZyYW1lICE9IG51bGwgPyByZXF1ZXN0QW5pbWF0aW9uRnJhbWUuYmluZCh3aW5kb3cpIDpcblx0dHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgPyBwcm9jZXNzLm5leHRUaWNrIDpcblx0ZnVuY3Rpb24gKGYpIHsgc2V0VGltZW91dChmLCAxNik7IH07XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG5cdGlmICghIHdpbGxGbHVzaCkge1xuXHRcdFRyYWNrci5uZXh0VGljayhUcmFja3IuZmx1c2gpO1xuXHRcdHdpbGxGbHVzaCA9IHRydWU7XG5cdH1cbn07XG5cbi8vIFRyYWNrci5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyB2aXNpYmxlIGJ1dCBwcml2YXRlXG4vLyAodGhyb3dzIGFuIGVycm9yIGlmIHlvdSB0cnkgdG8gY2FsbCBpdClcbnZhciBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9jb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IEEgQ29tcHV0YXRpb24gb2JqZWN0IHJlcHJlc2VudHMgY29kZSB0aGF0IGlzIHJlcGVhdGVkbHkgcmVydW5cbiAqIGluIHJlc3BvbnNlIHRvXG4gKiByZWFjdGl2ZSBkYXRhIGNoYW5nZXMuIENvbXB1dGF0aW9ucyBkb24ndCBoYXZlIHJldHVybiB2YWx1ZXM7IHRoZXkganVzdFxuICogcGVyZm9ybSBhY3Rpb25zLCBzdWNoIGFzIHJlcmVuZGVyaW5nIGEgdGVtcGxhdGUgb24gdGhlIHNjcmVlbi4gQ29tcHV0YXRpb25zXG4gKiBhcmUgY3JlYXRlZCB1c2luZyBUcmFja3IuYXV0b3J1bi4gVXNlIHN0b3AgdG8gcHJldmVudCBmdXJ0aGVyIHJlcnVubmluZyBvZiBhXG4gKiBjb21wdXRhdGlvbi5cbiAqIEBpbnN0YW5jZW5hbWUgY29tcHV0YXRpb25cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGYsIHBhcmVudCwgY3R4KSB7XG5cdGlmICghIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uKVxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFwiVHJhY2tyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBUcmFja3IuYXV0b3J1blwiKTtcblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cblx0ICogQGxvY3VzIENsaWVudFxuXHQgKiBAbWVtYmVyT2YgVHJhY2tyLkNvbXB1dGF0aW9uXG5cdCAqIEBpbnN0YW5jZVxuXHQgKiBAbmFtZSAgc3RvcHBlZFxuXHQgKi9cblx0c2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIGludmFsaWRhdGVkXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrci5hdXRvcnVuYCBpcyBjYWxsZWQsIGFuZCBmYWxzZSBvbiBzdWJzZXF1ZW50IHJlcnVucyBhbmQgYXQgb3RoZXIgdGltZXMuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIGZpcnN0UnVuXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5maXJzdFJ1biA9IHRydWU7XG5cblx0c2VsZi5faWQgPSBuZXh0SWQrKztcblx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG5cdC8vIHRoZSBwbGFuIGlzIGF0IHNvbWUgcG9pbnQgdG8gdXNlIHRoZSBwYXJlbnQgcmVsYXRpb25cblx0Ly8gdG8gY29uc3RyYWluIHRoZSBvcmRlciB0aGF0IGNvbXB1dGF0aW9ucyBhcmUgcHJvY2Vzc2VkXG5cdHNlbGYuX3BhcmVudCA9IHBhcmVudDtcblx0c2VsZi5fZnVuYyA9IGY7XG5cdHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cdHNlbGYuX2NvbnRleHQgPSBjdHggfHwgbnVsbDtcblxuXHR2YXIgZXJyb3JlZCA9IHRydWU7XG5cdHRyeSB7XG5cdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdGVycm9yZWQgPSBmYWxzZTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0aWYgKGVycm9yZWQpXG5cdFx0XHRzZWxmLnN0b3AoKTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLiAgVGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gaW52YWxpZGF0aW9uLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBpbnZhbGlkYXRlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCAhPT0gdm9pZCAwID8gY3R4IDogc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlcyB0aGlzIGNvbXB1dGF0aW9uIHNvIHRoYXQgaXQgd2lsbCBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHQvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG5cdFx0Ly8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG5cdFx0aWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcblx0XHRcdHJlcXVpcmVGbHVzaCgpO1xuXHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuXHRcdH1cblxuXHRcdHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2Vcblx0XHQvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4ICE9PSB2b2lkIDAgPyBmLmN0eCA6IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5cbi8qKlxuICogQHN1bW1hcnkgUHJldmVudHMgdGhpcyBjb21wdXRhdGlvbiBmcm9tIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoISB0aGlzLnN0b3BwZWQpIHtcblx0XHR0aGlzLnN0b3BwZWQgPSB0cnVlO1xuXHRcdHRoaXMuaW52YWxpZGF0ZSgpO1xuXHR9XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG5cdHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcblx0aW5Db21wdXRlID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0XHRpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fcmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0c2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuXHR0cnkge1xuXHRcdHdoaWxlIChzZWxmLmludmFsaWRhdGVkICYmICEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZWxmLl9jb21wdXRlKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSWYgX2NvbXB1dGUoKSBpbnZhbGlkYXRlZCB1cywgd2UgcnVuIGFnYWluIGltbWVkaWF0ZWx5LlxuXHRcdFx0Ly8gQSBjb21wdXRhdGlvbiB0aGF0IGludmFsaWRhdGVzIGl0c2VsZiBpbmRlZmluaXRlbHkgaXMgYW5cblx0XHRcdC8vIGluZmluaXRlIGxvb3AsIG9mIGNvdXJzZS5cblx0XHRcdC8vXG5cdFx0XHQvLyBXZSBjb3VsZCBwdXQgYW4gaXRlcmF0aW9uIGNvdW50ZXIgaGVyZSBhbmQgY2F0Y2ggcnVuLWF3YXlcblx0XHRcdC8vIGxvb3BzLlxuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHR9XG59O1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9kZXBlbmRlbmN5XG5cbi8qKlxuICogQHN1bW1hcnkgQSBEZXBlbmRlbmN5IHJlcHJlc2VudHMgYW4gYXRvbWljIHVuaXQgb2YgcmVhY3RpdmUgZGF0YSB0aGF0IGFcbiAqIGNvbXB1dGF0aW9uIG1pZ2h0IGRlcGVuZCBvbi4gUmVhY3RpdmUgZGF0YSBzb3VyY2VzIHN1Y2ggYXMgU2Vzc2lvbiBvclxuICogTWluaW1vbmdvIGludGVybmFsbHkgY3JlYXRlIGRpZmZlcmVudCBEZXBlbmRlbmN5IG9iamVjdHMgZm9yIGRpZmZlcmVudFxuICogcGllY2VzIG9mIGRhdGEsIGVhY2ggb2Ygd2hpY2ggbWF5IGJlIGRlcGVuZGVkIG9uIGJ5IG11bHRpcGxlIGNvbXB1dGF0aW9ucy5cbiAqIFdoZW4gdGhlIGRhdGEgY2hhbmdlcywgdGhlIGNvbXB1dGF0aW9ucyBhcmUgaW52YWxpZGF0ZWQuXG4gKiBAY2xhc3NcbiAqIEBpbnN0YW5jZU5hbWUgZGVwZW5kZW5jeVxuICovXG5UcmFja3IuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4vL1xuLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4vLyBwcmVzZW50LiAgUmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4vLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbi8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cblxuLyoqXG4gKiBAc3VtbWFyeSBEZWNsYXJlcyB0aGF0IHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIChvciBgZnJvbUNvbXB1dGF0aW9uYCBpZiBnaXZlbikgZGVwZW5kcyBvbiBgZGVwZW5kZW5jeWAuICBUaGUgY29tcHV0YXRpb24gd2lsbCBiZSBpbnZhbGlkYXRlZCB0aGUgbmV4dCB0aW1lIGBkZXBlbmRlbmN5YCBjaGFuZ2VzLlxuXG5JZiB0aGVyZSBpcyBubyBjdXJyZW50IGNvbXB1dGF0aW9uIGFuZCBgZGVwZW5kKClgIGlzIGNhbGxlZCB3aXRoIG5vIGFyZ3VtZW50cywgaXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zIGZhbHNlLlxuXG5SZXR1cm5zIHRydWUgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGEgbmV3IGRlcGVuZGVudCBvZiBgZGVwZW5kZW5jeWAgcmF0aGVyIHRoYW4gYW4gZXhpc3Rpbmcgb25lLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb259IFtmcm9tQ29tcHV0YXRpb25dIEFuIG9wdGlvbmFsIGNvbXB1dGF0aW9uIGRlY2xhcmVkIHRvIGRlcGVuZCBvbiBgZGVwZW5kZW5jeWAgaW5zdGVhZCBvZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbi5cbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24gKGNvbXB1dGF0aW9uKSB7XG5cdGlmICghIGNvbXB1dGF0aW9uKSB7XG5cdFx0aWYgKCEgVHJhY2tyLmFjdGl2ZSlcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdGNvbXB1dGF0aW9uID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0fVxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcblx0aWYgKCEgKGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKSkge1xuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXSA9IGNvbXB1dGF0aW9uO1xuXHRcdGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRkZWxldGUgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfY2hhbmdlZFxuXG4vKipcbiAqIEBzdW1tYXJ5IEludmFsaWRhdGUgYWxsIGRlcGVuZGVudCBjb21wdXRhdGlvbnMgaW1tZWRpYXRlbHkgYW5kIHJlbW92ZSB0aGVtIGFzIGRlcGVuZGVudHMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvciAodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2hhc2RlcGVuZGVudHNcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgRGVwZW5kZW5jeSBoYXMgb25lIG9yIG1vcmUgZGVwZW5kZW50IENvbXB1dGF0aW9ucywgd2hpY2ggd291bGQgYmUgaW52YWxpZGF0ZWQgaWYgdGhpcyBEZXBlbmRlbmN5IHdlcmUgdG8gY2hhbmdlLlxuICogQGxvY3VzIENsaWVudFxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5oYXNEZXBlbmRlbnRzID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0cmV0dXJuIHRydWU7XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZmx1c2hcblxuLyoqXG4gKiBAc3VtbWFyeSBQcm9jZXNzIGFsbCByZWFjdGl2ZSB1cGRhdGVzIGltbWVkaWF0ZWx5IGFuZCBlbnN1cmUgdGhhdCBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGFyZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLmZsdXNoID0gZnVuY3Rpb24gKF9vcHRzKSB7XG5cdC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuXHQvLyBoYXZlIFNwYXJrKVxuXHQvL1xuXHQvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuXHQvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG5cdC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tyLmZsdXNoLiAgQXQgdGhlIG1vbWVudFxuXHQvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG5cdC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLiAgQW5kIHdlIGRvbid0IGhhdmVcblx0Ly8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG5cdC8vXG5cdC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcblx0aWYgKGluRmx1c2gpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja3IuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cblx0aWYgKGluQ29tcHV0ZSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tyLmF1dG9ydW5cIik7XG5cblx0aW5GbHVzaCA9IHRydWU7XG5cdHdpbGxGbHVzaCA9IHRydWU7XG5cdHRocm93Rmlyc3RFcnJvciA9ICEhIChfb3B0cyAmJiBfb3B0cy5fdGhyb3dGaXJzdEVycm9yKTtcblxuXHR2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcblx0XHRcdFx0XHQgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuXHRcdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHRjb21wLl9yZWNvbXB1dGUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuXHRcdFx0XHQvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG5cdFx0XHRcdHZhciBjYiA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjYi5mbi5jYWxsKGNiLmN0eCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRfdGhyb3dPckxvZyhcImFmdGVyRmx1c2hcIiwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmICghIGZpbmlzaGVkVHJ5KSB7XG5cdFx0XHQvLyB3ZSdyZSBlcnJvcmluZ1xuXHRcdFx0aW5GbHVzaCA9IGZhbHNlOyAvLyBuZWVkZWQgYmVmb3JlIGNhbGxpbmcgYFRyYWNrci5mbHVzaCgpYCBhZ2FpblxuXHRcdFx0VHJhY2tyLmZsdXNoKHtfdGhyb3dGaXJzdEVycm9yOiBmYWxzZX0pOyAvLyBmaW5pc2ggZmx1c2hpbmdcblx0XHR9XG5cdFx0d2lsbEZsdXNoID0gZmFsc2U7XG5cdFx0aW5GbHVzaCA9IGZhbHNlO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2F1dG9ydW5cbi8vXG4vLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4vLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuLy9cbi8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4vL1xuLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4vLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gbm93IGFuZCByZXJ1biBpdCBsYXRlciB3aGVuZXZlciBpdHMgZGVwZW5kZW5jaWVzIGNoYW5nZS4gUmV0dXJucyBhIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IGNhbiBiZSB1c2VkIHRvIHN0b3Agb3Igb2JzZXJ2ZSB0aGUgcmVydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlcyBvbmUgYXJndW1lbnQ6IHRoZSBDb21wdXRhdGlvbiBvYmplY3QgdGhhdCB3aWxsIGJlIHJldHVybmVkLlxuICogQHJldHVybnMge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyYWNrci5hdXRvcnVuIHJlcXVpcmVzIGEgZnVuY3Rpb24gYXJndW1lbnQnKTtcblxuXHRjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IHRydWU7XG5cdHZhciBjID0gbmV3IFRyYWNrci5Db21wdXRhdGlvbihmLCBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLCBjdHgpO1xuXG5cdGlmIChUcmFja3IuYWN0aXZlKVxuXHRcdFRyYWNrci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuXHRcdFx0Yy5zdG9wKCk7XG5cdFx0fSk7XG5cblx0cmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuICBVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIHdpdGhvdXQgdHJhY2tpbmcgZGVwZW5kZW5jaWVzLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBBIGZ1bmN0aW9uIHRvIGNhbGwgaW1tZWRpYXRlbHkuXG4gKi9cblRyYWNrci5ub25SZWFjdGl2ZSA9IFxuVHJhY2tyLm5vbnJlYWN0aXZlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24obnVsbCk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGYuY2FsbChjdHgpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG5cdH1cbn07XG5cbi8vIGxpa2Ugbm9ucmVhY3RpdmUgYnV0IG1ha2VzIGEgZnVuY3Rpb24gaW5zdGVhZFxuVHJhY2tyLm5vblJlYWN0YWJsZSA9IFxuVHJhY2tyLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGYuYXBwbHkoY3R4LCBhcmdzKTtcblx0XHR9KTtcblx0fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IFtgb25JbnZhbGlkYXRlYF0oI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZSkgY2FsbGJhY2sgb24gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKHdoaWNoIG11c3QgZXhpc3QpLCB0byBiZSBjYWxsZWQgaW1tZWRpYXRlbHkgd2hlbiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZCBvciBzdG9wcGVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgaW52b2tlZCBhcyBgZnVuYyhjKWAsIHdoZXJlIGBjYCBpcyB0aGUgY29tcHV0YXRpb24gb24gd2hpY2ggdGhlIGNhbGxiYWNrIGlzIHJlZ2lzdGVyZWQuXG4gKi9cblRyYWNrci5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVHJhY2tyLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hZnRlcmZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgU2NoZWR1bGVzIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGR1cmluZyB0aGUgbmV4dCBmbHVzaCwgb3IgbGF0ZXIgaW4gdGhlIGN1cnJlbnQgZmx1c2ggaWYgb25lIGlzIGluIHByb2dyZXNzLCBhZnRlciBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGhhdmUgYmVlbiByZXJ1bi4gIFRoZSBmdW5jdGlvbiB3aWxsIGJlIHJ1biBvbmNlIGFuZCBub3Qgb24gc3Vic2VxdWVudCBmbHVzaGVzIHVubGVzcyBgYWZ0ZXJGbHVzaGAgaXMgY2FsbGVkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBjYWxsIGF0IGZsdXNoIHRpbWUuXG4gKi9cblRyYWNrci5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdHJlcXVpcmVGbHVzaCgpO1xufTsiXX0=
},{"_process":15}],17:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZG9tcmFuZ2UuanMiLCJsaWIvZXZlbnRzLmpzIiwibGliL2luZGV4LmpzIiwibGliL20reG1sLmpzIiwibGliL21vZGVsLmpzIiwibGliL211c3RhY2hlLmpzIiwibGliL3BsdWdpbnMvYWN0aW9ucy5qcyIsImxpYi9wbHVnaW5zL2luZGV4LmpzIiwibGliL3BsdWdpbnMvdHdvd2F5LmpzIiwibGliL3NlY3Rpb24uanMiLCJsaWIvdHJhY2suanMiLCJsaWIvdHlwZXMuanMiLCJsaWIvdXRpbC5qcyIsImxpYi92aWV3LmpzIiwibm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIiwibm9kZV9tb2R1bGVzL3VuZGVyc2NvcmUvdW5kZXJzY29yZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2WkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwdUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN1BBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1aEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBUaGlzIGlzIGEgaGVhdmlseSBtb2RpZmllZCB2ZXJzaW9uIG9mIE1ldGVvcidzIERPTVJhbmdlIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iLzQwNTAwOWEyYzNkY2QzYzFmZTc4MGFkYjI4NjdkMzhhNmE0MmZmZjEvcGFja2FnZXMvYmxhemUvZG9tcmFuZ2UuanMgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdEV2ZW50cyA9IHJlcXVpcmUoXCIuL2V2ZW50c1wiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKGEpIHtcblx0cmV0dXJuIGEgIT0gbnVsbCAmJiB0eXBlb2YgYS5sZW5ndGggPT09IFwibnVtYmVyXCI7XG59XG5cbi8vIGBbbmV3XSBCbGF6ZS5fRE9NUmFuZ2UoW25vZGVBbmRSYW5nZUFycmF5XSlgXG4vL1xuLy8gQSBET01SYW5nZSBjb25zaXN0cyBvZiBhbiBhcnJheSBvZiBjb25zZWN1dGl2ZSBub2RlcyBhbmQgRE9NUmFuZ2VzLFxuLy8gd2hpY2ggbWF5IGJlIHJlcGxhY2VkIGF0IGFueSB0aW1lIHdpdGggYSBuZXcgYXJyYXkuICBJZiB0aGUgRE9NUmFuZ2Vcbi8vIGhhcyBiZWVuIGF0dGFjaGVkIHRvIHRoZSBET00gYXQgc29tZSBsb2NhdGlvbiwgdGhlbiB1cGRhdGluZ1xuLy8gdGhlIGFycmF5IHdpbGwgY2F1c2UgdGhlIERPTSB0byBiZSB1cGRhdGVkIGF0IHRoYXQgbG9jYXRpb24uXG5mdW5jdGlvbiBET01SYW5nZShub2RlQW5kUmFuZ2VBcnJheSkge1xuXHQvLyBjYWxsZWQgd2l0aG91dCBgbmV3YFxuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgRE9NUmFuZ2UpKSB7XG5cdFx0cmV0dXJuIG5ldyBET01SYW5nZShub2RlQW5kUmFuZ2VBcnJheSk7XG5cdH1cblxuXHR2YXIgbWVtYmVycyA9IChub2RlQW5kUmFuZ2VBcnJheSB8fCBbXSk7XG5cdGlmICghaXNBcnJheUxpa2UobWVtYmVycykpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGFycmF5XCIpO1xuXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdHRoaXMuX21lbWJlckluKG1lbWJlcnNbaV0pO1xuXHR9XG5cblx0dGhpcy5tZW1iZXJzID0gbWVtYmVycztcblx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdHRoaXMuYXR0YWNoZWQgPSBmYWxzZTtcblx0dGhpcy5wYXJlbnRFbGVtZW50ID0gbnVsbDtcblx0dGhpcy5wYXJlbnRSYW5nZSA9IG51bGw7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTVJhbmdlO1xuRE9NUmFuZ2UuZXh0ZW5kID0gdXRpbC5zdWJjbGFzcztcblxuLy8gZmluZHMgdGhlIERPTVJhbmdlIHRoZSBlbGVtZW50IGlzIGEgcGFydCBvZlxuRE9NUmFuZ2UuZm9yRWxlbWVudCA9IGZ1bmN0aW9uIChlbGVtKSB7XG5cdGlmIChlbGVtLm5vZGVUeXBlICE9PSAxKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBlbGVtZW50LCBmb3VuZDogXCIgKyBlbGVtKTtcblx0XG5cdHZhciByYW5nZSA9IG51bGw7XG5cdFxuXHR3aGlsZSAoZWxlbSAmJiAhcmFuZ2UpIHtcblx0XHRyYW5nZSA9IChlbGVtLiRkb21yYW5nZSB8fCBudWxsKTtcblx0XHRlbGVtID0gZWxlbS5wYXJlbnROb2RlO1xuXHR9XG5cblx0cmV0dXJuIHJhbmdlO1xufTtcblxuXy5leHRlbmQoRE9NUmFuZ2UucHJvdG90eXBlLCBFdmVudHMsIHtcblxuXHQvLyBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgdG8gaW5zZXJ0IHRoZSBET01SYW5nZSBpbnRvIHRoZSBET00gZm9yXG5cdC8vIHRoZSBmaXJzdCB0aW1lLCBidXQgaXQncyBhbHNvIHVzZWQgaW50ZXJuYWxseSB3aGVuXG5cdC8vIHVwZGF0aW5nIHRoZSBET00uXG5cdC8vIElmIF9pc01vdmUgaXMgdHJ1ZSwgbW92ZSB0aGlzIGF0dGFjaGVkIHJhbmdlIHRvIGEgZGlmZmVyZW50XG5cdC8vIGxvY2F0aW9uIHVuZGVyIHRoZSBzYW1lIHBhcmVudEVsZW1lbnQuXG5cdGF0dGFjaDogZnVuY3Rpb24ocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUsIF9pc1JlcGxhY2UpIHtcblx0XHRpZiAodHlwZW9mIHBhcmVudEVsZW1lbnQgPT09IFwic3RyaW5nXCIpIHBhcmVudEVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHBhcmVudEVsZW1lbnQpO1xuXHRcdGlmICh0eXBlb2YgbmV4dE5vZGUgPT09IFwic3RyaW5nXCIpIG5leHROb2RlID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IobmV4dE5vZGUpO1xuXHRcdGlmIChwYXJlbnRFbGVtZW50ID09IG51bGwpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIHZhbGlkIERPTSBlbGVtZW50IHRvIGF0dGFjaCBpbi5cIik7XG5cblx0XHRpZiAoKF9pc01vdmUgfHwgX2lzUmVwbGFjZSkgJiYgISh0aGlzLnBhcmVudEVsZW1lbnQgPT09IHBhcmVudEVsZW1lbnQgJiYgdGhpcy5hdHRhY2hlZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkNhbiBvbmx5IG1vdmUgb3IgcmVwbGFjZSBhbiBhdHRhY2hlZCBET01SYW5nZSwgYW5kIG9ubHkgdW5kZXIgdGhlIHNhbWUgcGFyZW50IGVsZW1lbnRcIik7XG5cdFx0fVxuXG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0aWYgKG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gbnVsbDtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpbnNlcnRJbnRvRE9NKG1lbWJlcnNbaV0sIHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXJOb2RlKCk7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0XHRwYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZShwbGFjZWhvbGRlciwgbmV4dE5vZGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuYXR0YWNoZWQgPSB0cnVlO1xuXHRcdHRoaXMucGFyZW50RWxlbWVudCA9IHBhcmVudEVsZW1lbnQ7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50cyBvbmx5IG9uIGZyZXNoIGF0dGFjaG1lbnRzXG5cdFx0aWYgKCEoX2lzTW92ZSB8fCBfaXNSZXBsYWNlKSkgdGhpcy50cmlnZ2VyKFwiYXR0YWNoXCIsIHBhcmVudEVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZGV0YWNoOiBmdW5jdGlvbihfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSByZXR1cm4gdGhpcztcblxuXHRcdHZhciBvbGRQYXJlbnRFbGVtZW50ID0gdGhpcy5wYXJlbnRFbGVtZW50O1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGlmIChtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtZW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHJlbW92ZUZyb21ET00obWVtYmVyc1tpXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwbGFjZWhvbGRlciA9IHRoaXMucGxhY2Vob2xkZXI7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQocGxhY2Vob2xkZXIpO1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCFfaXNSZXBsYWNlKSB7XG5cdFx0XHR0aGlzLmF0dGFjaGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQgPSBudWxsO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiZGV0YWNoXCIsIG9sZFBhcmVudEVsZW1lbnQpO1xuXHRcdH1cblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkgdGhyb3cgbmV3IEVycm9yKFwiTXVzdCBiZSBhdHRhY2hlZFwiKTtcblx0XHRpZiAoIXRoaXMubWVtYmVycy5sZW5ndGgpIHJldHVybiB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdHZhciBtID0gdGhpcy5tZW1iZXJzWzBdO1xuXHRcdHJldHVybiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0uZmlyc3ROb2RlKCkgOiBtO1xuXHR9LFxuXG5cdGxhc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHRocm93IG5ldyBFcnJvcihcIk11c3QgYmUgYXR0YWNoZWRcIik7XG5cdFx0aWYgKCF0aGlzLm1lbWJlcnMubGVuZ3RoKSByZXR1cm4gdGhpcy5wbGFjZWhvbGRlcjtcblx0XHR2YXIgbSA9IHRoaXMubWVtYmVyc1t0aGlzLm1lbWJlcnMubGVuZ3RoIC0gMV07XG5cdFx0cmV0dXJuIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpID8gbS5sYXN0Tm9kZSgpIDogbTtcblx0fSxcblxuXHRnZXRNZW1iZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRpZiAoIShhdEluZGV4ID49IDAgJiYgYXRJbmRleCA8IG1lbWJlcnMubGVuZ3RoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIGluZGV4IGluIHJhbmdlLmdldE1lbWJlcjogXCIgKyBhdEluZGV4KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWVtYmVyc1thdEluZGV4XTtcblx0fSxcblxuXHQvLyByZXNldHMgdGhlIERPTVJhbmdlIHdpdGggbmV3IGNvbnRlbnRcblx0c2V0TWVtYmVyczogZnVuY3Rpb24obmV3Tm9kZUFuZFJhbmdlQXJyYXkpIHtcblx0XHR2YXIgbmV3TWVtYmVycyA9IG5ld05vZGVBbmRSYW5nZUFycmF5O1xuXHRcdGlmICghaXNBcnJheUxpa2UobmV3TWVtYmVycykpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGFycmF5XCIpO1xuXHRcdHZhciBvbGRNZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdHZhciBfaXNSZXBsYWNlID0gdGhpcy5hdHRhY2hlZCAmJiAobmV3TWVtYmVycy5sZW5ndGggfHwgb2xkTWVtYmVycy5sZW5ndGgpO1xuXG5cdFx0Ly8gZGVyZWZlcmVuY2Ugb2xkIG1lbWJlcnNcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG9sZE1lbWJlcnMubGVuZ3RoOyBpKyspIHRoaXMuX21lbWJlck91dChvbGRNZW1iZXJzW2ldLCBmYWxzZSwgX2lzUmVwbGFjZSk7XG5cblx0XHQvLyByZWZlcmVuY2UgbmV3IG1lbWJlcnNcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG5ld01lbWJlcnMubGVuZ3RoOyBpKyspIHRoaXMuX21lbWJlckluKG5ld01lbWJlcnNbaV0pO1xuXG5cdFx0aWYgKF9pc1JlcGxhY2UpIHtcblx0XHRcdC8vIGRldGFjaCB0aGUgb2xkIG1lbWJlcnMgYW5kIGluc2VydCB0aGUgbmV3IG1lbWJlcnNcblx0XHRcdHZhciBuZXh0Tm9kZSA9IHRoaXMubGFzdE5vZGUoKS5uZXh0U2libGluZztcblx0XHRcdHZhciBwYXJlbnRFbGVtZW50ID0gdGhpcy5wYXJlbnRFbGVtZW50O1xuXHRcdFx0Ly8gVXNlIGRldGFjaC9hdHRhY2gsIGJ1dCBkb24ndCB0cmlnZ2VyIGV2ZW50c1xuXHRcdFx0dGhpcy5kZXRhY2godHJ1ZSAvKl9pc1JlcGxhY2UqLyk7XG5cdFx0XHR0aGlzLm1lbWJlcnMgPSBuZXdNZW1iZXJzO1xuXHRcdFx0dGhpcy5hdHRhY2gocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIGZhbHNlLCB0cnVlIC8qX2lzUmVwbGFjZSovKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZG9uJ3QgZG8gYW55dGhpbmcgaWYgd2UncmUgZ29pbmcgZnJvbSBlbXB0eSB0byBlbXB0eVxuXHRcdFx0dGhpcy5tZW1iZXJzID0gbmV3TWVtYmVycztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhZGRNZW1iZXI6IGZ1bmN0aW9uKG5ld01lbWJlciwgYXRJbmRleCwgX2lzTW92ZSkge1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdFxuXHRcdC8vIHZhbGlkYXRlIHRoZSBpbmRleFxuXHRcdGlmICh0eXBlb2YgYXRJbmRleCAhPT0gXCJudW1iZXJcIiB8fCBpc05hTihhdEluZGV4KSB8fFxuXHRcdFx0YXRJbmRleCA8IDAgfHwgYXRJbmRleCA+IG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHRhdEluZGV4ID0gbWVtYmVycy5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Ly8gYWRkIHJlZmVyZW5jZXMgdG8gdGhlIG5ldyBtZW1iZXJcblx0XHRpZiAoIV9pc01vdmUpIHRoaXMuX21lbWJlckluKG5ld01lbWJlcik7XG5cblx0XHQvLyBjdXJyZW50bHkgZGV0YWNoZWQ7IGp1c3QgdXBkYXRlZCBtZW1iZXJzXG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSB7XG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAwLCBuZXdNZW1iZXIpO1xuXHRcdH1cblxuXHRcdC8vIGVtcHR5OyB1c2UgdGhlIGVtcHR5LXRvLW5vbmVtcHR5IGhhbmRsaW5nIG9mIHNldE1lbWJlcnNcblx0XHRlbHNlIGlmIChtZW1iZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5zZXRNZW1iZXJzKFsgbmV3TWVtYmVyIF0pO1xuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBhZGQgYXQgbG9jYXRpb25cblx0XHRlbHNlIHtcblx0XHRcdHZhciBuZXh0Tm9kZTtcblx0XHRcdGlmIChhdEluZGV4ID09PSBtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBpbnNlcnQgYXQgZW5kXG5cdFx0XHRcdG5leHROb2RlID0gdGhpcy5sYXN0Tm9kZSgpLm5leHRTaWJsaW5nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIG0gPSBtZW1iZXJzW2F0SW5kZXhdO1xuXHRcdFx0XHRuZXh0Tm9kZSA9IChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpID8gbS5maXJzdE5vZGUoKSA6IG07XG5cdFx0XHR9XG5cblx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDAsIG5ld01lbWJlcik7XG5cdFx0XHRpbnNlcnRJbnRvRE9NKG5ld01lbWJlciwgdGhpcy5wYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlTWVtYmVyOiBmdW5jdGlvbihhdEluZGV4LCBfaXNNb3ZlKSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0XG5cdFx0Ly8gYWxzbyBhY2NlcHRzIHRoZSBtZW1iZXIgdG8gcmVtb3ZlXG5cdFx0aWYgKHR5cGVvZiBhdEluZGV4ICE9PSBcIm51bWJlclwiIHx8IGlzTmFOKGF0SW5kZXgpKSB7XG5cdFx0XHRhdEluZGV4ID0gdGhpcy5pbmRleE9mKGF0SW5kZXgpO1xuXHRcdH1cblxuXHRcdC8vIHZhbGlkYXRlIHRoZSBpbmRleFxuXHRcdGlmIChhdEluZGV4IDwgMCB8fCBhdEluZGV4ID49IG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJCYWQgaW5kZXggaW4gcmFuZ2UucmVtb3ZlTWVtYmVyOiBcIiArIGF0SW5kZXgpO1xuXHRcdH1cblxuXHRcdGlmIChfaXNNb3ZlKSB7XG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIG9sZE1lbWJlciA9IG1lbWJlcnNbYXRJbmRleF07XG5cblx0XHRcdGlmIChtZW1iZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBiZWNvbWluZyBlbXB0eTsgdXNlIHRoZSBsb2dpYyBpbiBzZXRNZW1iZXJzXG5cdFx0XHRcdHRoaXMuc2V0TWVtYmVycyhbXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9tZW1iZXJPdXQob2xkTWVtYmVyKTtcblx0XHRcdFx0bWVtYmVycy5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdFx0XHRcdGlmICh0aGlzLmF0dGFjaGVkKSByZW1vdmVGcm9tRE9NKG9sZE1lbWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0bW92ZU1lbWJlcjogZnVuY3Rpb24ob2xkSW5kZXgsIG5ld0luZGV4KSB7XG5cdFx0dmFyIG1lbWJlciA9IHRoaXMubWVtYmVyc1tvbGRJbmRleF07XG5cdFx0dGhpcy5yZW1vdmVNZW1iZXIob2xkSW5kZXgsIHRydWUgLypfaXNNb3ZlKi8pO1xuXHRcdHRoaXMuYWRkTWVtYmVyKG1lbWJlciwgbmV3SW5kZXgsIHRydWUgLypfaXNNb3ZlKi8pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGluZGV4T2Y6IGZ1bmN0aW9uKG1lbWJlcikge1xuXHRcdHJldHVybiB0aGlzLm1lbWJlcnMuaW5kZXhPZihtZW1iZXIpO1xuXHR9LFxuXG5cdGNvbnRhaW5zOiBmdW5jdGlvbihtZW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5pbmRleE9mKG1lbWJlcikgPiAtMTtcblx0fSxcblxuXHRfbWVtYmVySW46IGZ1bmN0aW9uKG0pIHtcblx0XHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRtLnBhcmVudFJhbmdlID0gdGhpcztcblx0XHR9IGVsc2UgaWYgKG0ubm9kZVR5cGUgPT09IDEpIHsgLy8gRE9NIEVsZW1lbnRcblx0XHRcdG0uJGRvbXJhbmdlID0gdGhpcztcblx0XHR9XG5cdH0sXG5cblx0X21lbWJlck91dDogZnVuY3Rpb24gKG0sIF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpIHtcblx0XHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRpZiAoX2lzUmVwbGFjZSkgbS5kZXN0cm95TWVtYmVycyhfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKTtcblx0XHRcdGVsc2UgbS5kZXN0cm95KF9za2lwTm9kZXMpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKCFfc2tpcE5vZGVzICYmIG0ubm9kZVR5cGUgPT09IDEgJiYgbS4kZG9tcmFuZ2UpIHtcblx0XHRcdG0uJGRvbXJhbmdlID0gbnVsbDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gVGVhciBkb3duLCBidXQgZG9uJ3QgcmVtb3ZlLCB0aGUgbWVtYmVycy4gIFVzZWQgd2hlbiBjaHVua3Ncblx0Ly8gb2YgRE9NIGFyZSBiZWluZyB0b3JuIGRvd24gb3IgcmVwbGFjZWQuXG5cdGRlc3Ryb3lNZW1iZXJzOiBmdW5jdGlvbihfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtZW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9tZW1iZXJPdXQobWVtYmVyc1tpXSwgX3NraXBOb2RlcywgX2lzUmVwbGFjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKF9za2lwTm9kZXMpIHtcblx0XHR0aGlzLmRldGFjaCgpO1xuXHRcdHRoaXMudHJpZ2dlcihcImRlc3Ryb3lcIiwgX3NraXBOb2Rlcyk7XG5cdFx0dGhpcy5kZXN0cm95TWVtYmVycyhfc2tpcE5vZGVzKTtcblx0XHR0aGlzLm1lbWJlcnMgPSBbXTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBtYXRjaGVzID0gW10sXG5cdFx0XHRlbDtcblxuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5tZW1iZXJzKSB7XG5cdFx0XHRlbCA9IHRoaXMubWVtYmVyc1tpXTtcblx0XHRcdGlmIChlbCBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRcdG1hdGNoZXMucHVzaC5hcHBseShtYXRjaGVzLCBlbC5maW5kQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBlbC5xdWVyeVNlbGVjdG9yQWxsID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0aWYgKGVsLm5vZGVUeXBlID09PSAxICYmIHV0aWwubWF0Y2hlc1NlbGVjdG9yKGVsLCBzZWxlY3RvcikpIG1hdGNoZXMucHVzaChlbCk7XG5cdFx0XHRcdG1hdGNoZXMucHVzaC5hcHBseShtYXRjaGVzLCBlbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hdGNoZXNcblx0fSxcblxuXHRmaW5kOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBlbCwgcmVzO1xuXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLm1lbWJlcnMpIHtcblx0XHRcdGVsID0gdGhpcy5tZW1iZXJzW2ldO1xuXHRcdFx0aWYgKGVsIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0cmVzID0gZWwuZmluZChzZWxlY3Rvcik7XG5cdFx0XHR9IGVsc2UgaWYgKGVsLm5vZGVUeXBlID09PSAxICYmIHV0aWwubWF0Y2hlc1NlbGVjdG9yKGVsLCBzZWxlY3RvcikpIHtcblx0XHRcdFx0cmVzID0gZWw7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBlbC5xdWVyeVNlbGVjdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0cmVzID0gZWwucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXMgIT0gbnVsbCkgcmV0dXJuIHJlcztcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG59KTtcblxuLy8gSW4gSUUgOCwgZG9uJ3QgdXNlIGVtcHR5IHRleHQgbm9kZXMgYXMgcGxhY2Vob2xkZXJzXG4vLyBpbiBlbXB0eSBET01SYW5nZXMsIHVzZSBjb21tZW50IG5vZGVzIGluc3RlYWQuICBVc2luZ1xuLy8gZW1wdHkgdGV4dCBub2RlcyBpbiBtb2Rlcm4gYnJvd3NlcnMgaXMgZ3JlYXQgYmVjYXVzZVxuLy8gaXQgZG9lc24ndCBjbHV0dGVyIHRoZSB3ZWIgaW5zcGVjdG9yLiAgSW4gSUUgOCwgaG93ZXZlcixcbi8vIGl0IHNlZW1zIHRvIGxlYWQgaW4gc29tZSByb3VuZGFib3V0IHdheSB0byB0aGUgT0F1dGhcbi8vIHBvcC11cCBjcmFzaGluZyB0aGUgYnJvd3NlciBjb21wbGV0ZWx5LiAgSW4gdGhlIHBhc3QsXG4vLyB3ZSBkaWRuJ3QgdXNlIGVtcHR5IHRleHQgbm9kZXMgb24gSUUgOCBiZWNhdXNlIHRoZXlcbi8vIGRvbid0IGFjY2VwdCBKUyBwcm9wZXJ0aWVzLCBzbyBqdXN0IHVzZSB0aGUgc2FtZSBsb2dpY1xuLy8gZXZlbiB0aG91Z2ggd2UgZG9uJ3QgbmVlZCB0byBzZXQgcHJvcGVydGllcyBvbiB0aGVcbi8vIHBsYWNlaG9sZGVyIGFueW1vcmUuXG52YXIgVVNFX0NPTU1FTlRfUExBQ0VIT0xERVJTID0gKGZ1bmN0aW9uICgpIHtcblx0dmFyIHJlc3VsdCA9IGZhbHNlO1xuXHR2YXIgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblx0dHJ5IHtcblx0XHR0ZXh0Tm9kZS5zb21lUHJvcCA9IHRydWU7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHQvLyBJRSA4XG5cdFx0cmVzdWx0ID0gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufSkoKTtcblxuZnVuY3Rpb24gcGxhY2Vob2xkZXJOb2RlKCkge1xuXHRyZXR1cm4gVVNFX0NPTU1FTlRfUExBQ0VIT0xERVJTID9cblx0XHRkb2N1bWVudC5jcmVhdGVDb21tZW50KFwiXCIpIDpcblx0XHRkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcbn1cblxuLy8gcHJpdmF0ZSBtZXRob2RzXG5mdW5jdGlvbiBpbnNlcnRJbnRvRE9NKHJhbmdlT3JOb2RlLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSkge1xuXHR2YXIgbSA9IHJhbmdlT3JOb2RlO1xuXHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0bS5hdHRhY2gocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUpO1xuXHR9IGVsc2Uge1xuXHRcdGlmIChfaXNNb3ZlKSB7XG5cdFx0XHRtb3ZlTm9kZVdpdGhIb29rcyhtLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluc2VydE5vZGVXaXRoSG9va3MobSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUpO1xuXHRcdH1cblx0fVxufTtcblxuZnVuY3Rpb24gcmVtb3ZlRnJvbURPTShyYW5nZU9yTm9kZSkge1xuXHR2YXIgbSA9IHJhbmdlT3JOb2RlO1xuXHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0bS5kZXRhY2goKTtcblx0fSBlbHNlIHtcblx0XHRyZW1vdmVOb2RlV2l0aEhvb2tzKG0pO1xuXHR9XG59O1xuXG5mdW5jdGlvbiByZW1vdmVOb2RlV2l0aEhvb2tzKG4pIHtcblx0aWYgKCFuLnBhcmVudE5vZGUpIHJldHVybjtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgbi5wYXJlbnROb2RlLl91aWhvb2tzICYmIG4ucGFyZW50Tm9kZS5fdWlob29rcy5yZW1vdmVFbGVtZW50KSB7XG5cdFx0bi5wYXJlbnROb2RlLl91aWhvb2tzLnJlbW92ZUVsZW1lbnQobik7XG5cdH0gZWxzZSB7XG5cdFx0bi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG4pO1xuXHR9XG59O1xuXG5mdW5jdGlvbiBpbnNlcnROb2RlV2l0aEhvb2tzKG4sIHBhcmVudCwgbmV4dCkge1xuXHQvLyBgfHwgbnVsbGAgYmVjYXVzZSBJRSB0aHJvd3MgYW4gZXJyb3IgaWYgJ25leHQnIGlzIHVuZGVmaW5lZFxuXHRuZXh0ID0gbmV4dCB8fCBudWxsO1xuXHRpZiAobi5ub2RlVHlwZSA9PT0gMSAmJiBwYXJlbnQuX3VpaG9va3MgJiYgcGFyZW50Ll91aWhvb2tzLmluc2VydEVsZW1lbnQpIHtcblx0XHRwYXJlbnQuX3VpaG9va3MuaW5zZXJ0RWxlbWVudChuLCBuZXh0KTtcblx0fSBlbHNlIHtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG4sIG5leHQpO1xuXHR9XG59O1xuXG5mdW5jdGlvbiBtb3ZlTm9kZVdpdGhIb29rcyhuLCBwYXJlbnQsIG5leHQpIHtcblx0aWYgKG4ucGFyZW50Tm9kZSAhPT0gcGFyZW50KVxuXHRcdHJldHVybjtcblx0Ly8gYHx8IG51bGxgIGJlY2F1c2UgSUUgdGhyb3dzIGFuIGVycm9yIGlmICduZXh0JyBpcyB1bmRlZmluZWRcblx0bmV4dCA9IG5leHQgfHwgbnVsbDtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgcGFyZW50Ll91aWhvb2tzICYmIHBhcmVudC5fdWlob29rcy5tb3ZlRWxlbWVudCkge1xuXHRcdHBhcmVudC5fdWlob29rcy5tb3ZlRWxlbWVudChuLCBuZXh0KTtcblx0fSBlbHNlIHtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG4sIG5leHQpO1xuXHR9XG59OyIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbi8vIEJhY2tib25lLkV2ZW50c1xuLy8gLS0tLS0tLS0tLS0tLS0tXG5cbi8vIEEgbW9kdWxlIHRoYXQgY2FuIGJlIG1peGVkIGluIHRvICphbnkgb2JqZWN0KiBpbiBvcmRlciB0byBwcm92aWRlIGl0IHdpdGhcbi8vIGN1c3RvbSBldmVudHMuIFlvdSBtYXkgYmluZCB3aXRoIGBvbmAgb3IgcmVtb3ZlIHdpdGggYG9mZmAgY2FsbGJhY2tcbi8vIGZ1bmN0aW9ucyB0byBhbiBldmVudDsgYHRyaWdnZXJgLWluZyBhbiBldmVudCBmaXJlcyBhbGwgY2FsbGJhY2tzIGluXG4vLyBzdWNjZXNzaW9uLlxuLy9cbi8vICAgICB2YXIgb2JqZWN0ID0ge307XG4vLyAgICAgXy5leHRlbmQob2JqZWN0LCBCYWNrYm9uZS5FdmVudHMpO1xuLy8gICAgIG9iamVjdC5vbignZXhwYW5kJywgZnVuY3Rpb24oKXsgYWxlcnQoJ2V4cGFuZGVkJyk7IH0pO1xuLy8gICAgIG9iamVjdC50cmlnZ2VyKCdleHBhbmQnKTtcbi8vXG52YXIgRXZlbnRzID0gbW9kdWxlLmV4cG9ydHMgPSB7XG5cblx0Ly8gQmluZCBhbiBldmVudCB0byBhIGBjYWxsYmFja2AgZnVuY3Rpb24uIFBhc3NpbmcgYFwiYWxsXCJgIHdpbGwgYmluZFxuXHQvLyB0aGUgY2FsbGJhY2sgdG8gYWxsIGV2ZW50cyBmaXJlZC5cblx0b246IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ29uJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcblx0XHR0aGlzLl9ldmVudHMgfHwgKHRoaXMuX2V2ZW50cyA9IHt9KTtcblx0XHR2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdIHx8ICh0aGlzLl9ldmVudHNbbmFtZV0gPSBbXSk7XG5cdFx0ZXZlbnRzLnB1c2goe2NhbGxiYWNrOiBjYWxsYmFjaywgY29udGV4dDogY29udGV4dCwgY3R4OiBjb250ZXh0IHx8IHRoaXN9KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBCaW5kIGFuIGV2ZW50IHRvIG9ubHkgYmUgdHJpZ2dlcmVkIGEgc2luZ2xlIHRpbWUuIEFmdGVyIHRoZSBmaXJzdCB0aW1lXG5cdC8vIHRoZSBjYWxsYmFjayBpcyBpbnZva2VkLCBpdCB3aWxsIGJlIHJlbW92ZWQuXG5cdG9uY2U6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG5cdFx0aWYgKCFldmVudHNBcGkodGhpcywgJ29uY2UnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSB8fCAhY2FsbGJhY2spIHJldHVybiB0aGlzO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHR2YXIgZm4gPSBfLm9uY2UoZnVuY3Rpb24oKSB7XG5cdFx0XHRzZWxmLm9mZihuYW1lLCBmbik7XG5cdFx0XHRjYWxsYmFjay5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdH0pO1xuXHRcdGZuLl9jYWxsYmFjayA9IGNhbGxiYWNrO1xuXHRcdHJldHVybiB0aGlzLm9uKG5hbWUsIGZuLCBjb250ZXh0KTtcblx0fSxcblxuXHQvLyBSZW1vdmUgb25lIG9yIG1hbnkgY2FsbGJhY2tzLiBJZiBgY29udGV4dGAgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcblx0Ly8gY2FsbGJhY2tzIHdpdGggdGhhdCBmdW5jdGlvbi4gSWYgYGNhbGxiYWNrYCBpcyBudWxsLCByZW1vdmVzIGFsbFxuXHQvLyBjYWxsYmFja3MgZm9yIHRoZSBldmVudC4gSWYgYG5hbWVgIGlzIG51bGwsIHJlbW92ZXMgYWxsIGJvdW5kXG5cdC8vIGNhbGxiYWNrcyBmb3IgYWxsIGV2ZW50cy5cblx0b2ZmOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuXHRcdHZhciByZXRhaW4sIGV2LCBldmVudHMsIG5hbWVzLCBpLCBsLCBqLCBrO1xuXHRcdGlmICghdGhpcy5fZXZlbnRzIHx8ICFldmVudHNBcGkodGhpcywgJ29mZicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pKSByZXR1cm4gdGhpcztcblx0XHRpZiAoIW5hbWUgJiYgIWNhbGxiYWNrICYmICFjb250ZXh0KSB7XG5cdFx0XHR0aGlzLl9ldmVudHMgPSB2b2lkIDA7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdFx0bmFtZXMgPSBuYW1lID8gW25hbWVdIDogT2JqZWN0LmtleXModGhpcy5fZXZlbnRzKTtcblx0XHRmb3IgKGkgPSAwLCBsID0gbmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRuYW1lID0gbmFtZXNbaV07XG5cdFx0XHRpZiAoZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdKSB7XG5cdFx0XHRcdHRoaXMuX2V2ZW50c1tuYW1lXSA9IHJldGFpbiA9IFtdO1xuXHRcdFx0XHRpZiAoY2FsbGJhY2sgfHwgY29udGV4dCkge1xuXHRcdFx0XHRcdGZvciAoaiA9IDAsIGsgPSBldmVudHMubGVuZ3RoOyBqIDwgazsgaisrKSB7XG5cdFx0XHRcdFx0XHRldiA9IGV2ZW50c1tqXTtcblx0XHRcdFx0XHRcdGlmICgoY2FsbGJhY2sgJiYgY2FsbGJhY2sgIT09IGV2LmNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjay5fY2FsbGJhY2spIHx8XG5cdFx0XHRcdFx0XHRcdFx0KGNvbnRleHQgJiYgY29udGV4dCAhPT0gZXYuY29udGV4dCkpIHtcblx0XHRcdFx0XHRcdFx0cmV0YWluLnB1c2goZXYpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXJldGFpbi5sZW5ndGgpIGRlbGV0ZSB0aGlzLl9ldmVudHNbbmFtZV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gVHJpZ2dlciBvbmUgb3IgbWFueSBldmVudHMsIGZpcmluZyBhbGwgYm91bmQgY2FsbGJhY2tzLiBDYWxsYmFja3MgYXJlXG5cdC8vIHBhc3NlZCB0aGUgc2FtZSBhcmd1bWVudHMgYXMgYHRyaWdnZXJgIGlzLCBhcGFydCBmcm9tIHRoZSBldmVudCBuYW1lXG5cdC8vICh1bmxlc3MgeW91J3JlIGxpc3RlbmluZyBvbiBgXCJhbGxcImAsIHdoaWNoIHdpbGwgY2F1c2UgeW91ciBjYWxsYmFjayB0b1xuXHQvLyByZWNlaXZlIHRoZSB0cnVlIG5hbWUgb2YgdGhlIGV2ZW50IGFzIHRoZSBmaXJzdCBhcmd1bWVudCkuXG5cdHRyaWdnZXI6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRpZiAoIXRoaXMuX2V2ZW50cykgcmV0dXJuIHRoaXM7XG5cdFx0dmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXHRcdGlmICghZXZlbnRzQXBpKHRoaXMsICd0cmlnZ2VyJywgbmFtZSwgYXJncykpIHJldHVybiB0aGlzO1xuXHRcdHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV07XG5cdFx0dmFyIGFsbEV2ZW50cyA9IHRoaXMuX2V2ZW50cy5hbGw7XG5cdFx0aWYgKGV2ZW50cykgdHJpZ2dlckV2ZW50cyhldmVudHMsIGFyZ3MpO1xuXHRcdGlmIChhbGxFdmVudHMpIHRyaWdnZXJFdmVudHMoYWxsRXZlbnRzLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIFRlbGwgdGhpcyBvYmplY3QgdG8gc3RvcCBsaXN0ZW5pbmcgdG8gZWl0aGVyIHNwZWNpZmljIGV2ZW50cyAuLi4gb3Jcblx0Ly8gdG8gZXZlcnkgb2JqZWN0IGl0J3MgY3VycmVudGx5IGxpc3RlbmluZyB0by5cblx0c3RvcExpc3RlbmluZzogZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuXHRcdHZhciBsaXN0ZW5pbmdUbyA9IHRoaXMuX2xpc3RlbmluZ1RvO1xuXHRcdGlmICghbGlzdGVuaW5nVG8pIHJldHVybiB0aGlzO1xuXHRcdHZhciByZW1vdmUgPSAhbmFtZSAmJiAhY2FsbGJhY2s7XG5cdFx0aWYgKCFjYWxsYmFjayAmJiB0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcblx0XHRpZiAob2JqKSAobGlzdGVuaW5nVG8gPSB7fSlbb2JqLl9saXN0ZW5JZF0gPSBvYmo7XG5cdFx0Zm9yICh2YXIgaWQgaW4gbGlzdGVuaW5nVG8pIHtcblx0XHRcdG9iaiA9IGxpc3RlbmluZ1RvW2lkXTtcblx0XHRcdG9iai5vZmYobmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuXHRcdFx0aWYgKHJlbW92ZSB8fCBfLmlzRW1wdHkob2JqLl9ldmVudHMpKSBkZWxldGUgdGhpcy5fbGlzdGVuaW5nVG9baWRdO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG59O1xuXG4vLyBSZWd1bGFyIGV4cHJlc3Npb24gdXNlZCB0byBzcGxpdCBldmVudCBzdHJpbmdzLlxudmFyIGV2ZW50U3BsaXR0ZXIgPSAvXFxzKy87XG5cbi8vIEltcGxlbWVudCBmYW5jeSBmZWF0dXJlcyBvZiB0aGUgRXZlbnRzIEFQSSBzdWNoIGFzIG11bHRpcGxlIGV2ZW50XG4vLyBuYW1lcyBgXCJjaGFuZ2UgYmx1clwiYCBhbmQgalF1ZXJ5LXN0eWxlIGV2ZW50IG1hcHMgYHtjaGFuZ2U6IGFjdGlvbn1gXG4vLyBpbiB0ZXJtcyBvZiB0aGUgZXhpc3RpbmcgQVBJLlxudmFyIGV2ZW50c0FwaSA9IGZ1bmN0aW9uKG9iaiwgYWN0aW9uLCBuYW1lLCByZXN0KSB7XG5cdGlmICghbmFtZSkgcmV0dXJuIHRydWU7XG5cblx0Ly8gSGFuZGxlIGV2ZW50IG1hcHMuXG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIHtcblx0XHRmb3IgKHZhciBrZXkgaW4gbmFtZSkge1xuXHRcdFx0b2JqW2FjdGlvbl0uYXBwbHkob2JqLCBba2V5LCBuYW1lW2tleV1dLmNvbmNhdChyZXN0KSk7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8vIEhhbmRsZSBzcGFjZSBzZXBhcmF0ZWQgZXZlbnQgbmFtZXMuXG5cdGlmIChldmVudFNwbGl0dGVyLnRlc3QobmFtZSkpIHtcblx0XHR2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KGV2ZW50U3BsaXR0ZXIpO1xuXHRcdGZvciAodmFyIGkgPSAwLCBsID0gbmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG5cdFx0XHRvYmpbYWN0aW9uXS5hcHBseShvYmosIFtuYW1lc1tpXV0uY29uY2F0KHJlc3QpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIHRydWU7XG59O1xuXG4vLyBBIGRpZmZpY3VsdC10by1iZWxpZXZlLCBidXQgb3B0aW1pemVkIGludGVybmFsIGRpc3BhdGNoIGZ1bmN0aW9uIGZvclxuLy8gdHJpZ2dlcmluZyBldmVudHMuIFRyaWVzIHRvIGtlZXAgdGhlIHVzdWFsIGNhc2VzIHNwZWVkeSAobW9zdCBpbnRlcm5hbFxuLy8gQmFja2JvbmUgZXZlbnRzIGhhdmUgMyBhcmd1bWVudHMpLlxudmFyIHRyaWdnZXJFdmVudHMgPSBmdW5jdGlvbihldmVudHMsIGFyZ3MpIHtcblx0dmFyIGV2LCBpID0gLTEsIGwgPSBldmVudHMubGVuZ3RoLCBhMSA9IGFyZ3NbMF0sIGEyID0gYXJnc1sxXSwgYTMgPSBhcmdzWzJdO1xuXHRzd2l0Y2ggKGFyZ3MubGVuZ3RoKSB7XG5cdFx0Y2FzZSAwOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCk7IHJldHVybjtcblx0XHRjYXNlIDE6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSk7IHJldHVybjtcblx0XHRjYXNlIDI6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSwgYTIpOyByZXR1cm47XG5cdFx0Y2FzZSAzOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyLCBhMyk7IHJldHVybjtcblx0XHRkZWZhdWx0OiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5hcHBseShldi5jdHgsIGFyZ3MpOyByZXR1cm47XG5cdH1cbn07XG5cbnZhciBsaXN0ZW5NZXRob2RzID0ge2xpc3RlblRvOiAnb24nLCBsaXN0ZW5Ub09uY2U6ICdvbmNlJ307XG5cbi8vIEludmVyc2lvbi1vZi1jb250cm9sIHZlcnNpb25zIG9mIGBvbmAgYW5kIGBvbmNlYC4gVGVsbCAqdGhpcyogb2JqZWN0IHRvXG4vLyBsaXN0ZW4gdG8gYW4gZXZlbnQgaW4gYW5vdGhlciBvYmplY3QgLi4uIGtlZXBpbmcgdHJhY2sgb2Ygd2hhdCBpdCdzXG4vLyBsaXN0ZW5pbmcgdG8uXG5fLmVhY2gobGlzdGVuTWV0aG9kcywgZnVuY3Rpb24oaW1wbGVtZW50YXRpb24sIG1ldGhvZCkge1xuXHRFdmVudHNbbWV0aG9kXSA9IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcblx0XHR2YXIgbGlzdGVuaW5nVG8gPSB0aGlzLl9saXN0ZW5pbmdUbyB8fCAodGhpcy5fbGlzdGVuaW5nVG8gPSB7fSk7XG5cdFx0dmFyIGlkID0gb2JqLl9saXN0ZW5JZCB8fCAob2JqLl9saXN0ZW5JZCA9IF8udW5pcXVlSWQoJ2wnKSk7XG5cdFx0bGlzdGVuaW5nVG9baWRdID0gb2JqO1xuXHRcdGlmICghY2FsbGJhY2sgJiYgdHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG5cdFx0b2JqW2ltcGxlbWVudGF0aW9uXShuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG59KTtcblxuLy8gQWxpYXNlcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG5FdmVudHMuYmluZCAgID0gRXZlbnRzLm9uO1xuRXZlbnRzLnVuYmluZCA9IEV2ZW50cy5vZmY7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpLFxuXHRwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlLFxuXHROT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKSxcblx0dHJhY2sgPSByZXF1aXJlKFwiLi90cmFja1wiKTtcblxuLy8gcHJvcGVydGllcyB0aGF0IE5vZGUuanMgYW5kIHRoZSBicm93c2VyIGNhbiBoYW5kbGVcbnZhciBUZW1wbGUgPSBtb2R1bGUuZXhwb3J0cyA9IF8uZGVmYXVsdHMoe1xuXHRWRVJTSU9OOiBcIjAuNS42XCIsXG5cdE5PREVfVFlQRTogTk9ERV9UWVBFLFxuXG5cdC8vIG90aGVyIHBhcnRzXG5cdHV0aWw6IHJlcXVpcmUoXCIuL3V0aWxcIiksXG5cdEV2ZW50czogcmVxdWlyZShcIi4vZXZlbnRzXCIpLFxuXHRNb2RlbDogcmVxdWlyZShcIi4vbW9kZWxcIiksXG5cblx0Ly8gdHJhY2tyIHNob3J0IHBvaW50ZXJzXG5cdFRyYWNrcjogVHJhY2tyLFxuXHREZXBlbmRlbmN5OiBUcmFja3IuRGVwZW5kZW5jeSxcblx0YXV0b3J1bjogVHJhY2tyLmF1dG9ydW4sXG5cblx0Ly8gYWxsIHRoZSBwYXJzZXJzLCBkZWNsYXJlZCBoZXJlIGZvciBlYXNpZXIgYWNjZXNzXG5cdHBhcnNlOiBwYXJzZSxcblx0cGFyc2VQYXRoOiBmdW5jdGlvbihzLCBvcHRzKSB7XG5cdFx0cmV0dXJuIHBhcnNlKHMsIF8uZXh0ZW5kKHt9LCBvcHRzLCB7IHN0YXJ0UnVsZTogXCJwYXRoXCIgfSkpO1xuXHR9LFxuXHRwYXJzZVBhdGhRdWVyeTogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwicGF0aFF1ZXJ5XCIgfSkpO1xuXHR9LFxuXHRwYXJzZUF0dHJpYnV0ZVZhbHVlOiBmdW5jdGlvbihzLCBvcHRzKSB7XG5cdFx0cmV0dXJuIHBhcnNlKHMsIF8uZXh0ZW5kKHt9LCBvcHRzLCB7IHN0YXJ0UnVsZTogXCJhdHRyVmFsdWVcIiB9KSk7XG5cdH0sXG5cdHBhcnNlQXJndW1lbnRzOiBmdW5jdGlvbihzLCBvcHRzKSB7XG5cdFx0cmV0dXJuIHBhcnNlKHMsIF8uZXh0ZW5kKHt9LCBvcHRzLCB7IHN0YXJ0UnVsZTogXCJhdHRyQXJndW1lbnRzXCIgfSkpO1xuXHR9LFxuXG5cdC8vIGNvbnZlcnRzIHJhdyBodG1sIHN0ciB0byB0ZW1wbGF0ZSB0cmVlXG5cdHBhcnNlSFRNTDogZnVuY3Rpb24oc3RyKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IE5PREVfVFlQRS5ST09ULFxuXHRcdFx0Y2hpbGRyZW46IFsge1xuXHRcdFx0XHR0eXBlOiBOT0RFX1RZUEUuSFRNTCxcblx0XHRcdFx0dmFsdWU6IHN0clxuXHRcdFx0fSBdLFxuXHRcdFx0dmVyc2lvbjogVGVtcGxlLlZFUlNJT05cblx0XHR9O1xuXHR9XG59LCB0cmFjayk7XG5cbi8vIG5vIG5lZWQgZm9yIG5vZGUganMgdG8gaHVydCBpdHNlbGYgb24gYW55IGhhcmQgZWRnZXNcbmlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblxuLy8gbG9hZCB0aGUgcmVhbCBjbGFzcyBmb3IgdGhlIGJyb3dzZXJcblRlbXBsZSA9IG1vZHVsZS5leHBvcnRzID0gXy5leHRlbmQocmVxdWlyZShcIi4vbXVzdGFjaGVcIiksIG1vZHVsZS5leHBvcnRzKTtcblxuLy8gbG9hZCB0aGUgcGx1Z2luIEFQSVxuXy5leHRlbmQoVGVtcGxlLCByZXF1aXJlKFwiLi9wbHVnaW5zXCIpKTtcblxuLy8gYW5kIGF0dGFjaCB0aGUgcmVzdCBvZiB0aGUgcGFydHMgdGhhdCBOb2RlIGNhbid0IHVzZVxuVGVtcGxlLkRPTVJhbmdlID0gcmVxdWlyZShcIi4vZG9tcmFuZ2VcIik7XG5UZW1wbGUuVmlldyA9IHJlcXVpcmUoXCIuL3ZpZXdcIik7XG5UZW1wbGUuU2VjdGlvbiA9IHJlcXVpcmUoXCIuL3NlY3Rpb25cIik7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpIHtcbiAgLypcbiAgICogR2VuZXJhdGVkIGJ5IFBFRy5qcyAwLjguMC5cbiAgICpcbiAgICogaHR0cDovL3BlZ2pzLm1hamRhLmN6L1xuICAgKi9cblxuICBmdW5jdGlvbiBwZWckc3ViY2xhc3MoY2hpbGQsIHBhcmVudCkge1xuICAgIGZ1bmN0aW9uIGN0b3IoKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfVxuICAgIGN0b3IucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcbiAgICBjaGlsZC5wcm90b3R5cGUgPSBuZXcgY3RvcigpO1xuICB9XG5cbiAgZnVuY3Rpb24gU3ludGF4RXJyb3IobWVzc2FnZSwgZXhwZWN0ZWQsIGZvdW5kLCBvZmZzZXQsIGxpbmUsIGNvbHVtbikge1xuICAgIHRoaXMubWVzc2FnZSAgPSBtZXNzYWdlO1xuICAgIHRoaXMuZXhwZWN0ZWQgPSBleHBlY3RlZDtcbiAgICB0aGlzLmZvdW5kICAgID0gZm91bmQ7XG4gICAgdGhpcy5vZmZzZXQgICA9IG9mZnNldDtcbiAgICB0aGlzLmxpbmUgICAgID0gbGluZTtcbiAgICB0aGlzLmNvbHVtbiAgID0gY29sdW1uO1xuXG4gICAgdGhpcy5uYW1lICAgICA9IFwiU3ludGF4RXJyb3JcIjtcbiAgfVxuXG4gIHBlZyRzdWJjbGFzcyhTeW50YXhFcnJvciwgRXJyb3IpO1xuXG4gIGZ1bmN0aW9uIHBhcnNlKGlucHV0KSB7XG4gICAgdmFyIG9wdGlvbnMgPSBhcmd1bWVudHMubGVuZ3RoID4gMSA/IGFyZ3VtZW50c1sxXSA6IHt9LFxuXG4gICAgICAgIHBlZyRGQUlMRUQgPSB7fSxcblxuICAgICAgICBwZWckc3RhcnRSdWxlSW5kaWNlcyA9IHsgc3RhcnQ6IDAsIGF0dHJWYWx1ZTogOSwgYXR0ckFyZ3VtZW50czogMTAsIHBhdGhRdWVyeTogMTksIHBhdGg6IDIxIH0sXG4gICAgICAgIHBlZyRzdGFydFJ1bGVJbmRleCAgID0gMCxcblxuICAgICAgICBwZWckY29uc3RzID0gW1xuICAgICAgICAgIGZ1bmN0aW9uKGh0bWwpIHtcbiAgICAgICAgICBcdHJldHVybiB7XG4gICAgICAgICAgXHRcdHR5cGU6IE5PREVfVFlQRS5ST09ULFxuICAgICAgICAgIFx0XHRjaGlsZHJlbjogaHRtbCxcbiAgICAgICAgICBcdFx0dmVyc2lvbjogTXVzdGFjaGUuVkVSU0lPTlxuICAgICAgICAgIFx0fVxuICAgICAgICAgIH0sXG4gICAgICAgICAgW10sXG4gICAgICAgICAgZnVuY3Rpb24obm9kZXMpIHsgcmV0dXJuIF8uY29tcGFjdChub2Rlcyk7IH0sXG4gICAgICAgICAgcGVnJEZBSUxFRCxcbiAgICAgICAgICAvXltePHtdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW148e11cIiwgZGVzY3JpcHRpb246IFwiW148e11cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHRleHQpIHsgcmV0dXJuIHsgdHlwZTogTk9ERV9UWVBFLlRFWFQsIHZhbHVlOiB0ZXh0LmpvaW4oXCJcIikgfTsgfSxcbiAgICAgICAgICBcIjwhLS1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI8IS0tXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI8IS0tXFxcIlwiIH0sXG4gICAgICAgICAgdm9pZCAwLFxuICAgICAgICAgIFwiLS0+XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLS0+XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCItLT5cXFwiXCIgfSxcbiAgICAgICAgICB7IHR5cGU6IFwiYW55XCIsIGRlc2NyaXB0aW9uOiBcImFueSBjaGFyYWN0ZXJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHsgdHlwZTogTk9ERV9UWVBFLlhDT01NRU5ULCB2YWx1ZTogdiB9O1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbihzdGFydCwgbm9kZXMsIGVuZCkge1xuICAgICAgICAgIFx0XHRpZiAoc3RhcnQubmFtZS50b0xvd2VyQ2FzZSgpICE9PSBlbmQudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgIFx0XHRcdHRocm93IG5ldyBFcnJvcihcIkVsZW1lbnQgdGFnIG1pc21hdGNoOiBcIiArIHN0YXJ0Lm5hbWUgKyBcIiAhPT0gXCIgKyBlbmQpO1xuICAgICAgICAgIFx0XHR9XG5cbiAgICAgICAgICBcdFx0c3RhcnQudHlwZSA9IE5PREVfVFlQRS5FTEVNRU5UO1xuICAgICAgICAgIFx0XHRzdGFydC5jaGlsZHJlbiA9IG5vZGVzO1xuICAgICAgICAgIFx0XHRyZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiPFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIjxcIiwgZGVzY3JpcHRpb246IFwiXFxcIjxcXFwiXCIgfSxcbiAgICAgICAgICBcIi8+XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLz5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi8+XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odGFnbmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdG5hbWU6IHRhZ25hbWUsXG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLkVMRU1FTlQsXG4gICAgICAgICAgXHRcdFx0YXR0cmlidXRlczogYXR0cmlidXRlcyxcbiAgICAgICAgICBcdFx0XHRjaGlsZHJlbjogW11cbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcIj5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI+XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI+XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odGFnbmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgIFx0XHRyZXR1cm4geyBuYW1lOiB0YWduYW1lLCBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzIH07XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiPC9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI8L1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiPC9cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0YWduYW1lKSB7IHJldHVybiB0YWduYW1lOyB9LFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgXCI9XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgICAgICBcdFx0dmFsdWUgPSB2YWx1ZSAhPSBudWxsID8gdmFsdWVbMl0gOiBcIlwiO1xuICAgICAgICAgIFx0XHR2YXIgYXJnc1xuXG4gICAgICAgICAgXHRcdC8vIGNvdWxkIGZhaWwgb24gY29tcGxleCBhdHRyaWJ1dGVzXG4gICAgICAgICAgXHRcdHRyeSB7XG4gICAgICAgICAgXHRcdFx0YXJncyA9IHBhcnNlKHZhbHVlLCAgXy5leHRlbmQoe30sIG9wdGlvbnMsIHsgc3RhcnRSdWxlOiBcImF0dHJBcmd1bWVudHNcIiB9KSk7XG4gICAgICAgICAgXHRcdH0gY2F0Y2goZSkge1xuICAgICAgICAgIFx0XHRcdGFyZ3MgPSBbeyB0eXBlOiBOT0RFX1RZUEUuTElURVJBTCwgdmFsdWU6IHZhbHVlIH1dO1xuICAgICAgICAgIFx0XHR9XG5cbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuQVRUUklCVVRFLFxuICAgICAgICAgIFx0XHRcdG5hbWU6IGtleSxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgXHRcdFx0Y2hpbGRyZW46IHBhcnNlKHZhbHVlLCBfLmV4dGVuZCh7fSwgb3B0aW9ucywgeyBzdGFydFJ1bGU6IFwiYXR0clZhbHVlXCIgfSkpLFxuICAgICAgICAgIFx0XHRcdGFyZ3VtZW50czogYXJnc1xuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiLFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIixcIiwgZGVzY3JpcHRpb246IFwiXFxcIixcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihsLCByKSB7IHJldHVybiBbXS5jb25jYXQobCwgXy5wbHVjayhyLCAxKSk7IH0sXG4gICAgICAgICAgZnVuY3Rpb24odikgeyByZXR1cm4gdi50cmltKCk7IH0sXG4gICAgICAgICAgZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgXHRcdGlmICh2YWwgIT0gbnVsbCAmJiB2YWwudHlwZSkgcmV0dXJuIHZhbDtcbiAgICAgICAgICBcdFx0cmV0dXJuIHsgdHlwZTogTk9ERV9UWVBFLkxJVEVSQUwsIHZhbHVlOiB2YWwgfTtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgZnVuY3Rpb24oc3RhcnQsIG5vZGVzLCBlbmQpIHtcbiAgICAgICAgICBcdFx0aWYgKG9wdGlvbnMuc3RyaWN0ICYmICFfLmlzRXF1YWwoc3RhcnQudmFsdWUucmF3LCBlbmQpKSB7XG4gICAgICAgICAgXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiU2VjdGlvbiB0YWcgbWlzbWF0Y2g6IFwiICsgc3RhcnQudmFsdWUucmF3ICsgXCIgIT09IFwiICsgZW5kKTtcbiAgICAgICAgICBcdFx0fVxuXG4gICAgICAgICAgXHRcdHN0YXJ0LnZhbHVlID0gc3RhcnQudmFsdWUucmVzdWx0O1xuICAgICAgICAgIFx0XHRzdGFydC5jaGlsZHJlbiA9IG5vZGVzO1xuICAgICAgICAgIFx0XHRyZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwie3tcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ7e1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3tcXFwiXCIgfSxcbiAgICAgICAgICAvXlsjXFxeXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlsjXFxcXF5dXCIsIGRlc2NyaXB0aW9uOiBcIlsjXFxcXF5dXCIgfSxcbiAgICAgICAgICBcIn19XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwifX1cIiwgZGVzY3JpcHRpb246IFwiXFxcIn19XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odHlwZSwgdmFsdWUpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEVbdHlwZSA9PT0gXCIjXCIgPyBcIlNFQ1RJT05cIiA6IFwiSU5WRVJURURcIl0sXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCJ7ey9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ7ey9cIiwgZGVzY3JpcHRpb246IFwiXFxcInt7L1xcXCJcIiB9LFxuICAgICAgICAgIC9eW159XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIltefV1cIiwgZGVzY3JpcHRpb246IFwiW159XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odmFsdWUpIHsgcmV0dXJuIHZhbHVlLmpvaW4oXCJcIik7IH0sXG4gICAgICAgICAgXCJ7e3tcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ7e3tcIiwgZGVzY3JpcHRpb246IFwiXFxcInt7e1xcXCJcIiB9LFxuICAgICAgICAgIFwifX19XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwifX19XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ9fX1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5JTlRFUlBPTEFUT1IsXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlWzFdXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgL15bXFwvI3shPlxcXl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXFxcXC8jeyE+XFxcXF5dXCIsIGRlc2NyaXB0aW9uOiBcIltcXFxcLyN7IT5cXFxcXl1cIiB9LFxuICAgICAgICAgIFwiJlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIiZcIiwgZGVzY3JpcHRpb246IFwiXFxcIiZcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihtLCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IG0gPyBOT0RFX1RZUEUuVFJJUExFIDogTk9ERV9UWVBFLklOVEVSUE9MQVRPUixcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5UUklQTEUsXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgL15bIT5dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyE+XVwiLCBkZXNjcmlwdGlvbjogXCJbIT5dXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihtLCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IG0gPT09IFwiPlwiID8gTk9ERV9UWVBFLlBBUlRJQUwgOiBOT0RFX1RZUEUuTUNPTU1FTlQsXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlLmpvaW4oXCJcIikudHJpbSgpXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCJ8XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwifFwiLCBkZXNjcmlwdGlvbjogXCJcXFwifFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKG0pIHsgcmV0dXJuIHsgcmF3OiB0ZXh0KCksIHJlc3VsdDogbSB9IH0sXG4gICAgICAgICAgZnVuY3Rpb24ocCwgYykge1xuICAgICAgICAgIFx0XHRpZiAocCA9PSBudWxsKSBwID0geyB0eXBlOiBcImFsbFwiIH07XG4gICAgICAgICAgXHRcdHAucGFydHMgPSBjO1xuICAgICAgICAgIFx0XHRyZXR1cm4gcDtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgZnVuY3Rpb24ocCkgeyBwLnBhcnRzID0gW107IHJldHVybiBwOyB9LFxuICAgICAgICAgIFwiLi4vXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLi4vXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuLi9cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihkKSB7IHJldHVybiB7IHR5cGU6IFwicGFyZW50XCIsIGRpc3RhbmNlOiBkLmxlbmd0aCB9OyB9LFxuICAgICAgICAgIFwiLi9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuL1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiLi9cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHsgdHlwZTogXCJsb2NhbFwiIH07IH0sXG4gICAgICAgICAgXCIuXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLlxcXCJcIiB9LFxuICAgICAgICAgIFwiL1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi9cIiwgZGVzY3JpcHRpb246IFwiXFxcIi9cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHsgdHlwZTogXCJyb290XCIgfTsgfSxcbiAgICAgICAgICAvXlthLXowLTkkX10vaSxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOSRfXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOSRfXWlcIiB9LFxuICAgICAgICAgIC9eW2EtejAtOTpcXC1fJF0vaSxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOTpcXFxcLV8kXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOTpcXFxcLV8kXWlcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGssIGMpIHsgcmV0dXJuIHsga2V5OiBrLCBjaGlsZHJlbjogYyB9IH0sXG4gICAgICAgICAgXCJbXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiW1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiW1xcXCJcIiB9LFxuICAgICAgICAgIFwiXVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIl1cIiwgZGVzY3JpcHRpb246IFwiXFxcIl1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihjKSB7IHJldHVybiBjOyB9LFxuICAgICAgICAgIFwidHJ1ZVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInRydWVcIiwgZGVzY3JpcHRpb246IFwiXFxcInRydWVcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHRydWU7IH0sXG4gICAgICAgICAgXCJmYWxzZVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcImZhbHNlXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJmYWxzZVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH0sXG4gICAgICAgICAgXCItXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLVxcXCJcIiB9LFxuICAgICAgICAgIC9eWzAtOV0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbMC05XVwiLCBkZXNjcmlwdGlvbjogXCJbMC05XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBwYXJzZUZsb2F0KHRleHQoKSwgMTApOyB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gcGFyc2VJbnQodGV4dCgpLCAxMCk7IH0sXG4gICAgICAgICAgXCJcXFwiXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXFxcIlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXFxcXFxcXCJcXFwiXCIgfSxcbiAgICAgICAgICAvXlteXCJdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW15cXFwiXVwiLCBkZXNjcmlwdGlvbjogXCJbXlxcXCJdXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2KSB7IHJldHVybiB2LmpvaW4oXCJcIik7IH0sXG4gICAgICAgICAgXCInXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiJ1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiJ1xcXCJcIiB9LFxuICAgICAgICAgIC9eW14nXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlteJ11cIiwgZGVzY3JpcHRpb246IFwiW14nXVwiIH0sXG4gICAgICAgICAgXCJudWxsXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwibnVsbFwiLCBkZXNjcmlwdGlvbjogXCJcXFwibnVsbFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gbnVsbDsgfSxcbiAgICAgICAgICBcInVuZGVmaW5lZFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInVuZGVmaW5lZFwiLCBkZXNjcmlwdGlvbjogXCJcXFwidW5kZWZpbmVkXFxcIlwiIH0sXG4gICAgICAgICAgXCJ2b2lkXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidm9pZFwiLCBkZXNjcmlwdGlvbjogXCJcXFwidm9pZFxcXCJcIiB9LFxuICAgICAgICAgIC9eWyw7IFxcdFxcblxccl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbLDsgXFxcXHRcXFxcblxcXFxyXVwiLCBkZXNjcmlwdGlvbjogXCJbLDsgXFxcXHRcXFxcblxcXFxyXVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiB2b2lkIDA7IH0sXG4gICAgICAgICAgL15bYS16MC05X1xcLV0vaSxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOV9cXFxcLV1pXCIsIGRlc2NyaXB0aW9uOiBcIlthLXowLTlfXFxcXC1daVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oaykgeyByZXR1cm4gazsgfSxcbiAgICAgICAgICB7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IFwid2hpdGVzcGFjZVwiIH0sXG4gICAgICAgICAgL15bIFxcdFxcblxccl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbIFxcXFx0XFxcXG5cXFxccl1cIiwgZGVzY3JpcHRpb246IFwiWyBcXFxcdFxcXFxuXFxcXHJdXCIgfSxcbiAgICAgICAgICB7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IFwiZ3VhcmFudGVlZCB3aGl0ZXNwYWNlXCIgfSxcbiAgICAgICAgICBcIlxcXFxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJcXFxcXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJcXFxcXFxcXFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGNoYXIpIHsgcmV0dXJuIGNoYXI7IH1cbiAgICAgICAgXSxcblxuICAgICAgICBwZWckYnl0ZWNvZGUgPSBbXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3ISsnIDQhNiAhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICE3LCpBIFxcXCI3Mio7IFxcXCI3MCo1IFxcXCI3MSovIFxcXCI3IyopIFxcXCI3JCojIFxcXCI3XFxcIixHJjcsKkEgXFxcIjcyKjsgXFxcIjcwKjUgXFxcIjcxKi8gXFxcIjcjKikgXFxcIjckKiMgXFxcIjdcXFwiXFxcIisnIDQhNlxcXCIhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICEwJFxcXCJcXFwiMSEzJSssJCwpJjAkXFxcIlxcXCIxITMlXFxcIlxcXCJcXFwiICMrJyA0ITYmISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS4nXFxcIlxcXCIyJzMoK1xceEFDJCEgISEhOC4qXFxcIlxcXCIyKjMrOSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyxRJiEhOC4qXFxcIlxcXCIyKjMrOSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrISAoJSs4JS4qXFxcIlxcXCIyKjMrKyglNCM2LSMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiNyUqSSBcXFwiITcmKz4kNyErNCU3JysqJTQjNi4jI1xcXCIhICUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS4vXFxcIlxcXCIyLzMwK1UkN0ArSyUgITcoLCMmNyhcXFwiKzklLjFcXFwiXFxcIjIxMzIrKSU0JDYzJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLi9cXFwiXFxcIjIvMzArVSQ3QCtLJSAhNygsIyY3KFxcXCIrOSUuNFxcXCJcXFwiMjQzNSspJTQkNjYkXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuN1xcXCJcXFwiMjczOCtCJDdAKzglLjRcXFwiXFxcIjI0MzUrKCU0IzY5IyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0AraCQhLjtcXFwiXFxcIjI7MzwrQSQ3QSs3JTc9Ky0lN0ErIyUnJCUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjKiMgXFxcIiA6KyklNFxcXCI2PVxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICE3LCo1IFxcXCI3MiovIFxcXCI3MCopIFxcXCI3MSojIFxcXCI3XFxcIiw7JjcsKjUgXFxcIjcyKi8gXFxcIjcwKikgXFxcIjcxKiMgXFxcIjdcXFwiXFxcIisnIDQhNlxcXCIhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNysrcSQgISEuPlxcXCJcXFwiMj4zPystJDcrKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLD4mIS4+XFxcIlxcXCIyPjM/Ky0kNysrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiKyklNFxcXCI2QFxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0ErXFx4RDYkNy8qXFx4QjcgXFxcIjc9KlxceEIxIFxcXCI3OipcXHhBQiBcXFwiNzsqXFx4QTUgXFxcIjc+KlxceDlGIFxcXCI3PypcXHg5OSBcXFwiISEgISEhOC4+XFxcIlxcXCIyPjM/OSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyxRJiEhOC4+XFxcIlxcXCIyPjM/OSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrISAoJSsnIDQhNkEhISAlKzIlN0ErKCU0IzZCIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNy0rPiQ3ISs0JTcuKyolNCM2QyMjXFxcIiEgJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLkRcXFwiXFxcIjJEM0UrUyQwRlxcXCJcXFwiMSEzRytDJTc0KzklLkhcXFwiXFxcIjJIM0krKSU0JDZKJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLktcXFwiXFxcIjJLM0wrYiQgITdDKikgXFxcIjBNXFxcIlxcXCIxITNOLC8mN0MqKSBcXFwiME1cXFwiXFxcIjEhM05cXFwiKzglLkhcXFwiXFxcIjJIM0krKCU0IzZPIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhIS5QXFxcIlxcXCIyUDNRKz0kNzMrMyUuUlxcXCJcXFwiMlIzUysjJScjJSQjIyAjJFxcXCIjICNcXFwiIyAjKk4gXFxcIiEuRFxcXCJcXFwiMkQzRSs9JDczKzMlLkhcXFwiXFxcIjJIM0krIyUnIyUkIyMgIyRcXFwiIyAjXFxcIiMgIysnIDQhNlQhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLkRcXFwiXFxcIjJEM0UrdyQhODBVXFxcIlxcXCIxITNWOSokJFxcXCJcXFwiIClcXFwiIyAjK1klLldcXFwiXFxcIjJXM1gqIyBcXFwiIDorQyU3Mys5JS5IXFxcIlxcXCIySDNJKyklNCU2WSVcXFwiXFxcIiElJCUjICMkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlBcXFwiXFxcIjJQM1ErQiQ3Mys4JS5SXFxcIlxcXCIyUjNTKyglNCM2WiMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5EXFxcIlxcXCIyRDNFK3MkMFtcXFwiXFxcIjEhM1xcXFwrYyUgITdDKikgXFxcIjBNXFxcIlxcXCIxITNOLC8mN0MqKSBcXFwiME1cXFwiXFxcIjEhM05cXFwiKzklLkhcXFwiXFxcIjJIM0krKSU0JDZdJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNzUrcSQgISEuXlxcXCJcXFwiMl4zXystJDc1KyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLD4mIS5eXFxcIlxcXCIyXjNfKy0kNzUrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiKyklNFxcXCI2QFxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNzMrJyA0ITZgISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITdBK00kNzYqIyBcXFwiIDorPSU3NyszJTdBKyklNCQ2YSRcXFwiXFxcIiElJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgIypHIFxcXCIhN0ErPCQ3NisyJTdBKyglNCM2YiMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISAhLmNcXFwiXFxcIjJjM2QrLCQsKSYuY1xcXCJcXFwiMmMzZFxcXCJcXFwiXFxcIiAjKycgNCE2ZSEhICUqYiBcXFwiIS5mXFxcIlxcXCIyZjNnKyYgNCE2aCEgJSpLIFxcXCIhLmlcXFwiXFxcIjJpM2orJiA0ITZoISAlKjQgXFxcIiEua1xcXCJcXFwiMmszbCsmIDQhNm0hICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3OCtxJCAhIS5pXFxcIlxcXCIyaTNqKy0kNzgrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsPiYhLmlcXFwiXFxcIjJpM2orLSQ3OCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrKSU0XFxcIjZAXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEhITBuXFxcIlxcXCIxITNvK0EkICEwcFxcXCJcXFwiMSEzcSwpJjBwXFxcIlxcXCIxITNxXFxcIisjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyshICglKzskICE3OSwjJjc5XFxcIispJTRcXFwiNnJcXFwiXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5zXFxcIlxcXCIyczN0K2IkN0ErWCU3PCopIFxcXCI3PSojIFxcXCI3NStCJTdBKzglLnVcXFwiXFxcIjJ1M3YrKCU0JTZ3JSFcXFwiJSQlIyAjJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS54XFxcIlxcXCIyeDN5KyYgNCE2eiEgJSo0IFxcXCIhLntcXFwiXFxcIjJ7M3wrJiA0ITZ9ISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLn5cXFwiXFxcIjJ+M38qIyBcXFwiIDorXFx4OTIkICEwXFx4ODBcXFwiXFxcIjEhM1xceDgxKywkLCkmMFxceDgwXFxcIlxcXCIxITNcXHg4MVxcXCJcXFwiXFxcIiAjK20lIS5pXFxcIlxcXCIyaTNqK0gkICEwXFx4ODBcXFwiXFxcIjEhM1xceDgxKywkLCkmMFxceDgwXFxcIlxcXCIxITNcXHg4MVxcXCJcXFwiXFxcIiAjKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjKiMgXFxcIiA6KyclNCM2XFx4ODIjICUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISAhMFxceDgwXFxcIlxcXCIxITNcXHg4MSssJCwpJjBcXHg4MFxcXCJcXFwiMSEzXFx4ODFcXFwiXFxcIlxcXCIgIysmIDQhNlxceDgzISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDg0XFxcIlxcXCIyXFx4ODQzXFx4ODUrYiQgITdDKikgXFxcIjBcXHg4NlxcXCJcXFwiMSEzXFx4ODcsLyY3QyopIFxcXCIwXFx4ODZcXFwiXFxcIjEhM1xceDg3XFxcIis4JS5cXHg4NFxcXCJcXFwiMlxceDg0M1xceDg1KyglNCM2XFx4ODgjISElJCMjICMkXFxcIiMgI1xcXCIjICMqcyBcXFwiIS5cXHg4OVxcXCJcXFwiMlxceDg5M1xceDhBK2IkICE3QyopIFxcXCIwXFx4OEJcXFwiXFxcIjEhM1xceDhDLC8mN0MqKSBcXFwiMFxceDhCXFxcIlxcXCIxITNcXHg4Q1xcXCIrOCUuXFx4ODlcXFwiXFxcIjJcXHg4OTNcXHg4QSsoJTQjNlxceDg4IyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDhEXFxcIlxcXCIyXFx4OEQzXFx4OEUrJiA0ITZcXHg4RiEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHg5MFxcXCJcXFwiMlxceDkwM1xceDkxKlxceEIzIFxcXCIhLlxceDkyXFxcIlxcXCIyXFx4OTIzXFx4OTMrXFx4QTIkN0IrXFx4OTglICEhITgwXFx4OTRcXFwiXFxcIjEhM1xceDk1OSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIytUJCxRJiEhODBcXHg5NFxcXCJcXFwiMSEzXFx4OTU5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIlxcXCJcXFwiICMrIyUnIyUkIyMgIyRcXFwiIyAjXFxcIiMgIysmIDQhNlxceDk2ISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0ErXSQhICEwXFx4OTdcXFwiXFxcIjEhM1xceDk4KywkLCkmMFxceDk3XFxcIlxcXCIxITNcXHg5OFxcXCJcXFwiXFxcIiAjKyEgKCUrMiU3QSsoJTQjNlxceDk5IyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCI4ISAhMFxceDlCXFxcIlxcXCIxITNcXHg5QywpJjBcXHg5QlxcXCJcXFwiMSEzXFx4OUNcXFwiKyEgKCU5KlxcXCIgM1xceDlBXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCI4ISAhMFxceDlCXFxcIlxcXCIxITNcXHg5QyssJCwpJjBcXHg5QlxcXCJcXFwiMSEzXFx4OUNcXFwiXFxcIlxcXCIgIyshICglOSpcXFwiIDNcXHg5RFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHg5RVxcXCJcXFwiMlxceDlFM1xceDlGKzckLVxcXCJcXFwiMSEzLCsoJTRcXFwiNlxceEEwXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKVxuICAgICAgICBdLFxuXG4gICAgICAgIHBlZyRjdXJyUG9zICAgICAgICAgID0gMCxcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zICAgICAgPSAwLFxuICAgICAgICBwZWckY2FjaGVkUG9zICAgICAgICA9IDAsXG4gICAgICAgIHBlZyRjYWNoZWRQb3NEZXRhaWxzID0geyBsaW5lOiAxLCBjb2x1bW46IDEsIHNlZW5DUjogZmFsc2UgfSxcbiAgICAgICAgcGVnJG1heEZhaWxQb3MgICAgICAgPSAwLFxuICAgICAgICBwZWckbWF4RmFpbEV4cGVjdGVkICA9IFtdLFxuICAgICAgICBwZWckc2lsZW50RmFpbHMgICAgICA9IDAsXG5cbiAgICAgICAgcGVnJHJlc3VsdDtcblxuICAgIGlmIChcInN0YXJ0UnVsZVwiIGluIG9wdGlvbnMpIHtcbiAgICAgIGlmICghKG9wdGlvbnMuc3RhcnRSdWxlIGluIHBlZyRzdGFydFJ1bGVJbmRpY2VzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBzdGFydCBwYXJzaW5nIGZyb20gcnVsZSBcXFwiXCIgKyBvcHRpb25zLnN0YXJ0UnVsZSArIFwiXFxcIi5cIik7XG4gICAgICB9XG5cbiAgICAgIHBlZyRzdGFydFJ1bGVJbmRleCA9IHBlZyRzdGFydFJ1bGVJbmRpY2VzW29wdGlvbnMuc3RhcnRSdWxlXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0ZXh0KCkge1xuICAgICAgcmV0dXJuIGlucHV0LnN1YnN0cmluZyhwZWckcmVwb3J0ZWRQb3MsIHBlZyRjdXJyUG9zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvZmZzZXQoKSB7XG4gICAgICByZXR1cm4gcGVnJHJlcG9ydGVkUG9zO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpbmUoKSB7XG4gICAgICByZXR1cm4gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBlZyRyZXBvcnRlZFBvcykubGluZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb2x1bW4oKSB7XG4gICAgICByZXR1cm4gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBlZyRyZXBvcnRlZFBvcykuY29sdW1uO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4cGVjdGVkKGRlc2NyaXB0aW9uKSB7XG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24oXG4gICAgICAgIG51bGwsXG4gICAgICAgIFt7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uIH1dLFxuICAgICAgICBwZWckcmVwb3J0ZWRQb3NcbiAgICAgICk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IobWVzc2FnZSkge1xuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKG1lc3NhZ2UsIG51bGwsIHBlZyRyZXBvcnRlZFBvcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBvcykge1xuICAgICAgZnVuY3Rpb24gYWR2YW5jZShkZXRhaWxzLCBzdGFydFBvcywgZW5kUG9zKSB7XG4gICAgICAgIHZhciBwLCBjaDtcblxuICAgICAgICBmb3IgKHAgPSBzdGFydFBvczsgcCA8IGVuZFBvczsgcCsrKSB7XG4gICAgICAgICAgY2ggPSBpbnB1dC5jaGFyQXQocCk7XG4gICAgICAgICAgaWYgKGNoID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICBpZiAoIWRldGFpbHMuc2VlbkNSKSB7IGRldGFpbHMubGluZSsrOyB9XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbiA9IDE7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IGZhbHNlO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY2ggPT09IFwiXFxyXCIgfHwgY2ggPT09IFwiXFx1MjAyOFwiIHx8IGNoID09PSBcIlxcdTIwMjlcIikge1xuICAgICAgICAgICAgZGV0YWlscy5saW5lKys7XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbiA9IDE7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uKys7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocGVnJGNhY2hlZFBvcyAhPT0gcG9zKSB7XG4gICAgICAgIGlmIChwZWckY2FjaGVkUG9zID4gcG9zKSB7XG4gICAgICAgICAgcGVnJGNhY2hlZFBvcyA9IDA7XG4gICAgICAgICAgcGVnJGNhY2hlZFBvc0RldGFpbHMgPSB7IGxpbmU6IDEsIGNvbHVtbjogMSwgc2VlbkNSOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2UocGVnJGNhY2hlZFBvc0RldGFpbHMsIHBlZyRjYWNoZWRQb3MsIHBvcyk7XG4gICAgICAgIHBlZyRjYWNoZWRQb3MgPSBwb3M7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwZWckY2FjaGVkUG9zRGV0YWlscztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckZmFpbChleHBlY3RlZCkge1xuICAgICAgaWYgKHBlZyRjdXJyUG9zIDwgcGVnJG1heEZhaWxQb3MpIHsgcmV0dXJuOyB9XG5cbiAgICAgIGlmIChwZWckY3VyclBvcyA+IHBlZyRtYXhGYWlsUG9zKSB7XG4gICAgICAgIHBlZyRtYXhGYWlsUG9zID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQgPSBbXTtcbiAgICAgIH1cblxuICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZC5wdXNoKGV4cGVjdGVkKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckYnVpbGRFeGNlcHRpb24obWVzc2FnZSwgZXhwZWN0ZWQsIHBvcykge1xuICAgICAgZnVuY3Rpb24gY2xlYW51cEV4cGVjdGVkKGV4cGVjdGVkKSB7XG4gICAgICAgIHZhciBpID0gMTtcblxuICAgICAgICBleHBlY3RlZC5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICBpZiAoYS5kZXNjcmlwdGlvbiA8IGIuZGVzY3JpcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGEuZGVzY3JpcHRpb24gPiBiLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB3aGlsZSAoaSA8IGV4cGVjdGVkLmxlbmd0aCkge1xuICAgICAgICAgIGlmIChleHBlY3RlZFtpIC0gMV0gPT09IGV4cGVjdGVkW2ldKSB7XG4gICAgICAgICAgICBleHBlY3RlZC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRNZXNzYWdlKGV4cGVjdGVkLCBmb3VuZCkge1xuICAgICAgICBmdW5jdGlvbiBzdHJpbmdFc2NhcGUocykge1xuICAgICAgICAgIGZ1bmN0aW9uIGhleChjaCkgeyByZXR1cm4gY2guY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTsgfVxuXG4gICAgICAgICAgcmV0dXJuIHNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcL2csICAgJ1xcXFxcXFxcJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cIi9nLCAgICAnXFxcXFwiJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHgwOC9nLCAnXFxcXGInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcdC9nLCAgICdcXFxcdCcpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csICAgJ1xcXFxuJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGYvZywgICAnXFxcXGYnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAgICdcXFxccicpXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xceDAwLVxceDA3XFx4MEJcXHgwRVxceDBGXS9nLCBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx4MCcgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHgxMC1cXHgxRlxceDgwLVxceEZGXS9nLCAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx4JyAgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHUwMTgwLVxcdTBGRkZdL2csICAgICAgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxcdTAnICsgaGV4KGNoKTsgfSlcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx1MTA4MC1cXHVGRkZGXS9nLCAgICAgICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHUnICArIGhleChjaCk7IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGV4cGVjdGVkRGVzY3MgPSBuZXcgQXJyYXkoZXhwZWN0ZWQubGVuZ3RoKSxcbiAgICAgICAgICAgIGV4cGVjdGVkRGVzYywgZm91bmREZXNjLCBpO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBleHBlY3RlZC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGV4cGVjdGVkRGVzY3NbaV0gPSBleHBlY3RlZFtpXS5kZXNjcmlwdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGV4cGVjdGVkRGVzYyA9IGV4cGVjdGVkLmxlbmd0aCA+IDFcbiAgICAgICAgICA/IGV4cGVjdGVkRGVzY3Muc2xpY2UoMCwgLTEpLmpvaW4oXCIsIFwiKVxuICAgICAgICAgICAgICArIFwiIG9yIFwiXG4gICAgICAgICAgICAgICsgZXhwZWN0ZWREZXNjc1tleHBlY3RlZC5sZW5ndGggLSAxXVxuICAgICAgICAgIDogZXhwZWN0ZWREZXNjc1swXTtcblxuICAgICAgICBmb3VuZERlc2MgPSBmb3VuZCA/IFwiXFxcIlwiICsgc3RyaW5nRXNjYXBlKGZvdW5kKSArIFwiXFxcIlwiIDogXCJlbmQgb2YgaW5wdXRcIjtcblxuICAgICAgICByZXR1cm4gXCJFeHBlY3RlZCBcIiArIGV4cGVjdGVkRGVzYyArIFwiIGJ1dCBcIiArIGZvdW5kRGVzYyArIFwiIGZvdW5kLlwiO1xuICAgICAgfVxuXG4gICAgICB2YXIgcG9zRGV0YWlscyA9IHBlZyRjb21wdXRlUG9zRGV0YWlscyhwb3MpLFxuICAgICAgICAgIGZvdW5kICAgICAgPSBwb3MgPCBpbnB1dC5sZW5ndGggPyBpbnB1dC5jaGFyQXQocG9zKSA6IG51bGw7XG5cbiAgICAgIGlmIChleHBlY3RlZCAhPT0gbnVsbCkge1xuICAgICAgICBjbGVhbnVwRXhwZWN0ZWQoZXhwZWN0ZWQpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmV3IFN5bnRheEVycm9yKFxuICAgICAgICBtZXNzYWdlICE9PSBudWxsID8gbWVzc2FnZSA6IGJ1aWxkTWVzc2FnZShleHBlY3RlZCwgZm91bmQpLFxuICAgICAgICBleHBlY3RlZCxcbiAgICAgICAgZm91bmQsXG4gICAgICAgIHBvcyxcbiAgICAgICAgcG9zRGV0YWlscy5saW5lLFxuICAgICAgICBwb3NEZXRhaWxzLmNvbHVtblxuICAgICAgKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckZGVjb2RlKHMpIHtcbiAgICAgIHZhciBiYyA9IG5ldyBBcnJheShzLmxlbmd0aCksIGk7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGJjW2ldID0gcy5jaGFyQ29kZUF0KGkpIC0gMzI7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBiYztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2VSdWxlKGluZGV4KSB7XG4gICAgICB2YXIgYmMgICAgPSBwZWckYnl0ZWNvZGVbaW5kZXhdLFxuICAgICAgICAgIGlwICAgID0gMCxcbiAgICAgICAgICBpcHMgICA9IFtdLFxuICAgICAgICAgIGVuZCAgID0gYmMubGVuZ3RoLFxuICAgICAgICAgIGVuZHMgID0gW10sXG4gICAgICAgICAgc3RhY2sgPSBbXSxcbiAgICAgICAgICBwYXJhbXMsIGk7XG5cbiAgICAgIGZ1bmN0aW9uIHByb3RlY3Qob2JqZWN0KSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmFwcGx5KG9iamVjdCkgPT09IFwiW29iamVjdCBBcnJheV1cIiA/IFtdIDogb2JqZWN0O1xuICAgICAgfVxuXG4gICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICB3aGlsZSAoaXAgPCBlbmQpIHtcbiAgICAgICAgICBzd2l0Y2ggKGJjW2lwXSkge1xuICAgICAgICAgICAgY2FzZSAwOlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHByb3RlY3QocGVnJGNvbnN0c1tiY1tpcCArIDFdXSkpO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gc3RhY2sucG9wKCk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDQ6XG4gICAgICAgICAgICAgIHN0YWNrLmxlbmd0aCAtPSBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA1OlxuICAgICAgICAgICAgICBzdGFjay5zcGxpY2UoLTIsIDEpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA2OlxuICAgICAgICAgICAgICBzdGFja1tzdGFjay5sZW5ndGggLSAyXS5wdXNoKHN0YWNrLnBvcCgpKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNzpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChzdGFjay5zcGxpY2Uoc3RhY2subGVuZ3RoIC0gYmNbaXAgKyAxXSwgYmNbaXAgKyAxXSkpO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA4OlxuICAgICAgICAgICAgICBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChpbnB1dC5zdWJzdHJpbmcoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0sIHBlZyRjdXJyUG9zKSk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDk6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTA6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTE6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTI6XG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICAgIGlwcy5wdXNoKGlwKTtcblxuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMiArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpcCArPSAyICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDEzOlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5sZW5ndGggPiBwZWckY3VyclBvcykge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE0OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM10pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0ubGVuZ3RoKSA9PT0gcGVnJGNvbnN0c1tiY1tpcCArIDFdXSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gNDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE1OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM10pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0ubGVuZ3RoKS50b0xvd2VyQ2FzZSgpID09PSBwZWckY29uc3RzW2JjW2lwICsgMV1dKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTY6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHBlZyRjb25zdHNbYmNbaXAgKyAxXV0udGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gNDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE3OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgYmNbaXAgKyAxXSkpO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyArPSBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxODpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckY29uc3RzW2JjW2lwICsgMV1dKTtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgKz0gcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGg7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE5OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRGQUlMRUQpO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcGVnJGZhaWwocGVnJGNvbnN0c1tiY1tpcCArIDFdXSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjA6XG4gICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDEgLSBiY1tpcCArIDFdXTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjE6XG4gICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHBlZyRjdXJyUG9zO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMjpcbiAgICAgICAgICAgICAgcGFyYW1zID0gYmMuc2xpY2UoaXAgKyA0LCBpcCArIDQgKyBiY1tpcCArIDNdKTtcbiAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGJjW2lwICsgM107IGkrKykge1xuICAgICAgICAgICAgICAgIHBhcmFtc1tpXSA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDEgLSBwYXJhbXNbaV1dO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgc3RhY2suc3BsaWNlKFxuICAgICAgICAgICAgICAgIHN0YWNrLmxlbmd0aCAtIGJjW2lwICsgMl0sXG4gICAgICAgICAgICAgICAgYmNbaXAgKyAyXSxcbiAgICAgICAgICAgICAgICBwZWckY29uc3RzW2JjW2lwICsgMV1dLmFwcGx5KG51bGwsIHBhcmFtcylcbiAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjM6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJHBhcnNlUnVsZShiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDI0OlxuICAgICAgICAgICAgICBwZWckc2lsZW50RmFpbHMrKztcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjU6XG4gICAgICAgICAgICAgIHBlZyRzaWxlbnRGYWlscy0tO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBvcGNvZGU6IFwiICsgYmNbaXBdICsgXCIuXCIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbmRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBlbmQgPSBlbmRzLnBvcCgpO1xuICAgICAgICAgIGlwID0gaXBzLnBvcCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzdGFja1swXTtcbiAgICB9XG5cblxuICAgIFx0dmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcbiAgICBcdFx0Tk9ERV9UWVBFID0gcmVxdWlyZShcIi4vdHlwZXNcIiksXG4gICAgXHRcdE11c3RhY2hlID0gcmVxdWlyZShcIi4vXCIpO1xuXG4gICAgXHRvcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zIHx8IHt9LCB7XG4gICAgXHRcdHN0cmljdDogdHJ1ZVxuICAgIFx0fSk7XG5cblxuICAgIHBlZyRyZXN1bHQgPSBwZWckcGFyc2VSdWxlKHBlZyRzdGFydFJ1bGVJbmRleCk7XG5cbiAgICBpZiAocGVnJHJlc3VsdCAhPT0gcGVnJEZBSUxFRCAmJiBwZWckY3VyclBvcyA9PT0gaW5wdXQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gcGVnJHJlc3VsdDtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHBlZyRyZXN1bHQgIT09IHBlZyRGQUlMRUQgJiYgcGVnJGN1cnJQb3MgPCBpbnB1dC5sZW5ndGgpIHtcbiAgICAgICAgcGVnJGZhaWwoeyB0eXBlOiBcImVuZFwiLCBkZXNjcmlwdGlvbjogXCJlbmQgb2YgaW5wdXRcIiB9KTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKG51bGwsIHBlZyRtYXhGYWlsRXhwZWN0ZWQsIHBlZyRtYXhGYWlsUG9zKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIFN5bnRheEVycm9yOiBTeW50YXhFcnJvcixcbiAgICBwYXJzZTogICAgICAgcGFyc2VcbiAgfTtcbn0pKCk7IiwidmFyIFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIiksXG5cdF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIiksXG5cdHBhcnNlID0gcmVxdWlyZShcIi4vbSt4bWxcIikucGFyc2UsXG5cdCR0cmFjayA9IHJlcXVpcmUoXCIuL3RyYWNrXCIpLnRyYWNrO1xuXG52YXIgTW9kZWwgPVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBNb2RlbChkYXRhLCBwYXJlbnQsIG9wdGlvbnMpIHtcblx0dGhpcy5wcm94aWVzID0gW107XG5cdHRoaXMuX2RlcCA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXHRpZiAoTW9kZWwuaXNNb2RlbChwYXJlbnQpKSB0aGlzLnBhcmVudCA9IHBhcmVudDtcblx0dGhpcy5zZXQoZGF0YSwgb3B0aW9ucyAmJiBvcHRpb25zLnRyYWNrKTtcbn1cblxuTW9kZWwuaXNNb2RlbCA9IGZ1bmN0aW9uKG8pIHtcblx0cmV0dXJuIG8gaW5zdGFuY2VvZiBNb2RlbDtcbn1cblxuTW9kZWwuZXh0ZW5kID0gdXRpbC5zdWJjbGFzcztcblxuTW9kZWwuX2RlZmF1bHRQcm94aWVzID0gWyB7XG5cdGlzTGlzdDogIHRydWUsXG5cdG1hdGNoOiAgIGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gXy5pc0FycmF5KGFycik7IH0sXG5cdGdldDogICAgIGZ1bmN0aW9uKGFyciwgaykgeyByZXR1cm4gayA9PT0gXCJsZW5ndGhcIiA/IHRoaXMubGVuZ3RoKGFycikgOiBhcnJba107IH0sXG5cdGxlbmd0aDogIGZ1bmN0aW9uKGFycikgICAgeyB2YXIgbGVuOyByZXR1cm4gdHlwZW9mKGxlbiA9IGFyci4kbGVuZ3RoKSA9PT0gXCJudW1iZXJcIiA/IGxlbiA6IGFyci5sZW5ndGg7IH0sXG5cdGtleXM6ICAgIGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gXy5yYW5nZSh0aGlzLmxlbmd0aChhcnIpKTsgfSxcblx0aXNFbXB0eTogZnVuY3Rpb24oYXJyKSAgICB7IHJldHVybiAhIXRoaXMubGVuZ3RoKGFycik7IH1cbn0sIHtcblx0bWF0Y2g6IGZ1bmN0aW9uKCkgICAgIHsgcmV0dXJuIHRydWU7IH0sXG5cdGdldDogICBmdW5jdGlvbih0LCBrKSB7IGlmICh0ICE9IG51bGwpIHJldHVybiB0W2tdOyB9XG59IF07XG5cbk1vZGVsLmNhbGxQcm94eU1ldGhvZCA9IGZ1bmN0aW9uKHByb3h5LCB0YXJnZXQsIG1ldGhvZCwgYXJncywgY3R4KSB7XG5cdHZhciBhcmdzID0gXy5pc0FycmF5KGFyZ3MpID8gXy5jbG9uZShhcmdzKSA6IFtdO1xuXHRhcmdzLnVuc2hpZnQocHJveHksIG1ldGhvZCwgdGFyZ2V0KTtcblx0YXJncy5wdXNoKGN0eCk7XG5cdHJldHVybiB1dGlsLnJlc3VsdC5hcHBseShudWxsLCBhcmdzKTtcbn1cblxuXy5leHRlbmQoTW9kZWwucHJvdG90eXBlLCB7XG5cblx0Ly8gc2V0cyB0aGUgZGF0YSBvbiB0aGUgbW9kZWxcblx0c2V0OiBmdW5jdGlvbihkYXRhLCB0cmFjaykge1xuXHRcdGlmICh0cmFjayAhPT0gZmFsc2UpIGRhdGEgPSAkdHJhY2soZGF0YSwgdHJhY2spO1xuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5fZGVwLmNoYW5nZWQoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBhbiBhcnJheSBvZiBtb2RlbHMgaW4gdGhlIGN1cnJlbnQgc3RhY2ssIHdpdGggdGhlIHJvb3QgYXMgdGhlIGZpcnN0XG5cdGdldEFsbE1vZGVsczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIG1vZGVscyA9IFsgdGhpcyBdLFxuXHRcdFx0bW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKG1vZGVsLnBhcmVudCkge1xuXHRcdFx0bW9kZWxzLnVuc2hpZnQobW9kZWwgPSBtb2RlbC5wYXJlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbHNcblx0fSxcblxuXHQvLyBnZXRzIHRoZSBtb2RlbCBpbiB0aGUgc3RhY2sgYXQgdGhlIGluZGV4XG5cdC8vIG5lZ2F0aXZlIHZhbHVlcyBzdGFydCBhdCByb290XG5cdGdldE1vZGVsQXRPZmZzZXQ6IGZ1bmN0aW9uKGluZGV4KSB7XG5cdFx0aWYgKCFfLmlzTnVtYmVyKGluZGV4KSB8fCBpc05hTihpbmRleCkpIGluZGV4ID0gMDtcblx0XHRpZiAoaW5kZXggPCAwKSByZXR1cm4gdGhpcy5nZXRBbGxNb2RlbHMoKVt+aW5kZXhdO1xuXG5cdFx0dmFyIG1vZGVsID0gdGhpcztcblxuXHRcdHdoaWxlIChpbmRleCAmJiBtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0XHRpbmRleC0tO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbDtcblx0fSxcblxuXHQvLyBnZXRzIHRoZSBsYXN0IG1vZGVsIGluIHRoZSBzdGFja1xuXHRnZXRSb290TW9kZWw6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBtb2RlbCA9IHRoaXM7XG5cdFx0d2hpbGUgKG1vZGVsLnBhcmVudCAhPSBudWxsKSBtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHRyZXR1cm4gbW9kZWw7XG5cdH0sXG5cblx0Ly8gcmV0dXJucyB0aGUgZmlyc3QgbW9kZWwgd2hpY2ggcGFzc2VzIHRoZSBmdW5jdGlvblxuXHRmaW5kTW9kZWw6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0dmFyIGluZGV4ID0gMCxcblx0XHRcdG1vZGVsID0gdGhpcztcblxuXHRcdHdoaWxlIChtb2RlbCAhPSBudWxsKSB7XG5cdFx0XHRpZiAoZm4uY2FsbCh0aGlzLCBtb2RlbCwgaW5kZXgrKykpIHJldHVybiBtb2RlbDtcblx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdH1cblx0fSxcblxuXHQvLyByZXR1cm5zIHRoZSB2YWx1ZSBhdCBwYXRoLCBidXQgb25seSBsb29rcyBpbiB0aGUgZGF0YSBvbiB0aGlzIG1vZGVsXG5cdGdldExvY2FsOiBmdW5jdGlvbihwYXRoLCBjdHgpIHtcblx0XHRpZiAodHlwZW9mIHBhdGggPT09IFwic3RyaW5nXCIpIHBhdGggPSBwYXJzZShwYXRoLCB7IHN0YXJ0UnVsZTogXCJwYXRoXCIgfSk7XG5cdFx0aWYgKHBhdGggPT0gbnVsbCkgcGF0aCA9IHsgcGFydHM6IFtdIH07XG5cdFx0aWYgKCFfLmlzT2JqZWN0KHBhdGgpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG9yIG9iamVjdCBmb3IgcGF0aC5cIik7XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHRoaXMuX2RlcC5kZXBlbmQoKTtcblxuXHRcdHJldHVybiBfLnJlZHVjZShwYXRoLnBhcnRzLCBmdW5jdGlvbih0YXJnZXQsIHBhcnQpIHtcblx0XHRcdHRhcmdldCA9IHNlbGYuX2dldCh0YXJnZXQsIHBhcnQua2V5KTtcblxuXHRcdFx0Xy5lYWNoKHBhcnQuY2hpbGRyZW4sIGZ1bmN0aW9uKGspIHtcblx0XHRcdFx0aWYgKF8uaXNPYmplY3QoaykpIGsgPSBjdHguZ2V0KGspO1xuXHRcdFx0XHR0YXJnZXQgPSBzZWxmLl9nZXQodGFyZ2V0LCBrKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH0sIHRoaXMuZGF0YSk7XG5cdH0sXG5cblx0Ly8gcmV0cmlldmVzIHZhbHVlIHdpdGggcGF0aCBxdWVyeVxuXHRnZXQ6IGZ1bmN0aW9uKHBhdGhzKSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKHR5cGVvZiBwYXRocyA9PT0gXCJzdHJpbmdcIikgcGF0aHMgPSBwYXJzZShwYXRocywgeyBzdGFydFJ1bGU6IFwicGF0aFF1ZXJ5XCIgfSk7XG5cdFx0aWYgKCFfLmlzQXJyYXkocGF0aHMpKSBwYXRocyA9IHBhdGhzICE9IG51bGwgPyBbIHBhdGhzIF0gOiBbXTtcblx0XHRpZiAoIXBhdGhzLmxlbmd0aCkgcGF0aHMucHVzaCh7IHR5cGU6IFwiYWxsXCIsIHBhcnRzOiBbXSB9KTtcblxuXHRcdHJldHVybiBfLnJlZHVjZShwYXRocywgZnVuY3Rpb24ocmVzdWx0LCBwYXRoLCBpbmRleCkge1xuXHRcdFx0dmFyIG1vZGVsID0gc2VsZixcblx0XHRcdFx0c2NvcGUgPSB0cnVlLFxuXHRcdFx0XHR2YWw7XG5cblx0XHRcdGlmIChwYXRoLnR5cGUgPT09IFwicm9vdFwiKSB7XG5cdFx0XHRcdG1vZGVsID0gc2VsZi5nZXRSb290TW9kZWwoKTtcblx0XHRcdH0gZWxzZSBpZiAocGF0aC50eXBlID09PSBcInBhcmVudFwiKSB7XG5cdFx0XHRcdG1vZGVsID0gc2VsZi5nZXRNb2RlbEF0T2Zmc2V0KHBhdGguZGlzdGFuY2UpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLnR5cGUgPT09IFwiYWxsXCIpIHtcblx0XHRcdFx0c2NvcGUgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVsID09IG51bGwpIHJldHVybjtcblxuXHRcdFx0d2hpbGUgKF8uaXNVbmRlZmluZWQodmFsKSAmJiBtb2RlbCAhPSBudWxsKSB7XG5cdFx0XHRcdHZhbCA9IG1vZGVsLmdldExvY2FsKHBhdGgsIHNlbGYpO1xuXHRcdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHRcdFx0aWYgKHNjb3BlKSBicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKF8uaXNGdW5jdGlvbih2YWwpKSB7XG5cdFx0XHRcdHZhbCA9IHZhbC5jYWxsKHNlbGYsIGluZGV4ID09PSAwID8gbnVsbCA6IHJlc3VsdCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB2YWw7XG5cdFx0fSwgdm9pZCAwKTtcblx0fSxcblxuXHRfZ2V0OiBmdW5jdGlvbih0YXJnZXQsIGtleSkge1xuXHRcdHJldHVybiB0aGlzLmNhbGxQcm94eU1ldGhvZCh0aGlzLmdldFByb3h5QnlWYWx1ZSh0YXJnZXQpLCB0YXJnZXQsIFwiZ2V0XCIsIGtleSk7XG5cdH0sXG5cblx0cHJveHk6IGZ1bmN0aW9uKGtleSkge1xuXHRcdHZhciBwcm94eSA9IHRoaXMuZ2V0UHJveHlCeVZhbHVlKHRoaXMuZGF0YSk7XG5cdFx0aWYgKGtleSA9PSBudWxsKSByZXR1cm4gcHJveHk7XG5cdFx0dmFyIGFyZ3MgPSBfLnRvQXJyYXkoYXJndW1lbnRzKTtcblx0XHRhcmdzLnVuc2hpZnQocHJveHksIHRoaXMuZGF0YSk7XG5cdFx0cmV0dXJuIHRoaXMuY2FsbFByb3h5TWV0aG9kLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9LFxuXG5cdGNhbGxQcm94eU1ldGhvZDogZnVuY3Rpb24ocHJveHksIHRhcmdldCwgbWV0aG9kKSB7XG5cdFx0cmV0dXJuIE1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdGFyZ2V0LCBtZXRob2QsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMyksIHRoaXMpO1xuXHR9LFxuXG5cdGdldEFsbFByb3hpZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBwcm94aWVzID0gW10sXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwgIT0gbnVsbCkge1xuXHRcdFx0cHJveGllcy5wdXNoLmFwcGx5KHByb3hpZXMsIG1vZGVsLnByb3hpZXMpO1xuXHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cHJveGllcy5wdXNoLmFwcGx5KHByb3hpZXMsIE1vZGVsLl9kZWZhdWx0UHJveGllcyk7XG5cblx0XHRyZXR1cm4gcHJveGllcztcblx0fSxcblxuXHRoYXNQcm94eTogZnVuY3Rpb24ocHJveHksIHByb3hpZXMpIHtcblx0XHRpZiAocHJveGllcyA9PSBudWxsKSBwcm94aWVzID0gdGhpcy5nZXRBbGxQcm94aWVzKCk7XG5cdFx0cmV0dXJuIF8uY29udGFpbnMocHJveGllcywgcHJveHkpO1xuXHR9LFxuXG5cdHJlZ2lzdGVyUHJveHk6IGZ1bmN0aW9uKHByb3h5KSB7XG5cdFx0aWYgKHR5cGVvZiBwcm94eSAhPT0gXCJvYmplY3RcIiB8fCBwcm94eSA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgb2JqZWN0IGZvciBwcm94eS5cIik7XG5cdFx0aWYgKHR5cGVvZiBwcm94eS5tYXRjaCAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJMYXllciBtaXNzaW5nIHJlcXVpcmVkIG1hdGNoIG1ldGhvZC5cIik7XG5cdFx0aWYgKHR5cGVvZiBwcm94eS5nZXQgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiTGF5ZXIgbWlzc2luZyByZXF1aXJlZCBnZXQgbWV0aG9kLlwiKTtcblx0XHRpZiAoIXRoaXMuaGFzUHJveHkocHJveHkpKSB0aGlzLnByb3hpZXMudW5zaGlmdChwcm94eSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Z2V0UHJveHlCeVZhbHVlOiBmdW5jdGlvbih0YXJnZXQsIHByb3hpZXMpIHtcblx0XHRpZiAocHJveGllcyA9PSBudWxsKSBwcm94aWVzID0gdGhpcy5nZXRBbGxQcm94aWVzKCk7XG5cdFx0cmV0dXJuIF8uZmluZChwcm94aWVzLCBmdW5jdGlvbihwcm94eSkge1xuXHRcdFx0cmV0dXJuIHByb3h5Lm1hdGNoKHRhcmdldCk7XG5cdFx0fSk7XG5cdH0sXG5cblx0Ly8gZGVmaW5lcyBhIHJlYWN0aXZlIHByb3BlcnR5IG9uIGFuIG9iamVjdCB0aGF0IHBvaW50cyB0byB0aGUgZGF0YVxuXHRkZWZpbmVEYXRhTGluazogZnVuY3Rpb24ob2JqLCBwcm9wLCBvcHRpb25zKSB7XG5cdFx0dmFyIG1vZGVsID0gdGhpcztcblxuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRcdGNvbmZpZ3VyYWJsZTogb3B0aW9ucyAhPSBudWxsICYmIG9wdGlvbnMuY29uZmlndXJhYmxlLFxuXHRcdFx0ZW51bWVyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuZW51bWVyYWJsZSAhPT0gZmFsc2UsXG5cdFx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRtb2RlbC5fZGVwLmRlcGVuZCgpO1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwuZGF0YTtcblx0XHRcdH0sXG5cdFx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0XHRtb2RlbC5zZXQodmFsKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBvYmo7XG5cdH1cblxufSk7XG4iLCJ2YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKSxcblx0XyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHROT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKSxcblx0cGFyc2UgPSByZXF1aXJlKFwiLi9tK3htbFwiKS5wYXJzZSxcblx0dXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIiksXG5cdFZpZXcgPSByZXF1aXJlKFwiLi92aWV3XCIpLFxuXHRNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXHRTZWN0aW9uID0gcmVxdWlyZShcIi4vc2VjdGlvblwiKSxcblx0JHRyYWNrID0gcmVxdWlyZShcIi4vdHJhY2tcIikudHJhY2ssXG5cdERPTVJhbmdlID0gcmVxdWlyZShcIi4vZG9tcmFuZ2VcIik7XG5cbnZhciBNdXN0YWNoZSA9XG5tb2R1bGUuZXhwb3J0cyA9IFZpZXcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdC8vIGFkZCB0ZW1wbGF0ZVxuXHRcdHZhciB0ZW1wbGF0ZSA9IG9wdGlvbnMudGVtcGxhdGUgfHwgXy5yZXN1bHQodGhpcywgXCJ0ZW1wbGF0ZVwiKTtcblx0XHRpZiAodGVtcGxhdGUgIT0gbnVsbCkgdGhpcy5zZXRUZW1wbGF0ZSh0ZW1wbGF0ZSk7XG5cblx0XHQvLyBhZGQgZGVjb3JhdG9yc1xuXHRcdHRoaXMuZGVjb3JhdGUoXy5leHRlbmQoe30sIG9wdGlvbnMuZGVjb3JhdG9ycywgXy5yZXN1bHQodGhpcywgXCJkZWNvcmF0b3JzXCIpKSk7XG5cblx0XHQvLyBpbml0aWF0ZSBsaWtlIGEgbm9ybWFsIHZpZXdcblx0XHRWaWV3LmNhbGwodGhpcywgZGF0YSwgb3B0aW9ucyk7XG5cdH0sXG5cblx0Ly8gcGFyc2VzIGFuZCBzZXRzIHRoZSByb290IHRlbXBsYXRlXG5cdHNldFRlbXBsYXRlOiBmdW5jdGlvbih0ZW1wbGF0ZSkge1xuXHRcdGlmIChfLmlzU3RyaW5nKHRlbXBsYXRlKSkgdGVtcGxhdGUgPSBwYXJzZSh0ZW1wbGF0ZSk7XG5cblx0XHRpZiAoIV8uaXNPYmplY3QodGVtcGxhdGUpIHx8IHRlbXBsYXRlLnR5cGUgIT09IE5PREVfVFlQRS5ST09UKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBvciBwYXJzZWQgdGVtcGxhdGUuXCIpO1xuXG5cdFx0dGhpcy5fdGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBjcmVhdGVzIGEgZGVjb3JhdG9yXG5cdGRlY29yYXRlOiBmdW5jdGlvbihuYW1lLCBmbiwgb3B0aW9ucykge1xuXHRcdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJvYmplY3RcIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24oZm4sIG4pIHtcblx0XHRcdFx0aWYgKF8uaXNBcnJheShmbikpIHRoaXMuZGVjb3JhdGUobiwgZm5bMF0sIGZuWzFdKTtcblx0XHRcdFx0ZWxzZSB0aGlzLmRlY29yYXRlKG4sIGZuLCBvcHRpb25zKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBuYW1lICE9PSBcInN0cmluZ1wiIHx8IG5hbWUgPT09IFwiXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBub24tZW1wdHkgc3RyaW5nIGZvciBkZWNvcmF0b3IgbmFtZS5cIik7XG5cdFx0aWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGRlY29yYXRvci5cIik7XG5cblx0XHRpZiAodGhpcy5fZGVjb3JhdG9ycyA9PSBudWxsKSB0aGlzLl9kZWNvcmF0b3JzID0ge307XG5cdFx0aWYgKHRoaXMuX2RlY29yYXRvcnNbbmFtZV0gPT0gbnVsbCkgdGhpcy5fZGVjb3JhdG9yc1tuYW1lXSA9IFtdO1xuXHRcdHZhciBkZWNvcmF0b3JzID0gdGhpcy5fZGVjb3JhdG9yc1tuYW1lXTtcblxuXHRcdGlmICghXy5maW5kV2hlcmUoZGVjb3JhdG9ycywgeyBjYWxsYmFjazogZm4gfSkpIHtcblx0XHRcdGRlY29yYXRvcnMucHVzaCh7XG5cdFx0XHRcdGNhbGxiYWNrOiBmbixcblx0XHRcdFx0b3B0aW9uczogb3B0aW9ucyB8fCB7fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gZmluZHMgYWxsIGRlY29yYXRvcnMsIGxvY2FsbHkgYW5kIGluIHBhcmVudFxuXHRmaW5kRGVjb3JhdG9yczogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBkZWNvcmF0b3JzID0gW10sXG5cdFx0XHRjID0gdGhpcztcblxuXG5cdFx0d2hpbGUgKGMgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGMuX2RlY29yYXRvcnMgIT0gbnVsbCAmJiBfLmlzQXJyYXkoYy5fZGVjb3JhdG9yc1tuYW1lXSkpIHtcblx0XHRcdFx0Yy5fZGVjb3JhdG9yc1tuYW1lXS5mb3JFYWNoKGZ1bmN0aW9uKGQpIHtcblx0XHRcdFx0XHRpZiAoIV8uZmluZFdoZXJlKGRlY29yYXRvcnMsIHsgY2FsbGJhY2s6IGQuY2FsbGJhY2sgfSkpIHtcblx0XHRcdFx0XHRcdGRlY29yYXRvcnMucHVzaChfLmV4dGVuZCh7IGNvbnRleHQ6IGMgfSwgZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGMgPSBjLnBhcmVudFJhbmdlO1xuXHRcdH1cblxuXHRcdHJldHVybiBkZWNvcmF0b3JzO1xuXHR9LFxuXG5cdC8vIHJlbW92ZXMgYSBkZWNvcmF0b3Jcblx0c3RvcERlY29yYXRpbmc6IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG5cdFx0aWYgKHR5cGVvZiBuYW1lID09PSBcImZ1bmN0aW9uXCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdFx0Zm4gPSBuYW1lO1xuXHRcdFx0bmFtZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RlY29yYXRvcnMgPT0gbnVsbCB8fCAobmFtZSA9PSBudWxsICYmIGZuID09IG51bGwpKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0b3JzID0ge307XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoZm4gPT0gbnVsbCkge1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2RlY29yYXRvcnNbbmFtZV07XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAobmFtZSA9PSBudWxsKSB7XG5cdFx0XHRfLmVhY2godGhpcy5fZGVjb3JhdG9ycywgZnVuY3Rpb24oZCwgbikge1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0b3JzW25dID0gXy5maWx0ZXIoZCwgZnVuY3Rpb24oX2QpIHtcblx0XHRcdFx0XHRyZXR1cm4gX2QuY2FsbGJhY2sgIT09IGZuO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0dmFyIGQgPSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdO1xuXHRcdFx0dGhpcy5fZGVjb3JhdG9yc1tuYW1lXSA9IF8uZmlsdGVyKGQsIGZ1bmN0aW9uKF9kKSB7XG5cdFx0XHRcdHJldHVybiBfZC5jYWxsYmFjayAhPT0gZm47XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBzcGVjaWFsIHBhcnRpYWwgc2V0dGVyIHRoYXQgY29udmVydHMgc3RyaW5ncyBpbnRvIG11c3RhY2hlIFZpZXdzXG5cdHNldFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUsIHBhcnRpYWwpIHtcblx0XHRpZiAoXy5pc09iamVjdChuYW1lKSkgcmV0dXJuIFZpZXcucHJvdG90eXBlLnNldFBhcnRpYWwuY2FsbCh0aGlzLCBuYW1lKTtcblx0XHRcblx0XHRpZiAoXy5pc1N0cmluZyhwYXJ0aWFsKSkgcGFydGlhbCA9IHBhcnNlKHBhcnRpYWwpO1xuXHRcdGlmIChfLmlzT2JqZWN0KHBhcnRpYWwpICYmIHBhcnRpYWwudHlwZSA9PT0gTk9ERV9UWVBFLlJPT1QpIHBhcnRpYWwgPSBNdXN0YWNoZS5leHRlbmQoeyB0ZW1wbGF0ZTogcGFydGlhbCB9KTtcblx0XHRpZiAocGFydGlhbCAhPSBudWxsICYmICF1dGlsLmlzU3ViQ2xhc3MoVmlldywgcGFydGlhbCkpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIHRlbXBsYXRlLCBwYXJzZWQgdGVtcGxhdGUsIFZpZXcgc3ViY2xhc3Mgb3IgZnVuY3Rpb24gZm9yIHBhcnRpYWwuXCIpO1xuXHRcdFxuXHRcdHJldHVybiBWaWV3LnByb3RvdHlwZS5zZXRQYXJ0aWFsLmNhbGwodGhpcywgbmFtZSwgcGFydGlhbCk7XG5cdH0sXG5cblx0Ly8gdGhlIG1haW4gcmVuZGVyIGZ1bmN0aW9uIGNhbGxlZCBieSBtb3VudFxuXHRyZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLl90ZW1wbGF0ZSA9PSBudWxsKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgYSB0ZW1wbGF0ZSB0byBiZSBzZXQgYmVmb3JlIHJlbmRlcmluZy5cIik7XG5cblx0XHR2YXIgdG9Nb3VudDtcblx0XHR0aGlzLnNldE1lbWJlcnModGhpcy5yZW5kZXJUZW1wbGF0ZSh0aGlzLl90ZW1wbGF0ZSwgbnVsbCwgdG9Nb3VudCA9IFtdKSk7XG5cdFx0Xy5pbnZva2UodG9Nb3VudCwgXCJtb3VudFwiKTtcblx0fSxcblxuXHQvLyBjb252ZXJ0cyBhIHRlbXBsYXRlIGludG8gYW4gYXJyYXkgb2YgZWxlbWVudHMgYW5kIERPTVJhbmdlc1xuXHRyZW5kZXJUZW1wbGF0ZTogZnVuY3Rpb24odGVtcGxhdGUsIHZpZXcsIHRvTW91bnQpIHtcblx0XHRpZiAodmlldyA9PSBudWxsKSB2aWV3ID0gdGhpcztcblx0XHRpZiAodG9Nb3VudCA9PSBudWxsKSB0b01vdW50ID0gW107XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKF8uaXNBcnJheSh0ZW1wbGF0ZSkpIHJldHVybiB0ZW1wbGF0ZS5yZWR1Y2UoZnVuY3Rpb24ociwgdCkge1xuXHRcdFx0dmFyIGIgPSBzZWxmLnJlbmRlclRlbXBsYXRlKHQsIHZpZXcsIHRvTW91bnQpO1xuXHRcdFx0aWYgKF8uaXNBcnJheShiKSkgci5wdXNoLmFwcGx5KHIsIGIpO1xuXHRcdFx0ZWxzZSBpZiAoYiAhPSBudWxsKSByLnB1c2goYik7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9LCBbXSk7XG5cblx0XHRzd2l0Y2godGVtcGxhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuUk9PVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVGVtcGxhdGUodGVtcGxhdGUuY2hpbGRyZW4sIHZpZXcsIHRvTW91bnQpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5FTEVNRU5UOlxuXHRcdFx0XHR2YXIgcGFydCA9IHRoaXMucmVuZGVyUGFydGlhbCh0ZW1wbGF0ZS5uYW1lLCB2aWV3KTtcblx0XHRcdFx0dmFyIG9iajtcblxuXHRcdFx0XHRpZiAocGFydCAhPSBudWxsKSB7XG5cdFx0XHRcdFx0cGFydC5hZGREYXRhKG9iaiA9ICR0cmFjayh7fSkpO1xuXG5cdFx0XHRcdFx0dGVtcGxhdGUuYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uKGF0dHIpIHtcblx0XHRcdFx0XHRcdHNlbGYuYXV0b3J1bihmdW5jdGlvbihjKSB7XG5cdFx0XHRcdFx0XHRcdHZhciB2YWwgPSB0aGlzLnJlbmRlckFyZ3VtZW50cyhhdHRyLmFyZ3VtZW50cywgdmlldyk7XG5cdFx0XHRcdFx0XHRcdGlmICh2YWwubGVuZ3RoID09PSAxKSB2YWwgPSB2YWxbMF07XG5cdFx0XHRcdFx0XHRcdGVsc2UgaWYgKCF2YWwubGVuZ3RoKSB2YWwgPSB2b2lkIDA7XG5cblx0XHRcdFx0XHRcdFx0aWYgKGMuZmlyc3RSdW4pIG9iai5kZWZpbmVQcm9wZXJ0eShhdHRyLm5hbWUsIHZhbCk7XG5cdFx0XHRcdFx0XHRcdGVsc2Ugb2JqW2F0dHIubmFtZV0gPSB2YWw7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHRvTW91bnQucHVzaChwYXJ0KTtcblx0XHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGVtcGxhdGUubmFtZSk7XG5cdFx0XHRcdFx0XG5cdFx0XHRcdFx0dGVtcGxhdGUuYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uKGF0dHIpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnJlbmRlckRlY29yYXRpb25zKGVsLCBhdHRyLCB2aWV3KSkgcmV0dXJuO1xuXHRcdFx0XHRcdFx0XG5cdFx0XHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdGVsLnNldEF0dHJpYnV0ZShhdHRyLm5hbWUsIHRoaXMucmVuZGVyVGVtcGxhdGVBc1N0cmluZyhhdHRyLmNoaWxkcmVuLCB2aWV3KSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRcdHZhciBjaGlsZHJlbiA9IHRoaXMucmVuZGVyVGVtcGxhdGUodGVtcGxhdGUuY2hpbGRyZW4sIHZpZXcsIHRvTW91bnQpLFxuXHRcdFx0XHRcdFx0Y2hpbGQsIGk7XG5cblx0XHRcdFx0XHRmb3IgKGkgaW4gY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdGNoaWxkID0gY2hpbGRyZW5baV07XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0XHRcdFx0XHRjaGlsZC5wYXJlbnRSYW5nZSA9IHZpZXc7IC8vIGZha2UgdGhlIHBhcmVudFxuXHRcdFx0XHRcdFx0XHRjaGlsZC5hdHRhY2goZWwpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZWwuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcblx0XHRcdFx0XHRyZXR1cm4gZWw7XG5cdFx0XHRcdH1cblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVEVYVDpcblx0XHRcdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHV0aWwuZGVjb2RlRW50aXRpZXModGVtcGxhdGUudmFsdWUpKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSFRNTDpcblx0XHRcdFx0cmV0dXJuIG5ldyBET01SYW5nZSh1dGlsLnBhcnNlSFRNTCh0ZW1wbGF0ZS52YWx1ZSkpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5YQ09NTUVOVDpcblx0XHRcdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZUNvbW1lbnQodGVtcGxhdGUudmFsdWUpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlRFUlBPTEFUT1I6XG5cdFx0XHRcdHZhciBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJcIik7XG5cdFx0XHRcdFxuXHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0dmFyIHZhbCA9IHZpZXcuZ2V0KHRlbXBsYXRlLnZhbHVlKTtcblx0XHRcdFx0XHRub2RlLm5vZGVWYWx1ZSA9IHR5cGVvZiB2YWwgPT09IFwic3RyaW5nXCIgPyB2YWwgOiB2YWwgIT0gbnVsbCA/IHZhbC50b1N0cmluZygpIDogXCJcIjtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIG5vZGU7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRSSVBMRTpcblx0XHRcdFx0dmFyIHJhbmdlID0gbmV3IERPTVJhbmdlKCk7XG5cdFx0XHRcdFxuXHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0cmFuZ2Uuc2V0TWVtYmVycyh1dGlsLnBhcnNlSFRNTCh2aWV3LmdldCh0ZW1wbGF0ZS52YWx1ZSkpKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIHJhbmdlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlZFUlRFRDpcblx0XHRcdGNhc2UgTk9ERV9UWVBFLlNFQ1RJT046XG5cdFx0XHRcdHZhciBzZWN0aW9uID0gbmV3IFNlY3Rpb24odmlldy5tb2RlbClcblx0XHRcdFx0XHQuaW52ZXJ0KHRlbXBsYXRlLnR5cGUgPT09IE5PREVfVFlQRS5JTlZFUlRFRClcblx0XHRcdFx0XHQuc2V0UGF0aCh0ZW1wbGF0ZS52YWx1ZSlcblx0XHRcdFx0XHQub25Sb3coZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHR2YXIgX3RvTW91bnQ7XG5cdFx0XHRcdFx0XHR0aGlzLnNldE1lbWJlcnMoc2VsZi5yZW5kZXJUZW1wbGF0ZSh0ZW1wbGF0ZS5jaGlsZHJlbiwgdGhpcywgX3RvTW91bnQgPSBbXSkpO1xuXHRcdFx0XHRcdFx0Xy5pbnZva2UoX3RvTW91bnQsIFwibW91bnRcIik7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dG9Nb3VudC5wdXNoKHNlY3Rpb24pO1xuXHRcdFx0XHRyZXR1cm4gc2VjdGlvbjtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuUEFSVElBTDpcblx0XHRcdFx0dmFyIHBhcnRpYWwgPSB0aGlzLnJlbmRlclBhcnRpYWwodGVtcGxhdGUudmFsdWUsIHZpZXcpO1xuXHRcdFx0XHRpZiAocGFydGlhbCkgdG9Nb3VudC5wdXNoKHBhcnRpYWwpO1xuXHRcdFx0XHRyZXR1cm4gcGFydGlhbDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gY29udmVydHMgYSB0ZW1wbGF0ZSBpbnRvIGEgc3RyaW5nXG5cdHJlbmRlclRlbXBsYXRlQXNTdHJpbmc6IGZ1bmN0aW9uKHRlbXBsYXRlLCBjdHgpIHtcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRpZiAoXy5pc0FycmF5KHRlbXBsYXRlKSkgcmV0dXJuIHRlbXBsYXRlLm1hcChmdW5jdGlvbih0KSB7XG5cdFx0XHRyZXR1cm4gc2VsZi5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKHQsIGN0eCk7XG5cdFx0fSkuZmlsdGVyKGZ1bmN0aW9uKGIpIHsgcmV0dXJuIGIgIT0gbnVsbDsgfSkuam9pbihcIlwiKTtcblxuXHRcdHN3aXRjaCh0ZW1wbGF0ZS50eXBlKSB7XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5ST09UOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKHRlbXBsYXRlLmNoaWxkcmVuLCBjdHgpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5URVhUOlxuXHRcdFx0XHRyZXR1cm4gdGVtcGxhdGUudmFsdWU7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVEVSUE9MQVRPUjpcblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRSSVBMRTpcblx0XHRcdFx0dmFyIHZhbCA9IGN0eC5nZXQodGVtcGxhdGUudmFsdWUpO1xuXHRcdFx0XHRyZXR1cm4gdmFsICE9IG51bGwgPyB2YWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlNFQ1RJT046XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlZFUlRFRDpcblx0XHRcdFx0dmFyIGludmVydGVkLCBtb2RlbCwgdmFsLCBpc0VtcHR5LCBtYWtlUm93LCBwcm94eSwgaXNMaXN0O1xuXG5cdFx0XHRcdGludmVydGVkID0gdGVtcGxhdGUudHlwZSA9PT0gTk9ERV9UWVBFLklOVkVSVEVEO1xuXHRcdFx0XHR2YWwgPSBjdHguZ2V0KHRlbXBsYXRlLnZhbHVlKTtcblx0XHRcdFx0bW9kZWwgPSBuZXcgTW9kZWwodmFsLCBjdHgpO1xuXHRcdFx0XHRwcm94eSA9IG1vZGVsLmdldFByb3h5QnlWYWx1ZSh2YWwpO1xuXHRcdFx0XHRpc0xpc3QgPSBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJpc0xpc3RcIik7XG5cdFx0XHRcdGlzRW1wdHkgPSBTZWN0aW9uLmlzRW1wdHkobW9kZWwsIHByb3h5KTtcblx0XHRcdFx0XG5cdFx0XHRcdG1ha2VSb3cgPSBmdW5jdGlvbihpKSB7XG5cdFx0XHRcdFx0dmFyIHJvdywgZGF0YTtcblxuXHRcdFx0XHRcdGlmIChpID09IG51bGwpIHtcblx0XHRcdFx0XHRcdGRhdGEgPSBtb2RlbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGF0YSA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImdldFwiLCBpKTtcblx0XHRcdFx0XHRcdGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgbmV3IE1vZGVsKHsgJGtleTogaSB9LCBjdHgpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gc2VsZi5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKHRlbXBsYXRlLmNoaWxkcmVuLCBkYXRhKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghKGlzRW1wdHkgXiBpbnZlcnRlZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gaXNMaXN0ICYmICFpbnZlcnRlZCA/XG5cdFx0XHRcdFx0XHRtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJrZXlzXCIpLm1hcChtYWtlUm93KS5qb2luKFwiXCIpIDpcblx0XHRcdFx0XHRcdG1ha2VSb3coKTtcblx0XHRcdFx0fVxuXHRcdH1cblx0fSxcblxuXHQvLyBjb252ZXJ0cyBhbiBhcmd1bWVudCB0ZW1wbGF0ZSBpbnRvIGFuIGFycmF5IG9mIHZhbHVlc1xuXHRyZW5kZXJBcmd1bWVudHM6IGZ1bmN0aW9uKGFyZywgY3R4KSB7XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKF8uaXNBcnJheShhcmcpKSByZXR1cm4gYXJnLm1hcChmdW5jdGlvbihhKSB7XG5cdFx0XHRyZXR1cm4gc2VsZi5yZW5kZXJBcmd1bWVudHMoYSwgY3R4KTtcblx0XHR9KS5maWx0ZXIoZnVuY3Rpb24oYikgeyByZXR1cm4gYiAhPSBudWxsOyB9KTtcblxuXHRcdHN3aXRjaChhcmcudHlwZSkge1xuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5URVJQT0xBVE9SOlxuXHRcdFx0XHRyZXR1cm4gY3R4LmdldChhcmcudmFsdWUpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5MSVRFUkFMOlxuXHRcdFx0XHRyZXR1cm4gYXJnLnZhbHVlO1xuXHRcdH1cblx0fSxcblxuXHQvLyByZW5kZXJzIGRlY29yYXRpb25zIG9uIGFuIGVsZW1lbnQgYnkgdGVtcGxhdGVcblx0cmVuZGVyRGVjb3JhdGlvbnM6IGZ1bmN0aW9uKGVsLCBhdHRyLCBjdHgpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHQvLyBsb29rIHVwIGRlY29yYXRvciBieSBuYW1lXG5cdFx0dmFyIGRlY29yYXRvcnMgPSB0aGlzLmZpbmREZWNvcmF0b3JzKGF0dHIubmFtZSk7XG5cdFx0aWYgKCFkZWNvcmF0b3JzLmxlbmd0aCkgcmV0dXJuO1xuXG5cdFx0Ly8gbm9ybWFsaXplIHRoZSBjb250ZXh0XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cblx0XHQvLyBhIHdyYXBwZXIgY29tcHV0YXRpb24gdG8gZXotY2xlYW4gdGhlIHJlc3Rcblx0XHRyZXR1cm4gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKF9jb21wKSB7XG5cdFx0XHRkZWNvcmF0b3JzLmZvckVhY2goZnVuY3Rpb24oZCkge1xuXHRcdFx0XHRpZiAoZC5vcHRpb25zICYmIGQub3B0aW9ucy5kZWZlcikgXy5kZWZlcihleGVjRGVjb3JhdG9yKTtcblx0XHRcdFx0ZWxzZSBleGVjRGVjb3JhdG9yKCk7XG5cblx0XHRcdFx0ZnVuY3Rpb24gZXhlY0RlY29yYXRvcigpIHtcblx0XHRcdFx0XHR2YXIgZGNvbXAgPSBzZWxmLmF1dG9ydW4oZnVuY3Rpb24oY29tcCkge1xuXHRcdFx0XHRcdFx0Ly8gYXNzZW1ibGUgdGhlIGFyZ3VtZW50cyFcblx0XHRcdFx0XHRcdHZhciBhcmdzID0gWyB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldDogZWwsXG5cdFx0XHRcdFx0XHRcdG1vZGVsOiBjdHgsXG5cdFx0XHRcdFx0XHRcdHZpZXc6IHNlbGYsXG5cdFx0XHRcdFx0XHRcdHRlbXBsYXRlOiBhdHRyLFxuXHRcdFx0XHRcdFx0XHRjb21wOiBjb21wLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiBkLm9wdGlvbnNcblx0XHRcdFx0XHRcdH0gXTtcblxuXHRcdFx0XHRcdFx0Ly8gcmVuZGVyIGFyZ3VtZW50cyBiYXNlZCBvbiBvcHRpb25zXG5cdFx0XHRcdFx0XHRpZiAoZC5vcHRpb25zICYmIGQub3B0aW9ucy5wYXJzZSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0XHRcdFx0XHRhcmdzLnB1c2goc2VsZi5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKGF0dHIuY2hpbGRyZW4sIGN0eCkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChkLm9wdGlvbnMgPT0gbnVsbCB8fCBkLm9wdGlvbnMucGFyc2UgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRcdGFyZ3MgPSBhcmdzLmNvbmNhdChzZWxmLnJlbmRlckFyZ3VtZW50cyhhdHRyLmFyZ3VtZW50cywgY3R4KSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIGV4ZWN1dGUgdGhlIGNhbGxiYWNrXG5cdFx0XHRcdFx0XHRkLmNhbGxiYWNrLmFwcGx5KGQuY29udGV4dCB8fCBzZWxmLCBhcmdzKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdC8vIGNsZWFuIHVwXG5cdFx0XHRcdFx0X2NvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0ZGNvbXAuc3RvcCgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG59LCB7XG5cblx0cmVuZGVyOiBmdW5jdGlvbih0ZW1wbGF0ZSwgZGF0YSwgb3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBfLmV4dGVuZCh7fSwgb3B0aW9ucyB8fCB7fSwge1xuXHRcdFx0dGVtcGxhdGU6IHRlbXBsYXRlXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbmV3IE11c3RhY2hlKGRhdGEgfHwgbnVsbCwgb3B0aW9ucyk7XG5cdH1cblxufSk7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRNdXN0YWNoZSA9IHJlcXVpcmUoXCIuLi9cIik7XG5cbi8vIHRoZSBwbHVnaW5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMuYWRkQWN0aW9uID0gYWRkQWN0aW9uO1xuXHR0aGlzLmFkZEFjdGlvbk9uY2UgPSBhZGRBY3Rpb25PbmNlO1xuXHR0aGlzLnJlbW92ZUFjdGlvbiA9IHJlbW92ZUFjdGlvbjtcblx0dGhpcy5maXJlQWN0aW9uID0gZmlyZUFjdGlvbjtcblx0dGhpcy5kZWNvcmF0ZShkZWNvcmF0b3JzKTtcblxuXHR2YXIgaW5pdEFjdGlvbnMgPSBfLnJlc3VsdCh0aGlzLCBcImFjdGlvbnNcIik7XG5cdGlmIChpbml0QWN0aW9ucyAhPSBudWxsKSB0aGlzLmFkZEFjdGlvbihpbml0QWN0aW9ucyk7XG59XG5cbi8vIGdlbmVyYXRlIGRlY29yYXRvcnNcbnZhciBldmVudE5hbWVzID0gW1xuXHQnbG9hZCcsICdzY3JvbGwnLFxuXHQnY2xpY2snLCAnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnbW91c2VlbnRlcicsICdtb3VzZWxlYXZlJyxcblx0J2tleWRvd24nLCAna2V5cHJlc3MnLCAna2V5dXAnLFxuXHQnYmx1cicsICdmb2N1cycsICdjaGFuZ2UnLCAnaW5wdXQnLCAnc3VibWl0JywgJ3Jlc2V0JywgXG5cdCdkcmFnJywgJ2RyYWdkcm9wJywgJ2RyYWdlbmQnLCAnZHJhZ2VudGVyJywgJ2RyYWdleGl0JywgJ2RyYWdsZWF2ZScsICdkcmFnb3ZlcicsICdkcmFnc3RhcnQnLCAnZHJvcCdcbl07XG5cbnZhciBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbnZhciBkZWNvcmF0b3JzID0ge307XG5cbmV2ZW50TmFtZXMuZm9yRWFjaChmdW5jdGlvbihldmVudCkge1xuXHRkZWNvcmF0b3JzW1wib24tXCIgKyBldmVudF0gPSBmdW5jdGlvbihkZWNvciwga2V5KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0YXJncywgbm9kZTtcblxuXHRcdGZ1bmN0aW9uIGxpc3RlbmVyKGUpIHtcblx0XHRcdC8vIGNyZWF0ZSBhIG5ldyBhY3Rpb24gb2JqZWN0XG5cdFx0XHR2YXIgYWN0aW9uID0gbmV3IEFjdGlvbihrZXkpO1xuXHRcdFx0YWN0aW9uLm9yaWdpbmFsID0gZTtcblx0XHRcdGFjdGlvbi50YXJnZXQgPSBhY3Rpb24ubm9kZSA9IG5vZGU7XG5cdFx0XHRhY3Rpb24uY29udGV4dCA9IGFjdGlvbi5tb2RlbCA9IGRlY29yLm1vZGVsO1xuXHRcdFx0YWN0aW9uLnZpZXcgPSBkZWNvci52aWV3O1xuXG5cdFx0XHQvLyBmaW5kIHRoZSBmaXJzdCBwYXJlbnQgd2l0aCB0aGUgZmlyZSBtZXRob2Rcblx0XHRcdHZhciBmaXJlT24gPSBzZWxmO1xuXHRcdFx0d2hpbGUgKHR5cGVvZiBmaXJlT24uZmlyZUFjdGlvbiAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdC8vIGlmIGl0IGhhcyBubyBwYXJlbnQsIHdlIGNhbid0IGRvIGFueXRoaW5nXG5cdFx0XHRcdGlmIChmaXJlT24ucGFyZW50UmFuZ2UgPT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0XHRmaXJlT24gPSBmaXJlT24ucGFyZW50UmFuZ2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZpcmUgdGhlIGFjdGlvblxuXHRcdFx0ZmlyZU9uLmZpcmVBY3Rpb24uYXBwbHkoZmlyZU9uLCBbIGFjdGlvbiBdLmNvbmNhdChhcmdzKSk7XG5cdFx0fVxuXG5cdFx0bm9kZSA9IGRlY29yLnRhcmdldDtcblx0XHRhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMik7XG5cdFx0bm9kZS5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcik7XG5cblx0XHRkZWNvci5jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXIpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuLy8gQWN0aW9uIENsYXNzXG5mdW5jdGlvbiBBY3Rpb24obmFtZSkge1xuXHR0aGlzLm5hbWUgPSBuYW1lO1xufVxuXG5NdXN0YWNoZS5BY3Rpb24gPSBBY3Rpb247XG5cbkFjdGlvbi5wcm90b3R5cGUuYnViYmxlcyA9IHRydWU7XG5cbkFjdGlvbi5wcm90b3R5cGUuc3RvcFByb3BhZ2F0aW9uID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMuYnViYmxlcyA9IGZhbHNlO1xuXHRyZXR1cm4gdGhpcztcbn1cblxuLy8gTXN1dGFjaGUgSW5zdGFuY2UgTWV0aG9kc1xuZnVuY3Rpb24gYWRkQWN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJvYmplY3RcIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKGZuLCBuKSB7IHRoaXMuYWRkQWN0aW9uKG4sIGZuKTsgfSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIgfHwgbmFtZSA9PT0gXCJcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZm9yIGFjdGlvbiBuYW1lLlwiKTtcblx0aWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGFjdGlvbi5cIik7XG5cblx0aWYgKHRoaXMuX2FjdGlvbnMgPT0gbnVsbCkgdGhpcy5fYWN0aW9ucyA9IHt9O1xuXHRpZiAodGhpcy5fYWN0aW9uc1tuYW1lXSA9PSBudWxsKSB0aGlzLl9hY3Rpb25zW25hbWVdID0gW107XG5cdGlmICghfnRoaXMuX2FjdGlvbnNbbmFtZV0uaW5kZXhPZihmbikpIHRoaXMuX2FjdGlvbnNbbmFtZV0ucHVzaChmbik7XG5cdFxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gYWRkQWN0aW9uT25jZShuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgPT09IFwib2JqZWN0XCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihmbiwgbikgeyB0aGlzLmFkZEFjdGlvbk9uY2UobiwgZm4pOyB9LCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHZhciBvbkFjdGlvbjtcblxuXHR0aGlzLmFkZEFjdGlvbihuYW1lLCBvbkFjdGlvbiA9IGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnJlbW92ZUFjdGlvbihuYW1lLCBvbkFjdGlvbik7XG5cdFx0Zm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fSk7XG5cblx0cmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUFjdGlvbihuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgPT09IFwiZnVuY3Rpb25cIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0Zm4gPSBuYW1lO1xuXHRcdG5hbWUgPSBudWxsO1xuXHR9XG5cblx0aWYgKHRoaXMuX2FjdGlvbnMgPT0gbnVsbCB8fCAobmFtZSA9PSBudWxsICYmIGZuID09IG51bGwpKSB7XG5cdFx0dGhpcy5fYWN0aW9ucyA9IHt9O1xuXHR9XG5cblx0ZWxzZSBpZiAoZm4gPT0gbnVsbCkge1xuXHRcdGRlbGV0ZSB0aGlzLl9hY3Rpb25zW25hbWVdO1xuXHR9XG5cblx0ZWxzZSBpZiAobmFtZSA9PSBudWxsKSB7XG5cdFx0Xy5lYWNoKHRoaXMuX2FjdGlvbnMsIGZ1bmN0aW9uKGQsIG4pIHtcblx0XHRcdHRoaXMuX2FjdGlvbnNbbl0gPSBkLmZpbHRlcihmdW5jdGlvbihmKSB7IHJldHVybiBmICE9PSBmbjsgfSk7XG5cdFx0fSwgdGhpcyk7XG5cdH1cblxuXHRlbHNlIGlmICh0aGlzLl9hY3Rpb25zW25hbWVdICE9IG51bGwpIHtcblx0XHR0aGlzLl9hY3Rpb25zW25hbWVdID0gXy53aXRob3V0KHRoaXMuX2FjdGlvbnNbbmFtZV0sIGZuKTtcblx0fVxuXG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiBmaXJlQWN0aW9uKGFjdGlvbikge1xuXHRpZiAodHlwZW9mIGFjdGlvbiA9PT0gXCJzdHJpbmdcIikgYWN0aW9uID0gbmV3IEFjdGlvbihhY3Rpb24pO1xuXHRpZiAoXy5pc09iamVjdChhY3Rpb24pICYmICEoYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSkgYWN0aW9uID0gXy5leHRlbmQobmV3IEFjdGlvbiwgYWN0aW9uKTtcblx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGFjdGlvbiBuYW1lLCBvYmplY3Qgb3IgaW5zdGFuY2Ugb2YgQWN0aW9uLlwiKTtcblx0XG5cdHZhciBuYW1lID0gYWN0aW9uLm5hbWUsXG5cdFx0YXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblxuXHRhcmdzLnVuc2hpZnQoYWN0aW9uKTtcblxuXHRpZiAodGhpcy5fYWN0aW9ucyAhPSBudWxsICYmIEFycmF5LmlzQXJyYXkodGhpcy5fYWN0aW9uc1tuYW1lXSkpIHtcblx0XHR0aGlzLl9hY3Rpb25zW25hbWVdLnNvbWUoZnVuY3Rpb24oZm4pIHtcblx0XHRcdGlmICghYWN0aW9uLmJ1YmJsZXMpIHJldHVybiB0cnVlO1xuXHRcdFx0Zm4uYXBwbHkodGhpcywgYXJncyk7XG5cdFx0fSwgdGhpcyk7XG5cdH1cblxuXHRpZiAoYWN0aW9uLmJ1YmJsZXMgJiYgdGhpcy5wYXJlbnRSYW5nZSAhPSBudWxsKSB7XG5cdFx0Ly8gZmluZCB0aGUgZmlyc3QgcGFyZW50IHdpdGggdGhlIGZpcmUgbWV0aG9kXG5cdFx0dmFyIGZpcmVPbiA9IHRoaXMucGFyZW50UmFuZ2U7XG5cdFx0d2hpbGUgKHR5cGVvZiBmaXJlT24uZmlyZUFjdGlvbiAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHQvLyBpZiBpdCBoYXMgbm8gcGFyZW50LCB3ZSBjYW4ndCBkbyBhbnl0aGluZ1xuXHRcdFx0aWYgKGZpcmVPbi5wYXJlbnRSYW5nZSA9PSBudWxsKSByZXR1cm47XG5cdFx0XHRmaXJlT24gPSBmaXJlT24ucGFyZW50UmFuZ2U7XG5cdFx0fVxuXG5cdFx0ZmlyZU9uLmZpcmVBY3Rpb24uYXBwbHkoZmlyZU9uLCBhcmdzKTtcblx0fVxuXHRcblx0cmV0dXJuIHRoaXM7XG59IiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcblxudmFyIHBsdWdpbnMgPVxuZXhwb3J0cy5fcGx1Z2lucyA9IHt9O1xuXG5leHBvcnRzLmxvYWRQbHVnaW4gPSBmdW5jdGlvbih0cGwsIHBsdWdpbiwgYXJncykge1xuXHRpZiAoXy5pc1N0cmluZyhwbHVnaW4pKSB7XG5cdFx0aWYgKHBsdWdpbnNbcGx1Z2luXSA9PSBudWxsKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiTm8gcGx1Z2luIGV4aXN0cyB3aXRoIGlkICdcIiArIHBsdWdpbiArIFwiJy5cIik7XG5cblx0XHRwbHVnaW4gPSBwbHVnaW5zW3BsdWdpbl07XG5cdH1cblxuXHRpZiAoIV8uaXNGdW5jdGlvbihwbHVnaW4pKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgb3IgZnVuY3Rpb24gZm9yIHBsdWdpblwiKTtcblxuXHQvLyBjaGVjayBpZiBwbHVnaW4gaXMgYWxyZWFkeSBsb2FkZWQgb24gdGhpcyB0ZW1wbGF0ZVxuXHRpZiAodHBsLl9sb2FkZWRfcGx1Z2lucyA9PSBudWxsKSB0cGwuX2xvYWRlZF9wbHVnaW5zID0gW107XG5cdGlmICh+dHBsLl9sb2FkZWRfcGx1Z2lucy5pbmRleE9mKHBsdWdpbikpIHJldHVybiB0cGw7XG5cdHRwbC5fbG9hZGVkX3BsdWdpbnMucHVzaChwbHVnaW4pO1xuXG5cdGlmIChhcmdzID09IG51bGwpIGFyZ3MgPSBbXTtcblx0aWYgKCFfLmlzQXJyYXkoYXJncykpIGFyZ3MgPSBbIGFyZ3MgXTtcblxuXHRwbHVnaW4uYXBwbHkodHBsLCBhcmdzKTtcblx0cmV0dXJuIHRwbDtcbn1cblxudmFyIHJlZ2lzdGVyUGx1Z2luID1cbmV4cG9ydHMucmVnaXN0ZXJQbHVnaW4gPSBmdW5jdGlvbihuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG5hbWUgZm9yIHBsdWdpbi5cIik7XG5cdH1cblxuXHRpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIHBsdWdpbi5cIik7XG5cdH1cblxuXHRpZiAoZm4gPT09IHBsdWdpbnNbbmFtZV0pIHJldHVybjtcblx0aWYgKHBsdWdpbnNbbmFtZV0gIT0gbnVsbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIlJlZnVzaW5nIHRvIG92ZXJ3cml0ZSBleGlzdGluZyBwbHVnaW4gXFxcIm5hbWVcXFwiLlwiKTtcblx0fVxuXG5cdHBsdWdpbnNbbmFtZV0gPSBmbjtcbn1cblxuLy8gbG9hZCBidWlsdCBpbiBwbHVnaW5zXG5yZWdpc3RlclBsdWdpbihcImFjdGlvbnNcIiwgcmVxdWlyZShcIi4vYWN0aW9uc1wiKSk7XG5yZWdpc3RlclBsdWdpbihcInR3b3dheVwiLCByZXF1aXJlKFwiLi90d293YXlcIikpOyIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbnZhciBpbnB1dF90eXBlcyA9IFsgXCJ0ZXh0XCIsIFwibnVtYmVyXCIsIFwiZGF0ZVwiIF07XG52YXIgdmFsdWVfdHlwZXMgPSBbIFwicmFkaW9cIiwgXCJvcHRpb25cIiBdO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0Ly8gYWRkIG1ldGhvZHNcblx0dGhpcy5hZGRGb3JtQmluZGluZyA9IGFkZEZvcm1CaW5kaW5nO1xuXHR0aGlzLmdldEZvcm1CaW5kaW5nID0gZ2V0Rm9ybUJpbmRpbmc7XG5cdHRoaXMucmVtb3ZlRm9ybUJpbmRpbmcgPSByZW1vdmVGb3JtQmluZGluZztcblxuXHQvLyBhZGQgbWFpbiBiaW5kaW5nIGRlY29yYXRvclxuXHR0aGlzLmRlY29yYXRlKFwiYmluZC10b1wiLCBmdW5jdGlvbiBiaW5kVG8oZCwgaWQsIGxhenkpIHtcblx0XHR2YXIgZmJpbmQgPSB0aGlzLmdldEZvcm1CaW5kaW5nKGlkKTtcblx0XHRpZiAoZmJpbmQgPT0gbnVsbCkgcmV0dXJuO1xuXG5cdFx0dmFyIGVsID0gZC50YXJnZXQsXG5cdFx0XHR0eXBlID0gZ2V0VHlwZShlbCksXG5cdFx0XHRzZWxmID0gdGhpcyxcblx0XHRcdGV2dE5hbWUsIG9uQ2hhbmdlLCBsYXp5O1xuXG5cdFx0Ly8gZGV0ZWN0IGNoYW5nZXMgdG8gdGhlIGlucHV0J3MgdmFsdWVcblx0XHRpZiAodHlwZW9mIGZiaW5kLmNoYW5nZSA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRvbkNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0ZmJpbmQuY2hhbmdlLmNhbGwoc2VsZiwgZ2V0Tm9kZVZhbHVlKGVsLCB0eXBlKSwgZC5tb2RlbCwgZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRldnROYW1lID0gXy5jb250YWlucyhpbnB1dF90eXBlcywgdHlwZSkgPyBcImlucHV0XCIgOiBcImNoYW5nZVwiO1xuXHRcdFx0ZWwuYWRkRXZlbnRMaXN0ZW5lcihldnROYW1lLCBvbkNoYW5nZSk7XG5cdFx0XHRpZiAoIShvcHRpb25zLmxhenkgfHwgbGF6eSkpIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCBvbkNoYW5nZSk7XG5cblx0XHRcdGQuY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZ0TmFtZSwgb25DaGFuZ2UpO1xuXHRcdFx0XHRlbC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5dXBcIiwgb25DaGFuZ2UpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gcmVhY3RpdmVseSBzZXQgdGhlIHZhbHVlIG9uIHRoZSBpbnB1dFxuXHRcdHZhciBjID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0c2V0Tm9kZVZhbHVlKGVsLCBmYmluZC5nZXQuY2FsbChzZWxmLCBkLm1vZGVsKSwgdHlwZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBzZXROb2RlVmFsdWUgcmVsaWVzIG9uIHRoZSBjaGlsZHJlbiBlbGVtZW50c1xuXHRcdC8vIHRob3NlIHdvbid0IGJlIGluIHRoZSBET00gdGlsbCBhdCBsZWFzdCB0aGUgbmV4dCB0aWNrXG5cdFx0Yy5pbnZhbGlkYXRlKCk7XG5cdH0pO1xuXG5cdC8vIGFkZCB2YWx1ZSBkZWNvcmF0b3IgZm9yIHJhZGlvcyBhbmQgb3B0aW9uc1xuXHR0aGlzLmRlY29yYXRlKFwidmFsdWVcIiwgZnVuY3Rpb24gdmFsdWVPZihkLCBzdHJ2YWwpIHtcblx0XHR2YXIgZWwgPSBkLnRhcmdldCxcblx0XHRcdHR5cGUgPSBnZXRUeXBlKGVsKSxcblx0XHRcdHNlbGYgPSB0aGlzO1xuXHRcdFxuXHRcdGlmICghXy5jb250YWlucyh2YWx1ZV90eXBlcywgdHlwZSkpIHtcblx0XHRcdGVsLnZhbHVlID0gc3RydmFsO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBhcmdzID0gdGhpcy5yZW5kZXJBcmd1bWVudHMoZC50ZW1wbGF0ZS5hcmd1bWVudHMsIGQubW9kZWwpO1xuXHRcdGVsLiRib3VuZF92YWx1ZSA9IGFyZ3MubGVuZ3RoIDw9IDEgPyBhcmdzWzBdIDogYXJncztcblx0XHRlbC52YWx1ZSA9IHN0cnZhbDtcblx0fSwgeyBwYXJzZTogXCJzdHJpbmdcIiB9KTtcblxuXHQvLyBhZGQgaW5pdGlhbCBmb3JtIGJpbmRpbmdzXG5cdHZhciBpbml0aWFsQmluZHMgPSBfLnJlc3VsdCh0aGlzLCBcInR3b3dheVwiKTtcblx0aWYgKF8uaXNPYmplY3QoaW5pdGlhbEJpbmRzKSkgdGhpcy5hZGRGb3JtQmluZGluZyhpbml0aWFsQmluZHMpO1xufVxuXG5mdW5jdGlvbiBhZGRGb3JtQmluZGluZyhpZCwgZ2V0dGVyLCBvbkNoYW5nZSkge1xuXHRpZiAoXy5pc09iamVjdChpZCkpIHtcblx0XHRfLmVhY2goaWQsIGZ1bmN0aW9uKHYsIGspIHtcblx0XHRcdGFkZEZvcm1CaW5kaW5nLmNhbGwodGhpcywgaywgdik7XG5cdFx0fSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRpZiAodHlwZW9mIGlkICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSBzdHJpbmcgZm9yIHRoZSBmb3JtIGJpbmRpbmcgSUQuXCIpO1xuXHRpZiAodGhpcy5fZm9ybUJpbmRpbmdzID09IG51bGwpIHRoaXMuX2Zvcm1CaW5kaW5ncyA9IHt9O1xuXHRpZiAodGhpcy5fZm9ybUJpbmRpbmdzW2lkXSAhPSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvcm0gYmluZGluZyB3aXRoIGlkICdcIiArIGlkICsgXCInIGFscmVhZHkgZXhpc3RzLlwiKTtcblxuXHRpZiAoXy5pc09iamVjdChnZXR0ZXIpICYmIG9uQ2hhbmdlID09IG51bGwpIHtcblx0XHRvbkNoYW5nZSA9IGdldHRlci5jaGFuZ2U7XG5cdFx0Z2V0dGVyID0gZ2V0dGVyLmdldDtcblx0fVxuXG5cdGlmICh0eXBlb2YgZ2V0dGVyICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIGZ1bmN0aW9uIG9yIG9iamVjdCBmb3IgdGhlIGZvcm0gYmluZGluZyBnZXR0ZXIuXCIpO1xuXHRpZiAodHlwZW9mIG9uQ2hhbmdlICE9PSBcImZ1bmN0aW9uXCIpIG9uQ2hhbmdlID0gbnVsbDtcblxuXHR0aGlzLl9mb3JtQmluZGluZ3NbaWRdID0ge1xuXHRcdGdldDogZ2V0dGVyLFxuXHRcdGNoYW5nZTogb25DaGFuZ2Vcblx0fTtcblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gZ2V0Rm9ybUJpbmRpbmcoaWQpIHtcblx0aWYgKHR5cGVvZiBpZCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuO1xuXHR2YXIgYyA9IHRoaXMsIGJpbmRpbmdzO1xuXG5cdHdoaWxlIChjICE9IG51bGwpIHtcblx0XHRiaW5kaW5ncyA9IGMuX2Zvcm1CaW5kaW5ncztcblx0XHRpZiAoYmluZGluZ3MgIT0gbnVsbCAmJiBiaW5kaW5nc1tpZF0gIT0gbnVsbCkgcmV0dXJuIGJpbmRpbmdzW2lkXTtcblx0XHRjID0gYy5wYXJlbnRSYW5nZTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW1vdmVGb3JtQmluZGluZyhpZCkge1xuXHR2YXIgZXhpc3RzID0gdGhpcy5fZm9ybUJpbmRpbmdzW2lkXSAhPSBudWxsO1xuXHRkZWxldGUgdGhpcy5fZm9ybUJpbmRpbmdzW2lkXTtcblx0cmV0dXJuIGV4aXN0cztcbn1cblxudmFyIHR5cGVfbWFwID0ge1xuXHRcInRleHRcIjogWyBcInRleHRcIiwgXCJjb2xvclwiLCBcImVtYWlsXCIsIFwicGFzc3dvcmRcIiwgXCJzZWFyY2hcIiwgXCJ0ZWxcIiwgXCJ1cmxcIiwgXCJoaWRkZW5cIiBdLFxuXHRcIm51bWJlclwiOiBbIFwibnVtYmVyXCIsIFwicmFuZ2VcIiBdLFxuXHRcImRhdGVcIjogWyBcImRhdGVcIiwgXCJkYXRldGltZVwiLCBcImRhdGV0aW1lLWxvY2FsXCIsIFwibW9udGhcIiwgXCJ0aW1lXCIsIFwid2Vla1wiIF0sXG5cdFwiZmlsZVwiOiBbIFwiZmlsZVwiIF0sXG5cdFwiY2hlY2tib3hcIjogWyBcImNoZWNrYm94XCIgXSxcblx0XCJyYWRpb1wiOiBbIFwicmFkaW9cIiBdXG59XG5cbmZ1bmN0aW9uIGdldFR5cGUoZWwpIHtcblx0c3dpdGNoIChlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRjYXNlIFwiaW5wdXRcIjpcblx0XHRcdGZvciAodmFyIHR5cGUgaW4gdHlwZV9tYXApIHtcblx0XHRcdFx0aWYgKF8uY29udGFpbnModHlwZV9tYXBbdHlwZV0sIGVsLnR5cGUpKSByZXR1cm4gdHlwZTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInNlbGVjdFwiOlxuXHRcdFx0cmV0dXJuIFwic2VsZWN0XCI7XG5cblx0XHRjYXNlIFwib3B0aW9uXCI6XG5cdFx0XHRyZXR1cm4gXCJvcHRpb25cIjtcblxuXHRcdGNhc2UgXCJ0ZXh0YXJlYVwiOlxuXHRcdFx0cmV0dXJuIFwidGV4dFwiO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE5vZGVWYWx1ZShub2RlLCB0eXBlKSB7XG5cdGlmICh0eXBlID09IG51bGwpIHR5cGUgPSBnZXRUeXBlKG5vZGUpO1xuXHR2YXIgdmFsO1xuXG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdHZhbCA9IG5vZGUudmFsdWVBc051bWJlcjtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCJ0ZXh0XCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiY2hlY2tib3hcIjpcblx0XHRcdHZhbCA9IG5vZGUuY2hlY2tlZDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImRhdGVcIjpcblx0XHRcdHZhbCA9IG5vZGUudmFsdWVBc0RhdGU7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJzZWxlY3RcIjpcblx0XHRcdHZhciBvcHQgPSBub2RlLnF1ZXJ5U2VsZWN0b3IoXCJvcHRpb246Y2hlY2tlZFwiKTtcblx0XHRcdGlmIChvcHQgIT0gbnVsbCkgdmFsID0gb3B0LiRib3VuZF92YWx1ZTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImZpbGVcIjpcblx0XHRcdHZhbCA9ICFub2RlLm11bHRpcGxlID8gbm9kZS5maWxlc1swXSA6IF8udG9BcnJheShub2RlLmZpbGVzKTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInJhZGlvXCI6XG5cdFx0XHR2YWwgPSBub2RlLiRib3VuZF92YWx1ZTtcblx0XHRcdGJyZWFrO1xuXHR9XG5cblx0cmV0dXJuIHZhbDtcbn1cblxuZnVuY3Rpb24gc2V0Tm9kZVZhbHVlKGVsLCB2YWwsIHR5cGUpIHtcblx0aWYgKHR5cGUgPT0gbnVsbCkgdHlwZSA9IGdldFR5cGUoZWwpO1xuXG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBlbCkgcmV0dXJuO1xuXHRcdFx0aWYgKF8uaXNOdW1iZXIodmFsKSkgZWwudmFsdWVBc051bWJlciA9IHZhbDtcblx0XHRcdGVsc2UgZWwudmFsdWUgPSB2YWw7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJ0ZXh0XCI6XG5cdFx0XHRpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZWwpIHJldHVybjtcblx0XHRcdGVsLnZhbHVlID0gdmFsID09IG51bGwgPyBcIlwiIDogdmFsLnRvU3RyaW5nKCk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJjaGVja2JveFwiOlxuXHRcdFx0ZWwuY2hlY2tlZCA9ICEhdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiZGF0ZVwiOlxuXHRcdFx0aWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVsKSByZXR1cm47XG5cdFx0XHRpZiAoXy5pc0RhdGUodmFsKSkgZWwudmFsdWVBc0RhdGUgPSB2YWw7XG5cdFx0XHRlbHNlIGVsLnZhbHVlID0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwic2VsZWN0XCI6XG5cdFx0XHRfLnRvQXJyYXkoZWwucXVlcnlTZWxlY3RvckFsbChcIm9wdGlvblwiKSkuZm9yRWFjaChmdW5jdGlvbihvcHQpIHtcblx0XHRcdFx0b3B0LnNlbGVjdGVkID0gb3B0LiRib3VuZF92YWx1ZSA9PT0gdmFsO1xuXHRcdFx0fSk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJyYWRpb1wiOlxuXHRcdFx0ZWwuY2hlY2tlZCA9IGVsLiRib3VuZF92YWx1ZSA9PT0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cdH1cbn0iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKSxcblx0TW9kZWwgPSByZXF1aXJlKFwiLi9tb2RlbFwiKSxcblx0VmlldyA9IHJlcXVpcmUoXCIuL3ZpZXdcIik7XG5cbnZhciBTZWN0aW9uID1cbm1vZHVsZS5leHBvcnRzID0gVmlldy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5yb3dzID0ge307XG5cdFx0dGhpcy5fcm93X2RlcHMgPSB7fTtcblx0XHRWaWV3LmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH0sXG5cblx0aW52ZXJ0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRpZiAoIV8uaXNCb29sZWFuKHZhbCkpIHZhbCA9ICF0aGlzLl9pbnZlcnRlZDtcblx0XHR0aGlzLl9pbnZlcnRlZCA9IHZhbDtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRpc0ludmVydGVkOiBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gISF0aGlzLl9pbnZlcnRlZDtcblx0fSxcblxuXHRzZXRQYXRoOiBmdW5jdGlvbihwYXRoKSB7XG5cdFx0dGhpcy5fcGF0aCA9IHBhdGg7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0b25Sb3c6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0aWYgKCFfLmlzRnVuY3Rpb24oZm4pKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciByb3cgaGFuZGxlci5cIik7XG5cblx0XHR0aGlzLl9vblJvdyA9IGZuO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFkZFJvdzogZnVuY3Rpb24oa2V5LCBkYXRhKSB7XG5cdFx0Ly8gcmVtb3ZlIGV4aXN0aW5nXG5cdFx0dGhpcy5yZW1vdmVSb3coa2V5KTtcblxuXHRcdC8vIGNvbnZlcnQgZGF0YSB0byBtb2RlbFxuXHRcdGlmICghTW9kZWwuaXNNb2RlbChkYXRhKSkge1xuXHRcdFx0ZGF0YSA9IG5ldyBNb2RlbChkYXRhLCB0aGlzLm1vZGVsKTtcblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgYSBuZXcgcm93XG5cdFx0dmFyIHJvdyA9IG5ldyBWaWV3KGRhdGEpO1xuXHRcdFxuXHRcdC8vIHNldCB1cCByZW5kZXIgYW5kIG1vdW50IGl0XG5cdFx0cm93LnJlbmRlciA9IHRoaXMuX29uUm93O1xuXHRcdHRoaXMucm93c1trZXldID0gcm93O1xuXHRcdHRoaXMuYWRkTWVtYmVyKHJvdyk7XG5cdFx0cm93Lm1vdW50KCk7XG5cblx0XHRyZXR1cm4gcm93O1xuXHR9LFxuXG5cdGhhc1JvdzogZnVuY3Rpb24oa2V5KSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Um93KGtleSkgIT0gbnVsbDtcblx0fSxcblxuXHRnZXRSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdHJldHVybiB0aGlzLnJvd3Nba2V5XTtcblx0fSxcblxuXHRyZW1vdmVSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdGlmICh0aGlzLnJvd3Nba2V5XSA9PSBudWxsKSByZXR1cm4gdGhpcztcblxuXHRcdHZhciByb3cgPSB0aGlzLnJvd3Nba2V5XTtcblx0XHR0aGlzLnJlbW92ZU1lbWJlcihyb3cpO1xuXHRcdGRlbGV0ZSB0aGlzLnJvd3Nba2V5XTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZUFsbFJvd3M6IGZ1bmN0aW9uKCkge1xuXHRcdE9iamVjdC5rZXlzKHRoaXMucm93cykuZm9yRWFjaCh0aGlzLnJlbW92ZVJvdywgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5fcGF0aCA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJNaXNzaW5nIHBhdGguXCIpO1xuXG5cdFx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0dmFsLCBpc0VtcHR5LCBpbnZlcnRlZCwgaXNMaXN0LFxuXHRcdFx0cm93U29ydCwgbW9kZWwsIHByb3h5LCBrZXlzO1xuXG5cdFx0dmFsID0gdGhpcy5nZXQodGhpcy5fcGF0aCk7XG5cdFx0bW9kZWwgPSBuZXcgTW9kZWwodmFsLCB0aGlzLm1vZGVsKTtcblx0XHRwcm94eSA9IG1vZGVsLmdldFByb3h5QnlWYWx1ZSh2YWwpO1xuXHRcdGludmVydGVkID0gdGhpcy5pc0ludmVydGVkKCk7XG5cdFx0aXNMaXN0ID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiaXNMaXN0XCIpO1xuXG5cdFx0ZnVuY3Rpb24gZ2V0RW1wdGluZXNzKCkge1xuXHRcdFx0cmV0dXJuIG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImlzRW1wdHlcIik7XG5cdFx0fVxuXG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0aXNFbXB0eSA9ICF2YWwgfHwgKGlzTGlzdCAmJiAhZ2V0RW1wdGluZXNzKCkpXG5cdFx0fSk7XG5cblx0XHRpZiAoaXNFbXB0eSAmJiBpbnZlcnRlZCkge1xuXHRcdFx0aWYgKGlzTGlzdCkgZ2V0RW1wdGluZXNzKCk7XG5cdFx0XHR0aGlzLmFkZFJvdygwLCBtb2RlbCk7XG5cdFx0fSBlbHNlIGlmICghaXNFbXB0eSAmJiAhaW52ZXJ0ZWQpIHtcblx0XHRcdGlmIChpc0xpc3QpIHtcblx0XHRcdFx0a2V5cyA9IFtdO1xuXG5cdFx0XHRcdHRoaXMuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHRcdFx0dmFyIG5rZXlzID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwia2V5c1wiKTtcblxuXHRcdFx0XHRcdC8vIHRyaWNrIFRyYWNrciBzbyBhdXRvcnVucyBhcmVuJ3QgY29udHJvbGxlZCBieSB0aGlzIG9uZVxuXHRcdFx0XHRcdFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBjb21wLl9wYXJlbnQ7XG5cblx0XHRcdFx0XHQvLyByZW1vdmUgcmVtb3ZlZCByb3dzXG5cdFx0XHRcdFx0Xy5kaWZmZXJlbmNlKGtleXMsIG5rZXlzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3Jvd19kZXBzW2tleV0pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcm93X2RlcHNba2V5XS5zdG9wKCk7XG5cdFx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9yb3dfZGVwc1trZXldO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLnJlbW92ZVJvdyhrZXkpO1xuXHRcdFx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRcdFx0Ly8gYWRkIGFkZGVkIHJvd3Ncblx0XHRcdFx0XHRfLmRpZmZlcmVuY2UobmtleXMsIGtleXMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0XHRcdFx0XHR2YXIgcm93LCBybW9kZWw7XG5cblx0XHRcdFx0XHRcdHJvdyA9IHRoaXMuZ2V0Um93KGtleSk7XG5cdFx0XHRcdFx0XHRybW9kZWwgPSByb3cgIT0gbnVsbCA/IHJvdy5tb2RlbCA6XG5cdFx0XHRcdFx0XHRcdG5ldyBNb2RlbChudWxsLCBuZXcgTW9kZWwoeyAka2V5OiBrZXkgfSwgdGhpcy5tb2RlbCkpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLl9yb3dfZGVwc1trZXldID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGMpIHtcblx0XHRcdFx0XHRcdFx0cm1vZGVsLnNldChtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJnZXRcIiwga2V5KSk7XG5cdFx0XHRcdFx0XHRcdC8vIGlmIChyb3dTb3J0ICE9IG51bGwpIHJvd1NvcnQuaW52YWxpZGF0ZSgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdC8vIGFkZCB0aGUgcm93IGFmdGVyIHdlIHNldCB0aGUgZGF0YVxuXHRcdFx0XHRcdFx0aWYgKHJvdyA9PSBudWxsKSB0aGlzLmFkZFJvdyhrZXksIHJtb2RlbCk7XG5cdFx0XHRcdFx0fSwgdGhpcyk7XG5cdFx0XHRcdFx0XHRcblx0XHRcdFx0XHQvLyBwcmV0ZW5kIGxpa2Ugbm90aGluZyBoYXBwZW5lZFxuXHRcdFx0XHRcdFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBjb21wO1xuXG5cdFx0XHRcdFx0Ly8gdGhlIG5ldyBzZXQgb2Yga2V5c1xuXHRcdFx0XHRcdGtleXMgPSBua2V5cztcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gYSByZWFjdGl2ZSBjb250ZXh0IHRoYXQgY29udGludW91c2x5IHNvcnRzIHJvd3Ncblx0XHRcdFx0Ly8gcm93U29ydCA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdFx0XHQvLyBjb25zb2xlLmxvZyhrZXlzKTtcblx0XHRcdFx0XHQvLyB2YXIgYmVmb3JlID0gbnVsbCwgaSwgcm93O1xuXG5cdFx0XHRcdFx0Ly8gZm9yIChpID0ga2V5cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdC8vIFx0cm93ID0gdGhpcy5nZXRSb3coa2V5c1tpXSk7XG5cdFx0XHRcdFx0Ly8gXHRpZiAocm93ID09IG51bGwpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdC8vIFx0dGhpcy5pbnNlcnRCZWZvcmUocm93LCBiZWZvcmUpO1xuXHRcdFx0XHRcdC8vIFx0YmVmb3JlID0gcm93O1xuXHRcdFx0XHRcdC8vIH1cblx0XHRcdFx0Ly8gfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFkZFJvdygwLCBtb2RlbCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc0xpc3QpIHtcblx0XHRcdGdldEVtcHRpbmVzcygpO1xuXHRcdH1cblxuXHRcdC8vIGF1dG8gY2xlYW5cblx0XHR0aGlzLm9uY2UoXCJpbnZhbGlkYXRlXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dGhpcy5fcm93X2RlcHMgPSB7fTtcblx0XHRcdHRoaXMucmVtb3ZlQWxsUm93cygpO1xuXHRcdH0pO1xuXHR9XG5cbn0sIHtcblxuXHRpc0VtcHR5OiBmdW5jdGlvbihtb2RlbCwgcHJveHkpIHtcblx0XHRpZiAoIW1vZGVsLmRhdGEpIHJldHVybiB0cnVlO1xuXHRcdGlmIChwcm94eSA9PSBudWxsKSBwcm94eSA9IG1vZGVsLmdldFByb3h5QnlWYWx1ZShtb2RlbC5kYXRhKTtcblx0XHRyZXR1cm4gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCBtb2RlbC5kYXRhLCBcImlzTGlzdFwiKSAmJlxuXHRcdFx0bW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCBtb2RlbC5kYXRhLCBcImlzRW1wdHlcIik7XG5cdH1cblxufSk7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xudmFyIFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIik7XG52YXIgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5cbnZhciB0cmFjayA9XG5leHBvcnRzLnRyYWNrID0gZnVuY3Rpb24ob2JqLCByZXBsYWNlcikge1xuXHRmdW5jdGlvbiByZXBsYWNlKGssIHYpIHtcblx0XHR2YXIgbnZhbDtcblx0XHRpZiAodHlwZW9mIHJlcGxhY2VyID09PSBcImZ1bmN0aW9uXCIpIG52YWwgPSByZXBsYWNlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgbnZhbCA9PT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgdiAhPT0gXCJ1bmRlZmluZWRcIikgbnZhbCA9IHRyYWNrKHYpO1xuXHRcdHJldHVybiBudmFsO1xuXHR9XG5cblx0aWYgKF8uaXNBcnJheShvYmopKSByZXR1cm4gdHJhY2tBcnJheShvYmosIHJlcGxhY2UpXG5cdGlmICh1dGlsLmlzUGxhaW5PYmplY3Qob2JqKSkgcmV0dXJuIHRyYWNrT2JqZWN0KG9iaiwgcmVwbGFjZSk7XG5cdHJldHVybiBvYmo7XG59XG5cbnZhciB0cmFja1Byb3BlcnR5ID1cbmV4cG9ydHMudHJhY2tQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUsIG9wdGlvbnMpIHtcblx0aWYgKCFfLmlzT2JqZWN0KG9iaikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBvYmplY3QgdG8gZGVmaW5lIHRoZSByZWFjdGl2ZSBwcm9wZXJ0eSBvbi5cIik7XG5cdGlmICh0eXBlb2YgcHJvcCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgcHJvcGVydHkgbmFtZS5cIik7XG5cblx0dmFyIGRlcCA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeTtcblx0XG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmNvbmZpZ3VyYWJsZSAhPT0gZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuZW51bWVyYWJsZSAhPT0gZmFsc2UsXG5cdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdGlmICh2YWwgIT09IHZhbHVlKSB7XG5cdFx0XHRcdHZhbHVlID0gdmFsO1xuXHRcdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG9iajtcbn1cblxudmFyIHRyYWNrT2JqZWN0ID1cbmV4cG9ydHMudHJhY2tPYmplY3QgPSBmdW5jdGlvbihwcm9wcywgcmVwbGFjZXIpIHtcblx0aWYgKHByb3BzLl9fcmVhY3RpdmUpIHJldHVybiBwcm9wcztcblxuXHR2YXIgdmFsdWVzID0ge307XG5cdHZhciBkZXBzID0ge307XG5cdHZhciBtYWluRGVwID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cblx0ZnVuY3Rpb24gcmVwbGFjZShjdHgsIG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXHRcdHJldHVybiBUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHJlcGxhY2VyID09PSBcImZ1bmN0aW9uXCIgPyByZXBsYWNlci5jYWxsKGN0eCwgbmFtZSwgdmFsdWUpIDogdmFsdWU7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXR0ZXIobmFtZSkge1xuXHRcdGRlcHNbbmFtZV0uZGVwZW5kKCk7XG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHRlcihuYW1lLCB2YWx1ZSkge1xuXHRcdHZhciBvbGQgPSB2YWx1ZXNbbmFtZV07XG5cdFx0dmFsdWVzW25hbWVdID0gcmVwbGFjZSh0aGlzLCBuYW1lLCB2YWx1ZSk7XG5cblx0XHR2YXIgZGVwID0gZGVwc1tuYW1lXTtcblx0XHRpZiAoZGVwID09IG51bGwpIGRlcCA9IGRlcHNbbmFtZV0gPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKTtcblx0XHRpZiAob2xkICE9PSB2YWx1ZXNbbmFtZV0pIGRlcC5jaGFuZ2VkKCk7XG5cblx0XHRtYWluRGVwLmNoYW5nZWQoKTtcblx0XHRyZXR1cm4gdmFsdWVzW25hbWVdO1xuXHR9XG5cblx0dmFyIF9wcm90byA9IHR5cGVvZiBwcm9wcy5jb25zdHJ1Y3RvciA9PT0gXCJmdW5jdGlvblwiID8gT2JqZWN0LmNyZWF0ZShwcm9wcy5jb25zdHJ1Y3Rvci5wcm90b3R5cGUpIDoge307XG5cblx0Xy5leHRlbmQoX3Byb3RvLCB7XG5cblx0XHRkZWZpbmVQcm9wZXJ0eTogZnVuY3Rpb24obmFtZSwgdmFsdWUsIG9wdGlvbnMpIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBuYW1lLCB7XG5cdFx0XHRcdGNvbmZpZ3VyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuY29uZmlndXJhYmxlICE9PSBmYWxzZSxcblx0XHRcdFx0ZW51bWVyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuZW51bWVyYWJsZSAhPT0gZmFsc2UsXG5cdFx0XHRcdGdldDogZ2V0dGVyLmJpbmQodGhpcywgbmFtZSksXG5cdFx0XHRcdHNldDogc2V0dGVyLmJpbmQodGhpcywgbmFtZSlcblx0XHRcdH0pO1xuXG5cdFx0XHR0aGlzW25hbWVdID0gdmFsdWU7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXG5cdFx0ZGVsZXRlUHJvcGVydHk6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRcdHZhciBkZXAgPSBkZXBzW25hbWVdO1xuXHRcdFx0aWYgKGRlbGV0ZSB0aGlzW25hbWVdKSB7IC8vIGluIGNhc2UgY29uZmlndXJhYmxlID09PSBmYWxzZVxuXHRcdFx0XHRkZWxldGUgdmFsdWVzW25hbWVdO1xuXHRcdFx0XHRkZWxldGUgZGVwc1tuYW1lXTtcblx0XHRcdFx0aWYgKGRlcCkgZGVwLmNoYW5nZWQoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0sXG5cblx0XHR0b0pTT046IGZ1bmN0aW9uKCkge1xuXHRcdFx0bWFpbkRlcC5kZXBlbmQoKTtcblx0XHRcdHJldHVybiBfLmNsb25lKHZhbHVlcyk7XG5cdFx0fVxuXG5cdH0pO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShfcHJvdG8sIFwiX19yZWFjdGl2ZVwiLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHR2YWx1ZTogdHJ1ZSxcblx0XHR3cml0ZWFibGU6IGZhbHNlXG5cdH0pO1xuXG5cdHZhciByb2JqID0gT2JqZWN0LmNyZWF0ZShfcHJvdG8pO1xuXG5cdF8uZWFjaChwcm9wcywgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuXHRcdHJvYmouZGVmaW5lUHJvcGVydHkoa2V5LCB2YWx1ZSk7XG5cdH0pO1xuXG5cdHJldHVybiByb2JqO1xufVxuXG52YXIgdHJhY2tBcnJheSA9XG5leHBvcnRzLnRyYWNrQXJyYXkgPSBmdW5jdGlvbihhcnIsIHJlcGxhY2VyKSB7XG5cdGlmICghXy5pc0FycmF5KGFycikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhcnJheS5cIik7XG5cdGlmIChhcnIuX19yZWFjdGl2ZSkgcmV0dXJuIGFycjtcblx0XG5cdHZhciBkZXBzID0geyBsZW5ndGg6IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpIH07XG5cdHZhciB2YWx1ZXMgPSB7fTtcblx0dmFyIG5hcnIgPSB1dGlsLnBhdGNoQXJyYXkoW10pO1xuXG5cdGZ1bmN0aW9uIHJlcGxhY2UoY3R4LCBuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiByZXBsYWNlciA9PT0gXCJmdW5jdGlvblwiID8gcmVwbGFjZXIuY2FsbChjdHgsIG5hbWUsIHZhbHVlKSA6IHZhbHVlO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0dGVyKG5hbWUpIHtcblx0XHRkZXBzW25hbWVdLmRlcGVuZCgpO1xuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR0ZXIobmFtZSwgdmFsdWUpIHtcblx0XHR2YXIgb2xkID0gdmFsdWVzW25hbWVdO1xuXHRcdHZhbHVlc1tuYW1lXSA9IHJlcGxhY2UodGhpcywgbmFtZSwgdmFsdWUpO1xuXG5cdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0aWYgKGRlcCA9PSBudWxsKSBkZXAgPSBkZXBzW25hbWVdID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cdFx0aWYgKG9sZCAhPT0gdmFsdWVzW25hbWVdKSBkZXAuY2hhbmdlZCgpO1xuXG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdGZ1bmN0aW9uIGRlZmluZShpKSB7XG5cdFx0dmFyIGRlcDtcblxuXHRcdGlmICh0eXBlb2YgaSA9PT0gXCJudW1iZXJcIiAmJiBpID49IG5hcnIubGVuZ3RoKSB7XG5cdFx0XHRpZiAoKGRlcCA9IGRlcHNbaV0pICE9IG51bGwpIHtcblx0XHRcdFx0ZGVsZXRlIGRlcHNbaV07XG5cdFx0XHR9XG5cblx0XHRcdGRlbGV0ZSBuYXJyW2ldO1xuXHRcdFx0ZGVsZXRlIHZhbHVlc1tpXTtcblx0XHRcdGRlcC5jaGFuZ2VkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2V0dGVyLmNhbGwodGhpcywgaSwgbmFycltpXSk7XG5cblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgaS50b1N0cmluZygpLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdFx0Z2V0OiBnZXR0ZXIuYmluZChuYXJyLCBpKSxcblx0XHRcdHNldDogc2V0dGVyLmJpbmQobmFyciwgaSlcblx0XHR9KTtcblx0fVxuXG5cdG5hcnIub2JzZXJ2ZShmdW5jdGlvbihjaGcpIHtcdFx0XG5cdFx0dmFyIGJhbGFuY2UsIHN0YXJ0LCBlbmQsIGxlbiwgaSwgcHJldmxlbjtcblxuXHRcdGlmIChjaGcgPT0gbnVsbCkgcmV0dXJuO1xuXG5cdFx0YmFsYW5jZSA9IGNoZy5hZGRlZCAtIGNoZy5yZW1vdmVkO1xuXHRcdGlmICghYmFsYW5jZSkgcmV0dXJuO1xuXG5cdFx0bGVuID0gbmFyci5sZW5ndGg7XG5cdFx0cHJldmxlbiA9IGxlbiAtIGJhbGFuY2U7XG5cdFx0c3RhcnQgPSBNYXRoLm1pbihwcmV2bGVuLCBsZW4pO1xuXHRcdGVuZCA9IE1hdGgubWF4KHByZXZsZW4sIGxlbik7XG5cblx0XHRmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSBkZWZpbmUoaSk7XG5cdFx0ZGVwcy5sZW5ndGguY2hhbmdlZCgpO1xuXHR9KTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgXCJfX3JlYWN0aXZlXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdHZhbHVlOiB0cnVlLFxuXHRcdHdyaXRlYWJsZTogZmFsc2Vcblx0fSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG5hcnIsIFwiJGxlbmd0aFwiLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwcy5sZW5ndGguZGVwZW5kKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5sZW5ndGg7XG5cdFx0fVxuXHR9KTtcblxuXHRuYXJyLnB1c2guYXBwbHkobmFyciwgYXJyKTtcblx0cmV0dXJuIG5hcnI7XG59IiwibW9kdWxlLmV4cG9ydHMgPSB7XG5cdFJPT1QgICAgICAgICAgICAgIDogMSxcblxuXHQvLyBYTUwvSFRNTFxuXHRIVE1MICAgICAgICAgICAgICA6IDIsXG5cdFRFWFQgICAgICAgICAgICAgIDogMyxcblx0RUxFTUVOVCAgICAgICAgICAgOiA0LFxuXHRBVFRSSUJVVEUgICAgICAgICA6IDUsXG5cdFhDT01NRU5UICAgICAgICAgIDogNixcblxuXHQvLyBNdXN0YWNoZVxuXHRJTlRFUlBPTEFUT1IgICAgICA6IDcsXG5cdFRSSVBMRSAgICAgICAgICAgIDogOCxcblx0U0VDVElPTiAgICAgICAgICAgOiA5LFxuXHRJTlZFUlRFRCAgICAgICAgICA6IDEwLFxuXHRQQVJUSUFMICAgICAgICAgICA6IDExLFxuXHRNQ09NTUVOVCAgICAgICAgICA6IDEyLFxuXG5cdC8vIE1JU0Ncblx0TElURVJBTCAgICAgICAgICAgOiAxM1xufVxuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcblxuLy8gbGlrZSB1bmRlcnNjb3JlJ3MgcmVzdWx0LCBidXQgcGFzcyBhcmd1bWVudHMgdGhyb3VnaFxuZXhwb3J0cy5yZXN1bHQgPSBmdW5jdGlvbihvYmplY3QsIHByb3BlcnR5KSB7XG5cdHZhciB2YWx1ZSA9IG9iamVjdCA9PSBudWxsID8gdm9pZCAwIDogb2JqZWN0W3Byb3BlcnR5XTtcblx0cmV0dXJuIF8uaXNGdW5jdGlvbih2YWx1ZSkgPyB2YWx1ZS5hcHBseShvYmplY3QsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMikpIDogdmFsdWU7XG59O1xuXG4vLyB0ZXN0cyB2YWx1ZSBhcyBwb2pvIChwbGFpbiBvbGQgamF2YXNjcmlwdCBvYmplY3QpXG52YXIgaXNQbGFpbk9iamVjdCA9XG5leHBvcnRzLmlzUGxhaW5PYmplY3QgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIG9iaiAhPSBudWxsICYmIChvYmouY29uc3RydWN0b3IgPT09IE9iamVjdCB8fCBvYmouX19wcm90b19fID09PSBPYmplY3QucHJvdG90eXBlKTtcbn1cblxuLy8gdGVzdHMgZnVuY3Rpb24gYXMgYSBzdWJjbGFzcyBvZiBhIHBhcmVudCBmdW5jdGlvblxuLy8gaGVyZSwgYSBjbGFzcyBpcyB0ZWNobmljYWxseSBhIHN1YmNsYXNzIG9mIGl0c2VsZlxuZXhwb3J0cy5pc1N1YkNsYXNzID0gZnVuY3Rpb24ocGFyZW50LCBmbikge1xuXHRyZXR1cm4gZm4gPT09IHBhcmVudCB8fCAoZm4gIT0gbnVsbCAmJiBmbi5wcm90b3R5cGUgaW5zdGFuY2VvZiBwYXJlbnQpO1xufVxuXG4vLyBsaWtlIGpRdWVyeSdzIGVtcHR5KCksIHJlbW92ZXMgYWxsIGNoaWxkcmVuXG52YXIgZW1wdHlOb2RlID1cbmV4cG9ydHMuZW1wdHlOb2RlID0gZnVuY3Rpb24obm9kZSkge1xuXHR3aGlsZSAobm9kZS5sYXN0Q2hpbGQpIG5vZGUucmVtb3ZlQ2hpbGQobm9kZS5sYXN0Q2hpbGQpO1xuXHRyZXR1cm4gbm9kZTtcbn1cblxuLy8gY2xlYW5zIGh0bWwsIHRoZW4gY29udmVydHMgaHRtbCBlbnRpdGllcyB0byB1bmljb2RlXG5leHBvcnRzLmRlY29kZUVudGl0aWVzID0gKGZ1bmN0aW9uKCkge1xuXHRpZiAodHlwZW9mIGRvY3VtZW50ID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cblx0Ly8gdGhpcyBwcmV2ZW50cyBhbnkgb3ZlcmhlYWQgZnJvbSBjcmVhdGluZyB0aGUgb2JqZWN0IGVhY2ggdGltZVxuXHR2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHR2YXIgZW50aXR5ID0gLyYoPzojeFthLWYwLTldK3wjWzAtOV0rfFthLXowLTldKyk7Py9pZztcblxuXHRyZXR1cm4gZnVuY3Rpb24gZGVjb2RlSFRNTEVudGl0aWVzKHN0cikge1xuXHRcdHN0ciA9IHN0ci5yZXBsYWNlKGVudGl0eSwgZnVuY3Rpb24obSkge1xuXHRcdFx0ZWxlbWVudC5pbm5lckhUTUwgPSBtO1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ7XG5cdFx0fSk7XG5cblx0XHRlbXB0eU5vZGUoZWxlbWVudCk7XG5cblx0XHRyZXR1cm4gc3RyO1xuXHR9XG59KSgpO1xuXG4vLyBjb252ZXJ0IGh0bWwgaW50byBET00gbm9kZXNcbmV4cG9ydHMucGFyc2VIVE1MID0gKGZ1bmN0aW9uKCkge1xuXHRpZiAodHlwZW9mIGRvY3VtZW50ID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cblx0Ly8gdGhpcyBwcmV2ZW50cyBhbnkgb3ZlcmhlYWQgZnJvbSBjcmVhdGluZyB0aGUgb2JqZWN0IGVhY2ggdGltZVxuXHR2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdHJldHVybiBmdW5jdGlvbiBwYXJzZUhUTUwoaHRtbCkge1xuXHRcdGVsZW1lbnQuaW5uZXJIVE1MID0gaHRtbCAhPSBudWxsID8gaHRtbC50b1N0cmluZygpIDogXCJcIjtcblx0XHR2YXIgbm9kZXMgPSBfLnRvQXJyYXkoZWxlbWVudC5jaGlsZE5vZGVzKTtcblx0XHRlbXB0eU5vZGUoZWxlbWVudCk7XG5cdFx0cmV0dXJuIG5vZGVzO1xuXHR9XG59KSgpO1xuXG4vLyB0aGUgc3ViY2xhc3NpbmcgZnVuY3Rpb24gZm91bmQgaW4gQmFja2JvbmVcbnZhciBzdWJjbGFzcyA9XG5leHBvcnRzLnN1YmNsYXNzID0gZnVuY3Rpb24ocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcblx0dmFyIHBhcmVudCA9IHRoaXM7XG5cdHZhciBjaGlsZDtcblxuXHQvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG5cdC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuXHQvLyBieSB1cyB0byBzaW1wbHkgY2FsbCB0aGUgcGFyZW50J3MgY29uc3RydWN0b3IuXG5cdGlmIChwcm90b1Byb3BzICYmIF8uaGFzKHByb3RvUHJvcHMsICdjb25zdHJ1Y3RvcicpKSB7XG5cdFx0Y2hpbGQgPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuXHR9IGVsc2Uge1xuXHRcdGNoaWxkID0gZnVuY3Rpb24oKXsgcmV0dXJuIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9O1xuXHR9XG5cblx0Ly8gQWRkIHN0YXRpYyBwcm9wZXJ0aWVzIHRvIHRoZSBjb25zdHJ1Y3RvciBmdW5jdGlvbiwgaWYgc3VwcGxpZWQuXG5cdF8uZXh0ZW5kKGNoaWxkLCBwYXJlbnQsIHN0YXRpY1Byb3BzKTtcblxuXHQvLyBTZXQgdGhlIHByb3RvdHlwZSBjaGFpbiB0byBpbmhlcml0IGZyb20gYHBhcmVudGAsIHdpdGhvdXQgY2FsbGluZ1xuXHQvLyBgcGFyZW50YCdzIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLlxuXHR2YXIgU3Vycm9nYXRlID0gZnVuY3Rpb24oKXsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9O1xuXHRTdXJyb2dhdGUucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcblx0Y2hpbGQucHJvdG90eXBlID0gbmV3IFN1cnJvZ2F0ZTtcblxuXHQvLyBBZGQgcHJvdG90eXBlIHByb3BlcnRpZXMgKGluc3RhbmNlIHByb3BlcnRpZXMpIHRvIHRoZSBzdWJjbGFzcyxcblx0Ly8gaWYgc3VwcGxpZWQuXG5cdGlmIChwcm90b1Byb3BzKSBfLmV4dGVuZChjaGlsZC5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuXG5cdC8vIFNldCBhIGNvbnZlbmllbmNlIHByb3BlcnR5IGluIGNhc2UgdGhlIHBhcmVudCdzIHByb3RvdHlwZSBpcyBuZWVkZWRcblx0Ly8gbGF0ZXIuXG5cdGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cblx0cmV0dXJuIGNoaWxkO1xufVxuXG52YXIgbWF0Y2hlc1NlbGVjdG9yID0gdHlwZW9mIEVsZW1lbnQgIT09IFwidW5kZWZpbmVkXCIgP1xuXHRFbGVtZW50LnByb3RvdHlwZS5tYXRjaGVzIHx8XG5cdEVsZW1lbnQucHJvdG90eXBlLndlYmtpdE1hdGNoZXNTZWxlY3RvciB8fFxuXHRFbGVtZW50LnByb3RvdHlwZS5tb3pNYXRjaGVzU2VsZWN0b3IgfHxcblx0RWxlbWVudC5wcm90b3R5cGUubXNNYXRjaGVzU2VsZWN0b3IgOlxuXHRmdW5jdGlvbigpIHsgcmV0dXJuIGZhbHNlOyB9O1xuXG5leHBvcnRzLm1hdGNoZXNTZWxlY3RvciA9IGZ1bmN0aW9uKGVsZW0sIHNlbGVjdG9yKSB7XG5cdHJldHVybiBtYXRjaGVzU2VsZWN0b3IuY2FsbChlbGVtLCBzZWxlY3Rvcilcbn1cblxudmFyIG1hdGNoZXMgPSBleHBvcnRzLm1hdGNoZXMgPSBmdW5jdGlvbihub2RlLCBzZWxlY3Rvcikge1xuXHRpZiAoXy5pc0FycmF5KHNlbGVjdG9yKSkgcmV0dXJuIHNlbGVjdG9yLnNvbWUoZnVuY3Rpb24ocykge1xuXHRcdHJldHVybiBtYXRjaGVzKG5vZGUsIHMpO1xuXHR9KTtcblxuXHRpZiAoc2VsZWN0b3IgaW5zdGFuY2VvZiB3aW5kb3cuTm9kZSkge1xuXHRcdHJldHVybiBub2RlID09PSBzZWxlY3Rvcjtcblx0fVxuXHRcblx0aWYgKHR5cGVvZiBzZWxlY3RvciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0cmV0dXJuICEhc2VsZWN0b3Iobm9kZSk7XG5cdH1cblx0XG5cdGlmIChub2RlLm5vZGVUeXBlID09PSB3aW5kb3cuTm9kZS5FTEVNRU5UX05PREUpIHtcblx0XHRyZXR1cm4gbWF0Y2hlc1NlbGVjdG9yLmNhbGwobm9kZSwgc2VsZWN0b3IpO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuXG4vLyBhcnJheSB3cml0ZSBvcGVyYXRpb25zXG52YXIgbXV0YXRvck1ldGhvZHMgPSBbICdwb3AnLCAncHVzaCcsICdyZXZlcnNlJywgJ3NoaWZ0JywgJ3NvcnQnLCAnc3BsaWNlJywgJ3Vuc2hpZnQnIF07XG5cbi8vIHBhdGNoZXMgYW4gYXJyYXkgc28gd2UgY2FuIGxpc3RlbiB0byB3cml0ZSBvcGVyYXRpb25zXG52YXIgcGF0Y2hBcnJheSA9XG5leHBvcnRzLnBhdGNoQXJyYXkgPSBmdW5jdGlvbihhcnIpIHtcblx0aWYgKGFyci5fcGF0Y2hlZCkgcmV0dXJuIGFycjtcblx0XG5cdHZhciBwYXRjaGVkQXJyYXlQcm90byA9IFtdLFxuXHRcdG9ic2VydmVycyA9IFtdO1xuXG5cdG11dGF0b3JNZXRob2RzLmZvckVhY2goZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShwYXRjaGVkQXJyYXlQcm90bywgbWV0aG9kTmFtZSwge1xuXHRcdFx0dmFsdWU6IG1ldGhvZFxuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gbWV0aG9kKCkge1xuXHRcdFx0dmFyIHNwbGljZUVxdWl2YWxlbnQsIHN1bW1hcnksIGFyZ3MsIHJlcztcblxuXHRcdFx0YXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuXG5cdFx0XHQvLyBjb252ZXJ0IHRoZSBvcGVyYXRpb24gaW50byBhIHNwbGljZVxuXHRcdFx0c3BsaWNlRXF1aXZhbGVudCA9IGdldFNwbGljZUVxdWl2YWxlbnQodGhpcywgbWV0aG9kTmFtZSwgYXJncyk7XG5cdFx0XHRzdW1tYXJ5ID0gc3VtbWFyaXNlU3BsaWNlT3BlcmF0aW9uKHRoaXMsIHNwbGljZUVxdWl2YWxlbnQpO1xuXG5cdFx0XHQvLyBydW4gdGhlIGludGVuZGVkIG1ldGhvZFxuXHRcdFx0cmVzID0gQXJyYXkucHJvdG90eXBlW21ldGhvZE5hbWVdLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXG5cdFx0XHQvLyBjYWxsIHRoZSBvYmVyc3ZzZXJzXG5cdFx0XHRvYnNlcnZlcnMuZm9yRWFjaChmdW5jdGlvbihmbikge1xuXHRcdFx0XHRmbi5jYWxsKHRoaXMsIHN1bW1hcnkpO1xuXHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdC8vIHJldHVybiB0aGUgcmVzdWx0IG9mIHRoZSBtZXRob2Rcblx0XHRcdHJldHVybiByZXM7XG5cdFx0fTtcblx0fSk7XG5cblx0aWYgKCh7fSkuX19wcm90b19fKSBhcnIuX19wcm90b19fID0gcGF0Y2hlZEFycmF5UHJvdG87XG5cdGVsc2Uge1xuXHRcdG11dGF0b3JNZXRob2RzLmZvckVhY2goZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGFyciwgbWV0aG9kTmFtZSwge1xuXHRcdFx0XHR2YWx1ZTogcGF0Y2hlZEFycmF5UHJvdG9bbWV0aG9kTmFtZV0sXG5cdFx0XHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRfLmVhY2goe1xuXHRcdF9wYXRjaGVkOiB0cnVlLFxuXHRcdG9ic2VydmU6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiB0byBvYnNlcnZlIHdpdGguXCIpO1xuXHRcdFx0b2JzZXJ2ZXJzLnB1c2goZm4pO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblx0XHRzdG9wT2JzZXJ2aW5nOiBmdW5jdGlvbihmbikge1xuXHRcdFx0dmFyIGluZGV4ID0gb2JzZXJ2ZXJzLmluZGV4T2YoZm4pO1xuXHRcdFx0aWYgKGluZGV4ID4gLTEpIG9ic2VydmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHR9LCBmdW5jdGlvbih2LCBrKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGFyciwgaywge1xuXHRcdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdFx0dmFsdWU6IHYsXG5cdFx0XHR3cml0ZWFibGU6IGZhbHNlXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHJldHVybiBhcnI7XG59XG5cbi8vIGNvbnZlcnRzIGFycmF5IHdyaXRlIG9wZXJhdGlvbnMgaW50byBzcGxpY2UgZXF1aXZhbGVudCBhcmd1bWVudHNcbnZhciBnZXRTcGxpY2VFcXVpdmFsZW50ID1cbmV4cG9ydHMuZ2V0U3BsaWNlRXF1aXZhbGVudCA9IGZ1bmN0aW9uICggYXJyYXksIG1ldGhvZE5hbWUsIGFyZ3MgKSB7XG5cdHN3aXRjaCAoIG1ldGhvZE5hbWUgKSB7XG5cdFx0Y2FzZSAnc3BsaWNlJzpcblx0XHRcdHJldHVybiBhcmdzO1xuXG5cdFx0Y2FzZSAnc29ydCc6XG5cdFx0Y2FzZSAncmV2ZXJzZSc6XG5cdFx0XHRyZXR1cm4gbnVsbDtcblxuXHRcdGNhc2UgJ3BvcCc6XG5cdFx0XHRpZiAoIGFycmF5Lmxlbmd0aCApIHtcblx0XHRcdFx0cmV0dXJuIFsgLTEgXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXG5cdFx0Y2FzZSAncHVzaCc6XG5cdFx0XHRyZXR1cm4gWyBhcnJheS5sZW5ndGgsIDAgXS5jb25jYXQoIGFyZ3MgKTtcblxuXHRcdGNhc2UgJ3NoaWZ0Jzpcblx0XHRcdHJldHVybiBbIDAsIDEgXTtcblxuXHRcdGNhc2UgJ3Vuc2hpZnQnOlxuXHRcdFx0cmV0dXJuIFsgMCwgMCBdLmNvbmNhdCggYXJncyApO1xuXHR9XG59XG5cbi8vIHJldHVybnMgYSBzdW1tYXJ5IHBmIGhvdyBhbiBhcnJheSB3aWxsIGJlIGNoYW5nZWQgYWZ0ZXIgdGhlIHNwbGljZSBvcGVyYXRpb25cbnZhciBzdW1tYXJpc2VTcGxpY2VPcGVyYXRpb24gPVxuZXhwb3J0cy5zdW1tYXJpc2VTcGxpY2VPcGVyYXRpb24gPSBmdW5jdGlvbiAoIGFycmF5LCBhcmdzICkge1xuXHR2YXIgaW5kZXgsIGFkZGVkSXRlbXMsIHJlbW92ZWRJdGVtcztcblxuXHRpZiAoIWFyZ3MpIHJldHVybiBudWxsO1xuXG5cdC8vIGZpZ3VyZSBvdXQgd2hlcmUgdGhlIGNoYW5nZXMgc3RhcnRlZC4uLlxuXHRpbmRleCA9ICsoIGFyZ3NbMF0gPCAwID8gYXJyYXkubGVuZ3RoICsgYXJnc1swXSA6IGFyZ3NbMF0gKTtcblxuXHQvLyAuLi5hbmQgaG93IG1hbnkgaXRlbXMgd2VyZSBhZGRlZCB0byBvciByZW1vdmVkIGZyb20gdGhlIGFycmF5XG5cdGFkZGVkSXRlbXMgPSBNYXRoLm1heCggMCwgYXJncy5sZW5ndGggLSAyICk7XG5cdHJlbW92ZWRJdGVtcyA9ICggYXJnc1sxXSAhPT0gdW5kZWZpbmVkID8gYXJnc1sxXSA6IGFycmF5Lmxlbmd0aCAtIGluZGV4ICk7XG5cblx0Ly8gSXQncyBwb3NzaWJsZSB0byBkbyBlLmcuIFsgMSwgMiwgMyBdLnNwbGljZSggMiwgMiApIC0gaS5lLiB0aGUgc2Vjb25kIGFyZ3VtZW50XG5cdC8vIG1lYW5zIHJlbW92aW5nIG1vcmUgaXRlbXMgZnJvbSB0aGUgZW5kIG9mIHRoZSBhcnJheSB0aGFuIHRoZXJlIGFyZS4gSW4gdGhlc2Vcblx0Ly8gY2FzZXMgd2UgbmVlZCB0byBjdXJiIEphdmFTY3JpcHQncyBlbnRodXNpYXNtIG9yIHdlJ2xsIGdldCBvdXQgb2Ygc3luY1xuXHRyZW1vdmVkSXRlbXMgPSBNYXRoLm1pbiggcmVtb3ZlZEl0ZW1zLCBhcnJheS5sZW5ndGggLSBpbmRleCApO1xuXG5cdHJldHVybiB7XG5cdFx0aW5kZXg6IGluZGV4LFxuXHRcdGFkZGVkOiBhZGRlZEl0ZW1zLFxuXHRcdHJlbW92ZWQ6IHJlbW92ZWRJdGVtc1xuXHR9O1xufVxuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0VHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKSxcblx0RXZlbnRzID0gcmVxdWlyZShcIi4vZXZlbnRzXCIpLFxuXHR1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKSxcblx0TW9kZWwgPSByZXF1aXJlKFwiLi9tb2RlbFwiKSxcblx0UGx1Z2lucyA9IHJlcXVpcmUoXCIuL3BsdWdpbnNcIiksXG5cdERPTVJhbmdlID0gcmVxdWlyZShcIi4vZG9tcmFuZ2VcIik7XG5cbnZhciBWaWV3ID1cbm1vZHVsZS5leHBvcnRzID0gRE9NUmFuZ2UuZXh0ZW5kKHtcblxuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0Ly8gZmlyc3Qgd2UgY3JlYXRlIHRoZSBpbml0aWFsIHZpZXcgc3RhdGVcblx0XHR2YXIgc3RhdGUgPSBfLnJlc3VsdCh0aGlzLCBcImluaXRpYWxTdGF0ZVwiKSB8fCBfLnJlc3VsdCh0aGlzLCBcImRlZmF1bHRzXCIpO1xuXHRcdGlmICh0eXBlb2Ygc3RhdGUgIT09IFwidW5kZWZpbmVkXCIpIHtcblx0XHRcdGlmICghTW9kZWwuaXNNb2RlbChzdGF0ZSkpIHtcblx0XHRcdFx0c3RhdGUgPSBuZXcgTW9kZWwoc3RhdGUsIG51bGwsIG9wdGlvbnMuc3RhdGUpO1xuXHRcdFx0fVxuXHRcdFx0XG5cdFx0XHQvLyBzaG92ZSBzdGF0ZSBiZXR3ZWVuIGNvbnRleHRzXG5cdFx0XHRpZiAoTW9kZWwuaXNNb2RlbChkYXRhKSkge1xuXHRcdFx0XHRzdGF0ZS5wYXJlbnQgPSBkYXRhLnBhcmVudDtcblx0XHRcdFx0ZGF0YS5wYXJlbnQgPSBzdGF0ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYWRkIHRvIHRoZSBzdGFjayBiZWZvcmUgdGhlIHJlYWwgZGF0YVxuXHRcdFx0dGhpcy5hZGREYXRhKHN0YXRlKTtcblx0XHRcdHRoaXMuc3RhdGVNb2RlbCA9IHN0YXRlO1xuXG5cdFx0XHQvLyBzZXR1cCBlYXN5LWFjY2VzcyBzdGF0ZSBwcm9wZXJ0eVxuXHRcdFx0c3RhdGUuZGVmaW5lRGF0YUxpbmsodGhpcywgXCJzdGF0ZVwiKTtcblx0XHR9XG5cdFx0XG5cdFx0Ly8gYWRkIHBhcnRpYWxzXG5cdFx0dGhpcy5fcGFydGlhbHMgPSB7fTtcblx0XHR0aGlzLl9jb21wb25lbnRzID0ge307XG5cdFx0dGhpcy5zZXRQYXJ0aWFsKF8uZXh0ZW5kKHt9LCBvcHRpb25zLnBhcnRpYWxzLCBfLnJlc3VsdCh0aGlzLCBcInBhcnRpYWxzXCIpKSk7XG5cblx0XHQvLyBzZXQgdGhlIHBhc3NlZCBpbiBkYXRhXG5cdFx0aWYgKHR5cGVvZiBkYXRhICE9PSBcInVuZGVmaW5lZFwiKSB0aGlzLmFkZERhdGEoZGF0YSwgb3B0aW9ucyk7XG5cdFx0XG5cdFx0Ly8gcXVpY2sgYWNjZXNzIHRvIHRoZSB0b3AgbW9kZWwgZGF0YVxuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBcImRhdGFcIiwge1xuXHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlLFxuXHRcdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdHRoaXMubW9kZWwuX2RlcC5kZXBlbmQoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMubW9kZWwuZGF0YTtcblx0XHRcdH0sXG5cdFx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0XHR0aGlzLm1vZGVsLnNldCh2YWwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Ly8gaW5pdGlhdGUgbGlrZSBhIG5vcm1hbCBkb20gcmFuZ2Vcblx0XHRET01SYW5nZS5jYWxsKHRoaXMpO1xuXG5cdFx0Ly8gaW5pdGlhbGl6ZSB3aXRoIG9wdGlvbnNcblx0XHR0aGlzLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcblx0fSxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbigpe30sXG5cblx0dXNlOiBmdW5jdGlvbihwKSB7XG5cdFx0cmV0dXJuIFBsdWdpbnMubG9hZFBsdWdpbih0aGlzLCBwLCBfLnRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKSk7XG5cdH0sXG5cblx0Ly8gYWRkcyBkYXRhIHRvIHRoZSBjdXJyZW50IHN0YWNrXG5cdGFkZERhdGE6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRpZiAoIU1vZGVsLmlzTW9kZWwoZGF0YSkpIGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgdGhpcy5tb2RlbCwgb3B0aW9ucyk7XG5cdFx0dGhpcy5tb2RlbCA9IGRhdGE7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gYXR0YWNoICsgbW91bnRcblx0cGFpbnQ6IGZ1bmN0aW9uKHAsIG4sIF9pc01vdmUsIF9pc1JlcGxhY2UpIHtcblx0XHRET01SYW5nZS5wcm90b3R5cGUuYXR0YWNoLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKCEoX2lzTW92ZSB8fCBfaXNSZXBsYWNlIHx8IHRoaXMuaXNNb3VudGVkKCkpKSB0aGlzLm1vdW50KCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gYXV0byBzdG9wIG9uIGRldGFjaFxuXHRkZXRhY2g6IGZ1bmN0aW9uKF9pc1JlcGxhY2UpIHtcblx0XHRpZiAoIV9pc1JlcGxhY2UpIHRoaXMuc3RvcCgpO1xuXHRcdERPTVJhbmdlLnByb3RvdHlwZS5kZXRhY2guYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhdXRvcnVuOiBmdW5jdGlvbihmbiwgb25seU9uQWN0aXZlKSB7XG5cdFx0dmFyIGNvbXAgPSBUcmFja3IuYXV0b3J1bihmbiwgdGhpcyk7XG5cdFx0aWYgKG9ubHlPbkFjdGl2ZSAmJiAhVHJhY2tyLmFjdGl2ZSkgY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIGNvbXA7XG5cdH0sXG5cblx0Ly8gYSBnZW5lcmFsaXplZCByZWFjdGl2ZSB3b3JrZmxvdyBoZWxwZXJcblx0bW91bnQ6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyksIGNvbXA7XG5cblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHQvLyBzdG9wIGV4aXN0aW5nIG1vdW50XG5cdFx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdFx0Ly8gdGhlIGZpcnN0IGV2ZW50IGluIHRoZSBjeWNsZSwgYmVmb3JlIGV2ZXJ5dGhpbmcgZWxzZVxuXHRcdFx0dGhpcy5fbW91bnRpbmcgPSB0cnVlO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnQ6YmVmb3JlXCIsIGFyZ3MpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0Ly8gdGhlIGF1dG9ydW4gY29tcHV0YXRpb25cblx0XHRjb21wID0gdGhpcy5fY29tcCA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHR0aGlzLnJlbmRlci5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlclwiLCBhcmdzLCBjb21wKTtcblxuXHRcdFx0Ly8gYXV0byBjbGVhbiB1cFxuXHRcdFx0Y29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdC8vIHJlbWFpbmluZyBpbnZhbGlkYXRlIGV2ZW50c1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJpbnZhbGlkYXRlXCIsIGFyZ3MsIGNvbXApO1xuXG5cdFx0XHRcdC8vIGRldGVjdCBpZiB0aGUgY29tcHV0YXRpb24gc3RvcHBlZFxuXHRcdFx0XHRpZiAoY29tcC5zdG9wcGVkKSB7XG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyKFwic3RvcFwiLCBhcmdzKTtcblx0XHRcdFx0XHRkZWxldGUgdGhpcy5fY29tcDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyByZW1haW5pbmcgbW91bnQgZXZlbnRzIGhhcHBlbiBhZnRlciB0aGUgZmlyc3QgcmVuZGVyXG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnQ6YWZ0ZXJcIiwgYXJncywgY29tcCk7XG5cdFx0XHRkZWxldGUgdGhpcy5fbW91bnRpbmc7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW5kZXI6IGZ1bmN0aW9uKCl7fSxcblxuXHRpc01vdW50ZWQ6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmlzTW91bnRpbmcoKSB8fCB0aGlzLl9jb21wICE9IG51bGw7XG5cdH0sXG5cblx0aXNNb3VudGluZzogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5fbW91bnRpbmc7XG5cdH0sXG5cblx0Z2V0Q29tcHV0YXRpb246IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9jb21wO1xuXHR9LFxuXG5cdGludmFsaWRhdGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmlzTW91bnRlZCgpKSB0aGlzLl9jb21wLmludmFsaWRhdGUoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRvbkludmFsaWRhdGU6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0aWYgKHRoaXMuaXNNb3VudGVkKCkpIHRoaXMuX2NvbXAub25JbnZhbGlkYXRlKGZuKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRzdG9wOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5pc01vdW50ZWQoKSkgdGhpcy5fY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gc2V0cyBwYXJ0aWFsIGJ5IG5hbWVcblx0c2V0UGFydGlhbDogZnVuY3Rpb24obmFtZSwgcGFydGlhbCkge1xuXHRcdGlmIChfLmlzT2JqZWN0KG5hbWUpICYmIHBhcnRpYWwgPT0gbnVsbCkge1xuXHRcdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKHAsIG4pIHsgdGhpcy5zZXRQYXJ0aWFsKG4sIHApOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICghXy5pc1N0cmluZyhuYW1lKSAmJiBuYW1lICE9PSBcIlwiKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZm9yIHBhcnRpYWwgbmFtZS5cIik7XG5cblx0XHRpZiAocGFydGlhbCAhPSBudWxsICYmICF1dGlsLmlzU3ViQ2xhc3MoVmlldywgcGFydGlhbCkpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgVmlldyBzdWJjbGFzcyBvciBmdW5jdGlvbiBmb3IgcGFydGlhbC5cIik7XG5cblx0XHRpZiAocGFydGlhbCA9PSBudWxsKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fcGFydGlhbHNbbmFtZV07XG5cdFx0XHRwYXJ0aWFsID0gdm9pZCAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgcCA9IHRoaXMuX2dldFBhcnRpYWwobmFtZSk7XG5cdFx0XHRwLnZpZXcgPSBwYXJ0aWFsO1xuXHRcdFx0cC5kZXAuY2hhbmdlZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGVuc3VyZXMgYSBwYXJ0aWFsJ3MgZGVwZW5kZW5jeSBleGlzdHNcblx0X2dldFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRpZiAodGhpcy5fcGFydGlhbHNbbmFtZV0gPT0gbnVsbClcblx0XHRcdHRoaXMuX3BhcnRpYWxzW25hbWVdID0geyBkZXA6IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpIH07XG5cblx0XHRyZXR1cm4gdGhpcy5fcGFydGlhbHNbbmFtZV07XG5cdH0sXG5cblx0Ly8gbG9va3MgdGhyb3VnaCBwYXJlbnRzIGZvciBwYXJ0aWFsXG5cdGZpbmRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGMgPSB0aGlzLCBwO1xuXG5cdFx0d2hpbGUgKGMgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGMuX2dldFBhcnRpYWwgIT0gbnVsbCkge1xuXHRcdFx0XHRwID0gYy5fZ2V0UGFydGlhbChuYW1lKTtcblx0XHRcdFx0cC5kZXAuZGVwZW5kKCk7XG5cdFx0XHRcdGlmIChwLnZpZXcgIT0gbnVsbCkgcmV0dXJuIHAudmlldztcblx0XHRcdH1cblxuXHRcdFx0YyA9IGMucGFyZW50UmFuZ2U7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIGdlbmVyYXRlcyBhIG5ldyBjb21wb25lbnQgZnJvbSBhIFZpZXcgc3ViY2xhc3Mgb3IgcGFydGlhbCdzIG5hbWVcblx0cmVuZGVyUGFydGlhbDogZnVuY3Rpb24oa2xhc3MsIGN0eCwgb3B0aW9ucykge1xuXHRcdHZhciBjb21wcywgbmFtZTtcblxuXHRcdC8vIGxvb2sgdXAgdGhlIHBhcnRpYWwgYnkgbmFtZVxuXHRcdGlmICh0eXBlb2Yga2xhc3MgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdG5hbWUgPSBrbGFzcztcblx0XHRcdGtsYXNzID0gdGhpcy5maW5kUGFydGlhbChrbGFzcyk7XG5cdFx0fVxuXG5cdFx0Ly8gY2xhc3MgbXVzdCBiZSBhIHZpZXdcblx0XHRpZiAoIXV0aWwuaXNTdWJDbGFzcyhWaWV3LCBrbGFzcykpIHJldHVybiBudWxsO1xuXHRcdFxuXHRcdC8vIG5vcm1hbGl6ZSBjb250ZXh0XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cblx0XHQvLyBjcmVhdGUgaXQgbm9uLXJlYWN0aXZlbHlcblx0XHR2YXIgY29tcG9uZW50ID0gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBrbGFzcyhjdHgsIG9wdGlvbnMpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYWRkIGl0IHRvIHRoZSBsaXN0XG5cdFx0aWYgKG5hbWUpIHtcblx0XHRcdGNvbXBzID0gdGhpcy5fY29tcG9uZW50cztcblx0XHRcdGlmIChjb21wc1tuYW1lXSA9PSBudWxsKSBjb21wc1tuYW1lXSA9IFtdO1xuXHRcdFx0Y29tcHNbbmFtZV0ucHVzaChjb21wb25lbnQpO1xuXG5cdFx0XHQvLyBhdXRvIHJlbW92ZSB3aGVuIHRoZSBwYXJ0aWFsIGlzIFwic3RvcHBlZFwiXG5cdFx0XHRjb21wb25lbnQub25jZShcInN0b3BcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGNvbXBzW25hbWVdID0gXy53aXRob3V0KGNvbXBzW25hbWVdLCBjb21wb25lbnQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXBvbmVudDtcblx0fSxcblxuXHQvLyByZXR1cm5zIGZpcnN0IHJlbmRlcmVkIHBhcnRpYWwgYnkgbmFtZVxuXHRnZXRDb21wb25lbnQ6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgY29tcHMsIGNvbXAsIHJlcywgbiwgaTtcblxuXHRcdGNvbXBzID0gdGhpcy5fY29tcG9uZW50cztcblx0XHRpZiAoY29tcHNbbmFtZV0gIT0gbnVsbCAmJiBjb21wc1tuYW1lXS5sZW5ndGgpIHJldHVybiBjb21wc1tuYW1lXVswXTtcblxuXHRcdGZvciAobiBpbiBjb21wcykge1xuXHRcdFx0Zm9yIChpIGluIGNvbXBzW25dKSB7XG5cdFx0XHRcdGNvbXAgPSBjb21wc1tuXVtpXVxuXHRcdFx0XHRpZiAoIShjb21wIGluc3RhbmNlb2YgVmlldykpIGNvbnRpbnVlO1xuXHRcdFx0XHRyZXMgPSBjb21wLmdldENvbXBvbmVudChuYW1lKTtcblx0XHRcdFx0aWYgKHJlcyAhPSBudWxsKSByZXR1cm4gcmVzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdC8vIHJldHVybnMgYWxsIHJlbmRlcmVkIHBhcnRpYWxzIGJ5IG5hbWVcblx0Z2V0Q29tcG9uZW50czogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiBfLnJlZHVjZSh0aGlzLl9jb21wb25lbnRzLCBmdW5jdGlvbihtLCBjb21wcywgbikge1xuXHRcdFx0aWYgKG4gPT09IG5hbWUpIG0ucHVzaC5hcHBseShtLCBjb21wcyk7XG5cdFx0XHRcblx0XHRcdGNvbXBzLmZvckVhY2goZnVuY3Rpb24oYykge1xuXHRcdFx0XHRpZiAoYyBpbnN0YW5jZW9mIFZpZXcpIG0ucHVzaC5hcHBseShtLCBjLmdldENvbXBvbmVudHMobmFtZSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBtO1xuXHRcdH0sIFtdKTtcblx0fVxuXG59KTtcblxuLy8gY2hhaW5hYmxlIG1ldGhvZHMgdG8gcHJveHkgdG8gbW9kZWxcblsgXCJzZXRcIiwgXCJyZWdpc3RlclByb3h5XCIgXVxuLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG5cdFZpZXcucHJvdG90eXBlW21ldGhvZF0gPSBmdW5jdGlvbigpIHtcblx0XHR0aGlzLm1vZGVsW21ldGhvZF0uYXBwbHkodGhpcy5tb2RlbCwgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxufSk7XG5cbi8vIG1ldGhvZHMgdG8gcHJveHkgdG8gbW9kZWwgd2hpY2ggZG9uJ3QgcmV0dXJuIHRoaXNcblsgXCJnZXRcIiwgXCJnZXRMb2NhbFwiLCBcImdldFByb3h5QnlWYWx1ZVwiLCBcImdldE1vZGVsQXRPZmZzZXRcIixcbiAgXCJnZXRSb290TW9kZWxcIiwgXCJmaW5kTW9kZWxcIiwgXCJnZXRBbGxNb2RlbHNcIlxuXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuXHRWaWV3LnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxbbWV0aG9kXS5hcHBseSh0aGlzLm1vZGVsLCBhcmd1bWVudHMpO1xuXHR9XG59KTsiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IHRydWU7XG4gICAgdmFyIGN1cnJlbnRRdWV1ZTtcbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgdmFyIGkgPSAtMTtcbiAgICAgICAgd2hpbGUgKCsraSA8IGxlbikge1xuICAgICAgICAgICAgY3VycmVudFF1ZXVlW2ldKCk7XG4gICAgICAgIH1cbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBkcmFpbmluZyA9IGZhbHNlO1xufVxucHJvY2Vzcy5uZXh0VGljayA9IGZ1bmN0aW9uIChmdW4pIHtcbiAgICBxdWV1ZS5wdXNoKGZ1bik7XG4gICAgaWYgKCFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xucHJvY2Vzcy52ZXJzaW9uID0gJyc7IC8vIGVtcHR5IHN0cmluZyB0byBhdm9pZCByZWdleHAgaXNzdWVzXG5wcm9jZXNzLnZlcnNpb25zID0ge307XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBQYWNrYWdlIGRvY3MgYXQgaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlciAvL1xuLy8gTGFzdCBtZXJnZTogaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvYmxvYi9kMDdmZjhlOTljZmRlMjFjZjExM2RhMTNkMzVkMzg3YjBlZDMwOWEzL3BhY2thZ2VzL3RyYWNrZXIvdHJhY2tlci5qcyAvL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuLyoqXG4gKiBAbmFtZXNwYWNlIFRyYWNrclxuICogQHN1bW1hcnkgVGhlIG5hbWVzcGFjZSBmb3IgVHJhY2tyLXJlbGF0ZWQgbWV0aG9kcy5cbiAqL1xudmFyIFRyYWNrciA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWN0aXZlXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGVyZSBpcyBhIGN1cnJlbnQgY29tcHV0YXRpb24sIG1lYW5pbmcgdGhhdCBkZXBlbmRlbmNpZXMgb24gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIHdpbGwgYmUgdHJhY2tlZCBhbmQgcG90ZW50aWFsbHkgY2F1c2UgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gdG8gYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLmFjdGl2ZSA9IGZhbHNlO1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2N1cnJlbnRjb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLCBvciBgbnVsbGAgaWYgdGhlcmUgaXNuJ3Qgb25lLiAgVGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgdGhlIFtgVHJhY2tyLkNvbXB1dGF0aW9uYF0oI3RyYWNrZXJfY29tcHV0YXRpb24pIG9iamVjdCBjcmVhdGVkIGJ5IHRoZSBpbm5lcm1vc3QgYWN0aXZlIGNhbGwgdG8gYFRyYWNrci5hdXRvcnVuYCwgYW5kIGl0J3MgdGhlIGNvbXB1dGF0aW9uIHRoYXQgZ2FpbnMgZGVwZW5kZW5jaWVzIHdoZW4gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFyZSBhY2Nlc3NlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtUcmFja3IuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBudWxsO1xuXG52YXIgc2V0Q3VycmVudENvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGMpIHtcblx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IGM7XG5cdFRyYWNrci5hY3RpdmUgPSAhISBjO1xufTtcblxudmFyIF9kZWJ1Z0Z1bmMgPSBmdW5jdGlvbiAoKSB7XG5cdC8vIFdlIHdhbnQgdGhpcyBjb2RlIHRvIHdvcmsgd2l0aG91dCBNZXRlb3IsIGFuZCBhbHNvIHdpdGhvdXRcblx0Ly8gXCJjb25zb2xlXCIgKHdoaWNoIGlzIHRlY2huaWNhbGx5IG5vbi1zdGFuZGFyZCBhbmQgbWF5IGJlIG1pc3Npbmdcblx0Ly8gb24gc29tZSBicm93c2VyIHdlIGNvbWUgYWNyb3NzLCBsaWtlIGl0IHdhcyBvbiBJRSA3KS5cblx0Ly9cblx0Ly8gTGF6eSBldmFsdWF0aW9uIGJlY2F1c2UgYE1ldGVvcmAgZG9lcyBub3QgZXhpc3QgcmlnaHQgYXdheS4oPz8pXG5cdHJldHVybiAodHlwZW9mIE1ldGVvciAhPT0gXCJ1bmRlZmluZWRcIiA/IE1ldGVvci5fZGVidWcgOlxuXHRcdFx0XHRcdCgodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUubG9nID9cblx0XHRcdFx0XHQgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcblx0XHRcdFx0XHQgZnVuY3Rpb24gKCkge30pKTtcbn07XG5cbnZhciBfdGhyb3dPckxvZyA9IGZ1bmN0aW9uIChmcm9tLCBlKSB7XG5cdGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcblx0XHR0aHJvdyBlO1xuXHR9IGVsc2Uge1xuXHRcdHZhciBtZXNzYWdlQW5kU3RhY2s7XG5cdFx0aWYgKGUuc3RhY2sgJiYgZS5tZXNzYWdlKSB7XG5cdFx0XHR2YXIgaWR4ID0gZS5zdGFjay5pbmRleE9mKGUubWVzc2FnZSk7XG5cdFx0XHRpZiAoaWR4ID49IDAgJiYgaWR4IDw9IDEwKSAvLyBhbGxvdyBmb3IgXCJFcnJvcjogXCIgKGF0IGxlYXN0IDcpXG5cdFx0XHRcdG1lc3NhZ2VBbmRTdGFjayA9IGUuc3RhY2s7IC8vIG1lc3NhZ2UgaXMgcGFydCBvZiBlLnN0YWNrLCBhcyBpbiBDaHJvbWVcblx0XHRcdGVsc2Vcblx0XHRcdFx0bWVzc2FnZUFuZFN0YWNrID0gZS5tZXNzYWdlICtcblx0XHRcdFx0KGUuc3RhY2suY2hhckF0KDApID09PSAnXFxuJyA/ICcnIDogJ1xcbicpICsgZS5zdGFjazsgLy8gZS5nLiBTYWZhcmlcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWVzc2FnZUFuZFN0YWNrID0gZS5zdGFjayB8fCBlLm1lc3NhZ2U7XG5cdFx0fVxuXHRcdF9kZWJ1Z0Z1bmMoKShcIkV4Y2VwdGlvbiBmcm9tIFRyYWNrciBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIixcblx0XHRcdFx0XHRcdFx0XHQgbWVzc2FnZUFuZFN0YWNrKTtcblx0fVxufTtcblxuLy8gVGFrZXMgYSBmdW5jdGlvbiBgZmAsIGFuZCB3cmFwcyBpdCBpbiBhIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZGBcbi8vIGJsb2NrIGlmIHdlIGFyZSBydW5uaW5nIG9uIHRoZSBzZXJ2ZXIuIE9uIHRoZSBjbGllbnQsIHJldHVybnMgdGhlXG4vLyBvcmlnaW5hbCBmdW5jdGlvbiAoc2luY2UgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYCBpcyBhXG4vLyBuby1vcCkuIFRoaXMgaGFzIHRoZSBiZW5lZml0IG9mIG5vdCBhZGRpbmcgYW4gdW5uZWNlc3Nhcnkgc3RhY2tcbi8vIGZyYW1lIG9uIHRoZSBjbGllbnQuXG52YXIgd2l0aE5vWWllbGRzQWxsb3dlZCA9IGZ1bmN0aW9uIChmKSB7XG5cdGlmICgodHlwZW9mIE1ldGVvciA9PT0gJ3VuZGVmaW5lZCcpIHx8IE1ldGVvci5pc0NsaWVudCkge1xuXHRcdHJldHVybiBmO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBmdW5jdGlvbiAoKSB7XG5cdFx0XHR2YXIgYXJncyA9IGFyZ3VtZW50cztcblx0XHRcdE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0Zi5hcHBseShudWxsLCBhcmdzKTtcblx0XHRcdH0pO1xuXHRcdH07XG5cdH1cbn07XG5cbnZhciBuZXh0SWQgPSAxO1xuLy8gY29tcHV0YXRpb25zIHdob3NlIGNhbGxiYWNrcyB3ZSBzaG91bGQgY2FsbCBhdCBmbHVzaCB0aW1lXG52YXIgcGVuZGluZ0NvbXB1dGF0aW9ucyA9IFtdO1xuLy8gYHRydWVgIGlmIGEgVHJhY2tyLmZsdXNoIGlzIHNjaGVkdWxlZCwgb3IgaWYgd2UgYXJlIGluIFRyYWNrci5mbHVzaCBub3dcbnZhciB3aWxsRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgaW4gVHJhY2tyLmZsdXNoIG5vd1xudmFyIGluRmx1c2ggPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB3ZSBhcmUgY29tcHV0aW5nIGEgY29tcHV0YXRpb24gbm93LCBlaXRoZXIgZmlyc3QgdGltZVxuLy8gb3IgcmVjb21wdXRlLiAgVGhpcyBtYXRjaGVzIFRyYWNrci5hY3RpdmUgdW5sZXNzIHdlIGFyZSBpbnNpZGVcbi8vIFRyYWNrci5ub25yZWFjdGl2ZSwgd2hpY2ggbnVsbGZpZXMgY3VycmVudENvbXB1dGF0aW9uIGV2ZW4gdGhvdWdoXG4vLyBhbiBlbmNsb3NpbmcgY29tcHV0YXRpb24gbWF5IHN0aWxsIGJlIHJ1bm5pbmcuXG52YXIgaW5Db21wdXRlID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgdGhlIGBfdGhyb3dGaXJzdEVycm9yYCBvcHRpb24gd2FzIHBhc3NlZCBpbiB0byB0aGUgY2FsbFxuLy8gdG8gVHJhY2tyLmZsdXNoIHRoYXQgd2UgYXJlIGluLiBXaGVuIHNldCwgdGhyb3cgcmF0aGVyIHRoYW4gbG9nIHRoZVxuLy8gZmlyc3QgZXJyb3IgZW5jb3VudGVyZWQgd2hpbGUgZmx1c2hpbmcuIEJlZm9yZSB0aHJvd2luZyB0aGUgZXJyb3IsXG4vLyBmaW5pc2ggZmx1c2hpbmcgKGZyb20gYSBmaW5hbGx5IGJsb2NrKSwgbG9nZ2luZyBhbnkgc3Vic2VxdWVudFxuLy8gZXJyb3JzLlxudmFyIHRocm93Rmlyc3RFcnJvciA9IGZhbHNlO1xuXG52YXIgYWZ0ZXJGbHVzaENhbGxiYWNrcyA9IFtdO1xuXG4vLyBsb29rIGZvciBhIHJlcXVlc3RBbmltYXRpb25GcmFtZSBhcyB0aGF0IGlzIHByZWZlcmFibGUgb3ZlciBuZXh0VGljayBvciBzZXRJbW1lZGlhdGVcbnZhciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID9cblx0d2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSB8fFxuXHR3aW5kb3cubW96UmVxdWVzdEFuaW1hdGlvbkZyYW1lIHx8XG5cdHdpbmRvdy53ZWJraXRSZXF1ZXN0QW5pbWF0aW9uRnJhbWUgfHxcblx0d2luZG93Lm9SZXF1ZXN0QW5pbWF0aW9uRnJhbWUgOlxuXHRudWxsO1xuXG4vLyBjb250cm9scyB0aGUgZGVmZXJyYWxcblRyYWNrci5uZXh0VGljayA9IHJlcXVlc3RBbmltYXRpb25GcmFtZSAhPSBudWxsID8gcmVxdWVzdEFuaW1hdGlvbkZyYW1lLmJpbmQod2luZG93KSA6XG5cdHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiID8gcHJvY2Vzcy5uZXh0VGljayA6XG5cdGZ1bmN0aW9uIChmKSB7IHNldFRpbWVvdXQoZiwgMTYpOyB9O1xuXG52YXIgcmVxdWlyZUZsdXNoID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoISB3aWxsRmx1c2gpIHtcblx0XHRUcmFja3IubmV4dFRpY2soVHJhY2tyLmZsdXNoKTtcblx0XHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR9XG59O1xuXG4vLyBUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBBIENvbXB1dGF0aW9uIG9iamVjdCByZXByZXNlbnRzIGNvZGUgdGhhdCBpcyByZXBlYXRlZGx5IHJlcnVuXG4gKiBpbiByZXNwb25zZSB0b1xuICogcmVhY3RpdmUgZGF0YSBjaGFuZ2VzLiBDb21wdXRhdGlvbnMgZG9uJ3QgaGF2ZSByZXR1cm4gdmFsdWVzOyB0aGV5IGp1c3RcbiAqIHBlcmZvcm0gYWN0aW9ucywgc3VjaCBhcyByZXJlbmRlcmluZyBhIHRlbXBsYXRlIG9uIHRoZSBzY3JlZW4uIENvbXB1dGF0aW9uc1xuICogYXJlIGNyZWF0ZWQgdXNpbmcgVHJhY2tyLmF1dG9ydW4uIFVzZSBzdG9wIHRvIHByZXZlbnQgZnVydGhlciByZXJ1bm5pbmcgb2YgYVxuICogY29tcHV0YXRpb24uXG4gKiBAaW5zdGFuY2VuYW1lIGNvbXB1dGF0aW9uXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQsIGN0eCkge1xuXHRpZiAoISBjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbilcblx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcIlRyYWNrci5Db21wdXRhdGlvbiBjb25zdHJ1Y3RvciBpcyBwcml2YXRlOyB1c2UgVHJhY2tyLmF1dG9ydW5cIik7XG5cdGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX3N0b3BwZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWUgIHN0b3BwZWRcblx0ICovXG5cdHNlbGYuc3RvcHBlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVkXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBjb21wdXRhdGlvbiBoYXMgYmVlbiBpbnZhbGlkYXRlZCAoYW5kIG5vdCB5ZXQgcmVydW4pLCBvciBpZiBpdCBoYXMgYmVlbiBzdG9wcGVkLlxuXHQgKiBAbG9jdXMgQ2xpZW50XG5cdCAqIEBtZW1iZXJPZiBUcmFja3IuQ29tcHV0YXRpb25cblx0ICogQGluc3RhbmNlXG5cdCAqIEBuYW1lICBpbnZhbGlkYXRlZFxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHQvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9maXJzdHJ1blxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGR1cmluZyB0aGUgaW5pdGlhbCBydW4gb2YgdGhlIGNvbXB1dGF0aW9uIGF0IHRoZSB0aW1lIGBUcmFja3IuYXV0b3J1bmAgaXMgY2FsbGVkLCBhbmQgZmFsc2Ugb24gc3Vic2VxdWVudCByZXJ1bnMgYW5kIGF0IG90aGVyIHRpbWVzLlxuXHQgKiBAbG9jdXMgQ2xpZW50XG5cdCAqIEBtZW1iZXJPZiBUcmFja3IuQ29tcHV0YXRpb25cblx0ICogQGluc3RhbmNlXG5cdCAqIEBuYW1lICBmaXJzdFJ1blxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHNlbGYuZmlyc3RSdW4gPSB0cnVlO1xuXG5cdHNlbGYuX2lkID0gbmV4dElkKys7XG5cdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHQvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG5cdC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuXHRzZWxmLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdHNlbGYuX2Z1bmMgPSBmO1xuXHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHRzZWxmLl9jb250ZXh0ID0gY3R4IHx8IG51bGw7XG5cblx0dmFyIGVycm9yZWQgPSB0cnVlO1xuXHR0cnkge1xuXHRcdHNlbGYuX2NvbXB1dGUoKTtcblx0XHRlcnJvcmVkID0gZmFsc2U7XG5cdH0gZmluYWxseSB7XG5cdFx0c2VsZi5maXJzdFJ1biA9IGZhbHNlO1xuXHRcdGlmIChlcnJvcmVkKVxuXHRcdFx0c2VsZi5zdG9wKCk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBgY2FsbGJhY2tgIHRvIHJ1biB3aGVuIHRoaXMgY29tcHV0YXRpb24gaXMgbmV4dCBpbnZhbGlkYXRlZCwgb3IgcnVucyBpdCBpbW1lZGlhdGVseSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYWxyZWFkeSBpbnZhbGlkYXRlZC4gIFRoZSBjYWxsYmFjayBpcyBydW4gZXhhY3RseSBvbmNlIGFuZCBub3QgdXBvbiBmdXR1cmUgaW52YWxpZGF0aW9ucyB1bmxlc3MgYG9uSW52YWxpZGF0ZWAgaXMgY2FsbGVkIGFnYWluIGFmdGVyIHRoZSBjb21wdXRhdGlvbiBiZWNvbWVzIHZhbGlkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGludmFsaWRhdGlvbi4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgaW52YWxpZGF0ZWQuXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGZ1bmN0aW9uXCIpO1xuXG5cdGlmIChzZWxmLmludmFsaWRhdGVkKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggIT09IHZvaWQgMCA/IGN0eCA6IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcy5wdXNoKHsgZm46IGYsIGN0eDogY3R4IH0pO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgSW52YWxpZGF0ZXMgdGhpcyBjb21wdXRhdGlvbiBzbyB0aGF0IGl0IHdpbGwgYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuaW52YWxpZGF0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRpZiAoISBzZWxmLmludmFsaWRhdGVkKSB7XG5cdFx0Ly8gaWYgd2UncmUgY3VycmVudGx5IGluIF9yZWNvbXB1dGUoKSwgZG9uJ3QgZW5xdWV1ZVxuXHRcdC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuXHRcdGlmICghIHNlbGYuX3JlY29tcHV0aW5nICYmICEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0XHRyZXF1aXJlRmx1c2goKTtcblx0XHRcdHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcblx0XHR9XG5cblx0XHRzZWxmLmludmFsaWRhdGVkID0gdHJ1ZTtcblxuXHRcdC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG5cdFx0Ly8gc2VsZi5pbnZhbGlkYXRlZCA9PT0gdHJ1ZS5cblx0XHRmb3IodmFyIGkgPSAwLCBmOyBmID0gc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzW2ldOyBpKyspIHtcblx0XHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZi5mbikuY2FsbChmLmN0eCAhPT0gdm9pZCAwID8gZi5jdHggOiBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuXG4vKipcbiAqIEBzdW1tYXJ5IFByZXZlbnRzIHRoaXMgY29tcHV0YXRpb24gZnJvbSByZXJ1bm5pbmcuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcblx0aWYgKCEgdGhpcy5zdG9wcGVkKSB7XG5cdFx0dGhpcy5zdG9wcGVkID0gdHJ1ZTtcblx0XHR0aGlzLmludmFsaWRhdGUoKTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHNlbGYpO1xuXHR2YXIgcHJldmlvdXNJbkNvbXB1dGUgPSBpbkNvbXB1dGU7XG5cdGluQ29tcHV0ZSA9IHRydWU7XG5cdHRyeSB7XG5cdFx0d2l0aE5vWWllbGRzQWxsb3dlZChzZWxmLl9mdW5jKS5jYWxsKHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG5cdFx0aW5Db21wdXRlID0gcHJldmlvdXNJbkNvbXB1dGU7XG5cdH1cbn07XG5cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuX3JlY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdHNlbGYuX3JlY29tcHV0aW5nID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAoc2VsZi5pbnZhbGlkYXRlZCAmJiAhIHNlbGYuc3RvcHBlZCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRfdGhyb3dPckxvZyhcInJlY29tcHV0ZVwiLCBlKTtcblx0XHRcdH1cblx0XHRcdC8vIElmIF9jb21wdXRlKCkgaW52YWxpZGF0ZWQgdXMsIHdlIHJ1biBhZ2FpbiBpbW1lZGlhdGVseS5cblx0XHRcdC8vIEEgY29tcHV0YXRpb24gdGhhdCBpbnZhbGlkYXRlcyBpdHNlbGYgaW5kZWZpbml0ZWx5IGlzIGFuXG5cdFx0XHQvLyBpbmZpbml0ZSBsb29wLCBvZiBjb3Vyc2UuXG5cdFx0XHQvL1xuXHRcdFx0Ly8gV2UgY291bGQgcHV0IGFuIGl0ZXJhdGlvbiBjb3VudGVyIGhlcmUgYW5kIGNhdGNoIHJ1bi1hd2F5XG5cdFx0XHQvLyBsb29wcy5cblx0XHR9XG5cdH0gZmluYWxseSB7XG5cdFx0c2VsZi5fcmVjb21wdXRpbmcgPSBmYWxzZTtcblx0fVxufTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZGVwZW5kZW5jeVxuXG4vKipcbiAqIEBzdW1tYXJ5IEEgRGVwZW5kZW5jeSByZXByZXNlbnRzIGFuIGF0b21pYyB1bml0IG9mIHJlYWN0aXZlIGRhdGEgdGhhdCBhXG4gKiBjb21wdXRhdGlvbiBtaWdodCBkZXBlbmQgb24uIFJlYWN0aXZlIGRhdGEgc291cmNlcyBzdWNoIGFzIFNlc3Npb24gb3JcbiAqIE1pbmltb25nbyBpbnRlcm5hbGx5IGNyZWF0ZSBkaWZmZXJlbnQgRGVwZW5kZW5jeSBvYmplY3RzIGZvciBkaWZmZXJlbnRcbiAqIHBpZWNlcyBvZiBkYXRhLCBlYWNoIG9mIHdoaWNoIG1heSBiZSBkZXBlbmRlZCBvbiBieSBtdWx0aXBsZSBjb21wdXRhdGlvbnMuXG4gKiBXaGVuIHRoZSBkYXRhIGNoYW5nZXMsIHRoZSBjb21wdXRhdGlvbnMgYXJlIGludmFsaWRhdGVkLlxuICogQGNsYXNzXG4gKiBAaW5zdGFuY2VOYW1lIGRlcGVuZGVuY3lcbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kgPSBmdW5jdGlvbiAoKSB7XG5cdHRoaXMuX2RlcGVuZGVudHNCeUlkID0ge307XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2RlcGVuZFxuLy9cbi8vIEFkZHMgYGNvbXB1dGF0aW9uYCB0byB0aGlzIHNldCBpZiBpdCBpcyBub3QgYWxyZWFkeVxuLy8gcHJlc2VudC4gIFJldHVybnMgdHJ1ZSBpZiBgY29tcHV0YXRpb25gIGlzIGEgbmV3IG1lbWJlciBvZiB0aGUgc2V0LlxuLy8gSWYgbm8gYXJndW1lbnQsIGRlZmF1bHRzIHRvIGN1cnJlbnRDb21wdXRhdGlvbiwgb3IgZG9lcyBub3RoaW5nXG4vLyBpZiB0aGVyZSBpcyBubyBjdXJyZW50Q29tcHV0YXRpb24uXG5cbi8qKlxuICogQHN1bW1hcnkgRGVjbGFyZXMgdGhhdCB0aGUgY3VycmVudCBjb21wdXRhdGlvbiAob3IgYGZyb21Db21wdXRhdGlvbmAgaWYgZ2l2ZW4pIGRlcGVuZHMgb24gYGRlcGVuZGVuY3lgLiAgVGhlIGNvbXB1dGF0aW9uIHdpbGwgYmUgaW52YWxpZGF0ZWQgdGhlIG5leHQgdGltZSBgZGVwZW5kZW5jeWAgY2hhbmdlcy5cblxuSWYgdGhlcmUgaXMgbm8gY3VycmVudCBjb21wdXRhdGlvbiBhbmQgYGRlcGVuZCgpYCBpcyBjYWxsZWQgd2l0aCBubyBhcmd1bWVudHMsIGl0IGRvZXMgbm90aGluZyBhbmQgcmV0dXJucyBmYWxzZS5cblxuUmV0dXJucyB0cnVlIGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhIG5ldyBkZXBlbmRlbnQgb2YgYGRlcGVuZGVuY3lgIHJhdGhlciB0aGFuIGFuIGV4aXN0aW5nIG9uZS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7VHJhY2tyLkNvbXB1dGF0aW9ufSBbZnJvbUNvbXB1dGF0aW9uXSBBbiBvcHRpb25hbCBjb21wdXRhdGlvbiBkZWNsYXJlZCB0byBkZXBlbmQgb24gYGRlcGVuZGVuY3lgIGluc3RlYWQgb2YgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24uXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmRlcGVuZCA9IGZ1bmN0aW9uIChjb21wdXRhdGlvbikge1xuXHRpZiAoISBjb21wdXRhdGlvbikge1xuXHRcdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cblx0XHRjb21wdXRhdGlvbiA9IFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb247XG5cdH1cblx0dmFyIHNlbGYgPSB0aGlzO1xuXHR2YXIgaWQgPSBjb21wdXRhdGlvbi5faWQ7XG5cdGlmICghIChpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZCkpIHtcblx0XHRzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0gPSBjb21wdXRhdGlvbjtcblx0XHRjb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuXHRcdFx0ZGVsZXRlIHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2NoYW5nZWRcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlIGFsbCBkZXBlbmRlbnQgY29tcHV0YXRpb25zIGltbWVkaWF0ZWx5IGFuZCByZW1vdmUgdGhlbSBhcyBkZXBlbmRlbnRzLlxuICogQGxvY3VzIENsaWVudFxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuY2hhbmdlZCA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRmb3IgKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcblx0XHRzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF0uaW52YWxpZGF0ZSgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9oYXNkZXBlbmRlbnRzXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIERlcGVuZGVuY3kgaGFzIG9uZSBvciBtb3JlIGRlcGVuZGVudCBDb21wdXRhdGlvbnMsIHdoaWNoIHdvdWxkIGJlIGludmFsaWRhdGVkIGlmIHRoaXMgRGVwZW5kZW5jeSB3ZXJlIHRvIGNoYW5nZS5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuaGFzRGVwZW5kZW50cyA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRmb3IodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuXHRcdHJldHVybiB0cnVlO1xuXHRyZXR1cm4gZmFsc2U7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2ZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgUHJvY2VzcyBhbGwgcmVhY3RpdmUgdXBkYXRlcyBpbW1lZGlhdGVseSBhbmQgZW5zdXJlIHRoYXQgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBhcmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5mbHVzaCA9IGZ1bmN0aW9uIChfb3B0cykge1xuXHQvLyBYWFggV2hhdCBwYXJ0IG9mIHRoZSBjb21tZW50IGJlbG93IGlzIHN0aWxsIHRydWU/IChXZSBubyBsb25nZXJcblx0Ly8gaGF2ZSBTcGFyaylcblx0Ly9cblx0Ly8gTmVzdGVkIGZsdXNoIGNvdWxkIHBsYXVzaWJseSBoYXBwZW4gaWYsIHNheSwgYSBmbHVzaCBjYXVzZXNcblx0Ly8gRE9NIG11dGF0aW9uLCB3aGljaCBjYXVzZXMgYSBcImJsdXJcIiBldmVudCwgd2hpY2ggcnVucyBhblxuXHQvLyBhcHAgZXZlbnQgaGFuZGxlciB0aGF0IGNhbGxzIFRyYWNrci5mbHVzaC4gIEF0IHRoZSBtb21lbnRcblx0Ly8gU3BhcmsgYmxvY2tzIGV2ZW50IGhhbmRsZXJzIGR1cmluZyBET00gbXV0YXRpb24gYW55d2F5LFxuXHQvLyBiZWNhdXNlIHRoZSBMaXZlUmFuZ2UgdHJlZSBpc24ndCB2YWxpZC4gIEFuZCB3ZSBkb24ndCBoYXZlXG5cdC8vIGFueSB1c2VmdWwgbm90aW9uIG9mIGEgbmVzdGVkIGZsdXNoLlxuXHQvL1xuXHQvLyBodHRwczovL2FwcC5hc2FuYS5jb20vMC8xNTk5MDgzMzAyNDQvMzg1MTM4MjMzODU2XG5cdGlmIChpbkZsdXNoKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNhbGwgVHJhY2tyLmZsdXNoIHdoaWxlIGZsdXNoaW5nXCIpO1xuXG5cdGlmIChpbkNvbXB1dGUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmx1c2ggaW5zaWRlIFRyYWNrci5hdXRvcnVuXCIpO1xuXG5cdGluRmx1c2ggPSB0cnVlO1xuXHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR0aHJvd0ZpcnN0RXJyb3IgPSAhISAoX29wdHMgJiYgX29wdHMuX3Rocm93Rmlyc3RFcnJvcik7XG5cblx0dmFyIGZpbmlzaGVkVHJ5ID0gZmFsc2U7XG5cdHRyeSB7XG5cdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8XG5cdFx0XHRcdFx0IGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cblx0XHRcdC8vIHJlY29tcHV0ZSBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnNcblx0XHRcdHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR2YXIgY29tcCA9IHBlbmRpbmdDb21wdXRhdGlvbnMuc2hpZnQoKTtcblx0XHRcdFx0Y29tcC5fcmVjb21wdXRlKCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhZnRlckZsdXNoQ2FsbGJhY2tzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBjYWxsIG9uZSBhZnRlckZsdXNoIGNhbGxiYWNrLCB3aGljaCBtYXlcblx0XHRcdFx0Ly8gaW52YWxpZGF0ZSBtb3JlIGNvbXB1dGF0aW9uc1xuXHRcdFx0XHR2YXIgY2IgPSBhZnRlckZsdXNoQ2FsbGJhY2tzLnNoaWZ0KCk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y2IuZm4uY2FsbChjYi5jdHgpO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0X3Rocm93T3JMb2coXCJhZnRlckZsdXNoXCIsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZpbmlzaGVkVHJ5ID0gdHJ1ZTtcblx0fSBmaW5hbGx5IHtcblx0XHRpZiAoISBmaW5pc2hlZFRyeSkge1xuXHRcdFx0Ly8gd2UncmUgZXJyb3Jpbmdcblx0XHRcdGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBUcmFja3IuZmx1c2goKWAgYWdhaW5cblx0XHRcdFRyYWNrci5mbHVzaCh7X3Rocm93Rmlyc3RFcnJvcjogZmFsc2V9KTsgLy8gZmluaXNoIGZsdXNoaW5nXG5cdFx0fVxuXHRcdHdpbGxGbHVzaCA9IGZhbHNlO1xuXHRcdGluRmx1c2ggPSBmYWxzZTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hdXRvcnVuXG4vL1xuLy8gUnVuIGYoKS4gUmVjb3JkIGl0cyBkZXBlbmRlbmNpZXMuIFJlcnVuIGl0IHdoZW5ldmVyIHRoZVxuLy8gZGVwZW5kZW5jaWVzIGNoYW5nZS5cbi8vXG4vLyBSZXR1cm5zIGEgbmV3IENvbXB1dGF0aW9uLCB3aGljaCBpcyBhbHNvIHBhc3NlZCB0byBmLlxuLy9cbi8vIExpbmtzIHRoZSBjb21wdXRhdGlvbiB0byB0aGUgY3VycmVudCBjb21wdXRhdGlvblxuLy8gc28gdGhhdCBpdCBpcyBzdG9wcGVkIGlmIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIGlzIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIG5vdyBhbmQgcmVydW4gaXQgbGF0ZXIgd2hlbmV2ZXIgaXRzIGRlcGVuZGVuY2llcyBjaGFuZ2UuIFJldHVybnMgYSBDb21wdXRhdGlvbiBvYmplY3QgdGhhdCBjYW4gYmUgdXNlZCB0byBzdG9wIG9yIG9ic2VydmUgdGhlIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHJ1bkZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1bi4gSXQgcmVjZWl2ZXMgb25lIGFyZ3VtZW50OiB0aGUgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgd2lsbCBiZSByZXR1cm5lZC5cbiAqIEByZXR1cm5zIHtUcmFja3IuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrci5hdXRvcnVuID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdUcmFja3IuYXV0b3J1biByZXF1aXJlcyBhIGZ1bmN0aW9uIGFyZ3VtZW50Jyk7XG5cblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuXHR2YXIgYyA9IG5ldyBUcmFja3IuQ29tcHV0YXRpb24oZiwgVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiwgY3R4KTtcblxuXHRpZiAoVHJhY2tyLmFjdGl2ZSlcblx0XHRUcmFja3Iub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcblx0XHRcdGMuc3RvcCgpO1xuXHRcdH0pO1xuXG5cdHJldHVybiBjO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9ub25yZWFjdGl2ZVxuLy9cbi8vIFJ1biBgZmAgd2l0aCBubyBjdXJyZW50IGNvbXB1dGF0aW9uLCByZXR1cm5pbmcgdGhlIHJldHVybiB2YWx1ZVxuLy8gb2YgYGZgLiAgVXNlZCB0byB0dXJuIG9mZiByZWFjdGl2aXR5IGZvciB0aGUgZHVyYXRpb24gb2YgYGZgLFxuLy8gc28gdGhhdCByZWFjdGl2ZSBkYXRhIHNvdXJjZXMgYWNjZXNzZWQgYnkgYGZgIHdpbGwgbm90IHJlc3VsdCBpbiBhbnlcbi8vIGNvbXB1dGF0aW9ucyBiZWluZyBpbnZhbGlkYXRlZC5cblxuLyoqXG4gKiBAc3VtbWFyeSBSdW4gYSBmdW5jdGlvbiB3aXRob3V0IHRyYWNraW5nIGRlcGVuZGVuY2llcy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZ1bmMgQSBmdW5jdGlvbiB0byBjYWxsIGltbWVkaWF0ZWx5LlxuICovXG5UcmFja3Iubm9uUmVhY3RpdmUgPSBcblRyYWNrci5ub25yZWFjdGl2ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuXHR0cnkge1xuXHRcdHJldHVybiBmLmNhbGwoY3R4KTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuXHR9XG59O1xuXG4vLyBsaWtlIG5vbnJlYWN0aXZlIGJ1dCBtYWtlcyBhIGZ1bmN0aW9uIGluc3RlYWRcblRyYWNrci5ub25SZWFjdGFibGUgPSBcblRyYWNrci5ub25yZWFjdGFibGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHR2YXIgYXJncyA9IGFyZ3VtZW50cztcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0cmV0dXJuIFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBmLmFwcGx5KGN0eCwgYXJncyk7XG5cdFx0fSk7XG5cdH07XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBhIG5ldyBbYG9uSW52YWxpZGF0ZWBdKCNjb21wdXRhdGlvbl9vbmludmFsaWRhdGUpIGNhbGxiYWNrIG9uIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uICh3aGljaCBtdXN0IGV4aXN0KSwgdG8gYmUgY2FsbGVkIGltbWVkaWF0ZWx5IHdoZW4gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQgb3Igc3RvcHBlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGludm9rZWQgYXMgYGZ1bmMoYylgLCB3aGVyZSBgY2AgaXMgdGhlIGNvbXB1dGF0aW9uIG9uIHdoaWNoIHRoZSBjYWxsYmFjayBpcyByZWdpc3RlcmVkLlxuICovXG5UcmFja3Iub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRpZiAoISBUcmFja3IuYWN0aXZlKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIlRyYWNrci5vbkludmFsaWRhdGUgcmVxdWlyZXMgYSBjdXJyZW50Q29tcHV0YXRpb25cIik7XG5cblx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZiwgY3R4KTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWZ0ZXJmbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFNjaGVkdWxlcyBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBkdXJpbmcgdGhlIG5leHQgZmx1c2gsIG9yIGxhdGVyIGluIHRoZSBjdXJyZW50IGZsdXNoIGlmIG9uZSBpcyBpbiBwcm9ncmVzcywgYWZ0ZXIgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBoYXZlIGJlZW4gcmVydW4uICBUaGUgZnVuY3Rpb24gd2lsbCBiZSBydW4gb25jZSBhbmQgbm90IG9uIHN1YnNlcXVlbnQgZmx1c2hlcyB1bmxlc3MgYGFmdGVyRmx1c2hgIGlzIGNhbGxlZCBhZ2Fpbi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gY2FsbCBhdCBmbHVzaCB0aW1lLlxuICovXG5UcmFja3IuYWZ0ZXJGbHVzaCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0YWZ0ZXJGbHVzaENhbGxiYWNrcy5wdXNoKHsgZm46IGYsIGN0eDogY3R4IH0pO1xuXHRyZXF1aXJlRmx1c2goKTtcbn07XG59KS5jYWxsKHRoaXMscmVxdWlyZSgnX3Byb2Nlc3MnKSlcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb24vanNvbjtjaGFyc2V0OnV0Zi04O2Jhc2U2NCxleUoyWlhKemFXOXVJam96TENKemIzVnlZMlZ6SWpwYkltNXZaR1ZmYlc5a2RXeGxjeTkwY21GamEzSXZkSEpoWTJ0eUxtcHpJbDBzSW01aGJXVnpJanBiWFN3aWJXRndjR2x1WjNNaU9pSTdRVUZCUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFTSXNJbVpwYkdVaU9pSm5aVzVsY21GMFpXUXVhbk1pTENKemIzVnlZMlZTYjI5MElqb2lJaXdpYzI5MWNtTmxjME52Ym5SbGJuUWlPbHNpTHk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OWNiaTh2SUZCaFkydGhaMlVnWkc5amN5QmhkQ0JvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TjBjbUZqYTJWeUlDOHZYRzR2THlCTVlYTjBJRzFsY21kbE9pQm9kSFJ3Y3pvdkwyZHBkR2gxWWk1amIyMHZiV1YwWlc5eUwyMWxkR1Z2Y2k5aWJHOWlMMlF3TjJabU9HVTVPV05tWkdVeU1XTm1NVEV6WkdFeE0yUXpOV1F6T0RkaU1HVmtNekE1WVRNdmNHRmphMkZuWlhNdmRISmhZMnRsY2k5MGNtRmphMlZ5TG1weklDOHZYRzR2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkwxeHVYRzR2S2lwY2JpQXFJRUJ1WVcxbGMzQmhZMlVnVkhKaFkydHlYRzRnS2lCQWMzVnRiV0Z5ZVNCVWFHVWdibUZ0WlhOd1lXTmxJR1p2Y2lCVWNtRmphM0l0Y21Wc1lYUmxaQ0J0WlhSb2IyUnpMbHh1SUNvdlhHNTJZWElnVkhKaFkydHlJRDBnYlc5a2RXeGxMbVY0Y0c5eWRITWdQU0I3ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpkSEpoWTJ0bGNsOWhZM1JwZG1WY2JseHVMeW9xWEc0Z0tpQkFjM1Z0YldGeWVTQlVjblZsSUdsbUlIUm9aWEpsSUdseklHRWdZM1Z5Y21WdWRDQmpiMjF3ZFhSaGRHbHZiaXdnYldWaGJtbHVaeUIwYUdGMElHUmxjR1Z1WkdWdVkybGxjeUJ2YmlCeVpXRmpkR2wyWlNCa1lYUmhJSE52ZFhKalpYTWdkMmxzYkNCaVpTQjBjbUZqYTJWa0lHRnVaQ0J3YjNSbGJuUnBZV3hzZVNCallYVnpaU0IwYUdVZ1kzVnljbVZ1ZENCamIyMXdkWFJoZEdsdmJpQjBieUJpWlNCeVpYSjFiaTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUlFQjBlWEJsSUh0Q2IyOXNaV0Z1ZlZ4dUlDb3ZYRzVVY21GamEzSXVZV04wYVhabElEMGdabUZzYzJVN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZZM1Z5Y21WdWRHTnZiWEIxZEdGMGFXOXVYRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnVkdobElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNHNJRzl5SUdCdWRXeHNZQ0JwWmlCMGFHVnlaU0JwYzI0bmRDQnZibVV1SUNCVWFHVWdZM1Z5Y21WdWRDQmpiMjF3ZFhSaGRHbHZiaUJwY3lCMGFHVWdXMkJVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjVnWFNnamRISmhZMnRsY2w5amIyMXdkWFJoZEdsdmJpa2diMkpxWldOMElHTnlaV0YwWldRZ1lua2dkR2hsSUdsdWJtVnliVzl6ZENCaFkzUnBkbVVnWTJGc2JDQjBieUJnVkhKaFkydHlMbUYxZEc5eWRXNWdMQ0JoYm1RZ2FYUW5jeUIwYUdVZ1kyOXRjSFYwWVhScGIyNGdkR2hoZENCbllXbHVjeUJrWlhCbGJtUmxibU5wWlhNZ2QyaGxiaUJ5WldGamRHbDJaU0JrWVhSaElITnZkWEpqWlhNZ1lYSmxJR0ZqWTJWemMyVmtMbHh1SUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1SUNvZ1FIUjVjR1VnZTFSeVlXTnJjaTVEYjIxd2RYUmhkR2x2Ym4xY2JpQXFMMXh1VkhKaFkydHlMbU4xY25KbGJuUkRiMjF3ZFhSaGRHbHZiaUE5SUc1MWJHdzdYRzVjYm5aaGNpQnpaWFJEZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRnUFNCbWRXNWpkR2x2YmlBb1l5a2dlMXh1WEhSVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1SUQwZ1l6dGNibHgwVkhKaFkydHlMbUZqZEdsMlpTQTlJQ0VoSUdNN1hHNTlPMXh1WEc1MllYSWdYMlJsWW5WblJuVnVZeUE5SUdaMWJtTjBhVzl1SUNncElIdGNibHgwTHk4Z1YyVWdkMkZ1ZENCMGFHbHpJR052WkdVZ2RHOGdkMjl5YXlCM2FYUm9iM1YwSUUxbGRHVnZjaXdnWVc1a0lHRnNjMjhnZDJsMGFHOTFkRnh1WEhRdkx5QmNJbU52Ym5OdmJHVmNJaUFvZDJocFkyZ2dhWE1nZEdWamFHNXBZMkZzYkhrZ2JtOXVMWE4wWVc1a1lYSmtJR0Z1WkNCdFlYa2dZbVVnYldsemMybHVaMXh1WEhRdkx5QnZiaUJ6YjIxbElHSnliM2R6WlhJZ2QyVWdZMjl0WlNCaFkzSnZjM01zSUd4cGEyVWdhWFFnZDJGeklHOXVJRWxGSURjcExseHVYSFF2TDF4dVhIUXZMeUJNWVhwNUlHVjJZV3gxWVhScGIyNGdZbVZqWVhWelpTQmdUV1YwWlc5eVlDQmtiMlZ6SUc1dmRDQmxlR2x6ZENCeWFXZG9kQ0JoZDJGNUxpZy9QeWxjYmx4MGNtVjBkWEp1SUNoMGVYQmxiMllnVFdWMFpXOXlJQ0U5UFNCY0luVnVaR1ZtYVc1bFpGd2lJRDhnVFdWMFpXOXlMbDlrWldKMVp5QTZYRzVjZEZ4MFhIUmNkRngwS0NoMGVYQmxiMllnWTI5dWMyOXNaU0FoUFQwZ1hDSjFibVJsWm1sdVpXUmNJaWtnSmlZZ1kyOXVjMjlzWlM1c2IyY2dQMXh1WEhSY2RGeDBYSFJjZENCbWRXNWpkR2x2YmlBb0tTQjdJR052Ym5OdmJHVXViRzluTG1Gd2NHeDVLR052Ym5OdmJHVXNJR0Z5WjNWdFpXNTBjeWs3SUgwZ09seHVYSFJjZEZ4MFhIUmNkQ0JtZFc1amRHbHZiaUFvS1NCN2ZTa3BPMXh1ZlR0Y2JseHVkbUZ5SUY5MGFISnZkMDl5VEc5bklEMGdablZ1WTNScGIyNGdLR1p5YjIwc0lHVXBJSHRjYmx4MGFXWWdLSFJvY205M1JtbHljM1JGY25KdmNpa2dlMXh1WEhSY2RIUm9jbTkzSUdVN1hHNWNkSDBnWld4elpTQjdYRzVjZEZ4MGRtRnlJRzFsYzNOaFoyVkJibVJUZEdGamF6dGNibHgwWEhScFppQW9aUzV6ZEdGamF5QW1KaUJsTG0xbGMzTmhaMlVwSUh0Y2JseDBYSFJjZEhaaGNpQnBaSGdnUFNCbExuTjBZV05yTG1sdVpHVjRUMllvWlM1dFpYTnpZV2RsS1R0Y2JseDBYSFJjZEdsbUlDaHBaSGdnUGowZ01DQW1KaUJwWkhnZ1BEMGdNVEFwSUM4dklHRnNiRzkzSUdadmNpQmNJa1Z5Y205eU9pQmNJaUFvWVhRZ2JHVmhjM1FnTnlsY2JseDBYSFJjZEZ4MGJXVnpjMkZuWlVGdVpGTjBZV05ySUQwZ1pTNXpkR0ZqYXpzZ0x5OGdiV1Z6YzJGblpTQnBjeUJ3WVhKMElHOW1JR1V1YzNSaFkyc3NJR0Z6SUdsdUlFTm9jbTl0WlZ4dVhIUmNkRngwWld4elpWeHVYSFJjZEZ4MFhIUnRaWE56WVdkbFFXNWtVM1JoWTJzZ1BTQmxMbTFsYzNOaFoyVWdLMXh1WEhSY2RGeDBYSFFvWlM1emRHRmpheTVqYUdGeVFYUW9NQ2tnUFQwOUlDZGNYRzRuSUQ4Z0p5Y2dPaUFuWEZ4dUp5a2dLeUJsTG5OMFlXTnJPeUF2THlCbExtY3VJRk5oWm1GeWFWeHVYSFJjZEgwZ1pXeHpaU0I3WEc1Y2RGeDBYSFJ0WlhOellXZGxRVzVrVTNSaFkyc2dQU0JsTG5OMFlXTnJJSHg4SUdVdWJXVnpjMkZuWlR0Y2JseDBYSFI5WEc1Y2RGeDBYMlJsWW5WblJuVnVZeWdwS0Z3aVJYaGpaWEIwYVc5dUlHWnliMjBnVkhKaFkydHlJRndpSUNzZ1puSnZiU0FySUZ3aUlHWjFibU4wYVc5dU9sd2lMRnh1WEhSY2RGeDBYSFJjZEZ4MFhIUmNkQ0J0WlhOellXZGxRVzVrVTNSaFkyc3BPMXh1WEhSOVhHNTlPMXh1WEc0dkx5QlVZV3RsY3lCaElHWjFibU4wYVc5dUlHQm1ZQ3dnWVc1a0lIZHlZWEJ6SUdsMElHbHVJR0VnWUUxbGRHVnZjaTVmYm05WmFXVnNaSE5CYkd4dmQyVmtZRnh1THk4Z1lteHZZMnNnYVdZZ2QyVWdZWEpsSUhKMWJtNXBibWNnYjI0Z2RHaGxJSE5sY25abGNpNGdUMjRnZEdobElHTnNhV1Z1ZEN3Z2NtVjBkWEp1Y3lCMGFHVmNiaTh2SUc5eWFXZHBibUZzSUdaMWJtTjBhVzl1SUNoemFXNWpaU0JnVFdWMFpXOXlMbDl1YjFscFpXeGtjMEZzYkc5M1pXUmdJR2x6SUdGY2JpOHZJRzV2TFc5d0tTNGdWR2hwY3lCb1lYTWdkR2hsSUdKbGJtVm1hWFFnYjJZZ2JtOTBJR0ZrWkdsdVp5QmhiaUIxYm01bFkyVnpjMkZ5ZVNCemRHRmphMXh1THk4Z1puSmhiV1VnYjI0Z2RHaGxJR05zYVdWdWRDNWNiblpoY2lCM2FYUm9UbTlaYVdWc1pITkJiR3h2ZDJWa0lEMGdablZ1WTNScGIyNGdLR1lwSUh0Y2JseDBhV1lnS0NoMGVYQmxiMllnVFdWMFpXOXlJRDA5UFNBbmRXNWtaV1pwYm1Wa0p5a2dmSHdnVFdWMFpXOXlMbWx6UTJ4cFpXNTBLU0I3WEc1Y2RGeDBjbVYwZFhKdUlHWTdYRzVjZEgwZ1pXeHpaU0I3WEc1Y2RGeDBjbVYwZFhKdUlHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MFhIUmNkSFpoY2lCaGNtZHpJRDBnWVhKbmRXMWxiblJ6TzF4dVhIUmNkRngwVFdWMFpXOXlMbDl1YjFscFpXeGtjMEZzYkc5M1pXUW9ablZ1WTNScGIyNGdLQ2tnZTF4dVhIUmNkRngwWEhSbUxtRndjR3g1S0c1MWJHd3NJR0Z5WjNNcE8xeHVYSFJjZEZ4MGZTazdYRzVjZEZ4MGZUdGNibHgwZlZ4dWZUdGNibHh1ZG1GeUlHNWxlSFJKWkNBOUlERTdYRzR2THlCamIyMXdkWFJoZEdsdmJuTWdkMmh2YzJVZ1kyRnNiR0poWTJ0eklIZGxJSE5vYjNWc1pDQmpZV3hzSUdGMElHWnNkWE5vSUhScGJXVmNiblpoY2lCd1pXNWthVzVuUTI5dGNIVjBZWFJwYjI1eklEMGdXMTA3WEc0dkx5QmdkSEoxWldBZ2FXWWdZU0JVY21GamEzSXVabXgxYzJnZ2FYTWdjMk5vWldSMWJHVmtMQ0J2Y2lCcFppQjNaU0JoY21VZ2FXNGdWSEpoWTJ0eUxtWnNkWE5vSUc1dmQxeHVkbUZ5SUhkcGJHeEdiSFZ6YUNBOUlHWmhiSE5sTzF4dUx5OGdZSFJ5ZFdWZ0lHbG1JSGRsSUdGeVpTQnBiaUJVY21GamEzSXVabXgxYzJnZ2JtOTNYRzUyWVhJZ2FXNUdiSFZ6YUNBOUlHWmhiSE5sTzF4dUx5OGdZSFJ5ZFdWZ0lHbG1JSGRsSUdGeVpTQmpiMjF3ZFhScGJtY2dZU0JqYjIxd2RYUmhkR2x2YmlCdWIzY3NJR1ZwZEdobGNpQm1hWEp6ZENCMGFXMWxYRzR2THlCdmNpQnlaV052YlhCMWRHVXVJQ0JVYUdseklHMWhkR05vWlhNZ1ZISmhZMnR5TG1GamRHbDJaU0IxYm14bGMzTWdkMlVnWVhKbElHbHVjMmxrWlZ4dUx5OGdWSEpoWTJ0eUxtNXZibkpsWVdOMGFYWmxMQ0IzYUdsamFDQnVkV3hzWm1sbGN5QmpkWEp5Wlc1MFEyOXRjSFYwWVhScGIyNGdaWFpsYmlCMGFHOTFaMmhjYmk4dklHRnVJR1Z1WTJ4dmMybHVaeUJqYjIxd2RYUmhkR2x2YmlCdFlYa2djM1JwYkd3Z1ltVWdjblZ1Ym1sdVp5NWNiblpoY2lCcGJrTnZiWEIxZEdVZ1BTQm1ZV3h6WlR0Y2JpOHZJR0IwY25WbFlDQnBaaUIwYUdVZ1lGOTBhSEp2ZDBacGNuTjBSWEp5YjNKZ0lHOXdkR2x2YmlCM1lYTWdjR0Z6YzJWa0lHbHVJSFJ2SUhSb1pTQmpZV3hzWEc0dkx5QjBieUJVY21GamEzSXVabXgxYzJnZ2RHaGhkQ0IzWlNCaGNtVWdhVzR1SUZkb1pXNGdjMlYwTENCMGFISnZkeUJ5WVhSb1pYSWdkR2hoYmlCc2IyY2dkR2hsWEc0dkx5Qm1hWEp6ZENCbGNuSnZjaUJsYm1OdmRXNTBaWEpsWkNCM2FHbHNaU0JtYkhWemFHbHVaeTRnUW1WbWIzSmxJSFJvY205M2FXNW5JSFJvWlNCbGNuSnZjaXhjYmk4dklHWnBibWx6YUNCbWJIVnphR2x1WnlBb1puSnZiU0JoSUdacGJtRnNiSGtnWW14dlkyc3BMQ0JzYjJkbmFXNW5JR0Z1ZVNCemRXSnpaWEYxWlc1MFhHNHZMeUJsY25KdmNuTXVYRzUyWVhJZ2RHaHliM2RHYVhKemRFVnljbTl5SUQwZ1ptRnNjMlU3WEc1Y2JuWmhjaUJoWm5SbGNrWnNkWE5vUTJGc2JHSmhZMnR6SUQwZ1cxMDdYRzVjYmk4dklHeHZiMnNnWm05eUlHRWdjbVZ4ZFdWemRFRnVhVzFoZEdsdmJrWnlZVzFsSUdGeklIUm9ZWFFnYVhNZ2NISmxabVZ5WVdKc1pTQnZkbVZ5SUc1bGVIUlVhV05ySUc5eUlITmxkRWx0YldWa2FXRjBaVnh1ZG1GeUlISmxjWFZsYzNSQmJtbHRZWFJwYjI1R2NtRnRaU0E5SUhSNWNHVnZaaUIzYVc1a2IzY2dJVDA5SUZ3aWRXNWtaV1pwYm1Wa1hDSWdQMXh1WEhSM2FXNWtiM2N1Y21WeGRXVnpkRUZ1YVcxaGRHbHZia1p5WVcxbElIeDhYRzVjZEhkcGJtUnZkeTV0YjNwU1pYRjFaWE4wUVc1cGJXRjBhVzl1Um5KaGJXVWdmSHhjYmx4MGQybHVaRzkzTG5kbFltdHBkRkpsY1hWbGMzUkJibWx0WVhScGIyNUdjbUZ0WlNCOGZGeHVYSFIzYVc1a2IzY3ViMUpsY1hWbGMzUkJibWx0WVhScGIyNUdjbUZ0WlNBNlhHNWNkRzUxYkd3N1hHNWNiaTh2SUdOdmJuUnliMnh6SUhSb1pTQmtaV1psY25KaGJGeHVWSEpoWTJ0eUxtNWxlSFJVYVdOcklEMGdjbVZ4ZFdWemRFRnVhVzFoZEdsdmJrWnlZVzFsSUNFOUlHNTFiR3dnUHlCeVpYRjFaWE4wUVc1cGJXRjBhVzl1Um5KaGJXVXVZbWx1WkNoM2FXNWtiM2NwSURwY2JseDBkSGx3Wlc5bUlIQnliMk5sYzNNZ0lUMDlJRndpZFc1a1pXWnBibVZrWENJZ1B5QndjbTlqWlhOekxtNWxlSFJVYVdOcklEcGNibHgwWm5WdVkzUnBiMjRnS0dZcElIc2djMlYwVkdsdFpXOTFkQ2htTENBeE5pazdJSDA3WEc1Y2JuWmhjaUJ5WlhGMWFYSmxSbXgxYzJnZ1BTQm1kVzVqZEdsdmJpQW9LU0I3WEc1Y2RHbG1JQ2doSUhkcGJHeEdiSFZ6YUNrZ2UxeHVYSFJjZEZSeVlXTnJjaTV1WlhoMFZHbGpheWhVY21GamEzSXVabXgxYzJncE8xeHVYSFJjZEhkcGJHeEdiSFZ6YUNBOUlIUnlkV1U3WEc1Y2RIMWNibjA3WEc1Y2JpOHZJRlJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZiaUJqYjI1emRISjFZM1J2Y2lCcGN5QjJhWE5wWW14bElHSjFkQ0J3Y21sMllYUmxYRzR2THlBb2RHaHliM2R6SUdGdUlHVnljbTl5SUdsbUlIbHZkU0IwY25rZ2RHOGdZMkZzYkNCcGRDbGNiblpoY2lCamIyNXpkSEoxWTNScGJtZERiMjF3ZFhSaGRHbHZiaUE5SUdaaGJITmxPMXh1WEc0dkwxeHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpkSEpoWTJ0bGNsOWpiMjF3ZFhSaGRHbHZibHh1WEc0dktpcGNiaUFxSUVCemRXMXRZWEo1SUVFZ1EyOXRjSFYwWVhScGIyNGdiMkpxWldOMElISmxjSEpsYzJWdWRITWdZMjlrWlNCMGFHRjBJR2x6SUhKbGNHVmhkR1ZrYkhrZ2NtVnlkVzVjYmlBcUlHbHVJSEpsYzNCdmJuTmxJSFJ2WEc0Z0tpQnlaV0ZqZEdsMlpTQmtZWFJoSUdOb1lXNW5aWE11SUVOdmJYQjFkR0YwYVc5dWN5QmtiMjRuZENCb1lYWmxJSEpsZEhWeWJpQjJZV3gxWlhNN0lIUm9aWGtnYW5WemRGeHVJQ29nY0dWeVptOXliU0JoWTNScGIyNXpMQ0J6ZFdOb0lHRnpJSEpsY21WdVpHVnlhVzVuSUdFZ2RHVnRjR3hoZEdVZ2IyNGdkR2hsSUhOamNtVmxiaTRnUTI5dGNIVjBZWFJwYjI1elhHNGdLaUJoY21VZ1kzSmxZWFJsWkNCMWMybHVaeUJVY21GamEzSXVZWFYwYjNKMWJpNGdWWE5sSUhOMGIzQWdkRzhnY0hKbGRtVnVkQ0JtZFhKMGFHVnlJSEpsY25WdWJtbHVaeUJ2WmlCaFhHNGdLaUJqYjIxd2RYUmhkR2x2Ymk1Y2JpQXFJRUJwYm5OMFlXNWpaVzVoYldVZ1kyOXRjSFYwWVhScGIyNWNiaUFxTDF4dVZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dUlEMGdablZ1WTNScGIyNGdLR1lzSUhCaGNtVnVkQ3dnWTNSNEtTQjdYRzVjZEdsbUlDZ2hJR052Ym5OMGNuVmpkR2x1WjBOdmJYQjFkR0YwYVc5dUtWeHVYSFJjZEhSb2NtOTNJRzVsZHlCRmNuSnZjaWhjYmx4MFhIUmNkRndpVkhKaFkydHlMa052YlhCMWRHRjBhVzl1SUdOdmJuTjBjblZqZEc5eUlHbHpJSEJ5YVhaaGRHVTdJSFZ6WlNCVWNtRmphM0l1WVhWMGIzSjFibHdpS1R0Y2JseDBZMjl1YzNSeWRXTjBhVzVuUTI5dGNIVjBZWFJwYjI0Z1BTQm1ZV3h6WlR0Y2JseHVYSFIyWVhJZ2MyVnNaaUE5SUhSb2FYTTdYRzVjYmx4MEx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4alkyOXRjSFYwWVhScGIyNWZjM1J2Y0hCbFpGeHVYRzVjZEM4cUtseHVYSFFnS2lCQWMzVnRiV0Z5ZVNCVWNuVmxJR2xtSUhSb2FYTWdZMjl0Y0hWMFlYUnBiMjRnYUdGeklHSmxaVzRnYzNSdmNIQmxaQzVjYmx4MElDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dVhIUWdLaUJBYldWdFltVnlUMllnVkhKaFkydHlMa052YlhCMWRHRjBhVzl1WEc1Y2RDQXFJRUJwYm5OMFlXNWpaVnh1WEhRZ0tpQkFibUZ0WlNBZ2MzUnZjSEJsWkZ4dVhIUWdLaTljYmx4MGMyVnNaaTV6ZEc5d2NHVmtJRDBnWm1Gc2MyVTdYRzVjYmx4MEx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4alkyOXRjSFYwWVhScGIyNWZhVzUyWVd4cFpHRjBaV1JjYmx4dVhIUXZLaXBjYmx4MElDb2dRSE4xYlcxaGNua2dWSEoxWlNCcFppQjBhR2x6SUdOdmJYQjFkR0YwYVc5dUlHaGhjeUJpWldWdUlHbHVkbUZzYVdSaGRHVmtJQ2hoYm1RZ2JtOTBJSGxsZENCeVpYSjFiaWtzSUc5eUlHbG1JR2wwSUdoaGN5QmlaV1Z1SUhOMGIzQndaV1F1WEc1Y2RDQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JseDBJQ29nUUcxbGJXSmxjazltSUZSeVlXTnJjaTVEYjIxd2RYUmhkR2x2Ymx4dVhIUWdLaUJBYVc1emRHRnVZMlZjYmx4MElDb2dRRzVoYldVZ0lHbHVkbUZzYVdSaGRHVmtYRzVjZENBcUlFQjBlWEJsSUh0Q2IyOXNaV0Z1ZlZ4dVhIUWdLaTljYmx4MGMyVnNaaTVwYm5aaGJHbGtZWFJsWkNBOUlHWmhiSE5sTzF4dVhHNWNkQzh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJMk52YlhCMWRHRjBhVzl1WDJacGNuTjBjblZ1WEc1Y2JseDBMeW9xWEc1Y2RDQXFJRUJ6ZFcxdFlYSjVJRlJ5ZFdVZ1pIVnlhVzVuSUhSb1pTQnBibWwwYVdGc0lISjFiaUJ2WmlCMGFHVWdZMjl0Y0hWMFlYUnBiMjRnWVhRZ2RHaGxJSFJwYldVZ1lGUnlZV05yY2k1aGRYUnZjblZ1WUNCcGN5QmpZV3hzWldRc0lHRnVaQ0JtWVd4elpTQnZiaUJ6ZFdKelpYRjFaVzUwSUhKbGNuVnVjeUJoYm1RZ1lYUWdiM1JvWlhJZ2RHbHRaWE11WEc1Y2RDQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JseDBJQ29nUUcxbGJXSmxjazltSUZSeVlXTnJjaTVEYjIxd2RYUmhkR2x2Ymx4dVhIUWdLaUJBYVc1emRHRnVZMlZjYmx4MElDb2dRRzVoYldVZ0lHWnBjbk4wVW5WdVhHNWNkQ0FxSUVCMGVYQmxJSHRDYjI5c1pXRnVmVnh1WEhRZ0tpOWNibHgwYzJWc1ppNW1hWEp6ZEZKMWJpQTlJSFJ5ZFdVN1hHNWNibHgwYzJWc1ppNWZhV1FnUFNCdVpYaDBTV1FyS3p0Y2JseDBjMlZzWmk1ZmIyNUpiblpoYkdsa1lYUmxRMkZzYkdKaFkydHpJRDBnVzEwN1hHNWNkQzh2SUhSb1pTQndiR0Z1SUdseklHRjBJSE52YldVZ2NHOXBiblFnZEc4Z2RYTmxJSFJvWlNCd1lYSmxiblFnY21Wc1lYUnBiMjVjYmx4MEx5OGdkRzhnWTI5dWMzUnlZV2x1SUhSb1pTQnZjbVJsY2lCMGFHRjBJR052YlhCMWRHRjBhVzl1Y3lCaGNtVWdjSEp2WTJWemMyVmtYRzVjZEhObGJHWXVYM0JoY21WdWRDQTlJSEJoY21WdWREdGNibHgwYzJWc1ppNWZablZ1WXlBOUlHWTdYRzVjZEhObGJHWXVYM0psWTI5dGNIVjBhVzVuSUQwZ1ptRnNjMlU3WEc1Y2RITmxiR1l1WDJOdmJuUmxlSFFnUFNCamRIZ2dmSHdnYm5Wc2JEdGNibHh1WEhSMllYSWdaWEp5YjNKbFpDQTlJSFJ5ZFdVN1hHNWNkSFJ5ZVNCN1hHNWNkRngwYzJWc1ppNWZZMjl0Y0hWMFpTZ3BPMXh1WEhSY2RHVnljbTl5WldRZ1BTQm1ZV3h6WlR0Y2JseDBmU0JtYVc1aGJHeDVJSHRjYmx4MFhIUnpaV3htTG1acGNuTjBVblZ1SUQwZ1ptRnNjMlU3WEc1Y2RGeDBhV1lnS0dWeWNtOXlaV1FwWEc1Y2RGeDBYSFJ6Wld4bUxuTjBiM0FvS1R0Y2JseDBmVnh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpZMjl0Y0hWMFlYUnBiMjVmYjI1cGJuWmhiR2xrWVhSbFhHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVbVZuYVhOMFpYSnpJR0JqWVd4c1ltRmphMkFnZEc4Z2NuVnVJSGRvWlc0Z2RHaHBjeUJqYjIxd2RYUmhkR2x2YmlCcGN5QnVaWGgwSUdsdWRtRnNhV1JoZEdWa0xDQnZjaUJ5ZFc1eklHbDBJR2x0YldWa2FXRjBaV3g1SUdsbUlIUm9aU0JqYjIxd2RYUmhkR2x2YmlCcGN5QmhiSEpsWVdSNUlHbHVkbUZzYVdSaGRHVmtMaUFnVkdobElHTmhiR3hpWVdOcklHbHpJSEoxYmlCbGVHRmpkR3g1SUc5dVkyVWdZVzVrSUc1dmRDQjFjRzl1SUdaMWRIVnlaU0JwYm5aaGJHbGtZWFJwYjI1eklIVnViR1Z6Y3lCZ2IyNUpiblpoYkdsa1lYUmxZQ0JwY3lCallXeHNaV1FnWVdkaGFXNGdZV1owWlhJZ2RHaGxJR052YlhCMWRHRjBhVzl1SUdKbFkyOXRaWE1nZG1Gc2FXUWdZV2RoYVc0dVhHNGdLaUJBYkc5amRYTWdRMnhwWlc1MFhHNGdLaUJBY0dGeVlXMGdlMFoxYm1OMGFXOXVmU0JqWVd4c1ltRmpheUJHZFc1amRHbHZiaUIwYnlCaVpTQmpZV3hzWldRZ2IyNGdhVzUyWVd4cFpHRjBhVzl1TGlCU1pXTmxhWFpsY3lCdmJtVWdZWEpuZFcxbGJuUXNJSFJvWlNCamIyMXdkWFJoZEdsdmJpQjBhR0YwSUhkaGN5QnBiblpoYkdsa1lYUmxaQzVjYmlBcUwxeHVWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVMbkJ5YjNSdmRIbHdaUzV2YmtsdWRtRnNhV1JoZEdVZ1BTQm1kVzVqZEdsdmJpQW9aaXdnWTNSNEtTQjdYRzVjZEhaaGNpQnpaV3htSUQwZ2RHaHBjenRjYmx4dVhIUnBaaUFvZEhsd1pXOW1JR1lnSVQwOUlDZG1kVzVqZEdsdmJpY3BYRzVjZEZ4MGRHaHliM2NnYm1WM0lFVnljbTl5S0Z3aWIyNUpiblpoYkdsa1lYUmxJSEpsY1hWcGNtVnpJR0VnWm5WdVkzUnBiMjVjSWlrN1hHNWNibHgwYVdZZ0tITmxiR1l1YVc1MllXeHBaR0YwWldRcElIdGNibHgwWEhSVWNtRmphM0l1Ym05dWNtVmhZM1JwZG1Vb1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSY2RGeDBkMmwwYUU1dldXbGxiR1J6UVd4c2IzZGxaQ2htS1M1allXeHNLR04wZUNBaFBUMGdkbTlwWkNBd0lEOGdZM1I0SURvZ2MyVnNaaTVmWTI5dWRHVjRkQ3dnYzJWc1ppazdYRzVjZEZ4MGZTazdYRzVjZEgwZ1pXeHpaU0I3WEc1Y2RGeDBjMlZzWmk1ZmIyNUpiblpoYkdsa1lYUmxRMkZzYkdKaFkydHpMbkIxYzJnb2V5Qm1iam9nWml3Z1kzUjRPaUJqZEhnZ2ZTazdYRzVjZEgxY2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STJOdmJYQjFkR0YwYVc5dVgybHVkbUZzYVdSaGRHVmNibHh1THlvcVhHNGdLaUJBYzNWdGJXRnllU0JKYm5aaGJHbGtZWFJsY3lCMGFHbHpJR052YlhCMWRHRjBhVzl1SUhOdklIUm9ZWFFnYVhRZ2QybHNiQ0JpWlNCeVpYSjFiaTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUwxeHVWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVMbkJ5YjNSdmRIbHdaUzVwYm5aaGJHbGtZWFJsSUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2RHbG1JQ2doSUhObGJHWXVhVzUyWVd4cFpHRjBaV1FwSUh0Y2JseDBYSFF2THlCcFppQjNaU2R5WlNCamRYSnlaVzUwYkhrZ2FXNGdYM0psWTI5dGNIVjBaU2dwTENCa2IyNG5kQ0JsYm5GMVpYVmxYRzVjZEZ4MEx5OGdiM1Z5YzJWc2RtVnpMQ0J6YVc1alpTQjNaU2RzYkNCeVpYSjFiaUJwYlcxbFpHbGhkR1ZzZVNCaGJubDNZWGt1WEc1Y2RGeDBhV1lnS0NFZ2MyVnNaaTVmY21WamIyMXdkWFJwYm1jZ0ppWWdJU0J6Wld4bUxuTjBiM0J3WldRcElIdGNibHgwWEhSY2RISmxjWFZwY21WR2JIVnphQ2dwTzF4dVhIUmNkRngwY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1d2RYTm9LSFJvYVhNcE8xeHVYSFJjZEgxY2JseHVYSFJjZEhObGJHWXVhVzUyWVd4cFpHRjBaV1FnUFNCMGNuVmxPMXh1WEc1Y2RGeDBMeThnWTJGc2JHSmhZMnR6SUdOaGJpZDBJR0ZrWkNCallXeHNZbUZqYTNNc0lHSmxZMkYxYzJWY2JseDBYSFF2THlCelpXeG1MbWx1ZG1Gc2FXUmhkR1ZrSUQwOVBTQjBjblZsTGx4dVhIUmNkR1p2Y2loMllYSWdhU0E5SURBc0lHWTdJR1lnUFNCelpXeG1MbDl2YmtsdWRtRnNhV1JoZEdWRFlXeHNZbUZqYTNOYmFWMDdJR2tyS3lrZ2UxeHVYSFJjZEZ4MFZISmhZMnR5TG01dmJuSmxZV04wYVhabEtHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MFhIUmNkRngwZDJsMGFFNXZXV2xsYkdSelFXeHNiM2RsWkNobUxtWnVLUzVqWVd4c0tHWXVZM1I0SUNFOVBTQjJiMmxrSURBZ1B5Qm1MbU4wZUNBNklITmxiR1l1WDJOdmJuUmxlSFFzSUhObGJHWXBPMXh1WEhSY2RGeDBmU2s3WEc1Y2RGeDBmVnh1WEhSY2RITmxiR1l1WDI5dVNXNTJZV3hwWkdGMFpVTmhiR3hpWVdOcmN5QTlJRnRkTzF4dVhIUjlYRzU5TzF4dVhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TmpiMjF3ZFhSaGRHbHZibDl6ZEc5d1hHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVSEpsZG1WdWRITWdkR2hwY3lCamIyMXdkWFJoZEdsdmJpQm1jbTl0SUhKbGNuVnVibWx1Wnk1Y2JpQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JpQXFMMXh1VkhKaFkydHlMa052YlhCMWRHRjBhVzl1TG5CeWIzUnZkSGx3WlM1emRHOXdJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFJwWmlBb0lTQjBhR2x6TG5OMGIzQndaV1FwSUh0Y2JseDBYSFIwYUdsekxuTjBiM0J3WldRZ1BTQjBjblZsTzF4dVhIUmNkSFJvYVhNdWFXNTJZV3hwWkdGMFpTZ3BPMXh1WEhSOVhHNTlPMXh1WEc1VWNtRmphM0l1UTI5dGNIVjBZWFJwYjI0dWNISnZkRzkwZVhCbExsOWpiMjF3ZFhSbElEMGdablZ1WTNScGIyNGdLQ2tnZTF4dVhIUjJZWElnYzJWc1ppQTlJSFJvYVhNN1hHNWNkSE5sYkdZdWFXNTJZV3hwWkdGMFpXUWdQU0JtWVd4elpUdGNibHh1WEhSMllYSWdjSEpsZG1sdmRYTWdQU0JVY21GamEzSXVZM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVPMXh1WEhSelpYUkRkWEp5Wlc1MFEyOXRjSFYwWVhScGIyNG9jMlZzWmlrN1hHNWNkSFpoY2lCd2NtVjJhVzkxYzBsdVEyOXRjSFYwWlNBOUlHbHVRMjl0Y0hWMFpUdGNibHgwYVc1RGIyMXdkWFJsSUQwZ2RISjFaVHRjYmx4MGRISjVJSHRjYmx4MFhIUjNhWFJvVG05WmFXVnNaSE5CYkd4dmQyVmtLSE5sYkdZdVgyWjFibU1wTG1OaGJHd29jMlZzWmk1ZlkyOXVkR1Y0ZEN3Z2MyVnNaaWs3WEc1Y2RIMGdabWx1WVd4c2VTQjdYRzVjZEZ4MGMyVjBRM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVLSEJ5WlhacGIzVnpLVHRjYmx4MFhIUnBia052YlhCMWRHVWdQU0J3Y21WMmFXOTFjMGx1UTI5dGNIVjBaVHRjYmx4MGZWeHVmVHRjYmx4dVZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dUxuQnliM1J2ZEhsd1pTNWZjbVZqYjIxd2RYUmxJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFIyWVhJZ2MyVnNaaUE5SUhSb2FYTTdYRzVjYmx4MGMyVnNaaTVmY21WamIyMXdkWFJwYm1jZ1BTQjBjblZsTzF4dVhIUjBjbmtnZTF4dVhIUmNkSGRvYVd4bElDaHpaV3htTG1sdWRtRnNhV1JoZEdWa0lDWW1JQ0VnYzJWc1ppNXpkRzl3Y0dWa0tTQjdYRzVjZEZ4MFhIUjBjbmtnZTF4dVhIUmNkRngwWEhSelpXeG1MbDlqYjIxd2RYUmxLQ2s3WEc1Y2RGeDBYSFI5SUdOaGRHTm9JQ2hsS1NCN1hHNWNkRngwWEhSY2RGOTBhSEp2ZDA5eVRHOW5LRndpY21WamIyMXdkWFJsWENJc0lHVXBPMXh1WEhSY2RGeDBmVnh1WEhSY2RGeDBMeThnU1dZZ1gyTnZiWEIxZEdVb0tTQnBiblpoYkdsa1lYUmxaQ0IxY3l3Z2QyVWdjblZ1SUdGbllXbHVJR2x0YldWa2FXRjBaV3g1TGx4dVhIUmNkRngwTHk4Z1FTQmpiMjF3ZFhSaGRHbHZiaUIwYUdGMElHbHVkbUZzYVdSaGRHVnpJR2wwYzJWc1ppQnBibVJsWm1sdWFYUmxiSGtnYVhNZ1lXNWNibHgwWEhSY2RDOHZJR2x1Wm1sdWFYUmxJR3h2YjNBc0lHOW1JR052ZFhKelpTNWNibHgwWEhSY2RDOHZYRzVjZEZ4MFhIUXZMeUJYWlNCamIzVnNaQ0J3ZFhRZ1lXNGdhWFJsY21GMGFXOXVJR052ZFc1MFpYSWdhR1Z5WlNCaGJtUWdZMkYwWTJnZ2NuVnVMV0YzWVhsY2JseDBYSFJjZEM4dklHeHZiM0J6TGx4dVhIUmNkSDFjYmx4MGZTQm1hVzVoYkd4NUlIdGNibHgwWEhSelpXeG1MbDl5WldOdmJYQjFkR2x1WnlBOUlHWmhiSE5sTzF4dVhIUjlYRzU5TzF4dVhHNHZMMXh1THk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqZEhKaFkydGxjbDlrWlhCbGJtUmxibU41WEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1FTQkVaWEJsYm1SbGJtTjVJSEpsY0hKbGMyVnVkSE1nWVc0Z1lYUnZiV2xqSUhWdWFYUWdiMllnY21WaFkzUnBkbVVnWkdGMFlTQjBhR0YwSUdGY2JpQXFJR052YlhCMWRHRjBhVzl1SUcxcFoyaDBJR1JsY0dWdVpDQnZiaTRnVW1WaFkzUnBkbVVnWkdGMFlTQnpiM1Z5WTJWeklITjFZMmdnWVhNZ1UyVnpjMmx2YmlCdmNseHVJQ29nVFdsdWFXMXZibWR2SUdsdWRHVnlibUZzYkhrZ1kzSmxZWFJsSUdScFptWmxjbVZ1ZENCRVpYQmxibVJsYm1ONUlHOWlhbVZqZEhNZ1ptOXlJR1JwWm1abGNtVnVkRnh1SUNvZ2NHbGxZMlZ6SUc5bUlHUmhkR0VzSUdWaFkyZ2diMllnZDJocFkyZ2diV0Y1SUdKbElHUmxjR1Z1WkdWa0lHOXVJR0o1SUcxMWJIUnBjR3hsSUdOdmJYQjFkR0YwYVc5dWN5NWNiaUFxSUZkb1pXNGdkR2hsSUdSaGRHRWdZMmhoYm1kbGN5d2dkR2hsSUdOdmJYQjFkR0YwYVc5dWN5QmhjbVVnYVc1MllXeHBaR0YwWldRdVhHNGdLaUJBWTJ4aGMzTmNiaUFxSUVCcGJuTjBZVzVqWlU1aGJXVWdaR1Z3Wlc1a1pXNWplVnh1SUNvdlhHNVVjbUZqYTNJdVJHVndaVzVrWlc1amVTQTlJR1oxYm1OMGFXOXVJQ2dwSUh0Y2JseDBkR2hwY3k1ZlpHVndaVzVrWlc1MGMwSjVTV1FnUFNCN2ZUdGNibjA3WEc1Y2JpOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkyUmxjR1Z1WkdWdVkzbGZaR1Z3Wlc1a1hHNHZMMXh1THk4Z1FXUmtjeUJnWTI5dGNIVjBZWFJwYjI1Z0lIUnZJSFJvYVhNZ2MyVjBJR2xtSUdsMElHbHpJRzV2ZENCaGJISmxZV1I1WEc0dkx5QndjbVZ6Wlc1MExpQWdVbVYwZFhKdWN5QjBjblZsSUdsbUlHQmpiMjF3ZFhSaGRHbHZibUFnYVhNZ1lTQnVaWGNnYldWdFltVnlJRzltSUhSb1pTQnpaWFF1WEc0dkx5QkpaaUJ1YnlCaGNtZDFiV1Z1ZEN3Z1pHVm1ZWFZzZEhNZ2RHOGdZM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVMQ0J2Y2lCa2IyVnpJRzV2ZEdocGJtZGNiaTh2SUdsbUlIUm9aWEpsSUdseklHNXZJR04xY25KbGJuUkRiMjF3ZFhSaGRHbHZiaTVjYmx4dUx5b3FYRzRnS2lCQWMzVnRiV0Z5ZVNCRVpXTnNZWEpsY3lCMGFHRjBJSFJvWlNCamRYSnlaVzUwSUdOdmJYQjFkR0YwYVc5dUlDaHZjaUJnWm5KdmJVTnZiWEIxZEdGMGFXOXVZQ0JwWmlCbmFYWmxiaWtnWkdWd1pXNWtjeUJ2YmlCZ1pHVndaVzVrWlc1amVXQXVJQ0JVYUdVZ1kyOXRjSFYwWVhScGIyNGdkMmxzYkNCaVpTQnBiblpoYkdsa1lYUmxaQ0IwYUdVZ2JtVjRkQ0IwYVcxbElHQmtaWEJsYm1SbGJtTjVZQ0JqYUdGdVoyVnpMbHh1WEc1SlppQjBhR1Z5WlNCcGN5QnVieUJqZFhKeVpXNTBJR052YlhCMWRHRjBhVzl1SUdGdVpDQmdaR1Z3Wlc1a0tDbGdJR2x6SUdOaGJHeGxaQ0IzYVhSb0lHNXZJR0Z5WjNWdFpXNTBjeXdnYVhRZ1pHOWxjeUJ1YjNSb2FXNW5JR0Z1WkNCeVpYUjFjbTV6SUdaaGJITmxMbHh1WEc1U1pYUjFjbTV6SUhSeWRXVWdhV1lnZEdobElHTnZiWEIxZEdGMGFXOXVJR2x6SUdFZ2JtVjNJR1JsY0dWdVpHVnVkQ0J2WmlCZ1pHVndaVzVrWlc1amVXQWdjbUYwYUdWeUlIUm9ZVzRnWVc0Z1pYaHBjM1JwYm1jZ2IyNWxMbHh1SUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1SUNvZ1FIQmhjbUZ0SUh0VWNtRmphM0l1UTI5dGNIVjBZWFJwYjI1OUlGdG1jbTl0UTI5dGNIVjBZWFJwYjI1ZElFRnVJRzl3ZEdsdmJtRnNJR052YlhCMWRHRjBhVzl1SUdSbFkyeGhjbVZrSUhSdklHUmxjR1Z1WkNCdmJpQmdaR1Z3Wlc1a1pXNWplV0FnYVc1emRHVmhaQ0J2WmlCMGFHVWdZM1Z5Y21WdWRDQmpiMjF3ZFhSaGRHbHZiaTVjYmlBcUlFQnlaWFIxY201eklIdENiMjlzWldGdWZWeHVJQ292WEc1VWNtRmphM0l1UkdWd1pXNWtaVzVqZVM1d2NtOTBiM1I1Y0dVdVpHVndaVzVrSUQwZ1puVnVZM1JwYjI0Z0tHTnZiWEIxZEdGMGFXOXVLU0I3WEc1Y2RHbG1JQ2doSUdOdmJYQjFkR0YwYVc5dUtTQjdYRzVjZEZ4MGFXWWdLQ0VnVkhKaFkydHlMbUZqZEdsMlpTbGNibHgwWEhSY2RISmxkSFZ5YmlCbVlXeHpaVHRjYmx4dVhIUmNkR052YlhCMWRHRjBhVzl1SUQwZ1ZISmhZMnR5TG1OMWNuSmxiblJEYjIxd2RYUmhkR2x2Ymp0Y2JseDBmVnh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2RIWmhjaUJwWkNBOUlHTnZiWEIxZEdGMGFXOXVMbDlwWkR0Y2JseDBhV1lnS0NFZ0tHbGtJR2x1SUhObGJHWXVYMlJsY0dWdVpHVnVkSE5DZVVsa0tTa2dlMXh1WEhSY2RITmxiR1l1WDJSbGNHVnVaR1Z1ZEhOQ2VVbGtXMmxrWFNBOUlHTnZiWEIxZEdGMGFXOXVPMXh1WEhSY2RHTnZiWEIxZEdGMGFXOXVMbTl1U1c1MllXeHBaR0YwWlNobWRXNWpkR2x2YmlBb0tTQjdYRzVjZEZ4MFhIUmtaV3hsZEdVZ2MyVnNaaTVmWkdWd1pXNWtaVzUwYzBKNVNXUmJhV1JkTzF4dVhIUmNkSDBwTzF4dVhIUmNkSEpsZEhWeWJpQjBjblZsTzF4dVhIUjlYRzVjZEhKbGRIVnliaUJtWVd4elpUdGNibjA3WEc1Y2JpOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkyUmxjR1Z1WkdWdVkzbGZZMmhoYm1kbFpGeHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRWx1ZG1Gc2FXUmhkR1VnWVd4c0lHUmxjR1Z1WkdWdWRDQmpiMjF3ZFhSaGRHbHZibk1nYVcxdFpXUnBZWFJsYkhrZ1lXNWtJSEpsYlc5MlpTQjBhR1Z0SUdGeklHUmxjR1Z1WkdWdWRITXVYRzRnS2lCQWJHOWpkWE1nUTJ4cFpXNTBYRzRnS2k5Y2JsUnlZV05yY2k1RVpYQmxibVJsYm1ONUxuQnliM1J2ZEhsd1pTNWphR0Z1WjJWa0lEMGdablZ1WTNScGIyNGdLQ2tnZTF4dVhIUjJZWElnYzJWc1ppQTlJSFJvYVhNN1hHNWNkR1p2Y2lBb2RtRnlJR2xrSUdsdUlITmxiR1l1WDJSbGNHVnVaR1Z1ZEhOQ2VVbGtLVnh1WEhSY2RITmxiR1l1WDJSbGNHVnVaR1Z1ZEhOQ2VVbGtXMmxrWFM1cGJuWmhiR2xrWVhSbEtDazdYRzU5TzF4dVhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TmtaWEJsYm1SbGJtTjVYMmhoYzJSbGNHVnVaR1Z1ZEhOY2JseHVMeW9xWEc0Z0tpQkFjM1Z0YldGeWVTQlVjblZsSUdsbUlIUm9hWE1nUkdWd1pXNWtaVzVqZVNCb1lYTWdiMjVsSUc5eUlHMXZjbVVnWkdWd1pXNWtaVzUwSUVOdmJYQjFkR0YwYVc5dWN5d2dkMmhwWTJnZ2QyOTFiR1FnWW1VZ2FXNTJZV3hwWkdGMFpXUWdhV1lnZEdocGN5QkVaWEJsYm1SbGJtTjVJSGRsY21VZ2RHOGdZMmhoYm1kbExseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhKbGRIVnlibk1nZTBKdmIyeGxZVzU5WEc0Z0tpOWNibFJ5WVdOcmNpNUVaWEJsYm1SbGJtTjVMbkJ5YjNSdmRIbHdaUzVvWVhORVpYQmxibVJsYm5SeklEMGdablZ1WTNScGIyNGdLQ2tnZTF4dVhIUjJZWElnYzJWc1ppQTlJSFJvYVhNN1hHNWNkR1p2Y2loMllYSWdhV1FnYVc0Z2MyVnNaaTVmWkdWd1pXNWtaVzUwYzBKNVNXUXBYRzVjZEZ4MGNtVjBkWEp1SUhSeWRXVTdYRzVjZEhKbGRIVnliaUJtWVd4elpUdGNibjA3WEc1Y2JpOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkzUnlZV05yWlhKZlpteDFjMmhjYmx4dUx5b3FYRzRnS2lCQWMzVnRiV0Z5ZVNCUWNtOWpaWE56SUdGc2JDQnlaV0ZqZEdsMlpTQjFjR1JoZEdWeklHbHRiV1ZrYVdGMFpXeDVJR0Z1WkNCbGJuTjFjbVVnZEdoaGRDQmhiR3dnYVc1MllXeHBaR0YwWldRZ1kyOXRjSFYwWVhScGIyNXpJR0Z5WlNCeVpYSjFiaTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUwxeHVWSEpoWTJ0eUxtWnNkWE5vSUQwZ1puVnVZM1JwYjI0Z0tGOXZjSFJ6S1NCN1hHNWNkQzh2SUZoWVdDQlhhR0YwSUhCaGNuUWdiMllnZEdobElHTnZiVzFsYm5RZ1ltVnNiM2NnYVhNZ2MzUnBiR3dnZEhKMVpUOGdLRmRsSUc1dklHeHZibWRsY2x4dVhIUXZMeUJvWVhabElGTndZWEpyS1Z4dVhIUXZMMXh1WEhRdkx5Qk9aWE4wWldRZ1pteDFjMmdnWTI5MWJHUWdjR3hoZFhOcFlteDVJR2hoY0hCbGJpQnBaaXdnYzJGNUxDQmhJR1pzZFhOb0lHTmhkWE5sYzF4dVhIUXZMeUJFVDAwZ2JYVjBZWFJwYjI0c0lIZG9hV05vSUdOaGRYTmxjeUJoSUZ3aVlteDFjbHdpSUdWMlpXNTBMQ0IzYUdsamFDQnlkVzV6SUdGdVhHNWNkQzh2SUdGd2NDQmxkbVZ1ZENCb1lXNWtiR1Z5SUhSb1lYUWdZMkZzYkhNZ1ZISmhZMnR5TG1ac2RYTm9MaUFnUVhRZ2RHaGxJRzF2YldWdWRGeHVYSFF2THlCVGNHRnlheUJpYkc5amEzTWdaWFpsYm5RZ2FHRnVaR3hsY25NZ1pIVnlhVzVuSUVSUFRTQnRkWFJoZEdsdmJpQmhibmwzWVhrc1hHNWNkQzh2SUdKbFkyRjFjMlVnZEdobElFeHBkbVZTWVc1blpTQjBjbVZsSUdsemJpZDBJSFpoYkdsa0xpQWdRVzVrSUhkbElHUnZiaWQwSUdoaGRtVmNibHgwTHk4Z1lXNTVJSFZ6WldaMWJDQnViM1JwYjI0Z2IyWWdZU0J1WlhOMFpXUWdabXgxYzJndVhHNWNkQzh2WEc1Y2RDOHZJR2gwZEhCek9pOHZZWEJ3TG1GellXNWhMbU52YlM4d0x6RTFPVGt3T0RNek1ESTBOQzh6T0RVeE16Z3lNek00TlRaY2JseDBhV1lnS0dsdVJteDFjMmdwWEc1Y2RGeDBkR2h5YjNjZ2JtVjNJRVZ5Y205eUtGd2lRMkZ1SjNRZ1kyRnNiQ0JVY21GamEzSXVabXgxYzJnZ2QyaHBiR1VnWm14MWMyaHBibWRjSWlrN1hHNWNibHgwYVdZZ0tHbHVRMjl0Y0hWMFpTbGNibHgwWEhSMGFISnZkeUJ1WlhjZ1JYSnliM0lvWENKRFlXNG5kQ0JtYkhWemFDQnBibk5wWkdVZ1ZISmhZMnR5TG1GMWRHOXlkVzVjSWlrN1hHNWNibHgwYVc1R2JIVnphQ0E5SUhSeWRXVTdYRzVjZEhkcGJHeEdiSFZ6YUNBOUlIUnlkV1U3WEc1Y2RIUm9jbTkzUm1seWMzUkZjbkp2Y2lBOUlDRWhJQ2hmYjNCMGN5QW1KaUJmYjNCMGN5NWZkR2h5YjNkR2FYSnpkRVZ5Y205eUtUdGNibHh1WEhSMllYSWdabWx1YVhOb1pXUlVjbmtnUFNCbVlXeHpaVHRjYmx4MGRISjVJSHRjYmx4MFhIUjNhR2xzWlNBb2NHVnVaR2x1WjBOdmJYQjFkR0YwYVc5dWN5NXNaVzVuZEdnZ2ZIeGNibHgwWEhSY2RGeDBYSFFnWVdaMFpYSkdiSFZ6YUVOaGJHeGlZV05yY3k1c1pXNW5kR2dwSUh0Y2JseHVYSFJjZEZ4MEx5OGdjbVZqYjIxd2RYUmxJR0ZzYkNCd1pXNWthVzVuSUdOdmJYQjFkR0YwYVc5dWMxeHVYSFJjZEZ4MGQyaHBiR1VnS0hCbGJtUnBibWREYjIxd2RYUmhkR2x2Ym5NdWJHVnVaM1JvS1NCN1hHNWNkRngwWEhSY2RIWmhjaUJqYjIxd0lEMGdjR1Z1WkdsdVowTnZiWEIxZEdGMGFXOXVjeTV6YUdsbWRDZ3BPMXh1WEhSY2RGeDBYSFJqYjIxd0xsOXlaV052YlhCMWRHVW9LVHRjYmx4MFhIUmNkSDFjYmx4dVhIUmNkRngwYVdZZ0tHRm1kR1Z5Um14MWMyaERZV3hzWW1GamEzTXViR1Z1WjNSb0tTQjdYRzVjZEZ4MFhIUmNkQzh2SUdOaGJHd2diMjVsSUdGbWRHVnlSbXgxYzJnZ1kyRnNiR0poWTJzc0lIZG9hV05vSUcxaGVWeHVYSFJjZEZ4MFhIUXZMeUJwYm5aaGJHbGtZWFJsSUcxdmNtVWdZMjl0Y0hWMFlYUnBiMjV6WEc1Y2RGeDBYSFJjZEhaaGNpQmpZaUE5SUdGbWRHVnlSbXgxYzJoRFlXeHNZbUZqYTNNdWMyaHBablFvS1R0Y2JseDBYSFJjZEZ4MGRISjVJSHRjYmx4MFhIUmNkRngwWEhSallpNW1iaTVqWVd4c0tHTmlMbU4wZUNrN1hHNWNkRngwWEhSY2RIMGdZMkYwWTJnZ0tHVXBJSHRjYmx4MFhIUmNkRngwWEhSZmRHaHliM2RQY2t4dlp5aGNJbUZtZEdWeVJteDFjMmhjSWl3Z1pTazdYRzVjZEZ4MFhIUmNkSDFjYmx4MFhIUmNkSDFjYmx4MFhIUjlYRzVjZEZ4MFptbHVhWE5vWldSVWNua2dQU0IwY25WbE8xeHVYSFI5SUdacGJtRnNiSGtnZTF4dVhIUmNkR2xtSUNnaElHWnBibWx6YUdWa1ZISjVLU0I3WEc1Y2RGeDBYSFF2THlCM1pTZHlaU0JsY25KdmNtbHVaMXh1WEhSY2RGeDBhVzVHYkhWemFDQTlJR1poYkhObE95QXZMeUJ1WldWa1pXUWdZbVZtYjNKbElHTmhiR3hwYm1jZ1lGUnlZV05yY2k1bWJIVnphQ2dwWUNCaFoyRnBibHh1WEhSY2RGeDBWSEpoWTJ0eUxtWnNkWE5vS0h0ZmRHaHliM2RHYVhKemRFVnljbTl5T2lCbVlXeHpaWDBwT3lBdkx5Qm1hVzVwYzJnZ1pteDFjMmhwYm1kY2JseDBYSFI5WEc1Y2RGeDBkMmxzYkVac2RYTm9JRDBnWm1Gc2MyVTdYRzVjZEZ4MGFXNUdiSFZ6YUNBOUlHWmhiSE5sTzF4dVhIUjlYRzU5TzF4dVhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TjBjbUZqYTJWeVgyRjFkRzl5ZFc1Y2JpOHZYRzR2THlCU2RXNGdaaWdwTGlCU1pXTnZjbVFnYVhSeklHUmxjR1Z1WkdWdVkybGxjeTRnVW1WeWRXNGdhWFFnZDJobGJtVjJaWElnZEdobFhHNHZMeUJrWlhCbGJtUmxibU5wWlhNZ1kyaGhibWRsTGx4dUx5OWNiaTh2SUZKbGRIVnlibk1nWVNCdVpYY2dRMjl0Y0hWMFlYUnBiMjRzSUhkb2FXTm9JR2x6SUdGc2MyOGdjR0Z6YzJWa0lIUnZJR1l1WEc0dkwxeHVMeThnVEdsdWEzTWdkR2hsSUdOdmJYQjFkR0YwYVc5dUlIUnZJSFJvWlNCamRYSnlaVzUwSUdOdmJYQjFkR0YwYVc5dVhHNHZMeUJ6YnlCMGFHRjBJR2wwSUdseklITjBiM0J3WldRZ2FXWWdkR2hsSUdOMWNuSmxiblFnWTI5dGNIVjBZWFJwYjI0Z2FYTWdhVzUyWVd4cFpHRjBaV1F1WEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1VuVnVJR0VnWm5WdVkzUnBiMjRnYm05M0lHRnVaQ0J5WlhKMWJpQnBkQ0JzWVhSbGNpQjNhR1Z1WlhabGNpQnBkSE1nWkdWd1pXNWtaVzVqYVdWeklHTm9ZVzVuWlM0Z1VtVjBkWEp1Y3lCaElFTnZiWEIxZEdGMGFXOXVJRzlpYW1WamRDQjBhR0YwSUdOaGJpQmlaU0IxYzJWa0lIUnZJSE4wYjNBZ2IzSWdiMkp6WlhKMlpTQjBhR1VnY21WeWRXNXVhVzVuTGx4dUlDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dUlDb2dRSEJoY21GdElIdEdkVzVqZEdsdmJuMGdjblZ1Um5WdVl5QlVhR1VnWm5WdVkzUnBiMjRnZEc4Z2NuVnVMaUJKZENCeVpXTmxhWFpsY3lCdmJtVWdZWEpuZFcxbGJuUTZJSFJvWlNCRGIyMXdkWFJoZEdsdmJpQnZZbXBsWTNRZ2RHaGhkQ0IzYVd4c0lHSmxJSEpsZEhWeWJtVmtMbHh1SUNvZ1FISmxkSFZ5Ym5NZ2UxUnlZV05yY2k1RGIyMXdkWFJoZEdsdmJuMWNiaUFxTDF4dVZISmhZMnR5TG1GMWRHOXlkVzRnUFNCbWRXNWpkR2x2YmlBb1ppd2dZM1I0S1NCN1hHNWNkR2xtSUNoMGVYQmxiMllnWmlBaFBUMGdKMloxYm1OMGFXOXVKeWxjYmx4MFhIUjBhSEp2ZHlCdVpYY2dSWEp5YjNJb0oxUnlZV05yY2k1aGRYUnZjblZ1SUhKbGNYVnBjbVZ6SUdFZ1puVnVZM1JwYjI0Z1lYSm5kVzFsYm5RbktUdGNibHh1WEhSamIyNXpkSEoxWTNScGJtZERiMjF3ZFhSaGRHbHZiaUE5SUhSeWRXVTdYRzVjZEhaaGNpQmpJRDBnYm1WM0lGUnlZV05yY2k1RGIyMXdkWFJoZEdsdmJpaG1MQ0JVY21GamEzSXVZM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVMQ0JqZEhncE8xeHVYRzVjZEdsbUlDaFVjbUZqYTNJdVlXTjBhWFpsS1Z4dVhIUmNkRlJ5WVdOcmNpNXZia2x1ZG1Gc2FXUmhkR1VvWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFJjZEZ4MFl5NXpkRzl3S0NrN1hHNWNkRngwZlNrN1hHNWNibHgwY21WMGRYSnVJR003WEc1OU8xeHVYRzR2THlCb2RIUndPaTh2Wkc5amN5NXRaWFJsYjNJdVkyOXRMeU4wY21GamEyVnlYMjV2Ym5KbFlXTjBhWFpsWEc0dkwxeHVMeThnVW5WdUlHQm1ZQ0IzYVhSb0lHNXZJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjRzSUhKbGRIVnlibWx1WnlCMGFHVWdjbVYwZFhKdUlIWmhiSFZsWEc0dkx5QnZaaUJnWm1BdUlDQlZjMlZrSUhSdklIUjFjbTRnYjJabUlISmxZV04wYVhacGRIa2dabTl5SUhSb1pTQmtkWEpoZEdsdmJpQnZaaUJnWm1Bc1hHNHZMeUJ6YnlCMGFHRjBJSEpsWVdOMGFYWmxJR1JoZEdFZ2MyOTFjbU5sY3lCaFkyTmxjM05sWkNCaWVTQmdabUFnZDJsc2JDQnViM1FnY21WemRXeDBJR2x1SUdGdWVWeHVMeThnWTI5dGNIVjBZWFJwYjI1eklHSmxhVzVuSUdsdWRtRnNhV1JoZEdWa0xseHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRkoxYmlCaElHWjFibU4wYVc5dUlIZHBkR2h2ZFhRZ2RISmhZMnRwYm1jZ1pHVndaVzVrWlc1amFXVnpMbHh1SUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1SUNvZ1FIQmhjbUZ0SUh0R2RXNWpkR2x2Ym4wZ1puVnVZeUJCSUdaMWJtTjBhVzl1SUhSdklHTmhiR3dnYVcxdFpXUnBZWFJsYkhrdVhHNGdLaTljYmxSeVlXTnJjaTV1YjI1U1pXRmpkR2wyWlNBOUlGeHVWSEpoWTJ0eUxtNXZibkpsWVdOMGFYWmxJRDBnWm5WdVkzUnBiMjRnS0dZc0lHTjBlQ2tnZTF4dVhIUjJZWElnY0hKbGRtbHZkWE1nUFNCVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1TzF4dVhIUnpaWFJEZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRvYm5Wc2JDazdYRzVjZEhSeWVTQjdYRzVjZEZ4MGNtVjBkWEp1SUdZdVkyRnNiQ2hqZEhncE8xeHVYSFI5SUdacGJtRnNiSGtnZTF4dVhIUmNkSE5sZEVOMWNuSmxiblJEYjIxd2RYUmhkR2x2Ymlod2NtVjJhVzkxY3lrN1hHNWNkSDFjYm4wN1hHNWNiaTh2SUd4cGEyVWdibTl1Y21WaFkzUnBkbVVnWW5WMElHMWhhMlZ6SUdFZ1puVnVZM1JwYjI0Z2FXNXpkR1ZoWkZ4dVZISmhZMnR5TG01dmJsSmxZV04wWVdKc1pTQTlJRnh1VkhKaFkydHlMbTV2Ym5KbFlXTjBZV0pzWlNBOUlHWjFibU4wYVc5dUlDaG1MQ0JqZEhncElIdGNibHgwY21WMGRYSnVJR1oxYm1OMGFXOXVLQ2tnZTF4dVhIUmNkSFpoY2lCaGNtZHpJRDBnWVhKbmRXMWxiblJ6TzF4dVhIUmNkR2xtSUNoamRIZ2dQVDBnYm5Wc2JDa2dZM1I0SUQwZ2RHaHBjenRjYmx4MFhIUnlaWFIxY200Z1ZISmhZMnR5TG01dmJuSmxZV04wYVhabEtHWjFibU4wYVc5dUtDa2dlMXh1WEhSY2RGeDBjbVYwZFhKdUlHWXVZWEJ3Ykhrb1kzUjRMQ0JoY21kektUdGNibHgwWEhSOUtUdGNibHgwZlR0Y2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STNSeVlXTnJaWEpmYjI1cGJuWmhiR2xrWVhSbFhHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVbVZuYVhOMFpYSnpJR0VnYm1WM0lGdGdiMjVKYm5aaGJHbGtZWFJsWUYwb0kyTnZiWEIxZEdGMGFXOXVYMjl1YVc1MllXeHBaR0YwWlNrZ1kyRnNiR0poWTJzZ2IyNGdkR2hsSUdOMWNuSmxiblFnWTI5dGNIVjBZWFJwYjI0Z0tIZG9hV05vSUcxMWMzUWdaWGhwYzNRcExDQjBieUJpWlNCallXeHNaV1FnYVcxdFpXUnBZWFJsYkhrZ2QyaGxiaUIwYUdVZ1kzVnljbVZ1ZENCamIyMXdkWFJoZEdsdmJpQnBjeUJwYm5aaGJHbGtZWFJsWkNCdmNpQnpkRzl3Y0dWa0xseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRHZFc1amRHbHZibjBnWTJGc2JHSmhZMnNnUVNCallXeHNZbUZqYXlCbWRXNWpkR2x2YmlCMGFHRjBJSGRwYkd3Z1ltVWdhVzUyYjJ0bFpDQmhjeUJnWm5WdVl5aGpLV0FzSUhkb1pYSmxJR0JqWUNCcGN5QjBhR1VnWTI5dGNIVjBZWFJwYjI0Z2IyNGdkMmhwWTJnZ2RHaGxJR05oYkd4aVlXTnJJR2x6SUhKbFoybHpkR1Z5WldRdVhHNGdLaTljYmxSeVlXTnJjaTV2YmtsdWRtRnNhV1JoZEdVZ1BTQm1kVzVqZEdsdmJpQW9aaXdnWTNSNEtTQjdYRzVjZEdsbUlDZ2hJRlJ5WVdOcmNpNWhZM1JwZG1VcFhHNWNkRngwZEdoeWIzY2dibVYzSUVWeWNtOXlLRndpVkhKaFkydHlMbTl1U1c1MllXeHBaR0YwWlNCeVpYRjFhWEpsY3lCaElHTjFjbkpsYm5SRGIyMXdkWFJoZEdsdmJsd2lLVHRjYmx4dVhIUlVjbUZqYTNJdVkzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dUxtOXVTVzUyWVd4cFpHRjBaU2htTENCamRIZ3BPMXh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpkSEpoWTJ0bGNsOWhablJsY21ac2RYTm9YRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnVTJOb1pXUjFiR1Z6SUdFZ1puVnVZM1JwYjI0Z2RHOGdZbVVnWTJGc2JHVmtJR1IxY21sdVp5QjBhR1VnYm1WNGRDQm1iSFZ6YUN3Z2IzSWdiR0YwWlhJZ2FXNGdkR2hsSUdOMWNuSmxiblFnWm14MWMyZ2dhV1lnYjI1bElHbHpJR2x1SUhCeWIyZHlaWE56TENCaFpuUmxjaUJoYkd3Z2FXNTJZV3hwWkdGMFpXUWdZMjl0Y0hWMFlYUnBiMjV6SUdoaGRtVWdZbVZsYmlCeVpYSjFiaTRnSUZSb1pTQm1kVzVqZEdsdmJpQjNhV3hzSUdKbElISjFiaUJ2Ym1ObElHRnVaQ0J1YjNRZ2IyNGdjM1ZpYzJWeGRXVnVkQ0JtYkhWemFHVnpJSFZ1YkdWemN5QmdZV1owWlhKR2JIVnphR0FnYVhNZ1kyRnNiR1ZrSUdGbllXbHVMbHh1SUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1SUNvZ1FIQmhjbUZ0SUh0R2RXNWpkR2x2Ym4wZ1kyRnNiR0poWTJzZ1FTQm1kVzVqZEdsdmJpQjBieUJqWVd4c0lHRjBJR1pzZFhOb0lIUnBiV1V1WEc0Z0tpOWNibFJ5WVdOcmNpNWhablJsY2tac2RYTm9JRDBnWm5WdVkzUnBiMjRnS0dZc0lHTjBlQ2tnZTF4dVhIUmhablJsY2tac2RYTm9RMkZzYkdKaFkydHpMbkIxYzJnb2V5Qm1iam9nWml3Z1kzUjRPaUJqZEhnZ2ZTazdYRzVjZEhKbGNYVnBjbVZHYkhWemFDZ3BPMXh1ZlRzaVhYMD0iLCIvLyAgICAgVW5kZXJzY29yZS5qcyAxLjguM1xuLy8gICAgIGh0dHA6Ly91bmRlcnNjb3JlanMub3JnXG4vLyAgICAgKGMpIDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuLy8gICAgIFVuZGVyc2NvcmUgbWF5IGJlIGZyZWVseSBkaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG5cbihmdW5jdGlvbigpIHtcblxuICAvLyBCYXNlbGluZSBzZXR1cFxuICAvLyAtLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEVzdGFibGlzaCB0aGUgcm9vdCBvYmplY3QsIGB3aW5kb3dgIGluIHRoZSBicm93c2VyLCBvciBgZXhwb3J0c2Agb24gdGhlIHNlcnZlci5cbiAgdmFyIHJvb3QgPSB0aGlzO1xuXG4gIC8vIFNhdmUgdGhlIHByZXZpb3VzIHZhbHVlIG9mIHRoZSBgX2AgdmFyaWFibGUuXG4gIHZhciBwcmV2aW91c1VuZGVyc2NvcmUgPSByb290Ll87XG5cbiAgLy8gU2F2ZSBieXRlcyBpbiB0aGUgbWluaWZpZWQgKGJ1dCBub3QgZ3ppcHBlZCkgdmVyc2lvbjpcbiAgdmFyIEFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGUsIE9ialByb3RvID0gT2JqZWN0LnByb3RvdHlwZSwgRnVuY1Byb3RvID0gRnVuY3Rpb24ucHJvdG90eXBlO1xuXG4gIC8vIENyZWF0ZSBxdWljayByZWZlcmVuY2UgdmFyaWFibGVzIGZvciBzcGVlZCBhY2Nlc3MgdG8gY29yZSBwcm90b3R5cGVzLlxuICB2YXJcbiAgICBwdXNoICAgICAgICAgICAgID0gQXJyYXlQcm90by5wdXNoLFxuICAgIHNsaWNlICAgICAgICAgICAgPSBBcnJheVByb3RvLnNsaWNlLFxuICAgIHRvU3RyaW5nICAgICAgICAgPSBPYmpQcm90by50b1N0cmluZyxcbiAgICBoYXNPd25Qcm9wZXJ0eSAgID0gT2JqUHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbiAgLy8gQWxsICoqRUNNQVNjcmlwdCA1KiogbmF0aXZlIGZ1bmN0aW9uIGltcGxlbWVudGF0aW9ucyB0aGF0IHdlIGhvcGUgdG8gdXNlXG4gIC8vIGFyZSBkZWNsYXJlZCBoZXJlLlxuICB2YXJcbiAgICBuYXRpdmVJc0FycmF5ICAgICAgPSBBcnJheS5pc0FycmF5LFxuICAgIG5hdGl2ZUtleXMgICAgICAgICA9IE9iamVjdC5rZXlzLFxuICAgIG5hdGl2ZUJpbmQgICAgICAgICA9IEZ1bmNQcm90by5iaW5kLFxuICAgIG5hdGl2ZUNyZWF0ZSAgICAgICA9IE9iamVjdC5jcmVhdGU7XG5cbiAgLy8gTmFrZWQgZnVuY3Rpb24gcmVmZXJlbmNlIGZvciBzdXJyb2dhdGUtcHJvdG90eXBlLXN3YXBwaW5nLlxuICB2YXIgQ3RvciA9IGZ1bmN0aW9uKCl7fTtcblxuICAvLyBDcmVhdGUgYSBzYWZlIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yIHVzZSBiZWxvdy5cbiAgdmFyIF8gPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqIGluc3RhbmNlb2YgXykgcmV0dXJuIG9iajtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgXykpIHJldHVybiBuZXcgXyhvYmopO1xuICAgIHRoaXMuX3dyYXBwZWQgPSBvYmo7XG4gIH07XG5cbiAgLy8gRXhwb3J0IHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgKipOb2RlLmpzKiosIHdpdGhcbiAgLy8gYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgZm9yIHRoZSBvbGQgYHJlcXVpcmUoKWAgQVBJLiBJZiB3ZSdyZSBpblxuICAvLyB0aGUgYnJvd3NlciwgYWRkIGBfYCBhcyBhIGdsb2JhbCBvYmplY3QuXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IF87XG4gICAgfVxuICAgIGV4cG9ydHMuXyA9IF87XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5fID0gXztcbiAgfVxuXG4gIC8vIEN1cnJlbnQgdmVyc2lvbi5cbiAgXy5WRVJTSU9OID0gJzEuOC4zJztcblxuICAvLyBJbnRlcm5hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gZWZmaWNpZW50IChmb3IgY3VycmVudCBlbmdpbmVzKSB2ZXJzaW9uXG4gIC8vIG9mIHRoZSBwYXNzZWQtaW4gY2FsbGJhY2ssIHRvIGJlIHJlcGVhdGVkbHkgYXBwbGllZCBpbiBvdGhlciBVbmRlcnNjb3JlXG4gIC8vIGZ1bmN0aW9ucy5cbiAgdmFyIG9wdGltaXplQ2IgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0LCBhcmdDb3VudCkge1xuICAgIGlmIChjb250ZXh0ID09PSB2b2lkIDApIHJldHVybiBmdW5jO1xuICAgIHN3aXRjaCAoYXJnQ291bnQgPT0gbnVsbCA/IDMgOiBhcmdDb3VudCkge1xuICAgICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSk7XG4gICAgICB9O1xuICAgICAgY2FzZSAyOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIG90aGVyKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIG90aGVyKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDM6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgICAgfTtcbiAgICAgIGNhc2UgNDogcmV0dXJuIGZ1bmN0aW9uKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCBhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBBIG1vc3RseS1pbnRlcm5hbCBmdW5jdGlvbiB0byBnZW5lcmF0ZSBjYWxsYmFja3MgdGhhdCBjYW4gYmUgYXBwbGllZFxuICAvLyB0byBlYWNoIGVsZW1lbnQgaW4gYSBjb2xsZWN0aW9uLCByZXR1cm5pbmcgdGhlIGRlc2lyZWQgcmVzdWx0IOKAlCBlaXRoZXJcbiAgLy8gaWRlbnRpdHksIGFuIGFyYml0cmFyeSBjYWxsYmFjaywgYSBwcm9wZXJ0eSBtYXRjaGVyLCBvciBhIHByb3BlcnR5IGFjY2Vzc29yLlxuICB2YXIgY2IgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCwgYXJnQ291bnQpIHtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkgcmV0dXJuIF8uaWRlbnRpdHk7XG4gICAgaWYgKF8uaXNGdW5jdGlvbih2YWx1ZSkpIHJldHVybiBvcHRpbWl6ZUNiKHZhbHVlLCBjb250ZXh0LCBhcmdDb3VudCk7XG4gICAgaWYgKF8uaXNPYmplY3QodmFsdWUpKSByZXR1cm4gXy5tYXRjaGVyKHZhbHVlKTtcbiAgICByZXR1cm4gXy5wcm9wZXJ0eSh2YWx1ZSk7XG4gIH07XG4gIF8uaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBjYih2YWx1ZSwgY29udGV4dCwgSW5maW5pdHkpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhc3NpZ25lciBmdW5jdGlvbnMuXG4gIHZhciBjcmVhdGVBc3NpZ25lciA9IGZ1bmN0aW9uKGtleXNGdW5jLCB1bmRlZmluZWRPbmx5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICBpZiAobGVuZ3RoIDwgMiB8fCBvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMTsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpbmRleF0sXG4gICAgICAgICAgICBrZXlzID0ga2V5c0Z1bmMoc291cmNlKSxcbiAgICAgICAgICAgIGwgPSBrZXlzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICBpZiAoIXVuZGVmaW5lZE9ubHkgfHwgb2JqW2tleV0gPT09IHZvaWQgMCkgb2JqW2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhIG5ldyBvYmplY3QgdGhhdCBpbmhlcml0cyBmcm9tIGFub3RoZXIuXG4gIHZhciBiYXNlQ3JlYXRlID0gZnVuY3Rpb24ocHJvdG90eXBlKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KHByb3RvdHlwZSkpIHJldHVybiB7fTtcbiAgICBpZiAobmF0aXZlQ3JlYXRlKSByZXR1cm4gbmF0aXZlQ3JlYXRlKHByb3RvdHlwZSk7XG4gICAgQ3Rvci5wcm90b3R5cGUgPSBwcm90b3R5cGU7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBDdG9yO1xuICAgIEN0b3IucHJvdG90eXBlID0gbnVsbDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIHZhciBwcm9wZXJ0eSA9IGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBvYmogPT0gbnVsbCA/IHZvaWQgMCA6IG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gSGVscGVyIGZvciBjb2xsZWN0aW9uIG1ldGhvZHMgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYSBjb2xsZWN0aW9uXG4gIC8vIHNob3VsZCBiZSBpdGVyYXRlZCBhcyBhbiBhcnJheSBvciBhcyBhbiBvYmplY3RcbiAgLy8gUmVsYXRlZDogaHR0cDovL3Blb3BsZS5tb3ppbGxhLm9yZy9+am9yZW5kb3JmZi9lczYtZHJhZnQuaHRtbCNzZWMtdG9sZW5ndGhcbiAgLy8gQXZvaWRzIGEgdmVyeSBuYXN0eSBpT1MgOCBKSVQgYnVnIG9uIEFSTS02NC4gIzIwOTRcbiAgdmFyIE1BWF9BUlJBWV9JTkRFWCA9IE1hdGgucG93KDIsIDUzKSAtIDE7XG4gIHZhciBnZXRMZW5ndGggPSBwcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gIHZhciBpc0FycmF5TGlrZSA9IGZ1bmN0aW9uKGNvbGxlY3Rpb24pIHtcbiAgICB2YXIgbGVuZ3RoID0gZ2V0TGVuZ3RoKGNvbGxlY3Rpb24pO1xuICAgIHJldHVybiB0eXBlb2YgbGVuZ3RoID09ICdudW1iZXInICYmIGxlbmd0aCA+PSAwICYmIGxlbmd0aCA8PSBNQVhfQVJSQVlfSU5ERVg7XG4gIH07XG5cbiAgLy8gQ29sbGVjdGlvbiBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBUaGUgY29ybmVyc3RvbmUsIGFuIGBlYWNoYCBpbXBsZW1lbnRhdGlvbiwgYWthIGBmb3JFYWNoYC5cbiAgLy8gSGFuZGxlcyByYXcgb2JqZWN0cyBpbiBhZGRpdGlvbiB0byBhcnJheS1saWtlcy4gVHJlYXRzIGFsbFxuICAvLyBzcGFyc2UgYXJyYXktbGlrZXMgYXMgaWYgdGhleSB3ZXJlIGRlbnNlLlxuICBfLmVhY2ggPSBfLmZvckVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIgaSwgbGVuZ3RoO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopKSB7XG4gICAgICBmb3IgKGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaXRlcmF0ZWUob2JqW2ldLCBpLCBvYmopO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgICAgZm9yIChpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpdGVyYXRlZShvYmpba2V5c1tpXV0sIGtleXNbaV0sIG9iaik7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRlZSB0byBlYWNoIGVsZW1lbnQuXG4gIF8ubWFwID0gXy5jb2xsZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoLFxuICAgICAgICByZXN1bHRzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgcmVzdWx0c1tpbmRleF0gPSBpdGVyYXRlZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIHJlZHVjaW5nIGZ1bmN0aW9uIGl0ZXJhdGluZyBsZWZ0IG9yIHJpZ2h0LlxuICBmdW5jdGlvbiBjcmVhdGVSZWR1Y2UoZGlyKSB7XG4gICAgLy8gT3B0aW1pemVkIGl0ZXJhdG9yIGZ1bmN0aW9uIGFzIHVzaW5nIGFyZ3VtZW50cy5sZW5ndGhcbiAgICAvLyBpbiB0aGUgbWFpbiBmdW5jdGlvbiB3aWxsIGRlb3B0aW1pemUgdGhlLCBzZWUgIzE5OTEuXG4gICAgZnVuY3Rpb24gaXRlcmF0b3Iob2JqLCBpdGVyYXRlZSwgbWVtbywga2V5cywgaW5kZXgsIGxlbmd0aCkge1xuICAgICAgZm9yICg7IGluZGV4ID49IDAgJiYgaW5kZXggPCBsZW5ndGg7IGluZGV4ICs9IGRpcikge1xuICAgICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgICBtZW1vID0gaXRlcmF0ZWUobWVtbywgb2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGNvbnRleHQpIHtcbiAgICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCwgNCk7XG4gICAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoLFxuICAgICAgICAgIGluZGV4ID0gZGlyID4gMCA/IDAgOiBsZW5ndGggLSAxO1xuICAgICAgLy8gRGV0ZXJtaW5lIHRoZSBpbml0aWFsIHZhbHVlIGlmIG5vbmUgaXMgcHJvdmlkZWQuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgbWVtbyA9IG9ialtrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleF07XG4gICAgICAgIGluZGV4ICs9IGRpcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpdGVyYXRvcihvYmosIGl0ZXJhdGVlLCBtZW1vLCBrZXlzLCBpbmRleCwgbGVuZ3RoKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gKipSZWR1Y2UqKiBidWlsZHMgdXAgYSBzaW5nbGUgcmVzdWx0IGZyb20gYSBsaXN0IG9mIHZhbHVlcywgYWthIGBpbmplY3RgLFxuICAvLyBvciBgZm9sZGxgLlxuICBfLnJlZHVjZSA9IF8uZm9sZGwgPSBfLmluamVjdCA9IGNyZWF0ZVJlZHVjZSgxKTtcblxuICAvLyBUaGUgcmlnaHQtYXNzb2NpYXRpdmUgdmVyc2lvbiBvZiByZWR1Y2UsIGFsc28ga25vd24gYXMgYGZvbGRyYC5cbiAgXy5yZWR1Y2VSaWdodCA9IF8uZm9sZHIgPSBjcmVhdGVSZWR1Y2UoLTEpO1xuXG4gIC8vIFJldHVybiB0aGUgZmlyc3QgdmFsdWUgd2hpY2ggcGFzc2VzIGEgdHJ1dGggdGVzdC4gQWxpYXNlZCBhcyBgZGV0ZWN0YC5cbiAgXy5maW5kID0gXy5kZXRlY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHZhciBrZXk7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHtcbiAgICAgIGtleSA9IF8uZmluZEluZGV4KG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAga2V5ID0gXy5maW5kS2V5KG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKGtleSAhPT0gdm9pZCAwICYmIGtleSAhPT0gLTEpIHJldHVybiBvYmpba2V5XTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyB0aGF0IHBhc3MgYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBzZWxlY3RgLlxuICBfLmZpbHRlciA9IF8uc2VsZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAocHJlZGljYXRlKHZhbHVlLCBpbmRleCwgbGlzdCkpIHJlc3VsdHMucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgZm9yIHdoaWNoIGEgdHJ1dGggdGVzdCBmYWlscy5cbiAgXy5yZWplY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIF8ubmVnYXRlKGNiKHByZWRpY2F0ZSkpLCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgd2hldGhlciBhbGwgb2YgdGhlIGVsZW1lbnRzIG1hdGNoIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgYWxsYC5cbiAgXy5ldmVyeSA9IF8uYWxsID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICBpZiAoIXByZWRpY2F0ZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIGF0IGxlYXN0IG9uZSBlbGVtZW50IGluIHRoZSBvYmplY3QgbWF0Y2hlcyBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYGFueWAuXG4gIF8uc29tZSA9IF8uYW55ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgdGhlIGFycmF5IG9yIG9iamVjdCBjb250YWlucyBhIGdpdmVuIGl0ZW0gKHVzaW5nIGA9PT1gKS5cbiAgLy8gQWxpYXNlZCBhcyBgaW5jbHVkZXNgIGFuZCBgaW5jbHVkZWAuXG4gIF8uY29udGFpbnMgPSBfLmluY2x1ZGVzID0gXy5pbmNsdWRlID0gZnVuY3Rpb24ob2JqLCBpdGVtLCBmcm9tSW5kZXgsIGd1YXJkKSB7XG4gICAgaWYgKCFpc0FycmF5TGlrZShvYmopKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgIGlmICh0eXBlb2YgZnJvbUluZGV4ICE9ICdudW1iZXInIHx8IGd1YXJkKSBmcm9tSW5kZXggPSAwO1xuICAgIHJldHVybiBfLmluZGV4T2Yob2JqLCBpdGVtLCBmcm9tSW5kZXgpID49IDA7XG4gIH07XG5cbiAgLy8gSW52b2tlIGEgbWV0aG9kICh3aXRoIGFyZ3VtZW50cykgb24gZXZlcnkgaXRlbSBpbiBhIGNvbGxlY3Rpb24uXG4gIF8uaW52b2tlID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgaXNGdW5jID0gXy5pc0Z1bmN0aW9uKG1ldGhvZCk7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHZhciBmdW5jID0gaXNGdW5jID8gbWV0aG9kIDogdmFsdWVbbWV0aG9kXTtcbiAgICAgIHJldHVybiBmdW5jID09IG51bGwgPyBmdW5jIDogZnVuYy5hcHBseSh2YWx1ZSwgYXJncyk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgbWFwYDogZmV0Y2hpbmcgYSBwcm9wZXJ0eS5cbiAgXy5wbHVjayA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgXy5wcm9wZXJ0eShrZXkpKTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaWx0ZXJgOiBzZWxlY3Rpbmcgb25seSBvYmplY3RzXG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ud2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgXy5tYXRjaGVyKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmluZGA6IGdldHRpbmcgdGhlIGZpcnN0IG9iamVjdFxuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmZpbmRXaGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy5maW5kKG9iaiwgXy5tYXRjaGVyKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtYXhpbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1heCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gLUluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSAtSW5maW5pdHksXG4gICAgICAgIHZhbHVlLCBjb21wdXRlZDtcbiAgICBpZiAoaXRlcmF0ZWUgPT0gbnVsbCAmJiBvYmogIT0gbnVsbCkge1xuICAgICAgb2JqID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhbHVlID0gb2JqW2ldO1xuICAgICAgICBpZiAodmFsdWUgPiByZXN1bHQpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgICAgIGlmIChjb21wdXRlZCA+IGxhc3RDb21wdXRlZCB8fCBjb21wdXRlZCA9PT0gLUluZmluaXR5ICYmIHJlc3VsdCA9PT0gLUluZmluaXR5KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgICAgbGFzdENvbXB1dGVkID0gY29tcHV0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWluaW11bSBlbGVtZW50IChvciBlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgXy5taW4gPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IEluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSBJbmZpbml0eSxcbiAgICAgICAgdmFsdWUsIGNvbXB1dGVkO1xuICAgIGlmIChpdGVyYXRlZSA9PSBudWxsICYmIG9iaiAhPSBudWxsKSB7XG4gICAgICBvYmogPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFsdWUgPSBvYmpbaV07XG4gICAgICAgIGlmICh2YWx1ZSA8IHJlc3VsdCkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICAgICAgaWYgKGNvbXB1dGVkIDwgbGFzdENvbXB1dGVkIHx8IGNvbXB1dGVkID09PSBJbmZpbml0eSAmJiByZXN1bHQgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgICAgbGFzdENvbXB1dGVkID0gY29tcHV0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFNodWZmbGUgYSBjb2xsZWN0aW9uLCB1c2luZyB0aGUgbW9kZXJuIHZlcnNpb24gb2YgdGhlXG4gIC8vIFtGaXNoZXItWWF0ZXMgc2h1ZmZsZV0oaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9GaXNoZXLigJNZYXRlc19zaHVmZmxlKS5cbiAgXy5zaHVmZmxlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHNldCA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBzZXQubGVuZ3RoO1xuICAgIHZhciBzaHVmZmxlZCA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwLCByYW5kOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgcmFuZCA9IF8ucmFuZG9tKDAsIGluZGV4KTtcbiAgICAgIGlmIChyYW5kICE9PSBpbmRleCkgc2h1ZmZsZWRbaW5kZXhdID0gc2h1ZmZsZWRbcmFuZF07XG4gICAgICBzaHVmZmxlZFtyYW5kXSA9IHNldFtpbmRleF07XG4gICAgfVxuICAgIHJldHVybiBzaHVmZmxlZDtcbiAgfTtcblxuICAvLyBTYW1wbGUgKipuKiogcmFuZG9tIHZhbHVlcyBmcm9tIGEgY29sbGVjdGlvbi5cbiAgLy8gSWYgKipuKiogaXMgbm90IHNwZWNpZmllZCwgcmV0dXJucyBhIHNpbmdsZSByYW5kb20gZWxlbWVudC5cbiAgLy8gVGhlIGludGVybmFsIGBndWFyZGAgYXJndW1lbnQgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgbWFwYC5cbiAgXy5zYW1wbGUgPSBmdW5jdGlvbihvYmosIG4sIGd1YXJkKSB7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkge1xuICAgICAgaWYgKCFpc0FycmF5TGlrZShvYmopKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgICAgcmV0dXJuIG9ialtfLnJhbmRvbShvYmoubGVuZ3RoIC0gMSldO1xuICAgIH1cbiAgICByZXR1cm4gXy5zaHVmZmxlKG9iaikuc2xpY2UoMCwgTWF0aC5tYXgoMCwgbikpO1xuICB9O1xuXG4gIC8vIFNvcnQgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiBwcm9kdWNlZCBieSBhbiBpdGVyYXRlZS5cbiAgXy5zb3J0QnkgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgcmV0dXJuIF8ucGx1Y2soXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgaW5kZXg6IGluZGV4LFxuICAgICAgICBjcml0ZXJpYTogaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KVxuICAgICAgfTtcbiAgICB9KS5zb3J0KGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWE7XG4gICAgICB2YXIgYiA9IHJpZ2h0LmNyaXRlcmlhO1xuICAgICAgaWYgKGEgIT09IGIpIHtcbiAgICAgICAgaWYgKGEgPiBiIHx8IGEgPT09IHZvaWQgMCkgcmV0dXJuIDE7XG4gICAgICAgIGlmIChhIDwgYiB8fCBiID09PSB2b2lkIDApIHJldHVybiAtMTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsZWZ0LmluZGV4IC0gcmlnaHQuaW5kZXg7XG4gICAgfSksICd2YWx1ZScpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIHVzZWQgZm9yIGFnZ3JlZ2F0ZSBcImdyb3VwIGJ5XCIgb3BlcmF0aW9ucy5cbiAgdmFyIGdyb3VwID0gZnVuY3Rpb24oYmVoYXZpb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgICAgdmFyIGtleSA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgb2JqKTtcbiAgICAgICAgYmVoYXZpb3IocmVzdWx0LCB2YWx1ZSwga2V5KTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEdyb3VwcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLiBQYXNzIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGVcbiAgLy8gdG8gZ3JvdXAgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBjcml0ZXJpb24uXG4gIF8uZ3JvdXBCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIGlmIChfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldLnB1c2godmFsdWUpOyBlbHNlIHJlc3VsdFtrZXldID0gW3ZhbHVlXTtcbiAgfSk7XG5cbiAgLy8gSW5kZXhlcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLCBzaW1pbGFyIHRvIGBncm91cEJ5YCwgYnV0IGZvclxuICAvLyB3aGVuIHlvdSBrbm93IHRoYXQgeW91ciBpbmRleCB2YWx1ZXMgd2lsbCBiZSB1bmlxdWUuXG4gIF8uaW5kZXhCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gIH0pO1xuXG4gIC8vIENvdW50cyBpbnN0YW5jZXMgb2YgYW4gb2JqZWN0IHRoYXQgZ3JvdXAgYnkgYSBjZXJ0YWluIGNyaXRlcmlvbi4gUGFzc1xuICAvLyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlIHRvIGNvdW50IGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGVcbiAgLy8gY3JpdGVyaW9uLlxuICBfLmNvdW50QnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIHZhbHVlLCBrZXkpIHtcbiAgICBpZiAoXy5oYXMocmVzdWx0LCBrZXkpKSByZXN1bHRba2V5XSsrOyBlbHNlIHJlc3VsdFtrZXldID0gMTtcbiAgfSk7XG5cbiAgLy8gU2FmZWx5IGNyZWF0ZSBhIHJlYWwsIGxpdmUgYXJyYXkgZnJvbSBhbnl0aGluZyBpdGVyYWJsZS5cbiAgXy50b0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFvYmopIHJldHVybiBbXTtcbiAgICBpZiAoXy5pc0FycmF5KG9iaikpIHJldHVybiBzbGljZS5jYWxsKG9iaik7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHJldHVybiBfLm1hcChvYmosIF8uaWRlbnRpdHkpO1xuICAgIHJldHVybiBfLnZhbHVlcyhvYmopO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzIGluIGFuIG9iamVjdC5cbiAgXy5zaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gMDtcbiAgICByZXR1cm4gaXNBcnJheUxpa2Uob2JqKSA/IG9iai5sZW5ndGggOiBfLmtleXMob2JqKS5sZW5ndGg7XG4gIH07XG5cbiAgLy8gU3BsaXQgYSBjb2xsZWN0aW9uIGludG8gdHdvIGFycmF5czogb25lIHdob3NlIGVsZW1lbnRzIGFsbCBzYXRpc2Z5IHRoZSBnaXZlblxuICAvLyBwcmVkaWNhdGUsIGFuZCBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIGRvIG5vdCBzYXRpc2Z5IHRoZSBwcmVkaWNhdGUuXG4gIF8ucGFydGl0aW9uID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBwYXNzID0gW10sIGZhaWwgPSBbXTtcbiAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBvYmopIHtcbiAgICAgIChwcmVkaWNhdGUodmFsdWUsIGtleSwgb2JqKSA/IHBhc3MgOiBmYWlsKS5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gW3Bhc3MsIGZhaWxdO1xuICB9O1xuXG4gIC8vIEFycmF5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAvLyBHZXQgdGhlIGZpcnN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGZpcnN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgaGVhZGAgYW5kIGB0YWtlYC4gVGhlICoqZ3VhcmQqKiBjaGVja1xuICAvLyBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8uZmlyc3QgPSBfLmhlYWQgPSBfLnRha2UgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbMF07XG4gICAgcmV0dXJuIF8uaW5pdGlhbChhcnJheSwgYXJyYXkubGVuZ3RoIC0gbik7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgbGFzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEVzcGVjaWFsbHkgdXNlZnVsIG9uXG4gIC8vIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIGFsbCB0aGUgdmFsdWVzIGluXG4gIC8vIHRoZSBhcnJheSwgZXhjbHVkaW5nIHRoZSBsYXN0IE4uXG4gIF8uaW5pdGlhbCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCAwLCBNYXRoLm1heCgwLCBhcnJheS5sZW5ndGggLSAobiA9PSBudWxsIHx8IGd1YXJkID8gMSA6IG4pKSk7XG4gIH07XG5cbiAgLy8gR2V0IHRoZSBsYXN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGxhc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LlxuICBfLmxhc3QgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbYXJyYXkubGVuZ3RoIC0gMV07XG4gICAgcmV0dXJuIF8ucmVzdChhcnJheSwgTWF0aC5tYXgoMCwgYXJyYXkubGVuZ3RoIC0gbikpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGZpcnN0IGVudHJ5IG9mIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgdGFpbGAgYW5kIGBkcm9wYC5cbiAgLy8gRXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgYW4gKipuKiogd2lsbCByZXR1cm5cbiAgLy8gdGhlIHJlc3QgTiB2YWx1ZXMgaW4gdGhlIGFycmF5LlxuICBfLnJlc3QgPSBfLnRhaWwgPSBfLmRyb3AgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgbiA9PSBudWxsIHx8IGd1YXJkID8gMSA6IG4pO1xuICB9O1xuXG4gIC8vIFRyaW0gb3V0IGFsbCBmYWxzeSB2YWx1ZXMgZnJvbSBhbiBhcnJheS5cbiAgXy5jb21wYWN0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIF8uaWRlbnRpdHkpO1xuICB9O1xuXG4gIC8vIEludGVybmFsIGltcGxlbWVudGF0aW9uIG9mIGEgcmVjdXJzaXZlIGBmbGF0dGVuYCBmdW5jdGlvbi5cbiAgdmFyIGZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgc2hhbGxvdywgc3RyaWN0LCBzdGFydEluZGV4KSB7XG4gICAgdmFyIG91dHB1dCA9IFtdLCBpZHggPSAwO1xuICAgIGZvciAodmFyIGkgPSBzdGFydEluZGV4IHx8IDAsIGxlbmd0aCA9IGdldExlbmd0aChpbnB1dCk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHZhbHVlID0gaW5wdXRbaV07XG4gICAgICBpZiAoaXNBcnJheUxpa2UodmFsdWUpICYmIChfLmlzQXJyYXkodmFsdWUpIHx8IF8uaXNBcmd1bWVudHModmFsdWUpKSkge1xuICAgICAgICAvL2ZsYXR0ZW4gY3VycmVudCBsZXZlbCBvZiBhcnJheSBvciBhcmd1bWVudHMgb2JqZWN0XG4gICAgICAgIGlmICghc2hhbGxvdykgdmFsdWUgPSBmbGF0dGVuKHZhbHVlLCBzaGFsbG93LCBzdHJpY3QpO1xuICAgICAgICB2YXIgaiA9IDAsIGxlbiA9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgb3V0cHV0Lmxlbmd0aCArPSBsZW47XG4gICAgICAgIHdoaWxlIChqIDwgbGVuKSB7XG4gICAgICAgICAgb3V0cHV0W2lkeCsrXSA9IHZhbHVlW2orK107XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIXN0cmljdCkge1xuICAgICAgICBvdXRwdXRbaWR4KytdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXQ7XG4gIH07XG5cbiAgLy8gRmxhdHRlbiBvdXQgYW4gYXJyYXksIGVpdGhlciByZWN1cnNpdmVseSAoYnkgZGVmYXVsdCksIG9yIGp1c3Qgb25lIGxldmVsLlxuICBfLmZsYXR0ZW4gPSBmdW5jdGlvbihhcnJheSwgc2hhbGxvdykge1xuICAgIHJldHVybiBmbGF0dGVuKGFycmF5LCBzaGFsbG93LCBmYWxzZSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgdmVyc2lvbiBvZiB0aGUgYXJyYXkgdGhhdCBkb2VzIG5vdCBjb250YWluIHRoZSBzcGVjaWZpZWQgdmFsdWUocykuXG4gIF8ud2l0aG91dCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZGlmZmVyZW5jZShhcnJheSwgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGEgZHVwbGljYXRlLWZyZWUgdmVyc2lvbiBvZiB0aGUgYXJyYXkuIElmIHRoZSBhcnJheSBoYXMgYWxyZWFkeVxuICAvLyBiZWVuIHNvcnRlZCwgeW91IGhhdmUgdGhlIG9wdGlvbiBvZiB1c2luZyBhIGZhc3RlciBhbGdvcml0aG0uXG4gIC8vIEFsaWFzZWQgYXMgYHVuaXF1ZWAuXG4gIF8udW5pcSA9IF8udW5pcXVlID0gZnVuY3Rpb24oYXJyYXksIGlzU29ydGVkLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGlmICghXy5pc0Jvb2xlYW4oaXNTb3J0ZWQpKSB7XG4gICAgICBjb250ZXh0ID0gaXRlcmF0ZWU7XG4gICAgICBpdGVyYXRlZSA9IGlzU29ydGVkO1xuICAgICAgaXNTb3J0ZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGl0ZXJhdGVlICE9IG51bGwpIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgc2VlbiA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB2YWx1ZSA9IGFycmF5W2ldLFxuICAgICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUgPyBpdGVyYXRlZSh2YWx1ZSwgaSwgYXJyYXkpIDogdmFsdWU7XG4gICAgICBpZiAoaXNTb3J0ZWQpIHtcbiAgICAgICAgaWYgKCFpIHx8IHNlZW4gIT09IGNvbXB1dGVkKSByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgIHNlZW4gPSBjb21wdXRlZDtcbiAgICAgIH0gZWxzZSBpZiAoaXRlcmF0ZWUpIHtcbiAgICAgICAgaWYgKCFfLmNvbnRhaW5zKHNlZW4sIGNvbXB1dGVkKSkge1xuICAgICAgICAgIHNlZW4ucHVzaChjb21wdXRlZCk7XG4gICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFfLmNvbnRhaW5zKHJlc3VsdCwgdmFsdWUpKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgdGhlIHVuaW9uOiBlYWNoIGRpc3RpbmN0IGVsZW1lbnQgZnJvbSBhbGwgb2ZcbiAgLy8gdGhlIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8udW5pb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bmlxKGZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCB0cnVlKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIGV2ZXJ5IGl0ZW0gc2hhcmVkIGJldHdlZW4gYWxsIHRoZVxuICAvLyBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLmludGVyc2VjdGlvbiA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHZhciBhcmdzTGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaXRlbSA9IGFycmF5W2ldO1xuICAgICAgaWYgKF8uY29udGFpbnMocmVzdWx0LCBpdGVtKSkgY29udGludWU7XG4gICAgICBmb3IgKHZhciBqID0gMTsgaiA8IGFyZ3NMZW5ndGg7IGorKykge1xuICAgICAgICBpZiAoIV8uY29udGFpbnMoYXJndW1lbnRzW2pdLCBpdGVtKSkgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoaiA9PT0gYXJnc0xlbmd0aCkgcmVzdWx0LnB1c2goaXRlbSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gVGFrZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIG9uZSBhcnJheSBhbmQgYSBudW1iZXIgb2Ygb3RoZXIgYXJyYXlzLlxuICAvLyBPbmx5IHRoZSBlbGVtZW50cyBwcmVzZW50IGluIGp1c3QgdGhlIGZpcnN0IGFycmF5IHdpbGwgcmVtYWluLlxuICBfLmRpZmZlcmVuY2UgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN0ID0gZmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUsIDEpO1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgZnVuY3Rpb24odmFsdWUpe1xuICAgICAgcmV0dXJuICFfLmNvbnRhaW5zKHJlc3QsIHZhbHVlKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBaaXAgdG9nZXRoZXIgbXVsdGlwbGUgbGlzdHMgaW50byBhIHNpbmdsZSBhcnJheSAtLSBlbGVtZW50cyB0aGF0IHNoYXJlXG4gIC8vIGFuIGluZGV4IGdvIHRvZ2V0aGVyLlxuICBfLnppcCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuemlwKGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgLy8gQ29tcGxlbWVudCBvZiBfLnppcC4gVW56aXAgYWNjZXB0cyBhbiBhcnJheSBvZiBhcnJheXMgYW5kIGdyb3Vwc1xuICAvLyBlYWNoIGFycmF5J3MgZWxlbWVudHMgb24gc2hhcmVkIGluZGljZXNcbiAgXy51bnppcCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIGxlbmd0aCA9IGFycmF5ICYmIF8ubWF4KGFycmF5LCBnZXRMZW5ndGgpLmxlbmd0aCB8fCAwO1xuICAgIHZhciByZXN1bHQgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgcmVzdWx0W2luZGV4XSA9IF8ucGx1Y2soYXJyYXksIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBDb252ZXJ0cyBsaXN0cyBpbnRvIG9iamVjdHMuIFBhc3MgZWl0aGVyIGEgc2luZ2xlIGFycmF5IG9mIGBba2V5LCB2YWx1ZV1gXG4gIC8vIHBhaXJzLCBvciB0d28gcGFyYWxsZWwgYXJyYXlzIG9mIHRoZSBzYW1lIGxlbmd0aCAtLSBvbmUgb2Yga2V5cywgYW5kIG9uZSBvZlxuICAvLyB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZXMuXG4gIF8ub2JqZWN0ID0gZnVuY3Rpb24obGlzdCwgdmFsdWVzKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgobGlzdCk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHZhbHVlcykge1xuICAgICAgICByZXN1bHRbbGlzdFtpXV0gPSB2YWx1ZXNbaV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRbbGlzdFtpXVswXV0gPSBsaXN0W2ldWzFdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIEdlbmVyYXRvciBmdW5jdGlvbiB0byBjcmVhdGUgdGhlIGZpbmRJbmRleCBhbmQgZmluZExhc3RJbmRleCBmdW5jdGlvbnNcbiAgZnVuY3Rpb24gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoZGlyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFycmF5LCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgICB2YXIgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTtcbiAgICAgIHZhciBpbmRleCA9IGRpciA+IDAgPyAwIDogbGVuZ3RoIC0gMTtcbiAgICAgIGZvciAoOyBpbmRleCA+PSAwICYmIGluZGV4IDwgbGVuZ3RoOyBpbmRleCArPSBkaXIpIHtcbiAgICAgICAgaWYgKHByZWRpY2F0ZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSkpIHJldHVybiBpbmRleDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgaW5kZXggb24gYW4gYXJyYXktbGlrZSB0aGF0IHBhc3NlcyBhIHByZWRpY2F0ZSB0ZXN0XG4gIF8uZmluZEluZGV4ID0gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoMSk7XG4gIF8uZmluZExhc3RJbmRleCA9IGNyZWF0ZVByZWRpY2F0ZUluZGV4RmluZGVyKC0xKTtcblxuICAvLyBVc2UgYSBjb21wYXJhdG9yIGZ1bmN0aW9uIHRvIGZpZ3VyZSBvdXQgdGhlIHNtYWxsZXN0IGluZGV4IGF0IHdoaWNoXG4gIC8vIGFuIG9iamVjdCBzaG91bGQgYmUgaW5zZXJ0ZWQgc28gYXMgdG8gbWFpbnRhaW4gb3JkZXIuIFVzZXMgYmluYXJ5IHNlYXJjaC5cbiAgXy5zb3J0ZWRJbmRleCA9IGZ1bmN0aW9uKGFycmF5LCBvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCwgMSk7XG4gICAgdmFyIHZhbHVlID0gaXRlcmF0ZWUob2JqKTtcbiAgICB2YXIgbG93ID0gMCwgaGlnaCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgd2hpbGUgKGxvdyA8IGhpZ2gpIHtcbiAgICAgIHZhciBtaWQgPSBNYXRoLmZsb29yKChsb3cgKyBoaWdoKSAvIDIpO1xuICAgICAgaWYgKGl0ZXJhdGVlKGFycmF5W21pZF0pIDwgdmFsdWUpIGxvdyA9IG1pZCArIDE7IGVsc2UgaGlnaCA9IG1pZDtcbiAgICB9XG4gICAgcmV0dXJuIGxvdztcbiAgfTtcblxuICAvLyBHZW5lcmF0b3IgZnVuY3Rpb24gdG8gY3JlYXRlIHRoZSBpbmRleE9mIGFuZCBsYXN0SW5kZXhPZiBmdW5jdGlvbnNcbiAgZnVuY3Rpb24gY3JlYXRlSW5kZXhGaW5kZXIoZGlyLCBwcmVkaWNhdGVGaW5kLCBzb3J0ZWRJbmRleCkge1xuICAgIHJldHVybiBmdW5jdGlvbihhcnJheSwgaXRlbSwgaWR4KSB7XG4gICAgICB2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgICBpZiAodHlwZW9mIGlkeCA9PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAoZGlyID4gMCkge1xuICAgICAgICAgICAgaSA9IGlkeCA+PSAwID8gaWR4IDogTWF0aC5tYXgoaWR4ICsgbGVuZ3RoLCBpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbmd0aCA9IGlkeCA+PSAwID8gTWF0aC5taW4oaWR4ICsgMSwgbGVuZ3RoKSA6IGlkeCArIGxlbmd0aCArIDE7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc29ydGVkSW5kZXggJiYgaWR4ICYmIGxlbmd0aCkge1xuICAgICAgICBpZHggPSBzb3J0ZWRJbmRleChhcnJheSwgaXRlbSk7XG4gICAgICAgIHJldHVybiBhcnJheVtpZHhdID09PSBpdGVtID8gaWR4IDogLTE7XG4gICAgICB9XG4gICAgICBpZiAoaXRlbSAhPT0gaXRlbSkge1xuICAgICAgICBpZHggPSBwcmVkaWNhdGVGaW5kKHNsaWNlLmNhbGwoYXJyYXksIGksIGxlbmd0aCksIF8uaXNOYU4pO1xuICAgICAgICByZXR1cm4gaWR4ID49IDAgPyBpZHggKyBpIDogLTE7XG4gICAgICB9XG4gICAgICBmb3IgKGlkeCA9IGRpciA+IDAgPyBpIDogbGVuZ3RoIC0gMTsgaWR4ID49IDAgJiYgaWR4IDwgbGVuZ3RoOyBpZHggKz0gZGlyKSB7XG4gICAgICAgIGlmIChhcnJheVtpZHhdID09PSBpdGVtKSByZXR1cm4gaWR4O1xuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBvY2N1cnJlbmNlIG9mIGFuIGl0ZW0gaW4gYW4gYXJyYXksXG4gIC8vIG9yIC0xIGlmIHRoZSBpdGVtIGlzIG5vdCBpbmNsdWRlZCBpbiB0aGUgYXJyYXkuXG4gIC8vIElmIHRoZSBhcnJheSBpcyBsYXJnZSBhbmQgYWxyZWFkeSBpbiBzb3J0IG9yZGVyLCBwYXNzIGB0cnVlYFxuICAvLyBmb3IgKippc1NvcnRlZCoqIHRvIHVzZSBiaW5hcnkgc2VhcmNoLlxuICBfLmluZGV4T2YgPSBjcmVhdGVJbmRleEZpbmRlcigxLCBfLmZpbmRJbmRleCwgXy5zb3J0ZWRJbmRleCk7XG4gIF8ubGFzdEluZGV4T2YgPSBjcmVhdGVJbmRleEZpbmRlcigtMSwgXy5maW5kTGFzdEluZGV4KTtcblxuICAvLyBHZW5lcmF0ZSBhbiBpbnRlZ2VyIEFycmF5IGNvbnRhaW5pbmcgYW4gYXJpdGhtZXRpYyBwcm9ncmVzc2lvbi4gQSBwb3J0IG9mXG4gIC8vIHRoZSBuYXRpdmUgUHl0aG9uIGByYW5nZSgpYCBmdW5jdGlvbi4gU2VlXG4gIC8vIFt0aGUgUHl0aG9uIGRvY3VtZW50YXRpb25dKGh0dHA6Ly9kb2NzLnB5dGhvbi5vcmcvbGlicmFyeS9mdW5jdGlvbnMuaHRtbCNyYW5nZSkuXG4gIF8ucmFuZ2UgPSBmdW5jdGlvbihzdGFydCwgc3RvcCwgc3RlcCkge1xuICAgIGlmIChzdG9wID09IG51bGwpIHtcbiAgICAgIHN0b3AgPSBzdGFydCB8fCAwO1xuICAgICAgc3RhcnQgPSAwO1xuICAgIH1cbiAgICBzdGVwID0gc3RlcCB8fCAxO1xuXG4gICAgdmFyIGxlbmd0aCA9IE1hdGgubWF4KE1hdGguY2VpbCgoc3RvcCAtIHN0YXJ0KSAvIHN0ZXApLCAwKTtcbiAgICB2YXIgcmFuZ2UgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaWR4ID0gMDsgaWR4IDwgbGVuZ3RoOyBpZHgrKywgc3RhcnQgKz0gc3RlcCkge1xuICAgICAgcmFuZ2VbaWR4XSA9IHN0YXJ0O1xuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfTtcblxuICAvLyBGdW5jdGlvbiAoYWhlbSkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIERldGVybWluZXMgd2hldGhlciB0byBleGVjdXRlIGEgZnVuY3Rpb24gYXMgYSBjb25zdHJ1Y3RvclxuICAvLyBvciBhIG5vcm1hbCBmdW5jdGlvbiB3aXRoIHRoZSBwcm92aWRlZCBhcmd1bWVudHNcbiAgdmFyIGV4ZWN1dGVCb3VuZCA9IGZ1bmN0aW9uKHNvdXJjZUZ1bmMsIGJvdW5kRnVuYywgY29udGV4dCwgY2FsbGluZ0NvbnRleHQsIGFyZ3MpIHtcbiAgICBpZiAoIShjYWxsaW5nQ29udGV4dCBpbnN0YW5jZW9mIGJvdW5kRnVuYykpIHJldHVybiBzb3VyY2VGdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgIHZhciBzZWxmID0gYmFzZUNyZWF0ZShzb3VyY2VGdW5jLnByb3RvdHlwZSk7XG4gICAgdmFyIHJlc3VsdCA9IHNvdXJjZUZ1bmMuYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgaWYgKF8uaXNPYmplY3QocmVzdWx0KSkgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gc2VsZjtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSBmdW5jdGlvbiBib3VuZCB0byBhIGdpdmVuIG9iamVjdCAoYXNzaWduaW5nIGB0aGlzYCwgYW5kIGFyZ3VtZW50cyxcbiAgLy8gb3B0aW9uYWxseSkuIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBGdW5jdGlvbi5iaW5kYCBpZlxuICAvLyBhdmFpbGFibGUuXG4gIF8uYmluZCA9IGZ1bmN0aW9uKGZ1bmMsIGNvbnRleHQpIHtcbiAgICBpZiAobmF0aXZlQmluZCAmJiBmdW5jLmJpbmQgPT09IG5hdGl2ZUJpbmQpIHJldHVybiBuYXRpdmVCaW5kLmFwcGx5KGZ1bmMsIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgaWYgKCFfLmlzRnVuY3Rpb24oZnVuYykpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0JpbmQgbXVzdCBiZSBjYWxsZWQgb24gYSBmdW5jdGlvbicpO1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBib3VuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4ZWN1dGVCb3VuZChmdW5jLCBib3VuZCwgY29udGV4dCwgdGhpcywgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbiAgICByZXR1cm4gYm91bmQ7XG4gIH07XG5cbiAgLy8gUGFydGlhbGx5IGFwcGx5IGEgZnVuY3Rpb24gYnkgY3JlYXRpbmcgYSB2ZXJzaW9uIHRoYXQgaGFzIGhhZCBzb21lIG9mIGl0c1xuICAvLyBhcmd1bWVudHMgcHJlLWZpbGxlZCwgd2l0aG91dCBjaGFuZ2luZyBpdHMgZHluYW1pYyBgdGhpc2AgY29udGV4dC4gXyBhY3RzXG4gIC8vIGFzIGEgcGxhY2Vob2xkZXIsIGFsbG93aW5nIGFueSBjb21iaW5hdGlvbiBvZiBhcmd1bWVudHMgdG8gYmUgcHJlLWZpbGxlZC5cbiAgXy5wYXJ0aWFsID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciBib3VuZEFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgdmFyIGJvdW5kID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcG9zaXRpb24gPSAwLCBsZW5ndGggPSBib3VuZEFyZ3MubGVuZ3RoO1xuICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW5ndGgpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBhcmdzW2ldID0gYm91bmRBcmdzW2ldID09PSBfID8gYXJndW1lbnRzW3Bvc2l0aW9uKytdIDogYm91bmRBcmdzW2ldO1xuICAgICAgfVxuICAgICAgd2hpbGUgKHBvc2l0aW9uIDwgYXJndW1lbnRzLmxlbmd0aCkgYXJncy5wdXNoKGFyZ3VtZW50c1twb3NpdGlvbisrXSk7XG4gICAgICByZXR1cm4gZXhlY3V0ZUJvdW5kKGZ1bmMsIGJvdW5kLCB0aGlzLCB0aGlzLCBhcmdzKTtcbiAgICB9O1xuICAgIHJldHVybiBib3VuZDtcbiAgfTtcblxuICAvLyBCaW5kIGEgbnVtYmVyIG9mIGFuIG9iamVjdCdzIG1ldGhvZHMgdG8gdGhhdCBvYmplY3QuIFJlbWFpbmluZyBhcmd1bWVudHNcbiAgLy8gYXJlIHRoZSBtZXRob2QgbmFtZXMgdG8gYmUgYm91bmQuIFVzZWZ1bCBmb3IgZW5zdXJpbmcgdGhhdCBhbGwgY2FsbGJhY2tzXG4gIC8vIGRlZmluZWQgb24gYW4gb2JqZWN0IGJlbG9uZyB0byBpdC5cbiAgXy5iaW5kQWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGksIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsIGtleTtcbiAgICBpZiAobGVuZ3RoIDw9IDEpIHRocm93IG5ldyBFcnJvcignYmluZEFsbCBtdXN0IGJlIHBhc3NlZCBmdW5jdGlvbiBuYW1lcycpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAga2V5ID0gYXJndW1lbnRzW2ldO1xuICAgICAgb2JqW2tleV0gPSBfLmJpbmQob2JqW2tleV0sIG9iaik7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gTWVtb2l6ZSBhbiBleHBlbnNpdmUgZnVuY3Rpb24gYnkgc3RvcmluZyBpdHMgcmVzdWx0cy5cbiAgXy5tZW1vaXplID0gZnVuY3Rpb24oZnVuYywgaGFzaGVyKSB7XG4gICAgdmFyIG1lbW9pemUgPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBjYWNoZSA9IG1lbW9pemUuY2FjaGU7XG4gICAgICB2YXIgYWRkcmVzcyA9ICcnICsgKGhhc2hlciA/IGhhc2hlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpIDoga2V5KTtcbiAgICAgIGlmICghXy5oYXMoY2FjaGUsIGFkZHJlc3MpKSBjYWNoZVthZGRyZXNzXSA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBjYWNoZVthZGRyZXNzXTtcbiAgICB9O1xuICAgIG1lbW9pemUuY2FjaGUgPSB7fTtcbiAgICByZXR1cm4gbWVtb2l6ZTtcbiAgfTtcblxuICAvLyBEZWxheXMgYSBmdW5jdGlvbiBmb3IgdGhlIGdpdmVuIG51bWJlciBvZiBtaWxsaXNlY29uZHMsIGFuZCB0aGVuIGNhbGxzXG4gIC8vIGl0IHdpdGggdGhlIGFyZ3VtZW50cyBzdXBwbGllZC5cbiAgXy5kZWxheSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgfSwgd2FpdCk7XG4gIH07XG5cbiAgLy8gRGVmZXJzIGEgZnVuY3Rpb24sIHNjaGVkdWxpbmcgaXQgdG8gcnVuIGFmdGVyIHRoZSBjdXJyZW50IGNhbGwgc3RhY2sgaGFzXG4gIC8vIGNsZWFyZWQuXG4gIF8uZGVmZXIgPSBfLnBhcnRpYWwoXy5kZWxheSwgXywgMSk7XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCB3aGVuIGludm9rZWQsIHdpbGwgb25seSBiZSB0cmlnZ2VyZWQgYXQgbW9zdCBvbmNlXG4gIC8vIGR1cmluZyBhIGdpdmVuIHdpbmRvdyBvZiB0aW1lLiBOb3JtYWxseSwgdGhlIHRocm90dGxlZCBmdW5jdGlvbiB3aWxsIHJ1blxuICAvLyBhcyBtdWNoIGFzIGl0IGNhbiwgd2l0aG91dCBldmVyIGdvaW5nIG1vcmUgdGhhbiBvbmNlIHBlciBgd2FpdGAgZHVyYXRpb247XG4gIC8vIGJ1dCBpZiB5b3UnZCBsaWtlIHRvIGRpc2FibGUgdGhlIGV4ZWN1dGlvbiBvbiB0aGUgbGVhZGluZyBlZGdlLCBwYXNzXG4gIC8vIGB7bGVhZGluZzogZmFsc2V9YC4gVG8gZGlzYWJsZSBleGVjdXRpb24gb24gdGhlIHRyYWlsaW5nIGVkZ2UsIGRpdHRvLlxuICBfLnRocm90dGxlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgb3B0aW9ucykge1xuICAgIHZhciBjb250ZXh0LCBhcmdzLCByZXN1bHQ7XG4gICAgdmFyIHRpbWVvdXQgPSBudWxsO1xuICAgIHZhciBwcmV2aW91cyA9IDA7XG4gICAgaWYgKCFvcHRpb25zKSBvcHRpb25zID0ge307XG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICBwcmV2aW91cyA9IG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UgPyAwIDogXy5ub3coKTtcbiAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgIH07XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG5vdyA9IF8ubm93KCk7XG4gICAgICBpZiAoIXByZXZpb3VzICYmIG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UpIHByZXZpb3VzID0gbm93O1xuICAgICAgdmFyIHJlbWFpbmluZyA9IHdhaXQgLSAobm93IC0gcHJldmlvdXMpO1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwIHx8IHJlbWFpbmluZyA+IHdhaXQpIHtcbiAgICAgICAgaWYgKHRpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgcHJldmlvdXMgPSBub3c7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgfSBlbHNlIGlmICghdGltZW91dCAmJiBvcHRpb25zLnRyYWlsaW5nICE9PSBmYWxzZSkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIGFzIGxvbmcgYXMgaXQgY29udGludWVzIHRvIGJlIGludm9rZWQsIHdpbGwgbm90XG4gIC8vIGJlIHRyaWdnZXJlZC4gVGhlIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGFmdGVyIGl0IHN0b3BzIGJlaW5nIGNhbGxlZCBmb3JcbiAgLy8gTiBtaWxsaXNlY29uZHMuIElmIGBpbW1lZGlhdGVgIGlzIHBhc3NlZCwgdHJpZ2dlciB0aGUgZnVuY3Rpb24gb24gdGhlXG4gIC8vIGxlYWRpbmcgZWRnZSwgaW5zdGVhZCBvZiB0aGUgdHJhaWxpbmcuXG4gIF8uZGVib3VuY2UgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBpbW1lZGlhdGUpIHtcbiAgICB2YXIgdGltZW91dCwgYXJncywgY29udGV4dCwgdGltZXN0YW1wLCByZXN1bHQ7XG5cbiAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBsYXN0ID0gXy5ub3coKSAtIHRpbWVzdGFtcDtcblxuICAgICAgaWYgKGxhc3QgPCB3YWl0ICYmIGxhc3QgPj0gMCkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCAtIGxhc3QpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIGlmICghaW1tZWRpYXRlKSB7XG4gICAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBjb250ZXh0ID0gdGhpcztcbiAgICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICB0aW1lc3RhbXAgPSBfLm5vdygpO1xuICAgICAgdmFyIGNhbGxOb3cgPSBpbW1lZGlhdGUgJiYgIXRpbWVvdXQ7XG4gICAgICBpZiAoIXRpbWVvdXQpIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0KTtcbiAgICAgIGlmIChjYWxsTm93KSB7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGZ1bmN0aW9uIHBhc3NlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgc2Vjb25kLFxuICAvLyBhbGxvd2luZyB5b3UgdG8gYWRqdXN0IGFyZ3VtZW50cywgcnVuIGNvZGUgYmVmb3JlIGFuZCBhZnRlciwgYW5kXG4gIC8vIGNvbmRpdGlvbmFsbHkgZXhlY3V0ZSB0aGUgb3JpZ2luYWwgZnVuY3Rpb24uXG4gIF8ud3JhcCA9IGZ1bmN0aW9uKGZ1bmMsIHdyYXBwZXIpIHtcbiAgICByZXR1cm4gXy5wYXJ0aWFsKHdyYXBwZXIsIGZ1bmMpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBuZWdhdGVkIHZlcnNpb24gb2YgdGhlIHBhc3NlZC1pbiBwcmVkaWNhdGUuXG4gIF8ubmVnYXRlID0gZnVuY3Rpb24ocHJlZGljYXRlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuICFwcmVkaWNhdGUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGlzIHRoZSBjb21wb3NpdGlvbiBvZiBhIGxpc3Qgb2YgZnVuY3Rpb25zLCBlYWNoXG4gIC8vIGNvbnN1bWluZyB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmdW5jdGlvbiB0aGF0IGZvbGxvd3MuXG4gIF8uY29tcG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgIHZhciBzdGFydCA9IGFyZ3MubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaSA9IHN0YXJ0O1xuICAgICAgdmFyIHJlc3VsdCA9IGFyZ3Nbc3RhcnRdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB3aGlsZSAoaS0tKSByZXN1bHQgPSBhcmdzW2ldLmNhbGwodGhpcywgcmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgb24gYW5kIGFmdGVyIHRoZSBOdGggY2FsbC5cbiAgXy5hZnRlciA9IGZ1bmN0aW9uKHRpbWVzLCBmdW5jKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKC0tdGltZXMgPCAxKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgdXAgdG8gKGJ1dCBub3QgaW5jbHVkaW5nKSB0aGUgTnRoIGNhbGwuXG4gIF8uYmVmb3JlID0gZnVuY3Rpb24odGltZXMsIGZ1bmMpIHtcbiAgICB2YXIgbWVtbztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoLS10aW1lcyA+IDApIHtcbiAgICAgICAgbWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICAgIGlmICh0aW1lcyA8PSAxKSBmdW5jID0gbnVsbDtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBleGVjdXRlZCBhdCBtb3N0IG9uZSB0aW1lLCBubyBtYXR0ZXIgaG93XG4gIC8vIG9mdGVuIHlvdSBjYWxsIGl0LiBVc2VmdWwgZm9yIGxhenkgaW5pdGlhbGl6YXRpb24uXG4gIF8ub25jZSA9IF8ucGFydGlhbChfLmJlZm9yZSwgMik7XG5cbiAgLy8gT2JqZWN0IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gS2V5cyBpbiBJRSA8IDkgdGhhdCB3b24ndCBiZSBpdGVyYXRlZCBieSBgZm9yIGtleSBpbiAuLi5gIGFuZCB0aHVzIG1pc3NlZC5cbiAgdmFyIGhhc0VudW1CdWcgPSAhe3RvU3RyaW5nOiBudWxsfS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKTtcbiAgdmFyIG5vbkVudW1lcmFibGVQcm9wcyA9IFsndmFsdWVPZicsICdpc1Byb3RvdHlwZU9mJywgJ3RvU3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLCAnaGFzT3duUHJvcGVydHknLCAndG9Mb2NhbGVTdHJpbmcnXTtcblxuICBmdW5jdGlvbiBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cykge1xuICAgIHZhciBub25FbnVtSWR4ID0gbm9uRW51bWVyYWJsZVByb3BzLmxlbmd0aDtcbiAgICB2YXIgY29uc3RydWN0b3IgPSBvYmouY29uc3RydWN0b3I7XG4gICAgdmFyIHByb3RvID0gKF8uaXNGdW5jdGlvbihjb25zdHJ1Y3RvcikgJiYgY29uc3RydWN0b3IucHJvdG90eXBlKSB8fCBPYmpQcm90bztcblxuICAgIC8vIENvbnN0cnVjdG9yIGlzIGEgc3BlY2lhbCBjYXNlLlxuICAgIHZhciBwcm9wID0gJ2NvbnN0cnVjdG9yJztcbiAgICBpZiAoXy5oYXMob2JqLCBwcm9wKSAmJiAhXy5jb250YWlucyhrZXlzLCBwcm9wKSkga2V5cy5wdXNoKHByb3ApO1xuXG4gICAgd2hpbGUgKG5vbkVudW1JZHgtLSkge1xuICAgICAgcHJvcCA9IG5vbkVudW1lcmFibGVQcm9wc1tub25FbnVtSWR4XTtcbiAgICAgIGlmIChwcm9wIGluIG9iaiAmJiBvYmpbcHJvcF0gIT09IHByb3RvW3Byb3BdICYmICFfLmNvbnRhaW5zKGtleXMsIHByb3ApKSB7XG4gICAgICAgIGtleXMucHVzaChwcm9wKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZXRyaWV2ZSB0aGUgbmFtZXMgb2YgYW4gb2JqZWN0J3Mgb3duIHByb3BlcnRpZXMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBPYmplY3Qua2V5c2BcbiAgXy5rZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBbXTtcbiAgICBpZiAobmF0aXZlS2V5cykgcmV0dXJuIG5hdGl2ZUtleXMob2JqKTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICAgIC8vIEFoZW0sIElFIDwgOS5cbiAgICBpZiAoaGFzRW51bUJ1ZykgY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpO1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIGFsbCB0aGUgcHJvcGVydHkgbmFtZXMgb2YgYW4gb2JqZWN0LlxuICBfLmFsbEtleXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIFtdO1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikga2V5cy5wdXNoKGtleSk7XG4gICAgLy8gQWhlbSwgSUUgPCA5LlxuICAgIGlmIChoYXNFbnVtQnVnKSBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cyk7XG4gICAgcmV0dXJuIGtleXM7XG4gIH07XG5cbiAgLy8gUmV0cmlldmUgdGhlIHZhbHVlcyBvZiBhbiBvYmplY3QncyBwcm9wZXJ0aWVzLlxuICBfLnZhbHVlcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIHZhciB2YWx1ZXMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhbHVlc1tpXSA9IG9ialtrZXlzW2ldXTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfTtcblxuICAvLyBSZXR1cm5zIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRlZSB0byBlYWNoIGVsZW1lbnQgb2YgdGhlIG9iamVjdFxuICAvLyBJbiBjb250cmFzdCB0byBfLm1hcCBpdCByZXR1cm5zIGFuIG9iamVjdFxuICBfLm1hcE9iamVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICBfLmtleXMob2JqKSxcbiAgICAgICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgICAgICByZXN1bHRzID0ge30sXG4gICAgICAgICAgY3VycmVudEtleTtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgY3VycmVudEtleSA9IGtleXNbaW5kZXhdO1xuICAgICAgICByZXN1bHRzW2N1cnJlbnRLZXldID0gaXRlcmF0ZWUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ29udmVydCBhbiBvYmplY3QgaW50byBhIGxpc3Qgb2YgYFtrZXksIHZhbHVlXWAgcGFpcnMuXG4gIF8ucGFpcnMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB2YXIgcGFpcnMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHBhaXJzW2ldID0gW2tleXNbaV0sIG9ialtrZXlzW2ldXV07XG4gICAgfVxuICAgIHJldHVybiBwYWlycztcbiAgfTtcblxuICAvLyBJbnZlcnQgdGhlIGtleXMgYW5kIHZhbHVlcyBvZiBhbiBvYmplY3QuIFRoZSB2YWx1ZXMgbXVzdCBiZSBzZXJpYWxpemFibGUuXG4gIF8uaW52ZXJ0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHJlc3VsdFtvYmpba2V5c1tpXV1dID0ga2V5c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBzb3J0ZWQgbGlzdCBvZiB0aGUgZnVuY3Rpb24gbmFtZXMgYXZhaWxhYmxlIG9uIHRoZSBvYmplY3QuXG4gIC8vIEFsaWFzZWQgYXMgYG1ldGhvZHNgXG4gIF8uZnVuY3Rpb25zID0gXy5tZXRob2RzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIG5hbWVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKF8uaXNGdW5jdGlvbihvYmpba2V5XSkpIG5hbWVzLnB1c2goa2V5KTtcbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzLnNvcnQoKTtcbiAgfTtcblxuICAvLyBFeHRlbmQgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIHByb3BlcnRpZXMgaW4gcGFzc2VkLWluIG9iamVjdChzKS5cbiAgXy5leHRlbmQgPSBjcmVhdGVBc3NpZ25lcihfLmFsbEtleXMpO1xuXG4gIC8vIEFzc2lnbnMgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIG93biBwcm9wZXJ0aWVzIGluIHRoZSBwYXNzZWQtaW4gb2JqZWN0KHMpXG4gIC8vIChodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3QvYXNzaWduKVxuICBfLmV4dGVuZE93biA9IF8uYXNzaWduID0gY3JlYXRlQXNzaWduZXIoXy5rZXlzKTtcblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBrZXkgb24gYW4gb2JqZWN0IHRoYXQgcGFzc2VzIGEgcHJlZGljYXRlIHRlc3RcbiAgXy5maW5kS2V5ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaiksIGtleTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAga2V5ID0ga2V5c1tpXTtcbiAgICAgIGlmIChwcmVkaWNhdGUob2JqW2tleV0sIGtleSwgb2JqKSkgcmV0dXJuIGtleTtcbiAgICB9XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IG9ubHkgY29udGFpbmluZyB0aGUgd2hpdGVsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5waWNrID0gZnVuY3Rpb24ob2JqZWN0LCBvaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0ge30sIG9iaiA9IG9iamVjdCwgaXRlcmF0ZWUsIGtleXM7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChfLmlzRnVuY3Rpb24ob2l0ZXJhdGVlKSkge1xuICAgICAga2V5cyA9IF8uYWxsS2V5cyhvYmopO1xuICAgICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKG9pdGVyYXRlZSwgY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtleXMgPSBmbGF0dGVuKGFyZ3VtZW50cywgZmFsc2UsIGZhbHNlLCAxKTtcbiAgICAgIGl0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGtleSwgb2JqKSB7IHJldHVybiBrZXkgaW4gb2JqOyB9O1xuICAgICAgb2JqID0gT2JqZWN0KG9iaik7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIHZhciB2YWx1ZSA9IG9ialtrZXldO1xuICAgICAgaWYgKGl0ZXJhdGVlKHZhbHVlLCBrZXksIG9iaikpIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCB3aXRob3V0IHRoZSBibGFja2xpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLm9taXQgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihpdGVyYXRlZSkpIHtcbiAgICAgIGl0ZXJhdGVlID0gXy5uZWdhdGUoaXRlcmF0ZWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIga2V5cyA9IF8ubWFwKGZsYXR0ZW4oYXJndW1lbnRzLCBmYWxzZSwgZmFsc2UsIDEpLCBTdHJpbmcpO1xuICAgICAgaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgICAgIHJldHVybiAhXy5jb250YWlucyhrZXlzLCBrZXkpO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIF8ucGljayhvYmosIGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBGaWxsIGluIGEgZ2l2ZW4gb2JqZWN0IHdpdGggZGVmYXVsdCBwcm9wZXJ0aWVzLlxuICBfLmRlZmF1bHRzID0gY3JlYXRlQXNzaWduZXIoXy5hbGxLZXlzLCB0cnVlKTtcblxuICAvLyBDcmVhdGVzIGFuIG9iamVjdCB0aGF0IGluaGVyaXRzIGZyb20gdGhlIGdpdmVuIHByb3RvdHlwZSBvYmplY3QuXG4gIC8vIElmIGFkZGl0aW9uYWwgcHJvcGVydGllcyBhcmUgcHJvdmlkZWQgdGhlbiB0aGV5IHdpbGwgYmUgYWRkZWQgdG8gdGhlXG4gIC8vIGNyZWF0ZWQgb2JqZWN0LlxuICBfLmNyZWF0ZSA9IGZ1bmN0aW9uKHByb3RvdHlwZSwgcHJvcHMpIHtcbiAgICB2YXIgcmVzdWx0ID0gYmFzZUNyZWF0ZShwcm90b3R5cGUpO1xuICAgIGlmIChwcm9wcykgXy5leHRlbmRPd24ocmVzdWx0LCBwcm9wcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSAoc2hhbGxvdy1jbG9uZWQpIGR1cGxpY2F0ZSBvZiBhbiBvYmplY3QuXG4gIF8uY2xvbmUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIG9iajtcbiAgICByZXR1cm4gXy5pc0FycmF5KG9iaikgPyBvYmouc2xpY2UoKSA6IF8uZXh0ZW5kKHt9LCBvYmopO1xuICB9O1xuXG4gIC8vIEludm9rZXMgaW50ZXJjZXB0b3Igd2l0aCB0aGUgb2JqLCBhbmQgdGhlbiByZXR1cm5zIG9iai5cbiAgLy8gVGhlIHByaW1hcnkgcHVycG9zZSBvZiB0aGlzIG1ldGhvZCBpcyB0byBcInRhcCBpbnRvXCIgYSBtZXRob2QgY2hhaW4sIGluXG4gIC8vIG9yZGVyIHRvIHBlcmZvcm0gb3BlcmF0aW9ucyBvbiBpbnRlcm1lZGlhdGUgcmVzdWx0cyB3aXRoaW4gdGhlIGNoYWluLlxuICBfLnRhcCA9IGZ1bmN0aW9uKG9iaiwgaW50ZXJjZXB0b3IpIHtcbiAgICBpbnRlcmNlcHRvcihvYmopO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJucyB3aGV0aGVyIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBzZXQgb2YgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uaXNNYXRjaCA9IGZ1bmN0aW9uKG9iamVjdCwgYXR0cnMpIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhhdHRycyksIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkgcmV0dXJuICFsZW5ndGg7XG4gICAgdmFyIG9iaiA9IE9iamVjdChvYmplY3QpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgaWYgKGF0dHJzW2tleV0gIT09IG9ialtrZXldIHx8ICEoa2V5IGluIG9iaikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cblxuICAvLyBJbnRlcm5hbCByZWN1cnNpdmUgY29tcGFyaXNvbiBmdW5jdGlvbiBmb3IgYGlzRXF1YWxgLlxuICB2YXIgZXEgPSBmdW5jdGlvbihhLCBiLCBhU3RhY2ssIGJTdGFjaykge1xuICAgIC8vIElkZW50aWNhbCBvYmplY3RzIGFyZSBlcXVhbC4gYDAgPT09IC0wYCwgYnV0IHRoZXkgYXJlbid0IGlkZW50aWNhbC5cbiAgICAvLyBTZWUgdGhlIFtIYXJtb255IGBlZ2FsYCBwcm9wb3NhbF0oaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9aGFybW9ueTplZ2FsKS5cbiAgICBpZiAoYSA9PT0gYikgcmV0dXJuIGEgIT09IDAgfHwgMSAvIGEgPT09IDEgLyBiO1xuICAgIC8vIEEgc3RyaWN0IGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5IGJlY2F1c2UgYG51bGwgPT0gdW5kZWZpbmVkYC5cbiAgICBpZiAoYSA9PSBudWxsIHx8IGIgPT0gbnVsbCkgcmV0dXJuIGEgPT09IGI7XG4gICAgLy8gVW53cmFwIGFueSB3cmFwcGVkIG9iamVjdHMuXG4gICAgaWYgKGEgaW5zdGFuY2VvZiBfKSBhID0gYS5fd3JhcHBlZDtcbiAgICBpZiAoYiBpbnN0YW5jZW9mIF8pIGIgPSBiLl93cmFwcGVkO1xuICAgIC8vIENvbXBhcmUgYFtbQ2xhc3NdXWAgbmFtZXMuXG4gICAgdmFyIGNsYXNzTmFtZSA9IHRvU3RyaW5nLmNhbGwoYSk7XG4gICAgaWYgKGNsYXNzTmFtZSAhPT0gdG9TdHJpbmcuY2FsbChiKSkgcmV0dXJuIGZhbHNlO1xuICAgIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgICAvLyBTdHJpbmdzLCBudW1iZXJzLCByZWd1bGFyIGV4cHJlc3Npb25zLCBkYXRlcywgYW5kIGJvb2xlYW5zIGFyZSBjb21wYXJlZCBieSB2YWx1ZS5cbiAgICAgIGNhc2UgJ1tvYmplY3QgUmVnRXhwXSc6XG4gICAgICAvLyBSZWdFeHBzIGFyZSBjb2VyY2VkIHRvIHN0cmluZ3MgZm9yIGNvbXBhcmlzb24gKE5vdGU6ICcnICsgL2EvaSA9PT0gJy9hL2knKVxuICAgICAgY2FzZSAnW29iamVjdCBTdHJpbmddJzpcbiAgICAgICAgLy8gUHJpbWl0aXZlcyBhbmQgdGhlaXIgY29ycmVzcG9uZGluZyBvYmplY3Qgd3JhcHBlcnMgYXJlIGVxdWl2YWxlbnQ7IHRodXMsIGBcIjVcImAgaXNcbiAgICAgICAgLy8gZXF1aXZhbGVudCB0byBgbmV3IFN0cmluZyhcIjVcIilgLlxuICAgICAgICByZXR1cm4gJycgKyBhID09PSAnJyArIGI7XG4gICAgICBjYXNlICdbb2JqZWN0IE51bWJlcl0nOlxuICAgICAgICAvLyBgTmFOYHMgYXJlIGVxdWl2YWxlbnQsIGJ1dCBub24tcmVmbGV4aXZlLlxuICAgICAgICAvLyBPYmplY3QoTmFOKSBpcyBlcXVpdmFsZW50IHRvIE5hTlxuICAgICAgICBpZiAoK2EgIT09ICthKSByZXR1cm4gK2IgIT09ICtiO1xuICAgICAgICAvLyBBbiBgZWdhbGAgY29tcGFyaXNvbiBpcyBwZXJmb3JtZWQgZm9yIG90aGVyIG51bWVyaWMgdmFsdWVzLlxuICAgICAgICByZXR1cm4gK2EgPT09IDAgPyAxIC8gK2EgPT09IDEgLyBiIDogK2EgPT09ICtiO1xuICAgICAgY2FzZSAnW29iamVjdCBEYXRlXSc6XG4gICAgICBjYXNlICdbb2JqZWN0IEJvb2xlYW5dJzpcbiAgICAgICAgLy8gQ29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1lcmljIHByaW1pdGl2ZSB2YWx1ZXMuIERhdGVzIGFyZSBjb21wYXJlZCBieSB0aGVpclxuICAgICAgICAvLyBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnMuIE5vdGUgdGhhdCBpbnZhbGlkIGRhdGVzIHdpdGggbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zXG4gICAgICAgIC8vIG9mIGBOYU5gIGFyZSBub3QgZXF1aXZhbGVudC5cbiAgICAgICAgcmV0dXJuICthID09PSArYjtcbiAgICB9XG5cbiAgICB2YXIgYXJlQXJyYXlzID0gY2xhc3NOYW1lID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIGlmICghYXJlQXJyYXlzKSB7XG4gICAgICBpZiAodHlwZW9mIGEgIT0gJ29iamVjdCcgfHwgdHlwZW9mIGIgIT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcblxuICAgICAgLy8gT2JqZWN0cyB3aXRoIGRpZmZlcmVudCBjb25zdHJ1Y3RvcnMgYXJlIG5vdCBlcXVpdmFsZW50LCBidXQgYE9iamVjdGBzIG9yIGBBcnJheWBzXG4gICAgICAvLyBmcm9tIGRpZmZlcmVudCBmcmFtZXMgYXJlLlxuICAgICAgdmFyIGFDdG9yID0gYS5jb25zdHJ1Y3RvciwgYkN0b3IgPSBiLmNvbnN0cnVjdG9yO1xuICAgICAgaWYgKGFDdG9yICE9PSBiQ3RvciAmJiAhKF8uaXNGdW5jdGlvbihhQ3RvcikgJiYgYUN0b3IgaW5zdGFuY2VvZiBhQ3RvciAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uaXNGdW5jdGlvbihiQ3RvcikgJiYgYkN0b3IgaW5zdGFuY2VvZiBiQ3RvcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgKCdjb25zdHJ1Y3RvcicgaW4gYSAmJiAnY29uc3RydWN0b3InIGluIGIpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gQXNzdW1lIGVxdWFsaXR5IGZvciBjeWNsaWMgc3RydWN0dXJlcy4gVGhlIGFsZ29yaXRobSBmb3IgZGV0ZWN0aW5nIGN5Y2xpY1xuICAgIC8vIHN0cnVjdHVyZXMgaXMgYWRhcHRlZCBmcm9tIEVTIDUuMSBzZWN0aW9uIDE1LjEyLjMsIGFic3RyYWN0IG9wZXJhdGlvbiBgSk9gLlxuXG4gICAgLy8gSW5pdGlhbGl6aW5nIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIC8vIEl0J3MgZG9uZSBoZXJlIHNpbmNlIHdlIG9ubHkgbmVlZCB0aGVtIGZvciBvYmplY3RzIGFuZCBhcnJheXMgY29tcGFyaXNvbi5cbiAgICBhU3RhY2sgPSBhU3RhY2sgfHwgW107XG4gICAgYlN0YWNrID0gYlN0YWNrIHx8IFtdO1xuICAgIHZhciBsZW5ndGggPSBhU3RhY2subGVuZ3RoO1xuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgLy8gTGluZWFyIHNlYXJjaC4gUGVyZm9ybWFuY2UgaXMgaW52ZXJzZWx5IHByb3BvcnRpb25hbCB0byB0aGUgbnVtYmVyIG9mXG4gICAgICAvLyB1bmlxdWUgbmVzdGVkIHN0cnVjdHVyZXMuXG4gICAgICBpZiAoYVN0YWNrW2xlbmd0aF0gPT09IGEpIHJldHVybiBiU3RhY2tbbGVuZ3RoXSA9PT0gYjtcbiAgICB9XG5cbiAgICAvLyBBZGQgdGhlIGZpcnN0IG9iamVjdCB0byB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnB1c2goYSk7XG4gICAgYlN0YWNrLnB1c2goYik7XG5cbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cy5cbiAgICBpZiAoYXJlQXJyYXlzKSB7XG4gICAgICAvLyBDb21wYXJlIGFycmF5IGxlbmd0aHMgdG8gZGV0ZXJtaW5lIGlmIGEgZGVlcCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeS5cbiAgICAgIGxlbmd0aCA9IGEubGVuZ3RoO1xuICAgICAgaWYgKGxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgIC8vIERlZXAgY29tcGFyZSB0aGUgY29udGVudHMsIGlnbm9yaW5nIG5vbi1udW1lcmljIHByb3BlcnRpZXMuXG4gICAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgICAgaWYgKCFlcShhW2xlbmd0aF0sIGJbbGVuZ3RoXSwgYVN0YWNrLCBiU3RhY2spKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERlZXAgY29tcGFyZSBvYmplY3RzLlxuICAgICAgdmFyIGtleXMgPSBfLmtleXMoYSksIGtleTtcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgICAgLy8gRW5zdXJlIHRoYXQgYm90aCBvYmplY3RzIGNvbnRhaW4gdGhlIHNhbWUgbnVtYmVyIG9mIHByb3BlcnRpZXMgYmVmb3JlIGNvbXBhcmluZyBkZWVwIGVxdWFsaXR5LlxuICAgICAgaWYgKF8ua2V5cyhiKS5sZW5ndGggIT09IGxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAgIC8vIERlZXAgY29tcGFyZSBlYWNoIG1lbWJlclxuICAgICAgICBrZXkgPSBrZXlzW2xlbmd0aF07XG4gICAgICAgIGlmICghKF8uaGFzKGIsIGtleSkgJiYgZXEoYVtrZXldLCBiW2tleV0sIGFTdGFjaywgYlN0YWNrKSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gUmVtb3ZlIHRoZSBmaXJzdCBvYmplY3QgZnJvbSB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnBvcCgpO1xuICAgIGJTdGFjay5wb3AoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBQZXJmb3JtIGEgZGVlcCBjb21wYXJpc29uIHRvIGNoZWNrIGlmIHR3byBvYmplY3RzIGFyZSBlcXVhbC5cbiAgXy5pc0VxdWFsID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBlcShhLCBiKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIGFycmF5LCBzdHJpbmcsIG9yIG9iamVjdCBlbXB0eT9cbiAgLy8gQW4gXCJlbXB0eVwiIG9iamVjdCBoYXMgbm8gZW51bWVyYWJsZSBvd24tcHJvcGVydGllcy5cbiAgXy5pc0VtcHR5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSAmJiAoXy5pc0FycmF5KG9iaikgfHwgXy5pc1N0cmluZyhvYmopIHx8IF8uaXNBcmd1bWVudHMob2JqKSkpIHJldHVybiBvYmoubGVuZ3RoID09PSAwO1xuICAgIHJldHVybiBfLmtleXMob2JqKS5sZW5ndGggPT09IDA7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIERPTSBlbGVtZW50P1xuICBfLmlzRWxlbWVudCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiAhIShvYmogJiYgb2JqLm5vZGVUeXBlID09PSAxKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGFuIGFycmF5P1xuICAvLyBEZWxlZ2F0ZXMgdG8gRUNNQTUncyBuYXRpdmUgQXJyYXkuaXNBcnJheVxuICBfLmlzQXJyYXkgPSBuYXRpdmVJc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSBhbiBvYmplY3Q/XG4gIF8uaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgdHlwZSA9IHR5cGVvZiBvYmo7XG4gICAgcmV0dXJuIHR5cGUgPT09ICdmdW5jdGlvbicgfHwgdHlwZSA9PT0gJ29iamVjdCcgJiYgISFvYmo7XG4gIH07XG5cbiAgLy8gQWRkIHNvbWUgaXNUeXBlIG1ldGhvZHM6IGlzQXJndW1lbnRzLCBpc0Z1bmN0aW9uLCBpc1N0cmluZywgaXNOdW1iZXIsIGlzRGF0ZSwgaXNSZWdFeHAsIGlzRXJyb3IuXG4gIF8uZWFjaChbJ0FyZ3VtZW50cycsICdGdW5jdGlvbicsICdTdHJpbmcnLCAnTnVtYmVyJywgJ0RhdGUnLCAnUmVnRXhwJywgJ0Vycm9yJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBfWydpcycgKyBuYW1lXSA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgJyArIG5hbWUgKyAnXSc7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRGVmaW5lIGEgZmFsbGJhY2sgdmVyc2lvbiBvZiB0aGUgbWV0aG9kIGluIGJyb3dzZXJzIChhaGVtLCBJRSA8IDkpLCB3aGVyZVxuICAvLyB0aGVyZSBpc24ndCBhbnkgaW5zcGVjdGFibGUgXCJBcmd1bWVudHNcIiB0eXBlLlxuICBpZiAoIV8uaXNBcmd1bWVudHMoYXJndW1lbnRzKSkge1xuICAgIF8uaXNBcmd1bWVudHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBfLmhhcyhvYmosICdjYWxsZWUnKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gT3B0aW1pemUgYGlzRnVuY3Rpb25gIGlmIGFwcHJvcHJpYXRlLiBXb3JrIGFyb3VuZCBzb21lIHR5cGVvZiBidWdzIGluIG9sZCB2OCxcbiAgLy8gSUUgMTEgKCMxNjIxKSwgYW5kIGluIFNhZmFyaSA4ICgjMTkyOSkuXG4gIGlmICh0eXBlb2YgLy4vICE9ICdmdW5jdGlvbicgJiYgdHlwZW9mIEludDhBcnJheSAhPSAnb2JqZWN0Jykge1xuICAgIF8uaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT0gJ2Z1bmN0aW9uJyB8fCBmYWxzZTtcbiAgICB9O1xuICB9XG5cbiAgLy8gSXMgYSBnaXZlbiBvYmplY3QgYSBmaW5pdGUgbnVtYmVyP1xuICBfLmlzRmluaXRlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIGlzRmluaXRlKG9iaikgJiYgIWlzTmFOKHBhcnNlRmxvYXQob2JqKSk7XG4gIH07XG5cbiAgLy8gSXMgdGhlIGdpdmVuIHZhbHVlIGBOYU5gPyAoTmFOIGlzIHRoZSBvbmx5IG51bWJlciB3aGljaCBkb2VzIG5vdCBlcXVhbCBpdHNlbGYpLlxuICBfLmlzTmFOID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8uaXNOdW1iZXIob2JqKSAmJiBvYmogIT09ICtvYmo7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIGJvb2xlYW4/XG4gIF8uaXNCb29sZWFuID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdHJ1ZSB8fCBvYmogPT09IGZhbHNlIHx8IHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQm9vbGVhbl0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgZXF1YWwgdG8gbnVsbD9cbiAgXy5pc051bGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBudWxsO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgdW5kZWZpbmVkP1xuICBfLmlzVW5kZWZpbmVkID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdm9pZCAwO1xuICB9O1xuXG4gIC8vIFNob3J0Y3V0IGZ1bmN0aW9uIGZvciBjaGVja2luZyBpZiBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gcHJvcGVydHkgZGlyZWN0bHlcbiAgLy8gb24gaXRzZWxmIChpbiBvdGhlciB3b3Jkcywgbm90IG9uIGEgcHJvdG90eXBlKS5cbiAgXy5oYXMgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBvYmogIT0gbnVsbCAmJiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgfTtcblxuICAvLyBVdGlsaXR5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJ1biBVbmRlcnNjb3JlLmpzIGluICpub0NvbmZsaWN0KiBtb2RlLCByZXR1cm5pbmcgdGhlIGBfYCB2YXJpYWJsZSB0byBpdHNcbiAgLy8gcHJldmlvdXMgb3duZXIuIFJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICByb290Ll8gPSBwcmV2aW91c1VuZGVyc2NvcmU7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gS2VlcCB0aGUgaWRlbnRpdHkgZnVuY3Rpb24gYXJvdW5kIGZvciBkZWZhdWx0IGl0ZXJhdGVlcy5cbiAgXy5pZGVudGl0eSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9O1xuXG4gIC8vIFByZWRpY2F0ZS1nZW5lcmF0aW5nIGZ1bmN0aW9ucy4gT2Z0ZW4gdXNlZnVsIG91dHNpZGUgb2YgVW5kZXJzY29yZS5cbiAgXy5jb25zdGFudCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH07XG4gIH07XG5cbiAgXy5ub29wID0gZnVuY3Rpb24oKXt9O1xuXG4gIF8ucHJvcGVydHkgPSBwcm9wZXJ0eTtcblxuICAvLyBHZW5lcmF0ZXMgYSBmdW5jdGlvbiBmb3IgYSBnaXZlbiBvYmplY3QgdGhhdCByZXR1cm5zIGEgZ2l2ZW4gcHJvcGVydHkuXG4gIF8ucHJvcGVydHlPZiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT0gbnVsbCA/IGZ1bmN0aW9uKCl7fSA6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIHByZWRpY2F0ZSBmb3IgY2hlY2tpbmcgd2hldGhlciBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gc2V0IG9mXG4gIC8vIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLm1hdGNoZXIgPSBfLm1hdGNoZXMgPSBmdW5jdGlvbihhdHRycykge1xuICAgIGF0dHJzID0gXy5leHRlbmRPd24oe30sIGF0dHJzKTtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gXy5pc01hdGNoKG9iaiwgYXR0cnMpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUnVuIGEgZnVuY3Rpb24gKipuKiogdGltZXMuXG4gIF8udGltZXMgPSBmdW5jdGlvbihuLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciBhY2N1bSA9IEFycmF5KE1hdGgubWF4KDAsIG4pKTtcbiAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQsIDEpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSBhY2N1bVtpXSA9IGl0ZXJhdGVlKGkpO1xuICAgIHJldHVybiBhY2N1bTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSByYW5kb20gaW50ZWdlciBiZXR3ZWVuIG1pbiBhbmQgbWF4IChpbmNsdXNpdmUpLlxuICBfLnJhbmRvbSA9IGZ1bmN0aW9uKG1pbiwgbWF4KSB7XG4gICAgaWYgKG1heCA9PSBudWxsKSB7XG4gICAgICBtYXggPSBtaW47XG4gICAgICBtaW4gPSAwO1xuICAgIH1cbiAgICByZXR1cm4gbWluICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbiArIDEpKTtcbiAgfTtcblxuICAvLyBBIChwb3NzaWJseSBmYXN0ZXIpIHdheSB0byBnZXQgdGhlIGN1cnJlbnQgdGltZXN0YW1wIGFzIGFuIGludGVnZXIuXG4gIF8ubm93ID0gRGF0ZS5ub3cgfHwgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB9O1xuXG4gICAvLyBMaXN0IG9mIEhUTUwgZW50aXRpZXMgZm9yIGVzY2FwaW5nLlxuICB2YXIgZXNjYXBlTWFwID0ge1xuICAgICcmJzogJyZhbXA7JyxcbiAgICAnPCc6ICcmbHQ7JyxcbiAgICAnPic6ICcmZ3Q7JyxcbiAgICAnXCInOiAnJnF1b3Q7JyxcbiAgICBcIidcIjogJyYjeDI3OycsXG4gICAgJ2AnOiAnJiN4NjA7J1xuICB9O1xuICB2YXIgdW5lc2NhcGVNYXAgPSBfLmludmVydChlc2NhcGVNYXApO1xuXG4gIC8vIEZ1bmN0aW9ucyBmb3IgZXNjYXBpbmcgYW5kIHVuZXNjYXBpbmcgc3RyaW5ncyB0by9mcm9tIEhUTUwgaW50ZXJwb2xhdGlvbi5cbiAgdmFyIGNyZWF0ZUVzY2FwZXIgPSBmdW5jdGlvbihtYXApIHtcbiAgICB2YXIgZXNjYXBlciA9IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICByZXR1cm4gbWFwW21hdGNoXTtcbiAgICB9O1xuICAgIC8vIFJlZ2V4ZXMgZm9yIGlkZW50aWZ5aW5nIGEga2V5IHRoYXQgbmVlZHMgdG8gYmUgZXNjYXBlZFxuICAgIHZhciBzb3VyY2UgPSAnKD86JyArIF8ua2V5cyhtYXApLmpvaW4oJ3wnKSArICcpJztcbiAgICB2YXIgdGVzdFJlZ2V4cCA9IFJlZ0V4cChzb3VyY2UpO1xuICAgIHZhciByZXBsYWNlUmVnZXhwID0gUmVnRXhwKHNvdXJjZSwgJ2cnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgICBzdHJpbmcgPSBzdHJpbmcgPT0gbnVsbCA/ICcnIDogJycgKyBzdHJpbmc7XG4gICAgICByZXR1cm4gdGVzdFJlZ2V4cC50ZXN0KHN0cmluZykgPyBzdHJpbmcucmVwbGFjZShyZXBsYWNlUmVnZXhwLCBlc2NhcGVyKSA6IHN0cmluZztcbiAgICB9O1xuICB9O1xuICBfLmVzY2FwZSA9IGNyZWF0ZUVzY2FwZXIoZXNjYXBlTWFwKTtcbiAgXy51bmVzY2FwZSA9IGNyZWF0ZUVzY2FwZXIodW5lc2NhcGVNYXApO1xuXG4gIC8vIElmIHRoZSB2YWx1ZSBvZiB0aGUgbmFtZWQgYHByb3BlcnR5YCBpcyBhIGZ1bmN0aW9uIHRoZW4gaW52b2tlIGl0IHdpdGggdGhlXG4gIC8vIGBvYmplY3RgIGFzIGNvbnRleHQ7IG90aGVyd2lzZSwgcmV0dXJuIGl0LlxuICBfLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHksIGZhbGxiYWNrKSB7XG4gICAgdmFyIHZhbHVlID0gb2JqZWN0ID09IG51bGwgPyB2b2lkIDAgOiBvYmplY3RbcHJvcGVydHldO1xuICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgICB2YWx1ZSA9IGZhbGxiYWNrO1xuICAgIH1cbiAgICByZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmNhbGwob2JqZWN0KSA6IHZhbHVlO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIGEgdW5pcXVlIGludGVnZXIgaWQgKHVuaXF1ZSB3aXRoaW4gdGhlIGVudGlyZSBjbGllbnQgc2Vzc2lvbikuXG4gIC8vIFVzZWZ1bCBmb3IgdGVtcG9yYXJ5IERPTSBpZHMuXG4gIHZhciBpZENvdW50ZXIgPSAwO1xuICBfLnVuaXF1ZUlkID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgfTtcblxuICAvLyBCeSBkZWZhdWx0LCBVbmRlcnNjb3JlIHVzZXMgRVJCLXN0eWxlIHRlbXBsYXRlIGRlbGltaXRlcnMsIGNoYW5nZSB0aGVcbiAgLy8gZm9sbG93aW5nIHRlbXBsYXRlIHNldHRpbmdzIHRvIHVzZSBhbHRlcm5hdGl2ZSBkZWxpbWl0ZXJzLlxuICBfLnRlbXBsYXRlU2V0dGluZ3MgPSB7XG4gICAgZXZhbHVhdGUgICAgOiAvPCUoW1xcc1xcU10rPyklPi9nLFxuICAgIGludGVycG9sYXRlIDogLzwlPShbXFxzXFxTXSs/KSU+L2csXG4gICAgZXNjYXBlICAgICAgOiAvPCUtKFtcXHNcXFNdKz8pJT4vZ1xuICB9O1xuXG4gIC8vIFdoZW4gY3VzdG9taXppbmcgYHRlbXBsYXRlU2V0dGluZ3NgLCBpZiB5b3UgZG9uJ3Qgd2FudCB0byBkZWZpbmUgYW5cbiAgLy8gaW50ZXJwb2xhdGlvbiwgZXZhbHVhdGlvbiBvciBlc2NhcGluZyByZWdleCwgd2UgbmVlZCBvbmUgdGhhdCBpc1xuICAvLyBndWFyYW50ZWVkIG5vdCB0byBtYXRjaC5cbiAgdmFyIG5vTWF0Y2ggPSAvKC4pXi87XG5cbiAgLy8gQ2VydGFpbiBjaGFyYWN0ZXJzIG5lZWQgdG8gYmUgZXNjYXBlZCBzbyB0aGF0IHRoZXkgY2FuIGJlIHB1dCBpbnRvIGFcbiAgLy8gc3RyaW5nIGxpdGVyYWwuXG4gIHZhciBlc2NhcGVzID0ge1xuICAgIFwiJ1wiOiAgICAgIFwiJ1wiLFxuICAgICdcXFxcJzogICAgICdcXFxcJyxcbiAgICAnXFxyJzogICAgICdyJyxcbiAgICAnXFxuJzogICAgICduJyxcbiAgICAnXFx1MjAyOCc6ICd1MjAyOCcsXG4gICAgJ1xcdTIwMjknOiAndTIwMjknXG4gIH07XG5cbiAgdmFyIGVzY2FwZXIgPSAvXFxcXHwnfFxccnxcXG58XFx1MjAyOHxcXHUyMDI5L2c7XG5cbiAgdmFyIGVzY2FwZUNoYXIgPSBmdW5jdGlvbihtYXRjaCkge1xuICAgIHJldHVybiAnXFxcXCcgKyBlc2NhcGVzW21hdGNoXTtcbiAgfTtcblxuICAvLyBKYXZhU2NyaXB0IG1pY3JvLXRlbXBsYXRpbmcsIHNpbWlsYXIgdG8gSm9obiBSZXNpZydzIGltcGxlbWVudGF0aW9uLlxuICAvLyBVbmRlcnNjb3JlIHRlbXBsYXRpbmcgaGFuZGxlcyBhcmJpdHJhcnkgZGVsaW1pdGVycywgcHJlc2VydmVzIHdoaXRlc3BhY2UsXG4gIC8vIGFuZCBjb3JyZWN0bHkgZXNjYXBlcyBxdW90ZXMgd2l0aGluIGludGVycG9sYXRlZCBjb2RlLlxuICAvLyBOQjogYG9sZFNldHRpbmdzYCBvbmx5IGV4aXN0cyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gIF8udGVtcGxhdGUgPSBmdW5jdGlvbih0ZXh0LCBzZXR0aW5ncywgb2xkU2V0dGluZ3MpIHtcbiAgICBpZiAoIXNldHRpbmdzICYmIG9sZFNldHRpbmdzKSBzZXR0aW5ncyA9IG9sZFNldHRpbmdzO1xuICAgIHNldHRpbmdzID0gXy5kZWZhdWx0cyh7fSwgc2V0dGluZ3MsIF8udGVtcGxhdGVTZXR0aW5ncyk7XG5cbiAgICAvLyBDb21iaW5lIGRlbGltaXRlcnMgaW50byBvbmUgcmVndWxhciBleHByZXNzaW9uIHZpYSBhbHRlcm5hdGlvbi5cbiAgICB2YXIgbWF0Y2hlciA9IFJlZ0V4cChbXG4gICAgICAoc2V0dGluZ3MuZXNjYXBlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5pbnRlcnBvbGF0ZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuZXZhbHVhdGUgfHwgbm9NYXRjaCkuc291cmNlXG4gICAgXS5qb2luKCd8JykgKyAnfCQnLCAnZycpO1xuXG4gICAgLy8gQ29tcGlsZSB0aGUgdGVtcGxhdGUgc291cmNlLCBlc2NhcGluZyBzdHJpbmcgbGl0ZXJhbHMgYXBwcm9wcmlhdGVseS5cbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzb3VyY2UgPSBcIl9fcCs9J1wiO1xuICAgIHRleHQucmVwbGFjZShtYXRjaGVyLCBmdW5jdGlvbihtYXRjaCwgZXNjYXBlLCBpbnRlcnBvbGF0ZSwgZXZhbHVhdGUsIG9mZnNldCkge1xuICAgICAgc291cmNlICs9IHRleHQuc2xpY2UoaW5kZXgsIG9mZnNldCkucmVwbGFjZShlc2NhcGVyLCBlc2NhcGVDaGFyKTtcbiAgICAgIGluZGV4ID0gb2Zmc2V0ICsgbWF0Y2gubGVuZ3RoO1xuXG4gICAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgZXNjYXBlICsgXCIpKT09bnVsbD8nJzpfLmVzY2FwZShfX3QpKStcXG4nXCI7XG4gICAgICB9IGVsc2UgaWYgKGludGVycG9sYXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgaW50ZXJwb2xhdGUgKyBcIikpPT1udWxsPycnOl9fdCkrXFxuJ1wiO1xuICAgICAgfSBlbHNlIGlmIChldmFsdWF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInO1xcblwiICsgZXZhbHVhdGUgKyBcIlxcbl9fcCs9J1wiO1xuICAgICAgfVxuXG4gICAgICAvLyBBZG9iZSBWTXMgbmVlZCB0aGUgbWF0Y2ggcmV0dXJuZWQgdG8gcHJvZHVjZSB0aGUgY29ycmVjdCBvZmZlc3QuXG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG4gICAgc291cmNlICs9IFwiJztcXG5cIjtcblxuICAgIC8vIElmIGEgdmFyaWFibGUgaXMgbm90IHNwZWNpZmllZCwgcGxhY2UgZGF0YSB2YWx1ZXMgaW4gbG9jYWwgc2NvcGUuXG4gICAgaWYgKCFzZXR0aW5ncy52YXJpYWJsZSkgc291cmNlID0gJ3dpdGgob2JqfHx7fSl7XFxuJyArIHNvdXJjZSArICd9XFxuJztcblxuICAgIHNvdXJjZSA9IFwidmFyIF9fdCxfX3A9JycsX19qPUFycmF5LnByb3RvdHlwZS5qb2luLFwiICtcbiAgICAgIFwicHJpbnQ9ZnVuY3Rpb24oKXtfX3ArPV9fai5jYWxsKGFyZ3VtZW50cywnJyk7fTtcXG5cIiArXG4gICAgICBzb3VyY2UgKyAncmV0dXJuIF9fcDtcXG4nO1xuXG4gICAgdHJ5IHtcbiAgICAgIHZhciByZW5kZXIgPSBuZXcgRnVuY3Rpb24oc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicsICdfJywgc291cmNlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlLnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuXG4gICAgdmFyIHRlbXBsYXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgcmV0dXJuIHJlbmRlci5jYWxsKHRoaXMsIGRhdGEsIF8pO1xuICAgIH07XG5cbiAgICAvLyBQcm92aWRlIHRoZSBjb21waWxlZCBzb3VyY2UgYXMgYSBjb252ZW5pZW5jZSBmb3IgcHJlY29tcGlsYXRpb24uXG4gICAgdmFyIGFyZ3VtZW50ID0gc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaic7XG4gICAgdGVtcGxhdGUuc291cmNlID0gJ2Z1bmN0aW9uKCcgKyBhcmd1bWVudCArICcpe1xcbicgKyBzb3VyY2UgKyAnfSc7XG5cbiAgICByZXR1cm4gdGVtcGxhdGU7XG4gIH07XG5cbiAgLy8gQWRkIGEgXCJjaGFpblwiIGZ1bmN0aW9uLiBTdGFydCBjaGFpbmluZyBhIHdyYXBwZWQgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8uY2hhaW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgaW5zdGFuY2UgPSBfKG9iaik7XG4gICAgaW5zdGFuY2UuX2NoYWluID0gdHJ1ZTtcbiAgICByZXR1cm4gaW5zdGFuY2U7XG4gIH07XG5cbiAgLy8gT09QXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAvLyBJZiBVbmRlcnNjb3JlIGlzIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLCBpdCByZXR1cm5zIGEgd3JhcHBlZCBvYmplY3QgdGhhdFxuICAvLyBjYW4gYmUgdXNlZCBPTy1zdHlsZS4gVGhpcyB3cmFwcGVyIGhvbGRzIGFsdGVyZWQgdmVyc2lvbnMgb2YgYWxsIHRoZVxuICAvLyB1bmRlcnNjb3JlIGZ1bmN0aW9ucy4gV3JhcHBlZCBvYmplY3RzIG1heSBiZSBjaGFpbmVkLlxuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb250aW51ZSBjaGFpbmluZyBpbnRlcm1lZGlhdGUgcmVzdWx0cy5cbiAgdmFyIHJlc3VsdCA9IGZ1bmN0aW9uKGluc3RhbmNlLCBvYmopIHtcbiAgICByZXR1cm4gaW5zdGFuY2UuX2NoYWluID8gXyhvYmopLmNoYWluKCkgOiBvYmo7XG4gIH07XG5cbiAgLy8gQWRkIHlvdXIgb3duIGN1c3RvbSBmdW5jdGlvbnMgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm1peGluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgXy5lYWNoKF8uZnVuY3Rpb25zKG9iaiksIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHZhciBmdW5jID0gX1tuYW1lXSA9IG9ialtuYW1lXTtcbiAgICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gW3RoaXMuX3dyYXBwZWRdO1xuICAgICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiByZXN1bHQodGhpcywgZnVuYy5hcHBseShfLCBhcmdzKSk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEFkZCBhbGwgb2YgdGhlIFVuZGVyc2NvcmUgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyIG9iamVjdC5cbiAgXy5taXhpbihfKTtcblxuICAvLyBBZGQgYWxsIG11dGF0b3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBfLmVhY2goWydwb3AnLCAncHVzaCcsICdyZXZlcnNlJywgJ3NoaWZ0JywgJ3NvcnQnLCAnc3BsaWNlJywgJ3Vuc2hpZnQnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb2JqID0gdGhpcy5fd3JhcHBlZDtcbiAgICAgIG1ldGhvZC5hcHBseShvYmosIGFyZ3VtZW50cyk7XG4gICAgICBpZiAoKG5hbWUgPT09ICdzaGlmdCcgfHwgbmFtZSA9PT0gJ3NwbGljZScpICYmIG9iai5sZW5ndGggPT09IDApIGRlbGV0ZSBvYmpbMF07XG4gICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIG9iaik7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gQWRkIGFsbCBhY2Nlc3NvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIF8uZWFjaChbJ2NvbmNhdCcsICdqb2luJywgJ3NsaWNlJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBtZXRob2QuYXBwbHkodGhpcy5fd3JhcHBlZCwgYXJndW1lbnRzKSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRXh0cmFjdHMgdGhlIHJlc3VsdCBmcm9tIGEgd3JhcHBlZCBhbmQgY2hhaW5lZCBvYmplY3QuXG4gIF8ucHJvdG90eXBlLnZhbHVlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX3dyYXBwZWQ7XG4gIH07XG5cbiAgLy8gUHJvdmlkZSB1bndyYXBwaW5nIHByb3h5IGZvciBzb21lIG1ldGhvZHMgdXNlZCBpbiBlbmdpbmUgb3BlcmF0aW9uc1xuICAvLyBzdWNoIGFzIGFyaXRobWV0aWMgYW5kIEpTT04gc3RyaW5naWZpY2F0aW9uLlxuICBfLnByb3RvdHlwZS52YWx1ZU9mID0gXy5wcm90b3R5cGUudG9KU09OID0gXy5wcm90b3R5cGUudmFsdWU7XG5cbiAgXy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJycgKyB0aGlzLl93cmFwcGVkO1xuICB9O1xuXG4gIC8vIEFNRCByZWdpc3RyYXRpb24gaGFwcGVucyBhdCB0aGUgZW5kIGZvciBjb21wYXRpYmlsaXR5IHdpdGggQU1EIGxvYWRlcnNcbiAgLy8gdGhhdCBtYXkgbm90IGVuZm9yY2UgbmV4dC10dXJuIHNlbWFudGljcyBvbiBtb2R1bGVzLiBFdmVuIHRob3VnaCBnZW5lcmFsXG4gIC8vIHByYWN0aWNlIGZvciBBTUQgcmVnaXN0cmF0aW9uIGlzIHRvIGJlIGFub255bW91cywgdW5kZXJzY29yZSByZWdpc3RlcnNcbiAgLy8gYXMgYSBuYW1lZCBtb2R1bGUgYmVjYXVzZSwgbGlrZSBqUXVlcnksIGl0IGlzIGEgYmFzZSBsaWJyYXJ5IHRoYXQgaXNcbiAgLy8gcG9wdWxhciBlbm91Z2ggdG8gYmUgYnVuZGxlZCBpbiBhIHRoaXJkIHBhcnR5IGxpYiwgYnV0IG5vdCBiZSBwYXJ0IG9mXG4gIC8vIGFuIEFNRCBsb2FkIHJlcXVlc3QuIFRob3NlIGNhc2VzIGNvdWxkIGdlbmVyYXRlIGFuIGVycm9yIHdoZW4gYW5cbiAgLy8gYW5vbnltb3VzIGRlZmluZSgpIGlzIGNhbGxlZCBvdXRzaWRlIG9mIGEgbG9hZGVyIHJlcXVlc3QuXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoJ3VuZGVyc2NvcmUnLCBbXSwgZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gXztcbiAgICB9KTtcbiAgfVxufS5jYWxsKHRoaXMpKTtcbiJdfQ==
