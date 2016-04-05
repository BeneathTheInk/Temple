import {name,version} from "../../package.json";
import {VERSION as runtimeVersion} from "templejs-runtime";
import {VERSION as compilerVersion} from "templejs-compiler";
import {VERSION as playgroundVersion} from "templejs-playground";

export default function() {
	console.log("%s %s", name, version);
	console.log("  ├─ runtime %s", runtimeVersion);
	console.log("  ├─ compiler %s", compilerVersion);
	console.log("  └─ playground %s", playgroundVersion);
	process.exit(0);
}
