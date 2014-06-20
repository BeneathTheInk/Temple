describe("Model", function() {
	var model;

	beforeEach(function() {
		model = new Temple.Model({ foo: "bar" });
	});

	describe("Basics", function() {
		it("sets data on construction", function() {
			var model = new Temple.Model({ foo: "bar" });
			expect(model.get()).to.deep.equal({ foo: "bar" });
		});

		it("returns result of `model.value` on null or empty path", function() {
			expect(model.get()).to.equal(model.value);
		});

		it("gets & sets shallow path", function() {
			model.set("foo", { bar: "baz" });
			expect(model.get("foo")).to.deep.equal({ bar: "baz" });
		});

		it("gets & sets deep path", function() {
			model.set("foo.bar", "baz");
			expect(model.get("foo.bar")).to.equal("baz");
		});

		it("sets value directly on null or empty path", function() {
			model.set([], "value");
			expect(model.get()).to.equal("value");
		});

		it("directly points to values on set", function() {
			var fn = function(){};
			model.set("foo", fn);
			expect(model.value.foo).to.equal(fn);
		});

		it("unsets", function() {
			model.unset("foo");
			expect(model.get("foo")).to.be.undefined;
		});

		it("unset() sets `this.value` to undefined on null or empty path", function() {
			model.unset();
			expect(model.value).to.be.undefined;
		});

		it("get() accepts array as path", function() {
			expect(model.get([ "foo" ])).to.equal("bar");
		});

		it("set() accepts array as path", function() {
			model.set([ "foo", "bar" ], "baz")
			expect(model.get("foo")).to.deep.equal({ bar: "baz" });
		});

		it("set() accepts object for setting many paths at once", function() {
			model.set({ foo: { bar: "baz" } });
			expect(model.get("foo")).to.deep.equal({ bar: "baz" });
		});
	});

	describe("Handlers", function() {
		it("calls construct once on set and match", function() {
			var obj, seen, handler;

			obj = {};
			seen = 0;

			handler = {
				match: function(target) {
					return target != null && typeof target === "object";
				},
				construct: function(target) {
					if (target === obj) seen++;
				}
			};

			model.handle(handler);
			model.set("foo", obj);

			expect(seen).to.equal(1);
		});
		
		it("calls destroy once for every construct", function() {
			var obj, c, d, handler;

			obj = {};
			c = 0;
			d = 0;

			handler = {
				match: function(target) {
					return target != null && typeof target === "object";
				},
				construct: function(target) {
					if (target === obj) c++;
				},
				destroy: function(target) {
					if (target === obj) d++;
				}
			};

			model.handle(handler);
			model.set("foo", obj);
			model.unset("foo");

			expect(c).to.equal(1);
			expect(d).to.equal(1);
		});
	});

	describe("#observe()", function() {
		
		it("successfully adds observer", function() {
			var fn = function(){};
			model.observe("foo", fn);
			expect(model._observers.some(function(o) {
				return o.fn === fn;
			})).to.be.ok;
		});

		it("successfully removes observer", function() {
			var fn = function() { throw new Error("Observer wasn't removed!"); }
			model.observe("foo", fn);
			
			expect(function() {
				model.set("foo", "baz");
			}).to.throw(Error);

			model.stopObserving("foo", fn);
			model.set("foo", "bar");
		});

		it("calling stopObserving() without arguments clears all observers", function() {
			model.observe("foo", function() { throw new Error("Observer wasn't removed!"); });
			expect(model._observers).to.have.length(1);
			model.stopObserving();
			model.set("foo", "baz");
			expect(model._observers).to.have.length(0);
		});

		it("calling stopObserving(path) clears all observers with matching path", function() {
			var fn = function() { throw new Error("Observer wasn't removed!"); }
			model.observe("foo", fn);
			model.observe("foo", fn);
			model.observe("bar", fn);
			expect(model._observers).to.have.length(3);
			model.stopObserving("foo");
			model.set("foo", "baz");
			expect(model._observers).to.have.length(1);
		});

		it("calling stopObserving(null, fn) clears all observers with matching function", function() {
			var fn = function() { throw new Error("Observer wasn't removed!"); }
			model.observe("foo", fn);
			model.observe("bar", fn);
			model.observe("baz", function(){});
			expect(model._observers).to.have.length(3);
			model.stopObserving(null, fn);
			model.set("foo", "baz");
			expect(model._observers).to.have.length(1);
		});

		it("observes nothing when nothing changes", function() {
			model.observe("foo", function() { throw new Error("A change was observed."); });
			model.set("foo", "bar");
		});

		it("observes static path changes", function() {
			var seen = false;
			model.observe("foo.bar", function(chg) {
				expect(this).to.equal(model);
				
				expect(chg).to.deep.equal({
					model: model.getModel("foo.bar"),
					keypath: [ "foo", "bar" ],
					type: "add",
					value: "baz",
					oldValue: undefined
				});

				seen = true;
			});

			model.set("foo", { bar: "baz" });
			expect(seen).to.be.ok;
		});

		it("observes changes only once", function() {
			var seen = 0;
			model.observe("foo", function() { seen++; });
			model.set("foo", { bar: "baz" });
			expect(seen).to.equal(1);
		});

		it("observes unset", function() {
			var seen = false;
			model.observe("foo", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo"),
					keypath: [ "foo" ],
					type: "delete",
					value: undefined,
					oldValue: "bar"
				});

				seen = true;
			});

			model.unset("foo");
			expect(seen).to.be.ok;
		});

		it("calling get() in an observer returns the new value", function() {
			var seen = false;
			model.observe("foo.bar", function(chg) {
				expect(this.get(chg.keypath)).to.equal(chg.value);
				seen = true;
			});

			model.set("foo.bar", "baz");
			expect(seen).to.be.ok;
		});

		it("observes empty path", function() {
			var seen = false;
			model.observe("", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel(),
					keypath: [],
					type: "update",
					value: "foo",
					oldValue: { foo: "bar" }
				});

				seen = true;
			});

			model.set([], "foo");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: *", function() {
			var seen = false;
			model.observe("*", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo"),
					keypath: [ "foo" ],
					type: "update",
					value: { bar: "baz" },
					oldValue: "bar"
				});

				seen = true;
			});

			model.set("foo", { bar: "baz" });
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: *.bar.baz", function() {
			var seen = false;
			model.observe("*.bar.baz", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			model.set("foo.bar.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: foo.*.baz", function() {
			var seen = false;
			model.observe("foo.*.baz", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			model.set("foo.bar.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: foo.bar.*", function() {
			var seen = false;
			model.observe("foo.bar.*", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			model.set("foo.bar.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: **", function() {
			var seen = false;
			model.set("foo", { bar: "baz" });

			model.observe("**", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo.bar"),
					keypath: [ "foo", "bar" ],
					type: "update",
					value: { baz: "buz" },
					oldValue: "baz"
				});

				seen = true;
			});

			model.set("foo.bar", { baz: "buz" });
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: **.baz", function() {
			var seen = false;
			
			model.observe("**.baz", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			model.set("foo.bar.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: foo.**.baz", function() {
			var seen = false;
			model.observe("foo.**.baz", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo.bar.bun.baz"),
					keypath: [ "foo", "bar", "bun", "baz" ],
					type: "add",
					value: "buz",
					oldValue: undefined
				});

				seen = true;
			});

			model.set("foo.bar.bun.baz", "buz");
			expect(seen).to.be.ok;
		});

		it("observes dynamic path: foo.**", function() {
			var seen = false;
			model.set("foo.bar.baz", "buz");

			model.observe("foo.**", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo.bar.baz"),
					keypath: [ "foo", "bar", "baz" ],
					type: "update",
					value: "bun",
					oldValue: "buz"
				});

				seen = true;
			});

			model.set("foo.bar.baz", "bun");
			expect(seen).to.be.ok;
		});

		it("observing path foo.** captures changes at path foo", function() {
			var seen = false;
			model.observe("foo.**", function(chg) {
				expect(chg).to.deep.equal({
					model: model.getModel("foo"),
					keypath: [ "foo" ],
					type: "update",
					value: "buz",
					oldValue: "bar"
				});

				seen = true;
			});

			model.set("foo", "buz");
			expect(seen).to.be.ok;
		});
	});
});