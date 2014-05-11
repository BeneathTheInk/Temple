var _ = require("underscore"),
	chai = require("chai");

describe("#render(), #paint() & the Live DOM", function() {
	var tpl, doc;

	this.timeout(1000);

	before(function() {
		doc = document.createDocumentFragment();
	});

	afterEach(function() {
		if (tpl != null) tpl.takedown();
		expect(doc.childNodes.length).to.equal(0);
	});

	function render(template, scope) {
		tpl = new Temple(template, scope);
		tpl.paint(doc);
		return getNodes();
	}

	function getNodes() {
		return _.toArray(doc.childNodes);
	}

	function renderWait(fn, done) {
		setTimeout(function() {
			try { fn(); done(); }
			catch(e) { done(e); }
		}, 10);
	}

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
			expect(nodes).to.have.length(1);
			expect(nodes[0]).to.be.element;
			expect(nodes[0].childNodes).to.have.length(2);
			expect(nodes[0].childNodes[0]).to.be.textNode.with.nodeValue("Hello World");
		});
		
		it("renders section in section", function() {
			var nodes = render("{{#s1}}{{#s2}}Hello World{{/s2}}{{/s1}}", { s1: true, s2: true });
			expect(nodes).to.have.length(3);
			expect(nodes[0]).to.be.textNode.with.nodeValue("Hello World");
			expect(nodes[1]).to.be.comment;
			expect(nodes[2]).to.be.comment;
		});

		it("renders arrays", function() {
			var nodes = render("{{#list}}{{ this }}{{/list}}", { list: [ 0, 1, 2 ] });
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
			render("{{#list}}{{ foo }}{{/list}}", { list: [ 0, { foo: "bar" }, 2 ] });
			tpl.set("list.1.foo", "Hello World");

			renderWait(function() {
				var nodes = getNodes();
				expect(nodes).to.have.length(4);
				expect(nodes[1]).to.be.textNode.with.nodeValue("Hello World");
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
			expect(nodes).to.have.length(2);
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
			tpl.set("val", "foo");

			renderWait(function() {
				expect(nodes[0].getAttribute("x-attr")).to.equal("foo");
			}, done);
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
			expect(nodes).to.have.length(2);
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
			tpl.set("val", "FooBar");

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
			expect(nodes).to.have.length(1);
			expect(nodes[0].childNodes).to.have.length(2);
			expect(nodes[0].childNodes[0]).to.be.an.element.with.tagName("span");
		});

		it("renders triple interpolator in section", function() {
			var nodes = render("{{#section}}{{{ val }}}{{/section}}", { section: true, val: "<span>" });
			expect(nodes).to.have.length(3);
			expect(nodes[0]).to.be.an.element.with.tagName("span");
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

});