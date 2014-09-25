describe("Library Features", function() {

	it("extend() should create a valid subclass", function() {
		var SubTemple = Temple.extend({
			foo: function(){}
		});

		var tpl = new SubTemple();

		expect(tpl).to.be.instanceof(Temple);
		expect(tpl.foo).to.be.a("function");
	});

	it("fromNode should convert a single DOM node, including all children, into a Temple Element binding", function() {
		var el = document.createElement("div"),
			child = el.appendChild(document.createElement("span"));

		var b = Temple.fromNode(el);
		expect(b).to.be.instanceof(Temple.Element);
		expect(b.node).to.equal(el);
		expect(b.children.length).to.equal(1);
		expect(b.children[0].node).to.equal(child);
	});

	it("fromNode should convert an array of DOM nodes into an array of Temple Element bindings", function() {
		var el1 = document.createElement("div"),
			el2 = document.createElement("span");

		var b = Temple.fromNode([ el1, el2 ]);
		expect(b).to.be.an.array;
		expect(b[0]).to.be.instanceof(Temple.Element);
		expect(b[0].node).to.equal(el1);
		expect(b[1]).to.be.instanceof(Temple.Element);
		expect(b[1].node).to.equal(el2);
	});

	it("fromHTML should convert a valid HTML string into Temple bindings", function() {
		var b = Temple.fromHTML("<span></span><div></div>");
		expect(b).to.be.instanceof(Temple.Binding);
		expect(b.children.length).to.equal(2);
		expect(b.children[0]).to.be.instanceof(Temple.Element);
		expect(b.children[0].tagname).to.equal("span");
		expect(b.children[1]).to.be.instanceof(Temple.Element);
		expect(b.children[1].tagname).to.equal("div");
	});

	it("fromHTML should produce a single Temple Element binding if only one element was given.", function() {
		var b = Temple.fromHTML("<span></span>");
		expect(b).to.be.instanceof(Temple.Element);
		expect(b.tagname).to.equal("span");
	});

	it("fromSelector should take a basic css selector and return a new Temple Element binding.", function() {
		var b = Temple.fromSelector("span.a-class#myid");
		expect(b).to.be.instanceof(Temple.Element);
		expect(b.tagname).to.equal("span");
		expect(b.node.className).to.equal("a-class");
		expect(b.node.id).to.equal("myid");
	});

	it("fromSelector should accept multiple classes and keep their order.", function() {
		var b = Temple.fromSelector("span.class1.class2#myid.class3");
		expect(b).to.be.instanceof(Temple.Element);
		expect(b.tagname).to.equal("span");
		expect(b.node.className).to.equal("class1 class2 class3");
	});

	it("fromSelector should accept only one id", function() {
		expect(function() {
			Temple.fromSelector("span#id1.myclass#id2");
		}).to.throw(Error);
	});

	it("fromSelector should accept attribute tags, with and without quotes", function() {
		var b = Temple.fromSelector("span[attr1=foo][attr2='bar'][attr3=\"baz\"]");
		expect(b).to.be.instanceof(Temple.Element);
		expect(b.tagname).to.equal("span");
		expect(b.getAttribute("attr1")).to.equal("foo");
		expect(b.getAttribute("attr2")).to.equal("bar");
		expect(b.getAttribute("attr3")).to.equal("baz");
	});

});