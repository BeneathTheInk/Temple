var Temple = require("../temple"),
	NODE_TYPE = require("./types"),
	_ = require("underscore"),
	parse = require("./parse"),
	util = require("../util"),
	Section = require("./section"),
	ArgParser = require("./arguments.js");

var Mustache =
module.exports = Temple.extend({
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

		Temple.call(this, data);
	},

	render: function() {
		if (this._template == null)
			throw new Error("Expected a template to be set before rendering.");

		return this.convertTemplate(this._template);
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
				this._decorators[n] = d.filter(function(f) { return f !== fn });
			}, this);
		}

		else {
			var d = this._decorators[name], index;
			
			if (_.isArray(d)) {
				index = d.indexOf(fn);
				if (index > -1) d.splice(index, 1);
			}
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

	convertTemplate: function(template, context) {
		if (context == null) context = this;
		var temple = this;

		function convert(t, c) {
			return temple.convertTemplate(t || template.children, c || context);
		}

		if (_.isArray(template)) return template.map(function(t) {
			return convert(t);
		}, this).filter(function(b) { return b != null; });

		// cannot be reactive or things get infinite fast
		return Temple.Deps.nonreactive(function() {
			switch(template.type) {
				case NODE_TYPE.ROOT:
					var b = new Temple.Binding();
					b.addChild(convert());
					return b;

				case NODE_TYPE.ELEMENT:
					var binding = new Temple.Element(template.name);
					binding.addChild(convert());

					template.attributes.forEach(function(attr) {
						temple._attrToDecorator(attr, binding, context);
					});

					return binding;

				case NODE_TYPE.TEXT:
					return new Temple.Text(template.value);

				case NODE_TYPE.INTERPOLATOR:
				case NODE_TYPE.TRIPLE:
					var model = getModelByPath(template.value, context),
						klass = template.type === NODE_TYPE.TRIPLE ? "HTML" : "Text";

					return new Temple[klass](function() {
						var m, val;
						val = (m = model.call(this)) != null ? m.get() : null;
						if (_.isFunction(val)) val = val.call(this);
						return val;
					});

				case NODE_TYPE.INVERTED:
				case NODE_TYPE.SECTION:
					var model = getModelByPath(template.value, context),
						inverted = template.type === NODE_TYPE.INVERTED,
						body = function(model, key) {
							return new Temple.Binding({ $key: key }, convert(null, this));
						};

					return new Section(model, body, inverted);

				case NODE_TYPE.PARTIAL:
					var name = template.value,
						partial = temple.findPartial(name),
						comps = temple._components,
						comp;

					if (partial != null) {
						comp = new partial;
						
						if (comps[name] == null) comps[name] = [];
						comps[name].push(comp);

						comp.once("parent:remove", function() {
							var index = comps[name].indexOf(comp);
							if (~index) comps[name].slice(index, 1);
						});
						
						return comp;
					}

				default:
					console.log(template);
			}
		});
	},

	convertStringTemplate: convertStringTemplate,

	_attrToDecorator: function(attr, binding, context) {
		var decorators = this.findDecorators(attr.name),
			temple = this,
			processed, targs, directive;
		
		if (decorators.length) {
			processed = decorators.map(function(fn) {
				return fn.call(temple, binding.node, attr.children);
			}).filter(function(d) {
				return typeof d === "object";
			});

			processed.some(function(d) {
				if (d.parse !== false) {
					targs = convertTemplateToArgs(attr.children);
					return true;
				}
			});

			binding.on("mount", function() {
				this.autorun("d-" + attr.name, function() {
					var raw, args = [];

					if (targs != null) {
						raw = temple.convertStringTemplate(targs);
						args = ArgParser.parse(raw, { scope: this });
					}

					processed.forEach(function(d) {
						if (typeof d.update === "function") {
							d.update.apply(this, d.parse !== false ? args : []);
						}
					}, this);
				});
			});

			binding.on("detach", function() {
				this.stopComputation("d-" + attr.name);

				processed.forEach(function(d) {
					if (typeof d.destroy === "function") d.destroy.call(temple);
				});
			});
		}

		else {
			binding.attr(attr.name, function() {
				return convertStringTemplate.call(binding, attr.children, context);
			});
		}
	},
}, {
	parse: parse,
	NODE_TYPE: NODE_TYPE
});

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
			template = _.clone(template);
			template.children = convertTemplateToArgs(template.children);
			break;
	}

	return template;
}

function getModelByPath(path, context) {
	var parts = util.splitPath(path),
		focus = false;

	if (parts[0] === "this") {
		parts.shift();
		focus = true;
	}

	return function() {
		var scope = this,
			model;

		if (focus) {
			while (scope.parent !== context) {
				scope = scope.parent;
				if (scope == null) return;
			}

			model = scope.model;
		} else {
			model = scope.findModel(parts) || scope;
		}

		scope.depend(parts);
		return model.getModel(parts);
	}
}

function convertStringTemplate(template, context, base) {
	var self = this;

	if (_.isArray(template)) return template.map(function(t) {
		return convertStringTemplate.call(self, t, context, base);
	}).filter(function(b) { return b != null; }).join("");

	function getter(path) {
		var model = getModelByPath(util.joinPathParts(base, path), context).call(self),
			val = model != null ? model.get() : null;
		
		if (_.isFunction(val)) val = val.call(self);
		return val;
	}

	switch(template.type) {
		case NODE_TYPE.TEXT:
			return template.value;

		case NODE_TYPE.INTERPOLATOR:
		case NODE_TYPE.TRIPLE:
			var val = getter(template.value);
			return val != null ? val.toString() : "";

		case NODE_TYPE.SECTION:
		case NODE_TYPE.INVERTED:
			var inverted = template.type === NODE_TYPE.INVERTED,
				path = template.value,
				val = getter(path),
				isEmpty = Section.isEmpty(val);

			context.depend(util.joinPathParts(path, "*"));

			if (!(isEmpty ^ inverted)) {
				if (_.isArray(val) && !inverted) {
					return val.map(function(v, i) {
						var p = util.joinPathParts(path, i);
						return convertStringTemplate.call(self, template.children, context, p);
					}).join("");
				} else {
					return convertStringTemplate.call(self, template.children, context, path);
				}
			} else {
				return;
			}
			
		default:
			console.log(template);
	}
}