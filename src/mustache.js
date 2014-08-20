var Temple = require("templejs"),
	NODE_TYPE = require("./types"),
	_ = require("underscore"),
	parse = require("./parse"),
	util = require("./util"),
	Context = require("./context"),
	Model = require("./model"),
	Section = require("./section"),
	ArgParser = require("./arguments.js");

var Mustache =
module.exports = Context.extend({
	constructor: function(template, data) {
		this._partials = {};
		this._components = {};

		// parse and add template
		template = template || _.result(this, "template");
		if (template != null) this.setTemplate(template);

		// check for class level decorators
		var decorators = _.result(this, "decorators");
		if (_.isObject(decorators)) this.decorate(decorators);

		// check for class level partials
		var partials = _.result(this, "partials");
		if (_.isObject(partials)) this.setPartial(partials);

		Context.call(this, data);
	},

	use: Temple.prototype.use,

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
		if (partial != null && !util.isSubClass(Temple.React, partial))
			throw new Error("Expecting string template, parsed template, Temple React subclass or function for partial.");

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

	// returns all the component instances as specified by partial name
	getComponents: function(name) {
		return this._components[name] || [];
	},

	render: function() {
		if (this._template == null)
			throw new Error("Expected a template to be set before rendering.");

		return this.convertTemplate(this._template);
	},

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

			// make sure its a subclass of Temple React
			if (!(comp instanceof Temple.React))
				throw new Error("Expecting an subclass of Temple React for partial.");

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

			// mount the partial
			comp.mount();

			return comp;
		}

		return null;
	},

	convertTemplate: function(template, ctx) {
		if (ctx == null) ctx = this;
		var temple = this;

		if (_.isArray(template)) return template.map(function(t) {
			return this.convertTemplate(t, ctx);
		}, this).filter(function(b) { return b != null; });

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return this.convertTemplate(template.children, ctx);

			case NODE_TYPE.ELEMENT:
				var part = temple.renderPartial(template.name, ctx);

				if (part != null) {
					this.autorun(function() {
						template.attributes.forEach(function(attr) {
							var args = Mustache.convertTemplateToRawArgs(attr.children);

							temple.autorun(function() {
								var val = ArgParser.parse(args, { ctx: ctx });
								if (val.length === 1) val = val[0];
								else if (!val.length) val = null;
								part.set(attr.name, val);
							});
						});
					}, true);

					return part;
				}

				else {
					var binding = new Temple.Element(template.name);
					this.convertTemplate(template.children, ctx).forEach(binding.appendChild, binding);

					template.attributes.forEach(function(attr) {
						this._processAttribute(attr, binding, ctx);
					}, this);

					return binding;
				}

			case NODE_TYPE.TEXT:
				return new Temple.Text(util.decodeEntities(template.value));

			case NODE_TYPE.HTML:
				return new Temple.HTML(template.value);

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				var node = new Temple[template.type === NODE_TYPE.TRIPLE ? "HTML" : "Text"];

				var comp = this.autorun(function() {
					node.setValue(ctx.get(template.value));
				}, true);

				return node;

			case NODE_TYPE.INVERTED:
			case NODE_TYPE.SECTION:
				var model = ctx.findModel(template.value, { depend: false }).getModel(template.value);

				return new Section(model, ctx)
				.invert(template.type === NODE_TYPE.INVERTED)
				.mount(function(key) {
					this.addModel(new Model({ $key: key }));
					return temple.convertTemplate(template.children, this);
				});

			case NODE_TYPE.PARTIAL:
				return this.renderPartial(template.value, ctx, void 0);

			default:
				console.log(template);
		}
	},

	convertStringTemplate: function(template, ctx) {
		if (ctx == null) ctx = this;
		var temple = this;

		if (_.isArray(template)) return template.map(function(t) {
			return temple.convertStringTemplate(t, ctx);
		}).filter(function(b) { return b != null; }).join("");

		switch(template.type) {
			case NODE_TYPE.TEXT:
				return template.value;

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				var val = ctx.get(template.value);
				return val != null ? val.toString() : "";

			case NODE_TYPE.SECTION:
			case NODE_TYPE.INVERTED:
				var inverted = template.type === NODE_TYPE.INVERTED,
					path = template.value,
					omodel, model, val, isEmpty, makeRow, strval;

				omodel = (ctx.findModel(path) || ctx).getModel(path);
				val = omodel.get();
				if (_.isFunction(val)) val = val.call(ctx);
				isEmpty = Section.isEmpty(val);

				model = new Model(val);
				omodel.getAllProxies().reverse().forEach(model.registerProxy, model);
				if (model.proxy("isArray")) this.depend("length");

				makeRow = function(i) {
					var row, m;

					if (i == null) {
						m = model;
						i = 0;
					} else {
						m = model.getModel(i);
					}

					var row = new Context(m, ctx);
					row.addModel(new Model({ $key: i }));

					var val = temple.convertStringTemplate(template.children, row);
					row.clean();

					return val;
				}

				if (!(isEmpty ^ inverted)) {
					strval = _.isArray(val) && !inverted ?
						model.keys().map(makeRow).join("") :
						makeRow();
				}

				model.cleanProxyTree();
				return strval;

			default:
				console.log(template);
		}
	},

	_processAttribute: function(attr, binding, ctx) {
		var decorators = this.findDecorators(attr.name),
			temple = this,
			processed, rawargs;

		if (decorators.length) {
			processed = decorators.map(function(fn) {
				return fn.call(this, binding.node, attr.children);
			}, this).filter(function(d) {
				return typeof d === "object";
			});

			processed.some(function(d) {
				if (d.parse !== false) {
					rawargs = Mustache.convertTemplateToRawArgs(attr.children);
					return true;
				}
			});

			this.autorun(function(comp) {
				var args = [];

				if (rawargs != null)
					args = ArgParser.parse(rawargs, { ctx: ctx });

				processed.forEach(function(d) {
					if (typeof d.update === "function") {
						d.update.apply(ctx, d.parse !== false ? args : []);
					}
				});

				comp.onInvalidate(function() {
					if (!comp.stopped) return;
					processed.forEach(function(d) {
						if (typeof d.destroy === "function") d.destroy.call(temple);
					});
				});
			}, true);
		}

		else {
			this.autorun(function() {
				binding.attr(attr.name, temple.convertStringTemplate(attr.children, ctx));
			}, true);
		}
	},
}, {
	parse: parse,
	NODE_TYPE: NODE_TYPE,

	// converts raw html str to template tree
	parseHTML: function(str) {
		return {
			type: NODE_TYPE.ROOT,
			children: [ {
				type: NODE_TYPE.HTML,
				value: str
			} ]
		};
	},

	convertTemplateToRawArgs: function(template) {
		if (_.isArray(template)) return template.map(function(t) {
			return Mustache.convertTemplateToRawArgs(t);
		}).filter(function(b) { return b != null; }).join("");

		switch (template.type) {
			case NODE_TYPE.TEXT:
				return template.value;

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				return "{{" + template.value + "}}";

			case NODE_TYPE.SECTION:
			case NODE_TYPE.INVERTED:
				throw new Error("Unexpected section in attribute value.");

			case NODE_TYPE.PARTIAL:
				throw new Error("Unexpected partial in attribute value.");
		}
	}
});
