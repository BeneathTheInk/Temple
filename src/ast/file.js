import {invokeMap,map,assign,uniqueId} from "lodash";
import {compileGroupAsync} from "./utils";
import Node from "./node";

export default class File extends Node {
	compile(data) {
		data = assign({}, data, {
			originalFilename: this.filename || uniqueId("template_")
		});
		if (!data.includes) data.includes = [];
		data.includes.push(data.originalFilename);

		this.start(data);

		return compileGroupAsync(this.includes, data).then((src) => {
			this.push(src);

			if (data.originalFilename) {
				this.write(`/* ${data.originalFilename} */`);
			}

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
		});
	}
}
