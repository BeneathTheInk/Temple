import * as _ from "lodash";
import Node from "./node";
import {header} from "./utils";

export default class Attribute extends Node {
	get reactive() {
		return false;
	}

	compile(data) {
		this.start(data);

		let value;

		if (this.children) {
			let str = _.invoke(this.children, "compile", data);
			str = !str.length ? `""` : this._sn(data.originalFilename, str).join(" + ");

			if (this.children.length && this.children.some(c => c.reactive)) {
				str = [ `function(ctx){return `, str, `;}` ];
				value = _.uniqueId("ATTR_");
				header(data, [ `var `, value, `=`, str, `;\n` ]);
			} else {
				value = str;
			}
		} else {
			value = `""`;
		}

		this.write([ `idom.renderDecorator(ctx, ${JSON.stringify(this.name)}, `, value, `);` ]);

		// this.write(`this.getClosest("template").renderDecorator(${JSON.stringify(this.name)}, this, {`).indent();
		//
		// let str = ;
		// this.write([
		// 	`string: function() { return `,
		// 	!str.length ? `""` : this._sn(data.originalFilename, str).join(" + "),
		// 	`; },`
		// ]);
		//
		// let args = _.invoke(this.arguments, "compile", data);
		// this.write([
		// 	`"arguments": function() { return [ `,
		// 	this._sn(data.originalFilename, args).join(", "),
		// 	` ]; }`
		// ]);
		//
		// this.outdent().write(`});`);

		return this.end();
	}
}
