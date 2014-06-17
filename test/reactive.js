describe("#autorun() & #depend()", function() {
	this.timeout(500);
	this.slow(200);
	var tpl, comp;

	beforeEach(function() {
		tpl = new Temple();
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

	it("autorun() context reruns for parent changes", function(done) {
		var parent = new Temple.Scope({ baz: "buz" }),
			run = 2;

		parent.addChild(tpl);

		comp = tpl.autorun(function() {
			try { expect(tpl.get("baz")).to.be.ok; }
			catch(e) { return done(e); }
			if (!(--run)) done();
		});

		setTimeout(function() {
			tpl.set("baz", { bar: "baz" });
		}, 10);
	});

	it("autorun() context reruns for changes to value when previous get() returned a parent value", function(done) {
		var parent = new Temple.Scope({ baz: "buz" }),
			run = 2;

		parent.addChild(tpl);

		comp = tpl.autorun(function() {
			try {
				if (run == 2) expect(tpl.get("baz")).to.equal("buz");
				if (run == 1) expect(tpl.get("baz")).to.deep.equal({ bar: "baz" });
			}
			catch(e) { return done(e); }
			if (!(--run)) done();
		});

		setTimeout(function() {
			tpl.set("baz", { bar: "baz" });
		}, 10);
	});

	it("autoruns under namespace", function() {
		var seen = false;
		tpl.autorun("ns", function() { seen = true; });
		expect(seen).to.be.ok;
	});

	it("stops autorun computations by namespace", function(done) {
		var seen = 0,
			dep = new Temple.Deps.Dependency;
		
		tpl.autorun("ns", function() {
			dep.depend();
			seen++;
		});
		
		tpl.stopComputation("ns");
		dep.changed();

		renderWait(function() {
			expect(seen).to.equal(1);
		}, done);
	});

	it("clears previous computation when autorun is called with the same namespace", function() {
		var seen = 0;
		
		tpl.autorun("ns", function(){ seen++; });
		
		expect(function() {
			tpl.autorun("ns", function() { throw new Error; });
		}).to.throw(Error);

		expect(seen).to.equal(1);
	});
});