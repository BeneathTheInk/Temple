import Node from "./node";
import {map} from "lodash";
import {SourceNode} from "source-map";

export default class Raw extends Node {
	get reactive() { return false; }

	compile(data) {
		this.start(data);

		let result;
		let parsers = [].concat(
			(data.tags || {})[this.tagname],
			this[this.tagname],
			this.defaultParser
		).filter(Boolean);

		let attrs = this.attributes.reduce((m,a) => {
			switch (a.type) {
				case "empty":
					m[a.name] = true;
					break;

				case "string":
					m[a.name] = a.value;
					break;
			}

			return m;
		}, {});

		while (parsers.length && result == null) {
			let parser = parsers.shift();
			if (typeof parser === "function") {
				result = parser.call(this, this.value, attrs, data);
			}
		}

		if (result != null) this.write(result);
		return this.end();
	}

	defaultParser(value, attrs, data) {
		this._normalize_indent();
		let line = this._line || 1;
		let column = this._column || 1;

		return value.split(/\r?\n/g).map((l, i) => {
			return new SourceNode(i + line, i === 0 ? column : 1, data.filename, l + "\n");
		});
	}

	script(value, attrs) {
		if (!attrs.src) return;

		let attrsrc = map(attrs, (v,n) => {
			return `script[${JSON.stringify(n)}] = ${JSON.stringify(v)};`;
		}).join("\n");

		return `(function(){
	var script = document.createElement("script");
	${attrsrc}
	document.head.appendChild(script);
}());\n`;
	}

	style(value) {
		return `(function() {
	var style = document.createElement("style");
	style.innerHTML = ${JSON.stringify(value)};
	document.head.appendChild(style);
}());`;
	}
}
