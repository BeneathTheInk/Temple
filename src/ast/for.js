import Node from "./node";
import {compileGroup,addKey} from "./utils";

export default class For extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		this.write([ this.expression.compile(data), ".forEach(function(item, index) {" ]).indent();
		this.write(`Temple.View.render("for", { $item: item, $index: index }, this, function() {`).indent();
		this.push(compileGroup(this.children, addKey(data, { value: "index" })));
		this.outdent().write(`}, item);`);
		this.outdent().write(`}, this);`);
		return this.end();
	}
}
