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
	this._comps = {};
	this._observers = [];
	this._deps = [];
	this._hidden = {};

	this.addModel(model);
}

Scope.extend = util.subclass;
Scope.isScope = function(obj) {
	return obj instanceof Scope;
}

_.extend(Scope.prototype, Events, {
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

				// add observer
				model.on("change", this._onChange, this);

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

				// strip observer
				model.off("change", this._onChange, this);

				this.trigger("model:remove", model);
			}
		}

		return this;
	},

	// returns the first model whose value at path isn't undefined
	findModel: function(path) {
		var i, models = this.getModels();

		for (var i in models)
			if (models[i].get(path) !== void 0)
				return models[i];

		return null;
	},

	getModels: function() {
		return this.models.slice(0);
	},

	get: function(parts) {
		if (Deps.active) this.depend(parts);
		parts = util.splitPath(parts);

		if (parts[0] === "this") {
			parts.shift();
			return this.models[0].get(parts);
		}

		else {
			var model = this.findModel(parts);
			if (model != null) return model.get(parts);
		}
	},

	// registers a dependency at path and observes changes
	depend: function(parts) {
		var path = util.joinPathParts(parts),
			dep = this._deps[path];

		// create if doesn't exist
		if (dep == null) {
			dep = this._deps[path] = new Deps.Dependency;
			this.observe(parts, dep._observer = function() { dep.changed(); });
		}

		dep.depend();
		return this;
	},

	// runs fn when deps change
	autorun: function(name, fn) {
		if (_.isFunction(name) && fn == null) {
			fn = name;
			name = _.uniqueId("f");
		}

		if (!_.isString(name)) throw new Error("Expecting string for computation identifier.");
		if (!_.isFunction(fn)) throw new Error("Expecting function for computation.");

		this.stopComputation(name);
		var self = this;

		return this._comps[name] = Deps.autorun(function(comp) {
			fn.call(self, comp);
			
			comp.onInvalidate(function() {
				if (comp.stopped && self._comps[name] === comp) {
					delete self._comps[name];
				}
			});
		});
	},

	stopComputation: function(name) {
		if (name == null) {
			_.each(this._comps, function(c) {
				c.stop();
			});

			this._comps = {};
		}

		else if (this._comps[name] != null) {
			this._comps[name].stop();
		}

		return this;
	},

	// calls fn when path changes
	observe: function(path, fn) {
		if (!_.isFunction(fn)) throw new Error("Expecting a function to call on change.");

		var matchParts = _.isArray(path) ? path : util.parsePath(path);

		// remember the observer so we can kill it later
		this._observers.push({
			path: path,
			parts: matchParts,
			fn: fn
		});

		return this;
	},

	stopObserving: function(path, fn) {
		if (path == null && fn == null) {
			this._observers = [];
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
		var scope = this;

		this._observers.forEach(function(ob) {
			var parts, paths, base;

			// clone parts so we don't affect the original
			parts = ob.parts.slice(0);

			// match the beginning of parts
			if (!matchPathStart(chg.keypath, parts)) return;

			// tweak the summary for all the models in scope
			if (!intersectChange.call(scope, model, chg)) return;

			paths = [];
			base = util.joinPathParts(chg.keypath);

			// generate a list of effected paths
			findAllMatchingPaths.call(model, chg.model, chg.value, parts, paths);
			findAllMatchingPaths.call(model, chg.previousModel, chg.oldValue, parts, paths);
			paths = util.findShallowestUniquePaths(paths);
	
			// fire the callback on each path that changed
			paths.forEach(function(keys, index, list) {
				var nval, oval;

				nval = util.get(chg.value, keys, function(obj, path) {
					return chg.model.createHandle(obj)("get", path);
				});

				oval = util.get(chg.oldValue, keys, function(obj, path) {
					return chg.previousModel.createHandle(obj)("get", path);
				});
				
				if (nval === oval) return;

				ob.fn.call(scope, {
					model: chg.model.getModel(keys),
					previousModel: chg.previousModel.getModel(keys),
					keypath: chg.keypath.concat(keys),
					type: util.changeType(nval, oval),
					value: nval,
					oldValue: oval
				});
			});
		});

		this.trigger("change", chg, opts, model);
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

// matchs the start of a keypath to a list of match parts
// parts is modified to the remaining segments that were not matched
function matchPathStart(keys, parts) {
	var i, part;

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
		if (part !== keys[i]) return false;
	}

	return true;
}

// modifies a change summary to incorporate all models in scope
function intersectChange(model, summary) {
	var models = this.getModels(),
		dindex = models.indexOf(model),
		cindex = -1;

	// delta model must exist in models or things go wacky
	if (!~dindex) return false;

	models.some(function(model, index) {
		if (model.get(summary.keypath) !== void 0) {
			cindex = index;
			return true;
		}
	}, model);

	// default previous is the delta model
	summary.previousModel = summary.model;

	switch(summary.type) {
		case "add":
			// if the delta index is after the current index, move along
			// if the delta index is before the current index, something went wrong
			if (dindex !== cindex) return false;

			// find the model after the current one that previously contained the value
			var pmodel = _.find(models.slice(cindex + 1), function(model) {
				return model.get(summary.keypath) !== void 0;
			});

			if (pmodel != null) {
				summary.previousModel = pmodel.getModel(summary.keypath);
				summary.oldValue = summary.previousModel.value;
			}

			break;

		case "update":
			// if the delta index is after the current index, move along
			// if the delta index is before the current index, something went wrong
			if (dindex !== cindex) return false;

			break;

		case "delete":
			// with deletes, only modify the summary if the current model exists
			if (cindex > -1) {
				// if the delta index isn't before the current index, something went wrong
				if ( cindex <= dindex) return false;

				// a delete means the summary model is the delta model
				summary.model = models[cindex].getModel(summary.keypath);
				summary.value = summary.model.value;
			}
	}

	summary.type = util.changeType(summary.value, summary.oldValue);

	return summary;
}

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