import * as _ from "underscore";
import Trackr from "trackr";
import Context from "./context";
import merge from "plain-merge";
import { patchElement } from "./idom";
import { load as loadPlugin } from "./plugins";
import assignProps from "assign-props";

var View = Context.extend({
	constructor: function(data, parent, options) {
		if (!Context.isContext(parent)) {
			options = parent;
			parent = null;
		}

		this.options = options = options || {};

		// load initial data
		var defaults = _.result(this, "initialState") || _.result(this, "defaults");
		data = merge.extend({}, defaults, data);

		// create element from tag name
		let tag = _.result(this, "tagName");
		if (!tag) throw new Error("Missing tag name.");
		this.el = document.createElement(this.extends || tag, this.extends ? tag : null);
		this._renderContext = this;

		// load plugins that the class loaded
		if (this.constructor._loaded_plugins) {
			for (let fn of this.constructor._loaded_plugins) {
				this.use(fn);
			}
		}

		// call the context constructor
		Context.call(this, data, parent, options);

		// initialize with options
		this.initialize.call(this, options);
	},

	initialize: function(){},

	autorun: function(fn, options) {
		let comp = Trackr.autorun(fn.bind(this), options);
		comp.onStop(this.off.bind(this, "stop", comp.stop));
		this.on("stop", comp.stop, comp);
		return comp;
	},

	// a generalized reactive workflow helper
	mount: function() {
		let self = this;
		let args = arguments;

		Trackr.nonreactive(function() {
			// stop existing mount
			self.stop();

			// the first event in the cycle, before everything else
			self.trigger("mount:before");
		});

		// the autorun computation
		Trackr.autorun(function(comp) {
			self.comp = comp;
			self._mount.apply(self, args);
			self.trigger("mount");

			// auto clean up
			comp.onInvalidate(function() {
				// remaining invalidate events
				self.trigger("invalidate");

				// detect if the computation stopped
				if (comp.stopped) {
					delete self.comp;
					self.trigger("stop");
				}
			});
		});

		// remaining mount events happen after the first render
		Trackr.nonreactive(function() {
			self.trigger("mount:after");
		});

		return this;
	},

	stop: function() {
		if (this.comp) this.comp.stop();
		return this;
	},

	_mount: function() {
		let ctx = this._renderContext;
		let args = [ctx].concat(_.toArray(arguments));
		patchElement(this.el, () => {
			this.trigger("render:before", ctx);
			this.render.apply(this, args);
			this.trigger("render", ctx);
			this.trigger("render:after", ctx);
		});
	},

	// attach + mount
	attach: function(parent, before) {
		if (typeof parent === "string") parent = document.querySelector(parent);
		if (parent == null) throw new Error("Expecting a valid DOM element to attach in.");
		if (typeof before === "string") {
			before = parent.querySelector ?
				parent.querySelector(before) :
				document.querySelector(before);
		}

		parent.insertBefore(this.el, before);
		this.trigger("attach", this.el);

		return this;
	},

	paint: function(parent, before) {
		this.attach(parent, before);
		this.mount();
		return this;
	},

	// stop and remove dom
	detach: function() {
		this.stop();
		if (this.el && this.el.parentNode) {
			this.el.parentNode.removeChild(this.el);
		}
		return this;
	}
});

// brand the class
assignProps(View.prototype, "__temple", true);

// proxy a few computation methods
[ "invalidate", "onInvalidate" ].forEach(function(method) {
	View.prototype[method] = function() {
		if (!this.comp) {
			throw new Error("Cannot run " + method + "(). This view is not mounted.");
		}

		this.comp[method].apply(this.comp, arguments);
		return this;
	};
});

// plugin API
View.use = View.prototype.use = function use(p) {
	return loadPlugin(this, p, _.toArray(arguments).slice(1));
};

// modify extend so subclasses use the same plugins
var subclass = View.extend;
View.extend = function() {
	var klass = subclass.apply(this, arguments);

	if (this._loaded_plugins) {
		for (let fn of this._loaded_plugins) {
			klass.use(fn);
		}
	}

	return klass;
};

// default plugins
View.use("decorators");
View.use("helpers");
View.use("partials");
View.use("components");

// export view
export default View;
