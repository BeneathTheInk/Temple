var test = require("tape");
var utils = require("./_utils");
var create = utils.create;
var createDocument = utils.createDocument;

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

	// test("provides action instance on fire", function() {
	// 	render("<a on-click=\"alert\">Alert</a>");
	// 	var seen = false;
	//
	// 	tpl.addAction("alert", function(e) {
	// 		expect(this).to.equal(tpl);
	// 		expect(e).to.be.instanceof(Temple.Action);
	// 		expect(e.original).to.be.instanceof(Event);
	// 		expect(e.target).to.be.instanceof(Element);
	// 		expect(e.model).to.be.instanceof(Temple.Model);
	// 		expect(e.view).to.be.instanceof(Temple.View);
	// 		seen = true;
	// 	});
	//
	// 	tpl.find("a").click();
	//
	// 	expect(seen).to.be.ok;
	// });
	//
	// test("bubbles actions to parent components, even when child doesn't have the plugin", function() {
	// 	tpl = new Temple(null, { template: "{{> child }}" });
	// 	tpl.use("actions");
	// 	tpl.setPartial("child", "<a on-click=\"alert\">Alert</a>");
	// 	tpl.paint(doc);
	//
	// 	var seen = false;
	// 	tpl.addAction("alert", function(a) { seen = true; });
	//
	// 	tpl.find("a").click();
	//
	// 	expect(seen).to.be.ok;
	// });
	//
	// test("doesn't bubble actions to parent component if stopPropagation is called", function() {
	// 	tpl = new Temple(null, { template: "{{> child }}" });
	// 	tpl.use("actions");
	//
	// 	var seen = 0;
	//
	// 	tpl.setPartial("child", Temple.extend({
	// 		initialize: function() {
	// 			this.use("actions");
	//
	// 			this.addAction("alert", function(a) {
	// 				seen++;
	// 				a.stopPropagation();
	// 			});
	// 		},
	// 		template: "<a on-click=\"alert\">Alert</a>"
	// 	}));
	//
	// 	tpl.addAction("alert", function(a) { seen++; });
	//
	// 	tpl.paint(doc);
	// 	tpl.find("a").click();
	//
	// 	expect(seen).to.equal(1);
	// });

	_t.end();
});
