import {assign} from "lodash";
import Node from "./node";

export default class Interpolator extends Node {
	// while technically reactive, they contain their own autorun statement
	get reactive() { return false; }

	compile(data) {
		this.start(data);
		this.write(`idom.autotext(${this.expression.compile(assign({ asFn: true }, data))});`);
		return this.end();
	}
}
