import {assign} from "lodash";
import Node from "./node";

export default class Interpolator extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		this.write(`Temple.idom.autotext(${this.expression.compile(assign({ asFn: true }, data))}, this);`);
		return this.end();
	}
}
