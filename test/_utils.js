var Temple = require("../");
var _ = require("underscore");

var compile =
exports.compile = function(tpl) {
	var id = _.uniqueId("view-");
	var views = Temple.render(`<${id}>${tpl}</${id}>`);
	return views[id];
};

var create =
exports.create = function(tpl, data, options) {
	return new (compile(tpl))(data, options);
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
