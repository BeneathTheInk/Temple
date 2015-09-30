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
window.ReactiveList = require("trackr-objects").List;

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
	{{# foo }}{{ . }}{{/ foo }}
	<hr/>
	{{> click-counter }}
	<hr/>
	{{> tyler-list }}
</my-component>

<script>
var myComponent = Temple.get("my-component");
myComponent.helpers({
	foo: function() {
		return ["a","test","indeed"];
	}
});
</script>

<click-counter extends="button" on-click="bump-count">
	<script>
	this.use("actions");
	var count = new ReactiveVar(0);

	this.helpers({
		getCount: function() {
			return count.get();
		}
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

<tyler-list>
	<script>
		this.use("actions");
		var list = new ReactiveList();

		this.helpers({
			items: function() {
				return list;
			}
		});

		this.actions({
			"add-item": function(e) {
				e.original.preventDefault();
				var input = e.target.elements[0];
				list.push(input.value);
				input.value = "";
				input.focus();
			},
			"remove-item": function(e, index) {
				e.original.preventDefault();
				list.splice(index, 1);
			},
			clear: function(e) {
				e.original.preventDefault();
				list.splice(0, list.length);
			}
		});
	</script>

	<form on-submit="add-item">
		<input type="text" />
		<button type="submit">Add</button>
		<button on-click="clear">Clear</button>
	</form>

	<ul>
	{{# items }}
		<li>{{ . }} <a href="#" on-click="remove-item, {{ $index }}">remove</a></li>
	{{/ items }}
	</ul>

	{{^ items }}
	<p><i>No Items</i></p>
	{{/ items }}
</tyler-list>
`);

var data = window.data = new ReactiveMap({
	name: "Bob",
	color: "blue"
});

window.tpl = Temple.create("my-component", data).paint("body");
