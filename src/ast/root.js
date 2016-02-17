import {map,assign,includes} from "lodash";
import Node from "./node";
import fs from "fs-promise";
import path from "path";

export default class Root extends Node {
	_load_files(files, data, complete=[]) {
		let togo = files.slice(0);

		let next = () => {
			if (!togo.length) return Promise.resolve();
			let file = togo.shift();

			// don't process this file if it was already processed
			if (includes(complete, file.filename)) return next();
			complete.push(file.filename);

			// convert include nodes into file paths
			return Promise.all(map(file.includes, "src").map(s => {
				return path.resolve(path.dirname(file.filename), s);
			}).filter(s => {
				// don't add already included files
				return !includes(complete, s);
			}).map(fpath => {
				// get the includes's source
				return Promise.all([
					fpath,
					fs.readFile(fpath, { encoding: "utf-8" })
				]);
			})).then(includes => {
				// parse includes and recursively load
				return this._load_files(includes.map(([fpath,src]) => {
					return data.parse(src, fpath);
				}), data, complete);
			}).then(() => {
				// finally compile the file in question
				this.push(file.compile(data));
			});
		};

		return next();
	}

	compile(data) {
		data = assign({}, data, {
			headers: []
		});

		this.start(data);

		switch(data.format) {
			case "es6":
				this.write(`import * as Temple from "templejs";\n`);
				break;

			case "cjs":
				this.write(`var Temple = require("templejs");\n`);
				break;

			case "umd":
				this.write(`(function (global, factory) {`).indent();
				this.write(`typeof exports === 'object' && typeof module !== 'undefined' ? factory(require("templejs")) :`);
				this.write(`typeof define === 'function' && define.amd ? define(["templejs"], factory) :`);
				this.write(`(factory(global.Temple));`);
				this.outdent().write(`}(this, function(Temple) {\n`).indent();
				break;

			case "iife":
				this.write(`(function() {\n`).indent();
				break;
		}

		return this._load_files(this.files, data).then(() => {
			switch(data.format) {
				case "umd":
					this.outdent().write(`}));`);
					break;

				case "iife":
					this.outdent().write(`}());`);
					break;
			}

			let output = this.end();

			if (data.headers.length) {
				output.prepend("\n").prepend(data.headers);
			}

			return output;
		});
	}
}
