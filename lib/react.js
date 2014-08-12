var Binding = require("./binding"),
	util = require("./util");

module.exports = Binding.extend({
	constructor: function() {
		// turns a few events into instance methods to make this class more functional
		// but also to match closer to FB's React component API
		["mount","render","invalidate"].forEach(function(evt) {
			var caps = evt[0].toUpperCase() + evt.substr(1);
			this.on(evt + ":before", runIfExists(this, "before" + caps));
			this.on(evt, runIfExists(this, "on" + caps));
			this.on(evt + ":after", runIfExists(this, "after" + caps));
		}, this);

		this.on("stop", runIfExists(this, "onStop"));

		Binding.apply(this);
		this.initialize.apply(this, arguments);
	},

	initialize: function(){},
	render: function(){},

	mount: function() {
		var args = util.toArray(arguments), comp;

		// stop existing mount
		this.stop();
		this.trigger("mount:before", args);

		// the autorun computation
		comp = this._comp = this.autorun(function(comp) {
			this.trigger("render:before", comp, args);

			var bindings = this.render.apply(this, args);
			if (Binding.isBinding(bindings)) bindings = [ bindings ];
			if (!Array.isArray(bindings)) bindings = [];

			this.trigger("render", bindings, comp, args);
			bindings = bindings.map(this.appendChild, this);
			this.trigger("render:after", bindings, comp, args);

			comp.onInvalidate(function() {
				this.trigger("invalidate:before", bindings, comp, args);
				bindings.forEach(this.removeChild, this);
				this.trigger("invalidate", comp, args);
				this.trigger("invalidate:after", comp, args);

				if (comp.stopped) {
					this.trigger("stop", args);
					delete this._comp;
				}
			});
		});

		this.trigger("mount", comp, args);
		this.trigger("mount:after", comp, args);

		return this;
	},

	isMounted: function() {
		return this._comp != null;
	},

	invalidate: function() {
		if (this.isMounted()) this._comp.invalidate();
		return this;
	},

	stop: function() {
		if (this.isMounted()) this._comp.stop();
		return this;
	}
});

function runIfExists(obj, method) {
	return function() {
		if (typeof obj[method] === "function") {
			return obj[method].apply(obj, arguments);
		}
	}
}
