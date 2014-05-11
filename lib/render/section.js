var _ = require("underscore"),
	util = require("../util"),
	NODE_TYPE = require("../types"),
	Binding = require("./binding"),
	Deps = require("../deps");

module.exports = Section;

function Section(template, build) {
	this.build = build;
	this.template = template;
	this.inverted = template.type === NODE_TYPE.INVERTED;
	this.rows = [];
	this._scopes = [];
	this._observers = [];
}

Section.isEmpty = function(val) {
	return !val || (_.isArray(val) && !val.length);
}

Section.prototype.update = function(index, scope) {
	var row = this.rows[index];
	if (row == null) row = this.rows[index] = this.build(this.template.children);
	row.forEach(function(row) { row.update(scope); });
	return this;
}

Section.prototype.remove = function(index, howMany) {
	if (index == null) index = 0;
	if (howMany == null) howMany = this.rows.length - index;
	if (howMany < 1) return this;
	
	this.rows.splice(index, howMany).forEach(function(row) {
		_.invoke(row, "destroy");
	});

	return this;
}

Section.prototype.spawnScope = function(val, path, scope) {
	var nscope = scope.spawn(val, path),
		self = this,
		closeScope;

	closeScope = _.once(function() {
		nscope.close();
		var index = self._scopes.indexOf(closeScope);
		if (index > -1) self._scopes.splice(index, 1);
	});

	nscope.on("close", closeScope);
	this._scopes.push(closeScope);
	if (Deps.active) Deps.currentComputation.onInvalidate(closeScope);

	return nscope;
}

Section.prototype.reactToPath = function(path, scope) {
	path = util.joinPath(path, "*");

	var dep = new Deps.Dependency,
		fn = function() { dep.changed(); },
		self = this,
		killObserver;

	killObserver = _.once(function() {
		scope.stopObserving(path, fn);
		var index = self._observers.indexOf(killObserver);
		if (index > -1) self._observers.splice(index, 1);
	});
	
	dep.depend();
	scope.observe(path, fn);
	this._observers.push(killObserver);
	if (Deps.active) Deps.currentComputation.onInvalidate(killObserver);

	return this;
}

Section.prototype.process = function(scope) {
	var path = this.template.value,
		val = scope.get(path);

	this.reactToPath(path, scope);
	
	if (Section.isEmpty(val)) {
		if (this.inverted) {
			this.update(0, this.spawnScope(val, path, scope));
			this.remove(1);
		} else {
			this.remove(0);
		}
	} else {
		if (this.inverted) {
			this.remove(0);
		} else {
			if (_.isArray(val)) {
				val.forEach(function(v, index) {
					var nscope = this.spawnScope(v, util.joinPath(path, index), scope);
					nscope.hidden.$index = index;
					this.update(index, nscope);
				}, this);

				this.remove(val.length);
			} else {
				this.update(0, this.spawnScope(val, path, scope));
				this.remove(1);
			}
		}
	}

	return this;
}

// number of rows
Section.prototype.length = function() {
	return this.rows.length;
}

Section.prototype.destroy = function() {
	this.remove(0);
	
	var scopes = this._scopes;
	this._scopes = [];
	scopes.forEach(function(close) { close(); });

	var observers = this._observers;
	this._observers = [];
	observers.forEach(function(kill) { kill(); });

	return this;
}

// iterate cells
Section.prototype.forEach = function(it, ctx) {
	_.flatten(this.rows).forEach(it, ctx);
	return this;
}