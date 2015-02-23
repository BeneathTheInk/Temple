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

	describe.skip("Proxies", function() {
		it("constructs proxy once on set and match", function() {
			var obj, seen, Proxy;

			obj = {};
			seen = 0;

			Proxy = Mustache.Proxy.Object.extend({
				constructor: function(target, model) {
					expect(target).to.equal(obj);
					expect(model).to.be.instanceof(Mustache.Model);
					seen++;

					Mustache.Proxy.Object.apply(this, arguments);
				}
			}, {
				match: function(target) {
					return target === obj;
				}
			});

			model.registerProxy(Proxy);
			model.set("foo", obj);
			expect(seen).to.equal(1);
		});

		it("calls destroy once for every construct", function() {
			var obj, c, d, Proxy;

			obj = {};
			c = 0;
			d = 0;

			Proxy = Mustache.Proxy.Object.extend({
				constructor: function(target, model) {
					c++;
					Mustache.Proxy.Object.apply(this, arguments);
				},
				destroy: function() {
					d++;
					Mustache.Proxy.Object.prototype.destroy.apply(this, arguments);
				}
			}, {
				match: function(target) {
					return target === obj;
				}
			});

			model.registerProxy(Proxy);
			model.set("foo", obj);
			model.unset("foo");

			expect(c).to.equal(1);
			expect(d).to.equal(1);
		});
	});

	describe.skip("#observe()", function() {

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
			model.observe("*", function(chg, opts) {
				if (opts.initial) return;

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

			model.observe("**", function(chg, opts) {
				if (opts.initial) return;

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
