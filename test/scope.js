describe("Scope", function() {
	var scope, fallback;

	before(function() {
		scope = new Temple.Scope();
	});

	beforeEach(function() {
		scope.set("foo", "bar");
		fallback = new Temple.Model({ bar: "baz" });
		scope.addFallback(fallback);
	});

	afterEach(function() {
		scope.removeFallback(fallback);
		fallback = null;
	});

	it("creates a model on constructor if a model isn't passed", function() {
		expect(scope.model).to.be.instanceof(Temple.Model);
	});

	it("get(path) executes function value iff value at path is function", function() {
		scope.set("foo", function() {
			expect(this).to.equal(scope);
			return "Hello World";
		});

		expect(scope.get("foo")).to.equal("Hello World");
	});

	it("adds fallback model", function() {
		expect(scope.fallbacks).to.deep.equal([ fallback ]);
	});

	it("removes fallback model", function() {
		scope.removeFallback(fallback);
		expect(scope.fallbacks).to.be.empty;
	});

	it("scope returns fallback value at path iff model value at path is undefined", function() {
		expect(scope.get("foo")).to.equal("bar");
		expect(scope.get("bar")).to.equal("baz");
	});

	it("if path is prefixed with `this`, model returns exact value at path", function() {
		expect(scope.get("this.foo")).to.equal("bar");
		expect(scope.get("this.bar")).to.be.undefined;
	});

});