BIN = ./node_modules/.bin
SRC = $(wildcard src/* src/*/* src/*/*/*)
TEST = $(wildcard test/* test/*/* test/*/*/*)

build: build-lib build-dist
build-dist: dist/temple.js dist/temple.min.js
build-lib: lib/index.js lib/cli.js lib/es6.js lib/playground.js

test: test-node test-browser

clean:
	rm -rf lib/ dist/ coverage/

dist:
	mkdir -p dist

dist/temple.js: src/index.js $(SRC) dist
	$(BIN)/rollup $< -c rollup/browser.js -m $@.map -o $@

dist/temple.min.js: dist/temple.js dist
	$(BIN)/uglifyjs $< -m -c warnings=false > $@

lib:
	mkdir -p lib

lib/index.js: src/index.js lib/ $(SRC)
	$(BIN)/rollup $< -c rollup/node.js > $@

lib/cli.js: src/cli.js $(SRC) lib/index.js
	echo "#!/usr/bin/env node\n" > $@
	$(BIN)/rollup $< -c rollup/node.js >> $@
	chmod +x $@

lib/es6.js: src/index.js lib/ $(SRC)
	$(BIN)/rollup $< -c rollup/es6.js > $@

lib/playground.js: src/playground/index.js lib/ $(SRC) lib/index.js dist/temple.min.js
	$(BIN)/rollup $< -c rollup/node.js > $@

lib/coverage.js: temple.js
	$(BIN)/istanbul instrument $< > $@

bin/test-compile.js: test/compile.js lib/index.js
	$(BIN)/rollup $< -c rollup/test.js > $@

bin/test-runtime.js: test/runtime.js lib/index.js
	$(BIN)/rollup $< -c rollup/test.js > $@

bin/test-full.js: test/index.js lib/index.js
	$(BIN)/rollup $< -c rollup/test.js > $@

test-node: bin/test-compile.js
	node $<

test-browser: bin/test-full.js
	$(BIN)/browserify $< --debug | $(BIN)/tape-run

.PHONY: build build-lib build-dist clean test test-node test-browser
