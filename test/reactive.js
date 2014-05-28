describe("#autorun() & #depend()", function() {
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

	it("autorun() context reruns for fallback changes", function(done) {
		var fb = new Temple.Model({ baz: "buz" }),
			run = 2;

		function donedone(e) {
			tpl.removeFallback(fb);
			done(e);
		}

		tpl.addFallback(fb);

		comp = tpl.autorun(function() {
			try { expect(tpl.get("baz")).to.be.ok; }
			catch(e) { return donedone(e); }
			if (!(--run)) donedone();
		});

		setTimeout(function() {
			fb.set("baz", { bar: "baz" });
		}, 10);
	});

	it("autorun() context reruns for changes to value when previous get() returned a fallback scope's value", function(done) {
		var fb = new Temple.Model({ baz: "buz" }),
			run = 2;

		function donedone(e) {
			tpl.removeFallback(fb);
			done(e);
		}

		tpl.addFallback(fb);

		comp = tpl.autorun(function() {
			try {
				if (run == 2) expect(tpl.get("baz")).to.equal("buz");
				if (run == 1) expect(tpl.get("baz")).to.deep.equal({ bar: "baz" });
			}
			catch(e) { return donedone(e); }
			if (!(--run)) donedone();
		});

		setTimeout(function() {
			tpl.set("baz", { bar: "baz" });
		}, 10);
	});
});