import * as _ from "lodash";
import Node from "./node";

export default class Attribute extends Node {
	get reactive() {
		return this.children.some(function(c) {
			return c.reactive;
		}) || this.arguments.some(function(c) {
			return c.reactive;
		});
	}

	compile(data) {
		this.start(data);

		this.write(`this.renderDecorator(${JSON.stringify(this.name)}, {`).indent();

		let str = _.invoke(this.children, "compile", data);
		this.write([
			`string: (function() { return `,
			!str.length ? `""` : this._sn(data.originalFilename, str).join(" + "),
			`; }).bind(this),`
		]);

		let args = _.invoke(this.arguments, "compile", data);
		this.write([
			`"arguments": (function() { return [ `,
			this._sn(data.originalFilename, args).join(", "),
			` ]; }).bind(this)`
		]);

		this.outdent().write(`});`);

		return this.end();
	}
}
