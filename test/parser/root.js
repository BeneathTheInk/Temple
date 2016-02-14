import test from "tape";
import * as Temple from "templejs";

test("empty string produces a root node", function(t) {
	t.plan(5);
	var node = Temple.parse("");
	t.ok(node instanceof Temple.AST.Root, "returns a root node");
	t.ok(Array.isArray(node.files), "has files array");
	t.equal(node.files.length, 1, "has a single file");
	t.ok(node.files[0] instanceof Temple.AST.File, "file is a file");
	t.notOk(node.files[0].children.length, "file has no children");
});
