describe("#autorun()", function() {
	this.timeout(500);
	var tpl, comp;

	before(function() {
		tpl = new Temple();
	});

	beforeEach(function() {
		tpl.set("foo", "bar");
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
			tpl.set("foo", { bar: "baz" });
		}, 10);
	});

	it("autorun() context reruns for parent value changes", function(done) {
		var child = tpl.scope().spawn(tpl.get("foo"), "foo"),
			run = 2;

		function donedone(e) {
			child.close();
			done(e);
		}

		comp = tpl.autorun(function() {
			try { expect(child.get("foo")).to.be.ok; }
			catch(e) { return donedone(e); }
			if (!(--run)) donedone();
		});

		setTimeout(function() {
			tpl.set("foo", { bar: "baz" });
		}, 10);
	});
});