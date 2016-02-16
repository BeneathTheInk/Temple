import Node from "./node";
import {SourceNode} from "source-map";

export default class Script extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		this._normalize_indent();

		let line = this._line || 1;
		let column = this._column || 1;

		this.value.split(/\r?\n/g).forEach((l, i) => {
			this.push(new SourceNode(i + line, i === 0 ? column : 1, data.originalFilename, l + "\n"));
		});

		return this.end();
	}
}
