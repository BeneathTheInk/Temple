describe("Scope", function() {
	var scope, fallback;

	before(function() {
		scope = new Temple.Scope();
	});

	beforeEach(function() {
		scope.set("foo", "bar");
		fallback = new Temple.Model({ bar: "baz" });
		scope.addModel(fallback);
	});

	afterEach(function() {
		scope.stopObserving();
		scope.removeModel(fallback);
		fallback = null;
	});

	it("creates a model on constructor if a model isn't passed", function() {
		expect(scope.models[0]).to.be.instanceof(Temple.Model);
	});

	it("get(path) executes function value iff value at path is function", function() {
		scope.set("foo", function() {
			expect(this).to.equal(scope);
			return "Hello World";
		});

		expect(scope.get("foo")).to.equal("Hello World");
	});

	it("adds fallback model", function() {
		expect(scope.models[1]).to.deep.equal(fallback);
	});

	it("removes fallback model", function() {
		scope.removeModel(fallback);
		expect(scope.models).to.have.length(1);
	});

	it("scope returns fallback value at path iff model value at path is undefined", function() {
		expect(scope.get("foo")).to.equal("bar");
		expect(scope.get("bar")).to.equal("baz");
	});

	it("if path is prefixed with `this`, model returns exact value at path", function() {
		expect(scope.get("this.foo")).to.equal("bar");
		expect(scope.get("this.bar")).to.be.undefined;
	});

	it("stops observing", function() {
		var fn = function() { throw new Error("Observer wasn't removed!"); }
		scope.observe("foo", fn);
		
		expect(function() {
			scope.set("foo", "baz");
		}).to.throw(Error);

		scope.stopObserving("foo", fn);
		scope.set("foo", "bar");
	});

	it("observes changes to fallback value", function() {
		var seen = false;

		scope.observe("bar", function(summary) {
			expect(this).to.equal(scope);
			seen = true;
		});

		fallback.set("bar", "bam");
		expect(seen).to.be.ok;
	});

	it("observes changes to local value when the value was found in fallback", function() {
		var seen = false;

		scope.observe("bar", function(summary) {
			seen = true;
		});

		scope.set("bar", "bam");
		expect(seen).to.be.ok;
	});

	it("doesn't observes changes to fallback when the value is in local model", function() {
		var seen = false;

		scope.observe("foo", function(summary) {
			seen = true;
		});

		fallback.set("foo", "bam");
		expect(seen).to.not.be.ok;
	});

	it("observes unsets on local value", function() {
		var seen = false;

		scope.observe("foo", function(summary) {
			seen = true;
		});

		scope.unset("foo");
		expect(seen).to.be.ok;
	});

});