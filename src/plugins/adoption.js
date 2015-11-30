import { register } from "./";
import View from "../view";
import { create as createView } from "../globals";

export function plugin() {
	this.adopt = adopt;
	this.adoptOnce = adoptOnce;
	this.disown = disown;
}

export default plugin;
register("adoption", plugin);

export function adopt(view, parent, before) {
	if (typeof view === "string") view = createView(view);
	if (!View.isView(view)) throw new Error("Expecting view or view name");

	// have original parent disown child and set the adopted parent reference
	if (view.adoptedParent) view.adoptedParent.disown(view);
	view.adoptedParent = this;

	// hook child data up to this data
	let oldRoot = view.context;
	while(oldRoot.parent) oldRoot = oldRoot.parent;
	this.context.append(oldRoot);

	// render immediately if parent is mounted
	if (this.comp) view.paint(parent, before);

	// render when parent renders
	let onMount;
	this.on("mount:after", onMount = function() {
		view.paint(parent, before);
	});

	// stop when parent stops
	let onStop;
	this.on("stop", onStop = function() {
		view.detach();
	});

	if (this._adopted == null) this._adopted = [];
	this._adopted.push({
		stop: onStop,
		mount: onMount,
		view: view,
		root: oldRoot
	});

	return view;
}

export function adoptOnce(view, parent, before) {
	view = this.adopt(view, parent, before);
	let clean = () => {
		view.off("stop", clean);
		this.off("stop", clean);
		this.disown(view);
	};
	view.on("stop", clean);
	this.on("stop", clean);
	return view;
}

export function disown(view) {
	if (this._adopted == null) return;

	let index;
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
