var assert = require("assert");

describe("Basic Class Properties", function() {

	it("extend() should create a valid subclass", function() {
		var SubTemple = Temple.extend({
			foo: function(){}
		});

		var tpl = new SubTemple();

		assert.ok(tpl instanceof Temple);
		assert.strictEqual(typeof tpl.foo, "function");
	});

});