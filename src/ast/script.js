import Node from "./node";
import {SourceNode} from "source-map";
import detectIndent from "detect-indent";

export default class Script extends Node {
	compile(data) {
		this.start(data);
		this._normalize_indent();

		let line = this._line || 1;
		let column = this._column || 1;
		let indent = detectIndent(this.value);

		this.value.split(/\r?\n/g).forEach((l, i) => {
			let lindent = detectIndent(l);
			l = l.replace(/^\s+/, "");
			let len = Math.round(lindent.amount / indent.amount);
			let tabs = this.tabs();
			let tabchar = data.tabchar;
			if (tabchar == null) tabchar = "  ";
			for (let j = 0; j < len; j++) tabs += tabchar;

			this.push(new SourceNode(i + line, i === 0 ? column : 1, data.originalFilename, tabs + l + "\n"));
		});

		return this.end();
	}
}
