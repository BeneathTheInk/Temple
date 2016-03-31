import Node from "./node";
import {compileGroup,addKey,header} from "./utils";

export default class Template extends Node {
	compile(data) {
		this.start(data);
		let safename = JSON.stringify(this.name);
		let safetype = this.type ? JSON.stringify(this.type) : null;

		header(data, "var Template = {};\n");

		this.write(`Template[${safename}] = Temple.create(${safename}, ${safetype ? safetype + ", " : ""}function(scope, key) {`).indent();
		data = addKey(data, { value: "key" });
		this.push(compileGroup(this.children, data));
		this.outdent().write("});\n");

		if (this.plugins && this.plugins.length) {
			this.plugins.forEach((p) => {
				this.write(`Template[${safename}].use(${JSON.stringify(p)});`);
			});
			this.write("");
		}

		return this.end();
	}
}
