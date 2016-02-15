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

export function compile(Temple, files, options) {
	let p = files.map(fetchFile);
	if (!process.stdin.isTTY) p.push(fetchStdin());

	return Promise.all(p).then(r => {
		return Temple.compile(fromPairs(r), options);
	});
}

export function panic(e) {
	console.error(e.stack || e);
	process.exit(1);
}
