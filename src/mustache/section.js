var _ = require("underscore"),
	Binding = require("../binding"),
	util = require("../util"),
	Model = require("../model"),
	Deps = require("../deps");

var Section =
module.exports = Binding.extend({
	constructor: function(path, body, inverted) {
		if (!_.isString(path))
			throw new Error("Expecting string path.");

		if (!_.isFunction(body))
			throw new Error("Expecting function for body.");

		this.path = path;
		this.body = function() {
			var args = arguments, ctx = this;
			return Deps.nonreactive(function() {
				return body.apply(ctx, args);
			});
		}
		this.inverted = !!inverted;
		this.binding = null;
		this.placeholder = document.createComment(_.uniqueId("$"));

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Section bindings can't have children.");
	},

	destroyBinding: function() {
		if (this.binding != null) {
			this.binding.destroy();
			delete this.binding;
		}

		return this;
	},

	refreshBinding: function() {
		if (this.binding != null) {
			var parent = this.placeholder.parentNode;
			if (parent != null) this.binding.appendTo(parent, this.placeholder);
		}

		return this;
	},

	render: function(scope) {
		this.autorun("render", function(comp) {
			this.destroyBinding();

			var val = scope.get(this.path),
				isEmpty = Section.isEmpty(val);
			
			if (isEmpty && this.inverted) {
				this.binding = new Binding.Context(this.path, this.body(0));
			} else if (!isEmpty && !this.inverted) {
				if (_.isArray(val)) this.binding = new Binding.Each(this.path, this.body.bind(this));
				else this.binding = new Binding.Context(this.path, this.body(0));
			} else {
				// listen for changes to children to update the binding type
				scope.depend(util.joinPathParts(this.path, "*" ));
			}

			if (this.binding != null) {
				this.binding.render(scope);
				this.refreshBinding();
			}
		});

		return this;
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.refreshBinding();
		return this;
	},

	find: function(selector) {
		return this.binding != null ? this.binding.find(selector) : null;
	},

	findAll: function(selector) {
		return this.binding != null ? this.binding.findAll(selector) : [];
	},

	destroy: function() {
		this.destroyBinding();
		var parent = this.placeholder.parentNode;
		if (parent != null) parent.removeChild(this.placeholder);

		return Binding.prototype.destroy.apply(this, arguments);
	}
}, {
	isEmpty: function(val) {
		return !val || (_.isArray(val) && !val.length);
	}
});