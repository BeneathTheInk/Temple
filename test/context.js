describe("Context", function() {
	var ctx;

	beforeEach(function() {
		ctx = new Mustache.Context({ foo: "bar" });
	});

	afterEach(function() {
		ctx.clean();
	});

});