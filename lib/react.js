var _ = require("underscore"),
	Binding = require("./binding");

module.exports = Binding.extend({
	render: function(){},

	mount: function() {
		if (this.isMounted()) return this;

		var args = arguments, comp;
		this.trigger("mount:before");
		
		comp = this._comp = this.autorun(function(comp) {
			this.trigger("render:before");

			var bindings = this.render.apply(this, args),
				removeBindings;

			if (_.isArray(bindings)) {
				this.trigger.apply(this, ["render"].concat(bindings));
				bindings = bindings.map(this.appendChild, this);
				removeBindings = function() { bindings.forEach(this.removeChild, this); };
			}

			else if (bindings != null) {
				this.trigger("render", bindings);
				bindings = this.appendChild(bindings);
				removeBindings = function() { this.removeChild(bindings); };
			}

			else {
				this.trigger("render", null);
				removeBindings = function(){};
			}

			this.trigger("render:after");

			comp.onInvalidate(_.bind(function() {
				removeBindings.call(this);
				this.trigger("invalidate");
				
				if (comp.stopped) {
					this.trigger("stop");
					delete this._comp;
				}
			}, this));
		});

		this.trigger("mount", comp);
		this.trigger("mount:after");

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
	},

	detach: function() {
		this.stop();
		Binding.prototype.detach.apply(this, arguments);
	}
});