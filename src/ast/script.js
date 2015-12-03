import Node from "./node";
import {SourceNode} from "source-map";

export default class Script extends Node {
	compile(data) {
		let line = this._line || 1;
		let column = this._column || 1;

		let lines = this.value.split("\n").map(function(l, i) {
			return new SourceNode(i + line, i === 0 ? column : 1, data.origdinalFilename, l + "\n");
		});

		return this._sn(data.originalFilename, lines);
	}
}
