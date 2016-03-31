import {isObject,forEach,includes,toArray,isDate,pick,assign,defer} from "lodash";
import { toString } from "../core/utils";
import Trackr from "trackr";
import { updateAttribute, updateProperty } from "../core/idom";

var value_types = [ "radio", "option" ];
var selection_types = [ "text", "search", "tel", "url", "password" ];

var formBindings = {};

export function plugin(options) {
	this.use("decorators");

	options = options || {};

	// add methods
	this._formBindings = {};
	this.twoway = this.addFormBinding = add;
	this.getFormBinding = get;
	this.removeFormBinding = remove;

	// add main binding decorator
	this.decorate("bind-to", bindTo.bind(this, options, false));
	this.decorate("lazybind-to", bindTo.bind(this, options, true));

	// add value decorator for radios and options
	this.decorate("value", valueOf, { parse: "string" });
}

export default plugin;

export function add(id, getter, onChange) {
	if (isObject(id)) {
		forEach(id, (v, k) => add.call(this, k, v));
		return this;
	}

	if (typeof id !== "string") throw new Error("Expecting a string for the form binding ID.");

	let bindings = this._formBindings || formBindings;
	if (bindings[id] != null) throw new Error("A form binding with id '" + id + "' already exists.");

	if (isObject(getter) && onChange == null) {
		onChange = getter.change;
		getter = getter.get;
	}

	if (typeof getter !== "function") throw new Error("Expecting a function or object for the form binding getter.");
	if (typeof onChange !== "function") onChange = null;

	bindings[id] = {
		get: getter,
		change: onChange
	};

	return this;
}

export function get(id) {
	if (typeof id !== "string") return;

	if (this._formBindings && this._formBindings[id]) {
		return this._formBindings[id];
	}

	return formBindings[id];
}

export function remove(id) {
	if (this._formBindings) {
		if (id == null) this._formBindings = {};
		else delete this._formBindings[id];
	} else if (id) {
		delete formBindings[id];
	}

	return this;
}

var type_map = {
	"text": [ "text", "color", "email", "password", "search", "tel", "url", "hidden" ],
	"number": [ "number", "range" ],
	"date": [ "date", "datetime", "datetime-local", "month", "time", "week" ],
	"file": [ "file" ],
	"checkbox": [ "checkbox" ],
	"radio": [ "radio" ]
};

function getType(el) {
	switch (el.tagName.toLowerCase()) {
		case "input":
			for (var type in type_map) {
				if (includes(type_map[type], el.type)) return type;
			}
			break;

		case "select":
			return "select";

		case "option":
			return "option";

		case "textarea":
			return "text";
	}
}

function getNodeValue(node, type) {
	if (type == null) type = getType(node);
	var val;

	switch (type) {
		case "number":
			val = node.valueAsNumber;
			break;
		case "text":
			val = node.value;
			break;

		case "checkbox":
			val = node.checked;
			break;

		case "date":
			val = node.valueAsDate;
			break;

		case "select":
			var opt = node.querySelector("option:checked");
			if (opt != null) val = opt.$bound_value;
			break;

		case "file":
			val = !node.multiple ? node.files[0] : toArray(node.files);
			break;

		case "radio":
			val = node.$bound_value;
			break;
	}

	return val;
}

function setLiveValue(live, el, fn) {
	var active = document.activeElement === el;
	if (!live && active) return;
	var sel = selection_types.indexOf(el.type) > -1;
	var pos = sel ? [el.selectionStart, el.selectionEnd] : null;
	fn();
	if (sel && active) el.setSelectionRange.apply(el, pos);
}

function setNodeValue(el, val, type, live) {
	if (type == null) type = getType(el);

	switch (type) {
		case "number":
			setLiveValue(live, el, function() {
				updateProperty(el, typeof val === "number" ? "valueAsNumber" : "value", val);
			});
			break;

		case "text":
			setLiveValue(live, el, function() {
				updateProperty(el, "value", toString(val));
			});
			break;

		case "checkbox":
			updateProperty(el, "checked", Boolean(val));
			break;

		case "date":
			setLiveValue(live, el, function() {
				updateProperty(el, isDate(val) ? "valueAsDate" : "value", val);
			});
			break;

		case "select":
			toArray(el.querySelectorAll("option")).forEach(function(opt) {
				updateProperty(opt, "selected", opt.$bound_value === val);
			});
			break;

		case "radio":
			updateProperty(el, "checked", el.$bound_value === val);
			break;
	}
}

function bindTo(options, lazy, d, id) {
	let fbind = this.getFormBinding(id);
	if (fbind == null) return;

	let el = d.target;
	let args = toArray(arguments).slice(4);
	let type = getType(el);
	let onChange;
	let twscope = pick(d, "scope", "template", "target");

	// detect changes to the input's value
	if (typeof fbind.change === "function") {
		onChange = function(e) {
			fbind.change.apply(assign(twscope, {
				original: e
			}), [getNodeValue(el, type)].concat(args));
		};

		el.addEventListener("change", onChange);
		el.addEventListener("paste", onChange);
		if (!(options.lazy || lazy)) el.addEventListener("keyup", onChange);

		d.comp.onInvalidate(function() {
			el.removeEventListener("change", onChange);
			el.removeEventListener("paste", onChange);
			el.removeEventListener("keyup", onChange);
		});
	}

	let nodeValueComp, stopped = false;

	d.comp.onInvalidate(function() {
		stopped = true;
		if (nodeValueComp) nodeValueComp.stop();
	});

	// reactively set the value on the input
	// deferred so value decorators run
	defer(function() {
		if (stopped) return;
		nodeValueComp = Trackr.autorun(function() {
			setNodeValue(el, fbind.get.apply(twscope, args), type, options.live);
		});
	});
}

function valueOf(d, val) {
	var el = d.target,
		type = getType(el);

	if (!includes(value_types, type)) {
		updateAttribute(el, "value", val);
		return;
	}

	el.$bound_value = val;
	updateProperty(el, "value", val);
}
