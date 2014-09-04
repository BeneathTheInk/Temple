var _ = require("underscore"),
	Mustache = require("../");

var NODE_TYPE = Mustache.NODE_TYPE;
var nodeTypes = [ NODE_TYPE.INTERPOLATOR, NODE_TYPE.TRIPLE, NODE_TYPE.TEXT ];

module.exports = function(options) {
	options = options || {};

	this.decorate("bind-to", function(el, attr) {
		var type = getType(el),
			args = attr.arguments;

		if (type == null || !args.length || !~nodeTypes.indexOf(args[0].type)) {
			return;
		}

		var path = args[0].value,
			lazy, model;

		lazy = options.lazy || (args[1] && args[1].type === NODE_TYPE.LITERAL && args[1].value)
		el.addEventListener("change", onChange);
		if (!lazy) el.addEventListener("keyup", onChange);

		function onChange(e) {
			var val;

			switch (type) {
				case "number":
					val = this.valueAsNumber;
					break;
				case "text":
					val = this.value;
					break;

				case "checkbox":
					val = this.checked;
					break;

				case "date":
					val = this.valueAsDate;
					break;

				case "select":
					var opt = this.querySelector("option:checked");
					if (opt == null) return;
					val = opt.$bound_value;
					break;

				case "file":
					val = !this.multiple ? this.files[0] : _.toArray(this.files);
					break;

				case "radio":
					val = this.$bound_value;
					break;
			}

			model.set([], val);
		}

		return {
			update: function() {
				model = this.findModel(path);
				var val = model.get();

				switch (type) {
					case "number":
						if (document.activeElement === el) return;
						if (_.isNumber(val)) el.valueAsNumber = val;
						else el.value = val;
						break;

					case "text":
						if (document.activeElement === el) return;
						el.value = val == null ? "" : val.toString();
						break;

					case "checkbox":
						el.checked = !!val;
						break;

					case "date":
						if (document.activeElement === el) return;
						if (_.isDate(val)) el.valueAsDate = val;
						else el.value = val;
						break;

					case "select":
						_.toArray(el.querySelectorAll("option")).forEach(function(opt) {
							opt.selected = opt.$bound_value === val;
						});
						break;

					case "radio":
						el.checked = el.$bound_value === val;
						break;

				}
			},
			destroy: function() {
				el.removeEventListener("change", onChange);
				if (!lazy) el.removeEventListener("keyup", onChange);
			}
		}
	});

	this.decorate("value", function(el, attr) {
		var type = getType(el), self = this;
		
		if (!_.contains([ "radio", "option" ], type)) {
			return {
				parse: "string",
				update: function(val) { el.value = val; }
			}
		}

		return { update: function(val) {
			el.$bound_value = val;
			el.value = self.convertStringTemplate(attr.children, this);
		} }
	});
}

var type_map = {
	"text": [ "text", "color", "email", "password", "search", "tel", "url", "hidden" ],
	"number": [ "number", "range" ],
	"date": [ "date", "datetime", "datetime-local", "month", "time", "week" ],
	"file": [ "file" ],
	"checkbox": [ "checkbox" ],
	"radio": [ "radio" ]
}

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