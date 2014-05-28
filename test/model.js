describe("Model", function() {
	var model;

	before(function() {
		model = new Temple.Model();
	});

	beforeEach(function() {
		model.set("foo", "bar");
	});

	it("sets data on construction", function() {
		var model = new Temple.Model({ foo: "bar" });
		expect(model.get()).to.deep.equal({ foo: "bar" });
	});

	it("returns result of `model.value` on null or empty path", function() {
		expect(model.get()).to.equal(model.value);
	});

	it("gets & sets shallow path", function() {
		model.set("foo", { bar: "baz" });
		expect(model.get("foo")).to.deep.equal({ bar: "baz" });
	});

	it("gets & sets deep path", function() {
		model.set("foo.bar", "baz");
		expect(model.get("foo.bar")).to.equal("baz");
	});

	it("sets value directly on null or empty path", function() {
		model.set([], "value");
		expect(model.get()).to.equal("value");
	});

	it("directly points to values on set", function() {
		var fn = function(){};
		model.set("foo", fn);
		expect(model.value.foo).to.equal(fn);
	});

	it("unsets", function() {
		model.unset("foo");
		expect(model.get("foo")).to.be.undefined;
	});

	it("unset() sets `this.value` to undefined on null or empty path", function() {
		model.unset();
		expect(model.value).to.be.undefined;
	});

	it("get() accepts array as path", function() {
		expect(model.get([ "foo" ])).to.equal("bar");
	});

	it("set() accepts array as path", function() {
		model.set([ "foo", "bar" ], "baz")
		expect(model.get("foo")).to.deep.equal({ bar: "baz" });
	});

	it("set() accepts object for setting many paths at once", function() {
		model.set({ foo: { bar: "baz" } });
		expect(model.get("foo")).to.deep.equal({ bar: "baz" });
	});
});