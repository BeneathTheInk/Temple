describe.skip('Mustache Test Suite', function () {
	var spec = window.MustacheTestContent;

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

	function trimComments(html) {
		return html.replace(/\<\!\-\-\$[0-9]+\-\-\>/g, "");
	}

	Object.keys(spec).filter(function (name) {
		return spec[name].js != null;
	}).forEach(function (testName) {
		var test = getTest(testName);

		function tester() {
			var tpl;

			if (test.partial) {
				throw new Error("Oops! partial!");
				// output = Mustache.render(test.template, test.view, { partial: test.partial });
			} else {
				tpl = new Temple(test.template, test.view);
			}

			expect(trimComments(tpl.toHTML()) + "\n").to.equal(test.expect);
		}

		tester.toString = function() {
			return [
				test.template,
				getContents(test.name, "js"),
				test.expect
			].join("\n====\n") + "\n";
		}

		it("knows how to render '" + testName.split("_").join(" ") + "'", tester);
	});
});