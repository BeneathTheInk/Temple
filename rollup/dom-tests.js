import path from "path";
import fs from "fs-promise";

const domtest = /^\$DOMTEST:(.*)/;

function ignoreNoExist(e) {
	if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
	return "";
}

function fetchFile(d, n) {
	return fs.readFile(path.join(d, n), {
		encoding: "utf-8"
	}).catch(ignoreNoExist);
}

function buildDOMTests(dir) {
	return fs.readdir(dir).then(files => {
		let src = `import test from "tape";\n\nvar Temple = require("../");`;
		let next = () => {
			if (!files.length) return Promise.resolve(src);
			let file = files.shift();
			let full = path.join(dir, file);

			return fs.stat(full).then(stat => {
				if (!stat.isDirectory()) return;

				return Promise.all([
					fetchFile(full, "setup.js"),
					fetchFile(full, "template.html"),
					fetchFile(full, "test.js")
				]).then(res => {
					src += `\n\ntest(${JSON.stringify(file)}, function(t) {
	Promise.resolve().then(function() {
		${res[0]}
		return Temple.exec(${JSON.stringify(res[1])});
	}).then(function() {
		${res[2]}
	}).catch(function(e) {
		t.error(e);
	}).then(function() {
		t.end();
	});
});`;
				});
			}).then(next);
		};

		return next();
	});
}

export default function() {
	return {
		resolveId: function(id, p) {
			let m = id.match(domtest);
			if (!m) return;
			return "$DOMTEST:" + path.resolve(path.dirname(p), m[1]);
		},
		load: function(id) {
			let m = id.match(domtest);
			if (!m) return;
			return buildDOMTests(m[1]);
		}
	};
}
