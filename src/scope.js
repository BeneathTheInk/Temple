var _ = require("underscore"),
	util = require("./util"),
	Events = require("./events"),
	Model = require("./model"),
	Deps = require("./deps");



var Scope =
module.exports = function(model) {
	// convert data to model if isn't one already
	if (!Scope.isScope(model) && !Model.isModel(model)) {
		var data = model;
		model = new Model(_.result(this, "defaults"));
		if (!_.isUndefined(data)) model.set([], data);
	}

	this.models = [];
	this._observers = [];
	this._deps = [];
	this._hidden = {};

	this.addModel(model);
	this.initialize();
}

Scope.extend = util.subclass;
Scope.isScope = function(obj) {
	return obj instanceof Scope;
}

_.extend(Scope.prototype, Events, {
	initialize: function() {},

	createScopeFromPath: function(path) {
		if (!_.isString(path)) throw new Error("Expecting string path.");
		var model = (this.findModel(path) || this).getModel(path);
		return new Scope(model).addModel(this);
	},

	// adds a model to the set
	addModel: function(model) {
		// accept scopes and arrays, but reduce them to models
		if (Scope.isScope(model)) this.addModel(model.models);
		else if (_.isArray(model)) {
			model.forEach(function(m) { this.addModel(m); }, this);
		}

		else {
			if (!Model.isModel(model)) throw new Error("Expecting model.");
			if (!~this.models.indexOf(model)) {
				this.models.push(model);

				// add observers
				this._observers.forEach(function(ob) {
					model.on("change", ob.onChange);
				});

				this.trigger("model:add", model);
			}
		}

		return this;
	},
 
	// removes a previously added model
	removeModel: function(model) {
		if (Scope.isScope(model)) this.removeModel(model.models);
		else if (_.isArray(model)) {
			model.forEach(function(m) { this.removeModel(m); }, this);
		}

		else {
			var index = this.models.indexOf(model);
			if (~index) {
				this.models.splice(index, 1);

				// strip observers
				this._observers.forEach(function(ob) {
					model.off("change", ob.onChange);
				});

				this.trigger("model:remove", model);
			}
		}

		return this;
	},

	// returns the first model whose value at path isn't undefined
	findModel: function(path) {
		return _.find(this.models, function(model) {
			return !_.isUndefined(model.get(path));
		});
	},

	get: function(parts) {
		var val, model;

		parts = util.splitPath(parts);

		if (parts[0] === "this") {
			parts.shift();
			val = this.models[0].get(parts);
		}

		else {
			model = this.findModel(parts);
			if (model != null) val = model.get(parts);

			// check hidden values
			if (_.isUndefined(val) && parts.length) {
				val = util.get(this._hidden, parts);
			}
		}

		// execute functions
		if (_.isFunction(val)) val = val.call(this);

		// always depend
		if (Deps.active) this.depend(parts);

		return val;
	},

	// registers a dependency at path and observes changes
	depend: function(parts) {
		var path = util.joinPathParts(parts),
			dep = this._deps[path];

		// create if doesn't exist
		if (dep == null) {
			dep = this._deps[path] = new Deps.Dependency;
			dep._observer = this.observe(parts, function() { dep.changed(); });
		}

		dep.depend();
		return this;
	},

	// reruns fn anytime dependencies change
	autorun: function(fn) {
		return Deps.autorun(fn.bind(this));
	},

	// calls fn when path changes
	observe: function(path, fn) {
		if (!_.isFunction(fn)) throw new Error("Expecting a function to call on change.");

		var matchParts = _.isArray(path) ? path : util.parsePath(path),
			self = this;

		// remember the observer so we can kill it later
		this._observers.push({
			path: path,
			fn: fn,
			onChange: onChange
		});

		// apply to all existing models
		this.models.forEach(function(m) {
			m.on("change", onChange);
		});
		
		return this;

		function onChange(chg) {
			var keys, newval, oldval, model,
				ngetter, ogetter, parts, part, base, paths, i,
				cmodel, cindex, pmodel, omodel;

			// clone parts so we don't affect the original
			parts = matchParts.slice(0);
			keys = chg.keypath;
			newval = chg.value;
			oldval = chg.oldValue;
			model = chg.model;
			pmodel = model;

			// we need to get the true old and new values based on all the models
			if (chg.type !== "update") {
				cmodel = self.findModel(chg.keypath);

				if (cmodel != null) {
					cindex = self.models.indexOf(cmodel);
					
					if (cmodel === this) {
						omodel = _.find(self.models.slice(cindex + 1), function(model) {
							return !_.isUndefined(model.get(path));
						});

						if (omodel != null) {
							pmodel = omodel.getModel(keys);
							oldval = pmodel.value;
						}
					
					} else if (cindex > self.models.indexOf(this)) {
						pmodel = model;
						model = cmodel.getModel(keys);
						newval = model.value;

					} else return;
				}
			}

			// traverse through cparts
			// a mismatch means we don't need to be here
			for (i = 0; i < keys.length; i++) {
				part = parts.shift();
				if (_.isRegExp(part) && part.test(keys[i])) continue;
				if (part === "**") {
					// look ahead
					if (parts[0] == null || parts[0] !== keys[i + 1]) {
						parts.unshift(part);
					}
					continue;
				}
				if (part !== keys[i]) return;
			}

			paths = [];
			base = util.joinPathParts(keys);

			// generate a list of effected paths
			findAllMatchingPaths.call(this, model, newval, parts, paths);
			findAllMatchingPaths.call(this, pmodel, oldval, parts, paths);
			paths = util.findShallowestUniquePaths(paths);

			// getters for retrieving values at path
			ngetter = function(obj, path) {
				return model.createHandle(obj)("get", path);
			}

			if (model === pmodel) ogetter = ngetter;
			else ogetter = function(obj, path) {
				return pmodel.createHandle(obj)("get", path);
			}
			
			// fire the callback on each path that changed
			paths.forEach(function(keys, index, list) {
				var path, localModel, nval, oval;

				nval = util.get(newval, keys, ngetter),
				oval = util.get(oldval, keys, ogetter);
				if (nval === oval) return;

				fn.call(self, {
					model: model.getModel(keys),
					previousModel: pmodel.getModel(keys),
					path: util.joinPathParts(base, keys),
					type: util.changeType(nval, oval),
					value: nval,
					oldValue: oval
				});
			});
		}
	},

	stopObserving: function(path, fn) {
		var obs;

		if (_.isFunction(path) && fn == null) {
			fn = path;
			path = null;
		}

		if (path == null && fn == null) {
			obs = this._observers;
			this._observers = [];
		}

		else {
			obs = this._observers.filter(function(o) {
				return (path == null || path === o.path) && (fn == null || fn === o.fn);
			});
		}

		obs.forEach(function(o) {
			this.models.forEach(function(m) {
				m.off("change", o.onChange);
			});

			var index = this._observers.indexOf(o);
			if (~index) this._observers.splice(index, 1);
		}, this);

		return this;
	},

	// set a hidden value
	setHidden: function(path, value) {
		if (_.isUndefined(value)) delete this._hidden[path];
		else this._hidden[path] = value;
		return this;
	},

	// cleans up the scope so it can be properly garbage collected
	destroy: function() {
		this.removeModel(this.models.slice(0));
		this.stopObserving();
		this.trigger("destroy");
		return this;
	}
});

// chainable proxy methods
[ "handle", "set", "unset" ]
.forEach(function(method) {
	Scope.prototype[method] = function() {
		var model = this.models[0];
		model[method].apply(model, arguments);
		return this;
	}
});

// proxy methods which don't return this
[ "getModel", "keys", "notify" ]
.forEach(function(method) {
	Scope.prototype[method] = function() {
		var model = this.models[0];
		return model[method].apply(model, arguments);
	}
});

// deeply traverses a value in search of all paths that match parts
function findAllMatchingPaths(model, value, parts, paths, base) {
	if (paths == null) paths = [];
	if (base == null) base = [];

	if (!parts.length) {
		paths.push(base);
		return paths;
	}

	var handle = model.createHandle(value),
		part = parts[0],
		rest = parts.slice(1);

	if (_.isRegExp(part)) {
		handle("keys").forEach(function(k) {
			findAllMatchingPaths.call(this, model.getModel(k), handle("get", k), rest, paths, base.concat(k));
		}, this);
	} else if (part === "**") {
		if (handle("isLeaf")) {
			if (!rest.length) paths.push(base);
			return paths;
		}

		handle("keys").forEach(function(k) {
			var _rest = rest,
				_base = base;

			// look ahead
			if (rest[0] == null || rest[0] !== k) {
				_rest = [part].concat(rest);
				_base = base.concat(k);
			}

			findAllMatchingPaths.call(this, model.getModel(k), handle("get", k), _rest, paths, _base);
		}, this);
	} else {
		findAllMatchingPaths.call(this, model.getModel(part), handle("get", part), rest, paths, base.concat(part));
	}

	return paths;
}