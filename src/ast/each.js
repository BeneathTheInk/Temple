import * as _ from "lodash";
import Node from "./node";
import {compileGroup,addKey} from "./utils";

export default class Each extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);

		let exp = this.expression.compile(data);
		let indexvar = _.uniqueId("index");

		this.write([ `Temple.Each(`, exp, `, ctx, function(ctx, ${indexvar}) {` ]).indent();
		this.push(compileGroup(this.children, addKey(data, { value: indexvar })));
		this.outdent().write(`});`);

		return this.end();
	}
}
