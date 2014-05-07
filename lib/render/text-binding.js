var _ = require("underscore"),
	util = require("../util"),
	NODE_TYPE = require("../types"),
	Binding = require("./binding"),
	Section = require("./section");

var TextBinding =
module.exports = Binding.extend({
	initialize: function() {
		this.value = "";
	},

	// update takes data and sets value
	update: function(scope) {},

	// mostly pointless here
	destroy: function() {}
});

TextBinding[NODE_TYPE.SECTION] =
TextBinding[NODE_TYPE.INVERTED] = TextBinding.extend({
	initialize: function() {
		this.section = new Section(this.template, Binding.buildText);
		this.value = "";
	},
	update: function(scope) {
		this.value = "";
		this.section.process(scope);
		_.flatten(this.section.rows).forEach(function(node) {
			this.value += node.value;
		}, this);
	},
	destroy: function() {
		this.section.destroy();
	}
});

TextBinding[NODE_TYPE.TEXT] = TextBinding.extend({
	initialize: function() {
		this.value = this.template.value;
	}
});

TextBinding[NODE_TYPE.INTERPOLATOR] = TextBinding.extend({
	update: function(scope) {
		var val = scope.get(this.template.value);
		this.value = _.escape(val);
	}
});