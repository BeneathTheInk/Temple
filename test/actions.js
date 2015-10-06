var test = require("tape");
var utils = require("./_utils");
var create = utils.create;
var createDocument = utils.createDocument;
var Temple = require("../");

function render() {
	var view = create.apply(this, arguments);
	view.use("actions");
	view.paint(createDocument());
	return view;
}

test("=== Actions ===", function(_t) {
	var test = _t.test;

	test("fires action when triggered", function(t) {
		t.plan(1);
		var view = render("<a on-click=\"alert\">Alert</a>");
		var el = view.el;

		view.addAction("alert", function() {
			t.pass("click action was called");
		});

		setTimeout(function() {
			el.querySelector("a").click();
			view.detach();
		}, 150);
	});

	test("fires multiple actions", function(t) {
		t.plan(2);
		var view = render("<a on-click=\"alert\" on-click=\"alert2\">Alert</a>");
		var el = view.el;

		view.actions({
			alert: function() { t.pass("called first action"); },
			alert2: function() { t.pass("called second action"); }
		});

		setTimeout(function() {
			el.querySelector("a").click();
			view.detach();
		}, 150);
	});

	test("fires actions with arguments", function(t) {
		t.plan(3);
		var view = render("<a on-click=\"alert, 'Hello World', {{ val }}, true\">Alert</a>", { val: 123 });
		var el = view.el;

		view.addAction("alert", function(e, a1, a2, a3) {
			t.equal(a1, "Hello World", "has first argument");
			t.equal(a2, 123, "has second argument");
			t.equal(a3, true, "has third argument");
		});

		setTimeout(function() {
			el.querySelector("a").click();
			view.detach();
		}, 150);
	});

	test("doesn't fire action when element is detached", function(t) {
		var view = render("<a on-click=\"alert\">Alert</a>");
		var el = view.el;
		var anchor = el.querySelector("a");

		view.addAction("alert", function() {
			t.fail("called the action");
		});

		setTimeout(function() {
			view.detach();
			anchor.click();
			t.end();
		}, 150);
	});

	test("provides action instance on fire", function(t) {
		t.plan(7);
		var view = render("<a on-click=\"alert\">Alert</a>");
		var el = view.el;

		view.addAction("alert", function(e) {
			t.equal(this, view, "called in context of view");
			t.ok(e instanceof Temple.actions.Action, "action instance");
			t.ok(e.original instanceof Event, "has original event instance");
			t.equal(e.target.nodeType, document.ELEMENT_NODE, "has element node");
			t.equal(e.target.tagName, "A", "is an anchor");
			t.ok(e.context instanceof Temple.Context, "has the calling context");
			t.ok(e.view instanceof Temple.View, "has the calling view");
		});

		setTimeout(function() {
			el.querySelector("a").click();
			view.detach();
		}, 150);
	});

	test("bubbles actions to parent components, even when child doesn't have the plugin", function(t) {
		t.plan(1);
		var Child = utils.compile("<a on-click=\"alert\">Alert</a>");
		var view = render("<" + Child.prototype.tagName + " />");
		var el = view.el;

		view.addAction("alert", function() {
			t.pass("called the action");
		});

		setTimeout(function() {
			el.querySelector("a").click();
			view.detach();
		}, 150);
	});

	test("doesn't bubble actions to parent component if stopPropagation is called", function(t) {
		t.plan(1);

		var Child = utils.compile("<a on-click=\"alert\">Alert</a>");
		Child.use("actions");
		Child.addAction("alert", function(e) {
			t.pass("called the child's action");
			e.stopPropagation();
		});

		var view = render("<" + Child.prototype.tagName + " />");
		var el = view.el;
		view.addAction("alert", function() {
			t.fail("called the parent's action");
		});

		setTimeout(function() {
			el.querySelector("a").click();
			view.detach();
		}, 150);
	});

	_t.end();
});
