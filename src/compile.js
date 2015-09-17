import * as NODE_TYPE from "./types";
import { parse } from "./m+xml";

export default function compile(tpl) {
	if (typeof tpl === "string") tpl = parse(tpl);

	if (tpl != null) {
		switch(tpl.type) {
			case NODE_TYPE.ROOT:
				return tpl.views.map(compile).join("\n");

			case NODE_TYPE.SCRIPT:
				return tpl.value;

			case NODE_TYPE.VIEW:
				let props = [];
				let scripts = [];
				let attrs = tpl.attributes;
				let nodes = tpl.children.filter(function(c) {
					if (c.type !== NODE_TYPE.SCRIPT) return true;
					scripts.push(c.value);
				});

				if (scripts.length) {
					props.push(`initialize: function() {
var init = this.super.initialize.bind(this);
${scripts.join("\n")}
}`);
				}

				attrs = attrs.filter(function(a, i) {
					if (a.name !== "extends") return true;
					props.push(`extends: ${JSON.stringify(a.value)}`);
				});

				props.push(`attributes: ${JSON.stringify(attrs)}`);
				props.push(`template: ${JSON.stringify(nodes)}`);

				return `Temple.register(${JSON.stringify(tpl.name)}, {
	${props.map(p => "\t" + p).join(",\n")}
});`;
		}
	}

	throw new Error("Expecting string or template tree.");
}
