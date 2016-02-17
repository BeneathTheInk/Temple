import {invokeMap,assign,map} from "lodash";
import Node from "./node";

export default class File extends Node {
	compile(data) {
		data = assign({
			originalFilename: this.filename
		}, data);

		this.start(data);

		this.write(`/* ${this.filename} */`);
		this.write(`(function() {`).indent();
		this.write(`var Template = {};\n`);

		if (this.styles.length) {
			this.write("(function() {").indent();
			this.write(`var style = document.createElement("style");`);
			this.write(`style.innerHTML = ${JSON.stringify(map(this.styles, "value").join("\n"))};`);
			this.write(`document.head.appendChild(style);`);
			this.outdent().write("}());\n");
		}

		this.push(invokeMap(this.children, "compile", data));
		this.outdent().write(`}());\n`);

		let source = this.end();
		if (this.source) source.setSourceContent(data.originalFilename, this.source);
		return source;
	}
}
