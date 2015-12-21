import Node from "./node";
import {compileGroup,addKey} from "./utils";

export default class Template extends Node {
	compile(data) {
		this.start(data);
		var safename = JSON.stringify(this.name);

		this.write(`Template[${safename}] = Temple.Template(${safename}, function(ctx, key) {`).indent();
		data = addKey(data, { value: "key" });
		this.push(compileGroup(this.children, data));
		this.outdent().write("});\n");

		return this.end();
	}
}
