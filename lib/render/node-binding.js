var _ = require("underscore"),
	util = require("../util"),
	NODE_TYPE = require("../types"),
	Binding = require("./binding"),
	Section = require("./section");

var NodeBinding =
module.exports = Binding.extend({
	initialize: function() {
		_.extend(this, {
			fragment: document.createDocumentFragment(),
			nodes: []
		});

		this.render();
		this.detach();
	},

	// render creates the dom parts
	render: function() {},

	// update takes data and makes sure the element is up to snuff
	_update: function(scope) {},

	// render the nodes here; update() will continue in place
	appendTo: function(parent, before) {
		this.nodes.forEach(function(node) {
			parent.insertBefore(node, before);
		}, this);

		return this;
	},

	// remove it from dom, but don't destroy
	detach: function() {
		return this.appendTo(this.fragment);
	},

	// destroy completely... sort of...
	_destroy: function() {
		this.detach();
		delete this.fragment;
		delete this.nodes;
		this.destroyed = true;
		return this;
	}
});

NodeBinding[NODE_TYPE.SECTION] =
NodeBinding[NODE_TYPE.INVERTED] = NodeBinding.extend({
	render: function() {
		this.section = new Section(this.template, Binding.buildDOM);
		this.placeholder = document.createComment(_.uniqueId("$"));
		this.nodes.push(this.placeholder);
	},

	_update: function(scope) {
		var len = this.section.length();
		this.section.process(scope);
		
		if (this.section.length() - len > 0) {
			_.flatten(this.section.rows.slice(len)).forEach(function(node) {
				node.appendTo(this.placeholder.parentNode, this.placeholder);
			}, this)
		}
	},

	appendTo: function(parent, before) {
		_.flatten(this.section.rows).forEach(function(node) {
			node.appendTo(parent, before);
		});

		return NodeBinding.prototype.appendTo.apply(this, arguments);
	},

	_destroy: function() {
		this.section.destroy();
		return NodeBinding.prototype._destroy.apply(this, arguments);
	}
});

NodeBinding[NODE_TYPE.ELEMENT] = NodeBinding.extend({
	render: function() {
		var el = this.node = document.createElement(this.template.name);
		this.nodes.push(el);
		this.children = Binding.buildDOM(this.template.children);
		this.children.forEach(function(child) { child.appendTo(el); });
	},

	_update: function(scope) {
		this.children.forEach(function(child) { child.update(scope); });
	},

	_destroy: function() {
		this.children.forEach(function(child) { child.destroy(); });
		return NodeBinding.prototype._destroy.apply(this, arguments);
	}
});

NodeBinding[NODE_TYPE.TEXT] = NodeBinding.extend({
	render: function() {
		this.nodes.push(document.createTextNode(this.template.value));
	}
});

NodeBinding[NODE_TYPE.INTERPOLATOR] = NodeBinding.extend({
	render: function() {
		this.node = document.createTextNode("");
		this.nodes.push(this.node);
	},

	_update: function(scope) {
		var val = scope.get(this.template.value);
		this.node.nodeValue = val != null ? val : "";
	}
});