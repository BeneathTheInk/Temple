var Events = require("./events"),
	Deps = require("./deps"),
	util = require("./util");

function Binding() {
	this.children = [];
	this.parent = null;
	util.toArray(arguments).forEach(this.appendChild, this);
}

module.exports = Binding;
Binding.extend = util.subclass;
Binding.isBinding = function(o) {
	return o instanceof Binding;
}

util.extend(Binding.prototype, Events, {
	insertBefore: function(child, before) {
		// special case for strings
		if (typeof child === "string") child = new Binding.Text(child);

		if (!Binding.isBinding(child))
			throw new Error("Expecting child to be a binding.");

		if (child === this)
			throw new Error("Cannot add binding as a child of itself.");

		// get the index to insert at
		var index = -1;
		if (before != null) index = this.indexOf(before);
		if (!~index) index = this.children.length;

		// remove from existing parent
		if (child.parent != null) child.parent.removeChild(child);

		// add the child
		this.children.splice(index, 0, child);
		child.parent = this;

		// trigger events
		this.trigger("child:add", child, before);
		child.trigger("parent", this);

		// update nodes last
		child.updateNodes();

		return child;
	},

	appendChild: function(child) {
		return this.insertBefore(child);
	},

	removeChild: function(child) {
		var index = this.children.indexOf(child);
		if (!~index) return;

		// remove child
		this.children.splice(index, 1);
		child.parent = null;

		// trigger events
		this.trigger("child:remove", child);
		child.trigger("parent", null);

		// update nodes last
		child.updateNodes();

		return child;
	},

	contains: function(child) {
		return this.indexOf(child) > -1;
	},

	indexOf: function(child) {
		return this.children.indexOf(child);
	},

	firstChild: function() {
		return this.children[0] || null;
	},

	lastChild: function() {
		var len = this.children.length;
		return len ? this.children[len - 1] : null;
	},

	nextSibling: function() {
		if (this.isRoot()) return null;

		var index = this.parent.indexOf(this),
			children = this.parent.children;

		return index > -1 && index < children.length - 1 ? children[index + 1] : null;
	},

	previousSibling: function() {
		if (this.isRoot()) return null;

		var index = this.parent.indexOf(this),
			children = this.parent.children;

		return index > 0 && index < children.length ? children[index - 1] : null;
	},

	isRoot: function() {
		return this.parent == null;
	},

	updateNodes: function() {
		this.children.slice(0).reverse().forEach(function(child) {
			child.updateNodes();
		});

		this.trigger("update");
		return this;
	},

	toNodes: function() {
		return this.children.reduce(function(nodes, child) {
			nodes.push.apply(nodes, child);
			return nodes;
		}, []);
	},

	parentNode: function() {
		if (this.isRoot()) {
			return this.placeholder != null ?
				this.placeholder.parentNode :
				null;
		}

		var parent = this.parent;

		while (parent != null) {
			if (parent instanceof Binding.Node) return parent.node;
			if (parent.isRoot()) return parent.parentNode();
			parent = parent.parent;
		}

		return null;
	},

	firstNode: function() {
		return this.children.length ? this.children[0].firstNode() : null;
	},

	nextSiblingNode: function() {
		if (this.isRoot()) {
			return this.placeholder != null ?
				this.placeholder :
				null;
		}

		var nextSibling = this.nextSibling();
		return nextSibling != null ? nextSibling.firstNode() :
			this.parent instanceof Binding.Node ? null :
			this.parent.nextSiblingNode();
	},

	paint: function(parent, beforeNode) {
		if (typeof parent === "string") parent = document.querySelector(parent);
		if (typeof beforeNode === "string") beforeNode = parent.querySelector(beforeNode);
		if (parent == null) parent = document.createDocumentFragment();
		if (this.placeholder == null) this.placeholder = document.createComment(util.uniqueId("$"));

		parent.insertBefore(this.placeholder, beforeNode);
		this.updateNodes();
		this.trigger("paint", parent, beforeNode);

		return this;
	},

	detach: function() {
		if (this.placeholder != null && this.placeholder.parentNode) {
			this.placeholder.parentNode.removeChild(this.placeholder);
		}

		this.updateNodes();
		this.trigger("detach");

		return this;
	},

	autorun: function(fn) {
		return Deps.autorun(fn.bind(this));
	}
});

// Load the bindings
util.extend(Binding, require("./node"));
Binding.HTML = require("./html");
Binding.React = require("./react");
