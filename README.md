# Temple

Sensible templating for the modern browser.

* __Modern__ - Pure [Mustache](http://mustache.github.io/) + HTML.
* __Reactive__ - Powered by a live DOM that automatically updates as the data changes.
* __Built to Scale__ - Works great for projects of all sizes.
* __Extensible__ - The API only provides the basics, allowing you to add what you need.

__Note: This library is under active development and the API may change without notice. Use at your own risk!__

## Install

Download the latest version from our [release page](https://github.com/BeneathTheInk/Temple.js/releases) and use via a script tag. The variable `Temple` will be attached to `window`.

```html
<script type="text/javascript" src="temple.js"></script>
```

If using Browserify or Node.js, you can install via NPM and use via `require("templejs")`.

	$ npm install templejs

## Example

```javascript
// create a template
Temple("<span style='color: {{ color }};'>{{ message }}</span>")

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