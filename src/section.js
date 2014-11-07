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

	setPath: function(path) {
		this._path = path;
		return this;
	},

	onRow: function(fn) {
		if (!_.isFunction(fn))
			throw new Error("Expecting function for row handler.");

		this._onRow = fn;
		return this;
	},

	addRow: function(key, model) {
		// remove existing
		this.removeRow(key);

		// add new row
		var row = new Context(model, this.parentContext || this);
		row.render = this._onRow;
		this.rows[key] = row;
		this.appendChild(row);
		row.mount(key);

		return row;
	},

	hasRow: function(key) {
		return this.getRow(key) != null;
	},

	getRow: function(key) {
		return this.rows[key] || null;
	},

	removeRow: function(key) {
		if (this.rows[key] == null) return this;

		var row = this.rows[key];
		row.clean();
		this.removeChild(row);
		delete this.rows[key];

		return this;
	},

	removeAllRows: function() {
		Object.keys(this.rows).forEach(this.removeRow, this);
		return this;
	},

	render: function() {
		if (this._path == null) throw new Error("Missing path.");

		var self = this,
			val, isEmpty, inverted, observer,
			rowSort, model, ctx;

		ctx = this.parentContext || this;
		val = ctx.get(this._path);

		Temple.Deps.nonreactive(function() {
			model = new Model(val);
			ctx.getAllProxies().reverse().forEach(model.registerProxy, model);
		
			isEmpty = Section.isEmpty(model);
			inverted = this.isInverted();
		}, this);

		if (isEmpty && inverted) {
			if (model.proxy("isArray")) model.depend("length");
			this.addRow(0, model);
		} else if (!isEmpty && !inverted) {
			if (model.proxy("isArray")) {
				// create rows
				model.keys().forEach(function(key) {
					this.addRow(key, model.getModel(key));
				}, this);

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
					else if (!self.hasRow(key) && _.contains(model.keys(), key)) self.addRow(key, s.model);
					else return;

					rowSort.invalidate();
				});
			} else {
				this.addRow(0, model);
			}
		} else if (model.proxy("isArray")) {
			model.depend("length");
		}

		// auto clean
		this.once("invalidate", function() {
			this.removeAllRows();
			if (observer != null) model.stopObserving(observer);
			model.cleanProxyTree();
		});
	}
}, {
	isEmpty: function(model) {
		return !model.value || (model.proxy("isArray") && !model.get("length"));
	}
});
