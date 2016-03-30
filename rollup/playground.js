import path from "path";
import uglifyjs from "uglify-js";
import babel from "rollup-plugin-babel";
import commonjs from 'rollup-plugin-commonjs';
import nodeGlobals from "rollup-plugin-node-globals";
import resolve from "rollup-plugin-node-resolve";
import builtins from "rollup-plugin-node-builtins";

var Temple;
try { Temple = require("../"); }
catch(e) { e; }

const _resolve = resolve({
	jsnext: false,
	main: true,
	browser: true,
	preferBuiltins: true
});

export default function() {
	return {
		transform: function(code, id) {
			if (path.extname(id) !== ".html") return;

			return Temple.compile(code, {
				filename: id,
				format: "umd",
				moduleName: "Playground",
				plugins: [
					builtins(),
					{
						resolveId: function(id) {
							if (id === "templejs") return false;
							return _resolve.resolveId.apply(this, arguments);
						}
					},
					babel({
						exclude: [ "node_modules/**" ]
					}),
					commonjs({
						include: [ "node_modules/**" ],
						exclude: [ "node_modules/rollup-plugin-node-globals/**" ],
						extensions: [ ".js" ]
					}),
					nodeGlobals()
				]
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
