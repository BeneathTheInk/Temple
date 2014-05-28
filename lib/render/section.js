var _ = require("underscore"),
	util = require("../util"),
	NODE_TYPE = require("../types"),
	Binding = require("./binding"),
	Deps = require("../deps"),
	Scope = require('../scope');

module.exports = Section;

function Section(template, build) {
	this.build = build;
	this.template = template;
	this.inverted = template.type === NODE_TYPE.INVERTED;
	this.rows = [];
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

Section.prototype.spawnScope = function(model, scope) {
	// console.log(model.value);
	var nscope = new Scope(model);
	nscope.addModel(scope);
	return nscope;
}

Section.prototype.process = function(scope) {
	var path = this.template.value,
		model = scope.findModel(path),
		val;

	scope.depend(util.joinPathParts(path, "*"));

	if (model != null) model = model.getModel(path);
	else model = scope.getModel(path);
	val = model.get();
	
	if (Section.isEmpty(val)) {
		if (this.inverted) {
			this.update(0, this.spawnScope(model, scope));
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
					var nscope = this.spawnScope(model.getModel(index), scope);
					nscope.setHidden("$index", index);
					this.update(index, nscope);
				}, this);

				this.remove(val.length);
			} else {
				this.update(0, this.spawnScope(model, scope));
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
	return this;
}

// iterate cells
Section.prototype.forEach = function(it, ctx) {
	_.flatten(this.rows).forEach(it, ctx);
	return this;
}