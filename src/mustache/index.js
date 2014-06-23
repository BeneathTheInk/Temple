var Temple = require("../temple"),
	NODE_TYPE = require("./types"),
	_ = require("underscore"),
	parse = require("./parse"),
	util = require("../util"),
	Context = require("./context"),
	Section = require("./section"),
	ArgParser = require("./arguments.js"),
	Deps = require("../deps");

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
		this.initialize();
	},

	initialize: function(){},

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
		if (partial != null && !util.isSubClass(Temple.Binding, partial))
			throw new Error("Expecting string template, parsed template or Temple subclass for partial.");

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

	_mount: function() {
		if (this._template == null)
			throw new Error("Expected a template to be set before rendering.");

		this.addChild(this.convertTemplate(this._template));
		Context.prototype._mount.call(this);
	},

	_detach: function() {
		this.removeChild(this.children.slice(0));
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
				var binding = new Temple.Element(template.name);
				binding.addChild(this.convertTemplate(template.children, ctx));

				template.attributes.forEach(function(attr) {
					temple._attrToDecorator(attr, binding, ctx);
				});

				return binding;

			case NODE_TYPE.TEXT:
				return new Temple.Text(decodeEntities(template.value));

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				var klass = template.type === NODE_TYPE.TRIPLE ? "HTML" : "Text";

				return new Temple[klass](function() {
					return ctx.get(template.value);
				});

			case NODE_TYPE.INVERTED:
			case NODE_TYPE.SECTION:
				var inverted = template.type === NODE_TYPE.INVERTED,
					onRow;

				onRow = function(model, key) {
					var row = new Context(model);
					row.addModel(new Temple.Model({ $key: key }));
					row.setParentContext(ctx);
					row.addChild(temple.convertTemplate(template.children, row));

					// for the GC
					Deps.currentComputation.onInvalidate(function() {
						row.setParentContext(null);
					});

					return row;
				}

				return new Section(ctx, template.value, onRow, inverted);

			case NODE_TYPE.PARTIAL:
				return Deps.nonreactive(function() {
					var name = template.value,
						partial = temple.findPartial(name),
						comps = temple._components,
						comp, detach;

					if (partial != null) {
						comp = new partial;

						if (comp instanceof Context) comp.setParentContext(ctx);

						if (comps[name] == null) comps[name] = [];
						comps[name].push(comp);

						detach = function() {
							comps[name] = _.without(comps[name], comp);
							if (comp instanceof Context) comp.setParentContext(null);
							temple.off("detach", detach);
							comp.off("detach", detach);
						}

						temple.on("detach", detach);
						comp.on("detach", detach);
						
						return comp;
					}
				});

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
					model, val, isEmpty, makeRow, cleanup, strval,
					rows = [];

				model = (ctx.findModel(path) || ctx).getModel(path);
				val = model.handle("toArray");
				if (!_.isArray(val)) val = model.get();
				if (_.isFunction(val)) val = val.call(ctx);
				isEmpty = Section.isEmpty(val);
				model.depend("*");

				makeRow = function(i) {
					var row, m;
					
					if (i == null) {
						m = model;
						i = 0;
					} else {
						m = model.getModel(i);
					}

					var row = new Context(m);
					row.addModel(new Temple.Model({ $key: i }));
					row.setParentContext(ctx);
					rows.push(row);

					return temple.convertStringTemplate(template.children, row);
				}

				cleanup = function() {
					rows.forEach(function(r) {
						r.setParentContext(null);
					});
				}

				if (!(isEmpty ^ inverted)) {
					strval = _.isArray(val) && !inverted ?
						model.keys().map(makeRow).join("") :
						makeRow();
				}

				if (Deps.active) Deps.currentComputation.onInvalidate(cleanup);
				else cleanup();

				return strval;
				
			default:
				console.log(template);
		}
	},

	_attrToDecorator: function(attr, binding, ctx) {
		var decorators = this.findDecorators(attr.name),
			temple = this,
			processed, rawargs, init,
			id = _.uniqueId("dec"),
			destroyed = true;
		
		if (decorators.length) {
			init = function() {
				if (!destroyed) return;
				destroyed = false;

				processed = decorators.map(function(fn) {
					return fn.call(temple, binding.node, attr.children);
				}).filter(function(d) {
					return typeof d === "object";
				});

				processed.some(function(d) {
					if (d.parse !== false) {
						rawargs = convertTemplateToArgs(attr.children)
							.filter(function(t) { return t.type === NODE_TYPE.TEXT; })
							.map(function(t) { return t.value; })
							.join("");

						return true;
					}
				});
			}

			binding.on("mount", function() {
				init();

				this.autorun(id, function() {
					var args = [];

					if (rawargs != null)
						args = ArgParser.parse(rawargs, { ctx: ctx });

					processed.forEach(function(d) {
						if (typeof d.update === "function") {
							d.update.apply(ctx, d.parse !== false ? args : []);
						}
					});
				});
			});

			binding.on("detach", function() {
				this.stopComputation(id);
				destroyed = true;

				processed.forEach(function(d) {
					if (typeof d.destroy === "function") d.destroy.call(temple);
				});
			});
		}

		else {
			binding.attr(attr.name, function() {
				return temple.convertStringTemplate(attr.children, ctx);
			});
		}
	},
}, {
	parse: parse,
	NODE_TYPE: NODE_TYPE,
	Context: Context
});

// allow plugin usage
Mustache.prototype.use = Temple.prototype.use;

function convertTemplateToArgs(template) {
	if (_.isArray(template)) return template.map(function(t) {
		return convertTemplateToArgs(t);
	}).filter(function(b) { return b != null; });

	switch (template.type) {
		case NODE_TYPE.INTERPOLATOR:
		case NODE_TYPE.TRIPLE:
			template = {
				type: NODE_TYPE.TEXT,
				value: "{{" + template.value + "}}"
			}
			break;

		case NODE_TYPE.SECTION:
		case NODE_TYPE.INVERTED:
			throw new Error("Unexpected section in decorator value.");

		case NODE_TYPE.PARTIAL:
			throw new Error("Unexpected partial in decorator value.");
	}

	return template;
}


// cleans html, then converts html entities to unicode
var decodeEntities = (function() {
	if (typeof document === "undefined") return;

	// this prevents any overhead from creating the object each time
	var element = document.createElement('div');

	function decodeHTMLEntities (str) {
		if(str && typeof str === 'string') {
			// strip script/html tags
			str = str.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '');
			str = str.replace(/<\/?\w(?:[^"'>]|"[^"]*"|'[^']*')*>/gmi, '');
			element.innerHTML = str;
			str = element.textContent;
			element.textContent = '';
		}

		return str;
	}

	return decodeHTMLEntities;
})();