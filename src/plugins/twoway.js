import * as _ from "underscore";
import { register } from "./";
import { getPropertyFromClass, toString } from "../utils";
import Trackr from "trackr";
import { updateAttribute, updateProperty } from "../idom";

var value_types = [ "radio", "option" ];
var selection_types = [ "text", "search", "tel", "url", "password" ];

export function plugin(options) {
	this.use("decorators");

	options = options || {};

	// add methods
	this.twoway = this.addFormBinding = add;
	this.getFormBinding = get;
	this.removeFormBinding = remove;

	// add main binding decorator
	this.decorate("bind-to", function bindTo(d, id, lazy) {
		var fbind = this.getFormBinding(id);
		if (fbind == null) return;

		var el = d.target,
			type = getType(el),
			self = this,
			onChange, value;

		// detect changes to the input's value
		if (typeof fbind.change === "function") {
			onChange = function(e) {
				var nvalue = getNodeValue(el, type);
				if (_.isEqual(value, nvalue)) return;
				fbind.change.call(self, nvalue, d.context, e);
				value = nvalue;
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

		var nodeValueComp, stopped = false;

		d.comp.onInvalidate(function() {
			stopped = true;
			if (nodeValueComp) nodeValueComp.stop();
		});

		// reactively set the value on the input
		// deferred so value decorators run
		_.defer(function() {
			if (stopped) return;
			nodeValueComp = Trackr.autorun(function() {
				setNodeValue(el, fbind.get.call(self, d.context), type, options.live);
			});
		});
	});

	// add value decorator for radios and options
	this.decorate("value", function valueOf(d, strval) {
		var el = d.target,
			type = getType(el);

		if (!_.contains(value_types, type)) {
			updateAttribute(el, "value", strval);
			return;
		}

		var args = [];
		if (d.render && typeof d.render.arguments === "function") {
			args = d.render.arguments();
		}

		el.$bound_value = args.length <= 1 ? args[0] : args;
		updateProperty(el, "value", strval);
	}, { parse: "string" });

	// copy inherited bindings
	if (typeof this !== "function") {
		let bindings = getPropertyFromClass(this, "_formBindings");
		this._formBindings = _.extend(this._formBindings || {}, bindings);
	}
}

export default plugin;
register("twoway", plugin);

export function add(id, getter, onChange) {
	if (_.isObject(id)) {
		_.each(id, function(v, k) {
			add.call(this, k, v);
		}, this);
		return this;
	}

	if (typeof id !== "string") throw new Error("Expecting a string for the form binding ID.");
	if (this._formBindings == null) this._formBindings = {};
	if (this._formBindings[id] != null) throw new Error("A form binding with id '" + id + "' already exists.");

	if (_.isObject(getter) && onChange == null) {
		onChange = getter.change;
		getter = getter.get;
	}

	if (typeof getter !== "function") throw new Error("Expecting a function or object for the form binding getter.");
	if (typeof onChange !== "function") onChange = null;

	this._formBindings[id] = {
		get: getter,
		change: onChange
	};

	return this;
}

export function get(id) {
	if (typeof id !== "string") return;
	var c = this, bindings;

	while (c != null) {
		bindings = c._formBindings;
		if (bindings != null && bindings[id] != null) return bindings[id];
		c = c.parentRange;
	}
}

export function remove(id) {
	var exists = this._formBindings[id] != null;
	delete this._formBindings[id];
	return exists;
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
				if (_.contains(type_map[type], el.type)) return type;
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
			val = !node.multiple ? node.files[0] : _.toArray(node.files);
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
				updateProperty(el, _.isNumber(val) ? "valueAsNumber" : "value", val);
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
				updateProperty(el, _.isDate(val) ? "valueAsDate" : "value", val);
			});
			break;

		case "select":
			_.toArray(el.querySelectorAll("option")).forEach(function(opt) {
				updateProperty(opt, "selected", opt.$bound_value === val);
			});
			break;

		case "radio":
			updateProperty(el, "checked", el.$bound_value === val);
			break;
	}
}
