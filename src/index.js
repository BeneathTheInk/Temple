var _ = require("underscore");
var Trackr = require("trackr");
var parse = require("./m+xml").parse;
var NODE_TYPE = require("./types");

import compile from "./compile";
import { add as register, get, create } from "./register";

export { compile, register, get, create };

export function render(tpl) {
	/* jshint -W054 */
	(new Function("Temple", compile(tpl)))(module.exports);
}

// // properties that Node.js and the browser can handle
// var Temple = module.exports = {
// 	VERSION: "0.5.13",
// 	NODE_TYPE: NODE_TYPE,
//
// 	// other parts
// 	utils: require("./utils"),
// 	Context: require("./context"),
//
// 	// trackr short pointers
// 	Trackr: Trackr,
// 	Dependency: Trackr.Dependency,
// 	autorun: Trackr.autorun,
// 	track: require("trackr-objects"),
//
// 	compile: compile,
// 	render: function(tpl) {
// 		/* jshint -W054 */
// 		(new Function("Temple", compile(tpl)))(Temple);
// 	},
//
// 	// all the parsers, declared here for easier access
// 	parse: parse,
// 	parsePath: function(s, opts) {
// 		return parse(s, _.extend({}, opts, { startRule: "path" }));
// 	},
// 	parsePathQuery: function(s, opts) {
// 		return parse(s, _.extend({}, opts, { startRule: "pathQuery" }));
// 	},
// 	parseAttributeValue: function(s, opts) {
// 		return parse(s, _.extend({}, opts, { startRule: "attrValue" }));
// 	},
// 	parseArguments: function(s, opts) {
// 		return parse(s, _.extend({}, opts, { startRule: "attrArguments" }));
// 	},
//
// 	// converts raw html str to template tree
// 	parseHTML: function(str) {
// 		return {
// 			type: NODE_TYPE.ROOT,
// 			children: [ {
// 				type: NODE_TYPE.HTML,
// 				value: str
// 			} ],
// 			version: Temple.VERSION
// 		};
// 	}
// };

// // no need for node js to hurt itself on any hard edges
// // if (typeof document === "undefined") return;
//
// // attach the other parts that Node can't use
// Temple.View = require("./view");
// Temple.Section = require("./section");
//
// // load the real class for the browser
// Temple = module.exports = _.extend(require("./mustache"), Temple);
//
// // load the plugin API
// _.extend(Temple, require("./plugins"));
