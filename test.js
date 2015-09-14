var script = document.createElement("script");
script.type = "text/javascript";
script.async = true;
script.src = "https://cdnjs.cloudflare.com/ajax/libs/webcomponentsjs/0.7.12/webcomponents.min.js";
document.body.appendChild(script);

// document.addEventListener("WebComponentsReady", function() {
// 	console.log("here");
// });

var Temple = require("./");

Temple.render(`
<my-component>
	<script>
	this.use("actions");
	this.addAction({
		alert: function(e, msg) {
			alert(msg);
		}
	});
	</script>

	<h1>Hello {{ name }}!</h1>
	{{> test }}
</my-component>

<x-test blah="false" on-click="alert, 'a test.'">This is a test.</x-test>
`);

window.tpl = Temple.create("my-component", { name: "World" }).paint("body");

//
// // window.tpl = Temple.render("<h1>Hello {{ name }}!</h1>{{{ poop }}}", {
// // 	name: "World",
// // 	poop: function() {
// // 		return "poop";
// // 	},
// // 	test: "foo"
// // }).paint("body");
