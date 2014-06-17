var _ = require("underscore"),
	util = require("./util"),
	Events = require("./events"),
	Model = require("./model"),
	Deps = require("./deps");

var Scope =
module.exports = function Scope(model) {
	this.children = [];
	this._comps = {};
	this._observers = [];
	this._deps = [];

	// event that proxies changes to all children
	this.on("change", function() {
		var args = _.toArray(arguments);
		this.children.forEach(function(child) {
			child._onChange.apply(child, args);
		});
	});

	// set the initial data
	this.setModel(model);
}

Scope.extend = util.subclass;
Scope.isScope = function(obj) {
	return obj instanceof Scope;
}

_.extend(Scope.prototype, Events, {
	setModel: function(model) {
		if (!Model.isModel(model)) {
			var data = model;
			model = new Model(_.result(this, "defaults"));
			if (!_.isUndefined(data)) model.set([], data);
		}

		// clear existing model
		this.clearModel();
		
		// add the new one
		this.model = model;
		model.on("change", this._onChange, this);
		this.trigger("model", model);

		return this;
	},

	clearModel: function() {
		if (this.model != null) {
			model.off("change", this._onChange);
			delete this.model;
			this.trigger("model");
		}

		return this;
	},

	addChild: function(child) {
		if (_.isArray(child)) {
			child.forEach(this.addChild, this);
			return this;
		}

		if (!Scope.isScope(child))
			throw new Error("Expected array or instance of Scope for children.");

		// ensure the binding is not already a child
		if (~this.children.indexOf(child)) return this;

		// remove from existing parent
		if (child.parent != null) child.parent.removeChild(child);

		this.children.push(child);
		child.parent = this;

		this.trigger("child:add", child);
		child.trigger("parent:add", this);

		return this;
	},

	removeChild: function(child) {
		if (_.isArray(child)) {
			child.forEach(this.removeChild, this);
			return this;
		}

		var index = this.children.indexOf(child);
		
		if (~index) {
			this.children.splice(index, 1);
			child.trigger("parent:remove", this);
			this.trigger("child:remove", child);
			if (child.parent === this) delete child.parent;
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
		var models = [],
			c = this;
		
		while (c != null) {
			if (c.model) models.push(c.model);
			c = c.parent;
		}

		return models;
	},

	get: function(parts) {
		if (Deps.active) this.depend(parts);
		parts = util.splitPath(parts);
		var model = this.findModel(parts);
		if (model != null) return model.get(parts);
	},

	keys: function(path) {
		return (this.findModel(path) || this).keys(path);
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
	_onChange: function() {
		var args = _.toArray(arguments);

		// handle all the observers
		this._observers.forEach(function(ob) {
			handleObserver.apply(this, [ob].concat(args));
		}, this);

		// pass up changes
		this.trigger.apply(this, ["change"].concat(args));
	}
});

// chainable proxy methods
[ "handle", "set", "unset" ]
.forEach(function(method) {
	Scope.prototype[method] = function() {
		var model = this.model;
		model[method].apply(model, arguments);
		return this;
	}
});

// proxy methods which don't return this
[ "getModel", "notify" ]
.forEach(function(method) {
	Scope.prototype[method] = function() {
		var model = this.model;
		return model[method].apply(model, arguments);
	}
});

// handles an observer and a change summary
function handleObserver(ob, chg, opts, model) {
	var parts, paths, base, getter,
		scope = this;

	// clone parts so we don't affect the original
	parts = ob.parts.slice(0);

	// match the beginning of parts
	if (!matchPathStart(chg.keypath, parts)) return;

	paths = [];
	base = util.joinPathParts(chg.keypath);
	getter = function(obj, path) {
		return chg.model.createHandle(obj)("get", path);
	}

	// generate a list of effected paths
	findAllMatchingPaths(chg.model, chg.value, parts, paths);
	findAllMatchingPaths(chg.model, chg.oldValue, parts, paths);
	paths = util.findShallowestUniquePaths(paths);

	// fire the callback on each path that changed
	paths.forEach(function(keys, index, list) {
		var nval, oval, summary;

		nval = util.get(chg.value, keys, getter);
		oval = util.get(chg.oldValue, keys, getter);
		if (nval === oval) return;

		var summary = {
			model: chg.model.getModel(keys),
			keypath: chg.keypath.concat(keys),
			type: util.changeType(nval, oval),
			value: nval,
			oldValue: oval
		};

		if (intersectChange.call(scope, model, summary)) ob.fn.call(scope, summary);
	});
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
			findAllMatchingPaths(model.getModel(k), handle("get", k), rest, paths, base.concat(k));
		});
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

			findAllMatchingPaths(model.getModel(k), handle("get", k), _rest, paths, _base);
		});
	} else {
		findAllMatchingPaths(model.getModel(part), handle("get", part), rest, paths, base.concat(part));
	}

	return paths;
}