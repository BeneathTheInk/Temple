var assert = require("assert");

describe("Data", function() {
	var tpl;

	before(function() {
		tpl = new Temple();
	});

	beforeEach(function() {
		tpl.set("foo", "bar");
	});

	describe("#get() & #set()", function() {
		it("sets data on construction", function() {
			var tpl = new Temple({
				data: { foo: "bar" }
			});

			assert.deepEqual(tpl.get(), { foo: "bar" });
		});

		it("returns `this.data` value on null or empty path", function() {
			assert.strictEqual(tpl.get(), tpl.data);
		});

		it("gets & sets shallow path", function() {
			tpl.set("foo", { bar: "baz" });
			assert.deepEqual(tpl.get("foo"), { bar: "baz" });
		});

		it("gets & sets deep path", function() {
			tpl.set("foo.bar", "baz");
			assert.equal(tpl.get("foo.bar"), "baz");
		});

		it("get(path) executes function value iff value at path is function", function() {
			tpl.set("foo", function(_tpl) {
				seen = true;
				assert.strictEqual(this, tpl.data);
				assert.strictEqual(_tpl, tpl);
				return true;
			});

			assert.strictEqual(tpl.get("foo"), true);
		});

		it("deep copies generic objects on set", function() {
			var data = { bar: { baz: "buz" } };
			tpl.set("foo", data);
			assert.deepEqual(tpl.get("foo"), data);
			assert.notStrictEqual(tpl.get("foo"), data);
			assert.notStrictEqual(tpl.get("foo.bar"), data.foo);
		});

		it("directly points to non-generic objects on set", function() {
			var data = [];
			tpl.set("foo", data);
			assert.strictEqual(tpl.get("foo"), data);
		});

		it("unsets", function() {
			tpl.unset("foo");
			assert.strictEqual(typeof tpl.get("foo"), "undefined");
		});

		it("only unsets deeply on generic objects", function() {
			tpl.set("foo", [ 0, 1, 2 ]);
			assert.equal(tpl.get("foo.length"), 3);
			tpl.unset("foo.length");
			assert.equal(tpl.get("foo.length"), 3);
		});

		it("unset() sets `this.data` to undefined on null or empty path", function() {
			tpl.unset();
			assert.strictEqual(typeof tpl.data, "undefined");
		});
	});


	describe("#autorun()", function() {
		var comp;
		
		afterEach(function() {
			if (comp != null) {
				comp.stop();
				comp = null;
			}
		});

		it("autorun() context always runs once, immediately", function() {
			var seen = false;
			comp = tpl.autorun(function() {
				assert.ok(tpl.get("foo"));
				seen = true;
			});
			assert.ok(seen);
		});

		it("`this` in autorun() contexts points to Temple instance", function() {
			comp = tpl.autorun(function() {
				assert.ok(tpl.get("foo"));
				assert.strictEqual(this, tpl);
			});
		});

		it("changing value at `key` after calling get(key) in a context causes context to run again", function(done) {
			this.timeout(100);
			var run = 2;

			comp = tpl.autorun(function() {
				assert.ok(tpl.get("foo"));
				if (!(--run)) done();
			});

			setTimeout(function() {
				tpl.set("foo", { bar: "baz" });
			}, 10);
		});
	});

	describe("#observe()", function() {
		var o;

		afterEach(function() {
			if (o != null) {
				o.stop();
				o = null;
			}
		});

		it("successfully adds & removes observer", function() {
			o = tpl.observe("foo", function(){});
			assert.ok(tpl._observers.indexOf(o) > -1);
			o.stop();
			assert.strictEqual(tpl._observers.indexOf(o), -1);
		});

		it("observes nothing when nothing changes", function() {
			var seen = false;
			o = tpl.observe("foo", function() { seen = true; });
			tpl.set("foo", "bar");
			assert.ok(!seen);
		});

		it("observes static path changes", function() {
			var seen = false;
			o = tpl.observe("foo.bar", function(nval, oval, path) {
				assert.strictEqual(nval, "baz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar");
				seen = true;
			});

			tpl.set("foo", { bar: "baz" });
			assert.ok(seen);
		});

		it("observes unset", function() {
			var seen = false;
			o = tpl.observe("foo", function(nval, oval, path) {
				assert.strictEqual(typeof nval, "undefined");
				assert.strictEqual(oval, "bar");
				assert.strictEqual(path, "foo");
				seen = true;
			});

			tpl.unset("foo");
			assert.ok(seen);
		});

		it("observes dynamic path: *", function() {
			var seen = false;
			o = tpl.observe("*", function(nval, oval, path) {
				assert.deepEqual(nval, { bar: "baz" });
				assert.strictEqual(oval, "bar");
				assert.strictEqual(path, "foo");
				seen = true;
			});

			tpl.set("foo", { bar: "baz" });
			assert.ok(seen);
		});

		it("observes dynamic path: *.bar.baz", function() {
			var seen = false;
			o = tpl.observe("*.bar.baz", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			tpl.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("observes dynamic path: foo.*.baz", function() {
			var seen = false;
			o = tpl.observe("foo.*.baz", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			tpl.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("observes dynamic path: foo.bar.*", function() {
			var seen = false;
			o = tpl.observe("foo.bar.*", function(nval, oval, path) {
				assert.strictEqual(nval, "buz");
				assert.strictEqual(typeof oval, "undefined");
				assert.strictEqual(path, "foo.bar.baz");
				seen = true;
			});

			tpl.set("foo.bar.baz", "buz");
			assert.ok(seen);
		});

		it("calling get() in an observer returns the new value", function() {
			var seen = false;
			o = tpl.observe("foo.bar", function(nval, oval, path) {
				assert.strictEqual(this.get(path), nval);
				seen = true;
			});

			tpl.set("foo.bar", "baz");
			assert.ok(seen);
		});
	});
});