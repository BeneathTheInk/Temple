var Mustache = require("../");
var expect = require("./utils/expect");

describe("View", function() {
	var ctx;

	beforeEach(function() {
		ctx = new Mustache.View({ foo: "bar" });
	});

	afterEach(function() {
		// ctx.clean();
	});

});