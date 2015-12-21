import Node from "./node";

export default class Literal extends Node {
	get reactive() { return false; }

	compile(data) {
		this.start(data);
		this.push(JSON.stringify(this.value));
		return this.end();
	}
}
