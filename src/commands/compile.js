import fs from "fs-promise";
import path from "path";
import chokidar from "chokidar";
import {repeat} from "lodash";
import chalk from "chalk";
import Temple from "templejs-compiler";
import {EventEmitter} from "events";

var STDIN;

async function fetchStdin() {
	if (STDIN != null) return [ "_input.html", STDIN ];

	return await new Promise((resolve, reject) => {
		let src = "";
		process.stdin.setEncoding("utf-8");
		process.stdin.on("data", (d) => src += d);
		process.stdin.on("end", () => resolve([ "_input.html", STDIN = src ]));
		process.stdin.on("error", reject);
	});
}

const smfurl = "sourceMappingURL=";
const datauri = "data:application/json;charset=utf-8;base64,";

export function srcToString(smf) {
	return this.code + (!smf ? "" : "\n\n//# " + smfurl +
		(typeof smf === "string" ? smf :
			datauri + new Buffer(this.map.toString(), "utf8").toString("base64")));
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

export function compile(argv) {
	let emitter = new EventEmitter();
	let timeout, watcher;
	let building = false;
	let files = argv._.slice(0);
	let watchedFiles = files.slice(0);
	let hasStdin = !process.stdin.isTTY;

	async function build() {
		if (building) return invalidate();
		building = true;
		let done = () => building = false;

		try {
			let result = await Temple.compileFile(files, {
				plugins: [hasStdin ? {
					resolveId: function(id) {
						if (id === "_input.html") return id;
					},
					load: function(id) {
						if (id === "_input.html") return fetchStdin();
					}
				} : {}],
				format: argv.format,
				moduleId: argv.moduleId,
				moduleName: argv.moduleName
			});

			if (watcher) {
				watcher.unwatch(watchedFiles);
				watcher.add(watchedFiles = result.templates);
			}

			emitter.emit("build", result);
		} finally {
			done();
		}
	}

	function invalidate() {
		if (timeout) return;
		timeout = setTimeout(() => {
			timeout = null;
			build().catch(e => {
				emitter.emit("error", e);
			});
		}, 500);
	}

	emitter.build = build;
	emitter.invalidate = invalidate;

	if (argv.watch) {
		watcher = emitter.watcher = chokidar.watch(watchedFiles, {
			ignoreInitial: true,
			persistent: true
		});

		watcher.on("all", invalidate);
		watcher.on("error", e => {
			emitter.emit("error", e);
		});
	}

	emitter.close = function close() {
		if (watcher) watcher.close();
		emitter.emit("close");
	};

	return emitter;
}

export default async function(argv) {
	const c = compile(argv);
	const onError = e => {
		printError(e);
		if (!argv.watch) process.exit(1);
	};

	c.on("build", async (result) => {
		try {
			let mapFile = argv.sourceMap;
			let output = argv.output ? path.resolve(argv.output) : null;
			let p = [];
			let code;

			if (mapFile === "inline") mapFile = null;
			code = srcToString.call(result, mapFile);

			if (typeof mapFile === "string") {
				if (output) mapFile = path.resolve(path.dirname(output), mapFile);
				else mapFile = path.resolve(mapFile);
				p.push(fs.writeFile(mapFile, JSON.stringify(result.map, null, 2)));
			}

			if (output) p.push(fs.writeFile(output, code));
			else console.log(code);

			await Promise.all(p);
		} catch(e) {
			onError(e);
		}
	});

	c.on("error", onError);

	try {
		await c.build();
	} catch(e) {
		onError(e);
	}
}
