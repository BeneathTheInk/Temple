var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util");

module.exports = Binding.extend({
	constructor: function(path, body) {
		if (!_.isString(path))
			throw new Error("Expecting string path.");

		if (!_.isFunction(body))
			throw new Error("Expecting function for body.");

		this.path = path;
		this.body = body;
		this.rows = {};
		this.placeholder = document.createComment(_.uniqueId("$"));

		Binding.call(this);
	},

	appendChild: function() {
		throw new Error("HTML bindings can't have children.");
	},

	updateRow: function(key) {
		if (this.rows[key] == null) {
			var path = util.joinPathParts(this.path, key),
				model = (this.findModel(path) || this).getModel(path),
				children = this.body(model, key),
				row = this.rows[key] = new Binding(model);
				
			if (children != null) row.appendChild(children);
		}
		
		return this;
	},

	refreshRows: function() {
		var parent = this.placeholder.parentNode;
		
		if (parent != null) _.each(this.rows, function(row) {
			row.appendTo(parent, this.placeholder);
		}, this);
		
		return this;
	},

	removeRow: function(key) {
		var row = this.rows[key];
		
		if (row != null) {
			row.detach();
			delete this.rows[key];
		}

		return this;
	},

	removeAllRows: function(key) {
		_.keys(this.rows).forEach(this.removeRow, this);
		this.rows = {};
		return this;
	},

	autoUpdate: function() {
		if (this._updating) return;
		this._updating = true;

		var parts = util.splitPath(this.path);

		function onChange(s) {
			if (!util.arrayStartsWith(s.keypath, parts)) return;
			var extra = s.keypath.slice(parts.length);
			
			if (!extra.length) {
				this.render();
			} else if (s.type === "delete") {
				this.removeRow(extra[0]);
			} else if (_.contains(this.keys(parts), extra[0])) {
				this.updateRow(extra[0]);
				this.refreshRows();
			}
		}

		this.observe(this.path, onChange);
		this.observe(util.joinPathParts(this.path, "*"), onChange);

		this.once("detach", function() {
			this.stopObserving(onChange);
			delete this._updating;
		});

		return this;
	},

	render: function() {
		var model = (this.findModel(this.path) || this).getModel(this.path),
			keys = model.keys(),
			toRemove = [];

		this.autoUpdate();

		keys.forEach(this.updateRow, this);

		// remove all rows except for keys
		_.keys(this.rows).filter(function(k) {
			return !_.contains(keys, k);
		}).forEach(function(k) {
			this.removeRow(k);
		}, this);

		// update all positions
		this.refreshRows();

		return this;
	},

	appendTo: function(parent, before) {
		parent.insertBefore(this.placeholder, before);
		this.render();
		return Binding.prototype.appendTo.apply(this, arguments);
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