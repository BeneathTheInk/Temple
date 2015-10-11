import * as _ from "underscore";

// declare, but don't set the plugin variable
// exports and imports are hoisted, so this cannot do anything to the value
var plugins;

export function load(tpl, plugin, args) {
	let name;
	if (plugins == null) plugins = {};

	if (_.isString(plugin)) {
		name = plugin;
		if (plugins[name] == null)
			throw new Error("No plugin exists with id '" + name + "'.");

		plugin = plugins[name];
	}

	if (!_.isFunction(plugin))
		throw new Error("Expecting string or function for plugin");

	// check if plugin is already loaded on this template
	if (tpl._loaded_plugins == null) tpl._loaded_plugins = [];
	if (tpl._loaded_plugins.some(function(p) {
		return p.plugin === plugin;
	})) return tpl;

	if (args == null) args = [];
	if (!_.isArray(args)) args = [ args ];
	tpl._loaded_plugins.push({
		name: name,
		plugin: plugin,
		args: args
	});

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
import "./components";
import "./partials";
import "./actions";
import "./twoway";
import "./adoption";
import "./refs";
import "./reactive-proxies.js";
