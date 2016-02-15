import fs from "fs-promise";
import path from "path";
import {compile, panic} from "./utils";

export default function(argv, Temple) {
	return compile(Temple, argv._, {
		export: argv.export
	}).then(result => {
		let mapFile = argv["source-map"];
		let output = argv.output ? path.resolve(argv.output) : null;
		let p = [];
		let code;

		if (!mapFile) {
			code = result.code;
		} else {
			if (mapFile === "inline") mapFile = null;
			code = result.toString(mapFile);

			if (typeof mapFile === "string") {
				if (output) mapFile = path.resolve(path.dirname(output), mapFile);
				else mapFile = path.resolve(mapFile);
				p.push(fs.writeFile(mapFile, result.map.toString()));
			}
		}

		if (output) return fs.writeFile(output, code);

		console.log(code);
		process.exit(0);
	}).catch(panic);
}
