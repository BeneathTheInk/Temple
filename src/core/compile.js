import {assign,map,find,has} from "lodash";
import {parse as baseParse} from "./m+xml.pegjs";
import * as Temple from "../";
import {rollup} from "rollup";
import inject from "rollup-plugin-inject";
import fs from "fs-promise";
import path from "path";

const smfurl = "sourceMappingURL=";
const datauri = "data:application/json;charset=utf-8;base64,";

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

export function parse(files, options) {
	files = parseFiles(files);

	return map(files, function(src, name) {
		try {
			return baseParse(src, assign({
				filename: name
			}, options));
		} catch(e) {
			e.filename = name;
			e.source = src;
			throw e;
		}
	});
}

function srcToString(smf) {
	return this.code + "\n\n//# " + smfurl +
		(typeof smf === "string" ? smf :
			datauri + toBase64(this.map.toString()));
}

export function compile(files, options={}, cb) {
	files = parseFiles(files, options);
	let basedir = options.basedir || (options.filename ? path.dirname(options.filename) : ".");
	let hasCb = typeof cb === "function";
	let includes = [];

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

					if (typeof fs.stat !== "function") return;
					return fs.stat(full).then(() => full).catch(e => {
						if (e.code !== "ENOENT") throw e;
					});
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
					if (id === "_entry.js" ||
						id === "_template.js") return;

					try {
						let file = baseParse(src, assign({
							filename: id
						}, options));

						let out = file.compile(options).toStringWithSourceMap();
						out.map = out.map.toJSON();
						return out;
					} catch(e) {
						e.filename = id;
						e.source = src;
						throw e;
					}
				}
			},
			inject({
				Temple: "templejs",
				Template: "_template.js",
				idom: [ "templejs", "idom" ],
				decorators: [ "templejs", "decorators" ]
			})
		]
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

		out.includes = includes;
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
	/* jshint -W054 */
	var r = compile(tpl, options);
	// console.log(r);
	return (new Function("Temple", r.code))(Temple);
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
