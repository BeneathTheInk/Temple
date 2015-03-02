var _ = require("underscore"),
	Temple = require("templejs");

// the plugin
module.exports = function() {
	this.addTransition = addTransition;
	this.getTransition = getTransition;
	this.removeTransition = removeTransition;

	this.decorate("intro", function(d, id) {
		var origInsert = d.target.insertNode;
		var self = this;
		var args = _.toArray(arguments).slice(2);

		d.target.insertNode = function() {
			var ctx = this, _args = arguments;
			var tran = self.getTransition(id);
			
			function done() {
				origInsert.apply(ctx, _args);
			}
			
			if (tran != null) {
				tran.apply(self, [{
					intro: true,
					node: d.node,
					target: d.target,
					complete: done
				}].concat(args));
			} else {
				done();
			}
		}

		d.comp.onInvalidate(function() {
			d.target.insertNode = origInsert;
		});
	});

	this.decorate("outro", function(d, id) {
		var origRemove = d.target.removeNode;
		var self = this;
		var args = _.toArray(arguments).slice(2);

		d.target.removeNode = function() {
			var ctx = this, _args = arguments;
			var tran = self.getTransition(id);
			
			function done() {
				d.target.removeNode = origRemove;
				origRemove.apply(ctx, _args);
			}
			
			if (tran != null) {
				tran.apply(self, [{
					intro: false,
					node: d.node,
					target: d.target,
					complete: done
				}].concat(args));
			} else {
				done();
			}
		}
	});
}

function addTransition(id, fn) {
	if (_.isObject(id)) {
		_.each(id, function(v, k) {
			addTransition.call(this, k, v);
		}, this);
		return this;
	}

	if (typeof id !== "string") throw new Error("Expecting a string for the transition ID.");
	if (this._transitions == null) this._transitions = {};
	if (this._transitions[id] != null) throw new Error("A transition with id '" + id + "' already exists.");

	if (typeof fn !== "function") throw new Error("Expecting a function or object for the transition.");

	this._transitions[id] = fn;

	return this;
}

function getTransition(id) {
	if (typeof id !== "string") return;
	var c = this, trans;

	while (c != null) {
		trans = c._transitions;
		if (trans != null && trans[id] != null) return trans[id];
		c = c.parent;
	}
}

function removeTransition(id) {
	var exists = this._transitions[id] != null;
	delete this._transitions[id];
	return exists;
}