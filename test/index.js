
global.Temple = require("../lib/temple");

mocha.setup('bdd');

describe("Temple", function() {
	require("./class");
	require("./parse");
});

require("./scope");

describe("new Temple()", function() {
	require("./reactive");
	require("./render");
});

mocha.checkLeaks();
mocha.run();