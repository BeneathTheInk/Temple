import Node from "./node";
import {compileGroup,addKey} from "./utils";

export default class Template extends Node {
	compile(data) {
		this.start(data);
		var safename = JSON.stringify(this.name);

		this.write(`Template[${safename}] = Temple.Template(${safename}, function(render_opts) {`).indent();
		this.write(`var render_key = (render_opts && render_opts.key) || "";`);
		data = addKey(data, { value: "render_key" });
		this.push(compileGroup(this.children, data));
		this.outdent().write("});\n");

		return this.end();
	}
}
