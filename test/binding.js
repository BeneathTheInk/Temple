describe("Bindings", function() {
	var binding;

	this.timeout(1000);
	this.slow(200);

	afterEach(function() {
		if (binding != null) binding.detach();
		binding = null;
	});

	describe("Base", function() {
		beforeEach(function() {
			binding = new Temple.Binding();
		});

		it("emits detach event on detach", function() {
			var seen = false;
			binding.once("detach", function() { seen = true; });
			binding.mount();
			binding.detach();
			expect(seen).to.be.ok;
		});

		it("adds child binding", function() {
			binding.addChild(new Temple.Binding());
			expect(binding.children).to.have.length(1);
		});

		it("removes child binding", function() {
			var child = new Temple.Binding();
			binding.addChild(child);
			binding.removeChild(child);
			expect(binding.children).to.have.length(0);
		});

		it("removes child binding from exisiting parent before adding", function() {
			var other = new Temple.Binding(),
				child = new Temple.Binding(),
				removed = false;

			other.on("child:remove", function(b) {
				if (child === b) removed = true;
			});

			other.addChild(child);
			binding.addChild(child);

			expect(child.parent).to.equal(binding);
			expect(removed).to.be.ok;
		});
	});

	describe("Element", function() {
		beforeEach(function() {
			binding = new Temple.Element("div");
		});

		it("appends element to parent node", function() {
			expect(binding.node).to.be.element;
			expect(binding.node).to.have.tagName("div");

			var cont = document.createElement("div");
			binding.paint(cont);

			expect(cont.childNodes[0]).to.equal(binding.node);
		});

		it("find returns element on matching selector", function() {
			var cont = document.createElement("span");
			binding.paint(cont);
			expect(binding.find("div")).to.equal(binding.node);
		});

		it("sets string attribute", function() {
			binding.attr("class", "active");
			binding.paint();
			expect(binding.node.getAttribute("class")).to.equal("active");
		});

		it("sets reactive attribute", function(done) {
			var model = new Temple.Model({ className: "active" });
			
			binding.attr("class", function() {
				return model.get("className");
			});
			binding.paint();
			
			expect(binding.node.getAttribute("class")).to.equal("active");
			model.set("className", "inactive");

			renderWait(function() {
				expect(binding.node.getAttribute("class")).to.equal("inactive");
			}, done);
		});

		it("sets mixed object of attributes", function() {
			var model = new Temple.Model({ color: "red" });
			
			binding.attr({
				"class": "active",
				style: function() {
					return "color: " + model.get("color") + ";";
				}
			});
			binding.paint();

			expect(binding.node.getAttribute("class")).to.equal("active");
			expect(binding.node.style.color).to.equal("red");
		});

		it("removes element from DOM on detach", function() {
			binding.paint();
			binding.detach();
			expect(binding.node.parentNode).to.be.null;
		});
	});

	describe("Text", function() {
		it("appends text node to parent", function() {
			var cont = document.createElement("div");
			binding = new Temple.Text("Hello World").paint(cont);

			expect(binding.node).to.be.textNode.with.nodeValue("Hello World");
			expect(cont.childNodes[0]).to.equal(binding.node);
		});

		it("updates value reactively", function(done) {
			var model = new Temple.Model({ foo: "bar" });

			binding = new Temple.Text(function() {
				return model.get("foo");
			}).paint();

			expect(binding.node).to.be.textNode.with.nodeValue("bar");
			model.set("foo", "Hello World");

			renderWait(function() {
				expect(binding.node).to.have.nodeValue("Hello World");
			}, done);
		});

		it("removes text node from DOM on detach", function() {
			binding = new Temple.Text("Hello World").paint();
			binding.detach();
			expect(binding.node.parentNode).to.be.null;
		});
	});

	describe("HTML", function() {
		it("appends nodes to parent", function() {
			binding = new Temple.HTML("<div></div><span></span>");
			binding.paint();

			expect(binding.nodes).to.have.length(2);
			expect(binding.nodes[0]).to.be.element.with.tagName("div");
			expect(binding.nodes[1]).to.be.element.with.tagName("span");

			var cont = document.createElement("div");
			binding.appendTo(cont);

			expect(binding.nodes[0].parentNode).to.equal(cont);
			expect(binding.nodes[1].parentNode).to.equal(cont);
		});

		it("converts string value to html nodes, reactively", function(done) {
			var model = new Temple.Model({ html: "<div>" });

			binding = new Temple.HTML(function() {
				return model.get("html");
			});
			binding.paint();

			expect(binding.nodes).to.have.length(1);
			expect(binding.nodes[0]).to.be.element.with.tagName("div");
			model.set("html", "<span>");

			renderWait(function() {
				expect(binding.nodes).to.have.length(1);
				expect(binding.nodes[0]).to.be.element.with.tagName("span");
			}, done);
		});

		it("removes nodes from DOM on detach", function() {
			binding = new Temple.HTML("<div>");
			var cont = document.createElement("div");
			binding.paint(cont);
			binding.detach();
			expect(binding.nodes).to.have.length(0);
			expect(cont.childNodes).to.have.length(0);
		});
	});

	describe("Each", function() {
		it("renders children bindings for every value in array", function() {
			var seen = 0;

			binding = new Temple.Each(function() {
				seen++;
			}, [ 0, 1, 2 ]);

			binding.paint();

			expect(seen).to.equal(3);
		});

		it("renders each key in plain js objects", function() {
			var seen = 0;

			binding = new Temple.Each(function(row, key) {
				seen++;
				if (seen === 1) expect(key).to.equal("one");
				if (seen === 2) expect(key).to.equal("two");
			});

			binding.set({ one: "Hello", two: "World" });
			binding.paint();

			expect(seen).to.equal(2);
		});

		it("renders nothing on empty array", function() {
			binding = new Temple.Each(function() {
				throw new Error("Row was rendered!");
			}, []);

			binding.paint();
		});

		it("renders new rows of bindings when added to array", function() {
			var seen = 0;

			binding = new Temple.Each(function() {
				seen++;
			}, [0]);

			binding.paint();

			binding.get().push(1);
			expect(seen).to.equal(2);
		});

		it("removes rows of bindings when removed from array", function() {
			var seen = false;

			binding = new Temple.Each(function(row, key) {
				var b = new Temple.Binding();
				b.once("detach", function() {
					seen = true;
				});
				row.addChild(b);
			});

			binding.set(null, [0,1,2]);
			binding.paint();

			binding.get().pop();
			expect(seen).to.be.ok;
		});

		it("removes all rows on detach", function() {
			var seen = 0;

			binding = new Temple.Each(function(row, key) {
				var b = new Temple.Binding();
				b.once("detach", function() {
					seen++;
				});
				row.addChild(b);
			}, [0,1,2]);

			binding.paint();

			binding.detach();
			expect(seen).to.equal(3);
		});
	});

	describe("Scope", function() {
		var scope;

		beforeEach(function() {
			scope = new Temple.Scope();
			scope.set("foo", "bar");
		});

		it("creates a model on constructor if a model isn't passed", function() {
			expect(scope.model).to.be.instanceof(Temple.Model);
		});

	});

});