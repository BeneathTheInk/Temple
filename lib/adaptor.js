var Temple = require("./temple"),
	_ = require("underscore"),
	util = require("./util"),
	EventEmitter = require("events").EventEmitter;

var Adaptor =
module.exports = util.subclass.call(EventEmitter, {
	constructor: function(value, scope) {
		EventEmitter.call(this);
		this.value = value;
		this.scope = scope;
		this.initialize.apply(this, arguments);
	},

	initialize: function(){},

	keys: function() {
		return Object.keys(this.value);
	},

	get: function(path) {
		return this.value[path];
	},

	enumerate: function(iterator, context) {
		this.keys().forEach(function(key) {
			iterator.call(context, this.get(key), key, this.value);
		}, this);
	},

	set: function(path, value) {
		return this.value[path] = value;
	},

	destroy: function() {}
}, {
	extend: util.subclass,
	match: function(val) {
		return util.isPlainObject(val);
	},
	isAdaptor: function(obj) {
		return obj instanceof Adaptor;
	}
});

var mutatorMethods = [ 'pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift' ];

Adaptor.Array = Adaptor.extend({
	initialize: function(arr) {
		var self = this,
			patchedArrayProto = [];

		mutatorMethods.forEach(function(methodName) {
			Object.defineProperty(patchedArrayProto, methodName, {
				value: method
			});

			function method() {
				var spliceEquivalent, summary,
					original, size, i, index, result;

				// push, pop, shift and unshift can all be represented as a splice operation.
				// this makes life easier later
				spliceEquivalent = util.getSpliceEquivalent(this, methodName, _.toArray(arguments));
				summary = util.summariseSpliceOperation(this, spliceEquivalent);

				// make a copy of the original values
				original = Array.prototype.slice.call(this, summary.start, !summary.balance ? summary.added : void 0);
				size = summary.balance > 0 ? summary.added : original.length;

				// apply the underlying method
				result = Array.prototype[methodName].apply(this, arguments);

				// trigger changes
				for (i = 0; i < size; i++) {
					index = i + summary.start;
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
	},
	enumerate: function(iterator, context) {
		return this.value.forEach(iterator, context);
	}
}, {
	match: function(val) {
		return Array.isArray(val);
	}
})