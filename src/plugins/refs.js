module.exports = function() {
	this.refs = {};
	this.decorate("ref", ref);
	this.findByRef = findByRef;
};

function ref(d, key) {
	// don't overwrite
	if (this.refs[key] != null) {
		console.warn("Multiple elements with reference '%s'.", key);
		return;
	}

	// set the reference
	this.refs[key] = d.target;

	// remove the reference when the element disappears
	d.comp.onInvalidate(function() {
		delete this.refs[key];
	});
}

function findByRef(key) {
	var tpl = this;

	while (tpl != null) {
		if (tpl.refs && tpl.refs[key]) return tpl.refs[key];
		tpl = tpl.parentRange;
	}

	return null;
}
