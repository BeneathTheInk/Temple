import Node from "./node";

export default class Style extends Node {
	get reactive() { return false; }

	compile(data) {
		this.start(data);

		this.write("(function() {").indent();
		this.write(`var style = document.createElement("style");`);
		this.write(`style.innerHTML = ${JSON.stringify(this.value)};`);
		this.write(`document.head.appendChild(style);`);
		this.outdent().write("}());\n");

		return this.end();
	}
}
