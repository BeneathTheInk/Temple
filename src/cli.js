import minimist from "minimist";
import {has} from "lodash";

var Temple = require("./");

import help from "./commands/help";
import version from "./commands/version";
import compile from "./commands/compile";
import run from "./commands/run";

var commands = {
	help, version,
	compile, run
};

// command aliases
commands.build = commands.compile;
commands.start = commands.exec = commands.run;

var argv = minimist(process.argv.slice(2), {
	string: [ "output", "export" ],
	boolean: [ "help", "version", "open" ],
	alias: {
		h: "help", H: "help",
		v: "version", V: "version",
		m: "source-map",
		o: "output"
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
