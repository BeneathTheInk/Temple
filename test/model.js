var Mustache = require("../"),
	expect = require("./utils/expect");

describe("Model", function() {
	var model;

	// beforeEach(function() {
	// 	model = new Mustache.Model({ foo: "bar" });
	// });

	// afterEach(function() {
	// 	model.cleanProxyTree();
	// });

	describe("Basics", function() {
		it("sets data on construction", function() {
			var model = new Mustache.Model({ foo: "bar" });
			expect(model.get()).to.deep.equal({ foo: "bar" });
		});

		it("returns result of `model.data` on null or empty path", function() {
			var model = new Mustache.Model({ foo: "bar" });
			expect(model.get()).to.equal(model.data);
		});

		it("gets shallow path", function() {
			var model = new Mustache.Model({ foo: "bar" });
			expect(model.get("foo")).to.deep.equal("bar");
		});

		it("gets deep path", function() {
			var model = new Mustache.Model({ foo: { bar: "baz" } });
			expect(model.get("foo.bar")).to.equal("baz");
		});

		it("gets deep path with bracket notation", function() {
			var model = new Mustache.Model({ foo: { bar: "baz" } });
			expect(model.get("foo['bar']")).to.equal("baz");
		});

		it("gets deep path with dynamic path", function() {
			var model = new Mustache.Model({ foo: { bar: "baz" }, path: "bar" });
			expect(model.get("foo[path]")).to.equal("baz");
		});

		it("gets local value", function() {
			var model = new Mustache.Model({ foo: "bar" });
			expect(model.get(".")).to.deep.equal({ foo: "bar" });
		});

		it("gets deep local value", function() {
			var model = new Mustache.Model({ foo: "bar" });
			expect(model.get(".foo")).to.deep.equal("bar");
		});

		it("gets from parent model", function() {
			var parent = new Mustache.Model({ foo: "bar" });
			var model = new Mustache.Model({ hello: "world" }, parent);
			expect(model.get("foo")).to.equal("bar");
		});

		it("getModelAtOffset(0) returns the model", function() {
			var model = new Mustache.Model({});
			expect(model.getModelAtOffset(0)).to.equal(model);
		});

		it("getModelAtOffset(-1) returns the root model", function() {
			var root = new Mustache.Model({});
			var parent = new Mustache.Model({}, root);
			var model = new Mustache.Model({}, parent);
			expect(model.getModelAtOffset(-1)).to.equal(root);
		});

		it("getModelAtOffset(n) where n > 0 returns the relative ancestor starting at the model", function() {
			var root = new Mustache.Model({});
			var parent = new Mustache.Model({}, root);
			var model = new Mustache.Model({}, parent);
			expect(model.getModelAtOffset(1)).to.equal(parent);
		});

		it("getModelAtOffset(n) where n < 0 returns the relative ancestor starting at the root model", function() {
			var root = new Mustache.Model({});
			var parent = new Mustache.Model({}, root);
			var model = new Mustache.Model({}, parent);
			expect(model.getModelAtOffset(-2)).to.equal(parent);
		});
	});

	describe("Proxies", function() {
		it("always calls proxy match function", function() {
			var model = new Mustache.Model({ foo: "bar" });
			var runCount = 0;
			
			model.registerProxy({
				match: function(target) {
					runCount++;
					return false;
				},
				get: function() {
					runCount++; // in case errors are suppressed
					throw new Error("Ran 'get()' method.");
				}
			});

			expect(model.get("foo")).to.equal("bar");
			expect(runCount).to.equal(1);
		});

		it("calls get method on a match", function() {
			var model = new Mustache.Model({ foo: "bar" });
			var runCount = 0;
			
			model.registerProxy({
				match: function(target) {
					runCount++;
					return true;
				},
				get: function(target, k) {
					runCount++;
					expect(target).to.equal(model.data);
					expect(k).to.equal("foo");
					return target[k];
				}
			});

			expect(model.get("foo")).to.equal("bar");
			expect(runCount).to.equal(2);
		});
	});
});
