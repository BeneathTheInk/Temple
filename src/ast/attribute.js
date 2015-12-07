import * as _ from "lodash";
import Node from "./node";

export default class Attribute extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		this.write(`this.getClosest("template").renderDecorator(${JSON.stringify(this.name)}, this, {`).indent();

		let str = _.invoke(this.children, "compile", data);
		this.write([
			`string: function() { return `,
			!str.length ? `""` : this._sn(data.originalFilename, str).join(" + "),
			`; },`
		]);

		let args = _.invoke(this.arguments, "compile", data);
		this.write([
			`"arguments": function() { return [ `,
			this._sn(data.originalFilename, args).join(", "),
			` ]; }`
		]);

		this.outdent().write(`});`);

		return this.end();
	}
}
