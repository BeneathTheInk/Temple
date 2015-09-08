var _ = require("underscore");

var plugins =
exports._plugins = {};

exports.loadPlugin = function(tpl, plugin, args) {
	if (_.isString(plugin)) {
		if (plugins[plugin] == null)
			throw new Error("No plugin exists with id '" + plugin + "'.");

		plugin = plugins[plugin];
	}

	if (!_.isFunction(plugin))
		throw new Error("Expecting string or function for plugin");

	// check if plugin is already loaded on this template
	if (tpl._loaded_plugins == null) tpl._loaded_plugins = [];
	if (~tpl._loaded_plugins.indexOf(plugin)) return tpl;
	tpl._loaded_plugins.push(plugin);

	if (args == null) args = [];
	if (!_.isArray(args)) args = [ args ];

	plugin.apply(tpl, args);
	return tpl;
};

var registerPlugin =
exports.registerPlugin = function(name, fn) {
	if (typeof name !== "string") {
		throw new Error("Expecting string name for plugin.");
	}

	if (typeof fn !== "function") {
		throw new Error("Expecting function for plugin.");
	}

	if (fn === plugins[name]) return;
	if (plugins[name] != null) {
		throw new Error("Refusing to overwrite existing plugin \"name\".");
	}

	plugins[name] = fn;
};

// load built in plugins
registerPlugin("actions", require("./actions"));
registerPlugin("twoway", require("./twoway"));
registerPlugin("adoption", require("./adoption"));
registerPlugin("refs", require("./refs"));
