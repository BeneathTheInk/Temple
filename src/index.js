if (typeof document !== "undefined") {
	require("webcomponents.js/CustomElements.js");
}

import { compile, render, compileHTML, renderHTML } from "./compile";
import { add as register, get, create } from "./globals";
import * as proxies from "./proxies";
import * as idom from "./idom";
import * as utils from "./utils";
import Context from "./context";
import { parse } from "./m+xml";
import * as AST from "./ast";
import { Map, List, Variable } from "trackr-objects";

import * as partials from "./plugins/partials";
import * as actions from "./plugins/actions";
import * as decorators from "./plugins/decorators";

export {
	register, get, create,
	parse, compile, render, compileHTML, renderHTML,
	idom, AST,
	proxies, Context,
	Map, List, Variable, utils,
	actions, partials, decorators
};
