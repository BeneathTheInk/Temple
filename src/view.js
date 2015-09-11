var _ = require("underscore");
var Trackr = require("trackr");
var utils = require("./utils");
var Model = require("./model");
var Plugins = require("./plugins");
var DOMRange = require("./domrange");
var NODE_TYPE = require("./types");

var View =
module.exports = DOMRange.extend({
	constructor: function(data, options) {
		options = options || {};

		// first we create the initial view state
		var state = _.result(this, "initialState") || _.result(this, "defaults");
		if (typeof state !== "undefined") {
			if (!Model.isModel(state)) {
				state = new Model(state, null, options.state);
			}

			// shove state between contexts
			if (Model.isModel(data)) {
				if (data.parent) data.parent.append(state);
				state.append(data);
			}

			// add to the stack before the real data
			this.addData(state);
			this.stateModel = state;

			// setup easy-access state property
			state.defineDataLink(this, "state");
		}

		// add partials
		this._partials = {};
		this._components = {};
		this.setPartial(_.extend({}, options.partials, _.result(this, "partials")));

		// set the passed in data
		if (typeof data !== "undefined") this.addData(data, options);

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
		if (!(_isMove || _isReplace || this.comp)) this.mount();
		return this;
	},

	// auto stop on detach
	detach: function(_isReplace) {
		if (!_isReplace) this.stop();
		DOMRange.prototype.detach.apply(this, arguments);
		return this;
	},

	autorun: function(fn, options) {
		return Trackr.autorun(fn, options, this);
	},

	// a generalized reactive workflow helper
	mount: function() {
		Trackr.nonreactive(function() {
			// stop existing mount
			this.stop();

			// the first event in the cycle, before everything else
			this.trigger("mount:before");
		}, this);

		// the autorun computation
		var comp = this.comp = this.autorun(function(comp) {
			this.render();
			this.trigger("render", comp);

			// auto clean up
			comp.onInvalidate(function() {
				// remaining invalidate events
				this.trigger("invalidate", comp);

				// detect if the computation stopped
				if (comp.stopped) {
					this.trigger("stop", comp);
					delete this.comp;
				}
			});
		});

		// remaining mount events happen after the first render
		Trackr.nonreactive(function() {
			this.trigger("mount:after", comp);
		}, this);

		return this;
	},

	render: function(){},

	stop: function() {
		if (this.comp) this.comp.stop();
		return this;
	},

	// sets partial by name
	setPartial: function(name, partial) {
		if (_.isObject(name) && partial == null) {
			_.each(name, function(p, n) { this.setPartial(n, p); }, this);
			return this;
		}

		if (!_.isString(name) && name !== "")
			throw new Error("Expecting non-empty string for partial name.");

		if (partial != null && !utils.isSubClass(View, partial))
			throw new Error("Expecting View subclass or function for partial.");

		if (partial == null) {
			delete this._partials[name];
			partial = void 0;
		} else {
			var p = this._getPartial(name);
			p.view = partial;
			p.dep.changed();
		}

		return this;
	},

	// ensures a partial's dependency exists
	_getPartial: function(name) {
		if (this._partials[name] == null)
			this._partials[name] = { dep: new Trackr.Dependency() };

		return this._partials[name];
	},

	// looks through parents for partial
	findPartial: function(name, options) {
		options = options || {};
		var c = this, p;

		while (c != null) {
			if (c._getPartial != null) {
				p = c._getPartial(name);
				p.dep.depend();
				if (options.local || p.view != null) return p.view;
			}

			c = c.parentRange;
		}
	},

	// generates a new component from a View subclass or partial's name
	renderPartial: function(klass, ctx, options) {
		var comps, name;

		// look up partial with template object
		if (typeof klass === "object" && klass.type === NODE_TYPE.PARTIAL) {
			name = klass.value;
			klass = this.findPartial(name, { local: klass.local });
		}

		// look up the partial by name
		if (typeof klass === "string") {
			name = klass;
			klass = this.findPartial(klass);
		}

		// class must be a view
		if (!utils.isSubClass(View, klass)) return null;

		// normalize context
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;
		if (ctx instanceof Model) ctx = ctx.append(ctx.data);

		// create it non-reactively
		var component = Trackr.nonreactive(function() {
			return new klass(ctx, options);
		});

		// add it to the list
		if (name) {
			comps = this._components;
			if (comps[name] == null) comps[name] = [];
			comps[name].push(component);

			// auto remove when the partial is "stopped"
			component.once("stop", function() {
				comps[name] = _.without(comps[name], component);
			});
		}

		return component;
	},

	// returns first rendered partial by name
	getComponent: function(name) {
		var comps, comp, res, n, i;

		comps = this._components;
		if (comps[name] != null && comps[name].length) return comps[name][0];

		for (n in comps) {
			for (i in comps[n]) {
				comp = comps[n][i];
				if (!(comp instanceof View)) continue;
				res = comp.getComponent(name);
				if (res != null) return res;
			}
		}

		return null;
	},

	// returns all rendered partials by name
	getComponents: function(name) {
		if (name == null) return _.flatten(_.values(this._components));

		return _.reduce(this._components, function(m, comps, n) {
			if (n === name) m.push.apply(m, comps);

			comps.forEach(function(c) {
				if (c instanceof View) m.push.apply(m, c.getComponents(name));
			});

			return m;
		}, []);
	},

	// returns rendered partials, searching children views
	findComponents: function(name) {
		var tpls = [ this ],
			comps = [],
			tpl;

		while (tpls.length) {
			tpl = tpls.shift();
			comps = comps.concat(tpl.getComponents(name));
			tpls.push(tpl.getComponents());
		}

		return comps;
	},

	// returns rendered partials, searching children views
	findComponent: function(name) {
		var tpls = [ this ],
			tpl, comp;

		while (tpls.length) {
			tpl = tpls.shift();
			comp = tpl.getComponent(name);
			if (comp) return comp;
			tpls = tpls.concat(tpl.getComponents());
		}

		return null;
	}

});

// quick access to the top model data
Object.defineProperty(View.prototype, "data", {
	configurable: true,
	enumerable: true,
	get: function() {
		this.model._dep.depend();
		return this.model.data;
	},
	set: function(val) {
		this.model.set(val);
	}
});

// chainable methods to proxy to model
[ "set", "registerProxy" ]
.forEach(function(method) {
	View.prototype[method] = function() {
		this.model[method].apply(this.model, arguments);
		return this;
	};
});

// methods to proxy to model which don't return this
[ "get", "getLocal", "getProxyByValue", "getModelAtOffset",
  "getRootModel", "findModel", "getAllModels"
].forEach(function(method) {
	View.prototype[method] = function() {
		return this.model[method].apply(this.model, arguments);
	};
});

// proxy a few computation methods
[ "invalidate", "onInvalidate" ].forEach(function(method) {
	View.prototype[method] = function() {
		if (!this.comp) {
			throw new Error("Cannot run " + method + "(). This view is not mounted.");
		}

		this.comp[method].apply(this.comp, arguments);
		return this;
	};
});
