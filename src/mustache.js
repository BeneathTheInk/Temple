var _ = require("underscore");
var NODE_TYPE = require("./types");
var parse = require("./m+xml").parse;
var utils = require("./utils");
var View = require("./view");
var Model = require("./model");
var Section = require("./section");
var $track = require("trackr-objects");
var DOMRange = require("./domrange");

var Mustache =
module.exports = View.extend({
	constructor: function(data, options) {
		options = options || {};

		// add template
		var template = options.template || _.result(this, "template");
		if (template != null) this.setTemplate(template);

		// add decorators
		this.decorate(_.extend({}, options.decorators, _.result(this, "decorators")));

		// initiate like a normal view
		View.call(this, data, options);
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

	// special partial setter that converts strings into mustache Views
	setPartial: function(name, partial) {
		if (_.isObject(name)) return View.prototype.setPartial.call(this, name);

		if (_.isString(partial)) partial = parse(partial);
		if (_.isObject(partial) && partial.type === NODE_TYPE.ROOT) partial = Mustache.extend({ template: partial });
		if (partial != null && !utils.isSubClass(View, partial))
			throw new Error("Expecting string template, parsed template, View subclass or function for partial.");

		return View.prototype.setPartial.call(this, name, partial);
	},

	// the main render function called by mount
	render: function() {
		if (this._template == null)
			throw new Error("Expected a template to be set before rendering.");

		var toMount;
		this.setMembers(this.renderTemplate(this._template, null, toMount = []));
		_.invoke(toMount, "mount");
	},

	// converts a template into an array of elements and DOMRanges
	renderTemplate: function(template, view, toMount) {
		if (view == null) view = this;
		if (toMount == null) toMount = [];
		var self = this;

		if (_.isArray(template)) return template.reduce(function(r, t) {
			var b = self.renderTemplate(t, view, toMount);
			if (_.isArray(b)) r.push.apply(r, b);
			else if (b != null) r.push(b);
			return r;
		}, []);

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return this.renderTemplate(template.children, view, toMount);

			case NODE_TYPE.ELEMENT:
				var part = this.renderPartial(template.name, view);
				var obj;

				if (part != null) {
					part.addData(obj = $track({}));

					template.attributes.forEach(function(attr) {
						self.autorun(function(c) {
							var val = this.renderArguments(attr.arguments, view);
							if (val.length === 1) val = val[0];
							else if (!val.length) val = void 0;

							if (c.firstRun) obj.defineProperty(attr.name, val);
							else obj[attr.name] = val;
						});
					});

					toMount.push(part);
					return part;
				}

				else {
					var el = document.createElement(template.name);

					template.attributes.forEach(function(attr) {
						if (this.renderDecorations(el, attr, view)) return;

						this.autorun(function() {
							el.setAttribute(attr.name, this.renderTemplateAsString(attr.children, view));
						});
					}, this);

					var children = this.renderTemplate(template.children, view, toMount),
						child, i;

					for (i in children) {
						child = children[i];
						if (child instanceof DOMRange) {
							child.parentRange = view; // fake the parent
							child.attach(el);
						} else {
							el.appendChild(child);
						}
					}

					return el;
				}

				break;

			case NODE_TYPE.TEXT:
				return document.createTextNode(utils.decodeEntities(template.value));

			case NODE_TYPE.HTML:
				return new DOMRange(utils.parseHTML(template.value));

			case NODE_TYPE.XCOMMENT:
				return document.createComment(template.value);

			case NODE_TYPE.INTERPOLATOR:
				var node = document.createTextNode("");

				this.autorun(function() {
					var val = view.get(template.value);
					node.nodeValue = typeof val === "string" ? val : val != null ? val.toString() : "";
				});

				return node;

			case NODE_TYPE.TRIPLE:
				var range = new DOMRange();

				this.autorun(function() {
					range.setMembers(utils.parseHTML(view.get(template.value)));
				});

				return range;

			case NODE_TYPE.INVERTED:
			case NODE_TYPE.SECTION:
				var section = new Section(view.model)
					.invert(template.type === NODE_TYPE.INVERTED)
					.setPath(template.value)
					.onRow(function() {
						var _toMount;
						this.setMembers(self.renderTemplate(template.children, this, _toMount = []));
						_.invoke(_toMount, "mount");
					});

				toMount.push(section);
				return section;

			case NODE_TYPE.PARTIAL:
				var partial = this.renderPartial(template, view);
				if (partial) toMount.push(partial);
				return partial;
		}
	},

	// converts a template into a string
	renderTemplateAsString: function(template, ctx) {
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;
		var self = this, val;

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
				val = ctx.get(template.value);
				return val != null ? val.toString() : "";

			case NODE_TYPE.SECTION:
			case NODE_TYPE.INVERTED:
				var inverted, model, isEmpty, makeRow, proxy, isList;

				inverted = template.type === NODE_TYPE.INVERTED;
				val = ctx.get(template.value);
				model = new Model(val, ctx);
				proxy = model.getProxyByValue(val);
				isList = model.callProxyMethod(proxy, val, "isList");
				isEmpty = Section.isEmpty(model, proxy);

				makeRow = function(i) {
					var data;

					if (i == null) {
						data = model;
					} else {
						data = model.callProxyMethod(proxy, val, "get", i);
						data = new Model(data, new Model({ $key: i }, ctx));
					}

					return self.renderTemplateAsString(template.children, data);
				};

				if (!(isEmpty ^ inverted)) {
					return isList && !inverted ?
						model.callProxyMethod(proxy, val, "keys").map(makeRow).join("") :
						makeRow();
				}
		}
	},

	// converts an argument template into an array of values
	renderArguments: function(arg, ctx) {
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;
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

	// renders decorations on an element by template
	renderDecorations: function(el, attr, ctx) {
		var self = this;

		// look up decorator by name
		var decorators = this.findDecorators(attr.name);
		if (!decorators.length) return;

		// normalize the context
		if (ctx == null) ctx = this;
		if (ctx instanceof View) ctx = ctx.model;

		// a wrapper computation to ez-clean the rest
		return this.autorun(function(_comp) {
			decorators.forEach(function(d) {
				if (d.options && d.options.defer) _.defer(execDecorator);
				else execDecorator();

				function execDecorator() {
					var dcomp = self.autorun(function(comp) {
						// assemble the arguments!
						var args = [ {
							target: el,
							model: ctx,
							view: self,
							template: attr,
							comp: comp,
							options: d.options
						} ];

						// render arguments based on options
						if (d.options && d.options.parse === "string") {
							args.push(self.renderTemplateAsString(attr.children, ctx));
						} else if (d.options == null || d.options.parse !== false) {
							args = args.concat(self.renderArguments(attr.arguments, ctx));
						}

						// execute the callback
						d.callback.apply(d.context || self, args);
					});

					// clean up
					_comp.onInvalidate(function() {
						dcomp.stop();
					});
				}
			});
		});
	}

}, {

	render: function(template, data, options) {
		options = _.extend({}, options || {}, {
			template: template
		});

		return new Mustache(data || null, options);
	}

});
