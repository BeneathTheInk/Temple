import Node from "./node";
import {compileGroup} from "./utils";

export default class With extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);

		if (!this.attribute) this.push(this.tabs());
		this.push([ `Temple.With(`, exp, `, scope, function(scope) {` ]).indent();
		if (!this.attribute) this.push("\n");
		let c = this._sn(data.filename, compileGroup(this.children, data));
		if (this.attribute) c = [ " return Temple.utils.joinValues(", c.join(","), "); " ];
		this.push(c);
		this.outdent();

		if (!this.attribute) this.write("});");
		else this.push(`})`);

		return this.end();
	}
}
