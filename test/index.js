
global.Temple = require("../lib/temple");

mocha.setup('bdd');

describe("Temple", function() {
	require("./class");
	require("./parse");
});

describe("new Temple()", function() {
	require("./scope");
	require("./reactive");
	require("./render");
});

mocha.run();