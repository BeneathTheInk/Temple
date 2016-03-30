import {assign,find,has,includes} from "lodash";
import {parse as baseParse} from "./m+xml.pegjs";
import * as Temple from "../";
import {rollup} from "rollup";
import inject from "@mrgalaxy/rollup-plugin-inject";
import path from "path";

const smfurl = "sourceMappingURL=";
const datauri = "data:application/json;charset=utf-8;base64,";
const rel_regex = /^\.{0,2}\//;

var toBase64;
if (typeof window !== "undefined" && typeof window.btoa === "function") {
	toBase64 = window.btoa;
} else toBase64 = function(str) {
	return new Buffer(str, "utf-8").toString("base64");
};

function parseFiles(files, { filename }) {
	if (typeof files === "string") {
		if (filename) files = { [filename]: files };
		else files = [ files ];
	}

	if (Array.isArray(files)) files = files.reduce(function(memo, src, name) {
		if (typeof name === "number") name = `template${name}.html`;
		memo[name] = src;
		return memo;
	}, {});

	return files;
}

export function parse(src, options={}) {
	try {
		return baseParse(src, options);
	} catch(e) {
		e.filename = name;
		e.source = src;
		throw e;
	}
}

function srcToString(smf) {
	return this.code + "\n\n//# " + smfurl +
		(typeof smf === "string" ? smf :
			datauri + toBase64(this.map.toString()));
}

export function compile(files, options={}, cb) {
	files = parseFiles(files, options);
	let exts = [].concat(options.extensions || ".html").filter(Boolean);
	let basedir = options.basedir || (options.filename ? path.dirname(options.filename) : ".");
	let hasCb = typeof cb === "function";
	let templates = [];

	return rollup({
		onwarn: () => {},
		entry: "_entry.js",
		plugins: [
			{
				resolveId: function(id, file) {
					if (id === "_entry.js" ||
						id === "_template.js") return id;

					let full = path.resolve(basedir, path.dirname(file), id);
					let entry = find(Object.keys(files), (name) => {
						return path.resolve(basedir, name) === full;
					});
					if (entry) return entry;

					// only relative paths are followed
					if (rel_regex.test(id) && includes(exts, path.extname(id))) {
						return full;
					}
				},
				load: function(id) {
					if (id === "_entry.js") {
						return Object.keys(files).map(name => {
							return `import ${JSON.stringify(name)}`;
						}).join("\n") + "\nexport default Template;\n";
					}

					if (id === "_template.js") {
						return "export default {};\n";
					}

					if (has(files, id)) {
						return files[id];
					}
				},
				transform: function(src, id) {
					if (!includes(exts, path.extname(id))) return;
					templates.push(id);

					let file = parse(src, assign({ filename: id }, options));
					let out = file.compile(options).toStringWithSourceMap();
					out.map = out.map.toJSON();
					return out;
				}
			},
			inject({
				Temple: "templejs",
				Template: "_template.js",
				idom: [ "templejs", "idom" ],
				decorators: [ "templejs", "decorators" ]
			})
		].concat(options.plugins).filter(Boolean)
	}).then(function(bundle) {
		let out = bundle.generate({
			format: options.format,
			sourceMap: true,
			exports: "default",
			useStrict: false,
			moduleId: options.moduleId,
			moduleName: options.moduleName,
			globals: {
				templejs: "Temple"
			}
		});

		out.templates = templates;
		out.toString = srcToString;

		return out;
	}).then((res) => {
		if (hasCb) cb(null, res);
		return res;
	}, (e) => {
		if (hasCb) cb(e);
		throw e;
	});
}

export function exec(tpl, options) {
	return compile(tpl, assign({
		format: "iife",
		moduleName: "Template"
	}, options)).then(function(r) {
		return (new Function("Temple", r.code))(Temple);
	});
}

// export function compileHTML(html, options) {
// 	options = options || {};
// 	var node = new AST.HTML(null, html);
// 	return getSource(node.compile(options), html, options);
// }
//
// export function renderHTML(html, options) {
// 	/* jshint -W054 */
// 	var r = compileHTML(html, options);
// 	// console.log(r);
// 	return (new Function("Temple", r))(require("./"));
// }
