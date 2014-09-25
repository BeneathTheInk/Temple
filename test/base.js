describe("Base Binding", function() {
	var binding;

	this.timeout(1000);
	this.slow(200);

	afterEach(function() {
		binding = null;
	});

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
			moved = false;

		binding.on("child:remove", function(b) {
			throw new Error("child was removed!");
		});

		binding.on("child:add", function(b) {
			throw new Error("child was added!");
		});

		binding.on("child:move", function(b) {
			if (child === b) moved = true;
		});

		binding.insertBefore(child, first);
		expect(child.parent).to.equal(binding);
		expect(moved).to.be.ok;
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


	it("toString produces children HTML equivalent", function() {
		binding.appendChild("Hello World");
		expect(binding.toString()).to.equal("Hello World");
	});
});