import Node from "./node";
import path from "path";

export default class Include extends Node {
	resolve(file) {
		return path.resolve(path.dirname(file), this.src);
	}

	compile(data) {
		this.start(data);
		this.write(`import ${JSON.stringify(this.src)};`);
		return this.end();
	}
}
