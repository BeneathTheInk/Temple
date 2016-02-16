import * as idom from "./core/idom";
import * as utils from "./core/utils";
import Trackr from "trackr";
import Context from "./core/context";
import * as AST from "./ast";
import pkg from "../package.json";
import stylesheet from "./core/style";

import * as plugins from "./plugins";
import * as decorators from "./plugins/decorators";
import * as actions from "./plugins/actions";

export const version = pkg.version || "edge";

export { Map, List, Variable, trackProperty } from "trackr-objects";
export * from "./core/templates";
export * from "./core/compile";
export * from "./core/builtins";

export {
	Trackr, Context, AST, idom, utils,
	stylesheet, plugins, decorators, actions
};
