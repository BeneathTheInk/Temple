var Temple = require("./");
var util = require("util");

function inspect(i) {
	console.log(util.inspect(i, {
		depth: 100,
		colors: true
	}));
}

try {
console.log(Temple.compile(`
<script>
console.log("hello");
</script>

<template name="my-template" extends="my-other-template">
	<script>console.log(this);</script>
	<form on-submit="add-item">
		<input type="text" />
		<button type="submit">Add</button>
	</form>

	{% if items.length %}
	<ul>
		{% for items %}
			{% render "list-item" %}
		{% endfor %}
	</ul>
	{% else %}
	<p style="font-style: italic;">No Items</p>
	{% endif %}
</template>

<template name="list-item">
	<li>{{ . }} <a href="#" on-click="remove-item, {{ $index }}">remove</a></li>
</template>
`));
} catch(e) {
	console.log(e.stack || e);
	// inspect(e);
}
