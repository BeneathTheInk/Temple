import fs from "fs-promise";
import path from "path";
import {fromPairs} from "lodash";

function fetchFile(f) {
	return fs.readFile(path.resolve(f), {
		encoding: "utf-8"
	}).then(src => {
		return [f, src];
	});
}

function fetchStdin() {
	return new Promise((resolve, reject) => {
		let src = "";
		process.stdin.setEncoding("utf-8");
		process.stdin.on("data", (d) => src += d);
		process.stdin.on("end", () => resolve(["_input.js",src]));
		process.stdin.on("error", reject);
	});
}

export default function(argv, Temple) {
	let p = argv._.map(fetchFile);
	if (!process.stdin.isTTY) p.push(fetchStdin());

	return Promise.all(p).then(r => {
		let result = Temple.compile(fromPairs(r));
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
		else {
			console.log(code);
			process.exit(0);
		}
	}).catch(e => {
		console.error(e.stack || e);
		process.exit(1);
	});
}
