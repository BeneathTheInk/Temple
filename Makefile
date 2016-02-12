BIN = ./node_modules/.bin
BUILD = lib/ lib/temple.js lib/ast.js lib/m+xml.js lib/superfast.js
DIST = dist/ dist/temple.js dist/temple.min.js

build: $(BUILD)
build-dist: $(DIST)

define ROLLUP
var path = require("path");
require("rollup").rollup({
	entry: path.resolve("$<"),
	plugins: [
		require("rollup-plugin-npm")({
			jsnext: true,
			main: true,
			builtins: false,
			skip: [
				"source-map", "lodash", "trackr", "trackr-objects",
				"assign-props", "dom-matches", "raf", "detect-indent",
				"backbone-extend-standalone", "plain-merge", "events"
			]
		}),
		require("rollup-plugin-babel")({
			exclude: [ "node_modules/**" ],
			include: [ "node_modules/incremental-dom/**", "src/**" ]
		})
	]
}).then(function(bundle) {
	var result = bundle.generate({
		format: "cjs",
		sourceMap: true,
		sourceMapFile: path.resolve("$@")
	});
	process.stdout.write(result.code + "\n//# sourceMappingURL=" + result.map.toUrl());
}).catch(function(e) {
	process.nextTick(function() {
		throw e;
	});
});
endef
export ROLLUP

define HEADER
/* Temple v$(shell node -e 'process.stdout.write(require("./package.json").version || "dev-build")')
 * Copyright (c) $(shell date +'%Y') Tyler Johnson. License MIT
 */

endef
export HEADER

lib/:
	mkdir -p $@

lib/temple.js: src/index.js $(wildcard src/*.js src/*/*.js) lib/
	# $< -> $@
	@node -e "$$ROLLUP" > $@

lib/ast.js: src/ast/index.js $(wildcard src/ast/*.js) lib/
	# $< -> $@
	@node -e "$$ROLLUP" > $@

lib/m+xml.js: src/m+xml.peg lib/
	# $< -> $@
	@$(BIN)/pegjs --allowed-start-rules start $< $@

lib/superfast.js: src/superfast.js lib/
	# $< -> $@
	@node -e "$$ROLLUP" > $@

dist/:
	mkdir -p $@

dist/temple.js: lib/temple.js $(BUILD) dist/
	# $< -> $@
	@echo "$$HEADER" > $@
	@$(BIN)/browserify --standalone Temple $< >> $@

dist/temple.min.js: dist/temple.js dist/
	# $< -> $@
	@echo "$$HEADER" > $@
	@$(BIN)/uglifyjs $< >> $@

clean:
	rm -rf lib/ dist/ coverage/

.PHONY: build
