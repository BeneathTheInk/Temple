import Node from "./node";
import {compileGroup,addKey,resetContextHeader} from "./utils";

var safevar = /^[a-z0-9_$]+$/i;

export default class Template extends Node {
	compile(data) {
		this.start(data);
		let safename = JSON.stringify(this.name);
		let lead = "";

		if (safevar.test(this.name)) {
			lead = `var ${this.name} = `;
		}

		this.write(`${lead}Template[${safename}] = Temple.Template(${safename}, function(ctx, key) {`).indent();
		data = resetContextHeader(data);
		data = addKey(data, { value: "key" });
		let c = compileGroup(this.children, data);
		data.contextHeaders.forEach(this.write, this);
		this.push(c);
		this.outdent().write("});\n");

		return this.end();
	}
}
