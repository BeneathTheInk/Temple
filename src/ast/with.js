import Node from "./node";
import {compileGroup,getKey} from "./utils";

export default class With extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		this.write(`(function() {`).indent();
		this.write([`var data = `, this.expression.compile(data), ";"]);
		this.write(`Temple.View.render("with", ${getKey(data)}, data, this, function() {`).indent();
		this.push(compileGroup(this.children, data));
		this.outdent().write(`}, data);`);
		this.outdent().write(`}).call(this);`);
		return this.end();
	}
}
