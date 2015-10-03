var test = require("tape");
var create = require("./_utils").create;
var Trackr = require("trackr");
var TrackrObjects = require("trackr-objects");
var ReactiveMap = TrackrObjects.Map;

test("=== Decorators ===", function(_t) {
	var test = _t.test;

	function doc() {
		return document.createDocumentFragment();
	}

	test("calls decorator when element is created", function(t) {
		t.plan(3);
		t.timeoutAfter(500);
		var view = create("<div custom='A fancy attribute'></div>");

		view.decorate("custom", function(d) {
			t.equal(this, view, "context is the view");
			t.equal(d.target.nodeType, document.ELEMENT_NODE, "target is an element");
			t.equal(d.target.tagName, "DIV", "target is a div");
			view.detach();
		});

		view.paint(doc());
	});

	test("calls decorator again when data changes", function(t) {
		t.plan(3);
		t.timeoutAfter(500);
		var data = new ReactiveMap({ val: "Hello World" });
		var view = create("<div custom='{{ val }}'></div>", data);
		var seen = 0;

		view.decorate("custom", function(d, o) {
			if (seen === 0) t.equal(o, "Hello World", "has the correct value");
			if (seen === 1) t.equal(o, "Foo Bar", "has the correct value");
			seen++;
		});

		view.paint(doc());

		setTimeout(function() {
			data.set("val", "Foo Bar");
			Trackr.flush();

			t.equal(seen, 2, "ran the decorator twice");
			view.detach();
		}, 100);
	});

	test("parses boolean argument", function(t) {
		t.plan(1);
		t.timeoutAfter(500);
		var view = create("<span custom='true'></span>");

		view.decorate("custom", function(d, val) {
			t.equal(val, true, "has boolean value");
			view.detach();
		});

		view.paint(doc());
	});

	test("parses numeric argument", function(t) {
		t.plan(1);
		t.timeoutAfter(500);
		var view = create("<span custom='1234.56'></span>");

		view.decorate("custom", function(d, val) {
			t.equal(val, 1234.56, "has numeric value");
			view.detach();
		});

		view.paint(doc());
	});

	test("parses string argument", function(t) {
		t.plan(1);
		t.timeoutAfter(500);
		var view = create('<span custom=\'"Hello \\\\"World\\\\""\'></span>');

		view.decorate("custom", function(d, val) {
			t.equal(val, 'Hello "World"', "has string value");
			view.detach();
		});

		view.paint(doc());
	});

	test("parses several arguments", function(t) {
		t.plan(3);
		t.timeoutAfter(500);
		var view = create("<span custom='\"Hello\", {{ val }}, true'></span>", { val: "World" });

		view.decorate("custom", function(d, a1, a2, a3) {
			t.equal(a1, "Hello", "1st argument is correct");
			t.equal(a2, "World", "2nd argument is correct");
			t.equal(a3, true, "3rd argument is correct");
			view.detach();
		});

		view.paint(doc());
	});

	test("calls decorator nested in section", function(t) {
		t.plan(1);
		t.timeoutAfter(500);
		var view = create("{{#section}}<div custom></div>{{/section}}", { section: true });

		view.decorate("custom", function() {
			t.pass("ran decorator in a section");
		});

		view.paint(doc());
	});

	test("calls decorator nested in element", function(t) {
		t.plan(1);
		t.timeoutAfter(500);
		var view = create("<div><span custom></span></div>");

		view.decorate("custom", function() {
			t.pass("ran decorator in a element");
		});

		view.paint(doc());
	});

	test("removes decorators", function(t) {
		t.plan(1);
		t.timeoutAfter(500);
		var view = create("<span custom></span>");
		var seen = 0;
		var decorator = function() { seen++; };

		view.decorate("custom", decorator);
		view.stopDecorating("custom", decorator);

		view.paint(doc());

		setTimeout(function() {
			t.equal(seen, 0, "did not call the decorator");
			view.detach();
		}, 100);
	});
	
	_t.end();
});
