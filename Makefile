BIN = ./node_modules/.bin

build: lib/ lib/temple.js lib/ast.js lib/m+xml.js

define ROLLUP
require("rollup").rollup({
	entry: "$<",
	plugins: [
		require("rollup-plugin-npm")({
			jsnext: true,
			main: true,
			builtins: false,
			skip: [ "source-map", "lodash" ]
		}),
		require("rollup-plugin-babel")({
			exclude: 'node_modules/**'
		})
	]
}).then(function(bundle) {
	var result = bundle.generate({
		format: "cjs"
	});
	process.stdout.write(result.code);
}).catch(function(e) {
	process.nextTick(function() {
		throw e;
	});
});
endef

export ROLLUP

lib/:
	mkdir -p lib/

lib/temple.js: src/index.js $(wildcard src/*.js src/*/*.js)
	# $< -> $@
	@node -e "$$ROLLUP" > $@

lib/ast.js: src/ast/index.js $(wildcard src/ast/*.js)
	# $< -> $@
	@node -e "$$ROLLUP" > $@

lib/m+xml.js: src/m+xml.peg
	# $< -> $@
	@$(BIN)/pegjs --allowed-start-rules start,arguments $< $@

clean:
	rm -rf lib/

.PHONY: build
