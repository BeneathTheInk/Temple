var chai = require("chai");
global.expect = chai.expect;
global.Temple = require("../lib/temple");

mocha.setup('bdd');

describe("Temple", function() {
	require("./class");
	require("./parse");
});

require("./scope");

describe("new Temple()", function() {
	require("./reactive");
	require("./render.browser.js");
	require("./render.mustache.js");
});

mocha.checkLeaks();
mocha.run();