var _ = require("underscore"),
	util = require("./util"),
	EventEmitter = require("events").EventEmitter,
	Model = require("./model"),
	Deps = require("./deps");

var proto = {

	constructor: function(model) {
		EventEmitter.call(this);
		this.setMaxListeners(0);

		// convert data to model if isn't one already
		if (!Model.isModel(model)) {
			var data = model;
			model = new Model(_.result(this, "defaults"));
			if (!_.isUndefined(data)) model.set([], data);
		}

		this.models = [ model ];
		this._observers = [];
		this.initialize();
	},

	initialize: function() {},

	// adds a model to the set
	addModel: function(model) {
		// accept scopes and arrays, but reduce them to models
		if (Scope.isScope(model)) this.addModel(model.models);
		else if (_.isArray(model)) {
			model.forEach(function(m) { this.addModel(m); }, this);
		}

		else {
			if (!Model.isModel(model)) throw new Error("Expecting model.");
			if (!~this.models.indexOf(model)) this.models.push(model);
		}

		return this;
	},
 
	// removes a previously added fallback model
	removeModel: function(model) {
		if (Scope.isScope(model)) this.removeModel(model.models);
		else if (_.isArray(model)) {
			model.forEach(function(m) { this.removeModel(m); }, this);
		}

		else {
			var index = this.models.indexOf(model);
			if (~index) this.models.splice(index, 1);
		}

		return this;
	},

	// returns the first model whose value at path isn't null
	findModel: function(path, options) {
		return _.find(this.models, function(model) {
			return model.get(path, options) != null;
		});
	},

	get: function(parts, options) {
		var val, model;

		parts = util.splitPath(parts);

		if (parts[0] === "this") {
			parts.shift();
			val = this.models[0].get(parts, options);
		}

		else {
			model = this.findModel(parts, options);
			if (model != null) val = model.get(parts, options);
		}

		// execute functions
		if (_.isFunction(val)) val = val.call(this);

		return val;
	},

	depend: function(path) {
		// this is sort of a hack, basically gets the
		// value which registers dependencies at every
		// fallback until the value is found.
		this.get(path);
		return this;
	},

	// reruns fn anytime dependencies change
	autorun: function(fn) {
		return Deps.autorun(fn.bind(this));
	},

	observe: function(path, fn) {
		var self = this;

		this.models.forEach(function(m) {
			m.observe(path, onChange);
		});

		this._observers.push({
			path: path,
			fn: fn,
			onChange: onChange
		});

		return this;

		function onChange(summary) {
			var cModel = self.findModel(summary.path, { depend: false });
			
			if (cModel !== this) {
				var cindex = self.models.indexOf(cModel);
				if (~cindex && cindex < self.models.indexOf(this)) return;
			}

			fn.call(self, summary);
		}
	},

	stopObserving: function(path, fn) {
		var obs = [];

		if (path == null && fn == null) obs = this._observers.slice(0);
		else {
			this._observers.forEach(function(ob) {
				if ((path == null || ob.path === path) && (fn == null || ob.fn === fn)) {
					obs.push(ob);
				}
			});
		}

		obs.forEach(function(ob) {
			this.models.forEach(function(m) {
				m.stopObserving(ob.path, ob.onChange);
			});

			var index = this._observers.indexOf(ob);
			if (~index) this._observers.splice(index, 1);
		}, this);

		return this;
	}

};

// chainable proxy methods
[ "handle", "set", "unset", "setHidden" ]
.forEach(function(method) {
	proto[method] = function() {
		var model = this.models[0];
		model[method].apply(model, arguments);
		return this;
	}
});

// proxy methods which don't return this
[ "getModel", "keys", "notify" ]
.forEach(function(method) {
	proto[method] = function() {
		var model = this.models[0];
		return model[method].apply(model, arguments);
	}
});

var Scope =
module.exports = util.subclass.call(EventEmitter, proto, {

	extend: util.subclass,

	isScope: function(obj) {
		return obj instanceof Scope;
	}

});