var _ = require("underscore");
var Trackr = require("trackr");
var utils = require("./utils");
var Context = require("./context");
var Plugins = require("./plugins");
var NodeRange = require("./node-range");
var NODE_TYPE = require("./types");
var merge = require("plain-merge");

var View =
module.exports = Context.extend({
	constructor: function(data, parent, options) {
		if (!Context.isContext(parent)) {
			options = parent;
			parent = null;
		}

		options = options || {};

		// add partials
		// this._partials = {};
		this._components = {};
		// this.setPartial(_.extend({}, options.partials, _.result(this, "partials")));

		// add decorators
		this.decorate(_.extend({}, options.decorators, _.result(this, "decorators")));

		// load initial data
		var defaults = _.result(this, "initialState") || _.result(this, "defaults");
		data = merge.extend({}, defaults, data);

		// call the context constructor
		Context.call(this, data, parent, options);

		// initialize with options
		this.initialize.call(this, options);
	},

	initialize: function(){},

	use: function(p) {
		return Plugins.loadPlugin(this, p, _.toArray(arguments).slice(1));
	},

	// attach + mount
	paint: function(parent, before) {
		// this.detach();



		// if (typeof parent === "string") parent = document.querySelector(parent);
		// if (parent == null) throw new Error("Expecting a valid DOM element to attach in.");
		// if (typeof before === "string") before = parent.querySelector(before);
		// this._range.moveTo(parent, before);
		// this.mount();

		return this;
	},

	// stop and remove dom
	detach: function() {
		this.stop();
		this._range.empty().detach();
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

	render: function() {

	},

	stop: function() {
		if (this.comp) this.comp.stop();
		return this;
	},

	// creates a decorator
	decorate: function(name, fn, options) {
		if (typeof name === "object" && fn == null) {
			_.each(name, function(fn, n) {
				if (_.isArray(fn)) this.decorate(n, fn[0], fn[1]);
				else this.decorate(n, fn, options);
			}, this);
			return this;
		}

		if (typeof name !== "string" || name === "") throw new Error("Expecting non-empty string for decorator name.");
		if (typeof fn !== "function") throw new Error("Expecting function for decorator.");

		if (this._decorators == null) this._decorators = {};
		if (this._decorators[name] == null) this._decorators[name] = [];
		var decorators = this._decorators[name];

		if (!_.findWhere(decorators, { callback: fn })) {
			decorators.push({
				callback: fn,
				options: options || {}
			});
		}

		return this;
	},

	// finds all decorators, locally and in parent
	findDecorators: function(name) {
		var decorators = [],
			c = this, k, d;

		while (c != null) {
			if (c._decorators != null && _.isArray(c._decorators[name])) {
				for (k in c._decorators[name]) {
					d = c._decorators[name][k];
					if (!_.findWhere(decorators, { callback: d.callback })) {
						decorators.push(_.extend({ context: c }, d));
					}
				}
			}

			c = c.parentRange;
		}

		return decorators;
	},

	// removes a decorator
	stopDecorating: function(name, fn) {
		if (typeof name === "function" && fn == null) {
			fn = name;
			name = null;
		}

		if (this._decorators == null || (name == null && fn == null)) {
			this._decorators = {};
		}

		else if (fn == null) {
			delete this._decorators[name];
		}

		else if (name == null) {
			_.each(this._decorators, function(d, n) {
				this._decorators[n] = _.filter(d, function(_d) {
					return _d.callback !== fn;
				});
			}, this);
		}

		else {
			var d = this._decorators[name];
			this._decorators[name] = _.filter(d, function(_d) {
				return _d.callback !== fn;
			});
		}

		return this;
	},

	// // sets partial by name
	// setPartial: function(name, partial) {
	// 	if (_.isObject(name) && partial == null) {
	// 		_.each(name, function(p, n) { this.setPartial(n, p); }, this);
	// 		return this;
	// 	}
	//
	// 	if (!_.isString(name) && name !== "")
	// 		throw new Error("Expecting non-empty string for partial name.");
	//
	// 	if (partial != null && !utils.isSubClass(View, partial))
	// 		throw new Error("Expecting View subclass for partial.");
	//
	// 	var p = this._getPartial(name);
	// 	if (partial == null) delete p.view;
	// 	else p.view = partial;
	// 	p.dep.changed();
	//
	// 	return this;
	// },
	//
	// // ensures a partial's dependency exists
	// _getPartial: function(name) {
	// 	if (this._partials[name] == null)
	// 		this._partials[name] = { dep: new Trackr.Dependency() };
	//
	// 	return this._partials[name];
	// },
	//
	// // looks through parents for partial
	// findPartial: function(name, options) {
	// 	options = options || {};
	// 	var c = this, p;
	//
	// 	while (c != null) {
	// 		if (c._getPartial != null) {
	// 			p = c._getPartial(name);
	// 			p.dep.depend();
	// 			if (options.local || p.view != null) return p.view;
	// 		}
	//
	// 		c = c.parent;
	// 	}
	// },
	//
	// // generates a new component from a View subclass or partial's name
	// renderPartial: function(klass, data, ctx, options) {
	// 	var comps, name;
	//
	// 	// look up partial with template object
	// 	if (typeof klass === "object" && klass.type === NODE_TYPE.PARTIAL) {
	// 		name = klass.value;
	// 		klass = this.findPartial(name, { local: klass.local });
	// 	}
	//
	// 	// look up the partial by name
	// 	if (typeof klass === "string") {
	// 		name = klass;
	// 		klass = this.findPartial(klass);
	// 	}
	//
	// 	// class must be a view
	// 	if (!utils.isSubClass(View, klass)) return null;
	//
	// 	// accept with context
	// 	if (!Context.isContext(ctx) && ctx != null && options == null) {
	// 		options = ctx;
	// 		ctx = null;
	// 	}
	//
	// 	// normalize context
	// 	if (ctx == null) ctx = this;
	//
	// 	// create it non-reactively
	// 	var component = Trackr.nonreactive(function() {
	// 		return new klass(data, ctx, options);
	// 	});
	//
	// 	// add it to the list
	// 	if (name) {
	// 		comps = this._components;
	// 		if (comps[name] == null) comps[name] = [];
	// 		comps[name].push(component);
	//
	// 		// auto remove when the partial is "stopped"
	// 		component.once("stop", function() {
	// 			comps[name] = _.without(comps[name], component);
	// 		});
	// 	}
	//
	// 	return component;
	// },

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
