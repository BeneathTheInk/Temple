import Node from "./node";
import {containsEntities} from "../core/utils";

export default class Text extends Node {
	compile(data) {
		this.start(data);

		var value = this.value.replace(/\s+/g, " ");
		var safe = JSON.stringify(value);

		if (containsEntities(value)) {
			safe = `Temple.utils.decodeEntities(${safe})`;
		}

		this.write(`Temple.idom.text(${safe});`);
		return this.end();
	}
}
