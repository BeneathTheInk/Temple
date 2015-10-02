var Temple = require("../");
var expect = require("./utils/expect");

describe("#autorun() & #depend()", function() {
	this.timeout(500);
	this.slow(200);
	var tpl, comp;

	beforeEach(function() {
		tpl = new Temple({ foo: "bar" });
	});

	afterEach(function() {
		if (comp != null) {
			comp.stop();
			comp = null;
		}
	});

	it("autorun() context always runs once, immediately", function() {
		var seen = false;
		comp = tpl.autorun(function() {
			expect(tpl.get("foo")).to.equal("bar");
			seen = true;
		});
		expect(seen).to.be.ok;
	});

	it("`this` in autorun() contexts points to Temple instance", function() {
		comp = tpl.autorun(function() {
			expect(tpl.get("foo")).to.equal("bar");
			expect(this).to.equal(tpl);
		});
	});

	it("changing value at `key` after calling get(key) in a context causes context to run again", function(done) {
		var run = 2;

		comp = tpl.autorun(function() {
			try { expect(tpl.get("foo")).to.be.ok; }
			catch(e) { return done(e); }
			if (!(--run)) done();
		});

		setTimeout(function() {
			tpl.get().foo = { bar: "baz" };
		}, 10);
	});
});