# Temple

A modern JavaScript view framework.

* __Reactive__ - Powered by [Meteor](http://meteor.com)'s [dependency package](https://github.com/meteor/meteor/blob/e78861b7d0dbb60e5e2bf59bab2cb06ce6596c04/packages/deps/deps.js), it is simple to automatically update the DOM as things change.
* __Modular & Extensible__ - Views are encapsulated, reusable components, making testing and separation of concerns easy.
* __Impartial__ - Temple is focused purely on the View aspect of web applications and can be easily integrated with existing platforms.

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
	
	// we init and append a new text component when a clock is created
	initialize: function() {
		this.appendChild(this.time = new Temple.Text());
	},

	// when clock mounts, we create an interval to continue updating the time
	willMount: function() {
		this.interval = setInterval(this.invalidate.bind(this), 500);
	},

	// when the clock unmounts, we clear the interval
	didStop: function() {
		clearInterval(this.interval);
		delete this.interval;
	},

	// render updates the text component with the latest time
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
			digit = digit.toString(10);
			if (digit.length < 2) digit = "0" + digit;
			return digit;
		}).join(":");
	}

});

// render a new instance of clock in the body element
new Clock().mount().paint("body");
```