var Temple = require("../");
var _ = require("underscore");

exports.render = function(tpl, data) {
	var id = _.uniqueId("view-");
	var views = Temple.render(`<${id}>${tpl}</${id}>`);
	var comp = new (views[id])(data);
	comp.paint(document.createDocumentFragment());
	return comp;
};
