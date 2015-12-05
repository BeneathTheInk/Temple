// import * as _ from "lodash";
import Node from "./node";
import {getKey, compileGroup, resetKey} from "./utils";

export default class Element extends Node {
	compile(data) {
		this.start(data);

		// let self = this;
		let tagName = JSON.stringify(this.tagname);
		let key = getKey(data);

		let renderChildren = () => {
			this.push(compileGroup(this.children, resetKey(data)));
		};

		let renderAttributes = () => {
			this.push(compileGroup(this.attributes, data));
		};

		if (this.children.length || this.attributes.length) {
			if (!this.children.some(function(c) {
				return c.reactive;
			}) && !this.attributes.some(function(c) {
				return c.reactive;
			})) {
				this.write(`Temple.idom.elementOpen(${tagName}${key ? ", " + key : ""});`);
				renderAttributes();
				renderChildren();
				this.write(`Temple.idom.elementClose(${tagName});`);
			} else {
				this.write(`(function() {`).indent();
				this.write(`var node = Temple.idom.elementOpen(${tagName}${key ? ", " + key : ""});`);
				renderAttributes();
				this.write(`function renderChildren() {`).indent();
				renderChildren();
				this.outdent().write(`}`);
				this.write(`if (!Temple.Trackr.active) renderChildren.call(this);`);
				this.write(`else Temple.idom.autopatch(node, renderChildren, this);`);
				this.write(`Temple.idom.elementClose(${tagName});`);
				this.outdent().write(`}).call(this);`);
			}
		} else {
			this.write(`Temple.idom.elementVoid(${tagName}${key ? ", " + key : ""});`);
		}

		return this.end();
	}
}
