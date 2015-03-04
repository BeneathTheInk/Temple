var _ = require("underscore"),
	Trackr = require("trackr"),
	Events = require("./events"),
	util = require("./util"),
	Model = require("./model"),
	Plugins = require("./plugins"),
	DOMRange = require("./domrange");

var View =
module.exports = DOMRange.extend({

	constructor: function(data, options) {
		// first we create the initial view state
		var state = _.result(this, "initialState") || _.result(this, "defaults") || {};
		if (!Model.isModel(state)) state = new Model(state, null, options && options.state);
		
		// shove state between contexts
		if (Model.isModel(data)) {
			state.parent = data.parent;
			data.parent = state;
		}

		// add to the stack before the real data
		this.addData(state);
		this.stateModel = state;
		util.defineComputedProperty(this, "state", function() {
			return this.stateModel.data;
		});

		// quick access to the top model data
		util.defineComputedProperty(this, "data", function() {
			return this.model.data;
		});

		// set the passed in data
		if (data != null) this.addData(data, options);

		// initiate like a normal dom range
		DOMRange.call(this);

		// initialize with options
		this.initialize.call(this, options);
	},

	initialize: function(){},

	use: function(p) {
		return Plugins.loadPlugin(this, p, _.toArray(arguments).slice(1));
	},

	// adds data to the current stack
	addData: function(data, options) {
		if (!Model.isModel(data)) data = new Model(data, this.model, options);
		this.model = data;
		return this;
	},

	// attach + mount
	paint: function(p, n, _isMove, _isReplace) {
		DOMRange.prototype.attach.apply(this, arguments);
		if (!(_isMove || _isReplace || this.isMounted())) this.mount();
		return this;
	},

	// auto stop on detach
	detach: function(_isReplace) {
		if (!_isReplace) this.stop();
		DOMRange.prototype.detach.apply(this, arguments);
		return this;
	},

	autorun: function(fn, onlyOnActive) {
		var comp = Trackr.autorun(fn, this);
		if (onlyOnActive && !Trackr.active) comp.stop();
		return comp;
	},

	// a generalized reactive workflow helper
	mount: function() {
		var args = _.toArray(arguments), comp;

		Trackr.nonreactive(function() {
			// stop existing mount
			this.stop();

			// the first event in the cycle, before everything else
			this._mounting = true;
			this.trigger("mount:before", args);
		}, this);

		// the autorun computation
		comp = this._comp = this.autorun(function(comp) {
			this.render.apply(this, args);
			this.trigger("render", args, comp);

			// auto clean up
			comp.onInvalidate(function() {
				// remaining invalidate events
				this.trigger("invalidate", args, comp);

				// detect if the computation stopped
				if (comp.stopped) {
					this.trigger("stop", args);
					delete this._comp;
				}
			});
		});

		// remaining mount events happen after the first render
		Trackr.nonreactive(function() {
			this.trigger("mount:after", args, comp);
			delete this._mounting;
		}, this);

		return this;
	},

	render: function(){},

	isMounted: function() {
		return this.isMounting() || this._comp != null;
	},

	isMounting: function() {
		return !!this._mounting;
	},

	getComputation: function() {
		return this._comp;
	},

	invalidate: function() {
		if (this.isMounted()) this._comp.invalidate();
		return this;
	},

	onInvalidate: function(fn) {
		if (this.isMounted()) this._comp.onInvalidate(fn);
		return this;
	},

	stop: function() {
		if (this.isMounted()) this._comp.stop();
		return this;
	}

});

// chainable methods to proxy to model
[ "registerProxy" ]
.forEach(function(method) {
	View.prototype[method] = function() {
		this.model[method].apply(this.model, arguments);
		return this;
	}
});

// methods to proxy to model which don't return this
[ "set", "get", "getLocal", "getProxyByValue", "getModelAtOffset",
  "getRootModel", "findModel", "getContainerValue", "getAllModels"
].forEach(function(method) {
	View.prototype[method] = function() {
		return this.model[method].apply(this.model, arguments);
	}
});