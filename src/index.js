require("webcomponents.js/CustomElements.js");

import compile from "./compile";
import { add as register, get, create } from "./globals";
import * as proxies from "./proxies";
import * as idom from "./idom";
import * as utils from "./utils";
import Context from "./context";
import parser from "./m+xml";
import { set as registerPartial } from "./plugins/partials";
import * as AST from "./ast";

export var parse = parser.parse.bind(parser);

export {
	register, get, create,
	compile, idom, AST,
	proxies, utils, Context,
	registerPartial
};

export function render(tpl, options) {
	/* jshint -W054 */
	var r = compile(tpl, options);
	// console.log(r);
	return (new Function("Temple", r))(module.exports);
}
