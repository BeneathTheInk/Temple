var Temple = require("templejs"),
	NODE_TYPE = require("./types"),
	_ = require("underscore"),
	parse = require("./m+xml").parse,
	util = require("./util"),
	Context = require("./context"),
	Model = require("./model"),
	Section = require("./section");

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

		Context.call(this, data, options);
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
			c = this;

		while (c != null) {
			if (c._decorators != null && _.isArray(c._decorators[name])) {
				c._decorators[name].forEach(function(d) {
					if (!_.findWhere(decorators, { callback: d.callback })) decorators.push(d);
				});
			}

			c = c.parent;
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

		var toMount, bindings;
		bindings = this.renderTemplate(this._template, null, toMount = []);
		
		this.once("render:after", function() {
			// we invoke them in reverse to ensure the DOM nodes are in the correct order
			_.invoke(toMount.reverse(), "mount");
		});

		return bindings;
	},

	renderTemplate: function(template, ctx, toMount) {
		if (ctx == null) ctx = this;
		if (toMount == null) toMount = [];
		var self = this;

		if (_.isArray(template)) return template.map(function(t) {
			return this.renderTemplate(t, ctx, toMount);
		}, this).filter(function(b) { return b != null; });

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return this.renderTemplate(template.children, ctx, toMount);

			case NODE_TYPE.ELEMENT:
				var part = this.renderPartial(template.name, ctx);
				var obj;

				if (part != null) {
					if (part instanceof Context) {
						part.addData(obj = util.track({}));

						template.attributes.forEach(function(attr) {
							self.autorun(function(c) {
								var val = this.renderArguments(attr.arguments, ctx);
								if (val.length === 1) val = val[0];
								else if (!val.length) val = void 0;

								if (c.firstRun) obj.defineProperty(attr.name, val);
								else obj[attr.name] = val;
							});
						});
					}

					toMount.push(part);
					return part;
				}

				else {
					var binding = new Temple.Element(template.name);
					this.renderTemplate(template.children, ctx, toMount).forEach(binding.appendChild, binding);
					toMount.push(binding);

					binding.render = function() {
						template.attributes.forEach(function(attr) {
							if (self.renderDecorations(attr, binding, ctx)) return;
							
							this.autorun(function() {
								this.attr(attr.name, self.renderTemplateAsString(attr.children, ctx));
							});
						}, this);	
					}

					return binding;
				}

			case NODE_TYPE.TEXT:
				return new Temple.Text(util.decodeEntities(template.value));

			case NODE_TYPE.HTML:
				return new Temple.HTML(template.value);

			case NODE_TYPE.XCOMMENT:
				return new Temple.Comment(template.value);

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				var node = new Temple[template.type === NODE_TYPE.TRIPLE ? "HTML" : "Text"];
				toMount.push(node);

				node.render = function() {
					this.setValue(ctx.get(template.value));
				}

				return node;

			case NODE_TYPE.INVERTED:
			case NODE_TYPE.SECTION:
				var section = new Section(ctx.model)
				.invert(template.type === NODE_TYPE.INVERTED)
				.setPath(template.value)
				.onRow(function(key) {
					var toMount, bindings;
					bindings = self.renderTemplate(template.children, this, toMount = []);
					this.once("render:after", function() { _.invoke(toMount.reverse(), "mount"); });
					return bindings;
				});

				toMount.push(section);
				return section;

			case NODE_TYPE.PARTIAL:
				var partial = this.renderPartial(template.value, ctx);
				if (partial != null) toMount.push(partial);
				return partial;
		}
	},

	renderTemplateAsString: function(template, ctx) {
		if (ctx == null) ctx = this;
		var self = this;

		if (_.isArray(template)) return template.map(function(t) {
			return self.renderTemplateAsString(t, ctx);
		}).filter(function(b) { return b != null; }).join("");

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return this.renderTemplateAsString(template.children, ctx);

			case NODE_TYPE.TEXT:
				return template.value;

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				var val = ctx.get(template.value);
				return val != null ? val.toString() : "";

			case NODE_TYPE.SECTION:
			case NODE_TYPE.INVERTED:
				var inverted, model, val, isEmpty, makeRow, proxy, isList;

				inverted = template.type === NODE_TYPE.INVERTED;
				val = ctx.get(template.value);
				model = new Model(val, ctx.model);
				proxy = model.getProxyByValue(val);
				isList = model.callProxyMethod(proxy, val, "isList");
				isEmpty = Section.isEmpty(model, proxy);
				
				makeRow = function(i) {
					var row, data;

					if (i == null) {
						data = model;
					} else {
						data = model.callProxyMethod(proxy, val, "get", i);
						data = new Model(data, new Model({ $key: i }, ctx.model));
					}

					var row = new Context(model);
					return self.renderTemplateAsString(template.children, row);
				}

				if (!(isEmpty ^ inverted)) {
					return isList && !inverted ?
						model.callProxyMethod(proxy, val, "keys").map(makeRow).join("") :
						makeRow();
				}
		}
	},

	renderArguments: function(arg, ctx) {
		if (ctx == null) ctx = this;
		var self = this;

		if (_.isArray(arg)) return arg.map(function(a) {
			return self.renderArguments(a, ctx);
		}).filter(function(b) { return b != null; });

		switch(arg.type) {
			case NODE_TYPE.INTERPOLATOR:
				return ctx.get(arg.value);

			case NODE_TYPE.LITERAL:
				return arg.value;
		}
	},

	// generates a new component from a partial or partial's name
	renderPartial: function(klass, ctx, options) {
		if (ctx == null) ctx = this;
		var comps = this._components,
			name;

		if (typeof klass === "string") {
			name = klass;
			klass = this.findPartial(klass);
		}

		if (!util.isSubClass(Temple, klass)) return null;

		// create it non-reactively
		var component = Temple.Deps.nonreactive(function() {
			return util.isSubClass(Context, klass) ? new klass(ctx.model, options) : new klass();
		});

		// add it to the list
		if (name) {
			if (comps[name] == null) comps[name] = [];
			comps[name].push(component);

			// auto remove when the partial is "stopped"
			component.once("stop", function() {
				comps[name] = _.without(comps[name], component);
			});
		}

		return component;
	},

	renderDecorations: function(attr, binding, ctx) {
		var decorators = this.findDecorators(attr.name);
		if (!decorators.length) return;

		var self = this;
		if (ctx == null) ctx = this;

		return this.autorun(function() {
			var argsValue, stringValue;
			if (argsValue == null) argsValue = self.renderArguments(attr.arguments, ctx);

			decorators.forEach(function(d) {
				var args = [];

				if (d.options && d.options.parse === "string") {
					if (stringValue == null) stringValue = self.renderTemplateAsString(attr.children, ctx);
					args = [ stringValue ];
				} else if (d.options == null || d.options.parse !== false) {
					if (argsValue == null) argsValue = self.renderArguments(attr.arguments, ctx);
					args = argsValue.slice(0);
				}

				self.autorun(function(comp) {
					d.callback.apply(self, [ {
						node: binding.node,
						target: binding,
						context: ctx,
						template: attr,
						comp: comp,
						options: d.options
					} ].concat(args));
				});
			});
		});
	}

}, {

	render: function(template, data, options) {
		options = _.extend({}, options || {}, {
			template: template
		});

		return new Mustache(data, options);
	}

});
