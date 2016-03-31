import Node from "./node";
import {getKey} from "./utils";

export default class Render extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		let exp = this.expression.compile(data);
		this.write([ `Temple.render(`, exp, `, scope, ${getKey(data)});` ]);
		return this.end();
	}
}
