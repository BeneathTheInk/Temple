var _ = require("underscore"),
	NODE_TYPE = require("../types"),
	Binding = require("./binding");

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

Section.prototype.destroy = function(index, howMany) {
	if (index == null) index = 0;
	if (howMany == null) howMany = this.rows.length - index;
	if (howMany < 1) return this;
	
	this.rows.splice(index, howMany).forEach(function(row) {
		_.invoke(row, "destroy");
	});

	return this;
}

Section.prototype.process = function(scope) {
	var val = scope.get(this.template.value);
	
	if (Section.isEmpty(val)) {
		if (this.inverted) {
			this.update(0, scope.spawn(val));
			this.destroy(1);
		} else {
			this.destroy(0);
		}
	} else {
		if (this.inverted) {
			this.destroy(0);
		} else {
			if (_.isArray(val)) {
				val.forEach(function(v, index) {
					var nscope = scope.spawn(v);
					nscope.hidden.$index = index;
					this.update(index, nscope);
				}, this);

				this.destroy(val.length);
			} else {
				this.update(0, scope.spawn(val));
				this.destroy(1);
			}
		}
	}
}

// number of items in a row
Section.prototype.width = function() {
	return this.template.children.length;
}

// number of rows
Section.prototype.height = function() {
	return this.rows.length;
}