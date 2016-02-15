import {compile, panic} from "./utils";
import http from "http";
import fs from "fs-promise";
import open from "open";

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

function onRequest(source) {
	return (req, res) => {
		switch(req.url) {
			case "/template.js":
				res.setHeader("Content-Type", "application/javascript");
				res.setHeader("Content-Length", source.length);
				res.end(source);
				break;

			case "/temple.js":
				res.setHeader("Content-Type", "application/javascript");
				fs.createReadStream(__dirname + "/dist/temple.js").pipe(res);
				break;

			case "/":
				res.setHeader("Content-Type", "text/html");
				res.end(html);
				break;

			default:
				res.statusCode = 404;
				res.end(http.STATUS_CODES[404]);
				break;
		}
	};
}

export default function(argv, Temple) {
	return compile(Temple, argv._, {
		export: "iife"
	}).then(result => {
		let server = http.createServer(onRequest(result.toString()));
		server.on("error", panic);
		server.listen(argv.port || 6392, "127.0.0.1", () => {
			let addr = server.address();
			let url = `http://${addr.address}:${addr.port}`;
			if (argv.open) open(url);
			console.log(`HTTP server listening at ${url}.`);
			console.log(`Type Ctrl-C to stop the server.`);
		});
	}).catch(panic);
}
