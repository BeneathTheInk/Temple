import { has, includes } from "lodash";

export function plugin() {
	this.use("decorators");
	this.decorate("ref", decorator);
}

export default plugin;

var warned = [];

export function warnOnce(msg) {
	if (includes(warned, msg)) return;
	console.warn(msg);
	warned.push(msg);
}

export function decorator(d, key) {
	let scope = d.owner;
	if (!scope.refs) scope.refs = {};

	// warn about overwrites overwrite
	if (has(scope.refs, key)) {
		warnOnce(`Multiple elements with reference '${key}'.`);
		return;
	}

	// set the reference
	scope.refs[key] = d.target;

	// remove the reference when the element disappears
	d.comp.onInvalidate(() => {
		delete scope.refs[key];
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
