var _ = require("underscore"),
	Temple = require("templejs"),
	util = require("./util"),
	Model = require("./model"),
	Context = require("./context");

var Section =
module.exports = Context.extend({
	constructor: function() {
		this.rows = {};
		Context.apply(this, arguments);
	},

	invert: function(val) {
		if (!_.isBoolean(val)) val = !this._inverted;
		this._inverted = val;
		return this;
	},

	isInverted: function() {
		return !!this._inverted;
	},

	addRow: function(key, row) {
		if (!Context.isContext(row))
			throw new Error("Rows can only be instances of Context.");

		this.removeRow(key);
		this.rows[key] = row;
		this.appendChild(row);
		row.mount(key);

		return this;
	},

	hasRow: function(key) {
		return this.getRow() != null;
	},

	getRow: function(key) {
		return this.rows[key] || null;
	},

	removeRow: function(key) {
		if (this.rows[key] == null) return this;

		var row = this.rows[key];
		row.stop();
		this.removeChild(row);
		delete this.rows[key];

		return this;
	},

	removeAllRows: function() {
		Object.keys(this.rows).forEach(this.removeRow, this);
		return this;
	},

	render: function(path, onRow) {
		var self = this,
			omodel, val, isEmpty, inverted, observer,
			rowSort, model, createRow;

		omodel = this.findModel(path);
		val = omodel.get();
		
		if (_.isFunction(val)) {
			val = val.call(this);
			model = new Model(val);
			omodel.getAllProxies().reverse().forEach(model.registerProxy, model);
		} else {
			model = omodel;
		}

		isEmpty = Section.isEmpty(model);
		inverted = this.isInverted();

		createRow = _.bind(function(model, key) {
			var row = new Context(model, this);
			row.render = onRow;
			this.addRow(key, row);
			return row;
		}, this);

		if (isEmpty && inverted) {
			if (model.proxy("isArray")) model.depend("length");
			createRow(model, 0);
		} else if (!isEmpty && !inverted) {
			if (model.proxy("isArray")) {
				// create rows
				model.keys().forEach(function(key) {
					createRow(model.getModel(key), key);
				});

				// a reactive context that continuously sorts rows
				rowSort = this.autorun(function() {
					var before = null;

					model.keys().reverse().forEach(function(key) {
						var row = this.getRow(key);
						if (row == null) return;
						this.insertBefore(row, before);
						before = row;
					}, this);
				});

				// watch for row changes and invalidate the row update context
				model.observe("*", observer = function(s) {
					var key = s.keypath[0];
					if (key == null) return;

					if (s.type === "delete") self.removeRow(key);
					else if (!self.hasRow(key) && _.contains(model.keys(), key)) createRow(s.model, key);
					else return;

					rowSort.invalidate();
				});
			} else {
				createRow(model, 0);
			}
		} else if (model.proxy("isArray")) {
			model.depend("length");
		}

		// auto clean
		this.once("invalidate", function() {
			this.removeAllRows();
			if (omodel !== model) model.cleanProxyTree();
			if (observer != null) this.stopObserving(observer);
		});
	}
}, {
	isEmpty: function(model) {
		return !model.value || (model.proxy("isArray") && !model.get("length"));
	}
});
