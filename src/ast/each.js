import * as _ from "lodash";
import Node from "./node";
import {compileGroup,addKey,resetContextHeader} from "./utils";

export default class Each extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);
		let indexvar = _.uniqueId("index");

		this.write([ `Temple.Each(`, exp, `, ctx, function(ctx, ${indexvar}) {` ]).indent();
		data = resetContextHeader(data);
		data = addKey(data, { value: indexvar });
		let c = compileGroup(this.children, data);
		data.contextHeaders.forEach(this.write, this);
		this.push(c);
		this.outdent().write(`});`);

		return this.end();
	}
}
