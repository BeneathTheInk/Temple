var Temple = require("../../");
var test = require("tape");

test("empty string produces a root node", function(t) {
	t.plan(3);
	var node = Temple.parse("");
	t.ok(node instanceof Temple.AST.Root, "returns a root node");
	t.ok(Array.isArray(node.children), "has children array");
	t.notOk(node.children.length, "has no children");
});
