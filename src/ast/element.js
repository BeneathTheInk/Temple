import {invokeMap} from "lodash";
import Node from "./node";
import {getKey,compileGroup,resetKey} from "./utils";

export default class Element extends Node {
	get reactive() {
		return this.children.some(c => c.reactive);
	}

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

		if (childs.length || attrs.length) {
			if (!this.reactive) {
				this.write(`Temple.idom.elementOpen(${tagName}${key ? ", " + key : ""});`);
				body();
				this.write(`Temple.idom.elementClose(${tagName});`);
			} else {
				this.write(`Temple.Element(${tagName}, ${key || "null"}, ctx, function(ctx) {`).indent();
				body();
				this.outdent().write(`});`);
			}
		} else {
			this.write(`Temple.idom.elementVoid(${tagName}${key ? ", " + key : ""});`);
		}

		return this.end();
	}
}
