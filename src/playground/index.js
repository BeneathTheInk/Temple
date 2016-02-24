import express from "express";
import clientSource from "./client/index.html";
import path from "path";

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
