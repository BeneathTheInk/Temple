var Temple = require("../temple"),
	Binding = require("../binding"),
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

		return this._processTemplate(this._template);
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
		var d = [];
		
		if (this._decorators != null && _.isArray(this._decorators[name]))
			d = d.concat(this._decorators[name]);

		if (this.parent != null) d = d.concat(this.parent.findDecorators(name));
		
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

		this.emit("partial", name, partial);
		this.emit("partial:" + name, partial);
		
		return this;
	},

	// looks through parents for partial
	findPartial: function(name) {
		var partial = this._partials[name];

		if (partial == null && this.parent != null) {
			partial = this.parent.findPartial(name);
		}

		return partial;
	},

	// returns all the component instances as specified by partial name
	getComponents: function(name) {
		return this._components[name] || [];
	},

	_attrToDecorator: function(attr, binding) {
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

			directive = function(scope) {
				var raw, args = [];

				if (targs != null) {
					raw = temple._processStringTemplate(targs, scope);
					args = ArgParser.parse(raw, { scope: scope });
				}

				processed.forEach(function(d) {
					if (typeof d.update === "function") {
						d.update.apply(scope, d.parse !== false ? args : []);
					}
				}, this);
			}

			binding.directive(directive);

			binding.once("destroy", function() {
				processed.forEach(function(d) {
					if (typeof d.destroy === "function") d.destroy.call(temple);
				});

				binding.killDirective(directive);
			});
		}

		else {
			binding.attr(attr.name, function(scope) {
				return temple._processStringTemplate(attr.children, scope);
			});
		}
	},

	_processTemplate: function(template) {
		if (_.isArray(template)) return template.map(function(t) {
			return this._processTemplate(t);
		}, this).filter(function(b) { return b != null; });

		var temple = this;

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return new Binding(this._processTemplate(template.children));

			case NODE_TYPE.ELEMENT:
				var binding = new Binding.Element(template.name, this._processTemplate(template.children));

				template.attributes.forEach(function(attr) {
					this._attrToDecorator(attr, binding);
				}, this);

				return binding;

			case NODE_TYPE.TEXT:
				return new Binding.Text(template.value);

			case NODE_TYPE.INTERPOLATOR:
				return new Binding.Text(function(scope) {
					return scope.get(template.value);
				});

			case NODE_TYPE.TRIPLE:
				return new Binding.HTML(function(scope) {
					return scope.get(template.value);
				});

			case NODE_TYPE.INVERTED:
			case NODE_TYPE.SECTION:
				var body = function() { return temple._processTemplate(template.children); }
				return new Section(template.value, body, template.type === NODE_TYPE.INVERTED);

			case NODE_TYPE.PARTIAL:
				var name = template.value,
					partial = this.findPartial(name),
					comps = this._components,
					comp;

				if (partial != null) {
					comp = new partial;
					comp.parent = this;
					
					if (comps[name] == null) comps[name] = [];
					comps[name].push(comp);

					comp.once("destroy", function() {
						var index = comps[name].indexOf(comp);
						if (~index) comps[name].splice(index, 1);
					});
					
					return new Binding.Component(comp);
				}

				break;

			default:
				console.log(template);
		}
	},

	_processStringTemplate: function(template, scope) {
		if (_.isArray(template)) return template.map(function(t) {
			return this._processStringTemplate(t, scope);
		},this).filter(function(b) { return b != null; }).join("");

		switch(template.type) {
			case NODE_TYPE.TEXT:
				return template.value;

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				var val = scope.get(template.value);
				return val != null ? val.toString() : "";

			case NODE_TYPE.SECTION:
			case NODE_TYPE.INVERTED:
				var inverted = template.type === NODE_TYPE.INVERTED,
					path = template.value,
					val = scope.get(path),
					isEmpty = Section.isEmpty(val);

				scope.depend(util.joinPathParts(path, "*"));

				if (!(isEmpty ^ inverted)) {
					if (_.isArray(val) && !inverted) {
						return val.map(function(v, i) {
							var nscope = scope.createScopeFromPath(util.joinPathParts(path, i));
							return this._processStringTemplate(template.children, nscope);
						}, this).join("");
					} else {
						var nscope = scope.createScopeFromPath(template.value);
						return this._processStringTemplate(template.children, nscope);
					}
				} else {
					return;
				}
				
			default:
				console.log(template);
		}
	}
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