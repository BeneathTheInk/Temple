var _ = require("underscore");

var isPlainObject =
exports.isPlainObject = function(obj) {
	return obj != null && obj.__proto__ === Object.prototype;
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