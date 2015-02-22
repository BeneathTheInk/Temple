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
		if (ctx == null) ctx = this.model;
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

				if (part != null) {
					break;
					// if (part instanceof Context) {
					// 	template.attributes.forEach(function(attr) {
					// 		this.autorun(function() {
					// 			var val = this.convertArgumentTemplate(attr.arguments, ctx);
					// 			if (val.length === 1) val = val[0];
					// 			else if (!val.length) val = null;

					// 			var model = part.getModel();
					// 			if (model == null) return;
					// 			model.set(attr.name, val);
					// 		});
					// 	}, this);
					// }

					// toMount.push(part);
					// return part;
				}

				else {
					var binding = new Temple.Element(template.name);
					this.renderTemplate(template.children, ctx, toMount).forEach(binding.appendChild, binding);
					toMount.push(binding);

					binding.render = function() {
						template.attributes.forEach(function(attr) {
							// if (this._processDecorations(attr, binding, ctx)) {
							// 	if (willMount) return;
							// 	toMount.push(binding);
							// 	willMount = true;
							// }

							// else {
								this.autorun(function() {
									this.attr(attr.name, self.renderTemplateAsString(attr.children, ctx));
								});
							// }
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
				var section = new Section(ctx)
				.invert(template.type === NODE_TYPE.INVERTED)
				.setPath(template.value)
				.onRow(function(key) {
					var toMount, bindings;
					bindings = self.renderTemplate(template.children, this.model, toMount = []);
					this.once("render:after", function() { _.invoke(toMount.reverse(), "mount"); });
					
					return bindings;
				});

				toMount.push(section);
				return section;

			case NODE_TYPE.PARTIAL:

		}
	},

	renderTemplateAsString: function(template, ctx) {
		if (ctx == null) ctx = this;
		var temple = this;

		if (_.isArray(template)) return template.map(function(t) {
			return temple.renderTemplateAsString(t, ctx);
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
				// var inverted = template.type === NODE_TYPE.INVERTED,
				// 	path = template.value,
				// 	model, val, isEmpty, makeRow, strval;

				// val = ctx.get(path);
				// model = new Model(val);
				// ctx.getAllProxies().reverse().forEach(model.registerProxy, model);

				// isEmpty = Section.isEmpty(model);
				// if (model.proxy("isArray")) model.depend("length");

				// makeRow = function(i) {
				// 	var row, m;

				// 	if (i == null) {
				// 		m = model;
				// 		i = 0;
				// 	} else {
				// 		m = model.getModel(i);
				// 	}

				// 	var row = new Context(m, ctx);
				// 	row.addModel(new Model({ $key: i }));

				// 	var val = temple.convertStringTemplate(template.children, row);
				// 	row.clean();

				// 	return val;
				// }

				// if (!(isEmpty ^ inverted)) {
				// 	strval = _.isArray(val) && !inverted ?
				// 		model.keys().map(makeRow).join("") :
				// 		makeRow();
				// }

				// model.cleanProxyTree();
				// return strval;
		}
	},

	// generates a new component from a partial or partial's name
	renderPartial: function(klass, ctx, options) {
		if (ctx == null) ctx = this.model;
		var comps = this._components;

		if (typeof klass === "string") klass = this.findPartial(klass);
		if (!util.isSubClass(Temple, klass)) return null;

		// create it non-reactively
		var component = Temple.Deps.nonreactive(function() {
			return util.isSubClass(Context, klass) ? new klass(ctx, options) : new klass();
		});

		// add it to the list
		if (comps[name] == null) comps[name] = [];
		comps[name].push(component);

		// clean up when the partial is "stopped"
		component.once("stop", function() {
			comps[name] = _.without(comps[name], this);
		});

		return component;
	}

});
