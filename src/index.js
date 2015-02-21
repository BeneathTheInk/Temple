// the current library version
var VERSION = "2.0.0-alpha";

// no need for node js to hurt itself on any hard edges
if (!process.browser) return module.exports = {
	parse: require("./m+xml").parse,
	VERSION: VERSION
};

// get on with the rest for the browser
var _ = require("underscore"),
	Temple = require("templejs"),
	util = _.extend(require("./util"), Temple.util);

var Mustache =
module.exports = require("./mustache");

Mustache.VERSION = VERSION;
Mustache.util = util;
_.defaults(Mustache, Temple);

Mustache.Model = require("./model");
Mustache.Context = require("./context");
// Mustache.Section = require("./section");
// _.extend(Mustache, require("./plugins"));