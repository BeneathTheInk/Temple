import * as _ from "lodash";
import Node from "./node";
import {getKey,compileGroup,resetKey,resetContextHeader} from "./utils";

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


		let body = (newctx) => {
			if (newctx) {
				data = resetContextHeader(data);
			}

			let c = [].concat(
				_.invoke(attrs, "compile", data),
				compileGroup(childs, resetKey(data))
			);

			if (newctx) {
				data.contextHeaders.forEach(this.write, this);
			}

			this.push(c);
		};

		if (childs.length || attrs.length) {
			if (!this.reactive) {
				this.write(`idom.elementOpen(${tagName}${key ? ", " + key : ""});`);
				body();
				this.write(`idom.elementClose(${tagName});`);
			} else {
				this.write(`Temple.Element(${tagName}, ${key || "null"}, ctx, function(ctx) {`).indent();
				body(true);
				this.outdent().write(`});`);
			}
		} else {
			this.write(`idom.elementVoid(${tagName}${key ? ", " + key : ""});`);
		}

		return this.end();
	}
}
