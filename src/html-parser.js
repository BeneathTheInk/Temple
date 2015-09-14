var _ = require("underscore");
var parse = require("html-parse-stringify").parse;
var idom = require("incremental-dom");

function render(node) {
	if (node.type == "text") {
		return idom.text(node.content);
	}

	if (node.type == "tag") {
		var argsArray = [node.name, null, null];

		// convert attrs into a flat array
		for (var attr in node.attrs) {
			argsArray.push(attr);
			argsArray.push(node.attrs[attr]);
		}

		if (node.voidElement) {
			return idom.elementVoid.apply(idom, argsArray);
		} else {
			idom.elementOpen.apply(idom, argsArray);

			for (var i = 0; i < node.children.length; i++) {
				render(node.children[i]);
			}

			return idom.elementClose(node.name);
		}
	}
}

module.exports = function(html) {
	var tree = parse("<div>" + html + "</div>");
	if (_.isArray(tree)) tree = tree[0];
	return tree.children.map(render);
};
