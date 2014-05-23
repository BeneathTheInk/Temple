describe("Basic Class Properties", function() {

	it("extend() should create a valid subclass", function() {
		var SubTemple = Temple.extend({
			foo: function(){}
		});

		var tpl = new SubTemple();

		expect(tpl).to.be.instanceof(Temple);
		expect(tpl.foo).to.be.a("function");
	});

	it("subclass with defaults should make instances with defaults", function() {
		var val = { foo: "bar" };

		var SubTemple = Temple.extend({
			defaults: { foo: "bar" }
		});

		var tpl = new SubTemple();

		expect(tpl.get()).to.deep.equal({ foo: "bar" });
		expect(tpl.get()).to.not.equal(val);
		expect(tpl.get("foo")).to.equal("bar");
	});

});