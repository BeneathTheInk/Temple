import * as _ from "underscore";
import { SourceNode } from "source-map";
import { hash } from "./utils";
import { parse as parseHTML } from "html-parse-stringify";

function header(data, h) {
	if (_.isArray(data.headers) && !_.contains(data.headers, h)) {
		data.headers.push(h);
	}
}

function generateQuery(data, q) {
	let s = JSON.stringify(q);
	let v = ("q" + hash(s)).replace("-", "_");
	header(data, `var ${v} = ${s};\n`);
	return `ctx.query(${v})`;
}

function compileGroup(nodes, data) {
	let base = data.key || [];
	return nodes.map(function(n, i) {
		return n.compile(_.extend({}, data, {
			key: [].concat(base, i.toString())
		}));
	});
}

function getKey(data) {
	return (data.key || []).reduce(function(memo, v) {
		if (_.isString(v) && _.isString(_.last(memo))) {
			memo.push(memo.pop() + "-" + v);
		} else {
			memo.push(v);
		}

		return memo;
	}, []).map(function(v, i, l) {
		if (typeof v === "object") return v.value;
		if (i !== 0) v = "-" + v;
		if (i !== l.length - 1) v += "-";
		return JSON.stringify(v);
	}).join(" + ");
}

export class ASTNode {
	constructor(location) {
		this._location = location;
	}

	_sn(file, chunk) {
		let loc = this._location, line, column;

		if (loc) {
			line = loc.start.line;
			column = loc.start.column;
		}

		return new SourceNode(line, column, file, chunk);
	}

	start(data) {
		this._writer = {
			chunks: [],
			data: data
		};

		return this;
	}

	_normalize_indent() {
		let d = this._writer.data;
		if (typeof d.indent === "string") d.tabchar = d.indent;
		if (d.indent !== false && typeof d.indent !== "number") d.indent = 0;
	}

	indent() {
		this._normalize_indent();
		let d = this._writer.data;
		if (typeof d.indent === "number") d.indent++;
		return this;
	}

	outdent() {
		this._normalize_indent();
		let d = this._writer.data;
		if (typeof d.indent === "number" && d.indent > 0) d.indent--;
		return this;
	}

	tabs() {
		this._normalize_indent();

		let tabs = "";
		let d = this._writer.data;
		let tabchar = d.tabchar;
		if (tabchar == null) tabchar = "  ";

		if (typeof d.indent === "number") {
			for (let i = 0; i < d.indent; i++) tabs += tabchar;
		}

		return tabs;
	}

	write(chunk) {
		this.push([].concat(this.tabs(), chunk, "\n"));
		return this;
	}

	push(chunk) {
		this._writer.chunks.push(chunk);
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

		this.start(data);
		header(data, "var Views = {};\n");
		this.push(compileGroup(this._children, data));

		if (data.exports === "es6") {
			this.write("export default Views;");
		} else if (data.exports === "cjs") {
			this.write("module.exports = Views;");
		} else if (data.exports === "none") {
			// print nothing
		} else {
			this.write("return Views;");
		}

		let output = this.end();
		if (data.headers.length) output.prepend("\n").prepend(data.headers);
		data.headers = oheads;

		return output;
	}
}

export class View extends ASTNode {
	constructor(location, name, exts, attrs, partials, scripts, children) {
		super(location);
		this._name = name;
		this._extends = exts;
		this._attributes = attrs;
		this._partials = partials;
		this._scripts = scripts;
		this._children = children;
	}

	compile(data) {
		this.start(data);
		var safename = JSON.stringify(this._name);

		this.write(`Views[${safename}] = Temple.register(${safename}, {`);
		this.indent();

		if (this._scripts.length || this._attributes.length) {
			this.write("initialize: function() {").indent();
			this.write("this.super.apply(this, arguments);");
			if (this._attributes.length) {
				this.write(`this.on("render:before", function(ctx) {`).indent();
				this.push(_.invoke(this._attributes, "compile", data));
				this.outdent().write(`});`);
			}
			this.push(_.invoke(this._scripts, "compile", data));
			this.outdent().write("},");
		}

		if (this._partials.length) {
			this.write("partials: function() {").indent();
			this.write(`var p = typeof this.super === "function" ? this.super() : this.super;`);
			this.write("return Temple.utils.assign({}, p, {").indent();
			var p = _.invoke(this._partials, "compile", _.extend({ view: true }, data));
			this.push([ this._sn(data.originalFilename, p).replaceRight(/\s*$/, "").join(",\n"), "\n" ]);
			this.outdent().write("});");
			this.outdent().write("},");
		}

		if (this._extends) {
			this.write(`extends: ${JSON.stringify(this._extends)},`);
		}

		this.write("_render: function(ctx) {").indent();
		this.push(compileGroup(this._children, data));
		this.outdent().write("}");

		this.outdent().write("});\n");

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
		this.write(`Temple.idom.text(Temple.utils.decodeEntities(${JSON.stringify(this._value)}));`);
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
		let loc = this._location, line, column;

		if (loc) {
			line = loc.start.line;
			column = loc.start.column;
		} else {
			line = 1;
			column = 1;
		}

		let lines = this._value.split("\n").map(function(l, i) {
			return new SourceNode(i + line, i === 0 ? column : 1, data.originalFilename, l + "\n");
		});

		return this._sn(data.originalFilename, lines);
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

		let self = this;
		let tagName = JSON.stringify(this._name);
		let hasc = this._children.length;
		let hasa = this._attributes.length;
		let key = getKey(data);

		function writeElement(inner) {
			if (hasc || hasa) {
				self.write(`Temple.idom.elementOpen(${tagName}${key ? ", " + key : ""});`);
				inner.call(self);
				self.write(`Temple.idom.elementClose(${tagName});`);
			} else {
				self.write(`Temple.idom.elementVoid(${tagName}${key ? ", " + key : ""});`);
			}
		}

		if (this._name.indexOf("-") > -1) {
			this.write(`(function(){`).indent();

			if (hasc) {
				this.write("function body(ctx, key) {").indent();
				this.push(compileGroup(this._children, _.extend({}, data, {
					key: [{ value: "(key || \"\")" }]
				})));
				this.outdent().write("}");
			}

			if (hasa) {
				this.write("function attributes(ctx) {").indent();
				this.push(_.invoke(this._attributes, "compile", data));
				this.outdent().write("}");
			}

			this.write(`var view = this.createComponent(${tagName}, ctx);`);
			this.write(`if (view) {`).indent();
			if (hasc) this.write(`view.setPartial("@body", body);`);
			if (hasa) this.write(`view.on("render:before", attributes);`);
			this.write(`view.mount();`);
			this.write(`this.comp.onInvalidate(this.removeComponent.bind(this, view));`);
			this.outdent().write(`} else {`).indent();
			writeElement(function() {
				if (hasa) this.write(`attributes.call(this, ctx);`);
				if (hasc) this.write(`body.call(this, ctx);`);
			});
			this.outdent().write(`}`);

			this.outdent().write(`}).call(this);`);
		} else {
			writeElement(function() {
				if (hasa) this.push(_.invoke(this._attributes, "compile", data));
				if (hasc) this.push(compileGroup(this._children, _.extend({}, data, {
					key: []
				})));
			});
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

		this.write(`this.renderDecorator(${JSON.stringify(this._key)}, {`).indent();
		this.write(`mixin: { context: ctx },`);

		let str = _.invoke(this._children, "compileString", data);
		this.write([
			`string: function() { return `,
			!str.length ? `""` : this._sn(data.originalFilename, str).join(" + "),
			`; },`
		]);

		let args = _.invoke(this._arguments, "compileArguments", data);
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

		this.compileSection(data, function(indexvar) {
			let key = data.key || [];
			if (indexvar) key.push({ value: "Temple.utils.toString(" + indexvar + ")" });
			else key.push("$");
			this.push(compileGroup(this._children, _.extend({}, data, { key: key })));
		});

		return this.end();
	}

	compileString(data) {
		this.start(data);

		this.push("(function() {\n").indent();
		this.write(`var result = "";`);

		this.compileSection(data, function() {
			let children = _.invoke(this._children, "compileString", data);
			this.write([ "result += ", this._sn(data.originalFilename, children).join(" + "), ";" ]);
		});

		this.write("return result;");
		this.outdent().push(this.tabs() + "}).call(this)");

		return this.end();
	}

	compileSection(data, handle) {
		var indexvar = _.uniqueId("index");
		this.write(`Temple.idom.section(${JSON.stringify(this._inverted)}, ${generateQuery(data, this._query)}, (function(prevctx, data, ${indexvar}) {`).indent();
		this.write(`var indexctx;`);
		this.write(`if (${indexvar} != null) indexctx = prevctx.append({ "@index": ${indexvar} }, { transparent: true });`);
		this.write(`var ctx = (indexctx || prevctx).append(data);`);
		handle.call(this, indexvar);
		this.outdent().write(`}).bind(this, ctx));`);
	}
}

export class Interpolator extends ASTNode {
	constructor(location, unescaped, query) {
		super(location);
		this._unescaped = unescaped;
		this._query = query;
	}

	query(data) { return generateQuery(data, this._query); }

	compile(data) {
		this.start(data);
		var q = this.query(data);
		if (this._unescaped) this.write(`Temple.idom.html(Temple.utils.toString(${q}));`);
		else {
			this.write(`(function() {`).indent();
			this.write(`var node = Temple.idom.text("");`);
			this.write(`this.autorun(function() {`).indent();
			this.write(`var data = Temple.idom.getData(node);`);
			this.write(`var value = Temple.utils.toString(${q});`);
 			this.write(`if (data.text !== value) {`).indent();
		    this.write(`node.data = data.text = value;`);
			this.outdent().write(`}`);
			this.outdent().write(`});`);
			this.outdent().write(`}).call(this);`);
		}

		return this.end();
	}

	compileString(data) {
		return this._sn(data.originalFilename, `Temple.utils.toString(${this.query(data)})`);
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

export class PartialQuery extends ASTNode {
	constructor(location, local, value) {
		super(location);
		this._local = local;
		this._value = value;
	}

	compile(data) {
		this.start(data);

		if (this._value === "@super") {
			this.write(`this.super(ctx);`);
		} else {
			let key = getKey(data);
			this.write(`this.renderPartial(${JSON.stringify(this._value)}, ctx, {`).indent();
			if (key) this.write(`key: ${key},`);
			this.write(`local: ${JSON.stringify(this._local)}`);
			this.outdent().write(`});`);
		}

		return this.end();
	}
}

export class Partial extends ASTNode {
	constructor(location, name, children) {
		super(location);
		this._name = name;
		this._children = children;
	}

	compile(data) {
		this.start(data);
		var self = this;

		function writeChildren() {
			self.indent();
			self.push(compileGroup(self._children, _.extend({}, data, {
				key: [{ value: "(key || \"\")" }]
			})));
			self.outdent();
		}

		if (data.view) {
			this.write(`${JSON.stringify(this._name)}: function(ctx, key) {`);
			writeChildren();
			this.write("}");
		} else {
			this.write(`Temple.partials.set(${JSON.stringify(this._name)}, function(ctx, key) {`);
			writeChildren();
			this.write("});");
		}

		return this.end();
	}
}

export class HTML extends ASTNode {
	constructor(location, value) {
		super(location);
		this._value = value;
		var tree = parseHTML("<html>" + value + "</html>");
		if (_.isArray(tree)) tree = tree[0];
		this._tree = tree.children;
	}

	compileHTML(node) {
		if (node.type == "text") {
			this.write(`Temple.idom.text(${JSON.stringify(node.content)})`);
		}

		if (node.type == "tag") {
			let argsArray = [node.name, null, null];

			// convert attrs into a flat array
			for (let attr in node.attrs) {
				argsArray.push(attr);
				argsArray.push(node.attrs[attr]);
			}

			let args = argsArray.map(a => JSON.stringify(a)).join(", ");

			if (node.voidElement) {
				this.write(`Temple.idom.elementVoid(${args})`);
			} else {
				this.write(`Temple.idom.elementOpen(${args})`);

				for (var i = 0; i < node.children.length; i++) {
					this.compileHTML(node.children[i]);
				}

				this.write(`idom.elementClose(${JSON.stringify(node.name)});`);
			}
		}
	}

	compile(data) {
		this.start(data);
		this._tree.forEach(this.compileHTML, this);
		return this.end();
	}
}
