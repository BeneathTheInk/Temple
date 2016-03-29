import resolve from "./resolve";
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
		json()
	]
};
