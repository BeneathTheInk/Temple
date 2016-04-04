import {name,version} from "../../package.json";

export default function() {
	console.log("%s %s", name, version);
	process.exit(0);
}
