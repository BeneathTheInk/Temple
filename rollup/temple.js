import path from "path";
import uglifyjs from "uglify-js";

var Temple;
try { Temple = require("../"); }
catch(e) { e; }

export default function() {
	return {
		transform: function(code, id) {
			if (path.extname(id) !== ".html") return;

			return Temple.compile(code, {
				filename: id,
				format: "iife",
				moduleName: "Playground"
			}).then((res) => {
				const code = uglifyjs.minify(res.code, { fromString: true }).code;

				return {
					code: `export default ${JSON.stringify(code)};`,
					map: { mappings: '' }
				};
			});
		}
	};
}
