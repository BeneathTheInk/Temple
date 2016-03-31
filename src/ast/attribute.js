import {invokeMap} from "lodash";
import Node from "./node";
import {header} from "./utils";

export default class Attribute extends Node {
	get reactive() {
		return false;
	}

	compile(data) {
		this.start(data);

		let fun;
		let value = this._sn(data.filename, "");
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

		header(data, "var decorators = Temple.decorators;\n");
		this.push([ this.tabs(), `decorators.render(scope, ${JSON.stringify(this.name)}` ]);

		if (fun) {
			this.push(`, function(scope) {\n`).indent();
			this.write([ "return ", value, ";" ]);
			this.outdent().push([ this.tabs(), `}` ]);
		} else if (value) {
			this.push([ ", ", value ]);
		}

		this.push(`);\n`);

		return this.end();
	}
}
