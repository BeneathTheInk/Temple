/*
 * Temple (with Source Map)
 * (c) 2014-2015 Beneath the Ink, Inc.
 * Copyright (C) 2011--2015 Meteor Development Group
 * MIT License
 * Version 0.5.15
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

},{"backbone-events-standalone":16,"backbone-extend-standalone":17,"matches-selector":21,"underscore":31}],2:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var parse = require("./m+xml").parse;
var NODE_TYPE = require("./types");

// properties that Node.js and the browser can handle
var Temple = module.exports = {
	VERSION: "0.5.15",
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

},{"./domrange":1,"./m+xml":3,"./model":4,"./mustache":5,"./plugins":8,"./section":11,"./types":12,"./utils":13,"./view":14,"trackr":30,"trackr-objects":22,"underscore":31}],3:[function(require,module,exports){
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
},{"./":2,"./types":12,"underscore":31}],4:[function(require,module,exports){
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

},{"./m+xml":3,"./utils":13,"backbone-extend-standalone":17,"trackr":30,"trackr-objects":22,"underscore":31}],5:[function(require,module,exports){
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

},{"./domrange":1,"./m+xml":3,"./model":4,"./section":11,"./types":12,"./utils":13,"./view":14,"trackr-objects":22,"underscore":31}],6:[function(require,module,exports){
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

},{"../":2,"underscore":31}],7:[function(require,module,exports){
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

	// make sure it is an independent
	view.detach();

	// hook navbar data up to this data
	view.getRootModel().parent = this.model;

	// render when not in loading mode
	var onRender;
	this.on("render", onRender = function(comp) {
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
	if (!this._adopted.some(function(a, i) {
		if (a.view === view) {
			index = i;
			return true;
		}
	})) return;

	if (view.adoptedParent === this) delete view.adoptedParent;
	this.off("render", this._adopted[index].render);
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

},{"./actions":6,"./adoption":7,"./refs":9,"./twoway":10,"underscore":31}],9:[function(require,module,exports){
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

},{"underscore":31}],10:[function(require,module,exports){
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
			evtName, onChange;

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

},{"underscore":31}],11:[function(require,module,exports){
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

},{"./model":4,"./view":14,"trackr":30,"underscore":31}],12:[function(require,module,exports){
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

},{"is-plain-object":19,"matches-selector":21,"underscore":31}],14:[function(require,module,exports){
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

},{"./domrange":1,"./model":4,"./plugins":8,"./types":12,"./utils":13,"trackr":30,"underscore":31}],15:[function(require,module,exports){
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

},{"array-spy":23,"has-own-prop":24,"is-plain-object":25,"shallow-copy":27,"trackr":30}],23:[function(require,module,exports){
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
arguments[4][19][0].apply(exports,arguments)
},{"dup":19,"isobject":26}],26:[function(require,module,exports){
arguments[4][20][0].apply(exports,arguments)
},{"dup":20}],27:[function(require,module,exports){
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

},{}],28:[function(require,module,exports){
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

},{"performance-now":29}],29:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy90cmFja3Ivbm9kZV9tb2R1bGVzL3JhZi9ub2RlX21vZHVsZXMvcGVyZm9ybWFuY2Utbm93L2xpYi9wZXJmb3JtYW5jZS1ub3cuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiLy8gR2VuZXJhdGVkIGJ5IENvZmZlZVNjcmlwdCAxLjcuMVxuKGZ1bmN0aW9uKCkge1xuICB2YXIgZ2V0TmFub1NlY29uZHMsIGhydGltZSwgbG9hZFRpbWU7XG5cbiAgaWYgKCh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgcGVyZm9ybWFuY2UgIT09IG51bGwpICYmIHBlcmZvcm1hbmNlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgfTtcbiAgfSBlbHNlIGlmICgodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2VzcyAhPT0gbnVsbCkgJiYgcHJvY2Vzcy5ocnRpbWUpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIChnZXROYW5vU2Vjb25kcygpIC0gbG9hZFRpbWUpIC8gMWU2O1xuICAgIH07XG4gICAgaHJ0aW1lID0gcHJvY2Vzcy5ocnRpbWU7XG4gICAgZ2V0TmFub1NlY29uZHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBocjtcbiAgICAgIGhyID0gaHJ0aW1lKCk7XG4gICAgICByZXR1cm4gaHJbMF0gKiAxZTkgKyBoclsxXTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gZ2V0TmFub1NlY29uZHMoKTtcbiAgfSBlbHNlIGlmIChEYXRlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gRGF0ZS5ub3coKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBEYXRlLm5vdygpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH1cblxufSkuY2FsbCh0aGlzKTtcbiJdfQ==
},{"_process":18}],30:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iLzY5Njg3NmIxODQ4ZTRkNmE5MjAxNDM0MjJjMmM1MGM0NTAxYzg1YTMvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vLyBjaGVjayBmb3IgZ2xvYmFsIGFuZCB1c2UgdGhhdCBvbmUgaW5zdGVhZCBvZiBsb2FkaW5nIGEgbmV3IG9uZVxuaWYgKHR5cGVvZiBnbG9iYWwuVHJhY2tyICE9PSBcInVuZGVmaW5lZFwiKSB7XG5cdG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsLlRyYWNrcjtcblx0cmV0dXJuO1xufVxuXG4vKipcbiAqIEBuYW1lc3BhY2UgVHJhY2tyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja3ItcmVsYXRlZCBtZXRob2RzLlxuICovXG52YXIgVHJhY2tyID0gZ2xvYmFsLlRyYWNrciA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWN0aXZlXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGVyZSBpcyBhIGN1cnJlbnQgY29tcHV0YXRpb24sIG1lYW5pbmcgdGhhdCBkZXBlbmRlbmNpZXMgb24gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIHdpbGwgYmUgdHJhY2tlZCBhbmQgcG90ZW50aWFsbHkgY2F1c2UgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gdG8gYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLmFjdGl2ZSA9IGZhbHNlO1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2N1cnJlbnRjb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLCBvciBgbnVsbGAgaWYgdGhlcmUgaXNuJ3Qgb25lLlx0VGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgdGhlIFtgVHJhY2tyLkNvbXB1dGF0aW9uYF0oI3RyYWNrZXJfY29tcHV0YXRpb24pIG9iamVjdCBjcmVhdGVkIGJ5IHRoZSBpbm5lcm1vc3QgYWN0aXZlIGNhbGwgdG8gYFRyYWNrci5hdXRvcnVuYCwgYW5kIGl0J3MgdGhlIGNvbXB1dGF0aW9uIHRoYXQgZ2FpbnMgZGVwZW5kZW5jaWVzIHdoZW4gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFyZSBhY2Nlc3NlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtUcmFja3IuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBudWxsO1xuXG4vLyBSZWZlcmVuY2VzIHRvIGFsbCBjb21wdXRhdGlvbnMgY3JlYXRlZCB3aXRoaW4gdGhlIFRyYWNrciBieSBpZC5cbi8vIEtlZXBpbmcgdGhlc2UgcmVmZXJlbmNlcyBvbiBhbiB1bmRlcnNjb3JlIHByb3BlcnR5IGdpdmVzIG1vcmUgY29udHJvbCB0b1xuLy8gdG9vbGluZyBhbmQgcGFja2FnZXMgZXh0ZW5kaW5nIFRyYWNrciB3aXRob3V0IGluY3JlYXNpbmcgdGhlIEFQSSBzdXJmYWNlLlxuLy8gVGhlc2UgY2FuIHVzZWQgdG8gbW9ua2V5LXBhdGNoIGNvbXB1dGF0aW9ucywgdGhlaXIgZnVuY3Rpb25zLCB1c2Vcbi8vIGNvbXB1dGF0aW9uIGlkcyBmb3IgdHJhY2tpbmcsIGV0Yy5cblRyYWNrci5fY29tcHV0YXRpb25zID0ge307XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gYztcblx0VHJhY2tyLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG52YXIgX2RlYnVnRnVuYyA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuICh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5lcnJvciA/XG5cdFx0XHQgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmVycm9yLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuXHRcdFx0IGZ1bmN0aW9uICgpIHt9O1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcblx0aWYgKHRocm93Rmlyc3RFcnJvcikge1xuXHRcdHRocm93IGU7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIHByaW50QXJncyA9IFtcIkV4Y2VwdGlvbiBmcm9tIFRyYWNrciBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIl07XG5cdFx0aWYgKGUuc3RhY2sgJiYgZS5tZXNzYWdlICYmIGUubmFtZSkge1xuXHRcdFx0dmFyIGlkeCA9IGUuc3RhY2suaW5kZXhPZihlLm1lc3NhZ2UpO1xuXHRcdFx0aWYgKGlkeCA8IDAgfHwgaWR4ID4gZS5uYW1lLmxlbmd0aCArIDIpIHsgLy8gY2hlY2sgZm9yIFwiRXJyb3I6IFwiXG5cdFx0XHRcdC8vIG1lc3NhZ2UgaXMgbm90IHBhcnQgb2YgdGhlIHN0YWNrXG5cdFx0XHRcdHZhciBtZXNzYWdlID0gZS5uYW1lICsgXCI6IFwiICsgZS5tZXNzYWdlO1xuXHRcdFx0XHRwcmludEFyZ3MucHVzaChtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cHJpbnRBcmdzLnB1c2goZS5zdGFjayk7XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHByaW50QXJncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0X2RlYnVnRnVuYygpKHByaW50QXJnc1tpXSk7XG5cdFx0fVxuXHR9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcblx0cmV0dXJuIGY7XG59O1xuXG52YXIgbmV4dElkID0gMTtcbi8vIGNvbXB1dGF0aW9ucyB3aG9zZSBjYWxsYmFja3Mgd2Ugc2hvdWxkIGNhbGwgYXQgZmx1c2ggdGltZVxudmFyIHBlbmRpbmdDb21wdXRhdGlvbnMgPSBbXTtcbi8vIGB0cnVlYCBpZiBhIFRyYWNrci5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgd2lsbEZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGluIFRyYWNrci5mbHVzaCBub3dcbnZhciBpbkZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGNvbXB1dGluZyBhIGNvbXB1dGF0aW9uIG5vdywgZWl0aGVyIGZpcnN0IHRpbWVcbi8vIG9yIHJlY29tcHV0ZS5cdFRoaXMgbWF0Y2hlcyBUcmFja3IuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBUcmFja3Iubm9ucmVhY3RpdmUsIHdoaWNoIG51bGxmaWVzIGN1cnJlbnRDb21wdXRhdGlvbiBldmVuIHRob3VnaFxuLy8gYW4gZW5jbG9zaW5nIGNvbXB1dGF0aW9uIG1heSBzdGlsbCBiZSBydW5uaW5nLlxudmFyIGluQ29tcHV0ZSA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHRoZSBgX3Rocm93Rmlyc3RFcnJvcmAgb3B0aW9uIHdhcyBwYXNzZWQgaW4gdG8gdGhlIGNhbGxcbi8vIHRvIFRyYWNrci5mbHVzaCB0aGF0IHdlIGFyZSBpbi4gV2hlbiBzZXQsIHRocm93IHJhdGhlciB0aGFuIGxvZyB0aGVcbi8vIGZpcnN0IGVycm9yIGVuY291bnRlcmVkIHdoaWxlIGZsdXNoaW5nLiBCZWZvcmUgdGhyb3dpbmcgdGhlIGVycm9yLFxuLy8gZmluaXNoIGZsdXNoaW5nIChmcm9tIGEgZmluYWxseSBibG9jayksIGxvZ2dpbmcgYW55IHN1YnNlcXVlbnRcbi8vIGVycm9ycy5cbnZhciB0aHJvd0ZpcnN0RXJyb3IgPSBmYWxzZTtcblxudmFyIGFmdGVyRmx1c2hDYWxsYmFja3MgPSBbXTtcblxudmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHJlcXVpcmUoXCJyYWZcIik7XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG5cdGlmICghIHdpbGxGbHVzaCkge1xuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZShUcmFja3IuX3J1bkZsdXNoKTtcblx0XHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR9XG59O1xuXG4vLyBUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBBIENvbXB1dGF0aW9uIG9iamVjdCByZXByZXNlbnRzIGNvZGUgdGhhdCBpcyByZXBlYXRlZGx5IHJlcnVuXG4gKiBpbiByZXNwb25zZSB0b1xuICogcmVhY3RpdmUgZGF0YSBjaGFuZ2VzLiBDb21wdXRhdGlvbnMgZG9uJ3QgaGF2ZSByZXR1cm4gdmFsdWVzOyB0aGV5IGp1c3RcbiAqIHBlcmZvcm0gYWN0aW9ucywgc3VjaCBhcyByZXJlbmRlcmluZyBhIHRlbXBsYXRlIG9uIHRoZSBzY3JlZW4uIENvbXB1dGF0aW9uc1xuICogYXJlIGNyZWF0ZWQgdXNpbmcgVHJhY2tyLmF1dG9ydW4uIFVzZSBzdG9wIHRvIHByZXZlbnQgZnVydGhlciByZXJ1bm5pbmcgb2YgYVxuICogY29tcHV0YXRpb24uXG4gKiBAaW5zdGFuY2VuYW1lIGNvbXB1dGF0aW9uXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQsIG9wdGlvbnMpIHtcblx0aWYgKCEgY29uc3RydWN0aW5nQ29tcHV0YXRpb24pXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XCJUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgcHJpdmF0ZTsgdXNlIFRyYWNrci5hdXRvcnVuXCIpO1xuXHRjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG5cdHZhciBzZWxmID0gdGhpcztcblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cblx0ICogQGxvY3VzIENsaWVudFxuXHQgKiBAbWVtYmVyT2YgVHJhY2tyLkNvbXB1dGF0aW9uXG5cdCAqIEBpbnN0YW5jZVxuXHQgKiBAbmFtZVx0c3RvcHBlZFxuXHQgKi9cblx0c2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdGludmFsaWRhdGVkXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrci5hdXRvcnVuYCBpcyBjYWxsZWQsIGFuZCBmYWxzZSBvbiBzdWJzZXF1ZW50IHJlcnVucyBhbmQgYXQgb3RoZXIgdGltZXMuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdGZpcnN0UnVuXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5maXJzdFJ1biA9IHRydWU7XG5cblx0c2VsZi5faWQgPSBuZXh0SWQrKztcblx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG5cdHNlbGYuX29uU3RvcENhbGxiYWNrcyA9IFtdO1xuXHQvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG5cdC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuXHRzZWxmLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdHNlbGYuX2Z1bmMgPSBmO1xuXHRzZWxmLl9vbkVycm9yID0gb3B0aW9ucy5vbkVycm9yO1xuXHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHRzZWxmLl9jb250ZXh0ID0gb3B0aW9ucy5jb250ZXh0IHx8IG51bGw7XG5cblx0Ly8gUmVnaXN0ZXIgdGhlIGNvbXB1dGF0aW9uIHdpdGhpbiB0aGUgZ2xvYmFsIFRyYWNrci5cblx0VHJhY2tyLl9jb21wdXRhdGlvbnNbc2VsZi5faWRdID0gc2VsZjtcblxuXHR2YXIgZXJyb3JlZCA9IHRydWU7XG5cdHRyeSB7XG5cdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdGVycm9yZWQgPSBmYWxzZTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0aWYgKGVycm9yZWQpXG5cdFx0XHRzZWxmLnN0b3AoKTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLlx0VGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gaW52YWxpZGF0aW9uLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBpbnZhbGlkYXRlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MucHVzaCh7IGZuOiBmLCBjdHg6IGN0eCB9KTtcblx0fVxufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZWdpc3RlcnMgYGNhbGxiYWNrYCB0byBydW4gd2hlbiB0aGlzIGNvbXB1dGF0aW9uIGlzIHN0b3BwZWQsIG9yIHJ1bnMgaXQgaW1tZWRpYXRlbHkgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGFscmVhZHkgc3RvcHBlZC5cdFRoZSBjYWxsYmFjayBpcyBydW4gYWZ0ZXIgYW55IGBvbkludmFsaWRhdGVgIGNhbGxiYWNrcy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiBzdG9wLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBzdG9wcGVkLlxuICovXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLm9uU3RvcCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJvblN0b3AgcmVxdWlyZXMgYSBmdW5jdGlvblwiKTtcblxuXHRpZiAoc2VsZi5zdG9wcGVkKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25TdG9wQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlcyB0aGlzIGNvbXB1dGF0aW9uIHNvIHRoYXQgaXQgd2lsbCBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHQvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG5cdFx0Ly8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG5cdFx0aWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcblx0XHRcdHJlcXVpcmVGbHVzaCgpO1xuXHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuXHRcdH1cblxuXHRcdHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2Vcblx0XHQvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5cbi8qKlxuICogQHN1bW1hcnkgUHJldmVudHMgdGhpcyBjb21wdXRhdGlvbiBmcm9tIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKCEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0c2VsZi5zdG9wcGVkID0gdHJ1ZTtcblx0XHRzZWxmLmludmFsaWRhdGUoKTtcblx0XHQvLyBVbnJlZ2lzdGVyIGZyb20gZ2xvYmFsIFRyYWNrci5cblx0XHRkZWxldGUgVHJhY2tyLl9jb21wdXRhdGlvbnNbc2VsZi5faWRdO1xuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vblN0b3BDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uU3RvcENhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG5cdHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcblx0aW5Db21wdXRlID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0XHRpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fbmVlZHNSZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0cmV0dXJuIHNlbGYuaW52YWxpZGF0ZWQgJiYgISBzZWxmLnN0b3BwZWQ7XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9yZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRzZWxmLl9yZWNvbXB1dGluZyA9IHRydWU7XG5cdHRyeSB7XG5cdFx0aWYgKHNlbGYuX25lZWRzUmVjb21wdXRlKCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNlbGYuX2NvbXB1dGUoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHNlbGYuX29uRXJyb3IpIHtcblx0XHRcdFx0XHRzZWxmLl9vbkVycm9yKGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGZpbmFsbHkge1xuXHRcdHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cdH1cbn07XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2RlcGVuZGVuY3lcblxuLyoqXG4gKiBAc3VtbWFyeSBBIERlcGVuZGVuY3kgcmVwcmVzZW50cyBhbiBhdG9taWMgdW5pdCBvZiByZWFjdGl2ZSBkYXRhIHRoYXQgYVxuICogY29tcHV0YXRpb24gbWlnaHQgZGVwZW5kIG9uLiBSZWFjdGl2ZSBkYXRhIHNvdXJjZXMgc3VjaCBhcyBTZXNzaW9uIG9yXG4gKiBNaW5pbW9uZ28gaW50ZXJuYWxseSBjcmVhdGUgZGlmZmVyZW50IERlcGVuZGVuY3kgb2JqZWN0cyBmb3IgZGlmZmVyZW50XG4gKiBwaWVjZXMgb2YgZGF0YSwgZWFjaCBvZiB3aGljaCBtYXkgYmUgZGVwZW5kZWQgb24gYnkgbXVsdGlwbGUgY29tcHV0YXRpb25zLlxuICogV2hlbiB0aGUgZGF0YSBjaGFuZ2VzLCB0aGUgY29tcHV0YXRpb25zIGFyZSBpbnZhbGlkYXRlZC5cbiAqIEBjbGFzc1xuICogQGluc3RhbmNlTmFtZSBkZXBlbmRlbmN5XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5ID0gZnVuY3Rpb24gKCkge1xuXHR0aGlzLl9kZXBlbmRlbnRzQnlJZCA9IHt9O1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9kZXBlbmRcbi8vXG4vLyBBZGRzIGBjb21wdXRhdGlvbmAgdG8gdGhpcyBzZXQgaWYgaXQgaXMgbm90IGFscmVhZHlcbi8vIHByZXNlbnQuXHRSZXR1cm5zIHRydWUgaWYgYGNvbXB1dGF0aW9uYCBpcyBhIG5ldyBtZW1iZXIgb2YgdGhlIHNldC5cbi8vIElmIG5vIGFyZ3VtZW50LCBkZWZhdWx0cyB0byBjdXJyZW50Q29tcHV0YXRpb24sIG9yIGRvZXMgbm90aGluZ1xuLy8gaWYgdGhlcmUgaXMgbm8gY3VycmVudENvbXB1dGF0aW9uLlxuXG4vKipcbiAqIEBzdW1tYXJ5IERlY2xhcmVzIHRoYXQgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKG9yIGBmcm9tQ29tcHV0YXRpb25gIGlmIGdpdmVuKSBkZXBlbmRzIG9uIGBkZXBlbmRlbmN5YC5cdFRoZSBjb21wdXRhdGlvbiB3aWxsIGJlIGludmFsaWRhdGVkIHRoZSBuZXh0IHRpbWUgYGRlcGVuZGVuY3lgIGNoYW5nZXMuXG5cbklmIHRoZXJlIGlzIG5vIGN1cnJlbnQgY29tcHV0YXRpb24gYW5kIGBkZXBlbmQoKWAgaXMgY2FsbGVkIHdpdGggbm8gYXJndW1lbnRzLCBpdCBkb2VzIG5vdGhpbmcgYW5kIHJldHVybnMgZmFsc2UuXG5cblJldHVybnMgdHJ1ZSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYSBuZXcgZGVwZW5kZW50IG9mIGBkZXBlbmRlbmN5YCByYXRoZXIgdGhhbiBhbiBleGlzdGluZyBvbmUuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge1RyYWNrci5Db21wdXRhdGlvbn0gW2Zyb21Db21wdXRhdGlvbl0gQW4gb3B0aW9uYWwgY29tcHV0YXRpb24gZGVjbGFyZWQgdG8gZGVwZW5kIG9uIGBkZXBlbmRlbmN5YCBpbnN0ZWFkIG9mIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLlxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5kZXBlbmQgPSBmdW5jdGlvbiAoY29tcHV0YXRpb24pIHtcblx0aWYgKCEgY29tcHV0YXRpb24pIHtcblx0XHRpZiAoISBUcmFja3IuYWN0aXZlKVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXG5cdFx0Y29tcHV0YXRpb24gPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHR9XG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIGlkID0gY29tcHV0YXRpb24uX2lkO1xuXHRpZiAoISAoaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpKSB7XG5cdFx0c2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdID0gY29tcHV0YXRpb247XG5cdFx0Y29tcHV0YXRpb24ub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcblx0XHRcdGRlbGV0ZSBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF07XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9jaGFuZ2VkXG5cbi8qKlxuICogQHN1bW1hcnkgSW52YWxpZGF0ZSBhbGwgZGVwZW5kZW50IGNvbXB1dGF0aW9ucyBpbW1lZGlhdGVseSBhbmQgcmVtb3ZlIHRoZW0gYXMgZGVwZW5kZW50cy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0Zm9yICh2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0c2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdLmludmFsaWRhdGUoKTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfaGFzZGVwZW5kZW50c1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBEZXBlbmRlbmN5IGhhcyBvbmUgb3IgbW9yZSBkZXBlbmRlbnQgQ29tcHV0YXRpb25zLCB3aGljaCB3b3VsZCBiZSBpbnZhbGlkYXRlZCBpZiB0aGlzIERlcGVuZGVuY3kgd2VyZSB0byBjaGFuZ2UuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmhhc0RlcGVuZGVudHMgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0Zm9yKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcblx0XHRyZXR1cm4gdHJ1ZTtcblx0cmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9mbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFByb2Nlc3MgYWxsIHJlYWN0aXZlIHVwZGF0ZXMgaW1tZWRpYXRlbHkgYW5kIGVuc3VyZSB0aGF0IGFsbCBpbnZhbGlkYXRlZCBjb21wdXRhdGlvbnMgYXJlIHJlcnVuLlxuICogQGxvY3VzIENsaWVudFxuICovXG5UcmFja3IuZmx1c2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuXHRUcmFja3IuX3J1bkZsdXNoKHsgZmluaXNoU3luY2hyb25vdXNseTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0aHJvd0ZpcnN0RXJyb3I6IG9wdGlvbnMgJiYgb3B0aW9ucy5fdGhyb3dGaXJzdEVycm9yIH0pO1xufTtcblxuLy8gUnVuIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9ucyBhbmQgYWZ0ZXJGbHVzaCBjYWxsYmFja3MuXHRJZiB3ZSB3ZXJlIG5vdCBjYWxsZWRcbi8vIGRpcmVjdGx5IHZpYSBUcmFja3IuZmx1c2gsIHRoaXMgbWF5IHJldHVybiBiZWZvcmUgdGhleSdyZSBhbGwgZG9uZSB0byBhbGxvd1xuLy8gdGhlIGV2ZW50IGxvb3AgdG8gcnVuIGEgbGl0dGxlIGJlZm9yZSBjb250aW51aW5nLlxuVHJhY2tyLl9ydW5GbHVzaCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuXHQvLyBoYXZlIFNwYXJrKVxuXHQvL1xuXHQvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuXHQvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG5cdC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tyLmZsdXNoLlx0QXQgdGhlIG1vbWVudFxuXHQvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG5cdC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLlx0QW5kIHdlIGRvbid0IGhhdmVcblx0Ly8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG5cdC8vXG5cdC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcblx0aWYgKGluRmx1c2gpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja3IuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cblx0aWYgKGluQ29tcHV0ZSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tyLmF1dG9ydW5cIik7XG5cblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0aW5GbHVzaCA9IHRydWU7XG5cdHdpbGxGbHVzaCA9IHRydWU7XG5cdHRocm93Rmlyc3RFcnJvciA9ICEhIG9wdGlvbnMudGhyb3dGaXJzdEVycm9yO1xuXG5cdHZhciByZWNvbXB1dGVkQ291bnQgPSAwO1xuXHR2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcblx0XHRcdFx0XHQgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuXHRcdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHRjb21wLl9yZWNvbXB1dGUoKTtcblx0XHRcdFx0aWYgKGNvbXAuX25lZWRzUmVjb21wdXRlKCkpIHtcblx0XHRcdFx0XHRwZW5kaW5nQ29tcHV0YXRpb25zLnVuc2hpZnQoY29tcCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoISBvcHRpb25zLmZpbmlzaFN5bmNocm9ub3VzbHkgJiYgKytyZWNvbXB1dGVkQ291bnQgPiAxMDAwKSB7XG5cdFx0XHRcdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gY2FsbCBvbmUgYWZ0ZXJGbHVzaCBjYWxsYmFjaywgd2hpY2ggbWF5XG5cdFx0XHRcdC8vIGludmFsaWRhdGUgbW9yZSBjb21wdXRhdGlvbnNcblx0XHRcdFx0dmFyIGNiID0gYWZ0ZXJGbHVzaENhbGxiYWNrcy5zaGlmdCgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNiLmZuLmNhbGwoY2IuY3R4KTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdF90aHJvd09yTG9nKFwiYWZ0ZXJGbHVzaFwiLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmaW5pc2hlZFRyeSA9IHRydWU7XG5cdH0gZmluYWxseSB7XG5cdFx0aWYgKCEgZmluaXNoZWRUcnkpIHtcblx0XHRcdC8vIHdlJ3JlIGVycm9yaW5nIGR1ZSB0byB0aHJvd0ZpcnN0RXJyb3IgYmVpbmcgdHJ1ZS5cblx0XHRcdGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBUcmFja3IuZmx1c2goKWAgYWdhaW5cblx0XHRcdC8vIGZpbmlzaCBmbHVzaGluZ1xuXHRcdFx0VHJhY2tyLl9ydW5GbHVzaCh7XG5cdFx0XHRcdGZpbmlzaFN5bmNocm9ub3VzbHk6IG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSxcblx0XHRcdFx0dGhyb3dGaXJzdEVycm9yOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHdpbGxGbHVzaCA9IGZhbHNlO1xuXHRcdGluRmx1c2ggPSBmYWxzZTtcblx0XHRpZiAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHwgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdC8vIFdlJ3JlIHlpZWxkaW5nIGJlY2F1c2Ugd2UgcmFuIGEgYnVuY2ggb2YgY29tcHV0YXRpb25zIGFuZCB3ZSBhcmVuJ3Rcblx0XHRcdC8vIHJlcXVpcmVkIHRvIGZpbmlzaCBzeW5jaHJvbm91c2x5LCBzbyB3ZSdkIGxpa2UgdG8gZ2l2ZSB0aGUgZXZlbnQgbG9vcCBhXG5cdFx0XHQvLyBjaGFuY2UuIFdlIHNob3VsZCBmbHVzaCBhZ2FpbiBzb29uLlxuXHRcdFx0aWYgKG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJzdGlsbCBoYXZlIG1vcmUgdG8gZG8/XCIpO1x0Ly8gc2hvdWxkbid0IGhhcHBlblxuXHRcdFx0fVxuXHRcdFx0c2V0VGltZW91dChyZXF1aXJlRmx1c2gsIDEwKTtcblx0XHR9XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYXV0b3J1blxuLy9cbi8vIFJ1biBmKCkuIFJlY29yZCBpdHMgZGVwZW5kZW5jaWVzLiBSZXJ1biBpdCB3aGVuZXZlciB0aGVcbi8vIGRlcGVuZGVuY2llcyBjaGFuZ2UuXG4vL1xuLy8gUmV0dXJucyBhIG5ldyBDb21wdXRhdGlvbiwgd2hpY2ggaXMgYWxzbyBwYXNzZWQgdG8gZi5cbi8vXG4vLyBMaW5rcyB0aGUgY29tcHV0YXRpb24gdG8gdGhlIGN1cnJlbnQgY29tcHV0YXRpb25cbi8vIHNvIHRoYXQgaXQgaXMgc3RvcHBlZCBpZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZC5cblxuLyoqXG4gKiBAY2FsbGJhY2sgVHJhY2tyLkNvbXB1dGF0aW9uRnVuY3Rpb25cbiAqIEBwYXJhbSB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIG5vdyBhbmQgcmVydW4gaXQgbGF0ZXIgd2hlbmV2ZXIgaXRzIGRlcGVuZGVuY2llc1xuICogY2hhbmdlLiBSZXR1cm5zIGEgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgdG8gc3RvcCBvciBvYnNlcnZlIHRoZVxuICogcmVydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb25GdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlc1xuICogb25lIGFyZ3VtZW50OiB0aGUgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgd2lsbCBiZSByZXR1cm5lZC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMub25FcnJvciBPcHRpb25hbC4gVGhlIGZ1bmN0aW9uIHRvIHJ1biB3aGVuIGFuIGVycm9yXG4gKiBoYXBwZW5zIGluIHRoZSBDb21wdXRhdGlvbi4gVGhlIG9ubHkgYXJndW1lbnQgaXQgcmVjaWV2ZXMgaXMgdGhlIEVycm9yXG4gKiB0aHJvd24uIERlZmF1bHRzIHRvIHRoZSBlcnJvciBiZWluZyBsb2dnZWQgdG8gdGhlIGNvbnNvbGUuXG4gKiBAcmV0dXJucyB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG5UcmFja3IuYXV0b3J1biA9IGZ1bmN0aW9uIChmLCBvcHRpb25zLCBjdHgpIHtcblx0aWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuXHRcdHRocm93IG5ldyBFcnJvcignVHJhY2tyLmF1dG9ydW4gcmVxdWlyZXMgYSBmdW5jdGlvbiBhcmd1bWVudCcpO1xuXG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXHRpZiAoY3R4KSBvcHRpb25zLmNvbnRleHQgPSBjdHg7XG5cblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuXHR2YXIgYyA9IG5ldyBUcmFja3IuQ29tcHV0YXRpb24oXG5cdFx0ZiwgVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiwgb3B0aW9ucyk7XG5cblx0aWYgKFRyYWNrci5hY3RpdmUpXG5cdFx0VHJhY2tyLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRjLnN0b3AoKTtcblx0XHR9KTtcblxuXHRyZXR1cm4gYztcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfbm9ucmVhY3RpdmVcbi8vXG4vLyBSdW4gYGZgIHdpdGggbm8gY3VycmVudCBjb21wdXRhdGlvbiwgcmV0dXJuaW5nIHRoZSByZXR1cm4gdmFsdWVcbi8vIG9mIGBmYC5cdFVzZWQgdG8gdHVybiBvZmYgcmVhY3Rpdml0eSBmb3IgdGhlIGR1cmF0aW9uIG9mIGBmYCxcbi8vIHNvIHRoYXQgcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFjY2Vzc2VkIGJ5IGBmYCB3aWxsIG5vdCByZXN1bHQgaW4gYW55XG4vLyBjb21wdXRhdGlvbnMgYmVpbmcgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gd2l0aG91dCB0cmFja2luZyBkZXBlbmRlbmNpZXMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIEEgZnVuY3Rpb24gdG8gY2FsbCBpbW1lZGlhdGVseS5cbiAqL1xuVHJhY2tyLm5vblJlYWN0aXZlID1cblRyYWNrci5ub25yZWFjdGl2ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuXHR0cnkge1xuXHRcdHJldHVybiBmLmNhbGwoY3R4KTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuXHR9XG59O1xuXG4vLyBsaWtlIG5vbnJlYWN0aXZlIGJ1dCBtYWtlcyBhIGZ1bmN0aW9uIGluc3RlYWRcblRyYWNrci5ub25SZWFjdGFibGUgPVxuVHJhY2tyLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGYuYXBwbHkoY3R4LCBhcmdzKTtcblx0XHR9KTtcblx0fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IFtgb25JbnZhbGlkYXRlYF0oI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZSkgY2FsbGJhY2sgb24gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKHdoaWNoIG11c3QgZXhpc3QpLCB0byBiZSBjYWxsZWQgaW1tZWRpYXRlbHkgd2hlbiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZCBvciBzdG9wcGVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgaW52b2tlZCBhcyBgZnVuYyhjKWAsIHdoZXJlIGBjYCBpcyB0aGUgY29tcHV0YXRpb24gb24gd2hpY2ggdGhlIGNhbGxiYWNrIGlzIHJlZ2lzdGVyZWQuXG4gKi9cblRyYWNrci5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVHJhY2tyLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hZnRlcmZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgU2NoZWR1bGVzIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGR1cmluZyB0aGUgbmV4dCBmbHVzaCwgb3IgbGF0ZXIgaW4gdGhlIGN1cnJlbnQgZmx1c2ggaWYgb25lIGlzIGluIHByb2dyZXNzLCBhZnRlciBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGhhdmUgYmVlbiByZXJ1bi5cdFRoZSBmdW5jdGlvbiB3aWxsIGJlIHJ1biBvbmNlIGFuZCBub3Qgb24gc3Vic2VxdWVudCBmbHVzaGVzIHVubGVzcyBgYWZ0ZXJGbHVzaGAgaXMgY2FsbGVkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBjYWxsIGF0IGZsdXNoIHRpbWUuXG4gKi9cblRyYWNrci5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdHJlcXVpcmVGbHVzaCgpO1xufTtcbiJdfQ==
},{"raf":28}],31:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZG9tcmFuZ2UuanMiLCJsaWIvaW5kZXguanMiLCJsaWIvbSt4bWwuanMiLCJsaWIvbW9kZWwuanMiLCJsaWIvbXVzdGFjaGUuanMiLCJsaWIvcGx1Z2lucy9hY3Rpb25zLmpzIiwibGliL3BsdWdpbnMvYWRvcHRpb24uanMiLCJsaWIvcGx1Z2lucy9pbmRleC5qcyIsImxpYi9wbHVnaW5zL3JlZnMuanMiLCJsaWIvcGx1Z2lucy90d293YXkuanMiLCJsaWIvc2VjdGlvbi5qcyIsImxpYi90eXBlcy5qcyIsImxpYi91dGlscy5qcyIsImxpYi92aWV3LmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lLmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lL2JhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lLmpzIiwibm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9pcy1wbGFpbi1vYmplY3QvaW5kZXguanMiLCJub2RlX21vZHVsZXMvaXMtcGxhaW4tb2JqZWN0L25vZGVfbW9kdWxlcy9pc29iamVjdC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9tYXRjaGVzLXNlbGVjdG9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL25vZGVfbW9kdWxlcy9hcnJheS1zcHkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHJhY2tyLW9iamVjdHMvbm9kZV9tb2R1bGVzL2hhcy1vd24tcHJvcC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3Itb2JqZWN0cy9ub2RlX21vZHVsZXMvc2hhbGxvdy1jb3B5L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci9ub2RlX21vZHVsZXMvcmFmL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci9ub2RlX21vZHVsZXMvcmFmL25vZGVfbW9kdWxlcy9wZXJmb3JtYW5jZS1ub3cvbGliL3BlcmZvcm1hbmNlLW5vdy5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIiwibm9kZV9tb2R1bGVzL3VuZGVyc2NvcmUvdW5kZXJzY29yZS5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDelpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzl1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2WUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcFJBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbk9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2bUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBUaGlzIGlzIGEgaGVhdmlseSBtb2RpZmllZCB2ZXJzaW9uIG9mIE1ldGVvcidzIERPTVJhbmdlIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iLzQwNTAwOWEyYzNkY2QzYzFmZTc4MGFkYjI4NjdkMzhhNmE0MmZmZjEvcGFja2FnZXMvYmxhemUvZG9tcmFuZ2UuanMgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdEV2ZW50cyA9IHJlcXVpcmUoXCJiYWNrYm9uZS1ldmVudHMtc3RhbmRhbG9uZVwiKSxcblx0bWF0Y2hlc1NlbGVjdG9yID0gcmVxdWlyZShcIm1hdGNoZXMtc2VsZWN0b3JcIik7XG5cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKGEpIHtcblx0cmV0dXJuIGEgIT0gbnVsbCAmJiB0eXBlb2YgYS5sZW5ndGggPT09IFwibnVtYmVyXCI7XG59XG5cbi8vIGBbbmV3XSBCbGF6ZS5fRE9NUmFuZ2UoW25vZGVBbmRSYW5nZUFycmF5XSlgXG4vL1xuLy8gQSBET01SYW5nZSBjb25zaXN0cyBvZiBhbiBhcnJheSBvZiBjb25zZWN1dGl2ZSBub2RlcyBhbmQgRE9NUmFuZ2VzLFxuLy8gd2hpY2ggbWF5IGJlIHJlcGxhY2VkIGF0IGFueSB0aW1lIHdpdGggYSBuZXcgYXJyYXkuICBJZiB0aGUgRE9NUmFuZ2Vcbi8vIGhhcyBiZWVuIGF0dGFjaGVkIHRvIHRoZSBET00gYXQgc29tZSBsb2NhdGlvbiwgdGhlbiB1cGRhdGluZ1xuLy8gdGhlIGFycmF5IHdpbGwgY2F1c2UgdGhlIERPTSB0byBiZSB1cGRhdGVkIGF0IHRoYXQgbG9jYXRpb24uXG5mdW5jdGlvbiBET01SYW5nZShub2RlQW5kUmFuZ2VBcnJheSkge1xuXHQvLyBjYWxsZWQgd2l0aG91dCBgbmV3YFxuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgRE9NUmFuZ2UpKSB7XG5cdFx0cmV0dXJuIG5ldyBET01SYW5nZShub2RlQW5kUmFuZ2VBcnJheSk7XG5cdH1cblxuXHR2YXIgbWVtYmVycyA9IChub2RlQW5kUmFuZ2VBcnJheSB8fCBbXSk7XG5cdGlmICghaXNBcnJheUxpa2UobWVtYmVycykpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGFycmF5XCIpO1xuXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdHRoaXMuX21lbWJlckluKG1lbWJlcnNbaV0pO1xuXHR9XG5cblx0dGhpcy5tZW1iZXJzID0gbWVtYmVycztcblx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdHRoaXMuYXR0YWNoZWQgPSBmYWxzZTtcblx0dGhpcy5wYXJlbnRFbGVtZW50ID0gbnVsbDtcblx0dGhpcy5wYXJlbnRSYW5nZSA9IG51bGw7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NUmFuZ2U7XG5ET01SYW5nZS5leHRlbmQgPSByZXF1aXJlKFwiYmFja2JvbmUtZXh0ZW5kLXN0YW5kYWxvbmVcIik7XG5cbi8vIGZpbmRzIHRoZSBET01SYW5nZSB0aGUgZWxlbWVudCBpcyBhIHBhcnQgb2ZcbkRPTVJhbmdlLmZvckVsZW1lbnQgPSBmdW5jdGlvbiAoZWxlbSkge1xuXHRpZiAoZWxlbS5ub2RlVHlwZSAhPT0gMSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgZWxlbWVudCwgZm91bmQ6IFwiICsgZWxlbSk7XG5cblx0dmFyIHJhbmdlID0gbnVsbDtcblxuXHR3aGlsZSAoZWxlbSAmJiAhcmFuZ2UpIHtcblx0XHRyYW5nZSA9IChlbGVtLiRkb21yYW5nZSB8fCBudWxsKTtcblx0XHRlbGVtID0gZWxlbS5wYXJlbnROb2RlO1xuXHR9XG5cblx0cmV0dXJuIHJhbmdlO1xufTtcblxuXy5leHRlbmQoRE9NUmFuZ2UucHJvdG90eXBlLCBFdmVudHMsIHtcblxuXHQvLyBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgdG8gaW5zZXJ0IHRoZSBET01SYW5nZSBpbnRvIHRoZSBET00gZm9yXG5cdC8vIHRoZSBmaXJzdCB0aW1lLCBidXQgaXQncyBhbHNvIHVzZWQgaW50ZXJuYWxseSB3aGVuXG5cdC8vIHVwZGF0aW5nIHRoZSBET00uXG5cdC8vIElmIF9pc01vdmUgaXMgdHJ1ZSwgbW92ZSB0aGlzIGF0dGFjaGVkIHJhbmdlIHRvIGEgZGlmZmVyZW50XG5cdC8vIGxvY2F0aW9uIHVuZGVyIHRoZSBzYW1lIHBhcmVudEVsZW1lbnQuXG5cdGF0dGFjaDogZnVuY3Rpb24ocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUsIF9pc1JlcGxhY2UpIHtcblx0XHRpZiAodHlwZW9mIHBhcmVudEVsZW1lbnQgPT09IFwic3RyaW5nXCIpIHBhcmVudEVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHBhcmVudEVsZW1lbnQpO1xuXHRcdGlmICh0eXBlb2YgbmV4dE5vZGUgPT09IFwic3RyaW5nXCIpIG5leHROb2RlID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IobmV4dE5vZGUpO1xuXHRcdGlmIChwYXJlbnRFbGVtZW50ID09IG51bGwpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIHZhbGlkIERPTSBlbGVtZW50IHRvIGF0dGFjaCBpbi5cIik7XG5cblx0XHRpZiAoKF9pc01vdmUgfHwgX2lzUmVwbGFjZSkgJiYgISh0aGlzLnBhcmVudEVsZW1lbnQgPT09IHBhcmVudEVsZW1lbnQgJiYgdGhpcy5hdHRhY2hlZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkNhbiBvbmx5IG1vdmUgb3IgcmVwbGFjZSBhbiBhdHRhY2hlZCBET01SYW5nZSwgYW5kIG9ubHkgdW5kZXIgdGhlIHNhbWUgcGFyZW50IGVsZW1lbnRcIik7XG5cdFx0fVxuXG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0aWYgKG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gbnVsbDtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpbnNlcnRJbnRvRE9NKG1lbWJlcnNbaV0sIHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXJOb2RlKCk7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0XHRwYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZShwbGFjZWhvbGRlciwgbmV4dE5vZGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuYXR0YWNoZWQgPSB0cnVlO1xuXHRcdHRoaXMucGFyZW50RWxlbWVudCA9IHBhcmVudEVsZW1lbnQ7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50cyBvbmx5IG9uIGZyZXNoIGF0dGFjaG1lbnRzXG5cdFx0aWYgKCEoX2lzTW92ZSB8fCBfaXNSZXBsYWNlKSkgdGhpcy50cmlnZ2VyKFwiYXR0YWNoXCIsIHBhcmVudEVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZGV0YWNoOiBmdW5jdGlvbihfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSByZXR1cm4gdGhpcztcblxuXHRcdHZhciBvbGRQYXJlbnRFbGVtZW50ID0gdGhpcy5wYXJlbnRFbGVtZW50O1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGlmIChtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtZW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHJlbW92ZUZyb21ET00obWVtYmVyc1tpXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwbGFjZWhvbGRlciA9IHRoaXMucGxhY2Vob2xkZXI7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQocGxhY2Vob2xkZXIpO1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCFfaXNSZXBsYWNlKSB7XG5cdFx0XHR0aGlzLmF0dGFjaGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQgPSBudWxsO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiZGV0YWNoXCIsIG9sZFBhcmVudEVsZW1lbnQpO1xuXHRcdH1cblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkgdGhyb3cgbmV3IEVycm9yKFwiTXVzdCBiZSBhdHRhY2hlZFwiKTtcblx0XHRpZiAoIXRoaXMubWVtYmVycy5sZW5ndGgpIHJldHVybiB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdHZhciBtID0gdGhpcy5tZW1iZXJzWzBdO1xuXHRcdHJldHVybiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0uZmlyc3ROb2RlKCkgOiBtO1xuXHR9LFxuXG5cdGxhc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHRocm93IG5ldyBFcnJvcihcIk11c3QgYmUgYXR0YWNoZWRcIik7XG5cdFx0aWYgKCF0aGlzLm1lbWJlcnMubGVuZ3RoKSByZXR1cm4gdGhpcy5wbGFjZWhvbGRlcjtcblx0XHR2YXIgbSA9IHRoaXMubWVtYmVyc1t0aGlzLm1lbWJlcnMubGVuZ3RoIC0gMV07XG5cdFx0cmV0dXJuIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpID8gbS5sYXN0Tm9kZSgpIDogbTtcblx0fSxcblxuXHRnZXRNZW1iZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRpZiAoIShhdEluZGV4ID49IDAgJiYgYXRJbmRleCA8IG1lbWJlcnMubGVuZ3RoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIGluZGV4IGluIHJhbmdlLmdldE1lbWJlcjogXCIgKyBhdEluZGV4KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWVtYmVyc1thdEluZGV4XTtcblx0fSxcblxuXHQvLyByZXNldHMgdGhlIERPTVJhbmdlIHdpdGggbmV3IGNvbnRlbnRcblx0c2V0TWVtYmVyczogZnVuY3Rpb24obmV3Tm9kZUFuZFJhbmdlQXJyYXkpIHtcblx0XHR2YXIgbmV3TWVtYmVycyA9IG5ld05vZGVBbmRSYW5nZUFycmF5O1xuXHRcdGlmICghaXNBcnJheUxpa2UobmV3TWVtYmVycykpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGFycmF5XCIpO1xuXHRcdHZhciBvbGRNZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdHZhciBfaXNSZXBsYWNlID0gdGhpcy5hdHRhY2hlZCAmJiAobmV3TWVtYmVycy5sZW5ndGggfHwgb2xkTWVtYmVycy5sZW5ndGgpO1xuXHRcdHZhciBpO1xuXG5cdFx0Ly8gZGVyZWZlcmVuY2Ugb2xkIG1lbWJlcnNcblx0XHRmb3IgKGkgPSAwOyBpIDwgb2xkTWVtYmVycy5sZW5ndGg7IGkrKykgdGhpcy5fbWVtYmVyT3V0KG9sZE1lbWJlcnNbaV0sIGZhbHNlLCBfaXNSZXBsYWNlKTtcblxuXHRcdC8vIHJlZmVyZW5jZSBuZXcgbWVtYmVyc1xuXHRcdGZvciAoaSA9IDA7IGkgPCBuZXdNZW1iZXJzLmxlbmd0aDsgaSsrKSB0aGlzLl9tZW1iZXJJbihuZXdNZW1iZXJzW2ldKTtcblxuXHRcdGlmIChfaXNSZXBsYWNlKSB7XG5cdFx0XHQvLyBkZXRhY2ggdGhlIG9sZCBtZW1iZXJzIGFuZCBpbnNlcnQgdGhlIG5ldyBtZW1iZXJzXG5cdFx0XHR2YXIgbmV4dE5vZGUgPSB0aGlzLmxhc3ROb2RlKCkubmV4dFNpYmxpbmc7XG5cdFx0XHR2YXIgcGFyZW50RWxlbWVudCA9IHRoaXMucGFyZW50RWxlbWVudDtcblx0XHRcdC8vIFVzZSBkZXRhY2gvYXR0YWNoLCBidXQgZG9uJ3QgdHJpZ2dlciBldmVudHNcblx0XHRcdHRoaXMuZGV0YWNoKHRydWUgLypfaXNSZXBsYWNlKi8pO1xuXHRcdFx0dGhpcy5tZW1iZXJzID0gbmV3TWVtYmVycztcblx0XHRcdHRoaXMuYXR0YWNoKHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBmYWxzZSwgdHJ1ZSAvKl9pc1JlcGxhY2UqLyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGRvbid0IGRvIGFueXRoaW5nIGlmIHdlJ3JlIGdvaW5nIGZyb20gZW1wdHkgdG8gZW1wdHlcblx0XHRcdHRoaXMubWVtYmVycyA9IG5ld01lbWJlcnM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkTWVtYmVyOiBmdW5jdGlvbihuZXdNZW1iZXIsIGF0SW5kZXgsIF9pc01vdmUpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblxuXHRcdC8vIHZhbGlkYXRlIHRoZSBpbmRleFxuXHRcdGlmICh0eXBlb2YgYXRJbmRleCAhPT0gXCJudW1iZXJcIiB8fCBpc05hTihhdEluZGV4KSB8fFxuXHRcdFx0YXRJbmRleCA8IDAgfHwgYXRJbmRleCA+IG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHRhdEluZGV4ID0gbWVtYmVycy5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Ly8gYWRkIHJlZmVyZW5jZXMgdG8gdGhlIG5ldyBtZW1iZXJcblx0XHRpZiAoIV9pc01vdmUpIHRoaXMuX21lbWJlckluKG5ld01lbWJlcik7XG5cblx0XHQvLyBjdXJyZW50bHkgZGV0YWNoZWQ7IGp1c3QgdXBkYXRlZCBtZW1iZXJzXG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSB7XG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAwLCBuZXdNZW1iZXIpO1xuXHRcdH1cblxuXHRcdC8vIGVtcHR5OyB1c2UgdGhlIGVtcHR5LXRvLW5vbmVtcHR5IGhhbmRsaW5nIG9mIHNldE1lbWJlcnNcblx0XHRlbHNlIGlmIChtZW1iZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5zZXRNZW1iZXJzKFsgbmV3TWVtYmVyIF0pO1xuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBhZGQgYXQgbG9jYXRpb25cblx0XHRlbHNlIHtcblx0XHRcdHZhciBuZXh0Tm9kZTtcblx0XHRcdGlmIChhdEluZGV4ID09PSBtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBpbnNlcnQgYXQgZW5kXG5cdFx0XHRcdG5leHROb2RlID0gdGhpcy5sYXN0Tm9kZSgpLm5leHRTaWJsaW5nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIG0gPSBtZW1iZXJzW2F0SW5kZXhdO1xuXHRcdFx0XHRuZXh0Tm9kZSA9IChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpID8gbS5maXJzdE5vZGUoKSA6IG07XG5cdFx0XHR9XG5cblx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDAsIG5ld01lbWJlcik7XG5cdFx0XHRpbnNlcnRJbnRvRE9NKG5ld01lbWJlciwgdGhpcy5wYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlTWVtYmVyOiBmdW5jdGlvbihhdEluZGV4LCBfaXNNb3ZlKSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cblx0XHQvLyBhbHNvIGFjY2VwdHMgdGhlIG1lbWJlciB0byByZW1vdmVcblx0XHRpZiAodHlwZW9mIGF0SW5kZXggIT09IFwibnVtYmVyXCIgfHwgaXNOYU4oYXRJbmRleCkpIHtcblx0XHRcdGF0SW5kZXggPSB0aGlzLmluZGV4T2YoYXRJbmRleCk7XG5cdFx0fVxuXG5cdFx0Ly8gdmFsaWRhdGUgdGhlIGluZGV4XG5cdFx0aWYgKGF0SW5kZXggPCAwIHx8IGF0SW5kZXggPj0gbWVtYmVycy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBpbmRleCBpbiByYW5nZS5yZW1vdmVNZW1iZXI6IFwiICsgYXRJbmRleCk7XG5cdFx0fVxuXG5cdFx0aWYgKF9pc01vdmUpIHtcblx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgb2xkTWVtYmVyID0gbWVtYmVyc1thdEluZGV4XTtcblxuXHRcdFx0aWYgKG1lbWJlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdC8vIGJlY29taW5nIGVtcHR5OyB1c2UgdGhlIGxvZ2ljIGluIHNldE1lbWJlcnNcblx0XHRcdFx0dGhpcy5zZXRNZW1iZXJzKFtdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX21lbWJlck91dChvbGRNZW1iZXIpO1xuXHRcdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAxKTtcblx0XHRcdFx0aWYgKHRoaXMuYXR0YWNoZWQpIHJlbW92ZUZyb21ET00ob2xkTWVtYmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRtb3ZlTWVtYmVyOiBmdW5jdGlvbihvbGRJbmRleCwgbmV3SW5kZXgpIHtcblx0XHR2YXIgbWVtYmVyID0gdGhpcy5tZW1iZXJzW29sZEluZGV4XTtcblx0XHR0aGlzLnJlbW92ZU1lbWJlcihvbGRJbmRleCwgdHJ1ZSAvKl9pc01vdmUqLyk7XG5cdFx0dGhpcy5hZGRNZW1iZXIobWVtYmVyLCBuZXdJbmRleCwgdHJ1ZSAvKl9pc01vdmUqLyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aW5kZXhPZjogZnVuY3Rpb24obWVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMubWVtYmVycy5pbmRleE9mKG1lbWJlcik7XG5cdH0sXG5cblx0Y29udGFpbnM6IGZ1bmN0aW9uKG1lbWJlcikge1xuXHRcdHJldHVybiB0aGlzLmluZGV4T2YobWVtYmVyKSA+IC0xO1xuXHR9LFxuXG5cdF9tZW1iZXJJbjogZnVuY3Rpb24obSkge1xuXHRcdGlmIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdG0ucGFyZW50UmFuZ2UgPSB0aGlzO1xuXHRcdH0gZWxzZSBpZiAobS5ub2RlVHlwZSA9PT0gMSkgeyAvLyBET00gRWxlbWVudFxuXHRcdFx0bS4kZG9tcmFuZ2UgPSB0aGlzO1xuXHRcdH1cblx0fSxcblxuXHRfbWVtYmVyT3V0OiBmdW5jdGlvbiAobSwgX3NraXBOb2RlcywgX2lzUmVwbGFjZSkge1xuXHRcdGlmIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdGlmIChfaXNSZXBsYWNlKSBtLmRlc3Ryb3lNZW1iZXJzKF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpO1xuXHRcdFx0ZWxzZSBtLmRlc3Ryb3koX3NraXBOb2Rlcyk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoIV9za2lwTm9kZXMgJiYgbS5ub2RlVHlwZSA9PT0gMSAmJiBtLiRkb21yYW5nZSkge1xuXHRcdFx0bS4kZG9tcmFuZ2UgPSBudWxsO1xuXHRcdH1cblx0fSxcblxuXHQvLyBUZWFyIGRvd24sIGJ1dCBkb24ndCByZW1vdmUsIHRoZSBtZW1iZXJzLiAgVXNlZCB3aGVuIGNodW5rc1xuXHQvLyBvZiBET00gYXJlIGJlaW5nIHRvcm4gZG93biBvciByZXBsYWNlZC5cblx0ZGVzdHJveU1lbWJlcnM6IGZ1bmN0aW9uKF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG1lbWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX21lbWJlck91dChtZW1iZXJzW2ldLCBfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZGVzdHJveTogZnVuY3Rpb24oX3NraXBOb2Rlcykge1xuXHRcdHRoaXMuZGV0YWNoKCk7XG5cdFx0dGhpcy50cmlnZ2VyKFwiZGVzdHJveVwiLCBfc2tpcE5vZGVzKTtcblx0XHR0aGlzLmRlc3Ryb3lNZW1iZXJzKF9za2lwTm9kZXMpO1xuXHRcdHRoaXMubWVtYmVycyA9IFtdO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGZpbmRBbGw6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIG1hdGNoZXMgPSBbXSxcblx0XHRcdGVsO1xuXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLm1lbWJlcnMpIHtcblx0XHRcdGVsID0gdGhpcy5tZW1iZXJzW2ldO1xuXHRcdFx0aWYgKGVsIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0bWF0Y2hlcy5wdXNoLmFwcGx5KG1hdGNoZXMsIGVsLmZpbmRBbGwoc2VsZWN0b3IpKTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGVsLnF1ZXJ5U2VsZWN0b3JBbGwgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRpZiAoZWwubm9kZVR5cGUgPT09IDEgJiYgbWF0Y2hlc1NlbGVjdG9yKGVsLCBzZWxlY3RvcikpIG1hdGNoZXMucHVzaChlbCk7XG5cdFx0XHRcdG1hdGNoZXMucHVzaC5hcHBseShtYXRjaGVzLCBlbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hdGNoZXM7XG5cdH0sXG5cblx0ZmluZDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgZWwsIHJlcztcblxuXHRcdGZvciAodmFyIGkgaW4gdGhpcy5tZW1iZXJzKSB7XG5cdFx0XHRlbCA9IHRoaXMubWVtYmVyc1tpXTtcblx0XHRcdGlmIChlbCBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0XHRcdHJlcyA9IGVsLmZpbmQoc2VsZWN0b3IpO1xuXHRcdFx0fSBlbHNlIGlmIChlbC5ub2RlVHlwZSA9PT0gMSAmJiBtYXRjaGVzU2VsZWN0b3IoZWwsIHNlbGVjdG9yKSkge1xuXHRcdFx0XHRyZXMgPSBlbDtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGVsLnF1ZXJ5U2VsZWN0b3IgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRyZXMgPSBlbC5xdWVyeVNlbGVjdG9yKHNlbGVjdG9yKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHJlcyAhPSBudWxsKSByZXR1cm4gcmVzO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cbn0pO1xuXG4vLyBJbiBJRSA4LCBkb24ndCB1c2UgZW1wdHkgdGV4dCBub2RlcyBhcyBwbGFjZWhvbGRlcnNcbi8vIGluIGVtcHR5IERPTVJhbmdlcywgdXNlIGNvbW1lbnQgbm9kZXMgaW5zdGVhZC4gIFVzaW5nXG4vLyBlbXB0eSB0ZXh0IG5vZGVzIGluIG1vZGVybiBicm93c2VycyBpcyBncmVhdCBiZWNhdXNlXG4vLyBpdCBkb2Vzbid0IGNsdXR0ZXIgdGhlIHdlYiBpbnNwZWN0b3IuICBJbiBJRSA4LCBob3dldmVyLFxuLy8gaXQgc2VlbXMgdG8gbGVhZCBpbiBzb21lIHJvdW5kYWJvdXQgd2F5IHRvIHRoZSBPQXV0aFxuLy8gcG9wLXVwIGNyYXNoaW5nIHRoZSBicm93c2VyIGNvbXBsZXRlbHkuICBJbiB0aGUgcGFzdCxcbi8vIHdlIGRpZG4ndCB1c2UgZW1wdHkgdGV4dCBub2RlcyBvbiBJRSA4IGJlY2F1c2UgdGhleVxuLy8gZG9uJ3QgYWNjZXB0IEpTIHByb3BlcnRpZXMsIHNvIGp1c3QgdXNlIHRoZSBzYW1lIGxvZ2ljXG4vLyBldmVuIHRob3VnaCB3ZSBkb24ndCBuZWVkIHRvIHNldCBwcm9wZXJ0aWVzIG9uIHRoZVxuLy8gcGxhY2Vob2xkZXIgYW55bW9yZS5cbnZhciBVU0VfQ09NTUVOVF9QTEFDRUhPTERFUlMgPSAoZnVuY3Rpb24gKCkge1xuXHR2YXIgcmVzdWx0ID0gZmFsc2U7XG5cdHZhciB0ZXh0Tm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiXCIpO1xuXHR0cnkge1xuXHRcdHRleHROb2RlLnNvbWVQcm9wID0gdHJ1ZTtcblx0fSBjYXRjaCAoZSkge1xuXHRcdC8vIElFIDhcblx0XHRyZXN1bHQgPSB0cnVlO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59KSgpO1xuXG5mdW5jdGlvbiBwbGFjZWhvbGRlck5vZGUoKSB7XG5cdHJldHVybiBVU0VfQ09NTUVOVF9QTEFDRUhPTERFUlMgP1xuXHRcdGRvY3VtZW50LmNyZWF0ZUNvbW1lbnQoXCJcIikgOlxuXHRcdGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiXCIpO1xufVxuXG4vLyBwcml2YXRlIG1ldGhvZHNcbmZ1bmN0aW9uIGluc2VydEludG9ET00ocmFuZ2VPck5vZGUsIHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlKSB7XG5cdHZhciBtID0gcmFuZ2VPck5vZGU7XG5cdGlmIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRtLmF0dGFjaChwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSk7XG5cdH0gZWxzZSB7XG5cdFx0aWYgKF9pc01vdmUpIHtcblx0XHRcdG1vdmVOb2RlV2l0aEhvb2tzKG0sIHBhcmVudEVsZW1lbnQsIG5leHROb2RlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5zZXJ0Tm9kZVdpdGhIb29rcyhtLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUZyb21ET00ocmFuZ2VPck5vZGUpIHtcblx0dmFyIG0gPSByYW5nZU9yTm9kZTtcblx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdG0uZGV0YWNoKCk7XG5cdH0gZWxzZSB7XG5cdFx0cmVtb3ZlTm9kZVdpdGhIb29rcyhtKTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW1vdmVOb2RlV2l0aEhvb2tzKG4pIHtcblx0aWYgKCFuLnBhcmVudE5vZGUpIHJldHVybjtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgbi5wYXJlbnROb2RlLl91aWhvb2tzICYmIG4ucGFyZW50Tm9kZS5fdWlob29rcy5yZW1vdmVFbGVtZW50KSB7XG5cdFx0bi5wYXJlbnROb2RlLl91aWhvb2tzLnJlbW92ZUVsZW1lbnQobik7XG5cdH0gZWxzZSB7XG5cdFx0bi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG4pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGluc2VydE5vZGVXaXRoSG9va3MobiwgcGFyZW50LCBuZXh0KSB7XG5cdC8vIGB8fCBudWxsYCBiZWNhdXNlIElFIHRocm93cyBhbiBlcnJvciBpZiAnbmV4dCcgaXMgdW5kZWZpbmVkXG5cdG5leHQgPSBuZXh0IHx8IG51bGw7XG5cdGlmIChuLm5vZGVUeXBlID09PSAxICYmIHBhcmVudC5fdWlob29rcyAmJiBwYXJlbnQuX3VpaG9va3MuaW5zZXJ0RWxlbWVudCkge1xuXHRcdHBhcmVudC5fdWlob29rcy5pbnNlcnRFbGVtZW50KG4sIG5leHQpO1xuXHR9IGVsc2Uge1xuXHRcdHBhcmVudC5pbnNlcnRCZWZvcmUobiwgbmV4dCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gbW92ZU5vZGVXaXRoSG9va3MobiwgcGFyZW50LCBuZXh0KSB7XG5cdGlmIChuLnBhcmVudE5vZGUgIT09IHBhcmVudClcblx0XHRyZXR1cm47XG5cdC8vIGB8fCBudWxsYCBiZWNhdXNlIElFIHRocm93cyBhbiBlcnJvciBpZiAnbmV4dCcgaXMgdW5kZWZpbmVkXG5cdG5leHQgPSBuZXh0IHx8IG51bGw7XG5cdGlmIChuLm5vZGVUeXBlID09PSAxICYmIHBhcmVudC5fdWlob29rcyAmJiBwYXJlbnQuX3VpaG9va3MubW92ZUVsZW1lbnQpIHtcblx0XHRwYXJlbnQuX3VpaG9va3MubW92ZUVsZW1lbnQobiwgbmV4dCk7XG5cdH0gZWxzZSB7XG5cdFx0cGFyZW50Lmluc2VydEJlZm9yZShuLCBuZXh0KTtcblx0fVxufVxuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIHBhcnNlID0gcmVxdWlyZShcIi4vbSt4bWxcIikucGFyc2U7XG52YXIgTk9ERV9UWVBFID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5cbi8vIHByb3BlcnRpZXMgdGhhdCBOb2RlLmpzIGFuZCB0aGUgYnJvd3NlciBjYW4gaGFuZGxlXG52YXIgVGVtcGxlID0gbW9kdWxlLmV4cG9ydHMgPSB7XG5cdFZFUlNJT046IFwiMC41LjE1XCIsXG5cdE5PREVfVFlQRTogTk9ERV9UWVBFLFxuXG5cdC8vIG90aGVyIHBhcnRzXG5cdHV0aWxzOiByZXF1aXJlKFwiLi91dGlsc1wiKSxcblx0TW9kZWw6IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXG5cdC8vIHRyYWNrciBzaG9ydCBwb2ludGVyc1xuXHRUcmFja3I6IFRyYWNrcixcblx0RGVwZW5kZW5jeTogVHJhY2tyLkRlcGVuZGVuY3ksXG5cdGF1dG9ydW46IFRyYWNrci5hdXRvcnVuLFxuXHR0cmFjazogcmVxdWlyZShcInRyYWNrci1vYmplY3RzXCIpLFxuXG5cdC8vIGFsbCB0aGUgcGFyc2VycywgZGVjbGFyZWQgaGVyZSBmb3IgZWFzaWVyIGFjY2Vzc1xuXHRwYXJzZTogcGFyc2UsXG5cdHBhcnNlUGF0aDogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwicGF0aFwiIH0pKTtcblx0fSxcblx0cGFyc2VQYXRoUXVlcnk6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcInBhdGhRdWVyeVwiIH0pKTtcblx0fSxcblx0cGFyc2VBdHRyaWJ1dGVWYWx1ZTogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwiYXR0clZhbHVlXCIgfSkpO1xuXHR9LFxuXHRwYXJzZUFyZ3VtZW50czogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwiYXR0ckFyZ3VtZW50c1wiIH0pKTtcblx0fSxcblxuXHQvLyBjb252ZXJ0cyByYXcgaHRtbCBzdHIgdG8gdGVtcGxhdGUgdHJlZVxuXHRwYXJzZUhUTUw6IGZ1bmN0aW9uKHN0cikge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBOT0RFX1RZUEUuUk9PVCxcblx0XHRcdGNoaWxkcmVuOiBbIHtcblx0XHRcdFx0dHlwZTogTk9ERV9UWVBFLkhUTUwsXG5cdFx0XHRcdHZhbHVlOiBzdHJcblx0XHRcdH0gXSxcblx0XHRcdHZlcnNpb246IFRlbXBsZS5WRVJTSU9OXG5cdFx0fTtcblx0fVxufTtcblxuLy8gbm8gbmVlZCBmb3Igbm9kZSBqcyB0byBodXJ0IGl0c2VsZiBvbiBhbnkgaGFyZCBlZGdlc1xuaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXG4vLyBhdHRhY2ggdGhlIG90aGVyIHBhcnRzIHRoYXQgTm9kZSBjYW4ndCB1c2VcblRlbXBsZS5ET01SYW5nZSA9IHJlcXVpcmUoXCIuL2RvbXJhbmdlXCIpO1xuVGVtcGxlLlZpZXcgPSByZXF1aXJlKFwiLi92aWV3XCIpO1xuVGVtcGxlLlNlY3Rpb24gPSByZXF1aXJlKFwiLi9zZWN0aW9uXCIpO1xuXG4vLyBsb2FkIHRoZSByZWFsIGNsYXNzIGZvciB0aGUgYnJvd3NlclxuVGVtcGxlID0gbW9kdWxlLmV4cG9ydHMgPSBfLmV4dGVuZChyZXF1aXJlKFwiLi9tdXN0YWNoZVwiKSwgVGVtcGxlKTtcblxuLy8gbG9hZCB0aGUgcGx1Z2luIEFQSVxuXy5leHRlbmQoVGVtcGxlLCByZXF1aXJlKFwiLi9wbHVnaW5zXCIpKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuICAvKlxuICAgKiBHZW5lcmF0ZWQgYnkgUEVHLmpzIDAuOC4wLlxuICAgKlxuICAgKiBodHRwOi8vcGVnanMubWFqZGEuY3ovXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHBlZyRzdWJjbGFzcyhjaGlsZCwgcGFyZW50KSB7XG4gICAgZnVuY3Rpb24gY3RvcigpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9XG4gICAgY3Rvci5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuICAgIGNoaWxkLnByb3RvdHlwZSA9IG5ldyBjdG9yKCk7XG4gIH1cblxuICBmdW5jdGlvbiBTeW50YXhFcnJvcihtZXNzYWdlLCBleHBlY3RlZCwgZm91bmQsIG9mZnNldCwgbGluZSwgY29sdW1uKSB7XG4gICAgdGhpcy5tZXNzYWdlICA9IG1lc3NhZ2U7XG4gICAgdGhpcy5leHBlY3RlZCA9IGV4cGVjdGVkO1xuICAgIHRoaXMuZm91bmQgICAgPSBmb3VuZDtcbiAgICB0aGlzLm9mZnNldCAgID0gb2Zmc2V0O1xuICAgIHRoaXMubGluZSAgICAgPSBsaW5lO1xuICAgIHRoaXMuY29sdW1uICAgPSBjb2x1bW47XG5cbiAgICB0aGlzLm5hbWUgICAgID0gXCJTeW50YXhFcnJvclwiO1xuICB9XG5cbiAgcGVnJHN1YmNsYXNzKFN5bnRheEVycm9yLCBFcnJvcik7XG5cbiAgZnVuY3Rpb24gcGFyc2UoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGFyZ3VtZW50cy5sZW5ndGggPiAxID8gYXJndW1lbnRzWzFdIDoge30sXG5cbiAgICAgICAgcGVnJEZBSUxFRCA9IHt9LFxuXG4gICAgICAgIHBlZyRzdGFydFJ1bGVJbmRpY2VzID0geyBzdGFydDogMCwgYXR0clZhbHVlOiA5LCBhdHRyQXJndW1lbnRzOiAxMCwgcGF0aFF1ZXJ5OiAyMCwgcGF0aDogMjIgfSxcbiAgICAgICAgcGVnJHN0YXJ0UnVsZUluZGV4ICAgPSAwLFxuXG4gICAgICAgIHBlZyRjb25zdHMgPSBbXG4gICAgICAgICAgZnVuY3Rpb24oaHRtbCkge1xuICAgICAgICAgIFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0dHlwZTogTk9ERV9UWVBFLlJPT1QsXG4gICAgICAgICAgXHRcdGNoaWxkcmVuOiBodG1sLFxuICAgICAgICAgIFx0XHR2ZXJzaW9uOiBNdXN0YWNoZS5WRVJTSU9OXG4gICAgICAgICAgXHR9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXSxcbiAgICAgICAgICBmdW5jdGlvbihub2RlcykgeyByZXR1cm4gXy5jb21wYWN0KG5vZGVzKTsgfSxcbiAgICAgICAgICBwZWckRkFJTEVELFxuICAgICAgICAgIC9eW148e10vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXjx7XVwiLCBkZXNjcmlwdGlvbjogXCJbXjx7XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odGV4dCkgeyByZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuVEVYVCwgdmFsdWU6IHRleHQuam9pbihcIlwiKSB9OyB9LFxuICAgICAgICAgIFwiPCEtLVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIjwhLS1cIiwgZGVzY3JpcHRpb246IFwiXFxcIjwhLS1cXFwiXCIgfSxcbiAgICAgICAgICB2b2lkIDAsXG4gICAgICAgICAgXCItLT5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCItLT5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi0tPlxcXCJcIiB9LFxuICAgICAgICAgIHsgdHlwZTogXCJhbnlcIiwgZGVzY3JpcHRpb246IFwiYW55IGNoYXJhY3RlclwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odikge1xuICAgICAgICAgIFx0XHRyZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuWENPTU1FTlQsIHZhbHVlOiB2IH07XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIGZ1bmN0aW9uKHN0YXJ0LCBub2RlcywgZW5kKSB7XG4gICAgICAgICAgXHRcdGlmIChzdGFydC5uYW1lLnRvTG93ZXJDYXNlKCkgIT09IGVuZC50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudCB0YWcgbWlzbWF0Y2g6IFwiICsgc3RhcnQubmFtZSArIFwiICE9PSBcIiArIGVuZCk7XG4gICAgICAgICAgXHRcdH1cblxuICAgICAgICAgIFx0XHRzdGFydC50eXBlID0gTk9ERV9UWVBFLkVMRU1FTlQ7XG4gICAgICAgICAgXHRcdHN0YXJ0LmNoaWxkcmVuID0gbm9kZXM7XG4gICAgICAgICAgXHRcdHJldHVybiBzdGFydDtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCI8XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPFxcXCJcIiB9LFxuICAgICAgICAgIFwiLz5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIvPlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLz5cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0YWduYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0bmFtZTogdGFnbmFtZSxcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuRUxFTUVOVCxcbiAgICAgICAgICBcdFx0XHRhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzLFxuICAgICAgICAgIFx0XHRcdGNoaWxkcmVuOiBbXVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiPlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIj5cIiwgZGVzY3JpcHRpb246IFwiXFxcIj5cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0YWduYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7IG5hbWU6IHRhZ25hbWUsIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMgfTtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCI8L1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIjwvXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI8L1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHRhZ25hbWUpIHsgcmV0dXJuIHRhZ25hbWU7IH0sXG4gICAgICAgICAgbnVsbCxcbiAgICAgICAgICBcIj1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI9XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI9XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHR2YWx1ZSA9IHZhbHVlICE9IG51bGwgPyB2YWx1ZVsyXSA6IFwiXCI7XG4gICAgICAgICAgXHRcdHZhciBhcmdzXG5cbiAgICAgICAgICBcdFx0Ly8gY291bGQgZmFpbCBvbiBjb21wbGV4IGF0dHJpYnV0ZXNcbiAgICAgICAgICBcdFx0dHJ5IHtcbiAgICAgICAgICBcdFx0XHRhcmdzID0gcGFyc2UodmFsdWUsICBfLmV4dGVuZCh7fSwgb3B0aW9ucywgeyBzdGFydFJ1bGU6IFwiYXR0ckFyZ3VtZW50c1wiIH0pKTtcbiAgICAgICAgICBcdFx0fSBjYXRjaChlKSB7XG4gICAgICAgICAgXHRcdFx0YXJncyA9IFt7IHR5cGU6IE5PREVfVFlQRS5MSVRFUkFMLCB2YWx1ZTogdmFsdWUgfV07XG4gICAgICAgICAgXHRcdH1cblxuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5BVFRSSUJVVEUsXG4gICAgICAgICAgXHRcdFx0bmFtZToga2V5LFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICBcdFx0XHRjaGlsZHJlbjogcGFyc2UodmFsdWUsIF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7IHN0YXJ0UnVsZTogXCJhdHRyVmFsdWVcIiB9KSksXG4gICAgICAgICAgXHRcdFx0YXJndW1lbnRzOiBhcmdzXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCIsXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIFtdLmNvbmNhdChsLCBfLnBsdWNrKHIsIDEpKTsgfSxcbiAgICAgICAgICBmdW5jdGlvbih2KSB7IHJldHVybiB2LnRyaW0oKTsgfSxcbiAgICAgICAgICBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICBcdFx0aWYgKHZhbCAhPSBudWxsICYmIHZhbC50eXBlKSByZXR1cm4gdmFsO1xuICAgICAgICAgIFx0XHRyZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuTElURVJBTCwgdmFsdWU6IHZhbCB9O1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbihzdGFydCwgbm9kZXMsIGVuZCkge1xuICAgICAgICAgIFx0XHRpZiAob3B0aW9ucy5zdHJpY3QgJiYgIV8uaXNFcXVhbChzdGFydC52YWx1ZS5yYXcsIGVuZCkpIHtcbiAgICAgICAgICBcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJTZWN0aW9uIHRhZyBtaXNtYXRjaDogXCIgKyBzdGFydC52YWx1ZS5yYXcgKyBcIiAhPT0gXCIgKyBlbmQpO1xuICAgICAgICAgIFx0XHR9XG5cbiAgICAgICAgICBcdFx0c3RhcnQudmFsdWUgPSBzdGFydC52YWx1ZS5yZXN1bHQ7XG4gICAgICAgICAgXHRcdHN0YXJ0LmNoaWxkcmVuID0gbm9kZXM7XG4gICAgICAgICAgXHRcdHJldHVybiBzdGFydDtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCJ7e1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ7e1xcXCJcIiB9LFxuICAgICAgICAgIC9eWyNcXF5dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyNcXFxcXl1cIiwgZGVzY3JpcHRpb246IFwiWyNcXFxcXl1cIiB9LFxuICAgICAgICAgIFwifX1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ9fVwiLCBkZXNjcmlwdGlvbjogXCJcXFwifX1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0eXBlLCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRVt0eXBlID09PSBcIiNcIiA/IFwiU0VDVElPTlwiIDogXCJJTlZFUlRFRFwiXSxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcInt7L1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7L1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3svXFxcIlwiIH0sXG4gICAgICAgICAgL15bXn1dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW159XVwiLCBkZXNjcmlwdGlvbjogXCJbXn1dXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2YWx1ZSkgeyByZXR1cm4gdmFsdWUuam9pbihcIlwiKTsgfSxcbiAgICAgICAgICBcInt7e1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7e1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3t7XFxcIlwiIH0sXG4gICAgICAgICAgXCJ9fX1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ9fX1cIiwgZGVzY3JpcHRpb246IFwiXFxcIn19fVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLklOVEVSUE9MQVRPUixcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVbMV1cbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICAvXltcXC8jeyEkPlxcXl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXFxcXC8jeyEkPlxcXFxeXVwiLCBkZXNjcmlwdGlvbjogXCJbXFxcXC8jeyEkPlxcXFxeXVwiIH0sXG4gICAgICAgICAgXCImXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiJlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiJlxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKG0sIHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogbSA/IE5PREVfVFlQRS5UUklQTEUgOiBOT0RFX1RZUEUuSU5URVJQT0xBVE9SLFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLlRSSVBMRSxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcInt7IVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7IVwiLCBkZXNjcmlwdGlvbjogXCJcXFwie3shXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICBcdFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuTUNPTU1FTlQsXG4gICAgICAgICAgXHRcdFx0dmFsdWU6IHZhbHVlLmpvaW4oXCJcIikudHJpbSgpXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgL15bJD5dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyQ+XVwiLCBkZXNjcmlwdGlvbjogXCJbJD5dXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihtLCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5QQVJUSUFMLFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZS5qb2luKFwiXCIpLnRyaW0oKSxcbiAgICAgICAgICBcdFx0XHRsb2NhbDogbSA9PT0gXCIkXCJcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcInxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ8XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ8XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24obSkgeyByZXR1cm4geyByYXc6IHRleHQoKSwgcmVzdWx0OiBtIH0gfSxcbiAgICAgICAgICBmdW5jdGlvbihwLCBjKSB7XG4gICAgICAgICAgXHRcdGlmIChwID09IG51bGwpIHAgPSB7IHR5cGU6IFwiYWxsXCIgfTtcbiAgICAgICAgICBcdFx0cC5wYXJ0cyA9IGM7XG4gICAgICAgICAgXHRcdHJldHVybiBwO1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbihwKSB7IHAucGFydHMgPSBbXTsgcmV0dXJuIHA7IH0sXG4gICAgICAgICAgXCIuLi9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuLi9cIiwgZGVzY3JpcHRpb246IFwiXFxcIi4uL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGQpIHsgcmV0dXJuIHsgdHlwZTogXCJwYXJlbnRcIiwgZGlzdGFuY2U6IGQubGVuZ3RoIH07IH0sXG4gICAgICAgICAgXCIuL1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi4vXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4geyB0eXBlOiBcImxvY2FsXCIgfTsgfSxcbiAgICAgICAgICBcIi5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuXFxcIlwiIH0sXG4gICAgICAgICAgXCIvXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiL1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4geyB0eXBlOiBcInJvb3RcIiB9OyB9LFxuICAgICAgICAgIC9eW2EtejAtOSRfXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05JF9daVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05JF9daVwiIH0sXG4gICAgICAgICAgL15bYS16MC05OlxcLV8kXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05OlxcXFwtXyRdaVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05OlxcXFwtXyRdaVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oaywgYykgeyByZXR1cm4geyBrZXk6IGssIGNoaWxkcmVuOiBjIH0gfSxcbiAgICAgICAgICBcIltcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJbXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJbXFxcIlwiIH0sXG4gICAgICAgICAgXCJdXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGMpIHsgcmV0dXJuIGM7IH0sXG4gICAgICAgICAgXCJ0cnVlXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidHJ1ZVwiLCBkZXNjcmlwdGlvbjogXCJcXFwidHJ1ZVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gdHJ1ZTsgfSxcbiAgICAgICAgICBcImZhbHNlXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiZmFsc2VcIiwgZGVzY3JpcHRpb246IFwiXFxcImZhbHNlXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBmYWxzZTsgfSxcbiAgICAgICAgICBcIi1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCItXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCItXFxcIlwiIH0sXG4gICAgICAgICAgL15bMC05XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlswLTldXCIsIGRlc2NyaXB0aW9uOiBcIlswLTldXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHBhcnNlRmxvYXQodGV4dCgpLCAxMCk7IH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBwYXJzZUludCh0ZXh0KCksIDEwKTsgfSxcbiAgICAgICAgICBcIlxcXCJcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJcXFwiXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJcXFxcXFxcIlxcXCJcIiB9LFxuICAgICAgICAgIC9eW15cIl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXlxcXCJdXCIsIGRlc2NyaXB0aW9uOiBcIlteXFxcIl1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHYpIHsgcmV0dXJuIHYuam9pbihcIlwiKTsgfSxcbiAgICAgICAgICBcIidcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCInXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCInXFxcIlwiIH0sXG4gICAgICAgICAgL15bXiddLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW14nXVwiLCBkZXNjcmlwdGlvbjogXCJbXiddXCIgfSxcbiAgICAgICAgICBcIm51bGxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJudWxsXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJudWxsXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBudWxsOyB9LFxuICAgICAgICAgIFwidW5kZWZpbmVkXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidW5kZWZpbmVkXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ1bmRlZmluZWRcXFwiXCIgfSxcbiAgICAgICAgICBcInZvaWRcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ2b2lkXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ2b2lkXFxcIlwiIH0sXG4gICAgICAgICAgL15bLDsgXFx0XFxuXFxyXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlssOyBcXFxcdFxcXFxuXFxcXHJdXCIsIGRlc2NyaXB0aW9uOiBcIlssOyBcXFxcdFxcXFxuXFxcXHJdXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHZvaWQgMDsgfSxcbiAgICAgICAgICAvXlthLXowLTlfXFwtXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05X1xcXFwtXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOV9cXFxcLV1pXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihrKSB7IHJldHVybiBrOyB9LFxuICAgICAgICAgIHsgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogXCJ3aGl0ZXNwYWNlXCIgfSxcbiAgICAgICAgICAvXlsgXFx0XFxuXFxyXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlsgXFxcXHRcXFxcblxcXFxyXVwiLCBkZXNjcmlwdGlvbjogXCJbIFxcXFx0XFxcXG5cXFxccl1cIiB9LFxuICAgICAgICAgIHsgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogXCJndWFyYW50ZWVkIHdoaXRlc3BhY2VcIiB9LFxuICAgICAgICAgIFwiXFxcXFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIlxcXFxcIiwgZGVzY3JpcHRpb246IFwiXFxcIlxcXFxcXFxcXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oY2hhcikgeyByZXR1cm4gY2hhcjsgfVxuICAgICAgICBdLFxuXG4gICAgICAgIHBlZyRieXRlY29kZSA9IFtcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITchKycgNCE2ICEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITcsKkcgXFxcIjcyKkEgXFxcIjczKjsgXFxcIjcwKjUgXFxcIjcxKi8gXFxcIjcjKikgXFxcIjckKiMgXFxcIjdcXFwiLE0mNywqRyBcXFwiNzIqQSBcXFwiNzMqOyBcXFwiNzAqNSBcXFwiNzEqLyBcXFwiNyMqKSBcXFwiNyQqIyBcXFwiN1xcXCJcXFwiKycgNCE2XFxcIiEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITAkXFxcIlxcXCIxITMlKywkLCkmMCRcXFwiXFxcIjEhMyVcXFwiXFxcIlxcXCIgIysnIDQhNiYhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLidcXFwiXFxcIjInMygrXFx4QUMkISAhISE4LipcXFwiXFxcIjIqMys5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLFEmISE4LipcXFwiXFxcIjIqMys5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIishICglKzglLipcXFwiXFxcIjIqMysrKCU0IzYtIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCI3JSpJIFxcXCIhNyYrPiQ3ISs0JTcnKyolNCM2LiMjXFxcIiEgJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLi9cXFwiXFxcIjIvMzArVSQ3QStLJSAhNygsIyY3KFxcXCIrOSUuMVxcXCJcXFwiMjEzMispJTQkNjMkXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuL1xcXCJcXFwiMi8zMCtVJDdBK0slICE3KCwjJjcoXFxcIis5JS40XFxcIlxcXCIyNDM1KyklNCQ2NiRcXFwiXFxcIiElJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS43XFxcIlxcXCIyNzM4K0IkN0ErOCUuNFxcXCJcXFwiMjQzNSsoJTQjNjkjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QStoJCEuO1xcXCJcXFwiMjszPCtBJDdCKzclNz4rLSU3QisjJSckJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICMqIyBcXFwiIDorKSU0XFxcIjY9XFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITcsKjsgXFxcIjcyKjUgXFxcIjczKi8gXFxcIjcwKikgXFxcIjcxKiMgXFxcIjdcXFwiLEEmNywqOyBcXFwiNzIqNSBcXFwiNzMqLyBcXFwiNzAqKSBcXFwiNzEqIyBcXFwiN1xcXCJcXFwiKycgNCE2XFxcIiEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3KytxJCAhIS4+XFxcIlxcXCIyPjM/Ky0kNysrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsPiYhLj5cXFwiXFxcIjI+Mz8rLSQ3KysjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrKSU0XFxcIjZAXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QitcXHhENiQ3LypcXHhCNyBcXFwiNz4qXFx4QjEgXFxcIjc7KlxceEFCIFxcXCI3PCpcXHhBNSBcXFwiNz8qXFx4OUYgXFxcIjdAKlxceDk5IFxcXCIhISAhISE4Lj5cXFwiXFxcIjI+Mz85KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLFEmISE4Lj5cXFwiXFxcIjI+Mz85KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIishICglKycgNCE2QSEhICUrMiU3QisoJTQjNkIjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3LSs+JDchKzQlNy4rKiU0IzZDIyNcXFwiISAlJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuRFxcXCJcXFwiMkQzRStTJDBGXFxcIlxcXCIxITNHK0MlNzUrOSUuSFxcXCJcXFwiMkgzSSspJTQkNkokXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuS1xcXCJcXFwiMkszTCtiJCAhN0QqKSBcXFwiME1cXFwiXFxcIjEhM04sLyY3RCopIFxcXCIwTVxcXCJcXFwiMSEzTlxcXCIrOCUuSFxcXCJcXFwiMkgzSSsoJTQjNk8jISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEhLlBcXFwiXFxcIjJQM1ErPSQ3NCszJS5SXFxcIlxcXCIyUjNTKyMlJyMlJCMjICMkXFxcIiMgI1xcXCIjICMqTiBcXFwiIS5EXFxcIlxcXCIyRDNFKz0kNzQrMyUuSFxcXCJcXFwiMkgzSSsjJScjJSQjIyAjJFxcXCIjICNcXFwiIyAjKycgNCE2VCEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuRFxcXCJcXFwiMkQzRSt3JCE4MFVcXFwiXFxcIjEhM1Y5KiQkXFxcIlxcXCIgKVxcXCIjICMrWSUuV1xcXCJcXFwiMlczWCojIFxcXCIgOitDJTc0KzklLkhcXFwiXFxcIjJIM0krKSU0JTZZJVxcXCJcXFwiISUkJSMgIyQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuUFxcXCJcXFwiMlAzUStCJDc0KzglLlJcXFwiXFxcIjJSM1MrKCU0IzZaIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLltcXFwiXFxcIjJbM1xcXFwrYiQgITdEKikgXFxcIjBNXFxcIlxcXCIxITNOLC8mN0QqKSBcXFwiME1cXFwiXFxcIjEhM05cXFwiKzglLkhcXFwiXFxcIjJIM0krKCU0IzZdIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLkRcXFwiXFxcIjJEM0UrcyQwXlxcXCJcXFwiMSEzXytjJSAhN0QqKSBcXFwiME1cXFwiXFxcIjEhM04sLyY3RCopIFxcXCIwTVxcXCJcXFwiMSEzTlxcXCIrOSUuSFxcXCJcXFwiMkgzSSspJTQkNmAkXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3NitxJCAhIS5hXFxcIlxcXCIyYTNiKy0kNzYrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsPiYhLmFcXFwiXFxcIjJhM2IrLSQ3NisjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrKSU0XFxcIjZAXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3NCsnIDQhNmMhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0IrTSQ3NyojIFxcXCIgOis9JTc4KzMlN0IrKSU0JDZkJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjKkcgXFxcIiE3Qis8JDc3KzIlN0IrKCU0IzZlIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICEuZlxcXCJcXFwiMmYzZyssJCwpJi5mXFxcIlxcXCIyZjNnXFxcIlxcXCJcXFwiICMrJyA0ITZoISEgJSpiIFxcXCIhLmlcXFwiXFxcIjJpM2orJiA0ITZrISAlKksgXFxcIiEubFxcXCJcXFwiMmwzbSsmIDQhNmshICUqNCBcXFwiIS5uXFxcIlxcXCIybjNvKyYgNCE2cCEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITc5K3EkICEhLmxcXFwiXFxcIjJsM20rLSQ3OSsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyw+JiEubFxcXCJcXFwiMmwzbSstJDc5KyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIispJTRcXFwiNkBcXFwiXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISEhMHFcXFwiXFxcIjEhM3IrQSQgITBzXFxcIlxcXCIxITN0LCkmMHNcXFwiXFxcIjEhM3RcXFwiKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjKyEgKCUrOyQgITc6LCMmNzpcXFwiKyklNFxcXCI2dVxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLnZcXFwiXFxcIjJ2M3crYiQ3QitYJTc9KikgXFxcIjc+KiMgXFxcIjc2K0IlN0IrOCUueFxcXCJcXFwiMngzeSsoJTQlNnolIVxcXCIlJCUjICMkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLntcXFwiXFxcIjJ7M3wrJiA0ITZ9ISAlKjQgXFxcIiEuflxcXCJcXFwiMn4zfysmIDQhNlxceDgwISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDgxXFxcIlxcXCIyXFx4ODEzXFx4ODIqIyBcXFwiIDorXFx4OTIkICEwXFx4ODNcXFwiXFxcIjEhM1xceDg0KywkLCkmMFxceDgzXFxcIlxcXCIxITNcXHg4NFxcXCJcXFwiXFxcIiAjK20lIS5sXFxcIlxcXCIybDNtK0gkICEwXFx4ODNcXFwiXFxcIjEhM1xceDg0KywkLCkmMFxceDgzXFxcIlxcXCIxITNcXHg4NFxcXCJcXFwiXFxcIiAjKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjKiMgXFxcIiA6KyclNCM2XFx4ODUjICUkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISAhMFxceDgzXFxcIlxcXCIxITNcXHg4NCssJCwpJjBcXHg4M1xcXCJcXFwiMSEzXFx4ODRcXFwiXFxcIlxcXCIgIysmIDQhNlxceDg2ISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDg3XFxcIlxcXCIyXFx4ODczXFx4ODgrYiQgITdEKikgXFxcIjBcXHg4OVxcXCJcXFwiMSEzXFx4OEEsLyY3RCopIFxcXCIwXFx4ODlcXFwiXFxcIjEhM1xceDhBXFxcIis4JS5cXHg4N1xcXCJcXFwiMlxceDg3M1xceDg4KyglNCM2XFx4OEIjISElJCMjICMkXFxcIiMgI1xcXCIjICMqcyBcXFwiIS5cXHg4Q1xcXCJcXFwiMlxceDhDM1xceDhEK2IkICE3RCopIFxcXCIwXFx4OEVcXFwiXFxcIjEhM1xceDhGLC8mN0QqKSBcXFwiMFxceDhFXFxcIlxcXCIxITNcXHg4RlxcXCIrOCUuXFx4OENcXFwiXFxcIjJcXHg4QzNcXHg4RCsoJTQjNlxceDhCIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDkwXFxcIlxcXCIyXFx4OTAzXFx4OTErJiA0ITZcXHg5MiEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHg5M1xcXCJcXFwiMlxceDkzM1xceDk0KlxceEIzIFxcXCIhLlxceDk1XFxcIlxcXCIyXFx4OTUzXFx4OTYrXFx4QTIkN0MrXFx4OTglICEhITgwXFx4OTdcXFwiXFxcIjEhM1xceDk4OSokJFxcXCJcXFwiIClcXFwiIyAjKzIkLVxcXCJcXFwiMSEzLCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIytUJCxRJiEhODBcXHg5N1xcXCJcXFwiMSEzXFx4OTg5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIlxcXCJcXFwiICMrIyUnIyUkIyMgIyRcXFwiIyAjXFxcIiMgIysmIDQhNlxceDk5ISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0IrXSQhICEwXFx4OUFcXFwiXFxcIjEhM1xceDlCKywkLCkmMFxceDlBXFxcIlxcXCIxITNcXHg5QlxcXCJcXFwiXFxcIiAjKyEgKCUrMiU3QisoJTQjNlxceDlDIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCI4ISAhMFxceDlFXFxcIlxcXCIxITNcXHg5RiwpJjBcXHg5RVxcXCJcXFwiMSEzXFx4OUZcXFwiKyEgKCU5KlxcXCIgM1xceDlEXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCI4ISAhMFxceDlFXFxcIlxcXCIxITNcXHg5RissJCwpJjBcXHg5RVxcXCJcXFwiMSEzXFx4OUZcXFwiXFxcIlxcXCIgIyshICglOSpcXFwiIDNcXHhBMFwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS5cXHhBMVxcXCJcXFwiMlxceEExM1xceEEyKzckLVxcXCJcXFwiMSEzLCsoJTRcXFwiNlxceEEzXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKVxuICAgICAgICBdLFxuXG4gICAgICAgIHBlZyRjdXJyUG9zICAgICAgICAgID0gMCxcbiAgICAgICAgcGVnJHJlcG9ydGVkUG9zICAgICAgPSAwLFxuICAgICAgICBwZWckY2FjaGVkUG9zICAgICAgICA9IDAsXG4gICAgICAgIHBlZyRjYWNoZWRQb3NEZXRhaWxzID0geyBsaW5lOiAxLCBjb2x1bW46IDEsIHNlZW5DUjogZmFsc2UgfSxcbiAgICAgICAgcGVnJG1heEZhaWxQb3MgICAgICAgPSAwLFxuICAgICAgICBwZWckbWF4RmFpbEV4cGVjdGVkICA9IFtdLFxuICAgICAgICBwZWckc2lsZW50RmFpbHMgICAgICA9IDAsXG5cbiAgICAgICAgcGVnJHJlc3VsdDtcblxuICAgIGlmIChcInN0YXJ0UnVsZVwiIGluIG9wdGlvbnMpIHtcbiAgICAgIGlmICghKG9wdGlvbnMuc3RhcnRSdWxlIGluIHBlZyRzdGFydFJ1bGVJbmRpY2VzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBzdGFydCBwYXJzaW5nIGZyb20gcnVsZSBcXFwiXCIgKyBvcHRpb25zLnN0YXJ0UnVsZSArIFwiXFxcIi5cIik7XG4gICAgICB9XG5cbiAgICAgIHBlZyRzdGFydFJ1bGVJbmRleCA9IHBlZyRzdGFydFJ1bGVJbmRpY2VzW29wdGlvbnMuc3RhcnRSdWxlXTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiB0ZXh0KCkge1xuICAgICAgcmV0dXJuIGlucHV0LnN1YnN0cmluZyhwZWckcmVwb3J0ZWRQb3MsIHBlZyRjdXJyUG9zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBvZmZzZXQoKSB7XG4gICAgICByZXR1cm4gcGVnJHJlcG9ydGVkUG9zO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxpbmUoKSB7XG4gICAgICByZXR1cm4gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBlZyRyZXBvcnRlZFBvcykubGluZTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb2x1bW4oKSB7XG4gICAgICByZXR1cm4gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBlZyRyZXBvcnRlZFBvcykuY29sdW1uO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4cGVjdGVkKGRlc2NyaXB0aW9uKSB7XG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24oXG4gICAgICAgIG51bGwsXG4gICAgICAgIFt7IHR5cGU6IFwib3RoZXJcIiwgZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uIH1dLFxuICAgICAgICBwZWckcmVwb3J0ZWRQb3NcbiAgICAgICk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXJyb3IobWVzc2FnZSkge1xuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKG1lc3NhZ2UsIG51bGwsIHBlZyRyZXBvcnRlZFBvcyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBvcykge1xuICAgICAgZnVuY3Rpb24gYWR2YW5jZShkZXRhaWxzLCBzdGFydFBvcywgZW5kUG9zKSB7XG4gICAgICAgIHZhciBwLCBjaDtcblxuICAgICAgICBmb3IgKHAgPSBzdGFydFBvczsgcCA8IGVuZFBvczsgcCsrKSB7XG4gICAgICAgICAgY2ggPSBpbnB1dC5jaGFyQXQocCk7XG4gICAgICAgICAgaWYgKGNoID09PSBcIlxcblwiKSB7XG4gICAgICAgICAgICBpZiAoIWRldGFpbHMuc2VlbkNSKSB7IGRldGFpbHMubGluZSsrOyB9XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbiA9IDE7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IGZhbHNlO1xuICAgICAgICAgIH0gZWxzZSBpZiAoY2ggPT09IFwiXFxyXCIgfHwgY2ggPT09IFwiXFx1MjAyOFwiIHx8IGNoID09PSBcIlxcdTIwMjlcIikge1xuICAgICAgICAgICAgZGV0YWlscy5saW5lKys7XG4gICAgICAgICAgICBkZXRhaWxzLmNvbHVtbiA9IDE7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IHRydWU7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uKys7XG4gICAgICAgICAgICBkZXRhaWxzLnNlZW5DUiA9IGZhbHNlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAocGVnJGNhY2hlZFBvcyAhPT0gcG9zKSB7XG4gICAgICAgIGlmIChwZWckY2FjaGVkUG9zID4gcG9zKSB7XG4gICAgICAgICAgcGVnJGNhY2hlZFBvcyA9IDA7XG4gICAgICAgICAgcGVnJGNhY2hlZFBvc0RldGFpbHMgPSB7IGxpbmU6IDEsIGNvbHVtbjogMSwgc2VlbkNSOiBmYWxzZSB9O1xuICAgICAgICB9XG4gICAgICAgIGFkdmFuY2UocGVnJGNhY2hlZFBvc0RldGFpbHMsIHBlZyRjYWNoZWRQb3MsIHBvcyk7XG4gICAgICAgIHBlZyRjYWNoZWRQb3MgPSBwb3M7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBwZWckY2FjaGVkUG9zRGV0YWlscztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckZmFpbChleHBlY3RlZCkge1xuICAgICAgaWYgKHBlZyRjdXJyUG9zIDwgcGVnJG1heEZhaWxQb3MpIHsgcmV0dXJuOyB9XG5cbiAgICAgIGlmIChwZWckY3VyclBvcyA+IHBlZyRtYXhGYWlsUG9zKSB7XG4gICAgICAgIHBlZyRtYXhGYWlsUG9zID0gcGVnJGN1cnJQb3M7XG4gICAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQgPSBbXTtcbiAgICAgIH1cblxuICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZC5wdXNoKGV4cGVjdGVkKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckYnVpbGRFeGNlcHRpb24obWVzc2FnZSwgZXhwZWN0ZWQsIHBvcykge1xuICAgICAgZnVuY3Rpb24gY2xlYW51cEV4cGVjdGVkKGV4cGVjdGVkKSB7XG4gICAgICAgIHZhciBpID0gMTtcblxuICAgICAgICBleHBlY3RlZC5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgICBpZiAoYS5kZXNjcmlwdGlvbiA8IGIuZGVzY3JpcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgICB9IGVsc2UgaWYgKGEuZGVzY3JpcHRpb24gPiBiLmRlc2NyaXB0aW9uKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB3aGlsZSAoaSA8IGV4cGVjdGVkLmxlbmd0aCkge1xuICAgICAgICAgIGlmIChleHBlY3RlZFtpIC0gMV0gPT09IGV4cGVjdGVkW2ldKSB7XG4gICAgICAgICAgICBleHBlY3RlZC5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZnVuY3Rpb24gYnVpbGRNZXNzYWdlKGV4cGVjdGVkLCBmb3VuZCkge1xuICAgICAgICBmdW5jdGlvbiBzdHJpbmdFc2NhcGUocykge1xuICAgICAgICAgIGZ1bmN0aW9uIGhleChjaCkgeyByZXR1cm4gY2guY2hhckNvZGVBdCgwKS50b1N0cmluZygxNikudG9VcHBlckNhc2UoKTsgfVxuXG4gICAgICAgICAgcmV0dXJuIHNcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcL2csICAgJ1xcXFxcXFxcJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cIi9nLCAgICAnXFxcXFwiJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXHgwOC9nLCAnXFxcXGInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcdC9nLCAgICdcXFxcdCcpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxuL2csICAgJ1xcXFxuJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXGYvZywgICAnXFxcXGYnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcci9nLCAgICdcXFxccicpXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xceDAwLVxceDA3XFx4MEJcXHgwRVxceDBGXS9nLCBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx4MCcgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHgxMC1cXHgxRlxceDgwLVxceEZGXS9nLCAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx4JyAgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHUwMTgwLVxcdTBGRkZdL2csICAgICAgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxcdTAnICsgaGV4KGNoKTsgfSlcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx1MTA4MC1cXHVGRkZGXS9nLCAgICAgICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHUnICArIGhleChjaCk7IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGV4cGVjdGVkRGVzY3MgPSBuZXcgQXJyYXkoZXhwZWN0ZWQubGVuZ3RoKSxcbiAgICAgICAgICAgIGV4cGVjdGVkRGVzYywgZm91bmREZXNjLCBpO1xuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBleHBlY3RlZC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGV4cGVjdGVkRGVzY3NbaV0gPSBleHBlY3RlZFtpXS5kZXNjcmlwdGlvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGV4cGVjdGVkRGVzYyA9IGV4cGVjdGVkLmxlbmd0aCA+IDFcbiAgICAgICAgICA/IGV4cGVjdGVkRGVzY3Muc2xpY2UoMCwgLTEpLmpvaW4oXCIsIFwiKVxuICAgICAgICAgICAgICArIFwiIG9yIFwiXG4gICAgICAgICAgICAgICsgZXhwZWN0ZWREZXNjc1tleHBlY3RlZC5sZW5ndGggLSAxXVxuICAgICAgICAgIDogZXhwZWN0ZWREZXNjc1swXTtcblxuICAgICAgICBmb3VuZERlc2MgPSBmb3VuZCA/IFwiXFxcIlwiICsgc3RyaW5nRXNjYXBlKGZvdW5kKSArIFwiXFxcIlwiIDogXCJlbmQgb2YgaW5wdXRcIjtcblxuICAgICAgICByZXR1cm4gXCJFeHBlY3RlZCBcIiArIGV4cGVjdGVkRGVzYyArIFwiIGJ1dCBcIiArIGZvdW5kRGVzYyArIFwiIGZvdW5kLlwiO1xuICAgICAgfVxuXG4gICAgICB2YXIgcG9zRGV0YWlscyA9IHBlZyRjb21wdXRlUG9zRGV0YWlscyhwb3MpLFxuICAgICAgICAgIGZvdW5kICAgICAgPSBwb3MgPCBpbnB1dC5sZW5ndGggPyBpbnB1dC5jaGFyQXQocG9zKSA6IG51bGw7XG5cbiAgICAgIGlmIChleHBlY3RlZCAhPT0gbnVsbCkge1xuICAgICAgICBjbGVhbnVwRXhwZWN0ZWQoZXhwZWN0ZWQpO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gbmV3IFN5bnRheEVycm9yKFxuICAgICAgICBtZXNzYWdlICE9PSBudWxsID8gbWVzc2FnZSA6IGJ1aWxkTWVzc2FnZShleHBlY3RlZCwgZm91bmQpLFxuICAgICAgICBleHBlY3RlZCxcbiAgICAgICAgZm91bmQsXG4gICAgICAgIHBvcyxcbiAgICAgICAgcG9zRGV0YWlscy5saW5lLFxuICAgICAgICBwb3NEZXRhaWxzLmNvbHVtblxuICAgICAgKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckZGVjb2RlKHMpIHtcbiAgICAgIHZhciBiYyA9IG5ldyBBcnJheShzLmxlbmd0aCksIGk7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGJjW2ldID0gcy5jaGFyQ29kZUF0KGkpIC0gMzI7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBiYztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckcGFyc2VSdWxlKGluZGV4KSB7XG4gICAgICB2YXIgYmMgICAgPSBwZWckYnl0ZWNvZGVbaW5kZXhdLFxuICAgICAgICAgIGlwICAgID0gMCxcbiAgICAgICAgICBpcHMgICA9IFtdLFxuICAgICAgICAgIGVuZCAgID0gYmMubGVuZ3RoLFxuICAgICAgICAgIGVuZHMgID0gW10sXG4gICAgICAgICAgc3RhY2sgPSBbXSxcbiAgICAgICAgICBwYXJhbXMsIGk7XG5cbiAgICAgIGZ1bmN0aW9uIHByb3RlY3Qob2JqZWN0KSB7XG4gICAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmFwcGx5KG9iamVjdCkgPT09IFwiW29iamVjdCBBcnJheV1cIiA/IFtdIDogb2JqZWN0O1xuICAgICAgfVxuXG4gICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICB3aGlsZSAoaXAgPCBlbmQpIHtcbiAgICAgICAgICBzd2l0Y2ggKGJjW2lwXSkge1xuICAgICAgICAgICAgY2FzZSAwOlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHByb3RlY3QocGVnJGNvbnN0c1tiY1tpcCArIDFdXSkpO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRjdXJyUG9zKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgICAgc3RhY2sucG9wKCk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zID0gc3RhY2sucG9wKCk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDQ6XG4gICAgICAgICAgICAgIHN0YWNrLmxlbmd0aCAtPSBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA1OlxuICAgICAgICAgICAgICBzdGFjay5zcGxpY2UoLTIsIDEpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA2OlxuICAgICAgICAgICAgICBzdGFja1tzdGFjay5sZW5ndGggLSAyXS5wdXNoKHN0YWNrLnBvcCgpKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNzpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChzdGFjay5zcGxpY2Uoc3RhY2subGVuZ3RoIC0gYmNbaXAgKyAxXSwgYmNbaXAgKyAxXSkpO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA4OlxuICAgICAgICAgICAgICBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChpbnB1dC5zdWJzdHJpbmcoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0sIHBlZyRjdXJyUG9zKSk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDk6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTA6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdID09PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTE6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTI6XG4gICAgICAgICAgICAgIGlmIChzdGFja1tzdGFjay5sZW5ndGggLSAxXSAhPT0gcGVnJEZBSUxFRCkge1xuICAgICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICAgIGlwcy5wdXNoKGlwKTtcblxuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMiArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBpcCArPSAyICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDEzOlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl0pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5sZW5ndGggPiBwZWckY3VyclBvcykge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgICAgaXAgKz0gMztcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE0OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM10pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0ubGVuZ3RoKSA9PT0gcGVnJGNvbnN0c1tiY1tpcCArIDFdXSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gNDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE1OlxuICAgICAgICAgICAgICBlbmRzLnB1c2goZW5kKTtcbiAgICAgICAgICAgICAgaXBzLnB1c2goaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM10pO1xuXG4gICAgICAgICAgICAgIGlmIChpbnB1dC5zdWJzdHIocGVnJGN1cnJQb3MsIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0ubGVuZ3RoKS50b0xvd2VyQ2FzZSgpID09PSBwZWckY29uc3RzW2JjW2lwICsgMV1dKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTY6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKHBlZyRjb25zdHNbYmNbaXAgKyAxXV0udGVzdChpbnB1dC5jaGFyQXQocGVnJGN1cnJQb3MpKSkge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gNDtcbiAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE3OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgYmNbaXAgKyAxXSkpO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyArPSBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxODpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckY29uc3RzW2JjW2lwICsgMV1dKTtcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgKz0gcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGg7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE5OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRGQUlMRUQpO1xuICAgICAgICAgICAgICBpZiAocGVnJHNpbGVudEZhaWxzID09PSAwKSB7XG4gICAgICAgICAgICAgICAgcGVnJGZhaWwocGVnJGNvbnN0c1tiY1tpcCArIDFdXSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjA6XG4gICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDEgLSBiY1tpcCArIDFdXTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjE6XG4gICAgICAgICAgICAgIHBlZyRyZXBvcnRlZFBvcyA9IHBlZyRjdXJyUG9zO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMjpcbiAgICAgICAgICAgICAgcGFyYW1zID0gYmMuc2xpY2UoaXAgKyA0LCBpcCArIDQgKyBiY1tpcCArIDNdKTtcbiAgICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGJjW2lwICsgM107IGkrKykge1xuICAgICAgICAgICAgICAgIHBhcmFtc1tpXSA9IHN0YWNrW3N0YWNrLmxlbmd0aCAtIDEgLSBwYXJhbXNbaV1dO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgc3RhY2suc3BsaWNlKFxuICAgICAgICAgICAgICAgIHN0YWNrLmxlbmd0aCAtIGJjW2lwICsgMl0sXG4gICAgICAgICAgICAgICAgYmNbaXAgKyAyXSxcbiAgICAgICAgICAgICAgICBwZWckY29uc3RzW2JjW2lwICsgMV1dLmFwcGx5KG51bGwsIHBhcmFtcylcbiAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICBpcCArPSA0ICsgYmNbaXAgKyAzXTtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjM6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJHBhcnNlUnVsZShiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDI0OlxuICAgICAgICAgICAgICBwZWckc2lsZW50RmFpbHMrKztcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjU6XG4gICAgICAgICAgICAgIHBlZyRzaWxlbnRGYWlscy0tO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCBvcGNvZGU6IFwiICsgYmNbaXBdICsgXCIuXCIpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlbmRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBlbmQgPSBlbmRzLnBvcCgpO1xuICAgICAgICAgIGlwID0gaXBzLnBvcCgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBzdGFja1swXTtcbiAgICB9XG5cblxuICAgIFx0dmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcbiAgICBcdFx0Tk9ERV9UWVBFID0gcmVxdWlyZShcIi4vdHlwZXNcIiksXG4gICAgXHRcdE11c3RhY2hlID0gcmVxdWlyZShcIi4vXCIpO1xuXG4gICAgXHRvcHRpb25zID0gXy5kZWZhdWx0cyhvcHRpb25zIHx8IHt9LCB7XG4gICAgXHRcdHN0cmljdDogdHJ1ZVxuICAgIFx0fSk7XG5cblxuICAgIHBlZyRyZXN1bHQgPSBwZWckcGFyc2VSdWxlKHBlZyRzdGFydFJ1bGVJbmRleCk7XG5cbiAgICBpZiAocGVnJHJlc3VsdCAhPT0gcGVnJEZBSUxFRCAmJiBwZWckY3VyclBvcyA9PT0gaW5wdXQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gcGVnJHJlc3VsdDtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKHBlZyRyZXN1bHQgIT09IHBlZyRGQUlMRUQgJiYgcGVnJGN1cnJQb3MgPCBpbnB1dC5sZW5ndGgpIHtcbiAgICAgICAgcGVnJGZhaWwoeyB0eXBlOiBcImVuZFwiLCBkZXNjcmlwdGlvbjogXCJlbmQgb2YgaW5wdXRcIiB9KTtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgcGVnJGJ1aWxkRXhjZXB0aW9uKG51bGwsIHBlZyRtYXhGYWlsRXhwZWN0ZWQsIHBlZyRtYXhGYWlsUG9zKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIFN5bnRheEVycm9yOiBTeW50YXhFcnJvcixcbiAgICBwYXJzZTogICAgICAgcGFyc2VcbiAgfTtcbn0pKCk7IiwidmFyIFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIik7XG52YXIgdHJhY2sgPSByZXF1aXJlKFwidHJhY2tyLW9iamVjdHNcIik7XG52YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xudmFyIHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XG52YXIgcGFyc2UgPSByZXF1aXJlKFwiLi9tK3htbFwiKS5wYXJzZTtcblxudmFyIE1vZGVsID1cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gTW9kZWwoZGF0YSwgcGFyZW50LCBvcHRpb25zKSB7XG5cdHRoaXMucHJveGllcyA9IFtdO1xuXHR0aGlzLl9kZXAgPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKTtcblx0aWYgKE1vZGVsLmlzTW9kZWwocGFyZW50KSkgdGhpcy5wYXJlbnQgPSBwYXJlbnQ7XG5cdHRoaXMuc2V0KGRhdGEsIG9wdGlvbnMpO1xufTtcblxuTW9kZWwuaXNNb2RlbCA9IGZ1bmN0aW9uKG8pIHtcblx0cmV0dXJuIG8gaW5zdGFuY2VvZiBNb2RlbDtcbn07XG5cbk1vZGVsLmV4dGVuZCA9IHJlcXVpcmUoXCJiYWNrYm9uZS1leHRlbmQtc3RhbmRhbG9uZVwiKTtcblxuTW9kZWwuX2RlZmF1bHRQcm94aWVzID0gWyB7XG5cdGlzTGlzdDogIHRydWUsXG5cdG1hdGNoOiAgIGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gXy5pc0FycmF5KGFycik7IH0sXG5cdGdldDogICAgIGZ1bmN0aW9uKGFyciwgaykgeyByZXR1cm4gayA9PT0gXCJsZW5ndGhcIiA/IHRoaXMubGVuZ3RoKGFycikgOiBhcnJba107IH0sXG5cdGxlbmd0aDogIGZ1bmN0aW9uKGFycikgICAgeyB2YXIgbGVuOyByZXR1cm4gdHlwZW9mKGxlbiA9IGFyci4kbGVuZ3RoKSA9PT0gXCJudW1iZXJcIiA/IGxlbiA6IGFyci5sZW5ndGg7IH0sXG5cdGtleXM6ICAgIGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gXy5yYW5nZSh0aGlzLmxlbmd0aChhcnIpKTsgfSxcblx0aXNFbXB0eTogZnVuY3Rpb24oYXJyKSAgICB7IHJldHVybiAhIXRoaXMubGVuZ3RoKGFycik7IH1cbn0sIHtcblx0bWF0Y2g6IGZ1bmN0aW9uKCkgICAgIHsgcmV0dXJuIHRydWU7IH0sXG5cdGdldDogICBmdW5jdGlvbih0LCBrKSB7IGlmICh0ICE9IG51bGwpIHJldHVybiB0W2tdOyB9XG59IF07XG5cbk1vZGVsLmNhbGxQcm94eU1ldGhvZCA9IGZ1bmN0aW9uKHByb3h5LCB0YXJnZXQsIG1ldGhvZCwgYXJncywgY3R4KSB7XG5cdGFyZ3MgPSBfLmlzQXJyYXkoYXJncykgPyBfLmNsb25lKGFyZ3MpIDogW107XG5cdGFyZ3MudW5zaGlmdChwcm94eSwgbWV0aG9kLCB0YXJnZXQpO1xuXHRhcmdzLnB1c2goY3R4KTtcblx0cmV0dXJuIHV0aWxzLnJlc3VsdC5hcHBseShudWxsLCBhcmdzKTtcbn07XG5cbl8uZXh0ZW5kKE1vZGVsLnByb3RvdHlwZSwge1xuXG5cdC8vIHNldHMgdGhlIGRhdGEgb24gdGhlIG1vZGVsXG5cdHNldDogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0aWYgKG9wdGlvbnMudHJhY2sgIT09IGZhbHNlKSB7XG5cdFx0XHRkYXRhID0gdHJhY2soZGF0YSwgb3B0aW9ucy50cmFjayk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kYXRhID0gZGF0YTtcblx0XHR0aGlzLl9kZXAuY2hhbmdlZCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFwcGVuZDogZnVuY3Rpb24obW9kZWwsIG9wdGlvbnMpIHtcblx0XHRpZiAoTW9kZWwuaXNNb2RlbChtb2RlbCkpIG1vZGVsLnBhcmVudCA9IHRoaXM7XG5cdFx0ZWxzZSBtb2RlbCA9IG5ldyBNb2RlbChtb2RlbCwgdGhpcywgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9LFxuXG5cdC8vIGFuIGFycmF5IG9mIG1vZGVscyBpbiB0aGUgY3VycmVudCBzdGFjaywgd2l0aCB0aGUgcm9vdCBhcyB0aGUgZmlyc3Rcblx0Z2V0QWxsTW9kZWxzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbW9kZWxzID0gWyB0aGlzIF0sXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwucGFyZW50KSB7XG5cdFx0XHRtb2RlbHMudW5zaGlmdChtb2RlbCA9IG1vZGVsLnBhcmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVscztcblx0fSxcblxuXHQvLyBnZXRzIHRoZSBtb2RlbCBpbiB0aGUgc3RhY2sgYXQgdGhlIGluZGV4XG5cdC8vIG5lZ2F0aXZlIHZhbHVlcyBzdGFydCBhdCByb290XG5cdGdldE1vZGVsQXRPZmZzZXQ6IGZ1bmN0aW9uKGluZGV4KSB7XG5cdFx0aWYgKCFfLmlzTnVtYmVyKGluZGV4KSB8fCBpc05hTihpbmRleCkpIGluZGV4ID0gMDtcblx0XHRpZiAoaW5kZXggPCAwKSByZXR1cm4gdGhpcy5nZXRBbGxNb2RlbHMoKVt+aW5kZXhdO1xuXG5cdFx0dmFyIG1vZGVsID0gdGhpcztcblxuXHRcdHdoaWxlIChpbmRleCAmJiBtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0XHRpbmRleC0tO1xuXHRcdH1cblxuXHRcdHJldHVybiBtb2RlbDtcblx0fSxcblxuXHQvLyBnZXRzIHRoZSBsYXN0IG1vZGVsIGluIHRoZSBzdGFja1xuXHRnZXRSb290TW9kZWw6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBtb2RlbCA9IHRoaXM7XG5cdFx0d2hpbGUgKG1vZGVsLnBhcmVudCAhPSBudWxsKSBtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHRyZXR1cm4gbW9kZWw7XG5cdH0sXG5cblx0Ly8gcmV0dXJucyB0aGUgZmlyc3QgbW9kZWwgd2hpY2ggcGFzc2VzIHRoZSBmdW5jdGlvblxuXHRmaW5kTW9kZWw6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0dmFyIGluZGV4ID0gMCxcblx0XHRcdG1vZGVsID0gdGhpcztcblxuXHRcdHdoaWxlIChtb2RlbCAhPSBudWxsKSB7XG5cdFx0XHRpZiAoZm4uY2FsbCh0aGlzLCBtb2RlbCwgaW5kZXgrKykpIHJldHVybiBtb2RlbDtcblx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdH1cblx0fSxcblxuXHQvLyByZXR1cm5zIHRoZSB2YWx1ZSBhdCBwYXRoLCBidXQgb25seSBsb29rcyBpbiB0aGUgZGF0YSBvbiB0aGlzIG1vZGVsXG5cdGdldExvY2FsOiBmdW5jdGlvbihwYXRoLCBjdHgpIHtcblx0XHRpZiAodHlwZW9mIHBhdGggPT09IFwic3RyaW5nXCIpIHBhdGggPSBwYXJzZShwYXRoLCB7IHN0YXJ0UnVsZTogXCJwYXRoXCIgfSk7XG5cdFx0aWYgKHBhdGggPT0gbnVsbCkgcGF0aCA9IHsgcGFydHM6IFtdIH07XG5cdFx0aWYgKCFfLmlzT2JqZWN0KHBhdGgpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG9yIG9iamVjdCBmb3IgcGF0aC5cIik7XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHRoaXMuX2RlcC5kZXBlbmQoKTtcblxuXHRcdHJldHVybiBfLnJlZHVjZShwYXRoLnBhcnRzLCBmdW5jdGlvbih0YXJnZXQsIHBhcnQpIHtcblx0XHRcdHRhcmdldCA9IHNlbGYuX2dldCh0YXJnZXQsIHBhcnQua2V5KTtcblxuXHRcdFx0Xy5lYWNoKHBhcnQuY2hpbGRyZW4sIGZ1bmN0aW9uKGspIHtcblx0XHRcdFx0aWYgKF8uaXNPYmplY3QoaykpIGsgPSBjdHguZ2V0KGspO1xuXHRcdFx0XHR0YXJnZXQgPSBzZWxmLl9nZXQodGFyZ2V0LCBrKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdH0sIHRoaXMuZGF0YSk7XG5cdH0sXG5cblx0Ly8gcmV0cmlldmVzIHZhbHVlIHdpdGggcGF0aCBxdWVyeVxuXHRnZXQ6IGZ1bmN0aW9uKHBhdGhzKSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKHR5cGVvZiBwYXRocyA9PT0gXCJzdHJpbmdcIikgcGF0aHMgPSBwYXJzZShwYXRocywgeyBzdGFydFJ1bGU6IFwicGF0aFF1ZXJ5XCIgfSk7XG5cdFx0aWYgKCFfLmlzQXJyYXkocGF0aHMpKSBwYXRocyA9IHBhdGhzICE9IG51bGwgPyBbIHBhdGhzIF0gOiBbXTtcblx0XHRpZiAoIXBhdGhzLmxlbmd0aCkgcGF0aHMucHVzaCh7IHR5cGU6IFwiYWxsXCIsIHBhcnRzOiBbXSB9KTtcblxuXHRcdHJldHVybiBfLnJlZHVjZShwYXRocywgZnVuY3Rpb24ocmVzdWx0LCBwYXRoLCBpbmRleCkge1xuXHRcdFx0dmFyIG1vZGVsID0gc2VsZixcblx0XHRcdFx0c2NvcGUgPSB0cnVlLFxuXHRcdFx0XHR2YWw7XG5cblx0XHRcdGlmIChwYXRoLnR5cGUgPT09IFwicm9vdFwiKSB7XG5cdFx0XHRcdG1vZGVsID0gc2VsZi5nZXRSb290TW9kZWwoKTtcblx0XHRcdH0gZWxzZSBpZiAocGF0aC50eXBlID09PSBcInBhcmVudFwiKSB7XG5cdFx0XHRcdG1vZGVsID0gc2VsZi5nZXRNb2RlbEF0T2Zmc2V0KHBhdGguZGlzdGFuY2UpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLnR5cGUgPT09IFwiYWxsXCIpIHtcblx0XHRcdFx0c2NvcGUgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVsID09IG51bGwpIHJldHVybjtcblxuXHRcdFx0d2hpbGUgKF8uaXNVbmRlZmluZWQodmFsKSAmJiBtb2RlbCAhPSBudWxsKSB7XG5cdFx0XHRcdHZhbCA9IG1vZGVsLmdldExvY2FsKHBhdGgsIHNlbGYpO1xuXHRcdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHRcdFx0aWYgKHNjb3BlKSBicmVhaztcblx0XHRcdH1cblxuXHRcdFx0aWYgKF8uaXNGdW5jdGlvbih2YWwpKSB7XG5cdFx0XHRcdHZhbCA9IHZhbC5jYWxsKHNlbGYsIGluZGV4ID09PSAwID8gbnVsbCA6IHJlc3VsdCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB2YWw7XG5cdFx0fSwgdm9pZCAwKTtcblx0fSxcblxuXHRfZ2V0OiBmdW5jdGlvbih0YXJnZXQsIGtleSkge1xuXHRcdHJldHVybiB0aGlzLmNhbGxQcm94eU1ldGhvZCh0aGlzLmdldFByb3h5QnlWYWx1ZSh0YXJnZXQpLCB0YXJnZXQsIFwiZ2V0XCIsIGtleSk7XG5cdH0sXG5cblx0cHJveHk6IGZ1bmN0aW9uKGtleSkge1xuXHRcdHZhciBwcm94eSA9IHRoaXMuZ2V0UHJveHlCeVZhbHVlKHRoaXMuZGF0YSk7XG5cdFx0aWYgKGtleSA9PSBudWxsKSByZXR1cm4gcHJveHk7XG5cdFx0dmFyIGFyZ3MgPSBfLnRvQXJyYXkoYXJndW1lbnRzKTtcblx0XHRhcmdzLnVuc2hpZnQocHJveHksIHRoaXMuZGF0YSk7XG5cdFx0cmV0dXJuIHRoaXMuY2FsbFByb3h5TWV0aG9kLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHR9LFxuXG5cdGNhbGxQcm94eU1ldGhvZDogZnVuY3Rpb24ocHJveHksIHRhcmdldCwgbWV0aG9kKSB7XG5cdFx0cmV0dXJuIE1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdGFyZ2V0LCBtZXRob2QsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMyksIHRoaXMpO1xuXHR9LFxuXG5cdGdldEFsbFByb3hpZXM6IGZ1bmN0aW9uKCkge1xuXHRcdHZhciBwcm94aWVzID0gW10sXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwgIT0gbnVsbCkge1xuXHRcdFx0cHJveGllcy5wdXNoLmFwcGx5KHByb3hpZXMsIG1vZGVsLnByb3hpZXMpO1xuXHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cHJveGllcy5wdXNoLmFwcGx5KHByb3hpZXMsIE1vZGVsLl9kZWZhdWx0UHJveGllcyk7XG5cblx0XHRyZXR1cm4gcHJveGllcztcblx0fSxcblxuXHRoYXNQcm94eTogZnVuY3Rpb24ocHJveHksIHByb3hpZXMpIHtcblx0XHRpZiAocHJveGllcyA9PSBudWxsKSBwcm94aWVzID0gdGhpcy5nZXRBbGxQcm94aWVzKCk7XG5cdFx0cmV0dXJuIF8uY29udGFpbnMocHJveGllcywgcHJveHkpO1xuXHR9LFxuXG5cdHJlZ2lzdGVyUHJveHk6IGZ1bmN0aW9uKHByb3h5KSB7XG5cdFx0aWYgKHR5cGVvZiBwcm94eSAhPT0gXCJvYmplY3RcIiB8fCBwcm94eSA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgb2JqZWN0IGZvciBwcm94eS5cIik7XG5cdFx0aWYgKHR5cGVvZiBwcm94eS5tYXRjaCAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJMYXllciBtaXNzaW5nIHJlcXVpcmVkIG1hdGNoIG1ldGhvZC5cIik7XG5cdFx0aWYgKHR5cGVvZiBwcm94eS5nZXQgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiTGF5ZXIgbWlzc2luZyByZXF1aXJlZCBnZXQgbWV0aG9kLlwiKTtcblx0XHRpZiAoIXRoaXMuaGFzUHJveHkocHJveHkpKSB0aGlzLnByb3hpZXMudW5zaGlmdChwcm94eSk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Z2V0UHJveHlCeVZhbHVlOiBmdW5jdGlvbih0YXJnZXQsIHByb3hpZXMpIHtcblx0XHRpZiAocHJveGllcyA9PSBudWxsKSBwcm94aWVzID0gdGhpcy5nZXRBbGxQcm94aWVzKCk7XG5cdFx0cmV0dXJuIF8uZmluZChwcm94aWVzLCBmdW5jdGlvbihwcm94eSkge1xuXHRcdFx0cmV0dXJuIHByb3h5Lm1hdGNoKHRhcmdldCk7XG5cdFx0fSk7XG5cdH0sXG5cblx0Ly8gZGVmaW5lcyBhIHJlYWN0aXZlIHByb3BlcnR5IG9uIGFuIG9iamVjdCB0aGF0IHBvaW50cyB0byB0aGUgZGF0YVxuXHRkZWZpbmVEYXRhTGluazogZnVuY3Rpb24ob2JqLCBwcm9wLCBvcHRpb25zKSB7XG5cdFx0dmFyIG1vZGVsID0gdGhpcztcblxuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRcdGNvbmZpZ3VyYWJsZTogb3B0aW9ucyAhPSBudWxsICYmIG9wdGlvbnMuY29uZmlndXJhYmxlLFxuXHRcdFx0ZW51bWVyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuZW51bWVyYWJsZSAhPT0gZmFsc2UsXG5cdFx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRtb2RlbC5fZGVwLmRlcGVuZCgpO1xuXHRcdFx0XHRyZXR1cm4gbW9kZWwuZGF0YTtcblx0XHRcdH0sXG5cdFx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0XHRtb2RlbC5zZXQodmFsKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBvYmo7XG5cdH1cblxufSk7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xudmFyIE5PREVfVFlQRSA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xudmFyIHBhcnNlID0gcmVxdWlyZShcIi4vbSt4bWxcIikucGFyc2U7XG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcbnZhciBWaWV3ID0gcmVxdWlyZShcIi4vdmlld1wiKTtcbnZhciBNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpO1xudmFyIFNlY3Rpb24gPSByZXF1aXJlKFwiLi9zZWN0aW9uXCIpO1xudmFyICR0cmFjayA9IHJlcXVpcmUoXCJ0cmFja3Itb2JqZWN0c1wiKTtcbnZhciBET01SYW5nZSA9IHJlcXVpcmUoXCIuL2RvbXJhbmdlXCIpO1xuXG52YXIgTXVzdGFjaGUgPVxubW9kdWxlLmV4cG9ydHMgPSBWaWV3LmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihkYXRhLCBvcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHQvLyBhZGQgdGVtcGxhdGVcblx0XHR2YXIgdGVtcGxhdGUgPSBvcHRpb25zLnRlbXBsYXRlIHx8IF8ucmVzdWx0KHRoaXMsIFwidGVtcGxhdGVcIik7XG5cdFx0aWYgKHRlbXBsYXRlICE9IG51bGwpIHRoaXMuc2V0VGVtcGxhdGUodGVtcGxhdGUpO1xuXG5cdFx0Ly8gYWRkIGRlY29yYXRvcnNcblx0XHR0aGlzLmRlY29yYXRlKF8uZXh0ZW5kKHt9LCBvcHRpb25zLmRlY29yYXRvcnMsIF8ucmVzdWx0KHRoaXMsIFwiZGVjb3JhdG9yc1wiKSkpO1xuXG5cdFx0Ly8gaW5pdGlhdGUgbGlrZSBhIG5vcm1hbCB2aWV3XG5cdFx0Vmlldy5jYWxsKHRoaXMsIGRhdGEsIG9wdGlvbnMpO1xuXHR9LFxuXG5cdC8vIHBhcnNlcyBhbmQgc2V0cyB0aGUgcm9vdCB0ZW1wbGF0ZVxuXHRzZXRUZW1wbGF0ZTogZnVuY3Rpb24odGVtcGxhdGUpIHtcblx0XHRpZiAoXy5pc1N0cmluZyh0ZW1wbGF0ZSkpIHRlbXBsYXRlID0gcGFyc2UodGVtcGxhdGUpO1xuXG5cdFx0aWYgKCFfLmlzT2JqZWN0KHRlbXBsYXRlKSB8fCB0ZW1wbGF0ZS50eXBlICE9PSBOT0RFX1RZUEUuUk9PVClcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgb3IgcGFyc2VkIHRlbXBsYXRlLlwiKTtcblxuXHRcdHRoaXMuX3RlbXBsYXRlID0gdGVtcGxhdGU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gY3JlYXRlcyBhIGRlY29yYXRvclxuXHRkZWNvcmF0ZTogZnVuY3Rpb24obmFtZSwgZm4sIG9wdGlvbnMpIHtcblx0XHRpZiAodHlwZW9mIG5hbWUgPT09IFwib2JqZWN0XCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKGZuLCBuKSB7XG5cdFx0XHRcdGlmIChfLmlzQXJyYXkoZm4pKSB0aGlzLmRlY29yYXRlKG4sIGZuWzBdLCBmblsxXSk7XG5cdFx0XHRcdGVsc2UgdGhpcy5kZWNvcmF0ZShuLCBmbiwgb3B0aW9ucyk7XG5cdFx0XHR9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIiB8fCBuYW1lID09PSBcIlwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgbm9uLWVtcHR5IHN0cmluZyBmb3IgZGVjb3JhdG9yIG5hbWUuXCIpO1xuXHRcdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIGZvciBkZWNvcmF0b3IuXCIpO1xuXG5cdFx0aWYgKHRoaXMuX2RlY29yYXRvcnMgPT0gbnVsbCkgdGhpcy5fZGVjb3JhdG9ycyA9IHt9O1xuXHRcdGlmICh0aGlzLl9kZWNvcmF0b3JzW25hbWVdID09IG51bGwpIHRoaXMuX2RlY29yYXRvcnNbbmFtZV0gPSBbXTtcblx0XHR2YXIgZGVjb3JhdG9ycyA9IHRoaXMuX2RlY29yYXRvcnNbbmFtZV07XG5cblx0XHRpZiAoIV8uZmluZFdoZXJlKGRlY29yYXRvcnMsIHsgY2FsbGJhY2s6IGZuIH0pKSB7XG5cdFx0XHRkZWNvcmF0b3JzLnB1c2goe1xuXHRcdFx0XHRjYWxsYmFjazogZm4sXG5cdFx0XHRcdG9wdGlvbnM6IG9wdGlvbnMgfHwge31cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGZpbmRzIGFsbCBkZWNvcmF0b3JzLCBsb2NhbGx5IGFuZCBpbiBwYXJlbnRcblx0ZmluZERlY29yYXRvcnM6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgZGVjb3JhdG9ycyA9IFtdLFxuXHRcdFx0YyA9IHRoaXMsIGssIGQ7XG5cblx0XHR3aGlsZSAoYyAhPSBudWxsKSB7XG5cdFx0XHRpZiAoYy5fZGVjb3JhdG9ycyAhPSBudWxsICYmIF8uaXNBcnJheShjLl9kZWNvcmF0b3JzW25hbWVdKSkge1xuXHRcdFx0XHRmb3IgKGsgaW4gYy5fZGVjb3JhdG9yc1tuYW1lXSkge1xuXHRcdFx0XHRcdGQgPSBjLl9kZWNvcmF0b3JzW25hbWVdW2tdO1xuXHRcdFx0XHRcdGlmICghXy5maW5kV2hlcmUoZGVjb3JhdG9ycywgeyBjYWxsYmFjazogZC5jYWxsYmFjayB9KSkge1xuXHRcdFx0XHRcdFx0ZGVjb3JhdG9ycy5wdXNoKF8uZXh0ZW5kKHsgY29udGV4dDogYyB9LCBkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGMgPSBjLnBhcmVudFJhbmdlO1xuXHRcdH1cblxuXHRcdHJldHVybiBkZWNvcmF0b3JzO1xuXHR9LFxuXG5cdC8vIHJlbW92ZXMgYSBkZWNvcmF0b3Jcblx0c3RvcERlY29yYXRpbmc6IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG5cdFx0aWYgKHR5cGVvZiBuYW1lID09PSBcImZ1bmN0aW9uXCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdFx0Zm4gPSBuYW1lO1xuXHRcdFx0bmFtZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RlY29yYXRvcnMgPT0gbnVsbCB8fCAobmFtZSA9PSBudWxsICYmIGZuID09IG51bGwpKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0b3JzID0ge307XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoZm4gPT0gbnVsbCkge1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2RlY29yYXRvcnNbbmFtZV07XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAobmFtZSA9PSBudWxsKSB7XG5cdFx0XHRfLmVhY2godGhpcy5fZGVjb3JhdG9ycywgZnVuY3Rpb24oZCwgbikge1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0b3JzW25dID0gXy5maWx0ZXIoZCwgZnVuY3Rpb24oX2QpIHtcblx0XHRcdFx0XHRyZXR1cm4gX2QuY2FsbGJhY2sgIT09IGZuO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0dmFyIGQgPSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdO1xuXHRcdFx0dGhpcy5fZGVjb3JhdG9yc1tuYW1lXSA9IF8uZmlsdGVyKGQsIGZ1bmN0aW9uKF9kKSB7XG5cdFx0XHRcdHJldHVybiBfZC5jYWxsYmFjayAhPT0gZm47XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBzcGVjaWFsIHBhcnRpYWwgc2V0dGVyIHRoYXQgY29udmVydHMgc3RyaW5ncyBpbnRvIG11c3RhY2hlIFZpZXdzXG5cdHNldFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUsIHBhcnRpYWwpIHtcblx0XHRpZiAoXy5pc09iamVjdChuYW1lKSkgcmV0dXJuIFZpZXcucHJvdG90eXBlLnNldFBhcnRpYWwuY2FsbCh0aGlzLCBuYW1lKTtcblxuXHRcdGlmIChfLmlzU3RyaW5nKHBhcnRpYWwpKSBwYXJ0aWFsID0gcGFyc2UocGFydGlhbCk7XG5cdFx0aWYgKF8uaXNPYmplY3QocGFydGlhbCkgJiYgcGFydGlhbC50eXBlID09PSBOT0RFX1RZUEUuUk9PVCkgcGFydGlhbCA9IE11c3RhY2hlLmV4dGVuZCh7IHRlbXBsYXRlOiBwYXJ0aWFsIH0pO1xuXHRcdGlmIChwYXJ0aWFsICE9IG51bGwgJiYgIXV0aWxzLmlzU3ViQ2xhc3MoVmlldywgcGFydGlhbCkpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIHRlbXBsYXRlLCBwYXJzZWQgdGVtcGxhdGUsIFZpZXcgc3ViY2xhc3Mgb3IgZnVuY3Rpb24gZm9yIHBhcnRpYWwuXCIpO1xuXG5cdFx0cmV0dXJuIFZpZXcucHJvdG90eXBlLnNldFBhcnRpYWwuY2FsbCh0aGlzLCBuYW1lLCBwYXJ0aWFsKTtcblx0fSxcblxuXHQvLyB0aGUgbWFpbiByZW5kZXIgZnVuY3Rpb24gY2FsbGVkIGJ5IG1vdW50XG5cdHJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX3RlbXBsYXRlID09IG51bGwpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBhIHRlbXBsYXRlIHRvIGJlIHNldCBiZWZvcmUgcmVuZGVyaW5nLlwiKTtcblxuXHRcdHZhciB0b01vdW50O1xuXHRcdHRoaXMuc2V0TWVtYmVycyh0aGlzLnJlbmRlclRlbXBsYXRlKHRoaXMuX3RlbXBsYXRlLCBudWxsLCB0b01vdW50ID0gW10pKTtcblx0XHRfLmludm9rZSh0b01vdW50LCBcIm1vdW50XCIpO1xuXHR9LFxuXG5cdC8vIGNvbnZlcnRzIGEgdGVtcGxhdGUgaW50byBhbiBhcnJheSBvZiBlbGVtZW50cyBhbmQgRE9NUmFuZ2VzXG5cdHJlbmRlclRlbXBsYXRlOiBmdW5jdGlvbih0ZW1wbGF0ZSwgdmlldywgdG9Nb3VudCkge1xuXHRcdGlmICh2aWV3ID09IG51bGwpIHZpZXcgPSB0aGlzO1xuXHRcdGlmICh0b01vdW50ID09IG51bGwpIHRvTW91bnQgPSBbXTtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRpZiAoXy5pc0FycmF5KHRlbXBsYXRlKSkgcmV0dXJuIHRlbXBsYXRlLnJlZHVjZShmdW5jdGlvbihyLCB0KSB7XG5cdFx0XHR2YXIgYiA9IHNlbGYucmVuZGVyVGVtcGxhdGUodCwgdmlldywgdG9Nb3VudCk7XG5cdFx0XHRpZiAoXy5pc0FycmF5KGIpKSByLnB1c2guYXBwbHkociwgYik7XG5cdFx0XHRlbHNlIGlmIChiICE9IG51bGwpIHIucHVzaChiKTtcblx0XHRcdHJldHVybiByO1xuXHRcdH0sIFtdKTtcblxuXHRcdHN3aXRjaCh0ZW1wbGF0ZS50eXBlKSB7XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5ST09UOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJUZW1wbGF0ZSh0ZW1wbGF0ZS5jaGlsZHJlbiwgdmlldywgdG9Nb3VudCk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLkVMRU1FTlQ6XG5cdFx0XHRcdHZhciBwYXJ0ID0gdGhpcy5yZW5kZXJQYXJ0aWFsKHRlbXBsYXRlLm5hbWUsIHZpZXcpO1xuXHRcdFx0XHR2YXIgb2JqO1xuXG5cdFx0XHRcdGlmIChwYXJ0ICE9IG51bGwpIHtcblx0XHRcdFx0XHRwYXJ0LmFkZERhdGEob2JqID0gJHRyYWNrKHt9KSk7XG5cblx0XHRcdFx0XHR0ZW1wbGF0ZS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24oYXR0cikge1xuXHRcdFx0XHRcdFx0c2VsZi5hdXRvcnVuKGZ1bmN0aW9uKGMpIHtcblx0XHRcdFx0XHRcdFx0dmFyIHZhbCA9IHRoaXMucmVuZGVyQXJndW1lbnRzKGF0dHIuYXJndW1lbnRzLCB2aWV3KTtcblx0XHRcdFx0XHRcdFx0aWYgKHZhbC5sZW5ndGggPT09IDEpIHZhbCA9IHZhbFswXTtcblx0XHRcdFx0XHRcdFx0ZWxzZSBpZiAoIXZhbC5sZW5ndGgpIHZhbCA9IHZvaWQgMDtcblxuXHRcdFx0XHRcdFx0XHRpZiAoYy5maXJzdFJ1bikgb2JqLmRlZmluZVByb3BlcnR5KGF0dHIubmFtZSwgdmFsKTtcblx0XHRcdFx0XHRcdFx0ZWxzZSBvYmpbYXR0ci5uYW1lXSA9IHZhbDtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0dG9Nb3VudC5wdXNoKHBhcnQpO1xuXHRcdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0ZW1wbGF0ZS5uYW1lKTtcblxuXHRcdFx0XHRcdHRlbXBsYXRlLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5yZW5kZXJEZWNvcmF0aW9ucyhlbCwgYXR0ciwgdmlldykpIHJldHVybjtcblxuXHRcdFx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoYXR0ci5uYW1lLCB0aGlzLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcoYXR0ci5jaGlsZHJlbiwgdmlldykpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0XHR2YXIgY2hpbGRyZW4gPSB0aGlzLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB2aWV3LCB0b01vdW50KSxcblx0XHRcdFx0XHRcdGNoaWxkLCBpO1xuXG5cdFx0XHRcdFx0Zm9yIChpIGluIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRjaGlsZCA9IGNoaWxkcmVuW2ldO1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0Y2hpbGQucGFyZW50UmFuZ2UgPSB2aWV3OyAvLyBmYWtlIHRoZSBwYXJlbnRcblx0XHRcdFx0XHRcdFx0Y2hpbGQuYXR0YWNoKGVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGVsLmFwcGVuZENoaWxkKGNoaWxkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gZWw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVEVYVDpcblx0XHRcdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHV0aWxzLmRlY29kZUVudGl0aWVzKHRlbXBsYXRlLnZhbHVlKSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLkhUTUw6XG5cdFx0XHRcdHJldHVybiBuZXcgRE9NUmFuZ2UodXRpbHMucGFyc2VIVE1MKHRlbXBsYXRlLnZhbHVlKSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlhDT01NRU5UOlxuXHRcdFx0XHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlQ29tbWVudCh0ZW1wbGF0ZS52YWx1ZSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVEVSUE9MQVRPUjpcblx0XHRcdFx0dmFyIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblxuXHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0dmFyIHZhbCA9IHZpZXcuZ2V0KHRlbXBsYXRlLnZhbHVlKTtcblx0XHRcdFx0XHRub2RlLm5vZGVWYWx1ZSA9IHR5cGVvZiB2YWwgPT09IFwic3RyaW5nXCIgPyB2YWwgOiB2YWwgIT0gbnVsbCA/IHZhbC50b1N0cmluZygpIDogXCJcIjtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIG5vZGU7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRSSVBMRTpcblx0XHRcdFx0dmFyIHJhbmdlID0gbmV3IERPTVJhbmdlKCk7XG5cblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHJhbmdlLnNldE1lbWJlcnModXRpbHMucGFyc2VIVE1MKHZpZXcuZ2V0KHRlbXBsYXRlLnZhbHVlKSkpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gcmFuZ2U7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVkVSVEVEOlxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuU0VDVElPTjpcblx0XHRcdFx0dmFyIHNlY3Rpb24gPSBuZXcgU2VjdGlvbih2aWV3Lm1vZGVsKVxuXHRcdFx0XHRcdC5pbnZlcnQodGVtcGxhdGUudHlwZSA9PT0gTk9ERV9UWVBFLklOVkVSVEVEKVxuXHRcdFx0XHRcdC5zZXRQYXRoKHRlbXBsYXRlLnZhbHVlKVxuXHRcdFx0XHRcdC5vblJvdyhmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdHZhciBfdG9Nb3VudDtcblx0XHRcdFx0XHRcdHRoaXMuc2V0TWVtYmVycyhzZWxmLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB0aGlzLCBfdG9Nb3VudCA9IFtdKSk7XG5cdFx0XHRcdFx0XHRfLmludm9rZShfdG9Nb3VudCwgXCJtb3VudFwiKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0b01vdW50LnB1c2goc2VjdGlvbik7XG5cdFx0XHRcdHJldHVybiBzZWN0aW9uO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5QQVJUSUFMOlxuXHRcdFx0XHR2YXIgcGFydGlhbCA9IHRoaXMucmVuZGVyUGFydGlhbCh0ZW1wbGF0ZSwgdmlldyk7XG5cdFx0XHRcdGlmIChwYXJ0aWFsKSB0b01vdW50LnB1c2gocGFydGlhbCk7XG5cdFx0XHRcdHJldHVybiBwYXJ0aWFsO1xuXHRcdH1cblx0fSxcblxuXHQvLyBjb252ZXJ0cyBhIHRlbXBsYXRlIGludG8gYSBzdHJpbmdcblx0cmVuZGVyVGVtcGxhdGVBc1N0cmluZzogZnVuY3Rpb24odGVtcGxhdGUsIGN0eCkge1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgVmlldykgY3R4ID0gY3R4Lm1vZGVsO1xuXHRcdHZhciBzZWxmID0gdGhpcywgdmFsO1xuXG5cdFx0aWYgKF8uaXNBcnJheSh0ZW1wbGF0ZSkpIHJldHVybiB0ZW1wbGF0ZS5tYXAoZnVuY3Rpb24odCkge1xuXHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0LCBjdHgpO1xuXHRcdH0pLmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9IG51bGw7IH0pLmpvaW4oXCJcIik7XG5cblx0XHRzd2l0Y2godGVtcGxhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuUk9PVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0ZW1wbGF0ZS5jaGlsZHJlbiwgY3R4KTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVEVYVDpcblx0XHRcdFx0cmV0dXJuIHRlbXBsYXRlLnZhbHVlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlRFUlBPTEFUT1I6XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5UUklQTEU6XG5cdFx0XHRcdHZhbCA9IGN0eC5nZXQodGVtcGxhdGUudmFsdWUpO1xuXHRcdFx0XHRyZXR1cm4gdmFsICE9IG51bGwgPyB2YWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlNFQ1RJT046XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlZFUlRFRDpcblx0XHRcdFx0dmFyIGludmVydGVkLCBtb2RlbCwgaXNFbXB0eSwgbWFrZVJvdywgcHJveHksIGlzTGlzdDtcblxuXHRcdFx0XHRpbnZlcnRlZCA9IHRlbXBsYXRlLnR5cGUgPT09IE5PREVfVFlQRS5JTlZFUlRFRDtcblx0XHRcdFx0dmFsID0gY3R4LmdldCh0ZW1wbGF0ZS52YWx1ZSk7XG5cdFx0XHRcdG1vZGVsID0gbmV3IE1vZGVsKHZhbCwgY3R4KTtcblx0XHRcdFx0cHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUodmFsKTtcblx0XHRcdFx0aXNMaXN0ID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiaXNMaXN0XCIpO1xuXHRcdFx0XHRpc0VtcHR5ID0gU2VjdGlvbi5pc0VtcHR5KG1vZGVsLCBwcm94eSk7XG5cblx0XHRcdFx0bWFrZVJvdyA9IGZ1bmN0aW9uKGkpIHtcblx0XHRcdFx0XHR2YXIgZGF0YTtcblxuXHRcdFx0XHRcdGlmIChpID09IG51bGwpIHtcblx0XHRcdFx0XHRcdGRhdGEgPSBtb2RlbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGF0YSA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImdldFwiLCBpKTtcblx0XHRcdFx0XHRcdGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgbmV3IE1vZGVsKHsgJGtleTogaSB9LCBjdHgpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gc2VsZi5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKHRlbXBsYXRlLmNoaWxkcmVuLCBkYXRhKTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRpZiAoIShpc0VtcHR5IF4gaW52ZXJ0ZWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGlzTGlzdCAmJiAhaW52ZXJ0ZWQgP1xuXHRcdFx0XHRcdFx0bW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwia2V5c1wiKS5tYXAobWFrZVJvdykuam9pbihcIlwiKSA6XG5cdFx0XHRcdFx0XHRtYWtlUm93KCk7XG5cdFx0XHRcdH1cblx0XHR9XG5cdH0sXG5cblx0Ly8gY29udmVydHMgYW4gYXJndW1lbnQgdGVtcGxhdGUgaW50byBhbiBhcnJheSBvZiB2YWx1ZXNcblx0cmVuZGVyQXJndW1lbnRzOiBmdW5jdGlvbihhcmcsIGN0eCkge1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgVmlldykgY3R4ID0gY3R4Lm1vZGVsO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmIChfLmlzQXJyYXkoYXJnKSkgcmV0dXJuIGFyZy5tYXAoZnVuY3Rpb24oYSkge1xuXHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyQXJndW1lbnRzKGEsIGN0eCk7XG5cdFx0fSkuZmlsdGVyKGZ1bmN0aW9uKGIpIHsgcmV0dXJuIGIgIT0gbnVsbDsgfSk7XG5cblx0XHRzd2l0Y2goYXJnLnR5cGUpIHtcblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVEVSUE9MQVRPUjpcblx0XHRcdFx0cmV0dXJuIGN0eC5nZXQoYXJnLnZhbHVlKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuTElURVJBTDpcblx0XHRcdFx0cmV0dXJuIGFyZy52YWx1ZTtcblx0XHR9XG5cdH0sXG5cblx0Ly8gcmVuZGVycyBkZWNvcmF0aW9ucyBvbiBhbiBlbGVtZW50IGJ5IHRlbXBsYXRlXG5cdHJlbmRlckRlY29yYXRpb25zOiBmdW5jdGlvbihlbCwgYXR0ciwgY3R4KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0Ly8gbG9vayB1cCBkZWNvcmF0b3IgYnkgbmFtZVxuXHRcdHZhciBkZWNvcmF0b3JzID0gdGhpcy5maW5kRGVjb3JhdG9ycyhhdHRyLm5hbWUpO1xuXHRcdGlmICghZGVjb3JhdG9ycy5sZW5ndGgpIHJldHVybjtcblxuXHRcdC8vIG5vcm1hbGl6ZSB0aGUgY29udGV4dFxuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgVmlldykgY3R4ID0gY3R4Lm1vZGVsO1xuXG5cdFx0Ly8gYSB3cmFwcGVyIGNvbXB1dGF0aW9uIHRvIGV6LWNsZWFuIHRoZSByZXN0XG5cdFx0cmV0dXJuIHRoaXMuYXV0b3J1bihmdW5jdGlvbihfY29tcCkge1xuXHRcdFx0ZGVjb3JhdG9ycy5mb3JFYWNoKGZ1bmN0aW9uKGQpIHtcblx0XHRcdFx0aWYgKGQub3B0aW9ucyAmJiBkLm9wdGlvbnMuZGVmZXIpIF8uZGVmZXIoZXhlY0RlY29yYXRvcik7XG5cdFx0XHRcdGVsc2UgZXhlY0RlY29yYXRvcigpO1xuXG5cdFx0XHRcdGZ1bmN0aW9uIGV4ZWNEZWNvcmF0b3IoKSB7XG5cdFx0XHRcdFx0dmFyIGRjb21wID0gc2VsZi5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdFx0XHRcdC8vIGFzc2VtYmxlIHRoZSBhcmd1bWVudHMhXG5cdFx0XHRcdFx0XHR2YXIgYXJncyA9IFsge1xuXHRcdFx0XHRcdFx0XHR0YXJnZXQ6IGVsLFxuXHRcdFx0XHRcdFx0XHRtb2RlbDogY3R4LFxuXHRcdFx0XHRcdFx0XHR2aWV3OiBzZWxmLFxuXHRcdFx0XHRcdFx0XHR0ZW1wbGF0ZTogYXR0cixcblx0XHRcdFx0XHRcdFx0Y29tcDogY29tcCxcblx0XHRcdFx0XHRcdFx0b3B0aW9uczogZC5vcHRpb25zXG5cdFx0XHRcdFx0XHR9IF07XG5cblx0XHRcdFx0XHRcdC8vIHJlbmRlciBhcmd1bWVudHMgYmFzZWQgb24gb3B0aW9uc1xuXHRcdFx0XHRcdFx0aWYgKGQub3B0aW9ucyAmJiBkLm9wdGlvbnMucGFyc2UgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdFx0XHRcdFx0YXJncy5wdXNoKHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyhhdHRyLmNoaWxkcmVuLCBjdHgpKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZC5vcHRpb25zID09IG51bGwgfHwgZC5vcHRpb25zLnBhcnNlICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdFx0XHRhcmdzID0gYXJncy5jb25jYXQoc2VsZi5yZW5kZXJBcmd1bWVudHMoYXR0ci5hcmd1bWVudHMsIGN0eCkpO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHQvLyBleGVjdXRlIHRoZSBjYWxsYmFja1xuXHRcdFx0XHRcdFx0ZC5jYWxsYmFjay5hcHBseShkLmNvbnRleHQgfHwgc2VsZiwgYXJncyk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHQvLyBjbGVhbiB1cFxuXHRcdFx0XHRcdF9jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdGRjb21wLnN0b3AoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxufSwge1xuXG5cdHJlbmRlcjogZnVuY3Rpb24odGVtcGxhdGUsIGRhdGEsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gXy5leHRlbmQoe30sIG9wdGlvbnMgfHwge30sIHtcblx0XHRcdHRlbXBsYXRlOiB0ZW1wbGF0ZVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG5ldyBNdXN0YWNoZShkYXRhIHx8IG51bGwsIG9wdGlvbnMpO1xuXHR9XG5cbn0pO1xuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0TXVzdGFjaGUgPSByZXF1aXJlKFwiLi4vXCIpO1xuXG4vLyBnZW5lcmF0ZSBkZWNvcmF0b3JzXG52YXIgZXZlbnROYW1lcyA9IFtcblx0J2xvYWQnLCAnc2Nyb2xsJyxcblx0J2NsaWNrJywgJ2RibGNsaWNrJywgJ21vdXNlZG93bicsICdtb3VzZXVwJywgJ21vdXNlZW50ZXInLCAnbW91c2VsZWF2ZScsXG5cdCdrZXlkb3duJywgJ2tleXByZXNzJywgJ2tleXVwJyxcblx0J2JsdXInLCAnZm9jdXMnLCAnY2hhbmdlJywgJ2lucHV0JywgJ3N1Ym1pdCcsICdyZXNldCcsXG5cdCdkcmFnJywgJ2RyYWdkcm9wJywgJ2RyYWdlbmQnLCAnZHJhZ2VudGVyJywgJ2RyYWdleGl0JywgJ2RyYWdsZWF2ZScsICdkcmFnb3ZlcicsICdkcmFnc3RhcnQnLCAnZHJvcCdcbl07XG5cbnZhciBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbnZhciBkZWNvcmF0b3JzID0ge307XG5cbi8vIHRoZSBwbHVnaW5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMuYWRkQWN0aW9uID0gYWRkQWN0aW9uO1xuXHR0aGlzLmFkZEFjdGlvbk9uY2UgPSBhZGRBY3Rpb25PbmNlO1xuXHR0aGlzLnJlbW92ZUFjdGlvbiA9IHJlbW92ZUFjdGlvbjtcblx0dGhpcy5maXJlQWN0aW9uID0gZmlyZUFjdGlvbjtcblx0dGhpcy5kZWNvcmF0ZShkZWNvcmF0b3JzKTtcblxuXHR2YXIgaW5pdEFjdGlvbnMgPSBfLnJlc3VsdCh0aGlzLCBcImFjdGlvbnNcIik7XG5cdGlmIChpbml0QWN0aW9ucyAhPSBudWxsKSB0aGlzLmFkZEFjdGlvbihpbml0QWN0aW9ucyk7XG59O1xuXG5ldmVudE5hbWVzLmZvckVhY2goZnVuY3Rpb24oZXZlbnQpIHtcblx0ZGVjb3JhdG9yc1tcIm9uLVwiICsgZXZlbnRdID0gZnVuY3Rpb24oZGVjb3IsIGtleSkge1xuXHRcdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdGFyZ3MsIG5vZGU7XG5cblx0XHRmdW5jdGlvbiBsaXN0ZW5lcihlKSB7XG5cdFx0XHQvLyBjcmVhdGUgYSBuZXcgYWN0aW9uIG9iamVjdFxuXHRcdFx0dmFyIGFjdGlvbiA9IG5ldyBBY3Rpb24oa2V5KTtcblx0XHRcdGFjdGlvbi5vcmlnaW5hbCA9IGU7XG5cdFx0XHRhY3Rpb24udGFyZ2V0ID0gYWN0aW9uLm5vZGUgPSBub2RlO1xuXHRcdFx0YWN0aW9uLmNvbnRleHQgPSBhY3Rpb24ubW9kZWwgPSBkZWNvci5tb2RlbDtcblx0XHRcdGFjdGlvbi52aWV3ID0gZGVjb3IudmlldztcblxuXHRcdFx0Ly8gZmluZCB0aGUgZmlyc3QgcGFyZW50IHdpdGggdGhlIGZpcmUgbWV0aG9kXG5cdFx0XHR2YXIgZmlyZU9uID0gc2VsZjtcblx0XHRcdHdoaWxlICh0eXBlb2YgZmlyZU9uLmZpcmVBY3Rpb24gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHQvLyBpZiBpdCBoYXMgbm8gcGFyZW50LCB3ZSBjYW4ndCBkbyBhbnl0aGluZ1xuXHRcdFx0XHRpZiAoZmlyZU9uLnBhcmVudFJhbmdlID09IG51bGwpIHJldHVybjtcblx0XHRcdFx0ZmlyZU9uID0gZmlyZU9uLnBhcmVudFJhbmdlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBmaXJlIHRoZSBhY3Rpb25cblx0XHRcdGZpcmVPbi5maXJlQWN0aW9uLmFwcGx5KGZpcmVPbiwgWyBhY3Rpb24gXS5jb25jYXQoYXJncykpO1xuXHRcdH1cblxuXHRcdG5vZGUgPSBkZWNvci50YXJnZXQ7XG5cdFx0YXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDIpO1xuXHRcdG5vZGUuYWRkRXZlbnRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXIpO1xuXG5cdFx0ZGVjb3IuY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRub2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZlbnQsIGxpc3RlbmVyKTtcblx0XHR9KTtcblx0fTtcbn0pO1xuXG4vLyBBY3Rpb24gQ2xhc3NcbmZ1bmN0aW9uIEFjdGlvbihuYW1lKSB7XG5cdHRoaXMubmFtZSA9IG5hbWU7XG59XG5cbk11c3RhY2hlLkFjdGlvbiA9IEFjdGlvbjtcblxuQWN0aW9uLnByb3RvdHlwZS5idWJibGVzID0gdHJ1ZTtcblxuQWN0aW9uLnByb3RvdHlwZS5zdG9wUHJvcGFnYXRpb24gPSBmdW5jdGlvbigpIHtcblx0dGhpcy5idWJibGVzID0gZmFsc2U7XG5cdHJldHVybiB0aGlzO1xufTtcblxuLy8gTXN1dGFjaGUgSW5zdGFuY2UgTWV0aG9kc1xuZnVuY3Rpb24gYWRkQWN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJvYmplY3RcIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKGZuLCBuKSB7IHRoaXMuYWRkQWN0aW9uKG4sIGZuKTsgfSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIgfHwgbmFtZSA9PT0gXCJcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZm9yIGFjdGlvbiBuYW1lLlwiKTtcblx0aWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGFjdGlvbi5cIik7XG5cblx0aWYgKHRoaXMuX2FjdGlvbnMgPT0gbnVsbCkgdGhpcy5fYWN0aW9ucyA9IHt9O1xuXHRpZiAodGhpcy5fYWN0aW9uc1tuYW1lXSA9PSBudWxsKSB0aGlzLl9hY3Rpb25zW25hbWVdID0gW107XG5cdGlmICghfnRoaXMuX2FjdGlvbnNbbmFtZV0uaW5kZXhPZihmbikpIHRoaXMuX2FjdGlvbnNbbmFtZV0ucHVzaChmbik7XG5cblx0cmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGFkZEFjdGlvbk9uY2UobmFtZSwgZm4pIHtcblx0aWYgKHR5cGVvZiBuYW1lID09PSBcIm9iamVjdFwiICYmIGZuID09IG51bGwpIHtcblx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24oZm4sIG4pIHsgdGhpcy5hZGRBY3Rpb25PbmNlKG4sIGZuKTsgfSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHR2YXIgb25BY3Rpb247XG5cblx0dGhpcy5hZGRBY3Rpb24obmFtZSwgb25BY3Rpb24gPSBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy5yZW1vdmVBY3Rpb24obmFtZSwgb25BY3Rpb24pO1xuXHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdH0pO1xuXG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiByZW1vdmVBY3Rpb24obmFtZSwgZm4pIHtcblx0aWYgKHR5cGVvZiBuYW1lID09PSBcImZ1bmN0aW9uXCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdGZuID0gbmFtZTtcblx0XHRuYW1lID0gbnVsbDtcblx0fVxuXG5cdGlmICh0aGlzLl9hY3Rpb25zID09IG51bGwgfHwgKG5hbWUgPT0gbnVsbCAmJiBmbiA9PSBudWxsKSkge1xuXHRcdHRoaXMuX2FjdGlvbnMgPSB7fTtcblx0fVxuXG5cdGVsc2UgaWYgKGZuID09IG51bGwpIHtcblx0XHRkZWxldGUgdGhpcy5fYWN0aW9uc1tuYW1lXTtcblx0fVxuXG5cdGVsc2UgaWYgKG5hbWUgPT0gbnVsbCkge1xuXHRcdF8uZWFjaCh0aGlzLl9hY3Rpb25zLCBmdW5jdGlvbihkLCBuKSB7XG5cdFx0XHR0aGlzLl9hY3Rpb25zW25dID0gZC5maWx0ZXIoZnVuY3Rpb24oZikgeyByZXR1cm4gZiAhPT0gZm47IH0pO1xuXHRcdH0sIHRoaXMpO1xuXHR9XG5cblx0ZWxzZSBpZiAodGhpcy5fYWN0aW9uc1tuYW1lXSAhPSBudWxsKSB7XG5cdFx0dGhpcy5fYWN0aW9uc1tuYW1lXSA9IF8ud2l0aG91dCh0aGlzLl9hY3Rpb25zW25hbWVdLCBmbik7XG5cdH1cblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gZmlyZUFjdGlvbihhY3Rpb24pIHtcblx0aWYgKHR5cGVvZiBhY3Rpb24gPT09IFwic3RyaW5nXCIpIGFjdGlvbiA9IG5ldyBBY3Rpb24oYWN0aW9uKTtcblx0aWYgKF8uaXNPYmplY3QoYWN0aW9uKSAmJiAhKGFjdGlvbiBpbnN0YW5jZW9mIEFjdGlvbikpIGFjdGlvbiA9IF8uZXh0ZW5kKG5ldyBBY3Rpb24oKSwgYWN0aW9uKTtcblx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGFjdGlvbiBuYW1lLCBvYmplY3Qgb3IgaW5zdGFuY2Ugb2YgQWN0aW9uLlwiKTtcblxuXHR2YXIgbmFtZSA9IGFjdGlvbi5uYW1lLFxuXHRcdGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cblx0YXJncy51bnNoaWZ0KGFjdGlvbik7XG5cblx0aWYgKHRoaXMuX2FjdGlvbnMgIT0gbnVsbCAmJiBBcnJheS5pc0FycmF5KHRoaXMuX2FjdGlvbnNbbmFtZV0pKSB7XG5cdFx0dGhpcy5fYWN0aW9uc1tuYW1lXS5zb21lKGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRpZiAoIWFjdGlvbi5idWJibGVzKSByZXR1cm4gdHJ1ZTtcblx0XHRcdGZuLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXHRcdH0sIHRoaXMpO1xuXHR9XG5cblx0aWYgKGFjdGlvbi5idWJibGVzICYmIHRoaXMucGFyZW50UmFuZ2UgIT0gbnVsbCkge1xuXHRcdC8vIGZpbmQgdGhlIGZpcnN0IHBhcmVudCB3aXRoIHRoZSBmaXJlIG1ldGhvZFxuXHRcdHZhciBmaXJlT24gPSB0aGlzLnBhcmVudFJhbmdlO1xuXHRcdHdoaWxlICh0eXBlb2YgZmlyZU9uLmZpcmVBY3Rpb24gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0Ly8gaWYgaXQgaGFzIG5vIHBhcmVudCwgd2UgY2FuJ3QgZG8gYW55dGhpbmdcblx0XHRcdGlmIChmaXJlT24ucGFyZW50UmFuZ2UgPT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0ZmlyZU9uID0gZmlyZU9uLnBhcmVudFJhbmdlO1xuXHRcdH1cblxuXHRcdGZpcmVPbi5maXJlQWN0aW9uLmFwcGx5KGZpcmVPbiwgYXJncyk7XG5cdH1cblxuXHRyZXR1cm4gdGhpcztcbn1cbiIsInZhciBNdXN0YWNoZSA9IHJlcXVpcmUoXCIuLi9cIik7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMuYWRvcHQgPSBhZG9wdDtcblx0dGhpcy5kaXNvd24gPSBkaXNvd247XG59O1xuXG5mdW5jdGlvbiBhZG9wdCh2aWV3LCBwYXJlbnQsIGJlZm9yZSkge1xuXHRpZiAoISh2aWV3IGluc3RhbmNlb2YgTXVzdGFjaGUuVmlldykpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgaW5zdGFuY2VvZiBUZW1wbGUgVmlldy5cIik7XG5cdH1cblxuXHRpZiAodGhpcy5fYWRvcHRlZCA9PSBudWxsKSB0aGlzLl9hZG9wdGVkID0gW107XG5cblx0Ly8gaGF2ZSBvcmlnaW5hbCBwYXJlbnQgZGlzb3duIGNoaWxkIGFuZCBzZXQgdGhlIGFkb3B0ZWQgcGFyZW50IHJlZmVyZW5jZVxuXHRpZiAodmlldy5hZG9wdGVkUGFyZW50KSB2aWV3LmFkb3B0ZWRQYXJlbnQuZGlzb3duKHZpZXcuYWRvcHRlZFBhcmVudCk7XG5cdHZpZXcuYWRvcHRlZFBhcmVudCA9IHRoaXM7XG5cblx0Ly8gbWFrZSBzdXJlIGl0IGlzIGFuIGluZGVwZW5kZW50XG5cdHZpZXcuZGV0YWNoKCk7XG5cblx0Ly8gaG9vayBuYXZiYXIgZGF0YSB1cCB0byB0aGlzIGRhdGFcblx0dmlldy5nZXRSb290TW9kZWwoKS5wYXJlbnQgPSB0aGlzLm1vZGVsO1xuXG5cdC8vIHJlbmRlciB3aGVuIG5vdCBpbiBsb2FkaW5nIG1vZGVcblx0dmFyIG9uUmVuZGVyO1xuXHR0aGlzLm9uKFwicmVuZGVyXCIsIG9uUmVuZGVyID0gZnVuY3Rpb24oY29tcCkge1xuXHRcdGlmIChjb21wLmZpcnN0UnVuKSB2aWV3LnBhaW50KHBhcmVudCwgYmVmb3JlKTtcblx0XHRjb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHZpZXcuZGV0YWNoKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRoaXMuX2Fkb3B0ZWQucHVzaCh7XG5cdFx0cmVuZGVyOiBvblJlbmRlcixcblx0XHR2aWV3OiB2aWV3XG5cdH0pO1xuXG5cdHJldHVybiB2aWV3O1xufVxuXG5mdW5jdGlvbiBkaXNvd24odmlldykge1xuXHRpZiAodGhpcy5fYWRvcHRlZCA9PSBudWxsKSByZXR1cm47XG5cblx0dmFyIGluZGV4O1xuXHRpZiAoIXRoaXMuX2Fkb3B0ZWQuc29tZShmdW5jdGlvbihhLCBpKSB7XG5cdFx0aWYgKGEudmlldyA9PT0gdmlldykge1xuXHRcdFx0aW5kZXggPSBpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9KSkgcmV0dXJuO1xuXG5cdGlmICh2aWV3LmFkb3B0ZWRQYXJlbnQgPT09IHRoaXMpIGRlbGV0ZSB2aWV3LmFkb3B0ZWRQYXJlbnQ7XG5cdHRoaXMub2ZmKFwicmVuZGVyXCIsIHRoaXMuX2Fkb3B0ZWRbaW5kZXhdLnJlbmRlcik7XG5cdHRoaXMuX2Fkb3B0ZWQuc3BsaWNlKGluZGV4LCAxKTtcblxuXHRyZXR1cm4gdmlldztcbn1cbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbnZhciBwbHVnaW5zID1cbmV4cG9ydHMuX3BsdWdpbnMgPSB7fTtcblxuZXhwb3J0cy5sb2FkUGx1Z2luID0gZnVuY3Rpb24odHBsLCBwbHVnaW4sIGFyZ3MpIHtcblx0aWYgKF8uaXNTdHJpbmcocGx1Z2luKSkge1xuXHRcdGlmIChwbHVnaW5zW3BsdWdpbl0gPT0gbnVsbClcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIk5vIHBsdWdpbiBleGlzdHMgd2l0aCBpZCAnXCIgKyBwbHVnaW4gKyBcIicuXCIpO1xuXG5cdFx0cGx1Z2luID0gcGx1Z2luc1twbHVnaW5dO1xuXHR9XG5cblx0aWYgKCFfLmlzRnVuY3Rpb24ocGx1Z2luKSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG9yIGZ1bmN0aW9uIGZvciBwbHVnaW5cIik7XG5cblx0Ly8gY2hlY2sgaWYgcGx1Z2luIGlzIGFscmVhZHkgbG9hZGVkIG9uIHRoaXMgdGVtcGxhdGVcblx0aWYgKHRwbC5fbG9hZGVkX3BsdWdpbnMgPT0gbnVsbCkgdHBsLl9sb2FkZWRfcGx1Z2lucyA9IFtdO1xuXHRpZiAofnRwbC5fbG9hZGVkX3BsdWdpbnMuaW5kZXhPZihwbHVnaW4pKSByZXR1cm4gdHBsO1xuXHR0cGwuX2xvYWRlZF9wbHVnaW5zLnB1c2gocGx1Z2luKTtcblxuXHRpZiAoYXJncyA9PSBudWxsKSBhcmdzID0gW107XG5cdGlmICghXy5pc0FycmF5KGFyZ3MpKSBhcmdzID0gWyBhcmdzIF07XG5cblx0cGx1Z2luLmFwcGx5KHRwbCwgYXJncyk7XG5cdHJldHVybiB0cGw7XG59O1xuXG52YXIgcmVnaXN0ZXJQbHVnaW4gPVxuZXhwb3J0cy5yZWdpc3RlclBsdWdpbiA9IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIikge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgbmFtZSBmb3IgcGx1Z2luLlwiKTtcblx0fVxuXG5cdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgcGx1Z2luLlwiKTtcblx0fVxuXG5cdGlmIChmbiA9PT0gcGx1Z2luc1tuYW1lXSkgcmV0dXJuO1xuXHRpZiAocGx1Z2luc1tuYW1lXSAhPSBudWxsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiUmVmdXNpbmcgdG8gb3ZlcndyaXRlIGV4aXN0aW5nIHBsdWdpbiBcXFwibmFtZVxcXCIuXCIpO1xuXHR9XG5cblx0cGx1Z2luc1tuYW1lXSA9IGZuO1xufTtcblxuLy8gbG9hZCBidWlsdCBpbiBwbHVnaW5zXG5yZWdpc3RlclBsdWdpbihcImFjdGlvbnNcIiwgcmVxdWlyZShcIi4vYWN0aW9uc1wiKSk7XG5yZWdpc3RlclBsdWdpbihcInR3b3dheVwiLCByZXF1aXJlKFwiLi90d293YXlcIikpO1xucmVnaXN0ZXJQbHVnaW4oXCJhZG9wdGlvblwiLCByZXF1aXJlKFwiLi9hZG9wdGlvblwiKSk7XG5yZWdpc3RlclBsdWdpbihcInJlZnNcIiwgcmVxdWlyZShcIi4vcmVmc1wiKSk7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLnJlZnMgPSB7fTtcblx0dGhpcy5kZWNvcmF0ZShcInJlZlwiLCByZWYpO1xuXHR0aGlzLmZpbmRCeVJlZiA9IGZpbmRCeVJlZjtcbn07XG5cbmZ1bmN0aW9uIHJlZihkLCBrZXkpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdC8vIGRvbid0IG92ZXJ3cml0ZVxuXHRpZiAodGhpcy5yZWZzW2tleV0gIT0gbnVsbCkge1xuXHRcdGNvbnNvbGUud2FybihcIk11bHRpcGxlIGVsZW1lbnRzIHdpdGggcmVmZXJlbmNlICclcycuXCIsIGtleSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gc2V0IHRoZSByZWZlcmVuY2Vcblx0dGhpcy5yZWZzW2tleV0gPSBkLnRhcmdldDtcblxuXHQvLyByZW1vdmUgdGhlIHJlZmVyZW5jZSB3aGVuIHRoZSBlbGVtZW50IGRpc2FwcGVhcnNcblx0ZC5jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRkZWxldGUgc2VsZi5yZWZzW2tleV07XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBmaW5kQnlSZWYoa2V5KSB7XG5cdHZhciB0cGxzID0gWyB0aGlzIF0sXG5cdFx0dHBsO1xuXG5cdHdoaWxlICh0cGxzLmxlbmd0aCkge1xuXHRcdHRwbCA9IHRwbHMuc2hpZnQoKTtcblx0XHRpZiAodHBsLnJlZnMgJiYgdHBsLnJlZnNba2V5XSkgcmV0dXJuIHRwbC5yZWZzW2tleV07XG5cdFx0dHBscyA9IHRwbHMuY29uY2F0KHRwbC5nZXRDb21wb25lbnRzKCkpO1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG52YXIgaW5wdXRfdHlwZXMgPSBbIFwidGV4dFwiLCBcIm51bWJlclwiLCBcImRhdGVcIiBdO1xudmFyIHZhbHVlX3R5cGVzID0gWyBcInJhZGlvXCIsIFwib3B0aW9uXCIgXTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdC8vIGFkZCBtZXRob2RzXG5cdHRoaXMuYWRkRm9ybUJpbmRpbmcgPSBhZGRGb3JtQmluZGluZztcblx0dGhpcy5nZXRGb3JtQmluZGluZyA9IGdldEZvcm1CaW5kaW5nO1xuXHR0aGlzLnJlbW92ZUZvcm1CaW5kaW5nID0gcmVtb3ZlRm9ybUJpbmRpbmc7XG5cblx0Ly8gYWRkIG1haW4gYmluZGluZyBkZWNvcmF0b3Jcblx0dGhpcy5kZWNvcmF0ZShcImJpbmQtdG9cIiwgZnVuY3Rpb24gYmluZFRvKGQsIGlkLCBsYXp5KSB7XG5cdFx0dmFyIGZiaW5kID0gdGhpcy5nZXRGb3JtQmluZGluZyhpZCk7XG5cdFx0aWYgKGZiaW5kID09IG51bGwpIHJldHVybjtcblxuXHRcdHZhciBlbCA9IGQudGFyZ2V0LFxuXHRcdFx0dHlwZSA9IGdldFR5cGUoZWwpLFxuXHRcdFx0c2VsZiA9IHRoaXMsXG5cdFx0XHRldnROYW1lLCBvbkNoYW5nZTtcblxuXHRcdC8vIGRldGVjdCBjaGFuZ2VzIHRvIHRoZSBpbnB1dCdzIHZhbHVlXG5cdFx0aWYgKHR5cGVvZiBmYmluZC5jaGFuZ2UgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0b25DaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdGZiaW5kLmNoYW5nZS5jYWxsKHNlbGYsIGdldE5vZGVWYWx1ZShlbCwgdHlwZSksIGQubW9kZWwsIGUpO1xuXHRcdFx0fTtcblxuXHRcdFx0ZXZ0TmFtZSA9IF8uY29udGFpbnMoaW5wdXRfdHlwZXMsIHR5cGUpID8gXCJpbnB1dFwiIDogXCJjaGFuZ2VcIjtcblx0XHRcdGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZ0TmFtZSwgb25DaGFuZ2UpO1xuXHRcdFx0aWYgKCEob3B0aW9ucy5sYXp5IHx8IGxhenkpKSBlbC5hZGRFdmVudExpc3RlbmVyKFwia2V5dXBcIiwgb25DaGFuZ2UpO1xuXG5cdFx0XHRkLmNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2dE5hbWUsIG9uQ2hhbmdlKTtcblx0XHRcdFx0ZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIG9uQ2hhbmdlKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIHJlYWN0aXZlbHkgc2V0IHRoZSB2YWx1ZSBvbiB0aGUgaW5wdXRcblx0XHR2YXIgYyA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdHNldE5vZGVWYWx1ZShlbCwgZmJpbmQuZ2V0LmNhbGwoc2VsZiwgZC5tb2RlbCksIHR5cGUpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gc2V0Tm9kZVZhbHVlIHJlbGllcyBvbiB0aGUgY2hpbGRyZW4gZWxlbWVudHNcblx0XHQvLyB0aG9zZSB3b24ndCBiZSBpbiB0aGUgRE9NIHRpbGwgYXQgbGVhc3QgdGhlIG5leHQgdGlja1xuXHRcdGMuaW52YWxpZGF0ZSgpO1xuXHR9KTtcblxuXHQvLyBhZGQgdmFsdWUgZGVjb3JhdG9yIGZvciByYWRpb3MgYW5kIG9wdGlvbnNcblx0dGhpcy5kZWNvcmF0ZShcInZhbHVlXCIsIGZ1bmN0aW9uIHZhbHVlT2YoZCwgc3RydmFsKSB7XG5cdFx0dmFyIGVsID0gZC50YXJnZXQsXG5cdFx0XHR0eXBlID0gZ2V0VHlwZShlbCk7XG5cblx0XHRpZiAoIV8uY29udGFpbnModmFsdWVfdHlwZXMsIHR5cGUpKSB7XG5cdFx0XHRlbC52YWx1ZSA9IHN0cnZhbDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2YXIgYXJncyA9IHRoaXMucmVuZGVyQXJndW1lbnRzKGQudGVtcGxhdGUuYXJndW1lbnRzLCBkLm1vZGVsKTtcblx0XHRlbC4kYm91bmRfdmFsdWUgPSBhcmdzLmxlbmd0aCA8PSAxID8gYXJnc1swXSA6IGFyZ3M7XG5cdFx0ZWwudmFsdWUgPSBzdHJ2YWw7XG5cdH0sIHsgcGFyc2U6IFwic3RyaW5nXCIgfSk7XG5cblx0Ly8gYWRkIGluaXRpYWwgZm9ybSBiaW5kaW5nc1xuXHR2YXIgaW5pdGlhbEJpbmRzID0gXy5yZXN1bHQodGhpcywgXCJ0d293YXlcIik7XG5cdGlmIChfLmlzT2JqZWN0KGluaXRpYWxCaW5kcykpIHRoaXMuYWRkRm9ybUJpbmRpbmcoaW5pdGlhbEJpbmRzKTtcbn07XG5cbmZ1bmN0aW9uIGFkZEZvcm1CaW5kaW5nKGlkLCBnZXR0ZXIsIG9uQ2hhbmdlKSB7XG5cdGlmIChfLmlzT2JqZWN0KGlkKSkge1xuXHRcdF8uZWFjaChpZCwgZnVuY3Rpb24odiwgaykge1xuXHRcdFx0YWRkRm9ybUJpbmRpbmcuY2FsbCh0aGlzLCBrLCB2KTtcblx0XHR9LCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGlmICh0eXBlb2YgaWQgIT09IFwic3RyaW5nXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIHN0cmluZyBmb3IgdGhlIGZvcm0gYmluZGluZyBJRC5cIik7XG5cdGlmICh0aGlzLl9mb3JtQmluZGluZ3MgPT0gbnVsbCkgdGhpcy5fZm9ybUJpbmRpbmdzID0ge307XG5cdGlmICh0aGlzLl9mb3JtQmluZGluZ3NbaWRdICE9IG51bGwpIHRocm93IG5ldyBFcnJvcihcIkEgZm9ybSBiaW5kaW5nIHdpdGggaWQgJ1wiICsgaWQgKyBcIicgYWxyZWFkeSBleGlzdHMuXCIpO1xuXG5cdGlmIChfLmlzT2JqZWN0KGdldHRlcikgJiYgb25DaGFuZ2UgPT0gbnVsbCkge1xuXHRcdG9uQ2hhbmdlID0gZ2V0dGVyLmNoYW5nZTtcblx0XHRnZXR0ZXIgPSBnZXR0ZXIuZ2V0O1xuXHR9XG5cblx0aWYgKHR5cGVvZiBnZXR0ZXIgIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGEgZnVuY3Rpb24gb3Igb2JqZWN0IGZvciB0aGUgZm9ybSBiaW5kaW5nIGdldHRlci5cIik7XG5cdGlmICh0eXBlb2Ygb25DaGFuZ2UgIT09IFwiZnVuY3Rpb25cIikgb25DaGFuZ2UgPSBudWxsO1xuXG5cdHRoaXMuX2Zvcm1CaW5kaW5nc1tpZF0gPSB7XG5cdFx0Z2V0OiBnZXR0ZXIsXG5cdFx0Y2hhbmdlOiBvbkNoYW5nZVxuXHR9O1xuXG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiBnZXRGb3JtQmluZGluZyhpZCkge1xuXHRpZiAodHlwZW9mIGlkICE9PSBcInN0cmluZ1wiKSByZXR1cm47XG5cdHZhciBjID0gdGhpcywgYmluZGluZ3M7XG5cblx0d2hpbGUgKGMgIT0gbnVsbCkge1xuXHRcdGJpbmRpbmdzID0gYy5fZm9ybUJpbmRpbmdzO1xuXHRcdGlmIChiaW5kaW5ncyAhPSBudWxsICYmIGJpbmRpbmdzW2lkXSAhPSBudWxsKSByZXR1cm4gYmluZGluZ3NbaWRdO1xuXHRcdGMgPSBjLnBhcmVudFJhbmdlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUZvcm1CaW5kaW5nKGlkKSB7XG5cdHZhciBleGlzdHMgPSB0aGlzLl9mb3JtQmluZGluZ3NbaWRdICE9IG51bGw7XG5cdGRlbGV0ZSB0aGlzLl9mb3JtQmluZGluZ3NbaWRdO1xuXHRyZXR1cm4gZXhpc3RzO1xufVxuXG52YXIgdHlwZV9tYXAgPSB7XG5cdFwidGV4dFwiOiBbIFwidGV4dFwiLCBcImNvbG9yXCIsIFwiZW1haWxcIiwgXCJwYXNzd29yZFwiLCBcInNlYXJjaFwiLCBcInRlbFwiLCBcInVybFwiLCBcImhpZGRlblwiIF0sXG5cdFwibnVtYmVyXCI6IFsgXCJudW1iZXJcIiwgXCJyYW5nZVwiIF0sXG5cdFwiZGF0ZVwiOiBbIFwiZGF0ZVwiLCBcImRhdGV0aW1lXCIsIFwiZGF0ZXRpbWUtbG9jYWxcIiwgXCJtb250aFwiLCBcInRpbWVcIiwgXCJ3ZWVrXCIgXSxcblx0XCJmaWxlXCI6IFsgXCJmaWxlXCIgXSxcblx0XCJjaGVja2JveFwiOiBbIFwiY2hlY2tib3hcIiBdLFxuXHRcInJhZGlvXCI6IFsgXCJyYWRpb1wiIF1cbn07XG5cbmZ1bmN0aW9uIGdldFR5cGUoZWwpIHtcblx0c3dpdGNoIChlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRjYXNlIFwiaW5wdXRcIjpcblx0XHRcdGZvciAodmFyIHR5cGUgaW4gdHlwZV9tYXApIHtcblx0XHRcdFx0aWYgKF8uY29udGFpbnModHlwZV9tYXBbdHlwZV0sIGVsLnR5cGUpKSByZXR1cm4gdHlwZTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInNlbGVjdFwiOlxuXHRcdFx0cmV0dXJuIFwic2VsZWN0XCI7XG5cblx0XHRjYXNlIFwib3B0aW9uXCI6XG5cdFx0XHRyZXR1cm4gXCJvcHRpb25cIjtcblxuXHRcdGNhc2UgXCJ0ZXh0YXJlYVwiOlxuXHRcdFx0cmV0dXJuIFwidGV4dFwiO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE5vZGVWYWx1ZShub2RlLCB0eXBlKSB7XG5cdGlmICh0eXBlID09IG51bGwpIHR5cGUgPSBnZXRUeXBlKG5vZGUpO1xuXHR2YXIgdmFsO1xuXG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdHZhbCA9IG5vZGUudmFsdWVBc051bWJlcjtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCJ0ZXh0XCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiY2hlY2tib3hcIjpcblx0XHRcdHZhbCA9IG5vZGUuY2hlY2tlZDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImRhdGVcIjpcblx0XHRcdHZhbCA9IG5vZGUudmFsdWVBc0RhdGU7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJzZWxlY3RcIjpcblx0XHRcdHZhciBvcHQgPSBub2RlLnF1ZXJ5U2VsZWN0b3IoXCJvcHRpb246Y2hlY2tlZFwiKTtcblx0XHRcdGlmIChvcHQgIT0gbnVsbCkgdmFsID0gb3B0LiRib3VuZF92YWx1ZTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImZpbGVcIjpcblx0XHRcdHZhbCA9ICFub2RlLm11bHRpcGxlID8gbm9kZS5maWxlc1swXSA6IF8udG9BcnJheShub2RlLmZpbGVzKTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInJhZGlvXCI6XG5cdFx0XHR2YWwgPSBub2RlLiRib3VuZF92YWx1ZTtcblx0XHRcdGJyZWFrO1xuXHR9XG5cblx0cmV0dXJuIHZhbDtcbn1cblxuZnVuY3Rpb24gc2V0Tm9kZVZhbHVlKGVsLCB2YWwsIHR5cGUpIHtcblx0aWYgKHR5cGUgPT0gbnVsbCkgdHlwZSA9IGdldFR5cGUoZWwpO1xuXG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBlbCkgcmV0dXJuO1xuXHRcdFx0aWYgKF8uaXNOdW1iZXIodmFsKSkgZWwudmFsdWVBc051bWJlciA9IHZhbDtcblx0XHRcdGVsc2UgZWwudmFsdWUgPSB2YWw7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJ0ZXh0XCI6XG5cdFx0XHRpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZWwpIHJldHVybjtcblx0XHRcdGVsLnZhbHVlID0gdmFsID09IG51bGwgPyBcIlwiIDogdmFsLnRvU3RyaW5nKCk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJjaGVja2JveFwiOlxuXHRcdFx0ZWwuY2hlY2tlZCA9ICEhdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiZGF0ZVwiOlxuXHRcdFx0aWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVsKSByZXR1cm47XG5cdFx0XHRpZiAoXy5pc0RhdGUodmFsKSkgZWwudmFsdWVBc0RhdGUgPSB2YWw7XG5cdFx0XHRlbHNlIGVsLnZhbHVlID0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwic2VsZWN0XCI6XG5cdFx0XHRfLnRvQXJyYXkoZWwucXVlcnlTZWxlY3RvckFsbChcIm9wdGlvblwiKSkuZm9yRWFjaChmdW5jdGlvbihvcHQpIHtcblx0XHRcdFx0b3B0LnNlbGVjdGVkID0gb3B0LiRib3VuZF92YWx1ZSA9PT0gdmFsO1xuXHRcdFx0fSk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJyYWRpb1wiOlxuXHRcdFx0ZWwuY2hlY2tlZCA9IGVsLiRib3VuZF92YWx1ZSA9PT0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cdH1cbn1cbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG52YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciBNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpO1xudmFyIFZpZXcgPSByZXF1aXJlKFwiLi92aWV3XCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFZpZXcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMucm93cyA9IHt9O1xuXHRcdHRoaXMuX3Jvd19kZXBzID0ge307XG5cdFx0Vmlldy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9LFxuXG5cdGludmVydDogZnVuY3Rpb24odmFsKSB7XG5cdFx0aWYgKCFfLmlzQm9vbGVhbih2YWwpKSB2YWwgPSAhdGhpcy5faW52ZXJ0ZWQ7XG5cdFx0dGhpcy5faW52ZXJ0ZWQgPSB2YWw7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aXNJbnZlcnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5faW52ZXJ0ZWQ7XG5cdH0sXG5cblx0c2V0UGF0aDogZnVuY3Rpb24ocGF0aCkge1xuXHRcdHRoaXMuX3BhdGggPSBwYXRoO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdG9uUm93OiBmdW5jdGlvbihmbikge1xuXHRcdGlmICghXy5pc0Z1bmN0aW9uKGZuKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3Igcm93IGhhbmRsZXIuXCIpO1xuXG5cdFx0dGhpcy5fb25Sb3cgPSBmbjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhZGRSb3c6IGZ1bmN0aW9uKGtleSwgZGF0YSkge1xuXHRcdC8vIHJlbW92ZSBleGlzdGluZ1xuXHRcdHRoaXMucmVtb3ZlUm93KGtleSk7XG5cblx0XHQvLyBjb252ZXJ0IGRhdGEgdG8gbW9kZWxcblx0XHRpZiAoIU1vZGVsLmlzTW9kZWwoZGF0YSkpIHtcblx0XHRcdGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgdGhpcy5tb2RlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gY3JlYXRlIGEgbmV3IHJvd1xuXHRcdHZhciByb3cgPSBuZXcgVmlldyhkYXRhKTtcblxuXHRcdC8vIHNldCB1cCByZW5kZXIgYW5kIG1vdW50IGl0XG5cdFx0cm93LnJlbmRlciA9IHRoaXMuX29uUm93O1xuXHRcdHRoaXMucm93c1trZXldID0gcm93O1xuXHRcdHRoaXMuYWRkTWVtYmVyKHJvdyk7XG5cdFx0cm93Lm1vdW50KCk7XG5cblx0XHRyZXR1cm4gcm93O1xuXHR9LFxuXG5cdGhhc1JvdzogZnVuY3Rpb24oa2V5KSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Um93KGtleSkgIT0gbnVsbDtcblx0fSxcblxuXHRnZXRSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdHJldHVybiB0aGlzLnJvd3Nba2V5XTtcblx0fSxcblxuXHRyZW1vdmVSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdGlmICh0aGlzLnJvd3Nba2V5XSA9PSBudWxsKSByZXR1cm4gdGhpcztcblxuXHRcdHZhciByb3cgPSB0aGlzLnJvd3Nba2V5XTtcblx0XHR0aGlzLnJlbW92ZU1lbWJlcihyb3cpO1xuXHRcdGRlbGV0ZSB0aGlzLnJvd3Nba2V5XTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZUFsbFJvd3M6IGZ1bmN0aW9uKCkge1xuXHRcdE9iamVjdC5rZXlzKHRoaXMucm93cykuZm9yRWFjaCh0aGlzLnJlbW92ZVJvdywgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5fcGF0aCA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJNaXNzaW5nIHBhdGguXCIpO1xuXG5cdFx0dmFyIHZhbCwgaXNFbXB0eSwgaW52ZXJ0ZWQsIGlzTGlzdCxcblx0XHRcdG1vZGVsLCBwcm94eSwga2V5cztcblxuXHRcdHZhbCA9IHRoaXMuZ2V0KHRoaXMuX3BhdGgpO1xuXHRcdG1vZGVsID0gbmV3IE1vZGVsKHZhbCwgdGhpcy5tb2RlbCk7XG5cdFx0cHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUodmFsKTtcblx0XHRpbnZlcnRlZCA9IHRoaXMuaXNJbnZlcnRlZCgpO1xuXHRcdGlzTGlzdCA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImlzTGlzdFwiKTtcblxuXHRcdGZ1bmN0aW9uIGdldEVtcHRpbmVzcygpIHtcblx0XHRcdHJldHVybiBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJpc0VtcHR5XCIpO1xuXHRcdH1cblxuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdGlzRW1wdHkgPSAhdmFsIHx8IChpc0xpc3QgJiYgIWdldEVtcHRpbmVzcygpKTtcblx0XHR9KTtcblxuXHRcdGlmIChpc0VtcHR5ICYmIGludmVydGVkKSB7XG5cdFx0XHRpZiAoaXNMaXN0KSBnZXRFbXB0aW5lc3MoKTtcblx0XHRcdHRoaXMuYWRkUm93KDAsIG1vZGVsKTtcblx0XHR9IGVsc2UgaWYgKCFpc0VtcHR5ICYmICFpbnZlcnRlZCkge1xuXHRcdFx0aWYgKGlzTGlzdCkge1xuXHRcdFx0XHRrZXlzID0gW107XG5cblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdFx0XHR2YXIgbmtleXMgPSBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJrZXlzXCIpO1xuXG5cdFx0XHRcdFx0Ly8gdHJpY2sgVHJhY2tyIHNvIGF1dG9ydW5zIGFyZW4ndCBjb250cm9sbGVkIGJ5IHRoaXMgb25lXG5cdFx0XHRcdFx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IGNvbXAuX3BhcmVudDtcblxuXHRcdFx0XHRcdC8vIHJlbW92ZSByZW1vdmVkIHJvd3Ncblx0XHRcdFx0XHRfLmRpZmZlcmVuY2Uoa2V5cywgbmtleXMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fcm93X2RlcHNba2V5XSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9yb3dfZGVwc1trZXldLnN0b3AoKTtcblx0XHRcdFx0XHRcdFx0ZGVsZXRlIHRoaXMuX3Jvd19kZXBzW2tleV07XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRoaXMucmVtb3ZlUm93KGtleSk7XG5cdFx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0XHQvLyBhZGQgYWRkZWQgcm93c1xuXHRcdFx0XHRcdF8uZGlmZmVyZW5jZShua2V5cywga2V5cykuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcblx0XHRcdFx0XHRcdHZhciByb3csIHJtb2RlbDtcblxuXHRcdFx0XHRcdFx0cm93ID0gdGhpcy5nZXRSb3coa2V5KTtcblx0XHRcdFx0XHRcdHJtb2RlbCA9IHJvdyAhPSBudWxsID8gcm93Lm1vZGVsIDpcblx0XHRcdFx0XHRcdFx0bmV3IE1vZGVsKG51bGwsIG5ldyBNb2RlbCh7ICRrZXk6IGtleSB9LCB0aGlzLm1vZGVsKSk7XG5cblx0XHRcdFx0XHRcdHRoaXMuX3Jvd19kZXBzW2tleV0gPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdHJtb2RlbC5zZXQobW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiZ2V0XCIsIGtleSkpO1xuXHRcdFx0XHRcdFx0XHQvLyBpZiAocm93U29ydCAhPSBudWxsKSByb3dTb3J0LmludmFsaWRhdGUoKTtcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHQvLyBhZGQgdGhlIHJvdyBhZnRlciB3ZSBzZXQgdGhlIGRhdGFcblx0XHRcdFx0XHRcdGlmIChyb3cgPT0gbnVsbCkgdGhpcy5hZGRSb3coa2V5LCBybW9kZWwpO1xuXHRcdFx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRcdFx0Ly8gcHJldGVuZCBsaWtlIG5vdGhpbmcgaGFwcGVuZWRcblx0XHRcdFx0XHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gY29tcDtcblxuXHRcdFx0XHRcdC8vIHRoZSBuZXcgc2V0IG9mIGtleXNcblx0XHRcdFx0XHRrZXlzID0gbmtleXM7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIGEgcmVhY3RpdmUgY29udGV4dCB0aGF0IGNvbnRpbnVvdXNseSBzb3J0cyByb3dzXG5cdFx0XHRcdC8vIHJvd1NvcnQgPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0Ly8gY29uc29sZS5sb2coa2V5cyk7XG5cdFx0XHRcdFx0Ly8gdmFyIGJlZm9yZSA9IG51bGwsIGksIHJvdztcblxuXHRcdFx0XHRcdC8vIGZvciAoaSA9IGtleXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHQvLyBcdHJvdyA9IHRoaXMuZ2V0Um93KGtleXNbaV0pO1xuXHRcdFx0XHRcdC8vIFx0aWYgKHJvdyA9PSBudWxsKSBjb250aW51ZTtcblx0XHRcdFx0XHQvLyBcdHRoaXMuaW5zZXJ0QmVmb3JlKHJvdywgYmVmb3JlKTtcblx0XHRcdFx0XHQvLyBcdGJlZm9yZSA9IHJvdztcblx0XHRcdFx0XHQvLyB9XG5cdFx0XHRcdC8vIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hZGRSb3coMCwgbW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNMaXN0KSB7XG5cdFx0XHRnZXRFbXB0aW5lc3MoKTtcblx0XHR9XG5cblx0XHQvLyBhdXRvIGNsZWFuXG5cdFx0dGhpcy5vbmNlKFwiaW52YWxpZGF0ZVwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHRoaXMuX3Jvd19kZXBzID0ge307XG5cdFx0XHR0aGlzLnJlbW92ZUFsbFJvd3MoKTtcblx0XHR9KTtcblx0fVxuXG59LCB7XG5cblx0aXNFbXB0eTogZnVuY3Rpb24obW9kZWwsIHByb3h5KSB7XG5cdFx0aWYgKCFtb2RlbC5kYXRhKSByZXR1cm4gdHJ1ZTtcblx0XHRpZiAocHJveHkgPT0gbnVsbCkgcHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUobW9kZWwuZGF0YSk7XG5cdFx0cmV0dXJuIG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgbW9kZWwuZGF0YSwgXCJpc0xpc3RcIikgJiZcblx0XHRcdG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgbW9kZWwuZGF0YSwgXCJpc0VtcHR5XCIpO1xuXHR9XG5cbn0pO1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG5cdFJPT1QgICAgICAgICAgICAgIDogMSxcblxuXHQvLyBYTUwvSFRNTFxuXHRIVE1MICAgICAgICAgICAgICA6IDIsXG5cdFRFWFQgICAgICAgICAgICAgIDogMyxcblx0RUxFTUVOVCAgICAgICAgICAgOiA0LFxuXHRBVFRSSUJVVEUgICAgICAgICA6IDUsXG5cdFhDT01NRU5UICAgICAgICAgIDogNixcblxuXHQvLyBNdXN0YWNoZVxuXHRJTlRFUlBPTEFUT1IgICAgICA6IDcsXG5cdFRSSVBMRSAgICAgICAgICAgIDogOCxcblx0U0VDVElPTiAgICAgICAgICAgOiA5LFxuXHRJTlZFUlRFRCAgICAgICAgICA6IDEwLFxuXHRQQVJUSUFMICAgICAgICAgICA6IDExLFxuXHRNQ09NTUVOVCAgICAgICAgICA6IDEyLFxuXG5cdC8vIE1JU0Ncblx0TElURVJBTCAgICAgICAgICAgOiAxM1xufTtcbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbi8vIGxpa2UgdW5kZXJzY29yZSdzIHJlc3VsdCwgYnV0IHBhc3MgYXJndW1lbnRzIHRocm91Z2hcbmV4cG9ydHMucmVzdWx0ID0gZnVuY3Rpb24ob2JqZWN0LCBwcm9wZXJ0eSkge1xuXHR2YXIgdmFsdWUgPSBvYmplY3QgPT0gbnVsbCA/IHZvaWQgMCA6IG9iamVjdFtwcm9wZXJ0eV07XG5cdHJldHVybiBfLmlzRnVuY3Rpb24odmFsdWUpID8gdmFsdWUuYXBwbHkob2JqZWN0LCBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpKSA6IHZhbHVlO1xufTtcblxuLy8gdGVzdHMgdmFsdWUgYXMgcG9qbyAocGxhaW4gb2xkIGphdmFzY3JpcHQgb2JqZWN0KVxuZXhwb3J0cy5pc1BsYWluT2JqZWN0ID0gcmVxdWlyZShcImlzLXBsYWluLW9iamVjdFwiKTtcblxuLy8gdGVzdHMgZnVuY3Rpb24gYXMgYSBzdWJjbGFzcyBvZiBhIHBhcmVudCBmdW5jdGlvblxuLy8gaGVyZSwgYSBjbGFzcyBpcyB0ZWNobmljYWxseSBhIHN1YmNsYXNzIG9mIGl0c2VsZlxuZXhwb3J0cy5pc1N1YkNsYXNzID0gZnVuY3Rpb24ocGFyZW50LCBmbikge1xuXHRyZXR1cm4gZm4gPT09IHBhcmVudCB8fCAoZm4gIT0gbnVsbCAmJiBmbi5wcm90b3R5cGUgaW5zdGFuY2VvZiBwYXJlbnQpO1xufTtcblxuLy8gbGlrZSBqUXVlcnkncyBlbXB0eSgpLCByZW1vdmVzIGFsbCBjaGlsZHJlblxudmFyIGVtcHR5Tm9kZSA9XG5leHBvcnRzLmVtcHR5Tm9kZSA9IGZ1bmN0aW9uKG5vZGUpIHtcblx0d2hpbGUgKG5vZGUubGFzdENoaWxkKSBub2RlLnJlbW92ZUNoaWxkKG5vZGUubGFzdENoaWxkKTtcblx0cmV0dXJuIG5vZGU7XG59O1xuXG4vLyBpbnNlcnRzIGFuIGFycmF5IG5vZGVzIGludG8gYSBwYXJlbnRcbmV4cG9ydHMuaW5zZXJ0Tm9kZXMgPSBmdW5jdGlvbihub2RlcywgcGFyZW50LCBiZWZvcmUpIHtcblx0dmFyIG5vZGUsIG5leHQsIGk7XG5cblx0Ly8gd2UgZG8gaXQgYmFja3dhcmRzIHNvIG5vZGVzIGRvbid0IGdldCBtb3ZlZCBpZiB0aGV5IGRvbid0IG5lZWQgdG9cblx0Zm9yIChpID0gbm9kZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRub2RlID0gbm9kZXNbaV07XG5cdFx0bmV4dCA9IG5vZGVzW2kgKyAxXSB8fCBiZWZvcmU7XG5cblx0XHRpZiAobm9kZS5uZXh0U2libGluZyAhPT0gYmVmb3JlKSB7XG5cdFx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG5vZGUsIG5leHQpO1xuXHRcdH1cblx0fVxufTtcblxuLy8gY2xlYW5zIGh0bWwsIHRoZW4gY29udmVydHMgaHRtbCBlbnRpdGllcyB0byB1bmljb2RlXG5leHBvcnRzLmRlY29kZUVudGl0aWVzID0gKGZ1bmN0aW9uKCkge1xuXHRpZiAodHlwZW9mIGRvY3VtZW50ID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cblx0Ly8gdGhpcyBwcmV2ZW50cyBhbnkgb3ZlcmhlYWQgZnJvbSBjcmVhdGluZyB0aGUgb2JqZWN0IGVhY2ggdGltZVxuXHR2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHR2YXIgZW50aXR5ID0gLyYoPzojeFthLWYwLTldK3wjWzAtOV0rfFthLXowLTldKyk7Py9pZztcblxuXHRyZXR1cm4gZnVuY3Rpb24gZGVjb2RlSFRNTEVudGl0aWVzKHN0cikge1xuXHRcdHN0ciA9IHN0ci5yZXBsYWNlKGVudGl0eSwgZnVuY3Rpb24obSkge1xuXHRcdFx0ZWxlbWVudC5pbm5lckhUTUwgPSBtO1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ7XG5cdFx0fSk7XG5cblx0XHRlbXB0eU5vZGUoZWxlbWVudCk7XG5cblx0XHRyZXR1cm4gc3RyO1xuXHR9O1xufSkoKTtcblxuLy8gY29udmVydCBodG1sIGludG8gRE9NIG5vZGVzXG5leHBvcnRzLnBhcnNlSFRNTCA9IChmdW5jdGlvbigpIHtcblx0aWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXG5cdC8vIHRoaXMgcHJldmVudHMgYW55IG92ZXJoZWFkIGZyb20gY3JlYXRpbmcgdGhlIG9iamVjdCBlYWNoIHRpbWVcblx0dmFyIGVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRyZXR1cm4gZnVuY3Rpb24gcGFyc2VIVE1MKGh0bWwpIHtcblx0XHRlbGVtZW50LmlubmVySFRNTCA9IGh0bWwgIT0gbnVsbCA/IGh0bWwudG9TdHJpbmcoKSA6IFwiXCI7XG5cdFx0dmFyIG5vZGVzID0gXy50b0FycmF5KGVsZW1lbnQuY2hpbGROb2Rlcyk7XG5cdFx0ZW1wdHlOb2RlKGVsZW1lbnQpO1xuXHRcdHJldHVybiBub2Rlcztcblx0fTtcbn0pKCk7XG5cbnZhciBtYXRjaGVzID0gZXhwb3J0cy5tYXRjaGVzID0gZnVuY3Rpb24obm9kZSwgc2VsZWN0b3IpIHtcblx0aWYgKF8uaXNBcnJheShzZWxlY3RvcikpIHJldHVybiBzZWxlY3Rvci5zb21lKGZ1bmN0aW9uKHMpIHtcblx0XHRyZXR1cm4gbWF0Y2hlcyhub2RlLCBzKTtcblx0fSk7XG5cblx0aWYgKHNlbGVjdG9yIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUpIHtcblx0XHRyZXR1cm4gbm9kZSA9PT0gc2VsZWN0b3I7XG5cdH1cblxuXHRpZiAodHlwZW9mIHNlbGVjdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRyZXR1cm4gISFzZWxlY3Rvcihub2RlKTtcblx0fVxuXG5cdGlmIChub2RlLm5vZGVUeXBlID09PSB3aW5kb3cuTm9kZS5FTEVNRU5UX05PREUpIHtcblx0XHRyZXR1cm4gcmVxdWlyZShcIm1hdGNoZXMtc2VsZWN0b3JcIikobm9kZSwgc2VsZWN0b3IpO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufTtcbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG52YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpO1xudmFyIE1vZGVsID0gcmVxdWlyZShcIi4vbW9kZWxcIik7XG52YXIgUGx1Z2lucyA9IHJlcXVpcmUoXCIuL3BsdWdpbnNcIik7XG52YXIgRE9NUmFuZ2UgPSByZXF1aXJlKFwiLi9kb21yYW5nZVwiKTtcbnZhciBOT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcblxudmFyIFZpZXcgPVxubW9kdWxlLmV4cG9ydHMgPSBET01SYW5nZS5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0Ly8gZmlyc3Qgd2UgY3JlYXRlIHRoZSBpbml0aWFsIHZpZXcgc3RhdGVcblx0XHR2YXIgc3RhdGUgPSBfLnJlc3VsdCh0aGlzLCBcImluaXRpYWxTdGF0ZVwiKSB8fCBfLnJlc3VsdCh0aGlzLCBcImRlZmF1bHRzXCIpO1xuXHRcdGlmICh0eXBlb2Ygc3RhdGUgIT09IFwidW5kZWZpbmVkXCIpIHtcblx0XHRcdGlmICghTW9kZWwuaXNNb2RlbChzdGF0ZSkpIHtcblx0XHRcdFx0c3RhdGUgPSBuZXcgTW9kZWwoc3RhdGUsIG51bGwsIG9wdGlvbnMuc3RhdGUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBzaG92ZSBzdGF0ZSBiZXR3ZWVuIGNvbnRleHRzXG5cdFx0XHRpZiAoTW9kZWwuaXNNb2RlbChkYXRhKSkge1xuXHRcdFx0XHRpZiAoZGF0YS5wYXJlbnQpIGRhdGEucGFyZW50LmFwcGVuZChzdGF0ZSk7XG5cdFx0XHRcdHN0YXRlLmFwcGVuZChkYXRhKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gYWRkIHRvIHRoZSBzdGFjayBiZWZvcmUgdGhlIHJlYWwgZGF0YVxuXHRcdFx0dGhpcy5hZGREYXRhKHN0YXRlKTtcblx0XHRcdHRoaXMuc3RhdGVNb2RlbCA9IHN0YXRlO1xuXG5cdFx0XHQvLyBzZXR1cCBlYXN5LWFjY2VzcyBzdGF0ZSBwcm9wZXJ0eVxuXHRcdFx0c3RhdGUuZGVmaW5lRGF0YUxpbmsodGhpcywgXCJzdGF0ZVwiKTtcblx0XHR9XG5cblx0XHQvLyBhZGQgcGFydGlhbHNcblx0XHR0aGlzLl9wYXJ0aWFscyA9IHt9O1xuXHRcdHRoaXMuX2NvbXBvbmVudHMgPSB7fTtcblx0XHR0aGlzLnNldFBhcnRpYWwoXy5leHRlbmQoe30sIG9wdGlvbnMucGFydGlhbHMsIF8ucmVzdWx0KHRoaXMsIFwicGFydGlhbHNcIikpKTtcblxuXHRcdC8vIHNldCB0aGUgcGFzc2VkIGluIGRhdGFcblx0XHRpZiAodHlwZW9mIGRhdGEgIT09IFwidW5kZWZpbmVkXCIpIHRoaXMuYWRkRGF0YShkYXRhLCBvcHRpb25zKTtcblxuXHRcdC8vIGluaXRpYXRlIGxpa2UgYSBub3JtYWwgZG9tIHJhbmdlXG5cdFx0RE9NUmFuZ2UuY2FsbCh0aGlzKTtcblxuXHRcdC8vIGluaXRpYWxpemUgd2l0aCBvcHRpb25zXG5cdFx0dGhpcy5pbml0aWFsaXplLmNhbGwodGhpcywgb3B0aW9ucyk7XG5cdH0sXG5cblx0aW5pdGlhbGl6ZTogZnVuY3Rpb24oKXt9LFxuXG5cdHVzZTogZnVuY3Rpb24ocCkge1xuXHRcdHJldHVybiBQbHVnaW5zLmxvYWRQbHVnaW4odGhpcywgcCwgXy50b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMSkpO1xuXHR9LFxuXG5cdC8vIGFkZHMgZGF0YSB0byB0aGUgY3VycmVudCBzdGFja1xuXHRhZGREYXRhOiBmdW5jdGlvbihkYXRhLCBvcHRpb25zKSB7XG5cdFx0aWYgKCFNb2RlbC5pc01vZGVsKGRhdGEpKSBkYXRhID0gbmV3IE1vZGVsKGRhdGEsIHRoaXMubW9kZWwsIG9wdGlvbnMpO1xuXHRcdHRoaXMubW9kZWwgPSBkYXRhO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGF0dGFjaCArIG1vdW50XG5cdHBhaW50OiBmdW5jdGlvbihwLCBuLCBfaXNNb3ZlLCBfaXNSZXBsYWNlKSB7XG5cdFx0RE9NUmFuZ2UucHJvdG90eXBlLmF0dGFjaC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdGlmICghKF9pc01vdmUgfHwgX2lzUmVwbGFjZSB8fCB0aGlzLmNvbXApKSB0aGlzLm1vdW50KCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gYXV0byBzdG9wIG9uIGRldGFjaFxuXHRkZXRhY2g6IGZ1bmN0aW9uKF9pc1JlcGxhY2UpIHtcblx0XHRpZiAoIV9pc1JlcGxhY2UpIHRoaXMuc3RvcCgpO1xuXHRcdERPTVJhbmdlLnByb3RvdHlwZS5kZXRhY2guYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhdXRvcnVuOiBmdW5jdGlvbihmbiwgb3B0aW9ucykge1xuXHRcdHJldHVybiBUcmFja3IuYXV0b3J1bihmbiwgb3B0aW9ucywgdGhpcyk7XG5cdH0sXG5cblx0Ly8gYSBnZW5lcmFsaXplZCByZWFjdGl2ZSB3b3JrZmxvdyBoZWxwZXJcblx0bW91bnQ6IGZ1bmN0aW9uKCkge1xuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdC8vIHN0b3AgZXhpc3RpbmcgbW91bnRcblx0XHRcdHRoaXMuc3RvcCgpO1xuXG5cdFx0XHQvLyB0aGUgZmlyc3QgZXZlbnQgaW4gdGhlIGN5Y2xlLCBiZWZvcmUgZXZlcnl0aGluZyBlbHNlXG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDpiZWZvcmVcIik7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHQvLyB0aGUgYXV0b3J1biBjb21wdXRhdGlvblxuXHRcdHZhciBjb21wID0gdGhpcy5jb21wID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGNvbXApIHtcblx0XHRcdHRoaXMucmVuZGVyKCk7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJyZW5kZXJcIiwgY29tcCk7XG5cblx0XHRcdC8vIGF1dG8gY2xlYW4gdXBcblx0XHRcdGNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHQvLyByZW1haW5pbmcgaW52YWxpZGF0ZSBldmVudHNcblx0XHRcdFx0dGhpcy50cmlnZ2VyKFwiaW52YWxpZGF0ZVwiLCBjb21wKTtcblxuXHRcdFx0XHQvLyBkZXRlY3QgaWYgdGhlIGNvbXB1dGF0aW9uIHN0b3BwZWRcblx0XHRcdFx0aWYgKGNvbXAuc3RvcHBlZCkge1xuXHRcdFx0XHRcdHRoaXMudHJpZ2dlcihcInN0b3BcIiwgY29tcCk7XG5cdFx0XHRcdFx0ZGVsZXRlIHRoaXMuY29tcDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHQvLyByZW1haW5pbmcgbW91bnQgZXZlbnRzIGhhcHBlbiBhZnRlciB0aGUgZmlyc3QgcmVuZGVyXG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnQ6YWZ0ZXJcIiwgY29tcCk7XG5cdFx0fSwgdGhpcyk7XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW5kZXI6IGZ1bmN0aW9uKCl7fSxcblxuXHRzdG9wOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5jb21wKSB0aGlzLmNvbXAuc3RvcCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIHNldHMgcGFydGlhbCBieSBuYW1lXG5cdHNldFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUsIHBhcnRpYWwpIHtcblx0XHRpZiAoXy5pc09iamVjdChuYW1lKSAmJiBwYXJ0aWFsID09IG51bGwpIHtcblx0XHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihwLCBuKSB7IHRoaXMuc2V0UGFydGlhbChuLCBwKTsgfSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAoIV8uaXNTdHJpbmcobmFtZSkgJiYgbmFtZSAhPT0gXCJcIilcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBub24tZW1wdHkgc3RyaW5nIGZvciBwYXJ0aWFsIG5hbWUuXCIpO1xuXG5cdFx0aWYgKHBhcnRpYWwgIT0gbnVsbCAmJiAhdXRpbHMuaXNTdWJDbGFzcyhWaWV3LCBwYXJ0aWFsKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBWaWV3IHN1YmNsYXNzIG9yIGZ1bmN0aW9uIGZvciBwYXJ0aWFsLlwiKTtcblxuXHRcdGlmIChwYXJ0aWFsID09IG51bGwpIHtcblx0XHRcdGRlbGV0ZSB0aGlzLl9wYXJ0aWFsc1tuYW1lXTtcblx0XHRcdHBhcnRpYWwgPSB2b2lkIDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwID0gdGhpcy5fZ2V0UGFydGlhbChuYW1lKTtcblx0XHRcdHAudmlldyA9IHBhcnRpYWw7XG5cdFx0XHRwLmRlcC5jaGFuZ2VkKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gZW5zdXJlcyBhIHBhcnRpYWwncyBkZXBlbmRlbmN5IGV4aXN0c1xuXHRfZ2V0UGFydGlhbDogZnVuY3Rpb24obmFtZSkge1xuXHRcdGlmICh0aGlzLl9wYXJ0aWFsc1tuYW1lXSA9PSBudWxsKVxuXHRcdFx0dGhpcy5fcGFydGlhbHNbbmFtZV0gPSB7IGRlcDogbmV3IFRyYWNrci5EZXBlbmRlbmN5KCkgfTtcblxuXHRcdHJldHVybiB0aGlzLl9wYXJ0aWFsc1tuYW1lXTtcblx0fSxcblxuXHQvLyBsb29rcyB0aHJvdWdoIHBhcmVudHMgZm9yIHBhcnRpYWxcblx0ZmluZFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblx0XHR2YXIgYyA9IHRoaXMsIHA7XG5cblx0XHR3aGlsZSAoYyAhPSBudWxsKSB7XG5cdFx0XHRpZiAoYy5fZ2V0UGFydGlhbCAhPSBudWxsKSB7XG5cdFx0XHRcdHAgPSBjLl9nZXRQYXJ0aWFsKG5hbWUpO1xuXHRcdFx0XHRwLmRlcC5kZXBlbmQoKTtcblx0XHRcdFx0aWYgKG9wdGlvbnMubG9jYWwgfHwgcC52aWV3ICE9IG51bGwpIHJldHVybiBwLnZpZXc7XG5cdFx0XHR9XG5cblx0XHRcdGMgPSBjLnBhcmVudFJhbmdlO1xuXHRcdH1cblx0fSxcblxuXHQvLyBnZW5lcmF0ZXMgYSBuZXcgY29tcG9uZW50IGZyb20gYSBWaWV3IHN1YmNsYXNzIG9yIHBhcnRpYWwncyBuYW1lXG5cdHJlbmRlclBhcnRpYWw6IGZ1bmN0aW9uKGtsYXNzLCBjdHgsIG9wdGlvbnMpIHtcblx0XHR2YXIgY29tcHMsIG5hbWU7XG5cblx0XHQvLyBsb29rIHVwIHBhcnRpYWwgd2l0aCB0ZW1wbGF0ZSBvYmplY3Rcblx0XHRpZiAodHlwZW9mIGtsYXNzID09PSBcIm9iamVjdFwiICYmIGtsYXNzLnR5cGUgPT09IE5PREVfVFlQRS5QQVJUSUFMKSB7XG5cdFx0XHRuYW1lID0ga2xhc3MudmFsdWU7XG5cdFx0XHRrbGFzcyA9IHRoaXMuZmluZFBhcnRpYWwobmFtZSwgeyBsb2NhbDoga2xhc3MubG9jYWwgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gbG9vayB1cCB0aGUgcGFydGlhbCBieSBuYW1lXG5cdFx0aWYgKHR5cGVvZiBrbGFzcyA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0bmFtZSA9IGtsYXNzO1xuXHRcdFx0a2xhc3MgPSB0aGlzLmZpbmRQYXJ0aWFsKGtsYXNzKTtcblx0XHR9XG5cblx0XHQvLyBjbGFzcyBtdXN0IGJlIGEgdmlld1xuXHRcdGlmICghdXRpbHMuaXNTdWJDbGFzcyhWaWV3LCBrbGFzcykpIHJldHVybiBudWxsO1xuXG5cdFx0Ly8gbm9ybWFsaXplIGNvbnRleHRcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgTW9kZWwpIGN0eCA9IGN0eC5hcHBlbmQoY3R4LmRhdGEpO1xuXG5cdFx0Ly8gY3JlYXRlIGl0IG5vbi1yZWFjdGl2ZWx5XG5cdFx0dmFyIGNvbXBvbmVudCA9IFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBuZXcga2xhc3MoY3R4LCBvcHRpb25zKTtcblx0XHR9KTtcblxuXHRcdC8vIGFkZCBpdCB0byB0aGUgbGlzdFxuXHRcdGlmIChuYW1lKSB7XG5cdFx0XHRjb21wcyA9IHRoaXMuX2NvbXBvbmVudHM7XG5cdFx0XHRpZiAoY29tcHNbbmFtZV0gPT0gbnVsbCkgY29tcHNbbmFtZV0gPSBbXTtcblx0XHRcdGNvbXBzW25hbWVdLnB1c2goY29tcG9uZW50KTtcblxuXHRcdFx0Ly8gYXV0byByZW1vdmUgd2hlbiB0aGUgcGFydGlhbCBpcyBcInN0b3BwZWRcIlxuXHRcdFx0Y29tcG9uZW50Lm9uY2UoXCJzdG9wXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRjb21wc1tuYW1lXSA9IF8ud2l0aG91dChjb21wc1tuYW1lXSwgY29tcG9uZW50KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21wb25lbnQ7XG5cdH0sXG5cblx0Ly8gcmV0dXJucyBmaXJzdCByZW5kZXJlZCBwYXJ0aWFsIGJ5IG5hbWVcblx0Z2V0Q29tcG9uZW50OiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGNvbXBzLCBjb21wLCByZXMsIG4sIGk7XG5cblx0XHRjb21wcyA9IHRoaXMuX2NvbXBvbmVudHM7XG5cdFx0aWYgKGNvbXBzW25hbWVdICE9IG51bGwgJiYgY29tcHNbbmFtZV0ubGVuZ3RoKSByZXR1cm4gY29tcHNbbmFtZV1bMF07XG5cblx0XHRmb3IgKG4gaW4gY29tcHMpIHtcblx0XHRcdGZvciAoaSBpbiBjb21wc1tuXSkge1xuXHRcdFx0XHRjb21wID0gY29tcHNbbl1baV07XG5cdFx0XHRcdGlmICghKGNvbXAgaW5zdGFuY2VvZiBWaWV3KSkgY29udGludWU7XG5cdFx0XHRcdHJlcyA9IGNvbXAuZ2V0Q29tcG9uZW50KG5hbWUpO1xuXHRcdFx0XHRpZiAocmVzICE9IG51bGwpIHJldHVybiByZXM7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH0sXG5cblx0Ly8gcmV0dXJucyBhbGwgcmVuZGVyZWQgcGFydGlhbHMgYnkgbmFtZVxuXHRnZXRDb21wb25lbnRzOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0aWYgKG5hbWUgPT0gbnVsbCkgcmV0dXJuIF8uZmxhdHRlbihfLnZhbHVlcyh0aGlzLl9jb21wb25lbnRzKSk7XG5cblx0XHRyZXR1cm4gXy5yZWR1Y2UodGhpcy5fY29tcG9uZW50cywgZnVuY3Rpb24obSwgY29tcHMsIG4pIHtcblx0XHRcdGlmIChuID09PSBuYW1lKSBtLnB1c2guYXBwbHkobSwgY29tcHMpO1xuXG5cdFx0XHRjb21wcy5mb3JFYWNoKGZ1bmN0aW9uKGMpIHtcblx0XHRcdFx0aWYgKGMgaW5zdGFuY2VvZiBWaWV3KSBtLnB1c2guYXBwbHkobSwgYy5nZXRDb21wb25lbnRzKG5hbWUpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gbTtcblx0XHR9LCBbXSk7XG5cdH0sXG5cblx0Ly8gcmV0dXJucyByZW5kZXJlZCBwYXJ0aWFscywgc2VhcmNoaW5nIGNoaWxkcmVuIHZpZXdzXG5cdGZpbmRDb21wb25lbnRzOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIHRwbHMgPSBbIHRoaXMgXSxcblx0XHRcdGNvbXBzID0gW10sXG5cdFx0XHR0cGw7XG5cblx0XHR3aGlsZSAodHBscy5sZW5ndGgpIHtcblx0XHRcdHRwbCA9IHRwbHMuc2hpZnQoKTtcblx0XHRcdGNvbXBzID0gY29tcHMuY29uY2F0KHRwbC5nZXRDb21wb25lbnRzKG5hbWUpKTtcblx0XHRcdHRwbHMucHVzaCh0cGwuZ2V0Q29tcG9uZW50cygpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gY29tcHM7XG5cdH0sXG5cblx0Ly8gcmV0dXJucyByZW5kZXJlZCBwYXJ0aWFscywgc2VhcmNoaW5nIGNoaWxkcmVuIHZpZXdzXG5cdGZpbmRDb21wb25lbnQ6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgdHBscyA9IFsgdGhpcyBdLFxuXHRcdFx0dHBsLCBjb21wO1xuXG5cdFx0d2hpbGUgKHRwbHMubGVuZ3RoKSB7XG5cdFx0XHR0cGwgPSB0cGxzLnNoaWZ0KCk7XG5cdFx0XHRjb21wID0gdHBsLmdldENvbXBvbmVudChuYW1lKTtcblx0XHRcdGlmIChjb21wKSByZXR1cm4gY29tcDtcblx0XHRcdHRwbHMgPSB0cGxzLmNvbmNhdCh0cGwuZ2V0Q29tcG9uZW50cygpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG59KTtcblxuLy8gcXVpY2sgYWNjZXNzIHRvIHRoZSB0b3AgbW9kZWwgZGF0YVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFZpZXcucHJvdG90eXBlLCBcImRhdGFcIiwge1xuXHRjb25maWd1cmFibGU6IHRydWUsXG5cdGVudW1lcmFibGU6IHRydWUsXG5cdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5tb2RlbC5fZGVwLmRlcGVuZCgpO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmRhdGE7XG5cdH0sXG5cdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0dGhpcy5tb2RlbC5zZXQodmFsKTtcblx0fVxufSk7XG5cbi8vIGNoYWluYWJsZSBtZXRob2RzIHRvIHByb3h5IHRvIG1vZGVsXG5bIFwic2V0XCIsIFwicmVnaXN0ZXJQcm94eVwiIF1cbi5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuXHRWaWV3LnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5tb2RlbFttZXRob2RdLmFwcGx5KHRoaXMubW9kZWwsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG59KTtcblxuLy8gbWV0aG9kcyB0byBwcm94eSB0byBtb2RlbCB3aGljaCBkb24ndCByZXR1cm4gdGhpc1xuWyBcImdldFwiLCBcImdldExvY2FsXCIsIFwiZ2V0UHJveHlCeVZhbHVlXCIsIFwiZ2V0TW9kZWxBdE9mZnNldFwiLFxuICBcImdldFJvb3RNb2RlbFwiLCBcImZpbmRNb2RlbFwiLCBcImdldEFsbE1vZGVsc1wiXG5dLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG5cdFZpZXcucHJvdG90eXBlW21ldGhvZF0gPSBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbFttZXRob2RdLmFwcGx5KHRoaXMubW9kZWwsIGFyZ3VtZW50cyk7XG5cdH07XG59KTtcblxuLy8gcHJveHkgYSBmZXcgY29tcHV0YXRpb24gbWV0aG9kc1xuWyBcImludmFsaWRhdGVcIiwgXCJvbkludmFsaWRhdGVcIiBdLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG5cdFZpZXcucHJvdG90eXBlW21ldGhvZF0gPSBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuY29tcCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IHJ1biBcIiArIG1ldGhvZCArIFwiKCkuIFRoaXMgdmlldyBpcyBub3QgbW91bnRlZC5cIik7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb21wW21ldGhvZF0uYXBwbHkodGhpcy5jb21wLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xufSk7XG4iLCIvKipcbiAqIFN0YW5kYWxvbmUgZXh0cmFjdGlvbiBvZiBCYWNrYm9uZS5FdmVudHMsIG5vIGV4dGVybmFsIGRlcGVuZGVuY3kgcmVxdWlyZWQuXG4gKiBEZWdyYWRlcyBuaWNlbHkgd2hlbiBCYWNrb25lL3VuZGVyc2NvcmUgYXJlIGFscmVhZHkgYXZhaWxhYmxlIGluIHRoZSBjdXJyZW50XG4gKiBnbG9iYWwgY29udGV4dC5cbiAqXG4gKiBOb3RlIHRoYXQgZG9jcyBzdWdnZXN0IHRvIHVzZSB1bmRlcnNjb3JlJ3MgYF8uZXh0ZW5kKClgIG1ldGhvZCB0byBhZGQgRXZlbnRzXG4gKiBzdXBwb3J0IHRvIHNvbWUgZ2l2ZW4gb2JqZWN0LiBBIGBtaXhpbigpYCBtZXRob2QgaGFzIGJlZW4gYWRkZWQgdG8gdGhlIEV2ZW50c1xuICogcHJvdG90eXBlIHRvIGF2b2lkIHVzaW5nIHVuZGVyc2NvcmUgZm9yIHRoYXQgc29sZSBwdXJwb3NlOlxuICpcbiAqICAgICB2YXIgbXlFdmVudEVtaXR0ZXIgPSBCYWNrYm9uZUV2ZW50cy5taXhpbih7fSk7XG4gKlxuICogT3IgZm9yIGEgZnVuY3Rpb24gY29uc3RydWN0b3I6XG4gKlxuICogICAgIGZ1bmN0aW9uIE15Q29uc3RydWN0b3IoKXt9XG4gKiAgICAgTXlDb25zdHJ1Y3Rvci5wcm90b3R5cGUuZm9vID0gZnVuY3Rpb24oKXt9XG4gKiAgICAgQmFja2JvbmVFdmVudHMubWl4aW4oTXlDb25zdHJ1Y3Rvci5wcm90b3R5cGUpO1xuICpcbiAqIChjKSAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIEluYy5cbiAqIChjKSAyMDEzIE5pY29sYXMgUGVycmlhdWx0XG4gKi9cbi8qIGdsb2JhbCBleHBvcnRzOnRydWUsIGRlZmluZSwgbW9kdWxlICovXG4oZnVuY3Rpb24oKSB7XG4gIHZhciByb290ID0gdGhpcyxcbiAgICAgIG5hdGl2ZUZvckVhY2ggPSBBcnJheS5wcm90b3R5cGUuZm9yRWFjaCxcbiAgICAgIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSxcbiAgICAgIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLFxuICAgICAgaWRDb3VudGVyID0gMDtcblxuICAvLyBSZXR1cm5zIGEgcGFydGlhbCBpbXBsZW1lbnRhdGlvbiBtYXRjaGluZyB0aGUgbWluaW1hbCBBUEkgc3Vic2V0IHJlcXVpcmVkXG4gIC8vIGJ5IEJhY2tib25lLkV2ZW50c1xuICBmdW5jdGlvbiBtaW5pc2NvcmUoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGtleXM6IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYmogIT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIG9iaiAhPT0gXCJmdW5jdGlvblwiIHx8IG9iaiA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJrZXlzKCkgY2FsbGVkIG9uIGEgbm9uLW9iamVjdFwiKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIga2V5LCBrZXlzID0gW107XG4gICAgICAgIGZvciAoa2V5IGluIG9iaikge1xuICAgICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAga2V5c1trZXlzLmxlbmd0aF0gPSBrZXk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBrZXlzO1xuICAgICAgfSxcblxuICAgICAgdW5pcXVlSWQ6IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgICAgICB2YXIgaWQgPSArK2lkQ291bnRlciArICcnO1xuICAgICAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgICAgIH0sXG5cbiAgICAgIGhhczogZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICAgICAgcmV0dXJuIGhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xuICAgICAgfSxcblxuICAgICAgZWFjaDogZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgICAgICBpZiAob2JqID09IG51bGwpIHJldHVybjtcbiAgICAgICAgaWYgKG5hdGl2ZUZvckVhY2ggJiYgb2JqLmZvckVhY2ggPT09IG5hdGl2ZUZvckVhY2gpIHtcbiAgICAgICAgICBvYmouZm9yRWFjaChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgICAgIH0gZWxzZSBpZiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpIHtcbiAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IG9iai5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2ldLCBpLCBvYmopO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5oYXMob2JqLCBrZXkpKSB7XG4gICAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2tleV0sIGtleSwgb2JqKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIG9uY2U6IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICAgICAgdmFyIHJhbiA9IGZhbHNlLCBtZW1vO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgaWYgKHJhbikgcmV0dXJuIG1lbW87XG4gICAgICAgICAgcmFuID0gdHJ1ZTtcbiAgICAgICAgICBtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgIGZ1bmMgPSBudWxsO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9O1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICB2YXIgXyA9IG1pbmlzY29yZSgpLCBFdmVudHM7XG5cbiAgLy8gQmFja2JvbmUuRXZlbnRzXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEEgbW9kdWxlIHRoYXQgY2FuIGJlIG1peGVkIGluIHRvICphbnkgb2JqZWN0KiBpbiBvcmRlciB0byBwcm92aWRlIGl0IHdpdGhcbiAgLy8gY3VzdG9tIGV2ZW50cy4gWW91IG1heSBiaW5kIHdpdGggYG9uYCBvciByZW1vdmUgd2l0aCBgb2ZmYCBjYWxsYmFja1xuICAvLyBmdW5jdGlvbnMgdG8gYW4gZXZlbnQ7IGB0cmlnZ2VyYC1pbmcgYW4gZXZlbnQgZmlyZXMgYWxsIGNhbGxiYWNrcyBpblxuICAvLyBzdWNjZXNzaW9uLlxuICAvL1xuICAvLyAgICAgdmFyIG9iamVjdCA9IHt9O1xuICAvLyAgICAgXy5leHRlbmQob2JqZWN0LCBCYWNrYm9uZS5FdmVudHMpO1xuICAvLyAgICAgb2JqZWN0Lm9uKCdleHBhbmQnLCBmdW5jdGlvbigpeyBhbGVydCgnZXhwYW5kZWQnKTsgfSk7XG4gIC8vICAgICBvYmplY3QudHJpZ2dlcignZXhwYW5kJyk7XG4gIC8vXG4gIEV2ZW50cyA9IHtcblxuICAgIC8vIEJpbmQgYW4gZXZlbnQgdG8gYSBgY2FsbGJhY2tgIGZ1bmN0aW9uLiBQYXNzaW5nIGBcImFsbFwiYCB3aWxsIGJpbmRcbiAgICAvLyB0aGUgY2FsbGJhY2sgdG8gYWxsIGV2ZW50cyBmaXJlZC5cbiAgICBvbjogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICAgIGlmICghZXZlbnRzQXBpKHRoaXMsICdvbicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG4gICAgICB0aGlzLl9ldmVudHMgfHwgKHRoaXMuX2V2ZW50cyA9IHt9KTtcbiAgICAgIHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV0gfHwgKHRoaXMuX2V2ZW50c1tuYW1lXSA9IFtdKTtcbiAgICAgIGV2ZW50cy5wdXNoKHtjYWxsYmFjazogY2FsbGJhY2ssIGNvbnRleHQ6IGNvbnRleHQsIGN0eDogY29udGV4dCB8fCB0aGlzfSk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLy8gQmluZCBhbiBldmVudCB0byBvbmx5IGJlIHRyaWdnZXJlZCBhIHNpbmdsZSB0aW1lLiBBZnRlciB0aGUgZmlyc3QgdGltZVxuICAgIC8vIHRoZSBjYWxsYmFjayBpcyBpbnZva2VkLCBpdCB3aWxsIGJlIHJlbW92ZWQuXG4gICAgb25jZTogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICAgIGlmICghZXZlbnRzQXBpKHRoaXMsICdvbmNlJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHZhciBvbmNlID0gXy5vbmNlKGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLm9mZihuYW1lLCBvbmNlKTtcbiAgICAgICAgY2FsbGJhY2suYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH0pO1xuICAgICAgb25jZS5fY2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgIHJldHVybiB0aGlzLm9uKG5hbWUsIG9uY2UsIGNvbnRleHQpO1xuICAgIH0sXG5cbiAgICAvLyBSZW1vdmUgb25lIG9yIG1hbnkgY2FsbGJhY2tzLiBJZiBgY29udGV4dGAgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcbiAgICAvLyBjYWxsYmFja3Mgd2l0aCB0aGF0IGZ1bmN0aW9uLiBJZiBgY2FsbGJhY2tgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG4gICAgLy8gY2FsbGJhY2tzIGZvciB0aGUgZXZlbnQuIElmIGBuYW1lYCBpcyBudWxsLCByZW1vdmVzIGFsbCBib3VuZFxuICAgIC8vIGNhbGxiYWNrcyBmb3IgYWxsIGV2ZW50cy5cbiAgICBvZmY6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgICB2YXIgcmV0YWluLCBldiwgZXZlbnRzLCBuYW1lcywgaSwgbCwgaiwgaztcbiAgICAgIGlmICghdGhpcy5fZXZlbnRzIHx8ICFldmVudHNBcGkodGhpcywgJ29mZicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pKSByZXR1cm4gdGhpcztcbiAgICAgIGlmICghbmFtZSAmJiAhY2FsbGJhY2sgJiYgIWNvbnRleHQpIHtcbiAgICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuXG4gICAgICBuYW1lcyA9IG5hbWUgPyBbbmFtZV0gOiBfLmtleXModGhpcy5fZXZlbnRzKTtcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgbmFtZSA9IG5hbWVzW2ldO1xuICAgICAgICBpZiAoZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdKSB7XG4gICAgICAgICAgdGhpcy5fZXZlbnRzW25hbWVdID0gcmV0YWluID0gW107XG4gICAgICAgICAgaWYgKGNhbGxiYWNrIHx8IGNvbnRleHQpIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDAsIGsgPSBldmVudHMubGVuZ3RoOyBqIDwgazsgaisrKSB7XG4gICAgICAgICAgICAgIGV2ID0gZXZlbnRzW2pdO1xuICAgICAgICAgICAgICBpZiAoKGNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2suX2NhbGxiYWNrKSB8fFxuICAgICAgICAgICAgICAgICAgKGNvbnRleHQgJiYgY29udGV4dCAhPT0gZXYuY29udGV4dCkpIHtcbiAgICAgICAgICAgICAgICByZXRhaW4ucHVzaChldik7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFyZXRhaW4ubGVuZ3RoKSBkZWxldGUgdGhpcy5fZXZlbnRzW25hbWVdO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvLyBUcmlnZ2VyIG9uZSBvciBtYW55IGV2ZW50cywgZmlyaW5nIGFsbCBib3VuZCBjYWxsYmFja3MuIENhbGxiYWNrcyBhcmVcbiAgICAvLyBwYXNzZWQgdGhlIHNhbWUgYXJndW1lbnRzIGFzIGB0cmlnZ2VyYCBpcywgYXBhcnQgZnJvbSB0aGUgZXZlbnQgbmFtZVxuICAgIC8vICh1bmxlc3MgeW91J3JlIGxpc3RlbmluZyBvbiBgXCJhbGxcImAsIHdoaWNoIHdpbGwgY2F1c2UgeW91ciBjYWxsYmFjayB0b1xuICAgIC8vIHJlY2VpdmUgdGhlIHRydWUgbmFtZSBvZiB0aGUgZXZlbnQgYXMgdGhlIGZpcnN0IGFyZ3VtZW50KS5cbiAgICB0cmlnZ2VyOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICBpZiAoIXRoaXMuX2V2ZW50cykgcmV0dXJuIHRoaXM7XG4gICAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgIGlmICghZXZlbnRzQXBpKHRoaXMsICd0cmlnZ2VyJywgbmFtZSwgYXJncykpIHJldHVybiB0aGlzO1xuICAgICAgdmFyIGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXTtcbiAgICAgIHZhciBhbGxFdmVudHMgPSB0aGlzLl9ldmVudHMuYWxsO1xuICAgICAgaWYgKGV2ZW50cykgdHJpZ2dlckV2ZW50cyhldmVudHMsIGFyZ3MpO1xuICAgICAgaWYgKGFsbEV2ZW50cykgdHJpZ2dlckV2ZW50cyhhbGxFdmVudHMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLy8gVGVsbCB0aGlzIG9iamVjdCB0byBzdG9wIGxpc3RlbmluZyB0byBlaXRoZXIgc3BlY2lmaWMgZXZlbnRzIC4uLiBvclxuICAgIC8vIHRvIGV2ZXJ5IG9iamVjdCBpdCdzIGN1cnJlbnRseSBsaXN0ZW5pbmcgdG8uXG4gICAgc3RvcExpc3RlbmluZzogZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuICAgICAgdmFyIGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycztcbiAgICAgIGlmICghbGlzdGVuZXJzKSByZXR1cm4gdGhpcztcbiAgICAgIHZhciBkZWxldGVMaXN0ZW5lciA9ICFuYW1lICYmICFjYWxsYmFjaztcbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcbiAgICAgIGlmIChvYmopIChsaXN0ZW5lcnMgPSB7fSlbb2JqLl9saXN0ZW5lcklkXSA9IG9iajtcbiAgICAgIGZvciAodmFyIGlkIGluIGxpc3RlbmVycykge1xuICAgICAgICBsaXN0ZW5lcnNbaWRdLm9mZihuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG4gICAgICAgIGlmIChkZWxldGVMaXN0ZW5lcikgZGVsZXRlIHRoaXMuX2xpc3RlbmVyc1tpZF07XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgfTtcblxuICAvLyBSZWd1bGFyIGV4cHJlc3Npb24gdXNlZCB0byBzcGxpdCBldmVudCBzdHJpbmdzLlxuICB2YXIgZXZlbnRTcGxpdHRlciA9IC9cXHMrLztcblxuICAvLyBJbXBsZW1lbnQgZmFuY3kgZmVhdHVyZXMgb2YgdGhlIEV2ZW50cyBBUEkgc3VjaCBhcyBtdWx0aXBsZSBldmVudFxuICAvLyBuYW1lcyBgXCJjaGFuZ2UgYmx1clwiYCBhbmQgalF1ZXJ5LXN0eWxlIGV2ZW50IG1hcHMgYHtjaGFuZ2U6IGFjdGlvbn1gXG4gIC8vIGluIHRlcm1zIG9mIHRoZSBleGlzdGluZyBBUEkuXG4gIHZhciBldmVudHNBcGkgPSBmdW5jdGlvbihvYmosIGFjdGlvbiwgbmFtZSwgcmVzdCkge1xuICAgIGlmICghbmFtZSkgcmV0dXJuIHRydWU7XG5cbiAgICAvLyBIYW5kbGUgZXZlbnQgbWFwcy5cbiAgICBpZiAodHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSB7XG4gICAgICBmb3IgKHZhciBrZXkgaW4gbmFtZSkge1xuICAgICAgICBvYmpbYWN0aW9uXS5hcHBseShvYmosIFtrZXksIG5hbWVba2V5XV0uY29uY2F0KHJlc3QpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgc3BhY2Ugc2VwYXJhdGVkIGV2ZW50IG5hbWVzLlxuICAgIGlmIChldmVudFNwbGl0dGVyLnRlc3QobmFtZSkpIHtcbiAgICAgIHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoZXZlbnRTcGxpdHRlcik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBvYmpbYWN0aW9uXS5hcHBseShvYmosIFtuYW1lc1tpXV0uY29uY2F0KHJlc3QpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBBIGRpZmZpY3VsdC10by1iZWxpZXZlLCBidXQgb3B0aW1pemVkIGludGVybmFsIGRpc3BhdGNoIGZ1bmN0aW9uIGZvclxuICAvLyB0cmlnZ2VyaW5nIGV2ZW50cy4gVHJpZXMgdG8ga2VlcCB0aGUgdXN1YWwgY2FzZXMgc3BlZWR5IChtb3N0IGludGVybmFsXG4gIC8vIEJhY2tib25lIGV2ZW50cyBoYXZlIDMgYXJndW1lbnRzKS5cbiAgdmFyIHRyaWdnZXJFdmVudHMgPSBmdW5jdGlvbihldmVudHMsIGFyZ3MpIHtcbiAgICB2YXIgZXYsIGkgPSAtMSwgbCA9IGV2ZW50cy5sZW5ndGgsIGExID0gYXJnc1swXSwgYTIgPSBhcmdzWzFdLCBhMyA9IGFyZ3NbMl07XG4gICAgc3dpdGNoIChhcmdzLmxlbmd0aCkge1xuICAgICAgY2FzZSAwOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCk7IHJldHVybjtcbiAgICAgIGNhc2UgMTogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExKTsgcmV0dXJuO1xuICAgICAgY2FzZSAyOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyKTsgcmV0dXJuO1xuICAgICAgY2FzZSAzOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyLCBhMyk7IHJldHVybjtcbiAgICAgIGRlZmF1bHQ6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmFwcGx5KGV2LmN0eCwgYXJncyk7XG4gICAgfVxuICB9O1xuXG4gIHZhciBsaXN0ZW5NZXRob2RzID0ge2xpc3RlblRvOiAnb24nLCBsaXN0ZW5Ub09uY2U6ICdvbmNlJ307XG5cbiAgLy8gSW52ZXJzaW9uLW9mLWNvbnRyb2wgdmVyc2lvbnMgb2YgYG9uYCBhbmQgYG9uY2VgLiBUZWxsICp0aGlzKiBvYmplY3QgdG9cbiAgLy8gbGlzdGVuIHRvIGFuIGV2ZW50IGluIGFub3RoZXIgb2JqZWN0IC4uLiBrZWVwaW5nIHRyYWNrIG9mIHdoYXQgaXQnc1xuICAvLyBsaXN0ZW5pbmcgdG8uXG4gIF8uZWFjaChsaXN0ZW5NZXRob2RzLCBmdW5jdGlvbihpbXBsZW1lbnRhdGlvbiwgbWV0aG9kKSB7XG4gICAgRXZlbnRzW21ldGhvZF0gPSBmdW5jdGlvbihvYmosIG5hbWUsIGNhbGxiYWNrKSB7XG4gICAgICB2YXIgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzIHx8ICh0aGlzLl9saXN0ZW5lcnMgPSB7fSk7XG4gICAgICB2YXIgaWQgPSBvYmouX2xpc3RlbmVySWQgfHwgKG9iai5fbGlzdGVuZXJJZCA9IF8udW5pcXVlSWQoJ2wnKSk7XG4gICAgICBsaXN0ZW5lcnNbaWRdID0gb2JqO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JykgY2FsbGJhY2sgPSB0aGlzO1xuICAgICAgb2JqW2ltcGxlbWVudGF0aW9uXShuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuICB9KTtcblxuICAvLyBBbGlhc2VzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgRXZlbnRzLmJpbmQgICA9IEV2ZW50cy5vbjtcbiAgRXZlbnRzLnVuYmluZCA9IEV2ZW50cy5vZmY7XG5cbiAgLy8gTWl4aW4gdXRpbGl0eVxuICBFdmVudHMubWl4aW4gPSBmdW5jdGlvbihwcm90bykge1xuICAgIHZhciBleHBvcnRzID0gWydvbicsICdvbmNlJywgJ29mZicsICd0cmlnZ2VyJywgJ3N0b3BMaXN0ZW5pbmcnLCAnbGlzdGVuVG8nLFxuICAgICAgICAgICAgICAgICAgICdsaXN0ZW5Ub09uY2UnLCAnYmluZCcsICd1bmJpbmQnXTtcbiAgICBfLmVhY2goZXhwb3J0cywgZnVuY3Rpb24obmFtZSkge1xuICAgICAgcHJvdG9bbmFtZV0gPSB0aGlzW25hbWVdO1xuICAgIH0sIHRoaXMpO1xuICAgIHJldHVybiBwcm90bztcbiAgfTtcblxuICAvLyBFeHBvcnQgRXZlbnRzIGFzIEJhY2tib25lRXZlbnRzIGRlcGVuZGluZyBvbiBjdXJyZW50IGNvbnRleHRcbiAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuICAgIH1cbiAgICBleHBvcnRzLkJhY2tib25lRXZlbnRzID0gRXZlbnRzO1xuICB9ZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICAmJiB0eXBlb2YgZGVmaW5lLmFtZCA9PSBcIm9iamVjdFwiKSB7XG4gICAgZGVmaW5lKGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIEV2ZW50cztcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByb290LkJhY2tib25lRXZlbnRzID0gRXZlbnRzO1xuICB9XG59KSh0aGlzKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9iYWNrYm9uZS1ldmVudHMtc3RhbmRhbG9uZScpO1xuIiwiKGZ1bmN0aW9uIChkZWZpbml0aW9uKSB7XG4gIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuICB9XG4gIGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShkZWZpbml0aW9uKTtcbiAgfVxuICBlbHNlIHtcbiAgICB3aW5kb3cuQmFja2JvbmVFeHRlbmQgPSBkZWZpbml0aW9uKCk7XG4gIH1cbn0pKGZ1bmN0aW9uICgpIHtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG4gIFxuICAvLyBtaW5pLXVuZGVyc2NvcmVcbiAgdmFyIF8gPSB7XG4gICAgaGFzOiBmdW5jdGlvbiAob2JqLCBrZXkpIHtcbiAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xuICAgIH0sXG4gIFxuICAgIGV4dGVuZDogZnVuY3Rpb24ob2JqKSB7XG4gICAgICBmb3IgKHZhciBpPTE7IGk8YXJndW1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgICBmb3IgKHZhciBwcm9wIGluIHNvdXJjZSkge1xuICAgICAgICAgICAgb2JqW3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gIH07XG5cbiAgLy8vIEZvbGxvd2luZyBjb2RlIGlzIHBhc3RlZCBmcm9tIEJhY2tib25lLmpzIC8vL1xuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb3JyZWN0bHkgc2V0IHVwIHRoZSBwcm90b3R5cGUgY2hhaW4sIGZvciBzdWJjbGFzc2VzLlxuICAvLyBTaW1pbGFyIHRvIGBnb29nLmluaGVyaXRzYCwgYnV0IHVzZXMgYSBoYXNoIG9mIHByb3RvdHlwZSBwcm9wZXJ0aWVzIGFuZFxuICAvLyBjbGFzcyBwcm9wZXJ0aWVzIHRvIGJlIGV4dGVuZGVkLlxuICB2YXIgZXh0ZW5kID0gZnVuY3Rpb24ocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcbiAgICB2YXIgcGFyZW50ID0gdGhpcztcbiAgICB2YXIgY2hpbGQ7XG5cbiAgICAvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG4gICAgLy8gKHRoZSBcImNvbnN0cnVjdG9yXCIgcHJvcGVydHkgaW4geW91ciBgZXh0ZW5kYCBkZWZpbml0aW9uKSwgb3IgZGVmYXVsdGVkXG4gICAgLy8gYnkgdXMgdG8gc2ltcGx5IGNhbGwgdGhlIHBhcmVudCdzIGNvbnN0cnVjdG9yLlxuICAgIGlmIChwcm90b1Byb3BzICYmIF8uaGFzKHByb3RvUHJvcHMsICdjb25zdHJ1Y3RvcicpKSB7XG4gICAgICBjaGlsZCA9IHByb3RvUHJvcHMuY29uc3RydWN0b3I7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNoaWxkID0gZnVuY3Rpb24oKXsgcmV0dXJuIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9O1xuICAgIH1cblxuICAgIC8vIEFkZCBzdGF0aWMgcHJvcGVydGllcyB0byB0aGUgY29uc3RydWN0b3IgZnVuY3Rpb24sIGlmIHN1cHBsaWVkLlxuICAgIF8uZXh0ZW5kKGNoaWxkLCBwYXJlbnQsIHN0YXRpY1Byb3BzKTtcblxuICAgIC8vIFNldCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIGluaGVyaXQgZnJvbSBgcGFyZW50YCwgd2l0aG91dCBjYWxsaW5nXG4gICAgLy8gYHBhcmVudGAncyBjb25zdHJ1Y3RvciBmdW5jdGlvbi5cbiAgICB2YXIgU3Vycm9nYXRlID0gZnVuY3Rpb24oKXsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9O1xuICAgIFN1cnJvZ2F0ZS5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuICAgIGNoaWxkLnByb3RvdHlwZSA9IG5ldyBTdXJyb2dhdGUoKTtcblxuICAgIC8vIEFkZCBwcm90b3R5cGUgcHJvcGVydGllcyAoaW5zdGFuY2UgcHJvcGVydGllcykgdG8gdGhlIHN1YmNsYXNzLFxuICAgIC8vIGlmIHN1cHBsaWVkLlxuICAgIGlmIChwcm90b1Byb3BzKSBfLmV4dGVuZChjaGlsZC5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuXG4gICAgLy8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZFxuICAgIC8vIGxhdGVyLlxuICAgIGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cbiAgICByZXR1cm4gY2hpbGQ7XG4gIH07XG5cbiAgLy8gRXhwb3NlIHRoZSBleHRlbmQgZnVuY3Rpb25cbiAgcmV0dXJuIGV4dGVuZDtcbn0pO1xuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuICAgIHZhciBjdXJyZW50UXVldWU7XG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHZhciBpID0gLTE7XG4gICAgICAgIHdoaWxlICgrK2kgPCBsZW4pIHtcbiAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtpXSgpO1xuICAgICAgICB9XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbn1cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgcXVldWUucHVzaChmdW4pO1xuICAgIGlmICghZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIi8qIVxuICogaXMtcGxhaW4tb2JqZWN0IDxodHRwczovL2dpdGh1Yi5jb20vam9uc2NobGlua2VydC9pcy1wbGFpbi1vYmplY3Q+XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LTIwMTUsIEpvbiBTY2hsaW5rZXJ0LlxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIGlzT2JqZWN0ID0gcmVxdWlyZSgnaXNvYmplY3QnKTtcblxuZnVuY3Rpb24gaXNPYmplY3RPYmplY3Qobykge1xuICByZXR1cm4gaXNPYmplY3QobykgPT09IHRydWVcbiAgICAmJiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwobykgPT09ICdbb2JqZWN0IE9iamVjdF0nO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzUGxhaW5PYmplY3Qobykge1xuICB2YXIgY3Rvcixwcm90O1xuICBcbiAgaWYgKGlzT2JqZWN0T2JqZWN0KG8pID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICBcbiAgLy8gSWYgaGFzIG1vZGlmaWVkIGNvbnN0cnVjdG9yXG4gIGN0b3IgPSBvLmNvbnN0cnVjdG9yO1xuICBpZiAodHlwZW9mIGN0b3IgIT09ICdmdW5jdGlvbicpIHJldHVybiBmYWxzZTtcbiAgXG4gIC8vIElmIGhhcyBtb2RpZmllZCBwcm90b3R5cGVcbiAgcHJvdCA9IGN0b3IucHJvdG90eXBlO1xuICBpZiAoaXNPYmplY3RPYmplY3QocHJvdCkgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIFxuICAvLyBJZiBjb25zdHJ1Y3RvciBkb2VzIG5vdCBoYXZlIGFuIE9iamVjdC1zcGVjaWZpYyBtZXRob2RcbiAgaWYgKHByb3QuaGFzT3duUHJvcGVydHkoJ2lzUHJvdG90eXBlT2YnKSA9PT0gZmFsc2UpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgXG4gIC8vIE1vc3QgbGlrZWx5IGEgcGxhaW4gT2JqZWN0XG4gIHJldHVybiB0cnVlO1xufTtcbiIsIi8qIVxuICogaXNvYmplY3QgPGh0dHBzOi8vZ2l0aHViLmNvbS9qb25zY2hsaW5rZXJ0L2lzb2JqZWN0PlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE1LCBKb24gU2NobGlua2VydC5cbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNPYmplY3QodmFsKSB7XG4gIHJldHVybiB2YWwgIT0gbnVsbCAmJiB0eXBlb2YgdmFsID09PSAnb2JqZWN0J1xuICAgICYmICFBcnJheS5pc0FycmF5KHZhbCk7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcHJvdG8gPSBFbGVtZW50LnByb3RvdHlwZTtcbnZhciB2ZW5kb3IgPSBwcm90by5tYXRjaGVzXG4gIHx8IHByb3RvLm1hdGNoZXNTZWxlY3RvclxuICB8fCBwcm90by53ZWJraXRNYXRjaGVzU2VsZWN0b3JcbiAgfHwgcHJvdG8ubW96TWF0Y2hlc1NlbGVjdG9yXG4gIHx8IHByb3RvLm1zTWF0Y2hlc1NlbGVjdG9yXG4gIHx8IHByb3RvLm9NYXRjaGVzU2VsZWN0b3I7XG5cbm1vZHVsZS5leHBvcnRzID0gbWF0Y2g7XG5cbi8qKlxuICogTWF0Y2ggYGVsYCB0byBgc2VsZWN0b3JgLlxuICpcbiAqIEBwYXJhbSB7RWxlbWVudH0gZWxcbiAqIEBwYXJhbSB7U3RyaW5nfSBzZWxlY3RvclxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gbWF0Y2goZWwsIHNlbGVjdG9yKSB7XG4gIGlmICh2ZW5kb3IpIHJldHVybiB2ZW5kb3IuY2FsbChlbCwgc2VsZWN0b3IpO1xuICB2YXIgbm9kZXMgPSBlbC5wYXJlbnROb2RlLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKG5vZGVzW2ldID09IGVsKSByZXR1cm4gdHJ1ZTtcbiAgfVxuICByZXR1cm4gZmFsc2U7XG59IiwidmFyIFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIik7XG52YXIgaGFzT3duID0gcmVxdWlyZShcImhhcy1vd24tcHJvcFwiKTtcbnZhciBjbG9uZSA9IHJlcXVpcmUoXCJzaGFsbG93LWNvcHlcIik7XG52YXIgaXNQbGFpbk9iamVjdCA9IHJlcXVpcmUoXCJpcy1wbGFpbi1vYmplY3RcIik7XG52YXIgcGF0Y2hBcnJheSA9IHJlcXVpcmUoXCJhcnJheS1zcHlcIik7XG5cbnZhciB0cmFjayA9XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9iaiwgcmVwbGFjZXIpIHtcblx0ZnVuY3Rpb24gcmVwbGFjZShrLCB2KSB7XG5cdFx0dmFyIG52YWw7XG5cdFx0aWYgKHR5cGVvZiByZXBsYWNlciA9PT0gXCJmdW5jdGlvblwiKSBudmFsID0gcmVwbGFjZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRpZiAodHlwZW9mIG52YWwgPT09IFwidW5kZWZpbmVkXCIgJiYgdHlwZW9mIHYgIT09IFwidW5kZWZpbmVkXCIpIG52YWwgPSB0cmFjayh2KTtcblx0XHRyZXR1cm4gbnZhbDtcblx0fVxuXG5cdGlmIChBcnJheS5pc0FycmF5KG9iaikpIHJldHVybiB0cmFja0FycmF5KG9iaiwgcmVwbGFjZSlcblx0aWYgKGlzUGxhaW5PYmplY3Qob2JqKSkgcmV0dXJuIHRyYWNrT2JqZWN0KG9iaiwgcmVwbGFjZSk7XG5cdHJldHVybiBvYmo7XG59XG5cbnZhciB0cmFja1Byb3BlcnR5ID1cbnRyYWNrLnRyYWNrUHJvcGVydHkgPSBmdW5jdGlvbihvYmosIHByb3AsIHZhbHVlLCBvcHRpb25zKSB7XG5cdGlmICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiIHx8IG9iaiA9PSBudWxsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG9iamVjdCB0byBkZWZpbmUgdGhlIHJlYWN0aXZlIHByb3BlcnR5IG9uLlwiKTtcblx0fVxuXG5cdGlmICh0eXBlb2YgcHJvcCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBmb3IgcHJvcGVydHkgbmFtZS5cIik7XG5cblx0dmFyIGRlcCA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkob2JqLCBwcm9wLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5jb25maWd1cmFibGUgIT09IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmVudW1lcmFibGUgIT09IGZhbHNlLFxuXHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRpZiAodmFsICE9PSB2YWx1ZSkge1xuXHRcdFx0XHR2YWx1ZSA9IHZhbDtcblx0XHRcdFx0ZGVwLmNoYW5nZWQoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH0sXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdGRlcC5kZXBlbmQoKTtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cdH0pO1xuXG5cdHJldHVybiBvYmo7XG59XG5cbnZhciB0cmFja09iamVjdCA9XG50cmFjay50cmFja09iamVjdCA9IGZ1bmN0aW9uKHByb3BzLCByZXBsYWNlcikge1xuXHRpZiAocHJvcHMuX19yZWFjdGl2ZSkgcmV0dXJuIHByb3BzO1xuXG5cdHZhciB2YWx1ZXMgPSB7fTtcblx0dmFyIGRlcHMgPSB7fTtcblx0dmFyIG1haW5EZXAgPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKTtcblxuXHRmdW5jdGlvbiByZXBsYWNlKGN0eCwgbmFtZSwgdmFsdWUpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cdFx0cmV0dXJuIFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0eXBlb2YgcmVwbGFjZXIgPT09IFwiZnVuY3Rpb25cIiA/IHJlcGxhY2VyLmNhbGwoY3R4LCBuYW1lLCB2YWx1ZSkgOiB2YWx1ZTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldHRlcihuYW1lKSB7XG5cdFx0ZGVwc1tuYW1lXS5kZXBlbmQoKTtcblx0XHRyZXR1cm4gdmFsdWVzW25hbWVdO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dGVyKG5hbWUsIHZhbHVlKSB7XG5cdFx0dmFyIG9sZCA9IHZhbHVlc1tuYW1lXTtcblx0XHR2YWx1ZXNbbmFtZV0gPSByZXBsYWNlKHRoaXMsIG5hbWUsIHZhbHVlKTtcblxuXHRcdHZhciBkZXAgPSBkZXBzW25hbWVdO1xuXHRcdGlmIChkZXAgPT0gbnVsbCkgZGVwID0gZGVwc1tuYW1lXSA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXHRcdGlmIChvbGQgIT09IHZhbHVlc1tuYW1lXSkgZGVwLmNoYW5nZWQoKTtcblxuXHRcdG1haW5EZXAuY2hhbmdlZCgpO1xuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHR2YXIgX3Byb3RvID0gdHlwZW9mIHByb3BzLmNvbnN0cnVjdG9yID09PSBcImZ1bmN0aW9uXCIgPyBPYmplY3QuY3JlYXRlKHByb3BzLmNvbnN0cnVjdG9yLnByb3RvdHlwZSkgOiB7fTtcblxuXHRfcHJvdG8uZGVmaW5lUHJvcGVydHkgPSBmdW5jdGlvbihuYW1lLCB2YWx1ZSwgb3B0aW9ucykge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBuYW1lLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmNvbmZpZ3VyYWJsZSAhPT0gZmFsc2UsXG5cdFx0XHRlbnVtZXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5lbnVtZXJhYmxlICE9PSBmYWxzZSxcblx0XHRcdGdldDogZ2V0dGVyLmJpbmQodGhpcywgbmFtZSksXG5cdFx0XHRzZXQ6IHNldHRlci5iaW5kKHRoaXMsIG5hbWUpXG5cdFx0fSk7XG5cblx0XHR0aGlzW25hbWVdID0gdmFsdWU7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG5cblx0X3Byb3RvLmRlbGV0ZVByb3BlcnR5ID0gZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBkZXAgPSBkZXBzW25hbWVdO1xuXHRcdGlmIChkZWxldGUgdGhpc1tuYW1lXSkgeyAvLyBpbiBjYXNlIGNvbmZpZ3VyYWJsZSA9PT0gZmFsc2Vcblx0XHRcdGRlbGV0ZSB2YWx1ZXNbbmFtZV07XG5cdFx0XHRkZWxldGUgZGVwc1tuYW1lXTtcblx0XHRcdGlmIChkZXApIGRlcC5jaGFuZ2VkKCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdF9wcm90by50b0pTT04gPSBmdW5jdGlvbigpIHtcblx0XHRtYWluRGVwLmRlcGVuZCgpO1xuXHRcdHJldHVybiBjbG9uZSh2YWx1ZXMpO1xuXHR9O1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShfcHJvdG8sIFwiX19yZWFjdGl2ZVwiLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHR2YWx1ZTogdHJ1ZSxcblx0XHR3cml0ZWFibGU6IGZhbHNlXG5cdH0pO1xuXG5cdHZhciByb2JqID0gT2JqZWN0LmNyZWF0ZShfcHJvdG8pO1xuXG5cdGZvciAodmFyIGtleSBpbiBwcm9wcykge1xuXHRcdGlmIChoYXNPd24ocHJvcHMsIGtleSkpIHJvYmouZGVmaW5lUHJvcGVydHkoa2V5LCBwcm9wc1trZXldKTtcblx0fVxuXG5cdHJldHVybiByb2JqO1xufVxuXG52YXIgdHJhY2tBcnJheSA9XG50cmFjay50cmFja0FycmF5ID0gZnVuY3Rpb24oYXJyLCByZXBsYWNlcikge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkoYXJyKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGFycmF5LlwiKTtcblx0aWYgKGFyci5fX3JlYWN0aXZlKSByZXR1cm4gYXJyO1xuXG5cdHZhciBkZXBzID0geyBsZW5ndGg6IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpIH07XG5cdHZhciB2YWx1ZXMgPSB7fTtcblx0dmFyIG5hcnIgPSBwYXRjaEFycmF5KFtdKTtcblxuXHRmdW5jdGlvbiByZXBsYWNlKGN0eCwgbmFtZSwgdmFsdWUpIHtcblx0XHRpZiAodHlwZW9mIHZhbHVlID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cdFx0cmV0dXJuIFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiB0eXBlb2YgcmVwbGFjZXIgPT09IFwiZnVuY3Rpb25cIiA/IHJlcGxhY2VyLmNhbGwoY3R4LCBuYW1lLCB2YWx1ZSkgOiB2YWx1ZTtcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGdldHRlcihuYW1lKSB7XG5cdFx0ZGVwc1tuYW1lXS5kZXBlbmQoKTtcblx0XHRyZXR1cm4gdmFsdWVzW25hbWVdO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dGVyKG5hbWUsIHZhbHVlKSB7XG5cdFx0dmFyIG9sZCA9IHZhbHVlc1tuYW1lXTtcblx0XHR2YWx1ZXNbbmFtZV0gPSByZXBsYWNlKHRoaXMsIG5hbWUsIHZhbHVlKTtcblxuXHRcdHZhciBkZXAgPSBkZXBzW25hbWVdO1xuXHRcdGlmIChkZXAgPT0gbnVsbCkgZGVwID0gZGVwc1tuYW1lXSA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXHRcdGlmIChvbGQgIT09IHZhbHVlc1tuYW1lXSkgZGVwLmNoYW5nZWQoKTtcblxuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHRmdW5jdGlvbiBkZWZpbmUoaSkge1xuXHRcdHZhciBkZXA7XG5cblx0XHRpZiAodHlwZW9mIGkgPT09IFwibnVtYmVyXCIgJiYgaSA+PSBuYXJyLmxlbmd0aCkge1xuXHRcdFx0aWYgKChkZXAgPSBkZXBzW2ldKSAhPSBudWxsKSB7XG5cdFx0XHRcdGRlbGV0ZSBkZXBzW2ldO1xuXHRcdFx0fVxuXG5cdFx0XHRkZWxldGUgbmFycltpXTtcblx0XHRcdGRlbGV0ZSB2YWx1ZXNbaV07XG5cdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHNldHRlci5jYWxsKHRoaXMsIGksIG5hcnJbaV0pO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG5hcnIsIGkudG9TdHJpbmcoKSwge1xuXHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlLFxuXHRcdFx0ZW51bWVyYWJsZTogdHJ1ZSxcblx0XHRcdGdldDogZ2V0dGVyLmJpbmQobmFyciwgaSksXG5cdFx0XHRzZXQ6IHNldHRlci5iaW5kKG5hcnIsIGkpXG5cdFx0fSk7XG5cdH1cblxuXHRuYXJyLm9ic2VydmUoZnVuY3Rpb24oY2hnKSB7XG5cdFx0dmFyIGJhbGFuY2UsIHN0YXJ0LCBlbmQsIGxlbiwgaSwgcHJldmxlbjtcblxuXHRcdGlmIChjaGcgPT0gbnVsbCkgcmV0dXJuO1xuXG5cdFx0YmFsYW5jZSA9IGNoZy5hZGRlZCAtIGNoZy5yZW1vdmVkO1xuXHRcdGlmICghYmFsYW5jZSkgcmV0dXJuO1xuXG5cdFx0bGVuID0gbmFyci5sZW5ndGg7XG5cdFx0cHJldmxlbiA9IGxlbiAtIGJhbGFuY2U7XG5cdFx0c3RhcnQgPSBNYXRoLm1pbihwcmV2bGVuLCBsZW4pO1xuXHRcdGVuZCA9IE1hdGgubWF4KHByZXZsZW4sIGxlbik7XG5cblx0XHRmb3IgKGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSBkZWZpbmUoaSk7XG5cdFx0ZGVwcy5sZW5ndGguY2hhbmdlZCgpO1xuXHR9KTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgXCJfX3JlYWN0aXZlXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdHZhbHVlOiB0cnVlLFxuXHRcdHdyaXRlYWJsZTogZmFsc2Vcblx0fSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG5hcnIsIFwiJGxlbmd0aFwiLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwcy5sZW5ndGguZGVwZW5kKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5sZW5ndGg7XG5cdFx0fVxuXHR9KTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgXCJkZXBlbmRcIiwge1xuXHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdGRlcHMubGVuZ3RoLmRlcGVuZCgpO1xuXHRcdH1cblx0fSk7XG5cblx0bmFyci5wdXNoLmFwcGx5KG5hcnIsIGFycik7XG5cdHJldHVybiBuYXJyO1xufVxuIiwiLy8gYXJyYXkgd3JpdGUgb3BlcmF0aW9uc1xudmFyIG11dGF0b3JNZXRob2RzID0gWyAncG9wJywgJ3B1c2gnLCAncmV2ZXJzZScsICdzaGlmdCcsICdzb3J0JywgJ3NwbGljZScsICd1bnNoaWZ0JyBdO1xuXG4vLyBwYXRjaGVzIGFuIGFycmF5IHNvIHdlIGNhbiBsaXN0ZW4gdG8gd3JpdGUgb3BlcmF0aW9uc1xudmFyIHBhdGNoQXJyYXkgPVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihhcnIpIHtcblx0aWYgKGFyci5fcGF0Y2hlZCkgcmV0dXJuIGFycjtcblxuXHR2YXIgcGF0Y2hlZEFycmF5UHJvdG8gPSBbXSxcblx0XHRvYnNlcnZlcnMgPSBbXTtcblxuXHRtdXRhdG9yTWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkocGF0Y2hlZEFycmF5UHJvdG8sIG1ldGhvZE5hbWUsIHtcblx0XHRcdHZhbHVlOiBtZXRob2Rcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIG1ldGhvZCgpIHtcblx0XHRcdHZhciBzcGxpY2VFcXVpdmFsZW50LCBzdW1tYXJ5LCBhcmdzLCByZXM7XG5cblx0XHRcdGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuXG5cdFx0XHQvLyBjb252ZXJ0IHRoZSBvcGVyYXRpb24gaW50byBhIHNwbGljZVxuXHRcdFx0c3BsaWNlRXF1aXZhbGVudCA9IGdldFNwbGljZUVxdWl2YWxlbnQodGhpcywgbWV0aG9kTmFtZSwgYXJncyk7XG5cdFx0XHRzdW1tYXJ5ID0gc3VtbWFyaXNlU3BsaWNlT3BlcmF0aW9uKHRoaXMsIHNwbGljZUVxdWl2YWxlbnQpO1xuXG5cdFx0XHQvLyBydW4gdGhlIGludGVuZGVkIG1ldGhvZFxuXHRcdFx0cmVzID0gQXJyYXkucHJvdG90eXBlW21ldGhvZE5hbWVdLmFwcGx5KHRoaXMsIGFyZ3MpO1xuXG5cdFx0XHQvLyBjYWxsIHRoZSBvYmVyc3ZzZXJzXG5cdFx0XHRvYnNlcnZlcnMuZm9yRWFjaChmdW5jdGlvbihmbikge1xuXHRcdFx0XHRmbi5jYWxsKHRoaXMsIHN1bW1hcnkpO1xuXHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdC8vIHJldHVybiB0aGUgcmVzdWx0IG9mIHRoZSBtZXRob2Rcblx0XHRcdHJldHVybiByZXM7XG5cdFx0fTtcblx0fSk7XG5cblx0aWYgKCh7fSkuX19wcm90b19fKSBhcnIuX19wcm90b19fID0gcGF0Y2hlZEFycmF5UHJvdG87XG5cdGVsc2Uge1xuXHRcdG11dGF0b3JNZXRob2RzLmZvckVhY2goZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuXHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGFyciwgbWV0aG9kTmFtZSwge1xuXHRcdFx0XHR2YWx1ZTogcGF0Y2hlZEFycmF5UHJvdG9bbWV0aG9kTmFtZV0sXG5cdFx0XHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHR2YXIgZXh0cmFzID0ge1xuXHRcdF9wYXRjaGVkOiB0cnVlLFxuXHRcdG9ic2VydmU6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiB0byBvYnNlcnZlIHdpdGguXCIpO1xuXHRcdFx0b2JzZXJ2ZXJzLnB1c2goZm4pO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSxcblx0XHRzdG9wT2JzZXJ2aW5nOiBmdW5jdGlvbihmbikge1xuXHRcdFx0dmFyIGluZGV4ID0gb2JzZXJ2ZXJzLmluZGV4T2YoZm4pO1xuXHRcdFx0aWYgKGluZGV4ID4gLTEpIG9ic2VydmVycy5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXHR9O1xuXG5cdGZvciAodmFyIGsgaW4gZXh0cmFzKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGFyciwgaywge1xuXHRcdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdFx0dmFsdWU6IGV4dHJhc1trXSxcblx0XHRcdHdyaXRlYWJsZTogZmFsc2Vcblx0XHR9KTtcblx0fVxuXG5cdHJldHVybiBhcnI7XG59XG5cbi8vIGNvbnZlcnRzIGFycmF5IHdyaXRlIG9wZXJhdGlvbnMgaW50byBzcGxpY2UgZXF1aXZhbGVudCBhcmd1bWVudHNcbnZhciBnZXRTcGxpY2VFcXVpdmFsZW50ID1cbnBhdGNoQXJyYXkuZ2V0U3BsaWNlRXF1aXZhbGVudCA9IGZ1bmN0aW9uICggYXJyYXksIG1ldGhvZE5hbWUsIGFyZ3MgKSB7XG5cdHN3aXRjaCAoIG1ldGhvZE5hbWUgKSB7XG5cdFx0Y2FzZSAnc3BsaWNlJzpcblx0XHRcdHJldHVybiBhcmdzO1xuXG5cdFx0Y2FzZSAnc29ydCc6XG5cdFx0Y2FzZSAncmV2ZXJzZSc6XG5cdFx0XHRyZXR1cm4gbnVsbDtcblxuXHRcdGNhc2UgJ3BvcCc6XG5cdFx0XHRpZiAoIGFycmF5Lmxlbmd0aCApIHtcblx0XHRcdFx0cmV0dXJuIFsgLTEgXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXG5cdFx0Y2FzZSAncHVzaCc6XG5cdFx0XHRyZXR1cm4gWyBhcnJheS5sZW5ndGgsIDAgXS5jb25jYXQoIGFyZ3MgKTtcblxuXHRcdGNhc2UgJ3NoaWZ0Jzpcblx0XHRcdHJldHVybiBbIDAsIDEgXTtcblxuXHRcdGNhc2UgJ3Vuc2hpZnQnOlxuXHRcdFx0cmV0dXJuIFsgMCwgMCBdLmNvbmNhdCggYXJncyApO1xuXHR9XG59XG5cbi8vIHJldHVybnMgYSBzdW1tYXJ5IHBmIGhvdyBhbiBhcnJheSB3aWxsIGJlIGNoYW5nZWQgYWZ0ZXIgdGhlIHNwbGljZSBvcGVyYXRpb25cbnZhciBzdW1tYXJpc2VTcGxpY2VPcGVyYXRpb24gPVxucGF0Y2hBcnJheS5zdW1tYXJpc2VTcGxpY2VPcGVyYXRpb24gPSBmdW5jdGlvbiAoIGFycmF5LCBhcmdzICkge1xuXHR2YXIgaW5kZXgsIGFkZGVkSXRlbXMsIHJlbW92ZWRJdGVtcztcblxuXHRpZiAoIWFyZ3MpIHJldHVybiBudWxsO1xuXG5cdC8vIGZpZ3VyZSBvdXQgd2hlcmUgdGhlIGNoYW5nZXMgc3RhcnRlZC4uLlxuXHRpbmRleCA9ICsoIGFyZ3NbMF0gPCAwID8gYXJyYXkubGVuZ3RoICsgYXJnc1swXSA6IGFyZ3NbMF0gKTtcblxuXHQvLyAuLi5hbmQgaG93IG1hbnkgaXRlbXMgd2VyZSBhZGRlZCB0byBvciByZW1vdmVkIGZyb20gdGhlIGFycmF5XG5cdGFkZGVkSXRlbXMgPSBNYXRoLm1heCggMCwgYXJncy5sZW5ndGggLSAyICk7XG5cdHJlbW92ZWRJdGVtcyA9ICggYXJnc1sxXSAhPT0gdW5kZWZpbmVkID8gYXJnc1sxXSA6IGFycmF5Lmxlbmd0aCAtIGluZGV4ICk7XG5cblx0Ly8gSXQncyBwb3NzaWJsZSB0byBkbyBlLmcuIFsgMSwgMiwgMyBdLnNwbGljZSggMiwgMiApIC0gaS5lLiB0aGUgc2Vjb25kIGFyZ3VtZW50XG5cdC8vIG1lYW5zIHJlbW92aW5nIG1vcmUgaXRlbXMgZnJvbSB0aGUgZW5kIG9mIHRoZSBhcnJheSB0aGFuIHRoZXJlIGFyZS4gSW4gdGhlc2Vcblx0Ly8gY2FzZXMgd2UgbmVlZCB0byBjdXJiIEphdmFTY3JpcHQncyBlbnRodXNpYXNtIG9yIHdlJ2xsIGdldCBvdXQgb2Ygc3luY1xuXHRyZW1vdmVkSXRlbXMgPSBNYXRoLm1pbiggcmVtb3ZlZEl0ZW1zLCBhcnJheS5sZW5ndGggLSBpbmRleCApO1xuXG5cdHJldHVybiB7XG5cdFx0aW5kZXg6IGluZGV4LFxuXHRcdGFkZGVkOiBhZGRlZEl0ZW1zLFxuXHRcdHJlbW92ZWQ6IHJlbW92ZWRJdGVtc1xuXHR9O1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xudmFyIGhhc093blByb3AgPSBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmosIHByb3ApIHtcblx0cmV0dXJuIGhhc093blByb3AuY2FsbChvYmosIHByb3ApO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gb2JqO1xuICAgIFxuICAgIHZhciBjb3B5O1xuICAgIFxuICAgIGlmIChpc0FycmF5KG9iaikpIHtcbiAgICAgICAgdmFyIGxlbiA9IG9iai5sZW5ndGg7XG4gICAgICAgIGNvcHkgPSBBcnJheShsZW4pO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBjb3B5W2ldID0gb2JqW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIga2V5cyA9IG9iamVjdEtleXMob2JqKTtcbiAgICAgICAgY29weSA9IHt9O1xuICAgICAgICBcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBrZXlzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICAgICAgICBjb3B5W2tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29weTtcbn07XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICBpZiAoe30uaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICAgIH1cbiAgICByZXR1cm4ga2V5cztcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgICByZXR1cm4ge30udG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwidmFyIG5vdyA9IHJlcXVpcmUoJ3BlcmZvcm1hbmNlLW5vdycpXG4gICwgZ2xvYmFsID0gdHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyB7fSA6IHdpbmRvd1xuICAsIHZlbmRvcnMgPSBbJ21veicsICd3ZWJraXQnXVxuICAsIHN1ZmZpeCA9ICdBbmltYXRpb25GcmFtZSdcbiAgLCByYWYgPSBnbG9iYWxbJ3JlcXVlc3QnICsgc3VmZml4XVxuICAsIGNhZiA9IGdsb2JhbFsnY2FuY2VsJyArIHN1ZmZpeF0gfHwgZ2xvYmFsWydjYW5jZWxSZXF1ZXN0JyArIHN1ZmZpeF1cblxuZm9yKHZhciBpID0gMDsgaSA8IHZlbmRvcnMubGVuZ3RoICYmICFyYWY7IGkrKykge1xuICByYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgY2FmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsJyArIHN1ZmZpeF1cbiAgICAgIHx8IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxufVxuXG4vLyBTb21lIHZlcnNpb25zIG9mIEZGIGhhdmUgckFGIGJ1dCBub3QgY0FGXG5pZighcmFmIHx8ICFjYWYpIHtcbiAgdmFyIGxhc3QgPSAwXG4gICAgLCBpZCA9IDBcbiAgICAsIHF1ZXVlID0gW11cbiAgICAsIGZyYW1lRHVyYXRpb24gPSAxMDAwIC8gNjBcblxuICByYWYgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIGlmKHF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIF9ub3cgPSBub3coKVxuICAgICAgICAsIG5leHQgPSBNYXRoLm1heCgwLCBmcmFtZUR1cmF0aW9uIC0gKF9ub3cgLSBsYXN0KSlcbiAgICAgIGxhc3QgPSBuZXh0ICsgX25vd1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGNwID0gcXVldWUuc2xpY2UoMClcbiAgICAgICAgLy8gQ2xlYXIgcXVldWUgaGVyZSB0byBwcmV2ZW50XG4gICAgICAgIC8vIGNhbGxiYWNrcyBmcm9tIGFwcGVuZGluZyBsaXN0ZW5lcnNcbiAgICAgICAgLy8gdG8gdGhlIGN1cnJlbnQgZnJhbWUncyBxdWV1ZVxuICAgICAgICBxdWV1ZS5sZW5ndGggPSAwXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmKCFjcFtpXS5jYW5jZWxsZWQpIHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgY3BbaV0uY2FsbGJhY2sobGFzdClcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LCBNYXRoLnJvdW5kKG5leHQpKVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHtcbiAgICAgIGhhbmRsZTogKytpZCxcbiAgICAgIGNhbGxiYWNrOiBjYWxsYmFjayxcbiAgICAgIGNhbmNlbGxlZDogZmFsc2VcbiAgICB9KVxuICAgIHJldHVybiBpZFxuICB9XG5cbiAgY2FmID0gZnVuY3Rpb24oaGFuZGxlKSB7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZihxdWV1ZVtpXS5oYW5kbGUgPT09IGhhbmRsZSkge1xuICAgICAgICBxdWV1ZVtpXS5jYW5jZWxsZWQgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gV3JhcCBpbiBhIG5ldyBmdW5jdGlvbiB0byBwcmV2ZW50XG4gIC8vIGBjYW5jZWxgIHBvdGVudGlhbGx5IGJlaW5nIGFzc2lnbmVkXG4gIC8vIHRvIHRoZSBuYXRpdmUgckFGIGZ1bmN0aW9uXG4gIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZuKVxufVxubW9kdWxlLmV4cG9ydHMuY2FuY2VsID0gZnVuY3Rpb24oKSB7XG4gIGNhZi5hcHBseShnbG9iYWwsIGFyZ3VtZW50cylcbn1cbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0IDEuNy4xXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBnZXROYW5vU2Vjb25kcywgaHJ0aW1lLCBsb2FkVGltZTtcblxuICBpZiAoKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwZXJmb3JtYW5jZSAhPT0gbnVsbCkgJiYgcGVyZm9ybWFuY2Uubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB9O1xuICB9IGVsc2UgaWYgKCh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzICE9PSBudWxsKSAmJiBwcm9jZXNzLmhydGltZSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gKGdldE5hbm9TZWNvbmRzKCkgLSBsb2FkVGltZSkgLyAxZTY7XG4gICAgfTtcbiAgICBocnRpbWUgPSBwcm9jZXNzLmhydGltZTtcbiAgICBnZXROYW5vU2Vjb25kcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGhyO1xuICAgICAgaHIgPSBocnRpbWUoKTtcbiAgICAgIHJldHVybiBoclswXSAqIDFlOSArIGhyWzFdO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBnZXROYW5vU2Vjb25kcygpO1xuICB9IGVsc2UgaWYgKERhdGUubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBEYXRlLm5vdygpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IERhdGUubm93KCk7XG4gIH0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgfVxuXG59KS5jYWxsKHRoaXMpO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZSgnX3Byb2Nlc3MnKSlcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb24vanNvbjtjaGFyc2V0OnV0Zi04O2Jhc2U2NCxleUoyWlhKemFXOXVJam96TENKemIzVnlZMlZ6SWpwYkltNXZaR1ZmYlc5a2RXeGxjeTkwY21GamEzSXZibTlrWlY5dGIyUjFiR1Z6TDNKaFppOXViMlJsWDIxdlpIVnNaWE12Y0dWeVptOXliV0Z1WTJVdGJtOTNMMnhwWWk5d1pYSm1iM0p0WVc1alpTMXViM2N1YW5NaVhTd2libUZ0WlhNaU9sdGRMQ0p0WVhCd2FXNW5jeUk2SWp0QlFVRkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFTSXNJbVpwYkdVaU9pSm5aVzVsY21GMFpXUXVhbk1pTENKemIzVnlZMlZTYjI5MElqb2lJaXdpYzI5MWNtTmxjME52Ym5SbGJuUWlPbHNpTHk4Z1IyVnVaWEpoZEdWa0lHSjVJRU52Wm1abFpWTmpjbWx3ZENBeExqY3VNVnh1S0daMWJtTjBhVzl1S0NrZ2UxeHVJQ0IyWVhJZ1oyVjBUbUZ1YjFObFkyOXVaSE1zSUdoeWRHbHRaU3dnYkc5aFpGUnBiV1U3WEc1Y2JpQWdhV1lnS0NoMGVYQmxiMllnY0dWeVptOXliV0Z1WTJVZ0lUMDlJRndpZFc1a1pXWnBibVZrWENJZ0ppWWdjR1Z5Wm05eWJXRnVZMlVnSVQwOUlHNTFiR3dwSUNZbUlIQmxjbVp2Y20xaGJtTmxMbTV2ZHlrZ2UxeHVJQ0FnSUcxdlpIVnNaUzVsZUhCdmNuUnpJRDBnWm5WdVkzUnBiMjRvS1NCN1hHNGdJQ0FnSUNCeVpYUjFjbTRnY0dWeVptOXliV0Z1WTJVdWJtOTNLQ2s3WEc0Z0lDQWdmVHRjYmlBZ2ZTQmxiSE5sSUdsbUlDZ29kSGx3Wlc5bUlIQnliMk5sYzNNZ0lUMDlJRndpZFc1a1pXWnBibVZrWENJZ0ppWWdjSEp2WTJWemN5QWhQVDBnYm5Wc2JDa2dKaVlnY0hKdlkyVnpjeTVvY25ScGJXVXBJSHRjYmlBZ0lDQnRiMlIxYkdVdVpYaHdiM0owY3lBOUlHWjFibU4wYVc5dUtDa2dlMXh1SUNBZ0lDQWdjbVYwZFhKdUlDaG5aWFJPWVc1dlUyVmpiMjVrY3lncElDMGdiRzloWkZScGJXVXBJQzhnTVdVMk8xeHVJQ0FnSUgwN1hHNGdJQ0FnYUhKMGFXMWxJRDBnY0hKdlkyVnpjeTVvY25ScGJXVTdYRzRnSUNBZ1oyVjBUbUZ1YjFObFkyOXVaSE1nUFNCbWRXNWpkR2x2YmlncElIdGNiaUFnSUNBZ0lIWmhjaUJvY2p0Y2JpQWdJQ0FnSUdoeUlEMGdhSEowYVcxbEtDazdYRzRnSUNBZ0lDQnlaWFIxY200Z2FISmJNRjBnS2lBeFpUa2dLeUJvY2xzeFhUdGNiaUFnSUNCOU8xeHVJQ0FnSUd4dllXUlVhVzFsSUQwZ1oyVjBUbUZ1YjFObFkyOXVaSE1vS1R0Y2JpQWdmU0JsYkhObElHbG1JQ2hFWVhSbExtNXZkeWtnZTF4dUlDQWdJRzF2WkhWc1pTNWxlSEJ2Y25SeklEMGdablZ1WTNScGIyNG9LU0I3WEc0Z0lDQWdJQ0J5WlhSMWNtNGdSR0YwWlM1dWIzY29LU0F0SUd4dllXUlVhVzFsTzF4dUlDQWdJSDA3WEc0Z0lDQWdiRzloWkZScGJXVWdQU0JFWVhSbExtNXZkeWdwTzF4dUlDQjlJR1ZzYzJVZ2UxeHVJQ0FnSUcxdlpIVnNaUzVsZUhCdmNuUnpJRDBnWm5WdVkzUnBiMjRvS1NCN1hHNGdJQ0FnSUNCeVpYUjFjbTRnYm1WM0lFUmhkR1VvS1M1blpYUlVhVzFsS0NrZ0xTQnNiMkZrVkdsdFpUdGNiaUFnSUNCOU8xeHVJQ0FnSUd4dllXUlVhVzFsSUQwZ2JtVjNJRVJoZEdVb0tTNW5aWFJVYVcxbEtDazdYRzRnSUgxY2JseHVmU2t1WTJGc2JDaDBhR2x6S1R0Y2JpSmRmUT09IiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iLzY5Njg3NmIxODQ4ZTRkNmE5MjAxNDM0MjJjMmM1MGM0NTAxYzg1YTMvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vLyBjaGVjayBmb3IgZ2xvYmFsIGFuZCB1c2UgdGhhdCBvbmUgaW5zdGVhZCBvZiBsb2FkaW5nIGEgbmV3IG9uZVxuaWYgKHR5cGVvZiBnbG9iYWwuVHJhY2tyICE9PSBcInVuZGVmaW5lZFwiKSB7XG5cdG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsLlRyYWNrcjtcblx0cmV0dXJuO1xufVxuXG4vKipcbiAqIEBuYW1lc3BhY2UgVHJhY2tyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja3ItcmVsYXRlZCBtZXRob2RzLlxuICovXG52YXIgVHJhY2tyID0gZ2xvYmFsLlRyYWNrciA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWN0aXZlXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGVyZSBpcyBhIGN1cnJlbnQgY29tcHV0YXRpb24sIG1lYW5pbmcgdGhhdCBkZXBlbmRlbmNpZXMgb24gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIHdpbGwgYmUgdHJhY2tlZCBhbmQgcG90ZW50aWFsbHkgY2F1c2UgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gdG8gYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLmFjdGl2ZSA9IGZhbHNlO1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2N1cnJlbnRjb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLCBvciBgbnVsbGAgaWYgdGhlcmUgaXNuJ3Qgb25lLlx0VGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgdGhlIFtgVHJhY2tyLkNvbXB1dGF0aW9uYF0oI3RyYWNrZXJfY29tcHV0YXRpb24pIG9iamVjdCBjcmVhdGVkIGJ5IHRoZSBpbm5lcm1vc3QgYWN0aXZlIGNhbGwgdG8gYFRyYWNrci5hdXRvcnVuYCwgYW5kIGl0J3MgdGhlIGNvbXB1dGF0aW9uIHRoYXQgZ2FpbnMgZGVwZW5kZW5jaWVzIHdoZW4gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFyZSBhY2Nlc3NlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtUcmFja3IuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBudWxsO1xuXG4vLyBSZWZlcmVuY2VzIHRvIGFsbCBjb21wdXRhdGlvbnMgY3JlYXRlZCB3aXRoaW4gdGhlIFRyYWNrciBieSBpZC5cbi8vIEtlZXBpbmcgdGhlc2UgcmVmZXJlbmNlcyBvbiBhbiB1bmRlcnNjb3JlIHByb3BlcnR5IGdpdmVzIG1vcmUgY29udHJvbCB0b1xuLy8gdG9vbGluZyBhbmQgcGFja2FnZXMgZXh0ZW5kaW5nIFRyYWNrciB3aXRob3V0IGluY3JlYXNpbmcgdGhlIEFQSSBzdXJmYWNlLlxuLy8gVGhlc2UgY2FuIHVzZWQgdG8gbW9ua2V5LXBhdGNoIGNvbXB1dGF0aW9ucywgdGhlaXIgZnVuY3Rpb25zLCB1c2Vcbi8vIGNvbXB1dGF0aW9uIGlkcyBmb3IgdHJhY2tpbmcsIGV0Yy5cblRyYWNrci5fY29tcHV0YXRpb25zID0ge307XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gYztcblx0VHJhY2tyLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG52YXIgX2RlYnVnRnVuYyA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuICh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5lcnJvciA/XG5cdFx0XHQgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmVycm9yLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuXHRcdFx0IGZ1bmN0aW9uICgpIHt9O1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcblx0aWYgKHRocm93Rmlyc3RFcnJvcikge1xuXHRcdHRocm93IGU7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIHByaW50QXJncyA9IFtcIkV4Y2VwdGlvbiBmcm9tIFRyYWNrciBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIl07XG5cdFx0aWYgKGUuc3RhY2sgJiYgZS5tZXNzYWdlICYmIGUubmFtZSkge1xuXHRcdFx0dmFyIGlkeCA9IGUuc3RhY2suaW5kZXhPZihlLm1lc3NhZ2UpO1xuXHRcdFx0aWYgKGlkeCA8IDAgfHwgaWR4ID4gZS5uYW1lLmxlbmd0aCArIDIpIHsgLy8gY2hlY2sgZm9yIFwiRXJyb3I6IFwiXG5cdFx0XHRcdC8vIG1lc3NhZ2UgaXMgbm90IHBhcnQgb2YgdGhlIHN0YWNrXG5cdFx0XHRcdHZhciBtZXNzYWdlID0gZS5uYW1lICsgXCI6IFwiICsgZS5tZXNzYWdlO1xuXHRcdFx0XHRwcmludEFyZ3MucHVzaChtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cHJpbnRBcmdzLnB1c2goZS5zdGFjayk7XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHByaW50QXJncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0X2RlYnVnRnVuYygpKHByaW50QXJnc1tpXSk7XG5cdFx0fVxuXHR9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcblx0cmV0dXJuIGY7XG59O1xuXG52YXIgbmV4dElkID0gMTtcbi8vIGNvbXB1dGF0aW9ucyB3aG9zZSBjYWxsYmFja3Mgd2Ugc2hvdWxkIGNhbGwgYXQgZmx1c2ggdGltZVxudmFyIHBlbmRpbmdDb21wdXRhdGlvbnMgPSBbXTtcbi8vIGB0cnVlYCBpZiBhIFRyYWNrci5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgd2lsbEZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGluIFRyYWNrci5mbHVzaCBub3dcbnZhciBpbkZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGNvbXB1dGluZyBhIGNvbXB1dGF0aW9uIG5vdywgZWl0aGVyIGZpcnN0IHRpbWVcbi8vIG9yIHJlY29tcHV0ZS5cdFRoaXMgbWF0Y2hlcyBUcmFja3IuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBUcmFja3Iubm9ucmVhY3RpdmUsIHdoaWNoIG51bGxmaWVzIGN1cnJlbnRDb21wdXRhdGlvbiBldmVuIHRob3VnaFxuLy8gYW4gZW5jbG9zaW5nIGNvbXB1dGF0aW9uIG1heSBzdGlsbCBiZSBydW5uaW5nLlxudmFyIGluQ29tcHV0ZSA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHRoZSBgX3Rocm93Rmlyc3RFcnJvcmAgb3B0aW9uIHdhcyBwYXNzZWQgaW4gdG8gdGhlIGNhbGxcbi8vIHRvIFRyYWNrci5mbHVzaCB0aGF0IHdlIGFyZSBpbi4gV2hlbiBzZXQsIHRocm93IHJhdGhlciB0aGFuIGxvZyB0aGVcbi8vIGZpcnN0IGVycm9yIGVuY291bnRlcmVkIHdoaWxlIGZsdXNoaW5nLiBCZWZvcmUgdGhyb3dpbmcgdGhlIGVycm9yLFxuLy8gZmluaXNoIGZsdXNoaW5nIChmcm9tIGEgZmluYWxseSBibG9jayksIGxvZ2dpbmcgYW55IHN1YnNlcXVlbnRcbi8vIGVycm9ycy5cbnZhciB0aHJvd0ZpcnN0RXJyb3IgPSBmYWxzZTtcblxudmFyIGFmdGVyRmx1c2hDYWxsYmFja3MgPSBbXTtcblxudmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHJlcXVpcmUoXCJyYWZcIik7XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG5cdGlmICghIHdpbGxGbHVzaCkge1xuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZShUcmFja3IuX3J1bkZsdXNoKTtcblx0XHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR9XG59O1xuXG4vLyBUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBBIENvbXB1dGF0aW9uIG9iamVjdCByZXByZXNlbnRzIGNvZGUgdGhhdCBpcyByZXBlYXRlZGx5IHJlcnVuXG4gKiBpbiByZXNwb25zZSB0b1xuICogcmVhY3RpdmUgZGF0YSBjaGFuZ2VzLiBDb21wdXRhdGlvbnMgZG9uJ3QgaGF2ZSByZXR1cm4gdmFsdWVzOyB0aGV5IGp1c3RcbiAqIHBlcmZvcm0gYWN0aW9ucywgc3VjaCBhcyByZXJlbmRlcmluZyBhIHRlbXBsYXRlIG9uIHRoZSBzY3JlZW4uIENvbXB1dGF0aW9uc1xuICogYXJlIGNyZWF0ZWQgdXNpbmcgVHJhY2tyLmF1dG9ydW4uIFVzZSBzdG9wIHRvIHByZXZlbnQgZnVydGhlciByZXJ1bm5pbmcgb2YgYVxuICogY29tcHV0YXRpb24uXG4gKiBAaW5zdGFuY2VuYW1lIGNvbXB1dGF0aW9uXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQsIG9wdGlvbnMpIHtcblx0aWYgKCEgY29uc3RydWN0aW5nQ29tcHV0YXRpb24pXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XCJUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgcHJpdmF0ZTsgdXNlIFRyYWNrci5hdXRvcnVuXCIpO1xuXHRjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG5cdHZhciBzZWxmID0gdGhpcztcblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cblx0ICogQGxvY3VzIENsaWVudFxuXHQgKiBAbWVtYmVyT2YgVHJhY2tyLkNvbXB1dGF0aW9uXG5cdCAqIEBpbnN0YW5jZVxuXHQgKiBAbmFtZVx0c3RvcHBlZFxuXHQgKi9cblx0c2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdGludmFsaWRhdGVkXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrci5hdXRvcnVuYCBpcyBjYWxsZWQsIGFuZCBmYWxzZSBvbiBzdWJzZXF1ZW50IHJlcnVucyBhbmQgYXQgb3RoZXIgdGltZXMuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdGZpcnN0UnVuXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5maXJzdFJ1biA9IHRydWU7XG5cblx0c2VsZi5faWQgPSBuZXh0SWQrKztcblx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG5cdHNlbGYuX29uU3RvcENhbGxiYWNrcyA9IFtdO1xuXHQvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG5cdC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuXHRzZWxmLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdHNlbGYuX2Z1bmMgPSBmO1xuXHRzZWxmLl9vbkVycm9yID0gb3B0aW9ucy5vbkVycm9yO1xuXHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHRzZWxmLl9jb250ZXh0ID0gb3B0aW9ucy5jb250ZXh0IHx8IG51bGw7XG5cblx0Ly8gUmVnaXN0ZXIgdGhlIGNvbXB1dGF0aW9uIHdpdGhpbiB0aGUgZ2xvYmFsIFRyYWNrci5cblx0VHJhY2tyLl9jb21wdXRhdGlvbnNbc2VsZi5faWRdID0gc2VsZjtcblxuXHR2YXIgZXJyb3JlZCA9IHRydWU7XG5cdHRyeSB7XG5cdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdGVycm9yZWQgPSBmYWxzZTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0aWYgKGVycm9yZWQpXG5cdFx0XHRzZWxmLnN0b3AoKTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLlx0VGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gaW52YWxpZGF0aW9uLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBpbnZhbGlkYXRlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MucHVzaCh7IGZuOiBmLCBjdHg6IGN0eCB9KTtcblx0fVxufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZWdpc3RlcnMgYGNhbGxiYWNrYCB0byBydW4gd2hlbiB0aGlzIGNvbXB1dGF0aW9uIGlzIHN0b3BwZWQsIG9yIHJ1bnMgaXQgaW1tZWRpYXRlbHkgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGFscmVhZHkgc3RvcHBlZC5cdFRoZSBjYWxsYmFjayBpcyBydW4gYWZ0ZXIgYW55IGBvbkludmFsaWRhdGVgIGNhbGxiYWNrcy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiBzdG9wLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBzdG9wcGVkLlxuICovXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLm9uU3RvcCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJvblN0b3AgcmVxdWlyZXMgYSBmdW5jdGlvblwiKTtcblxuXHRpZiAoc2VsZi5zdG9wcGVkKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25TdG9wQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlcyB0aGlzIGNvbXB1dGF0aW9uIHNvIHRoYXQgaXQgd2lsbCBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHQvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG5cdFx0Ly8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG5cdFx0aWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcblx0XHRcdHJlcXVpcmVGbHVzaCgpO1xuXHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuXHRcdH1cblxuXHRcdHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2Vcblx0XHQvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5cbi8qKlxuICogQHN1bW1hcnkgUHJldmVudHMgdGhpcyBjb21wdXRhdGlvbiBmcm9tIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKCEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0c2VsZi5zdG9wcGVkID0gdHJ1ZTtcblx0XHRzZWxmLmludmFsaWRhdGUoKTtcblx0XHQvLyBVbnJlZ2lzdGVyIGZyb20gZ2xvYmFsIFRyYWNrci5cblx0XHRkZWxldGUgVHJhY2tyLl9jb21wdXRhdGlvbnNbc2VsZi5faWRdO1xuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vblN0b3BDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uU3RvcENhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG5cdHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcblx0aW5Db21wdXRlID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0XHRpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fbmVlZHNSZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0cmV0dXJuIHNlbGYuaW52YWxpZGF0ZWQgJiYgISBzZWxmLnN0b3BwZWQ7XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9yZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRzZWxmLl9yZWNvbXB1dGluZyA9IHRydWU7XG5cdHRyeSB7XG5cdFx0aWYgKHNlbGYuX25lZWRzUmVjb21wdXRlKCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNlbGYuX2NvbXB1dGUoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHNlbGYuX29uRXJyb3IpIHtcblx0XHRcdFx0XHRzZWxmLl9vbkVycm9yKGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGZpbmFsbHkge1xuXHRcdHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cdH1cbn07XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2RlcGVuZGVuY3lcblxuLyoqXG4gKiBAc3VtbWFyeSBBIERlcGVuZGVuY3kgcmVwcmVzZW50cyBhbiBhdG9taWMgdW5pdCBvZiByZWFjdGl2ZSBkYXRhIHRoYXQgYVxuICogY29tcHV0YXRpb24gbWlnaHQgZGVwZW5kIG9uLiBSZWFjdGl2ZSBkYXRhIHNvdXJjZXMgc3VjaCBhcyBTZXNzaW9uIG9yXG4gKiBNaW5pbW9uZ28gaW50ZXJuYWxseSBjcmVhdGUgZGlmZmVyZW50IERlcGVuZGVuY3kgb2JqZWN0cyBmb3IgZGlmZmVyZW50XG4gKiBwaWVjZXMgb2YgZGF0YSwgZWFjaCBvZiB3aGljaCBtYXkgYmUgZGVwZW5kZWQgb24gYnkgbXVsdGlwbGUgY29tcHV0YXRpb25zLlxuICogV2hlbiB0aGUgZGF0YSBjaGFuZ2VzLCB0aGUgY29tcHV0YXRpb25zIGFyZSBpbnZhbGlkYXRlZC5cbiAqIEBjbGFzc1xuICogQGluc3RhbmNlTmFtZSBkZXBlbmRlbmN5XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5ID0gZnVuY3Rpb24gKCkge1xuXHR0aGlzLl9kZXBlbmRlbnRzQnlJZCA9IHt9O1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9kZXBlbmRcbi8vXG4vLyBBZGRzIGBjb21wdXRhdGlvbmAgdG8gdGhpcyBzZXQgaWYgaXQgaXMgbm90IGFscmVhZHlcbi8vIHByZXNlbnQuXHRSZXR1cm5zIHRydWUgaWYgYGNvbXB1dGF0aW9uYCBpcyBhIG5ldyBtZW1iZXIgb2YgdGhlIHNldC5cbi8vIElmIG5vIGFyZ3VtZW50LCBkZWZhdWx0cyB0byBjdXJyZW50Q29tcHV0YXRpb24sIG9yIGRvZXMgbm90aGluZ1xuLy8gaWYgdGhlcmUgaXMgbm8gY3VycmVudENvbXB1dGF0aW9uLlxuXG4vKipcbiAqIEBzdW1tYXJ5IERlY2xhcmVzIHRoYXQgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKG9yIGBmcm9tQ29tcHV0YXRpb25gIGlmIGdpdmVuKSBkZXBlbmRzIG9uIGBkZXBlbmRlbmN5YC5cdFRoZSBjb21wdXRhdGlvbiB3aWxsIGJlIGludmFsaWRhdGVkIHRoZSBuZXh0IHRpbWUgYGRlcGVuZGVuY3lgIGNoYW5nZXMuXG5cbklmIHRoZXJlIGlzIG5vIGN1cnJlbnQgY29tcHV0YXRpb24gYW5kIGBkZXBlbmQoKWAgaXMgY2FsbGVkIHdpdGggbm8gYXJndW1lbnRzLCBpdCBkb2VzIG5vdGhpbmcgYW5kIHJldHVybnMgZmFsc2UuXG5cblJldHVybnMgdHJ1ZSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYSBuZXcgZGVwZW5kZW50IG9mIGBkZXBlbmRlbmN5YCByYXRoZXIgdGhhbiBhbiBleGlzdGluZyBvbmUuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge1RyYWNrci5Db21wdXRhdGlvbn0gW2Zyb21Db21wdXRhdGlvbl0gQW4gb3B0aW9uYWwgY29tcHV0YXRpb24gZGVjbGFyZWQgdG8gZGVwZW5kIG9uIGBkZXBlbmRlbmN5YCBpbnN0ZWFkIG9mIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLlxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5kZXBlbmQgPSBmdW5jdGlvbiAoY29tcHV0YXRpb24pIHtcblx0aWYgKCEgY29tcHV0YXRpb24pIHtcblx0XHRpZiAoISBUcmFja3IuYWN0aXZlKVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXG5cdFx0Y29tcHV0YXRpb24gPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHR9XG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIGlkID0gY29tcHV0YXRpb24uX2lkO1xuXHRpZiAoISAoaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpKSB7XG5cdFx0c2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdID0gY29tcHV0YXRpb247XG5cdFx0Y29tcHV0YXRpb24ub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcblx0XHRcdGRlbGV0ZSBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF07XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9jaGFuZ2VkXG5cbi8qKlxuICogQHN1bW1hcnkgSW52YWxpZGF0ZSBhbGwgZGVwZW5kZW50IGNvbXB1dGF0aW9ucyBpbW1lZGlhdGVseSBhbmQgcmVtb3ZlIHRoZW0gYXMgZGVwZW5kZW50cy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0Zm9yICh2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0c2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdLmludmFsaWRhdGUoKTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfaGFzZGVwZW5kZW50c1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBEZXBlbmRlbmN5IGhhcyBvbmUgb3IgbW9yZSBkZXBlbmRlbnQgQ29tcHV0YXRpb25zLCB3aGljaCB3b3VsZCBiZSBpbnZhbGlkYXRlZCBpZiB0aGlzIERlcGVuZGVuY3kgd2VyZSB0byBjaGFuZ2UuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmhhc0RlcGVuZGVudHMgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0Zm9yKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcblx0XHRyZXR1cm4gdHJ1ZTtcblx0cmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9mbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFByb2Nlc3MgYWxsIHJlYWN0aXZlIHVwZGF0ZXMgaW1tZWRpYXRlbHkgYW5kIGVuc3VyZSB0aGF0IGFsbCBpbnZhbGlkYXRlZCBjb21wdXRhdGlvbnMgYXJlIHJlcnVuLlxuICogQGxvY3VzIENsaWVudFxuICovXG5UcmFja3IuZmx1c2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuXHRUcmFja3IuX3J1bkZsdXNoKHsgZmluaXNoU3luY2hyb25vdXNseTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0aHJvd0ZpcnN0RXJyb3I6IG9wdGlvbnMgJiYgb3B0aW9ucy5fdGhyb3dGaXJzdEVycm9yIH0pO1xufTtcblxuLy8gUnVuIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9ucyBhbmQgYWZ0ZXJGbHVzaCBjYWxsYmFja3MuXHRJZiB3ZSB3ZXJlIG5vdCBjYWxsZWRcbi8vIGRpcmVjdGx5IHZpYSBUcmFja3IuZmx1c2gsIHRoaXMgbWF5IHJldHVybiBiZWZvcmUgdGhleSdyZSBhbGwgZG9uZSB0byBhbGxvd1xuLy8gdGhlIGV2ZW50IGxvb3AgdG8gcnVuIGEgbGl0dGxlIGJlZm9yZSBjb250aW51aW5nLlxuVHJhY2tyLl9ydW5GbHVzaCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuXHQvLyBoYXZlIFNwYXJrKVxuXHQvL1xuXHQvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuXHQvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG5cdC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tyLmZsdXNoLlx0QXQgdGhlIG1vbWVudFxuXHQvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG5cdC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLlx0QW5kIHdlIGRvbid0IGhhdmVcblx0Ly8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG5cdC8vXG5cdC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcblx0aWYgKGluRmx1c2gpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja3IuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cblx0aWYgKGluQ29tcHV0ZSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tyLmF1dG9ydW5cIik7XG5cblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0aW5GbHVzaCA9IHRydWU7XG5cdHdpbGxGbHVzaCA9IHRydWU7XG5cdHRocm93Rmlyc3RFcnJvciA9ICEhIG9wdGlvbnMudGhyb3dGaXJzdEVycm9yO1xuXG5cdHZhciByZWNvbXB1dGVkQ291bnQgPSAwO1xuXHR2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcblx0XHRcdFx0XHQgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuXHRcdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHRjb21wLl9yZWNvbXB1dGUoKTtcblx0XHRcdFx0aWYgKGNvbXAuX25lZWRzUmVjb21wdXRlKCkpIHtcblx0XHRcdFx0XHRwZW5kaW5nQ29tcHV0YXRpb25zLnVuc2hpZnQoY29tcCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoISBvcHRpb25zLmZpbmlzaFN5bmNocm9ub3VzbHkgJiYgKytyZWNvbXB1dGVkQ291bnQgPiAxMDAwKSB7XG5cdFx0XHRcdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gY2FsbCBvbmUgYWZ0ZXJGbHVzaCBjYWxsYmFjaywgd2hpY2ggbWF5XG5cdFx0XHRcdC8vIGludmFsaWRhdGUgbW9yZSBjb21wdXRhdGlvbnNcblx0XHRcdFx0dmFyIGNiID0gYWZ0ZXJGbHVzaENhbGxiYWNrcy5zaGlmdCgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNiLmZuLmNhbGwoY2IuY3R4KTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdF90aHJvd09yTG9nKFwiYWZ0ZXJGbHVzaFwiLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmaW5pc2hlZFRyeSA9IHRydWU7XG5cdH0gZmluYWxseSB7XG5cdFx0aWYgKCEgZmluaXNoZWRUcnkpIHtcblx0XHRcdC8vIHdlJ3JlIGVycm9yaW5nIGR1ZSB0byB0aHJvd0ZpcnN0RXJyb3IgYmVpbmcgdHJ1ZS5cblx0XHRcdGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBUcmFja3IuZmx1c2goKWAgYWdhaW5cblx0XHRcdC8vIGZpbmlzaCBmbHVzaGluZ1xuXHRcdFx0VHJhY2tyLl9ydW5GbHVzaCh7XG5cdFx0XHRcdGZpbmlzaFN5bmNocm9ub3VzbHk6IG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSxcblx0XHRcdFx0dGhyb3dGaXJzdEVycm9yOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHdpbGxGbHVzaCA9IGZhbHNlO1xuXHRcdGluRmx1c2ggPSBmYWxzZTtcblx0XHRpZiAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHwgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdC8vIFdlJ3JlIHlpZWxkaW5nIGJlY2F1c2Ugd2UgcmFuIGEgYnVuY2ggb2YgY29tcHV0YXRpb25zIGFuZCB3ZSBhcmVuJ3Rcblx0XHRcdC8vIHJlcXVpcmVkIHRvIGZpbmlzaCBzeW5jaHJvbm91c2x5LCBzbyB3ZSdkIGxpa2UgdG8gZ2l2ZSB0aGUgZXZlbnQgbG9vcCBhXG5cdFx0XHQvLyBjaGFuY2UuIFdlIHNob3VsZCBmbHVzaCBhZ2FpbiBzb29uLlxuXHRcdFx0aWYgKG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJzdGlsbCBoYXZlIG1vcmUgdG8gZG8/XCIpO1x0Ly8gc2hvdWxkbid0IGhhcHBlblxuXHRcdFx0fVxuXHRcdFx0c2V0VGltZW91dChyZXF1aXJlRmx1c2gsIDEwKTtcblx0XHR9XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYXV0b3J1blxuLy9cbi8vIFJ1biBmKCkuIFJlY29yZCBpdHMgZGVwZW5kZW5jaWVzLiBSZXJ1biBpdCB3aGVuZXZlciB0aGVcbi8vIGRlcGVuZGVuY2llcyBjaGFuZ2UuXG4vL1xuLy8gUmV0dXJucyBhIG5ldyBDb21wdXRhdGlvbiwgd2hpY2ggaXMgYWxzbyBwYXNzZWQgdG8gZi5cbi8vXG4vLyBMaW5rcyB0aGUgY29tcHV0YXRpb24gdG8gdGhlIGN1cnJlbnQgY29tcHV0YXRpb25cbi8vIHNvIHRoYXQgaXQgaXMgc3RvcHBlZCBpZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZC5cblxuLyoqXG4gKiBAY2FsbGJhY2sgVHJhY2tyLkNvbXB1dGF0aW9uRnVuY3Rpb25cbiAqIEBwYXJhbSB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIG5vdyBhbmQgcmVydW4gaXQgbGF0ZXIgd2hlbmV2ZXIgaXRzIGRlcGVuZGVuY2llc1xuICogY2hhbmdlLiBSZXR1cm5zIGEgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgdG8gc3RvcCBvciBvYnNlcnZlIHRoZVxuICogcmVydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb25GdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlc1xuICogb25lIGFyZ3VtZW50OiB0aGUgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgd2lsbCBiZSByZXR1cm5lZC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMub25FcnJvciBPcHRpb25hbC4gVGhlIGZ1bmN0aW9uIHRvIHJ1biB3aGVuIGFuIGVycm9yXG4gKiBoYXBwZW5zIGluIHRoZSBDb21wdXRhdGlvbi4gVGhlIG9ubHkgYXJndW1lbnQgaXQgcmVjaWV2ZXMgaXMgdGhlIEVycm9yXG4gKiB0aHJvd24uIERlZmF1bHRzIHRvIHRoZSBlcnJvciBiZWluZyBsb2dnZWQgdG8gdGhlIGNvbnNvbGUuXG4gKiBAcmV0dXJucyB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG5UcmFja3IuYXV0b3J1biA9IGZ1bmN0aW9uIChmLCBvcHRpb25zLCBjdHgpIHtcblx0aWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuXHRcdHRocm93IG5ldyBFcnJvcignVHJhY2tyLmF1dG9ydW4gcmVxdWlyZXMgYSBmdW5jdGlvbiBhcmd1bWVudCcpO1xuXG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXHRpZiAoY3R4KSBvcHRpb25zLmNvbnRleHQgPSBjdHg7XG5cblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuXHR2YXIgYyA9IG5ldyBUcmFja3IuQ29tcHV0YXRpb24oXG5cdFx0ZiwgVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiwgb3B0aW9ucyk7XG5cblx0aWYgKFRyYWNrci5hY3RpdmUpXG5cdFx0VHJhY2tyLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRjLnN0b3AoKTtcblx0XHR9KTtcblxuXHRyZXR1cm4gYztcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfbm9ucmVhY3RpdmVcbi8vXG4vLyBSdW4gYGZgIHdpdGggbm8gY3VycmVudCBjb21wdXRhdGlvbiwgcmV0dXJuaW5nIHRoZSByZXR1cm4gdmFsdWVcbi8vIG9mIGBmYC5cdFVzZWQgdG8gdHVybiBvZmYgcmVhY3Rpdml0eSBmb3IgdGhlIGR1cmF0aW9uIG9mIGBmYCxcbi8vIHNvIHRoYXQgcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFjY2Vzc2VkIGJ5IGBmYCB3aWxsIG5vdCByZXN1bHQgaW4gYW55XG4vLyBjb21wdXRhdGlvbnMgYmVpbmcgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gd2l0aG91dCB0cmFja2luZyBkZXBlbmRlbmNpZXMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIEEgZnVuY3Rpb24gdG8gY2FsbCBpbW1lZGlhdGVseS5cbiAqL1xuVHJhY2tyLm5vblJlYWN0aXZlID1cblRyYWNrci5ub25yZWFjdGl2ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuXHR0cnkge1xuXHRcdHJldHVybiBmLmNhbGwoY3R4KTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuXHR9XG59O1xuXG4vLyBsaWtlIG5vbnJlYWN0aXZlIGJ1dCBtYWtlcyBhIGZ1bmN0aW9uIGluc3RlYWRcblRyYWNrci5ub25SZWFjdGFibGUgPVxuVHJhY2tyLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGYuYXBwbHkoY3R4LCBhcmdzKTtcblx0XHR9KTtcblx0fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IFtgb25JbnZhbGlkYXRlYF0oI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZSkgY2FsbGJhY2sgb24gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKHdoaWNoIG11c3QgZXhpc3QpLCB0byBiZSBjYWxsZWQgaW1tZWRpYXRlbHkgd2hlbiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZCBvciBzdG9wcGVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgaW52b2tlZCBhcyBgZnVuYyhjKWAsIHdoZXJlIGBjYCBpcyB0aGUgY29tcHV0YXRpb24gb24gd2hpY2ggdGhlIGNhbGxiYWNrIGlzIHJlZ2lzdGVyZWQuXG4gKi9cblRyYWNrci5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVHJhY2tyLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hZnRlcmZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgU2NoZWR1bGVzIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGR1cmluZyB0aGUgbmV4dCBmbHVzaCwgb3IgbGF0ZXIgaW4gdGhlIGN1cnJlbnQgZmx1c2ggaWYgb25lIGlzIGluIHByb2dyZXNzLCBhZnRlciBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGhhdmUgYmVlbiByZXJ1bi5cdFRoZSBmdW5jdGlvbiB3aWxsIGJlIHJ1biBvbmNlIGFuZCBub3Qgb24gc3Vic2VxdWVudCBmbHVzaGVzIHVubGVzcyBgYWZ0ZXJGbHVzaGAgaXMgY2FsbGVkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBjYWxsIGF0IGZsdXNoIHRpbWUuXG4gKi9cblRyYWNrci5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdHJlcXVpcmVGbHVzaCgpO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pXG4vLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247Y2hhcnNldDp1dGYtODtiYXNlNjQsZXlKMlpYSnphVzl1SWpvekxDSnpiM1Z5WTJWeklqcGJJbTV2WkdWZmJXOWtkV3hsY3k5MGNtRmphM0l2ZEhKaFkydHlMbXB6SWwwc0ltNWhiV1Z6SWpwYlhTd2liV0Z3Y0dsdVozTWlPaUk3UVVGQlFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFTSXNJbVpwYkdVaU9pSm5aVzVsY21GMFpXUXVhbk1pTENKemIzVnlZMlZTYjI5MElqb2lJaXdpYzI5MWNtTmxjME52Ym5SbGJuUWlPbHNpTHk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTljYmk4dklGQmhZMnRoWjJVZ1pHOWpjeUJoZENCb2RIUndPaTh2Wkc5amN5NXRaWFJsYjNJdVkyOXRMeU4wY21GamEyVnlJQzh2WEc0dkx5Qk1ZWE4wSUcxbGNtZGxPaUJvZEhSd2N6b3ZMMmRwZEdoMVlpNWpiMjB2YldWMFpXOXlMMjFsZEdWdmNpOWliRzlpTHpZNU5qZzNObUl4T0RRNFpUUmtObUU1TWpBeE5ETTBNakpqTW1NMU1HTTBOVEF4WXpnMVlUTXZjR0ZqYTJGblpYTXZkSEpoWTJ0bGNpOTBjbUZqYTJWeUxtcHpJQzh2WEc0dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2TDF4dVhHNHZMeUJqYUdWamF5Qm1iM0lnWjJ4dlltRnNJR0Z1WkNCMWMyVWdkR2hoZENCdmJtVWdhVzV6ZEdWaFpDQnZaaUJzYjJGa2FXNW5JR0VnYm1WM0lHOXVaVnh1YVdZZ0tIUjVjR1Z2WmlCbmJHOWlZV3d1VkhKaFkydHlJQ0U5UFNCY0luVnVaR1ZtYVc1bFpGd2lLU0I3WEc1Y2RHMXZaSFZzWlM1bGVIQnZjblJ6SUQwZ1oyeHZZbUZzTGxSeVlXTnJjanRjYmx4MGNtVjBkWEp1TzF4dWZWeHVYRzR2S2lwY2JpQXFJRUJ1WVcxbGMzQmhZMlVnVkhKaFkydHlYRzRnS2lCQWMzVnRiV0Z5ZVNCVWFHVWdibUZ0WlhOd1lXTmxJR1p2Y2lCVWNtRmphM0l0Y21Wc1lYUmxaQ0J0WlhSb2IyUnpMbHh1SUNvdlhHNTJZWElnVkhKaFkydHlJRDBnWjJ4dlltRnNMbFJ5WVdOcmNpQTlJRzF2WkhWc1pTNWxlSEJ2Y25SeklEMGdlMzA3WEc1Y2JpOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkzUnlZV05yWlhKZllXTjBhWFpsWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1ZISjFaU0JwWmlCMGFHVnlaU0JwY3lCaElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNHNJRzFsWVc1cGJtY2dkR2hoZENCa1pYQmxibVJsYm1OcFpYTWdiMjRnY21WaFkzUnBkbVVnWkdGMFlTQnpiM1Z5WTJWeklIZHBiR3dnWW1VZ2RISmhZMnRsWkNCaGJtUWdjRzkwWlc1MGFXRnNiSGtnWTJGMWMyVWdkR2hsSUdOMWNuSmxiblFnWTI5dGNIVjBZWFJwYjI0Z2RHOGdZbVVnY21WeWRXNHVYRzRnS2lCQWJHOWpkWE1nUTJ4cFpXNTBYRzRnS2lCQWRIbHdaU0I3UW05dmJHVmhibjFjYmlBcUwxeHVWSEpoWTJ0eUxtRmpkR2wyWlNBOUlHWmhiSE5sTzF4dVhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TjBjbUZqYTJWeVgyTjFjbkpsYm5SamIyMXdkWFJoZEdsdmJseHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRlJvWlNCamRYSnlaVzUwSUdOdmJYQjFkR0YwYVc5dUxDQnZjaUJnYm5Wc2JHQWdhV1lnZEdobGNtVWdhWE51SjNRZ2IyNWxMbHgwVkdobElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNGdhWE1nZEdobElGdGdWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVZRjBvSTNSeVlXTnJaWEpmWTI5dGNIVjBZWFJwYjI0cElHOWlhbVZqZENCamNtVmhkR1ZrSUdKNUlIUm9aU0JwYm01bGNtMXZjM1FnWVdOMGFYWmxJR05oYkd3Z2RHOGdZRlJ5WVdOcmNpNWhkWFJ2Y25WdVlDd2dZVzVrSUdsMEozTWdkR2hsSUdOdmJYQjFkR0YwYVc5dUlIUm9ZWFFnWjJGcGJuTWdaR1Z3Wlc1a1pXNWphV1Z6SUhkb1pXNGdjbVZoWTNScGRtVWdaR0YwWVNCemIzVnlZMlZ6SUdGeVpTQmhZMk5sYzNObFpDNWNiaUFxSUVCc2IyTjFjeUJEYkdsbGJuUmNiaUFxSUVCMGVYQmxJSHRVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjU5WEc0Z0tpOWNibFJ5WVdOcmNpNWpkWEp5Wlc1MFEyOXRjSFYwWVhScGIyNGdQU0J1ZFd4c08xeHVYRzR2THlCU1pXWmxjbVZ1WTJWeklIUnZJR0ZzYkNCamIyMXdkWFJoZEdsdmJuTWdZM0psWVhSbFpDQjNhWFJvYVc0Z2RHaGxJRlJ5WVdOcmNpQmllU0JwWkM1Y2JpOHZJRXRsWlhCcGJtY2dkR2hsYzJVZ2NtVm1aWEpsYm1ObGN5QnZiaUJoYmlCMWJtUmxjbk5qYjNKbElIQnliM0JsY25SNUlHZHBkbVZ6SUcxdmNtVWdZMjl1ZEhKdmJDQjBiMXh1THk4Z2RHOXZiR2x1WnlCaGJtUWdjR0ZqYTJGblpYTWdaWGgwWlc1a2FXNW5JRlJ5WVdOcmNpQjNhWFJvYjNWMElHbHVZM0psWVhOcGJtY2dkR2hsSUVGUVNTQnpkWEptWVdObExseHVMeThnVkdobGMyVWdZMkZ1SUhWelpXUWdkRzhnYlc5dWEyVjVMWEJoZEdOb0lHTnZiWEIxZEdGMGFXOXVjeXdnZEdobGFYSWdablZ1WTNScGIyNXpMQ0IxYzJWY2JpOHZJR052YlhCMWRHRjBhVzl1SUdsa2N5Qm1iM0lnZEhKaFkydHBibWNzSUdWMFl5NWNibFJ5WVdOcmNpNWZZMjl0Y0hWMFlYUnBiMjV6SUQwZ2UzMDdYRzVjYm5aaGNpQnpaWFJEZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRnUFNCbWRXNWpkR2x2YmlBb1l5a2dlMXh1WEhSVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1SUQwZ1l6dGNibHgwVkhKaFkydHlMbUZqZEdsMlpTQTlJQ0VoSUdNN1hHNTlPMXh1WEc1MllYSWdYMlJsWW5WblJuVnVZeUE5SUdaMWJtTjBhVzl1SUNncElIdGNibHgwY21WMGRYSnVJQ2gwZVhCbGIyWWdZMjl1YzI5c1pTQWhQVDBnWENKMWJtUmxabWx1WldSY0lpa2dKaVlnWTI5dWMyOXNaUzVsY25KdmNpQS9YRzVjZEZ4MFhIUWdablZ1WTNScGIyNGdLQ2tnZXlCamIyNXpiMnhsTG1WeWNtOXlMbUZ3Y0d4NUtHTnZibk52YkdVc0lHRnlaM1Z0Wlc1MGN5azdJSDBnT2x4dVhIUmNkRngwSUdaMWJtTjBhVzl1SUNncElIdDlPMXh1ZlR0Y2JseHVkbUZ5SUY5MGFISnZkMDl5VEc5bklEMGdablZ1WTNScGIyNGdLR1p5YjIwc0lHVXBJSHRjYmx4MGFXWWdLSFJvY205M1JtbHljM1JGY25KdmNpa2dlMXh1WEhSY2RIUm9jbTkzSUdVN1hHNWNkSDBnWld4elpTQjdYRzVjZEZ4MGRtRnlJSEJ5YVc1MFFYSm5jeUE5SUZ0Y0lrVjRZMlZ3ZEdsdmJpQm1jbTl0SUZSeVlXTnJjaUJjSWlBcklHWnliMjBnS3lCY0lpQm1kVzVqZEdsdmJqcGNJbDA3WEc1Y2RGeDBhV1lnS0dVdWMzUmhZMnNnSmlZZ1pTNXRaWE56WVdkbElDWW1JR1V1Ym1GdFpTa2dlMXh1WEhSY2RGeDBkbUZ5SUdsa2VDQTlJR1V1YzNSaFkyc3VhVzVrWlhoUFppaGxMbTFsYzNOaFoyVXBPMXh1WEhSY2RGeDBhV1lnS0dsa2VDQThJREFnZkh3Z2FXUjRJRDRnWlM1dVlXMWxMbXhsYm1kMGFDQXJJRElwSUhzZ0x5OGdZMmhsWTJzZ1ptOXlJRndpUlhKeWIzSTZJRndpWEc1Y2RGeDBYSFJjZEM4dklHMWxjM05oWjJVZ2FYTWdibTkwSUhCaGNuUWdiMllnZEdobElITjBZV05yWEc1Y2RGeDBYSFJjZEhaaGNpQnRaWE56WVdkbElEMGdaUzV1WVcxbElDc2dYQ0k2SUZ3aUlDc2daUzV0WlhOellXZGxPMXh1WEhSY2RGeDBYSFJ3Y21sdWRFRnlaM011Y0hWemFDaHRaWE56WVdkbEtUdGNibHgwWEhSY2RIMWNibHgwWEhSOVhHNWNkRngwY0hKcGJuUkJjbWR6TG5CMWMyZ29aUzV6ZEdGamF5azdYRzVjYmx4MFhIUm1iM0lnS0haaGNpQnBJRDBnTURzZ2FTQThJSEJ5YVc1MFFYSm5jeTVzWlc1bmRHZzdJR2tyS3lrZ2UxeHVYSFJjZEZ4MFgyUmxZblZuUm5WdVl5Z3BLSEJ5YVc1MFFYSm5jMXRwWFNrN1hHNWNkRngwZlZ4dVhIUjlYRzU5TzF4dVhHNHZMeUJVWVd0bGN5QmhJR1oxYm1OMGFXOXVJR0JtWUN3Z1lXNWtJSGR5WVhCeklHbDBJR2x1SUdFZ1lFMWxkR1Z2Y2k1ZmJtOVphV1ZzWkhOQmJHeHZkMlZrWUZ4dUx5OGdZbXh2WTJzZ2FXWWdkMlVnWVhKbElISjFibTVwYm1jZ2IyNGdkR2hsSUhObGNuWmxjaTRnVDI0Z2RHaGxJR05zYVdWdWRDd2djbVYwZFhKdWN5QjBhR1ZjYmk4dklHOXlhV2RwYm1Gc0lHWjFibU4wYVc5dUlDaHphVzVqWlNCZ1RXVjBaVzl5TGw5dWIxbHBaV3hrYzBGc2JHOTNaV1JnSUdseklHRmNiaTh2SUc1dkxXOXdLUzRnVkdocGN5Qm9ZWE1nZEdobElHSmxibVZtYVhRZ2IyWWdibTkwSUdGa1pHbHVaeUJoYmlCMWJtNWxZMlZ6YzJGeWVTQnpkR0ZqYTF4dUx5OGdabkpoYldVZ2IyNGdkR2hsSUdOc2FXVnVkQzVjYm5aaGNpQjNhWFJvVG05WmFXVnNaSE5CYkd4dmQyVmtJRDBnWm5WdVkzUnBiMjRnS0dZcElIdGNibHgwY21WMGRYSnVJR1k3WEc1OU8xeHVYRzUyWVhJZ2JtVjRkRWxrSUQwZ01UdGNiaTh2SUdOdmJYQjFkR0YwYVc5dWN5QjNhRzl6WlNCallXeHNZbUZqYTNNZ2QyVWdjMmh2ZFd4a0lHTmhiR3dnWVhRZ1pteDFjMmdnZEdsdFpWeHVkbUZ5SUhCbGJtUnBibWREYjIxd2RYUmhkR2x2Ym5NZ1BTQmJYVHRjYmk4dklHQjBjblZsWUNCcFppQmhJRlJ5WVdOcmNpNW1iSFZ6YUNCcGN5QnpZMmhsWkhWc1pXUXNJRzl5SUdsbUlIZGxJR0Z5WlNCcGJpQlVjbUZqYTNJdVpteDFjMmdnYm05M1hHNTJZWElnZDJsc2JFWnNkWE5vSUQwZ1ptRnNjMlU3WEc0dkx5QmdkSEoxWldBZ2FXWWdkMlVnWVhKbElHbHVJRlJ5WVdOcmNpNW1iSFZ6YUNCdWIzZGNiblpoY2lCcGJrWnNkWE5vSUQwZ1ptRnNjMlU3WEc0dkx5QmdkSEoxWldBZ2FXWWdkMlVnWVhKbElHTnZiWEIxZEdsdVp5QmhJR052YlhCMWRHRjBhVzl1SUc1dmR5d2daV2wwYUdWeUlHWnBjbk4wSUhScGJXVmNiaTh2SUc5eUlISmxZMjl0Y0hWMFpTNWNkRlJvYVhNZ2JXRjBZMmhsY3lCVWNtRmphM0l1WVdOMGFYWmxJSFZ1YkdWemN5QjNaU0JoY21VZ2FXNXphV1JsWEc0dkx5QlVjbUZqYTNJdWJtOXVjbVZoWTNScGRtVXNJSGRvYVdOb0lHNTFiR3htYVdWeklHTjFjbkpsYm5SRGIyMXdkWFJoZEdsdmJpQmxkbVZ1SUhSb2IzVm5hRnh1THk4Z1lXNGdaVzVqYkc5emFXNW5JR052YlhCMWRHRjBhVzl1SUcxaGVTQnpkR2xzYkNCaVpTQnlkVzV1YVc1bkxseHVkbUZ5SUdsdVEyOXRjSFYwWlNBOUlHWmhiSE5sTzF4dUx5OGdZSFJ5ZFdWZ0lHbG1JSFJvWlNCZ1gzUm9jbTkzUm1seWMzUkZjbkp2Y21BZ2IzQjBhVzl1SUhkaGN5QndZWE56WldRZ2FXNGdkRzhnZEdobElHTmhiR3hjYmk4dklIUnZJRlJ5WVdOcmNpNW1iSFZ6YUNCMGFHRjBJSGRsSUdGeVpTQnBiaTRnVjJobGJpQnpaWFFzSUhSb2NtOTNJSEpoZEdobGNpQjBhR0Z1SUd4dlp5QjBhR1ZjYmk4dklHWnBjbk4wSUdWeWNtOXlJR1Z1WTI5MWJuUmxjbVZrSUhkb2FXeGxJR1pzZFhOb2FXNW5MaUJDWldadmNtVWdkR2h5YjNkcGJtY2dkR2hsSUdWeWNtOXlMRnh1THk4Z1ptbHVhWE5vSUdac2RYTm9hVzVuSUNobWNtOXRJR0VnWm1sdVlXeHNlU0JpYkc5amF5a3NJR3h2WjJkcGJtY2dZVzU1SUhOMVluTmxjWFZsYm5SY2JpOHZJR1Z5Y205eWN5NWNiblpoY2lCMGFISnZkMFpwY25OMFJYSnliM0lnUFNCbVlXeHpaVHRjYmx4dWRtRnlJR0ZtZEdWeVJteDFjMmhEWVd4c1ltRmphM01nUFNCYlhUdGNibHh1ZG1GeUlISmxjWFZsYzNSQmJtbHRZWFJwYjI1R2NtRnRaU0E5SUhKbGNYVnBjbVVvWENKeVlXWmNJaWs3WEc1Y2JuWmhjaUJ5WlhGMWFYSmxSbXgxYzJnZ1BTQm1kVzVqZEdsdmJpQW9LU0I3WEc1Y2RHbG1JQ2doSUhkcGJHeEdiSFZ6YUNrZ2UxeHVYSFJjZEhKbGNYVmxjM1JCYm1sdFlYUnBiMjVHY21GdFpTaFVjbUZqYTNJdVgzSjFia1pzZFhOb0tUdGNibHgwWEhSM2FXeHNSbXgxYzJnZ1BTQjBjblZsTzF4dVhIUjlYRzU5TzF4dVhHNHZMeUJVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjRnWTI5dWMzUnlkV04wYjNJZ2FYTWdkbWx6YVdKc1pTQmlkWFFnY0hKcGRtRjBaVnh1THk4Z0tIUm9jbTkzY3lCaGJpQmxjbkp2Y2lCcFppQjViM1VnZEhKNUlIUnZJR05oYkd3Z2FYUXBYRzUyWVhJZ1kyOXVjM1J5ZFdOMGFXNW5RMjl0Y0hWMFlYUnBiMjRnUFNCbVlXeHpaVHRjYmx4dUx5OWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZZMjl0Y0hWMFlYUnBiMjVjYmx4dUx5b3FYRzRnS2lCQWMzVnRiV0Z5ZVNCQklFTnZiWEIxZEdGMGFXOXVJRzlpYW1WamRDQnlaWEJ5WlhObGJuUnpJR052WkdVZ2RHaGhkQ0JwY3lCeVpYQmxZWFJsWkd4NUlISmxjblZ1WEc0Z0tpQnBiaUJ5WlhOd2IyNXpaU0IwYjF4dUlDb2djbVZoWTNScGRtVWdaR0YwWVNCamFHRnVaMlZ6TGlCRGIyMXdkWFJoZEdsdmJuTWdaRzl1SjNRZ2FHRjJaU0J5WlhSMWNtNGdkbUZzZFdWek95QjBhR1Y1SUdwMWMzUmNiaUFxSUhCbGNtWnZjbTBnWVdOMGFXOXVjeXdnYzNWamFDQmhjeUJ5WlhKbGJtUmxjbWx1WnlCaElIUmxiWEJzWVhSbElHOXVJSFJvWlNCelkzSmxaVzR1SUVOdmJYQjFkR0YwYVc5dWMxeHVJQ29nWVhKbElHTnlaV0YwWldRZ2RYTnBibWNnVkhKaFkydHlMbUYxZEc5eWRXNHVJRlZ6WlNCemRHOXdJSFJ2SUhCeVpYWmxiblFnWm5WeWRHaGxjaUJ5WlhKMWJtNXBibWNnYjJZZ1lWeHVJQ29nWTI5dGNIVjBZWFJwYjI0dVhHNGdLaUJBYVc1emRHRnVZMlZ1WVcxbElHTnZiWEIxZEdGMGFXOXVYRzRnS2k5Y2JsUnlZV05yY2k1RGIyMXdkWFJoZEdsdmJpQTlJR1oxYm1OMGFXOXVJQ2htTENCd1lYSmxiblFzSUc5d2RHbHZibk1wSUh0Y2JseDBhV1lnS0NFZ1kyOXVjM1J5ZFdOMGFXNW5RMjl0Y0hWMFlYUnBiMjRwWEc1Y2RGeDBkR2h5YjNjZ2JtVjNJRVZ5Y205eUtGeHVYSFJjZEZ4MFhDSlVjbUZqYTNJdVEyOXRjSFYwWVhScGIyNGdZMjl1YzNSeWRXTjBiM0lnYVhNZ2NISnBkbUYwWlRzZ2RYTmxJRlJ5WVdOcmNpNWhkWFJ2Y25WdVhDSXBPMXh1WEhSamIyNXpkSEoxWTNScGJtZERiMjF3ZFhSaGRHbHZiaUE5SUdaaGJITmxPMXh1WEc1Y2RIWmhjaUJ6Wld4bUlEMGdkR2hwY3p0Y2JseDBiM0IwYVc5dWN5QTlJRzl3ZEdsdmJuTWdmSHdnZTMwN1hHNWNibHgwTHk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqWTI5dGNIVjBZWFJwYjI1ZmMzUnZjSEJsWkZ4dVhHNWNkQzhxS2x4dVhIUWdLaUJBYzNWdGJXRnllU0JVY25WbElHbG1JSFJvYVhNZ1kyOXRjSFYwWVhScGIyNGdhR0Z6SUdKbFpXNGdjM1J2Y0hCbFpDNWNibHgwSUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1WEhRZ0tpQkFiV1Z0WW1WeVQyWWdWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVYRzVjZENBcUlFQnBibk4wWVc1alpWeHVYSFFnS2lCQWJtRnRaVngwYzNSdmNIQmxaRnh1WEhRZ0tpOWNibHgwYzJWc1ppNXpkRzl3Y0dWa0lEMGdabUZzYzJVN1hHNWNibHgwTHk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqWTI5dGNIVjBZWFJwYjI1ZmFXNTJZV3hwWkdGMFpXUmNibHh1WEhRdktpcGNibHgwSUNvZ1FITjFiVzFoY25rZ1ZISjFaU0JwWmlCMGFHbHpJR052YlhCMWRHRjBhVzl1SUdoaGN5QmlaV1Z1SUdsdWRtRnNhV1JoZEdWa0lDaGhibVFnYm05MElIbGxkQ0J5WlhKMWJpa3NJRzl5SUdsbUlHbDBJR2hoY3lCaVpXVnVJSE4wYjNCd1pXUXVYRzVjZENBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmx4MElDb2dRRzFsYldKbGNrOW1JRlJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZibHh1WEhRZ0tpQkFhVzV6ZEdGdVkyVmNibHgwSUNvZ1FHNWhiV1ZjZEdsdWRtRnNhV1JoZEdWa1hHNWNkQ0FxSUVCMGVYQmxJSHRDYjI5c1pXRnVmVnh1WEhRZ0tpOWNibHgwYzJWc1ppNXBiblpoYkdsa1lYUmxaQ0E5SUdaaGJITmxPMXh1WEc1Y2RDOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkyTnZiWEIxZEdGMGFXOXVYMlpwY25OMGNuVnVYRzVjYmx4MEx5b3FYRzVjZENBcUlFQnpkVzF0WVhKNUlGUnlkV1VnWkhWeWFXNW5JSFJvWlNCcGJtbDBhV0ZzSUhKMWJpQnZaaUIwYUdVZ1kyOXRjSFYwWVhScGIyNGdZWFFnZEdobElIUnBiV1VnWUZSeVlXTnJjaTVoZFhSdmNuVnVZQ0JwY3lCallXeHNaV1FzSUdGdVpDQm1ZV3h6WlNCdmJpQnpkV0p6WlhGMVpXNTBJSEpsY25WdWN5QmhibVFnWVhRZ2IzUm9aWElnZEdsdFpYTXVYRzVjZENBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmx4MElDb2dRRzFsYldKbGNrOW1JRlJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZibHh1WEhRZ0tpQkFhVzV6ZEdGdVkyVmNibHgwSUNvZ1FHNWhiV1ZjZEdacGNuTjBVblZ1WEc1Y2RDQXFJRUIwZVhCbElIdENiMjlzWldGdWZWeHVYSFFnS2k5Y2JseDBjMlZzWmk1bWFYSnpkRkoxYmlBOUlIUnlkV1U3WEc1Y2JseDBjMlZzWmk1ZmFXUWdQU0J1WlhoMFNXUXJLenRjYmx4MGMyVnNaaTVmYjI1SmJuWmhiR2xrWVhSbFEyRnNiR0poWTJ0eklEMGdXMTA3WEc1Y2RITmxiR1l1WDI5dVUzUnZjRU5oYkd4aVlXTnJjeUE5SUZ0ZE8xeHVYSFF2THlCMGFHVWdjR3hoYmlCcGN5QmhkQ0J6YjIxbElIQnZhVzUwSUhSdklIVnpaU0IwYUdVZ2NHRnlaVzUwSUhKbGJHRjBhVzl1WEc1Y2RDOHZJSFJ2SUdOdmJuTjBjbUZwYmlCMGFHVWdiM0prWlhJZ2RHaGhkQ0JqYjIxd2RYUmhkR2x2Ym5NZ1lYSmxJSEJ5YjJObGMzTmxaRnh1WEhSelpXeG1MbDl3WVhKbGJuUWdQU0J3WVhKbGJuUTdYRzVjZEhObGJHWXVYMloxYm1NZ1BTQm1PMXh1WEhSelpXeG1MbDl2YmtWeWNtOXlJRDBnYjNCMGFXOXVjeTV2YmtWeWNtOXlPMXh1WEhSelpXeG1MbDl5WldOdmJYQjFkR2x1WnlBOUlHWmhiSE5sTzF4dVhIUnpaV3htTGw5amIyNTBaWGgwSUQwZ2IzQjBhVzl1Y3k1amIyNTBaWGgwSUh4OElHNTFiR3c3WEc1Y2JseDBMeThnVW1WbmFYTjBaWElnZEdobElHTnZiWEIxZEdGMGFXOXVJSGRwZEdocGJpQjBhR1VnWjJ4dlltRnNJRlJ5WVdOcmNpNWNibHgwVkhKaFkydHlMbDlqYjIxd2RYUmhkR2x2Ym5OYmMyVnNaaTVmYVdSZElEMGdjMlZzWmp0Y2JseHVYSFIyWVhJZ1pYSnliM0psWkNBOUlIUnlkV1U3WEc1Y2RIUnllU0I3WEc1Y2RGeDBjMlZzWmk1ZlkyOXRjSFYwWlNncE8xeHVYSFJjZEdWeWNtOXlaV1FnUFNCbVlXeHpaVHRjYmx4MGZTQm1hVzVoYkd4NUlIdGNibHgwWEhSelpXeG1MbVpwY25OMFVuVnVJRDBnWm1Gc2MyVTdYRzVjZEZ4MGFXWWdLR1Z5Y205eVpXUXBYRzVjZEZ4MFhIUnpaV3htTG5OMGIzQW9LVHRjYmx4MGZWeHVmVHRjYmx4dUx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4alkyOXRjSFYwWVhScGIyNWZiMjVwYm5aaGJHbGtZWFJsWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1VtVm5hWE4wWlhKeklHQmpZV3hzWW1GamEyQWdkRzhnY25WdUlIZG9aVzRnZEdocGN5QmpiMjF3ZFhSaGRHbHZiaUJwY3lCdVpYaDBJR2x1ZG1Gc2FXUmhkR1ZrTENCdmNpQnlkVzV6SUdsMElHbHRiV1ZrYVdGMFpXeDVJR2xtSUhSb1pTQmpiMjF3ZFhSaGRHbHZiaUJwY3lCaGJISmxZV1I1SUdsdWRtRnNhV1JoZEdWa0xseDBWR2hsSUdOaGJHeGlZV05ySUdseklISjFiaUJsZUdGamRHeDVJRzl1WTJVZ1lXNWtJRzV2ZENCMWNHOXVJR1oxZEhWeVpTQnBiblpoYkdsa1lYUnBiMjV6SUhWdWJHVnpjeUJnYjI1SmJuWmhiR2xrWVhSbFlDQnBjeUJqWVd4c1pXUWdZV2RoYVc0Z1lXWjBaWElnZEdobElHTnZiWEIxZEdGMGFXOXVJR0psWTI5dFpYTWdkbUZzYVdRZ1lXZGhhVzR1WEc0Z0tpQkFiRzlqZFhNZ1EyeHBaVzUwWEc0Z0tpQkFjR0Z5WVcwZ2UwWjFibU4wYVc5dWZTQmpZV3hzWW1GamF5QkdkVzVqZEdsdmJpQjBieUJpWlNCallXeHNaV1FnYjI0Z2FXNTJZV3hwWkdGMGFXOXVMaUJTWldObGFYWmxjeUJ2Ym1VZ1lYSm5kVzFsYm5Rc0lIUm9aU0JqYjIxd2RYUmhkR2x2YmlCMGFHRjBJSGRoY3lCcGJuWmhiR2xrWVhSbFpDNWNiaUFxTDF4dVZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dUxuQnliM1J2ZEhsd1pTNXZia2x1ZG1Gc2FXUmhkR1VnUFNCbWRXNWpkR2x2YmlBb1ppd2dZM1I0S1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHh1WEhScFppQW9kSGx3Wlc5bUlHWWdJVDA5SUNkbWRXNWpkR2x2YmljcFhHNWNkRngwZEdoeWIzY2dibVYzSUVWeWNtOXlLRndpYjI1SmJuWmhiR2xrWVhSbElISmxjWFZwY21WeklHRWdablZ1WTNScGIyNWNJaWs3WEc1Y2JseDBhV1lnS0hObGJHWXVhVzUyWVd4cFpHRjBaV1FwSUh0Y2JseDBYSFJVY21GamEzSXVibTl1Y21WaFkzUnBkbVVvWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFJjZEZ4MGQybDBhRTV2V1dsbGJHUnpRV3hzYjNkbFpDaG1LUzVqWVd4c0tHTjBlQ0I4ZkNCelpXeG1MbDlqYjI1MFpYaDBMQ0J6Wld4bUtUdGNibHgwWEhSOUtUdGNibHgwZlNCbGJITmxJSHRjYmx4MFhIUnpaV3htTGw5dmJrbHVkbUZzYVdSaGRHVkRZV3hzWW1GamEzTXVjSFZ6YUNoN0lHWnVPaUJtTENCamRIZzZJR04wZUNCOUtUdGNibHgwZlZ4dWZUdGNibHh1THlvcVhHNGdLaUJBYzNWdGJXRnllU0JTWldkcGMzUmxjbk1nWUdOaGJHeGlZV05yWUNCMGJ5QnlkVzRnZDJobGJpQjBhR2x6SUdOdmJYQjFkR0YwYVc5dUlHbHpJSE4wYjNCd1pXUXNJRzl5SUhKMWJuTWdhWFFnYVcxdFpXUnBZWFJsYkhrZ2FXWWdkR2hsSUdOdmJYQjFkR0YwYVc5dUlHbHpJR0ZzY21WaFpIa2djM1J2Y0hCbFpDNWNkRlJvWlNCallXeHNZbUZqYXlCcGN5QnlkVzRnWVdaMFpYSWdZVzU1SUdCdmJrbHVkbUZzYVdSaGRHVmdJR05oYkd4aVlXTnJjeTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUlFQndZWEpoYlNCN1JuVnVZM1JwYjI1OUlHTmhiR3hpWVdOcklFWjFibU4wYVc5dUlIUnZJR0psSUdOaGJHeGxaQ0J2YmlCemRHOXdMaUJTWldObGFYWmxjeUJ2Ym1VZ1lYSm5kVzFsYm5Rc0lIUm9aU0JqYjIxd2RYUmhkR2x2YmlCMGFHRjBJSGRoY3lCemRHOXdjR1ZrTGx4dUlDb3ZYRzVVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjR1Y0hKdmRHOTBlWEJsTG05dVUzUnZjQ0E5SUdaMWJtTjBhVzl1SUNobUxDQmpkSGdwSUh0Y2JseDBkbUZ5SUhObGJHWWdQU0IwYUdsek8xeHVYRzVjZEdsbUlDaDBlWEJsYjJZZ1ppQWhQVDBnSjJaMWJtTjBhVzl1SnlsY2JseDBYSFIwYUhKdmR5QnVaWGNnUlhKeWIzSW9YQ0p2YmxOMGIzQWdjbVZ4ZFdseVpYTWdZU0JtZFc1amRHbHZibHdpS1R0Y2JseHVYSFJwWmlBb2MyVnNaaTV6ZEc5d2NHVmtLU0I3WEc1Y2RGeDBWSEpoWTJ0eUxtNXZibkpsWVdOMGFYWmxLR1oxYm1OMGFXOXVJQ2dwSUh0Y2JseDBYSFJjZEhkcGRHaE9iMWxwWld4a2MwRnNiRzkzWldRb1ppa3VZMkZzYkNoamRIZ2dmSHdnYzJWc1ppNWZZMjl1ZEdWNGRDd2djMlZzWmlrN1hHNWNkRngwZlNrN1hHNWNkSDBnWld4elpTQjdYRzVjZEZ4MGMyVnNaaTVmYjI1VGRHOXdRMkZzYkdKaFkydHpMbkIxYzJnb2V5Qm1iam9nWml3Z1kzUjRPaUJqZEhnZ2ZTazdYRzVjZEgxY2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STJOdmJYQjFkR0YwYVc5dVgybHVkbUZzYVdSaGRHVmNibHh1THlvcVhHNGdLaUJBYzNWdGJXRnllU0JKYm5aaGJHbGtZWFJsY3lCMGFHbHpJR052YlhCMWRHRjBhVzl1SUhOdklIUm9ZWFFnYVhRZ2QybHNiQ0JpWlNCeVpYSjFiaTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUwxeHVWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVMbkJ5YjNSdmRIbHdaUzVwYm5aaGJHbGtZWFJsSUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2RHbG1JQ2doSUhObGJHWXVhVzUyWVd4cFpHRjBaV1FwSUh0Y2JseDBYSFF2THlCcFppQjNaU2R5WlNCamRYSnlaVzUwYkhrZ2FXNGdYM0psWTI5dGNIVjBaU2dwTENCa2IyNG5kQ0JsYm5GMVpYVmxYRzVjZEZ4MEx5OGdiM1Z5YzJWc2RtVnpMQ0J6YVc1alpTQjNaU2RzYkNCeVpYSjFiaUJwYlcxbFpHbGhkR1ZzZVNCaGJubDNZWGt1WEc1Y2RGeDBhV1lnS0NFZ2MyVnNaaTVmY21WamIyMXdkWFJwYm1jZ0ppWWdJU0J6Wld4bUxuTjBiM0J3WldRcElIdGNibHgwWEhSY2RISmxjWFZwY21WR2JIVnphQ2dwTzF4dVhIUmNkRngwY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1d2RYTm9LSFJvYVhNcE8xeHVYSFJjZEgxY2JseHVYSFJjZEhObGJHWXVhVzUyWVd4cFpHRjBaV1FnUFNCMGNuVmxPMXh1WEc1Y2RGeDBMeThnWTJGc2JHSmhZMnR6SUdOaGJpZDBJR0ZrWkNCallXeHNZbUZqYTNNc0lHSmxZMkYxYzJWY2JseDBYSFF2THlCelpXeG1MbWx1ZG1Gc2FXUmhkR1ZrSUQwOVBTQjBjblZsTGx4dVhIUmNkR1p2Y2loMllYSWdhU0E5SURBc0lHWTdJR1lnUFNCelpXeG1MbDl2YmtsdWRtRnNhV1JoZEdWRFlXeHNZbUZqYTNOYmFWMDdJR2tyS3lrZ2UxeHVYSFJjZEZ4MFZISmhZMnR5TG01dmJuSmxZV04wYVhabEtHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MFhIUmNkRngwZDJsMGFFNXZXV2xsYkdSelFXeHNiM2RsWkNobUxtWnVLUzVqWVd4c0tHWXVZM1I0SUh4OElITmxiR1l1WDJOdmJuUmxlSFFzSUhObGJHWXBPMXh1WEhSY2RGeDBmU2s3WEc1Y2RGeDBmVnh1WEhSY2RITmxiR1l1WDI5dVNXNTJZV3hwWkdGMFpVTmhiR3hpWVdOcmN5QTlJRnRkTzF4dVhIUjlYRzU5TzF4dVhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TmpiMjF3ZFhSaGRHbHZibDl6ZEc5d1hHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVSEpsZG1WdWRITWdkR2hwY3lCamIyMXdkWFJoZEdsdmJpQm1jbTl0SUhKbGNuVnVibWx1Wnk1Y2JpQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JpQXFMMXh1VkhKaFkydHlMa052YlhCMWRHRjBhVzl1TG5CeWIzUnZkSGx3WlM1emRHOXdJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFIyWVhJZ2MyVnNaaUE5SUhSb2FYTTdYRzVjYmx4MGFXWWdLQ0VnYzJWc1ppNXpkRzl3Y0dWa0tTQjdYRzVjZEZ4MGMyVnNaaTV6ZEc5d2NHVmtJRDBnZEhKMVpUdGNibHgwWEhSelpXeG1MbWx1ZG1Gc2FXUmhkR1VvS1R0Y2JseDBYSFF2THlCVmJuSmxaMmx6ZEdWeUlHWnliMjBnWjJ4dlltRnNJRlJ5WVdOcmNpNWNibHgwWEhSa1pXeGxkR1VnVkhKaFkydHlMbDlqYjIxd2RYUmhkR2x2Ym5OYmMyVnNaaTVmYVdSZE8xeHVYSFJjZEdadmNpaDJZWElnYVNBOUlEQXNJR1k3SUdZZ1BTQnpaV3htTGw5dmJsTjBiM0JEWVd4c1ltRmphM05iYVYwN0lHa3JLeWtnZTF4dVhIUmNkRngwVkhKaFkydHlMbTV2Ym5KbFlXTjBhWFpsS0daMWJtTjBhVzl1SUNncElIdGNibHgwWEhSY2RGeDBkMmwwYUU1dldXbGxiR1J6UVd4c2IzZGxaQ2htTG1adUtTNWpZV3hzS0dZdVkzUjRJSHg4SUhObGJHWXVYMk52Ym5SbGVIUXNJSE5sYkdZcE8xeHVYSFJjZEZ4MGZTazdYRzVjZEZ4MGZWeHVYSFJjZEhObGJHWXVYMjl1VTNSdmNFTmhiR3hpWVdOcmN5QTlJRnRkTzF4dVhIUjlYRzU5TzF4dVhHNVVjbUZqYTNJdVEyOXRjSFYwWVhScGIyNHVjSEp2ZEc5MGVYQmxMbDlqYjIxd2RYUmxJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFIyWVhJZ2MyVnNaaUE5SUhSb2FYTTdYRzVjZEhObGJHWXVhVzUyWVd4cFpHRjBaV1FnUFNCbVlXeHpaVHRjYmx4dVhIUjJZWElnY0hKbGRtbHZkWE1nUFNCVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1TzF4dVhIUnpaWFJEZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRvYzJWc1ppazdYRzVjZEhaaGNpQndjbVYyYVc5MWMwbHVRMjl0Y0hWMFpTQTlJR2x1UTI5dGNIVjBaVHRjYmx4MGFXNURiMjF3ZFhSbElEMGdkSEoxWlR0Y2JseDBkSEo1SUh0Y2JseDBYSFIzYVhSb1RtOVphV1ZzWkhOQmJHeHZkMlZrS0hObGJHWXVYMloxYm1NcExtTmhiR3dvYzJWc1ppNWZZMjl1ZEdWNGRDd2djMlZzWmlrN1hHNWNkSDBnWm1sdVlXeHNlU0I3WEc1Y2RGeDBjMlYwUTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1S0hCeVpYWnBiM1Z6S1R0Y2JseDBYSFJwYmtOdmJYQjFkR1VnUFNCd2NtVjJhVzkxYzBsdVEyOXRjSFYwWlR0Y2JseDBmVnh1ZlR0Y2JseHVWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVMbkJ5YjNSdmRIbHdaUzVmYm1WbFpITlNaV052YlhCMWRHVWdQU0JtZFc1amRHbHZiaUFvS1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHgwY21WMGRYSnVJSE5sYkdZdWFXNTJZV3hwWkdGMFpXUWdKaVlnSVNCelpXeG1Mbk4wYjNCd1pXUTdYRzU5TzF4dVhHNVVjbUZqYTNJdVEyOXRjSFYwWVhScGIyNHVjSEp2ZEc5MGVYQmxMbDl5WldOdmJYQjFkR1VnUFNCbWRXNWpkR2x2YmlBb0tTQjdYRzVjZEhaaGNpQnpaV3htSUQwZ2RHaHBjenRjYmx4dVhIUnpaV3htTGw5eVpXTnZiWEIxZEdsdVp5QTlJSFJ5ZFdVN1hHNWNkSFJ5ZVNCN1hHNWNkRngwYVdZZ0tITmxiR1l1WDI1bFpXUnpVbVZqYjIxd2RYUmxLQ2twSUh0Y2JseDBYSFJjZEhSeWVTQjdYRzVjZEZ4MFhIUmNkSE5sYkdZdVgyTnZiWEIxZEdVb0tUdGNibHgwWEhSY2RIMGdZMkYwWTJnZ0tHVXBJSHRjYmx4MFhIUmNkRngwYVdZZ0tITmxiR1l1WDI5dVJYSnliM0lwSUh0Y2JseDBYSFJjZEZ4MFhIUnpaV3htTGw5dmJrVnljbTl5S0dVcE8xeHVYSFJjZEZ4MFhIUjlJR1ZzYzJVZ2UxeHVYSFJjZEZ4MFhIUmNkRjkwYUhKdmQwOXlURzluS0Z3aWNtVmpiMjF3ZFhSbFhDSXNJR1VwTzF4dVhIUmNkRngwWEhSOVhHNWNkRngwWEhSOVhHNWNkRngwZlZ4dVhIUjlJR1pwYm1Gc2JIa2dlMXh1WEhSY2RITmxiR1l1WDNKbFkyOXRjSFYwYVc1bklEMGdabUZzYzJVN1hHNWNkSDFjYm4wN1hHNWNiaTh2WEc0dkx5Qm9kSFJ3T2k4dlpHOWpjeTV0WlhSbGIzSXVZMjl0THlOMGNtRmphMlZ5WDJSbGNHVnVaR1Z1WTNsY2JseHVMeW9xWEc0Z0tpQkFjM1Z0YldGeWVTQkJJRVJsY0dWdVpHVnVZM2tnY21Wd2NtVnpaVzUwY3lCaGJpQmhkRzl0YVdNZ2RXNXBkQ0J2WmlCeVpXRmpkR2wyWlNCa1lYUmhJSFJvWVhRZ1lWeHVJQ29nWTI5dGNIVjBZWFJwYjI0Z2JXbG5hSFFnWkdWd1pXNWtJRzl1TGlCU1pXRmpkR2wyWlNCa1lYUmhJSE52ZFhKalpYTWdjM1ZqYUNCaGN5QlRaWE56YVc5dUlHOXlYRzRnS2lCTmFXNXBiVzl1WjI4Z2FXNTBaWEp1WVd4c2VTQmpjbVZoZEdVZ1pHbG1abVZ5Wlc1MElFUmxjR1Z1WkdWdVkza2diMkpxWldOMGN5Qm1iM0lnWkdsbVptVnlaVzUwWEc0Z0tpQndhV1ZqWlhNZ2IyWWdaR0YwWVN3Z1pXRmphQ0J2WmlCM2FHbGphQ0J0WVhrZ1ltVWdaR1Z3Wlc1a1pXUWdiMjRnWW5rZ2JYVnNkR2x3YkdVZ1kyOXRjSFYwWVhScGIyNXpMbHh1SUNvZ1YyaGxiaUIwYUdVZ1pHRjBZU0JqYUdGdVoyVnpMQ0IwYUdVZ1kyOXRjSFYwWVhScGIyNXpJR0Z5WlNCcGJuWmhiR2xrWVhSbFpDNWNiaUFxSUVCamJHRnpjMXh1SUNvZ1FHbHVjM1JoYm1ObFRtRnRaU0JrWlhCbGJtUmxibU41WEc0Z0tpOWNibFJ5WVdOcmNpNUVaWEJsYm1SbGJtTjVJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFIwYUdsekxsOWtaWEJsYm1SbGJuUnpRbmxKWkNBOUlIdDlPMXh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpaR1Z3Wlc1a1pXNWplVjlrWlhCbGJtUmNiaTh2WEc0dkx5QkJaR1J6SUdCamIyMXdkWFJoZEdsdmJtQWdkRzhnZEdocGN5QnpaWFFnYVdZZ2FYUWdhWE1nYm05MElHRnNjbVZoWkhsY2JpOHZJSEJ5WlhObGJuUXVYSFJTWlhSMWNtNXpJSFJ5ZFdVZ2FXWWdZR052YlhCMWRHRjBhVzl1WUNCcGN5QmhJRzVsZHlCdFpXMWlaWElnYjJZZ2RHaGxJSE5sZEM1Y2JpOHZJRWxtSUc1dklHRnlaM1Z0Wlc1MExDQmtaV1poZFd4MGN5QjBieUJqZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRzSUc5eUlHUnZaWE1nYm05MGFHbHVaMXh1THk4Z2FXWWdkR2hsY21VZ2FYTWdibThnWTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1TGx4dVhHNHZLaXBjYmlBcUlFQnpkVzF0WVhKNUlFUmxZMnhoY21WeklIUm9ZWFFnZEdobElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNGdLRzl5SUdCbWNtOXRRMjl0Y0hWMFlYUnBiMjVnSUdsbUlHZHBkbVZ1S1NCa1pYQmxibVJ6SUc5dUlHQmtaWEJsYm1SbGJtTjVZQzVjZEZSb1pTQmpiMjF3ZFhSaGRHbHZiaUIzYVd4c0lHSmxJR2x1ZG1Gc2FXUmhkR1ZrSUhSb1pTQnVaWGgwSUhScGJXVWdZR1JsY0dWdVpHVnVZM2xnSUdOb1lXNW5aWE11WEc1Y2JrbG1JSFJvWlhKbElHbHpJRzV2SUdOMWNuSmxiblFnWTI5dGNIVjBZWFJwYjI0Z1lXNWtJR0JrWlhCbGJtUW9LV0FnYVhNZ1kyRnNiR1ZrSUhkcGRHZ2dibThnWVhKbmRXMWxiblJ6TENCcGRDQmtiMlZ6SUc1dmRHaHBibWNnWVc1a0lISmxkSFZ5Ym5NZ1ptRnNjMlV1WEc1Y2JsSmxkSFZ5Ym5NZ2RISjFaU0JwWmlCMGFHVWdZMjl0Y0hWMFlYUnBiMjRnYVhNZ1lTQnVaWGNnWkdWd1pXNWtaVzUwSUc5bUlHQmtaWEJsYm1SbGJtTjVZQ0J5WVhSb1pYSWdkR2hoYmlCaGJpQmxlR2x6ZEdsdVp5QnZibVV1WEc0Z0tpQkFiRzlqZFhNZ1EyeHBaVzUwWEc0Z0tpQkFjR0Z5WVcwZ2UxUnlZV05yY2k1RGIyMXdkWFJoZEdsdmJuMGdXMlp5YjIxRGIyMXdkWFJoZEdsdmJsMGdRVzRnYjNCMGFXOXVZV3dnWTI5dGNIVjBZWFJwYjI0Z1pHVmpiR0Z5WldRZ2RHOGdaR1Z3Wlc1a0lHOXVJR0JrWlhCbGJtUmxibU41WUNCcGJuTjBaV0ZrSUc5bUlIUm9aU0JqZFhKeVpXNTBJR052YlhCMWRHRjBhVzl1TGx4dUlDb2dRSEpsZEhWeWJuTWdlMEp2YjJ4bFlXNTlYRzRnS2k5Y2JsUnlZV05yY2k1RVpYQmxibVJsYm1ONUxuQnliM1J2ZEhsd1pTNWtaWEJsYm1RZ1BTQm1kVzVqZEdsdmJpQW9ZMjl0Y0hWMFlYUnBiMjRwSUh0Y2JseDBhV1lnS0NFZ1kyOXRjSFYwWVhScGIyNHBJSHRjYmx4MFhIUnBaaUFvSVNCVWNtRmphM0l1WVdOMGFYWmxLVnh1WEhSY2RGeDBjbVYwZFhKdUlHWmhiSE5sTzF4dVhHNWNkRngwWTI5dGNIVjBZWFJwYjI0Z1BTQlVjbUZqYTNJdVkzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dU8xeHVYSFI5WEc1Y2RIWmhjaUJ6Wld4bUlEMGdkR2hwY3p0Y2JseDBkbUZ5SUdsa0lEMGdZMjl0Y0hWMFlYUnBiMjR1WDJsa08xeHVYSFJwWmlBb0lTQW9hV1FnYVc0Z2MyVnNaaTVmWkdWd1pXNWtaVzUwYzBKNVNXUXBLU0I3WEc1Y2RGeDBjMlZzWmk1ZlpHVndaVzVrWlc1MGMwSjVTV1JiYVdSZElEMGdZMjl0Y0hWMFlYUnBiMjQ3WEc1Y2RGeDBZMjl0Y0hWMFlYUnBiMjR1YjI1SmJuWmhiR2xrWVhSbEtHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MFhIUmNkR1JsYkdWMFpTQnpaV3htTGw5a1pYQmxibVJsYm5SelFubEpaRnRwWkYwN1hHNWNkRngwZlNrN1hHNWNkRngwY21WMGRYSnVJSFJ5ZFdVN1hHNWNkSDFjYmx4MGNtVjBkWEp1SUdaaGJITmxPMXh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpaR1Z3Wlc1a1pXNWplVjlqYUdGdVoyVmtYRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnU1c1MllXeHBaR0YwWlNCaGJHd2daR1Z3Wlc1a1pXNTBJR052YlhCMWRHRjBhVzl1Y3lCcGJXMWxaR2xoZEdWc2VTQmhibVFnY21WdGIzWmxJSFJvWlcwZ1lYTWdaR1Z3Wlc1a1pXNTBjeTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUwxeHVWSEpoWTJ0eUxrUmxjR1Z1WkdWdVkza3VjSEp2ZEc5MGVYQmxMbU5vWVc1blpXUWdQU0JtZFc1amRHbHZiaUFvS1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHgwWm05eUlDaDJZWElnYVdRZ2FXNGdjMlZzWmk1ZlpHVndaVzVrWlc1MGMwSjVTV1FwWEc1Y2RGeDBjMlZzWmk1ZlpHVndaVzVrWlc1MGMwSjVTV1JiYVdSZExtbHVkbUZzYVdSaGRHVW9LVHRjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJMlJsY0dWdVpHVnVZM2xmYUdGelpHVndaVzVrWlc1MGMxeHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRlJ5ZFdVZ2FXWWdkR2hwY3lCRVpYQmxibVJsYm1ONUlHaGhjeUJ2Ym1VZ2IzSWdiVzl5WlNCa1pYQmxibVJsYm5RZ1EyOXRjSFYwWVhScGIyNXpMQ0IzYUdsamFDQjNiM1ZzWkNCaVpTQnBiblpoYkdsa1lYUmxaQ0JwWmlCMGFHbHpJRVJsY0dWdVpHVnVZM2tnZDJWeVpTQjBieUJqYUdGdVoyVXVYRzRnS2lCQWJHOWpkWE1nUTJ4cFpXNTBYRzRnS2lCQWNtVjBkWEp1Y3lCN1FtOXZiR1ZoYm4xY2JpQXFMMXh1VkhKaFkydHlMa1JsY0dWdVpHVnVZM2t1Y0hKdmRHOTBlWEJsTG1oaGMwUmxjR1Z1WkdWdWRITWdQU0JtZFc1amRHbHZiaUFvS1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHgwWm05eUtIWmhjaUJwWkNCcGJpQnpaV3htTGw5a1pYQmxibVJsYm5SelFubEpaQ2xjYmx4MFhIUnlaWFIxY200Z2RISjFaVHRjYmx4MGNtVjBkWEp1SUdaaGJITmxPMXh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpkSEpoWTJ0bGNsOW1iSFZ6YUZ4dVhHNHZLaXBjYmlBcUlFQnpkVzF0WVhKNUlGQnliMk5sYzNNZ1lXeHNJSEpsWVdOMGFYWmxJSFZ3WkdGMFpYTWdhVzF0WldScFlYUmxiSGtnWVc1a0lHVnVjM1Z5WlNCMGFHRjBJR0ZzYkNCcGJuWmhiR2xrWVhSbFpDQmpiMjF3ZFhSaGRHbHZibk1nWVhKbElISmxjblZ1TGx4dUlDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dUlDb3ZYRzVVY21GamEzSXVabXgxYzJnZ1BTQm1kVzVqZEdsdmJpQW9iM0IwYVc5dWN5a2dlMXh1WEhSVWNtRmphM0l1WDNKMWJrWnNkWE5vS0hzZ1ptbHVhWE5vVTNsdVkyaHliMjV2ZFhOc2VUb2dkSEoxWlN4Y2JseDBYSFJjZEZ4MFhIUmNkRngwWEhSY2RGeDBYSFIwYUhKdmQwWnBjbk4wUlhKeWIzSTZJRzl3ZEdsdmJuTWdKaVlnYjNCMGFXOXVjeTVmZEdoeWIzZEdhWEp6ZEVWeWNtOXlJSDBwTzF4dWZUdGNibHh1THk4Z1VuVnVJR0ZzYkNCd1pXNWthVzVuSUdOdmJYQjFkR0YwYVc5dWN5QmhibVFnWVdaMFpYSkdiSFZ6YUNCallXeHNZbUZqYTNNdVhIUkpaaUIzWlNCM1pYSmxJRzV2ZENCallXeHNaV1JjYmk4dklHUnBjbVZqZEd4NUlIWnBZU0JVY21GamEzSXVabXgxYzJnc0lIUm9hWE1nYldGNUlISmxkSFZ5YmlCaVpXWnZjbVVnZEdobGVTZHlaU0JoYkd3Z1pHOXVaU0IwYnlCaGJHeHZkMXh1THk4Z2RHaGxJR1YyWlc1MElHeHZiM0FnZEc4Z2NuVnVJR0VnYkdsMGRHeGxJR0psWm05eVpTQmpiMjUwYVc1MWFXNW5MbHh1VkhKaFkydHlMbDl5ZFc1R2JIVnphQ0E5SUdaMWJtTjBhVzl1SUNodmNIUnBiMjV6S1NCN1hHNWNkQzh2SUZoWVdDQlhhR0YwSUhCaGNuUWdiMllnZEdobElHTnZiVzFsYm5RZ1ltVnNiM2NnYVhNZ2MzUnBiR3dnZEhKMVpUOGdLRmRsSUc1dklHeHZibWRsY2x4dVhIUXZMeUJvWVhabElGTndZWEpyS1Z4dVhIUXZMMXh1WEhRdkx5Qk9aWE4wWldRZ1pteDFjMmdnWTI5MWJHUWdjR3hoZFhOcFlteDVJR2hoY0hCbGJpQnBaaXdnYzJGNUxDQmhJR1pzZFhOb0lHTmhkWE5sYzF4dVhIUXZMeUJFVDAwZ2JYVjBZWFJwYjI0c0lIZG9hV05vSUdOaGRYTmxjeUJoSUZ3aVlteDFjbHdpSUdWMlpXNTBMQ0IzYUdsamFDQnlkVzV6SUdGdVhHNWNkQzh2SUdGd2NDQmxkbVZ1ZENCb1lXNWtiR1Z5SUhSb1lYUWdZMkZzYkhNZ1ZISmhZMnR5TG1ac2RYTm9MbHgwUVhRZ2RHaGxJRzF2YldWdWRGeHVYSFF2THlCVGNHRnlheUJpYkc5amEzTWdaWFpsYm5RZ2FHRnVaR3hsY25NZ1pIVnlhVzVuSUVSUFRTQnRkWFJoZEdsdmJpQmhibmwzWVhrc1hHNWNkQzh2SUdKbFkyRjFjMlVnZEdobElFeHBkbVZTWVc1blpTQjBjbVZsSUdsemJpZDBJSFpoYkdsa0xseDBRVzVrSUhkbElHUnZiaWQwSUdoaGRtVmNibHgwTHk4Z1lXNTVJSFZ6WldaMWJDQnViM1JwYjI0Z2IyWWdZU0J1WlhOMFpXUWdabXgxYzJndVhHNWNkQzh2WEc1Y2RDOHZJR2gwZEhCek9pOHZZWEJ3TG1GellXNWhMbU52YlM4d0x6RTFPVGt3T0RNek1ESTBOQzh6T0RVeE16Z3lNek00TlRaY2JseDBhV1lnS0dsdVJteDFjMmdwWEc1Y2RGeDBkR2h5YjNjZ2JtVjNJRVZ5Y205eUtGd2lRMkZ1SjNRZ1kyRnNiQ0JVY21GamEzSXVabXgxYzJnZ2QyaHBiR1VnWm14MWMyaHBibWRjSWlrN1hHNWNibHgwYVdZZ0tHbHVRMjl0Y0hWMFpTbGNibHgwWEhSMGFISnZkeUJ1WlhjZ1JYSnliM0lvWENKRFlXNG5kQ0JtYkhWemFDQnBibk5wWkdVZ1ZISmhZMnR5TG1GMWRHOXlkVzVjSWlrN1hHNWNibHgwYjNCMGFXOXVjeUE5SUc5d2RHbHZibk1nZkh3Z2UzMDdYRzVjYmx4MGFXNUdiSFZ6YUNBOUlIUnlkV1U3WEc1Y2RIZHBiR3hHYkhWemFDQTlJSFJ5ZFdVN1hHNWNkSFJvY205M1JtbHljM1JGY25KdmNpQTlJQ0VoSUc5d2RHbHZibk11ZEdoeWIzZEdhWEp6ZEVWeWNtOXlPMXh1WEc1Y2RIWmhjaUJ5WldOdmJYQjFkR1ZrUTI5MWJuUWdQU0F3TzF4dVhIUjJZWElnWm1sdWFYTm9aV1JVY25rZ1BTQm1ZV3h6WlR0Y2JseDBkSEo1SUh0Y2JseDBYSFIzYUdsc1pTQW9jR1Z1WkdsdVowTnZiWEIxZEdGMGFXOXVjeTVzWlc1bmRHZ2dmSHhjYmx4MFhIUmNkRngwWEhRZ1lXWjBaWEpHYkhWemFFTmhiR3hpWVdOcmN5NXNaVzVuZEdncElIdGNibHh1WEhSY2RGeDBMeThnY21WamIyMXdkWFJsSUdGc2JDQndaVzVrYVc1bklHTnZiWEIxZEdGMGFXOXVjMXh1WEhSY2RGeDBkMmhwYkdVZ0tIQmxibVJwYm1kRGIyMXdkWFJoZEdsdmJuTXViR1Z1WjNSb0tTQjdYRzVjZEZ4MFhIUmNkSFpoY2lCamIyMXdJRDBnY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1emFHbG1kQ2dwTzF4dVhIUmNkRngwWEhSamIyMXdMbDl5WldOdmJYQjFkR1VvS1R0Y2JseDBYSFJjZEZ4MGFXWWdLR052YlhBdVgyNWxaV1J6VW1WamIyMXdkWFJsS0NrcElIdGNibHgwWEhSY2RGeDBYSFJ3Wlc1a2FXNW5RMjl0Y0hWMFlYUnBiMjV6TG5WdWMyaHBablFvWTI5dGNDazdYRzVjZEZ4MFhIUmNkSDFjYmx4dVhIUmNkRngwWEhScFppQW9JU0J2Y0hScGIyNXpMbVpwYm1semFGTjVibU5vY205dWIzVnpiSGtnSmlZZ0t5dHlaV052YlhCMWRHVmtRMjkxYm5RZ1BpQXhNREF3S1NCN1hHNWNkRngwWEhSY2RGeDBabWx1YVhOb1pXUlVjbmtnUFNCMGNuVmxPMXh1WEhSY2RGeDBYSFJjZEhKbGRIVnlianRjYmx4MFhIUmNkRngwZlZ4dVhIUmNkRngwZlZ4dVhHNWNkRngwWEhScFppQW9ZV1owWlhKR2JIVnphRU5oYkd4aVlXTnJjeTVzWlc1bmRHZ3BJSHRjYmx4MFhIUmNkRngwTHk4Z1kyRnNiQ0J2Ym1VZ1lXWjBaWEpHYkhWemFDQmpZV3hzWW1GamF5d2dkMmhwWTJnZ2JXRjVYRzVjZEZ4MFhIUmNkQzh2SUdsdWRtRnNhV1JoZEdVZ2JXOXlaU0JqYjIxd2RYUmhkR2x2Ym5OY2JseDBYSFJjZEZ4MGRtRnlJR05pSUQwZ1lXWjBaWEpHYkhWemFFTmhiR3hpWVdOcmN5NXphR2xtZENncE8xeHVYSFJjZEZ4MFhIUjBjbmtnZTF4dVhIUmNkRngwWEhSY2RHTmlMbVp1TG1OaGJHd29ZMkl1WTNSNEtUdGNibHgwWEhSY2RGeDBmU0JqWVhSamFDQW9aU2tnZTF4dVhIUmNkRngwWEhSY2RGOTBhSEp2ZDA5eVRHOW5LRndpWVdaMFpYSkdiSFZ6YUZ3aUxDQmxLVHRjYmx4MFhIUmNkRngwZlZ4dVhIUmNkRngwZlZ4dVhIUmNkSDFjYmx4MFhIUm1hVzVwYzJobFpGUnllU0E5SUhSeWRXVTdYRzVjZEgwZ1ptbHVZV3hzZVNCN1hHNWNkRngwYVdZZ0tDRWdabWx1YVhOb1pXUlVjbmtwSUh0Y2JseDBYSFJjZEM4dklIZGxKM0psSUdWeWNtOXlhVzVuSUdSMVpTQjBieUIwYUhKdmQwWnBjbk4wUlhKeWIzSWdZbVZwYm1jZ2RISjFaUzVjYmx4MFhIUmNkR2x1Um14MWMyZ2dQU0JtWVd4elpUc2dMeThnYm1WbFpHVmtJR0psWm05eVpTQmpZV3hzYVc1bklHQlVjbUZqYTNJdVpteDFjMmdvS1dBZ1lXZGhhVzVjYmx4MFhIUmNkQzh2SUdacGJtbHphQ0JtYkhWemFHbHVaMXh1WEhSY2RGeDBWSEpoWTJ0eUxsOXlkVzVHYkhWemFDaDdYRzVjZEZ4MFhIUmNkR1pwYm1semFGTjVibU5vY205dWIzVnpiSGs2SUc5d2RHbHZibk11Wm1sdWFYTm9VM2x1WTJoeWIyNXZkWE5zZVN4Y2JseDBYSFJjZEZ4MGRHaHliM2RHYVhKemRFVnljbTl5T2lCbVlXeHpaVnh1WEhSY2RGeDBmU2s3WEc1Y2RGeDBmVnh1WEhSY2RIZHBiR3hHYkhWemFDQTlJR1poYkhObE8xeHVYSFJjZEdsdVJteDFjMmdnUFNCbVlXeHpaVHRjYmx4MFhIUnBaaUFvY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1c1pXNW5kR2dnZkh3Z1lXWjBaWEpHYkhWemFFTmhiR3hpWVdOcmN5NXNaVzVuZEdncElIdGNibHgwWEhSY2RDOHZJRmRsSjNKbElIbHBaV3hrYVc1bklHSmxZMkYxYzJVZ2QyVWdjbUZ1SUdFZ1luVnVZMmdnYjJZZ1kyOXRjSFYwWVhScGIyNXpJR0Z1WkNCM1pTQmhjbVZ1SjNSY2JseDBYSFJjZEM4dklISmxjWFZwY21Wa0lIUnZJR1pwYm1semFDQnplVzVqYUhKdmJtOTFjMng1TENCemJ5QjNaU2RrSUd4cGEyVWdkRzhnWjJsMlpTQjBhR1VnWlhabGJuUWdiRzl2Y0NCaFhHNWNkRngwWEhRdkx5QmphR0Z1WTJVdUlGZGxJSE5vYjNWc1pDQm1iSFZ6YUNCaFoyRnBiaUJ6YjI5dUxseHVYSFJjZEZ4MGFXWWdLRzl3ZEdsdmJuTXVabWx1YVhOb1UzbHVZMmh5YjI1dmRYTnNlU2tnZTF4dVhIUmNkRngwWEhSMGFISnZkeUJ1WlhjZ1JYSnliM0lvWENKemRHbHNiQ0JvWVhabElHMXZjbVVnZEc4Z1pHOC9YQ0lwTzF4MEx5OGdjMmh2ZFd4a2JpZDBJR2hoY0hCbGJseHVYSFJjZEZ4MGZWeHVYSFJjZEZ4MGMyVjBWR2x0Wlc5MWRDaHlaWEYxYVhKbFJteDFjMmdzSURFd0tUdGNibHgwWEhSOVhHNWNkSDFjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZZWFYwYjNKMWJseHVMeTljYmk4dklGSjFiaUJtS0NrdUlGSmxZMjl5WkNCcGRITWdaR1Z3Wlc1a1pXNWphV1Z6TGlCU1pYSjFiaUJwZENCM2FHVnVaWFpsY2lCMGFHVmNiaTh2SUdSbGNHVnVaR1Z1WTJsbGN5QmphR0Z1WjJVdVhHNHZMMXh1THk4Z1VtVjBkWEp1Y3lCaElHNWxkeUJEYjIxd2RYUmhkR2x2Yml3Z2QyaHBZMmdnYVhNZ1lXeHpieUJ3WVhOelpXUWdkRzhnWmk1Y2JpOHZYRzR2THlCTWFXNXJjeUIwYUdVZ1kyOXRjSFYwWVhScGIyNGdkRzhnZEdobElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNWNiaTh2SUhOdklIUm9ZWFFnYVhRZ2FYTWdjM1J2Y0hCbFpDQnBaaUIwYUdVZ1kzVnljbVZ1ZENCamIyMXdkWFJoZEdsdmJpQnBjeUJwYm5aaGJHbGtZWFJsWkM1Y2JseHVMeW9xWEc0Z0tpQkFZMkZzYkdKaFkyc2dWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVSblZ1WTNScGIyNWNiaUFxSUVCd1lYSmhiU0I3VkhKaFkydHlMa052YlhCMWRHRjBhVzl1ZlZ4dUlDb3ZYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRkoxYmlCaElHWjFibU4wYVc5dUlHNXZkeUJoYm1RZ2NtVnlkVzRnYVhRZ2JHRjBaWElnZDJobGJtVjJaWElnYVhSeklHUmxjR1Z1WkdWdVkybGxjMXh1SUNvZ1kyaGhibWRsTGlCU1pYUjFjbTV6SUdFZ1EyOXRjSFYwWVhScGIyNGdiMkpxWldOMElIUm9ZWFFnWTJGdUlHSmxJSFZ6WldRZ2RHOGdjM1J2Y0NCdmNpQnZZbk5sY25abElIUm9aVnh1SUNvZ2NtVnlkVzV1YVc1bkxseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjVHZFc1amRHbHZibjBnY25WdVJuVnVZeUJVYUdVZ1puVnVZM1JwYjI0Z2RHOGdjblZ1TGlCSmRDQnlaV05sYVhabGMxeHVJQ29nYjI1bElHRnlaM1Z0Wlc1ME9pQjBhR1VnUTI5dGNIVjBZWFJwYjI0Z2IySnFaV04wSUhSb1lYUWdkMmxzYkNCaVpTQnlaWFIxY201bFpDNWNiaUFxSUVCd1lYSmhiU0I3VDJKcVpXTjBmU0JiYjNCMGFXOXVjMTFjYmlBcUlFQndZWEpoYlNCN1JuVnVZM1JwYjI1OUlHOXdkR2x2Ym5NdWIyNUZjbkp2Y2lCUGNIUnBiMjVoYkM0Z1ZHaGxJR1oxYm1OMGFXOXVJSFJ2SUhKMWJpQjNhR1Z1SUdGdUlHVnljbTl5WEc0Z0tpQm9ZWEJ3Wlc1eklHbHVJSFJvWlNCRGIyMXdkWFJoZEdsdmJpNGdWR2hsSUc5dWJIa2dZWEpuZFcxbGJuUWdhWFFnY21WamFXVjJaWE1nYVhNZ2RHaGxJRVZ5Y205eVhHNGdLaUIwYUhKdmQyNHVJRVJsWm1GMWJIUnpJSFJ2SUhSb1pTQmxjbkp2Y2lCaVpXbHVaeUJzYjJkblpXUWdkRzhnZEdobElHTnZibk52YkdVdVhHNGdLaUJBY21WMGRYSnVjeUI3VkhKaFkydHlMa052YlhCMWRHRjBhVzl1ZlZ4dUlDb3ZYRzVVY21GamEzSXVZWFYwYjNKMWJpQTlJR1oxYm1OMGFXOXVJQ2htTENCdmNIUnBiMjV6TENCamRIZ3BJSHRjYmx4MGFXWWdLSFI1Y0dWdlppQm1JQ0U5UFNBblpuVnVZM1JwYjI0bktWeHVYSFJjZEhSb2NtOTNJRzVsZHlCRmNuSnZjaWduVkhKaFkydHlMbUYxZEc5eWRXNGdjbVZ4ZFdseVpYTWdZU0JtZFc1amRHbHZiaUJoY21kMWJXVnVkQ2NwTzF4dVhHNWNkRzl3ZEdsdmJuTWdQU0J2Y0hScGIyNXpJSHg4SUh0OU8xeHVYSFJwWmlBb1kzUjRLU0J2Y0hScGIyNXpMbU52Ym5SbGVIUWdQU0JqZEhnN1hHNWNibHgwWTI5dWMzUnlkV04wYVc1blEyOXRjSFYwWVhScGIyNGdQU0IwY25WbE8xeHVYSFIyWVhJZ1l5QTlJRzVsZHlCVWNtRmphM0l1UTI5dGNIVjBZWFJwYjI0b1hHNWNkRngwWml3Z1ZISmhZMnR5TG1OMWNuSmxiblJEYjIxd2RYUmhkR2x2Yml3Z2IzQjBhVzl1Y3lrN1hHNWNibHgwYVdZZ0tGUnlZV05yY2k1aFkzUnBkbVVwWEc1Y2RGeDBWSEpoWTJ0eUxtOXVTVzUyWVd4cFpHRjBaU2htZFc1amRHbHZiaUFvS1NCN1hHNWNkRngwWEhSakxuTjBiM0FvS1R0Y2JseDBYSFI5S1R0Y2JseHVYSFJ5WlhSMWNtNGdZenRjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZibTl1Y21WaFkzUnBkbVZjYmk4dlhHNHZMeUJTZFc0Z1lHWmdJSGRwZEdnZ2JtOGdZM1Z5Y21WdWRDQmpiMjF3ZFhSaGRHbHZiaXdnY21WMGRYSnVhVzVuSUhSb1pTQnlaWFIxY200Z2RtRnNkV1ZjYmk4dklHOW1JR0JtWUM1Y2RGVnpaV1FnZEc4Z2RIVnliaUJ2Wm1ZZ2NtVmhZM1JwZG1sMGVTQm1iM0lnZEdobElHUjFjbUYwYVc5dUlHOW1JR0JtWUN4Y2JpOHZJSE52SUhSb1lYUWdjbVZoWTNScGRtVWdaR0YwWVNCemIzVnlZMlZ6SUdGalkyVnpjMlZrSUdKNUlHQm1ZQ0IzYVd4c0lHNXZkQ0J5WlhOMWJIUWdhVzRnWVc1NVhHNHZMeUJqYjIxd2RYUmhkR2x2Ym5NZ1ltVnBibWNnYVc1MllXeHBaR0YwWldRdVhHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVblZ1SUdFZ1puVnVZM1JwYjI0Z2QybDBhRzkxZENCMGNtRmphMmx1WnlCa1pYQmxibVJsYm1OcFpYTXVYRzRnS2lCQWJHOWpkWE1nUTJ4cFpXNTBYRzRnS2lCQWNHRnlZVzBnZTBaMWJtTjBhVzl1ZlNCbWRXNWpJRUVnWm5WdVkzUnBiMjRnZEc4Z1kyRnNiQ0JwYlcxbFpHbGhkR1ZzZVM1Y2JpQXFMMXh1VkhKaFkydHlMbTV2YmxKbFlXTjBhWFpsSUQxY2JsUnlZV05yY2k1dWIyNXlaV0ZqZEdsMlpTQTlJR1oxYm1OMGFXOXVJQ2htTENCamRIZ3BJSHRjYmx4MGRtRnlJSEJ5WlhacGIzVnpJRDBnVkhKaFkydHlMbU4xY25KbGJuUkRiMjF3ZFhSaGRHbHZianRjYmx4MGMyVjBRM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVLRzUxYkd3cE8xeHVYSFIwY25rZ2UxeHVYSFJjZEhKbGRIVnliaUJtTG1OaGJHd29ZM1I0S1R0Y2JseDBmU0JtYVc1aGJHeDVJSHRjYmx4MFhIUnpaWFJEZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRvY0hKbGRtbHZkWE1wTzF4dVhIUjlYRzU5TzF4dVhHNHZMeUJzYVd0bElHNXZibkpsWVdOMGFYWmxJR0oxZENCdFlXdGxjeUJoSUdaMWJtTjBhVzl1SUdsdWMzUmxZV1JjYmxSeVlXTnJjaTV1YjI1U1pXRmpkR0ZpYkdVZ1BWeHVWSEpoWTJ0eUxtNXZibkpsWVdOMFlXSnNaU0E5SUdaMWJtTjBhVzl1SUNobUxDQmpkSGdwSUh0Y2JseDBjbVYwZFhKdUlHWjFibU4wYVc5dUtDa2dlMXh1WEhSY2RIWmhjaUJoY21keklEMGdZWEpuZFcxbGJuUnpPMXh1WEhSY2RHbG1JQ2hqZEhnZ1BUMGdiblZzYkNrZ1kzUjRJRDBnZEdocGN6dGNibHgwWEhSeVpYUjFjbTRnVkhKaFkydHlMbTV2Ym5KbFlXTjBhWFpsS0daMWJtTjBhVzl1S0NrZ2UxeHVYSFJjZEZ4MGNtVjBkWEp1SUdZdVlYQndiSGtvWTNSNExDQmhjbWR6S1R0Y2JseDBYSFI5S1R0Y2JseDBmVHRjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZiMjVwYm5aaGJHbGtZWFJsWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1VtVm5hWE4wWlhKeklHRWdibVYzSUZ0Z2IyNUpiblpoYkdsa1lYUmxZRjBvSTJOdmJYQjFkR0YwYVc5dVgyOXVhVzUyWVd4cFpHRjBaU2tnWTJGc2JHSmhZMnNnYjI0Z2RHaGxJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjRnS0hkb2FXTm9JRzExYzNRZ1pYaHBjM1FwTENCMGJ5QmlaU0JqWVd4c1pXUWdhVzF0WldScFlYUmxiSGtnZDJobGJpQjBhR1VnWTNWeWNtVnVkQ0JqYjIxd2RYUmhkR2x2YmlCcGN5QnBiblpoYkdsa1lYUmxaQ0J2Y2lCemRHOXdjR1ZrTGx4dUlDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dUlDb2dRSEJoY21GdElIdEdkVzVqZEdsdmJuMGdZMkZzYkdKaFkyc2dRU0JqWVd4c1ltRmpheUJtZFc1amRHbHZiaUIwYUdGMElIZHBiR3dnWW1VZ2FXNTJiMnRsWkNCaGN5QmdablZ1WXloaktXQXNJSGRvWlhKbElHQmpZQ0JwY3lCMGFHVWdZMjl0Y0hWMFlYUnBiMjRnYjI0Z2QyaHBZMmdnZEdobElHTmhiR3hpWVdOcklHbHpJSEpsWjJsemRHVnlaV1F1WEc0Z0tpOWNibFJ5WVdOcmNpNXZia2x1ZG1Gc2FXUmhkR1VnUFNCbWRXNWpkR2x2YmlBb1ppd2dZM1I0S1NCN1hHNWNkR2xtSUNnaElGUnlZV05yY2k1aFkzUnBkbVVwWEc1Y2RGeDBkR2h5YjNjZ2JtVjNJRVZ5Y205eUtGd2lWSEpoWTJ0eUxtOXVTVzUyWVd4cFpHRjBaU0J5WlhGMWFYSmxjeUJoSUdOMWNuSmxiblJEYjIxd2RYUmhkR2x2Ymx3aUtUdGNibHh1WEhSVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1TG05dVNXNTJZV3hwWkdGMFpTaG1MQ0JqZEhncE8xeHVmVHRjYmx4dUx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4amRISmhZMnRsY2w5aFpuUmxjbVpzZFhOb1hHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVMk5vWldSMWJHVnpJR0VnWm5WdVkzUnBiMjRnZEc4Z1ltVWdZMkZzYkdWa0lHUjFjbWx1WnlCMGFHVWdibVY0ZENCbWJIVnphQ3dnYjNJZ2JHRjBaWElnYVc0Z2RHaGxJR04xY25KbGJuUWdabXgxYzJnZ2FXWWdiMjVsSUdseklHbHVJSEJ5YjJkeVpYTnpMQ0JoWm5SbGNpQmhiR3dnYVc1MllXeHBaR0YwWldRZ1kyOXRjSFYwWVhScGIyNXpJR2hoZG1VZ1ltVmxiaUJ5WlhKMWJpNWNkRlJvWlNCbWRXNWpkR2x2YmlCM2FXeHNJR0psSUhKMWJpQnZibU5sSUdGdVpDQnViM1FnYjI0Z2MzVmljMlZ4ZFdWdWRDQm1iSFZ6YUdWeklIVnViR1Z6Y3lCZ1lXWjBaWEpHYkhWemFHQWdhWE1nWTJGc2JHVmtJR0ZuWVdsdUxseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRHZFc1amRHbHZibjBnWTJGc2JHSmhZMnNnUVNCbWRXNWpkR2x2YmlCMGJ5QmpZV3hzSUdGMElHWnNkWE5vSUhScGJXVXVYRzRnS2k5Y2JsUnlZV05yY2k1aFpuUmxja1pzZFhOb0lEMGdablZ1WTNScGIyNGdLR1lzSUdOMGVDa2dlMXh1WEhSaFpuUmxja1pzZFhOb1EyRnNiR0poWTJ0ekxuQjFjMmdvZXlCbWJqb2daaXdnWTNSNE9pQmpkSGdnZlNrN1hHNWNkSEpsY1hWcGNtVkdiSFZ6YUNncE8xeHVmVHRjYmlKZGZRPT0iLCIvLyAgICAgVW5kZXJzY29yZS5qcyAxLjguM1xuLy8gICAgIGh0dHA6Ly91bmRlcnNjb3JlanMub3JnXG4vLyAgICAgKGMpIDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuLy8gICAgIFVuZGVyc2NvcmUgbWF5IGJlIGZyZWVseSBkaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG5cbihmdW5jdGlvbigpIHtcblxuICAvLyBCYXNlbGluZSBzZXR1cFxuICAvLyAtLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEVzdGFibGlzaCB0aGUgcm9vdCBvYmplY3QsIGB3aW5kb3dgIGluIHRoZSBicm93c2VyLCBvciBgZXhwb3J0c2Agb24gdGhlIHNlcnZlci5cbiAgdmFyIHJvb3QgPSB0aGlzO1xuXG4gIC8vIFNhdmUgdGhlIHByZXZpb3VzIHZhbHVlIG9mIHRoZSBgX2AgdmFyaWFibGUuXG4gIHZhciBwcmV2aW91c1VuZGVyc2NvcmUgPSByb290Ll87XG5cbiAgLy8gU2F2ZSBieXRlcyBpbiB0aGUgbWluaWZpZWQgKGJ1dCBub3QgZ3ppcHBlZCkgdmVyc2lvbjpcbiAgdmFyIEFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGUsIE9ialByb3RvID0gT2JqZWN0LnByb3RvdHlwZSwgRnVuY1Byb3RvID0gRnVuY3Rpb24ucHJvdG90eXBlO1xuXG4gIC8vIENyZWF0ZSBxdWljayByZWZlcmVuY2UgdmFyaWFibGVzIGZvciBzcGVlZCBhY2Nlc3MgdG8gY29yZSBwcm90b3R5cGVzLlxuICB2YXJcbiAgICBwdXNoICAgICAgICAgICAgID0gQXJyYXlQcm90by5wdXNoLFxuICAgIHNsaWNlICAgICAgICAgICAgPSBBcnJheVByb3RvLnNsaWNlLFxuICAgIHRvU3RyaW5nICAgICAgICAgPSBPYmpQcm90by50b1N0cmluZyxcbiAgICBoYXNPd25Qcm9wZXJ0eSAgID0gT2JqUHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbiAgLy8gQWxsICoqRUNNQVNjcmlwdCA1KiogbmF0aXZlIGZ1bmN0aW9uIGltcGxlbWVudGF0aW9ucyB0aGF0IHdlIGhvcGUgdG8gdXNlXG4gIC8vIGFyZSBkZWNsYXJlZCBoZXJlLlxuICB2YXJcbiAgICBuYXRpdmVJc0FycmF5ICAgICAgPSBBcnJheS5pc0FycmF5LFxuICAgIG5hdGl2ZUtleXMgICAgICAgICA9IE9iamVjdC5rZXlzLFxuICAgIG5hdGl2ZUJpbmQgICAgICAgICA9IEZ1bmNQcm90by5iaW5kLFxuICAgIG5hdGl2ZUNyZWF0ZSAgICAgICA9IE9iamVjdC5jcmVhdGU7XG5cbiAgLy8gTmFrZWQgZnVuY3Rpb24gcmVmZXJlbmNlIGZvciBzdXJyb2dhdGUtcHJvdG90eXBlLXN3YXBwaW5nLlxuICB2YXIgQ3RvciA9IGZ1bmN0aW9uKCl7fTtcblxuICAvLyBDcmVhdGUgYSBzYWZlIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yIHVzZSBiZWxvdy5cbiAgdmFyIF8gPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqIGluc3RhbmNlb2YgXykgcmV0dXJuIG9iajtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgXykpIHJldHVybiBuZXcgXyhvYmopO1xuICAgIHRoaXMuX3dyYXBwZWQgPSBvYmo7XG4gIH07XG5cbiAgLy8gRXhwb3J0IHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgKipOb2RlLmpzKiosIHdpdGhcbiAgLy8gYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgZm9yIHRoZSBvbGQgYHJlcXVpcmUoKWAgQVBJLiBJZiB3ZSdyZSBpblxuICAvLyB0aGUgYnJvd3NlciwgYWRkIGBfYCBhcyBhIGdsb2JhbCBvYmplY3QuXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IF87XG4gICAgfVxuICAgIGV4cG9ydHMuXyA9IF87XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5fID0gXztcbiAgfVxuXG4gIC8vIEN1cnJlbnQgdmVyc2lvbi5cbiAgXy5WRVJTSU9OID0gJzEuOC4zJztcblxuICAvLyBJbnRlcm5hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gZWZmaWNpZW50IChmb3IgY3VycmVudCBlbmdpbmVzKSB2ZXJzaW9uXG4gIC8vIG9mIHRoZSBwYXNzZWQtaW4gY2FsbGJhY2ssIHRvIGJlIHJlcGVhdGVkbHkgYXBwbGllZCBpbiBvdGhlciBVbmRlcnNjb3JlXG4gIC8vIGZ1bmN0aW9ucy5cbiAgdmFyIG9wdGltaXplQ2IgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0LCBhcmdDb3VudCkge1xuICAgIGlmIChjb250ZXh0ID09PSB2b2lkIDApIHJldHVybiBmdW5jO1xuICAgIHN3aXRjaCAoYXJnQ291bnQgPT0gbnVsbCA/IDMgOiBhcmdDb3VudCkge1xuICAgICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSk7XG4gICAgICB9O1xuICAgICAgY2FzZSAyOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIG90aGVyKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIG90aGVyKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDM6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgICAgfTtcbiAgICAgIGNhc2UgNDogcmV0dXJuIGZ1bmN0aW9uKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCBhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBBIG1vc3RseS1pbnRlcm5hbCBmdW5jdGlvbiB0byBnZW5lcmF0ZSBjYWxsYmFja3MgdGhhdCBjYW4gYmUgYXBwbGllZFxuICAvLyB0byBlYWNoIGVsZW1lbnQgaW4gYSBjb2xsZWN0aW9uLCByZXR1cm5pbmcgdGhlIGRlc2lyZWQgcmVzdWx0IOKAlCBlaXRoZXJcbiAgLy8gaWRlbnRpdHksIGFuIGFyYml0cmFyeSBjYWxsYmFjaywgYSBwcm9wZXJ0eSBtYXRjaGVyLCBvciBhIHByb3BlcnR5IGFjY2Vzc29yLlxuICB2YXIgY2IgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCwgYXJnQ291bnQpIHtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkgcmV0dXJuIF8uaWRlbnRpdHk7XG4gICAgaWYgKF8uaXNGdW5jdGlvbih2YWx1ZSkpIHJldHVybiBvcHRpbWl6ZUNiKHZhbHVlLCBjb250ZXh0LCBhcmdDb3VudCk7XG4gICAgaWYgKF8uaXNPYmplY3QodmFsdWUpKSByZXR1cm4gXy5tYXRjaGVyKHZhbHVlKTtcbiAgICByZXR1cm4gXy5wcm9wZXJ0eSh2YWx1ZSk7XG4gIH07XG4gIF8uaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBjYih2YWx1ZSwgY29udGV4dCwgSW5maW5pdHkpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhc3NpZ25lciBmdW5jdGlvbnMuXG4gIHZhciBjcmVhdGVBc3NpZ25lciA9IGZ1bmN0aW9uKGtleXNGdW5jLCB1bmRlZmluZWRPbmx5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICBpZiAobGVuZ3RoIDwgMiB8fCBvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMTsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpbmRleF0sXG4gICAgICAgICAgICBrZXlzID0ga2V5c0Z1bmMoc291cmNlKSxcbiAgICAgICAgICAgIGwgPSBrZXlzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICBpZiAoIXVuZGVmaW5lZE9ubHkgfHwgb2JqW2tleV0gPT09IHZvaWQgMCkgb2JqW2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhIG5ldyBvYmplY3QgdGhhdCBpbmhlcml0cyBmcm9tIGFub3RoZXIuXG4gIHZhciBiYXNlQ3JlYXRlID0gZnVuY3Rpb24ocHJvdG90eXBlKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KHByb3RvdHlwZSkpIHJldHVybiB7fTtcbiAgICBpZiAobmF0aXZlQ3JlYXRlKSByZXR1cm4gbmF0aXZlQ3JlYXRlKHByb3RvdHlwZSk7XG4gICAgQ3Rvci5wcm90b3R5cGUgPSBwcm90b3R5cGU7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBDdG9yO1xuICAgIEN0b3IucHJvdG90eXBlID0gbnVsbDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIHZhciBwcm9wZXJ0eSA9IGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBvYmogPT0gbnVsbCA/IHZvaWQgMCA6IG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gSGVscGVyIGZvciBjb2xsZWN0aW9uIG1ldGhvZHMgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYSBjb2xsZWN0aW9uXG4gIC8vIHNob3VsZCBiZSBpdGVyYXRlZCBhcyBhbiBhcnJheSBvciBhcyBhbiBvYmplY3RcbiAgLy8gUmVsYXRlZDogaHR0cDovL3Blb3BsZS5tb3ppbGxhLm9yZy9+am9yZW5kb3JmZi9lczYtZHJhZnQuaHRtbCNzZWMtdG9sZW5ndGhcbiAgLy8gQXZvaWRzIGEgdmVyeSBuYXN0eSBpT1MgOCBKSVQgYnVnIG9uIEFSTS02NC4gIzIwOTRcbiAgdmFyIE1BWF9BUlJBWV9JTkRFWCA9IE1hdGgucG93KDIsIDUzKSAtIDE7XG4gIHZhciBnZXRMZW5ndGggPSBwcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gIHZhciBpc0FycmF5TGlrZSA9IGZ1bmN0aW9uKGNvbGxlY3Rpb24pIHtcbiAgICB2YXIgbGVuZ3RoID0gZ2V0TGVuZ3RoKGNvbGxlY3Rpb24pO1xuICAgIHJldHVybiB0eXBlb2YgbGVuZ3RoID09ICdudW1iZXInICYmIGxlbmd0aCA+PSAwICYmIGxlbmd0aCA8PSBNQVhfQVJSQVlfSU5ERVg7XG4gIH07XG5cbiAgLy8gQ29sbGVjdGlvbiBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBUaGUgY29ybmVyc3RvbmUsIGFuIGBlYWNoYCBpbXBsZW1lbnRhdGlvbiwgYWthIGBmb3JFYWNoYC5cbiAgLy8gSGFuZGxlcyByYXcgb2JqZWN0cyBpbiBhZGRpdGlvbiB0byBhcnJheS1saWtlcy4gVHJlYXRzIGFsbFxuICAvLyBzcGFyc2UgYXJyYXktbGlrZXMgYXMgaWYgdGhleSB3ZXJlIGRlbnNlLlxuICBfLmVhY2ggPSBfLmZvckVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIgaSwgbGVuZ3RoO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopKSB7XG4gICAgICBmb3IgKGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaXRlcmF0ZWUob2JqW2ldLCBpLCBvYmopO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgICAgZm9yIChpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpdGVyYXRlZShvYmpba2V5c1tpXV0sIGtleXNbaV0sIG9iaik7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRlZSB0byBlYWNoIGVsZW1lbnQuXG4gIF8ubWFwID0gXy5jb2xsZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoLFxuICAgICAgICByZXN1bHRzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgcmVzdWx0c1tpbmRleF0gPSBpdGVyYXRlZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIHJlZHVjaW5nIGZ1bmN0aW9uIGl0ZXJhdGluZyBsZWZ0IG9yIHJpZ2h0LlxuICBmdW5jdGlvbiBjcmVhdGVSZWR1Y2UoZGlyKSB7XG4gICAgLy8gT3B0aW1pemVkIGl0ZXJhdG9yIGZ1bmN0aW9uIGFzIHVzaW5nIGFyZ3VtZW50cy5sZW5ndGhcbiAgICAvLyBpbiB0aGUgbWFpbiBmdW5jdGlvbiB3aWxsIGRlb3B0aW1pemUgdGhlLCBzZWUgIzE5OTEuXG4gICAgZnVuY3Rpb24gaXRlcmF0b3Iob2JqLCBpdGVyYXRlZSwgbWVtbywga2V5cywgaW5kZXgsIGxlbmd0aCkge1xuICAgICAgZm9yICg7IGluZGV4ID49IDAgJiYgaW5kZXggPCBsZW5ndGg7IGluZGV4ICs9IGRpcikge1xuICAgICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgICBtZW1vID0gaXRlcmF0ZWUobWVtbywgb2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGNvbnRleHQpIHtcbiAgICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCwgNCk7XG4gICAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoLFxuICAgICAgICAgIGluZGV4ID0gZGlyID4gMCA/IDAgOiBsZW5ndGggLSAxO1xuICAgICAgLy8gRGV0ZXJtaW5lIHRoZSBpbml0aWFsIHZhbHVlIGlmIG5vbmUgaXMgcHJvdmlkZWQuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgbWVtbyA9IG9ialtrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleF07XG4gICAgICAgIGluZGV4ICs9IGRpcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpdGVyYXRvcihvYmosIGl0ZXJhdGVlLCBtZW1vLCBrZXlzLCBpbmRleCwgbGVuZ3RoKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gKipSZWR1Y2UqKiBidWlsZHMgdXAgYSBzaW5nbGUgcmVzdWx0IGZyb20gYSBsaXN0IG9mIHZhbHVlcywgYWthIGBpbmplY3RgLFxuICAvLyBvciBgZm9sZGxgLlxuICBfLnJlZHVjZSA9IF8uZm9sZGwgPSBfLmluamVjdCA9IGNyZWF0ZVJlZHVjZSgxKTtcblxuICAvLyBUaGUgcmlnaHQtYXNzb2NpYXRpdmUgdmVyc2lvbiBvZiByZWR1Y2UsIGFsc28ga25vd24gYXMgYGZvbGRyYC5cbiAgXy5yZWR1Y2VSaWdodCA9IF8uZm9sZHIgPSBjcmVhdGVSZWR1Y2UoLTEpO1xuXG4gIC8vIFJldHVybiB0aGUgZmlyc3QgdmFsdWUgd2hpY2ggcGFzc2VzIGEgdHJ1dGggdGVzdC4gQWxpYXNlZCBhcyBgZGV0ZWN0YC5cbiAgXy5maW5kID0gXy5kZXRlY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHZhciBrZXk7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHtcbiAgICAgIGtleSA9IF8uZmluZEluZGV4KG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAga2V5ID0gXy5maW5kS2V5KG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKGtleSAhPT0gdm9pZCAwICYmIGtleSAhPT0gLTEpIHJldHVybiBvYmpba2V5XTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyB0aGF0IHBhc3MgYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBzZWxlY3RgLlxuICBfLmZpbHRlciA9IF8uc2VsZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAocHJlZGljYXRlKHZhbHVlLCBpbmRleCwgbGlzdCkpIHJlc3VsdHMucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgZm9yIHdoaWNoIGEgdHJ1dGggdGVzdCBmYWlscy5cbiAgXy5yZWplY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIF8ubmVnYXRlKGNiKHByZWRpY2F0ZSkpLCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgd2hldGhlciBhbGwgb2YgdGhlIGVsZW1lbnRzIG1hdGNoIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgYWxsYC5cbiAgXy5ldmVyeSA9IF8uYWxsID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICBpZiAoIXByZWRpY2F0ZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIGF0IGxlYXN0IG9uZSBlbGVtZW50IGluIHRoZSBvYmplY3QgbWF0Y2hlcyBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYGFueWAuXG4gIF8uc29tZSA9IF8uYW55ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgdGhlIGFycmF5IG9yIG9iamVjdCBjb250YWlucyBhIGdpdmVuIGl0ZW0gKHVzaW5nIGA9PT1gKS5cbiAgLy8gQWxpYXNlZCBhcyBgaW5jbHVkZXNgIGFuZCBgaW5jbHVkZWAuXG4gIF8uY29udGFpbnMgPSBfLmluY2x1ZGVzID0gXy5pbmNsdWRlID0gZnVuY3Rpb24ob2JqLCBpdGVtLCBmcm9tSW5kZXgsIGd1YXJkKSB7XG4gICAgaWYgKCFpc0FycmF5TGlrZShvYmopKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgIGlmICh0eXBlb2YgZnJvbUluZGV4ICE9ICdudW1iZXInIHx8IGd1YXJkKSBmcm9tSW5kZXggPSAwO1xuICAgIHJldHVybiBfLmluZGV4T2Yob2JqLCBpdGVtLCBmcm9tSW5kZXgpID49IDA7XG4gIH07XG5cbiAgLy8gSW52b2tlIGEgbWV0aG9kICh3aXRoIGFyZ3VtZW50cykgb24gZXZlcnkgaXRlbSBpbiBhIGNvbGxlY3Rpb24uXG4gIF8uaW52b2tlID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgaXNGdW5jID0gXy5pc0Z1bmN0aW9uKG1ldGhvZCk7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHZhciBmdW5jID0gaXNGdW5jID8gbWV0aG9kIDogdmFsdWVbbWV0aG9kXTtcbiAgICAgIHJldHVybiBmdW5jID09IG51bGwgPyBmdW5jIDogZnVuYy5hcHBseSh2YWx1ZSwgYXJncyk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgbWFwYDogZmV0Y2hpbmcgYSBwcm9wZXJ0eS5cbiAgXy5wbHVjayA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgXy5wcm9wZXJ0eShrZXkpKTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaWx0ZXJgOiBzZWxlY3Rpbmcgb25seSBvYmplY3RzXG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ud2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgXy5tYXRjaGVyKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmluZGA6IGdldHRpbmcgdGhlIGZpcnN0IG9iamVjdFxuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmZpbmRXaGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy5maW5kKG9iaiwgXy5tYXRjaGVyKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtYXhpbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1heCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gLUluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSAtSW5maW5pdHksXG4gICAgICAgIHZhbHVlLCBjb21wdXRlZDtcbiAgICBpZiAoaXRlcmF0ZWUgPT0gbnVsbCAmJiBvYmogIT0gbnVsbCkge1xuICAgICAgb2JqID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhbHVlID0gb2JqW2ldO1xuICAgICAgICBpZiAodmFsdWUgPiByZXN1bHQpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgICAgIGlmIChjb21wdXRlZCA+IGxhc3RDb21wdXRlZCB8fCBjb21wdXRlZCA9PT0gLUluZmluaXR5ICYmIHJlc3VsdCA9PT0gLUluZmluaXR5KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgICAgbGFzdENvbXB1dGVkID0gY29tcHV0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWluaW11bSBlbGVtZW50IChvciBlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgXy5taW4gPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IEluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSBJbmZpbml0eSxcbiAgICAgICAgdmFsdWUsIGNvbXB1dGVkO1xuICAgIGlmIChpdGVyYXRlZSA9PSBudWxsICYmIG9iaiAhPSBudWxsKSB7XG4gICAgICBvYmogPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFsdWUgPSBvYmpbaV07XG4gICAgICAgIGlmICh2YWx1ZSA8IHJlc3VsdCkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICAgICAgaWYgKGNvbXB1dGVkIDwgbGFzdENvbXB1dGVkIHx8IGNvbXB1dGVkID09PSBJbmZpbml0eSAmJiByZXN1bHQgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgICAgbGFzdENvbXB1dGVkID0gY29tcHV0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFNodWZmbGUgYSBjb2xsZWN0aW9uLCB1c2luZyB0aGUgbW9kZXJuIHZlcnNpb24gb2YgdGhlXG4gIC8vIFtGaXNoZXItWWF0ZXMgc2h1ZmZsZV0oaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9GaXNoZXLigJNZYXRlc19zaHVmZmxlKS5cbiAgXy5zaHVmZmxlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHNldCA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBzZXQubGVuZ3RoO1xuICAgIHZhciBzaHVmZmxlZCA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwLCByYW5kOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgcmFuZCA9IF8ucmFuZG9tKDAsIGluZGV4KTtcbiAgICAgIGlmIChyYW5kICE9PSBpbmRleCkgc2h1ZmZsZWRbaW5kZXhdID0gc2h1ZmZsZWRbcmFuZF07XG4gICAgICBzaHVmZmxlZFtyYW5kXSA9IHNldFtpbmRleF07XG4gICAgfVxuICAgIHJldHVybiBzaHVmZmxlZDtcbiAgfTtcblxuICAvLyBTYW1wbGUgKipuKiogcmFuZG9tIHZhbHVlcyBmcm9tIGEgY29sbGVjdGlvbi5cbiAgLy8gSWYgKipuKiogaXMgbm90IHNwZWNpZmllZCwgcmV0dXJucyBhIHNpbmdsZSByYW5kb20gZWxlbWVudC5cbiAgLy8gVGhlIGludGVybmFsIGBndWFyZGAgYXJndW1lbnQgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgbWFwYC5cbiAgXy5zYW1wbGUgPSBmdW5jdGlvbihvYmosIG4sIGd1YXJkKSB7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkge1xuICAgICAgaWYgKCFpc0FycmF5TGlrZShvYmopKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgICAgcmV0dXJuIG9ialtfLnJhbmRvbShvYmoubGVuZ3RoIC0gMSldO1xuICAgIH1cbiAgICByZXR1cm4gXy5zaHVmZmxlKG9iaikuc2xpY2UoMCwgTWF0aC5tYXgoMCwgbikpO1xuICB9O1xuXG4gIC8vIFNvcnQgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiBwcm9kdWNlZCBieSBhbiBpdGVyYXRlZS5cbiAgXy5zb3J0QnkgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgcmV0dXJuIF8ucGx1Y2soXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgaW5kZXg6IGluZGV4LFxuICAgICAgICBjcml0ZXJpYTogaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KVxuICAgICAgfTtcbiAgICB9KS5zb3J0KGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWE7XG4gICAgICB2YXIgYiA9IHJpZ2h0LmNyaXRlcmlhO1xuICAgICAgaWYgKGEgIT09IGIpIHtcbiAgICAgICAgaWYgKGEgPiBiIHx8IGEgPT09IHZvaWQgMCkgcmV0dXJuIDE7XG4gICAgICAgIGlmIChhIDwgYiB8fCBiID09PSB2b2lkIDApIHJldHVybiAtMTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsZWZ0LmluZGV4IC0gcmlnaHQuaW5kZXg7XG4gICAgfSksICd2YWx1ZScpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIHVzZWQgZm9yIGFnZ3JlZ2F0ZSBcImdyb3VwIGJ5XCIgb3BlcmF0aW9ucy5cbiAgdmFyIGdyb3VwID0gZnVuY3Rpb24oYmVoYXZpb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgICAgdmFyIGtleSA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgb2JqKTtcbiAgICAgICAgYmVoYXZpb3IocmVzdWx0LCB2YWx1ZSwga2V5KTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEdyb3VwcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLiBQYXNzIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGVcbiAgLy8gdG8gZ3JvdXAgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBjcml0ZXJpb24uXG4gIF8uZ3JvdXBCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIGlmIChfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldLnB1c2godmFsdWUpOyBlbHNlIHJlc3VsdFtrZXldID0gW3ZhbHVlXTtcbiAgfSk7XG5cbiAgLy8gSW5kZXhlcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLCBzaW1pbGFyIHRvIGBncm91cEJ5YCwgYnV0IGZvclxuICAvLyB3aGVuIHlvdSBrbm93IHRoYXQgeW91ciBpbmRleCB2YWx1ZXMgd2lsbCBiZSB1bmlxdWUuXG4gIF8uaW5kZXhCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gIH0pO1xuXG4gIC8vIENvdW50cyBpbnN0YW5jZXMgb2YgYW4gb2JqZWN0IHRoYXQgZ3JvdXAgYnkgYSBjZXJ0YWluIGNyaXRlcmlvbi4gUGFzc1xuICAvLyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlIHRvIGNvdW50IGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGVcbiAgLy8gY3JpdGVyaW9uLlxuICBfLmNvdW50QnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIHZhbHVlLCBrZXkpIHtcbiAgICBpZiAoXy5oYXMocmVzdWx0LCBrZXkpKSByZXN1bHRba2V5XSsrOyBlbHNlIHJlc3VsdFtrZXldID0gMTtcbiAgfSk7XG5cbiAgLy8gU2FmZWx5IGNyZWF0ZSBhIHJlYWwsIGxpdmUgYXJyYXkgZnJvbSBhbnl0aGluZyBpdGVyYWJsZS5cbiAgXy50b0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFvYmopIHJldHVybiBbXTtcbiAgICBpZiAoXy5pc0FycmF5KG9iaikpIHJldHVybiBzbGljZS5jYWxsKG9iaik7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHJldHVybiBfLm1hcChvYmosIF8uaWRlbnRpdHkpO1xuICAgIHJldHVybiBfLnZhbHVlcyhvYmopO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzIGluIGFuIG9iamVjdC5cbiAgXy5zaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gMDtcbiAgICByZXR1cm4gaXNBcnJheUxpa2Uob2JqKSA/IG9iai5sZW5ndGggOiBfLmtleXMob2JqKS5sZW5ndGg7XG4gIH07XG5cbiAgLy8gU3BsaXQgYSBjb2xsZWN0aW9uIGludG8gdHdvIGFycmF5czogb25lIHdob3NlIGVsZW1lbnRzIGFsbCBzYXRpc2Z5IHRoZSBnaXZlblxuICAvLyBwcmVkaWNhdGUsIGFuZCBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIGRvIG5vdCBzYXRpc2Z5IHRoZSBwcmVkaWNhdGUuXG4gIF8ucGFydGl0aW9uID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBwYXNzID0gW10sIGZhaWwgPSBbXTtcbiAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBvYmopIHtcbiAgICAgIChwcmVkaWNhdGUodmFsdWUsIGtleSwgb2JqKSA/IHBhc3MgOiBmYWlsKS5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gW3Bhc3MsIGZhaWxdO1xuICB9O1xuXG4gIC8vIEFycmF5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAvLyBHZXQgdGhlIGZpcnN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGZpcnN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgaGVhZGAgYW5kIGB0YWtlYC4gVGhlICoqZ3VhcmQqKiBjaGVja1xuICAvLyBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8uZmlyc3QgPSBfLmhlYWQgPSBfLnRha2UgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbMF07XG4gICAgcmV0dXJuIF8uaW5pdGlhbChhcnJheSwgYXJyYXkubGVuZ3RoIC0gbik7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgbGFzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEVzcGVjaWFsbHkgdXNlZnVsIG9uXG4gIC8vIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIGFsbCB0aGUgdmFsdWVzIGluXG4gIC8vIHRoZSBhcnJheSwgZXhjbHVkaW5nIHRoZSBsYXN0IE4uXG4gIF8uaW5pdGlhbCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCAwLCBNYXRoLm1heCgwLCBhcnJheS5sZW5ndGggLSAobiA9PSBudWxsIHx8IGd1YXJkID8gMSA6IG4pKSk7XG4gIH07XG5cbiAgLy8gR2V0IHRoZSBsYXN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGxhc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LlxuICBfLmxhc3QgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbYXJyYXkubGVuZ3RoIC0gMV07XG4gICAgcmV0dXJuIF8ucmVzdChhcnJheSwgTWF0aC5tYXgoMCwgYXJyYXkubGVuZ3RoIC0gbikpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGZpcnN0IGVudHJ5IG9mIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgdGFpbGAgYW5kIGBkcm9wYC5cbiAgLy8gRXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgYW4gKipuKiogd2lsbCByZXR1cm5cbiAgLy8gdGhlIHJlc3QgTiB2YWx1ZXMgaW4gdGhlIGFycmF5LlxuICBfLnJlc3QgPSBfLnRhaWwgPSBfLmRyb3AgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgbiA9PSBudWxsIHx8IGd1YXJkID8gMSA6IG4pO1xuICB9O1xuXG4gIC8vIFRyaW0gb3V0IGFsbCBmYWxzeSB2YWx1ZXMgZnJvbSBhbiBhcnJheS5cbiAgXy5jb21wYWN0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIF8uaWRlbnRpdHkpO1xuICB9O1xuXG4gIC8vIEludGVybmFsIGltcGxlbWVudGF0aW9uIG9mIGEgcmVjdXJzaXZlIGBmbGF0dGVuYCBmdW5jdGlvbi5cbiAgdmFyIGZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgc2hhbGxvdywgc3RyaWN0LCBzdGFydEluZGV4KSB7XG4gICAgdmFyIG91dHB1dCA9IFtdLCBpZHggPSAwO1xuICAgIGZvciAodmFyIGkgPSBzdGFydEluZGV4IHx8IDAsIGxlbmd0aCA9IGdldExlbmd0aChpbnB1dCk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHZhbHVlID0gaW5wdXRbaV07XG4gICAgICBpZiAoaXNBcnJheUxpa2UodmFsdWUpICYmIChfLmlzQXJyYXkodmFsdWUpIHx8IF8uaXNBcmd1bWVudHModmFsdWUpKSkge1xuICAgICAgICAvL2ZsYXR0ZW4gY3VycmVudCBsZXZlbCBvZiBhcnJheSBvciBhcmd1bWVudHMgb2JqZWN0XG4gICAgICAgIGlmICghc2hhbGxvdykgdmFsdWUgPSBmbGF0dGVuKHZhbHVlLCBzaGFsbG93LCBzdHJpY3QpO1xuICAgICAgICB2YXIgaiA9IDAsIGxlbiA9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgb3V0cHV0Lmxlbmd0aCArPSBsZW47XG4gICAgICAgIHdoaWxlIChqIDwgbGVuKSB7XG4gICAgICAgICAgb3V0cHV0W2lkeCsrXSA9IHZhbHVlW2orK107XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIXN0cmljdCkge1xuICAgICAgICBvdXRwdXRbaWR4KytdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXQ7XG4gIH07XG5cbiAgLy8gRmxhdHRlbiBvdXQgYW4gYXJyYXksIGVpdGhlciByZWN1cnNpdmVseSAoYnkgZGVmYXVsdCksIG9yIGp1c3Qgb25lIGxldmVsLlxuICBfLmZsYXR0ZW4gPSBmdW5jdGlvbihhcnJheSwgc2hhbGxvdykge1xuICAgIHJldHVybiBmbGF0dGVuKGFycmF5LCBzaGFsbG93LCBmYWxzZSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgdmVyc2lvbiBvZiB0aGUgYXJyYXkgdGhhdCBkb2VzIG5vdCBjb250YWluIHRoZSBzcGVjaWZpZWQgdmFsdWUocykuXG4gIF8ud2l0aG91dCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZGlmZmVyZW5jZShhcnJheSwgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGEgZHVwbGljYXRlLWZyZWUgdmVyc2lvbiBvZiB0aGUgYXJyYXkuIElmIHRoZSBhcnJheSBoYXMgYWxyZWFkeVxuICAvLyBiZWVuIHNvcnRlZCwgeW91IGhhdmUgdGhlIG9wdGlvbiBvZiB1c2luZyBhIGZhc3RlciBhbGdvcml0aG0uXG4gIC8vIEFsaWFzZWQgYXMgYHVuaXF1ZWAuXG4gIF8udW5pcSA9IF8udW5pcXVlID0gZnVuY3Rpb24oYXJyYXksIGlzU29ydGVkLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGlmICghXy5pc0Jvb2xlYW4oaXNTb3J0ZWQpKSB7XG4gICAgICBjb250ZXh0ID0gaXRlcmF0ZWU7XG4gICAgICBpdGVyYXRlZSA9IGlzU29ydGVkO1xuICAgICAgaXNTb3J0ZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGl0ZXJhdGVlICE9IG51bGwpIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgc2VlbiA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB2YWx1ZSA9IGFycmF5W2ldLFxuICAgICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUgPyBpdGVyYXRlZSh2YWx1ZSwgaSwgYXJyYXkpIDogdmFsdWU7XG4gICAgICBpZiAoaXNTb3J0ZWQpIHtcbiAgICAgICAgaWYgKCFpIHx8IHNlZW4gIT09IGNvbXB1dGVkKSByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgIHNlZW4gPSBjb21wdXRlZDtcbiAgICAgIH0gZWxzZSBpZiAoaXRlcmF0ZWUpIHtcbiAgICAgICAgaWYgKCFfLmNvbnRhaW5zKHNlZW4sIGNvbXB1dGVkKSkge1xuICAgICAgICAgIHNlZW4ucHVzaChjb21wdXRlZCk7XG4gICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFfLmNvbnRhaW5zKHJlc3VsdCwgdmFsdWUpKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgdGhlIHVuaW9uOiBlYWNoIGRpc3RpbmN0IGVsZW1lbnQgZnJvbSBhbGwgb2ZcbiAgLy8gdGhlIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8udW5pb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bmlxKGZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCB0cnVlKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIGV2ZXJ5IGl0ZW0gc2hhcmVkIGJldHdlZW4gYWxsIHRoZVxuICAvLyBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLmludGVyc2VjdGlvbiA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHZhciBhcmdzTGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaXRlbSA9IGFycmF5W2ldO1xuICAgICAgaWYgKF8uY29udGFpbnMocmVzdWx0LCBpdGVtKSkgY29udGludWU7XG4gICAgICBmb3IgKHZhciBqID0gMTsgaiA8IGFyZ3NMZW5ndGg7IGorKykge1xuICAgICAgICBpZiAoIV8uY29udGFpbnMoYXJndW1lbnRzW2pdLCBpdGVtKSkgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoaiA9PT0gYXJnc0xlbmd0aCkgcmVzdWx0LnB1c2goaXRlbSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gVGFrZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIG9uZSBhcnJheSBhbmQgYSBudW1iZXIgb2Ygb3RoZXIgYXJyYXlzLlxuICAvLyBPbmx5IHRoZSBlbGVtZW50cyBwcmVzZW50IGluIGp1c3QgdGhlIGZpcnN0IGFycmF5IHdpbGwgcmVtYWluLlxuICBfLmRpZmZlcmVuY2UgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN0ID0gZmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUsIDEpO1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgZnVuY3Rpb24odmFsdWUpe1xuICAgICAgcmV0dXJuICFfLmNvbnRhaW5zKHJlc3QsIHZhbHVlKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBaaXAgdG9nZXRoZXIgbXVsdGlwbGUgbGlzdHMgaW50byBhIHNpbmdsZSBhcnJheSAtLSBlbGVtZW50cyB0aGF0IHNoYXJlXG4gIC8vIGFuIGluZGV4IGdvIHRvZ2V0aGVyLlxuICBfLnppcCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuemlwKGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgLy8gQ29tcGxlbWVudCBvZiBfLnppcC4gVW56aXAgYWNjZXB0cyBhbiBhcnJheSBvZiBhcnJheXMgYW5kIGdyb3Vwc1xuICAvLyBlYWNoIGFycmF5J3MgZWxlbWVudHMgb24gc2hhcmVkIGluZGljZXNcbiAgXy51bnppcCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIGxlbmd0aCA9IGFycmF5ICYmIF8ubWF4KGFycmF5LCBnZXRMZW5ndGgpLmxlbmd0aCB8fCAwO1xuICAgIHZhciByZXN1bHQgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgcmVzdWx0W2luZGV4XSA9IF8ucGx1Y2soYXJyYXksIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBDb252ZXJ0cyBsaXN0cyBpbnRvIG9iamVjdHMuIFBhc3MgZWl0aGVyIGEgc2luZ2xlIGFycmF5IG9mIGBba2V5LCB2YWx1ZV1gXG4gIC8vIHBhaXJzLCBvciB0d28gcGFyYWxsZWwgYXJyYXlzIG9mIHRoZSBzYW1lIGxlbmd0aCAtLSBvbmUgb2Yga2V5cywgYW5kIG9uZSBvZlxuICAvLyB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZXMuXG4gIF8ub2JqZWN0ID0gZnVuY3Rpb24obGlzdCwgdmFsdWVzKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgobGlzdCk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHZhbHVlcykge1xuICAgICAgICByZXN1bHRbbGlzdFtpXV0gPSB2YWx1ZXNbaV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRbbGlzdFtpXVswXV0gPSBsaXN0W2ldWzFdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIEdlbmVyYXRvciBmdW5jdGlvbiB0byBjcmVhdGUgdGhlIGZpbmRJbmRleCBhbmQgZmluZExhc3RJbmRleCBmdW5jdGlvbnNcbiAgZnVuY3Rpb24gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoZGlyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFycmF5LCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgICB2YXIgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTtcbiAgICAgIHZhciBpbmRleCA9IGRpciA+IDAgPyAwIDogbGVuZ3RoIC0gMTtcbiAgICAgIGZvciAoOyBpbmRleCA+PSAwICYmIGluZGV4IDwgbGVuZ3RoOyBpbmRleCArPSBkaXIpIHtcbiAgICAgICAgaWYgKHByZWRpY2F0ZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSkpIHJldHVybiBpbmRleDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgaW5kZXggb24gYW4gYXJyYXktbGlrZSB0aGF0IHBhc3NlcyBhIHByZWRpY2F0ZSB0ZXN0XG4gIF8uZmluZEluZGV4ID0gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoMSk7XG4gIF8uZmluZExhc3RJbmRleCA9IGNyZWF0ZVByZWRpY2F0ZUluZGV4RmluZGVyKC0xKTtcblxuICAvLyBVc2UgYSBjb21wYXJhdG9yIGZ1bmN0aW9uIHRvIGZpZ3VyZSBvdXQgdGhlIHNtYWxsZXN0IGluZGV4IGF0IHdoaWNoXG4gIC8vIGFuIG9iamVjdCBzaG91bGQgYmUgaW5zZXJ0ZWQgc28gYXMgdG8gbWFpbnRhaW4gb3JkZXIuIFVzZXMgYmluYXJ5IHNlYXJjaC5cbiAgXy5zb3J0ZWRJbmRleCA9IGZ1bmN0aW9uKGFycmF5LCBvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCwgMSk7XG4gICAgdmFyIHZhbHVlID0gaXRlcmF0ZWUob2JqKTtcbiAgICB2YXIgbG93ID0gMCwgaGlnaCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgd2hpbGUgKGxvdyA8IGhpZ2gpIHtcbiAgICAgIHZhciBtaWQgPSBNYXRoLmZsb29yKChsb3cgKyBoaWdoKSAvIDIpO1xuICAgICAgaWYgKGl0ZXJhdGVlKGFycmF5W21pZF0pIDwgdmFsdWUpIGxvdyA9IG1pZCArIDE7IGVsc2UgaGlnaCA9IG1pZDtcbiAgICB9XG4gICAgcmV0dXJuIGxvdztcbiAgfTtcblxuICAvLyBHZW5lcmF0b3IgZnVuY3Rpb24gdG8gY3JlYXRlIHRoZSBpbmRleE9mIGFuZCBsYXN0SW5kZXhPZiBmdW5jdGlvbnNcbiAgZnVuY3Rpb24gY3JlYXRlSW5kZXhGaW5kZXIoZGlyLCBwcmVkaWNhdGVGaW5kLCBzb3J0ZWRJbmRleCkge1xuICAgIHJldHVybiBmdW5jdGlvbihhcnJheSwgaXRlbSwgaWR4KSB7XG4gICAgICB2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgICBpZiAodHlwZW9mIGlkeCA9PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAoZGlyID4gMCkge1xuICAgICAgICAgICAgaSA9IGlkeCA+PSAwID8gaWR4IDogTWF0aC5tYXgoaWR4ICsgbGVuZ3RoLCBpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbmd0aCA9IGlkeCA+PSAwID8gTWF0aC5taW4oaWR4ICsgMSwgbGVuZ3RoKSA6IGlkeCArIGxlbmd0aCArIDE7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc29ydGVkSW5kZXggJiYgaWR4ICYmIGxlbmd0aCkge1xuICAgICAgICBpZHggPSBzb3J0ZWRJbmRleChhcnJheSwgaXRlbSk7XG4gICAgICAgIHJldHVybiBhcnJheVtpZHhdID09PSBpdGVtID8gaWR4IDogLTE7XG4gICAgICB9XG4gICAgICBpZiAoaXRlbSAhPT0gaXRlbSkge1xuICAgICAgICBpZHggPSBwcmVkaWNhdGVGaW5kKHNsaWNlLmNhbGwoYXJyYXksIGksIGxlbmd0aCksIF8uaXNOYU4pO1xuICAgICAgICByZXR1cm4gaWR4ID49IDAgPyBpZHggKyBpIDogLTE7XG4gICAgICB9XG4gICAgICBmb3IgKGlkeCA9IGRpciA+IDAgPyBpIDogbGVuZ3RoIC0gMTsgaWR4ID49IDAgJiYgaWR4IDwgbGVuZ3RoOyBpZHggKz0gZGlyKSB7XG4gICAgICAgIGlmIChhcnJheVtpZHhdID09PSBpdGVtKSByZXR1cm4gaWR4O1xuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBvY2N1cnJlbmNlIG9mIGFuIGl0ZW0gaW4gYW4gYXJyYXksXG4gIC8vIG9yIC0xIGlmIHRoZSBpdGVtIGlzIG5vdCBpbmNsdWRlZCBpbiB0aGUgYXJyYXkuXG4gIC8vIElmIHRoZSBhcnJheSBpcyBsYXJnZSBhbmQgYWxyZWFkeSBpbiBzb3J0IG9yZGVyLCBwYXNzIGB0cnVlYFxuICAvLyBmb3IgKippc1NvcnRlZCoqIHRvIHVzZSBiaW5hcnkgc2VhcmNoLlxuICBfLmluZGV4T2YgPSBjcmVhdGVJbmRleEZpbmRlcigxLCBfLmZpbmRJbmRleCwgXy5zb3J0ZWRJbmRleCk7XG4gIF8ubGFzdEluZGV4T2YgPSBjcmVhdGVJbmRleEZpbmRlcigtMSwgXy5maW5kTGFzdEluZGV4KTtcblxuICAvLyBHZW5lcmF0ZSBhbiBpbnRlZ2VyIEFycmF5IGNvbnRhaW5pbmcgYW4gYXJpdGhtZXRpYyBwcm9ncmVzc2lvbi4gQSBwb3J0IG9mXG4gIC8vIHRoZSBuYXRpdmUgUHl0aG9uIGByYW5nZSgpYCBmdW5jdGlvbi4gU2VlXG4gIC8vIFt0aGUgUHl0aG9uIGRvY3VtZW50YXRpb25dKGh0dHA6Ly9kb2NzLnB5dGhvbi5vcmcvbGlicmFyeS9mdW5jdGlvbnMuaHRtbCNyYW5nZSkuXG4gIF8ucmFuZ2UgPSBmdW5jdGlvbihzdGFydCwgc3RvcCwgc3RlcCkge1xuICAgIGlmIChzdG9wID09IG51bGwpIHtcbiAgICAgIHN0b3AgPSBzdGFydCB8fCAwO1xuICAgICAgc3RhcnQgPSAwO1xuICAgIH1cbiAgICBzdGVwID0gc3RlcCB8fCAxO1xuXG4gICAgdmFyIGxlbmd0aCA9IE1hdGgubWF4KE1hdGguY2VpbCgoc3RvcCAtIHN0YXJ0KSAvIHN0ZXApLCAwKTtcbiAgICB2YXIgcmFuZ2UgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaWR4ID0gMDsgaWR4IDwgbGVuZ3RoOyBpZHgrKywgc3RhcnQgKz0gc3RlcCkge1xuICAgICAgcmFuZ2VbaWR4XSA9IHN0YXJ0O1xuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfTtcblxuICAvLyBGdW5jdGlvbiAoYWhlbSkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIERldGVybWluZXMgd2hldGhlciB0byBleGVjdXRlIGEgZnVuY3Rpb24gYXMgYSBjb25zdHJ1Y3RvclxuICAvLyBvciBhIG5vcm1hbCBmdW5jdGlvbiB3aXRoIHRoZSBwcm92aWRlZCBhcmd1bWVudHNcbiAgdmFyIGV4ZWN1dGVCb3VuZCA9IGZ1bmN0aW9uKHNvdXJjZUZ1bmMsIGJvdW5kRnVuYywgY29udGV4dCwgY2FsbGluZ0NvbnRleHQsIGFyZ3MpIHtcbiAgICBpZiAoIShjYWxsaW5nQ29udGV4dCBpbnN0YW5jZW9mIGJvdW5kRnVuYykpIHJldHVybiBzb3VyY2VGdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgIHZhciBzZWxmID0gYmFzZUNyZWF0ZShzb3VyY2VGdW5jLnByb3RvdHlwZSk7XG4gICAgdmFyIHJlc3VsdCA9IHNvdXJjZUZ1bmMuYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgaWYgKF8uaXNPYmplY3QocmVzdWx0KSkgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gc2VsZjtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSBmdW5jdGlvbiBib3VuZCB0byBhIGdpdmVuIG9iamVjdCAoYXNzaWduaW5nIGB0aGlzYCwgYW5kIGFyZ3VtZW50cyxcbiAgLy8gb3B0aW9uYWxseSkuIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBGdW5jdGlvbi5iaW5kYCBpZlxuICAvLyBhdmFpbGFibGUuXG4gIF8uYmluZCA9IGZ1bmN0aW9uKGZ1bmMsIGNvbnRleHQpIHtcbiAgICBpZiAobmF0aXZlQmluZCAmJiBmdW5jLmJpbmQgPT09IG5hdGl2ZUJpbmQpIHJldHVybiBuYXRpdmVCaW5kLmFwcGx5KGZ1bmMsIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgaWYgKCFfLmlzRnVuY3Rpb24oZnVuYykpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0JpbmQgbXVzdCBiZSBjYWxsZWQgb24gYSBmdW5jdGlvbicpO1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBib3VuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4ZWN1dGVCb3VuZChmdW5jLCBib3VuZCwgY29udGV4dCwgdGhpcywgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbiAgICByZXR1cm4gYm91bmQ7XG4gIH07XG5cbiAgLy8gUGFydGlhbGx5IGFwcGx5IGEgZnVuY3Rpb24gYnkgY3JlYXRpbmcgYSB2ZXJzaW9uIHRoYXQgaGFzIGhhZCBzb21lIG9mIGl0c1xuICAvLyBhcmd1bWVudHMgcHJlLWZpbGxlZCwgd2l0aG91dCBjaGFuZ2luZyBpdHMgZHluYW1pYyBgdGhpc2AgY29udGV4dC4gXyBhY3RzXG4gIC8vIGFzIGEgcGxhY2Vob2xkZXIsIGFsbG93aW5nIGFueSBjb21iaW5hdGlvbiBvZiBhcmd1bWVudHMgdG8gYmUgcHJlLWZpbGxlZC5cbiAgXy5wYXJ0aWFsID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciBib3VuZEFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgdmFyIGJvdW5kID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcG9zaXRpb24gPSAwLCBsZW5ndGggPSBib3VuZEFyZ3MubGVuZ3RoO1xuICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW5ndGgpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBhcmdzW2ldID0gYm91bmRBcmdzW2ldID09PSBfID8gYXJndW1lbnRzW3Bvc2l0aW9uKytdIDogYm91bmRBcmdzW2ldO1xuICAgICAgfVxuICAgICAgd2hpbGUgKHBvc2l0aW9uIDwgYXJndW1lbnRzLmxlbmd0aCkgYXJncy5wdXNoKGFyZ3VtZW50c1twb3NpdGlvbisrXSk7XG4gICAgICByZXR1cm4gZXhlY3V0ZUJvdW5kKGZ1bmMsIGJvdW5kLCB0aGlzLCB0aGlzLCBhcmdzKTtcbiAgICB9O1xuICAgIHJldHVybiBib3VuZDtcbiAgfTtcblxuICAvLyBCaW5kIGEgbnVtYmVyIG9mIGFuIG9iamVjdCdzIG1ldGhvZHMgdG8gdGhhdCBvYmplY3QuIFJlbWFpbmluZyBhcmd1bWVudHNcbiAgLy8gYXJlIHRoZSBtZXRob2QgbmFtZXMgdG8gYmUgYm91bmQuIFVzZWZ1bCBmb3IgZW5zdXJpbmcgdGhhdCBhbGwgY2FsbGJhY2tzXG4gIC8vIGRlZmluZWQgb24gYW4gb2JqZWN0IGJlbG9uZyB0byBpdC5cbiAgXy5iaW5kQWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGksIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsIGtleTtcbiAgICBpZiAobGVuZ3RoIDw9IDEpIHRocm93IG5ldyBFcnJvcignYmluZEFsbCBtdXN0IGJlIHBhc3NlZCBmdW5jdGlvbiBuYW1lcycpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAga2V5ID0gYXJndW1lbnRzW2ldO1xuICAgICAgb2JqW2tleV0gPSBfLmJpbmQob2JqW2tleV0sIG9iaik7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gTWVtb2l6ZSBhbiBleHBlbnNpdmUgZnVuY3Rpb24gYnkgc3RvcmluZyBpdHMgcmVzdWx0cy5cbiAgXy5tZW1vaXplID0gZnVuY3Rpb24oZnVuYywgaGFzaGVyKSB7XG4gICAgdmFyIG1lbW9pemUgPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBjYWNoZSA9IG1lbW9pemUuY2FjaGU7XG4gICAgICB2YXIgYWRkcmVzcyA9ICcnICsgKGhhc2hlciA/IGhhc2hlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpIDoga2V5KTtcbiAgICAgIGlmICghXy5oYXMoY2FjaGUsIGFkZHJlc3MpKSBjYWNoZVthZGRyZXNzXSA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBjYWNoZVthZGRyZXNzXTtcbiAgICB9O1xuICAgIG1lbW9pemUuY2FjaGUgPSB7fTtcbiAgICByZXR1cm4gbWVtb2l6ZTtcbiAgfTtcblxuICAvLyBEZWxheXMgYSBmdW5jdGlvbiBmb3IgdGhlIGdpdmVuIG51bWJlciBvZiBtaWxsaXNlY29uZHMsIGFuZCB0aGVuIGNhbGxzXG4gIC8vIGl0IHdpdGggdGhlIGFyZ3VtZW50cyBzdXBwbGllZC5cbiAgXy5kZWxheSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgfSwgd2FpdCk7XG4gIH07XG5cbiAgLy8gRGVmZXJzIGEgZnVuY3Rpb24sIHNjaGVkdWxpbmcgaXQgdG8gcnVuIGFmdGVyIHRoZSBjdXJyZW50IGNhbGwgc3RhY2sgaGFzXG4gIC8vIGNsZWFyZWQuXG4gIF8uZGVmZXIgPSBfLnBhcnRpYWwoXy5kZWxheSwgXywgMSk7XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCB3aGVuIGludm9rZWQsIHdpbGwgb25seSBiZSB0cmlnZ2VyZWQgYXQgbW9zdCBvbmNlXG4gIC8vIGR1cmluZyBhIGdpdmVuIHdpbmRvdyBvZiB0aW1lLiBOb3JtYWxseSwgdGhlIHRocm90dGxlZCBmdW5jdGlvbiB3aWxsIHJ1blxuICAvLyBhcyBtdWNoIGFzIGl0IGNhbiwgd2l0aG91dCBldmVyIGdvaW5nIG1vcmUgdGhhbiBvbmNlIHBlciBgd2FpdGAgZHVyYXRpb247XG4gIC8vIGJ1dCBpZiB5b3UnZCBsaWtlIHRvIGRpc2FibGUgdGhlIGV4ZWN1dGlvbiBvbiB0aGUgbGVhZGluZyBlZGdlLCBwYXNzXG4gIC8vIGB7bGVhZGluZzogZmFsc2V9YC4gVG8gZGlzYWJsZSBleGVjdXRpb24gb24gdGhlIHRyYWlsaW5nIGVkZ2UsIGRpdHRvLlxuICBfLnRocm90dGxlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgb3B0aW9ucykge1xuICAgIHZhciBjb250ZXh0LCBhcmdzLCByZXN1bHQ7XG4gICAgdmFyIHRpbWVvdXQgPSBudWxsO1xuICAgIHZhciBwcmV2aW91cyA9IDA7XG4gICAgaWYgKCFvcHRpb25zKSBvcHRpb25zID0ge307XG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICBwcmV2aW91cyA9IG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UgPyAwIDogXy5ub3coKTtcbiAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgIH07XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG5vdyA9IF8ubm93KCk7XG4gICAgICBpZiAoIXByZXZpb3VzICYmIG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UpIHByZXZpb3VzID0gbm93O1xuICAgICAgdmFyIHJlbWFpbmluZyA9IHdhaXQgLSAobm93IC0gcHJldmlvdXMpO1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwIHx8IHJlbWFpbmluZyA+IHdhaXQpIHtcbiAgICAgICAgaWYgKHRpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgcHJldmlvdXMgPSBub3c7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgfSBlbHNlIGlmICghdGltZW91dCAmJiBvcHRpb25zLnRyYWlsaW5nICE9PSBmYWxzZSkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIGFzIGxvbmcgYXMgaXQgY29udGludWVzIHRvIGJlIGludm9rZWQsIHdpbGwgbm90XG4gIC8vIGJlIHRyaWdnZXJlZC4gVGhlIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGFmdGVyIGl0IHN0b3BzIGJlaW5nIGNhbGxlZCBmb3JcbiAgLy8gTiBtaWxsaXNlY29uZHMuIElmIGBpbW1lZGlhdGVgIGlzIHBhc3NlZCwgdHJpZ2dlciB0aGUgZnVuY3Rpb24gb24gdGhlXG4gIC8vIGxlYWRpbmcgZWRnZSwgaW5zdGVhZCBvZiB0aGUgdHJhaWxpbmcuXG4gIF8uZGVib3VuY2UgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBpbW1lZGlhdGUpIHtcbiAgICB2YXIgdGltZW91dCwgYXJncywgY29udGV4dCwgdGltZXN0YW1wLCByZXN1bHQ7XG5cbiAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBsYXN0ID0gXy5ub3coKSAtIHRpbWVzdGFtcDtcblxuICAgICAgaWYgKGxhc3QgPCB3YWl0ICYmIGxhc3QgPj0gMCkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCAtIGxhc3QpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIGlmICghaW1tZWRpYXRlKSB7XG4gICAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBjb250ZXh0ID0gdGhpcztcbiAgICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICB0aW1lc3RhbXAgPSBfLm5vdygpO1xuICAgICAgdmFyIGNhbGxOb3cgPSBpbW1lZGlhdGUgJiYgIXRpbWVvdXQ7XG4gICAgICBpZiAoIXRpbWVvdXQpIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0KTtcbiAgICAgIGlmIChjYWxsTm93KSB7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGZ1bmN0aW9uIHBhc3NlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgc2Vjb25kLFxuICAvLyBhbGxvd2luZyB5b3UgdG8gYWRqdXN0IGFyZ3VtZW50cywgcnVuIGNvZGUgYmVmb3JlIGFuZCBhZnRlciwgYW5kXG4gIC8vIGNvbmRpdGlvbmFsbHkgZXhlY3V0ZSB0aGUgb3JpZ2luYWwgZnVuY3Rpb24uXG4gIF8ud3JhcCA9IGZ1bmN0aW9uKGZ1bmMsIHdyYXBwZXIpIHtcbiAgICByZXR1cm4gXy5wYXJ0aWFsKHdyYXBwZXIsIGZ1bmMpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBuZWdhdGVkIHZlcnNpb24gb2YgdGhlIHBhc3NlZC1pbiBwcmVkaWNhdGUuXG4gIF8ubmVnYXRlID0gZnVuY3Rpb24ocHJlZGljYXRlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuICFwcmVkaWNhdGUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGlzIHRoZSBjb21wb3NpdGlvbiBvZiBhIGxpc3Qgb2YgZnVuY3Rpb25zLCBlYWNoXG4gIC8vIGNvbnN1bWluZyB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmdW5jdGlvbiB0aGF0IGZvbGxvd3MuXG4gIF8uY29tcG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgIHZhciBzdGFydCA9IGFyZ3MubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaSA9IHN0YXJ0O1xuICAgICAgdmFyIHJlc3VsdCA9IGFyZ3Nbc3RhcnRdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB3aGlsZSAoaS0tKSByZXN1bHQgPSBhcmdzW2ldLmNhbGwodGhpcywgcmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgb24gYW5kIGFmdGVyIHRoZSBOdGggY2FsbC5cbiAgXy5hZnRlciA9IGZ1bmN0aW9uKHRpbWVzLCBmdW5jKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKC0tdGltZXMgPCAxKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgdXAgdG8gKGJ1dCBub3QgaW5jbHVkaW5nKSB0aGUgTnRoIGNhbGwuXG4gIF8uYmVmb3JlID0gZnVuY3Rpb24odGltZXMsIGZ1bmMpIHtcbiAgICB2YXIgbWVtbztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoLS10aW1lcyA+IDApIHtcbiAgICAgICAgbWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICAgIGlmICh0aW1lcyA8PSAxKSBmdW5jID0gbnVsbDtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBleGVjdXRlZCBhdCBtb3N0IG9uZSB0aW1lLCBubyBtYXR0ZXIgaG93XG4gIC8vIG9mdGVuIHlvdSBjYWxsIGl0LiBVc2VmdWwgZm9yIGxhenkgaW5pdGlhbGl6YXRpb24uXG4gIF8ub25jZSA9IF8ucGFydGlhbChfLmJlZm9yZSwgMik7XG5cbiAgLy8gT2JqZWN0IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gS2V5cyBpbiBJRSA8IDkgdGhhdCB3b24ndCBiZSBpdGVyYXRlZCBieSBgZm9yIGtleSBpbiAuLi5gIGFuZCB0aHVzIG1pc3NlZC5cbiAgdmFyIGhhc0VudW1CdWcgPSAhe3RvU3RyaW5nOiBudWxsfS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKTtcbiAgdmFyIG5vbkVudW1lcmFibGVQcm9wcyA9IFsndmFsdWVPZicsICdpc1Byb3RvdHlwZU9mJywgJ3RvU3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLCAnaGFzT3duUHJvcGVydHknLCAndG9Mb2NhbGVTdHJpbmcnXTtcblxuICBmdW5jdGlvbiBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cykge1xuICAgIHZhciBub25FbnVtSWR4ID0gbm9uRW51bWVyYWJsZVByb3BzLmxlbmd0aDtcbiAgICB2YXIgY29uc3RydWN0b3IgPSBvYmouY29uc3RydWN0b3I7XG4gICAgdmFyIHByb3RvID0gKF8uaXNGdW5jdGlvbihjb25zdHJ1Y3RvcikgJiYgY29uc3RydWN0b3IucHJvdG90eXBlKSB8fCBPYmpQcm90bztcblxuICAgIC8vIENvbnN0cnVjdG9yIGlzIGEgc3BlY2lhbCBjYXNlLlxuICAgIHZhciBwcm9wID0gJ2NvbnN0cnVjdG9yJztcbiAgICBpZiAoXy5oYXMob2JqLCBwcm9wKSAmJiAhXy5jb250YWlucyhrZXlzLCBwcm9wKSkga2V5cy5wdXNoKHByb3ApO1xuXG4gICAgd2hpbGUgKG5vbkVudW1JZHgtLSkge1xuICAgICAgcHJvcCA9IG5vbkVudW1lcmFibGVQcm9wc1tub25FbnVtSWR4XTtcbiAgICAgIGlmIChwcm9wIGluIG9iaiAmJiBvYmpbcHJvcF0gIT09IHByb3RvW3Byb3BdICYmICFfLmNvbnRhaW5zKGtleXMsIHByb3ApKSB7XG4gICAgICAgIGtleXMucHVzaChwcm9wKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZXRyaWV2ZSB0aGUgbmFtZXMgb2YgYW4gb2JqZWN0J3Mgb3duIHByb3BlcnRpZXMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBPYmplY3Qua2V5c2BcbiAgXy5rZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBbXTtcbiAgICBpZiAobmF0aXZlS2V5cykgcmV0dXJuIG5hdGl2ZUtleXMob2JqKTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICAgIC8vIEFoZW0sIElFIDwgOS5cbiAgICBpZiAoaGFzRW51bUJ1ZykgY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpO1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIGFsbCB0aGUgcHJvcGVydHkgbmFtZXMgb2YgYW4gb2JqZWN0LlxuICBfLmFsbEtleXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIFtdO1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikga2V5cy5wdXNoKGtleSk7XG4gICAgLy8gQWhlbSwgSUUgPCA5LlxuICAgIGlmIChoYXNFbnVtQnVnKSBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cyk7XG4gICAgcmV0dXJuIGtleXM7XG4gIH07XG5cbiAgLy8gUmV0cmlldmUgdGhlIHZhbHVlcyBvZiBhbiBvYmplY3QncyBwcm9wZXJ0aWVzLlxuICBfLnZhbHVlcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIHZhciB2YWx1ZXMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhbHVlc1tpXSA9IG9ialtrZXlzW2ldXTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfTtcblxuICAvLyBSZXR1cm5zIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRlZSB0byBlYWNoIGVsZW1lbnQgb2YgdGhlIG9iamVjdFxuICAvLyBJbiBjb250cmFzdCB0byBfLm1hcCBpdCByZXR1cm5zIGFuIG9iamVjdFxuICBfLm1hcE9iamVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICBfLmtleXMob2JqKSxcbiAgICAgICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgICAgICByZXN1bHRzID0ge30sXG4gICAgICAgICAgY3VycmVudEtleTtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgY3VycmVudEtleSA9IGtleXNbaW5kZXhdO1xuICAgICAgICByZXN1bHRzW2N1cnJlbnRLZXldID0gaXRlcmF0ZWUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ29udmVydCBhbiBvYmplY3QgaW50byBhIGxpc3Qgb2YgYFtrZXksIHZhbHVlXWAgcGFpcnMuXG4gIF8ucGFpcnMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB2YXIgcGFpcnMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHBhaXJzW2ldID0gW2tleXNbaV0sIG9ialtrZXlzW2ldXV07XG4gICAgfVxuICAgIHJldHVybiBwYWlycztcbiAgfTtcblxuICAvLyBJbnZlcnQgdGhlIGtleXMgYW5kIHZhbHVlcyBvZiBhbiBvYmplY3QuIFRoZSB2YWx1ZXMgbXVzdCBiZSBzZXJpYWxpemFibGUuXG4gIF8uaW52ZXJ0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHJlc3VsdFtvYmpba2V5c1tpXV1dID0ga2V5c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBzb3J0ZWQgbGlzdCBvZiB0aGUgZnVuY3Rpb24gbmFtZXMgYXZhaWxhYmxlIG9uIHRoZSBvYmplY3QuXG4gIC8vIEFsaWFzZWQgYXMgYG1ldGhvZHNgXG4gIF8uZnVuY3Rpb25zID0gXy5tZXRob2RzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIG5hbWVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKF8uaXNGdW5jdGlvbihvYmpba2V5XSkpIG5hbWVzLnB1c2goa2V5KTtcbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzLnNvcnQoKTtcbiAgfTtcblxuICAvLyBFeHRlbmQgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIHByb3BlcnRpZXMgaW4gcGFzc2VkLWluIG9iamVjdChzKS5cbiAgXy5leHRlbmQgPSBjcmVhdGVBc3NpZ25lcihfLmFsbEtleXMpO1xuXG4gIC8vIEFzc2lnbnMgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIG93biBwcm9wZXJ0aWVzIGluIHRoZSBwYXNzZWQtaW4gb2JqZWN0KHMpXG4gIC8vIChodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3QvYXNzaWduKVxuICBfLmV4dGVuZE93biA9IF8uYXNzaWduID0gY3JlYXRlQXNzaWduZXIoXy5rZXlzKTtcblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBrZXkgb24gYW4gb2JqZWN0IHRoYXQgcGFzc2VzIGEgcHJlZGljYXRlIHRlc3RcbiAgXy5maW5kS2V5ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaiksIGtleTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAga2V5ID0ga2V5c1tpXTtcbiAgICAgIGlmIChwcmVkaWNhdGUob2JqW2tleV0sIGtleSwgb2JqKSkgcmV0dXJuIGtleTtcbiAgICB9XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IG9ubHkgY29udGFpbmluZyB0aGUgd2hpdGVsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5waWNrID0gZnVuY3Rpb24ob2JqZWN0LCBvaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0ge30sIG9iaiA9IG9iamVjdCwgaXRlcmF0ZWUsIGtleXM7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChfLmlzRnVuY3Rpb24ob2l0ZXJhdGVlKSkge1xuICAgICAga2V5cyA9IF8uYWxsS2V5cyhvYmopO1xuICAgICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKG9pdGVyYXRlZSwgY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtleXMgPSBmbGF0dGVuKGFyZ3VtZW50cywgZmFsc2UsIGZhbHNlLCAxKTtcbiAgICAgIGl0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGtleSwgb2JqKSB7IHJldHVybiBrZXkgaW4gb2JqOyB9O1xuICAgICAgb2JqID0gT2JqZWN0KG9iaik7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIHZhciB2YWx1ZSA9IG9ialtrZXldO1xuICAgICAgaWYgKGl0ZXJhdGVlKHZhbHVlLCBrZXksIG9iaikpIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCB3aXRob3V0IHRoZSBibGFja2xpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLm9taXQgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihpdGVyYXRlZSkpIHtcbiAgICAgIGl0ZXJhdGVlID0gXy5uZWdhdGUoaXRlcmF0ZWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIga2V5cyA9IF8ubWFwKGZsYXR0ZW4oYXJndW1lbnRzLCBmYWxzZSwgZmFsc2UsIDEpLCBTdHJpbmcpO1xuICAgICAgaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgICAgIHJldHVybiAhXy5jb250YWlucyhrZXlzLCBrZXkpO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIF8ucGljayhvYmosIGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBGaWxsIGluIGEgZ2l2ZW4gb2JqZWN0IHdpdGggZGVmYXVsdCBwcm9wZXJ0aWVzLlxuICBfLmRlZmF1bHRzID0gY3JlYXRlQXNzaWduZXIoXy5hbGxLZXlzLCB0cnVlKTtcblxuICAvLyBDcmVhdGVzIGFuIG9iamVjdCB0aGF0IGluaGVyaXRzIGZyb20gdGhlIGdpdmVuIHByb3RvdHlwZSBvYmplY3QuXG4gIC8vIElmIGFkZGl0aW9uYWwgcHJvcGVydGllcyBhcmUgcHJvdmlkZWQgdGhlbiB0aGV5IHdpbGwgYmUgYWRkZWQgdG8gdGhlXG4gIC8vIGNyZWF0ZWQgb2JqZWN0LlxuICBfLmNyZWF0ZSA9IGZ1bmN0aW9uKHByb3RvdHlwZSwgcHJvcHMpIHtcbiAgICB2YXIgcmVzdWx0ID0gYmFzZUNyZWF0ZShwcm90b3R5cGUpO1xuICAgIGlmIChwcm9wcykgXy5leHRlbmRPd24ocmVzdWx0LCBwcm9wcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSAoc2hhbGxvdy1jbG9uZWQpIGR1cGxpY2F0ZSBvZiBhbiBvYmplY3QuXG4gIF8uY2xvbmUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIG9iajtcbiAgICByZXR1cm4gXy5pc0FycmF5KG9iaikgPyBvYmouc2xpY2UoKSA6IF8uZXh0ZW5kKHt9LCBvYmopO1xuICB9O1xuXG4gIC8vIEludm9rZXMgaW50ZXJjZXB0b3Igd2l0aCB0aGUgb2JqLCBhbmQgdGhlbiByZXR1cm5zIG9iai5cbiAgLy8gVGhlIHByaW1hcnkgcHVycG9zZSBvZiB0aGlzIG1ldGhvZCBpcyB0byBcInRhcCBpbnRvXCIgYSBtZXRob2QgY2hhaW4sIGluXG4gIC8vIG9yZGVyIHRvIHBlcmZvcm0gb3BlcmF0aW9ucyBvbiBpbnRlcm1lZGlhdGUgcmVzdWx0cyB3aXRoaW4gdGhlIGNoYWluLlxuICBfLnRhcCA9IGZ1bmN0aW9uKG9iaiwgaW50ZXJjZXB0b3IpIHtcbiAgICBpbnRlcmNlcHRvcihvYmopO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJucyB3aGV0aGVyIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBzZXQgb2YgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uaXNNYXRjaCA9IGZ1bmN0aW9uKG9iamVjdCwgYXR0cnMpIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhhdHRycyksIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkgcmV0dXJuICFsZW5ndGg7XG4gICAgdmFyIG9iaiA9IE9iamVjdChvYmplY3QpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgaWYgKGF0dHJzW2tleV0gIT09IG9ialtrZXldIHx8ICEoa2V5IGluIG9iaikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cblxuICAvLyBJbnRlcm5hbCByZWN1cnNpdmUgY29tcGFyaXNvbiBmdW5jdGlvbiBmb3IgYGlzRXF1YWxgLlxuICB2YXIgZXEgPSBmdW5jdGlvbihhLCBiLCBhU3RhY2ssIGJTdGFjaykge1xuICAgIC8vIElkZW50aWNhbCBvYmplY3RzIGFyZSBlcXVhbC4gYDAgPT09IC0wYCwgYnV0IHRoZXkgYXJlbid0IGlkZW50aWNhbC5cbiAgICAvLyBTZWUgdGhlIFtIYXJtb255IGBlZ2FsYCBwcm9wb3NhbF0oaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9aGFybW9ueTplZ2FsKS5cbiAgICBpZiAoYSA9PT0gYikgcmV0dXJuIGEgIT09IDAgfHwgMSAvIGEgPT09IDEgLyBiO1xuICAgIC8vIEEgc3RyaWN0IGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5IGJlY2F1c2UgYG51bGwgPT0gdW5kZWZpbmVkYC5cbiAgICBpZiAoYSA9PSBudWxsIHx8IGIgPT0gbnVsbCkgcmV0dXJuIGEgPT09IGI7XG4gICAgLy8gVW53cmFwIGFueSB3cmFwcGVkIG9iamVjdHMuXG4gICAgaWYgKGEgaW5zdGFuY2VvZiBfKSBhID0gYS5fd3JhcHBlZDtcbiAgICBpZiAoYiBpbnN0YW5jZW9mIF8pIGIgPSBiLl93cmFwcGVkO1xuICAgIC8vIENvbXBhcmUgYFtbQ2xhc3NdXWAgbmFtZXMuXG4gICAgdmFyIGNsYXNzTmFtZSA9IHRvU3RyaW5nLmNhbGwoYSk7XG4gICAgaWYgKGNsYXNzTmFtZSAhPT0gdG9TdHJpbmcuY2FsbChiKSkgcmV0dXJuIGZhbHNlO1xuICAgIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgICAvLyBTdHJpbmdzLCBudW1iZXJzLCByZWd1bGFyIGV4cHJlc3Npb25zLCBkYXRlcywgYW5kIGJvb2xlYW5zIGFyZSBjb21wYXJlZCBieSB2YWx1ZS5cbiAgICAgIGNhc2UgJ1tvYmplY3QgUmVnRXhwXSc6XG4gICAgICAvLyBSZWdFeHBzIGFyZSBjb2VyY2VkIHRvIHN0cmluZ3MgZm9yIGNvbXBhcmlzb24gKE5vdGU6ICcnICsgL2EvaSA9PT0gJy9hL2knKVxuICAgICAgY2FzZSAnW29iamVjdCBTdHJpbmddJzpcbiAgICAgICAgLy8gUHJpbWl0aXZlcyBhbmQgdGhlaXIgY29ycmVzcG9uZGluZyBvYmplY3Qgd3JhcHBlcnMgYXJlIGVxdWl2YWxlbnQ7IHRodXMsIGBcIjVcImAgaXNcbiAgICAgICAgLy8gZXF1aXZhbGVudCB0byBgbmV3IFN0cmluZyhcIjVcIilgLlxuICAgICAgICByZXR1cm4gJycgKyBhID09PSAnJyArIGI7XG4gICAgICBjYXNlICdbb2JqZWN0IE51bWJlcl0nOlxuICAgICAgICAvLyBgTmFOYHMgYXJlIGVxdWl2YWxlbnQsIGJ1dCBub24tcmVmbGV4aXZlLlxuICAgICAgICAvLyBPYmplY3QoTmFOKSBpcyBlcXVpdmFsZW50IHRvIE5hTlxuICAgICAgICBpZiAoK2EgIT09ICthKSByZXR1cm4gK2IgIT09ICtiO1xuICAgICAgICAvLyBBbiBgZWdhbGAgY29tcGFyaXNvbiBpcyBwZXJmb3JtZWQgZm9yIG90aGVyIG51bWVyaWMgdmFsdWVzLlxuICAgICAgICByZXR1cm4gK2EgPT09IDAgPyAxIC8gK2EgPT09IDEgLyBiIDogK2EgPT09ICtiO1xuICAgICAgY2FzZSAnW29iamVjdCBEYXRlXSc6XG4gICAgICBjYXNlICdbb2JqZWN0IEJvb2xlYW5dJzpcbiAgICAgICAgLy8gQ29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1lcmljIHByaW1pdGl2ZSB2YWx1ZXMuIERhdGVzIGFyZSBjb21wYXJlZCBieSB0aGVpclxuICAgICAgICAvLyBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnMuIE5vdGUgdGhhdCBpbnZhbGlkIGRhdGVzIHdpdGggbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zXG4gICAgICAgIC8vIG9mIGBOYU5gIGFyZSBub3QgZXF1aXZhbGVudC5cbiAgICAgICAgcmV0dXJuICthID09PSArYjtcbiAgICB9XG5cbiAgICB2YXIgYXJlQXJyYXlzID0gY2xhc3NOYW1lID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIGlmICghYXJlQXJyYXlzKSB7XG4gICAgICBpZiAodHlwZW9mIGEgIT0gJ29iamVjdCcgfHwgdHlwZW9mIGIgIT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcblxuICAgICAgLy8gT2JqZWN0cyB3aXRoIGRpZmZlcmVudCBjb25zdHJ1Y3RvcnMgYXJlIG5vdCBlcXVpdmFsZW50LCBidXQgYE9iamVjdGBzIG9yIGBBcnJheWBzXG4gICAgICAvLyBmcm9tIGRpZmZlcmVudCBmcmFtZXMgYXJlLlxuICAgICAgdmFyIGFDdG9yID0gYS5jb25zdHJ1Y3RvciwgYkN0b3IgPSBiLmNvbnN0cnVjdG9yO1xuICAgICAgaWYgKGFDdG9yICE9PSBiQ3RvciAmJiAhKF8uaXNGdW5jdGlvbihhQ3RvcikgJiYgYUN0b3IgaW5zdGFuY2VvZiBhQ3RvciAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uaXNGdW5jdGlvbihiQ3RvcikgJiYgYkN0b3IgaW5zdGFuY2VvZiBiQ3RvcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgKCdjb25zdHJ1Y3RvcicgaW4gYSAmJiAnY29uc3RydWN0b3InIGluIGIpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gQXNzdW1lIGVxdWFsaXR5IGZvciBjeWNsaWMgc3RydWN0dXJlcy4gVGhlIGFsZ29yaXRobSBmb3IgZGV0ZWN0aW5nIGN5Y2xpY1xuICAgIC8vIHN0cnVjdHVyZXMgaXMgYWRhcHRlZCBmcm9tIEVTIDUuMSBzZWN0aW9uIDE1LjEyLjMsIGFic3RyYWN0IG9wZXJhdGlvbiBgSk9gLlxuXG4gICAgLy8gSW5pdGlhbGl6aW5nIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIC8vIEl0J3MgZG9uZSBoZXJlIHNpbmNlIHdlIG9ubHkgbmVlZCB0aGVtIGZvciBvYmplY3RzIGFuZCBhcnJheXMgY29tcGFyaXNvbi5cbiAgICBhU3RhY2sgPSBhU3RhY2sgfHwgW107XG4gICAgYlN0YWNrID0gYlN0YWNrIHx8IFtdO1xuICAgIHZhciBsZW5ndGggPSBhU3RhY2subGVuZ3RoO1xuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgLy8gTGluZWFyIHNlYXJjaC4gUGVyZm9ybWFuY2UgaXMgaW52ZXJzZWx5IHByb3BvcnRpb25hbCB0byB0aGUgbnVtYmVyIG9mXG4gICAgICAvLyB1bmlxdWUgbmVzdGVkIHN0cnVjdHVyZXMuXG4gICAgICBpZiAoYVN0YWNrW2xlbmd0aF0gPT09IGEpIHJldHVybiBiU3RhY2tbbGVuZ3RoXSA9PT0gYjtcbiAgICB9XG5cbiAgICAvLyBBZGQgdGhlIGZpcnN0IG9iamVjdCB0byB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnB1c2goYSk7XG4gICAgYlN0YWNrLnB1c2goYik7XG5cbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cy5cbiAgICBpZiAoYXJlQXJyYXlzKSB7XG4gICAgICAvLyBDb21wYXJlIGFycmF5IGxlbmd0aHMgdG8gZGV0ZXJtaW5lIGlmIGEgZGVlcCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeS5cbiAgICAgIGxlbmd0aCA9IGEubGVuZ3RoO1xuICAgICAgaWYgKGxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgIC8vIERlZXAgY29tcGFyZSB0aGUgY29udGVudHMsIGlnbm9yaW5nIG5vbi1udW1lcmljIHByb3BlcnRpZXMuXG4gICAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgICAgaWYgKCFlcShhW2xlbmd0aF0sIGJbbGVuZ3RoXSwgYVN0YWNrLCBiU3RhY2spKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERlZXAgY29tcGFyZSBvYmplY3RzLlxuICAgICAgdmFyIGtleXMgPSBfLmtleXMoYSksIGtleTtcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgICAgLy8gRW5zdXJlIHRoYXQgYm90aCBvYmplY3RzIGNvbnRhaW4gdGhlIHNhbWUgbnVtYmVyIG9mIHByb3BlcnRpZXMgYmVmb3JlIGNvbXBhcmluZyBkZWVwIGVxdWFsaXR5LlxuICAgICAgaWYgKF8ua2V5cyhiKS5sZW5ndGggIT09IGxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAgIC8vIERlZXAgY29tcGFyZSBlYWNoIG1lbWJlclxuICAgICAgICBrZXkgPSBrZXlzW2xlbmd0aF07XG4gICAgICAgIGlmICghKF8uaGFzKGIsIGtleSkgJiYgZXEoYVtrZXldLCBiW2tleV0sIGFTdGFjaywgYlN0YWNrKSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gUmVtb3ZlIHRoZSBmaXJzdCBvYmplY3QgZnJvbSB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnBvcCgpO1xuICAgIGJTdGFjay5wb3AoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBQZXJmb3JtIGEgZGVlcCBjb21wYXJpc29uIHRvIGNoZWNrIGlmIHR3byBvYmplY3RzIGFyZSBlcXVhbC5cbiAgXy5pc0VxdWFsID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBlcShhLCBiKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIGFycmF5LCBzdHJpbmcsIG9yIG9iamVjdCBlbXB0eT9cbiAgLy8gQW4gXCJlbXB0eVwiIG9iamVjdCBoYXMgbm8gZW51bWVyYWJsZSBvd24tcHJvcGVydGllcy5cbiAgXy5pc0VtcHR5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSAmJiAoXy5pc0FycmF5KG9iaikgfHwgXy5pc1N0cmluZyhvYmopIHx8IF8uaXNBcmd1bWVudHMob2JqKSkpIHJldHVybiBvYmoubGVuZ3RoID09PSAwO1xuICAgIHJldHVybiBfLmtleXMob2JqKS5sZW5ndGggPT09IDA7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIERPTSBlbGVtZW50P1xuICBfLmlzRWxlbWVudCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiAhIShvYmogJiYgb2JqLm5vZGVUeXBlID09PSAxKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGFuIGFycmF5P1xuICAvLyBEZWxlZ2F0ZXMgdG8gRUNNQTUncyBuYXRpdmUgQXJyYXkuaXNBcnJheVxuICBfLmlzQXJyYXkgPSBuYXRpdmVJc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSBhbiBvYmplY3Q/XG4gIF8uaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgdHlwZSA9IHR5cGVvZiBvYmo7XG4gICAgcmV0dXJuIHR5cGUgPT09ICdmdW5jdGlvbicgfHwgdHlwZSA9PT0gJ29iamVjdCcgJiYgISFvYmo7XG4gIH07XG5cbiAgLy8gQWRkIHNvbWUgaXNUeXBlIG1ldGhvZHM6IGlzQXJndW1lbnRzLCBpc0Z1bmN0aW9uLCBpc1N0cmluZywgaXNOdW1iZXIsIGlzRGF0ZSwgaXNSZWdFeHAsIGlzRXJyb3IuXG4gIF8uZWFjaChbJ0FyZ3VtZW50cycsICdGdW5jdGlvbicsICdTdHJpbmcnLCAnTnVtYmVyJywgJ0RhdGUnLCAnUmVnRXhwJywgJ0Vycm9yJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBfWydpcycgKyBuYW1lXSA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgJyArIG5hbWUgKyAnXSc7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRGVmaW5lIGEgZmFsbGJhY2sgdmVyc2lvbiBvZiB0aGUgbWV0aG9kIGluIGJyb3dzZXJzIChhaGVtLCBJRSA8IDkpLCB3aGVyZVxuICAvLyB0aGVyZSBpc24ndCBhbnkgaW5zcGVjdGFibGUgXCJBcmd1bWVudHNcIiB0eXBlLlxuICBpZiAoIV8uaXNBcmd1bWVudHMoYXJndW1lbnRzKSkge1xuICAgIF8uaXNBcmd1bWVudHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBfLmhhcyhvYmosICdjYWxsZWUnKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gT3B0aW1pemUgYGlzRnVuY3Rpb25gIGlmIGFwcHJvcHJpYXRlLiBXb3JrIGFyb3VuZCBzb21lIHR5cGVvZiBidWdzIGluIG9sZCB2OCxcbiAgLy8gSUUgMTEgKCMxNjIxKSwgYW5kIGluIFNhZmFyaSA4ICgjMTkyOSkuXG4gIGlmICh0eXBlb2YgLy4vICE9ICdmdW5jdGlvbicgJiYgdHlwZW9mIEludDhBcnJheSAhPSAnb2JqZWN0Jykge1xuICAgIF8uaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT0gJ2Z1bmN0aW9uJyB8fCBmYWxzZTtcbiAgICB9O1xuICB9XG5cbiAgLy8gSXMgYSBnaXZlbiBvYmplY3QgYSBmaW5pdGUgbnVtYmVyP1xuICBfLmlzRmluaXRlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIGlzRmluaXRlKG9iaikgJiYgIWlzTmFOKHBhcnNlRmxvYXQob2JqKSk7XG4gIH07XG5cbiAgLy8gSXMgdGhlIGdpdmVuIHZhbHVlIGBOYU5gPyAoTmFOIGlzIHRoZSBvbmx5IG51bWJlciB3aGljaCBkb2VzIG5vdCBlcXVhbCBpdHNlbGYpLlxuICBfLmlzTmFOID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8uaXNOdW1iZXIob2JqKSAmJiBvYmogIT09ICtvYmo7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIGJvb2xlYW4/XG4gIF8uaXNCb29sZWFuID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdHJ1ZSB8fCBvYmogPT09IGZhbHNlIHx8IHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQm9vbGVhbl0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgZXF1YWwgdG8gbnVsbD9cbiAgXy5pc051bGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBudWxsO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgdW5kZWZpbmVkP1xuICBfLmlzVW5kZWZpbmVkID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdm9pZCAwO1xuICB9O1xuXG4gIC8vIFNob3J0Y3V0IGZ1bmN0aW9uIGZvciBjaGVja2luZyBpZiBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gcHJvcGVydHkgZGlyZWN0bHlcbiAgLy8gb24gaXRzZWxmIChpbiBvdGhlciB3b3Jkcywgbm90IG9uIGEgcHJvdG90eXBlKS5cbiAgXy5oYXMgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBvYmogIT0gbnVsbCAmJiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgfTtcblxuICAvLyBVdGlsaXR5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJ1biBVbmRlcnNjb3JlLmpzIGluICpub0NvbmZsaWN0KiBtb2RlLCByZXR1cm5pbmcgdGhlIGBfYCB2YXJpYWJsZSB0byBpdHNcbiAgLy8gcHJldmlvdXMgb3duZXIuIFJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICByb290Ll8gPSBwcmV2aW91c1VuZGVyc2NvcmU7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gS2VlcCB0aGUgaWRlbnRpdHkgZnVuY3Rpb24gYXJvdW5kIGZvciBkZWZhdWx0IGl0ZXJhdGVlcy5cbiAgXy5pZGVudGl0eSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9O1xuXG4gIC8vIFByZWRpY2F0ZS1nZW5lcmF0aW5nIGZ1bmN0aW9ucy4gT2Z0ZW4gdXNlZnVsIG91dHNpZGUgb2YgVW5kZXJzY29yZS5cbiAgXy5jb25zdGFudCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH07XG4gIH07XG5cbiAgXy5ub29wID0gZnVuY3Rpb24oKXt9O1xuXG4gIF8ucHJvcGVydHkgPSBwcm9wZXJ0eTtcblxuICAvLyBHZW5lcmF0ZXMgYSBmdW5jdGlvbiBmb3IgYSBnaXZlbiBvYmplY3QgdGhhdCByZXR1cm5zIGEgZ2l2ZW4gcHJvcGVydHkuXG4gIF8ucHJvcGVydHlPZiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT0gbnVsbCA/IGZ1bmN0aW9uKCl7fSA6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIHByZWRpY2F0ZSBmb3IgY2hlY2tpbmcgd2hldGhlciBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gc2V0IG9mXG4gIC8vIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLm1hdGNoZXIgPSBfLm1hdGNoZXMgPSBmdW5jdGlvbihhdHRycykge1xuICAgIGF0dHJzID0gXy5leHRlbmRPd24oe30sIGF0dHJzKTtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gXy5pc01hdGNoKG9iaiwgYXR0cnMpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUnVuIGEgZnVuY3Rpb24gKipuKiogdGltZXMuXG4gIF8udGltZXMgPSBmdW5jdGlvbihuLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciBhY2N1bSA9IEFycmF5KE1hdGgubWF4KDAsIG4pKTtcbiAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQsIDEpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSBhY2N1bVtpXSA9IGl0ZXJhdGVlKGkpO1xuICAgIHJldHVybiBhY2N1bTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSByYW5kb20gaW50ZWdlciBiZXR3ZWVuIG1pbiBhbmQgbWF4IChpbmNsdXNpdmUpLlxuICBfLnJhbmRvbSA9IGZ1bmN0aW9uKG1pbiwgbWF4KSB7XG4gICAgaWYgKG1heCA9PSBudWxsKSB7XG4gICAgICBtYXggPSBtaW47XG4gICAgICBtaW4gPSAwO1xuICAgIH1cbiAgICByZXR1cm4gbWluICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbiArIDEpKTtcbiAgfTtcblxuICAvLyBBIChwb3NzaWJseSBmYXN0ZXIpIHdheSB0byBnZXQgdGhlIGN1cnJlbnQgdGltZXN0YW1wIGFzIGFuIGludGVnZXIuXG4gIF8ubm93ID0gRGF0ZS5ub3cgfHwgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB9O1xuXG4gICAvLyBMaXN0IG9mIEhUTUwgZW50aXRpZXMgZm9yIGVzY2FwaW5nLlxuICB2YXIgZXNjYXBlTWFwID0ge1xuICAgICcmJzogJyZhbXA7JyxcbiAgICAnPCc6ICcmbHQ7JyxcbiAgICAnPic6ICcmZ3Q7JyxcbiAgICAnXCInOiAnJnF1b3Q7JyxcbiAgICBcIidcIjogJyYjeDI3OycsXG4gICAgJ2AnOiAnJiN4NjA7J1xuICB9O1xuICB2YXIgdW5lc2NhcGVNYXAgPSBfLmludmVydChlc2NhcGVNYXApO1xuXG4gIC8vIEZ1bmN0aW9ucyBmb3IgZXNjYXBpbmcgYW5kIHVuZXNjYXBpbmcgc3RyaW5ncyB0by9mcm9tIEhUTUwgaW50ZXJwb2xhdGlvbi5cbiAgdmFyIGNyZWF0ZUVzY2FwZXIgPSBmdW5jdGlvbihtYXApIHtcbiAgICB2YXIgZXNjYXBlciA9IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICByZXR1cm4gbWFwW21hdGNoXTtcbiAgICB9O1xuICAgIC8vIFJlZ2V4ZXMgZm9yIGlkZW50aWZ5aW5nIGEga2V5IHRoYXQgbmVlZHMgdG8gYmUgZXNjYXBlZFxuICAgIHZhciBzb3VyY2UgPSAnKD86JyArIF8ua2V5cyhtYXApLmpvaW4oJ3wnKSArICcpJztcbiAgICB2YXIgdGVzdFJlZ2V4cCA9IFJlZ0V4cChzb3VyY2UpO1xuICAgIHZhciByZXBsYWNlUmVnZXhwID0gUmVnRXhwKHNvdXJjZSwgJ2cnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgICBzdHJpbmcgPSBzdHJpbmcgPT0gbnVsbCA/ICcnIDogJycgKyBzdHJpbmc7XG4gICAgICByZXR1cm4gdGVzdFJlZ2V4cC50ZXN0KHN0cmluZykgPyBzdHJpbmcucmVwbGFjZShyZXBsYWNlUmVnZXhwLCBlc2NhcGVyKSA6IHN0cmluZztcbiAgICB9O1xuICB9O1xuICBfLmVzY2FwZSA9IGNyZWF0ZUVzY2FwZXIoZXNjYXBlTWFwKTtcbiAgXy51bmVzY2FwZSA9IGNyZWF0ZUVzY2FwZXIodW5lc2NhcGVNYXApO1xuXG4gIC8vIElmIHRoZSB2YWx1ZSBvZiB0aGUgbmFtZWQgYHByb3BlcnR5YCBpcyBhIGZ1bmN0aW9uIHRoZW4gaW52b2tlIGl0IHdpdGggdGhlXG4gIC8vIGBvYmplY3RgIGFzIGNvbnRleHQ7IG90aGVyd2lzZSwgcmV0dXJuIGl0LlxuICBfLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHksIGZhbGxiYWNrKSB7XG4gICAgdmFyIHZhbHVlID0gb2JqZWN0ID09IG51bGwgPyB2b2lkIDAgOiBvYmplY3RbcHJvcGVydHldO1xuICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgICB2YWx1ZSA9IGZhbGxiYWNrO1xuICAgIH1cbiAgICByZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmNhbGwob2JqZWN0KSA6IHZhbHVlO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIGEgdW5pcXVlIGludGVnZXIgaWQgKHVuaXF1ZSB3aXRoaW4gdGhlIGVudGlyZSBjbGllbnQgc2Vzc2lvbikuXG4gIC8vIFVzZWZ1bCBmb3IgdGVtcG9yYXJ5IERPTSBpZHMuXG4gIHZhciBpZENvdW50ZXIgPSAwO1xuICBfLnVuaXF1ZUlkID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgfTtcblxuICAvLyBCeSBkZWZhdWx0LCBVbmRlcnNjb3JlIHVzZXMgRVJCLXN0eWxlIHRlbXBsYXRlIGRlbGltaXRlcnMsIGNoYW5nZSB0aGVcbiAgLy8gZm9sbG93aW5nIHRlbXBsYXRlIHNldHRpbmdzIHRvIHVzZSBhbHRlcm5hdGl2ZSBkZWxpbWl0ZXJzLlxuICBfLnRlbXBsYXRlU2V0dGluZ3MgPSB7XG4gICAgZXZhbHVhdGUgICAgOiAvPCUoW1xcc1xcU10rPyklPi9nLFxuICAgIGludGVycG9sYXRlIDogLzwlPShbXFxzXFxTXSs/KSU+L2csXG4gICAgZXNjYXBlICAgICAgOiAvPCUtKFtcXHNcXFNdKz8pJT4vZ1xuICB9O1xuXG4gIC8vIFdoZW4gY3VzdG9taXppbmcgYHRlbXBsYXRlU2V0dGluZ3NgLCBpZiB5b3UgZG9uJ3Qgd2FudCB0byBkZWZpbmUgYW5cbiAgLy8gaW50ZXJwb2xhdGlvbiwgZXZhbHVhdGlvbiBvciBlc2NhcGluZyByZWdleCwgd2UgbmVlZCBvbmUgdGhhdCBpc1xuICAvLyBndWFyYW50ZWVkIG5vdCB0byBtYXRjaC5cbiAgdmFyIG5vTWF0Y2ggPSAvKC4pXi87XG5cbiAgLy8gQ2VydGFpbiBjaGFyYWN0ZXJzIG5lZWQgdG8gYmUgZXNjYXBlZCBzbyB0aGF0IHRoZXkgY2FuIGJlIHB1dCBpbnRvIGFcbiAgLy8gc3RyaW5nIGxpdGVyYWwuXG4gIHZhciBlc2NhcGVzID0ge1xuICAgIFwiJ1wiOiAgICAgIFwiJ1wiLFxuICAgICdcXFxcJzogICAgICdcXFxcJyxcbiAgICAnXFxyJzogICAgICdyJyxcbiAgICAnXFxuJzogICAgICduJyxcbiAgICAnXFx1MjAyOCc6ICd1MjAyOCcsXG4gICAgJ1xcdTIwMjknOiAndTIwMjknXG4gIH07XG5cbiAgdmFyIGVzY2FwZXIgPSAvXFxcXHwnfFxccnxcXG58XFx1MjAyOHxcXHUyMDI5L2c7XG5cbiAgdmFyIGVzY2FwZUNoYXIgPSBmdW5jdGlvbihtYXRjaCkge1xuICAgIHJldHVybiAnXFxcXCcgKyBlc2NhcGVzW21hdGNoXTtcbiAgfTtcblxuICAvLyBKYXZhU2NyaXB0IG1pY3JvLXRlbXBsYXRpbmcsIHNpbWlsYXIgdG8gSm9obiBSZXNpZydzIGltcGxlbWVudGF0aW9uLlxuICAvLyBVbmRlcnNjb3JlIHRlbXBsYXRpbmcgaGFuZGxlcyBhcmJpdHJhcnkgZGVsaW1pdGVycywgcHJlc2VydmVzIHdoaXRlc3BhY2UsXG4gIC8vIGFuZCBjb3JyZWN0bHkgZXNjYXBlcyBxdW90ZXMgd2l0aGluIGludGVycG9sYXRlZCBjb2RlLlxuICAvLyBOQjogYG9sZFNldHRpbmdzYCBvbmx5IGV4aXN0cyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gIF8udGVtcGxhdGUgPSBmdW5jdGlvbih0ZXh0LCBzZXR0aW5ncywgb2xkU2V0dGluZ3MpIHtcbiAgICBpZiAoIXNldHRpbmdzICYmIG9sZFNldHRpbmdzKSBzZXR0aW5ncyA9IG9sZFNldHRpbmdzO1xuICAgIHNldHRpbmdzID0gXy5kZWZhdWx0cyh7fSwgc2V0dGluZ3MsIF8udGVtcGxhdGVTZXR0aW5ncyk7XG5cbiAgICAvLyBDb21iaW5lIGRlbGltaXRlcnMgaW50byBvbmUgcmVndWxhciBleHByZXNzaW9uIHZpYSBhbHRlcm5hdGlvbi5cbiAgICB2YXIgbWF0Y2hlciA9IFJlZ0V4cChbXG4gICAgICAoc2V0dGluZ3MuZXNjYXBlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5pbnRlcnBvbGF0ZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuZXZhbHVhdGUgfHwgbm9NYXRjaCkuc291cmNlXG4gICAgXS5qb2luKCd8JykgKyAnfCQnLCAnZycpO1xuXG4gICAgLy8gQ29tcGlsZSB0aGUgdGVtcGxhdGUgc291cmNlLCBlc2NhcGluZyBzdHJpbmcgbGl0ZXJhbHMgYXBwcm9wcmlhdGVseS5cbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzb3VyY2UgPSBcIl9fcCs9J1wiO1xuICAgIHRleHQucmVwbGFjZShtYXRjaGVyLCBmdW5jdGlvbihtYXRjaCwgZXNjYXBlLCBpbnRlcnBvbGF0ZSwgZXZhbHVhdGUsIG9mZnNldCkge1xuICAgICAgc291cmNlICs9IHRleHQuc2xpY2UoaW5kZXgsIG9mZnNldCkucmVwbGFjZShlc2NhcGVyLCBlc2NhcGVDaGFyKTtcbiAgICAgIGluZGV4ID0gb2Zmc2V0ICsgbWF0Y2gubGVuZ3RoO1xuXG4gICAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgZXNjYXBlICsgXCIpKT09bnVsbD8nJzpfLmVzY2FwZShfX3QpKStcXG4nXCI7XG4gICAgICB9IGVsc2UgaWYgKGludGVycG9sYXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgaW50ZXJwb2xhdGUgKyBcIikpPT1udWxsPycnOl9fdCkrXFxuJ1wiO1xuICAgICAgfSBlbHNlIGlmIChldmFsdWF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInO1xcblwiICsgZXZhbHVhdGUgKyBcIlxcbl9fcCs9J1wiO1xuICAgICAgfVxuXG4gICAgICAvLyBBZG9iZSBWTXMgbmVlZCB0aGUgbWF0Y2ggcmV0dXJuZWQgdG8gcHJvZHVjZSB0aGUgY29ycmVjdCBvZmZlc3QuXG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG4gICAgc291cmNlICs9IFwiJztcXG5cIjtcblxuICAgIC8vIElmIGEgdmFyaWFibGUgaXMgbm90IHNwZWNpZmllZCwgcGxhY2UgZGF0YSB2YWx1ZXMgaW4gbG9jYWwgc2NvcGUuXG4gICAgaWYgKCFzZXR0aW5ncy52YXJpYWJsZSkgc291cmNlID0gJ3dpdGgob2JqfHx7fSl7XFxuJyArIHNvdXJjZSArICd9XFxuJztcblxuICAgIHNvdXJjZSA9IFwidmFyIF9fdCxfX3A9JycsX19qPUFycmF5LnByb3RvdHlwZS5qb2luLFwiICtcbiAgICAgIFwicHJpbnQ9ZnVuY3Rpb24oKXtfX3ArPV9fai5jYWxsKGFyZ3VtZW50cywnJyk7fTtcXG5cIiArXG4gICAgICBzb3VyY2UgKyAncmV0dXJuIF9fcDtcXG4nO1xuXG4gICAgdHJ5IHtcbiAgICAgIHZhciByZW5kZXIgPSBuZXcgRnVuY3Rpb24oc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicsICdfJywgc291cmNlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlLnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuXG4gICAgdmFyIHRlbXBsYXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgcmV0dXJuIHJlbmRlci5jYWxsKHRoaXMsIGRhdGEsIF8pO1xuICAgIH07XG5cbiAgICAvLyBQcm92aWRlIHRoZSBjb21waWxlZCBzb3VyY2UgYXMgYSBjb252ZW5pZW5jZSBmb3IgcHJlY29tcGlsYXRpb24uXG4gICAgdmFyIGFyZ3VtZW50ID0gc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaic7XG4gICAgdGVtcGxhdGUuc291cmNlID0gJ2Z1bmN0aW9uKCcgKyBhcmd1bWVudCArICcpe1xcbicgKyBzb3VyY2UgKyAnfSc7XG5cbiAgICByZXR1cm4gdGVtcGxhdGU7XG4gIH07XG5cbiAgLy8gQWRkIGEgXCJjaGFpblwiIGZ1bmN0aW9uLiBTdGFydCBjaGFpbmluZyBhIHdyYXBwZWQgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8uY2hhaW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgaW5zdGFuY2UgPSBfKG9iaik7XG4gICAgaW5zdGFuY2UuX2NoYWluID0gdHJ1ZTtcbiAgICByZXR1cm4gaW5zdGFuY2U7XG4gIH07XG5cbiAgLy8gT09QXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAvLyBJZiBVbmRlcnNjb3JlIGlzIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLCBpdCByZXR1cm5zIGEgd3JhcHBlZCBvYmplY3QgdGhhdFxuICAvLyBjYW4gYmUgdXNlZCBPTy1zdHlsZS4gVGhpcyB3cmFwcGVyIGhvbGRzIGFsdGVyZWQgdmVyc2lvbnMgb2YgYWxsIHRoZVxuICAvLyB1bmRlcnNjb3JlIGZ1bmN0aW9ucy4gV3JhcHBlZCBvYmplY3RzIG1heSBiZSBjaGFpbmVkLlxuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb250aW51ZSBjaGFpbmluZyBpbnRlcm1lZGlhdGUgcmVzdWx0cy5cbiAgdmFyIHJlc3VsdCA9IGZ1bmN0aW9uKGluc3RhbmNlLCBvYmopIHtcbiAgICByZXR1cm4gaW5zdGFuY2UuX2NoYWluID8gXyhvYmopLmNoYWluKCkgOiBvYmo7XG4gIH07XG5cbiAgLy8gQWRkIHlvdXIgb3duIGN1c3RvbSBmdW5jdGlvbnMgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm1peGluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgXy5lYWNoKF8uZnVuY3Rpb25zKG9iaiksIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHZhciBmdW5jID0gX1tuYW1lXSA9IG9ialtuYW1lXTtcbiAgICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gW3RoaXMuX3dyYXBwZWRdO1xuICAgICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiByZXN1bHQodGhpcywgZnVuYy5hcHBseShfLCBhcmdzKSk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEFkZCBhbGwgb2YgdGhlIFVuZGVyc2NvcmUgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyIG9iamVjdC5cbiAgXy5taXhpbihfKTtcblxuICAvLyBBZGQgYWxsIG11dGF0b3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBfLmVhY2goWydwb3AnLCAncHVzaCcsICdyZXZlcnNlJywgJ3NoaWZ0JywgJ3NvcnQnLCAnc3BsaWNlJywgJ3Vuc2hpZnQnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb2JqID0gdGhpcy5fd3JhcHBlZDtcbiAgICAgIG1ldGhvZC5hcHBseShvYmosIGFyZ3VtZW50cyk7XG4gICAgICBpZiAoKG5hbWUgPT09ICdzaGlmdCcgfHwgbmFtZSA9PT0gJ3NwbGljZScpICYmIG9iai5sZW5ndGggPT09IDApIGRlbGV0ZSBvYmpbMF07XG4gICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIG9iaik7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gQWRkIGFsbCBhY2Nlc3NvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIF8uZWFjaChbJ2NvbmNhdCcsICdqb2luJywgJ3NsaWNlJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBtZXRob2QuYXBwbHkodGhpcy5fd3JhcHBlZCwgYXJndW1lbnRzKSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRXh0cmFjdHMgdGhlIHJlc3VsdCBmcm9tIGEgd3JhcHBlZCBhbmQgY2hhaW5lZCBvYmplY3QuXG4gIF8ucHJvdG90eXBlLnZhbHVlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX3dyYXBwZWQ7XG4gIH07XG5cbiAgLy8gUHJvdmlkZSB1bndyYXBwaW5nIHByb3h5IGZvciBzb21lIG1ldGhvZHMgdXNlZCBpbiBlbmdpbmUgb3BlcmF0aW9uc1xuICAvLyBzdWNoIGFzIGFyaXRobWV0aWMgYW5kIEpTT04gc3RyaW5naWZpY2F0aW9uLlxuICBfLnByb3RvdHlwZS52YWx1ZU9mID0gXy5wcm90b3R5cGUudG9KU09OID0gXy5wcm90b3R5cGUudmFsdWU7XG5cbiAgXy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJycgKyB0aGlzLl93cmFwcGVkO1xuICB9O1xuXG4gIC8vIEFNRCByZWdpc3RyYXRpb24gaGFwcGVucyBhdCB0aGUgZW5kIGZvciBjb21wYXRpYmlsaXR5IHdpdGggQU1EIGxvYWRlcnNcbiAgLy8gdGhhdCBtYXkgbm90IGVuZm9yY2UgbmV4dC10dXJuIHNlbWFudGljcyBvbiBtb2R1bGVzLiBFdmVuIHRob3VnaCBnZW5lcmFsXG4gIC8vIHByYWN0aWNlIGZvciBBTUQgcmVnaXN0cmF0aW9uIGlzIHRvIGJlIGFub255bW91cywgdW5kZXJzY29yZSByZWdpc3RlcnNcbiAgLy8gYXMgYSBuYW1lZCBtb2R1bGUgYmVjYXVzZSwgbGlrZSBqUXVlcnksIGl0IGlzIGEgYmFzZSBsaWJyYXJ5IHRoYXQgaXNcbiAgLy8gcG9wdWxhciBlbm91Z2ggdG8gYmUgYnVuZGxlZCBpbiBhIHRoaXJkIHBhcnR5IGxpYiwgYnV0IG5vdCBiZSBwYXJ0IG9mXG4gIC8vIGFuIEFNRCBsb2FkIHJlcXVlc3QuIFRob3NlIGNhc2VzIGNvdWxkIGdlbmVyYXRlIGFuIGVycm9yIHdoZW4gYW5cbiAgLy8gYW5vbnltb3VzIGRlZmluZSgpIGlzIGNhbGxlZCBvdXRzaWRlIG9mIGEgbG9hZGVyIHJlcXVlc3QuXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoJ3VuZGVyc2NvcmUnLCBbXSwgZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gXztcbiAgICB9KTtcbiAgfVxufS5jYWxsKHRoaXMpKTtcbiJdfQ==
