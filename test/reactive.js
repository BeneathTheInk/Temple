describe("#autorun()", function() {
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
		this.timeout(500);
		var run = 2;

		comp = tpl.autorun(function() {
			expect(tpl.get("foo")).to.be.ok;
			if (!(--run)) done();
		});

		setTimeout(function() {
			tpl.set("foo", { bar: "baz" });
		}, 10);
	});

	it("autorun() context reruns for parent value changes");
});