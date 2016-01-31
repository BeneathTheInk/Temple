import Node from "./node";

export default class Set extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);
		let safevar = JSON.stringify(this.variable);
		this.write([ `ctx.set(${safevar}, `, exp, `);` ]);

		return this.end();
	}
}
