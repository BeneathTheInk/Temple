var script = document.createElement("script");
script.type = "text/javascript";
script.async = true;
script.src = "https://cdnjs.cloudflare.com/ajax/libs/webcomponentsjs/0.7.12/webcomponents.min.js";
document.body.appendChild(script);

// document.addEventListener("WebComponentsReady", function() {
// 	console.log("here");
// });

var Temple = require("./");
var ReactiveMap = require("trackr-objects").Map;

Temple.render(`
<my-component>
	<script>
	this.helpers({
		fartName: function() {
			return this.get("name") + "fart";
		}
	});
	</script>

	<h1>Hello {{ fartName }}!</h1>
	{{# foo }}<x-test />{{/ foo }}
</my-component>

<x-test extends="button" on-click="alert, 'a test.'">
	<script>
	this.use("actions");
	this.addAction({
		alert: function(e, msg) {
			alert(msg);
		}
	});
	</script>

	This is a {{ ../name }}.
</x-test>
`);

var data = window.data = new ReactiveMap({
	name: "Bob",
	foo: new ReactiveMap({ name: "Deep" })
});

window.tpl = Temple.create("my-component", data).paint("body");

//
// // window.tpl = Temple.render("<h1>Hello {{ name }}!</h1>{{{ poop }}}", {
// // 	name: "World",
// // 	poop: function() {
// // 		return "poop";
// // 	},
// // 	test: "foo"
// // }).paint("body");
