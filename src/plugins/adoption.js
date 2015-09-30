import View from "../view";
import { register } from "./";

export function plugin() {
	this.adopt = adopt;
	this.disown = disown;
}

export default plugin;
register("adoption", plugin);

export function adopt(view, parent, before) {
	if (!(view instanceof View)) {
		throw new Error("Expecting instanceof Temple View.");
	}

	if (this._adopted == null) this._adopted = [];

	// have original parent disown child and set the adopted parent reference
	if (view.adoptedParent) view.adoptedParent.disown(view.adoptedParent);
	view.adoptedParent = this;

	// hook child data up to this data
	var oldRoot = view.getRootModel();
	oldRoot.parent = this.model;

	// render immediately if parent is mounted
	if (this.comp) view.paint(parent, before);

	// render when parent renders
	var onMount;
	this.on("mount:after", onMount = function() {
		view.paint(parent, before);
	});

	var onStop;
	this.on("stop", onStop = function() {
		view.detach();
	});

	this._adopted.push({
		stop: onStop,
		mount: onMount,
		view: view,
		root: oldRoot
	});

	return view;
}

export function disown(view) {
	if (this._adopted == null) return;

	var index;
	if (!this._adopted.some(function(a, i) {
		if (a.view === view) {
			index = i;
			return true;
		}
	})) return;

	// remove form the DOM
	view.detach();

	// remove event listeners
	this.off("mount:after", this._adopted[index].mount);
	this.off("stop", this._adopted[index].stop);

	// reset the data model
	this._adopted[index].root.parent = null;

	// remove references
	if (view.adoptedParent === this) delete view.adoptedParent;
	this._adopted.splice(index, 1);

	return view;
}
