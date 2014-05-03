var _ = require("underscore");

var isGenericObject =
exports.isGenericObject = function(obj) {
	return obj != null && obj.__proto__ === Object.prototype;
}

var splitPath =
exports.splitPath = function(path) {
	var parts = typeof path !== "string" ? [] : path.split(".");
	if (parts[0] === "") parts[0] = "this";
	return _.compact(parts);
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
	return _.compact(_.flatten(_.toArray(arguments))).join(".");
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

var isEmptySection =
exports.isEmptySection = function(val) {
	return !val || (_.isArray(val) && !val.length);
}

var processSection =
exports.processSection = function(ctx, path, fn) {
	var val = ctx.get(path);
	if (isEmptySection(val)) return false;

	if (_.isArray(val)) {
		val.forEach(function(v, index) {
			var nctx = ctx.spawn(v);
			nctx.hidden.$index = index;
			fn(nctx);
		});
	} else {
		fn(ctx.spawn(val));
	}

	return true;
}