import {invokeMap} from "lodash";
import Node from "./node";

export default class Attribute extends Node {
	get reactive() {
		return false;
	}

	compile(data) {
		this.start(data);

		let fun;
		let value = this._sn(data.originalFilename, "");
		let len = this.children.length;

		if (len) {
			value.add(invokeMap(this.children, "compile", data)).join(",");
			fun = this.children.some(c => c.reactive);
			if (len > 1) value.prepend("[").add("]");

			if (fun && this.type === "string") {
				if (len > 1) value.add(`.map(Temple.utils.toString).join("")`);
				else value.prepend(`Temple.utils.toString(`).add(`)`);
			}
		} else {
			value = null;
		}

		this.push([ this.tabs(), `decorators.render(ctx, ${JSON.stringify(this.name)}` ]);

		if (fun) {
			this.push(`, function(ctx) {\n`).indent();
			this.write([ "return ", value, ";" ]);
			this.outdent().push([ this.tabs(), `}` ]);
		} else if (value) {
			this.push([ ", ", value ]);
		}

		this.push(`);\n`);

		return this.end();
	}
}
