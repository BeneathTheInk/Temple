var Temple = require("../");
var expect = require("./utils/expect");

describe("View", function() {
	var ctx;

	beforeEach(function() {
		ctx = new Temple.View({ foo: "bar" });
	});

	afterEach(function() {
		// ctx.clean();
	});

});