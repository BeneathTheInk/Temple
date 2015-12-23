var Temple = global.Temple = require("./");
// var util = require("util");
//
// function inspect(i) {
// 	console.log(util.inspect(i, {
// 		depth: 100,
// 		colors: true
// 	}));
// }

try {
Temple.exec(`
<template name="todoapp">
	<h3>Todo</h3>

	{% render "todolist" %}

	<form on-submit="add-item">
		<input type="text" ref="item-value" autofocus />
		<button type="submit">Add #{{ items.length + 1 }}</button>
	</form>
</template>

<template name="todolist">
	<ul>
		{% each items %}
		<li>{{ this }} <a href="#" on-click="{{ [ 'remove-item', $key ] }}">remove</a></li>
		{% endeach %}
	</ul>
</template>

<script>
todoapp.use("actions");
todoapp.use("refs");

todoapp.actions({
	"add-item": function(e) {
		e.original.preventDefault();
		var items = this.lookup("items");
		var input = this.refs["item-value"];
		var val = input.value;
		if (val) items.push(val);
		input.value = "";
		input.focus();
	},
	"remove-item": function(e, index) {
		e.original.preventDefault();
		var items = this.lookup("items");
		items.splice(index, 1);
	},
	"clear-items": function(e) {
		e.original.preventDefault();
		var items = this.lookup("items");
		items.splice(0, items.length);
	}
});
</script>

<template name="stopwatch">
	Seconds Elapsed: {{ elapsed(startDate) }}
</template>

<script>
stopwatch.helpers({
	elapsed: function(startDate) {
		if (startDate == null) return 0;
		return (Date.now() - startDate)/1000;
	}
});

stopwatch.on("render", function() {
	setTimeout(this.invalidate.bind(this), 992);
});
</script>
`);

window.tpl = Temple.paint("todoapp", "body", {
	items: new Temple.List()
});

// window.tpl = Temple.paint("stopwatch", "body", {
// 	startDate: new Date()
// });

} catch(e) {
	console.log(e.stack || e);
	// inspect(e);
}
