/*
 * Temple (with Source Map)
 * (c) 2014-2015 Beneath the Ink, Inc.
 * Copyright (C) 2011--2015 Meteor Development Group
 * MIT License
 * Version 0.5.16
 */

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Temple = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
//////////////////////////////////////////////////
// This is a heavily modified version of Meteor's DOMRange //
// Last merge: https://github.com/meteor/meteor/blob/405009a2c3dcd3c1fe780adb2867d38a6a42fff1/packages/blaze/domrange.js //
//////////////////////////////////////////////////

var _ = require("underscore"),
	Events = require("backbone-events-standalone"),
	matchesSelector = require("matches-selector");

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
}

module.exports = DOMRange;
DOMRange.extend = require("backbone-extend-standalone");

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
		var i;

		// dereference old members
		for (i = 0; i < oldMembers.length; i++) this._memberOut(oldMembers[i], false, _isReplace);

		// reference new members
		for (i = 0; i < newMembers.length; i++) this._memberIn(newMembers[i]);

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
				if (el.nodeType === 1 && matchesSelector(el, selector)) matches.push(el);
				matches.push.apply(matches, el.querySelectorAll(selector));
			}
		}

		return matches;
	},

	find: function(selector) {
		var el, res;

		for (var i in this.members) {
			el = this.members[i];
			if (el instanceof DOMRange) {
				res = el.find(selector);
			} else if (el.nodeType === 1 && matchesSelector(el, selector)) {
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
}

function removeFromDOM(rangeOrNode) {
	var m = rangeOrNode;
	if (m instanceof DOMRange) {
		m.detach();
	} else {
		removeNodeWithHooks(m);
	}
}

function removeNodeWithHooks(n) {
	if (!n.parentNode) return;
	if (n.nodeType === 1 && n.parentNode._uihooks && n.parentNode._uihooks.removeElement) {
		n.parentNode._uihooks.removeElement(n);
	} else {
		n.parentNode.removeChild(n);
	}
}

function insertNodeWithHooks(n, parent, next) {
	// `|| null` because IE throws an error if 'next' is undefined
	next = next || null;
	if (n.nodeType === 1 && parent._uihooks && parent._uihooks.insertElement) {
		parent._uihooks.insertElement(n, next);
	} else {
		parent.insertBefore(n, next);
	}
}

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
}

},{"backbone-events-standalone":16,"backbone-extend-standalone":17,"matches-selector":21,"underscore":29}],2:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var parse = require("./m+xml").parse;
var NODE_TYPE = require("./types");

// properties that Node.js and the browser can handle
var Temple = module.exports = {
	VERSION: "0.5.16",
	NODE_TYPE: NODE_TYPE,

	// other parts
	utils: require("./utils"),
	Model: require("./model"),

	// trackr short pointers
	Trackr: Trackr,
	Dependency: Trackr.Dependency,
	autorun: Trackr.autorun,
	track: require("trackr-objects"),

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
};

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

},{"./domrange":1,"./m+xml":3,"./model":4,"./mustache":5,"./plugins":8,"./section":11,"./types":12,"./utils":13,"./view":14,"trackr":28,"trackr-objects":22,"underscore":29}],3:[function(require,module,exports){
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

        peg$startRuleIndices = { start: 0, attrValue: 9, attrArguments: 10, pathQuery: 20, path: 22 },
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
          /^[\/#{!$>\^]/,
          { type: "class", value: "[\\/#{!$>\\^]", description: "[\\/#{!$>\\^]" },
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
          "{{!",
          { type: "literal", value: "{{!", description: "\"{{!\"" },
          function(value) {
          		return {
          			type: NODE_TYPE.MCOMMENT,
          			value: value.join("").trim()
          		}
          	},
          /^[$>]/,
          { type: "class", value: "[$>]", description: "[$>]" },
          function(m, value) {
          		return {
          			type: NODE_TYPE.PARTIAL,
          			value: value.join("").trim(),
          			local: m === "$"
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
          peg$decode("! !7,*G \"72*A \"73*; \"70*5 \"71*/ \"7#*) \"7$*# \"7\",M&7,*G \"72*A \"73*; \"70*5 \"71*/ \"7#*) \"7$*# \"7\"\"+' 4!6\"!! %"),
          peg$decode("! !0$\"\"1!3%+,$,)&0$\"\"1!3%\"\"\" #+' 4!6&!! %"),
          peg$decode("!.'\"\"2'3(+\xAC$! !!!8.*\"\"2*3+9*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #,Q&!!8.*\"\"2*3+9*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #\"+! (%+8%.*\"\"2*3++(%4#6-#!!%$## #$\"# #\"# #"),
          peg$decode("7%*I \"!7&+>$7!+4%7'+*%4#6.##\"! %$## #$\"# #\"# #"),
          peg$decode("!./\"\"2/30+U$7A+K% !7(,#&7(\"+9%.1\"\"2132+)%4$63$\"\"!%$$# #$## #$\"# #\"# #"),
          peg$decode("!./\"\"2/30+U$7A+K% !7(,#&7(\"+9%.4\"\"2435+)%4$66$\"\"!%$$# #$## #$\"# #\"# #"),
          peg$decode("!.7\"\"2738+B$7A+8%.4\"\"2435+(%4#69#!!%$## #$\"# #\"# #"),
          peg$decode("!7A+h$!.;\"\"2;3<+A$7B+7%7>+-%7B+#%'$%$$# #$## #$\"# #\"# #*# \" :+)%4\"6=\"\"! %$\"# #\"# #"),
          peg$decode("! !7,*; \"72*5 \"73*/ \"70*) \"71*# \"7\",A&7,*; \"72*5 \"73*/ \"70*) \"71*# \"7\"\"+' 4!6\"!! %"),
          peg$decode("!7++q$ !!.>\"\"2>3?+-$7++#%'\"%$\"# #\"# #,>&!.>\"\"2>3?+-$7++#%'\"%$\"# #\"# #\"+)%4\"6@\"\"! %$\"# #\"# #"),
          peg$decode("!7B+\xD6$7/*\xB7 \"7>*\xB1 \"7;*\xAB \"7<*\xA5 \"7?*\x9F \"7@*\x99 \"!! !!!8.>\"\"2>3?9*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #,Q&!!8.>\"\"2>3?9*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #\"+! (%+' 4!6A!! %+2%7B+(%4#6B#!!%$## #$\"# #\"# #"),
          peg$decode("!7-+>$7!+4%7.+*%4#6C##\"! %$## #$\"# #\"# #"),
          peg$decode("!.D\"\"2D3E+S$0F\"\"1!3G+C%75+9%.H\"\"2H3I+)%4$6J$\"\"!%$$# #$## #$\"# #\"# #"),
          peg$decode("!.K\"\"2K3L+b$ !7D*) \"0M\"\"1!3N,/&7D*) \"0M\"\"1!3N\"+8%.H\"\"2H3I+(%4#6O#!!%$## #$\"# #\"# #"),
          peg$decode("!!.P\"\"2P3Q+=$74+3%.R\"\"2R3S+#%'#%$## #$\"# #\"# #*N \"!.D\"\"2D3E+=$74+3%.H\"\"2H3I+#%'#%$## #$\"# #\"# #+' 4!6T!! %"),
          peg$decode("!.D\"\"2D3E+w$!80U\"\"1!3V9*$$\"\" )\"# #+Y%.W\"\"2W3X*# \" :+C%74+9%.H\"\"2H3I+)%4%6Y%\"\"!%$%# #$$# #$## #$\"# #\"# #"),
          peg$decode("!.P\"\"2P3Q+B$74+8%.R\"\"2R3S+(%4#6Z#!!%$## #$\"# #\"# #"),
          peg$decode("!.[\"\"2[3\\+b$ !7D*) \"0M\"\"1!3N,/&7D*) \"0M\"\"1!3N\"+8%.H\"\"2H3I+(%4#6]#!!%$## #$\"# #\"# #"),
          peg$decode("!.D\"\"2D3E+s$0^\"\"1!3_+c% !7D*) \"0M\"\"1!3N,/&7D*) \"0M\"\"1!3N\"+9%.H\"\"2H3I+)%4$6`$\"\"!%$$# #$## #$\"# #\"# #"),
          peg$decode("!76+q$ !!.a\"\"2a3b+-$76+#%'\"%$\"# #\"# #,>&!.a\"\"2a3b+-$76+#%'\"%$\"# #\"# #\"+)%4\"6@\"\"! %$\"# #\"# #"),
          peg$decode("!74+' 4!6c!! %"),
          peg$decode("!7B+M$77*# \" :+=%78+3%7B+)%4$6d$\"\"!%$$# #$## #$\"# #\"# #*G \"!7B+<$77+2%7B+(%4#6e#!!%$## #$\"# #\"# #"),
          peg$decode("! !.f\"\"2f3g+,$,)&.f\"\"2f3g\"\"\" #+' 4!6h!! %*b \"!.i\"\"2i3j+& 4!6k! %*K \"!.l\"\"2l3m+& 4!6k! %*4 \"!.n\"\"2n3o+& 4!6p! %"),
          peg$decode("!79+q$ !!.l\"\"2l3m+-$79+#%'\"%$\"# #\"# #,>&!.l\"\"2l3m+-$79+#%'\"%$\"# #\"# #\"+)%4\"6@\"\"! %$\"# #\"# #"),
          peg$decode("!!!0q\"\"1!3r+A$ !0s\"\"1!3t,)&0s\"\"1!3t\"+#%'\"%$\"# #\"# #+! (%+;$ !7:,#&7:\"+)%4\"6u\"\"! %$\"# #\"# #"),
          peg$decode("!.v\"\"2v3w+b$7B+X%7=*) \"7>*# \"76+B%7B+8%.x\"\"2x3y+(%4%6z%!\"%$%# #$$# #$## #$\"# #\"# #"),
          peg$decode("!.{\"\"2{3|+& 4!6}! %*4 \"!.~\"\"2~3+& 4!6\x80! %"),
          peg$decode("!.\x81\"\"2\x813\x82*# \" :+\x92$ !0\x83\"\"1!3\x84+,$,)&0\x83\"\"1!3\x84\"\"\" #+m%!.l\"\"2l3m+H$ !0\x83\"\"1!3\x84+,$,)&0\x83\"\"1!3\x84\"\"\" #+#%'\"%$\"# #\"# #*# \" :+'%4#6\x85# %$## #$\"# #\"# #"),
          peg$decode("! !0\x83\"\"1!3\x84+,$,)&0\x83\"\"1!3\x84\"\"\" #+& 4!6\x86! %"),
          peg$decode("!.\x87\"\"2\x873\x88+b$ !7D*) \"0\x89\"\"1!3\x8A,/&7D*) \"0\x89\"\"1!3\x8A\"+8%.\x87\"\"2\x873\x88+(%4#6\x8B#!!%$## #$\"# #\"# #*s \"!.\x8C\"\"2\x8C3\x8D+b$ !7D*) \"0\x8E\"\"1!3\x8F,/&7D*) \"0\x8E\"\"1!3\x8F\"+8%.\x8C\"\"2\x8C3\x8D+(%4#6\x8B#!!%$## #$\"# #\"# #"),
          peg$decode("!.\x90\"\"2\x903\x91+& 4!6\x92! %"),
          peg$decode("!.\x93\"\"2\x933\x94*\xB3 \"!.\x95\"\"2\x953\x96+\xA2$7C+\x98% !!!80\x97\"\"1!3\x989*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #+T$,Q&!!80\x97\"\"1!3\x989*$$\"\" )\"# #+2$-\"\"1!3,+#%'\"%$\"# #\"# #\"\"\" #+#%'#%$## #$\"# #\"# #+& 4!6\x99! %"),
          peg$decode("!7B+]$! !0\x9A\"\"1!3\x9B+,$,)&0\x9A\"\"1!3\x9B\"\"\" #+! (%+2%7B+(%4#6\x9C#!!%$## #$\"# #\"# #"),
          peg$decode("8! !0\x9E\"\"1!3\x9F,)&0\x9E\"\"1!3\x9F\"+! (%9*\" 3\x9D"),
          peg$decode("8! !0\x9E\"\"1!3\x9F+,$,)&0\x9E\"\"1!3\x9F\"\"\" #+! (%9*\" 3\xA0"),
          peg$decode("!.\xA1\"\"2\xA13\xA2+7$-\"\"1!3,+(%4\"6\xA3\"! %$\"# #\"# #")
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
},{"./":2,"./types":12,"underscore":29}],4:[function(require,module,exports){
var Trackr = require("trackr");
var track = require("trackr-objects");
var _ = require("underscore");
var utils = require("./utils");
var parse = require("./m+xml").parse;

var Model =
module.exports = function Model(data, parent, options) {
	this.proxies = [];
	this._dep = new Trackr.Dependency();
	if (Model.isModel(parent)) this.parent = parent;
	this.set(data, options);
};

Model.isModel = function(o) {
	return o instanceof Model;
};

Model.extend = require("backbone-extend-standalone");

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
	args = _.isArray(args) ? _.clone(args) : [];
	args.unshift(proxy, method, target);
	args.push(ctx);
	return utils.result.apply(null, args);
};

_.extend(Model.prototype, {

	// sets the data on the model
	set: function(data, options) {
		options = options || {};

		if (options.track !== false) {
			data = track(data, options.track);
		}

		this.data = data;
		this._dep.changed();
		return this;
	},

	append: function(model, options) {
		if (Model.isModel(model)) model.parent = this;
		else model = new Model(model, this, options);
		return model;
	},

	// an array of models in the current stack, with the root as the first
	getAllModels: function() {
		var models = [ this ],
			model = this;

		while (model.parent) {
			models.unshift(model = model.parent);
		}

		return models;
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

},{"./m+xml":3,"./utils":13,"backbone-extend-standalone":17,"trackr":28,"trackr-objects":22,"underscore":29}],5:[function(require,module,exports){
var _ = require("underscore");
var NODE_TYPE = require("./types");
var parse = require("./m+xml").parse;
var utils = require("./utils");
var View = require("./view");
var Model = require("./model");
var Section = require("./section");
var $track = require("trackr-objects");
var DOMRange = require("./domrange");

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
			c = this, k, d;

		while (c != null) {
			if (c._decorators != null && _.isArray(c._decorators[name])) {
				for (k in c._decorators[name]) {
					d = c._decorators[name][k];
					if (!_.findWhere(decorators, { callback: d.callback })) {
						decorators.push(_.extend({ context: c }, d));
					}
				}
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
		if (partial != null && !utils.isSubClass(View, partial))
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

				break;

			case NODE_TYPE.TEXT:
				return document.createTextNode(utils.decodeEntities(template.value));

			case NODE_TYPE.HTML:
				return new DOMRange(utils.parseHTML(template.value));

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
					range.setMembers(utils.parseHTML(view.get(template.value)));
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
				var partial = this.renderPartial(template, view);
				if (partial) toMount.push(partial);
				return partial;
		}
	},

	// converts a template into a string
	renderTemplateAsString: function(template, ctx) {
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;
		var self = this, val;

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
				val = ctx.get(template.value);
				return val != null ? val.toString() : "";

			case NODE_TYPE.SECTION:
			case NODE_TYPE.INVERTED:
				var inverted, model, isEmpty, makeRow, proxy, isList;

				inverted = template.type === NODE_TYPE.INVERTED;
				val = ctx.get(template.value);
				model = new Model(val, ctx);
				proxy = model.getProxyByValue(val);
				isList = model.callProxyMethod(proxy, val, "isList");
				isEmpty = Section.isEmpty(model, proxy);

				makeRow = function(i) {
					var data;

					if (i == null) {
						data = model;
					} else {
						data = model.callProxyMethod(proxy, val, "get", i);
						data = new Model(data, new Model({ $key: i }, ctx));
					}

					return self.renderTemplateAsString(template.children, data);
				};

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

},{"./domrange":1,"./m+xml":3,"./model":4,"./section":11,"./types":12,"./utils":13,"./view":14,"trackr-objects":22,"underscore":29}],6:[function(require,module,exports){
var _ = require("underscore"),
	Mustache = require("../");

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

// the plugin
module.exports = function() {
	this.addAction = addAction;
	this.addActionOnce = addActionOnce;
	this.removeAction = removeAction;
	this.fireAction = fireAction;
	this.decorate(decorators);

	var initActions = _.result(this, "actions");
	if (initActions != null) this.addAction(initActions);
};

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
	};
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
};

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
	if (_.isObject(action) && !(action instanceof Action)) action = _.extend(new Action(), action);
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

},{"../":2,"underscore":29}],7:[function(require,module,exports){
var Mustache = require("../");

module.exports = function() {
	this.adopt = adopt;
	this.disown = disown;
};

function adopt(view, parent, before) {
	if (!(view instanceof Mustache.View)) {
		throw new Error("Expecting instanceof Temple View.");
	}

	if (this._adopted == null) this._adopted = [];

	// have original parent disown child and set the adopted parent reference
	if (view.adoptedParent) view.adoptedParent.disown(view.adoptedParent);
	view.adoptedParent = this;

	// hook navbar data up to this data
	var oldRoot = view.getRootModel();
	oldRoot.parent = this.model;

	// render immediately if parent is mounted
	if (this.comp) view.paint(parent, before);

	// render when parent renders
	var onMount;
	this.on("mount:after", onMount = function() {
		view.paint(parent, before);
	});

	var onStop;
	this.on("stop", onStop = function() {
		view.detach();
	});

	this._adopted.push({
		stop: onStop,
		mount: onMount,
		view: view,
		root: oldRoot
	});

	return view;
}

function disown(view) {
	if (this._adopted == null) return;

	var index;
	if (!this._adopted.some(function(a, i) {
		if (a.view === view) {
			index = i;
			return true;
		}
	})) return;

	// remove form the DOM
	view.detach();

	// remove event listeners
	this.off("mount:after", this._adopted[index].mount);
	this.off("stop", this._adopted[index].stop);

	// reset the data model
	this._adopted[index].root.parent = null;

	// remove references
	if (view.adoptedParent === this) delete view.adoptedParent;
	this._adopted.splice(index, 1);

	return view;
}

},{"../":2}],8:[function(require,module,exports){
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
};

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
};

// load built in plugins
registerPlugin("actions", require("./actions"));
registerPlugin("twoway", require("./twoway"));
registerPlugin("adoption", require("./adoption"));
registerPlugin("refs", require("./refs"));

},{"./actions":6,"./adoption":7,"./refs":9,"./twoway":10,"underscore":29}],9:[function(require,module,exports){
var _ = require("underscore");

module.exports = function() {
	this.refs = {};
	this.decorate("ref", ref);
	this.findByRef = findByRef;
};

function ref(d, key) {
	var self = this;

	// don't overwrite
	if (this.refs[key] != null) {
		console.warn("Multiple elements with reference '%s'.", key);
		return;
	}

	// set the reference
	this.refs[key] = d.target;

	// remove the reference when the element disappears
	d.comp.onInvalidate(function() {
		delete self.refs[key];
	});
}

function findByRef(key) {
	var tpls = [ this ],
		tpl;

	while (tpls.length) {
		tpl = tpls.shift();
		if (tpl.refs && tpl.refs[key]) return tpl.refs[key];
		tpls = tpls.concat(tpl.getComponents());
	}

	return null;
}

},{"underscore":29}],10:[function(require,module,exports){
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
			onChange;

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
			type = getType(el);

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
};

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
};

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

},{"underscore":29}],11:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var Model = require("./model");
var View = require("./view");

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

		var val, isEmpty, inverted, isList,
			model, proxy, keys;

		val = this.get(this._path);
		model = new Model(val, this.model);
		proxy = model.getProxyByValue(val);
		inverted = this.isInverted();
		isList = model.callProxyMethod(proxy, val, "isList");

		function getEmptiness() {
			return model.callProxyMethod(proxy, val, "isEmpty");
		}

		Trackr.nonreactive(function() {
			isEmpty = !val || (isList && !getEmptiness());
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

						this._row_deps[key] = this.autorun(function() {
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

},{"./model":4,"./view":14,"trackr":28,"underscore":29}],12:[function(require,module,exports){
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
};

},{}],13:[function(require,module,exports){
var _ = require("underscore");

// like underscore's result, but pass arguments through
exports.result = function(object, property) {
	var value = object == null ? void 0 : object[property];
	return _.isFunction(value) ? value.apply(object, Array.prototype.slice.call(arguments, 2)) : value;
};

// tests value as pojo (plain old javascript object)
exports.isPlainObject = require("is-plain-object");

// tests function as a subclass of a parent function
// here, a class is technically a subclass of itself
exports.isSubClass = function(parent, fn) {
	return fn === parent || (fn != null && fn.prototype instanceof parent);
};

// like jQuery's empty(), removes all children
var emptyNode =
exports.emptyNode = function(node) {
	while (node.lastChild) node.removeChild(node.lastChild);
	return node;
};

// inserts an array nodes into a parent
exports.insertNodes = function(nodes, parent, before) {
	var node, next, i;

	// we do it backwards so nodes don't get moved if they don't need to
	for (i = nodes.length - 1; i >= 0; i--) {
		node = nodes[i];
		next = nodes[i + 1] || before;

		if (node.nextSibling !== before) {
			parent.insertBefore(node, next);
		}
	}
};

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
	};
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
	};
})();

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
		return require("matches-selector")(node, selector);
	}

	return false;
};

},{"is-plain-object":19,"matches-selector":21,"underscore":29}],14:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var utils = require("./utils");
var Model = require("./model");
var Plugins = require("./plugins");
var DOMRange = require("./domrange");
var NODE_TYPE = require("./types");

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
				if (data.parent) data.parent.append(state);
				state.append(data);
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
		if (!(_isMove || _isReplace || this.comp)) this.mount();
		return this;
	},

	// auto stop on detach
	detach: function(_isReplace) {
		if (!_isReplace) this.stop();
		DOMRange.prototype.detach.apply(this, arguments);
		return this;
	},

	autorun: function(fn, options) {
		return Trackr.autorun(fn, options, this);
	},

	// a generalized reactive workflow helper
	mount: function() {
		Trackr.nonreactive(function() {
			// stop existing mount
			this.stop();

			// the first event in the cycle, before everything else
			this.trigger("mount:before");
		}, this);

		// the autorun computation
		var comp = this.comp = this.autorun(function(comp) {
			this.render();
			this.trigger("render", comp);

			// auto clean up
			comp.onInvalidate(function() {
				// remaining invalidate events
				this.trigger("invalidate", comp);

				// detect if the computation stopped
				if (comp.stopped) {
					this.trigger("stop", comp);
					delete this.comp;
				}
			});
		});

		// remaining mount events happen after the first render
		Trackr.nonreactive(function() {
			this.trigger("mount:after", comp);
		}, this);

		return this;
	},

	render: function(){},

	stop: function() {
		if (this.comp) this.comp.stop();
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

		if (partial != null && !utils.isSubClass(View, partial))
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
	findPartial: function(name, options) {
		options = options || {};
		var c = this, p;

		while (c != null) {
			if (c._getPartial != null) {
				p = c._getPartial(name);
				p.dep.depend();
				if (options.local || p.view != null) return p.view;
			}

			c = c.parentRange;
		}
	},

	// generates a new component from a View subclass or partial's name
	renderPartial: function(klass, ctx, options) {
		var comps, name;

		// look up partial with template object
		if (typeof klass === "object" && klass.type === NODE_TYPE.PARTIAL) {
			name = klass.value;
			klass = this.findPartial(name, { local: klass.local });
		}

		// look up the partial by name
		if (typeof klass === "string") {
			name = klass;
			klass = this.findPartial(klass);
		}

		// class must be a view
		if (!utils.isSubClass(View, klass)) return null;

		// normalize context
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;
		if (ctx instanceof Model) ctx = ctx.append(ctx.data);

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
				comp = comps[n][i];
				if (!(comp instanceof View)) continue;
				res = comp.getComponent(name);
				if (res != null) return res;
			}
		}

		return null;
	},

	// returns all rendered partials by name
	getComponents: function(name) {
		if (name == null) return _.flatten(_.values(this._components));

		return _.reduce(this._components, function(m, comps, n) {
			if (n === name) m.push.apply(m, comps);

			comps.forEach(function(c) {
				if (c instanceof View) m.push.apply(m, c.getComponents(name));
			});

			return m;
		}, []);
	},

	// returns rendered partials, searching children views
	findComponents: function(name) {
		var tpls = [ this ],
			comps = [],
			tpl;

		while (tpls.length) {
			tpl = tpls.shift();
			comps = comps.concat(tpl.getComponents(name));
			tpls.push(tpl.getComponents());
		}

		return comps;
	},

	// returns rendered partials, searching children views
	findComponent: function(name) {
		var tpls = [ this ],
			tpl, comp;

		while (tpls.length) {
			tpl = tpls.shift();
			comp = tpl.getComponent(name);
			if (comp) return comp;
			tpls = tpls.concat(tpl.getComponents());
		}

		return null;
	}

});

// quick access to the top model data
Object.defineProperty(View.prototype, "data", {
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

// chainable methods to proxy to model
[ "set", "registerProxy" ]
.forEach(function(method) {
	View.prototype[method] = function() {
		this.model[method].apply(this.model, arguments);
		return this;
	};
});

// methods to proxy to model which don't return this
[ "get", "getLocal", "getProxyByValue", "getModelAtOffset",
  "getRootModel", "findModel", "getAllModels"
].forEach(function(method) {
	View.prototype[method] = function() {
		return this.model[method].apply(this.model, arguments);
	};
});

// proxy a few computation methods
[ "invalidate", "onInvalidate" ].forEach(function(method) {
	View.prototype[method] = function() {
		if (!this.comp) {
			throw new Error("Cannot run " + method + "(). This view is not mounted.");
		}

		this.comp[method].apply(this.comp, arguments);
		return this;
	};
});

},{"./domrange":1,"./model":4,"./plugins":8,"./types":12,"./utils":13,"trackr":28,"underscore":29}],15:[function(require,module,exports){
/**
 * Standalone extraction of Backbone.Events, no external dependency required.
 * Degrades nicely when Backone/underscore are already available in the current
 * global context.
 *
 * Note that docs suggest to use underscore's `_.extend()` method to add Events
 * support to some given object. A `mixin()` method has been added to the Events
 * prototype to avoid using underscore for that sole purpose:
 *
 *     var myEventEmitter = BackboneEvents.mixin({});
 *
 * Or for a function constructor:
 *
 *     function MyConstructor(){}
 *     MyConstructor.prototype.foo = function(){}
 *     BackboneEvents.mixin(MyConstructor.prototype);
 *
 * (c) 2009-2013 Jeremy Ashkenas, DocumentCloud Inc.
 * (c) 2013 Nicolas Perriault
 */
/* global exports:true, define, module */
(function() {
  var root = this,
      nativeForEach = Array.prototype.forEach,
      hasOwnProperty = Object.prototype.hasOwnProperty,
      slice = Array.prototype.slice,
      idCounter = 0;

  // Returns a partial implementation matching the minimal API subset required
  // by Backbone.Events
  function miniscore() {
    return {
      keys: Object.keys || function (obj) {
        if (typeof obj !== "object" && typeof obj !== "function" || obj === null) {
          throw new TypeError("keys() called on a non-object");
        }
        var key, keys = [];
        for (key in obj) {
          if (obj.hasOwnProperty(key)) {
            keys[keys.length] = key;
          }
        }
        return keys;
      },

      uniqueId: function(prefix) {
        var id = ++idCounter + '';
        return prefix ? prefix + id : id;
      },

      has: function(obj, key) {
        return hasOwnProperty.call(obj, key);
      },

      each: function(obj, iterator, context) {
        if (obj == null) return;
        if (nativeForEach && obj.forEach === nativeForEach) {
          obj.forEach(iterator, context);
        } else if (obj.length === +obj.length) {
          for (var i = 0, l = obj.length; i < l; i++) {
            iterator.call(context, obj[i], i, obj);
          }
        } else {
          for (var key in obj) {
            if (this.has(obj, key)) {
              iterator.call(context, obj[key], key, obj);
            }
          }
        }
      },

      once: function(func) {
        var ran = false, memo;
        return function() {
          if (ran) return memo;
          ran = true;
          memo = func.apply(this, arguments);
          func = null;
          return memo;
        };
      }
    };
  }

  var _ = miniscore(), Events;

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
  Events = {

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
      var once = _.once(function() {
        self.off(name, once);
        callback.apply(this, arguments);
      });
      once._callback = callback;
      return this.on(name, once, context);
    },

    // Remove one or many callbacks. If `context` is null, removes all
    // callbacks with that function. If `callback` is null, removes all
    // callbacks for the event. If `name` is null, removes all bound
    // callbacks for all events.
    off: function(name, callback, context) {
      var retain, ev, events, names, i, l, j, k;
      if (!this._events || !eventsApi(this, 'off', name, [callback, context])) return this;
      if (!name && !callback && !context) {
        this._events = {};
        return this;
      }

      names = name ? [name] : _.keys(this._events);
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
      var args = slice.call(arguments, 1);
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
      var listeners = this._listeners;
      if (!listeners) return this;
      var deleteListener = !name && !callback;
      if (typeof name === 'object') callback = this;
      if (obj) (listeners = {})[obj._listenerId] = obj;
      for (var id in listeners) {
        listeners[id].off(name, callback, this);
        if (deleteListener) delete this._listeners[id];
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
      default: while (++i < l) (ev = events[i]).callback.apply(ev.ctx, args);
    }
  };

  var listenMethods = {listenTo: 'on', listenToOnce: 'once'};

  // Inversion-of-control versions of `on` and `once`. Tell *this* object to
  // listen to an event in another object ... keeping track of what it's
  // listening to.
  _.each(listenMethods, function(implementation, method) {
    Events[method] = function(obj, name, callback) {
      var listeners = this._listeners || (this._listeners = {});
      var id = obj._listenerId || (obj._listenerId = _.uniqueId('l'));
      listeners[id] = obj;
      if (typeof name === 'object') callback = this;
      obj[implementation](name, callback, this);
      return this;
    };
  });

  // Aliases for backwards compatibility.
  Events.bind   = Events.on;
  Events.unbind = Events.off;

  // Mixin utility
  Events.mixin = function(proto) {
    var exports = ['on', 'once', 'off', 'trigger', 'stopListening', 'listenTo',
                   'listenToOnce', 'bind', 'unbind'];
    _.each(exports, function(name) {
      proto[name] = this[name];
    }, this);
    return proto;
  };

  // Export Events as BackboneEvents depending on current context
  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Events;
    }
    exports.BackboneEvents = Events;
  }else if (typeof define === "function"  && typeof define.amd == "object") {
    define(function() {
      return Events;
    });
  } else {
    root.BackboneEvents = Events;
  }
})(this);

},{}],16:[function(require,module,exports){
module.exports = require('./backbone-events-standalone');

},{"./backbone-events-standalone":15}],17:[function(require,module,exports){
(function (definition) {
  if (typeof exports === "object") {
    module.exports = definition();
  }
  else if (typeof define === 'function' && define.amd) {
    define(definition);
  }
  else {
    window.BackboneExtend = definition();
  }
})(function () {
  "use strict";
  
  // mini-underscore
  var _ = {
    has: function (obj, key) {
      return Object.prototype.hasOwnProperty.call(obj, key);
    },
  
    extend: function(obj) {
      for (var i=1; i<arguments.length; ++i) {
        var source = arguments[i];
        if (source) {
          for (var prop in source) {
            obj[prop] = source[prop];
          }
        }
      }
      return obj;
    }
  };

  /// Following code is pasted from Backbone.js ///

  // Helper function to correctly set up the prototype chain, for subclasses.
  // Similar to `goog.inherits`, but uses a hash of prototype properties and
  // class properties to be extended.
  var extend = function(protoProps, staticProps) {
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
    child.prototype = new Surrogate();

    // Add prototype properties (instance properties) to the subclass,
    // if supplied.
    if (protoProps) _.extend(child.prototype, protoProps);

    // Set a convenience property in case the parent's prototype is needed
    // later.
    child.__super__ = parent.prototype;

    return child;
  };

  // Expose the extend function
  return extend;
});

},{}],18:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
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

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],19:[function(require,module,exports){
/*!
 * is-plain-object <https://github.com/jonschlinkert/is-plain-object>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var isObject = require('isobject');

function isObjectObject(o) {
  return isObject(o) === true
    && Object.prototype.toString.call(o) === '[object Object]';
}

module.exports = function isPlainObject(o) {
  var ctor,prot;
  
  if (isObjectObject(o) === false) return false;
  
  // If has modified constructor
  ctor = o.constructor;
  if (typeof ctor !== 'function') return false;
  
  // If has modified prototype
  prot = ctor.prototype;
  if (isObjectObject(prot) === false) return false;
  
  // If constructor does not have an Object-specific method
  if (prot.hasOwnProperty('isPrototypeOf') === false) {
    return false;
  }
  
  // Most likely a plain Object
  return true;
};

},{"isobject":20}],20:[function(require,module,exports){
/*!
 * isobject <https://github.com/jonschlinkert/isobject>
 *
 * Copyright (c) 2014-2015, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

module.exports = function isObject(val) {
  return val != null && typeof val === 'object'
    && !Array.isArray(val);
};

},{}],21:[function(require,module,exports){
'use strict';

var proto = Element.prototype;
var vendor = proto.matches
  || proto.matchesSelector
  || proto.webkitMatchesSelector
  || proto.mozMatchesSelector
  || proto.msMatchesSelector
  || proto.oMatchesSelector;

module.exports = match;

/**
 * Match `el` to `selector`.
 *
 * @param {Element} el
 * @param {String} selector
 * @return {Boolean}
 * @api public
 */

function match(el, selector) {
  if (vendor) return vendor.call(el, selector);
  var nodes = el.parentNode.querySelectorAll(selector);
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i] == el) return true;
  }
  return false;
}
},{}],22:[function(require,module,exports){
var Trackr = require("trackr");
var hasOwn = require("has-own-prop");
var clone = require("shallow-copy");
var isPlainObject = require("is-plain-object");
var patchArray = require("array-spy");

var track =
module.exports = function(obj, replacer) {
	function replace(k, v) {
		var nval;
		if (typeof replacer === "function") nval = replacer.apply(this, arguments);
		if (typeof nval === "undefined" && typeof v !== "undefined") nval = track(v);
		return nval;
	}

	if (Array.isArray(obj)) return trackArray(obj, replace)
	if (isPlainObject(obj)) return trackObject(obj, replace);
	return obj;
}

var trackProperty =
track.trackProperty = function(obj, prop, value, options) {
	if (typeof obj !== "object" || obj == null) {
		throw new Error("Expecting object to define the reactive property on.");
	}

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
track.trackObject = function(props, replacer) {
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

	_proto.defineProperty = function(name, value, options) {
		Object.defineProperty(this, name, {
			configurable: options == null || options.configurable !== false,
			enumerable: options == null || options.enumerable !== false,
			get: getter.bind(this, name),
			set: setter.bind(this, name)
		});

		this[name] = value;
		return this;
	};

	_proto.deleteProperty = function(name) {
		var dep = deps[name];
		if (delete this[name]) { // in case configurable === false
			delete values[name];
			delete deps[name];
			if (dep) dep.changed();
		}
		return this;
	};

	_proto.toJSON = function() {
		mainDep.depend();
		return clone(values);
	};

	Object.defineProperty(_proto, "__reactive", {
		configurable: false,
		enumerable: false,
		value: true,
		writeable: false
	});

	var robj = Object.create(_proto);

	for (var key in props) {
		if (hasOwn(props, key)) robj.defineProperty(key, props[key]);
	}

	return robj;
}

var trackArray =
track.trackArray = function(arr, replacer) {
	if (!Array.isArray(arr)) throw new Error("Expecting array.");
	if (arr.__reactive) return arr;

	var deps = { length: new Trackr.Dependency() };
	var values = {};
	var narr = patchArray([]);

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

	Object.defineProperty(narr, "depend", {
		configurable: false,
		enumerable: false,
		get: function() {
			deps.length.depend();
		}
	});

	narr.push.apply(narr, arr);
	return narr;
}

},{"array-spy":23,"has-own-prop":24,"is-plain-object":19,"shallow-copy":25,"trackr":28}],23:[function(require,module,exports){
// array write operations
var mutatorMethods = [ 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ];

// patches an array so we can listen to write operations
var patchArray =
module.exports = function(arr) {
	if (arr._patched) return arr;

	var patchedArrayProto = [],
		observers = [];

	mutatorMethods.forEach(function(methodName) {
		Object.defineProperty(patchedArrayProto, methodName, {
			value: method
		});

		function method() {
			var spliceEquivalent, summary, args, res;

			args = Array.prototype.slice.call(arguments, 0);

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

	var extras = {
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
	};

	for (var k in extras) {
		Object.defineProperty(arr, k, {
			configurable: false,
			enumerable: false,
			value: extras[k],
			writeable: false
		});
	}

	return arr;
}

// converts array write operations into splice equivalent arguments
var getSpliceEquivalent =
patchArray.getSpliceEquivalent = function ( array, methodName, args ) {
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
patchArray.summariseSpliceOperation = function ( array, args ) {
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

},{}],24:[function(require,module,exports){
'use strict';
var hasOwnProp = Object.prototype.hasOwnProperty;

module.exports = function (obj, prop) {
	return hasOwnProp.call(obj, prop);
};

},{}],25:[function(require,module,exports){
module.exports = function (obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    var copy;
    
    if (isArray(obj)) {
        var len = obj.length;
        copy = Array(len);
        for (var i = 0; i < len; i++) {
            copy[i] = obj[i];
        }
    }
    else {
        var keys = objectKeys(obj);
        copy = {};
        
        for (var i = 0, l = keys.length; i < l; i++) {
            var key = keys[i];
            copy[key] = obj[key];
        }
    }
    return copy;
};

var objectKeys = Object.keys || function (obj) {
    var keys = [];
    for (var key in obj) {
        if ({}.hasOwnProperty.call(obj, key)) keys.push(key);
    }
    return keys;
};

var isArray = Array.isArray || function (xs) {
    return {}.toString.call(xs) === '[object Array]';
};

},{}],26:[function(require,module,exports){
var now = require('performance-now')
  , global = typeof window === 'undefined' ? {} : window
  , vendors = ['moz', 'webkit']
  , suffix = 'AnimationFrame'
  , raf = global['request' + suffix]
  , caf = global['cancel' + suffix] || global['cancelRequest' + suffix]

for(var i = 0; i < vendors.length && !raf; i++) {
  raf = global[vendors[i] + 'Request' + suffix]
  caf = global[vendors[i] + 'Cancel' + suffix]
      || global[vendors[i] + 'CancelRequest' + suffix]
}

// Some versions of FF have rAF but not cAF
if(!raf || !caf) {
  var last = 0
    , id = 0
    , queue = []
    , frameDuration = 1000 / 60

  raf = function(callback) {
    if(queue.length === 0) {
      var _now = now()
        , next = Math.max(0, frameDuration - (_now - last))
      last = next + _now
      setTimeout(function() {
        var cp = queue.slice(0)
        // Clear queue here to prevent
        // callbacks from appending listeners
        // to the current frame's queue
        queue.length = 0
        for(var i = 0; i < cp.length; i++) {
          if(!cp[i].cancelled) {
            try{
              cp[i].callback(last)
            } catch(e) {
              setTimeout(function() { throw e }, 0)
            }
          }
        }
      }, Math.round(next))
    }
    queue.push({
      handle: ++id,
      callback: callback,
      cancelled: false
    })
    return id
  }

  caf = function(handle) {
    for(var i = 0; i < queue.length; i++) {
      if(queue[i].handle === handle) {
        queue[i].cancelled = true
      }
    }
  }
}

module.exports = function(fn) {
  // Wrap in a new function to prevent
  // `cancel` potentially being assigned
  // to the native rAF function
  return raf.call(global, fn)
}
module.exports.cancel = function() {
  caf.apply(global, arguments)
}

},{"performance-now":27}],27:[function(require,module,exports){
(function (process){
// Generated by CoffeeScript 1.7.1
(function() {
  var getNanoSeconds, hrtime, loadTime;

  if ((typeof performance !== "undefined" && performance !== null) && performance.now) {
    module.exports = function() {
      return performance.now();
    };
  } else if ((typeof process !== "undefined" && process !== null) && process.hrtime) {
    module.exports = function() {
      return (getNanoSeconds() - loadTime) / 1e6;
    };
    hrtime = process.hrtime;
    getNanoSeconds = function() {
      var hr;
      hr = hrtime();
      return hr[0] * 1e9 + hr[1];
    };
    loadTime = getNanoSeconds();
  } else if (Date.now) {
    module.exports = function() {
      return Date.now() - loadTime;
    };
    loadTime = Date.now();
  } else {
    module.exports = function() {
      return new Date().getTime() - loadTime;
    };
    loadTime = new Date().getTime();
  }

}).call(this);

}).call(this,require('_process'))

},{"_process":18}],28:[function(require,module,exports){
(function (global){
/////////////////////////////////////////////////////
// Package docs at http://docs.meteor.com/#tracker //
// Last merge: https://github.com/meteor/meteor/blob/696876b1848e4d6a920143422c2c50c4501c85a3/packages/tracker/tracker.js //
/////////////////////////////////////////////////////

// check for global and use that one instead of loading a new one
if (typeof global.Trackr !== "undefined") {
	module.exports = global.Trackr;
	return;
}

/**
 * @namespace Trackr
 * @summary The namespace for Trackr-related methods.
 */
var Trackr = global.Trackr = module.exports = {};

// http://docs.meteor.com/#tracker_active

/**
 * @summary True if there is a current computation, meaning that dependencies on reactive data sources will be tracked and potentially cause the current computation to be rerun.
 * @locus Client
 * @type {Boolean}
 */
Trackr.active = false;

// http://docs.meteor.com/#tracker_currentcomputation

/**
 * @summary The current computation, or `null` if there isn't one.	The current computation is the [`Trackr.Computation`](#tracker_computation) object created by the innermost active call to `Trackr.autorun`, and it's the computation that gains dependencies when reactive data sources are accessed.
 * @locus Client
 * @type {Trackr.Computation}
 */
Trackr.currentComputation = null;

// References to all computations created within the Trackr by id.
// Keeping these references on an underscore property gives more control to
// tooling and packages extending Trackr without increasing the API surface.
// These can used to monkey-patch computations, their functions, use
// computation ids for tracking, etc.
Trackr._computations = {};

var setCurrentComputation = function (c) {
	Trackr.currentComputation = c;
	Trackr.active = !! c;
};

var _debugFunc = function () {
	return (typeof console !== "undefined") && console.error ?
			 function () { console.error.apply(console, arguments); } :
			 function () {};
};

var _throwOrLog = function (from, e) {
	if (throwFirstError) {
		throw e;
	} else {
		var printArgs = ["Exception from Trackr " + from + " function:"];
		if (e.stack && e.message && e.name) {
			var idx = e.stack.indexOf(e.message);
			if (idx < 0 || idx > e.name.length + 2) { // check for "Error: "
				// message is not part of the stack
				var message = e.name + ": " + e.message;
				printArgs.push(message);
			}
		}
		printArgs.push(e.stack);

		for (var i = 0; i < printArgs.length; i++) {
			_debugFunc()(printArgs[i]);
		}
	}
};

// Takes a function `f`, and wraps it in a `Meteor._noYieldsAllowed`
// block if we are running on the server. On the client, returns the
// original function (since `Meteor._noYieldsAllowed` is a
// no-op). This has the benefit of not adding an unnecessary stack
// frame on the client.
var withNoYieldsAllowed = function (f) {
	return f;
};

var nextId = 1;
// computations whose callbacks we should call at flush time
var pendingComputations = [];
// `true` if a Trackr.flush is scheduled, or if we are in Trackr.flush now
var willFlush = false;
// `true` if we are in Trackr.flush now
var inFlush = false;
// `true` if we are computing a computation now, either first time
// or recompute.	This matches Trackr.active unless we are inside
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

var requestAnimationFrame = require("raf");

var requireFlush = function () {
	if (! willFlush) {
		requestAnimationFrame(Trackr._runFlush);
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
Trackr.Computation = function (f, parent, options) {
	if (! constructingComputation)
		throw new Error(
			"Trackr.Computation constructor is private; use Trackr.autorun");
	constructingComputation = false;

	var self = this;
	options = options || {};

	// http://docs.meteor.com/#computation_stopped

	/**
	 * @summary True if this computation has been stopped.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name	stopped
	 */
	self.stopped = false;

	// http://docs.meteor.com/#computation_invalidated

	/**
	 * @summary True if this computation has been invalidated (and not yet rerun), or if it has been stopped.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name	invalidated
	 * @type {Boolean}
	 */
	self.invalidated = false;

	// http://docs.meteor.com/#computation_firstrun

	/**
	 * @summary True during the initial run of the computation at the time `Trackr.autorun` is called, and false on subsequent reruns and at other times.
	 * @locus Client
	 * @memberOf Trackr.Computation
	 * @instance
	 * @name	firstRun
	 * @type {Boolean}
	 */
	self.firstRun = true;

	self._id = nextId++;
	self._onInvalidateCallbacks = [];
	self._onStopCallbacks = [];
	// the plan is at some point to use the parent relation
	// to constrain the order that computations are processed
	self._parent = parent;
	self._func = f;
	self._onError = options.onError;
	self._recomputing = false;
	self._context = options.context || null;

	// Register the computation within the global Trackr.
	Trackr._computations[self._id] = self;

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
 * @summary Registers `callback` to run when this computation is next invalidated, or runs it immediately if the computation is already invalidated.	The callback is run exactly once and not upon future invalidations unless `onInvalidate` is called again after the computation becomes valid again.
 * @locus Client
 * @param {Function} callback Function to be called on invalidation. Receives one argument, the computation that was invalidated.
 */
Trackr.Computation.prototype.onInvalidate = function (f, ctx) {
	var self = this;

	if (typeof f !== 'function')
		throw new Error("onInvalidate requires a function");

	if (self.invalidated) {
		Trackr.nonreactive(function () {
			withNoYieldsAllowed(f).call(ctx || self._context, self);
		});
	} else {
		self._onInvalidateCallbacks.push({ fn: f, ctx: ctx });
	}
};

/**
 * @summary Registers `callback` to run when this computation is stopped, or runs it immediately if the computation is already stopped.	The callback is run after any `onInvalidate` callbacks.
 * @locus Client
 * @param {Function} callback Function to be called on stop. Receives one argument, the computation that was stopped.
 */
Trackr.Computation.prototype.onStop = function (f, ctx) {
	var self = this;

	if (typeof f !== 'function')
		throw new Error("onStop requires a function");

	if (self.stopped) {
		Trackr.nonreactive(function () {
			withNoYieldsAllowed(f).call(ctx || self._context, self);
		});
	} else {
		self._onStopCallbacks.push({ fn: f, ctx: ctx });
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
				withNoYieldsAllowed(f.fn).call(f.ctx || self._context, self);
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
	var self = this;

	if (! self.stopped) {
		self.stopped = true;
		self.invalidate();
		// Unregister from global Trackr.
		delete Trackr._computations[self._id];
		for(var i = 0, f; f = self._onStopCallbacks[i]; i++) {
			Trackr.nonreactive(function () {
				withNoYieldsAllowed(f.fn).call(f.ctx || self._context, self);
			});
		}
		self._onStopCallbacks = [];
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

Trackr.Computation.prototype._needsRecompute = function () {
	var self = this;
	return self.invalidated && ! self.stopped;
};

Trackr.Computation.prototype._recompute = function () {
	var self = this;

	self._recomputing = true;
	try {
		if (self._needsRecompute()) {
			try {
				self._compute();
			} catch (e) {
				if (self._onError) {
					self._onError(e);
				} else {
					_throwOrLog("recompute", e);
				}
			}
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
// present.	Returns true if `computation` is a new member of the set.
// If no argument, defaults to currentComputation, or does nothing
// if there is no currentComputation.

/**
 * @summary Declares that the current computation (or `fromComputation` if given) depends on `dependency`.	The computation will be invalidated the next time `dependency` changes.

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
Trackr.flush = function (options) {
	Trackr._runFlush({ finishSynchronously: true,
											throwFirstError: options && options._throwFirstError });
};

// Run all pending computations and afterFlush callbacks.	If we were not called
// directly via Trackr.flush, this may return before they're all done to allow
// the event loop to run a little before continuing.
Trackr._runFlush = function (options) {
	// XXX What part of the comment below is still true? (We no longer
	// have Spark)
	//
	// Nested flush could plausibly happen if, say, a flush causes
	// DOM mutation, which causes a "blur" event, which runs an
	// app event handler that calls Trackr.flush.	At the moment
	// Spark blocks event handlers during DOM mutation anyway,
	// because the LiveRange tree isn't valid.	And we don't have
	// any useful notion of a nested flush.
	//
	// https://app.asana.com/0/159908330244/385138233856
	if (inFlush)
		throw new Error("Can't call Trackr.flush while flushing");

	if (inCompute)
		throw new Error("Can't flush inside Trackr.autorun");

	options = options || {};

	inFlush = true;
	willFlush = true;
	throwFirstError = !! options.throwFirstError;

	var recomputedCount = 0;
	var finishedTry = false;
	try {
		while (pendingComputations.length ||
					 afterFlushCallbacks.length) {

			// recompute all pending computations
			while (pendingComputations.length) {
				var comp = pendingComputations.shift();
				comp._recompute();
				if (comp._needsRecompute()) {
					pendingComputations.unshift(comp);
				}

				if (! options.finishSynchronously && ++recomputedCount > 1000) {
					finishedTry = true;
					return;
				}
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
			// we're erroring due to throwFirstError being true.
			inFlush = false; // needed before calling `Trackr.flush()` again
			// finish flushing
			Trackr._runFlush({
				finishSynchronously: options.finishSynchronously,
				throwFirstError: false
			});
		}
		willFlush = false;
		inFlush = false;
		if (pendingComputations.length || afterFlushCallbacks.length) {
			// We're yielding because we ran a bunch of computations and we aren't
			// required to finish synchronously, so we'd like to give the event loop a
			// chance. We should flush again soon.
			if (options.finishSynchronously) {
				throw new Error("still have more to do?");	// shouldn't happen
			}
			setTimeout(requireFlush, 10);
		}
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
 * @callback Trackr.ComputationFunction
 * @param {Trackr.Computation}
 */
/**
 * @summary Run a function now and rerun it later whenever its dependencies
 * change. Returns a Computation object that can be used to stop or observe the
 * rerunning.
 * @locus Client
 * @param {Trackr.ComputationFunction} runFunc The function to run. It receives
 * one argument: the Computation object that will be returned.
 * @param {Object} [options]
 * @param {Function} options.onError Optional. The function to run when an error
 * happens in the Computation. The only argument it recieves is the Error
 * thrown. Defaults to the error being logged to the console.
 * @returns {Trackr.Computation}
 */
Trackr.autorun = function (f, options, ctx) {
	if (typeof f !== 'function')
		throw new Error('Trackr.autorun requires a function argument');

	options = options || {};
	if (ctx) options.context = ctx;

	constructingComputation = true;
	var c = new Trackr.Computation(
		f, Trackr.currentComputation, options);

	if (Trackr.active)
		Trackr.onInvalidate(function () {
			c.stop();
		});

	return c;
};

// http://docs.meteor.com/#tracker_nonreactive
//
// Run `f` with no current computation, returning the return value
// of `f`.	Used to turn off reactivity for the duration of `f`,
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
 * @summary Schedules a function to be called during the next flush, or later in the current flush if one is in progress, after all invalidated computations have been rerun.	The function will be run once and not on subsequent flushes unless `afterFlush` is called again.
 * @locus Client
 * @param {Function} callback A function to call at flush time.
 */
Trackr.afterFlush = function (f, ctx) {
	afterFlushCallbacks.push({ fn: f, ctx: ctx });
	requireFlush();
};

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"raf":26}],29:[function(require,module,exports){
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

},{}]},{},[2])(2)
});
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZG9tcmFuZ2UuanMiLCJsaWIvaW5kZXguanMiLCJsaWIvbSt4bWwuanMiLCJsaWIvbW9kZWwuanMiLCJsaWIvbXVzdGFjaGUuanMiLCJsaWIvcGx1Z2lucy9hY3Rpb25zLmpzIiwibGliL3BsdWdpbnMvYWRvcHRpb24uanMiLCJsaWIvcGx1Z2lucy9pbmRleC5qcyIsImxpYi9wbHVnaW5zL3JlZnMuanMiLCJsaWIvcGx1Z2lucy90d293YXkuanMiLCJsaWIvc2VjdGlvbi5qcyIsImxpYi90eXBlcy5qcyIsImxpYi91dGlscy5qcyIsImxpYi92aWV3LmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lLmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lL2JhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lLmpzIiwibm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9pcy1wbGFpbi1vYmplY3QvaW5kZXguanMiLCJub2RlX21vZHVsZXMvaXMtcGxhaW4tb2JqZWN0L25vZGVfbW9kdWxlcy9pc29iamVjdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tYXRjaGVzLXNlbGVjdG9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL25vZGVfbW9kdWxlcy9hcnJheS1zcHkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHJhY2tyLW9iamVjdHMvbm9kZV9tb2R1bGVzL2hhcy1vd24tcHJvcC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3Itb2JqZWN0cy9ub2RlX21vZHVsZXMvc2hhbGxvdy1jb3B5L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci9ub2RlX21vZHVsZXMvcmFmL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci9ub2RlX21vZHVsZXMvcmFmL25vZGVfbW9kdWxlcy9wZXJmb3JtYW5jZS1ub3cvbGliL3BlcmZvcm1hbmNlLW5vdy5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIiwibm9kZV9tb2R1bGVzL3VuZGVyc2NvcmUvdW5kZXJzY29yZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzl1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2WUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwUkE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7O0FDcG1CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuLy8gVGhpcyBpcyBhIGhlYXZpbHkgbW9kaWZpZWQgdmVyc2lvbiBvZiBNZXRlb3IncyBET01SYW5nZSAvL1xuLy8gTGFzdCBtZXJnZTogaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvYmxvYi80MDUwMDlhMmMzZGNkM2MxZmU3ODBhZGIyODY3ZDM4YTZhNDJmZmYxL3BhY2thZ2VzL2JsYXplL2RvbXJhbmdlLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG52YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRFdmVudHMgPSByZXF1aXJlKFwiYmFja2JvbmUtZXZlbnRzLXN0YW5kYWxvbmVcIiksXG5cdG1hdGNoZXNTZWxlY3RvciA9IHJlcXVpcmUoXCJtYXRjaGVzLXNlbGVjdG9yXCIpO1xuXG5mdW5jdGlvbiBpc0FycmF5TGlrZShhKSB7XG5cdHJldHVybiBhICE9IG51bGwgJiYgdHlwZW9mIGEubGVuZ3RoID09PSBcIm51bWJlclwiO1xufVxuXG4vLyBgW25ld10gQmxhemUuX0RPTVJhbmdlKFtub2RlQW5kUmFuZ2VBcnJheV0pYFxuLy9cbi8vIEEgRE9NUmFuZ2UgY29uc2lzdHMgb2YgYW4gYXJyYXkgb2YgY29uc2VjdXRpdmUgbm9kZXMgYW5kIERPTVJhbmdlcyxcbi8vIHdoaWNoIG1heSBiZSByZXBsYWNlZCBhdCBhbnkgdGltZSB3aXRoIGEgbmV3IGFycmF5LiAgSWYgdGhlIERPTVJhbmdlXG4vLyBoYXMgYmVlbiBhdHRhY2hlZCB0byB0aGUgRE9NIGF0IHNvbWUgbG9jYXRpb24sIHRoZW4gdXBkYXRpbmdcbi8vIHRoZSBhcnJheSB3aWxsIGNhdXNlIHRoZSBET00gdG8gYmUgdXBkYXRlZCBhdCB0aGF0IGxvY2F0aW9uLlxuZnVuY3Rpb24gRE9NUmFuZ2Uobm9kZUFuZFJhbmdlQXJyYXkpIHtcblx0Ly8gY2FsbGVkIHdpdGhvdXQgYG5ld2Bcblx0aWYgKCEodGhpcyBpbnN0YW5jZW9mIERPTVJhbmdlKSkge1xuXHRcdHJldHVybiBuZXcgRE9NUmFuZ2Uobm9kZUFuZFJhbmdlQXJyYXkpO1xuXHR9XG5cblx0dmFyIG1lbWJlcnMgPSAobm9kZUFuZFJhbmdlQXJyYXkgfHwgW10pO1xuXHRpZiAoIWlzQXJyYXlMaWtlKG1lbWJlcnMpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBhcnJheVwiKTtcblxuXHRmb3IgKHZhciBpID0gMDsgaSA8IG1lbWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHR0aGlzLl9tZW1iZXJJbihtZW1iZXJzW2ldKTtcblx0fVxuXG5cdHRoaXMubWVtYmVycyA9IG1lbWJlcnM7XG5cdHRoaXMucGxhY2Vob2xkZXIgPSBudWxsO1xuXHR0aGlzLmF0dGFjaGVkID0gZmFsc2U7XG5cdHRoaXMucGFyZW50RWxlbWVudCA9IG51bGw7XG5cdHRoaXMucGFyZW50UmFuZ2UgPSBudWxsO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IERPTVJhbmdlO1xuRE9NUmFuZ2UuZXh0ZW5kID0gcmVxdWlyZShcImJhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lXCIpO1xuXG4vLyBmaW5kcyB0aGUgRE9NUmFuZ2UgdGhlIGVsZW1lbnQgaXMgYSBwYXJ0IG9mXG5ET01SYW5nZS5mb3JFbGVtZW50ID0gZnVuY3Rpb24gKGVsZW0pIHtcblx0aWYgKGVsZW0ubm9kZVR5cGUgIT09IDEpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGVsZW1lbnQsIGZvdW5kOiBcIiArIGVsZW0pO1xuXG5cdHZhciByYW5nZSA9IG51bGw7XG5cblx0d2hpbGUgKGVsZW0gJiYgIXJhbmdlKSB7XG5cdFx0cmFuZ2UgPSAoZWxlbS4kZG9tcmFuZ2UgfHwgbnVsbCk7XG5cdFx0ZWxlbSA9IGVsZW0ucGFyZW50Tm9kZTtcblx0fVxuXG5cdHJldHVybiByYW5nZTtcbn07XG5cbl8uZXh0ZW5kKERPTVJhbmdlLnByb3RvdHlwZSwgRXZlbnRzLCB7XG5cblx0Ly8gVGhpcyBtZXRob2QgaXMgY2FsbGVkIHRvIGluc2VydCB0aGUgRE9NUmFuZ2UgaW50byB0aGUgRE9NIGZvclxuXHQvLyB0aGUgZmlyc3QgdGltZSwgYnV0IGl0J3MgYWxzbyB1c2VkIGludGVybmFsbHkgd2hlblxuXHQvLyB1cGRhdGluZyB0aGUgRE9NLlxuXHQvLyBJZiBfaXNNb3ZlIGlzIHRydWUsIG1vdmUgdGhpcyBhdHRhY2hlZCByYW5nZSB0byBhIGRpZmZlcmVudFxuXHQvLyBsb2NhdGlvbiB1bmRlciB0aGUgc2FtZSBwYXJlbnRFbGVtZW50LlxuXHRhdHRhY2g6IGZ1bmN0aW9uKHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlLCBfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKHR5cGVvZiBwYXJlbnRFbGVtZW50ID09PSBcInN0cmluZ1wiKSBwYXJlbnRFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihwYXJlbnRFbGVtZW50KTtcblx0XHRpZiAodHlwZW9mIG5leHROb2RlID09PSBcInN0cmluZ1wiKSBuZXh0Tm9kZSA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKG5leHROb2RlKTtcblx0XHRpZiAocGFyZW50RWxlbWVudCA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSB2YWxpZCBET00gZWxlbWVudCB0byBhdHRhY2ggaW4uXCIpO1xuXG5cdFx0aWYgKChfaXNNb3ZlIHx8IF9pc1JlcGxhY2UpICYmICEodGhpcy5wYXJlbnRFbGVtZW50ID09PSBwYXJlbnRFbGVtZW50ICYmIHRoaXMuYXR0YWNoZWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4gb25seSBtb3ZlIG9yIHJlcGxhY2UgYW4gYXR0YWNoZWQgRE9NUmFuZ2UsIGFuZCBvbmx5IHVuZGVyIHRoZSBzYW1lIHBhcmVudCBlbGVtZW50XCIpO1xuXHRcdH1cblxuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGlmIChtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG1lbWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aW5zZXJ0SW50b0RPTShtZW1iZXJzW2ldLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyTm9kZSgpO1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xuXHRcdFx0cGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUocGxhY2Vob2xkZXIsIG5leHROb2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLmF0dGFjaGVkID0gdHJ1ZTtcblx0XHR0aGlzLnBhcmVudEVsZW1lbnQgPSBwYXJlbnRFbGVtZW50O1xuXG5cdFx0Ly8gdHJpZ2dlciBldmVudHMgb25seSBvbiBmcmVzaCBhdHRhY2htZW50c1xuXHRcdGlmICghKF9pc01vdmUgfHwgX2lzUmVwbGFjZSkpIHRoaXMudHJpZ2dlcihcImF0dGFjaFwiLCBwYXJlbnRFbGVtZW50KTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGRldGFjaDogZnVuY3Rpb24oX2lzUmVwbGFjZSkge1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkgcmV0dXJuIHRoaXM7XG5cblx0XHR2YXIgb2xkUGFyZW50RWxlbWVudCA9IHRoaXMucGFyZW50RWxlbWVudDtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRpZiAobWVtYmVycy5sZW5ndGgpIHtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRyZW1vdmVGcm9tRE9NKG1lbWJlcnNbaV0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgcGxhY2Vob2xkZXIgPSB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKHBsYWNlaG9sZGVyKTtcblx0XHRcdHRoaXMucGxhY2Vob2xkZXIgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghX2lzUmVwbGFjZSkge1xuXHRcdFx0dGhpcy5hdHRhY2hlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50ID0gbnVsbDtcblx0XHRcdHRoaXMudHJpZ2dlcihcImRldGFjaFwiLCBvbGRQYXJlbnRFbGVtZW50KTtcblx0XHR9XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHRocm93IG5ldyBFcnJvcihcIk11c3QgYmUgYXR0YWNoZWRcIik7XG5cdFx0aWYgKCF0aGlzLm1lbWJlcnMubGVuZ3RoKSByZXR1cm4gdGhpcy5wbGFjZWhvbGRlcjtcblx0XHR2YXIgbSA9IHRoaXMubWVtYmVyc1swXTtcblx0XHRyZXR1cm4gKG0gaW5zdGFuY2VvZiBET01SYW5nZSkgPyBtLmZpcnN0Tm9kZSgpIDogbTtcblx0fSxcblxuXHRsYXN0Tm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJNdXN0IGJlIGF0dGFjaGVkXCIpO1xuXHRcdGlmICghdGhpcy5tZW1iZXJzLmxlbmd0aCkgcmV0dXJuIHRoaXMucGxhY2Vob2xkZXI7XG5cdFx0dmFyIG0gPSB0aGlzLm1lbWJlcnNbdGhpcy5tZW1iZXJzLmxlbmd0aCAtIDFdO1xuXHRcdHJldHVybiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0ubGFzdE5vZGUoKSA6IG07XG5cdH0sXG5cblx0Z2V0TWVtYmVyOiBmdW5jdGlvbihhdEluZGV4KSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0aWYgKCEoYXRJbmRleCA+PSAwICYmIGF0SW5kZXggPCBtZW1iZXJzLmxlbmd0aCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBpbmRleCBpbiByYW5nZS5nZXRNZW1iZXI6IFwiICsgYXRJbmRleCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1lbWJlcnNbYXRJbmRleF07XG5cdH0sXG5cblx0Ly8gcmVzZXRzIHRoZSBET01SYW5nZSB3aXRoIG5ldyBjb250ZW50XG5cdHNldE1lbWJlcnM6IGZ1bmN0aW9uKG5ld05vZGVBbmRSYW5nZUFycmF5KSB7XG5cdFx0dmFyIG5ld01lbWJlcnMgPSBuZXdOb2RlQW5kUmFuZ2VBcnJheTtcblx0XHRpZiAoIWlzQXJyYXlMaWtlKG5ld01lbWJlcnMpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBhcnJheVwiKTtcblx0XHR2YXIgb2xkTWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHR2YXIgX2lzUmVwbGFjZSA9IHRoaXMuYXR0YWNoZWQgJiYgKG5ld01lbWJlcnMubGVuZ3RoIHx8IG9sZE1lbWJlcnMubGVuZ3RoKTtcblx0XHR2YXIgaTtcblxuXHRcdC8vIGRlcmVmZXJlbmNlIG9sZCBtZW1iZXJzXG5cdFx0Zm9yIChpID0gMDsgaSA8IG9sZE1lbWJlcnMubGVuZ3RoOyBpKyspIHRoaXMuX21lbWJlck91dChvbGRNZW1iZXJzW2ldLCBmYWxzZSwgX2lzUmVwbGFjZSk7XG5cblx0XHQvLyByZWZlcmVuY2UgbmV3IG1lbWJlcnNcblx0XHRmb3IgKGkgPSAwOyBpIDwgbmV3TWVtYmVycy5sZW5ndGg7IGkrKykgdGhpcy5fbWVtYmVySW4obmV3TWVtYmVyc1tpXSk7XG5cblx0XHRpZiAoX2lzUmVwbGFjZSkge1xuXHRcdFx0Ly8gZGV0YWNoIHRoZSBvbGQgbWVtYmVycyBhbmQgaW5zZXJ0IHRoZSBuZXcgbWVtYmVyc1xuXHRcdFx0dmFyIG5leHROb2RlID0gdGhpcy5sYXN0Tm9kZSgpLm5leHRTaWJsaW5nO1xuXHRcdFx0dmFyIHBhcmVudEVsZW1lbnQgPSB0aGlzLnBhcmVudEVsZW1lbnQ7XG5cdFx0XHQvLyBVc2UgZGV0YWNoL2F0dGFjaCwgYnV0IGRvbid0IHRyaWdnZXIgZXZlbnRzXG5cdFx0XHR0aGlzLmRldGFjaCh0cnVlIC8qX2lzUmVwbGFjZSovKTtcblx0XHRcdHRoaXMubWVtYmVycyA9IG5ld01lbWJlcnM7XG5cdFx0XHR0aGlzLmF0dGFjaChwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgZmFsc2UsIHRydWUgLypfaXNSZXBsYWNlKi8pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBkb24ndCBkbyBhbnl0aGluZyBpZiB3ZSdyZSBnb2luZyBmcm9tIGVtcHR5IHRvIGVtcHR5XG5cdFx0XHR0aGlzLm1lbWJlcnMgPSBuZXdNZW1iZXJzO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFkZE1lbWJlcjogZnVuY3Rpb24obmV3TWVtYmVyLCBhdEluZGV4LCBfaXNNb3ZlKSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cblx0XHQvLyB2YWxpZGF0ZSB0aGUgaW5kZXhcblx0XHRpZiAodHlwZW9mIGF0SW5kZXggIT09IFwibnVtYmVyXCIgfHwgaXNOYU4oYXRJbmRleCkgfHxcblx0XHRcdGF0SW5kZXggPCAwIHx8IGF0SW5kZXggPiBtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0YXRJbmRleCA9IG1lbWJlcnMubGVuZ3RoO1xuXHRcdH1cblxuXHRcdC8vIGFkZCByZWZlcmVuY2VzIHRvIHRoZSBuZXcgbWVtYmVyXG5cdFx0aWYgKCFfaXNNb3ZlKSB0aGlzLl9tZW1iZXJJbihuZXdNZW1iZXIpO1xuXG5cdFx0Ly8gY3VycmVudGx5IGRldGFjaGVkOyBqdXN0IHVwZGF0ZWQgbWVtYmVyc1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkge1xuXHRcdFx0bWVtYmVycy5zcGxpY2UoYXRJbmRleCwgMCwgbmV3TWVtYmVyKTtcblx0XHR9XG5cblx0XHQvLyBlbXB0eTsgdXNlIHRoZSBlbXB0eS10by1ub25lbXB0eSBoYW5kbGluZyBvZiBzZXRNZW1iZXJzXG5cdFx0ZWxzZSBpZiAobWVtYmVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuc2V0TWVtYmVycyhbIG5ld01lbWJlciBdKTtcblx0XHR9XG5cblx0XHQvLyBvdGhlcndpc2UgYWRkIGF0IGxvY2F0aW9uXG5cdFx0ZWxzZSB7XG5cdFx0XHR2YXIgbmV4dE5vZGU7XG5cdFx0XHRpZiAoYXRJbmRleCA9PT0gbWVtYmVycy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gaW5zZXJ0IGF0IGVuZFxuXHRcdFx0XHRuZXh0Tm9kZSA9IHRoaXMubGFzdE5vZGUoKS5uZXh0U2libGluZztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciBtID0gbWVtYmVyc1thdEluZGV4XTtcblx0XHRcdFx0bmV4dE5vZGUgPSAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0uZmlyc3ROb2RlKCkgOiBtO1xuXHRcdFx0fVxuXG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAwLCBuZXdNZW1iZXIpO1xuXHRcdFx0aW5zZXJ0SW50b0RPTShuZXdNZW1iZXIsIHRoaXMucGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZU1lbWJlcjogZnVuY3Rpb24oYXRJbmRleCwgX2lzTW92ZSkge1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXG5cdFx0Ly8gYWxzbyBhY2NlcHRzIHRoZSBtZW1iZXIgdG8gcmVtb3ZlXG5cdFx0aWYgKHR5cGVvZiBhdEluZGV4ICE9PSBcIm51bWJlclwiIHx8IGlzTmFOKGF0SW5kZXgpKSB7XG5cdFx0XHRhdEluZGV4ID0gdGhpcy5pbmRleE9mKGF0SW5kZXgpO1xuXHRcdH1cblxuXHRcdC8vIHZhbGlkYXRlIHRoZSBpbmRleFxuXHRcdGlmIChhdEluZGV4IDwgMCB8fCBhdEluZGV4ID49IG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJCYWQgaW5kZXggaW4gcmFuZ2UucmVtb3ZlTWVtYmVyOiBcIiArIGF0SW5kZXgpO1xuXHRcdH1cblxuXHRcdGlmIChfaXNNb3ZlKSB7XG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIG9sZE1lbWJlciA9IG1lbWJlcnNbYXRJbmRleF07XG5cblx0XHRcdGlmIChtZW1iZXJzLmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHQvLyBiZWNvbWluZyBlbXB0eTsgdXNlIHRoZSBsb2dpYyBpbiBzZXRNZW1iZXJzXG5cdFx0XHRcdHRoaXMuc2V0TWVtYmVycyhbXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9tZW1iZXJPdXQob2xkTWVtYmVyKTtcblx0XHRcdFx0bWVtYmVycy5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdFx0XHRcdGlmICh0aGlzLmF0dGFjaGVkKSByZW1vdmVGcm9tRE9NKG9sZE1lbWJlcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0bW92ZU1lbWJlcjogZnVuY3Rpb24ob2xkSW5kZXgsIG5ld0luZGV4KSB7XG5cdFx0dmFyIG1lbWJlciA9IHRoaXMubWVtYmVyc1tvbGRJbmRleF07XG5cdFx0dGhpcy5yZW1vdmVNZW1iZXIob2xkSW5kZXgsIHRydWUgLypfaXNNb3ZlKi8pO1xuXHRcdHRoaXMuYWRkTWVtYmVyKG1lbWJlciwgbmV3SW5kZXgsIHRydWUgLypfaXNNb3ZlKi8pO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGluZGV4T2Y6IGZ1bmN0aW9uKG1lbWJlcikge1xuXHRcdHJldHVybiB0aGlzLm1lbWJlcnMuaW5kZXhPZihtZW1iZXIpO1xuXHR9LFxuXG5cdGNvbnRhaW5zOiBmdW5jdGlvbihtZW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5pbmRleE9mKG1lbWJlcikgPiAtMTtcblx0fSxcblxuXHRfbWVtYmVySW46IGZ1bmN0aW9uKG0pIHtcblx0XHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRtLnBhcmVudFJhbmdlID0gdGhpcztcblx0XHR9IGVsc2UgaWYgKG0ubm9kZVR5cGUgPT09IDEpIHsgLy8gRE9NIEVsZW1lbnRcblx0XHRcdG0uJGRvbXJhbmdlID0gdGhpcztcblx0XHR9XG5cdH0sXG5cblx0X21lbWJlck91dDogZnVuY3Rpb24gKG0sIF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpIHtcblx0XHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRpZiAoX2lzUmVwbGFjZSkgbS5kZXN0cm95TWVtYmVycyhfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKTtcblx0XHRcdGVsc2UgbS5kZXN0cm95KF9za2lwTm9kZXMpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKCFfc2tpcE5vZGVzICYmIG0ubm9kZVR5cGUgPT09IDEgJiYgbS4kZG9tcmFuZ2UpIHtcblx0XHRcdG0uJGRvbXJhbmdlID0gbnVsbDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gVGVhciBkb3duLCBidXQgZG9uJ3QgcmVtb3ZlLCB0aGUgbWVtYmVycy4gIFVzZWQgd2hlbiBjaHVua3Ncblx0Ly8gb2YgRE9NIGFyZSBiZWluZyB0b3JuIGRvd24gb3IgcmVwbGFjZWQuXG5cdGRlc3Ryb3lNZW1iZXJzOiBmdW5jdGlvbihfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtZW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHR0aGlzLl9tZW1iZXJPdXQobWVtYmVyc1tpXSwgX3NraXBOb2RlcywgX2lzUmVwbGFjZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGRlc3Ryb3k6IGZ1bmN0aW9uKF9za2lwTm9kZXMpIHtcblx0XHR0aGlzLmRldGFjaCgpO1xuXHRcdHRoaXMudHJpZ2dlcihcImRlc3Ryb3lcIiwgX3NraXBOb2Rlcyk7XG5cdFx0dGhpcy5kZXN0cm95TWVtYmVycyhfc2tpcE5vZGVzKTtcblx0XHR0aGlzLm1lbWJlcnMgPSBbXTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRmaW5kQWxsOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBtYXRjaGVzID0gW10sXG5cdFx0XHRlbDtcblxuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5tZW1iZXJzKSB7XG5cdFx0XHRlbCA9IHRoaXMubWVtYmVyc1tpXTtcblx0XHRcdGlmIChlbCBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRcdG1hdGNoZXMucHVzaC5hcHBseShtYXRjaGVzLCBlbC5maW5kQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBlbC5xdWVyeVNlbGVjdG9yQWxsID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0aWYgKGVsLm5vZGVUeXBlID09PSAxICYmIG1hdGNoZXNTZWxlY3RvcihlbCwgc2VsZWN0b3IpKSBtYXRjaGVzLnB1c2goZWwpO1xuXHRcdFx0XHRtYXRjaGVzLnB1c2guYXBwbHkobWF0Y2hlcywgZWwucXVlcnlTZWxlY3RvckFsbChzZWxlY3RvcikpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBtYXRjaGVzO1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGVsLCByZXM7XG5cblx0XHRmb3IgKHZhciBpIGluIHRoaXMubWVtYmVycykge1xuXHRcdFx0ZWwgPSB0aGlzLm1lbWJlcnNbaV07XG5cdFx0XHRpZiAoZWwgaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0XHRyZXMgPSBlbC5maW5kKHNlbGVjdG9yKTtcblx0XHRcdH0gZWxzZSBpZiAoZWwubm9kZVR5cGUgPT09IDEgJiYgbWF0Y2hlc1NlbGVjdG9yKGVsLCBzZWxlY3RvcikpIHtcblx0XHRcdFx0cmVzID0gZWw7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBlbC5xdWVyeVNlbGVjdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0cmVzID0gZWwucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXMgIT0gbnVsbCkgcmV0dXJuIHJlcztcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG59KTtcblxuLy8gSW4gSUUgOCwgZG9uJ3QgdXNlIGVtcHR5IHRleHQgbm9kZXMgYXMgcGxhY2Vob2xkZXJzXG4vLyBpbiBlbXB0eSBET01SYW5nZXMsIHVzZSBjb21tZW50IG5vZGVzIGluc3RlYWQuICBVc2luZ1xuLy8gZW1wdHkgdGV4dCBub2RlcyBpbiBtb2Rlcm4gYnJvd3NlcnMgaXMgZ3JlYXQgYmVjYXVzZVxuLy8gaXQgZG9lc24ndCBjbHV0dGVyIHRoZSB3ZWIgaW5zcGVjdG9yLiAgSW4gSUUgOCwgaG93ZXZlcixcbi8vIGl0IHNlZW1zIHRvIGxlYWQgaW4gc29tZSByb3VuZGFib3V0IHdheSB0byB0aGUgT0F1dGhcbi8vIHBvcC11cCBjcmFzaGluZyB0aGUgYnJvd3NlciBjb21wbGV0ZWx5LiAgSW4gdGhlIHBhc3QsXG4vLyB3ZSBkaWRuJ3QgdXNlIGVtcHR5IHRleHQgbm9kZXMgb24gSUUgOCBiZWNhdXNlIHRoZXlcbi8vIGRvbid0IGFjY2VwdCBKUyBwcm9wZXJ0aWVzLCBzbyBqdXN0IHVzZSB0aGUgc2FtZSBsb2dpY1xuLy8gZXZlbiB0aG91Z2ggd2UgZG9uJ3QgbmVlZCB0byBzZXQgcHJvcGVydGllcyBvbiB0aGVcbi8vIHBsYWNlaG9sZGVyIGFueW1vcmUuXG52YXIgVVNFX0NPTU1FTlRfUExBQ0VIT0xERVJTID0gKGZ1bmN0aW9uICgpIHtcblx0dmFyIHJlc3VsdCA9IGZhbHNlO1xuXHR2YXIgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblx0dHJ5IHtcblx0XHR0ZXh0Tm9kZS5zb21lUHJvcCA9IHRydWU7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHQvLyBJRSA4XG5cdFx0cmVzdWx0ID0gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufSkoKTtcblxuZnVuY3Rpb24gcGxhY2Vob2xkZXJOb2RlKCkge1xuXHRyZXR1cm4gVVNFX0NPTU1FTlRfUExBQ0VIT0xERVJTID9cblx0XHRkb2N1bWVudC5jcmVhdGVDb21tZW50KFwiXCIpIDpcblx0XHRkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcbn1cblxuLy8gcHJpdmF0ZSBtZXRob2RzXG5mdW5jdGlvbiBpbnNlcnRJbnRvRE9NKHJhbmdlT3JOb2RlLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSkge1xuXHR2YXIgbSA9IHJhbmdlT3JOb2RlO1xuXHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0bS5hdHRhY2gocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUpO1xuXHR9IGVsc2Uge1xuXHRcdGlmIChfaXNNb3ZlKSB7XG5cdFx0XHRtb3ZlTm9kZVdpdGhIb29rcyhtLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluc2VydE5vZGVXaXRoSG9va3MobSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiByZW1vdmVGcm9tRE9NKHJhbmdlT3JOb2RlKSB7XG5cdHZhciBtID0gcmFuZ2VPck5vZGU7XG5cdGlmIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRtLmRldGFjaCgpO1xuXHR9IGVsc2Uge1xuXHRcdHJlbW92ZU5vZGVXaXRoSG9va3MobSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVtb3ZlTm9kZVdpdGhIb29rcyhuKSB7XG5cdGlmICghbi5wYXJlbnROb2RlKSByZXR1cm47XG5cdGlmIChuLm5vZGVUeXBlID09PSAxICYmIG4ucGFyZW50Tm9kZS5fdWlob29rcyAmJiBuLnBhcmVudE5vZGUuX3VpaG9va3MucmVtb3ZlRWxlbWVudCkge1xuXHRcdG4ucGFyZW50Tm9kZS5fdWlob29rcy5yZW1vdmVFbGVtZW50KG4pO1xuXHR9IGVsc2Uge1xuXHRcdG4ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChuKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpbnNlcnROb2RlV2l0aEhvb2tzKG4sIHBhcmVudCwgbmV4dCkge1xuXHQvLyBgfHwgbnVsbGAgYmVjYXVzZSBJRSB0aHJvd3MgYW4gZXJyb3IgaWYgJ25leHQnIGlzIHVuZGVmaW5lZFxuXHRuZXh0ID0gbmV4dCB8fCBudWxsO1xuXHRpZiAobi5ub2RlVHlwZSA9PT0gMSAmJiBwYXJlbnQuX3VpaG9va3MgJiYgcGFyZW50Ll91aWhvb2tzLmluc2VydEVsZW1lbnQpIHtcblx0XHRwYXJlbnQuX3VpaG9va3MuaW5zZXJ0RWxlbWVudChuLCBuZXh0KTtcblx0fSBlbHNlIHtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG4sIG5leHQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1vdmVOb2RlV2l0aEhvb2tzKG4sIHBhcmVudCwgbmV4dCkge1xuXHRpZiAobi5wYXJlbnROb2RlICE9PSBwYXJlbnQpXG5cdFx0cmV0dXJuO1xuXHQvLyBgfHwgbnVsbGAgYmVjYXVzZSBJRSB0aHJvd3MgYW4gZXJyb3IgaWYgJ25leHQnIGlzIHVuZGVmaW5lZFxuXHRuZXh0ID0gbmV4dCB8fCBudWxsO1xuXHRpZiAobi5ub2RlVHlwZSA9PT0gMSAmJiBwYXJlbnQuX3VpaG9va3MgJiYgcGFyZW50Ll91aWhvb2tzLm1vdmVFbGVtZW50KSB7XG5cdFx0cGFyZW50Ll91aWhvb2tzLm1vdmVFbGVtZW50KG4sIG5leHQpO1xuXHR9IGVsc2Uge1xuXHRcdHBhcmVudC5pbnNlcnRCZWZvcmUobiwgbmV4dCk7XG5cdH1cbn1cbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG52YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciBwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlO1xudmFyIE5PREVfVFlQRSA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuXG4vLyBwcm9wZXJ0aWVzIHRoYXQgTm9kZS5qcyBhbmQgdGhlIGJyb3dzZXIgY2FuIGhhbmRsZVxudmFyIFRlbXBsZSA9IG1vZHVsZS5leHBvcnRzID0ge1xuXHRWRVJTSU9OOiBcIjAuNS4xNlwiLFxuXHROT0RFX1RZUEU6IE5PREVfVFlQRSxcblxuXHQvLyBvdGhlciBwYXJ0c1xuXHR1dGlsczogcmVxdWlyZShcIi4vdXRpbHNcIiksXG5cdE1vZGVsOiByZXF1aXJlKFwiLi9tb2RlbFwiKSxcblxuXHQvLyB0cmFja3Igc2hvcnQgcG9pbnRlcnNcblx0VHJhY2tyOiBUcmFja3IsXG5cdERlcGVuZGVuY3k6IFRyYWNrci5EZXBlbmRlbmN5LFxuXHRhdXRvcnVuOiBUcmFja3IuYXV0b3J1bixcblx0dHJhY2s6IHJlcXVpcmUoXCJ0cmFja3Itb2JqZWN0c1wiKSxcblxuXHQvLyBhbGwgdGhlIHBhcnNlcnMsIGRlY2xhcmVkIGhlcmUgZm9yIGVhc2llciBhY2Nlc3Ncblx0cGFyc2U6IHBhcnNlLFxuXHRwYXJzZVBhdGg6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcInBhdGhcIiB9KSk7XG5cdH0sXG5cdHBhcnNlUGF0aFF1ZXJ5OiBmdW5jdGlvbihzLCBvcHRzKSB7XG5cdFx0cmV0dXJuIHBhcnNlKHMsIF8uZXh0ZW5kKHt9LCBvcHRzLCB7IHN0YXJ0UnVsZTogXCJwYXRoUXVlcnlcIiB9KSk7XG5cdH0sXG5cdHBhcnNlQXR0cmlidXRlVmFsdWU6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcImF0dHJWYWx1ZVwiIH0pKTtcblx0fSxcblx0cGFyc2VBcmd1bWVudHM6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcImF0dHJBcmd1bWVudHNcIiB9KSk7XG5cdH0sXG5cblx0Ly8gY29udmVydHMgcmF3IGh0bWwgc3RyIHRvIHRlbXBsYXRlIHRyZWVcblx0cGFyc2VIVE1MOiBmdW5jdGlvbihzdHIpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogTk9ERV9UWVBFLlJPT1QsXG5cdFx0XHRjaGlsZHJlbjogWyB7XG5cdFx0XHRcdHR5cGU6IE5PREVfVFlQRS5IVE1MLFxuXHRcdFx0XHR2YWx1ZTogc3RyXG5cdFx0XHR9IF0sXG5cdFx0XHR2ZXJzaW9uOiBUZW1wbGUuVkVSU0lPTlxuXHRcdH07XG5cdH1cbn07XG5cbi8vIG5vIG5lZWQgZm9yIG5vZGUganMgdG8gaHVydCBpdHNlbGYgb24gYW55IGhhcmQgZWRnZXNcbmlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblxuLy8gYXR0YWNoIHRoZSBvdGhlciBwYXJ0cyB0aGF0IE5vZGUgY2FuJ3QgdXNlXG5UZW1wbGUuRE9NUmFuZ2UgPSByZXF1aXJlKFwiLi9kb21yYW5nZVwiKTtcblRlbXBsZS5WaWV3ID0gcmVxdWlyZShcIi4vdmlld1wiKTtcblRlbXBsZS5TZWN0aW9uID0gcmVxdWlyZShcIi4vc2VjdGlvblwiKTtcblxuLy8gbG9hZCB0aGUgcmVhbCBjbGFzcyBmb3IgdGhlIGJyb3dzZXJcblRlbXBsZSA9IG1vZHVsZS5leHBvcnRzID0gXy5leHRlbmQocmVxdWlyZShcIi4vbXVzdGFjaGVcIiksIFRlbXBsZSk7XG5cbi8vIGxvYWQgdGhlIHBsdWdpbiBBUElcbl8uZXh0ZW5kKFRlbXBsZSwgcmVxdWlyZShcIi4vcGx1Z2luc1wiKSk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IChmdW5jdGlvbigpIHtcbiAgLypcbiAgICogR2VuZXJhdGVkIGJ5IFBFRy5qcyAwLjguMC5cbiAgICpcbiAgICogaHR0cDovL3BlZ2pzLm1hamRhLmN6L1xuICAgKi9cblxuICBmdW5jdGlvbiBwZWckc3ViY2xhc3MoY2hpbGQsIHBhcmVudCkge1xuICAgIGZ1bmN0aW9uIGN0b3IoKSB7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfVxuICAgIGN0b3IucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcbiAgICBjaGlsZC5wcm90b3R5cGUgPSBuZXcgY3RvcigpO1xuICB9XG5cbiAgZnVuY3Rpb24gU3ludGF4RXJyb3IobWVzc2FnZSwgZXhwZWN0ZWQsIGZvdW5kLCBvZmZzZXQsIGxpbmUsIGNvbHVtbikge1xuICAgIHRoaXMubWVzc2FnZSAgPSBtZXNzYWdlO1xuICAgIHRoaXMuZXhwZWN0ZWQgPSBleHBlY3RlZDtcbiAgICB0aGlzLmZvdW5kICAgID0gZm91bmQ7XG4gICAgdGhpcy5vZmZzZXQgICA9IG9mZnNldDtcbiAgICB0aGlzLmxpbmUgICAgID0gbGluZTtcbiAgICB0aGlzLmNvbHVtbiAgID0gY29sdW1uO1xuXG4gICAgdGhpcy5uYW1lICAgICA9IFwiU3ludGF4RXJyb3JcIjtcbiAgfVxuXG4gIHBlZyRzdWJjbGFzcyhTeW50YXhFcnJvciwgRXJyb3IpO1xuXG4gIGZ1bmN0aW9uIHBhcnNlKGlucHV0KSB7XG4gICAgdmFyIG9wdGlvbnMgPSBhcmd1bWVudHMubGVuZ3RoID4gMSA/IGFyZ3VtZW50c1sxXSA6IHt9LFxuXG4gICAgICAgIHBlZyRGQUlMRUQgPSB7fSxcblxuICAgICAgICBwZWckc3RhcnRSdWxlSW5kaWNlcyA9IHsgc3RhcnQ6IDAsIGF0dHJWYWx1ZTogOSwgYXR0ckFyZ3VtZW50czogMTAsIHBhdGhRdWVyeTogMjAsIHBhdGg6IDIyIH0sXG4gICAgICAgIHBlZyRzdGFydFJ1bGVJbmRleCAgID0gMCxcblxuICAgICAgICBwZWckY29uc3RzID0gW1xuICAgICAgICAgIGZ1bmN0aW9uKGh0bWwpIHtcbiAgICAgICAgICBcdHJldHVybiB7XG4gICAgICAgICAgXHRcdHR5cGU6IE5PREVfVFlQRS5ST09ULFxuICAgICAgICAgIFx0XHRjaGlsZHJlbjogaHRtbCxcbiAgICAgICAgICBcdFx0dmVyc2lvbjogTXVzdGFjaGUuVkVSU0lPTlxuICAgICAgICAgIFx0fVxuICAgICAgICAgIH0sXG4gICAgICAgICAgW10sXG4gICAgICAgICAgZnVuY3Rpb24obm9kZXMpIHsgcmV0dXJuIF8uY29tcGFjdChub2Rlcyk7IH0sXG4gICAgICAgICAgcGVnJEZBSUxFRCxcbiAgICAgICAgICAvXltePHtdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW148e11cIiwgZGVzY3JpcHRpb246IFwiW148e11cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHRleHQpIHsgcmV0dXJuIHsgdHlwZTogTk9ERV9UWVBFLlRFWFQsIHZhbHVlOiB0ZXh0LmpvaW4oXCJcIikgfTsgfSxcbiAgICAgICAgICBcIjwhLS1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI8IS0tXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI8IS0tXFxcIlwiIH0sXG4gICAgICAgICAgdm9pZCAwLFxuICAgICAgICAgIFwiLS0+XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLS0+XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCItLT5cXFwiXCIgfSxcbiAgICAgICAgICB7IHR5cGU6IFwiYW55XCIsIGRlc2NyaXB0aW9uOiBcImFueSBjaGFyYWN0ZXJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHsgdHlwZTogTk9ERV9UWVBFLlhDT01NRU5ULCB2YWx1ZTogdiB9O1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbihzdGFydCwgbm9kZXMsIGVuZCkge1xuICAgICAgICAgIFx0XHRpZiAoc3RhcnQubmFtZS50b0xvd2VyQ2FzZSgpICE9PSBlbmQudG9Mb3dlckNhc2UoKSkge1xuICAgICAgICAgIFx0XHRcdHRocm93IG5ldyBFcnJvcihcIkVsZW1lbnQgdGFnIG1pc21hdGNoOiBcIiArIHN0YXJ0Lm5hbWUgKyBcIiAhPT0gXCIgKyBlbmQpO1xuICAgICAgICAgIFx0XHR9XG5cbiAgICAgICAgICBcdFx0c3RhcnQudHlwZSA9IE5PREVfVFlQRS5FTEVNRU5UO1xuICAgICAgICAgIFx0XHRzdGFydC5jaGlsZHJlbiA9IG5vZGVzO1xuICAgICAgICAgIFx0XHRyZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiPFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIjxcIiwgZGVzY3JpcHRpb246IFwiXFxcIjxcXFwiXCIgfSxcbiAgICAgICAgICBcIi8+XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLz5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi8+XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odGFnbmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdG5hbWU6IHRhZ25hbWUsXG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLkVMRU1FTlQsXG4gICAgICAgICAgXHRcdFx0YXR0cmlidXRlczogYXR0cmlidXRlcyxcbiAgICAgICAgICBcdFx0XHRjaGlsZHJlbjogW11cbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcIj5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI+XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI+XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odGFnbmFtZSwgYXR0cmlidXRlcykge1xuICAgICAgICAgIFx0XHRyZXR1cm4geyBuYW1lOiB0YWduYW1lLCBhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzIH07XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiPC9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI8L1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiPC9cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0YWduYW1lKSB7IHJldHVybiB0YWduYW1lOyB9LFxuICAgICAgICAgIG51bGwsXG4gICAgICAgICAgXCI9XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGtleSwgdmFsdWUpIHtcbiAgICAgICAgICBcdFx0dmFsdWUgPSB2YWx1ZSAhPSBudWxsID8gdmFsdWVbMl0gOiBcIlwiO1xuICAgICAgICAgIFx0XHR2YXIgYXJnc1xuXG4gICAgICAgICAgXHRcdC8vIGNvdWxkIGZhaWwgb24gY29tcGxleCBhdHRyaWJ1dGVzXG4gICAgICAgICAgXHRcdHRyeSB7XG4gICAgICAgICAgXHRcdFx0YXJncyA9IHBhcnNlKHZhbHVlLCAgXy5leHRlbmQoe30sIG9wdGlvbnMsIHsgc3RhcnRSdWxlOiBcImF0dHJBcmd1bWVudHNcIiB9KSk7XG4gICAgICAgICAgXHRcdH0gY2F0Y2goZSkge1xuICAgICAgICAgIFx0XHRcdGFyZ3MgPSBbeyB0eXBlOiBOT0RFX1RZUEUuTElURVJBTCwgdmFsdWU6IHZhbHVlIH1dO1xuICAgICAgICAgIFx0XHR9XG5cbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuQVRUUklCVVRFLFxuICAgICAgICAgIFx0XHRcdG5hbWU6IGtleSxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWUsXG4gICAgICAgICAgXHRcdFx0Y2hpbGRyZW46IHBhcnNlKHZhbHVlLCBfLmV4dGVuZCh7fSwgb3B0aW9ucywgeyBzdGFydFJ1bGU6IFwiYXR0clZhbHVlXCIgfSkpLFxuICAgICAgICAgIFx0XHRcdGFyZ3VtZW50czogYXJnc1xuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiLFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIixcIiwgZGVzY3JpcHRpb246IFwiXFxcIixcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihsLCByKSB7IHJldHVybiBbXS5jb25jYXQobCwgXy5wbHVjayhyLCAxKSk7IH0sXG4gICAgICAgICAgZnVuY3Rpb24odikgeyByZXR1cm4gdi50cmltKCk7IH0sXG4gICAgICAgICAgZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgXHRcdGlmICh2YWwgIT0gbnVsbCAmJiB2YWwudHlwZSkgcmV0dXJuIHZhbDtcbiAgICAgICAgICBcdFx0cmV0dXJuIHsgdHlwZTogTk9ERV9UWVBFLkxJVEVSQUwsIHZhbHVlOiB2YWwgfTtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgZnVuY3Rpb24oc3RhcnQsIG5vZGVzLCBlbmQpIHtcbiAgICAgICAgICBcdFx0aWYgKG9wdGlvbnMuc3RyaWN0ICYmICFfLmlzRXF1YWwoc3RhcnQudmFsdWUucmF3LCBlbmQpKSB7XG4gICAgICAgICAgXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiU2VjdGlvbiB0YWcgbWlzbWF0Y2g6IFwiICsgc3RhcnQudmFsdWUucmF3ICsgXCIgIT09IFwiICsgZW5kKTtcbiAgICAgICAgICBcdFx0fVxuXG4gICAgICAgICAgXHRcdHN0YXJ0LnZhbHVlID0gc3RhcnQudmFsdWUucmVzdWx0O1xuICAgICAgICAgIFx0XHRzdGFydC5jaGlsZHJlbiA9IG5vZGVzO1xuICAgICAgICAgIFx0XHRyZXR1cm4gc3RhcnQ7XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwie3tcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ7e1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3tcXFwiXCIgfSxcbiAgICAgICAgICAvXlsjXFxeXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlsjXFxcXF5dXCIsIGRlc2NyaXB0aW9uOiBcIlsjXFxcXF5dXCIgfSxcbiAgICAgICAgICBcIn19XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwifX1cIiwgZGVzY3JpcHRpb246IFwiXFxcIn19XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odHlwZSwgdmFsdWUpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEVbdHlwZSA9PT0gXCIjXCIgPyBcIlNFQ1RJT05cIiA6IFwiSU5WRVJURURcIl0sXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCJ7ey9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ7ey9cIiwgZGVzY3JpcHRpb246IFwiXFxcInt7L1xcXCJcIiB9LFxuICAgICAgICAgIC9eW159XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIltefV1cIiwgZGVzY3JpcHRpb246IFwiW159XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odmFsdWUpIHsgcmV0dXJuIHZhbHVlLmpvaW4oXCJcIik7IH0sXG4gICAgICAgICAgXCJ7e3tcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ7e3tcIiwgZGVzY3JpcHRpb246IFwiXFxcInt7e1xcXCJcIiB9LFxuICAgICAgICAgIFwifX19XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwifX19XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ9fX1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5JTlRFUlBPTEFUT1IsXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlWzFdXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgL15bXFwvI3shJD5cXF5dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW1xcXFwvI3shJD5cXFxcXl1cIiwgZGVzY3JpcHRpb246IFwiW1xcXFwvI3shJD5cXFxcXl1cIiB9LFxuICAgICAgICAgIFwiJlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIiZcIiwgZGVzY3JpcHRpb246IFwiXFxcIiZcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihtLCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IG0gPyBOT0RFX1RZUEUuVFJJUExFIDogTk9ERV9UWVBFLklOVEVSUE9MQVRPUixcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5UUklQTEUsXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCJ7eyFcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ7eyFcIiwgZGVzY3JpcHRpb246IFwiXFxcInt7IVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLk1DT01NRU5ULFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZS5qb2luKFwiXCIpLnRyaW0oKVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIC9eWyQ+XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlskPl1cIiwgZGVzY3JpcHRpb246IFwiWyQ+XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24obSwgdmFsdWUpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuUEFSVElBTCxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWUuam9pbihcIlwiKS50cmltKCksXG4gICAgICAgICAgXHRcdFx0bG9jYWw6IG0gPT09IFwiJFwiXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCJ8XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwifFwiLCBkZXNjcmlwdGlvbjogXCJcXFwifFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKG0pIHsgcmV0dXJuIHsgcmF3OiB0ZXh0KCksIHJlc3VsdDogbSB9IH0sXG4gICAgICAgICAgZnVuY3Rpb24ocCwgYykge1xuICAgICAgICAgIFx0XHRpZiAocCA9PSBudWxsKSBwID0geyB0eXBlOiBcImFsbFwiIH07XG4gICAgICAgICAgXHRcdHAucGFydHMgPSBjO1xuICAgICAgICAgIFx0XHRyZXR1cm4gcDtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgZnVuY3Rpb24ocCkgeyBwLnBhcnRzID0gW107IHJldHVybiBwOyB9LFxuICAgICAgICAgIFwiLi4vXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLi4vXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuLi9cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihkKSB7IHJldHVybiB7IHR5cGU6IFwicGFyZW50XCIsIGRpc3RhbmNlOiBkLmxlbmd0aCB9OyB9LFxuICAgICAgICAgIFwiLi9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuL1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiLi9cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHsgdHlwZTogXCJsb2NhbFwiIH07IH0sXG4gICAgICAgICAgXCIuXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLlxcXCJcIiB9LFxuICAgICAgICAgIFwiL1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi9cIiwgZGVzY3JpcHRpb246IFwiXFxcIi9cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHsgdHlwZTogXCJyb290XCIgfTsgfSxcbiAgICAgICAgICAvXlthLXowLTkkX10vaSxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOSRfXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOSRfXWlcIiB9LFxuICAgICAgICAgIC9eW2EtejAtOTpcXC1fJF0vaSxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOTpcXFxcLV8kXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOTpcXFxcLV8kXWlcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGssIGMpIHsgcmV0dXJuIHsga2V5OiBrLCBjaGlsZHJlbjogYyB9IH0sXG4gICAgICAgICAgXCJbXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiW1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiW1xcXCJcIiB9LFxuICAgICAgICAgIFwiXVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIl1cIiwgZGVzY3JpcHRpb246IFwiXFxcIl1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihjKSB7IHJldHVybiBjOyB9LFxuICAgICAgICAgIFwidHJ1ZVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInRydWVcIiwgZGVzY3JpcHRpb246IFwiXFxcInRydWVcXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHRydWU7IH0sXG4gICAgICAgICAgXCJmYWxzZVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcImZhbHNlXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJmYWxzZVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gZmFsc2U7IH0sXG4gICAgICAgICAgXCItXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLVxcXCJcIiB9LFxuICAgICAgICAgIC9eWzAtOV0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbMC05XVwiLCBkZXNjcmlwdGlvbjogXCJbMC05XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBwYXJzZUZsb2F0KHRleHQoKSwgMTApOyB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gcGFyc2VJbnQodGV4dCgpLCAxMCk7IH0sXG4gICAgICAgICAgXCJcXFwiXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXFxcIlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXFxcXFxcXCJcXFwiXCIgfSxcbiAgICAgICAgICAvXlteXCJdLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW15cXFwiXVwiLCBkZXNjcmlwdGlvbjogXCJbXlxcXCJdXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2KSB7IHJldHVybiB2LmpvaW4oXCJcIik7IH0sXG4gICAgICAgICAgXCInXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiJ1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiJ1xcXCJcIiB9LFxuICAgICAgICAgIC9eW14nXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlteJ11cIiwgZGVzY3JpcHRpb246IFwiW14nXVwiIH0sXG4gICAgICAgICAgXCJudWxsXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwibnVsbFwiLCBkZXNjcmlwdGlvbjogXCJcXFwibnVsbFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gbnVsbDsgfSxcbiAgICAgICAgICBcInVuZGVmaW5lZFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInVuZGVmaW5lZFwiLCBkZXNjcmlwdGlvbjogXCJcXFwidW5kZWZpbmVkXFxcIlwiIH0sXG4gICAgICAgICAgXCJ2b2lkXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidm9pZFwiLCBkZXNjcmlwdGlvbjogXCJcXFwidm9pZFxcXCJcIiB9LFxuICAgICAgICAgIC9eWyw7IFxcdFxcblxccl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbLDsgXFxcXHRcXFxcblxcXFxyXVwiLCBkZXNjcmlwdGlvbjogXCJbLDsgXFxcXHRcXFxcblxcXFxyXVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiB2b2lkIDA7IH0sXG4gICAgICAgICAgL15bYS16MC05X1xcLV0vaSxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW2EtejAtOV9cXFxcLV1pXCIsIGRlc2NyaXB0aW9uOiBcIlthLXowLTlfXFxcXC1daVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oaykgeyByZXR1cm4gazsgfSxcbiAgICAgICAgICB7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IFwid2hpdGVzcGFjZVwiIH0sXG4gICAgICAgICAgL15bIFxcdFxcblxccl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbIFxcXFx0XFxcXG5cXFxccl1cIiwgZGVzY3JpcHRpb246IFwiWyBcXFxcdFxcXFxuXFxcXHJdXCIgfSxcbiAgICAgICAgICB7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IFwiZ3VhcmFudGVlZCB3aGl0ZXNwYWNlXCIgfSxcbiAgICAgICAgICBcIlxcXFxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJcXFxcXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJcXFxcXFxcXFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGNoYXIpIHsgcmV0dXJuIGNoYXI7IH1cbiAgICAgICAgXSxcblxuICAgICAgICBwZWckYnl0ZWNvZGUgPSBbXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3ISsnIDQhNiAhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICE3LCpHIFxcXCI3MipBIFxcXCI3Myo7IFxcXCI3MCo1IFxcXCI3MSovIFxcXCI3IyopIFxcXCI3JCojIFxcXCI3XFxcIixNJjcsKkcgXFxcIjcyKkEgXFxcIjczKjsgXFxcIjcwKjUgXFxcIjcxKi8gXFxcIjcjKikgXFxcIjckKiMgXFxcIjdcXFwiXFxcIisnIDQhNlxcXCIhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICEwJFxcXCJcXFwiMSEzJSssJCwpJjAkXFxcIlxcXCIxITMlXFxcIlxcXCJcXFwiICMrJyA0ITYmISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS4nXFxcIlxcXCIyJzMoK1xceEFDJCEgISEhOC4qXFxcIlxcXCIyKjMrOSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyxRJiEhOC4qXFxcIlxcXCIyKjMrOSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrISAoJSs4JS4qXFxcIlxcXCIyKjMrKyglNCM2LSMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiNyUqSSBcXFwiITcmKz4kNyErNCU3JysqJTQjNi4jI1xcXCIhICUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS4vXFxcIlxcXCIyLzMwK1UkN0ErSyUgITcoLCMmNyhcXFwiKzklLjFcXFwiXFxcIjIxMzIrKSU0JDYzJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLi9cXFwiXFxcIjIvMzArVSQ3QStLJSAhNygsIyY3KFxcXCIrOSUuNFxcXCJcXFwiMjQzNSspJTQkNjYkXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuN1xcXCJcXFwiMjczOCtCJDdBKzglLjRcXFwiXFxcIjI0MzUrKCU0IzY5IyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0EraCQhLjtcXFwiXFxcIjI7MzwrQSQ3Qis3JTc+Ky0lN0IrIyUnJCUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjKiMgXFxcIiA6KyklNFxcXCI2PVxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICE3LCo7IFxcXCI3Mio1IFxcXCI3MyovIFxcXCI3MCopIFxcXCI3MSojIFxcXCI3XFxcIixBJjcsKjsgXFxcIjcyKjUgXFxcIjczKi8gXFxcIjcwKikgXFxcIjcxKiMgXFxcIjdcXFwiXFxcIisnIDQhNlxcXCIhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNysrcSQgISEuPlxcXCJcXFwiMj4zPystJDcrKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLD4mIS4+XFxcIlxcXCIyPjM/Ky0kNysrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiKyklNFxcXCI2QFxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0IrXFx4RDYkNy8qXFx4QjcgXFxcIjc+KlxceEIxIFxcXCI3OypcXHhBQiBcXFwiNzwqXFx4QTUgXFxcIjc/KlxceDlGIFxcXCI3QCpcXHg5OSBcXFwiISEgISEhOC4+XFxcIlxcXCIyPjM/OSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyxRJiEhOC4+XFxcIlxcXCIyPjM/OSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrISAoJSsnIDQhNkEhISAlKzIlN0IrKCU0IzZCIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNy0rPiQ3ISs0JTcuKyolNCM2QyMjXFxcIiEgJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLkRcXFwiXFxcIjJEM0UrUyQwRlxcXCJcXFwiMSEzRytDJTc1KzklLkhcXFwiXFxcIjJIM0krKSU0JDZKJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLktcXFwiXFxcIjJLM0wrYiQgITdEKikgXFxcIjBNXFxcIlxcXCIxITNOLC8mN0QqKSBcXFwiME1cXFwiXFxcIjEhM05cXFwiKzglLkhcXFwiXFxcIjJIM0krKCU0IzZPIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhIS5QXFxcIlxcXCIyUDNRKz0kNzQrMyUuUlxcXCJcXFwiMlIzUysjJScjJSQjIyAjJFxcXCIjICNcXFwiIyAjKk4gXFxcIiEuRFxcXCJcXFwiMkQzRSs9JDc0KzMlLkhcXFwiXFxcIjJIM0krIyUnIyUkIyMgIyRcXFwiIyAjXFxcIiMgIysnIDQhNlQhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLkRcXFwiXFxcIjJEM0UrdyQhODBVXFxcIlxcXCIxITNWOSokJFxcXCJcXFwiIClcXFwiIyAjK1klLldcXFwiXFxcIjJXM1gqIyBcXFwiIDorQyU3NCs5JS5IXFxcIlxcXCIySDNJKyklNCU2WSVcXFwiXFxcIiElJCUjICMkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlBcXFwiXFxcIjJQM1ErQiQ3NCs4JS5SXFxcIlxcXCIyUjNTKyglNCM2WiMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5bXFxcIlxcXCIyWzNcXFxcK2IkICE3RCopIFxcXCIwTVxcXCJcXFwiMSEzTiwvJjdEKikgXFxcIjBNXFxcIlxcXCIxITNOXFxcIis4JS5IXFxcIlxcXCIySDNJKyglNCM2XSMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5EXFxcIlxcXCIyRDNFK3MkMF5cXFwiXFxcIjEhM18rYyUgITdEKikgXFxcIjBNXFxcIlxcXCIxITNOLC8mN0QqKSBcXFwiME1cXFwiXFxcIjEhM05cXFwiKzklLkhcXFwiXFxcIjJIM0krKSU0JDZgJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNzYrcSQgISEuYVxcXCJcXFwiMmEzYistJDc2KyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLD4mIS5hXFxcIlxcXCIyYTNiKy0kNzYrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiKyklNFxcXCI2QFxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhNzQrJyA0ITZjISEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITdCK00kNzcqIyBcXFwiIDorPSU3OCszJTdCKyklNCQ2ZCRcXFwiXFxcIiElJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgIypHIFxcXCIhN0IrPCQ3NysyJTdCKyglNCM2ZSMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISAhLmZcXFwiXFxcIjJmM2crLCQsKSYuZlxcXCJcXFwiMmYzZ1xcXCJcXFwiXFxcIiAjKycgNCE2aCEhICUqYiBcXFwiIS5pXFxcIlxcXCIyaTNqKyYgNCE2ayEgJSpLIFxcXCIhLmxcXFwiXFxcIjJsM20rJiA0ITZrISAlKjQgXFxcIiEublxcXCJcXFwiMm4zbysmIDQhNnAhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3OStxJCAhIS5sXFxcIlxcXCIybDNtKy0kNzkrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsPiYhLmxcXFwiXFxcIjJsM20rLSQ3OSsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrKSU0XFxcIjZAXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEhITBxXFxcIlxcXCIxITNyK0EkICEwc1xcXCJcXFwiMSEzdCwpJjBzXFxcIlxcXCIxITN0XFxcIisjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyshICglKzskICE3OiwjJjc6XFxcIispJTRcXFwiNnVcXFwiXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS52XFxcIlxcXCIydjN3K2IkN0IrWCU3PSopIFxcXCI3PiojIFxcXCI3NitCJTdCKzglLnhcXFwiXFxcIjJ4M3krKCU0JTZ6JSFcXFwiJSQlIyAjJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS57XFxcIlxcXCIyezN8KyYgNCE2fSEgJSo0IFxcXCIhLn5cXFwiXFxcIjJ+M38rJiA0ITZcXHg4MCEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHg4MVxcXCJcXFwiMlxceDgxM1xceDgyKiMgXFxcIiA6K1xceDkyJCAhMFxceDgzXFxcIlxcXCIxITNcXHg4NCssJCwpJjBcXHg4M1xcXCJcXFwiMSEzXFx4ODRcXFwiXFxcIlxcXCIgIyttJSEubFxcXCJcXFwiMmwzbStIJCAhMFxceDgzXFxcIlxcXCIxITNcXHg4NCssJCwpJjBcXHg4M1xcXCJcXFwiMSEzXFx4ODRcXFwiXFxcIlxcXCIgIysjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyojIFxcXCIgOisnJTQjNlxceDg1IyAlJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITBcXHg4M1xcXCJcXFwiMSEzXFx4ODQrLCQsKSYwXFx4ODNcXFwiXFxcIjEhM1xceDg0XFxcIlxcXCJcXFwiICMrJiA0ITZcXHg4NiEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHg4N1xcXCJcXFwiMlxceDg3M1xceDg4K2IkICE3RCopIFxcXCIwXFx4ODlcXFwiXFxcIjEhM1xceDhBLC8mN0QqKSBcXFwiMFxceDg5XFxcIlxcXCIxITNcXHg4QVxcXCIrOCUuXFx4ODdcXFwiXFxcIjJcXHg4NzNcXHg4OCsoJTQjNlxceDhCIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjKnMgXFxcIiEuXFx4OENcXFwiXFxcIjJcXHg4QzNcXHg4RCtiJCAhN0QqKSBcXFwiMFxceDhFXFxcIlxcXCIxITNcXHg4RiwvJjdEKikgXFxcIjBcXHg4RVxcXCJcXFwiMSEzXFx4OEZcXFwiKzglLlxceDhDXFxcIlxcXCIyXFx4OEMzXFx4OEQrKCU0IzZcXHg4QiMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHg5MFxcXCJcXFwiMlxceDkwM1xceDkxKyYgNCE2XFx4OTIhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuXFx4OTNcXFwiXFxcIjJcXHg5MzNcXHg5NCpcXHhCMyBcXFwiIS5cXHg5NVxcXCJcXFwiMlxceDk1M1xceDk2K1xceEEyJDdDK1xceDk4JSAhISE4MFxceDk3XFxcIlxcXCIxITNcXHg5ODkqJCRcXFwiXFxcIiApXFxcIiMgIysyJC1cXFwiXFxcIjEhMywrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMrVCQsUSYhITgwXFx4OTdcXFwiXFxcIjEhM1xceDk4OSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCJcXFwiXFxcIiAjKyMlJyMlJCMjICMkXFxcIiMgI1xcXCIjICMrJiA0ITZcXHg5OSEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITdCK10kISAhMFxceDlBXFxcIlxcXCIxITNcXHg5QissJCwpJjBcXHg5QVxcXCJcXFwiMSEzXFx4OUJcXFwiXFxcIlxcXCIgIyshICglKzIlN0IrKCU0IzZcXHg5QyMhISUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiOCEgITBcXHg5RVxcXCJcXFwiMSEzXFx4OUYsKSYwXFx4OUVcXFwiXFxcIjEhM1xceDlGXFxcIishICglOSpcXFwiIDNcXHg5RFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiOCEgITBcXHg5RVxcXCJcXFwiMSEzXFx4OUYrLCQsKSYwXFx4OUVcXFwiXFxcIjEhM1xceDlGXFxcIlxcXCJcXFwiICMrISAoJTkqXFxcIiAzXFx4QTBcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuXFx4QTFcXFwiXFxcIjJcXHhBMTNcXHhBMis3JC1cXFwiXFxcIjEhMywrKCU0XFxcIjZcXHhBM1xcXCIhICUkXFxcIiMgI1xcXCIjICNcIilcbiAgICAgICAgXSxcblxuICAgICAgICBwZWckY3VyclBvcyAgICAgICAgICA9IDAsXG4gICAgICAgIHBlZyRyZXBvcnRlZFBvcyAgICAgID0gMCxcbiAgICAgICAgcGVnJGNhY2hlZFBvcyAgICAgICAgPSAwLFxuICAgICAgICBwZWckY2FjaGVkUG9zRGV0YWlscyA9IHsgbGluZTogMSwgY29sdW1uOiAxLCBzZWVuQ1I6IGZhbHNlIH0sXG4gICAgICAgIHBlZyRtYXhGYWlsUG9zICAgICAgID0gMCxcbiAgICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZCAgPSBbXSxcbiAgICAgICAgcGVnJHNpbGVudEZhaWxzICAgICAgPSAwLFxuXG4gICAgICAgIHBlZyRyZXN1bHQ7XG5cbiAgICBpZiAoXCJzdGFydFJ1bGVcIiBpbiBvcHRpb25zKSB7XG4gICAgICBpZiAoIShvcHRpb25zLnN0YXJ0UnVsZSBpbiBwZWckc3RhcnRSdWxlSW5kaWNlcykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3Qgc3RhcnQgcGFyc2luZyBmcm9tIHJ1bGUgXFxcIlwiICsgb3B0aW9ucy5zdGFydFJ1bGUgKyBcIlxcXCIuXCIpO1xuICAgICAgfVxuXG4gICAgICBwZWckc3RhcnRSdWxlSW5kZXggPSBwZWckc3RhcnRSdWxlSW5kaWNlc1tvcHRpb25zLnN0YXJ0UnVsZV07XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdGV4dCgpIHtcbiAgICAgIHJldHVybiBpbnB1dC5zdWJzdHJpbmcocGVnJHJlcG9ydGVkUG9zLCBwZWckY3VyclBvcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb2Zmc2V0KCkge1xuICAgICAgcmV0dXJuIHBlZyRyZXBvcnRlZFBvcztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBsaW5lKCkge1xuICAgICAgcmV0dXJuIHBlZyRjb21wdXRlUG9zRGV0YWlscyhwZWckcmVwb3J0ZWRQb3MpLmxpbmU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29sdW1uKCkge1xuICAgICAgcmV0dXJuIHBlZyRjb21wdXRlUG9zRGV0YWlscyhwZWckcmVwb3J0ZWRQb3MpLmNvbHVtbjtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBleHBlY3RlZChkZXNjcmlwdGlvbikge1xuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKFxuICAgICAgICBudWxsLFxuICAgICAgICBbeyB0eXBlOiBcIm90aGVyXCIsIGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbiB9XSxcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zXG4gICAgICApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGVycm9yKG1lc3NhZ2UpIHtcbiAgICAgIHRocm93IHBlZyRidWlsZEV4Y2VwdGlvbihtZXNzYWdlLCBudWxsLCBwZWckcmVwb3J0ZWRQb3MpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRjb21wdXRlUG9zRGV0YWlscyhwb3MpIHtcbiAgICAgIGZ1bmN0aW9uIGFkdmFuY2UoZGV0YWlscywgc3RhcnRQb3MsIGVuZFBvcykge1xuICAgICAgICB2YXIgcCwgY2g7XG5cbiAgICAgICAgZm9yIChwID0gc3RhcnRQb3M7IHAgPCBlbmRQb3M7IHArKykge1xuICAgICAgICAgIGNoID0gaW5wdXQuY2hhckF0KHApO1xuICAgICAgICAgIGlmIChjaCA9PT0gXCJcXG5cIikge1xuICAgICAgICAgICAgaWYgKCFkZXRhaWxzLnNlZW5DUikgeyBkZXRhaWxzLmxpbmUrKzsgfVxuICAgICAgICAgICAgZGV0YWlscy5jb2x1bW4gPSAxO1xuICAgICAgICAgICAgZGV0YWlscy5zZWVuQ1IgPSBmYWxzZTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGNoID09PSBcIlxcclwiIHx8IGNoID09PSBcIlxcdTIwMjhcIiB8fCBjaCA9PT0gXCJcXHUyMDI5XCIpIHtcbiAgICAgICAgICAgIGRldGFpbHMubGluZSsrO1xuICAgICAgICAgICAgZGV0YWlscy5jb2x1bW4gPSAxO1xuICAgICAgICAgICAgZGV0YWlscy5zZWVuQ1IgPSB0cnVlO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbisrO1xuICAgICAgICAgICAgZGV0YWlscy5zZWVuQ1IgPSBmYWxzZTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHBlZyRjYWNoZWRQb3MgIT09IHBvcykge1xuICAgICAgICBpZiAocGVnJGNhY2hlZFBvcyA+IHBvcykge1xuICAgICAgICAgIHBlZyRjYWNoZWRQb3MgPSAwO1xuICAgICAgICAgIHBlZyRjYWNoZWRQb3NEZXRhaWxzID0geyBsaW5lOiAxLCBjb2x1bW46IDEsIHNlZW5DUjogZmFsc2UgfTtcbiAgICAgICAgfVxuICAgICAgICBhZHZhbmNlKHBlZyRjYWNoZWRQb3NEZXRhaWxzLCBwZWckY2FjaGVkUG9zLCBwb3MpO1xuICAgICAgICBwZWckY2FjaGVkUG9zID0gcG9zO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gcGVnJGNhY2hlZFBvc0RldGFpbHM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGZhaWwoZXhwZWN0ZWQpIHtcbiAgICAgIGlmIChwZWckY3VyclBvcyA8IHBlZyRtYXhGYWlsUG9zKSB7IHJldHVybjsgfVxuXG4gICAgICBpZiAocGVnJGN1cnJQb3MgPiBwZWckbWF4RmFpbFBvcykge1xuICAgICAgICBwZWckbWF4RmFpbFBvcyA9IHBlZyRjdXJyUG9zO1xuICAgICAgICBwZWckbWF4RmFpbEV4cGVjdGVkID0gW107XG4gICAgICB9XG5cbiAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQucHVzaChleHBlY3RlZCk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGJ1aWxkRXhjZXB0aW9uKG1lc3NhZ2UsIGV4cGVjdGVkLCBwb3MpIHtcbiAgICAgIGZ1bmN0aW9uIGNsZWFudXBFeHBlY3RlZChleHBlY3RlZCkge1xuICAgICAgICB2YXIgaSA9IDE7XG5cbiAgICAgICAgZXhwZWN0ZWQuc29ydChmdW5jdGlvbihhLCBiKSB7XG4gICAgICAgICAgaWYgKGEuZGVzY3JpcHRpb24gPCBiLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgICAgfSBlbHNlIGlmIChhLmRlc2NyaXB0aW9uID4gYi5kZXNjcmlwdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIDE7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiAwO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgd2hpbGUgKGkgPCBleHBlY3RlZC5sZW5ndGgpIHtcbiAgICAgICAgICBpZiAoZXhwZWN0ZWRbaSAtIDFdID09PSBleHBlY3RlZFtpXSkge1xuICAgICAgICAgICAgZXhwZWN0ZWQuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpKys7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGJ1aWxkTWVzc2FnZShleHBlY3RlZCwgZm91bmQpIHtcbiAgICAgICAgZnVuY3Rpb24gc3RyaW5nRXNjYXBlKHMpIHtcbiAgICAgICAgICBmdW5jdGlvbiBoZXgoY2gpIHsgcmV0dXJuIGNoLmNoYXJDb2RlQXQoMCkudG9TdHJpbmcoMTYpLnRvVXBwZXJDYXNlKCk7IH1cblxuICAgICAgICAgIHJldHVybiBzXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxcXC9nLCAgICdcXFxcXFxcXCcpXG4gICAgICAgICAgICAucmVwbGFjZSgvXCIvZywgICAgJ1xcXFxcIicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx4MDgvZywgJ1xcXFxiJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHQvZywgICAnXFxcXHQnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcbi9nLCAgICdcXFxcbicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxmL2csICAgJ1xcXFxmJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHIvZywgICAnXFxcXHInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHgwMC1cXHgwN1xceDBCXFx4MEVcXHgwRl0vZywgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxceDAnICsgaGV4KGNoKTsgfSlcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx4MTAtXFx4MUZcXHg4MC1cXHhGRl0vZywgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxceCcgICsgaGV4KGNoKTsgfSlcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx1MDE4MC1cXHUwRkZGXS9nLCAgICAgICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHUwJyArIGhleChjaCk7IH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcdTEwODAtXFx1RkZGRl0vZywgICAgICAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx1JyAgKyBoZXgoY2gpOyB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBleHBlY3RlZERlc2NzID0gbmV3IEFycmF5KGV4cGVjdGVkLmxlbmd0aCksXG4gICAgICAgICAgICBleHBlY3RlZERlc2MsIGZvdW5kRGVzYywgaTtcblxuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgZXhwZWN0ZWQubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBleHBlY3RlZERlc2NzW2ldID0gZXhwZWN0ZWRbaV0uZGVzY3JpcHRpb247XG4gICAgICAgIH1cblxuICAgICAgICBleHBlY3RlZERlc2MgPSBleHBlY3RlZC5sZW5ndGggPiAxXG4gICAgICAgICAgPyBleHBlY3RlZERlc2NzLnNsaWNlKDAsIC0xKS5qb2luKFwiLCBcIilcbiAgICAgICAgICAgICAgKyBcIiBvciBcIlxuICAgICAgICAgICAgICArIGV4cGVjdGVkRGVzY3NbZXhwZWN0ZWQubGVuZ3RoIC0gMV1cbiAgICAgICAgICA6IGV4cGVjdGVkRGVzY3NbMF07XG5cbiAgICAgICAgZm91bmREZXNjID0gZm91bmQgPyBcIlxcXCJcIiArIHN0cmluZ0VzY2FwZShmb3VuZCkgKyBcIlxcXCJcIiA6IFwiZW5kIG9mIGlucHV0XCI7XG5cbiAgICAgICAgcmV0dXJuIFwiRXhwZWN0ZWQgXCIgKyBleHBlY3RlZERlc2MgKyBcIiBidXQgXCIgKyBmb3VuZERlc2MgKyBcIiBmb3VuZC5cIjtcbiAgICAgIH1cblxuICAgICAgdmFyIHBvc0RldGFpbHMgPSBwZWckY29tcHV0ZVBvc0RldGFpbHMocG9zKSxcbiAgICAgICAgICBmb3VuZCAgICAgID0gcG9zIDwgaW5wdXQubGVuZ3RoID8gaW5wdXQuY2hhckF0KHBvcykgOiBudWxsO1xuXG4gICAgICBpZiAoZXhwZWN0ZWQgIT09IG51bGwpIHtcbiAgICAgICAgY2xlYW51cEV4cGVjdGVkKGV4cGVjdGVkKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG5ldyBTeW50YXhFcnJvcihcbiAgICAgICAgbWVzc2FnZSAhPT0gbnVsbCA/IG1lc3NhZ2UgOiBidWlsZE1lc3NhZ2UoZXhwZWN0ZWQsIGZvdW5kKSxcbiAgICAgICAgZXhwZWN0ZWQsXG4gICAgICAgIGZvdW5kLFxuICAgICAgICBwb3MsXG4gICAgICAgIHBvc0RldGFpbHMubGluZSxcbiAgICAgICAgcG9zRGV0YWlscy5jb2x1bW5cbiAgICAgICk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGRlY29kZShzKSB7XG4gICAgICB2YXIgYmMgPSBuZXcgQXJyYXkocy5sZW5ndGgpLCBpO1xuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBiY1tpXSA9IHMuY2hhckNvZGVBdChpKSAtIDMyO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gYmM7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJHBhcnNlUnVsZShpbmRleCkge1xuICAgICAgdmFyIGJjICAgID0gcGVnJGJ5dGVjb2RlW2luZGV4XSxcbiAgICAgICAgICBpcCAgICA9IDAsXG4gICAgICAgICAgaXBzICAgPSBbXSxcbiAgICAgICAgICBlbmQgICA9IGJjLmxlbmd0aCxcbiAgICAgICAgICBlbmRzICA9IFtdLFxuICAgICAgICAgIHN0YWNrID0gW10sXG4gICAgICAgICAgcGFyYW1zLCBpO1xuXG4gICAgICBmdW5jdGlvbiBwcm90ZWN0KG9iamVjdCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5hcHBseShvYmplY3QpID09PSBcIltvYmplY3QgQXJyYXldXCIgPyBbXSA6IG9iamVjdDtcbiAgICAgIH1cblxuICAgICAgd2hpbGUgKHRydWUpIHtcbiAgICAgICAgd2hpbGUgKGlwIDwgZW5kKSB7XG4gICAgICAgICAgc3dpdGNoIChiY1tpcF0pIHtcbiAgICAgICAgICAgIGNhc2UgMDpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwcm90ZWN0KHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pKTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckY3VyclBvcyk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgIHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAzOlxuICAgICAgICAgICAgICBwZWckY3VyclBvcyA9IHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA0OlxuICAgICAgICAgICAgICBzdGFjay5sZW5ndGggLT0gYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNTpcbiAgICAgICAgICAgICAgc3RhY2suc3BsaWNlKC0yLCAxKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNjpcbiAgICAgICAgICAgICAgc3RhY2tbc3RhY2subGVuZ3RoIC0gMl0ucHVzaChzdGFjay5wb3AoKSk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDc6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2goc3RhY2suc3BsaWNlKHN0YWNrLmxlbmd0aCAtIGJjW2lwICsgMV0sIGJjW2lwICsgMV0pKTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgODpcbiAgICAgICAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2goaW5wdXQuc3Vic3RyaW5nKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdLCBwZWckY3VyclBvcykpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA5OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDEwOlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSA9PT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDExOlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDEyOlxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgICBpcHMucHVzaChpcCk7XG5cbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDIgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaXAgKz0gMiArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMzpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoaW5wdXQubGVuZ3RoID4gcGVnJGN1cnJQb3MpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNDpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdKTtcblxuICAgICAgICAgICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCBwZWckY29uc3RzW2JjW2lwICsgMV1dLmxlbmd0aCkgPT09IHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQ7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNTpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdKTtcblxuICAgICAgICAgICAgICBpZiAoaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCBwZWckY29uc3RzW2JjW2lwICsgMV1dLmxlbmd0aCkudG9Mb3dlckNhc2UoKSA9PT0gcGVnJGNvbnN0c1tiY1tpcCArIDFdXSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gNDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE2OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM10pO1xuXG4gICAgICAgICAgICAgIGlmIChwZWckY29uc3RzW2JjW2lwICsgMV1dLnRlc3QoaW5wdXQuY2hhckF0KHBlZyRjdXJyUG9zKSkpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQ7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNzpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIGJjW2lwICsgMV0pKTtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgKz0gYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTg6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJGNvbnN0c1tiY1tpcCArIDFdXSk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IHBlZyRjb25zdHNbYmNbaXAgKyAxXV0ubGVuZ3RoO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxOTpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckRkFJTEVEKTtcbiAgICAgICAgICAgICAgaWYgKHBlZyRzaWxlbnRGYWlscyA9PT0gMCkge1xuICAgICAgICAgICAgICAgIHBlZyRmYWlsKHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIwOlxuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBzdGFja1tzdGFjay5sZW5ndGggLSAxIC0gYmNbaXAgKyAxXV07XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIxOlxuICAgICAgICAgICAgICBwZWckcmVwb3J0ZWRQb3MgPSBwZWckY3VyclBvcztcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjI6XG4gICAgICAgICAgICAgIHBhcmFtcyA9IGJjLnNsaWNlKGlwICsgNCwgaXAgKyA0ICsgYmNbaXAgKyAzXSk7XG4gICAgICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBiY1tpcCArIDNdOyBpKyspIHtcbiAgICAgICAgICAgICAgICBwYXJhbXNbaV0gPSBzdGFja1tzdGFjay5sZW5ndGggLSAxIC0gcGFyYW1zW2ldXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIHN0YWNrLnNwbGljZShcbiAgICAgICAgICAgICAgICBzdGFjay5sZW5ndGggLSBiY1tpcCArIDJdLFxuICAgICAgICAgICAgICAgIGJjW2lwICsgMl0sXG4gICAgICAgICAgICAgICAgcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5hcHBseShudWxsLCBwYXJhbXMpXG4gICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIzOlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRwYXJzZVJ1bGUoYmNbaXAgKyAxXSkpO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyNDpcbiAgICAgICAgICAgICAgcGVnJHNpbGVudEZhaWxzKys7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDI1OlxuICAgICAgICAgICAgICBwZWckc2lsZW50RmFpbHMtLTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgb3Bjb2RlOiBcIiArIGJjW2lwXSArIFwiLlwiKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZW5kcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgZW5kID0gZW5kcy5wb3AoKTtcbiAgICAgICAgICBpcCA9IGlwcy5wb3AoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gc3RhY2tbMF07XG4gICAgfVxuXG5cbiAgICBcdHZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG4gICAgXHRcdE5PREVfVFlQRSA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpLFxuICAgIFx0XHRNdXN0YWNoZSA9IHJlcXVpcmUoXCIuL1wiKTtcblxuICAgIFx0b3B0aW9ucyA9IF8uZGVmYXVsdHMob3B0aW9ucyB8fCB7fSwge1xuICAgIFx0XHRzdHJpY3Q6IHRydWVcbiAgICBcdH0pO1xuXG5cbiAgICBwZWckcmVzdWx0ID0gcGVnJHBhcnNlUnVsZShwZWckc3RhcnRSdWxlSW5kZXgpO1xuXG4gICAgaWYgKHBlZyRyZXN1bHQgIT09IHBlZyRGQUlMRUQgJiYgcGVnJGN1cnJQb3MgPT09IGlucHV0Lmxlbmd0aCkge1xuICAgICAgcmV0dXJuIHBlZyRyZXN1bHQ7XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChwZWckcmVzdWx0ICE9PSBwZWckRkFJTEVEICYmIHBlZyRjdXJyUG9zIDwgaW5wdXQubGVuZ3RoKSB7XG4gICAgICAgIHBlZyRmYWlsKHsgdHlwZTogXCJlbmRcIiwgZGVzY3JpcHRpb246IFwiZW5kIG9mIGlucHV0XCIgfSk7XG4gICAgICB9XG5cbiAgICAgIHRocm93IHBlZyRidWlsZEV4Y2VwdGlvbihudWxsLCBwZWckbWF4RmFpbEV4cGVjdGVkLCBwZWckbWF4RmFpbFBvcyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBTeW50YXhFcnJvcjogU3ludGF4RXJyb3IsXG4gICAgcGFyc2U6ICAgICAgIHBhcnNlXG4gIH07XG59KSgpOyIsInZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIHRyYWNrID0gcmVxdWlyZShcInRyYWNrci1vYmplY3RzXCIpO1xudmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpO1xudmFyIHBhcnNlID0gcmVxdWlyZShcIi4vbSt4bWxcIikucGFyc2U7XG5cbnZhciBNb2RlbCA9XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIE1vZGVsKGRhdGEsIHBhcmVudCwgb3B0aW9ucykge1xuXHR0aGlzLnByb3hpZXMgPSBbXTtcblx0dGhpcy5fZGVwID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cdGlmIChNb2RlbC5pc01vZGVsKHBhcmVudCkpIHRoaXMucGFyZW50ID0gcGFyZW50O1xuXHR0aGlzLnNldChkYXRhLCBvcHRpb25zKTtcbn07XG5cbk1vZGVsLmlzTW9kZWwgPSBmdW5jdGlvbihvKSB7XG5cdHJldHVybiBvIGluc3RhbmNlb2YgTW9kZWw7XG59O1xuXG5Nb2RlbC5leHRlbmQgPSByZXF1aXJlKFwiYmFja2JvbmUtZXh0ZW5kLXN0YW5kYWxvbmVcIik7XG5cbk1vZGVsLl9kZWZhdWx0UHJveGllcyA9IFsge1xuXHRpc0xpc3Q6ICB0cnVlLFxuXHRtYXRjaDogICBmdW5jdGlvbihhcnIpICAgIHsgcmV0dXJuIF8uaXNBcnJheShhcnIpOyB9LFxuXHRnZXQ6ICAgICBmdW5jdGlvbihhcnIsIGspIHsgcmV0dXJuIGsgPT09IFwibGVuZ3RoXCIgPyB0aGlzLmxlbmd0aChhcnIpIDogYXJyW2tdOyB9LFxuXHRsZW5ndGg6ICBmdW5jdGlvbihhcnIpICAgIHsgdmFyIGxlbjsgcmV0dXJuIHR5cGVvZihsZW4gPSBhcnIuJGxlbmd0aCkgPT09IFwibnVtYmVyXCIgPyBsZW4gOiBhcnIubGVuZ3RoOyB9LFxuXHRrZXlzOiAgICBmdW5jdGlvbihhcnIpICAgIHsgcmV0dXJuIF8ucmFuZ2UodGhpcy5sZW5ndGgoYXJyKSk7IH0sXG5cdGlzRW1wdHk6IGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gISF0aGlzLmxlbmd0aChhcnIpOyB9XG59LCB7XG5cdG1hdGNoOiBmdW5jdGlvbigpICAgICB7IHJldHVybiB0cnVlOyB9LFxuXHRnZXQ6ICAgZnVuY3Rpb24odCwgaykgeyBpZiAodCAhPSBudWxsKSByZXR1cm4gdFtrXTsgfVxufSBdO1xuXG5Nb2RlbC5jYWxsUHJveHlNZXRob2QgPSBmdW5jdGlvbihwcm94eSwgdGFyZ2V0LCBtZXRob2QsIGFyZ3MsIGN0eCkge1xuXHRhcmdzID0gXy5pc0FycmF5KGFyZ3MpID8gXy5jbG9uZShhcmdzKSA6IFtdO1xuXHRhcmdzLnVuc2hpZnQocHJveHksIG1ldGhvZCwgdGFyZ2V0KTtcblx0YXJncy5wdXNoKGN0eCk7XG5cdHJldHVybiB1dGlscy5yZXN1bHQuYXBwbHkobnVsbCwgYXJncyk7XG59O1xuXG5fLmV4dGVuZChNb2RlbC5wcm90b3R5cGUsIHtcblxuXHQvLyBzZXRzIHRoZSBkYXRhIG9uIHRoZSBtb2RlbFxuXHRzZXQ6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdGlmIChvcHRpb25zLnRyYWNrICE9PSBmYWxzZSkge1xuXHRcdFx0ZGF0YSA9IHRyYWNrKGRhdGEsIG9wdGlvbnMudHJhY2spO1xuXHRcdH1cblxuXHRcdHRoaXMuZGF0YSA9IGRhdGE7XG5cdFx0dGhpcy5fZGVwLmNoYW5nZWQoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhcHBlbmQ6IGZ1bmN0aW9uKG1vZGVsLCBvcHRpb25zKSB7XG5cdFx0aWYgKE1vZGVsLmlzTW9kZWwobW9kZWwpKSBtb2RlbC5wYXJlbnQgPSB0aGlzO1xuXHRcdGVsc2UgbW9kZWwgPSBuZXcgTW9kZWwobW9kZWwsIHRoaXMsIG9wdGlvbnMpO1xuXHRcdHJldHVybiBtb2RlbDtcblx0fSxcblxuXHQvLyBhbiBhcnJheSBvZiBtb2RlbHMgaW4gdGhlIGN1cnJlbnQgc3RhY2ssIHdpdGggdGhlIHJvb3QgYXMgdGhlIGZpcnN0XG5cdGdldEFsbE1vZGVsczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIG1vZGVscyA9IFsgdGhpcyBdLFxuXHRcdFx0bW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKG1vZGVsLnBhcmVudCkge1xuXHRcdFx0bW9kZWxzLnVuc2hpZnQobW9kZWwgPSBtb2RlbC5wYXJlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbHM7XG5cdH0sXG5cblx0Ly8gZ2V0cyB0aGUgbW9kZWwgaW4gdGhlIHN0YWNrIGF0IHRoZSBpbmRleFxuXHQvLyBuZWdhdGl2ZSB2YWx1ZXMgc3RhcnQgYXQgcm9vdFxuXHRnZXRNb2RlbEF0T2Zmc2V0OiBmdW5jdGlvbihpbmRleCkge1xuXHRcdGlmICghXy5pc051bWJlcihpbmRleCkgfHwgaXNOYU4oaW5kZXgpKSBpbmRleCA9IDA7XG5cdFx0aWYgKGluZGV4IDwgMCkgcmV0dXJuIHRoaXMuZ2V0QWxsTW9kZWxzKClbfmluZGV4XTtcblxuXHRcdHZhciBtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAoaW5kZXggJiYgbW9kZWwpIHtcblx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdFx0aW5kZXgtLTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH0sXG5cblx0Ly8gZ2V0cyB0aGUgbGFzdCBtb2RlbCBpbiB0aGUgc3RhY2tcblx0Z2V0Um9vdE1vZGVsOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbW9kZWwgPSB0aGlzO1xuXHRcdHdoaWxlIChtb2RlbC5wYXJlbnQgIT0gbnVsbCkgbW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9LFxuXG5cdC8vIHJldHVybnMgdGhlIGZpcnN0IG1vZGVsIHdoaWNoIHBhc3NlcyB0aGUgZnVuY3Rpb25cblx0ZmluZE1vZGVsOiBmdW5jdGlvbihmbikge1xuXHRcdHZhciBpbmRleCA9IDAsXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGZuLmNhbGwodGhpcywgbW9kZWwsIGluZGV4KyspKSByZXR1cm4gbW9kZWw7XG5cdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gcmV0dXJucyB0aGUgdmFsdWUgYXQgcGF0aCwgYnV0IG9ubHkgbG9va3MgaW4gdGhlIGRhdGEgb24gdGhpcyBtb2RlbFxuXHRnZXRMb2NhbDogZnVuY3Rpb24ocGF0aCwgY3R4KSB7XG5cdFx0aWYgKHR5cGVvZiBwYXRoID09PSBcInN0cmluZ1wiKSBwYXRoID0gcGFyc2UocGF0aCwgeyBzdGFydFJ1bGU6IFwicGF0aFwiIH0pO1xuXHRcdGlmIChwYXRoID09IG51bGwpIHBhdGggPSB7IHBhcnRzOiBbXSB9O1xuXHRcdGlmICghXy5pc09iamVjdChwYXRoKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBvciBvYmplY3QgZm9yIHBhdGguXCIpO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblxuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHR0aGlzLl9kZXAuZGVwZW5kKCk7XG5cblx0XHRyZXR1cm4gXy5yZWR1Y2UocGF0aC5wYXJ0cywgZnVuY3Rpb24odGFyZ2V0LCBwYXJ0KSB7XG5cdFx0XHR0YXJnZXQgPSBzZWxmLl9nZXQodGFyZ2V0LCBwYXJ0LmtleSk7XG5cblx0XHRcdF8uZWFjaChwYXJ0LmNoaWxkcmVuLCBmdW5jdGlvbihrKSB7XG5cdFx0XHRcdGlmIChfLmlzT2JqZWN0KGspKSBrID0gY3R4LmdldChrKTtcblx0XHRcdFx0dGFyZ2V0ID0gc2VsZi5fZ2V0KHRhcmdldCwgayk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHR9LCB0aGlzLmRhdGEpO1xuXHR9LFxuXG5cdC8vIHJldHJpZXZlcyB2YWx1ZSB3aXRoIHBhdGggcXVlcnlcblx0Z2V0OiBmdW5jdGlvbihwYXRocykge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmICh0eXBlb2YgcGF0aHMgPT09IFwic3RyaW5nXCIpIHBhdGhzID0gcGFyc2UocGF0aHMsIHsgc3RhcnRSdWxlOiBcInBhdGhRdWVyeVwiIH0pO1xuXHRcdGlmICghXy5pc0FycmF5KHBhdGhzKSkgcGF0aHMgPSBwYXRocyAhPSBudWxsID8gWyBwYXRocyBdIDogW107XG5cdFx0aWYgKCFwYXRocy5sZW5ndGgpIHBhdGhzLnB1c2goeyB0eXBlOiBcImFsbFwiLCBwYXJ0czogW10gfSk7XG5cblx0XHRyZXR1cm4gXy5yZWR1Y2UocGF0aHMsIGZ1bmN0aW9uKHJlc3VsdCwgcGF0aCwgaW5kZXgpIHtcblx0XHRcdHZhciBtb2RlbCA9IHNlbGYsXG5cdFx0XHRcdHNjb3BlID0gdHJ1ZSxcblx0XHRcdFx0dmFsO1xuXG5cdFx0XHRpZiAocGF0aC50eXBlID09PSBcInJvb3RcIikge1xuXHRcdFx0XHRtb2RlbCA9IHNlbGYuZ2V0Um9vdE1vZGVsKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGgudHlwZSA9PT0gXCJwYXJlbnRcIikge1xuXHRcdFx0XHRtb2RlbCA9IHNlbGYuZ2V0TW9kZWxBdE9mZnNldChwYXRoLmRpc3RhbmNlKTtcblx0XHRcdH0gZWxzZSBpZiAocGF0aC50eXBlID09PSBcImFsbFwiKSB7XG5cdFx0XHRcdHNjb3BlID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2RlbCA9PSBudWxsKSByZXR1cm47XG5cblx0XHRcdHdoaWxlIChfLmlzVW5kZWZpbmVkKHZhbCkgJiYgbW9kZWwgIT0gbnVsbCkge1xuXHRcdFx0XHR2YWwgPSBtb2RlbC5nZXRMb2NhbChwYXRoLCBzZWxmKTtcblx0XHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0XHRcdGlmIChzY29wZSkgYnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChfLmlzRnVuY3Rpb24odmFsKSkge1xuXHRcdFx0XHR2YWwgPSB2YWwuY2FsbChzZWxmLCBpbmRleCA9PT0gMCA/IG51bGwgOiByZXN1bHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsO1xuXHRcdH0sIHZvaWQgMCk7XG5cdH0sXG5cblx0X2dldDogZnVuY3Rpb24odGFyZ2V0LCBrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5jYWxsUHJveHlNZXRob2QodGhpcy5nZXRQcm94eUJ5VmFsdWUodGFyZ2V0KSwgdGFyZ2V0LCBcImdldFwiLCBrZXkpO1xuXHR9LFxuXG5cdHByb3h5OiBmdW5jdGlvbihrZXkpIHtcblx0XHR2YXIgcHJveHkgPSB0aGlzLmdldFByb3h5QnlWYWx1ZSh0aGlzLmRhdGEpO1xuXHRcdGlmIChrZXkgPT0gbnVsbCkgcmV0dXJuIHByb3h5O1xuXHRcdHZhciBhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyk7XG5cdFx0YXJncy51bnNoaWZ0KHByb3h5LCB0aGlzLmRhdGEpO1xuXHRcdHJldHVybiB0aGlzLmNhbGxQcm94eU1ldGhvZC5hcHBseSh0aGlzLCBhcmdzKTtcblx0fSxcblxuXHRjYWxsUHJveHlNZXRob2Q6IGZ1bmN0aW9uKHByb3h5LCB0YXJnZXQsIG1ldGhvZCkge1xuXHRcdHJldHVybiBNb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHRhcmdldCwgbWV0aG9kLCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDMpLCB0aGlzKTtcblx0fSxcblxuXHRnZXRBbGxQcm94aWVzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgcHJveGllcyA9IFtdLFxuXHRcdFx0bW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKG1vZGVsICE9IG51bGwpIHtcblx0XHRcdHByb3hpZXMucHVzaC5hcHBseShwcm94aWVzLCBtb2RlbC5wcm94aWVzKTtcblx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdH1cblxuXHRcdHByb3hpZXMucHVzaC5hcHBseShwcm94aWVzLCBNb2RlbC5fZGVmYXVsdFByb3hpZXMpO1xuXG5cdFx0cmV0dXJuIHByb3hpZXM7XG5cdH0sXG5cblx0aGFzUHJveHk6IGZ1bmN0aW9uKHByb3h5LCBwcm94aWVzKSB7XG5cdFx0aWYgKHByb3hpZXMgPT0gbnVsbCkgcHJveGllcyA9IHRoaXMuZ2V0QWxsUHJveGllcygpO1xuXHRcdHJldHVybiBfLmNvbnRhaW5zKHByb3hpZXMsIHByb3h5KTtcblx0fSxcblxuXHRyZWdpc3RlclByb3h5OiBmdW5jdGlvbihwcm94eSkge1xuXHRcdGlmICh0eXBlb2YgcHJveHkgIT09IFwib2JqZWN0XCIgfHwgcHJveHkgPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG9iamVjdCBmb3IgcHJveHkuXCIpO1xuXHRcdGlmICh0eXBlb2YgcHJveHkubWF0Y2ggIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiTGF5ZXIgbWlzc2luZyByZXF1aXJlZCBtYXRjaCBtZXRob2QuXCIpO1xuXHRcdGlmICh0eXBlb2YgcHJveHkuZ2V0ICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkxheWVyIG1pc3NpbmcgcmVxdWlyZWQgZ2V0IG1ldGhvZC5cIik7XG5cdFx0aWYgKCF0aGlzLmhhc1Byb3h5KHByb3h5KSkgdGhpcy5wcm94aWVzLnVuc2hpZnQocHJveHkpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGdldFByb3h5QnlWYWx1ZTogZnVuY3Rpb24odGFyZ2V0LCBwcm94aWVzKSB7XG5cdFx0aWYgKHByb3hpZXMgPT0gbnVsbCkgcHJveGllcyA9IHRoaXMuZ2V0QWxsUHJveGllcygpO1xuXHRcdHJldHVybiBfLmZpbmQocHJveGllcywgZnVuY3Rpb24ocHJveHkpIHtcblx0XHRcdHJldHVybiBwcm94eS5tYXRjaCh0YXJnZXQpO1xuXHRcdH0pO1xuXHR9LFxuXG5cdC8vIGRlZmluZXMgYSByZWFjdGl2ZSBwcm9wZXJ0eSBvbiBhbiBvYmplY3QgdGhhdCBwb2ludHMgdG8gdGhlIGRhdGFcblx0ZGVmaW5lRGF0YUxpbms6IGZ1bmN0aW9uKG9iaiwgcHJvcCwgb3B0aW9ucykge1xuXHRcdHZhciBtb2RlbCA9IHRoaXM7XG5cblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IG9wdGlvbnMgIT0gbnVsbCAmJiBvcHRpb25zLmNvbmZpZ3VyYWJsZSxcblx0XHRcdGVudW1lcmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmVudW1lcmFibGUgIT09IGZhbHNlLFxuXHRcdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdFx0bW9kZWwuX2RlcC5kZXBlbmQoKTtcblx0XHRcdFx0cmV0dXJuIG1vZGVsLmRhdGE7XG5cdFx0XHR9LFxuXHRcdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdFx0bW9kZWwuc2V0KHZhbCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gb2JqO1xuXHR9XG5cbn0pO1xuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciBOT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbnZhciBwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlO1xudmFyIHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XG52YXIgVmlldyA9IHJlcXVpcmUoXCIuL3ZpZXdcIik7XG52YXIgTW9kZWwgPSByZXF1aXJlKFwiLi9tb2RlbFwiKTtcbnZhciBTZWN0aW9uID0gcmVxdWlyZShcIi4vc2VjdGlvblwiKTtcbnZhciAkdHJhY2sgPSByZXF1aXJlKFwidHJhY2tyLW9iamVjdHNcIik7XG52YXIgRE9NUmFuZ2UgPSByZXF1aXJlKFwiLi9kb21yYW5nZVwiKTtcblxudmFyIE11c3RhY2hlID1cbm1vZHVsZS5leHBvcnRzID0gVmlldy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0Ly8gYWRkIHRlbXBsYXRlXG5cdFx0dmFyIHRlbXBsYXRlID0gb3B0aW9ucy50ZW1wbGF0ZSB8fCBfLnJlc3VsdCh0aGlzLCBcInRlbXBsYXRlXCIpO1xuXHRcdGlmICh0ZW1wbGF0ZSAhPSBudWxsKSB0aGlzLnNldFRlbXBsYXRlKHRlbXBsYXRlKTtcblxuXHRcdC8vIGFkZCBkZWNvcmF0b3JzXG5cdFx0dGhpcy5kZWNvcmF0ZShfLmV4dGVuZCh7fSwgb3B0aW9ucy5kZWNvcmF0b3JzLCBfLnJlc3VsdCh0aGlzLCBcImRlY29yYXRvcnNcIikpKTtcblxuXHRcdC8vIGluaXRpYXRlIGxpa2UgYSBub3JtYWwgdmlld1xuXHRcdFZpZXcuY2FsbCh0aGlzLCBkYXRhLCBvcHRpb25zKTtcblx0fSxcblxuXHQvLyBwYXJzZXMgYW5kIHNldHMgdGhlIHJvb3QgdGVtcGxhdGVcblx0c2V0VGVtcGxhdGU6IGZ1bmN0aW9uKHRlbXBsYXRlKSB7XG5cdFx0aWYgKF8uaXNTdHJpbmcodGVtcGxhdGUpKSB0ZW1wbGF0ZSA9IHBhcnNlKHRlbXBsYXRlKTtcblxuXHRcdGlmICghXy5pc09iamVjdCh0ZW1wbGF0ZSkgfHwgdGVtcGxhdGUudHlwZSAhPT0gTk9ERV9UWVBFLlJPT1QpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG9yIHBhcnNlZCB0ZW1wbGF0ZS5cIik7XG5cblx0XHR0aGlzLl90ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGNyZWF0ZXMgYSBkZWNvcmF0b3Jcblx0ZGVjb3JhdGU6IGZ1bmN0aW9uKG5hbWUsIGZuLCBvcHRpb25zKSB7XG5cdFx0aWYgKHR5cGVvZiBuYW1lID09PSBcIm9iamVjdFwiICYmIGZuID09IG51bGwpIHtcblx0XHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihmbiwgbikge1xuXHRcdFx0XHRpZiAoXy5pc0FycmF5KGZuKSkgdGhpcy5kZWNvcmF0ZShuLCBmblswXSwgZm5bMV0pO1xuXHRcdFx0XHRlbHNlIHRoaXMuZGVjb3JhdGUobiwgZm4sIG9wdGlvbnMpO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIgfHwgbmFtZSA9PT0gXCJcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZm9yIGRlY29yYXRvciBuYW1lLlwiKTtcblx0XHRpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgZGVjb3JhdG9yLlwiKTtcblxuXHRcdGlmICh0aGlzLl9kZWNvcmF0b3JzID09IG51bGwpIHRoaXMuX2RlY29yYXRvcnMgPSB7fTtcblx0XHRpZiAodGhpcy5fZGVjb3JhdG9yc1tuYW1lXSA9PSBudWxsKSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdID0gW107XG5cdFx0dmFyIGRlY29yYXRvcnMgPSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdO1xuXG5cdFx0aWYgKCFfLmZpbmRXaGVyZShkZWNvcmF0b3JzLCB7IGNhbGxiYWNrOiBmbiB9KSkge1xuXHRcdFx0ZGVjb3JhdG9ycy5wdXNoKHtcblx0XHRcdFx0Y2FsbGJhY2s6IGZuLFxuXHRcdFx0XHRvcHRpb25zOiBvcHRpb25zIHx8IHt9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBmaW5kcyBhbGwgZGVjb3JhdG9ycywgbG9jYWxseSBhbmQgaW4gcGFyZW50XG5cdGZpbmREZWNvcmF0b3JzOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGRlY29yYXRvcnMgPSBbXSxcblx0XHRcdGMgPSB0aGlzLCBrLCBkO1xuXG5cdFx0d2hpbGUgKGMgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGMuX2RlY29yYXRvcnMgIT0gbnVsbCAmJiBfLmlzQXJyYXkoYy5fZGVjb3JhdG9yc1tuYW1lXSkpIHtcblx0XHRcdFx0Zm9yIChrIGluIGMuX2RlY29yYXRvcnNbbmFtZV0pIHtcblx0XHRcdFx0XHRkID0gYy5fZGVjb3JhdG9yc1tuYW1lXVtrXTtcblx0XHRcdFx0XHRpZiAoIV8uZmluZFdoZXJlKGRlY29yYXRvcnMsIHsgY2FsbGJhY2s6IGQuY2FsbGJhY2sgfSkpIHtcblx0XHRcdFx0XHRcdGRlY29yYXRvcnMucHVzaChfLmV4dGVuZCh7IGNvbnRleHQ6IGMgfSwgZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjID0gYy5wYXJlbnRSYW5nZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZGVjb3JhdG9ycztcblx0fSxcblxuXHQvLyByZW1vdmVzIGEgZGVjb3JhdG9yXG5cdHN0b3BEZWNvcmF0aW5nOiBmdW5jdGlvbihuYW1lLCBmbikge1xuXHRcdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJmdW5jdGlvblwiICYmIGZuID09IG51bGwpIHtcblx0XHRcdGZuID0gbmFtZTtcblx0XHRcdG5hbWUgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9kZWNvcmF0b3JzID09IG51bGwgfHwgKG5hbWUgPT0gbnVsbCAmJiBmbiA9PSBudWxsKSkge1xuXHRcdFx0dGhpcy5fZGVjb3JhdG9ycyA9IHt9O1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKGZuID09IG51bGwpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKG5hbWUgPT0gbnVsbCkge1xuXHRcdFx0Xy5lYWNoKHRoaXMuX2RlY29yYXRvcnMsIGZ1bmN0aW9uKGQsIG4pIHtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdG9yc1tuXSA9IF8uZmlsdGVyKGQsIGZ1bmN0aW9uKF9kKSB7XG5cdFx0XHRcdFx0cmV0dXJuIF9kLmNhbGxiYWNrICE9PSBmbjtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LCB0aGlzKTtcblx0XHR9XG5cblx0XHRlbHNlIHtcblx0XHRcdHZhciBkID0gdGhpcy5fZGVjb3JhdG9yc1tuYW1lXTtcblx0XHRcdHRoaXMuX2RlY29yYXRvcnNbbmFtZV0gPSBfLmZpbHRlcihkLCBmdW5jdGlvbihfZCkge1xuXHRcdFx0XHRyZXR1cm4gX2QuY2FsbGJhY2sgIT09IGZuO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gc3BlY2lhbCBwYXJ0aWFsIHNldHRlciB0aGF0IGNvbnZlcnRzIHN0cmluZ3MgaW50byBtdXN0YWNoZSBWaWV3c1xuXHRzZXRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lLCBwYXJ0aWFsKSB7XG5cdFx0aWYgKF8uaXNPYmplY3QobmFtZSkpIHJldHVybiBWaWV3LnByb3RvdHlwZS5zZXRQYXJ0aWFsLmNhbGwodGhpcywgbmFtZSk7XG5cblx0XHRpZiAoXy5pc1N0cmluZyhwYXJ0aWFsKSkgcGFydGlhbCA9IHBhcnNlKHBhcnRpYWwpO1xuXHRcdGlmIChfLmlzT2JqZWN0KHBhcnRpYWwpICYmIHBhcnRpYWwudHlwZSA9PT0gTk9ERV9UWVBFLlJPT1QpIHBhcnRpYWwgPSBNdXN0YWNoZS5leHRlbmQoeyB0ZW1wbGF0ZTogcGFydGlhbCB9KTtcblx0XHRpZiAocGFydGlhbCAhPSBudWxsICYmICF1dGlscy5pc1N1YkNsYXNzKFZpZXcsIHBhcnRpYWwpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyB0ZW1wbGF0ZSwgcGFyc2VkIHRlbXBsYXRlLCBWaWV3IHN1YmNsYXNzIG9yIGZ1bmN0aW9uIGZvciBwYXJ0aWFsLlwiKTtcblxuXHRcdHJldHVybiBWaWV3LnByb3RvdHlwZS5zZXRQYXJ0aWFsLmNhbGwodGhpcywgbmFtZSwgcGFydGlhbCk7XG5cdH0sXG5cblx0Ly8gdGhlIG1haW4gcmVuZGVyIGZ1bmN0aW9uIGNhbGxlZCBieSBtb3VudFxuXHRyZW5kZXI6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLl90ZW1wbGF0ZSA9PSBudWxsKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgYSB0ZW1wbGF0ZSB0byBiZSBzZXQgYmVmb3JlIHJlbmRlcmluZy5cIik7XG5cblx0XHR2YXIgdG9Nb3VudDtcblx0XHR0aGlzLnNldE1lbWJlcnModGhpcy5yZW5kZXJUZW1wbGF0ZSh0aGlzLl90ZW1wbGF0ZSwgbnVsbCwgdG9Nb3VudCA9IFtdKSk7XG5cdFx0Xy5pbnZva2UodG9Nb3VudCwgXCJtb3VudFwiKTtcblx0fSxcblxuXHQvLyBjb252ZXJ0cyBhIHRlbXBsYXRlIGludG8gYW4gYXJyYXkgb2YgZWxlbWVudHMgYW5kIERPTVJhbmdlc1xuXHRyZW5kZXJUZW1wbGF0ZTogZnVuY3Rpb24odGVtcGxhdGUsIHZpZXcsIHRvTW91bnQpIHtcblx0XHRpZiAodmlldyA9PSBudWxsKSB2aWV3ID0gdGhpcztcblx0XHRpZiAodG9Nb3VudCA9PSBudWxsKSB0b01vdW50ID0gW107XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKF8uaXNBcnJheSh0ZW1wbGF0ZSkpIHJldHVybiB0ZW1wbGF0ZS5yZWR1Y2UoZnVuY3Rpb24ociwgdCkge1xuXHRcdFx0dmFyIGIgPSBzZWxmLnJlbmRlclRlbXBsYXRlKHQsIHZpZXcsIHRvTW91bnQpO1xuXHRcdFx0aWYgKF8uaXNBcnJheShiKSkgci5wdXNoLmFwcGx5KHIsIGIpO1xuXHRcdFx0ZWxzZSBpZiAoYiAhPSBudWxsKSByLnB1c2goYik7XG5cdFx0XHRyZXR1cm4gcjtcblx0XHR9LCBbXSk7XG5cblx0XHRzd2l0Y2godGVtcGxhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuUk9PVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVGVtcGxhdGUodGVtcGxhdGUuY2hpbGRyZW4sIHZpZXcsIHRvTW91bnQpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5FTEVNRU5UOlxuXHRcdFx0XHR2YXIgcGFydCA9IHRoaXMucmVuZGVyUGFydGlhbCh0ZW1wbGF0ZS5uYW1lLCB2aWV3KTtcblx0XHRcdFx0dmFyIG9iajtcblxuXHRcdFx0XHRpZiAocGFydCAhPSBudWxsKSB7XG5cdFx0XHRcdFx0cGFydC5hZGREYXRhKG9iaiA9ICR0cmFjayh7fSkpO1xuXG5cdFx0XHRcdFx0dGVtcGxhdGUuYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uKGF0dHIpIHtcblx0XHRcdFx0XHRcdHNlbGYuYXV0b3J1bihmdW5jdGlvbihjKSB7XG5cdFx0XHRcdFx0XHRcdHZhciB2YWwgPSB0aGlzLnJlbmRlckFyZ3VtZW50cyhhdHRyLmFyZ3VtZW50cywgdmlldyk7XG5cdFx0XHRcdFx0XHRcdGlmICh2YWwubGVuZ3RoID09PSAxKSB2YWwgPSB2YWxbMF07XG5cdFx0XHRcdFx0XHRcdGVsc2UgaWYgKCF2YWwubGVuZ3RoKSB2YWwgPSB2b2lkIDA7XG5cblx0XHRcdFx0XHRcdFx0aWYgKGMuZmlyc3RSdW4pIG9iai5kZWZpbmVQcm9wZXJ0eShhdHRyLm5hbWUsIHZhbCk7XG5cdFx0XHRcdFx0XHRcdGVsc2Ugb2JqW2F0dHIubmFtZV0gPSB2YWw7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdHRvTW91bnQucHVzaChwYXJ0KTtcblx0XHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdHZhciBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGVtcGxhdGUubmFtZSk7XG5cblx0XHRcdFx0XHR0ZW1wbGF0ZS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24oYXR0cikge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMucmVuZGVyRGVjb3JhdGlvbnMoZWwsIGF0dHIsIHZpZXcpKSByZXR1cm47XG5cblx0XHRcdFx0XHRcdHRoaXMuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdFx0ZWwuc2V0QXR0cmlidXRlKGF0dHIubmFtZSwgdGhpcy5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKGF0dHIuY2hpbGRyZW4sIHZpZXcpKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRcdFx0dmFyIGNoaWxkcmVuID0gdGhpcy5yZW5kZXJUZW1wbGF0ZSh0ZW1wbGF0ZS5jaGlsZHJlbiwgdmlldywgdG9Nb3VudCksXG5cdFx0XHRcdFx0XHRjaGlsZCwgaTtcblxuXHRcdFx0XHRcdGZvciAoaSBpbiBjaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0Y2hpbGQgPSBjaGlsZHJlbltpXTtcblx0XHRcdFx0XHRcdGlmIChjaGlsZCBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdGNoaWxkLnBhcmVudFJhbmdlID0gdmlldzsgLy8gZmFrZSB0aGUgcGFyZW50XG5cdFx0XHRcdFx0XHRcdGNoaWxkLmF0dGFjaChlbCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRlbC5hcHBlbmRDaGlsZChjaGlsZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGVsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRFWFQ6XG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh1dGlscy5kZWNvZGVFbnRpdGllcyh0ZW1wbGF0ZS52YWx1ZSkpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5IVE1MOlxuXHRcdFx0XHRyZXR1cm4gbmV3IERPTVJhbmdlKHV0aWxzLnBhcnNlSFRNTCh0ZW1wbGF0ZS52YWx1ZSkpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5YQ09NTUVOVDpcblx0XHRcdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZUNvbW1lbnQodGVtcGxhdGUudmFsdWUpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlRFUlBPTEFUT1I6XG5cdFx0XHRcdHZhciBub2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJcIik7XG5cblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHZhciB2YWwgPSB2aWV3LmdldCh0ZW1wbGF0ZS52YWx1ZSk7XG5cdFx0XHRcdFx0bm9kZS5ub2RlVmFsdWUgPSB0eXBlb2YgdmFsID09PSBcInN0cmluZ1wiID8gdmFsIDogdmFsICE9IG51bGwgPyB2YWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBub2RlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5UUklQTEU6XG5cdFx0XHRcdHZhciByYW5nZSA9IG5ldyBET01SYW5nZSgpO1xuXG5cdFx0XHRcdHRoaXMuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRyYW5nZS5zZXRNZW1iZXJzKHV0aWxzLnBhcnNlSFRNTCh2aWV3LmdldCh0ZW1wbGF0ZS52YWx1ZSkpKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIHJhbmdlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlZFUlRFRDpcblx0XHRcdGNhc2UgTk9ERV9UWVBFLlNFQ1RJT046XG5cdFx0XHRcdHZhciBzZWN0aW9uID0gbmV3IFNlY3Rpb24odmlldy5tb2RlbClcblx0XHRcdFx0XHQuaW52ZXJ0KHRlbXBsYXRlLnR5cGUgPT09IE5PREVfVFlQRS5JTlZFUlRFRClcblx0XHRcdFx0XHQuc2V0UGF0aCh0ZW1wbGF0ZS52YWx1ZSlcblx0XHRcdFx0XHQub25Sb3coZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHR2YXIgX3RvTW91bnQ7XG5cdFx0XHRcdFx0XHR0aGlzLnNldE1lbWJlcnMoc2VsZi5yZW5kZXJUZW1wbGF0ZSh0ZW1wbGF0ZS5jaGlsZHJlbiwgdGhpcywgX3RvTW91bnQgPSBbXSkpO1xuXHRcdFx0XHRcdFx0Xy5pbnZva2UoX3RvTW91bnQsIFwibW91bnRcIik7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dG9Nb3VudC5wdXNoKHNlY3Rpb24pO1xuXHRcdFx0XHRyZXR1cm4gc2VjdGlvbjtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuUEFSVElBTDpcblx0XHRcdFx0dmFyIHBhcnRpYWwgPSB0aGlzLnJlbmRlclBhcnRpYWwodGVtcGxhdGUsIHZpZXcpO1xuXHRcdFx0XHRpZiAocGFydGlhbCkgdG9Nb3VudC5wdXNoKHBhcnRpYWwpO1xuXHRcdFx0XHRyZXR1cm4gcGFydGlhbDtcblx0XHR9XG5cdH0sXG5cblx0Ly8gY29udmVydHMgYSB0ZW1wbGF0ZSBpbnRvIGEgc3RyaW5nXG5cdHJlbmRlclRlbXBsYXRlQXNTdHJpbmc6IGZ1bmN0aW9uKHRlbXBsYXRlLCBjdHgpIHtcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblx0XHR2YXIgc2VsZiA9IHRoaXMsIHZhbDtcblxuXHRcdGlmIChfLmlzQXJyYXkodGVtcGxhdGUpKSByZXR1cm4gdGVtcGxhdGUubWFwKGZ1bmN0aW9uKHQpIHtcblx0XHRcdHJldHVybiBzZWxmLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcodCwgY3R4KTtcblx0XHR9KS5maWx0ZXIoZnVuY3Rpb24oYikgeyByZXR1cm4gYiAhPSBudWxsOyB9KS5qb2luKFwiXCIpO1xuXG5cdFx0c3dpdGNoKHRlbXBsYXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgTk9ERV9UWVBFLlJPT1Q6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcodGVtcGxhdGUuY2hpbGRyZW4sIGN0eCk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRFWFQ6XG5cdFx0XHRcdHJldHVybiB0ZW1wbGF0ZS52YWx1ZTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5URVJQT0xBVE9SOlxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVFJJUExFOlxuXHRcdFx0XHR2YWwgPSBjdHguZ2V0KHRlbXBsYXRlLnZhbHVlKTtcblx0XHRcdFx0cmV0dXJuIHZhbCAhPSBudWxsID8gdmFsLnRvU3RyaW5nKCkgOiBcIlwiO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5TRUNUSU9OOlxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5WRVJURUQ6XG5cdFx0XHRcdHZhciBpbnZlcnRlZCwgbW9kZWwsIGlzRW1wdHksIG1ha2VSb3csIHByb3h5LCBpc0xpc3Q7XG5cblx0XHRcdFx0aW52ZXJ0ZWQgPSB0ZW1wbGF0ZS50eXBlID09PSBOT0RFX1RZUEUuSU5WRVJURUQ7XG5cdFx0XHRcdHZhbCA9IGN0eC5nZXQodGVtcGxhdGUudmFsdWUpO1xuXHRcdFx0XHRtb2RlbCA9IG5ldyBNb2RlbCh2YWwsIGN0eCk7XG5cdFx0XHRcdHByb3h5ID0gbW9kZWwuZ2V0UHJveHlCeVZhbHVlKHZhbCk7XG5cdFx0XHRcdGlzTGlzdCA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImlzTGlzdFwiKTtcblx0XHRcdFx0aXNFbXB0eSA9IFNlY3Rpb24uaXNFbXB0eShtb2RlbCwgcHJveHkpO1xuXG5cdFx0XHRcdG1ha2VSb3cgPSBmdW5jdGlvbihpKSB7XG5cdFx0XHRcdFx0dmFyIGRhdGE7XG5cblx0XHRcdFx0XHRpZiAoaSA9PSBudWxsKSB7XG5cdFx0XHRcdFx0XHRkYXRhID0gbW9kZWw7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGRhdGEgPSBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJnZXRcIiwgaSk7XG5cdFx0XHRcdFx0XHRkYXRhID0gbmV3IE1vZGVsKGRhdGEsIG5ldyBNb2RlbCh7ICRrZXk6IGkgfSwgY3R4KSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0ZW1wbGF0ZS5jaGlsZHJlbiwgZGF0YSk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0aWYgKCEoaXNFbXB0eSBeIGludmVydGVkKSkge1xuXHRcdFx0XHRcdHJldHVybiBpc0xpc3QgJiYgIWludmVydGVkID9cblx0XHRcdFx0XHRcdG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImtleXNcIikubWFwKG1ha2VSb3cpLmpvaW4oXCJcIikgOlxuXHRcdFx0XHRcdFx0bWFrZVJvdygpO1xuXHRcdFx0XHR9XG5cdFx0fVxuXHR9LFxuXG5cdC8vIGNvbnZlcnRzIGFuIGFyZ3VtZW50IHRlbXBsYXRlIGludG8gYW4gYXJyYXkgb2YgdmFsdWVzXG5cdHJlbmRlckFyZ3VtZW50czogZnVuY3Rpb24oYXJnLCBjdHgpIHtcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRpZiAoXy5pc0FycmF5KGFyZykpIHJldHVybiBhcmcubWFwKGZ1bmN0aW9uKGEpIHtcblx0XHRcdHJldHVybiBzZWxmLnJlbmRlckFyZ3VtZW50cyhhLCBjdHgpO1xuXHRcdH0pLmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9IG51bGw7IH0pO1xuXG5cdFx0c3dpdGNoKGFyZy50eXBlKSB7XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlRFUlBPTEFUT1I6XG5cdFx0XHRcdHJldHVybiBjdHguZ2V0KGFyZy52YWx1ZSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLkxJVEVSQUw6XG5cdFx0XHRcdHJldHVybiBhcmcudmFsdWU7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIHJlbmRlcnMgZGVjb3JhdGlvbnMgb24gYW4gZWxlbWVudCBieSB0ZW1wbGF0ZVxuXHRyZW5kZXJEZWNvcmF0aW9uczogZnVuY3Rpb24oZWwsIGF0dHIsIGN0eCkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdC8vIGxvb2sgdXAgZGVjb3JhdG9yIGJ5IG5hbWVcblx0XHR2YXIgZGVjb3JhdG9ycyA9IHRoaXMuZmluZERlY29yYXRvcnMoYXR0ci5uYW1lKTtcblx0XHRpZiAoIWRlY29yYXRvcnMubGVuZ3RoKSByZXR1cm47XG5cblx0XHQvLyBub3JtYWxpemUgdGhlIGNvbnRleHRcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblxuXHRcdC8vIGEgd3JhcHBlciBjb21wdXRhdGlvbiB0byBlei1jbGVhbiB0aGUgcmVzdFxuXHRcdHJldHVybiB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oX2NvbXApIHtcblx0XHRcdGRlY29yYXRvcnMuZm9yRWFjaChmdW5jdGlvbihkKSB7XG5cdFx0XHRcdGlmIChkLm9wdGlvbnMgJiYgZC5vcHRpb25zLmRlZmVyKSBfLmRlZmVyKGV4ZWNEZWNvcmF0b3IpO1xuXHRcdFx0XHRlbHNlIGV4ZWNEZWNvcmF0b3IoKTtcblxuXHRcdFx0XHRmdW5jdGlvbiBleGVjRGVjb3JhdG9yKCkge1xuXHRcdFx0XHRcdHZhciBkY29tcCA9IHNlbGYuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHRcdFx0XHQvLyBhc3NlbWJsZSB0aGUgYXJndW1lbnRzIVxuXHRcdFx0XHRcdFx0dmFyIGFyZ3MgPSBbIHtcblx0XHRcdFx0XHRcdFx0dGFyZ2V0OiBlbCxcblx0XHRcdFx0XHRcdFx0bW9kZWw6IGN0eCxcblx0XHRcdFx0XHRcdFx0dmlldzogc2VsZixcblx0XHRcdFx0XHRcdFx0dGVtcGxhdGU6IGF0dHIsXG5cdFx0XHRcdFx0XHRcdGNvbXA6IGNvbXAsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IGQub3B0aW9uc1xuXHRcdFx0XHRcdFx0fSBdO1xuXG5cdFx0XHRcdFx0XHQvLyByZW5kZXIgYXJndW1lbnRzIGJhc2VkIG9uIG9wdGlvbnNcblx0XHRcdFx0XHRcdGlmIChkLm9wdGlvbnMgJiYgZC5vcHRpb25zLnBhcnNlID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRcdFx0XHRcdGFyZ3MucHVzaChzZWxmLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcoYXR0ci5jaGlsZHJlbiwgY3R4KSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGQub3B0aW9ucyA9PSBudWxsIHx8IGQub3B0aW9ucy5wYXJzZSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdFx0YXJncyA9IGFyZ3MuY29uY2F0KHNlbGYucmVuZGVyQXJndW1lbnRzKGF0dHIuYXJndW1lbnRzLCBjdHgpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gZXhlY3V0ZSB0aGUgY2FsbGJhY2tcblx0XHRcdFx0XHRcdGQuY2FsbGJhY2suYXBwbHkoZC5jb250ZXh0IHx8IHNlbGYsIGFyZ3MpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0Ly8gY2xlYW4gdXBcblx0XHRcdFx0XHRfY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRkY29tcC5zdG9wKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cbn0sIHtcblxuXHRyZW5kZXI6IGZ1bmN0aW9uKHRlbXBsYXRlLCBkYXRhLCBvcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zIHx8IHt9LCB7XG5cdFx0XHR0ZW1wbGF0ZTogdGVtcGxhdGVcblx0XHR9KTtcblxuXHRcdHJldHVybiBuZXcgTXVzdGFjaGUoZGF0YSB8fCBudWxsLCBvcHRpb25zKTtcblx0fVxuXG59KTtcbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdE11c3RhY2hlID0gcmVxdWlyZShcIi4uL1wiKTtcblxuLy8gZ2VuZXJhdGUgZGVjb3JhdG9yc1xudmFyIGV2ZW50TmFtZXMgPSBbXG5cdCdsb2FkJywgJ3Njcm9sbCcsXG5cdCdjbGljaycsICdkYmxjbGljaycsICdtb3VzZWRvd24nLCAnbW91c2V1cCcsICdtb3VzZWVudGVyJywgJ21vdXNlbGVhdmUnLFxuXHQna2V5ZG93bicsICdrZXlwcmVzcycsICdrZXl1cCcsXG5cdCdibHVyJywgJ2ZvY3VzJywgJ2NoYW5nZScsICdpbnB1dCcsICdzdWJtaXQnLCAncmVzZXQnLFxuXHQnZHJhZycsICdkcmFnZHJvcCcsICdkcmFnZW5kJywgJ2RyYWdlbnRlcicsICdkcmFnZXhpdCcsICdkcmFnbGVhdmUnLCAnZHJhZ292ZXInLCAnZHJhZ3N0YXJ0JywgJ2Ryb3AnXG5dO1xuXG52YXIgc2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2U7XG52YXIgZGVjb3JhdG9ycyA9IHt9O1xuXG4vLyB0aGUgcGx1Z2luXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLmFkZEFjdGlvbiA9IGFkZEFjdGlvbjtcblx0dGhpcy5hZGRBY3Rpb25PbmNlID0gYWRkQWN0aW9uT25jZTtcblx0dGhpcy5yZW1vdmVBY3Rpb24gPSByZW1vdmVBY3Rpb247XG5cdHRoaXMuZmlyZUFjdGlvbiA9IGZpcmVBY3Rpb247XG5cdHRoaXMuZGVjb3JhdGUoZGVjb3JhdG9ycyk7XG5cblx0dmFyIGluaXRBY3Rpb25zID0gXy5yZXN1bHQodGhpcywgXCJhY3Rpb25zXCIpO1xuXHRpZiAoaW5pdEFjdGlvbnMgIT0gbnVsbCkgdGhpcy5hZGRBY3Rpb24oaW5pdEFjdGlvbnMpO1xufTtcblxuZXZlbnROYW1lcy5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XG5cdGRlY29yYXRvcnNbXCJvbi1cIiArIGV2ZW50XSA9IGZ1bmN0aW9uKGRlY29yLCBrZXkpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXMsXG5cdFx0XHRhcmdzLCBub2RlO1xuXG5cdFx0ZnVuY3Rpb24gbGlzdGVuZXIoZSkge1xuXHRcdFx0Ly8gY3JlYXRlIGEgbmV3IGFjdGlvbiBvYmplY3Rcblx0XHRcdHZhciBhY3Rpb24gPSBuZXcgQWN0aW9uKGtleSk7XG5cdFx0XHRhY3Rpb24ub3JpZ2luYWwgPSBlO1xuXHRcdFx0YWN0aW9uLnRhcmdldCA9IGFjdGlvbi5ub2RlID0gbm9kZTtcblx0XHRcdGFjdGlvbi5jb250ZXh0ID0gYWN0aW9uLm1vZGVsID0gZGVjb3IubW9kZWw7XG5cdFx0XHRhY3Rpb24udmlldyA9IGRlY29yLnZpZXc7XG5cblx0XHRcdC8vIGZpbmQgdGhlIGZpcnN0IHBhcmVudCB3aXRoIHRoZSBmaXJlIG1ldGhvZFxuXHRcdFx0dmFyIGZpcmVPbiA9IHNlbGY7XG5cdFx0XHR3aGlsZSAodHlwZW9mIGZpcmVPbi5maXJlQWN0aW9uICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0Ly8gaWYgaXQgaGFzIG5vIHBhcmVudCwgd2UgY2FuJ3QgZG8gYW55dGhpbmdcblx0XHRcdFx0aWYgKGZpcmVPbi5wYXJlbnRSYW5nZSA9PSBudWxsKSByZXR1cm47XG5cdFx0XHRcdGZpcmVPbiA9IGZpcmVPbi5wYXJlbnRSYW5nZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZmlyZSB0aGUgYWN0aW9uXG5cdFx0XHRmaXJlT24uZmlyZUFjdGlvbi5hcHBseShmaXJlT24sIFsgYWN0aW9uIF0uY29uY2F0KGFyZ3MpKTtcblx0XHR9XG5cblx0XHRub2RlID0gZGVjb3IudGFyZ2V0O1xuXHRcdGFyZ3MgPSBfLnRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgyKTtcblx0XHRub2RlLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGxpc3RlbmVyKTtcblxuXHRcdGRlY29yLmNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0bm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcik7XG5cdFx0fSk7XG5cdH07XG59KTtcblxuLy8gQWN0aW9uIENsYXNzXG5mdW5jdGlvbiBBY3Rpb24obmFtZSkge1xuXHR0aGlzLm5hbWUgPSBuYW1lO1xufVxuXG5NdXN0YWNoZS5BY3Rpb24gPSBBY3Rpb247XG5cbkFjdGlvbi5wcm90b3R5cGUuYnViYmxlcyA9IHRydWU7XG5cbkFjdGlvbi5wcm90b3R5cGUuc3RvcFByb3BhZ2F0aW9uID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMuYnViYmxlcyA9IGZhbHNlO1xuXHRyZXR1cm4gdGhpcztcbn07XG5cbi8vIE1zdXRhY2hlIEluc3RhbmNlIE1ldGhvZHNcbmZ1bmN0aW9uIGFkZEFjdGlvbihuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgPT09IFwib2JqZWN0XCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihmbiwgbikgeyB0aGlzLmFkZEFjdGlvbihuLCBmbik7IH0sIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBuYW1lICE9PSBcInN0cmluZ1wiIHx8IG5hbWUgPT09IFwiXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBub24tZW1wdHkgc3RyaW5nIGZvciBhY3Rpb24gbmFtZS5cIik7XG5cdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciBhY3Rpb24uXCIpO1xuXG5cdGlmICh0aGlzLl9hY3Rpb25zID09IG51bGwpIHRoaXMuX2FjdGlvbnMgPSB7fTtcblx0aWYgKHRoaXMuX2FjdGlvbnNbbmFtZV0gPT0gbnVsbCkgdGhpcy5fYWN0aW9uc1tuYW1lXSA9IFtdO1xuXHRpZiAoIX50aGlzLl9hY3Rpb25zW25hbWVdLmluZGV4T2YoZm4pKSB0aGlzLl9hY3Rpb25zW25hbWVdLnB1c2goZm4pO1xuXG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiBhZGRBY3Rpb25PbmNlKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJvYmplY3RcIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKGZuLCBuKSB7IHRoaXMuYWRkQWN0aW9uT25jZShuLCBmbik7IH0sIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0dmFyIG9uQWN0aW9uO1xuXG5cdHRoaXMuYWRkQWN0aW9uKG5hbWUsIG9uQWN0aW9uID0gZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMucmVtb3ZlQWN0aW9uKG5hbWUsIG9uQWN0aW9uKTtcblx0XHRmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gcmVtb3ZlQWN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJmdW5jdGlvblwiICYmIGZuID09IG51bGwpIHtcblx0XHRmbiA9IG5hbWU7XG5cdFx0bmFtZSA9IG51bGw7XG5cdH1cblxuXHRpZiAodGhpcy5fYWN0aW9ucyA9PSBudWxsIHx8IChuYW1lID09IG51bGwgJiYgZm4gPT0gbnVsbCkpIHtcblx0XHR0aGlzLl9hY3Rpb25zID0ge307XG5cdH1cblxuXHRlbHNlIGlmIChmbiA9PSBudWxsKSB7XG5cdFx0ZGVsZXRlIHRoaXMuX2FjdGlvbnNbbmFtZV07XG5cdH1cblxuXHRlbHNlIGlmIChuYW1lID09IG51bGwpIHtcblx0XHRfLmVhY2godGhpcy5fYWN0aW9ucywgZnVuY3Rpb24oZCwgbikge1xuXHRcdFx0dGhpcy5fYWN0aW9uc1tuXSA9IGQuZmlsdGVyKGZ1bmN0aW9uKGYpIHsgcmV0dXJuIGYgIT09IGZuOyB9KTtcblx0XHR9LCB0aGlzKTtcblx0fVxuXG5cdGVsc2UgaWYgKHRoaXMuX2FjdGlvbnNbbmFtZV0gIT0gbnVsbCkge1xuXHRcdHRoaXMuX2FjdGlvbnNbbmFtZV0gPSBfLndpdGhvdXQodGhpcy5fYWN0aW9uc1tuYW1lXSwgZm4pO1xuXHR9XG5cblx0cmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGZpcmVBY3Rpb24oYWN0aW9uKSB7XG5cdGlmICh0eXBlb2YgYWN0aW9uID09PSBcInN0cmluZ1wiKSBhY3Rpb24gPSBuZXcgQWN0aW9uKGFjdGlvbik7XG5cdGlmIChfLmlzT2JqZWN0KGFjdGlvbikgJiYgIShhY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb24pKSBhY3Rpb24gPSBfLmV4dGVuZChuZXcgQWN0aW9uKCksIGFjdGlvbik7XG5cdGlmICghKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhY3Rpb24gbmFtZSwgb2JqZWN0IG9yIGluc3RhbmNlIG9mIEFjdGlvbi5cIik7XG5cblx0dmFyIG5hbWUgPSBhY3Rpb24ubmFtZSxcblx0XHRhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXG5cdGFyZ3MudW5zaGlmdChhY3Rpb24pO1xuXG5cdGlmICh0aGlzLl9hY3Rpb25zICE9IG51bGwgJiYgQXJyYXkuaXNBcnJheSh0aGlzLl9hY3Rpb25zW25hbWVdKSkge1xuXHRcdHRoaXMuX2FjdGlvbnNbbmFtZV0uc29tZShmdW5jdGlvbihmbikge1xuXHRcdFx0aWYgKCFhY3Rpb24uYnViYmxlcykgcmV0dXJuIHRydWU7XG5cdFx0XHRmbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHR9LCB0aGlzKTtcblx0fVxuXG5cdGlmIChhY3Rpb24uYnViYmxlcyAmJiB0aGlzLnBhcmVudFJhbmdlICE9IG51bGwpIHtcblx0XHQvLyBmaW5kIHRoZSBmaXJzdCBwYXJlbnQgd2l0aCB0aGUgZmlyZSBtZXRob2Rcblx0XHR2YXIgZmlyZU9uID0gdGhpcy5wYXJlbnRSYW5nZTtcblx0XHR3aGlsZSAodHlwZW9mIGZpcmVPbi5maXJlQWN0aW9uICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdC8vIGlmIGl0IGhhcyBubyBwYXJlbnQsIHdlIGNhbid0IGRvIGFueXRoaW5nXG5cdFx0XHRpZiAoZmlyZU9uLnBhcmVudFJhbmdlID09IG51bGwpIHJldHVybjtcblx0XHRcdGZpcmVPbiA9IGZpcmVPbi5wYXJlbnRSYW5nZTtcblx0XHR9XG5cblx0XHRmaXJlT24uZmlyZUFjdGlvbi5hcHBseShmaXJlT24sIGFyZ3MpO1xuXHR9XG5cblx0cmV0dXJuIHRoaXM7XG59XG4iLCJ2YXIgTXVzdGFjaGUgPSByZXF1aXJlKFwiLi4vXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLmFkb3B0ID0gYWRvcHQ7XG5cdHRoaXMuZGlzb3duID0gZGlzb3duO1xufTtcblxuZnVuY3Rpb24gYWRvcHQodmlldywgcGFyZW50LCBiZWZvcmUpIHtcblx0aWYgKCEodmlldyBpbnN0YW5jZW9mIE11c3RhY2hlLlZpZXcpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGluc3RhbmNlb2YgVGVtcGxlIFZpZXcuXCIpO1xuXHR9XG5cblx0aWYgKHRoaXMuX2Fkb3B0ZWQgPT0gbnVsbCkgdGhpcy5fYWRvcHRlZCA9IFtdO1xuXG5cdC8vIGhhdmUgb3JpZ2luYWwgcGFyZW50IGRpc293biBjaGlsZCBhbmQgc2V0IHRoZSBhZG9wdGVkIHBhcmVudCByZWZlcmVuY2Vcblx0aWYgKHZpZXcuYWRvcHRlZFBhcmVudCkgdmlldy5hZG9wdGVkUGFyZW50LmRpc293bih2aWV3LmFkb3B0ZWRQYXJlbnQpO1xuXHR2aWV3LmFkb3B0ZWRQYXJlbnQgPSB0aGlzO1xuXG5cdC8vIGhvb2sgbmF2YmFyIGRhdGEgdXAgdG8gdGhpcyBkYXRhXG5cdHZhciBvbGRSb290ID0gdmlldy5nZXRSb290TW9kZWwoKTtcblx0b2xkUm9vdC5wYXJlbnQgPSB0aGlzLm1vZGVsO1xuXG5cdC8vIHJlbmRlciBpbW1lZGlhdGVseSBpZiBwYXJlbnQgaXMgbW91bnRlZFxuXHRpZiAodGhpcy5jb21wKSB2aWV3LnBhaW50KHBhcmVudCwgYmVmb3JlKTtcblxuXHQvLyByZW5kZXIgd2hlbiBwYXJlbnQgcmVuZGVyc1xuXHR2YXIgb25Nb3VudDtcblx0dGhpcy5vbihcIm1vdW50OmFmdGVyXCIsIG9uTW91bnQgPSBmdW5jdGlvbigpIHtcblx0XHR2aWV3LnBhaW50KHBhcmVudCwgYmVmb3JlKTtcblx0fSk7XG5cblx0dmFyIG9uU3RvcDtcblx0dGhpcy5vbihcInN0b3BcIiwgb25TdG9wID0gZnVuY3Rpb24oKSB7XG5cdFx0dmlldy5kZXRhY2goKTtcblx0fSk7XG5cblx0dGhpcy5fYWRvcHRlZC5wdXNoKHtcblx0XHRzdG9wOiBvblN0b3AsXG5cdFx0bW91bnQ6IG9uTW91bnQsXG5cdFx0dmlldzogdmlldyxcblx0XHRyb290OiBvbGRSb290XG5cdH0pO1xuXG5cdHJldHVybiB2aWV3O1xufVxuXG5mdW5jdGlvbiBkaXNvd24odmlldykge1xuXHRpZiAodGhpcy5fYWRvcHRlZCA9PSBudWxsKSByZXR1cm47XG5cblx0dmFyIGluZGV4O1xuXHRpZiAoIXRoaXMuX2Fkb3B0ZWQuc29tZShmdW5jdGlvbihhLCBpKSB7XG5cdFx0aWYgKGEudmlldyA9PT0gdmlldykge1xuXHRcdFx0aW5kZXggPSBpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9KSkgcmV0dXJuO1xuXG5cdC8vIHJlbW92ZSBmb3JtIHRoZSBET01cblx0dmlldy5kZXRhY2goKTtcblxuXHQvLyByZW1vdmUgZXZlbnQgbGlzdGVuZXJzXG5cdHRoaXMub2ZmKFwibW91bnQ6YWZ0ZXJcIiwgdGhpcy5fYWRvcHRlZFtpbmRleF0ubW91bnQpO1xuXHR0aGlzLm9mZihcInN0b3BcIiwgdGhpcy5fYWRvcHRlZFtpbmRleF0uc3RvcCk7XG5cblx0Ly8gcmVzZXQgdGhlIGRhdGEgbW9kZWxcblx0dGhpcy5fYWRvcHRlZFtpbmRleF0ucm9vdC5wYXJlbnQgPSBudWxsO1xuXG5cdC8vIHJlbW92ZSByZWZlcmVuY2VzXG5cdGlmICh2aWV3LmFkb3B0ZWRQYXJlbnQgPT09IHRoaXMpIGRlbGV0ZSB2aWV3LmFkb3B0ZWRQYXJlbnQ7XG5cdHRoaXMuX2Fkb3B0ZWQuc3BsaWNlKGluZGV4LCAxKTtcblxuXHRyZXR1cm4gdmlldztcbn1cbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbnZhciBwbHVnaW5zID1cbmV4cG9ydHMuX3BsdWdpbnMgPSB7fTtcblxuZXhwb3J0cy5sb2FkUGx1Z2luID0gZnVuY3Rpb24odHBsLCBwbHVnaW4sIGFyZ3MpIHtcblx0aWYgKF8uaXNTdHJpbmcocGx1Z2luKSkge1xuXHRcdGlmIChwbHVnaW5zW3BsdWdpbl0gPT0gbnVsbClcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIk5vIHBsdWdpbiBleGlzdHMgd2l0aCBpZCAnXCIgKyBwbHVnaW4gKyBcIicuXCIpO1xuXG5cdFx0cGx1Z2luID0gcGx1Z2luc1twbHVnaW5dO1xuXHR9XG5cblx0aWYgKCFfLmlzRnVuY3Rpb24ocGx1Z2luKSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG9yIGZ1bmN0aW9uIGZvciBwbHVnaW5cIik7XG5cblx0Ly8gY2hlY2sgaWYgcGx1Z2luIGlzIGFscmVhZHkgbG9hZGVkIG9uIHRoaXMgdGVtcGxhdGVcblx0aWYgKHRwbC5fbG9hZGVkX3BsdWdpbnMgPT0gbnVsbCkgdHBsLl9sb2FkZWRfcGx1Z2lucyA9IFtdO1xuXHRpZiAofnRwbC5fbG9hZGVkX3BsdWdpbnMuaW5kZXhPZihwbHVnaW4pKSByZXR1cm4gdHBsO1xuXHR0cGwuX2xvYWRlZF9wbHVnaW5zLnB1c2gocGx1Z2luKTtcblxuXHRpZiAoYXJncyA9PSBudWxsKSBhcmdzID0gW107XG5cdGlmICghXy5pc0FycmF5KGFyZ3MpKSBhcmdzID0gWyBhcmdzIF07XG5cblx0cGx1Z2luLmFwcGx5KHRwbCwgYXJncyk7XG5cdHJldHVybiB0cGw7XG59O1xuXG52YXIgcmVnaXN0ZXJQbHVnaW4gPVxuZXhwb3J0cy5yZWdpc3RlclBsdWdpbiA9IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIikge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgbmFtZSBmb3IgcGx1Z2luLlwiKTtcblx0fVxuXG5cdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgcGx1Z2luLlwiKTtcblx0fVxuXG5cdGlmIChmbiA9PT0gcGx1Z2luc1tuYW1lXSkgcmV0dXJuO1xuXHRpZiAocGx1Z2luc1tuYW1lXSAhPSBudWxsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiUmVmdXNpbmcgdG8gb3ZlcndyaXRlIGV4aXN0aW5nIHBsdWdpbiBcXFwibmFtZVxcXCIuXCIpO1xuXHR9XG5cblx0cGx1Z2luc1tuYW1lXSA9IGZuO1xufTtcblxuLy8gbG9hZCBidWlsdCBpbiBwbHVnaW5zXG5yZWdpc3RlclBsdWdpbihcImFjdGlvbnNcIiwgcmVxdWlyZShcIi4vYWN0aW9uc1wiKSk7XG5yZWdpc3RlclBsdWdpbihcInR3b3dheVwiLCByZXF1aXJlKFwiLi90d293YXlcIikpO1xucmVnaXN0ZXJQbHVnaW4oXCJhZG9wdGlvblwiLCByZXF1aXJlKFwiLi9hZG9wdGlvblwiKSk7XG5yZWdpc3RlclBsdWdpbihcInJlZnNcIiwgcmVxdWlyZShcIi4vcmVmc1wiKSk7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLnJlZnMgPSB7fTtcblx0dGhpcy5kZWNvcmF0ZShcInJlZlwiLCByZWYpO1xuXHR0aGlzLmZpbmRCeVJlZiA9IGZpbmRCeVJlZjtcbn07XG5cbmZ1bmN0aW9uIHJlZihkLCBrZXkpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIGRvbid0IG92ZXJ3cml0ZVxuXHRpZiAodGhpcy5yZWZzW2tleV0gIT0gbnVsbCkge1xuXHRcdGNvbnNvbGUud2FybihcIk11bHRpcGxlIGVsZW1lbnRzIHdpdGggcmVmZXJlbmNlICclcycuXCIsIGtleSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gc2V0IHRoZSByZWZlcmVuY2Vcblx0dGhpcy5yZWZzW2tleV0gPSBkLnRhcmdldDtcblxuXHQvLyByZW1vdmUgdGhlIHJlZmVyZW5jZSB3aGVuIHRoZSBlbGVtZW50IGRpc2FwcGVhcnNcblx0ZC5jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRkZWxldGUgc2VsZi5yZWZzW2tleV07XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBmaW5kQnlSZWYoa2V5KSB7XG5cdHZhciB0cGxzID0gWyB0aGlzIF0sXG5cdFx0dHBsO1xuXG5cdHdoaWxlICh0cGxzLmxlbmd0aCkge1xuXHRcdHRwbCA9IHRwbHMuc2hpZnQoKTtcblx0XHRpZiAodHBsLnJlZnMgJiYgdHBsLnJlZnNba2V5XSkgcmV0dXJuIHRwbC5yZWZzW2tleV07XG5cdFx0dHBscyA9IHRwbHMuY29uY2F0KHRwbC5nZXRDb21wb25lbnRzKCkpO1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG52YXIgdmFsdWVfdHlwZXMgPSBbIFwicmFkaW9cIiwgXCJvcHRpb25cIiBdO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0Ly8gYWRkIG1ldGhvZHNcblx0dGhpcy5hZGRGb3JtQmluZGluZyA9IGFkZEZvcm1CaW5kaW5nO1xuXHR0aGlzLmdldEZvcm1CaW5kaW5nID0gZ2V0Rm9ybUJpbmRpbmc7XG5cdHRoaXMucmVtb3ZlRm9ybUJpbmRpbmcgPSByZW1vdmVGb3JtQmluZGluZztcblxuXHQvLyBhZGQgbWFpbiBiaW5kaW5nIGRlY29yYXRvclxuXHR0aGlzLmRlY29yYXRlKFwiYmluZC10b1wiLCBmdW5jdGlvbiBiaW5kVG8oZCwgaWQsIGxhenkpIHtcblx0XHR2YXIgZmJpbmQgPSB0aGlzLmdldEZvcm1CaW5kaW5nKGlkKTtcblx0XHRpZiAoZmJpbmQgPT0gbnVsbCkgcmV0dXJuO1xuXG5cdFx0dmFyIGVsID0gZC50YXJnZXQsXG5cdFx0XHR0eXBlID0gZ2V0VHlwZShlbCksXG5cdFx0XHRzZWxmID0gdGhpcyxcblx0XHRcdG9uQ2hhbmdlO1xuXG5cdFx0Ly8gZGV0ZWN0IGNoYW5nZXMgdG8gdGhlIGlucHV0J3MgdmFsdWVcblx0XHRpZiAodHlwZW9mIGZiaW5kLmNoYW5nZSA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRvbkNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0ZmJpbmQuY2hhbmdlLmNhbGwoc2VsZiwgZ2V0Tm9kZVZhbHVlKGVsLCB0eXBlKSwgZC5tb2RlbCwgZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRlbC5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIG9uQ2hhbmdlKTtcblx0XHRcdGlmICghKG9wdGlvbnMubGF6eSB8fCBsYXp5KSkgZWwuYWRkRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIG9uQ2hhbmdlKTtcblxuXHRcdFx0ZC5jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdFx0ZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBvbkNoYW5nZSk7XG5cdFx0XHRcdGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCBvbkNoYW5nZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyByZWFjdGl2ZWx5IHNldCB0aGUgdmFsdWUgb24gdGhlIGlucHV0XG5cdFx0dmFyIGMgPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRzZXROb2RlVmFsdWUoZWwsIGZiaW5kLmdldC5jYWxsKHNlbGYsIGQubW9kZWwpLCB0eXBlKTtcblx0XHR9KTtcblxuXHRcdC8vIHNldE5vZGVWYWx1ZSByZWxpZXMgb24gdGhlIGNoaWxkcmVuIGVsZW1lbnRzXG5cdFx0Ly8gdGhvc2Ugd29uJ3QgYmUgaW4gdGhlIERPTSB0aWxsIGF0IGxlYXN0IHRoZSBuZXh0IHRpY2tcblx0XHRjLmludmFsaWRhdGUoKTtcblx0fSk7XG5cblx0Ly8gYWRkIHZhbHVlIGRlY29yYXRvciBmb3IgcmFkaW9zIGFuZCBvcHRpb25zXG5cdHRoaXMuZGVjb3JhdGUoXCJ2YWx1ZVwiLCBmdW5jdGlvbiB2YWx1ZU9mKGQsIHN0cnZhbCkge1xuXHRcdHZhciBlbCA9IGQudGFyZ2V0LFxuXHRcdFx0dHlwZSA9IGdldFR5cGUoZWwpO1xuXG5cdFx0aWYgKCFfLmNvbnRhaW5zKHZhbHVlX3R5cGVzLCB0eXBlKSkge1xuXHRcdFx0ZWwudmFsdWUgPSBzdHJ2YWw7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmFyIGFyZ3MgPSB0aGlzLnJlbmRlckFyZ3VtZW50cyhkLnRlbXBsYXRlLmFyZ3VtZW50cywgZC5tb2RlbCk7XG5cdFx0ZWwuJGJvdW5kX3ZhbHVlID0gYXJncy5sZW5ndGggPD0gMSA/IGFyZ3NbMF0gOiBhcmdzO1xuXHRcdGVsLnZhbHVlID0gc3RydmFsO1xuXHR9LCB7IHBhcnNlOiBcInN0cmluZ1wiIH0pO1xuXG5cdC8vIGFkZCBpbml0aWFsIGZvcm0gYmluZGluZ3Ncblx0dmFyIGluaXRpYWxCaW5kcyA9IF8ucmVzdWx0KHRoaXMsIFwidHdvd2F5XCIpO1xuXHRpZiAoXy5pc09iamVjdChpbml0aWFsQmluZHMpKSB0aGlzLmFkZEZvcm1CaW5kaW5nKGluaXRpYWxCaW5kcyk7XG59O1xuXG5mdW5jdGlvbiBhZGRGb3JtQmluZGluZyhpZCwgZ2V0dGVyLCBvbkNoYW5nZSkge1xuXHRpZiAoXy5pc09iamVjdChpZCkpIHtcblx0XHRfLmVhY2goaWQsIGZ1bmN0aW9uKHYsIGspIHtcblx0XHRcdGFkZEZvcm1CaW5kaW5nLmNhbGwodGhpcywgaywgdik7XG5cdFx0fSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRpZiAodHlwZW9mIGlkICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSBzdHJpbmcgZm9yIHRoZSBmb3JtIGJpbmRpbmcgSUQuXCIpO1xuXHRpZiAodGhpcy5fZm9ybUJpbmRpbmdzID09IG51bGwpIHRoaXMuX2Zvcm1CaW5kaW5ncyA9IHt9O1xuXHRpZiAodGhpcy5fZm9ybUJpbmRpbmdzW2lkXSAhPSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvcm0gYmluZGluZyB3aXRoIGlkICdcIiArIGlkICsgXCInIGFscmVhZHkgZXhpc3RzLlwiKTtcblxuXHRpZiAoXy5pc09iamVjdChnZXR0ZXIpICYmIG9uQ2hhbmdlID09IG51bGwpIHtcblx0XHRvbkNoYW5nZSA9IGdldHRlci5jaGFuZ2U7XG5cdFx0Z2V0dGVyID0gZ2V0dGVyLmdldDtcblx0fVxuXG5cdGlmICh0eXBlb2YgZ2V0dGVyICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIGZ1bmN0aW9uIG9yIG9iamVjdCBmb3IgdGhlIGZvcm0gYmluZGluZyBnZXR0ZXIuXCIpO1xuXHRpZiAodHlwZW9mIG9uQ2hhbmdlICE9PSBcImZ1bmN0aW9uXCIpIG9uQ2hhbmdlID0gbnVsbDtcblxuXHR0aGlzLl9mb3JtQmluZGluZ3NbaWRdID0ge1xuXHRcdGdldDogZ2V0dGVyLFxuXHRcdGNoYW5nZTogb25DaGFuZ2Vcblx0fTtcblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gZ2V0Rm9ybUJpbmRpbmcoaWQpIHtcblx0aWYgKHR5cGVvZiBpZCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuO1xuXHR2YXIgYyA9IHRoaXMsIGJpbmRpbmdzO1xuXG5cdHdoaWxlIChjICE9IG51bGwpIHtcblx0XHRiaW5kaW5ncyA9IGMuX2Zvcm1CaW5kaW5ncztcblx0XHRpZiAoYmluZGluZ3MgIT0gbnVsbCAmJiBiaW5kaW5nc1tpZF0gIT0gbnVsbCkgcmV0dXJuIGJpbmRpbmdzW2lkXTtcblx0XHRjID0gYy5wYXJlbnRSYW5nZTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW1vdmVGb3JtQmluZGluZyhpZCkge1xuXHR2YXIgZXhpc3RzID0gdGhpcy5fZm9ybUJpbmRpbmdzW2lkXSAhPSBudWxsO1xuXHRkZWxldGUgdGhpcy5fZm9ybUJpbmRpbmdzW2lkXTtcblx0cmV0dXJuIGV4aXN0cztcbn1cblxudmFyIHR5cGVfbWFwID0ge1xuXHRcInRleHRcIjogWyBcInRleHRcIiwgXCJjb2xvclwiLCBcImVtYWlsXCIsIFwicGFzc3dvcmRcIiwgXCJzZWFyY2hcIiwgXCJ0ZWxcIiwgXCJ1cmxcIiwgXCJoaWRkZW5cIiBdLFxuXHRcIm51bWJlclwiOiBbIFwibnVtYmVyXCIsIFwicmFuZ2VcIiBdLFxuXHRcImRhdGVcIjogWyBcImRhdGVcIiwgXCJkYXRldGltZVwiLCBcImRhdGV0aW1lLWxvY2FsXCIsIFwibW9udGhcIiwgXCJ0aW1lXCIsIFwid2Vla1wiIF0sXG5cdFwiZmlsZVwiOiBbIFwiZmlsZVwiIF0sXG5cdFwiY2hlY2tib3hcIjogWyBcImNoZWNrYm94XCIgXSxcblx0XCJyYWRpb1wiOiBbIFwicmFkaW9cIiBdXG59O1xuXG5mdW5jdGlvbiBnZXRUeXBlKGVsKSB7XG5cdHN3aXRjaCAoZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0Y2FzZSBcImlucHV0XCI6XG5cdFx0XHRmb3IgKHZhciB0eXBlIGluIHR5cGVfbWFwKSB7XG5cdFx0XHRcdGlmIChfLmNvbnRhaW5zKHR5cGVfbWFwW3R5cGVdLCBlbC50eXBlKSkgcmV0dXJuIHR5cGU7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJzZWxlY3RcIjpcblx0XHRcdHJldHVybiBcInNlbGVjdFwiO1xuXG5cdFx0Y2FzZSBcIm9wdGlvblwiOlxuXHRcdFx0cmV0dXJuIFwib3B0aW9uXCI7XG5cblx0XHRjYXNlIFwidGV4dGFyZWFcIjpcblx0XHRcdHJldHVybiBcInRleHRcIjtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXROb2RlVmFsdWUobm9kZSwgdHlwZSkge1xuXHRpZiAodHlwZSA9PSBudWxsKSB0eXBlID0gZ2V0VHlwZShub2RlKTtcblx0dmFyIHZhbDtcblxuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFwibnVtYmVyXCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlQXNOdW1iZXI7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwidGV4dFwiOlxuXHRcdFx0dmFsID0gbm9kZS52YWx1ZTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImNoZWNrYm94XCI6XG5cdFx0XHR2YWwgPSBub2RlLmNoZWNrZWQ7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJkYXRlXCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlQXNEYXRlO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwic2VsZWN0XCI6XG5cdFx0XHR2YXIgb3B0ID0gbm9kZS5xdWVyeVNlbGVjdG9yKFwib3B0aW9uOmNoZWNrZWRcIik7XG5cdFx0XHRpZiAob3B0ICE9IG51bGwpIHZhbCA9IG9wdC4kYm91bmRfdmFsdWU7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJmaWxlXCI6XG5cdFx0XHR2YWwgPSAhbm9kZS5tdWx0aXBsZSA/IG5vZGUuZmlsZXNbMF0gOiBfLnRvQXJyYXkobm9kZS5maWxlcyk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJyYWRpb1wiOlxuXHRcdFx0dmFsID0gbm9kZS4kYm91bmRfdmFsdWU7XG5cdFx0XHRicmVhaztcblx0fVxuXG5cdHJldHVybiB2YWw7XG59XG5cbmZ1bmN0aW9uIHNldE5vZGVWYWx1ZShlbCwgdmFsLCB0eXBlKSB7XG5cdGlmICh0eXBlID09IG51bGwpIHR5cGUgPSBnZXRUeXBlKGVsKTtcblxuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFwibnVtYmVyXCI6XG5cdFx0XHRpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZWwpIHJldHVybjtcblx0XHRcdGlmIChfLmlzTnVtYmVyKHZhbCkpIGVsLnZhbHVlQXNOdW1iZXIgPSB2YWw7XG5cdFx0XHRlbHNlIGVsLnZhbHVlID0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwidGV4dFwiOlxuXHRcdFx0aWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVsKSByZXR1cm47XG5cdFx0XHRlbC52YWx1ZSA9IHZhbCA9PSBudWxsID8gXCJcIiA6IHZhbC50b1N0cmluZygpO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiY2hlY2tib3hcIjpcblx0XHRcdGVsLmNoZWNrZWQgPSAhIXZhbDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImRhdGVcIjpcblx0XHRcdGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBlbCkgcmV0dXJuO1xuXHRcdFx0aWYgKF8uaXNEYXRlKHZhbCkpIGVsLnZhbHVlQXNEYXRlID0gdmFsO1xuXHRcdFx0ZWxzZSBlbC52YWx1ZSA9IHZhbDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInNlbGVjdFwiOlxuXHRcdFx0Xy50b0FycmF5KGVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJvcHRpb25cIikpLmZvckVhY2goZnVuY3Rpb24ob3B0KSB7XG5cdFx0XHRcdG9wdC5zZWxlY3RlZCA9IG9wdC4kYm91bmRfdmFsdWUgPT09IHZhbDtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwicmFkaW9cIjpcblx0XHRcdGVsLmNoZWNrZWQgPSBlbC4kYm91bmRfdmFsdWUgPT09IHZhbDtcblx0XHRcdGJyZWFrO1xuXHR9XG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xudmFyIFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIik7XG52YXIgTW9kZWwgPSByZXF1aXJlKFwiLi9tb2RlbFwiKTtcbnZhciBWaWV3ID0gcmVxdWlyZShcIi4vdmlld1wiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBWaWV3LmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnJvd3MgPSB7fTtcblx0XHR0aGlzLl9yb3dfZGVwcyA9IHt9O1xuXHRcdFZpZXcuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fSxcblxuXHRpbnZlcnQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdGlmICghXy5pc0Jvb2xlYW4odmFsKSkgdmFsID0gIXRoaXMuX2ludmVydGVkO1xuXHRcdHRoaXMuX2ludmVydGVkID0gdmFsO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGlzSW52ZXJ0ZWQ6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2ludmVydGVkO1xuXHR9LFxuXG5cdHNldFBhdGg6IGZ1bmN0aW9uKHBhdGgpIHtcblx0XHR0aGlzLl9wYXRoID0gcGF0aDtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRvblJvdzogZnVuY3Rpb24oZm4pIHtcblx0XHRpZiAoIV8uaXNGdW5jdGlvbihmbikpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIHJvdyBoYW5kbGVyLlwiKTtcblxuXHRcdHRoaXMuX29uUm93ID0gZm47XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkUm93OiBmdW5jdGlvbihrZXksIGRhdGEpIHtcblx0XHQvLyByZW1vdmUgZXhpc3Rpbmdcblx0XHR0aGlzLnJlbW92ZVJvdyhrZXkpO1xuXG5cdFx0Ly8gY29udmVydCBkYXRhIHRvIG1vZGVsXG5cdFx0aWYgKCFNb2RlbC5pc01vZGVsKGRhdGEpKSB7XG5cdFx0XHRkYXRhID0gbmV3IE1vZGVsKGRhdGEsIHRoaXMubW9kZWwpO1xuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSBhIG5ldyByb3dcblx0XHR2YXIgcm93ID0gbmV3IFZpZXcoZGF0YSk7XG5cblx0XHQvLyBzZXQgdXAgcmVuZGVyIGFuZCBtb3VudCBpdFxuXHRcdHJvdy5yZW5kZXIgPSB0aGlzLl9vblJvdztcblx0XHR0aGlzLnJvd3Nba2V5XSA9IHJvdztcblx0XHR0aGlzLmFkZE1lbWJlcihyb3cpO1xuXHRcdHJvdy5tb3VudCgpO1xuXG5cdFx0cmV0dXJuIHJvdztcblx0fSxcblxuXHRoYXNSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdHJldHVybiB0aGlzLmdldFJvdyhrZXkpICE9IG51bGw7XG5cdH0sXG5cblx0Z2V0Um93OiBmdW5jdGlvbihrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5yb3dzW2tleV07XG5cdH0sXG5cblx0cmVtb3ZlUm93OiBmdW5jdGlvbihrZXkpIHtcblx0XHRpZiAodGhpcy5yb3dzW2tleV0gPT0gbnVsbCkgcmV0dXJuIHRoaXM7XG5cblx0XHR2YXIgcm93ID0gdGhpcy5yb3dzW2tleV07XG5cdFx0dGhpcy5yZW1vdmVNZW1iZXIocm93KTtcblx0XHRkZWxldGUgdGhpcy5yb3dzW2tleV07XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVBbGxSb3dzOiBmdW5jdGlvbigpIHtcblx0XHRPYmplY3Qua2V5cyh0aGlzLnJvd3MpLmZvckVhY2godGhpcy5yZW1vdmVSb3csIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX3BhdGggPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyBwYXRoLlwiKTtcblxuXHRcdHZhciB2YWwsIGlzRW1wdHksIGludmVydGVkLCBpc0xpc3QsXG5cdFx0XHRtb2RlbCwgcHJveHksIGtleXM7XG5cblx0XHR2YWwgPSB0aGlzLmdldCh0aGlzLl9wYXRoKTtcblx0XHRtb2RlbCA9IG5ldyBNb2RlbCh2YWwsIHRoaXMubW9kZWwpO1xuXHRcdHByb3h5ID0gbW9kZWwuZ2V0UHJveHlCeVZhbHVlKHZhbCk7XG5cdFx0aW52ZXJ0ZWQgPSB0aGlzLmlzSW52ZXJ0ZWQoKTtcblx0XHRpc0xpc3QgPSBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJpc0xpc3RcIik7XG5cblx0XHRmdW5jdGlvbiBnZXRFbXB0aW5lc3MoKSB7XG5cdFx0XHRyZXR1cm4gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiaXNFbXB0eVwiKTtcblx0XHR9XG5cblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRpc0VtcHR5ID0gIXZhbCB8fCAoaXNMaXN0ICYmICFnZXRFbXB0aW5lc3MoKSk7XG5cdFx0fSk7XG5cblx0XHRpZiAoaXNFbXB0eSAmJiBpbnZlcnRlZCkge1xuXHRcdFx0aWYgKGlzTGlzdCkgZ2V0RW1wdGluZXNzKCk7XG5cdFx0XHR0aGlzLmFkZFJvdygwLCBtb2RlbCk7XG5cdFx0fSBlbHNlIGlmICghaXNFbXB0eSAmJiAhaW52ZXJ0ZWQpIHtcblx0XHRcdGlmIChpc0xpc3QpIHtcblx0XHRcdFx0a2V5cyA9IFtdO1xuXG5cdFx0XHRcdHRoaXMuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHRcdFx0dmFyIG5rZXlzID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwia2V5c1wiKTtcblxuXHRcdFx0XHRcdC8vIHRyaWNrIFRyYWNrciBzbyBhdXRvcnVucyBhcmVuJ3QgY29udHJvbGxlZCBieSB0aGlzIG9uZVxuXHRcdFx0XHRcdFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBjb21wLl9wYXJlbnQ7XG5cblx0XHRcdFx0XHQvLyByZW1vdmUgcmVtb3ZlZCByb3dzXG5cdFx0XHRcdFx0Xy5kaWZmZXJlbmNlKGtleXMsIG5rZXlzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3Jvd19kZXBzW2tleV0pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcm93X2RlcHNba2V5XS5zdG9wKCk7XG5cdFx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9yb3dfZGVwc1trZXldO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLnJlbW92ZVJvdyhrZXkpO1xuXHRcdFx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRcdFx0Ly8gYWRkIGFkZGVkIHJvd3Ncblx0XHRcdFx0XHRfLmRpZmZlcmVuY2UobmtleXMsIGtleXMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0XHRcdFx0XHR2YXIgcm93LCBybW9kZWw7XG5cblx0XHRcdFx0XHRcdHJvdyA9IHRoaXMuZ2V0Um93KGtleSk7XG5cdFx0XHRcdFx0XHRybW9kZWwgPSByb3cgIT0gbnVsbCA/IHJvdy5tb2RlbCA6XG5cdFx0XHRcdFx0XHRcdG5ldyBNb2RlbChudWxsLCBuZXcgTW9kZWwoeyAka2V5OiBrZXkgfSwgdGhpcy5tb2RlbCkpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLl9yb3dfZGVwc1trZXldID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHRybW9kZWwuc2V0KG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImdldFwiLCBrZXkpKTtcblx0XHRcdFx0XHRcdFx0Ly8gaWYgKHJvd1NvcnQgIT0gbnVsbCkgcm93U29ydC5pbnZhbGlkYXRlKCk7XG5cdFx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdFx0Ly8gYWRkIHRoZSByb3cgYWZ0ZXIgd2Ugc2V0IHRoZSBkYXRhXG5cdFx0XHRcdFx0XHRpZiAocm93ID09IG51bGwpIHRoaXMuYWRkUm93KGtleSwgcm1vZGVsKTtcblx0XHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRcdC8vIHByZXRlbmQgbGlrZSBub3RoaW5nIGhhcHBlbmVkXG5cdFx0XHRcdFx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IGNvbXA7XG5cblx0XHRcdFx0XHQvLyB0aGUgbmV3IHNldCBvZiBrZXlzXG5cdFx0XHRcdFx0a2V5cyA9IG5rZXlzO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBhIHJlYWN0aXZlIGNvbnRleHQgdGhhdCBjb250aW51b3VzbHkgc29ydHMgcm93c1xuXHRcdFx0XHQvLyByb3dTb3J0ID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdC8vIGNvbnNvbGUubG9nKGtleXMpO1xuXHRcdFx0XHRcdC8vIHZhciBiZWZvcmUgPSBudWxsLCBpLCByb3c7XG5cblx0XHRcdFx0XHQvLyBmb3IgKGkgPSBrZXlzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Ly8gXHRyb3cgPSB0aGlzLmdldFJvdyhrZXlzW2ldKTtcblx0XHRcdFx0XHQvLyBcdGlmIChyb3cgPT0gbnVsbCkgY29udGludWU7XG5cdFx0XHRcdFx0Ly8gXHR0aGlzLmluc2VydEJlZm9yZShyb3csIGJlZm9yZSk7XG5cdFx0XHRcdFx0Ly8gXHRiZWZvcmUgPSByb3c7XG5cdFx0XHRcdFx0Ly8gfVxuXHRcdFx0XHQvLyB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYWRkUm93KDAsIG1vZGVsKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzTGlzdCkge1xuXHRcdFx0Z2V0RW1wdGluZXNzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gYXV0byBjbGVhblxuXHRcdHRoaXMub25jZShcImludmFsaWRhdGVcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHR0aGlzLl9yb3dfZGVwcyA9IHt9O1xuXHRcdFx0dGhpcy5yZW1vdmVBbGxSb3dzKCk7XG5cdFx0fSk7XG5cdH1cblxufSwge1xuXG5cdGlzRW1wdHk6IGZ1bmN0aW9uKG1vZGVsLCBwcm94eSkge1xuXHRcdGlmICghbW9kZWwuZGF0YSkgcmV0dXJuIHRydWU7XG5cdFx0aWYgKHByb3h5ID09IG51bGwpIHByb3h5ID0gbW9kZWwuZ2V0UHJveHlCeVZhbHVlKG1vZGVsLmRhdGEpO1xuXHRcdHJldHVybiBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIG1vZGVsLmRhdGEsIFwiaXNMaXN0XCIpICYmXG5cdFx0XHRtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIG1vZGVsLmRhdGEsIFwiaXNFbXB0eVwiKTtcblx0fVxuXG59KTtcbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuXHRST09UICAgICAgICAgICAgICA6IDEsXG5cblx0Ly8gWE1ML0hUTUxcblx0SFRNTCAgICAgICAgICAgICAgOiAyLFxuXHRURVhUICAgICAgICAgICAgICA6IDMsXG5cdEVMRU1FTlQgICAgICAgICAgIDogNCxcblx0QVRUUklCVVRFICAgICAgICAgOiA1LFxuXHRYQ09NTUVOVCAgICAgICAgICA6IDYsXG5cblx0Ly8gTXVzdGFjaGVcblx0SU5URVJQT0xBVE9SICAgICAgOiA3LFxuXHRUUklQTEUgICAgICAgICAgICA6IDgsXG5cdFNFQ1RJT04gICAgICAgICAgIDogOSxcblx0SU5WRVJURUQgICAgICAgICAgOiAxMCxcblx0UEFSVElBTCAgICAgICAgICAgOiAxMSxcblx0TUNPTU1FTlQgICAgICAgICAgOiAxMixcblxuXHQvLyBNSVNDXG5cdExJVEVSQUwgICAgICAgICAgIDogMTNcbn07XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG4vLyBsaWtlIHVuZGVyc2NvcmUncyByZXN1bHQsIGJ1dCBwYXNzIGFyZ3VtZW50cyB0aHJvdWdoXG5leHBvcnRzLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHkpIHtcblx0dmFyIHZhbHVlID0gb2JqZWN0ID09IG51bGwgPyB2b2lkIDAgOiBvYmplY3RbcHJvcGVydHldO1xuXHRyZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmFwcGx5KG9iamVjdCwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKSkgOiB2YWx1ZTtcbn07XG5cbi8vIHRlc3RzIHZhbHVlIGFzIHBvam8gKHBsYWluIG9sZCBqYXZhc2NyaXB0IG9iamVjdClcbmV4cG9ydHMuaXNQbGFpbk9iamVjdCA9IHJlcXVpcmUoXCJpcy1wbGFpbi1vYmplY3RcIik7XG5cbi8vIHRlc3RzIGZ1bmN0aW9uIGFzIGEgc3ViY2xhc3Mgb2YgYSBwYXJlbnQgZnVuY3Rpb25cbi8vIGhlcmUsIGEgY2xhc3MgaXMgdGVjaG5pY2FsbHkgYSBzdWJjbGFzcyBvZiBpdHNlbGZcbmV4cG9ydHMuaXNTdWJDbGFzcyA9IGZ1bmN0aW9uKHBhcmVudCwgZm4pIHtcblx0cmV0dXJuIGZuID09PSBwYXJlbnQgfHwgKGZuICE9IG51bGwgJiYgZm4ucHJvdG90eXBlIGluc3RhbmNlb2YgcGFyZW50KTtcbn07XG5cbi8vIGxpa2UgalF1ZXJ5J3MgZW1wdHkoKSwgcmVtb3ZlcyBhbGwgY2hpbGRyZW5cbnZhciBlbXB0eU5vZGUgPVxuZXhwb3J0cy5lbXB0eU5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG5cdHdoaWxlIChub2RlLmxhc3RDaGlsZCkgbm9kZS5yZW1vdmVDaGlsZChub2RlLmxhc3RDaGlsZCk7XG5cdHJldHVybiBub2RlO1xufTtcblxuLy8gaW5zZXJ0cyBhbiBhcnJheSBub2RlcyBpbnRvIGEgcGFyZW50XG5leHBvcnRzLmluc2VydE5vZGVzID0gZnVuY3Rpb24obm9kZXMsIHBhcmVudCwgYmVmb3JlKSB7XG5cdHZhciBub2RlLCBuZXh0LCBpO1xuXG5cdC8vIHdlIGRvIGl0IGJhY2t3YXJkcyBzbyBub2RlcyBkb24ndCBnZXQgbW92ZWQgaWYgdGhleSBkb24ndCBuZWVkIHRvXG5cdGZvciAoaSA9IG5vZGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0bm9kZSA9IG5vZGVzW2ldO1xuXHRcdG5leHQgPSBub2Rlc1tpICsgMV0gfHwgYmVmb3JlO1xuXG5cdFx0aWYgKG5vZGUubmV4dFNpYmxpbmcgIT09IGJlZm9yZSkge1xuXHRcdFx0cGFyZW50Lmluc2VydEJlZm9yZShub2RlLCBuZXh0KTtcblx0XHR9XG5cdH1cbn07XG5cbi8vIGNsZWFucyBodG1sLCB0aGVuIGNvbnZlcnRzIGh0bWwgZW50aXRpZXMgdG8gdW5pY29kZVxuZXhwb3J0cy5kZWNvZGVFbnRpdGllcyA9IChmdW5jdGlvbigpIHtcblx0aWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXG5cdC8vIHRoaXMgcHJldmVudHMgYW55IG92ZXJoZWFkIGZyb20gY3JlYXRpbmcgdGhlIG9iamVjdCBlYWNoIHRpbWVcblx0dmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0dmFyIGVudGl0eSA9IC8mKD86I3hbYS1mMC05XSt8I1swLTldK3xbYS16MC05XSspOz8vaWc7XG5cblx0cmV0dXJuIGZ1bmN0aW9uIGRlY29kZUhUTUxFbnRpdGllcyhzdHIpIHtcblx0XHRzdHIgPSBzdHIucmVwbGFjZShlbnRpdHksIGZ1bmN0aW9uKG0pIHtcblx0XHRcdGVsZW1lbnQuaW5uZXJIVE1MID0gbTtcblx0XHRcdHJldHVybiBlbGVtZW50LnRleHRDb250ZW50O1xuXHRcdH0pO1xuXG5cdFx0ZW1wdHlOb2RlKGVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHN0cjtcblx0fTtcbn0pKCk7XG5cbi8vIGNvbnZlcnQgaHRtbCBpbnRvIERPTSBub2Rlc1xuZXhwb3J0cy5wYXJzZUhUTUwgPSAoZnVuY3Rpb24oKSB7XG5cdGlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblxuXHQvLyB0aGlzIHByZXZlbnRzIGFueSBvdmVyaGVhZCBmcm9tIGNyZWF0aW5nIHRoZSBvYmplY3QgZWFjaCB0aW1lXG5cdHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0cmV0dXJuIGZ1bmN0aW9uIHBhcnNlSFRNTChodG1sKSB7XG5cdFx0ZWxlbWVudC5pbm5lckhUTUwgPSBodG1sICE9IG51bGwgPyBodG1sLnRvU3RyaW5nKCkgOiBcIlwiO1xuXHRcdHZhciBub2RlcyA9IF8udG9BcnJheShlbGVtZW50LmNoaWxkTm9kZXMpO1xuXHRcdGVtcHR5Tm9kZShlbGVtZW50KTtcblx0XHRyZXR1cm4gbm9kZXM7XG5cdH07XG59KSgpO1xuXG52YXIgbWF0Y2hlcyA9IGV4cG9ydHMubWF0Y2hlcyA9IGZ1bmN0aW9uKG5vZGUsIHNlbGVjdG9yKSB7XG5cdGlmIChfLmlzQXJyYXkoc2VsZWN0b3IpKSByZXR1cm4gc2VsZWN0b3Iuc29tZShmdW5jdGlvbihzKSB7XG5cdFx0cmV0dXJuIG1hdGNoZXMobm9kZSwgcyk7XG5cdH0pO1xuXG5cdGlmIChzZWxlY3RvciBpbnN0YW5jZW9mIHdpbmRvdy5Ob2RlKSB7XG5cdFx0cmV0dXJuIG5vZGUgPT09IHNlbGVjdG9yO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBzZWxlY3RvciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0cmV0dXJuICEhc2VsZWN0b3Iobm9kZSk7XG5cdH1cblxuXHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gd2luZG93Lk5vZGUuRUxFTUVOVF9OT0RFKSB7XG5cdFx0cmV0dXJuIHJlcXVpcmUoXCJtYXRjaGVzLXNlbGVjdG9yXCIpKG5vZGUsIHNlbGVjdG9yKTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn07XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xudmFyIFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIik7XG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcbnZhciBNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpO1xudmFyIFBsdWdpbnMgPSByZXF1aXJlKFwiLi9wbHVnaW5zXCIpO1xudmFyIERPTVJhbmdlID0gcmVxdWlyZShcIi4vZG9tcmFuZ2VcIik7XG52YXIgTk9ERV9UWVBFID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5cbnZhciBWaWV3ID1cbm1vZHVsZS5leHBvcnRzID0gRE9NUmFuZ2UuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdC8vIGZpcnN0IHdlIGNyZWF0ZSB0aGUgaW5pdGlhbCB2aWV3IHN0YXRlXG5cdFx0dmFyIHN0YXRlID0gXy5yZXN1bHQodGhpcywgXCJpbml0aWFsU3RhdGVcIikgfHwgXy5yZXN1bHQodGhpcywgXCJkZWZhdWx0c1wiKTtcblx0XHRpZiAodHlwZW9mIHN0YXRlICE9PSBcInVuZGVmaW5lZFwiKSB7XG5cdFx0XHRpZiAoIU1vZGVsLmlzTW9kZWwoc3RhdGUpKSB7XG5cdFx0XHRcdHN0YXRlID0gbmV3IE1vZGVsKHN0YXRlLCBudWxsLCBvcHRpb25zLnN0YXRlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2hvdmUgc3RhdGUgYmV0d2VlbiBjb250ZXh0c1xuXHRcdFx0aWYgKE1vZGVsLmlzTW9kZWwoZGF0YSkpIHtcblx0XHRcdFx0aWYgKGRhdGEucGFyZW50KSBkYXRhLnBhcmVudC5hcHBlbmQoc3RhdGUpO1xuXHRcdFx0XHRzdGF0ZS5hcHBlbmQoZGF0YSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFkZCB0byB0aGUgc3RhY2sgYmVmb3JlIHRoZSByZWFsIGRhdGFcblx0XHRcdHRoaXMuYWRkRGF0YShzdGF0ZSk7XG5cdFx0XHR0aGlzLnN0YXRlTW9kZWwgPSBzdGF0ZTtcblxuXHRcdFx0Ly8gc2V0dXAgZWFzeS1hY2Nlc3Mgc3RhdGUgcHJvcGVydHlcblx0XHRcdHN0YXRlLmRlZmluZURhdGFMaW5rKHRoaXMsIFwic3RhdGVcIik7XG5cdFx0fVxuXG5cdFx0Ly8gYWRkIHBhcnRpYWxzXG5cdFx0dGhpcy5fcGFydGlhbHMgPSB7fTtcblx0XHR0aGlzLl9jb21wb25lbnRzID0ge307XG5cdFx0dGhpcy5zZXRQYXJ0aWFsKF8uZXh0ZW5kKHt9LCBvcHRpb25zLnBhcnRpYWxzLCBfLnJlc3VsdCh0aGlzLCBcInBhcnRpYWxzXCIpKSk7XG5cblx0XHQvLyBzZXQgdGhlIHBhc3NlZCBpbiBkYXRhXG5cdFx0aWYgKHR5cGVvZiBkYXRhICE9PSBcInVuZGVmaW5lZFwiKSB0aGlzLmFkZERhdGEoZGF0YSwgb3B0aW9ucyk7XG5cblx0XHQvLyBpbml0aWF0ZSBsaWtlIGEgbm9ybWFsIGRvbSByYW5nZVxuXHRcdERPTVJhbmdlLmNhbGwodGhpcyk7XG5cblx0XHQvLyBpbml0aWFsaXplIHdpdGggb3B0aW9uc1xuXHRcdHRoaXMuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuXHR9LFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKCl7fSxcblxuXHR1c2U6IGZ1bmN0aW9uKHApIHtcblx0XHRyZXR1cm4gUGx1Z2lucy5sb2FkUGx1Z2luKHRoaXMsIHAsIF8udG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpKTtcblx0fSxcblxuXHQvLyBhZGRzIGRhdGEgdG8gdGhlIGN1cnJlbnQgc3RhY2tcblx0YWRkRGF0YTogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdGlmICghTW9kZWwuaXNNb2RlbChkYXRhKSkgZGF0YSA9IG5ldyBNb2RlbChkYXRhLCB0aGlzLm1vZGVsLCBvcHRpb25zKTtcblx0XHR0aGlzLm1vZGVsID0gZGF0YTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBhdHRhY2ggKyBtb3VudFxuXHRwYWludDogZnVuY3Rpb24ocCwgbiwgX2lzTW92ZSwgX2lzUmVwbGFjZSkge1xuXHRcdERPTVJhbmdlLnByb3RvdHlwZS5hdHRhY2guYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRpZiAoIShfaXNNb3ZlIHx8IF9pc1JlcGxhY2UgfHwgdGhpcy5jb21wKSkgdGhpcy5tb3VudCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGF1dG8gc3RvcCBvbiBkZXRhY2hcblx0ZGV0YWNoOiBmdW5jdGlvbihfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKCFfaXNSZXBsYWNlKSB0aGlzLnN0b3AoKTtcblx0XHRET01SYW5nZS5wcm90b3R5cGUuZGV0YWNoLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YXV0b3J1bjogZnVuY3Rpb24oZm4sIG9wdGlvbnMpIHtcblx0XHRyZXR1cm4gVHJhY2tyLmF1dG9ydW4oZm4sIG9wdGlvbnMsIHRoaXMpO1xuXHR9LFxuXG5cdC8vIGEgZ2VuZXJhbGl6ZWQgcmVhY3RpdmUgd29ya2Zsb3cgaGVscGVyXG5cdG1vdW50OiBmdW5jdGlvbigpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHQvLyBzdG9wIGV4aXN0aW5nIG1vdW50XG5cdFx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdFx0Ly8gdGhlIGZpcnN0IGV2ZW50IGluIHRoZSBjeWNsZSwgYmVmb3JlIGV2ZXJ5dGhpbmcgZWxzZVxuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnQ6YmVmb3JlXCIpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0Ly8gdGhlIGF1dG9ydW4gY29tcHV0YXRpb25cblx0XHR2YXIgY29tcCA9IHRoaXMuY29tcCA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwicmVuZGVyXCIsIGNvbXApO1xuXG5cdFx0XHQvLyBhdXRvIGNsZWFuIHVwXG5cdFx0XHRjb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdFx0Ly8gcmVtYWluaW5nIGludmFsaWRhdGUgZXZlbnRzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGVcIiwgY29tcCk7XG5cblx0XHRcdFx0Ly8gZGV0ZWN0IGlmIHRoZSBjb21wdXRhdGlvbiBzdG9wcGVkXG5cdFx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJzdG9wXCIsIGNvbXApO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLmNvbXA7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gcmVtYWluaW5nIG1vdW50IGV2ZW50cyBoYXBwZW4gYWZ0ZXIgdGhlIGZpcnN0IHJlbmRlclxuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHRoaXMudHJpZ2dlcihcIm1vdW50OmFmdGVyXCIsIGNvbXApO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVuZGVyOiBmdW5jdGlvbigpe30sXG5cblx0c3RvcDogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuY29tcCkgdGhpcy5jb21wLnN0b3AoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBzZXRzIHBhcnRpYWwgYnkgbmFtZVxuXHRzZXRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lLCBwYXJ0aWFsKSB7XG5cdFx0aWYgKF8uaXNPYmplY3QobmFtZSkgJiYgcGFydGlhbCA9PSBudWxsKSB7XG5cdFx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24ocCwgbikgeyB0aGlzLnNldFBhcnRpYWwobiwgcCk7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKCFfLmlzU3RyaW5nKG5hbWUpICYmIG5hbWUgIT09IFwiXCIpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgbm9uLWVtcHR5IHN0cmluZyBmb3IgcGFydGlhbCBuYW1lLlwiKTtcblxuXHRcdGlmIChwYXJ0aWFsICE9IG51bGwgJiYgIXV0aWxzLmlzU3ViQ2xhc3MoVmlldywgcGFydGlhbCkpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgVmlldyBzdWJjbGFzcyBvciBmdW5jdGlvbiBmb3IgcGFydGlhbC5cIik7XG5cblx0XHRpZiAocGFydGlhbCA9PSBudWxsKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fcGFydGlhbHNbbmFtZV07XG5cdFx0XHRwYXJ0aWFsID0gdm9pZCAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgcCA9IHRoaXMuX2dldFBhcnRpYWwobmFtZSk7XG5cdFx0XHRwLnZpZXcgPSBwYXJ0aWFsO1xuXHRcdFx0cC5kZXAuY2hhbmdlZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGVuc3VyZXMgYSBwYXJ0aWFsJ3MgZGVwZW5kZW5jeSBleGlzdHNcblx0X2dldFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRpZiAodGhpcy5fcGFydGlhbHNbbmFtZV0gPT0gbnVsbClcblx0XHRcdHRoaXMuX3BhcnRpYWxzW25hbWVdID0geyBkZXA6IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpIH07XG5cblx0XHRyZXR1cm4gdGhpcy5fcGFydGlhbHNbbmFtZV07XG5cdH0sXG5cblx0Ly8gbG9va3MgdGhyb3VnaCBwYXJlbnRzIGZvciBwYXJ0aWFsXG5cdGZpbmRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lLCBvcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cdFx0dmFyIGMgPSB0aGlzLCBwO1xuXG5cdFx0d2hpbGUgKGMgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGMuX2dldFBhcnRpYWwgIT0gbnVsbCkge1xuXHRcdFx0XHRwID0gYy5fZ2V0UGFydGlhbChuYW1lKTtcblx0XHRcdFx0cC5kZXAuZGVwZW5kKCk7XG5cdFx0XHRcdGlmIChvcHRpb25zLmxvY2FsIHx8IHAudmlldyAhPSBudWxsKSByZXR1cm4gcC52aWV3O1xuXHRcdFx0fVxuXG5cdFx0XHRjID0gYy5wYXJlbnRSYW5nZTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gZ2VuZXJhdGVzIGEgbmV3IGNvbXBvbmVudCBmcm9tIGEgVmlldyBzdWJjbGFzcyBvciBwYXJ0aWFsJ3MgbmFtZVxuXHRyZW5kZXJQYXJ0aWFsOiBmdW5jdGlvbihrbGFzcywgY3R4LCBvcHRpb25zKSB7XG5cdFx0dmFyIGNvbXBzLCBuYW1lO1xuXG5cdFx0Ly8gbG9vayB1cCBwYXJ0aWFsIHdpdGggdGVtcGxhdGUgb2JqZWN0XG5cdFx0aWYgKHR5cGVvZiBrbGFzcyA9PT0gXCJvYmplY3RcIiAmJiBrbGFzcy50eXBlID09PSBOT0RFX1RZUEUuUEFSVElBTCkge1xuXHRcdFx0bmFtZSA9IGtsYXNzLnZhbHVlO1xuXHRcdFx0a2xhc3MgPSB0aGlzLmZpbmRQYXJ0aWFsKG5hbWUsIHsgbG9jYWw6IGtsYXNzLmxvY2FsIH0pO1xuXHRcdH1cblxuXHRcdC8vIGxvb2sgdXAgdGhlIHBhcnRpYWwgYnkgbmFtZVxuXHRcdGlmICh0eXBlb2Yga2xhc3MgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdG5hbWUgPSBrbGFzcztcblx0XHRcdGtsYXNzID0gdGhpcy5maW5kUGFydGlhbChrbGFzcyk7XG5cdFx0fVxuXG5cdFx0Ly8gY2xhc3MgbXVzdCBiZSBhIHZpZXdcblx0XHRpZiAoIXV0aWxzLmlzU3ViQ2xhc3MoVmlldywga2xhc3MpKSByZXR1cm4gbnVsbDtcblxuXHRcdC8vIG5vcm1hbGl6ZSBjb250ZXh0XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIE1vZGVsKSBjdHggPSBjdHguYXBwZW5kKGN0eC5kYXRhKTtcblxuXHRcdC8vIGNyZWF0ZSBpdCBub24tcmVhY3RpdmVseVxuXHRcdHZhciBjb21wb25lbnQgPSBUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gbmV3IGtsYXNzKGN0eCwgb3B0aW9ucyk7XG5cdFx0fSk7XG5cblx0XHQvLyBhZGQgaXQgdG8gdGhlIGxpc3Rcblx0XHRpZiAobmFtZSkge1xuXHRcdFx0Y29tcHMgPSB0aGlzLl9jb21wb25lbnRzO1xuXHRcdFx0aWYgKGNvbXBzW25hbWVdID09IG51bGwpIGNvbXBzW25hbWVdID0gW107XG5cdFx0XHRjb21wc1tuYW1lXS5wdXNoKGNvbXBvbmVudCk7XG5cblx0XHRcdC8vIGF1dG8gcmVtb3ZlIHdoZW4gdGhlIHBhcnRpYWwgaXMgXCJzdG9wcGVkXCJcblx0XHRcdGNvbXBvbmVudC5vbmNlKFwic3RvcFwiLCBmdW5jdGlvbigpIHtcblx0XHRcdFx0Y29tcHNbbmFtZV0gPSBfLndpdGhvdXQoY29tcHNbbmFtZV0sIGNvbXBvbmVudCk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcG9uZW50O1xuXHR9LFxuXG5cdC8vIHJldHVybnMgZmlyc3QgcmVuZGVyZWQgcGFydGlhbCBieSBuYW1lXG5cdGdldENvbXBvbmVudDogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBjb21wcywgY29tcCwgcmVzLCBuLCBpO1xuXG5cdFx0Y29tcHMgPSB0aGlzLl9jb21wb25lbnRzO1xuXHRcdGlmIChjb21wc1tuYW1lXSAhPSBudWxsICYmIGNvbXBzW25hbWVdLmxlbmd0aCkgcmV0dXJuIGNvbXBzW25hbWVdWzBdO1xuXG5cdFx0Zm9yIChuIGluIGNvbXBzKSB7XG5cdFx0XHRmb3IgKGkgaW4gY29tcHNbbl0pIHtcblx0XHRcdFx0Y29tcCA9IGNvbXBzW25dW2ldO1xuXHRcdFx0XHRpZiAoIShjb21wIGluc3RhbmNlb2YgVmlldykpIGNvbnRpbnVlO1xuXHRcdFx0XHRyZXMgPSBjb21wLmdldENvbXBvbmVudChuYW1lKTtcblx0XHRcdFx0aWYgKHJlcyAhPSBudWxsKSByZXR1cm4gcmVzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdC8vIHJldHVybnMgYWxsIHJlbmRlcmVkIHBhcnRpYWxzIGJ5IG5hbWVcblx0Z2V0Q29tcG9uZW50czogZnVuY3Rpb24obmFtZSkge1xuXHRcdGlmIChuYW1lID09IG51bGwpIHJldHVybiBfLmZsYXR0ZW4oXy52YWx1ZXModGhpcy5fY29tcG9uZW50cykpO1xuXG5cdFx0cmV0dXJuIF8ucmVkdWNlKHRoaXMuX2NvbXBvbmVudHMsIGZ1bmN0aW9uKG0sIGNvbXBzLCBuKSB7XG5cdFx0XHRpZiAobiA9PT0gbmFtZSkgbS5wdXNoLmFwcGx5KG0sIGNvbXBzKTtcblxuXHRcdFx0Y29tcHMuZm9yRWFjaChmdW5jdGlvbihjKSB7XG5cdFx0XHRcdGlmIChjIGluc3RhbmNlb2YgVmlldykgbS5wdXNoLmFwcGx5KG0sIGMuZ2V0Q29tcG9uZW50cyhuYW1lKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0cmV0dXJuIG07XG5cdFx0fSwgW10pO1xuXHR9LFxuXG5cdC8vIHJldHVybnMgcmVuZGVyZWQgcGFydGlhbHMsIHNlYXJjaGluZyBjaGlsZHJlbiB2aWV3c1xuXHRmaW5kQ29tcG9uZW50czogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciB0cGxzID0gWyB0aGlzIF0sXG5cdFx0XHRjb21wcyA9IFtdLFxuXHRcdFx0dHBsO1xuXG5cdFx0d2hpbGUgKHRwbHMubGVuZ3RoKSB7XG5cdFx0XHR0cGwgPSB0cGxzLnNoaWZ0KCk7XG5cdFx0XHRjb21wcyA9IGNvbXBzLmNvbmNhdCh0cGwuZ2V0Q29tcG9uZW50cyhuYW1lKSk7XG5cdFx0XHR0cGxzLnB1c2godHBsLmdldENvbXBvbmVudHMoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXBzO1xuXHR9LFxuXG5cdC8vIHJldHVybnMgcmVuZGVyZWQgcGFydGlhbHMsIHNlYXJjaGluZyBjaGlsZHJlbiB2aWV3c1xuXHRmaW5kQ29tcG9uZW50OiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIHRwbHMgPSBbIHRoaXMgXSxcblx0XHRcdHRwbCwgY29tcDtcblxuXHRcdHdoaWxlICh0cGxzLmxlbmd0aCkge1xuXHRcdFx0dHBsID0gdHBscy5zaGlmdCgpO1xuXHRcdFx0Y29tcCA9IHRwbC5nZXRDb21wb25lbnQobmFtZSk7XG5cdFx0XHRpZiAoY29tcCkgcmV0dXJuIGNvbXA7XG5cdFx0XHR0cGxzID0gdHBscy5jb25jYXQodHBsLmdldENvbXBvbmVudHMoKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxufSk7XG5cbi8vIHF1aWNrIGFjY2VzcyB0byB0aGUgdG9wIG1vZGVsIGRhdGFcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShWaWV3LnByb3RvdHlwZSwgXCJkYXRhXCIsIHtcblx0Y29uZmlndXJhYmxlOiB0cnVlLFxuXHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMubW9kZWwuX2RlcC5kZXBlbmQoKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5kYXRhO1xuXHR9LFxuXHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdHRoaXMubW9kZWwuc2V0KHZhbCk7XG5cdH1cbn0pO1xuXG4vLyBjaGFpbmFibGUgbWV0aG9kcyB0byBwcm94eSB0byBtb2RlbFxuWyBcInNldFwiLCBcInJlZ2lzdGVyUHJveHlcIiBdXG4uZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcblx0Vmlldy5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMubW9kZWxbbWV0aG9kXS5hcHBseSh0aGlzLm1vZGVsLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xufSk7XG5cbi8vIG1ldGhvZHMgdG8gcHJveHkgdG8gbW9kZWwgd2hpY2ggZG9uJ3QgcmV0dXJuIHRoaXNcblsgXCJnZXRcIiwgXCJnZXRMb2NhbFwiLCBcImdldFByb3h5QnlWYWx1ZVwiLCBcImdldE1vZGVsQXRPZmZzZXRcIixcbiAgXCJnZXRSb290TW9kZWxcIiwgXCJmaW5kTW9kZWxcIiwgXCJnZXRBbGxNb2RlbHNcIlxuXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuXHRWaWV3LnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWxbbWV0aG9kXS5hcHBseSh0aGlzLm1vZGVsLCBhcmd1bWVudHMpO1xuXHR9O1xufSk7XG5cbi8vIHByb3h5IGEgZmV3IGNvbXB1dGF0aW9uIG1ldGhvZHNcblsgXCJpbnZhbGlkYXRlXCIsIFwib25JbnZhbGlkYXRlXCIgXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuXHRWaWV3LnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCF0aGlzLmNvbXApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBydW4gXCIgKyBtZXRob2QgKyBcIigpLiBUaGlzIHZpZXcgaXMgbm90IG1vdW50ZWQuXCIpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29tcFttZXRob2RdLmFwcGx5KHRoaXMuY29tcCwgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcbn0pO1xuIiwiLyoqXG4gKiBTdGFuZGFsb25lIGV4dHJhY3Rpb24gb2YgQmFja2JvbmUuRXZlbnRzLCBubyBleHRlcm5hbCBkZXBlbmRlbmN5IHJlcXVpcmVkLlxuICogRGVncmFkZXMgbmljZWx5IHdoZW4gQmFja29uZS91bmRlcnNjb3JlIGFyZSBhbHJlYWR5IGF2YWlsYWJsZSBpbiB0aGUgY3VycmVudFxuICogZ2xvYmFsIGNvbnRleHQuXG4gKlxuICogTm90ZSB0aGF0IGRvY3Mgc3VnZ2VzdCB0byB1c2UgdW5kZXJzY29yZSdzIGBfLmV4dGVuZCgpYCBtZXRob2QgdG8gYWRkIEV2ZW50c1xuICogc3VwcG9ydCB0byBzb21lIGdpdmVuIG9iamVjdC4gQSBgbWl4aW4oKWAgbWV0aG9kIGhhcyBiZWVuIGFkZGVkIHRvIHRoZSBFdmVudHNcbiAqIHByb3RvdHlwZSB0byBhdm9pZCB1c2luZyB1bmRlcnNjb3JlIGZvciB0aGF0IHNvbGUgcHVycG9zZTpcbiAqXG4gKiAgICAgdmFyIG15RXZlbnRFbWl0dGVyID0gQmFja2JvbmVFdmVudHMubWl4aW4oe30pO1xuICpcbiAqIE9yIGZvciBhIGZ1bmN0aW9uIGNvbnN0cnVjdG9yOlxuICpcbiAqICAgICBmdW5jdGlvbiBNeUNvbnN0cnVjdG9yKCl7fVxuICogICAgIE15Q29uc3RydWN0b3IucHJvdG90eXBlLmZvbyA9IGZ1bmN0aW9uKCl7fVxuICogICAgIEJhY2tib25lRXZlbnRzLm1peGluKE15Q29uc3RydWN0b3IucHJvdG90eXBlKTtcbiAqXG4gKiAoYykgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBJbmMuXG4gKiAoYykgMjAxMyBOaWNvbGFzIFBlcnJpYXVsdFxuICovXG4vKiBnbG9iYWwgZXhwb3J0czp0cnVlLCBkZWZpbmUsIG1vZHVsZSAqL1xuKGZ1bmN0aW9uKCkge1xuICB2YXIgcm9vdCA9IHRoaXMsXG4gICAgICBuYXRpdmVGb3JFYWNoID0gQXJyYXkucHJvdG90eXBlLmZvckVhY2gsXG4gICAgICBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHksXG4gICAgICBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZSxcbiAgICAgIGlkQ291bnRlciA9IDA7XG5cbiAgLy8gUmV0dXJucyBhIHBhcnRpYWwgaW1wbGVtZW50YXRpb24gbWF0Y2hpbmcgdGhlIG1pbmltYWwgQVBJIHN1YnNldCByZXF1aXJlZFxuICAvLyBieSBCYWNrYm9uZS5FdmVudHNcbiAgZnVuY3Rpb24gbWluaXNjb3JlKCkge1xuICAgIHJldHVybiB7XG4gICAgICBrZXlzOiBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiICYmIHR5cGVvZiBvYmogIT09IFwiZnVuY3Rpb25cIiB8fCBvYmogPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwia2V5cygpIGNhbGxlZCBvbiBhIG5vbi1vYmplY3RcIik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGtleSwga2V5cyA9IFtdO1xuICAgICAgICBmb3IgKGtleSBpbiBvYmopIHtcbiAgICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgIGtleXNba2V5cy5sZW5ndGhdID0ga2V5O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ga2V5cztcbiAgICAgIH0sXG5cbiAgICAgIHVuaXF1ZUlkOiBmdW5jdGlvbihwcmVmaXgpIHtcbiAgICAgICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICAgICAgcmV0dXJuIHByZWZpeCA/IHByZWZpeCArIGlkIDogaWQ7XG4gICAgICB9LFxuXG4gICAgICBoYXM6IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgICAgIHJldHVybiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgICAgIH0sXG5cbiAgICAgIGVhY2g6IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICAgICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm47XG4gICAgICAgIGlmIChuYXRpdmVGb3JFYWNoICYmIG9iai5mb3JFYWNoID09PSBuYXRpdmVGb3JFYWNoKSB7XG4gICAgICAgICAgb2JqLmZvckVhY2goaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgICAgICB9IGVsc2UgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSB7XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBvYmoubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtpXSwgaSwgb2JqKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICAgICAgaWYgKHRoaXMuaGFzKG9iaiwga2V5KSkge1xuICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBvbmNlOiBmdW5jdGlvbihmdW5jKSB7XG4gICAgICAgIHZhciByYW4gPSBmYWxzZSwgbWVtbztcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGlmIChyYW4pIHJldHVybiBtZW1vO1xuICAgICAgICAgIHJhbiA9IHRydWU7XG4gICAgICAgICAgbWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICBmdW5jID0gbnVsbDtcbiAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgdmFyIF8gPSBtaW5pc2NvcmUoKSwgRXZlbnRzO1xuXG4gIC8vIEJhY2tib25lLkV2ZW50c1xuICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAvLyBBIG1vZHVsZSB0aGF0IGNhbiBiZSBtaXhlZCBpbiB0byAqYW55IG9iamVjdCogaW4gb3JkZXIgdG8gcHJvdmlkZSBpdCB3aXRoXG4gIC8vIGN1c3RvbSBldmVudHMuIFlvdSBtYXkgYmluZCB3aXRoIGBvbmAgb3IgcmVtb3ZlIHdpdGggYG9mZmAgY2FsbGJhY2tcbiAgLy8gZnVuY3Rpb25zIHRvIGFuIGV2ZW50OyBgdHJpZ2dlcmAtaW5nIGFuIGV2ZW50IGZpcmVzIGFsbCBjYWxsYmFja3MgaW5cbiAgLy8gc3VjY2Vzc2lvbi5cbiAgLy9cbiAgLy8gICAgIHZhciBvYmplY3QgPSB7fTtcbiAgLy8gICAgIF8uZXh0ZW5kKG9iamVjdCwgQmFja2JvbmUuRXZlbnRzKTtcbiAgLy8gICAgIG9iamVjdC5vbignZXhwYW5kJywgZnVuY3Rpb24oKXsgYWxlcnQoJ2V4cGFuZGVkJyk7IH0pO1xuICAvLyAgICAgb2JqZWN0LnRyaWdnZXIoJ2V4cGFuZCcpO1xuICAvL1xuICBFdmVudHMgPSB7XG5cbiAgICAvLyBCaW5kIGFuIGV2ZW50IHRvIGEgYGNhbGxiYWNrYCBmdW5jdGlvbi4gUGFzc2luZyBgXCJhbGxcImAgd2lsbCBiaW5kXG4gICAgLy8gdGhlIGNhbGxiYWNrIHRvIGFsbCBldmVudHMgZmlyZWQuXG4gICAgb246IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgICBpZiAoIWV2ZW50c0FwaSh0aGlzLCAnb24nLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSB8fCAhY2FsbGJhY2spIHJldHVybiB0aGlzO1xuICAgICAgdGhpcy5fZXZlbnRzIHx8ICh0aGlzLl9ldmVudHMgPSB7fSk7XG4gICAgICB2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdIHx8ICh0aGlzLl9ldmVudHNbbmFtZV0gPSBbXSk7XG4gICAgICBldmVudHMucHVzaCh7Y2FsbGJhY2s6IGNhbGxiYWNrLCBjb250ZXh0OiBjb250ZXh0LCBjdHg6IGNvbnRleHQgfHwgdGhpc30pO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8vIEJpbmQgYW4gZXZlbnQgdG8gb25seSBiZSB0cmlnZ2VyZWQgYSBzaW5nbGUgdGltZS4gQWZ0ZXIgdGhlIGZpcnN0IHRpbWVcbiAgICAvLyB0aGUgY2FsbGJhY2sgaXMgaW52b2tlZCwgaXQgd2lsbCBiZSByZW1vdmVkLlxuICAgIG9uY2U6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgICBpZiAoIWV2ZW50c0FwaSh0aGlzLCAnb25jZScsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICB2YXIgb25jZSA9IF8ub25jZShmdW5jdGlvbigpIHtcbiAgICAgICAgc2VsZi5vZmYobmFtZSwgb25jZSk7XG4gICAgICAgIGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9KTtcbiAgICAgIG9uY2UuX2NhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICByZXR1cm4gdGhpcy5vbihuYW1lLCBvbmNlLCBjb250ZXh0KTtcbiAgICB9LFxuXG4gICAgLy8gUmVtb3ZlIG9uZSBvciBtYW55IGNhbGxiYWNrcy4gSWYgYGNvbnRleHRgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG4gICAgLy8gY2FsbGJhY2tzIHdpdGggdGhhdCBmdW5jdGlvbi4gSWYgYGNhbGxiYWNrYCBpcyBudWxsLCByZW1vdmVzIGFsbFxuICAgIC8vIGNhbGxiYWNrcyBmb3IgdGhlIGV2ZW50LiBJZiBgbmFtZWAgaXMgbnVsbCwgcmVtb3ZlcyBhbGwgYm91bmRcbiAgICAvLyBjYWxsYmFja3MgZm9yIGFsbCBldmVudHMuXG4gICAgb2ZmOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgICAgdmFyIHJldGFpbiwgZXYsIGV2ZW50cywgbmFtZXMsIGksIGwsIGosIGs7XG4gICAgICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhZXZlbnRzQXBpKHRoaXMsICdvZmYnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSkgcmV0dXJuIHRoaXM7XG4gICAgICBpZiAoIW5hbWUgJiYgIWNhbGxiYWNrICYmICFjb250ZXh0KSB7XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgbmFtZXMgPSBuYW1lID8gW25hbWVdIDogXy5rZXlzKHRoaXMuX2V2ZW50cyk7XG4gICAgICBmb3IgKGkgPSAwLCBsID0gbmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIG5hbWUgPSBuYW1lc1tpXTtcbiAgICAgICAgaWYgKGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSkge1xuICAgICAgICAgIHRoaXMuX2V2ZW50c1tuYW1lXSA9IHJldGFpbiA9IFtdO1xuICAgICAgICAgIGlmIChjYWxsYmFjayB8fCBjb250ZXh0KSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwLCBrID0gZXZlbnRzLmxlbmd0aDsgaiA8IGs7IGorKykge1xuICAgICAgICAgICAgICBldiA9IGV2ZW50c1tqXTtcbiAgICAgICAgICAgICAgaWYgKChjYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2sgJiYgY2FsbGJhY2sgIT09IGV2LmNhbGxiYWNrLl9jYWxsYmFjaykgfHxcbiAgICAgICAgICAgICAgICAgIChjb250ZXh0ICYmIGNvbnRleHQgIT09IGV2LmNvbnRleHQpKSB7XG4gICAgICAgICAgICAgICAgcmV0YWluLnB1c2goZXYpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcmV0YWluLmxlbmd0aCkgZGVsZXRlIHRoaXMuX2V2ZW50c1tuYW1lXTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLy8gVHJpZ2dlciBvbmUgb3IgbWFueSBldmVudHMsIGZpcmluZyBhbGwgYm91bmQgY2FsbGJhY2tzLiBDYWxsYmFja3MgYXJlXG4gICAgLy8gcGFzc2VkIHRoZSBzYW1lIGFyZ3VtZW50cyBhcyBgdHJpZ2dlcmAgaXMsIGFwYXJ0IGZyb20gdGhlIGV2ZW50IG5hbWVcbiAgICAvLyAodW5sZXNzIHlvdSdyZSBsaXN0ZW5pbmcgb24gYFwiYWxsXCJgLCB3aGljaCB3aWxsIGNhdXNlIHlvdXIgY2FsbGJhY2sgdG9cbiAgICAvLyByZWNlaXZlIHRoZSB0cnVlIG5hbWUgb2YgdGhlIGV2ZW50IGFzIHRoZSBmaXJzdCBhcmd1bWVudCkuXG4gICAgdHJpZ2dlcjogZnVuY3Rpb24obmFtZSkge1xuICAgICAgaWYgKCF0aGlzLl9ldmVudHMpIHJldHVybiB0aGlzO1xuICAgICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICBpZiAoIWV2ZW50c0FwaSh0aGlzLCAndHJpZ2dlcicsIG5hbWUsIGFyZ3MpKSByZXR1cm4gdGhpcztcbiAgICAgIHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV07XG4gICAgICB2YXIgYWxsRXZlbnRzID0gdGhpcy5fZXZlbnRzLmFsbDtcbiAgICAgIGlmIChldmVudHMpIHRyaWdnZXJFdmVudHMoZXZlbnRzLCBhcmdzKTtcbiAgICAgIGlmIChhbGxFdmVudHMpIHRyaWdnZXJFdmVudHMoYWxsRXZlbnRzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8vIFRlbGwgdGhpcyBvYmplY3QgdG8gc3RvcCBsaXN0ZW5pbmcgdG8gZWl0aGVyIHNwZWNpZmljIGV2ZW50cyAuLi4gb3JcbiAgICAvLyB0byBldmVyeSBvYmplY3QgaXQncyBjdXJyZW50bHkgbGlzdGVuaW5nIHRvLlxuICAgIHN0b3BMaXN0ZW5pbmc6IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcbiAgICAgIHZhciBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnM7XG4gICAgICBpZiAoIWxpc3RlbmVycykgcmV0dXJuIHRoaXM7XG4gICAgICB2YXIgZGVsZXRlTGlzdGVuZXIgPSAhbmFtZSAmJiAhY2FsbGJhY2s7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG4gICAgICBpZiAob2JqKSAobGlzdGVuZXJzID0ge30pW29iai5fbGlzdGVuZXJJZF0gPSBvYmo7XG4gICAgICBmb3IgKHZhciBpZCBpbiBsaXN0ZW5lcnMpIHtcbiAgICAgICAgbGlzdGVuZXJzW2lkXS5vZmYobmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuICAgICAgICBpZiAoZGVsZXRlTGlzdGVuZXIpIGRlbGV0ZSB0aGlzLl9saXN0ZW5lcnNbaWRdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gIH07XG5cbiAgLy8gUmVndWxhciBleHByZXNzaW9uIHVzZWQgdG8gc3BsaXQgZXZlbnQgc3RyaW5ncy5cbiAgdmFyIGV2ZW50U3BsaXR0ZXIgPSAvXFxzKy87XG5cbiAgLy8gSW1wbGVtZW50IGZhbmN5IGZlYXR1cmVzIG9mIHRoZSBFdmVudHMgQVBJIHN1Y2ggYXMgbXVsdGlwbGUgZXZlbnRcbiAgLy8gbmFtZXMgYFwiY2hhbmdlIGJsdXJcImAgYW5kIGpRdWVyeS1zdHlsZSBldmVudCBtYXBzIGB7Y2hhbmdlOiBhY3Rpb259YFxuICAvLyBpbiB0ZXJtcyBvZiB0aGUgZXhpc3RpbmcgQVBJLlxuICB2YXIgZXZlbnRzQXBpID0gZnVuY3Rpb24ob2JqLCBhY3Rpb24sIG5hbWUsIHJlc3QpIHtcbiAgICBpZiAoIW5hbWUpIHJldHVybiB0cnVlO1xuXG4gICAgLy8gSGFuZGxlIGV2ZW50IG1hcHMuXG4gICAgaWYgKHR5cGVvZiBuYW1lID09PSAnb2JqZWN0Jykge1xuICAgICAgZm9yICh2YXIga2V5IGluIG5hbWUpIHtcbiAgICAgICAgb2JqW2FjdGlvbl0uYXBwbHkob2JqLCBba2V5LCBuYW1lW2tleV1dLmNvbmNhdChyZXN0KSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHNwYWNlIHNlcGFyYXRlZCBldmVudCBuYW1lcy5cbiAgICBpZiAoZXZlbnRTcGxpdHRlci50ZXN0KG5hbWUpKSB7XG4gICAgICB2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KGV2ZW50U3BsaXR0ZXIpO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgb2JqW2FjdGlvbl0uYXBwbHkob2JqLCBbbmFtZXNbaV1dLmNvbmNhdChyZXN0KSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gQSBkaWZmaWN1bHQtdG8tYmVsaWV2ZSwgYnV0IG9wdGltaXplZCBpbnRlcm5hbCBkaXNwYXRjaCBmdW5jdGlvbiBmb3JcbiAgLy8gdHJpZ2dlcmluZyBldmVudHMuIFRyaWVzIHRvIGtlZXAgdGhlIHVzdWFsIGNhc2VzIHNwZWVkeSAobW9zdCBpbnRlcm5hbFxuICAvLyBCYWNrYm9uZSBldmVudHMgaGF2ZSAzIGFyZ3VtZW50cykuXG4gIHZhciB0cmlnZ2VyRXZlbnRzID0gZnVuY3Rpb24oZXZlbnRzLCBhcmdzKSB7XG4gICAgdmFyIGV2LCBpID0gLTEsIGwgPSBldmVudHMubGVuZ3RoLCBhMSA9IGFyZ3NbMF0sIGEyID0gYXJnc1sxXSwgYTMgPSBhcmdzWzJdO1xuICAgIHN3aXRjaCAoYXJncy5sZW5ndGgpIHtcbiAgICAgIGNhc2UgMDogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgpOyByZXR1cm47XG4gICAgICBjYXNlIDE6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSk7IHJldHVybjtcbiAgICAgIGNhc2UgMjogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMik7IHJldHVybjtcbiAgICAgIGNhc2UgMzogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMiwgYTMpOyByZXR1cm47XG4gICAgICBkZWZhdWx0OiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5hcHBseShldi5jdHgsIGFyZ3MpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgbGlzdGVuTWV0aG9kcyA9IHtsaXN0ZW5UbzogJ29uJywgbGlzdGVuVG9PbmNlOiAnb25jZSd9O1xuXG4gIC8vIEludmVyc2lvbi1vZi1jb250cm9sIHZlcnNpb25zIG9mIGBvbmAgYW5kIGBvbmNlYC4gVGVsbCAqdGhpcyogb2JqZWN0IHRvXG4gIC8vIGxpc3RlbiB0byBhbiBldmVudCBpbiBhbm90aGVyIG9iamVjdCAuLi4ga2VlcGluZyB0cmFjayBvZiB3aGF0IGl0J3NcbiAgLy8gbGlzdGVuaW5nIHRvLlxuICBfLmVhY2gobGlzdGVuTWV0aG9kcywgZnVuY3Rpb24oaW1wbGVtZW50YXRpb24sIG1ldGhvZCkge1xuICAgIEV2ZW50c1ttZXRob2RdID0gZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuICAgICAgdmFyIGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycyB8fCAodGhpcy5fbGlzdGVuZXJzID0ge30pO1xuICAgICAgdmFyIGlkID0gb2JqLl9saXN0ZW5lcklkIHx8IChvYmouX2xpc3RlbmVySWQgPSBfLnVuaXF1ZUlkKCdsJykpO1xuICAgICAgbGlzdGVuZXJzW2lkXSA9IG9iajtcbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcbiAgICAgIG9ialtpbXBsZW1lbnRhdGlvbl0obmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gQWxpYXNlcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gIEV2ZW50cy5iaW5kICAgPSBFdmVudHMub247XG4gIEV2ZW50cy51bmJpbmQgPSBFdmVudHMub2ZmO1xuXG4gIC8vIE1peGluIHV0aWxpdHlcbiAgRXZlbnRzLm1peGluID0gZnVuY3Rpb24ocHJvdG8pIHtcbiAgICB2YXIgZXhwb3J0cyA9IFsnb24nLCAnb25jZScsICdvZmYnLCAndHJpZ2dlcicsICdzdG9wTGlzdGVuaW5nJywgJ2xpc3RlblRvJyxcbiAgICAgICAgICAgICAgICAgICAnbGlzdGVuVG9PbmNlJywgJ2JpbmQnLCAndW5iaW5kJ107XG4gICAgXy5lYWNoKGV4cG9ydHMsIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHByb3RvW25hbWVdID0gdGhpc1tuYW1lXTtcbiAgICB9LCB0aGlzKTtcbiAgICByZXR1cm4gcHJvdG87XG4gIH07XG5cbiAgLy8gRXhwb3J0IEV2ZW50cyBhcyBCYWNrYm9uZUV2ZW50cyBkZXBlbmRpbmcgb24gY3VycmVudCBjb250ZXh0XG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEV2ZW50cztcbiAgICB9XG4gICAgZXhwb3J0cy5CYWNrYm9uZUV2ZW50cyA9IEV2ZW50cztcbiAgfWVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAgJiYgdHlwZW9mIGRlZmluZS5hbWQgPT0gXCJvYmplY3RcIikge1xuICAgIGRlZmluZShmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBFdmVudHM7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5CYWNrYm9uZUV2ZW50cyA9IEV2ZW50cztcbiAgfVxufSkodGhpcyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vYmFja2JvbmUtZXZlbnRzLXN0YW5kYWxvbmUnKTtcbiIsIihmdW5jdGlvbiAoZGVmaW5pdGlvbikge1xuICBpZiAodHlwZW9mIGV4cG9ydHMgPT09IFwib2JqZWN0XCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGRlZmluaXRpb24oKTtcbiAgfVxuICBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoZGVmaW5pdGlvbik7XG4gIH1cbiAgZWxzZSB7XG4gICAgd2luZG93LkJhY2tib25lRXh0ZW5kID0gZGVmaW5pdGlvbigpO1xuICB9XG59KShmdW5jdGlvbiAoKSB7XG4gIFwidXNlIHN0cmljdFwiO1xuICBcbiAgLy8gbWluaS11bmRlcnNjb3JlXG4gIHZhciBfID0ge1xuICAgIGhhczogZnVuY3Rpb24gKG9iaiwga2V5KSB7XG4gICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgICB9LFxuICBcbiAgICBleHRlbmQ6IGZ1bmN0aW9uKG9iaikge1xuICAgICAgZm9yICh2YXIgaT0xOyBpPGFyZ3VtZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgIG9ialtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuICB9O1xuXG4gIC8vLyBGb2xsb3dpbmcgY29kZSBpcyBwYXN0ZWQgZnJvbSBCYWNrYm9uZS5qcyAvLy9cblxuICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY29ycmVjdGx5IHNldCB1cCB0aGUgcHJvdG90eXBlIGNoYWluLCBmb3Igc3ViY2xhc3Nlcy5cbiAgLy8gU2ltaWxhciB0byBgZ29vZy5pbmhlcml0c2AsIGJ1dCB1c2VzIGEgaGFzaCBvZiBwcm90b3R5cGUgcHJvcGVydGllcyBhbmRcbiAgLy8gY2xhc3MgcHJvcGVydGllcyB0byBiZSBleHRlbmRlZC5cbiAgdmFyIGV4dGVuZCA9IGZ1bmN0aW9uKHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7XG4gICAgdmFyIHBhcmVudCA9IHRoaXM7XG4gICAgdmFyIGNoaWxkO1xuXG4gICAgLy8gVGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIGZvciB0aGUgbmV3IHN1YmNsYXNzIGlzIGVpdGhlciBkZWZpbmVkIGJ5IHlvdVxuICAgIC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuICAgIC8vIGJ5IHVzIHRvIHNpbXBseSBjYWxsIHRoZSBwYXJlbnQncyBjb25zdHJ1Y3Rvci5cbiAgICBpZiAocHJvdG9Qcm9wcyAmJiBfLmhhcyhwcm90b1Byb3BzLCAnY29uc3RydWN0b3InKSkge1xuICAgICAgY2hpbGQgPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuICAgIH0gZWxzZSB7XG4gICAgICBjaGlsZCA9IGZ1bmN0aW9uKCl7IHJldHVybiBwYXJlbnQuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfTtcbiAgICB9XG5cbiAgICAvLyBBZGQgc3RhdGljIHByb3BlcnRpZXMgdG8gdGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLCBpZiBzdXBwbGllZC5cbiAgICBfLmV4dGVuZChjaGlsZCwgcGFyZW50LCBzdGF0aWNQcm9wcyk7XG5cbiAgICAvLyBTZXQgdGhlIHByb3RvdHlwZSBjaGFpbiB0byBpbmhlcml0IGZyb20gYHBhcmVudGAsIHdpdGhvdXQgY2FsbGluZ1xuICAgIC8vIGBwYXJlbnRgJ3MgY29uc3RydWN0b3IgZnVuY3Rpb24uXG4gICAgdmFyIFN1cnJvZ2F0ZSA9IGZ1bmN0aW9uKCl7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfTtcbiAgICBTdXJyb2dhdGUucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcbiAgICBjaGlsZC5wcm90b3R5cGUgPSBuZXcgU3Vycm9nYXRlKCk7XG5cbiAgICAvLyBBZGQgcHJvdG90eXBlIHByb3BlcnRpZXMgKGluc3RhbmNlIHByb3BlcnRpZXMpIHRvIHRoZSBzdWJjbGFzcyxcbiAgICAvLyBpZiBzdXBwbGllZC5cbiAgICBpZiAocHJvdG9Qcm9wcykgXy5leHRlbmQoY2hpbGQucHJvdG90eXBlLCBwcm90b1Byb3BzKTtcblxuICAgIC8vIFNldCBhIGNvbnZlbmllbmNlIHByb3BlcnR5IGluIGNhc2UgdGhlIHBhcmVudCdzIHByb3RvdHlwZSBpcyBuZWVkZWRcbiAgICAvLyBsYXRlci5cbiAgICBjaGlsZC5fX3N1cGVyX18gPSBwYXJlbnQucHJvdG90eXBlO1xuXG4gICAgcmV0dXJuIGNoaWxkO1xuICB9O1xuXG4gIC8vIEV4cG9zZSB0aGUgZXh0ZW5kIGZ1bmN0aW9uXG4gIHJldHVybiBleHRlbmQ7XG59KTtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xudmFyIGN1cnJlbnRRdWV1ZTtcbnZhciBxdWV1ZUluZGV4ID0gLTE7XG5cbmZ1bmN0aW9uIGNsZWFuVXBOZXh0VGljaygpIHtcbiAgICBkcmFpbmluZyA9IGZhbHNlO1xuICAgIGlmIChjdXJyZW50UXVldWUubGVuZ3RoKSB7XG4gICAgICAgIHF1ZXVlID0gY3VycmVudFF1ZXVlLmNvbmNhdChxdWV1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgIH1cbiAgICBpZiAocXVldWUubGVuZ3RoKSB7XG4gICAgICAgIGRyYWluUXVldWUoKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGNsZWFuVXBOZXh0VGljayk7XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuXG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHdoaWxlICgrK3F1ZXVlSW5kZXggPCBsZW4pIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50UXVldWUpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50UXVldWVbcXVldWVJbmRleF0ucnVuKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcXVldWVJbmRleCA9IC0xO1xuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGN1cnJlbnRRdWV1ZSA9IG51bGw7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG59XG5cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgdmFyIGFyZ3MgPSBuZXcgQXJyYXkoYXJndW1lbnRzLmxlbmd0aCAtIDEpO1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMTsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcXVldWUucHVzaChuZXcgSXRlbShmdW4sIGFyZ3MpKTtcbiAgICBpZiAocXVldWUubGVuZ3RoID09PSAxICYmICFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5wcm9jZXNzLnVtYXNrID0gZnVuY3Rpb24oKSB7IHJldHVybiAwOyB9O1xuIiwiLyohXG4gKiBpcy1wbGFpbi1vYmplY3QgPGh0dHBzOi8vZ2l0aHViLmNvbS9qb25zY2hsaW5rZXJ0L2lzLXBsYWluLW9iamVjdD5cbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNSwgSm9uIFNjaGxpbmtlcnQuXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCdpc29iamVjdCcpO1xuXG5mdW5jdGlvbiBpc09iamVjdE9iamVjdChvKSB7XG4gIHJldHVybiBpc09iamVjdChvKSA9PT0gdHJ1ZVxuICAgICYmIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKSA9PT0gJ1tvYmplY3QgT2JqZWN0XSc7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNQbGFpbk9iamVjdChvKSB7XG4gIHZhciBjdG9yLHByb3Q7XG4gIFxuICBpZiAoaXNPYmplY3RPYmplY3QobykgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIFxuICAvLyBJZiBoYXMgbW9kaWZpZWQgY29uc3RydWN0b3JcbiAgY3RvciA9IG8uY29uc3RydWN0b3I7XG4gIGlmICh0eXBlb2YgY3RvciAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGZhbHNlO1xuICBcbiAgLy8gSWYgaGFzIG1vZGlmaWVkIHByb3RvdHlwZVxuICBwcm90ID0gY3Rvci5wcm90b3R5cGU7XG4gIGlmIChpc09iamVjdE9iamVjdChwcm90KSA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgXG4gIC8vIElmIGNvbnN0cnVjdG9yIGRvZXMgbm90IGhhdmUgYW4gT2JqZWN0LXNwZWNpZmljIG1ldGhvZFxuICBpZiAocHJvdC5oYXNPd25Qcm9wZXJ0eSgnaXNQcm90b3R5cGVPZicpID09PSBmYWxzZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBcbiAgLy8gTW9zdCBsaWtlbHkgYSBwbGFpbiBPYmplY3RcbiAgcmV0dXJuIHRydWU7XG59O1xuIiwiLyohXG4gKiBpc29iamVjdCA8aHR0cHM6Ly9naXRodWIuY29tL2pvbnNjaGxpbmtlcnQvaXNvYmplY3Q+XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LTIwMTUsIEpvbiBTY2hsaW5rZXJ0LlxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc09iamVjdCh2YWwpIHtcbiAgcmV0dXJuIHZhbCAhPSBudWxsICYmIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnXG4gICAgJiYgIUFycmF5LmlzQXJyYXkodmFsKTtcbn07XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBwcm90byA9IEVsZW1lbnQucHJvdG90eXBlO1xudmFyIHZlbmRvciA9IHByb3RvLm1hdGNoZXNcbiAgfHwgcHJvdG8ubWF0Y2hlc1NlbGVjdG9yXG4gIHx8IHByb3RvLndlYmtpdE1hdGNoZXNTZWxlY3RvclxuICB8fCBwcm90by5tb3pNYXRjaGVzU2VsZWN0b3JcbiAgfHwgcHJvdG8ubXNNYXRjaGVzU2VsZWN0b3JcbiAgfHwgcHJvdG8ub01hdGNoZXNTZWxlY3RvcjtcblxubW9kdWxlLmV4cG9ydHMgPSBtYXRjaDtcblxuLyoqXG4gKiBNYXRjaCBgZWxgIHRvIGBzZWxlY3RvcmAuXG4gKlxuICogQHBhcmFtIHtFbGVtZW50fSBlbFxuICogQHBhcmFtIHtTdHJpbmd9IHNlbGVjdG9yXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBtYXRjaChlbCwgc2VsZWN0b3IpIHtcbiAgaWYgKHZlbmRvcikgcmV0dXJuIHZlbmRvci5jYWxsKGVsLCBzZWxlY3Rvcik7XG4gIHZhciBub2RlcyA9IGVsLnBhcmVudE5vZGUucXVlcnlTZWxlY3RvckFsbChzZWxlY3Rvcik7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAobm9kZXNbaV0gPT0gZWwpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn0iLCJ2YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciBoYXNPd24gPSByZXF1aXJlKFwiaGFzLW93bi1wcm9wXCIpO1xudmFyIGNsb25lID0gcmVxdWlyZShcInNoYWxsb3ctY29weVwiKTtcbnZhciBpc1BsYWluT2JqZWN0ID0gcmVxdWlyZShcImlzLXBsYWluLW9iamVjdFwiKTtcbnZhciBwYXRjaEFycmF5ID0gcmVxdWlyZShcImFycmF5LXNweVwiKTtcblxudmFyIHRyYWNrID1cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCByZXBsYWNlcikge1xuXHRmdW5jdGlvbiByZXBsYWNlKGssIHYpIHtcblx0XHR2YXIgbnZhbDtcblx0XHRpZiAodHlwZW9mIHJlcGxhY2VyID09PSBcImZ1bmN0aW9uXCIpIG52YWwgPSByZXBsYWNlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgbnZhbCA9PT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgdiAhPT0gXCJ1bmRlZmluZWRcIikgbnZhbCA9IHRyYWNrKHYpO1xuXHRcdHJldHVybiBudmFsO1xuXHR9XG5cblx0aWYgKEFycmF5LmlzQXJyYXkob2JqKSkgcmV0dXJuIHRyYWNrQXJyYXkob2JqLCByZXBsYWNlKVxuXHRpZiAoaXNQbGFpbk9iamVjdChvYmopKSByZXR1cm4gdHJhY2tPYmplY3Qob2JqLCByZXBsYWNlKTtcblx0cmV0dXJuIG9iajtcbn1cblxudmFyIHRyYWNrUHJvcGVydHkgPVxudHJhY2sudHJhY2tQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUsIG9wdGlvbnMpIHtcblx0aWYgKHR5cGVvZiBvYmogIT09IFwib2JqZWN0XCIgfHwgb2JqID09IG51bGwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgb2JqZWN0IHRvIGRlZmluZSB0aGUgcmVhY3RpdmUgcHJvcGVydHkgb24uXCIpO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBwcm9wICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIGZvciBwcm9wZXJ0eSBuYW1lLlwiKTtcblxuXHR2YXIgZGVwID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5O1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmNvbmZpZ3VyYWJsZSAhPT0gZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuZW51bWVyYWJsZSAhPT0gZmFsc2UsXG5cdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdGlmICh2YWwgIT09IHZhbHVlKSB7XG5cdFx0XHRcdHZhbHVlID0gdmFsO1xuXHRcdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG9iajtcbn1cblxudmFyIHRyYWNrT2JqZWN0ID1cbnRyYWNrLnRyYWNrT2JqZWN0ID0gZnVuY3Rpb24ocHJvcHMsIHJlcGxhY2VyKSB7XG5cdGlmIChwcm9wcy5fX3JlYWN0aXZlKSByZXR1cm4gcHJvcHM7XG5cblx0dmFyIHZhbHVlcyA9IHt9O1xuXHR2YXIgZGVwcyA9IHt9O1xuXHR2YXIgbWFpbkRlcCA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXG5cdGZ1bmN0aW9uIHJlcGxhY2UoY3R4LCBuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiByZXBsYWNlciA9PT0gXCJmdW5jdGlvblwiID8gcmVwbGFjZXIuY2FsbChjdHgsIG5hbWUsIHZhbHVlKSA6IHZhbHVlO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0dGVyKG5hbWUpIHtcblx0XHRkZXBzW25hbWVdLmRlcGVuZCgpO1xuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR0ZXIobmFtZSwgdmFsdWUpIHtcblx0XHR2YXIgb2xkID0gdmFsdWVzW25hbWVdO1xuXHRcdHZhbHVlc1tuYW1lXSA9IHJlcGxhY2UodGhpcywgbmFtZSwgdmFsdWUpO1xuXG5cdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0aWYgKGRlcCA9PSBudWxsKSBkZXAgPSBkZXBzW25hbWVdID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cdFx0aWYgKG9sZCAhPT0gdmFsdWVzW25hbWVdKSBkZXAuY2hhbmdlZCgpO1xuXG5cdFx0bWFpbkRlcC5jaGFuZ2VkKCk7XG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdHZhciBfcHJvdG8gPSB0eXBlb2YgcHJvcHMuY29uc3RydWN0b3IgPT09IFwiZnVuY3Rpb25cIiA/IE9iamVjdC5jcmVhdGUocHJvcHMuY29uc3RydWN0b3IucHJvdG90eXBlKSA6IHt9O1xuXG5cdF9wcm90by5kZWZpbmVQcm9wZXJ0eSA9IGZ1bmN0aW9uKG5hbWUsIHZhbHVlLCBvcHRpb25zKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIG5hbWUsIHtcblx0XHRcdGNvbmZpZ3VyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuY29uZmlndXJhYmxlICE9PSBmYWxzZSxcblx0XHRcdGVudW1lcmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmVudW1lcmFibGUgIT09IGZhbHNlLFxuXHRcdFx0Z2V0OiBnZXR0ZXIuYmluZCh0aGlzLCBuYW1lKSxcblx0XHRcdHNldDogc2V0dGVyLmJpbmQodGhpcywgbmFtZSlcblx0XHR9KTtcblxuXHRcdHRoaXNbbmFtZV0gPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcblxuXHRfcHJvdG8uZGVsZXRlUHJvcGVydHkgPSBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0aWYgKGRlbGV0ZSB0aGlzW25hbWVdKSB7IC8vIGluIGNhc2UgY29uZmlndXJhYmxlID09PSBmYWxzZVxuXHRcdFx0ZGVsZXRlIHZhbHVlc1tuYW1lXTtcblx0XHRcdGRlbGV0ZSBkZXBzW25hbWVdO1xuXHRcdFx0aWYgKGRlcCkgZGVwLmNoYW5nZWQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG5cblx0X3Byb3RvLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xuXHRcdG1haW5EZXAuZGVwZW5kKCk7XG5cdFx0cmV0dXJuIGNsb25lKHZhbHVlcyk7XG5cdH07XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KF9wcm90bywgXCJfX3JlYWN0aXZlXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdHZhbHVlOiB0cnVlLFxuXHRcdHdyaXRlYWJsZTogZmFsc2Vcblx0fSk7XG5cblx0dmFyIHJvYmogPSBPYmplY3QuY3JlYXRlKF9wcm90byk7XG5cblx0Zm9yICh2YXIga2V5IGluIHByb3BzKSB7XG5cdFx0aWYgKGhhc093bihwcm9wcywga2V5KSkgcm9iai5kZWZpbmVQcm9wZXJ0eShrZXksIHByb3BzW2tleV0pO1xuXHR9XG5cblx0cmV0dXJuIHJvYmo7XG59XG5cbnZhciB0cmFja0FycmF5ID1cbnRyYWNrLnRyYWNrQXJyYXkgPSBmdW5jdGlvbihhcnIsIHJlcGxhY2VyKSB7XG5cdGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYXJyYXkuXCIpO1xuXHRpZiAoYXJyLl9fcmVhY3RpdmUpIHJldHVybiBhcnI7XG5cblx0dmFyIGRlcHMgPSB7IGxlbmd0aDogbmV3IFRyYWNrci5EZXBlbmRlbmN5KCkgfTtcblx0dmFyIHZhbHVlcyA9IHt9O1xuXHR2YXIgbmFyciA9IHBhdGNoQXJyYXkoW10pO1xuXG5cdGZ1bmN0aW9uIHJlcGxhY2UoY3R4LCBuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiByZXBsYWNlciA9PT0gXCJmdW5jdGlvblwiID8gcmVwbGFjZXIuY2FsbChjdHgsIG5hbWUsIHZhbHVlKSA6IHZhbHVlO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0dGVyKG5hbWUpIHtcblx0XHRkZXBzW25hbWVdLmRlcGVuZCgpO1xuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR0ZXIobmFtZSwgdmFsdWUpIHtcblx0XHR2YXIgb2xkID0gdmFsdWVzW25hbWVdO1xuXHRcdHZhbHVlc1tuYW1lXSA9IHJlcGxhY2UodGhpcywgbmFtZSwgdmFsdWUpO1xuXG5cdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0aWYgKGRlcCA9PSBudWxsKSBkZXAgPSBkZXBzW25hbWVdID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cdFx0aWYgKG9sZCAhPT0gdmFsdWVzW25hbWVdKSBkZXAuY2hhbmdlZCgpO1xuXG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdGZ1bmN0aW9uIGRlZmluZShpKSB7XG5cdFx0dmFyIGRlcDtcblxuXHRcdGlmICh0eXBlb2YgaSA9PT0gXCJudW1iZXJcIiAmJiBpID49IG5hcnIubGVuZ3RoKSB7XG5cdFx0XHRpZiAoKGRlcCA9IGRlcHNbaV0pICE9IG51bGwpIHtcblx0XHRcdFx0ZGVsZXRlIGRlcHNbaV07XG5cdFx0XHR9XG5cblx0XHRcdGRlbGV0ZSBuYXJyW2ldO1xuXHRcdFx0ZGVsZXRlIHZhbHVlc1tpXTtcblx0XHRcdGRlcC5jaGFuZ2VkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2V0dGVyLmNhbGwodGhpcywgaSwgbmFycltpXSk7XG5cblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgaS50b1N0cmluZygpLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdFx0Z2V0OiBnZXR0ZXIuYmluZChuYXJyLCBpKSxcblx0XHRcdHNldDogc2V0dGVyLmJpbmQobmFyciwgaSlcblx0XHR9KTtcblx0fVxuXG5cdG5hcnIub2JzZXJ2ZShmdW5jdGlvbihjaGcpIHtcblx0XHR2YXIgYmFsYW5jZSwgc3RhcnQsIGVuZCwgbGVuLCBpLCBwcmV2bGVuO1xuXG5cdFx0aWYgKGNoZyA9PSBudWxsKSByZXR1cm47XG5cblx0XHRiYWxhbmNlID0gY2hnLmFkZGVkIC0gY2hnLnJlbW92ZWQ7XG5cdFx0aWYgKCFiYWxhbmNlKSByZXR1cm47XG5cblx0XHRsZW4gPSBuYXJyLmxlbmd0aDtcblx0XHRwcmV2bGVuID0gbGVuIC0gYmFsYW5jZTtcblx0XHRzdGFydCA9IE1hdGgubWluKHByZXZsZW4sIGxlbik7XG5cdFx0ZW5kID0gTWF0aC5tYXgocHJldmxlbiwgbGVuKTtcblxuXHRcdGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIGRlZmluZShpKTtcblx0XHRkZXBzLmxlbmd0aC5jaGFuZ2VkKCk7XG5cdH0pO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBcIl9fcmVhY3RpdmVcIiwge1xuXHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0dmFsdWU6IHRydWUsXG5cdFx0d3JpdGVhYmxlOiBmYWxzZVxuXHR9KTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgXCIkbGVuZ3RoXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRkZXBzLmxlbmd0aC5kZXBlbmQoKTtcblx0XHRcdHJldHVybiB0aGlzLmxlbmd0aDtcblx0XHR9XG5cdH0pO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBcImRlcGVuZFwiLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwcy5sZW5ndGguZGVwZW5kKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRuYXJyLnB1c2guYXBwbHkobmFyciwgYXJyKTtcblx0cmV0dXJuIG5hcnI7XG59XG4iLCIvLyBhcnJheSB3cml0ZSBvcGVyYXRpb25zXG52YXIgbXV0YXRvck1ldGhvZHMgPSBbICdwb3AnLCAncHVzaCcsICdyZXZlcnNlJywgJ3NoaWZ0JywgJ3NvcnQnLCAnc3BsaWNlJywgJ3Vuc2hpZnQnIF07XG5cbi8vIHBhdGNoZXMgYW4gYXJyYXkgc28gd2UgY2FuIGxpc3RlbiB0byB3cml0ZSBvcGVyYXRpb25zXG52YXIgcGF0Y2hBcnJheSA9XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGFycikge1xuXHRpZiAoYXJyLl9wYXRjaGVkKSByZXR1cm4gYXJyO1xuXG5cdHZhciBwYXRjaGVkQXJyYXlQcm90byA9IFtdLFxuXHRcdG9ic2VydmVycyA9IFtdO1xuXG5cdG11dGF0b3JNZXRob2RzLmZvckVhY2goZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShwYXRjaGVkQXJyYXlQcm90bywgbWV0aG9kTmFtZSwge1xuXHRcdFx0dmFsdWU6IG1ldGhvZFxuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gbWV0aG9kKCkge1xuXHRcdFx0dmFyIHNwbGljZUVxdWl2YWxlbnQsIHN1bW1hcnksIGFyZ3MsIHJlcztcblxuXHRcdFx0YXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG5cblx0XHRcdC8vIGNvbnZlcnQgdGhlIG9wZXJhdGlvbiBpbnRvIGEgc3BsaWNlXG5cdFx0XHRzcGxpY2VFcXVpdmFsZW50ID0gZ2V0U3BsaWNlRXF1aXZhbGVudCh0aGlzLCBtZXRob2ROYW1lLCBhcmdzKTtcblx0XHRcdHN1bW1hcnkgPSBzdW1tYXJpc2VTcGxpY2VPcGVyYXRpb24odGhpcywgc3BsaWNlRXF1aXZhbGVudCk7XG5cblx0XHRcdC8vIHJ1biB0aGUgaW50ZW5kZWQgbWV0aG9kXG5cdFx0XHRyZXMgPSBBcnJheS5wcm90b3R5cGVbbWV0aG9kTmFtZV0uYXBwbHkodGhpcywgYXJncyk7XG5cblx0XHRcdC8vIGNhbGwgdGhlIG9iZXJzdnNlcnNcblx0XHRcdG9ic2VydmVycy5mb3JFYWNoKGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRcdGZuLmNhbGwodGhpcywgc3VtbWFyeSk7XG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0Ly8gcmV0dXJuIHRoZSByZXN1bHQgb2YgdGhlIG1ldGhvZFxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9O1xuXHR9KTtcblxuXHRpZiAoKHt9KS5fX3Byb3RvX18pIGFyci5fX3Byb3RvX18gPSBwYXRjaGVkQXJyYXlQcm90bztcblx0ZWxzZSB7XG5cdFx0bXV0YXRvck1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoYXJyLCBtZXRob2ROYW1lLCB7XG5cdFx0XHRcdHZhbHVlOiBwYXRjaGVkQXJyYXlQcm90b1ttZXRob2ROYW1lXSxcblx0XHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHZhciBleHRyYXMgPSB7XG5cdFx0X3BhdGNoZWQ6IHRydWUsXG5cdFx0b2JzZXJ2ZTogZnVuY3Rpb24oZm4pIHtcblx0XHRcdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIHRvIG9ic2VydmUgd2l0aC5cIik7XG5cdFx0XHRvYnNlcnZlcnMucHVzaChmbik7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXHRcdHN0b3BPYnNlcnZpbmc6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHR2YXIgaW5kZXggPSBvYnNlcnZlcnMuaW5kZXhPZihmbik7XG5cdFx0XHRpZiAoaW5kZXggPiAtMSkgb2JzZXJ2ZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdH07XG5cblx0Zm9yICh2YXIgayBpbiBleHRyYXMpIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoYXJyLCBrLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0XHR2YWx1ZTogZXh0cmFzW2tdLFxuXHRcdFx0d3JpdGVhYmxlOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIGFycjtcbn1cblxuLy8gY29udmVydHMgYXJyYXkgd3JpdGUgb3BlcmF0aW9ucyBpbnRvIHNwbGljZSBlcXVpdmFsZW50IGFyZ3VtZW50c1xudmFyIGdldFNwbGljZUVxdWl2YWxlbnQgPVxucGF0Y2hBcnJheS5nZXRTcGxpY2VFcXVpdmFsZW50ID0gZnVuY3Rpb24gKCBhcnJheSwgbWV0aG9kTmFtZSwgYXJncyApIHtcblx0c3dpdGNoICggbWV0aG9kTmFtZSApIHtcblx0XHRjYXNlICdzcGxpY2UnOlxuXHRcdFx0cmV0dXJuIGFyZ3M7XG5cblx0XHRjYXNlICdzb3J0Jzpcblx0XHRjYXNlICdyZXZlcnNlJzpcblx0XHRcdHJldHVybiBudWxsO1xuXG5cdFx0Y2FzZSAncG9wJzpcblx0XHRcdGlmICggYXJyYXkubGVuZ3RoICkge1xuXHRcdFx0XHRyZXR1cm4gWyAtMSBdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cblx0XHRjYXNlICdwdXNoJzpcblx0XHRcdHJldHVybiBbIGFycmF5Lmxlbmd0aCwgMCBdLmNvbmNhdCggYXJncyApO1xuXG5cdFx0Y2FzZSAnc2hpZnQnOlxuXHRcdFx0cmV0dXJuIFsgMCwgMSBdO1xuXG5cdFx0Y2FzZSAndW5zaGlmdCc6XG5cdFx0XHRyZXR1cm4gWyAwLCAwIF0uY29uY2F0KCBhcmdzICk7XG5cdH1cbn1cblxuLy8gcmV0dXJucyBhIHN1bW1hcnkgcGYgaG93IGFuIGFycmF5IHdpbGwgYmUgY2hhbmdlZCBhZnRlciB0aGUgc3BsaWNlIG9wZXJhdGlvblxudmFyIHN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbiA9XG5wYXRjaEFycmF5LnN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICggYXJyYXksIGFyZ3MgKSB7XG5cdHZhciBpbmRleCwgYWRkZWRJdGVtcywgcmVtb3ZlZEl0ZW1zO1xuXG5cdGlmICghYXJncykgcmV0dXJuIG51bGw7XG5cblx0Ly8gZmlndXJlIG91dCB3aGVyZSB0aGUgY2hhbmdlcyBzdGFydGVkLi4uXG5cdGluZGV4ID0gKyggYXJnc1swXSA8IDAgPyBhcnJheS5sZW5ndGggKyBhcmdzWzBdIDogYXJnc1swXSApO1xuXG5cdC8vIC4uLmFuZCBob3cgbWFueSBpdGVtcyB3ZXJlIGFkZGVkIHRvIG9yIHJlbW92ZWQgZnJvbSB0aGUgYXJyYXlcblx0YWRkZWRJdGVtcyA9IE1hdGgubWF4KCAwLCBhcmdzLmxlbmd0aCAtIDIgKTtcblx0cmVtb3ZlZEl0ZW1zID0gKCBhcmdzWzFdICE9PSB1bmRlZmluZWQgPyBhcmdzWzFdIDogYXJyYXkubGVuZ3RoIC0gaW5kZXggKTtcblxuXHQvLyBJdCdzIHBvc3NpYmxlIHRvIGRvIGUuZy4gWyAxLCAyLCAzIF0uc3BsaWNlKCAyLCAyICkgLSBpLmUuIHRoZSBzZWNvbmQgYXJndW1lbnRcblx0Ly8gbWVhbnMgcmVtb3ZpbmcgbW9yZSBpdGVtcyBmcm9tIHRoZSBlbmQgb2YgdGhlIGFycmF5IHRoYW4gdGhlcmUgYXJlLiBJbiB0aGVzZVxuXHQvLyBjYXNlcyB3ZSBuZWVkIHRvIGN1cmIgSmF2YVNjcmlwdCdzIGVudGh1c2lhc20gb3Igd2UnbGwgZ2V0IG91dCBvZiBzeW5jXG5cdHJlbW92ZWRJdGVtcyA9IE1hdGgubWluKCByZW1vdmVkSXRlbXMsIGFycmF5Lmxlbmd0aCAtIGluZGV4ICk7XG5cblx0cmV0dXJuIHtcblx0XHRpbmRleDogaW5kZXgsXG5cdFx0YWRkZWQ6IGFkZGVkSXRlbXMsXG5cdFx0cmVtb3ZlZDogcmVtb3ZlZEl0ZW1zXG5cdH07XG59XG4iLCIndXNlIHN0cmljdCc7XG52YXIgaGFzT3duUHJvcCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaiwgcHJvcCkge1xuXHRyZXR1cm4gaGFzT3duUHJvcC5jYWxsKG9iaiwgcHJvcCk7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqKSB7XG4gICAgaWYgKCFvYmogfHwgdHlwZW9mIG9iaiAhPT0gJ29iamVjdCcpIHJldHVybiBvYmo7XG4gICAgXG4gICAgdmFyIGNvcHk7XG4gICAgXG4gICAgaWYgKGlzQXJyYXkob2JqKSkge1xuICAgICAgICB2YXIgbGVuID0gb2JqLmxlbmd0aDtcbiAgICAgICAgY29weSA9IEFycmF5KGxlbik7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgICAgIGNvcHlbaV0gPSBvYmpbaV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciBrZXlzID0gb2JqZWN0S2V5cyhvYmopO1xuICAgICAgICBjb3B5ID0ge307XG4gICAgICAgIFxuICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IGtleXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICAgIGNvcHlba2V5XSA9IG9ialtrZXldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBjb3B5O1xufTtcblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICAgIGlmICh7fS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkga2V5cy5wdXNoKGtleSk7XG4gICAgfVxuICAgIHJldHVybiBrZXlzO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICAgIHJldHVybiB7fS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCJ2YXIgbm93ID0gcmVxdWlyZSgncGVyZm9ybWFuY2Utbm93JylcbiAgLCBnbG9iYWwgPSB0eXBlb2Ygd2luZG93ID09PSAndW5kZWZpbmVkJyA/IHt9IDogd2luZG93XG4gICwgdmVuZG9ycyA9IFsnbW96JywgJ3dlYmtpdCddXG4gICwgc3VmZml4ID0gJ0FuaW1hdGlvbkZyYW1lJ1xuICAsIHJhZiA9IGdsb2JhbFsncmVxdWVzdCcgKyBzdWZmaXhdXG4gICwgY2FmID0gZ2xvYmFsWydjYW5jZWwnICsgc3VmZml4XSB8fCBnbG9iYWxbJ2NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxuXG5mb3IodmFyIGkgPSAwOyBpIDwgdmVuZG9ycy5sZW5ndGggJiYgIXJhZjsgaSsrKSB7XG4gIHJhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ1JlcXVlc3QnICsgc3VmZml4XVxuICBjYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWwnICsgc3VmZml4XVxuICAgICAgfHwgZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG59XG5cbi8vIFNvbWUgdmVyc2lvbnMgb2YgRkYgaGF2ZSByQUYgYnV0IG5vdCBjQUZcbmlmKCFyYWYgfHwgIWNhZikge1xuICB2YXIgbGFzdCA9IDBcbiAgICAsIGlkID0gMFxuICAgICwgcXVldWUgPSBbXVxuICAgICwgZnJhbWVEdXJhdGlvbiA9IDEwMDAgLyA2MFxuXG4gIHJhZiA9IGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgaWYocXVldWUubGVuZ3RoID09PSAwKSB7XG4gICAgICB2YXIgX25vdyA9IG5vdygpXG4gICAgICAgICwgbmV4dCA9IE1hdGgubWF4KDAsIGZyYW1lRHVyYXRpb24gLSAoX25vdyAtIGxhc3QpKVxuICAgICAgbGFzdCA9IG5leHQgKyBfbm93XG4gICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgY3AgPSBxdWV1ZS5zbGljZSgwKVxuICAgICAgICAvLyBDbGVhciBxdWV1ZSBoZXJlIHRvIHByZXZlbnRcbiAgICAgICAgLy8gY2FsbGJhY2tzIGZyb20gYXBwZW5kaW5nIGxpc3RlbmVyc1xuICAgICAgICAvLyB0byB0aGUgY3VycmVudCBmcmFtZSdzIHF1ZXVlXG4gICAgICAgIHF1ZXVlLmxlbmd0aCA9IDBcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGNwLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgaWYoIWNwW2ldLmNhbmNlbGxlZCkge1xuICAgICAgICAgICAgdHJ5e1xuICAgICAgICAgICAgICBjcFtpXS5jYWxsYmFjayhsYXN0KVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7IHRocm93IGUgfSwgMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sIE1hdGgucm91bmQobmV4dCkpXG4gICAgfVxuICAgIHF1ZXVlLnB1c2goe1xuICAgICAgaGFuZGxlOiArK2lkLFxuICAgICAgY2FsbGJhY2s6IGNhbGxiYWNrLFxuICAgICAgY2FuY2VsbGVkOiBmYWxzZVxuICAgIH0pXG4gICAgcmV0dXJuIGlkXG4gIH1cblxuICBjYWYgPSBmdW5jdGlvbihoYW5kbGUpIHtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmKHF1ZXVlW2ldLmhhbmRsZSA9PT0gaGFuZGxlKSB7XG4gICAgICAgIHF1ZXVlW2ldLmNhbmNlbGxlZCA9IHRydWVcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihmbikge1xuICAvLyBXcmFwIGluIGEgbmV3IGZ1bmN0aW9uIHRvIHByZXZlbnRcbiAgLy8gYGNhbmNlbGAgcG90ZW50aWFsbHkgYmVpbmcgYXNzaWduZWRcbiAgLy8gdG8gdGhlIG5hdGl2ZSByQUYgZnVuY3Rpb25cbiAgcmV0dXJuIHJhZi5jYWxsKGdsb2JhbCwgZm4pXG59XG5tb2R1bGUuZXhwb3J0cy5jYW5jZWwgPSBmdW5jdGlvbigpIHtcbiAgY2FmLmFwcGx5KGdsb2JhbCwgYXJndW1lbnRzKVxufVxuIiwiLy8gR2VuZXJhdGVkIGJ5IENvZmZlZVNjcmlwdCAxLjcuMVxuKGZ1bmN0aW9uKCkge1xuICB2YXIgZ2V0TmFub1NlY29uZHMsIGhydGltZSwgbG9hZFRpbWU7XG5cbiAgaWYgKCh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgcGVyZm9ybWFuY2UgIT09IG51bGwpICYmIHBlcmZvcm1hbmNlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgfTtcbiAgfSBlbHNlIGlmICgodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2VzcyAhPT0gbnVsbCkgJiYgcHJvY2Vzcy5ocnRpbWUpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIChnZXROYW5vU2Vjb25kcygpIC0gbG9hZFRpbWUpIC8gMWU2O1xuICAgIH07XG4gICAgaHJ0aW1lID0gcHJvY2Vzcy5ocnRpbWU7XG4gICAgZ2V0TmFub1NlY29uZHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBocjtcbiAgICAgIGhyID0gaHJ0aW1lKCk7XG4gICAgICByZXR1cm4gaHJbMF0gKiAxZTkgKyBoclsxXTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gZ2V0TmFub1NlY29uZHMoKTtcbiAgfSBlbHNlIGlmIChEYXRlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gRGF0ZS5ub3coKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBEYXRlLm5vdygpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH1cblxufSkuY2FsbCh0aGlzKTtcbiIsIi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBQYWNrYWdlIGRvY3MgYXQgaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlciAvL1xuLy8gTGFzdCBtZXJnZTogaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvYmxvYi82OTY4NzZiMTg0OGU0ZDZhOTIwMTQzNDIyYzJjNTBjNDUwMWM4NWEzL3BhY2thZ2VzL3RyYWNrZXIvdHJhY2tlci5qcyAvL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuLy8gY2hlY2sgZm9yIGdsb2JhbCBhbmQgdXNlIHRoYXQgb25lIGluc3RlYWQgb2YgbG9hZGluZyBhIG5ldyBvbmVcbmlmICh0eXBlb2YgZ2xvYmFsLlRyYWNrciAhPT0gXCJ1bmRlZmluZWRcIikge1xuXHRtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbC5UcmFja3I7XG5cdHJldHVybjtcbn1cblxuLyoqXG4gKiBAbmFtZXNwYWNlIFRyYWNrclxuICogQHN1bW1hcnkgVGhlIG5hbWVzcGFjZSBmb3IgVHJhY2tyLXJlbGF0ZWQgbWV0aG9kcy5cbiAqL1xudmFyIFRyYWNrciA9IGdsb2JhbC5UcmFja3IgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2FjdGl2ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFRydWUgaWYgdGhlcmUgaXMgYSBjdXJyZW50IGNvbXB1dGF0aW9uLCBtZWFuaW5nIHRoYXQgZGVwZW5kZW5jaWVzIG9uIHJlYWN0aXZlIGRhdGEgc291cmNlcyB3aWxsIGJlIHRyYWNrZWQgYW5kIHBvdGVudGlhbGx5IGNhdXNlIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIHRvIGJlIHJlcnVuLlxuICogQGxvY3VzIENsaWVudFxuICogQHR5cGUge0Jvb2xlYW59XG4gKi9cblRyYWNrci5hY3RpdmUgPSBmYWxzZTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9jdXJyZW50Y29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBUaGUgY3VycmVudCBjb21wdXRhdGlvbiwgb3IgYG51bGxgIGlmIHRoZXJlIGlzbid0IG9uZS5cdFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIGlzIHRoZSBbYFRyYWNrci5Db21wdXRhdGlvbmBdKCN0cmFja2VyX2NvbXB1dGF0aW9uKSBvYmplY3QgY3JlYXRlZCBieSB0aGUgaW5uZXJtb3N0IGFjdGl2ZSBjYWxsIHRvIGBUcmFja3IuYXV0b3J1bmAsIGFuZCBpdCdzIHRoZSBjb21wdXRhdGlvbiB0aGF0IGdhaW5zIGRlcGVuZGVuY2llcyB3aGVuIHJlYWN0aXZlIGRhdGEgc291cmNlcyBhcmUgYWNjZXNzZWQuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG5UcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gbnVsbDtcblxuLy8gUmVmZXJlbmNlcyB0byBhbGwgY29tcHV0YXRpb25zIGNyZWF0ZWQgd2l0aGluIHRoZSBUcmFja3IgYnkgaWQuXG4vLyBLZWVwaW5nIHRoZXNlIHJlZmVyZW5jZXMgb24gYW4gdW5kZXJzY29yZSBwcm9wZXJ0eSBnaXZlcyBtb3JlIGNvbnRyb2wgdG9cbi8vIHRvb2xpbmcgYW5kIHBhY2thZ2VzIGV4dGVuZGluZyBUcmFja3Igd2l0aG91dCBpbmNyZWFzaW5nIHRoZSBBUEkgc3VyZmFjZS5cbi8vIFRoZXNlIGNhbiB1c2VkIHRvIG1vbmtleS1wYXRjaCBjb21wdXRhdGlvbnMsIHRoZWlyIGZ1bmN0aW9ucywgdXNlXG4vLyBjb21wdXRhdGlvbiBpZHMgZm9yIHRyYWNraW5nLCBldGMuXG5UcmFja3IuX2NvbXB1dGF0aW9ucyA9IHt9O1xuXG52YXIgc2V0Q3VycmVudENvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGMpIHtcblx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IGM7XG5cdFRyYWNrci5hY3RpdmUgPSAhISBjO1xufTtcblxudmFyIF9kZWJ1Z0Z1bmMgPSBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiAodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUuZXJyb3IgP1xuXHRcdFx0IGZ1bmN0aW9uICgpIHsgY29uc29sZS5lcnJvci5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcblx0XHRcdCBmdW5jdGlvbiAoKSB7fTtcbn07XG5cbnZhciBfdGhyb3dPckxvZyA9IGZ1bmN0aW9uIChmcm9tLCBlKSB7XG5cdGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcblx0XHR0aHJvdyBlO1xuXHR9IGVsc2Uge1xuXHRcdHZhciBwcmludEFyZ3MgPSBbXCJFeGNlcHRpb24gZnJvbSBUcmFja3IgXCIgKyBmcm9tICsgXCIgZnVuY3Rpb246XCJdO1xuXHRcdGlmIChlLnN0YWNrICYmIGUubWVzc2FnZSAmJiBlLm5hbWUpIHtcblx0XHRcdHZhciBpZHggPSBlLnN0YWNrLmluZGV4T2YoZS5tZXNzYWdlKTtcblx0XHRcdGlmIChpZHggPCAwIHx8IGlkeCA+IGUubmFtZS5sZW5ndGggKyAyKSB7IC8vIGNoZWNrIGZvciBcIkVycm9yOiBcIlxuXHRcdFx0XHQvLyBtZXNzYWdlIGlzIG5vdCBwYXJ0IG9mIHRoZSBzdGFja1xuXHRcdFx0XHR2YXIgbWVzc2FnZSA9IGUubmFtZSArIFwiOiBcIiArIGUubWVzc2FnZTtcblx0XHRcdFx0cHJpbnRBcmdzLnB1c2gobWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHByaW50QXJncy5wdXNoKGUuc3RhY2spO1xuXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBwcmludEFyZ3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdF9kZWJ1Z0Z1bmMoKShwcmludEFyZ3NbaV0pO1xuXHRcdH1cblx0fVxufTtcblxuLy8gVGFrZXMgYSBmdW5jdGlvbiBgZmAsIGFuZCB3cmFwcyBpdCBpbiBhIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZGBcbi8vIGJsb2NrIGlmIHdlIGFyZSBydW5uaW5nIG9uIHRoZSBzZXJ2ZXIuIE9uIHRoZSBjbGllbnQsIHJldHVybnMgdGhlXG4vLyBvcmlnaW5hbCBmdW5jdGlvbiAoc2luY2UgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYCBpcyBhXG4vLyBuby1vcCkuIFRoaXMgaGFzIHRoZSBiZW5lZml0IG9mIG5vdCBhZGRpbmcgYW4gdW5uZWNlc3Nhcnkgc3RhY2tcbi8vIGZyYW1lIG9uIHRoZSBjbGllbnQuXG52YXIgd2l0aE5vWWllbGRzQWxsb3dlZCA9IGZ1bmN0aW9uIChmKSB7XG5cdHJldHVybiBmO1xufTtcblxudmFyIG5leHRJZCA9IDE7XG4vLyBjb21wdXRhdGlvbnMgd2hvc2UgY2FsbGJhY2tzIHdlIHNob3VsZCBjYWxsIGF0IGZsdXNoIHRpbWVcbnZhciBwZW5kaW5nQ29tcHV0YXRpb25zID0gW107XG4vLyBgdHJ1ZWAgaWYgYSBUcmFja3IuZmx1c2ggaXMgc2NoZWR1bGVkLCBvciBpZiB3ZSBhcmUgaW4gVHJhY2tyLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgaW5GbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lXG4vLyBvciByZWNvbXB1dGUuXHRUaGlzIG1hdGNoZXMgVHJhY2tyLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZVxuLy8gVHJhY2tyLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBUcmFja3IuZmx1c2ggdGhhdCB3ZSBhcmUgaW4uIFdoZW4gc2V0LCB0aHJvdyByYXRoZXIgdGhhbiBsb2cgdGhlXG4vLyBmaXJzdCBlcnJvciBlbmNvdW50ZXJlZCB3aGlsZSBmbHVzaGluZy4gQmVmb3JlIHRocm93aW5nIHRoZSBlcnJvcixcbi8vIGZpbmlzaCBmbHVzaGluZyAoZnJvbSBhIGZpbmFsbHkgYmxvY2spLCBsb2dnaW5nIGFueSBzdWJzZXF1ZW50XG4vLyBlcnJvcnMuXG52YXIgdGhyb3dGaXJzdEVycm9yID0gZmFsc2U7XG5cbnZhciBhZnRlckZsdXNoQ2FsbGJhY2tzID0gW107XG5cbnZhciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSByZXF1aXJlKFwicmFmXCIpO1xuXG52YXIgcmVxdWlyZUZsdXNoID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoISB3aWxsRmx1c2gpIHtcblx0XHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUoVHJhY2tyLl9ydW5GbHVzaCk7XG5cdFx0d2lsbEZsdXNoID0gdHJ1ZTtcblx0fVxufTtcblxuLy8gVHJhY2tyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHZpc2libGUgYnV0IHByaXZhdGVcbi8vICh0aHJvd3MgYW4gZXJyb3IgaWYgeW91IHRyeSB0byBjYWxsIGl0KVxudmFyIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2NvbXB1dGF0aW9uXG5cbi8qKlxuICogQHN1bW1hcnkgQSBDb21wdXRhdGlvbiBvYmplY3QgcmVwcmVzZW50cyBjb2RlIHRoYXQgaXMgcmVwZWF0ZWRseSByZXJ1blxuICogaW4gcmVzcG9uc2UgdG9cbiAqIHJlYWN0aXZlIGRhdGEgY2hhbmdlcy4gQ29tcHV0YXRpb25zIGRvbid0IGhhdmUgcmV0dXJuIHZhbHVlczsgdGhleSBqdXN0XG4gKiBwZXJmb3JtIGFjdGlvbnMsIHN1Y2ggYXMgcmVyZW5kZXJpbmcgYSB0ZW1wbGF0ZSBvbiB0aGUgc2NyZWVuLiBDb21wdXRhdGlvbnNcbiAqIGFyZSBjcmVhdGVkIHVzaW5nIFRyYWNrci5hdXRvcnVuLiBVc2Ugc3RvcCB0byBwcmV2ZW50IGZ1cnRoZXIgcmVydW5uaW5nIG9mIGFcbiAqIGNvbXB1dGF0aW9uLlxuICogQGluc3RhbmNlbmFtZSBjb21wdXRhdGlvblxuICovXG5UcmFja3IuQ29tcHV0YXRpb24gPSBmdW5jdGlvbiAoZiwgcGFyZW50LCBvcHRpb25zKSB7XG5cdGlmICghIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uKVxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFwiVHJhY2tyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBUcmFja3IuYXV0b3J1blwiKTtcblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX3N0b3BwZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdHN0b3BwZWRcblx0ICovXG5cdHNlbGYuc3RvcHBlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVkXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBjb21wdXRhdGlvbiBoYXMgYmVlbiBpbnZhbGlkYXRlZCAoYW5kIG5vdCB5ZXQgcmVydW4pLCBvciBpZiBpdCBoYXMgYmVlbiBzdG9wcGVkLlxuXHQgKiBAbG9jdXMgQ2xpZW50XG5cdCAqIEBtZW1iZXJPZiBUcmFja3IuQ29tcHV0YXRpb25cblx0ICogQGluc3RhbmNlXG5cdCAqIEBuYW1lXHRpbnZhbGlkYXRlZFxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHQvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9maXJzdHJ1blxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGR1cmluZyB0aGUgaW5pdGlhbCBydW4gb2YgdGhlIGNvbXB1dGF0aW9uIGF0IHRoZSB0aW1lIGBUcmFja3IuYXV0b3J1bmAgaXMgY2FsbGVkLCBhbmQgZmFsc2Ugb24gc3Vic2VxdWVudCByZXJ1bnMgYW5kIGF0IG90aGVyIHRpbWVzLlxuXHQgKiBAbG9jdXMgQ2xpZW50XG5cdCAqIEBtZW1iZXJPZiBUcmFja3IuQ29tcHV0YXRpb25cblx0ICogQGluc3RhbmNlXG5cdCAqIEBuYW1lXHRmaXJzdFJ1blxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHNlbGYuZmlyc3RSdW4gPSB0cnVlO1xuXG5cdHNlbGYuX2lkID0gbmV4dElkKys7XG5cdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHRzZWxmLl9vblN0b3BDYWxsYmFja3MgPSBbXTtcblx0Ly8gdGhlIHBsYW4gaXMgYXQgc29tZSBwb2ludCB0byB1c2UgdGhlIHBhcmVudCByZWxhdGlvblxuXHQvLyB0byBjb25zdHJhaW4gdGhlIG9yZGVyIHRoYXQgY29tcHV0YXRpb25zIGFyZSBwcm9jZXNzZWRcblx0c2VsZi5fcGFyZW50ID0gcGFyZW50O1xuXHRzZWxmLl9mdW5jID0gZjtcblx0c2VsZi5fb25FcnJvciA9IG9wdGlvbnMub25FcnJvcjtcblx0c2VsZi5fcmVjb21wdXRpbmcgPSBmYWxzZTtcblx0c2VsZi5fY29udGV4dCA9IG9wdGlvbnMuY29udGV4dCB8fCBudWxsO1xuXG5cdC8vIFJlZ2lzdGVyIHRoZSBjb21wdXRhdGlvbiB3aXRoaW4gdGhlIGdsb2JhbCBUcmFja3IuXG5cdFRyYWNrci5fY29tcHV0YXRpb25zW3NlbGYuX2lkXSA9IHNlbGY7XG5cblx0dmFyIGVycm9yZWQgPSB0cnVlO1xuXHR0cnkge1xuXHRcdHNlbGYuX2NvbXB1dGUoKTtcblx0XHRlcnJvcmVkID0gZmFsc2U7XG5cdH0gZmluYWxseSB7XG5cdFx0c2VsZi5maXJzdFJ1biA9IGZhbHNlO1xuXHRcdGlmIChlcnJvcmVkKVxuXHRcdFx0c2VsZi5zdG9wKCk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBgY2FsbGJhY2tgIHRvIHJ1biB3aGVuIHRoaXMgY29tcHV0YXRpb24gaXMgbmV4dCBpbnZhbGlkYXRlZCwgb3IgcnVucyBpdCBpbW1lZGlhdGVseSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYWxyZWFkeSBpbnZhbGlkYXRlZC5cdFRoZSBjYWxsYmFjayBpcyBydW4gZXhhY3RseSBvbmNlIGFuZCBub3QgdXBvbiBmdXR1cmUgaW52YWxpZGF0aW9ucyB1bmxlc3MgYG9uSW52YWxpZGF0ZWAgaXMgY2FsbGVkIGFnYWluIGFmdGVyIHRoZSBjb21wdXRhdGlvbiBiZWNvbWVzIHZhbGlkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGludmFsaWRhdGlvbi4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgaW52YWxpZGF0ZWQuXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGZ1bmN0aW9uXCIpO1xuXG5cdGlmIChzZWxmLmludmFsaWRhdGVkKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBzdG9wcGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IHN0b3BwZWQuXHRUaGUgY2FsbGJhY2sgaXMgcnVuIGFmdGVyIGFueSBgb25JbnZhbGlkYXRlYCBjYWxsYmFja3MuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gc3RvcC4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgc3RvcHBlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vblN0b3AgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25TdG9wIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuc3RvcHBlZCkge1xuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKGYpLmNhbGwoY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdHNlbGYuX29uU3RvcENhbGxiYWNrcy5wdXNoKHsgZm46IGYsIGN0eDogY3R4IH0pO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgSW52YWxpZGF0ZXMgdGhpcyBjb21wdXRhdGlvbiBzbyB0aGF0IGl0IHdpbGwgYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuaW52YWxpZGF0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRpZiAoISBzZWxmLmludmFsaWRhdGVkKSB7XG5cdFx0Ly8gaWYgd2UncmUgY3VycmVudGx5IGluIF9yZWNvbXB1dGUoKSwgZG9uJ3QgZW5xdWV1ZVxuXHRcdC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuXHRcdGlmICghIHNlbGYuX3JlY29tcHV0aW5nICYmICEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0XHRyZXF1aXJlRmx1c2goKTtcblx0XHRcdHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcblx0XHR9XG5cblx0XHRzZWxmLmludmFsaWRhdGVkID0gdHJ1ZTtcblxuXHRcdC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG5cdFx0Ly8gc2VsZi5pbnZhbGlkYXRlZCA9PT0gdHJ1ZS5cblx0XHRmb3IodmFyIGkgPSAwLCBmOyBmID0gc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzW2ldOyBpKyspIHtcblx0XHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZi5mbikuY2FsbChmLmN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuXG4vKipcbiAqIEBzdW1tYXJ5IFByZXZlbnRzIHRoaXMgY29tcHV0YXRpb24gZnJvbSByZXJ1bm5pbmcuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGlmICghIHNlbGYuc3RvcHBlZCkge1xuXHRcdHNlbGYuc3RvcHBlZCA9IHRydWU7XG5cdFx0c2VsZi5pbnZhbGlkYXRlKCk7XG5cdFx0Ly8gVW5yZWdpc3RlciBmcm9tIGdsb2JhbCBUcmFja3IuXG5cdFx0ZGVsZXRlIFRyYWNrci5fY29tcHV0YXRpb25zW3NlbGYuX2lkXTtcblx0XHRmb3IodmFyIGkgPSAwLCBmOyBmID0gc2VsZi5fb25TdG9wQ2FsbGJhY2tzW2ldOyBpKyspIHtcblx0XHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZi5mbikuY2FsbChmLmN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRzZWxmLl9vblN0b3BDYWxsYmFja3MgPSBbXTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHNlbGYpO1xuXHR2YXIgcHJldmlvdXNJbkNvbXB1dGUgPSBpbkNvbXB1dGU7XG5cdGluQ29tcHV0ZSA9IHRydWU7XG5cdHRyeSB7XG5cdFx0d2l0aE5vWWllbGRzQWxsb3dlZChzZWxmLl9mdW5jKS5jYWxsKHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG5cdFx0aW5Db21wdXRlID0gcHJldmlvdXNJbkNvbXB1dGU7XG5cdH1cbn07XG5cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuX25lZWRzUmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHJldHVybiBzZWxmLmludmFsaWRhdGVkICYmICEgc2VsZi5zdG9wcGVkO1xufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fcmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0c2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuXHR0cnkge1xuXHRcdGlmIChzZWxmLl9uZWVkc1JlY29tcHV0ZSgpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZWxmLl9jb21wdXRlKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmIChzZWxmLl9vbkVycm9yKSB7XG5cdFx0XHRcdFx0c2VsZi5fb25FcnJvcihlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRfdGhyb3dPckxvZyhcInJlY29tcHV0ZVwiLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHR9XG59O1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9kZXBlbmRlbmN5XG5cbi8qKlxuICogQHN1bW1hcnkgQSBEZXBlbmRlbmN5IHJlcHJlc2VudHMgYW4gYXRvbWljIHVuaXQgb2YgcmVhY3RpdmUgZGF0YSB0aGF0IGFcbiAqIGNvbXB1dGF0aW9uIG1pZ2h0IGRlcGVuZCBvbi4gUmVhY3RpdmUgZGF0YSBzb3VyY2VzIHN1Y2ggYXMgU2Vzc2lvbiBvclxuICogTWluaW1vbmdvIGludGVybmFsbHkgY3JlYXRlIGRpZmZlcmVudCBEZXBlbmRlbmN5IG9iamVjdHMgZm9yIGRpZmZlcmVudFxuICogcGllY2VzIG9mIGRhdGEsIGVhY2ggb2Ygd2hpY2ggbWF5IGJlIGRlcGVuZGVkIG9uIGJ5IG11bHRpcGxlIGNvbXB1dGF0aW9ucy5cbiAqIFdoZW4gdGhlIGRhdGEgY2hhbmdlcywgdGhlIGNvbXB1dGF0aW9ucyBhcmUgaW52YWxpZGF0ZWQuXG4gKiBAY2xhc3NcbiAqIEBpbnN0YW5jZU5hbWUgZGVwZW5kZW5jeVxuICovXG5UcmFja3IuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4vL1xuLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4vLyBwcmVzZW50Llx0UmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4vLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbi8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cblxuLyoqXG4gKiBAc3VtbWFyeSBEZWNsYXJlcyB0aGF0IHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIChvciBgZnJvbUNvbXB1dGF0aW9uYCBpZiBnaXZlbikgZGVwZW5kcyBvbiBgZGVwZW5kZW5jeWAuXHRUaGUgY29tcHV0YXRpb24gd2lsbCBiZSBpbnZhbGlkYXRlZCB0aGUgbmV4dCB0aW1lIGBkZXBlbmRlbmN5YCBjaGFuZ2VzLlxuXG5JZiB0aGVyZSBpcyBubyBjdXJyZW50IGNvbXB1dGF0aW9uIGFuZCBgZGVwZW5kKClgIGlzIGNhbGxlZCB3aXRoIG5vIGFyZ3VtZW50cywgaXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zIGZhbHNlLlxuXG5SZXR1cm5zIHRydWUgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGEgbmV3IGRlcGVuZGVudCBvZiBgZGVwZW5kZW5jeWAgcmF0aGVyIHRoYW4gYW4gZXhpc3Rpbmcgb25lLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb259IFtmcm9tQ29tcHV0YXRpb25dIEFuIG9wdGlvbmFsIGNvbXB1dGF0aW9uIGRlY2xhcmVkIHRvIGRlcGVuZCBvbiBgZGVwZW5kZW5jeWAgaW5zdGVhZCBvZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbi5cbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24gKGNvbXB1dGF0aW9uKSB7XG5cdGlmICghIGNvbXB1dGF0aW9uKSB7XG5cdFx0aWYgKCEgVHJhY2tyLmFjdGl2ZSlcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdGNvbXB1dGF0aW9uID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0fVxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcblx0aWYgKCEgKGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKSkge1xuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXSA9IGNvbXB1dGF0aW9uO1xuXHRcdGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRkZWxldGUgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfY2hhbmdlZFxuXG4vKipcbiAqIEBzdW1tYXJ5IEludmFsaWRhdGUgYWxsIGRlcGVuZGVudCBjb21wdXRhdGlvbnMgaW1tZWRpYXRlbHkgYW5kIHJlbW92ZSB0aGVtIGFzIGRlcGVuZGVudHMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvciAodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2hhc2RlcGVuZGVudHNcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgRGVwZW5kZW5jeSBoYXMgb25lIG9yIG1vcmUgZGVwZW5kZW50IENvbXB1dGF0aW9ucywgd2hpY2ggd291bGQgYmUgaW52YWxpZGF0ZWQgaWYgdGhpcyBEZXBlbmRlbmN5IHdlcmUgdG8gY2hhbmdlLlxuICogQGxvY3VzIENsaWVudFxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5oYXNEZXBlbmRlbnRzID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0cmV0dXJuIHRydWU7XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZmx1c2hcblxuLyoqXG4gKiBAc3VtbWFyeSBQcm9jZXNzIGFsbCByZWFjdGl2ZSB1cGRhdGVzIGltbWVkaWF0ZWx5IGFuZCBlbnN1cmUgdGhhdCBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGFyZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLmZsdXNoID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcblx0VHJhY2tyLl9ydW5GbHVzaCh7IGZpbmlzaFN5bmNocm9ub3VzbHk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dGhyb3dGaXJzdEVycm9yOiBvcHRpb25zICYmIG9wdGlvbnMuX3Rocm93Rmlyc3RFcnJvciB9KTtcbn07XG5cbi8vIFJ1biBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnMgYW5kIGFmdGVyRmx1c2ggY2FsbGJhY2tzLlx0SWYgd2Ugd2VyZSBub3QgY2FsbGVkXG4vLyBkaXJlY3RseSB2aWEgVHJhY2tyLmZsdXNoLCB0aGlzIG1heSByZXR1cm4gYmVmb3JlIHRoZXkncmUgYWxsIGRvbmUgdG8gYWxsb3dcbi8vIHRoZSBldmVudCBsb29wIHRvIHJ1biBhIGxpdHRsZSBiZWZvcmUgY29udGludWluZy5cblRyYWNrci5fcnVuRmx1c2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuXHQvLyBYWFggV2hhdCBwYXJ0IG9mIHRoZSBjb21tZW50IGJlbG93IGlzIHN0aWxsIHRydWU/IChXZSBubyBsb25nZXJcblx0Ly8gaGF2ZSBTcGFyaylcblx0Ly9cblx0Ly8gTmVzdGVkIGZsdXNoIGNvdWxkIHBsYXVzaWJseSBoYXBwZW4gaWYsIHNheSwgYSBmbHVzaCBjYXVzZXNcblx0Ly8gRE9NIG11dGF0aW9uLCB3aGljaCBjYXVzZXMgYSBcImJsdXJcIiBldmVudCwgd2hpY2ggcnVucyBhblxuXHQvLyBhcHAgZXZlbnQgaGFuZGxlciB0aGF0IGNhbGxzIFRyYWNrci5mbHVzaC5cdEF0IHRoZSBtb21lbnRcblx0Ly8gU3BhcmsgYmxvY2tzIGV2ZW50IGhhbmRsZXJzIGR1cmluZyBET00gbXV0YXRpb24gYW55d2F5LFxuXHQvLyBiZWNhdXNlIHRoZSBMaXZlUmFuZ2UgdHJlZSBpc24ndCB2YWxpZC5cdEFuZCB3ZSBkb24ndCBoYXZlXG5cdC8vIGFueSB1c2VmdWwgbm90aW9uIG9mIGEgbmVzdGVkIGZsdXNoLlxuXHQvL1xuXHQvLyBodHRwczovL2FwcC5hc2FuYS5jb20vMC8xNTk5MDgzMzAyNDQvMzg1MTM4MjMzODU2XG5cdGlmIChpbkZsdXNoKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNhbGwgVHJhY2tyLmZsdXNoIHdoaWxlIGZsdXNoaW5nXCIpO1xuXG5cdGlmIChpbkNvbXB1dGUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmx1c2ggaW5zaWRlIFRyYWNrci5hdXRvcnVuXCIpO1xuXG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdGluRmx1c2ggPSB0cnVlO1xuXHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR0aHJvd0ZpcnN0RXJyb3IgPSAhISBvcHRpb25zLnRocm93Rmlyc3RFcnJvcjtcblxuXHR2YXIgcmVjb21wdXRlZENvdW50ID0gMDtcblx0dmFyIGZpbmlzaGVkVHJ5ID0gZmFsc2U7XG5cdHRyeSB7XG5cdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8XG5cdFx0XHRcdFx0IGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cblx0XHRcdC8vIHJlY29tcHV0ZSBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnNcblx0XHRcdHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR2YXIgY29tcCA9IHBlbmRpbmdDb21wdXRhdGlvbnMuc2hpZnQoKTtcblx0XHRcdFx0Y29tcC5fcmVjb21wdXRlKCk7XG5cdFx0XHRcdGlmIChjb21wLl9uZWVkc1JlY29tcHV0ZSgpKSB7XG5cdFx0XHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy51bnNoaWZ0KGNvbXApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCEgb3B0aW9ucy5maW5pc2hTeW5jaHJvbm91c2x5ICYmICsrcmVjb21wdXRlZENvdW50ID4gMTAwMCkge1xuXHRcdFx0XHRcdGZpbmlzaGVkVHJ5ID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuXHRcdFx0XHQvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG5cdFx0XHRcdHZhciBjYiA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjYi5mbi5jYWxsKGNiLmN0eCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRfdGhyb3dPckxvZyhcImFmdGVyRmx1c2hcIiwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmICghIGZpbmlzaGVkVHJ5KSB7XG5cdFx0XHQvLyB3ZSdyZSBlcnJvcmluZyBkdWUgdG8gdGhyb3dGaXJzdEVycm9yIGJlaW5nIHRydWUuXG5cdFx0XHRpbkZsdXNoID0gZmFsc2U7IC8vIG5lZWRlZCBiZWZvcmUgY2FsbGluZyBgVHJhY2tyLmZsdXNoKClgIGFnYWluXG5cdFx0XHQvLyBmaW5pc2ggZmx1c2hpbmdcblx0XHRcdFRyYWNrci5fcnVuRmx1c2goe1xuXHRcdFx0XHRmaW5pc2hTeW5jaHJvbm91c2x5OiBvcHRpb25zLmZpbmlzaFN5bmNocm9ub3VzbHksXG5cdFx0XHRcdHRocm93Rmlyc3RFcnJvcjogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR3aWxsRmx1c2ggPSBmYWxzZTtcblx0XHRpbkZsdXNoID0gZmFsc2U7XG5cdFx0aWYgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8IGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cdFx0XHQvLyBXZSdyZSB5aWVsZGluZyBiZWNhdXNlIHdlIHJhbiBhIGJ1bmNoIG9mIGNvbXB1dGF0aW9ucyBhbmQgd2UgYXJlbid0XG5cdFx0XHQvLyByZXF1aXJlZCB0byBmaW5pc2ggc3luY2hyb25vdXNseSwgc28gd2UnZCBsaWtlIHRvIGdpdmUgdGhlIGV2ZW50IGxvb3AgYVxuXHRcdFx0Ly8gY2hhbmNlLiBXZSBzaG91bGQgZmx1c2ggYWdhaW4gc29vbi5cblx0XHRcdGlmIChvcHRpb25zLmZpbmlzaFN5bmNocm9ub3VzbHkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwic3RpbGwgaGF2ZSBtb3JlIHRvIGRvP1wiKTtcdC8vIHNob3VsZG4ndCBoYXBwZW5cblx0XHRcdH1cblx0XHRcdHNldFRpbWVvdXQocmVxdWlyZUZsdXNoLCAxMCk7XG5cdFx0fVxuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2F1dG9ydW5cbi8vXG4vLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4vLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuLy9cbi8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4vL1xuLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4vLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQGNhbGxiYWNrIFRyYWNrci5Db21wdXRhdGlvbkZ1bmN0aW9uXG4gKiBAcGFyYW0ge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuLyoqXG4gKiBAc3VtbWFyeSBSdW4gYSBmdW5jdGlvbiBub3cgYW5kIHJlcnVuIGl0IGxhdGVyIHdoZW5ldmVyIGl0cyBkZXBlbmRlbmNpZXNcbiAqIGNoYW5nZS4gUmV0dXJucyBhIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IGNhbiBiZSB1c2VkIHRvIHN0b3Agb3Igb2JzZXJ2ZSB0aGVcbiAqIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7VHJhY2tyLkNvbXB1dGF0aW9uRnVuY3Rpb259IHJ1bkZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1bi4gSXQgcmVjZWl2ZXNcbiAqIG9uZSBhcmd1bWVudDogdGhlIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IHdpbGwgYmUgcmV0dXJuZWQuXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLm9uRXJyb3IgT3B0aW9uYWwuIFRoZSBmdW5jdGlvbiB0byBydW4gd2hlbiBhbiBlcnJvclxuICogaGFwcGVucyBpbiB0aGUgQ29tcHV0YXRpb24uIFRoZSBvbmx5IGFyZ3VtZW50IGl0IHJlY2lldmVzIGlzIHRoZSBFcnJvclxuICogdGhyb3duLiBEZWZhdWx0cyB0byB0aGUgZXJyb3IgYmVpbmcgbG9nZ2VkIHRvIHRoZSBjb25zb2xlLlxuICogQHJldHVybnMge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgb3B0aW9ucywgY3R4KSB7XG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyYWNrci5hdXRvcnVuIHJlcXVpcmVzIGEgZnVuY3Rpb24gYXJndW1lbnQnKTtcblxuXHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblx0aWYgKGN0eCkgb3B0aW9ucy5jb250ZXh0ID0gY3R4O1xuXG5cdGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gdHJ1ZTtcblx0dmFyIGMgPSBuZXcgVHJhY2tyLkNvbXB1dGF0aW9uKFxuXHRcdGYsIFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24sIG9wdGlvbnMpO1xuXG5cdGlmIChUcmFja3IuYWN0aXZlKVxuXHRcdFRyYWNrci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuXHRcdFx0Yy5zdG9wKCk7XG5cdFx0fSk7XG5cblx0cmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuXHRVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIHdpdGhvdXQgdHJhY2tpbmcgZGVwZW5kZW5jaWVzLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBBIGZ1bmN0aW9uIHRvIGNhbGwgaW1tZWRpYXRlbHkuXG4gKi9cblRyYWNrci5ub25SZWFjdGl2ZSA9XG5UcmFja3Iubm9ucmVhY3RpdmUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBwcmV2aW91cyA9IFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb247XG5cdHNldEN1cnJlbnRDb21wdXRhdGlvbihudWxsKTtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZi5jYWxsKGN0eCk7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0fVxufTtcblxuLy8gbGlrZSBub25yZWFjdGl2ZSBidXQgbWFrZXMgYSBmdW5jdGlvbiBpbnN0ZWFkXG5UcmFja3Iubm9uUmVhY3RhYmxlID1cblRyYWNrci5ub25yZWFjdGFibGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHR2YXIgYXJncyA9IGFyZ3VtZW50cztcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0cmV0dXJuIFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBmLmFwcGx5KGN0eCwgYXJncyk7XG5cdFx0fSk7XG5cdH07XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBhIG5ldyBbYG9uSW52YWxpZGF0ZWBdKCNjb21wdXRhdGlvbl9vbmludmFsaWRhdGUpIGNhbGxiYWNrIG9uIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uICh3aGljaCBtdXN0IGV4aXN0KSwgdG8gYmUgY2FsbGVkIGltbWVkaWF0ZWx5IHdoZW4gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQgb3Igc3RvcHBlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGludm9rZWQgYXMgYGZ1bmMoYylgLCB3aGVyZSBgY2AgaXMgdGhlIGNvbXB1dGF0aW9uIG9uIHdoaWNoIHRoZSBjYWxsYmFjayBpcyByZWdpc3RlcmVkLlxuICovXG5UcmFja3Iub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRpZiAoISBUcmFja3IuYWN0aXZlKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIlRyYWNrci5vbkludmFsaWRhdGUgcmVxdWlyZXMgYSBjdXJyZW50Q29tcHV0YXRpb25cIik7XG5cblx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZiwgY3R4KTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWZ0ZXJmbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFNjaGVkdWxlcyBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBkdXJpbmcgdGhlIG5leHQgZmx1c2gsIG9yIGxhdGVyIGluIHRoZSBjdXJyZW50IGZsdXNoIGlmIG9uZSBpcyBpbiBwcm9ncmVzcywgYWZ0ZXIgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBoYXZlIGJlZW4gcmVydW4uXHRUaGUgZnVuY3Rpb24gd2lsbCBiZSBydW4gb25jZSBhbmQgbm90IG9uIHN1YnNlcXVlbnQgZmx1c2hlcyB1bmxlc3MgYGFmdGVyRmx1c2hgIGlzIGNhbGxlZCBhZ2Fpbi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gY2FsbCBhdCBmbHVzaCB0aW1lLlxuICovXG5UcmFja3IuYWZ0ZXJGbHVzaCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0YWZ0ZXJGbHVzaENhbGxiYWNrcy5wdXNoKHsgZm46IGYsIGN0eDogY3R4IH0pO1xuXHRyZXF1aXJlRmx1c2goKTtcbn07XG4iLCIvLyAgICAgVW5kZXJzY29yZS5qcyAxLjguM1xuLy8gICAgIGh0dHA6Ly91bmRlcnNjb3JlanMub3JnXG4vLyAgICAgKGMpIDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuLy8gICAgIFVuZGVyc2NvcmUgbWF5IGJlIGZyZWVseSBkaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG5cbihmdW5jdGlvbigpIHtcblxuICAvLyBCYXNlbGluZSBzZXR1cFxuICAvLyAtLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEVzdGFibGlzaCB0aGUgcm9vdCBvYmplY3QsIGB3aW5kb3dgIGluIHRoZSBicm93c2VyLCBvciBgZXhwb3J0c2Agb24gdGhlIHNlcnZlci5cbiAgdmFyIHJvb3QgPSB0aGlzO1xuXG4gIC8vIFNhdmUgdGhlIHByZXZpb3VzIHZhbHVlIG9mIHRoZSBgX2AgdmFyaWFibGUuXG4gIHZhciBwcmV2aW91c1VuZGVyc2NvcmUgPSByb290Ll87XG5cbiAgLy8gU2F2ZSBieXRlcyBpbiB0aGUgbWluaWZpZWQgKGJ1dCBub3QgZ3ppcHBlZCkgdmVyc2lvbjpcbiAgdmFyIEFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGUsIE9ialByb3RvID0gT2JqZWN0LnByb3RvdHlwZSwgRnVuY1Byb3RvID0gRnVuY3Rpb24ucHJvdG90eXBlO1xuXG4gIC8vIENyZWF0ZSBxdWljayByZWZlcmVuY2UgdmFyaWFibGVzIGZvciBzcGVlZCBhY2Nlc3MgdG8gY29yZSBwcm90b3R5cGVzLlxuICB2YXJcbiAgICBwdXNoICAgICAgICAgICAgID0gQXJyYXlQcm90by5wdXNoLFxuICAgIHNsaWNlICAgICAgICAgICAgPSBBcnJheVByb3RvLnNsaWNlLFxuICAgIHRvU3RyaW5nICAgICAgICAgPSBPYmpQcm90by50b1N0cmluZyxcbiAgICBoYXNPd25Qcm9wZXJ0eSAgID0gT2JqUHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbiAgLy8gQWxsICoqRUNNQVNjcmlwdCA1KiogbmF0aXZlIGZ1bmN0aW9uIGltcGxlbWVudGF0aW9ucyB0aGF0IHdlIGhvcGUgdG8gdXNlXG4gIC8vIGFyZSBkZWNsYXJlZCBoZXJlLlxuICB2YXJcbiAgICBuYXRpdmVJc0FycmF5ICAgICAgPSBBcnJheS5pc0FycmF5LFxuICAgIG5hdGl2ZUtleXMgICAgICAgICA9IE9iamVjdC5rZXlzLFxuICAgIG5hdGl2ZUJpbmQgICAgICAgICA9IEZ1bmNQcm90by5iaW5kLFxuICAgIG5hdGl2ZUNyZWF0ZSAgICAgICA9IE9iamVjdC5jcmVhdGU7XG5cbiAgLy8gTmFrZWQgZnVuY3Rpb24gcmVmZXJlbmNlIGZvciBzdXJyb2dhdGUtcHJvdG90eXBlLXN3YXBwaW5nLlxuICB2YXIgQ3RvciA9IGZ1bmN0aW9uKCl7fTtcblxuICAvLyBDcmVhdGUgYSBzYWZlIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yIHVzZSBiZWxvdy5cbiAgdmFyIF8gPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqIGluc3RhbmNlb2YgXykgcmV0dXJuIG9iajtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgXykpIHJldHVybiBuZXcgXyhvYmopO1xuICAgIHRoaXMuX3dyYXBwZWQgPSBvYmo7XG4gIH07XG5cbiAgLy8gRXhwb3J0IHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgKipOb2RlLmpzKiosIHdpdGhcbiAgLy8gYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgZm9yIHRoZSBvbGQgYHJlcXVpcmUoKWAgQVBJLiBJZiB3ZSdyZSBpblxuICAvLyB0aGUgYnJvd3NlciwgYWRkIGBfYCBhcyBhIGdsb2JhbCBvYmplY3QuXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IF87XG4gICAgfVxuICAgIGV4cG9ydHMuXyA9IF87XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5fID0gXztcbiAgfVxuXG4gIC8vIEN1cnJlbnQgdmVyc2lvbi5cbiAgXy5WRVJTSU9OID0gJzEuOC4zJztcblxuICAvLyBJbnRlcm5hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gZWZmaWNpZW50IChmb3IgY3VycmVudCBlbmdpbmVzKSB2ZXJzaW9uXG4gIC8vIG9mIHRoZSBwYXNzZWQtaW4gY2FsbGJhY2ssIHRvIGJlIHJlcGVhdGVkbHkgYXBwbGllZCBpbiBvdGhlciBVbmRlcnNjb3JlXG4gIC8vIGZ1bmN0aW9ucy5cbiAgdmFyIG9wdGltaXplQ2IgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0LCBhcmdDb3VudCkge1xuICAgIGlmIChjb250ZXh0ID09PSB2b2lkIDApIHJldHVybiBmdW5jO1xuICAgIHN3aXRjaCAoYXJnQ291bnQgPT0gbnVsbCA/IDMgOiBhcmdDb3VudCkge1xuICAgICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSk7XG4gICAgICB9O1xuICAgICAgY2FzZSAyOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIG90aGVyKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIG90aGVyKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDM6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgICAgfTtcbiAgICAgIGNhc2UgNDogcmV0dXJuIGZ1bmN0aW9uKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCBhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBBIG1vc3RseS1pbnRlcm5hbCBmdW5jdGlvbiB0byBnZW5lcmF0ZSBjYWxsYmFja3MgdGhhdCBjYW4gYmUgYXBwbGllZFxuICAvLyB0byBlYWNoIGVsZW1lbnQgaW4gYSBjb2xsZWN0aW9uLCByZXR1cm5pbmcgdGhlIGRlc2lyZWQgcmVzdWx0IOKAlCBlaXRoZXJcbiAgLy8gaWRlbnRpdHksIGFuIGFyYml0cmFyeSBjYWxsYmFjaywgYSBwcm9wZXJ0eSBtYXRjaGVyLCBvciBhIHByb3BlcnR5IGFjY2Vzc29yLlxuICB2YXIgY2IgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCwgYXJnQ291bnQpIHtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkgcmV0dXJuIF8uaWRlbnRpdHk7XG4gICAgaWYgKF8uaXNGdW5jdGlvbih2YWx1ZSkpIHJldHVybiBvcHRpbWl6ZUNiKHZhbHVlLCBjb250ZXh0LCBhcmdDb3VudCk7XG4gICAgaWYgKF8uaXNPYmplY3QodmFsdWUpKSByZXR1cm4gXy5tYXRjaGVyKHZhbHVlKTtcbiAgICByZXR1cm4gXy5wcm9wZXJ0eSh2YWx1ZSk7XG4gIH07XG4gIF8uaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBjYih2YWx1ZSwgY29udGV4dCwgSW5maW5pdHkpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhc3NpZ25lciBmdW5jdGlvbnMuXG4gIHZhciBjcmVhdGVBc3NpZ25lciA9IGZ1bmN0aW9uKGtleXNGdW5jLCB1bmRlZmluZWRPbmx5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICBpZiAobGVuZ3RoIDwgMiB8fCBvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMTsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpbmRleF0sXG4gICAgICAgICAgICBrZXlzID0ga2V5c0Z1bmMoc291cmNlKSxcbiAgICAgICAgICAgIGwgPSBrZXlzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICBpZiAoIXVuZGVmaW5lZE9ubHkgfHwgb2JqW2tleV0gPT09IHZvaWQgMCkgb2JqW2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhIG5ldyBvYmplY3QgdGhhdCBpbmhlcml0cyBmcm9tIGFub3RoZXIuXG4gIHZhciBiYXNlQ3JlYXRlID0gZnVuY3Rpb24ocHJvdG90eXBlKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KHByb3RvdHlwZSkpIHJldHVybiB7fTtcbiAgICBpZiAobmF0aXZlQ3JlYXRlKSByZXR1cm4gbmF0aXZlQ3JlYXRlKHByb3RvdHlwZSk7XG4gICAgQ3Rvci5wcm90b3R5cGUgPSBwcm90b3R5cGU7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBDdG9yO1xuICAgIEN0b3IucHJvdG90eXBlID0gbnVsbDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIHZhciBwcm9wZXJ0eSA9IGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBvYmogPT0gbnVsbCA/IHZvaWQgMCA6IG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gSGVscGVyIGZvciBjb2xsZWN0aW9uIG1ldGhvZHMgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYSBjb2xsZWN0aW9uXG4gIC8vIHNob3VsZCBiZSBpdGVyYXRlZCBhcyBhbiBhcnJheSBvciBhcyBhbiBvYmplY3RcbiAgLy8gUmVsYXRlZDogaHR0cDovL3Blb3BsZS5tb3ppbGxhLm9yZy9+am9yZW5kb3JmZi9lczYtZHJhZnQuaHRtbCNzZWMtdG9sZW5ndGhcbiAgLy8gQXZvaWRzIGEgdmVyeSBuYXN0eSBpT1MgOCBKSVQgYnVnIG9uIEFSTS02NC4gIzIwOTRcbiAgdmFyIE1BWF9BUlJBWV9JTkRFWCA9IE1hdGgucG93KDIsIDUzKSAtIDE7XG4gIHZhciBnZXRMZW5ndGggPSBwcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gIHZhciBpc0FycmF5TGlrZSA9IGZ1bmN0aW9uKGNvbGxlY3Rpb24pIHtcbiAgICB2YXIgbGVuZ3RoID0gZ2V0TGVuZ3RoKGNvbGxlY3Rpb24pO1xuICAgIHJldHVybiB0eXBlb2YgbGVuZ3RoID09ICdudW1iZXInICYmIGxlbmd0aCA+PSAwICYmIGxlbmd0aCA8PSBNQVhfQVJSQVlfSU5ERVg7XG4gIH07XG5cbiAgLy8gQ29sbGVjdGlvbiBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBUaGUgY29ybmVyc3RvbmUsIGFuIGBlYWNoYCBpbXBsZW1lbnRhdGlvbiwgYWthIGBmb3JFYWNoYC5cbiAgLy8gSGFuZGxlcyByYXcgb2JqZWN0cyBpbiBhZGRpdGlvbiB0byBhcnJheS1saWtlcy4gVHJlYXRzIGFsbFxuICAvLyBzcGFyc2UgYXJyYXktbGlrZXMgYXMgaWYgdGhleSB3ZXJlIGRlbnNlLlxuICBfLmVhY2ggPSBfLmZvckVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIgaSwgbGVuZ3RoO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopKSB7XG4gICAgICBmb3IgKGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaXRlcmF0ZWUob2JqW2ldLCBpLCBvYmopO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgICAgZm9yIChpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpdGVyYXRlZShvYmpba2V5c1tpXV0sIGtleXNbaV0sIG9iaik7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRlZSB0byBlYWNoIGVsZW1lbnQuXG4gIF8ubWFwID0gXy5jb2xsZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoLFxuICAgICAgICByZXN1bHRzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgcmVzdWx0c1tpbmRleF0gPSBpdGVyYXRlZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIHJlZHVjaW5nIGZ1bmN0aW9uIGl0ZXJhdGluZyBsZWZ0IG9yIHJpZ2h0LlxuICBmdW5jdGlvbiBjcmVhdGVSZWR1Y2UoZGlyKSB7XG4gICAgLy8gT3B0aW1pemVkIGl0ZXJhdG9yIGZ1bmN0aW9uIGFzIHVzaW5nIGFyZ3VtZW50cy5sZW5ndGhcbiAgICAvLyBpbiB0aGUgbWFpbiBmdW5jdGlvbiB3aWxsIGRlb3B0aW1pemUgdGhlLCBzZWUgIzE5OTEuXG4gICAgZnVuY3Rpb24gaXRlcmF0b3Iob2JqLCBpdGVyYXRlZSwgbWVtbywga2V5cywgaW5kZXgsIGxlbmd0aCkge1xuICAgICAgZm9yICg7IGluZGV4ID49IDAgJiYgaW5kZXggPCBsZW5ndGg7IGluZGV4ICs9IGRpcikge1xuICAgICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgICBtZW1vID0gaXRlcmF0ZWUobWVtbywgb2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGNvbnRleHQpIHtcbiAgICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCwgNCk7XG4gICAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoLFxuICAgICAgICAgIGluZGV4ID0gZGlyID4gMCA/IDAgOiBsZW5ndGggLSAxO1xuICAgICAgLy8gRGV0ZXJtaW5lIHRoZSBpbml0aWFsIHZhbHVlIGlmIG5vbmUgaXMgcHJvdmlkZWQuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgbWVtbyA9IG9ialtrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleF07XG4gICAgICAgIGluZGV4ICs9IGRpcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpdGVyYXRvcihvYmosIGl0ZXJhdGVlLCBtZW1vLCBrZXlzLCBpbmRleCwgbGVuZ3RoKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gKipSZWR1Y2UqKiBidWlsZHMgdXAgYSBzaW5nbGUgcmVzdWx0IGZyb20gYSBsaXN0IG9mIHZhbHVlcywgYWthIGBpbmplY3RgLFxuICAvLyBvciBgZm9sZGxgLlxuICBfLnJlZHVjZSA9IF8uZm9sZGwgPSBfLmluamVjdCA9IGNyZWF0ZVJlZHVjZSgxKTtcblxuICAvLyBUaGUgcmlnaHQtYXNzb2NpYXRpdmUgdmVyc2lvbiBvZiByZWR1Y2UsIGFsc28ga25vd24gYXMgYGZvbGRyYC5cbiAgXy5yZWR1Y2VSaWdodCA9IF8uZm9sZHIgPSBjcmVhdGVSZWR1Y2UoLTEpO1xuXG4gIC8vIFJldHVybiB0aGUgZmlyc3QgdmFsdWUgd2hpY2ggcGFzc2VzIGEgdHJ1dGggdGVzdC4gQWxpYXNlZCBhcyBgZGV0ZWN0YC5cbiAgXy5maW5kID0gXy5kZXRlY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHZhciBrZXk7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHtcbiAgICAgIGtleSA9IF8uZmluZEluZGV4KG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAga2V5ID0gXy5maW5kS2V5KG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKGtleSAhPT0gdm9pZCAwICYmIGtleSAhPT0gLTEpIHJldHVybiBvYmpba2V5XTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyB0aGF0IHBhc3MgYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBzZWxlY3RgLlxuICBfLmZpbHRlciA9IF8uc2VsZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAocHJlZGljYXRlKHZhbHVlLCBpbmRleCwgbGlzdCkpIHJlc3VsdHMucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgZm9yIHdoaWNoIGEgdHJ1dGggdGVzdCBmYWlscy5cbiAgXy5yZWplY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIF8ubmVnYXRlKGNiKHByZWRpY2F0ZSkpLCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgd2hldGhlciBhbGwgb2YgdGhlIGVsZW1lbnRzIG1hdGNoIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgYWxsYC5cbiAgXy5ldmVyeSA9IF8uYWxsID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICBpZiAoIXByZWRpY2F0ZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIGF0IGxlYXN0IG9uZSBlbGVtZW50IGluIHRoZSBvYmplY3QgbWF0Y2hlcyBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYGFueWAuXG4gIF8uc29tZSA9IF8uYW55ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgdGhlIGFycmF5IG9yIG9iamVjdCBjb250YWlucyBhIGdpdmVuIGl0ZW0gKHVzaW5nIGA9PT1gKS5cbiAgLy8gQWxpYXNlZCBhcyBgaW5jbHVkZXNgIGFuZCBgaW5jbHVkZWAuXG4gIF8uY29udGFpbnMgPSBfLmluY2x1ZGVzID0gXy5pbmNsdWRlID0gZnVuY3Rpb24ob2JqLCBpdGVtLCBmcm9tSW5kZXgsIGd1YXJkKSB7XG4gICAgaWYgKCFpc0FycmF5TGlrZShvYmopKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgIGlmICh0eXBlb2YgZnJvbUluZGV4ICE9ICdudW1iZXInIHx8IGd1YXJkKSBmcm9tSW5kZXggPSAwO1xuICAgIHJldHVybiBfLmluZGV4T2Yob2JqLCBpdGVtLCBmcm9tSW5kZXgpID49IDA7XG4gIH07XG5cbiAgLy8gSW52b2tlIGEgbWV0aG9kICh3aXRoIGFyZ3VtZW50cykgb24gZXZlcnkgaXRlbSBpbiBhIGNvbGxlY3Rpb24uXG4gIF8uaW52b2tlID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgaXNGdW5jID0gXy5pc0Z1bmN0aW9uKG1ldGhvZCk7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHZhciBmdW5jID0gaXNGdW5jID8gbWV0aG9kIDogdmFsdWVbbWV0aG9kXTtcbiAgICAgIHJldHVybiBmdW5jID09IG51bGwgPyBmdW5jIDogZnVuYy5hcHBseSh2YWx1ZSwgYXJncyk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgbWFwYDogZmV0Y2hpbmcgYSBwcm9wZXJ0eS5cbiAgXy5wbHVjayA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgXy5wcm9wZXJ0eShrZXkpKTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaWx0ZXJgOiBzZWxlY3Rpbmcgb25seSBvYmplY3RzXG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ud2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgXy5tYXRjaGVyKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmluZGA6IGdldHRpbmcgdGhlIGZpcnN0IG9iamVjdFxuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmZpbmRXaGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy5maW5kKG9iaiwgXy5tYXRjaGVyKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtYXhpbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1heCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gLUluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSAtSW5maW5pdHksXG4gICAgICAgIHZhbHVlLCBjb21wdXRlZDtcbiAgICBpZiAoaXRlcmF0ZWUgPT0gbnVsbCAmJiBvYmogIT0gbnVsbCkge1xuICAgICAgb2JqID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhbHVlID0gb2JqW2ldO1xuICAgICAgICBpZiAodmFsdWUgPiByZXN1bHQpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgICAgIGlmIChjb21wdXRlZCA+IGxhc3RDb21wdXRlZCB8fCBjb21wdXRlZCA9PT0gLUluZmluaXR5ICYmIHJlc3VsdCA9PT0gLUluZmluaXR5KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgICAgbGFzdENvbXB1dGVkID0gY29tcHV0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWluaW11bSBlbGVtZW50IChvciBlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgXy5taW4gPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IEluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSBJbmZpbml0eSxcbiAgICAgICAgdmFsdWUsIGNvbXB1dGVkO1xuICAgIGlmIChpdGVyYXRlZSA9PSBudWxsICYmIG9iaiAhPSBudWxsKSB7XG4gICAgICBvYmogPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFsdWUgPSBvYmpbaV07XG4gICAgICAgIGlmICh2YWx1ZSA8IHJlc3VsdCkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICAgICAgaWYgKGNvbXB1dGVkIDwgbGFzdENvbXB1dGVkIHx8IGNvbXB1dGVkID09PSBJbmZpbml0eSAmJiByZXN1bHQgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgICAgbGFzdENvbXB1dGVkID0gY29tcHV0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFNodWZmbGUgYSBjb2xsZWN0aW9uLCB1c2luZyB0aGUgbW9kZXJuIHZlcnNpb24gb2YgdGhlXG4gIC8vIFtGaXNoZXItWWF0ZXMgc2h1ZmZsZV0oaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9GaXNoZXLigJNZYXRlc19zaHVmZmxlKS5cbiAgXy5zaHVmZmxlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHNldCA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBzZXQubGVuZ3RoO1xuICAgIHZhciBzaHVmZmxlZCA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwLCByYW5kOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgcmFuZCA9IF8ucmFuZG9tKDAsIGluZGV4KTtcbiAgICAgIGlmIChyYW5kICE9PSBpbmRleCkgc2h1ZmZsZWRbaW5kZXhdID0gc2h1ZmZsZWRbcmFuZF07XG4gICAgICBzaHVmZmxlZFtyYW5kXSA9IHNldFtpbmRleF07XG4gICAgfVxuICAgIHJldHVybiBzaHVmZmxlZDtcbiAgfTtcblxuICAvLyBTYW1wbGUgKipuKiogcmFuZG9tIHZhbHVlcyBmcm9tIGEgY29sbGVjdGlvbi5cbiAgLy8gSWYgKipuKiogaXMgbm90IHNwZWNpZmllZCwgcmV0dXJucyBhIHNpbmdsZSByYW5kb20gZWxlbWVudC5cbiAgLy8gVGhlIGludGVybmFsIGBndWFyZGAgYXJndW1lbnQgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgbWFwYC5cbiAgXy5zYW1wbGUgPSBmdW5jdGlvbihvYmosIG4sIGd1YXJkKSB7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkge1xuICAgICAgaWYgKCFpc0FycmF5TGlrZShvYmopKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgICAgcmV0dXJuIG9ialtfLnJhbmRvbShvYmoubGVuZ3RoIC0gMSldO1xuICAgIH1cbiAgICByZXR1cm4gXy5zaHVmZmxlKG9iaikuc2xpY2UoMCwgTWF0aC5tYXgoMCwgbikpO1xuICB9O1xuXG4gIC8vIFNvcnQgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiBwcm9kdWNlZCBieSBhbiBpdGVyYXRlZS5cbiAgXy5zb3J0QnkgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgcmV0dXJuIF8ucGx1Y2soXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgaW5kZXg6IGluZGV4LFxuICAgICAgICBjcml0ZXJpYTogaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KVxuICAgICAgfTtcbiAgICB9KS5zb3J0KGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWE7XG4gICAgICB2YXIgYiA9IHJpZ2h0LmNyaXRlcmlhO1xuICAgICAgaWYgKGEgIT09IGIpIHtcbiAgICAgICAgaWYgKGEgPiBiIHx8IGEgPT09IHZvaWQgMCkgcmV0dXJuIDE7XG4gICAgICAgIGlmIChhIDwgYiB8fCBiID09PSB2b2lkIDApIHJldHVybiAtMTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsZWZ0LmluZGV4IC0gcmlnaHQuaW5kZXg7XG4gICAgfSksICd2YWx1ZScpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIHVzZWQgZm9yIGFnZ3JlZ2F0ZSBcImdyb3VwIGJ5XCIgb3BlcmF0aW9ucy5cbiAgdmFyIGdyb3VwID0gZnVuY3Rpb24oYmVoYXZpb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgICAgdmFyIGtleSA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgb2JqKTtcbiAgICAgICAgYmVoYXZpb3IocmVzdWx0LCB2YWx1ZSwga2V5KTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEdyb3VwcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLiBQYXNzIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGVcbiAgLy8gdG8gZ3JvdXAgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBjcml0ZXJpb24uXG4gIF8uZ3JvdXBCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIGlmIChfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldLnB1c2godmFsdWUpOyBlbHNlIHJlc3VsdFtrZXldID0gW3ZhbHVlXTtcbiAgfSk7XG5cbiAgLy8gSW5kZXhlcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLCBzaW1pbGFyIHRvIGBncm91cEJ5YCwgYnV0IGZvclxuICAvLyB3aGVuIHlvdSBrbm93IHRoYXQgeW91ciBpbmRleCB2YWx1ZXMgd2lsbCBiZSB1bmlxdWUuXG4gIF8uaW5kZXhCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gIH0pO1xuXG4gIC8vIENvdW50cyBpbnN0YW5jZXMgb2YgYW4gb2JqZWN0IHRoYXQgZ3JvdXAgYnkgYSBjZXJ0YWluIGNyaXRlcmlvbi4gUGFzc1xuICAvLyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlIHRvIGNvdW50IGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGVcbiAgLy8gY3JpdGVyaW9uLlxuICBfLmNvdW50QnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIHZhbHVlLCBrZXkpIHtcbiAgICBpZiAoXy5oYXMocmVzdWx0LCBrZXkpKSByZXN1bHRba2V5XSsrOyBlbHNlIHJlc3VsdFtrZXldID0gMTtcbiAgfSk7XG5cbiAgLy8gU2FmZWx5IGNyZWF0ZSBhIHJlYWwsIGxpdmUgYXJyYXkgZnJvbSBhbnl0aGluZyBpdGVyYWJsZS5cbiAgXy50b0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFvYmopIHJldHVybiBbXTtcbiAgICBpZiAoXy5pc0FycmF5KG9iaikpIHJldHVybiBzbGljZS5jYWxsKG9iaik7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHJldHVybiBfLm1hcChvYmosIF8uaWRlbnRpdHkpO1xuICAgIHJldHVybiBfLnZhbHVlcyhvYmopO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzIGluIGFuIG9iamVjdC5cbiAgXy5zaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gMDtcbiAgICByZXR1cm4gaXNBcnJheUxpa2Uob2JqKSA/IG9iai5sZW5ndGggOiBfLmtleXMob2JqKS5sZW5ndGg7XG4gIH07XG5cbiAgLy8gU3BsaXQgYSBjb2xsZWN0aW9uIGludG8gdHdvIGFycmF5czogb25lIHdob3NlIGVsZW1lbnRzIGFsbCBzYXRpc2Z5IHRoZSBnaXZlblxuICAvLyBwcmVkaWNhdGUsIGFuZCBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIGRvIG5vdCBzYXRpc2Z5IHRoZSBwcmVkaWNhdGUuXG4gIF8ucGFydGl0aW9uID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBwYXNzID0gW10sIGZhaWwgPSBbXTtcbiAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBvYmopIHtcbiAgICAgIChwcmVkaWNhdGUodmFsdWUsIGtleSwgb2JqKSA/IHBhc3MgOiBmYWlsKS5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gW3Bhc3MsIGZhaWxdO1xuICB9O1xuXG4gIC8vIEFycmF5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAvLyBHZXQgdGhlIGZpcnN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGZpcnN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgaGVhZGAgYW5kIGB0YWtlYC4gVGhlICoqZ3VhcmQqKiBjaGVja1xuICAvLyBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8uZmlyc3QgPSBfLmhlYWQgPSBfLnRha2UgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbMF07XG4gICAgcmV0dXJuIF8uaW5pdGlhbChhcnJheSwgYXJyYXkubGVuZ3RoIC0gbik7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgbGFzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEVzcGVjaWFsbHkgdXNlZnVsIG9uXG4gIC8vIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIGFsbCB0aGUgdmFsdWVzIGluXG4gIC8vIHRoZSBhcnJheSwgZXhjbHVkaW5nIHRoZSBsYXN0IE4uXG4gIF8uaW5pdGlhbCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCAwLCBNYXRoLm1heCgwLCBhcnJheS5sZW5ndGggLSAobiA9PSBudWxsIHx8IGd1YXJkID8gMSA6IG4pKSk7XG4gIH07XG5cbiAgLy8gR2V0IHRoZSBsYXN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGxhc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LlxuICBfLmxhc3QgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbYXJyYXkubGVuZ3RoIC0gMV07XG4gICAgcmV0dXJuIF8ucmVzdChhcnJheSwgTWF0aC5tYXgoMCwgYXJyYXkubGVuZ3RoIC0gbikpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGZpcnN0IGVudHJ5IG9mIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgdGFpbGAgYW5kIGBkcm9wYC5cbiAgLy8gRXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgYW4gKipuKiogd2lsbCByZXR1cm5cbiAgLy8gdGhlIHJlc3QgTiB2YWx1ZXMgaW4gdGhlIGFycmF5LlxuICBfLnJlc3QgPSBfLnRhaWwgPSBfLmRyb3AgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgbiA9PSBudWxsIHx8IGd1YXJkID8gMSA6IG4pO1xuICB9O1xuXG4gIC8vIFRyaW0gb3V0IGFsbCBmYWxzeSB2YWx1ZXMgZnJvbSBhbiBhcnJheS5cbiAgXy5jb21wYWN0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIF8uaWRlbnRpdHkpO1xuICB9O1xuXG4gIC8vIEludGVybmFsIGltcGxlbWVudGF0aW9uIG9mIGEgcmVjdXJzaXZlIGBmbGF0dGVuYCBmdW5jdGlvbi5cbiAgdmFyIGZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgc2hhbGxvdywgc3RyaWN0LCBzdGFydEluZGV4KSB7XG4gICAgdmFyIG91dHB1dCA9IFtdLCBpZHggPSAwO1xuICAgIGZvciAodmFyIGkgPSBzdGFydEluZGV4IHx8IDAsIGxlbmd0aCA9IGdldExlbmd0aChpbnB1dCk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHZhbHVlID0gaW5wdXRbaV07XG4gICAgICBpZiAoaXNBcnJheUxpa2UodmFsdWUpICYmIChfLmlzQXJyYXkodmFsdWUpIHx8IF8uaXNBcmd1bWVudHModmFsdWUpKSkge1xuICAgICAgICAvL2ZsYXR0ZW4gY3VycmVudCBsZXZlbCBvZiBhcnJheSBvciBhcmd1bWVudHMgb2JqZWN0XG4gICAgICAgIGlmICghc2hhbGxvdykgdmFsdWUgPSBmbGF0dGVuKHZhbHVlLCBzaGFsbG93LCBzdHJpY3QpO1xuICAgICAgICB2YXIgaiA9IDAsIGxlbiA9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgb3V0cHV0Lmxlbmd0aCArPSBsZW47XG4gICAgICAgIHdoaWxlIChqIDwgbGVuKSB7XG4gICAgICAgICAgb3V0cHV0W2lkeCsrXSA9IHZhbHVlW2orK107XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIXN0cmljdCkge1xuICAgICAgICBvdXRwdXRbaWR4KytdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXQ7XG4gIH07XG5cbiAgLy8gRmxhdHRlbiBvdXQgYW4gYXJyYXksIGVpdGhlciByZWN1cnNpdmVseSAoYnkgZGVmYXVsdCksIG9yIGp1c3Qgb25lIGxldmVsLlxuICBfLmZsYXR0ZW4gPSBmdW5jdGlvbihhcnJheSwgc2hhbGxvdykge1xuICAgIHJldHVybiBmbGF0dGVuKGFycmF5LCBzaGFsbG93LCBmYWxzZSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgdmVyc2lvbiBvZiB0aGUgYXJyYXkgdGhhdCBkb2VzIG5vdCBjb250YWluIHRoZSBzcGVjaWZpZWQgdmFsdWUocykuXG4gIF8ud2l0aG91dCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZGlmZmVyZW5jZShhcnJheSwgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGEgZHVwbGljYXRlLWZyZWUgdmVyc2lvbiBvZiB0aGUgYXJyYXkuIElmIHRoZSBhcnJheSBoYXMgYWxyZWFkeVxuICAvLyBiZWVuIHNvcnRlZCwgeW91IGhhdmUgdGhlIG9wdGlvbiBvZiB1c2luZyBhIGZhc3RlciBhbGdvcml0aG0uXG4gIC8vIEFsaWFzZWQgYXMgYHVuaXF1ZWAuXG4gIF8udW5pcSA9IF8udW5pcXVlID0gZnVuY3Rpb24oYXJyYXksIGlzU29ydGVkLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGlmICghXy5pc0Jvb2xlYW4oaXNTb3J0ZWQpKSB7XG4gICAgICBjb250ZXh0ID0gaXRlcmF0ZWU7XG4gICAgICBpdGVyYXRlZSA9IGlzU29ydGVkO1xuICAgICAgaXNTb3J0ZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGl0ZXJhdGVlICE9IG51bGwpIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgc2VlbiA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB2YWx1ZSA9IGFycmF5W2ldLFxuICAgICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUgPyBpdGVyYXRlZSh2YWx1ZSwgaSwgYXJyYXkpIDogdmFsdWU7XG4gICAgICBpZiAoaXNTb3J0ZWQpIHtcbiAgICAgICAgaWYgKCFpIHx8IHNlZW4gIT09IGNvbXB1dGVkKSByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgIHNlZW4gPSBjb21wdXRlZDtcbiAgICAgIH0gZWxzZSBpZiAoaXRlcmF0ZWUpIHtcbiAgICAgICAgaWYgKCFfLmNvbnRhaW5zKHNlZW4sIGNvbXB1dGVkKSkge1xuICAgICAgICAgIHNlZW4ucHVzaChjb21wdXRlZCk7XG4gICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFfLmNvbnRhaW5zKHJlc3VsdCwgdmFsdWUpKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgdGhlIHVuaW9uOiBlYWNoIGRpc3RpbmN0IGVsZW1lbnQgZnJvbSBhbGwgb2ZcbiAgLy8gdGhlIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8udW5pb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bmlxKGZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCB0cnVlKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIGV2ZXJ5IGl0ZW0gc2hhcmVkIGJldHdlZW4gYWxsIHRoZVxuICAvLyBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLmludGVyc2VjdGlvbiA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHZhciBhcmdzTGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaXRlbSA9IGFycmF5W2ldO1xuICAgICAgaWYgKF8uY29udGFpbnMocmVzdWx0LCBpdGVtKSkgY29udGludWU7XG4gICAgICBmb3IgKHZhciBqID0gMTsgaiA8IGFyZ3NMZW5ndGg7IGorKykge1xuICAgICAgICBpZiAoIV8uY29udGFpbnMoYXJndW1lbnRzW2pdLCBpdGVtKSkgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoaiA9PT0gYXJnc0xlbmd0aCkgcmVzdWx0LnB1c2goaXRlbSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gVGFrZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIG9uZSBhcnJheSBhbmQgYSBudW1iZXIgb2Ygb3RoZXIgYXJyYXlzLlxuICAvLyBPbmx5IHRoZSBlbGVtZW50cyBwcmVzZW50IGluIGp1c3QgdGhlIGZpcnN0IGFycmF5IHdpbGwgcmVtYWluLlxuICBfLmRpZmZlcmVuY2UgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN0ID0gZmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUsIDEpO1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgZnVuY3Rpb24odmFsdWUpe1xuICAgICAgcmV0dXJuICFfLmNvbnRhaW5zKHJlc3QsIHZhbHVlKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBaaXAgdG9nZXRoZXIgbXVsdGlwbGUgbGlzdHMgaW50byBhIHNpbmdsZSBhcnJheSAtLSBlbGVtZW50cyB0aGF0IHNoYXJlXG4gIC8vIGFuIGluZGV4IGdvIHRvZ2V0aGVyLlxuICBfLnppcCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuemlwKGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgLy8gQ29tcGxlbWVudCBvZiBfLnppcC4gVW56aXAgYWNjZXB0cyBhbiBhcnJheSBvZiBhcnJheXMgYW5kIGdyb3Vwc1xuICAvLyBlYWNoIGFycmF5J3MgZWxlbWVudHMgb24gc2hhcmVkIGluZGljZXNcbiAgXy51bnppcCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIGxlbmd0aCA9IGFycmF5ICYmIF8ubWF4KGFycmF5LCBnZXRMZW5ndGgpLmxlbmd0aCB8fCAwO1xuICAgIHZhciByZXN1bHQgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgcmVzdWx0W2luZGV4XSA9IF8ucGx1Y2soYXJyYXksIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBDb252ZXJ0cyBsaXN0cyBpbnRvIG9iamVjdHMuIFBhc3MgZWl0aGVyIGEgc2luZ2xlIGFycmF5IG9mIGBba2V5LCB2YWx1ZV1gXG4gIC8vIHBhaXJzLCBvciB0d28gcGFyYWxsZWwgYXJyYXlzIG9mIHRoZSBzYW1lIGxlbmd0aCAtLSBvbmUgb2Yga2V5cywgYW5kIG9uZSBvZlxuICAvLyB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZXMuXG4gIF8ub2JqZWN0ID0gZnVuY3Rpb24obGlzdCwgdmFsdWVzKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgobGlzdCk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHZhbHVlcykge1xuICAgICAgICByZXN1bHRbbGlzdFtpXV0gPSB2YWx1ZXNbaV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRbbGlzdFtpXVswXV0gPSBsaXN0W2ldWzFdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIEdlbmVyYXRvciBmdW5jdGlvbiB0byBjcmVhdGUgdGhlIGZpbmRJbmRleCBhbmQgZmluZExhc3RJbmRleCBmdW5jdGlvbnNcbiAgZnVuY3Rpb24gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoZGlyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFycmF5LCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgICB2YXIgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTtcbiAgICAgIHZhciBpbmRleCA9IGRpciA+IDAgPyAwIDogbGVuZ3RoIC0gMTtcbiAgICAgIGZvciAoOyBpbmRleCA+PSAwICYmIGluZGV4IDwgbGVuZ3RoOyBpbmRleCArPSBkaXIpIHtcbiAgICAgICAgaWYgKHByZWRpY2F0ZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSkpIHJldHVybiBpbmRleDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgaW5kZXggb24gYW4gYXJyYXktbGlrZSB0aGF0IHBhc3NlcyBhIHByZWRpY2F0ZSB0ZXN0XG4gIF8uZmluZEluZGV4ID0gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoMSk7XG4gIF8uZmluZExhc3RJbmRleCA9IGNyZWF0ZVByZWRpY2F0ZUluZGV4RmluZGVyKC0xKTtcblxuICAvLyBVc2UgYSBjb21wYXJhdG9yIGZ1bmN0aW9uIHRvIGZpZ3VyZSBvdXQgdGhlIHNtYWxsZXN0IGluZGV4IGF0IHdoaWNoXG4gIC8vIGFuIG9iamVjdCBzaG91bGQgYmUgaW5zZXJ0ZWQgc28gYXMgdG8gbWFpbnRhaW4gb3JkZXIuIFVzZXMgYmluYXJ5IHNlYXJjaC5cbiAgXy5zb3J0ZWRJbmRleCA9IGZ1bmN0aW9uKGFycmF5LCBvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCwgMSk7XG4gICAgdmFyIHZhbHVlID0gaXRlcmF0ZWUob2JqKTtcbiAgICB2YXIgbG93ID0gMCwgaGlnaCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgd2hpbGUgKGxvdyA8IGhpZ2gpIHtcbiAgICAgIHZhciBtaWQgPSBNYXRoLmZsb29yKChsb3cgKyBoaWdoKSAvIDIpO1xuICAgICAgaWYgKGl0ZXJhdGVlKGFycmF5W21pZF0pIDwgdmFsdWUpIGxvdyA9IG1pZCArIDE7IGVsc2UgaGlnaCA9IG1pZDtcbiAgICB9XG4gICAgcmV0dXJuIGxvdztcbiAgfTtcblxuICAvLyBHZW5lcmF0b3IgZnVuY3Rpb24gdG8gY3JlYXRlIHRoZSBpbmRleE9mIGFuZCBsYXN0SW5kZXhPZiBmdW5jdGlvbnNcbiAgZnVuY3Rpb24gY3JlYXRlSW5kZXhGaW5kZXIoZGlyLCBwcmVkaWNhdGVGaW5kLCBzb3J0ZWRJbmRleCkge1xuICAgIHJldHVybiBmdW5jdGlvbihhcnJheSwgaXRlbSwgaWR4KSB7XG4gICAgICB2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgICBpZiAodHlwZW9mIGlkeCA9PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAoZGlyID4gMCkge1xuICAgICAgICAgICAgaSA9IGlkeCA+PSAwID8gaWR4IDogTWF0aC5tYXgoaWR4ICsgbGVuZ3RoLCBpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbmd0aCA9IGlkeCA+PSAwID8gTWF0aC5taW4oaWR4ICsgMSwgbGVuZ3RoKSA6IGlkeCArIGxlbmd0aCArIDE7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc29ydGVkSW5kZXggJiYgaWR4ICYmIGxlbmd0aCkge1xuICAgICAgICBpZHggPSBzb3J0ZWRJbmRleChhcnJheSwgaXRlbSk7XG4gICAgICAgIHJldHVybiBhcnJheVtpZHhdID09PSBpdGVtID8gaWR4IDogLTE7XG4gICAgICB9XG4gICAgICBpZiAoaXRlbSAhPT0gaXRlbSkge1xuICAgICAgICBpZHggPSBwcmVkaWNhdGVGaW5kKHNsaWNlLmNhbGwoYXJyYXksIGksIGxlbmd0aCksIF8uaXNOYU4pO1xuICAgICAgICByZXR1cm4gaWR4ID49IDAgPyBpZHggKyBpIDogLTE7XG4gICAgICB9XG4gICAgICBmb3IgKGlkeCA9IGRpciA+IDAgPyBpIDogbGVuZ3RoIC0gMTsgaWR4ID49IDAgJiYgaWR4IDwgbGVuZ3RoOyBpZHggKz0gZGlyKSB7XG4gICAgICAgIGlmIChhcnJheVtpZHhdID09PSBpdGVtKSByZXR1cm4gaWR4O1xuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBvY2N1cnJlbmNlIG9mIGFuIGl0ZW0gaW4gYW4gYXJyYXksXG4gIC8vIG9yIC0xIGlmIHRoZSBpdGVtIGlzIG5vdCBpbmNsdWRlZCBpbiB0aGUgYXJyYXkuXG4gIC8vIElmIHRoZSBhcnJheSBpcyBsYXJnZSBhbmQgYWxyZWFkeSBpbiBzb3J0IG9yZGVyLCBwYXNzIGB0cnVlYFxuICAvLyBmb3IgKippc1NvcnRlZCoqIHRvIHVzZSBiaW5hcnkgc2VhcmNoLlxuICBfLmluZGV4T2YgPSBjcmVhdGVJbmRleEZpbmRlcigxLCBfLmZpbmRJbmRleCwgXy5zb3J0ZWRJbmRleCk7XG4gIF8ubGFzdEluZGV4T2YgPSBjcmVhdGVJbmRleEZpbmRlcigtMSwgXy5maW5kTGFzdEluZGV4KTtcblxuICAvLyBHZW5lcmF0ZSBhbiBpbnRlZ2VyIEFycmF5IGNvbnRhaW5pbmcgYW4gYXJpdGhtZXRpYyBwcm9ncmVzc2lvbi4gQSBwb3J0IG9mXG4gIC8vIHRoZSBuYXRpdmUgUHl0aG9uIGByYW5nZSgpYCBmdW5jdGlvbi4gU2VlXG4gIC8vIFt0aGUgUHl0aG9uIGRvY3VtZW50YXRpb25dKGh0dHA6Ly9kb2NzLnB5dGhvbi5vcmcvbGlicmFyeS9mdW5jdGlvbnMuaHRtbCNyYW5nZSkuXG4gIF8ucmFuZ2UgPSBmdW5jdGlvbihzdGFydCwgc3RvcCwgc3RlcCkge1xuICAgIGlmIChzdG9wID09IG51bGwpIHtcbiAgICAgIHN0b3AgPSBzdGFydCB8fCAwO1xuICAgICAgc3RhcnQgPSAwO1xuICAgIH1cbiAgICBzdGVwID0gc3RlcCB8fCAxO1xuXG4gICAgdmFyIGxlbmd0aCA9IE1hdGgubWF4KE1hdGguY2VpbCgoc3RvcCAtIHN0YXJ0KSAvIHN0ZXApLCAwKTtcbiAgICB2YXIgcmFuZ2UgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaWR4ID0gMDsgaWR4IDwgbGVuZ3RoOyBpZHgrKywgc3RhcnQgKz0gc3RlcCkge1xuICAgICAgcmFuZ2VbaWR4XSA9IHN0YXJ0O1xuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfTtcblxuICAvLyBGdW5jdGlvbiAoYWhlbSkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIERldGVybWluZXMgd2hldGhlciB0byBleGVjdXRlIGEgZnVuY3Rpb24gYXMgYSBjb25zdHJ1Y3RvclxuICAvLyBvciBhIG5vcm1hbCBmdW5jdGlvbiB3aXRoIHRoZSBwcm92aWRlZCBhcmd1bWVudHNcbiAgdmFyIGV4ZWN1dGVCb3VuZCA9IGZ1bmN0aW9uKHNvdXJjZUZ1bmMsIGJvdW5kRnVuYywgY29udGV4dCwgY2FsbGluZ0NvbnRleHQsIGFyZ3MpIHtcbiAgICBpZiAoIShjYWxsaW5nQ29udGV4dCBpbnN0YW5jZW9mIGJvdW5kRnVuYykpIHJldHVybiBzb3VyY2VGdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgIHZhciBzZWxmID0gYmFzZUNyZWF0ZShzb3VyY2VGdW5jLnByb3RvdHlwZSk7XG4gICAgdmFyIHJlc3VsdCA9IHNvdXJjZUZ1bmMuYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgaWYgKF8uaXNPYmplY3QocmVzdWx0KSkgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gc2VsZjtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSBmdW5jdGlvbiBib3VuZCB0byBhIGdpdmVuIG9iamVjdCAoYXNzaWduaW5nIGB0aGlzYCwgYW5kIGFyZ3VtZW50cyxcbiAgLy8gb3B0aW9uYWxseSkuIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBGdW5jdGlvbi5iaW5kYCBpZlxuICAvLyBhdmFpbGFibGUuXG4gIF8uYmluZCA9IGZ1bmN0aW9uKGZ1bmMsIGNvbnRleHQpIHtcbiAgICBpZiAobmF0aXZlQmluZCAmJiBmdW5jLmJpbmQgPT09IG5hdGl2ZUJpbmQpIHJldHVybiBuYXRpdmVCaW5kLmFwcGx5KGZ1bmMsIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgaWYgKCFfLmlzRnVuY3Rpb24oZnVuYykpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0JpbmQgbXVzdCBiZSBjYWxsZWQgb24gYSBmdW5jdGlvbicpO1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBib3VuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4ZWN1dGVCb3VuZChmdW5jLCBib3VuZCwgY29udGV4dCwgdGhpcywgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbiAgICByZXR1cm4gYm91bmQ7XG4gIH07XG5cbiAgLy8gUGFydGlhbGx5IGFwcGx5IGEgZnVuY3Rpb24gYnkgY3JlYXRpbmcgYSB2ZXJzaW9uIHRoYXQgaGFzIGhhZCBzb21lIG9mIGl0c1xuICAvLyBhcmd1bWVudHMgcHJlLWZpbGxlZCwgd2l0aG91dCBjaGFuZ2luZyBpdHMgZHluYW1pYyBgdGhpc2AgY29udGV4dC4gXyBhY3RzXG4gIC8vIGFzIGEgcGxhY2Vob2xkZXIsIGFsbG93aW5nIGFueSBjb21iaW5hdGlvbiBvZiBhcmd1bWVudHMgdG8gYmUgcHJlLWZpbGxlZC5cbiAgXy5wYXJ0aWFsID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciBib3VuZEFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgdmFyIGJvdW5kID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcG9zaXRpb24gPSAwLCBsZW5ndGggPSBib3VuZEFyZ3MubGVuZ3RoO1xuICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW5ndGgpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBhcmdzW2ldID0gYm91bmRBcmdzW2ldID09PSBfID8gYXJndW1lbnRzW3Bvc2l0aW9uKytdIDogYm91bmRBcmdzW2ldO1xuICAgICAgfVxuICAgICAgd2hpbGUgKHBvc2l0aW9uIDwgYXJndW1lbnRzLmxlbmd0aCkgYXJncy5wdXNoKGFyZ3VtZW50c1twb3NpdGlvbisrXSk7XG4gICAgICByZXR1cm4gZXhlY3V0ZUJvdW5kKGZ1bmMsIGJvdW5kLCB0aGlzLCB0aGlzLCBhcmdzKTtcbiAgICB9O1xuICAgIHJldHVybiBib3VuZDtcbiAgfTtcblxuICAvLyBCaW5kIGEgbnVtYmVyIG9mIGFuIG9iamVjdCdzIG1ldGhvZHMgdG8gdGhhdCBvYmplY3QuIFJlbWFpbmluZyBhcmd1bWVudHNcbiAgLy8gYXJlIHRoZSBtZXRob2QgbmFtZXMgdG8gYmUgYm91bmQuIFVzZWZ1bCBmb3IgZW5zdXJpbmcgdGhhdCBhbGwgY2FsbGJhY2tzXG4gIC8vIGRlZmluZWQgb24gYW4gb2JqZWN0IGJlbG9uZyB0byBpdC5cbiAgXy5iaW5kQWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGksIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsIGtleTtcbiAgICBpZiAobGVuZ3RoIDw9IDEpIHRocm93IG5ldyBFcnJvcignYmluZEFsbCBtdXN0IGJlIHBhc3NlZCBmdW5jdGlvbiBuYW1lcycpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAga2V5ID0gYXJndW1lbnRzW2ldO1xuICAgICAgb2JqW2tleV0gPSBfLmJpbmQob2JqW2tleV0sIG9iaik7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gTWVtb2l6ZSBhbiBleHBlbnNpdmUgZnVuY3Rpb24gYnkgc3RvcmluZyBpdHMgcmVzdWx0cy5cbiAgXy5tZW1vaXplID0gZnVuY3Rpb24oZnVuYywgaGFzaGVyKSB7XG4gICAgdmFyIG1lbW9pemUgPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBjYWNoZSA9IG1lbW9pemUuY2FjaGU7XG4gICAgICB2YXIgYWRkcmVzcyA9ICcnICsgKGhhc2hlciA/IGhhc2hlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpIDoga2V5KTtcbiAgICAgIGlmICghXy5oYXMoY2FjaGUsIGFkZHJlc3MpKSBjYWNoZVthZGRyZXNzXSA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBjYWNoZVthZGRyZXNzXTtcbiAgICB9O1xuICAgIG1lbW9pemUuY2FjaGUgPSB7fTtcbiAgICByZXR1cm4gbWVtb2l6ZTtcbiAgfTtcblxuICAvLyBEZWxheXMgYSBmdW5jdGlvbiBmb3IgdGhlIGdpdmVuIG51bWJlciBvZiBtaWxsaXNlY29uZHMsIGFuZCB0aGVuIGNhbGxzXG4gIC8vIGl0IHdpdGggdGhlIGFyZ3VtZW50cyBzdXBwbGllZC5cbiAgXy5kZWxheSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgfSwgd2FpdCk7XG4gIH07XG5cbiAgLy8gRGVmZXJzIGEgZnVuY3Rpb24sIHNjaGVkdWxpbmcgaXQgdG8gcnVuIGFmdGVyIHRoZSBjdXJyZW50IGNhbGwgc3RhY2sgaGFzXG4gIC8vIGNsZWFyZWQuXG4gIF8uZGVmZXIgPSBfLnBhcnRpYWwoXy5kZWxheSwgXywgMSk7XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCB3aGVuIGludm9rZWQsIHdpbGwgb25seSBiZSB0cmlnZ2VyZWQgYXQgbW9zdCBvbmNlXG4gIC8vIGR1cmluZyBhIGdpdmVuIHdpbmRvdyBvZiB0aW1lLiBOb3JtYWxseSwgdGhlIHRocm90dGxlZCBmdW5jdGlvbiB3aWxsIHJ1blxuICAvLyBhcyBtdWNoIGFzIGl0IGNhbiwgd2l0aG91dCBldmVyIGdvaW5nIG1vcmUgdGhhbiBvbmNlIHBlciBgd2FpdGAgZHVyYXRpb247XG4gIC8vIGJ1dCBpZiB5b3UnZCBsaWtlIHRvIGRpc2FibGUgdGhlIGV4ZWN1dGlvbiBvbiB0aGUgbGVhZGluZyBlZGdlLCBwYXNzXG4gIC8vIGB7bGVhZGluZzogZmFsc2V9YC4gVG8gZGlzYWJsZSBleGVjdXRpb24gb24gdGhlIHRyYWlsaW5nIGVkZ2UsIGRpdHRvLlxuICBfLnRocm90dGxlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgb3B0aW9ucykge1xuICAgIHZhciBjb250ZXh0LCBhcmdzLCByZXN1bHQ7XG4gICAgdmFyIHRpbWVvdXQgPSBudWxsO1xuICAgIHZhciBwcmV2aW91cyA9IDA7XG4gICAgaWYgKCFvcHRpb25zKSBvcHRpb25zID0ge307XG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICBwcmV2aW91cyA9IG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UgPyAwIDogXy5ub3coKTtcbiAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgIH07XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG5vdyA9IF8ubm93KCk7XG4gICAgICBpZiAoIXByZXZpb3VzICYmIG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UpIHByZXZpb3VzID0gbm93O1xuICAgICAgdmFyIHJlbWFpbmluZyA9IHdhaXQgLSAobm93IC0gcHJldmlvdXMpO1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwIHx8IHJlbWFpbmluZyA+IHdhaXQpIHtcbiAgICAgICAgaWYgKHRpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgcHJldmlvdXMgPSBub3c7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgfSBlbHNlIGlmICghdGltZW91dCAmJiBvcHRpb25zLnRyYWlsaW5nICE9PSBmYWxzZSkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIGFzIGxvbmcgYXMgaXQgY29udGludWVzIHRvIGJlIGludm9rZWQsIHdpbGwgbm90XG4gIC8vIGJlIHRyaWdnZXJlZC4gVGhlIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGFmdGVyIGl0IHN0b3BzIGJlaW5nIGNhbGxlZCBmb3JcbiAgLy8gTiBtaWxsaXNlY29uZHMuIElmIGBpbW1lZGlhdGVgIGlzIHBhc3NlZCwgdHJpZ2dlciB0aGUgZnVuY3Rpb24gb24gdGhlXG4gIC8vIGxlYWRpbmcgZWRnZSwgaW5zdGVhZCBvZiB0aGUgdHJhaWxpbmcuXG4gIF8uZGVib3VuY2UgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBpbW1lZGlhdGUpIHtcbiAgICB2YXIgdGltZW91dCwgYXJncywgY29udGV4dCwgdGltZXN0YW1wLCByZXN1bHQ7XG5cbiAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBsYXN0ID0gXy5ub3coKSAtIHRpbWVzdGFtcDtcblxuICAgICAgaWYgKGxhc3QgPCB3YWl0ICYmIGxhc3QgPj0gMCkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCAtIGxhc3QpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIGlmICghaW1tZWRpYXRlKSB7XG4gICAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBjb250ZXh0ID0gdGhpcztcbiAgICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICB0aW1lc3RhbXAgPSBfLm5vdygpO1xuICAgICAgdmFyIGNhbGxOb3cgPSBpbW1lZGlhdGUgJiYgIXRpbWVvdXQ7XG4gICAgICBpZiAoIXRpbWVvdXQpIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0KTtcbiAgICAgIGlmIChjYWxsTm93KSB7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGZ1bmN0aW9uIHBhc3NlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgc2Vjb25kLFxuICAvLyBhbGxvd2luZyB5b3UgdG8gYWRqdXN0IGFyZ3VtZW50cywgcnVuIGNvZGUgYmVmb3JlIGFuZCBhZnRlciwgYW5kXG4gIC8vIGNvbmRpdGlvbmFsbHkgZXhlY3V0ZSB0aGUgb3JpZ2luYWwgZnVuY3Rpb24uXG4gIF8ud3JhcCA9IGZ1bmN0aW9uKGZ1bmMsIHdyYXBwZXIpIHtcbiAgICByZXR1cm4gXy5wYXJ0aWFsKHdyYXBwZXIsIGZ1bmMpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBuZWdhdGVkIHZlcnNpb24gb2YgdGhlIHBhc3NlZC1pbiBwcmVkaWNhdGUuXG4gIF8ubmVnYXRlID0gZnVuY3Rpb24ocHJlZGljYXRlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuICFwcmVkaWNhdGUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGlzIHRoZSBjb21wb3NpdGlvbiBvZiBhIGxpc3Qgb2YgZnVuY3Rpb25zLCBlYWNoXG4gIC8vIGNvbnN1bWluZyB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmdW5jdGlvbiB0aGF0IGZvbGxvd3MuXG4gIF8uY29tcG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgIHZhciBzdGFydCA9IGFyZ3MubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaSA9IHN0YXJ0O1xuICAgICAgdmFyIHJlc3VsdCA9IGFyZ3Nbc3RhcnRdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB3aGlsZSAoaS0tKSByZXN1bHQgPSBhcmdzW2ldLmNhbGwodGhpcywgcmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgb24gYW5kIGFmdGVyIHRoZSBOdGggY2FsbC5cbiAgXy5hZnRlciA9IGZ1bmN0aW9uKHRpbWVzLCBmdW5jKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKC0tdGltZXMgPCAxKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgdXAgdG8gKGJ1dCBub3QgaW5jbHVkaW5nKSB0aGUgTnRoIGNhbGwuXG4gIF8uYmVmb3JlID0gZnVuY3Rpb24odGltZXMsIGZ1bmMpIHtcbiAgICB2YXIgbWVtbztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoLS10aW1lcyA+IDApIHtcbiAgICAgICAgbWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICAgIGlmICh0aW1lcyA8PSAxKSBmdW5jID0gbnVsbDtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBleGVjdXRlZCBhdCBtb3N0IG9uZSB0aW1lLCBubyBtYXR0ZXIgaG93XG4gIC8vIG9mdGVuIHlvdSBjYWxsIGl0LiBVc2VmdWwgZm9yIGxhenkgaW5pdGlhbGl6YXRpb24uXG4gIF8ub25jZSA9IF8ucGFydGlhbChfLmJlZm9yZSwgMik7XG5cbiAgLy8gT2JqZWN0IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gS2V5cyBpbiBJRSA8IDkgdGhhdCB3b24ndCBiZSBpdGVyYXRlZCBieSBgZm9yIGtleSBpbiAuLi5gIGFuZCB0aHVzIG1pc3NlZC5cbiAgdmFyIGhhc0VudW1CdWcgPSAhe3RvU3RyaW5nOiBudWxsfS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKTtcbiAgdmFyIG5vbkVudW1lcmFibGVQcm9wcyA9IFsndmFsdWVPZicsICdpc1Byb3RvdHlwZU9mJywgJ3RvU3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLCAnaGFzT3duUHJvcGVydHknLCAndG9Mb2NhbGVTdHJpbmcnXTtcblxuICBmdW5jdGlvbiBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cykge1xuICAgIHZhciBub25FbnVtSWR4ID0gbm9uRW51bWVyYWJsZVByb3BzLmxlbmd0aDtcbiAgICB2YXIgY29uc3RydWN0b3IgPSBvYmouY29uc3RydWN0b3I7XG4gICAgdmFyIHByb3RvID0gKF8uaXNGdW5jdGlvbihjb25zdHJ1Y3RvcikgJiYgY29uc3RydWN0b3IucHJvdG90eXBlKSB8fCBPYmpQcm90bztcblxuICAgIC8vIENvbnN0cnVjdG9yIGlzIGEgc3BlY2lhbCBjYXNlLlxuICAgIHZhciBwcm9wID0gJ2NvbnN0cnVjdG9yJztcbiAgICBpZiAoXy5oYXMob2JqLCBwcm9wKSAmJiAhXy5jb250YWlucyhrZXlzLCBwcm9wKSkga2V5cy5wdXNoKHByb3ApO1xuXG4gICAgd2hpbGUgKG5vbkVudW1JZHgtLSkge1xuICAgICAgcHJvcCA9IG5vbkVudW1lcmFibGVQcm9wc1tub25FbnVtSWR4XTtcbiAgICAgIGlmIChwcm9wIGluIG9iaiAmJiBvYmpbcHJvcF0gIT09IHByb3RvW3Byb3BdICYmICFfLmNvbnRhaW5zKGtleXMsIHByb3ApKSB7XG4gICAgICAgIGtleXMucHVzaChwcm9wKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZXRyaWV2ZSB0aGUgbmFtZXMgb2YgYW4gb2JqZWN0J3Mgb3duIHByb3BlcnRpZXMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBPYmplY3Qua2V5c2BcbiAgXy5rZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBbXTtcbiAgICBpZiAobmF0aXZlS2V5cykgcmV0dXJuIG5hdGl2ZUtleXMob2JqKTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICAgIC8vIEFoZW0sIElFIDwgOS5cbiAgICBpZiAoaGFzRW51bUJ1ZykgY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpO1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIGFsbCB0aGUgcHJvcGVydHkgbmFtZXMgb2YgYW4gb2JqZWN0LlxuICBfLmFsbEtleXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIFtdO1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikga2V5cy5wdXNoKGtleSk7XG4gICAgLy8gQWhlbSwgSUUgPCA5LlxuICAgIGlmIChoYXNFbnVtQnVnKSBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cyk7XG4gICAgcmV0dXJuIGtleXM7XG4gIH07XG5cbiAgLy8gUmV0cmlldmUgdGhlIHZhbHVlcyBvZiBhbiBvYmplY3QncyBwcm9wZXJ0aWVzLlxuICBfLnZhbHVlcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIHZhciB2YWx1ZXMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhbHVlc1tpXSA9IG9ialtrZXlzW2ldXTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfTtcblxuICAvLyBSZXR1cm5zIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRlZSB0byBlYWNoIGVsZW1lbnQgb2YgdGhlIG9iamVjdFxuICAvLyBJbiBjb250cmFzdCB0byBfLm1hcCBpdCByZXR1cm5zIGFuIG9iamVjdFxuICBfLm1hcE9iamVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICBfLmtleXMob2JqKSxcbiAgICAgICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgICAgICByZXN1bHRzID0ge30sXG4gICAgICAgICAgY3VycmVudEtleTtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgY3VycmVudEtleSA9IGtleXNbaW5kZXhdO1xuICAgICAgICByZXN1bHRzW2N1cnJlbnRLZXldID0gaXRlcmF0ZWUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ29udmVydCBhbiBvYmplY3QgaW50byBhIGxpc3Qgb2YgYFtrZXksIHZhbHVlXWAgcGFpcnMuXG4gIF8ucGFpcnMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB2YXIgcGFpcnMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHBhaXJzW2ldID0gW2tleXNbaV0sIG9ialtrZXlzW2ldXV07XG4gICAgfVxuICAgIHJldHVybiBwYWlycztcbiAgfTtcblxuICAvLyBJbnZlcnQgdGhlIGtleXMgYW5kIHZhbHVlcyBvZiBhbiBvYmplY3QuIFRoZSB2YWx1ZXMgbXVzdCBiZSBzZXJpYWxpemFibGUuXG4gIF8uaW52ZXJ0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHJlc3VsdFtvYmpba2V5c1tpXV1dID0ga2V5c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBzb3J0ZWQgbGlzdCBvZiB0aGUgZnVuY3Rpb24gbmFtZXMgYXZhaWxhYmxlIG9uIHRoZSBvYmplY3QuXG4gIC8vIEFsaWFzZWQgYXMgYG1ldGhvZHNgXG4gIF8uZnVuY3Rpb25zID0gXy5tZXRob2RzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIG5hbWVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKF8uaXNGdW5jdGlvbihvYmpba2V5XSkpIG5hbWVzLnB1c2goa2V5KTtcbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzLnNvcnQoKTtcbiAgfTtcblxuICAvLyBFeHRlbmQgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIHByb3BlcnRpZXMgaW4gcGFzc2VkLWluIG9iamVjdChzKS5cbiAgXy5leHRlbmQgPSBjcmVhdGVBc3NpZ25lcihfLmFsbEtleXMpO1xuXG4gIC8vIEFzc2lnbnMgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIG93biBwcm9wZXJ0aWVzIGluIHRoZSBwYXNzZWQtaW4gb2JqZWN0KHMpXG4gIC8vIChodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3QvYXNzaWduKVxuICBfLmV4dGVuZE93biA9IF8uYXNzaWduID0gY3JlYXRlQXNzaWduZXIoXy5rZXlzKTtcblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBrZXkgb24gYW4gb2JqZWN0IHRoYXQgcGFzc2VzIGEgcHJlZGljYXRlIHRlc3RcbiAgXy5maW5kS2V5ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaiksIGtleTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAga2V5ID0ga2V5c1tpXTtcbiAgICAgIGlmIChwcmVkaWNhdGUob2JqW2tleV0sIGtleSwgb2JqKSkgcmV0dXJuIGtleTtcbiAgICB9XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IG9ubHkgY29udGFpbmluZyB0aGUgd2hpdGVsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5waWNrID0gZnVuY3Rpb24ob2JqZWN0LCBvaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0ge30sIG9iaiA9IG9iamVjdCwgaXRlcmF0ZWUsIGtleXM7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChfLmlzRnVuY3Rpb24ob2l0ZXJhdGVlKSkge1xuICAgICAga2V5cyA9IF8uYWxsS2V5cyhvYmopO1xuICAgICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKG9pdGVyYXRlZSwgY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtleXMgPSBmbGF0dGVuKGFyZ3VtZW50cywgZmFsc2UsIGZhbHNlLCAxKTtcbiAgICAgIGl0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGtleSwgb2JqKSB7IHJldHVybiBrZXkgaW4gb2JqOyB9O1xuICAgICAgb2JqID0gT2JqZWN0KG9iaik7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIHZhciB2YWx1ZSA9IG9ialtrZXldO1xuICAgICAgaWYgKGl0ZXJhdGVlKHZhbHVlLCBrZXksIG9iaikpIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCB3aXRob3V0IHRoZSBibGFja2xpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLm9taXQgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihpdGVyYXRlZSkpIHtcbiAgICAgIGl0ZXJhdGVlID0gXy5uZWdhdGUoaXRlcmF0ZWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIga2V5cyA9IF8ubWFwKGZsYXR0ZW4oYXJndW1lbnRzLCBmYWxzZSwgZmFsc2UsIDEpLCBTdHJpbmcpO1xuICAgICAgaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgICAgIHJldHVybiAhXy5jb250YWlucyhrZXlzLCBrZXkpO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIF8ucGljayhvYmosIGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBGaWxsIGluIGEgZ2l2ZW4gb2JqZWN0IHdpdGggZGVmYXVsdCBwcm9wZXJ0aWVzLlxuICBfLmRlZmF1bHRzID0gY3JlYXRlQXNzaWduZXIoXy5hbGxLZXlzLCB0cnVlKTtcblxuICAvLyBDcmVhdGVzIGFuIG9iamVjdCB0aGF0IGluaGVyaXRzIGZyb20gdGhlIGdpdmVuIHByb3RvdHlwZSBvYmplY3QuXG4gIC8vIElmIGFkZGl0aW9uYWwgcHJvcGVydGllcyBhcmUgcHJvdmlkZWQgdGhlbiB0aGV5IHdpbGwgYmUgYWRkZWQgdG8gdGhlXG4gIC8vIGNyZWF0ZWQgb2JqZWN0LlxuICBfLmNyZWF0ZSA9IGZ1bmN0aW9uKHByb3RvdHlwZSwgcHJvcHMpIHtcbiAgICB2YXIgcmVzdWx0ID0gYmFzZUNyZWF0ZShwcm90b3R5cGUpO1xuICAgIGlmIChwcm9wcykgXy5leHRlbmRPd24ocmVzdWx0LCBwcm9wcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSAoc2hhbGxvdy1jbG9uZWQpIGR1cGxpY2F0ZSBvZiBhbiBvYmplY3QuXG4gIF8uY2xvbmUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIG9iajtcbiAgICByZXR1cm4gXy5pc0FycmF5KG9iaikgPyBvYmouc2xpY2UoKSA6IF8uZXh0ZW5kKHt9LCBvYmopO1xuICB9O1xuXG4gIC8vIEludm9rZXMgaW50ZXJjZXB0b3Igd2l0aCB0aGUgb2JqLCBhbmQgdGhlbiByZXR1cm5zIG9iai5cbiAgLy8gVGhlIHByaW1hcnkgcHVycG9zZSBvZiB0aGlzIG1ldGhvZCBpcyB0byBcInRhcCBpbnRvXCIgYSBtZXRob2QgY2hhaW4sIGluXG4gIC8vIG9yZGVyIHRvIHBlcmZvcm0gb3BlcmF0aW9ucyBvbiBpbnRlcm1lZGlhdGUgcmVzdWx0cyB3aXRoaW4gdGhlIGNoYWluLlxuICBfLnRhcCA9IGZ1bmN0aW9uKG9iaiwgaW50ZXJjZXB0b3IpIHtcbiAgICBpbnRlcmNlcHRvcihvYmopO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJucyB3aGV0aGVyIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBzZXQgb2YgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uaXNNYXRjaCA9IGZ1bmN0aW9uKG9iamVjdCwgYXR0cnMpIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhhdHRycyksIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkgcmV0dXJuICFsZW5ndGg7XG4gICAgdmFyIG9iaiA9IE9iamVjdChvYmplY3QpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgaWYgKGF0dHJzW2tleV0gIT09IG9ialtrZXldIHx8ICEoa2V5IGluIG9iaikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cblxuICAvLyBJbnRlcm5hbCByZWN1cnNpdmUgY29tcGFyaXNvbiBmdW5jdGlvbiBmb3IgYGlzRXF1YWxgLlxuICB2YXIgZXEgPSBmdW5jdGlvbihhLCBiLCBhU3RhY2ssIGJTdGFjaykge1xuICAgIC8vIElkZW50aWNhbCBvYmplY3RzIGFyZSBlcXVhbC4gYDAgPT09IC0wYCwgYnV0IHRoZXkgYXJlbid0IGlkZW50aWNhbC5cbiAgICAvLyBTZWUgdGhlIFtIYXJtb255IGBlZ2FsYCBwcm9wb3NhbF0oaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9aGFybW9ueTplZ2FsKS5cbiAgICBpZiAoYSA9PT0gYikgcmV0dXJuIGEgIT09IDAgfHwgMSAvIGEgPT09IDEgLyBiO1xuICAgIC8vIEEgc3RyaWN0IGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5IGJlY2F1c2UgYG51bGwgPT0gdW5kZWZpbmVkYC5cbiAgICBpZiAoYSA9PSBudWxsIHx8IGIgPT0gbnVsbCkgcmV0dXJuIGEgPT09IGI7XG4gICAgLy8gVW53cmFwIGFueSB3cmFwcGVkIG9iamVjdHMuXG4gICAgaWYgKGEgaW5zdGFuY2VvZiBfKSBhID0gYS5fd3JhcHBlZDtcbiAgICBpZiAoYiBpbnN0YW5jZW9mIF8pIGIgPSBiLl93cmFwcGVkO1xuICAgIC8vIENvbXBhcmUgYFtbQ2xhc3NdXWAgbmFtZXMuXG4gICAgdmFyIGNsYXNzTmFtZSA9IHRvU3RyaW5nLmNhbGwoYSk7XG4gICAgaWYgKGNsYXNzTmFtZSAhPT0gdG9TdHJpbmcuY2FsbChiKSkgcmV0dXJuIGZhbHNlO1xuICAgIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgICAvLyBTdHJpbmdzLCBudW1iZXJzLCByZWd1bGFyIGV4cHJlc3Npb25zLCBkYXRlcywgYW5kIGJvb2xlYW5zIGFyZSBjb21wYXJlZCBieSB2YWx1ZS5cbiAgICAgIGNhc2UgJ1tvYmplY3QgUmVnRXhwXSc6XG4gICAgICAvLyBSZWdFeHBzIGFyZSBjb2VyY2VkIHRvIHN0cmluZ3MgZm9yIGNvbXBhcmlzb24gKE5vdGU6ICcnICsgL2EvaSA9PT0gJy9hL2knKVxuICAgICAgY2FzZSAnW29iamVjdCBTdHJpbmddJzpcbiAgICAgICAgLy8gUHJpbWl0aXZlcyBhbmQgdGhlaXIgY29ycmVzcG9uZGluZyBvYmplY3Qgd3JhcHBlcnMgYXJlIGVxdWl2YWxlbnQ7IHRodXMsIGBcIjVcImAgaXNcbiAgICAgICAgLy8gZXF1aXZhbGVudCB0byBgbmV3IFN0cmluZyhcIjVcIilgLlxuICAgICAgICByZXR1cm4gJycgKyBhID09PSAnJyArIGI7XG4gICAgICBjYXNlICdbb2JqZWN0IE51bWJlcl0nOlxuICAgICAgICAvLyBgTmFOYHMgYXJlIGVxdWl2YWxlbnQsIGJ1dCBub24tcmVmbGV4aXZlLlxuICAgICAgICAvLyBPYmplY3QoTmFOKSBpcyBlcXVpdmFsZW50IHRvIE5hTlxuICAgICAgICBpZiAoK2EgIT09ICthKSByZXR1cm4gK2IgIT09ICtiO1xuICAgICAgICAvLyBBbiBgZWdhbGAgY29tcGFyaXNvbiBpcyBwZXJmb3JtZWQgZm9yIG90aGVyIG51bWVyaWMgdmFsdWVzLlxuICAgICAgICByZXR1cm4gK2EgPT09IDAgPyAxIC8gK2EgPT09IDEgLyBiIDogK2EgPT09ICtiO1xuICAgICAgY2FzZSAnW29iamVjdCBEYXRlXSc6XG4gICAgICBjYXNlICdbb2JqZWN0IEJvb2xlYW5dJzpcbiAgICAgICAgLy8gQ29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1lcmljIHByaW1pdGl2ZSB2YWx1ZXMuIERhdGVzIGFyZSBjb21wYXJlZCBieSB0aGVpclxuICAgICAgICAvLyBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnMuIE5vdGUgdGhhdCBpbnZhbGlkIGRhdGVzIHdpdGggbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zXG4gICAgICAgIC8vIG9mIGBOYU5gIGFyZSBub3QgZXF1aXZhbGVudC5cbiAgICAgICAgcmV0dXJuICthID09PSArYjtcbiAgICB9XG5cbiAgICB2YXIgYXJlQXJyYXlzID0gY2xhc3NOYW1lID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIGlmICghYXJlQXJyYXlzKSB7XG4gICAgICBpZiAodHlwZW9mIGEgIT0gJ29iamVjdCcgfHwgdHlwZW9mIGIgIT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcblxuICAgICAgLy8gT2JqZWN0cyB3aXRoIGRpZmZlcmVudCBjb25zdHJ1Y3RvcnMgYXJlIG5vdCBlcXVpdmFsZW50LCBidXQgYE9iamVjdGBzIG9yIGBBcnJheWBzXG4gICAgICAvLyBmcm9tIGRpZmZlcmVudCBmcmFtZXMgYXJlLlxuICAgICAgdmFyIGFDdG9yID0gYS5jb25zdHJ1Y3RvciwgYkN0b3IgPSBiLmNvbnN0cnVjdG9yO1xuICAgICAgaWYgKGFDdG9yICE9PSBiQ3RvciAmJiAhKF8uaXNGdW5jdGlvbihhQ3RvcikgJiYgYUN0b3IgaW5zdGFuY2VvZiBhQ3RvciAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uaXNGdW5jdGlvbihiQ3RvcikgJiYgYkN0b3IgaW5zdGFuY2VvZiBiQ3RvcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgKCdjb25zdHJ1Y3RvcicgaW4gYSAmJiAnY29uc3RydWN0b3InIGluIGIpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gQXNzdW1lIGVxdWFsaXR5IGZvciBjeWNsaWMgc3RydWN0dXJlcy4gVGhlIGFsZ29yaXRobSBmb3IgZGV0ZWN0aW5nIGN5Y2xpY1xuICAgIC8vIHN0cnVjdHVyZXMgaXMgYWRhcHRlZCBmcm9tIEVTIDUuMSBzZWN0aW9uIDE1LjEyLjMsIGFic3RyYWN0IG9wZXJhdGlvbiBgSk9gLlxuXG4gICAgLy8gSW5pdGlhbGl6aW5nIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIC8vIEl0J3MgZG9uZSBoZXJlIHNpbmNlIHdlIG9ubHkgbmVlZCB0aGVtIGZvciBvYmplY3RzIGFuZCBhcnJheXMgY29tcGFyaXNvbi5cbiAgICBhU3RhY2sgPSBhU3RhY2sgfHwgW107XG4gICAgYlN0YWNrID0gYlN0YWNrIHx8IFtdO1xuICAgIHZhciBsZW5ndGggPSBhU3RhY2subGVuZ3RoO1xuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgLy8gTGluZWFyIHNlYXJjaC4gUGVyZm9ybWFuY2UgaXMgaW52ZXJzZWx5IHByb3BvcnRpb25hbCB0byB0aGUgbnVtYmVyIG9mXG4gICAgICAvLyB1bmlxdWUgbmVzdGVkIHN0cnVjdHVyZXMuXG4gICAgICBpZiAoYVN0YWNrW2xlbmd0aF0gPT09IGEpIHJldHVybiBiU3RhY2tbbGVuZ3RoXSA9PT0gYjtcbiAgICB9XG5cbiAgICAvLyBBZGQgdGhlIGZpcnN0IG9iamVjdCB0byB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnB1c2goYSk7XG4gICAgYlN0YWNrLnB1c2goYik7XG5cbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cy5cbiAgICBpZiAoYXJlQXJyYXlzKSB7XG4gICAgICAvLyBDb21wYXJlIGFycmF5IGxlbmd0aHMgdG8gZGV0ZXJtaW5lIGlmIGEgZGVlcCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeS5cbiAgICAgIGxlbmd0aCA9IGEubGVuZ3RoO1xuICAgICAgaWYgKGxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgIC8vIERlZXAgY29tcGFyZSB0aGUgY29udGVudHMsIGlnbm9yaW5nIG5vbi1udW1lcmljIHByb3BlcnRpZXMuXG4gICAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgICAgaWYgKCFlcShhW2xlbmd0aF0sIGJbbGVuZ3RoXSwgYVN0YWNrLCBiU3RhY2spKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERlZXAgY29tcGFyZSBvYmplY3RzLlxuICAgICAgdmFyIGtleXMgPSBfLmtleXMoYSksIGtleTtcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgICAgLy8gRW5zdXJlIHRoYXQgYm90aCBvYmplY3RzIGNvbnRhaW4gdGhlIHNhbWUgbnVtYmVyIG9mIHByb3BlcnRpZXMgYmVmb3JlIGNvbXBhcmluZyBkZWVwIGVxdWFsaXR5LlxuICAgICAgaWYgKF8ua2V5cyhiKS5sZW5ndGggIT09IGxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAgIC8vIERlZXAgY29tcGFyZSBlYWNoIG1lbWJlclxuICAgICAgICBrZXkgPSBrZXlzW2xlbmd0aF07XG4gICAgICAgIGlmICghKF8uaGFzKGIsIGtleSkgJiYgZXEoYVtrZXldLCBiW2tleV0sIGFTdGFjaywgYlN0YWNrKSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gUmVtb3ZlIHRoZSBmaXJzdCBvYmplY3QgZnJvbSB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnBvcCgpO1xuICAgIGJTdGFjay5wb3AoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBQZXJmb3JtIGEgZGVlcCBjb21wYXJpc29uIHRvIGNoZWNrIGlmIHR3byBvYmplY3RzIGFyZSBlcXVhbC5cbiAgXy5pc0VxdWFsID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBlcShhLCBiKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIGFycmF5LCBzdHJpbmcsIG9yIG9iamVjdCBlbXB0eT9cbiAgLy8gQW4gXCJlbXB0eVwiIG9iamVjdCBoYXMgbm8gZW51bWVyYWJsZSBvd24tcHJvcGVydGllcy5cbiAgXy5pc0VtcHR5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSAmJiAoXy5pc0FycmF5KG9iaikgfHwgXy5pc1N0cmluZyhvYmopIHx8IF8uaXNBcmd1bWVudHMob2JqKSkpIHJldHVybiBvYmoubGVuZ3RoID09PSAwO1xuICAgIHJldHVybiBfLmtleXMob2JqKS5sZW5ndGggPT09IDA7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIERPTSBlbGVtZW50P1xuICBfLmlzRWxlbWVudCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiAhIShvYmogJiYgb2JqLm5vZGVUeXBlID09PSAxKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGFuIGFycmF5P1xuICAvLyBEZWxlZ2F0ZXMgdG8gRUNNQTUncyBuYXRpdmUgQXJyYXkuaXNBcnJheVxuICBfLmlzQXJyYXkgPSBuYXRpdmVJc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSBhbiBvYmplY3Q/XG4gIF8uaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgdHlwZSA9IHR5cGVvZiBvYmo7XG4gICAgcmV0dXJuIHR5cGUgPT09ICdmdW5jdGlvbicgfHwgdHlwZSA9PT0gJ29iamVjdCcgJiYgISFvYmo7XG4gIH07XG5cbiAgLy8gQWRkIHNvbWUgaXNUeXBlIG1ldGhvZHM6IGlzQXJndW1lbnRzLCBpc0Z1bmN0aW9uLCBpc1N0cmluZywgaXNOdW1iZXIsIGlzRGF0ZSwgaXNSZWdFeHAsIGlzRXJyb3IuXG4gIF8uZWFjaChbJ0FyZ3VtZW50cycsICdGdW5jdGlvbicsICdTdHJpbmcnLCAnTnVtYmVyJywgJ0RhdGUnLCAnUmVnRXhwJywgJ0Vycm9yJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBfWydpcycgKyBuYW1lXSA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgJyArIG5hbWUgKyAnXSc7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRGVmaW5lIGEgZmFsbGJhY2sgdmVyc2lvbiBvZiB0aGUgbWV0aG9kIGluIGJyb3dzZXJzIChhaGVtLCBJRSA8IDkpLCB3aGVyZVxuICAvLyB0aGVyZSBpc24ndCBhbnkgaW5zcGVjdGFibGUgXCJBcmd1bWVudHNcIiB0eXBlLlxuICBpZiAoIV8uaXNBcmd1bWVudHMoYXJndW1lbnRzKSkge1xuICAgIF8uaXNBcmd1bWVudHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBfLmhhcyhvYmosICdjYWxsZWUnKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gT3B0aW1pemUgYGlzRnVuY3Rpb25gIGlmIGFwcHJvcHJpYXRlLiBXb3JrIGFyb3VuZCBzb21lIHR5cGVvZiBidWdzIGluIG9sZCB2OCxcbiAgLy8gSUUgMTEgKCMxNjIxKSwgYW5kIGluIFNhZmFyaSA4ICgjMTkyOSkuXG4gIGlmICh0eXBlb2YgLy4vICE9ICdmdW5jdGlvbicgJiYgdHlwZW9mIEludDhBcnJheSAhPSAnb2JqZWN0Jykge1xuICAgIF8uaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT0gJ2Z1bmN0aW9uJyB8fCBmYWxzZTtcbiAgICB9O1xuICB9XG5cbiAgLy8gSXMgYSBnaXZlbiBvYmplY3QgYSBmaW5pdGUgbnVtYmVyP1xuICBfLmlzRmluaXRlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIGlzRmluaXRlKG9iaikgJiYgIWlzTmFOKHBhcnNlRmxvYXQob2JqKSk7XG4gIH07XG5cbiAgLy8gSXMgdGhlIGdpdmVuIHZhbHVlIGBOYU5gPyAoTmFOIGlzIHRoZSBvbmx5IG51bWJlciB3aGljaCBkb2VzIG5vdCBlcXVhbCBpdHNlbGYpLlxuICBfLmlzTmFOID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8uaXNOdW1iZXIob2JqKSAmJiBvYmogIT09ICtvYmo7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIGJvb2xlYW4/XG4gIF8uaXNCb29sZWFuID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdHJ1ZSB8fCBvYmogPT09IGZhbHNlIHx8IHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQm9vbGVhbl0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgZXF1YWwgdG8gbnVsbD9cbiAgXy5pc051bGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBudWxsO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgdW5kZWZpbmVkP1xuICBfLmlzVW5kZWZpbmVkID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdm9pZCAwO1xuICB9O1xuXG4gIC8vIFNob3J0Y3V0IGZ1bmN0aW9uIGZvciBjaGVja2luZyBpZiBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gcHJvcGVydHkgZGlyZWN0bHlcbiAgLy8gb24gaXRzZWxmIChpbiBvdGhlciB3b3Jkcywgbm90IG9uIGEgcHJvdG90eXBlKS5cbiAgXy5oYXMgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBvYmogIT0gbnVsbCAmJiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgfTtcblxuICAvLyBVdGlsaXR5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJ1biBVbmRlcnNjb3JlLmpzIGluICpub0NvbmZsaWN0KiBtb2RlLCByZXR1cm5pbmcgdGhlIGBfYCB2YXJpYWJsZSB0byBpdHNcbiAgLy8gcHJldmlvdXMgb3duZXIuIFJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICByb290Ll8gPSBwcmV2aW91c1VuZGVyc2NvcmU7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gS2VlcCB0aGUgaWRlbnRpdHkgZnVuY3Rpb24gYXJvdW5kIGZvciBkZWZhdWx0IGl0ZXJhdGVlcy5cbiAgXy5pZGVudGl0eSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9O1xuXG4gIC8vIFByZWRpY2F0ZS1nZW5lcmF0aW5nIGZ1bmN0aW9ucy4gT2Z0ZW4gdXNlZnVsIG91dHNpZGUgb2YgVW5kZXJzY29yZS5cbiAgXy5jb25zdGFudCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH07XG4gIH07XG5cbiAgXy5ub29wID0gZnVuY3Rpb24oKXt9O1xuXG4gIF8ucHJvcGVydHkgPSBwcm9wZXJ0eTtcblxuICAvLyBHZW5lcmF0ZXMgYSBmdW5jdGlvbiBmb3IgYSBnaXZlbiBvYmplY3QgdGhhdCByZXR1cm5zIGEgZ2l2ZW4gcHJvcGVydHkuXG4gIF8ucHJvcGVydHlPZiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT0gbnVsbCA/IGZ1bmN0aW9uKCl7fSA6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIHByZWRpY2F0ZSBmb3IgY2hlY2tpbmcgd2hldGhlciBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gc2V0IG9mXG4gIC8vIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLm1hdGNoZXIgPSBfLm1hdGNoZXMgPSBmdW5jdGlvbihhdHRycykge1xuICAgIGF0dHJzID0gXy5leHRlbmRPd24oe30sIGF0dHJzKTtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gXy5pc01hdGNoKG9iaiwgYXR0cnMpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUnVuIGEgZnVuY3Rpb24gKipuKiogdGltZXMuXG4gIF8udGltZXMgPSBmdW5jdGlvbihuLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciBhY2N1bSA9IEFycmF5KE1hdGgubWF4KDAsIG4pKTtcbiAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQsIDEpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSBhY2N1bVtpXSA9IGl0ZXJhdGVlKGkpO1xuICAgIHJldHVybiBhY2N1bTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSByYW5kb20gaW50ZWdlciBiZXR3ZWVuIG1pbiBhbmQgbWF4IChpbmNsdXNpdmUpLlxuICBfLnJhbmRvbSA9IGZ1bmN0aW9uKG1pbiwgbWF4KSB7XG4gICAgaWYgKG1heCA9PSBudWxsKSB7XG4gICAgICBtYXggPSBtaW47XG4gICAgICBtaW4gPSAwO1xuICAgIH1cbiAgICByZXR1cm4gbWluICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbiArIDEpKTtcbiAgfTtcblxuICAvLyBBIChwb3NzaWJseSBmYXN0ZXIpIHdheSB0byBnZXQgdGhlIGN1cnJlbnQgdGltZXN0YW1wIGFzIGFuIGludGVnZXIuXG4gIF8ubm93ID0gRGF0ZS5ub3cgfHwgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB9O1xuXG4gICAvLyBMaXN0IG9mIEhUTUwgZW50aXRpZXMgZm9yIGVzY2FwaW5nLlxuICB2YXIgZXNjYXBlTWFwID0ge1xuICAgICcmJzogJyZhbXA7JyxcbiAgICAnPCc6ICcmbHQ7JyxcbiAgICAnPic6ICcmZ3Q7JyxcbiAgICAnXCInOiAnJnF1b3Q7JyxcbiAgICBcIidcIjogJyYjeDI3OycsXG4gICAgJ2AnOiAnJiN4NjA7J1xuICB9O1xuICB2YXIgdW5lc2NhcGVNYXAgPSBfLmludmVydChlc2NhcGVNYXApO1xuXG4gIC8vIEZ1bmN0aW9ucyBmb3IgZXNjYXBpbmcgYW5kIHVuZXNjYXBpbmcgc3RyaW5ncyB0by9mcm9tIEhUTUwgaW50ZXJwb2xhdGlvbi5cbiAgdmFyIGNyZWF0ZUVzY2FwZXIgPSBmdW5jdGlvbihtYXApIHtcbiAgICB2YXIgZXNjYXBlciA9IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICByZXR1cm4gbWFwW21hdGNoXTtcbiAgICB9O1xuICAgIC8vIFJlZ2V4ZXMgZm9yIGlkZW50aWZ5aW5nIGEga2V5IHRoYXQgbmVlZHMgdG8gYmUgZXNjYXBlZFxuICAgIHZhciBzb3VyY2UgPSAnKD86JyArIF8ua2V5cyhtYXApLmpvaW4oJ3wnKSArICcpJztcbiAgICB2YXIgdGVzdFJlZ2V4cCA9IFJlZ0V4cChzb3VyY2UpO1xuICAgIHZhciByZXBsYWNlUmVnZXhwID0gUmVnRXhwKHNvdXJjZSwgJ2cnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgICBzdHJpbmcgPSBzdHJpbmcgPT0gbnVsbCA/ICcnIDogJycgKyBzdHJpbmc7XG4gICAgICByZXR1cm4gdGVzdFJlZ2V4cC50ZXN0KHN0cmluZykgPyBzdHJpbmcucmVwbGFjZShyZXBsYWNlUmVnZXhwLCBlc2NhcGVyKSA6IHN0cmluZztcbiAgICB9O1xuICB9O1xuICBfLmVzY2FwZSA9IGNyZWF0ZUVzY2FwZXIoZXNjYXBlTWFwKTtcbiAgXy51bmVzY2FwZSA9IGNyZWF0ZUVzY2FwZXIodW5lc2NhcGVNYXApO1xuXG4gIC8vIElmIHRoZSB2YWx1ZSBvZiB0aGUgbmFtZWQgYHByb3BlcnR5YCBpcyBhIGZ1bmN0aW9uIHRoZW4gaW52b2tlIGl0IHdpdGggdGhlXG4gIC8vIGBvYmplY3RgIGFzIGNvbnRleHQ7IG90aGVyd2lzZSwgcmV0dXJuIGl0LlxuICBfLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHksIGZhbGxiYWNrKSB7XG4gICAgdmFyIHZhbHVlID0gb2JqZWN0ID09IG51bGwgPyB2b2lkIDAgOiBvYmplY3RbcHJvcGVydHldO1xuICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgICB2YWx1ZSA9IGZhbGxiYWNrO1xuICAgIH1cbiAgICByZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmNhbGwob2JqZWN0KSA6IHZhbHVlO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIGEgdW5pcXVlIGludGVnZXIgaWQgKHVuaXF1ZSB3aXRoaW4gdGhlIGVudGlyZSBjbGllbnQgc2Vzc2lvbikuXG4gIC8vIFVzZWZ1bCBmb3IgdGVtcG9yYXJ5IERPTSBpZHMuXG4gIHZhciBpZENvdW50ZXIgPSAwO1xuICBfLnVuaXF1ZUlkID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgfTtcblxuICAvLyBCeSBkZWZhdWx0LCBVbmRlcnNjb3JlIHVzZXMgRVJCLXN0eWxlIHRlbXBsYXRlIGRlbGltaXRlcnMsIGNoYW5nZSB0aGVcbiAgLy8gZm9sbG93aW5nIHRlbXBsYXRlIHNldHRpbmdzIHRvIHVzZSBhbHRlcm5hdGl2ZSBkZWxpbWl0ZXJzLlxuICBfLnRlbXBsYXRlU2V0dGluZ3MgPSB7XG4gICAgZXZhbHVhdGUgICAgOiAvPCUoW1xcc1xcU10rPyklPi9nLFxuICAgIGludGVycG9sYXRlIDogLzwlPShbXFxzXFxTXSs/KSU+L2csXG4gICAgZXNjYXBlICAgICAgOiAvPCUtKFtcXHNcXFNdKz8pJT4vZ1xuICB9O1xuXG4gIC8vIFdoZW4gY3VzdG9taXppbmcgYHRlbXBsYXRlU2V0dGluZ3NgLCBpZiB5b3UgZG9uJ3Qgd2FudCB0byBkZWZpbmUgYW5cbiAgLy8gaW50ZXJwb2xhdGlvbiwgZXZhbHVhdGlvbiBvciBlc2NhcGluZyByZWdleCwgd2UgbmVlZCBvbmUgdGhhdCBpc1xuICAvLyBndWFyYW50ZWVkIG5vdCB0byBtYXRjaC5cbiAgdmFyIG5vTWF0Y2ggPSAvKC4pXi87XG5cbiAgLy8gQ2VydGFpbiBjaGFyYWN0ZXJzIG5lZWQgdG8gYmUgZXNjYXBlZCBzbyB0aGF0IHRoZXkgY2FuIGJlIHB1dCBpbnRvIGFcbiAgLy8gc3RyaW5nIGxpdGVyYWwuXG4gIHZhciBlc2NhcGVzID0ge1xuICAgIFwiJ1wiOiAgICAgIFwiJ1wiLFxuICAgICdcXFxcJzogICAgICdcXFxcJyxcbiAgICAnXFxyJzogICAgICdyJyxcbiAgICAnXFxuJzogICAgICduJyxcbiAgICAnXFx1MjAyOCc6ICd1MjAyOCcsXG4gICAgJ1xcdTIwMjknOiAndTIwMjknXG4gIH07XG5cbiAgdmFyIGVzY2FwZXIgPSAvXFxcXHwnfFxccnxcXG58XFx1MjAyOHxcXHUyMDI5L2c7XG5cbiAgdmFyIGVzY2FwZUNoYXIgPSBmdW5jdGlvbihtYXRjaCkge1xuICAgIHJldHVybiAnXFxcXCcgKyBlc2NhcGVzW21hdGNoXTtcbiAgfTtcblxuICAvLyBKYXZhU2NyaXB0IG1pY3JvLXRlbXBsYXRpbmcsIHNpbWlsYXIgdG8gSm9obiBSZXNpZydzIGltcGxlbWVudGF0aW9uLlxuICAvLyBVbmRlcnNjb3JlIHRlbXBsYXRpbmcgaGFuZGxlcyBhcmJpdHJhcnkgZGVsaW1pdGVycywgcHJlc2VydmVzIHdoaXRlc3BhY2UsXG4gIC8vIGFuZCBjb3JyZWN0bHkgZXNjYXBlcyBxdW90ZXMgd2l0aGluIGludGVycG9sYXRlZCBjb2RlLlxuICAvLyBOQjogYG9sZFNldHRpbmdzYCBvbmx5IGV4aXN0cyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gIF8udGVtcGxhdGUgPSBmdW5jdGlvbih0ZXh0LCBzZXR0aW5ncywgb2xkU2V0dGluZ3MpIHtcbiAgICBpZiAoIXNldHRpbmdzICYmIG9sZFNldHRpbmdzKSBzZXR0aW5ncyA9IG9sZFNldHRpbmdzO1xuICAgIHNldHRpbmdzID0gXy5kZWZhdWx0cyh7fSwgc2V0dGluZ3MsIF8udGVtcGxhdGVTZXR0aW5ncyk7XG5cbiAgICAvLyBDb21iaW5lIGRlbGltaXRlcnMgaW50byBvbmUgcmVndWxhciBleHByZXNzaW9uIHZpYSBhbHRlcm5hdGlvbi5cbiAgICB2YXIgbWF0Y2hlciA9IFJlZ0V4cChbXG4gICAgICAoc2V0dGluZ3MuZXNjYXBlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5pbnRlcnBvbGF0ZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuZXZhbHVhdGUgfHwgbm9NYXRjaCkuc291cmNlXG4gICAgXS5qb2luKCd8JykgKyAnfCQnLCAnZycpO1xuXG4gICAgLy8gQ29tcGlsZSB0aGUgdGVtcGxhdGUgc291cmNlLCBlc2NhcGluZyBzdHJpbmcgbGl0ZXJhbHMgYXBwcm9wcmlhdGVseS5cbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzb3VyY2UgPSBcIl9fcCs9J1wiO1xuICAgIHRleHQucmVwbGFjZShtYXRjaGVyLCBmdW5jdGlvbihtYXRjaCwgZXNjYXBlLCBpbnRlcnBvbGF0ZSwgZXZhbHVhdGUsIG9mZnNldCkge1xuICAgICAgc291cmNlICs9IHRleHQuc2xpY2UoaW5kZXgsIG9mZnNldCkucmVwbGFjZShlc2NhcGVyLCBlc2NhcGVDaGFyKTtcbiAgICAgIGluZGV4ID0gb2Zmc2V0ICsgbWF0Y2gubGVuZ3RoO1xuXG4gICAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgZXNjYXBlICsgXCIpKT09bnVsbD8nJzpfLmVzY2FwZShfX3QpKStcXG4nXCI7XG4gICAgICB9IGVsc2UgaWYgKGludGVycG9sYXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgaW50ZXJwb2xhdGUgKyBcIikpPT1udWxsPycnOl9fdCkrXFxuJ1wiO1xuICAgICAgfSBlbHNlIGlmIChldmFsdWF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInO1xcblwiICsgZXZhbHVhdGUgKyBcIlxcbl9fcCs9J1wiO1xuICAgICAgfVxuXG4gICAgICAvLyBBZG9iZSBWTXMgbmVlZCB0aGUgbWF0Y2ggcmV0dXJuZWQgdG8gcHJvZHVjZSB0aGUgY29ycmVjdCBvZmZlc3QuXG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG4gICAgc291cmNlICs9IFwiJztcXG5cIjtcblxuICAgIC8vIElmIGEgdmFyaWFibGUgaXMgbm90IHNwZWNpZmllZCwgcGxhY2UgZGF0YSB2YWx1ZXMgaW4gbG9jYWwgc2NvcGUuXG4gICAgaWYgKCFzZXR0aW5ncy52YXJpYWJsZSkgc291cmNlID0gJ3dpdGgob2JqfHx7fSl7XFxuJyArIHNvdXJjZSArICd9XFxuJztcblxuICAgIHNvdXJjZSA9IFwidmFyIF9fdCxfX3A9JycsX19qPUFycmF5LnByb3RvdHlwZS5qb2luLFwiICtcbiAgICAgIFwicHJpbnQ9ZnVuY3Rpb24oKXtfX3ArPV9fai5jYWxsKGFyZ3VtZW50cywnJyk7fTtcXG5cIiArXG4gICAgICBzb3VyY2UgKyAncmV0dXJuIF9fcDtcXG4nO1xuXG4gICAgdHJ5IHtcbiAgICAgIHZhciByZW5kZXIgPSBuZXcgRnVuY3Rpb24oc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicsICdfJywgc291cmNlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlLnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuXG4gICAgdmFyIHRlbXBsYXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgcmV0dXJuIHJlbmRlci5jYWxsKHRoaXMsIGRhdGEsIF8pO1xuICAgIH07XG5cbiAgICAvLyBQcm92aWRlIHRoZSBjb21waWxlZCBzb3VyY2UgYXMgYSBjb252ZW5pZW5jZSBmb3IgcHJlY29tcGlsYXRpb24uXG4gICAgdmFyIGFyZ3VtZW50ID0gc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaic7XG4gICAgdGVtcGxhdGUuc291cmNlID0gJ2Z1bmN0aW9uKCcgKyBhcmd1bWVudCArICcpe1xcbicgKyBzb3VyY2UgKyAnfSc7XG5cbiAgICByZXR1cm4gdGVtcGxhdGU7XG4gIH07XG5cbiAgLy8gQWRkIGEgXCJjaGFpblwiIGZ1bmN0aW9uLiBTdGFydCBjaGFpbmluZyBhIHdyYXBwZWQgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8uY2hhaW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgaW5zdGFuY2UgPSBfKG9iaik7XG4gICAgaW5zdGFuY2UuX2NoYWluID0gdHJ1ZTtcbiAgICByZXR1cm4gaW5zdGFuY2U7XG4gIH07XG5cbiAgLy8gT09QXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAvLyBJZiBVbmRlcnNjb3JlIGlzIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLCBpdCByZXR1cm5zIGEgd3JhcHBlZCBvYmplY3QgdGhhdFxuICAvLyBjYW4gYmUgdXNlZCBPTy1zdHlsZS4gVGhpcyB3cmFwcGVyIGhvbGRzIGFsdGVyZWQgdmVyc2lvbnMgb2YgYWxsIHRoZVxuICAvLyB1bmRlcnNjb3JlIGZ1bmN0aW9ucy4gV3JhcHBlZCBvYmplY3RzIG1heSBiZSBjaGFpbmVkLlxuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb250aW51ZSBjaGFpbmluZyBpbnRlcm1lZGlhdGUgcmVzdWx0cy5cbiAgdmFyIHJlc3VsdCA9IGZ1bmN0aW9uKGluc3RhbmNlLCBvYmopIHtcbiAgICByZXR1cm4gaW5zdGFuY2UuX2NoYWluID8gXyhvYmopLmNoYWluKCkgOiBvYmo7XG4gIH07XG5cbiAgLy8gQWRkIHlvdXIgb3duIGN1c3RvbSBmdW5jdGlvbnMgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm1peGluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgXy5lYWNoKF8uZnVuY3Rpb25zKG9iaiksIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHZhciBmdW5jID0gX1tuYW1lXSA9IG9ialtuYW1lXTtcbiAgICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gW3RoaXMuX3dyYXBwZWRdO1xuICAgICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiByZXN1bHQodGhpcywgZnVuYy5hcHBseShfLCBhcmdzKSk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEFkZCBhbGwgb2YgdGhlIFVuZGVyc2NvcmUgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyIG9iamVjdC5cbiAgXy5taXhpbihfKTtcblxuICAvLyBBZGQgYWxsIG11dGF0b3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBfLmVhY2goWydwb3AnLCAncHVzaCcsICdyZXZlcnNlJywgJ3NoaWZ0JywgJ3NvcnQnLCAnc3BsaWNlJywgJ3Vuc2hpZnQnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb2JqID0gdGhpcy5fd3JhcHBlZDtcbiAgICAgIG1ldGhvZC5hcHBseShvYmosIGFyZ3VtZW50cyk7XG4gICAgICBpZiAoKG5hbWUgPT09ICdzaGlmdCcgfHwgbmFtZSA9PT0gJ3NwbGljZScpICYmIG9iai5sZW5ndGggPT09IDApIGRlbGV0ZSBvYmpbMF07XG4gICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIG9iaik7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gQWRkIGFsbCBhY2Nlc3NvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIF8uZWFjaChbJ2NvbmNhdCcsICdqb2luJywgJ3NsaWNlJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBtZXRob2QuYXBwbHkodGhpcy5fd3JhcHBlZCwgYXJndW1lbnRzKSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRXh0cmFjdHMgdGhlIHJlc3VsdCBmcm9tIGEgd3JhcHBlZCBhbmQgY2hhaW5lZCBvYmplY3QuXG4gIF8ucHJvdG90eXBlLnZhbHVlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX3dyYXBwZWQ7XG4gIH07XG5cbiAgLy8gUHJvdmlkZSB1bndyYXBwaW5nIHByb3h5IGZvciBzb21lIG1ldGhvZHMgdXNlZCBpbiBlbmdpbmUgb3BlcmF0aW9uc1xuICAvLyBzdWNoIGFzIGFyaXRobWV0aWMgYW5kIEpTT04gc3RyaW5naWZpY2F0aW9uLlxuICBfLnByb3RvdHlwZS52YWx1ZU9mID0gXy5wcm90b3R5cGUudG9KU09OID0gXy5wcm90b3R5cGUudmFsdWU7XG5cbiAgXy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJycgKyB0aGlzLl93cmFwcGVkO1xuICB9O1xuXG4gIC8vIEFNRCByZWdpc3RyYXRpb24gaGFwcGVucyBhdCB0aGUgZW5kIGZvciBjb21wYXRpYmlsaXR5IHdpdGggQU1EIGxvYWRlcnNcbiAgLy8gdGhhdCBtYXkgbm90IGVuZm9yY2UgbmV4dC10dXJuIHNlbWFudGljcyBvbiBtb2R1bGVzLiBFdmVuIHRob3VnaCBnZW5lcmFsXG4gIC8vIHByYWN0aWNlIGZvciBBTUQgcmVnaXN0cmF0aW9uIGlzIHRvIGJlIGFub255bW91cywgdW5kZXJzY29yZSByZWdpc3RlcnNcbiAgLy8gYXMgYSBuYW1lZCBtb2R1bGUgYmVjYXVzZSwgbGlrZSBqUXVlcnksIGl0IGlzIGEgYmFzZSBsaWJyYXJ5IHRoYXQgaXNcbiAgLy8gcG9wdWxhciBlbm91Z2ggdG8gYmUgYnVuZGxlZCBpbiBhIHRoaXJkIHBhcnR5IGxpYiwgYnV0IG5vdCBiZSBwYXJ0IG9mXG4gIC8vIGFuIEFNRCBsb2FkIHJlcXVlc3QuIFRob3NlIGNhc2VzIGNvdWxkIGdlbmVyYXRlIGFuIGVycm9yIHdoZW4gYW5cbiAgLy8gYW5vbnltb3VzIGRlZmluZSgpIGlzIGNhbGxlZCBvdXRzaWRlIG9mIGEgbG9hZGVyIHJlcXVlc3QuXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoJ3VuZGVyc2NvcmUnLCBbXSwgZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gXztcbiAgICB9KTtcbiAgfVxufS5jYWxsKHRoaXMpKTtcbiJdfQ==
