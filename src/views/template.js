import View from "./view";
import {Map as ReactiveMap} from "trackr-objects";
import assignProps from "assign-props";

export default function Template(data, parent, options) {
	View.apply(this, arguments);
	this.s.helpers = new ReactiveMap();
	this.initialize(options);
}

Template.prototype = Object.create(View.prototype);
Template.prototype.type = "template";

assignProps(Template.prototype, {
	_helpers: function() { return this.s.helpers; }
});

Template.prototype.helpers = function(key, value) {
	if (typeof key === "object") {
		Object.keys(key).forEach((k) => this.helpers(k, key[k]));
		return this;
	}

	console.log(this.s);
	if (typeof value === "undefined") this.s.helpers.delete(key);
	else this.s.helpers.set(key, value);

	return this;
};
