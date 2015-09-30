import * as _ from "underscore";
import View from "./view";
import Context from "./context";
import { patchElement } from "./idom";
import { load as loadPlugin } from "./plugins";

var Mustache =
module.exports = View.extend({
	constructor: function(data, parent, options) {
		if (!Context.isContext(parent)) {
			options = parent;
			parent = null;
		}

		options = options || {};

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

		// super
		View.call(this, data, parent, options);
	},

	_mount: function() {
		patchElement(this.el, () => this.render(this._renderContext));
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

Mustache.use = Mustache.prototype.use = function use(p) {
	return loadPlugin(this, p, _.toArray(arguments).slice(1));
};

var subclass = Mustache.extend;
Mustache.extend = function() {
	var klass = subclass.apply(this, arguments);

	if (this._loaded_plugins) {
		for (let fn of this._loaded_plugins) {
			klass.use(fn);
		}
	}

	return klass;
};

Mustache.use("decorators");
Mustache.use("helpers");
