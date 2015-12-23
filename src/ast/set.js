import Node from "./node";
import {contextHeader} from "./utils";

export default class Set extends Node {
	get reactive() { return false; }

	compile(data) {
		this.start(data);

		contextHeader(data, "ctx = new Temple.Context(ctx);");

		let exp = this.expression.compile(data);
		let safevar = JSON.stringify(this.variable);
		this.write([ `ctx.set(${safevar}, `, exp, `);` ]);

		return this.end();
	}
}
