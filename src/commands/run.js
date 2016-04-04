import {compile,printError,srcToString} from "./compile";
import open from "open";
import express from "express";
import {resolve} from "path";

const browser = resolve(__dirname, "../dist/browser.min.js");
const html = `<!DOCTYPE html>

<html lang="en-US">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
	</head>
	<body>
		<script type="text/javascript" src="/temple.js"></script>
		<script type="text/javascript" src="/template.js"></script>
	</body>
</html>`;

export default async function(argv) {
	let c = compile(argv);
	let source;
	let app = express();

	app.get("/", (req, res) => res.send(html));
	app.get("/temple.js", (req, res) => res.sendFile(browser));
	app.get("/template.js", (req, res) => res.type("js").send(source));

	argv.format = "iife";
	if (!argv.moduleName) argv.moduleName = "Template";
	argv.watch = true;

	c.on("build", (result) => {
		source = srcToString.call(result);
	});

	try {
		await c.build();
	} catch(e) {
		printError(e);
		return process.exit(1);
	}

	let server = app.listen(argv.port || 6392, () => {
		let addr = server.address();
		let url = `http://localhost:${addr.port}`;
		if (argv.open) open(url);
		console.log(`HTTP server listening at ${url}.`);
		console.log(`Type Ctrl-C to stop the server.`);
	});

	server.on("error", (e) => {
		printError(e);
		process.exit(1);
	});
}
