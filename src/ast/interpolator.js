import Node from "./node";

export default class Interpolator extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		this.write(`(function() {`).indent();
		this.write(`function renderText() {`).indent();
		this.write([ "return ", this.expression.compile(data), ";" ]);
		this.outdent().write(`}`);
		this.write(`if (!Temple.Trackr.active) renderText.call(this);`);
		this.write(`else Temple.idom.autotext(renderText, this);`);
		this.outdent().write(`}).call(this);`);
		return this.end();
	}
}
