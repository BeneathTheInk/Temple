import Node from "./node";
import {getKey} from "./utils";

export default class Render extends Node {
	compile(data) {
		this.start(data);
		this.write(`(function() {`).indent();
		this.write(`var T = Temple.getByName(${this.expression.compile(data)});`);
		this.write(`var tpl = new T(void 0, this);`);
		this.write(`tpl.mount({ key: ${getKey(data)} });`);
		this.write(`var comp = Trackr.currentComputation;`);
		this.write(`if (comp) comp.onInvalidate(function() { tpl.destroy(); });`);
		this.outdent().write(`}).call(this);`);
		return this.end();
	}
}
