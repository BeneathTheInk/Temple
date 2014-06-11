var _ = require("underscore");

// tests value as pojo (plain old javascript object)
var isPlainObject =
exports.isPlainObject = function(obj) {
	return obj != null && obj.__proto__ === Object.prototype;
}

exports.isSubClass = function(parent, obj) {
	return obj === parent || obj.prototype instanceof parent;
}

// the subclassing function found in Backbone
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

// cleans an array of path parts
var sanitizePathParts =
exports.sanitizePathParts = function(parts) {
	return parts.filter(function(a) {
		return a != null && a !== "";
	}).map(function(a) {
		var s = a.toString();
		if (s[0] === ".") s = s.substr(1);
		if (s.substr(-1) === ".") s = s.substr(0, s.length - 1);
		return s;
	});
}

// splits a path by period
var splitPath =
exports.splitPath = function(path) {
	var parts = _.isArray(path) ? path : _.isString(path) ? path.split(".") : [ path ];
	if (parts.length > 1 && parts[0] === "") parts[0] = "this";
	return sanitizePathParts(parts);
}

// parses a string path as a dynamic path
var parsePath =
exports.parsePath = function(path) {
	return splitPath(path).map(function(part) {
		if (part.indexOf("*") > -1 && part !== "**") {
			return new RegExp("^" + part.split("*").join("([^\\.]*)") + "$");
		}

		return part;
	});
}

// concats path parts together into a string
var joinPathParts =
exports.joinPathParts = function() {
	return sanitizePathParts(_.flatten(_.toArray(arguments))).join(".");
}

// deeply looks for a value at path in obj
var get =
exports.get = function(obj, parts, getter) {
	parts = splitPath(parts);

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

// array write operations
var mutatorMethods = [ 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ];

// patches an array so we can listen to write operations
var patchArray =
exports.patchArray = function(arr) {
	if (arr._patched) return arr;
	
	var patchedArrayProto = [],
		observers = [];
	
	Object.defineProperty(patchedArrayProto, "_patched", { value: true });
	Object.defineProperty(patchedArrayProto, "_observers", { value: [] });

	Object.defineProperty(patchedArrayProto, "observe", {
		value: function(fn) {
			if (typeof fn !== "function") throw new Error("Expecting function to observe with.");
			this._observers.push(fn);
			return this;
		}
	});

	Object.defineProperty(patchedArrayProto, "stopObserving", {
		value: function(fn) {
			var index = this._observers.indexOf(fn);
			if (index > -1) this._observers.splice(index, 1);
			return this;
		}
	});

	mutatorMethods.forEach(function(methodName) {
		Object.defineProperty(patchedArrayProto, methodName, {
			value: method
		});

		function method() {
			var spliceEquivalent, summary, start,
				original, size, i, index, result;

			// push, pop, shift and unshift can all be represented as a splice operation.
			// this makes life easier later
			spliceEquivalent = getSpliceEquivalent(this, methodName, _.toArray(arguments));
			summary = summariseSpliceOperation(this, spliceEquivalent);

			// make a copy of the original values
			if (summary != null) {
				start = summary.start;
				original = Array.prototype.slice.call(this, start, !summary.balance ? start + summary.added : void 0);
				size = (summary.balance > 0 ? summary.added : 0) + original.length;
			} else {
				start = 0;
				original = Array.prototype.slice.call(this, 0);
				size = original.length;
			}

			// apply the underlying method
			result = Array.prototype[methodName].apply(this, arguments);

			// trigger changes
			for (i = 0; i < size; i++) {
				index = i + start;
				this._observers.forEach(function(fn) {
					fn.call(this, index, this[index], original[i]);
				}, this);
			}

			return result;
		};
	});

	if (({}).__proto__) arr.__proto__ = patchedArrayProto;
	else {
		mutatorMethods.forEach(function(methodName) {
			Object.defineProperty(arr, methodName, {
				value: patchedArrayProto[methodName],
				configurable: true
			});
		});
	}

	return arr;
}

// converts array write operations into splice equivalent arguments
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

// returns a summary pf how an array will be changed after the splice operation
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

// tests a node against a selector
exports.matchSelector = function(node, selector) {
	var nodes, i;

	nodes = ( node.parentNode || node.ownerDocument ).querySelectorAll( selector );

	i = nodes.length;
	while ( i-- ) {
		if ( nodes[i] === node ) {
			return true;
		}
	}

	return false;
}

// returns the type of changes based on old and new values
// expects oval !== nval
exports.changeType = function(nval, oval) {
	return _.isUndefined(oval) ? "add" : _.isUndefined(nval) ? "delete" : "update";
}