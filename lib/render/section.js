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

Section.prototype.spawnScope = function(path, scope) {
	var parts = util.splitPath(path),
		child = scope.getScope(path),
		nscope = child.clone(),
		self = this;
	
	// fallback on parent
	nscope.fallback(scope);

	// but listen to child
	child.on("change", onChange);

	// clean up
	this._scopes.push(disconnect);
	if (Deps.active) Deps.currentComputation.onInvalidate(disconnect);

	return nscope;

	function onChange(chg) {
		nscope.set(chg.keypath, chg.value, { silent: true, reset: true });
		nscope.emit("change", _.extend({}, chg, { scope: nscope }));
	}

	function disconnect() {
		child.removeListener("change", onChange);
		var index = self._scopes.indexOf(disconnect);
		if (index > -1) self._scopes.splice(index, 1);
	}
}

Section.prototype.process = function(scope) {
	var path = this.template.value,
		val = scope.get(path);

	scope.depend([ path, "*" ]);
	
	if (Section.isEmpty(val)) {
		if (this.inverted) {
			this.update(0, this.spawnScope(path, scope));
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
					var nscope = this.spawnScope(util.joinPathParts(path, index), scope);
					nscope.hidden.$index = index;
					this.update(index, nscope);
				}, this);

				this.remove(val.length);
			} else {
				this.update(0, this.spawnScope(path, scope));
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

	return this;
}

// iterate cells
Section.prototype.forEach = function(it, ctx) {
	_.flatten(this.rows).forEach(it, ctx);
	return this;
}