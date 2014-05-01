var assert = require("assert");

describe("Reactivity", function() {
	var tpl;

	before(function() {
		tpl = new Temple();
	});

	beforeEach(function() {
		tpl.set("foo", "bar");
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
			this.timeout(500);
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
});