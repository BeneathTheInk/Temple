/*
 * Temple (with Source Map)
 * (c) 2014-2015 Beneath the Ink, Inc.
 * Copyright (C) 2011--2015 Meteor Development Group
 * MIT License
 * Version 0.5.9
 */

(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.Temple = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
//////////////////////////////////////////////////
// This is a heavily modified version of Meteor's DOMRange //
// Last merge: https://github.com/meteor/meteor/blob/405009a2c3dcd3c1fe780adb2867d38a6a42fff1/packages/blaze/domrange.js //
//////////////////////////////////////////////////

var _ = require("underscore"),
	Events = require("backbone-events-standalone"),
	utils = require("./utils"),
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
};

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
				if (el.nodeType === 1 && matchesSelector(el, selector)) matches.push(el);
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

},{"./utils":13,"backbone-events-standalone":16,"backbone-extend-standalone":17,"matches-selector":29,"underscore":39}],2:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var parse = require("./m+xml").parse;
var NODE_TYPE = require("./types");

// properties that Node.js and the browser can handle
var Temple = module.exports = {
	VERSION: "0.5.9",
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

},{"./domrange":1,"./m+xml":3,"./model":4,"./mustache":5,"./plugins":8,"./section":11,"./types":12,"./utils":13,"./view":14,"trackr":38,"trackr-objects":30,"underscore":39}],3:[function(require,module,exports){
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
},{"./":2,"./types":12,"underscore":39}],4:[function(require,module,exports){
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
}

Model.isModel = function(o) {
	return o instanceof Model;
}

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
	var args = _.isArray(args) ? _.clone(args) : [];
	args.unshift(proxy, method, target);
	args.push(ctx);
	return utils.result.apply(null, args);
}

_.extend(Model.prototype, {

	// sets the data on the model
	set: function(data, options) {
		if (options && options.track !== false) {
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

},{"./m+xml":3,"./utils":13,"backbone-extend-standalone":17,"trackr":38,"trackr-objects":30,"underscore":39}],5:[function(require,module,exports){
var Trackr = require("trackr");
var _ = require("underscore");
var NODE_TYPE = require("./types");
var parse = require("./m+xml").parse;
var utils = require("./utils");
var View = require("./view");
var Model = require("./model");
var Section = require("./section");
var $track = require("trackr-objects");
var idom = require('incremental-dom');
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

},{"./domrange":1,"./m+xml":3,"./model":4,"./section":11,"./types":12,"./utils":13,"./view":14,"incremental-dom":19,"trackr":38,"trackr-objects":30,"underscore":39}],6:[function(require,module,exports){
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
},{"../":2,"underscore":39}],7:[function(require,module,exports){
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

},{"./actions":6,"./adoption":7,"./refs":9,"./twoway":10,"underscore":39}],9:[function(require,module,exports){
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

},{}],10:[function(require,module,exports){
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
},{"underscore":39}],11:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var utils = require("./utils");
var Model = require("./model");
var View = require("./view");

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

},{"./model":4,"./utils":13,"./view":14,"trackr":38,"underscore":39}],12:[function(require,module,exports){
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
}

},{"matches-selector":29,"underscore":39}],14:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var Events = require("backbone-events-standalone");
var utils = require("./utils");
var Model = require("./model");
var Plugins = require("./plugins");
var DOMRange = require("./domrange");

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
		if (!utils.isSubClass(View, klass)) return null;

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

// proxy a few computation methods
[ "invalidate", "onInvalidate" ].forEach(function(method) {
	View.prototype[method] = function() {
		if (!this.comp) {
			throw new Error("Cannot run " + method + "(). This view is not mounted.");
		}

		this.comp[method].apply(this.comp, arguments);
		return this;
	}
});

},{"./domrange":1,"./model":4,"./plugins":8,"./utils":13,"backbone-events-standalone":16,"trackr":38,"underscore":39}],15:[function(require,module,exports){
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
/**
 * @license
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var patch = require('./src/patch').patch;
var elements = require('./src/virtual_elements');

module.exports = {
  patch: patch,
  elementVoid: elements.elementVoid,
  elementOpenStart: elements.elementOpenStart,
  elementOpenEnd: elements.elementOpenEnd,
  elementOpen: elements.elementOpen,
  elementClose: elements.elementClose,
  text: elements.text,
  attr: elements.attr
};


},{"./src/patch":24,"./src/virtual_elements":27}],20:[function(require,module,exports){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var nodes = require('./nodes'),
    createNode = nodes.createNode,
    getKey = nodes.getKey,
    getNodeName = nodes.getNodeName,
    getChild = nodes.getChild,
    registerChild = nodes.registerChild;
var markVisited = require('./traversal').markVisited;
var getWalker = require('./walker').getWalker;


/**
 * Checks whether or not a given node matches the specified nodeName and key.
 *
 * @param {?Node} node An HTML node, typically an HTMLElement or Text.
 * @param {?string} nodeName The nodeName for this node.
 * @param {?string} key An optional key that identifies a node.
 * @return {boolean} True if the node matches, false otherwise.
 */
var matches = function(node, nodeName, key) {
  return node &&
         key === getKey(node) &&
         nodeName === getNodeName(node);
};


/**
 * Aligns the virtual Element definition with the actual DOM, moving the
 * corresponding DOM node to the correct location or creating it if necessary.
 * @param {?string} nodeName For an Element, this should be a valid tag string.
 *     For a Text, this should be #text.
 * @param {?string} key The key used to identify this element.
 * @param {?Array<*>|string} statics For an Element, this should be an array of
 *     name-value pairs. For a Text, this should be the text content of the
 *     node.
 * @return {!Node} The matching node.
 */
var alignWithDOM = function(nodeName, key, statics) {
  var walker = getWalker();
  var currentNode = walker.currentNode;
  var parent = walker.getCurrentParent();
  var matchingNode;

  // Check to see if we have a node to reuse
  if (matches(currentNode, nodeName, key)) {
    matchingNode = currentNode;
  } else {
    var existingNode = key && getChild(parent, key);

    // Check to see if the node has moved within the parent or if a new one
    // should be created
    if (existingNode) {
      matchingNode = existingNode;
    } else {
      matchingNode = createNode(walker.doc, nodeName, key, statics);
      registerChild(parent, key, matchingNode);
    }

    parent.insertBefore(matchingNode, currentNode);
    walker.currentNode = matchingNode;
  }

  markVisited(parent, matchingNode);

  return matchingNode;
};


/** */
module.exports = {
  alignWithDOM: alignWithDOM
};


},{"./nodes":23,"./traversal":25,"./walker":28}],21:[function(require,module,exports){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var getData = require('./node_data').getData;


/**
 * Applies an attribute or property to a given Element. If the value is a object
 * or a function (which includes null), it is set as a property on the Element.
 * Otherwise, the value is set as an attribute.
 * @param {!Element} el
 * @param {string} name The attribute's name.
 * @param {*} value The attribute's value. If the value is a string, it is set
 *     as an HTML attribute, otherwise, it is set on node.
 */
var applyAttr = function(el, name, value) {
  var data = getData(el);
  var attrs = data.attrs;

  if (attrs[name] === value) {
    return;
  }

  var type = typeof value;

  if (value === undefined) {
    el.removeAttribute(name);
  } else if (type === 'object' || type === 'function') {
    el[name] = value;
  } else {
    el.setAttribute(name, value);
  }

  attrs[name] = value;
};


/**
 * Applies a style to an Element. No vendor prefix expansion is done for
 * property names/values.
 * @param {!Element} el
 * @param {string|Object<string,string>} style The style to set. Either a string
 *     of css or an object containing property-value pairs.
 */
var applyStyle = function(el, style) {
  if (typeof style === 'string' || style instanceof String) {
    el.style.cssText = style;
  } else {
    el.style.cssText = '';

    for (var prop in style) {
      el.style[prop] = style[prop];
    }
  }
};


/**
 * Updates a single attribute on an Element. For some types (e.g. id or class),
 * the value is applied directly to the Element using the corresponding accessor
 * function.
 * @param {!Element} el
 * @param {string} name The attribute's name.
 * @param {*} value The attribute's value. If the value is a string, it is set
 *     as an HTML attribute, otherwise, it is set on node.
 */
var updateAttribute = function(el, name, value) {
  switch (name) {
    case 'id':
      el.id = value;
      break;
    case 'class':
      el.className = value;
      break;
    case 'tabindex':
      el.tabIndex = value;
      break;
    case 'style':
      applyStyle(el, value);
      break;
    default:
      applyAttr(el, name, value);
      break;
  }
};


/** */
module.exports = {
  updateAttribute: updateAttribute
};


},{"./node_data":22}],22:[function(require,module,exports){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/**
 * Keeps track of information needed to perform diffs for a given DOM node.
 * @param {?string} nodeName
 * @param {?string} key
 * @constructor
 */
function NodeData(nodeName, key) {
  /**
   * The attributes and their values.
   * @const
   */
  this.attrs = {};

  /**
   * An array of attribute name/value pairs, used for quickly diffing the
   * incomming attributes to see if the DOM node's attributes need to be
   * updated.
   * @const {Array<*>}
   */
  this.attrsArr = [];

  /**
   * The incoming attributes for this Node, before they are updated.
   * @const {!Object<string, *>}
   */
  this.newAttrs = {};

  /**
   * The key used to identify this node, used to preserve DOM nodes when they
   * move within their parent.
   * @const
   */
  this.key = key;

  /**
   * Keeps track of children within this node by their key.
   * {?Object<string, Node>}
   */
  this.keyMap = null;

  /**
   * The last child to have been visited within the current pass.
   * {?Node}
   */
  this.lastVisitedChild = null;

  /**
   * The node name for this node.
   * @const
   */
  this.nodeName = nodeName;

  /**
   * @const {string}
   */
  this.text = null;
}


/**
 * Initializes a NodeData object for a Node.
 *
 * @param {!Node} node The node to initialze data for.
 * @param {string} nodeName The node name of node.
 * @param {?string} key The key that identifies the node.
 * @return {!NodeData} The newly initialized data object
 */
var initData = function(node, nodeName, key) {
  var data = new NodeData(nodeName, key);
  node['__incrementalDOMData'] = data;
  return data;
};


/**
 * Retrieves the NodeData object for a Node, creating it if necessary.
 *
 * @param {!Node} node The node to retrieve the data for.
 * @return {NodeData} The NodeData for this Node.
 */
var getData = function(node) {
  var data = node['__incrementalDOMData'];

  if (!data) {
    var nodeName = node.nodeName.toLowerCase();
    var key = null;

    if (node instanceof Element) {
      key = node.getAttribute('key');
    }

    data = initData(node, nodeName, key);
  }

  return data;
};


/** */
module.exports = {
  getData: getData,
  initData: initData
};


},{}],23:[function(require,module,exports){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var updateAttribute = require('./attributes').updateAttribute;
var nodeData = require('./node_data'),
    getData = nodeData.getData,
    initData = nodeData.initData;


/**
 * Creates an Element.
 * @param {!Document} doc The document with which to create the Element.
 * @param {string} tag The tag for the Element.
 * @param {?string} key A key to identify the Element.
 * @param {?Array<*>} statics An array of attribute name/value pairs of
 *     the static attributes for the Element.
 * @return {!Element}
 */
var createElement = function(doc, tag, key, statics) {
  var el = doc.createElement(tag);
  initData(el, tag, key);

  if (statics) {
    for (var i = 0; i < statics.length; i += 2) {
      updateAttribute(el, statics[i], statics[i + 1]);
    }
  }

  return el;
};

/**
 * Creates a Text.
 * @param {!Document} doc The document with which to create the Text.
 * @param {string} text The intial content of the Text.
 * @return {!Text}
 */
var createTextNode = function(doc, text) {
  var node = doc.createTextNode(text);
  getData(node).text = text;

  return node;
};


/**
 * Creates a Node, either a Text or an Element depending on the node name
 * provided.
 * @param {!Document} doc The document with which to create the Node.
 * @param {string} nodeName The tag if creating an element or #text to create
 *     a Text.
 * @param {?string} key A key to identify the Element.
 * @param {?Array<*>|string} statics The static data to initialize the Node
 *     with. For an Element, an array of attribute name/value pairs of
 *     the static attributes for the Element. For a Text, a string with the
 *     intial content of the Text.
 * @return {!Node}
 */
var createNode = function(doc, nodeName, key, statics) {
  if (nodeName === '#text') {
    return createTextNode(doc, statics);
  }

  return createElement(doc, nodeName, key, statics);
};


/**
 * Creates a mapping that can be used to look up children using a key.
 * @param {!Element} el
 * @return {!Object<string, !Node>} A mapping of keys to the children of the
 *     Element.
 */
var createKeyMap = function(el) {
  var map = {};
  var children = el.children;
  var count = children.length;

  for (var i = 0; i < count; i += 1) {
    var child = children[i];
    var key = getKey(child);

    if (key) {
      map[key] = child;
    }
  }

  return map;
};


/**
 * @param {?Node} node A node to get the key for.
 * @return {?string} The key for the Node, if applicable.
 */
var getKey = function(node) {
  return getData(node).key;
};


/**
 * @param {?Node} node A node to get the node name for.
 * @return {?string} The node name for the Node, if applicable.
 */
var getNodeName = function(node) {
  return getData(node).nodeName;
};


/**
 * Retrieves the mapping of key to child node for a given Element, creating it
 * if necessary.
 * @param {!Element} el
 * @return {!Object<string,!Node>} A mapping of keys to child Nodes
 */
var getKeyMap = function(el) {
  var data = getData(el);

  if (!data.keyMap) {
    data.keyMap = createKeyMap(el);
  }

  return data.keyMap;
};


/**
 * Retrieves a child from the parent with the given key.
 * @param {!Element} parent
 * @param {?string} key
 * @return {?Node} The child corresponding to the key.
 */
var getChild = function(parent, key) {
  return getKeyMap(parent)[key];
};


/**
 * Registers a node as being a child. If a key is provided, the parent will
 * keep track of the child using the key. The child can be retrieved using the
 * same key using getKeyMap. The provided key should be unique within the
 * parent Element.
 * @param {!Element} parent The parent of child.
 * @param {?string} key A key to identify the child with.
 * @param {!Node} child The child to register.
 */
var registerChild = function(parent, key, child) {
  if (key) {
    getKeyMap(parent)[key] = child;
  }
};


/** */
module.exports = {
  createNode: createNode,
  getKey: getKey,
  getNodeName: getNodeName,
  getChild: getChild,
  registerChild: registerChild
};


},{"./attributes":21,"./node_data":22}],24:[function(require,module,exports){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var traversal = require('./traversal'),
    firstChild = traversal.firstChild,
    parentNode = traversal.parentNode;
var TreeWalker = require('./tree_walker');
var walker = require('./walker'),
    getWalker = walker.getWalker,
    setWalker = walker.setWalker;


/**
 * Patches the document starting at el with the provided function. This function
 * may be called during an existing patch operation.
 * @param {!Element} el the element to patch
 * @param {!function} fn A function containing elementOpen/elementClose/etc.
 *     calls that describe the DOM.
 */
var patch = function(el, fn) {
  var prevWalker = getWalker();
  setWalker(new TreeWalker(el));

  firstChild();
  fn();
  parentNode();

  setWalker(prevWalker);
};


/** */
module.exports = {
  patch: patch
};


},{"./traversal":25,"./tree_walker":26,"./walker":28}],25:[function(require,module,exports){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var getWalker = require('./walker').getWalker;
var getData = require('./node_data').getData;


/**
 * Enters a Element, clearing out the last visited child field.
 * @param {!Element} node
 */
var enterNode = function(node) {
  var data = getData(node);
  data.lastVisitedChild = null;
};


/**
 * Clears out any unvisited Nodes, as the corresponding virtual element
 * functions were never called for them.
 * @param {!Element} node
 */
var exitNode = function(node) {
  var data = getData(node);
  var lastVisitedChild = data.lastVisitedChild;

  if (node.lastChild === lastVisitedChild) {
    return;
  }

  while (node.lastChild !== lastVisitedChild) {
    node.removeChild(node.lastChild);
  }

  // Invalidate the key map since we removed children. It will get recreated
  // next time we need it.
  data.keyMap = null;
};


/**
 * Marks a parent as having visited a child.
 * @param {!Element} parent
 * @param {!Node} child
 */
var markVisited = function(parent, child) {
  var data = getData(parent);
  data.lastVisitedChild = child;
};


/**
 * Changes to the first child of the current node.
 */
var firstChild = function() {
  var walker = getWalker();
  enterNode(walker.currentNode);
  walker.firstChild();
};


/**
 * Changes to the next sibling of the current node.
 */
var nextSibling = function() {
  var walker = getWalker();
  walker.nextSibling();
};


/**
 * Changes to the parent of the current node, removing any unvisited children.
 */
var parentNode = function() {
  var walker = getWalker();
  walker.parentNode();
  exitNode(walker.currentNode);
};


/** */
module.exports = {
  firstChild: firstChild,
  nextSibling: nextSibling,
  parentNode: parentNode,
  markVisited: markVisited
};


},{"./node_data":22,"./walker":28}],26:[function(require,module,exports){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Similar to the built-in Treewalker class, but simplified and allows direct
 * access to modify the currentNode property.
 * @param {!Node} node The root Node of the subtree the walker should start
 *     traversing.
 * @constructor
 */
function TreeWalker(node) {
  /**
   * Keeps track of the current parent node. This is necessary as the traversal
   * methods may traverse past the last child and we still need a way to get
   * back to the parent.
   * @const @private {!Array<!Node>}
   */
  this.stack_ = [];

  /** {?Node} */
  this.currentNode = node;

  /** {!Document} */
  this.doc = node.ownerDocument;
}


/**
 * @return {!Node} The current parent of the current location in the subtree.
 */
TreeWalker.prototype.getCurrentParent = function() {
  return this.stack_[this.stack_.length - 1];
};


/**
 * Changes the current location the firstChild of the current location.
 */
TreeWalker.prototype.firstChild = function() {
  this.stack_.push(this.currentNode);
  this.currentNode = this.currentNode.firstChild;
};


/**
 * Changes the current location the nextSibling of the current location.
 */
TreeWalker.prototype.nextSibling = function() {
  this.currentNode = this.currentNode.nextSibling;
};


/**
 * Changes the current location the parentNode of the current location.
 */
TreeWalker.prototype.parentNode = function() {
  this.currentNode = this.stack_.pop();
};


/** */
module.exports = TreeWalker;


},{}],27:[function(require,module,exports){
(function (process){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var alignWithDOM = require('./alignment').alignWithDOM;
var updateAttribute = require('./attributes').updateAttribute;
var getData = require('./node_data').getData;
var getWalker = require('./walker').getWalker;
var traversal = require('./traversal'),
    firstChild = traversal.firstChild,
    nextSibling = traversal.nextSibling,
    parentNode = traversal.parentNode;


/**
 * The offset in the virtual element declaration where the attributes are
 * specified.
 * @const
 */
var ATTRIBUTES_OFFSET = 3;


/**
 * Builds an array of arguments for use with elementOpenStart, attr and
 * elementOpenEnd.
 * @type {Array<*>}
 * @const
 */
var argsBuilder = [];


if (process.env.NODE_ENV !== 'production') {
  /**
   * Keeps track whether or not we are in an attributes declaration (after
   * elementOpenStart, but before elementOpenEnd).
   * @type {boolean}
   */
  var inAttributes = false;


  /** Makes sure that the caller is not where attributes are expected. */
  var assertNotInAttributes = function() {
    if (inAttributes) {
      throw new Error('Was not expecting a call to attr or elementOpenEnd, ' +
          'they must follow a call to elementOpenStart.');
    }
  };


  /** Makes sure that the caller is where attributes are expected. */
  var assertInAttributes = function() {
    if (!inAttributes) {
      throw new Error('Was expecting a call to attr or elementOpenEnd. ' +
          'elementOpenStart must be followed by zero or more calls to attr, ' +
          'then one call to elementOpenEnd.');
    }
  };


  /** Updates the state to being in an attribute declaration. */
  var setInAttributes = function() {
    inAttributes = true;
  };


  /** Updates the state to not being in an attribute declaration. */
  var setNotInAttributes = function() {
    inAttributes = false;
  };
}


/**
 * Checks to see if one or more attributes have changed for a given
 * Element. When no attributes have changed, this function is much faster than
 * checking each individual argument. When attributes have changed, the overhead
 * of this function is minimal.
 *
 * This function is called in the context of the Element and the arguments from
 * elementOpen-like function so that the arguments are not de-optimized.
 *
 * @this {Element} The Element to check for changed attributes.
 * @param {*} unused1
 * @param {*} unused2
 * @param {*} unused3
 * @param {...*} var_args Attribute name/value pairs of the dynamic attributes
 *     for the Element.
 * @return {boolean} True if the Element has one or more changed attributes,
 *     false otherwise.
 */
var hasChangedAttrs = function(unused1, unused2, unused3, var_args) {
  var data = getData(this);
  var attrsArr = data.attrsArr;
  var attrsChanged = false;
  var i;

  for (i = ATTRIBUTES_OFFSET; i < arguments.length; i += 2) {
    // Translate the from the arguments index (for values) to the attribute's
    // ordinal. The attribute values are at arguments index 3, 5, 7, etc. To get
    // the ordinal, need to subtract the offset and divide by 2
    if (attrsArr[(i - ATTRIBUTES_OFFSET) >> 1] !== arguments[i + 1]) {
      attrsChanged = true;
      break;
    }
  }

  if (attrsChanged) {
    for (i = ATTRIBUTES_OFFSET; i < arguments.length; i += 2) {
      attrsArr[(i - ATTRIBUTES_OFFSET) >> 1] = arguments[i + 1];
    }
  }

  return attrsChanged;
};


/**
 * Updates the newAttrs object for an Element.
 *
 * This function is called in the context of the Element and the arguments from
 * elementOpen-like function so that the arguments are not de-optimized.
 *
 * @this {Element} The Element to update newAttrs for.
 * @param {*} unused1
 * @param {*} unused2
 * @param {*} unused3
 * @param {...*} var_args Attribute name/value pairs of the dynamic attributes
 *     for the Element.
 * @return {!Object<string, *>} The updated newAttrs object.
 */
var updateNewAttrs = function(unused1, unused2, unused3, var_args) {
  var node = this;
  var data = getData(node);
  var newAttrs = data.newAttrs;

  for (var attr in newAttrs) {
    newAttrs[attr] = undefined;
  }

  for (var i = ATTRIBUTES_OFFSET; i < arguments.length; i += 2) {
    newAttrs[arguments[i]] = arguments[i + 1];
  }

  return newAttrs;
};


/**
 * Updates the attributes for a given Element.
 * @param {!Element} node
 * @param {!Object<string,*>} newAttrs The new attributes for node
 */
var updateAttributes = function(node, newAttrs) {
  for (var attr in newAttrs) {
    updateAttribute(node, attr, newAttrs[attr]);
  }
};


/**
 * Declares a virtual Element at the current location in the document. This
 * corresponds to an opening tag and a elementClose tag is required.
 * @param {string} tag The element's tag.
 * @param {?string} key The key used to identify this element. This can be an
 *     empty string, but performance may be better if a unique value is used
 *     when iterating over an array of items.
 * @param {?Array<*>} statics An array of attribute name/value pairs of the
 *     static attributes for the Element. These will only be set once when the
 *     Element is created.
 * @param {...*} var_args Attribute name/value pairs of the dynamic attributes
 *     for the Element.
 */
var elementOpen = function(tag, key, statics, var_args) {
  if (process.env.NODE_ENV !== 'production') {
    assertNotInAttributes();
  }

  var node = alignWithDOM(tag, key, statics);

  if (hasChangedAttrs.apply(node, arguments)) {
    var newAttrs = updateNewAttrs.apply(node, arguments);
    updateAttributes(node, newAttrs);
  }

  firstChild();
};


/**
 * Declares a virtual Element at the current location in the document. This
 * corresponds to an opening tag and a elementClose tag is required. This is
 * like elementOpen, but the attributes are defined using the attr function
 * rather than being passed as arguments. Must be folllowed by 0 or more calls
 * to attr, then a call to elementOpenEnd.
 * @param {string} tag The element's tag.
 * @param {?string} key The key used to identify this element. This can be an
 *     empty string, but performance may be better if a unique value is used
 *     when iterating over an array of items.
 * @param {?Array<*>} statics An array of attribute name/value pairs of the
 *     static attributes for the Element. These will only be set once when the
 *     Element is created.
 */
var elementOpenStart = function(tag, key, statics) {
  if (process.env.NODE_ENV !== 'production') {
    assertNotInAttributes();
    setInAttributes();
  }

  argsBuilder[0] = tag;
  argsBuilder[1] = key;
  argsBuilder[2] = statics;
  argsBuilder.length = ATTRIBUTES_OFFSET;
};


/***
 * Defines a virtual attribute at this point of the DOM. This is only valid
 * when called between elementOpenStart and elementOpenEnd.
 *
 * @param {string} name
 * @param {*} value
 */
var attr = function(name, value) {
  if (process.env.NODE_ENV !== 'production') {
    assertInAttributes();
  }

  argsBuilder.push(name, value);
};


/**
 * Closes an open tag started with elementOpenStart.
 */
var elementOpenEnd = function() {
  if (process.env.NODE_ENV !== 'production') {
    assertInAttributes();
    setNotInAttributes();
  }

  elementOpen.apply(null, argsBuilder);
};


/**
 * Closes an open virtual Element.
 *
 * @param {string} tag The element's tag.
 */
var elementClose = function(tag) {
  if (process.env.NODE_ENV !== 'production') {
    assertNotInAttributes();
  }

  parentNode();
  nextSibling();
};


/**
 * Declares a virtual Element at the current location in the document that has
 * no children.
 * @param {string} tag The element's tag.
 * @param {?string} key The key used to identify this element. This can be an
 *     empty string, but performance may be better if a unique value is used
 *     when iterating over an array of items.
 * @param {?Array<*>} statics An array of attribute name/value pairs of the
 *     static attributes for the Element. These will only be set once when the
 *     Element is created.
 * @param {...*} var_args Attribute name/value pairs of the dynamic attributes
 *     for the Element.
 */
var elementVoid = function(tag, key, statics, var_args) {
  if (process.env.NODE_ENV !== 'production') {
    assertNotInAttributes();
  }

  elementOpen.apply(null, arguments);
  elementClose.apply(null, arguments);
};


/**
 * Declares a virtual Text at this point in the document.
 *
 * @param {string} value The text of the Text.
 */
var text = function(value) {
  if (process.env.NODE_ENV !== 'production') {
    assertNotInAttributes();
  }

  var node = alignWithDOM('#text', null, value);
  var data = getData(node);

  if (data.text !== value) {
    node.data = value;
    data.text = value;
  }

  nextSibling();
};


/** */
module.exports = {
  elementOpenStart: elementOpenStart,
  elementOpenEnd: elementOpenEnd,
  elementOpen: elementOpen,
  elementVoid: elementVoid,
  elementClose: elementClose,
  text: text,
  attr: attr
};


}).call(this,require('_process'))
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9pbmNyZW1lbnRhbC1kb20vc3JjL3ZpcnR1YWxfZWxlbWVudHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIENvcHlyaWdodCAyMDE1IFRoZSBJbmNyZW1lbnRhbCBET00gQXV0aG9ycy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTLUlTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbnZhciBhbGlnbldpdGhET00gPSByZXF1aXJlKCcuL2FsaWdubWVudCcpLmFsaWduV2l0aERPTTtcbnZhciB1cGRhdGVBdHRyaWJ1dGUgPSByZXF1aXJlKCcuL2F0dHJpYnV0ZXMnKS51cGRhdGVBdHRyaWJ1dGU7XG52YXIgZ2V0RGF0YSA9IHJlcXVpcmUoJy4vbm9kZV9kYXRhJykuZ2V0RGF0YTtcbnZhciBnZXRXYWxrZXIgPSByZXF1aXJlKCcuL3dhbGtlcicpLmdldFdhbGtlcjtcbnZhciB0cmF2ZXJzYWwgPSByZXF1aXJlKCcuL3RyYXZlcnNhbCcpLFxuICAgIGZpcnN0Q2hpbGQgPSB0cmF2ZXJzYWwuZmlyc3RDaGlsZCxcbiAgICBuZXh0U2libGluZyA9IHRyYXZlcnNhbC5uZXh0U2libGluZyxcbiAgICBwYXJlbnROb2RlID0gdHJhdmVyc2FsLnBhcmVudE5vZGU7XG5cblxuLyoqXG4gKiBUaGUgb2Zmc2V0IGluIHRoZSB2aXJ0dWFsIGVsZW1lbnQgZGVjbGFyYXRpb24gd2hlcmUgdGhlIGF0dHJpYnV0ZXMgYXJlXG4gKiBzcGVjaWZpZWQuXG4gKiBAY29uc3RcbiAqL1xudmFyIEFUVFJJQlVURVNfT0ZGU0VUID0gMztcblxuXG4vKipcbiAqIEJ1aWxkcyBhbiBhcnJheSBvZiBhcmd1bWVudHMgZm9yIHVzZSB3aXRoIGVsZW1lbnRPcGVuU3RhcnQsIGF0dHIgYW5kXG4gKiBlbGVtZW50T3BlbkVuZC5cbiAqIEB0eXBlIHtBcnJheTwqPn1cbiAqIEBjb25zdFxuICovXG52YXIgYXJnc0J1aWxkZXIgPSBbXTtcblxuXG5pZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJykge1xuICAvKipcbiAgICogS2VlcHMgdHJhY2sgd2hldGhlciBvciBub3Qgd2UgYXJlIGluIGFuIGF0dHJpYnV0ZXMgZGVjbGFyYXRpb24gKGFmdGVyXG4gICAqIGVsZW1lbnRPcGVuU3RhcnQsIGJ1dCBiZWZvcmUgZWxlbWVudE9wZW5FbmQpLlxuICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICovXG4gIHZhciBpbkF0dHJpYnV0ZXMgPSBmYWxzZTtcblxuXG4gIC8qKiBNYWtlcyBzdXJlIHRoYXQgdGhlIGNhbGxlciBpcyBub3Qgd2hlcmUgYXR0cmlidXRlcyBhcmUgZXhwZWN0ZWQuICovXG4gIHZhciBhc3NlcnROb3RJbkF0dHJpYnV0ZXMgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoaW5BdHRyaWJ1dGVzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dhcyBub3QgZXhwZWN0aW5nIGEgY2FsbCB0byBhdHRyIG9yIGVsZW1lbnRPcGVuRW5kLCAnICtcbiAgICAgICAgICAndGhleSBtdXN0IGZvbGxvdyBhIGNhbGwgdG8gZWxlbWVudE9wZW5TdGFydC4nKTtcbiAgICB9XG4gIH07XG5cblxuICAvKiogTWFrZXMgc3VyZSB0aGF0IHRoZSBjYWxsZXIgaXMgd2hlcmUgYXR0cmlidXRlcyBhcmUgZXhwZWN0ZWQuICovXG4gIHZhciBhc3NlcnRJbkF0dHJpYnV0ZXMgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIWluQXR0cmlidXRlcykge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdXYXMgZXhwZWN0aW5nIGEgY2FsbCB0byBhdHRyIG9yIGVsZW1lbnRPcGVuRW5kLiAnICtcbiAgICAgICAgICAnZWxlbWVudE9wZW5TdGFydCBtdXN0IGJlIGZvbGxvd2VkIGJ5IHplcm8gb3IgbW9yZSBjYWxscyB0byBhdHRyLCAnICtcbiAgICAgICAgICAndGhlbiBvbmUgY2FsbCB0byBlbGVtZW50T3BlbkVuZC4nKTtcbiAgICB9XG4gIH07XG5cblxuICAvKiogVXBkYXRlcyB0aGUgc3RhdGUgdG8gYmVpbmcgaW4gYW4gYXR0cmlidXRlIGRlY2xhcmF0aW9uLiAqL1xuICB2YXIgc2V0SW5BdHRyaWJ1dGVzID0gZnVuY3Rpb24oKSB7XG4gICAgaW5BdHRyaWJ1dGVzID0gdHJ1ZTtcbiAgfTtcblxuXG4gIC8qKiBVcGRhdGVzIHRoZSBzdGF0ZSB0byBub3QgYmVpbmcgaW4gYW4gYXR0cmlidXRlIGRlY2xhcmF0aW9uLiAqL1xuICB2YXIgc2V0Tm90SW5BdHRyaWJ1dGVzID0gZnVuY3Rpb24oKSB7XG4gICAgaW5BdHRyaWJ1dGVzID0gZmFsc2U7XG4gIH07XG59XG5cblxuLyoqXG4gKiBDaGVja3MgdG8gc2VlIGlmIG9uZSBvciBtb3JlIGF0dHJpYnV0ZXMgaGF2ZSBjaGFuZ2VkIGZvciBhIGdpdmVuXG4gKiBFbGVtZW50LiBXaGVuIG5vIGF0dHJpYnV0ZXMgaGF2ZSBjaGFuZ2VkLCB0aGlzIGZ1bmN0aW9uIGlzIG11Y2ggZmFzdGVyIHRoYW5cbiAqIGNoZWNraW5nIGVhY2ggaW5kaXZpZHVhbCBhcmd1bWVudC4gV2hlbiBhdHRyaWJ1dGVzIGhhdmUgY2hhbmdlZCwgdGhlIG92ZXJoZWFkXG4gKiBvZiB0aGlzIGZ1bmN0aW9uIGlzIG1pbmltYWwuXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyBjYWxsZWQgaW4gdGhlIGNvbnRleHQgb2YgdGhlIEVsZW1lbnQgYW5kIHRoZSBhcmd1bWVudHMgZnJvbVxuICogZWxlbWVudE9wZW4tbGlrZSBmdW5jdGlvbiBzbyB0aGF0IHRoZSBhcmd1bWVudHMgYXJlIG5vdCBkZS1vcHRpbWl6ZWQuXG4gKlxuICogQHRoaXMge0VsZW1lbnR9IFRoZSBFbGVtZW50IHRvIGNoZWNrIGZvciBjaGFuZ2VkIGF0dHJpYnV0ZXMuXG4gKiBAcGFyYW0geyp9IHVudXNlZDFcbiAqIEBwYXJhbSB7Kn0gdW51c2VkMlxuICogQHBhcmFtIHsqfSB1bnVzZWQzXG4gKiBAcGFyYW0gey4uLip9IHZhcl9hcmdzIEF0dHJpYnV0ZSBuYW1lL3ZhbHVlIHBhaXJzIG9mIHRoZSBkeW5hbWljIGF0dHJpYnV0ZXNcbiAqICAgICBmb3IgdGhlIEVsZW1lbnQuXG4gKiBAcmV0dXJuIHtib29sZWFufSBUcnVlIGlmIHRoZSBFbGVtZW50IGhhcyBvbmUgb3IgbW9yZSBjaGFuZ2VkIGF0dHJpYnV0ZXMsXG4gKiAgICAgZmFsc2Ugb3RoZXJ3aXNlLlxuICovXG52YXIgaGFzQ2hhbmdlZEF0dHJzID0gZnVuY3Rpb24odW51c2VkMSwgdW51c2VkMiwgdW51c2VkMywgdmFyX2FyZ3MpIHtcbiAgdmFyIGRhdGEgPSBnZXREYXRhKHRoaXMpO1xuICB2YXIgYXR0cnNBcnIgPSBkYXRhLmF0dHJzQXJyO1xuICB2YXIgYXR0cnNDaGFuZ2VkID0gZmFsc2U7XG4gIHZhciBpO1xuXG4gIGZvciAoaSA9IEFUVFJJQlVURVNfT0ZGU0VUOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgLy8gVHJhbnNsYXRlIHRoZSBmcm9tIHRoZSBhcmd1bWVudHMgaW5kZXggKGZvciB2YWx1ZXMpIHRvIHRoZSBhdHRyaWJ1dGUnc1xuICAgIC8vIG9yZGluYWwuIFRoZSBhdHRyaWJ1dGUgdmFsdWVzIGFyZSBhdCBhcmd1bWVudHMgaW5kZXggMywgNSwgNywgZXRjLiBUbyBnZXRcbiAgICAvLyB0aGUgb3JkaW5hbCwgbmVlZCB0byBzdWJ0cmFjdCB0aGUgb2Zmc2V0IGFuZCBkaXZpZGUgYnkgMlxuICAgIGlmIChhdHRyc0FyclsoaSAtIEFUVFJJQlVURVNfT0ZGU0VUKSA+PiAxXSAhPT0gYXJndW1lbnRzW2kgKyAxXSkge1xuICAgICAgYXR0cnNDaGFuZ2VkID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGlmIChhdHRyc0NoYW5nZWQpIHtcbiAgICBmb3IgKGkgPSBBVFRSSUJVVEVTX09GRlNFVDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkgKz0gMikge1xuICAgICAgYXR0cnNBcnJbKGkgLSBBVFRSSUJVVEVTX09GRlNFVCkgPj4gMV0gPSBhcmd1bWVudHNbaSArIDFdO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBhdHRyc0NoYW5nZWQ7XG59O1xuXG5cbi8qKlxuICogVXBkYXRlcyB0aGUgbmV3QXR0cnMgb2JqZWN0IGZvciBhbiBFbGVtZW50LlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gaXMgY2FsbGVkIGluIHRoZSBjb250ZXh0IG9mIHRoZSBFbGVtZW50IGFuZCB0aGUgYXJndW1lbnRzIGZyb21cbiAqIGVsZW1lbnRPcGVuLWxpa2UgZnVuY3Rpb24gc28gdGhhdCB0aGUgYXJndW1lbnRzIGFyZSBub3QgZGUtb3B0aW1pemVkLlxuICpcbiAqIEB0aGlzIHtFbGVtZW50fSBUaGUgRWxlbWVudCB0byB1cGRhdGUgbmV3QXR0cnMgZm9yLlxuICogQHBhcmFtIHsqfSB1bnVzZWQxXG4gKiBAcGFyYW0geyp9IHVudXNlZDJcbiAqIEBwYXJhbSB7Kn0gdW51c2VkM1xuICogQHBhcmFtIHsuLi4qfSB2YXJfYXJncyBBdHRyaWJ1dGUgbmFtZS92YWx1ZSBwYWlycyBvZiB0aGUgZHluYW1pYyBhdHRyaWJ1dGVzXG4gKiAgICAgZm9yIHRoZSBFbGVtZW50LlxuICogQHJldHVybiB7IU9iamVjdDxzdHJpbmcsICo+fSBUaGUgdXBkYXRlZCBuZXdBdHRycyBvYmplY3QuXG4gKi9cbnZhciB1cGRhdGVOZXdBdHRycyA9IGZ1bmN0aW9uKHVudXNlZDEsIHVudXNlZDIsIHVudXNlZDMsIHZhcl9hcmdzKSB7XG4gIHZhciBub2RlID0gdGhpcztcbiAgdmFyIGRhdGEgPSBnZXREYXRhKG5vZGUpO1xuICB2YXIgbmV3QXR0cnMgPSBkYXRhLm5ld0F0dHJzO1xuXG4gIGZvciAodmFyIGF0dHIgaW4gbmV3QXR0cnMpIHtcbiAgICBuZXdBdHRyc1thdHRyXSA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGZvciAodmFyIGkgPSBBVFRSSUJVVEVTX09GRlNFVDsgaSA8IGFyZ3VtZW50cy5sZW5ndGg7IGkgKz0gMikge1xuICAgIG5ld0F0dHJzW2FyZ3VtZW50c1tpXV0gPSBhcmd1bWVudHNbaSArIDFdO1xuICB9XG5cbiAgcmV0dXJuIG5ld0F0dHJzO1xufTtcblxuXG4vKipcbiAqIFVwZGF0ZXMgdGhlIGF0dHJpYnV0ZXMgZm9yIGEgZ2l2ZW4gRWxlbWVudC5cbiAqIEBwYXJhbSB7IUVsZW1lbnR9IG5vZGVcbiAqIEBwYXJhbSB7IU9iamVjdDxzdHJpbmcsKj59IG5ld0F0dHJzIFRoZSBuZXcgYXR0cmlidXRlcyBmb3Igbm9kZVxuICovXG52YXIgdXBkYXRlQXR0cmlidXRlcyA9IGZ1bmN0aW9uKG5vZGUsIG5ld0F0dHJzKSB7XG4gIGZvciAodmFyIGF0dHIgaW4gbmV3QXR0cnMpIHtcbiAgICB1cGRhdGVBdHRyaWJ1dGUobm9kZSwgYXR0ciwgbmV3QXR0cnNbYXR0cl0pO1xuICB9XG59O1xuXG5cbi8qKlxuICogRGVjbGFyZXMgYSB2aXJ0dWFsIEVsZW1lbnQgYXQgdGhlIGN1cnJlbnQgbG9jYXRpb24gaW4gdGhlIGRvY3VtZW50LiBUaGlzXG4gKiBjb3JyZXNwb25kcyB0byBhbiBvcGVuaW5nIHRhZyBhbmQgYSBlbGVtZW50Q2xvc2UgdGFnIGlzIHJlcXVpcmVkLlxuICogQHBhcmFtIHtzdHJpbmd9IHRhZyBUaGUgZWxlbWVudCdzIHRhZy5cbiAqIEBwYXJhbSB7P3N0cmluZ30ga2V5IFRoZSBrZXkgdXNlZCB0byBpZGVudGlmeSB0aGlzIGVsZW1lbnQuIFRoaXMgY2FuIGJlIGFuXG4gKiAgICAgZW1wdHkgc3RyaW5nLCBidXQgcGVyZm9ybWFuY2UgbWF5IGJlIGJldHRlciBpZiBhIHVuaXF1ZSB2YWx1ZSBpcyB1c2VkXG4gKiAgICAgd2hlbiBpdGVyYXRpbmcgb3ZlciBhbiBhcnJheSBvZiBpdGVtcy5cbiAqIEBwYXJhbSB7P0FycmF5PCo+fSBzdGF0aWNzIEFuIGFycmF5IG9mIGF0dHJpYnV0ZSBuYW1lL3ZhbHVlIHBhaXJzIG9mIHRoZVxuICogICAgIHN0YXRpYyBhdHRyaWJ1dGVzIGZvciB0aGUgRWxlbWVudC4gVGhlc2Ugd2lsbCBvbmx5IGJlIHNldCBvbmNlIHdoZW4gdGhlXG4gKiAgICAgRWxlbWVudCBpcyBjcmVhdGVkLlxuICogQHBhcmFtIHsuLi4qfSB2YXJfYXJncyBBdHRyaWJ1dGUgbmFtZS92YWx1ZSBwYWlycyBvZiB0aGUgZHluYW1pYyBhdHRyaWJ1dGVzXG4gKiAgICAgZm9yIHRoZSBFbGVtZW50LlxuICovXG52YXIgZWxlbWVudE9wZW4gPSBmdW5jdGlvbih0YWcsIGtleSwgc3RhdGljcywgdmFyX2FyZ3MpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHtcbiAgICBhc3NlcnROb3RJbkF0dHJpYnV0ZXMoKTtcbiAgfVxuXG4gIHZhciBub2RlID0gYWxpZ25XaXRoRE9NKHRhZywga2V5LCBzdGF0aWNzKTtcblxuICBpZiAoaGFzQ2hhbmdlZEF0dHJzLmFwcGx5KG5vZGUsIGFyZ3VtZW50cykpIHtcbiAgICB2YXIgbmV3QXR0cnMgPSB1cGRhdGVOZXdBdHRycy5hcHBseShub2RlLCBhcmd1bWVudHMpO1xuICAgIHVwZGF0ZUF0dHJpYnV0ZXMobm9kZSwgbmV3QXR0cnMpO1xuICB9XG5cbiAgZmlyc3RDaGlsZCgpO1xufTtcblxuXG4vKipcbiAqIERlY2xhcmVzIGEgdmlydHVhbCBFbGVtZW50IGF0IHRoZSBjdXJyZW50IGxvY2F0aW9uIGluIHRoZSBkb2N1bWVudC4gVGhpc1xuICogY29ycmVzcG9uZHMgdG8gYW4gb3BlbmluZyB0YWcgYW5kIGEgZWxlbWVudENsb3NlIHRhZyBpcyByZXF1aXJlZC4gVGhpcyBpc1xuICogbGlrZSBlbGVtZW50T3BlbiwgYnV0IHRoZSBhdHRyaWJ1dGVzIGFyZSBkZWZpbmVkIHVzaW5nIHRoZSBhdHRyIGZ1bmN0aW9uXG4gKiByYXRoZXIgdGhhbiBiZWluZyBwYXNzZWQgYXMgYXJndW1lbnRzLiBNdXN0IGJlIGZvbGxsb3dlZCBieSAwIG9yIG1vcmUgY2FsbHNcbiAqIHRvIGF0dHIsIHRoZW4gYSBjYWxsIHRvIGVsZW1lbnRPcGVuRW5kLlxuICogQHBhcmFtIHtzdHJpbmd9IHRhZyBUaGUgZWxlbWVudCdzIHRhZy5cbiAqIEBwYXJhbSB7P3N0cmluZ30ga2V5IFRoZSBrZXkgdXNlZCB0byBpZGVudGlmeSB0aGlzIGVsZW1lbnQuIFRoaXMgY2FuIGJlIGFuXG4gKiAgICAgZW1wdHkgc3RyaW5nLCBidXQgcGVyZm9ybWFuY2UgbWF5IGJlIGJldHRlciBpZiBhIHVuaXF1ZSB2YWx1ZSBpcyB1c2VkXG4gKiAgICAgd2hlbiBpdGVyYXRpbmcgb3ZlciBhbiBhcnJheSBvZiBpdGVtcy5cbiAqIEBwYXJhbSB7P0FycmF5PCo+fSBzdGF0aWNzIEFuIGFycmF5IG9mIGF0dHJpYnV0ZSBuYW1lL3ZhbHVlIHBhaXJzIG9mIHRoZVxuICogICAgIHN0YXRpYyBhdHRyaWJ1dGVzIGZvciB0aGUgRWxlbWVudC4gVGhlc2Ugd2lsbCBvbmx5IGJlIHNldCBvbmNlIHdoZW4gdGhlXG4gKiAgICAgRWxlbWVudCBpcyBjcmVhdGVkLlxuICovXG52YXIgZWxlbWVudE9wZW5TdGFydCA9IGZ1bmN0aW9uKHRhZywga2V5LCBzdGF0aWNzKSB7XG4gIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgYXNzZXJ0Tm90SW5BdHRyaWJ1dGVzKCk7XG4gICAgc2V0SW5BdHRyaWJ1dGVzKCk7XG4gIH1cblxuICBhcmdzQnVpbGRlclswXSA9IHRhZztcbiAgYXJnc0J1aWxkZXJbMV0gPSBrZXk7XG4gIGFyZ3NCdWlsZGVyWzJdID0gc3RhdGljcztcbiAgYXJnc0J1aWxkZXIubGVuZ3RoID0gQVRUUklCVVRFU19PRkZTRVQ7XG59O1xuXG5cbi8qKipcbiAqIERlZmluZXMgYSB2aXJ0dWFsIGF0dHJpYnV0ZSBhdCB0aGlzIHBvaW50IG9mIHRoZSBET00uIFRoaXMgaXMgb25seSB2YWxpZFxuICogd2hlbiBjYWxsZWQgYmV0d2VlbiBlbGVtZW50T3BlblN0YXJ0IGFuZCBlbGVtZW50T3BlbkVuZC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZVxuICogQHBhcmFtIHsqfSB2YWx1ZVxuICovXG52YXIgYXR0ciA9IGZ1bmN0aW9uKG5hbWUsIHZhbHVlKSB7XG4gIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgYXNzZXJ0SW5BdHRyaWJ1dGVzKCk7XG4gIH1cblxuICBhcmdzQnVpbGRlci5wdXNoKG5hbWUsIHZhbHVlKTtcbn07XG5cblxuLyoqXG4gKiBDbG9zZXMgYW4gb3BlbiB0YWcgc3RhcnRlZCB3aXRoIGVsZW1lbnRPcGVuU3RhcnQuXG4gKi9cbnZhciBlbGVtZW50T3BlbkVuZCA9IGZ1bmN0aW9uKCkge1xuICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJykge1xuICAgIGFzc2VydEluQXR0cmlidXRlcygpO1xuICAgIHNldE5vdEluQXR0cmlidXRlcygpO1xuICB9XG5cbiAgZWxlbWVudE9wZW4uYXBwbHkobnVsbCwgYXJnc0J1aWxkZXIpO1xufTtcblxuXG4vKipcbiAqIENsb3NlcyBhbiBvcGVuIHZpcnR1YWwgRWxlbWVudC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFnIFRoZSBlbGVtZW50J3MgdGFnLlxuICovXG52YXIgZWxlbWVudENsb3NlID0gZnVuY3Rpb24odGFnKSB7XG4gIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgYXNzZXJ0Tm90SW5BdHRyaWJ1dGVzKCk7XG4gIH1cblxuICBwYXJlbnROb2RlKCk7XG4gIG5leHRTaWJsaW5nKCk7XG59O1xuXG5cbi8qKlxuICogRGVjbGFyZXMgYSB2aXJ0dWFsIEVsZW1lbnQgYXQgdGhlIGN1cnJlbnQgbG9jYXRpb24gaW4gdGhlIGRvY3VtZW50IHRoYXQgaGFzXG4gKiBubyBjaGlsZHJlbi5cbiAqIEBwYXJhbSB7c3RyaW5nfSB0YWcgVGhlIGVsZW1lbnQncyB0YWcuXG4gKiBAcGFyYW0gez9zdHJpbmd9IGtleSBUaGUga2V5IHVzZWQgdG8gaWRlbnRpZnkgdGhpcyBlbGVtZW50LiBUaGlzIGNhbiBiZSBhblxuICogICAgIGVtcHR5IHN0cmluZywgYnV0IHBlcmZvcm1hbmNlIG1heSBiZSBiZXR0ZXIgaWYgYSB1bmlxdWUgdmFsdWUgaXMgdXNlZFxuICogICAgIHdoZW4gaXRlcmF0aW5nIG92ZXIgYW4gYXJyYXkgb2YgaXRlbXMuXG4gKiBAcGFyYW0gez9BcnJheTwqPn0gc3RhdGljcyBBbiBhcnJheSBvZiBhdHRyaWJ1dGUgbmFtZS92YWx1ZSBwYWlycyBvZiB0aGVcbiAqICAgICBzdGF0aWMgYXR0cmlidXRlcyBmb3IgdGhlIEVsZW1lbnQuIFRoZXNlIHdpbGwgb25seSBiZSBzZXQgb25jZSB3aGVuIHRoZVxuICogICAgIEVsZW1lbnQgaXMgY3JlYXRlZC5cbiAqIEBwYXJhbSB7Li4uKn0gdmFyX2FyZ3MgQXR0cmlidXRlIG5hbWUvdmFsdWUgcGFpcnMgb2YgdGhlIGR5bmFtaWMgYXR0cmlidXRlc1xuICogICAgIGZvciB0aGUgRWxlbWVudC5cbiAqL1xudmFyIGVsZW1lbnRWb2lkID0gZnVuY3Rpb24odGFnLCBrZXksIHN0YXRpY3MsIHZhcl9hcmdzKSB7XG4gIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgYXNzZXJ0Tm90SW5BdHRyaWJ1dGVzKCk7XG4gIH1cblxuICBlbGVtZW50T3Blbi5hcHBseShudWxsLCBhcmd1bWVudHMpO1xuICBlbGVtZW50Q2xvc2UuYXBwbHkobnVsbCwgYXJndW1lbnRzKTtcbn07XG5cblxuLyoqXG4gKiBEZWNsYXJlcyBhIHZpcnR1YWwgVGV4dCBhdCB0aGlzIHBvaW50IGluIHRoZSBkb2N1bWVudC5cbiAqXG4gKiBAcGFyYW0ge3N0cmluZ30gdmFsdWUgVGhlIHRleHQgb2YgdGhlIFRleHQuXG4gKi9cbnZhciB0ZXh0ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHtcbiAgICBhc3NlcnROb3RJbkF0dHJpYnV0ZXMoKTtcbiAgfVxuXG4gIHZhciBub2RlID0gYWxpZ25XaXRoRE9NKCcjdGV4dCcsIG51bGwsIHZhbHVlKTtcbiAgdmFyIGRhdGEgPSBnZXREYXRhKG5vZGUpO1xuXG4gIGlmIChkYXRhLnRleHQgIT09IHZhbHVlKSB7XG4gICAgbm9kZS5kYXRhID0gdmFsdWU7XG4gICAgZGF0YS50ZXh0ID0gdmFsdWU7XG4gIH1cblxuICBuZXh0U2libGluZygpO1xufTtcblxuXG4vKiogKi9cbm1vZHVsZS5leHBvcnRzID0ge1xuICBlbGVtZW50T3BlblN0YXJ0OiBlbGVtZW50T3BlblN0YXJ0LFxuICBlbGVtZW50T3BlbkVuZDogZWxlbWVudE9wZW5FbmQsXG4gIGVsZW1lbnRPcGVuOiBlbGVtZW50T3BlbixcbiAgZWxlbWVudFZvaWQ6IGVsZW1lbnRWb2lkLFxuICBlbGVtZW50Q2xvc2U6IGVsZW1lbnRDbG9zZSxcbiAgdGV4dDogdGV4dCxcbiAgYXR0cjogYXR0clxufTtcblxuIl19
},{"./alignment":20,"./attributes":21,"./node_data":22,"./traversal":25,"./walker":28,"_process":18}],28:[function(require,module,exports){
/**
 * Copyright 2015 The Incremental DOM Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @type {TreeWalker}
 */
var walker_;


/**
 * @return {TreeWalker} the current TreeWalker
 */
var getWalker = function() {
  return walker_;
};


/**
 * Sets the current TreeWalker
 * @param {TreeWalker} walker
 */
var setWalker = function(walker) {
  walker_ = walker;
};


/** */
module.exports = {
  getWalker: getWalker,
  setWalker: setWalker
};


},{}],29:[function(require,module,exports){
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
},{}],30:[function(require,module,exports){
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

},{"array-spy":31,"has-own-prop":32,"is-plain-object":33,"shallow-copy":35,"trackr":38}],31:[function(require,module,exports){
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

},{}],32:[function(require,module,exports){
'use strict';
var hasOwnProp = Object.prototype.hasOwnProperty;

module.exports = function (obj, prop) {
	return hasOwnProp.call(obj, prop);
};

},{}],33:[function(require,module,exports){
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

},{"isobject":34}],34:[function(require,module,exports){
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

},{}],35:[function(require,module,exports){
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

},{}],36:[function(require,module,exports){
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

},{"performance-now":37}],37:[function(require,module,exports){
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
},{"_process":18}],38:[function(require,module,exports){
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
},{"raf":36}],39:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZG9tcmFuZ2UuanMiLCJsaWIvaW5kZXguanMiLCJsaWIvbSt4bWwuanMiLCJsaWIvbW9kZWwuanMiLCJsaWIvbXVzdGFjaGUuanMiLCJsaWIvcGx1Z2lucy9hY3Rpb25zLmpzIiwibGliL3BsdWdpbnMvYWRvcHRpb24uanMiLCJsaWIvcGx1Z2lucy9pbmRleC5qcyIsImxpYi9wbHVnaW5zL3JlZnMuanMiLCJsaWIvcGx1Z2lucy90d293YXkuanMiLCJsaWIvc2VjdGlvbi5qcyIsImxpYi90eXBlcy5qcyIsImxpYi91dGlscy5qcyIsImxpYi92aWV3LmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lLmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lL2JhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lLmpzIiwibm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9pbmNyZW1lbnRhbC1kb20vaW5kZXguanMiLCJub2RlX21vZHVsZXMvaW5jcmVtZW50YWwtZG9tL3NyYy9hbGlnbm1lbnQuanMiLCJub2RlX21vZHVsZXMvaW5jcmVtZW50YWwtZG9tL3NyYy9hdHRyaWJ1dGVzLmpzIiwibm9kZV9tb2R1bGVzL2luY3JlbWVudGFsLWRvbS9zcmMvbm9kZV9kYXRhLmpzIiwibm9kZV9tb2R1bGVzL2luY3JlbWVudGFsLWRvbS9zcmMvbm9kZXMuanMiLCJub2RlX21vZHVsZXMvaW5jcmVtZW50YWwtZG9tL3NyYy9wYXRjaC5qcyIsIm5vZGVfbW9kdWxlcy9pbmNyZW1lbnRhbC1kb20vc3JjL3RyYXZlcnNhbC5qcyIsIm5vZGVfbW9kdWxlcy9pbmNyZW1lbnRhbC1kb20vc3JjL3RyZWVfd2Fsa2VyLmpzIiwibm9kZV9tb2R1bGVzL2luY3JlbWVudGFsLWRvbS9zcmMvdmlydHVhbF9lbGVtZW50cy5qcyIsIm5vZGVfbW9kdWxlcy9pbmNyZW1lbnRhbC1kb20vc3JjL3dhbGtlci5qcyIsIm5vZGVfbW9kdWxlcy9tYXRjaGVzLXNlbGVjdG9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL25vZGVfbW9kdWxlcy9hcnJheS1zcHkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHJhY2tyLW9iamVjdHMvbm9kZV9tb2R1bGVzL2hhcy1vd24tcHJvcC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3Itb2JqZWN0cy9ub2RlX21vZHVsZXMvaXMtcGxhaW4tb2JqZWN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL25vZGVfbW9kdWxlcy9pcy1wbGFpbi1vYmplY3Qvbm9kZV9tb2R1bGVzL2lzb2JqZWN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL25vZGVfbW9kdWxlcy9zaGFsbG93LWNvcHkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHJhY2tyL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHJhY2tyL25vZGVfbW9kdWxlcy9yYWYvbm9kZV9tb2R1bGVzL3BlcmZvcm1hbmNlLW5vdy9saWIvcGVyZm9ybWFuY2Utbm93LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci90cmFja3IuanMiLCJub2RlX21vZHVsZXMvdW5kZXJzY29yZS91bmRlcnNjb3JlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6WkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3B1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZZQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2TkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pMQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwUkE7QUFDQTs7QUNEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9CQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxVUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuT0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2bUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBUaGlzIGlzIGEgaGVhdmlseSBtb2RpZmllZCB2ZXJzaW9uIG9mIE1ldGVvcidzIERPTVJhbmdlIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iLzQwNTAwOWEyYzNkY2QzYzFmZTc4MGFkYjI4NjdkMzhhNmE0MmZmZjEvcGFja2FnZXMvYmxhemUvZG9tcmFuZ2UuanMgLy9cbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbnZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdEV2ZW50cyA9IHJlcXVpcmUoXCJiYWNrYm9uZS1ldmVudHMtc3RhbmRhbG9uZVwiKSxcblx0dXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKSxcblx0bWF0Y2hlc1NlbGVjdG9yID0gcmVxdWlyZShcIm1hdGNoZXMtc2VsZWN0b3JcIik7XG5cbmZ1bmN0aW9uIGlzQXJyYXlMaWtlKGEpIHtcblx0cmV0dXJuIGEgIT0gbnVsbCAmJiB0eXBlb2YgYS5sZW5ndGggPT09IFwibnVtYmVyXCI7XG59XG5cbi8vIGBbbmV3XSBCbGF6ZS5fRE9NUmFuZ2UoW25vZGVBbmRSYW5nZUFycmF5XSlgXG4vL1xuLy8gQSBET01SYW5nZSBjb25zaXN0cyBvZiBhbiBhcnJheSBvZiBjb25zZWN1dGl2ZSBub2RlcyBhbmQgRE9NUmFuZ2VzLFxuLy8gd2hpY2ggbWF5IGJlIHJlcGxhY2VkIGF0IGFueSB0aW1lIHdpdGggYSBuZXcgYXJyYXkuICBJZiB0aGUgRE9NUmFuZ2Vcbi8vIGhhcyBiZWVuIGF0dGFjaGVkIHRvIHRoZSBET00gYXQgc29tZSBsb2NhdGlvbiwgdGhlbiB1cGRhdGluZ1xuLy8gdGhlIGFycmF5IHdpbGwgY2F1c2UgdGhlIERPTSB0byBiZSB1cGRhdGVkIGF0IHRoYXQgbG9jYXRpb24uXG5mdW5jdGlvbiBET01SYW5nZShub2RlQW5kUmFuZ2VBcnJheSkge1xuXHQvLyBjYWxsZWQgd2l0aG91dCBgbmV3YFxuXHRpZiAoISh0aGlzIGluc3RhbmNlb2YgRE9NUmFuZ2UpKSB7XG5cdFx0cmV0dXJuIG5ldyBET01SYW5nZShub2RlQW5kUmFuZ2VBcnJheSk7XG5cdH1cblxuXHR2YXIgbWVtYmVycyA9IChub2RlQW5kUmFuZ2VBcnJheSB8fCBbXSk7XG5cdGlmICghaXNBcnJheUxpa2UobWVtYmVycykpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGFycmF5XCIpO1xuXG5cdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdHRoaXMuX21lbWJlckluKG1lbWJlcnNbaV0pO1xuXHR9XG5cblx0dGhpcy5tZW1iZXJzID0gbWVtYmVycztcblx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdHRoaXMuYXR0YWNoZWQgPSBmYWxzZTtcblx0dGhpcy5wYXJlbnRFbGVtZW50ID0gbnVsbDtcblx0dGhpcy5wYXJlbnRSYW5nZSA9IG51bGw7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERPTVJhbmdlO1xuRE9NUmFuZ2UuZXh0ZW5kID0gcmVxdWlyZShcImJhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lXCIpO1xuXG4vLyBmaW5kcyB0aGUgRE9NUmFuZ2UgdGhlIGVsZW1lbnQgaXMgYSBwYXJ0IG9mXG5ET01SYW5nZS5mb3JFbGVtZW50ID0gZnVuY3Rpb24gKGVsZW0pIHtcblx0aWYgKGVsZW0ubm9kZVR5cGUgIT09IDEpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGVsZW1lbnQsIGZvdW5kOiBcIiArIGVsZW0pO1xuXG5cdHZhciByYW5nZSA9IG51bGw7XG5cblx0d2hpbGUgKGVsZW0gJiYgIXJhbmdlKSB7XG5cdFx0cmFuZ2UgPSAoZWxlbS4kZG9tcmFuZ2UgfHwgbnVsbCk7XG5cdFx0ZWxlbSA9IGVsZW0ucGFyZW50Tm9kZTtcblx0fVxuXG5cdHJldHVybiByYW5nZTtcbn07XG5cbl8uZXh0ZW5kKERPTVJhbmdlLnByb3RvdHlwZSwgRXZlbnRzLCB7XG5cblx0Ly8gVGhpcyBtZXRob2QgaXMgY2FsbGVkIHRvIGluc2VydCB0aGUgRE9NUmFuZ2UgaW50byB0aGUgRE9NIGZvclxuXHQvLyB0aGUgZmlyc3QgdGltZSwgYnV0IGl0J3MgYWxzbyB1c2VkIGludGVybmFsbHkgd2hlblxuXHQvLyB1cGRhdGluZyB0aGUgRE9NLlxuXHQvLyBJZiBfaXNNb3ZlIGlzIHRydWUsIG1vdmUgdGhpcyBhdHRhY2hlZCByYW5nZSB0byBhIGRpZmZlcmVudFxuXHQvLyBsb2NhdGlvbiB1bmRlciB0aGUgc2FtZSBwYXJlbnRFbGVtZW50LlxuXHRhdHRhY2g6IGZ1bmN0aW9uKHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlLCBfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKHR5cGVvZiBwYXJlbnRFbGVtZW50ID09PSBcInN0cmluZ1wiKSBwYXJlbnRFbGVtZW50ID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihwYXJlbnRFbGVtZW50KTtcblx0XHRpZiAodHlwZW9mIG5leHROb2RlID09PSBcInN0cmluZ1wiKSBuZXh0Tm9kZSA9IHBhcmVudC5xdWVyeVNlbGVjdG9yKG5leHROb2RlKTtcblx0XHRpZiAocGFyZW50RWxlbWVudCA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSB2YWxpZCBET00gZWxlbWVudCB0byBhdHRhY2ggaW4uXCIpO1xuXG5cdFx0aWYgKChfaXNNb3ZlIHx8IF9pc1JlcGxhY2UpICYmICEodGhpcy5wYXJlbnRFbGVtZW50ID09PSBwYXJlbnRFbGVtZW50ICYmIHRoaXMuYXR0YWNoZWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4gb25seSBtb3ZlIG9yIHJlcGxhY2UgYW4gYXR0YWNoZWQgRE9NUmFuZ2UsIGFuZCBvbmx5IHVuZGVyIHRoZSBzYW1lIHBhcmVudCBlbGVtZW50XCIpO1xuXHRcdH1cblxuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGlmIChtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG1lbWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0aW5zZXJ0SW50b0RPTShtZW1iZXJzW2ldLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyTm9kZSgpO1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IHBsYWNlaG9sZGVyO1xuXHRcdFx0cGFyZW50RWxlbWVudC5pbnNlcnRCZWZvcmUocGxhY2Vob2xkZXIsIG5leHROb2RlKTtcblx0XHR9XG5cblx0XHR0aGlzLmF0dGFjaGVkID0gdHJ1ZTtcblx0XHR0aGlzLnBhcmVudEVsZW1lbnQgPSBwYXJlbnRFbGVtZW50O1xuXG5cdFx0Ly8gdHJpZ2dlciBldmVudHMgb25seSBvbiBmcmVzaCBhdHRhY2htZW50c1xuXHRcdGlmICghKF9pc01vdmUgfHwgX2lzUmVwbGFjZSkpIHRoaXMudHJpZ2dlcihcImF0dGFjaFwiLCBwYXJlbnRFbGVtZW50KTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGRldGFjaDogZnVuY3Rpb24oX2lzUmVwbGFjZSkge1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkgcmV0dXJuIHRoaXM7XG5cblx0XHR2YXIgb2xkUGFyZW50RWxlbWVudCA9IHRoaXMucGFyZW50RWxlbWVudDtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRpZiAobWVtYmVycy5sZW5ndGgpIHtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRyZW1vdmVGcm9tRE9NKG1lbWJlcnNbaV0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgcGxhY2Vob2xkZXIgPSB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50LnJlbW92ZUNoaWxkKHBsYWNlaG9sZGVyKTtcblx0XHRcdHRoaXMucGxhY2Vob2xkZXIgPSBudWxsO1xuXHRcdH1cblxuXHRcdGlmICghX2lzUmVwbGFjZSkge1xuXHRcdFx0dGhpcy5hdHRhY2hlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5wYXJlbnRFbGVtZW50ID0gbnVsbDtcblx0XHRcdHRoaXMudHJpZ2dlcihcImRldGFjaFwiLCBvbGRQYXJlbnRFbGVtZW50KTtcblx0XHR9XG5cdH0sXG5cblx0Zmlyc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHRocm93IG5ldyBFcnJvcihcIk11c3QgYmUgYXR0YWNoZWRcIik7XG5cdFx0aWYgKCF0aGlzLm1lbWJlcnMubGVuZ3RoKSByZXR1cm4gdGhpcy5wbGFjZWhvbGRlcjtcblx0XHR2YXIgbSA9IHRoaXMubWVtYmVyc1swXTtcblx0XHRyZXR1cm4gKG0gaW5zdGFuY2VvZiBET01SYW5nZSkgPyBtLmZpcnN0Tm9kZSgpIDogbTtcblx0fSxcblxuXHRsYXN0Tm9kZTogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSB0aHJvdyBuZXcgRXJyb3IoXCJNdXN0IGJlIGF0dGFjaGVkXCIpO1xuXHRcdGlmICghdGhpcy5tZW1iZXJzLmxlbmd0aCkgcmV0dXJuIHRoaXMucGxhY2Vob2xkZXI7XG5cdFx0dmFyIG0gPSB0aGlzLm1lbWJlcnNbdGhpcy5tZW1iZXJzLmxlbmd0aCAtIDFdO1xuXHRcdHJldHVybiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0ubGFzdE5vZGUoKSA6IG07XG5cdH0sXG5cblx0Z2V0TWVtYmVyOiBmdW5jdGlvbihhdEluZGV4KSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0aWYgKCEoYXRJbmRleCA+PSAwICYmIGF0SW5kZXggPCBtZW1iZXJzLmxlbmd0aCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBpbmRleCBpbiByYW5nZS5nZXRNZW1iZXI6IFwiICsgYXRJbmRleCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLm1lbWJlcnNbYXRJbmRleF07XG5cdH0sXG5cblx0Ly8gcmVzZXRzIHRoZSBET01SYW5nZSB3aXRoIG5ldyBjb250ZW50XG5cdHNldE1lbWJlcnM6IGZ1bmN0aW9uKG5ld05vZGVBbmRSYW5nZUFycmF5KSB7XG5cdFx0dmFyIG5ld01lbWJlcnMgPSBuZXdOb2RlQW5kUmFuZ2VBcnJheTtcblx0XHRpZiAoIWlzQXJyYXlMaWtlKG5ld01lbWJlcnMpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBhcnJheVwiKTtcblx0XHR2YXIgb2xkTWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHR2YXIgX2lzUmVwbGFjZSA9IHRoaXMuYXR0YWNoZWQgJiYgKG5ld01lbWJlcnMubGVuZ3RoIHx8IG9sZE1lbWJlcnMubGVuZ3RoKTtcblxuXHRcdC8vIGRlcmVmZXJlbmNlIG9sZCBtZW1iZXJzXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBvbGRNZW1iZXJzLmxlbmd0aDsgaSsrKSB0aGlzLl9tZW1iZXJPdXQob2xkTWVtYmVyc1tpXSwgZmFsc2UsIF9pc1JlcGxhY2UpO1xuXG5cdFx0Ly8gcmVmZXJlbmNlIG5ldyBtZW1iZXJzXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBuZXdNZW1iZXJzLmxlbmd0aDsgaSsrKSB0aGlzLl9tZW1iZXJJbihuZXdNZW1iZXJzW2ldKTtcblxuXHRcdGlmIChfaXNSZXBsYWNlKSB7XG5cdFx0XHQvLyBkZXRhY2ggdGhlIG9sZCBtZW1iZXJzIGFuZCBpbnNlcnQgdGhlIG5ldyBtZW1iZXJzXG5cdFx0XHR2YXIgbmV4dE5vZGUgPSB0aGlzLmxhc3ROb2RlKCkubmV4dFNpYmxpbmc7XG5cdFx0XHR2YXIgcGFyZW50RWxlbWVudCA9IHRoaXMucGFyZW50RWxlbWVudDtcblx0XHRcdC8vIFVzZSBkZXRhY2gvYXR0YWNoLCBidXQgZG9uJ3QgdHJpZ2dlciBldmVudHNcblx0XHRcdHRoaXMuZGV0YWNoKHRydWUgLypfaXNSZXBsYWNlKi8pO1xuXHRcdFx0dGhpcy5tZW1iZXJzID0gbmV3TWVtYmVycztcblx0XHRcdHRoaXMuYXR0YWNoKHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBmYWxzZSwgdHJ1ZSAvKl9pc1JlcGxhY2UqLyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIGRvbid0IGRvIGFueXRoaW5nIGlmIHdlJ3JlIGdvaW5nIGZyb20gZW1wdHkgdG8gZW1wdHlcblx0XHRcdHRoaXMubWVtYmVycyA9IG5ld01lbWJlcnM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkTWVtYmVyOiBmdW5jdGlvbihuZXdNZW1iZXIsIGF0SW5kZXgsIF9pc01vdmUpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblxuXHRcdC8vIHZhbGlkYXRlIHRoZSBpbmRleFxuXHRcdGlmICh0eXBlb2YgYXRJbmRleCAhPT0gXCJudW1iZXJcIiB8fCBpc05hTihhdEluZGV4KSB8fFxuXHRcdFx0YXRJbmRleCA8IDAgfHwgYXRJbmRleCA+IG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHRhdEluZGV4ID0gbWVtYmVycy5sZW5ndGg7XG5cdFx0fVxuXG5cdFx0Ly8gYWRkIHJlZmVyZW5jZXMgdG8gdGhlIG5ldyBtZW1iZXJcblx0XHRpZiAoIV9pc01vdmUpIHRoaXMuX21lbWJlckluKG5ld01lbWJlcik7XG5cblx0XHQvLyBjdXJyZW50bHkgZGV0YWNoZWQ7IGp1c3QgdXBkYXRlZCBtZW1iZXJzXG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSB7XG5cdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAwLCBuZXdNZW1iZXIpO1xuXHRcdH1cblxuXHRcdC8vIGVtcHR5OyB1c2UgdGhlIGVtcHR5LXRvLW5vbmVtcHR5IGhhbmRsaW5nIG9mIHNldE1lbWJlcnNcblx0XHRlbHNlIGlmIChtZW1iZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5zZXRNZW1iZXJzKFsgbmV3TWVtYmVyIF0pO1xuXHRcdH1cblxuXHRcdC8vIG90aGVyd2lzZSBhZGQgYXQgbG9jYXRpb25cblx0XHRlbHNlIHtcblx0XHRcdHZhciBuZXh0Tm9kZTtcblx0XHRcdGlmIChhdEluZGV4ID09PSBtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0XHQvLyBpbnNlcnQgYXQgZW5kXG5cdFx0XHRcdG5leHROb2RlID0gdGhpcy5sYXN0Tm9kZSgpLm5leHRTaWJsaW5nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIG0gPSBtZW1iZXJzW2F0SW5kZXhdO1xuXHRcdFx0XHRuZXh0Tm9kZSA9IChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpID8gbS5maXJzdE5vZGUoKSA6IG07XG5cdFx0XHR9XG5cblx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDAsIG5ld01lbWJlcik7XG5cdFx0XHRpbnNlcnRJbnRvRE9NKG5ld01lbWJlciwgdGhpcy5wYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVtb3ZlTWVtYmVyOiBmdW5jdGlvbihhdEluZGV4LCBfaXNNb3ZlKSB7XG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cblx0XHQvLyBhbHNvIGFjY2VwdHMgdGhlIG1lbWJlciB0byByZW1vdmVcblx0XHRpZiAodHlwZW9mIGF0SW5kZXggIT09IFwibnVtYmVyXCIgfHwgaXNOYU4oYXRJbmRleCkpIHtcblx0XHRcdGF0SW5kZXggPSB0aGlzLmluZGV4T2YoYXRJbmRleCk7XG5cdFx0fVxuXG5cdFx0Ly8gdmFsaWRhdGUgdGhlIGluZGV4XG5cdFx0aWYgKGF0SW5kZXggPCAwIHx8IGF0SW5kZXggPj0gbWVtYmVycy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkJhZCBpbmRleCBpbiByYW5nZS5yZW1vdmVNZW1iZXI6IFwiICsgYXRJbmRleCk7XG5cdFx0fVxuXG5cdFx0aWYgKF9pc01vdmUpIHtcblx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgb2xkTWVtYmVyID0gbWVtYmVyc1thdEluZGV4XTtcblxuXHRcdFx0aWYgKG1lbWJlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdC8vIGJlY29taW5nIGVtcHR5OyB1c2UgdGhlIGxvZ2ljIGluIHNldE1lbWJlcnNcblx0XHRcdFx0dGhpcy5zZXRNZW1iZXJzKFtdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX21lbWJlck91dChvbGRNZW1iZXIpO1xuXHRcdFx0XHRtZW1iZXJzLnNwbGljZShhdEluZGV4LCAxKTtcblx0XHRcdFx0aWYgKHRoaXMuYXR0YWNoZWQpIHJlbW92ZUZyb21ET00ob2xkTWVtYmVyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRtb3ZlTWVtYmVyOiBmdW5jdGlvbihvbGRJbmRleCwgbmV3SW5kZXgpIHtcblx0XHR2YXIgbWVtYmVyID0gdGhpcy5tZW1iZXJzW29sZEluZGV4XTtcblx0XHR0aGlzLnJlbW92ZU1lbWJlcihvbGRJbmRleCwgdHJ1ZSAvKl9pc01vdmUqLyk7XG5cdFx0dGhpcy5hZGRNZW1iZXIobWVtYmVyLCBuZXdJbmRleCwgdHJ1ZSAvKl9pc01vdmUqLyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aW5kZXhPZjogZnVuY3Rpb24obWVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMubWVtYmVycy5pbmRleE9mKG1lbWJlcik7XG5cdH0sXG5cblx0Y29udGFpbnM6IGZ1bmN0aW9uKG1lbWJlcikge1xuXHRcdHJldHVybiB0aGlzLmluZGV4T2YobWVtYmVyKSA+IC0xO1xuXHR9LFxuXG5cdF9tZW1iZXJJbjogZnVuY3Rpb24obSkge1xuXHRcdGlmIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdG0ucGFyZW50UmFuZ2UgPSB0aGlzO1xuXHRcdH0gZWxzZSBpZiAobS5ub2RlVHlwZSA9PT0gMSkgeyAvLyBET00gRWxlbWVudFxuXHRcdFx0bS4kZG9tcmFuZ2UgPSB0aGlzO1xuXHRcdH1cblx0fSxcblxuXHRfbWVtYmVyT3V0OiBmdW5jdGlvbiAobSwgX3NraXBOb2RlcywgX2lzUmVwbGFjZSkge1xuXHRcdGlmIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdGlmIChfaXNSZXBsYWNlKSBtLmRlc3Ryb3lNZW1iZXJzKF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpO1xuXHRcdFx0ZWxzZSBtLmRlc3Ryb3koX3NraXBOb2Rlcyk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoIV9za2lwTm9kZXMgJiYgbS5ub2RlVHlwZSA9PT0gMSAmJiBtLiRkb21yYW5nZSkge1xuXHRcdFx0bS4kZG9tcmFuZ2UgPSBudWxsO1xuXHRcdH1cblx0fSxcblxuXHQvLyBUZWFyIGRvd24sIGJ1dCBkb24ndCByZW1vdmUsIHRoZSBtZW1iZXJzLiAgVXNlZCB3aGVuIGNodW5rc1xuXHQvLyBvZiBET00gYXJlIGJlaW5nIHRvcm4gZG93biBvciByZXBsYWNlZC5cblx0ZGVzdHJveU1lbWJlcnM6IGZ1bmN0aW9uKF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG1lbWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdHRoaXMuX21lbWJlck91dChtZW1iZXJzW2ldLCBfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZGVzdHJveTogZnVuY3Rpb24oX3NraXBOb2Rlcykge1xuXHRcdHRoaXMuZGV0YWNoKCk7XG5cdFx0dGhpcy50cmlnZ2VyKFwiZGVzdHJveVwiLCBfc2tpcE5vZGVzKTtcblx0XHR0aGlzLmRlc3Ryb3lNZW1iZXJzKF9za2lwTm9kZXMpO1xuXHRcdHRoaXMubWVtYmVycyA9IFtdO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGZpbmRBbGw6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIG1hdGNoZXMgPSBbXSxcblx0XHRcdGVsO1xuXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLm1lbWJlcnMpIHtcblx0XHRcdGVsID0gdGhpcy5tZW1iZXJzW2ldO1xuXHRcdFx0aWYgKGVsIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0bWF0Y2hlcy5wdXNoLmFwcGx5KG1hdGNoZXMsIGVsLmZpbmRBbGwoc2VsZWN0b3IpKTtcblx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGVsLnF1ZXJ5U2VsZWN0b3JBbGwgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0XHRpZiAoZWwubm9kZVR5cGUgPT09IDEgJiYgbWF0Y2hlc1NlbGVjdG9yKGVsLCBzZWxlY3RvcikpIG1hdGNoZXMucHVzaChlbCk7XG5cdFx0XHRcdG1hdGNoZXMucHVzaC5hcHBseShtYXRjaGVzLCBlbC5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1hdGNoZXNcblx0fSxcblxuXHRmaW5kOiBmdW5jdGlvbihzZWxlY3Rvcikge1xuXHRcdHZhciBlbCwgcmVzO1xuXG5cdFx0Zm9yICh2YXIgaSBpbiB0aGlzLm1lbWJlcnMpIHtcblx0XHRcdGVsID0gdGhpcy5tZW1iZXJzW2ldO1xuXHRcdFx0aWYgKGVsIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0cmVzID0gZWwuZmluZChzZWxlY3Rvcik7XG5cdFx0XHR9IGVsc2UgaWYgKGVsLm5vZGVUeXBlID09PSAxICYmIG1hdGNoZXNTZWxlY3RvcihlbCwgc2VsZWN0b3IpKSB7XG5cdFx0XHRcdHJlcyA9IGVsO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgZWwucXVlcnlTZWxlY3RvciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdHJlcyA9IGVsLnF1ZXJ5U2VsZWN0b3Ioc2VsZWN0b3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzICE9IG51bGwpIHJldHVybiByZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxufSk7XG5cbi8vIEluIElFIDgsIGRvbid0IHVzZSBlbXB0eSB0ZXh0IG5vZGVzIGFzIHBsYWNlaG9sZGVyc1xuLy8gaW4gZW1wdHkgRE9NUmFuZ2VzLCB1c2UgY29tbWVudCBub2RlcyBpbnN0ZWFkLiAgVXNpbmdcbi8vIGVtcHR5IHRleHQgbm9kZXMgaW4gbW9kZXJuIGJyb3dzZXJzIGlzIGdyZWF0IGJlY2F1c2Vcbi8vIGl0IGRvZXNuJ3QgY2x1dHRlciB0aGUgd2ViIGluc3BlY3Rvci4gIEluIElFIDgsIGhvd2V2ZXIsXG4vLyBpdCBzZWVtcyB0byBsZWFkIGluIHNvbWUgcm91bmRhYm91dCB3YXkgdG8gdGhlIE9BdXRoXG4vLyBwb3AtdXAgY3Jhc2hpbmcgdGhlIGJyb3dzZXIgY29tcGxldGVseS4gIEluIHRoZSBwYXN0LFxuLy8gd2UgZGlkbid0IHVzZSBlbXB0eSB0ZXh0IG5vZGVzIG9uIElFIDggYmVjYXVzZSB0aGV5XG4vLyBkb24ndCBhY2NlcHQgSlMgcHJvcGVydGllcywgc28ganVzdCB1c2UgdGhlIHNhbWUgbG9naWNcbi8vIGV2ZW4gdGhvdWdoIHdlIGRvbid0IG5lZWQgdG8gc2V0IHByb3BlcnRpZXMgb24gdGhlXG4vLyBwbGFjZWhvbGRlciBhbnltb3JlLlxudmFyIFVTRV9DT01NRU5UX1BMQUNFSE9MREVSUyA9IChmdW5jdGlvbiAoKSB7XG5cdHZhciByZXN1bHQgPSBmYWxzZTtcblx0dmFyIHRleHROb2RlID0gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJcIik7XG5cdHRyeSB7XG5cdFx0dGV4dE5vZGUuc29tZVByb3AgPSB0cnVlO1xuXHR9IGNhdGNoIChlKSB7XG5cdFx0Ly8gSUUgOFxuXHRcdHJlc3VsdCA9IHRydWU7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn0pKCk7XG5cbmZ1bmN0aW9uIHBsYWNlaG9sZGVyTm9kZSgpIHtcblx0cmV0dXJuIFVTRV9DT01NRU5UX1BMQUNFSE9MREVSUyA/XG5cdFx0ZG9jdW1lbnQuY3JlYXRlQ29tbWVudChcIlwiKSA6XG5cdFx0ZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUoXCJcIik7XG59XG5cbi8vIHByaXZhdGUgbWV0aG9kc1xuZnVuY3Rpb24gaW5zZXJ0SW50b0RPTShyYW5nZU9yTm9kZSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUpIHtcblx0dmFyIG0gPSByYW5nZU9yTm9kZTtcblx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdG0uYXR0YWNoKHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlKTtcblx0fSBlbHNlIHtcblx0XHRpZiAoX2lzTW92ZSkge1xuXHRcdFx0bW92ZU5vZGVXaXRoSG9va3MobSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpbnNlcnROb2RlV2l0aEhvb2tzKG0sIHBhcmVudEVsZW1lbnQsIG5leHROb2RlKTtcblx0XHR9XG5cdH1cbn07XG5cbmZ1bmN0aW9uIHJlbW92ZUZyb21ET00ocmFuZ2VPck5vZGUpIHtcblx0dmFyIG0gPSByYW5nZU9yTm9kZTtcblx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdG0uZGV0YWNoKCk7XG5cdH0gZWxzZSB7XG5cdFx0cmVtb3ZlTm9kZVdpdGhIb29rcyhtKTtcblx0fVxufTtcblxuZnVuY3Rpb24gcmVtb3ZlTm9kZVdpdGhIb29rcyhuKSB7XG5cdGlmICghbi5wYXJlbnROb2RlKSByZXR1cm47XG5cdGlmIChuLm5vZGVUeXBlID09PSAxICYmIG4ucGFyZW50Tm9kZS5fdWlob29rcyAmJiBuLnBhcmVudE5vZGUuX3VpaG9va3MucmVtb3ZlRWxlbWVudCkge1xuXHRcdG4ucGFyZW50Tm9kZS5fdWlob29rcy5yZW1vdmVFbGVtZW50KG4pO1xuXHR9IGVsc2Uge1xuXHRcdG4ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChuKTtcblx0fVxufTtcblxuZnVuY3Rpb24gaW5zZXJ0Tm9kZVdpdGhIb29rcyhuLCBwYXJlbnQsIG5leHQpIHtcblx0Ly8gYHx8IG51bGxgIGJlY2F1c2UgSUUgdGhyb3dzIGFuIGVycm9yIGlmICduZXh0JyBpcyB1bmRlZmluZWRcblx0bmV4dCA9IG5leHQgfHwgbnVsbDtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgcGFyZW50Ll91aWhvb2tzICYmIHBhcmVudC5fdWlob29rcy5pbnNlcnRFbGVtZW50KSB7XG5cdFx0cGFyZW50Ll91aWhvb2tzLmluc2VydEVsZW1lbnQobiwgbmV4dCk7XG5cdH0gZWxzZSB7XG5cdFx0cGFyZW50Lmluc2VydEJlZm9yZShuLCBuZXh0KTtcblx0fVxufTtcblxuZnVuY3Rpb24gbW92ZU5vZGVXaXRoSG9va3MobiwgcGFyZW50LCBuZXh0KSB7XG5cdGlmIChuLnBhcmVudE5vZGUgIT09IHBhcmVudClcblx0XHRyZXR1cm47XG5cdC8vIGB8fCBudWxsYCBiZWNhdXNlIElFIHRocm93cyBhbiBlcnJvciBpZiAnbmV4dCcgaXMgdW5kZWZpbmVkXG5cdG5leHQgPSBuZXh0IHx8IG51bGw7XG5cdGlmIChuLm5vZGVUeXBlID09PSAxICYmIHBhcmVudC5fdWlob29rcyAmJiBwYXJlbnQuX3VpaG9va3MubW92ZUVsZW1lbnQpIHtcblx0XHRwYXJlbnQuX3VpaG9va3MubW92ZUVsZW1lbnQobiwgbmV4dCk7XG5cdH0gZWxzZSB7XG5cdFx0cGFyZW50Lmluc2VydEJlZm9yZShuLCBuZXh0KTtcblx0fVxufTtcbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG52YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciBwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlO1xudmFyIE5PREVfVFlQRSA9IHJlcXVpcmUoXCIuL3R5cGVzXCIpO1xuXG4vLyBwcm9wZXJ0aWVzIHRoYXQgTm9kZS5qcyBhbmQgdGhlIGJyb3dzZXIgY2FuIGhhbmRsZVxudmFyIFRlbXBsZSA9IG1vZHVsZS5leHBvcnRzID0ge1xuXHRWRVJTSU9OOiBcIjAuNS45XCIsXG5cdE5PREVfVFlQRTogTk9ERV9UWVBFLFxuXG5cdC8vIG90aGVyIHBhcnRzXG5cdHV0aWxzOiByZXF1aXJlKFwiLi91dGlsc1wiKSxcblx0TW9kZWw6IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXG5cdC8vIHRyYWNrciBzaG9ydCBwb2ludGVyc1xuXHRUcmFja3I6IFRyYWNrcixcblx0RGVwZW5kZW5jeTogVHJhY2tyLkRlcGVuZGVuY3ksXG5cdGF1dG9ydW46IFRyYWNrci5hdXRvcnVuLFxuXHR0cmFjazogcmVxdWlyZShcInRyYWNrci1vYmplY3RzXCIpLFxuXG5cdC8vIGFsbCB0aGUgcGFyc2VycywgZGVjbGFyZWQgaGVyZSBmb3IgZWFzaWVyIGFjY2Vzc1xuXHRwYXJzZTogcGFyc2UsXG5cdHBhcnNlUGF0aDogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwicGF0aFwiIH0pKTtcblx0fSxcblx0cGFyc2VQYXRoUXVlcnk6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcInBhdGhRdWVyeVwiIH0pKTtcblx0fSxcblx0cGFyc2VBdHRyaWJ1dGVWYWx1ZTogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwiYXR0clZhbHVlXCIgfSkpO1xuXHR9LFxuXHRwYXJzZUFyZ3VtZW50czogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwiYXR0ckFyZ3VtZW50c1wiIH0pKTtcblx0fSxcblxuXHQvLyBjb252ZXJ0cyByYXcgaHRtbCBzdHIgdG8gdGVtcGxhdGUgdHJlZVxuXHRwYXJzZUhUTUw6IGZ1bmN0aW9uKHN0cikge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBOT0RFX1RZUEUuUk9PVCxcblx0XHRcdGNoaWxkcmVuOiBbIHtcblx0XHRcdFx0dHlwZTogTk9ERV9UWVBFLkhUTUwsXG5cdFx0XHRcdHZhbHVlOiBzdHJcblx0XHRcdH0gXSxcblx0XHRcdHZlcnNpb246IFRlbXBsZS5WRVJTSU9OXG5cdFx0fTtcblx0fVxufTtcblxuLy8gbm8gbmVlZCBmb3Igbm9kZSBqcyB0byBodXJ0IGl0c2VsZiBvbiBhbnkgaGFyZCBlZGdlc1xuaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXG4vLyBhdHRhY2ggdGhlIG90aGVyIHBhcnRzIHRoYXQgTm9kZSBjYW4ndCB1c2VcblRlbXBsZS5ET01SYW5nZSA9IHJlcXVpcmUoXCIuL2RvbXJhbmdlXCIpO1xuVGVtcGxlLlZpZXcgPSByZXF1aXJlKFwiLi92aWV3XCIpO1xuVGVtcGxlLlNlY3Rpb24gPSByZXF1aXJlKFwiLi9zZWN0aW9uXCIpO1xuXG4vLyBsb2FkIHRoZSByZWFsIGNsYXNzIGZvciB0aGUgYnJvd3NlclxuVGVtcGxlID0gbW9kdWxlLmV4cG9ydHMgPSBfLmV4dGVuZChyZXF1aXJlKFwiLi9tdXN0YWNoZVwiKSwgVGVtcGxlKTtcblxuLy8gbG9hZCB0aGUgcGx1Z2luIEFQSVxuXy5leHRlbmQoVGVtcGxlLCByZXF1aXJlKFwiLi9wbHVnaW5zXCIpKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuICAvKlxuICAgKiBHZW5lcmF0ZWQgYnkgUEVHLmpzIDAuOC4wLlxuICAgKlxuICAgKiBodHRwOi8vcGVnanMubWFqZGEuY3ovXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHBlZyRzdWJjbGFzcyhjaGlsZCwgcGFyZW50KSB7XG4gICAgZnVuY3Rpb24gY3RvcigpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9XG4gICAgY3Rvci5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuICAgIGNoaWxkLnByb3RvdHlwZSA9IG5ldyBjdG9yKCk7XG4gIH1cblxuICBmdW5jdGlvbiBTeW50YXhFcnJvcihtZXNzYWdlLCBleHBlY3RlZCwgZm91bmQsIG9mZnNldCwgbGluZSwgY29sdW1uKSB7XG4gICAgdGhpcy5tZXNzYWdlICA9IG1lc3NhZ2U7XG4gICAgdGhpcy5leHBlY3RlZCA9IGV4cGVjdGVkO1xuICAgIHRoaXMuZm91bmQgICAgPSBmb3VuZDtcbiAgICB0aGlzLm9mZnNldCAgID0gb2Zmc2V0O1xuICAgIHRoaXMubGluZSAgICAgPSBsaW5lO1xuICAgIHRoaXMuY29sdW1uICAgPSBjb2x1bW47XG5cbiAgICB0aGlzLm5hbWUgICAgID0gXCJTeW50YXhFcnJvclwiO1xuICB9XG5cbiAgcGVnJHN1YmNsYXNzKFN5bnRheEVycm9yLCBFcnJvcik7XG5cbiAgZnVuY3Rpb24gcGFyc2UoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGFyZ3VtZW50cy5sZW5ndGggPiAxID8gYXJndW1lbnRzWzFdIDoge30sXG5cbiAgICAgICAgcGVnJEZBSUxFRCA9IHt9LFxuXG4gICAgICAgIHBlZyRzdGFydFJ1bGVJbmRpY2VzID0geyBzdGFydDogMCwgYXR0clZhbHVlOiA5LCBhdHRyQXJndW1lbnRzOiAxMCwgcGF0aFF1ZXJ5OiAxOSwgcGF0aDogMjEgfSxcbiAgICAgICAgcGVnJHN0YXJ0UnVsZUluZGV4ICAgPSAwLFxuXG4gICAgICAgIHBlZyRjb25zdHMgPSBbXG4gICAgICAgICAgZnVuY3Rpb24oaHRtbCkge1xuICAgICAgICAgIFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0dHlwZTogTk9ERV9UWVBFLlJPT1QsXG4gICAgICAgICAgXHRcdGNoaWxkcmVuOiBodG1sLFxuICAgICAgICAgIFx0XHR2ZXJzaW9uOiBNdXN0YWNoZS5WRVJTSU9OXG4gICAgICAgICAgXHR9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXSxcbiAgICAgICAgICBmdW5jdGlvbihub2RlcykgeyByZXR1cm4gXy5jb21wYWN0KG5vZGVzKTsgfSxcbiAgICAgICAgICBwZWckRkFJTEVELFxuICAgICAgICAgIC9eW148e10vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXjx7XVwiLCBkZXNjcmlwdGlvbjogXCJbXjx7XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odGV4dCkgeyByZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuVEVYVCwgdmFsdWU6IHRleHQuam9pbihcIlwiKSB9OyB9LFxuICAgICAgICAgIFwiPCEtLVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIjwhLS1cIiwgZGVzY3JpcHRpb246IFwiXFxcIjwhLS1cXFwiXCIgfSxcbiAgICAgICAgICB2b2lkIDAsXG4gICAgICAgICAgXCItLT5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCItLT5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi0tPlxcXCJcIiB9LFxuICAgICAgICAgIHsgdHlwZTogXCJhbnlcIiwgZGVzY3JpcHRpb246IFwiYW55IGNoYXJhY3RlclwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odikge1xuICAgICAgICAgIFx0XHRyZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuWENPTU1FTlQsIHZhbHVlOiB2IH07XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIGZ1bmN0aW9uKHN0YXJ0LCBub2RlcywgZW5kKSB7XG4gICAgICAgICAgXHRcdGlmIChzdGFydC5uYW1lLnRvTG93ZXJDYXNlKCkgIT09IGVuZC50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudCB0YWcgbWlzbWF0Y2g6IFwiICsgc3RhcnQubmFtZSArIFwiICE9PSBcIiArIGVuZCk7XG4gICAgICAgICAgXHRcdH1cblxuICAgICAgICAgIFx0XHRzdGFydC50eXBlID0gTk9ERV9UWVBFLkVMRU1FTlQ7XG4gICAgICAgICAgXHRcdHN0YXJ0LmNoaWxkcmVuID0gbm9kZXM7XG4gICAgICAgICAgXHRcdHJldHVybiBzdGFydDtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCI8XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPFxcXCJcIiB9LFxuICAgICAgICAgIFwiLz5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIvPlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLz5cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0YWduYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0bmFtZTogdGFnbmFtZSxcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuRUxFTUVOVCxcbiAgICAgICAgICBcdFx0XHRhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzLFxuICAgICAgICAgIFx0XHRcdGNoaWxkcmVuOiBbXVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiPlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIj5cIiwgZGVzY3JpcHRpb246IFwiXFxcIj5cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0YWduYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7IG5hbWU6IHRhZ25hbWUsIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMgfTtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCI8L1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIjwvXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI8L1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHRhZ25hbWUpIHsgcmV0dXJuIHRhZ25hbWU7IH0sXG4gICAgICAgICAgbnVsbCxcbiAgICAgICAgICBcIj1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI9XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI9XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHR2YWx1ZSA9IHZhbHVlICE9IG51bGwgPyB2YWx1ZVsyXSA6IFwiXCI7XG4gICAgICAgICAgXHRcdHZhciBhcmdzXG5cbiAgICAgICAgICBcdFx0Ly8gY291bGQgZmFpbCBvbiBjb21wbGV4IGF0dHJpYnV0ZXNcbiAgICAgICAgICBcdFx0dHJ5IHtcbiAgICAgICAgICBcdFx0XHRhcmdzID0gcGFyc2UodmFsdWUsICBfLmV4dGVuZCh7fSwgb3B0aW9ucywgeyBzdGFydFJ1bGU6IFwiYXR0ckFyZ3VtZW50c1wiIH0pKTtcbiAgICAgICAgICBcdFx0fSBjYXRjaChlKSB7XG4gICAgICAgICAgXHRcdFx0YXJncyA9IFt7IHR5cGU6IE5PREVfVFlQRS5MSVRFUkFMLCB2YWx1ZTogdmFsdWUgfV07XG4gICAgICAgICAgXHRcdH1cblxuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5BVFRSSUJVVEUsXG4gICAgICAgICAgXHRcdFx0bmFtZToga2V5LFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICBcdFx0XHRjaGlsZHJlbjogcGFyc2UodmFsdWUsIF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7IHN0YXJ0UnVsZTogXCJhdHRyVmFsdWVcIiB9KSksXG4gICAgICAgICAgXHRcdFx0YXJndW1lbnRzOiBhcmdzXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCIsXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIFtdLmNvbmNhdChsLCBfLnBsdWNrKHIsIDEpKTsgfSxcbiAgICAgICAgICBmdW5jdGlvbih2KSB7IHJldHVybiB2LnRyaW0oKTsgfSxcbiAgICAgICAgICBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICBcdFx0aWYgKHZhbCAhPSBudWxsICYmIHZhbC50eXBlKSByZXR1cm4gdmFsO1xuICAgICAgICAgIFx0XHRyZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuTElURVJBTCwgdmFsdWU6IHZhbCB9O1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbihzdGFydCwgbm9kZXMsIGVuZCkge1xuICAgICAgICAgIFx0XHRpZiAob3B0aW9ucy5zdHJpY3QgJiYgIV8uaXNFcXVhbChzdGFydC52YWx1ZS5yYXcsIGVuZCkpIHtcbiAgICAgICAgICBcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJTZWN0aW9uIHRhZyBtaXNtYXRjaDogXCIgKyBzdGFydC52YWx1ZS5yYXcgKyBcIiAhPT0gXCIgKyBlbmQpO1xuICAgICAgICAgIFx0XHR9XG5cbiAgICAgICAgICBcdFx0c3RhcnQudmFsdWUgPSBzdGFydC52YWx1ZS5yZXN1bHQ7XG4gICAgICAgICAgXHRcdHN0YXJ0LmNoaWxkcmVuID0gbm9kZXM7XG4gICAgICAgICAgXHRcdHJldHVybiBzdGFydDtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCJ7e1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ7e1xcXCJcIiB9LFxuICAgICAgICAgIC9eWyNcXF5dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyNcXFxcXl1cIiwgZGVzY3JpcHRpb246IFwiWyNcXFxcXl1cIiB9LFxuICAgICAgICAgIFwifX1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ9fVwiLCBkZXNjcmlwdGlvbjogXCJcXFwifX1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0eXBlLCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRVt0eXBlID09PSBcIiNcIiA/IFwiU0VDVElPTlwiIDogXCJJTlZFUlRFRFwiXSxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcInt7L1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7L1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3svXFxcIlwiIH0sXG4gICAgICAgICAgL15bXn1dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW159XVwiLCBkZXNjcmlwdGlvbjogXCJbXn1dXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2YWx1ZSkgeyByZXR1cm4gdmFsdWUuam9pbihcIlwiKTsgfSxcbiAgICAgICAgICBcInt7e1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7e1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3t7XFxcIlwiIH0sXG4gICAgICAgICAgXCJ9fX1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ9fX1cIiwgZGVzY3JpcHRpb246IFwiXFxcIn19fVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLklOVEVSUE9MQVRPUixcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVbMV1cbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICAvXltcXC8jeyE+XFxeXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIltcXFxcLyN7IT5cXFxcXl1cIiwgZGVzY3JpcHRpb246IFwiW1xcXFwvI3shPlxcXFxeXVwiIH0sXG4gICAgICAgICAgXCImXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiJlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiJlxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKG0sIHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogbSA/IE5PREVfVFlQRS5UUklQTEUgOiBOT0RFX1RZUEUuSU5URVJQT0xBVE9SLFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLlRSSVBMRSxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICAvXlshPl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbIT5dXCIsIGRlc2NyaXB0aW9uOiBcIlshPl1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKG0sIHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogbSA9PT0gXCI+XCIgPyBOT0RFX1RZUEUuUEFSVElBTCA6IE5PREVfVFlQRS5NQ09NTUVOVCxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWUuam9pbihcIlwiKS50cmltKClcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcInxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ8XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ8XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24obSkgeyByZXR1cm4geyByYXc6IHRleHQoKSwgcmVzdWx0OiBtIH0gfSxcbiAgICAgICAgICBmdW5jdGlvbihwLCBjKSB7XG4gICAgICAgICAgXHRcdGlmIChwID09IG51bGwpIHAgPSB7IHR5cGU6IFwiYWxsXCIgfTtcbiAgICAgICAgICBcdFx0cC5wYXJ0cyA9IGM7XG4gICAgICAgICAgXHRcdHJldHVybiBwO1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbihwKSB7IHAucGFydHMgPSBbXTsgcmV0dXJuIHA7IH0sXG4gICAgICAgICAgXCIuLi9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuLi9cIiwgZGVzY3JpcHRpb246IFwiXFxcIi4uL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGQpIHsgcmV0dXJuIHsgdHlwZTogXCJwYXJlbnRcIiwgZGlzdGFuY2U6IGQubGVuZ3RoIH07IH0sXG4gICAgICAgICAgXCIuL1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi4vXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4geyB0eXBlOiBcImxvY2FsXCIgfTsgfSxcbiAgICAgICAgICBcIi5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuXFxcIlwiIH0sXG4gICAgICAgICAgXCIvXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiL1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4geyB0eXBlOiBcInJvb3RcIiB9OyB9LFxuICAgICAgICAgIC9eW2EtejAtOSRfXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05JF9daVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05JF9daVwiIH0sXG4gICAgICAgICAgL15bYS16MC05OlxcLV8kXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05OlxcXFwtXyRdaVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05OlxcXFwtXyRdaVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oaywgYykgeyByZXR1cm4geyBrZXk6IGssIGNoaWxkcmVuOiBjIH0gfSxcbiAgICAgICAgICBcIltcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJbXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJbXFxcIlwiIH0sXG4gICAgICAgICAgXCJdXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGMpIHsgcmV0dXJuIGM7IH0sXG4gICAgICAgICAgXCJ0cnVlXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidHJ1ZVwiLCBkZXNjcmlwdGlvbjogXCJcXFwidHJ1ZVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gdHJ1ZTsgfSxcbiAgICAgICAgICBcImZhbHNlXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiZmFsc2VcIiwgZGVzY3JpcHRpb246IFwiXFxcImZhbHNlXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBmYWxzZTsgfSxcbiAgICAgICAgICBcIi1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCItXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCItXFxcIlwiIH0sXG4gICAgICAgICAgL15bMC05XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlswLTldXCIsIGRlc2NyaXB0aW9uOiBcIlswLTldXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHBhcnNlRmxvYXQodGV4dCgpLCAxMCk7IH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBwYXJzZUludCh0ZXh0KCksIDEwKTsgfSxcbiAgICAgICAgICBcIlxcXCJcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJcXFwiXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJcXFxcXFxcIlxcXCJcIiB9LFxuICAgICAgICAgIC9eW15cIl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXlxcXCJdXCIsIGRlc2NyaXB0aW9uOiBcIlteXFxcIl1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHYpIHsgcmV0dXJuIHYuam9pbihcIlwiKTsgfSxcbiAgICAgICAgICBcIidcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCInXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCInXFxcIlwiIH0sXG4gICAgICAgICAgL15bXiddLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW14nXVwiLCBkZXNjcmlwdGlvbjogXCJbXiddXCIgfSxcbiAgICAgICAgICBcIm51bGxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJudWxsXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJudWxsXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBudWxsOyB9LFxuICAgICAgICAgIFwidW5kZWZpbmVkXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidW5kZWZpbmVkXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ1bmRlZmluZWRcXFwiXCIgfSxcbiAgICAgICAgICBcInZvaWRcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ2b2lkXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ2b2lkXFxcIlwiIH0sXG4gICAgICAgICAgL15bLDsgXFx0XFxuXFxyXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlssOyBcXFxcdFxcXFxuXFxcXHJdXCIsIGRlc2NyaXB0aW9uOiBcIlssOyBcXFxcdFxcXFxuXFxcXHJdXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHZvaWQgMDsgfSxcbiAgICAgICAgICAvXlthLXowLTlfXFwtXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05X1xcXFwtXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOV9cXFxcLV1pXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihrKSB7IHJldHVybiBrOyB9LFxuICAgICAgICAgIHsgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogXCJ3aGl0ZXNwYWNlXCIgfSxcbiAgICAgICAgICAvXlsgXFx0XFxuXFxyXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlsgXFxcXHRcXFxcblxcXFxyXVwiLCBkZXNjcmlwdGlvbjogXCJbIFxcXFx0XFxcXG5cXFxccl1cIiB9LFxuICAgICAgICAgIHsgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogXCJndWFyYW50ZWVkIHdoaXRlc3BhY2VcIiB9LFxuICAgICAgICAgIFwiXFxcXFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIlxcXFxcIiwgZGVzY3JpcHRpb246IFwiXFxcIlxcXFxcXFxcXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oY2hhcikgeyByZXR1cm4gY2hhcjsgfVxuICAgICAgICBdLFxuXG4gICAgICAgIHBlZyRieXRlY29kZSA9IFtcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITchKycgNCE2ICEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITcsKkEgXFxcIjcyKjsgXFxcIjcwKjUgXFxcIjcxKi8gXFxcIjcjKikgXFxcIjckKiMgXFxcIjdcXFwiLEcmNywqQSBcXFwiNzIqOyBcXFwiNzAqNSBcXFwiNzEqLyBcXFwiNyMqKSBcXFwiNyQqIyBcXFwiN1xcXCJcXFwiKycgNCE2XFxcIiEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITAkXFxcIlxcXCIxITMlKywkLCkmMCRcXFwiXFxcIjEhMyVcXFwiXFxcIlxcXCIgIysnIDQhNiYhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLidcXFwiXFxcIjInMygrXFx4QUMkISAhISE4LipcXFwiXFxcIjIqMys5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLFEmISE4LipcXFwiXFxcIjIqMys5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIishICglKzglLipcXFwiXFxcIjIqMysrKCU0IzYtIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCI3JSpJIFxcXCIhNyYrPiQ3ISs0JTcnKyolNCM2LiMjXFxcIiEgJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLi9cXFwiXFxcIjIvMzArVSQ3QCtLJSAhNygsIyY3KFxcXCIrOSUuMVxcXCJcXFwiMjEzMispJTQkNjMkXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuL1xcXCJcXFwiMi8zMCtVJDdAK0slICE3KCwjJjcoXFxcIis5JS40XFxcIlxcXCIyNDM1KyklNCQ2NiRcXFwiXFxcIiElJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS43XFxcIlxcXCIyNzM4K0IkN0ArOCUuNFxcXCJcXFwiMjQzNSsoJTQjNjkjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QCtoJCEuO1xcXCJcXFwiMjszPCtBJDdBKzclNz0rLSU3QSsjJSckJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICMqIyBcXFwiIDorKSU0XFxcIjY9XFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITcsKjUgXFxcIjcyKi8gXFxcIjcwKikgXFxcIjcxKiMgXFxcIjdcXFwiLDsmNywqNSBcXFwiNzIqLyBcXFwiNzAqKSBcXFwiNzEqIyBcXFwiN1xcXCJcXFwiKycgNCE2XFxcIiEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3KytxJCAhIS4+XFxcIlxcXCIyPjM/Ky0kNysrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsPiYhLj5cXFwiXFxcIjI+Mz8rLSQ3KysjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrKSU0XFxcIjZAXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QStcXHhENiQ3LypcXHhCNyBcXFwiNz0qXFx4QjEgXFxcIjc6KlxceEFCIFxcXCI3OypcXHhBNSBcXFwiNz4qXFx4OUYgXFxcIjc/KlxceDk5IFxcXCIhISAhISE4Lj5cXFwiXFxcIjI+Mz85KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLFEmISE4Lj5cXFwiXFxcIjI+Mz85KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIishICglKycgNCE2QSEhICUrMiU3QSsoJTQjNkIjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3LSs+JDchKzQlNy4rKiU0IzZDIyNcXFwiISAlJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuRFxcXCJcXFwiMkQzRStTJDBGXFxcIlxcXCIxITNHK0MlNzQrOSUuSFxcXCJcXFwiMkgzSSspJTQkNkokXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuS1xcXCJcXFwiMkszTCtiJCAhN0MqKSBcXFwiME1cXFwiXFxcIjEhM04sLyY3QyopIFxcXCIwTVxcXCJcXFwiMSEzTlxcXCIrOCUuSFxcXCJcXFwiMkgzSSsoJTQjNk8jISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEhLlBcXFwiXFxcIjJQM1ErPSQ3MyszJS5SXFxcIlxcXCIyUjNTKyMlJyMlJCMjICMkXFxcIiMgI1xcXCIjICMqTiBcXFwiIS5EXFxcIlxcXCIyRDNFKz0kNzMrMyUuSFxcXCJcXFwiMkgzSSsjJScjJSQjIyAjJFxcXCIjICNcXFwiIyAjKycgNCE2VCEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuRFxcXCJcXFwiMkQzRSt3JCE4MFVcXFwiXFxcIjEhM1Y5KiQkXFxcIlxcXCIgKVxcXCIjICMrWSUuV1xcXCJcXFwiMlczWCojIFxcXCIgOitDJTczKzklLkhcXFwiXFxcIjJIM0krKSU0JTZZJVxcXCJcXFwiISUkJSMgIyQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuUFxcXCJcXFwiMlAzUStCJDczKzglLlJcXFwiXFxcIjJSM1MrKCU0IzZaIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLkRcXFwiXFxcIjJEM0UrcyQwW1xcXCJcXFwiMSEzXFxcXCtjJSAhN0MqKSBcXFwiME1cXFwiXFxcIjEhM04sLyY3QyopIFxcXCIwTVxcXCJcXFwiMSEzTlxcXCIrOSUuSFxcXCJcXFwiMkgzSSspJTQkNl0kXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3NStxJCAhIS5eXFxcIlxcXCIyXjNfKy0kNzUrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsPiYhLl5cXFwiXFxcIjJeM18rLSQ3NSsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrKSU0XFxcIjZAXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3MysnIDQhNmAhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0ErTSQ3NiojIFxcXCIgOis9JTc3KzMlN0ErKSU0JDZhJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjKkcgXFxcIiE3QSs8JDc2KzIlN0ErKCU0IzZiIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICEuY1xcXCJcXFwiMmMzZCssJCwpJi5jXFxcIlxcXCIyYzNkXFxcIlxcXCJcXFwiICMrJyA0ITZlISEgJSpiIFxcXCIhLmZcXFwiXFxcIjJmM2crJiA0ITZoISAlKksgXFxcIiEuaVxcXCJcXFwiMmkzaismIDQhNmghICUqNCBcXFwiIS5rXFxcIlxcXCIyazNsKyYgNCE2bSEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITc4K3EkICEhLmlcXFwiXFxcIjJpM2orLSQ3OCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyw+JiEuaVxcXCJcXFwiMmkzaistJDc4KyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIispJTRcXFwiNkBcXFwiXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISEhMG5cXFwiXFxcIjEhM28rQSQgITBwXFxcIlxcXCIxITNxLCkmMHBcXFwiXFxcIjEhM3FcXFwiKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjKyEgKCUrOyQgITc5LCMmNzlcXFwiKyklNFxcXCI2clxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLnNcXFwiXFxcIjJzM3QrYiQ3QStYJTc8KikgXFxcIjc9KiMgXFxcIjc1K0IlN0ErOCUudVxcXCJcXFwiMnUzdisoJTQlNnclIVxcXCIlJCUjICMkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLnhcXFwiXFxcIjJ4M3krJiA0ITZ6ISAlKjQgXFxcIiEue1xcXCJcXFwiMnszfCsmIDQhNn0hICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuflxcXCJcXFwiMn4zfyojIFxcXCIgOitcXHg5MiQgITBcXHg4MFxcXCJcXFwiMSEzXFx4ODErLCQsKSYwXFx4ODBcXFwiXFxcIjEhM1xceDgxXFxcIlxcXCJcXFwiICMrbSUhLmlcXFwiXFxcIjJpM2orSCQgITBcXHg4MFxcXCJcXFwiMSEzXFx4ODErLCQsKSYwXFx4ODBcXFwiXFxcIjEhM1xceDgxXFxcIlxcXCJcXFwiICMrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMqIyBcXFwiIDorJyU0IzZcXHg4MiMgJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICEwXFx4ODBcXFwiXFxcIjEhM1xceDgxKywkLCkmMFxceDgwXFxcIlxcXCIxITNcXHg4MVxcXCJcXFwiXFxcIiAjKyYgNCE2XFx4ODMhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuXFx4ODRcXFwiXFxcIjJcXHg4NDNcXHg4NStiJCAhN0MqKSBcXFwiMFxceDg2XFxcIlxcXCIxITNcXHg4NywvJjdDKikgXFxcIjBcXHg4NlxcXCJcXFwiMSEzXFx4ODdcXFwiKzglLlxceDg0XFxcIlxcXCIyXFx4ODQzXFx4ODUrKCU0IzZcXHg4OCMhISUkIyMgIyRcXFwiIyAjXFxcIiMgIypzIFxcXCIhLlxceDg5XFxcIlxcXCIyXFx4ODkzXFx4OEErYiQgITdDKikgXFxcIjBcXHg4QlxcXCJcXFwiMSEzXFx4OEMsLyY3QyopIFxcXCIwXFx4OEJcXFwiXFxcIjEhM1xceDhDXFxcIis4JS5cXHg4OVxcXCJcXFwiMlxceDg5M1xceDhBKyglNCM2XFx4ODgjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuXFx4OERcXFwiXFxcIjJcXHg4RDNcXHg4RSsmIDQhNlxceDhGISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDkwXFxcIlxcXCIyXFx4OTAzXFx4OTEqXFx4QjMgXFxcIiEuXFx4OTJcXFwiXFxcIjJcXHg5MjNcXHg5MytcXHhBMiQ3QitcXHg5OCUgISEhODBcXHg5NFxcXCJcXFwiMSEzXFx4OTU5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjK1QkLFEmISE4MFxceDk0XFxcIlxcXCIxITNcXHg5NTkqJCRcXFwiXFxcIiApXFxcIiMgIysyJC1cXFwiXFxcIjEhMywrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiXFxcIlxcXCIgIysjJScjJSQjIyAjJFxcXCIjICNcXFwiIyAjKyYgNCE2XFx4OTYhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QStdJCEgITBcXHg5N1xcXCJcXFwiMSEzXFx4OTgrLCQsKSYwXFx4OTdcXFwiXFxcIjEhM1xceDk4XFxcIlxcXCJcXFwiICMrISAoJSsyJTdBKyglNCM2XFx4OTkjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIjghICEwXFx4OUJcXFwiXFxcIjEhM1xceDlDLCkmMFxceDlCXFxcIlxcXCIxITNcXHg5Q1xcXCIrISAoJTkqXFxcIiAzXFx4OUFcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIjghICEwXFx4OUJcXFwiXFxcIjEhM1xceDlDKywkLCkmMFxceDlCXFxcIlxcXCIxITNcXHg5Q1xcXCJcXFwiXFxcIiAjKyEgKCU5KlxcXCIgM1xceDlEXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDlFXFxcIlxcXCIyXFx4OUUzXFx4OUYrNyQtXFxcIlxcXCIxITMsKyglNFxcXCI2XFx4QTBcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpXG4gICAgICAgIF0sXG5cbiAgICAgICAgcGVnJGN1cnJQb3MgICAgICAgICAgPSAwLFxuICAgICAgICBwZWckcmVwb3J0ZWRQb3MgICAgICA9IDAsXG4gICAgICAgIHBlZyRjYWNoZWRQb3MgICAgICAgID0gMCxcbiAgICAgICAgcGVnJGNhY2hlZFBvc0RldGFpbHMgPSB7IGxpbmU6IDEsIGNvbHVtbjogMSwgc2VlbkNSOiBmYWxzZSB9LFxuICAgICAgICBwZWckbWF4RmFpbFBvcyAgICAgICA9IDAsXG4gICAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQgID0gW10sXG4gICAgICAgIHBlZyRzaWxlbnRGYWlscyAgICAgID0gMCxcblxuICAgICAgICBwZWckcmVzdWx0O1xuXG4gICAgaWYgKFwic3RhcnRSdWxlXCIgaW4gb3B0aW9ucykge1xuICAgICAgaWYgKCEob3B0aW9ucy5zdGFydFJ1bGUgaW4gcGVnJHN0YXJ0UnVsZUluZGljZXMpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHN0YXJ0IHBhcnNpbmcgZnJvbSBydWxlIFxcXCJcIiArIG9wdGlvbnMuc3RhcnRSdWxlICsgXCJcXFwiLlwiKTtcbiAgICAgIH1cblxuICAgICAgcGVnJHN0YXJ0UnVsZUluZGV4ID0gcGVnJHN0YXJ0UnVsZUluZGljZXNbb3B0aW9ucy5zdGFydFJ1bGVdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRleHQoKSB7XG4gICAgICByZXR1cm4gaW5wdXQuc3Vic3RyaW5nKHBlZyRyZXBvcnRlZFBvcywgcGVnJGN1cnJQb3MpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9mZnNldCgpIHtcbiAgICAgIHJldHVybiBwZWckcmVwb3J0ZWRQb3M7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGluZSgpIHtcbiAgICAgIHJldHVybiBwZWckY29tcHV0ZVBvc0RldGFpbHMocGVnJHJlcG9ydGVkUG9zKS5saW5lO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbHVtbigpIHtcbiAgICAgIHJldHVybiBwZWckY29tcHV0ZVBvc0RldGFpbHMocGVnJHJlcG9ydGVkUG9zKS5jb2x1bW47XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXhwZWN0ZWQoZGVzY3JpcHRpb24pIHtcbiAgICAgIHRocm93IHBlZyRidWlsZEV4Y2VwdGlvbihcbiAgICAgICAgbnVsbCxcbiAgICAgICAgW3sgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb24gfV0sXG4gICAgICAgIHBlZyRyZXBvcnRlZFBvc1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvcihtZXNzYWdlKSB7XG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24obWVzc2FnZSwgbnVsbCwgcGVnJHJlcG9ydGVkUG9zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckY29tcHV0ZVBvc0RldGFpbHMocG9zKSB7XG4gICAgICBmdW5jdGlvbiBhZHZhbmNlKGRldGFpbHMsIHN0YXJ0UG9zLCBlbmRQb3MpIHtcbiAgICAgICAgdmFyIHAsIGNoO1xuXG4gICAgICAgIGZvciAocCA9IHN0YXJ0UG9zOyBwIDwgZW5kUG9zOyBwKyspIHtcbiAgICAgICAgICBjaCA9IGlucHV0LmNoYXJBdChwKTtcbiAgICAgICAgICBpZiAoY2ggPT09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgIGlmICghZGV0YWlscy5zZWVuQ1IpIHsgZGV0YWlscy5saW5lKys7IH1cbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uID0gMTtcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gZmFsc2U7XG4gICAgICAgICAgfSBlbHNlIGlmIChjaCA9PT0gXCJcXHJcIiB8fCBjaCA9PT0gXCJcXHUyMDI4XCIgfHwgY2ggPT09IFwiXFx1MjAyOVwiKSB7XG4gICAgICAgICAgICBkZXRhaWxzLmxpbmUrKztcbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uID0gMTtcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gdHJ1ZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGV0YWlscy5jb2x1bW4rKztcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChwZWckY2FjaGVkUG9zICE9PSBwb3MpIHtcbiAgICAgICAgaWYgKHBlZyRjYWNoZWRQb3MgPiBwb3MpIHtcbiAgICAgICAgICBwZWckY2FjaGVkUG9zID0gMDtcbiAgICAgICAgICBwZWckY2FjaGVkUG9zRGV0YWlscyA9IHsgbGluZTogMSwgY29sdW1uOiAxLCBzZWVuQ1I6IGZhbHNlIH07XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZShwZWckY2FjaGVkUG9zRGV0YWlscywgcGVnJGNhY2hlZFBvcywgcG9zKTtcbiAgICAgICAgcGVnJGNhY2hlZFBvcyA9IHBvcztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHBlZyRjYWNoZWRQb3NEZXRhaWxzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRmYWlsKGV4cGVjdGVkKSB7XG4gICAgICBpZiAocGVnJGN1cnJQb3MgPCBwZWckbWF4RmFpbFBvcykgeyByZXR1cm47IH1cblxuICAgICAgaWYgKHBlZyRjdXJyUG9zID4gcGVnJG1heEZhaWxQb3MpIHtcbiAgICAgICAgcGVnJG1heEZhaWxQb3MgPSBwZWckY3VyclBvcztcbiAgICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZCA9IFtdO1xuICAgICAgfVxuXG4gICAgICBwZWckbWF4RmFpbEV4cGVjdGVkLnB1c2goZXhwZWN0ZWQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRidWlsZEV4Y2VwdGlvbihtZXNzYWdlLCBleHBlY3RlZCwgcG9zKSB7XG4gICAgICBmdW5jdGlvbiBjbGVhbnVwRXhwZWN0ZWQoZXhwZWN0ZWQpIHtcbiAgICAgICAgdmFyIGkgPSAxO1xuXG4gICAgICAgIGV4cGVjdGVkLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgIGlmIChhLmRlc2NyaXB0aW9uIDwgYi5kZXNjcmlwdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgIH0gZWxzZSBpZiAoYS5kZXNjcmlwdGlvbiA+IGIuZGVzY3JpcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHdoaWxlIChpIDwgZXhwZWN0ZWQubGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKGV4cGVjdGVkW2kgLSAxXSA9PT0gZXhwZWN0ZWRbaV0pIHtcbiAgICAgICAgICAgIGV4cGVjdGVkLnNwbGljZShpLCAxKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZE1lc3NhZ2UoZXhwZWN0ZWQsIGZvdW5kKSB7XG4gICAgICAgIGZ1bmN0aW9uIHN0cmluZ0VzY2FwZShzKSB7XG4gICAgICAgICAgZnVuY3Rpb24gaGV4KGNoKSB7IHJldHVybiBjaC5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpOyB9XG5cbiAgICAgICAgICByZXR1cm4gc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFwvZywgICAnXFxcXFxcXFwnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1wiL2csICAgICdcXFxcXCInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xceDA4L2csICdcXFxcYicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csICAgJ1xcXFx0JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXG4vZywgICAnXFxcXG4nKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcZi9nLCAgICdcXFxcZicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxyL2csICAgJ1xcXFxyJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx4MDAtXFx4MDdcXHgwQlxceDBFXFx4MEZdL2csIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHgwJyArIGhleChjaCk7IH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xceDEwLVxceDFGXFx4ODAtXFx4RkZdL2csICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHgnICArIGhleChjaCk7IH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcdTAxODAtXFx1MEZGRl0vZywgICAgICAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx1MCcgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHUxMDgwLVxcdUZGRkZdL2csICAgICAgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxcdScgICsgaGV4KGNoKTsgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZXhwZWN0ZWREZXNjcyA9IG5ldyBBcnJheShleHBlY3RlZC5sZW5ndGgpLFxuICAgICAgICAgICAgZXhwZWN0ZWREZXNjLCBmb3VuZERlc2MsIGk7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGV4cGVjdGVkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgZXhwZWN0ZWREZXNjc1tpXSA9IGV4cGVjdGVkW2ldLmRlc2NyaXB0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgZXhwZWN0ZWREZXNjID0gZXhwZWN0ZWQubGVuZ3RoID4gMVxuICAgICAgICAgID8gZXhwZWN0ZWREZXNjcy5zbGljZSgwLCAtMSkuam9pbihcIiwgXCIpXG4gICAgICAgICAgICAgICsgXCIgb3IgXCJcbiAgICAgICAgICAgICAgKyBleHBlY3RlZERlc2NzW2V4cGVjdGVkLmxlbmd0aCAtIDFdXG4gICAgICAgICAgOiBleHBlY3RlZERlc2NzWzBdO1xuXG4gICAgICAgIGZvdW5kRGVzYyA9IGZvdW5kID8gXCJcXFwiXCIgKyBzdHJpbmdFc2NhcGUoZm91bmQpICsgXCJcXFwiXCIgOiBcImVuZCBvZiBpbnB1dFwiO1xuXG4gICAgICAgIHJldHVybiBcIkV4cGVjdGVkIFwiICsgZXhwZWN0ZWREZXNjICsgXCIgYnV0IFwiICsgZm91bmREZXNjICsgXCIgZm91bmQuXCI7XG4gICAgICB9XG5cbiAgICAgIHZhciBwb3NEZXRhaWxzID0gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBvcyksXG4gICAgICAgICAgZm91bmQgICAgICA9IHBvcyA8IGlucHV0Lmxlbmd0aCA/IGlucHV0LmNoYXJBdChwb3MpIDogbnVsbDtcblxuICAgICAgaWYgKGV4cGVjdGVkICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFudXBFeHBlY3RlZChleHBlY3RlZCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuZXcgU3ludGF4RXJyb3IoXG4gICAgICAgIG1lc3NhZ2UgIT09IG51bGwgPyBtZXNzYWdlIDogYnVpbGRNZXNzYWdlKGV4cGVjdGVkLCBmb3VuZCksXG4gICAgICAgIGV4cGVjdGVkLFxuICAgICAgICBmb3VuZCxcbiAgICAgICAgcG9zLFxuICAgICAgICBwb3NEZXRhaWxzLmxpbmUsXG4gICAgICAgIHBvc0RldGFpbHMuY29sdW1uXG4gICAgICApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRkZWNvZGUocykge1xuICAgICAgdmFyIGJjID0gbmV3IEFycmF5KHMubGVuZ3RoKSwgaTtcblxuICAgICAgZm9yIChpID0gMDsgaSA8IHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYmNbaV0gPSBzLmNoYXJDb2RlQXQoaSkgLSAzMjtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGJjO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZVJ1bGUoaW5kZXgpIHtcbiAgICAgIHZhciBiYyAgICA9IHBlZyRieXRlY29kZVtpbmRleF0sXG4gICAgICAgICAgaXAgICAgPSAwLFxuICAgICAgICAgIGlwcyAgID0gW10sXG4gICAgICAgICAgZW5kICAgPSBiYy5sZW5ndGgsXG4gICAgICAgICAgZW5kcyAgPSBbXSxcbiAgICAgICAgICBzdGFjayA9IFtdLFxuICAgICAgICAgIHBhcmFtcywgaTtcblxuICAgICAgZnVuY3Rpb24gcHJvdGVjdChvYmplY3QpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuYXBwbHkob2JqZWN0KSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiID8gW10gOiBvYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIHdoaWxlIChpcCA8IGVuZCkge1xuICAgICAgICAgIHN3aXRjaCAoYmNbaXBdKSB7XG4gICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocHJvdGVjdChwZWckY29uc3RzW2JjW2lwICsgMV1dKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNDpcbiAgICAgICAgICAgICAgc3RhY2subGVuZ3RoIC09IGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDU6XG4gICAgICAgICAgICAgIHN0YWNrLnNwbGljZSgtMiwgMSk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDY6XG4gICAgICAgICAgICAgIHN0YWNrW3N0YWNrLmxlbmd0aCAtIDJdLnB1c2goc3RhY2sucG9wKCkpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA3OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHN0YWNrLnNwbGljZShzdGFjay5sZW5ndGggLSBiY1tpcCArIDFdLCBiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDg6XG4gICAgICAgICAgICAgIHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgICBzdGFjay5wdXNoKGlucHV0LnN1YnN0cmluZyhzdGFja1tzdGFjay5sZW5ndGggLSAxXSwgcGVnJGN1cnJQb3MpKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgOTpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0pIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMDpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMTpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMjpcbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgICAgaXBzLnB1c2goaXApO1xuXG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAyICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlwICs9IDIgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTM6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0Lmxlbmd0aCA+IHBlZyRjdXJyUG9zKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTQ6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGgpID09PSBwZWckY29uc3RzW2JjW2lwICsgMV1dKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTU6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGgpLnRvTG93ZXJDYXNlKCkgPT09IHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQ7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNjpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdKTtcblxuICAgICAgICAgICAgICBpZiAocGVnJGNvbnN0c1tiY1tpcCArIDFdXS50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTc6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2goaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCBiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE4OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyArPSBwZWckY29uc3RzW2JjW2lwICsgMV1dLmxlbmd0aDtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTk6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJEZBSUxFRCk7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHtcbiAgICAgICAgICAgICAgICBwZWckZmFpbChwZWckY29uc3RzW2JjW2lwICsgMV1dKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMDpcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMSAtIGJjW2lwICsgMV1dO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMTpcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gcGVnJGN1cnJQb3M7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIyOlxuICAgICAgICAgICAgICBwYXJhbXMgPSBiYy5zbGljZShpcCArIDQsIGlwICsgNCArIGJjW2lwICsgM10pO1xuICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYmNbaXAgKyAzXTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcGFyYW1zW2ldID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMSAtIHBhcmFtc1tpXV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBzdGFjay5zcGxpY2UoXG4gICAgICAgICAgICAgICAgc3RhY2subGVuZ3RoIC0gYmNbaXAgKyAyXSxcbiAgICAgICAgICAgICAgICBiY1tpcCArIDJdLFxuICAgICAgICAgICAgICAgIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0uYXBwbHkobnVsbCwgcGFyYW1zKVxuICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMzpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckcGFyc2VSdWxlKGJjW2lwICsgMV0pKTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjQ6XG4gICAgICAgICAgICAgIHBlZyRzaWxlbnRGYWlscysrO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyNTpcbiAgICAgICAgICAgICAgcGVnJHNpbGVudEZhaWxzLS07XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIG9wY29kZTogXCIgKyBiY1tpcF0gKyBcIi5cIik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVuZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGVuZCA9IGVuZHMucG9wKCk7XG4gICAgICAgICAgaXAgPSBpcHMucG9wKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN0YWNrWzBdO1xuICAgIH1cblxuXG4gICAgXHR2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuICAgIFx0XHROT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKSxcbiAgICBcdFx0TXVzdGFjaGUgPSByZXF1aXJlKFwiLi9cIik7XG5cbiAgICBcdG9wdGlvbnMgPSBfLmRlZmF1bHRzKG9wdGlvbnMgfHwge30sIHtcbiAgICBcdFx0c3RyaWN0OiB0cnVlXG4gICAgXHR9KTtcblxuXG4gICAgcGVnJHJlc3VsdCA9IHBlZyRwYXJzZVJ1bGUocGVnJHN0YXJ0UnVsZUluZGV4KTtcblxuICAgIGlmIChwZWckcmVzdWx0ICE9PSBwZWckRkFJTEVEICYmIHBlZyRjdXJyUG9zID09PSBpbnB1dC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBwZWckcmVzdWx0O1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAocGVnJHJlc3VsdCAhPT0gcGVnJEZBSUxFRCAmJiBwZWckY3VyclBvcyA8IGlucHV0Lmxlbmd0aCkge1xuICAgICAgICBwZWckZmFpbCh7IHR5cGU6IFwiZW5kXCIsIGRlc2NyaXB0aW9uOiBcImVuZCBvZiBpbnB1dFwiIH0pO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24obnVsbCwgcGVnJG1heEZhaWxFeHBlY3RlZCwgcGVnJG1heEZhaWxQb3MpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgU3ludGF4RXJyb3I6IFN5bnRheEVycm9yLFxuICAgIHBhcnNlOiAgICAgICBwYXJzZVxuICB9O1xufSkoKTsiLCJ2YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciB0cmFjayA9IHJlcXVpcmUoXCJ0cmFja3Itb2JqZWN0c1wiKTtcbnZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcbnZhciBwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlO1xuXG52YXIgTW9kZWwgPVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBNb2RlbChkYXRhLCBwYXJlbnQsIG9wdGlvbnMpIHtcblx0dGhpcy5wcm94aWVzID0gW107XG5cdHRoaXMuX2RlcCA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXHRpZiAoTW9kZWwuaXNNb2RlbChwYXJlbnQpKSB0aGlzLnBhcmVudCA9IHBhcmVudDtcblx0dGhpcy5zZXQoZGF0YSwgb3B0aW9ucyk7XG59XG5cbk1vZGVsLmlzTW9kZWwgPSBmdW5jdGlvbihvKSB7XG5cdHJldHVybiBvIGluc3RhbmNlb2YgTW9kZWw7XG59XG5cbk1vZGVsLmV4dGVuZCA9IHJlcXVpcmUoXCJiYWNrYm9uZS1leHRlbmQtc3RhbmRhbG9uZVwiKTtcblxuTW9kZWwuX2RlZmF1bHRQcm94aWVzID0gWyB7XG5cdGlzTGlzdDogIHRydWUsXG5cdG1hdGNoOiAgIGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gXy5pc0FycmF5KGFycik7IH0sXG5cdGdldDogICAgIGZ1bmN0aW9uKGFyciwgaykgeyByZXR1cm4gayA9PT0gXCJsZW5ndGhcIiA/IHRoaXMubGVuZ3RoKGFycikgOiBhcnJba107IH0sXG5cdGxlbmd0aDogIGZ1bmN0aW9uKGFycikgICAgeyB2YXIgbGVuOyByZXR1cm4gdHlwZW9mKGxlbiA9IGFyci4kbGVuZ3RoKSA9PT0gXCJudW1iZXJcIiA/IGxlbiA6IGFyci5sZW5ndGg7IH0sXG5cdGtleXM6ICAgIGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gXy5yYW5nZSh0aGlzLmxlbmd0aChhcnIpKTsgfSxcblx0aXNFbXB0eTogZnVuY3Rpb24oYXJyKSAgICB7IHJldHVybiAhIXRoaXMubGVuZ3RoKGFycik7IH1cbn0sIHtcblx0bWF0Y2g6IGZ1bmN0aW9uKCkgICAgIHsgcmV0dXJuIHRydWU7IH0sXG5cdGdldDogICBmdW5jdGlvbih0LCBrKSB7IGlmICh0ICE9IG51bGwpIHJldHVybiB0W2tdOyB9XG59IF07XG5cbk1vZGVsLmNhbGxQcm94eU1ldGhvZCA9IGZ1bmN0aW9uKHByb3h5LCB0YXJnZXQsIG1ldGhvZCwgYXJncywgY3R4KSB7XG5cdHZhciBhcmdzID0gXy5pc0FycmF5KGFyZ3MpID8gXy5jbG9uZShhcmdzKSA6IFtdO1xuXHRhcmdzLnVuc2hpZnQocHJveHksIG1ldGhvZCwgdGFyZ2V0KTtcblx0YXJncy5wdXNoKGN0eCk7XG5cdHJldHVybiB1dGlscy5yZXN1bHQuYXBwbHkobnVsbCwgYXJncyk7XG59XG5cbl8uZXh0ZW5kKE1vZGVsLnByb3RvdHlwZSwge1xuXG5cdC8vIHNldHMgdGhlIGRhdGEgb24gdGhlIG1vZGVsXG5cdHNldDogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdGlmIChvcHRpb25zICYmIG9wdGlvbnMudHJhY2sgIT09IGZhbHNlKSB7XG5cdFx0XHRkYXRhID0gdHJhY2soZGF0YSwgb3B0aW9ucy50cmFjayk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kYXRhID0gZGF0YTtcblx0XHR0aGlzLl9kZXAuY2hhbmdlZCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFwcGVuZDogZnVuY3Rpb24obW9kZWwsIG9wdGlvbnMpIHtcblx0XHRpZiAoTW9kZWwuaXNNb2RlbChtb2RlbCkpIG1vZGVsLnBhcmVudCA9IHRoaXM7XG5cdFx0ZWxzZSBtb2RlbCA9IG5ldyBNb2RlbChtb2RlbCwgdGhpcywgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9LFxuXG5cdC8vIGFuIGFycmF5IG9mIG1vZGVscyBpbiB0aGUgY3VycmVudCBzdGFjaywgd2l0aCB0aGUgcm9vdCBhcyB0aGUgZmlyc3Rcblx0Z2V0QWxsTW9kZWxzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbW9kZWxzID0gWyB0aGlzIF0sXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwucGFyZW50KSB7XG5cdFx0XHRtb2RlbHMudW5zaGlmdChtb2RlbCA9IG1vZGVsLnBhcmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsc1xuXHR9LFxuXG5cdC8vIGdldHMgdGhlIG1vZGVsIGluIHRoZSBzdGFjayBhdCB0aGUgaW5kZXhcblx0Ly8gbmVnYXRpdmUgdmFsdWVzIHN0YXJ0IGF0IHJvb3Rcblx0Z2V0TW9kZWxBdE9mZnNldDogZnVuY3Rpb24oaW5kZXgpIHtcblx0XHRpZiAoIV8uaXNOdW1iZXIoaW5kZXgpIHx8IGlzTmFOKGluZGV4KSkgaW5kZXggPSAwO1xuXHRcdGlmIChpbmRleCA8IDApIHJldHVybiB0aGlzLmdldEFsbE1vZGVscygpW35pbmRleF07XG5cblx0XHR2YXIgbW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKGluZGV4ICYmIG1vZGVsKSB7XG5cdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHRcdGluZGV4LS07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9LFxuXG5cdC8vIGdldHMgdGhlIGxhc3QgbW9kZWwgaW4gdGhlIHN0YWNrXG5cdGdldFJvb3RNb2RlbDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIG1vZGVsID0gdGhpcztcblx0XHR3aGlsZSAobW9kZWwucGFyZW50ICE9IG51bGwpIG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdHJldHVybiBtb2RlbDtcblx0fSxcblxuXHQvLyByZXR1cm5zIHRoZSBmaXJzdCBtb2RlbCB3aGljaCBwYXNzZXMgdGhlIGZ1bmN0aW9uXG5cdGZpbmRNb2RlbDogZnVuY3Rpb24oZm4pIHtcblx0XHR2YXIgaW5kZXggPSAwLFxuXHRcdFx0bW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKG1vZGVsICE9IG51bGwpIHtcblx0XHRcdGlmIChmbi5jYWxsKHRoaXMsIG1vZGVsLCBpbmRleCsrKSkgcmV0dXJuIG1vZGVsO1xuXHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIHJldHVybnMgdGhlIHZhbHVlIGF0IHBhdGgsIGJ1dCBvbmx5IGxvb2tzIGluIHRoZSBkYXRhIG9uIHRoaXMgbW9kZWxcblx0Z2V0TG9jYWw6IGZ1bmN0aW9uKHBhdGgsIGN0eCkge1xuXHRcdGlmICh0eXBlb2YgcGF0aCA9PT0gXCJzdHJpbmdcIikgcGF0aCA9IHBhcnNlKHBhdGgsIHsgc3RhcnRSdWxlOiBcInBhdGhcIiB9KTtcblx0XHRpZiAocGF0aCA9PSBudWxsKSBwYXRoID0geyBwYXJ0czogW10gfTtcblx0XHRpZiAoIV8uaXNPYmplY3QocGF0aCkpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgb3Igb2JqZWN0IGZvciBwYXRoLlwiKTtcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0dGhpcy5fZGVwLmRlcGVuZCgpO1xuXG5cdFx0cmV0dXJuIF8ucmVkdWNlKHBhdGgucGFydHMsIGZ1bmN0aW9uKHRhcmdldCwgcGFydCkge1xuXHRcdFx0dGFyZ2V0ID0gc2VsZi5fZ2V0KHRhcmdldCwgcGFydC5rZXkpO1xuXG5cdFx0XHRfLmVhY2gocGFydC5jaGlsZHJlbiwgZnVuY3Rpb24oaykge1xuXHRcdFx0XHRpZiAoXy5pc09iamVjdChrKSkgayA9IGN0eC5nZXQoayk7XG5cdFx0XHRcdHRhcmdldCA9IHNlbGYuX2dldCh0YXJnZXQsIGspO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0fSwgdGhpcy5kYXRhKTtcblx0fSxcblxuXHQvLyByZXRyaWV2ZXMgdmFsdWUgd2l0aCBwYXRoIHF1ZXJ5XG5cdGdldDogZnVuY3Rpb24ocGF0aHMpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRpZiAodHlwZW9mIHBhdGhzID09PSBcInN0cmluZ1wiKSBwYXRocyA9IHBhcnNlKHBhdGhzLCB7IHN0YXJ0UnVsZTogXCJwYXRoUXVlcnlcIiB9KTtcblx0XHRpZiAoIV8uaXNBcnJheShwYXRocykpIHBhdGhzID0gcGF0aHMgIT0gbnVsbCA/IFsgcGF0aHMgXSA6IFtdO1xuXHRcdGlmICghcGF0aHMubGVuZ3RoKSBwYXRocy5wdXNoKHsgdHlwZTogXCJhbGxcIiwgcGFydHM6IFtdIH0pO1xuXG5cdFx0cmV0dXJuIF8ucmVkdWNlKHBhdGhzLCBmdW5jdGlvbihyZXN1bHQsIHBhdGgsIGluZGV4KSB7XG5cdFx0XHR2YXIgbW9kZWwgPSBzZWxmLFxuXHRcdFx0XHRzY29wZSA9IHRydWUsXG5cdFx0XHRcdHZhbDtcblxuXHRcdFx0aWYgKHBhdGgudHlwZSA9PT0gXCJyb290XCIpIHtcblx0XHRcdFx0bW9kZWwgPSBzZWxmLmdldFJvb3RNb2RlbCgpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLnR5cGUgPT09IFwicGFyZW50XCIpIHtcblx0XHRcdFx0bW9kZWwgPSBzZWxmLmdldE1vZGVsQXRPZmZzZXQocGF0aC5kaXN0YW5jZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGgudHlwZSA9PT0gXCJhbGxcIikge1xuXHRcdFx0XHRzY29wZSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZWwgPT0gbnVsbCkgcmV0dXJuO1xuXG5cdFx0XHR3aGlsZSAoXy5pc1VuZGVmaW5lZCh2YWwpICYmIG1vZGVsICE9IG51bGwpIHtcblx0XHRcdFx0dmFsID0gbW9kZWwuZ2V0TG9jYWwocGF0aCwgc2VsZik7XG5cdFx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdFx0XHRpZiAoc2NvcGUpIGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHZhbCkpIHtcblx0XHRcdFx0dmFsID0gdmFsLmNhbGwoc2VsZiwgaW5kZXggPT09IDAgPyBudWxsIDogcmVzdWx0KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZhbDtcblx0XHR9LCB2b2lkIDApO1xuXHR9LFxuXG5cdF9nZXQ6IGZ1bmN0aW9uKHRhcmdldCwga2V5KSB7XG5cdFx0cmV0dXJuIHRoaXMuY2FsbFByb3h5TWV0aG9kKHRoaXMuZ2V0UHJveHlCeVZhbHVlKHRhcmdldCksIHRhcmdldCwgXCJnZXRcIiwga2V5KTtcblx0fSxcblxuXHRwcm94eTogZnVuY3Rpb24oa2V5KSB7XG5cdFx0dmFyIHByb3h5ID0gdGhpcy5nZXRQcm94eUJ5VmFsdWUodGhpcy5kYXRhKTtcblx0XHRpZiAoa2V5ID09IG51bGwpIHJldHVybiBwcm94eTtcblx0XHR2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuXHRcdGFyZ3MudW5zaGlmdChwcm94eSwgdGhpcy5kYXRhKTtcblx0XHRyZXR1cm4gdGhpcy5jYWxsUHJveHlNZXRob2QuYXBwbHkodGhpcywgYXJncyk7XG5cdH0sXG5cblx0Y2FsbFByb3h5TWV0aG9kOiBmdW5jdGlvbihwcm94eSwgdGFyZ2V0LCBtZXRob2QpIHtcblx0XHRyZXR1cm4gTW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB0YXJnZXQsIG1ldGhvZCwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKSwgdGhpcyk7XG5cdH0sXG5cblx0Z2V0QWxsUHJveGllczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHByb3hpZXMgPSBbXSxcblx0XHRcdG1vZGVsID0gdGhpcztcblxuXHRcdHdoaWxlIChtb2RlbCAhPSBudWxsKSB7XG5cdFx0XHRwcm94aWVzLnB1c2guYXBwbHkocHJveGllcywgbW9kZWwucHJveGllcyk7XG5cdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHR9XG5cblx0XHRwcm94aWVzLnB1c2guYXBwbHkocHJveGllcywgTW9kZWwuX2RlZmF1bHRQcm94aWVzKTtcblxuXHRcdHJldHVybiBwcm94aWVzO1xuXHR9LFxuXG5cdGhhc1Byb3h5OiBmdW5jdGlvbihwcm94eSwgcHJveGllcykge1xuXHRcdGlmIChwcm94aWVzID09IG51bGwpIHByb3hpZXMgPSB0aGlzLmdldEFsbFByb3hpZXMoKTtcblx0XHRyZXR1cm4gXy5jb250YWlucyhwcm94aWVzLCBwcm94eSk7XG5cdH0sXG5cblx0cmVnaXN0ZXJQcm94eTogZnVuY3Rpb24ocHJveHkpIHtcblx0XHRpZiAodHlwZW9mIHByb3h5ICE9PSBcIm9iamVjdFwiIHx8IHByb3h5ID09IG51bGwpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBvYmplY3QgZm9yIHByb3h5LlwiKTtcblx0XHRpZiAodHlwZW9mIHByb3h5Lm1hdGNoICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkxheWVyIG1pc3NpbmcgcmVxdWlyZWQgbWF0Y2ggbWV0aG9kLlwiKTtcblx0XHRpZiAodHlwZW9mIHByb3h5LmdldCAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJMYXllciBtaXNzaW5nIHJlcXVpcmVkIGdldCBtZXRob2QuXCIpO1xuXHRcdGlmICghdGhpcy5oYXNQcm94eShwcm94eSkpIHRoaXMucHJveGllcy51bnNoaWZ0KHByb3h5KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRnZXRQcm94eUJ5VmFsdWU6IGZ1bmN0aW9uKHRhcmdldCwgcHJveGllcykge1xuXHRcdGlmIChwcm94aWVzID09IG51bGwpIHByb3hpZXMgPSB0aGlzLmdldEFsbFByb3hpZXMoKTtcblx0XHRyZXR1cm4gXy5maW5kKHByb3hpZXMsIGZ1bmN0aW9uKHByb3h5KSB7XG5cdFx0XHRyZXR1cm4gcHJveHkubWF0Y2godGFyZ2V0KTtcblx0XHR9KTtcblx0fSxcblxuXHQvLyBkZWZpbmVzIGEgcmVhY3RpdmUgcHJvcGVydHkgb24gYW4gb2JqZWN0IHRoYXQgcG9pbnRzIHRvIHRoZSBkYXRhXG5cdGRlZmluZURhdGFMaW5rOiBmdW5jdGlvbihvYmosIHByb3AsIG9wdGlvbnMpIHtcblx0XHR2YXIgbW9kZWwgPSB0aGlzO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdFx0Y29uZmlndXJhYmxlOiBvcHRpb25zICE9IG51bGwgJiYgb3B0aW9ucy5jb25maWd1cmFibGUsXG5cdFx0XHRlbnVtZXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5lbnVtZXJhYmxlICE9PSBmYWxzZSxcblx0XHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdG1vZGVsLl9kZXAuZGVwZW5kKCk7XG5cdFx0XHRcdHJldHVybiBtb2RlbC5kYXRhO1xuXHRcdFx0fSxcblx0XHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRcdG1vZGVsLnNldCh2YWwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG9iajtcblx0fVxuXG59KTtcbiIsInZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciBOT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbnZhciBwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlO1xudmFyIHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XG52YXIgVmlldyA9IHJlcXVpcmUoXCIuL3ZpZXdcIik7XG52YXIgTW9kZWwgPSByZXF1aXJlKFwiLi9tb2RlbFwiKTtcbnZhciBTZWN0aW9uID0gcmVxdWlyZShcIi4vc2VjdGlvblwiKTtcbnZhciAkdHJhY2sgPSByZXF1aXJlKFwidHJhY2tyLW9iamVjdHNcIik7XG52YXIgaWRvbSA9IHJlcXVpcmUoJ2luY3JlbWVudGFsLWRvbScpO1xudmFyIERPTVJhbmdlID0gcmVxdWlyZShcIi4vZG9tcmFuZ2VcIik7XG5cbnZhciBNdXN0YWNoZSA9XG5tb2R1bGUuZXhwb3J0cyA9IFZpZXcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdC8vIGFkZCB0ZW1wbGF0ZVxuXHRcdHZhciB0ZW1wbGF0ZSA9IG9wdGlvbnMudGVtcGxhdGUgfHwgXy5yZXN1bHQodGhpcywgXCJ0ZW1wbGF0ZVwiKTtcblx0XHRpZiAodGVtcGxhdGUgIT0gbnVsbCkgdGhpcy5zZXRUZW1wbGF0ZSh0ZW1wbGF0ZSk7XG5cblx0XHQvLyBhZGQgZGVjb3JhdG9yc1xuXHRcdHRoaXMuZGVjb3JhdGUoXy5leHRlbmQoe30sIG9wdGlvbnMuZGVjb3JhdG9ycywgXy5yZXN1bHQodGhpcywgXCJkZWNvcmF0b3JzXCIpKSk7XG5cblx0XHQvLyBpbml0aWF0ZSBsaWtlIGEgbm9ybWFsIHZpZXdcblx0XHRWaWV3LmNhbGwodGhpcywgZGF0YSwgb3B0aW9ucyk7XG5cdH0sXG5cblx0Ly8gcGFyc2VzIGFuZCBzZXRzIHRoZSByb290IHRlbXBsYXRlXG5cdHNldFRlbXBsYXRlOiBmdW5jdGlvbih0ZW1wbGF0ZSkge1xuXHRcdGlmIChfLmlzU3RyaW5nKHRlbXBsYXRlKSkgdGVtcGxhdGUgPSBwYXJzZSh0ZW1wbGF0ZSk7XG5cblx0XHRpZiAoIV8uaXNPYmplY3QodGVtcGxhdGUpIHx8IHRlbXBsYXRlLnR5cGUgIT09IE5PREVfVFlQRS5ST09UKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBvciBwYXJzZWQgdGVtcGxhdGUuXCIpO1xuXG5cdFx0dGhpcy5fdGVtcGxhdGUgPSB0ZW1wbGF0ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBjcmVhdGVzIGEgZGVjb3JhdG9yXG5cdGRlY29yYXRlOiBmdW5jdGlvbihuYW1lLCBmbiwgb3B0aW9ucykge1xuXHRcdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJvYmplY3RcIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24oZm4sIG4pIHtcblx0XHRcdFx0aWYgKF8uaXNBcnJheShmbikpIHRoaXMuZGVjb3JhdGUobiwgZm5bMF0sIGZuWzFdKTtcblx0XHRcdFx0ZWxzZSB0aGlzLmRlY29yYXRlKG4sIGZuLCBvcHRpb25zKTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBuYW1lICE9PSBcInN0cmluZ1wiIHx8IG5hbWUgPT09IFwiXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBub24tZW1wdHkgc3RyaW5nIGZvciBkZWNvcmF0b3IgbmFtZS5cIik7XG5cdFx0aWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGRlY29yYXRvci5cIik7XG5cblx0XHRpZiAodGhpcy5fZGVjb3JhdG9ycyA9PSBudWxsKSB0aGlzLl9kZWNvcmF0b3JzID0ge307XG5cdFx0aWYgKHRoaXMuX2RlY29yYXRvcnNbbmFtZV0gPT0gbnVsbCkgdGhpcy5fZGVjb3JhdG9yc1tuYW1lXSA9IFtdO1xuXHRcdHZhciBkZWNvcmF0b3JzID0gdGhpcy5fZGVjb3JhdG9yc1tuYW1lXTtcblxuXHRcdGlmICghXy5maW5kV2hlcmUoZGVjb3JhdG9ycywgeyBjYWxsYmFjazogZm4gfSkpIHtcblx0XHRcdGRlY29yYXRvcnMucHVzaCh7XG5cdFx0XHRcdGNhbGxiYWNrOiBmbixcblx0XHRcdFx0b3B0aW9uczogb3B0aW9ucyB8fCB7fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gZmluZHMgYWxsIGRlY29yYXRvcnMsIGxvY2FsbHkgYW5kIGluIHBhcmVudFxuXHRmaW5kRGVjb3JhdG9yczogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBkZWNvcmF0b3JzID0gW10sXG5cdFx0XHRjID0gdGhpcztcblxuXG5cdFx0d2hpbGUgKGMgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGMuX2RlY29yYXRvcnMgIT0gbnVsbCAmJiBfLmlzQXJyYXkoYy5fZGVjb3JhdG9yc1tuYW1lXSkpIHtcblx0XHRcdFx0Yy5fZGVjb3JhdG9yc1tuYW1lXS5mb3JFYWNoKGZ1bmN0aW9uKGQpIHtcblx0XHRcdFx0XHRpZiAoIV8uZmluZFdoZXJlKGRlY29yYXRvcnMsIHsgY2FsbGJhY2s6IGQuY2FsbGJhY2sgfSkpIHtcblx0XHRcdFx0XHRcdGRlY29yYXRvcnMucHVzaChfLmV4dGVuZCh7IGNvbnRleHQ6IGMgfSwgZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGMgPSBjLnBhcmVudFJhbmdlO1xuXHRcdH1cblxuXHRcdHJldHVybiBkZWNvcmF0b3JzO1xuXHR9LFxuXG5cdC8vIHJlbW92ZXMgYSBkZWNvcmF0b3Jcblx0c3RvcERlY29yYXRpbmc6IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG5cdFx0aWYgKHR5cGVvZiBuYW1lID09PSBcImZ1bmN0aW9uXCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdFx0Zm4gPSBuYW1lO1xuXHRcdFx0bmFtZSA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2RlY29yYXRvcnMgPT0gbnVsbCB8fCAobmFtZSA9PSBudWxsICYmIGZuID09IG51bGwpKSB7XG5cdFx0XHR0aGlzLl9kZWNvcmF0b3JzID0ge307XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAoZm4gPT0gbnVsbCkge1xuXHRcdFx0ZGVsZXRlIHRoaXMuX2RlY29yYXRvcnNbbmFtZV07XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAobmFtZSA9PSBudWxsKSB7XG5cdFx0XHRfLmVhY2godGhpcy5fZGVjb3JhdG9ycywgZnVuY3Rpb24oZCwgbikge1xuXHRcdFx0XHR0aGlzLl9kZWNvcmF0b3JzW25dID0gXy5maWx0ZXIoZCwgZnVuY3Rpb24oX2QpIHtcblx0XHRcdFx0XHRyZXR1cm4gX2QuY2FsbGJhY2sgIT09IGZuO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sIHRoaXMpO1xuXHRcdH1cblxuXHRcdGVsc2Uge1xuXHRcdFx0dmFyIGQgPSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdO1xuXHRcdFx0dGhpcy5fZGVjb3JhdG9yc1tuYW1lXSA9IF8uZmlsdGVyKGQsIGZ1bmN0aW9uKF9kKSB7XG5cdFx0XHRcdHJldHVybiBfZC5jYWxsYmFjayAhPT0gZm47XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBzcGVjaWFsIHBhcnRpYWwgc2V0dGVyIHRoYXQgY29udmVydHMgc3RyaW5ncyBpbnRvIG11c3RhY2hlIFZpZXdzXG5cdHNldFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUsIHBhcnRpYWwpIHtcblx0XHRpZiAoXy5pc09iamVjdChuYW1lKSkgcmV0dXJuIFZpZXcucHJvdG90eXBlLnNldFBhcnRpYWwuY2FsbCh0aGlzLCBuYW1lKTtcblxuXHRcdGlmIChfLmlzU3RyaW5nKHBhcnRpYWwpKSBwYXJ0aWFsID0gcGFyc2UocGFydGlhbCk7XG5cdFx0aWYgKF8uaXNPYmplY3QocGFydGlhbCkgJiYgcGFydGlhbC50eXBlID09PSBOT0RFX1RZUEUuUk9PVCkgcGFydGlhbCA9IE11c3RhY2hlLmV4dGVuZCh7IHRlbXBsYXRlOiBwYXJ0aWFsIH0pO1xuXHRcdGlmIChwYXJ0aWFsICE9IG51bGwgJiYgIXV0aWxzLmlzU3ViQ2xhc3MoVmlldywgcGFydGlhbCkpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIHRlbXBsYXRlLCBwYXJzZWQgdGVtcGxhdGUsIFZpZXcgc3ViY2xhc3Mgb3IgZnVuY3Rpb24gZm9yIHBhcnRpYWwuXCIpO1xuXG5cdFx0cmV0dXJuIFZpZXcucHJvdG90eXBlLnNldFBhcnRpYWwuY2FsbCh0aGlzLCBuYW1lLCBwYXJ0aWFsKTtcblx0fSxcblxuXHQvLyB0aGUgbWFpbiByZW5kZXIgZnVuY3Rpb24gY2FsbGVkIGJ5IG1vdW50XG5cdHJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX3RlbXBsYXRlID09IG51bGwpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RlZCBhIHRlbXBsYXRlIHRvIGJlIHNldCBiZWZvcmUgcmVuZGVyaW5nLlwiKTtcblxuXHRcdHZhciB0b01vdW50O1xuXHRcdHRoaXMuc2V0TWVtYmVycyh0aGlzLnJlbmRlclRlbXBsYXRlKHRoaXMuX3RlbXBsYXRlLCBudWxsLCB0b01vdW50ID0gW10pKTtcblx0XHRfLmludm9rZSh0b01vdW50LCBcIm1vdW50XCIpO1xuXHR9LFxuXG5cdC8vIGNvbnZlcnRzIGEgdGVtcGxhdGUgaW50byBhbiBhcnJheSBvZiBlbGVtZW50cyBhbmQgRE9NUmFuZ2VzXG5cdHJlbmRlclRlbXBsYXRlOiBmdW5jdGlvbih0ZW1wbGF0ZSwgdmlldywgdG9Nb3VudCkge1xuXHRcdGlmICh2aWV3ID09IG51bGwpIHZpZXcgPSB0aGlzO1xuXHRcdGlmICh0b01vdW50ID09IG51bGwpIHRvTW91bnQgPSBbXTtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRpZiAoXy5pc0FycmF5KHRlbXBsYXRlKSkgcmV0dXJuIHRlbXBsYXRlLnJlZHVjZShmdW5jdGlvbihyLCB0KSB7XG5cdFx0XHR2YXIgYiA9IHNlbGYucmVuZGVyVGVtcGxhdGUodCwgdmlldywgdG9Nb3VudCk7XG5cdFx0XHRpZiAoXy5pc0FycmF5KGIpKSByLnB1c2guYXBwbHkociwgYik7XG5cdFx0XHRlbHNlIGlmIChiICE9IG51bGwpIHIucHVzaChiKTtcblx0XHRcdHJldHVybiByO1xuXHRcdH0sIFtdKTtcblxuXHRcdHN3aXRjaCh0ZW1wbGF0ZS50eXBlKSB7XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5ST09UOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJUZW1wbGF0ZSh0ZW1wbGF0ZS5jaGlsZHJlbiwgdmlldywgdG9Nb3VudCk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLkVMRU1FTlQ6XG5cdFx0XHRcdHZhciBwYXJ0ID0gdGhpcy5yZW5kZXJQYXJ0aWFsKHRlbXBsYXRlLm5hbWUsIHZpZXcpO1xuXHRcdFx0XHR2YXIgb2JqO1xuXG5cdFx0XHRcdGlmIChwYXJ0ICE9IG51bGwpIHtcblx0XHRcdFx0XHRwYXJ0LmFkZERhdGEob2JqID0gJHRyYWNrKHt9KSk7XG5cblx0XHRcdFx0XHR0ZW1wbGF0ZS5hdHRyaWJ1dGVzLmZvckVhY2goZnVuY3Rpb24oYXR0cikge1xuXHRcdFx0XHRcdFx0c2VsZi5hdXRvcnVuKGZ1bmN0aW9uKGMpIHtcblx0XHRcdFx0XHRcdFx0dmFyIHZhbCA9IHRoaXMucmVuZGVyQXJndW1lbnRzKGF0dHIuYXJndW1lbnRzLCB2aWV3KTtcblx0XHRcdFx0XHRcdFx0aWYgKHZhbC5sZW5ndGggPT09IDEpIHZhbCA9IHZhbFswXTtcblx0XHRcdFx0XHRcdFx0ZWxzZSBpZiAoIXZhbC5sZW5ndGgpIHZhbCA9IHZvaWQgMDtcblxuXHRcdFx0XHRcdFx0XHRpZiAoYy5maXJzdFJ1bikgb2JqLmRlZmluZVByb3BlcnR5KGF0dHIubmFtZSwgdmFsKTtcblx0XHRcdFx0XHRcdFx0ZWxzZSBvYmpbYXR0ci5uYW1lXSA9IHZhbDtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0dG9Nb3VudC5wdXNoKHBhcnQpO1xuXHRcdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0dmFyIGVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCh0ZW1wbGF0ZS5uYW1lKTtcblxuXHRcdFx0XHRcdHRlbXBsYXRlLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5yZW5kZXJEZWNvcmF0aW9ucyhlbCwgYXR0ciwgdmlldykpIHJldHVybjtcblxuXHRcdFx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0XHRlbC5zZXRBdHRyaWJ1dGUoYXR0ci5uYW1lLCB0aGlzLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcoYXR0ci5jaGlsZHJlbiwgdmlldykpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0XHR2YXIgY2hpbGRyZW4gPSB0aGlzLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB2aWV3LCB0b01vdW50KSxcblx0XHRcdFx0XHRcdGNoaWxkLCBpO1xuXG5cdFx0XHRcdFx0Zm9yIChpIGluIGNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRjaGlsZCA9IGNoaWxkcmVuW2ldO1xuXHRcdFx0XHRcdFx0aWYgKGNoaWxkIGluc3RhbmNlb2YgRE9NUmFuZ2UpIHtcblx0XHRcdFx0XHRcdFx0Y2hpbGQucGFyZW50UmFuZ2UgPSB2aWV3OyAvLyBmYWtlIHRoZSBwYXJlbnRcblx0XHRcdFx0XHRcdFx0Y2hpbGQuYXR0YWNoKGVsKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGVsLmFwcGVuZENoaWxkKGNoaWxkKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gZWw7XG5cdFx0XHRcdH1cblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVEVYVDpcblx0XHRcdFx0cmV0dXJuIGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKHV0aWxzLmRlY29kZUVudGl0aWVzKHRlbXBsYXRlLnZhbHVlKSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLkhUTUw6XG5cdFx0XHRcdHJldHVybiBuZXcgRE9NUmFuZ2UodXRpbHMucGFyc2VIVE1MKHRlbXBsYXRlLnZhbHVlKSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlhDT01NRU5UOlxuXHRcdFx0XHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlQ29tbWVudCh0ZW1wbGF0ZS52YWx1ZSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVEVSUE9MQVRPUjpcblx0XHRcdFx0dmFyIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblxuXHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0dmFyIHZhbCA9IHZpZXcuZ2V0KHRlbXBsYXRlLnZhbHVlKTtcblx0XHRcdFx0XHRub2RlLm5vZGVWYWx1ZSA9IHR5cGVvZiB2YWwgPT09IFwic3RyaW5nXCIgPyB2YWwgOiB2YWwgIT0gbnVsbCA/IHZhbC50b1N0cmluZygpIDogXCJcIjtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIG5vZGU7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRSSVBMRTpcblx0XHRcdFx0dmFyIHJhbmdlID0gbmV3IERPTVJhbmdlKCk7XG5cblx0XHRcdFx0dGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdHJhbmdlLnNldE1lbWJlcnModXRpbHMucGFyc2VIVE1MKHZpZXcuZ2V0KHRlbXBsYXRlLnZhbHVlKSkpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gcmFuZ2U7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVkVSVEVEOlxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuU0VDVElPTjpcblx0XHRcdFx0dmFyIHNlY3Rpb24gPSBuZXcgU2VjdGlvbih2aWV3Lm1vZGVsKVxuXHRcdFx0XHRcdC5pbnZlcnQodGVtcGxhdGUudHlwZSA9PT0gTk9ERV9UWVBFLklOVkVSVEVEKVxuXHRcdFx0XHRcdC5zZXRQYXRoKHRlbXBsYXRlLnZhbHVlKVxuXHRcdFx0XHRcdC5vblJvdyhmdW5jdGlvbigpIHtcblx0XHRcdFx0XHRcdHZhciBfdG9Nb3VudDtcblx0XHRcdFx0XHRcdHRoaXMuc2V0TWVtYmVycyhzZWxmLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB0aGlzLCBfdG9Nb3VudCA9IFtdKSk7XG5cdFx0XHRcdFx0XHRfLmludm9rZShfdG9Nb3VudCwgXCJtb3VudFwiKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHR0b01vdW50LnB1c2goc2VjdGlvbik7XG5cdFx0XHRcdHJldHVybiBzZWN0aW9uO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5QQVJUSUFMOlxuXHRcdFx0XHR2YXIgcGFydGlhbCA9IHRoaXMucmVuZGVyUGFydGlhbCh0ZW1wbGF0ZS52YWx1ZSwgdmlldyk7XG5cdFx0XHRcdGlmIChwYXJ0aWFsKSB0b01vdW50LnB1c2gocGFydGlhbCk7XG5cdFx0XHRcdHJldHVybiBwYXJ0aWFsO1xuXHRcdH1cblx0fSxcblxuXHQvLyBjb252ZXJ0cyBhIHRlbXBsYXRlIGludG8gYSBzdHJpbmdcblx0cmVuZGVyVGVtcGxhdGVBc1N0cmluZzogZnVuY3Rpb24odGVtcGxhdGUsIGN0eCkge1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgVmlldykgY3R4ID0gY3R4Lm1vZGVsO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmIChfLmlzQXJyYXkodGVtcGxhdGUpKSByZXR1cm4gdGVtcGxhdGUubWFwKGZ1bmN0aW9uKHQpIHtcblx0XHRcdHJldHVybiBzZWxmLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcodCwgY3R4KTtcblx0XHR9KS5maWx0ZXIoZnVuY3Rpb24oYikgeyByZXR1cm4gYiAhPSBudWxsOyB9KS5qb2luKFwiXCIpO1xuXG5cdFx0c3dpdGNoKHRlbXBsYXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgTk9ERV9UWVBFLlJPT1Q6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcodGVtcGxhdGUuY2hpbGRyZW4sIGN0eCk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlRFWFQ6XG5cdFx0XHRcdHJldHVybiB0ZW1wbGF0ZS52YWx1ZTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5URVJQT0xBVE9SOlxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVFJJUExFOlxuXHRcdFx0XHR2YXIgdmFsID0gY3R4LmdldCh0ZW1wbGF0ZS52YWx1ZSk7XG5cdFx0XHRcdHJldHVybiB2YWwgIT0gbnVsbCA/IHZhbC50b1N0cmluZygpIDogXCJcIjtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuU0VDVElPTjpcblx0XHRcdGNhc2UgTk9ERV9UWVBFLklOVkVSVEVEOlxuXHRcdFx0XHR2YXIgaW52ZXJ0ZWQsIG1vZGVsLCB2YWwsIGlzRW1wdHksIG1ha2VSb3csIHByb3h5LCBpc0xpc3Q7XG5cblx0XHRcdFx0aW52ZXJ0ZWQgPSB0ZW1wbGF0ZS50eXBlID09PSBOT0RFX1RZUEUuSU5WRVJURUQ7XG5cdFx0XHRcdHZhbCA9IGN0eC5nZXQodGVtcGxhdGUudmFsdWUpO1xuXHRcdFx0XHRtb2RlbCA9IG5ldyBNb2RlbCh2YWwsIGN0eCk7XG5cdFx0XHRcdHByb3h5ID0gbW9kZWwuZ2V0UHJveHlCeVZhbHVlKHZhbCk7XG5cdFx0XHRcdGlzTGlzdCA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImlzTGlzdFwiKTtcblx0XHRcdFx0aXNFbXB0eSA9IFNlY3Rpb24uaXNFbXB0eShtb2RlbCwgcHJveHkpO1xuXG5cdFx0XHRcdG1ha2VSb3cgPSBmdW5jdGlvbihpKSB7XG5cdFx0XHRcdFx0dmFyIHJvdywgZGF0YTtcblxuXHRcdFx0XHRcdGlmIChpID09IG51bGwpIHtcblx0XHRcdFx0XHRcdGRhdGEgPSBtb2RlbDtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0ZGF0YSA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImdldFwiLCBpKTtcblx0XHRcdFx0XHRcdGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgbmV3IE1vZGVsKHsgJGtleTogaSB9LCBjdHgpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gc2VsZi5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKHRlbXBsYXRlLmNoaWxkcmVuLCBkYXRhKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghKGlzRW1wdHkgXiBpbnZlcnRlZCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gaXNMaXN0ICYmICFpbnZlcnRlZCA/XG5cdFx0XHRcdFx0XHRtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJrZXlzXCIpLm1hcChtYWtlUm93KS5qb2luKFwiXCIpIDpcblx0XHRcdFx0XHRcdG1ha2VSb3coKTtcblx0XHRcdFx0fVxuXHRcdH1cblx0fSxcblxuXHQvLyBjb252ZXJ0cyBhbiBhcmd1bWVudCB0ZW1wbGF0ZSBpbnRvIGFuIGFycmF5IG9mIHZhbHVlc1xuXHRyZW5kZXJBcmd1bWVudHM6IGZ1bmN0aW9uKGFyZywgY3R4KSB7XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKF8uaXNBcnJheShhcmcpKSByZXR1cm4gYXJnLm1hcChmdW5jdGlvbihhKSB7XG5cdFx0XHRyZXR1cm4gc2VsZi5yZW5kZXJBcmd1bWVudHMoYSwgY3R4KTtcblx0XHR9KS5maWx0ZXIoZnVuY3Rpb24oYikgeyByZXR1cm4gYiAhPSBudWxsOyB9KTtcblxuXHRcdHN3aXRjaChhcmcudHlwZSkge1xuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5URVJQT0xBVE9SOlxuXHRcdFx0XHRyZXR1cm4gY3R4LmdldChhcmcudmFsdWUpO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5MSVRFUkFMOlxuXHRcdFx0XHRyZXR1cm4gYXJnLnZhbHVlO1xuXHRcdH1cblx0fSxcblxuXHQvLyByZW5kZXJzIGRlY29yYXRpb25zIG9uIGFuIGVsZW1lbnQgYnkgdGVtcGxhdGVcblx0cmVuZGVyRGVjb3JhdGlvbnM6IGZ1bmN0aW9uKGVsLCBhdHRyLCBjdHgpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHQvLyBsb29rIHVwIGRlY29yYXRvciBieSBuYW1lXG5cdFx0dmFyIGRlY29yYXRvcnMgPSB0aGlzLmZpbmREZWNvcmF0b3JzKGF0dHIubmFtZSk7XG5cdFx0aWYgKCFkZWNvcmF0b3JzLmxlbmd0aCkgcmV0dXJuO1xuXG5cdFx0Ly8gbm9ybWFsaXplIHRoZSBjb250ZXh0XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cblx0XHQvLyBhIHdyYXBwZXIgY29tcHV0YXRpb24gdG8gZXotY2xlYW4gdGhlIHJlc3Rcblx0XHRyZXR1cm4gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKF9jb21wKSB7XG5cdFx0XHRkZWNvcmF0b3JzLmZvckVhY2goZnVuY3Rpb24oZCkge1xuXHRcdFx0XHRpZiAoZC5vcHRpb25zICYmIGQub3B0aW9ucy5kZWZlcikgXy5kZWZlcihleGVjRGVjb3JhdG9yKTtcblx0XHRcdFx0ZWxzZSBleGVjRGVjb3JhdG9yKCk7XG5cblx0XHRcdFx0ZnVuY3Rpb24gZXhlY0RlY29yYXRvcigpIHtcblx0XHRcdFx0XHR2YXIgZGNvbXAgPSBzZWxmLmF1dG9ydW4oZnVuY3Rpb24oY29tcCkge1xuXHRcdFx0XHRcdFx0Ly8gYXNzZW1ibGUgdGhlIGFyZ3VtZW50cyFcblx0XHRcdFx0XHRcdHZhciBhcmdzID0gWyB7XG5cdFx0XHRcdFx0XHRcdHRhcmdldDogZWwsXG5cdFx0XHRcdFx0XHRcdG1vZGVsOiBjdHgsXG5cdFx0XHRcdFx0XHRcdHZpZXc6IHNlbGYsXG5cdFx0XHRcdFx0XHRcdHRlbXBsYXRlOiBhdHRyLFxuXHRcdFx0XHRcdFx0XHRjb21wOiBjb21wLFxuXHRcdFx0XHRcdFx0XHRvcHRpb25zOiBkLm9wdGlvbnNcblx0XHRcdFx0XHRcdH0gXTtcblxuXHRcdFx0XHRcdFx0Ly8gcmVuZGVyIGFyZ3VtZW50cyBiYXNlZCBvbiBvcHRpb25zXG5cdFx0XHRcdFx0XHRpZiAoZC5vcHRpb25zICYmIGQub3B0aW9ucy5wYXJzZSA9PT0gXCJzdHJpbmdcIikge1xuXHRcdFx0XHRcdFx0XHRhcmdzLnB1c2goc2VsZi5yZW5kZXJUZW1wbGF0ZUFzU3RyaW5nKGF0dHIuY2hpbGRyZW4sIGN0eCkpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmIChkLm9wdGlvbnMgPT0gbnVsbCB8fCBkLm9wdGlvbnMucGFyc2UgIT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRcdGFyZ3MgPSBhcmdzLmNvbmNhdChzZWxmLnJlbmRlckFyZ3VtZW50cyhhdHRyLmFyZ3VtZW50cywgY3R4KSk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdC8vIGV4ZWN1dGUgdGhlIGNhbGxiYWNrXG5cdFx0XHRcdFx0XHRkLmNhbGxiYWNrLmFwcGx5KGQuY29udGV4dCB8fCBzZWxmLCBhcmdzKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdC8vIGNsZWFuIHVwXG5cdFx0XHRcdFx0X2NvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0ZGNvbXAuc3RvcCgpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG59LCB7XG5cblx0cmVuZGVyOiBmdW5jdGlvbih0ZW1wbGF0ZSwgZGF0YSwgb3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBfLmV4dGVuZCh7fSwgb3B0aW9ucyB8fCB7fSwge1xuXHRcdFx0dGVtcGxhdGU6IHRlbXBsYXRlXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gbmV3IE11c3RhY2hlKGRhdGEgfHwgbnVsbCwgb3B0aW9ucyk7XG5cdH1cblxufSk7XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuXHRNdXN0YWNoZSA9IHJlcXVpcmUoXCIuLi9cIik7XG5cbi8vIHRoZSBwbHVnaW5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMuYWRkQWN0aW9uID0gYWRkQWN0aW9uO1xuXHR0aGlzLmFkZEFjdGlvbk9uY2UgPSBhZGRBY3Rpb25PbmNlO1xuXHR0aGlzLnJlbW92ZUFjdGlvbiA9IHJlbW92ZUFjdGlvbjtcblx0dGhpcy5maXJlQWN0aW9uID0gZmlyZUFjdGlvbjtcblx0dGhpcy5kZWNvcmF0ZShkZWNvcmF0b3JzKTtcblxuXHR2YXIgaW5pdEFjdGlvbnMgPSBfLnJlc3VsdCh0aGlzLCBcImFjdGlvbnNcIik7XG5cdGlmIChpbml0QWN0aW9ucyAhPSBudWxsKSB0aGlzLmFkZEFjdGlvbihpbml0QWN0aW9ucyk7XG59XG5cbi8vIGdlbmVyYXRlIGRlY29yYXRvcnNcbnZhciBldmVudE5hbWVzID0gW1xuXHQnbG9hZCcsICdzY3JvbGwnLFxuXHQnY2xpY2snLCAnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnbW91c2VlbnRlcicsICdtb3VzZWxlYXZlJyxcblx0J2tleWRvd24nLCAna2V5cHJlc3MnLCAna2V5dXAnLFxuXHQnYmx1cicsICdmb2N1cycsICdjaGFuZ2UnLCAnaW5wdXQnLCAnc3VibWl0JywgJ3Jlc2V0JywgXG5cdCdkcmFnJywgJ2RyYWdkcm9wJywgJ2RyYWdlbmQnLCAnZHJhZ2VudGVyJywgJ2RyYWdleGl0JywgJ2RyYWdsZWF2ZScsICdkcmFnb3ZlcicsICdkcmFnc3RhcnQnLCAnZHJvcCdcbl07XG5cbnZhciBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZTtcbnZhciBkZWNvcmF0b3JzID0ge307XG5cbmV2ZW50TmFtZXMuZm9yRWFjaChmdW5jdGlvbihldmVudCkge1xuXHRkZWNvcmF0b3JzW1wib24tXCIgKyBldmVudF0gPSBmdW5jdGlvbihkZWNvciwga2V5KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0YXJncywgbm9kZTtcblxuXHRcdGZ1bmN0aW9uIGxpc3RlbmVyKGUpIHtcblx0XHRcdC8vIGNyZWF0ZSBhIG5ldyBhY3Rpb24gb2JqZWN0XG5cdFx0XHR2YXIgYWN0aW9uID0gbmV3IEFjdGlvbihrZXkpO1xuXHRcdFx0YWN0aW9uLm9yaWdpbmFsID0gZTtcblx0XHRcdGFjdGlvbi50YXJnZXQgPSBhY3Rpb24ubm9kZSA9IG5vZGU7XG5cdFx0XHRhY3Rpb24uY29udGV4dCA9IGFjdGlvbi5tb2RlbCA9IGRlY29yLm1vZGVsO1xuXHRcdFx0YWN0aW9uLnZpZXcgPSBkZWNvci52aWV3O1xuXG5cdFx0XHQvLyBmaW5kIHRoZSBmaXJzdCBwYXJlbnQgd2l0aCB0aGUgZmlyZSBtZXRob2Rcblx0XHRcdHZhciBmaXJlT24gPSBzZWxmO1xuXHRcdFx0d2hpbGUgKHR5cGVvZiBmaXJlT24uZmlyZUFjdGlvbiAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdC8vIGlmIGl0IGhhcyBubyBwYXJlbnQsIHdlIGNhbid0IGRvIGFueXRoaW5nXG5cdFx0XHRcdGlmIChmaXJlT24ucGFyZW50UmFuZ2UgPT0gbnVsbCkgcmV0dXJuO1xuXHRcdFx0XHRmaXJlT24gPSBmaXJlT24ucGFyZW50UmFuZ2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGZpcmUgdGhlIGFjdGlvblxuXHRcdFx0ZmlyZU9uLmZpcmVBY3Rpb24uYXBwbHkoZmlyZU9uLCBbIGFjdGlvbiBdLmNvbmNhdChhcmdzKSk7XG5cdFx0fVxuXG5cdFx0bm9kZSA9IGRlY29yLnRhcmdldDtcblx0XHRhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cykuc2xpY2UoMik7XG5cdFx0bm9kZS5hZGRFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcik7XG5cblx0XHRkZWNvci5jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdG5vZGUucmVtb3ZlRXZlbnRMaXN0ZW5lcihldmVudCwgbGlzdGVuZXIpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuLy8gQWN0aW9uIENsYXNzXG5mdW5jdGlvbiBBY3Rpb24obmFtZSkge1xuXHR0aGlzLm5hbWUgPSBuYW1lO1xufVxuXG5NdXN0YWNoZS5BY3Rpb24gPSBBY3Rpb247XG5cbkFjdGlvbi5wcm90b3R5cGUuYnViYmxlcyA9IHRydWU7XG5cbkFjdGlvbi5wcm90b3R5cGUuc3RvcFByb3BhZ2F0aW9uID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMuYnViYmxlcyA9IGZhbHNlO1xuXHRyZXR1cm4gdGhpcztcbn1cblxuLy8gTXN1dGFjaGUgSW5zdGFuY2UgTWV0aG9kc1xuZnVuY3Rpb24gYWRkQWN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJvYmplY3RcIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKGZuLCBuKSB7IHRoaXMuYWRkQWN0aW9uKG4sIGZuKTsgfSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIgfHwgbmFtZSA9PT0gXCJcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZm9yIGFjdGlvbiBuYW1lLlwiKTtcblx0aWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIGFjdGlvbi5cIik7XG5cblx0aWYgKHRoaXMuX2FjdGlvbnMgPT0gbnVsbCkgdGhpcy5fYWN0aW9ucyA9IHt9O1xuXHRpZiAodGhpcy5fYWN0aW9uc1tuYW1lXSA9PSBudWxsKSB0aGlzLl9hY3Rpb25zW25hbWVdID0gW107XG5cdGlmICghfnRoaXMuX2FjdGlvbnNbbmFtZV0uaW5kZXhPZihmbikpIHRoaXMuX2FjdGlvbnNbbmFtZV0ucHVzaChmbik7XG5cdFxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gYWRkQWN0aW9uT25jZShuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgPT09IFwib2JqZWN0XCIgJiYgZm4gPT0gbnVsbCkge1xuXHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihmbiwgbikgeyB0aGlzLmFkZEFjdGlvbk9uY2UobiwgZm4pOyB9LCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHZhciBvbkFjdGlvbjtcblxuXHR0aGlzLmFkZEFjdGlvbihuYW1lLCBvbkFjdGlvbiA9IGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnJlbW92ZUFjdGlvbihuYW1lLCBvbkFjdGlvbik7XG5cdFx0Zm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fSk7XG5cblx0cmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUFjdGlvbihuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgPT09IFwiZnVuY3Rpb25cIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0Zm4gPSBuYW1lO1xuXHRcdG5hbWUgPSBudWxsO1xuXHR9XG5cblx0aWYgKHRoaXMuX2FjdGlvbnMgPT0gbnVsbCB8fCAobmFtZSA9PSBudWxsICYmIGZuID09IG51bGwpKSB7XG5cdFx0dGhpcy5fYWN0aW9ucyA9IHt9O1xuXHR9XG5cblx0ZWxzZSBpZiAoZm4gPT0gbnVsbCkge1xuXHRcdGRlbGV0ZSB0aGlzLl9hY3Rpb25zW25hbWVdO1xuXHR9XG5cblx0ZWxzZSBpZiAobmFtZSA9PSBudWxsKSB7XG5cdFx0Xy5lYWNoKHRoaXMuX2FjdGlvbnMsIGZ1bmN0aW9uKGQsIG4pIHtcblx0XHRcdHRoaXMuX2FjdGlvbnNbbl0gPSBkLmZpbHRlcihmdW5jdGlvbihmKSB7IHJldHVybiBmICE9PSBmbjsgfSk7XG5cdFx0fSwgdGhpcyk7XG5cdH1cblxuXHRlbHNlIGlmICh0aGlzLl9hY3Rpb25zW25hbWVdICE9IG51bGwpIHtcblx0XHR0aGlzLl9hY3Rpb25zW25hbWVdID0gXy53aXRob3V0KHRoaXMuX2FjdGlvbnNbbmFtZV0sIGZuKTtcblx0fVxuXG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiBmaXJlQWN0aW9uKGFjdGlvbikge1xuXHRpZiAodHlwZW9mIGFjdGlvbiA9PT0gXCJzdHJpbmdcIikgYWN0aW9uID0gbmV3IEFjdGlvbihhY3Rpb24pO1xuXHRpZiAoXy5pc09iamVjdChhY3Rpb24pICYmICEoYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSkgYWN0aW9uID0gXy5leHRlbmQobmV3IEFjdGlvbiwgYWN0aW9uKTtcblx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgQWN0aW9uKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGFjdGlvbiBuYW1lLCBvYmplY3Qgb3IgaW5zdGFuY2Ugb2YgQWN0aW9uLlwiKTtcblx0XG5cdHZhciBuYW1lID0gYWN0aW9uLm5hbWUsXG5cdFx0YXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcblxuXHRhcmdzLnVuc2hpZnQoYWN0aW9uKTtcblxuXHRpZiAodGhpcy5fYWN0aW9ucyAhPSBudWxsICYmIEFycmF5LmlzQXJyYXkodGhpcy5fYWN0aW9uc1tuYW1lXSkpIHtcblx0XHR0aGlzLl9hY3Rpb25zW25hbWVdLnNvbWUoZnVuY3Rpb24oZm4pIHtcblx0XHRcdGlmICghYWN0aW9uLmJ1YmJsZXMpIHJldHVybiB0cnVlO1xuXHRcdFx0Zm4uYXBwbHkodGhpcywgYXJncyk7XG5cdFx0fSwgdGhpcyk7XG5cdH1cblxuXHRpZiAoYWN0aW9uLmJ1YmJsZXMgJiYgdGhpcy5wYXJlbnRSYW5nZSAhPSBudWxsKSB7XG5cdFx0Ly8gZmluZCB0aGUgZmlyc3QgcGFyZW50IHdpdGggdGhlIGZpcmUgbWV0aG9kXG5cdFx0dmFyIGZpcmVPbiA9IHRoaXMucGFyZW50UmFuZ2U7XG5cdFx0d2hpbGUgKHR5cGVvZiBmaXJlT24uZmlyZUFjdGlvbiAhPT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHQvLyBpZiBpdCBoYXMgbm8gcGFyZW50LCB3ZSBjYW4ndCBkbyBhbnl0aGluZ1xuXHRcdFx0aWYgKGZpcmVPbi5wYXJlbnRSYW5nZSA9PSBudWxsKSByZXR1cm47XG5cdFx0XHRmaXJlT24gPSBmaXJlT24ucGFyZW50UmFuZ2U7XG5cdFx0fVxuXG5cdFx0ZmlyZU9uLmZpcmVBY3Rpb24uYXBwbHkoZmlyZU9uLCBhcmdzKTtcblx0fVxuXHRcblx0cmV0dXJuIHRoaXM7XG59IiwidmFyIE11c3RhY2hlID0gcmVxdWlyZShcIi4uL1wiKTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcblx0dGhpcy5hZG9wdCA9IGFkb3B0O1xuXHR0aGlzLmRpc293biA9IGRpc293bjtcbn1cblxuZnVuY3Rpb24gYWRvcHQodmlldywgcGFyZW50LCBiZWZvcmUpIHtcblx0aWYgKCEodmlldyBpbnN0YW5jZW9mIE11c3RhY2hlLlZpZXcpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGluc3RhbmNlb2YgVGVtcGxlIFZpZXcuXCIpO1xuXHR9XG5cblx0aWYgKHRoaXMuX2Fkb3B0ZWQgPT0gbnVsbCkgdGhpcy5fYWRvcHRlZCA9IFtdO1xuXG5cdC8vIG1ha2Ugc3VyZSBpdCBpcyBhbiBpbmRlcGVuZGVudFxuXHR2aWV3LmRldGFjaCgpO1xuXG5cdC8vIGhvb2sgbmF2YmFyIGRhdGEgdXAgdG8gdGhpcyBkYXRhXG5cdHZpZXcuZ2V0Um9vdE1vZGVsKCkucGFyZW50ID0gdGhpcy5tb2RlbDtcblxuXHQvLyByZW5kZXIgd2hlbiBub3QgaW4gbG9hZGluZyBtb2RlXG5cdHZhciBvblJlbmRlcjtcblx0dGhpcy5vbihcInJlbmRlclwiLCBvblJlbmRlciA9IGZ1bmN0aW9uKGEsIGNvbXApIHtcblx0XHRpZiAoY29tcC5maXJzdFJ1bikgdmlldy5wYWludChwYXJlbnQsIGJlZm9yZSk7XG5cdFx0Y29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRpZiAoY29tcC5zdG9wcGVkKSB2aWV3LmRldGFjaCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0aGlzLl9hZG9wdGVkLnB1c2goe1xuXHRcdHJlbmRlcjogb25SZW5kZXIsXG5cdFx0dmlldzogdmlld1xuXHR9KTtcblxuXHRyZXR1cm4gdmlldztcbn1cblxuZnVuY3Rpb24gZGlzb3duKHZpZXcpIHtcblx0aWYgKHRoaXMuX2Fkb3B0ZWQgPT0gbnVsbCkgcmV0dXJuO1xuXG5cdHZhciBpbmRleDtcblx0aWYgKHRoaXMuX2Fkb3B0ZWQuc29tZShmdW5jdGlvbihhLCBpKSB7XG5cdFx0aWYgKGEudmlldyA9PT0gdmlldykge1xuXHRcdFx0aW5kZXggPSBpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHR9KSkgcmV0dXJuO1xuXG5cdHRoaXMub2ZmKFwicmVuZGVyXCIsIHRoaXMuX2Fkb3B0ZWRbaV0ucmVuZGVyKTtcblx0dGhpcy5fYWRvcHRlZC5zcGxpY2UoaW5kZXgsIDEpO1xuXG5cdHJldHVybiB2aWV3O1xufVxuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcblxudmFyIHBsdWdpbnMgPVxuZXhwb3J0cy5fcGx1Z2lucyA9IHt9O1xuXG5leHBvcnRzLmxvYWRQbHVnaW4gPSBmdW5jdGlvbih0cGwsIHBsdWdpbiwgYXJncykge1xuXHRpZiAoXy5pc1N0cmluZyhwbHVnaW4pKSB7XG5cdFx0aWYgKHBsdWdpbnNbcGx1Z2luXSA9PSBudWxsKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiTm8gcGx1Z2luIGV4aXN0cyB3aXRoIGlkICdcIiArIHBsdWdpbiArIFwiJy5cIik7XG5cblx0XHRwbHVnaW4gPSBwbHVnaW5zW3BsdWdpbl07XG5cdH1cblxuXHRpZiAoIV8uaXNGdW5jdGlvbihwbHVnaW4pKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgb3IgZnVuY3Rpb24gZm9yIHBsdWdpblwiKTtcblxuXHQvLyBjaGVjayBpZiBwbHVnaW4gaXMgYWxyZWFkeSBsb2FkZWQgb24gdGhpcyB0ZW1wbGF0ZVxuXHRpZiAodHBsLl9sb2FkZWRfcGx1Z2lucyA9PSBudWxsKSB0cGwuX2xvYWRlZF9wbHVnaW5zID0gW107XG5cdGlmICh+dHBsLl9sb2FkZWRfcGx1Z2lucy5pbmRleE9mKHBsdWdpbikpIHJldHVybiB0cGw7XG5cdHRwbC5fbG9hZGVkX3BsdWdpbnMucHVzaChwbHVnaW4pO1xuXG5cdGlmIChhcmdzID09IG51bGwpIGFyZ3MgPSBbXTtcblx0aWYgKCFfLmlzQXJyYXkoYXJncykpIGFyZ3MgPSBbIGFyZ3MgXTtcblxuXHRwbHVnaW4uYXBwbHkodHBsLCBhcmdzKTtcblx0cmV0dXJuIHRwbDtcbn1cblxudmFyIHJlZ2lzdGVyUGx1Z2luID1cbmV4cG9ydHMucmVnaXN0ZXJQbHVnaW4gPSBmdW5jdGlvbihuYW1lLCBmbikge1xuXHRpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG5hbWUgZm9yIHBsdWdpbi5cIik7XG5cdH1cblxuXHRpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIHBsdWdpbi5cIik7XG5cdH1cblxuXHRpZiAoZm4gPT09IHBsdWdpbnNbbmFtZV0pIHJldHVybjtcblx0aWYgKHBsdWdpbnNbbmFtZV0gIT0gbnVsbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIlJlZnVzaW5nIHRvIG92ZXJ3cml0ZSBleGlzdGluZyBwbHVnaW4gXFxcIm5hbWVcXFwiLlwiKTtcblx0fVxuXG5cdHBsdWdpbnNbbmFtZV0gPSBmbjtcbn1cblxuLy8gbG9hZCBidWlsdCBpbiBwbHVnaW5zXG5yZWdpc3RlclBsdWdpbihcImFjdGlvbnNcIiwgcmVxdWlyZShcIi4vYWN0aW9uc1wiKSk7XG5yZWdpc3RlclBsdWdpbihcInR3b3dheVwiLCByZXF1aXJlKFwiLi90d293YXlcIikpO1xucmVnaXN0ZXJQbHVnaW4oXCJhZG9wdGlvblwiLCByZXF1aXJlKFwiLi9hZG9wdGlvblwiKSk7XG5yZWdpc3RlclBsdWdpbihcInJlZnNcIiwgcmVxdWlyZShcIi4vcmVmc1wiKSk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLnJlZnMgPSB7fTtcblx0dGhpcy5kZWNvcmF0ZShcInJlZlwiLCByZWYpO1xuXHR0aGlzLmZpbmRCeVJlZiA9IGZpbmRCeVJlZjtcbn1cblxuZnVuY3Rpb24gcmVmKGQsIGtleSkge1xuXHQvLyBkb24ndCBvdmVyd3JpdGVcblx0aWYgKHRoaXMucmVmc1trZXldICE9IG51bGwpIHtcblx0XHRjb25zb2xlLndhcm4oXCJNdWx0aXBsZSBlbGVtZW50cyB3aXRoIHJlZmVyZW5jZSAnJXMnLlwiLCBrZXkpO1xuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIHNldCB0aGUgcmVmZXJlbmNlXG5cdHRoaXMucmVmc1trZXldID0gZC50YXJnZXQ7XG5cblx0Ly8gcmVtb3ZlIHRoZSByZWZlcmVuY2Ugd2hlbiB0aGUgZWxlbWVudCBkaXNhcHBlYXJzXG5cdGQuY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0ZGVsZXRlIHRoaXMucmVmc1trZXldO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZmluZEJ5UmVmKGtleSkge1xuXHR2YXIgdHBsID0gdGhpcztcblxuXHR3aGlsZSAodHBsICE9IG51bGwpIHtcblx0XHRpZiAodHBsLnJlZnMgJiYgdHBsLnJlZnNba2V5XSkgcmV0dXJuIHRwbC5yZWZzW2tleV07XG5cdFx0dHBsID0gdHBsLnBhcmVudFJhbmdlO1xuXHR9XG5cblx0cmV0dXJuIG51bGw7XG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG52YXIgaW5wdXRfdHlwZXMgPSBbIFwidGV4dFwiLCBcIm51bWJlclwiLCBcImRhdGVcIiBdO1xudmFyIHZhbHVlX3R5cGVzID0gWyBcInJhZGlvXCIsIFwib3B0aW9uXCIgXTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvcHRpb25zKSB7XG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdC8vIGFkZCBtZXRob2RzXG5cdHRoaXMuYWRkRm9ybUJpbmRpbmcgPSBhZGRGb3JtQmluZGluZztcblx0dGhpcy5nZXRGb3JtQmluZGluZyA9IGdldEZvcm1CaW5kaW5nO1xuXHR0aGlzLnJlbW92ZUZvcm1CaW5kaW5nID0gcmVtb3ZlRm9ybUJpbmRpbmc7XG5cblx0Ly8gYWRkIG1haW4gYmluZGluZyBkZWNvcmF0b3Jcblx0dGhpcy5kZWNvcmF0ZShcImJpbmQtdG9cIiwgZnVuY3Rpb24gYmluZFRvKGQsIGlkLCBsYXp5KSB7XG5cdFx0dmFyIGZiaW5kID0gdGhpcy5nZXRGb3JtQmluZGluZyhpZCk7XG5cdFx0aWYgKGZiaW5kID09IG51bGwpIHJldHVybjtcblxuXHRcdHZhciBlbCA9IGQudGFyZ2V0LFxuXHRcdFx0dHlwZSA9IGdldFR5cGUoZWwpLFxuXHRcdFx0c2VsZiA9IHRoaXMsXG5cdFx0XHRldnROYW1lLCBvbkNoYW5nZSwgbGF6eTtcblxuXHRcdC8vIGRldGVjdCBjaGFuZ2VzIHRvIHRoZSBpbnB1dCdzIHZhbHVlXG5cdFx0aWYgKHR5cGVvZiBmYmluZC5jaGFuZ2UgPT09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0b25DaGFuZ2UgPSBmdW5jdGlvbihlKSB7XG5cdFx0XHRcdGZiaW5kLmNoYW5nZS5jYWxsKHNlbGYsIGdldE5vZGVWYWx1ZShlbCwgdHlwZSksIGQubW9kZWwsIGUpO1xuXHRcdFx0fTtcblxuXHRcdFx0ZXZ0TmFtZSA9IF8uY29udGFpbnMoaW5wdXRfdHlwZXMsIHR5cGUpID8gXCJpbnB1dFwiIDogXCJjaGFuZ2VcIjtcblx0XHRcdGVsLmFkZEV2ZW50TGlzdGVuZXIoZXZ0TmFtZSwgb25DaGFuZ2UpO1xuXHRcdFx0aWYgKCEob3B0aW9ucy5sYXp5IHx8IGxhenkpKSBlbC5hZGRFdmVudExpc3RlbmVyKFwia2V5dXBcIiwgb25DaGFuZ2UpO1xuXG5cdFx0XHRkLmNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2dE5hbWUsIG9uQ2hhbmdlKTtcblx0XHRcdFx0ZWwucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleXVwXCIsIG9uQ2hhbmdlKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIHJlYWN0aXZlbHkgc2V0IHRoZSB2YWx1ZSBvbiB0aGUgaW5wdXRcblx0XHR2YXIgYyA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdHNldE5vZGVWYWx1ZShlbCwgZmJpbmQuZ2V0LmNhbGwoc2VsZiwgZC5tb2RlbCksIHR5cGUpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gc2V0Tm9kZVZhbHVlIHJlbGllcyBvbiB0aGUgY2hpbGRyZW4gZWxlbWVudHNcblx0XHQvLyB0aG9zZSB3b24ndCBiZSBpbiB0aGUgRE9NIHRpbGwgYXQgbGVhc3QgdGhlIG5leHQgdGlja1xuXHRcdGMuaW52YWxpZGF0ZSgpO1xuXHR9KTtcblxuXHQvLyBhZGQgdmFsdWUgZGVjb3JhdG9yIGZvciByYWRpb3MgYW5kIG9wdGlvbnNcblx0dGhpcy5kZWNvcmF0ZShcInZhbHVlXCIsIGZ1bmN0aW9uIHZhbHVlT2YoZCwgc3RydmFsKSB7XG5cdFx0dmFyIGVsID0gZC50YXJnZXQsXG5cdFx0XHR0eXBlID0gZ2V0VHlwZShlbCksXG5cdFx0XHRzZWxmID0gdGhpcztcblx0XHRcblx0XHRpZiAoIV8uY29udGFpbnModmFsdWVfdHlwZXMsIHR5cGUpKSB7XG5cdFx0XHRlbC52YWx1ZSA9IHN0cnZhbDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2YXIgYXJncyA9IHRoaXMucmVuZGVyQXJndW1lbnRzKGQudGVtcGxhdGUuYXJndW1lbnRzLCBkLm1vZGVsKTtcblx0XHRlbC4kYm91bmRfdmFsdWUgPSBhcmdzLmxlbmd0aCA8PSAxID8gYXJnc1swXSA6IGFyZ3M7XG5cdFx0ZWwudmFsdWUgPSBzdHJ2YWw7XG5cdH0sIHsgcGFyc2U6IFwic3RyaW5nXCIgfSk7XG5cblx0Ly8gYWRkIGluaXRpYWwgZm9ybSBiaW5kaW5nc1xuXHR2YXIgaW5pdGlhbEJpbmRzID0gXy5yZXN1bHQodGhpcywgXCJ0d293YXlcIik7XG5cdGlmIChfLmlzT2JqZWN0KGluaXRpYWxCaW5kcykpIHRoaXMuYWRkRm9ybUJpbmRpbmcoaW5pdGlhbEJpbmRzKTtcbn1cblxuZnVuY3Rpb24gYWRkRm9ybUJpbmRpbmcoaWQsIGdldHRlciwgb25DaGFuZ2UpIHtcblx0aWYgKF8uaXNPYmplY3QoaWQpKSB7XG5cdFx0Xy5lYWNoKGlkLCBmdW5jdGlvbih2LCBrKSB7XG5cdFx0XHRhZGRGb3JtQmluZGluZy5jYWxsKHRoaXMsIGssIHYpO1xuXHRcdH0sIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBpZCAhPT0gXCJzdHJpbmdcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGEgc3RyaW5nIGZvciB0aGUgZm9ybSBiaW5kaW5nIElELlwiKTtcblx0aWYgKHRoaXMuX2Zvcm1CaW5kaW5ncyA9PSBudWxsKSB0aGlzLl9mb3JtQmluZGluZ3MgPSB7fTtcblx0aWYgKHRoaXMuX2Zvcm1CaW5kaW5nc1tpZF0gIT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKFwiQSBmb3JtIGJpbmRpbmcgd2l0aCBpZCAnXCIgKyBpZCArIFwiJyBhbHJlYWR5IGV4aXN0cy5cIik7XG5cblx0aWYgKF8uaXNPYmplY3QoZ2V0dGVyKSAmJiBvbkNoYW5nZSA9PSBudWxsKSB7XG5cdFx0b25DaGFuZ2UgPSBnZXR0ZXIuY2hhbmdlO1xuXHRcdGdldHRlciA9IGdldHRlci5nZXQ7XG5cdH1cblxuXHRpZiAodHlwZW9mIGdldHRlciAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSBmdW5jdGlvbiBvciBvYmplY3QgZm9yIHRoZSBmb3JtIGJpbmRpbmcgZ2V0dGVyLlwiKTtcblx0aWYgKHR5cGVvZiBvbkNoYW5nZSAhPT0gXCJmdW5jdGlvblwiKSBvbkNoYW5nZSA9IG51bGw7XG5cblx0dGhpcy5fZm9ybUJpbmRpbmdzW2lkXSA9IHtcblx0XHRnZXQ6IGdldHRlcixcblx0XHRjaGFuZ2U6IG9uQ2hhbmdlXG5cdH07XG5cblx0cmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGdldEZvcm1CaW5kaW5nKGlkKSB7XG5cdGlmICh0eXBlb2YgaWQgIT09IFwic3RyaW5nXCIpIHJldHVybjtcblx0dmFyIGMgPSB0aGlzLCBiaW5kaW5ncztcblxuXHR3aGlsZSAoYyAhPSBudWxsKSB7XG5cdFx0YmluZGluZ3MgPSBjLl9mb3JtQmluZGluZ3M7XG5cdFx0aWYgKGJpbmRpbmdzICE9IG51bGwgJiYgYmluZGluZ3NbaWRdICE9IG51bGwpIHJldHVybiBiaW5kaW5nc1tpZF07XG5cdFx0YyA9IGMucGFyZW50UmFuZ2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVtb3ZlRm9ybUJpbmRpbmcoaWQpIHtcblx0dmFyIGV4aXN0cyA9IHRoaXMuX2Zvcm1CaW5kaW5nc1tpZF0gIT0gbnVsbDtcblx0ZGVsZXRlIHRoaXMuX2Zvcm1CaW5kaW5nc1tpZF07XG5cdHJldHVybiBleGlzdHM7XG59XG5cbnZhciB0eXBlX21hcCA9IHtcblx0XCJ0ZXh0XCI6IFsgXCJ0ZXh0XCIsIFwiY29sb3JcIiwgXCJlbWFpbFwiLCBcInBhc3N3b3JkXCIsIFwic2VhcmNoXCIsIFwidGVsXCIsIFwidXJsXCIsIFwiaGlkZGVuXCIgXSxcblx0XCJudW1iZXJcIjogWyBcIm51bWJlclwiLCBcInJhbmdlXCIgXSxcblx0XCJkYXRlXCI6IFsgXCJkYXRlXCIsIFwiZGF0ZXRpbWVcIiwgXCJkYXRldGltZS1sb2NhbFwiLCBcIm1vbnRoXCIsIFwidGltZVwiLCBcIndlZWtcIiBdLFxuXHRcImZpbGVcIjogWyBcImZpbGVcIiBdLFxuXHRcImNoZWNrYm94XCI6IFsgXCJjaGVja2JveFwiIF0sXG5cdFwicmFkaW9cIjogWyBcInJhZGlvXCIgXVxufVxuXG5mdW5jdGlvbiBnZXRUeXBlKGVsKSB7XG5cdHN3aXRjaCAoZWwudGFnTmFtZS50b0xvd2VyQ2FzZSgpKSB7XG5cdFx0Y2FzZSBcImlucHV0XCI6XG5cdFx0XHRmb3IgKHZhciB0eXBlIGluIHR5cGVfbWFwKSB7XG5cdFx0XHRcdGlmIChfLmNvbnRhaW5zKHR5cGVfbWFwW3R5cGVdLCBlbC50eXBlKSkgcmV0dXJuIHR5cGU7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJzZWxlY3RcIjpcblx0XHRcdHJldHVybiBcInNlbGVjdFwiO1xuXG5cdFx0Y2FzZSBcIm9wdGlvblwiOlxuXHRcdFx0cmV0dXJuIFwib3B0aW9uXCI7XG5cblx0XHRjYXNlIFwidGV4dGFyZWFcIjpcblx0XHRcdHJldHVybiBcInRleHRcIjtcblx0fVxufVxuXG5mdW5jdGlvbiBnZXROb2RlVmFsdWUobm9kZSwgdHlwZSkge1xuXHRpZiAodHlwZSA9PSBudWxsKSB0eXBlID0gZ2V0VHlwZShub2RlKTtcblx0dmFyIHZhbDtcblxuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFwibnVtYmVyXCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlQXNOdW1iZXI7XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFwidGV4dFwiOlxuXHRcdFx0dmFsID0gbm9kZS52YWx1ZTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImNoZWNrYm94XCI6XG5cdFx0XHR2YWwgPSBub2RlLmNoZWNrZWQ7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJkYXRlXCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlQXNEYXRlO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwic2VsZWN0XCI6XG5cdFx0XHR2YXIgb3B0ID0gbm9kZS5xdWVyeVNlbGVjdG9yKFwib3B0aW9uOmNoZWNrZWRcIik7XG5cdFx0XHRpZiAob3B0ICE9IG51bGwpIHZhbCA9IG9wdC4kYm91bmRfdmFsdWU7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJmaWxlXCI6XG5cdFx0XHR2YWwgPSAhbm9kZS5tdWx0aXBsZSA/IG5vZGUuZmlsZXNbMF0gOiBfLnRvQXJyYXkobm9kZS5maWxlcyk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJyYWRpb1wiOlxuXHRcdFx0dmFsID0gbm9kZS4kYm91bmRfdmFsdWU7XG5cdFx0XHRicmVhaztcblx0fVxuXG5cdHJldHVybiB2YWw7XG59XG5cbmZ1bmN0aW9uIHNldE5vZGVWYWx1ZShlbCwgdmFsLCB0eXBlKSB7XG5cdGlmICh0eXBlID09IG51bGwpIHR5cGUgPSBnZXRUeXBlKGVsKTtcblxuXHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRjYXNlIFwibnVtYmVyXCI6XG5cdFx0XHRpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZWwpIHJldHVybjtcblx0XHRcdGlmIChfLmlzTnVtYmVyKHZhbCkpIGVsLnZhbHVlQXNOdW1iZXIgPSB2YWw7XG5cdFx0XHRlbHNlIGVsLnZhbHVlID0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwidGV4dFwiOlxuXHRcdFx0aWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVsKSByZXR1cm47XG5cdFx0XHRlbC52YWx1ZSA9IHZhbCA9PSBudWxsID8gXCJcIiA6IHZhbC50b1N0cmluZygpO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiY2hlY2tib3hcIjpcblx0XHRcdGVsLmNoZWNrZWQgPSAhIXZhbDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImRhdGVcIjpcblx0XHRcdGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBlbCkgcmV0dXJuO1xuXHRcdFx0aWYgKF8uaXNEYXRlKHZhbCkpIGVsLnZhbHVlQXNEYXRlID0gdmFsO1xuXHRcdFx0ZWxzZSBlbC52YWx1ZSA9IHZhbDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInNlbGVjdFwiOlxuXHRcdFx0Xy50b0FycmF5KGVsLnF1ZXJ5U2VsZWN0b3JBbGwoXCJvcHRpb25cIikpLmZvckVhY2goZnVuY3Rpb24ob3B0KSB7XG5cdFx0XHRcdG9wdC5zZWxlY3RlZCA9IG9wdC4kYm91bmRfdmFsdWUgPT09IHZhbDtcblx0XHRcdH0pO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwicmFkaW9cIjpcblx0XHRcdGVsLmNoZWNrZWQgPSBlbC4kYm91bmRfdmFsdWUgPT09IHZhbDtcblx0XHRcdGJyZWFrO1xuXHR9XG59IiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XG52YXIgTW9kZWwgPSByZXF1aXJlKFwiLi9tb2RlbFwiKTtcbnZhciBWaWV3ID0gcmVxdWlyZShcIi4vdmlld1wiKTtcblxudmFyIFNlY3Rpb24gPVxubW9kdWxlLmV4cG9ydHMgPSBWaWV3LmV4dGVuZCh7XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbigpIHtcblx0XHR0aGlzLnJvd3MgPSB7fTtcblx0XHR0aGlzLl9yb3dfZGVwcyA9IHt9O1xuXHRcdFZpZXcuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0fSxcblxuXHRpbnZlcnQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdGlmICghXy5pc0Jvb2xlYW4odmFsKSkgdmFsID0gIXRoaXMuX2ludmVydGVkO1xuXHRcdHRoaXMuX2ludmVydGVkID0gdmFsO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGlzSW52ZXJ0ZWQ6IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiAhIXRoaXMuX2ludmVydGVkO1xuXHR9LFxuXG5cdHNldFBhdGg6IGZ1bmN0aW9uKHBhdGgpIHtcblx0XHR0aGlzLl9wYXRoID0gcGF0aDtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRvblJvdzogZnVuY3Rpb24oZm4pIHtcblx0XHRpZiAoIV8uaXNGdW5jdGlvbihmbikpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gZm9yIHJvdyBoYW5kbGVyLlwiKTtcblxuXHRcdHRoaXMuX29uUm93ID0gZm47XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YWRkUm93OiBmdW5jdGlvbihrZXksIGRhdGEpIHtcblx0XHQvLyByZW1vdmUgZXhpc3Rpbmdcblx0XHR0aGlzLnJlbW92ZVJvdyhrZXkpO1xuXG5cdFx0Ly8gY29udmVydCBkYXRhIHRvIG1vZGVsXG5cdFx0aWYgKCFNb2RlbC5pc01vZGVsKGRhdGEpKSB7XG5cdFx0XHRkYXRhID0gbmV3IE1vZGVsKGRhdGEsIHRoaXMubW9kZWwpO1xuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSBhIG5ldyByb3dcblx0XHR2YXIgcm93ID0gbmV3IFZpZXcoZGF0YSk7XG5cblx0XHQvLyBzZXQgdXAgcmVuZGVyIGFuZCBtb3VudCBpdFxuXHRcdHJvdy5yZW5kZXIgPSB0aGlzLl9vblJvdztcblx0XHR0aGlzLnJvd3Nba2V5XSA9IHJvdztcblx0XHR0aGlzLmFkZE1lbWJlcihyb3cpO1xuXHRcdHJvdy5tb3VudCgpO1xuXG5cdFx0cmV0dXJuIHJvdztcblx0fSxcblxuXHRoYXNSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdHJldHVybiB0aGlzLmdldFJvdyhrZXkpICE9IG51bGw7XG5cdH0sXG5cblx0Z2V0Um93OiBmdW5jdGlvbihrZXkpIHtcblx0XHRyZXR1cm4gdGhpcy5yb3dzW2tleV07XG5cdH0sXG5cblx0cmVtb3ZlUm93OiBmdW5jdGlvbihrZXkpIHtcblx0XHRpZiAodGhpcy5yb3dzW2tleV0gPT0gbnVsbCkgcmV0dXJuIHRoaXM7XG5cblx0XHR2YXIgcm93ID0gdGhpcy5yb3dzW2tleV07XG5cdFx0dGhpcy5yZW1vdmVNZW1iZXIocm93KTtcblx0XHRkZWxldGUgdGhpcy5yb3dzW2tleV07XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVBbGxSb3dzOiBmdW5jdGlvbigpIHtcblx0XHRPYmplY3Qua2V5cyh0aGlzLnJvd3MpLmZvckVhY2godGhpcy5yZW1vdmVSb3csIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbmRlcjogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuX3BhdGggPT0gbnVsbCkgdGhyb3cgbmV3IEVycm9yKFwiTWlzc2luZyBwYXRoLlwiKTtcblxuXHRcdHZhciBzZWxmID0gdGhpcyxcblx0XHRcdHZhbCwgaXNFbXB0eSwgaW52ZXJ0ZWQsIGlzTGlzdCxcblx0XHRcdHJvd1NvcnQsIG1vZGVsLCBwcm94eSwga2V5cztcblxuXHRcdHZhbCA9IHRoaXMuZ2V0KHRoaXMuX3BhdGgpO1xuXHRcdG1vZGVsID0gbmV3IE1vZGVsKHZhbCwgdGhpcy5tb2RlbCk7XG5cdFx0cHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUodmFsKTtcblx0XHRpbnZlcnRlZCA9IHRoaXMuaXNJbnZlcnRlZCgpO1xuXHRcdGlzTGlzdCA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImlzTGlzdFwiKTtcblxuXHRcdGZ1bmN0aW9uIGdldEVtcHRpbmVzcygpIHtcblx0XHRcdHJldHVybiBtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJpc0VtcHR5XCIpO1xuXHRcdH1cblxuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdGlzRW1wdHkgPSAhdmFsIHx8IChpc0xpc3QgJiYgIWdldEVtcHRpbmVzcygpKVxuXHRcdH0pO1xuXG5cdFx0aWYgKGlzRW1wdHkgJiYgaW52ZXJ0ZWQpIHtcblx0XHRcdGlmIChpc0xpc3QpIGdldEVtcHRpbmVzcygpO1xuXHRcdFx0dGhpcy5hZGRSb3coMCwgbW9kZWwpO1xuXHRcdH0gZWxzZSBpZiAoIWlzRW1wdHkgJiYgIWludmVydGVkKSB7XG5cdFx0XHRpZiAoaXNMaXN0KSB7XG5cdFx0XHRcdGtleXMgPSBbXTtcblxuXHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oY29tcCkge1xuXHRcdFx0XHRcdHZhciBua2V5cyA9IG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImtleXNcIik7XG5cblx0XHRcdFx0XHQvLyB0cmljayBUcmFja3Igc28gYXV0b3J1bnMgYXJlbid0IGNvbnRyb2xsZWQgYnkgdGhpcyBvbmVcblx0XHRcdFx0XHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gY29tcC5fcGFyZW50O1xuXG5cdFx0XHRcdFx0Ly8gcmVtb3ZlIHJlbW92ZWQgcm93c1xuXHRcdFx0XHRcdF8uZGlmZmVyZW5jZShrZXlzLCBua2V5cykuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLl9yb3dfZGVwc1trZXldKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Jvd19kZXBzW2tleV0uc3RvcCgpO1xuXHRcdFx0XHRcdFx0XHRkZWxldGUgdGhpcy5fcm93X2RlcHNba2V5XTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0dGhpcy5yZW1vdmVSb3coa2V5KTtcblx0XHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRcdC8vIGFkZCBhZGRlZCByb3dzXG5cdFx0XHRcdFx0Xy5kaWZmZXJlbmNlKG5rZXlzLCBrZXlzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuXHRcdFx0XHRcdFx0dmFyIHJvdywgcm1vZGVsO1xuXG5cdFx0XHRcdFx0XHRyb3cgPSB0aGlzLmdldFJvdyhrZXkpO1xuXHRcdFx0XHRcdFx0cm1vZGVsID0gcm93ICE9IG51bGwgPyByb3cubW9kZWwgOlxuXHRcdFx0XHRcdFx0XHRuZXcgTW9kZWwobnVsbCwgbmV3IE1vZGVsKHsgJGtleToga2V5IH0sIHRoaXMubW9kZWwpKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5fcm93X2RlcHNba2V5XSA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbihjKSB7XG5cdFx0XHRcdFx0XHRcdHJtb2RlbC5zZXQobW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiZ2V0XCIsIGtleSkpO1xuXHRcdFx0XHRcdFx0XHQvLyBpZiAocm93U29ydCAhPSBudWxsKSByb3dTb3J0LmludmFsaWRhdGUoKTtcblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHQvLyBhZGQgdGhlIHJvdyBhZnRlciB3ZSBzZXQgdGhlIGRhdGFcblx0XHRcdFx0XHRcdGlmIChyb3cgPT0gbnVsbCkgdGhpcy5hZGRSb3coa2V5LCBybW9kZWwpO1xuXHRcdFx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRcdFx0Ly8gcHJldGVuZCBsaWtlIG5vdGhpbmcgaGFwcGVuZWRcblx0XHRcdFx0XHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gY29tcDtcblxuXHRcdFx0XHRcdC8vIHRoZSBuZXcgc2V0IG9mIGtleXNcblx0XHRcdFx0XHRrZXlzID0gbmtleXM7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIGEgcmVhY3RpdmUgY29udGV4dCB0aGF0IGNvbnRpbnVvdXNseSBzb3J0cyByb3dzXG5cdFx0XHRcdC8vIHJvd1NvcnQgPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0Ly8gY29uc29sZS5sb2coa2V5cyk7XG5cdFx0XHRcdFx0Ly8gdmFyIGJlZm9yZSA9IG51bGwsIGksIHJvdztcblxuXHRcdFx0XHRcdC8vIGZvciAoaSA9IGtleXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0XHQvLyBcdHJvdyA9IHRoaXMuZ2V0Um93KGtleXNbaV0pO1xuXHRcdFx0XHRcdC8vIFx0aWYgKHJvdyA9PSBudWxsKSBjb250aW51ZTtcblx0XHRcdFx0XHQvLyBcdHRoaXMuaW5zZXJ0QmVmb3JlKHJvdywgYmVmb3JlKTtcblx0XHRcdFx0XHQvLyBcdGJlZm9yZSA9IHJvdztcblx0XHRcdFx0XHQvLyB9XG5cdFx0XHRcdC8vIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hZGRSb3coMCwgbW9kZWwpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNMaXN0KSB7XG5cdFx0XHRnZXRFbXB0aW5lc3MoKTtcblx0XHR9XG5cblx0XHQvLyBhdXRvIGNsZWFuXG5cdFx0dGhpcy5vbmNlKFwiaW52YWxpZGF0ZVwiLCBmdW5jdGlvbigpIHtcblx0XHRcdHRoaXMuX3Jvd19kZXBzID0ge307XG5cdFx0XHR0aGlzLnJlbW92ZUFsbFJvd3MoKTtcblx0XHR9KTtcblx0fVxuXG59LCB7XG5cblx0aXNFbXB0eTogZnVuY3Rpb24obW9kZWwsIHByb3h5KSB7XG5cdFx0aWYgKCFtb2RlbC5kYXRhKSByZXR1cm4gdHJ1ZTtcblx0XHRpZiAocHJveHkgPT0gbnVsbCkgcHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUobW9kZWwuZGF0YSk7XG5cdFx0cmV0dXJuIG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgbW9kZWwuZGF0YSwgXCJpc0xpc3RcIikgJiZcblx0XHRcdG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgbW9kZWwuZGF0YSwgXCJpc0VtcHR5XCIpO1xuXHR9XG5cbn0pO1xuIiwibW9kdWxlLmV4cG9ydHMgPSB7XG5cdFJPT1QgICAgICAgICAgICAgIDogMSxcblxuXHQvLyBYTUwvSFRNTFxuXHRIVE1MICAgICAgICAgICAgICA6IDIsXG5cdFRFWFQgICAgICAgICAgICAgIDogMyxcblx0RUxFTUVOVCAgICAgICAgICAgOiA0LFxuXHRBVFRSSUJVVEUgICAgICAgICA6IDUsXG5cdFhDT01NRU5UICAgICAgICAgIDogNixcblxuXHQvLyBNdXN0YWNoZVxuXHRJTlRFUlBPTEFUT1IgICAgICA6IDcsXG5cdFRSSVBMRSAgICAgICAgICAgIDogOCxcblx0U0VDVElPTiAgICAgICAgICAgOiA5LFxuXHRJTlZFUlRFRCAgICAgICAgICA6IDEwLFxuXHRQQVJUSUFMICAgICAgICAgICA6IDExLFxuXHRNQ09NTUVOVCAgICAgICAgICA6IDEyLFxuXG5cdC8vIE1JU0Ncblx0TElURVJBTCAgICAgICAgICAgOiAxM1xufVxuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcblxuLy8gbGlrZSB1bmRlcnNjb3JlJ3MgcmVzdWx0LCBidXQgcGFzcyBhcmd1bWVudHMgdGhyb3VnaFxuZXhwb3J0cy5yZXN1bHQgPSBmdW5jdGlvbihvYmplY3QsIHByb3BlcnR5KSB7XG5cdHZhciB2YWx1ZSA9IG9iamVjdCA9PSBudWxsID8gdm9pZCAwIDogb2JqZWN0W3Byb3BlcnR5XTtcblx0cmV0dXJuIF8uaXNGdW5jdGlvbih2YWx1ZSkgPyB2YWx1ZS5hcHBseShvYmplY3QsIEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMikpIDogdmFsdWU7XG59O1xuXG4vLyB0ZXN0cyB2YWx1ZSBhcyBwb2pvIChwbGFpbiBvbGQgamF2YXNjcmlwdCBvYmplY3QpXG52YXIgaXNQbGFpbk9iamVjdCA9XG5leHBvcnRzLmlzUGxhaW5PYmplY3QgPSBmdW5jdGlvbihvYmopIHtcblx0cmV0dXJuIG9iaiAhPSBudWxsICYmIChvYmouY29uc3RydWN0b3IgPT09IE9iamVjdCB8fCBvYmouX19wcm90b19fID09PSBPYmplY3QucHJvdG90eXBlKTtcbn1cblxuLy8gdGVzdHMgZnVuY3Rpb24gYXMgYSBzdWJjbGFzcyBvZiBhIHBhcmVudCBmdW5jdGlvblxuLy8gaGVyZSwgYSBjbGFzcyBpcyB0ZWNobmljYWxseSBhIHN1YmNsYXNzIG9mIGl0c2VsZlxuZXhwb3J0cy5pc1N1YkNsYXNzID0gZnVuY3Rpb24ocGFyZW50LCBmbikge1xuXHRyZXR1cm4gZm4gPT09IHBhcmVudCB8fCAoZm4gIT0gbnVsbCAmJiBmbi5wcm90b3R5cGUgaW5zdGFuY2VvZiBwYXJlbnQpO1xufVxuXG4vLyBsaWtlIGpRdWVyeSdzIGVtcHR5KCksIHJlbW92ZXMgYWxsIGNoaWxkcmVuXG52YXIgZW1wdHlOb2RlID1cbmV4cG9ydHMuZW1wdHlOb2RlID0gZnVuY3Rpb24obm9kZSkge1xuXHR3aGlsZSAobm9kZS5sYXN0Q2hpbGQpIG5vZGUucmVtb3ZlQ2hpbGQobm9kZS5sYXN0Q2hpbGQpO1xuXHRyZXR1cm4gbm9kZTtcbn1cblxuLy8gaW5zZXJ0cyBhbiBhcnJheSBub2RlcyBpbnRvIGEgcGFyZW50XG5leHBvcnRzLmluc2VydE5vZGVzID0gZnVuY3Rpb24obm9kZXMsIHBhcmVudCwgYmVmb3JlKSB7XG5cdHZhciBub2RlLCBuZXh0LCBpO1xuXG5cdC8vIHdlIGRvIGl0IGJhY2t3YXJkcyBzbyBub2RlcyBkb24ndCBnZXQgbW92ZWQgaWYgdGhleSBkb24ndCBuZWVkIHRvXG5cdGZvciAoaSA9IG5vZGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0bm9kZSA9IG5vZGVzW2ldO1xuXHRcdG5leHQgPSBub2Rlc1tpICsgMV0gfHwgYmVmb3JlO1xuXG5cdFx0aWYgKG5vZGUubmV4dFNpYmxpbmcgIT09IGJlZm9yZSkge1xuXHRcdFx0cGFyZW50Lmluc2VydEJlZm9yZShub2RlLCBuZXh0KTtcblx0XHR9XG5cdH1cbn1cblxuLy8gY2xlYW5zIGh0bWwsIHRoZW4gY29udmVydHMgaHRtbCBlbnRpdGllcyB0byB1bmljb2RlXG5leHBvcnRzLmRlY29kZUVudGl0aWVzID0gKGZ1bmN0aW9uKCkge1xuXHRpZiAodHlwZW9mIGRvY3VtZW50ID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cblx0Ly8gdGhpcyBwcmV2ZW50cyBhbnkgb3ZlcmhlYWQgZnJvbSBjcmVhdGluZyB0aGUgb2JqZWN0IGVhY2ggdGltZVxuXHR2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHR2YXIgZW50aXR5ID0gLyYoPzojeFthLWYwLTldK3wjWzAtOV0rfFthLXowLTldKyk7Py9pZztcblxuXHRyZXR1cm4gZnVuY3Rpb24gZGVjb2RlSFRNTEVudGl0aWVzKHN0cikge1xuXHRcdHN0ciA9IHN0ci5yZXBsYWNlKGVudGl0eSwgZnVuY3Rpb24obSkge1xuXHRcdFx0ZWxlbWVudC5pbm5lckhUTUwgPSBtO1xuXHRcdFx0cmV0dXJuIGVsZW1lbnQudGV4dENvbnRlbnQ7XG5cdFx0fSk7XG5cblx0XHRlbXB0eU5vZGUoZWxlbWVudCk7XG5cblx0XHRyZXR1cm4gc3RyO1xuXHR9XG59KSgpO1xuXG4vLyBjb252ZXJ0IGh0bWwgaW50byBET00gbm9kZXNcbmV4cG9ydHMucGFyc2VIVE1MID0gKGZ1bmN0aW9uKCkge1xuXHRpZiAodHlwZW9mIGRvY3VtZW50ID09PSBcInVuZGVmaW5lZFwiKSByZXR1cm47XG5cblx0Ly8gdGhpcyBwcmV2ZW50cyBhbnkgb3ZlcmhlYWQgZnJvbSBjcmVhdGluZyB0aGUgb2JqZWN0IGVhY2ggdGltZVxuXHR2YXIgZWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdHJldHVybiBmdW5jdGlvbiBwYXJzZUhUTUwoaHRtbCkge1xuXHRcdGVsZW1lbnQuaW5uZXJIVE1MID0gaHRtbCAhPSBudWxsID8gaHRtbC50b1N0cmluZygpIDogXCJcIjtcblx0XHR2YXIgbm9kZXMgPSBfLnRvQXJyYXkoZWxlbWVudC5jaGlsZE5vZGVzKTtcblx0XHRlbXB0eU5vZGUoZWxlbWVudCk7XG5cdFx0cmV0dXJuIG5vZGVzO1xuXHR9XG59KSgpO1xuXG52YXIgbWF0Y2hlcyA9IGV4cG9ydHMubWF0Y2hlcyA9IGZ1bmN0aW9uKG5vZGUsIHNlbGVjdG9yKSB7XG5cdGlmIChfLmlzQXJyYXkoc2VsZWN0b3IpKSByZXR1cm4gc2VsZWN0b3Iuc29tZShmdW5jdGlvbihzKSB7XG5cdFx0cmV0dXJuIG1hdGNoZXMobm9kZSwgcyk7XG5cdH0pO1xuXG5cdGlmIChzZWxlY3RvciBpbnN0YW5jZW9mIHdpbmRvdy5Ob2RlKSB7XG5cdFx0cmV0dXJuIG5vZGUgPT09IHNlbGVjdG9yO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBzZWxlY3RvciA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0cmV0dXJuICEhc2VsZWN0b3Iobm9kZSk7XG5cdH1cblxuXHRpZiAobm9kZS5ub2RlVHlwZSA9PT0gd2luZG93Lk5vZGUuRUxFTUVOVF9OT0RFKSB7XG5cdFx0cmV0dXJuIHJlcXVpcmUoXCJtYXRjaGVzLXNlbGVjdG9yXCIpKG5vZGUsIHNlbGVjdG9yKTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG52YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciBFdmVudHMgPSByZXF1aXJlKFwiYmFja2JvbmUtZXZlbnRzLXN0YW5kYWxvbmVcIik7XG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcbnZhciBNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpO1xudmFyIFBsdWdpbnMgPSByZXF1aXJlKFwiLi9wbHVnaW5zXCIpO1xudmFyIERPTVJhbmdlID0gcmVxdWlyZShcIi4vZG9tcmFuZ2VcIik7XG5cbnZhciBWaWV3ID1cbm1vZHVsZS5leHBvcnRzID0gRE9NUmFuZ2UuZXh0ZW5kKHtcblx0XG5cdGNvbnN0cnVjdG9yOiBmdW5jdGlvbihkYXRhLCBvcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0XHQvLyBmaXJzdCB3ZSBjcmVhdGUgdGhlIGluaXRpYWwgdmlldyBzdGF0ZVxuXHRcdHZhciBzdGF0ZSA9IF8ucmVzdWx0KHRoaXMsIFwiaW5pdGlhbFN0YXRlXCIpIHx8IF8ucmVzdWx0KHRoaXMsIFwiZGVmYXVsdHNcIik7XG5cdFx0aWYgKHR5cGVvZiBzdGF0ZSAhPT0gXCJ1bmRlZmluZWRcIikge1xuXHRcdFx0aWYgKCFNb2RlbC5pc01vZGVsKHN0YXRlKSkge1xuXHRcdFx0XHRzdGF0ZSA9IG5ldyBNb2RlbChzdGF0ZSwgbnVsbCwgb3B0aW9ucy5zdGF0ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNob3ZlIHN0YXRlIGJldHdlZW4gY29udGV4dHNcblx0XHRcdGlmIChNb2RlbC5pc01vZGVsKGRhdGEpKSB7XG5cdFx0XHRcdGlmIChkYXRhLnBhcmVudCkgZGF0YS5wYXJlbnQuYXBwZW5kKHN0YXRlKTtcblx0XHRcdFx0c3RhdGUuYXBwZW5kKGRhdGEpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBhZGQgdG8gdGhlIHN0YWNrIGJlZm9yZSB0aGUgcmVhbCBkYXRhXG5cdFx0XHR0aGlzLmFkZERhdGEoc3RhdGUpO1xuXHRcdFx0dGhpcy5zdGF0ZU1vZGVsID0gc3RhdGU7XG5cblx0XHRcdC8vIHNldHVwIGVhc3ktYWNjZXNzIHN0YXRlIHByb3BlcnR5XG5cdFx0XHRzdGF0ZS5kZWZpbmVEYXRhTGluayh0aGlzLCBcInN0YXRlXCIpO1xuXHRcdH1cblxuXHRcdC8vIGFkZCBwYXJ0aWFsc1xuXHRcdHRoaXMuX3BhcnRpYWxzID0ge307XG5cdFx0dGhpcy5fY29tcG9uZW50cyA9IHt9O1xuXHRcdHRoaXMuc2V0UGFydGlhbChfLmV4dGVuZCh7fSwgb3B0aW9ucy5wYXJ0aWFscywgXy5yZXN1bHQodGhpcywgXCJwYXJ0aWFsc1wiKSkpO1xuXG5cdFx0Ly8gc2V0IHRoZSBwYXNzZWQgaW4gZGF0YVxuXHRcdGlmICh0eXBlb2YgZGF0YSAhPT0gXCJ1bmRlZmluZWRcIikgdGhpcy5hZGREYXRhKGRhdGEsIG9wdGlvbnMpO1xuXG5cdFx0Ly8gaW5pdGlhdGUgbGlrZSBhIG5vcm1hbCBkb20gcmFuZ2Vcblx0XHRET01SYW5nZS5jYWxsKHRoaXMpO1xuXG5cdFx0Ly8gaW5pdGlhbGl6ZSB3aXRoIG9wdGlvbnNcblx0XHR0aGlzLmluaXRpYWxpemUuY2FsbCh0aGlzLCBvcHRpb25zKTtcblx0fSxcblxuXHRpbml0aWFsaXplOiBmdW5jdGlvbigpe30sXG5cblx0dXNlOiBmdW5jdGlvbihwKSB7XG5cdFx0cmV0dXJuIFBsdWdpbnMubG9hZFBsdWdpbih0aGlzLCBwLCBfLnRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgxKSk7XG5cdH0sXG5cblx0Ly8gYWRkcyBkYXRhIHRvIHRoZSBjdXJyZW50IHN0YWNrXG5cdGFkZERhdGE6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRpZiAoIU1vZGVsLmlzTW9kZWwoZGF0YSkpIGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgdGhpcy5tb2RlbCwgb3B0aW9ucyk7XG5cdFx0dGhpcy5tb2RlbCA9IGRhdGE7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gYXR0YWNoICsgbW91bnRcblx0cGFpbnQ6IGZ1bmN0aW9uKHAsIG4sIF9pc01vdmUsIF9pc1JlcGxhY2UpIHtcblx0XHRET01SYW5nZS5wcm90b3R5cGUuYXR0YWNoLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKCEoX2lzTW92ZSB8fCBfaXNSZXBsYWNlIHx8IHRoaXMuY29tcCkpIHRoaXMubW91bnQoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBhdXRvIHN0b3Agb24gZGV0YWNoXG5cdGRldGFjaDogZnVuY3Rpb24oX2lzUmVwbGFjZSkge1xuXHRcdGlmICghX2lzUmVwbGFjZSkgdGhpcy5zdG9wKCk7XG5cdFx0RE9NUmFuZ2UucHJvdG90eXBlLmRldGFjaC5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGF1dG9ydW46IGZ1bmN0aW9uKGZuLCBvcHRpb25zKSB7XG5cdFx0cmV0dXJuIFRyYWNrci5hdXRvcnVuKGZuLCBvcHRpb25zLCB0aGlzKTtcblx0fSxcblxuXHQvLyBhIGdlbmVyYWxpemVkIHJlYWN0aXZlIHdvcmtmbG93IGhlbHBlclxuXHRtb3VudDogZnVuY3Rpb24oKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0Ly8gc3RvcCBleGlzdGluZyBtb3VudFxuXHRcdFx0dGhpcy5zdG9wKCk7XG5cblx0XHRcdC8vIHRoZSBmaXJzdCBldmVudCBpbiB0aGUgY3ljbGUsIGJlZm9yZSBldmVyeXRoaW5nIGVsc2Vcblx0XHRcdHRoaXMudHJpZ2dlcihcIm1vdW50OmJlZm9yZVwiKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdC8vIHRoZSBhdXRvcnVuIGNvbXB1dGF0aW9uXG5cdFx0dmFyIGNvbXAgPSB0aGlzLmNvbXAgPSB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oY29tcCkge1xuXHRcdFx0dGhpcy5yZW5kZXIoKTtcblx0XHRcdHRoaXMudHJpZ2dlcihcInJlbmRlclwiLCBjb21wKTtcblxuXHRcdFx0Ly8gYXV0byBjbGVhbiB1cFxuXHRcdFx0Y29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdC8vIHJlbWFpbmluZyBpbnZhbGlkYXRlIGV2ZW50c1xuXHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJpbnZhbGlkYXRlXCIsIGNvbXApO1xuXG5cdFx0XHRcdC8vIGRldGVjdCBpZiB0aGUgY29tcHV0YXRpb24gc3RvcHBlZFxuXHRcdFx0XHRpZiAoY29tcC5zdG9wcGVkKSB7XG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyKFwic3RvcFwiLCBjb21wKTtcblx0XHRcdFx0XHRkZWxldGUgdGhpcy5jb21wO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdC8vIHJlbWFpbmluZyBtb3VudCBldmVudHMgaGFwcGVuIGFmdGVyIHRoZSBmaXJzdCByZW5kZXJcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXIoXCJtb3VudDphZnRlclwiLCBjb21wKTtcblx0XHR9LCB0aGlzKTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbmRlcjogZnVuY3Rpb24oKXt9LFxuXG5cdHN0b3A6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICh0aGlzLmNvbXApIHRoaXMuY29tcC5zdG9wKCk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0Ly8gc2V0cyBwYXJ0aWFsIGJ5IG5hbWVcblx0c2V0UGFydGlhbDogZnVuY3Rpb24obmFtZSwgcGFydGlhbCkge1xuXHRcdGlmIChfLmlzT2JqZWN0KG5hbWUpICYmIHBhcnRpYWwgPT0gbnVsbCkge1xuXHRcdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKHAsIG4pIHsgdGhpcy5zZXRQYXJ0aWFsKG4sIHApOyB9LCB0aGlzKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblxuXHRcdGlmICghXy5pc1N0cmluZyhuYW1lKSAmJiBuYW1lICE9PSBcIlwiKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZm9yIHBhcnRpYWwgbmFtZS5cIik7XG5cblx0XHRpZiAocGFydGlhbCAhPSBudWxsICYmICF1dGlscy5pc1N1YkNsYXNzKFZpZXcsIHBhcnRpYWwpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIFZpZXcgc3ViY2xhc3Mgb3IgZnVuY3Rpb24gZm9yIHBhcnRpYWwuXCIpO1xuXG5cdFx0aWYgKHBhcnRpYWwgPT0gbnVsbCkge1xuXHRcdFx0ZGVsZXRlIHRoaXMuX3BhcnRpYWxzW25hbWVdO1xuXHRcdFx0cGFydGlhbCA9IHZvaWQgMDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIHAgPSB0aGlzLl9nZXRQYXJ0aWFsKG5hbWUpO1xuXHRcdFx0cC52aWV3ID0gcGFydGlhbDtcblx0XHRcdHAuZGVwLmNoYW5nZWQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBlbnN1cmVzIGEgcGFydGlhbCdzIGRlcGVuZGVuY3kgZXhpc3RzXG5cdF9nZXRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0aWYgKHRoaXMuX3BhcnRpYWxzW25hbWVdID09IG51bGwpXG5cdFx0XHR0aGlzLl9wYXJ0aWFsc1tuYW1lXSA9IHsgZGVwOiBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKSB9O1xuXG5cdFx0cmV0dXJuIHRoaXMuX3BhcnRpYWxzW25hbWVdO1xuXHR9LFxuXG5cdC8vIGxvb2tzIHRocm91Z2ggcGFyZW50cyBmb3IgcGFydGlhbFxuXHRmaW5kUGFydGlhbDogZnVuY3Rpb24obmFtZSkge1xuXHRcdHZhciBjID0gdGhpcywgcDtcblxuXHRcdHdoaWxlIChjICE9IG51bGwpIHtcblx0XHRcdGlmIChjLl9nZXRQYXJ0aWFsICE9IG51bGwpIHtcblx0XHRcdFx0cCA9IGMuX2dldFBhcnRpYWwobmFtZSk7XG5cdFx0XHRcdHAuZGVwLmRlcGVuZCgpO1xuXHRcdFx0XHRpZiAocC52aWV3ICE9IG51bGwpIHJldHVybiBwLnZpZXc7XG5cdFx0XHR9XG5cblx0XHRcdGMgPSBjLnBhcmVudFJhbmdlO1xuXHRcdH1cblx0fSxcblxuXHQvLyBnZW5lcmF0ZXMgYSBuZXcgY29tcG9uZW50IGZyb20gYSBWaWV3IHN1YmNsYXNzIG9yIHBhcnRpYWwncyBuYW1lXG5cdHJlbmRlclBhcnRpYWw6IGZ1bmN0aW9uKGtsYXNzLCBjdHgsIG9wdGlvbnMpIHtcblx0XHR2YXIgY29tcHMsIG5hbWU7XG5cblx0XHQvLyBsb29rIHVwIHRoZSBwYXJ0aWFsIGJ5IG5hbWVcblx0XHRpZiAodHlwZW9mIGtsYXNzID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRuYW1lID0ga2xhc3M7XG5cdFx0XHRrbGFzcyA9IHRoaXMuZmluZFBhcnRpYWwoa2xhc3MpO1xuXHRcdH1cblxuXHRcdC8vIGNsYXNzIG11c3QgYmUgYSB2aWV3XG5cdFx0aWYgKCF1dGlscy5pc1N1YkNsYXNzKFZpZXcsIGtsYXNzKSkgcmV0dXJuIG51bGw7XG5cblx0XHQvLyBub3JtYWxpemUgY29udGV4dFxuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRpZiAoY3R4IGluc3RhbmNlb2YgVmlldykgY3R4ID0gY3R4Lm1vZGVsO1xuXG5cdFx0Ly8gY3JlYXRlIGl0IG5vbi1yZWFjdGl2ZWx5XG5cdFx0dmFyIGNvbXBvbmVudCA9IFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBuZXcga2xhc3MoY3R4LCBvcHRpb25zKTtcblx0XHR9KTtcblxuXHRcdC8vIGFkZCBpdCB0byB0aGUgbGlzdFxuXHRcdGlmIChuYW1lKSB7XG5cdFx0XHRjb21wcyA9IHRoaXMuX2NvbXBvbmVudHM7XG5cdFx0XHRpZiAoY29tcHNbbmFtZV0gPT0gbnVsbCkgY29tcHNbbmFtZV0gPSBbXTtcblx0XHRcdGNvbXBzW25hbWVdLnB1c2goY29tcG9uZW50KTtcblxuXHRcdFx0Ly8gYXV0byByZW1vdmUgd2hlbiB0aGUgcGFydGlhbCBpcyBcInN0b3BwZWRcIlxuXHRcdFx0Y29tcG9uZW50Lm9uY2UoXCJzdG9wXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRjb21wc1tuYW1lXSA9IF8ud2l0aG91dChjb21wc1tuYW1lXSwgY29tcG9uZW50KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21wb25lbnQ7XG5cdH0sXG5cblx0Ly8gcmV0dXJucyBmaXJzdCByZW5kZXJlZCBwYXJ0aWFsIGJ5IG5hbWVcblx0Z2V0Q29tcG9uZW50OiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGNvbXBzLCBjb21wLCByZXMsIG4sIGk7XG5cblx0XHRjb21wcyA9IHRoaXMuX2NvbXBvbmVudHM7XG5cdFx0aWYgKGNvbXBzW25hbWVdICE9IG51bGwgJiYgY29tcHNbbmFtZV0ubGVuZ3RoKSByZXR1cm4gY29tcHNbbmFtZV1bMF07XG5cblx0XHRmb3IgKG4gaW4gY29tcHMpIHtcblx0XHRcdGZvciAoaSBpbiBjb21wc1tuXSkge1xuXHRcdFx0XHRjb21wID0gY29tcHNbbl1baV1cblx0XHRcdFx0aWYgKCEoY29tcCBpbnN0YW5jZW9mIFZpZXcpKSBjb250aW51ZTtcblx0XHRcdFx0cmVzID0gY29tcC5nZXRDb21wb25lbnQobmFtZSk7XG5cdFx0XHRcdGlmIChyZXMgIT0gbnVsbCkgcmV0dXJuIHJlcztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fSxcblxuXHQvLyByZXR1cm5zIGFsbCByZW5kZXJlZCBwYXJ0aWFscyBieSBuYW1lXG5cdGdldENvbXBvbmVudHM6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRyZXR1cm4gXy5yZWR1Y2UodGhpcy5fY29tcG9uZW50cywgZnVuY3Rpb24obSwgY29tcHMsIG4pIHtcblx0XHRcdGlmIChuID09PSBuYW1lKSBtLnB1c2guYXBwbHkobSwgY29tcHMpO1xuXG5cdFx0XHRjb21wcy5mb3JFYWNoKGZ1bmN0aW9uKGMpIHtcblx0XHRcdFx0aWYgKGMgaW5zdGFuY2VvZiBWaWV3KSBtLnB1c2guYXBwbHkobSwgYy5nZXRDb21wb25lbnRzKG5hbWUpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gbTtcblx0XHR9LCBbXSk7XG5cdH1cblxufSk7XG5cbi8vIHF1aWNrIGFjY2VzcyB0byB0aGUgdG9wIG1vZGVsIGRhdGFcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShWaWV3LnByb3RvdHlwZSwgXCJkYXRhXCIsIHtcblx0Y29uZmlndXJhYmxlOiB0cnVlLFxuXHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMubW9kZWwuX2RlcC5kZXBlbmQoKTtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5kYXRhO1xuXHR9LFxuXHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdHRoaXMubW9kZWwuc2V0KHZhbCk7XG5cdH1cbn0pO1xuXG4vLyBjaGFpbmFibGUgbWV0aG9kcyB0byBwcm94eSB0byBtb2RlbFxuWyBcInNldFwiLCBcInJlZ2lzdGVyUHJveHlcIiBdXG4uZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcblx0Vmlldy5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMubW9kZWxbbWV0aG9kXS5hcHBseSh0aGlzLm1vZGVsLCBhcmd1bWVudHMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG59KTtcblxuLy8gbWV0aG9kcyB0byBwcm94eSB0byBtb2RlbCB3aGljaCBkb24ndCByZXR1cm4gdGhpc1xuWyBcImdldFwiLCBcImdldExvY2FsXCIsIFwiZ2V0UHJveHlCeVZhbHVlXCIsIFwiZ2V0TW9kZWxBdE9mZnNldFwiLFxuICBcImdldFJvb3RNb2RlbFwiLCBcImZpbmRNb2RlbFwiLCBcImdldEFsbE1vZGVsc1wiXG5dLmZvckVhY2goZnVuY3Rpb24obWV0aG9kKSB7XG5cdFZpZXcucHJvdG90eXBlW21ldGhvZF0gPSBmdW5jdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbFttZXRob2RdLmFwcGx5KHRoaXMubW9kZWwsIGFyZ3VtZW50cyk7XG5cdH1cbn0pO1xuXG4vLyBwcm94eSBhIGZldyBjb21wdXRhdGlvbiBtZXRob2RzXG5bIFwiaW52YWxpZGF0ZVwiLCBcIm9uSW52YWxpZGF0ZVwiIF0uZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcblx0Vmlldy5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uKCkge1xuXHRcdGlmICghdGhpcy5jb21wKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgcnVuIFwiICsgbWV0aG9kICsgXCIoKS4gVGhpcyB2aWV3IGlzIG5vdCBtb3VudGVkLlwiKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbXBbbWV0aG9kXS5hcHBseSh0aGlzLmNvbXAsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn0pO1xuIiwiLyoqXG4gKiBTdGFuZGFsb25lIGV4dHJhY3Rpb24gb2YgQmFja2JvbmUuRXZlbnRzLCBubyBleHRlcm5hbCBkZXBlbmRlbmN5IHJlcXVpcmVkLlxuICogRGVncmFkZXMgbmljZWx5IHdoZW4gQmFja29uZS91bmRlcnNjb3JlIGFyZSBhbHJlYWR5IGF2YWlsYWJsZSBpbiB0aGUgY3VycmVudFxuICogZ2xvYmFsIGNvbnRleHQuXG4gKlxuICogTm90ZSB0aGF0IGRvY3Mgc3VnZ2VzdCB0byB1c2UgdW5kZXJzY29yZSdzIGBfLmV4dGVuZCgpYCBtZXRob2QgdG8gYWRkIEV2ZW50c1xuICogc3VwcG9ydCB0byBzb21lIGdpdmVuIG9iamVjdC4gQSBgbWl4aW4oKWAgbWV0aG9kIGhhcyBiZWVuIGFkZGVkIHRvIHRoZSBFdmVudHNcbiAqIHByb3RvdHlwZSB0byBhdm9pZCB1c2luZyB1bmRlcnNjb3JlIGZvciB0aGF0IHNvbGUgcHVycG9zZTpcbiAqXG4gKiAgICAgdmFyIG15RXZlbnRFbWl0dGVyID0gQmFja2JvbmVFdmVudHMubWl4aW4oe30pO1xuICpcbiAqIE9yIGZvciBhIGZ1bmN0aW9uIGNvbnN0cnVjdG9yOlxuICpcbiAqICAgICBmdW5jdGlvbiBNeUNvbnN0cnVjdG9yKCl7fVxuICogICAgIE15Q29uc3RydWN0b3IucHJvdG90eXBlLmZvbyA9IGZ1bmN0aW9uKCl7fVxuICogICAgIEJhY2tib25lRXZlbnRzLm1peGluKE15Q29uc3RydWN0b3IucHJvdG90eXBlKTtcbiAqXG4gKiAoYykgMjAwOS0yMDEzIEplcmVteSBBc2hrZW5hcywgRG9jdW1lbnRDbG91ZCBJbmMuXG4gKiAoYykgMjAxMyBOaWNvbGFzIFBlcnJpYXVsdFxuICovXG4vKiBnbG9iYWwgZXhwb3J0czp0cnVlLCBkZWZpbmUsIG1vZHVsZSAqL1xuKGZ1bmN0aW9uKCkge1xuICB2YXIgcm9vdCA9IHRoaXMsXG4gICAgICBuYXRpdmVGb3JFYWNoID0gQXJyYXkucHJvdG90eXBlLmZvckVhY2gsXG4gICAgICBoYXNPd25Qcm9wZXJ0eSA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHksXG4gICAgICBzbGljZSA9IEFycmF5LnByb3RvdHlwZS5zbGljZSxcbiAgICAgIGlkQ291bnRlciA9IDA7XG5cbiAgLy8gUmV0dXJucyBhIHBhcnRpYWwgaW1wbGVtZW50YXRpb24gbWF0Y2hpbmcgdGhlIG1pbmltYWwgQVBJIHN1YnNldCByZXF1aXJlZFxuICAvLyBieSBCYWNrYm9uZS5FdmVudHNcbiAgZnVuY3Rpb24gbWluaXNjb3JlKCkge1xuICAgIHJldHVybiB7XG4gICAgICBrZXlzOiBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb2JqICE9PSBcIm9iamVjdFwiICYmIHR5cGVvZiBvYmogIT09IFwiZnVuY3Rpb25cIiB8fCBvYmogPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKFwia2V5cygpIGNhbGxlZCBvbiBhIG5vbi1vYmplY3RcIik7XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGtleSwga2V5cyA9IFtdO1xuICAgICAgICBmb3IgKGtleSBpbiBvYmopIHtcbiAgICAgICAgICBpZiAob2JqLmhhc093blByb3BlcnR5KGtleSkpIHtcbiAgICAgICAgICAgIGtleXNba2V5cy5sZW5ndGhdID0ga2V5O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4ga2V5cztcbiAgICAgIH0sXG5cbiAgICAgIHVuaXF1ZUlkOiBmdW5jdGlvbihwcmVmaXgpIHtcbiAgICAgICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICAgICAgcmV0dXJuIHByZWZpeCA/IHByZWZpeCArIGlkIDogaWQ7XG4gICAgICB9LFxuXG4gICAgICBoYXM6IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgICAgIHJldHVybiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgICAgIH0sXG5cbiAgICAgIGVhY2g6IGZ1bmN0aW9uKG9iaiwgaXRlcmF0b3IsIGNvbnRleHQpIHtcbiAgICAgICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm47XG4gICAgICAgIGlmIChuYXRpdmVGb3JFYWNoICYmIG9iai5mb3JFYWNoID09PSBuYXRpdmVGb3JFYWNoKSB7XG4gICAgICAgICAgb2JqLmZvckVhY2goaXRlcmF0b3IsIGNvbnRleHQpO1xuICAgICAgICB9IGVsc2UgaWYgKG9iai5sZW5ndGggPT09ICtvYmoubGVuZ3RoKSB7XG4gICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBvYmoubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtpXSwgaSwgb2JqKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICAgICAgaWYgKHRoaXMuaGFzKG9iaiwga2V5KSkge1xuICAgICAgICAgICAgICBpdGVyYXRvci5jYWxsKGNvbnRleHQsIG9ialtrZXldLCBrZXksIG9iaik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBvbmNlOiBmdW5jdGlvbihmdW5jKSB7XG4gICAgICAgIHZhciByYW4gPSBmYWxzZSwgbWVtbztcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICAgIGlmIChyYW4pIHJldHVybiBtZW1vO1xuICAgICAgICAgIHJhbiA9IHRydWU7XG4gICAgICAgICAgbWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICBmdW5jID0gbnVsbDtcbiAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9O1xuICB9XG5cbiAgdmFyIF8gPSBtaW5pc2NvcmUoKSwgRXZlbnRzO1xuXG4gIC8vIEJhY2tib25lLkV2ZW50c1xuICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAvLyBBIG1vZHVsZSB0aGF0IGNhbiBiZSBtaXhlZCBpbiB0byAqYW55IG9iamVjdCogaW4gb3JkZXIgdG8gcHJvdmlkZSBpdCB3aXRoXG4gIC8vIGN1c3RvbSBldmVudHMuIFlvdSBtYXkgYmluZCB3aXRoIGBvbmAgb3IgcmVtb3ZlIHdpdGggYG9mZmAgY2FsbGJhY2tcbiAgLy8gZnVuY3Rpb25zIHRvIGFuIGV2ZW50OyBgdHJpZ2dlcmAtaW5nIGFuIGV2ZW50IGZpcmVzIGFsbCBjYWxsYmFja3MgaW5cbiAgLy8gc3VjY2Vzc2lvbi5cbiAgLy9cbiAgLy8gICAgIHZhciBvYmplY3QgPSB7fTtcbiAgLy8gICAgIF8uZXh0ZW5kKG9iamVjdCwgQmFja2JvbmUuRXZlbnRzKTtcbiAgLy8gICAgIG9iamVjdC5vbignZXhwYW5kJywgZnVuY3Rpb24oKXsgYWxlcnQoJ2V4cGFuZGVkJyk7IH0pO1xuICAvLyAgICAgb2JqZWN0LnRyaWdnZXIoJ2V4cGFuZCcpO1xuICAvL1xuICBFdmVudHMgPSB7XG5cbiAgICAvLyBCaW5kIGFuIGV2ZW50IHRvIGEgYGNhbGxiYWNrYCBmdW5jdGlvbi4gUGFzc2luZyBgXCJhbGxcImAgd2lsbCBiaW5kXG4gICAgLy8gdGhlIGNhbGxiYWNrIHRvIGFsbCBldmVudHMgZmlyZWQuXG4gICAgb246IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgICBpZiAoIWV2ZW50c0FwaSh0aGlzLCAnb24nLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSB8fCAhY2FsbGJhY2spIHJldHVybiB0aGlzO1xuICAgICAgdGhpcy5fZXZlbnRzIHx8ICh0aGlzLl9ldmVudHMgPSB7fSk7XG4gICAgICB2YXIgZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdIHx8ICh0aGlzLl9ldmVudHNbbmFtZV0gPSBbXSk7XG4gICAgICBldmVudHMucHVzaCh7Y2FsbGJhY2s6IGNhbGxiYWNrLCBjb250ZXh0OiBjb250ZXh0LCBjdHg6IGNvbnRleHQgfHwgdGhpc30pO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8vIEJpbmQgYW4gZXZlbnQgdG8gb25seSBiZSB0cmlnZ2VyZWQgYSBzaW5nbGUgdGltZS4gQWZ0ZXIgdGhlIGZpcnN0IHRpbWVcbiAgICAvLyB0aGUgY2FsbGJhY2sgaXMgaW52b2tlZCwgaXQgd2lsbCBiZSByZW1vdmVkLlxuICAgIG9uY2U6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgICBpZiAoIWV2ZW50c0FwaSh0aGlzLCAnb25jZScsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG4gICAgICB2YXIgc2VsZiA9IHRoaXM7XG4gICAgICB2YXIgb25jZSA9IF8ub25jZShmdW5jdGlvbigpIHtcbiAgICAgICAgc2VsZi5vZmYobmFtZSwgb25jZSk7XG4gICAgICAgIGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9KTtcbiAgICAgIG9uY2UuX2NhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgICByZXR1cm4gdGhpcy5vbihuYW1lLCBvbmNlLCBjb250ZXh0KTtcbiAgICB9LFxuXG4gICAgLy8gUmVtb3ZlIG9uZSBvciBtYW55IGNhbGxiYWNrcy4gSWYgYGNvbnRleHRgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG4gICAgLy8gY2FsbGJhY2tzIHdpdGggdGhhdCBmdW5jdGlvbi4gSWYgYGNhbGxiYWNrYCBpcyBudWxsLCByZW1vdmVzIGFsbFxuICAgIC8vIGNhbGxiYWNrcyBmb3IgdGhlIGV2ZW50LiBJZiBgbmFtZWAgaXMgbnVsbCwgcmVtb3ZlcyBhbGwgYm91bmRcbiAgICAvLyBjYWxsYmFja3MgZm9yIGFsbCBldmVudHMuXG4gICAgb2ZmOiBmdW5jdGlvbihuYW1lLCBjYWxsYmFjaywgY29udGV4dCkge1xuICAgICAgdmFyIHJldGFpbiwgZXYsIGV2ZW50cywgbmFtZXMsIGksIGwsIGosIGs7XG4gICAgICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhZXZlbnRzQXBpKHRoaXMsICdvZmYnLCBuYW1lLCBbY2FsbGJhY2ssIGNvbnRleHRdKSkgcmV0dXJuIHRoaXM7XG4gICAgICBpZiAoIW5hbWUgJiYgIWNhbGxiYWNrICYmICFjb250ZXh0KSB7XG4gICAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgbmFtZXMgPSBuYW1lID8gW25hbWVdIDogXy5rZXlzKHRoaXMuX2V2ZW50cyk7XG4gICAgICBmb3IgKGkgPSAwLCBsID0gbmFtZXMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIG5hbWUgPSBuYW1lc1tpXTtcbiAgICAgICAgaWYgKGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXSkge1xuICAgICAgICAgIHRoaXMuX2V2ZW50c1tuYW1lXSA9IHJldGFpbiA9IFtdO1xuICAgICAgICAgIGlmIChjYWxsYmFjayB8fCBjb250ZXh0KSB7XG4gICAgICAgICAgICBmb3IgKGogPSAwLCBrID0gZXZlbnRzLmxlbmd0aDsgaiA8IGs7IGorKykge1xuICAgICAgICAgICAgICBldiA9IGV2ZW50c1tqXTtcbiAgICAgICAgICAgICAgaWYgKChjYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2sgJiYgY2FsbGJhY2sgIT09IGV2LmNhbGxiYWNrLl9jYWxsYmFjaykgfHxcbiAgICAgICAgICAgICAgICAgIChjb250ZXh0ICYmIGNvbnRleHQgIT09IGV2LmNvbnRleHQpKSB7XG4gICAgICAgICAgICAgICAgcmV0YWluLnB1c2goZXYpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghcmV0YWluLmxlbmd0aCkgZGVsZXRlIHRoaXMuX2V2ZW50c1tuYW1lXTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLy8gVHJpZ2dlciBvbmUgb3IgbWFueSBldmVudHMsIGZpcmluZyBhbGwgYm91bmQgY2FsbGJhY2tzLiBDYWxsYmFja3MgYXJlXG4gICAgLy8gcGFzc2VkIHRoZSBzYW1lIGFyZ3VtZW50cyBhcyBgdHJpZ2dlcmAgaXMsIGFwYXJ0IGZyb20gdGhlIGV2ZW50IG5hbWVcbiAgICAvLyAodW5sZXNzIHlvdSdyZSBsaXN0ZW5pbmcgb24gYFwiYWxsXCJgLCB3aGljaCB3aWxsIGNhdXNlIHlvdXIgY2FsbGJhY2sgdG9cbiAgICAvLyByZWNlaXZlIHRoZSB0cnVlIG5hbWUgb2YgdGhlIGV2ZW50IGFzIHRoZSBmaXJzdCBhcmd1bWVudCkuXG4gICAgdHJpZ2dlcjogZnVuY3Rpb24obmFtZSkge1xuICAgICAgaWYgKCF0aGlzLl9ldmVudHMpIHJldHVybiB0aGlzO1xuICAgICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgICBpZiAoIWV2ZW50c0FwaSh0aGlzLCAndHJpZ2dlcicsIG5hbWUsIGFyZ3MpKSByZXR1cm4gdGhpcztcbiAgICAgIHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV07XG4gICAgICB2YXIgYWxsRXZlbnRzID0gdGhpcy5fZXZlbnRzLmFsbDtcbiAgICAgIGlmIChldmVudHMpIHRyaWdnZXJFdmVudHMoZXZlbnRzLCBhcmdzKTtcbiAgICAgIGlmIChhbGxFdmVudHMpIHRyaWdnZXJFdmVudHMoYWxsRXZlbnRzLCBhcmd1bWVudHMpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfSxcblxuICAgIC8vIFRlbGwgdGhpcyBvYmplY3QgdG8gc3RvcCBsaXN0ZW5pbmcgdG8gZWl0aGVyIHNwZWNpZmljIGV2ZW50cyAuLi4gb3JcbiAgICAvLyB0byBldmVyeSBvYmplY3QgaXQncyBjdXJyZW50bHkgbGlzdGVuaW5nIHRvLlxuICAgIHN0b3BMaXN0ZW5pbmc6IGZ1bmN0aW9uKG9iaiwgbmFtZSwgY2FsbGJhY2spIHtcbiAgICAgIHZhciBsaXN0ZW5lcnMgPSB0aGlzLl9saXN0ZW5lcnM7XG4gICAgICBpZiAoIWxpc3RlbmVycykgcmV0dXJuIHRoaXM7XG4gICAgICB2YXIgZGVsZXRlTGlzdGVuZXIgPSAhbmFtZSAmJiAhY2FsbGJhY2s7XG4gICAgICBpZiAodHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSBjYWxsYmFjayA9IHRoaXM7XG4gICAgICBpZiAob2JqKSAobGlzdGVuZXJzID0ge30pW29iai5fbGlzdGVuZXJJZF0gPSBvYmo7XG4gICAgICBmb3IgKHZhciBpZCBpbiBsaXN0ZW5lcnMpIHtcbiAgICAgICAgbGlzdGVuZXJzW2lkXS5vZmYobmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuICAgICAgICBpZiAoZGVsZXRlTGlzdGVuZXIpIGRlbGV0ZSB0aGlzLl9saXN0ZW5lcnNbaWRdO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfVxuXG4gIH07XG5cbiAgLy8gUmVndWxhciBleHByZXNzaW9uIHVzZWQgdG8gc3BsaXQgZXZlbnQgc3RyaW5ncy5cbiAgdmFyIGV2ZW50U3BsaXR0ZXIgPSAvXFxzKy87XG5cbiAgLy8gSW1wbGVtZW50IGZhbmN5IGZlYXR1cmVzIG9mIHRoZSBFdmVudHMgQVBJIHN1Y2ggYXMgbXVsdGlwbGUgZXZlbnRcbiAgLy8gbmFtZXMgYFwiY2hhbmdlIGJsdXJcImAgYW5kIGpRdWVyeS1zdHlsZSBldmVudCBtYXBzIGB7Y2hhbmdlOiBhY3Rpb259YFxuICAvLyBpbiB0ZXJtcyBvZiB0aGUgZXhpc3RpbmcgQVBJLlxuICB2YXIgZXZlbnRzQXBpID0gZnVuY3Rpb24ob2JqLCBhY3Rpb24sIG5hbWUsIHJlc3QpIHtcbiAgICBpZiAoIW5hbWUpIHJldHVybiB0cnVlO1xuXG4gICAgLy8gSGFuZGxlIGV2ZW50IG1hcHMuXG4gICAgaWYgKHR5cGVvZiBuYW1lID09PSAnb2JqZWN0Jykge1xuICAgICAgZm9yICh2YXIga2V5IGluIG5hbWUpIHtcbiAgICAgICAgb2JqW2FjdGlvbl0uYXBwbHkob2JqLCBba2V5LCBuYW1lW2tleV1dLmNvbmNhdChyZXN0KSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgLy8gSGFuZGxlIHNwYWNlIHNlcGFyYXRlZCBldmVudCBuYW1lcy5cbiAgICBpZiAoZXZlbnRTcGxpdHRlci50ZXN0KG5hbWUpKSB7XG4gICAgICB2YXIgbmFtZXMgPSBuYW1lLnNwbGl0KGV2ZW50U3BsaXR0ZXIpO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgb2JqW2FjdGlvbl0uYXBwbHkob2JqLCBbbmFtZXNbaV1dLmNvbmNhdChyZXN0KSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gQSBkaWZmaWN1bHQtdG8tYmVsaWV2ZSwgYnV0IG9wdGltaXplZCBpbnRlcm5hbCBkaXNwYXRjaCBmdW5jdGlvbiBmb3JcbiAgLy8gdHJpZ2dlcmluZyBldmVudHMuIFRyaWVzIHRvIGtlZXAgdGhlIHVzdWFsIGNhc2VzIHNwZWVkeSAobW9zdCBpbnRlcm5hbFxuICAvLyBCYWNrYm9uZSBldmVudHMgaGF2ZSAzIGFyZ3VtZW50cykuXG4gIHZhciB0cmlnZ2VyRXZlbnRzID0gZnVuY3Rpb24oZXZlbnRzLCBhcmdzKSB7XG4gICAgdmFyIGV2LCBpID0gLTEsIGwgPSBldmVudHMubGVuZ3RoLCBhMSA9IGFyZ3NbMF0sIGEyID0gYXJnc1sxXSwgYTMgPSBhcmdzWzJdO1xuICAgIHN3aXRjaCAoYXJncy5sZW5ndGgpIHtcbiAgICAgIGNhc2UgMDogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgpOyByZXR1cm47XG4gICAgICBjYXNlIDE6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmNhbGwoZXYuY3R4LCBhMSk7IHJldHVybjtcbiAgICAgIGNhc2UgMjogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMik7IHJldHVybjtcbiAgICAgIGNhc2UgMzogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExLCBhMiwgYTMpOyByZXR1cm47XG4gICAgICBkZWZhdWx0OiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5hcHBseShldi5jdHgsIGFyZ3MpO1xuICAgIH1cbiAgfTtcblxuICB2YXIgbGlzdGVuTWV0aG9kcyA9IHtsaXN0ZW5UbzogJ29uJywgbGlzdGVuVG9PbmNlOiAnb25jZSd9O1xuXG4gIC8vIEludmVyc2lvbi1vZi1jb250cm9sIHZlcnNpb25zIG9mIGBvbmAgYW5kIGBvbmNlYC4gVGVsbCAqdGhpcyogb2JqZWN0IHRvXG4gIC8vIGxpc3RlbiB0byBhbiBldmVudCBpbiBhbm90aGVyIG9iamVjdCAuLi4ga2VlcGluZyB0cmFjayBvZiB3aGF0IGl0J3NcbiAgLy8gbGlzdGVuaW5nIHRvLlxuICBfLmVhY2gobGlzdGVuTWV0aG9kcywgZnVuY3Rpb24oaW1wbGVtZW50YXRpb24sIG1ldGhvZCkge1xuICAgIEV2ZW50c1ttZXRob2RdID0gZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuICAgICAgdmFyIGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycyB8fCAodGhpcy5fbGlzdGVuZXJzID0ge30pO1xuICAgICAgdmFyIGlkID0gb2JqLl9saXN0ZW5lcklkIHx8IChvYmouX2xpc3RlbmVySWQgPSBfLnVuaXF1ZUlkKCdsJykpO1xuICAgICAgbGlzdGVuZXJzW2lkXSA9IG9iajtcbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcbiAgICAgIG9ialtpbXBsZW1lbnRhdGlvbl0obmFtZSwgY2FsbGJhY2ssIHRoaXMpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gQWxpYXNlcyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gIEV2ZW50cy5iaW5kICAgPSBFdmVudHMub247XG4gIEV2ZW50cy51bmJpbmQgPSBFdmVudHMub2ZmO1xuXG4gIC8vIE1peGluIHV0aWxpdHlcbiAgRXZlbnRzLm1peGluID0gZnVuY3Rpb24ocHJvdG8pIHtcbiAgICB2YXIgZXhwb3J0cyA9IFsnb24nLCAnb25jZScsICdvZmYnLCAndHJpZ2dlcicsICdzdG9wTGlzdGVuaW5nJywgJ2xpc3RlblRvJyxcbiAgICAgICAgICAgICAgICAgICAnbGlzdGVuVG9PbmNlJywgJ2JpbmQnLCAndW5iaW5kJ107XG4gICAgXy5lYWNoKGV4cG9ydHMsIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHByb3RvW25hbWVdID0gdGhpc1tuYW1lXTtcbiAgICB9LCB0aGlzKTtcbiAgICByZXR1cm4gcHJvdG87XG4gIH07XG5cbiAgLy8gRXhwb3J0IEV2ZW50cyBhcyBCYWNrYm9uZUV2ZW50cyBkZXBlbmRpbmcgb24gY3VycmVudCBjb250ZXh0XG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IEV2ZW50cztcbiAgICB9XG4gICAgZXhwb3J0cy5CYWNrYm9uZUV2ZW50cyA9IEV2ZW50cztcbiAgfWVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09IFwiZnVuY3Rpb25cIiAgJiYgdHlwZW9mIGRlZmluZS5hbWQgPT0gXCJvYmplY3RcIikge1xuICAgIGRlZmluZShmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBFdmVudHM7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5CYWNrYm9uZUV2ZW50cyA9IEV2ZW50cztcbiAgfVxufSkodGhpcyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vYmFja2JvbmUtZXZlbnRzLXN0YW5kYWxvbmUnKTtcbiIsIihmdW5jdGlvbiAoZGVmaW5pdGlvbikge1xuICBpZiAodHlwZW9mIGV4cG9ydHMgPT09IFwib2JqZWN0XCIpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGRlZmluaXRpb24oKTtcbiAgfVxuICBlbHNlIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoZGVmaW5pdGlvbik7XG4gIH1cbiAgZWxzZSB7XG4gICAgd2luZG93LkJhY2tib25lRXh0ZW5kID0gZGVmaW5pdGlvbigpO1xuICB9XG59KShmdW5jdGlvbiAoKSB7XG4gIFwidXNlIHN0cmljdFwiO1xuICBcbiAgLy8gbWluaS11bmRlcnNjb3JlXG4gIHZhciBfID0ge1xuICAgIGhhczogZnVuY3Rpb24gKG9iaiwga2V5KSB7XG4gICAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgICB9LFxuICBcbiAgICBleHRlbmQ6IGZ1bmN0aW9uKG9iaikge1xuICAgICAgZm9yICh2YXIgaT0xOyBpPGFyZ3VtZW50cy5sZW5ndGg7ICsraSkge1xuICAgICAgICB2YXIgc291cmNlID0gYXJndW1lbnRzW2ldO1xuICAgICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgIG9ialtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBvYmo7XG4gICAgfVxuICB9O1xuXG4gIC8vLyBGb2xsb3dpbmcgY29kZSBpcyBwYXN0ZWQgZnJvbSBCYWNrYm9uZS5qcyAvLy9cblxuICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY29ycmVjdGx5IHNldCB1cCB0aGUgcHJvdG90eXBlIGNoYWluLCBmb3Igc3ViY2xhc3Nlcy5cbiAgLy8gU2ltaWxhciB0byBgZ29vZy5pbmhlcml0c2AsIGJ1dCB1c2VzIGEgaGFzaCBvZiBwcm90b3R5cGUgcHJvcGVydGllcyBhbmRcbiAgLy8gY2xhc3MgcHJvcGVydGllcyB0byBiZSBleHRlbmRlZC5cbiAgdmFyIGV4dGVuZCA9IGZ1bmN0aW9uKHByb3RvUHJvcHMsIHN0YXRpY1Byb3BzKSB7XG4gICAgdmFyIHBhcmVudCA9IHRoaXM7XG4gICAgdmFyIGNoaWxkO1xuXG4gICAgLy8gVGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uIGZvciB0aGUgbmV3IHN1YmNsYXNzIGlzIGVpdGhlciBkZWZpbmVkIGJ5IHlvdVxuICAgIC8vICh0aGUgXCJjb25zdHJ1Y3RvclwiIHByb3BlcnR5IGluIHlvdXIgYGV4dGVuZGAgZGVmaW5pdGlvbiksIG9yIGRlZmF1bHRlZFxuICAgIC8vIGJ5IHVzIHRvIHNpbXBseSBjYWxsIHRoZSBwYXJlbnQncyBjb25zdHJ1Y3Rvci5cbiAgICBpZiAocHJvdG9Qcm9wcyAmJiBfLmhhcyhwcm90b1Byb3BzLCAnY29uc3RydWN0b3InKSkge1xuICAgICAgY2hpbGQgPSBwcm90b1Byb3BzLmNvbnN0cnVjdG9yO1xuICAgIH0gZWxzZSB7XG4gICAgICBjaGlsZCA9IGZ1bmN0aW9uKCl7IHJldHVybiBwYXJlbnQuYXBwbHkodGhpcywgYXJndW1lbnRzKTsgfTtcbiAgICB9XG5cbiAgICAvLyBBZGQgc3RhdGljIHByb3BlcnRpZXMgdG8gdGhlIGNvbnN0cnVjdG9yIGZ1bmN0aW9uLCBpZiBzdXBwbGllZC5cbiAgICBfLmV4dGVuZChjaGlsZCwgcGFyZW50LCBzdGF0aWNQcm9wcyk7XG5cbiAgICAvLyBTZXQgdGhlIHByb3RvdHlwZSBjaGFpbiB0byBpbmhlcml0IGZyb20gYHBhcmVudGAsIHdpdGhvdXQgY2FsbGluZ1xuICAgIC8vIGBwYXJlbnRgJ3MgY29uc3RydWN0b3IgZnVuY3Rpb24uXG4gICAgdmFyIFN1cnJvZ2F0ZSA9IGZ1bmN0aW9uKCl7IHRoaXMuY29uc3RydWN0b3IgPSBjaGlsZDsgfTtcbiAgICBTdXJyb2dhdGUucHJvdG90eXBlID0gcGFyZW50LnByb3RvdHlwZTtcbiAgICBjaGlsZC5wcm90b3R5cGUgPSBuZXcgU3Vycm9nYXRlKCk7XG5cbiAgICAvLyBBZGQgcHJvdG90eXBlIHByb3BlcnRpZXMgKGluc3RhbmNlIHByb3BlcnRpZXMpIHRvIHRoZSBzdWJjbGFzcyxcbiAgICAvLyBpZiBzdXBwbGllZC5cbiAgICBpZiAocHJvdG9Qcm9wcykgXy5leHRlbmQoY2hpbGQucHJvdG90eXBlLCBwcm90b1Byb3BzKTtcblxuICAgIC8vIFNldCBhIGNvbnZlbmllbmNlIHByb3BlcnR5IGluIGNhc2UgdGhlIHBhcmVudCdzIHByb3RvdHlwZSBpcyBuZWVkZWRcbiAgICAvLyBsYXRlci5cbiAgICBjaGlsZC5fX3N1cGVyX18gPSBwYXJlbnQucHJvdG90eXBlO1xuXG4gICAgcmV0dXJuIGNoaWxkO1xuICB9O1xuXG4gIC8vIEV4cG9zZSB0aGUgZXh0ZW5kIGZ1bmN0aW9uXG4gIHJldHVybiBleHRlbmQ7XG59KTtcbiIsIi8vIHNoaW0gZm9yIHVzaW5nIHByb2Nlc3MgaW4gYnJvd3NlclxuXG52YXIgcHJvY2VzcyA9IG1vZHVsZS5leHBvcnRzID0ge307XG52YXIgcXVldWUgPSBbXTtcbnZhciBkcmFpbmluZyA9IGZhbHNlO1xuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGRyYWluaW5nID0gdHJ1ZTtcbiAgICB2YXIgY3VycmVudFF1ZXVlO1xuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB2YXIgaSA9IC0xO1xuICAgICAgICB3aGlsZSAoKytpIDwgbGVuKSB7XG4gICAgICAgICAgICBjdXJyZW50UXVldWVbaV0oKTtcbiAgICAgICAgfVxuICAgICAgICBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgfVxuICAgIGRyYWluaW5nID0gZmFsc2U7XG59XG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHF1ZXVlLnB1c2goZnVuKTtcbiAgICBpZiAoIWRyYWluaW5nKSB7XG4gICAgICAgIHNldFRpbWVvdXQoZHJhaW5RdWV1ZSwgMCk7XG4gICAgfVxufTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbnByb2Nlc3MudW1hc2sgPSBmdW5jdGlvbigpIHsgcmV0dXJuIDA7IH07XG4iLCIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgMjAxNSBUaGUgSW5jcmVtZW50YWwgRE9NIEF1dGhvcnMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUy1JU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG52YXIgcGF0Y2ggPSByZXF1aXJlKCcuL3NyYy9wYXRjaCcpLnBhdGNoO1xudmFyIGVsZW1lbnRzID0gcmVxdWlyZSgnLi9zcmMvdmlydHVhbF9lbGVtZW50cycpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgcGF0Y2g6IHBhdGNoLFxuICBlbGVtZW50Vm9pZDogZWxlbWVudHMuZWxlbWVudFZvaWQsXG4gIGVsZW1lbnRPcGVuU3RhcnQ6IGVsZW1lbnRzLmVsZW1lbnRPcGVuU3RhcnQsXG4gIGVsZW1lbnRPcGVuRW5kOiBlbGVtZW50cy5lbGVtZW50T3BlbkVuZCxcbiAgZWxlbWVudE9wZW46IGVsZW1lbnRzLmVsZW1lbnRPcGVuLFxuICBlbGVtZW50Q2xvc2U6IGVsZW1lbnRzLmVsZW1lbnRDbG9zZSxcbiAgdGV4dDogZWxlbWVudHMudGV4dCxcbiAgYXR0cjogZWxlbWVudHMuYXR0clxufTtcblxuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNSBUaGUgSW5jcmVtZW50YWwgRE9NIEF1dGhvcnMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUy1JU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG52YXIgbm9kZXMgPSByZXF1aXJlKCcuL25vZGVzJyksXG4gICAgY3JlYXRlTm9kZSA9IG5vZGVzLmNyZWF0ZU5vZGUsXG4gICAgZ2V0S2V5ID0gbm9kZXMuZ2V0S2V5LFxuICAgIGdldE5vZGVOYW1lID0gbm9kZXMuZ2V0Tm9kZU5hbWUsXG4gICAgZ2V0Q2hpbGQgPSBub2Rlcy5nZXRDaGlsZCxcbiAgICByZWdpc3RlckNoaWxkID0gbm9kZXMucmVnaXN0ZXJDaGlsZDtcbnZhciBtYXJrVmlzaXRlZCA9IHJlcXVpcmUoJy4vdHJhdmVyc2FsJykubWFya1Zpc2l0ZWQ7XG52YXIgZ2V0V2Fsa2VyID0gcmVxdWlyZSgnLi93YWxrZXInKS5nZXRXYWxrZXI7XG5cblxuLyoqXG4gKiBDaGVja3Mgd2hldGhlciBvciBub3QgYSBnaXZlbiBub2RlIG1hdGNoZXMgdGhlIHNwZWNpZmllZCBub2RlTmFtZSBhbmQga2V5LlxuICpcbiAqIEBwYXJhbSB7P05vZGV9IG5vZGUgQW4gSFRNTCBub2RlLCB0eXBpY2FsbHkgYW4gSFRNTEVsZW1lbnQgb3IgVGV4dC5cbiAqIEBwYXJhbSB7P3N0cmluZ30gbm9kZU5hbWUgVGhlIG5vZGVOYW1lIGZvciB0aGlzIG5vZGUuXG4gKiBAcGFyYW0gez9zdHJpbmd9IGtleSBBbiBvcHRpb25hbCBrZXkgdGhhdCBpZGVudGlmaWVzIGEgbm9kZS5cbiAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIG5vZGUgbWF0Y2hlcywgZmFsc2Ugb3RoZXJ3aXNlLlxuICovXG52YXIgbWF0Y2hlcyA9IGZ1bmN0aW9uKG5vZGUsIG5vZGVOYW1lLCBrZXkpIHtcbiAgcmV0dXJuIG5vZGUgJiZcbiAgICAgICAgIGtleSA9PT0gZ2V0S2V5KG5vZGUpICYmXG4gICAgICAgICBub2RlTmFtZSA9PT0gZ2V0Tm9kZU5hbWUobm9kZSk7XG59O1xuXG5cbi8qKlxuICogQWxpZ25zIHRoZSB2aXJ0dWFsIEVsZW1lbnQgZGVmaW5pdGlvbiB3aXRoIHRoZSBhY3R1YWwgRE9NLCBtb3ZpbmcgdGhlXG4gKiBjb3JyZXNwb25kaW5nIERPTSBub2RlIHRvIHRoZSBjb3JyZWN0IGxvY2F0aW9uIG9yIGNyZWF0aW5nIGl0IGlmIG5lY2Vzc2FyeS5cbiAqIEBwYXJhbSB7P3N0cmluZ30gbm9kZU5hbWUgRm9yIGFuIEVsZW1lbnQsIHRoaXMgc2hvdWxkIGJlIGEgdmFsaWQgdGFnIHN0cmluZy5cbiAqICAgICBGb3IgYSBUZXh0LCB0aGlzIHNob3VsZCBiZSAjdGV4dC5cbiAqIEBwYXJhbSB7P3N0cmluZ30ga2V5IFRoZSBrZXkgdXNlZCB0byBpZGVudGlmeSB0aGlzIGVsZW1lbnQuXG4gKiBAcGFyYW0gez9BcnJheTwqPnxzdHJpbmd9IHN0YXRpY3MgRm9yIGFuIEVsZW1lbnQsIHRoaXMgc2hvdWxkIGJlIGFuIGFycmF5IG9mXG4gKiAgICAgbmFtZS12YWx1ZSBwYWlycy4gRm9yIGEgVGV4dCwgdGhpcyBzaG91bGQgYmUgdGhlIHRleHQgY29udGVudCBvZiB0aGVcbiAqICAgICBub2RlLlxuICogQHJldHVybiB7IU5vZGV9IFRoZSBtYXRjaGluZyBub2RlLlxuICovXG52YXIgYWxpZ25XaXRoRE9NID0gZnVuY3Rpb24obm9kZU5hbWUsIGtleSwgc3RhdGljcykge1xuICB2YXIgd2Fsa2VyID0gZ2V0V2Fsa2VyKCk7XG4gIHZhciBjdXJyZW50Tm9kZSA9IHdhbGtlci5jdXJyZW50Tm9kZTtcbiAgdmFyIHBhcmVudCA9IHdhbGtlci5nZXRDdXJyZW50UGFyZW50KCk7XG4gIHZhciBtYXRjaGluZ05vZGU7XG5cbiAgLy8gQ2hlY2sgdG8gc2VlIGlmIHdlIGhhdmUgYSBub2RlIHRvIHJldXNlXG4gIGlmIChtYXRjaGVzKGN1cnJlbnROb2RlLCBub2RlTmFtZSwga2V5KSkge1xuICAgIG1hdGNoaW5nTm9kZSA9IGN1cnJlbnROb2RlO1xuICB9IGVsc2Uge1xuICAgIHZhciBleGlzdGluZ05vZGUgPSBrZXkgJiYgZ2V0Q2hpbGQocGFyZW50LCBrZXkpO1xuXG4gICAgLy8gQ2hlY2sgdG8gc2VlIGlmIHRoZSBub2RlIGhhcyBtb3ZlZCB3aXRoaW4gdGhlIHBhcmVudCBvciBpZiBhIG5ldyBvbmVcbiAgICAvLyBzaG91bGQgYmUgY3JlYXRlZFxuICAgIGlmIChleGlzdGluZ05vZGUpIHtcbiAgICAgIG1hdGNoaW5nTm9kZSA9IGV4aXN0aW5nTm9kZTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWF0Y2hpbmdOb2RlID0gY3JlYXRlTm9kZSh3YWxrZXIuZG9jLCBub2RlTmFtZSwga2V5LCBzdGF0aWNzKTtcbiAgICAgIHJlZ2lzdGVyQ2hpbGQocGFyZW50LCBrZXksIG1hdGNoaW5nTm9kZSk7XG4gICAgfVxuXG4gICAgcGFyZW50Lmluc2VydEJlZm9yZShtYXRjaGluZ05vZGUsIGN1cnJlbnROb2RlKTtcbiAgICB3YWxrZXIuY3VycmVudE5vZGUgPSBtYXRjaGluZ05vZGU7XG4gIH1cblxuICBtYXJrVmlzaXRlZChwYXJlbnQsIG1hdGNoaW5nTm9kZSk7XG5cbiAgcmV0dXJuIG1hdGNoaW5nTm9kZTtcbn07XG5cblxuLyoqICovXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgYWxpZ25XaXRoRE9NOiBhbGlnbldpdGhET01cbn07XG5cbiIsIi8qKlxuICogQ29weXJpZ2h0IDIwMTUgVGhlIEluY3JlbWVudGFsIERPTSBBdXRob3JzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMtSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxudmFyIGdldERhdGEgPSByZXF1aXJlKCcuL25vZGVfZGF0YScpLmdldERhdGE7XG5cblxuLyoqXG4gKiBBcHBsaWVzIGFuIGF0dHJpYnV0ZSBvciBwcm9wZXJ0eSB0byBhIGdpdmVuIEVsZW1lbnQuIElmIHRoZSB2YWx1ZSBpcyBhIG9iamVjdFxuICogb3IgYSBmdW5jdGlvbiAod2hpY2ggaW5jbHVkZXMgbnVsbCksIGl0IGlzIHNldCBhcyBhIHByb3BlcnR5IG9uIHRoZSBFbGVtZW50LlxuICogT3RoZXJ3aXNlLCB0aGUgdmFsdWUgaXMgc2V0IGFzIGFuIGF0dHJpYnV0ZS5cbiAqIEBwYXJhbSB7IUVsZW1lbnR9IGVsXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSBUaGUgYXR0cmlidXRlJ3MgbmFtZS5cbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIGF0dHJpYnV0ZSdzIHZhbHVlLiBJZiB0aGUgdmFsdWUgaXMgYSBzdHJpbmcsIGl0IGlzIHNldFxuICogICAgIGFzIGFuIEhUTUwgYXR0cmlidXRlLCBvdGhlcndpc2UsIGl0IGlzIHNldCBvbiBub2RlLlxuICovXG52YXIgYXBwbHlBdHRyID0gZnVuY3Rpb24oZWwsIG5hbWUsIHZhbHVlKSB7XG4gIHZhciBkYXRhID0gZ2V0RGF0YShlbCk7XG4gIHZhciBhdHRycyA9IGRhdGEuYXR0cnM7XG5cbiAgaWYgKGF0dHJzW25hbWVdID09PSB2YWx1ZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciB0eXBlID0gdHlwZW9mIHZhbHVlO1xuXG4gIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgZWwucmVtb3ZlQXR0cmlidXRlKG5hbWUpO1xuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnIHx8IHR5cGUgPT09ICdmdW5jdGlvbicpIHtcbiAgICBlbFtuYW1lXSA9IHZhbHVlO1xuICB9IGVsc2Uge1xuICAgIGVsLnNldEF0dHJpYnV0ZShuYW1lLCB2YWx1ZSk7XG4gIH1cblxuICBhdHRyc1tuYW1lXSA9IHZhbHVlO1xufTtcblxuXG4vKipcbiAqIEFwcGxpZXMgYSBzdHlsZSB0byBhbiBFbGVtZW50LiBObyB2ZW5kb3IgcHJlZml4IGV4cGFuc2lvbiBpcyBkb25lIGZvclxuICogcHJvcGVydHkgbmFtZXMvdmFsdWVzLlxuICogQHBhcmFtIHshRWxlbWVudH0gZWxcbiAqIEBwYXJhbSB7c3RyaW5nfE9iamVjdDxzdHJpbmcsc3RyaW5nPn0gc3R5bGUgVGhlIHN0eWxlIHRvIHNldC4gRWl0aGVyIGEgc3RyaW5nXG4gKiAgICAgb2YgY3NzIG9yIGFuIG9iamVjdCBjb250YWluaW5nIHByb3BlcnR5LXZhbHVlIHBhaXJzLlxuICovXG52YXIgYXBwbHlTdHlsZSA9IGZ1bmN0aW9uKGVsLCBzdHlsZSkge1xuICBpZiAodHlwZW9mIHN0eWxlID09PSAnc3RyaW5nJyB8fCBzdHlsZSBpbnN0YW5jZW9mIFN0cmluZykge1xuICAgIGVsLnN0eWxlLmNzc1RleHQgPSBzdHlsZTtcbiAgfSBlbHNlIHtcbiAgICBlbC5zdHlsZS5jc3NUZXh0ID0gJyc7XG5cbiAgICBmb3IgKHZhciBwcm9wIGluIHN0eWxlKSB7XG4gICAgICBlbC5zdHlsZVtwcm9wXSA9IHN0eWxlW3Byb3BdO1xuICAgIH1cbiAgfVxufTtcblxuXG4vKipcbiAqIFVwZGF0ZXMgYSBzaW5nbGUgYXR0cmlidXRlIG9uIGFuIEVsZW1lbnQuIEZvciBzb21lIHR5cGVzIChlLmcuIGlkIG9yIGNsYXNzKSxcbiAqIHRoZSB2YWx1ZSBpcyBhcHBsaWVkIGRpcmVjdGx5IHRvIHRoZSBFbGVtZW50IHVzaW5nIHRoZSBjb3JyZXNwb25kaW5nIGFjY2Vzc29yXG4gKiBmdW5jdGlvbi5cbiAqIEBwYXJhbSB7IUVsZW1lbnR9IGVsXG4gKiBAcGFyYW0ge3N0cmluZ30gbmFtZSBUaGUgYXR0cmlidXRlJ3MgbmFtZS5cbiAqIEBwYXJhbSB7Kn0gdmFsdWUgVGhlIGF0dHJpYnV0ZSdzIHZhbHVlLiBJZiB0aGUgdmFsdWUgaXMgYSBzdHJpbmcsIGl0IGlzIHNldFxuICogICAgIGFzIGFuIEhUTUwgYXR0cmlidXRlLCBvdGhlcndpc2UsIGl0IGlzIHNldCBvbiBub2RlLlxuICovXG52YXIgdXBkYXRlQXR0cmlidXRlID0gZnVuY3Rpb24oZWwsIG5hbWUsIHZhbHVlKSB7XG4gIHN3aXRjaCAobmFtZSkge1xuICAgIGNhc2UgJ2lkJzpcbiAgICAgIGVsLmlkID0gdmFsdWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdjbGFzcyc6XG4gICAgICBlbC5jbGFzc05hbWUgPSB2YWx1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJ3RhYmluZGV4JzpcbiAgICAgIGVsLnRhYkluZGV4ID0gdmFsdWU7XG4gICAgICBicmVhaztcbiAgICBjYXNlICdzdHlsZSc6XG4gICAgICBhcHBseVN0eWxlKGVsLCB2YWx1ZSk7XG4gICAgICBicmVhaztcbiAgICBkZWZhdWx0OlxuICAgICAgYXBwbHlBdHRyKGVsLCBuYW1lLCB2YWx1ZSk7XG4gICAgICBicmVhaztcbiAgfVxufTtcblxuXG4vKiogKi9cbm1vZHVsZS5leHBvcnRzID0ge1xuICB1cGRhdGVBdHRyaWJ1dGU6IHVwZGF0ZUF0dHJpYnV0ZVxufTtcblxuIiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNSBUaGUgSW5jcmVtZW50YWwgRE9NIEF1dGhvcnMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUy1JU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG5cbi8qKlxuICogS2VlcHMgdHJhY2sgb2YgaW5mb3JtYXRpb24gbmVlZGVkIHRvIHBlcmZvcm0gZGlmZnMgZm9yIGEgZ2l2ZW4gRE9NIG5vZGUuXG4gKiBAcGFyYW0gez9zdHJpbmd9IG5vZGVOYW1lXG4gKiBAcGFyYW0gez9zdHJpbmd9IGtleVxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIE5vZGVEYXRhKG5vZGVOYW1lLCBrZXkpIHtcbiAgLyoqXG4gICAqIFRoZSBhdHRyaWJ1dGVzIGFuZCB0aGVpciB2YWx1ZXMuXG4gICAqIEBjb25zdFxuICAgKi9cbiAgdGhpcy5hdHRycyA9IHt9O1xuXG4gIC8qKlxuICAgKiBBbiBhcnJheSBvZiBhdHRyaWJ1dGUgbmFtZS92YWx1ZSBwYWlycywgdXNlZCBmb3IgcXVpY2tseSBkaWZmaW5nIHRoZVxuICAgKiBpbmNvbW1pbmcgYXR0cmlidXRlcyB0byBzZWUgaWYgdGhlIERPTSBub2RlJ3MgYXR0cmlidXRlcyBuZWVkIHRvIGJlXG4gICAqIHVwZGF0ZWQuXG4gICAqIEBjb25zdCB7QXJyYXk8Kj59XG4gICAqL1xuICB0aGlzLmF0dHJzQXJyID0gW107XG5cbiAgLyoqXG4gICAqIFRoZSBpbmNvbWluZyBhdHRyaWJ1dGVzIGZvciB0aGlzIE5vZGUsIGJlZm9yZSB0aGV5IGFyZSB1cGRhdGVkLlxuICAgKiBAY29uc3QgeyFPYmplY3Q8c3RyaW5nLCAqPn1cbiAgICovXG4gIHRoaXMubmV3QXR0cnMgPSB7fTtcblxuICAvKipcbiAgICogVGhlIGtleSB1c2VkIHRvIGlkZW50aWZ5IHRoaXMgbm9kZSwgdXNlZCB0byBwcmVzZXJ2ZSBET00gbm9kZXMgd2hlbiB0aGV5XG4gICAqIG1vdmUgd2l0aGluIHRoZWlyIHBhcmVudC5cbiAgICogQGNvbnN0XG4gICAqL1xuICB0aGlzLmtleSA9IGtleTtcblxuICAvKipcbiAgICogS2VlcHMgdHJhY2sgb2YgY2hpbGRyZW4gd2l0aGluIHRoaXMgbm9kZSBieSB0aGVpciBrZXkuXG4gICAqIHs/T2JqZWN0PHN0cmluZywgTm9kZT59XG4gICAqL1xuICB0aGlzLmtleU1hcCA9IG51bGw7XG5cbiAgLyoqXG4gICAqIFRoZSBsYXN0IGNoaWxkIHRvIGhhdmUgYmVlbiB2aXNpdGVkIHdpdGhpbiB0aGUgY3VycmVudCBwYXNzLlxuICAgKiB7P05vZGV9XG4gICAqL1xuICB0aGlzLmxhc3RWaXNpdGVkQ2hpbGQgPSBudWxsO1xuXG4gIC8qKlxuICAgKiBUaGUgbm9kZSBuYW1lIGZvciB0aGlzIG5vZGUuXG4gICAqIEBjb25zdFxuICAgKi9cbiAgdGhpcy5ub2RlTmFtZSA9IG5vZGVOYW1lO1xuXG4gIC8qKlxuICAgKiBAY29uc3Qge3N0cmluZ31cbiAgICovXG4gIHRoaXMudGV4dCA9IG51bGw7XG59XG5cblxuLyoqXG4gKiBJbml0aWFsaXplcyBhIE5vZGVEYXRhIG9iamVjdCBmb3IgYSBOb2RlLlxuICpcbiAqIEBwYXJhbSB7IU5vZGV9IG5vZGUgVGhlIG5vZGUgdG8gaW5pdGlhbHplIGRhdGEgZm9yLlxuICogQHBhcmFtIHtzdHJpbmd9IG5vZGVOYW1lIFRoZSBub2RlIG5hbWUgb2Ygbm9kZS5cbiAqIEBwYXJhbSB7P3N0cmluZ30ga2V5IFRoZSBrZXkgdGhhdCBpZGVudGlmaWVzIHRoZSBub2RlLlxuICogQHJldHVybiB7IU5vZGVEYXRhfSBUaGUgbmV3bHkgaW5pdGlhbGl6ZWQgZGF0YSBvYmplY3RcbiAqL1xudmFyIGluaXREYXRhID0gZnVuY3Rpb24obm9kZSwgbm9kZU5hbWUsIGtleSkge1xuICB2YXIgZGF0YSA9IG5ldyBOb2RlRGF0YShub2RlTmFtZSwga2V5KTtcbiAgbm9kZVsnX19pbmNyZW1lbnRhbERPTURhdGEnXSA9IGRhdGE7XG4gIHJldHVybiBkYXRhO1xufTtcblxuXG4vKipcbiAqIFJldHJpZXZlcyB0aGUgTm9kZURhdGEgb2JqZWN0IGZvciBhIE5vZGUsIGNyZWF0aW5nIGl0IGlmIG5lY2Vzc2FyeS5cbiAqXG4gKiBAcGFyYW0geyFOb2RlfSBub2RlIFRoZSBub2RlIHRvIHJldHJpZXZlIHRoZSBkYXRhIGZvci5cbiAqIEByZXR1cm4ge05vZGVEYXRhfSBUaGUgTm9kZURhdGEgZm9yIHRoaXMgTm9kZS5cbiAqL1xudmFyIGdldERhdGEgPSBmdW5jdGlvbihub2RlKSB7XG4gIHZhciBkYXRhID0gbm9kZVsnX19pbmNyZW1lbnRhbERPTURhdGEnXTtcblxuICBpZiAoIWRhdGEpIHtcbiAgICB2YXIgbm9kZU5hbWUgPSBub2RlLm5vZGVOYW1lLnRvTG93ZXJDYXNlKCk7XG4gICAgdmFyIGtleSA9IG51bGw7XG5cbiAgICBpZiAobm9kZSBpbnN0YW5jZW9mIEVsZW1lbnQpIHtcbiAgICAgIGtleSA9IG5vZGUuZ2V0QXR0cmlidXRlKCdrZXknKTtcbiAgICB9XG5cbiAgICBkYXRhID0gaW5pdERhdGEobm9kZSwgbm9kZU5hbWUsIGtleSk7XG4gIH1cblxuICByZXR1cm4gZGF0YTtcbn07XG5cblxuLyoqICovXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZ2V0RGF0YTogZ2V0RGF0YSxcbiAgaW5pdERhdGE6IGluaXREYXRhXG59O1xuXG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE1IFRoZSBJbmNyZW1lbnRhbCBET00gQXV0aG9ycy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTLUlTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbnZhciB1cGRhdGVBdHRyaWJ1dGUgPSByZXF1aXJlKCcuL2F0dHJpYnV0ZXMnKS51cGRhdGVBdHRyaWJ1dGU7XG52YXIgbm9kZURhdGEgPSByZXF1aXJlKCcuL25vZGVfZGF0YScpLFxuICAgIGdldERhdGEgPSBub2RlRGF0YS5nZXREYXRhLFxuICAgIGluaXREYXRhID0gbm9kZURhdGEuaW5pdERhdGE7XG5cblxuLyoqXG4gKiBDcmVhdGVzIGFuIEVsZW1lbnQuXG4gKiBAcGFyYW0geyFEb2N1bWVudH0gZG9jIFRoZSBkb2N1bWVudCB3aXRoIHdoaWNoIHRvIGNyZWF0ZSB0aGUgRWxlbWVudC5cbiAqIEBwYXJhbSB7c3RyaW5nfSB0YWcgVGhlIHRhZyBmb3IgdGhlIEVsZW1lbnQuXG4gKiBAcGFyYW0gez9zdHJpbmd9IGtleSBBIGtleSB0byBpZGVudGlmeSB0aGUgRWxlbWVudC5cbiAqIEBwYXJhbSB7P0FycmF5PCo+fSBzdGF0aWNzIEFuIGFycmF5IG9mIGF0dHJpYnV0ZSBuYW1lL3ZhbHVlIHBhaXJzIG9mXG4gKiAgICAgdGhlIHN0YXRpYyBhdHRyaWJ1dGVzIGZvciB0aGUgRWxlbWVudC5cbiAqIEByZXR1cm4geyFFbGVtZW50fVxuICovXG52YXIgY3JlYXRlRWxlbWVudCA9IGZ1bmN0aW9uKGRvYywgdGFnLCBrZXksIHN0YXRpY3MpIHtcbiAgdmFyIGVsID0gZG9jLmNyZWF0ZUVsZW1lbnQodGFnKTtcbiAgaW5pdERhdGEoZWwsIHRhZywga2V5KTtcblxuICBpZiAoc3RhdGljcykge1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgc3RhdGljcy5sZW5ndGg7IGkgKz0gMikge1xuICAgICAgdXBkYXRlQXR0cmlidXRlKGVsLCBzdGF0aWNzW2ldLCBzdGF0aWNzW2kgKyAxXSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGVsO1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgVGV4dC5cbiAqIEBwYXJhbSB7IURvY3VtZW50fSBkb2MgVGhlIGRvY3VtZW50IHdpdGggd2hpY2ggdG8gY3JlYXRlIHRoZSBUZXh0LlxuICogQHBhcmFtIHtzdHJpbmd9IHRleHQgVGhlIGludGlhbCBjb250ZW50IG9mIHRoZSBUZXh0LlxuICogQHJldHVybiB7IVRleHR9XG4gKi9cbnZhciBjcmVhdGVUZXh0Tm9kZSA9IGZ1bmN0aW9uKGRvYywgdGV4dCkge1xuICB2YXIgbm9kZSA9IGRvYy5jcmVhdGVUZXh0Tm9kZSh0ZXh0KTtcbiAgZ2V0RGF0YShub2RlKS50ZXh0ID0gdGV4dDtcblxuICByZXR1cm4gbm9kZTtcbn07XG5cblxuLyoqXG4gKiBDcmVhdGVzIGEgTm9kZSwgZWl0aGVyIGEgVGV4dCBvciBhbiBFbGVtZW50IGRlcGVuZGluZyBvbiB0aGUgbm9kZSBuYW1lXG4gKiBwcm92aWRlZC5cbiAqIEBwYXJhbSB7IURvY3VtZW50fSBkb2MgVGhlIGRvY3VtZW50IHdpdGggd2hpY2ggdG8gY3JlYXRlIHRoZSBOb2RlLlxuICogQHBhcmFtIHtzdHJpbmd9IG5vZGVOYW1lIFRoZSB0YWcgaWYgY3JlYXRpbmcgYW4gZWxlbWVudCBvciAjdGV4dCB0byBjcmVhdGVcbiAqICAgICBhIFRleHQuXG4gKiBAcGFyYW0gez9zdHJpbmd9IGtleSBBIGtleSB0byBpZGVudGlmeSB0aGUgRWxlbWVudC5cbiAqIEBwYXJhbSB7P0FycmF5PCo+fHN0cmluZ30gc3RhdGljcyBUaGUgc3RhdGljIGRhdGEgdG8gaW5pdGlhbGl6ZSB0aGUgTm9kZVxuICogICAgIHdpdGguIEZvciBhbiBFbGVtZW50LCBhbiBhcnJheSBvZiBhdHRyaWJ1dGUgbmFtZS92YWx1ZSBwYWlycyBvZlxuICogICAgIHRoZSBzdGF0aWMgYXR0cmlidXRlcyBmb3IgdGhlIEVsZW1lbnQuIEZvciBhIFRleHQsIGEgc3RyaW5nIHdpdGggdGhlXG4gKiAgICAgaW50aWFsIGNvbnRlbnQgb2YgdGhlIFRleHQuXG4gKiBAcmV0dXJuIHshTm9kZX1cbiAqL1xudmFyIGNyZWF0ZU5vZGUgPSBmdW5jdGlvbihkb2MsIG5vZGVOYW1lLCBrZXksIHN0YXRpY3MpIHtcbiAgaWYgKG5vZGVOYW1lID09PSAnI3RleHQnKSB7XG4gICAgcmV0dXJuIGNyZWF0ZVRleHROb2RlKGRvYywgc3RhdGljcyk7XG4gIH1cblxuICByZXR1cm4gY3JlYXRlRWxlbWVudChkb2MsIG5vZGVOYW1lLCBrZXksIHN0YXRpY3MpO1xufTtcblxuXG4vKipcbiAqIENyZWF0ZXMgYSBtYXBwaW5nIHRoYXQgY2FuIGJlIHVzZWQgdG8gbG9vayB1cCBjaGlsZHJlbiB1c2luZyBhIGtleS5cbiAqIEBwYXJhbSB7IUVsZW1lbnR9IGVsXG4gKiBAcmV0dXJuIHshT2JqZWN0PHN0cmluZywgIU5vZGU+fSBBIG1hcHBpbmcgb2Yga2V5cyB0byB0aGUgY2hpbGRyZW4gb2YgdGhlXG4gKiAgICAgRWxlbWVudC5cbiAqL1xudmFyIGNyZWF0ZUtleU1hcCA9IGZ1bmN0aW9uKGVsKSB7XG4gIHZhciBtYXAgPSB7fTtcbiAgdmFyIGNoaWxkcmVuID0gZWwuY2hpbGRyZW47XG4gIHZhciBjb3VudCA9IGNoaWxkcmVuLmxlbmd0aDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGNvdW50OyBpICs9IDEpIHtcbiAgICB2YXIgY2hpbGQgPSBjaGlsZHJlbltpXTtcbiAgICB2YXIga2V5ID0gZ2V0S2V5KGNoaWxkKTtcblxuICAgIGlmIChrZXkpIHtcbiAgICAgIG1hcFtrZXldID0gY2hpbGQ7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG1hcDtcbn07XG5cblxuLyoqXG4gKiBAcGFyYW0gez9Ob2RlfSBub2RlIEEgbm9kZSB0byBnZXQgdGhlIGtleSBmb3IuXG4gKiBAcmV0dXJuIHs/c3RyaW5nfSBUaGUga2V5IGZvciB0aGUgTm9kZSwgaWYgYXBwbGljYWJsZS5cbiAqL1xudmFyIGdldEtleSA9IGZ1bmN0aW9uKG5vZGUpIHtcbiAgcmV0dXJuIGdldERhdGEobm9kZSkua2V5O1xufTtcblxuXG4vKipcbiAqIEBwYXJhbSB7P05vZGV9IG5vZGUgQSBub2RlIHRvIGdldCB0aGUgbm9kZSBuYW1lIGZvci5cbiAqIEByZXR1cm4gez9zdHJpbmd9IFRoZSBub2RlIG5hbWUgZm9yIHRoZSBOb2RlLCBpZiBhcHBsaWNhYmxlLlxuICovXG52YXIgZ2V0Tm9kZU5hbWUgPSBmdW5jdGlvbihub2RlKSB7XG4gIHJldHVybiBnZXREYXRhKG5vZGUpLm5vZGVOYW1lO1xufTtcblxuXG4vKipcbiAqIFJldHJpZXZlcyB0aGUgbWFwcGluZyBvZiBrZXkgdG8gY2hpbGQgbm9kZSBmb3IgYSBnaXZlbiBFbGVtZW50LCBjcmVhdGluZyBpdFxuICogaWYgbmVjZXNzYXJ5LlxuICogQHBhcmFtIHshRWxlbWVudH0gZWxcbiAqIEByZXR1cm4geyFPYmplY3Q8c3RyaW5nLCFOb2RlPn0gQSBtYXBwaW5nIG9mIGtleXMgdG8gY2hpbGQgTm9kZXNcbiAqL1xudmFyIGdldEtleU1hcCA9IGZ1bmN0aW9uKGVsKSB7XG4gIHZhciBkYXRhID0gZ2V0RGF0YShlbCk7XG5cbiAgaWYgKCFkYXRhLmtleU1hcCkge1xuICAgIGRhdGEua2V5TWFwID0gY3JlYXRlS2V5TWFwKGVsKTtcbiAgfVxuXG4gIHJldHVybiBkYXRhLmtleU1hcDtcbn07XG5cblxuLyoqXG4gKiBSZXRyaWV2ZXMgYSBjaGlsZCBmcm9tIHRoZSBwYXJlbnQgd2l0aCB0aGUgZ2l2ZW4ga2V5LlxuICogQHBhcmFtIHshRWxlbWVudH0gcGFyZW50XG4gKiBAcGFyYW0gez9zdHJpbmd9IGtleVxuICogQHJldHVybiB7P05vZGV9IFRoZSBjaGlsZCBjb3JyZXNwb25kaW5nIHRvIHRoZSBrZXkuXG4gKi9cbnZhciBnZXRDaGlsZCA9IGZ1bmN0aW9uKHBhcmVudCwga2V5KSB7XG4gIHJldHVybiBnZXRLZXlNYXAocGFyZW50KVtrZXldO1xufTtcblxuXG4vKipcbiAqIFJlZ2lzdGVycyBhIG5vZGUgYXMgYmVpbmcgYSBjaGlsZC4gSWYgYSBrZXkgaXMgcHJvdmlkZWQsIHRoZSBwYXJlbnQgd2lsbFxuICoga2VlcCB0cmFjayBvZiB0aGUgY2hpbGQgdXNpbmcgdGhlIGtleS4gVGhlIGNoaWxkIGNhbiBiZSByZXRyaWV2ZWQgdXNpbmcgdGhlXG4gKiBzYW1lIGtleSB1c2luZyBnZXRLZXlNYXAuIFRoZSBwcm92aWRlZCBrZXkgc2hvdWxkIGJlIHVuaXF1ZSB3aXRoaW4gdGhlXG4gKiBwYXJlbnQgRWxlbWVudC5cbiAqIEBwYXJhbSB7IUVsZW1lbnR9IHBhcmVudCBUaGUgcGFyZW50IG9mIGNoaWxkLlxuICogQHBhcmFtIHs/c3RyaW5nfSBrZXkgQSBrZXkgdG8gaWRlbnRpZnkgdGhlIGNoaWxkIHdpdGguXG4gKiBAcGFyYW0geyFOb2RlfSBjaGlsZCBUaGUgY2hpbGQgdG8gcmVnaXN0ZXIuXG4gKi9cbnZhciByZWdpc3RlckNoaWxkID0gZnVuY3Rpb24ocGFyZW50LCBrZXksIGNoaWxkKSB7XG4gIGlmIChrZXkpIHtcbiAgICBnZXRLZXlNYXAocGFyZW50KVtrZXldID0gY2hpbGQ7XG4gIH1cbn07XG5cblxuLyoqICovXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgY3JlYXRlTm9kZTogY3JlYXRlTm9kZSxcbiAgZ2V0S2V5OiBnZXRLZXksXG4gIGdldE5vZGVOYW1lOiBnZXROb2RlTmFtZSxcbiAgZ2V0Q2hpbGQ6IGdldENoaWxkLFxuICByZWdpc3RlckNoaWxkOiByZWdpc3RlckNoaWxkXG59O1xuXG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE1IFRoZSBJbmNyZW1lbnRhbCBET00gQXV0aG9ycy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTLUlTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbnZhciB0cmF2ZXJzYWwgPSByZXF1aXJlKCcuL3RyYXZlcnNhbCcpLFxuICAgIGZpcnN0Q2hpbGQgPSB0cmF2ZXJzYWwuZmlyc3RDaGlsZCxcbiAgICBwYXJlbnROb2RlID0gdHJhdmVyc2FsLnBhcmVudE5vZGU7XG52YXIgVHJlZVdhbGtlciA9IHJlcXVpcmUoJy4vdHJlZV93YWxrZXInKTtcbnZhciB3YWxrZXIgPSByZXF1aXJlKCcuL3dhbGtlcicpLFxuICAgIGdldFdhbGtlciA9IHdhbGtlci5nZXRXYWxrZXIsXG4gICAgc2V0V2Fsa2VyID0gd2Fsa2VyLnNldFdhbGtlcjtcblxuXG4vKipcbiAqIFBhdGNoZXMgdGhlIGRvY3VtZW50IHN0YXJ0aW5nIGF0IGVsIHdpdGggdGhlIHByb3ZpZGVkIGZ1bmN0aW9uLiBUaGlzIGZ1bmN0aW9uXG4gKiBtYXkgYmUgY2FsbGVkIGR1cmluZyBhbiBleGlzdGluZyBwYXRjaCBvcGVyYXRpb24uXG4gKiBAcGFyYW0geyFFbGVtZW50fSBlbCB0aGUgZWxlbWVudCB0byBwYXRjaFxuICogQHBhcmFtIHshZnVuY3Rpb259IGZuIEEgZnVuY3Rpb24gY29udGFpbmluZyBlbGVtZW50T3Blbi9lbGVtZW50Q2xvc2UvZXRjLlxuICogICAgIGNhbGxzIHRoYXQgZGVzY3JpYmUgdGhlIERPTS5cbiAqL1xudmFyIHBhdGNoID0gZnVuY3Rpb24oZWwsIGZuKSB7XG4gIHZhciBwcmV2V2Fsa2VyID0gZ2V0V2Fsa2VyKCk7XG4gIHNldFdhbGtlcihuZXcgVHJlZVdhbGtlcihlbCkpO1xuXG4gIGZpcnN0Q2hpbGQoKTtcbiAgZm4oKTtcbiAgcGFyZW50Tm9kZSgpO1xuXG4gIHNldFdhbGtlcihwcmV2V2Fsa2VyKTtcbn07XG5cblxuLyoqICovXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgcGF0Y2g6IHBhdGNoXG59O1xuXG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE1IFRoZSBJbmNyZW1lbnRhbCBET00gQXV0aG9ycy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTLUlTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbnZhciBnZXRXYWxrZXIgPSByZXF1aXJlKCcuL3dhbGtlcicpLmdldFdhbGtlcjtcbnZhciBnZXREYXRhID0gcmVxdWlyZSgnLi9ub2RlX2RhdGEnKS5nZXREYXRhO1xuXG5cbi8qKlxuICogRW50ZXJzIGEgRWxlbWVudCwgY2xlYXJpbmcgb3V0IHRoZSBsYXN0IHZpc2l0ZWQgY2hpbGQgZmllbGQuXG4gKiBAcGFyYW0geyFFbGVtZW50fSBub2RlXG4gKi9cbnZhciBlbnRlck5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG4gIHZhciBkYXRhID0gZ2V0RGF0YShub2RlKTtcbiAgZGF0YS5sYXN0VmlzaXRlZENoaWxkID0gbnVsbDtcbn07XG5cblxuLyoqXG4gKiBDbGVhcnMgb3V0IGFueSB1bnZpc2l0ZWQgTm9kZXMsIGFzIHRoZSBjb3JyZXNwb25kaW5nIHZpcnR1YWwgZWxlbWVudFxuICogZnVuY3Rpb25zIHdlcmUgbmV2ZXIgY2FsbGVkIGZvciB0aGVtLlxuICogQHBhcmFtIHshRWxlbWVudH0gbm9kZVxuICovXG52YXIgZXhpdE5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG4gIHZhciBkYXRhID0gZ2V0RGF0YShub2RlKTtcbiAgdmFyIGxhc3RWaXNpdGVkQ2hpbGQgPSBkYXRhLmxhc3RWaXNpdGVkQ2hpbGQ7XG5cbiAgaWYgKG5vZGUubGFzdENoaWxkID09PSBsYXN0VmlzaXRlZENoaWxkKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgd2hpbGUgKG5vZGUubGFzdENoaWxkICE9PSBsYXN0VmlzaXRlZENoaWxkKSB7XG4gICAgbm9kZS5yZW1vdmVDaGlsZChub2RlLmxhc3RDaGlsZCk7XG4gIH1cblxuICAvLyBJbnZhbGlkYXRlIHRoZSBrZXkgbWFwIHNpbmNlIHdlIHJlbW92ZWQgY2hpbGRyZW4uIEl0IHdpbGwgZ2V0IHJlY3JlYXRlZFxuICAvLyBuZXh0IHRpbWUgd2UgbmVlZCBpdC5cbiAgZGF0YS5rZXlNYXAgPSBudWxsO1xufTtcblxuXG4vKipcbiAqIE1hcmtzIGEgcGFyZW50IGFzIGhhdmluZyB2aXNpdGVkIGEgY2hpbGQuXG4gKiBAcGFyYW0geyFFbGVtZW50fSBwYXJlbnRcbiAqIEBwYXJhbSB7IU5vZGV9IGNoaWxkXG4gKi9cbnZhciBtYXJrVmlzaXRlZCA9IGZ1bmN0aW9uKHBhcmVudCwgY2hpbGQpIHtcbiAgdmFyIGRhdGEgPSBnZXREYXRhKHBhcmVudCk7XG4gIGRhdGEubGFzdFZpc2l0ZWRDaGlsZCA9IGNoaWxkO1xufTtcblxuXG4vKipcbiAqIENoYW5nZXMgdG8gdGhlIGZpcnN0IGNoaWxkIG9mIHRoZSBjdXJyZW50IG5vZGUuXG4gKi9cbnZhciBmaXJzdENoaWxkID0gZnVuY3Rpb24oKSB7XG4gIHZhciB3YWxrZXIgPSBnZXRXYWxrZXIoKTtcbiAgZW50ZXJOb2RlKHdhbGtlci5jdXJyZW50Tm9kZSk7XG4gIHdhbGtlci5maXJzdENoaWxkKCk7XG59O1xuXG5cbi8qKlxuICogQ2hhbmdlcyB0byB0aGUgbmV4dCBzaWJsaW5nIG9mIHRoZSBjdXJyZW50IG5vZGUuXG4gKi9cbnZhciBuZXh0U2libGluZyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgd2Fsa2VyID0gZ2V0V2Fsa2VyKCk7XG4gIHdhbGtlci5uZXh0U2libGluZygpO1xufTtcblxuXG4vKipcbiAqIENoYW5nZXMgdG8gdGhlIHBhcmVudCBvZiB0aGUgY3VycmVudCBub2RlLCByZW1vdmluZyBhbnkgdW52aXNpdGVkIGNoaWxkcmVuLlxuICovXG52YXIgcGFyZW50Tm9kZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgd2Fsa2VyID0gZ2V0V2Fsa2VyKCk7XG4gIHdhbGtlci5wYXJlbnROb2RlKCk7XG4gIGV4aXROb2RlKHdhbGtlci5jdXJyZW50Tm9kZSk7XG59O1xuXG5cbi8qKiAqL1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGZpcnN0Q2hpbGQ6IGZpcnN0Q2hpbGQsXG4gIG5leHRTaWJsaW5nOiBuZXh0U2libGluZyxcbiAgcGFyZW50Tm9kZTogcGFyZW50Tm9kZSxcbiAgbWFya1Zpc2l0ZWQ6IG1hcmtWaXNpdGVkXG59O1xuXG4iLCIvKipcbiAqIENvcHlyaWdodCAyMDE1IFRoZSBJbmNyZW1lbnRhbCBET00gQXV0aG9ycy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICogeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICogWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4gKlxuICogICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbiAqXG4gKiBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4gKiBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTLUlTXCIgQkFTSVMsXG4gKiBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbiAqIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbiAqIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuICovXG5cbi8qKlxuICogU2ltaWxhciB0byB0aGUgYnVpbHQtaW4gVHJlZXdhbGtlciBjbGFzcywgYnV0IHNpbXBsaWZpZWQgYW5kIGFsbG93cyBkaXJlY3RcbiAqIGFjY2VzcyB0byBtb2RpZnkgdGhlIGN1cnJlbnROb2RlIHByb3BlcnR5LlxuICogQHBhcmFtIHshTm9kZX0gbm9kZSBUaGUgcm9vdCBOb2RlIG9mIHRoZSBzdWJ0cmVlIHRoZSB3YWxrZXIgc2hvdWxkIHN0YXJ0XG4gKiAgICAgdHJhdmVyc2luZy5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBUcmVlV2Fsa2VyKG5vZGUpIHtcbiAgLyoqXG4gICAqIEtlZXBzIHRyYWNrIG9mIHRoZSBjdXJyZW50IHBhcmVudCBub2RlLiBUaGlzIGlzIG5lY2Vzc2FyeSBhcyB0aGUgdHJhdmVyc2FsXG4gICAqIG1ldGhvZHMgbWF5IHRyYXZlcnNlIHBhc3QgdGhlIGxhc3QgY2hpbGQgYW5kIHdlIHN0aWxsIG5lZWQgYSB3YXkgdG8gZ2V0XG4gICAqIGJhY2sgdG8gdGhlIHBhcmVudC5cbiAgICogQGNvbnN0IEBwcml2YXRlIHshQXJyYXk8IU5vZGU+fVxuICAgKi9cbiAgdGhpcy5zdGFja18gPSBbXTtcblxuICAvKiogez9Ob2RlfSAqL1xuICB0aGlzLmN1cnJlbnROb2RlID0gbm9kZTtcblxuICAvKiogeyFEb2N1bWVudH0gKi9cbiAgdGhpcy5kb2MgPSBub2RlLm93bmVyRG9jdW1lbnQ7XG59XG5cblxuLyoqXG4gKiBAcmV0dXJuIHshTm9kZX0gVGhlIGN1cnJlbnQgcGFyZW50IG9mIHRoZSBjdXJyZW50IGxvY2F0aW9uIGluIHRoZSBzdWJ0cmVlLlxuICovXG5UcmVlV2Fsa2VyLnByb3RvdHlwZS5nZXRDdXJyZW50UGFyZW50ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLnN0YWNrX1t0aGlzLnN0YWNrXy5sZW5ndGggLSAxXTtcbn07XG5cblxuLyoqXG4gKiBDaGFuZ2VzIHRoZSBjdXJyZW50IGxvY2F0aW9uIHRoZSBmaXJzdENoaWxkIG9mIHRoZSBjdXJyZW50IGxvY2F0aW9uLlxuICovXG5UcmVlV2Fsa2VyLnByb3RvdHlwZS5maXJzdENoaWxkID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuc3RhY2tfLnB1c2godGhpcy5jdXJyZW50Tm9kZSk7XG4gIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmN1cnJlbnROb2RlLmZpcnN0Q2hpbGQ7XG59O1xuXG5cbi8qKlxuICogQ2hhbmdlcyB0aGUgY3VycmVudCBsb2NhdGlvbiB0aGUgbmV4dFNpYmxpbmcgb2YgdGhlIGN1cnJlbnQgbG9jYXRpb24uXG4gKi9cblRyZWVXYWxrZXIucHJvdG90eXBlLm5leHRTaWJsaW5nID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuY3VycmVudE5vZGUgPSB0aGlzLmN1cnJlbnROb2RlLm5leHRTaWJsaW5nO1xufTtcblxuXG4vKipcbiAqIENoYW5nZXMgdGhlIGN1cnJlbnQgbG9jYXRpb24gdGhlIHBhcmVudE5vZGUgb2YgdGhlIGN1cnJlbnQgbG9jYXRpb24uXG4gKi9cblRyZWVXYWxrZXIucHJvdG90eXBlLnBhcmVudE5vZGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5jdXJyZW50Tm9kZSA9IHRoaXMuc3RhY2tfLnBvcCgpO1xufTtcblxuXG4vKiogKi9cbm1vZHVsZS5leHBvcnRzID0gVHJlZVdhbGtlcjtcblxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbi8qKlxuICogQ29weXJpZ2h0IDIwMTUgVGhlIEluY3JlbWVudGFsIERPTSBBdXRob3JzLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBBcGFjaGUgTGljZW5zZSwgVmVyc2lvbiAyLjAgKHRoZSBcIkxpY2Vuc2VcIik7XG4gKiB5b3UgbWF5IG5vdCB1c2UgdGhpcyBmaWxlIGV4Y2VwdCBpbiBjb21wbGlhbmNlIHdpdGggdGhlIExpY2Vuc2UuXG4gKiBZb3UgbWF5IG9idGFpbiBhIGNvcHkgb2YgdGhlIExpY2Vuc2UgYXRcbiAqXG4gKiAgICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuICpcbiAqIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAqIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMtSVNcIiBCQVNJUyxcbiAqIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICogU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICogbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4gKi9cblxudmFyIGFsaWduV2l0aERPTSA9IHJlcXVpcmUoJy4vYWxpZ25tZW50JykuYWxpZ25XaXRoRE9NO1xudmFyIHVwZGF0ZUF0dHJpYnV0ZSA9IHJlcXVpcmUoJy4vYXR0cmlidXRlcycpLnVwZGF0ZUF0dHJpYnV0ZTtcbnZhciBnZXREYXRhID0gcmVxdWlyZSgnLi9ub2RlX2RhdGEnKS5nZXREYXRhO1xudmFyIGdldFdhbGtlciA9IHJlcXVpcmUoJy4vd2Fsa2VyJykuZ2V0V2Fsa2VyO1xudmFyIHRyYXZlcnNhbCA9IHJlcXVpcmUoJy4vdHJhdmVyc2FsJyksXG4gICAgZmlyc3RDaGlsZCA9IHRyYXZlcnNhbC5maXJzdENoaWxkLFxuICAgIG5leHRTaWJsaW5nID0gdHJhdmVyc2FsLm5leHRTaWJsaW5nLFxuICAgIHBhcmVudE5vZGUgPSB0cmF2ZXJzYWwucGFyZW50Tm9kZTtcblxuXG4vKipcbiAqIFRoZSBvZmZzZXQgaW4gdGhlIHZpcnR1YWwgZWxlbWVudCBkZWNsYXJhdGlvbiB3aGVyZSB0aGUgYXR0cmlidXRlcyBhcmVcbiAqIHNwZWNpZmllZC5cbiAqIEBjb25zdFxuICovXG52YXIgQVRUUklCVVRFU19PRkZTRVQgPSAzO1xuXG5cbi8qKlxuICogQnVpbGRzIGFuIGFycmF5IG9mIGFyZ3VtZW50cyBmb3IgdXNlIHdpdGggZWxlbWVudE9wZW5TdGFydCwgYXR0ciBhbmRcbiAqIGVsZW1lbnRPcGVuRW5kLlxuICogQHR5cGUge0FycmF5PCo+fVxuICogQGNvbnN0XG4gKi9cbnZhciBhcmdzQnVpbGRlciA9IFtdO1xuXG5cbmlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Byb2R1Y3Rpb24nKSB7XG4gIC8qKlxuICAgKiBLZWVwcyB0cmFjayB3aGV0aGVyIG9yIG5vdCB3ZSBhcmUgaW4gYW4gYXR0cmlidXRlcyBkZWNsYXJhdGlvbiAoYWZ0ZXJcbiAgICogZWxlbWVudE9wZW5TdGFydCwgYnV0IGJlZm9yZSBlbGVtZW50T3BlbkVuZCkuXG4gICAqIEB0eXBlIHtib29sZWFufVxuICAgKi9cbiAgdmFyIGluQXR0cmlidXRlcyA9IGZhbHNlO1xuXG5cbiAgLyoqIE1ha2VzIHN1cmUgdGhhdCB0aGUgY2FsbGVyIGlzIG5vdCB3aGVyZSBhdHRyaWJ1dGVzIGFyZSBleHBlY3RlZC4gKi9cbiAgdmFyIGFzc2VydE5vdEluQXR0cmlidXRlcyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmIChpbkF0dHJpYnV0ZXMpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignV2FzIG5vdCBleHBlY3RpbmcgYSBjYWxsIHRvIGF0dHIgb3IgZWxlbWVudE9wZW5FbmQsICcgK1xuICAgICAgICAgICd0aGV5IG11c3QgZm9sbG93IGEgY2FsbCB0byBlbGVtZW50T3BlblN0YXJ0LicpO1xuICAgIH1cbiAgfTtcblxuXG4gIC8qKiBNYWtlcyBzdXJlIHRoYXQgdGhlIGNhbGxlciBpcyB3aGVyZSBhdHRyaWJ1dGVzIGFyZSBleHBlY3RlZC4gKi9cbiAgdmFyIGFzc2VydEluQXR0cmlidXRlcyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICghaW5BdHRyaWJ1dGVzKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1dhcyBleHBlY3RpbmcgYSBjYWxsIHRvIGF0dHIgb3IgZWxlbWVudE9wZW5FbmQuICcgK1xuICAgICAgICAgICdlbGVtZW50T3BlblN0YXJ0IG11c3QgYmUgZm9sbG93ZWQgYnkgemVybyBvciBtb3JlIGNhbGxzIHRvIGF0dHIsICcgK1xuICAgICAgICAgICd0aGVuIG9uZSBjYWxsIHRvIGVsZW1lbnRPcGVuRW5kLicpO1xuICAgIH1cbiAgfTtcblxuXG4gIC8qKiBVcGRhdGVzIHRoZSBzdGF0ZSB0byBiZWluZyBpbiBhbiBhdHRyaWJ1dGUgZGVjbGFyYXRpb24uICovXG4gIHZhciBzZXRJbkF0dHJpYnV0ZXMgPSBmdW5jdGlvbigpIHtcbiAgICBpbkF0dHJpYnV0ZXMgPSB0cnVlO1xuICB9O1xuXG5cbiAgLyoqIFVwZGF0ZXMgdGhlIHN0YXRlIHRvIG5vdCBiZWluZyBpbiBhbiBhdHRyaWJ1dGUgZGVjbGFyYXRpb24uICovXG4gIHZhciBzZXROb3RJbkF0dHJpYnV0ZXMgPSBmdW5jdGlvbigpIHtcbiAgICBpbkF0dHJpYnV0ZXMgPSBmYWxzZTtcbiAgfTtcbn1cblxuXG4vKipcbiAqIENoZWNrcyB0byBzZWUgaWYgb25lIG9yIG1vcmUgYXR0cmlidXRlcyBoYXZlIGNoYW5nZWQgZm9yIGEgZ2l2ZW5cbiAqIEVsZW1lbnQuIFdoZW4gbm8gYXR0cmlidXRlcyBoYXZlIGNoYW5nZWQsIHRoaXMgZnVuY3Rpb24gaXMgbXVjaCBmYXN0ZXIgdGhhblxuICogY2hlY2tpbmcgZWFjaCBpbmRpdmlkdWFsIGFyZ3VtZW50LiBXaGVuIGF0dHJpYnV0ZXMgaGF2ZSBjaGFuZ2VkLCB0aGUgb3ZlcmhlYWRcbiAqIG9mIHRoaXMgZnVuY3Rpb24gaXMgbWluaW1hbC5cbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIGlzIGNhbGxlZCBpbiB0aGUgY29udGV4dCBvZiB0aGUgRWxlbWVudCBhbmQgdGhlIGFyZ3VtZW50cyBmcm9tXG4gKiBlbGVtZW50T3Blbi1saWtlIGZ1bmN0aW9uIHNvIHRoYXQgdGhlIGFyZ3VtZW50cyBhcmUgbm90IGRlLW9wdGltaXplZC5cbiAqXG4gKiBAdGhpcyB7RWxlbWVudH0gVGhlIEVsZW1lbnQgdG8gY2hlY2sgZm9yIGNoYW5nZWQgYXR0cmlidXRlcy5cbiAqIEBwYXJhbSB7Kn0gdW51c2VkMVxuICogQHBhcmFtIHsqfSB1bnVzZWQyXG4gKiBAcGFyYW0geyp9IHVudXNlZDNcbiAqIEBwYXJhbSB7Li4uKn0gdmFyX2FyZ3MgQXR0cmlidXRlIG5hbWUvdmFsdWUgcGFpcnMgb2YgdGhlIGR5bmFtaWMgYXR0cmlidXRlc1xuICogICAgIGZvciB0aGUgRWxlbWVudC5cbiAqIEByZXR1cm4ge2Jvb2xlYW59IFRydWUgaWYgdGhlIEVsZW1lbnQgaGFzIG9uZSBvciBtb3JlIGNoYW5nZWQgYXR0cmlidXRlcyxcbiAqICAgICBmYWxzZSBvdGhlcndpc2UuXG4gKi9cbnZhciBoYXNDaGFuZ2VkQXR0cnMgPSBmdW5jdGlvbih1bnVzZWQxLCB1bnVzZWQyLCB1bnVzZWQzLCB2YXJfYXJncykge1xuICB2YXIgZGF0YSA9IGdldERhdGEodGhpcyk7XG4gIHZhciBhdHRyc0FyciA9IGRhdGEuYXR0cnNBcnI7XG4gIHZhciBhdHRyc0NoYW5nZWQgPSBmYWxzZTtcbiAgdmFyIGk7XG5cbiAgZm9yIChpID0gQVRUUklCVVRFU19PRkZTRVQ7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICAvLyBUcmFuc2xhdGUgdGhlIGZyb20gdGhlIGFyZ3VtZW50cyBpbmRleCAoZm9yIHZhbHVlcykgdG8gdGhlIGF0dHJpYnV0ZSdzXG4gICAgLy8gb3JkaW5hbC4gVGhlIGF0dHJpYnV0ZSB2YWx1ZXMgYXJlIGF0IGFyZ3VtZW50cyBpbmRleCAzLCA1LCA3LCBldGMuIFRvIGdldFxuICAgIC8vIHRoZSBvcmRpbmFsLCBuZWVkIHRvIHN1YnRyYWN0IHRoZSBvZmZzZXQgYW5kIGRpdmlkZSBieSAyXG4gICAgaWYgKGF0dHJzQXJyWyhpIC0gQVRUUklCVVRFU19PRkZTRVQpID4+IDFdICE9PSBhcmd1bWVudHNbaSArIDFdKSB7XG4gICAgICBhdHRyc0NoYW5nZWQgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKGF0dHJzQ2hhbmdlZCkge1xuICAgIGZvciAoaSA9IEFUVFJJQlVURVNfT0ZGU0VUOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgICBhdHRyc0FyclsoaSAtIEFUVFJJQlVURVNfT0ZGU0VUKSA+PiAxXSA9IGFyZ3VtZW50c1tpICsgMV07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGF0dHJzQ2hhbmdlZDtcbn07XG5cblxuLyoqXG4gKiBVcGRhdGVzIHRoZSBuZXdBdHRycyBvYmplY3QgZm9yIGFuIEVsZW1lbnQuXG4gKlxuICogVGhpcyBmdW5jdGlvbiBpcyBjYWxsZWQgaW4gdGhlIGNvbnRleHQgb2YgdGhlIEVsZW1lbnQgYW5kIHRoZSBhcmd1bWVudHMgZnJvbVxuICogZWxlbWVudE9wZW4tbGlrZSBmdW5jdGlvbiBzbyB0aGF0IHRoZSBhcmd1bWVudHMgYXJlIG5vdCBkZS1vcHRpbWl6ZWQuXG4gKlxuICogQHRoaXMge0VsZW1lbnR9IFRoZSBFbGVtZW50IHRvIHVwZGF0ZSBuZXdBdHRycyBmb3IuXG4gKiBAcGFyYW0geyp9IHVudXNlZDFcbiAqIEBwYXJhbSB7Kn0gdW51c2VkMlxuICogQHBhcmFtIHsqfSB1bnVzZWQzXG4gKiBAcGFyYW0gey4uLip9IHZhcl9hcmdzIEF0dHJpYnV0ZSBuYW1lL3ZhbHVlIHBhaXJzIG9mIHRoZSBkeW5hbWljIGF0dHJpYnV0ZXNcbiAqICAgICBmb3IgdGhlIEVsZW1lbnQuXG4gKiBAcmV0dXJuIHshT2JqZWN0PHN0cmluZywgKj59IFRoZSB1cGRhdGVkIG5ld0F0dHJzIG9iamVjdC5cbiAqL1xudmFyIHVwZGF0ZU5ld0F0dHJzID0gZnVuY3Rpb24odW51c2VkMSwgdW51c2VkMiwgdW51c2VkMywgdmFyX2FyZ3MpIHtcbiAgdmFyIG5vZGUgPSB0aGlzO1xuICB2YXIgZGF0YSA9IGdldERhdGEobm9kZSk7XG4gIHZhciBuZXdBdHRycyA9IGRhdGEubmV3QXR0cnM7XG5cbiAgZm9yICh2YXIgYXR0ciBpbiBuZXdBdHRycykge1xuICAgIG5ld0F0dHJzW2F0dHJdID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgZm9yICh2YXIgaSA9IEFUVFJJQlVURVNfT0ZGU0VUOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgbmV3QXR0cnNbYXJndW1lbnRzW2ldXSA9IGFyZ3VtZW50c1tpICsgMV07XG4gIH1cblxuICByZXR1cm4gbmV3QXR0cnM7XG59O1xuXG5cbi8qKlxuICogVXBkYXRlcyB0aGUgYXR0cmlidXRlcyBmb3IgYSBnaXZlbiBFbGVtZW50LlxuICogQHBhcmFtIHshRWxlbWVudH0gbm9kZVxuICogQHBhcmFtIHshT2JqZWN0PHN0cmluZywqPn0gbmV3QXR0cnMgVGhlIG5ldyBhdHRyaWJ1dGVzIGZvciBub2RlXG4gKi9cbnZhciB1cGRhdGVBdHRyaWJ1dGVzID0gZnVuY3Rpb24obm9kZSwgbmV3QXR0cnMpIHtcbiAgZm9yICh2YXIgYXR0ciBpbiBuZXdBdHRycykge1xuICAgIHVwZGF0ZUF0dHJpYnV0ZShub2RlLCBhdHRyLCBuZXdBdHRyc1thdHRyXSk7XG4gIH1cbn07XG5cblxuLyoqXG4gKiBEZWNsYXJlcyBhIHZpcnR1YWwgRWxlbWVudCBhdCB0aGUgY3VycmVudCBsb2NhdGlvbiBpbiB0aGUgZG9jdW1lbnQuIFRoaXNcbiAqIGNvcnJlc3BvbmRzIHRvIGFuIG9wZW5pbmcgdGFnIGFuZCBhIGVsZW1lbnRDbG9zZSB0YWcgaXMgcmVxdWlyZWQuXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFnIFRoZSBlbGVtZW50J3MgdGFnLlxuICogQHBhcmFtIHs/c3RyaW5nfSBrZXkgVGhlIGtleSB1c2VkIHRvIGlkZW50aWZ5IHRoaXMgZWxlbWVudC4gVGhpcyBjYW4gYmUgYW5cbiAqICAgICBlbXB0eSBzdHJpbmcsIGJ1dCBwZXJmb3JtYW5jZSBtYXkgYmUgYmV0dGVyIGlmIGEgdW5pcXVlIHZhbHVlIGlzIHVzZWRcbiAqICAgICB3aGVuIGl0ZXJhdGluZyBvdmVyIGFuIGFycmF5IG9mIGl0ZW1zLlxuICogQHBhcmFtIHs/QXJyYXk8Kj59IHN0YXRpY3MgQW4gYXJyYXkgb2YgYXR0cmlidXRlIG5hbWUvdmFsdWUgcGFpcnMgb2YgdGhlXG4gKiAgICAgc3RhdGljIGF0dHJpYnV0ZXMgZm9yIHRoZSBFbGVtZW50LiBUaGVzZSB3aWxsIG9ubHkgYmUgc2V0IG9uY2Ugd2hlbiB0aGVcbiAqICAgICBFbGVtZW50IGlzIGNyZWF0ZWQuXG4gKiBAcGFyYW0gey4uLip9IHZhcl9hcmdzIEF0dHJpYnV0ZSBuYW1lL3ZhbHVlIHBhaXJzIG9mIHRoZSBkeW5hbWljIGF0dHJpYnV0ZXNcbiAqICAgICBmb3IgdGhlIEVsZW1lbnQuXG4gKi9cbnZhciBlbGVtZW50T3BlbiA9IGZ1bmN0aW9uKHRhZywga2V5LCBzdGF0aWNzLCB2YXJfYXJncykge1xuICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJykge1xuICAgIGFzc2VydE5vdEluQXR0cmlidXRlcygpO1xuICB9XG5cbiAgdmFyIG5vZGUgPSBhbGlnbldpdGhET00odGFnLCBrZXksIHN0YXRpY3MpO1xuXG4gIGlmIChoYXNDaGFuZ2VkQXR0cnMuYXBwbHkobm9kZSwgYXJndW1lbnRzKSkge1xuICAgIHZhciBuZXdBdHRycyA9IHVwZGF0ZU5ld0F0dHJzLmFwcGx5KG5vZGUsIGFyZ3VtZW50cyk7XG4gICAgdXBkYXRlQXR0cmlidXRlcyhub2RlLCBuZXdBdHRycyk7XG4gIH1cblxuICBmaXJzdENoaWxkKCk7XG59O1xuXG5cbi8qKlxuICogRGVjbGFyZXMgYSB2aXJ0dWFsIEVsZW1lbnQgYXQgdGhlIGN1cnJlbnQgbG9jYXRpb24gaW4gdGhlIGRvY3VtZW50LiBUaGlzXG4gKiBjb3JyZXNwb25kcyB0byBhbiBvcGVuaW5nIHRhZyBhbmQgYSBlbGVtZW50Q2xvc2UgdGFnIGlzIHJlcXVpcmVkLiBUaGlzIGlzXG4gKiBsaWtlIGVsZW1lbnRPcGVuLCBidXQgdGhlIGF0dHJpYnV0ZXMgYXJlIGRlZmluZWQgdXNpbmcgdGhlIGF0dHIgZnVuY3Rpb25cbiAqIHJhdGhlciB0aGFuIGJlaW5nIHBhc3NlZCBhcyBhcmd1bWVudHMuIE11c3QgYmUgZm9sbGxvd2VkIGJ5IDAgb3IgbW9yZSBjYWxsc1xuICogdG8gYXR0ciwgdGhlbiBhIGNhbGwgdG8gZWxlbWVudE9wZW5FbmQuXG4gKiBAcGFyYW0ge3N0cmluZ30gdGFnIFRoZSBlbGVtZW50J3MgdGFnLlxuICogQHBhcmFtIHs/c3RyaW5nfSBrZXkgVGhlIGtleSB1c2VkIHRvIGlkZW50aWZ5IHRoaXMgZWxlbWVudC4gVGhpcyBjYW4gYmUgYW5cbiAqICAgICBlbXB0eSBzdHJpbmcsIGJ1dCBwZXJmb3JtYW5jZSBtYXkgYmUgYmV0dGVyIGlmIGEgdW5pcXVlIHZhbHVlIGlzIHVzZWRcbiAqICAgICB3aGVuIGl0ZXJhdGluZyBvdmVyIGFuIGFycmF5IG9mIGl0ZW1zLlxuICogQHBhcmFtIHs/QXJyYXk8Kj59IHN0YXRpY3MgQW4gYXJyYXkgb2YgYXR0cmlidXRlIG5hbWUvdmFsdWUgcGFpcnMgb2YgdGhlXG4gKiAgICAgc3RhdGljIGF0dHJpYnV0ZXMgZm9yIHRoZSBFbGVtZW50LiBUaGVzZSB3aWxsIG9ubHkgYmUgc2V0IG9uY2Ugd2hlbiB0aGVcbiAqICAgICBFbGVtZW50IGlzIGNyZWF0ZWQuXG4gKi9cbnZhciBlbGVtZW50T3BlblN0YXJ0ID0gZnVuY3Rpb24odGFnLCBrZXksIHN0YXRpY3MpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHtcbiAgICBhc3NlcnROb3RJbkF0dHJpYnV0ZXMoKTtcbiAgICBzZXRJbkF0dHJpYnV0ZXMoKTtcbiAgfVxuXG4gIGFyZ3NCdWlsZGVyWzBdID0gdGFnO1xuICBhcmdzQnVpbGRlclsxXSA9IGtleTtcbiAgYXJnc0J1aWxkZXJbMl0gPSBzdGF0aWNzO1xuICBhcmdzQnVpbGRlci5sZW5ndGggPSBBVFRSSUJVVEVTX09GRlNFVDtcbn07XG5cblxuLyoqKlxuICogRGVmaW5lcyBhIHZpcnR1YWwgYXR0cmlidXRlIGF0IHRoaXMgcG9pbnQgb2YgdGhlIERPTS4gVGhpcyBpcyBvbmx5IHZhbGlkXG4gKiB3aGVuIGNhbGxlZCBiZXR3ZWVuIGVsZW1lbnRPcGVuU3RhcnQgYW5kIGVsZW1lbnRPcGVuRW5kLlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSBuYW1lXG4gKiBAcGFyYW0geyp9IHZhbHVlXG4gKi9cbnZhciBhdHRyID0gZnVuY3Rpb24obmFtZSwgdmFsdWUpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHtcbiAgICBhc3NlcnRJbkF0dHJpYnV0ZXMoKTtcbiAgfVxuXG4gIGFyZ3NCdWlsZGVyLnB1c2gobmFtZSwgdmFsdWUpO1xufTtcblxuXG4vKipcbiAqIENsb3NlcyBhbiBvcGVuIHRhZyBzdGFydGVkIHdpdGggZWxlbWVudE9wZW5TdGFydC5cbiAqL1xudmFyIGVsZW1lbnRPcGVuRW5kID0gZnVuY3Rpb24oKSB7XG4gIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViAhPT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgYXNzZXJ0SW5BdHRyaWJ1dGVzKCk7XG4gICAgc2V0Tm90SW5BdHRyaWJ1dGVzKCk7XG4gIH1cblxuICBlbGVtZW50T3Blbi5hcHBseShudWxsLCBhcmdzQnVpbGRlcik7XG59O1xuXG5cbi8qKlxuICogQ2xvc2VzIGFuIG9wZW4gdmlydHVhbCBFbGVtZW50LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB0YWcgVGhlIGVsZW1lbnQncyB0YWcuXG4gKi9cbnZhciBlbGVtZW50Q2xvc2UgPSBmdW5jdGlvbih0YWcpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHtcbiAgICBhc3NlcnROb3RJbkF0dHJpYnV0ZXMoKTtcbiAgfVxuXG4gIHBhcmVudE5vZGUoKTtcbiAgbmV4dFNpYmxpbmcoKTtcbn07XG5cblxuLyoqXG4gKiBEZWNsYXJlcyBhIHZpcnR1YWwgRWxlbWVudCBhdCB0aGUgY3VycmVudCBsb2NhdGlvbiBpbiB0aGUgZG9jdW1lbnQgdGhhdCBoYXNcbiAqIG5vIGNoaWxkcmVuLlxuICogQHBhcmFtIHtzdHJpbmd9IHRhZyBUaGUgZWxlbWVudCdzIHRhZy5cbiAqIEBwYXJhbSB7P3N0cmluZ30ga2V5IFRoZSBrZXkgdXNlZCB0byBpZGVudGlmeSB0aGlzIGVsZW1lbnQuIFRoaXMgY2FuIGJlIGFuXG4gKiAgICAgZW1wdHkgc3RyaW5nLCBidXQgcGVyZm9ybWFuY2UgbWF5IGJlIGJldHRlciBpZiBhIHVuaXF1ZSB2YWx1ZSBpcyB1c2VkXG4gKiAgICAgd2hlbiBpdGVyYXRpbmcgb3ZlciBhbiBhcnJheSBvZiBpdGVtcy5cbiAqIEBwYXJhbSB7P0FycmF5PCo+fSBzdGF0aWNzIEFuIGFycmF5IG9mIGF0dHJpYnV0ZSBuYW1lL3ZhbHVlIHBhaXJzIG9mIHRoZVxuICogICAgIHN0YXRpYyBhdHRyaWJ1dGVzIGZvciB0aGUgRWxlbWVudC4gVGhlc2Ugd2lsbCBvbmx5IGJlIHNldCBvbmNlIHdoZW4gdGhlXG4gKiAgICAgRWxlbWVudCBpcyBjcmVhdGVkLlxuICogQHBhcmFtIHsuLi4qfSB2YXJfYXJncyBBdHRyaWJ1dGUgbmFtZS92YWx1ZSBwYWlycyBvZiB0aGUgZHluYW1pYyBhdHRyaWJ1dGVzXG4gKiAgICAgZm9yIHRoZSBFbGVtZW50LlxuICovXG52YXIgZWxlbWVudFZvaWQgPSBmdW5jdGlvbih0YWcsIGtleSwgc3RhdGljcywgdmFyX2FyZ3MpIHtcbiAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WICE9PSAncHJvZHVjdGlvbicpIHtcbiAgICBhc3NlcnROb3RJbkF0dHJpYnV0ZXMoKTtcbiAgfVxuXG4gIGVsZW1lbnRPcGVuLmFwcGx5KG51bGwsIGFyZ3VtZW50cyk7XG4gIGVsZW1lbnRDbG9zZS5hcHBseShudWxsLCBhcmd1bWVudHMpO1xufTtcblxuXG4vKipcbiAqIERlY2xhcmVzIGEgdmlydHVhbCBUZXh0IGF0IHRoaXMgcG9pbnQgaW4gdGhlIGRvY3VtZW50LlxuICpcbiAqIEBwYXJhbSB7c3RyaW5nfSB2YWx1ZSBUaGUgdGV4dCBvZiB0aGUgVGV4dC5cbiAqL1xudmFyIHRleHQgPSBmdW5jdGlvbih2YWx1ZSkge1xuICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgIT09ICdwcm9kdWN0aW9uJykge1xuICAgIGFzc2VydE5vdEluQXR0cmlidXRlcygpO1xuICB9XG5cbiAgdmFyIG5vZGUgPSBhbGlnbldpdGhET00oJyN0ZXh0JywgbnVsbCwgdmFsdWUpO1xuICB2YXIgZGF0YSA9IGdldERhdGEobm9kZSk7XG5cbiAgaWYgKGRhdGEudGV4dCAhPT0gdmFsdWUpIHtcbiAgICBub2RlLmRhdGEgPSB2YWx1ZTtcbiAgICBkYXRhLnRleHQgPSB2YWx1ZTtcbiAgfVxuXG4gIG5leHRTaWJsaW5nKCk7XG59O1xuXG5cbi8qKiAqL1xubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGVsZW1lbnRPcGVuU3RhcnQ6IGVsZW1lbnRPcGVuU3RhcnQsXG4gIGVsZW1lbnRPcGVuRW5kOiBlbGVtZW50T3BlbkVuZCxcbiAgZWxlbWVudE9wZW46IGVsZW1lbnRPcGVuLFxuICBlbGVtZW50Vm9pZDogZWxlbWVudFZvaWQsXG4gIGVsZW1lbnRDbG9zZTogZWxlbWVudENsb3NlLFxuICB0ZXh0OiB0ZXh0LFxuICBhdHRyOiBhdHRyXG59O1xuXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKCdfcHJvY2VzcycpKVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZGF0YTphcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ6dXRmLTg7YmFzZTY0LGV5SjJaWEp6YVc5dUlqb3pMQ0p6YjNWeVkyVnpJanBiSW01dlpHVmZiVzlrZFd4bGN5OXBibU55WlcxbGJuUmhiQzFrYjIwdmMzSmpMM1pwY25SMVlXeGZaV3hsYldWdWRITXVhbk1pWFN3aWJtRnRaWE1pT2x0ZExDSnRZWEJ3YVc1bmN5STZJanRCUVVGQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CSWl3aVptbHNaU0k2SW1kbGJtVnlZWFJsWkM1cWN5SXNJbk52ZFhKalpWSnZiM1FpT2lJaUxDSnpiM1Z5WTJWelEyOXVkR1Z1ZENJNld5SXZLaXBjYmlBcUlFTnZjSGx5YVdkb2RDQXlNREUxSUZSb1pTQkpibU55WlcxbGJuUmhiQ0JFVDAwZ1FYVjBhRzl5Y3k0Z1FXeHNJRkpwWjJoMGN5QlNaWE5sY25abFpDNWNiaUFxWEc0Z0tpQk1hV05sYm5ObFpDQjFibVJsY2lCMGFHVWdRWEJoWTJobElFeHBZMlZ1YzJVc0lGWmxjbk5wYjI0Z01pNHdJQ2gwYUdVZ1hDSk1hV05sYm5ObFhDSXBPMXh1SUNvZ2VXOTFJRzFoZVNCdWIzUWdkWE5sSUhSb2FYTWdabWxzWlNCbGVHTmxjSFFnYVc0Z1kyOXRjR3hwWVc1alpTQjNhWFJvSUhSb1pTQk1hV05sYm5ObExseHVJQ29nV1c5MUlHMWhlU0J2WW5SaGFXNGdZU0JqYjNCNUlHOW1JSFJvWlNCTWFXTmxibk5sSUdGMFhHNGdLbHh1SUNvZ0lDQWdJQ0JvZEhSd09pOHZkM2QzTG1Gd1lXTm9aUzV2Y21jdmJHbGpaVzV6WlhNdlRFbERSVTVUUlMweUxqQmNiaUFxWEc0Z0tpQlZibXhsYzNNZ2NtVnhkV2x5WldRZ1lua2dZWEJ3YkdsallXSnNaU0JzWVhjZ2IzSWdZV2R5WldWa0lIUnZJR2x1SUhkeWFYUnBibWNzSUhOdlpuUjNZWEpsWEc0Z0tpQmthWE4wY21saWRYUmxaQ0IxYm1SbGNpQjBhR1VnVEdsalpXNXpaU0JwY3lCa2FYTjBjbWxpZFhSbFpDQnZiaUJoYmlCY0lrRlRMVWxUWENJZ1FrRlRTVk1zWEc0Z0tpQlhTVlJJVDFWVUlGZEJVbEpCVGxSSlJWTWdUMUlnUTA5T1JFbFVTVTlPVXlCUFJpQkJUbGtnUzBsT1JDd2daV2wwYUdWeUlHVjRjSEpsYzNNZ2IzSWdhVzF3YkdsbFpDNWNiaUFxSUZObFpTQjBhR1VnVEdsalpXNXpaU0JtYjNJZ2RHaGxJSE53WldOcFptbGpJR3hoYm1kMVlXZGxJR2R2ZG1WeWJtbHVaeUJ3WlhKdGFYTnphVzl1Y3lCaGJtUmNiaUFxSUd4cGJXbDBZWFJwYjI1eklIVnVaR1Z5SUhSb1pTQk1hV05sYm5ObExseHVJQ292WEc1Y2JuWmhjaUJoYkdsbmJsZHBkR2hFVDAwZ1BTQnlaWEYxYVhKbEtDY3VMMkZzYVdkdWJXVnVkQ2NwTG1Gc2FXZHVWMmwwYUVSUFRUdGNiblpoY2lCMWNHUmhkR1ZCZEhSeWFXSjFkR1VnUFNCeVpYRjFhWEpsS0NjdUwyRjBkSEpwWW5WMFpYTW5LUzUxY0dSaGRHVkJkSFJ5YVdKMWRHVTdYRzUyWVhJZ1oyVjBSR0YwWVNBOUlISmxjWFZwY21Vb0p5NHZibTlrWlY5a1lYUmhKeWt1WjJWMFJHRjBZVHRjYm5aaGNpQm5aWFJYWVd4clpYSWdQU0J5WlhGMWFYSmxLQ2N1TDNkaGJHdGxjaWNwTG1kbGRGZGhiR3RsY2p0Y2JuWmhjaUIwY21GMlpYSnpZV3dnUFNCeVpYRjFhWEpsS0NjdUwzUnlZWFpsY25OaGJDY3BMRnh1SUNBZ0lHWnBjbk4wUTJocGJHUWdQU0IwY21GMlpYSnpZV3d1Wm1seWMzUkRhR2xzWkN4Y2JpQWdJQ0J1WlhoMFUybGliR2x1WnlBOUlIUnlZWFpsY25OaGJDNXVaWGgwVTJsaWJHbHVaeXhjYmlBZ0lDQndZWEpsYm5ST2IyUmxJRDBnZEhKaGRtVnljMkZzTG5CaGNtVnVkRTV2WkdVN1hHNWNibHh1THlvcVhHNGdLaUJVYUdVZ2IyWm1jMlYwSUdsdUlIUm9aU0IyYVhKMGRXRnNJR1ZzWlcxbGJuUWdaR1ZqYkdGeVlYUnBiMjRnZDJobGNtVWdkR2hsSUdGMGRISnBZblYwWlhNZ1lYSmxYRzRnS2lCemNHVmphV1pwWldRdVhHNGdLaUJBWTI5dWMzUmNiaUFxTDF4dWRtRnlJRUZVVkZKSlFsVlVSVk5mVDBaR1UwVlVJRDBnTXp0Y2JseHVYRzR2S2lwY2JpQXFJRUoxYVd4a2N5QmhiaUJoY25KaGVTQnZaaUJoY21kMWJXVnVkSE1nWm05eUlIVnpaU0IzYVhSb0lHVnNaVzFsYm5SUGNHVnVVM1JoY25Rc0lHRjBkSElnWVc1a1hHNGdLaUJsYkdWdFpXNTBUM0JsYmtWdVpDNWNiaUFxSUVCMGVYQmxJSHRCY25KaGVUd3FQbjFjYmlBcUlFQmpiMjV6ZEZ4dUlDb3ZYRzUyWVhJZ1lYSm5jMEoxYVd4a1pYSWdQU0JiWFR0Y2JseHVYRzVwWmlBb2NISnZZMlZ6Y3k1bGJuWXVUazlFUlY5RlRsWWdJVDA5SUNkd2NtOWtkV04wYVc5dUp5a2dlMXh1SUNBdktpcGNiaUFnSUNvZ1MyVmxjSE1nZEhKaFkyc2dkMmhsZEdobGNpQnZjaUJ1YjNRZ2QyVWdZWEpsSUdsdUlHRnVJR0YwZEhKcFluVjBaWE1nWkdWamJHRnlZWFJwYjI0Z0tHRm1kR1Z5WEc0Z0lDQXFJR1ZzWlcxbGJuUlBjR1Z1VTNSaGNuUXNJR0oxZENCaVpXWnZjbVVnWld4bGJXVnVkRTl3Wlc1RmJtUXBMbHh1SUNBZ0tpQkFkSGx3WlNCN1ltOXZiR1ZoYm4xY2JpQWdJQ292WEc0Z0lIWmhjaUJwYmtGMGRISnBZblYwWlhNZ1BTQm1ZV3h6WlR0Y2JseHVYRzRnSUM4cUtpQk5ZV3RsY3lCemRYSmxJSFJvWVhRZ2RHaGxJR05oYkd4bGNpQnBjeUJ1YjNRZ2QyaGxjbVVnWVhSMGNtbGlkWFJsY3lCaGNtVWdaWGh3WldOMFpXUXVJQ292WEc0Z0lIWmhjaUJoYzNObGNuUk9iM1JKYmtGMGRISnBZblYwWlhNZ1BTQm1kVzVqZEdsdmJpZ3BJSHRjYmlBZ0lDQnBaaUFvYVc1QmRIUnlhV0oxZEdWektTQjdYRzRnSUNBZ0lDQjBhSEp2ZHlCdVpYY2dSWEp5YjNJb0oxZGhjeUJ1YjNRZ1pYaHdaV04wYVc1bklHRWdZMkZzYkNCMGJ5QmhkSFJ5SUc5eUlHVnNaVzFsYm5SUGNHVnVSVzVrTENBbklDdGNiaUFnSUNBZ0lDQWdJQ0FuZEdobGVTQnRkWE4wSUdadmJHeHZkeUJoSUdOaGJHd2dkRzhnWld4bGJXVnVkRTl3Wlc1VGRHRnlkQzRuS1R0Y2JpQWdJQ0I5WEc0Z0lIMDdYRzVjYmx4dUlDQXZLaW9nVFdGclpYTWdjM1Z5WlNCMGFHRjBJSFJvWlNCallXeHNaWElnYVhNZ2QyaGxjbVVnWVhSMGNtbGlkWFJsY3lCaGNtVWdaWGh3WldOMFpXUXVJQ292WEc0Z0lIWmhjaUJoYzNObGNuUkpia0YwZEhKcFluVjBaWE1nUFNCbWRXNWpkR2x2YmlncElIdGNiaUFnSUNCcFppQW9JV2x1UVhSMGNtbGlkWFJsY3lrZ2UxeHVJQ0FnSUNBZ2RHaHliM2NnYm1WM0lFVnljbTl5S0NkWFlYTWdaWGh3WldOMGFXNW5JR0VnWTJGc2JDQjBieUJoZEhSeUlHOXlJR1ZzWlcxbGJuUlBjR1Z1Ulc1a0xpQW5JQ3RjYmlBZ0lDQWdJQ0FnSUNBblpXeGxiV1Z1ZEU5d1pXNVRkR0Z5ZENCdGRYTjBJR0psSUdadmJHeHZkMlZrSUdKNUlIcGxjbThnYjNJZ2JXOXlaU0JqWVd4c2N5QjBieUJoZEhSeUxDQW5JQ3RjYmlBZ0lDQWdJQ0FnSUNBbmRHaGxiaUJ2Ym1VZ1kyRnNiQ0IwYnlCbGJHVnRaVzUwVDNCbGJrVnVaQzRuS1R0Y2JpQWdJQ0I5WEc0Z0lIMDdYRzVjYmx4dUlDQXZLaW9nVlhCa1lYUmxjeUIwYUdVZ2MzUmhkR1VnZEc4Z1ltVnBibWNnYVc0Z1lXNGdZWFIwY21saWRYUmxJR1JsWTJ4aGNtRjBhVzl1TGlBcUwxeHVJQ0IyWVhJZ2MyVjBTVzVCZEhSeWFXSjFkR1Z6SUQwZ1puVnVZM1JwYjI0b0tTQjdYRzRnSUNBZ2FXNUJkSFJ5YVdKMWRHVnpJRDBnZEhKMVpUdGNiaUFnZlR0Y2JseHVYRzRnSUM4cUtpQlZjR1JoZEdWeklIUm9aU0J6ZEdGMFpTQjBieUJ1YjNRZ1ltVnBibWNnYVc0Z1lXNGdZWFIwY21saWRYUmxJR1JsWTJ4aGNtRjBhVzl1TGlBcUwxeHVJQ0IyWVhJZ2MyVjBUbTkwU1c1QmRIUnlhV0oxZEdWeklEMGdablZ1WTNScGIyNG9LU0I3WEc0Z0lDQWdhVzVCZEhSeWFXSjFkR1Z6SUQwZ1ptRnNjMlU3WEc0Z0lIMDdYRzU5WEc1Y2JseHVMeW9xWEc0Z0tpQkRhR1ZqYTNNZ2RHOGdjMlZsSUdsbUlHOXVaU0J2Y2lCdGIzSmxJR0YwZEhKcFluVjBaWE1nYUdGMlpTQmphR0Z1WjJWa0lHWnZjaUJoSUdkcGRtVnVYRzRnS2lCRmJHVnRaVzUwTGlCWGFHVnVJRzV2SUdGMGRISnBZblYwWlhNZ2FHRjJaU0JqYUdGdVoyVmtMQ0IwYUdseklHWjFibU4wYVc5dUlHbHpJRzExWTJnZ1ptRnpkR1Z5SUhSb1lXNWNiaUFxSUdOb1pXTnJhVzVuSUdWaFkyZ2dhVzVrYVhacFpIVmhiQ0JoY21kMWJXVnVkQzRnVjJobGJpQmhkSFJ5YVdKMWRHVnpJR2hoZG1VZ1kyaGhibWRsWkN3Z2RHaGxJRzkyWlhKb1pXRmtYRzRnS2lCdlppQjBhR2x6SUdaMWJtTjBhVzl1SUdseklHMXBibWx0WVd3dVhHNGdLbHh1SUNvZ1ZHaHBjeUJtZFc1amRHbHZiaUJwY3lCallXeHNaV1FnYVc0Z2RHaGxJR052Ym5SbGVIUWdiMllnZEdobElFVnNaVzFsYm5RZ1lXNWtJSFJvWlNCaGNtZDFiV1Z1ZEhNZ1puSnZiVnh1SUNvZ1pXeGxiV1Z1ZEU5d1pXNHRiR2xyWlNCbWRXNWpkR2x2YmlCemJ5QjBhR0YwSUhSb1pTQmhjbWQxYldWdWRITWdZWEpsSUc1dmRDQmtaUzF2Y0hScGJXbDZaV1F1WEc0Z0tseHVJQ29nUUhSb2FYTWdlMFZzWlcxbGJuUjlJRlJvWlNCRmJHVnRaVzUwSUhSdklHTm9aV05ySUdadmNpQmphR0Z1WjJWa0lHRjBkSEpwWW5WMFpYTXVYRzRnS2lCQWNHRnlZVzBnZXlwOUlIVnVkWE5sWkRGY2JpQXFJRUJ3WVhKaGJTQjdLbjBnZFc1MWMyVmtNbHh1SUNvZ1FIQmhjbUZ0SUhzcWZTQjFiblZ6WldRelhHNGdLaUJBY0dGeVlXMGdleTR1TGlwOUlIWmhjbDloY21keklFRjBkSEpwWW5WMFpTQnVZVzFsTDNaaGJIVmxJSEJoYVhKeklHOW1JSFJvWlNCa2VXNWhiV2xqSUdGMGRISnBZblYwWlhOY2JpQXFJQ0FnSUNCbWIzSWdkR2hsSUVWc1pXMWxiblF1WEc0Z0tpQkFjbVYwZFhKdUlIdGliMjlzWldGdWZTQlVjblZsSUdsbUlIUm9aU0JGYkdWdFpXNTBJR2hoY3lCdmJtVWdiM0lnYlc5eVpTQmphR0Z1WjJWa0lHRjBkSEpwWW5WMFpYTXNYRzRnS2lBZ0lDQWdabUZzYzJVZ2IzUm9aWEozYVhObExseHVJQ292WEc1MllYSWdhR0Z6UTJoaGJtZGxaRUYwZEhKeklEMGdablZ1WTNScGIyNG9kVzUxYzJWa01Td2dkVzUxYzJWa01pd2dkVzUxYzJWa015d2dkbUZ5WDJGeVozTXBJSHRjYmlBZ2RtRnlJR1JoZEdFZ1BTQm5aWFJFWVhSaEtIUm9hWE1wTzF4dUlDQjJZWElnWVhSMGNuTkJjbklnUFNCa1lYUmhMbUYwZEhKelFYSnlPMXh1SUNCMllYSWdZWFIwY25ORGFHRnVaMlZrSUQwZ1ptRnNjMlU3WEc0Z0lIWmhjaUJwTzF4dVhHNGdJR1p2Y2lBb2FTQTlJRUZVVkZKSlFsVlVSVk5mVDBaR1UwVlVPeUJwSUR3Z1lYSm5kVzFsYm5SekxteGxibWQwYURzZ2FTQXJQU0F5S1NCN1hHNGdJQ0FnTHk4Z1ZISmhibk5zWVhSbElIUm9aU0JtY205dElIUm9aU0JoY21kMWJXVnVkSE1nYVc1a1pYZ2dLR1p2Y2lCMllXeDFaWE1wSUhSdklIUm9aU0JoZEhSeWFXSjFkR1VuYzF4dUlDQWdJQzh2SUc5eVpHbHVZV3d1SUZSb1pTQmhkSFJ5YVdKMWRHVWdkbUZzZFdWeklHRnlaU0JoZENCaGNtZDFiV1Z1ZEhNZ2FXNWtaWGdnTXl3Z05Td2dOeXdnWlhSakxpQlVieUJuWlhSY2JpQWdJQ0F2THlCMGFHVWdiM0prYVc1aGJDd2dibVZsWkNCMGJ5QnpkV0owY21GamRDQjBhR1VnYjJabWMyVjBJR0Z1WkNCa2FYWnBaR1VnWW5rZ01seHVJQ0FnSUdsbUlDaGhkSFJ5YzBGeWNsc29hU0F0SUVGVVZGSkpRbFZVUlZOZlQwWkdVMFZVS1NBK1BpQXhYU0FoUFQwZ1lYSm5kVzFsYm5Selcya2dLeUF4WFNrZ2UxeHVJQ0FnSUNBZ1lYUjBjbk5EYUdGdVoyVmtJRDBnZEhKMVpUdGNiaUFnSUNBZ0lHSnlaV0ZyTzF4dUlDQWdJSDFjYmlBZ2ZWeHVYRzRnSUdsbUlDaGhkSFJ5YzBOb1lXNW5aV1FwSUh0Y2JpQWdJQ0JtYjNJZ0tHa2dQU0JCVkZSU1NVSlZWRVZUWDA5R1JsTkZWRHNnYVNBOElHRnlaM1Z0Wlc1MGN5NXNaVzVuZEdnN0lHa2dLejBnTWlrZ2UxeHVJQ0FnSUNBZ1lYUjBjbk5CY25KYktHa2dMU0JCVkZSU1NVSlZWRVZUWDA5R1JsTkZWQ2tnUGo0Z01WMGdQU0JoY21kMWJXVnVkSE5iYVNBcklERmRPMXh1SUNBZ0lIMWNiaUFnZlZ4dVhHNGdJSEpsZEhWeWJpQmhkSFJ5YzBOb1lXNW5aV1E3WEc1OU8xeHVYRzVjYmk4cUtseHVJQ29nVlhCa1lYUmxjeUIwYUdVZ2JtVjNRWFIwY25NZ2IySnFaV04wSUdadmNpQmhiaUJGYkdWdFpXNTBMbHh1SUNwY2JpQXFJRlJvYVhNZ1puVnVZM1JwYjI0Z2FYTWdZMkZzYkdWa0lHbHVJSFJvWlNCamIyNTBaWGgwSUc5bUlIUm9aU0JGYkdWdFpXNTBJR0Z1WkNCMGFHVWdZWEpuZFcxbGJuUnpJR1p5YjIxY2JpQXFJR1ZzWlcxbGJuUlBjR1Z1TFd4cGEyVWdablZ1WTNScGIyNGdjMjhnZEdoaGRDQjBhR1VnWVhKbmRXMWxiblJ6SUdGeVpTQnViM1FnWkdVdGIzQjBhVzFwZW1Wa0xseHVJQ3BjYmlBcUlFQjBhR2x6SUh0RmJHVnRaVzUwZlNCVWFHVWdSV3hsYldWdWRDQjBieUIxY0dSaGRHVWdibVYzUVhSMGNuTWdabTl5TGx4dUlDb2dRSEJoY21GdElIc3FmU0IxYm5WelpXUXhYRzRnS2lCQWNHRnlZVzBnZXlwOUlIVnVkWE5sWkRKY2JpQXFJRUJ3WVhKaGJTQjdLbjBnZFc1MWMyVmtNMXh1SUNvZ1FIQmhjbUZ0SUhzdUxpNHFmU0IyWVhKZllYSm5jeUJCZEhSeWFXSjFkR1VnYm1GdFpTOTJZV3gxWlNCd1lXbHljeUJ2WmlCMGFHVWdaSGx1WVcxcFl5QmhkSFJ5YVdKMWRHVnpYRzRnS2lBZ0lDQWdabTl5SUhSb1pTQkZiR1Z0Wlc1MExseHVJQ29nUUhKbGRIVnliaUI3SVU5aWFtVmpkRHh6ZEhKcGJtY3NJQ28rZlNCVWFHVWdkWEJrWVhSbFpDQnVaWGRCZEhSeWN5QnZZbXBsWTNRdVhHNGdLaTljYm5aaGNpQjFjR1JoZEdWT1pYZEJkSFJ5Y3lBOUlHWjFibU4wYVc5dUtIVnVkWE5sWkRFc0lIVnVkWE5sWkRJc0lIVnVkWE5sWkRNc0lIWmhjbDloY21kektTQjdYRzRnSUhaaGNpQnViMlJsSUQwZ2RHaHBjenRjYmlBZ2RtRnlJR1JoZEdFZ1BTQm5aWFJFWVhSaEtHNXZaR1VwTzF4dUlDQjJZWElnYm1WM1FYUjBjbk1nUFNCa1lYUmhMbTVsZDBGMGRISnpPMXh1WEc0Z0lHWnZjaUFvZG1GeUlHRjBkSElnYVc0Z2JtVjNRWFIwY25NcElIdGNiaUFnSUNCdVpYZEJkSFJ5YzF0aGRIUnlYU0E5SUhWdVpHVm1hVzVsWkR0Y2JpQWdmVnh1WEc0Z0lHWnZjaUFvZG1GeUlHa2dQU0JCVkZSU1NVSlZWRVZUWDA5R1JsTkZWRHNnYVNBOElHRnlaM1Z0Wlc1MGN5NXNaVzVuZEdnN0lHa2dLejBnTWlrZ2UxeHVJQ0FnSUc1bGQwRjBkSEp6VzJGeVozVnRaVzUwYzF0cFhWMGdQU0JoY21kMWJXVnVkSE5iYVNBcklERmRPMXh1SUNCOVhHNWNiaUFnY21WMGRYSnVJRzVsZDBGMGRISnpPMXh1ZlR0Y2JseHVYRzR2S2lwY2JpQXFJRlZ3WkdGMFpYTWdkR2hsSUdGMGRISnBZblYwWlhNZ1ptOXlJR0VnWjJsMlpXNGdSV3hsYldWdWRDNWNiaUFxSUVCd1lYSmhiU0I3SVVWc1pXMWxiblI5SUc1dlpHVmNiaUFxSUVCd1lYSmhiU0I3SVU5aWFtVmpkRHh6ZEhKcGJtY3NLajU5SUc1bGQwRjBkSEp6SUZSb1pTQnVaWGNnWVhSMGNtbGlkWFJsY3lCbWIzSWdibTlrWlZ4dUlDb3ZYRzUyWVhJZ2RYQmtZWFJsUVhSMGNtbGlkWFJsY3lBOUlHWjFibU4wYVc5dUtHNXZaR1VzSUc1bGQwRjBkSEp6S1NCN1hHNGdJR1p2Y2lBb2RtRnlJR0YwZEhJZ2FXNGdibVYzUVhSMGNuTXBJSHRjYmlBZ0lDQjFjR1JoZEdWQmRIUnlhV0oxZEdVb2JtOWtaU3dnWVhSMGNpd2dibVYzUVhSMGNuTmJZWFIwY2wwcE8xeHVJQ0I5WEc1OU8xeHVYRzVjYmk4cUtseHVJQ29nUkdWamJHRnlaWE1nWVNCMmFYSjBkV0ZzSUVWc1pXMWxiblFnWVhRZ2RHaGxJR04xY25KbGJuUWdiRzlqWVhScGIyNGdhVzRnZEdobElHUnZZM1Z0Wlc1MExpQlVhR2x6WEc0Z0tpQmpiM0p5WlhOd2IyNWtjeUIwYnlCaGJpQnZjR1Z1YVc1bklIUmhaeUJoYm1RZ1lTQmxiR1Z0Wlc1MFEyeHZjMlVnZEdGbklHbHpJSEpsY1hWcGNtVmtMbHh1SUNvZ1FIQmhjbUZ0SUh0emRISnBibWQ5SUhSaFp5QlVhR1VnWld4bGJXVnVkQ2R6SUhSaFp5NWNiaUFxSUVCd1lYSmhiU0I3UDNOMGNtbHVaMzBnYTJWNUlGUm9aU0JyWlhrZ2RYTmxaQ0IwYnlCcFpHVnVkR2xtZVNCMGFHbHpJR1ZzWlcxbGJuUXVJRlJvYVhNZ1kyRnVJR0psSUdGdVhHNGdLaUFnSUNBZ1pXMXdkSGtnYzNSeWFXNW5MQ0JpZFhRZ2NHVnlabTl5YldGdVkyVWdiV0Y1SUdKbElHSmxkSFJsY2lCcFppQmhJSFZ1YVhGMVpTQjJZV3gxWlNCcGN5QjFjMlZrWEc0Z0tpQWdJQ0FnZDJobGJpQnBkR1Z5WVhScGJtY2diM1psY2lCaGJpQmhjbkpoZVNCdlppQnBkR1Z0Y3k1Y2JpQXFJRUJ3WVhKaGJTQjdQMEZ5Y21GNVBDbytmU0J6ZEdGMGFXTnpJRUZ1SUdGeWNtRjVJRzltSUdGMGRISnBZblYwWlNCdVlXMWxMM1poYkhWbElIQmhhWEp6SUc5bUlIUm9aVnh1SUNvZ0lDQWdJSE4wWVhScFl5QmhkSFJ5YVdKMWRHVnpJR1p2Y2lCMGFHVWdSV3hsYldWdWRDNGdWR2hsYzJVZ2QybHNiQ0J2Ym14NUlHSmxJSE5sZENCdmJtTmxJSGRvWlc0Z2RHaGxYRzRnS2lBZ0lDQWdSV3hsYldWdWRDQnBjeUJqY21WaGRHVmtMbHh1SUNvZ1FIQmhjbUZ0SUhzdUxpNHFmU0IyWVhKZllYSm5jeUJCZEhSeWFXSjFkR1VnYm1GdFpTOTJZV3gxWlNCd1lXbHljeUJ2WmlCMGFHVWdaSGx1WVcxcFl5QmhkSFJ5YVdKMWRHVnpYRzRnS2lBZ0lDQWdabTl5SUhSb1pTQkZiR1Z0Wlc1MExseHVJQ292WEc1MllYSWdaV3hsYldWdWRFOXdaVzRnUFNCbWRXNWpkR2x2YmloMFlXY3NJR3RsZVN3Z2MzUmhkR2xqY3l3Z2RtRnlYMkZ5WjNNcElIdGNiaUFnYVdZZ0tIQnliMk5sYzNNdVpXNTJMazVQUkVWZlJVNVdJQ0U5UFNBbmNISnZaSFZqZEdsdmJpY3BJSHRjYmlBZ0lDQmhjM05sY25ST2IzUkpia0YwZEhKcFluVjBaWE1vS1R0Y2JpQWdmVnh1WEc0Z0lIWmhjaUJ1YjJSbElEMGdZV3hwWjI1WGFYUm9SRTlOS0hSaFp5d2dhMlY1TENCemRHRjBhV056S1R0Y2JseHVJQ0JwWmlBb2FHRnpRMmhoYm1kbFpFRjBkSEp6TG1Gd2NHeDVLRzV2WkdVc0lHRnlaM1Z0Wlc1MGN5a3BJSHRjYmlBZ0lDQjJZWElnYm1WM1FYUjBjbk1nUFNCMWNHUmhkR1ZPWlhkQmRIUnljeTVoY0hCc2VTaHViMlJsTENCaGNtZDFiV1Z1ZEhNcE8xeHVJQ0FnSUhWd1pHRjBaVUYwZEhKcFluVjBaWE1vYm05a1pTd2dibVYzUVhSMGNuTXBPMXh1SUNCOVhHNWNiaUFnWm1seWMzUkRhR2xzWkNncE8xeHVmVHRjYmx4dVhHNHZLaXBjYmlBcUlFUmxZMnhoY21WeklHRWdkbWx5ZEhWaGJDQkZiR1Z0Wlc1MElHRjBJSFJvWlNCamRYSnlaVzUwSUd4dlkyRjBhVzl1SUdsdUlIUm9aU0JrYjJOMWJXVnVkQzRnVkdocGMxeHVJQ29nWTI5eWNtVnpjRzl1WkhNZ2RHOGdZVzRnYjNCbGJtbHVaeUIwWVdjZ1lXNWtJR0VnWld4bGJXVnVkRU5zYjNObElIUmhaeUJwY3lCeVpYRjFhWEpsWkM0Z1ZHaHBjeUJwYzF4dUlDb2diR2xyWlNCbGJHVnRaVzUwVDNCbGJpd2dZblYwSUhSb1pTQmhkSFJ5YVdKMWRHVnpJR0Z5WlNCa1pXWnBibVZrSUhWemFXNW5JSFJvWlNCaGRIUnlJR1oxYm1OMGFXOXVYRzRnS2lCeVlYUm9aWElnZEdoaGJpQmlaV2x1WnlCd1lYTnpaV1FnWVhNZ1lYSm5kVzFsYm5SekxpQk5kWE4wSUdKbElHWnZiR3hzYjNkbFpDQmllU0F3SUc5eUlHMXZjbVVnWTJGc2JITmNiaUFxSUhSdklHRjBkSElzSUhSb1pXNGdZU0JqWVd4c0lIUnZJR1ZzWlcxbGJuUlBjR1Z1Ulc1a0xseHVJQ29nUUhCaGNtRnRJSHR6ZEhKcGJtZDlJSFJoWnlCVWFHVWdaV3hsYldWdWRDZHpJSFJoWnk1Y2JpQXFJRUJ3WVhKaGJTQjdQM04wY21sdVozMGdhMlY1SUZSb1pTQnJaWGtnZFhObFpDQjBieUJwWkdWdWRHbG1lU0IwYUdseklHVnNaVzFsYm5RdUlGUm9hWE1nWTJGdUlHSmxJR0Z1WEc0Z0tpQWdJQ0FnWlcxd2RIa2djM1J5YVc1bkxDQmlkWFFnY0dWeVptOXliV0Z1WTJVZ2JXRjVJR0psSUdKbGRIUmxjaUJwWmlCaElIVnVhWEYxWlNCMllXeDFaU0JwY3lCMWMyVmtYRzRnS2lBZ0lDQWdkMmhsYmlCcGRHVnlZWFJwYm1jZ2IzWmxjaUJoYmlCaGNuSmhlU0J2WmlCcGRHVnRjeTVjYmlBcUlFQndZWEpoYlNCN1AwRnljbUY1UENvK2ZTQnpkR0YwYVdOeklFRnVJR0Z5Y21GNUlHOW1JR0YwZEhKcFluVjBaU0J1WVcxbEwzWmhiSFZsSUhCaGFYSnpJRzltSUhSb1pWeHVJQ29nSUNBZ0lITjBZWFJwWXlCaGRIUnlhV0oxZEdWeklHWnZjaUIwYUdVZ1JXeGxiV1Z1ZEM0Z1ZHaGxjMlVnZDJsc2JDQnZibXg1SUdKbElITmxkQ0J2Ym1ObElIZG9aVzRnZEdobFhHNGdLaUFnSUNBZ1JXeGxiV1Z1ZENCcGN5QmpjbVZoZEdWa0xseHVJQ292WEc1MllYSWdaV3hsYldWdWRFOXdaVzVUZEdGeWRDQTlJR1oxYm1OMGFXOXVLSFJoWnl3Z2EyVjVMQ0J6ZEdGMGFXTnpLU0I3WEc0Z0lHbG1JQ2h3Y205alpYTnpMbVZ1ZGk1T1QwUkZYMFZPVmlBaFBUMGdKM0J5YjJSMVkzUnBiMjRuS1NCN1hHNGdJQ0FnWVhOelpYSjBUbTkwU1c1QmRIUnlhV0oxZEdWektDazdYRzRnSUNBZ2MyVjBTVzVCZEhSeWFXSjFkR1Z6S0NrN1hHNGdJSDFjYmx4dUlDQmhjbWR6UW5WcGJHUmxjbHN3WFNBOUlIUmhaenRjYmlBZ1lYSm5jMEoxYVd4a1pYSmJNVjBnUFNCclpYazdYRzRnSUdGeVozTkNkV2xzWkdWeVd6SmRJRDBnYzNSaGRHbGpjenRjYmlBZ1lYSm5jMEoxYVd4a1pYSXViR1Z1WjNSb0lEMGdRVlJVVWtsQ1ZWUkZVMTlQUmtaVFJWUTdYRzU5TzF4dVhHNWNiaThxS2lwY2JpQXFJRVJsWm1sdVpYTWdZU0IyYVhKMGRXRnNJR0YwZEhKcFluVjBaU0JoZENCMGFHbHpJSEJ2YVc1MElHOW1JSFJvWlNCRVQwMHVJRlJvYVhNZ2FYTWdiMjVzZVNCMllXeHBaRnh1SUNvZ2QyaGxiaUJqWVd4c1pXUWdZbVYwZDJWbGJpQmxiR1Z0Wlc1MFQzQmxibE4wWVhKMElHRnVaQ0JsYkdWdFpXNTBUM0JsYmtWdVpDNWNiaUFxWEc0Z0tpQkFjR0Z5WVcwZ2UzTjBjbWx1WjMwZ2JtRnRaVnh1SUNvZ1FIQmhjbUZ0SUhzcWZTQjJZV3gxWlZ4dUlDb3ZYRzUyWVhJZ1lYUjBjaUE5SUdaMWJtTjBhVzl1S0c1aGJXVXNJSFpoYkhWbEtTQjdYRzRnSUdsbUlDaHdjbTlqWlhOekxtVnVkaTVPVDBSRlgwVk9WaUFoUFQwZ0ozQnliMlIxWTNScGIyNG5LU0I3WEc0Z0lDQWdZWE56WlhKMFNXNUJkSFJ5YVdKMWRHVnpLQ2s3WEc0Z0lIMWNibHh1SUNCaGNtZHpRblZwYkdSbGNpNXdkWE5vS0c1aGJXVXNJSFpoYkhWbEtUdGNibjA3WEc1Y2JseHVMeW9xWEc0Z0tpQkRiRzl6WlhNZ1lXNGdiM0JsYmlCMFlXY2djM1JoY25SbFpDQjNhWFJvSUdWc1pXMWxiblJQY0dWdVUzUmhjblF1WEc0Z0tpOWNiblpoY2lCbGJHVnRaVzUwVDNCbGJrVnVaQ0E5SUdaMWJtTjBhVzl1S0NrZ2UxeHVJQ0JwWmlBb2NISnZZMlZ6Y3k1bGJuWXVUazlFUlY5RlRsWWdJVDA5SUNkd2NtOWtkV04wYVc5dUp5a2dlMXh1SUNBZ0lHRnpjMlZ5ZEVsdVFYUjBjbWxpZFhSbGN5Z3BPMXh1SUNBZ0lITmxkRTV2ZEVsdVFYUjBjbWxpZFhSbGN5Z3BPMXh1SUNCOVhHNWNiaUFnWld4bGJXVnVkRTl3Wlc0dVlYQndiSGtvYm5Wc2JDd2dZWEpuYzBKMWFXeGtaWElwTzF4dWZUdGNibHh1WEc0dktpcGNiaUFxSUVOc2IzTmxjeUJoYmlCdmNHVnVJSFpwY25SMVlXd2dSV3hsYldWdWRDNWNiaUFxWEc0Z0tpQkFjR0Z5WVcwZ2UzTjBjbWx1WjMwZ2RHRm5JRlJvWlNCbGJHVnRaVzUwSjNNZ2RHRm5MbHh1SUNvdlhHNTJZWElnWld4bGJXVnVkRU5zYjNObElEMGdablZ1WTNScGIyNG9kR0ZuS1NCN1hHNGdJR2xtSUNod2NtOWpaWE56TG1WdWRpNU9UMFJGWDBWT1ZpQWhQVDBnSjNCeWIyUjFZM1JwYjI0bktTQjdYRzRnSUNBZ1lYTnpaWEowVG05MFNXNUJkSFJ5YVdKMWRHVnpLQ2s3WEc0Z0lIMWNibHh1SUNCd1lYSmxiblJPYjJSbEtDazdYRzRnSUc1bGVIUlRhV0pzYVc1bktDazdYRzU5TzF4dVhHNWNiaThxS2x4dUlDb2dSR1ZqYkdGeVpYTWdZU0IyYVhKMGRXRnNJRVZzWlcxbGJuUWdZWFFnZEdobElHTjFjbkpsYm5RZ2JHOWpZWFJwYjI0Z2FXNGdkR2hsSUdSdlkzVnRaVzUwSUhSb1lYUWdhR0Z6WEc0Z0tpQnVieUJqYUdsc1pISmxiaTVjYmlBcUlFQndZWEpoYlNCN2MzUnlhVzVuZlNCMFlXY2dWR2hsSUdWc1pXMWxiblFuY3lCMFlXY3VYRzRnS2lCQWNHRnlZVzBnZXo5emRISnBibWQ5SUd0bGVTQlVhR1VnYTJWNUlIVnpaV1FnZEc4Z2FXUmxiblJwWm5rZ2RHaHBjeUJsYkdWdFpXNTBMaUJVYUdseklHTmhiaUJpWlNCaGJseHVJQ29nSUNBZ0lHVnRjSFI1SUhOMGNtbHVaeXdnWW5WMElIQmxjbVp2Y20xaGJtTmxJRzFoZVNCaVpTQmlaWFIwWlhJZ2FXWWdZU0IxYm1seGRXVWdkbUZzZFdVZ2FYTWdkWE5sWkZ4dUlDb2dJQ0FnSUhkb1pXNGdhWFJsY21GMGFXNW5JRzkyWlhJZ1lXNGdZWEp5WVhrZ2IyWWdhWFJsYlhNdVhHNGdLaUJBY0dGeVlXMGdlejlCY25KaGVUd3FQbjBnYzNSaGRHbGpjeUJCYmlCaGNuSmhlU0J2WmlCaGRIUnlhV0oxZEdVZ2JtRnRaUzkyWVd4MVpTQndZV2x5Y3lCdlppQjBhR1ZjYmlBcUlDQWdJQ0J6ZEdGMGFXTWdZWFIwY21saWRYUmxjeUJtYjNJZ2RHaGxJRVZzWlcxbGJuUXVJRlJvWlhObElIZHBiR3dnYjI1c2VTQmlaU0J6WlhRZ2IyNWpaU0IzYUdWdUlIUm9aVnh1SUNvZ0lDQWdJRVZzWlcxbGJuUWdhWE1nWTNKbFlYUmxaQzVjYmlBcUlFQndZWEpoYlNCN0xpNHVLbjBnZG1GeVgyRnlaM01nUVhSMGNtbGlkWFJsSUc1aGJXVXZkbUZzZFdVZ2NHRnBjbk1nYjJZZ2RHaGxJR1I1Ym1GdGFXTWdZWFIwY21saWRYUmxjMXh1SUNvZ0lDQWdJR1p2Y2lCMGFHVWdSV3hsYldWdWRDNWNiaUFxTDF4dWRtRnlJR1ZzWlcxbGJuUldiMmxrSUQwZ1puVnVZM1JwYjI0b2RHRm5MQ0JyWlhrc0lITjBZWFJwWTNNc0lIWmhjbDloY21kektTQjdYRzRnSUdsbUlDaHdjbTlqWlhOekxtVnVkaTVPVDBSRlgwVk9WaUFoUFQwZ0ozQnliMlIxWTNScGIyNG5LU0I3WEc0Z0lDQWdZWE56WlhKMFRtOTBTVzVCZEhSeWFXSjFkR1Z6S0NrN1hHNGdJSDFjYmx4dUlDQmxiR1Z0Wlc1MFQzQmxiaTVoY0hCc2VTaHVkV3hzTENCaGNtZDFiV1Z1ZEhNcE8xeHVJQ0JsYkdWdFpXNTBRMnh2YzJVdVlYQndiSGtvYm5Wc2JDd2dZWEpuZFcxbGJuUnpLVHRjYm4wN1hHNWNibHh1THlvcVhHNGdLaUJFWldOc1lYSmxjeUJoSUhacGNuUjFZV3dnVkdWNGRDQmhkQ0IwYUdseklIQnZhVzUwSUdsdUlIUm9aU0JrYjJOMWJXVnVkQzVjYmlBcVhHNGdLaUJBY0dGeVlXMGdlM04wY21sdVozMGdkbUZzZFdVZ1ZHaGxJSFJsZUhRZ2IyWWdkR2hsSUZSbGVIUXVYRzRnS2k5Y2JuWmhjaUIwWlhoMElEMGdablZ1WTNScGIyNG9kbUZzZFdVcElIdGNiaUFnYVdZZ0tIQnliMk5sYzNNdVpXNTJMazVQUkVWZlJVNVdJQ0U5UFNBbmNISnZaSFZqZEdsdmJpY3BJSHRjYmlBZ0lDQmhjM05sY25ST2IzUkpia0YwZEhKcFluVjBaWE1vS1R0Y2JpQWdmVnh1WEc0Z0lIWmhjaUJ1YjJSbElEMGdZV3hwWjI1WGFYUm9SRTlOS0NjamRHVjRkQ2NzSUc1MWJHd3NJSFpoYkhWbEtUdGNiaUFnZG1GeUlHUmhkR0VnUFNCblpYUkVZWFJoS0c1dlpHVXBPMXh1WEc0Z0lHbG1JQ2hrWVhSaExuUmxlSFFnSVQwOUlIWmhiSFZsS1NCN1hHNGdJQ0FnYm05a1pTNWtZWFJoSUQwZ2RtRnNkV1U3WEc0Z0lDQWdaR0YwWVM1MFpYaDBJRDBnZG1Gc2RXVTdYRzRnSUgxY2JseHVJQ0J1WlhoMFUybGliR2x1WnlncE8xeHVmVHRjYmx4dVhHNHZLaW9nS2k5Y2JtMXZaSFZzWlM1bGVIQnZjblJ6SUQwZ2UxeHVJQ0JsYkdWdFpXNTBUM0JsYmxOMFlYSjBPaUJsYkdWdFpXNTBUM0JsYmxOMFlYSjBMRnh1SUNCbGJHVnRaVzUwVDNCbGJrVnVaRG9nWld4bGJXVnVkRTl3Wlc1RmJtUXNYRzRnSUdWc1pXMWxiblJQY0dWdU9pQmxiR1Z0Wlc1MFQzQmxiaXhjYmlBZ1pXeGxiV1Z1ZEZadmFXUTZJR1ZzWlcxbGJuUldiMmxrTEZ4dUlDQmxiR1Z0Wlc1MFEyeHZjMlU2SUdWc1pXMWxiblJEYkc5elpTeGNiaUFnZEdWNGREb2dkR1Y0ZEN4Y2JpQWdZWFIwY2pvZ1lYUjBjbHh1ZlR0Y2JseHVJbDE5IiwiLyoqXG4gKiBDb3B5cmlnaHQgMjAxNSBUaGUgSW5jcmVtZW50YWwgRE9NIEF1dGhvcnMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAqIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAqIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuICpcbiAqICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG4gKlxuICogVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICogZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUy1JU1wiIEJBU0lTLFxuICogV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gKiBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gKiBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiAqL1xuXG4vKipcbiAqIEB0eXBlIHtUcmVlV2Fsa2VyfVxuICovXG52YXIgd2Fsa2VyXztcblxuXG4vKipcbiAqIEByZXR1cm4ge1RyZWVXYWxrZXJ9IHRoZSBjdXJyZW50IFRyZWVXYWxrZXJcbiAqL1xudmFyIGdldFdhbGtlciA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gd2Fsa2VyXztcbn07XG5cblxuLyoqXG4gKiBTZXRzIHRoZSBjdXJyZW50IFRyZWVXYWxrZXJcbiAqIEBwYXJhbSB7VHJlZVdhbGtlcn0gd2Fsa2VyXG4gKi9cbnZhciBzZXRXYWxrZXIgPSBmdW5jdGlvbih3YWxrZXIpIHtcbiAgd2Fsa2VyXyA9IHdhbGtlcjtcbn07XG5cblxuLyoqICovXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZ2V0V2Fsa2VyOiBnZXRXYWxrZXIsXG4gIHNldFdhbGtlcjogc2V0V2Fsa2VyXG59O1xuXG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBwcm90byA9IEVsZW1lbnQucHJvdG90eXBlO1xudmFyIHZlbmRvciA9IHByb3RvLm1hdGNoZXNcbiAgfHwgcHJvdG8ubWF0Y2hlc1NlbGVjdG9yXG4gIHx8IHByb3RvLndlYmtpdE1hdGNoZXNTZWxlY3RvclxuICB8fCBwcm90by5tb3pNYXRjaGVzU2VsZWN0b3JcbiAgfHwgcHJvdG8ubXNNYXRjaGVzU2VsZWN0b3JcbiAgfHwgcHJvdG8ub01hdGNoZXNTZWxlY3RvcjtcblxubW9kdWxlLmV4cG9ydHMgPSBtYXRjaDtcblxuLyoqXG4gKiBNYXRjaCBgZWxgIHRvIGBzZWxlY3RvcmAuXG4gKlxuICogQHBhcmFtIHtFbGVtZW50fSBlbFxuICogQHBhcmFtIHtTdHJpbmd9IHNlbGVjdG9yXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBtYXRjaChlbCwgc2VsZWN0b3IpIHtcbiAgaWYgKHZlbmRvcikgcmV0dXJuIHZlbmRvci5jYWxsKGVsLCBzZWxlY3Rvcik7XG4gIHZhciBub2RlcyA9IGVsLnBhcmVudE5vZGUucXVlcnlTZWxlY3RvckFsbChzZWxlY3Rvcik7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAobm9kZXNbaV0gPT0gZWwpIHJldHVybiB0cnVlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn0iLCJ2YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciBoYXNPd24gPSByZXF1aXJlKFwiaGFzLW93bi1wcm9wXCIpO1xudmFyIGNsb25lID0gcmVxdWlyZShcInNoYWxsb3ctY29weVwiKTtcbnZhciBpc1BsYWluT2JqZWN0ID0gcmVxdWlyZShcImlzLXBsYWluLW9iamVjdFwiKTtcbnZhciBwYXRjaEFycmF5ID0gcmVxdWlyZShcImFycmF5LXNweVwiKTtcblxudmFyIHRyYWNrID1cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCByZXBsYWNlcikge1xuXHRmdW5jdGlvbiByZXBsYWNlKGssIHYpIHtcblx0XHR2YXIgbnZhbDtcblx0XHRpZiAodHlwZW9mIHJlcGxhY2VyID09PSBcImZ1bmN0aW9uXCIpIG52YWwgPSByZXBsYWNlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHRcdGlmICh0eXBlb2YgbnZhbCA9PT0gXCJ1bmRlZmluZWRcIiAmJiB0eXBlb2YgdiAhPT0gXCJ1bmRlZmluZWRcIikgbnZhbCA9IHRyYWNrKHYpO1xuXHRcdHJldHVybiBudmFsO1xuXHR9XG5cblx0aWYgKEFycmF5LmlzQXJyYXkob2JqKSkgcmV0dXJuIHRyYWNrQXJyYXkob2JqLCByZXBsYWNlKVxuXHRpZiAoaXNQbGFpbk9iamVjdChvYmopKSByZXR1cm4gdHJhY2tPYmplY3Qob2JqLCByZXBsYWNlKTtcblx0cmV0dXJuIG9iajtcbn1cblxudmFyIHRyYWNrUHJvcGVydHkgPVxudHJhY2sudHJhY2tQcm9wZXJ0eSA9IGZ1bmN0aW9uKG9iaiwgcHJvcCwgdmFsdWUsIG9wdGlvbnMpIHtcblx0aWYgKHR5cGVvZiBvYmogIT09IFwib2JqZWN0XCIgfHwgb2JqID09IG51bGwpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgb2JqZWN0IHRvIGRlZmluZSB0aGUgcmVhY3RpdmUgcHJvcGVydHkgb24uXCIpO1xuXHR9XG5cblx0aWYgKHR5cGVvZiBwcm9wICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIGZvciBwcm9wZXJ0eSBuYW1lLlwiKTtcblxuXHR2YXIgZGVwID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5O1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShvYmosIHByb3AsIHtcblx0XHRjb25maWd1cmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmNvbmZpZ3VyYWJsZSAhPT0gZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuZW51bWVyYWJsZSAhPT0gZmFsc2UsXG5cdFx0c2V0OiBmdW5jdGlvbih2YWwpIHtcblx0XHRcdGlmICh2YWwgIT09IHZhbHVlKSB7XG5cdFx0XHRcdHZhbHVlID0gdmFsO1xuXHRcdFx0XHRkZXAuY2hhbmdlZCgpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fSk7XG5cblx0cmV0dXJuIG9iajtcbn1cblxudmFyIHRyYWNrT2JqZWN0ID1cbnRyYWNrLnRyYWNrT2JqZWN0ID0gZnVuY3Rpb24ocHJvcHMsIHJlcGxhY2VyKSB7XG5cdGlmIChwcm9wcy5fX3JlYWN0aXZlKSByZXR1cm4gcHJvcHM7XG5cblx0dmFyIHZhbHVlcyA9IHt9O1xuXHR2YXIgZGVwcyA9IHt9O1xuXHR2YXIgbWFpbkRlcCA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXG5cdGZ1bmN0aW9uIHJlcGxhY2UoY3R4LCBuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiByZXBsYWNlciA9PT0gXCJmdW5jdGlvblwiID8gcmVwbGFjZXIuY2FsbChjdHgsIG5hbWUsIHZhbHVlKSA6IHZhbHVlO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0dGVyKG5hbWUpIHtcblx0XHRkZXBzW25hbWVdLmRlcGVuZCgpO1xuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR0ZXIobmFtZSwgdmFsdWUpIHtcblx0XHR2YXIgb2xkID0gdmFsdWVzW25hbWVdO1xuXHRcdHZhbHVlc1tuYW1lXSA9IHJlcGxhY2UodGhpcywgbmFtZSwgdmFsdWUpO1xuXG5cdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0aWYgKGRlcCA9PSBudWxsKSBkZXAgPSBkZXBzW25hbWVdID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cdFx0aWYgKG9sZCAhPT0gdmFsdWVzW25hbWVdKSBkZXAuY2hhbmdlZCgpO1xuXG5cdFx0bWFpbkRlcC5jaGFuZ2VkKCk7XG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdHZhciBfcHJvdG8gPSB0eXBlb2YgcHJvcHMuY29uc3RydWN0b3IgPT09IFwiZnVuY3Rpb25cIiA/IE9iamVjdC5jcmVhdGUocHJvcHMuY29uc3RydWN0b3IucHJvdG90eXBlKSA6IHt9O1xuXG5cdF9wcm90by5kZWZpbmVQcm9wZXJ0eSA9IGZ1bmN0aW9uKG5hbWUsIHZhbHVlLCBvcHRpb25zKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIG5hbWUsIHtcblx0XHRcdGNvbmZpZ3VyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuY29uZmlndXJhYmxlICE9PSBmYWxzZSxcblx0XHRcdGVudW1lcmFibGU6IG9wdGlvbnMgPT0gbnVsbCB8fCBvcHRpb25zLmVudW1lcmFibGUgIT09IGZhbHNlLFxuXHRcdFx0Z2V0OiBnZXR0ZXIuYmluZCh0aGlzLCBuYW1lKSxcblx0XHRcdHNldDogc2V0dGVyLmJpbmQodGhpcywgbmFtZSlcblx0XHR9KTtcblxuXHRcdHRoaXNbbmFtZV0gPSB2YWx1ZTtcblx0XHRyZXR1cm4gdGhpcztcblx0fTtcblxuXHRfcHJvdG8uZGVsZXRlUHJvcGVydHkgPSBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0aWYgKGRlbGV0ZSB0aGlzW25hbWVdKSB7IC8vIGluIGNhc2UgY29uZmlndXJhYmxlID09PSBmYWxzZVxuXHRcdFx0ZGVsZXRlIHZhbHVlc1tuYW1lXTtcblx0XHRcdGRlbGV0ZSBkZXBzW25hbWVdO1xuXHRcdFx0aWYgKGRlcCkgZGVwLmNoYW5nZWQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH07XG5cblx0X3Byb3RvLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xuXHRcdG1haW5EZXAuZGVwZW5kKCk7XG5cdFx0cmV0dXJuIGNsb25lKHZhbHVlcyk7XG5cdH07XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KF9wcm90bywgXCJfX3JlYWN0aXZlXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdHZhbHVlOiB0cnVlLFxuXHRcdHdyaXRlYWJsZTogZmFsc2Vcblx0fSk7XG5cblx0dmFyIHJvYmogPSBPYmplY3QuY3JlYXRlKF9wcm90byk7XG5cblx0Zm9yICh2YXIga2V5IGluIHByb3BzKSB7XG5cdFx0aWYgKGhhc093bihwcm9wcywga2V5KSkgcm9iai5kZWZpbmVQcm9wZXJ0eShrZXksIHByb3BzW2tleV0pO1xuXHR9XG5cblx0cmV0dXJuIHJvYmo7XG59XG5cbnZhciB0cmFja0FycmF5ID1cbnRyYWNrLnRyYWNrQXJyYXkgPSBmdW5jdGlvbihhcnIsIHJlcGxhY2VyKSB7XG5cdGlmICghQXJyYXkuaXNBcnJheShhcnIpKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYXJyYXkuXCIpO1xuXHRpZiAoYXJyLl9fcmVhY3RpdmUpIHJldHVybiBhcnI7XG5cblx0dmFyIGRlcHMgPSB7IGxlbmd0aDogbmV3IFRyYWNrci5EZXBlbmRlbmN5KCkgfTtcblx0dmFyIHZhbHVlcyA9IHt9O1xuXHR2YXIgbmFyciA9IHBhdGNoQXJyYXkoW10pO1xuXG5cdGZ1bmN0aW9uIHJlcGxhY2UoY3R4LCBuYW1lLCB2YWx1ZSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIHR5cGVvZiByZXBsYWNlciA9PT0gXCJmdW5jdGlvblwiID8gcmVwbGFjZXIuY2FsbChjdHgsIG5hbWUsIHZhbHVlKSA6IHZhbHVlO1xuXHRcdH0pO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0dGVyKG5hbWUpIHtcblx0XHRkZXBzW25hbWVdLmRlcGVuZCgpO1xuXHRcdHJldHVybiB2YWx1ZXNbbmFtZV07XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR0ZXIobmFtZSwgdmFsdWUpIHtcblx0XHR2YXIgb2xkID0gdmFsdWVzW25hbWVdO1xuXHRcdHZhbHVlc1tuYW1lXSA9IHJlcGxhY2UodGhpcywgbmFtZSwgdmFsdWUpO1xuXG5cdFx0dmFyIGRlcCA9IGRlcHNbbmFtZV07XG5cdFx0aWYgKGRlcCA9PSBudWxsKSBkZXAgPSBkZXBzW25hbWVdID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cdFx0aWYgKG9sZCAhPT0gdmFsdWVzW25hbWVdKSBkZXAuY2hhbmdlZCgpO1xuXG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdGZ1bmN0aW9uIGRlZmluZShpKSB7XG5cdFx0dmFyIGRlcDtcblxuXHRcdGlmICh0eXBlb2YgaSA9PT0gXCJudW1iZXJcIiAmJiBpID49IG5hcnIubGVuZ3RoKSB7XG5cdFx0XHRpZiAoKGRlcCA9IGRlcHNbaV0pICE9IG51bGwpIHtcblx0XHRcdFx0ZGVsZXRlIGRlcHNbaV07XG5cdFx0XHR9XG5cblx0XHRcdGRlbGV0ZSBuYXJyW2ldO1xuXHRcdFx0ZGVsZXRlIHZhbHVlc1tpXTtcblx0XHRcdGRlcC5jaGFuZ2VkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c2V0dGVyLmNhbGwodGhpcywgaSwgbmFycltpXSk7XG5cblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgaS50b1N0cmluZygpLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IHRydWUsXG5cdFx0XHRlbnVtZXJhYmxlOiB0cnVlLFxuXHRcdFx0Z2V0OiBnZXR0ZXIuYmluZChuYXJyLCBpKSxcblx0XHRcdHNldDogc2V0dGVyLmJpbmQobmFyciwgaSlcblx0XHR9KTtcblx0fVxuXG5cdG5hcnIub2JzZXJ2ZShmdW5jdGlvbihjaGcpIHtcblx0XHR2YXIgYmFsYW5jZSwgc3RhcnQsIGVuZCwgbGVuLCBpLCBwcmV2bGVuO1xuXG5cdFx0aWYgKGNoZyA9PSBudWxsKSByZXR1cm47XG5cblx0XHRiYWxhbmNlID0gY2hnLmFkZGVkIC0gY2hnLnJlbW92ZWQ7XG5cdFx0aWYgKCFiYWxhbmNlKSByZXR1cm47XG5cblx0XHRsZW4gPSBuYXJyLmxlbmd0aDtcblx0XHRwcmV2bGVuID0gbGVuIC0gYmFsYW5jZTtcblx0XHRzdGFydCA9IE1hdGgubWluKHByZXZsZW4sIGxlbik7XG5cdFx0ZW5kID0gTWF0aC5tYXgocHJldmxlbiwgbGVuKTtcblxuXHRcdGZvciAoaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIGRlZmluZShpKTtcblx0XHRkZXBzLmxlbmd0aC5jaGFuZ2VkKCk7XG5cdH0pO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBcIl9fcmVhY3RpdmVcIiwge1xuXHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0dmFsdWU6IHRydWUsXG5cdFx0d3JpdGVhYmxlOiBmYWxzZVxuXHR9KTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkobmFyciwgXCIkbGVuZ3RoXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRkZXBzLmxlbmd0aC5kZXBlbmQoKTtcblx0XHRcdHJldHVybiB0aGlzLmxlbmd0aDtcblx0XHR9XG5cdH0pO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBcImRlcGVuZFwiLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHRnZXQ6IGZ1bmN0aW9uKCkge1xuXHRcdFx0ZGVwcy5sZW5ndGguZGVwZW5kKCk7XG5cdFx0fVxuXHR9KTtcblxuXHRuYXJyLnB1c2guYXBwbHkobmFyciwgYXJyKTtcblx0cmV0dXJuIG5hcnI7XG59XG4iLCIvLyBhcnJheSB3cml0ZSBvcGVyYXRpb25zXG52YXIgbXV0YXRvck1ldGhvZHMgPSBbICdwb3AnLCAncHVzaCcsICdyZXZlcnNlJywgJ3NoaWZ0JywgJ3NvcnQnLCAnc3BsaWNlJywgJ3Vuc2hpZnQnIF07XG5cbi8vIHBhdGNoZXMgYW4gYXJyYXkgc28gd2UgY2FuIGxpc3RlbiB0byB3cml0ZSBvcGVyYXRpb25zXG52YXIgcGF0Y2hBcnJheSA9XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGFycikge1xuXHRpZiAoYXJyLl9wYXRjaGVkKSByZXR1cm4gYXJyO1xuXG5cdHZhciBwYXRjaGVkQXJyYXlQcm90byA9IFtdLFxuXHRcdG9ic2VydmVycyA9IFtdO1xuXG5cdG11dGF0b3JNZXRob2RzLmZvckVhY2goZnVuY3Rpb24obWV0aG9kTmFtZSkge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShwYXRjaGVkQXJyYXlQcm90bywgbWV0aG9kTmFtZSwge1xuXHRcdFx0dmFsdWU6IG1ldGhvZFxuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gbWV0aG9kKCkge1xuXHRcdFx0dmFyIHNwbGljZUVxdWl2YWxlbnQsIHN1bW1hcnksIGFyZ3MsIHJlcztcblxuXHRcdFx0YXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG5cblx0XHRcdC8vIGNvbnZlcnQgdGhlIG9wZXJhdGlvbiBpbnRvIGEgc3BsaWNlXG5cdFx0XHRzcGxpY2VFcXVpdmFsZW50ID0gZ2V0U3BsaWNlRXF1aXZhbGVudCh0aGlzLCBtZXRob2ROYW1lLCBhcmdzKTtcblx0XHRcdHN1bW1hcnkgPSBzdW1tYXJpc2VTcGxpY2VPcGVyYXRpb24odGhpcywgc3BsaWNlRXF1aXZhbGVudCk7XG5cblx0XHRcdC8vIHJ1biB0aGUgaW50ZW5kZWQgbWV0aG9kXG5cdFx0XHRyZXMgPSBBcnJheS5wcm90b3R5cGVbbWV0aG9kTmFtZV0uYXBwbHkodGhpcywgYXJncyk7XG5cblx0XHRcdC8vIGNhbGwgdGhlIG9iZXJzdnNlcnNcblx0XHRcdG9ic2VydmVycy5mb3JFYWNoKGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHRcdGZuLmNhbGwodGhpcywgc3VtbWFyeSk7XG5cdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0Ly8gcmV0dXJuIHRoZSByZXN1bHQgb2YgdGhlIG1ldGhvZFxuXHRcdFx0cmV0dXJuIHJlcztcblx0XHR9O1xuXHR9KTtcblxuXHRpZiAoKHt9KS5fX3Byb3RvX18pIGFyci5fX3Byb3RvX18gPSBwYXRjaGVkQXJyYXlQcm90bztcblx0ZWxzZSB7XG5cdFx0bXV0YXRvck1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoYXJyLCBtZXRob2ROYW1lLCB7XG5cdFx0XHRcdHZhbHVlOiBwYXRjaGVkQXJyYXlQcm90b1ttZXRob2ROYW1lXSxcblx0XHRcdFx0Y29uZmlndXJhYmxlOiB0cnVlXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHZhciBleHRyYXMgPSB7XG5cdFx0X3BhdGNoZWQ6IHRydWUsXG5cdFx0b2JzZXJ2ZTogZnVuY3Rpb24oZm4pIHtcblx0XHRcdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIGZ1bmN0aW9uIHRvIG9ic2VydmUgd2l0aC5cIik7XG5cdFx0XHRvYnNlcnZlcnMucHVzaChmbik7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9LFxuXHRcdHN0b3BPYnNlcnZpbmc6IGZ1bmN0aW9uKGZuKSB7XG5cdFx0XHR2YXIgaW5kZXggPSBvYnNlcnZlcnMuaW5kZXhPZihmbik7XG5cdFx0XHRpZiAoaW5kZXggPiAtMSkgb2JzZXJ2ZXJzLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cdH07XG5cblx0Zm9yICh2YXIgayBpbiBleHRyYXMpIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoYXJyLCBrLCB7XG5cdFx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0XHR2YWx1ZTogZXh0cmFzW2tdLFxuXHRcdFx0d3JpdGVhYmxlOiBmYWxzZVxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIGFycjtcbn1cblxuLy8gY29udmVydHMgYXJyYXkgd3JpdGUgb3BlcmF0aW9ucyBpbnRvIHNwbGljZSBlcXVpdmFsZW50IGFyZ3VtZW50c1xudmFyIGdldFNwbGljZUVxdWl2YWxlbnQgPVxucGF0Y2hBcnJheS5nZXRTcGxpY2VFcXVpdmFsZW50ID0gZnVuY3Rpb24gKCBhcnJheSwgbWV0aG9kTmFtZSwgYXJncyApIHtcblx0c3dpdGNoICggbWV0aG9kTmFtZSApIHtcblx0XHRjYXNlICdzcGxpY2UnOlxuXHRcdFx0cmV0dXJuIGFyZ3M7XG5cblx0XHRjYXNlICdzb3J0Jzpcblx0XHRjYXNlICdyZXZlcnNlJzpcblx0XHRcdHJldHVybiBudWxsO1xuXG5cdFx0Y2FzZSAncG9wJzpcblx0XHRcdGlmICggYXJyYXkubGVuZ3RoICkge1xuXHRcdFx0XHRyZXR1cm4gWyAtMSBdO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cblx0XHRjYXNlICdwdXNoJzpcblx0XHRcdHJldHVybiBbIGFycmF5Lmxlbmd0aCwgMCBdLmNvbmNhdCggYXJncyApO1xuXG5cdFx0Y2FzZSAnc2hpZnQnOlxuXHRcdFx0cmV0dXJuIFsgMCwgMSBdO1xuXG5cdFx0Y2FzZSAndW5zaGlmdCc6XG5cdFx0XHRyZXR1cm4gWyAwLCAwIF0uY29uY2F0KCBhcmdzICk7XG5cdH1cbn1cblxuLy8gcmV0dXJucyBhIHN1bW1hcnkgcGYgaG93IGFuIGFycmF5IHdpbGwgYmUgY2hhbmdlZCBhZnRlciB0aGUgc3BsaWNlIG9wZXJhdGlvblxudmFyIHN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbiA9XG5wYXRjaEFycmF5LnN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbiA9IGZ1bmN0aW9uICggYXJyYXksIGFyZ3MgKSB7XG5cdHZhciBpbmRleCwgYWRkZWRJdGVtcywgcmVtb3ZlZEl0ZW1zO1xuXG5cdGlmICghYXJncykgcmV0dXJuIG51bGw7XG5cblx0Ly8gZmlndXJlIG91dCB3aGVyZSB0aGUgY2hhbmdlcyBzdGFydGVkLi4uXG5cdGluZGV4ID0gKyggYXJnc1swXSA8IDAgPyBhcnJheS5sZW5ndGggKyBhcmdzWzBdIDogYXJnc1swXSApO1xuXG5cdC8vIC4uLmFuZCBob3cgbWFueSBpdGVtcyB3ZXJlIGFkZGVkIHRvIG9yIHJlbW92ZWQgZnJvbSB0aGUgYXJyYXlcblx0YWRkZWRJdGVtcyA9IE1hdGgubWF4KCAwLCBhcmdzLmxlbmd0aCAtIDIgKTtcblx0cmVtb3ZlZEl0ZW1zID0gKCBhcmdzWzFdICE9PSB1bmRlZmluZWQgPyBhcmdzWzFdIDogYXJyYXkubGVuZ3RoIC0gaW5kZXggKTtcblxuXHQvLyBJdCdzIHBvc3NpYmxlIHRvIGRvIGUuZy4gWyAxLCAyLCAzIF0uc3BsaWNlKCAyLCAyICkgLSBpLmUuIHRoZSBzZWNvbmQgYXJndW1lbnRcblx0Ly8gbWVhbnMgcmVtb3ZpbmcgbW9yZSBpdGVtcyBmcm9tIHRoZSBlbmQgb2YgdGhlIGFycmF5IHRoYW4gdGhlcmUgYXJlLiBJbiB0aGVzZVxuXHQvLyBjYXNlcyB3ZSBuZWVkIHRvIGN1cmIgSmF2YVNjcmlwdCdzIGVudGh1c2lhc20gb3Igd2UnbGwgZ2V0IG91dCBvZiBzeW5jXG5cdHJlbW92ZWRJdGVtcyA9IE1hdGgubWluKCByZW1vdmVkSXRlbXMsIGFycmF5Lmxlbmd0aCAtIGluZGV4ICk7XG5cblx0cmV0dXJuIHtcblx0XHRpbmRleDogaW5kZXgsXG5cdFx0YWRkZWQ6IGFkZGVkSXRlbXMsXG5cdFx0cmVtb3ZlZDogcmVtb3ZlZEl0ZW1zXG5cdH07XG59XG4iLCIndXNlIHN0cmljdCc7XG52YXIgaGFzT3duUHJvcCA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaiwgcHJvcCkge1xuXHRyZXR1cm4gaGFzT3duUHJvcC5jYWxsKG9iaiwgcHJvcCk7XG59O1xuIiwiLyohXG4gKiBpcy1wbGFpbi1vYmplY3QgPGh0dHBzOi8vZ2l0aHViLmNvbS9qb25zY2hsaW5rZXJ0L2lzLXBsYWluLW9iamVjdD5cbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNSwgSm9uIFNjaGxpbmtlcnQuXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgaXNPYmplY3QgPSByZXF1aXJlKCdpc29iamVjdCcpO1xuXG5mdW5jdGlvbiBpc09iamVjdE9iamVjdChvKSB7XG4gIHJldHVybiBpc09iamVjdChvKSA9PT0gdHJ1ZVxuICAgICYmIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKSA9PT0gJ1tvYmplY3QgT2JqZWN0XSc7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaXNQbGFpbk9iamVjdChvKSB7XG4gIHZhciBjdG9yLHByb3Q7XG4gIFxuICBpZiAoaXNPYmplY3RPYmplY3QobykgPT09IGZhbHNlKSByZXR1cm4gZmFsc2U7XG4gIFxuICAvLyBJZiBoYXMgbW9kaWZpZWQgY29uc3RydWN0b3JcbiAgY3RvciA9IG8uY29uc3RydWN0b3I7XG4gIGlmICh0eXBlb2YgY3RvciAhPT0gJ2Z1bmN0aW9uJykgcmV0dXJuIGZhbHNlO1xuICBcbiAgLy8gSWYgaGFzIG1vZGlmaWVkIHByb3RvdHlwZVxuICBwcm90ID0gY3Rvci5wcm90b3R5cGU7XG4gIGlmIChpc09iamVjdE9iamVjdChwcm90KSA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgXG4gIC8vIElmIGNvbnN0cnVjdG9yIGRvZXMgbm90IGhhdmUgYW4gT2JqZWN0LXNwZWNpZmljIG1ldGhvZFxuICBpZiAocHJvdC5oYXNPd25Qcm9wZXJ0eSgnaXNQcm90b3R5cGVPZicpID09PSBmYWxzZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBcbiAgLy8gTW9zdCBsaWtlbHkgYSBwbGFpbiBPYmplY3RcbiAgcmV0dXJuIHRydWU7XG59O1xuIiwiLyohXG4gKiBpc29iamVjdCA8aHR0cHM6Ly9naXRodWIuY29tL2pvbnNjaGxpbmtlcnQvaXNvYmplY3Q+XG4gKlxuICogQ29weXJpZ2h0IChjKSAyMDE0LTIwMTUsIEpvbiBTY2hsaW5rZXJ0LlxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLlxuICovXG5cbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc09iamVjdCh2YWwpIHtcbiAgcmV0dXJuIHZhbCAhPSBudWxsICYmIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnXG4gICAgJiYgIUFycmF5LmlzQXJyYXkodmFsKTtcbn07XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIChvYmopIHtcbiAgICBpZiAoIW9iaiB8fCB0eXBlb2Ygb2JqICE9PSAnb2JqZWN0JykgcmV0dXJuIG9iajtcbiAgICBcbiAgICB2YXIgY29weTtcbiAgICBcbiAgICBpZiAoaXNBcnJheShvYmopKSB7XG4gICAgICAgIHZhciBsZW4gPSBvYmoubGVuZ3RoO1xuICAgICAgICBjb3B5ID0gQXJyYXkobGVuKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgY29weVtpXSA9IG9ialtpXTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdmFyIGtleXMgPSBvYmplY3RLZXlzKG9iaik7XG4gICAgICAgIGNvcHkgPSB7fTtcbiAgICAgICAgXG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0ga2V5cy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgICAgICAgY29weVtrZXldID0gb2JqW2tleV07XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGNvcHk7XG59O1xuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgICAgaWYgKHt9Lmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSBrZXlzLnB1c2goa2V5KTtcbiAgICB9XG4gICAgcmV0dXJuIGtleXM7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gICAgcmV0dXJuIHt9LnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcbiIsInZhciBub3cgPSByZXF1aXJlKCdwZXJmb3JtYW5jZS1ub3cnKVxuICAsIGdsb2JhbCA9IHR5cGVvZiB3aW5kb3cgPT09ICd1bmRlZmluZWQnID8ge30gOiB3aW5kb3dcbiAgLCB2ZW5kb3JzID0gWydtb3onLCAnd2Via2l0J11cbiAgLCBzdWZmaXggPSAnQW5pbWF0aW9uRnJhbWUnXG4gICwgcmFmID0gZ2xvYmFsWydyZXF1ZXN0JyArIHN1ZmZpeF1cbiAgLCBjYWYgPSBnbG9iYWxbJ2NhbmNlbCcgKyBzdWZmaXhdIHx8IGdsb2JhbFsnY2FuY2VsUmVxdWVzdCcgKyBzdWZmaXhdXG5cbmZvcih2YXIgaSA9IDA7IGkgPCB2ZW5kb3JzLmxlbmd0aCAmJiAhcmFmOyBpKyspIHtcbiAgcmFmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnUmVxdWVzdCcgKyBzdWZmaXhdXG4gIGNhZiA9IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbCcgKyBzdWZmaXhdXG4gICAgICB8fCBnbG9iYWxbdmVuZG9yc1tpXSArICdDYW5jZWxSZXF1ZXN0JyArIHN1ZmZpeF1cbn1cblxuLy8gU29tZSB2ZXJzaW9ucyBvZiBGRiBoYXZlIHJBRiBidXQgbm90IGNBRlxuaWYoIXJhZiB8fCAhY2FmKSB7XG4gIHZhciBsYXN0ID0gMFxuICAgICwgaWQgPSAwXG4gICAgLCBxdWV1ZSA9IFtdXG4gICAgLCBmcmFtZUR1cmF0aW9uID0gMTAwMCAvIDYwXG5cbiAgcmFmID0gZnVuY3Rpb24oY2FsbGJhY2spIHtcbiAgICBpZihxdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgIHZhciBfbm93ID0gbm93KClcbiAgICAgICAgLCBuZXh0ID0gTWF0aC5tYXgoMCwgZnJhbWVEdXJhdGlvbiAtIChfbm93IC0gbGFzdCkpXG4gICAgICBsYXN0ID0gbmV4dCArIF9ub3dcbiAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBjcCA9IHF1ZXVlLnNsaWNlKDApXG4gICAgICAgIC8vIENsZWFyIHF1ZXVlIGhlcmUgdG8gcHJldmVudFxuICAgICAgICAvLyBjYWxsYmFja3MgZnJvbSBhcHBlbmRpbmcgbGlzdGVuZXJzXG4gICAgICAgIC8vIHRvIHRoZSBjdXJyZW50IGZyYW1lJ3MgcXVldWVcbiAgICAgICAgcXVldWUubGVuZ3RoID0gMFxuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY3AubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBpZighY3BbaV0uY2FuY2VsbGVkKSB7XG4gICAgICAgICAgICB0cnl7XG4gICAgICAgICAgICAgIGNwW2ldLmNhbGxiYWNrKGxhc3QpXG4gICAgICAgICAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHsgdGhyb3cgZSB9LCAwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSwgTWF0aC5yb3VuZChuZXh0KSlcbiAgICB9XG4gICAgcXVldWUucHVzaCh7XG4gICAgICBoYW5kbGU6ICsraWQsXG4gICAgICBjYWxsYmFjazogY2FsbGJhY2ssXG4gICAgICBjYW5jZWxsZWQ6IGZhbHNlXG4gICAgfSlcbiAgICByZXR1cm4gaWRcbiAgfVxuXG4gIGNhZiA9IGZ1bmN0aW9uKGhhbmRsZSkge1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgaWYocXVldWVbaV0uaGFuZGxlID09PSBoYW5kbGUpIHtcbiAgICAgICAgcXVldWVbaV0uY2FuY2VsbGVkID0gdHJ1ZVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKGZuKSB7XG4gIC8vIFdyYXAgaW4gYSBuZXcgZnVuY3Rpb24gdG8gcHJldmVudFxuICAvLyBgY2FuY2VsYCBwb3RlbnRpYWxseSBiZWluZyBhc3NpZ25lZFxuICAvLyB0byB0aGUgbmF0aXZlIHJBRiBmdW5jdGlvblxuICByZXR1cm4gcmFmLmNhbGwoZ2xvYmFsLCBmbilcbn1cbm1vZHVsZS5leHBvcnRzLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICBjYWYuYXBwbHkoZ2xvYmFsLCBhcmd1bWVudHMpXG59XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuLy8gR2VuZXJhdGVkIGJ5IENvZmZlZVNjcmlwdCAxLjcuMVxuKGZ1bmN0aW9uKCkge1xuICB2YXIgZ2V0TmFub1NlY29uZHMsIGhydGltZSwgbG9hZFRpbWU7XG5cbiAgaWYgKCh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgcGVyZm9ybWFuY2UgIT09IG51bGwpICYmIHBlcmZvcm1hbmNlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgfTtcbiAgfSBlbHNlIGlmICgodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2VzcyAhPT0gbnVsbCkgJiYgcHJvY2Vzcy5ocnRpbWUpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIChnZXROYW5vU2Vjb25kcygpIC0gbG9hZFRpbWUpIC8gMWU2O1xuICAgIH07XG4gICAgaHJ0aW1lID0gcHJvY2Vzcy5ocnRpbWU7XG4gICAgZ2V0TmFub1NlY29uZHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBocjtcbiAgICAgIGhyID0gaHJ0aW1lKCk7XG4gICAgICByZXR1cm4gaHJbMF0gKiAxZTkgKyBoclsxXTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gZ2V0TmFub1NlY29uZHMoKTtcbiAgfSBlbHNlIGlmIChEYXRlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gRGF0ZS5ub3coKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBEYXRlLm5vdygpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH1cblxufSkuY2FsbCh0aGlzKTtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoJ19wcm9jZXNzJykpXG4vLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247Y2hhcnNldDp1dGYtODtiYXNlNjQsZXlKMlpYSnphVzl1SWpvekxDSnpiM1Z5WTJWeklqcGJJbTV2WkdWZmJXOWtkV3hsY3k5MGNtRmphM0l2Ym05a1pWOXRiMlIxYkdWekwzSmhaaTl1YjJSbFgyMXZaSFZzWlhNdmNHVnlabTl5YldGdVkyVXRibTkzTDJ4cFlpOXdaWEptYjNKdFlXNWpaUzF1YjNjdWFuTWlYU3dpYm1GdFpYTWlPbHRkTENKdFlYQndhVzVuY3lJNklqdEJRVUZCTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRU0lzSW1acGJHVWlPaUpuWlc1bGNtRjBaV1F1YW5NaUxDSnpiM1Z5WTJWU2IyOTBJam9pSWl3aWMyOTFjbU5sYzBOdmJuUmxiblFpT2xzaUx5OGdSMlZ1WlhKaGRHVmtJR0o1SUVOdlptWmxaVk5qY21sd2RDQXhMamN1TVZ4dUtHWjFibU4wYVc5dUtDa2dlMXh1SUNCMllYSWdaMlYwVG1GdWIxTmxZMjl1WkhNc0lHaHlkR2x0WlN3Z2JHOWhaRlJwYldVN1hHNWNiaUFnYVdZZ0tDaDBlWEJsYjJZZ2NHVnlabTl5YldGdVkyVWdJVDA5SUZ3aWRXNWtaV1pwYm1Wa1hDSWdKaVlnY0dWeVptOXliV0Z1WTJVZ0lUMDlJRzUxYkd3cElDWW1JSEJsY21admNtMWhibU5sTG01dmR5a2dlMXh1SUNBZ0lHMXZaSFZzWlM1bGVIQnZjblJ6SUQwZ1puVnVZM1JwYjI0b0tTQjdYRzRnSUNBZ0lDQnlaWFIxY200Z2NHVnlabTl5YldGdVkyVXVibTkzS0NrN1hHNGdJQ0FnZlR0Y2JpQWdmU0JsYkhObElHbG1JQ2dvZEhsd1pXOW1JSEJ5YjJObGMzTWdJVDA5SUZ3aWRXNWtaV1pwYm1Wa1hDSWdKaVlnY0hKdlkyVnpjeUFoUFQwZ2JuVnNiQ2tnSmlZZ2NISnZZMlZ6Y3k1b2NuUnBiV1VwSUh0Y2JpQWdJQ0J0YjJSMWJHVXVaWGh3YjNKMGN5QTlJR1oxYm1OMGFXOXVLQ2tnZTF4dUlDQWdJQ0FnY21WMGRYSnVJQ2huWlhST1lXNXZVMlZqYjI1a2N5Z3BJQzBnYkc5aFpGUnBiV1VwSUM4Z01XVTJPMXh1SUNBZ0lIMDdYRzRnSUNBZ2FISjBhVzFsSUQwZ2NISnZZMlZ6Y3k1b2NuUnBiV1U3WEc0Z0lDQWdaMlYwVG1GdWIxTmxZMjl1WkhNZ1BTQm1kVzVqZEdsdmJpZ3BJSHRjYmlBZ0lDQWdJSFpoY2lCb2NqdGNiaUFnSUNBZ0lHaHlJRDBnYUhKMGFXMWxLQ2s3WEc0Z0lDQWdJQ0J5WlhSMWNtNGdhSEpiTUYwZ0tpQXhaVGtnS3lCb2Nsc3hYVHRjYmlBZ0lDQjlPMXh1SUNBZ0lHeHZZV1JVYVcxbElEMGdaMlYwVG1GdWIxTmxZMjl1WkhNb0tUdGNiaUFnZlNCbGJITmxJR2xtSUNoRVlYUmxMbTV2ZHlrZ2UxeHVJQ0FnSUcxdlpIVnNaUzVsZUhCdmNuUnpJRDBnWm5WdVkzUnBiMjRvS1NCN1hHNGdJQ0FnSUNCeVpYUjFjbTRnUkdGMFpTNXViM2NvS1NBdElHeHZZV1JVYVcxbE8xeHVJQ0FnSUgwN1hHNGdJQ0FnYkc5aFpGUnBiV1VnUFNCRVlYUmxMbTV2ZHlncE8xeHVJQ0I5SUdWc2MyVWdlMXh1SUNBZ0lHMXZaSFZzWlM1bGVIQnZjblJ6SUQwZ1puVnVZM1JwYjI0b0tTQjdYRzRnSUNBZ0lDQnlaWFIxY200Z2JtVjNJRVJoZEdVb0tTNW5aWFJVYVcxbEtDa2dMU0JzYjJGa1ZHbHRaVHRjYmlBZ0lDQjlPMXh1SUNBZ0lHeHZZV1JVYVcxbElEMGdibVYzSUVSaGRHVW9LUzVuWlhSVWFXMWxLQ2s3WEc0Z0lIMWNibHh1ZlNrdVkyRnNiQ2gwYUdsektUdGNiaUpkZlE9PSIsIihmdW5jdGlvbiAoZ2xvYmFsKXtcbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG4vLyBQYWNrYWdlIGRvY3MgYXQgaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlciAvL1xuLy8gTGFzdCBtZXJnZTogaHR0cHM6Ly9naXRodWIuY29tL21ldGVvci9tZXRlb3IvYmxvYi82OTY4NzZiMTg0OGU0ZDZhOTIwMTQzNDIyYzJjNTBjNDUwMWM4NWEzL3BhY2thZ2VzL3RyYWNrZXIvdHJhY2tlci5qcyAvL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxuLy8gY2hlY2sgZm9yIGdsb2JhbCBhbmQgdXNlIHRoYXQgb25lIGluc3RlYWQgb2YgbG9hZGluZyBhIG5ldyBvbmVcbmlmICh0eXBlb2YgZ2xvYmFsLlRyYWNrciAhPT0gXCJ1bmRlZmluZWRcIikge1xuXHRtb2R1bGUuZXhwb3J0cyA9IGdsb2JhbC5UcmFja3I7XG5cdHJldHVybjtcbn1cblxuLyoqXG4gKiBAbmFtZXNwYWNlIFRyYWNrclxuICogQHN1bW1hcnkgVGhlIG5hbWVzcGFjZSBmb3IgVHJhY2tyLXJlbGF0ZWQgbWV0aG9kcy5cbiAqL1xudmFyIFRyYWNrciA9IGdsb2JhbC5UcmFja3IgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2FjdGl2ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFRydWUgaWYgdGhlcmUgaXMgYSBjdXJyZW50IGNvbXB1dGF0aW9uLCBtZWFuaW5nIHRoYXQgZGVwZW5kZW5jaWVzIG9uIHJlYWN0aXZlIGRhdGEgc291cmNlcyB3aWxsIGJlIHRyYWNrZWQgYW5kIHBvdGVudGlhbGx5IGNhdXNlIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIHRvIGJlIHJlcnVuLlxuICogQGxvY3VzIENsaWVudFxuICogQHR5cGUge0Jvb2xlYW59XG4gKi9cblRyYWNrci5hY3RpdmUgPSBmYWxzZTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9jdXJyZW50Y29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBUaGUgY3VycmVudCBjb21wdXRhdGlvbiwgb3IgYG51bGxgIGlmIHRoZXJlIGlzbid0IG9uZS5cdFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIGlzIHRoZSBbYFRyYWNrci5Db21wdXRhdGlvbmBdKCN0cmFja2VyX2NvbXB1dGF0aW9uKSBvYmplY3QgY3JlYXRlZCBieSB0aGUgaW5uZXJtb3N0IGFjdGl2ZSBjYWxsIHRvIGBUcmFja3IuYXV0b3J1bmAsIGFuZCBpdCdzIHRoZSBjb21wdXRhdGlvbiB0aGF0IGdhaW5zIGRlcGVuZGVuY2llcyB3aGVuIHJlYWN0aXZlIGRhdGEgc291cmNlcyBhcmUgYWNjZXNzZWQuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG5UcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gbnVsbDtcblxuLy8gUmVmZXJlbmNlcyB0byBhbGwgY29tcHV0YXRpb25zIGNyZWF0ZWQgd2l0aGluIHRoZSBUcmFja3IgYnkgaWQuXG4vLyBLZWVwaW5nIHRoZXNlIHJlZmVyZW5jZXMgb24gYW4gdW5kZXJzY29yZSBwcm9wZXJ0eSBnaXZlcyBtb3JlIGNvbnRyb2wgdG9cbi8vIHRvb2xpbmcgYW5kIHBhY2thZ2VzIGV4dGVuZGluZyBUcmFja3Igd2l0aG91dCBpbmNyZWFzaW5nIHRoZSBBUEkgc3VyZmFjZS5cbi8vIFRoZXNlIGNhbiB1c2VkIHRvIG1vbmtleS1wYXRjaCBjb21wdXRhdGlvbnMsIHRoZWlyIGZ1bmN0aW9ucywgdXNlXG4vLyBjb21wdXRhdGlvbiBpZHMgZm9yIHRyYWNraW5nLCBldGMuXG5UcmFja3IuX2NvbXB1dGF0aW9ucyA9IHt9O1xuXG52YXIgc2V0Q3VycmVudENvbXB1dGF0aW9uID0gZnVuY3Rpb24gKGMpIHtcblx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiA9IGM7XG5cdFRyYWNrci5hY3RpdmUgPSAhISBjO1xufTtcblxudmFyIF9kZWJ1Z0Z1bmMgPSBmdW5jdGlvbiAoKSB7XG5cdHJldHVybiAodHlwZW9mIGNvbnNvbGUgIT09IFwidW5kZWZpbmVkXCIpICYmIGNvbnNvbGUuZXJyb3IgP1xuXHRcdFx0IGZ1bmN0aW9uICgpIHsgY29uc29sZS5lcnJvci5hcHBseShjb25zb2xlLCBhcmd1bWVudHMpOyB9IDpcblx0XHRcdCBmdW5jdGlvbiAoKSB7fTtcbn07XG5cbnZhciBfdGhyb3dPckxvZyA9IGZ1bmN0aW9uIChmcm9tLCBlKSB7XG5cdGlmICh0aHJvd0ZpcnN0RXJyb3IpIHtcblx0XHR0aHJvdyBlO1xuXHR9IGVsc2Uge1xuXHRcdHZhciBwcmludEFyZ3MgPSBbXCJFeGNlcHRpb24gZnJvbSBUcmFja3IgXCIgKyBmcm9tICsgXCIgZnVuY3Rpb246XCJdO1xuXHRcdGlmIChlLnN0YWNrICYmIGUubWVzc2FnZSAmJiBlLm5hbWUpIHtcblx0XHRcdHZhciBpZHggPSBlLnN0YWNrLmluZGV4T2YoZS5tZXNzYWdlKTtcblx0XHRcdGlmIChpZHggPCAwIHx8IGlkeCA+IGUubmFtZS5sZW5ndGggKyAyKSB7IC8vIGNoZWNrIGZvciBcIkVycm9yOiBcIlxuXHRcdFx0XHQvLyBtZXNzYWdlIGlzIG5vdCBwYXJ0IG9mIHRoZSBzdGFja1xuXHRcdFx0XHR2YXIgbWVzc2FnZSA9IGUubmFtZSArIFwiOiBcIiArIGUubWVzc2FnZTtcblx0XHRcdFx0cHJpbnRBcmdzLnB1c2gobWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHByaW50QXJncy5wdXNoKGUuc3RhY2spO1xuXG5cdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBwcmludEFyZ3MubGVuZ3RoOyBpKyspIHtcblx0XHRcdF9kZWJ1Z0Z1bmMoKShwcmludEFyZ3NbaV0pO1xuXHRcdH1cblx0fVxufTtcblxuLy8gVGFrZXMgYSBmdW5jdGlvbiBgZmAsIGFuZCB3cmFwcyBpdCBpbiBhIGBNZXRlb3IuX25vWWllbGRzQWxsb3dlZGBcbi8vIGJsb2NrIGlmIHdlIGFyZSBydW5uaW5nIG9uIHRoZSBzZXJ2ZXIuIE9uIHRoZSBjbGllbnQsIHJldHVybnMgdGhlXG4vLyBvcmlnaW5hbCBmdW5jdGlvbiAoc2luY2UgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYCBpcyBhXG4vLyBuby1vcCkuIFRoaXMgaGFzIHRoZSBiZW5lZml0IG9mIG5vdCBhZGRpbmcgYW4gdW5uZWNlc3Nhcnkgc3RhY2tcbi8vIGZyYW1lIG9uIHRoZSBjbGllbnQuXG52YXIgd2l0aE5vWWllbGRzQWxsb3dlZCA9IGZ1bmN0aW9uIChmKSB7XG5cdHJldHVybiBmO1xufTtcblxudmFyIG5leHRJZCA9IDE7XG4vLyBjb21wdXRhdGlvbnMgd2hvc2UgY2FsbGJhY2tzIHdlIHNob3VsZCBjYWxsIGF0IGZsdXNoIHRpbWVcbnZhciBwZW5kaW5nQ29tcHV0YXRpb25zID0gW107XG4vLyBgdHJ1ZWAgaWYgYSBUcmFja3IuZmx1c2ggaXMgc2NoZWR1bGVkLCBvciBpZiB3ZSBhcmUgaW4gVHJhY2tyLmZsdXNoIG5vd1xudmFyIHdpbGxGbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgaW5GbHVzaCA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHdlIGFyZSBjb21wdXRpbmcgYSBjb21wdXRhdGlvbiBub3csIGVpdGhlciBmaXJzdCB0aW1lXG4vLyBvciByZWNvbXB1dGUuXHRUaGlzIG1hdGNoZXMgVHJhY2tyLmFjdGl2ZSB1bmxlc3Mgd2UgYXJlIGluc2lkZVxuLy8gVHJhY2tyLm5vbnJlYWN0aXZlLCB3aGljaCBudWxsZmllcyBjdXJyZW50Q29tcHV0YXRpb24gZXZlbiB0aG91Z2hcbi8vIGFuIGVuY2xvc2luZyBjb21wdXRhdGlvbiBtYXkgc3RpbGwgYmUgcnVubmluZy5cbnZhciBpbkNvbXB1dGUgPSBmYWxzZTtcbi8vIGB0cnVlYCBpZiB0aGUgYF90aHJvd0ZpcnN0RXJyb3JgIG9wdGlvbiB3YXMgcGFzc2VkIGluIHRvIHRoZSBjYWxsXG4vLyB0byBUcmFja3IuZmx1c2ggdGhhdCB3ZSBhcmUgaW4uIFdoZW4gc2V0LCB0aHJvdyByYXRoZXIgdGhhbiBsb2cgdGhlXG4vLyBmaXJzdCBlcnJvciBlbmNvdW50ZXJlZCB3aGlsZSBmbHVzaGluZy4gQmVmb3JlIHRocm93aW5nIHRoZSBlcnJvcixcbi8vIGZpbmlzaCBmbHVzaGluZyAoZnJvbSBhIGZpbmFsbHkgYmxvY2spLCBsb2dnaW5nIGFueSBzdWJzZXF1ZW50XG4vLyBlcnJvcnMuXG52YXIgdGhyb3dGaXJzdEVycm9yID0gZmFsc2U7XG5cbnZhciBhZnRlckZsdXNoQ2FsbGJhY2tzID0gW107XG5cbnZhciByZXF1ZXN0QW5pbWF0aW9uRnJhbWUgPSByZXF1aXJlKFwicmFmXCIpO1xuXG52YXIgcmVxdWlyZUZsdXNoID0gZnVuY3Rpb24gKCkge1xuXHRpZiAoISB3aWxsRmx1c2gpIHtcblx0XHRyZXF1ZXN0QW5pbWF0aW9uRnJhbWUoVHJhY2tyLl9ydW5GbHVzaCk7XG5cdFx0d2lsbEZsdXNoID0gdHJ1ZTtcblx0fVxufTtcblxuLy8gVHJhY2tyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHZpc2libGUgYnV0IHByaXZhdGVcbi8vICh0aHJvd3MgYW4gZXJyb3IgaWYgeW91IHRyeSB0byBjYWxsIGl0KVxudmFyIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gZmFsc2U7XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2NvbXB1dGF0aW9uXG5cbi8qKlxuICogQHN1bW1hcnkgQSBDb21wdXRhdGlvbiBvYmplY3QgcmVwcmVzZW50cyBjb2RlIHRoYXQgaXMgcmVwZWF0ZWRseSByZXJ1blxuICogaW4gcmVzcG9uc2UgdG9cbiAqIHJlYWN0aXZlIGRhdGEgY2hhbmdlcy4gQ29tcHV0YXRpb25zIGRvbid0IGhhdmUgcmV0dXJuIHZhbHVlczsgdGhleSBqdXN0XG4gKiBwZXJmb3JtIGFjdGlvbnMsIHN1Y2ggYXMgcmVyZW5kZXJpbmcgYSB0ZW1wbGF0ZSBvbiB0aGUgc2NyZWVuLiBDb21wdXRhdGlvbnNcbiAqIGFyZSBjcmVhdGVkIHVzaW5nIFRyYWNrci5hdXRvcnVuLiBVc2Ugc3RvcCB0byBwcmV2ZW50IGZ1cnRoZXIgcmVydW5uaW5nIG9mIGFcbiAqIGNvbXB1dGF0aW9uLlxuICogQGluc3RhbmNlbmFtZSBjb21wdXRhdGlvblxuICovXG5UcmFja3IuQ29tcHV0YXRpb24gPSBmdW5jdGlvbiAoZiwgcGFyZW50LCBvcHRpb25zKSB7XG5cdGlmICghIGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uKVxuXHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFwiVHJhY2tyLkNvbXB1dGF0aW9uIGNvbnN0cnVjdG9yIGlzIHByaXZhdGU7IHVzZSBUcmFja3IuYXV0b3J1blwiKTtcblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX3N0b3BwZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdHN0b3BwZWRcblx0ICovXG5cdHNlbGYuc3RvcHBlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVkXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBjb21wdXRhdGlvbiBoYXMgYmVlbiBpbnZhbGlkYXRlZCAoYW5kIG5vdCB5ZXQgcmVydW4pLCBvciBpZiBpdCBoYXMgYmVlbiBzdG9wcGVkLlxuXHQgKiBAbG9jdXMgQ2xpZW50XG5cdCAqIEBtZW1iZXJPZiBUcmFja3IuQ29tcHV0YXRpb25cblx0ICogQGluc3RhbmNlXG5cdCAqIEBuYW1lXHRpbnZhbGlkYXRlZFxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHQvLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9maXJzdHJ1blxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGR1cmluZyB0aGUgaW5pdGlhbCBydW4gb2YgdGhlIGNvbXB1dGF0aW9uIGF0IHRoZSB0aW1lIGBUcmFja3IuYXV0b3J1bmAgaXMgY2FsbGVkLCBhbmQgZmFsc2Ugb24gc3Vic2VxdWVudCByZXJ1bnMgYW5kIGF0IG90aGVyIHRpbWVzLlxuXHQgKiBAbG9jdXMgQ2xpZW50XG5cdCAqIEBtZW1iZXJPZiBUcmFja3IuQ29tcHV0YXRpb25cblx0ICogQGluc3RhbmNlXG5cdCAqIEBuYW1lXHRmaXJzdFJ1blxuXHQgKiBAdHlwZSB7Qm9vbGVhbn1cblx0ICovXG5cdHNlbGYuZmlyc3RSdW4gPSB0cnVlO1xuXG5cdHNlbGYuX2lkID0gbmV4dElkKys7XG5cdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHRzZWxmLl9vblN0b3BDYWxsYmFja3MgPSBbXTtcblx0Ly8gdGhlIHBsYW4gaXMgYXQgc29tZSBwb2ludCB0byB1c2UgdGhlIHBhcmVudCByZWxhdGlvblxuXHQvLyB0byBjb25zdHJhaW4gdGhlIG9yZGVyIHRoYXQgY29tcHV0YXRpb25zIGFyZSBwcm9jZXNzZWRcblx0c2VsZi5fcGFyZW50ID0gcGFyZW50O1xuXHRzZWxmLl9mdW5jID0gZjtcblx0c2VsZi5fb25FcnJvciA9IG9wdGlvbnMub25FcnJvcjtcblx0c2VsZi5fcmVjb21wdXRpbmcgPSBmYWxzZTtcblx0c2VsZi5fY29udGV4dCA9IG9wdGlvbnMuY29udGV4dCB8fCBudWxsO1xuXG5cdC8vIFJlZ2lzdGVyIHRoZSBjb21wdXRhdGlvbiB3aXRoaW4gdGhlIGdsb2JhbCBUcmFja3IuXG5cdFRyYWNrci5fY29tcHV0YXRpb25zW3NlbGYuX2lkXSA9IHNlbGY7XG5cblx0dmFyIGVycm9yZWQgPSB0cnVlO1xuXHR0cnkge1xuXHRcdHNlbGYuX2NvbXB1dGUoKTtcblx0XHRlcnJvcmVkID0gZmFsc2U7XG5cdH0gZmluYWxseSB7XG5cdFx0c2VsZi5maXJzdFJ1biA9IGZhbHNlO1xuXHRcdGlmIChlcnJvcmVkKVxuXHRcdFx0c2VsZi5zdG9wKCk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBgY2FsbGJhY2tgIHRvIHJ1biB3aGVuIHRoaXMgY29tcHV0YXRpb24gaXMgbmV4dCBpbnZhbGlkYXRlZCwgb3IgcnVucyBpdCBpbW1lZGlhdGVseSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYWxyZWFkeSBpbnZhbGlkYXRlZC5cdFRoZSBjYWxsYmFjayBpcyBydW4gZXhhY3RseSBvbmNlIGFuZCBub3QgdXBvbiBmdXR1cmUgaW52YWxpZGF0aW9ucyB1bmxlc3MgYG9uSW52YWxpZGF0ZWAgaXMgY2FsbGVkIGFnYWluIGFmdGVyIHRoZSBjb21wdXRhdGlvbiBiZWNvbWVzIHZhbGlkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgRnVuY3Rpb24gdG8gYmUgY2FsbGVkIG9uIGludmFsaWRhdGlvbi4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgaW52YWxpZGF0ZWQuXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGZ1bmN0aW9uXCIpO1xuXG5cdGlmIChzZWxmLmludmFsaWRhdGVkKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBzdG9wcGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IHN0b3BwZWQuXHRUaGUgY2FsbGJhY2sgaXMgcnVuIGFmdGVyIGFueSBgb25JbnZhbGlkYXRlYCBjYWxsYmFja3MuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gc3RvcC4gUmVjZWl2ZXMgb25lIGFyZ3VtZW50LCB0aGUgY29tcHV0YXRpb24gdGhhdCB3YXMgc3RvcHBlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vblN0b3AgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25TdG9wIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuc3RvcHBlZCkge1xuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKGYpLmNhbGwoY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdH0pO1xuXHR9IGVsc2Uge1xuXHRcdHNlbGYuX29uU3RvcENhbGxiYWNrcy5wdXNoKHsgZm46IGYsIGN0eDogY3R4IH0pO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgSW52YWxpZGF0ZXMgdGhpcyBjb21wdXRhdGlvbiBzbyB0aGF0IGl0IHdpbGwgYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuaW52YWxpZGF0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRpZiAoISBzZWxmLmludmFsaWRhdGVkKSB7XG5cdFx0Ly8gaWYgd2UncmUgY3VycmVudGx5IGluIF9yZWNvbXB1dGUoKSwgZG9uJ3QgZW5xdWV1ZVxuXHRcdC8vIG91cnNlbHZlcywgc2luY2Ugd2UnbGwgcmVydW4gaW1tZWRpYXRlbHkgYW55d2F5LlxuXHRcdGlmICghIHNlbGYuX3JlY29tcHV0aW5nICYmICEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0XHRyZXF1aXJlRmx1c2goKTtcblx0XHRcdHBlbmRpbmdDb21wdXRhdGlvbnMucHVzaCh0aGlzKTtcblx0XHR9XG5cblx0XHRzZWxmLmludmFsaWRhdGVkID0gdHJ1ZTtcblxuXHRcdC8vIGNhbGxiYWNrcyBjYW4ndCBhZGQgY2FsbGJhY2tzLCBiZWNhdXNlXG5cdFx0Ly8gc2VsZi5pbnZhbGlkYXRlZCA9PT0gdHJ1ZS5cblx0XHRmb3IodmFyIGkgPSAwLCBmOyBmID0gc2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzW2ldOyBpKyspIHtcblx0XHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZi5mbikuY2FsbChmLmN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MgPSBbXTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcFxuXG4vKipcbiAqIEBzdW1tYXJ5IFByZXZlbnRzIHRoaXMgY29tcHV0YXRpb24gZnJvbSByZXJ1bm5pbmcuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGlmICghIHNlbGYuc3RvcHBlZCkge1xuXHRcdHNlbGYuc3RvcHBlZCA9IHRydWU7XG5cdFx0c2VsZi5pbnZhbGlkYXRlKCk7XG5cdFx0Ly8gVW5yZWdpc3RlciBmcm9tIGdsb2JhbCBUcmFja3IuXG5cdFx0ZGVsZXRlIFRyYWNrci5fY29tcHV0YXRpb25zW3NlbGYuX2lkXTtcblx0XHRmb3IodmFyIGkgPSAwLCBmOyBmID0gc2VsZi5fb25TdG9wQ2FsbGJhY2tzW2ldOyBpKyspIHtcblx0XHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZi5mbikuY2FsbChmLmN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRzZWxmLl9vblN0b3BDYWxsYmFja3MgPSBbXTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fY29tcHV0ZSA9IGZ1bmN0aW9uICgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXHRzZWxmLmludmFsaWRhdGVkID0gZmFsc2U7XG5cblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHNlbGYpO1xuXHR2YXIgcHJldmlvdXNJbkNvbXB1dGUgPSBpbkNvbXB1dGU7XG5cdGluQ29tcHV0ZSA9IHRydWU7XG5cdHRyeSB7XG5cdFx0d2l0aE5vWWllbGRzQWxsb3dlZChzZWxmLl9mdW5jKS5jYWxsKHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHR9IGZpbmFsbHkge1xuXHRcdHNldEN1cnJlbnRDb21wdXRhdGlvbihwcmV2aW91cyk7XG5cdFx0aW5Db21wdXRlID0gcHJldmlvdXNJbkNvbXB1dGU7XG5cdH1cbn07XG5cblRyYWNrci5Db21wdXRhdGlvbi5wcm90b3R5cGUuX25lZWRzUmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHJldHVybiBzZWxmLmludmFsaWRhdGVkICYmICEgc2VsZi5zdG9wcGVkO1xufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fcmVjb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0c2VsZi5fcmVjb21wdXRpbmcgPSB0cnVlO1xuXHR0cnkge1xuXHRcdGlmIChzZWxmLl9uZWVkc1JlY29tcHV0ZSgpKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRzZWxmLl9jb21wdXRlKCk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmIChzZWxmLl9vbkVycm9yKSB7XG5cdFx0XHRcdFx0c2VsZi5fb25FcnJvcihlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRfdGhyb3dPckxvZyhcInJlY29tcHV0ZVwiLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHR9XG59O1xuXG4vL1xuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9kZXBlbmRlbmN5XG5cbi8qKlxuICogQHN1bW1hcnkgQSBEZXBlbmRlbmN5IHJlcHJlc2VudHMgYW4gYXRvbWljIHVuaXQgb2YgcmVhY3RpdmUgZGF0YSB0aGF0IGFcbiAqIGNvbXB1dGF0aW9uIG1pZ2h0IGRlcGVuZCBvbi4gUmVhY3RpdmUgZGF0YSBzb3VyY2VzIHN1Y2ggYXMgU2Vzc2lvbiBvclxuICogTWluaW1vbmdvIGludGVybmFsbHkgY3JlYXRlIGRpZmZlcmVudCBEZXBlbmRlbmN5IG9iamVjdHMgZm9yIGRpZmZlcmVudFxuICogcGllY2VzIG9mIGRhdGEsIGVhY2ggb2Ygd2hpY2ggbWF5IGJlIGRlcGVuZGVkIG9uIGJ5IG11bHRpcGxlIGNvbXB1dGF0aW9ucy5cbiAqIFdoZW4gdGhlIGRhdGEgY2hhbmdlcywgdGhlIGNvbXB1dGF0aW9ucyBhcmUgaW52YWxpZGF0ZWQuXG4gKiBAY2xhc3NcbiAqIEBpbnN0YW5jZU5hbWUgZGVwZW5kZW5jeVxuICovXG5UcmFja3IuRGVwZW5kZW5jeSA9IGZ1bmN0aW9uICgpIHtcblx0dGhpcy5fZGVwZW5kZW50c0J5SWQgPSB7fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfZGVwZW5kXG4vL1xuLy8gQWRkcyBgY29tcHV0YXRpb25gIHRvIHRoaXMgc2V0IGlmIGl0IGlzIG5vdCBhbHJlYWR5XG4vLyBwcmVzZW50Llx0UmV0dXJucyB0cnVlIGlmIGBjb21wdXRhdGlvbmAgaXMgYSBuZXcgbWVtYmVyIG9mIHRoZSBzZXQuXG4vLyBJZiBubyBhcmd1bWVudCwgZGVmYXVsdHMgdG8gY3VycmVudENvbXB1dGF0aW9uLCBvciBkb2VzIG5vdGhpbmdcbi8vIGlmIHRoZXJlIGlzIG5vIGN1cnJlbnRDb21wdXRhdGlvbi5cblxuLyoqXG4gKiBAc3VtbWFyeSBEZWNsYXJlcyB0aGF0IHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uIChvciBgZnJvbUNvbXB1dGF0aW9uYCBpZiBnaXZlbikgZGVwZW5kcyBvbiBgZGVwZW5kZW5jeWAuXHRUaGUgY29tcHV0YXRpb24gd2lsbCBiZSBpbnZhbGlkYXRlZCB0aGUgbmV4dCB0aW1lIGBkZXBlbmRlbmN5YCBjaGFuZ2VzLlxuXG5JZiB0aGVyZSBpcyBubyBjdXJyZW50IGNvbXB1dGF0aW9uIGFuZCBgZGVwZW5kKClgIGlzIGNhbGxlZCB3aXRoIG5vIGFyZ3VtZW50cywgaXQgZG9lcyBub3RoaW5nIGFuZCByZXR1cm5zIGZhbHNlLlxuXG5SZXR1cm5zIHRydWUgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGEgbmV3IGRlcGVuZGVudCBvZiBgZGVwZW5kZW5jeWAgcmF0aGVyIHRoYW4gYW4gZXhpc3Rpbmcgb25lLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb259IFtmcm9tQ29tcHV0YXRpb25dIEFuIG9wdGlvbmFsIGNvbXB1dGF0aW9uIGRlY2xhcmVkIHRvIGRlcGVuZCBvbiBgZGVwZW5kZW5jeWAgaW5zdGVhZCBvZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbi5cbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5UcmFja3IuRGVwZW5kZW5jeS5wcm90b3R5cGUuZGVwZW5kID0gZnVuY3Rpb24gKGNvbXB1dGF0aW9uKSB7XG5cdGlmICghIGNvbXB1dGF0aW9uKSB7XG5cdFx0aWYgKCEgVHJhY2tyLmFjdGl2ZSlcblx0XHRcdHJldHVybiBmYWxzZTtcblxuXHRcdGNvbXB1dGF0aW9uID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0fVxuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHZhciBpZCA9IGNvbXB1dGF0aW9uLl9pZDtcblx0aWYgKCEgKGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKSkge1xuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXSA9IGNvbXB1dGF0aW9uO1xuXHRcdGNvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRkZWxldGUgc2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfY2hhbmdlZFxuXG4vKipcbiAqIEBzdW1tYXJ5IEludmFsaWRhdGUgYWxsIGRlcGVuZGVudCBjb21wdXRhdGlvbnMgaW1tZWRpYXRlbHkgYW5kIHJlbW92ZSB0aGVtIGFzIGRlcGVuZGVudHMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5jaGFuZ2VkID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvciAodmFyIGlkIGluIHNlbGYuX2RlcGVuZGVudHNCeUlkKVxuXHRcdHNlbGYuX2RlcGVuZGVudHNCeUlkW2lkXS5pbnZhbGlkYXRlKCk7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNkZXBlbmRlbmN5X2hhc2RlcGVuZGVudHNcblxuLyoqXG4gKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgRGVwZW5kZW5jeSBoYXMgb25lIG9yIG1vcmUgZGVwZW5kZW50IENvbXB1dGF0aW9ucywgd2hpY2ggd291bGQgYmUgaW52YWxpZGF0ZWQgaWYgdGhpcyBEZXBlbmRlbmN5IHdlcmUgdG8gY2hhbmdlLlxuICogQGxvY3VzIENsaWVudFxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5oYXNEZXBlbmRlbnRzID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGZvcih2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0cmV0dXJuIHRydWU7XG5cdHJldHVybiBmYWxzZTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfZmx1c2hcblxuLyoqXG4gKiBAc3VtbWFyeSBQcm9jZXNzIGFsbCByZWFjdGl2ZSB1cGRhdGVzIGltbWVkaWF0ZWx5IGFuZCBlbnN1cmUgdGhhdCBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGFyZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLmZsdXNoID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcblx0VHJhY2tyLl9ydW5GbHVzaCh7IGZpbmlzaFN5bmNocm9ub3VzbHk6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0dGhyb3dGaXJzdEVycm9yOiBvcHRpb25zICYmIG9wdGlvbnMuX3Rocm93Rmlyc3RFcnJvciB9KTtcbn07XG5cbi8vIFJ1biBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnMgYW5kIGFmdGVyRmx1c2ggY2FsbGJhY2tzLlx0SWYgd2Ugd2VyZSBub3QgY2FsbGVkXG4vLyBkaXJlY3RseSB2aWEgVHJhY2tyLmZsdXNoLCB0aGlzIG1heSByZXR1cm4gYmVmb3JlIHRoZXkncmUgYWxsIGRvbmUgdG8gYWxsb3dcbi8vIHRoZSBldmVudCBsb29wIHRvIHJ1biBhIGxpdHRsZSBiZWZvcmUgY29udGludWluZy5cblRyYWNrci5fcnVuRmx1c2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuXHQvLyBYWFggV2hhdCBwYXJ0IG9mIHRoZSBjb21tZW50IGJlbG93IGlzIHN0aWxsIHRydWU/IChXZSBubyBsb25nZXJcblx0Ly8gaGF2ZSBTcGFyaylcblx0Ly9cblx0Ly8gTmVzdGVkIGZsdXNoIGNvdWxkIHBsYXVzaWJseSBoYXBwZW4gaWYsIHNheSwgYSBmbHVzaCBjYXVzZXNcblx0Ly8gRE9NIG11dGF0aW9uLCB3aGljaCBjYXVzZXMgYSBcImJsdXJcIiBldmVudCwgd2hpY2ggcnVucyBhblxuXHQvLyBhcHAgZXZlbnQgaGFuZGxlciB0aGF0IGNhbGxzIFRyYWNrci5mbHVzaC5cdEF0IHRoZSBtb21lbnRcblx0Ly8gU3BhcmsgYmxvY2tzIGV2ZW50IGhhbmRsZXJzIGR1cmluZyBET00gbXV0YXRpb24gYW55d2F5LFxuXHQvLyBiZWNhdXNlIHRoZSBMaXZlUmFuZ2UgdHJlZSBpc24ndCB2YWxpZC5cdEFuZCB3ZSBkb24ndCBoYXZlXG5cdC8vIGFueSB1c2VmdWwgbm90aW9uIG9mIGEgbmVzdGVkIGZsdXNoLlxuXHQvL1xuXHQvLyBodHRwczovL2FwcC5hc2FuYS5jb20vMC8xNTk5MDgzMzAyNDQvMzg1MTM4MjMzODU2XG5cdGlmIChpbkZsdXNoKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIkNhbid0IGNhbGwgVHJhY2tyLmZsdXNoIHdoaWxlIGZsdXNoaW5nXCIpO1xuXG5cdGlmIChpbkNvbXB1dGUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgZmx1c2ggaW5zaWRlIFRyYWNrci5hdXRvcnVuXCIpO1xuXG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdGluRmx1c2ggPSB0cnVlO1xuXHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR0aHJvd0ZpcnN0RXJyb3IgPSAhISBvcHRpb25zLnRocm93Rmlyc3RFcnJvcjtcblxuXHR2YXIgcmVjb21wdXRlZENvdW50ID0gMDtcblx0dmFyIGZpbmlzaGVkVHJ5ID0gZmFsc2U7XG5cdHRyeSB7XG5cdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8XG5cdFx0XHRcdFx0IGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cblx0XHRcdC8vIHJlY29tcHV0ZSBhbGwgcGVuZGluZyBjb21wdXRhdGlvbnNcblx0XHRcdHdoaWxlIChwZW5kaW5nQ29tcHV0YXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHR2YXIgY29tcCA9IHBlbmRpbmdDb21wdXRhdGlvbnMuc2hpZnQoKTtcblx0XHRcdFx0Y29tcC5fcmVjb21wdXRlKCk7XG5cdFx0XHRcdGlmIChjb21wLl9uZWVkc1JlY29tcHV0ZSgpKSB7XG5cdFx0XHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy51bnNoaWZ0KGNvbXApO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCEgb3B0aW9ucy5maW5pc2hTeW5jaHJvbm91c2x5ICYmICsrcmVjb21wdXRlZENvdW50ID4gMTAwMCkge1xuXHRcdFx0XHRcdGZpbmlzaGVkVHJ5ID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGNhbGwgb25lIGFmdGVyRmx1c2ggY2FsbGJhY2ssIHdoaWNoIG1heVxuXHRcdFx0XHQvLyBpbnZhbGlkYXRlIG1vcmUgY29tcHV0YXRpb25zXG5cdFx0XHRcdHZhciBjYiA9IGFmdGVyRmx1c2hDYWxsYmFja3Muc2hpZnQoKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjYi5mbi5jYWxsKGNiLmN0eCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRfdGhyb3dPckxvZyhcImFmdGVyRmx1c2hcIiwgZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmICghIGZpbmlzaGVkVHJ5KSB7XG5cdFx0XHQvLyB3ZSdyZSBlcnJvcmluZyBkdWUgdG8gdGhyb3dGaXJzdEVycm9yIGJlaW5nIHRydWUuXG5cdFx0XHRpbkZsdXNoID0gZmFsc2U7IC8vIG5lZWRlZCBiZWZvcmUgY2FsbGluZyBgVHJhY2tyLmZsdXNoKClgIGFnYWluXG5cdFx0XHQvLyBmaW5pc2ggZmx1c2hpbmdcblx0XHRcdFRyYWNrci5fcnVuRmx1c2goe1xuXHRcdFx0XHRmaW5pc2hTeW5jaHJvbm91c2x5OiBvcHRpb25zLmZpbmlzaFN5bmNocm9ub3VzbHksXG5cdFx0XHRcdHRocm93Rmlyc3RFcnJvcjogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdH1cblx0XHR3aWxsRmx1c2ggPSBmYWxzZTtcblx0XHRpbkZsdXNoID0gZmFsc2U7XG5cdFx0aWYgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoIHx8IGFmdGVyRmx1c2hDYWxsYmFja3MubGVuZ3RoKSB7XG5cdFx0XHQvLyBXZSdyZSB5aWVsZGluZyBiZWNhdXNlIHdlIHJhbiBhIGJ1bmNoIG9mIGNvbXB1dGF0aW9ucyBhbmQgd2UgYXJlbid0XG5cdFx0XHQvLyByZXF1aXJlZCB0byBmaW5pc2ggc3luY2hyb25vdXNseSwgc28gd2UnZCBsaWtlIHRvIGdpdmUgdGhlIGV2ZW50IGxvb3AgYVxuXHRcdFx0Ly8gY2hhbmNlLiBXZSBzaG91bGQgZmx1c2ggYWdhaW4gc29vbi5cblx0XHRcdGlmIChvcHRpb25zLmZpbmlzaFN5bmNocm9ub3VzbHkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFwic3RpbGwgaGF2ZSBtb3JlIHRvIGRvP1wiKTtcdC8vIHNob3VsZG4ndCBoYXBwZW5cblx0XHRcdH1cblx0XHRcdHNldFRpbWVvdXQocmVxdWlyZUZsdXNoLCAxMCk7XG5cdFx0fVxuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2F1dG9ydW5cbi8vXG4vLyBSdW4gZigpLiBSZWNvcmQgaXRzIGRlcGVuZGVuY2llcy4gUmVydW4gaXQgd2hlbmV2ZXIgdGhlXG4vLyBkZXBlbmRlbmNpZXMgY2hhbmdlLlxuLy9cbi8vIFJldHVybnMgYSBuZXcgQ29tcHV0YXRpb24sIHdoaWNoIGlzIGFsc28gcGFzc2VkIHRvIGYuXG4vL1xuLy8gTGlua3MgdGhlIGNvbXB1dGF0aW9uIHRvIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uXG4vLyBzbyB0aGF0IGl0IGlzIHN0b3BwZWQgaWYgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQGNhbGxiYWNrIFRyYWNrci5Db21wdXRhdGlvbkZ1bmN0aW9uXG4gKiBAcGFyYW0ge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuLyoqXG4gKiBAc3VtbWFyeSBSdW4gYSBmdW5jdGlvbiBub3cgYW5kIHJlcnVuIGl0IGxhdGVyIHdoZW5ldmVyIGl0cyBkZXBlbmRlbmNpZXNcbiAqIGNoYW5nZS4gUmV0dXJucyBhIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IGNhbiBiZSB1c2VkIHRvIHN0b3Agb3Igb2JzZXJ2ZSB0aGVcbiAqIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7VHJhY2tyLkNvbXB1dGF0aW9uRnVuY3Rpb259IHJ1bkZ1bmMgVGhlIGZ1bmN0aW9uIHRvIHJ1bi4gSXQgcmVjZWl2ZXNcbiAqIG9uZSBhcmd1bWVudDogdGhlIENvbXB1dGF0aW9uIG9iamVjdCB0aGF0IHdpbGwgYmUgcmV0dXJuZWQuXG4gKiBAcGFyYW0ge09iamVjdH0gW29wdGlvbnNdXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBvcHRpb25zLm9uRXJyb3IgT3B0aW9uYWwuIFRoZSBmdW5jdGlvbiB0byBydW4gd2hlbiBhbiBlcnJvclxuICogaGFwcGVucyBpbiB0aGUgQ29tcHV0YXRpb24uIFRoZSBvbmx5IGFyZ3VtZW50IGl0IHJlY2lldmVzIGlzIHRoZSBFcnJvclxuICogdGhyb3duLiBEZWZhdWx0cyB0byB0aGUgZXJyb3IgYmVpbmcgbG9nZ2VkIHRvIHRoZSBjb25zb2xlLlxuICogQHJldHVybnMge1RyYWNrci5Db21wdXRhdGlvbn1cbiAqL1xuVHJhY2tyLmF1dG9ydW4gPSBmdW5jdGlvbiAoZiwgb3B0aW9ucywgY3R4KSB7XG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RyYWNrci5hdXRvcnVuIHJlcXVpcmVzIGEgZnVuY3Rpb24gYXJndW1lbnQnKTtcblxuXHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblx0aWYgKGN0eCkgb3B0aW9ucy5jb250ZXh0ID0gY3R4O1xuXG5cdGNvbnN0cnVjdGluZ0NvbXB1dGF0aW9uID0gdHJ1ZTtcblx0dmFyIGMgPSBuZXcgVHJhY2tyLkNvbXB1dGF0aW9uKFxuXHRcdGYsIFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24sIG9wdGlvbnMpO1xuXG5cdGlmIChUcmFja3IuYWN0aXZlKVxuXHRcdFRyYWNrci5vbkludmFsaWRhdGUoZnVuY3Rpb24gKCkge1xuXHRcdFx0Yy5zdG9wKCk7XG5cdFx0fSk7XG5cblx0cmV0dXJuIGM7XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX25vbnJlYWN0aXZlXG4vL1xuLy8gUnVuIGBmYCB3aXRoIG5vIGN1cnJlbnQgY29tcHV0YXRpb24sIHJldHVybmluZyB0aGUgcmV0dXJuIHZhbHVlXG4vLyBvZiBgZmAuXHRVc2VkIHRvIHR1cm4gb2ZmIHJlYWN0aXZpdHkgZm9yIHRoZSBkdXJhdGlvbiBvZiBgZmAsXG4vLyBzbyB0aGF0IHJlYWN0aXZlIGRhdGEgc291cmNlcyBhY2Nlc3NlZCBieSBgZmAgd2lsbCBub3QgcmVzdWx0IGluIGFueVxuLy8gY29tcHV0YXRpb25zIGJlaW5nIGludmFsaWRhdGVkLlxuXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIHdpdGhvdXQgdHJhY2tpbmcgZGVwZW5kZW5jaWVzLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gZnVuYyBBIGZ1bmN0aW9uIHRvIGNhbGwgaW1tZWRpYXRlbHkuXG4gKi9cblRyYWNrci5ub25SZWFjdGl2ZSA9XG5UcmFja3Iubm9ucmVhY3RpdmUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBwcmV2aW91cyA9IFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb247XG5cdHNldEN1cnJlbnRDb21wdXRhdGlvbihudWxsKTtcblx0dHJ5IHtcblx0XHRyZXR1cm4gZi5jYWxsKGN0eCk7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0fVxufTtcblxuLy8gbGlrZSBub25yZWFjdGl2ZSBidXQgbWFrZXMgYSBmdW5jdGlvbiBpbnN0ZWFkXG5UcmFja3Iubm9uUmVhY3RhYmxlID1cblRyYWNrci5ub25yZWFjdGFibGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHJldHVybiBmdW5jdGlvbigpIHtcblx0XHR2YXIgYXJncyA9IGFyZ3VtZW50cztcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0cmV0dXJuIFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHJldHVybiBmLmFwcGx5KGN0eCwgYXJncyk7XG5cdFx0fSk7XG5cdH07XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX29uaW52YWxpZGF0ZVxuXG4vKipcbiAqIEBzdW1tYXJ5IFJlZ2lzdGVycyBhIG5ldyBbYG9uSW52YWxpZGF0ZWBdKCNjb21wdXRhdGlvbl9vbmludmFsaWRhdGUpIGNhbGxiYWNrIG9uIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uICh3aGljaCBtdXN0IGV4aXN0KSwgdG8gYmUgY2FsbGVkIGltbWVkaWF0ZWx5IHdoZW4gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgaW52YWxpZGF0ZWQgb3Igc3RvcHBlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgY2FsbGJhY2sgZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGludm9rZWQgYXMgYGZ1bmMoYylgLCB3aGVyZSBgY2AgaXMgdGhlIGNvbXB1dGF0aW9uIG9uIHdoaWNoIHRoZSBjYWxsYmFjayBpcyByZWdpc3RlcmVkLlxuICovXG5UcmFja3Iub25JbnZhbGlkYXRlID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRpZiAoISBUcmFja3IuYWN0aXZlKVxuXHRcdHRocm93IG5ldyBFcnJvcihcIlRyYWNrci5vbkludmFsaWRhdGUgcmVxdWlyZXMgYSBjdXJyZW50Q29tcHV0YXRpb25cIik7XG5cblx0VHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbi5vbkludmFsaWRhdGUoZiwgY3R4KTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWZ0ZXJmbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFNjaGVkdWxlcyBhIGZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBkdXJpbmcgdGhlIG5leHQgZmx1c2gsIG9yIGxhdGVyIGluIHRoZSBjdXJyZW50IGZsdXNoIGlmIG9uZSBpcyBpbiBwcm9ncmVzcywgYWZ0ZXIgYWxsIGludmFsaWRhdGVkIGNvbXB1dGF0aW9ucyBoYXZlIGJlZW4gcmVydW4uXHRUaGUgZnVuY3Rpb24gd2lsbCBiZSBydW4gb25jZSBhbmQgbm90IG9uIHN1YnNlcXVlbnQgZmx1c2hlcyB1bmxlc3MgYGFmdGVyRmx1c2hgIGlzIGNhbGxlZCBhZ2Fpbi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEEgZnVuY3Rpb24gdG8gY2FsbCBhdCBmbHVzaCB0aW1lLlxuICovXG5UcmFja3IuYWZ0ZXJGbHVzaCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0YWZ0ZXJGbHVzaENhbGxiYWNrcy5wdXNoKHsgZm46IGYsIGN0eDogY3R4IH0pO1xuXHRyZXF1aXJlRmx1c2goKTtcbn07XG5cbn0pLmNhbGwodGhpcyx0eXBlb2YgZ2xvYmFsICE9PSBcInVuZGVmaW5lZFwiID8gZ2xvYmFsIDogdHlwZW9mIHNlbGYgIT09IFwidW5kZWZpbmVkXCIgPyBzZWxmIDogdHlwZW9mIHdpbmRvdyAhPT0gXCJ1bmRlZmluZWRcIiA/IHdpbmRvdyA6IHt9KVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9ZGF0YTphcHBsaWNhdGlvbi9qc29uO2NoYXJzZXQ6dXRmLTg7YmFzZTY0LGV5SjJaWEp6YVc5dUlqb3pMQ0p6YjNWeVkyVnpJanBiSW01dlpHVmZiVzlrZFd4bGN5OTBjbUZqYTNJdmRISmhZMnR5TG1weklsMHNJbTVoYldWeklqcGJYU3dpYldGd2NHbHVaM01pT2lJN1FVRkJRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRU0lzSW1acGJHVWlPaUpuWlc1bGNtRjBaV1F1YW5NaUxDSnpiM1Z5WTJWU2IyOTBJam9pSWl3aWMyOTFjbU5sYzBOdmJuUmxiblFpT2xzaUx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk5Y2JpOHZJRkJoWTJ0aFoyVWdaRzlqY3lCaGRDQm9kSFJ3T2k4dlpHOWpjeTV0WlhSbGIzSXVZMjl0THlOMGNtRmphMlZ5SUM4dlhHNHZMeUJNWVhOMElHMWxjbWRsT2lCb2RIUndjem92TDJkcGRHaDFZaTVqYjIwdmJXVjBaVzl5TDIxbGRHVnZjaTlpYkc5aUx6WTVOamczTm1JeE9EUTRaVFJrTm1FNU1qQXhORE0wTWpKak1tTTFNR00wTlRBeFl6ZzFZVE12Y0dGamEyRm5aWE12ZEhKaFkydGxjaTkwY21GamEyVnlMbXB6SUM4dlhHNHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkwxeHVYRzR2THlCamFHVmpheUJtYjNJZ1oyeHZZbUZzSUdGdVpDQjFjMlVnZEdoaGRDQnZibVVnYVc1emRHVmhaQ0J2WmlCc2IyRmthVzVuSUdFZ2JtVjNJRzl1WlZ4dWFXWWdLSFI1Y0dWdlppQm5iRzlpWVd3dVZISmhZMnR5SUNFOVBTQmNJblZ1WkdWbWFXNWxaRndpS1NCN1hHNWNkRzF2WkhWc1pTNWxlSEJ2Y25SeklEMGdaMnh2WW1Gc0xsUnlZV05yY2p0Y2JseDBjbVYwZFhKdU8xeHVmVnh1WEc0dktpcGNiaUFxSUVCdVlXMWxjM0JoWTJVZ1ZISmhZMnR5WEc0Z0tpQkFjM1Z0YldGeWVTQlVhR1VnYm1GdFpYTndZV05sSUdadmNpQlVjbUZqYTNJdGNtVnNZWFJsWkNCdFpYUm9iMlJ6TGx4dUlDb3ZYRzUyWVhJZ1ZISmhZMnR5SUQwZ1oyeHZZbUZzTGxSeVlXTnJjaUE5SUcxdlpIVnNaUzVsZUhCdmNuUnpJRDBnZTMwN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZZV04wYVhabFhHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dWSEoxWlNCcFppQjBhR1Z5WlNCcGN5QmhJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjRzSUcxbFlXNXBibWNnZEdoaGRDQmtaWEJsYm1SbGJtTnBaWE1nYjI0Z2NtVmhZM1JwZG1VZ1pHRjBZU0J6YjNWeVkyVnpJSGRwYkd3Z1ltVWdkSEpoWTJ0bFpDQmhibVFnY0c5MFpXNTBhV0ZzYkhrZ1kyRjFjMlVnZEdobElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNGdkRzhnWW1VZ2NtVnlkVzR1WEc0Z0tpQkFiRzlqZFhNZ1EyeHBaVzUwWEc0Z0tpQkFkSGx3WlNCN1FtOXZiR1ZoYm4xY2JpQXFMMXh1VkhKaFkydHlMbUZqZEdsMlpTQTlJR1poYkhObE8xeHVYRzR2THlCb2RIUndPaTh2Wkc5amN5NXRaWFJsYjNJdVkyOXRMeU4wY21GamEyVnlYMk4xY25KbGJuUmpiMjF3ZFhSaGRHbHZibHh1WEc0dktpcGNiaUFxSUVCemRXMXRZWEo1SUZSb1pTQmpkWEp5Wlc1MElHTnZiWEIxZEdGMGFXOXVMQ0J2Y2lCZ2JuVnNiR0FnYVdZZ2RHaGxjbVVnYVhOdUozUWdiMjVsTGx4MFZHaGxJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjRnYVhNZ2RHaGxJRnRnVkhKaFkydHlMa052YlhCMWRHRjBhVzl1WUYwb0kzUnlZV05yWlhKZlkyOXRjSFYwWVhScGIyNHBJRzlpYW1WamRDQmpjbVZoZEdWa0lHSjVJSFJvWlNCcGJtNWxjbTF2YzNRZ1lXTjBhWFpsSUdOaGJHd2dkRzhnWUZSeVlXTnJjaTVoZFhSdmNuVnVZQ3dnWVc1a0lHbDBKM01nZEdobElHTnZiWEIxZEdGMGFXOXVJSFJvWVhRZ1oyRnBibk1nWkdWd1pXNWtaVzVqYVdWeklIZG9aVzRnY21WaFkzUnBkbVVnWkdGMFlTQnpiM1Z5WTJWeklHRnlaU0JoWTJObGMzTmxaQzVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUlFQjBlWEJsSUh0VWNtRmphM0l1UTI5dGNIVjBZWFJwYjI1OVhHNGdLaTljYmxSeVlXTnJjaTVqZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRnUFNCdWRXeHNPMXh1WEc0dkx5QlNaV1psY21WdVkyVnpJSFJ2SUdGc2JDQmpiMjF3ZFhSaGRHbHZibk1nWTNKbFlYUmxaQ0IzYVhSb2FXNGdkR2hsSUZSeVlXTnJjaUJpZVNCcFpDNWNiaTh2SUV0bFpYQnBibWNnZEdobGMyVWdjbVZtWlhKbGJtTmxjeUJ2YmlCaGJpQjFibVJsY25OamIzSmxJSEJ5YjNCbGNuUjVJR2RwZG1WeklHMXZjbVVnWTI5dWRISnZiQ0IwYjF4dUx5OGdkRzl2YkdsdVp5QmhibVFnY0dGamEyRm5aWE1nWlhoMFpXNWthVzVuSUZSeVlXTnJjaUIzYVhSb2IzVjBJR2x1WTNKbFlYTnBibWNnZEdobElFRlFTU0J6ZFhKbVlXTmxMbHh1THk4Z1ZHaGxjMlVnWTJGdUlIVnpaV1FnZEc4Z2JXOXVhMlY1TFhCaGRHTm9JR052YlhCMWRHRjBhVzl1Y3l3Z2RHaGxhWElnWm5WdVkzUnBiMjV6TENCMWMyVmNiaTh2SUdOdmJYQjFkR0YwYVc5dUlHbGtjeUJtYjNJZ2RISmhZMnRwYm1jc0lHVjBZeTVjYmxSeVlXTnJjaTVmWTI5dGNIVjBZWFJwYjI1eklEMGdlMzA3WEc1Y2JuWmhjaUJ6WlhSRGRYSnlaVzUwUTI5dGNIVjBZWFJwYjI0Z1BTQm1kVzVqZEdsdmJpQW9ZeWtnZTF4dVhIUlVjbUZqYTNJdVkzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dUlEMGdZenRjYmx4MFZISmhZMnR5TG1GamRHbDJaU0E5SUNFaElHTTdYRzU5TzF4dVhHNTJZWElnWDJSbFluVm5SblZ1WXlBOUlHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MGNtVjBkWEp1SUNoMGVYQmxiMllnWTI5dWMyOXNaU0FoUFQwZ1hDSjFibVJsWm1sdVpXUmNJaWtnSmlZZ1kyOXVjMjlzWlM1bGNuSnZjaUEvWEc1Y2RGeDBYSFFnWm5WdVkzUnBiMjRnS0NrZ2V5QmpiMjV6YjJ4bExtVnljbTl5TG1Gd2NHeDVLR052Ym5OdmJHVXNJR0Z5WjNWdFpXNTBjeWs3SUgwZ09seHVYSFJjZEZ4MElHWjFibU4wYVc5dUlDZ3BJSHQ5TzF4dWZUdGNibHh1ZG1GeUlGOTBhSEp2ZDA5eVRHOW5JRDBnWm5WdVkzUnBiMjRnS0daeWIyMHNJR1VwSUh0Y2JseDBhV1lnS0hSb2NtOTNSbWx5YzNSRmNuSnZjaWtnZTF4dVhIUmNkSFJvY205M0lHVTdYRzVjZEgwZ1pXeHpaU0I3WEc1Y2RGeDBkbUZ5SUhCeWFXNTBRWEpuY3lBOUlGdGNJa1Y0WTJWd2RHbHZiaUJtY205dElGUnlZV05yY2lCY0lpQXJJR1p5YjIwZ0t5QmNJaUJtZFc1amRHbHZianBjSWwwN1hHNWNkRngwYVdZZ0tHVXVjM1JoWTJzZ0ppWWdaUzV0WlhOellXZGxJQ1ltSUdVdWJtRnRaU2tnZTF4dVhIUmNkRngwZG1GeUlHbGtlQ0E5SUdVdWMzUmhZMnN1YVc1a1pYaFBaaWhsTG0xbGMzTmhaMlVwTzF4dVhIUmNkRngwYVdZZ0tHbGtlQ0E4SURBZ2ZId2dhV1I0SUQ0Z1pTNXVZVzFsTG14bGJtZDBhQ0FySURJcElIc2dMeThnWTJobFkyc2dabTl5SUZ3aVJYSnliM0k2SUZ3aVhHNWNkRngwWEhSY2RDOHZJRzFsYzNOaFoyVWdhWE1nYm05MElIQmhjblFnYjJZZ2RHaGxJSE4wWVdOclhHNWNkRngwWEhSY2RIWmhjaUJ0WlhOellXZGxJRDBnWlM1dVlXMWxJQ3NnWENJNklGd2lJQ3NnWlM1dFpYTnpZV2RsTzF4dVhIUmNkRngwWEhSd2NtbHVkRUZ5WjNNdWNIVnphQ2h0WlhOellXZGxLVHRjYmx4MFhIUmNkSDFjYmx4MFhIUjlYRzVjZEZ4MGNISnBiblJCY21kekxuQjFjMmdvWlM1emRHRmpheWs3WEc1Y2JseDBYSFJtYjNJZ0tIWmhjaUJwSUQwZ01Ec2dhU0E4SUhCeWFXNTBRWEpuY3k1c1pXNW5kR2c3SUdrckt5a2dlMXh1WEhSY2RGeDBYMlJsWW5WblJuVnVZeWdwS0hCeWFXNTBRWEpuYzF0cFhTazdYRzVjZEZ4MGZWeHVYSFI5WEc1OU8xeHVYRzR2THlCVVlXdGxjeUJoSUdaMWJtTjBhVzl1SUdCbVlDd2dZVzVrSUhkeVlYQnpJR2wwSUdsdUlHRWdZRTFsZEdWdmNpNWZibTlaYVdWc1pITkJiR3h2ZDJWa1lGeHVMeThnWW14dlkyc2dhV1lnZDJVZ1lYSmxJSEoxYm01cGJtY2diMjRnZEdobElITmxjblpsY2k0Z1QyNGdkR2hsSUdOc2FXVnVkQ3dnY21WMGRYSnVjeUIwYUdWY2JpOHZJRzl5YVdkcGJtRnNJR1oxYm1OMGFXOXVJQ2h6YVc1alpTQmdUV1YwWlc5eUxsOXViMWxwWld4a2MwRnNiRzkzWldSZ0lHbHpJR0ZjYmk4dklHNXZMVzl3S1M0Z1ZHaHBjeUJvWVhNZ2RHaGxJR0psYm1WbWFYUWdiMllnYm05MElHRmtaR2x1WnlCaGJpQjFibTVsWTJWemMyRnllU0J6ZEdGamExeHVMeThnWm5KaGJXVWdiMjRnZEdobElHTnNhV1Z1ZEM1Y2JuWmhjaUIzYVhSb1RtOVphV1ZzWkhOQmJHeHZkMlZrSUQwZ1puVnVZM1JwYjI0Z0tHWXBJSHRjYmx4MGNtVjBkWEp1SUdZN1hHNTlPMXh1WEc1MllYSWdibVY0ZEVsa0lEMGdNVHRjYmk4dklHTnZiWEIxZEdGMGFXOXVjeUIzYUc5elpTQmpZV3hzWW1GamEzTWdkMlVnYzJodmRXeGtJR05oYkd3Z1lYUWdabXgxYzJnZ2RHbHRaVnh1ZG1GeUlIQmxibVJwYm1kRGIyMXdkWFJoZEdsdmJuTWdQU0JiWFR0Y2JpOHZJR0IwY25WbFlDQnBaaUJoSUZSeVlXTnJjaTVtYkhWemFDQnBjeUJ6WTJobFpIVnNaV1FzSUc5eUlHbG1JSGRsSUdGeVpTQnBiaUJVY21GamEzSXVabXgxYzJnZ2JtOTNYRzUyWVhJZ2QybHNiRVpzZFhOb0lEMGdabUZzYzJVN1hHNHZMeUJnZEhKMVpXQWdhV1lnZDJVZ1lYSmxJR2x1SUZSeVlXTnJjaTVtYkhWemFDQnViM2RjYm5aaGNpQnBia1pzZFhOb0lEMGdabUZzYzJVN1hHNHZMeUJnZEhKMVpXQWdhV1lnZDJVZ1lYSmxJR052YlhCMWRHbHVaeUJoSUdOdmJYQjFkR0YwYVc5dUlHNXZkeXdnWldsMGFHVnlJR1pwY25OMElIUnBiV1ZjYmk4dklHOXlJSEpsWTI5dGNIVjBaUzVjZEZSb2FYTWdiV0YwWTJobGN5QlVjbUZqYTNJdVlXTjBhWFpsSUhWdWJHVnpjeUIzWlNCaGNtVWdhVzV6YVdSbFhHNHZMeUJVY21GamEzSXVibTl1Y21WaFkzUnBkbVVzSUhkb2FXTm9JRzUxYkd4bWFXVnpJR04xY25KbGJuUkRiMjF3ZFhSaGRHbHZiaUJsZG1WdUlIUm9iM1ZuYUZ4dUx5OGdZVzRnWlc1amJHOXphVzVuSUdOdmJYQjFkR0YwYVc5dUlHMWhlU0J6ZEdsc2JDQmlaU0J5ZFc1dWFXNW5MbHh1ZG1GeUlHbHVRMjl0Y0hWMFpTQTlJR1poYkhObE8xeHVMeThnWUhSeWRXVmdJR2xtSUhSb1pTQmdYM1JvY205M1JtbHljM1JGY25KdmNtQWdiM0IwYVc5dUlIZGhjeUJ3WVhOelpXUWdhVzRnZEc4Z2RHaGxJR05oYkd4Y2JpOHZJSFJ2SUZSeVlXTnJjaTVtYkhWemFDQjBhR0YwSUhkbElHRnlaU0JwYmk0Z1YyaGxiaUJ6WlhRc0lIUm9jbTkzSUhKaGRHaGxjaUIwYUdGdUlHeHZaeUIwYUdWY2JpOHZJR1pwY25OMElHVnljbTl5SUdWdVkyOTFiblJsY21Wa0lIZG9hV3hsSUdac2RYTm9hVzVuTGlCQ1pXWnZjbVVnZEdoeWIzZHBibWNnZEdobElHVnljbTl5TEZ4dUx5OGdabWx1YVhOb0lHWnNkWE5vYVc1bklDaG1jbTl0SUdFZ1ptbHVZV3hzZVNCaWJHOWpheWtzSUd4dloyZHBibWNnWVc1NUlITjFZbk5sY1hWbGJuUmNiaTh2SUdWeWNtOXljeTVjYm5aaGNpQjBhSEp2ZDBacGNuTjBSWEp5YjNJZ1BTQm1ZV3h6WlR0Y2JseHVkbUZ5SUdGbWRHVnlSbXgxYzJoRFlXeHNZbUZqYTNNZ1BTQmJYVHRjYmx4dWRtRnlJSEpsY1hWbGMzUkJibWx0WVhScGIyNUdjbUZ0WlNBOUlISmxjWFZwY21Vb1hDSnlZV1pjSWlrN1hHNWNiblpoY2lCeVpYRjFhWEpsUm14MWMyZ2dQU0JtZFc1amRHbHZiaUFvS1NCN1hHNWNkR2xtSUNnaElIZHBiR3hHYkhWemFDa2dlMXh1WEhSY2RISmxjWFZsYzNSQmJtbHRZWFJwYjI1R2NtRnRaU2hVY21GamEzSXVYM0oxYmtac2RYTm9LVHRjYmx4MFhIUjNhV3hzUm14MWMyZ2dQU0IwY25WbE8xeHVYSFI5WEc1OU8xeHVYRzR2THlCVWNtRmphM0l1UTI5dGNIVjBZWFJwYjI0Z1kyOXVjM1J5ZFdOMGIzSWdhWE1nZG1semFXSnNaU0JpZFhRZ2NISnBkbUYwWlZ4dUx5OGdLSFJvY205M2N5QmhiaUJsY25KdmNpQnBaaUI1YjNVZ2RISjVJSFJ2SUdOaGJHd2dhWFFwWEc1MllYSWdZMjl1YzNSeWRXTjBhVzVuUTI5dGNIVjBZWFJwYjI0Z1BTQm1ZV3h6WlR0Y2JseHVMeTljYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STNSeVlXTnJaWEpmWTI5dGNIVjBZWFJwYjI1Y2JseHVMeW9xWEc0Z0tpQkFjM1Z0YldGeWVTQkJJRU52YlhCMWRHRjBhVzl1SUc5aWFtVmpkQ0J5WlhCeVpYTmxiblJ6SUdOdlpHVWdkR2hoZENCcGN5QnlaWEJsWVhSbFpHeDVJSEpsY25WdVhHNGdLaUJwYmlCeVpYTndiMjV6WlNCMGIxeHVJQ29nY21WaFkzUnBkbVVnWkdGMFlTQmphR0Z1WjJWekxpQkRiMjF3ZFhSaGRHbHZibk1nWkc5dUozUWdhR0YyWlNCeVpYUjFjbTRnZG1Gc2RXVnpPeUIwYUdWNUlHcDFjM1JjYmlBcUlIQmxjbVp2Y20wZ1lXTjBhVzl1Y3l3Z2MzVmphQ0JoY3lCeVpYSmxibVJsY21sdVp5QmhJSFJsYlhCc1lYUmxJRzl1SUhSb1pTQnpZM0psWlc0dUlFTnZiWEIxZEdGMGFXOXVjMXh1SUNvZ1lYSmxJR055WldGMFpXUWdkWE5wYm1jZ1ZISmhZMnR5TG1GMWRHOXlkVzR1SUZWelpTQnpkRzl3SUhSdklIQnlaWFpsYm5RZ1puVnlkR2hsY2lCeVpYSjFibTVwYm1jZ2IyWWdZVnh1SUNvZ1kyOXRjSFYwWVhScGIyNHVYRzRnS2lCQWFXNXpkR0Z1WTJWdVlXMWxJR052YlhCMWRHRjBhVzl1WEc0Z0tpOWNibFJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZiaUE5SUdaMWJtTjBhVzl1SUNobUxDQndZWEpsYm5Rc0lHOXdkR2x2Ym5NcElIdGNibHgwYVdZZ0tDRWdZMjl1YzNSeWRXTjBhVzVuUTI5dGNIVjBZWFJwYjI0cFhHNWNkRngwZEdoeWIzY2dibVYzSUVWeWNtOXlLRnh1WEhSY2RGeDBYQ0pVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjRnWTI5dWMzUnlkV04wYjNJZ2FYTWdjSEpwZG1GMFpUc2dkWE5sSUZSeVlXTnJjaTVoZFhSdmNuVnVYQ0lwTzF4dVhIUmpiMjV6ZEhKMVkzUnBibWREYjIxd2RYUmhkR2x2YmlBOUlHWmhiSE5sTzF4dVhHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHgwYjNCMGFXOXVjeUE5SUc5d2RHbHZibk1nZkh3Z2UzMDdYRzVjYmx4MEx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4alkyOXRjSFYwWVhScGIyNWZjM1J2Y0hCbFpGeHVYRzVjZEM4cUtseHVYSFFnS2lCQWMzVnRiV0Z5ZVNCVWNuVmxJR2xtSUhSb2FYTWdZMjl0Y0hWMFlYUnBiMjRnYUdGeklHSmxaVzRnYzNSdmNIQmxaQzVjYmx4MElDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dVhIUWdLaUJBYldWdFltVnlUMllnVkhKaFkydHlMa052YlhCMWRHRjBhVzl1WEc1Y2RDQXFJRUJwYm5OMFlXNWpaVnh1WEhRZ0tpQkFibUZ0WlZ4MGMzUnZjSEJsWkZ4dVhIUWdLaTljYmx4MGMyVnNaaTV6ZEc5d2NHVmtJRDBnWm1Gc2MyVTdYRzVjYmx4MEx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4alkyOXRjSFYwWVhScGIyNWZhVzUyWVd4cFpHRjBaV1JjYmx4dVhIUXZLaXBjYmx4MElDb2dRSE4xYlcxaGNua2dWSEoxWlNCcFppQjBhR2x6SUdOdmJYQjFkR0YwYVc5dUlHaGhjeUJpWldWdUlHbHVkbUZzYVdSaGRHVmtJQ2hoYm1RZ2JtOTBJSGxsZENCeVpYSjFiaWtzSUc5eUlHbG1JR2wwSUdoaGN5QmlaV1Z1SUhOMGIzQndaV1F1WEc1Y2RDQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JseDBJQ29nUUcxbGJXSmxjazltSUZSeVlXTnJjaTVEYjIxd2RYUmhkR2x2Ymx4dVhIUWdLaUJBYVc1emRHRnVZMlZjYmx4MElDb2dRRzVoYldWY2RHbHVkbUZzYVdSaGRHVmtYRzVjZENBcUlFQjBlWEJsSUh0Q2IyOXNaV0Z1ZlZ4dVhIUWdLaTljYmx4MGMyVnNaaTVwYm5aaGJHbGtZWFJsWkNBOUlHWmhiSE5sTzF4dVhHNWNkQzh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJMk52YlhCMWRHRjBhVzl1WDJacGNuTjBjblZ1WEc1Y2JseDBMeW9xWEc1Y2RDQXFJRUJ6ZFcxdFlYSjVJRlJ5ZFdVZ1pIVnlhVzVuSUhSb1pTQnBibWwwYVdGc0lISjFiaUJ2WmlCMGFHVWdZMjl0Y0hWMFlYUnBiMjRnWVhRZ2RHaGxJSFJwYldVZ1lGUnlZV05yY2k1aGRYUnZjblZ1WUNCcGN5QmpZV3hzWldRc0lHRnVaQ0JtWVd4elpTQnZiaUJ6ZFdKelpYRjFaVzUwSUhKbGNuVnVjeUJoYm1RZ1lYUWdiM1JvWlhJZ2RHbHRaWE11WEc1Y2RDQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JseDBJQ29nUUcxbGJXSmxjazltSUZSeVlXTnJjaTVEYjIxd2RYUmhkR2x2Ymx4dVhIUWdLaUJBYVc1emRHRnVZMlZjYmx4MElDb2dRRzVoYldWY2RHWnBjbk4wVW5WdVhHNWNkQ0FxSUVCMGVYQmxJSHRDYjI5c1pXRnVmVnh1WEhRZ0tpOWNibHgwYzJWc1ppNW1hWEp6ZEZKMWJpQTlJSFJ5ZFdVN1hHNWNibHgwYzJWc1ppNWZhV1FnUFNCdVpYaDBTV1FyS3p0Y2JseDBjMlZzWmk1ZmIyNUpiblpoYkdsa1lYUmxRMkZzYkdKaFkydHpJRDBnVzEwN1hHNWNkSE5sYkdZdVgyOXVVM1J2Y0VOaGJHeGlZV05yY3lBOUlGdGRPMXh1WEhRdkx5QjBhR1VnY0d4aGJpQnBjeUJoZENCemIyMWxJSEJ2YVc1MElIUnZJSFZ6WlNCMGFHVWdjR0Z5Wlc1MElISmxiR0YwYVc5dVhHNWNkQzh2SUhSdklHTnZibk4wY21GcGJpQjBhR1VnYjNKa1pYSWdkR2hoZENCamIyMXdkWFJoZEdsdmJuTWdZWEpsSUhCeWIyTmxjM05sWkZ4dVhIUnpaV3htTGw5d1lYSmxiblFnUFNCd1lYSmxiblE3WEc1Y2RITmxiR1l1WDJaMWJtTWdQU0JtTzF4dVhIUnpaV3htTGw5dmJrVnljbTl5SUQwZ2IzQjBhVzl1Y3k1dmJrVnljbTl5TzF4dVhIUnpaV3htTGw5eVpXTnZiWEIxZEdsdVp5QTlJR1poYkhObE8xeHVYSFJ6Wld4bUxsOWpiMjUwWlhoMElEMGdiM0IwYVc5dWN5NWpiMjUwWlhoMElIeDhJRzUxYkd3N1hHNWNibHgwTHk4Z1VtVm5hWE4wWlhJZ2RHaGxJR052YlhCMWRHRjBhVzl1SUhkcGRHaHBiaUIwYUdVZ1oyeHZZbUZzSUZSeVlXTnJjaTVjYmx4MFZISmhZMnR5TGw5amIyMXdkWFJoZEdsdmJuTmJjMlZzWmk1ZmFXUmRJRDBnYzJWc1pqdGNibHh1WEhSMllYSWdaWEp5YjNKbFpDQTlJSFJ5ZFdVN1hHNWNkSFJ5ZVNCN1hHNWNkRngwYzJWc1ppNWZZMjl0Y0hWMFpTZ3BPMXh1WEhSY2RHVnljbTl5WldRZ1BTQm1ZV3h6WlR0Y2JseDBmU0JtYVc1aGJHeDVJSHRjYmx4MFhIUnpaV3htTG1acGNuTjBVblZ1SUQwZ1ptRnNjMlU3WEc1Y2RGeDBhV1lnS0dWeWNtOXlaV1FwWEc1Y2RGeDBYSFJ6Wld4bUxuTjBiM0FvS1R0Y2JseDBmVnh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpZMjl0Y0hWMFlYUnBiMjVmYjI1cGJuWmhiR2xrWVhSbFhHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVbVZuYVhOMFpYSnpJR0JqWVd4c1ltRmphMkFnZEc4Z2NuVnVJSGRvWlc0Z2RHaHBjeUJqYjIxd2RYUmhkR2x2YmlCcGN5QnVaWGgwSUdsdWRtRnNhV1JoZEdWa0xDQnZjaUJ5ZFc1eklHbDBJR2x0YldWa2FXRjBaV3g1SUdsbUlIUm9aU0JqYjIxd2RYUmhkR2x2YmlCcGN5QmhiSEpsWVdSNUlHbHVkbUZzYVdSaGRHVmtMbHgwVkdobElHTmhiR3hpWVdOcklHbHpJSEoxYmlCbGVHRmpkR3g1SUc5dVkyVWdZVzVrSUc1dmRDQjFjRzl1SUdaMWRIVnlaU0JwYm5aaGJHbGtZWFJwYjI1eklIVnViR1Z6Y3lCZ2IyNUpiblpoYkdsa1lYUmxZQ0JwY3lCallXeHNaV1FnWVdkaGFXNGdZV1owWlhJZ2RHaGxJR052YlhCMWRHRjBhVzl1SUdKbFkyOXRaWE1nZG1Gc2FXUWdZV2RoYVc0dVhHNGdLaUJBYkc5amRYTWdRMnhwWlc1MFhHNGdLaUJBY0dGeVlXMGdlMFoxYm1OMGFXOXVmU0JqWVd4c1ltRmpheUJHZFc1amRHbHZiaUIwYnlCaVpTQmpZV3hzWldRZ2IyNGdhVzUyWVd4cFpHRjBhVzl1TGlCU1pXTmxhWFpsY3lCdmJtVWdZWEpuZFcxbGJuUXNJSFJvWlNCamIyMXdkWFJoZEdsdmJpQjBhR0YwSUhkaGN5QnBiblpoYkdsa1lYUmxaQzVjYmlBcUwxeHVWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVMbkJ5YjNSdmRIbHdaUzV2YmtsdWRtRnNhV1JoZEdVZ1BTQm1kVzVqZEdsdmJpQW9aaXdnWTNSNEtTQjdYRzVjZEhaaGNpQnpaV3htSUQwZ2RHaHBjenRjYmx4dVhIUnBaaUFvZEhsd1pXOW1JR1lnSVQwOUlDZG1kVzVqZEdsdmJpY3BYRzVjZEZ4MGRHaHliM2NnYm1WM0lFVnljbTl5S0Z3aWIyNUpiblpoYkdsa1lYUmxJSEpsY1hWcGNtVnpJR0VnWm5WdVkzUnBiMjVjSWlrN1hHNWNibHgwYVdZZ0tITmxiR1l1YVc1MllXeHBaR0YwWldRcElIdGNibHgwWEhSVWNtRmphM0l1Ym05dWNtVmhZM1JwZG1Vb1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSY2RGeDBkMmwwYUU1dldXbGxiR1J6UVd4c2IzZGxaQ2htS1M1allXeHNLR04wZUNCOGZDQnpaV3htTGw5amIyNTBaWGgwTENCelpXeG1LVHRjYmx4MFhIUjlLVHRjYmx4MGZTQmxiSE5sSUh0Y2JseDBYSFJ6Wld4bUxsOXZia2x1ZG1Gc2FXUmhkR1ZEWVd4c1ltRmphM011Y0hWemFDaDdJR1p1T2lCbUxDQmpkSGc2SUdOMGVDQjlLVHRjYmx4MGZWeHVmVHRjYmx4dUx5b3FYRzRnS2lCQWMzVnRiV0Z5ZVNCU1pXZHBjM1JsY25NZ1lHTmhiR3hpWVdOcllDQjBieUJ5ZFc0Z2QyaGxiaUIwYUdseklHTnZiWEIxZEdGMGFXOXVJR2x6SUhOMGIzQndaV1FzSUc5eUlISjFibk1nYVhRZ2FXMXRaV1JwWVhSbGJIa2dhV1lnZEdobElHTnZiWEIxZEdGMGFXOXVJR2x6SUdGc2NtVmhaSGtnYzNSdmNIQmxaQzVjZEZSb1pTQmpZV3hzWW1GamF5QnBjeUJ5ZFc0Z1lXWjBaWElnWVc1NUlHQnZia2x1ZG1Gc2FXUmhkR1ZnSUdOaGJHeGlZV05yY3k1Y2JpQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JpQXFJRUJ3WVhKaGJTQjdSblZ1WTNScGIyNTlJR05oYkd4aVlXTnJJRVoxYm1OMGFXOXVJSFJ2SUdKbElHTmhiR3hsWkNCdmJpQnpkRzl3TGlCU1pXTmxhWFpsY3lCdmJtVWdZWEpuZFcxbGJuUXNJSFJvWlNCamIyMXdkWFJoZEdsdmJpQjBhR0YwSUhkaGN5QnpkRzl3Y0dWa0xseHVJQ292WEc1VWNtRmphM0l1UTI5dGNIVjBZWFJwYjI0dWNISnZkRzkwZVhCbExtOXVVM1J2Y0NBOUlHWjFibU4wYVc5dUlDaG1MQ0JqZEhncElIdGNibHgwZG1GeUlITmxiR1lnUFNCMGFHbHpPMXh1WEc1Y2RHbG1JQ2gwZVhCbGIyWWdaaUFoUFQwZ0oyWjFibU4wYVc5dUp5bGNibHgwWEhSMGFISnZkeUJ1WlhjZ1JYSnliM0lvWENKdmJsTjBiM0FnY21WeGRXbHlaWE1nWVNCbWRXNWpkR2x2Ymx3aUtUdGNibHh1WEhScFppQW9jMlZzWmk1emRHOXdjR1ZrS1NCN1hHNWNkRngwVkhKaFkydHlMbTV2Ym5KbFlXTjBhWFpsS0daMWJtTjBhVzl1SUNncElIdGNibHgwWEhSY2RIZHBkR2hPYjFscFpXeGtjMEZzYkc5M1pXUW9aaWt1WTJGc2JDaGpkSGdnZkh3Z2MyVnNaaTVmWTI5dWRHVjRkQ3dnYzJWc1ppazdYRzVjZEZ4MGZTazdYRzVjZEgwZ1pXeHpaU0I3WEc1Y2RGeDBjMlZzWmk1ZmIyNVRkRzl3UTJGc2JHSmhZMnR6TG5CMWMyZ29leUJtYmpvZ1ppd2dZM1I0T2lCamRIZ2dmU2s3WEc1Y2RIMWNibjA3WEc1Y2JpOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkyTnZiWEIxZEdGMGFXOXVYMmx1ZG1Gc2FXUmhkR1ZjYmx4dUx5b3FYRzRnS2lCQWMzVnRiV0Z5ZVNCSmJuWmhiR2xrWVhSbGN5QjBhR2x6SUdOdmJYQjFkR0YwYVc5dUlITnZJSFJvWVhRZ2FYUWdkMmxzYkNCaVpTQnlaWEoxYmk1Y2JpQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JpQXFMMXh1VkhKaFkydHlMa052YlhCMWRHRjBhVzl1TG5CeWIzUnZkSGx3WlM1cGJuWmhiR2xrWVhSbElEMGdablZ1WTNScGIyNGdLQ2tnZTF4dVhIUjJZWElnYzJWc1ppQTlJSFJvYVhNN1hHNWNkR2xtSUNnaElITmxiR1l1YVc1MllXeHBaR0YwWldRcElIdGNibHgwWEhRdkx5QnBaaUIzWlNkeVpTQmpkWEp5Wlc1MGJIa2dhVzRnWDNKbFkyOXRjSFYwWlNncExDQmtiMjRuZENCbGJuRjFaWFZsWEc1Y2RGeDBMeThnYjNWeWMyVnNkbVZ6TENCemFXNWpaU0IzWlNkc2JDQnlaWEoxYmlCcGJXMWxaR2xoZEdWc2VTQmhibmwzWVhrdVhHNWNkRngwYVdZZ0tDRWdjMlZzWmk1ZmNtVmpiMjF3ZFhScGJtY2dKaVlnSVNCelpXeG1Mbk4wYjNCd1pXUXBJSHRjYmx4MFhIUmNkSEpsY1hWcGNtVkdiSFZ6YUNncE8xeHVYSFJjZEZ4MGNHVnVaR2x1WjBOdmJYQjFkR0YwYVc5dWN5NXdkWE5vS0hSb2FYTXBPMXh1WEhSY2RIMWNibHh1WEhSY2RITmxiR1l1YVc1MllXeHBaR0YwWldRZ1BTQjBjblZsTzF4dVhHNWNkRngwTHk4Z1kyRnNiR0poWTJ0eklHTmhiaWQwSUdGa1pDQmpZV3hzWW1GamEzTXNJR0psWTJGMWMyVmNibHgwWEhRdkx5QnpaV3htTG1sdWRtRnNhV1JoZEdWa0lEMDlQU0IwY25WbExseHVYSFJjZEdadmNpaDJZWElnYVNBOUlEQXNJR1k3SUdZZ1BTQnpaV3htTGw5dmJrbHVkbUZzYVdSaGRHVkRZV3hzWW1GamEzTmJhVjA3SUdrckt5a2dlMXh1WEhSY2RGeDBWSEpoWTJ0eUxtNXZibkpsWVdOMGFYWmxLR1oxYm1OMGFXOXVJQ2dwSUh0Y2JseDBYSFJjZEZ4MGQybDBhRTV2V1dsbGJHUnpRV3hzYjNkbFpDaG1MbVp1S1M1allXeHNLR1l1WTNSNElIeDhJSE5sYkdZdVgyTnZiblJsZUhRc0lITmxiR1lwTzF4dVhIUmNkRngwZlNrN1hHNWNkRngwZlZ4dVhIUmNkSE5sYkdZdVgyOXVTVzUyWVd4cFpHRjBaVU5oYkd4aVlXTnJjeUE5SUZ0ZE8xeHVYSFI5WEc1OU8xeHVYRzR2THlCb2RIUndPaTh2Wkc5amN5NXRaWFJsYjNJdVkyOXRMeU5qYjIxd2RYUmhkR2x2Ymw5emRHOXdYRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnVUhKbGRtVnVkSE1nZEdocGN5QmpiMjF3ZFhSaGRHbHZiaUJtY205dElISmxjblZ1Ym1sdVp5NWNiaUFxSUVCc2IyTjFjeUJEYkdsbGJuUmNiaUFxTDF4dVZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dUxuQnliM1J2ZEhsd1pTNXpkRzl3SUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2JseDBhV1lnS0NFZ2MyVnNaaTV6ZEc5d2NHVmtLU0I3WEc1Y2RGeDBjMlZzWmk1emRHOXdjR1ZrSUQwZ2RISjFaVHRjYmx4MFhIUnpaV3htTG1sdWRtRnNhV1JoZEdVb0tUdGNibHgwWEhRdkx5QlZibkpsWjJsemRHVnlJR1p5YjIwZ1oyeHZZbUZzSUZSeVlXTnJjaTVjYmx4MFhIUmtaV3hsZEdVZ1ZISmhZMnR5TGw5amIyMXdkWFJoZEdsdmJuTmJjMlZzWmk1ZmFXUmRPMXh1WEhSY2RHWnZjaWgyWVhJZ2FTQTlJREFzSUdZN0lHWWdQU0J6Wld4bUxsOXZibE4wYjNCRFlXeHNZbUZqYTNOYmFWMDdJR2tyS3lrZ2UxeHVYSFJjZEZ4MFZISmhZMnR5TG01dmJuSmxZV04wYVhabEtHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MFhIUmNkRngwZDJsMGFFNXZXV2xsYkdSelFXeHNiM2RsWkNobUxtWnVLUzVqWVd4c0tHWXVZM1I0SUh4OElITmxiR1l1WDJOdmJuUmxlSFFzSUhObGJHWXBPMXh1WEhSY2RGeDBmU2s3WEc1Y2RGeDBmVnh1WEhSY2RITmxiR1l1WDI5dVUzUnZjRU5oYkd4aVlXTnJjeUE5SUZ0ZE8xeHVYSFI5WEc1OU8xeHVYRzVVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjR1Y0hKdmRHOTBlWEJsTGw5amIyMXdkWFJsSUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2RITmxiR1l1YVc1MllXeHBaR0YwWldRZ1BTQm1ZV3h6WlR0Y2JseHVYSFIyWVhJZ2NISmxkbWx2ZFhNZ1BTQlVjbUZqYTNJdVkzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dU8xeHVYSFJ6WlhSRGRYSnlaVzUwUTI5dGNIVjBZWFJwYjI0b2MyVnNaaWs3WEc1Y2RIWmhjaUJ3Y21WMmFXOTFjMGx1UTI5dGNIVjBaU0E5SUdsdVEyOXRjSFYwWlR0Y2JseDBhVzVEYjIxd2RYUmxJRDBnZEhKMVpUdGNibHgwZEhKNUlIdGNibHgwWEhSM2FYUm9UbTlaYVdWc1pITkJiR3h2ZDJWa0tITmxiR1l1WDJaMWJtTXBMbU5oYkd3b2MyVnNaaTVmWTI5dWRHVjRkQ3dnYzJWc1ppazdYRzVjZEgwZ1ptbHVZV3hzZVNCN1hHNWNkRngwYzJWMFEzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dUtIQnlaWFpwYjNWektUdGNibHgwWEhScGJrTnZiWEIxZEdVZ1BTQndjbVYyYVc5MWMwbHVRMjl0Y0hWMFpUdGNibHgwZlZ4dWZUdGNibHh1VkhKaFkydHlMa052YlhCMWRHRjBhVzl1TG5CeWIzUnZkSGx3WlM1ZmJtVmxaSE5TWldOdmJYQjFkR1VnUFNCbWRXNWpkR2x2YmlBb0tTQjdYRzVjZEhaaGNpQnpaV3htSUQwZ2RHaHBjenRjYmx4MGNtVjBkWEp1SUhObGJHWXVhVzUyWVd4cFpHRjBaV1FnSmlZZ0lTQnpaV3htTG5OMGIzQndaV1E3WEc1OU8xeHVYRzVVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjR1Y0hKdmRHOTBlWEJsTGw5eVpXTnZiWEIxZEdVZ1BTQm1kVzVqZEdsdmJpQW9LU0I3WEc1Y2RIWmhjaUJ6Wld4bUlEMGdkR2hwY3p0Y2JseHVYSFJ6Wld4bUxsOXlaV052YlhCMWRHbHVaeUE5SUhSeWRXVTdYRzVjZEhSeWVTQjdYRzVjZEZ4MGFXWWdLSE5sYkdZdVgyNWxaV1J6VW1WamIyMXdkWFJsS0NrcElIdGNibHgwWEhSY2RIUnllU0I3WEc1Y2RGeDBYSFJjZEhObGJHWXVYMk52YlhCMWRHVW9LVHRjYmx4MFhIUmNkSDBnWTJGMFkyZ2dLR1VwSUh0Y2JseDBYSFJjZEZ4MGFXWWdLSE5sYkdZdVgyOXVSWEp5YjNJcElIdGNibHgwWEhSY2RGeDBYSFJ6Wld4bUxsOXZia1Z5Y205eUtHVXBPMXh1WEhSY2RGeDBYSFI5SUdWc2MyVWdlMXh1WEhSY2RGeDBYSFJjZEY5MGFISnZkMDl5VEc5bktGd2ljbVZqYjIxd2RYUmxYQ0lzSUdVcE8xeHVYSFJjZEZ4MFhIUjlYRzVjZEZ4MFhIUjlYRzVjZEZ4MGZWeHVYSFI5SUdacGJtRnNiSGtnZTF4dVhIUmNkSE5sYkdZdVgzSmxZMjl0Y0hWMGFXNW5JRDBnWm1Gc2MyVTdYRzVjZEgxY2JuMDdYRzVjYmk4dlhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TjBjbUZqYTJWeVgyUmxjR1Z1WkdWdVkzbGNibHh1THlvcVhHNGdLaUJBYzNWdGJXRnllU0JCSUVSbGNHVnVaR1Z1WTNrZ2NtVndjbVZ6Wlc1MGN5QmhiaUJoZEc5dGFXTWdkVzVwZENCdlppQnlaV0ZqZEdsMlpTQmtZWFJoSUhSb1lYUWdZVnh1SUNvZ1kyOXRjSFYwWVhScGIyNGdiV2xuYUhRZ1pHVndaVzVrSUc5dUxpQlNaV0ZqZEdsMlpTQmtZWFJoSUhOdmRYSmpaWE1nYzNWamFDQmhjeUJUWlhOemFXOXVJRzl5WEc0Z0tpQk5hVzVwYlc5dVoyOGdhVzUwWlhKdVlXeHNlU0JqY21WaGRHVWdaR2xtWm1WeVpXNTBJRVJsY0dWdVpHVnVZM2tnYjJKcVpXTjBjeUJtYjNJZ1pHbG1abVZ5Wlc1MFhHNGdLaUJ3YVdWalpYTWdiMllnWkdGMFlTd2daV0ZqYUNCdlppQjNhR2xqYUNCdFlYa2dZbVVnWkdWd1pXNWtaV1FnYjI0Z1lua2diWFZzZEdsd2JHVWdZMjl0Y0hWMFlYUnBiMjV6TGx4dUlDb2dWMmhsYmlCMGFHVWdaR0YwWVNCamFHRnVaMlZ6TENCMGFHVWdZMjl0Y0hWMFlYUnBiMjV6SUdGeVpTQnBiblpoYkdsa1lYUmxaQzVjYmlBcUlFQmpiR0Z6YzF4dUlDb2dRR2x1YzNSaGJtTmxUbUZ0WlNCa1pYQmxibVJsYm1ONVhHNGdLaTljYmxSeVlXTnJjaTVFWlhCbGJtUmxibU41SUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMGFHbHpMbDlrWlhCbGJtUmxiblJ6UW5sSlpDQTlJSHQ5TzF4dWZUdGNibHh1THk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqWkdWd1pXNWtaVzVqZVY5a1pYQmxibVJjYmk4dlhHNHZMeUJCWkdSeklHQmpiMjF3ZFhSaGRHbHZibUFnZEc4Z2RHaHBjeUJ6WlhRZ2FXWWdhWFFnYVhNZ2JtOTBJR0ZzY21WaFpIbGNiaTh2SUhCeVpYTmxiblF1WEhSU1pYUjFjbTV6SUhSeWRXVWdhV1lnWUdOdmJYQjFkR0YwYVc5dVlDQnBjeUJoSUc1bGR5QnRaVzFpWlhJZ2IyWWdkR2hsSUhObGRDNWNiaTh2SUVsbUlHNXZJR0Z5WjNWdFpXNTBMQ0JrWldaaGRXeDBjeUIwYnlCamRYSnlaVzUwUTI5dGNIVjBZWFJwYjI0c0lHOXlJR1J2WlhNZ2JtOTBhR2x1WjF4dUx5OGdhV1lnZEdobGNtVWdhWE1nYm04Z1kzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dUxseHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRVJsWTJ4aGNtVnpJSFJvWVhRZ2RHaGxJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjRnS0c5eUlHQm1jbTl0UTI5dGNIVjBZWFJwYjI1Z0lHbG1JR2RwZG1WdUtTQmtaWEJsYm1SeklHOXVJR0JrWlhCbGJtUmxibU41WUM1Y2RGUm9aU0JqYjIxd2RYUmhkR2x2YmlCM2FXeHNJR0psSUdsdWRtRnNhV1JoZEdWa0lIUm9aU0J1WlhoMElIUnBiV1VnWUdSbGNHVnVaR1Z1WTNsZ0lHTm9ZVzVuWlhNdVhHNWNia2xtSUhSb1pYSmxJR2x6SUc1dklHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNGdZVzVrSUdCa1pYQmxibVFvS1dBZ2FYTWdZMkZzYkdWa0lIZHBkR2dnYm04Z1lYSm5kVzFsYm5SekxDQnBkQ0JrYjJWeklHNXZkR2hwYm1jZ1lXNWtJSEpsZEhWeWJuTWdabUZzYzJVdVhHNWNibEpsZEhWeWJuTWdkSEoxWlNCcFppQjBhR1VnWTI5dGNIVjBZWFJwYjI0Z2FYTWdZU0J1WlhjZ1pHVndaVzVrWlc1MElHOW1JR0JrWlhCbGJtUmxibU41WUNCeVlYUm9aWElnZEdoaGJpQmhiaUJsZUdsemRHbHVaeUJ2Ym1VdVhHNGdLaUJBYkc5amRYTWdRMnhwWlc1MFhHNGdLaUJBY0dGeVlXMGdlMVJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZibjBnVzJaeWIyMURiMjF3ZFhSaGRHbHZibDBnUVc0Z2IzQjBhVzl1WVd3Z1kyOXRjSFYwWVhScGIyNGdaR1ZqYkdGeVpXUWdkRzhnWkdWd1pXNWtJRzl1SUdCa1pYQmxibVJsYm1ONVlDQnBibk4wWldGa0lHOW1JSFJvWlNCamRYSnlaVzUwSUdOdmJYQjFkR0YwYVc5dUxseHVJQ29nUUhKbGRIVnlibk1nZTBKdmIyeGxZVzU5WEc0Z0tpOWNibFJ5WVdOcmNpNUVaWEJsYm1SbGJtTjVMbkJ5YjNSdmRIbHdaUzVrWlhCbGJtUWdQU0JtZFc1amRHbHZiaUFvWTI5dGNIVjBZWFJwYjI0cElIdGNibHgwYVdZZ0tDRWdZMjl0Y0hWMFlYUnBiMjRwSUh0Y2JseDBYSFJwWmlBb0lTQlVjbUZqYTNJdVlXTjBhWFpsS1Z4dVhIUmNkRngwY21WMGRYSnVJR1poYkhObE8xeHVYRzVjZEZ4MFkyOXRjSFYwWVhScGIyNGdQU0JVY21GamEzSXVZM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVPMXh1WEhSOVhHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHgwZG1GeUlHbGtJRDBnWTI5dGNIVjBZWFJwYjI0dVgybGtPMXh1WEhScFppQW9JU0FvYVdRZ2FXNGdjMlZzWmk1ZlpHVndaVzVrWlc1MGMwSjVTV1FwS1NCN1hHNWNkRngwYzJWc1ppNWZaR1Z3Wlc1a1pXNTBjMEo1U1dSYmFXUmRJRDBnWTI5dGNIVjBZWFJwYjI0N1hHNWNkRngwWTI5dGNIVjBZWFJwYjI0dWIyNUpiblpoYkdsa1lYUmxLR1oxYm1OMGFXOXVJQ2dwSUh0Y2JseDBYSFJjZEdSbGJHVjBaU0J6Wld4bUxsOWtaWEJsYm1SbGJuUnpRbmxKWkZ0cFpGMDdYRzVjZEZ4MGZTazdYRzVjZEZ4MGNtVjBkWEp1SUhSeWRXVTdYRzVjZEgxY2JseDBjbVYwZFhKdUlHWmhiSE5sTzF4dWZUdGNibHh1THk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqWkdWd1pXNWtaVzVqZVY5amFHRnVaMlZrWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1NXNTJZV3hwWkdGMFpTQmhiR3dnWkdWd1pXNWtaVzUwSUdOdmJYQjFkR0YwYVc5dWN5QnBiVzFsWkdsaGRHVnNlU0JoYm1RZ2NtVnRiM1psSUhSb1pXMGdZWE1nWkdWd1pXNWtaVzUwY3k1Y2JpQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JpQXFMMXh1VkhKaFkydHlMa1JsY0dWdVpHVnVZM2t1Y0hKdmRHOTBlWEJsTG1Ob1lXNW5aV1FnUFNCbWRXNWpkR2x2YmlBb0tTQjdYRzVjZEhaaGNpQnpaV3htSUQwZ2RHaHBjenRjYmx4MFptOXlJQ2gyWVhJZ2FXUWdhVzRnYzJWc1ppNWZaR1Z3Wlc1a1pXNTBjMEo1U1dRcFhHNWNkRngwYzJWc1ppNWZaR1Z3Wlc1a1pXNTBjMEo1U1dSYmFXUmRMbWx1ZG1Gc2FXUmhkR1VvS1R0Y2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STJSbGNHVnVaR1Z1WTNsZmFHRnpaR1Z3Wlc1a1pXNTBjMXh1WEc0dktpcGNiaUFxSUVCemRXMXRZWEo1SUZSeWRXVWdhV1lnZEdocGN5QkVaWEJsYm1SbGJtTjVJR2hoY3lCdmJtVWdiM0lnYlc5eVpTQmtaWEJsYm1SbGJuUWdRMjl0Y0hWMFlYUnBiMjV6TENCM2FHbGphQ0IzYjNWc1pDQmlaU0JwYm5aaGJHbGtZWFJsWkNCcFppQjBhR2x6SUVSbGNHVnVaR1Z1WTNrZ2QyVnlaU0IwYnlCamFHRnVaMlV1WEc0Z0tpQkFiRzlqZFhNZ1EyeHBaVzUwWEc0Z0tpQkFjbVYwZFhKdWN5QjdRbTl2YkdWaGJuMWNiaUFxTDF4dVZISmhZMnR5TGtSbGNHVnVaR1Z1WTNrdWNISnZkRzkwZVhCbExtaGhjMFJsY0dWdVpHVnVkSE1nUFNCbWRXNWpkR2x2YmlBb0tTQjdYRzVjZEhaaGNpQnpaV3htSUQwZ2RHaHBjenRjYmx4MFptOXlLSFpoY2lCcFpDQnBiaUJ6Wld4bUxsOWtaWEJsYm1SbGJuUnpRbmxKWkNsY2JseDBYSFJ5WlhSMWNtNGdkSEoxWlR0Y2JseDBjbVYwZFhKdUlHWmhiSE5sTzF4dWZUdGNibHh1THk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqZEhKaFkydGxjbDltYkhWemFGeHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRkJ5YjJObGMzTWdZV3hzSUhKbFlXTjBhWFpsSUhWd1pHRjBaWE1nYVcxdFpXUnBZWFJsYkhrZ1lXNWtJR1Z1YzNWeVpTQjBhR0YwSUdGc2JDQnBiblpoYkdsa1lYUmxaQ0JqYjIxd2RYUmhkR2x2Ym5NZ1lYSmxJSEpsY25WdUxseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ292WEc1VWNtRmphM0l1Wm14MWMyZ2dQU0JtZFc1amRHbHZiaUFvYjNCMGFXOXVjeWtnZTF4dVhIUlVjbUZqYTNJdVgzSjFia1pzZFhOb0tIc2dabWx1YVhOb1UzbHVZMmh5YjI1dmRYTnNlVG9nZEhKMVpTeGNibHgwWEhSY2RGeDBYSFJjZEZ4MFhIUmNkRngwWEhSMGFISnZkMFpwY25OMFJYSnliM0k2SUc5d2RHbHZibk1nSmlZZ2IzQjBhVzl1Y3k1ZmRHaHliM2RHYVhKemRFVnljbTl5SUgwcE8xeHVmVHRjYmx4dUx5OGdVblZ1SUdGc2JDQndaVzVrYVc1bklHTnZiWEIxZEdGMGFXOXVjeUJoYm1RZ1lXWjBaWEpHYkhWemFDQmpZV3hzWW1GamEzTXVYSFJKWmlCM1pTQjNaWEpsSUc1dmRDQmpZV3hzWldSY2JpOHZJR1JwY21WamRHeDVJSFpwWVNCVWNtRmphM0l1Wm14MWMyZ3NJSFJvYVhNZ2JXRjVJSEpsZEhWeWJpQmlaV1p2Y21VZ2RHaGxlU2R5WlNCaGJHd2daRzl1WlNCMGJ5QmhiR3h2ZDF4dUx5OGdkR2hsSUdWMlpXNTBJR3h2YjNBZ2RHOGdjblZ1SUdFZ2JHbDBkR3hsSUdKbFptOXlaU0JqYjI1MGFXNTFhVzVuTGx4dVZISmhZMnR5TGw5eWRXNUdiSFZ6YUNBOUlHWjFibU4wYVc5dUlDaHZjSFJwYjI1ektTQjdYRzVjZEM4dklGaFlXQ0JYYUdGMElIQmhjblFnYjJZZ2RHaGxJR052YlcxbGJuUWdZbVZzYjNjZ2FYTWdjM1JwYkd3Z2RISjFaVDhnS0ZkbElHNXZJR3h2Ym1kbGNseHVYSFF2THlCb1lYWmxJRk53WVhKcktWeHVYSFF2TDF4dVhIUXZMeUJPWlhOMFpXUWdabXgxYzJnZ1kyOTFiR1FnY0d4aGRYTnBZbXg1SUdoaGNIQmxiaUJwWml3Z2MyRjVMQ0JoSUdac2RYTm9JR05oZFhObGMxeHVYSFF2THlCRVQwMGdiWFYwWVhScGIyNHNJSGRvYVdOb0lHTmhkWE5sY3lCaElGd2lZbXgxY2x3aUlHVjJaVzUwTENCM2FHbGphQ0J5ZFc1eklHRnVYRzVjZEM4dklHRndjQ0JsZG1WdWRDQm9ZVzVrYkdWeUlIUm9ZWFFnWTJGc2JITWdWSEpoWTJ0eUxtWnNkWE5vTGx4MFFYUWdkR2hsSUcxdmJXVnVkRnh1WEhRdkx5QlRjR0Z5YXlCaWJHOWphM01nWlhabGJuUWdhR0Z1Wkd4bGNuTWdaSFZ5YVc1bklFUlBUU0J0ZFhSaGRHbHZiaUJoYm5sM1lYa3NYRzVjZEM4dklHSmxZMkYxYzJVZ2RHaGxJRXhwZG1WU1lXNW5aU0IwY21WbElHbHpiaWQwSUhaaGJHbGtMbHgwUVc1a0lIZGxJR1J2YmlkMElHaGhkbVZjYmx4MEx5OGdZVzU1SUhWelpXWjFiQ0J1YjNScGIyNGdiMllnWVNCdVpYTjBaV1FnWm14MWMyZ3VYRzVjZEM4dlhHNWNkQzh2SUdoMGRIQnpPaTh2WVhCd0xtRnpZVzVoTG1OdmJTOHdMekUxT1Rrd09ETXpNREkwTkM4ek9EVXhNemd5TXpNNE5UWmNibHgwYVdZZ0tHbHVSbXgxYzJncFhHNWNkRngwZEdoeWIzY2dibVYzSUVWeWNtOXlLRndpUTJGdUozUWdZMkZzYkNCVWNtRmphM0l1Wm14MWMyZ2dkMmhwYkdVZ1pteDFjMmhwYm1kY0lpazdYRzVjYmx4MGFXWWdLR2x1UTI5dGNIVjBaU2xjYmx4MFhIUjBhSEp2ZHlCdVpYY2dSWEp5YjNJb1hDSkRZVzRuZENCbWJIVnphQ0JwYm5OcFpHVWdWSEpoWTJ0eUxtRjFkRzl5ZFc1Y0lpazdYRzVjYmx4MGIzQjBhVzl1Y3lBOUlHOXdkR2x2Ym5NZ2ZId2dlMzA3WEc1Y2JseDBhVzVHYkhWemFDQTlJSFJ5ZFdVN1hHNWNkSGRwYkd4R2JIVnphQ0E5SUhSeWRXVTdYRzVjZEhSb2NtOTNSbWx5YzNSRmNuSnZjaUE5SUNFaElHOXdkR2x2Ym5NdWRHaHliM2RHYVhKemRFVnljbTl5TzF4dVhHNWNkSFpoY2lCeVpXTnZiWEIxZEdWa1EyOTFiblFnUFNBd08xeHVYSFIyWVhJZ1ptbHVhWE5vWldSVWNua2dQU0JtWVd4elpUdGNibHgwZEhKNUlIdGNibHgwWEhSM2FHbHNaU0FvY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1c1pXNW5kR2dnZkh4Y2JseDBYSFJjZEZ4MFhIUWdZV1owWlhKR2JIVnphRU5oYkd4aVlXTnJjeTVzWlc1bmRHZ3BJSHRjYmx4dVhIUmNkRngwTHk4Z2NtVmpiMjF3ZFhSbElHRnNiQ0J3Wlc1a2FXNW5JR052YlhCMWRHRjBhVzl1YzF4dVhIUmNkRngwZDJocGJHVWdLSEJsYm1ScGJtZERiMjF3ZFhSaGRHbHZibk11YkdWdVozUm9LU0I3WEc1Y2RGeDBYSFJjZEhaaGNpQmpiMjF3SUQwZ2NHVnVaR2x1WjBOdmJYQjFkR0YwYVc5dWN5NXphR2xtZENncE8xeHVYSFJjZEZ4MFhIUmpiMjF3TGw5eVpXTnZiWEIxZEdVb0tUdGNibHgwWEhSY2RGeDBhV1lnS0dOdmJYQXVYMjVsWldSelVtVmpiMjF3ZFhSbEtDa3BJSHRjYmx4MFhIUmNkRngwWEhSd1pXNWthVzVuUTI5dGNIVjBZWFJwYjI1ekxuVnVjMmhwWm5Rb1kyOXRjQ2s3WEc1Y2RGeDBYSFJjZEgxY2JseHVYSFJjZEZ4MFhIUnBaaUFvSVNCdmNIUnBiMjV6TG1acGJtbHphRk41Ym1Ob2NtOXViM1Z6YkhrZ0ppWWdLeXR5WldOdmJYQjFkR1ZrUTI5MWJuUWdQaUF4TURBd0tTQjdYRzVjZEZ4MFhIUmNkRngwWm1sdWFYTm9aV1JVY25rZ1BTQjBjblZsTzF4dVhIUmNkRngwWEhSY2RISmxkSFZ5Ymp0Y2JseDBYSFJjZEZ4MGZWeHVYSFJjZEZ4MGZWeHVYRzVjZEZ4MFhIUnBaaUFvWVdaMFpYSkdiSFZ6YUVOaGJHeGlZV05yY3k1c1pXNW5kR2dwSUh0Y2JseDBYSFJjZEZ4MEx5OGdZMkZzYkNCdmJtVWdZV1owWlhKR2JIVnphQ0JqWVd4c1ltRmpheXdnZDJocFkyZ2diV0Y1WEc1Y2RGeDBYSFJjZEM4dklHbHVkbUZzYVdSaGRHVWdiVzl5WlNCamIyMXdkWFJoZEdsdmJuTmNibHgwWEhSY2RGeDBkbUZ5SUdOaUlEMGdZV1owWlhKR2JIVnphRU5oYkd4aVlXTnJjeTV6YUdsbWRDZ3BPMXh1WEhSY2RGeDBYSFIwY25rZ2UxeHVYSFJjZEZ4MFhIUmNkR05pTG1adUxtTmhiR3dvWTJJdVkzUjRLVHRjYmx4MFhIUmNkRngwZlNCallYUmphQ0FvWlNrZ2UxeHVYSFJjZEZ4MFhIUmNkRjkwYUhKdmQwOXlURzluS0Z3aVlXWjBaWEpHYkhWemFGd2lMQ0JsS1R0Y2JseDBYSFJjZEZ4MGZWeHVYSFJjZEZ4MGZWeHVYSFJjZEgxY2JseDBYSFJtYVc1cGMyaGxaRlJ5ZVNBOUlIUnlkV1U3WEc1Y2RIMGdabWx1WVd4c2VTQjdYRzVjZEZ4MGFXWWdLQ0VnWm1sdWFYTm9aV1JVY25rcElIdGNibHgwWEhSY2RDOHZJSGRsSjNKbElHVnljbTl5YVc1bklHUjFaU0IwYnlCMGFISnZkMFpwY25OMFJYSnliM0lnWW1WcGJtY2dkSEoxWlM1Y2JseDBYSFJjZEdsdVJteDFjMmdnUFNCbVlXeHpaVHNnTHk4Z2JtVmxaR1ZrSUdKbFptOXlaU0JqWVd4c2FXNW5JR0JVY21GamEzSXVabXgxYzJnb0tXQWdZV2RoYVc1Y2JseDBYSFJjZEM4dklHWnBibWx6YUNCbWJIVnphR2x1WjF4dVhIUmNkRngwVkhKaFkydHlMbDl5ZFc1R2JIVnphQ2g3WEc1Y2RGeDBYSFJjZEdacGJtbHphRk41Ym1Ob2NtOXViM1Z6YkhrNklHOXdkR2x2Ym5NdVptbHVhWE5vVTNsdVkyaHliMjV2ZFhOc2VTeGNibHgwWEhSY2RGeDBkR2h5YjNkR2FYSnpkRVZ5Y205eU9pQm1ZV3h6WlZ4dVhIUmNkRngwZlNrN1hHNWNkRngwZlZ4dVhIUmNkSGRwYkd4R2JIVnphQ0E5SUdaaGJITmxPMXh1WEhSY2RHbHVSbXgxYzJnZ1BTQm1ZV3h6WlR0Y2JseDBYSFJwWmlBb2NHVnVaR2x1WjBOdmJYQjFkR0YwYVc5dWN5NXNaVzVuZEdnZ2ZId2dZV1owWlhKR2JIVnphRU5oYkd4aVlXTnJjeTVzWlc1bmRHZ3BJSHRjYmx4MFhIUmNkQzh2SUZkbEozSmxJSGxwWld4a2FXNW5JR0psWTJGMWMyVWdkMlVnY21GdUlHRWdZblZ1WTJnZ2IyWWdZMjl0Y0hWMFlYUnBiMjV6SUdGdVpDQjNaU0JoY21WdUozUmNibHgwWEhSY2RDOHZJSEpsY1hWcGNtVmtJSFJ2SUdacGJtbHphQ0J6ZVc1amFISnZibTkxYzJ4NUxDQnpieUIzWlNka0lHeHBhMlVnZEc4Z1oybDJaU0IwYUdVZ1pYWmxiblFnYkc5dmNDQmhYRzVjZEZ4MFhIUXZMeUJqYUdGdVkyVXVJRmRsSUhOb2IzVnNaQ0JtYkhWemFDQmhaMkZwYmlCemIyOXVMbHh1WEhSY2RGeDBhV1lnS0c5d2RHbHZibk11Wm1sdWFYTm9VM2x1WTJoeWIyNXZkWE5zZVNrZ2UxeHVYSFJjZEZ4MFhIUjBhSEp2ZHlCdVpYY2dSWEp5YjNJb1hDSnpkR2xzYkNCb1lYWmxJRzF2Y21VZ2RHOGdaRzgvWENJcE8xeDBMeThnYzJodmRXeGtiaWQwSUdoaGNIQmxibHh1WEhSY2RGeDBmVnh1WEhSY2RGeDBjMlYwVkdsdFpXOTFkQ2h5WlhGMWFYSmxSbXgxYzJnc0lERXdLVHRjYmx4MFhIUjlYRzVjZEgxY2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STNSeVlXTnJaWEpmWVhWMGIzSjFibHh1THk5Y2JpOHZJRkoxYmlCbUtDa3VJRkpsWTI5eVpDQnBkSE1nWkdWd1pXNWtaVzVqYVdWekxpQlNaWEoxYmlCcGRDQjNhR1Z1WlhabGNpQjBhR1ZjYmk4dklHUmxjR1Z1WkdWdVkybGxjeUJqYUdGdVoyVXVYRzR2TDF4dUx5OGdVbVYwZFhKdWN5QmhJRzVsZHlCRGIyMXdkWFJoZEdsdmJpd2dkMmhwWTJnZ2FYTWdZV3h6YnlCd1lYTnpaV1FnZEc4Z1ppNWNiaTh2WEc0dkx5Qk1hVzVyY3lCMGFHVWdZMjl0Y0hWMFlYUnBiMjRnZEc4Z2RHaGxJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjVjYmk4dklITnZJSFJvWVhRZ2FYUWdhWE1nYzNSdmNIQmxaQ0JwWmlCMGFHVWdZM1Z5Y21WdWRDQmpiMjF3ZFhSaGRHbHZiaUJwY3lCcGJuWmhiR2xrWVhSbFpDNWNibHh1THlvcVhHNGdLaUJBWTJGc2JHSmhZMnNnVkhKaFkydHlMa052YlhCMWRHRjBhVzl1Um5WdVkzUnBiMjVjYmlBcUlFQndZWEpoYlNCN1ZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dWZWeHVJQ292WEc0dktpcGNiaUFxSUVCemRXMXRZWEo1SUZKMWJpQmhJR1oxYm1OMGFXOXVJRzV2ZHlCaGJtUWdjbVZ5ZFc0Z2FYUWdiR0YwWlhJZ2QyaGxibVYyWlhJZ2FYUnpJR1JsY0dWdVpHVnVZMmxsYzF4dUlDb2dZMmhoYm1kbExpQlNaWFIxY201eklHRWdRMjl0Y0hWMFlYUnBiMjRnYjJKcVpXTjBJSFJvWVhRZ1kyRnVJR0psSUhWelpXUWdkRzhnYzNSdmNDQnZjaUJ2WW5ObGNuWmxJSFJvWlZ4dUlDb2djbVZ5ZFc1dWFXNW5MbHh1SUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1SUNvZ1FIQmhjbUZ0SUh0VWNtRmphM0l1UTI5dGNIVjBZWFJwYjI1R2RXNWpkR2x2Ym4wZ2NuVnVSblZ1WXlCVWFHVWdablZ1WTNScGIyNGdkRzhnY25WdUxpQkpkQ0J5WldObGFYWmxjMXh1SUNvZ2IyNWxJR0Z5WjNWdFpXNTBPaUIwYUdVZ1EyOXRjSFYwWVhScGIyNGdiMkpxWldOMElIUm9ZWFFnZDJsc2JDQmlaU0J5WlhSMWNtNWxaQzVjYmlBcUlFQndZWEpoYlNCN1QySnFaV04wZlNCYmIzQjBhVzl1YzExY2JpQXFJRUJ3WVhKaGJTQjdSblZ1WTNScGIyNTlJRzl3ZEdsdmJuTXViMjVGY25KdmNpQlBjSFJwYjI1aGJDNGdWR2hsSUdaMWJtTjBhVzl1SUhSdklISjFiaUIzYUdWdUlHRnVJR1Z5Y205eVhHNGdLaUJvWVhCd1pXNXpJR2x1SUhSb1pTQkRiMjF3ZFhSaGRHbHZiaTRnVkdobElHOXViSGtnWVhKbmRXMWxiblFnYVhRZ2NtVmphV1YyWlhNZ2FYTWdkR2hsSUVWeWNtOXlYRzRnS2lCMGFISnZkMjR1SUVSbFptRjFiSFJ6SUhSdklIUm9aU0JsY25KdmNpQmlaV2x1WnlCc2IyZG5aV1FnZEc4Z2RHaGxJR052Ym5OdmJHVXVYRzRnS2lCQWNtVjBkWEp1Y3lCN1ZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dWZWeHVJQ292WEc1VWNtRmphM0l1WVhWMGIzSjFiaUE5SUdaMWJtTjBhVzl1SUNobUxDQnZjSFJwYjI1ekxDQmpkSGdwSUh0Y2JseDBhV1lnS0hSNWNHVnZaaUJtSUNFOVBTQW5ablZ1WTNScGIyNG5LVnh1WEhSY2RIUm9jbTkzSUc1bGR5QkZjbkp2Y2lnblZISmhZMnR5TG1GMWRHOXlkVzRnY21WeGRXbHlaWE1nWVNCbWRXNWpkR2x2YmlCaGNtZDFiV1Z1ZENjcE8xeHVYRzVjZEc5d2RHbHZibk1nUFNCdmNIUnBiMjV6SUh4OElIdDlPMXh1WEhScFppQW9ZM1I0S1NCdmNIUnBiMjV6TG1OdmJuUmxlSFFnUFNCamRIZzdYRzVjYmx4MFkyOXVjM1J5ZFdOMGFXNW5RMjl0Y0hWMFlYUnBiMjRnUFNCMGNuVmxPMXh1WEhSMllYSWdZeUE5SUc1bGR5QlVjbUZqYTNJdVEyOXRjSFYwWVhScGIyNG9YRzVjZEZ4MFppd2dWSEpoWTJ0eUxtTjFjbkpsYm5SRGIyMXdkWFJoZEdsdmJpd2diM0IwYVc5dWN5azdYRzVjYmx4MGFXWWdLRlJ5WVdOcmNpNWhZM1JwZG1VcFhHNWNkRngwVkhKaFkydHlMbTl1U1c1MllXeHBaR0YwWlNobWRXNWpkR2x2YmlBb0tTQjdYRzVjZEZ4MFhIUmpMbk4wYjNBb0tUdGNibHgwWEhSOUtUdGNibHh1WEhSeVpYUjFjbTRnWXp0Y2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STNSeVlXTnJaWEpmYm05dWNtVmhZM1JwZG1WY2JpOHZYRzR2THlCU2RXNGdZR1pnSUhkcGRHZ2dibThnWTNWeWNtVnVkQ0JqYjIxd2RYUmhkR2x2Yml3Z2NtVjBkWEp1YVc1bklIUm9aU0J5WlhSMWNtNGdkbUZzZFdWY2JpOHZJRzltSUdCbVlDNWNkRlZ6WldRZ2RHOGdkSFZ5YmlCdlptWWdjbVZoWTNScGRtbDBlU0JtYjNJZ2RHaGxJR1IxY21GMGFXOXVJRzltSUdCbVlDeGNiaTh2SUhOdklIUm9ZWFFnY21WaFkzUnBkbVVnWkdGMFlTQnpiM1Z5WTJWeklHRmpZMlZ6YzJWa0lHSjVJR0JtWUNCM2FXeHNJRzV2ZENCeVpYTjFiSFFnYVc0Z1lXNTVYRzR2THlCamIyMXdkWFJoZEdsdmJuTWdZbVZwYm1jZ2FXNTJZV3hwWkdGMFpXUXVYRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnVW5WdUlHRWdablZ1WTNScGIyNGdkMmwwYUc5MWRDQjBjbUZqYTJsdVp5QmtaWEJsYm1SbGJtTnBaWE11WEc0Z0tpQkFiRzlqZFhNZ1EyeHBaVzUwWEc0Z0tpQkFjR0Z5WVcwZ2UwWjFibU4wYVc5dWZTQm1kVzVqSUVFZ1puVnVZM1JwYjI0Z2RHOGdZMkZzYkNCcGJXMWxaR2xoZEdWc2VTNWNiaUFxTDF4dVZISmhZMnR5TG01dmJsSmxZV04wYVhabElEMWNibFJ5WVdOcmNpNXViMjV5WldGamRHbDJaU0E5SUdaMWJtTjBhVzl1SUNobUxDQmpkSGdwSUh0Y2JseDBkbUZ5SUhCeVpYWnBiM1Z6SUQwZ1ZISmhZMnR5TG1OMWNuSmxiblJEYjIxd2RYUmhkR2x2Ymp0Y2JseDBjMlYwUTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1S0c1MWJHd3BPMXh1WEhSMGNua2dlMXh1WEhSY2RISmxkSFZ5YmlCbUxtTmhiR3dvWTNSNEtUdGNibHgwZlNCbWFXNWhiR3g1SUh0Y2JseDBYSFJ6WlhSRGRYSnlaVzUwUTI5dGNIVjBZWFJwYjI0b2NISmxkbWx2ZFhNcE8xeHVYSFI5WEc1OU8xeHVYRzR2THlCc2FXdGxJRzV2Ym5KbFlXTjBhWFpsSUdKMWRDQnRZV3RsY3lCaElHWjFibU4wYVc5dUlHbHVjM1JsWVdSY2JsUnlZV05yY2k1dWIyNVNaV0ZqZEdGaWJHVWdQVnh1VkhKaFkydHlMbTV2Ym5KbFlXTjBZV0pzWlNBOUlHWjFibU4wYVc5dUlDaG1MQ0JqZEhncElIdGNibHgwY21WMGRYSnVJR1oxYm1OMGFXOXVLQ2tnZTF4dVhIUmNkSFpoY2lCaGNtZHpJRDBnWVhKbmRXMWxiblJ6TzF4dVhIUmNkR2xtSUNoamRIZ2dQVDBnYm5Wc2JDa2dZM1I0SUQwZ2RHaHBjenRjYmx4MFhIUnlaWFIxY200Z1ZISmhZMnR5TG01dmJuSmxZV04wYVhabEtHWjFibU4wYVc5dUtDa2dlMXh1WEhSY2RGeDBjbVYwZFhKdUlHWXVZWEJ3Ykhrb1kzUjRMQ0JoY21kektUdGNibHgwWEhSOUtUdGNibHgwZlR0Y2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STNSeVlXTnJaWEpmYjI1cGJuWmhiR2xrWVhSbFhHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVbVZuYVhOMFpYSnpJR0VnYm1WM0lGdGdiMjVKYm5aaGJHbGtZWFJsWUYwb0kyTnZiWEIxZEdGMGFXOXVYMjl1YVc1MllXeHBaR0YwWlNrZ1kyRnNiR0poWTJzZ2IyNGdkR2hsSUdOMWNuSmxiblFnWTI5dGNIVjBZWFJwYjI0Z0tIZG9hV05vSUcxMWMzUWdaWGhwYzNRcExDQjBieUJpWlNCallXeHNaV1FnYVcxdFpXUnBZWFJsYkhrZ2QyaGxiaUIwYUdVZ1kzVnljbVZ1ZENCamIyMXdkWFJoZEdsdmJpQnBjeUJwYm5aaGJHbGtZWFJsWkNCdmNpQnpkRzl3Y0dWa0xseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRHZFc1amRHbHZibjBnWTJGc2JHSmhZMnNnUVNCallXeHNZbUZqYXlCbWRXNWpkR2x2YmlCMGFHRjBJSGRwYkd3Z1ltVWdhVzUyYjJ0bFpDQmhjeUJnWm5WdVl5aGpLV0FzSUhkb1pYSmxJR0JqWUNCcGN5QjBhR1VnWTI5dGNIVjBZWFJwYjI0Z2IyNGdkMmhwWTJnZ2RHaGxJR05oYkd4aVlXTnJJR2x6SUhKbFoybHpkR1Z5WldRdVhHNGdLaTljYmxSeVlXTnJjaTV2YmtsdWRtRnNhV1JoZEdVZ1BTQm1kVzVqZEdsdmJpQW9aaXdnWTNSNEtTQjdYRzVjZEdsbUlDZ2hJRlJ5WVdOcmNpNWhZM1JwZG1VcFhHNWNkRngwZEdoeWIzY2dibVYzSUVWeWNtOXlLRndpVkhKaFkydHlMbTl1U1c1MllXeHBaR0YwWlNCeVpYRjFhWEpsY3lCaElHTjFjbkpsYm5SRGIyMXdkWFJoZEdsdmJsd2lLVHRjYmx4dVhIUlVjbUZqYTNJdVkzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dUxtOXVTVzUyWVd4cFpHRjBaU2htTENCamRIZ3BPMXh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpkSEpoWTJ0bGNsOWhablJsY21ac2RYTm9YRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnVTJOb1pXUjFiR1Z6SUdFZ1puVnVZM1JwYjI0Z2RHOGdZbVVnWTJGc2JHVmtJR1IxY21sdVp5QjBhR1VnYm1WNGRDQm1iSFZ6YUN3Z2IzSWdiR0YwWlhJZ2FXNGdkR2hsSUdOMWNuSmxiblFnWm14MWMyZ2dhV1lnYjI1bElHbHpJR2x1SUhCeWIyZHlaWE56TENCaFpuUmxjaUJoYkd3Z2FXNTJZV3hwWkdGMFpXUWdZMjl0Y0hWMFlYUnBiMjV6SUdoaGRtVWdZbVZsYmlCeVpYSjFiaTVjZEZSb1pTQm1kVzVqZEdsdmJpQjNhV3hzSUdKbElISjFiaUJ2Ym1ObElHRnVaQ0J1YjNRZ2IyNGdjM1ZpYzJWeGRXVnVkQ0JtYkhWemFHVnpJSFZ1YkdWemN5QmdZV1owWlhKR2JIVnphR0FnYVhNZ1kyRnNiR1ZrSUdGbllXbHVMbHh1SUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1SUNvZ1FIQmhjbUZ0SUh0R2RXNWpkR2x2Ym4wZ1kyRnNiR0poWTJzZ1FTQm1kVzVqZEdsdmJpQjBieUJqWVd4c0lHRjBJR1pzZFhOb0lIUnBiV1V1WEc0Z0tpOWNibFJ5WVdOcmNpNWhablJsY2tac2RYTm9JRDBnWm5WdVkzUnBiMjRnS0dZc0lHTjBlQ2tnZTF4dVhIUmhablJsY2tac2RYTm9RMkZzYkdKaFkydHpMbkIxYzJnb2V5Qm1iam9nWml3Z1kzUjRPaUJqZEhnZ2ZTazdYRzVjZEhKbGNYVnBjbVZHYkhWemFDZ3BPMXh1ZlR0Y2JpSmRmUT09IiwiLy8gICAgIFVuZGVyc2NvcmUuanMgMS44LjNcbi8vICAgICBodHRwOi8vdW5kZXJzY29yZWpzLm9yZ1xuLy8gICAgIChjKSAyMDA5LTIwMTUgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIGFuZCBJbnZlc3RpZ2F0aXZlIFJlcG9ydGVycyAmIEVkaXRvcnNcbi8vICAgICBVbmRlcnNjb3JlIG1heSBiZSBmcmVlbHkgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuXG4oZnVuY3Rpb24oKSB7XG5cbiAgLy8gQmFzZWxpbmUgc2V0dXBcbiAgLy8gLS0tLS0tLS0tLS0tLS1cblxuICAvLyBFc3RhYmxpc2ggdGhlIHJvb3Qgb2JqZWN0LCBgd2luZG93YCBpbiB0aGUgYnJvd3Nlciwgb3IgYGV4cG9ydHNgIG9uIHRoZSBzZXJ2ZXIuXG4gIHZhciByb290ID0gdGhpcztcblxuICAvLyBTYXZlIHRoZSBwcmV2aW91cyB2YWx1ZSBvZiB0aGUgYF9gIHZhcmlhYmxlLlxuICB2YXIgcHJldmlvdXNVbmRlcnNjb3JlID0gcm9vdC5fO1xuXG4gIC8vIFNhdmUgYnl0ZXMgaW4gdGhlIG1pbmlmaWVkIChidXQgbm90IGd6aXBwZWQpIHZlcnNpb246XG4gIHZhciBBcnJheVByb3RvID0gQXJyYXkucHJvdG90eXBlLCBPYmpQcm90byA9IE9iamVjdC5wcm90b3R5cGUsIEZ1bmNQcm90byA9IEZ1bmN0aW9uLnByb3RvdHlwZTtcblxuICAvLyBDcmVhdGUgcXVpY2sgcmVmZXJlbmNlIHZhcmlhYmxlcyBmb3Igc3BlZWQgYWNjZXNzIHRvIGNvcmUgcHJvdG90eXBlcy5cbiAgdmFyXG4gICAgcHVzaCAgICAgICAgICAgICA9IEFycmF5UHJvdG8ucHVzaCxcbiAgICBzbGljZSAgICAgICAgICAgID0gQXJyYXlQcm90by5zbGljZSxcbiAgICB0b1N0cmluZyAgICAgICAgID0gT2JqUHJvdG8udG9TdHJpbmcsXG4gICAgaGFzT3duUHJvcGVydHkgICA9IE9ialByb3RvLmhhc093blByb3BlcnR5O1xuXG4gIC8vIEFsbCAqKkVDTUFTY3JpcHQgNSoqIG5hdGl2ZSBmdW5jdGlvbiBpbXBsZW1lbnRhdGlvbnMgdGhhdCB3ZSBob3BlIHRvIHVzZVxuICAvLyBhcmUgZGVjbGFyZWQgaGVyZS5cbiAgdmFyXG4gICAgbmF0aXZlSXNBcnJheSAgICAgID0gQXJyYXkuaXNBcnJheSxcbiAgICBuYXRpdmVLZXlzICAgICAgICAgPSBPYmplY3Qua2V5cyxcbiAgICBuYXRpdmVCaW5kICAgICAgICAgPSBGdW5jUHJvdG8uYmluZCxcbiAgICBuYXRpdmVDcmVhdGUgICAgICAgPSBPYmplY3QuY3JlYXRlO1xuXG4gIC8vIE5ha2VkIGZ1bmN0aW9uIHJlZmVyZW5jZSBmb3Igc3Vycm9nYXRlLXByb3RvdHlwZS1zd2FwcGluZy5cbiAgdmFyIEN0b3IgPSBmdW5jdGlvbigpe307XG5cbiAgLy8gQ3JlYXRlIGEgc2FmZSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0IGZvciB1c2UgYmVsb3cuXG4gIHZhciBfID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiBpbnN0YW5jZW9mIF8pIHJldHVybiBvYmo7XG4gICAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIF8pKSByZXR1cm4gbmV3IF8ob2JqKTtcbiAgICB0aGlzLl93cmFwcGVkID0gb2JqO1xuICB9O1xuXG4gIC8vIEV4cG9ydCB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yICoqTm9kZS5qcyoqLCB3aXRoXG4gIC8vIGJhY2t3YXJkcy1jb21wYXRpYmlsaXR5IGZvciB0aGUgb2xkIGByZXF1aXJlKClgIEFQSS4gSWYgd2UncmUgaW5cbiAgLy8gdGhlIGJyb3dzZXIsIGFkZCBgX2AgYXMgYSBnbG9iYWwgb2JqZWN0LlxuICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKHR5cGVvZiBtb2R1bGUgIT09ICd1bmRlZmluZWQnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgICBleHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBfO1xuICAgIH1cbiAgICBleHBvcnRzLl8gPSBfO1xuICB9IGVsc2Uge1xuICAgIHJvb3QuXyA9IF87XG4gIH1cblxuICAvLyBDdXJyZW50IHZlcnNpb24uXG4gIF8uVkVSU0lPTiA9ICcxLjguMyc7XG5cbiAgLy8gSW50ZXJuYWwgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGFuIGVmZmljaWVudCAoZm9yIGN1cnJlbnQgZW5naW5lcykgdmVyc2lvblxuICAvLyBvZiB0aGUgcGFzc2VkLWluIGNhbGxiYWNrLCB0byBiZSByZXBlYXRlZGx5IGFwcGxpZWQgaW4gb3RoZXIgVW5kZXJzY29yZVxuICAvLyBmdW5jdGlvbnMuXG4gIHZhciBvcHRpbWl6ZUNiID0gZnVuY3Rpb24oZnVuYywgY29udGV4dCwgYXJnQ291bnQpIHtcbiAgICBpZiAoY29udGV4dCA9PT0gdm9pZCAwKSByZXR1cm4gZnVuYztcbiAgICBzd2l0Y2ggKGFyZ0NvdW50ID09IG51bGwgPyAzIDogYXJnQ291bnQpIHtcbiAgICAgIGNhc2UgMTogcmV0dXJuIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUpO1xuICAgICAgfTtcbiAgICAgIGNhc2UgMjogcmV0dXJuIGZ1bmN0aW9uKHZhbHVlLCBvdGhlcikge1xuICAgICAgICByZXR1cm4gZnVuYy5jYWxsKGNvbnRleHQsIHZhbHVlLCBvdGhlcik7XG4gICAgICB9O1xuICAgICAgY2FzZSAzOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDQ6IHJldHVybiBmdW5jdGlvbihhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgYWNjdW11bGF0b3IsIHZhbHVlLCBpbmRleCwgY29sbGVjdGlvbik7XG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZnVuYy5hcHBseShjb250ZXh0LCBhcmd1bWVudHMpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gQSBtb3N0bHktaW50ZXJuYWwgZnVuY3Rpb24gdG8gZ2VuZXJhdGUgY2FsbGJhY2tzIHRoYXQgY2FuIGJlIGFwcGxpZWRcbiAgLy8gdG8gZWFjaCBlbGVtZW50IGluIGEgY29sbGVjdGlvbiwgcmV0dXJuaW5nIHRoZSBkZXNpcmVkIHJlc3VsdCDigJQgZWl0aGVyXG4gIC8vIGlkZW50aXR5LCBhbiBhcmJpdHJhcnkgY2FsbGJhY2ssIGEgcHJvcGVydHkgbWF0Y2hlciwgb3IgYSBwcm9wZXJ0eSBhY2Nlc3Nvci5cbiAgdmFyIGNiID0gZnVuY3Rpb24odmFsdWUsIGNvbnRleHQsIGFyZ0NvdW50KSB7XG4gICAgaWYgKHZhbHVlID09IG51bGwpIHJldHVybiBfLmlkZW50aXR5O1xuICAgIGlmIChfLmlzRnVuY3Rpb24odmFsdWUpKSByZXR1cm4gb3B0aW1pemVDYih2YWx1ZSwgY29udGV4dCwgYXJnQ291bnQpO1xuICAgIGlmIChfLmlzT2JqZWN0KHZhbHVlKSkgcmV0dXJuIF8ubWF0Y2hlcih2YWx1ZSk7XG4gICAgcmV0dXJuIF8ucHJvcGVydHkodmFsdWUpO1xuICB9O1xuICBfLml0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gY2IodmFsdWUsIGNvbnRleHQsIEluZmluaXR5KTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiBmb3IgY3JlYXRpbmcgYXNzaWduZXIgZnVuY3Rpb25zLlxuICB2YXIgY3JlYXRlQXNzaWduZXIgPSBmdW5jdGlvbihrZXlzRnVuYywgdW5kZWZpbmVkT25seSkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHZhciBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgaWYgKGxlbmd0aCA8IDIgfHwgb2JqID09IG51bGwpIHJldHVybiBvYmo7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDE7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSBhcmd1bWVudHNbaW5kZXhdLFxuICAgICAgICAgICAga2V5cyA9IGtleXNGdW5jKHNvdXJjZSksXG4gICAgICAgICAgICBsID0ga2V5cy5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICAgICAgaWYgKCF1bmRlZmluZWRPbmx5IHx8IG9ialtrZXldID09PSB2b2lkIDApIG9ialtrZXldID0gc291cmNlW2tleV07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHJldHVybiBvYmo7XG4gICAgfTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiBmb3IgY3JlYXRpbmcgYSBuZXcgb2JqZWN0IHRoYXQgaW5oZXJpdHMgZnJvbSBhbm90aGVyLlxuICB2YXIgYmFzZUNyZWF0ZSA9IGZ1bmN0aW9uKHByb3RvdHlwZSkge1xuICAgIGlmICghXy5pc09iamVjdChwcm90b3R5cGUpKSByZXR1cm4ge307XG4gICAgaWYgKG5hdGl2ZUNyZWF0ZSkgcmV0dXJuIG5hdGl2ZUNyZWF0ZShwcm90b3R5cGUpO1xuICAgIEN0b3IucHJvdG90eXBlID0gcHJvdG90eXBlO1xuICAgIHZhciByZXN1bHQgPSBuZXcgQ3RvcjtcbiAgICBDdG9yLnByb3RvdHlwZSA9IG51bGw7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICB2YXIgcHJvcGVydHkgPSBmdW5jdGlvbihrZXkpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gb2JqID09IG51bGwgPyB2b2lkIDAgOiBvYmpba2V5XTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEhlbHBlciBmb3IgY29sbGVjdGlvbiBtZXRob2RzIHRvIGRldGVybWluZSB3aGV0aGVyIGEgY29sbGVjdGlvblxuICAvLyBzaG91bGQgYmUgaXRlcmF0ZWQgYXMgYW4gYXJyYXkgb3IgYXMgYW4gb2JqZWN0XG4gIC8vIFJlbGF0ZWQ6IGh0dHA6Ly9wZW9wbGUubW96aWxsYS5vcmcvfmpvcmVuZG9yZmYvZXM2LWRyYWZ0Lmh0bWwjc2VjLXRvbGVuZ3RoXG4gIC8vIEF2b2lkcyBhIHZlcnkgbmFzdHkgaU9TIDggSklUIGJ1ZyBvbiBBUk0tNjQuICMyMDk0XG4gIHZhciBNQVhfQVJSQVlfSU5ERVggPSBNYXRoLnBvdygyLCA1MykgLSAxO1xuICB2YXIgZ2V0TGVuZ3RoID0gcHJvcGVydHkoJ2xlbmd0aCcpO1xuICB2YXIgaXNBcnJheUxpa2UgPSBmdW5jdGlvbihjb2xsZWN0aW9uKSB7XG4gICAgdmFyIGxlbmd0aCA9IGdldExlbmd0aChjb2xsZWN0aW9uKTtcbiAgICByZXR1cm4gdHlwZW9mIGxlbmd0aCA9PSAnbnVtYmVyJyAmJiBsZW5ndGggPj0gMCAmJiBsZW5ndGggPD0gTUFYX0FSUkFZX0lOREVYO1xuICB9O1xuXG4gIC8vIENvbGxlY3Rpb24gRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gVGhlIGNvcm5lcnN0b25lLCBhbiBgZWFjaGAgaW1wbGVtZW50YXRpb24sIGFrYSBgZm9yRWFjaGAuXG4gIC8vIEhhbmRsZXMgcmF3IG9iamVjdHMgaW4gYWRkaXRpb24gdG8gYXJyYXktbGlrZXMuIFRyZWF0cyBhbGxcbiAgLy8gc3BhcnNlIGFycmF5LWxpa2VzIGFzIGlmIHRoZXkgd2VyZSBkZW5zZS5cbiAgXy5lYWNoID0gXy5mb3JFYWNoID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIGksIGxlbmd0aDtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSkge1xuICAgICAgZm9yIChpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGl0ZXJhdGVlKG9ialtpXSwgaSwgb2JqKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICAgIGZvciAoaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaXRlcmF0ZWUob2JqW2tleXNbaV1dLCBrZXlzW2ldLCBvYmopO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgcmVzdWx0cyBvZiBhcHBseWluZyB0aGUgaXRlcmF0ZWUgdG8gZWFjaCBlbGVtZW50LlxuICBfLm1hcCA9IF8uY29sbGVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICBsZW5ndGggPSAoa2V5cyB8fCBvYmopLmxlbmd0aCxcbiAgICAgICAgcmVzdWx0cyA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgIHJlc3VsdHNbaW5kZXhdID0gaXRlcmF0ZWUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0cztcbiAgfTtcblxuICAvLyBDcmVhdGUgYSByZWR1Y2luZyBmdW5jdGlvbiBpdGVyYXRpbmcgbGVmdCBvciByaWdodC5cbiAgZnVuY3Rpb24gY3JlYXRlUmVkdWNlKGRpcikge1xuICAgIC8vIE9wdGltaXplZCBpdGVyYXRvciBmdW5jdGlvbiBhcyB1c2luZyBhcmd1bWVudHMubGVuZ3RoXG4gICAgLy8gaW4gdGhlIG1haW4gZnVuY3Rpb24gd2lsbCBkZW9wdGltaXplIHRoZSwgc2VlICMxOTkxLlxuICAgIGZ1bmN0aW9uIGl0ZXJhdG9yKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGtleXMsIGluZGV4LCBsZW5ndGgpIHtcbiAgICAgIGZvciAoOyBpbmRleCA+PSAwICYmIGluZGV4IDwgbGVuZ3RoOyBpbmRleCArPSBkaXIpIHtcbiAgICAgICAgdmFyIGN1cnJlbnRLZXkgPSBrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleDtcbiAgICAgICAgbWVtbyA9IGl0ZXJhdGVlKG1lbW8sIG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBtZW1vLCBjb250ZXh0KSB7XG4gICAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQsIDQpO1xuICAgICAgdmFyIGtleXMgPSAhaXNBcnJheUxpa2Uob2JqKSAmJiBfLmtleXMob2JqKSxcbiAgICAgICAgICBsZW5ndGggPSAoa2V5cyB8fCBvYmopLmxlbmd0aCxcbiAgICAgICAgICBpbmRleCA9IGRpciA+IDAgPyAwIDogbGVuZ3RoIC0gMTtcbiAgICAgIC8vIERldGVybWluZSB0aGUgaW5pdGlhbCB2YWx1ZSBpZiBub25lIGlzIHByb3ZpZGVkLlxuICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPCAzKSB7XG4gICAgICAgIG1lbW8gPSBvYmpba2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXhdO1xuICAgICAgICBpbmRleCArPSBkaXI7XG4gICAgICB9XG4gICAgICByZXR1cm4gaXRlcmF0b3Iob2JqLCBpdGVyYXRlZSwgbWVtbywga2V5cywgaW5kZXgsIGxlbmd0aCk7XG4gICAgfTtcbiAgfVxuXG4gIC8vICoqUmVkdWNlKiogYnVpbGRzIHVwIGEgc2luZ2xlIHJlc3VsdCBmcm9tIGEgbGlzdCBvZiB2YWx1ZXMsIGFrYSBgaW5qZWN0YCxcbiAgLy8gb3IgYGZvbGRsYC5cbiAgXy5yZWR1Y2UgPSBfLmZvbGRsID0gXy5pbmplY3QgPSBjcmVhdGVSZWR1Y2UoMSk7XG5cbiAgLy8gVGhlIHJpZ2h0LWFzc29jaWF0aXZlIHZlcnNpb24gb2YgcmVkdWNlLCBhbHNvIGtub3duIGFzIGBmb2xkcmAuXG4gIF8ucmVkdWNlUmlnaHQgPSBfLmZvbGRyID0gY3JlYXRlUmVkdWNlKC0xKTtcblxuICAvLyBSZXR1cm4gdGhlIGZpcnN0IHZhbHVlIHdoaWNoIHBhc3NlcyBhIHRydXRoIHRlc3QuIEFsaWFzZWQgYXMgYGRldGVjdGAuXG4gIF8uZmluZCA9IF8uZGV0ZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICB2YXIga2V5O1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopKSB7XG4gICAgICBrZXkgPSBfLmZpbmRJbmRleChvYmosIHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtleSA9IF8uZmluZEtleShvYmosIHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgfVxuICAgIGlmIChrZXkgIT09IHZvaWQgMCAmJiBrZXkgIT09IC0xKSByZXR1cm4gb2JqW2tleV07XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgdGhhdCBwYXNzIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgc2VsZWN0YC5cbiAgXy5maWx0ZXIgPSBfLnNlbGVjdCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdHMgPSBbXTtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgaWYgKHByZWRpY2F0ZSh2YWx1ZSwgaW5kZXgsIGxpc3QpKSByZXN1bHRzLnB1c2godmFsdWUpO1xuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIFJldHVybiBhbGwgdGhlIGVsZW1lbnRzIGZvciB3aGljaCBhIHRydXRoIHRlc3QgZmFpbHMuXG4gIF8ucmVqZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIob2JqLCBfLm5lZ2F0ZShjYihwcmVkaWNhdGUpKSwgY29udGV4dCk7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIHdoZXRoZXIgYWxsIG9mIHRoZSBlbGVtZW50cyBtYXRjaCBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYGFsbGAuXG4gIF8uZXZlcnkgPSBfLmFsbCA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICBsZW5ndGggPSAoa2V5cyB8fCBvYmopLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgaWYgKCFwcmVkaWNhdGUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG4gIC8vIERldGVybWluZSBpZiBhdCBsZWFzdCBvbmUgZWxlbWVudCBpbiB0aGUgb2JqZWN0IG1hdGNoZXMgYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBhbnlgLlxuICBfLnNvbWUgPSBfLmFueSA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICBsZW5ndGggPSAoa2V5cyB8fCBvYmopLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgaWYgKHByZWRpY2F0ZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaikpIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIHRoZSBhcnJheSBvciBvYmplY3QgY29udGFpbnMgYSBnaXZlbiBpdGVtICh1c2luZyBgPT09YCkuXG4gIC8vIEFsaWFzZWQgYXMgYGluY2x1ZGVzYCBhbmQgYGluY2x1ZGVgLlxuICBfLmNvbnRhaW5zID0gXy5pbmNsdWRlcyA9IF8uaW5jbHVkZSA9IGZ1bmN0aW9uKG9iaiwgaXRlbSwgZnJvbUluZGV4LCBndWFyZCkge1xuICAgIGlmICghaXNBcnJheUxpa2Uob2JqKSkgb2JqID0gXy52YWx1ZXMob2JqKTtcbiAgICBpZiAodHlwZW9mIGZyb21JbmRleCAhPSAnbnVtYmVyJyB8fCBndWFyZCkgZnJvbUluZGV4ID0gMDtcbiAgICByZXR1cm4gXy5pbmRleE9mKG9iaiwgaXRlbSwgZnJvbUluZGV4KSA+PSAwO1xuICB9O1xuXG4gIC8vIEludm9rZSBhIG1ldGhvZCAod2l0aCBhcmd1bWVudHMpIG9uIGV2ZXJ5IGl0ZW0gaW4gYSBjb2xsZWN0aW9uLlxuICBfLmludm9rZSA9IGZ1bmN0aW9uKG9iaiwgbWV0aG9kKSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgdmFyIGlzRnVuYyA9IF8uaXNGdW5jdGlvbihtZXRob2QpO1xuICAgIHJldHVybiBfLm1hcChvYmosIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICB2YXIgZnVuYyA9IGlzRnVuYyA/IG1ldGhvZCA6IHZhbHVlW21ldGhvZF07XG4gICAgICByZXR1cm4gZnVuYyA9PSBudWxsID8gZnVuYyA6IGZ1bmMuYXBwbHkodmFsdWUsIGFyZ3MpO1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYG1hcGA6IGZldGNoaW5nIGEgcHJvcGVydHkuXG4gIF8ucGx1Y2sgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBfLm1hcChvYmosIF8ucHJvcGVydHkoa2V5KSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmlsdGVyYDogc2VsZWN0aW5nIG9ubHkgb2JqZWN0c1xuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLndoZXJlID0gZnVuY3Rpb24ob2JqLCBhdHRycykge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIF8ubWF0Y2hlcihhdHRycykpO1xuICB9O1xuXG4gIC8vIENvbnZlbmllbmNlIHZlcnNpb24gb2YgYSBjb21tb24gdXNlIGNhc2Ugb2YgYGZpbmRgOiBnZXR0aW5nIHRoZSBmaXJzdCBvYmplY3RcbiAgLy8gY29udGFpbmluZyBzcGVjaWZpYyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5maW5kV2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8uZmluZChvYmosIF8ubWF0Y2hlcihhdHRycykpO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWF4aW11bSBlbGVtZW50IChvciBlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgXy5tYXggPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IC1JbmZpbml0eSwgbGFzdENvbXB1dGVkID0gLUluZmluaXR5LFxuICAgICAgICB2YWx1ZSwgY29tcHV0ZWQ7XG4gICAgaWYgKGl0ZXJhdGVlID09IG51bGwgJiYgb2JqICE9IG51bGwpIHtcbiAgICAgIG9iaiA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IG9iai5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB2YWx1ZSA9IG9ialtpXTtcbiAgICAgICAgaWYgKHZhbHVlID4gcmVzdWx0KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgICAgY29tcHV0ZWQgPSBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIGxpc3QpO1xuICAgICAgICBpZiAoY29tcHV0ZWQgPiBsYXN0Q29tcHV0ZWQgfHwgY29tcHV0ZWQgPT09IC1JbmZpbml0eSAmJiByZXN1bHQgPT09IC1JbmZpbml0eSkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICAgIGxhc3RDb21wdXRlZCA9IGNvbXB1dGVkO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG1pbmltdW0gZWxlbWVudCAob3IgZWxlbWVudC1iYXNlZCBjb21wdXRhdGlvbikuXG4gIF8ubWluID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciByZXN1bHQgPSBJbmZpbml0eSwgbGFzdENvbXB1dGVkID0gSW5maW5pdHksXG4gICAgICAgIHZhbHVlLCBjb21wdXRlZDtcbiAgICBpZiAoaXRlcmF0ZWUgPT0gbnVsbCAmJiBvYmogIT0gbnVsbCkge1xuICAgICAgb2JqID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhbHVlID0gb2JqW2ldO1xuICAgICAgICBpZiAodmFsdWUgPCByZXN1bHQpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgICAgIGlmIChjb21wdXRlZCA8IGxhc3RDb21wdXRlZCB8fCBjb21wdXRlZCA9PT0gSW5maW5pdHkgJiYgcmVzdWx0ID09PSBJbmZpbml0eSkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICAgIGxhc3RDb21wdXRlZCA9IGNvbXB1dGVkO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBTaHVmZmxlIGEgY29sbGVjdGlvbiwgdXNpbmcgdGhlIG1vZGVybiB2ZXJzaW9uIG9mIHRoZVxuICAvLyBbRmlzaGVyLVlhdGVzIHNodWZmbGVdKGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvRmlzaGVy4oCTWWF0ZXNfc2h1ZmZsZSkuXG4gIF8uc2h1ZmZsZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBzZXQgPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0gc2V0Lmxlbmd0aDtcbiAgICB2YXIgc2h1ZmZsZWQgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGluZGV4ID0gMCwgcmFuZDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHJhbmQgPSBfLnJhbmRvbSgwLCBpbmRleCk7XG4gICAgICBpZiAocmFuZCAhPT0gaW5kZXgpIHNodWZmbGVkW2luZGV4XSA9IHNodWZmbGVkW3JhbmRdO1xuICAgICAgc2h1ZmZsZWRbcmFuZF0gPSBzZXRbaW5kZXhdO1xuICAgIH1cbiAgICByZXR1cm4gc2h1ZmZsZWQ7XG4gIH07XG5cbiAgLy8gU2FtcGxlICoqbioqIHJhbmRvbSB2YWx1ZXMgZnJvbSBhIGNvbGxlY3Rpb24uXG4gIC8vIElmICoqbioqIGlzIG5vdCBzcGVjaWZpZWQsIHJldHVybnMgYSBzaW5nbGUgcmFuZG9tIGVsZW1lbnQuXG4gIC8vIFRoZSBpbnRlcm5hbCBgZ3VhcmRgIGFyZ3VtZW50IGFsbG93cyBpdCB0byB3b3JrIHdpdGggYG1hcGAuXG4gIF8uc2FtcGxlID0gZnVuY3Rpb24ob2JqLCBuLCBndWFyZCkge1xuICAgIGlmIChuID09IG51bGwgfHwgZ3VhcmQpIHtcbiAgICAgIGlmICghaXNBcnJheUxpa2Uob2JqKSkgb2JqID0gXy52YWx1ZXMob2JqKTtcbiAgICAgIHJldHVybiBvYmpbXy5yYW5kb20ob2JqLmxlbmd0aCAtIDEpXTtcbiAgICB9XG4gICAgcmV0dXJuIF8uc2h1ZmZsZShvYmopLnNsaWNlKDAsIE1hdGgubWF4KDAsIG4pKTtcbiAgfTtcblxuICAvLyBTb3J0IHRoZSBvYmplY3QncyB2YWx1ZXMgYnkgYSBjcml0ZXJpb24gcHJvZHVjZWQgYnkgYW4gaXRlcmF0ZWUuXG4gIF8uc29ydEJ5ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHJldHVybiBfLnBsdWNrKF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICB2YWx1ZTogdmFsdWUsXG4gICAgICAgIGluZGV4OiBpbmRleCxcbiAgICAgICAgY3JpdGVyaWE6IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgbGlzdClcbiAgICAgIH07XG4gICAgfSkuc29ydChmdW5jdGlvbihsZWZ0LCByaWdodCkge1xuICAgICAgdmFyIGEgPSBsZWZ0LmNyaXRlcmlhO1xuICAgICAgdmFyIGIgPSByaWdodC5jcml0ZXJpYTtcbiAgICAgIGlmIChhICE9PSBiKSB7XG4gICAgICAgIGlmIChhID4gYiB8fCBhID09PSB2b2lkIDApIHJldHVybiAxO1xuICAgICAgICBpZiAoYSA8IGIgfHwgYiA9PT0gdm9pZCAwKSByZXR1cm4gLTE7XG4gICAgICB9XG4gICAgICByZXR1cm4gbGVmdC5pbmRleCAtIHJpZ2h0LmluZGV4O1xuICAgIH0pLCAndmFsdWUnKTtcbiAgfTtcblxuICAvLyBBbiBpbnRlcm5hbCBmdW5jdGlvbiB1c2VkIGZvciBhZ2dyZWdhdGUgXCJncm91cCBieVwiIG9wZXJhdGlvbnMuXG4gIHZhciBncm91cCA9IGZ1bmN0aW9uKGJlaGF2aW9yKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4KSB7XG4gICAgICAgIHZhciBrZXkgPSBpdGVyYXRlZSh2YWx1ZSwgaW5kZXgsIG9iaik7XG4gICAgICAgIGJlaGF2aW9yKHJlc3VsdCwgdmFsdWUsIGtleSk7XG4gICAgICB9KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBHcm91cHMgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbi4gUGFzcyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlXG4gIC8vIHRvIGdyb3VwIGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgY3JpdGVyaW9uLlxuICBfLmdyb3VwQnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIHZhbHVlLCBrZXkpIHtcbiAgICBpZiAoXy5oYXMocmVzdWx0LCBrZXkpKSByZXN1bHRba2V5XS5wdXNoKHZhbHVlKTsgZWxzZSByZXN1bHRba2V5XSA9IFt2YWx1ZV07XG4gIH0pO1xuXG4gIC8vIEluZGV4ZXMgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiwgc2ltaWxhciB0byBgZ3JvdXBCeWAsIGJ1dCBmb3JcbiAgLy8gd2hlbiB5b3Uga25vdyB0aGF0IHlvdXIgaW5kZXggdmFsdWVzIHdpbGwgYmUgdW5pcXVlLlxuICBfLmluZGV4QnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIHZhbHVlLCBrZXkpIHtcbiAgICByZXN1bHRba2V5XSA9IHZhbHVlO1xuICB9KTtcblxuICAvLyBDb3VudHMgaW5zdGFuY2VzIG9mIGFuIG9iamVjdCB0aGF0IGdyb3VwIGJ5IGEgY2VydGFpbiBjcml0ZXJpb24uIFBhc3NcbiAgLy8gZWl0aGVyIGEgc3RyaW5nIGF0dHJpYnV0ZSB0byBjb3VudCBieSwgb3IgYSBmdW5jdGlvbiB0aGF0IHJldHVybnMgdGhlXG4gIC8vIGNyaXRlcmlvbi5cbiAgXy5jb3VudEJ5ID0gZ3JvdXAoZnVuY3Rpb24ocmVzdWx0LCB2YWx1ZSwga2V5KSB7XG4gICAgaWYgKF8uaGFzKHJlc3VsdCwga2V5KSkgcmVzdWx0W2tleV0rKzsgZWxzZSByZXN1bHRba2V5XSA9IDE7XG4gIH0pO1xuXG4gIC8vIFNhZmVseSBjcmVhdGUgYSByZWFsLCBsaXZlIGFycmF5IGZyb20gYW55dGhpbmcgaXRlcmFibGUuXG4gIF8udG9BcnJheSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghb2JqKSByZXR1cm4gW107XG4gICAgaWYgKF8uaXNBcnJheShvYmopKSByZXR1cm4gc2xpY2UuY2FsbChvYmopO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopKSByZXR1cm4gXy5tYXAob2JqLCBfLmlkZW50aXR5KTtcbiAgICByZXR1cm4gXy52YWx1ZXMob2JqKTtcbiAgfTtcblxuICAvLyBSZXR1cm4gdGhlIG51bWJlciBvZiBlbGVtZW50cyBpbiBhbiBvYmplY3QuXG4gIF8uc2l6ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIDA7XG4gICAgcmV0dXJuIGlzQXJyYXlMaWtlKG9iaikgPyBvYmoubGVuZ3RoIDogXy5rZXlzKG9iaikubGVuZ3RoO1xuICB9O1xuXG4gIC8vIFNwbGl0IGEgY29sbGVjdGlvbiBpbnRvIHR3byBhcnJheXM6IG9uZSB3aG9zZSBlbGVtZW50cyBhbGwgc2F0aXNmeSB0aGUgZ2l2ZW5cbiAgLy8gcHJlZGljYXRlLCBhbmQgb25lIHdob3NlIGVsZW1lbnRzIGFsbCBkbyBub3Qgc2F0aXNmeSB0aGUgcHJlZGljYXRlLlxuICBfLnBhcnRpdGlvbiA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIgcGFzcyA9IFtdLCBmYWlsID0gW107XG4gICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGtleSwgb2JqKSB7XG4gICAgICAocHJlZGljYXRlKHZhbHVlLCBrZXksIG9iaikgPyBwYXNzIDogZmFpbCkucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIFtwYXNzLCBmYWlsXTtcbiAgfTtcblxuICAvLyBBcnJheSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gR2V0IHRoZSBmaXJzdCBlbGVtZW50IG9mIGFuIGFycmF5LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIHRoZSBmaXJzdCBOXG4gIC8vIHZhbHVlcyBpbiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYGhlYWRgIGFuZCBgdGFrZWAuIFRoZSAqKmd1YXJkKiogY2hlY2tcbiAgLy8gYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgXy5tYXBgLlxuICBfLmZpcnN0ID0gXy5oZWFkID0gXy50YWtlID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkgcmV0dXJuIGFycmF5WzBdO1xuICAgIHJldHVybiBfLmluaXRpYWwoYXJyYXksIGFycmF5Lmxlbmd0aCAtIG4pO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGxhc3QgZW50cnkgb2YgdGhlIGFycmF5LiBFc3BlY2lhbGx5IHVzZWZ1bCBvblxuICAvLyB0aGUgYXJndW1lbnRzIG9iamVjdC4gUGFzc2luZyAqKm4qKiB3aWxsIHJldHVybiBhbGwgdGhlIHZhbHVlcyBpblxuICAvLyB0aGUgYXJyYXksIGV4Y2x1ZGluZyB0aGUgbGFzdCBOLlxuICBfLmluaXRpYWwgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgMCwgTWF0aC5tYXgoMCwgYXJyYXkubGVuZ3RoIC0gKG4gPT0gbnVsbCB8fCBndWFyZCA/IDEgOiBuKSkpO1xuICB9O1xuXG4gIC8vIEdldCB0aGUgbGFzdCBlbGVtZW50IG9mIGFuIGFycmF5LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIHRoZSBsYXN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS5cbiAgXy5sYXN0ID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgaWYgKGFycmF5ID09IG51bGwpIHJldHVybiB2b2lkIDA7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkgcmV0dXJuIGFycmF5W2FycmF5Lmxlbmd0aCAtIDFdO1xuICAgIHJldHVybiBfLnJlc3QoYXJyYXksIE1hdGgubWF4KDAsIGFycmF5Lmxlbmd0aCAtIG4pKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGV2ZXJ5dGhpbmcgYnV0IHRoZSBmaXJzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEFsaWFzZWQgYXMgYHRhaWxgIGFuZCBgZHJvcGAuXG4gIC8vIEVzcGVjaWFsbHkgdXNlZnVsIG9uIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nIGFuICoqbioqIHdpbGwgcmV0dXJuXG4gIC8vIHRoZSByZXN0IE4gdmFsdWVzIGluIHRoZSBhcnJheS5cbiAgXy5yZXN0ID0gXy50YWlsID0gXy5kcm9wID0gZnVuY3Rpb24oYXJyYXksIG4sIGd1YXJkKSB7XG4gICAgcmV0dXJuIHNsaWNlLmNhbGwoYXJyYXksIG4gPT0gbnVsbCB8fCBndWFyZCA/IDEgOiBuKTtcbiAgfTtcblxuICAvLyBUcmltIG91dCBhbGwgZmFsc3kgdmFsdWVzIGZyb20gYW4gYXJyYXkuXG4gIF8uY29tcGFjdCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKGFycmF5LCBfLmlkZW50aXR5KTtcbiAgfTtcblxuICAvLyBJbnRlcm5hbCBpbXBsZW1lbnRhdGlvbiBvZiBhIHJlY3Vyc2l2ZSBgZmxhdHRlbmAgZnVuY3Rpb24uXG4gIHZhciBmbGF0dGVuID0gZnVuY3Rpb24oaW5wdXQsIHNoYWxsb3csIHN0cmljdCwgc3RhcnRJbmRleCkge1xuICAgIHZhciBvdXRwdXQgPSBbXSwgaWR4ID0gMDtcbiAgICBmb3IgKHZhciBpID0gc3RhcnRJbmRleCB8fCAwLCBsZW5ndGggPSBnZXRMZW5ndGgoaW5wdXQpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB2YWx1ZSA9IGlucHV0W2ldO1xuICAgICAgaWYgKGlzQXJyYXlMaWtlKHZhbHVlKSAmJiAoXy5pc0FycmF5KHZhbHVlKSB8fCBfLmlzQXJndW1lbnRzKHZhbHVlKSkpIHtcbiAgICAgICAgLy9mbGF0dGVuIGN1cnJlbnQgbGV2ZWwgb2YgYXJyYXkgb3IgYXJndW1lbnRzIG9iamVjdFxuICAgICAgICBpZiAoIXNoYWxsb3cpIHZhbHVlID0gZmxhdHRlbih2YWx1ZSwgc2hhbGxvdywgc3RyaWN0KTtcbiAgICAgICAgdmFyIGogPSAwLCBsZW4gPSB2YWx1ZS5sZW5ndGg7XG4gICAgICAgIG91dHB1dC5sZW5ndGggKz0gbGVuO1xuICAgICAgICB3aGlsZSAoaiA8IGxlbikge1xuICAgICAgICAgIG91dHB1dFtpZHgrK10gPSB2YWx1ZVtqKytdO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFzdHJpY3QpIHtcbiAgICAgICAgb3V0cHV0W2lkeCsrXSA9IHZhbHVlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gb3V0cHV0O1xuICB9O1xuXG4gIC8vIEZsYXR0ZW4gb3V0IGFuIGFycmF5LCBlaXRoZXIgcmVjdXJzaXZlbHkgKGJ5IGRlZmF1bHQpLCBvciBqdXN0IG9uZSBsZXZlbC5cbiAgXy5mbGF0dGVuID0gZnVuY3Rpb24oYXJyYXksIHNoYWxsb3cpIHtcbiAgICByZXR1cm4gZmxhdHRlbihhcnJheSwgc2hhbGxvdywgZmFsc2UpO1xuICB9O1xuXG4gIC8vIFJldHVybiBhIHZlcnNpb24gb2YgdGhlIGFycmF5IHRoYXQgZG9lcyBub3QgY29udGFpbiB0aGUgc3BlY2lmaWVkIHZhbHVlKHMpLlxuICBfLndpdGhvdXQgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHJldHVybiBfLmRpZmZlcmVuY2UoYXJyYXksIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhIGR1cGxpY2F0ZS1mcmVlIHZlcnNpb24gb2YgdGhlIGFycmF5LiBJZiB0aGUgYXJyYXkgaGFzIGFscmVhZHlcbiAgLy8gYmVlbiBzb3J0ZWQsIHlvdSBoYXZlIHRoZSBvcHRpb24gb2YgdXNpbmcgYSBmYXN0ZXIgYWxnb3JpdGhtLlxuICAvLyBBbGlhc2VkIGFzIGB1bmlxdWVgLlxuICBfLnVuaXEgPSBfLnVuaXF1ZSA9IGZ1bmN0aW9uKGFycmF5LCBpc1NvcnRlZCwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpZiAoIV8uaXNCb29sZWFuKGlzU29ydGVkKSkge1xuICAgICAgY29udGV4dCA9IGl0ZXJhdGVlO1xuICAgICAgaXRlcmF0ZWUgPSBpc1NvcnRlZDtcbiAgICAgIGlzU29ydGVkID0gZmFsc2U7XG4gICAgfVxuICAgIGlmIChpdGVyYXRlZSAhPSBudWxsKSBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgdmFyIHNlZW4gPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgdmFsdWUgPSBhcnJheVtpXSxcbiAgICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlID8gaXRlcmF0ZWUodmFsdWUsIGksIGFycmF5KSA6IHZhbHVlO1xuICAgICAgaWYgKGlzU29ydGVkKSB7XG4gICAgICAgIGlmICghaSB8fCBzZWVuICE9PSBjb21wdXRlZCkgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICBzZWVuID0gY29tcHV0ZWQ7XG4gICAgICB9IGVsc2UgaWYgKGl0ZXJhdGVlKSB7XG4gICAgICAgIGlmICghXy5jb250YWlucyhzZWVuLCBjb21wdXRlZCkpIHtcbiAgICAgICAgICBzZWVuLnB1c2goY29tcHV0ZWQpO1xuICAgICAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICghXy5jb250YWlucyhyZXN1bHQsIHZhbHVlKSkge1xuICAgICAgICByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIHRoZSB1bmlvbjogZWFjaCBkaXN0aW5jdCBlbGVtZW50IGZyb20gYWxsIG9mXG4gIC8vIHRoZSBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLnVuaW9uID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIF8udW5pcShmbGF0dGVuKGFyZ3VtZW50cywgdHJ1ZSwgdHJ1ZSkpO1xuICB9O1xuXG4gIC8vIFByb2R1Y2UgYW4gYXJyYXkgdGhhdCBjb250YWlucyBldmVyeSBpdGVtIHNoYXJlZCBiZXR3ZWVuIGFsbCB0aGVcbiAgLy8gcGFzc2VkLWluIGFycmF5cy5cbiAgXy5pbnRlcnNlY3Rpb24gPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgYXJnc0xlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGl0ZW0gPSBhcnJheVtpXTtcbiAgICAgIGlmIChfLmNvbnRhaW5zKHJlc3VsdCwgaXRlbSkpIGNvbnRpbnVlO1xuICAgICAgZm9yICh2YXIgaiA9IDE7IGogPCBhcmdzTGVuZ3RoOyBqKyspIHtcbiAgICAgICAgaWYgKCFfLmNvbnRhaW5zKGFyZ3VtZW50c1tqXSwgaXRlbSkpIGJyZWFrO1xuICAgICAgfVxuICAgICAgaWYgKGogPT09IGFyZ3NMZW5ndGgpIHJlc3VsdC5wdXNoKGl0ZW0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFRha2UgdGhlIGRpZmZlcmVuY2UgYmV0d2VlbiBvbmUgYXJyYXkgYW5kIGEgbnVtYmVyIG9mIG90aGVyIGFycmF5cy5cbiAgLy8gT25seSB0aGUgZWxlbWVudHMgcHJlc2VudCBpbiBqdXN0IHRoZSBmaXJzdCBhcnJheSB3aWxsIHJlbWFpbi5cbiAgXy5kaWZmZXJlbmNlID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICB2YXIgcmVzdCA9IGZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCB0cnVlLCAxKTtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIGZ1bmN0aW9uKHZhbHVlKXtcbiAgICAgIHJldHVybiAhXy5jb250YWlucyhyZXN0LCB2YWx1ZSk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gWmlwIHRvZ2V0aGVyIG11bHRpcGxlIGxpc3RzIGludG8gYSBzaW5nbGUgYXJyYXkgLS0gZWxlbWVudHMgdGhhdCBzaGFyZVxuICAvLyBhbiBpbmRleCBnbyB0b2dldGhlci5cbiAgXy56aXAgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bnppcChhcmd1bWVudHMpO1xuICB9O1xuXG4gIC8vIENvbXBsZW1lbnQgb2YgXy56aXAuIFVuemlwIGFjY2VwdHMgYW4gYXJyYXkgb2YgYXJyYXlzIGFuZCBncm91cHNcbiAgLy8gZWFjaCBhcnJheSdzIGVsZW1lbnRzIG9uIHNoYXJlZCBpbmRpY2VzXG4gIF8udW56aXAgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciBsZW5ndGggPSBhcnJheSAmJiBfLm1heChhcnJheSwgZ2V0TGVuZ3RoKS5sZW5ndGggfHwgMDtcbiAgICB2YXIgcmVzdWx0ID0gQXJyYXkobGVuZ3RoKTtcblxuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHJlc3VsdFtpbmRleF0gPSBfLnBsdWNrKGFycmF5LCBpbmRleCk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gQ29udmVydHMgbGlzdHMgaW50byBvYmplY3RzLiBQYXNzIGVpdGhlciBhIHNpbmdsZSBhcnJheSBvZiBgW2tleSwgdmFsdWVdYFxuICAvLyBwYWlycywgb3IgdHdvIHBhcmFsbGVsIGFycmF5cyBvZiB0aGUgc2FtZSBsZW5ndGggLS0gb25lIG9mIGtleXMsIGFuZCBvbmUgb2ZcbiAgLy8gdGhlIGNvcnJlc3BvbmRpbmcgdmFsdWVzLlxuICBfLm9iamVjdCA9IGZ1bmN0aW9uKGxpc3QsIHZhbHVlcykge1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGxpc3QpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmICh2YWx1ZXMpIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1dID0gdmFsdWVzW2ldO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0W2xpc3RbaV1bMF1dID0gbGlzdFtpXVsxXTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBHZW5lcmF0b3IgZnVuY3Rpb24gdG8gY3JlYXRlIHRoZSBmaW5kSW5kZXggYW5kIGZpbmRMYXN0SW5kZXggZnVuY3Rpb25zXG4gIGZ1bmN0aW9uIGNyZWF0ZVByZWRpY2F0ZUluZGV4RmluZGVyKGRpcikge1xuICAgIHJldHVybiBmdW5jdGlvbihhcnJheSwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgICAgdmFyIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgICB2YXIgaW5kZXggPSBkaXIgPiAwID8gMCA6IGxlbmd0aCAtIDE7XG4gICAgICBmb3IgKDsgaW5kZXggPj0gMCAmJiBpbmRleCA8IGxlbmd0aDsgaW5kZXggKz0gZGlyKSB7XG4gICAgICAgIGlmIChwcmVkaWNhdGUoYXJyYXlbaW5kZXhdLCBpbmRleCwgYXJyYXkpKSByZXR1cm4gaW5kZXg7XG4gICAgICB9XG4gICAgICByZXR1cm4gLTE7XG4gICAgfTtcbiAgfVxuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGluZGV4IG9uIGFuIGFycmF5LWxpa2UgdGhhdCBwYXNzZXMgYSBwcmVkaWNhdGUgdGVzdFxuICBfLmZpbmRJbmRleCA9IGNyZWF0ZVByZWRpY2F0ZUluZGV4RmluZGVyKDEpO1xuICBfLmZpbmRMYXN0SW5kZXggPSBjcmVhdGVQcmVkaWNhdGVJbmRleEZpbmRlcigtMSk7XG5cbiAgLy8gVXNlIGEgY29tcGFyYXRvciBmdW5jdGlvbiB0byBmaWd1cmUgb3V0IHRoZSBzbWFsbGVzdCBpbmRleCBhdCB3aGljaFxuICAvLyBhbiBvYmplY3Qgc2hvdWxkIGJlIGluc2VydGVkIHNvIGFzIHRvIG1haW50YWluIG9yZGVyLiBVc2VzIGJpbmFyeSBzZWFyY2guXG4gIF8uc29ydGVkSW5kZXggPSBmdW5jdGlvbihhcnJheSwgb2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQsIDEpO1xuICAgIHZhciB2YWx1ZSA9IGl0ZXJhdGVlKG9iaik7XG4gICAgdmFyIGxvdyA9IDAsIGhpZ2ggPSBnZXRMZW5ndGgoYXJyYXkpO1xuICAgIHdoaWxlIChsb3cgPCBoaWdoKSB7XG4gICAgICB2YXIgbWlkID0gTWF0aC5mbG9vcigobG93ICsgaGlnaCkgLyAyKTtcbiAgICAgIGlmIChpdGVyYXRlZShhcnJheVttaWRdKSA8IHZhbHVlKSBsb3cgPSBtaWQgKyAxOyBlbHNlIGhpZ2ggPSBtaWQ7XG4gICAgfVxuICAgIHJldHVybiBsb3c7XG4gIH07XG5cbiAgLy8gR2VuZXJhdG9yIGZ1bmN0aW9uIHRvIGNyZWF0ZSB0aGUgaW5kZXhPZiBhbmQgbGFzdEluZGV4T2YgZnVuY3Rpb25zXG4gIGZ1bmN0aW9uIGNyZWF0ZUluZGV4RmluZGVyKGRpciwgcHJlZGljYXRlRmluZCwgc29ydGVkSW5kZXgpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oYXJyYXksIGl0ZW0sIGlkeCkge1xuICAgICAgdmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpO1xuICAgICAgaWYgKHR5cGVvZiBpZHggPT0gJ251bWJlcicpIHtcbiAgICAgICAgaWYgKGRpciA+IDApIHtcbiAgICAgICAgICAgIGkgPSBpZHggPj0gMCA/IGlkeCA6IE1hdGgubWF4KGlkeCArIGxlbmd0aCwgaSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsZW5ndGggPSBpZHggPj0gMCA/IE1hdGgubWluKGlkeCArIDEsIGxlbmd0aCkgOiBpZHggKyBsZW5ndGggKyAxO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKHNvcnRlZEluZGV4ICYmIGlkeCAmJiBsZW5ndGgpIHtcbiAgICAgICAgaWR4ID0gc29ydGVkSW5kZXgoYXJyYXksIGl0ZW0pO1xuICAgICAgICByZXR1cm4gYXJyYXlbaWR4XSA9PT0gaXRlbSA/IGlkeCA6IC0xO1xuICAgICAgfVxuICAgICAgaWYgKGl0ZW0gIT09IGl0ZW0pIHtcbiAgICAgICAgaWR4ID0gcHJlZGljYXRlRmluZChzbGljZS5jYWxsKGFycmF5LCBpLCBsZW5ndGgpLCBfLmlzTmFOKTtcbiAgICAgICAgcmV0dXJuIGlkeCA+PSAwID8gaWR4ICsgaSA6IC0xO1xuICAgICAgfVxuICAgICAgZm9yIChpZHggPSBkaXIgPiAwID8gaSA6IGxlbmd0aCAtIDE7IGlkeCA+PSAwICYmIGlkeCA8IGxlbmd0aDsgaWR4ICs9IGRpcikge1xuICAgICAgICBpZiAoYXJyYXlbaWR4XSA9PT0gaXRlbSkgcmV0dXJuIGlkeDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG5cbiAgLy8gUmV0dXJuIHRoZSBwb3NpdGlvbiBvZiB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBvZiBhbiBpdGVtIGluIGFuIGFycmF5LFxuICAvLyBvciAtMSBpZiB0aGUgaXRlbSBpcyBub3QgaW5jbHVkZWQgaW4gdGhlIGFycmF5LlxuICAvLyBJZiB0aGUgYXJyYXkgaXMgbGFyZ2UgYW5kIGFscmVhZHkgaW4gc29ydCBvcmRlciwgcGFzcyBgdHJ1ZWBcbiAgLy8gZm9yICoqaXNTb3J0ZWQqKiB0byB1c2UgYmluYXJ5IHNlYXJjaC5cbiAgXy5pbmRleE9mID0gY3JlYXRlSW5kZXhGaW5kZXIoMSwgXy5maW5kSW5kZXgsIF8uc29ydGVkSW5kZXgpO1xuICBfLmxhc3RJbmRleE9mID0gY3JlYXRlSW5kZXhGaW5kZXIoLTEsIF8uZmluZExhc3RJbmRleCk7XG5cbiAgLy8gR2VuZXJhdGUgYW4gaW50ZWdlciBBcnJheSBjb250YWluaW5nIGFuIGFyaXRobWV0aWMgcHJvZ3Jlc3Npb24uIEEgcG9ydCBvZlxuICAvLyB0aGUgbmF0aXZlIFB5dGhvbiBgcmFuZ2UoKWAgZnVuY3Rpb24uIFNlZVxuICAvLyBbdGhlIFB5dGhvbiBkb2N1bWVudGF0aW9uXShodHRwOi8vZG9jcy5weXRob24ub3JnL2xpYnJhcnkvZnVuY3Rpb25zLmh0bWwjcmFuZ2UpLlxuICBfLnJhbmdlID0gZnVuY3Rpb24oc3RhcnQsIHN0b3AsIHN0ZXApIHtcbiAgICBpZiAoc3RvcCA9PSBudWxsKSB7XG4gICAgICBzdG9wID0gc3RhcnQgfHwgMDtcbiAgICAgIHN0YXJ0ID0gMDtcbiAgICB9XG4gICAgc3RlcCA9IHN0ZXAgfHwgMTtcblxuICAgIHZhciBsZW5ndGggPSBNYXRoLm1heChNYXRoLmNlaWwoKHN0b3AgLSBzdGFydCkgLyBzdGVwKSwgMCk7XG4gICAgdmFyIHJhbmdlID0gQXJyYXkobGVuZ3RoKTtcblxuICAgIGZvciAodmFyIGlkeCA9IDA7IGlkeCA8IGxlbmd0aDsgaWR4KyssIHN0YXJ0ICs9IHN0ZXApIHtcbiAgICAgIHJhbmdlW2lkeF0gPSBzdGFydDtcbiAgICB9XG5cbiAgICByZXR1cm4gcmFuZ2U7XG4gIH07XG5cbiAgLy8gRnVuY3Rpb24gKGFoZW0pIEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBEZXRlcm1pbmVzIHdoZXRoZXIgdG8gZXhlY3V0ZSBhIGZ1bmN0aW9uIGFzIGEgY29uc3RydWN0b3JcbiAgLy8gb3IgYSBub3JtYWwgZnVuY3Rpb24gd2l0aCB0aGUgcHJvdmlkZWQgYXJndW1lbnRzXG4gIHZhciBleGVjdXRlQm91bmQgPSBmdW5jdGlvbihzb3VyY2VGdW5jLCBib3VuZEZ1bmMsIGNvbnRleHQsIGNhbGxpbmdDb250ZXh0LCBhcmdzKSB7XG4gICAgaWYgKCEoY2FsbGluZ0NvbnRleHQgaW5zdGFuY2VvZiBib3VuZEZ1bmMpKSByZXR1cm4gc291cmNlRnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICB2YXIgc2VsZiA9IGJhc2VDcmVhdGUoc291cmNlRnVuYy5wcm90b3R5cGUpO1xuICAgIHZhciByZXN1bHQgPSBzb3VyY2VGdW5jLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgIGlmIChfLmlzT2JqZWN0KHJlc3VsdCkpIHJldHVybiByZXN1bHQ7XG4gICAgcmV0dXJuIHNlbGY7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgZnVuY3Rpb24gYm91bmQgdG8gYSBnaXZlbiBvYmplY3QgKGFzc2lnbmluZyBgdGhpc2AsIGFuZCBhcmd1bWVudHMsXG4gIC8vIG9wdGlvbmFsbHkpLiBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgRnVuY3Rpb24uYmluZGAgaWZcbiAgLy8gYXZhaWxhYmxlLlxuICBfLmJpbmQgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0KSB7XG4gICAgaWYgKG5hdGl2ZUJpbmQgJiYgZnVuYy5iaW5kID09PSBuYXRpdmVCaW5kKSByZXR1cm4gbmF0aXZlQmluZC5hcHBseShmdW5jLCBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSkpO1xuICAgIGlmICghXy5pc0Z1bmN0aW9uKGZ1bmMpKSB0aHJvdyBuZXcgVHlwZUVycm9yKCdCaW5kIG11c3QgYmUgY2FsbGVkIG9uIGEgZnVuY3Rpb24nKTtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgYm91bmQgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBleGVjdXRlQm91bmQoZnVuYywgYm91bmQsIGNvbnRleHQsIHRoaXMsIGFyZ3MuY29uY2F0KHNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xuICAgIH07XG4gICAgcmV0dXJuIGJvdW5kO1xuICB9O1xuXG4gIC8vIFBhcnRpYWxseSBhcHBseSBhIGZ1bmN0aW9uIGJ5IGNyZWF0aW5nIGEgdmVyc2lvbiB0aGF0IGhhcyBoYWQgc29tZSBvZiBpdHNcbiAgLy8gYXJndW1lbnRzIHByZS1maWxsZWQsIHdpdGhvdXQgY2hhbmdpbmcgaXRzIGR5bmFtaWMgYHRoaXNgIGNvbnRleHQuIF8gYWN0c1xuICAvLyBhcyBhIHBsYWNlaG9sZGVyLCBhbGxvd2luZyBhbnkgY29tYmluYXRpb24gb2YgYXJndW1lbnRzIHRvIGJlIHByZS1maWxsZWQuXG4gIF8ucGFydGlhbCA9IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICB2YXIgYm91bmRBcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHZhciBib3VuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHBvc2l0aW9uID0gMCwgbGVuZ3RoID0gYm91bmRBcmdzLmxlbmd0aDtcbiAgICAgIHZhciBhcmdzID0gQXJyYXkobGVuZ3RoKTtcbiAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYXJnc1tpXSA9IGJvdW5kQXJnc1tpXSA9PT0gXyA/IGFyZ3VtZW50c1twb3NpdGlvbisrXSA6IGJvdW5kQXJnc1tpXTtcbiAgICAgIH1cbiAgICAgIHdoaWxlIChwb3NpdGlvbiA8IGFyZ3VtZW50cy5sZW5ndGgpIGFyZ3MucHVzaChhcmd1bWVudHNbcG9zaXRpb24rK10pO1xuICAgICAgcmV0dXJuIGV4ZWN1dGVCb3VuZChmdW5jLCBib3VuZCwgdGhpcywgdGhpcywgYXJncyk7XG4gICAgfTtcbiAgICByZXR1cm4gYm91bmQ7XG4gIH07XG5cbiAgLy8gQmluZCBhIG51bWJlciBvZiBhbiBvYmplY3QncyBtZXRob2RzIHRvIHRoYXQgb2JqZWN0LiBSZW1haW5pbmcgYXJndW1lbnRzXG4gIC8vIGFyZSB0aGUgbWV0aG9kIG5hbWVzIHRvIGJlIGJvdW5kLiBVc2VmdWwgZm9yIGVuc3VyaW5nIHRoYXQgYWxsIGNhbGxiYWNrc1xuICAvLyBkZWZpbmVkIG9uIGFuIG9iamVjdCBiZWxvbmcgdG8gaXQuXG4gIF8uYmluZEFsbCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBpLCBsZW5ndGggPSBhcmd1bWVudHMubGVuZ3RoLCBrZXk7XG4gICAgaWYgKGxlbmd0aCA8PSAxKSB0aHJvdyBuZXcgRXJyb3IoJ2JpbmRBbGwgbXVzdCBiZSBwYXNzZWQgZnVuY3Rpb24gbmFtZXMnKTtcbiAgICBmb3IgKGkgPSAxOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgIG9ialtrZXldID0gXy5iaW5kKG9ialtrZXldLCBvYmopO1xuICAgIH1cbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIE1lbW9pemUgYW4gZXhwZW5zaXZlIGZ1bmN0aW9uIGJ5IHN0b3JpbmcgaXRzIHJlc3VsdHMuXG4gIF8ubWVtb2l6ZSA9IGZ1bmN0aW9uKGZ1bmMsIGhhc2hlcikge1xuICAgIHZhciBtZW1vaXplID0gZnVuY3Rpb24oa2V5KSB7XG4gICAgICB2YXIgY2FjaGUgPSBtZW1vaXplLmNhY2hlO1xuICAgICAgdmFyIGFkZHJlc3MgPSAnJyArIChoYXNoZXIgPyBoYXNoZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKSA6IGtleSk7XG4gICAgICBpZiAoIV8uaGFzKGNhY2hlLCBhZGRyZXNzKSkgY2FjaGVbYWRkcmVzc10gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gY2FjaGVbYWRkcmVzc107XG4gICAgfTtcbiAgICBtZW1vaXplLmNhY2hlID0ge307XG4gICAgcmV0dXJuIG1lbW9pemU7XG4gIH07XG5cbiAgLy8gRGVsYXlzIGEgZnVuY3Rpb24gZm9yIHRoZSBnaXZlbiBudW1iZXIgb2YgbWlsbGlzZWNvbmRzLCBhbmQgdGhlbiBjYWxsc1xuICAvLyBpdCB3aXRoIHRoZSBhcmd1bWVudHMgc3VwcGxpZWQuXG4gIF8uZGVsYXkgPSBmdW5jdGlvbihmdW5jLCB3YWl0KSB7XG4gICAgdmFyIGFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMik7XG4gICAgcmV0dXJuIHNldFRpbWVvdXQoZnVuY3Rpb24oKXtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgIH0sIHdhaXQpO1xuICB9O1xuXG4gIC8vIERlZmVycyBhIGZ1bmN0aW9uLCBzY2hlZHVsaW5nIGl0IHRvIHJ1biBhZnRlciB0aGUgY3VycmVudCBjYWxsIHN0YWNrIGhhc1xuICAvLyBjbGVhcmVkLlxuICBfLmRlZmVyID0gXy5wYXJ0aWFsKF8uZGVsYXksIF8sIDEpO1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiwgdGhhdCwgd2hlbiBpbnZva2VkLCB3aWxsIG9ubHkgYmUgdHJpZ2dlcmVkIGF0IG1vc3Qgb25jZVxuICAvLyBkdXJpbmcgYSBnaXZlbiB3aW5kb3cgb2YgdGltZS4gTm9ybWFsbHksIHRoZSB0aHJvdHRsZWQgZnVuY3Rpb24gd2lsbCBydW5cbiAgLy8gYXMgbXVjaCBhcyBpdCBjYW4sIHdpdGhvdXQgZXZlciBnb2luZyBtb3JlIHRoYW4gb25jZSBwZXIgYHdhaXRgIGR1cmF0aW9uO1xuICAvLyBidXQgaWYgeW91J2QgbGlrZSB0byBkaXNhYmxlIHRoZSBleGVjdXRpb24gb24gdGhlIGxlYWRpbmcgZWRnZSwgcGFzc1xuICAvLyBge2xlYWRpbmc6IGZhbHNlfWAuIFRvIGRpc2FibGUgZXhlY3V0aW9uIG9uIHRoZSB0cmFpbGluZyBlZGdlLCBkaXR0by5cbiAgXy50aHJvdHRsZSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQsIG9wdGlvbnMpIHtcbiAgICB2YXIgY29udGV4dCwgYXJncywgcmVzdWx0O1xuICAgIHZhciB0aW1lb3V0ID0gbnVsbDtcbiAgICB2YXIgcHJldmlvdXMgPSAwO1xuICAgIGlmICghb3B0aW9ucykgb3B0aW9ucyA9IHt9O1xuICAgIHZhciBsYXRlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgcHJldmlvdXMgPSBvcHRpb25zLmxlYWRpbmcgPT09IGZhbHNlID8gMCA6IF8ubm93KCk7XG4gICAgICB0aW1lb3V0ID0gbnVsbDtcbiAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICB9O1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBub3cgPSBfLm5vdygpO1xuICAgICAgaWYgKCFwcmV2aW91cyAmJiBvcHRpb25zLmxlYWRpbmcgPT09IGZhbHNlKSBwcmV2aW91cyA9IG5vdztcbiAgICAgIHZhciByZW1haW5pbmcgPSB3YWl0IC0gKG5vdyAtIHByZXZpb3VzKTtcbiAgICAgIGNvbnRleHQgPSB0aGlzO1xuICAgICAgYXJncyA9IGFyZ3VtZW50cztcbiAgICAgIGlmIChyZW1haW5pbmcgPD0gMCB8fCByZW1haW5pbmcgPiB3YWl0KSB7XG4gICAgICAgIGlmICh0aW1lb3V0KSB7XG4gICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICB9XG4gICAgICAgIHByZXZpb3VzID0gbm93O1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH0gZWxzZSBpZiAoIXRpbWVvdXQgJiYgb3B0aW9ucy50cmFpbGluZyAhPT0gZmFsc2UpIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHJlbWFpbmluZyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCBhcyBsb25nIGFzIGl0IGNvbnRpbnVlcyB0byBiZSBpbnZva2VkLCB3aWxsIG5vdFxuICAvLyBiZSB0cmlnZ2VyZWQuIFRoZSBmdW5jdGlvbiB3aWxsIGJlIGNhbGxlZCBhZnRlciBpdCBzdG9wcyBiZWluZyBjYWxsZWQgZm9yXG4gIC8vIE4gbWlsbGlzZWNvbmRzLiBJZiBgaW1tZWRpYXRlYCBpcyBwYXNzZWQsIHRyaWdnZXIgdGhlIGZ1bmN0aW9uIG9uIHRoZVxuICAvLyBsZWFkaW5nIGVkZ2UsIGluc3RlYWQgb2YgdGhlIHRyYWlsaW5nLlxuICBfLmRlYm91bmNlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgaW1tZWRpYXRlKSB7XG4gICAgdmFyIHRpbWVvdXQsIGFyZ3MsIGNvbnRleHQsIHRpbWVzdGFtcCwgcmVzdWx0O1xuXG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbGFzdCA9IF8ubm93KCkgLSB0aW1lc3RhbXA7XG5cbiAgICAgIGlmIChsYXN0IDwgd2FpdCAmJiBsYXN0ID49IDApIHtcbiAgICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQobGF0ZXIsIHdhaXQgLSBsYXN0KTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgICBpZiAoIWltbWVkaWF0ZSkge1xuICAgICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgICAgaWYgKCF0aW1lb3V0KSBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9O1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgdGltZXN0YW1wID0gXy5ub3coKTtcbiAgICAgIHZhciBjYWxsTm93ID0gaW1tZWRpYXRlICYmICF0aW1lb3V0O1xuICAgICAgaWYgKCF0aW1lb3V0KSB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCk7XG4gICAgICBpZiAoY2FsbE5vdykge1xuICAgICAgICByZXN1bHQgPSBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgICAgICBjb250ZXh0ID0gYXJncyA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBmdW5jdGlvbiBwYXNzZWQgYXMgYW4gYXJndW1lbnQgdG8gdGhlIHNlY29uZCxcbiAgLy8gYWxsb3dpbmcgeW91IHRvIGFkanVzdCBhcmd1bWVudHMsIHJ1biBjb2RlIGJlZm9yZSBhbmQgYWZ0ZXIsIGFuZFxuICAvLyBjb25kaXRpb25hbGx5IGV4ZWN1dGUgdGhlIG9yaWdpbmFsIGZ1bmN0aW9uLlxuICBfLndyYXAgPSBmdW5jdGlvbihmdW5jLCB3cmFwcGVyKSB7XG4gICAgcmV0dXJuIF8ucGFydGlhbCh3cmFwcGVyLCBmdW5jKTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgbmVnYXRlZCB2ZXJzaW9uIG9mIHRoZSBwYXNzZWQtaW4gcHJlZGljYXRlLlxuICBfLm5lZ2F0ZSA9IGZ1bmN0aW9uKHByZWRpY2F0ZSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiAhcHJlZGljYXRlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCBpcyB0aGUgY29tcG9zaXRpb24gb2YgYSBsaXN0IG9mIGZ1bmN0aW9ucywgZWFjaFxuICAvLyBjb25zdW1pbmcgdGhlIHJldHVybiB2YWx1ZSBvZiB0aGUgZnVuY3Rpb24gdGhhdCBmb2xsb3dzLlxuICBfLmNvbXBvc2UgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgICB2YXIgc3RhcnQgPSBhcmdzLmxlbmd0aCAtIDE7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGkgPSBzdGFydDtcbiAgICAgIHZhciByZXN1bHQgPSBhcmdzW3N0YXJ0XS5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgd2hpbGUgKGktLSkgcmVzdWx0ID0gYXJnc1tpXS5jYWxsKHRoaXMsIHJlc3VsdCk7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIG9uIGFuZCBhZnRlciB0aGUgTnRoIGNhbGwuXG4gIF8uYWZ0ZXIgPSBmdW5jdGlvbih0aW1lcywgZnVuYykge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIGlmICgtLXRpbWVzIDwgMSkge1xuICAgICAgICByZXR1cm4gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgfVxuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBvbmx5IGJlIGV4ZWN1dGVkIHVwIHRvIChidXQgbm90IGluY2x1ZGluZykgdGhlIE50aCBjYWxsLlxuICBfLmJlZm9yZSA9IGZ1bmN0aW9uKHRpbWVzLCBmdW5jKSB7XG4gICAgdmFyIG1lbW87XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKC0tdGltZXMgPiAwKSB7XG4gICAgICAgIG1lbW8gPSBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgICBpZiAodGltZXMgPD0gMSkgZnVuYyA9IG51bGw7XG4gICAgICByZXR1cm4gbWVtbztcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgZXhlY3V0ZWQgYXQgbW9zdCBvbmUgdGltZSwgbm8gbWF0dGVyIGhvd1xuICAvLyBvZnRlbiB5b3UgY2FsbCBpdC4gVXNlZnVsIGZvciBsYXp5IGluaXRpYWxpemF0aW9uLlxuICBfLm9uY2UgPSBfLnBhcnRpYWwoXy5iZWZvcmUsIDIpO1xuXG4gIC8vIE9iamVjdCBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEtleXMgaW4gSUUgPCA5IHRoYXQgd29uJ3QgYmUgaXRlcmF0ZWQgYnkgYGZvciBrZXkgaW4gLi4uYCBhbmQgdGh1cyBtaXNzZWQuXG4gIHZhciBoYXNFbnVtQnVnID0gIXt0b1N0cmluZzogbnVsbH0ucHJvcGVydHlJc0VudW1lcmFibGUoJ3RvU3RyaW5nJyk7XG4gIHZhciBub25FbnVtZXJhYmxlUHJvcHMgPSBbJ3ZhbHVlT2YnLCAnaXNQcm90b3R5cGVPZicsICd0b1N0cmluZycsXG4gICAgICAgICAgICAgICAgICAgICAgJ3Byb3BlcnR5SXNFbnVtZXJhYmxlJywgJ2hhc093blByb3BlcnR5JywgJ3RvTG9jYWxlU3RyaW5nJ107XG5cbiAgZnVuY3Rpb24gY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpIHtcbiAgICB2YXIgbm9uRW51bUlkeCA9IG5vbkVudW1lcmFibGVQcm9wcy5sZW5ndGg7XG4gICAgdmFyIGNvbnN0cnVjdG9yID0gb2JqLmNvbnN0cnVjdG9yO1xuICAgIHZhciBwcm90byA9IChfLmlzRnVuY3Rpb24oY29uc3RydWN0b3IpICYmIGNvbnN0cnVjdG9yLnByb3RvdHlwZSkgfHwgT2JqUHJvdG87XG5cbiAgICAvLyBDb25zdHJ1Y3RvciBpcyBhIHNwZWNpYWwgY2FzZS5cbiAgICB2YXIgcHJvcCA9ICdjb25zdHJ1Y3Rvcic7XG4gICAgaWYgKF8uaGFzKG9iaiwgcHJvcCkgJiYgIV8uY29udGFpbnMoa2V5cywgcHJvcCkpIGtleXMucHVzaChwcm9wKTtcblxuICAgIHdoaWxlIChub25FbnVtSWR4LS0pIHtcbiAgICAgIHByb3AgPSBub25FbnVtZXJhYmxlUHJvcHNbbm9uRW51bUlkeF07XG4gICAgICBpZiAocHJvcCBpbiBvYmogJiYgb2JqW3Byb3BdICE9PSBwcm90b1twcm9wXSAmJiAhXy5jb250YWlucyhrZXlzLCBwcm9wKSkge1xuICAgICAgICBrZXlzLnB1c2gocHJvcCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0cmlldmUgdGhlIG5hbWVzIG9mIGFuIG9iamVjdCdzIG93biBwcm9wZXJ0aWVzLlxuICAvLyBEZWxlZ2F0ZXMgdG8gKipFQ01BU2NyaXB0IDUqKidzIG5hdGl2ZSBgT2JqZWN0LmtleXNgXG4gIF8ua2V5cyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmICghXy5pc09iamVjdChvYmopKSByZXR1cm4gW107XG4gICAgaWYgKG5hdGl2ZUtleXMpIHJldHVybiBuYXRpdmVLZXlzKG9iaik7XG4gICAgdmFyIGtleXMgPSBbXTtcbiAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSBpZiAoXy5oYXMob2JqLCBrZXkpKSBrZXlzLnB1c2goa2V5KTtcbiAgICAvLyBBaGVtLCBJRSA8IDkuXG4gICAgaWYgKGhhc0VudW1CdWcpIGNvbGxlY3ROb25FbnVtUHJvcHMob2JqLCBrZXlzKTtcbiAgICByZXR1cm4ga2V5cztcbiAgfTtcblxuICAvLyBSZXRyaWV2ZSBhbGwgdGhlIHByb3BlcnR5IG5hbWVzIG9mIGFuIG9iamVjdC5cbiAgXy5hbGxLZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBbXTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGtleXMucHVzaChrZXkpO1xuICAgIC8vIEFoZW0sIElFIDwgOS5cbiAgICBpZiAoaGFzRW51bUJ1ZykgY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpO1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIHRoZSB2YWx1ZXMgb2YgYW4gb2JqZWN0J3MgcHJvcGVydGllcy5cbiAgXy52YWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB2YXIgdmFsdWVzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YWx1ZXNbaV0gPSBvYmpba2V5c1tpXV07XG4gICAgfVxuICAgIHJldHVybiB2YWx1ZXM7XG4gIH07XG5cbiAgLy8gUmV0dXJucyB0aGUgcmVzdWx0cyBvZiBhcHBseWluZyB0aGUgaXRlcmF0ZWUgdG8gZWFjaCBlbGVtZW50IG9mIHRoZSBvYmplY3RcbiAgLy8gSW4gY29udHJhc3QgdG8gXy5tYXAgaXQgcmV0dXJucyBhbiBvYmplY3RcbiAgXy5tYXBPYmplY3QgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgdmFyIGtleXMgPSAgXy5rZXlzKG9iaiksXG4gICAgICAgICAgbGVuZ3RoID0ga2V5cy5sZW5ndGgsXG4gICAgICAgICAgcmVzdWx0cyA9IHt9LFxuICAgICAgICAgIGN1cnJlbnRLZXk7XG4gICAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICAgIGN1cnJlbnRLZXkgPSBrZXlzW2luZGV4XTtcbiAgICAgICAgcmVzdWx0c1tjdXJyZW50S2V5XSA9IGl0ZXJhdGVlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENvbnZlcnQgYW4gb2JqZWN0IGludG8gYSBsaXN0IG9mIGBba2V5LCB2YWx1ZV1gIHBhaXJzLlxuICBfLnBhaXJzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMob2JqKTtcbiAgICB2YXIgbGVuZ3RoID0ga2V5cy5sZW5ndGg7XG4gICAgdmFyIHBhaXJzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBwYWlyc1tpXSA9IFtrZXlzW2ldLCBvYmpba2V5c1tpXV1dO1xuICAgIH1cbiAgICByZXR1cm4gcGFpcnM7XG4gIH07XG5cbiAgLy8gSW52ZXJ0IHRoZSBrZXlzIGFuZCB2YWx1ZXMgb2YgYW4gb2JqZWN0LiBUaGUgdmFsdWVzIG11c3QgYmUgc2VyaWFsaXphYmxlLlxuICBfLmludmVydCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICByZXN1bHRbb2JqW2tleXNbaV1dXSA9IGtleXNbaV07XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgc29ydGVkIGxpc3Qgb2YgdGhlIGZ1bmN0aW9uIG5hbWVzIGF2YWlsYWJsZSBvbiB0aGUgb2JqZWN0LlxuICAvLyBBbGlhc2VkIGFzIGBtZXRob2RzYFxuICBfLmZ1bmN0aW9ucyA9IF8ubWV0aG9kcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBuYW1lcyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICAgIGlmIChfLmlzRnVuY3Rpb24ob2JqW2tleV0pKSBuYW1lcy5wdXNoKGtleSk7XG4gICAgfVxuICAgIHJldHVybiBuYW1lcy5zb3J0KCk7XG4gIH07XG5cbiAgLy8gRXh0ZW5kIGEgZ2l2ZW4gb2JqZWN0IHdpdGggYWxsIHRoZSBwcm9wZXJ0aWVzIGluIHBhc3NlZC1pbiBvYmplY3QocykuXG4gIF8uZXh0ZW5kID0gY3JlYXRlQXNzaWduZXIoXy5hbGxLZXlzKTtcblxuICAvLyBBc3NpZ25zIGEgZ2l2ZW4gb2JqZWN0IHdpdGggYWxsIHRoZSBvd24gcHJvcGVydGllcyBpbiB0aGUgcGFzc2VkLWluIG9iamVjdChzKVxuICAvLyAoaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZG9jcy9XZWIvSmF2YVNjcmlwdC9SZWZlcmVuY2UvR2xvYmFsX09iamVjdHMvT2JqZWN0L2Fzc2lnbilcbiAgXy5leHRlbmRPd24gPSBfLmFzc2lnbiA9IGNyZWF0ZUFzc2lnbmVyKF8ua2V5cyk7XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3Qga2V5IG9uIGFuIG9iamVjdCB0aGF0IHBhc3NlcyBhIHByZWRpY2F0ZSB0ZXN0XG4gIF8uZmluZEtleSA9IGZ1bmN0aW9uKG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KSB7XG4gICAgcHJlZGljYXRlID0gY2IocHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopLCBrZXk7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGtleSA9IGtleXNbaV07XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtrZXldLCBrZXksIG9iaikpIHJldHVybiBrZXk7XG4gICAgfVxuICB9O1xuXG4gIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCBvbmx5IGNvbnRhaW5pbmcgdGhlIHdoaXRlbGlzdGVkIHByb3BlcnRpZXMuXG4gIF8ucGljayA9IGZ1bmN0aW9uKG9iamVjdCwgb2l0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9LCBvYmogPSBvYmplY3QsIGl0ZXJhdGVlLCBrZXlzO1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHJlc3VsdDtcbiAgICBpZiAoXy5pc0Z1bmN0aW9uKG9pdGVyYXRlZSkpIHtcbiAgICAgIGtleXMgPSBfLmFsbEtleXMob2JqKTtcbiAgICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihvaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrZXlzID0gZmxhdHRlbihhcmd1bWVudHMsIGZhbHNlLCBmYWxzZSwgMSk7XG4gICAgICBpdGVyYXRlZSA9IGZ1bmN0aW9uKHZhbHVlLCBrZXksIG9iaikgeyByZXR1cm4ga2V5IGluIG9iajsgfTtcbiAgICAgIG9iaiA9IE9iamVjdChvYmopO1xuICAgIH1cbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICB2YXIgdmFsdWUgPSBvYmpba2V5XTtcbiAgICAgIGlmIChpdGVyYXRlZSh2YWx1ZSwga2V5LCBvYmopKSByZXN1bHRba2V5XSA9IHZhbHVlO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gICAvLyBSZXR1cm4gYSBjb3B5IG9mIHRoZSBvYmplY3Qgd2l0aG91dCB0aGUgYmxhY2tsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5vbWl0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGlmIChfLmlzRnVuY3Rpb24oaXRlcmF0ZWUpKSB7XG4gICAgICBpdGVyYXRlZSA9IF8ubmVnYXRlKGl0ZXJhdGVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIGtleXMgPSBfLm1hcChmbGF0dGVuKGFyZ3VtZW50cywgZmFsc2UsIGZhbHNlLCAxKSwgU3RyaW5nKTtcbiAgICAgIGl0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgICAgICByZXR1cm4gIV8uY29udGFpbnMoa2V5cywga2V5KTtcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBfLnBpY2sob2JqLCBpdGVyYXRlZSwgY29udGV4dCk7XG4gIH07XG5cbiAgLy8gRmlsbCBpbiBhIGdpdmVuIG9iamVjdCB3aXRoIGRlZmF1bHQgcHJvcGVydGllcy5cbiAgXy5kZWZhdWx0cyA9IGNyZWF0ZUFzc2lnbmVyKF8uYWxsS2V5cywgdHJ1ZSk7XG5cbiAgLy8gQ3JlYXRlcyBhbiBvYmplY3QgdGhhdCBpbmhlcml0cyBmcm9tIHRoZSBnaXZlbiBwcm90b3R5cGUgb2JqZWN0LlxuICAvLyBJZiBhZGRpdGlvbmFsIHByb3BlcnRpZXMgYXJlIHByb3ZpZGVkIHRoZW4gdGhleSB3aWxsIGJlIGFkZGVkIHRvIHRoZVxuICAvLyBjcmVhdGVkIG9iamVjdC5cbiAgXy5jcmVhdGUgPSBmdW5jdGlvbihwcm90b3R5cGUsIHByb3BzKSB7XG4gICAgdmFyIHJlc3VsdCA9IGJhc2VDcmVhdGUocHJvdG90eXBlKTtcbiAgICBpZiAocHJvcHMpIF8uZXh0ZW5kT3duKHJlc3VsdCwgcHJvcHMpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gQ3JlYXRlIGEgKHNoYWxsb3ctY2xvbmVkKSBkdXBsaWNhdGUgb2YgYW4gb2JqZWN0LlxuICBfLmNsb25lID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBvYmo7XG4gICAgcmV0dXJuIF8uaXNBcnJheShvYmopID8gb2JqLnNsaWNlKCkgOiBfLmV4dGVuZCh7fSwgb2JqKTtcbiAgfTtcblxuICAvLyBJbnZva2VzIGludGVyY2VwdG9yIHdpdGggdGhlIG9iaiwgYW5kIHRoZW4gcmV0dXJucyBvYmouXG4gIC8vIFRoZSBwcmltYXJ5IHB1cnBvc2Ugb2YgdGhpcyBtZXRob2QgaXMgdG8gXCJ0YXAgaW50b1wiIGEgbWV0aG9kIGNoYWluLCBpblxuICAvLyBvcmRlciB0byBwZXJmb3JtIG9wZXJhdGlvbnMgb24gaW50ZXJtZWRpYXRlIHJlc3VsdHMgd2l0aGluIHRoZSBjaGFpbi5cbiAgXy50YXAgPSBmdW5jdGlvbihvYmosIGludGVyY2VwdG9yKSB7XG4gICAgaW50ZXJjZXB0b3Iob2JqKTtcbiAgICByZXR1cm4gb2JqO1xuICB9O1xuXG4gIC8vIFJldHVybnMgd2hldGhlciBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gc2V0IG9mIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmlzTWF0Y2ggPSBmdW5jdGlvbihvYmplY3QsIGF0dHJzKSB7XG4gICAgdmFyIGtleXMgPSBfLmtleXMoYXR0cnMpLCBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICBpZiAob2JqZWN0ID09IG51bGwpIHJldHVybiAhbGVuZ3RoO1xuICAgIHZhciBvYmogPSBPYmplY3Qob2JqZWN0KTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIGlmIChhdHRyc1trZXldICE9PSBvYmpba2V5XSB8fCAhKGtleSBpbiBvYmopKSByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9O1xuXG5cbiAgLy8gSW50ZXJuYWwgcmVjdXJzaXZlIGNvbXBhcmlzb24gZnVuY3Rpb24gZm9yIGBpc0VxdWFsYC5cbiAgdmFyIGVxID0gZnVuY3Rpb24oYSwgYiwgYVN0YWNrLCBiU3RhY2spIHtcbiAgICAvLyBJZGVudGljYWwgb2JqZWN0cyBhcmUgZXF1YWwuIGAwID09PSAtMGAsIGJ1dCB0aGV5IGFyZW4ndCBpZGVudGljYWwuXG4gICAgLy8gU2VlIHRoZSBbSGFybW9ueSBgZWdhbGAgcHJvcG9zYWxdKGh0dHA6Ly93aWtpLmVjbWFzY3JpcHQub3JnL2Rva3UucGhwP2lkPWhhcm1vbnk6ZWdhbCkuXG4gICAgaWYgKGEgPT09IGIpIHJldHVybiBhICE9PSAwIHx8IDEgLyBhID09PSAxIC8gYjtcbiAgICAvLyBBIHN0cmljdCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeSBiZWNhdXNlIGBudWxsID09IHVuZGVmaW5lZGAuXG4gICAgaWYgKGEgPT0gbnVsbCB8fCBiID09IG51bGwpIHJldHVybiBhID09PSBiO1xuICAgIC8vIFVud3JhcCBhbnkgd3JhcHBlZCBvYmplY3RzLlxuICAgIGlmIChhIGluc3RhbmNlb2YgXykgYSA9IGEuX3dyYXBwZWQ7XG4gICAgaWYgKGIgaW5zdGFuY2VvZiBfKSBiID0gYi5fd3JhcHBlZDtcbiAgICAvLyBDb21wYXJlIGBbW0NsYXNzXV1gIG5hbWVzLlxuICAgIHZhciBjbGFzc05hbWUgPSB0b1N0cmluZy5jYWxsKGEpO1xuICAgIGlmIChjbGFzc05hbWUgIT09IHRvU3RyaW5nLmNhbGwoYikpIHJldHVybiBmYWxzZTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgLy8gU3RyaW5ncywgbnVtYmVycywgcmVndWxhciBleHByZXNzaW9ucywgZGF0ZXMsIGFuZCBib29sZWFucyBhcmUgY29tcGFyZWQgYnkgdmFsdWUuXG4gICAgICBjYXNlICdbb2JqZWN0IFJlZ0V4cF0nOlxuICAgICAgLy8gUmVnRXhwcyBhcmUgY29lcmNlZCB0byBzdHJpbmdzIGZvciBjb21wYXJpc29uIChOb3RlOiAnJyArIC9hL2kgPT09ICcvYS9pJylcbiAgICAgIGNhc2UgJ1tvYmplY3QgU3RyaW5nXSc6XG4gICAgICAgIC8vIFByaW1pdGl2ZXMgYW5kIHRoZWlyIGNvcnJlc3BvbmRpbmcgb2JqZWN0IHdyYXBwZXJzIGFyZSBlcXVpdmFsZW50OyB0aHVzLCBgXCI1XCJgIGlzXG4gICAgICAgIC8vIGVxdWl2YWxlbnQgdG8gYG5ldyBTdHJpbmcoXCI1XCIpYC5cbiAgICAgICAgcmV0dXJuICcnICsgYSA9PT0gJycgKyBiO1xuICAgICAgY2FzZSAnW29iamVjdCBOdW1iZXJdJzpcbiAgICAgICAgLy8gYE5hTmBzIGFyZSBlcXVpdmFsZW50LCBidXQgbm9uLXJlZmxleGl2ZS5cbiAgICAgICAgLy8gT2JqZWN0KE5hTikgaXMgZXF1aXZhbGVudCB0byBOYU5cbiAgICAgICAgaWYgKCthICE9PSArYSkgcmV0dXJuICtiICE9PSArYjtcbiAgICAgICAgLy8gQW4gYGVnYWxgIGNvbXBhcmlzb24gaXMgcGVyZm9ybWVkIGZvciBvdGhlciBudW1lcmljIHZhbHVlcy5cbiAgICAgICAgcmV0dXJuICthID09PSAwID8gMSAvICthID09PSAxIC8gYiA6ICthID09PSArYjtcbiAgICAgIGNhc2UgJ1tvYmplY3QgRGF0ZV0nOlxuICAgICAgY2FzZSAnW29iamVjdCBCb29sZWFuXSc6XG4gICAgICAgIC8vIENvZXJjZSBkYXRlcyBhbmQgYm9vbGVhbnMgdG8gbnVtZXJpYyBwcmltaXRpdmUgdmFsdWVzLiBEYXRlcyBhcmUgY29tcGFyZWQgYnkgdGhlaXJcbiAgICAgICAgLy8gbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zLiBOb3RlIHRoYXQgaW52YWxpZCBkYXRlcyB3aXRoIG1pbGxpc2Vjb25kIHJlcHJlc2VudGF0aW9uc1xuICAgICAgICAvLyBvZiBgTmFOYCBhcmUgbm90IGVxdWl2YWxlbnQuXG4gICAgICAgIHJldHVybiArYSA9PT0gK2I7XG4gICAgfVxuXG4gICAgdmFyIGFyZUFycmF5cyA9IGNsYXNzTmFtZSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbiAgICBpZiAoIWFyZUFycmF5cykge1xuICAgICAgaWYgKHR5cGVvZiBhICE9ICdvYmplY3QnIHx8IHR5cGVvZiBiICE9ICdvYmplY3QnKSByZXR1cm4gZmFsc2U7XG5cbiAgICAgIC8vIE9iamVjdHMgd2l0aCBkaWZmZXJlbnQgY29uc3RydWN0b3JzIGFyZSBub3QgZXF1aXZhbGVudCwgYnV0IGBPYmplY3RgcyBvciBgQXJyYXlgc1xuICAgICAgLy8gZnJvbSBkaWZmZXJlbnQgZnJhbWVzIGFyZS5cbiAgICAgIHZhciBhQ3RvciA9IGEuY29uc3RydWN0b3IsIGJDdG9yID0gYi5jb25zdHJ1Y3RvcjtcbiAgICAgIGlmIChhQ3RvciAhPT0gYkN0b3IgJiYgIShfLmlzRnVuY3Rpb24oYUN0b3IpICYmIGFDdG9yIGluc3RhbmNlb2YgYUN0b3IgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBfLmlzRnVuY3Rpb24oYkN0b3IpICYmIGJDdG9yIGluc3RhbmNlb2YgYkN0b3IpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICYmICgnY29uc3RydWN0b3InIGluIGEgJiYgJ2NvbnN0cnVjdG9yJyBpbiBiKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIEFzc3VtZSBlcXVhbGl0eSBmb3IgY3ljbGljIHN0cnVjdHVyZXMuIFRoZSBhbGdvcml0aG0gZm9yIGRldGVjdGluZyBjeWNsaWNcbiAgICAvLyBzdHJ1Y3R1cmVzIGlzIGFkYXB0ZWQgZnJvbSBFUyA1LjEgc2VjdGlvbiAxNS4xMi4zLCBhYnN0cmFjdCBvcGVyYXRpb24gYEpPYC5cblxuICAgIC8vIEluaXRpYWxpemluZyBzdGFjayBvZiB0cmF2ZXJzZWQgb2JqZWN0cy5cbiAgICAvLyBJdCdzIGRvbmUgaGVyZSBzaW5jZSB3ZSBvbmx5IG5lZWQgdGhlbSBmb3Igb2JqZWN0cyBhbmQgYXJyYXlzIGNvbXBhcmlzb24uXG4gICAgYVN0YWNrID0gYVN0YWNrIHx8IFtdO1xuICAgIGJTdGFjayA9IGJTdGFjayB8fCBbXTtcbiAgICB2YXIgbGVuZ3RoID0gYVN0YWNrLmxlbmd0aDtcbiAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgIC8vIExpbmVhciBzZWFyY2guIFBlcmZvcm1hbmNlIGlzIGludmVyc2VseSBwcm9wb3J0aW9uYWwgdG8gdGhlIG51bWJlciBvZlxuICAgICAgLy8gdW5pcXVlIG5lc3RlZCBzdHJ1Y3R1cmVzLlxuICAgICAgaWYgKGFTdGFja1tsZW5ndGhdID09PSBhKSByZXR1cm4gYlN0YWNrW2xlbmd0aF0gPT09IGI7XG4gICAgfVxuXG4gICAgLy8gQWRkIHRoZSBmaXJzdCBvYmplY3QgdG8gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIGFTdGFjay5wdXNoKGEpO1xuICAgIGJTdGFjay5wdXNoKGIpO1xuXG4gICAgLy8gUmVjdXJzaXZlbHkgY29tcGFyZSBvYmplY3RzIGFuZCBhcnJheXMuXG4gICAgaWYgKGFyZUFycmF5cykge1xuICAgICAgLy8gQ29tcGFyZSBhcnJheSBsZW5ndGhzIHRvIGRldGVybWluZSBpZiBhIGRlZXAgY29tcGFyaXNvbiBpcyBuZWNlc3NhcnkuXG4gICAgICBsZW5ndGggPSBhLmxlbmd0aDtcbiAgICAgIGlmIChsZW5ndGggIT09IGIubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG4gICAgICAvLyBEZWVwIGNvbXBhcmUgdGhlIGNvbnRlbnRzLCBpZ25vcmluZyBub24tbnVtZXJpYyBwcm9wZXJ0aWVzLlxuICAgICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAgIGlmICghZXEoYVtsZW5ndGhdLCBiW2xlbmd0aF0sIGFTdGFjaywgYlN0YWNrKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyBEZWVwIGNvbXBhcmUgb2JqZWN0cy5cbiAgICAgIHZhciBrZXlzID0gXy5rZXlzKGEpLCBrZXk7XG4gICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICAgIC8vIEVuc3VyZSB0aGF0IGJvdGggb2JqZWN0cyBjb250YWluIHRoZSBzYW1lIG51bWJlciBvZiBwcm9wZXJ0aWVzIGJlZm9yZSBjb21wYXJpbmcgZGVlcCBlcXVhbGl0eS5cbiAgICAgIGlmIChfLmtleXMoYikubGVuZ3RoICE9PSBsZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgICAvLyBEZWVwIGNvbXBhcmUgZWFjaCBtZW1iZXJcbiAgICAgICAga2V5ID0ga2V5c1tsZW5ndGhdO1xuICAgICAgICBpZiAoIShfLmhhcyhiLCBrZXkpICYmIGVxKGFba2V5XSwgYltrZXldLCBhU3RhY2ssIGJTdGFjaykpKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIC8vIFJlbW92ZSB0aGUgZmlyc3Qgb2JqZWN0IGZyb20gdGhlIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIGFTdGFjay5wb3AoKTtcbiAgICBiU3RhY2sucG9wKCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gUGVyZm9ybSBhIGRlZXAgY29tcGFyaXNvbiB0byBjaGVjayBpZiB0d28gb2JqZWN0cyBhcmUgZXF1YWwuXG4gIF8uaXNFcXVhbCA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICByZXR1cm4gZXEoYSwgYik7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiBhcnJheSwgc3RyaW5nLCBvciBvYmplY3QgZW1wdHk/XG4gIC8vIEFuIFwiZW1wdHlcIiBvYmplY3QgaGFzIG5vIGVudW1lcmFibGUgb3duLXByb3BlcnRpZXMuXG4gIF8uaXNFbXB0eSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIGlmIChvYmogPT0gbnVsbCkgcmV0dXJuIHRydWU7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikgJiYgKF8uaXNBcnJheShvYmopIHx8IF8uaXNTdHJpbmcob2JqKSB8fCBfLmlzQXJndW1lbnRzKG9iaikpKSByZXR1cm4gb2JqLmxlbmd0aCA9PT0gMDtcbiAgICByZXR1cm4gXy5rZXlzKG9iaikubGVuZ3RoID09PSAwO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBET00gZWxlbWVudD9cbiAgXy5pc0VsZW1lbnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gISEob2JqICYmIG9iai5ub2RlVHlwZSA9PT0gMSk7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhbiBhcnJheT9cbiAgLy8gRGVsZWdhdGVzIHRvIEVDTUE1J3MgbmF0aXZlIEFycmF5LmlzQXJyYXlcbiAgXy5pc0FycmF5ID0gbmF0aXZlSXNBcnJheSB8fCBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gdG9TdHJpbmcuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgYW4gb2JqZWN0P1xuICBfLmlzT2JqZWN0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHR5cGUgPSB0eXBlb2Ygb2JqO1xuICAgIHJldHVybiB0eXBlID09PSAnZnVuY3Rpb24nIHx8IHR5cGUgPT09ICdvYmplY3QnICYmICEhb2JqO1xuICB9O1xuXG4gIC8vIEFkZCBzb21lIGlzVHlwZSBtZXRob2RzOiBpc0FyZ3VtZW50cywgaXNGdW5jdGlvbiwgaXNTdHJpbmcsIGlzTnVtYmVyLCBpc0RhdGUsIGlzUmVnRXhwLCBpc0Vycm9yLlxuICBfLmVhY2goWydBcmd1bWVudHMnLCAnRnVuY3Rpb24nLCAnU3RyaW5nJywgJ051bWJlcicsICdEYXRlJywgJ1JlZ0V4cCcsICdFcnJvciddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgX1snaXMnICsgbmFtZV0gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0ICcgKyBuYW1lICsgJ10nO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIERlZmluZSBhIGZhbGxiYWNrIHZlcnNpb24gb2YgdGhlIG1ldGhvZCBpbiBicm93c2VycyAoYWhlbSwgSUUgPCA5KSwgd2hlcmVcbiAgLy8gdGhlcmUgaXNuJ3QgYW55IGluc3BlY3RhYmxlIFwiQXJndW1lbnRzXCIgdHlwZS5cbiAgaWYgKCFfLmlzQXJndW1lbnRzKGFyZ3VtZW50cykpIHtcbiAgICBfLmlzQXJndW1lbnRzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gXy5oYXMob2JqLCAnY2FsbGVlJyk7XG4gICAgfTtcbiAgfVxuXG4gIC8vIE9wdGltaXplIGBpc0Z1bmN0aW9uYCBpZiBhcHByb3ByaWF0ZS4gV29yayBhcm91bmQgc29tZSB0eXBlb2YgYnVncyBpbiBvbGQgdjgsXG4gIC8vIElFIDExICgjMTYyMSksIGFuZCBpbiBTYWZhcmkgOCAoIzE5MjkpLlxuICBpZiAodHlwZW9mIC8uLyAhPSAnZnVuY3Rpb24nICYmIHR5cGVvZiBJbnQ4QXJyYXkgIT0gJ29iamVjdCcpIHtcbiAgICBfLmlzRnVuY3Rpb24gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiB0eXBlb2Ygb2JqID09ICdmdW5jdGlvbicgfHwgZmFsc2U7XG4gICAgfTtcbiAgfVxuXG4gIC8vIElzIGEgZ2l2ZW4gb2JqZWN0IGEgZmluaXRlIG51bWJlcj9cbiAgXy5pc0Zpbml0ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBpc0Zpbml0ZShvYmopICYmICFpc05hTihwYXJzZUZsb2F0KG9iaikpO1xuICB9O1xuXG4gIC8vIElzIHRoZSBnaXZlbiB2YWx1ZSBgTmFOYD8gKE5hTiBpcyB0aGUgb25seSBudW1iZXIgd2hpY2ggZG9lcyBub3QgZXF1YWwgaXRzZWxmKS5cbiAgXy5pc05hTiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBfLmlzTnVtYmVyKG9iaikgJiYgb2JqICE9PSArb2JqO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgYSBib29sZWFuP1xuICBfLmlzQm9vbGVhbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHRydWUgfHwgb2JqID09PSBmYWxzZSB8fCB0b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEJvb2xlYW5dJztcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGVxdWFsIHRvIG51bGw/XG4gIF8uaXNOdWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gbnVsbDtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhcmlhYmxlIHVuZGVmaW5lZD9cbiAgXy5pc1VuZGVmaW5lZCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT09IHZvaWQgMDtcbiAgfTtcblxuICAvLyBTaG9ydGN1dCBmdW5jdGlvbiBmb3IgY2hlY2tpbmcgaWYgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHByb3BlcnR5IGRpcmVjdGx5XG4gIC8vIG9uIGl0c2VsZiAoaW4gb3RoZXIgd29yZHMsIG5vdCBvbiBhIHByb3RvdHlwZSkuXG4gIF8uaGFzID0gZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICByZXR1cm4gb2JqICE9IG51bGwgJiYgaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSk7XG4gIH07XG5cbiAgLy8gVXRpbGl0eSBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBSdW4gVW5kZXJzY29yZS5qcyBpbiAqbm9Db25mbGljdCogbW9kZSwgcmV0dXJuaW5nIHRoZSBgX2AgdmFyaWFibGUgdG8gaXRzXG4gIC8vIHByZXZpb3VzIG93bmVyLiBSZXR1cm5zIGEgcmVmZXJlbmNlIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5ub0NvbmZsaWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgcm9vdC5fID0gcHJldmlvdXNVbmRlcnNjb3JlO1xuICAgIHJldHVybiB0aGlzO1xuICB9O1xuXG4gIC8vIEtlZXAgdGhlIGlkZW50aXR5IGZ1bmN0aW9uIGFyb3VuZCBmb3IgZGVmYXVsdCBpdGVyYXRlZXMuXG4gIF8uaWRlbnRpdHkgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfTtcblxuICAvLyBQcmVkaWNhdGUtZ2VuZXJhdGluZyBmdW5jdGlvbnMuIE9mdGVuIHVzZWZ1bCBvdXRzaWRlIG9mIFVuZGVyc2NvcmUuXG4gIF8uY29uc3RhbnQgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9O1xuICB9O1xuXG4gIF8ubm9vcCA9IGZ1bmN0aW9uKCl7fTtcblxuICBfLnByb3BlcnR5ID0gcHJvcGVydHk7XG5cbiAgLy8gR2VuZXJhdGVzIGEgZnVuY3Rpb24gZm9yIGEgZ2l2ZW4gb2JqZWN0IHRoYXQgcmV0dXJucyBhIGdpdmVuIHByb3BlcnR5LlxuICBfLnByb3BlcnR5T2YgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09IG51bGwgPyBmdW5jdGlvbigpe30gOiBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBvYmpba2V5XTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBwcmVkaWNhdGUgZm9yIGNoZWNraW5nIHdoZXRoZXIgYW4gb2JqZWN0IGhhcyBhIGdpdmVuIHNldCBvZlxuICAvLyBga2V5OnZhbHVlYCBwYWlycy5cbiAgXy5tYXRjaGVyID0gXy5tYXRjaGVzID0gZnVuY3Rpb24oYXR0cnMpIHtcbiAgICBhdHRycyA9IF8uZXh0ZW5kT3duKHt9LCBhdHRycyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIF8uaXNNYXRjaChvYmosIGF0dHJzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJ1biBhIGZ1bmN0aW9uICoqbioqIHRpbWVzLlxuICBfLnRpbWVzID0gZnVuY3Rpb24obiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgYWNjdW0gPSBBcnJheShNYXRoLm1heCgwLCBuKSk7XG4gICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0LCAxKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IG47IGkrKykgYWNjdW1baV0gPSBpdGVyYXRlZShpKTtcbiAgICByZXR1cm4gYWNjdW07XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgcmFuZG9tIGludGVnZXIgYmV0d2VlbiBtaW4gYW5kIG1heCAoaW5jbHVzaXZlKS5cbiAgXy5yYW5kb20gPSBmdW5jdGlvbihtaW4sIG1heCkge1xuICAgIGlmIChtYXggPT0gbnVsbCkge1xuICAgICAgbWF4ID0gbWluO1xuICAgICAgbWluID0gMDtcbiAgICB9XG4gICAgcmV0dXJuIG1pbiArIE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIChtYXggLSBtaW4gKyAxKSk7XG4gIH07XG5cbiAgLy8gQSAocG9zc2libHkgZmFzdGVyKSB3YXkgdG8gZ2V0IHRoZSBjdXJyZW50IHRpbWVzdGFtcCBhcyBhbiBpbnRlZ2VyLlxuICBfLm5vdyA9IERhdGUubm93IHx8IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgfTtcblxuICAgLy8gTGlzdCBvZiBIVE1MIGVudGl0aWVzIGZvciBlc2NhcGluZy5cbiAgdmFyIGVzY2FwZU1hcCA9IHtcbiAgICAnJic6ICcmYW1wOycsXG4gICAgJzwnOiAnJmx0OycsXG4gICAgJz4nOiAnJmd0OycsXG4gICAgJ1wiJzogJyZxdW90OycsXG4gICAgXCInXCI6ICcmI3gyNzsnLFxuICAgICdgJzogJyYjeDYwOydcbiAgfTtcbiAgdmFyIHVuZXNjYXBlTWFwID0gXy5pbnZlcnQoZXNjYXBlTWFwKTtcblxuICAvLyBGdW5jdGlvbnMgZm9yIGVzY2FwaW5nIGFuZCB1bmVzY2FwaW5nIHN0cmluZ3MgdG8vZnJvbSBIVE1MIGludGVycG9sYXRpb24uXG4gIHZhciBjcmVhdGVFc2NhcGVyID0gZnVuY3Rpb24obWFwKSB7XG4gICAgdmFyIGVzY2FwZXIgPSBmdW5jdGlvbihtYXRjaCkge1xuICAgICAgcmV0dXJuIG1hcFttYXRjaF07XG4gICAgfTtcbiAgICAvLyBSZWdleGVzIGZvciBpZGVudGlmeWluZyBhIGtleSB0aGF0IG5lZWRzIHRvIGJlIGVzY2FwZWRcbiAgICB2YXIgc291cmNlID0gJyg/OicgKyBfLmtleXMobWFwKS5qb2luKCd8JykgKyAnKSc7XG4gICAgdmFyIHRlc3RSZWdleHAgPSBSZWdFeHAoc291cmNlKTtcbiAgICB2YXIgcmVwbGFjZVJlZ2V4cCA9IFJlZ0V4cChzb3VyY2UsICdnJyk7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKHN0cmluZykge1xuICAgICAgc3RyaW5nID0gc3RyaW5nID09IG51bGwgPyAnJyA6ICcnICsgc3RyaW5nO1xuICAgICAgcmV0dXJuIHRlc3RSZWdleHAudGVzdChzdHJpbmcpID8gc3RyaW5nLnJlcGxhY2UocmVwbGFjZVJlZ2V4cCwgZXNjYXBlcikgOiBzdHJpbmc7XG4gICAgfTtcbiAgfTtcbiAgXy5lc2NhcGUgPSBjcmVhdGVFc2NhcGVyKGVzY2FwZU1hcCk7XG4gIF8udW5lc2NhcGUgPSBjcmVhdGVFc2NhcGVyKHVuZXNjYXBlTWFwKTtcblxuICAvLyBJZiB0aGUgdmFsdWUgb2YgdGhlIG5hbWVkIGBwcm9wZXJ0eWAgaXMgYSBmdW5jdGlvbiB0aGVuIGludm9rZSBpdCB3aXRoIHRoZVxuICAvLyBgb2JqZWN0YCBhcyBjb250ZXh0OyBvdGhlcndpc2UsIHJldHVybiBpdC5cbiAgXy5yZXN1bHQgPSBmdW5jdGlvbihvYmplY3QsIHByb3BlcnR5LCBmYWxsYmFjaykge1xuICAgIHZhciB2YWx1ZSA9IG9iamVjdCA9PSBudWxsID8gdm9pZCAwIDogb2JqZWN0W3Byb3BlcnR5XTtcbiAgICBpZiAodmFsdWUgPT09IHZvaWQgMCkge1xuICAgICAgdmFsdWUgPSBmYWxsYmFjaztcbiAgICB9XG4gICAgcmV0dXJuIF8uaXNGdW5jdGlvbih2YWx1ZSkgPyB2YWx1ZS5jYWxsKG9iamVjdCkgOiB2YWx1ZTtcbiAgfTtcblxuICAvLyBHZW5lcmF0ZSBhIHVuaXF1ZSBpbnRlZ2VyIGlkICh1bmlxdWUgd2l0aGluIHRoZSBlbnRpcmUgY2xpZW50IHNlc3Npb24pLlxuICAvLyBVc2VmdWwgZm9yIHRlbXBvcmFyeSBET00gaWRzLlxuICB2YXIgaWRDb3VudGVyID0gMDtcbiAgXy51bmlxdWVJZCA9IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgIHZhciBpZCA9ICsraWRDb3VudGVyICsgJyc7XG4gICAgcmV0dXJuIHByZWZpeCA/IHByZWZpeCArIGlkIDogaWQ7XG4gIH07XG5cbiAgLy8gQnkgZGVmYXVsdCwgVW5kZXJzY29yZSB1c2VzIEVSQi1zdHlsZSB0ZW1wbGF0ZSBkZWxpbWl0ZXJzLCBjaGFuZ2UgdGhlXG4gIC8vIGZvbGxvd2luZyB0ZW1wbGF0ZSBzZXR0aW5ncyB0byB1c2UgYWx0ZXJuYXRpdmUgZGVsaW1pdGVycy5cbiAgXy50ZW1wbGF0ZVNldHRpbmdzID0ge1xuICAgIGV2YWx1YXRlICAgIDogLzwlKFtcXHNcXFNdKz8pJT4vZyxcbiAgICBpbnRlcnBvbGF0ZSA6IC88JT0oW1xcc1xcU10rPyklPi9nLFxuICAgIGVzY2FwZSAgICAgIDogLzwlLShbXFxzXFxTXSs/KSU+L2dcbiAgfTtcblxuICAvLyBXaGVuIGN1c3RvbWl6aW5nIGB0ZW1wbGF0ZVNldHRpbmdzYCwgaWYgeW91IGRvbid0IHdhbnQgdG8gZGVmaW5lIGFuXG4gIC8vIGludGVycG9sYXRpb24sIGV2YWx1YXRpb24gb3IgZXNjYXBpbmcgcmVnZXgsIHdlIG5lZWQgb25lIHRoYXQgaXNcbiAgLy8gZ3VhcmFudGVlZCBub3QgdG8gbWF0Y2guXG4gIHZhciBub01hdGNoID0gLyguKV4vO1xuXG4gIC8vIENlcnRhaW4gY2hhcmFjdGVycyBuZWVkIHRvIGJlIGVzY2FwZWQgc28gdGhhdCB0aGV5IGNhbiBiZSBwdXQgaW50byBhXG4gIC8vIHN0cmluZyBsaXRlcmFsLlxuICB2YXIgZXNjYXBlcyA9IHtcbiAgICBcIidcIjogICAgICBcIidcIixcbiAgICAnXFxcXCc6ICAgICAnXFxcXCcsXG4gICAgJ1xccic6ICAgICAncicsXG4gICAgJ1xcbic6ICAgICAnbicsXG4gICAgJ1xcdTIwMjgnOiAndTIwMjgnLFxuICAgICdcXHUyMDI5JzogJ3UyMDI5J1xuICB9O1xuXG4gIHZhciBlc2NhcGVyID0gL1xcXFx8J3xcXHJ8XFxufFxcdTIwMjh8XFx1MjAyOS9nO1xuXG4gIHZhciBlc2NhcGVDaGFyID0gZnVuY3Rpb24obWF0Y2gpIHtcbiAgICByZXR1cm4gJ1xcXFwnICsgZXNjYXBlc1ttYXRjaF07XG4gIH07XG5cbiAgLy8gSmF2YVNjcmlwdCBtaWNyby10ZW1wbGF0aW5nLCBzaW1pbGFyIHRvIEpvaG4gUmVzaWcncyBpbXBsZW1lbnRhdGlvbi5cbiAgLy8gVW5kZXJzY29yZSB0ZW1wbGF0aW5nIGhhbmRsZXMgYXJiaXRyYXJ5IGRlbGltaXRlcnMsIHByZXNlcnZlcyB3aGl0ZXNwYWNlLFxuICAvLyBhbmQgY29ycmVjdGx5IGVzY2FwZXMgcXVvdGVzIHdpdGhpbiBpbnRlcnBvbGF0ZWQgY29kZS5cbiAgLy8gTkI6IGBvbGRTZXR0aW5nc2Agb25seSBleGlzdHMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5LlxuICBfLnRlbXBsYXRlID0gZnVuY3Rpb24odGV4dCwgc2V0dGluZ3MsIG9sZFNldHRpbmdzKSB7XG4gICAgaWYgKCFzZXR0aW5ncyAmJiBvbGRTZXR0aW5ncykgc2V0dGluZ3MgPSBvbGRTZXR0aW5ncztcbiAgICBzZXR0aW5ncyA9IF8uZGVmYXVsdHMoe30sIHNldHRpbmdzLCBfLnRlbXBsYXRlU2V0dGluZ3MpO1xuXG4gICAgLy8gQ29tYmluZSBkZWxpbWl0ZXJzIGludG8gb25lIHJlZ3VsYXIgZXhwcmVzc2lvbiB2aWEgYWx0ZXJuYXRpb24uXG4gICAgdmFyIG1hdGNoZXIgPSBSZWdFeHAoW1xuICAgICAgKHNldHRpbmdzLmVzY2FwZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuaW50ZXJwb2xhdGUgfHwgbm9NYXRjaCkuc291cmNlLFxuICAgICAgKHNldHRpbmdzLmV2YWx1YXRlIHx8IG5vTWF0Y2gpLnNvdXJjZVxuICAgIF0uam9pbignfCcpICsgJ3wkJywgJ2cnKTtcblxuICAgIC8vIENvbXBpbGUgdGhlIHRlbXBsYXRlIHNvdXJjZSwgZXNjYXBpbmcgc3RyaW5nIGxpdGVyYWxzIGFwcHJvcHJpYXRlbHkuXG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICB2YXIgc291cmNlID0gXCJfX3ArPSdcIjtcbiAgICB0ZXh0LnJlcGxhY2UobWF0Y2hlciwgZnVuY3Rpb24obWF0Y2gsIGVzY2FwZSwgaW50ZXJwb2xhdGUsIGV2YWx1YXRlLCBvZmZzZXQpIHtcbiAgICAgIHNvdXJjZSArPSB0ZXh0LnNsaWNlKGluZGV4LCBvZmZzZXQpLnJlcGxhY2UoZXNjYXBlciwgZXNjYXBlQ2hhcik7XG4gICAgICBpbmRleCA9IG9mZnNldCArIG1hdGNoLmxlbmd0aDtcblxuICAgICAgaWYgKGVzY2FwZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGVzY2FwZSArIFwiKSk9PW51bGw/Jyc6Xy5lc2NhcGUoX190KSkrXFxuJ1wiO1xuICAgICAgfSBlbHNlIGlmIChpbnRlcnBvbGF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInK1xcbigoX190PShcIiArIGludGVycG9sYXRlICsgXCIpKT09bnVsbD8nJzpfX3QpK1xcbidcIjtcbiAgICAgIH0gZWxzZSBpZiAoZXZhbHVhdGUpIHtcbiAgICAgICAgc291cmNlICs9IFwiJztcXG5cIiArIGV2YWx1YXRlICsgXCJcXG5fX3ArPSdcIjtcbiAgICAgIH1cblxuICAgICAgLy8gQWRvYmUgVk1zIG5lZWQgdGhlIG1hdGNoIHJldHVybmVkIHRvIHByb2R1Y2UgdGhlIGNvcnJlY3Qgb2ZmZXN0LlxuICAgICAgcmV0dXJuIG1hdGNoO1xuICAgIH0pO1xuICAgIHNvdXJjZSArPSBcIic7XFxuXCI7XG5cbiAgICAvLyBJZiBhIHZhcmlhYmxlIGlzIG5vdCBzcGVjaWZpZWQsIHBsYWNlIGRhdGEgdmFsdWVzIGluIGxvY2FsIHNjb3BlLlxuICAgIGlmICghc2V0dGluZ3MudmFyaWFibGUpIHNvdXJjZSA9ICd3aXRoKG9ianx8e30pe1xcbicgKyBzb3VyY2UgKyAnfVxcbic7XG5cbiAgICBzb3VyY2UgPSBcInZhciBfX3QsX19wPScnLF9faj1BcnJheS5wcm90b3R5cGUuam9pbixcIiArXG4gICAgICBcInByaW50PWZ1bmN0aW9uKCl7X19wKz1fX2ouY2FsbChhcmd1bWVudHMsJycpO307XFxuXCIgK1xuICAgICAgc291cmNlICsgJ3JldHVybiBfX3A7XFxuJztcblxuICAgIHRyeSB7XG4gICAgICB2YXIgcmVuZGVyID0gbmV3IEZ1bmN0aW9uKHNldHRpbmdzLnZhcmlhYmxlIHx8ICdvYmonLCAnXycsIHNvdXJjZSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgZS5zb3VyY2UgPSBzb3VyY2U7XG4gICAgICB0aHJvdyBlO1xuICAgIH1cblxuICAgIHZhciB0ZW1wbGF0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgIHJldHVybiByZW5kZXIuY2FsbCh0aGlzLCBkYXRhLCBfKTtcbiAgICB9O1xuXG4gICAgLy8gUHJvdmlkZSB0aGUgY29tcGlsZWQgc291cmNlIGFzIGEgY29udmVuaWVuY2UgZm9yIHByZWNvbXBpbGF0aW9uLlxuICAgIHZhciBhcmd1bWVudCA9IHNldHRpbmdzLnZhcmlhYmxlIHx8ICdvYmonO1xuICAgIHRlbXBsYXRlLnNvdXJjZSA9ICdmdW5jdGlvbignICsgYXJndW1lbnQgKyAnKXtcXG4nICsgc291cmNlICsgJ30nO1xuXG4gICAgcmV0dXJuIHRlbXBsYXRlO1xuICB9O1xuXG4gIC8vIEFkZCBhIFwiY2hhaW5cIiBmdW5jdGlvbi4gU3RhcnQgY2hhaW5pbmcgYSB3cmFwcGVkIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLmNoYWluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGluc3RhbmNlID0gXyhvYmopO1xuICAgIGluc3RhbmNlLl9jaGFpbiA9IHRydWU7XG4gICAgcmV0dXJuIGluc3RhbmNlO1xuICB9O1xuXG4gIC8vIE9PUFxuICAvLyAtLS0tLS0tLS0tLS0tLS1cbiAgLy8gSWYgVW5kZXJzY29yZSBpcyBjYWxsZWQgYXMgYSBmdW5jdGlvbiwgaXQgcmV0dXJucyBhIHdyYXBwZWQgb2JqZWN0IHRoYXRcbiAgLy8gY2FuIGJlIHVzZWQgT08tc3R5bGUuIFRoaXMgd3JhcHBlciBob2xkcyBhbHRlcmVkIHZlcnNpb25zIG9mIGFsbCB0aGVcbiAgLy8gdW5kZXJzY29yZSBmdW5jdGlvbnMuIFdyYXBwZWQgb2JqZWN0cyBtYXkgYmUgY2hhaW5lZC5cblxuICAvLyBIZWxwZXIgZnVuY3Rpb24gdG8gY29udGludWUgY2hhaW5pbmcgaW50ZXJtZWRpYXRlIHJlc3VsdHMuXG4gIHZhciByZXN1bHQgPSBmdW5jdGlvbihpbnN0YW5jZSwgb2JqKSB7XG4gICAgcmV0dXJuIGluc3RhbmNlLl9jaGFpbiA/IF8ob2JqKS5jaGFpbigpIDogb2JqO1xuICB9O1xuXG4gIC8vIEFkZCB5b3VyIG93biBjdXN0b20gZnVuY3Rpb25zIHRvIHRoZSBVbmRlcnNjb3JlIG9iamVjdC5cbiAgXy5taXhpbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIF8uZWFjaChfLmZ1bmN0aW9ucyhvYmopLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgICB2YXIgZnVuYyA9IF9bbmFtZV0gPSBvYmpbbmFtZV07XG4gICAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgYXJncyA9IFt0aGlzLl93cmFwcGVkXTtcbiAgICAgICAgcHVzaC5hcHBseShhcmdzLCBhcmd1bWVudHMpO1xuICAgICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIGZ1bmMuYXBwbHkoXywgYXJncykpO1xuICAgICAgfTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBBZGQgYWxsIG9mIHRoZSBVbmRlcnNjb3JlIGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlciBvYmplY3QuXG4gIF8ubWl4aW4oXyk7XG5cbiAgLy8gQWRkIGFsbCBtdXRhdG9yIEFycmF5IGZ1bmN0aW9ucyB0byB0aGUgd3JhcHBlci5cbiAgXy5lYWNoKFsncG9wJywgJ3B1c2gnLCAncmV2ZXJzZScsICdzaGlmdCcsICdzb3J0JywgJ3NwbGljZScsICd1bnNoaWZ0J10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG9iaiA9IHRoaXMuX3dyYXBwZWQ7XG4gICAgICBtZXRob2QuYXBwbHkob2JqLCBhcmd1bWVudHMpO1xuICAgICAgaWYgKChuYW1lID09PSAnc2hpZnQnIHx8IG5hbWUgPT09ICdzcGxpY2UnKSAmJiBvYmoubGVuZ3RoID09PSAwKSBkZWxldGUgb2JqWzBdO1xuICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBvYmopO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIEFkZCBhbGwgYWNjZXNzb3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBfLmVhY2goWydjb25jYXQnLCAnam9pbicsICdzbGljZSddLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIG1ldGhvZCA9IEFycmF5UHJvdG9bbmFtZV07XG4gICAgXy5wcm90b3R5cGVbbmFtZV0gPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiByZXN1bHQodGhpcywgbWV0aG9kLmFwcGx5KHRoaXMuX3dyYXBwZWQsIGFyZ3VtZW50cykpO1xuICAgIH07XG4gIH0pO1xuXG4gIC8vIEV4dHJhY3RzIHRoZSByZXN1bHQgZnJvbSBhIHdyYXBwZWQgYW5kIGNoYWluZWQgb2JqZWN0LlxuICBfLnByb3RvdHlwZS52YWx1ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLl93cmFwcGVkO1xuICB9O1xuXG4gIC8vIFByb3ZpZGUgdW53cmFwcGluZyBwcm94eSBmb3Igc29tZSBtZXRob2RzIHVzZWQgaW4gZW5naW5lIG9wZXJhdGlvbnNcbiAgLy8gc3VjaCBhcyBhcml0aG1ldGljIGFuZCBKU09OIHN0cmluZ2lmaWNhdGlvbi5cbiAgXy5wcm90b3R5cGUudmFsdWVPZiA9IF8ucHJvdG90eXBlLnRvSlNPTiA9IF8ucHJvdG90eXBlLnZhbHVlO1xuXG4gIF8ucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICcnICsgdGhpcy5fd3JhcHBlZDtcbiAgfTtcblxuICAvLyBBTUQgcmVnaXN0cmF0aW9uIGhhcHBlbnMgYXQgdGhlIGVuZCBmb3IgY29tcGF0aWJpbGl0eSB3aXRoIEFNRCBsb2FkZXJzXG4gIC8vIHRoYXQgbWF5IG5vdCBlbmZvcmNlIG5leHQtdHVybiBzZW1hbnRpY3Mgb24gbW9kdWxlcy4gRXZlbiB0aG91Z2ggZ2VuZXJhbFxuICAvLyBwcmFjdGljZSBmb3IgQU1EIHJlZ2lzdHJhdGlvbiBpcyB0byBiZSBhbm9ueW1vdXMsIHVuZGVyc2NvcmUgcmVnaXN0ZXJzXG4gIC8vIGFzIGEgbmFtZWQgbW9kdWxlIGJlY2F1c2UsIGxpa2UgalF1ZXJ5LCBpdCBpcyBhIGJhc2UgbGlicmFyeSB0aGF0IGlzXG4gIC8vIHBvcHVsYXIgZW5vdWdoIHRvIGJlIGJ1bmRsZWQgaW4gYSB0aGlyZCBwYXJ0eSBsaWIsIGJ1dCBub3QgYmUgcGFydCBvZlxuICAvLyBhbiBBTUQgbG9hZCByZXF1ZXN0LiBUaG9zZSBjYXNlcyBjb3VsZCBnZW5lcmF0ZSBhbiBlcnJvciB3aGVuIGFuXG4gIC8vIGFub255bW91cyBkZWZpbmUoKSBpcyBjYWxsZWQgb3V0c2lkZSBvZiBhIGxvYWRlciByZXF1ZXN0LlxuICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgZGVmaW5lKCd1bmRlcnNjb3JlJywgW10sIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIF87XG4gICAgfSk7XG4gIH1cbn0uY2FsbCh0aGlzKSk7XG4iXX0=
