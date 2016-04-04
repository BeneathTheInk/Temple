import minimist from "minimist";
import {has} from "lodash";

import help from "./commands/help";
import version from "./commands/version";
import compile from "./commands/compile";
import run from "./commands/run";
import playground from "./commands/playground";

const commands = {
	help, version,
	compile, run, playground
};

// command aliases
commands.build = commands.compile;
commands.start = commands.exec = commands.run;
commands.open = function(argv) {
	argv.open = true;
	return commands.run.apply(this, arguments);
};

const argv = minimist(process.argv.slice(2), {
	string: [ "output", "format", "moduleName", "moduleId" ],
	boolean: [ "help", "version", "open", "watch" ],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		m: "sourceMap", "source-map": "sourceMap",
		o: "output",
		w: "watch",
		f: "format",
		n: "moduleName"
	}
});

let cmd;
if (argv.help) cmd = "help";
else if (argv.version) cmd = "version";
else if (argv._.length) {
	let tcmd = argv._[0];
	if (has(commands, tcmd)) {
		cmd = tcmd;
		argv._.shift();
	} else {
		cmd = "compile";
	}
} else {
	cmd = process.stdin.isTTY ? "help" : "compile";
}

commands[cmd](argv);
