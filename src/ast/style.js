import Node from "./node";
import parse from "css/lib/parse";
import Compiler from "css/lib/stringify/compress.js";

export default class Style extends Node {
	get reactive() { return false; }

	compile(data) {
		this.start(data);
		let tree = parse(this.value);
		let compiler = new Compiler();

		this.write("(function() {").indent();
		this.write("var sheet = Temple.stylesheet();");
		tree.stylesheet.rules.forEach(r => {
			this.write(`sheet.insertRule(${JSON.stringify(compiler.visit(r))}, sheet.cssRules.length);`);
		});
		this.outdent().write("}());\n");

		return this.end();
	}
}
