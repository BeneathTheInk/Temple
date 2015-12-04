import Node from "./node";

export default class Text extends Node {
	compile(data) {
		this.start(data);
		this.write(`Temple.idom.text(Temple.utils.decodeEntities(${JSON.stringify(this.value)}));`);
		return this.end();
	}
}
