import playground from "templejs-playground";
import {printError} from "./compile";
import open from "open";

export default function(argv) {
	const app = playground();
	const server = app.listen(argv.port || 6392, () => {
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
