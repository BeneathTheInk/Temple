import resolve from "./resolve";
import babel from "rollup-plugin-babel";
import pegjs from "./pegjs";
import temple from "./temple";
import json from "rollup-plugin-json";

export default {
	format: "cjs",
	onwarn: function(){},
	plugins: [
		resolve(),
		pegjs(),
		temple(),
		json(),
		babel({
			exclude: [ "node_modules/**" ],
			include: [ "node_modules/incremental-dom/**", "src/**", "test/**" ]
		})
	]
};
