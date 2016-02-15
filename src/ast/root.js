import {invokeMap} from "lodash";
import Node from "./node";
import {header} from "./utils";

export default class Root extends Node {
	compile(data) {
		data = data || {};
		var oheads = data.headers;
		data.headers = [];

		this.start(data);

		header(data, "var idom = Temple.idom;\n");
		header(data, "var decorators = Temple.decorators;\n");
		this.push(invokeMap(this.files, "compile", data));

		let output = this.end();
		if (data.headers.length) output.prepend("\n").prepend(data.headers);
		data.headers = oheads;

		switch(data.export) {
			case "es6":
				output.prepend(`export const Template = {};\n`);
				output.prepend(`import * as Temple from "templejs";\n`);
				break;

			case "cjs":
				output.prepend(`var Template = module.exports = {};\n`);
				output.prepend(`var Temple = require("templejs");\n`);
				break;

			case "umd":
				output.prepend(`(function (global, factory) {
					typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require("templejs")) :
					typeof define === 'function' && define.amd ? define(["templejs"], factory) :
					(factory(global.Temple));
				}(this, function(Temple) {
					var Template = {};\n\n`.replace(/^\t{4}/gm, ""));
				output.add(`\n\treturn Template;\n}));`);
				break;

			case "iife":
				output.prepend(`(function() {\n\tvar Template = {};\n`);
				output.add(`\n\treturn Template;\n}());`);
				break;

			default:
				output.prepend(`var Template = {};\n`);
				break;
		}

		return output;
	}
}
