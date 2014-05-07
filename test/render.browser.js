var _ = require("underscore");

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
		return $(doc.childNodes);
	}

	function isComment(node) {
		expect(node).to.have.property("nodeType", 8);
		return true;
	}

	function isElement(node, expected_tag) {
		expect(node).to.have.property("nodeType", 1)
		expect(node).to.have.property("tagName", expected_tag.toUpperCase());
		return true;
	}

	function isTextNode(node, expected_value) {
		expect(node).to.have.property("nodeType", 3)
		expect(node).to.have.property("nodeValue", expected_value);
		return true;
	}

	describe("Sections", function() {
		it("renders section when value is true", function() {
			var $doc = render("{{#section}}Hello World{{/section}}", { section: true });
			expect($doc.length).to.equal(2);
			expect($doc).to.have.text("Hello World");
		});

		it("doesn't render section when value is false", function() {
			tpl = new Temple("{{#section}}Hello World{{/section}}", { section: false });
			tpl.paint(doc);

			expect(doc.childNodes.length).to.equal(1);
			isComment(doc.childNodes[0]);
		});

		it("removes section when value is changed to false", function(done) {
			tpl = new Temple("{{#section}}Hello World{{/section}}", { section: true });
			tpl.paint(doc);

			tpl.set("section", false);

			// deferred because autorun lib waits a cycle
			setTimeout(function() {
				expect(doc.childNodes.length).to.equal(1);
				isComment(doc.childNodes[0]);
				done();
			}, 10);
		});

		it("updates section when value is changed to truthy");

		it("renders section in element");
		it("renders section in section");

		it("renders arrays");
		it("updates single item when value changes");
		it("updates for splice operation");
		it("updates for push operation");
		it("updates for pop operation");
		it("updates for unshift operation");
		it("updates for shift operation");
		it("updates for sort operation");
		it("updates for reverse operation");
	});

	describe("Elements", function() {
		it("renders element", function() {
			tpl = new Temple("<div></div>");
			tpl.paint(doc);

			expect(doc.childNodes.length).to.equal(1);
			expect(doc.childNodes[0]).to.have.property("nodeType", 1)
			expect(doc.childNodes[0]).to.have.property("tagName", "DIV");
		});

		it("renders element in element");
		it("renders element in section");
	});

	describe("Element Attributes", function() {
		it("renders basic text attribute");
		it("renders escaped interpolator attribute");
		it("renders unescaped interpolator attribute");
		it("updates attribute when value changes");
	});

	describe("Text Nodes", function() {
		it("renders text node", function() {
			tpl = new Temple("Hello World");
			tpl.paint(doc);

			expect(doc.childNodes.length).to.equal(1);
			expect(doc.childNodes[0]).to.have.property("nodeType", 3)
			expect(doc.childNodes[0]).to.have.property("nodeValue", "Hello World");
		});

		it("renders text node in element");
		it("renders text node in section");
	});

	describe("Escaped Interpolators", function() {
		it("renders escaped interpolator", function() {
			tpl = new Temple("{{ val }}", { val: "Foo & \"Bar\" <span>" });
			tpl.paint(doc);

			expect(doc.childNodes.length).to.equal(1);
			expect(doc.childNodes[0]).to.have.property("nodeType", 3)
			expect(doc.childNodes[0]).to.have.property("nodeValue", "Foo & \"Bar\" <span>");
		});

		it("updates when value changes");
		it("renders escaped interpolator in element");
		it("renders escaped interpolator in section");
	});

	describe("Unescaped Interpolators", function() {
		it("renders unescaped interpolator", function() {
			tpl = new Temple("{{{ val }}}", { val: "<span>" });
			tpl.paint(doc);

			expect(doc.childNodes[0]).to.have.property("nodeType", 1);
			expect(doc.childNodes[0]).to.have.property("tagName", "SPAN");
		});

		it("updates when value changes");
		it("renders unescaped interpolator in element");
		it("renders unescaped interpolator in section");
	});

});