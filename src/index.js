import * as idom from "./idom";
import * as utils from "./utils";
import Trackr from "trackr";
import { Map, List, Variable } from "trackr-objects";
import Context from "./context";

import * as plugins from "./plugins";
import * as decorators from "./plugins/decorators";
import * as actions from "./plugins/actions";

export var version = require("../package.json").version || "dev-build";

export * from "./templates";
export * from "./compile";
export * from "./builtins";
export var parse = require("./m+xml").parse;
export var AST = require("./ast");
export {
	Context, idom, utils, Trackr, Map, List, Variable,
	plugins, decorators, actions
};
