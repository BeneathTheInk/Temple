var NODE_TYPE = Temple.NODE_TYPE;

describe("#parse()", function() {

	it("parses basic html", function() {
		var template = Temple.parse("<div class=\"container\">Hello World</div>");
		
		expect(template).to.deep.equal([{
			type: NODE_TYPE.ELEMENT,
			name: "div",
			attributes: [{
				type: NODE_TYPE.ATTRIBUTE,
				name: "class",
				children: [{
					type: NODE_TYPE.TEXT,
					value: "container"
				}]
			}],
			children: [{
				type: NODE_TYPE.TEXT,
				value: "Hello World"
			}]
		}]);
	});

	it("parses mustache variables", function() {
		var template = Temple.parse("{{ hello }}{{{ world }}}{{& unescaped }}");
		
		expect(template).to.deep.equal([{
			type: NODE_TYPE.INTERPOLATOR,
			value: "hello"
		},{
			type: NODE_TYPE.TRIPLE,
			value: "world"
		},{
			type: NODE_TYPE.TRIPLE,
			value: "unescaped"
		}]);
	});

	it("parses mustache sections", function() {
		var template = Temple.parse("{{#good}}Hello{{/good}}{{^bad}}World{{/bad}}");
		
		expect(template).to.deep.equal([{
			type: NODE_TYPE.SECTION,
			value: "good",
			children: [{
				type: NODE_TYPE.TEXT,
				value: "Hello"
			}]
		},{
			type: NODE_TYPE.INVERTED,
			value: "bad",
			children: [{
				type: NODE_TYPE.TEXT,
				value: "World"
			}]
		}]);
	});

	it("parses mustache partials", function() {
		var template = Temple.parse("{{>partial}}");
		
		expect(template).to.deep.equal([{
			type: NODE_TYPE.PARTIAL,
			value: "partial"
		}]);
	});

	it("parses deeply", function() {
		var template = Temple.parse("<div>{{ var }}</div>");

		expect(template).to.deep.equal([{
			type: NODE_TYPE.ELEMENT,
			name: "div",
			attributes: [],
			children: [{
				type: NODE_TYPE.INTERPOLATOR,
				value: "var"
			}]
		}]);
	});

});