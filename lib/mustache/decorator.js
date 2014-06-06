var _ = require("underscore"),
	NODE_TYPE = require("../types"),
	Binding = require("../binding"),
	ArgParser = require("./arguments.pegjs");

var varTypes = [ NODE_TYPE.INTERPOLATOR, NODE_TYPE.TRIPLE ];

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

module.exports = Binding.extend({
	constructor: function(el, args, decorators, temple) {
		if (!(el instanceof window.Element))
			throw new Error("Decorator binding must be initialized with an element.");

		this.temple = temple;
		
		this.decorators = decorators.map(function(fn) {
			return fn.call(temple, el, args);
		}).filter(function(d) {
			return typeof d === "object";
		});

		this.decorators.some(function(d) {
			if (d.parse !== false) {
				this.args = convertTemplateToArgs(args);
				return true;
			}
		}, this);

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Decorator bindings cannot have children.");
	},

	render: function(scope) {
		var raw = this.temple._processStringTemplate(this.args, scope),
			args = ArgParser.parse(raw, { scope: scope });

		this.decorators.forEach(function(d) {
			if (typeof d.update === "function") d.update.apply(scope, args);
		}, this);
	},

	appendTo: function(el) { return; },

	destroy: function() {
		this.decorators.forEach(function(d) {
			if (typeof d.destroy === "function") d.destroy.call(this.temple);
		}, this);

		return Binding.prototype.destroy.apply(this, arguments);
	}
});