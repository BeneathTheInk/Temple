var Temple = global.Temple = require("./");
var util = require("util");

function inspect(i) {
	console.log(util.inspect(i, {
		depth: 100,
		colors: true
	}));
}

try {
Temple.exec(`
<template name="list">
	<form on-submit="add-item">
		<input type="text" name="itemValue" autofocus />
		<button type="submit">Add</button>
		<button on-click="clear-items">Clear</button>
	</form>

	{% if items.length %}
	<ul>
		{% for items %}
		<li>{{ this }} <a href="#" on-click="remove-item, {{ $key }}">remove</a></li>
		{% endfor %}
	</ul>
	{% else %}
	<p style="font-style: italic;">No Items</p>
	{% endif %}
</template>

<script>
Template.list.use("actions");
var items = new Temple.List();

Template.list.helpers({
	items: items
});

Template.list.actions({
	"add-item": function(e) {
		e.original.preventDefault();
		var input = e.target.elements.itemValue;
		var val = input.value;
		if (val) items.push(val);
		input.value = "";
		input.focus();
	},
	"remove-item": function(e, index) {
		e.original.preventDefault();
		console.log(index);
		items.splice(index, 1);
	},
	"clear-items": function(e) {
		e.original.preventDefault();
		items.splice(0, items.length);
	}
});

Template.list.decorate("autofocus", function(d) {
	console.log(d.view.firstRender);
	d.target.focus();
});
</script>
`);

var tpl = window.tpl = Temple.render("list");
tpl.paint("body");
} catch(e) {
	console.log(e.stack || e);
	// inspect(e);
}
