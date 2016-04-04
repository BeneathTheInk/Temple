BIN = ./node_modules/.bin
SRC = $(wildcard src/* src/*/* src/*/*/*)
TEST = $(wildcard test/* test/*/* test/*/*/*)

build: bin/cli.js dist/browser.min.js

bin:
	mkdir -p $@

bin/cli.js: src/cli.js $(SRC) bin
	echo "#!/usr/bin/env node" > $@
	$(BIN)/rollup $< -c build/rollup.node.js >> $@
	chmod +x $@

dist:
	mkdir -p $@

dist/browser.js: src/index.js dist
	$(BIN)/rollup $< -c build/rollup.browser.js > $@

dist/browser.min.js: dist/browser.js
	$(BIN)/uglifyjs $< -mc warnings=false > $@

test.js: test/index.js $(TEST)
	$(BIN)/rollup $< -c build/rollup.node.js > $@

test: test.js
	$(BIN)/tape $<

clean:
	rm -rf test.js bin/ dist/

.PHONY: build clean
