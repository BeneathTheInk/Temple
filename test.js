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
<template name="todoapp" use="actions">
	{% if items %}
	<h3>Todo</h3>

	{% render "todolist" %}

	<form on-submit={"add-item",items}>
		<input type="text" name="item-value" autofocus />
		<button type="submit">Add #{{ items.length + 1 }}</button>
	</form>

	{% endif %}
</template>

<template name="todolist">
	<ol>
		{% each item in items %}
		<li>{{ item }}</li>
		{% endeach %}
	</ol>
</template>

<script>
Template.todoapp.actions({
	"add-item": function(e, items) {
		e.original.preventDefault();
		var input = e.target.elements["item-value"];
		var val = input.value;
		if (val) items.push(val);
		input.value = "";
		input.focus();
	}
});
</script>

<template name="stopwatch">
	Seconds Elapsed: {{ elapsed(startDate) }}
</template>

<script>
Template.stopwatch.helpers({
	elapsed: function(startDate) {
		if (startDate == null) return 0;
		return Math.round((Date.now() - startDate)/1000);
	}
});

Template.stopwatch.on("render", function() {
	setTimeout(this.invalidate.bind(this), 1000);
});
</script>

<template name="all">
	<div>{% render "todoapp" %}</div>
	{# <hr />
	<div>{% render "stopwatch" %}</div> #}
</template>
`);

window.tpl = Temple.paint("all", "body", {
	items: new Temple.List(),
	startDate: new Date()
});

} catch(e) {
	console.log(e.stack || e);
	if (e.location) inspect(e.location);
}
