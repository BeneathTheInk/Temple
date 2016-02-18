import {invokeMap,assign} from "lodash";
import Node from "./node";
import {compileGroupAsync} from "./utils";

export default class Root extends Node {
	compile(data) {
		data = assign({}, data, {
			included: []
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

		if (data.async) {
			return compileGroupAsync(this.files, data).then(this._finish.bind(this, data));
		} else {
			return this._finish(data, invokeMap(this.files, "compile", data));
		}
	}

	_finish(data, src) {
		this.push(src);

		switch(data.format) {
			case "umd":
				this.outdent().write(`}));`);
				break;

			case "iife":
				this.outdent().write(`}());`);
				break;
		}

		let output = this.end();
		output.includes = data.included;
		return output;
	}
}
