var _ = require("underscore"),
	util = require("../util"),
	Deps = require("../deps"),
	Scope = require("../scope");

var Binding =
module.exports = Scope.extend({
	
	constructor: function() {
		 // parse args
        var data, args = _.toArray(arguments).slice(0);
        if (!(args[0] instanceof Binding)) data = args.shift();
         
        // exec scope constructor
        Scope.call(this, data);
 
        // append children
        if (args.length) this.addChild(args);

		this.initialize();
	},

	initialize: function(){},

	mount: function() {
		this.children.forEach(function(child) { child.mount(); });
		this.trigger("mount");
		this._mounted = true;
		return this;
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

		delete this._mounted;
		this.trigger("detach");
		return this;
	},

	paint: function(parent, beforeNode) {
		if (_.isString(parent)) parent = document.querySelector(parent);
		if (_.isString(beforeNode)) beforeNode = parent.querySelector(beforeNode);
		if (parent == null) parent = document.createDocumentFragment();
		
		if (!this._mounted) this.mount();
		this.appendTo(parent, beforeNode);

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

	toHTML: function() { return this.toString(); }

});

Binding.isBinding = function(obj) {
	return obj instanceof Binding;
}

// load the real bindings
Binding.Text		= require("./text");
Binding.Element		= require("./element");
Binding.HTML		= require("./html");
Binding.Each		= require("./each");
Binding.React		= require("./react");