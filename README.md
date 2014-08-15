# Temple

A modern JavaScript view framework.

* __Modular & Extensible__ - Views are encapsulated, reusable components, making testing and separation of concerns easy.
* __Data Neutral__ - Temple is focused purely on the View aspect of web applications and can be easily integrated with existing frameworks and platforms.
* __Tiny__ - Temple has no external dependencies and weighs in at just under 19KB minified.
* __Reactive__ - Keep the interface up-to-date flexibly with auto-running computations powered by [Meteor](http://meteor.com)'s [dependency package](https://github.com/meteor/meteor/blob/e78861b7d0dbb60e5e2bf59bab2cb06ce6596c04/packages/deps/deps.js).

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
// A simple clock component
var Clock = Temple.extend({
	// on init, append a new text binding to hold the time value
	initialize: function() {
		this.time = this.appendChild(Clock.getTime());
	},

	// start an interval on mount that will continiously update the time
	beforeMount: function(comp) {
		this.interval = setInterval(this.invalidate.bind(this), 500);
	},

	// when the view is unmounted, clear the interval
	onStop: function() {
		clearInterval(this.interval);
		delete this.interval;
	},

	// updates the value of the text binding to the current time
	render: function() {
		this.time.setValue(Clock.getTime());
	}
}, {
	// a static method that returns the current time as a string
	getTime: function() {
		var date = new Date;

		return [
			date.getHours(),
			date.getMinutes(),
			date.getSeconds()
		].map(function(digit) {
			return (digit < 10 ? "0" : "") + digit;
		}).join(":");
	}
});

// render a new instance of clock in the body element
new Clock().mount().paint("body");
```
