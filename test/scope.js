describe("Scope", function() {
	var scope, fallback;

	before(function() {
		scope = new Temple.Scope();
	});

	beforeEach(function() {
		scope.set("foo", "bar");
		fallback = new Temple.Model({ bar: "baz" });
		scope.addModel(fallback);
	});

	afterEach(function() {
		scope.stopObserving();
		scope.removeModel(fallback);
		fallback = null;
	});

	it("creates a model on constructor if a model isn't passed", function() {
		expect(scope.models[0]).to.be.instanceof(Temple.Model);
	});

	it("get(path) executes function value iff value at path is function", function() {
		scope.set("foo", function() {
			expect(this).to.equal(scope);
			return "Hello World";
		});

		expect(scope.get("foo")).to.equal("Hello World");
	});

	it("adds fallback model", function() {
		expect(scope.models[1]).to.deep.equal(fallback);
	});

	it("removes fallback model", function() {
		scope.removeModel(fallback);
		expect(scope.models).to.have.length(1);
	});

	it("scope returns fallback value at path iff model value at path is undefined", function() {
		expect(scope.get("foo")).to.equal("bar");
		expect(scope.get("bar")).to.equal("baz");
	});

	it("if path is prefixed with `this`, model returns exact value at path", function() {
		expect(scope.get("this.foo")).to.equal("bar");
		expect(scope.get("this.bar")).to.be.undefined;
	});

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
					path: "foo.bar",
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
					path: "foo",
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
				expect(this.get(chg.path)).to.equal(chg.value);
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
					path: "",
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
					path: "foo",
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
					path: "foo.bar.baz",
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
					path: "foo.bar.baz",
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
					path: "foo.bar.baz",
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
					path: "foo.bar",
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
					path: "foo.bar.baz",
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
					path: "foo.bar.bun.baz",
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
					path: "foo.bar.baz",
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
					path: "foo",
					type: "update",
					value: "buz",
					oldValue: "bar"
				});

				seen = true;
			});

			scope.set("foo", "buz");
			expect(seen).to.be.ok;
		});

		it("observes changes to fallback value", function() {
			var seen = false;

			scope.observe("bar", function(chg) {
				expect(this).to.equal(scope);

				expect(chg).to.deep.equal({
					model: fallback.getModel("bar"),
					previousModel: fallback.getModel("bar"),
					path: "bar",
					type: "update",
					value: "bam",
					oldValue: "baz"
				});

				seen = true;
			});

			fallback.set("bar", "bam");
			expect(seen).to.be.ok;
		});

		it("observes changes to local value when the value was found in fallback", function() {
			var seen = false;

			scope.observe("bar", function(chg) {
				expect(chg).to.deep.equal({
					model: scope.getModel("bar"),
					previousModel: fallback.getModel("bar"),
					path: "bar",
					type: "update",
					value: "bam",
					oldValue: "baz"
				});

				seen = true;
			});

			scope.set("bar", "bam");
			expect(seen).to.be.ok;
		});

		it("doesn't observes changes to fallback when the value is in local model", function() {
			scope.observe("foo", function(chg) {
				throw new Error("A change was observed.");
			});

			fallback.set("foo", "bam");
		});

		it("observes unset on local value, falling back on a secondary value", function() {
			var seen = false;
			fallback.set("foo", "bug");

			scope.observe("foo", function(chg) {
				expect(chg).to.deep.equal({
					model: fallback.getModel("foo"),
					previousModel: scope.getModel("foo"),
					path: "foo",
					type: "update",
					value: "bug",
					oldValue: "bar"
				});

				seen = true;
			});

			scope.unset("foo");
			expect(seen).to.be.ok;
		});
	});

});