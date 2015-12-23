import Node from "./node";
import {compileGroup,resetContextHeader} from "./utils";

export default class With extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);

		this.write([ `Temple.With(`, exp, `, ctx, function(ctx) {` ]).indent();
		data = resetContextHeader(data);
		let c = compileGroup(this.children, data);
		data.contextHeaders.forEach(this.write, this);
		this.push(c);
		this.outdent().write(`});`);

		return this.end();
	}
}
