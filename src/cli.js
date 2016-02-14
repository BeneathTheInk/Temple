import minimist from "minimist";
import {has} from "lodash";

var Temple = require("./");

import help from "./commands/help";
import version from "./commands/version";
import compile from "./commands/compile";

var commands = {
	help, version,
	compile
};

// command aliases
commands.build = commands.compile;

var argv = minimist(process.argv.slice(2), {
	string: [ "output" ],
	boolean: [ "help", "version" ],
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
