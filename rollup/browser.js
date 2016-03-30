import babel from "rollup-plugin-babel";
import pegjs from "./pegjs";
import json from "rollup-plugin-json";
import commonjs from 'rollup-plugin-commonjs';
import nodeGlobals from "rollup-plugin-node-globals";
import resolve from "rollup-plugin-node-resolve";
import builtins from "rollup-plugin-node-builtins";

const _resolve = resolve({
	jsnext: false,
	main: true,
	browser: true,
	preferBuiltins: true
});

const rollupEmptyModule = require.resolve("rollup-plugin-node-resolve/src/empty.js");

export default {
	format: "umd",
	moduleName: "Temple",
	onwarn: function(){},
	plugins: [
		builtins(),
		{
			resolveId: function(id) {
				if (id === "fs") return rollupEmptyModule;
				return _resolve.resolveId.apply(this, arguments);
			}
		},
		pegjs(),
		json(),
		babel({
			exclude: [ "node_modules/**" ],
			include: [ "node_modules/incremental-dom/**", "src/**", "test/**" ]
		}),
		commonjs({
			include: [ "node_modules/**" ],
			exclude: [ "src/**", "test/**", "node_modules/rollup-plugin-node-globals/**" ],
			extensions: [ ".js" ],
			namedExports: {
				"source-map/lib/util.js": [ "createMap" ],
				events: [ "EventEmitter" ]
			}
		}),
		nodeGlobals()
	]
};
