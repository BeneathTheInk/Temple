import playground from "../playground";
import {printError} from "./compile";

export default function(argv) {
	let server = playground.listen(argv.port || 6392, "127.0.0.1", () => {
		let addr = server.address();
		let url = `http://${addr.address}:${addr.port}`;
		console.log(`HTTP server listening at ${url}.`);
		console.log(`Type Ctrl-C to stop the server.`);
	});

	server.on("error", (e) => {
		printError(e);
		process.exit(1);
	});
}
