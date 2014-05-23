describe("Scope", function() {
	var scope;

	before(function() {
		scope = new Temple.Scope();
	});

	beforeEach(function() {
		scope.set("foo", "bar");
	});

	describe("#get() & #set()", function() {
		it("sets data on construction", function() {
			var scope = new Temple(null, { foo: "bar" });
			expect(scope.get()).to.deep.equal({ foo: "bar" });
		});

		it("returns result of `scope.value` on null or empty path", function() {
			expect(scope.get()).to.equal(scope.value);
		});

		it("gets & sets shallow path", function() {
			scope.set("foo", { bar: "baz" });
			expect(scope.get("foo")).to.deep.equal({ bar: "baz" });
		});

		it("gets & sets deep path", function() {
			scope.set("foo.bar", "baz");
			expect(scope.get("foo.bar")).to.equal("baz");
		});

		it("get(path) executes function value iff value at path is function", function() {
			scope.set("foo.bar", "baz");

			scope.set("foo", function() {
				expect(this).to.equal(scope);
				return true;
			});

			expect(scope.get("foo")).to.equal(true);
		});

		it("sets value directly on null or empty path", function() {
			scope.set([], "value");
			expect(scope.get()).to.equal("value");
		});

		it("directly points to values on set", function() {
			var fn = function(){};
			scope.set("foo", fn);
			expect(scope.value.foo).to.equal(fn);
		});

		it("unsets", function() {
			scope.unset("foo");
			expect(scope.get("foo")).to.be.undefined;
		});

		it("unset() sets `this.value` to undefined on null or empty path", function() {
			scope.unset();
			expect(scope.value).to.be.undefined;
		});

		it("get() accepts array as path", function() {
			expect(scope.get([ "foo" ])).to.equal("bar");
		});

		it("set() accepts array as path", function() {
			scope.set([ "foo", "bar" ], "baz")
			expect(scope.get("foo")).to.deep.equal({ bar: "baz" });
		});

		it("set() accepts object for setting many paths at once", function() {
			scope.set({ foo: { bar: "baz" } });
			expect(scope.get("foo")).to.deep.equal({ bar: "baz" });
		});
	});

	describe("#observe()", function() {
		afterEach(function() {
			scope.stopObserving();
		});

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
			scope.observe("foo", function(){});
			expect(scope._observers).to.have.length(1);
			scope.stopObserving();
			expect(scope._observers).to.have.length(0);
		});

		it("calling stopObserving(path) clears all observers with matching path", function() {
			scope.observe("foo", function(){});
			scope.observe("foo", function(){});
			scope.observe("bar", function(){});
			expect(scope._observers).to.have.length(3);
			scope.stopObserving("foo");
			expect(scope._observers).to.have.length(1);
		});

		it("calling stopObserving(null, fn) clears all observers with matching function", function() {
			var fn = function(){};
			scope.observe("foo", fn);
			scope.observe("bar", fn);
			scope.observe("baz", function(){});
			expect(scope._observers).to.have.length(3);
			scope.stopObserving(null, fn);
			expect(scope._observers).to.have.length(1);
		});

		it("observes nothing when nothing changes", function() {
			var seen = false;
			scope.observe("foo", function() { seen = true; });
			scope.set("foo", "bar");
			expect(seen).to.not.be.ok;
		});

		it("observes static path changes", function() {
			var seen = false;
			scope.observe("foo.bar", function(chg) {
				expect(this).to.equal(scope);
				
				expect(chg).to.deep.equal({
					scope: scope,
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
					scope: scope,
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
					scope: scope,
					path: "",
					type: "update",
					value: "foo",
					oldValue: { foo: "bar" }
				});

				seen = true;
			});

			scope.set("", "foo");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: *", function() {
			var seen = false;
			scope.observe("*", function(chg) {
				expect(chg).to.deep.equal({
					scope: scope,
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
					scope: scope,
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
					scope: scope,
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
					scope: scope,
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
					scope: scope,
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
					scope: scope,
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
					scope: scope,
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
					scope: scope,
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
					scope: scope,
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
	});

	describe("#fallback()", function() {
		var fallback;

		beforeEach(function() {
			fallback = new Temple.Scope({ bar: "baz" });
			scope.fallback(fallback);
		});

		afterEach(function() {
			scope.removeFallback(fallback);
		});

		it("scope returns fallback value at path iff scope value at path is undefined", function() {
			console.log(fallback.getScope("foo"));
			console.log(scope.getScope("bar"));
			expect(scope.get("foo")).to.equal("bar");
			expect(scope.get("bar")).to.equal("baz");
		});

		it("if path is prefixed with `this`, scope returns exact value at path", function() {
			expect(scope.get("this.foo")).to.equal("bar");
			expect(scope.get("this.bar")).to.be.undefined;
		});
	});
});