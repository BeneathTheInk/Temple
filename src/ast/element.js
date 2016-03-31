import {invokeMap} from "lodash";
import Node from "./node";
import {getKey,compileGroup,resetKey,header} from "./utils";

export default class Element extends Node {
	get reactive() { return false; }

	compile(data) {
		this.start(data);

		let tagName = JSON.stringify(this.tagname);
		let key = getKey(data);
		let childs = this.children;
		let attrs = this.attributes;

		let body = () => {
			this.push([].concat(
				invokeMap(attrs, "compile", data),
				compileGroup(childs, resetKey(data))
			));
		};

		header(data, "var idom = Temple.idom;\n");

		if (childs.length || attrs.length) {
			if (!childs.some(c => c.reactive)) {
				this.write(`idom.elementOpen(${tagName}${key ? ", " + key : ""});`);
				body();
				this.write(`idom.elementClose(${tagName});`);
			} else {
				this.write(`Temple.Element(${tagName}, ${key || "null"}, scope, function(scope) {`).indent();
				body();
				this.outdent().write(`});`);
			}
		} else {
			this.write(`idom.elementVoid(${tagName}${key ? ", " + key : ""});`);
		}

		return this.end();
	}
}
