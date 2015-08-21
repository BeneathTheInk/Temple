/*
 * Temple (with Source Map)
 * (c) 2014-2015 Beneath the Ink, Inc.
 * Copyright (C) 2011--2015 Meteor Development Group
 * MIT License
 * Version 0.5.10
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

},{"./utils":13,"backbone-events-standalone":16,"backbone-extend-standalone":17,"matches-selector":19,"underscore":29}],2:[function(require,module,exports){
var _ = require("underscore");
var Trackr = require("trackr");
var parse = require("./m+xml").parse;
var NODE_TYPE = require("./types");

// properties that Node.js and the browser can handle
var Temple = module.exports = {
	VERSION: "0.5.10",
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

},{"./domrange":1,"./m+xml":3,"./model":4,"./mustache":5,"./plugins":8,"./section":11,"./types":12,"./utils":13,"./view":14,"trackr":28,"trackr-objects":20,"underscore":29}],3:[function(require,module,exports){
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

},{"./m+xml":3,"./utils":13,"backbone-extend-standalone":17,"trackr":28,"trackr-objects":20,"underscore":29}],5:[function(require,module,exports){
var Trackr = require("trackr");
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

},{"./domrange":1,"./m+xml":3,"./model":4,"./section":11,"./types":12,"./utils":13,"./view":14,"trackr":28,"trackr-objects":20,"underscore":29}],6:[function(require,module,exports){
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
},{"../":2,"underscore":29}],7:[function(require,module,exports){
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

},{"./actions":6,"./adoption":7,"./refs":9,"./twoway":10,"underscore":29}],9:[function(require,module,exports){
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
},{"underscore":29}],11:[function(require,module,exports){
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

},{"./model":4,"./utils":13,"./view":14,"trackr":28,"underscore":29}],12:[function(require,module,exports){
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

},{"matches-selector":19,"underscore":29}],14:[function(require,module,exports){
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

},{"./domrange":1,"./model":4,"./plugins":8,"./utils":13,"backbone-events-standalone":16,"trackr":28,"underscore":29}],15:[function(require,module,exports){
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
},{}],20:[function(require,module,exports){
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

},{"array-spy":21,"has-own-prop":22,"is-plain-object":23,"shallow-copy":25,"trackr":28}],21:[function(require,module,exports){
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

},{}],22:[function(require,module,exports){
'use strict';
var hasOwnProp = Object.prototype.hasOwnProperty;

module.exports = function (obj, prop) {
	return hasOwnProp.call(obj, prop);
};

},{}],23:[function(require,module,exports){
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

},{"isobject":24}],24:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy90cmFja3Ivbm9kZV9tb2R1bGVzL3JhZi9ub2RlX21vZHVsZXMvcGVyZm9ybWFuY2Utbm93L2xpYi9wZXJmb3JtYW5jZS1ub3cuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiLy8gR2VuZXJhdGVkIGJ5IENvZmZlZVNjcmlwdCAxLjcuMVxuKGZ1bmN0aW9uKCkge1xuICB2YXIgZ2V0TmFub1NlY29uZHMsIGhydGltZSwgbG9hZFRpbWU7XG5cbiAgaWYgKCh0eXBlb2YgcGVyZm9ybWFuY2UgIT09IFwidW5kZWZpbmVkXCIgJiYgcGVyZm9ybWFuY2UgIT09IG51bGwpICYmIHBlcmZvcm1hbmNlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgfTtcbiAgfSBlbHNlIGlmICgodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2VzcyAhPT0gbnVsbCkgJiYgcHJvY2Vzcy5ocnRpbWUpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIChnZXROYW5vU2Vjb25kcygpIC0gbG9hZFRpbWUpIC8gMWU2O1xuICAgIH07XG4gICAgaHJ0aW1lID0gcHJvY2Vzcy5ocnRpbWU7XG4gICAgZ2V0TmFub1NlY29uZHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBocjtcbiAgICAgIGhyID0gaHJ0aW1lKCk7XG4gICAgICByZXR1cm4gaHJbMF0gKiAxZTkgKyBoclsxXTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gZ2V0TmFub1NlY29uZHMoKTtcbiAgfSBlbHNlIGlmIChEYXRlLm5vdykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gRGF0ZS5ub3coKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBEYXRlLm5vdygpO1xuICB9IGVsc2Uge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gbmV3IERhdGUoKS5nZXRUaW1lKCkgLSBsb2FkVGltZTtcbiAgICB9O1xuICAgIGxvYWRUaW1lID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gIH1cblxufSkuY2FsbCh0aGlzKTtcbiJdfQ==
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
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy90cmFja3IvdHJhY2tyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iLzY5Njg3NmIxODQ4ZTRkNmE5MjAxNDM0MjJjMmM1MGM0NTAxYzg1YTMvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vLyBjaGVjayBmb3IgZ2xvYmFsIGFuZCB1c2UgdGhhdCBvbmUgaW5zdGVhZCBvZiBsb2FkaW5nIGEgbmV3IG9uZVxuaWYgKHR5cGVvZiBnbG9iYWwuVHJhY2tyICE9PSBcInVuZGVmaW5lZFwiKSB7XG5cdG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsLlRyYWNrcjtcblx0cmV0dXJuO1xufVxuXG4vKipcbiAqIEBuYW1lc3BhY2UgVHJhY2tyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja3ItcmVsYXRlZCBtZXRob2RzLlxuICovXG52YXIgVHJhY2tyID0gZ2xvYmFsLlRyYWNrciA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWN0aXZlXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGVyZSBpcyBhIGN1cnJlbnQgY29tcHV0YXRpb24sIG1lYW5pbmcgdGhhdCBkZXBlbmRlbmNpZXMgb24gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIHdpbGwgYmUgdHJhY2tlZCBhbmQgcG90ZW50aWFsbHkgY2F1c2UgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gdG8gYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLmFjdGl2ZSA9IGZhbHNlO1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2N1cnJlbnRjb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLCBvciBgbnVsbGAgaWYgdGhlcmUgaXNuJ3Qgb25lLlx0VGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgdGhlIFtgVHJhY2tyLkNvbXB1dGF0aW9uYF0oI3RyYWNrZXJfY29tcHV0YXRpb24pIG9iamVjdCBjcmVhdGVkIGJ5IHRoZSBpbm5lcm1vc3QgYWN0aXZlIGNhbGwgdG8gYFRyYWNrci5hdXRvcnVuYCwgYW5kIGl0J3MgdGhlIGNvbXB1dGF0aW9uIHRoYXQgZ2FpbnMgZGVwZW5kZW5jaWVzIHdoZW4gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFyZSBhY2Nlc3NlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtUcmFja3IuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBudWxsO1xuXG4vLyBSZWZlcmVuY2VzIHRvIGFsbCBjb21wdXRhdGlvbnMgY3JlYXRlZCB3aXRoaW4gdGhlIFRyYWNrciBieSBpZC5cbi8vIEtlZXBpbmcgdGhlc2UgcmVmZXJlbmNlcyBvbiBhbiB1bmRlcnNjb3JlIHByb3BlcnR5IGdpdmVzIG1vcmUgY29udHJvbCB0b1xuLy8gdG9vbGluZyBhbmQgcGFja2FnZXMgZXh0ZW5kaW5nIFRyYWNrciB3aXRob3V0IGluY3JlYXNpbmcgdGhlIEFQSSBzdXJmYWNlLlxuLy8gVGhlc2UgY2FuIHVzZWQgdG8gbW9ua2V5LXBhdGNoIGNvbXB1dGF0aW9ucywgdGhlaXIgZnVuY3Rpb25zLCB1c2Vcbi8vIGNvbXB1dGF0aW9uIGlkcyBmb3IgdHJhY2tpbmcsIGV0Yy5cblRyYWNrci5fY29tcHV0YXRpb25zID0ge307XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gYztcblx0VHJhY2tyLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG52YXIgX2RlYnVnRnVuYyA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuICh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5lcnJvciA/XG5cdFx0XHQgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmVycm9yLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuXHRcdFx0IGZ1bmN0aW9uICgpIHt9O1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcblx0aWYgKHRocm93Rmlyc3RFcnJvcikge1xuXHRcdHRocm93IGU7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIHByaW50QXJncyA9IFtcIkV4Y2VwdGlvbiBmcm9tIFRyYWNrciBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIl07XG5cdFx0aWYgKGUuc3RhY2sgJiYgZS5tZXNzYWdlICYmIGUubmFtZSkge1xuXHRcdFx0dmFyIGlkeCA9IGUuc3RhY2suaW5kZXhPZihlLm1lc3NhZ2UpO1xuXHRcdFx0aWYgKGlkeCA8IDAgfHwgaWR4ID4gZS5uYW1lLmxlbmd0aCArIDIpIHsgLy8gY2hlY2sgZm9yIFwiRXJyb3I6IFwiXG5cdFx0XHRcdC8vIG1lc3NhZ2UgaXMgbm90IHBhcnQgb2YgdGhlIHN0YWNrXG5cdFx0XHRcdHZhciBtZXNzYWdlID0gZS5uYW1lICsgXCI6IFwiICsgZS5tZXNzYWdlO1xuXHRcdFx0XHRwcmludEFyZ3MucHVzaChtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cHJpbnRBcmdzLnB1c2goZS5zdGFjayk7XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHByaW50QXJncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0X2RlYnVnRnVuYygpKHByaW50QXJnc1tpXSk7XG5cdFx0fVxuXHR9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcblx0cmV0dXJuIGY7XG59O1xuXG52YXIgbmV4dElkID0gMTtcbi8vIGNvbXB1dGF0aW9ucyB3aG9zZSBjYWxsYmFja3Mgd2Ugc2hvdWxkIGNhbGwgYXQgZmx1c2ggdGltZVxudmFyIHBlbmRpbmdDb21wdXRhdGlvbnMgPSBbXTtcbi8vIGB0cnVlYCBpZiBhIFRyYWNrci5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgd2lsbEZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGluIFRyYWNrci5mbHVzaCBub3dcbnZhciBpbkZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGNvbXB1dGluZyBhIGNvbXB1dGF0aW9uIG5vdywgZWl0aGVyIGZpcnN0IHRpbWVcbi8vIG9yIHJlY29tcHV0ZS5cdFRoaXMgbWF0Y2hlcyBUcmFja3IuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBUcmFja3Iubm9ucmVhY3RpdmUsIHdoaWNoIG51bGxmaWVzIGN1cnJlbnRDb21wdXRhdGlvbiBldmVuIHRob3VnaFxuLy8gYW4gZW5jbG9zaW5nIGNvbXB1dGF0aW9uIG1heSBzdGlsbCBiZSBydW5uaW5nLlxudmFyIGluQ29tcHV0ZSA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHRoZSBgX3Rocm93Rmlyc3RFcnJvcmAgb3B0aW9uIHdhcyBwYXNzZWQgaW4gdG8gdGhlIGNhbGxcbi8vIHRvIFRyYWNrci5mbHVzaCB0aGF0IHdlIGFyZSBpbi4gV2hlbiBzZXQsIHRocm93IHJhdGhlciB0aGFuIGxvZyB0aGVcbi8vIGZpcnN0IGVycm9yIGVuY291bnRlcmVkIHdoaWxlIGZsdXNoaW5nLiBCZWZvcmUgdGhyb3dpbmcgdGhlIGVycm9yLFxuLy8gZmluaXNoIGZsdXNoaW5nIChmcm9tIGEgZmluYWxseSBibG9jayksIGxvZ2dpbmcgYW55IHN1YnNlcXVlbnRcbi8vIGVycm9ycy5cbnZhciB0aHJvd0ZpcnN0RXJyb3IgPSBmYWxzZTtcblxudmFyIGFmdGVyRmx1c2hDYWxsYmFja3MgPSBbXTtcblxudmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHJlcXVpcmUoXCJyYWZcIik7XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG5cdGlmICghIHdpbGxGbHVzaCkge1xuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZShUcmFja3IuX3J1bkZsdXNoKTtcblx0XHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR9XG59O1xuXG4vLyBUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBBIENvbXB1dGF0aW9uIG9iamVjdCByZXByZXNlbnRzIGNvZGUgdGhhdCBpcyByZXBlYXRlZGx5IHJlcnVuXG4gKiBpbiByZXNwb25zZSB0b1xuICogcmVhY3RpdmUgZGF0YSBjaGFuZ2VzLiBDb21wdXRhdGlvbnMgZG9uJ3QgaGF2ZSByZXR1cm4gdmFsdWVzOyB0aGV5IGp1c3RcbiAqIHBlcmZvcm0gYWN0aW9ucywgc3VjaCBhcyByZXJlbmRlcmluZyBhIHRlbXBsYXRlIG9uIHRoZSBzY3JlZW4uIENvbXB1dGF0aW9uc1xuICogYXJlIGNyZWF0ZWQgdXNpbmcgVHJhY2tyLmF1dG9ydW4uIFVzZSBzdG9wIHRvIHByZXZlbnQgZnVydGhlciByZXJ1bm5pbmcgb2YgYVxuICogY29tcHV0YXRpb24uXG4gKiBAaW5zdGFuY2VuYW1lIGNvbXB1dGF0aW9uXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQsIG9wdGlvbnMpIHtcblx0aWYgKCEgY29uc3RydWN0aW5nQ29tcHV0YXRpb24pXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XCJUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgcHJpdmF0ZTsgdXNlIFRyYWNrci5hdXRvcnVuXCIpO1xuXHRjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG5cdHZhciBzZWxmID0gdGhpcztcblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cblx0ICogQGxvY3VzIENsaWVudFxuXHQgKiBAbWVtYmVyT2YgVHJhY2tyLkNvbXB1dGF0aW9uXG5cdCAqIEBpbnN0YW5jZVxuXHQgKiBAbmFtZVx0c3RvcHBlZFxuXHQgKi9cblx0c2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdGludmFsaWRhdGVkXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrci5hdXRvcnVuYCBpcyBjYWxsZWQsIGFuZCBmYWxzZSBvbiBzdWJzZXF1ZW50IHJlcnVucyBhbmQgYXQgb3RoZXIgdGltZXMuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdGZpcnN0UnVuXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5maXJzdFJ1biA9IHRydWU7XG5cblx0c2VsZi5faWQgPSBuZXh0SWQrKztcblx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG5cdHNlbGYuX29uU3RvcENhbGxiYWNrcyA9IFtdO1xuXHQvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG5cdC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuXHRzZWxmLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdHNlbGYuX2Z1bmMgPSBmO1xuXHRzZWxmLl9vbkVycm9yID0gb3B0aW9ucy5vbkVycm9yO1xuXHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHRzZWxmLl9jb250ZXh0ID0gb3B0aW9ucy5jb250ZXh0IHx8IG51bGw7XG5cblx0Ly8gUmVnaXN0ZXIgdGhlIGNvbXB1dGF0aW9uIHdpdGhpbiB0aGUgZ2xvYmFsIFRyYWNrci5cblx0VHJhY2tyLl9jb21wdXRhdGlvbnNbc2VsZi5faWRdID0gc2VsZjtcblxuXHR2YXIgZXJyb3JlZCA9IHRydWU7XG5cdHRyeSB7XG5cdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdGVycm9yZWQgPSBmYWxzZTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0aWYgKGVycm9yZWQpXG5cdFx0XHRzZWxmLnN0b3AoKTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLlx0VGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gaW52YWxpZGF0aW9uLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBpbnZhbGlkYXRlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MucHVzaCh7IGZuOiBmLCBjdHg6IGN0eCB9KTtcblx0fVxufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZWdpc3RlcnMgYGNhbGxiYWNrYCB0byBydW4gd2hlbiB0aGlzIGNvbXB1dGF0aW9uIGlzIHN0b3BwZWQsIG9yIHJ1bnMgaXQgaW1tZWRpYXRlbHkgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGFscmVhZHkgc3RvcHBlZC5cdFRoZSBjYWxsYmFjayBpcyBydW4gYWZ0ZXIgYW55IGBvbkludmFsaWRhdGVgIGNhbGxiYWNrcy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiBzdG9wLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBzdG9wcGVkLlxuICovXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLm9uU3RvcCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJvblN0b3AgcmVxdWlyZXMgYSBmdW5jdGlvblwiKTtcblxuXHRpZiAoc2VsZi5zdG9wcGVkKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25TdG9wQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlcyB0aGlzIGNvbXB1dGF0aW9uIHNvIHRoYXQgaXQgd2lsbCBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHQvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG5cdFx0Ly8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG5cdFx0aWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcblx0XHRcdHJlcXVpcmVGbHVzaCgpO1xuXHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuXHRcdH1cblxuXHRcdHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2Vcblx0XHQvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5cbi8qKlxuICogQHN1bW1hcnkgUHJldmVudHMgdGhpcyBjb21wdXRhdGlvbiBmcm9tIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKCEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0c2VsZi5zdG9wcGVkID0gdHJ1ZTtcblx0XHRzZWxmLmludmFsaWRhdGUoKTtcblx0XHQvLyBVbnJlZ2lzdGVyIGZyb20gZ2xvYmFsIFRyYWNrci5cblx0XHRkZWxldGUgVHJhY2tyLl9jb21wdXRhdGlvbnNbc2VsZi5faWRdO1xuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vblN0b3BDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uU3RvcENhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG5cdHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcblx0aW5Db21wdXRlID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0XHRpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fbmVlZHNSZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0cmV0dXJuIHNlbGYuaW52YWxpZGF0ZWQgJiYgISBzZWxmLnN0b3BwZWQ7XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9yZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRzZWxmLl9yZWNvbXB1dGluZyA9IHRydWU7XG5cdHRyeSB7XG5cdFx0aWYgKHNlbGYuX25lZWRzUmVjb21wdXRlKCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNlbGYuX2NvbXB1dGUoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHNlbGYuX29uRXJyb3IpIHtcblx0XHRcdFx0XHRzZWxmLl9vbkVycm9yKGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGZpbmFsbHkge1xuXHRcdHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cdH1cbn07XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2RlcGVuZGVuY3lcblxuLyoqXG4gKiBAc3VtbWFyeSBBIERlcGVuZGVuY3kgcmVwcmVzZW50cyBhbiBhdG9taWMgdW5pdCBvZiByZWFjdGl2ZSBkYXRhIHRoYXQgYVxuICogY29tcHV0YXRpb24gbWlnaHQgZGVwZW5kIG9uLiBSZWFjdGl2ZSBkYXRhIHNvdXJjZXMgc3VjaCBhcyBTZXNzaW9uIG9yXG4gKiBNaW5pbW9uZ28gaW50ZXJuYWxseSBjcmVhdGUgZGlmZmVyZW50IERlcGVuZGVuY3kgb2JqZWN0cyBmb3IgZGlmZmVyZW50XG4gKiBwaWVjZXMgb2YgZGF0YSwgZWFjaCBvZiB3aGljaCBtYXkgYmUgZGVwZW5kZWQgb24gYnkgbXVsdGlwbGUgY29tcHV0YXRpb25zLlxuICogV2hlbiB0aGUgZGF0YSBjaGFuZ2VzLCB0aGUgY29tcHV0YXRpb25zIGFyZSBpbnZhbGlkYXRlZC5cbiAqIEBjbGFzc1xuICogQGluc3RhbmNlTmFtZSBkZXBlbmRlbmN5XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5ID0gZnVuY3Rpb24gKCkge1xuXHR0aGlzLl9kZXBlbmRlbnRzQnlJZCA9IHt9O1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9kZXBlbmRcbi8vXG4vLyBBZGRzIGBjb21wdXRhdGlvbmAgdG8gdGhpcyBzZXQgaWYgaXQgaXMgbm90IGFscmVhZHlcbi8vIHByZXNlbnQuXHRSZXR1cm5zIHRydWUgaWYgYGNvbXB1dGF0aW9uYCBpcyBhIG5ldyBtZW1iZXIgb2YgdGhlIHNldC5cbi8vIElmIG5vIGFyZ3VtZW50LCBkZWZhdWx0cyB0byBjdXJyZW50Q29tcHV0YXRpb24sIG9yIGRvZXMgbm90aGluZ1xuLy8gaWYgdGhlcmUgaXMgbm8gY3VycmVudENvbXB1dGF0aW9uLlxuXG4vKipcbiAqIEBzdW1tYXJ5IERlY2xhcmVzIHRoYXQgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKG9yIGBmcm9tQ29tcHV0YXRpb25gIGlmIGdpdmVuKSBkZXBlbmRzIG9uIGBkZXBlbmRlbmN5YC5cdFRoZSBjb21wdXRhdGlvbiB3aWxsIGJlIGludmFsaWRhdGVkIHRoZSBuZXh0IHRpbWUgYGRlcGVuZGVuY3lgIGNoYW5nZXMuXG5cbklmIHRoZXJlIGlzIG5vIGN1cnJlbnQgY29tcHV0YXRpb24gYW5kIGBkZXBlbmQoKWAgaXMgY2FsbGVkIHdpdGggbm8gYXJndW1lbnRzLCBpdCBkb2VzIG5vdGhpbmcgYW5kIHJldHVybnMgZmFsc2UuXG5cblJldHVybnMgdHJ1ZSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYSBuZXcgZGVwZW5kZW50IG9mIGBkZXBlbmRlbmN5YCByYXRoZXIgdGhhbiBhbiBleGlzdGluZyBvbmUuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge1RyYWNrci5Db21wdXRhdGlvbn0gW2Zyb21Db21wdXRhdGlvbl0gQW4gb3B0aW9uYWwgY29tcHV0YXRpb24gZGVjbGFyZWQgdG8gZGVwZW5kIG9uIGBkZXBlbmRlbmN5YCBpbnN0ZWFkIG9mIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLlxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5kZXBlbmQgPSBmdW5jdGlvbiAoY29tcHV0YXRpb24pIHtcblx0aWYgKCEgY29tcHV0YXRpb24pIHtcblx0XHRpZiAoISBUcmFja3IuYWN0aXZlKVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXG5cdFx0Y29tcHV0YXRpb24gPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHR9XG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIGlkID0gY29tcHV0YXRpb24uX2lkO1xuXHRpZiAoISAoaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpKSB7XG5cdFx0c2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdID0gY29tcHV0YXRpb247XG5cdFx0Y29tcHV0YXRpb24ub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcblx0XHRcdGRlbGV0ZSBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF07XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9jaGFuZ2VkXG5cbi8qKlxuICogQHN1bW1hcnkgSW52YWxpZGF0ZSBhbGwgZGVwZW5kZW50IGNvbXB1dGF0aW9ucyBpbW1lZGlhdGVseSBhbmQgcmVtb3ZlIHRoZW0gYXMgZGVwZW5kZW50cy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0Zm9yICh2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0c2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdLmludmFsaWRhdGUoKTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfaGFzZGVwZW5kZW50c1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBEZXBlbmRlbmN5IGhhcyBvbmUgb3IgbW9yZSBkZXBlbmRlbnQgQ29tcHV0YXRpb25zLCB3aGljaCB3b3VsZCBiZSBpbnZhbGlkYXRlZCBpZiB0aGlzIERlcGVuZGVuY3kgd2VyZSB0byBjaGFuZ2UuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmhhc0RlcGVuZGVudHMgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0Zm9yKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcblx0XHRyZXR1cm4gdHJ1ZTtcblx0cmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9mbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFByb2Nlc3MgYWxsIHJlYWN0aXZlIHVwZGF0ZXMgaW1tZWRpYXRlbHkgYW5kIGVuc3VyZSB0aGF0IGFsbCBpbnZhbGlkYXRlZCBjb21wdXRhdGlvbnMgYXJlIHJlcnVuLlxuICogQGxvY3VzIENsaWVudFxuICovXG5UcmFja3IuZmx1c2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuXHRUcmFja3IuX3J1bkZsdXNoKHsgZmluaXNoU3luY2hyb25vdXNseTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0aHJvd0ZpcnN0RXJyb3I6IG9wdGlvbnMgJiYgb3B0aW9ucy5fdGhyb3dGaXJzdEVycm9yIH0pO1xufTtcblxuLy8gUnVuIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9ucyBhbmQgYWZ0ZXJGbHVzaCBjYWxsYmFja3MuXHRJZiB3ZSB3ZXJlIG5vdCBjYWxsZWRcbi8vIGRpcmVjdGx5IHZpYSBUcmFja3IuZmx1c2gsIHRoaXMgbWF5IHJldHVybiBiZWZvcmUgdGhleSdyZSBhbGwgZG9uZSB0byBhbGxvd1xuLy8gdGhlIGV2ZW50IGxvb3AgdG8gcnVuIGEgbGl0dGxlIGJlZm9yZSBjb250aW51aW5nLlxuVHJhY2tyLl9ydW5GbHVzaCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuXHQvLyBoYXZlIFNwYXJrKVxuXHQvL1xuXHQvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuXHQvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG5cdC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tyLmZsdXNoLlx0QXQgdGhlIG1vbWVudFxuXHQvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG5cdC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLlx0QW5kIHdlIGRvbid0IGhhdmVcblx0Ly8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG5cdC8vXG5cdC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcblx0aWYgKGluRmx1c2gpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja3IuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cblx0aWYgKGluQ29tcHV0ZSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tyLmF1dG9ydW5cIik7XG5cblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0aW5GbHVzaCA9IHRydWU7XG5cdHdpbGxGbHVzaCA9IHRydWU7XG5cdHRocm93Rmlyc3RFcnJvciA9ICEhIG9wdGlvbnMudGhyb3dGaXJzdEVycm9yO1xuXG5cdHZhciByZWNvbXB1dGVkQ291bnQgPSAwO1xuXHR2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcblx0XHRcdFx0XHQgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuXHRcdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHRjb21wLl9yZWNvbXB1dGUoKTtcblx0XHRcdFx0aWYgKGNvbXAuX25lZWRzUmVjb21wdXRlKCkpIHtcblx0XHRcdFx0XHRwZW5kaW5nQ29tcHV0YXRpb25zLnVuc2hpZnQoY29tcCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoISBvcHRpb25zLmZpbmlzaFN5bmNocm9ub3VzbHkgJiYgKytyZWNvbXB1dGVkQ291bnQgPiAxMDAwKSB7XG5cdFx0XHRcdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gY2FsbCBvbmUgYWZ0ZXJGbHVzaCBjYWxsYmFjaywgd2hpY2ggbWF5XG5cdFx0XHRcdC8vIGludmFsaWRhdGUgbW9yZSBjb21wdXRhdGlvbnNcblx0XHRcdFx0dmFyIGNiID0gYWZ0ZXJGbHVzaENhbGxiYWNrcy5zaGlmdCgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNiLmZuLmNhbGwoY2IuY3R4KTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdF90aHJvd09yTG9nKFwiYWZ0ZXJGbHVzaFwiLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmaW5pc2hlZFRyeSA9IHRydWU7XG5cdH0gZmluYWxseSB7XG5cdFx0aWYgKCEgZmluaXNoZWRUcnkpIHtcblx0XHRcdC8vIHdlJ3JlIGVycm9yaW5nIGR1ZSB0byB0aHJvd0ZpcnN0RXJyb3IgYmVpbmcgdHJ1ZS5cblx0XHRcdGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBUcmFja3IuZmx1c2goKWAgYWdhaW5cblx0XHRcdC8vIGZpbmlzaCBmbHVzaGluZ1xuXHRcdFx0VHJhY2tyLl9ydW5GbHVzaCh7XG5cdFx0XHRcdGZpbmlzaFN5bmNocm9ub3VzbHk6IG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSxcblx0XHRcdFx0dGhyb3dGaXJzdEVycm9yOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHdpbGxGbHVzaCA9IGZhbHNlO1xuXHRcdGluRmx1c2ggPSBmYWxzZTtcblx0XHRpZiAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHwgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdC8vIFdlJ3JlIHlpZWxkaW5nIGJlY2F1c2Ugd2UgcmFuIGEgYnVuY2ggb2YgY29tcHV0YXRpb25zIGFuZCB3ZSBhcmVuJ3Rcblx0XHRcdC8vIHJlcXVpcmVkIHRvIGZpbmlzaCBzeW5jaHJvbm91c2x5LCBzbyB3ZSdkIGxpa2UgdG8gZ2l2ZSB0aGUgZXZlbnQgbG9vcCBhXG5cdFx0XHQvLyBjaGFuY2UuIFdlIHNob3VsZCBmbHVzaCBhZ2FpbiBzb29uLlxuXHRcdFx0aWYgKG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJzdGlsbCBoYXZlIG1vcmUgdG8gZG8/XCIpO1x0Ly8gc2hvdWxkbid0IGhhcHBlblxuXHRcdFx0fVxuXHRcdFx0c2V0VGltZW91dChyZXF1aXJlRmx1c2gsIDEwKTtcblx0XHR9XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYXV0b3J1blxuLy9cbi8vIFJ1biBmKCkuIFJlY29yZCBpdHMgZGVwZW5kZW5jaWVzLiBSZXJ1biBpdCB3aGVuZXZlciB0aGVcbi8vIGRlcGVuZGVuY2llcyBjaGFuZ2UuXG4vL1xuLy8gUmV0dXJucyBhIG5ldyBDb21wdXRhdGlvbiwgd2hpY2ggaXMgYWxzbyBwYXNzZWQgdG8gZi5cbi8vXG4vLyBMaW5rcyB0aGUgY29tcHV0YXRpb24gdG8gdGhlIGN1cnJlbnQgY29tcHV0YXRpb25cbi8vIHNvIHRoYXQgaXQgaXMgc3RvcHBlZCBpZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZC5cblxuLyoqXG4gKiBAY2FsbGJhY2sgVHJhY2tyLkNvbXB1dGF0aW9uRnVuY3Rpb25cbiAqIEBwYXJhbSB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIG5vdyBhbmQgcmVydW4gaXQgbGF0ZXIgd2hlbmV2ZXIgaXRzIGRlcGVuZGVuY2llc1xuICogY2hhbmdlLiBSZXR1cm5zIGEgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgdG8gc3RvcCBvciBvYnNlcnZlIHRoZVxuICogcmVydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb25GdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlc1xuICogb25lIGFyZ3VtZW50OiB0aGUgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgd2lsbCBiZSByZXR1cm5lZC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMub25FcnJvciBPcHRpb25hbC4gVGhlIGZ1bmN0aW9uIHRvIHJ1biB3aGVuIGFuIGVycm9yXG4gKiBoYXBwZW5zIGluIHRoZSBDb21wdXRhdGlvbi4gVGhlIG9ubHkgYXJndW1lbnQgaXQgcmVjaWV2ZXMgaXMgdGhlIEVycm9yXG4gKiB0aHJvd24uIERlZmF1bHRzIHRvIHRoZSBlcnJvciBiZWluZyBsb2dnZWQgdG8gdGhlIGNvbnNvbGUuXG4gKiBAcmV0dXJucyB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG5UcmFja3IuYXV0b3J1biA9IGZ1bmN0aW9uIChmLCBvcHRpb25zLCBjdHgpIHtcblx0aWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuXHRcdHRocm93IG5ldyBFcnJvcignVHJhY2tyLmF1dG9ydW4gcmVxdWlyZXMgYSBmdW5jdGlvbiBhcmd1bWVudCcpO1xuXG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXHRpZiAoY3R4KSBvcHRpb25zLmNvbnRleHQgPSBjdHg7XG5cblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuXHR2YXIgYyA9IG5ldyBUcmFja3IuQ29tcHV0YXRpb24oXG5cdFx0ZiwgVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiwgb3B0aW9ucyk7XG5cblx0aWYgKFRyYWNrci5hY3RpdmUpXG5cdFx0VHJhY2tyLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRjLnN0b3AoKTtcblx0XHR9KTtcblxuXHRyZXR1cm4gYztcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfbm9ucmVhY3RpdmVcbi8vXG4vLyBSdW4gYGZgIHdpdGggbm8gY3VycmVudCBjb21wdXRhdGlvbiwgcmV0dXJuaW5nIHRoZSByZXR1cm4gdmFsdWVcbi8vIG9mIGBmYC5cdFVzZWQgdG8gdHVybiBvZmYgcmVhY3Rpdml0eSBmb3IgdGhlIGR1cmF0aW9uIG9mIGBmYCxcbi8vIHNvIHRoYXQgcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFjY2Vzc2VkIGJ5IGBmYCB3aWxsIG5vdCByZXN1bHQgaW4gYW55XG4vLyBjb21wdXRhdGlvbnMgYmVpbmcgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gd2l0aG91dCB0cmFja2luZyBkZXBlbmRlbmNpZXMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIEEgZnVuY3Rpb24gdG8gY2FsbCBpbW1lZGlhdGVseS5cbiAqL1xuVHJhY2tyLm5vblJlYWN0aXZlID1cblRyYWNrci5ub25yZWFjdGl2ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuXHR0cnkge1xuXHRcdHJldHVybiBmLmNhbGwoY3R4KTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuXHR9XG59O1xuXG4vLyBsaWtlIG5vbnJlYWN0aXZlIGJ1dCBtYWtlcyBhIGZ1bmN0aW9uIGluc3RlYWRcblRyYWNrci5ub25SZWFjdGFibGUgPVxuVHJhY2tyLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGYuYXBwbHkoY3R4LCBhcmdzKTtcblx0XHR9KTtcblx0fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IFtgb25JbnZhbGlkYXRlYF0oI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZSkgY2FsbGJhY2sgb24gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKHdoaWNoIG11c3QgZXhpc3QpLCB0byBiZSBjYWxsZWQgaW1tZWRpYXRlbHkgd2hlbiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZCBvciBzdG9wcGVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgaW52b2tlZCBhcyBgZnVuYyhjKWAsIHdoZXJlIGBjYCBpcyB0aGUgY29tcHV0YXRpb24gb24gd2hpY2ggdGhlIGNhbGxiYWNrIGlzIHJlZ2lzdGVyZWQuXG4gKi9cblRyYWNrci5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVHJhY2tyLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hZnRlcmZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgU2NoZWR1bGVzIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGR1cmluZyB0aGUgbmV4dCBmbHVzaCwgb3IgbGF0ZXIgaW4gdGhlIGN1cnJlbnQgZmx1c2ggaWYgb25lIGlzIGluIHByb2dyZXNzLCBhZnRlciBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGhhdmUgYmVlbiByZXJ1bi5cdFRoZSBmdW5jdGlvbiB3aWxsIGJlIHJ1biBvbmNlIGFuZCBub3Qgb24gc3Vic2VxdWVudCBmbHVzaGVzIHVubGVzcyBgYWZ0ZXJGbHVzaGAgaXMgY2FsbGVkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBjYWxsIGF0IGZsdXNoIHRpbWUuXG4gKi9cblRyYWNrci5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdHJlcXVpcmVGbHVzaCgpO1xufTtcbiJdfQ==
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9ncnVudC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJsaWIvZG9tcmFuZ2UuanMiLCJsaWIvaW5kZXguanMiLCJsaWIvbSt4bWwuanMiLCJsaWIvbW9kZWwuanMiLCJsaWIvbXVzdGFjaGUuanMiLCJsaWIvcGx1Z2lucy9hY3Rpb25zLmpzIiwibGliL3BsdWdpbnMvYWRvcHRpb24uanMiLCJsaWIvcGx1Z2lucy9pbmRleC5qcyIsImxpYi9wbHVnaW5zL3JlZnMuanMiLCJsaWIvcGx1Z2lucy90d293YXkuanMiLCJsaWIvc2VjdGlvbi5qcyIsImxpYi90eXBlcy5qcyIsImxpYi91dGlscy5qcyIsImxpYi92aWV3LmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lLmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2JhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lL2JhY2tib25lLWV4dGVuZC1zdGFuZGFsb25lLmpzIiwibm9kZV9tb2R1bGVzL2dydW50LWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIm5vZGVfbW9kdWxlcy9tYXRjaGVzLXNlbGVjdG9yL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL25vZGVfbW9kdWxlcy9hcnJheS1zcHkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHJhY2tyLW9iamVjdHMvbm9kZV9tb2R1bGVzL2hhcy1vd24tcHJvcC9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy90cmFja3Itb2JqZWN0cy9ub2RlX21vZHVsZXMvaXMtcGxhaW4tb2JqZWN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL25vZGVfbW9kdWxlcy9pcy1wbGFpbi1vYmplY3Qvbm9kZV9tb2R1bGVzL2lzb2JqZWN0L2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci1vYmplY3RzL25vZGVfbW9kdWxlcy9zaGFsbG93LWNvcHkvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHJhY2tyL25vZGVfbW9kdWxlcy9yYWYvaW5kZXguanMiLCJub2RlX21vZHVsZXMvdHJhY2tyL25vZGVfbW9kdWxlcy9yYWYvbm9kZV9tb2R1bGVzL3BlcmZvcm1hbmNlLW5vdy9saWIvcGVyZm9ybWFuY2Utbm93LmpzIiwibm9kZV9tb2R1bGVzL3RyYWNrci90cmFja3IuanMiLCJub2RlX21vZHVsZXMvdW5kZXJzY29yZS91bmRlcnNjb3JlLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6WkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3B1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3pPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0WUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcFJBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25PQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9IQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZtQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFRoaXMgaXMgYSBoZWF2aWx5IG1vZGlmaWVkIHZlcnNpb24gb2YgTWV0ZW9yJ3MgRE9NUmFuZ2UgLy9cbi8vIExhc3QgbWVyZ2U6IGh0dHBzOi8vZ2l0aHViLmNvbS9tZXRlb3IvbWV0ZW9yL2Jsb2IvNDA1MDA5YTJjM2RjZDNjMWZlNzgwYWRiMjg2N2QzOGE2YTQyZmZmMS9wYWNrYWdlcy9ibGF6ZS9kb21yYW5nZS5qcyAvL1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cblxudmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKSxcblx0RXZlbnRzID0gcmVxdWlyZShcImJhY2tib25lLWV2ZW50cy1zdGFuZGFsb25lXCIpLFxuXHR1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpLFxuXHRtYXRjaGVzU2VsZWN0b3IgPSByZXF1aXJlKFwibWF0Y2hlcy1zZWxlY3RvclwiKTtcblxuZnVuY3Rpb24gaXNBcnJheUxpa2UoYSkge1xuXHRyZXR1cm4gYSAhPSBudWxsICYmIHR5cGVvZiBhLmxlbmd0aCA9PT0gXCJudW1iZXJcIjtcbn1cblxuLy8gYFtuZXddIEJsYXplLl9ET01SYW5nZShbbm9kZUFuZFJhbmdlQXJyYXldKWBcbi8vXG4vLyBBIERPTVJhbmdlIGNvbnNpc3RzIG9mIGFuIGFycmF5IG9mIGNvbnNlY3V0aXZlIG5vZGVzIGFuZCBET01SYW5nZXMsXG4vLyB3aGljaCBtYXkgYmUgcmVwbGFjZWQgYXQgYW55IHRpbWUgd2l0aCBhIG5ldyBhcnJheS4gIElmIHRoZSBET01SYW5nZVxuLy8gaGFzIGJlZW4gYXR0YWNoZWQgdG8gdGhlIERPTSBhdCBzb21lIGxvY2F0aW9uLCB0aGVuIHVwZGF0aW5nXG4vLyB0aGUgYXJyYXkgd2lsbCBjYXVzZSB0aGUgRE9NIHRvIGJlIHVwZGF0ZWQgYXQgdGhhdCBsb2NhdGlvbi5cbmZ1bmN0aW9uIERPTVJhbmdlKG5vZGVBbmRSYW5nZUFycmF5KSB7XG5cdC8vIGNhbGxlZCB3aXRob3V0IGBuZXdgXG5cdGlmICghKHRoaXMgaW5zdGFuY2VvZiBET01SYW5nZSkpIHtcblx0XHRyZXR1cm4gbmV3IERPTVJhbmdlKG5vZGVBbmRSYW5nZUFycmF5KTtcblx0fVxuXG5cdHZhciBtZW1iZXJzID0gKG5vZGVBbmRSYW5nZUFycmF5IHx8IFtdKTtcblx0aWYgKCFpc0FycmF5TGlrZShtZW1iZXJzKSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgYXJyYXlcIik7XG5cblx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtZW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0dGhpcy5fbWVtYmVySW4obWVtYmVyc1tpXSk7XG5cdH1cblxuXHR0aGlzLm1lbWJlcnMgPSBtZW1iZXJzO1xuXHR0aGlzLnBsYWNlaG9sZGVyID0gbnVsbDtcblx0dGhpcy5hdHRhY2hlZCA9IGZhbHNlO1xuXHR0aGlzLnBhcmVudEVsZW1lbnQgPSBudWxsO1xuXHR0aGlzLnBhcmVudFJhbmdlID0gbnVsbDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NUmFuZ2U7XG5ET01SYW5nZS5leHRlbmQgPSByZXF1aXJlKFwiYmFja2JvbmUtZXh0ZW5kLXN0YW5kYWxvbmVcIik7XG5cbi8vIGZpbmRzIHRoZSBET01SYW5nZSB0aGUgZWxlbWVudCBpcyBhIHBhcnQgb2ZcbkRPTVJhbmdlLmZvckVsZW1lbnQgPSBmdW5jdGlvbiAoZWxlbSkge1xuXHRpZiAoZWxlbS5ub2RlVHlwZSAhPT0gMSkgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0ZWQgZWxlbWVudCwgZm91bmQ6IFwiICsgZWxlbSk7XG5cblx0dmFyIHJhbmdlID0gbnVsbDtcblxuXHR3aGlsZSAoZWxlbSAmJiAhcmFuZ2UpIHtcblx0XHRyYW5nZSA9IChlbGVtLiRkb21yYW5nZSB8fCBudWxsKTtcblx0XHRlbGVtID0gZWxlbS5wYXJlbnROb2RlO1xuXHR9XG5cblx0cmV0dXJuIHJhbmdlO1xufTtcblxuXy5leHRlbmQoRE9NUmFuZ2UucHJvdG90eXBlLCBFdmVudHMsIHtcblxuXHQvLyBUaGlzIG1ldGhvZCBpcyBjYWxsZWQgdG8gaW5zZXJ0IHRoZSBET01SYW5nZSBpbnRvIHRoZSBET00gZm9yXG5cdC8vIHRoZSBmaXJzdCB0aW1lLCBidXQgaXQncyBhbHNvIHVzZWQgaW50ZXJuYWxseSB3aGVuXG5cdC8vIHVwZGF0aW5nIHRoZSBET00uXG5cdC8vIElmIF9pc01vdmUgaXMgdHJ1ZSwgbW92ZSB0aGlzIGF0dGFjaGVkIHJhbmdlIHRvIGEgZGlmZmVyZW50XG5cdC8vIGxvY2F0aW9uIHVuZGVyIHRoZSBzYW1lIHBhcmVudEVsZW1lbnQuXG5cdGF0dGFjaDogZnVuY3Rpb24ocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUsIF9pc1JlcGxhY2UpIHtcblx0XHRpZiAodHlwZW9mIHBhcmVudEVsZW1lbnQgPT09IFwic3RyaW5nXCIpIHBhcmVudEVsZW1lbnQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKHBhcmVudEVsZW1lbnQpO1xuXHRcdGlmICh0eXBlb2YgbmV4dE5vZGUgPT09IFwic3RyaW5nXCIpIG5leHROb2RlID0gcGFyZW50LnF1ZXJ5U2VsZWN0b3IobmV4dE5vZGUpO1xuXHRcdGlmIChwYXJlbnRFbGVtZW50ID09IG51bGwpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIHZhbGlkIERPTSBlbGVtZW50IHRvIGF0dGFjaCBpbi5cIik7XG5cblx0XHRpZiAoKF9pc01vdmUgfHwgX2lzUmVwbGFjZSkgJiYgISh0aGlzLnBhcmVudEVsZW1lbnQgPT09IHBhcmVudEVsZW1lbnQgJiYgdGhpcy5hdHRhY2hlZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkNhbiBvbmx5IG1vdmUgb3IgcmVwbGFjZSBhbiBhdHRhY2hlZCBET01SYW5nZSwgYW5kIG9ubHkgdW5kZXIgdGhlIHNhbWUgcGFyZW50IGVsZW1lbnRcIik7XG5cdFx0fVxuXG5cdFx0dmFyIG1lbWJlcnMgPSB0aGlzLm1lbWJlcnM7XG5cdFx0aWYgKG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gbnVsbDtcblx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpbnNlcnRJbnRvRE9NKG1lbWJlcnNbaV0sIHBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dmFyIHBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXJOb2RlKCk7XG5cdFx0XHR0aGlzLnBsYWNlaG9sZGVyID0gcGxhY2Vob2xkZXI7XG5cdFx0XHRwYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZShwbGFjZWhvbGRlciwgbmV4dE5vZGUpO1xuXHRcdH1cblxuXHRcdHRoaXMuYXR0YWNoZWQgPSB0cnVlO1xuXHRcdHRoaXMucGFyZW50RWxlbWVudCA9IHBhcmVudEVsZW1lbnQ7XG5cblx0XHQvLyB0cmlnZ2VyIGV2ZW50cyBvbmx5IG9uIGZyZXNoIGF0dGFjaG1lbnRzXG5cdFx0aWYgKCEoX2lzTW92ZSB8fCBfaXNSZXBsYWNlKSkgdGhpcy50cmlnZ2VyKFwiYXR0YWNoXCIsIHBhcmVudEVsZW1lbnQpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZGV0YWNoOiBmdW5jdGlvbihfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKCF0aGlzLmF0dGFjaGVkKSByZXR1cm4gdGhpcztcblxuXHRcdHZhciBvbGRQYXJlbnRFbGVtZW50ID0gdGhpcy5wYXJlbnRFbGVtZW50O1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGlmIChtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0Zm9yICh2YXIgaSA9IDA7IGkgPCBtZW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdHJlbW92ZUZyb21ET00obWVtYmVyc1tpXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBwbGFjZWhvbGRlciA9IHRoaXMucGxhY2Vob2xkZXI7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQocGxhY2Vob2xkZXIpO1xuXHRcdFx0dGhpcy5wbGFjZWhvbGRlciA9IG51bGw7XG5cdFx0fVxuXG5cdFx0aWYgKCFfaXNSZXBsYWNlKSB7XG5cdFx0XHR0aGlzLmF0dGFjaGVkID0gZmFsc2U7XG5cdFx0XHR0aGlzLnBhcmVudEVsZW1lbnQgPSBudWxsO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwiZGV0YWNoXCIsIG9sZFBhcmVudEVsZW1lbnQpO1xuXHRcdH1cblx0fSxcblxuXHRmaXJzdE5vZGU6IGZ1bmN0aW9uKCkge1xuXHRcdGlmICghdGhpcy5hdHRhY2hlZCkgdGhyb3cgbmV3IEVycm9yKFwiTXVzdCBiZSBhdHRhY2hlZFwiKTtcblx0XHRpZiAoIXRoaXMubWVtYmVycy5sZW5ndGgpIHJldHVybiB0aGlzLnBsYWNlaG9sZGVyO1xuXHRcdHZhciBtID0gdGhpcy5tZW1iZXJzWzBdO1xuXHRcdHJldHVybiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSA/IG0uZmlyc3ROb2RlKCkgOiBtO1xuXHR9LFxuXG5cdGxhc3ROb2RlOiBmdW5jdGlvbigpIHtcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHRocm93IG5ldyBFcnJvcihcIk11c3QgYmUgYXR0YWNoZWRcIik7XG5cdFx0aWYgKCF0aGlzLm1lbWJlcnMubGVuZ3RoKSByZXR1cm4gdGhpcy5wbGFjZWhvbGRlcjtcblx0XHR2YXIgbSA9IHRoaXMubWVtYmVyc1t0aGlzLm1lbWJlcnMubGVuZ3RoIC0gMV07XG5cdFx0cmV0dXJuIChtIGluc3RhbmNlb2YgRE9NUmFuZ2UpID8gbS5sYXN0Tm9kZSgpIDogbTtcblx0fSxcblxuXHRnZXRNZW1iZXI6IGZ1bmN0aW9uKGF0SW5kZXgpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblx0XHRpZiAoIShhdEluZGV4ID49IDAgJiYgYXRJbmRleCA8IG1lbWJlcnMubGVuZ3RoKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIGluZGV4IGluIHJhbmdlLmdldE1lbWJlcjogXCIgKyBhdEluZGV4KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMubWVtYmVyc1thdEluZGV4XTtcblx0fSxcblxuXHQvLyByZXNldHMgdGhlIERPTVJhbmdlIHdpdGggbmV3IGNvbnRlbnRcblx0c2V0TWVtYmVyczogZnVuY3Rpb24obmV3Tm9kZUFuZFJhbmdlQXJyYXkpIHtcblx0XHR2YXIgbmV3TWVtYmVycyA9IG5ld05vZGVBbmRSYW5nZUFycmF5O1xuXHRcdGlmICghaXNBcnJheUxpa2UobmV3TWVtYmVycykpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGFycmF5XCIpO1xuXHRcdHZhciBvbGRNZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdHZhciBfaXNSZXBsYWNlID0gdGhpcy5hdHRhY2hlZCAmJiAobmV3TWVtYmVycy5sZW5ndGggfHwgb2xkTWVtYmVycy5sZW5ndGgpO1xuXG5cdFx0Ly8gZGVyZWZlcmVuY2Ugb2xkIG1lbWJlcnNcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG9sZE1lbWJlcnMubGVuZ3RoOyBpKyspIHRoaXMuX21lbWJlck91dChvbGRNZW1iZXJzW2ldLCBmYWxzZSwgX2lzUmVwbGFjZSk7XG5cblx0XHQvLyByZWZlcmVuY2UgbmV3IG1lbWJlcnNcblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IG5ld01lbWJlcnMubGVuZ3RoOyBpKyspIHRoaXMuX21lbWJlckluKG5ld01lbWJlcnNbaV0pO1xuXG5cdFx0aWYgKF9pc1JlcGxhY2UpIHtcblx0XHRcdC8vIGRldGFjaCB0aGUgb2xkIG1lbWJlcnMgYW5kIGluc2VydCB0aGUgbmV3IG1lbWJlcnNcblx0XHRcdHZhciBuZXh0Tm9kZSA9IHRoaXMubGFzdE5vZGUoKS5uZXh0U2libGluZztcblx0XHRcdHZhciBwYXJlbnRFbGVtZW50ID0gdGhpcy5wYXJlbnRFbGVtZW50O1xuXHRcdFx0Ly8gVXNlIGRldGFjaC9hdHRhY2gsIGJ1dCBkb24ndCB0cmlnZ2VyIGV2ZW50c1xuXHRcdFx0dGhpcy5kZXRhY2godHJ1ZSAvKl9pc1JlcGxhY2UqLyk7XG5cdFx0XHR0aGlzLm1lbWJlcnMgPSBuZXdNZW1iZXJzO1xuXHRcdFx0dGhpcy5hdHRhY2gocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIGZhbHNlLCB0cnVlIC8qX2lzUmVwbGFjZSovKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gZG9uJ3QgZG8gYW55dGhpbmcgaWYgd2UncmUgZ29pbmcgZnJvbSBlbXB0eSB0byBlbXB0eVxuXHRcdFx0dGhpcy5tZW1iZXJzID0gbmV3TWVtYmVycztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhZGRNZW1iZXI6IGZ1bmN0aW9uKG5ld01lbWJlciwgYXRJbmRleCwgX2lzTW92ZSkge1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXG5cdFx0Ly8gdmFsaWRhdGUgdGhlIGluZGV4XG5cdFx0aWYgKHR5cGVvZiBhdEluZGV4ICE9PSBcIm51bWJlclwiIHx8IGlzTmFOKGF0SW5kZXgpIHx8XG5cdFx0XHRhdEluZGV4IDwgMCB8fCBhdEluZGV4ID4gbWVtYmVycy5sZW5ndGgpIHtcblx0XHRcdGF0SW5kZXggPSBtZW1iZXJzLmxlbmd0aDtcblx0XHR9XG5cblx0XHQvLyBhZGQgcmVmZXJlbmNlcyB0byB0aGUgbmV3IG1lbWJlclxuXHRcdGlmICghX2lzTW92ZSkgdGhpcy5fbWVtYmVySW4obmV3TWVtYmVyKTtcblxuXHRcdC8vIGN1cnJlbnRseSBkZXRhY2hlZDsganVzdCB1cGRhdGVkIG1lbWJlcnNcblx0XHRpZiAoIXRoaXMuYXR0YWNoZWQpIHtcblx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDAsIG5ld01lbWJlcik7XG5cdFx0fVxuXG5cdFx0Ly8gZW1wdHk7IHVzZSB0aGUgZW1wdHktdG8tbm9uZW1wdHkgaGFuZGxpbmcgb2Ygc2V0TWVtYmVyc1xuXHRcdGVsc2UgaWYgKG1lbWJlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnNldE1lbWJlcnMoWyBuZXdNZW1iZXIgXSk7XG5cdFx0fVxuXG5cdFx0Ly8gb3RoZXJ3aXNlIGFkZCBhdCBsb2NhdGlvblxuXHRcdGVsc2Uge1xuXHRcdFx0dmFyIG5leHROb2RlO1xuXHRcdFx0aWYgKGF0SW5kZXggPT09IG1lbWJlcnMubGVuZ3RoKSB7XG5cdFx0XHRcdC8vIGluc2VydCBhdCBlbmRcblx0XHRcdFx0bmV4dE5vZGUgPSB0aGlzLmxhc3ROb2RlKCkubmV4dFNpYmxpbmc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgbSA9IG1lbWJlcnNbYXRJbmRleF07XG5cdFx0XHRcdG5leHROb2RlID0gKG0gaW5zdGFuY2VvZiBET01SYW5nZSkgPyBtLmZpcnN0Tm9kZSgpIDogbTtcblx0XHRcdH1cblxuXHRcdFx0bWVtYmVycy5zcGxpY2UoYXRJbmRleCwgMCwgbmV3TWVtYmVyKTtcblx0XHRcdGluc2VydEludG9ET00obmV3TWVtYmVyLCB0aGlzLnBhcmVudEVsZW1lbnQsIG5leHROb2RlLCBfaXNNb3ZlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRyZW1vdmVNZW1iZXI6IGZ1bmN0aW9uKGF0SW5kZXgsIF9pc01vdmUpIHtcblx0XHR2YXIgbWVtYmVycyA9IHRoaXMubWVtYmVycztcblxuXHRcdC8vIGFsc28gYWNjZXB0cyB0aGUgbWVtYmVyIHRvIHJlbW92ZVxuXHRcdGlmICh0eXBlb2YgYXRJbmRleCAhPT0gXCJudW1iZXJcIiB8fCBpc05hTihhdEluZGV4KSkge1xuXHRcdFx0YXRJbmRleCA9IHRoaXMuaW5kZXhPZihhdEluZGV4KTtcblx0XHR9XG5cblx0XHQvLyB2YWxpZGF0ZSB0aGUgaW5kZXhcblx0XHRpZiAoYXRJbmRleCA8IDAgfHwgYXRJbmRleCA+PSBtZW1iZXJzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiQmFkIGluZGV4IGluIHJhbmdlLnJlbW92ZU1lbWJlcjogXCIgKyBhdEluZGV4KTtcblx0XHR9XG5cblx0XHRpZiAoX2lzTW92ZSkge1xuXHRcdFx0bWVtYmVycy5zcGxpY2UoYXRJbmRleCwgMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHZhciBvbGRNZW1iZXIgPSBtZW1iZXJzW2F0SW5kZXhdO1xuXG5cdFx0XHRpZiAobWVtYmVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0Ly8gYmVjb21pbmcgZW1wdHk7IHVzZSB0aGUgbG9naWMgaW4gc2V0TWVtYmVyc1xuXHRcdFx0XHR0aGlzLnNldE1lbWJlcnMoW10pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fbWVtYmVyT3V0KG9sZE1lbWJlcik7XG5cdFx0XHRcdG1lbWJlcnMuc3BsaWNlKGF0SW5kZXgsIDEpO1xuXHRcdFx0XHRpZiAodGhpcy5hdHRhY2hlZCkgcmVtb3ZlRnJvbURPTShvbGRNZW1iZXIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdG1vdmVNZW1iZXI6IGZ1bmN0aW9uKG9sZEluZGV4LCBuZXdJbmRleCkge1xuXHRcdHZhciBtZW1iZXIgPSB0aGlzLm1lbWJlcnNbb2xkSW5kZXhdO1xuXHRcdHRoaXMucmVtb3ZlTWVtYmVyKG9sZEluZGV4LCB0cnVlIC8qX2lzTW92ZSovKTtcblx0XHR0aGlzLmFkZE1lbWJlcihtZW1iZXIsIG5ld0luZGV4LCB0cnVlIC8qX2lzTW92ZSovKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRpbmRleE9mOiBmdW5jdGlvbihtZW1iZXIpIHtcblx0XHRyZXR1cm4gdGhpcy5tZW1iZXJzLmluZGV4T2YobWVtYmVyKTtcblx0fSxcblxuXHRjb250YWluczogZnVuY3Rpb24obWVtYmVyKSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5kZXhPZihtZW1iZXIpID4gLTE7XG5cdH0sXG5cblx0X21lbWJlckluOiBmdW5jdGlvbihtKSB7XG5cdFx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0bS5wYXJlbnRSYW5nZSA9IHRoaXM7XG5cdFx0fSBlbHNlIGlmIChtLm5vZGVUeXBlID09PSAxKSB7IC8vIERPTSBFbGVtZW50XG5cdFx0XHRtLiRkb21yYW5nZSA9IHRoaXM7XG5cdFx0fVxuXHR9LFxuXG5cdF9tZW1iZXJPdXQ6IGZ1bmN0aW9uIChtLCBfc2tpcE5vZGVzLCBfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKG0gaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0aWYgKF9pc1JlcGxhY2UpIG0uZGVzdHJveU1lbWJlcnMoX3NraXBOb2RlcywgX2lzUmVwbGFjZSk7XG5cdFx0XHRlbHNlIG0uZGVzdHJveShfc2tpcE5vZGVzKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmICghX3NraXBOb2RlcyAmJiBtLm5vZGVUeXBlID09PSAxICYmIG0uJGRvbXJhbmdlKSB7XG5cdFx0XHRtLiRkb21yYW5nZSA9IG51bGw7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIFRlYXIgZG93biwgYnV0IGRvbid0IHJlbW92ZSwgdGhlIG1lbWJlcnMuICBVc2VkIHdoZW4gY2h1bmtzXG5cdC8vIG9mIERPTSBhcmUgYmVpbmcgdG9ybiBkb3duIG9yIHJlcGxhY2VkLlxuXHRkZXN0cm95TWVtYmVyczogZnVuY3Rpb24oX3NraXBOb2RlcywgX2lzUmVwbGFjZSkge1xuXHRcdHZhciBtZW1iZXJzID0gdGhpcy5tZW1iZXJzO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbWVtYmVycy5sZW5ndGg7IGkrKykge1xuXHRcdFx0dGhpcy5fbWVtYmVyT3V0KG1lbWJlcnNbaV0sIF9za2lwTm9kZXMsIF9pc1JlcGxhY2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRkZXN0cm95OiBmdW5jdGlvbihfc2tpcE5vZGVzKSB7XG5cdFx0dGhpcy5kZXRhY2goKTtcblx0XHR0aGlzLnRyaWdnZXIoXCJkZXN0cm95XCIsIF9za2lwTm9kZXMpO1xuXHRcdHRoaXMuZGVzdHJveU1lbWJlcnMoX3NraXBOb2Rlcyk7XG5cdFx0dGhpcy5tZW1iZXJzID0gW107XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0ZmluZEFsbDogZnVuY3Rpb24oc2VsZWN0b3IpIHtcblx0XHR2YXIgbWF0Y2hlcyA9IFtdLFxuXHRcdFx0ZWw7XG5cblx0XHRmb3IgKHZhciBpIGluIHRoaXMubWVtYmVycykge1xuXHRcdFx0ZWwgPSB0aGlzLm1lbWJlcnNbaV07XG5cdFx0XHRpZiAoZWwgaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0XHRtYXRjaGVzLnB1c2guYXBwbHkobWF0Y2hlcywgZWwuZmluZEFsbChzZWxlY3RvcikpO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgZWwucXVlcnlTZWxlY3RvckFsbCA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRcdGlmIChlbC5ub2RlVHlwZSA9PT0gMSAmJiBtYXRjaGVzU2VsZWN0b3IoZWwsIHNlbGVjdG9yKSkgbWF0Y2hlcy5wdXNoKGVsKTtcblx0XHRcdFx0bWF0Y2hlcy5wdXNoLmFwcGx5KG1hdGNoZXMsIGVsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbWF0Y2hlc1xuXHR9LFxuXG5cdGZpbmQ6IGZ1bmN0aW9uKHNlbGVjdG9yKSB7XG5cdFx0dmFyIGVsLCByZXM7XG5cblx0XHRmb3IgKHZhciBpIGluIHRoaXMubWVtYmVycykge1xuXHRcdFx0ZWwgPSB0aGlzLm1lbWJlcnNbaV07XG5cdFx0XHRpZiAoZWwgaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0XHRyZXMgPSBlbC5maW5kKHNlbGVjdG9yKTtcblx0XHRcdH0gZWxzZSBpZiAoZWwubm9kZVR5cGUgPT09IDEgJiYgbWF0Y2hlc1NlbGVjdG9yKGVsLCBzZWxlY3RvcikpIHtcblx0XHRcdFx0cmVzID0gZWw7XG5cdFx0XHR9IGVsc2UgaWYgKHR5cGVvZiBlbC5xdWVyeVNlbGVjdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0cmVzID0gZWwucXVlcnlTZWxlY3RvcihzZWxlY3Rvcik7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXMgIT0gbnVsbCkgcmV0dXJuIHJlcztcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG59KTtcblxuLy8gSW4gSUUgOCwgZG9uJ3QgdXNlIGVtcHR5IHRleHQgbm9kZXMgYXMgcGxhY2Vob2xkZXJzXG4vLyBpbiBlbXB0eSBET01SYW5nZXMsIHVzZSBjb21tZW50IG5vZGVzIGluc3RlYWQuICBVc2luZ1xuLy8gZW1wdHkgdGV4dCBub2RlcyBpbiBtb2Rlcm4gYnJvd3NlcnMgaXMgZ3JlYXQgYmVjYXVzZVxuLy8gaXQgZG9lc24ndCBjbHV0dGVyIHRoZSB3ZWIgaW5zcGVjdG9yLiAgSW4gSUUgOCwgaG93ZXZlcixcbi8vIGl0IHNlZW1zIHRvIGxlYWQgaW4gc29tZSByb3VuZGFib3V0IHdheSB0byB0aGUgT0F1dGhcbi8vIHBvcC11cCBjcmFzaGluZyB0aGUgYnJvd3NlciBjb21wbGV0ZWx5LiAgSW4gdGhlIHBhc3QsXG4vLyB3ZSBkaWRuJ3QgdXNlIGVtcHR5IHRleHQgbm9kZXMgb24gSUUgOCBiZWNhdXNlIHRoZXlcbi8vIGRvbid0IGFjY2VwdCBKUyBwcm9wZXJ0aWVzLCBzbyBqdXN0IHVzZSB0aGUgc2FtZSBsb2dpY1xuLy8gZXZlbiB0aG91Z2ggd2UgZG9uJ3QgbmVlZCB0byBzZXQgcHJvcGVydGllcyBvbiB0aGVcbi8vIHBsYWNlaG9sZGVyIGFueW1vcmUuXG52YXIgVVNFX0NPTU1FTlRfUExBQ0VIT0xERVJTID0gKGZ1bmN0aW9uICgpIHtcblx0dmFyIHJlc3VsdCA9IGZhbHNlO1xuXHR2YXIgdGV4dE5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcblx0dHJ5IHtcblx0XHR0ZXh0Tm9kZS5zb21lUHJvcCA9IHRydWU7XG5cdH0gY2F0Y2ggKGUpIHtcblx0XHQvLyBJRSA4XG5cdFx0cmVzdWx0ID0gdHJ1ZTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufSkoKTtcblxuZnVuY3Rpb24gcGxhY2Vob2xkZXJOb2RlKCkge1xuXHRyZXR1cm4gVVNFX0NPTU1FTlRfUExBQ0VIT0xERVJTID9cblx0XHRkb2N1bWVudC5jcmVhdGVDb21tZW50KFwiXCIpIDpcblx0XHRkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShcIlwiKTtcbn1cblxuLy8gcHJpdmF0ZSBtZXRob2RzXG5mdW5jdGlvbiBpbnNlcnRJbnRvRE9NKHJhbmdlT3JOb2RlLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSwgX2lzTW92ZSkge1xuXHR2YXIgbSA9IHJhbmdlT3JOb2RlO1xuXHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0bS5hdHRhY2gocGFyZW50RWxlbWVudCwgbmV4dE5vZGUsIF9pc01vdmUpO1xuXHR9IGVsc2Uge1xuXHRcdGlmIChfaXNNb3ZlKSB7XG5cdFx0XHRtb3ZlTm9kZVdpdGhIb29rcyhtLCBwYXJlbnRFbGVtZW50LCBuZXh0Tm9kZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGluc2VydE5vZGVXaXRoSG9va3MobSwgcGFyZW50RWxlbWVudCwgbmV4dE5vZGUpO1xuXHRcdH1cblx0fVxufTtcblxuZnVuY3Rpb24gcmVtb3ZlRnJvbURPTShyYW5nZU9yTm9kZSkge1xuXHR2YXIgbSA9IHJhbmdlT3JOb2RlO1xuXHRpZiAobSBpbnN0YW5jZW9mIERPTVJhbmdlKSB7XG5cdFx0bS5kZXRhY2goKTtcblx0fSBlbHNlIHtcblx0XHRyZW1vdmVOb2RlV2l0aEhvb2tzKG0pO1xuXHR9XG59O1xuXG5mdW5jdGlvbiByZW1vdmVOb2RlV2l0aEhvb2tzKG4pIHtcblx0aWYgKCFuLnBhcmVudE5vZGUpIHJldHVybjtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgbi5wYXJlbnROb2RlLl91aWhvb2tzICYmIG4ucGFyZW50Tm9kZS5fdWlob29rcy5yZW1vdmVFbGVtZW50KSB7XG5cdFx0bi5wYXJlbnROb2RlLl91aWhvb2tzLnJlbW92ZUVsZW1lbnQobik7XG5cdH0gZWxzZSB7XG5cdFx0bi5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG4pO1xuXHR9XG59O1xuXG5mdW5jdGlvbiBpbnNlcnROb2RlV2l0aEhvb2tzKG4sIHBhcmVudCwgbmV4dCkge1xuXHQvLyBgfHwgbnVsbGAgYmVjYXVzZSBJRSB0aHJvd3MgYW4gZXJyb3IgaWYgJ25leHQnIGlzIHVuZGVmaW5lZFxuXHRuZXh0ID0gbmV4dCB8fCBudWxsO1xuXHRpZiAobi5ub2RlVHlwZSA9PT0gMSAmJiBwYXJlbnQuX3VpaG9va3MgJiYgcGFyZW50Ll91aWhvb2tzLmluc2VydEVsZW1lbnQpIHtcblx0XHRwYXJlbnQuX3VpaG9va3MuaW5zZXJ0RWxlbWVudChuLCBuZXh0KTtcblx0fSBlbHNlIHtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG4sIG5leHQpO1xuXHR9XG59O1xuXG5mdW5jdGlvbiBtb3ZlTm9kZVdpdGhIb29rcyhuLCBwYXJlbnQsIG5leHQpIHtcblx0aWYgKG4ucGFyZW50Tm9kZSAhPT0gcGFyZW50KVxuXHRcdHJldHVybjtcblx0Ly8gYHx8IG51bGxgIGJlY2F1c2UgSUUgdGhyb3dzIGFuIGVycm9yIGlmICduZXh0JyBpcyB1bmRlZmluZWRcblx0bmV4dCA9IG5leHQgfHwgbnVsbDtcblx0aWYgKG4ubm9kZVR5cGUgPT09IDEgJiYgcGFyZW50Ll91aWhvb2tzICYmIHBhcmVudC5fdWlob29rcy5tb3ZlRWxlbWVudCkge1xuXHRcdHBhcmVudC5fdWlob29rcy5tb3ZlRWxlbWVudChuLCBuZXh0KTtcblx0fSBlbHNlIHtcblx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG4sIG5leHQpO1xuXHR9XG59O1xuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIHBhcnNlID0gcmVxdWlyZShcIi4vbSt4bWxcIikucGFyc2U7XG52YXIgTk9ERV9UWVBFID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5cbi8vIHByb3BlcnRpZXMgdGhhdCBOb2RlLmpzIGFuZCB0aGUgYnJvd3NlciBjYW4gaGFuZGxlXG52YXIgVGVtcGxlID0gbW9kdWxlLmV4cG9ydHMgPSB7XG5cdFZFUlNJT046IFwiMC41LjEwXCIsXG5cdE5PREVfVFlQRTogTk9ERV9UWVBFLFxuXG5cdC8vIG90aGVyIHBhcnRzXG5cdHV0aWxzOiByZXF1aXJlKFwiLi91dGlsc1wiKSxcblx0TW9kZWw6IHJlcXVpcmUoXCIuL21vZGVsXCIpLFxuXG5cdC8vIHRyYWNrciBzaG9ydCBwb2ludGVyc1xuXHRUcmFja3I6IFRyYWNrcixcblx0RGVwZW5kZW5jeTogVHJhY2tyLkRlcGVuZGVuY3ksXG5cdGF1dG9ydW46IFRyYWNrci5hdXRvcnVuLFxuXHR0cmFjazogcmVxdWlyZShcInRyYWNrci1vYmplY3RzXCIpLFxuXG5cdC8vIGFsbCB0aGUgcGFyc2VycywgZGVjbGFyZWQgaGVyZSBmb3IgZWFzaWVyIGFjY2Vzc1xuXHRwYXJzZTogcGFyc2UsXG5cdHBhcnNlUGF0aDogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwicGF0aFwiIH0pKTtcblx0fSxcblx0cGFyc2VQYXRoUXVlcnk6IGZ1bmN0aW9uKHMsIG9wdHMpIHtcblx0XHRyZXR1cm4gcGFyc2UocywgXy5leHRlbmQoe30sIG9wdHMsIHsgc3RhcnRSdWxlOiBcInBhdGhRdWVyeVwiIH0pKTtcblx0fSxcblx0cGFyc2VBdHRyaWJ1dGVWYWx1ZTogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwiYXR0clZhbHVlXCIgfSkpO1xuXHR9LFxuXHRwYXJzZUFyZ3VtZW50czogZnVuY3Rpb24ocywgb3B0cykge1xuXHRcdHJldHVybiBwYXJzZShzLCBfLmV4dGVuZCh7fSwgb3B0cywgeyBzdGFydFJ1bGU6IFwiYXR0ckFyZ3VtZW50c1wiIH0pKTtcblx0fSxcblxuXHQvLyBjb252ZXJ0cyByYXcgaHRtbCBzdHIgdG8gdGVtcGxhdGUgdHJlZVxuXHRwYXJzZUhUTUw6IGZ1bmN0aW9uKHN0cikge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBOT0RFX1RZUEUuUk9PVCxcblx0XHRcdGNoaWxkcmVuOiBbIHtcblx0XHRcdFx0dHlwZTogTk9ERV9UWVBFLkhUTUwsXG5cdFx0XHRcdHZhbHVlOiBzdHJcblx0XHRcdH0gXSxcblx0XHRcdHZlcnNpb246IFRlbXBsZS5WRVJTSU9OXG5cdFx0fTtcblx0fVxufTtcblxuLy8gbm8gbmVlZCBmb3Igbm9kZSBqcyB0byBodXJ0IGl0c2VsZiBvbiBhbnkgaGFyZCBlZGdlc1xuaWYgKHR5cGVvZiBkb2N1bWVudCA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXG4vLyBhdHRhY2ggdGhlIG90aGVyIHBhcnRzIHRoYXQgTm9kZSBjYW4ndCB1c2VcblRlbXBsZS5ET01SYW5nZSA9IHJlcXVpcmUoXCIuL2RvbXJhbmdlXCIpO1xuVGVtcGxlLlZpZXcgPSByZXF1aXJlKFwiLi92aWV3XCIpO1xuVGVtcGxlLlNlY3Rpb24gPSByZXF1aXJlKFwiLi9zZWN0aW9uXCIpO1xuXG4vLyBsb2FkIHRoZSByZWFsIGNsYXNzIGZvciB0aGUgYnJvd3NlclxuVGVtcGxlID0gbW9kdWxlLmV4cG9ydHMgPSBfLmV4dGVuZChyZXF1aXJlKFwiLi9tdXN0YWNoZVwiKSwgVGVtcGxlKTtcblxuLy8gbG9hZCB0aGUgcGx1Z2luIEFQSVxuXy5leHRlbmQoVGVtcGxlLCByZXF1aXJlKFwiLi9wbHVnaW5zXCIpKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gKGZ1bmN0aW9uKCkge1xuICAvKlxuICAgKiBHZW5lcmF0ZWQgYnkgUEVHLmpzIDAuOC4wLlxuICAgKlxuICAgKiBodHRwOi8vcGVnanMubWFqZGEuY3ovXG4gICAqL1xuXG4gIGZ1bmN0aW9uIHBlZyRzdWJjbGFzcyhjaGlsZCwgcGFyZW50KSB7XG4gICAgZnVuY3Rpb24gY3RvcigpIHsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9XG4gICAgY3Rvci5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuICAgIGNoaWxkLnByb3RvdHlwZSA9IG5ldyBjdG9yKCk7XG4gIH1cblxuICBmdW5jdGlvbiBTeW50YXhFcnJvcihtZXNzYWdlLCBleHBlY3RlZCwgZm91bmQsIG9mZnNldCwgbGluZSwgY29sdW1uKSB7XG4gICAgdGhpcy5tZXNzYWdlICA9IG1lc3NhZ2U7XG4gICAgdGhpcy5leHBlY3RlZCA9IGV4cGVjdGVkO1xuICAgIHRoaXMuZm91bmQgICAgPSBmb3VuZDtcbiAgICB0aGlzLm9mZnNldCAgID0gb2Zmc2V0O1xuICAgIHRoaXMubGluZSAgICAgPSBsaW5lO1xuICAgIHRoaXMuY29sdW1uICAgPSBjb2x1bW47XG5cbiAgICB0aGlzLm5hbWUgICAgID0gXCJTeW50YXhFcnJvclwiO1xuICB9XG5cbiAgcGVnJHN1YmNsYXNzKFN5bnRheEVycm9yLCBFcnJvcik7XG5cbiAgZnVuY3Rpb24gcGFyc2UoaW5wdXQpIHtcbiAgICB2YXIgb3B0aW9ucyA9IGFyZ3VtZW50cy5sZW5ndGggPiAxID8gYXJndW1lbnRzWzFdIDoge30sXG5cbiAgICAgICAgcGVnJEZBSUxFRCA9IHt9LFxuXG4gICAgICAgIHBlZyRzdGFydFJ1bGVJbmRpY2VzID0geyBzdGFydDogMCwgYXR0clZhbHVlOiA5LCBhdHRyQXJndW1lbnRzOiAxMCwgcGF0aFF1ZXJ5OiAxOSwgcGF0aDogMjEgfSxcbiAgICAgICAgcGVnJHN0YXJ0UnVsZUluZGV4ICAgPSAwLFxuXG4gICAgICAgIHBlZyRjb25zdHMgPSBbXG4gICAgICAgICAgZnVuY3Rpb24oaHRtbCkge1xuICAgICAgICAgIFx0cmV0dXJuIHtcbiAgICAgICAgICBcdFx0dHlwZTogTk9ERV9UWVBFLlJPT1QsXG4gICAgICAgICAgXHRcdGNoaWxkcmVuOiBodG1sLFxuICAgICAgICAgIFx0XHR2ZXJzaW9uOiBNdXN0YWNoZS5WRVJTSU9OXG4gICAgICAgICAgXHR9XG4gICAgICAgICAgfSxcbiAgICAgICAgICBbXSxcbiAgICAgICAgICBmdW5jdGlvbihub2RlcykgeyByZXR1cm4gXy5jb21wYWN0KG5vZGVzKTsgfSxcbiAgICAgICAgICBwZWckRkFJTEVELFxuICAgICAgICAgIC9eW148e10vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXjx7XVwiLCBkZXNjcmlwdGlvbjogXCJbXjx7XVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odGV4dCkgeyByZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuVEVYVCwgdmFsdWU6IHRleHQuam9pbihcIlwiKSB9OyB9LFxuICAgICAgICAgIFwiPCEtLVwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIjwhLS1cIiwgZGVzY3JpcHRpb246IFwiXFxcIjwhLS1cXFwiXCIgfSxcbiAgICAgICAgICB2b2lkIDAsXG4gICAgICAgICAgXCItLT5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCItLT5cIiwgZGVzY3JpcHRpb246IFwiXFxcIi0tPlxcXCJcIiB9LFxuICAgICAgICAgIHsgdHlwZTogXCJhbnlcIiwgZGVzY3JpcHRpb246IFwiYW55IGNoYXJhY3RlclwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24odikge1xuICAgICAgICAgIFx0XHRyZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuWENPTU1FTlQsIHZhbHVlOiB2IH07XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIGZ1bmN0aW9uKHN0YXJ0LCBub2RlcywgZW5kKSB7XG4gICAgICAgICAgXHRcdGlmIChzdGFydC5uYW1lLnRvTG93ZXJDYXNlKCkgIT09IGVuZC50b0xvd2VyQ2FzZSgpKSB7XG4gICAgICAgICAgXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiRWxlbWVudCB0YWcgbWlzbWF0Y2g6IFwiICsgc3RhcnQubmFtZSArIFwiICE9PSBcIiArIGVuZCk7XG4gICAgICAgICAgXHRcdH1cblxuICAgICAgICAgIFx0XHRzdGFydC50eXBlID0gTk9ERV9UWVBFLkVMRU1FTlQ7XG4gICAgICAgICAgXHRcdHN0YXJ0LmNoaWxkcmVuID0gbm9kZXM7XG4gICAgICAgICAgXHRcdHJldHVybiBzdGFydDtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCI8XCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiPFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiPFxcXCJcIiB9LFxuICAgICAgICAgIFwiLz5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIvPlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLz5cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0YWduYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0bmFtZTogdGFnbmFtZSxcbiAgICAgICAgICBcdFx0XHR0eXBlOiBOT0RFX1RZUEUuRUxFTUVOVCxcbiAgICAgICAgICBcdFx0XHRhdHRyaWJ1dGVzOiBhdHRyaWJ1dGVzLFxuICAgICAgICAgIFx0XHRcdGNoaWxkcmVuOiBbXVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIFwiPlwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIj5cIiwgZGVzY3JpcHRpb246IFwiXFxcIj5cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0YWduYW1lLCBhdHRyaWJ1dGVzKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7IG5hbWU6IHRhZ25hbWUsIGF0dHJpYnV0ZXM6IGF0dHJpYnV0ZXMgfTtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCI8L1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIjwvXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI8L1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHRhZ25hbWUpIHsgcmV0dXJuIHRhZ25hbWU7IH0sXG4gICAgICAgICAgbnVsbCxcbiAgICAgICAgICBcIj1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCI9XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCI9XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHR2YWx1ZSA9IHZhbHVlICE9IG51bGwgPyB2YWx1ZVsyXSA6IFwiXCI7XG4gICAgICAgICAgXHRcdHZhciBhcmdzXG5cbiAgICAgICAgICBcdFx0Ly8gY291bGQgZmFpbCBvbiBjb21wbGV4IGF0dHJpYnV0ZXNcbiAgICAgICAgICBcdFx0dHJ5IHtcbiAgICAgICAgICBcdFx0XHRhcmdzID0gcGFyc2UodmFsdWUsICBfLmV4dGVuZCh7fSwgb3B0aW9ucywgeyBzdGFydFJ1bGU6IFwiYXR0ckFyZ3VtZW50c1wiIH0pKTtcbiAgICAgICAgICBcdFx0fSBjYXRjaChlKSB7XG4gICAgICAgICAgXHRcdFx0YXJncyA9IFt7IHR5cGU6IE5PREVfVFlQRS5MSVRFUkFMLCB2YWx1ZTogdmFsdWUgfV07XG4gICAgICAgICAgXHRcdH1cblxuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRS5BVFRSSUJVVEUsXG4gICAgICAgICAgXHRcdFx0bmFtZToga2V5LFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgICBcdFx0XHRjaGlsZHJlbjogcGFyc2UodmFsdWUsIF8uZXh0ZW5kKHt9LCBvcHRpb25zLCB7IHN0YXJ0UnVsZTogXCJhdHRyVmFsdWVcIiB9KSksXG4gICAgICAgICAgXHRcdFx0YXJndW1lbnRzOiBhcmdzXG4gICAgICAgICAgXHRcdH1cbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCIsXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiLFwiLCBkZXNjcmlwdGlvbjogXCJcXFwiLFxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGwsIHIpIHsgcmV0dXJuIFtdLmNvbmNhdChsLCBfLnBsdWNrKHIsIDEpKTsgfSxcbiAgICAgICAgICBmdW5jdGlvbih2KSB7IHJldHVybiB2LnRyaW0oKTsgfSxcbiAgICAgICAgICBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICBcdFx0aWYgKHZhbCAhPSBudWxsICYmIHZhbC50eXBlKSByZXR1cm4gdmFsO1xuICAgICAgICAgIFx0XHRyZXR1cm4geyB0eXBlOiBOT0RFX1RZUEUuTElURVJBTCwgdmFsdWU6IHZhbCB9O1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbihzdGFydCwgbm9kZXMsIGVuZCkge1xuICAgICAgICAgIFx0XHRpZiAob3B0aW9ucy5zdHJpY3QgJiYgIV8uaXNFcXVhbChzdGFydC52YWx1ZS5yYXcsIGVuZCkpIHtcbiAgICAgICAgICBcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJTZWN0aW9uIHRhZyBtaXNtYXRjaDogXCIgKyBzdGFydC52YWx1ZS5yYXcgKyBcIiAhPT0gXCIgKyBlbmQpO1xuICAgICAgICAgIFx0XHR9XG5cbiAgICAgICAgICBcdFx0c3RhcnQudmFsdWUgPSBzdGFydC52YWx1ZS5yZXN1bHQ7XG4gICAgICAgICAgXHRcdHN0YXJ0LmNoaWxkcmVuID0gbm9kZXM7XG4gICAgICAgICAgXHRcdHJldHVybiBzdGFydDtcbiAgICAgICAgICBcdH0sXG4gICAgICAgICAgXCJ7e1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ7e1xcXCJcIiB9LFxuICAgICAgICAgIC9eWyNcXF5dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiWyNcXFxcXl1cIiwgZGVzY3JpcHRpb246IFwiWyNcXFxcXl1cIiB9LFxuICAgICAgICAgIFwifX1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ9fVwiLCBkZXNjcmlwdGlvbjogXCJcXFwifX1cXFwiXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih0eXBlLCB2YWx1ZSkge1xuICAgICAgICAgIFx0XHRyZXR1cm4ge1xuICAgICAgICAgIFx0XHRcdHR5cGU6IE5PREVfVFlQRVt0eXBlID09PSBcIiNcIiA/IFwiU0VDVElPTlwiIDogXCJJTlZFUlRFRFwiXSxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcInt7L1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7L1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3svXFxcIlwiIH0sXG4gICAgICAgICAgL15bXn1dLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW159XVwiLCBkZXNjcmlwdGlvbjogXCJbXn1dXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbih2YWx1ZSkgeyByZXR1cm4gdmFsdWUuam9pbihcIlwiKTsgfSxcbiAgICAgICAgICBcInt7e1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcInt7e1wiLCBkZXNjcmlwdGlvbjogXCJcXFwie3t7XFxcIlwiIH0sXG4gICAgICAgICAgXCJ9fX1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ9fX1cIiwgZGVzY3JpcHRpb246IFwiXFxcIn19fVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLklOVEVSUE9MQVRPUixcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVbMV1cbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICAvXltcXC8jeyE+XFxeXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIltcXFxcLyN7IT5cXFxcXl1cIiwgZGVzY3JpcHRpb246IFwiW1xcXFwvI3shPlxcXFxeXVwiIH0sXG4gICAgICAgICAgXCImXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiJlwiLCBkZXNjcmlwdGlvbjogXCJcXFwiJlxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKG0sIHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogbSA/IE5PREVfVFlQRS5UUklQTEUgOiBOT0RFX1RZUEUuSU5URVJQT0xBVE9SLFxuICAgICAgICAgIFx0XHRcdHZhbHVlOiB2YWx1ZVxuICAgICAgICAgIFx0XHR9XG4gICAgICAgICAgXHR9LFxuICAgICAgICAgIGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogTk9ERV9UWVBFLlRSSVBMRSxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWVcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICAvXlshPl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbIT5dXCIsIGRlc2NyaXB0aW9uOiBcIlshPl1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKG0sIHZhbHVlKSB7XG4gICAgICAgICAgXHRcdHJldHVybiB7XG4gICAgICAgICAgXHRcdFx0dHlwZTogbSA9PT0gXCI+XCIgPyBOT0RFX1RZUEUuUEFSVElBTCA6IE5PREVfVFlQRS5NQ09NTUVOVCxcbiAgICAgICAgICBcdFx0XHR2YWx1ZTogdmFsdWUuam9pbihcIlwiKS50cmltKClcbiAgICAgICAgICBcdFx0fVxuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBcInxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ8XCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ8XFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24obSkgeyByZXR1cm4geyByYXc6IHRleHQoKSwgcmVzdWx0OiBtIH0gfSxcbiAgICAgICAgICBmdW5jdGlvbihwLCBjKSB7XG4gICAgICAgICAgXHRcdGlmIChwID09IG51bGwpIHAgPSB7IHR5cGU6IFwiYWxsXCIgfTtcbiAgICAgICAgICBcdFx0cC5wYXJ0cyA9IGM7XG4gICAgICAgICAgXHRcdHJldHVybiBwO1xuICAgICAgICAgIFx0fSxcbiAgICAgICAgICBmdW5jdGlvbihwKSB7IHAucGFydHMgPSBbXTsgcmV0dXJuIHA7IH0sXG4gICAgICAgICAgXCIuLi9cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuLi9cIiwgZGVzY3JpcHRpb246IFwiXFxcIi4uL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGQpIHsgcmV0dXJuIHsgdHlwZTogXCJwYXJlbnRcIiwgZGlzdGFuY2U6IGQubGVuZ3RoIH07IH0sXG4gICAgICAgICAgXCIuL1wiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIi4vXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4geyB0eXBlOiBcImxvY2FsXCIgfTsgfSxcbiAgICAgICAgICBcIi5cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCIuXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCIuXFxcIlwiIH0sXG4gICAgICAgICAgXCIvXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiL1wiLCBkZXNjcmlwdGlvbjogXCJcXFwiL1xcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4geyB0eXBlOiBcInJvb3RcIiB9OyB9LFxuICAgICAgICAgIC9eW2EtejAtOSRfXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05JF9daVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05JF9daVwiIH0sXG4gICAgICAgICAgL15bYS16MC05OlxcLV8kXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05OlxcXFwtXyRdaVwiLCBkZXNjcmlwdGlvbjogXCJbYS16MC05OlxcXFwtXyRdaVwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oaywgYykgeyByZXR1cm4geyBrZXk6IGssIGNoaWxkcmVuOiBjIH0gfSxcbiAgICAgICAgICBcIltcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJbXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJbXFxcIlwiIH0sXG4gICAgICAgICAgXCJdXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiXVwiLCBkZXNjcmlwdGlvbjogXCJcXFwiXVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKGMpIHsgcmV0dXJuIGM7IH0sXG4gICAgICAgICAgXCJ0cnVlXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidHJ1ZVwiLCBkZXNjcmlwdGlvbjogXCJcXFwidHJ1ZVxcXCJcIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKCkgeyByZXR1cm4gdHJ1ZTsgfSxcbiAgICAgICAgICBcImZhbHNlXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwiZmFsc2VcIiwgZGVzY3JpcHRpb246IFwiXFxcImZhbHNlXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBmYWxzZTsgfSxcbiAgICAgICAgICBcIi1cIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCItXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCItXFxcIlwiIH0sXG4gICAgICAgICAgL15bMC05XS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlswLTldXCIsIGRlc2NyaXB0aW9uOiBcIlswLTldXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHBhcnNlRmxvYXQodGV4dCgpLCAxMCk7IH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBwYXJzZUludCh0ZXh0KCksIDEwKTsgfSxcbiAgICAgICAgICBcIlxcXCJcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJcXFwiXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJcXFxcXFxcIlxcXCJcIiB9LFxuICAgICAgICAgIC9eW15cIl0vLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbXlxcXCJdXCIsIGRlc2NyaXB0aW9uOiBcIlteXFxcIl1cIiB9LFxuICAgICAgICAgIGZ1bmN0aW9uKHYpIHsgcmV0dXJuIHYuam9pbihcIlwiKTsgfSxcbiAgICAgICAgICBcIidcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCInXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCInXFxcIlwiIH0sXG4gICAgICAgICAgL15bXiddLyxcbiAgICAgICAgICB7IHR5cGU6IFwiY2xhc3NcIiwgdmFsdWU6IFwiW14nXVwiLCBkZXNjcmlwdGlvbjogXCJbXiddXCIgfSxcbiAgICAgICAgICBcIm51bGxcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJudWxsXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJudWxsXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oKSB7IHJldHVybiBudWxsOyB9LFxuICAgICAgICAgIFwidW5kZWZpbmVkXCIsXG4gICAgICAgICAgeyB0eXBlOiBcImxpdGVyYWxcIiwgdmFsdWU6IFwidW5kZWZpbmVkXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ1bmRlZmluZWRcXFwiXCIgfSxcbiAgICAgICAgICBcInZvaWRcIixcbiAgICAgICAgICB7IHR5cGU6IFwibGl0ZXJhbFwiLCB2YWx1ZTogXCJ2b2lkXCIsIGRlc2NyaXB0aW9uOiBcIlxcXCJ2b2lkXFxcIlwiIH0sXG4gICAgICAgICAgL15bLDsgXFx0XFxuXFxyXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlssOyBcXFxcdFxcXFxuXFxcXHJdXCIsIGRlc2NyaXB0aW9uOiBcIlssOyBcXFxcdFxcXFxuXFxcXHJdXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbigpIHsgcmV0dXJuIHZvaWQgMDsgfSxcbiAgICAgICAgICAvXlthLXowLTlfXFwtXS9pLFxuICAgICAgICAgIHsgdHlwZTogXCJjbGFzc1wiLCB2YWx1ZTogXCJbYS16MC05X1xcXFwtXWlcIiwgZGVzY3JpcHRpb246IFwiW2EtejAtOV9cXFxcLV1pXCIgfSxcbiAgICAgICAgICBmdW5jdGlvbihrKSB7IHJldHVybiBrOyB9LFxuICAgICAgICAgIHsgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogXCJ3aGl0ZXNwYWNlXCIgfSxcbiAgICAgICAgICAvXlsgXFx0XFxuXFxyXS8sXG4gICAgICAgICAgeyB0eXBlOiBcImNsYXNzXCIsIHZhbHVlOiBcIlsgXFxcXHRcXFxcblxcXFxyXVwiLCBkZXNjcmlwdGlvbjogXCJbIFxcXFx0XFxcXG5cXFxccl1cIiB9LFxuICAgICAgICAgIHsgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogXCJndWFyYW50ZWVkIHdoaXRlc3BhY2VcIiB9LFxuICAgICAgICAgIFwiXFxcXFwiLFxuICAgICAgICAgIHsgdHlwZTogXCJsaXRlcmFsXCIsIHZhbHVlOiBcIlxcXFxcIiwgZGVzY3JpcHRpb246IFwiXFxcIlxcXFxcXFxcXFxcIlwiIH0sXG4gICAgICAgICAgZnVuY3Rpb24oY2hhcikgeyByZXR1cm4gY2hhcjsgfVxuICAgICAgICBdLFxuXG4gICAgICAgIHBlZyRieXRlY29kZSA9IFtcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITchKycgNCE2ICEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITcsKkEgXFxcIjcyKjsgXFxcIjcwKjUgXFxcIjcxKi8gXFxcIjcjKikgXFxcIjckKiMgXFxcIjdcXFwiLEcmNywqQSBcXFwiNzIqOyBcXFwiNzAqNSBcXFwiNzEqLyBcXFwiNyMqKSBcXFwiNyQqIyBcXFwiN1xcXCJcXFwiKycgNCE2XFxcIiEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITAkXFxcIlxcXCIxITMlKywkLCkmMCRcXFwiXFxcIjEhMyVcXFwiXFxcIlxcXCIgIysnIDQhNiYhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLidcXFwiXFxcIjInMygrXFx4QUMkISAhISE4LipcXFwiXFxcIjIqMys5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLFEmISE4LipcXFwiXFxcIjIqMys5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIishICglKzglLipcXFwiXFxcIjIqMysrKCU0IzYtIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCI3JSpJIFxcXCIhNyYrPiQ3ISs0JTcnKyolNCM2LiMjXFxcIiEgJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLi9cXFwiXFxcIjIvMzArVSQ3QCtLJSAhNygsIyY3KFxcXCIrOSUuMVxcXCJcXFwiMjEzMispJTQkNjMkXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuL1xcXCJcXFwiMi8zMCtVJDdAK0slICE3KCwjJjcoXFxcIis5JS40XFxcIlxcXCIyNDM1KyklNCQ2NiRcXFwiXFxcIiElJCQjICMkIyMgIyRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiIS43XFxcIlxcXCIyNzM4K0IkN0ArOCUuNFxcXCJcXFwiMjQzNSsoJTQjNjkjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QCtoJCEuO1xcXCJcXFwiMjszPCtBJDdBKzclNz0rLSU3QSsjJSckJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICMqIyBcXFwiIDorKSU0XFxcIjY9XFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEgITcsKjUgXFxcIjcyKi8gXFxcIjcwKikgXFxcIjcxKiMgXFxcIjdcXFwiLDsmNywqNSBcXFwiNzIqLyBcXFwiNzAqKSBcXFwiNzEqIyBcXFwiN1xcXCJcXFwiKycgNCE2XFxcIiEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3KytxJCAhIS4+XFxcIlxcXCIyPjM/Ky0kNysrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsPiYhLj5cXFwiXFxcIjI+Mz8rLSQ3KysjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrKSU0XFxcIjZAXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QStcXHhENiQ3LypcXHhCNyBcXFwiNz0qXFx4QjEgXFxcIjc6KlxceEFCIFxcXCI3OypcXHhBNSBcXFwiNz4qXFx4OUYgXFxcIjc/KlxceDk5IFxcXCIhISAhISE4Lj5cXFwiXFxcIjI+Mz85KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjLFEmISE4Lj5cXFwiXFxcIjI+Mz85KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIishICglKycgNCE2QSEhICUrMiU3QSsoJTQjNkIjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3LSs+JDchKzQlNy4rKiU0IzZDIyNcXFwiISAlJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuRFxcXCJcXFwiMkQzRStTJDBGXFxcIlxcXCIxITNHK0MlNzQrOSUuSFxcXCJcXFwiMkgzSSspJTQkNkokXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuS1xcXCJcXFwiMkszTCtiJCAhN0MqKSBcXFwiME1cXFwiXFxcIjEhM04sLyY3QyopIFxcXCIwTVxcXCJcXFwiMSEzTlxcXCIrOCUuSFxcXCJcXFwiMkgzSSsoJTQjNk8jISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEhLlBcXFwiXFxcIjJQM1ErPSQ3MyszJS5SXFxcIlxcXCIyUjNTKyMlJyMlJCMjICMkXFxcIiMgI1xcXCIjICMqTiBcXFwiIS5EXFxcIlxcXCIyRDNFKz0kNzMrMyUuSFxcXCJcXFwiMkgzSSsjJScjJSQjIyAjJFxcXCIjICNcXFwiIyAjKycgNCE2VCEhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuRFxcXCJcXFwiMkQzRSt3JCE4MFVcXFwiXFxcIjEhM1Y5KiQkXFxcIlxcXCIgKVxcXCIjICMrWSUuV1xcXCJcXFwiMlczWCojIFxcXCIgOitDJTczKzklLkhcXFwiXFxcIjJIM0krKSU0JTZZJVxcXCJcXFwiISUkJSMgIyQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuUFxcXCJcXFwiMlAzUStCJDczKzglLlJcXFwiXFxcIjJSM1MrKCU0IzZaIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLkRcXFwiXFxcIjJEM0UrcyQwW1xcXCJcXFwiMSEzXFxcXCtjJSAhN0MqKSBcXFwiME1cXFwiXFxcIjEhM04sLyY3QyopIFxcXCIwTVxcXCJcXFwiMSEzTlxcXCIrOSUuSFxcXCJcXFwiMkgzSSspJTQkNl0kXFxcIlxcXCIhJSQkIyAjJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3NStxJCAhIS5eXFxcIlxcXCIyXjNfKy0kNzUrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMsPiYhLl5cXFwiXFxcIjJeM18rLSQ3NSsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgI1xcXCIrKSU0XFxcIjZAXFxcIlxcXCIhICUkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3MysnIDQhNmAhISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhN0ErTSQ3NiojIFxcXCIgOis9JTc3KzMlN0ErKSU0JDZhJFxcXCJcXFwiISUkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjKkcgXFxcIiE3QSs8JDc2KzIlN0ErKCU0IzZiIyEhJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICEuY1xcXCJcXFwiMmMzZCssJCwpJi5jXFxcIlxcXCIyYzNkXFxcIlxcXCJcXFwiICMrJyA0ITZlISEgJSpiIFxcXCIhLmZcXFwiXFxcIjJmM2crJiA0ITZoISAlKksgXFxcIiEuaVxcXCJcXFwiMmkzaismIDQhNmghICUqNCBcXFwiIS5rXFxcIlxcXCIyazNsKyYgNCE2bSEgJVwiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiITc4K3EkICEhLmlcXFwiXFxcIjJpM2orLSQ3OCsjJSdcXFwiJSRcXFwiIyAjXFxcIiMgIyw+JiEuaVxcXCJcXFwiMmkzaistJDc4KyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjXFxcIispJTRcXFwiNkBcXFwiXFxcIiEgJSRcXFwiIyAjXFxcIiMgI1wiKSxcbiAgICAgICAgICBwZWckZGVjb2RlKFwiISEhMG5cXFwiXFxcIjEhM28rQSQgITBwXFxcIlxcXCIxITNxLCkmMHBcXFwiXFxcIjEhM3FcXFwiKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjKyEgKCUrOyQgITc5LCMmNzlcXFwiKyklNFxcXCI2clxcXCJcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLnNcXFwiXFxcIjJzM3QrYiQ3QStYJTc8KikgXFxcIjc9KiMgXFxcIjc1K0IlN0ErOCUudVxcXCJcXFwiMnUzdisoJTQlNnclIVxcXCIlJCUjICMkJCMgIyQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLnhcXFwiXFxcIjJ4M3krJiA0ITZ6ISAlKjQgXFxcIiEue1xcXCJcXFwiMnszfCsmIDQhNn0hICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuflxcXCJcXFwiMn4zfyojIFxcXCIgOitcXHg5MiQgITBcXHg4MFxcXCJcXFwiMSEzXFx4ODErLCQsKSYwXFx4ODBcXFwiXFxcIjEhM1xceDgxXFxcIlxcXCJcXFwiICMrbSUhLmlcXFwiXFxcIjJpM2orSCQgITBcXHg4MFxcXCJcXFwiMSEzXFx4ODErLCQsKSYwXFx4ODBcXFwiXFxcIjEhM1xceDgxXFxcIlxcXCJcXFwiICMrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICMqIyBcXFwiIDorJyU0IzZcXHg4MiMgJSQjIyAjJFxcXCIjICNcXFwiIyAjXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhICEwXFx4ODBcXFwiXFxcIjEhM1xceDgxKywkLCkmMFxceDgwXFxcIlxcXCIxITNcXHg4MVxcXCJcXFwiXFxcIiAjKyYgNCE2XFx4ODMhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuXFx4ODRcXFwiXFxcIjJcXHg4NDNcXHg4NStiJCAhN0MqKSBcXFwiMFxceDg2XFxcIlxcXCIxITNcXHg4NywvJjdDKikgXFxcIjBcXHg4NlxcXCJcXFwiMSEzXFx4ODdcXFwiKzglLlxceDg0XFxcIlxcXCIyXFx4ODQzXFx4ODUrKCU0IzZcXHg4OCMhISUkIyMgIyRcXFwiIyAjXFxcIiMgIypzIFxcXCIhLlxceDg5XFxcIlxcXCIyXFx4ODkzXFx4OEErYiQgITdDKikgXFxcIjBcXHg4QlxcXCJcXFwiMSEzXFx4OEMsLyY3QyopIFxcXCIwXFx4OEJcXFwiXFxcIjEhM1xceDhDXFxcIis4JS5cXHg4OVxcXCJcXFwiMlxceDg5M1xceDhBKyglNCM2XFx4ODgjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiEuXFx4OERcXFwiXFxcIjJcXHg4RDNcXHg4RSsmIDQhNlxceDhGISAlXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDkwXFxcIlxcXCIyXFx4OTAzXFx4OTEqXFx4QjMgXFxcIiEuXFx4OTJcXFwiXFxcIjJcXHg5MjNcXHg5MytcXHhBMiQ3QitcXHg5OCUgISEhODBcXHg5NFxcXCJcXFwiMSEzXFx4OTU5KiQkXFxcIlxcXCIgKVxcXCIjICMrMiQtXFxcIlxcXCIxITMsKyMlJ1xcXCIlJFxcXCIjICNcXFwiIyAjK1QkLFEmISE4MFxceDk0XFxcIlxcXCIxITNcXHg5NTkqJCRcXFwiXFxcIiApXFxcIiMgIysyJC1cXFwiXFxcIjEhMywrIyUnXFxcIiUkXFxcIiMgI1xcXCIjICNcXFwiXFxcIlxcXCIgIysjJScjJSQjIyAjJFxcXCIjICNcXFwiIyAjKyYgNCE2XFx4OTYhICVcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIiE3QStdJCEgITBcXHg5N1xcXCJcXFwiMSEzXFx4OTgrLCQsKSYwXFx4OTdcXFwiXFxcIjEhM1xceDk4XFxcIlxcXCJcXFwiICMrISAoJSsyJTdBKyglNCM2XFx4OTkjISElJCMjICMkXFxcIiMgI1xcXCIjICNcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIjghICEwXFx4OUJcXFwiXFxcIjEhM1xceDlDLCkmMFxceDlCXFxcIlxcXCIxITNcXHg5Q1xcXCIrISAoJTkqXFxcIiAzXFx4OUFcIiksXG4gICAgICAgICAgcGVnJGRlY29kZShcIjghICEwXFx4OUJcXFwiXFxcIjEhM1xceDlDKywkLCkmMFxceDlCXFxcIlxcXCIxITNcXHg5Q1xcXCJcXFwiXFxcIiAjKyEgKCU5KlxcXCIgM1xceDlEXCIpLFxuICAgICAgICAgIHBlZyRkZWNvZGUoXCIhLlxceDlFXFxcIlxcXCIyXFx4OUUzXFx4OUYrNyQtXFxcIlxcXCIxITMsKyglNFxcXCI2XFx4QTBcXFwiISAlJFxcXCIjICNcXFwiIyAjXCIpXG4gICAgICAgIF0sXG5cbiAgICAgICAgcGVnJGN1cnJQb3MgICAgICAgICAgPSAwLFxuICAgICAgICBwZWckcmVwb3J0ZWRQb3MgICAgICA9IDAsXG4gICAgICAgIHBlZyRjYWNoZWRQb3MgICAgICAgID0gMCxcbiAgICAgICAgcGVnJGNhY2hlZFBvc0RldGFpbHMgPSB7IGxpbmU6IDEsIGNvbHVtbjogMSwgc2VlbkNSOiBmYWxzZSB9LFxuICAgICAgICBwZWckbWF4RmFpbFBvcyAgICAgICA9IDAsXG4gICAgICAgIHBlZyRtYXhGYWlsRXhwZWN0ZWQgID0gW10sXG4gICAgICAgIHBlZyRzaWxlbnRGYWlscyAgICAgID0gMCxcblxuICAgICAgICBwZWckcmVzdWx0O1xuXG4gICAgaWYgKFwic3RhcnRSdWxlXCIgaW4gb3B0aW9ucykge1xuICAgICAgaWYgKCEob3B0aW9ucy5zdGFydFJ1bGUgaW4gcGVnJHN0YXJ0UnVsZUluZGljZXMpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcIkNhbid0IHN0YXJ0IHBhcnNpbmcgZnJvbSBydWxlIFxcXCJcIiArIG9wdGlvbnMuc3RhcnRSdWxlICsgXCJcXFwiLlwiKTtcbiAgICAgIH1cblxuICAgICAgcGVnJHN0YXJ0UnVsZUluZGV4ID0gcGVnJHN0YXJ0UnVsZUluZGljZXNbb3B0aW9ucy5zdGFydFJ1bGVdO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHRleHQoKSB7XG4gICAgICByZXR1cm4gaW5wdXQuc3Vic3RyaW5nKHBlZyRyZXBvcnRlZFBvcywgcGVnJGN1cnJQb3MpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIG9mZnNldCgpIHtcbiAgICAgIHJldHVybiBwZWckcmVwb3J0ZWRQb3M7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gbGluZSgpIHtcbiAgICAgIHJldHVybiBwZWckY29tcHV0ZVBvc0RldGFpbHMocGVnJHJlcG9ydGVkUG9zKS5saW5lO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbHVtbigpIHtcbiAgICAgIHJldHVybiBwZWckY29tcHV0ZVBvc0RldGFpbHMocGVnJHJlcG9ydGVkUG9zKS5jb2x1bW47XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZXhwZWN0ZWQoZGVzY3JpcHRpb24pIHtcbiAgICAgIHRocm93IHBlZyRidWlsZEV4Y2VwdGlvbihcbiAgICAgICAgbnVsbCxcbiAgICAgICAgW3sgdHlwZTogXCJvdGhlclwiLCBkZXNjcmlwdGlvbjogZGVzY3JpcHRpb24gfV0sXG4gICAgICAgIHBlZyRyZXBvcnRlZFBvc1xuICAgICAgKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlcnJvcihtZXNzYWdlKSB7XG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24obWVzc2FnZSwgbnVsbCwgcGVnJHJlcG9ydGVkUG9zKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwZWckY29tcHV0ZVBvc0RldGFpbHMocG9zKSB7XG4gICAgICBmdW5jdGlvbiBhZHZhbmNlKGRldGFpbHMsIHN0YXJ0UG9zLCBlbmRQb3MpIHtcbiAgICAgICAgdmFyIHAsIGNoO1xuXG4gICAgICAgIGZvciAocCA9IHN0YXJ0UG9zOyBwIDwgZW5kUG9zOyBwKyspIHtcbiAgICAgICAgICBjaCA9IGlucHV0LmNoYXJBdChwKTtcbiAgICAgICAgICBpZiAoY2ggPT09IFwiXFxuXCIpIHtcbiAgICAgICAgICAgIGlmICghZGV0YWlscy5zZWVuQ1IpIHsgZGV0YWlscy5saW5lKys7IH1cbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uID0gMTtcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gZmFsc2U7XG4gICAgICAgICAgfSBlbHNlIGlmIChjaCA9PT0gXCJcXHJcIiB8fCBjaCA9PT0gXCJcXHUyMDI4XCIgfHwgY2ggPT09IFwiXFx1MjAyOVwiKSB7XG4gICAgICAgICAgICBkZXRhaWxzLmxpbmUrKztcbiAgICAgICAgICAgIGRldGFpbHMuY29sdW1uID0gMTtcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gdHJ1ZTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGV0YWlscy5jb2x1bW4rKztcbiAgICAgICAgICAgIGRldGFpbHMuc2VlbkNSID0gZmFsc2U7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmIChwZWckY2FjaGVkUG9zICE9PSBwb3MpIHtcbiAgICAgICAgaWYgKHBlZyRjYWNoZWRQb3MgPiBwb3MpIHtcbiAgICAgICAgICBwZWckY2FjaGVkUG9zID0gMDtcbiAgICAgICAgICBwZWckY2FjaGVkUG9zRGV0YWlscyA9IHsgbGluZTogMSwgY29sdW1uOiAxLCBzZWVuQ1I6IGZhbHNlIH07XG4gICAgICAgIH1cbiAgICAgICAgYWR2YW5jZShwZWckY2FjaGVkUG9zRGV0YWlscywgcGVnJGNhY2hlZFBvcywgcG9zKTtcbiAgICAgICAgcGVnJGNhY2hlZFBvcyA9IHBvcztcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHBlZyRjYWNoZWRQb3NEZXRhaWxzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRmYWlsKGV4cGVjdGVkKSB7XG4gICAgICBpZiAocGVnJGN1cnJQb3MgPCBwZWckbWF4RmFpbFBvcykgeyByZXR1cm47IH1cblxuICAgICAgaWYgKHBlZyRjdXJyUG9zID4gcGVnJG1heEZhaWxQb3MpIHtcbiAgICAgICAgcGVnJG1heEZhaWxQb3MgPSBwZWckY3VyclBvcztcbiAgICAgICAgcGVnJG1heEZhaWxFeHBlY3RlZCA9IFtdO1xuICAgICAgfVxuXG4gICAgICBwZWckbWF4RmFpbEV4cGVjdGVkLnB1c2goZXhwZWN0ZWQpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRidWlsZEV4Y2VwdGlvbihtZXNzYWdlLCBleHBlY3RlZCwgcG9zKSB7XG4gICAgICBmdW5jdGlvbiBjbGVhbnVwRXhwZWN0ZWQoZXhwZWN0ZWQpIHtcbiAgICAgICAgdmFyIGkgPSAxO1xuXG4gICAgICAgIGV4cGVjdGVkLnNvcnQoZnVuY3Rpb24oYSwgYikge1xuICAgICAgICAgIGlmIChhLmRlc2NyaXB0aW9uIDwgYi5kZXNjcmlwdGlvbikge1xuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICAgIH0gZWxzZSBpZiAoYS5kZXNjcmlwdGlvbiA+IGIuZGVzY3JpcHRpb24pIHtcbiAgICAgICAgICAgIHJldHVybiAxO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHdoaWxlIChpIDwgZXhwZWN0ZWQubGVuZ3RoKSB7XG4gICAgICAgICAgaWYgKGV4cGVjdGVkW2kgLSAxXSA9PT0gZXhwZWN0ZWRbaV0pIHtcbiAgICAgICAgICAgIGV4cGVjdGVkLnNwbGljZShpLCAxKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBidWlsZE1lc3NhZ2UoZXhwZWN0ZWQsIGZvdW5kKSB7XG4gICAgICAgIGZ1bmN0aW9uIHN0cmluZ0VzY2FwZShzKSB7XG4gICAgICAgICAgZnVuY3Rpb24gaGV4KGNoKSB7IHJldHVybiBjaC5jaGFyQ29kZUF0KDApLnRvU3RyaW5nKDE2KS50b1VwcGVyQ2FzZSgpOyB9XG5cbiAgICAgICAgICByZXR1cm4gc1xuICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFwvZywgICAnXFxcXFxcXFwnKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1wiL2csICAgICdcXFxcXCInKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xceDA4L2csICdcXFxcYicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFx0L2csICAgJ1xcXFx0JylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9cXG4vZywgICAnXFxcXG4nKVxuICAgICAgICAgICAgLnJlcGxhY2UoL1xcZi9nLCAgICdcXFxcZicpXG4gICAgICAgICAgICAucmVwbGFjZSgvXFxyL2csICAgJ1xcXFxyJylcbiAgICAgICAgICAgIC5yZXBsYWNlKC9bXFx4MDAtXFx4MDdcXHgwQlxceDBFXFx4MEZdL2csIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHgwJyArIGhleChjaCk7IH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xceDEwLVxceDFGXFx4ODAtXFx4RkZdL2csICAgIGZ1bmN0aW9uKGNoKSB7IHJldHVybiAnXFxcXHgnICArIGhleChjaCk7IH0pXG4gICAgICAgICAgICAucmVwbGFjZSgvW1xcdTAxODAtXFx1MEZGRl0vZywgICAgICAgICBmdW5jdGlvbihjaCkgeyByZXR1cm4gJ1xcXFx1MCcgKyBoZXgoY2gpOyB9KVxuICAgICAgICAgICAgLnJlcGxhY2UoL1tcXHUxMDgwLVxcdUZGRkZdL2csICAgICAgICAgZnVuY3Rpb24oY2gpIHsgcmV0dXJuICdcXFxcdScgICsgaGV4KGNoKTsgfSk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgZXhwZWN0ZWREZXNjcyA9IG5ldyBBcnJheShleHBlY3RlZC5sZW5ndGgpLFxuICAgICAgICAgICAgZXhwZWN0ZWREZXNjLCBmb3VuZERlc2MsIGk7XG5cbiAgICAgICAgZm9yIChpID0gMDsgaSA8IGV4cGVjdGVkLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgZXhwZWN0ZWREZXNjc1tpXSA9IGV4cGVjdGVkW2ldLmRlc2NyaXB0aW9uO1xuICAgICAgICB9XG5cbiAgICAgICAgZXhwZWN0ZWREZXNjID0gZXhwZWN0ZWQubGVuZ3RoID4gMVxuICAgICAgICAgID8gZXhwZWN0ZWREZXNjcy5zbGljZSgwLCAtMSkuam9pbihcIiwgXCIpXG4gICAgICAgICAgICAgICsgXCIgb3IgXCJcbiAgICAgICAgICAgICAgKyBleHBlY3RlZERlc2NzW2V4cGVjdGVkLmxlbmd0aCAtIDFdXG4gICAgICAgICAgOiBleHBlY3RlZERlc2NzWzBdO1xuXG4gICAgICAgIGZvdW5kRGVzYyA9IGZvdW5kID8gXCJcXFwiXCIgKyBzdHJpbmdFc2NhcGUoZm91bmQpICsgXCJcXFwiXCIgOiBcImVuZCBvZiBpbnB1dFwiO1xuXG4gICAgICAgIHJldHVybiBcIkV4cGVjdGVkIFwiICsgZXhwZWN0ZWREZXNjICsgXCIgYnV0IFwiICsgZm91bmREZXNjICsgXCIgZm91bmQuXCI7XG4gICAgICB9XG5cbiAgICAgIHZhciBwb3NEZXRhaWxzID0gcGVnJGNvbXB1dGVQb3NEZXRhaWxzKHBvcyksXG4gICAgICAgICAgZm91bmQgICAgICA9IHBvcyA8IGlucHV0Lmxlbmd0aCA/IGlucHV0LmNoYXJBdChwb3MpIDogbnVsbDtcblxuICAgICAgaWYgKGV4cGVjdGVkICE9PSBudWxsKSB7XG4gICAgICAgIGNsZWFudXBFeHBlY3RlZChleHBlY3RlZCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBuZXcgU3ludGF4RXJyb3IoXG4gICAgICAgIG1lc3NhZ2UgIT09IG51bGwgPyBtZXNzYWdlIDogYnVpbGRNZXNzYWdlKGV4cGVjdGVkLCBmb3VuZCksXG4gICAgICAgIGV4cGVjdGVkLFxuICAgICAgICBmb3VuZCxcbiAgICAgICAgcG9zLFxuICAgICAgICBwb3NEZXRhaWxzLmxpbmUsXG4gICAgICAgIHBvc0RldGFpbHMuY29sdW1uXG4gICAgICApO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRkZWNvZGUocykge1xuICAgICAgdmFyIGJjID0gbmV3IEFycmF5KHMubGVuZ3RoKSwgaTtcblxuICAgICAgZm9yIChpID0gMDsgaSA8IHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYmNbaV0gPSBzLmNoYXJDb2RlQXQoaSkgLSAzMjtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIGJjO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHBlZyRwYXJzZVJ1bGUoaW5kZXgpIHtcbiAgICAgIHZhciBiYyAgICA9IHBlZyRieXRlY29kZVtpbmRleF0sXG4gICAgICAgICAgaXAgICAgPSAwLFxuICAgICAgICAgIGlwcyAgID0gW10sXG4gICAgICAgICAgZW5kICAgPSBiYy5sZW5ndGgsXG4gICAgICAgICAgZW5kcyAgPSBbXSxcbiAgICAgICAgICBzdGFjayA9IFtdLFxuICAgICAgICAgIHBhcmFtcywgaTtcblxuICAgICAgZnVuY3Rpb24gcHJvdGVjdChvYmplY3QpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuYXBwbHkob2JqZWN0KSA9PT0gXCJbb2JqZWN0IEFycmF5XVwiID8gW10gOiBvYmplY3Q7XG4gICAgICB9XG5cbiAgICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIHdoaWxlIChpcCA8IGVuZCkge1xuICAgICAgICAgIHN3aXRjaCAoYmNbaXBdKSB7XG4gICAgICAgICAgICBjYXNlIDA6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocHJvdGVjdChwZWckY29uc3RzW2JjW2lwICsgMV1dKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJGN1cnJQb3MpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgICBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMzpcbiAgICAgICAgICAgICAgcGVnJGN1cnJQb3MgPSBzdGFjay5wb3AoKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgNDpcbiAgICAgICAgICAgICAgc3RhY2subGVuZ3RoIC09IGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDU6XG4gICAgICAgICAgICAgIHN0YWNrLnNwbGljZSgtMiwgMSk7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDY6XG4gICAgICAgICAgICAgIHN0YWNrW3N0YWNrLmxlbmd0aCAtIDJdLnB1c2goc3RhY2sucG9wKCkpO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSA3OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHN0YWNrLnNwbGljZShzdGFjay5sZW5ndGggLSBiY1tpcCArIDFdLCBiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDg6XG4gICAgICAgICAgICAgIHN0YWNrLnBvcCgpO1xuICAgICAgICAgICAgICBzdGFjay5wdXNoKGlucHV0LnN1YnN0cmluZyhzdGFja1tzdGFjay5sZW5ndGggLSAxXSwgcGVnJGN1cnJQb3MpKTtcbiAgICAgICAgICAgICAgaXArKztcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgOTpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0pIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMDpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gPT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMTpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdKTtcblxuICAgICAgICAgICAgICBpZiAoc3RhY2tbc3RhY2subGVuZ3RoIC0gMV0gIT09IHBlZyRGQUlMRUQpIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICAgIGlwICs9IDM7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXSArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgICAgaXAgKz0gMyArIGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxMjpcbiAgICAgICAgICAgICAgaWYgKHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdICE9PSBwZWckRkFJTEVEKSB7XG4gICAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgICAgaXBzLnB1c2goaXApO1xuXG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAyICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlwICs9IDIgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTM6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDMgKyBiY1tpcCArIDFdICsgYmNbaXAgKyAyXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0Lmxlbmd0aCA+IHBlZyRjdXJyUG9zKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyAzICsgYmNbaXAgKyAxXTtcbiAgICAgICAgICAgICAgICBpcCArPSAzO1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgMyArIGJjW2lwICsgMV0gKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDMgKyBiY1tpcCArIDFdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTQ6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGgpID09PSBwZWckY29uc3RzW2JjW2lwICsgMV1dKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTU6XG4gICAgICAgICAgICAgIGVuZHMucHVzaChlbmQpO1xuICAgICAgICAgICAgICBpcHMucHVzaChpcCArIDQgKyBiY1tpcCArIDJdICsgYmNbaXAgKyAzXSk7XG5cbiAgICAgICAgICAgICAgaWYgKGlucHV0LnN1YnN0cihwZWckY3VyclBvcywgcGVnJGNvbnN0c1tiY1tpcCArIDFdXS5sZW5ndGgpLnRvTG93ZXJDYXNlKCkgPT09IHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pIHtcbiAgICAgICAgICAgICAgICBlbmQgPSBpcCArIDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQ7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXSArIGJjW2lwICsgM107XG4gICAgICAgICAgICAgICAgaXAgKz0gNCArIGJjW2lwICsgMl07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAxNjpcbiAgICAgICAgICAgICAgZW5kcy5wdXNoKGVuZCk7XG4gICAgICAgICAgICAgIGlwcy5wdXNoKGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdKTtcblxuICAgICAgICAgICAgICBpZiAocGVnJGNvbnN0c1tiY1tpcCArIDFdXS50ZXN0KGlucHV0LmNoYXJBdChwZWckY3VyclBvcykpKSB7XG4gICAgICAgICAgICAgICAgZW5kID0gaXAgKyA0ICsgYmNbaXAgKyAyXTtcbiAgICAgICAgICAgICAgICBpcCArPSA0O1xuICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGVuZCA9IGlwICsgNCArIGJjW2lwICsgMl0gKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDJdO1xuICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTc6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2goaW5wdXQuc3Vic3RyKHBlZyRjdXJyUG9zLCBiY1tpcCArIDFdKSk7XG4gICAgICAgICAgICAgIHBlZyRjdXJyUG9zICs9IGJjW2lwICsgMV07XG4gICAgICAgICAgICAgIGlwICs9IDI7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDE4OlxuICAgICAgICAgICAgICBzdGFjay5wdXNoKHBlZyRjb25zdHNbYmNbaXAgKyAxXV0pO1xuICAgICAgICAgICAgICBwZWckY3VyclBvcyArPSBwZWckY29uc3RzW2JjW2lwICsgMV1dLmxlbmd0aDtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMTk6XG4gICAgICAgICAgICAgIHN0YWNrLnB1c2gocGVnJEZBSUxFRCk7XG4gICAgICAgICAgICAgIGlmIChwZWckc2lsZW50RmFpbHMgPT09IDApIHtcbiAgICAgICAgICAgICAgICBwZWckZmFpbChwZWckY29uc3RzW2JjW2lwICsgMV1dKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMDpcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMSAtIGJjW2lwICsgMV1dO1xuICAgICAgICAgICAgICBpcCArPSAyO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMTpcbiAgICAgICAgICAgICAgcGVnJHJlcG9ydGVkUG9zID0gcGVnJGN1cnJQb3M7XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlIDIyOlxuICAgICAgICAgICAgICBwYXJhbXMgPSBiYy5zbGljZShpcCArIDQsIGlwICsgNCArIGJjW2lwICsgM10pO1xuICAgICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgYmNbaXAgKyAzXTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcGFyYW1zW2ldID0gc3RhY2tbc3RhY2subGVuZ3RoIC0gMSAtIHBhcmFtc1tpXV07XG4gICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICBzdGFjay5zcGxpY2UoXG4gICAgICAgICAgICAgICAgc3RhY2subGVuZ3RoIC0gYmNbaXAgKyAyXSxcbiAgICAgICAgICAgICAgICBiY1tpcCArIDJdLFxuICAgICAgICAgICAgICAgIHBlZyRjb25zdHNbYmNbaXAgKyAxXV0uYXBwbHkobnVsbCwgcGFyYW1zKVxuICAgICAgICAgICAgICApO1xuXG4gICAgICAgICAgICAgIGlwICs9IDQgKyBiY1tpcCArIDNdO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyMzpcbiAgICAgICAgICAgICAgc3RhY2sucHVzaChwZWckcGFyc2VSdWxlKGJjW2lwICsgMV0pKTtcbiAgICAgICAgICAgICAgaXAgKz0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgMjQ6XG4gICAgICAgICAgICAgIHBlZyRzaWxlbnRGYWlscysrO1xuICAgICAgICAgICAgICBpcCsrO1xuICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgY2FzZSAyNTpcbiAgICAgICAgICAgICAgcGVnJHNpbGVudEZhaWxzLS07XG4gICAgICAgICAgICAgIGlwKys7XG4gICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJJbnZhbGlkIG9wY29kZTogXCIgKyBiY1tpcF0gKyBcIi5cIik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGVuZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGVuZCA9IGVuZHMucG9wKCk7XG4gICAgICAgICAgaXAgPSBpcHMucG9wKCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHN0YWNrWzBdO1xuICAgIH1cblxuXG4gICAgXHR2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpLFxuICAgIFx0XHROT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKSxcbiAgICBcdFx0TXVzdGFjaGUgPSByZXF1aXJlKFwiLi9cIik7XG5cbiAgICBcdG9wdGlvbnMgPSBfLmRlZmF1bHRzKG9wdGlvbnMgfHwge30sIHtcbiAgICBcdFx0c3RyaWN0OiB0cnVlXG4gICAgXHR9KTtcblxuXG4gICAgcGVnJHJlc3VsdCA9IHBlZyRwYXJzZVJ1bGUocGVnJHN0YXJ0UnVsZUluZGV4KTtcblxuICAgIGlmIChwZWckcmVzdWx0ICE9PSBwZWckRkFJTEVEICYmIHBlZyRjdXJyUG9zID09PSBpbnB1dC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBwZWckcmVzdWx0O1xuICAgIH0gZWxzZSB7XG4gICAgICBpZiAocGVnJHJlc3VsdCAhPT0gcGVnJEZBSUxFRCAmJiBwZWckY3VyclBvcyA8IGlucHV0Lmxlbmd0aCkge1xuICAgICAgICBwZWckZmFpbCh7IHR5cGU6IFwiZW5kXCIsIGRlc2NyaXB0aW9uOiBcImVuZCBvZiBpbnB1dFwiIH0pO1xuICAgICAgfVxuXG4gICAgICB0aHJvdyBwZWckYnVpbGRFeGNlcHRpb24obnVsbCwgcGVnJG1heEZhaWxFeHBlY3RlZCwgcGVnJG1heEZhaWxQb3MpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgU3ludGF4RXJyb3I6IFN5bnRheEVycm9yLFxuICAgIHBhcnNlOiAgICAgICBwYXJzZVxuICB9O1xufSkoKTsiLCJ2YXIgVHJhY2tyID0gcmVxdWlyZShcInRyYWNrclwiKTtcbnZhciB0cmFjayA9IHJlcXVpcmUoXCJ0cmFja3Itb2JqZWN0c1wiKTtcbnZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcbnZhciBwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlO1xuXG52YXIgTW9kZWwgPVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBNb2RlbChkYXRhLCBwYXJlbnQsIG9wdGlvbnMpIHtcblx0dGhpcy5wcm94aWVzID0gW107XG5cdHRoaXMuX2RlcCA9IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpO1xuXHRpZiAoTW9kZWwuaXNNb2RlbChwYXJlbnQpKSB0aGlzLnBhcmVudCA9IHBhcmVudDtcblx0dGhpcy5zZXQoZGF0YSwgb3B0aW9ucyk7XG59XG5cbk1vZGVsLmlzTW9kZWwgPSBmdW5jdGlvbihvKSB7XG5cdHJldHVybiBvIGluc3RhbmNlb2YgTW9kZWw7XG59XG5cbk1vZGVsLmV4dGVuZCA9IHJlcXVpcmUoXCJiYWNrYm9uZS1leHRlbmQtc3RhbmRhbG9uZVwiKTtcblxuTW9kZWwuX2RlZmF1bHRQcm94aWVzID0gWyB7XG5cdGlzTGlzdDogIHRydWUsXG5cdG1hdGNoOiAgIGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gXy5pc0FycmF5KGFycik7IH0sXG5cdGdldDogICAgIGZ1bmN0aW9uKGFyciwgaykgeyByZXR1cm4gayA9PT0gXCJsZW5ndGhcIiA/IHRoaXMubGVuZ3RoKGFycikgOiBhcnJba107IH0sXG5cdGxlbmd0aDogIGZ1bmN0aW9uKGFycikgICAgeyB2YXIgbGVuOyByZXR1cm4gdHlwZW9mKGxlbiA9IGFyci4kbGVuZ3RoKSA9PT0gXCJudW1iZXJcIiA/IGxlbiA6IGFyci5sZW5ndGg7IH0sXG5cdGtleXM6ICAgIGZ1bmN0aW9uKGFycikgICAgeyByZXR1cm4gXy5yYW5nZSh0aGlzLmxlbmd0aChhcnIpKTsgfSxcblx0aXNFbXB0eTogZnVuY3Rpb24oYXJyKSAgICB7IHJldHVybiAhIXRoaXMubGVuZ3RoKGFycik7IH1cbn0sIHtcblx0bWF0Y2g6IGZ1bmN0aW9uKCkgICAgIHsgcmV0dXJuIHRydWU7IH0sXG5cdGdldDogICBmdW5jdGlvbih0LCBrKSB7IGlmICh0ICE9IG51bGwpIHJldHVybiB0W2tdOyB9XG59IF07XG5cbk1vZGVsLmNhbGxQcm94eU1ldGhvZCA9IGZ1bmN0aW9uKHByb3h5LCB0YXJnZXQsIG1ldGhvZCwgYXJncywgY3R4KSB7XG5cdHZhciBhcmdzID0gXy5pc0FycmF5KGFyZ3MpID8gXy5jbG9uZShhcmdzKSA6IFtdO1xuXHRhcmdzLnVuc2hpZnQocHJveHksIG1ldGhvZCwgdGFyZ2V0KTtcblx0YXJncy5wdXNoKGN0eCk7XG5cdHJldHVybiB1dGlscy5yZXN1bHQuYXBwbHkobnVsbCwgYXJncyk7XG59XG5cbl8uZXh0ZW5kKE1vZGVsLnByb3RvdHlwZSwge1xuXG5cdC8vIHNldHMgdGhlIGRhdGEgb24gdGhlIG1vZGVsXG5cdHNldDogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdGlmIChvcHRpb25zICYmIG9wdGlvbnMudHJhY2sgIT09IGZhbHNlKSB7XG5cdFx0XHRkYXRhID0gdHJhY2soZGF0YSwgb3B0aW9ucy50cmFjayk7XG5cdFx0fVxuXG5cdFx0dGhpcy5kYXRhID0gZGF0YTtcblx0XHR0aGlzLl9kZXAuY2hhbmdlZCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdGFwcGVuZDogZnVuY3Rpb24obW9kZWwsIG9wdGlvbnMpIHtcblx0XHRpZiAoTW9kZWwuaXNNb2RlbChtb2RlbCkpIG1vZGVsLnBhcmVudCA9IHRoaXM7XG5cdFx0ZWxzZSBtb2RlbCA9IG5ldyBNb2RlbChtb2RlbCwgdGhpcywgb3B0aW9ucyk7XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9LFxuXG5cdC8vIGFuIGFycmF5IG9mIG1vZGVscyBpbiB0aGUgY3VycmVudCBzdGFjaywgd2l0aCB0aGUgcm9vdCBhcyB0aGUgZmlyc3Rcblx0Z2V0QWxsTW9kZWxzOiBmdW5jdGlvbigpIHtcblx0XHR2YXIgbW9kZWxzID0gWyB0aGlzIF0sXG5cdFx0XHRtb2RlbCA9IHRoaXM7XG5cblx0XHR3aGlsZSAobW9kZWwucGFyZW50KSB7XG5cdFx0XHRtb2RlbHMudW5zaGlmdChtb2RlbCA9IG1vZGVsLnBhcmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsc1xuXHR9LFxuXG5cdC8vIGdldHMgdGhlIG1vZGVsIGluIHRoZSBzdGFjayBhdCB0aGUgaW5kZXhcblx0Ly8gbmVnYXRpdmUgdmFsdWVzIHN0YXJ0IGF0IHJvb3Rcblx0Z2V0TW9kZWxBdE9mZnNldDogZnVuY3Rpb24oaW5kZXgpIHtcblx0XHRpZiAoIV8uaXNOdW1iZXIoaW5kZXgpIHx8IGlzTmFOKGluZGV4KSkgaW5kZXggPSAwO1xuXHRcdGlmIChpbmRleCA8IDApIHJldHVybiB0aGlzLmdldEFsbE1vZGVscygpW35pbmRleF07XG5cblx0XHR2YXIgbW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKGluZGV4ICYmIG1vZGVsKSB7XG5cdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHRcdGluZGV4LS07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9LFxuXG5cdC8vIGdldHMgdGhlIGxhc3QgbW9kZWwgaW4gdGhlIHN0YWNrXG5cdGdldFJvb3RNb2RlbDogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIG1vZGVsID0gdGhpcztcblx0XHR3aGlsZSAobW9kZWwucGFyZW50ICE9IG51bGwpIG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdHJldHVybiBtb2RlbDtcblx0fSxcblxuXHQvLyByZXR1cm5zIHRoZSBmaXJzdCBtb2RlbCB3aGljaCBwYXNzZXMgdGhlIGZ1bmN0aW9uXG5cdGZpbmRNb2RlbDogZnVuY3Rpb24oZm4pIHtcblx0XHR2YXIgaW5kZXggPSAwLFxuXHRcdFx0bW9kZWwgPSB0aGlzO1xuXG5cdFx0d2hpbGUgKG1vZGVsICE9IG51bGwpIHtcblx0XHRcdGlmIChmbi5jYWxsKHRoaXMsIG1vZGVsLCBpbmRleCsrKSkgcmV0dXJuIG1vZGVsO1xuXHRcdFx0bW9kZWwgPSBtb2RlbC5wYXJlbnQ7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIHJldHVybnMgdGhlIHZhbHVlIGF0IHBhdGgsIGJ1dCBvbmx5IGxvb2tzIGluIHRoZSBkYXRhIG9uIHRoaXMgbW9kZWxcblx0Z2V0TG9jYWw6IGZ1bmN0aW9uKHBhdGgsIGN0eCkge1xuXHRcdGlmICh0eXBlb2YgcGF0aCA9PT0gXCJzdHJpbmdcIikgcGF0aCA9IHBhcnNlKHBhdGgsIHsgc3RhcnRSdWxlOiBcInBhdGhcIiB9KTtcblx0XHRpZiAocGF0aCA9PSBudWxsKSBwYXRoID0geyBwYXJ0czogW10gfTtcblx0XHRpZiAoIV8uaXNPYmplY3QocGF0aCkpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgb3Igb2JqZWN0IGZvciBwYXRoLlwiKTtcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0dGhpcy5fZGVwLmRlcGVuZCgpO1xuXG5cdFx0cmV0dXJuIF8ucmVkdWNlKHBhdGgucGFydHMsIGZ1bmN0aW9uKHRhcmdldCwgcGFydCkge1xuXHRcdFx0dGFyZ2V0ID0gc2VsZi5fZ2V0KHRhcmdldCwgcGFydC5rZXkpO1xuXG5cdFx0XHRfLmVhY2gocGFydC5jaGlsZHJlbiwgZnVuY3Rpb24oaykge1xuXHRcdFx0XHRpZiAoXy5pc09iamVjdChrKSkgayA9IGN0eC5nZXQoayk7XG5cdFx0XHRcdHRhcmdldCA9IHNlbGYuX2dldCh0YXJnZXQsIGspO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB0YXJnZXQ7XG5cdFx0fSwgdGhpcy5kYXRhKTtcblx0fSxcblxuXHQvLyByZXRyaWV2ZXMgdmFsdWUgd2l0aCBwYXRoIHF1ZXJ5XG5cdGdldDogZnVuY3Rpb24ocGF0aHMpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRpZiAodHlwZW9mIHBhdGhzID09PSBcInN0cmluZ1wiKSBwYXRocyA9IHBhcnNlKHBhdGhzLCB7IHN0YXJ0UnVsZTogXCJwYXRoUXVlcnlcIiB9KTtcblx0XHRpZiAoIV8uaXNBcnJheShwYXRocykpIHBhdGhzID0gcGF0aHMgIT0gbnVsbCA/IFsgcGF0aHMgXSA6IFtdO1xuXHRcdGlmICghcGF0aHMubGVuZ3RoKSBwYXRocy5wdXNoKHsgdHlwZTogXCJhbGxcIiwgcGFydHM6IFtdIH0pO1xuXG5cdFx0cmV0dXJuIF8ucmVkdWNlKHBhdGhzLCBmdW5jdGlvbihyZXN1bHQsIHBhdGgsIGluZGV4KSB7XG5cdFx0XHR2YXIgbW9kZWwgPSBzZWxmLFxuXHRcdFx0XHRzY29wZSA9IHRydWUsXG5cdFx0XHRcdHZhbDtcblxuXHRcdFx0aWYgKHBhdGgudHlwZSA9PT0gXCJyb290XCIpIHtcblx0XHRcdFx0bW9kZWwgPSBzZWxmLmdldFJvb3RNb2RlbCgpO1xuXHRcdFx0fSBlbHNlIGlmIChwYXRoLnR5cGUgPT09IFwicGFyZW50XCIpIHtcblx0XHRcdFx0bW9kZWwgPSBzZWxmLmdldE1vZGVsQXRPZmZzZXQocGF0aC5kaXN0YW5jZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHBhdGgudHlwZSA9PT0gXCJhbGxcIikge1xuXHRcdFx0XHRzY29wZSA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZWwgPT0gbnVsbCkgcmV0dXJuO1xuXG5cdFx0XHR3aGlsZSAoXy5pc1VuZGVmaW5lZCh2YWwpICYmIG1vZGVsICE9IG51bGwpIHtcblx0XHRcdFx0dmFsID0gbW9kZWwuZ2V0TG9jYWwocGF0aCwgc2VsZik7XG5cdFx0XHRcdG1vZGVsID0gbW9kZWwucGFyZW50O1xuXHRcdFx0XHRpZiAoc2NvcGUpIGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoXy5pc0Z1bmN0aW9uKHZhbCkpIHtcblx0XHRcdFx0dmFsID0gdmFsLmNhbGwoc2VsZiwgaW5kZXggPT09IDAgPyBudWxsIDogcmVzdWx0KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHZhbDtcblx0XHR9LCB2b2lkIDApO1xuXHR9LFxuXG5cdF9nZXQ6IGZ1bmN0aW9uKHRhcmdldCwga2V5KSB7XG5cdFx0cmV0dXJuIHRoaXMuY2FsbFByb3h5TWV0aG9kKHRoaXMuZ2V0UHJveHlCeVZhbHVlKHRhcmdldCksIHRhcmdldCwgXCJnZXRcIiwga2V5KTtcblx0fSxcblxuXHRwcm94eTogZnVuY3Rpb24oa2V5KSB7XG5cdFx0dmFyIHByb3h5ID0gdGhpcy5nZXRQcm94eUJ5VmFsdWUodGhpcy5kYXRhKTtcblx0XHRpZiAoa2V5ID09IG51bGwpIHJldHVybiBwcm94eTtcblx0XHR2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuXHRcdGFyZ3MudW5zaGlmdChwcm94eSwgdGhpcy5kYXRhKTtcblx0XHRyZXR1cm4gdGhpcy5jYWxsUHJveHlNZXRob2QuYXBwbHkodGhpcywgYXJncyk7XG5cdH0sXG5cblx0Y2FsbFByb3h5TWV0aG9kOiBmdW5jdGlvbihwcm94eSwgdGFyZ2V0LCBtZXRob2QpIHtcblx0XHRyZXR1cm4gTW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB0YXJnZXQsIG1ldGhvZCwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKSwgdGhpcyk7XG5cdH0sXG5cblx0Z2V0QWxsUHJveGllczogZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHByb3hpZXMgPSBbXSxcblx0XHRcdG1vZGVsID0gdGhpcztcblxuXHRcdHdoaWxlIChtb2RlbCAhPSBudWxsKSB7XG5cdFx0XHRwcm94aWVzLnB1c2guYXBwbHkocHJveGllcywgbW9kZWwucHJveGllcyk7XG5cdFx0XHRtb2RlbCA9IG1vZGVsLnBhcmVudDtcblx0XHR9XG5cblx0XHRwcm94aWVzLnB1c2guYXBwbHkocHJveGllcywgTW9kZWwuX2RlZmF1bHRQcm94aWVzKTtcblxuXHRcdHJldHVybiBwcm94aWVzO1xuXHR9LFxuXG5cdGhhc1Byb3h5OiBmdW5jdGlvbihwcm94eSwgcHJveGllcykge1xuXHRcdGlmIChwcm94aWVzID09IG51bGwpIHByb3hpZXMgPSB0aGlzLmdldEFsbFByb3hpZXMoKTtcblx0XHRyZXR1cm4gXy5jb250YWlucyhwcm94aWVzLCBwcm94eSk7XG5cdH0sXG5cblx0cmVnaXN0ZXJQcm94eTogZnVuY3Rpb24ocHJveHkpIHtcblx0XHRpZiAodHlwZW9mIHByb3h5ICE9PSBcIm9iamVjdFwiIHx8IHByb3h5ID09IG51bGwpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBvYmplY3QgZm9yIHByb3h5LlwiKTtcblx0XHRpZiAodHlwZW9mIHByb3h5Lm1hdGNoICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkxheWVyIG1pc3NpbmcgcmVxdWlyZWQgbWF0Y2ggbWV0aG9kLlwiKTtcblx0XHRpZiAodHlwZW9mIHByb3h5LmdldCAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJMYXllciBtaXNzaW5nIHJlcXVpcmVkIGdldCBtZXRob2QuXCIpO1xuXHRcdGlmICghdGhpcy5oYXNQcm94eShwcm94eSkpIHRoaXMucHJveGllcy51bnNoaWZ0KHByb3h5KTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRnZXRQcm94eUJ5VmFsdWU6IGZ1bmN0aW9uKHRhcmdldCwgcHJveGllcykge1xuXHRcdGlmIChwcm94aWVzID09IG51bGwpIHByb3hpZXMgPSB0aGlzLmdldEFsbFByb3hpZXMoKTtcblx0XHRyZXR1cm4gXy5maW5kKHByb3hpZXMsIGZ1bmN0aW9uKHByb3h5KSB7XG5cdFx0XHRyZXR1cm4gcHJveHkubWF0Y2godGFyZ2V0KTtcblx0XHR9KTtcblx0fSxcblxuXHQvLyBkZWZpbmVzIGEgcmVhY3RpdmUgcHJvcGVydHkgb24gYW4gb2JqZWN0IHRoYXQgcG9pbnRzIHRvIHRoZSBkYXRhXG5cdGRlZmluZURhdGFMaW5rOiBmdW5jdGlvbihvYmosIHByb3AsIG9wdGlvbnMpIHtcblx0XHR2YXIgbW9kZWwgPSB0aGlzO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdFx0Y29uZmlndXJhYmxlOiBvcHRpb25zICE9IG51bGwgJiYgb3B0aW9ucy5jb25maWd1cmFibGUsXG5cdFx0XHRlbnVtZXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5lbnVtZXJhYmxlICE9PSBmYWxzZSxcblx0XHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRcdG1vZGVsLl9kZXAuZGVwZW5kKCk7XG5cdFx0XHRcdHJldHVybiBtb2RlbC5kYXRhO1xuXHRcdFx0fSxcblx0XHRcdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0XHRcdG1vZGVsLnNldCh2YWwpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIG9iajtcblx0fVxuXG59KTtcbiIsInZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciBOT0RFX1RZUEUgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbnZhciBwYXJzZSA9IHJlcXVpcmUoXCIuL20reG1sXCIpLnBhcnNlO1xudmFyIHV0aWxzID0gcmVxdWlyZShcIi4vdXRpbHNcIik7XG52YXIgVmlldyA9IHJlcXVpcmUoXCIuL3ZpZXdcIik7XG52YXIgTW9kZWwgPSByZXF1aXJlKFwiLi9tb2RlbFwiKTtcbnZhciBTZWN0aW9uID0gcmVxdWlyZShcIi4vc2VjdGlvblwiKTtcbnZhciAkdHJhY2sgPSByZXF1aXJlKFwidHJhY2tyLW9iamVjdHNcIik7XG52YXIgRE9NUmFuZ2UgPSByZXF1aXJlKFwiLi9kb21yYW5nZVwiKTtcblxudmFyIE11c3RhY2hlID1cbm1vZHVsZS5leHBvcnRzID0gVmlldy5leHRlbmQoe1xuXHRjb25zdHJ1Y3RvcjogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG5cdFx0Ly8gYWRkIHRlbXBsYXRlXG5cdFx0dmFyIHRlbXBsYXRlID0gb3B0aW9ucy50ZW1wbGF0ZSB8fCBfLnJlc3VsdCh0aGlzLCBcInRlbXBsYXRlXCIpO1xuXHRcdGlmICh0ZW1wbGF0ZSAhPSBudWxsKSB0aGlzLnNldFRlbXBsYXRlKHRlbXBsYXRlKTtcblxuXHRcdC8vIGFkZCBkZWNvcmF0b3JzXG5cdFx0dGhpcy5kZWNvcmF0ZShfLmV4dGVuZCh7fSwgb3B0aW9ucy5kZWNvcmF0b3JzLCBfLnJlc3VsdCh0aGlzLCBcImRlY29yYXRvcnNcIikpKTtcblxuXHRcdC8vIGluaXRpYXRlIGxpa2UgYSBub3JtYWwgdmlld1xuXHRcdFZpZXcuY2FsbCh0aGlzLCBkYXRhLCBvcHRpb25zKTtcblx0fSxcblxuXHQvLyBwYXJzZXMgYW5kIHNldHMgdGhlIHJvb3QgdGVtcGxhdGVcblx0c2V0VGVtcGxhdGU6IGZ1bmN0aW9uKHRlbXBsYXRlKSB7XG5cdFx0aWYgKF8uaXNTdHJpbmcodGVtcGxhdGUpKSB0ZW1wbGF0ZSA9IHBhcnNlKHRlbXBsYXRlKTtcblxuXHRcdGlmICghXy5pc09iamVjdCh0ZW1wbGF0ZSkgfHwgdGVtcGxhdGUudHlwZSAhPT0gTk9ERV9UWVBFLlJPT1QpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgc3RyaW5nIG9yIHBhcnNlZCB0ZW1wbGF0ZS5cIik7XG5cblx0XHR0aGlzLl90ZW1wbGF0ZSA9IHRlbXBsYXRlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGNyZWF0ZXMgYSBkZWNvcmF0b3Jcblx0ZGVjb3JhdGU6IGZ1bmN0aW9uKG5hbWUsIGZuLCBvcHRpb25zKSB7XG5cdFx0aWYgKHR5cGVvZiBuYW1lID09PSBcIm9iamVjdFwiICYmIGZuID09IG51bGwpIHtcblx0XHRcdF8uZWFjaChuYW1lLCBmdW5jdGlvbihmbiwgbikge1xuXHRcdFx0XHRpZiAoXy5pc0FycmF5KGZuKSkgdGhpcy5kZWNvcmF0ZShuLCBmblswXSwgZm5bMV0pO1xuXHRcdFx0XHRlbHNlIHRoaXMuZGVjb3JhdGUobiwgZm4sIG9wdGlvbnMpO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0XHRyZXR1cm4gdGhpcztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG5hbWUgIT09IFwic3RyaW5nXCIgfHwgbmFtZSA9PT0gXCJcIikgdGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIG5vbi1lbXB0eSBzdHJpbmcgZm9yIGRlY29yYXRvciBuYW1lLlwiKTtcblx0XHRpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgZGVjb3JhdG9yLlwiKTtcblxuXHRcdGlmICh0aGlzLl9kZWNvcmF0b3JzID09IG51bGwpIHRoaXMuX2RlY29yYXRvcnMgPSB7fTtcblx0XHRpZiAodGhpcy5fZGVjb3JhdG9yc1tuYW1lXSA9PSBudWxsKSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdID0gW107XG5cdFx0dmFyIGRlY29yYXRvcnMgPSB0aGlzLl9kZWNvcmF0b3JzW25hbWVdO1xuXG5cdFx0aWYgKCFfLmZpbmRXaGVyZShkZWNvcmF0b3JzLCB7IGNhbGxiYWNrOiBmbiB9KSkge1xuXHRcdFx0ZGVjb3JhdG9ycy5wdXNoKHtcblx0XHRcdFx0Y2FsbGJhY2s6IGZuLFxuXHRcdFx0XHRvcHRpb25zOiBvcHRpb25zIHx8IHt9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBmaW5kcyBhbGwgZGVjb3JhdG9ycywgbG9jYWxseSBhbmQgaW4gcGFyZW50XG5cdGZpbmREZWNvcmF0b3JzOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGRlY29yYXRvcnMgPSBbXSxcblx0XHRcdGMgPSB0aGlzO1xuXG5cblx0XHR3aGlsZSAoYyAhPSBudWxsKSB7XG5cdFx0XHRpZiAoYy5fZGVjb3JhdG9ycyAhPSBudWxsICYmIF8uaXNBcnJheShjLl9kZWNvcmF0b3JzW25hbWVdKSkge1xuXHRcdFx0XHRjLl9kZWNvcmF0b3JzW25hbWVdLmZvckVhY2goZnVuY3Rpb24oZCkge1xuXHRcdFx0XHRcdGlmICghXy5maW5kV2hlcmUoZGVjb3JhdG9ycywgeyBjYWxsYmFjazogZC5jYWxsYmFjayB9KSkge1xuXHRcdFx0XHRcdFx0ZGVjb3JhdG9ycy5wdXNoKF8uZXh0ZW5kKHsgY29udGV4dDogYyB9LCBkKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0YyA9IGMucGFyZW50UmFuZ2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlY29yYXRvcnM7XG5cdH0sXG5cblx0Ly8gcmVtb3ZlcyBhIGRlY29yYXRvclxuXHRzdG9wRGVjb3JhdGluZzogZnVuY3Rpb24obmFtZSwgZm4pIHtcblx0XHRpZiAodHlwZW9mIG5hbWUgPT09IFwiZnVuY3Rpb25cIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0XHRmbiA9IG5hbWU7XG5cdFx0XHRuYW1lID0gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZGVjb3JhdG9ycyA9PSBudWxsIHx8IChuYW1lID09IG51bGwgJiYgZm4gPT0gbnVsbCkpIHtcblx0XHRcdHRoaXMuX2RlY29yYXRvcnMgPSB7fTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChmbiA9PSBudWxsKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fZGVjb3JhdG9yc1tuYW1lXTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChuYW1lID09IG51bGwpIHtcblx0XHRcdF8uZWFjaCh0aGlzLl9kZWNvcmF0b3JzLCBmdW5jdGlvbihkLCBuKSB7XG5cdFx0XHRcdHRoaXMuX2RlY29yYXRvcnNbbl0gPSBfLmZpbHRlcihkLCBmdW5jdGlvbihfZCkge1xuXHRcdFx0XHRcdHJldHVybiBfZC5jYWxsYmFjayAhPT0gZm47XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgdGhpcyk7XG5cdFx0fVxuXG5cdFx0ZWxzZSB7XG5cdFx0XHR2YXIgZCA9IHRoaXMuX2RlY29yYXRvcnNbbmFtZV07XG5cdFx0XHR0aGlzLl9kZWNvcmF0b3JzW25hbWVdID0gXy5maWx0ZXIoZCwgZnVuY3Rpb24oX2QpIHtcblx0XHRcdFx0cmV0dXJuIF9kLmNhbGxiYWNrICE9PSBmbjtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIHNwZWNpYWwgcGFydGlhbCBzZXR0ZXIgdGhhdCBjb252ZXJ0cyBzdHJpbmdzIGludG8gbXVzdGFjaGUgVmlld3Ncblx0c2V0UGFydGlhbDogZnVuY3Rpb24obmFtZSwgcGFydGlhbCkge1xuXHRcdGlmIChfLmlzT2JqZWN0KG5hbWUpKSByZXR1cm4gVmlldy5wcm90b3R5cGUuc2V0UGFydGlhbC5jYWxsKHRoaXMsIG5hbWUpO1xuXG5cdFx0aWYgKF8uaXNTdHJpbmcocGFydGlhbCkpIHBhcnRpYWwgPSBwYXJzZShwYXJ0aWFsKTtcblx0XHRpZiAoXy5pc09iamVjdChwYXJ0aWFsKSAmJiBwYXJ0aWFsLnR5cGUgPT09IE5PREVfVFlQRS5ST09UKSBwYXJ0aWFsID0gTXVzdGFjaGUuZXh0ZW5kKHsgdGVtcGxhdGU6IHBhcnRpYWwgfSk7XG5cdFx0aWYgKHBhcnRpYWwgIT0gbnVsbCAmJiAhdXRpbHMuaXNTdWJDbGFzcyhWaWV3LCBwYXJ0aWFsKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgdGVtcGxhdGUsIHBhcnNlZCB0ZW1wbGF0ZSwgVmlldyBzdWJjbGFzcyBvciBmdW5jdGlvbiBmb3IgcGFydGlhbC5cIik7XG5cblx0XHRyZXR1cm4gVmlldy5wcm90b3R5cGUuc2V0UGFydGlhbC5jYWxsKHRoaXMsIG5hbWUsIHBhcnRpYWwpO1xuXHR9LFxuXG5cdC8vIHRoZSBtYWluIHJlbmRlciBmdW5jdGlvbiBjYWxsZWQgYnkgbW91bnRcblx0cmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5fdGVtcGxhdGUgPT0gbnVsbClcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGVkIGEgdGVtcGxhdGUgdG8gYmUgc2V0IGJlZm9yZSByZW5kZXJpbmcuXCIpO1xuXG5cdFx0dmFyIHRvTW91bnQ7XG5cdFx0dGhpcy5zZXRNZW1iZXJzKHRoaXMucmVuZGVyVGVtcGxhdGUodGhpcy5fdGVtcGxhdGUsIG51bGwsIHRvTW91bnQgPSBbXSkpO1xuXHRcdF8uaW52b2tlKHRvTW91bnQsIFwibW91bnRcIik7XG5cdH0sXG5cblx0Ly8gY29udmVydHMgYSB0ZW1wbGF0ZSBpbnRvIGFuIGFycmF5IG9mIGVsZW1lbnRzIGFuZCBET01SYW5nZXNcblx0cmVuZGVyVGVtcGxhdGU6IGZ1bmN0aW9uKHRlbXBsYXRlLCB2aWV3LCB0b01vdW50KSB7XG5cdFx0aWYgKHZpZXcgPT0gbnVsbCkgdmlldyA9IHRoaXM7XG5cdFx0aWYgKHRvTW91bnQgPT0gbnVsbCkgdG9Nb3VudCA9IFtdO1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdGlmIChfLmlzQXJyYXkodGVtcGxhdGUpKSByZXR1cm4gdGVtcGxhdGUucmVkdWNlKGZ1bmN0aW9uKHIsIHQpIHtcblx0XHRcdHZhciBiID0gc2VsZi5yZW5kZXJUZW1wbGF0ZSh0LCB2aWV3LCB0b01vdW50KTtcblx0XHRcdGlmIChfLmlzQXJyYXkoYikpIHIucHVzaC5hcHBseShyLCBiKTtcblx0XHRcdGVsc2UgaWYgKGIgIT0gbnVsbCkgci5wdXNoKGIpO1xuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fSwgW10pO1xuXG5cdFx0c3dpdGNoKHRlbXBsYXRlLnR5cGUpIHtcblx0XHRcdGNhc2UgTk9ERV9UWVBFLlJPT1Q6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlLmNoaWxkcmVuLCB2aWV3LCB0b01vdW50KTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuRUxFTUVOVDpcblx0XHRcdFx0dmFyIHBhcnQgPSB0aGlzLnJlbmRlclBhcnRpYWwodGVtcGxhdGUubmFtZSwgdmlldyk7XG5cdFx0XHRcdHZhciBvYmo7XG5cblx0XHRcdFx0aWYgKHBhcnQgIT0gbnVsbCkge1xuXHRcdFx0XHRcdHBhcnQuYWRkRGF0YShvYmogPSAkdHJhY2soe30pKTtcblxuXHRcdFx0XHRcdHRlbXBsYXRlLmF0dHJpYnV0ZXMuZm9yRWFjaChmdW5jdGlvbihhdHRyKSB7XG5cdFx0XHRcdFx0XHRzZWxmLmF1dG9ydW4oZnVuY3Rpb24oYykge1xuXHRcdFx0XHRcdFx0XHR2YXIgdmFsID0gdGhpcy5yZW5kZXJBcmd1bWVudHMoYXR0ci5hcmd1bWVudHMsIHZpZXcpO1xuXHRcdFx0XHRcdFx0XHRpZiAodmFsLmxlbmd0aCA9PT0gMSkgdmFsID0gdmFsWzBdO1xuXHRcdFx0XHRcdFx0XHRlbHNlIGlmICghdmFsLmxlbmd0aCkgdmFsID0gdm9pZCAwO1xuXG5cdFx0XHRcdFx0XHRcdGlmIChjLmZpcnN0UnVuKSBvYmouZGVmaW5lUHJvcGVydHkoYXR0ci5uYW1lLCB2YWwpO1xuXHRcdFx0XHRcdFx0XHRlbHNlIG9ialthdHRyLm5hbWVdID0gdmFsO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHR0b01vdW50LnB1c2gocGFydCk7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KHRlbXBsYXRlLm5hbWUpO1xuXG5cdFx0XHRcdFx0dGVtcGxhdGUuYXR0cmlidXRlcy5mb3JFYWNoKGZ1bmN0aW9uKGF0dHIpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLnJlbmRlckRlY29yYXRpb25zKGVsLCBhdHRyLCB2aWV3KSkgcmV0dXJuO1xuXG5cdFx0XHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRcdGVsLnNldEF0dHJpYnV0ZShhdHRyLm5hbWUsIHRoaXMucmVuZGVyVGVtcGxhdGVBc1N0cmluZyhhdHRyLmNoaWxkcmVuLCB2aWV3KSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9LCB0aGlzKTtcblxuXHRcdFx0XHRcdHZhciBjaGlsZHJlbiA9IHRoaXMucmVuZGVyVGVtcGxhdGUodGVtcGxhdGUuY2hpbGRyZW4sIHZpZXcsIHRvTW91bnQpLFxuXHRcdFx0XHRcdFx0Y2hpbGQsIGk7XG5cblx0XHRcdFx0XHRmb3IgKGkgaW4gY2hpbGRyZW4pIHtcblx0XHRcdFx0XHRcdGNoaWxkID0gY2hpbGRyZW5baV07XG5cdFx0XHRcdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBET01SYW5nZSkge1xuXHRcdFx0XHRcdFx0XHRjaGlsZC5wYXJlbnRSYW5nZSA9IHZpZXc7IC8vIGZha2UgdGhlIHBhcmVudFxuXHRcdFx0XHRcdFx0XHRjaGlsZC5hdHRhY2goZWwpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0ZWwuYXBwZW5kQ2hpbGQoY2hpbGQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBlbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5URVhUOlxuXHRcdFx0XHRyZXR1cm4gZG9jdW1lbnQuY3JlYXRlVGV4dE5vZGUodXRpbHMuZGVjb2RlRW50aXRpZXModGVtcGxhdGUudmFsdWUpKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSFRNTDpcblx0XHRcdFx0cmV0dXJuIG5ldyBET01SYW5nZSh1dGlscy5wYXJzZUhUTUwodGVtcGxhdGUudmFsdWUpKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuWENPTU1FTlQ6XG5cdFx0XHRcdHJldHVybiBkb2N1bWVudC5jcmVhdGVDb21tZW50KHRlbXBsYXRlLnZhbHVlKTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5URVJQT0xBVE9SOlxuXHRcdFx0XHR2YXIgbm9kZSA9IGRvY3VtZW50LmNyZWF0ZVRleHROb2RlKFwiXCIpO1xuXG5cdFx0XHRcdHRoaXMuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdFx0XHR2YXIgdmFsID0gdmlldy5nZXQodGVtcGxhdGUudmFsdWUpO1xuXHRcdFx0XHRcdG5vZGUubm9kZVZhbHVlID0gdHlwZW9mIHZhbCA9PT0gXCJzdHJpbmdcIiA/IHZhbCA6IHZhbCAhPSBudWxsID8gdmFsLnRvU3RyaW5nKCkgOiBcIlwiO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gbm9kZTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVFJJUExFOlxuXHRcdFx0XHR2YXIgcmFuZ2UgPSBuZXcgRE9NUmFuZ2UoKTtcblxuXHRcdFx0XHR0aGlzLmF1dG9ydW4oZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0cmFuZ2Uuc2V0TWVtYmVycyh1dGlscy5wYXJzZUhUTUwodmlldy5nZXQodGVtcGxhdGUudmFsdWUpKSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiByYW5nZTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5WRVJURUQ6XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5TRUNUSU9OOlxuXHRcdFx0XHR2YXIgc2VjdGlvbiA9IG5ldyBTZWN0aW9uKHZpZXcubW9kZWwpXG5cdFx0XHRcdFx0LmludmVydCh0ZW1wbGF0ZS50eXBlID09PSBOT0RFX1RZUEUuSU5WRVJURUQpXG5cdFx0XHRcdFx0LnNldFBhdGgodGVtcGxhdGUudmFsdWUpXG5cdFx0XHRcdFx0Lm9uUm93KGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdFx0dmFyIF90b01vdW50O1xuXHRcdFx0XHRcdFx0dGhpcy5zZXRNZW1iZXJzKHNlbGYucmVuZGVyVGVtcGxhdGUodGVtcGxhdGUuY2hpbGRyZW4sIHRoaXMsIF90b01vdW50ID0gW10pKTtcblx0XHRcdFx0XHRcdF8uaW52b2tlKF90b01vdW50LCBcIm1vdW50XCIpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRvTW91bnQucHVzaChzZWN0aW9uKTtcblx0XHRcdFx0cmV0dXJuIHNlY3Rpb247XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLlBBUlRJQUw6XG5cdFx0XHRcdHZhciBwYXJ0aWFsID0gdGhpcy5yZW5kZXJQYXJ0aWFsKHRlbXBsYXRlLnZhbHVlLCB2aWV3KTtcblx0XHRcdFx0aWYgKHBhcnRpYWwpIHRvTW91bnQucHVzaChwYXJ0aWFsKTtcblx0XHRcdFx0cmV0dXJuIHBhcnRpYWw7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIGNvbnZlcnRzIGEgdGVtcGxhdGUgaW50byBhIHN0cmluZ1xuXHRyZW5kZXJUZW1wbGF0ZUFzU3RyaW5nOiBmdW5jdGlvbih0ZW1wbGF0ZSwgY3R4KSB7XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdFx0aWYgKF8uaXNBcnJheSh0ZW1wbGF0ZSkpIHJldHVybiB0ZW1wbGF0ZS5tYXAoZnVuY3Rpb24odCkge1xuXHRcdFx0cmV0dXJuIHNlbGYucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0LCBjdHgpO1xuXHRcdH0pLmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9IG51bGw7IH0pLmpvaW4oXCJcIik7XG5cblx0XHRzd2l0Y2godGVtcGxhdGUudHlwZSkge1xuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuUk9PVDpcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVGVtcGxhdGVBc1N0cmluZyh0ZW1wbGF0ZS5jaGlsZHJlbiwgY3R4KTtcblxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuVEVYVDpcblx0XHRcdFx0cmV0dXJuIHRlbXBsYXRlLnZhbHVlO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlRFUlBPTEFUT1I6XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5UUklQTEU6XG5cdFx0XHRcdHZhciB2YWwgPSBjdHguZ2V0KHRlbXBsYXRlLnZhbHVlKTtcblx0XHRcdFx0cmV0dXJuIHZhbCAhPSBudWxsID8gdmFsLnRvU3RyaW5nKCkgOiBcIlwiO1xuXG5cdFx0XHRjYXNlIE5PREVfVFlQRS5TRUNUSU9OOlxuXHRcdFx0Y2FzZSBOT0RFX1RZUEUuSU5WRVJURUQ6XG5cdFx0XHRcdHZhciBpbnZlcnRlZCwgbW9kZWwsIHZhbCwgaXNFbXB0eSwgbWFrZVJvdywgcHJveHksIGlzTGlzdDtcblxuXHRcdFx0XHRpbnZlcnRlZCA9IHRlbXBsYXRlLnR5cGUgPT09IE5PREVfVFlQRS5JTlZFUlRFRDtcblx0XHRcdFx0dmFsID0gY3R4LmdldCh0ZW1wbGF0ZS52YWx1ZSk7XG5cdFx0XHRcdG1vZGVsID0gbmV3IE1vZGVsKHZhbCwgY3R4KTtcblx0XHRcdFx0cHJveHkgPSBtb2RlbC5nZXRQcm94eUJ5VmFsdWUodmFsKTtcblx0XHRcdFx0aXNMaXN0ID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiaXNMaXN0XCIpO1xuXHRcdFx0XHRpc0VtcHR5ID0gU2VjdGlvbi5pc0VtcHR5KG1vZGVsLCBwcm94eSk7XG5cblx0XHRcdFx0bWFrZVJvdyA9IGZ1bmN0aW9uKGkpIHtcblx0XHRcdFx0XHR2YXIgcm93LCBkYXRhO1xuXG5cdFx0XHRcdFx0aWYgKGkgPT0gbnVsbCkge1xuXHRcdFx0XHRcdFx0ZGF0YSA9IG1vZGVsO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkYXRhID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiZ2V0XCIsIGkpO1xuXHRcdFx0XHRcdFx0ZGF0YSA9IG5ldyBNb2RlbChkYXRhLCBuZXcgTW9kZWwoeyAka2V5OiBpIH0sIGN0eCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBzZWxmLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcodGVtcGxhdGUuY2hpbGRyZW4sIGRhdGEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCEoaXNFbXB0eSBeIGludmVydGVkKSkge1xuXHRcdFx0XHRcdHJldHVybiBpc0xpc3QgJiYgIWludmVydGVkID9cblx0XHRcdFx0XHRcdG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImtleXNcIikubWFwKG1ha2VSb3cpLmpvaW4oXCJcIikgOlxuXHRcdFx0XHRcdFx0bWFrZVJvdygpO1xuXHRcdFx0XHR9XG5cdFx0fVxuXHR9LFxuXG5cdC8vIGNvbnZlcnRzIGFuIGFyZ3VtZW50IHRlbXBsYXRlIGludG8gYW4gYXJyYXkgb2YgdmFsdWVzXG5cdHJlbmRlckFyZ3VtZW50czogZnVuY3Rpb24oYXJnLCBjdHgpIHtcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0XHRpZiAoXy5pc0FycmF5KGFyZykpIHJldHVybiBhcmcubWFwKGZ1bmN0aW9uKGEpIHtcblx0XHRcdHJldHVybiBzZWxmLnJlbmRlckFyZ3VtZW50cyhhLCBjdHgpO1xuXHRcdH0pLmZpbHRlcihmdW5jdGlvbihiKSB7IHJldHVybiBiICE9IG51bGw7IH0pO1xuXG5cdFx0c3dpdGNoKGFyZy50eXBlKSB7XG5cdFx0XHRjYXNlIE5PREVfVFlQRS5JTlRFUlBPTEFUT1I6XG5cdFx0XHRcdHJldHVybiBjdHguZ2V0KGFyZy52YWx1ZSk7XG5cblx0XHRcdGNhc2UgTk9ERV9UWVBFLkxJVEVSQUw6XG5cdFx0XHRcdHJldHVybiBhcmcudmFsdWU7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIHJlbmRlcnMgZGVjb3JhdGlvbnMgb24gYW4gZWxlbWVudCBieSB0ZW1wbGF0ZVxuXHRyZW5kZXJEZWNvcmF0aW9uczogZnVuY3Rpb24oZWwsIGF0dHIsIGN0eCkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblxuXHRcdC8vIGxvb2sgdXAgZGVjb3JhdG9yIGJ5IG5hbWVcblx0XHR2YXIgZGVjb3JhdG9ycyA9IHRoaXMuZmluZERlY29yYXRvcnMoYXR0ci5uYW1lKTtcblx0XHRpZiAoIWRlY29yYXRvcnMubGVuZ3RoKSByZXR1cm47XG5cblx0XHQvLyBub3JtYWxpemUgdGhlIGNvbnRleHRcblx0XHRpZiAoY3R4ID09IG51bGwpIGN0eCA9IHRoaXM7XG5cdFx0aWYgKGN0eCBpbnN0YW5jZW9mIFZpZXcpIGN0eCA9IGN0eC5tb2RlbDtcblxuXHRcdC8vIGEgd3JhcHBlciBjb21wdXRhdGlvbiB0byBlei1jbGVhbiB0aGUgcmVzdFxuXHRcdHJldHVybiB0aGlzLmF1dG9ydW4oZnVuY3Rpb24oX2NvbXApIHtcblx0XHRcdGRlY29yYXRvcnMuZm9yRWFjaChmdW5jdGlvbihkKSB7XG5cdFx0XHRcdGlmIChkLm9wdGlvbnMgJiYgZC5vcHRpb25zLmRlZmVyKSBfLmRlZmVyKGV4ZWNEZWNvcmF0b3IpO1xuXHRcdFx0XHRlbHNlIGV4ZWNEZWNvcmF0b3IoKTtcblxuXHRcdFx0XHRmdW5jdGlvbiBleGVjRGVjb3JhdG9yKCkge1xuXHRcdFx0XHRcdHZhciBkY29tcCA9IHNlbGYuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHRcdFx0XHQvLyBhc3NlbWJsZSB0aGUgYXJndW1lbnRzIVxuXHRcdFx0XHRcdFx0dmFyIGFyZ3MgPSBbIHtcblx0XHRcdFx0XHRcdFx0dGFyZ2V0OiBlbCxcblx0XHRcdFx0XHRcdFx0bW9kZWw6IGN0eCxcblx0XHRcdFx0XHRcdFx0dmlldzogc2VsZixcblx0XHRcdFx0XHRcdFx0dGVtcGxhdGU6IGF0dHIsXG5cdFx0XHRcdFx0XHRcdGNvbXA6IGNvbXAsXG5cdFx0XHRcdFx0XHRcdG9wdGlvbnM6IGQub3B0aW9uc1xuXHRcdFx0XHRcdFx0fSBdO1xuXG5cdFx0XHRcdFx0XHQvLyByZW5kZXIgYXJndW1lbnRzIGJhc2VkIG9uIG9wdGlvbnNcblx0XHRcdFx0XHRcdGlmIChkLm9wdGlvbnMgJiYgZC5vcHRpb25zLnBhcnNlID09PSBcInN0cmluZ1wiKSB7XG5cdFx0XHRcdFx0XHRcdGFyZ3MucHVzaChzZWxmLnJlbmRlclRlbXBsYXRlQXNTdHJpbmcoYXR0ci5jaGlsZHJlbiwgY3R4KSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGQub3B0aW9ucyA9PSBudWxsIHx8IGQub3B0aW9ucy5wYXJzZSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0XHRcdFx0YXJncyA9IGFyZ3MuY29uY2F0KHNlbGYucmVuZGVyQXJndW1lbnRzKGF0dHIuYXJndW1lbnRzLCBjdHgpKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gZXhlY3V0ZSB0aGUgY2FsbGJhY2tcblx0XHRcdFx0XHRcdGQuY2FsbGJhY2suYXBwbHkoZC5jb250ZXh0IHx8IHNlbGYsIGFyZ3MpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0Ly8gY2xlYW4gdXBcblx0XHRcdFx0XHRfY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdFx0XHRkY29tcC5zdG9wKCk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cbn0sIHtcblxuXHRyZW5kZXI6IGZ1bmN0aW9uKHRlbXBsYXRlLCBkYXRhLCBvcHRpb25zKSB7XG5cdFx0b3B0aW9ucyA9IF8uZXh0ZW5kKHt9LCBvcHRpb25zIHx8IHt9LCB7XG5cdFx0XHR0ZW1wbGF0ZTogdGVtcGxhdGVcblx0XHR9KTtcblxuXHRcdHJldHVybiBuZXcgTXVzdGFjaGUoZGF0YSB8fCBudWxsLCBvcHRpb25zKTtcblx0fVxuXG59KTtcbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIiksXG5cdE11c3RhY2hlID0gcmVxdWlyZShcIi4uL1wiKTtcblxuLy8gdGhlIHBsdWdpblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcblx0dGhpcy5hZGRBY3Rpb24gPSBhZGRBY3Rpb247XG5cdHRoaXMuYWRkQWN0aW9uT25jZSA9IGFkZEFjdGlvbk9uY2U7XG5cdHRoaXMucmVtb3ZlQWN0aW9uID0gcmVtb3ZlQWN0aW9uO1xuXHR0aGlzLmZpcmVBY3Rpb24gPSBmaXJlQWN0aW9uO1xuXHR0aGlzLmRlY29yYXRlKGRlY29yYXRvcnMpO1xuXG5cdHZhciBpbml0QWN0aW9ucyA9IF8ucmVzdWx0KHRoaXMsIFwiYWN0aW9uc1wiKTtcblx0aWYgKGluaXRBY3Rpb25zICE9IG51bGwpIHRoaXMuYWRkQWN0aW9uKGluaXRBY3Rpb25zKTtcbn1cblxuLy8gZ2VuZXJhdGUgZGVjb3JhdG9yc1xudmFyIGV2ZW50TmFtZXMgPSBbXG5cdCdsb2FkJywgJ3Njcm9sbCcsXG5cdCdjbGljaycsICdkYmxjbGljaycsICdtb3VzZWRvd24nLCAnbW91c2V1cCcsICdtb3VzZWVudGVyJywgJ21vdXNlbGVhdmUnLFxuXHQna2V5ZG93bicsICdrZXlwcmVzcycsICdrZXl1cCcsXG5cdCdibHVyJywgJ2ZvY3VzJywgJ2NoYW5nZScsICdpbnB1dCcsICdzdWJtaXQnLCAncmVzZXQnLCBcblx0J2RyYWcnLCAnZHJhZ2Ryb3AnLCAnZHJhZ2VuZCcsICdkcmFnZW50ZXInLCAnZHJhZ2V4aXQnLCAnZHJhZ2xlYXZlJywgJ2RyYWdvdmVyJywgJ2RyYWdzdGFydCcsICdkcm9wJ1xuXTtcblxudmFyIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xudmFyIGRlY29yYXRvcnMgPSB7fTtcblxuZXZlbnROYW1lcy5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XG5cdGRlY29yYXRvcnNbXCJvbi1cIiArIGV2ZW50XSA9IGZ1bmN0aW9uKGRlY29yLCBrZXkpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXMsXG5cdFx0XHRhcmdzLCBub2RlO1xuXG5cdFx0ZnVuY3Rpb24gbGlzdGVuZXIoZSkge1xuXHRcdFx0Ly8gY3JlYXRlIGEgbmV3IGFjdGlvbiBvYmplY3Rcblx0XHRcdHZhciBhY3Rpb24gPSBuZXcgQWN0aW9uKGtleSk7XG5cdFx0XHRhY3Rpb24ub3JpZ2luYWwgPSBlO1xuXHRcdFx0YWN0aW9uLnRhcmdldCA9IGFjdGlvbi5ub2RlID0gbm9kZTtcblx0XHRcdGFjdGlvbi5jb250ZXh0ID0gYWN0aW9uLm1vZGVsID0gZGVjb3IubW9kZWw7XG5cdFx0XHRhY3Rpb24udmlldyA9IGRlY29yLnZpZXc7XG5cblx0XHRcdC8vIGZpbmQgdGhlIGZpcnN0IHBhcmVudCB3aXRoIHRoZSBmaXJlIG1ldGhvZFxuXHRcdFx0dmFyIGZpcmVPbiA9IHNlbGY7XG5cdFx0XHR3aGlsZSAodHlwZW9mIGZpcmVPbi5maXJlQWN0aW9uICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0Ly8gaWYgaXQgaGFzIG5vIHBhcmVudCwgd2UgY2FuJ3QgZG8gYW55dGhpbmdcblx0XHRcdFx0aWYgKGZpcmVPbi5wYXJlbnRSYW5nZSA9PSBudWxsKSByZXR1cm47XG5cdFx0XHRcdGZpcmVPbiA9IGZpcmVPbi5wYXJlbnRSYW5nZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZmlyZSB0aGUgYWN0aW9uXG5cdFx0XHRmaXJlT24uZmlyZUFjdGlvbi5hcHBseShmaXJlT24sIFsgYWN0aW9uIF0uY29uY2F0KGFyZ3MpKTtcblx0XHR9XG5cblx0XHRub2RlID0gZGVjb3IudGFyZ2V0O1xuXHRcdGFyZ3MgPSBfLnRvQXJyYXkoYXJndW1lbnRzKS5zbGljZSgyKTtcblx0XHRub2RlLmFkZEV2ZW50TGlzdGVuZXIoZXZlbnQsIGxpc3RlbmVyKTtcblxuXHRcdGRlY29yLmNvbXAub25JbnZhbGlkYXRlKGZ1bmN0aW9uKCkge1xuXHRcdFx0bm9kZS5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50LCBsaXN0ZW5lcik7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG4vLyBBY3Rpb24gQ2xhc3NcbmZ1bmN0aW9uIEFjdGlvbihuYW1lKSB7XG5cdHRoaXMubmFtZSA9IG5hbWU7XG59XG5cbk11c3RhY2hlLkFjdGlvbiA9IEFjdGlvbjtcblxuQWN0aW9uLnByb3RvdHlwZS5idWJibGVzID0gdHJ1ZTtcblxuQWN0aW9uLnByb3RvdHlwZS5zdG9wUHJvcGFnYXRpb24gPSBmdW5jdGlvbigpIHtcblx0dGhpcy5idWJibGVzID0gZmFsc2U7XG5cdHJldHVybiB0aGlzO1xufVxuXG4vLyBNc3V0YWNoZSBJbnN0YW5jZSBNZXRob2RzXG5mdW5jdGlvbiBhZGRBY3Rpb24obmFtZSwgZm4pIHtcblx0aWYgKHR5cGVvZiBuYW1lID09PSBcIm9iamVjdFwiICYmIGZuID09IG51bGwpIHtcblx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24oZm4sIG4pIHsgdGhpcy5hZGRBY3Rpb24obiwgZm4pOyB9LCB0aGlzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIiB8fCBuYW1lID09PSBcIlwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgbm9uLWVtcHR5IHN0cmluZyBmb3IgYWN0aW9uIG5hbWUuXCIpO1xuXHRpZiAodHlwZW9mIGZuICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgYWN0aW9uLlwiKTtcblxuXHRpZiAodGhpcy5fYWN0aW9ucyA9PSBudWxsKSB0aGlzLl9hY3Rpb25zID0ge307XG5cdGlmICh0aGlzLl9hY3Rpb25zW25hbWVdID09IG51bGwpIHRoaXMuX2FjdGlvbnNbbmFtZV0gPSBbXTtcblx0aWYgKCF+dGhpcy5fYWN0aW9uc1tuYW1lXS5pbmRleE9mKGZuKSkgdGhpcy5fYWN0aW9uc1tuYW1lXS5wdXNoKGZuKTtcblx0XG5cdHJldHVybiB0aGlzO1xufVxuXG5mdW5jdGlvbiBhZGRBY3Rpb25PbmNlKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJvYmplY3RcIiAmJiBmbiA9PSBudWxsKSB7XG5cdFx0Xy5lYWNoKG5hbWUsIGZ1bmN0aW9uKGZuLCBuKSB7IHRoaXMuYWRkQWN0aW9uT25jZShuLCBmbik7IH0sIHRoaXMpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0dmFyIG9uQWN0aW9uO1xuXG5cdHRoaXMuYWRkQWN0aW9uKG5hbWUsIG9uQWN0aW9uID0gZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMucmVtb3ZlQWN0aW9uKG5hbWUsIG9uQWN0aW9uKTtcblx0XHRmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9KTtcblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gcmVtb3ZlQWN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSA9PT0gXCJmdW5jdGlvblwiICYmIGZuID09IG51bGwpIHtcblx0XHRmbiA9IG5hbWU7XG5cdFx0bmFtZSA9IG51bGw7XG5cdH1cblxuXHRpZiAodGhpcy5fYWN0aW9ucyA9PSBudWxsIHx8IChuYW1lID09IG51bGwgJiYgZm4gPT0gbnVsbCkpIHtcblx0XHR0aGlzLl9hY3Rpb25zID0ge307XG5cdH1cblxuXHRlbHNlIGlmIChmbiA9PSBudWxsKSB7XG5cdFx0ZGVsZXRlIHRoaXMuX2FjdGlvbnNbbmFtZV07XG5cdH1cblxuXHRlbHNlIGlmIChuYW1lID09IG51bGwpIHtcblx0XHRfLmVhY2godGhpcy5fYWN0aW9ucywgZnVuY3Rpb24oZCwgbikge1xuXHRcdFx0dGhpcy5fYWN0aW9uc1tuXSA9IGQuZmlsdGVyKGZ1bmN0aW9uKGYpIHsgcmV0dXJuIGYgIT09IGZuOyB9KTtcblx0XHR9LCB0aGlzKTtcblx0fVxuXG5cdGVsc2UgaWYgKHRoaXMuX2FjdGlvbnNbbmFtZV0gIT0gbnVsbCkge1xuXHRcdHRoaXMuX2FjdGlvbnNbbmFtZV0gPSBfLndpdGhvdXQodGhpcy5fYWN0aW9uc1tuYW1lXSwgZm4pO1xuXHR9XG5cblx0cmV0dXJuIHRoaXM7XG59XG5cbmZ1bmN0aW9uIGZpcmVBY3Rpb24oYWN0aW9uKSB7XG5cdGlmICh0eXBlb2YgYWN0aW9uID09PSBcInN0cmluZ1wiKSBhY3Rpb24gPSBuZXcgQWN0aW9uKGFjdGlvbik7XG5cdGlmIChfLmlzT2JqZWN0KGFjdGlvbikgJiYgIShhY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb24pKSBhY3Rpb24gPSBfLmV4dGVuZChuZXcgQWN0aW9uLCBhY3Rpb24pO1xuXHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBBY3Rpb24pKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYWN0aW9uIG5hbWUsIG9iamVjdCBvciBpbnN0YW5jZSBvZiBBY3Rpb24uXCIpO1xuXHRcblx0dmFyIG5hbWUgPSBhY3Rpb24ubmFtZSxcblx0XHRhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuXG5cdGFyZ3MudW5zaGlmdChhY3Rpb24pO1xuXG5cdGlmICh0aGlzLl9hY3Rpb25zICE9IG51bGwgJiYgQXJyYXkuaXNBcnJheSh0aGlzLl9hY3Rpb25zW25hbWVdKSkge1xuXHRcdHRoaXMuX2FjdGlvbnNbbmFtZV0uc29tZShmdW5jdGlvbihmbikge1xuXHRcdFx0aWYgKCFhY3Rpb24uYnViYmxlcykgcmV0dXJuIHRydWU7XG5cdFx0XHRmbi5hcHBseSh0aGlzLCBhcmdzKTtcblx0XHR9LCB0aGlzKTtcblx0fVxuXG5cdGlmIChhY3Rpb24uYnViYmxlcyAmJiB0aGlzLnBhcmVudFJhbmdlICE9IG51bGwpIHtcblx0XHQvLyBmaW5kIHRoZSBmaXJzdCBwYXJlbnQgd2l0aCB0aGUgZmlyZSBtZXRob2Rcblx0XHR2YXIgZmlyZU9uID0gdGhpcy5wYXJlbnRSYW5nZTtcblx0XHR3aGlsZSAodHlwZW9mIGZpcmVPbi5maXJlQWN0aW9uICE9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdC8vIGlmIGl0IGhhcyBubyBwYXJlbnQsIHdlIGNhbid0IGRvIGFueXRoaW5nXG5cdFx0XHRpZiAoZmlyZU9uLnBhcmVudFJhbmdlID09IG51bGwpIHJldHVybjtcblx0XHRcdGZpcmVPbiA9IGZpcmVPbi5wYXJlbnRSYW5nZTtcblx0XHR9XG5cblx0XHRmaXJlT24uZmlyZUFjdGlvbi5hcHBseShmaXJlT24sIGFyZ3MpO1xuXHR9XG5cdFxuXHRyZXR1cm4gdGhpcztcbn0iLCJ2YXIgTXVzdGFjaGUgPSByZXF1aXJlKFwiLi4vXCIpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKCkge1xuXHR0aGlzLmFkb3B0ID0gYWRvcHQ7XG5cdHRoaXMuZGlzb3duID0gZGlzb3duO1xufVxuXG5mdW5jdGlvbiBhZG9wdCh2aWV3LCBwYXJlbnQsIGJlZm9yZSkge1xuXHRpZiAoISh2aWV3IGluc3RhbmNlb2YgTXVzdGFjaGUuVmlldykpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgaW5zdGFuY2VvZiBUZW1wbGUgVmlldy5cIik7XG5cdH1cblxuXHRpZiAodGhpcy5fYWRvcHRlZCA9PSBudWxsKSB0aGlzLl9hZG9wdGVkID0gW107XG5cblx0Ly8gbWFrZSBzdXJlIGl0IGlzIGFuIGluZGVwZW5kZW50XG5cdHZpZXcuZGV0YWNoKCk7XG5cblx0Ly8gaG9vayBuYXZiYXIgZGF0YSB1cCB0byB0aGlzIGRhdGFcblx0dmlldy5nZXRSb290TW9kZWwoKS5wYXJlbnQgPSB0aGlzLm1vZGVsO1xuXG5cdC8vIHJlbmRlciB3aGVuIG5vdCBpbiBsb2FkaW5nIG1vZGVcblx0dmFyIG9uUmVuZGVyO1xuXHR0aGlzLm9uKFwicmVuZGVyXCIsIG9uUmVuZGVyID0gZnVuY3Rpb24oYSwgY29tcCkge1xuXHRcdGlmIChjb21wLmZpcnN0UnVuKSB2aWV3LnBhaW50KHBhcmVudCwgYmVmb3JlKTtcblx0XHRjb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHZpZXcuZGV0YWNoKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRoaXMuX2Fkb3B0ZWQucHVzaCh7XG5cdFx0cmVuZGVyOiBvblJlbmRlcixcblx0XHR2aWV3OiB2aWV3XG5cdH0pO1xuXG5cdHJldHVybiB2aWV3O1xufVxuXG5mdW5jdGlvbiBkaXNvd24odmlldykge1xuXHRpZiAodGhpcy5fYWRvcHRlZCA9PSBudWxsKSByZXR1cm47XG5cblx0dmFyIGluZGV4O1xuXHRpZiAodGhpcy5fYWRvcHRlZC5zb21lKGZ1bmN0aW9uKGEsIGkpIHtcblx0XHRpZiAoYS52aWV3ID09PSB2aWV3KSB7XG5cdFx0XHRpbmRleCA9IGk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdH0pKSByZXR1cm47XG5cblx0dGhpcy5vZmYoXCJyZW5kZXJcIiwgdGhpcy5fYWRvcHRlZFtpXS5yZW5kZXIpO1xuXHR0aGlzLl9hZG9wdGVkLnNwbGljZShpbmRleCwgMSk7XG5cblx0cmV0dXJuIHZpZXc7XG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG52YXIgcGx1Z2lucyA9XG5leHBvcnRzLl9wbHVnaW5zID0ge307XG5cbmV4cG9ydHMubG9hZFBsdWdpbiA9IGZ1bmN0aW9uKHRwbCwgcGx1Z2luLCBhcmdzKSB7XG5cdGlmIChfLmlzU3RyaW5nKHBsdWdpbikpIHtcblx0XHRpZiAocGx1Z2luc1twbHVnaW5dID09IG51bGwpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJObyBwbHVnaW4gZXhpc3RzIHdpdGggaWQgJ1wiICsgcGx1Z2luICsgXCInLlwiKTtcblxuXHRcdHBsdWdpbiA9IHBsdWdpbnNbcGx1Z2luXTtcblx0fVxuXG5cdGlmICghXy5pc0Z1bmN0aW9uKHBsdWdpbikpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiRXhwZWN0aW5nIHN0cmluZyBvciBmdW5jdGlvbiBmb3IgcGx1Z2luXCIpO1xuXG5cdC8vIGNoZWNrIGlmIHBsdWdpbiBpcyBhbHJlYWR5IGxvYWRlZCBvbiB0aGlzIHRlbXBsYXRlXG5cdGlmICh0cGwuX2xvYWRlZF9wbHVnaW5zID09IG51bGwpIHRwbC5fbG9hZGVkX3BsdWdpbnMgPSBbXTtcblx0aWYgKH50cGwuX2xvYWRlZF9wbHVnaW5zLmluZGV4T2YocGx1Z2luKSkgcmV0dXJuIHRwbDtcblx0dHBsLl9sb2FkZWRfcGx1Z2lucy5wdXNoKHBsdWdpbik7XG5cblx0aWYgKGFyZ3MgPT0gbnVsbCkgYXJncyA9IFtdO1xuXHRpZiAoIV8uaXNBcnJheShhcmdzKSkgYXJncyA9IFsgYXJncyBdO1xuXG5cdHBsdWdpbi5hcHBseSh0cGwsIGFyZ3MpO1xuXHRyZXR1cm4gdHBsO1xufVxuXG52YXIgcmVnaXN0ZXJQbHVnaW4gPVxuZXhwb3J0cy5yZWdpc3RlclBsdWdpbiA9IGZ1bmN0aW9uKG5hbWUsIGZuKSB7XG5cdGlmICh0eXBlb2YgbmFtZSAhPT0gXCJzdHJpbmdcIikge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgbmFtZSBmb3IgcGx1Z2luLlwiKTtcblx0fVxuXG5cdGlmICh0eXBlb2YgZm4gIT09IFwiZnVuY3Rpb25cIikge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3IgcGx1Z2luLlwiKTtcblx0fVxuXG5cdGlmIChmbiA9PT0gcGx1Z2luc1tuYW1lXSkgcmV0dXJuO1xuXHRpZiAocGx1Z2luc1tuYW1lXSAhPSBudWxsKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiUmVmdXNpbmcgdG8gb3ZlcndyaXRlIGV4aXN0aW5nIHBsdWdpbiBcXFwibmFtZVxcXCIuXCIpO1xuXHR9XG5cblx0cGx1Z2luc1tuYW1lXSA9IGZuO1xufVxuXG4vLyBsb2FkIGJ1aWx0IGluIHBsdWdpbnNcbnJlZ2lzdGVyUGx1Z2luKFwiYWN0aW9uc1wiLCByZXF1aXJlKFwiLi9hY3Rpb25zXCIpKTtcbnJlZ2lzdGVyUGx1Z2luKFwidHdvd2F5XCIsIHJlcXVpcmUoXCIuL3R3b3dheVwiKSk7XG5yZWdpc3RlclBsdWdpbihcImFkb3B0aW9uXCIsIHJlcXVpcmUoXCIuL2Fkb3B0aW9uXCIpKTtcbnJlZ2lzdGVyUGx1Z2luKFwicmVmc1wiLCByZXF1aXJlKFwiLi9yZWZzXCIpKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG5cdHRoaXMucmVmcyA9IHt9O1xuXHR0aGlzLmRlY29yYXRlKFwicmVmXCIsIHJlZik7XG5cdHRoaXMuZmluZEJ5UmVmID0gZmluZEJ5UmVmO1xufVxuXG5mdW5jdGlvbiByZWYoZCwga2V5KSB7XG5cdC8vIGRvbid0IG92ZXJ3cml0ZVxuXHRpZiAodGhpcy5yZWZzW2tleV0gIT0gbnVsbCkge1xuXHRcdGNvbnNvbGUud2FybihcIk11bHRpcGxlIGVsZW1lbnRzIHdpdGggcmVmZXJlbmNlICclcycuXCIsIGtleSk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gc2V0IHRoZSByZWZlcmVuY2Vcblx0dGhpcy5yZWZzW2tleV0gPSBkLnRhcmdldDtcblxuXHQvLyByZW1vdmUgdGhlIHJlZmVyZW5jZSB3aGVuIHRoZSBlbGVtZW50IGRpc2FwcGVhcnNcblx0ZC5jb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRkZWxldGUgdGhpcy5yZWZzW2tleV07XG5cdH0pO1xufVxuXG5mdW5jdGlvbiBmaW5kQnlSZWYoa2V5KSB7XG5cdHZhciB0cGwgPSB0aGlzO1xuXG5cdHdoaWxlICh0cGwgIT0gbnVsbCkge1xuXHRcdGlmICh0cGwucmVmcyAmJiB0cGwucmVmc1trZXldKSByZXR1cm4gdHBsLnJlZnNba2V5XTtcblx0XHR0cGwgPSB0cGwucGFyZW50UmFuZ2U7XG5cdH1cblxuXHRyZXR1cm4gbnVsbDtcbn1cbiIsInZhciBfID0gcmVxdWlyZShcInVuZGVyc2NvcmVcIik7XG5cbnZhciBpbnB1dF90eXBlcyA9IFsgXCJ0ZXh0XCIsIFwibnVtYmVyXCIsIFwiZGF0ZVwiIF07XG52YXIgdmFsdWVfdHlwZXMgPSBbIFwicmFkaW9cIiwgXCJvcHRpb25cIiBdO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0Ly8gYWRkIG1ldGhvZHNcblx0dGhpcy5hZGRGb3JtQmluZGluZyA9IGFkZEZvcm1CaW5kaW5nO1xuXHR0aGlzLmdldEZvcm1CaW5kaW5nID0gZ2V0Rm9ybUJpbmRpbmc7XG5cdHRoaXMucmVtb3ZlRm9ybUJpbmRpbmcgPSByZW1vdmVGb3JtQmluZGluZztcblxuXHQvLyBhZGQgbWFpbiBiaW5kaW5nIGRlY29yYXRvclxuXHR0aGlzLmRlY29yYXRlKFwiYmluZC10b1wiLCBmdW5jdGlvbiBiaW5kVG8oZCwgaWQsIGxhenkpIHtcblx0XHR2YXIgZmJpbmQgPSB0aGlzLmdldEZvcm1CaW5kaW5nKGlkKTtcblx0XHRpZiAoZmJpbmQgPT0gbnVsbCkgcmV0dXJuO1xuXG5cdFx0dmFyIGVsID0gZC50YXJnZXQsXG5cdFx0XHR0eXBlID0gZ2V0VHlwZShlbCksXG5cdFx0XHRzZWxmID0gdGhpcyxcblx0XHRcdGV2dE5hbWUsIG9uQ2hhbmdlLCBsYXp5O1xuXG5cdFx0Ly8gZGV0ZWN0IGNoYW5nZXMgdG8gdGhlIGlucHV0J3MgdmFsdWVcblx0XHRpZiAodHlwZW9mIGZiaW5kLmNoYW5nZSA9PT0gXCJmdW5jdGlvblwiKSB7XG5cdFx0XHRvbkNoYW5nZSA9IGZ1bmN0aW9uKGUpIHtcblx0XHRcdFx0ZmJpbmQuY2hhbmdlLmNhbGwoc2VsZiwgZ2V0Tm9kZVZhbHVlKGVsLCB0eXBlKSwgZC5tb2RlbCwgZSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRldnROYW1lID0gXy5jb250YWlucyhpbnB1dF90eXBlcywgdHlwZSkgPyBcImlucHV0XCIgOiBcImNoYW5nZVwiO1xuXHRcdFx0ZWwuYWRkRXZlbnRMaXN0ZW5lcihldnROYW1lLCBvbkNoYW5nZSk7XG5cdFx0XHRpZiAoIShvcHRpb25zLmxhenkgfHwgbGF6eSkpIGVsLmFkZEV2ZW50TGlzdGVuZXIoXCJrZXl1cFwiLCBvbkNoYW5nZSk7XG5cblx0XHRcdGQuY29tcC5vbkludmFsaWRhdGUoZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGVsLnJlbW92ZUV2ZW50TGlzdGVuZXIoZXZ0TmFtZSwgb25DaGFuZ2UpO1xuXHRcdFx0XHRlbC5yZW1vdmVFdmVudExpc3RlbmVyKFwia2V5dXBcIiwgb25DaGFuZ2UpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gcmVhY3RpdmVseSBzZXQgdGhlIHZhbHVlIG9uIHRoZSBpbnB1dFxuXHRcdHZhciBjID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKCkge1xuXHRcdFx0c2V0Tm9kZVZhbHVlKGVsLCBmYmluZC5nZXQuY2FsbChzZWxmLCBkLm1vZGVsKSwgdHlwZSk7XG5cdFx0fSk7XG5cblx0XHQvLyBzZXROb2RlVmFsdWUgcmVsaWVzIG9uIHRoZSBjaGlsZHJlbiBlbGVtZW50c1xuXHRcdC8vIHRob3NlIHdvbid0IGJlIGluIHRoZSBET00gdGlsbCBhdCBsZWFzdCB0aGUgbmV4dCB0aWNrXG5cdFx0Yy5pbnZhbGlkYXRlKCk7XG5cdH0pO1xuXG5cdC8vIGFkZCB2YWx1ZSBkZWNvcmF0b3IgZm9yIHJhZGlvcyBhbmQgb3B0aW9uc1xuXHR0aGlzLmRlY29yYXRlKFwidmFsdWVcIiwgZnVuY3Rpb24gdmFsdWVPZihkLCBzdHJ2YWwpIHtcblx0XHR2YXIgZWwgPSBkLnRhcmdldCxcblx0XHRcdHR5cGUgPSBnZXRUeXBlKGVsKSxcblx0XHRcdHNlbGYgPSB0aGlzO1xuXHRcdFxuXHRcdGlmICghXy5jb250YWlucyh2YWx1ZV90eXBlcywgdHlwZSkpIHtcblx0XHRcdGVsLnZhbHVlID0gc3RydmFsO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBhcmdzID0gdGhpcy5yZW5kZXJBcmd1bWVudHMoZC50ZW1wbGF0ZS5hcmd1bWVudHMsIGQubW9kZWwpO1xuXHRcdGVsLiRib3VuZF92YWx1ZSA9IGFyZ3MubGVuZ3RoIDw9IDEgPyBhcmdzWzBdIDogYXJncztcblx0XHRlbC52YWx1ZSA9IHN0cnZhbDtcblx0fSwgeyBwYXJzZTogXCJzdHJpbmdcIiB9KTtcblxuXHQvLyBhZGQgaW5pdGlhbCBmb3JtIGJpbmRpbmdzXG5cdHZhciBpbml0aWFsQmluZHMgPSBfLnJlc3VsdCh0aGlzLCBcInR3b3dheVwiKTtcblx0aWYgKF8uaXNPYmplY3QoaW5pdGlhbEJpbmRzKSkgdGhpcy5hZGRGb3JtQmluZGluZyhpbml0aWFsQmluZHMpO1xufVxuXG5mdW5jdGlvbiBhZGRGb3JtQmluZGluZyhpZCwgZ2V0dGVyLCBvbkNoYW5nZSkge1xuXHRpZiAoXy5pc09iamVjdChpZCkpIHtcblx0XHRfLmVhY2goaWQsIGZ1bmN0aW9uKHYsIGspIHtcblx0XHRcdGFkZEZvcm1CaW5kaW5nLmNhbGwodGhpcywgaywgdik7XG5cdFx0fSwgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cblxuXHRpZiAodHlwZW9mIGlkICE9PSBcInN0cmluZ1wiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgYSBzdHJpbmcgZm9yIHRoZSBmb3JtIGJpbmRpbmcgSUQuXCIpO1xuXHRpZiAodGhpcy5fZm9ybUJpbmRpbmdzID09IG51bGwpIHRoaXMuX2Zvcm1CaW5kaW5ncyA9IHt9O1xuXHRpZiAodGhpcy5fZm9ybUJpbmRpbmdzW2lkXSAhPSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJBIGZvcm0gYmluZGluZyB3aXRoIGlkICdcIiArIGlkICsgXCInIGFscmVhZHkgZXhpc3RzLlwiKTtcblxuXHRpZiAoXy5pc09iamVjdChnZXR0ZXIpICYmIG9uQ2hhbmdlID09IG51bGwpIHtcblx0XHRvbkNoYW5nZSA9IGdldHRlci5jaGFuZ2U7XG5cdFx0Z2V0dGVyID0gZ2V0dGVyLmdldDtcblx0fVxuXG5cdGlmICh0eXBlb2YgZ2V0dGVyICE9PSBcImZ1bmN0aW9uXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhIGZ1bmN0aW9uIG9yIG9iamVjdCBmb3IgdGhlIGZvcm0gYmluZGluZyBnZXR0ZXIuXCIpO1xuXHRpZiAodHlwZW9mIG9uQ2hhbmdlICE9PSBcImZ1bmN0aW9uXCIpIG9uQ2hhbmdlID0gbnVsbDtcblxuXHR0aGlzLl9mb3JtQmluZGluZ3NbaWRdID0ge1xuXHRcdGdldDogZ2V0dGVyLFxuXHRcdGNoYW5nZTogb25DaGFuZ2Vcblx0fTtcblxuXHRyZXR1cm4gdGhpcztcbn1cblxuZnVuY3Rpb24gZ2V0Rm9ybUJpbmRpbmcoaWQpIHtcblx0aWYgKHR5cGVvZiBpZCAhPT0gXCJzdHJpbmdcIikgcmV0dXJuO1xuXHR2YXIgYyA9IHRoaXMsIGJpbmRpbmdzO1xuXG5cdHdoaWxlIChjICE9IG51bGwpIHtcblx0XHRiaW5kaW5ncyA9IGMuX2Zvcm1CaW5kaW5ncztcblx0XHRpZiAoYmluZGluZ3MgIT0gbnVsbCAmJiBiaW5kaW5nc1tpZF0gIT0gbnVsbCkgcmV0dXJuIGJpbmRpbmdzW2lkXTtcblx0XHRjID0gYy5wYXJlbnRSYW5nZTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW1vdmVGb3JtQmluZGluZyhpZCkge1xuXHR2YXIgZXhpc3RzID0gdGhpcy5fZm9ybUJpbmRpbmdzW2lkXSAhPSBudWxsO1xuXHRkZWxldGUgdGhpcy5fZm9ybUJpbmRpbmdzW2lkXTtcblx0cmV0dXJuIGV4aXN0cztcbn1cblxudmFyIHR5cGVfbWFwID0ge1xuXHRcInRleHRcIjogWyBcInRleHRcIiwgXCJjb2xvclwiLCBcImVtYWlsXCIsIFwicGFzc3dvcmRcIiwgXCJzZWFyY2hcIiwgXCJ0ZWxcIiwgXCJ1cmxcIiwgXCJoaWRkZW5cIiBdLFxuXHRcIm51bWJlclwiOiBbIFwibnVtYmVyXCIsIFwicmFuZ2VcIiBdLFxuXHRcImRhdGVcIjogWyBcImRhdGVcIiwgXCJkYXRldGltZVwiLCBcImRhdGV0aW1lLWxvY2FsXCIsIFwibW9udGhcIiwgXCJ0aW1lXCIsIFwid2Vla1wiIF0sXG5cdFwiZmlsZVwiOiBbIFwiZmlsZVwiIF0sXG5cdFwiY2hlY2tib3hcIjogWyBcImNoZWNrYm94XCIgXSxcblx0XCJyYWRpb1wiOiBbIFwicmFkaW9cIiBdXG59XG5cbmZ1bmN0aW9uIGdldFR5cGUoZWwpIHtcblx0c3dpdGNoIChlbC50YWdOYW1lLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRjYXNlIFwiaW5wdXRcIjpcblx0XHRcdGZvciAodmFyIHR5cGUgaW4gdHlwZV9tYXApIHtcblx0XHRcdFx0aWYgKF8uY29udGFpbnModHlwZV9tYXBbdHlwZV0sIGVsLnR5cGUpKSByZXR1cm4gdHlwZTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInNlbGVjdFwiOlxuXHRcdFx0cmV0dXJuIFwic2VsZWN0XCI7XG5cblx0XHRjYXNlIFwib3B0aW9uXCI6XG5cdFx0XHRyZXR1cm4gXCJvcHRpb25cIjtcblxuXHRcdGNhc2UgXCJ0ZXh0YXJlYVwiOlxuXHRcdFx0cmV0dXJuIFwidGV4dFwiO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldE5vZGVWYWx1ZShub2RlLCB0eXBlKSB7XG5cdGlmICh0eXBlID09IG51bGwpIHR5cGUgPSBnZXRUeXBlKG5vZGUpO1xuXHR2YXIgdmFsO1xuXG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdHZhbCA9IG5vZGUudmFsdWVBc051bWJlcjtcblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgXCJ0ZXh0XCI6XG5cdFx0XHR2YWwgPSBub2RlLnZhbHVlO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiY2hlY2tib3hcIjpcblx0XHRcdHZhbCA9IG5vZGUuY2hlY2tlZDtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImRhdGVcIjpcblx0XHRcdHZhbCA9IG5vZGUudmFsdWVBc0RhdGU7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJzZWxlY3RcIjpcblx0XHRcdHZhciBvcHQgPSBub2RlLnF1ZXJ5U2VsZWN0b3IoXCJvcHRpb246Y2hlY2tlZFwiKTtcblx0XHRcdGlmIChvcHQgIT0gbnVsbCkgdmFsID0gb3B0LiRib3VuZF92YWx1ZTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcImZpbGVcIjpcblx0XHRcdHZhbCA9ICFub2RlLm11bHRpcGxlID8gbm9kZS5maWxlc1swXSA6IF8udG9BcnJheShub2RlLmZpbGVzKTtcblx0XHRcdGJyZWFrO1xuXG5cdFx0Y2FzZSBcInJhZGlvXCI6XG5cdFx0XHR2YWwgPSBub2RlLiRib3VuZF92YWx1ZTtcblx0XHRcdGJyZWFrO1xuXHR9XG5cblx0cmV0dXJuIHZhbDtcbn1cblxuZnVuY3Rpb24gc2V0Tm9kZVZhbHVlKGVsLCB2YWwsIHR5cGUpIHtcblx0aWYgKHR5cGUgPT0gbnVsbCkgdHlwZSA9IGdldFR5cGUoZWwpO1xuXG5cdHN3aXRjaCAodHlwZSkge1xuXHRcdGNhc2UgXCJudW1iZXJcIjpcblx0XHRcdGlmIChkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBlbCkgcmV0dXJuO1xuXHRcdFx0aWYgKF8uaXNOdW1iZXIodmFsKSkgZWwudmFsdWVBc051bWJlciA9IHZhbDtcblx0XHRcdGVsc2UgZWwudmFsdWUgPSB2YWw7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJ0ZXh0XCI6XG5cdFx0XHRpZiAoZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gZWwpIHJldHVybjtcblx0XHRcdGVsLnZhbHVlID0gdmFsID09IG51bGwgPyBcIlwiIDogdmFsLnRvU3RyaW5nKCk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJjaGVja2JveFwiOlxuXHRcdFx0ZWwuY2hlY2tlZCA9ICEhdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwiZGF0ZVwiOlxuXHRcdFx0aWYgKGRvY3VtZW50LmFjdGl2ZUVsZW1lbnQgPT09IGVsKSByZXR1cm47XG5cdFx0XHRpZiAoXy5pc0RhdGUodmFsKSkgZWwudmFsdWVBc0RhdGUgPSB2YWw7XG5cdFx0XHRlbHNlIGVsLnZhbHVlID0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cblx0XHRjYXNlIFwic2VsZWN0XCI6XG5cdFx0XHRfLnRvQXJyYXkoZWwucXVlcnlTZWxlY3RvckFsbChcIm9wdGlvblwiKSkuZm9yRWFjaChmdW5jdGlvbihvcHQpIHtcblx0XHRcdFx0b3B0LnNlbGVjdGVkID0gb3B0LiRib3VuZF92YWx1ZSA9PT0gdmFsO1xuXHRcdFx0fSk7XG5cdFx0XHRicmVhaztcblxuXHRcdGNhc2UgXCJyYWRpb1wiOlxuXHRcdFx0ZWwuY2hlY2tlZCA9IGVsLiRib3VuZF92YWx1ZSA9PT0gdmFsO1xuXHRcdFx0YnJlYWs7XG5cdH1cbn0iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xudmFyIFRyYWNrciA9IHJlcXVpcmUoXCJ0cmFja3JcIik7XG52YXIgdXRpbHMgPSByZXF1aXJlKFwiLi91dGlsc1wiKTtcbnZhciBNb2RlbCA9IHJlcXVpcmUoXCIuL21vZGVsXCIpO1xudmFyIFZpZXcgPSByZXF1aXJlKFwiLi92aWV3XCIpO1xuXG52YXIgU2VjdGlvbiA9XG5tb2R1bGUuZXhwb3J0cyA9IFZpZXcuZXh0ZW5kKHtcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKCkge1xuXHRcdHRoaXMucm93cyA9IHt9O1xuXHRcdHRoaXMuX3Jvd19kZXBzID0ge307XG5cdFx0Vmlldy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuXHR9LFxuXG5cdGludmVydDogZnVuY3Rpb24odmFsKSB7XG5cdFx0aWYgKCFfLmlzQm9vbGVhbih2YWwpKSB2YWwgPSAhdGhpcy5faW52ZXJ0ZWQ7XG5cdFx0dGhpcy5faW52ZXJ0ZWQgPSB2YWw7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0aXNJbnZlcnRlZDogZnVuY3Rpb24oKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5faW52ZXJ0ZWQ7XG5cdH0sXG5cblx0c2V0UGF0aDogZnVuY3Rpb24ocGF0aCkge1xuXHRcdHRoaXMuX3BhdGggPSBwYXRoO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdG9uUm93OiBmdW5jdGlvbihmbikge1xuXHRcdGlmICghXy5pc0Z1bmN0aW9uKGZuKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBmdW5jdGlvbiBmb3Igcm93IGhhbmRsZXIuXCIpO1xuXG5cdFx0dGhpcy5fb25Sb3cgPSBmbjtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHRhZGRSb3c6IGZ1bmN0aW9uKGtleSwgZGF0YSkge1xuXHRcdC8vIHJlbW92ZSBleGlzdGluZ1xuXHRcdHRoaXMucmVtb3ZlUm93KGtleSk7XG5cblx0XHQvLyBjb252ZXJ0IGRhdGEgdG8gbW9kZWxcblx0XHRpZiAoIU1vZGVsLmlzTW9kZWwoZGF0YSkpIHtcblx0XHRcdGRhdGEgPSBuZXcgTW9kZWwoZGF0YSwgdGhpcy5tb2RlbCk7XG5cdFx0fVxuXG5cdFx0Ly8gY3JlYXRlIGEgbmV3IHJvd1xuXHRcdHZhciByb3cgPSBuZXcgVmlldyhkYXRhKTtcblxuXHRcdC8vIHNldCB1cCByZW5kZXIgYW5kIG1vdW50IGl0XG5cdFx0cm93LnJlbmRlciA9IHRoaXMuX29uUm93O1xuXHRcdHRoaXMucm93c1trZXldID0gcm93O1xuXHRcdHRoaXMuYWRkTWVtYmVyKHJvdyk7XG5cdFx0cm93Lm1vdW50KCk7XG5cblx0XHRyZXR1cm4gcm93O1xuXHR9LFxuXG5cdGhhc1JvdzogZnVuY3Rpb24oa2V5KSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Um93KGtleSkgIT0gbnVsbDtcblx0fSxcblxuXHRnZXRSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdHJldHVybiB0aGlzLnJvd3Nba2V5XTtcblx0fSxcblxuXHRyZW1vdmVSb3c6IGZ1bmN0aW9uKGtleSkge1xuXHRcdGlmICh0aGlzLnJvd3Nba2V5XSA9PSBudWxsKSByZXR1cm4gdGhpcztcblxuXHRcdHZhciByb3cgPSB0aGlzLnJvd3Nba2V5XTtcblx0XHR0aGlzLnJlbW92ZU1lbWJlcihyb3cpO1xuXHRcdGRlbGV0ZSB0aGlzLnJvd3Nba2V5XTtcblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdHJlbW92ZUFsbFJvd3M6IGZ1bmN0aW9uKCkge1xuXHRcdE9iamVjdC5rZXlzKHRoaXMucm93cykuZm9yRWFjaCh0aGlzLnJlbW92ZVJvdywgdGhpcyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVuZGVyOiBmdW5jdGlvbigpIHtcblx0XHRpZiAodGhpcy5fcGF0aCA9PSBudWxsKSB0aHJvdyBuZXcgRXJyb3IoXCJNaXNzaW5nIHBhdGguXCIpO1xuXG5cdFx0dmFyIHNlbGYgPSB0aGlzLFxuXHRcdFx0dmFsLCBpc0VtcHR5LCBpbnZlcnRlZCwgaXNMaXN0LFxuXHRcdFx0cm93U29ydCwgbW9kZWwsIHByb3h5LCBrZXlzO1xuXG5cdFx0dmFsID0gdGhpcy5nZXQodGhpcy5fcGF0aCk7XG5cdFx0bW9kZWwgPSBuZXcgTW9kZWwodmFsLCB0aGlzLm1vZGVsKTtcblx0XHRwcm94eSA9IG1vZGVsLmdldFByb3h5QnlWYWx1ZSh2YWwpO1xuXHRcdGludmVydGVkID0gdGhpcy5pc0ludmVydGVkKCk7XG5cdFx0aXNMaXN0ID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwiaXNMaXN0XCIpO1xuXG5cdFx0ZnVuY3Rpb24gZ2V0RW1wdGluZXNzKCkge1xuXHRcdFx0cmV0dXJuIG1vZGVsLmNhbGxQcm94eU1ldGhvZChwcm94eSwgdmFsLCBcImlzRW1wdHlcIik7XG5cdFx0fVxuXG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0aXNFbXB0eSA9ICF2YWwgfHwgKGlzTGlzdCAmJiAhZ2V0RW1wdGluZXNzKCkpXG5cdFx0fSk7XG5cblx0XHRpZiAoaXNFbXB0eSAmJiBpbnZlcnRlZCkge1xuXHRcdFx0aWYgKGlzTGlzdCkgZ2V0RW1wdGluZXNzKCk7XG5cdFx0XHR0aGlzLmFkZFJvdygwLCBtb2RlbCk7XG5cdFx0fSBlbHNlIGlmICghaXNFbXB0eSAmJiAhaW52ZXJ0ZWQpIHtcblx0XHRcdGlmIChpc0xpc3QpIHtcblx0XHRcdFx0a2V5cyA9IFtdO1xuXG5cdFx0XHRcdHRoaXMuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHRcdFx0dmFyIG5rZXlzID0gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCB2YWwsIFwia2V5c1wiKTtcblxuXHRcdFx0XHRcdC8vIHRyaWNrIFRyYWNrciBzbyBhdXRvcnVucyBhcmVuJ3QgY29udHJvbGxlZCBieSB0aGlzIG9uZVxuXHRcdFx0XHRcdFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBjb21wLl9wYXJlbnQ7XG5cblx0XHRcdFx0XHQvLyByZW1vdmUgcmVtb3ZlZCByb3dzXG5cdFx0XHRcdFx0Xy5kaWZmZXJlbmNlKGtleXMsIG5rZXlzKS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuX3Jvd19kZXBzW2tleV0pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fcm93X2RlcHNba2V5XS5zdG9wKCk7XG5cdFx0XHRcdFx0XHRcdGRlbGV0ZSB0aGlzLl9yb3dfZGVwc1trZXldO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aGlzLnJlbW92ZVJvdyhrZXkpO1xuXHRcdFx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHRcdFx0Ly8gYWRkIGFkZGVkIHJvd3Ncblx0XHRcdFx0XHRfLmRpZmZlcmVuY2UobmtleXMsIGtleXMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG5cdFx0XHRcdFx0XHR2YXIgcm93LCBybW9kZWw7XG5cblx0XHRcdFx0XHRcdHJvdyA9IHRoaXMuZ2V0Um93KGtleSk7XG5cdFx0XHRcdFx0XHRybW9kZWwgPSByb3cgIT0gbnVsbCA/IHJvdy5tb2RlbCA6XG5cdFx0XHRcdFx0XHRcdG5ldyBNb2RlbChudWxsLCBuZXcgTW9kZWwoeyAka2V5OiBrZXkgfSwgdGhpcy5tb2RlbCkpO1xuXG5cdFx0XHRcdFx0XHR0aGlzLl9yb3dfZGVwc1trZXldID0gdGhpcy5hdXRvcnVuKGZ1bmN0aW9uKGMpIHtcblx0XHRcdFx0XHRcdFx0cm1vZGVsLnNldChtb2RlbC5jYWxsUHJveHlNZXRob2QocHJveHksIHZhbCwgXCJnZXRcIiwga2V5KSk7XG5cdFx0XHRcdFx0XHRcdC8vIGlmIChyb3dTb3J0ICE9IG51bGwpIHJvd1NvcnQuaW52YWxpZGF0ZSgpO1xuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdC8vIGFkZCB0aGUgcm93IGFmdGVyIHdlIHNldCB0aGUgZGF0YVxuXHRcdFx0XHRcdFx0aWYgKHJvdyA9PSBudWxsKSB0aGlzLmFkZFJvdyhrZXksIHJtb2RlbCk7XG5cdFx0XHRcdFx0fSwgdGhpcyk7XG5cblx0XHRcdFx0XHQvLyBwcmV0ZW5kIGxpa2Ugbm90aGluZyBoYXBwZW5lZFxuXHRcdFx0XHRcdFRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBjb21wO1xuXG5cdFx0XHRcdFx0Ly8gdGhlIG5ldyBzZXQgb2Yga2V5c1xuXHRcdFx0XHRcdGtleXMgPSBua2V5cztcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gYSByZWFjdGl2ZSBjb250ZXh0IHRoYXQgY29udGludW91c2x5IHNvcnRzIHJvd3Ncblx0XHRcdFx0Ly8gcm93U29ydCA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbigpIHtcblx0XHRcdFx0XHQvLyBjb25zb2xlLmxvZyhrZXlzKTtcblx0XHRcdFx0XHQvLyB2YXIgYmVmb3JlID0gbnVsbCwgaSwgcm93O1xuXG5cdFx0XHRcdFx0Ly8gZm9yIChpID0ga2V5cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdC8vIFx0cm93ID0gdGhpcy5nZXRSb3coa2V5c1tpXSk7XG5cdFx0XHRcdFx0Ly8gXHRpZiAocm93ID09IG51bGwpIGNvbnRpbnVlO1xuXHRcdFx0XHRcdC8vIFx0dGhpcy5pbnNlcnRCZWZvcmUocm93LCBiZWZvcmUpO1xuXHRcdFx0XHRcdC8vIFx0YmVmb3JlID0gcm93O1xuXHRcdFx0XHRcdC8vIH1cblx0XHRcdFx0Ly8gfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmFkZFJvdygwLCBtb2RlbCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc0xpc3QpIHtcblx0XHRcdGdldEVtcHRpbmVzcygpO1xuXHRcdH1cblxuXHRcdC8vIGF1dG8gY2xlYW5cblx0XHR0aGlzLm9uY2UoXCJpbnZhbGlkYXRlXCIsIGZ1bmN0aW9uKCkge1xuXHRcdFx0dGhpcy5fcm93X2RlcHMgPSB7fTtcblx0XHRcdHRoaXMucmVtb3ZlQWxsUm93cygpO1xuXHRcdH0pO1xuXHR9XG5cbn0sIHtcblxuXHRpc0VtcHR5OiBmdW5jdGlvbihtb2RlbCwgcHJveHkpIHtcblx0XHRpZiAoIW1vZGVsLmRhdGEpIHJldHVybiB0cnVlO1xuXHRcdGlmIChwcm94eSA9PSBudWxsKSBwcm94eSA9IG1vZGVsLmdldFByb3h5QnlWYWx1ZShtb2RlbC5kYXRhKTtcblx0XHRyZXR1cm4gbW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCBtb2RlbC5kYXRhLCBcImlzTGlzdFwiKSAmJlxuXHRcdFx0bW9kZWwuY2FsbFByb3h5TWV0aG9kKHByb3h5LCBtb2RlbC5kYXRhLCBcImlzRW1wdHlcIik7XG5cdH1cblxufSk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcblx0Uk9PVCAgICAgICAgICAgICAgOiAxLFxuXG5cdC8vIFhNTC9IVE1MXG5cdEhUTUwgICAgICAgICAgICAgIDogMixcblx0VEVYVCAgICAgICAgICAgICAgOiAzLFxuXHRFTEVNRU5UICAgICAgICAgICA6IDQsXG5cdEFUVFJJQlVURSAgICAgICAgIDogNSxcblx0WENPTU1FTlQgICAgICAgICAgOiA2LFxuXG5cdC8vIE11c3RhY2hlXG5cdElOVEVSUE9MQVRPUiAgICAgIDogNyxcblx0VFJJUExFICAgICAgICAgICAgOiA4LFxuXHRTRUNUSU9OICAgICAgICAgICA6IDksXG5cdElOVkVSVEVEICAgICAgICAgIDogMTAsXG5cdFBBUlRJQUwgICAgICAgICAgIDogMTEsXG5cdE1DT01NRU5UICAgICAgICAgIDogMTIsXG5cblx0Ly8gTUlTQ1xuXHRMSVRFUkFMICAgICAgICAgICA6IDEzXG59XG4iLCJ2YXIgXyA9IHJlcXVpcmUoXCJ1bmRlcnNjb3JlXCIpO1xuXG4vLyBsaWtlIHVuZGVyc2NvcmUncyByZXN1bHQsIGJ1dCBwYXNzIGFyZ3VtZW50cyB0aHJvdWdoXG5leHBvcnRzLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHkpIHtcblx0dmFyIHZhbHVlID0gb2JqZWN0ID09IG51bGwgPyB2b2lkIDAgOiBvYmplY3RbcHJvcGVydHldO1xuXHRyZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmFwcGx5KG9iamVjdCwgQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKSkgOiB2YWx1ZTtcbn07XG5cbi8vIHRlc3RzIHZhbHVlIGFzIHBvam8gKHBsYWluIG9sZCBqYXZhc2NyaXB0IG9iamVjdClcbnZhciBpc1BsYWluT2JqZWN0ID1cbmV4cG9ydHMuaXNQbGFpbk9iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuXHRyZXR1cm4gb2JqICE9IG51bGwgJiYgKG9iai5jb25zdHJ1Y3RvciA9PT0gT2JqZWN0IHx8IG9iai5fX3Byb3RvX18gPT09IE9iamVjdC5wcm90b3R5cGUpO1xufVxuXG4vLyB0ZXN0cyBmdW5jdGlvbiBhcyBhIHN1YmNsYXNzIG9mIGEgcGFyZW50IGZ1bmN0aW9uXG4vLyBoZXJlLCBhIGNsYXNzIGlzIHRlY2huaWNhbGx5IGEgc3ViY2xhc3Mgb2YgaXRzZWxmXG5leHBvcnRzLmlzU3ViQ2xhc3MgPSBmdW5jdGlvbihwYXJlbnQsIGZuKSB7XG5cdHJldHVybiBmbiA9PT0gcGFyZW50IHx8IChmbiAhPSBudWxsICYmIGZuLnByb3RvdHlwZSBpbnN0YW5jZW9mIHBhcmVudCk7XG59XG5cbi8vIGxpa2UgalF1ZXJ5J3MgZW1wdHkoKSwgcmVtb3ZlcyBhbGwgY2hpbGRyZW5cbnZhciBlbXB0eU5vZGUgPVxuZXhwb3J0cy5lbXB0eU5vZGUgPSBmdW5jdGlvbihub2RlKSB7XG5cdHdoaWxlIChub2RlLmxhc3RDaGlsZCkgbm9kZS5yZW1vdmVDaGlsZChub2RlLmxhc3RDaGlsZCk7XG5cdHJldHVybiBub2RlO1xufVxuXG4vLyBpbnNlcnRzIGFuIGFycmF5IG5vZGVzIGludG8gYSBwYXJlbnRcbmV4cG9ydHMuaW5zZXJ0Tm9kZXMgPSBmdW5jdGlvbihub2RlcywgcGFyZW50LCBiZWZvcmUpIHtcblx0dmFyIG5vZGUsIG5leHQsIGk7XG5cblx0Ly8gd2UgZG8gaXQgYmFja3dhcmRzIHNvIG5vZGVzIGRvbid0IGdldCBtb3ZlZCBpZiB0aGV5IGRvbid0IG5lZWQgdG9cblx0Zm9yIChpID0gbm9kZXMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRub2RlID0gbm9kZXNbaV07XG5cdFx0bmV4dCA9IG5vZGVzW2kgKyAxXSB8fCBiZWZvcmU7XG5cblx0XHRpZiAobm9kZS5uZXh0U2libGluZyAhPT0gYmVmb3JlKSB7XG5cdFx0XHRwYXJlbnQuaW5zZXJ0QmVmb3JlKG5vZGUsIG5leHQpO1xuXHRcdH1cblx0fVxufVxuXG4vLyBjbGVhbnMgaHRtbCwgdGhlbiBjb252ZXJ0cyBodG1sIGVudGl0aWVzIHRvIHVuaWNvZGVcbmV4cG9ydHMuZGVjb2RlRW50aXRpZXMgPSAoZnVuY3Rpb24oKSB7XG5cdGlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblxuXHQvLyB0aGlzIHByZXZlbnRzIGFueSBvdmVyaGVhZCBmcm9tIGNyZWF0aW5nIHRoZSBvYmplY3QgZWFjaCB0aW1lXG5cdHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdHZhciBlbnRpdHkgPSAvJig/OiN4W2EtZjAtOV0rfCNbMC05XSt8W2EtejAtOV0rKTs/L2lnO1xuXG5cdHJldHVybiBmdW5jdGlvbiBkZWNvZGVIVE1MRW50aXRpZXMoc3RyKSB7XG5cdFx0c3RyID0gc3RyLnJlcGxhY2UoZW50aXR5LCBmdW5jdGlvbihtKSB7XG5cdFx0XHRlbGVtZW50LmlubmVySFRNTCA9IG07XG5cdFx0XHRyZXR1cm4gZWxlbWVudC50ZXh0Q29udGVudDtcblx0XHR9KTtcblxuXHRcdGVtcHR5Tm9kZShlbGVtZW50KTtcblxuXHRcdHJldHVybiBzdHI7XG5cdH1cbn0pKCk7XG5cbi8vIGNvbnZlcnQgaHRtbCBpbnRvIERPTSBub2Rlc1xuZXhwb3J0cy5wYXJzZUhUTUwgPSAoZnVuY3Rpb24oKSB7XG5cdGlmICh0eXBlb2YgZG9jdW1lbnQgPT09IFwidW5kZWZpbmVkXCIpIHJldHVybjtcblxuXHQvLyB0aGlzIHByZXZlbnRzIGFueSBvdmVyaGVhZCBmcm9tIGNyZWF0aW5nIHRoZSBvYmplY3QgZWFjaCB0aW1lXG5cdHZhciBlbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0cmV0dXJuIGZ1bmN0aW9uIHBhcnNlSFRNTChodG1sKSB7XG5cdFx0ZWxlbWVudC5pbm5lckhUTUwgPSBodG1sICE9IG51bGwgPyBodG1sLnRvU3RyaW5nKCkgOiBcIlwiO1xuXHRcdHZhciBub2RlcyA9IF8udG9BcnJheShlbGVtZW50LmNoaWxkTm9kZXMpO1xuXHRcdGVtcHR5Tm9kZShlbGVtZW50KTtcblx0XHRyZXR1cm4gbm9kZXM7XG5cdH1cbn0pKCk7XG5cbnZhciBtYXRjaGVzID0gZXhwb3J0cy5tYXRjaGVzID0gZnVuY3Rpb24obm9kZSwgc2VsZWN0b3IpIHtcblx0aWYgKF8uaXNBcnJheShzZWxlY3RvcikpIHJldHVybiBzZWxlY3Rvci5zb21lKGZ1bmN0aW9uKHMpIHtcblx0XHRyZXR1cm4gbWF0Y2hlcyhub2RlLCBzKTtcblx0fSk7XG5cblx0aWYgKHNlbGVjdG9yIGluc3RhbmNlb2Ygd2luZG93Lk5vZGUpIHtcblx0XHRyZXR1cm4gbm9kZSA9PT0gc2VsZWN0b3I7XG5cdH1cblxuXHRpZiAodHlwZW9mIHNlbGVjdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRyZXR1cm4gISFzZWxlY3Rvcihub2RlKTtcblx0fVxuXG5cdGlmIChub2RlLm5vZGVUeXBlID09PSB3aW5kb3cuTm9kZS5FTEVNRU5UX05PREUpIHtcblx0XHRyZXR1cm4gcmVxdWlyZShcIm1hdGNoZXMtc2VsZWN0b3JcIikobm9kZSwgc2VsZWN0b3IpO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufVxuIiwidmFyIF8gPSByZXF1aXJlKFwidW5kZXJzY29yZVwiKTtcbnZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIEV2ZW50cyA9IHJlcXVpcmUoXCJiYWNrYm9uZS1ldmVudHMtc3RhbmRhbG9uZVwiKTtcbnZhciB1dGlscyA9IHJlcXVpcmUoXCIuL3V0aWxzXCIpO1xudmFyIE1vZGVsID0gcmVxdWlyZShcIi4vbW9kZWxcIik7XG52YXIgUGx1Z2lucyA9IHJlcXVpcmUoXCIuL3BsdWdpbnNcIik7XG52YXIgRE9NUmFuZ2UgPSByZXF1aXJlKFwiLi9kb21yYW5nZVwiKTtcblxudmFyIFZpZXcgPVxubW9kdWxlLmV4cG9ydHMgPSBET01SYW5nZS5leHRlbmQoe1xuXHRcblx0Y29uc3RydWN0b3I6IGZ1bmN0aW9uKGRhdGEsIG9wdGlvbnMpIHtcblx0XHRvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcblxuXHRcdC8vIGZpcnN0IHdlIGNyZWF0ZSB0aGUgaW5pdGlhbCB2aWV3IHN0YXRlXG5cdFx0dmFyIHN0YXRlID0gXy5yZXN1bHQodGhpcywgXCJpbml0aWFsU3RhdGVcIikgfHwgXy5yZXN1bHQodGhpcywgXCJkZWZhdWx0c1wiKTtcblx0XHRpZiAodHlwZW9mIHN0YXRlICE9PSBcInVuZGVmaW5lZFwiKSB7XG5cdFx0XHRpZiAoIU1vZGVsLmlzTW9kZWwoc3RhdGUpKSB7XG5cdFx0XHRcdHN0YXRlID0gbmV3IE1vZGVsKHN0YXRlLCBudWxsLCBvcHRpb25zLnN0YXRlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gc2hvdmUgc3RhdGUgYmV0d2VlbiBjb250ZXh0c1xuXHRcdFx0aWYgKE1vZGVsLmlzTW9kZWwoZGF0YSkpIHtcblx0XHRcdFx0aWYgKGRhdGEucGFyZW50KSBkYXRhLnBhcmVudC5hcHBlbmQoc3RhdGUpO1xuXHRcdFx0XHRzdGF0ZS5hcHBlbmQoZGF0YSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFkZCB0byB0aGUgc3RhY2sgYmVmb3JlIHRoZSByZWFsIGRhdGFcblx0XHRcdHRoaXMuYWRkRGF0YShzdGF0ZSk7XG5cdFx0XHR0aGlzLnN0YXRlTW9kZWwgPSBzdGF0ZTtcblxuXHRcdFx0Ly8gc2V0dXAgZWFzeS1hY2Nlc3Mgc3RhdGUgcHJvcGVydHlcblx0XHRcdHN0YXRlLmRlZmluZURhdGFMaW5rKHRoaXMsIFwic3RhdGVcIik7XG5cdFx0fVxuXG5cdFx0Ly8gYWRkIHBhcnRpYWxzXG5cdFx0dGhpcy5fcGFydGlhbHMgPSB7fTtcblx0XHR0aGlzLl9jb21wb25lbnRzID0ge307XG5cdFx0dGhpcy5zZXRQYXJ0aWFsKF8uZXh0ZW5kKHt9LCBvcHRpb25zLnBhcnRpYWxzLCBfLnJlc3VsdCh0aGlzLCBcInBhcnRpYWxzXCIpKSk7XG5cblx0XHQvLyBzZXQgdGhlIHBhc3NlZCBpbiBkYXRhXG5cdFx0aWYgKHR5cGVvZiBkYXRhICE9PSBcInVuZGVmaW5lZFwiKSB0aGlzLmFkZERhdGEoZGF0YSwgb3B0aW9ucyk7XG5cblx0XHQvLyBpbml0aWF0ZSBsaWtlIGEgbm9ybWFsIGRvbSByYW5nZVxuXHRcdERPTVJhbmdlLmNhbGwodGhpcyk7XG5cblx0XHQvLyBpbml0aWFsaXplIHdpdGggb3B0aW9uc1xuXHRcdHRoaXMuaW5pdGlhbGl6ZS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuXHR9LFxuXG5cdGluaXRpYWxpemU6IGZ1bmN0aW9uKCl7fSxcblxuXHR1c2U6IGZ1bmN0aW9uKHApIHtcblx0XHRyZXR1cm4gUGx1Z2lucy5sb2FkUGx1Z2luKHRoaXMsIHAsIF8udG9BcnJheShhcmd1bWVudHMpLnNsaWNlKDEpKTtcblx0fSxcblxuXHQvLyBhZGRzIGRhdGEgdG8gdGhlIGN1cnJlbnQgc3RhY2tcblx0YWRkRGF0YTogZnVuY3Rpb24oZGF0YSwgb3B0aW9ucykge1xuXHRcdGlmICghTW9kZWwuaXNNb2RlbChkYXRhKSkgZGF0YSA9IG5ldyBNb2RlbChkYXRhLCB0aGlzLm1vZGVsLCBvcHRpb25zKTtcblx0XHR0aGlzLm1vZGVsID0gZGF0YTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBhdHRhY2ggKyBtb3VudFxuXHRwYWludDogZnVuY3Rpb24ocCwgbiwgX2lzTW92ZSwgX2lzUmVwbGFjZSkge1xuXHRcdERPTVJhbmdlLnByb3RvdHlwZS5hdHRhY2guYXBwbHkodGhpcywgYXJndW1lbnRzKTtcblx0XHRpZiAoIShfaXNNb3ZlIHx8IF9pc1JlcGxhY2UgfHwgdGhpcy5jb21wKSkgdGhpcy5tb3VudCgpO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGF1dG8gc3RvcCBvbiBkZXRhY2hcblx0ZGV0YWNoOiBmdW5jdGlvbihfaXNSZXBsYWNlKSB7XG5cdFx0aWYgKCFfaXNSZXBsYWNlKSB0aGlzLnN0b3AoKTtcblx0XHRET01SYW5nZS5wcm90b3R5cGUuZGV0YWNoLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0YXV0b3J1bjogZnVuY3Rpb24oZm4sIG9wdGlvbnMpIHtcblx0XHRyZXR1cm4gVHJhY2tyLmF1dG9ydW4oZm4sIG9wdGlvbnMsIHRoaXMpO1xuXHR9LFxuXG5cdC8vIGEgZ2VuZXJhbGl6ZWQgcmVhY3RpdmUgd29ya2Zsb3cgaGVscGVyXG5cdG1vdW50OiBmdW5jdGlvbigpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHQvLyBzdG9wIGV4aXN0aW5nIG1vdW50XG5cdFx0XHR0aGlzLnN0b3AoKTtcblxuXHRcdFx0Ly8gdGhlIGZpcnN0IGV2ZW50IGluIHRoZSBjeWNsZSwgYmVmb3JlIGV2ZXJ5dGhpbmcgZWxzZVxuXHRcdFx0dGhpcy50cmlnZ2VyKFwibW91bnQ6YmVmb3JlXCIpO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0Ly8gdGhlIGF1dG9ydW4gY29tcHV0YXRpb25cblx0XHR2YXIgY29tcCA9IHRoaXMuY29tcCA9IHRoaXMuYXV0b3J1bihmdW5jdGlvbihjb21wKSB7XG5cdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdFx0dGhpcy50cmlnZ2VyKFwicmVuZGVyXCIsIGNvbXApO1xuXG5cdFx0XHQvLyBhdXRvIGNsZWFuIHVwXG5cdFx0XHRjb21wLm9uSW52YWxpZGF0ZShmdW5jdGlvbigpIHtcblx0XHRcdFx0Ly8gcmVtYWluaW5nIGludmFsaWRhdGUgZXZlbnRzXG5cdFx0XHRcdHRoaXMudHJpZ2dlcihcImludmFsaWRhdGVcIiwgY29tcCk7XG5cblx0XHRcdFx0Ly8gZGV0ZWN0IGlmIHRoZSBjb21wdXRhdGlvbiBzdG9wcGVkXG5cdFx0XHRcdGlmIChjb21wLnN0b3BwZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyaWdnZXIoXCJzdG9wXCIsIGNvbXApO1xuXHRcdFx0XHRcdGRlbGV0ZSB0aGlzLmNvbXA7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gcmVtYWluaW5nIG1vdW50IGV2ZW50cyBoYXBwZW4gYWZ0ZXIgdGhlIGZpcnN0IHJlbmRlclxuXHRcdFRyYWNrci5ub25yZWFjdGl2ZShmdW5jdGlvbigpIHtcblx0XHRcdHRoaXMudHJpZ2dlcihcIm1vdW50OmFmdGVyXCIsIGNvbXApO1xuXHRcdH0sIHRoaXMpO1xuXG5cdFx0cmV0dXJuIHRoaXM7XG5cdH0sXG5cblx0cmVuZGVyOiBmdW5jdGlvbigpe30sXG5cblx0c3RvcDogZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHRoaXMuY29tcCkgdGhpcy5jb21wLnN0b3AoKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fSxcblxuXHQvLyBzZXRzIHBhcnRpYWwgYnkgbmFtZVxuXHRzZXRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lLCBwYXJ0aWFsKSB7XG5cdFx0aWYgKF8uaXNPYmplY3QobmFtZSkgJiYgcGFydGlhbCA9PSBudWxsKSB7XG5cdFx0XHRfLmVhY2gobmFtZSwgZnVuY3Rpb24ocCwgbikgeyB0aGlzLnNldFBhcnRpYWwobiwgcCk7IH0sIHRoaXMpO1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fVxuXG5cdFx0aWYgKCFfLmlzU3RyaW5nKG5hbWUpICYmIG5hbWUgIT09IFwiXCIpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3Rpbmcgbm9uLWVtcHR5IHN0cmluZyBmb3IgcGFydGlhbCBuYW1lLlwiKTtcblxuXHRcdGlmIChwYXJ0aWFsICE9IG51bGwgJiYgIXV0aWxzLmlzU3ViQ2xhc3MoVmlldywgcGFydGlhbCkpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgVmlldyBzdWJjbGFzcyBvciBmdW5jdGlvbiBmb3IgcGFydGlhbC5cIik7XG5cblx0XHRpZiAocGFydGlhbCA9PSBudWxsKSB7XG5cdFx0XHRkZWxldGUgdGhpcy5fcGFydGlhbHNbbmFtZV07XG5cdFx0XHRwYXJ0aWFsID0gdm9pZCAwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR2YXIgcCA9IHRoaXMuX2dldFBhcnRpYWwobmFtZSk7XG5cdFx0XHRwLnZpZXcgPSBwYXJ0aWFsO1xuXHRcdFx0cC5kZXAuY2hhbmdlZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzO1xuXHR9LFxuXG5cdC8vIGVuc3VyZXMgYSBwYXJ0aWFsJ3MgZGVwZW5kZW5jeSBleGlzdHNcblx0X2dldFBhcnRpYWw6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHRpZiAodGhpcy5fcGFydGlhbHNbbmFtZV0gPT0gbnVsbClcblx0XHRcdHRoaXMuX3BhcnRpYWxzW25hbWVdID0geyBkZXA6IG5ldyBUcmFja3IuRGVwZW5kZW5jeSgpIH07XG5cblx0XHRyZXR1cm4gdGhpcy5fcGFydGlhbHNbbmFtZV07XG5cdH0sXG5cblx0Ly8gbG9va3MgdGhyb3VnaCBwYXJlbnRzIGZvciBwYXJ0aWFsXG5cdGZpbmRQYXJ0aWFsOiBmdW5jdGlvbihuYW1lKSB7XG5cdFx0dmFyIGMgPSB0aGlzLCBwO1xuXG5cdFx0d2hpbGUgKGMgIT0gbnVsbCkge1xuXHRcdFx0aWYgKGMuX2dldFBhcnRpYWwgIT0gbnVsbCkge1xuXHRcdFx0XHRwID0gYy5fZ2V0UGFydGlhbChuYW1lKTtcblx0XHRcdFx0cC5kZXAuZGVwZW5kKCk7XG5cdFx0XHRcdGlmIChwLnZpZXcgIT0gbnVsbCkgcmV0dXJuIHAudmlldztcblx0XHRcdH1cblxuXHRcdFx0YyA9IGMucGFyZW50UmFuZ2U7XG5cdFx0fVxuXHR9LFxuXG5cdC8vIGdlbmVyYXRlcyBhIG5ldyBjb21wb25lbnQgZnJvbSBhIFZpZXcgc3ViY2xhc3Mgb3IgcGFydGlhbCdzIG5hbWVcblx0cmVuZGVyUGFydGlhbDogZnVuY3Rpb24oa2xhc3MsIGN0eCwgb3B0aW9ucykge1xuXHRcdHZhciBjb21wcywgbmFtZTtcblxuXHRcdC8vIGxvb2sgdXAgdGhlIHBhcnRpYWwgYnkgbmFtZVxuXHRcdGlmICh0eXBlb2Yga2xhc3MgPT09IFwic3RyaW5nXCIpIHtcblx0XHRcdG5hbWUgPSBrbGFzcztcblx0XHRcdGtsYXNzID0gdGhpcy5maW5kUGFydGlhbChrbGFzcyk7XG5cdFx0fVxuXG5cdFx0Ly8gY2xhc3MgbXVzdCBiZSBhIHZpZXdcblx0XHRpZiAoIXV0aWxzLmlzU3ViQ2xhc3MoVmlldywga2xhc3MpKSByZXR1cm4gbnVsbDtcblxuXHRcdC8vIG5vcm1hbGl6ZSBjb250ZXh0XG5cdFx0aWYgKGN0eCA9PSBudWxsKSBjdHggPSB0aGlzO1xuXHRcdGlmIChjdHggaW5zdGFuY2VvZiBWaWV3KSBjdHggPSBjdHgubW9kZWw7XG5cblx0XHQvLyBjcmVhdGUgaXQgbm9uLXJlYWN0aXZlbHlcblx0XHR2YXIgY29tcG9uZW50ID0gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIG5ldyBrbGFzcyhjdHgsIG9wdGlvbnMpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gYWRkIGl0IHRvIHRoZSBsaXN0XG5cdFx0aWYgKG5hbWUpIHtcblx0XHRcdGNvbXBzID0gdGhpcy5fY29tcG9uZW50cztcblx0XHRcdGlmIChjb21wc1tuYW1lXSA9PSBudWxsKSBjb21wc1tuYW1lXSA9IFtdO1xuXHRcdFx0Y29tcHNbbmFtZV0ucHVzaChjb21wb25lbnQpO1xuXG5cdFx0XHQvLyBhdXRvIHJlbW92ZSB3aGVuIHRoZSBwYXJ0aWFsIGlzIFwic3RvcHBlZFwiXG5cdFx0XHRjb21wb25lbnQub25jZShcInN0b3BcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdGNvbXBzW25hbWVdID0gXy53aXRob3V0KGNvbXBzW25hbWVdLCBjb21wb25lbnQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbXBvbmVudDtcblx0fSxcblxuXHQvLyByZXR1cm5zIGZpcnN0IHJlbmRlcmVkIHBhcnRpYWwgYnkgbmFtZVxuXHRnZXRDb21wb25lbnQ6IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgY29tcHMsIGNvbXAsIHJlcywgbiwgaTtcblxuXHRcdGNvbXBzID0gdGhpcy5fY29tcG9uZW50cztcblx0XHRpZiAoY29tcHNbbmFtZV0gIT0gbnVsbCAmJiBjb21wc1tuYW1lXS5sZW5ndGgpIHJldHVybiBjb21wc1tuYW1lXVswXTtcblxuXHRcdGZvciAobiBpbiBjb21wcykge1xuXHRcdFx0Zm9yIChpIGluIGNvbXBzW25dKSB7XG5cdFx0XHRcdGNvbXAgPSBjb21wc1tuXVtpXVxuXHRcdFx0XHRpZiAoIShjb21wIGluc3RhbmNlb2YgVmlldykpIGNvbnRpbnVlO1xuXHRcdFx0XHRyZXMgPSBjb21wLmdldENvbXBvbmVudChuYW1lKTtcblx0XHRcdFx0aWYgKHJlcyAhPSBudWxsKSByZXR1cm4gcmVzO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9LFxuXG5cdC8vIHJldHVybnMgYWxsIHJlbmRlcmVkIHBhcnRpYWxzIGJ5IG5hbWVcblx0Z2V0Q29tcG9uZW50czogZnVuY3Rpb24obmFtZSkge1xuXHRcdHJldHVybiBfLnJlZHVjZSh0aGlzLl9jb21wb25lbnRzLCBmdW5jdGlvbihtLCBjb21wcywgbikge1xuXHRcdFx0aWYgKG4gPT09IG5hbWUpIG0ucHVzaC5hcHBseShtLCBjb21wcyk7XG5cblx0XHRcdGNvbXBzLmZvckVhY2goZnVuY3Rpb24oYykge1xuXHRcdFx0XHRpZiAoYyBpbnN0YW5jZW9mIFZpZXcpIG0ucHVzaC5hcHBseShtLCBjLmdldENvbXBvbmVudHMobmFtZSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiBtO1xuXHRcdH0sIFtdKTtcblx0fVxuXG59KTtcblxuLy8gcXVpY2sgYWNjZXNzIHRvIHRoZSB0b3AgbW9kZWwgZGF0YVxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFZpZXcucHJvdG90eXBlLCBcImRhdGFcIiwge1xuXHRjb25maWd1cmFibGU6IHRydWUsXG5cdGVudW1lcmFibGU6IHRydWUsXG5cdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5tb2RlbC5fZGVwLmRlcGVuZCgpO1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmRhdGE7XG5cdH0sXG5cdHNldDogZnVuY3Rpb24odmFsKSB7XG5cdFx0dGhpcy5tb2RlbC5zZXQodmFsKTtcblx0fVxufSk7XG5cbi8vIGNoYWluYWJsZSBtZXRob2RzIHRvIHByb3h5IHRvIG1vZGVsXG5bIFwic2V0XCIsIFwicmVnaXN0ZXJQcm94eVwiIF1cbi5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuXHRWaWV3LnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24oKSB7XG5cdFx0dGhpcy5tb2RlbFttZXRob2RdLmFwcGx5KHRoaXMubW9kZWwsIGFyZ3VtZW50cyk7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn0pO1xuXG4vLyBtZXRob2RzIHRvIHByb3h5IHRvIG1vZGVsIHdoaWNoIGRvbid0IHJldHVybiB0aGlzXG5bIFwiZ2V0XCIsIFwiZ2V0TG9jYWxcIiwgXCJnZXRQcm94eUJ5VmFsdWVcIiwgXCJnZXRNb2RlbEF0T2Zmc2V0XCIsXG4gIFwiZ2V0Um9vdE1vZGVsXCIsIFwiZmluZE1vZGVsXCIsIFwiZ2V0QWxsTW9kZWxzXCJcbl0uZm9yRWFjaChmdW5jdGlvbihtZXRob2QpIHtcblx0Vmlldy5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsW21ldGhvZF0uYXBwbHkodGhpcy5tb2RlbCwgYXJndW1lbnRzKTtcblx0fVxufSk7XG5cbi8vIHByb3h5IGEgZmV3IGNvbXB1dGF0aW9uIG1ldGhvZHNcblsgXCJpbnZhbGlkYXRlXCIsIFwib25JbnZhbGlkYXRlXCIgXS5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZCkge1xuXHRWaWV3LnByb3RvdHlwZVttZXRob2RdID0gZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCF0aGlzLmNvbXApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIkNhbm5vdCBydW4gXCIgKyBtZXRob2QgKyBcIigpLiBUaGlzIHZpZXcgaXMgbm90IG1vdW50ZWQuXCIpO1xuXHRcdH1cblxuXHRcdHRoaXMuY29tcFttZXRob2RdLmFwcGx5KHRoaXMuY29tcCwgYXJndW1lbnRzKTtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxufSk7XG4iLCIvKipcbiAqIFN0YW5kYWxvbmUgZXh0cmFjdGlvbiBvZiBCYWNrYm9uZS5FdmVudHMsIG5vIGV4dGVybmFsIGRlcGVuZGVuY3kgcmVxdWlyZWQuXG4gKiBEZWdyYWRlcyBuaWNlbHkgd2hlbiBCYWNrb25lL3VuZGVyc2NvcmUgYXJlIGFscmVhZHkgYXZhaWxhYmxlIGluIHRoZSBjdXJyZW50XG4gKiBnbG9iYWwgY29udGV4dC5cbiAqXG4gKiBOb3RlIHRoYXQgZG9jcyBzdWdnZXN0IHRvIHVzZSB1bmRlcnNjb3JlJ3MgYF8uZXh0ZW5kKClgIG1ldGhvZCB0byBhZGQgRXZlbnRzXG4gKiBzdXBwb3J0IHRvIHNvbWUgZ2l2ZW4gb2JqZWN0LiBBIGBtaXhpbigpYCBtZXRob2QgaGFzIGJlZW4gYWRkZWQgdG8gdGhlIEV2ZW50c1xuICogcHJvdG90eXBlIHRvIGF2b2lkIHVzaW5nIHVuZGVyc2NvcmUgZm9yIHRoYXQgc29sZSBwdXJwb3NlOlxuICpcbiAqICAgICB2YXIgbXlFdmVudEVtaXR0ZXIgPSBCYWNrYm9uZUV2ZW50cy5taXhpbih7fSk7XG4gKlxuICogT3IgZm9yIGEgZnVuY3Rpb24gY29uc3RydWN0b3I6XG4gKlxuICogICAgIGZ1bmN0aW9uIE15Q29uc3RydWN0b3IoKXt9XG4gKiAgICAgTXlDb25zdHJ1Y3Rvci5wcm90b3R5cGUuZm9vID0gZnVuY3Rpb24oKXt9XG4gKiAgICAgQmFja2JvbmVFdmVudHMubWl4aW4oTXlDb25zdHJ1Y3Rvci5wcm90b3R5cGUpO1xuICpcbiAqIChjKSAyMDA5LTIwMTMgSmVyZW15IEFzaGtlbmFzLCBEb2N1bWVudENsb3VkIEluYy5cbiAqIChjKSAyMDEzIE5pY29sYXMgUGVycmlhdWx0XG4gKi9cbi8qIGdsb2JhbCBleHBvcnRzOnRydWUsIGRlZmluZSwgbW9kdWxlICovXG4oZnVuY3Rpb24oKSB7XG4gIHZhciByb290ID0gdGhpcyxcbiAgICAgIG5hdGl2ZUZvckVhY2ggPSBBcnJheS5wcm90b3R5cGUuZm9yRWFjaCxcbiAgICAgIGhhc093blByb3BlcnR5ID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eSxcbiAgICAgIHNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLFxuICAgICAgaWRDb3VudGVyID0gMDtcblxuICAvLyBSZXR1cm5zIGEgcGFydGlhbCBpbXBsZW1lbnRhdGlvbiBtYXRjaGluZyB0aGUgbWluaW1hbCBBUEkgc3Vic2V0IHJlcXVpcmVkXG4gIC8vIGJ5IEJhY2tib25lLkV2ZW50c1xuICBmdW5jdGlvbiBtaW5pc2NvcmUoKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGtleXM6IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgICAgICAgaWYgKHR5cGVvZiBvYmogIT09IFwib2JqZWN0XCIgJiYgdHlwZW9mIG9iaiAhPT0gXCJmdW5jdGlvblwiIHx8IG9iaiA9PT0gbnVsbCkge1xuICAgICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoXCJrZXlzKCkgY2FsbGVkIG9uIGEgbm9uLW9iamVjdFwiKTtcbiAgICAgICAgfVxuICAgICAgICB2YXIga2V5LCBrZXlzID0gW107XG4gICAgICAgIGZvciAoa2V5IGluIG9iaikge1xuICAgICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAga2V5c1trZXlzLmxlbmd0aF0gPSBrZXk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBrZXlzO1xuICAgICAgfSxcblxuICAgICAgdW5pcXVlSWQ6IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgICAgICB2YXIgaWQgPSArK2lkQ291bnRlciArICcnO1xuICAgICAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgICAgIH0sXG5cbiAgICAgIGhhczogZnVuY3Rpb24ob2JqLCBrZXkpIHtcbiAgICAgICAgcmV0dXJuIGhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xuICAgICAgfSxcblxuICAgICAgZWFjaDogZnVuY3Rpb24ob2JqLCBpdGVyYXRvciwgY29udGV4dCkge1xuICAgICAgICBpZiAob2JqID09IG51bGwpIHJldHVybjtcbiAgICAgICAgaWYgKG5hdGl2ZUZvckVhY2ggJiYgb2JqLmZvckVhY2ggPT09IG5hdGl2ZUZvckVhY2gpIHtcbiAgICAgICAgICBvYmouZm9yRWFjaChpdGVyYXRvciwgY29udGV4dCk7XG4gICAgICAgIH0gZWxzZSBpZiAob2JqLmxlbmd0aCA9PT0gK29iai5sZW5ndGgpIHtcbiAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbCA9IG9iai5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2ldLCBpLCBvYmopO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5oYXMob2JqLCBrZXkpKSB7XG4gICAgICAgICAgICAgIGl0ZXJhdG9yLmNhbGwoY29udGV4dCwgb2JqW2tleV0sIGtleSwgb2JqKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIG9uY2U6IGZ1bmN0aW9uKGZ1bmMpIHtcbiAgICAgICAgdmFyIHJhbiA9IGZhbHNlLCBtZW1vO1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgaWYgKHJhbikgcmV0dXJuIG1lbW87XG4gICAgICAgICAgcmFuID0gdHJ1ZTtcbiAgICAgICAgICBtZW1vID0gZnVuYy5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICAgICAgICAgIGZ1bmMgPSBudWxsO1xuICAgICAgICAgIHJldHVybiBtZW1vO1xuICAgICAgICB9O1xuICAgICAgfVxuICAgIH07XG4gIH1cblxuICB2YXIgXyA9IG1pbmlzY29yZSgpLCBFdmVudHM7XG5cbiAgLy8gQmFja2JvbmUuRXZlbnRzXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEEgbW9kdWxlIHRoYXQgY2FuIGJlIG1peGVkIGluIHRvICphbnkgb2JqZWN0KiBpbiBvcmRlciB0byBwcm92aWRlIGl0IHdpdGhcbiAgLy8gY3VzdG9tIGV2ZW50cy4gWW91IG1heSBiaW5kIHdpdGggYG9uYCBvciByZW1vdmUgd2l0aCBgb2ZmYCBjYWxsYmFja1xuICAvLyBmdW5jdGlvbnMgdG8gYW4gZXZlbnQ7IGB0cmlnZ2VyYC1pbmcgYW4gZXZlbnQgZmlyZXMgYWxsIGNhbGxiYWNrcyBpblxuICAvLyBzdWNjZXNzaW9uLlxuICAvL1xuICAvLyAgICAgdmFyIG9iamVjdCA9IHt9O1xuICAvLyAgICAgXy5leHRlbmQob2JqZWN0LCBCYWNrYm9uZS5FdmVudHMpO1xuICAvLyAgICAgb2JqZWN0Lm9uKCdleHBhbmQnLCBmdW5jdGlvbigpeyBhbGVydCgnZXhwYW5kZWQnKTsgfSk7XG4gIC8vICAgICBvYmplY3QudHJpZ2dlcignZXhwYW5kJyk7XG4gIC8vXG4gIEV2ZW50cyA9IHtcblxuICAgIC8vIEJpbmQgYW4gZXZlbnQgdG8gYSBgY2FsbGJhY2tgIGZ1bmN0aW9uLiBQYXNzaW5nIGBcImFsbFwiYCB3aWxsIGJpbmRcbiAgICAvLyB0aGUgY2FsbGJhY2sgdG8gYWxsIGV2ZW50cyBmaXJlZC5cbiAgICBvbjogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICAgIGlmICghZXZlbnRzQXBpKHRoaXMsICdvbicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pIHx8ICFjYWxsYmFjaykgcmV0dXJuIHRoaXM7XG4gICAgICB0aGlzLl9ldmVudHMgfHwgKHRoaXMuX2V2ZW50cyA9IHt9KTtcbiAgICAgIHZhciBldmVudHMgPSB0aGlzLl9ldmVudHNbbmFtZV0gfHwgKHRoaXMuX2V2ZW50c1tuYW1lXSA9IFtdKTtcbiAgICAgIGV2ZW50cy5wdXNoKHtjYWxsYmFjazogY2FsbGJhY2ssIGNvbnRleHQ6IGNvbnRleHQsIGN0eDogY29udGV4dCB8fCB0aGlzfSk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLy8gQmluZCBhbiBldmVudCB0byBvbmx5IGJlIHRyaWdnZXJlZCBhIHNpbmdsZSB0aW1lLiBBZnRlciB0aGUgZmlyc3QgdGltZVxuICAgIC8vIHRoZSBjYWxsYmFjayBpcyBpbnZva2VkLCBpdCB3aWxsIGJlIHJlbW92ZWQuXG4gICAgb25jZTogZnVuY3Rpb24obmFtZSwgY2FsbGJhY2ssIGNvbnRleHQpIHtcbiAgICAgIGlmICghZXZlbnRzQXBpKHRoaXMsICdvbmNlJywgbmFtZSwgW2NhbGxiYWNrLCBjb250ZXh0XSkgfHwgIWNhbGxiYWNrKSByZXR1cm4gdGhpcztcbiAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgIHZhciBvbmNlID0gXy5vbmNlKGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLm9mZihuYW1lLCBvbmNlKTtcbiAgICAgICAgY2FsbGJhY2suYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH0pO1xuICAgICAgb25jZS5fY2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICAgIHJldHVybiB0aGlzLm9uKG5hbWUsIG9uY2UsIGNvbnRleHQpO1xuICAgIH0sXG5cbiAgICAvLyBSZW1vdmUgb25lIG9yIG1hbnkgY2FsbGJhY2tzLiBJZiBgY29udGV4dGAgaXMgbnVsbCwgcmVtb3ZlcyBhbGxcbiAgICAvLyBjYWxsYmFja3Mgd2l0aCB0aGF0IGZ1bmN0aW9uLiBJZiBgY2FsbGJhY2tgIGlzIG51bGwsIHJlbW92ZXMgYWxsXG4gICAgLy8gY2FsbGJhY2tzIGZvciB0aGUgZXZlbnQuIElmIGBuYW1lYCBpcyBudWxsLCByZW1vdmVzIGFsbCBib3VuZFxuICAgIC8vIGNhbGxiYWNrcyBmb3IgYWxsIGV2ZW50cy5cbiAgICBvZmY6IGZ1bmN0aW9uKG5hbWUsIGNhbGxiYWNrLCBjb250ZXh0KSB7XG4gICAgICB2YXIgcmV0YWluLCBldiwgZXZlbnRzLCBuYW1lcywgaSwgbCwgaiwgaztcbiAgICAgIGlmICghdGhpcy5fZXZlbnRzIHx8ICFldmVudHNBcGkodGhpcywgJ29mZicsIG5hbWUsIFtjYWxsYmFjaywgY29udGV4dF0pKSByZXR1cm4gdGhpcztcbiAgICAgIGlmICghbmFtZSAmJiAhY2FsbGJhY2sgJiYgIWNvbnRleHQpIHtcbiAgICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuXG4gICAgICBuYW1lcyA9IG5hbWUgPyBbbmFtZV0gOiBfLmtleXModGhpcy5fZXZlbnRzKTtcbiAgICAgIGZvciAoaSA9IDAsIGwgPSBuYW1lcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgbmFtZSA9IG5hbWVzW2ldO1xuICAgICAgICBpZiAoZXZlbnRzID0gdGhpcy5fZXZlbnRzW25hbWVdKSB7XG4gICAgICAgICAgdGhpcy5fZXZlbnRzW25hbWVdID0gcmV0YWluID0gW107XG4gICAgICAgICAgaWYgKGNhbGxiYWNrIHx8IGNvbnRleHQpIHtcbiAgICAgICAgICAgIGZvciAoaiA9IDAsIGsgPSBldmVudHMubGVuZ3RoOyBqIDwgazsgaisrKSB7XG4gICAgICAgICAgICAgIGV2ID0gZXZlbnRzW2pdO1xuICAgICAgICAgICAgICBpZiAoKGNhbGxiYWNrICYmIGNhbGxiYWNrICE9PSBldi5jYWxsYmFjayAmJiBjYWxsYmFjayAhPT0gZXYuY2FsbGJhY2suX2NhbGxiYWNrKSB8fFxuICAgICAgICAgICAgICAgICAgKGNvbnRleHQgJiYgY29udGV4dCAhPT0gZXYuY29udGV4dCkpIHtcbiAgICAgICAgICAgICAgICByZXRhaW4ucHVzaChldik7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFyZXRhaW4ubGVuZ3RoKSBkZWxldGUgdGhpcy5fZXZlbnRzW25hbWVdO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0sXG5cbiAgICAvLyBUcmlnZ2VyIG9uZSBvciBtYW55IGV2ZW50cywgZmlyaW5nIGFsbCBib3VuZCBjYWxsYmFja3MuIENhbGxiYWNrcyBhcmVcbiAgICAvLyBwYXNzZWQgdGhlIHNhbWUgYXJndW1lbnRzIGFzIGB0cmlnZ2VyYCBpcywgYXBhcnQgZnJvbSB0aGUgZXZlbnQgbmFtZVxuICAgIC8vICh1bmxlc3MgeW91J3JlIGxpc3RlbmluZyBvbiBgXCJhbGxcImAsIHdoaWNoIHdpbGwgY2F1c2UgeW91ciBjYWxsYmFjayB0b1xuICAgIC8vIHJlY2VpdmUgdGhlIHRydWUgbmFtZSBvZiB0aGUgZXZlbnQgYXMgdGhlIGZpcnN0IGFyZ3VtZW50KS5cbiAgICB0cmlnZ2VyOiBmdW5jdGlvbihuYW1lKSB7XG4gICAgICBpZiAoIXRoaXMuX2V2ZW50cykgcmV0dXJuIHRoaXM7XG4gICAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKTtcbiAgICAgIGlmICghZXZlbnRzQXBpKHRoaXMsICd0cmlnZ2VyJywgbmFtZSwgYXJncykpIHJldHVybiB0aGlzO1xuICAgICAgdmFyIGV2ZW50cyA9IHRoaXMuX2V2ZW50c1tuYW1lXTtcbiAgICAgIHZhciBhbGxFdmVudHMgPSB0aGlzLl9ldmVudHMuYWxsO1xuICAgICAgaWYgKGV2ZW50cykgdHJpZ2dlckV2ZW50cyhldmVudHMsIGFyZ3MpO1xuICAgICAgaWYgKGFsbEV2ZW50cykgdHJpZ2dlckV2ZW50cyhhbGxFdmVudHMsIGFyZ3VtZW50cyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9LFxuXG4gICAgLy8gVGVsbCB0aGlzIG9iamVjdCB0byBzdG9wIGxpc3RlbmluZyB0byBlaXRoZXIgc3BlY2lmaWMgZXZlbnRzIC4uLiBvclxuICAgIC8vIHRvIGV2ZXJ5IG9iamVjdCBpdCdzIGN1cnJlbnRseSBsaXN0ZW5pbmcgdG8uXG4gICAgc3RvcExpc3RlbmluZzogZnVuY3Rpb24ob2JqLCBuYW1lLCBjYWxsYmFjaykge1xuICAgICAgdmFyIGxpc3RlbmVycyA9IHRoaXMuX2xpc3RlbmVycztcbiAgICAgIGlmICghbGlzdGVuZXJzKSByZXR1cm4gdGhpcztcbiAgICAgIHZhciBkZWxldGVMaXN0ZW5lciA9ICFuYW1lICYmICFjYWxsYmFjaztcbiAgICAgIGlmICh0eXBlb2YgbmFtZSA9PT0gJ29iamVjdCcpIGNhbGxiYWNrID0gdGhpcztcbiAgICAgIGlmIChvYmopIChsaXN0ZW5lcnMgPSB7fSlbb2JqLl9saXN0ZW5lcklkXSA9IG9iajtcbiAgICAgIGZvciAodmFyIGlkIGluIGxpc3RlbmVycykge1xuICAgICAgICBsaXN0ZW5lcnNbaWRdLm9mZihuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG4gICAgICAgIGlmIChkZWxldGVMaXN0ZW5lcikgZGVsZXRlIHRoaXMuX2xpc3RlbmVyc1tpZF07XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgfTtcblxuICAvLyBSZWd1bGFyIGV4cHJlc3Npb24gdXNlZCB0byBzcGxpdCBldmVudCBzdHJpbmdzLlxuICB2YXIgZXZlbnRTcGxpdHRlciA9IC9cXHMrLztcblxuICAvLyBJbXBsZW1lbnQgZmFuY3kgZmVhdHVyZXMgb2YgdGhlIEV2ZW50cyBBUEkgc3VjaCBhcyBtdWx0aXBsZSBldmVudFxuICAvLyBuYW1lcyBgXCJjaGFuZ2UgYmx1clwiYCBhbmQgalF1ZXJ5LXN0eWxlIGV2ZW50IG1hcHMgYHtjaGFuZ2U6IGFjdGlvbn1gXG4gIC8vIGluIHRlcm1zIG9mIHRoZSBleGlzdGluZyBBUEkuXG4gIHZhciBldmVudHNBcGkgPSBmdW5jdGlvbihvYmosIGFjdGlvbiwgbmFtZSwgcmVzdCkge1xuICAgIGlmICghbmFtZSkgcmV0dXJuIHRydWU7XG5cbiAgICAvLyBIYW5kbGUgZXZlbnQgbWFwcy5cbiAgICBpZiAodHlwZW9mIG5hbWUgPT09ICdvYmplY3QnKSB7XG4gICAgICBmb3IgKHZhciBrZXkgaW4gbmFtZSkge1xuICAgICAgICBvYmpbYWN0aW9uXS5hcHBseShvYmosIFtrZXksIG5hbWVba2V5XV0uY29uY2F0KHJlc3QpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICAvLyBIYW5kbGUgc3BhY2Ugc2VwYXJhdGVkIGV2ZW50IG5hbWVzLlxuICAgIGlmIChldmVudFNwbGl0dGVyLnRlc3QobmFtZSkpIHtcbiAgICAgIHZhciBuYW1lcyA9IG5hbWUuc3BsaXQoZXZlbnRTcGxpdHRlcik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbCA9IG5hbWVzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBvYmpbYWN0aW9uXS5hcHBseShvYmosIFtuYW1lc1tpXV0uY29uY2F0KHJlc3QpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBBIGRpZmZpY3VsdC10by1iZWxpZXZlLCBidXQgb3B0aW1pemVkIGludGVybmFsIGRpc3BhdGNoIGZ1bmN0aW9uIGZvclxuICAvLyB0cmlnZ2VyaW5nIGV2ZW50cy4gVHJpZXMgdG8ga2VlcCB0aGUgdXN1YWwgY2FzZXMgc3BlZWR5IChtb3N0IGludGVybmFsXG4gIC8vIEJhY2tib25lIGV2ZW50cyBoYXZlIDMgYXJndW1lbnRzKS5cbiAgdmFyIHRyaWdnZXJFdmVudHMgPSBmdW5jdGlvbihldmVudHMsIGFyZ3MpIHtcbiAgICB2YXIgZXYsIGkgPSAtMSwgbCA9IGV2ZW50cy5sZW5ndGgsIGExID0gYXJnc1swXSwgYTIgPSBhcmdzWzFdLCBhMyA9IGFyZ3NbMl07XG4gICAgc3dpdGNoIChhcmdzLmxlbmd0aCkge1xuICAgICAgY2FzZSAwOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCk7IHJldHVybjtcbiAgICAgIGNhc2UgMTogd2hpbGUgKCsraSA8IGwpIChldiA9IGV2ZW50c1tpXSkuY2FsbGJhY2suY2FsbChldi5jdHgsIGExKTsgcmV0dXJuO1xuICAgICAgY2FzZSAyOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyKTsgcmV0dXJuO1xuICAgICAgY2FzZSAzOiB3aGlsZSAoKytpIDwgbCkgKGV2ID0gZXZlbnRzW2ldKS5jYWxsYmFjay5jYWxsKGV2LmN0eCwgYTEsIGEyLCBhMyk7IHJldHVybjtcbiAgICAgIGRlZmF1bHQ6IHdoaWxlICgrK2kgPCBsKSAoZXYgPSBldmVudHNbaV0pLmNhbGxiYWNrLmFwcGx5KGV2LmN0eCwgYXJncyk7XG4gICAgfVxuICB9O1xuXG4gIHZhciBsaXN0ZW5NZXRob2RzID0ge2xpc3RlblRvOiAnb24nLCBsaXN0ZW5Ub09uY2U6ICdvbmNlJ307XG5cbiAgLy8gSW52ZXJzaW9uLW9mLWNvbnRyb2wgdmVyc2lvbnMgb2YgYG9uYCBhbmQgYG9uY2VgLiBUZWxsICp0aGlzKiBvYmplY3QgdG9cbiAgLy8gbGlzdGVuIHRvIGFuIGV2ZW50IGluIGFub3RoZXIgb2JqZWN0IC4uLiBrZWVwaW5nIHRyYWNrIG9mIHdoYXQgaXQnc1xuICAvLyBsaXN0ZW5pbmcgdG8uXG4gIF8uZWFjaChsaXN0ZW5NZXRob2RzLCBmdW5jdGlvbihpbXBsZW1lbnRhdGlvbiwgbWV0aG9kKSB7XG4gICAgRXZlbnRzW21ldGhvZF0gPSBmdW5jdGlvbihvYmosIG5hbWUsIGNhbGxiYWNrKSB7XG4gICAgICB2YXIgbGlzdGVuZXJzID0gdGhpcy5fbGlzdGVuZXJzIHx8ICh0aGlzLl9saXN0ZW5lcnMgPSB7fSk7XG4gICAgICB2YXIgaWQgPSBvYmouX2xpc3RlbmVySWQgfHwgKG9iai5fbGlzdGVuZXJJZCA9IF8udW5pcXVlSWQoJ2wnKSk7XG4gICAgICBsaXN0ZW5lcnNbaWRdID0gb2JqO1xuICAgICAgaWYgKHR5cGVvZiBuYW1lID09PSAnb2JqZWN0JykgY2FsbGJhY2sgPSB0aGlzO1xuICAgICAgb2JqW2ltcGxlbWVudGF0aW9uXShuYW1lLCBjYWxsYmFjaywgdGhpcyk7XG4gICAgICByZXR1cm4gdGhpcztcbiAgICB9O1xuICB9KTtcblxuICAvLyBBbGlhc2VzIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eS5cbiAgRXZlbnRzLmJpbmQgICA9IEV2ZW50cy5vbjtcbiAgRXZlbnRzLnVuYmluZCA9IEV2ZW50cy5vZmY7XG5cbiAgLy8gTWl4aW4gdXRpbGl0eVxuICBFdmVudHMubWl4aW4gPSBmdW5jdGlvbihwcm90bykge1xuICAgIHZhciBleHBvcnRzID0gWydvbicsICdvbmNlJywgJ29mZicsICd0cmlnZ2VyJywgJ3N0b3BMaXN0ZW5pbmcnLCAnbGlzdGVuVG8nLFxuICAgICAgICAgICAgICAgICAgICdsaXN0ZW5Ub09uY2UnLCAnYmluZCcsICd1bmJpbmQnXTtcbiAgICBfLmVhY2goZXhwb3J0cywgZnVuY3Rpb24obmFtZSkge1xuICAgICAgcHJvdG9bbmFtZV0gPSB0aGlzW25hbWVdO1xuICAgIH0sIHRoaXMpO1xuICAgIHJldHVybiBwcm90bztcbiAgfTtcblxuICAvLyBFeHBvcnQgRXZlbnRzIGFzIEJhY2tib25lRXZlbnRzIGRlcGVuZGluZyBvbiBjdXJyZW50IGNvbnRleHRcbiAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgICAgZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuICAgIH1cbiAgICBleHBvcnRzLkJhY2tib25lRXZlbnRzID0gRXZlbnRzO1xuICB9ZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gXCJmdW5jdGlvblwiICAmJiB0eXBlb2YgZGVmaW5lLmFtZCA9PSBcIm9iamVjdFwiKSB7XG4gICAgZGVmaW5lKGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIEV2ZW50cztcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByb290LkJhY2tib25lRXZlbnRzID0gRXZlbnRzO1xuICB9XG59KSh0aGlzKTtcbiIsIm1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9iYWNrYm9uZS1ldmVudHMtc3RhbmRhbG9uZScpO1xuIiwiKGZ1bmN0aW9uIChkZWZpbml0aW9uKSB7XG4gIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gXCJvYmplY3RcIikge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZGVmaW5pdGlvbigpO1xuICB9XG4gIGVsc2UgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgIGRlZmluZShkZWZpbml0aW9uKTtcbiAgfVxuICBlbHNlIHtcbiAgICB3aW5kb3cuQmFja2JvbmVFeHRlbmQgPSBkZWZpbml0aW9uKCk7XG4gIH1cbn0pKGZ1bmN0aW9uICgpIHtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG4gIFxuICAvLyBtaW5pLXVuZGVyc2NvcmVcbiAgdmFyIF8gPSB7XG4gICAgaGFzOiBmdW5jdGlvbiAob2JqLCBrZXkpIHtcbiAgICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpO1xuICAgIH0sXG4gIFxuICAgIGV4dGVuZDogZnVuY3Rpb24ob2JqKSB7XG4gICAgICBmb3IgKHZhciBpPTE7IGk8YXJndW1lbnRzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgIHZhciBzb3VyY2UgPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGlmIChzb3VyY2UpIHtcbiAgICAgICAgICBmb3IgKHZhciBwcm9wIGluIHNvdXJjZSkge1xuICAgICAgICAgICAgb2JqW3Byb3BdID0gc291cmNlW3Byb3BdO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG4gIH07XG5cbiAgLy8vIEZvbGxvd2luZyBjb2RlIGlzIHBhc3RlZCBmcm9tIEJhY2tib25lLmpzIC8vL1xuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb3JyZWN0bHkgc2V0IHVwIHRoZSBwcm90b3R5cGUgY2hhaW4sIGZvciBzdWJjbGFzc2VzLlxuICAvLyBTaW1pbGFyIHRvIGBnb29nLmluaGVyaXRzYCwgYnV0IHVzZXMgYSBoYXNoIG9mIHByb3RvdHlwZSBwcm9wZXJ0aWVzIGFuZFxuICAvLyBjbGFzcyBwcm9wZXJ0aWVzIHRvIGJlIGV4dGVuZGVkLlxuICB2YXIgZXh0ZW5kID0gZnVuY3Rpb24ocHJvdG9Qcm9wcywgc3RhdGljUHJvcHMpIHtcbiAgICB2YXIgcGFyZW50ID0gdGhpcztcbiAgICB2YXIgY2hpbGQ7XG5cbiAgICAvLyBUaGUgY29uc3RydWN0b3IgZnVuY3Rpb24gZm9yIHRoZSBuZXcgc3ViY2xhc3MgaXMgZWl0aGVyIGRlZmluZWQgYnkgeW91XG4gICAgLy8gKHRoZSBcImNvbnN0cnVjdG9yXCIgcHJvcGVydHkgaW4geW91ciBgZXh0ZW5kYCBkZWZpbml0aW9uKSwgb3IgZGVmYXVsdGVkXG4gICAgLy8gYnkgdXMgdG8gc2ltcGx5IGNhbGwgdGhlIHBhcmVudCdzIGNvbnN0cnVjdG9yLlxuICAgIGlmIChwcm90b1Byb3BzICYmIF8uaGFzKHByb3RvUHJvcHMsICdjb25zdHJ1Y3RvcicpKSB7XG4gICAgICBjaGlsZCA9IHByb3RvUHJvcHMuY29uc3RydWN0b3I7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNoaWxkID0gZnVuY3Rpb24oKXsgcmV0dXJuIHBhcmVudC5hcHBseSh0aGlzLCBhcmd1bWVudHMpOyB9O1xuICAgIH1cblxuICAgIC8vIEFkZCBzdGF0aWMgcHJvcGVydGllcyB0byB0aGUgY29uc3RydWN0b3IgZnVuY3Rpb24sIGlmIHN1cHBsaWVkLlxuICAgIF8uZXh0ZW5kKGNoaWxkLCBwYXJlbnQsIHN0YXRpY1Byb3BzKTtcblxuICAgIC8vIFNldCB0aGUgcHJvdG90eXBlIGNoYWluIHRvIGluaGVyaXQgZnJvbSBgcGFyZW50YCwgd2l0aG91dCBjYWxsaW5nXG4gICAgLy8gYHBhcmVudGAncyBjb25zdHJ1Y3RvciBmdW5jdGlvbi5cbiAgICB2YXIgU3Vycm9nYXRlID0gZnVuY3Rpb24oKXsgdGhpcy5jb25zdHJ1Y3RvciA9IGNoaWxkOyB9O1xuICAgIFN1cnJvZ2F0ZS5wcm90b3R5cGUgPSBwYXJlbnQucHJvdG90eXBlO1xuICAgIGNoaWxkLnByb3RvdHlwZSA9IG5ldyBTdXJyb2dhdGUoKTtcblxuICAgIC8vIEFkZCBwcm90b3R5cGUgcHJvcGVydGllcyAoaW5zdGFuY2UgcHJvcGVydGllcykgdG8gdGhlIHN1YmNsYXNzLFxuICAgIC8vIGlmIHN1cHBsaWVkLlxuICAgIGlmIChwcm90b1Byb3BzKSBfLmV4dGVuZChjaGlsZC5wcm90b3R5cGUsIHByb3RvUHJvcHMpO1xuXG4gICAgLy8gU2V0IGEgY29udmVuaWVuY2UgcHJvcGVydHkgaW4gY2FzZSB0aGUgcGFyZW50J3MgcHJvdG90eXBlIGlzIG5lZWRlZFxuICAgIC8vIGxhdGVyLlxuICAgIGNoaWxkLl9fc3VwZXJfXyA9IHBhcmVudC5wcm90b3R5cGU7XG5cbiAgICByZXR1cm4gY2hpbGQ7XG4gIH07XG5cbiAgLy8gRXhwb3NlIHRoZSBleHRlbmQgZnVuY3Rpb25cbiAgcmV0dXJuIGV4dGVuZDtcbn0pO1xuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG5cbmZ1bmN0aW9uIGRyYWluUXVldWUoKSB7XG4gICAgaWYgKGRyYWluaW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSB0cnVlO1xuICAgIHZhciBjdXJyZW50UXVldWU7XG4gICAgdmFyIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB3aGlsZShsZW4pIHtcbiAgICAgICAgY3VycmVudFF1ZXVlID0gcXVldWU7XG4gICAgICAgIHF1ZXVlID0gW107XG4gICAgICAgIHZhciBpID0gLTE7XG4gICAgICAgIHdoaWxlICgrK2kgPCBsZW4pIHtcbiAgICAgICAgICAgIGN1cnJlbnRRdWV1ZVtpXSgpO1xuICAgICAgICB9XG4gICAgICAgIGxlbiA9IHF1ZXVlLmxlbmd0aDtcbiAgICB9XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbn1cbnByb2Nlc3MubmV4dFRpY2sgPSBmdW5jdGlvbiAoZnVuKSB7XG4gICAgcXVldWUucHVzaChmdW4pO1xuICAgIGlmICghZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHByb3RvID0gRWxlbWVudC5wcm90b3R5cGU7XG52YXIgdmVuZG9yID0gcHJvdG8ubWF0Y2hlc1xuICB8fCBwcm90by5tYXRjaGVzU2VsZWN0b3JcbiAgfHwgcHJvdG8ud2Via2l0TWF0Y2hlc1NlbGVjdG9yXG4gIHx8IHByb3RvLm1vek1hdGNoZXNTZWxlY3RvclxuICB8fCBwcm90by5tc01hdGNoZXNTZWxlY3RvclxuICB8fCBwcm90by5vTWF0Y2hlc1NlbGVjdG9yO1xuXG5tb2R1bGUuZXhwb3J0cyA9IG1hdGNoO1xuXG4vKipcbiAqIE1hdGNoIGBlbGAgdG8gYHNlbGVjdG9yYC5cbiAqXG4gKiBAcGFyYW0ge0VsZW1lbnR9IGVsXG4gKiBAcGFyYW0ge1N0cmluZ30gc2VsZWN0b3JcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIG1hdGNoKGVsLCBzZWxlY3Rvcikge1xuICBpZiAodmVuZG9yKSByZXR1cm4gdmVuZG9yLmNhbGwoZWwsIHNlbGVjdG9yKTtcbiAgdmFyIG5vZGVzID0gZWwucGFyZW50Tm9kZS5xdWVyeVNlbGVjdG9yQWxsKHNlbGVjdG9yKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBub2Rlcy5sZW5ndGg7IGkrKykge1xuICAgIGlmIChub2Rlc1tpXSA9PSBlbCkgcmV0dXJuIHRydWU7XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufSIsInZhciBUcmFja3IgPSByZXF1aXJlKFwidHJhY2tyXCIpO1xudmFyIGhhc093biA9IHJlcXVpcmUoXCJoYXMtb3duLXByb3BcIik7XG52YXIgY2xvbmUgPSByZXF1aXJlKFwic2hhbGxvdy1jb3B5XCIpO1xudmFyIGlzUGxhaW5PYmplY3QgPSByZXF1aXJlKFwiaXMtcGxhaW4tb2JqZWN0XCIpO1xudmFyIHBhdGNoQXJyYXkgPSByZXF1aXJlKFwiYXJyYXktc3B5XCIpO1xuXG52YXIgdHJhY2sgPVxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHJlcGxhY2VyKSB7XG5cdGZ1bmN0aW9uIHJlcGxhY2Uoaywgdikge1xuXHRcdHZhciBudmFsO1xuXHRcdGlmICh0eXBlb2YgcmVwbGFjZXIgPT09IFwiZnVuY3Rpb25cIikgbnZhbCA9IHJlcGxhY2VyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG5cdFx0aWYgKHR5cGVvZiBudmFsID09PSBcInVuZGVmaW5lZFwiICYmIHR5cGVvZiB2ICE9PSBcInVuZGVmaW5lZFwiKSBudmFsID0gdHJhY2sodik7XG5cdFx0cmV0dXJuIG52YWw7XG5cdH1cblxuXHRpZiAoQXJyYXkuaXNBcnJheShvYmopKSByZXR1cm4gdHJhY2tBcnJheShvYmosIHJlcGxhY2UpXG5cdGlmIChpc1BsYWluT2JqZWN0KG9iaikpIHJldHVybiB0cmFja09iamVjdChvYmosIHJlcGxhY2UpO1xuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgdHJhY2tQcm9wZXJ0eSA9XG50cmFjay50cmFja1Byb3BlcnR5ID0gZnVuY3Rpb24ob2JqLCBwcm9wLCB2YWx1ZSwgb3B0aW9ucykge1xuXHRpZiAodHlwZW9mIG9iaiAhPT0gXCJvYmplY3RcIiB8fCBvYmogPT0gbnVsbCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBvYmplY3QgdG8gZGVmaW5lIHRoZSByZWFjdGl2ZSBwcm9wZXJ0eSBvbi5cIik7XG5cdH1cblxuXHRpZiAodHlwZW9mIHByb3AgIT09IFwic3RyaW5nXCIpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBzdHJpbmcgZm9yIHByb3BlcnR5IG5hbWUuXCIpO1xuXG5cdHZhciBkZXAgPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3k7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG9iaiwgcHJvcCwge1xuXHRcdGNvbmZpZ3VyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuY29uZmlndXJhYmxlICE9PSBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5lbnVtZXJhYmxlICE9PSBmYWxzZSxcblx0XHRzZXQ6IGZ1bmN0aW9uKHZhbCkge1xuXHRcdFx0aWYgKHZhbCAhPT0gdmFsdWUpIHtcblx0XHRcdFx0dmFsdWUgPSB2YWw7XG5cdFx0XHRcdGRlcC5jaGFuZ2VkKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9LFxuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRkZXAuZGVwZW5kKCk7XG5cdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0fVxuXHR9KTtcblxuXHRyZXR1cm4gb2JqO1xufVxuXG52YXIgdHJhY2tPYmplY3QgPVxudHJhY2sudHJhY2tPYmplY3QgPSBmdW5jdGlvbihwcm9wcywgcmVwbGFjZXIpIHtcblx0aWYgKHByb3BzLl9fcmVhY3RpdmUpIHJldHVybiBwcm9wcztcblxuXHR2YXIgdmFsdWVzID0ge307XG5cdHZhciBkZXBzID0ge307XG5cdHZhciBtYWluRGVwID0gbmV3IFRyYWNrci5EZXBlbmRlbmN5KCk7XG5cblx0ZnVuY3Rpb24gcmVwbGFjZShjdHgsIG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXHRcdHJldHVybiBUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHJlcGxhY2VyID09PSBcImZ1bmN0aW9uXCIgPyByZXBsYWNlci5jYWxsKGN0eCwgbmFtZSwgdmFsdWUpIDogdmFsdWU7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXR0ZXIobmFtZSkge1xuXHRcdGRlcHNbbmFtZV0uZGVwZW5kKCk7XG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHRlcihuYW1lLCB2YWx1ZSkge1xuXHRcdHZhciBvbGQgPSB2YWx1ZXNbbmFtZV07XG5cdFx0dmFsdWVzW25hbWVdID0gcmVwbGFjZSh0aGlzLCBuYW1lLCB2YWx1ZSk7XG5cblx0XHR2YXIgZGVwID0gZGVwc1tuYW1lXTtcblx0XHRpZiAoZGVwID09IG51bGwpIGRlcCA9IGRlcHNbbmFtZV0gPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKTtcblx0XHRpZiAob2xkICE9PSB2YWx1ZXNbbmFtZV0pIGRlcC5jaGFuZ2VkKCk7XG5cblx0XHRtYWluRGVwLmNoYW5nZWQoKTtcblx0XHRyZXR1cm4gdmFsdWVzW25hbWVdO1xuXHR9XG5cblx0dmFyIF9wcm90byA9IHR5cGVvZiBwcm9wcy5jb25zdHJ1Y3RvciA9PT0gXCJmdW5jdGlvblwiID8gT2JqZWN0LmNyZWF0ZShwcm9wcy5jb25zdHJ1Y3Rvci5wcm90b3R5cGUpIDoge307XG5cblx0X3Byb3RvLmRlZmluZVByb3BlcnR5ID0gZnVuY3Rpb24obmFtZSwgdmFsdWUsIG9wdGlvbnMpIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgbmFtZSwge1xuXHRcdFx0Y29uZmlndXJhYmxlOiBvcHRpb25zID09IG51bGwgfHwgb3B0aW9ucy5jb25maWd1cmFibGUgIT09IGZhbHNlLFxuXHRcdFx0ZW51bWVyYWJsZTogb3B0aW9ucyA9PSBudWxsIHx8IG9wdGlvbnMuZW51bWVyYWJsZSAhPT0gZmFsc2UsXG5cdFx0XHRnZXQ6IGdldHRlci5iaW5kKHRoaXMsIG5hbWUpLFxuXHRcdFx0c2V0OiBzZXR0ZXIuYmluZCh0aGlzLCBuYW1lKVxuXHRcdH0pO1xuXG5cdFx0dGhpc1tuYW1lXSA9IHZhbHVlO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9O1xuXG5cdF9wcm90by5kZWxldGVQcm9wZXJ0eSA9IGZ1bmN0aW9uKG5hbWUpIHtcblx0XHR2YXIgZGVwID0gZGVwc1tuYW1lXTtcblx0XHRpZiAoZGVsZXRlIHRoaXNbbmFtZV0pIHsgLy8gaW4gY2FzZSBjb25maWd1cmFibGUgPT09IGZhbHNlXG5cdFx0XHRkZWxldGUgdmFsdWVzW25hbWVdO1xuXHRcdFx0ZGVsZXRlIGRlcHNbbmFtZV07XG5cdFx0XHRpZiAoZGVwKSBkZXAuY2hhbmdlZCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcztcblx0fTtcblxuXHRfcHJvdG8udG9KU09OID0gZnVuY3Rpb24oKSB7XG5cdFx0bWFpbkRlcC5kZXBlbmQoKTtcblx0XHRyZXR1cm4gY2xvbmUodmFsdWVzKTtcblx0fTtcblxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkoX3Byb3RvLCBcIl9fcmVhY3RpdmVcIiwge1xuXHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0dmFsdWU6IHRydWUsXG5cdFx0d3JpdGVhYmxlOiBmYWxzZVxuXHR9KTtcblxuXHR2YXIgcm9iaiA9IE9iamVjdC5jcmVhdGUoX3Byb3RvKTtcblxuXHRmb3IgKHZhciBrZXkgaW4gcHJvcHMpIHtcblx0XHRpZiAoaGFzT3duKHByb3BzLCBrZXkpKSByb2JqLmRlZmluZVByb3BlcnR5KGtleSwgcHJvcHNba2V5XSk7XG5cdH1cblxuXHRyZXR1cm4gcm9iajtcbn1cblxudmFyIHRyYWNrQXJyYXkgPVxudHJhY2sudHJhY2tBcnJheSA9IGZ1bmN0aW9uKGFyciwgcmVwbGFjZXIpIHtcblx0aWYgKCFBcnJheS5pc0FycmF5KGFycikpIHRocm93IG5ldyBFcnJvcihcIkV4cGVjdGluZyBhcnJheS5cIik7XG5cdGlmIChhcnIuX19yZWFjdGl2ZSkgcmV0dXJuIGFycjtcblxuXHR2YXIgZGVwcyA9IHsgbGVuZ3RoOiBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKSB9O1xuXHR2YXIgdmFsdWVzID0ge307XG5cdHZhciBuYXJyID0gcGF0Y2hBcnJheShbXSk7XG5cblx0ZnVuY3Rpb24gcmVwbGFjZShjdHgsIG5hbWUsIHZhbHVlKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gXCJ1bmRlZmluZWRcIikgcmV0dXJuO1xuXHRcdHJldHVybiBUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHJlcGxhY2VyID09PSBcImZ1bmN0aW9uXCIgPyByZXBsYWNlci5jYWxsKGN0eCwgbmFtZSwgdmFsdWUpIDogdmFsdWU7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXR0ZXIobmFtZSkge1xuXHRcdGRlcHNbbmFtZV0uZGVwZW5kKCk7XG5cdFx0cmV0dXJuIHZhbHVlc1tuYW1lXTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHRlcihuYW1lLCB2YWx1ZSkge1xuXHRcdHZhciBvbGQgPSB2YWx1ZXNbbmFtZV07XG5cdFx0dmFsdWVzW25hbWVdID0gcmVwbGFjZSh0aGlzLCBuYW1lLCB2YWx1ZSk7XG5cblx0XHR2YXIgZGVwID0gZGVwc1tuYW1lXTtcblx0XHRpZiAoZGVwID09IG51bGwpIGRlcCA9IGRlcHNbbmFtZV0gPSBuZXcgVHJhY2tyLkRlcGVuZGVuY3koKTtcblx0XHRpZiAob2xkICE9PSB2YWx1ZXNbbmFtZV0pIGRlcC5jaGFuZ2VkKCk7XG5cblx0XHRyZXR1cm4gdmFsdWVzW25hbWVdO1xuXHR9XG5cblx0ZnVuY3Rpb24gZGVmaW5lKGkpIHtcblx0XHR2YXIgZGVwO1xuXG5cdFx0aWYgKHR5cGVvZiBpID09PSBcIm51bWJlclwiICYmIGkgPj0gbmFyci5sZW5ndGgpIHtcblx0XHRcdGlmICgoZGVwID0gZGVwc1tpXSkgIT0gbnVsbCkge1xuXHRcdFx0XHRkZWxldGUgZGVwc1tpXTtcblx0XHRcdH1cblxuXHRcdFx0ZGVsZXRlIG5hcnJbaV07XG5cdFx0XHRkZWxldGUgdmFsdWVzW2ldO1xuXHRcdFx0ZGVwLmNoYW5nZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzZXR0ZXIuY2FsbCh0aGlzLCBpLCBuYXJyW2ldKTtcblxuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBpLnRvU3RyaW5nKCksIHtcblx0XHRcdGNvbmZpZ3VyYWJsZTogdHJ1ZSxcblx0XHRcdGVudW1lcmFibGU6IHRydWUsXG5cdFx0XHRnZXQ6IGdldHRlci5iaW5kKG5hcnIsIGkpLFxuXHRcdFx0c2V0OiBzZXR0ZXIuYmluZChuYXJyLCBpKVxuXHRcdH0pO1xuXHR9XG5cblx0bmFyci5vYnNlcnZlKGZ1bmN0aW9uKGNoZykge1xuXHRcdHZhciBiYWxhbmNlLCBzdGFydCwgZW5kLCBsZW4sIGksIHByZXZsZW47XG5cblx0XHRpZiAoY2hnID09IG51bGwpIHJldHVybjtcblxuXHRcdGJhbGFuY2UgPSBjaGcuYWRkZWQgLSBjaGcucmVtb3ZlZDtcblx0XHRpZiAoIWJhbGFuY2UpIHJldHVybjtcblxuXHRcdGxlbiA9IG5hcnIubGVuZ3RoO1xuXHRcdHByZXZsZW4gPSBsZW4gLSBiYWxhbmNlO1xuXHRcdHN0YXJ0ID0gTWF0aC5taW4ocHJldmxlbiwgbGVuKTtcblx0XHRlbmQgPSBNYXRoLm1heChwcmV2bGVuLCBsZW4pO1xuXG5cdFx0Zm9yIChpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykgZGVmaW5lKGkpO1xuXHRcdGRlcHMubGVuZ3RoLmNoYW5nZWQoKTtcblx0fSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG5hcnIsIFwiX19yZWFjdGl2ZVwiLCB7XG5cdFx0Y29uZmlndXJhYmxlOiBmYWxzZSxcblx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHR2YWx1ZTogdHJ1ZSxcblx0XHR3cml0ZWFibGU6IGZhbHNlXG5cdH0pO1xuXG5cdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShuYXJyLCBcIiRsZW5ndGhcIiwge1xuXHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0ZW51bWVyYWJsZTogZmFsc2UsXG5cdFx0Z2V0OiBmdW5jdGlvbigpIHtcblx0XHRcdGRlcHMubGVuZ3RoLmRlcGVuZCgpO1xuXHRcdFx0cmV0dXJuIHRoaXMubGVuZ3RoO1xuXHRcdH1cblx0fSk7XG5cblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG5hcnIsIFwiZGVwZW5kXCIsIHtcblx0XHRjb25maWd1cmFibGU6IGZhbHNlLFxuXHRcdGVudW1lcmFibGU6IGZhbHNlLFxuXHRcdGdldDogZnVuY3Rpb24oKSB7XG5cdFx0XHRkZXBzLmxlbmd0aC5kZXBlbmQoKTtcblx0XHR9XG5cdH0pO1xuXG5cdG5hcnIucHVzaC5hcHBseShuYXJyLCBhcnIpO1xuXHRyZXR1cm4gbmFycjtcbn1cbiIsIi8vIGFycmF5IHdyaXRlIG9wZXJhdGlvbnNcbnZhciBtdXRhdG9yTWV0aG9kcyA9IFsgJ3BvcCcsICdwdXNoJywgJ3JldmVyc2UnLCAnc2hpZnQnLCAnc29ydCcsICdzcGxpY2UnLCAndW5zaGlmdCcgXTtcblxuLy8gcGF0Y2hlcyBhbiBhcnJheSBzbyB3ZSBjYW4gbGlzdGVuIHRvIHdyaXRlIG9wZXJhdGlvbnNcbnZhciBwYXRjaEFycmF5ID1cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oYXJyKSB7XG5cdGlmIChhcnIuX3BhdGNoZWQpIHJldHVybiBhcnI7XG5cblx0dmFyIHBhdGNoZWRBcnJheVByb3RvID0gW10sXG5cdFx0b2JzZXJ2ZXJzID0gW107XG5cblx0bXV0YXRvck1ldGhvZHMuZm9yRWFjaChmdW5jdGlvbihtZXRob2ROYW1lKSB7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHBhdGNoZWRBcnJheVByb3RvLCBtZXRob2ROYW1lLCB7XG5cdFx0XHR2YWx1ZTogbWV0aG9kXG5cdFx0fSk7XG5cblx0XHRmdW5jdGlvbiBtZXRob2QoKSB7XG5cdFx0XHR2YXIgc3BsaWNlRXF1aXZhbGVudCwgc3VtbWFyeSwgYXJncywgcmVzO1xuXG5cdFx0XHRhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAwKTtcblxuXHRcdFx0Ly8gY29udmVydCB0aGUgb3BlcmF0aW9uIGludG8gYSBzcGxpY2Vcblx0XHRcdHNwbGljZUVxdWl2YWxlbnQgPSBnZXRTcGxpY2VFcXVpdmFsZW50KHRoaXMsIG1ldGhvZE5hbWUsIGFyZ3MpO1xuXHRcdFx0c3VtbWFyeSA9IHN1bW1hcmlzZVNwbGljZU9wZXJhdGlvbih0aGlzLCBzcGxpY2VFcXVpdmFsZW50KTtcblxuXHRcdFx0Ly8gcnVuIHRoZSBpbnRlbmRlZCBtZXRob2Rcblx0XHRcdHJlcyA9IEFycmF5LnByb3RvdHlwZVttZXRob2ROYW1lXS5hcHBseSh0aGlzLCBhcmdzKTtcblxuXHRcdFx0Ly8gY2FsbCB0aGUgb2JlcnN2c2Vyc1xuXHRcdFx0b2JzZXJ2ZXJzLmZvckVhY2goZnVuY3Rpb24oZm4pIHtcblx0XHRcdFx0Zm4uY2FsbCh0aGlzLCBzdW1tYXJ5KTtcblx0XHRcdH0sIHRoaXMpO1xuXG5cdFx0XHQvLyByZXR1cm4gdGhlIHJlc3VsdCBvZiB0aGUgbWV0aG9kXG5cdFx0XHRyZXR1cm4gcmVzO1xuXHRcdH07XG5cdH0pO1xuXG5cdGlmICgoe30pLl9fcHJvdG9fXykgYXJyLl9fcHJvdG9fXyA9IHBhdGNoZWRBcnJheVByb3RvO1xuXHRlbHNlIHtcblx0XHRtdXRhdG9yTWV0aG9kcy5mb3JFYWNoKGZ1bmN0aW9uKG1ldGhvZE5hbWUpIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShhcnIsIG1ldGhvZE5hbWUsIHtcblx0XHRcdFx0dmFsdWU6IHBhdGNoZWRBcnJheVByb3RvW21ldGhvZE5hbWVdLFxuXHRcdFx0XHRjb25maWd1cmFibGU6IHRydWVcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0dmFyIGV4dHJhcyA9IHtcblx0XHRfcGF0Y2hlZDogdHJ1ZSxcblx0XHRvYnNlcnZlOiBmdW5jdGlvbihmbikge1xuXHRcdFx0aWYgKHR5cGVvZiBmbiAhPT0gXCJmdW5jdGlvblwiKSB0aHJvdyBuZXcgRXJyb3IoXCJFeHBlY3RpbmcgZnVuY3Rpb24gdG8gb2JzZXJ2ZSB3aXRoLlwiKTtcblx0XHRcdG9ic2VydmVycy5wdXNoKGZuKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH0sXG5cdFx0c3RvcE9ic2VydmluZzogZnVuY3Rpb24oZm4pIHtcblx0XHRcdHZhciBpbmRleCA9IG9ic2VydmVycy5pbmRleE9mKGZuKTtcblx0XHRcdGlmIChpbmRleCA+IC0xKSBvYnNlcnZlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdHJldHVybiB0aGlzO1xuXHRcdH1cblx0fTtcblxuXHRmb3IgKHZhciBrIGluIGV4dHJhcykge1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShhcnIsIGssIHtcblx0XHRcdGNvbmZpZ3VyYWJsZTogZmFsc2UsXG5cdFx0XHRlbnVtZXJhYmxlOiBmYWxzZSxcblx0XHRcdHZhbHVlOiBleHRyYXNba10sXG5cdFx0XHR3cml0ZWFibGU6IGZhbHNlXG5cdFx0fSk7XG5cdH1cblxuXHRyZXR1cm4gYXJyO1xufVxuXG4vLyBjb252ZXJ0cyBhcnJheSB3cml0ZSBvcGVyYXRpb25zIGludG8gc3BsaWNlIGVxdWl2YWxlbnQgYXJndW1lbnRzXG52YXIgZ2V0U3BsaWNlRXF1aXZhbGVudCA9XG5wYXRjaEFycmF5LmdldFNwbGljZUVxdWl2YWxlbnQgPSBmdW5jdGlvbiAoIGFycmF5LCBtZXRob2ROYW1lLCBhcmdzICkge1xuXHRzd2l0Y2ggKCBtZXRob2ROYW1lICkge1xuXHRcdGNhc2UgJ3NwbGljZSc6XG5cdFx0XHRyZXR1cm4gYXJncztcblxuXHRcdGNhc2UgJ3NvcnQnOlxuXHRcdGNhc2UgJ3JldmVyc2UnOlxuXHRcdFx0cmV0dXJuIG51bGw7XG5cblx0XHRjYXNlICdwb3AnOlxuXHRcdFx0aWYgKCBhcnJheS5sZW5ndGggKSB7XG5cdFx0XHRcdHJldHVybiBbIC0xIF07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbnVsbDtcblxuXHRcdGNhc2UgJ3B1c2gnOlxuXHRcdFx0cmV0dXJuIFsgYXJyYXkubGVuZ3RoLCAwIF0uY29uY2F0KCBhcmdzICk7XG5cblx0XHRjYXNlICdzaGlmdCc6XG5cdFx0XHRyZXR1cm4gWyAwLCAxIF07XG5cblx0XHRjYXNlICd1bnNoaWZ0Jzpcblx0XHRcdHJldHVybiBbIDAsIDAgXS5jb25jYXQoIGFyZ3MgKTtcblx0fVxufVxuXG4vLyByZXR1cm5zIGEgc3VtbWFyeSBwZiBob3cgYW4gYXJyYXkgd2lsbCBiZSBjaGFuZ2VkIGFmdGVyIHRoZSBzcGxpY2Ugb3BlcmF0aW9uXG52YXIgc3VtbWFyaXNlU3BsaWNlT3BlcmF0aW9uID1cbnBhdGNoQXJyYXkuc3VtbWFyaXNlU3BsaWNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCBhcnJheSwgYXJncyApIHtcblx0dmFyIGluZGV4LCBhZGRlZEl0ZW1zLCByZW1vdmVkSXRlbXM7XG5cblx0aWYgKCFhcmdzKSByZXR1cm4gbnVsbDtcblxuXHQvLyBmaWd1cmUgb3V0IHdoZXJlIHRoZSBjaGFuZ2VzIHN0YXJ0ZWQuLi5cblx0aW5kZXggPSArKCBhcmdzWzBdIDwgMCA/IGFycmF5Lmxlbmd0aCArIGFyZ3NbMF0gOiBhcmdzWzBdICk7XG5cblx0Ly8gLi4uYW5kIGhvdyBtYW55IGl0ZW1zIHdlcmUgYWRkZWQgdG8gb3IgcmVtb3ZlZCBmcm9tIHRoZSBhcnJheVxuXHRhZGRlZEl0ZW1zID0gTWF0aC5tYXgoIDAsIGFyZ3MubGVuZ3RoIC0gMiApO1xuXHRyZW1vdmVkSXRlbXMgPSAoIGFyZ3NbMV0gIT09IHVuZGVmaW5lZCA/IGFyZ3NbMV0gOiBhcnJheS5sZW5ndGggLSBpbmRleCApO1xuXG5cdC8vIEl0J3MgcG9zc2libGUgdG8gZG8gZS5nLiBbIDEsIDIsIDMgXS5zcGxpY2UoIDIsIDIgKSAtIGkuZS4gdGhlIHNlY29uZCBhcmd1bWVudFxuXHQvLyBtZWFucyByZW1vdmluZyBtb3JlIGl0ZW1zIGZyb20gdGhlIGVuZCBvZiB0aGUgYXJyYXkgdGhhbiB0aGVyZSBhcmUuIEluIHRoZXNlXG5cdC8vIGNhc2VzIHdlIG5lZWQgdG8gY3VyYiBKYXZhU2NyaXB0J3MgZW50aHVzaWFzbSBvciB3ZSdsbCBnZXQgb3V0IG9mIHN5bmNcblx0cmVtb3ZlZEl0ZW1zID0gTWF0aC5taW4oIHJlbW92ZWRJdGVtcywgYXJyYXkubGVuZ3RoIC0gaW5kZXggKTtcblxuXHRyZXR1cm4ge1xuXHRcdGluZGV4OiBpbmRleCxcblx0XHRhZGRlZDogYWRkZWRJdGVtcyxcblx0XHRyZW1vdmVkOiByZW1vdmVkSXRlbXNcblx0fTtcbn1cbiIsIid1c2Ugc3RyaWN0JztcbnZhciBoYXNPd25Qcm9wID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiAob2JqLCBwcm9wKSB7XG5cdHJldHVybiBoYXNPd25Qcm9wLmNhbGwob2JqLCBwcm9wKTtcbn07XG4iLCIvKiFcbiAqIGlzLXBsYWluLW9iamVjdCA8aHR0cHM6Ly9naXRodWIuY29tL2pvbnNjaGxpbmtlcnQvaXMtcGxhaW4tb2JqZWN0PlxuICpcbiAqIENvcHlyaWdodCAoYykgMjAxNC0yMDE1LCBKb24gU2NobGlua2VydC5cbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS5cbiAqL1xuXG4ndXNlIHN0cmljdCc7XG5cbnZhciBpc09iamVjdCA9IHJlcXVpcmUoJ2lzb2JqZWN0Jyk7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0T2JqZWN0KG8pIHtcbiAgcmV0dXJuIGlzT2JqZWN0KG8pID09PSB0cnVlXG4gICAgJiYgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pID09PSAnW29iamVjdCBPYmplY3RdJztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc1BsYWluT2JqZWN0KG8pIHtcbiAgdmFyIGN0b3IscHJvdDtcbiAgXG4gIGlmIChpc09iamVjdE9iamVjdChvKSA9PT0gZmFsc2UpIHJldHVybiBmYWxzZTtcbiAgXG4gIC8vIElmIGhhcyBtb2RpZmllZCBjb25zdHJ1Y3RvclxuICBjdG9yID0gby5jb25zdHJ1Y3RvcjtcbiAgaWYgKHR5cGVvZiBjdG9yICE9PSAnZnVuY3Rpb24nKSByZXR1cm4gZmFsc2U7XG4gIFxuICAvLyBJZiBoYXMgbW9kaWZpZWQgcHJvdG90eXBlXG4gIHByb3QgPSBjdG9yLnByb3RvdHlwZTtcbiAgaWYgKGlzT2JqZWN0T2JqZWN0KHByb3QpID09PSBmYWxzZSkgcmV0dXJuIGZhbHNlO1xuICBcbiAgLy8gSWYgY29uc3RydWN0b3IgZG9lcyBub3QgaGF2ZSBhbiBPYmplY3Qtc3BlY2lmaWMgbWV0aG9kXG4gIGlmIChwcm90Lmhhc093blByb3BlcnR5KCdpc1Byb3RvdHlwZU9mJykgPT09IGZhbHNlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIFxuICAvLyBNb3N0IGxpa2VseSBhIHBsYWluIE9iamVjdFxuICByZXR1cm4gdHJ1ZTtcbn07XG4iLCIvKiFcbiAqIGlzb2JqZWN0IDxodHRwczovL2dpdGh1Yi5jb20vam9uc2NobGlua2VydC9pc29iamVjdD5cbiAqXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTQtMjAxNSwgSm9uIFNjaGxpbmtlcnQuXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuXG4gKi9cblxuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzT2JqZWN0KHZhbCkge1xuICByZXR1cm4gdmFsICE9IG51bGwgJiYgdHlwZW9mIHZhbCA9PT0gJ29iamVjdCdcbiAgICAmJiAhQXJyYXkuaXNBcnJheSh2YWwpO1xufTtcbiIsIm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gKG9iaikge1xuICAgIGlmICghb2JqIHx8IHR5cGVvZiBvYmogIT09ICdvYmplY3QnKSByZXR1cm4gb2JqO1xuICAgIFxuICAgIHZhciBjb3B5O1xuICAgIFxuICAgIGlmIChpc0FycmF5KG9iaikpIHtcbiAgICAgICAgdmFyIGxlbiA9IG9iai5sZW5ndGg7XG4gICAgICAgIGNvcHkgPSBBcnJheShsZW4pO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgICAgICBjb3B5W2ldID0gb2JqW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB2YXIga2V5cyA9IG9iamVjdEtleXMob2JqKTtcbiAgICAgICAgY29weSA9IHt9O1xuICAgICAgICBcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBrZXlzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgdmFyIGtleSA9IGtleXNbaV07XG4gICAgICAgICAgICBjb3B5W2tleV0gPSBvYmpba2V5XTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gY29weTtcbn07XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgICBpZiAoe30uaGFzT3duUHJvcGVydHkuY2FsbChvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICAgIH1cbiAgICByZXR1cm4ga2V5cztcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgICByZXR1cm4ge30udG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwidmFyIG5vdyA9IHJlcXVpcmUoJ3BlcmZvcm1hbmNlLW5vdycpXG4gICwgZ2xvYmFsID0gdHlwZW9mIHdpbmRvdyA9PT0gJ3VuZGVmaW5lZCcgPyB7fSA6IHdpbmRvd1xuICAsIHZlbmRvcnMgPSBbJ21veicsICd3ZWJraXQnXVxuICAsIHN1ZmZpeCA9ICdBbmltYXRpb25GcmFtZSdcbiAgLCByYWYgPSBnbG9iYWxbJ3JlcXVlc3QnICsgc3VmZml4XVxuICAsIGNhZiA9IGdsb2JhbFsnY2FuY2VsJyArIHN1ZmZpeF0gfHwgZ2xvYmFsWydjYW5jZWxSZXF1ZXN0JyArIHN1ZmZpeF1cblxuZm9yKHZhciBpID0gMDsgaSA8IHZlbmRvcnMubGVuZ3RoICYmICFyYWY7IGkrKykge1xuICByYWYgPSBnbG9iYWxbdmVuZG9yc1tpXSArICdSZXF1ZXN0JyArIHN1ZmZpeF1cbiAgY2FmID0gZ2xvYmFsW3ZlbmRvcnNbaV0gKyAnQ2FuY2VsJyArIHN1ZmZpeF1cbiAgICAgIHx8IGdsb2JhbFt2ZW5kb3JzW2ldICsgJ0NhbmNlbFJlcXVlc3QnICsgc3VmZml4XVxufVxuXG4vLyBTb21lIHZlcnNpb25zIG9mIEZGIGhhdmUgckFGIGJ1dCBub3QgY0FGXG5pZighcmFmIHx8ICFjYWYpIHtcbiAgdmFyIGxhc3QgPSAwXG4gICAgLCBpZCA9IDBcbiAgICAsIHF1ZXVlID0gW11cbiAgICAsIGZyYW1lRHVyYXRpb24gPSAxMDAwIC8gNjBcblxuICByYWYgPSBmdW5jdGlvbihjYWxsYmFjaykge1xuICAgIGlmKHF1ZXVlLmxlbmd0aCA9PT0gMCkge1xuICAgICAgdmFyIF9ub3cgPSBub3coKVxuICAgICAgICAsIG5leHQgPSBNYXRoLm1heCgwLCBmcmFtZUR1cmF0aW9uIC0gKF9ub3cgLSBsYXN0KSlcbiAgICAgIGxhc3QgPSBuZXh0ICsgX25vd1xuICAgICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGNwID0gcXVldWUuc2xpY2UoMClcbiAgICAgICAgLy8gQ2xlYXIgcXVldWUgaGVyZSB0byBwcmV2ZW50XG4gICAgICAgIC8vIGNhbGxiYWNrcyBmcm9tIGFwcGVuZGluZyBsaXN0ZW5lcnNcbiAgICAgICAgLy8gdG8gdGhlIGN1cnJlbnQgZnJhbWUncyBxdWV1ZVxuICAgICAgICBxdWV1ZS5sZW5ndGggPSAwXG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjcC5sZW5ndGg7IGkrKykge1xuICAgICAgICAgIGlmKCFjcFtpXS5jYW5jZWxsZWQpIHtcbiAgICAgICAgICAgIHRyeXtcbiAgICAgICAgICAgICAgY3BbaV0uY2FsbGJhY2sobGFzdClcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkgeyB0aHJvdyBlIH0sIDApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LCBNYXRoLnJvdW5kKG5leHQpKVxuICAgIH1cbiAgICBxdWV1ZS5wdXNoKHtcbiAgICAgIGhhbmRsZTogKytpZCxcbiAgICAgIGNhbGxiYWNrOiBjYWxsYmFjayxcbiAgICAgIGNhbmNlbGxlZDogZmFsc2VcbiAgICB9KVxuICAgIHJldHVybiBpZFxuICB9XG5cbiAgY2FmID0gZnVuY3Rpb24oaGFuZGxlKSB7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IHF1ZXVlLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZihxdWV1ZVtpXS5oYW5kbGUgPT09IGhhbmRsZSkge1xuICAgICAgICBxdWV1ZVtpXS5jYW5jZWxsZWQgPSB0cnVlXG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oZm4pIHtcbiAgLy8gV3JhcCBpbiBhIG5ldyBmdW5jdGlvbiB0byBwcmV2ZW50XG4gIC8vIGBjYW5jZWxgIHBvdGVudGlhbGx5IGJlaW5nIGFzc2lnbmVkXG4gIC8vIHRvIHRoZSBuYXRpdmUgckFGIGZ1bmN0aW9uXG4gIHJldHVybiByYWYuY2FsbChnbG9iYWwsIGZuKVxufVxubW9kdWxlLmV4cG9ydHMuY2FuY2VsID0gZnVuY3Rpb24oKSB7XG4gIGNhZi5hcHBseShnbG9iYWwsIGFyZ3VtZW50cylcbn1cbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBHZW5lcmF0ZWQgYnkgQ29mZmVlU2NyaXB0IDEuNy4xXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBnZXROYW5vU2Vjb25kcywgaHJ0aW1lLCBsb2FkVGltZTtcblxuICBpZiAoKHR5cGVvZiBwZXJmb3JtYW5jZSAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwZXJmb3JtYW5jZSAhPT0gbnVsbCkgJiYgcGVyZm9ybWFuY2Uubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBwZXJmb3JtYW5jZS5ub3coKTtcbiAgICB9O1xuICB9IGVsc2UgaWYgKCh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzICE9PSBudWxsKSAmJiBwcm9jZXNzLmhydGltZSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gKGdldE5hbm9TZWNvbmRzKCkgLSBsb2FkVGltZSkgLyAxZTY7XG4gICAgfTtcbiAgICBocnRpbWUgPSBwcm9jZXNzLmhydGltZTtcbiAgICBnZXROYW5vU2Vjb25kcyA9IGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIGhyO1xuICAgICAgaHIgPSBocnRpbWUoKTtcbiAgICAgIHJldHVybiBoclswXSAqIDFlOSArIGhyWzFdO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBnZXROYW5vU2Vjb25kcygpO1xuICB9IGVsc2UgaWYgKERhdGUubm93KSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBEYXRlLm5vdygpIC0gbG9hZFRpbWU7XG4gICAgfTtcbiAgICBsb2FkVGltZSA9IERhdGUubm93KCk7XG4gIH0gZWxzZSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBuZXcgRGF0ZSgpLmdldFRpbWUoKSAtIGxvYWRUaW1lO1xuICAgIH07XG4gICAgbG9hZFRpbWUgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcbiAgfVxuXG59KS5jYWxsKHRoaXMpO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZSgnX3Byb2Nlc3MnKSlcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRhdGE6YXBwbGljYXRpb24vanNvbjtjaGFyc2V0OnV0Zi04O2Jhc2U2NCxleUoyWlhKemFXOXVJam96TENKemIzVnlZMlZ6SWpwYkltNXZaR1ZmYlc5a2RXeGxjeTkwY21GamEzSXZibTlrWlY5dGIyUjFiR1Z6TDNKaFppOXViMlJsWDIxdlpIVnNaWE12Y0dWeVptOXliV0Z1WTJVdGJtOTNMMnhwWWk5d1pYSm1iM0p0WVc1alpTMXViM2N1YW5NaVhTd2libUZ0WlhNaU9sdGRMQ0p0WVhCd2FXNW5jeUk2SWp0QlFVRkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFTSXNJbVpwYkdVaU9pSm5aVzVsY21GMFpXUXVhbk1pTENKemIzVnlZMlZTYjI5MElqb2lJaXdpYzI5MWNtTmxjME52Ym5SbGJuUWlPbHNpTHk4Z1IyVnVaWEpoZEdWa0lHSjVJRU52Wm1abFpWTmpjbWx3ZENBeExqY3VNVnh1S0daMWJtTjBhVzl1S0NrZ2UxeHVJQ0IyWVhJZ1oyVjBUbUZ1YjFObFkyOXVaSE1zSUdoeWRHbHRaU3dnYkc5aFpGUnBiV1U3WEc1Y2JpQWdhV1lnS0NoMGVYQmxiMllnY0dWeVptOXliV0Z1WTJVZ0lUMDlJRndpZFc1a1pXWnBibVZrWENJZ0ppWWdjR1Z5Wm05eWJXRnVZMlVnSVQwOUlHNTFiR3dwSUNZbUlIQmxjbVp2Y20xaGJtTmxMbTV2ZHlrZ2UxeHVJQ0FnSUcxdlpIVnNaUzVsZUhCdmNuUnpJRDBnWm5WdVkzUnBiMjRvS1NCN1hHNGdJQ0FnSUNCeVpYUjFjbTRnY0dWeVptOXliV0Z1WTJVdWJtOTNLQ2s3WEc0Z0lDQWdmVHRjYmlBZ2ZTQmxiSE5sSUdsbUlDZ29kSGx3Wlc5bUlIQnliMk5sYzNNZ0lUMDlJRndpZFc1a1pXWnBibVZrWENJZ0ppWWdjSEp2WTJWemN5QWhQVDBnYm5Wc2JDa2dKaVlnY0hKdlkyVnpjeTVvY25ScGJXVXBJSHRjYmlBZ0lDQnRiMlIxYkdVdVpYaHdiM0owY3lBOUlHWjFibU4wYVc5dUtDa2dlMXh1SUNBZ0lDQWdjbVYwZFhKdUlDaG5aWFJPWVc1dlUyVmpiMjVrY3lncElDMGdiRzloWkZScGJXVXBJQzhnTVdVMk8xeHVJQ0FnSUgwN1hHNGdJQ0FnYUhKMGFXMWxJRDBnY0hKdlkyVnpjeTVvY25ScGJXVTdYRzRnSUNBZ1oyVjBUbUZ1YjFObFkyOXVaSE1nUFNCbWRXNWpkR2x2YmlncElIdGNiaUFnSUNBZ0lIWmhjaUJvY2p0Y2JpQWdJQ0FnSUdoeUlEMGdhSEowYVcxbEtDazdYRzRnSUNBZ0lDQnlaWFIxY200Z2FISmJNRjBnS2lBeFpUa2dLeUJvY2xzeFhUdGNiaUFnSUNCOU8xeHVJQ0FnSUd4dllXUlVhVzFsSUQwZ1oyVjBUbUZ1YjFObFkyOXVaSE1vS1R0Y2JpQWdmU0JsYkhObElHbG1JQ2hFWVhSbExtNXZkeWtnZTF4dUlDQWdJRzF2WkhWc1pTNWxlSEJ2Y25SeklEMGdablZ1WTNScGIyNG9LU0I3WEc0Z0lDQWdJQ0J5WlhSMWNtNGdSR0YwWlM1dWIzY29LU0F0SUd4dllXUlVhVzFsTzF4dUlDQWdJSDA3WEc0Z0lDQWdiRzloWkZScGJXVWdQU0JFWVhSbExtNXZkeWdwTzF4dUlDQjlJR1ZzYzJVZ2UxeHVJQ0FnSUcxdlpIVnNaUzVsZUhCdmNuUnpJRDBnWm5WdVkzUnBiMjRvS1NCN1hHNGdJQ0FnSUNCeVpYUjFjbTRnYm1WM0lFUmhkR1VvS1M1blpYUlVhVzFsS0NrZ0xTQnNiMkZrVkdsdFpUdGNiaUFnSUNCOU8xeHVJQ0FnSUd4dllXUlVhVzFsSUQwZ2JtVjNJRVJoZEdVb0tTNW5aWFJVYVcxbEtDazdYRzRnSUgxY2JseHVmU2t1WTJGc2JDaDBhR2x6S1R0Y2JpSmRmUT09IiwiKGZ1bmN0aW9uIChnbG9iYWwpe1xuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cbi8vIFBhY2thZ2UgZG9jcyBhdCBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyIC8vXG4vLyBMYXN0IG1lcmdlOiBodHRwczovL2dpdGh1Yi5jb20vbWV0ZW9yL21ldGVvci9ibG9iLzY5Njg3NmIxODQ4ZTRkNmE5MjAxNDM0MjJjMmM1MGM0NTAxYzg1YTMvcGFja2FnZXMvdHJhY2tlci90cmFja2VyLmpzIC8vXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuXG4vLyBjaGVjayBmb3IgZ2xvYmFsIGFuZCB1c2UgdGhhdCBvbmUgaW5zdGVhZCBvZiBsb2FkaW5nIGEgbmV3IG9uZVxuaWYgKHR5cGVvZiBnbG9iYWwuVHJhY2tyICE9PSBcInVuZGVmaW5lZFwiKSB7XG5cdG1vZHVsZS5leHBvcnRzID0gZ2xvYmFsLlRyYWNrcjtcblx0cmV0dXJuO1xufVxuXG4vKipcbiAqIEBuYW1lc3BhY2UgVHJhY2tyXG4gKiBAc3VtbWFyeSBUaGUgbmFtZXNwYWNlIGZvciBUcmFja3ItcmVsYXRlZCBtZXRob2RzLlxuICovXG52YXIgVHJhY2tyID0gZ2xvYmFsLlRyYWNrciA9IG1vZHVsZS5leHBvcnRzID0ge307XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYWN0aXZlXG5cbi8qKlxuICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGVyZSBpcyBhIGN1cnJlbnQgY29tcHV0YXRpb24sIG1lYW5pbmcgdGhhdCBkZXBlbmRlbmNpZXMgb24gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIHdpbGwgYmUgdHJhY2tlZCBhbmQgcG90ZW50aWFsbHkgY2F1c2UgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gdG8gYmUgcmVydW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAdHlwZSB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLmFjdGl2ZSA9IGZhbHNlO1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2N1cnJlbnRjb21wdXRhdGlvblxuXG4vKipcbiAqIEBzdW1tYXJ5IFRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLCBvciBgbnVsbGAgaWYgdGhlcmUgaXNuJ3Qgb25lLlx0VGhlIGN1cnJlbnQgY29tcHV0YXRpb24gaXMgdGhlIFtgVHJhY2tyLkNvbXB1dGF0aW9uYF0oI3RyYWNrZXJfY29tcHV0YXRpb24pIG9iamVjdCBjcmVhdGVkIGJ5IHRoZSBpbm5lcm1vc3QgYWN0aXZlIGNhbGwgdG8gYFRyYWNrci5hdXRvcnVuYCwgYW5kIGl0J3MgdGhlIGNvbXB1dGF0aW9uIHRoYXQgZ2FpbnMgZGVwZW5kZW5jaWVzIHdoZW4gcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFyZSBhY2Nlc3NlZC5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEB0eXBlIHtUcmFja3IuQ29tcHV0YXRpb259XG4gKi9cblRyYWNrci5jdXJyZW50Q29tcHV0YXRpb24gPSBudWxsO1xuXG4vLyBSZWZlcmVuY2VzIHRvIGFsbCBjb21wdXRhdGlvbnMgY3JlYXRlZCB3aXRoaW4gdGhlIFRyYWNrciBieSBpZC5cbi8vIEtlZXBpbmcgdGhlc2UgcmVmZXJlbmNlcyBvbiBhbiB1bmRlcnNjb3JlIHByb3BlcnR5IGdpdmVzIG1vcmUgY29udHJvbCB0b1xuLy8gdG9vbGluZyBhbmQgcGFja2FnZXMgZXh0ZW5kaW5nIFRyYWNrciB3aXRob3V0IGluY3JlYXNpbmcgdGhlIEFQSSBzdXJmYWNlLlxuLy8gVGhlc2UgY2FuIHVzZWQgdG8gbW9ua2V5LXBhdGNoIGNvbXB1dGF0aW9ucywgdGhlaXIgZnVuY3Rpb25zLCB1c2Vcbi8vIGNvbXB1dGF0aW9uIGlkcyBmb3IgdHJhY2tpbmcsIGV0Yy5cblRyYWNrci5fY29tcHV0YXRpb25zID0ge307XG5cbnZhciBzZXRDdXJyZW50Q29tcHV0YXRpb24gPSBmdW5jdGlvbiAoYykge1xuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uID0gYztcblx0VHJhY2tyLmFjdGl2ZSA9ICEhIGM7XG59O1xuXG52YXIgX2RlYnVnRnVuYyA9IGZ1bmN0aW9uICgpIHtcblx0cmV0dXJuICh0eXBlb2YgY29uc29sZSAhPT0gXCJ1bmRlZmluZWRcIikgJiYgY29uc29sZS5lcnJvciA/XG5cdFx0XHQgZnVuY3Rpb24gKCkgeyBjb25zb2xlLmVycm9yLmFwcGx5KGNvbnNvbGUsIGFyZ3VtZW50cyk7IH0gOlxuXHRcdFx0IGZ1bmN0aW9uICgpIHt9O1xufTtcblxudmFyIF90aHJvd09yTG9nID0gZnVuY3Rpb24gKGZyb20sIGUpIHtcblx0aWYgKHRocm93Rmlyc3RFcnJvcikge1xuXHRcdHRocm93IGU7XG5cdH0gZWxzZSB7XG5cdFx0dmFyIHByaW50QXJncyA9IFtcIkV4Y2VwdGlvbiBmcm9tIFRyYWNrciBcIiArIGZyb20gKyBcIiBmdW5jdGlvbjpcIl07XG5cdFx0aWYgKGUuc3RhY2sgJiYgZS5tZXNzYWdlICYmIGUubmFtZSkge1xuXHRcdFx0dmFyIGlkeCA9IGUuc3RhY2suaW5kZXhPZihlLm1lc3NhZ2UpO1xuXHRcdFx0aWYgKGlkeCA8IDAgfHwgaWR4ID4gZS5uYW1lLmxlbmd0aCArIDIpIHsgLy8gY2hlY2sgZm9yIFwiRXJyb3I6IFwiXG5cdFx0XHRcdC8vIG1lc3NhZ2UgaXMgbm90IHBhcnQgb2YgdGhlIHN0YWNrXG5cdFx0XHRcdHZhciBtZXNzYWdlID0gZS5uYW1lICsgXCI6IFwiICsgZS5tZXNzYWdlO1xuXHRcdFx0XHRwcmludEFyZ3MucHVzaChtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cHJpbnRBcmdzLnB1c2goZS5zdGFjayk7XG5cblx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHByaW50QXJncy5sZW5ndGg7IGkrKykge1xuXHRcdFx0X2RlYnVnRnVuYygpKHByaW50QXJnc1tpXSk7XG5cdFx0fVxuXHR9XG59O1xuXG4vLyBUYWtlcyBhIGZ1bmN0aW9uIGBmYCwgYW5kIHdyYXBzIGl0IGluIGEgYE1ldGVvci5fbm9ZaWVsZHNBbGxvd2VkYFxuLy8gYmxvY2sgaWYgd2UgYXJlIHJ1bm5pbmcgb24gdGhlIHNlcnZlci4gT24gdGhlIGNsaWVudCwgcmV0dXJucyB0aGVcbi8vIG9yaWdpbmFsIGZ1bmN0aW9uIChzaW5jZSBgTWV0ZW9yLl9ub1lpZWxkc0FsbG93ZWRgIGlzIGFcbi8vIG5vLW9wKS4gVGhpcyBoYXMgdGhlIGJlbmVmaXQgb2Ygbm90IGFkZGluZyBhbiB1bm5lY2Vzc2FyeSBzdGFja1xuLy8gZnJhbWUgb24gdGhlIGNsaWVudC5cbnZhciB3aXRoTm9ZaWVsZHNBbGxvd2VkID0gZnVuY3Rpb24gKGYpIHtcblx0cmV0dXJuIGY7XG59O1xuXG52YXIgbmV4dElkID0gMTtcbi8vIGNvbXB1dGF0aW9ucyB3aG9zZSBjYWxsYmFja3Mgd2Ugc2hvdWxkIGNhbGwgYXQgZmx1c2ggdGltZVxudmFyIHBlbmRpbmdDb21wdXRhdGlvbnMgPSBbXTtcbi8vIGB0cnVlYCBpZiBhIFRyYWNrci5mbHVzaCBpcyBzY2hlZHVsZWQsIG9yIGlmIHdlIGFyZSBpbiBUcmFja3IuZmx1c2ggbm93XG52YXIgd2lsbEZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGluIFRyYWNrci5mbHVzaCBub3dcbnZhciBpbkZsdXNoID0gZmFsc2U7XG4vLyBgdHJ1ZWAgaWYgd2UgYXJlIGNvbXB1dGluZyBhIGNvbXB1dGF0aW9uIG5vdywgZWl0aGVyIGZpcnN0IHRpbWVcbi8vIG9yIHJlY29tcHV0ZS5cdFRoaXMgbWF0Y2hlcyBUcmFja3IuYWN0aXZlIHVubGVzcyB3ZSBhcmUgaW5zaWRlXG4vLyBUcmFja3Iubm9ucmVhY3RpdmUsIHdoaWNoIG51bGxmaWVzIGN1cnJlbnRDb21wdXRhdGlvbiBldmVuIHRob3VnaFxuLy8gYW4gZW5jbG9zaW5nIGNvbXB1dGF0aW9uIG1heSBzdGlsbCBiZSBydW5uaW5nLlxudmFyIGluQ29tcHV0ZSA9IGZhbHNlO1xuLy8gYHRydWVgIGlmIHRoZSBgX3Rocm93Rmlyc3RFcnJvcmAgb3B0aW9uIHdhcyBwYXNzZWQgaW4gdG8gdGhlIGNhbGxcbi8vIHRvIFRyYWNrci5mbHVzaCB0aGF0IHdlIGFyZSBpbi4gV2hlbiBzZXQsIHRocm93IHJhdGhlciB0aGFuIGxvZyB0aGVcbi8vIGZpcnN0IGVycm9yIGVuY291bnRlcmVkIHdoaWxlIGZsdXNoaW5nLiBCZWZvcmUgdGhyb3dpbmcgdGhlIGVycm9yLFxuLy8gZmluaXNoIGZsdXNoaW5nIChmcm9tIGEgZmluYWxseSBibG9jayksIGxvZ2dpbmcgYW55IHN1YnNlcXVlbnRcbi8vIGVycm9ycy5cbnZhciB0aHJvd0ZpcnN0RXJyb3IgPSBmYWxzZTtcblxudmFyIGFmdGVyRmx1c2hDYWxsYmFja3MgPSBbXTtcblxudmFyIHJlcXVlc3RBbmltYXRpb25GcmFtZSA9IHJlcXVpcmUoXCJyYWZcIik7XG5cbnZhciByZXF1aXJlRmx1c2ggPSBmdW5jdGlvbiAoKSB7XG5cdGlmICghIHdpbGxGbHVzaCkge1xuXHRcdHJlcXVlc3RBbmltYXRpb25GcmFtZShUcmFja3IuX3J1bkZsdXNoKTtcblx0XHR3aWxsRmx1c2ggPSB0cnVlO1xuXHR9XG59O1xuXG4vLyBUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgdmlzaWJsZSBidXQgcHJpdmF0ZVxuLy8gKHRocm93cyBhbiBlcnJvciBpZiB5b3UgdHJ5IHRvIGNhbGwgaXQpXG52YXIgY29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSBmYWxzZTtcblxuLy9cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfY29tcHV0YXRpb25cblxuLyoqXG4gKiBAc3VtbWFyeSBBIENvbXB1dGF0aW9uIG9iamVjdCByZXByZXNlbnRzIGNvZGUgdGhhdCBpcyByZXBlYXRlZGx5IHJlcnVuXG4gKiBpbiByZXNwb25zZSB0b1xuICogcmVhY3RpdmUgZGF0YSBjaGFuZ2VzLiBDb21wdXRhdGlvbnMgZG9uJ3QgaGF2ZSByZXR1cm4gdmFsdWVzOyB0aGV5IGp1c3RcbiAqIHBlcmZvcm0gYWN0aW9ucywgc3VjaCBhcyByZXJlbmRlcmluZyBhIHRlbXBsYXRlIG9uIHRoZSBzY3JlZW4uIENvbXB1dGF0aW9uc1xuICogYXJlIGNyZWF0ZWQgdXNpbmcgVHJhY2tyLmF1dG9ydW4uIFVzZSBzdG9wIHRvIHByZXZlbnQgZnVydGhlciByZXJ1bm5pbmcgb2YgYVxuICogY29tcHV0YXRpb24uXG4gKiBAaW5zdGFuY2VuYW1lIGNvbXB1dGF0aW9uXG4gKi9cblRyYWNrci5Db21wdXRhdGlvbiA9IGZ1bmN0aW9uIChmLCBwYXJlbnQsIG9wdGlvbnMpIHtcblx0aWYgKCEgY29uc3RydWN0aW5nQ29tcHV0YXRpb24pXG5cdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XCJUcmFja3IuQ29tcHV0YXRpb24gY29uc3RydWN0b3IgaXMgcHJpdmF0ZTsgdXNlIFRyYWNrci5hdXRvcnVuXCIpO1xuXHRjb25zdHJ1Y3RpbmdDb21wdXRhdGlvbiA9IGZhbHNlO1xuXG5cdHZhciBzZWxmID0gdGhpcztcblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fc3RvcHBlZFxuXG5cdC8qKlxuXHQgKiBAc3VtbWFyeSBUcnVlIGlmIHRoaXMgY29tcHV0YXRpb24gaGFzIGJlZW4gc3RvcHBlZC5cblx0ICogQGxvY3VzIENsaWVudFxuXHQgKiBAbWVtYmVyT2YgVHJhY2tyLkNvbXB1dGF0aW9uXG5cdCAqIEBpbnN0YW5jZVxuXHQgKiBAbmFtZVx0c3RvcHBlZFxuXHQgKi9cblx0c2VsZi5zdG9wcGVkID0gZmFsc2U7XG5cblx0Ly8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25faW52YWxpZGF0ZWRcblxuXHQvKipcblx0ICogQHN1bW1hcnkgVHJ1ZSBpZiB0aGlzIGNvbXB1dGF0aW9uIGhhcyBiZWVuIGludmFsaWRhdGVkIChhbmQgbm90IHlldCByZXJ1biksIG9yIGlmIGl0IGhhcyBiZWVuIHN0b3BwZWQuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdGludmFsaWRhdGVkXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5pbnZhbGlkYXRlZCA9IGZhbHNlO1xuXG5cdC8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ZpcnN0cnVuXG5cblx0LyoqXG5cdCAqIEBzdW1tYXJ5IFRydWUgZHVyaW5nIHRoZSBpbml0aWFsIHJ1biBvZiB0aGUgY29tcHV0YXRpb24gYXQgdGhlIHRpbWUgYFRyYWNrci5hdXRvcnVuYCBpcyBjYWxsZWQsIGFuZCBmYWxzZSBvbiBzdWJzZXF1ZW50IHJlcnVucyBhbmQgYXQgb3RoZXIgdGltZXMuXG5cdCAqIEBsb2N1cyBDbGllbnRcblx0ICogQG1lbWJlck9mIFRyYWNrci5Db21wdXRhdGlvblxuXHQgKiBAaW5zdGFuY2Vcblx0ICogQG5hbWVcdGZpcnN0UnVuXG5cdCAqIEB0eXBlIHtCb29sZWFufVxuXHQgKi9cblx0c2VsZi5maXJzdFJ1biA9IHRydWU7XG5cblx0c2VsZi5faWQgPSBuZXh0SWQrKztcblx0c2VsZi5fb25JbnZhbGlkYXRlQ2FsbGJhY2tzID0gW107XG5cdHNlbGYuX29uU3RvcENhbGxiYWNrcyA9IFtdO1xuXHQvLyB0aGUgcGxhbiBpcyBhdCBzb21lIHBvaW50IHRvIHVzZSB0aGUgcGFyZW50IHJlbGF0aW9uXG5cdC8vIHRvIGNvbnN0cmFpbiB0aGUgb3JkZXIgdGhhdCBjb21wdXRhdGlvbnMgYXJlIHByb2Nlc3NlZFxuXHRzZWxmLl9wYXJlbnQgPSBwYXJlbnQ7XG5cdHNlbGYuX2Z1bmMgPSBmO1xuXHRzZWxmLl9vbkVycm9yID0gb3B0aW9ucy5vbkVycm9yO1xuXHRzZWxmLl9yZWNvbXB1dGluZyA9IGZhbHNlO1xuXHRzZWxmLl9jb250ZXh0ID0gb3B0aW9ucy5jb250ZXh0IHx8IG51bGw7XG5cblx0Ly8gUmVnaXN0ZXIgdGhlIGNvbXB1dGF0aW9uIHdpdGhpbiB0aGUgZ2xvYmFsIFRyYWNrci5cblx0VHJhY2tyLl9jb21wdXRhdGlvbnNbc2VsZi5faWRdID0gc2VsZjtcblxuXHR2YXIgZXJyb3JlZCA9IHRydWU7XG5cdHRyeSB7XG5cdFx0c2VsZi5fY29tcHV0ZSgpO1xuXHRcdGVycm9yZWQgPSBmYWxzZTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZWxmLmZpcnN0UnVuID0gZmFsc2U7XG5cdFx0aWYgKGVycm9yZWQpXG5cdFx0XHRzZWxmLnN0b3AoKTtcblx0fVxufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jY29tcHV0YXRpb25fb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGBjYWxsYmFja2AgdG8gcnVuIHdoZW4gdGhpcyBjb21wdXRhdGlvbiBpcyBuZXh0IGludmFsaWRhdGVkLCBvciBydW5zIGl0IGltbWVkaWF0ZWx5IGlmIHRoZSBjb21wdXRhdGlvbiBpcyBhbHJlYWR5IGludmFsaWRhdGVkLlx0VGhlIGNhbGxiYWNrIGlzIHJ1biBleGFjdGx5IG9uY2UgYW5kIG5vdCB1cG9uIGZ1dHVyZSBpbnZhbGlkYXRpb25zIHVubGVzcyBgb25JbnZhbGlkYXRlYCBpcyBjYWxsZWQgYWdhaW4gYWZ0ZXIgdGhlIGNvbXB1dGF0aW9uIGJlY29tZXMgdmFsaWQgYWdhaW4uXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjYWxsYmFjayBGdW5jdGlvbiB0byBiZSBjYWxsZWQgb24gaW52YWxpZGF0aW9uLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBpbnZhbGlkYXRlZC5cbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRpZiAodHlwZW9mIGYgIT09ICdmdW5jdGlvbicpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwib25JbnZhbGlkYXRlIHJlcXVpcmVzIGEgZnVuY3Rpb25cIik7XG5cblx0aWYgKHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHRUcmFja3Iubm9ucmVhY3RpdmUoZnVuY3Rpb24gKCkge1xuXHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmKS5jYWxsKGN0eCB8fCBzZWxmLl9jb250ZXh0LCBzZWxmKTtcblx0XHR9KTtcblx0fSBlbHNlIHtcblx0XHRzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3MucHVzaCh7IGZuOiBmLCBjdHg6IGN0eCB9KTtcblx0fVxufTtcblxuLyoqXG4gKiBAc3VtbWFyeSBSZWdpc3RlcnMgYGNhbGxiYWNrYCB0byBydW4gd2hlbiB0aGlzIGNvbXB1dGF0aW9uIGlzIHN0b3BwZWQsIG9yIHJ1bnMgaXQgaW1tZWRpYXRlbHkgaWYgdGhlIGNvbXB1dGF0aW9uIGlzIGFscmVhZHkgc3RvcHBlZC5cdFRoZSBjYWxsYmFjayBpcyBydW4gYWZ0ZXIgYW55IGBvbkludmFsaWRhdGVgIGNhbGxiYWNrcy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNhbGxiYWNrIEZ1bmN0aW9uIHRvIGJlIGNhbGxlZCBvbiBzdG9wLiBSZWNlaXZlcyBvbmUgYXJndW1lbnQsIHRoZSBjb21wdXRhdGlvbiB0aGF0IHdhcyBzdG9wcGVkLlxuICovXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLm9uU3RvcCA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHNlbGYgPSB0aGlzO1xuXG5cdGlmICh0eXBlb2YgZiAhPT0gJ2Z1bmN0aW9uJylcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJvblN0b3AgcmVxdWlyZXMgYSBmdW5jdGlvblwiKTtcblxuXHRpZiAoc2VsZi5zdG9wcGVkKSB7XG5cdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdHdpdGhOb1lpZWxkc0FsbG93ZWQoZikuY2FsbChjdHggfHwgc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdFx0fSk7XG5cdH0gZWxzZSB7XG5cdFx0c2VsZi5fb25TdG9wQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2NvbXB1dGF0aW9uX2ludmFsaWRhdGVcblxuLyoqXG4gKiBAc3VtbWFyeSBJbnZhbGlkYXRlcyB0aGlzIGNvbXB1dGF0aW9uIHNvIHRoYXQgaXQgd2lsbCBiZSByZXJ1bi5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5pbnZhbGlkYXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdGlmICghIHNlbGYuaW52YWxpZGF0ZWQpIHtcblx0XHQvLyBpZiB3ZSdyZSBjdXJyZW50bHkgaW4gX3JlY29tcHV0ZSgpLCBkb24ndCBlbnF1ZXVlXG5cdFx0Ly8gb3Vyc2VsdmVzLCBzaW5jZSB3ZSdsbCByZXJ1biBpbW1lZGlhdGVseSBhbnl3YXkuXG5cdFx0aWYgKCEgc2VsZi5fcmVjb21wdXRpbmcgJiYgISBzZWxmLnN0b3BwZWQpIHtcblx0XHRcdHJlcXVpcmVGbHVzaCgpO1xuXHRcdFx0cGVuZGluZ0NvbXB1dGF0aW9ucy5wdXNoKHRoaXMpO1xuXHRcdH1cblxuXHRcdHNlbGYuaW52YWxpZGF0ZWQgPSB0cnVlO1xuXG5cdFx0Ly8gY2FsbGJhY2tzIGNhbid0IGFkZCBjYWxsYmFja3MsIGJlY2F1c2Vcblx0XHQvLyBzZWxmLmludmFsaWRhdGVkID09PSB0cnVlLlxuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vbkludmFsaWRhdGVDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uSW52YWxpZGF0ZUNhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyNjb21wdXRhdGlvbl9zdG9wXG5cbi8qKlxuICogQHN1bW1hcnkgUHJldmVudHMgdGhpcyBjb21wdXRhdGlvbiBmcm9tIHJlcnVubmluZy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cblx0aWYgKCEgc2VsZi5zdG9wcGVkKSB7XG5cdFx0c2VsZi5zdG9wcGVkID0gdHJ1ZTtcblx0XHRzZWxmLmludmFsaWRhdGUoKTtcblx0XHQvLyBVbnJlZ2lzdGVyIGZyb20gZ2xvYmFsIFRyYWNrci5cblx0XHRkZWxldGUgVHJhY2tyLl9jb21wdXRhdGlvbnNbc2VsZi5faWRdO1xuXHRcdGZvcih2YXIgaSA9IDAsIGY7IGYgPSBzZWxmLl9vblN0b3BDYWxsYmFja3NbaV07IGkrKykge1xuXHRcdFx0VHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0d2l0aE5vWWllbGRzQWxsb3dlZChmLmZuKS5jYWxsKGYuY3R4IHx8IHNlbGYuX2NvbnRleHQsIHNlbGYpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHNlbGYuX29uU3RvcENhbGxiYWNrcyA9IFtdO1xuXHR9XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9jb21wdXRlID0gZnVuY3Rpb24gKCkge1xuXHR2YXIgc2VsZiA9IHRoaXM7XG5cdHNlbGYuaW52YWxpZGF0ZWQgPSBmYWxzZTtcblxuXHR2YXIgcHJldmlvdXMgPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHRzZXRDdXJyZW50Q29tcHV0YXRpb24oc2VsZik7XG5cdHZhciBwcmV2aW91c0luQ29tcHV0ZSA9IGluQ29tcHV0ZTtcblx0aW5Db21wdXRlID0gdHJ1ZTtcblx0dHJ5IHtcblx0XHR3aXRoTm9ZaWVsZHNBbGxvd2VkKHNlbGYuX2Z1bmMpLmNhbGwoc2VsZi5fY29udGV4dCwgc2VsZik7XG5cdH0gZmluYWxseSB7XG5cdFx0c2V0Q3VycmVudENvbXB1dGF0aW9uKHByZXZpb3VzKTtcblx0XHRpbkNvbXB1dGUgPSBwcmV2aW91c0luQ29tcHV0ZTtcblx0fVxufTtcblxuVHJhY2tyLkNvbXB1dGF0aW9uLnByb3RvdHlwZS5fbmVlZHNSZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0cmV0dXJuIHNlbGYuaW52YWxpZGF0ZWQgJiYgISBzZWxmLnN0b3BwZWQ7XG59O1xuXG5UcmFja3IuQ29tcHV0YXRpb24ucHJvdG90eXBlLl9yZWNvbXB1dGUgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblxuXHRzZWxmLl9yZWNvbXB1dGluZyA9IHRydWU7XG5cdHRyeSB7XG5cdFx0aWYgKHNlbGYuX25lZWRzUmVjb21wdXRlKCkpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHNlbGYuX2NvbXB1dGUoKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKHNlbGYuX29uRXJyb3IpIHtcblx0XHRcdFx0XHRzZWxmLl9vbkVycm9yKGUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdF90aHJvd09yTG9nKFwicmVjb21wdXRlXCIsIGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9IGZpbmFsbHkge1xuXHRcdHNlbGYuX3JlY29tcHV0aW5nID0gZmFsc2U7XG5cdH1cbn07XG5cbi8vXG4vLyBodHRwOi8vZG9jcy5tZXRlb3IuY29tLyN0cmFja2VyX2RlcGVuZGVuY3lcblxuLyoqXG4gKiBAc3VtbWFyeSBBIERlcGVuZGVuY3kgcmVwcmVzZW50cyBhbiBhdG9taWMgdW5pdCBvZiByZWFjdGl2ZSBkYXRhIHRoYXQgYVxuICogY29tcHV0YXRpb24gbWlnaHQgZGVwZW5kIG9uLiBSZWFjdGl2ZSBkYXRhIHNvdXJjZXMgc3VjaCBhcyBTZXNzaW9uIG9yXG4gKiBNaW5pbW9uZ28gaW50ZXJuYWxseSBjcmVhdGUgZGlmZmVyZW50IERlcGVuZGVuY3kgb2JqZWN0cyBmb3IgZGlmZmVyZW50XG4gKiBwaWVjZXMgb2YgZGF0YSwgZWFjaCBvZiB3aGljaCBtYXkgYmUgZGVwZW5kZWQgb24gYnkgbXVsdGlwbGUgY29tcHV0YXRpb25zLlxuICogV2hlbiB0aGUgZGF0YSBjaGFuZ2VzLCB0aGUgY29tcHV0YXRpb25zIGFyZSBpbnZhbGlkYXRlZC5cbiAqIEBjbGFzc1xuICogQGluc3RhbmNlTmFtZSBkZXBlbmRlbmN5XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5ID0gZnVuY3Rpb24gKCkge1xuXHR0aGlzLl9kZXBlbmRlbnRzQnlJZCA9IHt9O1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9kZXBlbmRcbi8vXG4vLyBBZGRzIGBjb21wdXRhdGlvbmAgdG8gdGhpcyBzZXQgaWYgaXQgaXMgbm90IGFscmVhZHlcbi8vIHByZXNlbnQuXHRSZXR1cm5zIHRydWUgaWYgYGNvbXB1dGF0aW9uYCBpcyBhIG5ldyBtZW1iZXIgb2YgdGhlIHNldC5cbi8vIElmIG5vIGFyZ3VtZW50LCBkZWZhdWx0cyB0byBjdXJyZW50Q29tcHV0YXRpb24sIG9yIGRvZXMgbm90aGluZ1xuLy8gaWYgdGhlcmUgaXMgbm8gY3VycmVudENvbXB1dGF0aW9uLlxuXG4vKipcbiAqIEBzdW1tYXJ5IERlY2xhcmVzIHRoYXQgdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKG9yIGBmcm9tQ29tcHV0YXRpb25gIGlmIGdpdmVuKSBkZXBlbmRzIG9uIGBkZXBlbmRlbmN5YC5cdFRoZSBjb21wdXRhdGlvbiB3aWxsIGJlIGludmFsaWRhdGVkIHRoZSBuZXh0IHRpbWUgYGRlcGVuZGVuY3lgIGNoYW5nZXMuXG5cbklmIHRoZXJlIGlzIG5vIGN1cnJlbnQgY29tcHV0YXRpb24gYW5kIGBkZXBlbmQoKWAgaXMgY2FsbGVkIHdpdGggbm8gYXJndW1lbnRzLCBpdCBkb2VzIG5vdGhpbmcgYW5kIHJldHVybnMgZmFsc2UuXG5cblJldHVybnMgdHJ1ZSBpZiB0aGUgY29tcHV0YXRpb24gaXMgYSBuZXcgZGVwZW5kZW50IG9mIGBkZXBlbmRlbmN5YCByYXRoZXIgdGhhbiBhbiBleGlzdGluZyBvbmUuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge1RyYWNrci5Db21wdXRhdGlvbn0gW2Zyb21Db21wdXRhdGlvbl0gQW4gb3B0aW9uYWwgY29tcHV0YXRpb24gZGVjbGFyZWQgdG8gZGVwZW5kIG9uIGBkZXBlbmRlbmN5YCBpbnN0ZWFkIG9mIHRoZSBjdXJyZW50IGNvbXB1dGF0aW9uLlxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cblRyYWNrci5EZXBlbmRlbmN5LnByb3RvdHlwZS5kZXBlbmQgPSBmdW5jdGlvbiAoY29tcHV0YXRpb24pIHtcblx0aWYgKCEgY29tcHV0YXRpb24pIHtcblx0XHRpZiAoISBUcmFja3IuYWN0aXZlKVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXG5cdFx0Y29tcHV0YXRpb24gPSBUcmFja3IuY3VycmVudENvbXB1dGF0aW9uO1xuXHR9XG5cdHZhciBzZWxmID0gdGhpcztcblx0dmFyIGlkID0gY29tcHV0YXRpb24uX2lkO1xuXHRpZiAoISAoaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpKSB7XG5cdFx0c2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdID0gY29tcHV0YXRpb247XG5cdFx0Y29tcHV0YXRpb24ub25JbnZhbGlkYXRlKGZ1bmN0aW9uICgpIHtcblx0XHRcdGRlbGV0ZSBzZWxmLl9kZXBlbmRlbnRzQnlJZFtpZF07XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jZGVwZW5kZW5jeV9jaGFuZ2VkXG5cbi8qKlxuICogQHN1bW1hcnkgSW52YWxpZGF0ZSBhbGwgZGVwZW5kZW50IGNvbXB1dGF0aW9ucyBpbW1lZGlhdGVseSBhbmQgcmVtb3ZlIHRoZW0gYXMgZGVwZW5kZW50cy5cbiAqIEBsb2N1cyBDbGllbnRcbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmNoYW5nZWQgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0Zm9yICh2YXIgaWQgaW4gc2VsZi5fZGVwZW5kZW50c0J5SWQpXG5cdFx0c2VsZi5fZGVwZW5kZW50c0J5SWRbaWRdLmludmFsaWRhdGUoKTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI2RlcGVuZGVuY3lfaGFzZGVwZW5kZW50c1xuXG4vKipcbiAqIEBzdW1tYXJ5IFRydWUgaWYgdGhpcyBEZXBlbmRlbmN5IGhhcyBvbmUgb3IgbW9yZSBkZXBlbmRlbnQgQ29tcHV0YXRpb25zLCB3aGljaCB3b3VsZCBiZSBpbnZhbGlkYXRlZCBpZiB0aGlzIERlcGVuZGVuY3kgd2VyZSB0byBjaGFuZ2UuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAqL1xuVHJhY2tyLkRlcGVuZGVuY3kucHJvdG90eXBlLmhhc0RlcGVuZGVudHMgPSBmdW5jdGlvbiAoKSB7XG5cdHZhciBzZWxmID0gdGhpcztcblx0Zm9yKHZhciBpZCBpbiBzZWxmLl9kZXBlbmRlbnRzQnlJZClcblx0XHRyZXR1cm4gdHJ1ZTtcblx0cmV0dXJuIGZhbHNlO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9mbHVzaFxuXG4vKipcbiAqIEBzdW1tYXJ5IFByb2Nlc3MgYWxsIHJlYWN0aXZlIHVwZGF0ZXMgaW1tZWRpYXRlbHkgYW5kIGVuc3VyZSB0aGF0IGFsbCBpbnZhbGlkYXRlZCBjb21wdXRhdGlvbnMgYXJlIHJlcnVuLlxuICogQGxvY3VzIENsaWVudFxuICovXG5UcmFja3IuZmx1c2ggPSBmdW5jdGlvbiAob3B0aW9ucykge1xuXHRUcmFja3IuX3J1bkZsdXNoKHsgZmluaXNoU3luY2hyb25vdXNseTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0aHJvd0ZpcnN0RXJyb3I6IG9wdGlvbnMgJiYgb3B0aW9ucy5fdGhyb3dGaXJzdEVycm9yIH0pO1xufTtcblxuLy8gUnVuIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9ucyBhbmQgYWZ0ZXJGbHVzaCBjYWxsYmFja3MuXHRJZiB3ZSB3ZXJlIG5vdCBjYWxsZWRcbi8vIGRpcmVjdGx5IHZpYSBUcmFja3IuZmx1c2gsIHRoaXMgbWF5IHJldHVybiBiZWZvcmUgdGhleSdyZSBhbGwgZG9uZSB0byBhbGxvd1xuLy8gdGhlIGV2ZW50IGxvb3AgdG8gcnVuIGEgbGl0dGxlIGJlZm9yZSBjb250aW51aW5nLlxuVHJhY2tyLl9ydW5GbHVzaCA9IGZ1bmN0aW9uIChvcHRpb25zKSB7XG5cdC8vIFhYWCBXaGF0IHBhcnQgb2YgdGhlIGNvbW1lbnQgYmVsb3cgaXMgc3RpbGwgdHJ1ZT8gKFdlIG5vIGxvbmdlclxuXHQvLyBoYXZlIFNwYXJrKVxuXHQvL1xuXHQvLyBOZXN0ZWQgZmx1c2ggY291bGQgcGxhdXNpYmx5IGhhcHBlbiBpZiwgc2F5LCBhIGZsdXNoIGNhdXNlc1xuXHQvLyBET00gbXV0YXRpb24sIHdoaWNoIGNhdXNlcyBhIFwiYmx1clwiIGV2ZW50LCB3aGljaCBydW5zIGFuXG5cdC8vIGFwcCBldmVudCBoYW5kbGVyIHRoYXQgY2FsbHMgVHJhY2tyLmZsdXNoLlx0QXQgdGhlIG1vbWVudFxuXHQvLyBTcGFyayBibG9ja3MgZXZlbnQgaGFuZGxlcnMgZHVyaW5nIERPTSBtdXRhdGlvbiBhbnl3YXksXG5cdC8vIGJlY2F1c2UgdGhlIExpdmVSYW5nZSB0cmVlIGlzbid0IHZhbGlkLlx0QW5kIHdlIGRvbid0IGhhdmVcblx0Ly8gYW55IHVzZWZ1bCBub3Rpb24gb2YgYSBuZXN0ZWQgZmx1c2guXG5cdC8vXG5cdC8vIGh0dHBzOi8vYXBwLmFzYW5hLmNvbS8wLzE1OTkwODMzMDI0NC8zODUxMzgyMzM4NTZcblx0aWYgKGluRmx1c2gpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiQ2FuJ3QgY2FsbCBUcmFja3IuZmx1c2ggd2hpbGUgZmx1c2hpbmdcIik7XG5cblx0aWYgKGluQ29tcHV0ZSlcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJDYW4ndCBmbHVzaCBpbnNpZGUgVHJhY2tyLmF1dG9ydW5cIik7XG5cblx0b3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cblx0aW5GbHVzaCA9IHRydWU7XG5cdHdpbGxGbHVzaCA9IHRydWU7XG5cdHRocm93Rmlyc3RFcnJvciA9ICEhIG9wdGlvbnMudGhyb3dGaXJzdEVycm9yO1xuXG5cdHZhciByZWNvbXB1dGVkQ291bnQgPSAwO1xuXHR2YXIgZmluaXNoZWRUcnkgPSBmYWxzZTtcblx0dHJ5IHtcblx0XHR3aGlsZSAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHxcblx0XHRcdFx0XHQgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblxuXHRcdFx0Ly8gcmVjb21wdXRlIGFsbCBwZW5kaW5nIGNvbXB1dGF0aW9uc1xuXHRcdFx0d2hpbGUgKHBlbmRpbmdDb21wdXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdHZhciBjb21wID0gcGVuZGluZ0NvbXB1dGF0aW9ucy5zaGlmdCgpO1xuXHRcdFx0XHRjb21wLl9yZWNvbXB1dGUoKTtcblx0XHRcdFx0aWYgKGNvbXAuX25lZWRzUmVjb21wdXRlKCkpIHtcblx0XHRcdFx0XHRwZW5kaW5nQ29tcHV0YXRpb25zLnVuc2hpZnQoY29tcCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoISBvcHRpb25zLmZpbmlzaFN5bmNocm9ub3VzbHkgJiYgKytyZWNvbXB1dGVkQ291bnQgPiAxMDAwKSB7XG5cdFx0XHRcdFx0ZmluaXNoZWRUcnkgPSB0cnVlO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gY2FsbCBvbmUgYWZ0ZXJGbHVzaCBjYWxsYmFjaywgd2hpY2ggbWF5XG5cdFx0XHRcdC8vIGludmFsaWRhdGUgbW9yZSBjb21wdXRhdGlvbnNcblx0XHRcdFx0dmFyIGNiID0gYWZ0ZXJGbHVzaENhbGxiYWNrcy5zaGlmdCgpO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNiLmZuLmNhbGwoY2IuY3R4KTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdF90aHJvd09yTG9nKFwiYWZ0ZXJGbHVzaFwiLCBlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRmaW5pc2hlZFRyeSA9IHRydWU7XG5cdH0gZmluYWxseSB7XG5cdFx0aWYgKCEgZmluaXNoZWRUcnkpIHtcblx0XHRcdC8vIHdlJ3JlIGVycm9yaW5nIGR1ZSB0byB0aHJvd0ZpcnN0RXJyb3IgYmVpbmcgdHJ1ZS5cblx0XHRcdGluRmx1c2ggPSBmYWxzZTsgLy8gbmVlZGVkIGJlZm9yZSBjYWxsaW5nIGBUcmFja3IuZmx1c2goKWAgYWdhaW5cblx0XHRcdC8vIGZpbmlzaCBmbHVzaGluZ1xuXHRcdFx0VHJhY2tyLl9ydW5GbHVzaCh7XG5cdFx0XHRcdGZpbmlzaFN5bmNocm9ub3VzbHk6IG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSxcblx0XHRcdFx0dGhyb3dGaXJzdEVycm9yOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHdpbGxGbHVzaCA9IGZhbHNlO1xuXHRcdGluRmx1c2ggPSBmYWxzZTtcblx0XHRpZiAocGVuZGluZ0NvbXB1dGF0aW9ucy5sZW5ndGggfHwgYWZ0ZXJGbHVzaENhbGxiYWNrcy5sZW5ndGgpIHtcblx0XHRcdC8vIFdlJ3JlIHlpZWxkaW5nIGJlY2F1c2Ugd2UgcmFuIGEgYnVuY2ggb2YgY29tcHV0YXRpb25zIGFuZCB3ZSBhcmVuJ3Rcblx0XHRcdC8vIHJlcXVpcmVkIHRvIGZpbmlzaCBzeW5jaHJvbm91c2x5LCBzbyB3ZSdkIGxpa2UgdG8gZ2l2ZSB0aGUgZXZlbnQgbG9vcCBhXG5cdFx0XHQvLyBjaGFuY2UuIFdlIHNob3VsZCBmbHVzaCBhZ2FpbiBzb29uLlxuXHRcdFx0aWYgKG9wdGlvbnMuZmluaXNoU3luY2hyb25vdXNseSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJzdGlsbCBoYXZlIG1vcmUgdG8gZG8/XCIpO1x0Ly8gc2hvdWxkbid0IGhhcHBlblxuXHRcdFx0fVxuXHRcdFx0c2V0VGltZW91dChyZXF1aXJlRmx1c2gsIDEwKTtcblx0XHR9XG5cdH1cbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfYXV0b3J1blxuLy9cbi8vIFJ1biBmKCkuIFJlY29yZCBpdHMgZGVwZW5kZW5jaWVzLiBSZXJ1biBpdCB3aGVuZXZlciB0aGVcbi8vIGRlcGVuZGVuY2llcyBjaGFuZ2UuXG4vL1xuLy8gUmV0dXJucyBhIG5ldyBDb21wdXRhdGlvbiwgd2hpY2ggaXMgYWxzbyBwYXNzZWQgdG8gZi5cbi8vXG4vLyBMaW5rcyB0aGUgY29tcHV0YXRpb24gdG8gdGhlIGN1cnJlbnQgY29tcHV0YXRpb25cbi8vIHNvIHRoYXQgaXQgaXMgc3RvcHBlZCBpZiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZC5cblxuLyoqXG4gKiBAY2FsbGJhY2sgVHJhY2tyLkNvbXB1dGF0aW9uRnVuY3Rpb25cbiAqIEBwYXJhbSB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG4vKipcbiAqIEBzdW1tYXJ5IFJ1biBhIGZ1bmN0aW9uIG5vdyBhbmQgcmVydW4gaXQgbGF0ZXIgd2hlbmV2ZXIgaXRzIGRlcGVuZGVuY2llc1xuICogY2hhbmdlLiBSZXR1cm5zIGEgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgY2FuIGJlIHVzZWQgdG8gc3RvcCBvciBvYnNlcnZlIHRoZVxuICogcmVydW5uaW5nLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtUcmFja3IuQ29tcHV0YXRpb25GdW5jdGlvbn0gcnVuRnVuYyBUaGUgZnVuY3Rpb24gdG8gcnVuLiBJdCByZWNlaXZlc1xuICogb25lIGFyZ3VtZW50OiB0aGUgQ29tcHV0YXRpb24gb2JqZWN0IHRoYXQgd2lsbCBiZSByZXR1cm5lZC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBbb3B0aW9uc11cbiAqIEBwYXJhbSB7RnVuY3Rpb259IG9wdGlvbnMub25FcnJvciBPcHRpb25hbC4gVGhlIGZ1bmN0aW9uIHRvIHJ1biB3aGVuIGFuIGVycm9yXG4gKiBoYXBwZW5zIGluIHRoZSBDb21wdXRhdGlvbi4gVGhlIG9ubHkgYXJndW1lbnQgaXQgcmVjaWV2ZXMgaXMgdGhlIEVycm9yXG4gKiB0aHJvd24uIERlZmF1bHRzIHRvIHRoZSBlcnJvciBiZWluZyBsb2dnZWQgdG8gdGhlIGNvbnNvbGUuXG4gKiBAcmV0dXJucyB7VHJhY2tyLkNvbXB1dGF0aW9ufVxuICovXG5UcmFja3IuYXV0b3J1biA9IGZ1bmN0aW9uIChmLCBvcHRpb25zLCBjdHgpIHtcblx0aWYgKHR5cGVvZiBmICE9PSAnZnVuY3Rpb24nKVxuXHRcdHRocm93IG5ldyBFcnJvcignVHJhY2tyLmF1dG9ydW4gcmVxdWlyZXMgYSBmdW5jdGlvbiBhcmd1bWVudCcpO1xuXG5cdG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXHRpZiAoY3R4KSBvcHRpb25zLmNvbnRleHQgPSBjdHg7XG5cblx0Y29uc3RydWN0aW5nQ29tcHV0YXRpb24gPSB0cnVlO1xuXHR2YXIgYyA9IG5ldyBUcmFja3IuQ29tcHV0YXRpb24oXG5cdFx0ZiwgVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbiwgb3B0aW9ucyk7XG5cblx0aWYgKFRyYWNrci5hY3RpdmUpXG5cdFx0VHJhY2tyLm9uSW52YWxpZGF0ZShmdW5jdGlvbiAoKSB7XG5cdFx0XHRjLnN0b3AoKTtcblx0XHR9KTtcblxuXHRyZXR1cm4gYztcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfbm9ucmVhY3RpdmVcbi8vXG4vLyBSdW4gYGZgIHdpdGggbm8gY3VycmVudCBjb21wdXRhdGlvbiwgcmV0dXJuaW5nIHRoZSByZXR1cm4gdmFsdWVcbi8vIG9mIGBmYC5cdFVzZWQgdG8gdHVybiBvZmYgcmVhY3Rpdml0eSBmb3IgdGhlIGR1cmF0aW9uIG9mIGBmYCxcbi8vIHNvIHRoYXQgcmVhY3RpdmUgZGF0YSBzb3VyY2VzIGFjY2Vzc2VkIGJ5IGBmYCB3aWxsIG5vdCByZXN1bHQgaW4gYW55XG4vLyBjb21wdXRhdGlvbnMgYmVpbmcgaW52YWxpZGF0ZWQuXG5cbi8qKlxuICogQHN1bW1hcnkgUnVuIGEgZnVuY3Rpb24gd2l0aG91dCB0cmFja2luZyBkZXBlbmRlbmNpZXMuXG4gKiBAbG9jdXMgQ2xpZW50XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmdW5jIEEgZnVuY3Rpb24gdG8gY2FsbCBpbW1lZGlhdGVseS5cbiAqL1xuVHJhY2tyLm5vblJlYWN0aXZlID1cblRyYWNrci5ub25yZWFjdGl2ZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0dmFyIHByZXZpb3VzID0gVHJhY2tyLmN1cnJlbnRDb21wdXRhdGlvbjtcblx0c2V0Q3VycmVudENvbXB1dGF0aW9uKG51bGwpO1xuXHR0cnkge1xuXHRcdHJldHVybiBmLmNhbGwoY3R4KTtcblx0fSBmaW5hbGx5IHtcblx0XHRzZXRDdXJyZW50Q29tcHV0YXRpb24ocHJldmlvdXMpO1xuXHR9XG59O1xuXG4vLyBsaWtlIG5vbnJlYWN0aXZlIGJ1dCBtYWtlcyBhIGZ1bmN0aW9uIGluc3RlYWRcblRyYWNrci5ub25SZWFjdGFibGUgPVxuVHJhY2tyLm5vbnJlYWN0YWJsZSA9IGZ1bmN0aW9uIChmLCBjdHgpIHtcblx0cmV0dXJuIGZ1bmN0aW9uKCkge1xuXHRcdHZhciBhcmdzID0gYXJndW1lbnRzO1xuXHRcdGlmIChjdHggPT0gbnVsbCkgY3R4ID0gdGhpcztcblx0XHRyZXR1cm4gVHJhY2tyLm5vbnJlYWN0aXZlKGZ1bmN0aW9uKCkge1xuXHRcdFx0cmV0dXJuIGYuYXBwbHkoY3R4LCBhcmdzKTtcblx0XHR9KTtcblx0fTtcbn07XG5cbi8vIGh0dHA6Ly9kb2NzLm1ldGVvci5jb20vI3RyYWNrZXJfb25pbnZhbGlkYXRlXG5cbi8qKlxuICogQHN1bW1hcnkgUmVnaXN0ZXJzIGEgbmV3IFtgb25JbnZhbGlkYXRlYF0oI2NvbXB1dGF0aW9uX29uaW52YWxpZGF0ZSkgY2FsbGJhY2sgb24gdGhlIGN1cnJlbnQgY29tcHV0YXRpb24gKHdoaWNoIG11c3QgZXhpc3QpLCB0byBiZSBjYWxsZWQgaW1tZWRpYXRlbHkgd2hlbiB0aGUgY3VycmVudCBjb21wdXRhdGlvbiBpcyBpbnZhbGlkYXRlZCBvciBzdG9wcGVkLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBjYWxsYmFjayBmdW5jdGlvbiB0aGF0IHdpbGwgYmUgaW52b2tlZCBhcyBgZnVuYyhjKWAsIHdoZXJlIGBjYCBpcyB0aGUgY29tcHV0YXRpb24gb24gd2hpY2ggdGhlIGNhbGxiYWNrIGlzIHJlZ2lzdGVyZWQuXG4gKi9cblRyYWNrci5vbkludmFsaWRhdGUgPSBmdW5jdGlvbiAoZiwgY3R4KSB7XG5cdGlmICghIFRyYWNrci5hY3RpdmUpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwiVHJhY2tyLm9uSW52YWxpZGF0ZSByZXF1aXJlcyBhIGN1cnJlbnRDb21wdXRhdGlvblwiKTtcblxuXHRUcmFja3IuY3VycmVudENvbXB1dGF0aW9uLm9uSW52YWxpZGF0ZShmLCBjdHgpO1xufTtcblxuLy8gaHR0cDovL2RvY3MubWV0ZW9yLmNvbS8jdHJhY2tlcl9hZnRlcmZsdXNoXG5cbi8qKlxuICogQHN1bW1hcnkgU2NoZWR1bGVzIGEgZnVuY3Rpb24gdG8gYmUgY2FsbGVkIGR1cmluZyB0aGUgbmV4dCBmbHVzaCwgb3IgbGF0ZXIgaW4gdGhlIGN1cnJlbnQgZmx1c2ggaWYgb25lIGlzIGluIHByb2dyZXNzLCBhZnRlciBhbGwgaW52YWxpZGF0ZWQgY29tcHV0YXRpb25zIGhhdmUgYmVlbiByZXJ1bi5cdFRoZSBmdW5jdGlvbiB3aWxsIGJlIHJ1biBvbmNlIGFuZCBub3Qgb24gc3Vic2VxdWVudCBmbHVzaGVzIHVubGVzcyBgYWZ0ZXJGbHVzaGAgaXMgY2FsbGVkIGFnYWluLlxuICogQGxvY3VzIENsaWVudFxuICogQHBhcmFtIHtGdW5jdGlvbn0gY2FsbGJhY2sgQSBmdW5jdGlvbiB0byBjYWxsIGF0IGZsdXNoIHRpbWUuXG4gKi9cblRyYWNrci5hZnRlckZsdXNoID0gZnVuY3Rpb24gKGYsIGN0eCkge1xuXHRhZnRlckZsdXNoQ2FsbGJhY2tzLnB1c2goeyBmbjogZiwgY3R4OiBjdHggfSk7XG5cdHJlcXVpcmVGbHVzaCgpO1xufTtcblxufSkuY2FsbCh0aGlzLHR5cGVvZiBnbG9iYWwgIT09IFwidW5kZWZpbmVkXCIgPyBnbG9iYWwgOiB0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pXG4vLyMgc291cmNlTWFwcGluZ1VSTD1kYXRhOmFwcGxpY2F0aW9uL2pzb247Y2hhcnNldDp1dGYtODtiYXNlNjQsZXlKMlpYSnphVzl1SWpvekxDSnpiM1Z5WTJWeklqcGJJbTV2WkdWZmJXOWtkV3hsY3k5MGNtRmphM0l2ZEhKaFkydHlMbXB6SWwwc0ltNWhiV1Z6SWpwYlhTd2liV0Z3Y0dsdVozTWlPaUk3UVVGQlFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFUdEJRVU5CTzBGQlEwRTdRVUZEUVR0QlFVTkJPMEZCUTBFN1FVRkRRVHRCUVVOQk8wRkJRMEU3UVVGRFFTSXNJbVpwYkdVaU9pSm5aVzVsY21GMFpXUXVhbk1pTENKemIzVnlZMlZTYjI5MElqb2lJaXdpYzI5MWNtTmxjME52Ym5SbGJuUWlPbHNpTHk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTljYmk4dklGQmhZMnRoWjJVZ1pHOWpjeUJoZENCb2RIUndPaTh2Wkc5amN5NXRaWFJsYjNJdVkyOXRMeU4wY21GamEyVnlJQzh2WEc0dkx5Qk1ZWE4wSUcxbGNtZGxPaUJvZEhSd2N6b3ZMMmRwZEdoMVlpNWpiMjB2YldWMFpXOXlMMjFsZEdWdmNpOWliRzlpTHpZNU5qZzNObUl4T0RRNFpUUmtObUU1TWpBeE5ETTBNakpqTW1NMU1HTTBOVEF4WXpnMVlUTXZjR0ZqYTJGblpYTXZkSEpoWTJ0bGNpOTBjbUZqYTJWeUxtcHpJQzh2WEc0dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2THk4dkx5OHZMeTh2TDF4dVhHNHZMeUJqYUdWamF5Qm1iM0lnWjJ4dlltRnNJR0Z1WkNCMWMyVWdkR2hoZENCdmJtVWdhVzV6ZEdWaFpDQnZaaUJzYjJGa2FXNW5JR0VnYm1WM0lHOXVaVnh1YVdZZ0tIUjVjR1Z2WmlCbmJHOWlZV3d1VkhKaFkydHlJQ0U5UFNCY0luVnVaR1ZtYVc1bFpGd2lLU0I3WEc1Y2RHMXZaSFZzWlM1bGVIQnZjblJ6SUQwZ1oyeHZZbUZzTGxSeVlXTnJjanRjYmx4MGNtVjBkWEp1TzF4dWZWeHVYRzR2S2lwY2JpQXFJRUJ1WVcxbGMzQmhZMlVnVkhKaFkydHlYRzRnS2lCQWMzVnRiV0Z5ZVNCVWFHVWdibUZ0WlhOd1lXTmxJR1p2Y2lCVWNtRmphM0l0Y21Wc1lYUmxaQ0J0WlhSb2IyUnpMbHh1SUNvdlhHNTJZWElnVkhKaFkydHlJRDBnWjJ4dlltRnNMbFJ5WVdOcmNpQTlJRzF2WkhWc1pTNWxlSEJ2Y25SeklEMGdlMzA3WEc1Y2JpOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkzUnlZV05yWlhKZllXTjBhWFpsWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1ZISjFaU0JwWmlCMGFHVnlaU0JwY3lCaElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNHNJRzFsWVc1cGJtY2dkR2hoZENCa1pYQmxibVJsYm1OcFpYTWdiMjRnY21WaFkzUnBkbVVnWkdGMFlTQnpiM1Z5WTJWeklIZHBiR3dnWW1VZ2RISmhZMnRsWkNCaGJtUWdjRzkwWlc1MGFXRnNiSGtnWTJGMWMyVWdkR2hsSUdOMWNuSmxiblFnWTI5dGNIVjBZWFJwYjI0Z2RHOGdZbVVnY21WeWRXNHVYRzRnS2lCQWJHOWpkWE1nUTJ4cFpXNTBYRzRnS2lCQWRIbHdaU0I3UW05dmJHVmhibjFjYmlBcUwxeHVWSEpoWTJ0eUxtRmpkR2wyWlNBOUlHWmhiSE5sTzF4dVhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TjBjbUZqYTJWeVgyTjFjbkpsYm5SamIyMXdkWFJoZEdsdmJseHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRlJvWlNCamRYSnlaVzUwSUdOdmJYQjFkR0YwYVc5dUxDQnZjaUJnYm5Wc2JHQWdhV1lnZEdobGNtVWdhWE51SjNRZ2IyNWxMbHgwVkdobElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNGdhWE1nZEdobElGdGdWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVZRjBvSTNSeVlXTnJaWEpmWTI5dGNIVjBZWFJwYjI0cElHOWlhbVZqZENCamNtVmhkR1ZrSUdKNUlIUm9aU0JwYm01bGNtMXZjM1FnWVdOMGFYWmxJR05oYkd3Z2RHOGdZRlJ5WVdOcmNpNWhkWFJ2Y25WdVlDd2dZVzVrSUdsMEozTWdkR2hsSUdOdmJYQjFkR0YwYVc5dUlIUm9ZWFFnWjJGcGJuTWdaR1Z3Wlc1a1pXNWphV1Z6SUhkb1pXNGdjbVZoWTNScGRtVWdaR0YwWVNCemIzVnlZMlZ6SUdGeVpTQmhZMk5sYzNObFpDNWNiaUFxSUVCc2IyTjFjeUJEYkdsbGJuUmNiaUFxSUVCMGVYQmxJSHRVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjU5WEc0Z0tpOWNibFJ5WVdOcmNpNWpkWEp5Wlc1MFEyOXRjSFYwWVhScGIyNGdQU0J1ZFd4c08xeHVYRzR2THlCU1pXWmxjbVZ1WTJWeklIUnZJR0ZzYkNCamIyMXdkWFJoZEdsdmJuTWdZM0psWVhSbFpDQjNhWFJvYVc0Z2RHaGxJRlJ5WVdOcmNpQmllU0JwWkM1Y2JpOHZJRXRsWlhCcGJtY2dkR2hsYzJVZ2NtVm1aWEpsYm1ObGN5QnZiaUJoYmlCMWJtUmxjbk5qYjNKbElIQnliM0JsY25SNUlHZHBkbVZ6SUcxdmNtVWdZMjl1ZEhKdmJDQjBiMXh1THk4Z2RHOXZiR2x1WnlCaGJtUWdjR0ZqYTJGblpYTWdaWGgwWlc1a2FXNW5JRlJ5WVdOcmNpQjNhWFJvYjNWMElHbHVZM0psWVhOcGJtY2dkR2hsSUVGUVNTQnpkWEptWVdObExseHVMeThnVkdobGMyVWdZMkZ1SUhWelpXUWdkRzhnYlc5dWEyVjVMWEJoZEdOb0lHTnZiWEIxZEdGMGFXOXVjeXdnZEdobGFYSWdablZ1WTNScGIyNXpMQ0IxYzJWY2JpOHZJR052YlhCMWRHRjBhVzl1SUdsa2N5Qm1iM0lnZEhKaFkydHBibWNzSUdWMFl5NWNibFJ5WVdOcmNpNWZZMjl0Y0hWMFlYUnBiMjV6SUQwZ2UzMDdYRzVjYm5aaGNpQnpaWFJEZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRnUFNCbWRXNWpkR2x2YmlBb1l5a2dlMXh1WEhSVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1SUQwZ1l6dGNibHgwVkhKaFkydHlMbUZqZEdsMlpTQTlJQ0VoSUdNN1hHNTlPMXh1WEc1MllYSWdYMlJsWW5WblJuVnVZeUE5SUdaMWJtTjBhVzl1SUNncElIdGNibHgwY21WMGRYSnVJQ2gwZVhCbGIyWWdZMjl1YzI5c1pTQWhQVDBnWENKMWJtUmxabWx1WldSY0lpa2dKaVlnWTI5dWMyOXNaUzVsY25KdmNpQS9YRzVjZEZ4MFhIUWdablZ1WTNScGIyNGdLQ2tnZXlCamIyNXpiMnhsTG1WeWNtOXlMbUZ3Y0d4NUtHTnZibk52YkdVc0lHRnlaM1Z0Wlc1MGN5azdJSDBnT2x4dVhIUmNkRngwSUdaMWJtTjBhVzl1SUNncElIdDlPMXh1ZlR0Y2JseHVkbUZ5SUY5MGFISnZkMDl5VEc5bklEMGdablZ1WTNScGIyNGdLR1p5YjIwc0lHVXBJSHRjYmx4MGFXWWdLSFJvY205M1JtbHljM1JGY25KdmNpa2dlMXh1WEhSY2RIUm9jbTkzSUdVN1hHNWNkSDBnWld4elpTQjdYRzVjZEZ4MGRtRnlJSEJ5YVc1MFFYSm5jeUE5SUZ0Y0lrVjRZMlZ3ZEdsdmJpQm1jbTl0SUZSeVlXTnJjaUJjSWlBcklHWnliMjBnS3lCY0lpQm1kVzVqZEdsdmJqcGNJbDA3WEc1Y2RGeDBhV1lnS0dVdWMzUmhZMnNnSmlZZ1pTNXRaWE56WVdkbElDWW1JR1V1Ym1GdFpTa2dlMXh1WEhSY2RGeDBkbUZ5SUdsa2VDQTlJR1V1YzNSaFkyc3VhVzVrWlhoUFppaGxMbTFsYzNOaFoyVXBPMXh1WEhSY2RGeDBhV1lnS0dsa2VDQThJREFnZkh3Z2FXUjRJRDRnWlM1dVlXMWxMbXhsYm1kMGFDQXJJRElwSUhzZ0x5OGdZMmhsWTJzZ1ptOXlJRndpUlhKeWIzSTZJRndpWEc1Y2RGeDBYSFJjZEM4dklHMWxjM05oWjJVZ2FYTWdibTkwSUhCaGNuUWdiMllnZEdobElITjBZV05yWEc1Y2RGeDBYSFJjZEhaaGNpQnRaWE56WVdkbElEMGdaUzV1WVcxbElDc2dYQ0k2SUZ3aUlDc2daUzV0WlhOellXZGxPMXh1WEhSY2RGeDBYSFJ3Y21sdWRFRnlaM011Y0hWemFDaHRaWE56WVdkbEtUdGNibHgwWEhSY2RIMWNibHgwWEhSOVhHNWNkRngwY0hKcGJuUkJjbWR6TG5CMWMyZ29aUzV6ZEdGamF5azdYRzVjYmx4MFhIUm1iM0lnS0haaGNpQnBJRDBnTURzZ2FTQThJSEJ5YVc1MFFYSm5jeTVzWlc1bmRHZzdJR2tyS3lrZ2UxeHVYSFJjZEZ4MFgyUmxZblZuUm5WdVl5Z3BLSEJ5YVc1MFFYSm5jMXRwWFNrN1hHNWNkRngwZlZ4dVhIUjlYRzU5TzF4dVhHNHZMeUJVWVd0bGN5QmhJR1oxYm1OMGFXOXVJR0JtWUN3Z1lXNWtJSGR5WVhCeklHbDBJR2x1SUdFZ1lFMWxkR1Z2Y2k1ZmJtOVphV1ZzWkhOQmJHeHZkMlZrWUZ4dUx5OGdZbXh2WTJzZ2FXWWdkMlVnWVhKbElISjFibTVwYm1jZ2IyNGdkR2hsSUhObGNuWmxjaTRnVDI0Z2RHaGxJR05zYVdWdWRDd2djbVYwZFhKdWN5QjBhR1ZjYmk4dklHOXlhV2RwYm1Gc0lHWjFibU4wYVc5dUlDaHphVzVqWlNCZ1RXVjBaVzl5TGw5dWIxbHBaV3hrYzBGc2JHOTNaV1JnSUdseklHRmNiaTh2SUc1dkxXOXdLUzRnVkdocGN5Qm9ZWE1nZEdobElHSmxibVZtYVhRZ2IyWWdibTkwSUdGa1pHbHVaeUJoYmlCMWJtNWxZMlZ6YzJGeWVTQnpkR0ZqYTF4dUx5OGdabkpoYldVZ2IyNGdkR2hsSUdOc2FXVnVkQzVjYm5aaGNpQjNhWFJvVG05WmFXVnNaSE5CYkd4dmQyVmtJRDBnWm5WdVkzUnBiMjRnS0dZcElIdGNibHgwY21WMGRYSnVJR1k3WEc1OU8xeHVYRzUyWVhJZ2JtVjRkRWxrSUQwZ01UdGNiaTh2SUdOdmJYQjFkR0YwYVc5dWN5QjNhRzl6WlNCallXeHNZbUZqYTNNZ2QyVWdjMmh2ZFd4a0lHTmhiR3dnWVhRZ1pteDFjMmdnZEdsdFpWeHVkbUZ5SUhCbGJtUnBibWREYjIxd2RYUmhkR2x2Ym5NZ1BTQmJYVHRjYmk4dklHQjBjblZsWUNCcFppQmhJRlJ5WVdOcmNpNW1iSFZ6YUNCcGN5QnpZMmhsWkhWc1pXUXNJRzl5SUdsbUlIZGxJR0Z5WlNCcGJpQlVjbUZqYTNJdVpteDFjMmdnYm05M1hHNTJZWElnZDJsc2JFWnNkWE5vSUQwZ1ptRnNjMlU3WEc0dkx5QmdkSEoxWldBZ2FXWWdkMlVnWVhKbElHbHVJRlJ5WVdOcmNpNW1iSFZ6YUNCdWIzZGNiblpoY2lCcGJrWnNkWE5vSUQwZ1ptRnNjMlU3WEc0dkx5QmdkSEoxWldBZ2FXWWdkMlVnWVhKbElHTnZiWEIxZEdsdVp5QmhJR052YlhCMWRHRjBhVzl1SUc1dmR5d2daV2wwYUdWeUlHWnBjbk4wSUhScGJXVmNiaTh2SUc5eUlISmxZMjl0Y0hWMFpTNWNkRlJvYVhNZ2JXRjBZMmhsY3lCVWNtRmphM0l1WVdOMGFYWmxJSFZ1YkdWemN5QjNaU0JoY21VZ2FXNXphV1JsWEc0dkx5QlVjbUZqYTNJdWJtOXVjbVZoWTNScGRtVXNJSGRvYVdOb0lHNTFiR3htYVdWeklHTjFjbkpsYm5SRGIyMXdkWFJoZEdsdmJpQmxkbVZ1SUhSb2IzVm5hRnh1THk4Z1lXNGdaVzVqYkc5emFXNW5JR052YlhCMWRHRjBhVzl1SUcxaGVTQnpkR2xzYkNCaVpTQnlkVzV1YVc1bkxseHVkbUZ5SUdsdVEyOXRjSFYwWlNBOUlHWmhiSE5sTzF4dUx5OGdZSFJ5ZFdWZ0lHbG1JSFJvWlNCZ1gzUm9jbTkzUm1seWMzUkZjbkp2Y21BZ2IzQjBhVzl1SUhkaGN5QndZWE56WldRZ2FXNGdkRzhnZEdobElHTmhiR3hjYmk4dklIUnZJRlJ5WVdOcmNpNW1iSFZ6YUNCMGFHRjBJSGRsSUdGeVpTQnBiaTRnVjJobGJpQnpaWFFzSUhSb2NtOTNJSEpoZEdobGNpQjBhR0Z1SUd4dlp5QjBhR1ZjYmk4dklHWnBjbk4wSUdWeWNtOXlJR1Z1WTI5MWJuUmxjbVZrSUhkb2FXeGxJR1pzZFhOb2FXNW5MaUJDWldadmNtVWdkR2h5YjNkcGJtY2dkR2hsSUdWeWNtOXlMRnh1THk4Z1ptbHVhWE5vSUdac2RYTm9hVzVuSUNobWNtOXRJR0VnWm1sdVlXeHNlU0JpYkc5amF5a3NJR3h2WjJkcGJtY2dZVzU1SUhOMVluTmxjWFZsYm5SY2JpOHZJR1Z5Y205eWN5NWNiblpoY2lCMGFISnZkMFpwY25OMFJYSnliM0lnUFNCbVlXeHpaVHRjYmx4dWRtRnlJR0ZtZEdWeVJteDFjMmhEWVd4c1ltRmphM01nUFNCYlhUdGNibHh1ZG1GeUlISmxjWFZsYzNSQmJtbHRZWFJwYjI1R2NtRnRaU0E5SUhKbGNYVnBjbVVvWENKeVlXWmNJaWs3WEc1Y2JuWmhjaUJ5WlhGMWFYSmxSbXgxYzJnZ1BTQm1kVzVqZEdsdmJpQW9LU0I3WEc1Y2RHbG1JQ2doSUhkcGJHeEdiSFZ6YUNrZ2UxeHVYSFJjZEhKbGNYVmxjM1JCYm1sdFlYUnBiMjVHY21GdFpTaFVjbUZqYTNJdVgzSjFia1pzZFhOb0tUdGNibHgwWEhSM2FXeHNSbXgxYzJnZ1BTQjBjblZsTzF4dVhIUjlYRzU5TzF4dVhHNHZMeUJVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjRnWTI5dWMzUnlkV04wYjNJZ2FYTWdkbWx6YVdKc1pTQmlkWFFnY0hKcGRtRjBaVnh1THk4Z0tIUm9jbTkzY3lCaGJpQmxjbkp2Y2lCcFppQjViM1VnZEhKNUlIUnZJR05oYkd3Z2FYUXBYRzUyWVhJZ1kyOXVjM1J5ZFdOMGFXNW5RMjl0Y0hWMFlYUnBiMjRnUFNCbVlXeHpaVHRjYmx4dUx5OWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZZMjl0Y0hWMFlYUnBiMjVjYmx4dUx5b3FYRzRnS2lCQWMzVnRiV0Z5ZVNCQklFTnZiWEIxZEdGMGFXOXVJRzlpYW1WamRDQnlaWEJ5WlhObGJuUnpJR052WkdVZ2RHaGhkQ0JwY3lCeVpYQmxZWFJsWkd4NUlISmxjblZ1WEc0Z0tpQnBiaUJ5WlhOd2IyNXpaU0IwYjF4dUlDb2djbVZoWTNScGRtVWdaR0YwWVNCamFHRnVaMlZ6TGlCRGIyMXdkWFJoZEdsdmJuTWdaRzl1SjNRZ2FHRjJaU0J5WlhSMWNtNGdkbUZzZFdWek95QjBhR1Y1SUdwMWMzUmNiaUFxSUhCbGNtWnZjbTBnWVdOMGFXOXVjeXdnYzNWamFDQmhjeUJ5WlhKbGJtUmxjbWx1WnlCaElIUmxiWEJzWVhSbElHOXVJSFJvWlNCelkzSmxaVzR1SUVOdmJYQjFkR0YwYVc5dWMxeHVJQ29nWVhKbElHTnlaV0YwWldRZ2RYTnBibWNnVkhKaFkydHlMbUYxZEc5eWRXNHVJRlZ6WlNCemRHOXdJSFJ2SUhCeVpYWmxiblFnWm5WeWRHaGxjaUJ5WlhKMWJtNXBibWNnYjJZZ1lWeHVJQ29nWTI5dGNIVjBZWFJwYjI0dVhHNGdLaUJBYVc1emRHRnVZMlZ1WVcxbElHTnZiWEIxZEdGMGFXOXVYRzRnS2k5Y2JsUnlZV05yY2k1RGIyMXdkWFJoZEdsdmJpQTlJR1oxYm1OMGFXOXVJQ2htTENCd1lYSmxiblFzSUc5d2RHbHZibk1wSUh0Y2JseDBhV1lnS0NFZ1kyOXVjM1J5ZFdOMGFXNW5RMjl0Y0hWMFlYUnBiMjRwWEc1Y2RGeDBkR2h5YjNjZ2JtVjNJRVZ5Y205eUtGeHVYSFJjZEZ4MFhDSlVjbUZqYTNJdVEyOXRjSFYwWVhScGIyNGdZMjl1YzNSeWRXTjBiM0lnYVhNZ2NISnBkbUYwWlRzZ2RYTmxJRlJ5WVdOcmNpNWhkWFJ2Y25WdVhDSXBPMXh1WEhSamIyNXpkSEoxWTNScGJtZERiMjF3ZFhSaGRHbHZiaUE5SUdaaGJITmxPMXh1WEc1Y2RIWmhjaUJ6Wld4bUlEMGdkR2hwY3p0Y2JseDBiM0IwYVc5dWN5QTlJRzl3ZEdsdmJuTWdmSHdnZTMwN1hHNWNibHgwTHk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqWTI5dGNIVjBZWFJwYjI1ZmMzUnZjSEJsWkZ4dVhHNWNkQzhxS2x4dVhIUWdLaUJBYzNWdGJXRnllU0JVY25WbElHbG1JSFJvYVhNZ1kyOXRjSFYwWVhScGIyNGdhR0Z6SUdKbFpXNGdjM1J2Y0hCbFpDNWNibHgwSUNvZ1FHeHZZM1Z6SUVOc2FXVnVkRnh1WEhRZ0tpQkFiV1Z0WW1WeVQyWWdWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVYRzVjZENBcUlFQnBibk4wWVc1alpWeHVYSFFnS2lCQWJtRnRaVngwYzNSdmNIQmxaRnh1WEhRZ0tpOWNibHgwYzJWc1ppNXpkRzl3Y0dWa0lEMGdabUZzYzJVN1hHNWNibHgwTHk4Z2FIUjBjRG92TDJSdlkzTXViV1YwWlc5eUxtTnZiUzhqWTI5dGNIVjBZWFJwYjI1ZmFXNTJZV3hwWkdGMFpXUmNibHh1WEhRdktpcGNibHgwSUNvZ1FITjFiVzFoY25rZ1ZISjFaU0JwWmlCMGFHbHpJR052YlhCMWRHRjBhVzl1SUdoaGN5QmlaV1Z1SUdsdWRtRnNhV1JoZEdWa0lDaGhibVFnYm05MElIbGxkQ0J5WlhKMWJpa3NJRzl5SUdsbUlHbDBJR2hoY3lCaVpXVnVJSE4wYjNCd1pXUXVYRzVjZENBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmx4MElDb2dRRzFsYldKbGNrOW1JRlJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZibHh1WEhRZ0tpQkFhVzV6ZEdGdVkyVmNibHgwSUNvZ1FHNWhiV1ZjZEdsdWRtRnNhV1JoZEdWa1hHNWNkQ0FxSUVCMGVYQmxJSHRDYjI5c1pXRnVmVnh1WEhRZ0tpOWNibHgwYzJWc1ppNXBiblpoYkdsa1lYUmxaQ0E5SUdaaGJITmxPMXh1WEc1Y2RDOHZJR2gwZEhBNkx5OWtiMk56TG0xbGRHVnZjaTVqYjIwdkkyTnZiWEIxZEdGMGFXOXVYMlpwY25OMGNuVnVYRzVjYmx4MEx5b3FYRzVjZENBcUlFQnpkVzF0WVhKNUlGUnlkV1VnWkhWeWFXNW5JSFJvWlNCcGJtbDBhV0ZzSUhKMWJpQnZaaUIwYUdVZ1kyOXRjSFYwWVhScGIyNGdZWFFnZEdobElIUnBiV1VnWUZSeVlXTnJjaTVoZFhSdmNuVnVZQ0JwY3lCallXeHNaV1FzSUdGdVpDQm1ZV3h6WlNCdmJpQnpkV0p6WlhGMVpXNTBJSEpsY25WdWN5QmhibVFnWVhRZ2IzUm9aWElnZEdsdFpYTXVYRzVjZENBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmx4MElDb2dRRzFsYldKbGNrOW1JRlJ5WVdOcmNpNURiMjF3ZFhSaGRHbHZibHh1WEhRZ0tpQkFhVzV6ZEdGdVkyVmNibHgwSUNvZ1FHNWhiV1ZjZEdacGNuTjBVblZ1WEc1Y2RDQXFJRUIwZVhCbElIdENiMjlzWldGdWZWeHVYSFFnS2k5Y2JseDBjMlZzWmk1bWFYSnpkRkoxYmlBOUlIUnlkV1U3WEc1Y2JseDBjMlZzWmk1ZmFXUWdQU0J1WlhoMFNXUXJLenRjYmx4MGMyVnNaaTVmYjI1SmJuWmhiR2xrWVhSbFEyRnNiR0poWTJ0eklEMGdXMTA3WEc1Y2RITmxiR1l1WDI5dVUzUnZjRU5oYkd4aVlXTnJjeUE5SUZ0ZE8xeHVYSFF2THlCMGFHVWdjR3hoYmlCcGN5QmhkQ0J6YjIxbElIQnZhVzUwSUhSdklIVnpaU0IwYUdVZ2NHRnlaVzUwSUhKbGJHRjBhVzl1WEc1Y2RDOHZJSFJ2SUdOdmJuTjBjbUZwYmlCMGFHVWdiM0prWlhJZ2RHaGhkQ0JqYjIxd2RYUmhkR2x2Ym5NZ1lYSmxJSEJ5YjJObGMzTmxaRnh1WEhSelpXeG1MbDl3WVhKbGJuUWdQU0J3WVhKbGJuUTdYRzVjZEhObGJHWXVYMloxYm1NZ1BTQm1PMXh1WEhSelpXeG1MbDl2YmtWeWNtOXlJRDBnYjNCMGFXOXVjeTV2YmtWeWNtOXlPMXh1WEhSelpXeG1MbDl5WldOdmJYQjFkR2x1WnlBOUlHWmhiSE5sTzF4dVhIUnpaV3htTGw5amIyNTBaWGgwSUQwZ2IzQjBhVzl1Y3k1amIyNTBaWGgwSUh4OElHNTFiR3c3WEc1Y2JseDBMeThnVW1WbmFYTjBaWElnZEdobElHTnZiWEIxZEdGMGFXOXVJSGRwZEdocGJpQjBhR1VnWjJ4dlltRnNJRlJ5WVdOcmNpNWNibHgwVkhKaFkydHlMbDlqYjIxd2RYUmhkR2x2Ym5OYmMyVnNaaTVmYVdSZElEMGdjMlZzWmp0Y2JseHVYSFIyWVhJZ1pYSnliM0psWkNBOUlIUnlkV1U3WEc1Y2RIUnllU0I3WEc1Y2RGeDBjMlZzWmk1ZlkyOXRjSFYwWlNncE8xeHVYSFJjZEdWeWNtOXlaV1FnUFNCbVlXeHpaVHRjYmx4MGZTQm1hVzVoYkd4NUlIdGNibHgwWEhSelpXeG1MbVpwY25OMFVuVnVJRDBnWm1Gc2MyVTdYRzVjZEZ4MGFXWWdLR1Z5Y205eVpXUXBYRzVjZEZ4MFhIUnpaV3htTG5OMGIzQW9LVHRjYmx4MGZWeHVmVHRjYmx4dUx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4alkyOXRjSFYwWVhScGIyNWZiMjVwYm5aaGJHbGtZWFJsWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1VtVm5hWE4wWlhKeklHQmpZV3hzWW1GamEyQWdkRzhnY25WdUlIZG9aVzRnZEdocGN5QmpiMjF3ZFhSaGRHbHZiaUJwY3lCdVpYaDBJR2x1ZG1Gc2FXUmhkR1ZrTENCdmNpQnlkVzV6SUdsMElHbHRiV1ZrYVdGMFpXeDVJR2xtSUhSb1pTQmpiMjF3ZFhSaGRHbHZiaUJwY3lCaGJISmxZV1I1SUdsdWRtRnNhV1JoZEdWa0xseDBWR2hsSUdOaGJHeGlZV05ySUdseklISjFiaUJsZUdGamRHeDVJRzl1WTJVZ1lXNWtJRzV2ZENCMWNHOXVJR1oxZEhWeVpTQnBiblpoYkdsa1lYUnBiMjV6SUhWdWJHVnpjeUJnYjI1SmJuWmhiR2xrWVhSbFlDQnBjeUJqWVd4c1pXUWdZV2RoYVc0Z1lXWjBaWElnZEdobElHTnZiWEIxZEdGMGFXOXVJR0psWTI5dFpYTWdkbUZzYVdRZ1lXZGhhVzR1WEc0Z0tpQkFiRzlqZFhNZ1EyeHBaVzUwWEc0Z0tpQkFjR0Z5WVcwZ2UwWjFibU4wYVc5dWZTQmpZV3hzWW1GamF5QkdkVzVqZEdsdmJpQjBieUJpWlNCallXeHNaV1FnYjI0Z2FXNTJZV3hwWkdGMGFXOXVMaUJTWldObGFYWmxjeUJ2Ym1VZ1lYSm5kVzFsYm5Rc0lIUm9aU0JqYjIxd2RYUmhkR2x2YmlCMGFHRjBJSGRoY3lCcGJuWmhiR2xrWVhSbFpDNWNiaUFxTDF4dVZISmhZMnR5TGtOdmJYQjFkR0YwYVc5dUxuQnliM1J2ZEhsd1pTNXZia2x1ZG1Gc2FXUmhkR1VnUFNCbWRXNWpkR2x2YmlBb1ppd2dZM1I0S1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHh1WEhScFppQW9kSGx3Wlc5bUlHWWdJVDA5SUNkbWRXNWpkR2x2YmljcFhHNWNkRngwZEdoeWIzY2dibVYzSUVWeWNtOXlLRndpYjI1SmJuWmhiR2xrWVhSbElISmxjWFZwY21WeklHRWdablZ1WTNScGIyNWNJaWs3WEc1Y2JseDBhV1lnS0hObGJHWXVhVzUyWVd4cFpHRjBaV1FwSUh0Y2JseDBYSFJVY21GamEzSXVibTl1Y21WaFkzUnBkbVVvWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFJjZEZ4MGQybDBhRTV2V1dsbGJHUnpRV3hzYjNkbFpDaG1LUzVqWVd4c0tHTjBlQ0I4ZkNCelpXeG1MbDlqYjI1MFpYaDBMQ0J6Wld4bUtUdGNibHgwWEhSOUtUdGNibHgwZlNCbGJITmxJSHRjYmx4MFhIUnpaV3htTGw5dmJrbHVkbUZzYVdSaGRHVkRZV3hzWW1GamEzTXVjSFZ6YUNoN0lHWnVPaUJtTENCamRIZzZJR04wZUNCOUtUdGNibHgwZlZ4dWZUdGNibHh1THlvcVhHNGdLaUJBYzNWdGJXRnllU0JTWldkcGMzUmxjbk1nWUdOaGJHeGlZV05yWUNCMGJ5QnlkVzRnZDJobGJpQjBhR2x6SUdOdmJYQjFkR0YwYVc5dUlHbHpJSE4wYjNCd1pXUXNJRzl5SUhKMWJuTWdhWFFnYVcxdFpXUnBZWFJsYkhrZ2FXWWdkR2hsSUdOdmJYQjFkR0YwYVc5dUlHbHpJR0ZzY21WaFpIa2djM1J2Y0hCbFpDNWNkRlJvWlNCallXeHNZbUZqYXlCcGN5QnlkVzRnWVdaMFpYSWdZVzU1SUdCdmJrbHVkbUZzYVdSaGRHVmdJR05oYkd4aVlXTnJjeTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUlFQndZWEpoYlNCN1JuVnVZM1JwYjI1OUlHTmhiR3hpWVdOcklFWjFibU4wYVc5dUlIUnZJR0psSUdOaGJHeGxaQ0J2YmlCemRHOXdMaUJTWldObGFYWmxjeUJ2Ym1VZ1lYSm5kVzFsYm5Rc0lIUm9aU0JqYjIxd2RYUmhkR2x2YmlCMGFHRjBJSGRoY3lCemRHOXdjR1ZrTGx4dUlDb3ZYRzVVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjR1Y0hKdmRHOTBlWEJsTG05dVUzUnZjQ0E5SUdaMWJtTjBhVzl1SUNobUxDQmpkSGdwSUh0Y2JseDBkbUZ5SUhObGJHWWdQU0IwYUdsek8xeHVYRzVjZEdsbUlDaDBlWEJsYjJZZ1ppQWhQVDBnSjJaMWJtTjBhVzl1SnlsY2JseDBYSFIwYUhKdmR5QnVaWGNnUlhKeWIzSW9YQ0p2YmxOMGIzQWdjbVZ4ZFdseVpYTWdZU0JtZFc1amRHbHZibHdpS1R0Y2JseHVYSFJwWmlBb2MyVnNaaTV6ZEc5d2NHVmtLU0I3WEc1Y2RGeDBWSEpoWTJ0eUxtNXZibkpsWVdOMGFYWmxLR1oxYm1OMGFXOXVJQ2dwSUh0Y2JseDBYSFJjZEhkcGRHaE9iMWxwWld4a2MwRnNiRzkzWldRb1ppa3VZMkZzYkNoamRIZ2dmSHdnYzJWc1ppNWZZMjl1ZEdWNGRDd2djMlZzWmlrN1hHNWNkRngwZlNrN1hHNWNkSDBnWld4elpTQjdYRzVjZEZ4MGMyVnNaaTVmYjI1VGRHOXdRMkZzYkdKaFkydHpMbkIxYzJnb2V5Qm1iam9nWml3Z1kzUjRPaUJqZEhnZ2ZTazdYRzVjZEgxY2JuMDdYRzVjYmk4dklHaDBkSEE2THk5a2IyTnpMbTFsZEdWdmNpNWpiMjB2STJOdmJYQjFkR0YwYVc5dVgybHVkbUZzYVdSaGRHVmNibHh1THlvcVhHNGdLaUJBYzNWdGJXRnllU0JKYm5aaGJHbGtZWFJsY3lCMGFHbHpJR052YlhCMWRHRjBhVzl1SUhOdklIUm9ZWFFnYVhRZ2QybHNiQ0JpWlNCeVpYSjFiaTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUwxeHVWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVMbkJ5YjNSdmRIbHdaUzVwYm5aaGJHbGtZWFJsSUQwZ1puVnVZM1JwYjI0Z0tDa2dlMXh1WEhSMllYSWdjMlZzWmlBOUlIUm9hWE03WEc1Y2RHbG1JQ2doSUhObGJHWXVhVzUyWVd4cFpHRjBaV1FwSUh0Y2JseDBYSFF2THlCcFppQjNaU2R5WlNCamRYSnlaVzUwYkhrZ2FXNGdYM0psWTI5dGNIVjBaU2dwTENCa2IyNG5kQ0JsYm5GMVpYVmxYRzVjZEZ4MEx5OGdiM1Z5YzJWc2RtVnpMQ0J6YVc1alpTQjNaU2RzYkNCeVpYSjFiaUJwYlcxbFpHbGhkR1ZzZVNCaGJubDNZWGt1WEc1Y2RGeDBhV1lnS0NFZ2MyVnNaaTVmY21WamIyMXdkWFJwYm1jZ0ppWWdJU0J6Wld4bUxuTjBiM0J3WldRcElIdGNibHgwWEhSY2RISmxjWFZwY21WR2JIVnphQ2dwTzF4dVhIUmNkRngwY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1d2RYTm9LSFJvYVhNcE8xeHVYSFJjZEgxY2JseHVYSFJjZEhObGJHWXVhVzUyWVd4cFpHRjBaV1FnUFNCMGNuVmxPMXh1WEc1Y2RGeDBMeThnWTJGc2JHSmhZMnR6SUdOaGJpZDBJR0ZrWkNCallXeHNZbUZqYTNNc0lHSmxZMkYxYzJWY2JseDBYSFF2THlCelpXeG1MbWx1ZG1Gc2FXUmhkR1ZrSUQwOVBTQjBjblZsTGx4dVhIUmNkR1p2Y2loMllYSWdhU0E5SURBc0lHWTdJR1lnUFNCelpXeG1MbDl2YmtsdWRtRnNhV1JoZEdWRFlXeHNZbUZqYTNOYmFWMDdJR2tyS3lrZ2UxeHVYSFJjZEZ4MFZISmhZMnR5TG01dmJuSmxZV04wYVhabEtHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MFhIUmNkRngwZDJsMGFFNXZXV2xsYkdSelFXeHNiM2RsWkNobUxtWnVLUzVqWVd4c0tHWXVZM1I0SUh4OElITmxiR1l1WDJOdmJuUmxlSFFzSUhObGJHWXBPMXh1WEhSY2RGeDBmU2s3WEc1Y2RGeDBmVnh1WEhSY2RITmxiR1l1WDI5dVNXNTJZV3hwWkdGMFpVTmhiR3hpWVdOcmN5QTlJRnRkTzF4dVhIUjlYRzU5TzF4dVhHNHZMeUJvZEhSd09pOHZaRzlqY3k1dFpYUmxiM0l1WTI5dEx5TmpiMjF3ZFhSaGRHbHZibDl6ZEc5d1hHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVSEpsZG1WdWRITWdkR2hwY3lCamIyMXdkWFJoZEdsdmJpQm1jbTl0SUhKbGNuVnVibWx1Wnk1Y2JpQXFJRUJzYjJOMWN5QkRiR2xsYm5SY2JpQXFMMXh1VkhKaFkydHlMa052YlhCMWRHRjBhVzl1TG5CeWIzUnZkSGx3WlM1emRHOXdJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFIyWVhJZ2MyVnNaaUE5SUhSb2FYTTdYRzVjYmx4MGFXWWdLQ0VnYzJWc1ppNXpkRzl3Y0dWa0tTQjdYRzVjZEZ4MGMyVnNaaTV6ZEc5d2NHVmtJRDBnZEhKMVpUdGNibHgwWEhSelpXeG1MbWx1ZG1Gc2FXUmhkR1VvS1R0Y2JseDBYSFF2THlCVmJuSmxaMmx6ZEdWeUlHWnliMjBnWjJ4dlltRnNJRlJ5WVdOcmNpNWNibHgwWEhSa1pXeGxkR1VnVkhKaFkydHlMbDlqYjIxd2RYUmhkR2x2Ym5OYmMyVnNaaTVmYVdSZE8xeHVYSFJjZEdadmNpaDJZWElnYVNBOUlEQXNJR1k3SUdZZ1BTQnpaV3htTGw5dmJsTjBiM0JEWVd4c1ltRmphM05iYVYwN0lHa3JLeWtnZTF4dVhIUmNkRngwVkhKaFkydHlMbTV2Ym5KbFlXTjBhWFpsS0daMWJtTjBhVzl1SUNncElIdGNibHgwWEhSY2RGeDBkMmwwYUU1dldXbGxiR1J6UVd4c2IzZGxaQ2htTG1adUtTNWpZV3hzS0dZdVkzUjRJSHg4SUhObGJHWXVYMk52Ym5SbGVIUXNJSE5sYkdZcE8xeHVYSFJjZEZ4MGZTazdYRzVjZEZ4MGZWeHVYSFJjZEhObGJHWXVYMjl1VTNSdmNFTmhiR3hpWVdOcmN5QTlJRnRkTzF4dVhIUjlYRzU5TzF4dVhHNVVjbUZqYTNJdVEyOXRjSFYwWVhScGIyNHVjSEp2ZEc5MGVYQmxMbDlqYjIxd2RYUmxJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFIyWVhJZ2MyVnNaaUE5SUhSb2FYTTdYRzVjZEhObGJHWXVhVzUyWVd4cFpHRjBaV1FnUFNCbVlXeHpaVHRjYmx4dVhIUjJZWElnY0hKbGRtbHZkWE1nUFNCVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1TzF4dVhIUnpaWFJEZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRvYzJWc1ppazdYRzVjZEhaaGNpQndjbVYyYVc5MWMwbHVRMjl0Y0hWMFpTQTlJR2x1UTI5dGNIVjBaVHRjYmx4MGFXNURiMjF3ZFhSbElEMGdkSEoxWlR0Y2JseDBkSEo1SUh0Y2JseDBYSFIzYVhSb1RtOVphV1ZzWkhOQmJHeHZkMlZrS0hObGJHWXVYMloxYm1NcExtTmhiR3dvYzJWc1ppNWZZMjl1ZEdWNGRDd2djMlZzWmlrN1hHNWNkSDBnWm1sdVlXeHNlU0I3WEc1Y2RGeDBjMlYwUTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1S0hCeVpYWnBiM1Z6S1R0Y2JseDBYSFJwYmtOdmJYQjFkR1VnUFNCd2NtVjJhVzkxYzBsdVEyOXRjSFYwWlR0Y2JseDBmVnh1ZlR0Y2JseHVWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVMbkJ5YjNSdmRIbHdaUzVmYm1WbFpITlNaV052YlhCMWRHVWdQU0JtZFc1amRHbHZiaUFvS1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHgwY21WMGRYSnVJSE5sYkdZdWFXNTJZV3hwWkdGMFpXUWdKaVlnSVNCelpXeG1Mbk4wYjNCd1pXUTdYRzU5TzF4dVhHNVVjbUZqYTNJdVEyOXRjSFYwWVhScGIyNHVjSEp2ZEc5MGVYQmxMbDl5WldOdmJYQjFkR1VnUFNCbWRXNWpkR2x2YmlBb0tTQjdYRzVjZEhaaGNpQnpaV3htSUQwZ2RHaHBjenRjYmx4dVhIUnpaV3htTGw5eVpXTnZiWEIxZEdsdVp5QTlJSFJ5ZFdVN1hHNWNkSFJ5ZVNCN1hHNWNkRngwYVdZZ0tITmxiR1l1WDI1bFpXUnpVbVZqYjIxd2RYUmxLQ2twSUh0Y2JseDBYSFJjZEhSeWVTQjdYRzVjZEZ4MFhIUmNkSE5sYkdZdVgyTnZiWEIxZEdVb0tUdGNibHgwWEhSY2RIMGdZMkYwWTJnZ0tHVXBJSHRjYmx4MFhIUmNkRngwYVdZZ0tITmxiR1l1WDI5dVJYSnliM0lwSUh0Y2JseDBYSFJjZEZ4MFhIUnpaV3htTGw5dmJrVnljbTl5S0dVcE8xeHVYSFJjZEZ4MFhIUjlJR1ZzYzJVZ2UxeHVYSFJjZEZ4MFhIUmNkRjkwYUhKdmQwOXlURzluS0Z3aWNtVmpiMjF3ZFhSbFhDSXNJR1VwTzF4dVhIUmNkRngwWEhSOVhHNWNkRngwWEhSOVhHNWNkRngwZlZ4dVhIUjlJR1pwYm1Gc2JIa2dlMXh1WEhSY2RITmxiR1l1WDNKbFkyOXRjSFYwYVc1bklEMGdabUZzYzJVN1hHNWNkSDFjYm4wN1hHNWNiaTh2WEc0dkx5Qm9kSFJ3T2k4dlpHOWpjeTV0WlhSbGIzSXVZMjl0THlOMGNtRmphMlZ5WDJSbGNHVnVaR1Z1WTNsY2JseHVMeW9xWEc0Z0tpQkFjM1Z0YldGeWVTQkJJRVJsY0dWdVpHVnVZM2tnY21Wd2NtVnpaVzUwY3lCaGJpQmhkRzl0YVdNZ2RXNXBkQ0J2WmlCeVpXRmpkR2wyWlNCa1lYUmhJSFJvWVhRZ1lWeHVJQ29nWTI5dGNIVjBZWFJwYjI0Z2JXbG5hSFFnWkdWd1pXNWtJRzl1TGlCU1pXRmpkR2wyWlNCa1lYUmhJSE52ZFhKalpYTWdjM1ZqYUNCaGN5QlRaWE56YVc5dUlHOXlYRzRnS2lCTmFXNXBiVzl1WjI4Z2FXNTBaWEp1WVd4c2VTQmpjbVZoZEdVZ1pHbG1abVZ5Wlc1MElFUmxjR1Z1WkdWdVkza2diMkpxWldOMGN5Qm1iM0lnWkdsbVptVnlaVzUwWEc0Z0tpQndhV1ZqWlhNZ2IyWWdaR0YwWVN3Z1pXRmphQ0J2WmlCM2FHbGphQ0J0WVhrZ1ltVWdaR1Z3Wlc1a1pXUWdiMjRnWW5rZ2JYVnNkR2x3YkdVZ1kyOXRjSFYwWVhScGIyNXpMbHh1SUNvZ1YyaGxiaUIwYUdVZ1pHRjBZU0JqYUdGdVoyVnpMQ0IwYUdVZ1kyOXRjSFYwWVhScGIyNXpJR0Z5WlNCcGJuWmhiR2xrWVhSbFpDNWNiaUFxSUVCamJHRnpjMXh1SUNvZ1FHbHVjM1JoYm1ObFRtRnRaU0JrWlhCbGJtUmxibU41WEc0Z0tpOWNibFJ5WVdOcmNpNUVaWEJsYm1SbGJtTjVJRDBnWm5WdVkzUnBiMjRnS0NrZ2UxeHVYSFIwYUdsekxsOWtaWEJsYm1SbGJuUnpRbmxKWkNBOUlIdDlPMXh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpaR1Z3Wlc1a1pXNWplVjlrWlhCbGJtUmNiaTh2WEc0dkx5QkJaR1J6SUdCamIyMXdkWFJoZEdsdmJtQWdkRzhnZEdocGN5QnpaWFFnYVdZZ2FYUWdhWE1nYm05MElHRnNjbVZoWkhsY2JpOHZJSEJ5WlhObGJuUXVYSFJTWlhSMWNtNXpJSFJ5ZFdVZ2FXWWdZR052YlhCMWRHRjBhVzl1WUNCcGN5QmhJRzVsZHlCdFpXMWlaWElnYjJZZ2RHaGxJSE5sZEM1Y2JpOHZJRWxtSUc1dklHRnlaM1Z0Wlc1MExDQmtaV1poZFd4MGN5QjBieUJqZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRzSUc5eUlHUnZaWE1nYm05MGFHbHVaMXh1THk4Z2FXWWdkR2hsY21VZ2FYTWdibThnWTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1TGx4dVhHNHZLaXBjYmlBcUlFQnpkVzF0WVhKNUlFUmxZMnhoY21WeklIUm9ZWFFnZEdobElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNGdLRzl5SUdCbWNtOXRRMjl0Y0hWMFlYUnBiMjVnSUdsbUlHZHBkbVZ1S1NCa1pYQmxibVJ6SUc5dUlHQmtaWEJsYm1SbGJtTjVZQzVjZEZSb1pTQmpiMjF3ZFhSaGRHbHZiaUIzYVd4c0lHSmxJR2x1ZG1Gc2FXUmhkR1ZrSUhSb1pTQnVaWGgwSUhScGJXVWdZR1JsY0dWdVpHVnVZM2xnSUdOb1lXNW5aWE11WEc1Y2JrbG1JSFJvWlhKbElHbHpJRzV2SUdOMWNuSmxiblFnWTI5dGNIVjBZWFJwYjI0Z1lXNWtJR0JrWlhCbGJtUW9LV0FnYVhNZ1kyRnNiR1ZrSUhkcGRHZ2dibThnWVhKbmRXMWxiblJ6TENCcGRDQmtiMlZ6SUc1dmRHaHBibWNnWVc1a0lISmxkSFZ5Ym5NZ1ptRnNjMlV1WEc1Y2JsSmxkSFZ5Ym5NZ2RISjFaU0JwWmlCMGFHVWdZMjl0Y0hWMFlYUnBiMjRnYVhNZ1lTQnVaWGNnWkdWd1pXNWtaVzUwSUc5bUlHQmtaWEJsYm1SbGJtTjVZQ0J5WVhSb1pYSWdkR2hoYmlCaGJpQmxlR2x6ZEdsdVp5QnZibVV1WEc0Z0tpQkFiRzlqZFhNZ1EyeHBaVzUwWEc0Z0tpQkFjR0Z5WVcwZ2UxUnlZV05yY2k1RGIyMXdkWFJoZEdsdmJuMGdXMlp5YjIxRGIyMXdkWFJoZEdsdmJsMGdRVzRnYjNCMGFXOXVZV3dnWTI5dGNIVjBZWFJwYjI0Z1pHVmpiR0Z5WldRZ2RHOGdaR1Z3Wlc1a0lHOXVJR0JrWlhCbGJtUmxibU41WUNCcGJuTjBaV0ZrSUc5bUlIUm9aU0JqZFhKeVpXNTBJR052YlhCMWRHRjBhVzl1TGx4dUlDb2dRSEpsZEhWeWJuTWdlMEp2YjJ4bFlXNTlYRzRnS2k5Y2JsUnlZV05yY2k1RVpYQmxibVJsYm1ONUxuQnliM1J2ZEhsd1pTNWtaWEJsYm1RZ1BTQm1kVzVqZEdsdmJpQW9ZMjl0Y0hWMFlYUnBiMjRwSUh0Y2JseDBhV1lnS0NFZ1kyOXRjSFYwWVhScGIyNHBJSHRjYmx4MFhIUnBaaUFvSVNCVWNtRmphM0l1WVdOMGFYWmxLVnh1WEhSY2RGeDBjbVYwZFhKdUlHWmhiSE5sTzF4dVhHNWNkRngwWTI5dGNIVjBZWFJwYjI0Z1BTQlVjbUZqYTNJdVkzVnljbVZ1ZEVOdmJYQjFkR0YwYVc5dU8xeHVYSFI5WEc1Y2RIWmhjaUJ6Wld4bUlEMGdkR2hwY3p0Y2JseDBkbUZ5SUdsa0lEMGdZMjl0Y0hWMFlYUnBiMjR1WDJsa08xeHVYSFJwWmlBb0lTQW9hV1FnYVc0Z2MyVnNaaTVmWkdWd1pXNWtaVzUwYzBKNVNXUXBLU0I3WEc1Y2RGeDBjMlZzWmk1ZlpHVndaVzVrWlc1MGMwSjVTV1JiYVdSZElEMGdZMjl0Y0hWMFlYUnBiMjQ3WEc1Y2RGeDBZMjl0Y0hWMFlYUnBiMjR1YjI1SmJuWmhiR2xrWVhSbEtHWjFibU4wYVc5dUlDZ3BJSHRjYmx4MFhIUmNkR1JsYkdWMFpTQnpaV3htTGw5a1pYQmxibVJsYm5SelFubEpaRnRwWkYwN1hHNWNkRngwZlNrN1hHNWNkRngwY21WMGRYSnVJSFJ5ZFdVN1hHNWNkSDFjYmx4MGNtVjBkWEp1SUdaaGJITmxPMXh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpaR1Z3Wlc1a1pXNWplVjlqYUdGdVoyVmtYRzVjYmk4cUtseHVJQ29nUUhOMWJXMWhjbmtnU1c1MllXeHBaR0YwWlNCaGJHd2daR1Z3Wlc1a1pXNTBJR052YlhCMWRHRjBhVzl1Y3lCcGJXMWxaR2xoZEdWc2VTQmhibVFnY21WdGIzWmxJSFJvWlcwZ1lYTWdaR1Z3Wlc1a1pXNTBjeTVjYmlBcUlFQnNiMk4xY3lCRGJHbGxiblJjYmlBcUwxeHVWSEpoWTJ0eUxrUmxjR1Z1WkdWdVkza3VjSEp2ZEc5MGVYQmxMbU5vWVc1blpXUWdQU0JtZFc1amRHbHZiaUFvS1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHgwWm05eUlDaDJZWElnYVdRZ2FXNGdjMlZzWmk1ZlpHVndaVzVrWlc1MGMwSjVTV1FwWEc1Y2RGeDBjMlZzWmk1ZlpHVndaVzVrWlc1MGMwSjVTV1JiYVdSZExtbHVkbUZzYVdSaGRHVW9LVHRjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJMlJsY0dWdVpHVnVZM2xmYUdGelpHVndaVzVrWlc1MGMxeHVYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRlJ5ZFdVZ2FXWWdkR2hwY3lCRVpYQmxibVJsYm1ONUlHaGhjeUJ2Ym1VZ2IzSWdiVzl5WlNCa1pYQmxibVJsYm5RZ1EyOXRjSFYwWVhScGIyNXpMQ0IzYUdsamFDQjNiM1ZzWkNCaVpTQnBiblpoYkdsa1lYUmxaQ0JwWmlCMGFHbHpJRVJsY0dWdVpHVnVZM2tnZDJWeVpTQjBieUJqYUdGdVoyVXVYRzRnS2lCQWJHOWpkWE1nUTJ4cFpXNTBYRzRnS2lCQWNtVjBkWEp1Y3lCN1FtOXZiR1ZoYm4xY2JpQXFMMXh1VkhKaFkydHlMa1JsY0dWdVpHVnVZM2t1Y0hKdmRHOTBlWEJsTG1oaGMwUmxjR1Z1WkdWdWRITWdQU0JtZFc1amRHbHZiaUFvS1NCN1hHNWNkSFpoY2lCelpXeG1JRDBnZEdocGN6dGNibHgwWm05eUtIWmhjaUJwWkNCcGJpQnpaV3htTGw5a1pYQmxibVJsYm5SelFubEpaQ2xjYmx4MFhIUnlaWFIxY200Z2RISjFaVHRjYmx4MGNtVjBkWEp1SUdaaGJITmxPMXh1ZlR0Y2JseHVMeThnYUhSMGNEb3ZMMlJ2WTNNdWJXVjBaVzl5TG1OdmJTOGpkSEpoWTJ0bGNsOW1iSFZ6YUZ4dVhHNHZLaXBjYmlBcUlFQnpkVzF0WVhKNUlGQnliMk5sYzNNZ1lXeHNJSEpsWVdOMGFYWmxJSFZ3WkdGMFpYTWdhVzF0WldScFlYUmxiSGtnWVc1a0lHVnVjM1Z5WlNCMGFHRjBJR0ZzYkNCcGJuWmhiR2xrWVhSbFpDQmpiMjF3ZFhSaGRHbHZibk1nWVhKbElISmxjblZ1TGx4dUlDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dUlDb3ZYRzVVY21GamEzSXVabXgxYzJnZ1BTQm1kVzVqZEdsdmJpQW9iM0IwYVc5dWN5a2dlMXh1WEhSVWNtRmphM0l1WDNKMWJrWnNkWE5vS0hzZ1ptbHVhWE5vVTNsdVkyaHliMjV2ZFhOc2VUb2dkSEoxWlN4Y2JseDBYSFJjZEZ4MFhIUmNkRngwWEhSY2RGeDBYSFIwYUhKdmQwWnBjbk4wUlhKeWIzSTZJRzl3ZEdsdmJuTWdKaVlnYjNCMGFXOXVjeTVmZEdoeWIzZEdhWEp6ZEVWeWNtOXlJSDBwTzF4dWZUdGNibHh1THk4Z1VuVnVJR0ZzYkNCd1pXNWthVzVuSUdOdmJYQjFkR0YwYVc5dWN5QmhibVFnWVdaMFpYSkdiSFZ6YUNCallXeHNZbUZqYTNNdVhIUkpaaUIzWlNCM1pYSmxJRzV2ZENCallXeHNaV1JjYmk4dklHUnBjbVZqZEd4NUlIWnBZU0JVY21GamEzSXVabXgxYzJnc0lIUm9hWE1nYldGNUlISmxkSFZ5YmlCaVpXWnZjbVVnZEdobGVTZHlaU0JoYkd3Z1pHOXVaU0IwYnlCaGJHeHZkMXh1THk4Z2RHaGxJR1YyWlc1MElHeHZiM0FnZEc4Z2NuVnVJR0VnYkdsMGRHeGxJR0psWm05eVpTQmpiMjUwYVc1MWFXNW5MbHh1VkhKaFkydHlMbDl5ZFc1R2JIVnphQ0E5SUdaMWJtTjBhVzl1SUNodmNIUnBiMjV6S1NCN1hHNWNkQzh2SUZoWVdDQlhhR0YwSUhCaGNuUWdiMllnZEdobElHTnZiVzFsYm5RZ1ltVnNiM2NnYVhNZ2MzUnBiR3dnZEhKMVpUOGdLRmRsSUc1dklHeHZibWRsY2x4dVhIUXZMeUJvWVhabElGTndZWEpyS1Z4dVhIUXZMMXh1WEhRdkx5Qk9aWE4wWldRZ1pteDFjMmdnWTI5MWJHUWdjR3hoZFhOcFlteDVJR2hoY0hCbGJpQnBaaXdnYzJGNUxDQmhJR1pzZFhOb0lHTmhkWE5sYzF4dVhIUXZMeUJFVDAwZ2JYVjBZWFJwYjI0c0lIZG9hV05vSUdOaGRYTmxjeUJoSUZ3aVlteDFjbHdpSUdWMlpXNTBMQ0IzYUdsamFDQnlkVzV6SUdGdVhHNWNkQzh2SUdGd2NDQmxkbVZ1ZENCb1lXNWtiR1Z5SUhSb1lYUWdZMkZzYkhNZ1ZISmhZMnR5TG1ac2RYTm9MbHgwUVhRZ2RHaGxJRzF2YldWdWRGeHVYSFF2THlCVGNHRnlheUJpYkc5amEzTWdaWFpsYm5RZ2FHRnVaR3hsY25NZ1pIVnlhVzVuSUVSUFRTQnRkWFJoZEdsdmJpQmhibmwzWVhrc1hHNWNkQzh2SUdKbFkyRjFjMlVnZEdobElFeHBkbVZTWVc1blpTQjBjbVZsSUdsemJpZDBJSFpoYkdsa0xseDBRVzVrSUhkbElHUnZiaWQwSUdoaGRtVmNibHgwTHk4Z1lXNTVJSFZ6WldaMWJDQnViM1JwYjI0Z2IyWWdZU0J1WlhOMFpXUWdabXgxYzJndVhHNWNkQzh2WEc1Y2RDOHZJR2gwZEhCek9pOHZZWEJ3TG1GellXNWhMbU52YlM4d0x6RTFPVGt3T0RNek1ESTBOQzh6T0RVeE16Z3lNek00TlRaY2JseDBhV1lnS0dsdVJteDFjMmdwWEc1Y2RGeDBkR2h5YjNjZ2JtVjNJRVZ5Y205eUtGd2lRMkZ1SjNRZ1kyRnNiQ0JVY21GamEzSXVabXgxYzJnZ2QyaHBiR1VnWm14MWMyaHBibWRjSWlrN1hHNWNibHgwYVdZZ0tHbHVRMjl0Y0hWMFpTbGNibHgwWEhSMGFISnZkeUJ1WlhjZ1JYSnliM0lvWENKRFlXNG5kQ0JtYkhWemFDQnBibk5wWkdVZ1ZISmhZMnR5TG1GMWRHOXlkVzVjSWlrN1hHNWNibHgwYjNCMGFXOXVjeUE5SUc5d2RHbHZibk1nZkh3Z2UzMDdYRzVjYmx4MGFXNUdiSFZ6YUNBOUlIUnlkV1U3WEc1Y2RIZHBiR3hHYkhWemFDQTlJSFJ5ZFdVN1hHNWNkSFJvY205M1JtbHljM1JGY25KdmNpQTlJQ0VoSUc5d2RHbHZibk11ZEdoeWIzZEdhWEp6ZEVWeWNtOXlPMXh1WEc1Y2RIWmhjaUJ5WldOdmJYQjFkR1ZrUTI5MWJuUWdQU0F3TzF4dVhIUjJZWElnWm1sdWFYTm9aV1JVY25rZ1BTQm1ZV3h6WlR0Y2JseDBkSEo1SUh0Y2JseDBYSFIzYUdsc1pTQW9jR1Z1WkdsdVowTnZiWEIxZEdGMGFXOXVjeTVzWlc1bmRHZ2dmSHhjYmx4MFhIUmNkRngwWEhRZ1lXWjBaWEpHYkhWemFFTmhiR3hpWVdOcmN5NXNaVzVuZEdncElIdGNibHh1WEhSY2RGeDBMeThnY21WamIyMXdkWFJsSUdGc2JDQndaVzVrYVc1bklHTnZiWEIxZEdGMGFXOXVjMXh1WEhSY2RGeDBkMmhwYkdVZ0tIQmxibVJwYm1kRGIyMXdkWFJoZEdsdmJuTXViR1Z1WjNSb0tTQjdYRzVjZEZ4MFhIUmNkSFpoY2lCamIyMXdJRDBnY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1emFHbG1kQ2dwTzF4dVhIUmNkRngwWEhSamIyMXdMbDl5WldOdmJYQjFkR1VvS1R0Y2JseDBYSFJjZEZ4MGFXWWdLR052YlhBdVgyNWxaV1J6VW1WamIyMXdkWFJsS0NrcElIdGNibHgwWEhSY2RGeDBYSFJ3Wlc1a2FXNW5RMjl0Y0hWMFlYUnBiMjV6TG5WdWMyaHBablFvWTI5dGNDazdYRzVjZEZ4MFhIUmNkSDFjYmx4dVhIUmNkRngwWEhScFppQW9JU0J2Y0hScGIyNXpMbVpwYm1semFGTjVibU5vY205dWIzVnpiSGtnSmlZZ0t5dHlaV052YlhCMWRHVmtRMjkxYm5RZ1BpQXhNREF3S1NCN1hHNWNkRngwWEhSY2RGeDBabWx1YVhOb1pXUlVjbmtnUFNCMGNuVmxPMXh1WEhSY2RGeDBYSFJjZEhKbGRIVnlianRjYmx4MFhIUmNkRngwZlZ4dVhIUmNkRngwZlZ4dVhHNWNkRngwWEhScFppQW9ZV1owWlhKR2JIVnphRU5oYkd4aVlXTnJjeTVzWlc1bmRHZ3BJSHRjYmx4MFhIUmNkRngwTHk4Z1kyRnNiQ0J2Ym1VZ1lXWjBaWEpHYkhWemFDQmpZV3hzWW1GamF5d2dkMmhwWTJnZ2JXRjVYRzVjZEZ4MFhIUmNkQzh2SUdsdWRtRnNhV1JoZEdVZ2JXOXlaU0JqYjIxd2RYUmhkR2x2Ym5OY2JseDBYSFJjZEZ4MGRtRnlJR05pSUQwZ1lXWjBaWEpHYkhWemFFTmhiR3hpWVdOcmN5NXphR2xtZENncE8xeHVYSFJjZEZ4MFhIUjBjbmtnZTF4dVhIUmNkRngwWEhSY2RHTmlMbVp1TG1OaGJHd29ZMkl1WTNSNEtUdGNibHgwWEhSY2RGeDBmU0JqWVhSamFDQW9aU2tnZTF4dVhIUmNkRngwWEhSY2RGOTBhSEp2ZDA5eVRHOW5LRndpWVdaMFpYSkdiSFZ6YUZ3aUxDQmxLVHRjYmx4MFhIUmNkRngwZlZ4dVhIUmNkRngwZlZ4dVhIUmNkSDFjYmx4MFhIUm1hVzVwYzJobFpGUnllU0E5SUhSeWRXVTdYRzVjZEgwZ1ptbHVZV3hzZVNCN1hHNWNkRngwYVdZZ0tDRWdabWx1YVhOb1pXUlVjbmtwSUh0Y2JseDBYSFJjZEM4dklIZGxKM0psSUdWeWNtOXlhVzVuSUdSMVpTQjBieUIwYUhKdmQwWnBjbk4wUlhKeWIzSWdZbVZwYm1jZ2RISjFaUzVjYmx4MFhIUmNkR2x1Um14MWMyZ2dQU0JtWVd4elpUc2dMeThnYm1WbFpHVmtJR0psWm05eVpTQmpZV3hzYVc1bklHQlVjbUZqYTNJdVpteDFjMmdvS1dBZ1lXZGhhVzVjYmx4MFhIUmNkQzh2SUdacGJtbHphQ0JtYkhWemFHbHVaMXh1WEhSY2RGeDBWSEpoWTJ0eUxsOXlkVzVHYkhWemFDaDdYRzVjZEZ4MFhIUmNkR1pwYm1semFGTjVibU5vY205dWIzVnpiSGs2SUc5d2RHbHZibk11Wm1sdWFYTm9VM2x1WTJoeWIyNXZkWE5zZVN4Y2JseDBYSFJjZEZ4MGRHaHliM2RHYVhKemRFVnljbTl5T2lCbVlXeHpaVnh1WEhSY2RGeDBmU2s3WEc1Y2RGeDBmVnh1WEhSY2RIZHBiR3hHYkhWemFDQTlJR1poYkhObE8xeHVYSFJjZEdsdVJteDFjMmdnUFNCbVlXeHpaVHRjYmx4MFhIUnBaaUFvY0dWdVpHbHVaME52YlhCMWRHRjBhVzl1Y3k1c1pXNW5kR2dnZkh3Z1lXWjBaWEpHYkhWemFFTmhiR3hpWVdOcmN5NXNaVzVuZEdncElIdGNibHgwWEhSY2RDOHZJRmRsSjNKbElIbHBaV3hrYVc1bklHSmxZMkYxYzJVZ2QyVWdjbUZ1SUdFZ1luVnVZMmdnYjJZZ1kyOXRjSFYwWVhScGIyNXpJR0Z1WkNCM1pTQmhjbVZ1SjNSY2JseDBYSFJjZEM4dklISmxjWFZwY21Wa0lIUnZJR1pwYm1semFDQnplVzVqYUhKdmJtOTFjMng1TENCemJ5QjNaU2RrSUd4cGEyVWdkRzhnWjJsMlpTQjBhR1VnWlhabGJuUWdiRzl2Y0NCaFhHNWNkRngwWEhRdkx5QmphR0Z1WTJVdUlGZGxJSE5vYjNWc1pDQm1iSFZ6YUNCaFoyRnBiaUJ6YjI5dUxseHVYSFJjZEZ4MGFXWWdLRzl3ZEdsdmJuTXVabWx1YVhOb1UzbHVZMmh5YjI1dmRYTnNlU2tnZTF4dVhIUmNkRngwWEhSMGFISnZkeUJ1WlhjZ1JYSnliM0lvWENKemRHbHNiQ0JvWVhabElHMXZjbVVnZEc4Z1pHOC9YQ0lwTzF4MEx5OGdjMmh2ZFd4a2JpZDBJR2hoY0hCbGJseHVYSFJjZEZ4MGZWeHVYSFJjZEZ4MGMyVjBWR2x0Wlc5MWRDaHlaWEYxYVhKbFJteDFjMmdzSURFd0tUdGNibHgwWEhSOVhHNWNkSDFjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZZWFYwYjNKMWJseHVMeTljYmk4dklGSjFiaUJtS0NrdUlGSmxZMjl5WkNCcGRITWdaR1Z3Wlc1a1pXNWphV1Z6TGlCU1pYSjFiaUJwZENCM2FHVnVaWFpsY2lCMGFHVmNiaTh2SUdSbGNHVnVaR1Z1WTJsbGN5QmphR0Z1WjJVdVhHNHZMMXh1THk4Z1VtVjBkWEp1Y3lCaElHNWxkeUJEYjIxd2RYUmhkR2x2Yml3Z2QyaHBZMmdnYVhNZ1lXeHpieUJ3WVhOelpXUWdkRzhnWmk1Y2JpOHZYRzR2THlCTWFXNXJjeUIwYUdVZ1kyOXRjSFYwWVhScGIyNGdkRzhnZEdobElHTjFjbkpsYm5RZ1kyOXRjSFYwWVhScGIyNWNiaTh2SUhOdklIUm9ZWFFnYVhRZ2FYTWdjM1J2Y0hCbFpDQnBaaUIwYUdVZ1kzVnljbVZ1ZENCamIyMXdkWFJoZEdsdmJpQnBjeUJwYm5aaGJHbGtZWFJsWkM1Y2JseHVMeW9xWEc0Z0tpQkFZMkZzYkdKaFkyc2dWSEpoWTJ0eUxrTnZiWEIxZEdGMGFXOXVSblZ1WTNScGIyNWNiaUFxSUVCd1lYSmhiU0I3VkhKaFkydHlMa052YlhCMWRHRjBhVzl1ZlZ4dUlDb3ZYRzR2S2lwY2JpQXFJRUJ6ZFcxdFlYSjVJRkoxYmlCaElHWjFibU4wYVc5dUlHNXZkeUJoYm1RZ2NtVnlkVzRnYVhRZ2JHRjBaWElnZDJobGJtVjJaWElnYVhSeklHUmxjR1Z1WkdWdVkybGxjMXh1SUNvZ1kyaGhibWRsTGlCU1pYUjFjbTV6SUdFZ1EyOXRjSFYwWVhScGIyNGdiMkpxWldOMElIUm9ZWFFnWTJGdUlHSmxJSFZ6WldRZ2RHOGdjM1J2Y0NCdmNpQnZZbk5sY25abElIUm9aVnh1SUNvZ2NtVnlkVzV1YVc1bkxseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRVY21GamEzSXVRMjl0Y0hWMFlYUnBiMjVHZFc1amRHbHZibjBnY25WdVJuVnVZeUJVYUdVZ1puVnVZM1JwYjI0Z2RHOGdjblZ1TGlCSmRDQnlaV05sYVhabGMxeHVJQ29nYjI1bElHRnlaM1Z0Wlc1ME9pQjBhR1VnUTI5dGNIVjBZWFJwYjI0Z2IySnFaV04wSUhSb1lYUWdkMmxzYkNCaVpTQnlaWFIxY201bFpDNWNiaUFxSUVCd1lYSmhiU0I3VDJKcVpXTjBmU0JiYjNCMGFXOXVjMTFjYmlBcUlFQndZWEpoYlNCN1JuVnVZM1JwYjI1OUlHOXdkR2x2Ym5NdWIyNUZjbkp2Y2lCUGNIUnBiMjVoYkM0Z1ZHaGxJR1oxYm1OMGFXOXVJSFJ2SUhKMWJpQjNhR1Z1SUdGdUlHVnljbTl5WEc0Z0tpQm9ZWEJ3Wlc1eklHbHVJSFJvWlNCRGIyMXdkWFJoZEdsdmJpNGdWR2hsSUc5dWJIa2dZWEpuZFcxbGJuUWdhWFFnY21WamFXVjJaWE1nYVhNZ2RHaGxJRVZ5Y205eVhHNGdLaUIwYUhKdmQyNHVJRVJsWm1GMWJIUnpJSFJ2SUhSb1pTQmxjbkp2Y2lCaVpXbHVaeUJzYjJkblpXUWdkRzhnZEdobElHTnZibk52YkdVdVhHNGdLaUJBY21WMGRYSnVjeUI3VkhKaFkydHlMa052YlhCMWRHRjBhVzl1ZlZ4dUlDb3ZYRzVVY21GamEzSXVZWFYwYjNKMWJpQTlJR1oxYm1OMGFXOXVJQ2htTENCdmNIUnBiMjV6TENCamRIZ3BJSHRjYmx4MGFXWWdLSFI1Y0dWdlppQm1JQ0U5UFNBblpuVnVZM1JwYjI0bktWeHVYSFJjZEhSb2NtOTNJRzVsZHlCRmNuSnZjaWduVkhKaFkydHlMbUYxZEc5eWRXNGdjbVZ4ZFdseVpYTWdZU0JtZFc1amRHbHZiaUJoY21kMWJXVnVkQ2NwTzF4dVhHNWNkRzl3ZEdsdmJuTWdQU0J2Y0hScGIyNXpJSHg4SUh0OU8xeHVYSFJwWmlBb1kzUjRLU0J2Y0hScGIyNXpMbU52Ym5SbGVIUWdQU0JqZEhnN1hHNWNibHgwWTI5dWMzUnlkV04wYVc1blEyOXRjSFYwWVhScGIyNGdQU0IwY25WbE8xeHVYSFIyWVhJZ1l5QTlJRzVsZHlCVWNtRmphM0l1UTI5dGNIVjBZWFJwYjI0b1hHNWNkRngwWml3Z1ZISmhZMnR5TG1OMWNuSmxiblJEYjIxd2RYUmhkR2x2Yml3Z2IzQjBhVzl1Y3lrN1hHNWNibHgwYVdZZ0tGUnlZV05yY2k1aFkzUnBkbVVwWEc1Y2RGeDBWSEpoWTJ0eUxtOXVTVzUyWVd4cFpHRjBaU2htZFc1amRHbHZiaUFvS1NCN1hHNWNkRngwWEhSakxuTjBiM0FvS1R0Y2JseDBYSFI5S1R0Y2JseHVYSFJ5WlhSMWNtNGdZenRjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZibTl1Y21WaFkzUnBkbVZjYmk4dlhHNHZMeUJTZFc0Z1lHWmdJSGRwZEdnZ2JtOGdZM1Z5Y21WdWRDQmpiMjF3ZFhSaGRHbHZiaXdnY21WMGRYSnVhVzVuSUhSb1pTQnlaWFIxY200Z2RtRnNkV1ZjYmk4dklHOW1JR0JtWUM1Y2RGVnpaV1FnZEc4Z2RIVnliaUJ2Wm1ZZ2NtVmhZM1JwZG1sMGVTQm1iM0lnZEdobElHUjFjbUYwYVc5dUlHOW1JR0JtWUN4Y2JpOHZJSE52SUhSb1lYUWdjbVZoWTNScGRtVWdaR0YwWVNCemIzVnlZMlZ6SUdGalkyVnpjMlZrSUdKNUlHQm1ZQ0IzYVd4c0lHNXZkQ0J5WlhOMWJIUWdhVzRnWVc1NVhHNHZMeUJqYjIxd2RYUmhkR2x2Ym5NZ1ltVnBibWNnYVc1MllXeHBaR0YwWldRdVhHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVblZ1SUdFZ1puVnVZM1JwYjI0Z2QybDBhRzkxZENCMGNtRmphMmx1WnlCa1pYQmxibVJsYm1OcFpYTXVYRzRnS2lCQWJHOWpkWE1nUTJ4cFpXNTBYRzRnS2lCQWNHRnlZVzBnZTBaMWJtTjBhVzl1ZlNCbWRXNWpJRUVnWm5WdVkzUnBiMjRnZEc4Z1kyRnNiQ0JwYlcxbFpHbGhkR1ZzZVM1Y2JpQXFMMXh1VkhKaFkydHlMbTV2YmxKbFlXTjBhWFpsSUQxY2JsUnlZV05yY2k1dWIyNXlaV0ZqZEdsMlpTQTlJR1oxYm1OMGFXOXVJQ2htTENCamRIZ3BJSHRjYmx4MGRtRnlJSEJ5WlhacGIzVnpJRDBnVkhKaFkydHlMbU4xY25KbGJuUkRiMjF3ZFhSaGRHbHZianRjYmx4MGMyVjBRM1Z5Y21WdWRFTnZiWEIxZEdGMGFXOXVLRzUxYkd3cE8xeHVYSFIwY25rZ2UxeHVYSFJjZEhKbGRIVnliaUJtTG1OaGJHd29ZM1I0S1R0Y2JseDBmU0JtYVc1aGJHeDVJSHRjYmx4MFhIUnpaWFJEZFhKeVpXNTBRMjl0Y0hWMFlYUnBiMjRvY0hKbGRtbHZkWE1wTzF4dVhIUjlYRzU5TzF4dVhHNHZMeUJzYVd0bElHNXZibkpsWVdOMGFYWmxJR0oxZENCdFlXdGxjeUJoSUdaMWJtTjBhVzl1SUdsdWMzUmxZV1JjYmxSeVlXTnJjaTV1YjI1U1pXRmpkR0ZpYkdVZ1BWeHVWSEpoWTJ0eUxtNXZibkpsWVdOMFlXSnNaU0E5SUdaMWJtTjBhVzl1SUNobUxDQmpkSGdwSUh0Y2JseDBjbVYwZFhKdUlHWjFibU4wYVc5dUtDa2dlMXh1WEhSY2RIWmhjaUJoY21keklEMGdZWEpuZFcxbGJuUnpPMXh1WEhSY2RHbG1JQ2hqZEhnZ1BUMGdiblZzYkNrZ1kzUjRJRDBnZEdocGN6dGNibHgwWEhSeVpYUjFjbTRnVkhKaFkydHlMbTV2Ym5KbFlXTjBhWFpsS0daMWJtTjBhVzl1S0NrZ2UxeHVYSFJjZEZ4MGNtVjBkWEp1SUdZdVlYQndiSGtvWTNSNExDQmhjbWR6S1R0Y2JseDBYSFI5S1R0Y2JseDBmVHRjYm4wN1hHNWNiaTh2SUdoMGRIQTZMeTlrYjJOekxtMWxkR1Z2Y2k1amIyMHZJM1J5WVdOclpYSmZiMjVwYm5aaGJHbGtZWFJsWEc1Y2JpOHFLbHh1SUNvZ1FITjFiVzFoY25rZ1VtVm5hWE4wWlhKeklHRWdibVYzSUZ0Z2IyNUpiblpoYkdsa1lYUmxZRjBvSTJOdmJYQjFkR0YwYVc5dVgyOXVhVzUyWVd4cFpHRjBaU2tnWTJGc2JHSmhZMnNnYjI0Z2RHaGxJR04xY25KbGJuUWdZMjl0Y0hWMFlYUnBiMjRnS0hkb2FXTm9JRzExYzNRZ1pYaHBjM1FwTENCMGJ5QmlaU0JqWVd4c1pXUWdhVzF0WldScFlYUmxiSGtnZDJobGJpQjBhR1VnWTNWeWNtVnVkQ0JqYjIxd2RYUmhkR2x2YmlCcGN5QnBiblpoYkdsa1lYUmxaQ0J2Y2lCemRHOXdjR1ZrTGx4dUlDb2dRR3h2WTNWeklFTnNhV1Z1ZEZ4dUlDb2dRSEJoY21GdElIdEdkVzVqZEdsdmJuMGdZMkZzYkdKaFkyc2dRU0JqWVd4c1ltRmpheUJtZFc1amRHbHZiaUIwYUdGMElIZHBiR3dnWW1VZ2FXNTJiMnRsWkNCaGN5QmdablZ1WXloaktXQXNJSGRvWlhKbElHQmpZQ0JwY3lCMGFHVWdZMjl0Y0hWMFlYUnBiMjRnYjI0Z2QyaHBZMmdnZEdobElHTmhiR3hpWVdOcklHbHpJSEpsWjJsemRHVnlaV1F1WEc0Z0tpOWNibFJ5WVdOcmNpNXZia2x1ZG1Gc2FXUmhkR1VnUFNCbWRXNWpkR2x2YmlBb1ppd2dZM1I0S1NCN1hHNWNkR2xtSUNnaElGUnlZV05yY2k1aFkzUnBkbVVwWEc1Y2RGeDBkR2h5YjNjZ2JtVjNJRVZ5Y205eUtGd2lWSEpoWTJ0eUxtOXVTVzUyWVd4cFpHRjBaU0J5WlhGMWFYSmxjeUJoSUdOMWNuSmxiblJEYjIxd2RYUmhkR2x2Ymx3aUtUdGNibHh1WEhSVWNtRmphM0l1WTNWeWNtVnVkRU52YlhCMWRHRjBhVzl1TG05dVNXNTJZV3hwWkdGMFpTaG1MQ0JqZEhncE8xeHVmVHRjYmx4dUx5OGdhSFIwY0RvdkwyUnZZM011YldWMFpXOXlMbU52YlM4amRISmhZMnRsY2w5aFpuUmxjbVpzZFhOb1hHNWNiaThxS2x4dUlDb2dRSE4xYlcxaGNua2dVMk5vWldSMWJHVnpJR0VnWm5WdVkzUnBiMjRnZEc4Z1ltVWdZMkZzYkdWa0lHUjFjbWx1WnlCMGFHVWdibVY0ZENCbWJIVnphQ3dnYjNJZ2JHRjBaWElnYVc0Z2RHaGxJR04xY25KbGJuUWdabXgxYzJnZ2FXWWdiMjVsSUdseklHbHVJSEJ5YjJkeVpYTnpMQ0JoWm5SbGNpQmhiR3dnYVc1MllXeHBaR0YwWldRZ1kyOXRjSFYwWVhScGIyNXpJR2hoZG1VZ1ltVmxiaUJ5WlhKMWJpNWNkRlJvWlNCbWRXNWpkR2x2YmlCM2FXeHNJR0psSUhKMWJpQnZibU5sSUdGdVpDQnViM1FnYjI0Z2MzVmljMlZ4ZFdWdWRDQm1iSFZ6YUdWeklIVnViR1Z6Y3lCZ1lXWjBaWEpHYkhWemFHQWdhWE1nWTJGc2JHVmtJR0ZuWVdsdUxseHVJQ29nUUd4dlkzVnpJRU5zYVdWdWRGeHVJQ29nUUhCaGNtRnRJSHRHZFc1amRHbHZibjBnWTJGc2JHSmhZMnNnUVNCbWRXNWpkR2x2YmlCMGJ5QmpZV3hzSUdGMElHWnNkWE5vSUhScGJXVXVYRzRnS2k5Y2JsUnlZV05yY2k1aFpuUmxja1pzZFhOb0lEMGdablZ1WTNScGIyNGdLR1lzSUdOMGVDa2dlMXh1WEhSaFpuUmxja1pzZFhOb1EyRnNiR0poWTJ0ekxuQjFjMmdvZXlCbWJqb2daaXdnWTNSNE9pQmpkSGdnZlNrN1hHNWNkSEpsY1hWcGNtVkdiSFZ6YUNncE8xeHVmVHRjYmlKZGZRPT0iLCIvLyAgICAgVW5kZXJzY29yZS5qcyAxLjguM1xuLy8gICAgIGh0dHA6Ly91bmRlcnNjb3JlanMub3JnXG4vLyAgICAgKGMpIDIwMDktMjAxNSBKZXJlbXkgQXNoa2VuYXMsIERvY3VtZW50Q2xvdWQgYW5kIEludmVzdGlnYXRpdmUgUmVwb3J0ZXJzICYgRWRpdG9yc1xuLy8gICAgIFVuZGVyc2NvcmUgbWF5IGJlIGZyZWVseSBkaXN0cmlidXRlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG5cbihmdW5jdGlvbigpIHtcblxuICAvLyBCYXNlbGluZSBzZXR1cFxuICAvLyAtLS0tLS0tLS0tLS0tLVxuXG4gIC8vIEVzdGFibGlzaCB0aGUgcm9vdCBvYmplY3QsIGB3aW5kb3dgIGluIHRoZSBicm93c2VyLCBvciBgZXhwb3J0c2Agb24gdGhlIHNlcnZlci5cbiAgdmFyIHJvb3QgPSB0aGlzO1xuXG4gIC8vIFNhdmUgdGhlIHByZXZpb3VzIHZhbHVlIG9mIHRoZSBgX2AgdmFyaWFibGUuXG4gIHZhciBwcmV2aW91c1VuZGVyc2NvcmUgPSByb290Ll87XG5cbiAgLy8gU2F2ZSBieXRlcyBpbiB0aGUgbWluaWZpZWQgKGJ1dCBub3QgZ3ppcHBlZCkgdmVyc2lvbjpcbiAgdmFyIEFycmF5UHJvdG8gPSBBcnJheS5wcm90b3R5cGUsIE9ialByb3RvID0gT2JqZWN0LnByb3RvdHlwZSwgRnVuY1Byb3RvID0gRnVuY3Rpb24ucHJvdG90eXBlO1xuXG4gIC8vIENyZWF0ZSBxdWljayByZWZlcmVuY2UgdmFyaWFibGVzIGZvciBzcGVlZCBhY2Nlc3MgdG8gY29yZSBwcm90b3R5cGVzLlxuICB2YXJcbiAgICBwdXNoICAgICAgICAgICAgID0gQXJyYXlQcm90by5wdXNoLFxuICAgIHNsaWNlICAgICAgICAgICAgPSBBcnJheVByb3RvLnNsaWNlLFxuICAgIHRvU3RyaW5nICAgICAgICAgPSBPYmpQcm90by50b1N0cmluZyxcbiAgICBoYXNPd25Qcm9wZXJ0eSAgID0gT2JqUHJvdG8uaGFzT3duUHJvcGVydHk7XG5cbiAgLy8gQWxsICoqRUNNQVNjcmlwdCA1KiogbmF0aXZlIGZ1bmN0aW9uIGltcGxlbWVudGF0aW9ucyB0aGF0IHdlIGhvcGUgdG8gdXNlXG4gIC8vIGFyZSBkZWNsYXJlZCBoZXJlLlxuICB2YXJcbiAgICBuYXRpdmVJc0FycmF5ICAgICAgPSBBcnJheS5pc0FycmF5LFxuICAgIG5hdGl2ZUtleXMgICAgICAgICA9IE9iamVjdC5rZXlzLFxuICAgIG5hdGl2ZUJpbmQgICAgICAgICA9IEZ1bmNQcm90by5iaW5kLFxuICAgIG5hdGl2ZUNyZWF0ZSAgICAgICA9IE9iamVjdC5jcmVhdGU7XG5cbiAgLy8gTmFrZWQgZnVuY3Rpb24gcmVmZXJlbmNlIGZvciBzdXJyb2dhdGUtcHJvdG90eXBlLXN3YXBwaW5nLlxuICB2YXIgQ3RvciA9IGZ1bmN0aW9uKCl7fTtcblxuICAvLyBDcmVhdGUgYSBzYWZlIHJlZmVyZW5jZSB0byB0aGUgVW5kZXJzY29yZSBvYmplY3QgZm9yIHVzZSBiZWxvdy5cbiAgdmFyIF8gPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAob2JqIGluc3RhbmNlb2YgXykgcmV0dXJuIG9iajtcbiAgICBpZiAoISh0aGlzIGluc3RhbmNlb2YgXykpIHJldHVybiBuZXcgXyhvYmopO1xuICAgIHRoaXMuX3dyYXBwZWQgPSBvYmo7XG4gIH07XG5cbiAgLy8gRXhwb3J0IHRoZSBVbmRlcnNjb3JlIG9iamVjdCBmb3IgKipOb2RlLmpzKiosIHdpdGhcbiAgLy8gYmFja3dhcmRzLWNvbXBhdGliaWxpdHkgZm9yIHRoZSBvbGQgYHJlcXVpcmUoKWAgQVBJLiBJZiB3ZSdyZSBpblxuICAvLyB0aGUgYnJvd3NlciwgYWRkIGBfYCBhcyBhIGdsb2JhbCBvYmplY3QuXG4gIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZiAodHlwZW9mIG1vZHVsZSAhPT0gJ3VuZGVmaW5lZCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICAgIGV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IF87XG4gICAgfVxuICAgIGV4cG9ydHMuXyA9IF87XG4gIH0gZWxzZSB7XG4gICAgcm9vdC5fID0gXztcbiAgfVxuXG4gIC8vIEN1cnJlbnQgdmVyc2lvbi5cbiAgXy5WRVJTSU9OID0gJzEuOC4zJztcblxuICAvLyBJbnRlcm5hbCBmdW5jdGlvbiB0aGF0IHJldHVybnMgYW4gZWZmaWNpZW50IChmb3IgY3VycmVudCBlbmdpbmVzKSB2ZXJzaW9uXG4gIC8vIG9mIHRoZSBwYXNzZWQtaW4gY2FsbGJhY2ssIHRvIGJlIHJlcGVhdGVkbHkgYXBwbGllZCBpbiBvdGhlciBVbmRlcnNjb3JlXG4gIC8vIGZ1bmN0aW9ucy5cbiAgdmFyIG9wdGltaXplQ2IgPSBmdW5jdGlvbihmdW5jLCBjb250ZXh0LCBhcmdDb3VudCkge1xuICAgIGlmIChjb250ZXh0ID09PSB2b2lkIDApIHJldHVybiBmdW5jO1xuICAgIHN3aXRjaCAoYXJnQ291bnQgPT0gbnVsbCA/IDMgOiBhcmdDb3VudCkge1xuICAgICAgY2FzZSAxOiByZXR1cm4gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSk7XG4gICAgICB9O1xuICAgICAgY2FzZSAyOiByZXR1cm4gZnVuY3Rpb24odmFsdWUsIG90aGVyKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmNhbGwoY29udGV4dCwgdmFsdWUsIG90aGVyKTtcbiAgICAgIH07XG4gICAgICBjYXNlIDM6IHJldHVybiBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pO1xuICAgICAgfTtcbiAgICAgIGNhc2UgNDogcmV0dXJuIGZ1bmN0aW9uKGFjY3VtdWxhdG9yLCB2YWx1ZSwgaW5kZXgsIGNvbGxlY3Rpb24pIHtcbiAgICAgICAgcmV0dXJuIGZ1bmMuY2FsbChjb250ZXh0LCBhY2N1bXVsYXRvciwgdmFsdWUsIGluZGV4LCBjb2xsZWN0aW9uKTtcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgIHJldHVybiBmdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfTtcblxuICAvLyBBIG1vc3RseS1pbnRlcm5hbCBmdW5jdGlvbiB0byBnZW5lcmF0ZSBjYWxsYmFja3MgdGhhdCBjYW4gYmUgYXBwbGllZFxuICAvLyB0byBlYWNoIGVsZW1lbnQgaW4gYSBjb2xsZWN0aW9uLCByZXR1cm5pbmcgdGhlIGRlc2lyZWQgcmVzdWx0IOKAlCBlaXRoZXJcbiAgLy8gaWRlbnRpdHksIGFuIGFyYml0cmFyeSBjYWxsYmFjaywgYSBwcm9wZXJ0eSBtYXRjaGVyLCBvciBhIHByb3BlcnR5IGFjY2Vzc29yLlxuICB2YXIgY2IgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCwgYXJnQ291bnQpIHtcbiAgICBpZiAodmFsdWUgPT0gbnVsbCkgcmV0dXJuIF8uaWRlbnRpdHk7XG4gICAgaWYgKF8uaXNGdW5jdGlvbih2YWx1ZSkpIHJldHVybiBvcHRpbWl6ZUNiKHZhbHVlLCBjb250ZXh0LCBhcmdDb3VudCk7XG4gICAgaWYgKF8uaXNPYmplY3QodmFsdWUpKSByZXR1cm4gXy5tYXRjaGVyKHZhbHVlKTtcbiAgICByZXR1cm4gXy5wcm9wZXJ0eSh2YWx1ZSk7XG4gIH07XG4gIF8uaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBjYih2YWx1ZSwgY29udGV4dCwgSW5maW5pdHkpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhc3NpZ25lciBmdW5jdGlvbnMuXG4gIHZhciBjcmVhdGVBc3NpZ25lciA9IGZ1bmN0aW9uKGtleXNGdW5jLCB1bmRlZmluZWRPbmx5KSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaikge1xuICAgICAgdmFyIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICBpZiAobGVuZ3RoIDwgMiB8fCBvYmogPT0gbnVsbCkgcmV0dXJuIG9iajtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMTsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgdmFyIHNvdXJjZSA9IGFyZ3VtZW50c1tpbmRleF0sXG4gICAgICAgICAgICBrZXlzID0ga2V5c0Z1bmMoc291cmNlKSxcbiAgICAgICAgICAgIGwgPSBrZXlzLmxlbmd0aDtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICBpZiAoIXVuZGVmaW5lZE9ubHkgfHwgb2JqW2tleV0gPT09IHZvaWQgMCkgb2JqW2tleV0gPSBzb3VyY2Vba2V5XTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgcmV0dXJuIG9iajtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIGZvciBjcmVhdGluZyBhIG5ldyBvYmplY3QgdGhhdCBpbmhlcml0cyBmcm9tIGFub3RoZXIuXG4gIHZhciBiYXNlQ3JlYXRlID0gZnVuY3Rpb24ocHJvdG90eXBlKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KHByb3RvdHlwZSkpIHJldHVybiB7fTtcbiAgICBpZiAobmF0aXZlQ3JlYXRlKSByZXR1cm4gbmF0aXZlQ3JlYXRlKHByb3RvdHlwZSk7XG4gICAgQ3Rvci5wcm90b3R5cGUgPSBwcm90b3R5cGU7XG4gICAgdmFyIHJlc3VsdCA9IG5ldyBDdG9yO1xuICAgIEN0b3IucHJvdG90eXBlID0gbnVsbDtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIHZhciBwcm9wZXJ0eSA9IGZ1bmN0aW9uKGtleSkge1xuICAgIHJldHVybiBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBvYmogPT0gbnVsbCA/IHZvaWQgMCA6IG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gSGVscGVyIGZvciBjb2xsZWN0aW9uIG1ldGhvZHMgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgYSBjb2xsZWN0aW9uXG4gIC8vIHNob3VsZCBiZSBpdGVyYXRlZCBhcyBhbiBhcnJheSBvciBhcyBhbiBvYmplY3RcbiAgLy8gUmVsYXRlZDogaHR0cDovL3Blb3BsZS5tb3ppbGxhLm9yZy9+am9yZW5kb3JmZi9lczYtZHJhZnQuaHRtbCNzZWMtdG9sZW5ndGhcbiAgLy8gQXZvaWRzIGEgdmVyeSBuYXN0eSBpT1MgOCBKSVQgYnVnIG9uIEFSTS02NC4gIzIwOTRcbiAgdmFyIE1BWF9BUlJBWV9JTkRFWCA9IE1hdGgucG93KDIsIDUzKSAtIDE7XG4gIHZhciBnZXRMZW5ndGggPSBwcm9wZXJ0eSgnbGVuZ3RoJyk7XG4gIHZhciBpc0FycmF5TGlrZSA9IGZ1bmN0aW9uKGNvbGxlY3Rpb24pIHtcbiAgICB2YXIgbGVuZ3RoID0gZ2V0TGVuZ3RoKGNvbGxlY3Rpb24pO1xuICAgIHJldHVybiB0eXBlb2YgbGVuZ3RoID09ICdudW1iZXInICYmIGxlbmd0aCA+PSAwICYmIGxlbmd0aCA8PSBNQVhfQVJSQVlfSU5ERVg7XG4gIH07XG5cbiAgLy8gQ29sbGVjdGlvbiBGdW5jdGlvbnNcbiAgLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuICAvLyBUaGUgY29ybmVyc3RvbmUsIGFuIGBlYWNoYCBpbXBsZW1lbnRhdGlvbiwgYWthIGBmb3JFYWNoYC5cbiAgLy8gSGFuZGxlcyByYXcgb2JqZWN0cyBpbiBhZGRpdGlvbiB0byBhcnJheS1saWtlcy4gVHJlYXRzIGFsbFxuICAvLyBzcGFyc2UgYXJyYXktbGlrZXMgYXMgaWYgdGhleSB3ZXJlIGRlbnNlLlxuICBfLmVhY2ggPSBfLmZvckVhY2ggPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIgaSwgbGVuZ3RoO1xuICAgIGlmIChpc0FycmF5TGlrZShvYmopKSB7XG4gICAgICBmb3IgKGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaXRlcmF0ZWUob2JqW2ldLCBpLCBvYmopO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgICAgZm9yIChpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBpdGVyYXRlZShvYmpba2V5c1tpXV0sIGtleXNbaV0sIG9iaik7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRlZSB0byBlYWNoIGVsZW1lbnQuXG4gIF8ubWFwID0gXy5jb2xsZWN0ID0gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoLFxuICAgICAgICByZXN1bHRzID0gQXJyYXkobGVuZ3RoKTtcbiAgICBmb3IgKHZhciBpbmRleCA9IDA7IGluZGV4IDwgbGVuZ3RoOyBpbmRleCsrKSB7XG4gICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgcmVzdWx0c1tpbmRleF0gPSBpdGVyYXRlZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaik7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHRzO1xuICB9O1xuXG4gIC8vIENyZWF0ZSBhIHJlZHVjaW5nIGZ1bmN0aW9uIGl0ZXJhdGluZyBsZWZ0IG9yIHJpZ2h0LlxuICBmdW5jdGlvbiBjcmVhdGVSZWR1Y2UoZGlyKSB7XG4gICAgLy8gT3B0aW1pemVkIGl0ZXJhdG9yIGZ1bmN0aW9uIGFzIHVzaW5nIGFyZ3VtZW50cy5sZW5ndGhcbiAgICAvLyBpbiB0aGUgbWFpbiBmdW5jdGlvbiB3aWxsIGRlb3B0aW1pemUgdGhlLCBzZWUgIzE5OTEuXG4gICAgZnVuY3Rpb24gaXRlcmF0b3Iob2JqLCBpdGVyYXRlZSwgbWVtbywga2V5cywgaW5kZXgsIGxlbmd0aCkge1xuICAgICAgZm9yICg7IGluZGV4ID49IDAgJiYgaW5kZXggPCBsZW5ndGg7IGluZGV4ICs9IGRpcikge1xuICAgICAgICB2YXIgY3VycmVudEtleSA9IGtleXMgPyBrZXlzW2luZGV4XSA6IGluZGV4O1xuICAgICAgICBtZW1vID0gaXRlcmF0ZWUobWVtbywgb2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG1lbW87XG4gICAgfVxuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIG1lbW8sIGNvbnRleHQpIHtcbiAgICAgIGl0ZXJhdGVlID0gb3B0aW1pemVDYihpdGVyYXRlZSwgY29udGV4dCwgNCk7XG4gICAgICB2YXIga2V5cyA9ICFpc0FycmF5TGlrZShvYmopICYmIF8ua2V5cyhvYmopLFxuICAgICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoLFxuICAgICAgICAgIGluZGV4ID0gZGlyID4gMCA/IDAgOiBsZW5ndGggLSAxO1xuICAgICAgLy8gRGV0ZXJtaW5lIHRoZSBpbml0aWFsIHZhbHVlIGlmIG5vbmUgaXMgcHJvdmlkZWQuXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA8IDMpIHtcbiAgICAgICAgbWVtbyA9IG9ialtrZXlzID8ga2V5c1tpbmRleF0gOiBpbmRleF07XG4gICAgICAgIGluZGV4ICs9IGRpcjtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpdGVyYXRvcihvYmosIGl0ZXJhdGVlLCBtZW1vLCBrZXlzLCBpbmRleCwgbGVuZ3RoKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gKipSZWR1Y2UqKiBidWlsZHMgdXAgYSBzaW5nbGUgcmVzdWx0IGZyb20gYSBsaXN0IG9mIHZhbHVlcywgYWthIGBpbmplY3RgLFxuICAvLyBvciBgZm9sZGxgLlxuICBfLnJlZHVjZSA9IF8uZm9sZGwgPSBfLmluamVjdCA9IGNyZWF0ZVJlZHVjZSgxKTtcblxuICAvLyBUaGUgcmlnaHQtYXNzb2NpYXRpdmUgdmVyc2lvbiBvZiByZWR1Y2UsIGFsc28ga25vd24gYXMgYGZvbGRyYC5cbiAgXy5yZWR1Y2VSaWdodCA9IF8uZm9sZHIgPSBjcmVhdGVSZWR1Y2UoLTEpO1xuXG4gIC8vIFJldHVybiB0aGUgZmlyc3QgdmFsdWUgd2hpY2ggcGFzc2VzIGEgdHJ1dGggdGVzdC4gQWxpYXNlZCBhcyBgZGV0ZWN0YC5cbiAgXy5maW5kID0gXy5kZXRlY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHZhciBrZXk7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHtcbiAgICAgIGtleSA9IF8uZmluZEluZGV4KG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB9IGVsc2Uge1xuICAgICAga2V5ID0gXy5maW5kS2V5KG9iaiwgcHJlZGljYXRlLCBjb250ZXh0KTtcbiAgICB9XG4gICAgaWYgKGtleSAhPT0gdm9pZCAwICYmIGtleSAhPT0gLTEpIHJldHVybiBvYmpba2V5XTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYWxsIHRoZSBlbGVtZW50cyB0aGF0IHBhc3MgYSB0cnV0aCB0ZXN0LlxuICAvLyBBbGlhc2VkIGFzIGBzZWxlY3RgLlxuICBfLmZpbHRlciA9IF8uc2VsZWN0ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0cyA9IFtdO1xuICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICBpZiAocHJlZGljYXRlKHZhbHVlLCBpbmRleCwgbGlzdCkpIHJlc3VsdHMucHVzaCh2YWx1ZSk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGFsbCB0aGUgZWxlbWVudHMgZm9yIHdoaWNoIGEgdHJ1dGggdGVzdCBmYWlscy5cbiAgXy5yZWplY3QgPSBmdW5jdGlvbihvYmosIHByZWRpY2F0ZSwgY29udGV4dCkge1xuICAgIHJldHVybiBfLmZpbHRlcihvYmosIF8ubmVnYXRlKGNiKHByZWRpY2F0ZSkpLCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgd2hldGhlciBhbGwgb2YgdGhlIGVsZW1lbnRzIG1hdGNoIGEgdHJ1dGggdGVzdC5cbiAgLy8gQWxpYXNlZCBhcyBgYWxsYC5cbiAgXy5ldmVyeSA9IF8uYWxsID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICBpZiAoIXByZWRpY2F0ZShvYmpbY3VycmVudEtleV0sIGN1cnJlbnRLZXksIG9iaikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cbiAgLy8gRGV0ZXJtaW5lIGlmIGF0IGxlYXN0IG9uZSBlbGVtZW50IGluIHRoZSBvYmplY3QgbWF0Y2hlcyBhIHRydXRoIHRlc3QuXG4gIC8vIEFsaWFzZWQgYXMgYGFueWAuXG4gIF8uc29tZSA9IF8uYW55ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gIWlzQXJyYXlMaWtlKG9iaikgJiYgXy5rZXlzKG9iaiksXG4gICAgICAgIGxlbmd0aCA9IChrZXlzIHx8IG9iaikubGVuZ3RoO1xuICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgIHZhciBjdXJyZW50S2V5ID0ga2V5cyA/IGtleXNbaW5kZXhdIDogaW5kZXg7XG4gICAgICBpZiAocHJlZGljYXRlKG9ialtjdXJyZW50S2V5XSwgY3VycmVudEtleSwgb2JqKSkgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfTtcblxuICAvLyBEZXRlcm1pbmUgaWYgdGhlIGFycmF5IG9yIG9iamVjdCBjb250YWlucyBhIGdpdmVuIGl0ZW0gKHVzaW5nIGA9PT1gKS5cbiAgLy8gQWxpYXNlZCBhcyBgaW5jbHVkZXNgIGFuZCBgaW5jbHVkZWAuXG4gIF8uY29udGFpbnMgPSBfLmluY2x1ZGVzID0gXy5pbmNsdWRlID0gZnVuY3Rpb24ob2JqLCBpdGVtLCBmcm9tSW5kZXgsIGd1YXJkKSB7XG4gICAgaWYgKCFpc0FycmF5TGlrZShvYmopKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgIGlmICh0eXBlb2YgZnJvbUluZGV4ICE9ICdudW1iZXInIHx8IGd1YXJkKSBmcm9tSW5kZXggPSAwO1xuICAgIHJldHVybiBfLmluZGV4T2Yob2JqLCBpdGVtLCBmcm9tSW5kZXgpID49IDA7XG4gIH07XG5cbiAgLy8gSW52b2tlIGEgbWV0aG9kICh3aXRoIGFyZ3VtZW50cykgb24gZXZlcnkgaXRlbSBpbiBhIGNvbGxlY3Rpb24uXG4gIF8uaW52b2tlID0gZnVuY3Rpb24ob2JqLCBtZXRob2QpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICB2YXIgaXNGdW5jID0gXy5pc0Z1bmN0aW9uKG1ldGhvZCk7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgIHZhciBmdW5jID0gaXNGdW5jID8gbWV0aG9kIDogdmFsdWVbbWV0aG9kXTtcbiAgICAgIHJldHVybiBmdW5jID09IG51bGwgPyBmdW5jIDogZnVuYy5hcHBseSh2YWx1ZSwgYXJncyk7XG4gICAgfSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgbWFwYDogZmV0Y2hpbmcgYSBwcm9wZXJ0eS5cbiAgXy5wbHVjayA9IGZ1bmN0aW9uKG9iaiwga2V5KSB7XG4gICAgcmV0dXJuIF8ubWFwKG9iaiwgXy5wcm9wZXJ0eShrZXkpKTtcbiAgfTtcblxuICAvLyBDb252ZW5pZW5jZSB2ZXJzaW9uIG9mIGEgY29tbW9uIHVzZSBjYXNlIG9mIGBmaWx0ZXJgOiBzZWxlY3Rpbmcgb25seSBvYmplY3RzXG4gIC8vIGNvbnRhaW5pbmcgc3BlY2lmaWMgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8ud2hlcmUgPSBmdW5jdGlvbihvYmosIGF0dHJzKSB7XG4gICAgcmV0dXJuIF8uZmlsdGVyKG9iaiwgXy5tYXRjaGVyKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gQ29udmVuaWVuY2UgdmVyc2lvbiBvZiBhIGNvbW1vbiB1c2UgY2FzZSBvZiBgZmluZGA6IGdldHRpbmcgdGhlIGZpcnN0IG9iamVjdFxuICAvLyBjb250YWluaW5nIHNwZWNpZmljIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLmZpbmRXaGVyZSA9IGZ1bmN0aW9uKG9iaiwgYXR0cnMpIHtcbiAgICByZXR1cm4gXy5maW5kKG9iaiwgXy5tYXRjaGVyKGF0dHJzKSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIHRoZSBtYXhpbXVtIGVsZW1lbnQgKG9yIGVsZW1lbnQtYmFzZWQgY29tcHV0YXRpb24pLlxuICBfLm1heCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0gLUluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSAtSW5maW5pdHksXG4gICAgICAgIHZhbHVlLCBjb21wdXRlZDtcbiAgICBpZiAoaXRlcmF0ZWUgPT0gbnVsbCAmJiBvYmogIT0gbnVsbCkge1xuICAgICAgb2JqID0gaXNBcnJheUxpa2Uob2JqKSA/IG9iaiA6IF8udmFsdWVzKG9iaik7XG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gb2JqLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhbHVlID0gb2JqW2ldO1xuICAgICAgICBpZiAodmFsdWUgPiByZXN1bHQpIHtcbiAgICAgICAgICByZXN1bHQgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICAgIF8uZWFjaChvYmosIGZ1bmN0aW9uKHZhbHVlLCBpbmRleCwgbGlzdCkge1xuICAgICAgICBjb21wdXRlZCA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgbGlzdCk7XG4gICAgICAgIGlmIChjb21wdXRlZCA+IGxhc3RDb21wdXRlZCB8fCBjb21wdXRlZCA9PT0gLUluZmluaXR5ICYmIHJlc3VsdCA9PT0gLUluZmluaXR5KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgICAgbGFzdENvbXB1dGVkID0gY29tcHV0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbWluaW11bSBlbGVtZW50IChvciBlbGVtZW50LWJhc2VkIGNvbXB1dGF0aW9uKS5cbiAgXy5taW4gPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgdmFyIHJlc3VsdCA9IEluZmluaXR5LCBsYXN0Q29tcHV0ZWQgPSBJbmZpbml0eSxcbiAgICAgICAgdmFsdWUsIGNvbXB1dGVkO1xuICAgIGlmIChpdGVyYXRlZSA9PSBudWxsICYmIG9iaiAhPSBudWxsKSB7XG4gICAgICBvYmogPSBpc0FycmF5TGlrZShvYmopID8gb2JqIDogXy52YWx1ZXMob2JqKTtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBvYmoubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFsdWUgPSBvYmpbaV07XG4gICAgICAgIGlmICh2YWx1ZSA8IHJlc3VsdCkge1xuICAgICAgICAgIHJlc3VsdCA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgICAgXy5lYWNoKG9iaiwgZnVuY3Rpb24odmFsdWUsIGluZGV4LCBsaXN0KSB7XG4gICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KTtcbiAgICAgICAgaWYgKGNvbXB1dGVkIDwgbGFzdENvbXB1dGVkIHx8IGNvbXB1dGVkID09PSBJbmZpbml0eSAmJiByZXN1bHQgPT09IEluZmluaXR5KSB7XG4gICAgICAgICAgcmVzdWx0ID0gdmFsdWU7XG4gICAgICAgICAgbGFzdENvbXB1dGVkID0gY29tcHV0ZWQ7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIFNodWZmbGUgYSBjb2xsZWN0aW9uLCB1c2luZyB0aGUgbW9kZXJuIHZlcnNpb24gb2YgdGhlXG4gIC8vIFtGaXNoZXItWWF0ZXMgc2h1ZmZsZV0oaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9GaXNoZXLigJNZYXRlc19zaHVmZmxlKS5cbiAgXy5zaHVmZmxlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHNldCA9IGlzQXJyYXlMaWtlKG9iaikgPyBvYmogOiBfLnZhbHVlcyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBzZXQubGVuZ3RoO1xuICAgIHZhciBzaHVmZmxlZCA9IEFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaW5kZXggPSAwLCByYW5kOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgcmFuZCA9IF8ucmFuZG9tKDAsIGluZGV4KTtcbiAgICAgIGlmIChyYW5kICE9PSBpbmRleCkgc2h1ZmZsZWRbaW5kZXhdID0gc2h1ZmZsZWRbcmFuZF07XG4gICAgICBzaHVmZmxlZFtyYW5kXSA9IHNldFtpbmRleF07XG4gICAgfVxuICAgIHJldHVybiBzaHVmZmxlZDtcbiAgfTtcblxuICAvLyBTYW1wbGUgKipuKiogcmFuZG9tIHZhbHVlcyBmcm9tIGEgY29sbGVjdGlvbi5cbiAgLy8gSWYgKipuKiogaXMgbm90IHNwZWNpZmllZCwgcmV0dXJucyBhIHNpbmdsZSByYW5kb20gZWxlbWVudC5cbiAgLy8gVGhlIGludGVybmFsIGBndWFyZGAgYXJndW1lbnQgYWxsb3dzIGl0IHRvIHdvcmsgd2l0aCBgbWFwYC5cbiAgXy5zYW1wbGUgPSBmdW5jdGlvbihvYmosIG4sIGd1YXJkKSB7XG4gICAgaWYgKG4gPT0gbnVsbCB8fCBndWFyZCkge1xuICAgICAgaWYgKCFpc0FycmF5TGlrZShvYmopKSBvYmogPSBfLnZhbHVlcyhvYmopO1xuICAgICAgcmV0dXJuIG9ialtfLnJhbmRvbShvYmoubGVuZ3RoIC0gMSldO1xuICAgIH1cbiAgICByZXR1cm4gXy5zaHVmZmxlKG9iaikuc2xpY2UoMCwgTWF0aC5tYXgoMCwgbikpO1xuICB9O1xuXG4gIC8vIFNvcnQgdGhlIG9iamVjdCdzIHZhbHVlcyBieSBhIGNyaXRlcmlvbiBwcm9kdWNlZCBieSBhbiBpdGVyYXRlZS5cbiAgXy5zb3J0QnkgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgcmV0dXJuIF8ucGx1Y2soXy5tYXAob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgsIGxpc3QpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHZhbHVlOiB2YWx1ZSxcbiAgICAgICAgaW5kZXg6IGluZGV4LFxuICAgICAgICBjcml0ZXJpYTogaXRlcmF0ZWUodmFsdWUsIGluZGV4LCBsaXN0KVxuICAgICAgfTtcbiAgICB9KS5zb3J0KGZ1bmN0aW9uKGxlZnQsIHJpZ2h0KSB7XG4gICAgICB2YXIgYSA9IGxlZnQuY3JpdGVyaWE7XG4gICAgICB2YXIgYiA9IHJpZ2h0LmNyaXRlcmlhO1xuICAgICAgaWYgKGEgIT09IGIpIHtcbiAgICAgICAgaWYgKGEgPiBiIHx8IGEgPT09IHZvaWQgMCkgcmV0dXJuIDE7XG4gICAgICAgIGlmIChhIDwgYiB8fCBiID09PSB2b2lkIDApIHJldHVybiAtMTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBsZWZ0LmluZGV4IC0gcmlnaHQuaW5kZXg7XG4gICAgfSksICd2YWx1ZScpO1xuICB9O1xuXG4gIC8vIEFuIGludGVybmFsIGZ1bmN0aW9uIHVzZWQgZm9yIGFnZ3JlZ2F0ZSBcImdyb3VwIGJ5XCIgb3BlcmF0aW9ucy5cbiAgdmFyIGdyb3VwID0gZnVuY3Rpb24oYmVoYXZpb3IpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCk7XG4gICAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwgaW5kZXgpIHtcbiAgICAgICAgdmFyIGtleSA9IGl0ZXJhdGVlKHZhbHVlLCBpbmRleCwgb2JqKTtcbiAgICAgICAgYmVoYXZpb3IocmVzdWx0LCB2YWx1ZSwga2V5KTtcbiAgICAgIH0pO1xuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIEdyb3VwcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLiBQYXNzIGVpdGhlciBhIHN0cmluZyBhdHRyaWJ1dGVcbiAgLy8gdG8gZ3JvdXAgYnksIG9yIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSBjcml0ZXJpb24uXG4gIF8uZ3JvdXBCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIGlmIChfLmhhcyhyZXN1bHQsIGtleSkpIHJlc3VsdFtrZXldLnB1c2godmFsdWUpOyBlbHNlIHJlc3VsdFtrZXldID0gW3ZhbHVlXTtcbiAgfSk7XG5cbiAgLy8gSW5kZXhlcyB0aGUgb2JqZWN0J3MgdmFsdWVzIGJ5IGEgY3JpdGVyaW9uLCBzaW1pbGFyIHRvIGBncm91cEJ5YCwgYnV0IGZvclxuICAvLyB3aGVuIHlvdSBrbm93IHRoYXQgeW91ciBpbmRleCB2YWx1ZXMgd2lsbCBiZSB1bmlxdWUuXG4gIF8uaW5kZXhCeSA9IGdyb3VwKGZ1bmN0aW9uKHJlc3VsdCwgdmFsdWUsIGtleSkge1xuICAgIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gIH0pO1xuXG4gIC8vIENvdW50cyBpbnN0YW5jZXMgb2YgYW4gb2JqZWN0IHRoYXQgZ3JvdXAgYnkgYSBjZXJ0YWluIGNyaXRlcmlvbi4gUGFzc1xuICAvLyBlaXRoZXIgYSBzdHJpbmcgYXR0cmlidXRlIHRvIGNvdW50IGJ5LCBvciBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGVcbiAgLy8gY3JpdGVyaW9uLlxuICBfLmNvdW50QnkgPSBncm91cChmdW5jdGlvbihyZXN1bHQsIHZhbHVlLCBrZXkpIHtcbiAgICBpZiAoXy5oYXMocmVzdWx0LCBrZXkpKSByZXN1bHRba2V5XSsrOyBlbHNlIHJlc3VsdFtrZXldID0gMTtcbiAgfSk7XG5cbiAgLy8gU2FmZWx5IGNyZWF0ZSBhIHJlYWwsIGxpdmUgYXJyYXkgZnJvbSBhbnl0aGluZyBpdGVyYWJsZS5cbiAgXy50b0FycmF5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFvYmopIHJldHVybiBbXTtcbiAgICBpZiAoXy5pc0FycmF5KG9iaikpIHJldHVybiBzbGljZS5jYWxsKG9iaik7XG4gICAgaWYgKGlzQXJyYXlMaWtlKG9iaikpIHJldHVybiBfLm1hcChvYmosIF8uaWRlbnRpdHkpO1xuICAgIHJldHVybiBfLnZhbHVlcyhvYmopO1xuICB9O1xuXG4gIC8vIFJldHVybiB0aGUgbnVtYmVyIG9mIGVsZW1lbnRzIGluIGFuIG9iamVjdC5cbiAgXy5zaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gMDtcbiAgICByZXR1cm4gaXNBcnJheUxpa2Uob2JqKSA/IG9iai5sZW5ndGggOiBfLmtleXMob2JqKS5sZW5ndGg7XG4gIH07XG5cbiAgLy8gU3BsaXQgYSBjb2xsZWN0aW9uIGludG8gdHdvIGFycmF5czogb25lIHdob3NlIGVsZW1lbnRzIGFsbCBzYXRpc2Z5IHRoZSBnaXZlblxuICAvLyBwcmVkaWNhdGUsIGFuZCBvbmUgd2hvc2UgZWxlbWVudHMgYWxsIGRvIG5vdCBzYXRpc2Z5IHRoZSBwcmVkaWNhdGUuXG4gIF8ucGFydGl0aW9uID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBwYXNzID0gW10sIGZhaWwgPSBbXTtcbiAgICBfLmVhY2gob2JqLCBmdW5jdGlvbih2YWx1ZSwga2V5LCBvYmopIHtcbiAgICAgIChwcmVkaWNhdGUodmFsdWUsIGtleSwgb2JqKSA/IHBhc3MgOiBmYWlsKS5wdXNoKHZhbHVlKTtcbiAgICB9KTtcbiAgICByZXR1cm4gW3Bhc3MsIGZhaWxdO1xuICB9O1xuXG4gIC8vIEFycmF5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS1cblxuICAvLyBHZXQgdGhlIGZpcnN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGZpcnN0IE5cbiAgLy8gdmFsdWVzIGluIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgaGVhZGAgYW5kIGB0YWtlYC4gVGhlICoqZ3VhcmQqKiBjaGVja1xuICAvLyBhbGxvd3MgaXQgdG8gd29yayB3aXRoIGBfLm1hcGAuXG4gIF8uZmlyc3QgPSBfLmhlYWQgPSBfLnRha2UgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbMF07XG4gICAgcmV0dXJuIF8uaW5pdGlhbChhcnJheSwgYXJyYXkubGVuZ3RoIC0gbik7XG4gIH07XG5cbiAgLy8gUmV0dXJucyBldmVyeXRoaW5nIGJ1dCB0aGUgbGFzdCBlbnRyeSBvZiB0aGUgYXJyYXkuIEVzcGVjaWFsbHkgdXNlZnVsIG9uXG4gIC8vIHRoZSBhcmd1bWVudHMgb2JqZWN0LiBQYXNzaW5nICoqbioqIHdpbGwgcmV0dXJuIGFsbCB0aGUgdmFsdWVzIGluXG4gIC8vIHRoZSBhcnJheSwgZXhjbHVkaW5nIHRoZSBsYXN0IE4uXG4gIF8uaW5pdGlhbCA9IGZ1bmN0aW9uKGFycmF5LCBuLCBndWFyZCkge1xuICAgIHJldHVybiBzbGljZS5jYWxsKGFycmF5LCAwLCBNYXRoLm1heCgwLCBhcnJheS5sZW5ndGggLSAobiA9PSBudWxsIHx8IGd1YXJkID8gMSA6IG4pKSk7XG4gIH07XG5cbiAgLy8gR2V0IHRoZSBsYXN0IGVsZW1lbnQgb2YgYW4gYXJyYXkuIFBhc3NpbmcgKipuKiogd2lsbCByZXR1cm4gdGhlIGxhc3QgTlxuICAvLyB2YWx1ZXMgaW4gdGhlIGFycmF5LlxuICBfLmxhc3QgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICBpZiAoYXJyYXkgPT0gbnVsbCkgcmV0dXJuIHZvaWQgMDtcbiAgICBpZiAobiA9PSBudWxsIHx8IGd1YXJkKSByZXR1cm4gYXJyYXlbYXJyYXkubGVuZ3RoIC0gMV07XG4gICAgcmV0dXJuIF8ucmVzdChhcnJheSwgTWF0aC5tYXgoMCwgYXJyYXkubGVuZ3RoIC0gbikpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgZXZlcnl0aGluZyBidXQgdGhlIGZpcnN0IGVudHJ5IG9mIHRoZSBhcnJheS4gQWxpYXNlZCBhcyBgdGFpbGAgYW5kIGBkcm9wYC5cbiAgLy8gRXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGFyZ3VtZW50cyBvYmplY3QuIFBhc3NpbmcgYW4gKipuKiogd2lsbCByZXR1cm5cbiAgLy8gdGhlIHJlc3QgTiB2YWx1ZXMgaW4gdGhlIGFycmF5LlxuICBfLnJlc3QgPSBfLnRhaWwgPSBfLmRyb3AgPSBmdW5jdGlvbihhcnJheSwgbiwgZ3VhcmQpIHtcbiAgICByZXR1cm4gc2xpY2UuY2FsbChhcnJheSwgbiA9PSBudWxsIHx8IGd1YXJkID8gMSA6IG4pO1xuICB9O1xuXG4gIC8vIFRyaW0gb3V0IGFsbCBmYWxzeSB2YWx1ZXMgZnJvbSBhbiBhcnJheS5cbiAgXy5jb21wYWN0ID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgICByZXR1cm4gXy5maWx0ZXIoYXJyYXksIF8uaWRlbnRpdHkpO1xuICB9O1xuXG4gIC8vIEludGVybmFsIGltcGxlbWVudGF0aW9uIG9mIGEgcmVjdXJzaXZlIGBmbGF0dGVuYCBmdW5jdGlvbi5cbiAgdmFyIGZsYXR0ZW4gPSBmdW5jdGlvbihpbnB1dCwgc2hhbGxvdywgc3RyaWN0LCBzdGFydEluZGV4KSB7XG4gICAgdmFyIG91dHB1dCA9IFtdLCBpZHggPSAwO1xuICAgIGZvciAodmFyIGkgPSBzdGFydEluZGV4IHx8IDAsIGxlbmd0aCA9IGdldExlbmd0aChpbnB1dCk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgdmFyIHZhbHVlID0gaW5wdXRbaV07XG4gICAgICBpZiAoaXNBcnJheUxpa2UodmFsdWUpICYmIChfLmlzQXJyYXkodmFsdWUpIHx8IF8uaXNBcmd1bWVudHModmFsdWUpKSkge1xuICAgICAgICAvL2ZsYXR0ZW4gY3VycmVudCBsZXZlbCBvZiBhcnJheSBvciBhcmd1bWVudHMgb2JqZWN0XG4gICAgICAgIGlmICghc2hhbGxvdykgdmFsdWUgPSBmbGF0dGVuKHZhbHVlLCBzaGFsbG93LCBzdHJpY3QpO1xuICAgICAgICB2YXIgaiA9IDAsIGxlbiA9IHZhbHVlLmxlbmd0aDtcbiAgICAgICAgb3V0cHV0Lmxlbmd0aCArPSBsZW47XG4gICAgICAgIHdoaWxlIChqIDwgbGVuKSB7XG4gICAgICAgICAgb3V0cHV0W2lkeCsrXSA9IHZhbHVlW2orK107XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoIXN0cmljdCkge1xuICAgICAgICBvdXRwdXRbaWR4KytdID0gdmFsdWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBvdXRwdXQ7XG4gIH07XG5cbiAgLy8gRmxhdHRlbiBvdXQgYW4gYXJyYXksIGVpdGhlciByZWN1cnNpdmVseSAoYnkgZGVmYXVsdCksIG9yIGp1c3Qgb25lIGxldmVsLlxuICBfLmZsYXR0ZW4gPSBmdW5jdGlvbihhcnJheSwgc2hhbGxvdykge1xuICAgIHJldHVybiBmbGF0dGVuKGFycmF5LCBzaGFsbG93LCBmYWxzZSk7XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgdmVyc2lvbiBvZiB0aGUgYXJyYXkgdGhhdCBkb2VzIG5vdCBjb250YWluIHRoZSBzcGVjaWZpZWQgdmFsdWUocykuXG4gIF8ud2l0aG91dCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgcmV0dXJuIF8uZGlmZmVyZW5jZShhcnJheSwgc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpKTtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGEgZHVwbGljYXRlLWZyZWUgdmVyc2lvbiBvZiB0aGUgYXJyYXkuIElmIHRoZSBhcnJheSBoYXMgYWxyZWFkeVxuICAvLyBiZWVuIHNvcnRlZCwgeW91IGhhdmUgdGhlIG9wdGlvbiBvZiB1c2luZyBhIGZhc3RlciBhbGdvcml0aG0uXG4gIC8vIEFsaWFzZWQgYXMgYHVuaXF1ZWAuXG4gIF8udW5pcSA9IF8udW5pcXVlID0gZnVuY3Rpb24oYXJyYXksIGlzU29ydGVkLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIGlmICghXy5pc0Jvb2xlYW4oaXNTb3J0ZWQpKSB7XG4gICAgICBjb250ZXh0ID0gaXRlcmF0ZWU7XG4gICAgICBpdGVyYXRlZSA9IGlzU29ydGVkO1xuICAgICAgaXNTb3J0ZWQgPSBmYWxzZTtcbiAgICB9XG4gICAgaWYgKGl0ZXJhdGVlICE9IG51bGwpIGl0ZXJhdGVlID0gY2IoaXRlcmF0ZWUsIGNvbnRleHQpO1xuICAgIHZhciByZXN1bHQgPSBbXTtcbiAgICB2YXIgc2VlbiA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgoYXJyYXkpOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciB2YWx1ZSA9IGFycmF5W2ldLFxuICAgICAgICAgIGNvbXB1dGVkID0gaXRlcmF0ZWUgPyBpdGVyYXRlZSh2YWx1ZSwgaSwgYXJyYXkpIDogdmFsdWU7XG4gICAgICBpZiAoaXNTb3J0ZWQpIHtcbiAgICAgICAgaWYgKCFpIHx8IHNlZW4gIT09IGNvbXB1dGVkKSByZXN1bHQucHVzaCh2YWx1ZSk7XG4gICAgICAgIHNlZW4gPSBjb21wdXRlZDtcbiAgICAgIH0gZWxzZSBpZiAoaXRlcmF0ZWUpIHtcbiAgICAgICAgaWYgKCFfLmNvbnRhaW5zKHNlZW4sIGNvbXB1dGVkKSkge1xuICAgICAgICAgIHNlZW4ucHVzaChjb21wdXRlZCk7XG4gICAgICAgICAgcmVzdWx0LnB1c2godmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKCFfLmNvbnRhaW5zKHJlc3VsdCwgdmFsdWUpKSB7XG4gICAgICAgIHJlc3VsdC5wdXNoKHZhbHVlKTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBQcm9kdWNlIGFuIGFycmF5IHRoYXQgY29udGFpbnMgdGhlIHVuaW9uOiBlYWNoIGRpc3RpbmN0IGVsZW1lbnQgZnJvbSBhbGwgb2ZcbiAgLy8gdGhlIHBhc3NlZC1pbiBhcnJheXMuXG4gIF8udW5pb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gXy51bmlxKGZsYXR0ZW4oYXJndW1lbnRzLCB0cnVlLCB0cnVlKSk7XG4gIH07XG5cbiAgLy8gUHJvZHVjZSBhbiBhcnJheSB0aGF0IGNvbnRhaW5zIGV2ZXJ5IGl0ZW0gc2hhcmVkIGJldHdlZW4gYWxsIHRoZVxuICAvLyBwYXNzZWQtaW4gYXJyYXlzLlxuICBfLmludGVyc2VjdGlvbiA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgIHZhciBhcmdzTGVuZ3RoID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgaXRlbSA9IGFycmF5W2ldO1xuICAgICAgaWYgKF8uY29udGFpbnMocmVzdWx0LCBpdGVtKSkgY29udGludWU7XG4gICAgICBmb3IgKHZhciBqID0gMTsgaiA8IGFyZ3NMZW5ndGg7IGorKykge1xuICAgICAgICBpZiAoIV8uY29udGFpbnMoYXJndW1lbnRzW2pdLCBpdGVtKSkgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoaiA9PT0gYXJnc0xlbmd0aCkgcmVzdWx0LnB1c2goaXRlbSk7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgLy8gVGFrZSB0aGUgZGlmZmVyZW5jZSBiZXR3ZWVuIG9uZSBhcnJheSBhbmQgYSBudW1iZXIgb2Ygb3RoZXIgYXJyYXlzLlxuICAvLyBPbmx5IHRoZSBlbGVtZW50cyBwcmVzZW50IGluIGp1c3QgdGhlIGZpcnN0IGFycmF5IHdpbGwgcmVtYWluLlxuICBfLmRpZmZlcmVuY2UgPSBmdW5jdGlvbihhcnJheSkge1xuICAgIHZhciByZXN0ID0gZmxhdHRlbihhcmd1bWVudHMsIHRydWUsIHRydWUsIDEpO1xuICAgIHJldHVybiBfLmZpbHRlcihhcnJheSwgZnVuY3Rpb24odmFsdWUpe1xuICAgICAgcmV0dXJuICFfLmNvbnRhaW5zKHJlc3QsIHZhbHVlKTtcbiAgICB9KTtcbiAgfTtcblxuICAvLyBaaXAgdG9nZXRoZXIgbXVsdGlwbGUgbGlzdHMgaW50byBhIHNpbmdsZSBhcnJheSAtLSBlbGVtZW50cyB0aGF0IHNoYXJlXG4gIC8vIGFuIGluZGV4IGdvIHRvZ2V0aGVyLlxuICBfLnppcCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiBfLnVuemlwKGFyZ3VtZW50cyk7XG4gIH07XG5cbiAgLy8gQ29tcGxlbWVudCBvZiBfLnppcC4gVW56aXAgYWNjZXB0cyBhbiBhcnJheSBvZiBhcnJheXMgYW5kIGdyb3Vwc1xuICAvLyBlYWNoIGFycmF5J3MgZWxlbWVudHMgb24gc2hhcmVkIGluZGljZXNcbiAgXy51bnppcCA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgdmFyIGxlbmd0aCA9IGFycmF5ICYmIF8ubWF4KGFycmF5LCBnZXRMZW5ndGgpLmxlbmd0aCB8fCAwO1xuICAgIHZhciByZXN1bHQgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGxlbmd0aDsgaW5kZXgrKykge1xuICAgICAgcmVzdWx0W2luZGV4XSA9IF8ucGx1Y2soYXJyYXksIGluZGV4KTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBDb252ZXJ0cyBsaXN0cyBpbnRvIG9iamVjdHMuIFBhc3MgZWl0aGVyIGEgc2luZ2xlIGFycmF5IG9mIGBba2V5LCB2YWx1ZV1gXG4gIC8vIHBhaXJzLCBvciB0d28gcGFyYWxsZWwgYXJyYXlzIG9mIHRoZSBzYW1lIGxlbmd0aCAtLSBvbmUgb2Yga2V5cywgYW5kIG9uZSBvZlxuICAvLyB0aGUgY29ycmVzcG9uZGluZyB2YWx1ZXMuXG4gIF8ub2JqZWN0ID0gZnVuY3Rpb24obGlzdCwgdmFsdWVzKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBnZXRMZW5ndGgobGlzdCk7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgaWYgKHZhbHVlcykge1xuICAgICAgICByZXN1bHRbbGlzdFtpXV0gPSB2YWx1ZXNbaV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHRbbGlzdFtpXVswXV0gPSBsaXN0W2ldWzFdO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9O1xuXG4gIC8vIEdlbmVyYXRvciBmdW5jdGlvbiB0byBjcmVhdGUgdGhlIGZpbmRJbmRleCBhbmQgZmluZExhc3RJbmRleCBmdW5jdGlvbnNcbiAgZnVuY3Rpb24gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoZGlyKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKGFycmF5LCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICAgIHByZWRpY2F0ZSA9IGNiKHByZWRpY2F0ZSwgY29udGV4dCk7XG4gICAgICB2YXIgbGVuZ3RoID0gZ2V0TGVuZ3RoKGFycmF5KTtcbiAgICAgIHZhciBpbmRleCA9IGRpciA+IDAgPyAwIDogbGVuZ3RoIC0gMTtcbiAgICAgIGZvciAoOyBpbmRleCA+PSAwICYmIGluZGV4IDwgbGVuZ3RoOyBpbmRleCArPSBkaXIpIHtcbiAgICAgICAgaWYgKHByZWRpY2F0ZShhcnJheVtpbmRleF0sIGluZGV4LCBhcnJheSkpIHJldHVybiBpbmRleDtcbiAgICAgIH1cbiAgICAgIHJldHVybiAtMTtcbiAgICB9O1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZmlyc3QgaW5kZXggb24gYW4gYXJyYXktbGlrZSB0aGF0IHBhc3NlcyBhIHByZWRpY2F0ZSB0ZXN0XG4gIF8uZmluZEluZGV4ID0gY3JlYXRlUHJlZGljYXRlSW5kZXhGaW5kZXIoMSk7XG4gIF8uZmluZExhc3RJbmRleCA9IGNyZWF0ZVByZWRpY2F0ZUluZGV4RmluZGVyKC0xKTtcblxuICAvLyBVc2UgYSBjb21wYXJhdG9yIGZ1bmN0aW9uIHRvIGZpZ3VyZSBvdXQgdGhlIHNtYWxsZXN0IGluZGV4IGF0IHdoaWNoXG4gIC8vIGFuIG9iamVjdCBzaG91bGQgYmUgaW5zZXJ0ZWQgc28gYXMgdG8gbWFpbnRhaW4gb3JkZXIuIFVzZXMgYmluYXJ5IHNlYXJjaC5cbiAgXy5zb3J0ZWRJbmRleCA9IGZ1bmN0aW9uKGFycmF5LCBvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaXRlcmF0ZWUgPSBjYihpdGVyYXRlZSwgY29udGV4dCwgMSk7XG4gICAgdmFyIHZhbHVlID0gaXRlcmF0ZWUob2JqKTtcbiAgICB2YXIgbG93ID0gMCwgaGlnaCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgd2hpbGUgKGxvdyA8IGhpZ2gpIHtcbiAgICAgIHZhciBtaWQgPSBNYXRoLmZsb29yKChsb3cgKyBoaWdoKSAvIDIpO1xuICAgICAgaWYgKGl0ZXJhdGVlKGFycmF5W21pZF0pIDwgdmFsdWUpIGxvdyA9IG1pZCArIDE7IGVsc2UgaGlnaCA9IG1pZDtcbiAgICB9XG4gICAgcmV0dXJuIGxvdztcbiAgfTtcblxuICAvLyBHZW5lcmF0b3IgZnVuY3Rpb24gdG8gY3JlYXRlIHRoZSBpbmRleE9mIGFuZCBsYXN0SW5kZXhPZiBmdW5jdGlvbnNcbiAgZnVuY3Rpb24gY3JlYXRlSW5kZXhGaW5kZXIoZGlyLCBwcmVkaWNhdGVGaW5kLCBzb3J0ZWRJbmRleCkge1xuICAgIHJldHVybiBmdW5jdGlvbihhcnJheSwgaXRlbSwgaWR4KSB7XG4gICAgICB2YXIgaSA9IDAsIGxlbmd0aCA9IGdldExlbmd0aChhcnJheSk7XG4gICAgICBpZiAodHlwZW9mIGlkeCA9PSAnbnVtYmVyJykge1xuICAgICAgICBpZiAoZGlyID4gMCkge1xuICAgICAgICAgICAgaSA9IGlkeCA+PSAwID8gaWR4IDogTWF0aC5tYXgoaWR4ICsgbGVuZ3RoLCBpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxlbmd0aCA9IGlkeCA+PSAwID8gTWF0aC5taW4oaWR4ICsgMSwgbGVuZ3RoKSA6IGlkeCArIGxlbmd0aCArIDE7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc29ydGVkSW5kZXggJiYgaWR4ICYmIGxlbmd0aCkge1xuICAgICAgICBpZHggPSBzb3J0ZWRJbmRleChhcnJheSwgaXRlbSk7XG4gICAgICAgIHJldHVybiBhcnJheVtpZHhdID09PSBpdGVtID8gaWR4IDogLTE7XG4gICAgICB9XG4gICAgICBpZiAoaXRlbSAhPT0gaXRlbSkge1xuICAgICAgICBpZHggPSBwcmVkaWNhdGVGaW5kKHNsaWNlLmNhbGwoYXJyYXksIGksIGxlbmd0aCksIF8uaXNOYU4pO1xuICAgICAgICByZXR1cm4gaWR4ID49IDAgPyBpZHggKyBpIDogLTE7XG4gICAgICB9XG4gICAgICBmb3IgKGlkeCA9IGRpciA+IDAgPyBpIDogbGVuZ3RoIC0gMTsgaWR4ID49IDAgJiYgaWR4IDwgbGVuZ3RoOyBpZHggKz0gZGlyKSB7XG4gICAgICAgIGlmIChhcnJheVtpZHhdID09PSBpdGVtKSByZXR1cm4gaWR4O1xuICAgICAgfVxuICAgICAgcmV0dXJuIC0xO1xuICAgIH07XG4gIH1cblxuICAvLyBSZXR1cm4gdGhlIHBvc2l0aW9uIG9mIHRoZSBmaXJzdCBvY2N1cnJlbmNlIG9mIGFuIGl0ZW0gaW4gYW4gYXJyYXksXG4gIC8vIG9yIC0xIGlmIHRoZSBpdGVtIGlzIG5vdCBpbmNsdWRlZCBpbiB0aGUgYXJyYXkuXG4gIC8vIElmIHRoZSBhcnJheSBpcyBsYXJnZSBhbmQgYWxyZWFkeSBpbiBzb3J0IG9yZGVyLCBwYXNzIGB0cnVlYFxuICAvLyBmb3IgKippc1NvcnRlZCoqIHRvIHVzZSBiaW5hcnkgc2VhcmNoLlxuICBfLmluZGV4T2YgPSBjcmVhdGVJbmRleEZpbmRlcigxLCBfLmZpbmRJbmRleCwgXy5zb3J0ZWRJbmRleCk7XG4gIF8ubGFzdEluZGV4T2YgPSBjcmVhdGVJbmRleEZpbmRlcigtMSwgXy5maW5kTGFzdEluZGV4KTtcblxuICAvLyBHZW5lcmF0ZSBhbiBpbnRlZ2VyIEFycmF5IGNvbnRhaW5pbmcgYW4gYXJpdGhtZXRpYyBwcm9ncmVzc2lvbi4gQSBwb3J0IG9mXG4gIC8vIHRoZSBuYXRpdmUgUHl0aG9uIGByYW5nZSgpYCBmdW5jdGlvbi4gU2VlXG4gIC8vIFt0aGUgUHl0aG9uIGRvY3VtZW50YXRpb25dKGh0dHA6Ly9kb2NzLnB5dGhvbi5vcmcvbGlicmFyeS9mdW5jdGlvbnMuaHRtbCNyYW5nZSkuXG4gIF8ucmFuZ2UgPSBmdW5jdGlvbihzdGFydCwgc3RvcCwgc3RlcCkge1xuICAgIGlmIChzdG9wID09IG51bGwpIHtcbiAgICAgIHN0b3AgPSBzdGFydCB8fCAwO1xuICAgICAgc3RhcnQgPSAwO1xuICAgIH1cbiAgICBzdGVwID0gc3RlcCB8fCAxO1xuXG4gICAgdmFyIGxlbmd0aCA9IE1hdGgubWF4KE1hdGguY2VpbCgoc3RvcCAtIHN0YXJ0KSAvIHN0ZXApLCAwKTtcbiAgICB2YXIgcmFuZ2UgPSBBcnJheShsZW5ndGgpO1xuXG4gICAgZm9yICh2YXIgaWR4ID0gMDsgaWR4IDwgbGVuZ3RoOyBpZHgrKywgc3RhcnQgKz0gc3RlcCkge1xuICAgICAgcmFuZ2VbaWR4XSA9IHN0YXJ0O1xuICAgIH1cblxuICAgIHJldHVybiByYW5nZTtcbiAgfTtcblxuICAvLyBGdW5jdGlvbiAoYWhlbSkgRnVuY3Rpb25zXG4gIC8vIC0tLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIERldGVybWluZXMgd2hldGhlciB0byBleGVjdXRlIGEgZnVuY3Rpb24gYXMgYSBjb25zdHJ1Y3RvclxuICAvLyBvciBhIG5vcm1hbCBmdW5jdGlvbiB3aXRoIHRoZSBwcm92aWRlZCBhcmd1bWVudHNcbiAgdmFyIGV4ZWN1dGVCb3VuZCA9IGZ1bmN0aW9uKHNvdXJjZUZ1bmMsIGJvdW5kRnVuYywgY29udGV4dCwgY2FsbGluZ0NvbnRleHQsIGFyZ3MpIHtcbiAgICBpZiAoIShjYWxsaW5nQ29udGV4dCBpbnN0YW5jZW9mIGJvdW5kRnVuYykpIHJldHVybiBzb3VyY2VGdW5jLmFwcGx5KGNvbnRleHQsIGFyZ3MpO1xuICAgIHZhciBzZWxmID0gYmFzZUNyZWF0ZShzb3VyY2VGdW5jLnByb3RvdHlwZSk7XG4gICAgdmFyIHJlc3VsdCA9IHNvdXJjZUZ1bmMuYXBwbHkoc2VsZiwgYXJncyk7XG4gICAgaWYgKF8uaXNPYmplY3QocmVzdWx0KSkgcmV0dXJuIHJlc3VsdDtcbiAgICByZXR1cm4gc2VsZjtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSBmdW5jdGlvbiBib3VuZCB0byBhIGdpdmVuIG9iamVjdCAoYXNzaWduaW5nIGB0aGlzYCwgYW5kIGFyZ3VtZW50cyxcbiAgLy8gb3B0aW9uYWxseSkuIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBGdW5jdGlvbi5iaW5kYCBpZlxuICAvLyBhdmFpbGFibGUuXG4gIF8uYmluZCA9IGZ1bmN0aW9uKGZ1bmMsIGNvbnRleHQpIHtcbiAgICBpZiAobmF0aXZlQmluZCAmJiBmdW5jLmJpbmQgPT09IG5hdGl2ZUJpbmQpIHJldHVybiBuYXRpdmVCaW5kLmFwcGx5KGZ1bmMsIHNsaWNlLmNhbGwoYXJndW1lbnRzLCAxKSk7XG4gICAgaWYgKCFfLmlzRnVuY3Rpb24oZnVuYykpIHRocm93IG5ldyBUeXBlRXJyb3IoJ0JpbmQgbXVzdCBiZSBjYWxsZWQgb24gYSBmdW5jdGlvbicpO1xuICAgIHZhciBhcmdzID0gc2xpY2UuY2FsbChhcmd1bWVudHMsIDIpO1xuICAgIHZhciBib3VuZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4ZWN1dGVCb3VuZChmdW5jLCBib3VuZCwgY29udGV4dCwgdGhpcywgYXJncy5jb25jYXQoc2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG4gICAgfTtcbiAgICByZXR1cm4gYm91bmQ7XG4gIH07XG5cbiAgLy8gUGFydGlhbGx5IGFwcGx5IGEgZnVuY3Rpb24gYnkgY3JlYXRpbmcgYSB2ZXJzaW9uIHRoYXQgaGFzIGhhZCBzb21lIG9mIGl0c1xuICAvLyBhcmd1bWVudHMgcHJlLWZpbGxlZCwgd2l0aG91dCBjaGFuZ2luZyBpdHMgZHluYW1pYyBgdGhpc2AgY29udGV4dC4gXyBhY3RzXG4gIC8vIGFzIGEgcGxhY2Vob2xkZXIsIGFsbG93aW5nIGFueSBjb21iaW5hdGlvbiBvZiBhcmd1bWVudHMgdG8gYmUgcHJlLWZpbGxlZC5cbiAgXy5wYXJ0aWFsID0gZnVuY3Rpb24oZnVuYykge1xuICAgIHZhciBib3VuZEFyZ3MgPSBzbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG4gICAgdmFyIGJvdW5kID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgcG9zaXRpb24gPSAwLCBsZW5ndGggPSBib3VuZEFyZ3MubGVuZ3RoO1xuICAgICAgdmFyIGFyZ3MgPSBBcnJheShsZW5ndGgpO1xuICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICBhcmdzW2ldID0gYm91bmRBcmdzW2ldID09PSBfID8gYXJndW1lbnRzW3Bvc2l0aW9uKytdIDogYm91bmRBcmdzW2ldO1xuICAgICAgfVxuICAgICAgd2hpbGUgKHBvc2l0aW9uIDwgYXJndW1lbnRzLmxlbmd0aCkgYXJncy5wdXNoKGFyZ3VtZW50c1twb3NpdGlvbisrXSk7XG4gICAgICByZXR1cm4gZXhlY3V0ZUJvdW5kKGZ1bmMsIGJvdW5kLCB0aGlzLCB0aGlzLCBhcmdzKTtcbiAgICB9O1xuICAgIHJldHVybiBib3VuZDtcbiAgfTtcblxuICAvLyBCaW5kIGEgbnVtYmVyIG9mIGFuIG9iamVjdCdzIG1ldGhvZHMgdG8gdGhhdCBvYmplY3QuIFJlbWFpbmluZyBhcmd1bWVudHNcbiAgLy8gYXJlIHRoZSBtZXRob2QgbmFtZXMgdG8gYmUgYm91bmQuIFVzZWZ1bCBmb3IgZW5zdXJpbmcgdGhhdCBhbGwgY2FsbGJhY2tzXG4gIC8vIGRlZmluZWQgb24gYW4gb2JqZWN0IGJlbG9uZyB0byBpdC5cbiAgXy5iaW5kQWxsID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIGksIGxlbmd0aCA9IGFyZ3VtZW50cy5sZW5ndGgsIGtleTtcbiAgICBpZiAobGVuZ3RoIDw9IDEpIHRocm93IG5ldyBFcnJvcignYmluZEFsbCBtdXN0IGJlIHBhc3NlZCBmdW5jdGlvbiBuYW1lcycpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAga2V5ID0gYXJndW1lbnRzW2ldO1xuICAgICAgb2JqW2tleV0gPSBfLmJpbmQob2JqW2tleV0sIG9iaik7XG4gICAgfVxuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gTWVtb2l6ZSBhbiBleHBlbnNpdmUgZnVuY3Rpb24gYnkgc3RvcmluZyBpdHMgcmVzdWx0cy5cbiAgXy5tZW1vaXplID0gZnVuY3Rpb24oZnVuYywgaGFzaGVyKSB7XG4gICAgdmFyIG1lbW9pemUgPSBmdW5jdGlvbihrZXkpIHtcbiAgICAgIHZhciBjYWNoZSA9IG1lbW9pemUuY2FjaGU7XG4gICAgICB2YXIgYWRkcmVzcyA9ICcnICsgKGhhc2hlciA/IGhhc2hlci5hcHBseSh0aGlzLCBhcmd1bWVudHMpIDoga2V5KTtcbiAgICAgIGlmICghXy5oYXMoY2FjaGUsIGFkZHJlc3MpKSBjYWNoZVthZGRyZXNzXSA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIHJldHVybiBjYWNoZVthZGRyZXNzXTtcbiAgICB9O1xuICAgIG1lbW9pemUuY2FjaGUgPSB7fTtcbiAgICByZXR1cm4gbWVtb2l6ZTtcbiAgfTtcblxuICAvLyBEZWxheXMgYSBmdW5jdGlvbiBmb3IgdGhlIGdpdmVuIG51bWJlciBvZiBtaWxsaXNlY29uZHMsIGFuZCB0aGVuIGNhbGxzXG4gIC8vIGl0IHdpdGggdGhlIGFyZ3VtZW50cyBzdXBwbGllZC5cbiAgXy5kZWxheSA9IGZ1bmN0aW9uKGZ1bmMsIHdhaXQpIHtcbiAgICB2YXIgYXJncyA9IHNsaWNlLmNhbGwoYXJndW1lbnRzLCAyKTtcbiAgICByZXR1cm4gc2V0VGltZW91dChmdW5jdGlvbigpe1xuICAgICAgcmV0dXJuIGZ1bmMuYXBwbHkobnVsbCwgYXJncyk7XG4gICAgfSwgd2FpdCk7XG4gIH07XG5cbiAgLy8gRGVmZXJzIGEgZnVuY3Rpb24sIHNjaGVkdWxpbmcgaXQgdG8gcnVuIGFmdGVyIHRoZSBjdXJyZW50IGNhbGwgc3RhY2sgaGFzXG4gIC8vIGNsZWFyZWQuXG4gIF8uZGVmZXIgPSBfLnBhcnRpYWwoXy5kZWxheSwgXywgMSk7XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uLCB0aGF0LCB3aGVuIGludm9rZWQsIHdpbGwgb25seSBiZSB0cmlnZ2VyZWQgYXQgbW9zdCBvbmNlXG4gIC8vIGR1cmluZyBhIGdpdmVuIHdpbmRvdyBvZiB0aW1lLiBOb3JtYWxseSwgdGhlIHRocm90dGxlZCBmdW5jdGlvbiB3aWxsIHJ1blxuICAvLyBhcyBtdWNoIGFzIGl0IGNhbiwgd2l0aG91dCBldmVyIGdvaW5nIG1vcmUgdGhhbiBvbmNlIHBlciBgd2FpdGAgZHVyYXRpb247XG4gIC8vIGJ1dCBpZiB5b3UnZCBsaWtlIHRvIGRpc2FibGUgdGhlIGV4ZWN1dGlvbiBvbiB0aGUgbGVhZGluZyBlZGdlLCBwYXNzXG4gIC8vIGB7bGVhZGluZzogZmFsc2V9YC4gVG8gZGlzYWJsZSBleGVjdXRpb24gb24gdGhlIHRyYWlsaW5nIGVkZ2UsIGRpdHRvLlxuICBfLnRocm90dGxlID0gZnVuY3Rpb24oZnVuYywgd2FpdCwgb3B0aW9ucykge1xuICAgIHZhciBjb250ZXh0LCBhcmdzLCByZXN1bHQ7XG4gICAgdmFyIHRpbWVvdXQgPSBudWxsO1xuICAgIHZhciBwcmV2aW91cyA9IDA7XG4gICAgaWYgKCFvcHRpb25zKSBvcHRpb25zID0ge307XG4gICAgdmFyIGxhdGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICBwcmV2aW91cyA9IG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UgPyAwIDogXy5ub3coKTtcbiAgICAgIHRpbWVvdXQgPSBudWxsO1xuICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgIH07XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIG5vdyA9IF8ubm93KCk7XG4gICAgICBpZiAoIXByZXZpb3VzICYmIG9wdGlvbnMubGVhZGluZyA9PT0gZmFsc2UpIHByZXZpb3VzID0gbm93O1xuICAgICAgdmFyIHJlbWFpbmluZyA9IHdhaXQgLSAobm93IC0gcHJldmlvdXMpO1xuICAgICAgY29udGV4dCA9IHRoaXM7XG4gICAgICBhcmdzID0gYXJndW1lbnRzO1xuICAgICAgaWYgKHJlbWFpbmluZyA8PSAwIHx8IHJlbWFpbmluZyA+IHdhaXQpIHtcbiAgICAgICAgaWYgKHRpbWVvdXQpIHtcbiAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgcHJldmlvdXMgPSBub3c7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGlmICghdGltZW91dCkgY29udGV4dCA9IGFyZ3MgPSBudWxsO1xuICAgICAgfSBlbHNlIGlmICghdGltZW91dCAmJiBvcHRpb25zLnRyYWlsaW5nICE9PSBmYWxzZSkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgcmVtYWluaW5nKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24sIHRoYXQsIGFzIGxvbmcgYXMgaXQgY29udGludWVzIHRvIGJlIGludm9rZWQsIHdpbGwgbm90XG4gIC8vIGJlIHRyaWdnZXJlZC4gVGhlIGZ1bmN0aW9uIHdpbGwgYmUgY2FsbGVkIGFmdGVyIGl0IHN0b3BzIGJlaW5nIGNhbGxlZCBmb3JcbiAgLy8gTiBtaWxsaXNlY29uZHMuIElmIGBpbW1lZGlhdGVgIGlzIHBhc3NlZCwgdHJpZ2dlciB0aGUgZnVuY3Rpb24gb24gdGhlXG4gIC8vIGxlYWRpbmcgZWRnZSwgaW5zdGVhZCBvZiB0aGUgdHJhaWxpbmcuXG4gIF8uZGVib3VuY2UgPSBmdW5jdGlvbihmdW5jLCB3YWl0LCBpbW1lZGlhdGUpIHtcbiAgICB2YXIgdGltZW91dCwgYXJncywgY29udGV4dCwgdGltZXN0YW1wLCByZXN1bHQ7XG5cbiAgICB2YXIgbGF0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBsYXN0ID0gXy5ub3coKSAtIHRpbWVzdGFtcDtcblxuICAgICAgaWYgKGxhc3QgPCB3YWl0ICYmIGxhc3QgPj0gMCkge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dChsYXRlciwgd2FpdCAtIGxhc3QpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGltZW91dCA9IG51bGw7XG4gICAgICAgIGlmICghaW1tZWRpYXRlKSB7XG4gICAgICAgICAgcmVzdWx0ID0gZnVuYy5hcHBseShjb250ZXh0LCBhcmdzKTtcbiAgICAgICAgICBpZiAoIXRpbWVvdXQpIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG5cbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBjb250ZXh0ID0gdGhpcztcbiAgICAgIGFyZ3MgPSBhcmd1bWVudHM7XG4gICAgICB0aW1lc3RhbXAgPSBfLm5vdygpO1xuICAgICAgdmFyIGNhbGxOb3cgPSBpbW1lZGlhdGUgJiYgIXRpbWVvdXQ7XG4gICAgICBpZiAoIXRpbWVvdXQpIHRpbWVvdXQgPSBzZXRUaW1lb3V0KGxhdGVyLCB3YWl0KTtcbiAgICAgIGlmIChjYWxsTm93KSB7XG4gICAgICAgIHJlc3VsdCA9IGZ1bmMuYXBwbHkoY29udGV4dCwgYXJncyk7XG4gICAgICAgIGNvbnRleHQgPSBhcmdzID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgdGhlIGZpcnN0IGZ1bmN0aW9uIHBhc3NlZCBhcyBhbiBhcmd1bWVudCB0byB0aGUgc2Vjb25kLFxuICAvLyBhbGxvd2luZyB5b3UgdG8gYWRqdXN0IGFyZ3VtZW50cywgcnVuIGNvZGUgYmVmb3JlIGFuZCBhZnRlciwgYW5kXG4gIC8vIGNvbmRpdGlvbmFsbHkgZXhlY3V0ZSB0aGUgb3JpZ2luYWwgZnVuY3Rpb24uXG4gIF8ud3JhcCA9IGZ1bmN0aW9uKGZ1bmMsIHdyYXBwZXIpIHtcbiAgICByZXR1cm4gXy5wYXJ0aWFsKHdyYXBwZXIsIGZ1bmMpO1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBuZWdhdGVkIHZlcnNpb24gb2YgdGhlIHBhc3NlZC1pbiBwcmVkaWNhdGUuXG4gIF8ubmVnYXRlID0gZnVuY3Rpb24ocHJlZGljYXRlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuICFwcmVkaWNhdGUuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9O1xuXG4gIC8vIFJldHVybnMgYSBmdW5jdGlvbiB0aGF0IGlzIHRoZSBjb21wb3NpdGlvbiBvZiBhIGxpc3Qgb2YgZnVuY3Rpb25zLCBlYWNoXG4gIC8vIGNvbnN1bWluZyB0aGUgcmV0dXJuIHZhbHVlIG9mIHRoZSBmdW5jdGlvbiB0aGF0IGZvbGxvd3MuXG4gIF8uY29tcG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICAgIHZhciBzdGFydCA9IGFyZ3MubGVuZ3RoIC0gMTtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgaSA9IHN0YXJ0O1xuICAgICAgdmFyIHJlc3VsdCA9IGFyZ3Nbc3RhcnRdLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB3aGlsZSAoaS0tKSByZXN1bHQgPSBhcmdzW2ldLmNhbGwodGhpcywgcmVzdWx0KTtcbiAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgb24gYW5kIGFmdGVyIHRoZSBOdGggY2FsbC5cbiAgXy5hZnRlciA9IGZ1bmN0aW9uKHRpbWVzLCBmdW5jKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgaWYgKC0tdGltZXMgPCAxKSB7XG4gICAgICAgIHJldHVybiBmdW5jLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICB9XG4gICAgfTtcbiAgfTtcblxuICAvLyBSZXR1cm5zIGEgZnVuY3Rpb24gdGhhdCB3aWxsIG9ubHkgYmUgZXhlY3V0ZWQgdXAgdG8gKGJ1dCBub3QgaW5jbHVkaW5nKSB0aGUgTnRoIGNhbGwuXG4gIF8uYmVmb3JlID0gZnVuY3Rpb24odGltZXMsIGZ1bmMpIHtcbiAgICB2YXIgbWVtbztcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICBpZiAoLS10aW1lcyA+IDApIHtcbiAgICAgICAgbWVtbyA9IGZ1bmMuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgIH1cbiAgICAgIGlmICh0aW1lcyA8PSAxKSBmdW5jID0gbnVsbDtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIGZ1bmN0aW9uIHRoYXQgd2lsbCBiZSBleGVjdXRlZCBhdCBtb3N0IG9uZSB0aW1lLCBubyBtYXR0ZXIgaG93XG4gIC8vIG9mdGVuIHlvdSBjYWxsIGl0LiBVc2VmdWwgZm9yIGxhenkgaW5pdGlhbGl6YXRpb24uXG4gIF8ub25jZSA9IF8ucGFydGlhbChfLmJlZm9yZSwgMik7XG5cbiAgLy8gT2JqZWN0IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tXG5cbiAgLy8gS2V5cyBpbiBJRSA8IDkgdGhhdCB3b24ndCBiZSBpdGVyYXRlZCBieSBgZm9yIGtleSBpbiAuLi5gIGFuZCB0aHVzIG1pc3NlZC5cbiAgdmFyIGhhc0VudW1CdWcgPSAhe3RvU3RyaW5nOiBudWxsfS5wcm9wZXJ0eUlzRW51bWVyYWJsZSgndG9TdHJpbmcnKTtcbiAgdmFyIG5vbkVudW1lcmFibGVQcm9wcyA9IFsndmFsdWVPZicsICdpc1Byb3RvdHlwZU9mJywgJ3RvU3RyaW5nJyxcbiAgICAgICAgICAgICAgICAgICAgICAncHJvcGVydHlJc0VudW1lcmFibGUnLCAnaGFzT3duUHJvcGVydHknLCAndG9Mb2NhbGVTdHJpbmcnXTtcblxuICBmdW5jdGlvbiBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cykge1xuICAgIHZhciBub25FbnVtSWR4ID0gbm9uRW51bWVyYWJsZVByb3BzLmxlbmd0aDtcbiAgICB2YXIgY29uc3RydWN0b3IgPSBvYmouY29uc3RydWN0b3I7XG4gICAgdmFyIHByb3RvID0gKF8uaXNGdW5jdGlvbihjb25zdHJ1Y3RvcikgJiYgY29uc3RydWN0b3IucHJvdG90eXBlKSB8fCBPYmpQcm90bztcblxuICAgIC8vIENvbnN0cnVjdG9yIGlzIGEgc3BlY2lhbCBjYXNlLlxuICAgIHZhciBwcm9wID0gJ2NvbnN0cnVjdG9yJztcbiAgICBpZiAoXy5oYXMob2JqLCBwcm9wKSAmJiAhXy5jb250YWlucyhrZXlzLCBwcm9wKSkga2V5cy5wdXNoKHByb3ApO1xuXG4gICAgd2hpbGUgKG5vbkVudW1JZHgtLSkge1xuICAgICAgcHJvcCA9IG5vbkVudW1lcmFibGVQcm9wc1tub25FbnVtSWR4XTtcbiAgICAgIGlmIChwcm9wIGluIG9iaiAmJiBvYmpbcHJvcF0gIT09IHByb3RvW3Byb3BdICYmICFfLmNvbnRhaW5zKGtleXMsIHByb3ApKSB7XG4gICAgICAgIGtleXMucHVzaChwcm9wKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBSZXRyaWV2ZSB0aGUgbmFtZXMgb2YgYW4gb2JqZWN0J3Mgb3duIHByb3BlcnRpZXMuXG4gIC8vIERlbGVnYXRlcyB0byAqKkVDTUFTY3JpcHQgNSoqJ3MgbmF0aXZlIGBPYmplY3Qua2V5c2BcbiAgXy5rZXlzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKCFfLmlzT2JqZWN0KG9iaikpIHJldHVybiBbXTtcbiAgICBpZiAobmF0aXZlS2V5cykgcmV0dXJuIG5hdGl2ZUtleXMob2JqKTtcbiAgICB2YXIga2V5cyA9IFtdO1xuICAgIGZvciAodmFyIGtleSBpbiBvYmopIGlmIChfLmhhcyhvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICAgIC8vIEFoZW0sIElFIDwgOS5cbiAgICBpZiAoaGFzRW51bUJ1ZykgY29sbGVjdE5vbkVudW1Qcm9wcyhvYmosIGtleXMpO1xuICAgIHJldHVybiBrZXlzO1xuICB9O1xuXG4gIC8vIFJldHJpZXZlIGFsbCB0aGUgcHJvcGVydHkgbmFtZXMgb2YgYW4gb2JqZWN0LlxuICBfLmFsbEtleXMgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIFtdO1xuICAgIHZhciBrZXlzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikga2V5cy5wdXNoKGtleSk7XG4gICAgLy8gQWhlbSwgSUUgPCA5LlxuICAgIGlmIChoYXNFbnVtQnVnKSBjb2xsZWN0Tm9uRW51bVByb3BzKG9iaiwga2V5cyk7XG4gICAgcmV0dXJuIGtleXM7XG4gIH07XG5cbiAgLy8gUmV0cmlldmUgdGhlIHZhbHVlcyBvZiBhbiBvYmplY3QncyBwcm9wZXJ0aWVzLlxuICBfLnZhbHVlcyA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgdmFyIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIHZhciB2YWx1ZXMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhbHVlc1tpXSA9IG9ialtrZXlzW2ldXTtcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlcztcbiAgfTtcblxuICAvLyBSZXR1cm5zIHRoZSByZXN1bHRzIG9mIGFwcGx5aW5nIHRoZSBpdGVyYXRlZSB0byBlYWNoIGVsZW1lbnQgb2YgdGhlIG9iamVjdFxuICAvLyBJbiBjb250cmFzdCB0byBfLm1hcCBpdCByZXR1cm5zIGFuIG9iamVjdFxuICBfLm1hcE9iamVjdCA9IGZ1bmN0aW9uKG9iaiwgaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICBpdGVyYXRlZSA9IGNiKGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgICB2YXIga2V5cyA9ICBfLmtleXMob2JqKSxcbiAgICAgICAgICBsZW5ndGggPSBrZXlzLmxlbmd0aCxcbiAgICAgICAgICByZXN1bHRzID0ge30sXG4gICAgICAgICAgY3VycmVudEtleTtcbiAgICAgIGZvciAodmFyIGluZGV4ID0gMDsgaW5kZXggPCBsZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgY3VycmVudEtleSA9IGtleXNbaW5kZXhdO1xuICAgICAgICByZXN1bHRzW2N1cnJlbnRLZXldID0gaXRlcmF0ZWUob2JqW2N1cnJlbnRLZXldLCBjdXJyZW50S2V5LCBvYmopO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gIH07XG5cbiAgLy8gQ29udmVydCBhbiBvYmplY3QgaW50byBhIGxpc3Qgb2YgYFtrZXksIHZhbHVlXWAgcGFpcnMuXG4gIF8ucGFpcnMgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhvYmopO1xuICAgIHZhciBsZW5ndGggPSBrZXlzLmxlbmd0aDtcbiAgICB2YXIgcGFpcnMgPSBBcnJheShsZW5ndGgpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHBhaXJzW2ldID0gW2tleXNbaV0sIG9ialtrZXlzW2ldXV07XG4gICAgfVxuICAgIHJldHVybiBwYWlycztcbiAgfTtcblxuICAvLyBJbnZlcnQgdGhlIGtleXMgYW5kIHZhbHVlcyBvZiBhbiBvYmplY3QuIFRoZSB2YWx1ZXMgbXVzdCBiZSBzZXJpYWxpemFibGUuXG4gIF8uaW52ZXJ0ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaik7XG4gICAgZm9yICh2YXIgaSA9IDAsIGxlbmd0aCA9IGtleXMubGVuZ3RoOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHJlc3VsdFtvYmpba2V5c1tpXV1dID0ga2V5c1tpXTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSBzb3J0ZWQgbGlzdCBvZiB0aGUgZnVuY3Rpb24gbmFtZXMgYXZhaWxhYmxlIG9uIHRoZSBvYmplY3QuXG4gIC8vIEFsaWFzZWQgYXMgYG1ldGhvZHNgXG4gIF8uZnVuY3Rpb25zID0gXy5tZXRob2RzID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgdmFyIG5hbWVzID0gW107XG4gICAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgICAgaWYgKF8uaXNGdW5jdGlvbihvYmpba2V5XSkpIG5hbWVzLnB1c2goa2V5KTtcbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzLnNvcnQoKTtcbiAgfTtcblxuICAvLyBFeHRlbmQgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIHByb3BlcnRpZXMgaW4gcGFzc2VkLWluIG9iamVjdChzKS5cbiAgXy5leHRlbmQgPSBjcmVhdGVBc3NpZ25lcihfLmFsbEtleXMpO1xuXG4gIC8vIEFzc2lnbnMgYSBnaXZlbiBvYmplY3Qgd2l0aCBhbGwgdGhlIG93biBwcm9wZXJ0aWVzIGluIHRoZSBwYXNzZWQtaW4gb2JqZWN0KHMpXG4gIC8vIChodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9PYmplY3QvYXNzaWduKVxuICBfLmV4dGVuZE93biA9IF8uYXNzaWduID0gY3JlYXRlQXNzaWduZXIoXy5rZXlzKTtcblxuICAvLyBSZXR1cm5zIHRoZSBmaXJzdCBrZXkgb24gYW4gb2JqZWN0IHRoYXQgcGFzc2VzIGEgcHJlZGljYXRlIHRlc3RcbiAgXy5maW5kS2V5ID0gZnVuY3Rpb24ob2JqLCBwcmVkaWNhdGUsIGNvbnRleHQpIHtcbiAgICBwcmVkaWNhdGUgPSBjYihwcmVkaWNhdGUsIGNvbnRleHQpO1xuICAgIHZhciBrZXlzID0gXy5rZXlzKG9iaiksIGtleTtcbiAgICBmb3IgKHZhciBpID0gMCwgbGVuZ3RoID0ga2V5cy5sZW5ndGg7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAga2V5ID0ga2V5c1tpXTtcbiAgICAgIGlmIChwcmVkaWNhdGUob2JqW2tleV0sIGtleSwgb2JqKSkgcmV0dXJuIGtleTtcbiAgICB9XG4gIH07XG5cbiAgLy8gUmV0dXJuIGEgY29weSBvZiB0aGUgb2JqZWN0IG9ubHkgY29udGFpbmluZyB0aGUgd2hpdGVsaXN0ZWQgcHJvcGVydGllcy5cbiAgXy5waWNrID0gZnVuY3Rpb24ob2JqZWN0LCBvaXRlcmF0ZWUsIGNvbnRleHQpIHtcbiAgICB2YXIgcmVzdWx0ID0ge30sIG9iaiA9IG9iamVjdCwgaXRlcmF0ZWUsIGtleXM7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gcmVzdWx0O1xuICAgIGlmIChfLmlzRnVuY3Rpb24ob2l0ZXJhdGVlKSkge1xuICAgICAga2V5cyA9IF8uYWxsS2V5cyhvYmopO1xuICAgICAgaXRlcmF0ZWUgPSBvcHRpbWl6ZUNiKG9pdGVyYXRlZSwgY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGtleXMgPSBmbGF0dGVuKGFyZ3VtZW50cywgZmFsc2UsIGZhbHNlLCAxKTtcbiAgICAgIGl0ZXJhdGVlID0gZnVuY3Rpb24odmFsdWUsIGtleSwgb2JqKSB7IHJldHVybiBrZXkgaW4gb2JqOyB9O1xuICAgICAgb2JqID0gT2JqZWN0KG9iaik7XG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwLCBsZW5ndGggPSBrZXlzLmxlbmd0aDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIga2V5ID0ga2V5c1tpXTtcbiAgICAgIHZhciB2YWx1ZSA9IG9ialtrZXldO1xuICAgICAgaWYgKGl0ZXJhdGVlKHZhbHVlLCBrZXksIG9iaikpIHJlc3VsdFtrZXldID0gdmFsdWU7XG4gICAgfVxuICAgIHJldHVybiByZXN1bHQ7XG4gIH07XG5cbiAgIC8vIFJldHVybiBhIGNvcHkgb2YgdGhlIG9iamVjdCB3aXRob3V0IHRoZSBibGFja2xpc3RlZCBwcm9wZXJ0aWVzLlxuICBfLm9taXQgPSBmdW5jdGlvbihvYmosIGl0ZXJhdGVlLCBjb250ZXh0KSB7XG4gICAgaWYgKF8uaXNGdW5jdGlvbihpdGVyYXRlZSkpIHtcbiAgICAgIGl0ZXJhdGVlID0gXy5uZWdhdGUoaXRlcmF0ZWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIga2V5cyA9IF8ubWFwKGZsYXR0ZW4oYXJndW1lbnRzLCBmYWxzZSwgZmFsc2UsIDEpLCBTdHJpbmcpO1xuICAgICAgaXRlcmF0ZWUgPSBmdW5jdGlvbih2YWx1ZSwga2V5KSB7XG4gICAgICAgIHJldHVybiAhXy5jb250YWlucyhrZXlzLCBrZXkpO1xuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIF8ucGljayhvYmosIGl0ZXJhdGVlLCBjb250ZXh0KTtcbiAgfTtcblxuICAvLyBGaWxsIGluIGEgZ2l2ZW4gb2JqZWN0IHdpdGggZGVmYXVsdCBwcm9wZXJ0aWVzLlxuICBfLmRlZmF1bHRzID0gY3JlYXRlQXNzaWduZXIoXy5hbGxLZXlzLCB0cnVlKTtcblxuICAvLyBDcmVhdGVzIGFuIG9iamVjdCB0aGF0IGluaGVyaXRzIGZyb20gdGhlIGdpdmVuIHByb3RvdHlwZSBvYmplY3QuXG4gIC8vIElmIGFkZGl0aW9uYWwgcHJvcGVydGllcyBhcmUgcHJvdmlkZWQgdGhlbiB0aGV5IHdpbGwgYmUgYWRkZWQgdG8gdGhlXG4gIC8vIGNyZWF0ZWQgb2JqZWN0LlxuICBfLmNyZWF0ZSA9IGZ1bmN0aW9uKHByb3RvdHlwZSwgcHJvcHMpIHtcbiAgICB2YXIgcmVzdWx0ID0gYmFzZUNyZWF0ZShwcm90b3R5cGUpO1xuICAgIGlmIChwcm9wcykgXy5leHRlbmRPd24ocmVzdWx0LCBwcm9wcyk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfTtcblxuICAvLyBDcmVhdGUgYSAoc2hhbGxvdy1jbG9uZWQpIGR1cGxpY2F0ZSBvZiBhbiBvYmplY3QuXG4gIF8uY2xvbmUgPSBmdW5jdGlvbihvYmopIHtcbiAgICBpZiAoIV8uaXNPYmplY3Qob2JqKSkgcmV0dXJuIG9iajtcbiAgICByZXR1cm4gXy5pc0FycmF5KG9iaikgPyBvYmouc2xpY2UoKSA6IF8uZXh0ZW5kKHt9LCBvYmopO1xuICB9O1xuXG4gIC8vIEludm9rZXMgaW50ZXJjZXB0b3Igd2l0aCB0aGUgb2JqLCBhbmQgdGhlbiByZXR1cm5zIG9iai5cbiAgLy8gVGhlIHByaW1hcnkgcHVycG9zZSBvZiB0aGlzIG1ldGhvZCBpcyB0byBcInRhcCBpbnRvXCIgYSBtZXRob2QgY2hhaW4sIGluXG4gIC8vIG9yZGVyIHRvIHBlcmZvcm0gb3BlcmF0aW9ucyBvbiBpbnRlcm1lZGlhdGUgcmVzdWx0cyB3aXRoaW4gdGhlIGNoYWluLlxuICBfLnRhcCA9IGZ1bmN0aW9uKG9iaiwgaW50ZXJjZXB0b3IpIHtcbiAgICBpbnRlcmNlcHRvcihvYmopO1xuICAgIHJldHVybiBvYmo7XG4gIH07XG5cbiAgLy8gUmV0dXJucyB3aGV0aGVyIGFuIG9iamVjdCBoYXMgYSBnaXZlbiBzZXQgb2YgYGtleTp2YWx1ZWAgcGFpcnMuXG4gIF8uaXNNYXRjaCA9IGZ1bmN0aW9uKG9iamVjdCwgYXR0cnMpIHtcbiAgICB2YXIga2V5cyA9IF8ua2V5cyhhdHRycyksIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgIGlmIChvYmplY3QgPT0gbnVsbCkgcmV0dXJuICFsZW5ndGg7XG4gICAgdmFyIG9iaiA9IE9iamVjdChvYmplY3QpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBrZXkgPSBrZXlzW2ldO1xuICAgICAgaWYgKGF0dHJzW2tleV0gIT09IG9ialtrZXldIHx8ICEoa2V5IGluIG9iaikpIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH07XG5cblxuICAvLyBJbnRlcm5hbCByZWN1cnNpdmUgY29tcGFyaXNvbiBmdW5jdGlvbiBmb3IgYGlzRXF1YWxgLlxuICB2YXIgZXEgPSBmdW5jdGlvbihhLCBiLCBhU3RhY2ssIGJTdGFjaykge1xuICAgIC8vIElkZW50aWNhbCBvYmplY3RzIGFyZSBlcXVhbC4gYDAgPT09IC0wYCwgYnV0IHRoZXkgYXJlbid0IGlkZW50aWNhbC5cbiAgICAvLyBTZWUgdGhlIFtIYXJtb255IGBlZ2FsYCBwcm9wb3NhbF0oaHR0cDovL3dpa2kuZWNtYXNjcmlwdC5vcmcvZG9rdS5waHA/aWQ9aGFybW9ueTplZ2FsKS5cbiAgICBpZiAoYSA9PT0gYikgcmV0dXJuIGEgIT09IDAgfHwgMSAvIGEgPT09IDEgLyBiO1xuICAgIC8vIEEgc3RyaWN0IGNvbXBhcmlzb24gaXMgbmVjZXNzYXJ5IGJlY2F1c2UgYG51bGwgPT0gdW5kZWZpbmVkYC5cbiAgICBpZiAoYSA9PSBudWxsIHx8IGIgPT0gbnVsbCkgcmV0dXJuIGEgPT09IGI7XG4gICAgLy8gVW53cmFwIGFueSB3cmFwcGVkIG9iamVjdHMuXG4gICAgaWYgKGEgaW5zdGFuY2VvZiBfKSBhID0gYS5fd3JhcHBlZDtcbiAgICBpZiAoYiBpbnN0YW5jZW9mIF8pIGIgPSBiLl93cmFwcGVkO1xuICAgIC8vIENvbXBhcmUgYFtbQ2xhc3NdXWAgbmFtZXMuXG4gICAgdmFyIGNsYXNzTmFtZSA9IHRvU3RyaW5nLmNhbGwoYSk7XG4gICAgaWYgKGNsYXNzTmFtZSAhPT0gdG9TdHJpbmcuY2FsbChiKSkgcmV0dXJuIGZhbHNlO1xuICAgIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgICAvLyBTdHJpbmdzLCBudW1iZXJzLCByZWd1bGFyIGV4cHJlc3Npb25zLCBkYXRlcywgYW5kIGJvb2xlYW5zIGFyZSBjb21wYXJlZCBieSB2YWx1ZS5cbiAgICAgIGNhc2UgJ1tvYmplY3QgUmVnRXhwXSc6XG4gICAgICAvLyBSZWdFeHBzIGFyZSBjb2VyY2VkIHRvIHN0cmluZ3MgZm9yIGNvbXBhcmlzb24gKE5vdGU6ICcnICsgL2EvaSA9PT0gJy9hL2knKVxuICAgICAgY2FzZSAnW29iamVjdCBTdHJpbmddJzpcbiAgICAgICAgLy8gUHJpbWl0aXZlcyBhbmQgdGhlaXIgY29ycmVzcG9uZGluZyBvYmplY3Qgd3JhcHBlcnMgYXJlIGVxdWl2YWxlbnQ7IHRodXMsIGBcIjVcImAgaXNcbiAgICAgICAgLy8gZXF1aXZhbGVudCB0byBgbmV3IFN0cmluZyhcIjVcIilgLlxuICAgICAgICByZXR1cm4gJycgKyBhID09PSAnJyArIGI7XG4gICAgICBjYXNlICdbb2JqZWN0IE51bWJlcl0nOlxuICAgICAgICAvLyBgTmFOYHMgYXJlIGVxdWl2YWxlbnQsIGJ1dCBub24tcmVmbGV4aXZlLlxuICAgICAgICAvLyBPYmplY3QoTmFOKSBpcyBlcXVpdmFsZW50IHRvIE5hTlxuICAgICAgICBpZiAoK2EgIT09ICthKSByZXR1cm4gK2IgIT09ICtiO1xuICAgICAgICAvLyBBbiBgZWdhbGAgY29tcGFyaXNvbiBpcyBwZXJmb3JtZWQgZm9yIG90aGVyIG51bWVyaWMgdmFsdWVzLlxuICAgICAgICByZXR1cm4gK2EgPT09IDAgPyAxIC8gK2EgPT09IDEgLyBiIDogK2EgPT09ICtiO1xuICAgICAgY2FzZSAnW29iamVjdCBEYXRlXSc6XG4gICAgICBjYXNlICdbb2JqZWN0IEJvb2xlYW5dJzpcbiAgICAgICAgLy8gQ29lcmNlIGRhdGVzIGFuZCBib29sZWFucyB0byBudW1lcmljIHByaW1pdGl2ZSB2YWx1ZXMuIERhdGVzIGFyZSBjb21wYXJlZCBieSB0aGVpclxuICAgICAgICAvLyBtaWxsaXNlY29uZCByZXByZXNlbnRhdGlvbnMuIE5vdGUgdGhhdCBpbnZhbGlkIGRhdGVzIHdpdGggbWlsbGlzZWNvbmQgcmVwcmVzZW50YXRpb25zXG4gICAgICAgIC8vIG9mIGBOYU5gIGFyZSBub3QgZXF1aXZhbGVudC5cbiAgICAgICAgcmV0dXJuICthID09PSArYjtcbiAgICB9XG5cbiAgICB2YXIgYXJlQXJyYXlzID0gY2xhc3NOYW1lID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIGlmICghYXJlQXJyYXlzKSB7XG4gICAgICBpZiAodHlwZW9mIGEgIT0gJ29iamVjdCcgfHwgdHlwZW9mIGIgIT0gJ29iamVjdCcpIHJldHVybiBmYWxzZTtcblxuICAgICAgLy8gT2JqZWN0cyB3aXRoIGRpZmZlcmVudCBjb25zdHJ1Y3RvcnMgYXJlIG5vdCBlcXVpdmFsZW50LCBidXQgYE9iamVjdGBzIG9yIGBBcnJheWBzXG4gICAgICAvLyBmcm9tIGRpZmZlcmVudCBmcmFtZXMgYXJlLlxuICAgICAgdmFyIGFDdG9yID0gYS5jb25zdHJ1Y3RvciwgYkN0b3IgPSBiLmNvbnN0cnVjdG9yO1xuICAgICAgaWYgKGFDdG9yICE9PSBiQ3RvciAmJiAhKF8uaXNGdW5jdGlvbihhQ3RvcikgJiYgYUN0b3IgaW5zdGFuY2VvZiBhQ3RvciAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIF8uaXNGdW5jdGlvbihiQ3RvcikgJiYgYkN0b3IgaW5zdGFuY2VvZiBiQ3RvcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgKCdjb25zdHJ1Y3RvcicgaW4gYSAmJiAnY29uc3RydWN0b3InIGluIGIpKSB7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gQXNzdW1lIGVxdWFsaXR5IGZvciBjeWNsaWMgc3RydWN0dXJlcy4gVGhlIGFsZ29yaXRobSBmb3IgZGV0ZWN0aW5nIGN5Y2xpY1xuICAgIC8vIHN0cnVjdHVyZXMgaXMgYWRhcHRlZCBmcm9tIEVTIDUuMSBzZWN0aW9uIDE1LjEyLjMsIGFic3RyYWN0IG9wZXJhdGlvbiBgSk9gLlxuXG4gICAgLy8gSW5pdGlhbGl6aW5nIHN0YWNrIG9mIHRyYXZlcnNlZCBvYmplY3RzLlxuICAgIC8vIEl0J3MgZG9uZSBoZXJlIHNpbmNlIHdlIG9ubHkgbmVlZCB0aGVtIGZvciBvYmplY3RzIGFuZCBhcnJheXMgY29tcGFyaXNvbi5cbiAgICBhU3RhY2sgPSBhU3RhY2sgfHwgW107XG4gICAgYlN0YWNrID0gYlN0YWNrIHx8IFtdO1xuICAgIHZhciBsZW5ndGggPSBhU3RhY2subGVuZ3RoO1xuICAgIHdoaWxlIChsZW5ndGgtLSkge1xuICAgICAgLy8gTGluZWFyIHNlYXJjaC4gUGVyZm9ybWFuY2UgaXMgaW52ZXJzZWx5IHByb3BvcnRpb25hbCB0byB0aGUgbnVtYmVyIG9mXG4gICAgICAvLyB1bmlxdWUgbmVzdGVkIHN0cnVjdHVyZXMuXG4gICAgICBpZiAoYVN0YWNrW2xlbmd0aF0gPT09IGEpIHJldHVybiBiU3RhY2tbbGVuZ3RoXSA9PT0gYjtcbiAgICB9XG5cbiAgICAvLyBBZGQgdGhlIGZpcnN0IG9iamVjdCB0byB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnB1c2goYSk7XG4gICAgYlN0YWNrLnB1c2goYik7XG5cbiAgICAvLyBSZWN1cnNpdmVseSBjb21wYXJlIG9iamVjdHMgYW5kIGFycmF5cy5cbiAgICBpZiAoYXJlQXJyYXlzKSB7XG4gICAgICAvLyBDb21wYXJlIGFycmF5IGxlbmd0aHMgdG8gZGV0ZXJtaW5lIGlmIGEgZGVlcCBjb21wYXJpc29uIGlzIG5lY2Vzc2FyeS5cbiAgICAgIGxlbmd0aCA9IGEubGVuZ3RoO1xuICAgICAgaWYgKGxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICAgIC8vIERlZXAgY29tcGFyZSB0aGUgY29udGVudHMsIGlnbm9yaW5nIG5vbi1udW1lcmljIHByb3BlcnRpZXMuXG4gICAgICB3aGlsZSAobGVuZ3RoLS0pIHtcbiAgICAgICAgaWYgKCFlcShhW2xlbmd0aF0sIGJbbGVuZ3RoXSwgYVN0YWNrLCBiU3RhY2spKSByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIERlZXAgY29tcGFyZSBvYmplY3RzLlxuICAgICAgdmFyIGtleXMgPSBfLmtleXMoYSksIGtleTtcbiAgICAgIGxlbmd0aCA9IGtleXMubGVuZ3RoO1xuICAgICAgLy8gRW5zdXJlIHRoYXQgYm90aCBvYmplY3RzIGNvbnRhaW4gdGhlIHNhbWUgbnVtYmVyIG9mIHByb3BlcnRpZXMgYmVmb3JlIGNvbXBhcmluZyBkZWVwIGVxdWFsaXR5LlxuICAgICAgaWYgKF8ua2V5cyhiKS5sZW5ndGggIT09IGxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgICAgd2hpbGUgKGxlbmd0aC0tKSB7XG4gICAgICAgIC8vIERlZXAgY29tcGFyZSBlYWNoIG1lbWJlclxuICAgICAgICBrZXkgPSBrZXlzW2xlbmd0aF07XG4gICAgICAgIGlmICghKF8uaGFzKGIsIGtleSkgJiYgZXEoYVtrZXldLCBiW2tleV0sIGFTdGFjaywgYlN0YWNrKSkpIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgLy8gUmVtb3ZlIHRoZSBmaXJzdCBvYmplY3QgZnJvbSB0aGUgc3RhY2sgb2YgdHJhdmVyc2VkIG9iamVjdHMuXG4gICAgYVN0YWNrLnBvcCgpO1xuICAgIGJTdGFjay5wb3AoKTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfTtcblxuICAvLyBQZXJmb3JtIGEgZGVlcCBjb21wYXJpc29uIHRvIGNoZWNrIGlmIHR3byBvYmplY3RzIGFyZSBlcXVhbC5cbiAgXy5pc0VxdWFsID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHJldHVybiBlcShhLCBiKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIGFycmF5LCBzdHJpbmcsIG9yIG9iamVjdCBlbXB0eT9cbiAgLy8gQW4gXCJlbXB0eVwiIG9iamVjdCBoYXMgbm8gZW51bWVyYWJsZSBvd24tcHJvcGVydGllcy5cbiAgXy5pc0VtcHR5ID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgaWYgKG9iaiA9PSBudWxsKSByZXR1cm4gdHJ1ZTtcbiAgICBpZiAoaXNBcnJheUxpa2Uob2JqKSAmJiAoXy5pc0FycmF5KG9iaikgfHwgXy5pc1N0cmluZyhvYmopIHx8IF8uaXNBcmd1bWVudHMob2JqKSkpIHJldHVybiBvYmoubGVuZ3RoID09PSAwO1xuICAgIHJldHVybiBfLmtleXMob2JqKS5sZW5ndGggPT09IDA7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIERPTSBlbGVtZW50P1xuICBfLmlzRWxlbWVudCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiAhIShvYmogJiYgb2JqLm5vZGVUeXBlID09PSAxKTtcbiAgfTtcblxuICAvLyBJcyBhIGdpdmVuIHZhbHVlIGFuIGFycmF5P1xuICAvLyBEZWxlZ2F0ZXMgdG8gRUNNQTUncyBuYXRpdmUgQXJyYXkuaXNBcnJheVxuICBfLmlzQXJyYXkgPSBuYXRpdmVJc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiB0b1N0cmluZy5jYWxsKG9iaikgPT09ICdbb2JqZWN0IEFycmF5XSc7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YXJpYWJsZSBhbiBvYmplY3Q/XG4gIF8uaXNPYmplY3QgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgdHlwZSA9IHR5cGVvZiBvYmo7XG4gICAgcmV0dXJuIHR5cGUgPT09ICdmdW5jdGlvbicgfHwgdHlwZSA9PT0gJ29iamVjdCcgJiYgISFvYmo7XG4gIH07XG5cbiAgLy8gQWRkIHNvbWUgaXNUeXBlIG1ldGhvZHM6IGlzQXJndW1lbnRzLCBpc0Z1bmN0aW9uLCBpc1N0cmluZywgaXNOdW1iZXIsIGlzRGF0ZSwgaXNSZWdFeHAsIGlzRXJyb3IuXG4gIF8uZWFjaChbJ0FyZ3VtZW50cycsICdGdW5jdGlvbicsICdTdHJpbmcnLCAnTnVtYmVyJywgJ0RhdGUnLCAnUmVnRXhwJywgJ0Vycm9yJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICBfWydpcycgKyBuYW1lXSA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgJyArIG5hbWUgKyAnXSc7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRGVmaW5lIGEgZmFsbGJhY2sgdmVyc2lvbiBvZiB0aGUgbWV0aG9kIGluIGJyb3dzZXJzIChhaGVtLCBJRSA8IDkpLCB3aGVyZVxuICAvLyB0aGVyZSBpc24ndCBhbnkgaW5zcGVjdGFibGUgXCJBcmd1bWVudHNcIiB0eXBlLlxuICBpZiAoIV8uaXNBcmd1bWVudHMoYXJndW1lbnRzKSkge1xuICAgIF8uaXNBcmd1bWVudHMgPSBmdW5jdGlvbihvYmopIHtcbiAgICAgIHJldHVybiBfLmhhcyhvYmosICdjYWxsZWUnKTtcbiAgICB9O1xuICB9XG5cbiAgLy8gT3B0aW1pemUgYGlzRnVuY3Rpb25gIGlmIGFwcHJvcHJpYXRlLiBXb3JrIGFyb3VuZCBzb21lIHR5cGVvZiBidWdzIGluIG9sZCB2OCxcbiAgLy8gSUUgMTEgKCMxNjIxKSwgYW5kIGluIFNhZmFyaSA4ICgjMTkyOSkuXG4gIGlmICh0eXBlb2YgLy4vICE9ICdmdW5jdGlvbicgJiYgdHlwZW9mIEludDhBcnJheSAhPSAnb2JqZWN0Jykge1xuICAgIF8uaXNGdW5jdGlvbiA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT0gJ2Z1bmN0aW9uJyB8fCBmYWxzZTtcbiAgICB9O1xuICB9XG5cbiAgLy8gSXMgYSBnaXZlbiBvYmplY3QgYSBmaW5pdGUgbnVtYmVyP1xuICBfLmlzRmluaXRlID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIGlzRmluaXRlKG9iaikgJiYgIWlzTmFOKHBhcnNlRmxvYXQob2JqKSk7XG4gIH07XG5cbiAgLy8gSXMgdGhlIGdpdmVuIHZhbHVlIGBOYU5gPyAoTmFOIGlzIHRoZSBvbmx5IG51bWJlciB3aGljaCBkb2VzIG5vdCBlcXVhbCBpdHNlbGYpLlxuICBfLmlzTmFOID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIF8uaXNOdW1iZXIob2JqKSAmJiBvYmogIT09ICtvYmo7XG4gIH07XG5cbiAgLy8gSXMgYSBnaXZlbiB2YWx1ZSBhIGJvb2xlYW4/XG4gIF8uaXNCb29sZWFuID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdHJ1ZSB8fCBvYmogPT09IGZhbHNlIHx8IHRvU3RyaW5nLmNhbGwob2JqKSA9PT0gJ1tvYmplY3QgQm9vbGVhbl0nO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFsdWUgZXF1YWwgdG8gbnVsbD9cbiAgXy5pc051bGwgPSBmdW5jdGlvbihvYmopIHtcbiAgICByZXR1cm4gb2JqID09PSBudWxsO1xuICB9O1xuXG4gIC8vIElzIGEgZ2l2ZW4gdmFyaWFibGUgdW5kZWZpbmVkP1xuICBfLmlzVW5kZWZpbmVkID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgcmV0dXJuIG9iaiA9PT0gdm9pZCAwO1xuICB9O1xuXG4gIC8vIFNob3J0Y3V0IGZ1bmN0aW9uIGZvciBjaGVja2luZyBpZiBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gcHJvcGVydHkgZGlyZWN0bHlcbiAgLy8gb24gaXRzZWxmIChpbiBvdGhlciB3b3Jkcywgbm90IG9uIGEgcHJvdG90eXBlKS5cbiAgXy5oYXMgPSBmdW5jdGlvbihvYmosIGtleSkge1xuICAgIHJldHVybiBvYmogIT0gbnVsbCAmJiBoYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KTtcbiAgfTtcblxuICAvLyBVdGlsaXR5IEZ1bmN0aW9uc1xuICAvLyAtLS0tLS0tLS0tLS0tLS0tLVxuXG4gIC8vIFJ1biBVbmRlcnNjb3JlLmpzIGluICpub0NvbmZsaWN0KiBtb2RlLCByZXR1cm5pbmcgdGhlIGBfYCB2YXJpYWJsZSB0byBpdHNcbiAgLy8gcHJldmlvdXMgb3duZXIuIFJldHVybnMgYSByZWZlcmVuY2UgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm5vQ29uZmxpY3QgPSBmdW5jdGlvbigpIHtcbiAgICByb290Ll8gPSBwcmV2aW91c1VuZGVyc2NvcmU7XG4gICAgcmV0dXJuIHRoaXM7XG4gIH07XG5cbiAgLy8gS2VlcCB0aGUgaWRlbnRpdHkgZnVuY3Rpb24gYXJvdW5kIGZvciBkZWZhdWx0IGl0ZXJhdGVlcy5cbiAgXy5pZGVudGl0eSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9O1xuXG4gIC8vIFByZWRpY2F0ZS1nZW5lcmF0aW5nIGZ1bmN0aW9ucy4gT2Z0ZW4gdXNlZnVsIG91dHNpZGUgb2YgVW5kZXJzY29yZS5cbiAgXy5jb25zdGFudCA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH07XG4gIH07XG5cbiAgXy5ub29wID0gZnVuY3Rpb24oKXt9O1xuXG4gIF8ucHJvcGVydHkgPSBwcm9wZXJ0eTtcblxuICAvLyBHZW5lcmF0ZXMgYSBmdW5jdGlvbiBmb3IgYSBnaXZlbiBvYmplY3QgdGhhdCByZXR1cm5zIGEgZ2l2ZW4gcHJvcGVydHkuXG4gIF8ucHJvcGVydHlPZiA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHJldHVybiBvYmogPT0gbnVsbCA/IGZ1bmN0aW9uKCl7fSA6IGZ1bmN0aW9uKGtleSkge1xuICAgICAgcmV0dXJuIG9ialtrZXldO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUmV0dXJucyBhIHByZWRpY2F0ZSBmb3IgY2hlY2tpbmcgd2hldGhlciBhbiBvYmplY3QgaGFzIGEgZ2l2ZW4gc2V0IG9mXG4gIC8vIGBrZXk6dmFsdWVgIHBhaXJzLlxuICBfLm1hdGNoZXIgPSBfLm1hdGNoZXMgPSBmdW5jdGlvbihhdHRycykge1xuICAgIGF0dHJzID0gXy5leHRlbmRPd24oe30sIGF0dHJzKTtcbiAgICByZXR1cm4gZnVuY3Rpb24ob2JqKSB7XG4gICAgICByZXR1cm4gXy5pc01hdGNoKG9iaiwgYXR0cnMpO1xuICAgIH07XG4gIH07XG5cbiAgLy8gUnVuIGEgZnVuY3Rpb24gKipuKiogdGltZXMuXG4gIF8udGltZXMgPSBmdW5jdGlvbihuLCBpdGVyYXRlZSwgY29udGV4dCkge1xuICAgIHZhciBhY2N1bSA9IEFycmF5KE1hdGgubWF4KDAsIG4pKTtcbiAgICBpdGVyYXRlZSA9IG9wdGltaXplQ2IoaXRlcmF0ZWUsIGNvbnRleHQsIDEpO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSBhY2N1bVtpXSA9IGl0ZXJhdGVlKGkpO1xuICAgIHJldHVybiBhY2N1bTtcbiAgfTtcblxuICAvLyBSZXR1cm4gYSByYW5kb20gaW50ZWdlciBiZXR3ZWVuIG1pbiBhbmQgbWF4IChpbmNsdXNpdmUpLlxuICBfLnJhbmRvbSA9IGZ1bmN0aW9uKG1pbiwgbWF4KSB7XG4gICAgaWYgKG1heCA9PSBudWxsKSB7XG4gICAgICBtYXggPSBtaW47XG4gICAgICBtaW4gPSAwO1xuICAgIH1cbiAgICByZXR1cm4gbWluICsgTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKG1heCAtIG1pbiArIDEpKTtcbiAgfTtcblxuICAvLyBBIChwb3NzaWJseSBmYXN0ZXIpIHdheSB0byBnZXQgdGhlIGN1cnJlbnQgdGltZXN0YW1wIGFzIGFuIGludGVnZXIuXG4gIF8ubm93ID0gRGF0ZS5ub3cgfHwgZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuICB9O1xuXG4gICAvLyBMaXN0IG9mIEhUTUwgZW50aXRpZXMgZm9yIGVzY2FwaW5nLlxuICB2YXIgZXNjYXBlTWFwID0ge1xuICAgICcmJzogJyZhbXA7JyxcbiAgICAnPCc6ICcmbHQ7JyxcbiAgICAnPic6ICcmZ3Q7JyxcbiAgICAnXCInOiAnJnF1b3Q7JyxcbiAgICBcIidcIjogJyYjeDI3OycsXG4gICAgJ2AnOiAnJiN4NjA7J1xuICB9O1xuICB2YXIgdW5lc2NhcGVNYXAgPSBfLmludmVydChlc2NhcGVNYXApO1xuXG4gIC8vIEZ1bmN0aW9ucyBmb3IgZXNjYXBpbmcgYW5kIHVuZXNjYXBpbmcgc3RyaW5ncyB0by9mcm9tIEhUTUwgaW50ZXJwb2xhdGlvbi5cbiAgdmFyIGNyZWF0ZUVzY2FwZXIgPSBmdW5jdGlvbihtYXApIHtcbiAgICB2YXIgZXNjYXBlciA9IGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgICByZXR1cm4gbWFwW21hdGNoXTtcbiAgICB9O1xuICAgIC8vIFJlZ2V4ZXMgZm9yIGlkZW50aWZ5aW5nIGEga2V5IHRoYXQgbmVlZHMgdG8gYmUgZXNjYXBlZFxuICAgIHZhciBzb3VyY2UgPSAnKD86JyArIF8ua2V5cyhtYXApLmpvaW4oJ3wnKSArICcpJztcbiAgICB2YXIgdGVzdFJlZ2V4cCA9IFJlZ0V4cChzb3VyY2UpO1xuICAgIHZhciByZXBsYWNlUmVnZXhwID0gUmVnRXhwKHNvdXJjZSwgJ2cnKTtcbiAgICByZXR1cm4gZnVuY3Rpb24oc3RyaW5nKSB7XG4gICAgICBzdHJpbmcgPSBzdHJpbmcgPT0gbnVsbCA/ICcnIDogJycgKyBzdHJpbmc7XG4gICAgICByZXR1cm4gdGVzdFJlZ2V4cC50ZXN0KHN0cmluZykgPyBzdHJpbmcucmVwbGFjZShyZXBsYWNlUmVnZXhwLCBlc2NhcGVyKSA6IHN0cmluZztcbiAgICB9O1xuICB9O1xuICBfLmVzY2FwZSA9IGNyZWF0ZUVzY2FwZXIoZXNjYXBlTWFwKTtcbiAgXy51bmVzY2FwZSA9IGNyZWF0ZUVzY2FwZXIodW5lc2NhcGVNYXApO1xuXG4gIC8vIElmIHRoZSB2YWx1ZSBvZiB0aGUgbmFtZWQgYHByb3BlcnR5YCBpcyBhIGZ1bmN0aW9uIHRoZW4gaW52b2tlIGl0IHdpdGggdGhlXG4gIC8vIGBvYmplY3RgIGFzIGNvbnRleHQ7IG90aGVyd2lzZSwgcmV0dXJuIGl0LlxuICBfLnJlc3VsdCA9IGZ1bmN0aW9uKG9iamVjdCwgcHJvcGVydHksIGZhbGxiYWNrKSB7XG4gICAgdmFyIHZhbHVlID0gb2JqZWN0ID09IG51bGwgPyB2b2lkIDAgOiBvYmplY3RbcHJvcGVydHldO1xuICAgIGlmICh2YWx1ZSA9PT0gdm9pZCAwKSB7XG4gICAgICB2YWx1ZSA9IGZhbGxiYWNrO1xuICAgIH1cbiAgICByZXR1cm4gXy5pc0Z1bmN0aW9uKHZhbHVlKSA/IHZhbHVlLmNhbGwob2JqZWN0KSA6IHZhbHVlO1xuICB9O1xuXG4gIC8vIEdlbmVyYXRlIGEgdW5pcXVlIGludGVnZXIgaWQgKHVuaXF1ZSB3aXRoaW4gdGhlIGVudGlyZSBjbGllbnQgc2Vzc2lvbikuXG4gIC8vIFVzZWZ1bCBmb3IgdGVtcG9yYXJ5IERPTSBpZHMuXG4gIHZhciBpZENvdW50ZXIgPSAwO1xuICBfLnVuaXF1ZUlkID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgdmFyIGlkID0gKytpZENvdW50ZXIgKyAnJztcbiAgICByZXR1cm4gcHJlZml4ID8gcHJlZml4ICsgaWQgOiBpZDtcbiAgfTtcblxuICAvLyBCeSBkZWZhdWx0LCBVbmRlcnNjb3JlIHVzZXMgRVJCLXN0eWxlIHRlbXBsYXRlIGRlbGltaXRlcnMsIGNoYW5nZSB0aGVcbiAgLy8gZm9sbG93aW5nIHRlbXBsYXRlIHNldHRpbmdzIHRvIHVzZSBhbHRlcm5hdGl2ZSBkZWxpbWl0ZXJzLlxuICBfLnRlbXBsYXRlU2V0dGluZ3MgPSB7XG4gICAgZXZhbHVhdGUgICAgOiAvPCUoW1xcc1xcU10rPyklPi9nLFxuICAgIGludGVycG9sYXRlIDogLzwlPShbXFxzXFxTXSs/KSU+L2csXG4gICAgZXNjYXBlICAgICAgOiAvPCUtKFtcXHNcXFNdKz8pJT4vZ1xuICB9O1xuXG4gIC8vIFdoZW4gY3VzdG9taXppbmcgYHRlbXBsYXRlU2V0dGluZ3NgLCBpZiB5b3UgZG9uJ3Qgd2FudCB0byBkZWZpbmUgYW5cbiAgLy8gaW50ZXJwb2xhdGlvbiwgZXZhbHVhdGlvbiBvciBlc2NhcGluZyByZWdleCwgd2UgbmVlZCBvbmUgdGhhdCBpc1xuICAvLyBndWFyYW50ZWVkIG5vdCB0byBtYXRjaC5cbiAgdmFyIG5vTWF0Y2ggPSAvKC4pXi87XG5cbiAgLy8gQ2VydGFpbiBjaGFyYWN0ZXJzIG5lZWQgdG8gYmUgZXNjYXBlZCBzbyB0aGF0IHRoZXkgY2FuIGJlIHB1dCBpbnRvIGFcbiAgLy8gc3RyaW5nIGxpdGVyYWwuXG4gIHZhciBlc2NhcGVzID0ge1xuICAgIFwiJ1wiOiAgICAgIFwiJ1wiLFxuICAgICdcXFxcJzogICAgICdcXFxcJyxcbiAgICAnXFxyJzogICAgICdyJyxcbiAgICAnXFxuJzogICAgICduJyxcbiAgICAnXFx1MjAyOCc6ICd1MjAyOCcsXG4gICAgJ1xcdTIwMjknOiAndTIwMjknXG4gIH07XG5cbiAgdmFyIGVzY2FwZXIgPSAvXFxcXHwnfFxccnxcXG58XFx1MjAyOHxcXHUyMDI5L2c7XG5cbiAgdmFyIGVzY2FwZUNoYXIgPSBmdW5jdGlvbihtYXRjaCkge1xuICAgIHJldHVybiAnXFxcXCcgKyBlc2NhcGVzW21hdGNoXTtcbiAgfTtcblxuICAvLyBKYXZhU2NyaXB0IG1pY3JvLXRlbXBsYXRpbmcsIHNpbWlsYXIgdG8gSm9obiBSZXNpZydzIGltcGxlbWVudGF0aW9uLlxuICAvLyBVbmRlcnNjb3JlIHRlbXBsYXRpbmcgaGFuZGxlcyBhcmJpdHJhcnkgZGVsaW1pdGVycywgcHJlc2VydmVzIHdoaXRlc3BhY2UsXG4gIC8vIGFuZCBjb3JyZWN0bHkgZXNjYXBlcyBxdW90ZXMgd2l0aGluIGludGVycG9sYXRlZCBjb2RlLlxuICAvLyBOQjogYG9sZFNldHRpbmdzYCBvbmx5IGV4aXN0cyBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHkuXG4gIF8udGVtcGxhdGUgPSBmdW5jdGlvbih0ZXh0LCBzZXR0aW5ncywgb2xkU2V0dGluZ3MpIHtcbiAgICBpZiAoIXNldHRpbmdzICYmIG9sZFNldHRpbmdzKSBzZXR0aW5ncyA9IG9sZFNldHRpbmdzO1xuICAgIHNldHRpbmdzID0gXy5kZWZhdWx0cyh7fSwgc2V0dGluZ3MsIF8udGVtcGxhdGVTZXR0aW5ncyk7XG5cbiAgICAvLyBDb21iaW5lIGRlbGltaXRlcnMgaW50byBvbmUgcmVndWxhciBleHByZXNzaW9uIHZpYSBhbHRlcm5hdGlvbi5cbiAgICB2YXIgbWF0Y2hlciA9IFJlZ0V4cChbXG4gICAgICAoc2V0dGluZ3MuZXNjYXBlIHx8IG5vTWF0Y2gpLnNvdXJjZSxcbiAgICAgIChzZXR0aW5ncy5pbnRlcnBvbGF0ZSB8fCBub01hdGNoKS5zb3VyY2UsXG4gICAgICAoc2V0dGluZ3MuZXZhbHVhdGUgfHwgbm9NYXRjaCkuc291cmNlXG4gICAgXS5qb2luKCd8JykgKyAnfCQnLCAnZycpO1xuXG4gICAgLy8gQ29tcGlsZSB0aGUgdGVtcGxhdGUgc291cmNlLCBlc2NhcGluZyBzdHJpbmcgbGl0ZXJhbHMgYXBwcm9wcmlhdGVseS5cbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIHZhciBzb3VyY2UgPSBcIl9fcCs9J1wiO1xuICAgIHRleHQucmVwbGFjZShtYXRjaGVyLCBmdW5jdGlvbihtYXRjaCwgZXNjYXBlLCBpbnRlcnBvbGF0ZSwgZXZhbHVhdGUsIG9mZnNldCkge1xuICAgICAgc291cmNlICs9IHRleHQuc2xpY2UoaW5kZXgsIG9mZnNldCkucmVwbGFjZShlc2NhcGVyLCBlc2NhcGVDaGFyKTtcbiAgICAgIGluZGV4ID0gb2Zmc2V0ICsgbWF0Y2gubGVuZ3RoO1xuXG4gICAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgZXNjYXBlICsgXCIpKT09bnVsbD8nJzpfLmVzY2FwZShfX3QpKStcXG4nXCI7XG4gICAgICB9IGVsc2UgaWYgKGludGVycG9sYXRlKSB7XG4gICAgICAgIHNvdXJjZSArPSBcIicrXFxuKChfX3Q9KFwiICsgaW50ZXJwb2xhdGUgKyBcIikpPT1udWxsPycnOl9fdCkrXFxuJ1wiO1xuICAgICAgfSBlbHNlIGlmIChldmFsdWF0ZSkge1xuICAgICAgICBzb3VyY2UgKz0gXCInO1xcblwiICsgZXZhbHVhdGUgKyBcIlxcbl9fcCs9J1wiO1xuICAgICAgfVxuXG4gICAgICAvLyBBZG9iZSBWTXMgbmVlZCB0aGUgbWF0Y2ggcmV0dXJuZWQgdG8gcHJvZHVjZSB0aGUgY29ycmVjdCBvZmZlc3QuXG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG4gICAgc291cmNlICs9IFwiJztcXG5cIjtcblxuICAgIC8vIElmIGEgdmFyaWFibGUgaXMgbm90IHNwZWNpZmllZCwgcGxhY2UgZGF0YSB2YWx1ZXMgaW4gbG9jYWwgc2NvcGUuXG4gICAgaWYgKCFzZXR0aW5ncy52YXJpYWJsZSkgc291cmNlID0gJ3dpdGgob2JqfHx7fSl7XFxuJyArIHNvdXJjZSArICd9XFxuJztcblxuICAgIHNvdXJjZSA9IFwidmFyIF9fdCxfX3A9JycsX19qPUFycmF5LnByb3RvdHlwZS5qb2luLFwiICtcbiAgICAgIFwicHJpbnQ9ZnVuY3Rpb24oKXtfX3ArPV9fai5jYWxsKGFyZ3VtZW50cywnJyk7fTtcXG5cIiArXG4gICAgICBzb3VyY2UgKyAncmV0dXJuIF9fcDtcXG4nO1xuXG4gICAgdHJ5IHtcbiAgICAgIHZhciByZW5kZXIgPSBuZXcgRnVuY3Rpb24oc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaicsICdfJywgc291cmNlKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlLnNvdXJjZSA9IHNvdXJjZTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuXG4gICAgdmFyIHRlbXBsYXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgcmV0dXJuIHJlbmRlci5jYWxsKHRoaXMsIGRhdGEsIF8pO1xuICAgIH07XG5cbiAgICAvLyBQcm92aWRlIHRoZSBjb21waWxlZCBzb3VyY2UgYXMgYSBjb252ZW5pZW5jZSBmb3IgcHJlY29tcGlsYXRpb24uXG4gICAgdmFyIGFyZ3VtZW50ID0gc2V0dGluZ3MudmFyaWFibGUgfHwgJ29iaic7XG4gICAgdGVtcGxhdGUuc291cmNlID0gJ2Z1bmN0aW9uKCcgKyBhcmd1bWVudCArICcpe1xcbicgKyBzb3VyY2UgKyAnfSc7XG5cbiAgICByZXR1cm4gdGVtcGxhdGU7XG4gIH07XG5cbiAgLy8gQWRkIGEgXCJjaGFpblwiIGZ1bmN0aW9uLiBTdGFydCBjaGFpbmluZyBhIHdyYXBwZWQgVW5kZXJzY29yZSBvYmplY3QuXG4gIF8uY2hhaW4gPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgaW5zdGFuY2UgPSBfKG9iaik7XG4gICAgaW5zdGFuY2UuX2NoYWluID0gdHJ1ZTtcbiAgICByZXR1cm4gaW5zdGFuY2U7XG4gIH07XG5cbiAgLy8gT09QXG4gIC8vIC0tLS0tLS0tLS0tLS0tLVxuICAvLyBJZiBVbmRlcnNjb3JlIGlzIGNhbGxlZCBhcyBhIGZ1bmN0aW9uLCBpdCByZXR1cm5zIGEgd3JhcHBlZCBvYmplY3QgdGhhdFxuICAvLyBjYW4gYmUgdXNlZCBPTy1zdHlsZS4gVGhpcyB3cmFwcGVyIGhvbGRzIGFsdGVyZWQgdmVyc2lvbnMgb2YgYWxsIHRoZVxuICAvLyB1bmRlcnNjb3JlIGZ1bmN0aW9ucy4gV3JhcHBlZCBvYmplY3RzIG1heSBiZSBjaGFpbmVkLlxuXG4gIC8vIEhlbHBlciBmdW5jdGlvbiB0byBjb250aW51ZSBjaGFpbmluZyBpbnRlcm1lZGlhdGUgcmVzdWx0cy5cbiAgdmFyIHJlc3VsdCA9IGZ1bmN0aW9uKGluc3RhbmNlLCBvYmopIHtcbiAgICByZXR1cm4gaW5zdGFuY2UuX2NoYWluID8gXyhvYmopLmNoYWluKCkgOiBvYmo7XG4gIH07XG5cbiAgLy8gQWRkIHlvdXIgb3duIGN1c3RvbSBmdW5jdGlvbnMgdG8gdGhlIFVuZGVyc2NvcmUgb2JqZWN0LlxuICBfLm1peGluID0gZnVuY3Rpb24ob2JqKSB7XG4gICAgXy5lYWNoKF8uZnVuY3Rpb25zKG9iaiksIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHZhciBmdW5jID0gX1tuYW1lXSA9IG9ialtuYW1lXTtcbiAgICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gW3RoaXMuX3dyYXBwZWRdO1xuICAgICAgICBwdXNoLmFwcGx5KGFyZ3MsIGFyZ3VtZW50cyk7XG4gICAgICAgIHJldHVybiByZXN1bHQodGhpcywgZnVuYy5hcHBseShfLCBhcmdzKSk7XG4gICAgICB9O1xuICAgIH0pO1xuICB9O1xuXG4gIC8vIEFkZCBhbGwgb2YgdGhlIFVuZGVyc2NvcmUgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyIG9iamVjdC5cbiAgXy5taXhpbihfKTtcblxuICAvLyBBZGQgYWxsIG11dGF0b3IgQXJyYXkgZnVuY3Rpb25zIHRvIHRoZSB3cmFwcGVyLlxuICBfLmVhY2goWydwb3AnLCAncHVzaCcsICdyZXZlcnNlJywgJ3NoaWZ0JywgJ3NvcnQnLCAnc3BsaWNlJywgJ3Vuc2hpZnQnXSwgZnVuY3Rpb24obmFtZSkge1xuICAgIHZhciBtZXRob2QgPSBBcnJheVByb3RvW25hbWVdO1xuICAgIF8ucHJvdG90eXBlW25hbWVdID0gZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgb2JqID0gdGhpcy5fd3JhcHBlZDtcbiAgICAgIG1ldGhvZC5hcHBseShvYmosIGFyZ3VtZW50cyk7XG4gICAgICBpZiAoKG5hbWUgPT09ICdzaGlmdCcgfHwgbmFtZSA9PT0gJ3NwbGljZScpICYmIG9iai5sZW5ndGggPT09IDApIGRlbGV0ZSBvYmpbMF07XG4gICAgICByZXR1cm4gcmVzdWx0KHRoaXMsIG9iaik7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gQWRkIGFsbCBhY2Nlc3NvciBBcnJheSBmdW5jdGlvbnMgdG8gdGhlIHdyYXBwZXIuXG4gIF8uZWFjaChbJ2NvbmNhdCcsICdqb2luJywgJ3NsaWNlJ10sIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICB2YXIgbWV0aG9kID0gQXJyYXlQcm90b1tuYW1lXTtcbiAgICBfLnByb3RvdHlwZVtuYW1lXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIHJlc3VsdCh0aGlzLCBtZXRob2QuYXBwbHkodGhpcy5fd3JhcHBlZCwgYXJndW1lbnRzKSk7XG4gICAgfTtcbiAgfSk7XG5cbiAgLy8gRXh0cmFjdHMgdGhlIHJlc3VsdCBmcm9tIGEgd3JhcHBlZCBhbmQgY2hhaW5lZCBvYmplY3QuXG4gIF8ucHJvdG90eXBlLnZhbHVlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX3dyYXBwZWQ7XG4gIH07XG5cbiAgLy8gUHJvdmlkZSB1bndyYXBwaW5nIHByb3h5IGZvciBzb21lIG1ldGhvZHMgdXNlZCBpbiBlbmdpbmUgb3BlcmF0aW9uc1xuICAvLyBzdWNoIGFzIGFyaXRobWV0aWMgYW5kIEpTT04gc3RyaW5naWZpY2F0aW9uLlxuICBfLnByb3RvdHlwZS52YWx1ZU9mID0gXy5wcm90b3R5cGUudG9KU09OID0gXy5wcm90b3R5cGUudmFsdWU7XG5cbiAgXy5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJycgKyB0aGlzLl93cmFwcGVkO1xuICB9O1xuXG4gIC8vIEFNRCByZWdpc3RyYXRpb24gaGFwcGVucyBhdCB0aGUgZW5kIGZvciBjb21wYXRpYmlsaXR5IHdpdGggQU1EIGxvYWRlcnNcbiAgLy8gdGhhdCBtYXkgbm90IGVuZm9yY2UgbmV4dC10dXJuIHNlbWFudGljcyBvbiBtb2R1bGVzLiBFdmVuIHRob3VnaCBnZW5lcmFsXG4gIC8vIHByYWN0aWNlIGZvciBBTUQgcmVnaXN0cmF0aW9uIGlzIHRvIGJlIGFub255bW91cywgdW5kZXJzY29yZSByZWdpc3RlcnNcbiAgLy8gYXMgYSBuYW1lZCBtb2R1bGUgYmVjYXVzZSwgbGlrZSBqUXVlcnksIGl0IGlzIGEgYmFzZSBsaWJyYXJ5IHRoYXQgaXNcbiAgLy8gcG9wdWxhciBlbm91Z2ggdG8gYmUgYnVuZGxlZCBpbiBhIHRoaXJkIHBhcnR5IGxpYiwgYnV0IG5vdCBiZSBwYXJ0IG9mXG4gIC8vIGFuIEFNRCBsb2FkIHJlcXVlc3QuIFRob3NlIGNhc2VzIGNvdWxkIGdlbmVyYXRlIGFuIGVycm9yIHdoZW4gYW5cbiAgLy8gYW5vbnltb3VzIGRlZmluZSgpIGlzIGNhbGxlZCBvdXRzaWRlIG9mIGEgbG9hZGVyIHJlcXVlc3QuXG4gIGlmICh0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpIHtcbiAgICBkZWZpbmUoJ3VuZGVyc2NvcmUnLCBbXSwgZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gXztcbiAgICB9KTtcbiAgfVxufS5jYWxsKHRoaXMpKTtcbiJdfQ==
