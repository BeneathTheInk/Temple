import * as _ from "lodash";
import Node from "./node";
import {compileGroup} from "./utils";
import Script from "./script";

export default class Template extends Node {
	compile(data) {
		this.start(data);
		var safename = JSON.stringify(this.name);

		this.write(`Template[${safename}] = Temple.register(${safename}, {`);
		this.indent();

		if (this.extends) {
			this.write(`extends: ${JSON.stringify(this.extends)},`);
		}

		let scripts = [];
		let render = [];

		this.children.forEach((c) => {
			if (c instanceof Script) scripts.push(c);
			else render.push(c);
		});

		if (scripts.length) {
			this.write("initialize: function() {").indent();
			this.write("this.super.apply(this, arguments);");
			this.push(_.invoke(scripts, "compile", data));
			this.outdent().write("},");
		}

		this.write("render: function() {").indent();
		this.push(compileGroup(render, data));
		this.outdent().write("}");

		this.outdent().write("});\n");

		return this.end();
	}
}
