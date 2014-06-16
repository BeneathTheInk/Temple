var _ = require("underscore"),
	util = require("../util"),
	Deps = require("../deps"),
	Scope = require("../scope");

var Binding =
module.exports = Scope.extend({
	
	constructor: function() {
		this.children = [];

		// event that proxies changes to all children
		this.on("change", function() {
			var args = _.toArray(arguments);
			this.children.forEach(function(child) {
				child._onChange.apply(child, args);
			});
		});

		// parse args
		var model, args = _.toArray(arguments).slice(0);
		if (!(args[0] instanceof Binding)) model = args.shift();
		
		// exec scope constructor
		Scope.call(this, model);

		// append children
		if (args.length) this.appendChild(args);
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

		// remove from existing parent
		if (child.parent != null) child.parent.removeChild(child);

		this.children.push(child);
		var self = child.parent = this;

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
			this.trigger("child:remove", child);
		}

		return this;
	},

	// custom get models that also looks up the parent tree
	getModels: function() {
		var models = Scope.prototype.getModels.call(this);
		if (this.parent != null) models = models.concat(this.parent.getModels());
		return models;
	},

	appendTo: function(parent, beforeNode) {
		this.children.slice(0).forEach(function(child) {
			child.appendTo(parent, beforeNode);
		});

		this.trigger("append", parent, beforeNode);
		return this;
	},

	detach: function() {
		this.children.slice(0).forEach(function(child) {
			child.detach();
		});

		this.trigger("detach");
		return this;
	},

	paint: function(parent, beforeNode) {
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		if (parent == null) parent = document.createDocumentFragment();
		return this.appendTo(parent, beforeNode);
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

	toHTML: function() { return this.toString(); }

});

// load the real bindings
Binding.Text		= require("./text");
Binding.Element		= require("./element");
Binding.HTML		= require("./html");
// Binding.Context		= require("./context");
// Binding.Each		= require("./each");
// Binding.Component	= require("./component");