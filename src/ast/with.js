import Node from "./node";
import {compileGroup} from "./utils";

export default class With extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		this.write([ `Temple.View.render("with", `, this.expression.compile(data), `, this, function() {` ]).indent();
		this.push(compileGroup(this.children, data));
		this.outdent().write(`});`);
		return this.end();
	}
}
