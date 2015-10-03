var Temple = require("../");
var test = require("tape");

test("=== Context ===", function(_t) {
	var test = _t.test;

	test("sets data on construction", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({ foo: "bar" });
		t.deepEqual(ctx.get(), { foo: "bar" }, "has data");
	});

	test("returns result of `ctx.data` on null or empty path", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({ foo: "bar" });
		t.equal(ctx.get(), ctx.data, "returns the data value");
	});

	test("gets shallow path", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({ foo: "bar" });
		t.equal(ctx.get("foo"), "bar", "has correct value");
	});

	test("gets deep path", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({ foo: { bar: "baz" } });
		t.equal(ctx.get("foo.bar"), "baz", "has correct value");
	});

	test("gets deep path with bracket notation", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({ foo: { bar: "baz" } });
		t.equal(ctx.get("foo['bar']"), "baz", "has correct value");
	});

	test("gets deep path with dynamic path", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({ foo: { bar: "baz" }, path: "bar" });
		t.equal(ctx.get("foo[path]"), "baz", "has correct value");
	});

	test("gets local value", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({ foo: "bar" });
		t.deepEqual(ctx.get("."), { foo: "bar" }, "has correct value");
	});

	test("gets deep local value", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({ foo: "bar" });
		t.deepEqual(ctx.get(".foo"), "bar", "has correct value");
	});

	test("does not get from parent ctx", function(t) {
		t.plan(1);
		var parent = new Temple.Context({ foo: "bar" });
		var ctx = new Temple.Context({ hello: "world" }, parent);
		t.equal(ctx.get("foo"), void 0, "does not get parent value");
	});

	test("queries from parent ctx", function(t) {
		t.plan(1);
		var parent = new Temple.Context({ foo: "bar" });
		var ctx = new Temple.Context({ hello: "world" }, parent);
		t.equal(ctx.query("foo"), "bar", "has correct value");
	});

	test("getContextAtOffset(0) returns the ctx", function(t) {
		t.plan(1);
		var ctx = new Temple.Context({});
		t.equal(ctx.getContextAtOffset(0), ctx, "has correct value");
	});

	test("getContextAtOffset(-1) returns the root ctx", function(t) {
		t.plan(1);
		var root = new Temple.Context({});
		var parent = new Temple.Context({}, root);
		var ctx = new Temple.Context({}, parent);
		t.equal(ctx.getContextAtOffset(-1), root, "has correct value");
	});

	test("getContextAtOffset(n) where n > 0 returns the relative ancestor starting at the ctx", function(t) {
		t.plan(1);
		var root = new Temple.Context({});
		var parent = new Temple.Context({}, root);
		var ctx = new Temple.Context({}, parent);
		t.equal(ctx.getContextAtOffset(1), parent, "has correct value");
	});

	test("getContextAtOffset(n) where n < 0 returns the relative ancestor starting at the root ctx", function(t) {
		t.plan(1);
		var root = new Temple.Context({});
		var parent = new Temple.Context({}, root);
		var ctx = new Temple.Context({}, parent);
		t.equal(ctx.getContextAtOffset(-2), parent, "has correct value");
	});

	test("always calls proxy match function", function(t) {
		t.plan(3);

		var obj = { foo: "bar" };
		var ctx = new Temple.Context(obj);
		var runCount = 0;
		var proxy = {
			match: function(target) {
				t.equal(target, obj, "passes the object through");
				runCount++;
				return false;
			},
			get: function() {
				runCount++; // in case errors are suppressed
				t.fail("Ran 'get()' method.");
			}
		};

		Temple.proxies.register(proxy);
		t.equal(ctx.get("foo"), "bar", "has correct value");
		t.equal(runCount, 1, "only ran once");
		Temple.proxies.remove(proxy);
	});

	test("calls get method on a match", function(t) {
		t.plan(5);

		var obj = { foo: "bar" };
		var ctx = new Temple.Context(obj);
		var runCount = 0;
		var proxy = {
			match: function(target) {
				t.equal(target, obj, "passes the object through");
				runCount++;
				return true;
			},
			get: function(target, k) {
				runCount++;
				t.equal(target, obj, "passes the object through");
				t.equal(k, "foo", "passes the key through");
				return target[k];
			}
		};

		Temple.proxies.register(proxy);
		t.equal(ctx.get("foo"), "bar", "has correct value");
		t.equal(runCount, 2, "ran twice");
		Temple.proxies.remove(proxy);
	});

	_t.end();
});
