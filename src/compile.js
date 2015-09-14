var _ = require("underscore");
var NODE_TYPE = require("./types");
var parse = require("./m+xml").parse;

var buffer, indent;

function reset(i) {
	buffer = [];
	indent = i == null ? 0 : i;
}

function write(line) {
	if (line) line = _.times(indent, () => "\t").join("") + line;
	buffer.push(line);
}

var renderers = {
	[NODE_TYPE.ELEMENT]: function(tpl) {
		write(`elementOpen(${JSON.stringify(tpl.name)});`);
		indent++;
		render(tpl.children);
		indent--;
		write(`elementClose(${JSON.stringify(tpl.name)});`);
	},
	[NODE_TYPE.TEXT]: function(tpl) {
		write(`text(${JSON.stringify(tpl.value)});`);
	}
};

function render(tpl, key) {
	if (Array.isArray(tpl)) tpl.forEach(render);
	if (_.has(renderers, tpl.type)) renderers[tpl.type](tpl, key);
}

export default function compile(tpl) {
	if (typeof tpl === "string") tpl = parse(tpl);

	if (tpl != null) {
		if (tpl.type === NODE_TYPE.ROOT) {
			return tpl.views.map(compile).join("\n");
		} else if (tpl.type === NODE_TYPE.VIEW) {
			reset(2);
			let scripts = [];

			render(tpl.children.filter(function(c) {
				if (c.type !== NODE_TYPE.SCRIPT) return true;
				scripts.push(c.value);
			}));

			return `Temple.register(${JSON.stringify(tpl.name)}, {
	initialize: function() {
${scripts.join("\n")}
	},
	render: function() {
${buffer.join("\n")}
	}
});`;
		}
	}

	throw new Error("Expecting string or template tree.");
}
