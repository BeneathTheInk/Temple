var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util");

module.exports = Binding.extend({
	constructor: function(condition, body, elseBody) {
		if (!_.isFunction(condition)) {
			var v = condition;
			condition = function() { return v; }
		}

		if (!_.isFunction(body))
			throw new Error("Expecting function for binding body.");

		this.compute = condition;
		this.body = body;
		this.elseBody = _.isFunction(elseBody) ? elseBody : null;
		this.placeholder = document.createComment(_.uniqueId("$"));

		// when children are added, append to element node
		this.on("child:add", function(child) {
			if (this.placeholder.parentNode != null)
				child.appendTo(this.placeholder.parentNode, this.placeholder);
		});

		this.on("child:remove", function(child) {
			child.detach();
		});

		Binding.call(this);
	},

	render: function() {
		// remove all children
		this.removeChild(this.children.slice(0));

		// append the new body
		var body = this[this.compute() ? "body" : "elseBody"];
		if (body != null) this.appendChild(body.call(this));
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.autorun("render", this.render);
		return Binding.prototype.appendTo.apply(this, arguments);
	},

	detach: function() {
		var parent = this.node.parentNode;
		if (parent != null) parent.removeChild(this.node);
		Binding.prototype.detach.apply(this, arguments);
		this.removeChild(this.children.slice(0));
		return this;
	}

});