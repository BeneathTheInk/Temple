import test from "tape";
const Temple = require("../");

test("empty string produces a root node", function(t) {
	t.plan(2);
	var node = Temple.parse("");
	t.ok(node instanceof Temple.AST.File, "returns a root node");
	// t.ok(Array.isArray(node.files), "has files array");
	// t.equal(node.files.length, 1, "has a single file");
	// t.ok(node.files[0] instanceof Temple.AST.File, "file is a file");
	t.notOk(node.children.length, "file has no children");
});
