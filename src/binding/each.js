var _ = require("underscore"),
	ReactScope = require("./reactscope"),
	React = require("./react"),
	util = require("../util"),
	Deps = require("../deps");

module.exports = ReactScope.extend({
	constructor: function(onRow, data) {
		if (!_.isFunction(onRow))
			throw new Error("Expecting function for onRow.");

		this.onRow = onRow;
		this.rows = {};

		ReactScope.call(this, data);
	},

	getRow: function(key) {
		if (this.rows[key] == null) {
			var row, model, self = this;
			model = this.getModel(key);
			row = this.rows[key] = new React();
			row.render = function() { return self.onRow(model, key); }
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
		return ReactScope.prototype._detach.apply(this, arguments);
	},

	find: function(selector) {
		var el = null;

		_.some(this.rows, function(row) {
			return !!(el = row.find(selector));
		});

		return el;
	},

	findAll: function(selector) {
		var els = [];

		_.each(this.rows, function(row) {
			els = els.concat(row.findAll(selector));
		});

		return els;
	}

});