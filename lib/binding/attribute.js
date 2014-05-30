var _ = require("underscore"),
	Binding = require("./index"),
	NODE_TYPE = require("../types");

module.exports = [];

// Binding.Text[NODE_TYPE.ATTRIBUTE] = Binding.Text.extend({
	
// });

module.exports.push(Binding.DOM.extend({
	
	initialize: function(template, options) {
		this.name = template.name;
		this.value = "";

		// all attributes MUST be unescaped or else they don't
		// function properly. since text bindings are also used
		// to generate plain html, we must instead manually
		// convert all interpolators to triples.
		var children = template.children.map(function(t) {
			if (t.type === NODE_TYPE.INTERPOLATOR) {
				t = _.extend({}, t, { type: NODE_TYPE.TRIPLE });
			}
			return t;
		});

		var childOptions = _.extend({}, options, { type: "text" });
		this.children = this.create(children, childOptions);

		this.updateAttribute();
	},

	updateAttribute: function() {
		if (this.node != null) this.node.setAttribute(this.name, this.value);
	},

	render: function(scope) {
		this.children.forEach(function(b) { b.update(scope); });
		this.value = _.pluck(this.children, "value").join("");
		this.updateAttribute();
	},

	appendTo: function(el) {
		this.node = el instanceof window.Element ? el : null;
		this.updateAttribute();
	},

	destroy: function() {
		this.children.forEach(function(child) { child.destroy(); });
	}

}, {

	match: function(template, temple, options) {
		return (
			options.type === "dom" &&
			template.type === NODE_TYPE.ATTRIBUTE
		);
	}

}));