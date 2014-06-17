var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util");

module.exports = Binding.extend({
	constructor: function(render, data) {
		this.placeholder = document.createComment(_.uniqueId("$"));
		
		if (_.isFunction(render)) this.render = render;
		else data = render;

		// when children are added, append to placeholder
		this.on("child:add", function(child) {
			if (this.placeholder.parentNode != null) {
				child.paint(this.placeholder.parentNode, this.placeholder);
			}
		});
 
		this.on("child:remove", function(child) {
			child.detach();
		});

		Binding.call(this, data);
	},

	mount: function() {
		this.autorun("render", function(comp) {
			var bindings = this.render.call(this),
				self = this;

			// append the new body
			if (bindings != null) this.addChild(bindings);
			
			// remove all bindings when invalidated
			comp.onInvalidate(function() {
				self.removeChild(bindings);
			});
		});

		return Binding.prototype.mount.apply(this, arguments);
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		return Binding.prototype.appendTo.call(this, parent, this.placeholder);
	},

	detach: function() {
		this.stopComputation("render");
		var parent = this.placeholder.parentNode;
		if (parent != null) parent.removeChild(this.placeholder);
		return Binding.prototype.detach.apply(this, arguments);
	}

});