var _ = require("underscore"),
	Trackr = require("trackr"),
	parse = require("./m+xml").parse,
	NODE_TYPE = require("./types"),
	track = require("./track");

// properties that Node.js and the browser can handle
var Mustache = module.exports = _.defaults({
	VERSION: "2.1.0-alpha",
	NODE_TYPE: NODE_TYPE,

	// other parts
	util: require("./util"),
	Events: require("./events"),
	Model: require("./model"),

	// trackr short pointers
	Trackr: Trackr,
	Dependency: Trackr.Dependency,
	autorun: Trackr.autorun,

	// all the parsers, declared here for easier access
	parse: parse,
	parsePath: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "path" }));
	},
	parsePathQuery: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "pathQuery" }));
	},
	parseAttributeValue: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "attrValue" }));
	},
	parseArguments: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "attrArguments" }));
	},

	// converts raw html str to template tree
	parseHTML: function(str) {
		return {
			type: NODE_TYPE.ROOT,
			children: [ {
				type: NODE_TYPE.HTML,
				value: str
			} ],
			version: Mustache.VERSION
		};
	}
}, track);

// no need for node js to hurt itself on any hard edges
if (typeof document === "undefined") return;

// load the real mustache for the browser
Mustache = module.exports = _.extend(require("./mustache"), module.exports);

// load the plugin API
_.extend(Mustache, require("./plugins"));

// and attach the rest of the parts that Node can't use
Mustache.DOMRange = require("./domrange");
Mustache.View = require("./view");
Mustache.Section = require("./section");