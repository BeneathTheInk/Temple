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
<script>
console.log("hello");
</script>

<template name="myTemplate">
	<script>console.log(this);</script>
	<form on-submit="add-item">
		<input type="text" />
		<button type="submit">Add</button>
	</form>

	{% if items.length %}
	<ul>
		{% for items %}
			{% render "listItem" %}
		{% endfor %}
	</ul>
	{% else %}
	<p style="font-style: italic;">No Items</p>
	{% endif %}
</template>

<template name="listItem">
	<li>{{ . }} <a href="#" on-click="remove-item, {{ $index }}">remove</a></li>
</template>
`);

Temple.create("myTemplate").paint("body");
} catch(e) {
	console.log(e.stack || e);
	// inspect(e);
}
