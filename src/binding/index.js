var _ = require("underscore"),
	util = require("../util"),
	Deps = require("../deps"),
	Scope = require("../scope");

var Binding =
module.exports = Scope.extend({
	
	constructor: function() {
		this.children = [];

		var model, args = _.toArray(arguments).slice(0);
		if (!(args[0] instanceof Binding)) model = args.shift();
		if (args.length) this.appendChild(args);
		Scope.call(this, model);
	},

	appendChild: function(child) {
		if (_.isArray(child)) {
			child.forEach(this.appendChild, this);
			return this;
		}

		if (!(child instanceof Binding))
			throw new Error("Expected array or instances of Binding for children.");

		// ensure the binding is not already a child
		if (~this.children.indexOf(child)) return this;

		// ensure binding doesn't already have a parent
		if (child.parent != null && child.parent !== this)
			throw new Error("Child binding already has a parent.");

		this.children.push(child);
		var self = child.parent = this;

		this.listenTo(child, "destroy", function() {
			self.removeChild(child);
		});

		this.trigger("child:add", child);

		return this;
	},

	removeChild: function(child) {
		if (_.isArray(child)) {
			child.forEach(this.removeChild, this);
			return this;
		}

		var index = this.children.indexOf(child);
		
		if (~index) {
			this.children.splice(index, 1);
			this.stopListening(child);
			this.trigger("child:remove", child);
		}

		return this;
	},

	appendTo: function(parent, beforeNode) {
		this.children.slice(0).forEach(function(child) {
			child.appendTo(parent, beforeNode);
		});

		this.trigger("append", parent, beforeNode);
		return this;
	},

	paint: function(parent, beforeNode) {
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		if (parent == null) parent = document.createDocumentFragment();
		return this.appendTo(parent, beforeNode);
	},

	erase: function() {
		_.invoke(this.children.slice(0), "destroy");
		this.trigger("erase");
		return this;
	},

	find: function(selector) {
		var el = null;
		
		this.children.some(function(child) {
			return !!(el = child.find(selector));
		});

		return el;
	},

	findAll: function(selector) {
		var els = []

		this.children.forEach(function(child) {
			els = els.concat(child.findAll(selector));
		});

		return els;
	},

	toString: function() {
		return this.children.map(function(child) {
			return child.toString();
		}).join("");
	},

	toHTML: function() { return this.toString(); },

	destroy: function() {
		this.erase();
		return Scope.prototype.destroy.apply(this, arguments);
	}

});

// load the real bindings
Binding.Text		= require("./text");
Binding.Element		= require("./element");
// Binding.HTML		= require("./html");
// Binding.Context		= require("./context");
// Binding.Each		= require("./each");
// Binding.Component	= require("./component");