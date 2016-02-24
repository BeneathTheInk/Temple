import _resolve from "rollup-plugin-node-resolve";
import commonjs from 'rollup-plugin-commonjs';
import babel from "rollup-plugin-babel";
import pegjs from "pegjs";
import json from "rollup-plugin-json";
import path from "path";
import builtins from "browserify/lib/builtins.js";
import {has,forEach,includes} from "lodash";
import buildDOMTests from "./test/utils/build-dom-tests.js";
import replace from 'rollup-plugin-replace';
import uglifyjs from "uglify-js";

var Temple;
try { Temple = require("./"); }
catch(e) {}

const emptyModule = require.resolve("browserify/lib/_empty.js");
const rollupEmptyModule = require.resolve("rollup-plugin-node-resolve/src/empty.js");

forEach(builtins, function(p, id) {
	if (p === emptyModule) builtins[id] = rollupEmptyModule;
});

const emptyModules = [ "fs-promise" ];

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

			if (includes(emptyModules, id)) return id;
			if (has(builtins, id)) return builtins[id];
			return resolve.resolveId(id, p);
		},
		load: function(id) {
			if (includes(emptyModules, id)) return "export default {};";
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
	{
		transform: function(code, id) {
			if (path.extname(id) !== ".html") return;

			return Temple.compile(code, {
				filename: id,
				async: true
			}).then((res) => {
				return {
					code: `export default ${JSON.stringify(uglifyjs.minify(res.code, { fromString: true }).code)};`,
					map: { mappings: '' }
				};
			});
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

	plugins.push(replace({
		"process.env.NODE_ENV": JSON.stringify("production")
	}));
}

export default {
	format: process.env.TARGET === "node" ? "cjs" :
		process.env.TARGET === "es6" ? "es6" : "umd",
	moduleName: "Temple",
	onwarn: function(){},
	plugins
};
