import _resolve from "rollup-plugin-node-resolve";
import commonjs from 'rollup-plugin-commonjs';
import babel from "rollup-plugin-babel";
import pegjs from "pegjs";
import json from "rollup-plugin-json";
import path from "path";
// import include from "rollup-plugin-includepaths";
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

const commonOpts = {
   include: [ "src/*.pegjs" ],
   extensions: [ ".pegjs", ".js" ],
   namedExports: {
	   "src/m+xml.pegjs": [ "parse" ]
   }
};

if (process.env.TARGET !== "common") {
	commonOpts.include.push("node_modules/**");
	commonOpts.namedExports["source-map/lib/util.js"] = [ "createMap" ];
	commonOpts.namedExports.events = [ "EventEmitter" ];
}

const plugins = [
	{
		resolveId: function(id, p) {
			if (process.env.TARGET === "common" &&
				!/^incremental-dom/.test(id) &&
				!/^\.{0,2}\//.test(id)) return null;

			if (has(builtins, id)) return builtins[id];
			if (id === "templejs") return path.resolve("src/index.js");
			return resolve.resolveId(id, p);
		}
	},
	{
		transform: function(code, id) {
			if (path.extname(id) !== ".pegjs") return;

			return {
				code: "module.exports = " + pegjs.buildParser(code, { output: "source", optimize: "size" }),
				map: { mappings: "" }
			};
		}
	},
	json(),
	babel({
		exclude: [ "node_modules/**", "**/*.pegjs" ],
		include: [ "node_modules/incremental-dom/**", "src/**" ]
	}),
	commonjs(commonOpts)
];

if (process.env.TARGET !== "common") {
	plugins.push(inject({
		process: builtins._process,
		Buffer: [ builtins.buffer, "Buffer" ]
	}));
}

export default { plugins };
