describe("Basic Class Properties", function() {

	it("extend() should create a valid subclass", function() {
		var SubTemple = Temple.extend({
			foo: function(){}
		});

		var tpl = new SubTemple();

		expect(tpl).to.be.instanceof(Temple);
		expect(tpl.foo).to.be.a("function");
	});

});