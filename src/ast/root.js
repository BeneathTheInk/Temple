import Node from "./node";
import {header, compileGroup} from "./utils";

export default class Root extends Node {
	compile(data) {
		var oheads = data.headers;
		data.headers = [];

		this.start(data);
		header(data, "var _templates = {};\n");
		this.push(compileGroup(this.children, data));

		if (data.exports === "es6") {
			this.write("export default _templates;");
		} else if (data.exports === "cjs") {
			this.write("module.exports = _templates;");
		} else if (data.exports === "none") {
			// print nothing
		} else {
			this.write("return _templates;");
		}

		let output = this.end();
		if (data.headers.length) output.prepend("\n").prepend(data.headers);
		data.headers = oheads;

		return output;
	}
}
