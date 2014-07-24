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
			binding.detach();
			expect(seen).to.be.ok;
		});

		it("adds child binding", function() {
			binding.appendChild(new Temple.Binding());
			expect(binding.children).to.have.length(1);
		});

		it("removes child binding", function() {
			var child = new Temple.Binding();
			binding.appendChild(child);
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

			other.appendChild(child);
			binding.appendChild(child);

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

		it("removes element from DOM on detach", function() {
			binding.paint(document.createElement("div"));
			binding.detach();
			expect(binding.node.parentNode).to.be.null;
		});

		it.skip("find returns element on matching selector", function() {
			var cont = document.createElement("span");
			binding.paint(cont);
			expect(binding.find("div")).to.equal(binding.node);
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
	});

	describe("Text", function() {
		it("appends text node to parent", function() {
			var cont = document.createElement("div");
			binding = new Temple.Text("Hello World").paint(cont);

			expect(binding.node).to.be.textNode.with.nodeValue("Hello World");
			expect(cont.childNodes[0]).to.equal(binding.node);
		});

		it("removes text node from DOM on detach", function() {
			var cont = document.createElement("div");
			binding = new Temple.Text("Hello World").paint(cont);
			binding.detach();
			expect(binding.node.parentNode).to.be.null;
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
	});

	describe("React", function() {

	});

});