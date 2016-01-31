import Node from "./node";

export default class Set extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);
		let safevar = JSON.stringify(this.variable);
		if (this.attribute) this.push("(");
		this.push([ `ctx.set(${safevar}, `, exp, `)` ]);
		if (!this.attribute) this.write(";");
		else this.push(`, "")`);

		return this.end();
	}
}
