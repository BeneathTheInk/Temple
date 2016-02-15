BIN = ./node_modules/.bin
SRC = $(wildcard src/* src/*/*)

build: temple.js temple.cli.js temple.es6.js dist/temple.js dist/temple.min.js

test: test-basic test-full test-dist
	make clean-self

test-coverage: test-basic test-dist coverage
	make clean-self

clean:
	rm -rf temple* dist/ coverage/

dist:
	mkdir -p dist

dist/temple.js: src/index.js $(SRC) dist
	TARGET=browser $(BIN)/rollup $< -c -m $@.map -o $@

dist/temple.min.js: dist/temple.js dist
	$(BIN)/uglifyjs $< -m > $@

temple.js: src/index.js $(SRC)
	TARGET=node $(BIN)/rollup $< -c > $@

temple.cli.js: src/cli.js $(SRC) temple.js
	echo "#!/usr/bin/env node\n" > $@
	TARGET=node $(BIN)/rollup $< -c >> $@

temple.es6.js: src/index.js $(SRC)
	TARGET=es6 $(BIN)/rollup $< -c > $@

temple-tests.basic.js: test/basic.js temple.js
	TARGET=node TEST=1 $(BIN)/rollup $< -c > $@

temple-tests.full.js: test/full.js temple.js
	TARGET=node TEST=1 $(BIN)/rollup $< -c > $@

temple.cov.js: temple.js
	$(BIN)/istanbul instrument $< > $@

install-self: clean-self
	ln -s ../ node_modules/templejs

clean-self:
	rm -f node_modules/templejs

test-basic: temple-tests.basic.js install-self
	node $<

test-full: temple-tests.full.js install-self
	$(BIN)/browserify $< --debug | $(BIN)/tape-run

test-dist: temple-tests.full.js dist/temple.js
	$(BIN)/browserify $< -r ./dist/temple.js:templejs --debug | $(BIN)/tape-run

coverage: temple-tests.full.js temple.cov.js
	$(BIN)/browserify $< -r ./temple.cov.js:templejs --debug | node ./bin/browser-coverage.js
	$(BIN)/istanbul report --root coverage lcov

report-coverage: coverage
	$(BIN)/istanbul-coveralls --no-rm

.PHONY: build test test-coverage clean test-basic test-full test-dist report-coverage install-self clean-self
