var Mustache = require("../");

module.exports = function() {
	this.adopt = adopt;
	this.disown = disown;
};

function adopt(view, parent, before) {
	if (!(view instanceof Mustache.View)) {
		throw new Error("Expecting instanceof Temple View.");
	}

	if (this._adopted == null) this._adopted = [];

	// have original parent disown child and set the adopted parent reference
	if (view.adoptedParent) view.adoptedParent.disown(view.adoptedParent);
	view.adoptedParent = this;

	// make sure it is an independent
	view.detach();

	// hook navbar data up to this data
	view.getRootModel().parent = this.model;

	// render when not in loading mode
	var onRender;
	this.on("render", onRender = function(comp) {
		if (comp.firstRun) view.paint(parent, before);
		comp.onInvalidate(function() {
			if (comp.stopped) view.detach();
		});
	});

	this._adopted.push({
		render: onRender,
		view: view
	});

	return view;
}

function disown(view) {
	if (this._adopted == null) return;

	var index;
	if (!this._adopted.some(function(a, i) {
		if (a.view === view) {
			index = i;
			return true;
		}
	})) return;

	if (view.adoptedParent === this) delete view.adoptedParent;
	this.off("render", this._adopted[index].render);
	this._adopted.splice(index, 1);

	return view;
}