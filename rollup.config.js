import _resolve from "rollup-plugin-node-resolve";
import commonjs from 'rollup-plugin-commonjs';
import babel from "rollup-plugin-babel";
import pegjs from "pegjs";
import json from "rollup-plugin-json";
import path from "path";
import builtins from "browserify/lib/builtins.js";
import inject from "rollup-plugin-inject";
import {has,forEach} from "lodash";

const emptyModule = require.resolve("browserify/lib/_empty.js");
const rollupEmptyModule = require.resolve("rollup-plugin-node-resolve/src/empty.js");

forEach(builtins, function(p, id) {
	if (p === emptyModule) builtins[id] = rollupEmptyModule;
});

const resolve = _resolve({
	jsnext: false,
	main: true,
	browser: true
});

const relPath = /^\.{0,2}\//;
const incremental = /^incremental-dom/;

const plugins = [
	{
		resolveId: function(id, p) {
			if ((process.env.TARGET === "node" ||
				process.env.TARGET === "next") &&
				!incremental.test(id) && !relPath.test(id)) return null;

			if (has(builtins, id)) return builtins[id];
			return resolve.resolveId(id, p);
		}
	},
	{
		transform: function(code, id) {
			if (path.extname(id) !== ".pegjs") return;
			let parts = code.split("#####");
			let source = pegjs.buildParser(parts[parts.length > 1 ? 1 : 0], {
				output: "source",
				optimize: "size"
			});

			return {
				code: `${parts.length > 1 ? parts[0] : ""}
const parser = ${source};
export default parser;
export var parse = parser.parse;`,
				map: { mappings: "" }
			};
		}
	},
	json()
];

if (process.env.TARGET !== "next") {
	plugins.push(babel({
		exclude: [ "node_modules/**" ],
		include: [ "node_modules/incremental-dom/**", "src/**", "test/**" ]
	}));
}

if (process.env.TARGET !== "node" && process.env.TARGET !== "next") {
	plugins.push(commonjs({
		include: [ "node_modules/**" ],
		exclude: [ "src/**", "test/**" ],
		extensions: [ ".js" ],
		namedExports: {
			"source-map/lib/util.js": [ "createMap" ],
			events: [ "EventEmitter" ]
		}
	}));

	plugins.push(inject({
		process: builtins._process,
		Buffer: [ builtins.buffer, "Buffer" ]
	}));
}

export default {
	format: process.env.TARGET === "node" ? "cjs" :
		process.env.TARGET === "next" ? "es6" : "umd",
	moduleName: "Temple",
	plugins
};
