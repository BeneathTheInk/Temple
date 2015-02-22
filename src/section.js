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

	addRow: function(key, data) {
		// remove existing
		this.removeRow(key);

		// add new row
		var row = new Context(this.model);
		row.addData({ $key: key }).addData(data);

		// set up render and mount it
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
		return this.rows[key];
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

	render: function() {
		if (this._path == null) throw new Error("Missing path.");

		var self = this,
			val, isEmpty, inverted, isList,
			rowSort, model, proxy, keys;

		val = this.get(this._path);
		model = new Model(val, this.model);
		proxy = model.getProxyByValue(val);
		inverted = this.isInverted();
		isList = model.callProxyMethod(proxy, val, "isList");

		function getEmptiness() {
			return model.callProxyMethod(proxy, val, "isEmpty");
		}

		Temple.Deps.nonreactive(function() {
			isEmpty = !val || (isList && !getEmptiness())
		});

		if (isEmpty && inverted) {
			if (isList) getEmptiness();
			this.addRow(0, model);
		} else if (!isEmpty && !inverted) {
			if (isList) {
				keys = [];

				this.autorun(function(comp) {
					var nkeys = model.callProxyMethod(proxy, val, "keys");

					// remove removed rows
					_.difference(keys, nkeys).forEach(self.removeRow, self);

					// trick Trackr so autoruns aren't controlled by this one
					Temple.Deps.currentComputation = comp._parent;

					// add added rows
					_.difference(nkeys, keys).forEach(function(key) {
						self.autorun(function(c) {
							this.addRow(key, model.callProxyMethod(proxy, val, "get", key));
							if (!c.firstRun) rowSort.invalidate();
						});
					});
						
					// pretend like nothing happended
					Temple.Deps.currentComputation = comp;

					// the new set of keys
					keys = nkeys;
				});

				// a reactive context that continuously sorts rows
				rowSort = this.autorun(function() {
					var before = null, i, row;

					for (i = keys.length - 1; i >= 0; i--) {
						row = this.getRow(keys[i]);
						if (row == null) continue;
						this.insertBefore(row, before);
						before = row;
					}
				});
			} else {
				this.addRow(0, model);
			}
		} else if (isList) {
			getEmptiness();
		}

		// auto clean
		this.once("invalidate", function() {
			this.removeAllRows();
		});
	}

}, {

	isEmpty: function(model, proxy) {
		if (!model.data) return true;
		if (proxy == null) proxy = model.getProxyByValue(model.data);
		return model.callProxyMethod(proxy, model.data, "isList") &&
			model.callProxyMethod(proxy, model.data, "isEmpty");
	}

});
