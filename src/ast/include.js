import Node from "./node";

export default class Include extends Node {
	get reactive() { return false; }

	compile(data) {
		this.start(data);
		console.log(this);
		return this.end();
	}
}
