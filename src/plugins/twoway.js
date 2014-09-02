var _ = require("underscore"),
	Mustache = require("../");

var NODE_TYPE = Mustache.NODE_TYPE;
var tagNames = [ "INPUT", "SELECT", "TEXTAREA" ];
var nodeTypes = [ NODE_TYPE.INTERPOLATOR, NODE_TYPE.TRIPLE, NODE_TYPE.TEXT ];

module.exports = function() {
	this.decorate({ "bind-to": bindTo });
}

function bindTo(el, attr) {
	// check that it is a valid tag and pathname
	if (!~tagNames.indexOf(el.tagName) || !attr.arguments.length || !~nodeTypes.indexOf(attr.arguments[0].type)) {
		return;
	}

	var type = getType(el),
		path = attr.arguments[0].value,
		eventName = "change",
		onChange,
		model;

	switch (type) {
		case "number":
		case "text":
			eventName = "keyup";
			break;
	}

	el.addEventListener(eventName, onChange = function(e) {
		var val;

		switch (type) {
			case "number":
				val = parseFloat(this.value, 10);
				break;

			case "select":
			case "text":
				val = this.value;
				break;

			case "checkbox":
				val = this.checked;
				break;
		}

		model.set([], val);
	});

	return {
		update: function() {
			model = this.get(path, { model: true });
			var val = model.get();

			if (document.activeElement === el) return;

			switch (type) {
				case "number":
				case "text":
					el.value = val == null ? "" : val.toString();
					break;

				case "checkbox":
					el.checked = !!val;
					break;

				case "select":
					_.toArray(el.querySelectorAll("option")).forEach(function(opt) {
						opt.selected = opt.value == val;
					});
					break;
			}
		},
		destroy: function() {
			el.removeEventListener(eventName, onChange);
		}
	}
}

function getType(el) {
	switch (el.tagName.toLowerCase()) {
		case "input":
			return el.type;

		case "select":
			return "select";

		case "textarea":
			return "text";
	}
}