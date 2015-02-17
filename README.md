# Temple

A modern JavaScript view framework. <http://beneaththeink.com/temple>

* __Modular & Extensible__ - Views are encapsulated, reusable components, making testing and separation of concerns easy.
* __Data Neutral__ - Temple is focused purely on the View aspect of web applications and can be easily integrated with existing frameworks and platforms.
* __Lightweight__ - The main Temple source has been kept to only the absolute essentials. All extras are available as external packages.
* __Reactive__ - Keep the interface up-to-date with auto-running computations powered by [Trackr](https://github.com/beneaththeink/trackr).

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
var Clock = Temple.Text.extend({
	// on init, set the local text value to the current time
	constructor: function() {
		Temple.Text.call(this, Clock.getTime());
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
		this.setValue(Clock.getTime());
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
new Clock().paint("body").mount();
```
