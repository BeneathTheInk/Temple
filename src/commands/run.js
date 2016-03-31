import {compile,printError} from "./compile";
import open from "open";
import express from "express";
import {resolve} from "path";

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

export default function(argv, Temple) {
	let source;
	let app = express();

	app.get("/", (req, res) => res.send(html));
	app.use(express.static(resolve(__dirname, "../dist")));
	app.get("/template.js", (req, res) => res.type("js").send(source));

	argv.format = "iife";
	if (!argv.moduleName) argv.moduleName = "Template";
	argv.watch = true;

	return compile(argv, Temple, result => {
		source = result.toString();
	}).then(() => {
		// let server = http.createServer(onRequest());
		let server = app.listen(argv.port || 6392, "127.0.0.1", () => {
			let addr = server.address();
			let url = `http://${addr.address}:${addr.port}`;
			if (argv.open) open(url);
			console.log(`HTTP server listening at ${url}.`);
			console.log(`Type Ctrl-C to stop the server.`);
		});

		server.on("error", (e) => {
			printError(e);
			process.exit(1);
		});
	}).catch(printError);
}
