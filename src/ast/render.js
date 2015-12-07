import Node from "./node";
import {getKey} from "./utils";

export default class Render extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		this.write(`Temple.Template.render(${this.expression.compile(data)}, ${getKey(data)}, this);`);
		return this.end();
	}
}
