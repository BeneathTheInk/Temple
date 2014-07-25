var _ = require("underscore"),
	Binding = require("./binding");

function runIfExists(obj, method) {
	return function() {
		if (typeof obj[method] === "function") {
			return obj[method].apply(obj, arguments);
		}
	}
}

module.exports = Binding.extend({
	constructor: function() {
		// turns a few events into instance methods to make this class more functional
		// but also to match closer to FB's React component API
		["mount","render","invalidate"].forEach(function(evt) {
			var caps = evt[0].toUpperCase() + evt.substr(1);
			this.on(evt + ":before", runIfExists(this, "will" + caps));
			this.on(evt + ":after", runIfExists(this, "did" + caps));
		}, this);

		this.on("stop", runIfExists(this, "didStop"));

		Binding.apply(this, arguments);
	},

	render: function(){},

	mount: function() {
		// stop existing mount
		this.stop();

		var args = arguments, comp;
		this.trigger("mount:before");

		// the autorun computation
		comp = this._comp = this.autorun(function(comp) {
			this.trigger("render:before", comp);

			var bindings = this.render.apply(this, args),
				removeBindings;

			this.trigger("render", comp, bindings);

			if (_.isArray(bindings)) {
				bindings = bindings.map(this.appendChild, this);
				removeBindings = function() { bindings.forEach(this.removeChild, this); };
			}

			else if (bindings != null) {
				bindings = this.appendChild(bindings);
				removeBindings = function() { this.removeChild(bindings); };
			}

			this.trigger("render:after", comp);

			comp.onInvalidate(_.bind(function() {
				this.trigger("invalidate:before", comp);
				if (_.isFunction(removeBindings)) removeBindings.call(this);
				this.trigger("invalidate", comp);
				this.trigger("invalidate:after", comp);

				if (comp.stopped) {
					this.trigger("stop");
					delete this._comp;
				}
			}, this));
		});

		this.trigger("mount", comp);
		this.trigger("mount:after", comp);

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
