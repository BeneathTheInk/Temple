import * as _ from "lodash";
import {Template} from "./views";

export var templates = {};
export var currentView;

export function register(name, props) {
	props = _.extend({ name: name }, props);
	let parent = Template;

	if (props.extends) {
		if (typeof props.extends === "function") {
			parent = props.extends;
		} else if (_.has(templates, props.extends)) {
			parent = templates[props.extends];
		} else {
			throw new Error("No view to extend '" + props.extends + "'");
		}

		delete props.extends;
	}

	function wrap(k, f) {
		return function() {
			let osuper = this.super;
			this.super = parent.prototype[k];
			let ret = f.apply(this, arguments);
			this.super = osuper;
			return ret;
		};
	}

	for (let k in props) {
		let fn = props[k];
		if (typeof fn !== "function") continue;
		if (/this\.super|this\["super"\]|this\['super'\]/.test(fn.toString())) {
			props[k] = wrap(k, fn);
		}
	}

	// let child;
	// if (_.has(props, "constructor")) {
	// 	child = props.constructor;
	// } else {
	// 	child = function() { parent.apply(this, arguments); };
	// }
	//
	// _.assign(child, parent);
	// child.prototype = _.assign(Object.create(parent.prototype), props);
	// child.prototype.constructor = parent;
	// child.__super__ = parent.prototype;

	return (templates[name] = parent.extend(props));
}

export function getByName(name) {
	return templates[name];
}

export function create(name, data, options) {
	var V = getByName(name);
	if (!V) throw new Error(`No view named '${name}' is registered.`);
	return new V(data, options);
}
