import { register } from "./";

export function plugin() {
	this.use("decorators");
	this.refs = {};
	this.decorate("ref", decorator, { inline: true });
	this.findByRef = find;
}

export default plugin;
register("refs", plugin);

export function decorator(d, key) {
	var self = this;

	// don't overwrite
	if (this.refs[key] != null) {
		console.warn("Multiple elements with reference '%s'.", key);
		return;
	}

	// set the reference
	this.refs[key] = d.target;

	// remove the reference when the element disappears
	d.comp.onInvalidate(function() {
		delete self.refs[key];
	});
}

export function find(key) {
	var tpls = [ this ],
		tpl;

	while (tpls.length) {
		tpl = tpls.shift();
		if (tpl.refs && tpl.refs[key]) return tpl.refs[key];
		tpls = tpls.concat(tpl.getComponents());
	}

	return null;
}
