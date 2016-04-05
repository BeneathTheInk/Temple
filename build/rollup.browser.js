import commonjs from "rollup-plugin-commonjs";
import resolve from "rollup-plugin-node-resolve";
import json from "rollup-plugin-json";
import builtins from "rollup-plugin-node-builtins";
import nodeGlobals from "rollup-plugin-node-globals";
import babel from "rollup-plugin-babel";

export default {
	onwarn: ()=>{},
	format: "umd",
	moduleName: "Temple",
	plugins: [
		builtins(),

		resolve({
			jsnext: false,
			main: true,
			browser: true,
			preferBuiltins: true
		}),

		json(),

		commonjs({
			exclude: [ "node_modules/rollup-plugin-node-globals/**" ],
			extensions: [ ".js" ]
		}),

		babel({
			exclude: [ "node_modules/**" ],
			include: [ "src/**" ],
			presets: [ "es2015-rollup" ]
		}),

		nodeGlobals()
	]
};
