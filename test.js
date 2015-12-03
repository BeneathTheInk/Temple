var parser = require("./lib/m+xml");
var util = require("util");

function inspect(i) {
	console.log(util.inspect(i, {
		depth: 100,
		colors: true
	}));
}

try {
inspect(parser.parse(`
<script>
console.log("hello");
</script>

<template name="my-template" extends="my-other-template">
	<form on-submit="add-item">
		<input type="text" />
		<button type="submit">Add</button>
	</form>

	{% if items.length %}
	<ul>
		{% for k, v in items %}
		<li>{{ v }} <a href="#" on-click="remove-item, {{ k }}">remove</a></li>
		{% endfor %}
	</ul>
	{% else if xyz %}
	boom
	{% else %}
	<p style="font-style: italic;">No Items</p>
	{% endif %}
</template>
`));
} catch(e) {
	inspect(e);
}
