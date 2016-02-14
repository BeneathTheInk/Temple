import {invokeMap,assign} from "lodash";
import Node from "./node";

export default class File extends Node {
	compile(data) {
		data = assign({
			originalFilename: this.filename
		}, data);

		this.start(data);
		this.push(invokeMap(this.children, "compile", data));

		let source = this.end();
		if (this.source) source.setSourceContent(data.originalFilename, this.source);
		return source;
	}
}
