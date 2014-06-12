describe("Model", function() {
	var model;

	before(function() {
		model = new Temple.Model();
	});

	beforeEach(function() {
		model.set("foo", "bar");
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
					expect(target).to.equal(obj);
					seen++;
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
					expect(target).to.equal(obj);
					c++;
				},
				destroy: function(target) {
					expect(target).to.equal(obj);
					d++;
				}
			};

			model.handle(handler);
			model.set("foo", obj);
			model.unset("foo");

			expect(c).to.equal(1);
			expect(d).to.equal(1);
		});
	});
});