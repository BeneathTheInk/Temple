var _ = require("underscore");

// tests value as pojo (plain old javascript object)
var isPlainObject =
exports.isPlainObject = function(obj) {
	return obj != null && obj.__proto__ === Object.prototype;
}

// tests obj as a subclass of parent
// here, a class is technically a subclass of itself
exports.isSubClass = function(parent, fn) {
	return fn === parent || (fn != null && fn.prototype instanceof parent);
}

// regex for spotting vertical tree paths
var vertrex = /^(\.\.\/|\/|\.\/|\.)/i;

// path utilities
var pathUtil =
exports.path = {
	// the path separator
	sep: ".",

	// cleans an array of path parts
	sanitize: function(parts) {
		return parts.filter(function(a) {
			return a != null && a !== "";
		}).map(function(a) {
			var s = a.toString();
			if (s[0] === ".") s = s.substr(1);
			if (s.substr(-1) === ".") s = s.substr(0, s.length - 1);
			return s;
		});
	},

	// splits a path by period
	split: function(path) {
		return pathUtil.sanitize(
			_.isArray(path) ? path :
			_.isString(path) ? path.split(pathUtil.sep) :
			[ path ]
		);
	},

	// parses a string as a context get path
	parse: function(path) {
		var m, query, ops = [];

		// parse off special leading path operators
		while (m = vertrex.exec(path)) {
			path = path.substr(m.index + m[1].length);
			ops.push(m[1]);
		}

		// split the path into parts
		query = pathUtil.split(path);
		query.type = "all";
		query.distance = 0;

		// parse off any leading "this" parts
		while (query[0] === "this") {
			ops.push(query.shift());
		}

		// translate operators onto the query
		ops.some(function(op) {
			switch(op) {
				case "/":
					query.type = "root";
					return true;

				case "./":
				case ".":
				case "this":
					if (query.type === "all") query.type = "local";
					break;

				case "../":
					query.type = "parent";
					query.distance++;
					break;
			}
		});

		return query;
	},

	join: function() {
		return pathUtil.sanitize(_.flatten(_.toArray(arguments))).join(pathUtil.sep);
	}
}

// parses a string path as a dynamic path
exports.parseObserveQuery = function(path) {
	return pathUtil.split(path).map(function(part) {
		if (part.indexOf("*") > -1 && part !== "**") {
			return new RegExp("^" + part.split("*").join("([^\\" + pathUtil.sep + "]*)") + "$");
		}

		return part;
	});
}

// deeply looks for a value at path in obj
var get =
exports.get = function(obj, parts, getter) {
	parts = pathUtil.split(parts);

	// custom getter
	if (!_.isFunction(getter)) {
		getter = function(obj, path) { return obj[path]; }
	}

	while (parts.length) {
		if (obj == null) return;
		obj = getter(obj, parts.shift());
	}

	return obj;
}

// reduces paths so they are unique and short
var findShallowestUniquePaths =
exports.findShallowestUniquePaths = function(paths) {
	return paths.reduce(function(m, keys) {
		// first check if a shorter or equal path exists
		if (m.some(function(k) {
			return arrayStartsWith(keys, k);
		})) return m;

		// next check for any longer paths that need to be removed
		m.slice(0).forEach(function(k, index) {
			if (arrayStartsWith(k, keys)) m.splice(index, 1);
		});

		// and lastly add the path to output
		m.push(keys);
		return m;
	}, []);
}

// determines if the values of array match the start of another array
// can be read as: does [a1] start with [a2]
var arrayStartsWith =
exports.arrayStartsWith = function(a1, a2) {
	var max = a2.length;
	return max <= a1.length && _.isEqual(a2, a1.slice(0, max));
}

// finds all changed, matching subpaths
var findAllChanges =
exports.findAllChanges = function(chg, parts, onPath, ctx) {
	var parts, paths, base, getter,
		args = _.toArray(arguments).slice(2);

	// clone parts so we don't affect the original
	parts = parts.slice(0);

	// match the beginning of parts
	if (!matchPathStart(chg.keypath, parts)) return;

	paths = [];
	base = pathUtil.join(chg.keypath);
	getter = function(obj, path) {
		var proxy, tproxy, val;

		proxy = chg.model.getProxyByValue(obj);
		if (_.isFunction(proxy.get)) return proxy.get(obj, path);

		tproxy = new proxy(obj, chg.model);
		val = _.isFunction(tproxy.get) ? tproxy.get(path) : void 0;
		if (_.isFunction(tproxy.destroy)) tproxy.destroy();

		return val;
	}

	// generate a list of effected paths
	findAllMatchingPaths(chg.model, chg.value, parts, paths);
	findAllMatchingPaths(chg.model, chg.oldValue, parts, paths);
	paths = findShallowestUniquePaths(paths);

	// fire the callback on each path that changed
	paths.forEach(function(keys, index, list) {
		var nval, oval;

		nval = get(chg.value, keys, getter);
		oval = get(chg.oldValue, keys, getter);
		if (nval === oval) return;

		onPath.call(ctx, {
			model: chg.model.getModel(keys),
			keypath: chg.keypath.concat(keys),
			type: changeType(nval, oval),
			value: nval,
			oldValue: oval
		});
	});
}

// matchs the start of a keypath to a list of match parts
// parts is modified to the remaining segments that were not matched
var matchPathStart =
exports.matchPathStart = function(keys, parts) {
	var i, part;

	for (i = 0; i < keys.length; i++) {
		part = parts.shift();
		if (_.isRegExp(part) && part.test(keys[i])) continue;
		if (part === "**") {
			// look ahead
			if (parts[0] == null || parts[0] !== keys[i + 1]) {
				parts.unshift(part);
			}
			continue;
		}
		if (part !== keys[i]) return false;
	}

	return true;
}

// deeply traverses a value in search of all paths that match parts
var findAllMatchingPaths =
exports.findAllMatchingPaths = function(model, value, parts, paths, base) {
	if (paths == null) paths = [];
	if (base == null) base = [];

	if (!parts.length) {
		paths.push(base);
		return paths;
	}

	var proxy = new (model.getProxyByValue(value))(value, model),
		part = parts[0],
		rest = parts.slice(1);

	function handle(key) {
		var args = _.toArray(arguments).slice(1),
			method = proxy[key];

		return !_.isFunction(method) ? method : method.apply(proxy, args);
	}

	function done() {
		proxy.destroy();
		return paths;
	}

	if (_.isRegExp(part)) {
		handle("keys").forEach(function(k) {
			findAllMatchingPaths(model.getModel(k), handle("get", k), rest, paths, base.concat(k));
		});
	} else if (part === "**") {
		if (handle("isLeaf")) {
			if (!rest.length) paths.push(base);
			return done();
		}

		handle("keys").forEach(function(k) {
			var _rest = rest,
				_base = base;

			// look ahead
			if (rest[0] == null || rest[0] !== k) {
				_rest = [part].concat(rest);
				_base = base.concat(k);
			}

			findAllMatchingPaths(model.getModel(k), handle("get", k), _rest, paths, _base);
		});
	} else {
		findAllMatchingPaths(model.getModel(part), handle("get", part), rest, paths, base.concat(part));
	}

	return done();
}

// returns the type of changes based on old and new values
// expects oval !== nval
var changeType =
exports.changeType = function(nval, oval) {
	return _.isUndefined(oval) ? "add" : _.isUndefined(nval) ? "delete" : "update";
}


// cleans html, then converts html entities to unicode
exports.decodeEntities = (function() {
	if (typeof document === "undefined") return;

	// this prevents any overhead from creating the object each time
	var element = document.createElement('div');

	return function decodeHTMLEntities(str) {
		if(str && typeof str === 'string') {
			// strip script/html tags
			str = str.replace(/<script[^>]*>([\S\s]*?)<\/script>/gmi, '');
			str = str.replace(/<\/?\w(?:[^"'>]|"[^"]*"|'[^']*')*>/gmi, '');
			element.innerHTML = str;
			str = element.textContent;
			element.textContent = '';
		}

		return str;
	}
})();
