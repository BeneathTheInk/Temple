// import * as _ from "lodash";
import Node from "./node";
import {getKey, compileGroup, resetKey} from "./utils";

export default class Element extends Node {
	compile(data) {
		this.start(data);

		// let self = this;
		let tagName = JSON.stringify(this.tagname);
		let key = getKey(data);
		let childs = this.children;
		let attrs = this.attributes;

		let body = () => {
			this.push(compileGroup(attrs, data));
			this.push(compileGroup(childs, resetKey(data)));
		};

		if (childs.length || attrs.length) {
			if (!attrs.length && !childs.some((c) => c.reactive)) {
				this.write(`Temple.idom.elementOpen(${tagName}${key ? ", " + key : ""});`);
				body();
				this.write(`Temple.idom.elementClose(${tagName});`);
			} else {
				this.write(`Temple.idom.renderElement(${tagName}, ${key || "null"}, function() {`).indent();
				body();
				this.outdent().write(`}, this);`);
			}
		} else {
			this.write(`Temple.idom.elementVoid(${tagName}${key ? ", " + key : ""});`);
		}

		return this.end();
	}
}
