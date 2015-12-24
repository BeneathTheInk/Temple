import * as _ from "lodash";
import Node from "./node";
import Expression from "./expression";
import Literal from "./literal";
import {header} from "./utils";

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
				str = _.invoke(this.children, "compile", data);
				str = !str.length ? `""` : this._sn(data.originalFilename, str).join(" + ");
				fun = this.children.length && this.children.some(c => c.reactive);
			}

			if (fun) {
				str = [ `function(ctx){return `, str, `;}` ];
				value = _.uniqueId("ATTR_");
				header(data, [ `var `, value, `=`, str, `;\n` ]);
			} else {
				value = str;
			}
		} else {
			value = `""`;
		}

		this.write([ `decorators.render(ctx, ${JSON.stringify(this.name)}, `, value, `);` ]);

		return this.end();
	}
}
