var parser = require("./lib/m+xml");

try {
console.log(require("util").inspect(parser.parse(`
<template name="my-template" extends="my-other-template">
	<form on-submit="add-item">
		<input type="text" />
		<button type="submit">Add</button>
	</form>

	{% if x %}
	{% for y %}blah{% endfor %}

	{% if items.length %}
	<ul>
		{% for items %}
		<li>{{ . }} <a href="#" on-click="remove-item, {{ @index }}">remove</a></li>
		{% endfor %}
	</ul>
	{% else %}
	<p style="font-style: italic;">No Items</p>
	{% endif %}
</template>
`), {
	depth: null,
	colors: true
}));
} catch(e) {
	console.dir(e);
}
