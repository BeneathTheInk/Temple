var _ = require("underscore");
var Trackr = require("trackr");
// var utils = require("./utils");
var Context = require("./context");
var Plugins = require("./plugins");
// var NodeRange = require("./node-range");
var merge = require("plain-merge");

import * as idom from "./incremental-dom/index";
import { getContext } from "./incremental-dom/src/context";
import { firstChild, nextSibling, parentNode } from './incremental-dom/src/traversal';
import { clearUnvisitedDOM } from './incremental-dom/src/alignment';

import * as render from "./render";
import { parse } from "./m+xml";
import * as NODE_TYPE from "./types";
import { Map as ReactiveMap } from "trackr-objects";

var View =
module.exports = Context.extend({
	constructor: function(data, parent, options) {
		if (!Context.isContext(parent)) {
			options = parent;
			parent = null;
		}

		options = options || {};

		// add template
		var template = options.template || _.result(this, "template");
		if (template != null) this.setTemplate(template);

		var tag = _.result(this, "tagName");
		if (!tag) throw new Error("Missing tag name.");
		this.el = document.createElement(this.extends || tag, this.extends ? tag : null);

		this._helpers = new ReactiveMap();
		this._helpersContext = new Context(this._helpers, this, { transparent: true });

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

	// parses and sets the root template
	setTemplate: function(template) {
		if (_.isString(template)) template = parse(template);

		if (!_.isObject(template) || template.type !== NODE_TYPE.COMPONENT) {
			throw new Error("Expecting string or parsed template.");
		}

		this._template = template;
		this.trigger("template", template);

		return this;
	},

	// attach + mount
	attach: function(parent, before) {
		if (typeof parent === "string") parent = document.querySelector(parent);
		if (parent == null) throw new Error("Expecting a valid DOM element to attach in.");
		if (typeof before === "string") {
			before = parent.querySelector ?
				parent.querySelector(before) :
				document.querySelector(before);
		}

		parent.insertBefore(this.el, before);
		this.trigger("attach", this.el);

		return this;
	},

	paint: function(parent, before) {
		this.attach(parent, before);
		this.mount();
		return this;
	},

	// stop and remove dom
	detach: function() {
		this.stop();
		if (this.el && this.el.parentNode) {
			this.el.parentNode.removeChild(this.el);
		}
		return this;
	},

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
		var comp = this.comp = Trackr.autorun(function(comp) {
			self.render(comp);
			self.trigger("render", comp);

			// auto clean up
			comp.onInvalidate(function() {
				// remaining invalidate events
				self.trigger("invalidate", comp);

				// detect if the computation stopped
				if (comp.stopped) {
					self.trigger("stop", comp);
					delete self.comp;
				}
			});
		});

		// remaining mount events happen after the first render
		Trackr.nonreactive(function() {
			self.trigger("mount:after", comp);
		});

		return this;
	},

	render: function() {
		if (this._template == null)
			throw new Error("Expected a template to be set before rendering.");

		let vrender = () => render.incremental(this._template, this._helpersContext);
		let ictx = getContext();

		if (ictx) {
			let walker = ictx.walker;
			walker.getCurrentParent().insertBefore(this.el, walker.currentNode);
			walker.currentNode = this.el;

			firstChild();
			vrender();
			parentNode();
			clearUnvisitedDOM(this.el);
			nextSibling();
		} else {
			idom.patch(this.el, vrender);
		}
	},

	stop: function() {
		if (this.comp) this.comp.stop();
		return this;
	},

	helpers: function(obj) {
		for (let k of _.keys(obj)) {
			let v = obj[k];

			if (v == null) this._helpers.delete(k);
			else if (typeof v === "function") this._helpers.set(k, v);
			else {
				throw new Error("Expecting function for helper.");
			}
		}

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
