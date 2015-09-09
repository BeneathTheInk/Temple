var Temple = require("./");

window.tpl = Temple.render("<h1>Hello {{ name }}!</h1>{{{ poop }}}", {
	name: "World",
	poop: "<i>Poop</i>"
}).paint("body");
