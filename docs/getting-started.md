# Getting Started

To begin using Temple, load it into your environment. Here are two ways to do that.

- Download the latest version from our [release page](https://github.com/BeneathTheInk/Temple/releases) and use via a script tag.

	```js
	<script type="text/javascript" src="temple.js"></script>
	<script type="text/javascript">
		Temple.render(template, data).paint(el);
	</script>
	```

- For Browserify or Node.js, install via NPM.

	```sh
	$ npm install templejs
	```

	```js
	var Temple = require("templejs");
	Temple.render(template, data).paint(el);
	```

Using Temple is really simple; all you need is some data, a template, and a place in the DOM to put everything. Let's use an altered version of the example in the [Mustache manpage](http://mustache.github.io/mustache.5.html).

1. A typical Temple M+XML template:

	```html
	<p>Hello {{ name }}</p>
	<p>You have just won <b>{{ value | format_money }}</b>!</p>
	{{# in_ca }}
	<p><small>Well, {{ taxed_value | format_money }}, after taxes.</small></p>
	{{/ in_ca }}
	```

2. Given the following data:

	```js
	{
		name: "Chris",
		value: 10000,
		in_ca: true,
		taxed_value: function() {
			var val = this.get("value");
			return val - (val * 0.4);
		},
		format_money: function(dollars) {
			return "$" + dollars.toFixed(2);
		}
	}
	```

3. Will produce the following in the `document` body:

	```html
	<p>Hello Chris</p>
	<p>You have just won <b>$10000.00</b>!</p>

	<p><small>Well, $6000.00, after taxes.</small></p>
	```

4. When rendered using the following JavaScript:

	```js
	var tpl = Temple.render(template, data).paint("body");
	```

The `.render()` method creates a __view instance__ from the _template_ and _data_ and `.paint()` _mounts_ the view (renders it) and appends it to the bottom of _body_ as matched by the `"body"` CSS selector.

Once rendered, a Temple view instance is reactive: changes to data will automatically rerender the DOM nodes. This process is controlled by an invalidation cycle that happens at most every animation frame. The rendering engine is decently effecient and will rerender the minimum parts necessary to ensure the interface is up-to-date.

You can try out the Temple's reactivity by changing data directly after calling `.paint()`.

```js
tpl.data.value = 31415;
tpl.data.in_ca = false;
```

