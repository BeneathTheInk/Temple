import * as idom from "./idom";
import * as utils from "./utils";
import Trackr from "trackr";
import { Map, List, Variable } from "trackr-objects";
import Context from "./context";
import * as AST from "./ast";
import pkg from "../package.json";

import * as plugins from "./plugins";
import * as decorators from "./plugins/decorators";
import * as actions from "./plugins/actions";

export const version = pkg.version || "dev-build";

export * from "./templates";
export * from "./compile";
export * from "./builtins";
export {parse} from "./m+xml.pegjs";

export {
	Context, idom, utils, Map, List, Variable,
	plugins, decorators, actions, AST, Trackr
};
