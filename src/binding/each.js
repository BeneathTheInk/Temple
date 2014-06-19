var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util"),
	Model = require("../model");

module.exports = Binding.extend({
	constructor: function(body, data) {
		if (!_.isFunction(body))
			throw new Error("Expecting function for body.");

		this.body = body;
		this.rows = {};
		this.placeholder = document.createComment(_.uniqueId("$"));

		Binding.call(this, data);
	},

	updateRow: function(key) {
		if (this.rows[key] == null) {
			var model = (this.findModel() || this).getModel(key),
				row = this.rows[key] = new Binding(model);
			
			this.body(row, key);
			this.addChild(row);
		}
		
		return this.rows[key];
	},

	refreshRows: function() {
		var parent = this.placeholder.parentNode;
		
		if (parent != null) {
			var keys = this.keys();
			
			keys.forEach(function(key) {
				var row = this.updateRow(key);
				row.paint(parent, this.placeholder);
			}, this);

			_.keys(this.rows).filter(function(k) {
				return !_.contains(keys, k);
			}).forEach(function(k) {
				this.removeRow(k);
			}, this);
		}
		
		return this;
	},

	removeRow: function(key) {
		var row = this.rows[key];
		
		if (row != null) {
			row.detach();
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

	mount: function() {
		this.observe("", this.refreshRows);
		this.observe("*", this.refreshRows);

		this.once("detach", function() {
			this.stopObserving("", this.refreshRows);
			this.stopObserving("*", this.refreshRows);
		});

		return Binding.prototype.mount.apply(this, arguments);
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.refreshRows();
		this.trigger("append", parent, before);
		return this;
	},

	detach: function() {
		this.removeAllRows();
		var parent = this.placeholder.parentNode;
		if (parent != null) parent.removeChild(this.placeholder);
		return Binding.prototype.detach.apply(this, arguments);
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