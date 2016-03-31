var run = require('tape-run');
var http = require("http");
var minimist = require("minimist");
var fs = require("fs");
var randomPort = require("random-port");

var argv = minimist(process.argv.slice(2));

var server = http.createServer(function(req, res) {
	res.setHeader("Access-Control-Allow-Origin", "*");
	if (req.method !== "POST") {
		if (req.headers["access-control-request-headers"]) {
			res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"]);
		}
		return res.end();
	}

	var src = "";
	req.setEncoding("utf-8");

	req.on("data", function(c) { src += c; });
	req.on("end", function() {
		// shutdown the server since we have what we need
		setTimeout(function() { server.close(); }, 500);

		try {
			try { fs.mkdirSync("coverage"); }
			catch(e) { if (e.code !== "EEXIST") throw e; }
			fs.writeFileSync("coverage/coverage.json", src);
			console.error("Recieved coverage details.");
		} catch(e) {
			res.statusCode = 500;
		}

		res.end();
	});
});

randomPort(function(port) {
	server.listen(port);
	var runner = run(argv);
	runner.write("var COVERAGE_PORT = "+JSON.stringify(port)+";");
	process.stdin.pipe(runner).pipe(process.stdout);
});
