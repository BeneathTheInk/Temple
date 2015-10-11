import { register } from "./";
import { isView } from "../utils";
import { create as createView } from "../globals";

export function plugin() {
	this.adopt = adopt;
	this.disown = disown;
}

export default plugin;
register("adoption", plugin);

export function adopt(view, parent, before) {
	if (typeof view === "string") view = createView(view);
	if (!isView(view)) throw new Error("Expecting view or view name");

	// have original parent disown child and set the adopted parent reference
	if (view.adoptedParent) view.adoptedParent.disown(view);
	view.adoptedParent = this;

	// hook child data up to this data
	var oldRoot = view.context;
	while(oldRoot.parent) oldRoot = oldRoot.parent;
	this.context.append(oldRoot);

	// render immediately if parent is mounted
	if (this.comp) view.paint(parent, before);

	// render when parent renders
	var onMount;
	this.on("mount:after", onMount = function() {
		view.paint(parent, before);
	});

	// stop when parent stops
	var onStop;
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
