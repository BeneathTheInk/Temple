var Temple = require("../temple"),
	Binding = require("../binding"),
	NODE_TYPE = require("../types"),
	_ = require("underscore"),
	parse = require("./parse"),
	Section = require("./section");

module.exports = Temple.extend({
	constructor: function(template, data) {
		// parse and add template
		template = template || this.template;
		if (template != null) this.setTemplate(template);

		Temple.call(this, data);
	},

	_processStringTemplate: function(template, scope) {
		if (_.isArray(template)) return template.map(function(t) {
			return this._processStringTemplate(t, scope);
		}, this).filter(function(b) { return b != null; }).join("");

		switch(template.type) {
			case NODE_TYPE.TEXT:
				return template.value;

			case NODE_TYPE.INTERPOLATOR:
			case NODE_TYPE.TRIPLE:
				var val = scope.get(template.value);
				return val != null ? val.toString() : "";
		}
	},

	_processTemplate: function(template) {
		if (_.isArray(template)) return template.map(function(t) {
			return this._processTemplate(t);
		}, this).filter(function(b) { return b != null; });

		switch(template.type) {
			case NODE_TYPE.ROOT:
				return new Binding(this._processTemplate(template.children));

			case NODE_TYPE.ELEMENT:
				var b = new Binding.Element(template.name, this._processTemplate(template.children)),
					self = this;

				template.attributes.forEach(function(attr) {
					b.attr(attr.name, function(scope) {
						return self._processStringTemplate(attr.children, scope);
					});
				});

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
				return new Section(template.value, this._processTemplate.bind(this, template.children));

			default:
				console.log(template);
		}
	},

	render: function() {
		if (this._template == null) throw new Error("Expected a template to be set before rendering.");
		return this._processTemplate(this._template);
	},

	// parses and sets the root template
	setTemplate: function(template) {
		if (_.isString(template)) template = parse(template);
		
		if (!_.isObject(template) || template.type !== NODE_TYPE.ROOT)
			throw new Error("Expecting string or parsed template.");

		this._template = template;
		return this;
	}
}, {
	parse: parse
});