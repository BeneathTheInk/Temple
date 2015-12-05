import View from "./view";
import {Map as ReactiveMap} from "trackr-objects";
import assignProps from "assign-props";

var Template = View.extend({
	constructor: function (data, parent, options) {
		View.apply(this, arguments);
		this.s.helpers = new ReactiveMap();
		this.initialize(options);
	},

	type: "template",

	helpers: function(key, value) {
		if (typeof key === "object") {
			Object.keys(key).forEach((k) => this.helpers(k, key[k]));
			return this;
		}

		if (typeof value === "undefined") this.s.helpers.delete(key);
		else this.s.helpers.set(key, value);

		return this;
	}
});

assignProps(Template.prototype, {
	_helpers: function() { return this.s.helpers; }
});

export default Template;
