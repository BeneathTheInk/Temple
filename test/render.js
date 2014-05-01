var spec = require("./mustache.json"),
	assert = require("assert");

describe('DOM Rendering', function () {
	describe('Mustache Test Suite', function () {
		function getContents(testName, ext) {
			return spec[testName][ext];
		}

		function getView(testName) {
			var view = getContents(testName, 'js');
			if (!view) throw new Error('Cannot find view for test "' + testName + '"');
			return eval(view);
		}

		function getPartial(testName) {
			try {
				return getContents(testName, 'partial');
			} catch (error) {
				// No big deal. Not all tests need to test partial support.
			}
		}

		function getTest(testName) {
			var test = {};
			test.name = testName;
			test.view = getView(testName);
			test.template = getContents(testName, 'mustache');
			test.partial = getPartial(testName);
			test.expect = getContents(testName, 'txt');
			return test;
		}

		testNames = Object.keys(spec).filter(function (name) {
			return spec[name].js != null;
		});

		testNames.forEach(function (testName) {
			var test = getTest(testName);

			var fn = function() {
				var tpl;

				if (test.partial) {
					assert.throw("Oops! partial!");
					// output = Mustache.render(test.template, test.view, { partial: test.partial });
				} else {
					tpl = new Temple(test.template, test.view);
				}

				assert.equal(tpl.toHTML(), test.expect);
			}

			fn.toString = function() {
				return  test.template + "\n====\n" +
					getContents(test.name, "js") + "\n====\n" +
					test.expect + "\n";
			}

			it("knows how to render '" + testName.split("_").join(" ") + "'", fn);
		});
	});
});