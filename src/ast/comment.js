import Node from "./node";

export default class Comment extends Node {
	compile(data) {
		this.start(data);
		return this.end();
	}
}
