var Temple = require("../");
var _ = require("underscore");

var create =
exports.create = function(tpl, data) {
	var id = _.uniqueId("view-");
	var views = Temple.render(`<${id}>${tpl}</${id}>`);
	return new (views[id])(data);
};

exports.render = function(tpl, data) {
	var comp = create(tpl, data);
	comp.paint(document.createDocumentFragment());
	return comp;
};
