var _ = require("underscore");
var utils = require("./utils");
var assignProps = require("assign-props");

function NodeRange(parent, before) {
	this.children = this.childNodes = [];
	this.placeholderNode = document.createComment(_.uniqueId("$"));
	this.moveTo(parent, before);
}

module.exports = NodeRange;
NodeRange.isNodeRange = function(o) {
	return o instanceof NodeRange;
};

_.extend(NodeRange.prototype, {
	nodeType: Node.ELEMENT_NODE,
	nodeName: "_range",
	ownerDocument: document,

	append: function() {
		return _.map(_.flatten(arguments), this.appendChild, this);
	},

	appendChild: function(n) {
		return this.insertBefore(n, null);
	},

	insertBefore: function(child, before) {
		// default index is the end
		var index = this.children.length,
			cindex;

		// incremental-dom sometimes passes the placeholder
		if (before === this.placeholderNode) {
			before = null;
		}

		// obtain the index to insert at
		if (before != null) {
			// if node is already at this location, no need to continue
			if (before === child || before.previousSibling === child) return child;

			index = this.children.indexOf(before);
			if (index < 0) {
				console.log(before);
				throw new Error("Element to place before is not a child of this range.");
			}
		}

		// do special things if child is already a child of this parent
		cindex = this.children.indexOf(child);
		if (cindex > -1) {
			// remove the child
			this.children.splice(cindex, 1);

			// update the index since it may have changed
			index = before != null ? this.children.indexOf(before) : this.children.length;
		}

		// add the child
		this.children.splice(index, 0, child);

		if (this.containerNode) {
			this.containerNode.insertBefore(child, before || this.nextSibling);
		}

		// return the child
		return child;
	},

	removeChild: function(child) {
		console.trace();
		var index = this.children.indexOf(child);
		if (!~index) return;

		// remove child
		while (index > -1) {
			this.children.splice(index, 1);
			index = this.children.indexOf(child, index);
		}

		if (this.containerNode) {
			this.containerNode.removeChild(child);
		}

		return child;
	},

	empty: function() {
		this.children.slice().forEach(function(child) {
			this.removeChild(child);
		}, this);
		return this;
	},

	moveTo: function(parent, before) {
		if (parent) {
			this.containerNode = parent;
			parent.insertBefore(this.placeholderNode, before);
			utils.insertNodes(this.children, parent, this.placeholderNode);
		} else if (this.containerNode) {
			this.children.forEach(function(child) {
				this.containerNode.removeChild(child);
			}, this);
			this.containerNode.removeChild(this.placeholderNode);
			this.containerNode = null;
		}

		return this;
	},

	detach: function() {
		this.children.splice(0, this.children.length);
		this.moveTo(null);
		return this;
	},

	refreshPosition: function() {
		var c = this.lastChild;
		if (c != null) this.moveTo(c.parentNode, c);
		return this;
	}
});

Object.defineProperties(NodeRange.prototype, {
	firstChild: {
		configurable: false,
		enumerable: true,
		get: function() {
			return this.children[0] || null;
		}
	},
	lastChild: {
		configurable: false,
		enumerable: true,
		get: function() {
			return _.last(this.children) || null;
		}
	},
	nextSibling: {
		configurable: false,
		enumerable: true,
		get: function() {
			return this.containerNode ? this.placeholderNode : null;
		}
	}
});
