BIN = ./node_modules/.bin
SRC = $(wildcard src/* src/*/*)
TEST = $(wildcard test/* test/*/*)

build: temple.js temple.es6.js dist/temple.js dist/temple.min.js
test: test-basic test-full

clean:
	rm -rf temple* dist/ coverage/

dist:
	mkdir -p dist

dist/temple.js: src/index.js $(SRC) dist
	TARGET=browser $(BIN)/rollup $< -c -m inline > $@

dist/temple.min.js: dist/temple.js dist
	$(BIN)/uglifyjs $< -m > $@

temple.js: src/index.js $(SRC)
	TARGET=node $(BIN)/rollup $< -c > $@

temple.es6.js: src/index.js $(SRC)
	TARGET=next $(BIN)/rollup $< -c > $@

temple-tests.basic.js: test/index.js $(TEST) temple.js
	TARGET=node TEST=1 $(BIN)/rollup $< -c > $@

temple-tests.full.js: test/full.js $(TEST) temple.js
	TARGET=node TEST=1 $(BIN)/rollup $< -c > $@

temple.cov.js: temple.js
	$(BIN)/istanbul instrument $< > $@

install-self:
	rm -f node_modules/templejs
	ln -s ../ node_modules/templejs

test-basic: temple-tests.basic.js install-self
	node $<

test-full: temple-tests.full.js install-self
	$(BIN)/browserify $< --debug | $(BIN)/tape-run

coverage: temple-tests.full.js temple.cov.js
	$(BIN)/browserify $< -r ./temple.cov.js:templejs --debug | node ./bin/browser-coverage.js
	$(BIN)/istanbul report --root coverage lcov

report-coverage: coverage
	$(BIN)/istanbul-coveralls --no-rm

.PHONY: build test clean test-basic test-full report-coverage install-self
