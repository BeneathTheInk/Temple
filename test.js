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
<!-- my component -->
<my-component>
	<script>
	this.helpers({
		fartName: function() {
			return this.get("name") + "fart";
		}
	});
	</script>

	{{> my-partial }}
	<hr />
	<click-counter-2>x{{ getCount }}</click-counter-2>
	<hr />
	<tyler-list />

	{{% my-partial }}
	<h1 style="color: {{ color }};">Hello {{ fartName }}!</h1>
	{{/ my-partial }}
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

	{{$ content }}

	{{% content }}
	This has been clicked {{ getCount }} times.
	{{/ content }}
</click-counter>

<click-counter-2 extends="click-counter">
	{{> @super }}

	{{% content }}
	Clicked x{{ getCount }}
	{{/ content }}
</click-counter-2>

<tyler-list>
	<script>
		this.use("actions");
		this.use("refs");
		this.use("twoway");

		var list = new ReactiveList();
		var temp = new ReactiveVar();

		this.helpers({
			items: function() {
				return list;
			},
			getLength: function() {
				return list.length;
			}
		});

		this.actions({
			"add-item": function(e) {
				e.original.preventDefault();
				var input = e.target.elements[0];
				var val = input.value;
				if (val) {
					list.push(val);
					input.value = "";
					temp.set("");
					input.focus();
				}
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

		this.twoway("item", function() {
			return "";
		}, function(val) {
			temp.set(val);
		});

		this.decorate("enable-clear", function(d) {
			d.target.disabled = !list.length;
		});

		this.decorate("enable-add", function(d) {
			d.target.disabled = !temp.get();
		});
	</script>

	<form on-submit="add-item">
		<input type="text" bind-to="item" />
		<button ref="add-btn" type="submit" enable-add>Add</button>
		<button on-click="clear" enable-clear>Clear</button>
	</form>

	<ul>
	{{# items }}
		<li>{{ . }} <a href="#" on-click="remove-item, {{ @index }}">remove</a></li>
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
