describe("Bindings", function() {

	this.timeout(1000);
	this.slow(200);

	function renderWait(fn, done) {
		setTimeout(function() {
			try { fn(); done(); }
			catch(e) { done(e); }
		}, 50);
	}

	describe("Base", function() {
		var binding;

		beforeEach(function() {
			binding = new Temple.Binding();
		});

		afterEach(function() {
			if (binding != null) binding.destroy();
			binding = null;
		});

		it("adds children bindings", function() {
			binding.addChild(new Temple.Binding());
			expect(binding.children).to.have.length(1);
		});

		it("removes children bindings", function() {
			var child = new Temple.Binding();
			binding.addChild(child);
			binding.removeChild(child);
			expect(binding.children).to.have.length(0);
		});

		it("throws error when adding a child binding that already has a parent", function() {
			var other = new Temple.Binding(),
				child = new Temple.Binding();

			other.addChild(child);

			expect(function() {
				binding.addChild(child);
			}).to.throw(Error);
		});

		it("autoruns under namespace", function() {
			var seen = false;
			binding.autorun("ns", function() { seen = true; });
			expect(seen).to.be.ok;
		});

		it("stops autorun computations by namespace", function(done) {
			var seen = 0,
				dep = new Temple.Deps.Dependency;
			
			binding.autorun("ns", function() {
				dep.depend();
				seen++;
			});
			
			binding.stopComputation("ns");
			dep.changed();

			renderWait(function() {
				expect(seen).to.equal(1);
			}, done);
		});

		it("clears previous computation when autorun is called with the same namespace", function() {
			var seen = 0;
			
			binding.autorun("ns", function(){ seen++; });
			
			expect(function() {
				binding.autorun("ns", function() { throw new Error; });
			}).to.throw(Error);

			expect(seen).to.equal(1);
		});

		it("calls decorator when render is called", function() {
			var scope = new Temple.Scope(),
				seen = false;

			binding.decorate(function(s) {
				expect(s).to.equal(scope);
				expect(this).to.equal(binding);
				seen = true;
			});

			binding.render(scope);
			expect(seen).to.be.ok;
		});

		it("removes decorator", function() {
			var fn = function(){ throw new Error("Decorator wasn't removed"); }
			binding.decorate(fn);
			binding.stopDecorating(fn);
			binding.render(new Temple.Scope());
		});

		it("emits destroy event on destruction", function() {
			binding.once("destroy", function() { throw new Error; });

			expect(function() {
				binding.destroy();
			}).to.throw(Error);

			binding = null;
		});

		it("removes all children on destruction", function() {
			binding.destroy();
			expect(binding.children).to.have.length(0);
			binding = null;
		});

		it("stops all computations on destruction", function(done) {
			var seen = 0,
				dep = new Temple.Deps.Dependency;

			binding.autorun(function() {
				dep.depend();
				seen++;
			});

			binding.destroy();
			dep.changed();

			renderWait(function() {
				expect(seen).to.equal(1);
			}, done);
		});
	});

	describe("Element", function() {
		var binding;

		beforeEach(function() {
			binding = new Temple.Binding.Element("div");
		});

		afterEach(function() {
			if (binding != null) binding.destroy();
			binding = null;
		});

		it("appends element to parent node", function() {
			expect(binding.node).to.be.element;
			expect(binding.node).to.have.tagName("div");

			var cont = document.createElement("div");
			binding.appendTo(cont);

			expect(cont.childNodes[0]).to.equal(binding.node);
		});

		it("find returns element on matching selector", function() {
			var cont = document.createElement("span");
			binding.appendTo(cont);
			expect(binding.find("div")).to.equal(binding.node);
		});

		it("sets string attribute", function() {
			binding.attr("class", "active");
			binding.render(new Temple.Scope());
			expect(binding.node.getAttribute("class")).to.equal("active");
		});

		it("sets reactive attribute", function(done) {
			binding.attr("class", function(scope) {
				return scope.get("className");
			});

			var scope = new Temple.Scope({ className: "active" });
			binding.render(scope);
			
			expect(binding.node.getAttribute("class")).to.equal("active");
			scope.set("className", "inactive");

			renderWait(function() {
				expect(binding.node.getAttribute("class")).to.equal("inactive");
			}, done);
		});

		it("sets mixed object of attributes", function() {
			binding.attr({
				"class": "active",
				style: function(scope) {
					return "color: " + scope.get("color") + ";";
				}
			});

			var scope = new Temple.Scope({ color: "red" });
			binding.render(scope);

			expect(binding.node.getAttribute("class")).to.equal("active");
			expect(binding.node.style.color).to.equal("red");
		});

		it("removes element from DOM on destruction", function() {
			var cont = document.createElement("span");
			binding.appendTo(cont);
			binding.destroy();
			expect(binding.node.parentNode).to.be.null;
		});
	});

	describe("Text", function() {
		var binding;

		afterEach(function() {
			if (binding != null) binding.destroy();
			binding = null;
		});

		it("appends text node to parent", function() {
			binding = new Temple.Binding.Text("Hello World");
			binding.render(new Temple.Scope());

			expect(binding.node).to.be.textNode.with.nodeValue("Hello World");
			
			var cont = document.createElement("div");
			binding.appendTo(cont);
			expect(cont.childNodes[0]).to.equal(binding.node);
		});

		it("updates value reactively", function(done) {
			binding = new Temple.Binding.Text(function(scope) {
				return scope.get("foo");
			});

			var scope = new Temple.Scope({ foo: "bar" });
			binding.render(scope);

			expect(binding.node).to.be.textNode.with.nodeValue("bar");
			scope.set("foo", "Hello World");

			renderWait(function() {
				expect(binding.node).to.have.nodeValue("Hello World");
			}, done);
		});

		it("removes text node from DOM on destruction", function() {
			binding = new Temple.Binding.Text("Hello World");
			var cont = document.createElement("div");
			binding.appendTo(cont);
			binding.destroy();
			expect(binding.node.parentNode).to.be.null;
		});
	});

	describe("HTML", function() {
		it("appends nodes to parent");
		it("converts string value to html nodes, reactively");
		it("removes nodes from DOM on destruction");
	});

	describe("Context", function() {
		it("renders children bindings with a scope focused at path");
	});

	describe("Each", function() {
		it("renders children bindings into rows for each value in array");
		it("renders each key in plain js objects");
		it("renders nothing on empty array");
		it("renders new rows of bindings when added to array");
		it("removes rows of bindings when removed to array");
		it("removes all rows on destruction");
	});

});