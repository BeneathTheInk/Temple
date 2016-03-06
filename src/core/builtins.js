import Scope from "./scope";
import {map} from "./utils";
import {elementOpen,elementClose,autoelement} from "./idom";

export function Each(val, vars, scope, fn, that) {
	return map(val, function(item, key) {
		let nscope = new Scope(scope);

		if (vars.length === 1) nscope.set(vars[0], item);
		else if (vars.length == 2) {
			nscope.set(vars[0], key);
			nscope.set(vars[1], item);
		}

		return fn.call(that, nscope, key, val);
	});
}

export function With(val, scope, fn, that) {
	let nscope = new Scope(scope);
	nscope.set(val);
	nscope.dataVar.set(val);
	return fn.call(that, nscope);
}

export function Element(tagname, key, scope, fn, that) {
	let node = elementOpen(tagname, key);
	let nscope = new Scope(null, scope);
	let comp = autoelement(node, () => fn.call(that, nscope, node));
	elementClose(tagname);
	return comp;
}
