import fs from "fs-promise";
import path from "path";
import chokidar from "chokidar";
import {fromPairs,repeat} from "lodash";
import chalk from "chalk";

function fetchFile(f) {
	return fs.readFile(path.resolve(f), {
		encoding: "utf-8"
	}).then(src => {
		return [f, src];
	});
}

var STDIN;

function fetchStdin() {
	if (STDIN != null) return Promise.resolve([ "_input.js", STDIN ]);
	return new Promise((resolve, reject) => {
		let src = "";
		process.stdin.setEncoding("utf-8");
		process.stdin.on("data", (d) => src += d);
		process.stdin.on("end", () => resolve([ "_input.js", STDIN = src ]));
		process.stdin.on("error", reject);
	});
}

export function printError(e) {
	if (e.location) {
		console.error("\n" + chalk.bold(e.name) + "\n");
		let line = e.location.start.line;
		let col = e.location.start.column;
		let file = path.relative(process.cwd(), e.filename);
		console.error("  " + chalk.underline(`${file}:${line}:${col}\n`));
		let lines = e.source.split(/\r?\n/g);

		let numoffset = (line + 3).toString().length;

		for (let i = 3; i > 0; i--) {
			if ((line - i) <= 0) continue;
			let l = (line - i).toString();
			console.error("  " + repeat(" ", numoffset - l.length) + l + ": " + lines[l - 1]);
		}

		console.error("  " + repeat(" ", numoffset - line.toString().length) + line + ": " + lines[line - 1]);
		console.error("  " + repeat(" ", numoffset + 2) + lines[line - 1].substr(0, col - 1).replace(/\S/g," ") + chalk.red("\u2191"));

		for (let i = 1; i <= 3; i++) {
			if ((line + i) > lines.length) continue;
			let l = (line + i).toString();
			console.error("  " + repeat(" ", numoffset - l.length) + l + ": " + lines[l - 1]);
		}

		console.error(chalk.red("\n  " + e.message + "\n"));
	} else {
		console.error(e.stack || e);
	}
}

function panic(e) {
	printError(e);
	process.exit(1);
}

export function compile(argv, Temple, onBuild) {
	let timeout, watcher;
	let building = false;
	let files = argv._.map(f => path.resolve(f));
	let watchedFiles = files.slice(0);
	let hasStdin = !process.stdin.isTTY;

	function build() {
		if (building) return invalidate();
		building = true;
		let done = () => building = false;

		let p = files.map(fetchFile);
		if (hasStdin) p.push(fetchStdin());

		return Promise.all(p).then(r => {
			return Temple.compile(fromPairs(r), argv);
		}).then(result => {
			done();
			if (watcher) {
				watcher.unwatch(watchedFiles);
				watcher.add(watchedFiles = result.includes);
			}
			if (onBuild) onBuild(result);
			return result;
		}, e => {
			done();
			throw e;
		});
	}

	function invalidate() {
		if (timeout) return;
		timeout = setTimeout(() => {
			timeout = null;
			build().catch(printError);
		}, 500);
	}

	if (argv.watch) {
		watcher = chokidar.watch(watchedFiles, {
			ignoreInitial: true,
			persistent: true
		});

		watcher.on("all", invalidate);
		watcher.on("error", panic);
	}

	return build();
}

export default function(argv, Temple) {
	return compile(argv, Temple, result => {
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
	}).catch(e => {
		printError(e);
		if (!argv.watch) process.exit(1);
	});
}
