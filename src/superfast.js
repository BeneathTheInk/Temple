import path from "path";
var Temple = require("../");

export default function(compile) {
	compile.transform(transform);
}

function transform(file, src) {
	if (path.extname(file.path) !== ".html") return;
	file.setType("script");
	file.target("client");

	return [
		"var Temple = require(\"templejs\");",
		Temple.compile(src, { exports: "cjs" })
	].join("\n");
}
