import {invokeMap,assign,uniqueId} from "lodash";
import Node from "./node";

export default class File extends Node {
	compile(data) {
		data = assign({}, data, {
			filename: this.filename || (uniqueId("template") + ".html"),
			headers: []
		});

		this.start(data);
		this.push(invokeMap(this.children, "compile", data));

		let source = this.end();
		if (this.source) source.setSourceContent(data.filename, this.source);

		return source;
	}
}
