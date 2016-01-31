import * as _ from "lodash";
import Node from "./node";
import Expression from "./expression";
import {header,resetContextHeader} from "./utils";

export default class Attribute extends Node {
	get reactive() {
		return false;
	}

	compile(data) {
		this.start(data);

		let value;

		if (this.children) {
			let str, fun;

			if (this.children instanceof Expression) {
				str = this.children.compile(data);
				fun = true;
			} else {
				let len = this.children.length;
				data = resetContextHeader(data);
				str = _.invoke(this.children, "compile", data);
				str = !len ? null : this._sn(data.originalFilename, str).join(",");
				if (len > 1) str = ["Temple.utils.joinValues(",str,")"];
				fun = len && this.children.some(c => c.reactive);
				if (fun) str = ["[", str, "]"];
			}

			if (fun) {
				str = [ `function(ctx){`,data.contextHeaders.join("\n"),`return `, str, `;}` ];
				value = _.uniqueId("ATTR_");
				header(data, [ `var `, value, `=`, str, `;\n` ]);
			} else {
				value = str;
			}
		}

		this.write([ `decorators.render(ctx, ${JSON.stringify(this.name)}`, (value != null ? [", ", value] : ""), `);` ]);

		return this.end();
	}
}
