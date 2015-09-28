import * as _ from "underscore";
import Mustache from "./mustache";
import Trackr from "trackr";

var deps = {};
var views = {};
var natives = {};

function getNativePrototype(tag) {
	if (natives[tag]) return natives[tag];
	return (natives[tag] = Object.getPrototypeOf(document.createElement(tag)));
}

export function add(name, props) {
	props = _.extend({ tagName: name }, props);
	let _View = Mustache;
	let _extends;

	if (props.extends) {
		if (_.has(views, props.extends)) {
			_View = views[props.extends];
			_extends = _View.prototype.extends;
			delete props.extends;
		} else {
			_extends = props.extends;
		}
	}

	let V = views[name] = _View.extend(props);

	let proto = Object.create(_extends ?
		getNativePrototype(_extends) :
		HTMLElement.prototype
	);

	document.registerElement(name, { prototype: proto });

	if (deps[name] != null) deps[name].changed();

	return V;
}

export function get(name) {
	if (deps[name] == null) deps[name] = new Trackr.Dependency();
	deps[name].depend();
	return views[name];
}

export function create(name, data, options) {
	var V = get(name);
	if (!V) throw new Error(`No view named '${name}' is registered.`);
	return new V(data, options);
}
