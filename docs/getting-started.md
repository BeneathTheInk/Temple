# Getting Started

To begin using Temple, load it into your environment.

- Download the latest version from our [release page](https://github.com/BeneathTheInk/Temple/releases) and use via a script tag.

	```html
	<script type="text/javascript" src="temple.js"></script>
	<script type="text/javascript">
		Temple.render("<my-template>Hello World</my-template>");
	</script>
	```

- For Browserify or Node.js, install via NPM.

	```sh
	$ npm install templejs
	```

	```js
	var Temple = require("templejs");
	Temple.render("<my-template>Hello World</my-template>");
	```

### A Basic View

Using Temple is really simple; all you need is some data, a template, and a place in the DOM to put everything. Let's use an altered version of the example in the [Mustache manpage](http://mustache.github.io/mustache.5.html).

1. A typical Temple M+XML template:

	```html
	<my-template>
		<script>
		this.helpers({
			after_taxes: function(val) {
				return val - (val * 0.4);
			},
			format_money: function(dollars) {
				return "$" + dollars.toFixed(2);
			}
		});
		</script>

		<p>Hello {{ name }}</p>
		<p>You have just won <b>{{ value | format_money }}</b>!</p>
		{{# in_ca }}
		<p><small>Well, {{ value | after_taxes | format_money }}, after taxes.</small></p>
		{{/ in_ca }}
	</my-template>
	```

2. Given the following data:

	```json
	{
		"name": "Chris",
		"value": 10000,
		"in_ca": true
	}
	```

3. Will produce the following in the `document` body:

	```html
	<my-template>
		<p>Hello Chris</p>
		<p>You have just won <b>$10000.00</b>!</p>
		<p><small>Well, $6000.00, after taxes.</small></p>
	</my-template>
	```

4. When rendered using the following JavaScript:

	```js
	Temple.render(template);
	var view = Temple.create("my-template", data).paint("body");
	```

The `.render()` method compiles the _template_ and turns them into view classes. Next, the `.create()` creates an instance of the template with some _data_. Finally, `.paint()` renders the view and appends it to the bottom of `<body>` as matched by the `"body"` CSS selector. Now rendered, the view is reactive and will update for any changes to data until it is removed from the DOM by calling `.detach()`.
