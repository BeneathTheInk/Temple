import Node from "./node";
import parse from "css/lib/parse";

export default class Style extends Node {
	get reactive() { return false; }

	compile(data) {
		this.start(data);
		console.error(parse(this.value));
		return this.end();
	}
}
