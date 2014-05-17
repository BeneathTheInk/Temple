var tagParser = require("../lib/parse/tag-parser.pegjs"),
	NODE_TYPE = require("../lib/types");

var events = [
	'change',
	'click',
	'dblclick',
	'mousedown',
	'mouseup',
	'mouseenter',
	'mouseleave',
	'scroll',
	'blur',
	'focus',
	'input',
	'submit',
	'keydown',
	'keypress',
	'keyup'
];

var decorators = events.reduce(function(d, name) {
	d['on-' + name] = function(el, template) {
		var bindings = Temple.Binding.buildText(template, this),
			events = {},
			self = this,
			scope;

		el.addEventListener(name, listener);

		return {
			update: function() {
				var v;

				scope = this;
				update(this);
				events = tagParser.parse(value());
				
				if (typeof events !== "object") {
					v = events;
					events = {};

					if (typeof v === "string") events[v] = [];
					else events[name] = v;
				}
			},
			destroy: function() {
				el.removeEventListener(name, listener);
			}
		};

		function value() {
			return bindings.map(function(b) { return b.value; }).join("");
		}

		function update(scope) {
			bindings.forEach(function(b) { return b.update(scope); });
		}

		function listener(event) {
			var key, args, e;

			for (key in events) {
				args = [ key, {
					original: event,
					node: el,
					scope: scope
				} ];

				self.emit.apply(self, args.concat(events[key]));
			}
		}
	}

	return d;
}, {});

module.exports = function(tpl) {
	tpl.decorate(decorators);
};