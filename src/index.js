var _ = require("underscore"),
	Temple = require("templejs"),
	parse = require("./m+xml").parse,
	NODE_TYPE = require("./types");

module.exports = _.defaults({
	VERSION: "2.0.0-alpha",
	NODE_TYPE: NODE_TYPE,
	Temple: Temple,

	parse: parse,

	parsePath: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "path" }));
	},

	parsePathQuery: function(s, opts) {
		return parse(s, _.extend({}, opts, { startRule: "pathQuery" }));
	},

	parseAttribute: function(s, opts) {
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
			} ]
		};
	}
}, Temple);

// no need for node js to hurt itself on any hard edges
if (!process.browser) return;

var Mustache = module.exports = _.extend(require("./mustache"), module.exports);

_.extend(Mustache.util, require("./util"));
Mustache.Model = require("./model");
Mustache.Context = require("./context");
Mustache.Section = require("./section");
_.extend(Mustache, require("./plugins"));