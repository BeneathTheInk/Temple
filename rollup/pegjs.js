import pegjs from "pegjs";
import path from "path";

export default function() {
	return {
		transform: function(code, id) {
			if (path.extname(id) !== ".pegjs") return;
			let parts = code.split("#####");
			let source = pegjs.buildParser(parts[parts.length > 1 ? 1 : 0], {
				output: "source",
				optimize: "size"
			});

			return {
				code: `${parts.length > 1 ? parts[0] : ""}
const parser = ${source};
export default parser;
export var parse = parser.parse;`,
				map: { mappings: "" }
			};
		}
	};
}
