var test = require("tape");
var render = require("./_utils").render;
var Trackr = require("trackr");
var TrackrObjects = require("trackr-objects");
var ReactiveMap = TrackrObjects.Map;

test("# Elements", function(_t) {
	_t.end();

	test("renders element", function(t) {
		t.plan(4);
		var view = render("<div></div>");
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.childNodes.length, 0, "div has no nodes");
		view.detach();
	});

	test("renders element in element", function(t) {
		t.plan(6);
		var view = render("<div><span></span></div>");
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.childNodes.length, 1, "div has one child");
		t.equal(el.firstChild.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.firstChild.tagName, "SPAN", "is a span");
		view.detach();
	});

	test("renders element in section", function(t) {
		t.plan(4);
		var view = render("{{#section}}<div></div>{{/section}}", { section: true });
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.childNodes.length, 0, "div has no nodes");
		view.detach();
	});

	test("renders basic text attribute", function(t) {
		t.plan(4);
		var view = render("<div x-attr='Hello World'></div>");
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.getAttribute("x-attr"), "Hello World", "has correct attribute value");
		view.detach();
	});

	test("renders interpolator attribute", function(t) {
		t.plan(4);
		var view = render("<div x-attr='{{ val }}'></div>", { val: "Foo & \"Bar\" <span>" });
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.getAttribute("x-attr"), "Foo & \"Bar\" <span>", "has correct attribute value");
		view.detach();
	});

	test("renders triple interpolator attribute", function(t) {
		t.plan(4);
		var view = render("<div x-attr='{{{ val }}}'></div>", { val: "Foo & \"Bar\" <span>" });
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.getAttribute("x-attr"), "Foo & \"Bar\" <span>", "has correct attribute value");
		view.detach();
	});

	test("renders section attribute", function(t) {
		t.plan(4);
		var view = render("<div x-attr='{{#section}}Hello World{{/section}}'></div>", { section: true });
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.getAttribute("x-attr"), "Hello World", "has correct attribute value");
		view.detach();
	});

	test("updates attribute when value changes", function(t) {
		t.plan(5);
		var data = new ReactiveMap({ val: "Hello World" });
		var view = render("<div x-attr='{{ val }}'></div>", data);
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.getAttribute("x-attr"), "Hello World", "has correct attribute value");

		data.set("val", "foo");
		Trackr.flush();

		t.equal(el.firstChild.getAttribute("x-attr"), "foo", "has new attribute value");
		view.detach();
	});
});
