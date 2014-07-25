var _ = require("underscore"),
	Events = require("./events"),
	Deps = require("./deps");

function Binding() {
	this.children = [];
	this.parent = null;
	_.toArray(arguments).forEach(this.appendChild, this);
}

module.exports = Binding;

_.extend(Binding.prototype, Events, {
	insertBefore: function(child, before) {
		// special case for strings
		if (_.isString(child)) child = new Binding.Text(child);

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
		if (_.contains(this.children, child)) {
			// remove child
			this.children = _.without(this.children, child);
			child.parent = null;

			// trigger events
			this.trigger("child:remove", child);
			child.trigger("parent", null);

			// update nodes last
			child.updateNodes();

			return child;
		}
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
		_.invoke(this.children.slice(0).reverse(), "updateNodes");
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
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		if (parent == null) parent = document.createDocumentFragment();
		if (this.placeholder == null) this.placeholder = document.createComment(_.uniqueId("$"));

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

// other static methods
Binding.isBinding = function(o) {
	return o instanceof Binding;
}

// the subclassing function found in Backbone
Binding.extend = function(protoProps, staticProps) {
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

Binding.isNodeAtDOMPosition = function(node, parent, before) {
	return node.parentNode === parent && node.nextSibling === before;
}

// Load the bindings
_.extend(Binding, require("./node"));
Binding.HTML = require("./html");
Binding.React = require("./react");
