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
		output.prepend(data.headers);
		data.headers = oheads;
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
		var output = this._sn(data.originalFilename)
			.add(`Temple.register(${JSON.stringify(this._name)}, {\n`)
			.add("initialize: function() {\n")
			.add(_.invoke(this._scripts, "compile", data))
			.add("},\n");

		if (this._extends) {
			output.add(`extends: ${JSON.stringify(this._extends)},\n`);
		}

		output.add("render: function(ctx) {\n")
			.add(_.invoke(this._attributes, "compile", data))
			.add(_.invoke(this._children, "compile", data))
			.add("}\n");

		output.add("});\n\n");

		return output;
	}
}

export class Text extends ASTNode {
	constructor(location, value) {
		super(location);
		this._value = value;
	}

	compile(data) {
		use(data, "idom");
		return this._sn(data.originalFilename, [ "idom.text(", JSON.stringify(this._value), ");\n" ]);
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
		use(data, "idom");
		let tagName = JSON.stringify(this._name);
		let output = this._sn(data.originalFilename);

		output.add(`if (!this.renderView(${tagName}, ctx)) {\n`);
		output.add(`idom.elementOpen(${tagName});\n`);//${key ? "," + JSON.stringify(key) : ""}
		output.add(_.invoke(this._attributes, "compile", data));
		output.add(_.invoke(this._children, "compile", data));
		output.add(`idom.elementClose(${tagName});\n`);
		output.add("}\n");

		return output;
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
		use(data, "idom");
		var output = this._sn(data.originalFilename);

		output.add(`idom.decorate(this, ${JSON.stringify(this._key)}, {\n`);
		output.add(`mixin: { context: ctx },\n`);
		output.add(`string: function() { return `);
		var str = _.invoke(this._children, "compileString", data);
		output.add(this._sn(data.originalFilename, str).join(" + "));
		output.add(`; },\n`);
		output.add(`"arguments": function() { return [ `);
		var args = _.invoke(this._arguments, "compileArguments", data);
		output.add(this._sn(data.originalFilename, args).join(", "));
		output.add(` ]; }\n`);
		output.add(`});\n`);

		return output;
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
		use(data, "proxies", "context");
		let self = this;
		let output = this._sn(data.originalFilename);

		function renderSection(v, i) {
			if (i) output.add(`var indexctx = new Context({ $index: ${i} }, prevctx, { transparent: true });\n`);
			output.add(`var ctx = new Context(${v}, ${i ? "indexctx" : "prevctx"});\n`);
			output.add(_.invoke(self._children, "compile", data));
		}

		output.add("(function(){\n");
		output.add("var prevctx = ctx;\n");
		output.add(`var val = ${query(data, this._query)};\n`);
		output.add(`var proxy = proxies.getByTarget(val, [ "empty", "section" ]);\n`);
		let isEmpty = `Boolean(proxies.run(proxy, "empty", val))`;

		if (this._inverted) {
			output.add(`if (${isEmpty}) {\n`);
			output.add("(function(){\n");
			renderSection("val");
			output.add("}).call(this);\n");
			output.add("}\n");
		} else {
			output.add(`if (!${isEmpty}) {\n`);
			output.add(`proxies.run(proxy, "section", val, (function(data, index) {\n`);
			renderSection("data", "index");
			output.add(`}).bind(this));\n`);
			output.add(`}\n`);
		}

		output.add("}).call(this);\n");

		return output;
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
		use(data, "idom");
		var src, q = this.query(data);
		if (this._escaped) src = `idom.html(${q});\n`;
		else src = `idom.text(utils.toString(${q}));\n`;
		return this._sn(data.originalFilename, src);
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
