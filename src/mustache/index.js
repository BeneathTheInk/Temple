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

	convertTemplate: function(template, context) {
		if (context == null) context = new Context(this.model);
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
					return convert();

				case NODE_TYPE.ELEMENT:
					var binding = new Temple.Element(template.name);
					binding.addChild(convert());

					// template.attributes.forEach(function(attr) {
					// 	temple._attrToDecorator(attr, binding, context);
					// });

					return binding;

				case NODE_TYPE.TEXT:
					return new Temple.Text(template.value);

				case NODE_TYPE.INTERPOLATOR:
				case NODE_TYPE.TRIPLE:
					var klass = template.type === NODE_TYPE.TRIPLE ? "HTML" : "Text";

					return new Temple[klass](function() {
						return context.get(template.value);
					});

				case NODE_TYPE.INVERTED:
				case NODE_TYPE.SECTION:
					var inverted = template.type === NODE_TYPE.INVERTED,
						model, onRow;

					model = function() {
						return context.findModel(template.value).getModel(template.value);
					}

					onRow = function(row, key) {
						var nctx = context.clone(row.model, new Temple.Model({ $key: key }));
						return new Temple.Binding(convert(null, nctx));
					}

					return new Section(model, onRow, inverted);

				/*case NODE_TYPE.PARTIAL:
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

					break;*/

				default:
					console.log(template);
			}
		});
	},

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
						raw = new Temple.Binding(null, convertStringTemplate(targs, context));
						this.addChild(raw);
						raw.paint();

						args = ArgParser.parse(raw.toString(), { scope: this });

						raw.detach();
						this.removeChild(raw);
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
			var b = new Attribute(attr.name, function() {
				return convertStringTemplate(attr.children, context);
			});

			binding.addChild(b);
		}
	},
}, {
	parse: parse,
	NODE_TYPE: NODE_TYPE
});

function Context(models) {
	if (!_.isArray(models)) models = [ models ];
	this.models = models;
}

_.extend(Context.prototype, {
	findModel: function(path) {
		var i, models = this.models;

		for (i in models)
			if (models[i].get(path) !== void 0)
				return models[i];

		return null;
	},
	get: function(parts) {
		var val, model;
		parts = util.splitPath(parts);

		if (parts[0] === "this") {
			parts.shift();
			val = this.models[0].get(parts);
		} else {
			model = this.findModel(parts);
			if (model != null) val = model.get(parts);
		}

		if (_.isFunction(val)) val = val.call(this);
		return val;
	},
	clone: function() {
		var nmodels = _.flatten(_.toArray(arguments));
		return new Context(nmodels.concat(this.models));
	}
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
		var scope = this, model;

		if (focus) {
			context.depend(parts);
			model = context.getModel();
		} else {
			scope.depend(parts);
			model = scope.findModel(parts) || scope;
		}

		return model.getModel(parts);
	}
}

var Attribute = Temple.Binding.extend({
	constructor: function(name, render, data) {
		this.name = name;
		this.render = render;

		Temple.Binding.call(this, data);
	},
	mount: function() {
		var self = this;

		this.autorun("render", function(comp) {
			var binding = this.render();
			this.addChild(binding);
			
			Temple.Binding.prototype.mount.call(this);
			this.parent.node.setAttribute(this.name, this.toString());

			comp.onInvalidate(function() {
				self.removeChild(binding);
				self.parent.node.setAttribute(self.name, "");
			});
		});

		return this;
	},
	detach: function() {
		this.stopComputation("render");
		return Temple.Binding.prototype.detach.apply(this, arguments);
	}
});

function convertStringTemplate(template, context) {
	if (_.isArray(template)) return template.map(function(t) {
		return convertStringTemplate(t, context);
	}).filter(function(b) { return b != null; });

	switch(template.type) {
		case NODE_TYPE.TEXT:
			return new StringValue(function() { return template.value; });

		case NODE_TYPE.INTERPOLATOR:
		case NODE_TYPE.TRIPLE:
			var model = getModelByPath(template.value, context)
			
			return new StringValue(function() {
				var m, val;
				val = (m = model.call(this)) != null ? m.get() : null;
				if (_.isFunction(val)) val = val.call(this);
				return val;
			});

		case NODE_TYPE.SECTION:
		case NODE_TYPE.INVERTED:
			var model = getModelByPath(template.value, context),
				inverted = template.type === NODE_TYPE.INVERTED,
				body = function(row, key) {
					var children = convertStringTemplate(template.children, row);
					row.addChild(new Temple.Binding({ $key: key }, children));
				};

			return new StringSection(model, body, inverted);
			
		default:
			console.log(template);
	}
}

var StringValue = Temple.Binding.extend({
	constructor: function(value) {
		this.value = value;
		Temple.Binding.call(this);
	},
	toString: function() {
		return this.value();
	}
});

var StringSection = Temple.Binding.extend({
	constructor: function(value, body, inverted, data) {
		this.value = value;
		this.body = body;
		this.inverted = !!inverted;
		Temple.Binding.call(this);
	},
	dependOnModel: function(model) {
		if (!Temple.Deps.active) return this;
		
		var dep = new Temple.Deps.Dependency,
			self = this,
			value = model.value;

		model.on("change", onChange);

		function onChange(s) {
			if (s.keypath.length !== 1) return;
			dep.changed();
		}

		Temple.Deps.currentComputation.onInvalidate(function() {
			model.off("change", onChange);
		});

		dep.depend();
		return this;
	},
	mount: function() {
		var model = this.value(),
			val, isEmpty;
		
		// must return a model
		if (!Temple.Model.isModel(model)) return;

		this.dependOnModel(model);
		val = model.handle("toArray");
		if (!_.isArray(val)) val = model.get();
		if (_.isFunction(val)) val = val.call(this);
		isEmpty = Section.isEmpty(val);

		if (isEmpty && this.inverted) {
			var b = new Temple.Binding(model);
			this.body(b, 0);
			this.addChild(b);
		} else if (!isEmpty && !this.inverted) {
			if (_.isArray(val)) {
				val.forEach(function(v, i) {
					var m = model.getModel(i),
						b = new Temple.Binding(m);

					this.body(b, i);
					this.addChild(b);
				}, this);
			} else {
				var b = new Temple.Binding(model);
				this.body(b, 0);
				this.addChild(b);
			}
		}

		return Temple.Binding.prototype.mount.apply(this, arguments);
	}
});