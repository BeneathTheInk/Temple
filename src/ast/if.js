import Node from "./node";
// import * as _ from "lodash";
import {addKey} from "./utils";

export default class If extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		this.children.forEach((c, i) => {
			let line = [];
			line.push(!i ? "if" : !c.expression ? "else" : "else if", " ");
			if (c.expression) line.push([ "(", c.expression.compile(data), ") " ]);
			line.push("{");
			this.write(line).indent();
			this.push(c.compile(addKey(data, i.toString())));
			this.outdent().write("}");
		});

		return this.end();
	}
}
