import Node from "./node";
import {compileGroup,addKey,resetContextHeader} from "./utils";

export default class Template extends Node {
	compile(data) {
		this.start(data);
		let safename = JSON.stringify(this.name);
		let safetype = this.type ? JSON.stringify(this.type) : null;

		this.write(`Template[${safename}] = Temple.create(${safename}, ${safetype ? safetype + ", " : ""}function(ctx, key) {`).indent();
		data = resetContextHeader(data);
		data = addKey(data, { value: "key" });
		let c = compileGroup(this.children, data);
		data.contextHeaders.forEach(this.write, this);
		this.push(c);
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
