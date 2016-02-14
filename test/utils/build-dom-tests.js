const fs = require("fs-promise");
const path = require("path");

function ignoreNoExist(e) {
	if (e.code !== "ENOENT" && e.code !== "ENOTDIR") throw e;
	return "";
}

function fetchFile(d, n) {
	return fs.readFile(path.join(d, n), {
		encoding: "utf-8"
	}).catch(ignoreNoExist);
}

export default function(dir) {
	return fs.readdir(dir).then(files => {
		let src = `import test from "tape";\n\nimport * as Temple from "templejs";`;
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
	${res[0]}
	Temple.exec(${JSON.stringify(res[1])});
	${res[2]}
});`;
				});
			}).then(next);
		};

		return next();
	});
}
