

module.exports = Context;

function Context(value, parent, temple) {
	this.value = value;
	this.parent = parent;
	this.temple = temple;
	this.hidden = {};
}

Context.prototype.find = function(path, ctx) {
	if (ctx == null) ctx = this;
	val = this.temple._get(this.value, path, ctx);
	if (val == null) val = this.temple._get(this.hidden, path, ctx);
	return val;
}

Context.prototype.get = function(path) {
	var ctx = this, val;

	// don't traverse parents if specified
	if (typeof path === "string" && (path.indexOf(".") === 0 || path === "this" || path.indexOf("this.") === 0)) {
		if (path.indexOf("this") === 0) path = path.substr(4);
		if (path.indexOf(".") === 0) path = path.substr(1);
		val = this.find(path);
	} else {
		while (ctx != null) {
			val = ctx.find(path, this);
			if (val != null) break;
			ctx = ctx.parent;
		}
	}

	return val;
}

Context.prototype.spawn = function(val) {
	return new Context(val, this, this.temple);
}