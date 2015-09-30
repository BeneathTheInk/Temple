import * as _ from "underscore";
import Trackr from "trackr";
import Context from "./context";
import merge from "plain-merge";
import { get as getView } from "./globals";

var View =
module.exports = Context.extend({
	constructor: function(data, parent, options) {
		if (!Context.isContext(parent)) {
			options = parent;
			parent = null;
		}

		options = options || {};
		this._components = {};

		// load initial data
		var defaults = _.result(this, "initialState") || _.result(this, "defaults");
		data = merge.extend({}, defaults, data);

		// call the context constructor
		Context.call(this, data, parent, options);

		// initialize with options
		this.initialize.call(this, options);
	},

	initialize: function(){},

	autorun: function(fn, options) {
		let comp = Trackr.autorun(fn.bind(this), options);
		comp.onStop(this.off.bind(this, "stop", comp.stop));
		this.on("stop", comp.stop, comp);
		return comp;
	},

	// a generalized reactive workflow helper
	mount: function() {
		let self = this;

		Trackr.nonreactive(function() {
			// stop existing mount
			self.stop();

			// the first event in the cycle, before everything else
			self.trigger("mount:before");
		});

		// the autorun computation
		this.comp = Trackr.autorun(function(comp) {
			self._mount(comp);
			self.trigger("render");

			// auto clean up
			comp.onInvalidate(function() {
				// remaining invalidate events
				self.trigger("invalidate");

				// detect if the computation stopped
				if (comp.stopped) {
					delete self.comp;
					self.trigger("stop");
				}
			});
		});

		// remaining mount events happen after the first render
		Trackr.nonreactive(function() {
			self.trigger("mount:after");
		});

		return this;
	},

	_mount: function() {},

	stop: function() {
		if (this.comp) this.comp.stop();
		return this;
	},

	renderView: function(name, ctx) {
		let View = getView(name);
		if (View) {
			let v = new View(null, ctx, { transparent: true });
			v.mount();
			return v;
		}
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
