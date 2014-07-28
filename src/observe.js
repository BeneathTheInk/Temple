var _ = require("underscore"),
	Temple = require("templejs"),
	util = require("./util");

module.exports = {
	// registers a dependency at path and observes changes
	depend: function(parts) {
		if (!Temple.Deps.active) return this;
		if (this._deps == null) this._deps = {};

		var path = util.joinPathParts(parts),
			dep = this._deps[path];

		// create if doesn't exist
		if (dep == null) {
			dep = this._deps[path] = new Temple.Dependency;
			this.observe(parts, dep._observer = function(s, opts) {
				// we ignore initial sets because the value didn't really change
				if (!opts.initial) dep.changed();
			});
		}

		dep.depend();
		return this;
	},

	// calls fn when path changes
	observe: function(path, fn) {
		if (!_.isFunction(fn)) throw new Error("Expecting a function to call on change.");
		if (this._observers == null) this._observers = [];
		this.getModel(path); // ensures the model exists

		this._observers.push({
			path: path,
			parts: _.isArray(path) ? path : util.parsePath(path),
			fn: fn
		});

		return this;
	},

	stopObserving: function(path, fn) {
		if (this._observers == null) this._observers = [];

		if (path == null && fn == null) {
			this._observers.splice(0, this._observers.length);
			return this;
		}

		if (_.isFunction(path) && fn == null) {
			fn = path;
			path = null;
		}

		this._observers.filter(function(o) {
			return (path == null || path === o.path) && (fn == null || fn === o.fn);
		}).forEach(function(o) {
			var index = this._observers.indexOf(o);
			if (~index) this._observers.splice(index, 1);
		}, this);

		return this;
	},

	// model onChange event
	_onChange: function(chg, opts, model) {
		// handle all the observers
		if (this._observers != null) {
			this._observers.forEach(function(ob) {
				this._handleObserver(ob, chg, opts, model);
			}, this);
		}

		// pass up changes
		this.trigger("change", chg, opts, model);
	},

	_handleObserver: function(ob, chg, opts, model) {
		var self = this;
		util.findAllChanges(chg, ob.parts, function(nchg) {
			ob.fn.call(self, nchg, opts, model);
		});
	}
}
