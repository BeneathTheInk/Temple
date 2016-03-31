import {uniqueId} from "lodash";
import Node from "./node";
import {compileGroup,addKey} from "./utils";

export default class Each extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);
		let indexvar = uniqueId("index");
		let vars = JSON.stringify(this.variables || []);

		if (!this.attribute) this.push(this.tabs());
		this.push([ `Temple.Each(`, exp, `, `, vars, `, scope, function(scope, ${indexvar}) {` ]).indent();
		if (!this.attribute) this.push("\n");
		data = addKey(data, { value: indexvar });
		let c = this._sn(data.filename, compileGroup(this.children, data));
		if (this.attribute) c = [ " return Temple.utils.joinValues(", c.join(","), "); " ];
		this.push(c);
		this.outdent();
		if (!this.attribute) this.write("});");
		else this.push(`}).join("")`);

		return this.end();
	}
}
