import * as _ from "underscore";

// declare, but don't set the plugin variable
// exports and imports are hoisted, so this cannot do anything to the value
var plugins;

export function load(tpl, plugin, args) {
	if (plugins == null) plugins = {};

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
}

export function register(name, fn) {
	if (plugins == null) plugins = {};

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
}

export function get(name) {
	return plugins && plugins[name];
}

// load built in plugins
import "./decorators";
import "./helpers";
import "./actions";
import "./twoway";
import "./adoption";
import "./refs";
import "./reactive-proxies.js";
