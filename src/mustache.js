var Temple = require("templejs"),
	NODE_TYPE = require("./types"),
	_ = require("underscore"),
	parse = require("./m+xml").parse,
	util = require("./util"),
	Context = require("./context"),
	Model = require("./model");
	// Section = require("./section");

var Mustache =
module.exports = Context.extend({
	constructor: function(data, options) {
		options = options || {};
		this._partials = {};
		this._components = {};

		// add template
		var template = options.template || _.result(this, "template");
		if (template != null) this.setTemplate(template);

		// add decorators
		this.decorate(_.extend({}, options.decorators, _.result(this, "decorators")));

		// add partials
		this.setPartial(_.extend({}, options.partials, _.result(this, "partials")));

		Context.call(this, data);
	},

	// parses and sets the root template
	setTemplate: function(template) {
		if (_.isString(template)) template = parse(template);

		if (!_.isObject(template) || template.type !== NODE_TYPE.ROOT)
			throw new Error("Expecting string or parsed template.");

		this._template = template;
		return this;
	},

	// creates a decorator
	decorate: function(name, fn) {
		if (typeof name === "object" && fn == null) {
			_.each(name, function(fn, n) { this.decorate(n, fn); }, this);
			return this;
		}

		if (typeof name !== "string" || name === "") throw new Error("Expecting non-empty string for decorator name.");
		if (typeof fn !== "function") throw new Error("Expecting function for decorator.");

		if (this._decorators == null) this._decorators = {};
		if (this._decorators[name] == null) this._decorators[name] = [];
		if (!~this._decorators[name].indexOf(fn)) this._decorators[name].push(fn);

		return this;
	},

	// finds all decorators, locally and in parent
	findDecorators: function(name) {
		var d = [],
			c = this;

		while (c != null) {
			if (c._decorators != null && _.isArray(c._decorators[name]))
				d = d.concat(c._decorators[name]);

			c = c.parent;
		}

		return _.unique(d);
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
				this._decorators[n] = _.without(d, fn);
			}, this);
		}

		else {
			var d = this._decorators[name];
			this._decorators[name] = _.without(d, fn);
		}

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

		if (_.isString(partial)) partial = parse(partial);
		if (_.isObject(partial) && partial.type === NODE_TYPE.ROOT) partial = Mustache.extend({ template: partial });
		if (partial != null && !util.isSubClass(Temple, partial))
			throw new Error("Expecting string template, parsed template, Temple subclass or function for partial.");

		if (partial == null) {
			delete this._partials[name];
			partial = void 0;
		} else {
			this._partials[name] = partial;
		}

		this.trigger("partial", name, partial);
		this.trigger("partial:" + name, partial);

		return this;
	},

	// looks through parents for partial
	findPartial: function(name) {
		var c = this;

		while (c != null) {
			if (c._partials != null && c._partials[name] != null) return c._partials[name];
			c = c.parent;
		}
	},

	// renders the partials
	renderPartial: function(name, ctx) {
		if (ctx == null) ctx = this;

		var Partial = this.findPartial(name),
			comps = this._components,
			self = this,
			comp, detach;

		if (Partial != null) {
			comp = Temple.Deps.nonreactive(function() {
				return new Partial;
			});

			// make sure its a subclass of Temple
			if (!(comp instanceof Temple))
				throw new Error("Expecting an subclass of Temple for partial.");

			// set parent context for instances of Context
			if (comp instanceof Context) comp.setParentContext(ctx);

			// add it to the list
			if (comps[name] == null) comps[name] = [];
			comps[name].push(comp);

			// clean up when the partial is "stopped"
			comp.once("stop", function() {
				if (comp instanceof Context) comp.clean();
				comps[name] = _.without(comps[name], comp);
			}, this);

			return comp;
		}

		return null;
	},

	// returns first rendered partial by name
	getComponent: function(name) {
		var comps, comp, res, n, i;

		comps = this._components;
		if (comps[name] != null && comps[name].length) return comps[name][0];

		for (n in comps) {
			for (i in comps[n]) {
				comp = comps[n][i]
				if (!(comp instanceof Mustache)) continue;
				res = comp.getComponent(name);
				if (res != null) return res;
			}
		}

		return null;
	},

	// returns all rendered partials by name
	getComponents: function(name) {
		return _.reduce(this._components, function(m, comps, n) {
			if (n === name) m.push.apply(m, comps);
			
			comps.forEach(function(c) {
				if (c instanceof Mustache) m.push.apply(m, c.getComponents(name));
			});

			return m;
		}, []);
	},

	render: function() {
		if (this._template == null)
			throw new Error("Expected a template to be set before rendering.");

		// var toMount, bindings;
		// bindings = this.convertTemplate(this._template, null, toMount = []);
		
		// this.once("render:after", function() {
		// 	// we invoke them in reverse to ensure the DOM nodes are in the correct order
		// 	_.invoke(toMount.reverse(), "mount");
		// });

		// return bindings;
	},

	renderTemplate: function(t) {

	}

}, {

	NODE_TYPE: NODE_TYPE,

	parse: parse,

	parsePathQuery: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "pathQuery" }));
	},

	parseAttribute: function() {
		return parse(s, _.extend({}, opts, { startRule: "attrValue" }));
	},

	parseArguments: function() {
		return parse(s, _.extend({}, opts, { startRule: "attrArguments" }));
	},

	// converts raw html str to template tree
	parseHTML: function(str) {
		return {
			type: NODE_TYPE.ROOT,
			children: [ {
				type: NODE_TYPE.HTML,
				value: str
			} ]
		};
	}

});
