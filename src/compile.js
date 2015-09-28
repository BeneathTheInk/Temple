import * as _ from "underscore";
import * as NODE_TYPE from "./types";
import { parse } from "./m+xml";
import { toString, hash } from "./utils";

var common = {
	idom: "var idom = Temple.idom;",
	utils: "var utils = Temple.utils;",
	proxies: "var proxies = Temple.proxies;",
	context: "var Context = Temple.Context;"
};

var headers;
var buffer;
var tabs;
var tabchar;
var queries;

function start(t) {
	headers = [];
	queries = [];
	buffer = "";
	tabs = 0;
	tabchar = t || "  ";
}

function reset() {
	headers = null;
	queries = null;
	buffer = null;
	tabs = null;
}

function write(str) {
	for (let i = 0; i < tabs; i++) buffer += tabchar;
	buffer += str + "\n";
}

function indent() { tabs++; }
function outdent() { tabs--; }

function header(h) {
	if (!_.contains(headers, h)) headers.push(h);
}

function use() {
	_.flatten(_.toArray(arguments)).forEach(function(n) {
		let v = common[n];
		if (v) header(toString(v));
	});
}

function query(q) {
	let s = JSON.stringify(q);
	let v = ("q" + hash(s)).replace("-", "_");
	header(`var ${v} = ${s};`);
	return `ctx.query(${v})`;
}

function stringify(tpl) {
	if (_.isArray(tpl)) {
		return tpl.map((t) => stringify(t))
			.filter(_.isString).join(" + ");
	}

	switch (tpl.type) {
		case NODE_TYPE.TEXT:
			return JSON.stringify(tpl.value);

		case NODE_TYPE.INTERPOLATOR:
		case NODE_TYPE.TRIPLE:
			return `utils.toString(${query(tpl.value)})`;
	}
}

// converts an argument template into an array of values
function argumentify(arg) {
	if (_.isArray(arg)) return "[ " + arg.map(a => argumentify(a)).join(", ") + " ]";

	switch(arg.type) {
		case NODE_TYPE.INTERPOLATOR:
			return query(arg.value);

		case NODE_TYPE.LITERAL:
			return JSON.stringify(arg.value);
	}
}

function attributes(attrs) {
	use("idom");

	attrs.forEach(function(a) {
		write(`idom.decorate(this, ${JSON.stringify(a.name)}, {`);
		indent();

			write(`mixin: { context: ctx },`);
			write(`string: function() { return ${stringify(a.children)}; },`);
			write(`"arguments": function() { return ${argumentify(a.arguments)}; }`);

		outdent();
		write(`});`);
	});
}

function open() {
	write(`(function() {`);
	indent();
}

function close() {
	outdent();
	write(`}).call(this);`);
}

var renderers = {
	[NODE_TYPE.ROOT]: function(tpl) {
		render(tpl.views);
	},

	[NODE_TYPE.SCRIPT]: function(tpl) {
		write(tpl.value);
	},

	[NODE_TYPE.VIEW]: function(tpl) {
		write(`Temple.register(${JSON.stringify(tpl.name)}, {`);
		indent();

			write("initialize: function() {");
			indent();

				let nodes = tpl.children.filter(function(c) {
					if (c.type !== NODE_TYPE.SCRIPT) return true;
					render(c);
				});

			outdent();
			write("},");

			let attrs = tpl.attributes.filter(function(a) {
				if (a.name !== "extends") return true;
				write(`extends: ${JSON.stringify(a.value)},`);
			});

			write("render: function(ctx) {");
			indent();

				attributes(attrs);
				render(nodes);

			outdent();
			write("}");

		outdent();
		write("});");
	},

	[NODE_TYPE.TEXT]: function(tpl) {
		use("idom");
		write(`idom.text(${JSON.stringify(tpl.value)});`);
	},

	[NODE_TYPE.ELEMENT]: function(tpl) {
		use("idom");

		let tagName = JSON.stringify(tpl.name);
		write(`if (!this.renderView(${tagName}, ctx)) {`);
		indent();

			write(`idom.elementOpen(${tagName});`);//${key ? "," + JSON.stringify(key) : ""}
			indent();

				attributes(tpl.attributes);
				render(tpl.children);

			outdent();
			write(`idom.elementClose(${tagName});`);

		outdent();
		write("}");
	},

	[NODE_TYPE.PARTIAL]: function(tpl) {
		write(`this.renderView(${JSON.stringify(tpl.value)}, ctx);`);
	},

	[NODE_TYPE.INTERPOLATOR]: function(tpl) {
		use("idom","utils");
		write(`idom.text(utils.toString(${query(tpl.value)}));`);
	},

	[NODE_TYPE.TRIPLE]: function(tpl) {
		use("idom");
		write(`idom.html(${query(tpl.value)});`);
	},

	[NODE_TYPE.SECTION]: function(tpl) {
		use("proxies", "context");

		function renderSection(v, i) {
			if (i) write(`var indexctx = new Context({ $index: ${i} }, prevctx, { transparent: true });`);
			write(`var ctx = new Context(${v}, ${i ? "indexctx" : "prevctx"});`);
			render(tpl.children);
		}

		open();
		write(`var prevctx = ctx;`);
		write(`var val = ${query(tpl.value)};`);
		write(`var proxy = proxies.getByTarget(val, [ "empty", "section" ]);`);
		let isEmpty = `Boolean(proxies.run(proxy, "empty", val))`;

		if (tpl.type === NODE_TYPE.INVERTED) {
			write(`if (${isEmpty}) {`);
			indent();

				open();
				renderSection("val");
				close();

			outdent();
			write(`}`);
		} else {
			write(`if (!${isEmpty}) {`);
			indent();

				write(`proxies.run(proxy, "section", val, (function(data, index) {`);
				indent();

					renderSection("data", "index");

				outdent();
				write(`}).bind(this));`);

			outdent();
			write(`}`);
		}

		close();
	}
};

renderers[NODE_TYPE.INVERTED] = renderers[NODE_TYPE.SECTION];

function render(tpl, key) {
	if (tpl != null) {
		if (typeof tpl === "string") tpl = parse(tpl);
		if (_.isArray(tpl)) tpl.forEach(render);
		else if (tpl.type && renderers[tpl.type]) {
			renderers[tpl.type](tpl, key);
		}
	}
}

export default function compile(tpl) {
	start();
	render(tpl);
	let ret = [ headers.join("\n"), buffer ].join("\n\n");
	reset();
	return ret;
}
