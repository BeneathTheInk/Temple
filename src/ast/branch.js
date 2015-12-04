import Node from "./node";
import {compileGroup} from "./utils";

export default class Branch extends Node {
	compile(data) {
		this.start(data);
		this.push(compileGroup(this.children, data));
		return this.end();
	}
}
