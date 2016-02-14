import {invokeMap} from "lodash";
import Node from "./node";
import {header} from "./utils";

export default class Root extends Node {
	compile(data) {
		data = data || {};
		var oheads = data.headers;
		data.headers = [];

		this.start(data);
		header(data, "var Template = {};\n");
		header(data, "var idom = Temple.idom;\n");
		header(data, "var decorators = Temple.decorators;\n");
		this.push(invokeMap(this.files, "compile", data));

		if (data.exports === "es6") {
			this.write("export default Template;");
		} else if (data.exports === "cjs") {
			this.write("module.exports = Template;");
		} else if (data.exports === "none") {
			// print nothing
		} else {
			this.write("return Template;");
		}

		let output = this.end();
		if (data.headers.length) output.prepend("\n").prepend(data.headers);
		data.headers = oheads;

		return output;
	}
}
