var _ = require("underscore"),
	Events = require("./events");

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

// finds the DOMRange the element is a part of
DOMRange.forElement = function (elem) {
	if (elem.nodeType !== 1) throw new Error("Expected element, found: " + elem);
	
	var range = null;
	
	while (elem && !range) {
		range = (elem.$blaze_range || null);
		elem = elem.parentNode;
	}

	return range;
};

DOMRange.destroy = function (m, _skipNodes) {
	if (m instanceof DOMRange) {
		m.trigger("destroy", _skipNodes);
	}

	else if (!_skipNodes && m.nodeType === 1 && m.$blaze_range) {
		Blaze._destroyNode(m);
		m.$blaze_range = null;
	}
};

_.extend(DOMRange.prototype, Events, {

	// This method is called to insert the DOMRange into the DOM for
	// the first time, but it's also used internally when
	// updating the DOM.
	// If _isMove is true, move this attached range to a different
	// location under the same parentElement.
	paint: function(parentElement, nextNode, _isMove, _isReplace) {
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
		if (!(_isMove || _isReplace)) this.trigger("paint", parentElement);
	},

	detach: function(_isReplace) {
		if (!this.attached) throw new Error("Must be attached");

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
			this.trigger("detach", parentElement);
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

		// dereference old members
		for (var i = 0; i < oldMembers.length; i++) this._memberOut(oldMembers[i]);

		// reference new members
		for (var i = 0; i < newMembers.length; i++) this._memberIn(newMembers[i]);

		if (!this.attached) {
			this.members = newMembers;
		} else {
			// don't do anything if we're going from empty to empty
			if (newMembers.length || oldMembers.length) {
				// detach the old members and insert the new members
				var nextNode = this.lastNode().nextSibling;
				var parentElement = this.parentElement;
				// Use detach/paint, but don't trigger events
				this.detach(true /*_isReplace*/);
				this.members = newMembers;
				this.paint(parentElement, nextNode, false, true /*_isReplace*/);
			}
		}
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
	},

	removeMember: function(atIndex, _isMove) {
		var members = this.members;
		if (!(atIndex >= 0 && atIndex < members.length)) {
			throw new Error("Bad index in range.removeMember: " + atIndex);
		}

		if (_isMove) {
			members.splice(atIndex, 1);
		} else {
			var oldMember = members[atIndex];
			this._memberOut(oldMember);

			if (members.length === 1) {
				// becoming empty; use the logic in setMembers
				this.setMembers([]);
			} else {
				members.splice(atIndex, 1);
				if (this.attached) removeFromDOM(oldMember);
			}
		}
	},

	moveMember: function(oldIndex, newIndex) {
		var member = this.members[oldIndex];
		this.removeMember(oldIndex, true /*_isMove*/);
		this.addMember(member, newIndex, true /*_isMove*/);
	},

	// Tear down, but don't remove, the members.  Used when chunks
	// of DOM are being torn down or replaced.
	destroyMembers: function(_skipNodes) {
		var members = this.members;
		for (var i = 0; i < members.length; i++) {
			this._memberOut(members[i], _skipNodes);
		}
	},

	_memberIn: function(m) {
		if (m instanceof DOMRange) {
			m.parentRange = this;
		} else if (m.nodeType === 1) { // DOM Element
			m.$blaze_range = this;
		}
	},

	_memberOut: DOMRange.destroy,

	destroy: function(_skipNodes) {
		DOMRange.destroy(this, _skipNodes);
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

		var range = elem.$blaze_range;
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

	findAll: function (selector) {
		
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
		m.paint(parentElement, nextNode, _isMove);
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