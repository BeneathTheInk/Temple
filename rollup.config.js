import _resolve from "rollup-plugin-node-resolve";
import commonjs from 'rollup-plugin-commonjs';
import babel from "rollup-plugin-babel";
import pegjs from "pegjs";
import json from "rollup-plugin-json";
import path from "path";
import builtins from "browserify/lib/builtins.js";
import inject from "rollup-plugin-inject";
import {has,forEach} from "lodash";
import buildDOMTests from "./test/utils/build-dom-tests.js";

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
const domtest = /^\$DOMTEST:(.*)/;

const plugins = [
	{
		resolveId: function(id, p) {
			// return process.env.TEST && domtest.test(id) ? id : null;

			if (!process.env.TEST) return;
			let m = id.match(domtest);
			if (!m) return;
			return "$DOMTEST:" + path.resolve(path.dirname(p), m[1]);
		},
		load: function(id) {
			if (!process.env.TEST) return;
			let m = id.match(domtest);
			if (!m) return;
			return buildDOMTests(m[1]);
		}
	},
	{
		resolveId: function(id, p) {
			if (p && (process.env.TARGET === "node" || process.env.TARGET === "es6") &&
				!incremental.test(id) && !relPath.test(id)) return false;

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

if (process.env.TARGET !== "es6") {
	plugins.push(babel({
		exclude: [ "node_modules/**" ],
		include: [ "node_modules/incremental-dom/**", "src/**", "test/**" ]
	}));
}

if (process.env.TARGET !== "node" && process.env.TARGET !== "es6") {
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
		process.env.TARGET === "es6" ? "es6" : "umd",
	moduleName: "Temple",
	onwarn: function(){},
	plugins
};
