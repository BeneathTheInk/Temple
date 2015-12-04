import View from "./view";

export default function Template() {
	View.apply(this, arguments);
}

Template.prototype = Object.create(View.prototype);
