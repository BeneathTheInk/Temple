var _ = require("underscore"),
	util = require("../util"),
	Deps = require("../deps"),
	Scope = require("../scope");

var Binding =
module.exports = Scope.extend({
	
	constructor: function() {
		this.children = [];
		this._comps = {};
		this._directives = {};

		var model, args = _.toArray(arguments).slice(0);
		if (!(args[0] instanceof Binding)) model = args.shift();
		if (args.length) this.addChild(args);
		Scope.call(this, model);
	},

	// Creates a child binding from klass, with arguments. Uses
	// a bit of trickery to get the parent in the object before
	// construction, making it preferable over using 'new'.
	createChild: function(klass) {
		if (!util.isSubClass(Binding, klass))
			throw new Error("Can only create children from subclasses of Binding.");

		var args = _.toArray(arguments).slice(1);

		var child = Object.create(klass.prototype);
		child.parent = this;
		klass.apply(child, args);

		// must be added as a child
		this.addChild(child);

		return child;
	},

	addChild: function(child) {
		if (_.isArray(child)) {
			child.forEach(this.addChild, this);
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

		child.on("destroy", child._parentDestroyEvent = function() {
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
			child.off("destroy", child._parentDestroyEvent);
			delete child._parentDestroyEvent;
			this.trigger("child:remove", child);
		}

		return this;
	}

});