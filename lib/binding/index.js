var _ = require("underscore"),
	util = require("../util"),
	Deps = require("../deps"),
	EventEmitter = require("events").EventEmitter;

var Binding = module.exports =
util.subclass.call(EventEmitter, {
	constructor: function() {
		this.children = [];

		var children = _.toArray(arguments);
		if (children.length) this.addChild(children);
	},

	addChild: function(child) {
		_.flatten(_.toArray(arguments)).forEach(function(child) {
			if (!(child instanceof Binding))
				throw new Error("Can only add instances of Binding as children.");

			if (child.parent != null) {
				if (child.parent !== this) throw new Error("Child binding already has a parent set.");
				return this;
			}

			var self, removeChild, destroyChild;

			this.children.push(child);
			self = child.parent = this;

			child.on("destroy", child._parentDestroyEvent = function() {
				self.removeChild(child);
			});

			this.emit("child:add", child);
		}, this);

		return this;
	},

	removeChild: function(child) {
		_.flatten(_.toArray(arguments)).forEach(function(child) {
			var index = this.children.indexOf(child);
			if (~index) {
				this.children.splice(index, 1);
				child.removeListener("destroy", child._parentDestroyEvent);
				this.emit("child:remove", child);
			}
		}, this);

		return this;
	},

	// runs fn when deps change
	autorun: function(fn) {
		var comp, stop, self = this;
		
		this.on("destroy", stop = function() {
			comp.stop();
			self.removeListener("destroy", stop);
		});
		
		comp = Deps.autorun(function(comp) {
			fn.call(self, comp);
			
			comp.onInvalidate(function() {
				if (comp.stopped) stop();
			});
		});

		return comp;
	},

	render: function(scope) {
		this.children.slice(0).forEach(function(child) {
			child.render(scope);
		});

		return this;
	},

	appendTo: function(parent, before) {
		this.children.slice(0).forEach(function(child) {
			child.appendTo(parent, before);
		});

		return this;
	},

	toString: function() {
		return this.children.slice(0).map(function(child) {
			return child.toString();
		}).join("");
	},

	destroy: function() {
		this.children.slice(0).forEach(function(child) {
			child.destroy();
		});

		this.emit("destroy");
		return this;
	}
}, {
	extend: util.subclass
});

// Load the real bindings
Binding.Text	= require("./text");
Binding.Element	= require("./element");
Binding.HTML	= require("./html");
Binding.Context	= require("./context");
Binding.Each	= require("./each");