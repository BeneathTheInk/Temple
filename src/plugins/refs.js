import { has, contains } from "lodash";
import { register } from "./";

export function plugin() {
	this.use("decorators");
	this.decorate("ref", decorator);
}

export default plugin;
register("refs", plugin);

var warned = [];

export function warnOnce(msg) {
	if (contains(warned, msg)) return;
	console.warn(msg);
	warned.push(msg);
}

export function decorator(d, key) {
	let ctx = d.owner;
	if (!ctx.refs) ctx.refs = {};

	// warn about overwrites overwrite
	if (has(ctx.refs, key)) {
		warnOnce(`Multiple elements with reference '${key}'.`);
		return;
	}

	// set the reference
	ctx.refs[key] = d.target;

	// remove the reference when the element disappears
	d.comp.onInvalidate(() => {
		delete ctx.refs[key];
	});
}

// export function find(key) {
// 	var tpls = [ this ],
// 		tpl;
//
// 	while (tpls.length) {
// 		tpl = tpls.shift();
// 		if (tpl.refs && tpl.refs[key]) return tpl.refs[key];
// 		// tpls = tpls.concat(tpl.getComponents());
// 	}
//
// 	return null;
// }
