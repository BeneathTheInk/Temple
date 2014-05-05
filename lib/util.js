var _ = require("underscore");

var isPlainObject =
exports.isPlainObject = function(obj) {
	return obj != null && obj.__proto__ === Object.prototype;
}

var subclass =
exports.subclass = function(protoProps, staticProps) {
	var parent = this;
	var child;

	// The constructor function for the new subclass is either defined by you
	// (the "constructor" property in your `extend` definition), or defaulted
	// by us to simply call the parent's constructor.
	if (protoProps && _.has(protoProps, 'constructor')) {
		child = protoProps.constructor;
	} else {
		child = function(){ return parent.apply(this, arguments); };
	}

	// Add static properties to the constructor function, if supplied.
	_.extend(child, parent, staticProps);

	// Set the prototype chain to inherit from `parent`, without calling
	// `parent`'s constructor function.
	var Surrogate = function(){ this.constructor = child; };
	Surrogate.prototype = parent.prototype;
	child.prototype = new Surrogate;

	// Add prototype properties (instance properties) to the subclass,
	// if supplied.
	if (protoProps) _.extend(child.prototype, protoProps);

	// Set a convenience property in case the parent's prototype is needed
	// later.
	child.__super__ = parent.prototype;

	return child;
}

function validPathParts(parts) {
	return parts.filter(function(a) {
		return a != null && a !== "";
	}).map(function(a) {
		var s = a.toString();
		if (s[0] === ".") s = s.substr(1);
		if (s.substr(-1) === ".") s = s.substr(0, s.length - 1);
		return s;
	});
}

var splitPath =
exports.splitPath = function(path) {
	var parts = typeof path !== "string" ? [] : path.split(".");
	if (parts[0] === "") parts[0] = "this";
	return validPathParts(parts);
}

var parsePath =
exports.parsePath = function(path) {
	return splitPath(path).map(function(part) {
		if (part.indexOf("*") > -1 && part !== "**") {
			return new RegExp("^" + part.split("*").join("([^\\.]*)") + "$");
		}

		return part;
	});
}

var joinPath =
exports.joinPath = function() {
	return validPathParts(_.flatten(_.toArray(arguments))).join(".");
}

// recursively search obj of all paths that match parts
var findAllMatchingPaths =
exports.findAllMatchingPaths = function(obj, parts, paths, base) {
	if (paths == null) paths = [];
	if (base == null) base = [];

	if (!parts.length) {
		paths.push(base);
		return paths;
	}

	if (obj == null) return paths;

	var part = parts[0],
		rest = parts.slice(1),
		_rest, _base;

	if (_.isRegExp(part)) {
		for (var k in obj) {
			if (part.test(k)) findAllMatchingPaths(obj[k], rest, paths, base.concat(k));
		}
	} else if (part === "**") {
		// if obj is a primary, we can skip trying to traverse it
		if (_.isString(obj) || _.isNumber(obj) || _.isBoolean(obj)) {
			// check for **/path => not a match
			if (!rest.length) paths.push(base);
			return paths;
		}

		for (var k in obj) {
			_rest = rest;
			_base = base;

			// look ahead
			if (rest[0] == null || rest[0] !== k) {
				_rest = [part].concat(rest);
				_base = base.concat(k);
			}

			findAllMatchingPaths(obj[k], _rest, paths, _base);
		}		
	} else {
		findAllMatchingPaths(obj[part], rest, paths, base.concat(part));
	}

	return paths;
}

// reduces paths so they are unique and short
var findShallowestUniquePaths =
exports.findShallowestUniquePaths = function(paths) {
	return paths.reduce(function(m, keys) {
		// first check if a shorter or equal path exists
		var hasShorter = m.some(function(k) {
			return arrayStartsWith(keys, k);
		});

		if (hasShorter) return m;

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

var getSpliceEquivalent =
exports.getSpliceEquivalent = function ( array, methodName, args ) {
	switch ( methodName ) {
		case 'splice':
			return args;

		case 'sort':
		case 'reverse':
			return null;

		case 'pop':
			if ( array.length ) {
				return [ -1 ];
			}
			return null;

		case 'push':
			return [ array.length, 0 ].concat( args );

		case 'shift':
			return [ 0, 1 ];

		case 'unshift':
			return [ 0, 0 ].concat( args );
	}
}

var summariseSpliceOperation =
exports.summariseSpliceOperation = function ( array, args ) {
	var start, addedItems, removedItems, balance;

	if ( !args ) {
		return null;
	}

	// figure out where the changes started...
	start = +( args[0] < 0 ? array.length + args[0] : args[0] );

	// ...and how many items were added to or removed from the array
	addedItems = Math.max( 0, args.length - 2 );
	removedItems = ( args[1] !== undefined ? args[1] : array.length - start );

	// It's possible to do e.g. [ 1, 2, 3 ].splice( 2, 2 ) - i.e. the second argument
	// means removing more items from the end of the array than there are. In these
	// cases we need to curb JavaScript's enthusiasm or we'll get out of sync
	removedItems = Math.min( removedItems, array.length - start );

	balance = addedItems - removedItems;

	return {
		start: start,
		balance: balance,
		added: addedItems,
		removed: removedItems
	};
}