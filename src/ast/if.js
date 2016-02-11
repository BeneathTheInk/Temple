import Node from "./node";
import {addKey} from "./utils";

export default class If extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		if (this.attribute) {
			this.push("(");
		}

		this.children.forEach((c, i, l) => {
			if (this.attribute) {
				if (c.expression) this.push([ c.expression.compile(data), " ? " ]);
				this.push([ "Temple.utils.joinValues(", c.compile(addKey(data, i.toString())).join(","), ")" ]);
				if ((i + 1) === l.length && c.expression) this.push(" : ''");
			} else {
				let line = [];
				line.push(!i ? "if" : !c.expression ? "else" : "else if", " ");
				if (c.expression) line.push([ "(", c.expression.compile(data), ") " ]);
				line.push("{");
				this.write(line).indent();
				this.push(c.compile(addKey(data, i.toString())));
				this.outdent().write("}");
			}
		});

		if (this.attribute) {
			this.push(")");
		}

		return this.end();
	}
}
