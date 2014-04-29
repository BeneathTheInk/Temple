var assert = require("assert"),
	parse = require("../lib/parse"),
	inspect = require('util').inspect;

describe("#parse()", function() {

	it("parses basic html", function() {
		var template = parse("<div class=\"container\">Hello World</div>");
		
		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.ELEMENT,
			name: "div",
			attributes: [{
				type: parse.NODE_TYPE.ATTRIBUTE,
				name: "class",
				children: [{
					type: parse.NODE_TYPE.TEXT,
					value: "container"
				}]
			}],
			children: [{
				type: parse.NODE_TYPE.TEXT,
				value: "Hello World"
			}]
		}]);
	});

	it("parses mustache variables", function() {
		var template = parse("{{ hello }}{{{ world }}}{{& unescaped }}");
		// console.log(inspect(template));
		
		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.INTERPOLATOR,
			value: "hello"
		},{
			type: parse.NODE_TYPE.TRIPLE,
			value: "world"
		},{
			type: parse.NODE_TYPE.TRIPLE,
			value: "unescaped"
		}]);
	});

	it("parses mustache sections", function() {
		var template = parse("{{#good}}Hello{{/good}}{{^bad}}World{{/bad}}");
		
		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.SECTION,
			value: "good",
			children: [{
				type: parse.NODE_TYPE.TEXT,
				value: "Hello"
			}]
		},{
			type: parse.NODE_TYPE.INVERTED,
			value: "bad",
			children: [{
				type: parse.NODE_TYPE.TEXT,
				value: "World"
			}]
		}]);
	});

	it("parses mustache partials", function() {
		var template = parse("{{>partial}}");
		
		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.PARTIAL,
			value: "partial"
		}]);
	});

	it("parses deeply", function() {
		var template = parse("<div>{{ var }}</div>");

		assert.deepEqual(template, [{
			type: parse.NODE_TYPE.ELEMENT,
			name: "div",
			attributes: [],
			children: [{
				type: parse.NODE_TYPE.INTERPOLATOR,
				value: "var"
			}]
		}]);
	});

});