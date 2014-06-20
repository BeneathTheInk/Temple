var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util"),
	Deps = require("../deps");

module.exports = Binding.Scope.extend({
	constructor: function(onRow, data) {
		if (!_.isFunction(onRow))
			throw new Error("Expecting function for onRow.");

		this.onRow = onRow;
		this.rows = {};

		Binding.Scope.call(this, data);
	},

	getRow: function(key) {
		if (this.rows[key] == null) {
			var row, self = this;
			row = this.rows[key] = new Binding.Scope(this.getModel(key));
			row.render = function() { return self.onRow(this, key); }
			this.addChild(row);
		}
		
		return this.rows[key];
	},

	removeRow: function(key) {
		var row = this.rows[key];
		
		if (row != null) {
			this.removeChild(row);
			delete this.rows[key];
		}

		return this;
	},

	removeAllRows: function(key) {
		_.keys(this.rows).forEach(this.removeRow, this);
		this.rows = {};
		return this;
	},

	refreshNodes: function() {
		var keys = this.keys(),
			rows = keys.map(this.getRow, this),
			parent = this.placeholder.parentNode,
			self = this;

		_.keys(this.rows).filter(function(k) {
			return !_.contains(keys, k);
		}).forEach(function(k) {
			this.removeRow(k);
		}, this);

		if (this.isMounted() && parent != null) {
			rows.forEach(function(row) {
				row.appendTo(parent, this.placeholder);
			}, this);
		}

		return this;
	},

	_mount: function() {
		this.observe("", this.refreshNodes);
		this.observe("*", this.refreshNodes);
		this.refreshNodes();
	},

	_detach: function() {
		this.stopObserving(this.refreshNodes);
		return Binding.Scope.prototype._detach.apply(this, arguments);
	},

	find: function(selector) {
		var el = null;

		_.some(this.rows, function(row) {
			return !!(el = row.binding.find(selector));
		});

		return el;
	},

	findAll: function(selector) {
		var els = [];

		_.each(this.rows, function(row) {
			els = els.concat(row.binding.findAll(selector));
		});

		return els;
	}

});