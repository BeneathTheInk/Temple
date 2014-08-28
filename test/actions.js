describe("Actions", function() {
	var tpl, doc;

	this.timeout(1000);

	before(function() {
		doc = document.createDocumentFragment();
	});

	afterEach(function() {
		if (tpl != null) {
			tpl.removeAction();
			tpl.detach();
			tpl = null;
		}
		
		expect(doc.childNodes.length).to.equal(0);
	});

	function render(template, scope) {
		tpl = new Mustache(template, scope);
		tpl.use("actions");
		tpl.paint(doc);
		return tpl;
	}

	function getNodes() {
		var nodes = [];
		for (var i = 0; i < doc.childNodes.length; i++) {
			nodes.push(doc.childNodes[i]);
		}
		return nodes;
	}

	it("fires action when triggered", function() {
		render("<a on-click=\"alert\">Alert</a>");
		var seen = false;

		tpl.addAction("alert", function(e) { seen = true; });
		tpl.find("a").click();

		expect(seen).to.be.ok;
	});

	it("fires multiple actions", function() {
		render("<a on-click=\"alert\" on-click=\"alert2\">Alert</a>");
		var seen = 0;

		tpl.addAction({
			alert: function(e) { seen++; },
			alert2: function(e) { seen++; }
		});

		tpl.find("a").click();

		expect(seen).to.equal(2);
	});

	it("fires actions with arguments", function() {
		render("<a on-click=\"alert, 'Hello World', {{ val }}, true\">Alert</a>", { val: 123 });
		var seen = false;

		tpl.addAction("alert", function(e, a1, a2, a3) {
			expect(a1).to.equal("Hello World");
			expect(a2).to.equal(123);
			expect(a3).to.equal(true);
			seen = true;
		});

		tpl.find("a").click();

		expect(seen).to.be.ok;
	});

	it("doesn't fire action when element is detached", function() {
		render("<a on-click=\"alert\">Alert</a>");
		var seen = false;

		tpl.addAction("alert", function(e) { seen = true; });

		var nodes = getNodes();
		tpl.detach();

		nodes[0].click();
		expect(seen).to.not.be.ok;
	});

	it("provides action instance on fire", function() {
		render("<a on-click=\"alert\">Alert</a>");
		var seen = false;

		tpl.addAction("alert", function(e) {
			expect(this).to.equal(tpl);
			expect(e).to.be.instanceof(Mustache.Action);
			expect(e.original).to.be.instanceof(Event);
			expect(e.node).to.be.instanceof(Element);
			expect(e.context).to.be.instanceof(Mustache.Context);
			seen = true;
		});

		tpl.find("a").click();

		expect(seen).to.be.ok;
	});

	it("bubbles actions to parent components, even when child doesn't have the plugin", function() {
		tpl = new Mustache("{{> child }}");
		tpl.use("actions");
		tpl.setPartial("child", "<a on-click=\"alert\">Alert</a>");
		tpl.paint(doc);

		var seen = false;
		tpl.addAction("alert", function(a) { seen = true; })

		tpl.find("a").click();

		expect(seen).to.be.ok;
	});

	it("doesn't bubble actions to parent component if stopPropagation is called", function() {
		tpl = new Mustache("{{> child }}");
		tpl.use("actions");
		
		var seen = 0;

		tpl.setPartial("child", Mustache.extend({
			initialize: function() {
				this.use("actions");

				this.addAction("alert", function(a) {
					seen++;
					a.stopPropagation();
				});
			},
			template: "<a on-click=\"alert\">Alert</a>"
		}));

		tpl.addAction("alert", function(a) { seen++; });
		
		tpl.paint(doc);
		tpl.find("a").click();

		expect(seen).to.equal(1);
	});
});