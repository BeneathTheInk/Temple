import test from "tape";
const Temple = require("../");

test("empty string produces a file node", function(t) {
	t.plan(2);
	var node = Temple.parse("");
	t.ok(node instanceof Temple.AST.File, "returns a file node");
	t.notOk(node.children.length, "file has no children");
});
