import * as _ from "underscore";
import { SourceNode } from "source-map";
import { toString, hash } from "./utils";

var deps = {
	idom: "var idom = Temple.idom;\n",
	utils: "var utils = Temple.utils;\n",
	proxies: "var proxies = Temple.proxies;\n",
	context: "var Context = Temple.Context;\n"
};

function header(data, h) {
	if (_.isArray(data.headers) && !_.contains(data.headers, h)) {
		data.headers.push(h);
	}
}

function use(data) {
	_.flatten(_.toArray(arguments).slice(1)).forEach(function(n) {
		let v = deps[n];
		if (v) header(data, toString(v));
	});
}

function query(data, q) {
	let s = JSON.stringify(q);
	let v = ("q" + hash(s)).replace("-", "_");
	header(data, `var ${v} = ${s};\n`);
	return `ctx.query(${v})`;
}

export class ASTNode {
	constructor(location) {
		this._location = location;
	}

	_sn(file, chunk) {
		return new SourceNode(this._location.start.line, this._location.start.column, file, chunk);
	}

	start(data) {
		this._writer = {
			chunks: [],
			data: data
		};

		return this;
	}

	indent() {
		var d = this._writer.data;
		if (typeof d.indent !== "number") d.indent = 0;
		d.indent++;
		return this;
	}

	outdent() {
		var d = this._writer.data;
		if (typeof d.indent !== "number") d.indent = 0;
		if (d.indent > 0) d.indent--;
		return this;
	}

	write(chunk) {
		let tabs = "";
		let tabchar = this._writer.data.tabchar;
		let indent = this._writer.data.indent || 0;
		if (tabchar == null) tabchar = "  ";

		for (let i = 0; i < indent; i++) tabs += tabchar;
		this.push([].concat(tabs, chunk, "\n"));

		return this;
	}

	push(chunk) {
		this._writer.chunks.push(chunk);
		return this;
	}

	use() {
		use.apply(null, [ this._writer.data ].concat(_.toArray(arguments)));
		return this;
	}

	end(chunk) {
		if (chunk) this.write(chunk);
		var w = this._writer;
		delete this._writer;
		return this._sn(w.data.originalFilename, w.chunks);
	}

	compile(data) {
		// throw new Error("Not implemented.");
		return this._sn(data.originalFilename);
	}

	compileString(data) {
		// throw new Error("Not implemented.");
		return this._sn(data.originalFilename);
	}

	compileArguments(data) {
		// throw new Error("Not implemented.");
		return this._sn(data.originalFilename);
	}
}

export class Root extends ASTNode {
	constructor(location, children) {
		super(location);
		this._children = children;
	}

	compile(data) {
		var oheads = data.headers;
		data.headers = [];
		var output = this._sn(data.originalFilename);
		output.add(_.invoke(this._children, "compile", data));
		output = output.join("\n");

		if (data.headers.length) {
			output.prepend("\n\n").prepend(data.headers);
			data.headers = oheads;
		}

		return output;
	}
}

export class View extends ASTNode {
	constructor(location, name, exts, attrs, scripts, children) {
		super(location);
		this._name = name;
		this._extends = exts;
		this._attributes = attrs;
		this._scripts = scripts;
		this._children = children;
	}

	compile(data) {
		this.start(data);

		this.write(`Temple.register(${JSON.stringify(this._name)}, {`);
		this.indent();

			this.write("initialize: function() {").indent();
			this.push(_.invoke(this._scripts, "compile", data));
			this.outdent().write("},");

		if (this._extends) {
			this.write(`extends: ${JSON.stringify(this._extends)},`);
		}

		this.write("render: function(ctx) {").indent();
		this.push(_.invoke(this._attributes, "compile", data));
		this.push(_.invoke(this._children, "compile", data));
		this.outdent().write("}");

		this.outdent().write("});");

		return this.end();
	}
}

export class Text extends ASTNode {
	constructor(location, value) {
		super(location);
		this._value = value;
	}

	compile(data) {
		this.start(data);
		this.use("idom");
		this.write(`idom.text(${JSON.stringify(this._value)});`);
		return this.end();
	}

	compileString(data) {
		return this._sn(data.originalFilename, JSON.stringify(this._value));
	}
}

export class HTMLComment extends ASTNode {
	constructor(location, value) {
		super(location);
		this._value = value;
	}
}

export class Script extends ASTNode {
	constructor(location, value) {
		super(location);
		this._value = value;
	}

	compile(data) {
		return this._sn(data.originalFilename, this._value);
	}
}

export class Element extends ASTNode {
	constructor(location, name, attrs, children) {
		super(location);
		this._name = name;
		this._attributes = attrs;
		this._children = children;
	}

	compile(data) {
		this.start(data);
		this.use("idom");

		let tagName = JSON.stringify(this._name);
		let isViewName = this._name.indexOf("-") > -1;

		if (isViewName) {
			this.write(`if (!this.renderView(${tagName}, ctx)) {`).indent();
		}

		this.write(`idom.elementOpen(${tagName});`);//${key ? "," + JSON.stringify(key) : ""}
		this.push(_.invoke(this._attributes, "compile", data));
		this.push(_.invoke(this._children, "compile", data));
		this.write(`idom.elementClose(${tagName});`);

		if (isViewName) {
			this.outdent().write("}");
		}

		return this.end();
	}
}

export class Attribute extends ASTNode {
	constructor(location, key, value, children, args) {
		super(location);
		this._key = key;
		this._value = value;
		this._children = children;
		this._arguments = args;
	}

	compile(data) {
		this.start(data);
		this.use("idom");

		this.write(`idom.decorate(this, ${JSON.stringify(this._key)}, {`).indent();
		this.write(`mixin: { context: ctx },`);

		var str = _.invoke(this._children, "compileString", data);
		this.write([
			`string: function() { return `,
			this._sn(data.originalFilename, str).join(" + "),
			`; },`
		]);

		var args = _.invoke(this._arguments, "compileArguments", data);
		this.write([
			`"arguments": function() { return [ `,
			this._sn(data.originalFilename, args).join(", "),
			` ]; }`
		]);

		this.outdent().write(`});`);

		return this.end();
	}
}

export class Literal extends ASTNode {
	constructor(location, value) {
		super(location);
		this._value = value;
	}

	compileArguments(data) {
		return this._sn(data.originalFilename, JSON.stringify(this._value));
	}
}

export class Section extends ASTNode {
	constructor(location, inverted, query, children) {
		super(location);
		this._inverted = inverted;
		this._query = query;
		this._children = children;
	}

	compile(data) {
		this.start(data);
		this.use("proxies", "context");

		let self = this;

		function renderSection(v, i) {
			if (i) self.write(`var indexctx = new Context({ $index: ${i} }, prevctx, { transparent: true });`);
			self.write(`var ctx = new Context(${v}, ${i ? "indexctx" : "prevctx"});`);
			self.push(_.invoke(self._children, "compile", data));
		}

		this.write("(function(){").indent();
		this.write("var prevctx = ctx;");
		this.write(`var val = ${query(data, this._query)};`);
		this.write(`var proxy = proxies.getByTarget(val, [ "empty", "section" ]);`);
		let isEmpty = `Boolean(proxies.run(proxy, "empty", val))`;

		if (this._inverted) {
			this.write(`if (${isEmpty}) {`).indent();
			this.write("(function(){").indent();
			renderSection("val");
			this.outdent().write("}).call(this);");
			this.outdent().write("}");
		} else {
			this.write(`if (!${isEmpty}) {`).indent();
			this.write(`proxies.run(proxy, "section", val, (function(data, index) {`).indent();
			renderSection("data", "index");
			this.outdent().write(`}).bind(this));`);
			this.outdent().write(`}`);
		}

		this.outdent().write("}).call(this);");

		return this.end();
	}
}

export class Interpolator extends ASTNode {
	constructor(location, escaped, query) {
		super(location);
		this._escaped = escaped;
		this._query = query;
	}

	query(data) { return query(data, this._query); }

	compile(data) {
		this.start(data);
		this.use("idom");
		var src, q = this.query(data);
		if (this._escaped) src = `idom.html(${q});`;
		else src = `idom.text(utils.toString(${q}));`;
		return this.end(src);
	}

	compileString(data) {
		use(data, "utils");
		return this._sn(data.originalFilename, `utils.toString(${this.query(data)})`);
	}

	compileArguments(data) {
		return this._sn(data.originalFilename, this.query(data));
	}
}

export class MustacheComment extends ASTNode {
	constructor(location, value) {
		super(location);
		this._value = value;
	}

	compile(data) {
		var output = this._sn(data.originalFilename);
		this._value.split("\n").forEach(function(l) {
			output.add(["// ", l, "\n"]);
		});
		return output;
	}
}

export class Partial extends ASTNode {
	constructor(location, local, value) {
		super(location);
		this._local = local;
		this._value = value;
	}

	compile(data) {
		return this._sn(data.originalFilename, [ "this.renderView(", JSON.stringify(this._value), ", ctx);" ]);
	}
}
