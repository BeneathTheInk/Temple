var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util"),
	Context = require("./context"),
	Scope = require("../scope"),
	Model = require("../model");

var Each =
module.exports = Binding.extend({
	constructor: function(value, body) {
		if (!_.isFunction(value)) {
			var val = value;
			value = function() { return val; }
		}

		if (!_.isFunction(body))
			throw new Error("Expecting function for body.");

		this.compute = value;
		this.body = body;
		this.rows = {};
		this.placeholder = document.createComment(_.uniqueId("$"));

		this.once("destroy", function() {
			this.removeAllRows();
			var parent = this.placeholder.parentNode;
			if (parent != null) parent.removeChild(this.placeholder);
		});

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Each bindings can't have children.");
	},

	buildRow: function(key, model) {
		return new Context(model, this.body(key));
	},

	updateRow: function(key, model, scope) {
		var row = this.rows[key];
		if (row == null) row = this.rows[key] = this.buildRow(key, model);

		var nscope = new Scope(model).addModel(scope).setHidden("$key", key);
		row.render(nscope);
		this.refreshRow(row);

		return this;
	},

	refreshRow: function(row) {
		if (_.isNumber(row) || _.isString(row)) row = this.rows[row];

		var parent = this.placeholder.parentNode;
		if (parent != null) row.appendTo(parent, this.placeholder);

		return this;
	},

	refreshAllRows: function() {
		_.each(this.rows, this.refreshRow, this);
		return this;
	},

	removeRow: function(key) {
		var row = this.rows[key];
		
		if (row != null) {
			delete this.rows[key];
			row.destroy();
		}

		return this;
	},

	removeRowsExcept: function() {
		var keys = _.flatten(_.toArray(arguments)),
			toRemove = [];

		_.keys(this.rows).filter(function(k) {
			return !_.contains(keys, k);
		}).forEach(function(k) {
			this.removeRow(k);
		}, this);

		return this;
	},

	removeAllRows: function(key) {
		_.keys(this.rows).forEach(this.removeRow, this);
		return this;
	},

	render: function(scope) {
		if (this._comp != null) this._comp.stop();
		this._comp = this.autorun(function(comp) {
			var model = this.compute(scope);
			if (!Model.isModel(model)) model = new Model(model);
			
			var keys = model.keys();
			keys.forEach(function(k) {
				this.updateRow(k, model.getModel(k), scope);
			}, this);

			this.removeRowsExcept(keys);
		});

		return this;
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.refreshAllRows();
		return this;
	}
});