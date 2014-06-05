var Temple = require("../temple"),
	Binding = require("../binding"),
	NODE_TYPE = require("../types"),
	_ = require("underscore"),
	parse = require("./parse"),
	util = require("../util"),
	Section = require("./section");

module.exports = Temple.extend({
	constructor: function(template, data) {
		// parse and add template
		template = template || this.template;
		if (template != null) this.setTemplate(template);

		Temple.call(this, data);
	},

	render: function() {
		if (this._template == null)
			throw new Error("Expected a template to be set before rendering.");

		return processTemplate(this._template);
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

function processStringTemplate(template, scope) {
	if (_.isArray(template)) return template.map(function(t) {
		return processStringTemplate(t, scope);
	}).filter(function(b) { return b != null; }).join("");

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
						return processStringTemplate(template.children, nscope);
					}).join("");
				} else {
					var nscope = scope.newScopeFromPath(template.value);
					return processStringTemplate(template.children, nscope);
				}
			} else {
				return;
			}
			
		default:
			console.log(template);
	}
}

function processTemplate(template) {
	if (_.isArray(template)) return template.map(function(t) {
		return processTemplate(t);
	}).filter(function(b) { return b != null; });

	switch(template.type) {
		case NODE_TYPE.ROOT:
			return new Binding(processTemplate(template.children));

		case NODE_TYPE.ELEMENT:
			var b = new Binding.Element(template.name, processTemplate(template.children));

			template.attributes.forEach(function(attr) {
				b.attr(attr.name, function(scope) {
					return processStringTemplate(attr.children, scope);
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
			var body = function() { return processTemplate(template.children); }
			return new Section(template.value, body, template.type === NODE_TYPE.INVERTED);

		default:
			console.log(template);
	}
}