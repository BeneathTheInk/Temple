import {forEach} from "lodash";
import Node from "./node";
import {SourceNode} from "source-map";

export default class Script extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let attrs = this.attributes.reduce((m,a) => {
			switch (a.type) {
				case "empty":
					m[a.name] = true;
					break;

				case "string":
					m[a.name] = a.value;
					break;
			}

			return m;
		}, {});

		if (attrs.src) {
			this.write(`(function(){`).indent();
			this.write(`var script = document.createElement("script");`);
			forEach(attrs, (v,n) => {
				this.write(`script[${JSON.stringify(n)}] = ${JSON.stringify(v)};`);
			});
			this.write(`document.head.appendChild(script);`);
			this.outdent().write(`}());`);
		} else {
			this._normalize_indent();
			let line = this._line || 1;
			let column = this._column || 1;

			this.value.split(/\r?\n/g).forEach((l, i) => {
				this.push(new SourceNode(i + line, i === 0 ? column : 1, data.originalFilename, l + "\n"));
			});
		}

		return this.end();
	}
}
