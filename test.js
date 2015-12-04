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
	var items = new Temple.List([ "asdf" ]);

	this.helpers({
		items: items
	});
	</script>

	<form on-submit="add-item">
		<input type="text" />
		<button type="submit">Add</button>
	</form>

	{% if items.length %}
	<ul>
		{% for items %}
			<li>{{$index}}: {{ this }}</li>
			{# {% render "listItem" %} #}
		{% endfor %}
	</ul>
	{% else %}
	<p style="font-style: italic;">No Items</p>
	{% endif %}
</template>

<template name="listItem">
	<li>{{ this }} <a href="#" on-click="remove-item, {{ $index }}">remove</a></li>
</template>
`);

var tpl = window.tpl = Temple.create("myTemplate", {
	items: [],
	debug: function(arg) {
		console.log(arg);
	}
});

tpl.paint("body");
} catch(e) {
	console.log(e.stack || e);
	// inspect(e);
}
