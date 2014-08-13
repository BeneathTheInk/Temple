describe("Bindings", function() {
	var binding;

	this.timeout(1000);
	this.slow(200);

	afterEach(function() {
		binding = null;
	});

	describe("Base", function() {
		beforeEach(function() {
			binding = new Temple();
		});

		it("emits detach event on detach", function() {
			var seen = false;
			binding.once("detach", function() { seen = true; });
			binding.detach();
			expect(seen).to.be.ok;
		});

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

		it("removes child binding", function() {
			var child = binding.appendChild(new Temple());
			binding.removeChild(child);
			expect(binding.children).to.have.length(0);
		});

		it("removes child binding from exisiting parent before adding", function() {
			var other = new Temple(),
				child = new Temple(),
				removed = false;

			other.on("child:remove", function(b) {
				if (child === b) removed = true;
			});

			other.appendChild(child);
			binding.appendChild(child);

			expect(child.parent).to.equal(binding);
			expect(removed).to.be.ok;
		});

		it("toString produces children HTML equivalent", function() {
			binding.appendChild("Hello World");
			expect(binding.toString()).to.equal("Hello World");
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

		it("removes element from DOM on detach", function() {
			binding.paint(document.createElement("div"));
			binding.detach();
			expect(binding.node.parentNode).to.be.null;
		});

		it("sets string attribute", function() {
			binding.attr("class", "active");
			expect(binding.node.getAttribute("class")).to.equal("active");
		});

		it("sets object of attributes", function() {
			binding.attr({
				class: "active",
				style: "color: red;"
			});

			expect(binding.node.getAttribute("class")).to.equal("active");
			expect(binding.node.style.color).to.equal("red");
		});

		it("gets attribute value", function() {
			binding.attr("title", "Hello World");
			expect(binding.attr("title")).to.equal("Hello World");
		});

		it("removes attribute", function() {
			binding.attr("title", "Hello World");
			binding.removeAttribute("title");
			expect(binding.attr("title")).to.be.null;
		});

		it("finds the element", function() {
			expect(binding.find("div")).to.equal(binding.node);
			expect(binding.findAll("div")).to.deep.equal([ binding.node ]);
		});

		it("toString produces HTML equivalent", function() {
			binding.appendChild("Hello World");
			expect(binding.toString()).to.equal("<div>Hello World</div>");
		});
	});

	describe("Text", function() {
		beforeEach(function() {
			binding = new Temple.Text("Hello World")
		});

		it("appends text node to parent", function() {
			var cont = document.createElement("div");
			binding.paint(cont);

			expect(binding.node).to.be.textNode.with.nodeValue("Hello World");
			expect(cont.childNodes[0]).to.equal(binding.node);
		});

		it("removes text node from DOM on detach", function() {
			var cont = document.createElement("div");
			binding.paint(cont).detach();
			expect(binding.node.parentNode).to.be.null;
		});

		it("toString produces HTML equivalent", function() {
			expect(binding.toString()).to.equal("Hello World");
		});
	});

	describe("HTML", function() {
		it("appends nodes to parent", function() {
			var cont = document.createElement("div");
			binding = new Temple.HTML("<div></div><span></span>");
			binding.paint(cont);

			expect(cont.childNodes).to.have.length(3);
			expect(cont.childNodes[0]).to.be.element.with.tagName("div");
			expect(cont.childNodes[1]).to.be.element.with.tagName("span");
			expect(cont.childNodes[2]).to.be.comment;
		});

		it("removes nodes from DOM on detach", function() {
			binding = new Temple.HTML("<div>");
			var cont = document.createElement("div");
			binding.paint(cont);
			expect(cont.childNodes).to.have.length(2);
			binding.detach();
			expect(cont.childNodes).to.have.length(0);
		});

		it("finds elements", function() {
			binding = new Temple.HTML("<div><span></span></div>");
			expect(binding.find("span")).to.equal(binding.firstNode.firstChild);
			expect(binding.findAll("span")).to.deep.equal([ binding.firstNode.firstChild ]);
		});

		it("toString produces HTML equivalent", function() {
			binding = new Temple.HTML("<div></div><span>");
			expect(binding.toString()).to.equal("<div></div><span></span>");
		});
	});

	describe("React", function() {

	});

});
