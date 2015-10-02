var Temple = require("../");
var test = require("tape");

test("# Parser", function(t) {
	t.end();

	test("parses basic view", function(t) {
		t.plan(3);

		var tpl = Temple.parse("<my-view></my-view>");
		t.ok(tpl instanceof Temple.AST.Root, "returns a root node");

		var view = tpl._children[0];
		t.ok(view instanceof Temple.AST.View, "has the view");
		t.equal(view._name, "my-view", "has the correct tagname");
	});

	test("parses basic html", function(t) {
		t.plan(8);

		var tpl = Temple.parse("<my-view><div class=\"container\">Hello World</div></my-view>");
		t.ok(tpl instanceof Temple.AST.Root, "returns a root node");

		var view = tpl._children[0];
		t.ok(view instanceof Temple.AST.View, "has the view");

		var div = view._children[0];
		t.ok(div instanceof Temple.AST.Element, "has the div");
		t.equal(div._name, "div", "div has the correct tag name");

		var text = div._children[0];
		t.ok(text instanceof Temple.AST.Text, "has the text node");
		t.equal(text._value, "Hello World", "text node has the correct value");

		var attr = div._attributes[0];
		t.ok(attr instanceof Temple.AST.Attribute, "has the attribute");
		t.equal(attr._value, "container", "attribute has the correct value");
	});

	test.skip("parses mustache variables", function(t) {
		var template = Temple.parse("{{ hello }}{{{ world }}}{{& unescaped }}");

		expect(template).to.deep.equal({
			type: NODE_TYPE.ROOT,
			version: Temple.VERSION,
			children: [{
				type: NODE_TYPE.INTERPOLATOR,
				value: [{ parts: [{ children: [], key: "hello" }], type: "all" }]
			},{
				type: NODE_TYPE.TRIPLE,
				value: [{ parts: [{ children: [], key: "world" }], type: "all" }]
			},{
				type: NODE_TYPE.TRIPLE,
				value: [{ parts: [{ children: [], key: "unescaped" }], type: "all" }]
			}]
		});
	});

	test.skip("parses mustache sections", function(t) {
		var template = Temple.parse("{{#good}}Hello{{/good}}{{^bad}}World{{/bad}}");

		expect(template).to.deep.equal({
			type: NODE_TYPE.ROOT,
			version: Temple.VERSION,
			children: [{
				type: NODE_TYPE.SECTION,
				value: [{ parts: [{ children: [], key: "good" }], type: "all" }],
				children: [{
					type: NODE_TYPE.TEXT,
					value: "Hello"
				}]
			},{
				type: NODE_TYPE.INVERTED,
				value: [{ parts: [{ children: [], key: "bad" }], type: "all" }],
				children: [{
					type: NODE_TYPE.TEXT,
					value: "World"
				}]
			}]
		});
	});

	test.skip("parses mustache partials", function(t) {
		var template = Temple.parse("{{>partial}}");

		expect(template).to.deep.equal({
			type: NODE_TYPE.ROOT,
			version: Temple.VERSION,
			children: [{
				type: NODE_TYPE.PARTIAL,
				value: "partial",
				local: false
			}]
		});
	});

	test.skip("parses comments", function(t) {
		var template = Temple.parse("<!-- comment --><div></div>");

		expect(template).to.deep.equal({
			type: NODE_TYPE.ROOT,
			version: Temple.VERSION,
			children: [{
				type: NODE_TYPE.XCOMMENT,
				value: " comment "
			},{
				type: NODE_TYPE.ELEMENT,
				name: "div",
				attributes: [],
				children: []
			}]
		});
	});

	test.skip("parses deeply", function(t) {
		var template = Temple.parse("<div>{{ var }}</div>");

		expect(template).to.deep.equal({
			type: NODE_TYPE.ROOT,
			version: Temple.VERSION,
			children: [{
				type: NODE_TYPE.ELEMENT,
				name: "div",
				attributes: [],
				children: [{
					type: NODE_TYPE.INTERPOLATOR,
					value: [{ parts: [{ children: [], key: "var" }], type: "all" }]
				}]
			}]
		});
	});

	test.skip("parses mustache attributes", function(t) {
		var template = Temple.parse("<div class=\"{{# foo }}myclass{{/ foo }}\"></div>");

		expect(template).to.deep.equal({
			type: NODE_TYPE.ROOT,
			version: Temple.VERSION,
			children: [{
				type: NODE_TYPE.ELEMENT,
				name: "div",
				attributes: [{
					type: NODE_TYPE.ATTRIBUTE,
					name: "class",
					value: "{{# foo }}myclass{{/ foo }}",
					children: [{
						type: NODE_TYPE.SECTION,
						value: [{ parts: [{ children: [], key: "foo" }], type: "all" }],
						children: [{
							type: NODE_TYPE.TEXT,
							value: "myclass"
						}]
					}],
					arguments: [{
						type: NODE_TYPE.LITERAL,
						value: "{{# foo }}myclass{{/ foo }}"
					}]
				}],
				children: []
			}]
		});
	});

	test.skip("parses attributes with slashes and mustache", function(t) {
		var template = Temple.parse("<div class=\"{{ foo }}/{{ bar }}\"></div>");

		expect(template).to.deep.equal({
			type: NODE_TYPE.ROOT,
			version: Temple.VERSION,
			children: [{
				type: NODE_TYPE.ELEMENT,
				name: "div",
				attributes: [{
					type: NODE_TYPE.ATTRIBUTE,
					name: "class",
					value: "{{ foo }}/{{ bar }}",
					children: [{
						type: NODE_TYPE.INTERPOLATOR,
						value: [{ parts: [{ children: [], key: "foo" }], type: "all" }]
					},{
						type: NODE_TYPE.TEXT,
						value: "/"
					},{
						type: NODE_TYPE.INTERPOLATOR,
						value: [{ parts: [{ children: [], key: "bar" }], type: "all" }]
					}],
					arguments: [{
						type: NODE_TYPE.LITERAL,
						value: "{{ foo }}/{{ bar }}"
					}]
				}],
				children: []
			}]
		});
	});
});
