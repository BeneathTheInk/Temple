var Temple = require("../");
var expect = require("./utils/expect");
var NODE_TYPE = Temple.NODE_TYPE;

describe("Mustache", function() {
	var tpl, doc;

	this.timeout(1000);
	this.slow(400);

	before(function() {
		doc = document.createDocumentFragment();
	});

	afterEach(function() {
		if (tpl != null) {
			tpl.destroy();
			tpl = null;
		}

		expect(doc.childNodes.length).to.equal(0);
	});

	function render(template, data) {
		tpl = Temple.render(template, data);
		tpl.paint(doc);
		return getNodes();
	}

	function renderWait(fn, done) {
		setTimeout(function() {
			try { fn(); done(); }
			catch(e) { done(e); }
		}, 150);
	}

	function getNodes() {
		var nodes = [];
		for (var i = 0; i < doc.childNodes.length; i++) {
			nodes.push(doc.childNodes[i]);
		}
		return nodes;
	}

	describe("#parse()", function() {

		it("parses basic html", function() {
			var template = Temple.parse("<div class=\"container\">Hello World</div>");

			expect(template).to.deep.equal({
				type: NODE_TYPE.ROOT,
				version: Temple.VERSION,
				children: [{
					type: NODE_TYPE.ELEMENT,
					name: "div",
					attributes: [{
						type: NODE_TYPE.ATTRIBUTE,
						name: "class",
						value: "container",
						children: [{
							type: NODE_TYPE.TEXT,
							value: "container"
						}],
						arguments: [{
							type: NODE_TYPE.LITERAL,
							value: "container"
						}]
					}],
					children: [{
						type: NODE_TYPE.TEXT,
						value: "Hello World"
					}]
				}]
			});
		});

		it("parses mustache variables", function() {
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

		it("parses mustache sections", function() {
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

		it("parses mustache partials", function() {
			var template = Temple.parse("{{>partial}}");

			expect(template).to.deep.equal({
				type: NODE_TYPE.ROOT,
				version: Temple.VERSION,
				children: [{
					type: NODE_TYPE.PARTIAL,
					value: "partial"
				}]
			});
		});

		it("parses comments", function() {
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

		it("parses deeply", function() {
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

		it("parses mustache attributes", function() {
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

		it("parses attributes with slashes and mustache", function() {
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

	describe("Sections", function() {
		it("renders section when value is true", function() {
			var nodes = render("{{#section}}Hello World{{/section}}", { section: true });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
		});

		it("doesn't render section when value is false", function() {
			var nodes = render("{{#section}}Hello World{{/section}}", { section: false });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.textNode;
		});

		it("removes section when value is changed to false", function(done) {
			render("{{#section}}Hello World{{/section}}", { section: true });
			tpl.get().section = false;

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.textNode;
			}, done);
		});

		it("updates section when value is changed to truthy", function(done) {
			render("{{#section}}Hello World{{/section}}", { section: false });
			tpl.get().section = true;

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("renders section in element", function() {
			var nodes = render("<div>{{#section}}Hello World{{/section}}</div>", { section: true });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.element;
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders section in section", function() {
			var nodes = render("{{#s1}}{{#s2}}Hello World{{/s2}}{{/s1}}", { s1: true, s2: true });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders arrays", function() {
			var nodes = render("{{#list}}{{ . }}{{/list}}", { list: [ 0, 1, 2 ] });
			expect(nodes).to.have.length(3);
			expect(nodes[0]).to.be.textNode.with.nodeValue("0");
			expect(nodes[1]).to.be.textNode.with.nodeValue("1");
			expect(nodes[2]).to.be.textNode.with.nodeValue("2");
		});

		it("sections have access to key value", function() {
			var nodes = render("{{#list}}{{ $key }}{{/list}}", { list: [ "a", "b", "c" ] });
			expect(nodes).to.have.length(3);
			expect(nodes[0]).to.be.textNode.with.nodeValue("0");
			expect(nodes[1]).to.be.textNode.with.nodeValue("1");
			expect(nodes[2]).to.be.textNode.with.nodeValue("2");
		});

		it("updates single item in array when value is changed", function(done) {
			render("{{#list}}{{ . }}{{/list}}", { list: [ 0, 1, 2 ] });
			tpl.get("list")[1] = "Hello World";

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(3);
				expect(nodes[1]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("updates single item in array when deep value is changed", function(done) {
			var nodes = render("{{# list }}{{ foo }}{{/ list }}", { list: [ 0, { foo: "bar" }, 2 ] });
			tpl.get("list.1").foo = "Hello World";

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(3);
				expect(nodes[1]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("updates empty list when an item is added to it", function(done) {
			render("{{# list }}{{ . }}{{/ list }}", { list: [] });
			tpl.get("list").push("Hello World");

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("removes section when list becomes empty", function(done) {
			render("{{#list}}{{ . }}{{/list}}", { list: [ 0 ] });
			tpl.get("list").shift();

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.textNode;
			}, done);
		});

		// array operations
		[	[ "splice", [ 1, 1, 3 ], function(nodes) {
				expect(nodes).to.have.length(3);
				expect(nodes[0]).to.be.textNode.with.nodeValue("0");
				expect(nodes[1]).to.be.textNode.with.nodeValue("3");
				expect(nodes[2]).to.be.textNode.with.nodeValue("2");
			} ],
			[ "push", [ 3 ], function(nodes) {
				expect(nodes).to.have.length(4);
				expect(nodes[3]).to.be.textNode.with.nodeValue("3");
			} ],
			[ "pop", [], function(nodes) {
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.textNode.with.nodeValue("0");
				expect(nodes[1]).to.be.textNode.with.nodeValue("1");
			} ],
			[ "unshift", [ 3 ], function(nodes) {
				expect(nodes).to.have.length(4);
				expect(nodes[0]).to.be.textNode.with.nodeValue("3");
				expect(nodes[1]).to.be.textNode.with.nodeValue("0");
			} ],
			[ "shift", [], function(nodes) {
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.textNode.with.nodeValue("1");
			} ],
			[ "sort", [ function(a, b) { return b - a; } ], function(nodes) {
				expect(nodes).to.have.length(3);
				expect(nodes[0]).to.be.textNode.with.nodeValue("2");
				expect(nodes[1]).to.be.textNode.with.nodeValue("1");
				expect(nodes[2]).to.be.textNode.with.nodeValue("0");
			} ],
			[ "reverse", [], function(nodes) {
				expect(nodes).to.have.length(3);
				expect(nodes[0]).to.be.textNode.with.nodeValue("2");
				expect(nodes[1]).to.be.textNode.with.nodeValue("1");
				expect(nodes[2]).to.be.textNode.with.nodeValue("0");
			} ]
		].forEach(function(op) {
			it("updates for array " + op[0] + " operation", function(done) {
				render("{{#list}}{{ . }}{{/list}}", { list: [0,1,2] });

				var list = tpl.get("list");
				list[op[0]].apply(list, op[1]);

				renderWait(function() {
					op[2](getNodes());
				}, done);
			});
		});

		it("updates for array length change", function(done) {
			render("{{# list.length }}Hello World{{/ list.length }}", { list: [] });
			tpl.get("list").push(1);

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});
	});

	describe("Inverted Sections", function(argument) {
		it("renders inverted section when value is false", function() {
			var nodes = render("{{^ section }}Hello World{{/ section }}", { section: false });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders inverted section when value is empty array", function() {
			var nodes = render("{{^section}}Hello World{{/section}}", { section: [] });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
		});

		it("doesn't render inverted section when value is true", function() {
			var nodes = render("{{^section}}Hello World{{/section}}", { section: true });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.textNode;
		});

		it("removes inverted section when value is changed to true", function(done) {
			render("{{^section}}Hello World{{/section}}", { section: false });
			tpl.get().section = true;

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.textNode;
			}, done);
		});

		it("updates inverted section when value is changed to false", function(done) {
			render("{{^section}}Hello World{{/section}}", { section: true });
			tpl.get().section = false;

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("updates non-empty list when all items are removed from it", function(done) {
			render("{{^list}}Hello World{{/list}}", { list: [ 0 ] });
			tpl.get("list").pop();

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("renders inverted section in element", function() {
			var nodes = render("<div>{{^section}}Hello World{{/section}}</div>", { section: false });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.element;
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders inverted section in section", function() {
			var nodes = render("{{#s1}}{{^s2}}Hello World{{/s2}}{{/s1}}", { s1: true, s2: false });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			// expect(nodes[1]).to.be.comment;
		});
	});

	describe("Elements", function() {
		it("renders element", function() {
			var nodes = render("<div></div>");
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.an.element.with.tagName("div");
		});

		it("renders element in element", function() {
			var nodes = render("<div><span></span></div>");
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.an.element.with.tagName("div");
			expect(nodes[0].childNodes).have.length(1);
			expect(nodes[0].childNodes[0]).to.be.an.element.with.tagName("span");
		});

		it("renders element in section", function() {
			var nodes = render("{{#section}}<div></div>{{/section}}", { section: true });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.an.element.with.tagName("div");
		});
	});

	describe("Element Attributes", function() {
		it("renders basic text attribute", function() {
			var nodes = render("<div x-attr='Hello World'></div>");
			expect(nodes).to.have.length(1);
			expect(nodes[0].getAttribute("x-attr")).to.equal("Hello World");
		});

		it("renders interpolator attribute", function() {
			var nodes = render("<div x-attr='{{ val }}'></div>", { val: "Foo & \"Bar\" <span>" });
			expect(nodes).to.have.length(1);
			expect(nodes[0].getAttribute("x-attr")).to.equal("Foo & \"Bar\" <span>");
		});

		it("renders triple interpolator attribute", function() {
			var nodes = render("<div x-attr='{{{ val }}}'></div>", { val: "Foo & \"Bar\" <span>" });
			expect(nodes).to.have.length(1);
			expect(nodes[0].getAttribute("x-attr")).to.equal("Foo & \"Bar\" <span>");
		});

		it("renders section attribute", function() {
			var nodes = render("<div x-attr='{{#section}}Hello World{{/section}}'></div>", { section: true });
			expect(nodes).to.have.length(1);
			expect(nodes[0].getAttribute("x-attr")).to.equal("Hello World");
		});

		it("updates attribute when value changes", function(done) {
			var nodes = render("<div x-attr='{{ val }}'></div>", { val: "Hello World" });
			tpl.get().val = "foo";

			renderWait(function() {
				expect(nodes[0].getAttribute("x-attr")).to.equal("foo");
			}, done);
		});
	});

	describe("Decorators", function() {
		function render(template, data) {
			tpl = Temple.render(template, data, { track: true });
			return getNodes();
		}

		it("calls decorator when element is created", function() {
			render("<div custom='A fancy attribute'></div>");
			var seen = 0;

			tpl.decorate("custom", function(d) {
				expect(this).to.equal(tpl);
				expect(d.target).to.be.an.element.with.tagName("div");
				seen++;
			});

			tpl.paint(doc);
			expect(seen).to.equal(1);
		});

		it("calls decorator again when data changes", function(done) {
			render("<div custom='{{ val }}'></div>", { val: "Hello World" });
			var seen = 0;

			tpl.decorate("custom", function(d, o) {
				if (seen === 0) expect(o).to.equal("Hello World");
				if (seen === 1) expect(o).to.equal("Foo Bar");
				seen++;
			});

			tpl.paint(doc);
			tpl.get().val = "Foo Bar";

			renderWait(function() {
				expect(seen).to.equal(2);
			}, done);
		});

		it("parses boolean argument", function() {
			render("<span custom='true'></span>", { val: "World" });
			var seen = 0;

			tpl.decorate("custom", function(d, val) {
				expect(val).to.equal(true);
				seen++;
			});

			tpl.paint(doc);
			expect(seen).to.equal(1);
		});

		it("parses numeric argument", function() {
			render("<span custom='1234.56'></span>", { val: "World" });
			var seen = 0;

			tpl.decorate("custom", function(d, val) {
				expect(val).to.equal(1234.56);
				seen++;
			});

			tpl.paint(doc);
			expect(seen).to.equal(1);
		});

		it("parses string argument", function() {
			render('<span custom=\'"Hello \\\\"World\\\\""\'></span>', { val: "World" });
			var seen = 0;

			tpl.decorate("custom", function(d, val) {
				expect(val).to.equal('Hello "World"');
				seen++;
			});

			tpl.paint(doc);
			expect(seen).to.equal(1);
		});

		it("parses several arguments", function() {
			render("<span custom='\"Hello\", {{ val }}, true'></span>", { val: "World" });
			var seen = 0;

			tpl.decorate("custom", function(d, a1, a2, a3) {
				expect(a1).to.equal("Hello");
				expect(a2).to.equal("World");
				expect(a3).to.equal(true);
				seen++;
			});

			tpl.paint(doc);
			expect(seen).to.equal(1);
		});

		it("calls decorator nested in section", function() {
			render("{{#section}}<div custom='{{ val }}'></div>{{/section}}", { val: "Hello World", section: true });
			var seen = 0;

			tpl.decorate("custom", function() {
				seen++;
			});

			tpl.paint(doc);
			expect(seen).to.equal(1);
		});

		it("calls decorator nested in element", function() {
			render("<div><span custom='{{ val }}'></span></div>", { val: "Hello World" });
			var seen = 0;

			tpl.decorate("custom", function(d) {
				expect(d.target).to.be.an.element.with.tagName("span");
				seen++;
			});

			tpl.paint(doc);
			expect(seen).to.equal(1);
		});

		it("stops decorating", function() {
			render("<span custom='{{ val }}'></span>", { val: "Hello World" });
			var seen = 0,
				decorator = function() { seen++; };

			tpl.decorate("custom", decorator);
			tpl.stopDecorating("custom", decorator);

			tpl.paint(doc);
			expect(seen).to.equal(0);
		});
	});

	describe("Text Nodes", function() {
		it("renders text node", function() {
			var nodes = render("Hello World");
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});

		it("renders text node in element", function() {
			var nodes = render("<div>Hello World</div>");
			expect(nodes).to.have.length(1);
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].childNodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});

		it("renders text node in section", function() {
			var nodes = render("{{#section}}Hello World{{/section}}", { section: true });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});
	});

	describe("Interpolators", function() {
		it("renders interpolator", function() {
			var nodes = render("{{ val }}", { val: "Hello World" });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});

		it("updates when value changes", function(done) {
			var nodes = render("{{ val }}", { val: "Hello World" });
			tpl.get().val = "FooBar";

			renderWait(function() {
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.a.textNode.with.nodeValue("FooBar");
			}, done);
		});

		it("renders interpolator in element", function() {
			var nodes = render("<div>{{ val }}</div>", { val: "Hello World" });
			expect(nodes).to.have.length(1);
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].childNodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});

		it("renders interpolator in section", function() {
			var nodes = render("{{#section}}{{ val }}{{/section}}", { section: true, val: "Hello World" });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});
	});

	describe("Triple Interpolators", function() {
		it("renders triple interpolator", function() {
			var nodes = render("{{{ val }}}", { val: "<span>" });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.an.element.with.tagName("span");
			// expect(nodes[1]).to.be.a.comment;
		});

		it("updates when value changes", function(done) {
			render("{{{ val }}}", { val: "<span>" });
			tpl.get().val = "<div></div>Hello World";

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.a.element.with.tagName("div");
				expect(nodes[1]).to.be.a.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("renders triple interpolator in element", function() {
			var nodes = render("<div>{{{ val }}}</div>", { val: "<span>" });
			expect(nodes).to.have.length(1);
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].childNodes[0]).to.be.an.element.with.tagName("span");
		});

		it("renders triple interpolator in section", function() {
			var nodes = render("{{#section}}{{{ val }}}{{/section}}", { section: true, val: "<span>" });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.an.element.with.tagName("span");
		});
	});

	describe("Partials", function() {
		it("sets a string partial", function() {
			tpl = Temple.render("{{> partial }}");
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			expect(tpl.findPartial("partial")).to.be.ok;
		});

		it("sets a parsed template partial", function() {
			tpl = Temple.render("{{> partial }}");
			tpl.setPartial("partial", Temple.parse("<h1>{{ value }}</h1>"));
			expect(tpl.findPartial("partial")).to.be.ok;
		});

		it("sets a subclass of temple partial", function() {
			tpl = Temple.render("{{> partial }}");
			tpl.setPartial("partial", Temple.extend({ template: "<h1>{{ value }}</h1>" }));
			expect(tpl.findPartial("partial")).to.be.ok;
		});

		it("unsets a partial on null", function() {
			tpl = Temple.render("{{> partial }}");
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			tpl.setPartial("partial", null);
			expect(tpl.findPartial("partial")).to.not.be.ok;
		});

		it("renders partial into component", function() {
			tpl = Temple.render("{{> partial }}", { value: "Hello World" });
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			tpl.mount().paint(doc);

			var nodes = getNodes();
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.element.with.tagName("h1");
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("find component by partial name", function() {
			tpl = Temple.render("{{> partial }}", { value: "Hello World" });
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			tpl.mount().paint(doc);

			var comps = tpl.getComponents("partial");
			expect(comps).to.have.length(1);
			expect(comps[0]).to.be.instanceof(Temple);
		});

		it("renders partial in element", function() {
			tpl = Temple.render("<h1>{{> partial }}</h1>", { value: "Hello World" });
			tpl.setPartial("partial", "{{ value }}");
			tpl.mount().paint(doc);

			var nodes = getNodes();
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.element.with.tagName("h1");
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders partial in section", function() {
			tpl = Temple.render("{{#section}}{{> partial }}{{/section}}", { value: "Hello World", section: true });
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			tpl.paint(doc);

			var nodes = getNodes();
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.element.with.tagName("h1");
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders nothing if partial doesn't exist", function() {
			tpl = Temple.render("{{> partial }}");
			tpl.paint(doc);

			var nodes = getNodes();
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.textNode;
		});
	});

	describe("#find() & #findAll()", function() {

		it("finds top-level element", function() {
			render("<div></div>");
			expect(tpl.find("div")).to.be.an.element.with.tagName("div");
		});

		it("finds nested element", function() {
			render("<div><span></span></div>");
			expect(tpl.find("span")).to.be.an.element.with.tagName("span");
		});

		it("finds element in section", function() {
			render("<div>{{#section}}<span></span>{{/section}}</div>", { section: true });
			expect(tpl.find("span")).to.be.an.element.with.tagName("span");
		});

		it("finds element after change in section", function(done) {
			render("<div>{{#section}}<span></span>{{/section}}</div>", { section: false });
			expect(tpl.find("span")).to.not.exist;
			tpl.get().section = true;

			renderWait(function() {
				expect(tpl.find("span")).to.be.an.element.with.tagName("span");
			}, done);
		});

		it("finds all top-level elements", function() {
			render("<div></div><div></div>");
			var nodes = tpl.findAll("div");
			expect(nodes).to.have.length(2);
			nodes.forEach(function(node) { expect(node).to.be.an.element.with.tagName("div"); });
		});

		it("finds all nested elements", function() {
			render("<div><span><span></span></span></div><div><span></span></div>");
			var nodes = tpl.findAll("span");
			expect(nodes).to.have.length(3);
			nodes.forEach(function(node) { expect(node).to.be.an.element.with.tagName("span"); });
		});

		it("finds all elements in section", function() {
			render("<div>{{#section}}<span><span></span></span>{{/section}}</div>", { section: true });
			var nodes = tpl.findAll("span");
			expect(nodes).to.have.length(2);
			nodes.forEach(function(node) { expect(node).to.be.an.element.with.tagName("span"); });
		});

		it("finds all elements after change in section", function(done) {
			render("<div>{{#section}}<span><span></span></span>{{/section}}</div>", { section: false });
			expect(tpl.findAll("span")).to.have.length(0);
			tpl.get().section = true;

			renderWait(function() {
				var nodes = tpl.findAll("span");
				expect(nodes).to.have.length(2);
				nodes.forEach(function(node) { expect(node).to.be.an.element.with.tagName("span"); });
			}, done);
		});

	});

	/*
	describe.skip('Mustache Language Tests', function () {
		var spec = window.MustacheTestContent;

		function getContents(testName, ext) {
			return spec[testName][ext];
		}

		function getView(testName) {
			var view = getContents(testName, 'js');
			if (!view) throw new Error('Cannot find view for test "' + testName + '"');
			return eval(view);
		}

		function getPartial(testName) {
			try {
				return getContents(testName, 'partial');
			} catch (error) {
				// No big deal. Not all tests need to test partial support.
			}
		}

		function getTest(testName) {
			var test = {};
			test.name = testName;
			test.view = getView(testName);
			test.template = getContents(testName, 'mustache');
			test.partial = getPartial(testName);
			test.expect = getContents(testName, 'txt');
			return test;
		}

		function trimComments(html) {
			return html.replace(/\<\!\-\-\$[0-9]+\-\-\>/g, "");
		}

		Object.keys(spec).filter(function (name) {
			return spec[name].js != null;
		}).forEach(function (testName) {
			var test = getTest(testName);

			function tester() {
				var tpl;

				if (test.partial) {
					throw new Error("Oops! partial!");
					// output = Temple.render(test.template, test.view, { partial: test.partial });
				} else {
					tpl = new Temple(test.template, test.view);
				}

				expect(trimComments(tpl.toHTML()) + "\n").to.equal(test.expect);
			}

			tester.toString = function() {
				return [
					test.template,
					getContents(test.name, "js"),
					test.expect
				].join("\n====\n") + "\n";
			}

			it("knows how to render '" + testName.split("_").join(" ") + "'", tester);
		});
	});
	*/

});
