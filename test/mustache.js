var NODE_TYPE = Mustache.NODE_TYPE;

describe("Mustache", function() {
	var tpl, doc;

	this.timeout(1000);
	this.slow(200);

	before(function() {
		doc = document.createDocumentFragment();
	});

	afterEach(function() {
		if (tpl != null) {
			tpl.detach();
			tpl = null;
		}

		expect(doc.childNodes.length).to.equal(0);
	});

	function render(template, data) {
		tpl = new Mustache(template, data);
		tpl.paint(doc);
		return getNodes();
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
			var template = Mustache.parse("<div class=\"container\">Hello World</div>");

			expect(template).to.deep.equal({
				type: NODE_TYPE.ROOT,
				children: [{
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
				}]
			});
		});

		it("parses mustache variables", function() {
			var template = Mustache.parse("{{ hello }}{{{ world }}}{{& unescaped }}");

			expect(template).to.deep.equal({
				type: NODE_TYPE.ROOT,
				children: [{
					type: NODE_TYPE.INTERPOLATOR,
					value: "hello"
				},{
					type: NODE_TYPE.TRIPLE,
					value: "world"
				},{
					type: NODE_TYPE.TRIPLE,
					value: "unescaped"
				}]
			});
		});

		it("parses mustache sections", function() {
			var template = Mustache.parse("{{#good}}Hello{{/good}}{{^bad}}World{{/bad}}");

			expect(template).to.deep.equal({
				type: NODE_TYPE.ROOT,
				children: [{
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
				}]
			});
		});

		it("parses mustache partials", function() {
			var template = Mustache.parse("{{>partial}}");

			expect(template).to.deep.equal({
				type: NODE_TYPE.ROOT,
				children: [{
					type: NODE_TYPE.PARTIAL,
					value: "partial"
				}]
			});
		});

		it("parses comments", function() {
			var template = Mustache.parse("<!-- comment --><div></div>");

			expect(template).to.deep.equal({
				type: NODE_TYPE.ROOT,
				children: [{
					type: NODE_TYPE.ELEMENT,
					name: "div",
					attributes: [],
					children: []
				}]
			});
		});

		it("parses deeply", function() {
			var template = Mustache.parse("<div>{{ var }}</div>");

			expect(template).to.deep.equal({
				type: NODE_TYPE.ROOT,
				children: [{
					type: NODE_TYPE.ELEMENT,
					name: "div",
					attributes: [],
					children: [{
						type: NODE_TYPE.INTERPOLATOR,
						value: "var"
					}]
				}]
			});
		});

	});

	describe("Sections", function() {
		it("renders section when value is true", function() {
			var nodes = render("{{#section}}Hello World{{/section}}", { section: true });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
		});

		it("doesn't render section when value is false", function() {
			var nodes = render("{{#section}}Hello World{{/section}}", { section: false });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.comment;
		});

		it("removes section when value is changed to false", function(done) {
			render("{{#section}}Hello World{{/section}}", { section: true });
			tpl.set("section", false);

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.comment;
			}, done);
		});

		it("updates section when value is changed to truthy", function(done) {
			render("{{#section}}Hello World{{/section}}", { section: false });
			tpl.set("section", true);

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("renders section in element", function() {
			var nodes = render("<div>{{#section}}Hello World{{/section}}</div>", { section: true });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.element;
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders section in section", function() {
			var nodes = render("{{#s1}}{{#s2}}Hello World{{/s2}}{{/s1}}", { s1: true, s2: true });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			expect(nodes[1]).to.be.comment;
		});

		it("renders arrays", function() {
			var nodes = render("{{#list}}{{ this }}{{/list}}", { list: [ 0, 1, 2 ] });
			expect(nodes).to.have.length(4);
			expect(nodes[0]).to.be.textNode.with.nodeValue("0");
			expect(nodes[1]).to.be.textNode.with.nodeValue("1");
			expect(nodes[2]).to.be.textNode.with.nodeValue("2");
		});

		it("sections have access to key value", function() {
			var nodes = render("{{#list}}{{ $key }}{{/list}}", { list: [ "a", "b", "c" ] });
			expect(nodes).to.have.length(4);
			expect(nodes[0]).to.be.textNode.with.nodeValue("0");
			expect(nodes[1]).to.be.textNode.with.nodeValue("1");
			expect(nodes[2]).to.be.textNode.with.nodeValue("2");
		});

		it("updates single item in array when value is changed", function(done) {
			render("{{#list}}{{ this }}{{/list}}", { list: [ 0, 1, 2 ] });
			tpl.set("list.1", "Hello World");

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(4);
				expect(nodes[1]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("updates single item in array when deep value is changed", function(done) {
			var nodes = render("{{# list }}{{ foo }}{{/ list }}", { list: [ 0, { foo: "bar" }, 2 ] });
			tpl.set("list.1.foo", "Hello World");

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(4);
				expect(nodes[1]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("updates empty list when an item is added to it", function(done) {
			render("{{# list }}{{ this }}{{/ list }}", { list: [] });
			tpl.get("list").push("Hello World");

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("removes section when list becomes empty", function(done) {
			render("{{#list}}{{ this }}{{/list}}", { list: [ 0 ] });
			tpl.get("list").shift();

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
			}, done);
		});

		// array operations
		[	[ "splice", [ 1, 1, 3 ], function(nodes) {
				expect(nodes).to.have.length(4);
				expect(nodes[0]).to.be.textNode.with.nodeValue("0");
				expect(nodes[1]).to.be.textNode.with.nodeValue("3");
				expect(nodes[2]).to.be.textNode.with.nodeValue("2");
			} ],
			[ "push", [ 3 ], function(nodes) {
				expect(nodes).to.have.length(5);
				expect(nodes[3]).to.be.textNode.with.nodeValue("3");
			} ],
			[ "pop", [], function(nodes) {
				expect(nodes).to.have.length(3);
				expect(nodes[0]).to.be.textNode.with.nodeValue("0");
				expect(nodes[1]).to.be.textNode.with.nodeValue("1");
			} ],
			[ "unshift", [ 3 ], function(nodes) {
				expect(nodes).to.have.length(5);
				expect(nodes[0]).to.be.textNode.with.nodeValue("3");
				expect(nodes[1]).to.be.textNode.with.nodeValue("0");
			} ],
			[ "shift", [], function(nodes) {
				expect(nodes).to.have.length(3);
				expect(nodes[0]).to.be.textNode.with.nodeValue("1");
			} ],
			[ "sort", [ function(a, b) { return b - a; } ], function(nodes) {
				expect(nodes).to.have.length(4);
				expect(nodes[0]).to.be.textNode.with.nodeValue("2");
				expect(nodes[1]).to.be.textNode.with.nodeValue("1");
				expect(nodes[2]).to.be.textNode.with.nodeValue("0");
			} ],
			[ "reverse", [], function(nodes) {
				expect(nodes).to.have.length(4);
				expect(nodes[0]).to.be.textNode.with.nodeValue("2");
				expect(nodes[1]).to.be.textNode.with.nodeValue("1");
				expect(nodes[2]).to.be.textNode.with.nodeValue("0");
			} ]
		].forEach(function(op) {
			it("updates for array " + op[0] + " operation", function(done) {
				var list = [ 0, 1, 2 ];
				render("{{#list}}{{ this }}{{/list}}", { list: list });

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
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});
	});

	describe("Inverted Sections", function(argument) {
		it("renders inverted section when value is false", function() {
			var nodes = render("{{^ section }}Hello World{{/ section }}", { section: false });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders inverted section when value is empty array", function() {
			var nodes = render("{{^section}}Hello World{{/section}}", { section: [] });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
		});

		it("doesn't render inverted section when value is true", function() {
			var nodes = render("{{^section}}Hello World{{/section}}", { section: true });
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.comment;
		});

		it("removes inverted section when value is changed to true", function(done) {
			render("{{^section}}Hello World{{/section}}", { section: false });
			tpl.set("section", true);

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(1);
				expect(nodes[0]).to.be.comment;
			}, done);
		});

		it("updates inverted section when value is changed to false", function(done) {
			render("{{^section}}Hello World{{/section}}", { section: true });
			tpl.set("section", false);

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("updates non-empty list when all items are removed from it", function(done) {
			render("{{^list}}Hello World{{/list}}", { list: [ 0 ] });
			tpl.get("list").pop();

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("renders inverted section in element", function() {
			var nodes = render("<div>{{^section}}Hello World{{/section}}</div>", { section: false });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.element;
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders inverted section in section", function() {
			var nodes = render("{{#s1}}{{^s2}}Hello World{{/s2}}{{/s1}}", { s1: true, s2: false });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			expect(nodes[1]).to.be.comment;
		});
	});

	describe("Elements", function() {
		it("renders element", function() {
			var nodes = render("<div></div>");
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.an.element.with.tagName("div");
		});

		it("renders element in element", function() {
			var nodes = render("<div><span></span></div>");
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.an.element.with.tagName("div");
			expect(nodes[0].childNodes).have.length(1);
			expect(nodes[0].childNodes[0]).to.be.an.element.with.tagName("span");
		});

		it("renders element in section", function() {
			var nodes = render("{{#section}}<div></div>{{/section}}", { section: true });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.an.element.with.tagName("div");
		});
	});

	describe("Element Attributes", function() {
		it("renders basic text attribute", function() {
			var nodes = render("<div x-attr='Hello World'></div>");
			expect(nodes).to.have.length(2);
			expect(nodes[0].getAttribute("x-attr")).to.equal("Hello World");
		});

		it("renders interpolator attribute", function() {
			var nodes = render("<div x-attr='{{ val }}'></div>", { val: "Foo & \"Bar\" <span>" });
			expect(nodes).to.have.length(2);
			expect(nodes[0].getAttribute("x-attr")).to.equal("Foo & \"Bar\" <span>");
		});

		it("renders triple interpolator attribute", function() {
			var nodes = render("<div x-attr='{{{ val }}}'></div>", { val: "Foo & \"Bar\" <span>" });
			expect(nodes).to.have.length(2);
			expect(nodes[0].getAttribute("x-attr")).to.equal("Foo & \"Bar\" <span>");
		});

		it.skip("renders section attribute", function() {
			var nodes = render("<div x-attr='{{#section}}Hello World{{/section}}'></div>", { section: true });
			expect(nodes).to.have.length(2);
			expect(nodes[0].getAttribute("x-attr")).to.equal("Hello World");
		});

		it("updates attribute when value changes", function(done) {
			var nodes = render("<div x-attr='{{ val }}'></div>", { val: "Hello World" });
			tpl.set("val", "foo");

			renderWait(function() {
				expect(nodes[0].getAttribute("x-attr")).to.equal("foo");
			}, done);
		});
	});

	describe("Decorators", function() {
		function render(template, scope) {
			tpl = new Mustache(template, scope);
			return getNodes();
		}

		it("calls decorator when element is created", function() {
			render("<div custom='A fancy attribute'></div>");
			var seen = 0;

			tpl.decorate("custom", function(el) {
				expect(this).to.equal(tpl);
				expect(el).to.be.an.element.with.tagName("div");
				seen++;

				return {
					update: function(val) {
						expect(this).to.equal(tpl);
						expect(val).to.equal('A fancy attribute');
						seen++;
					},
					destroy: function() {
						expect(this).to.equal(tpl);
						seen++;
					}
				}
			});

			tpl.paint(doc).detach();
			expect(seen).to.equal(3);
		});

		it("calls update() when data changes", function(done) {
			render("<div custom='{{ val }}'></div>", { val: "Hello World" });
			var seen = 0;

			tpl.decorate("custom", function(el, t) {
				return { update: function(o) {
					if (seen === 0) expect(o).to.equal("Hello World");
					if (seen === 1) expect(o).to.equal("Foo Bar");
					seen++;
				} }
			});

			tpl.paint(doc);
			tpl.set("val", "Foo Bar");

			renderWait(function() {
				expect(seen).to.equal(2);
			}, done);
		});

		it("calls destroy() when element is removed", function() {
			render("<div custom='{{ val }}'></div>", { val: "Hello World" });
			var seen = false;

			tpl.decorate("custom", function() {
				return { destroy: function() {
					seen = true;
				} }
			});

			tpl.paint(doc).detach();
			expect(seen).to.be.ok;
		});

		it("parses boolean argument", function() {
			render("<span custom='true'></span>", { val: "World" });
			var seen = false;

			tpl.decorate("custom", function() {
				return {
					parse: "text",
					update: function(val) {
						expect(val).to.equal(true);
						seen = true;
					}
				}
			});

			tpl.paint(doc);
			expect(seen).to.be.ok;
		});

		it("parses numeric argument", function() {
			render("<span custom='1234.56'></span>", { val: "World" });
			var seen = false;

			tpl.decorate("custom", function() {
				return {
					parse: "text",
					update: function(val) {
						expect(val).to.equal(1234.56);
						seen = true;
					}
				}
			});

			tpl.paint(doc);
			expect(seen).to.be.ok;
		});

		it("parses string argument", function() {
			render("<span custom='\"Hello \\\\\"World\\\\\"\"'></span>", { val: "World" });
			var seen = false;

			tpl.decorate("custom", function() {
				return {
					parse: "text",
					update: function(val) {
						expect(val).to.equal('Hello "World"');
						seen = true;
					}
				}
			});

			tpl.paint(doc);
			expect(seen).to.be.ok;
		});

		it("parses several arguments", function() {
			render("<span custom='\"Hello\", {{ val }}, true'></span>", { val: "World" });
			var seen = false;

			tpl.decorate("custom", function() {
				return {
					parse: "text",
					update: function(a1, a2, a3) {
						expect(a1).to.equal("Hello");
						expect(a2).to.equal("World");
						expect(a3).to.equal(true);
						seen = true;
					}
				}
			});

			tpl.paint(doc);
			expect(seen).to.be.ok;
		});

		it("calls decorator nested in section", function() {
			render("{{#section}}<div custom='{{ val }}'></div>{{/section}}", { val: "Hello World", section: true });
			var seen = false;

			tpl.decorate("custom", function() {
				seen = true;
			});

			tpl.paint(doc);
			expect(seen).to.be.ok;
		});

		it("calls decorator nested in element", function() {
			render("<div><span custom='{{ val }}'></span></div>", { val: "Hello World" });
			var seen = false;

			tpl.decorate("custom", function(el) {
				expect(el).to.be.an.element.with.tagName("span");
				seen = true;
			});

			tpl.paint(doc);
			expect(seen).to.be.ok;
		});

		it("stops decorating", function() {
			render("<span custom='{{ val }}'></span>", { val: "Hello World" });
			var seen = false,
				decorator = function(el) { seen = true; };

			tpl.decorate("custom", decorator);
			tpl.stopDecorating("custom", decorator);

			tpl.paint(doc);
			expect(seen).to.not.be.ok;
		});
	});

	describe("Text Nodes", function() {
		it("renders text node", function() {
			var nodes = render("Hello World");
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});

		it("renders text node in element", function() {
			var nodes = render("<div>Hello World</div>");
			expect(nodes).to.have.length(2);
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].childNodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});

		it("renders text node in section", function() {
			var nodes = render("{{#section}}Hello World{{/section}}", { section: true });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});
	});

	describe("Interpolators", function() {
		it("renders interpolator", function() {
			var nodes = render("{{ val }}", { val: "Hello World" });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});

		it("updates when value changes", function(done) {
			var nodes = render("{{ val }}", { val: "Hello World" });
			tpl.set("val", "FooBar");

			renderWait(function() {
				expect(nodes).to.have.length(2);
				expect(nodes[0]).to.be.a.textNode.with.nodeValue("FooBar");
			}, done);
		});

		it("renders interpolator in element", function() {
			var nodes = render("<div>{{ val }}</div>", { val: "Hello World" });
			expect(nodes).to.have.length(2);
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].childNodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});

		it("renders interpolator in section", function() {
			var nodes = render("{{#section}}{{ val }}{{/section}}", { section: true, val: "Hello World" });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.a.textNode.with.nodeValue("Hello World");
		});
	});

	describe("Triple Interpolators", function() {
		it("renders triple interpolator", function() {
			var nodes = render("{{{ val }}}", { val: "<span>" });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.an.element.with.tagName("span");
			expect(nodes[1]).to.be.a.comment;
		});

		it("updates when value changes", function(done) {
			render("{{{ val }}}", { val: "<span>" });
			tpl.set("val", "<div></div>Hello World");

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(3);
				expect(nodes[0]).to.be.a.element.with.tagName("div");
				expect(nodes[1]).to.be.a.textNode.with.nodeValue("Hello World");
			}, done);
		});

		it("renders triple interpolator in element", function() {
			var nodes = render("<div>{{{ val }}}</div>", { val: "<span>" });
			expect(nodes).to.have.length(2);
			expect(nodes[0].childNodes).to.have.length(1);
			expect(nodes[0].childNodes[0]).to.be.an.element.with.tagName("span");
		});

		it("renders triple interpolator in section", function() {
			var nodes = render("{{#section}}{{{ val }}}{{/section}}", { section: true, val: "<span>" });
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.an.element.with.tagName("span");
		});
	});

	describe("Partials", function() {
		it("sets a string partial", function() {
			tpl = new Mustache("{{> partial }}");
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			expect(tpl.findPartial("partial")).to.be.ok;
		});

		it("sets a parsed template partial", function() {
			tpl = new Mustache("{{> partial }}");
			tpl.setPartial("partial", Mustache.parse("<h1>{{ value }}</h1>"));
			expect(tpl.findPartial("partial")).to.be.ok;
		});

		it("sets a subclass of temple partial", function() {
			tpl = new Mustache("{{> partial }}");
			tpl.setPartial("partial", Mustache.extend({ template: "<h1>{{ value }}</h1>" }));
			expect(tpl.findPartial("partial")).to.be.ok;
		});

		it("unsets a partial on null", function() {
			tpl = new Mustache("{{> partial }}");
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			tpl.setPartial("partial", null);
			expect(tpl.findPartial("partial")).to.not.be.ok;
		});

		it("renders partial into component", function() {
			tpl = new Mustache("{{> partial }}", { value: "Hello World" });
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			tpl.mount().paint(doc);

			var nodes = getNodes();
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.element.with.tagName("h1");
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("find component by partial name", function() {
			tpl = new Mustache("{{> partial }}", { value: "Hello World" });
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			tpl.mount().paint(doc);

			var comps = tpl.getComponents("partial");
			expect(comps).to.have.length(1);
			expect(comps[0]).to.be.instanceof(Mustache);
		});

		it("renders partial in element", function() {
			tpl = new Mustache("<h1>{{> partial }}</h1>", { value: "Hello World" });
			tpl.setPartial("partial", "{{ value }}");
			tpl.mount().paint(doc);

			var nodes = getNodes();
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.element.with.tagName("h1");
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
		});

		it("renders partial in section", function() {
			tpl = new Mustache("{{#section}}{{> partial }}{{/section}}", { value: "Hello World", section: true });
			tpl.setPartial("partial", "<h1>{{ value }}</h1>");
			tpl.paint(doc);

			var nodes = getNodes();
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.be.element.with.tagName("h1");
			expect(nodes[0].firstChild).to.be.textNode.with.nodeValue("Hello World");
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
			tpl.set("section", true);

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
			tpl.set("section", true);

			renderWait(function() {
				var nodes = tpl.findAll("span");
				expect(nodes).to.have.length(2);
				nodes.forEach(function(node) { expect(node).to.be.an.element.with.tagName("span"); });
			}, done);
		});

	});

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
					// output = Mustache.render(test.template, test.view, { partial: test.partial });
				} else {
					tpl = new Mustache(test.template, test.view);
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

});
