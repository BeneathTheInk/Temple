import minimist from "minimist";
import {has} from "lodash";

var Temple = require("./");

import help from "./commands/help";
import version from "./commands/version";
import compile from "./commands/compile";
import run from "./commands/run";
import playground from "./commands/playground";

var commands = {
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

var argv = minimist(process.argv.slice(2), {
	string: [ "output", "format" ],
	boolean: [ "help", "version", "open", "watch" ],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		m: "source-map",
		o: "output",
		w: "watch",
		f: "format"
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

commands[cmd](argv, Temple);
