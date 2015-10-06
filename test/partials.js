var test = require("tape");
var Temple = require("../");
var render = require("./_utils").render;

test("=== Partials ===", function(_t) {
	var test = _t.test;

	test("sets a string partial", function(t) {
		t.plan(1);
		Temple.partials.set("partial", "<h1>{{ value }}</h1>");
		t.equal(typeof Temple.partials.find("partial"), "function", "has the partial");
	});

	test("sets a partial function", function(t) {
		t.plan(1);
		var fn = function(){};
		Temple.partials.set("partial", fn);
		t.equal(Temple.partials.find("partial"), fn, "has the partial");
	});

	test("unsets a partial on null", function(t) {
		t.plan(1);
		Temple.partials.set("partial", "<h1>{{ value }}</h1>");
		Temple.partials.set("partial", null);
		t.notOk(Temple.partials.find("partial"), "does not have the partial");
	});

	test("renders partial", function(t) {
		t.plan(3);
		var view = render("{{> partial }}", { value: "Hello World" }, {
			partials: { partial: "{{ value }}" }
		});
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.TEXT_NODE, "has text node");
		t.equal(el.firstChild.nodeValue, "Hello World", "has correct value");
		view.detach();
	});

	test("renders global partial", function(t) {
		t.plan(3);
		Temple.partials.set("partial", "{{ value }}");
		var view = render("{{> partial }}", { value: "Hello World" });
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.TEXT_NODE, "has text node");
		t.equal(el.firstChild.nodeValue, "Hello World", "has correct value");

		view.detach();
		Temple.partials.set("partial", null);
	});

	test("renders partial in element", function(t) {
		t.plan(6);
		var view = render("<div>{{> partial }}</div>", { value: "Hello World" }, {
			partials: { partial: "{{ value }}" }
		});
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.ELEMENT_NODE, "has element node");
		t.equal(el.firstChild.tagName, "DIV", "is a div");
		t.equal(el.firstChild.childNodes.length, 1, "has one node in div");
		t.equal(el.firstChild.firstChild.nodeType, document.TEXT_NODE, "has text node");
		t.equal(el.firstChild.firstChild.nodeValue, "Hello World", "has correct value");
		view.detach();
	});

	test("renders partial in section", function(t) {
		t.plan(3);
		var view = render("{{#section}}{{>partial}}{{/section}}", {
			section: true,
			value: "Hello World"
		}, {
			partials: { partial: "{{ value }}" }
		});
		var el = view.el;

		t.equal(el.childNodes.length, 1, "has one node in view");
		t.equal(el.firstChild.nodeType, document.TEXT_NODE, "has text node");
		t.equal(el.firstChild.nodeValue, "Hello World", "has correct value");

		view.detach();
	});

	test("renders nothing if partial doesn't exist", function(t) {
		t.plan(1);
		var view = render("{{> partial }}");
		var el = view.el;

		t.equal(el.childNodes.length, 0, "has no nodes in view");
		view.detach();
	});

	_t.end();
});
