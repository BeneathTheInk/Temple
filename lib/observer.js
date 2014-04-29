var EventEmitter = require("events").EventEmitter,
	_ = require("underscore"),
	util = require("./util");

module.exports = util.subclass(EventEmitter, {

	constructor: function(path, fn, temple) {
		if (typeof fn !== "function") throw new Error("Expected function to call on change.");
		EventEmitter.call(this);

		this.path = path;
		this.parts = util.parsePath(path);
		this.callback = fn;
		this.stopped = false;

		this.temple = temple;
		temple._observers.push(this);
	},

	stop: function() {
		if (this.stopped) return;
		this.stopped = true;

		// remove from temple instance
		var index = this.temple._observers.indexOf(this);
		if (index > -1) this.temple._observers.splice(index, 1);
		
		this.emit("stop");
		return this;
	},

	exec: function() {
		var args = _.toArray(arguments);
		this.callback.apply(this.temple, args);
		this.emit.apply(this, ["handle"].concat(args));
		return this;
	},

	handle: function(keys, newval, oldval) {
		var parts, part, base, self, paths, didExec;

		// clone parts so we don't affect the original
		parts = this.parts.slice(0);
		
		// traverse through cparts
		// a mismatch means we don't need to be here
		for (var i = 0; i < keys.length; i++) {
			part = parts.shift();
			if (_.isRegExp(part) && part.test(keys[i])) continue;
			if (part === "**") {
				console.log("star star!");
				return;
			}
			if (part !== keys[i]) return false;
		}

		self = this;
		didExec = false;
		paths = {};
		base = util.joinPath(keys);

		// generate a list of effected paths
		generatePaths(newval, parts, paths);
		generatePaths(oldval, parts, paths);

		// fire the callback on each path that changed
		_.each(paths, function(v, path) {
			var nval = self.temple._get(newval, path),
				oval = self.temple._get(oldval, path);

			if (nval !== oval) {
				self.exec(nval, oval, util.joinPath(base, path));
				didExec = true;
			}
		});

		return didExec;
	}
	
});

// recursively search obj of all paths that match parts
function generatePaths(obj, parts, paths, base) {
	if (paths == null) paths = {};
	if (base == null) base = "";

	if (!parts.length) {
		paths[base] = true;
		return paths;
	}

	if (obj == null) return paths;

	var part = parts[0],
		rest = parts.slice(1);

	if (_.isRegExp(part)) {
		for (var k in obj) {
			if (part.test(k)) generatePaths(obj[k], rest, paths, util.joinPath(base, k));
		}
	} else if (part === "**") {
		console.log("star star!");
	} else {
		generatePaths(obj[part], rest, paths, util.joinPath(base, part));
	}

	return paths;
}