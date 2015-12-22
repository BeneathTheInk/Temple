import Node from "./node";
import {compileGroup} from "./utils";

export default class With extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);

		this.write([ `Temple.With(`, exp, `, ctx, function(ctx) {` ]).indent();
		this.push(compileGroup(this.children, data));
		this.outdent().write(`});`);

		return this.end();
	}
}
