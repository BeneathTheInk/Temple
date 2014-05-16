var Temple = require("./temple"),
	_ = require("underscore"),
	util = require("./util"),
	EventEmitter = require("events").EventEmitter;

var Adaptor =
module.exports = util.subclass.call(EventEmitter, {
	constructor: function(value) {
		EventEmitter.call(this);
		this.value = value;
		this.initialize.apply(this, arguments);
	},
	initialize: function(){},
	keys: function() { return []; },
	get: function(path) { return; },
	set: function(path, value) { return false; },
	reset: function(obj) { return false; },
	destroy: function() {}
}, {
	extend: util.subclass,
	match: function(val) {
		return true;
	},
	isAdaptor: function(obj) {
		return obj instanceof Adaptor;
	}
});

Adaptor.Object = Adaptor.extend({
	keys: function() {
		return Object.keys(this.value);
	},

	get: function(path) {
		return this.value[path];
	},

	set: function(path, value) {
		this.value[path] = value;
		return true;
	},

	merge: function(obj, setter) {
		if (!util.isPlainObject(obj)) return false;

		Object.keys(obj).forEach(function(key) {
			setter(key, obj[key]);
		}, this);

		return true;
	}
}, {
	match: function(obj) {
		return util.isPlainObject(obj);
	}
});

var mutatorMethods = [ 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ];

Adaptor.Array = Adaptor.Object.extend({
	initialize: function(arr) {
		var self = this,
			patchedArrayProto = [];

		mutatorMethods.forEach(function(methodName) {
			Object.defineProperty(patchedArrayProto, methodName, {
				value: method
			});

			function method() {
				var spliceEquivalent, summary, start,
					original, size, i, index, result;

				// push, pop, shift and unshift can all be represented as a splice operation.
				// this makes life easier later
				spliceEquivalent = util.getSpliceEquivalent(this, methodName, _.toArray(arguments));
				summary = util.summariseSpliceOperation(this, spliceEquivalent);

				// make a copy of the original values
				if (summary != null) {
					start = summary.start;
					original = Array.prototype.slice.call(this, start, !summary.balance ? start + summary.added : void 0);
					size = summary.balance > 0 ? summary.added : original.length;
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
					self.emit("change", index, this[index], original[i]);
				}

				return result;
			};
		});

		// can we use prototype chain injection?
		// http://perfectionkills.com/how-ecmascript-5-still-does-not-allow-to-subclass-an-array/#wrappers_prototype_chain_injection
		if (({}).__proto__) {
			// yes, we can
			arr.__proto__ = patchedArrayProto;
		}

		else {
			// no, we can't
			mutatorMethods.forEach(function(methodName) {
				Object.defineProperty(arr, methodName, {
					value: patchedArrayProto[methodName],
					configurable: true
				});
			});
		}
	}
}, {
	match: function(val) {
		return Array.isArray(val);
	}
});