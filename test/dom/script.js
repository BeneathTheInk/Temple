var Temple = require("../../");
var test = require("tape");

test("=== Scripts ===", function(_t) {
	var test = _t.test;

	test("parses and executes a root script tag", function(t) {
		/* jshint -W054 */
		t.plan(1);
		global._test_state = { ran: false };
		Temple.exec("<script>_test_state.ran = true;</script>");
		t.ok(global._test_state.ran, "executed the script");
		delete global._test_state;
	});

	_t.end();
});
