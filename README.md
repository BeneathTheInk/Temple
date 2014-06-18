# Temple

A modern JavaScript view framework.

* __Reactive__ - Powered by a ViewModel that automatically updates the DOM as the data changes.
* __Modular & Extensible__ - Views are encapsulated, reusable components, making testing and separation of concerns easy.
* __Mustache__ - Includes an *optional* [Mustache](http://mustache.github.io/) + XML language parser and renderer.

__Note: This library is under active development. Use at your own risk!__

## Install

Download the latest version from our [release page](https://github.com/BeneathTheInk/Temple/releases) and use via a script tag. The variable `Temple` will be attached to `window`.

```html
<script type="text/javascript" src="temple.js"></script>
```

If using Browserify or Node.js, you can install via NPM and use via `require("templejs")`.

```shell
$ npm install templejs
```

## Example

```javascript
// create a template
new Temple.Mustache("<span style='color: {{ color }};'>{{ message }}</span>")

// add data
.set({
	colors: [ "red", "blue", "green" ],
	colorIndex: 0,
	message: "Hello World",
	color: function() {
		return this.get("colors." + this.get("colorIndex"));
	}
})

// mix in some reactive changes
.use(function() {
	this.toggleColor = function() {
		var newIndex = (this.get("colorIndex") + 1) % this.get("colors.length");
		this.set("colorIndex", newIndex);
		return newIndex;
	}

	setInterval(this.toggleColor.bind(this), 500);
})

// apply to DOM
.paint(document.body);
```