var _ = require("underscore");

module.exports = function(options) {
	options = options || {};

	this.add = add;
	this.subtract = subtract;
	this.multiply = multiply;
	this.divide = divide;
	this.increment = increment;
	this.decrement = decrement;
	this.toggle = toggle;
	this.expire = expire;

	if (options.shortnames !== false) {
		this.sub = subtract;
		this.mul = multiply;
		this.div = divide;
		this.incr = increment;
		this.decr = decrement;
	}
}

function add(path, value) {
	return this.set(path, this.get(path, { depend: false }) + value);
}

function subtract(path, value) {
	return this.add(path, -1 * value);
}

function multiply(path, value) {
	return this.set(path, this.get(path, { depend: false }) * value);
}

function divide(path, value) {
	return this.multiply(path, 1 / value);
}

function increment(path) {
	return this.add(path, 1);
}

function decrement(path) {
	return this.add(path, -1);
}

function toggle(path) {
	return this.set(path, !this.get(path, { depend: false }));
}

function expire(path, ttl, fn) {
	var self = this;
	if (this._ttl == null) this._ttl = {};

	// clear existing ttl
	if (_.has(this._ttl, path)) {
		clearTimeout(this._ttl[path]);
		delete this._ttl[path];
	}

	// do nothing if ttl isn't a number
	if (!_.isNumber(ttl) || _.isNaN(ttl) || ttl < 0) return this;

	// set the timeout
	this._ttl[path] = setTimeout(function() {
		self.unset(path);
		delete self._ttl[path];
		if (_.isFunction(fn)) fn.call(self, path);
	}, ttl);

	return this;
}