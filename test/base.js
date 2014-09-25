describe("Base Binding", function() {
	var binding;

	this.timeout(1000);
	this.slow(200);

	afterEach(function() {
		binding.detach();
		binding.stop();
		binding = null;
	});

	beforeEach(function() {
		binding = new Temple();
	});

	it("static properties return correct values for un-mounted root node with children", function() {
		var children = [ new Temple.Text, new Temple.Text, new Temple.Text ];
		binding.append(children);

		expect(binding.isRoot).to.equal(true);
		expect(binding.hasChildren).to.equal(true);
		expect(binding.firstChild).to.equal(children[0]);
		expect(binding.lastChild).to.equal(children[2]);
		expect(binding.nextSibling).to.equal(null);
		expect(binding.previousSibling).to.equal(null);
		expect(binding.parentNode).to.equal(null);
		expect(binding.firstNode).to.equal(children[0].node);
		expect(binding.nextSiblingNode).to.equal(null);
	});

	describe("Children", function() {
		it("adds child binding", function() {
			binding.appendChild(new Temple());
			expect(binding.children).to.have.length(1);
		});

		it("adds child binding before existing binding", function() {
			var existing = binding.appendChild(new Temple()),
				child = binding.insertBefore(new Temple(), existing);

			expect(binding.children).to.have.length(2);
			expect(binding.children).to.deep.equal([ child, existing ]);
		});

		it("passing a string creates and adds a new text binding", function() {
			expect(binding.appendChild("foo")).to.be.instanceof(Temple.Text);
		});

		it("throws error if attempting to add something that isn't a binding", function() {
			expect(function() {
				binding.appendChild({ not: "a binding" });
			}).to.throw(Error);

			expect(function() {
				binding.insertBefore(new Temple(), { not: "a binding" });
			}).to.throw(Error);
		});

		it("throws error if existing binding is not a child of parent", function() {
			var existing = new Temple();

			expect(function() {
				binding.insertBefore(new Temple(), existing);
			}).to.throw(Error);
		});

		it("throws error when attempting to add binding as child of itself", function() {
			expect(function() {
				binding.appendChild(binding);
			}).to.throw(Error);
		});

		it("throws error when attempting to add binding before itself", function() {
			var b = new Temple;

			expect(function() {
				binding.insertBefore(b, b);
			}).to.throw(Error);
		});

		it("does nothing when adding a child if it is already at position in parent", function() {
			var child = binding.appendChild(new Temple());

			binding.on("child:remove", function(b) {
				throw new Error("child was removed!");
			});

			binding.on("child:add", function(b) {
				throw new Error("child was added!");
			});

			binding.on("child:move", function(b) {
				throw new Error("child was moved!");
			});

			binding.appendChild(child);
			expect(child.parent).to.equal(binding);
		});

		it("moves child if already in parent at a different location", function() {
			var first = binding.appendChild(new Temple()),
				child = binding.appendChild(new Temple()),
				moved = 0;

			binding.on("child:remove", function(b) {
				throw new Error("child was removed!");
			});

			binding.on("child:add", function(b) {
				throw new Error("child was added!");
			});

			binding.on("child:move", function(b) {
				if (child === b) moved++;
			});

			expect(child.previousSibling).to.equal(first);
			expect(child.nextSibling).to.be.null;

			binding.insertBefore(child, first);
			expect(child.previousSibling).to.be.null;
			expect(child.nextSibling).to.equal(first);

			binding.appendChild(child);
			expect(child.previousSibling).to.equal(first);
			expect(child.nextSibling).to.be.null;
		
			expect(moved).to.equal(2);
		});

		it("removes child binding", function() {
			var child = binding.appendChild(new Temple());
			binding.removeChild(child);
			expect(binding.children).to.have.length(0);
		});

		it("removes child binding from existing parent before adding", function() {
			var other = new Temple(),
				child = new Temple(),
				removed = false,
				added = false;

			other.on("child:remove", function(b) {
				if (child === b) removed = true;
				expect(added).to.not.be.ok;
			});

			binding.on("child:add", function(b) {
				if (child === b) added = true;
				expect(removed).to.be.ok;
			});

			other.appendChild(child);
			binding.appendChild(child);

			expect(child.parent).to.equal(binding);
			expect(removed).to.be.ok;
		});

		it("empty removes all children of binding", function() {
			binding.append(new Temple, new Temple);
			expect(binding.children).to.have.length(2);
			binding.empty();
			expect(binding.children).to.have.length(0);
		});
	});

	describe("Nodes & Painting", function() {
		it("updateNodes fires event and updates children nodes", function() {
			var child = binding.appendChild(new Temple),
				evt = 0;
			
			binding.on("update", function() { evt++; });
			child.on("update", function() { evt++; });
			binding.updateNodes();

			expect(evt).to.equal(2);
		});

		it("toNodes produces an array of dom nodes", function() {
			var children = [ new Temple.Text, new Temple.Text ];
			binding.append(children);

			var nodes = binding.toNodes();
			expect(nodes).to.be.an.array;
			expect(nodes).to.have.length(2);
			expect(nodes[0]).to.equal(children[0].node);
			expect(nodes[1]).to.equal(children[1].node);
		});

		it("toString produces children HTML equivalent", function() {
			binding.appendChild("Hello World");
			expect(binding.toString()).to.equal("Hello World");
		});

		it("paint appends binding to parent node, before child", function() {
			var child = new Temple.Text,
				parent = document.createElement("div"),
				sibling = parent.appendChild(document.createElement("span"));

			binding.append(child);
			binding.paint(parent, sibling);

			expect(parent.firstChild).to.equal(child.node);
			expect(binding.placeholder.nextSibling).to.equal(sibling);
			expect(child.node.nextSibling).to.equal(binding.placeholder);
		});

		it("paint appends binding to parent node, before child, specified by selector", function() {
			var child = new Temple.Text,
				sibling = document.body.appendChild(document.createElement("span"));

			sibling.id = "test-sibling";
			binding.append(child);
			binding.paint("body", "#test-sibling");

			expect(document.body.contains(child.node)).to.be.ok;
			expect(binding.placeholder.nextSibling).to.equal(sibling);
			expect(child.node.nextSibling).to.equal(binding.placeholder);

			document.body.removeChild(sibling);
		});

		it("emits detach event on detach", function() {
			var seen = false;
			binding.once("detach", function() { seen = true; });
			binding.detach();
			expect(seen).to.be.ok;
		});
	});

	describe("Mount Cycle & Reactivity", function(){
		it("autorun creates a new computation", function() {
			var seen = false;

			binding.autorun(function() {
				expect(this).to.equal(binding);
				seen = true;
			});

			expect(seen).to.be.ok;
		});

		it("autorun immediately stops the computation if second argument is true and there is no active computation", function() {
			var seen = false;

			binding.autorun(function(comp) {
				expect(this).to.equal(binding);

				comp.onInvalidate(function() {
					expect(this).to.equal(binding);
					expect(comp.stop).to.be.ok;
					seen = true;
				});
			}, true);

			expect(seen).to.be.ok;
		});
		
		it("calls render on mount", function() {
			var seen = false;

			binding.render = function() {
				seen = true;
			}

			binding.mount();
			expect(seen).to.be.ok;
		});
	});
});