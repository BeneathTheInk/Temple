var Temple = require("./");
var util = require("util");

function inspect(i) {
	console.log(util.inspect(i, {
		depth: 100,
		colors: true
	}));
}

try {
Temple.exec(`
<template name="myTemplate">
	<script>
	this.use("actions");
	var items = new Temple.List();

	this.helpers({
		items: items
	});

	this.actions({
		"add-item": function(e) {
			e.original.preventDefault();
			var form = e.target;
			var input = form.elements.itemValue;
			items.push(input.value);
			input.value = "";
			input.focus();
		},
		"remove-item": function(e, index) {
			e.original.preventDefault();
			items.splice(index, 1);
		},
		"clear-items": function(e) {
			e.original.preventDefault();
			items.splice(0, items.length);
		}
	});
	</script>

	<form on-submit="add-item">
		<input type="text" name="itemValue" />
		<button type="submit">Add</button>
		<button on-click="clear-items">Clear</button>
	</form>

	{% if items.length %}
	<ul>{% for items %}{% render "listItem" %}{% endfor %}</ul>
	{% else %}
	<p style="font-style: italic;">No Items</p>
	{% endif %}
</template>

<template name="listItem">
	<li>{{ this }} <a href="#" on-click="remove-item, {{ $index }}">remove</a></li>
</template>
`);

var tpl = window.tpl = Temple.create("myTemplate");
tpl.paint("body");
} catch(e) {
	console.log(e.stack || e);
	// inspect(e);
}
