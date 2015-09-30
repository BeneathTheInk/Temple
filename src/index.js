import compile from "./compile";
import { add as register, get, create } from "./globals";
import * as proxies from "./proxies";
import * as idom from "./idom";
import * as utils from "./utils";
import Context from "./context";
import parser from "./m+xml";

export var parse = parser.parse.bind(parser);

export { compile, register, get, create, proxies, idom, utils, Context };

export function render(tpl, options) {
	/* jshint -W054 */
	var r = compile(tpl, options);
	// console.log(r);
	(new Function("Temple", r))(module.exports);
}
