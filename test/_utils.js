var Temple = require("../");
var _ = require("underscore");

var create =
exports.create = function(tpl, data, options) {
	var id = _.uniqueId("view-");
	var views = Temple.render(`<${id}>${tpl}</${id}>`);
	return new (views[id])(data, options);
};

var createDocument =
exports.createDocument = function() {
	return document.createDocumentFragment();
};

exports.render = function() {
	var comp = create.apply(this, arguments);
	comp.paint(createDocument());
	return comp;
};
