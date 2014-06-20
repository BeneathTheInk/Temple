var _ = require("underscore"),
	util = require("../util"),
	Binding = require("./index"),
	Model = require("../model"),
	Deps = require("../deps"),
	Observe = require("../observe");

var Scope =
module.exports = Binding.extend(_.extend(Observe, {
	constructor: function(data) {
		this.placeholder = document.createComment(_.uniqueId("$"));

		// binding constructor
		Binding.call(this);

		// set the initial model
		this.setModel(data);
	},

	setModel: function(model) {
		if (!Model.isModel(model)) {
			var data = model;
			model = new Model(_.result(this, "defaults"));
			if (!_.isUndefined(data)) model.set([], data);
		}

		// clear existing model
		this.clearModel();

		// add the new one
		this.model = model;
		this.listenTo(model, "change", this._onChange);
		this.trigger("model", model);

		return this;
	},

	clearModel: function() {
		if (this.model != null) {
			delete this.model;
			this.stopListening(model);
			this.trigger("model");
		}

		return this;
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
}));

// chainable proxy methods
[ "handle", "set", "unset" ]
.forEach(function(method) {
	Scope.prototype[method] = function() {
		var model = this.model;
		model[method].apply(model, arguments);
		return this;
	}
});

// proxy methods which don't return this
[ "getModel", "notify", "get", "keys" ]
.forEach(function(method) {
	Scope.prototype[method] = function() {
		var model = this.model;
		return model[method].apply(model, arguments);
	}
});