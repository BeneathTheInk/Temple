var Mustache = require("../");
var expect = require("./utils/expect");

describe("Context", function() {
	var ctx;

	beforeEach(function() {
		ctx = new Mustache.Context({ foo: "bar" });
	});

	afterEach(function() {
		// ctx.clean();
	});

});