import {invokeMap,map,assign,uniqueId} from "lodash";
import {compileGroupAsync} from "./utils";
import Node from "./node";

export default class File extends Node {
	compile(data) {
		data = assign({}, data, {
			filename: this.filename || uniqueId("template_"),
			headers: []
		});
		if (!data.included) data.included = [];
		data.included.push(data.filename);

		this.start(data);

		if (data.async) {
			return compileGroupAsync(this.includes, data).then(this._finish.bind(this, data));
		} else {
			return this._finish(data, invokeMap(this.includes, "compile", data));
		}
	}

	_finish(data, src) {
		this.indent();

		if (this.styles.length) {
			this.write("(function() {").indent();
			this.write(`var style = document.createElement("style");`);
			this.write(`style.innerHTML = ${JSON.stringify(map(this.styles, "value").join("\n"))};`);
			this.write(`document.head.appendChild(style);`);
			this.outdent().write("}());\n");
		}

		this.push(invokeMap(this.children, "compile", data));
		let etabs = this.tabs();
		this.outdent();

		let tabs = this.tabs();
		let source = this.end();
		if (data.headers.length) source.prepend([data.headers.map(h => etabs + h),"\n"]);
		source.prepend([tabs,`(function() {\n`]).add([tabs,`}());\n\n`]);
		if (data.filename) source.prepend([tabs,`/* ${data.filename} */\n`]);
		source.prepend(src);
		if (this.source) source.setSourceContent(data.filename, this.source);
		return source;
	}
}
