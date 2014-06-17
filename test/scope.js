describe("Scope", function() {
	var scope;

	beforeEach(function() {
		scope = new Temple.Scope();
		scope.set("foo", "bar");
	});

	it("creates a model on constructor if a model isn't passed", function() {
		expect(scope.model).to.be.instanceof(Temple.Model);
	});

	it("adds child scope", function() {
		scope.addChild(new Temple.Scope());
		expect(scope.children).to.have.length(1);
	});

	it("removes child scope", function() {
		var child = new Temple.Scope();
		scope.addChild(child);
		scope.removeChild(child);
		expect(scope.children).to.have.length(0);
	});

	it("removes child scope from exisiting parent before adding", function() {
		var other = new Temple.Scope(),
			child = new Temple.Scope(),
			removed = false;

		other.on("child:remove", function(b) {
			if (child === b) removed = true;
		});

		other.addChild(child);
		scope.addChild(child);

		expect(child.parent).to.equal(scope);
		expect(removed).to.be.ok;
	});

	it("get() returns value from parent scope");

	describe("#observe()", function() {
		
		it("successfully adds observer", function() {
			var fn = function(){};
			scope.observe("foo", fn);
			expect(scope._observers.some(function(o) {
				return o.fn === fn;
			})).to.be.ok;
		});

		it("successfully removes observer", function() {
			var fn = function() { throw new Error("Observer wasn't removed!"); }
			scope.observe("foo", fn);
			
			expect(function() {
				scope.set("foo", "baz");
			}).to.throw(Error);

			scope.stopObserving("foo", fn);
			scope.set("foo", "bar");
		});

		it("calling stopObserving() without arguments clears all observers", function() {
			scope.observe("foo", function() { throw new Error("Observer wasn't removed!"); });
			expect(scope._observers).to.have.length(1);
			scope.stopObserving();
			scope.set("foo", "baz");
			expect(scope._observers).to.have.length(0);
		});

		it("calling stopObserving(path) clears all observers with matching path", function() {
			var fn = function() { throw new Error("Observer wasn't removed!"); }
			scope.observe("foo", fn);
			scope.observe("foo", fn);
			scope.observe("bar", fn);
			expect(scope._observers).to.have.length(3);
			scope.stopObserving("foo");
			scope.set("foo", "baz");
			expect(scope._observers).to.have.length(1);
		});

		it("calling stopObserving(null, fn) clears all observers with matching function", function() {
			var fn = function() { throw new Error("Observer wasn't removed!"); }
			scope.observe("foo", fn);
			scope.observe("bar", fn);
			scope.observe("baz", function(){});
			expect(scope._observers).to.have.length(3);
			scope.stopObserving(null, fn);
			scope.set("foo", "baz");
			expect(scope._observers).to.have.length(1);
		});

		it("observes nothing when nothing changes", function() {
			scope.observe("foo", function() { throw new Error("A change was observed."); });
			scope.set("foo", "bar");
		});

		it("observes static path changes", function() {
			var seen = false;
			scope.observe("foo.bar", function(chg) {
				expect(this).to.equal(scope);
				
				expect(chg).to.deep.equal({
					model: scope.getModel("foo.bar"),
					previousModel: scope.getModel("foo.bar"),
					keypath: [ "foo", "bar" ],
					type: "add",
					value: "baz",
					oldValue: undefined
				});

				seen = true;
			});

			scope.set("foo", { bar: "baz" });
			expect(seen).to.be.ok;
		});

		it("observes changes only once", function() {
			var seen = 0;
			scope.observe("foo", function() { seen++; });
			scope.set("foo", { bar: "baz" });
			expect(seen).to.equal(1);
		});

		it("observes unset", function() {
			var seen = false;
			scope.observe("foo", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo"),
					previousModel: scope.getModel("foo"),
					keypath: [ "foo" ],
					type: "delete",
					value: undefined,
					oldValue: "bar"
				});

				seen = true;
			});

			scope.unset("foo");
			expect(seen).to.be.ok;
		});

		it("calling get() in an observer returns the new value", function() {
			var seen = false;
			scope.observe("foo.bar", function(chg) {
				expect(this.get(chg.keypath)).to.equal(chg.value);
				seen = true;
			});

			scope.set("foo.bar", "baz");
			expect(seen).to.be.ok;
		});

		it("observes empty path", function() {
			var seen = false;
			scope.observe("", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel(),
					previousModel: scope.getModel(),
					keypath: [],
					type: "update",
					value: "foo",
					oldValue: { foo: "bar" }
				});

				seen = true;
			});

			scope.set([], "foo");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: *", function() {
			var seen = false;
			scope.observe("*", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo"),
					previousModel: scope.getModel("foo"),
					keypath: [ "foo" ],
					type: "update",
					value: { bar: "baz" },
					oldValue: "bar"
				});

				seen = true;
			});

			scope.set("foo", { bar: "baz" });
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: *.bar.baz", function() {
			var seen = false;
			scope.observe("*.bar.baz", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo.bar.baz"),
					previousModel: scope.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			scope.set("foo.bar.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: foo.*.baz", function() {
			var seen = false;
			scope.observe("foo.*.baz", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo.bar.baz"),
					previousModel: scope.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			scope.set("foo.bar.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: foo.bar.*", function() {
			var seen = false;
			scope.observe("foo.bar.*", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo.bar.baz"),
					previousModel: scope.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			scope.set("foo.bar.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: **", function() {
			var seen = false;
			scope.set("foo", { bar: "baz" });

			scope.observe("**", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo.bar"),
					previousModel: scope.getModel("foo.bar"),
					keypath: [ "foo", "bar" ],
					type: "update",
					value: { baz: "buz" },
					oldValue: "baz"
				});

				seen = true;
			});

			scope.set("foo.bar", { baz: "buz" });
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: **.baz", function() {
			var seen = false;
			
			scope.observe("**.baz", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo.bar.baz"),
					previousModel: scope.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			scope.set("foo.bar.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: foo.**.baz", function() {
			var seen = false;
			scope.observe("foo.**.baz", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo.bar.bun.baz"),
					previousModel: scope.getModel("foo.bar.bun.baz"),
					keypath: [ "foo", "bar", "bun", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			scope.set("foo.bar.bun.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: foo.**", function() {
			var seen = false;
			scope.set("foo.bar.baz", "buz");

			scope.observe("foo.**", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo.bar.baz"),
					previousModel: scope.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "update",
					value: "bun",
					oldValue: "buz"
				});

				seen = true;
			});

			scope.set("foo.bar.baz", "bun");
			expect(seen).to.be.ok;
		});

		it("observing path foo.** captures changes at path foo", function() {
			var seen = false;
			scope.observe("foo.**", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("foo"),
					previousModel: scope.getModel("foo"),
					keypath: [ "foo" ],
					type: "update",
					value: "buz",
					oldValue: "bar"
				});

				seen = true;
			});

			scope.set("foo", "buz");
			expect(seen).to.be.ok;
		});

		it("observes changes to parent values", function() {
			var seen = false,
				parent = new Temple.Scope();

			scope.observe("bar", function(chg) {
				expect(this).to.equal(scope);

				expect(chg).to.deep.equal({
					model: parent.getModel("bar"),
					previousModel: parent.getModel("bar"),
					keypath: [ "bar" ],
					type: "add",
					value: "bam",
					oldValue: undefined
				});

				seen = true;
			});

			parent.addChild(scope);
			parent.set("bar", "bam");

			expect(seen).to.be.ok;
		});

		it("observes changes to local value when the value was found in parent", function() {
			var seen = false,
				parent = new Temple.Scope({ bar: "bam" });

			scope.observe("bar", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("bar"),
					previousModel: parent.getModel("bar"),
					keypath: [ "bar" ],
					type: "update",
					value: "baz",
					oldValue: "bam"
				});

				seen = true;
			});
			
			parent.addChild(scope);
			scope.set("bar", "baz");
			
			expect(seen).to.be.ok;
		});

		it("doesn't observes changes to fallback when the value is in local model", function() {
			var parent = new Temple.Scope();

			scope.observe("foo", function(chg) {
				throw new Error("A change was observed.");
			});

			parent.addChild(scope);
			parent.set("foo", "bam");
		});

		it("observes unset on local value, falling back on a secondary value", function() {
			var seen = false,
				parent = new Temple.Scope({ foo: "bug" });

			scope.observe("foo", function(chg) {
				expect(chg).to.deep.equal({
					model: parent.getModel("foo"),
					previousModel: scope.getModel("foo"),
					keypath: [ "foo" ],
					type: "update",
					value: "bug",
					oldValue: "bar"
				});

				seen = true;
			});

			parent.addChild(scope);
			scope.unset("foo");

			expect(seen).to.be.ok;
		});
	});

});