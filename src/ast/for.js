import Node from "./node";
import {compileGroup,addKey,getKey} from "./utils";

export default class For extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);

		this.write(`Temple.Each(${exp}, ctx, function(ctx, index) {`).indent();
		this.push(compileGroup(this.children, addKey(data, { value: "index" })));
		this.outdent().write(`});`);

		return this.end();
	}
}
