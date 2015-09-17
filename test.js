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
window.ReactiveVar = require("trackr-objects").Variable;

Temple.render(`
<my-component>
	<script>
	this.helpers({
		fartName: function() {
			return this.get("name") + "fart";
		}
	});
	</script>

	<h1 style="color: {{ color }};">Hello {{ fartName }}!</h1>
	{{> click-counter }}
</my-component>

<click-counter extends="button" on-click="bump-count">
	<script>
	this.use("actions");
	var count = new ReactiveVar(0);

	this.helpers({
		getCount: count.get.bind(count)
	});

	this.actions({
		"bump-count": function(e) {
			e.original.preventDefault();
			count.set(count.get() + 1);
		}
	});
	</script>

	I have been clicked {{ getCount }} times.
</click-counter>

<click-counter-2 extends="click-counter">Clicked x{{ getCount }}</click-counter-2>
`);

var data = window.data = new ReactiveMap({
	name: "Bob",
	color: "blue"
});

window.tpl = Temple.create("my-component", data).paint("body");
