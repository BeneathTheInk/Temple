var _ = require("underscore"),
	Temple = require("templejs"),
	util = _.extend(require("./util"), Temple.util);

var Mustache =
module.exports = require("./mustache");

Mustache.VERSION = "1.0.0-alpha";
Mustache.util = util;
Mustache.Model = require("./model");
Mustache.Proxy = require("./proxy");
Mustache.Context = require("./context");
Mustache.Section = require("./section");
