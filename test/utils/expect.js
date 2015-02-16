var chai = require("chai");
module.exports = chai.expect;

chai.Assertion.addProperty('element', function() {
	this.assert(
		this._obj.nodeType === 1,
		"expected #{this} to be an element",
		"expected #{this} to not be an element"
	);
});

chai.Assertion.addProperty('textNode', function() {
	this.assert(
		this._obj.nodeType === 3,
		"expected #{this} to be a text node",
		"expected #{this} to not be a text node"
	);
});

chai.Assertion.addProperty('comment', function() {
	this.assert(
		this._obj.nodeType === 8,
		"expected #{this} to be a comment node",
		"expected #{this} to not be a comment node"
	);
});

chai.Assertion.addMethod('nodeValue', function(expected_value) {
	this.has.property("nodeValue", expected_value);
});

chai.Assertion.addMethod('tagName', function(expected_value) {
	this.has.property("tagName", expected_value.toUpperCase());
});