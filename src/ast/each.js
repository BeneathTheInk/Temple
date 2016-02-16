import {uniqueId} from "lodash";
import Node from "./node";
import {compileGroup,addKey,resetContextHeader} from "./utils";

export default class Each extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);
		let indexvar = uniqueId("index");
		let vars = JSON.stringify(this.variables || []);

		if (!this.attribute) this.push(this.tabs());
		this.push([ `Temple.Each(`, exp, `, `, vars, `, ctx, function(ctx, ${indexvar}) {` ]).indent();
		if (!this.attribute) this.push("\n");
		data = resetContextHeader(data);
		data = addKey(data, { value: indexvar });
		let c = this._sn(data.originalFilename, compileGroup(this.children, data));
		data.contextHeaders.forEach(this.write, this);
		if (this.attribute) c = [ " return Temple.utils.joinValues(", c.join(","), "); " ];
		this.push(c);
		this.outdent();
		if (!this.attribute) this.write("});");
		else this.push(`}).join("")`);

		return this.end();
	}
}
