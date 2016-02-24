import express from "express";
import clientSource from "./client/index.html";
import path from "path";
import fs from "fs-promise";

const app = express();
export default app;

const html = `<!DOCTYPE html>

<html lang="en-US">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
	</head>
	<body>
		<script type="text/javascript" src="/temple.js"></script>
		<script type="text/javascript" src="/playground.js"></script>
	</body>
</html>`;

app.get("/", (req, res) => {
	res.type("html").send(html);
});

app.get("/temple(.min)?.js", (req, res) => {
	res.sendFile(path.join(__dirname, "dist", req.path));
});

app.get("/playground.js", (req, res) => {
	res.type("js").send(clientSource);
});

const examplesDir = path.join(__dirname, "src/playground/examples");

app.get("/examples", (req, res, next) => {
	fs.readdir(examplesDir)
		.then((examples) => Promise.all(examples.map((f) => {
			if (f[0] === ".") return;
			return fs.stat(path.join(examplesDir, f))
				.then(s => s.isFile() ? f : null);
		})))
		.then(r => {
			res.send(r.filter(Boolean));
		})
		.catch(next);
});

app.get("/examples/:name", (req, res, next) => {
	res.type("text").sendFile(path.join(examplesDir, req.params.name));
});
