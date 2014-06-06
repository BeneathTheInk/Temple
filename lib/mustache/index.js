var Temple = require("../temple"),
	Binding = require("../binding"),
	NODE_TYPE = require("../types"),
	_ = require("underscore"),
	parse = require("./parse"),
	util = require("../util"),
	Section = require("./section"),
	Decorator = require("./decorator");

module.exports = Temple.extend({
	constructor: function(template, data) {
		// parse and add template
		template = template || this.template;
		if (template != null) this.setTemplate(template);

		Temple.call(this, data);
	},

	_processTemplate: function(template) {
		if (_.isArray(template)) return template.map(function(t) {
			return this._processTemplate(t);
		}, this).filter(function(b) { return b != null; });

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return new Binding(this._processTemplate(template.children));

			case NODE_TYPE.ELEMENT:
				var b = new Binding.Element(template.name, this._processTemplate(template.children));

				template.attributes.forEach(function(attr) {
					var decorators = this._decorators && this._decorators[attr.name],
						self = this;
					
					if (Array.isArray(decorators) && decorators.length) {
						b.addChild(new Decorator(b.node, attr.children, decorators, this));
					}

					else {
						b.attr(attr.name, function(scope) {
							return self._processStringTemplate(attr.children, scope);
						});
					}
				}, this);

				return b;

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
				var body = (function() { return this._processTemplate(template.children); }).bind(this);
				return new Section(template.value, body, template.type === NODE_TYPE.INVERTED);

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
							var nscope = scope.newScopeFromPath(util.joinPathParts(path, i));
							return this._processStringTemplate(template.children, nscope);
						}, this).join("");
					} else {
						var nscope = scope.newScopeFromPath(template.value);
						return this._processStringTemplate(template.children, nscope);
					}
				} else {
					return;
				}
				
			default:
				console.log(template);
		}
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
			each(name, function(fn, n) { this.decorate(n, fn); }, this);
			return this;
		}

		if (typeof name !== "string" || name === "") throw new Error("Expecting non-empty string for decorator name.");
		if (typeof fn !== "function") throw new Error("Expecting function for decorator.");
		
		if (this._decorators == null) this._decorators = {};
		if (this._decorators[name] == null) this._decorators[name] = [];
		this._decorators[name].push(fn);
		
		return this;
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
			each(this._decorators, function(d, n) {
				this._decorators[n] = d.filter(function(f) { return f !== fn });
			}, this);
		}

		else {
			var d = this._decorators[name], index;
			
			if (Array.isArray(d)) {
				index = d.indexOf(fn);
				if (index > -1) d.splice(index, 1);
			}
		}

		return this;
	}
}, {
	parse: parse
});