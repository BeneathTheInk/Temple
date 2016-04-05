import {repeat} from "lodash";
import chalk from "chalk";
import cliformat from "cli-format";
import {format} from "util";

let dashi = cliformat.defaults.breaks.indexOf("-");
cliformat.defaults.breaks.splice(dashi, 1);

let tablen = 1;
const newline = (r=1) => console.log(repeat("\n", r - 1));
const indent = () => tablen++;
const outdent = () => tablen = Math.max(1, tablen - 1);
const print = function() {
  console.log(cliformat.wrap(format.apply(null, arguments), {
    paddingLeft: repeat("  ", tablen),
    paddingRight: " ",
    justify: true
  }));
};
const printOption = (opt, msg) => {
  console.log(cliformat.columns.wrap([{
    content: chalk.gray(opt),
    width: 36,
    paddingLeft: repeat("  ", tablen)
  }, {
    content: msg,
    justify: true,
    paddingRight: " "
  }]));
};

export default function() {
  newline();
  print(`$ templejs ${chalk.bold("[COMMAND]")} ${chalk.gray("[OPTIONS]")} [<path>...]`);

  newline();
  print(`This is a CLI tool that compliments the Temple language and ecosystem. By default, this tool compiles Temple files to JavaScript. Simply pipe input through stdin or pass file names and this tool will compile them into a single JavaScript file.`);

	newline();
	print(chalk.underline("Commands"));
  indent();

	newline();
	print(chalk.bold("compile"), "- Build Temple files and output JavaScript.");
	indent();
  newline();
  printOption("-f, --format <format>", `The output Javascript wrapper format. Available values: ${chalk.red("cjs")}, ${chalk.red("umd")}, ${chalk.red("es6")}, ${chalk.red("amd")}, ${chalk.red("iife")}`);
  printOption("-n, --module-name <name>", "The global variable name to set for UMD or IIFE formats.");
  printOption("--module-id <name>", "The AMD module id.");
  printOption("-w, --watch", "Recompile the paths when their contents change. This will keep the process open.");
  printOption("-m, --source-map [mappath]", "Enable source maps with the output. Specify a file name to write the map to its own file. Otherwise the source map with placed inline with the source.");
  printOption("-o, --output <path>", "Write the output to a file relative to the current working directory. If this option isn't specified, the output is piped to stdout.");
  outdent();

  newline();
	print(chalk.bold("run"), "- Start a local HTTP server for running Temple files in the browser.");
	indent();
  newline();
  printOption("-p, --port <port>", "The port to start the HTTP server on.");
  printOption("--open", "Open the server url in this machine's default web browser.");
  outdent();

  newline();
	print(chalk.bold("playground"), "- A small HTTP server for experimenting with the Temple language in your browser.");
	indent();
  newline();
  printOption("-p, --port <port>", "The port to start the playground server on.");
  printOption("--open", "Open the playground in this machine's default web browser.");
  outdent();

  outdent();
  newline();
  print(chalk.underline("Other Options"));
  indent();

  newline();
  printOption("-h, -H, --help", "Show this method.");
  printOption("-v, -V, --version", "Print the CLI tool version and exit.");

  outdent();
	newline();
	process.exit(0);
}
