var _ = require("underscore"),
	Binding = require("./index"),
	util = require("../util"),
	Context = require("./context"),
	Deps = require("../deps"),
	Scope = require("../scope"),
	Model = require("../model");

var Each =
module.exports = Binding.extend({
	constructor: function(path, body) {
		if (!_.isString(path))
			throw new Error("Expecting string path.");

		if (!_.isFunction(body))
			throw new Error("Expecting function for body.");

		this.path = path;
		this.body = function() {
			var args = arguments, ctx = this;
			return Deps.nonreactive(function() {
				return body.apply(ctx, args);
			});
		}
		this.rows = {};
		this.placeholder = document.createComment(_.uniqueId("$"));

		Binding.call(this);
	},

	addChild: function() {
		throw new Error("Each bindings can't have children.");
	},

	updateRow: function(key, scope) {
		var row, nscope;

		row = this.rows[key];
		if (row == null) {
			row = this.rows[key] = {
				binding: new Binding(this.body(key))
			};
		}

		this.clearScope(row);
		nscope = row.scope = scope.createScopeFromPath(util.joinPathParts(this.path, key));
		nscope.setHidden("$key", key);
		row.binding.render(nscope);

		return this;
	},

	refreshRows: function() {
		_.each(this.rows, function(row) {
			var parent = this.placeholder.parentNode;
			if (parent != null) row.binding.appendTo(parent, this.placeholder);
		}, this);
		
		return this;
	},

	removeRow: function(key) {
		var row = this.rows[key];
		
		if (row != null) {
			this.clearScope(row);
			row.binding.destroy();
			delete this.rows[key];
		}

		return this;
	},

	removeAllRows: function(key) {
		_.keys(this.rows).forEach(this.removeRow, this);
		this.rows = {};
		return this;
	},

	clearScope: function(row) {
		if (row.scope) {
			row.scope.destroy();
			delete row.scope;
		}

		return this;
	},

	dependOn: function(scope) {
		if (this._stopDepending) this._stopDepending();
		
		var parts, onChange;
		parts = util.splitPath(this.path);

		onChange = (function(s) {
			var keypath = util.splitPath(s.path),
				extra;

			if (!util.arrayStartsWith(keypath, parts)) return;
			extra = keypath.slice(parts.length);
			
			if (!extra.length) {
				this.render(scope);
			} else if (s.type === "delete") {
				this.removeRow(extra[0]);
			} else {
				this.updateRow(extra[0], scope);
				this.refreshRows();
			}
		}).bind(this);

		scope.observe(this.path, onChange);
		scope.observe(util.joinPathParts(this.path, "*"), onChange);

		this._stopDepending = (function() {
			scope.stopObserving(onChange);
			delete this._stopDepending;
		}).bind(this);

		return this;
	},

	render: function(scope) {
		var model = (scope.findModel(this.path) || scope).getModel(this.path),
			keys = model.keys(),
			toRemove = [];

		this.dependOn(scope);

		keys.forEach(function(k) {
			this.updateRow(k, scope);
		}, this);

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
		this.refreshRows();
		return this;
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
	},

	destroy: function() {
		if (this._stopDepending) this._stopDepending();
		
		this.removeAllRows();
		var parent = this.placeholder.parentNode;
		if (parent != null) parent.removeChild(this.placeholder);

		return Binding.prototype.destroy.apply(this, arguments);
	}
});