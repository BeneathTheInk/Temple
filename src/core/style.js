
let stylesheet;

export default function() {
	if (stylesheet) return stylesheet;

	var style = document.createElement("style");
	style.appendChild(document.createTextNode("")); // WebKit hack ?
	document.head.appendChild(style);

	return (stylesheet = style.sheet);
}
