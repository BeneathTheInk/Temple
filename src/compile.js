import * as NODE_TYPE from "./types";
import { parse } from "./m+xml";

export default function compile(tpl) {
	if (typeof tpl === "string") tpl = parse(tpl);

	if (tpl != null) {
		if (tpl.type === NODE_TYPE.ROOT) {
			return tpl.views.map(compile).join("\n");
		} else if (tpl.type === NODE_TYPE.VIEW) {
			let props = [];
			let scripts = [];
			let nodes = tpl.children.filter(function(c) {
				if (c.type !== NODE_TYPE.SCRIPT) return true;
				scripts.push(c.value);
			});

			if (scripts.length) {
				props.push(`initialize: function() {${scripts.join("\n")}}`);
			}

			if (tpl.attributes.extends) {
				props.push(`extends: ${JSON.stringify(tpl.attributes.extends)}`);
			}

			props.push(`template: ${JSON.stringify(nodes)}`);

			return `Temple.register(${JSON.stringify(tpl.name)}, {
${props.map(p => "\t" + p).join(",\n")}
});`;
		}
	}

	throw new Error("Expecting string or template tree.");
}
