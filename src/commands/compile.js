import fs from "fs-promise";
import path from "path";
import chokidar from "chokidar";
import {has,assign,fromPairs,repeat} from "lodash";
import chalk from "chalk";
import Temple from "templejs-compiler";
import {rollup} from "rollup";
import {EventEmitter} from "events";
import inject from "@mrgalaxy/rollup-plugin-inject";

async function fetchFile(f) {
	let src = await fs.readFile(path.resolve(f), {
		encoding: "utf-8"
	});

	return [f, src];
}

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
	let files = argv._.map(f => path.resolve(f));
	let watchedFiles = files.slice(0);
	let hasStdin = !process.stdin.isTTY;

	async function build() {
		if (building) return invalidate();
		building = true;
		let done = () => building = false;

		try {
			const templates = [];
			let p = files.map(fetchFile);
			if (hasStdin) p.push(fetchStdin());
			let srcs = fromPairs(await Promise.all(p));

			let bundle = await rollup({
				onwarn: () => {},
				entry: "_entry.js",
				plugins: [
					{
						resolveId: function(id) {
							if (id === "_entry.js" ||
								id === "_template.js" ||
								id === "_input.html") return id;
						},
						load: function(id) {
							if (id === "_entry.js") {
								return Object.keys(srcs)
									.map(f => `import ${JSON.stringify(f)};`)
									.join("\n") +
									"\nexport default Template;\n";
							}

							if (id === "_template.js") {
								return "export default {};\n";
							}

							if (has(srcs, id)) return srcs[id];
						},
						transform: function(src, id) {
							if (path.extname(id) !== ".html") return;
							if (id[0] === "/") templates.push(id);

							let res = Temple.compile(src, assign({}, argv, {
								filename: id,
								extensions: [ ".html" ],
								format: "none"
							}));

							return {
								code: res.code,
								map: res.map.toJSON()
							};
						}
					},
					inject({
						Temple: "templejs",
						Template: "_template.js",
						idom: [ "templejs", "idom" ],
						decorators: [ "templejs", "decorators" ]
					})
				]
			});

			let out = bundle.generate({
				format: argv.format,
				sourceMap: true,
				exports: "default",
				useStrict: false,
				moduleId: argv.moduleId,
				moduleName: argv.moduleName,
				globals: {
					templejs: "Temple"
				}
			});

			if (watcher) {
				watcher.unwatch(watchedFiles);
				watcher.add(watchedFiles = templates);
			}

			emitter.emit("build", out);
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
