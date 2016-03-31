import resolve from "./resolve";
import pegjs from "./pegjs";
import playground from "./playground";
import json from "rollup-plugin-json";

export default {
	format: "cjs",
	onwarn: function(){},
	plugins: [
		resolve(),
		pegjs(),
		playground(),
		json()
	]
};
