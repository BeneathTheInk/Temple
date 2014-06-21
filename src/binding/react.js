var _ = require("underscore"),
	util = require("../util"),
	Binding = require("./index");

module.exports = Binding.extend({
	constructor: function() {
		this.placeholder = document.createComment(_.uniqueId("$"));

		// binding constructor
		Binding.call(this);
	},

	render: function() {
		throw new Error("Missing render function");
	},

	refreshNodes: function() {
		var parent = this.placeholder.parentNode;
		
		if (this.isMounted() && parent != null) {
			this.children.forEach(function(child) {
				child.appendTo(parent, this.placeholder);
			}, this);
		}

		return this;
	},

	_mount: function() {
		var args = _.toArray(arguments),
			self = this;

		self.autorun("render", function(comp) {
			var bindings = this.render.apply(this, args);

			if (bindings != null) this.addChild(bindings);
			this.refreshNodes();

			comp.onInvalidate(function() {
				self.removeChild(bindings);
			});
		});
	},

	_detach: function() {
		this.stopComputation("render");
		var parent = this.placeholder.parentNode;
		if (parent != null) parent.removeChild(this.placeholder);
		return Binding.prototype._detach.apply(this, arguments);
	},

	_appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.refreshNodes();
	}
});