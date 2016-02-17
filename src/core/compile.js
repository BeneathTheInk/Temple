import {assign,map} from "lodash";
import {parse as baseParse} from "./m+xml.pegjs";
import * as Temple from "../";
import Root from "../ast/root";

const smfurl = "sourceMappingURL=";
const datauri = "data:application/json;charset=utf-8;base64,";

var toBase64;
if (typeof window !== "undefined" && typeof window.btoa === "function") {
	toBase64 = window.btoa;
} else toBase64 = function(str) {
	return new Buffer(str, "utf-8").toString("base64");
};

function parseFile(src, name, options) {
	if (typeof name === "number") name = `template${name}.js`;

	try {
		return baseParse(src, assign({
			originalFilename: name
		}, options));
	} catch(e) {
		e.filename = name;
		e.source = src;
		throw e;
	}
}

export function parse(files, options) {
	if (typeof files === "string") files = [ files ];
	files = map(files, (src, name) => parseFile(src, name, options));
	return new Root({ files });
}

function srcToString(smf) {
	return this.code + "//# " + smfurl +
		(typeof smf === "string" ? smf :
			datauri + toBase64(this.map.toString()));
}

function processOut(source) {
	let out = source.toStringWithSourceMap();
	out.toString = srcToString;
	return out;
}

export function compile(files, options, cb) {
	if (typeof files === "string") files = [ files ];

	files = map(files, (file, index) => {
		if (typeof file === "string") {
			file = parseFile(file, index, options);
		}

		return file;
	});

	let root = new Root({ files });
	let data = assign({ parse: parseFile }, options);
	let hasCb = typeof cb === "function";

	if (hasCb || data.async) {
		return root.compile(data).then(processOut).then((res) => {
			if (hasCb) cb(null, res);
			return res;
		}, (e) => {
			if (hasCb) cb(e);
			throw e;
		});
	} else {
		return processOut(root.compile(data));
	}
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
