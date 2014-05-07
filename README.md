# Temple.js

A mustache-powered, reactive template framework.

```javascript
// create a template
temple("<span style='color: {{ color }};'>{{ message }}</span>")

// add data
.scope({
	colors: [ "#FF0000", "#00FF00", "#0000FF" ],
	colorIndex: 0,
	message: "Hello World",
	color: function() {
		return this.get("colors." + this.get("colorIndex"));
	}
})

// mix in some async changes
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

```javascript
// create a template
temple("{{ hour }}:{{ minute }}:{{ second }}")

// mix in some async changes
.use(function() {
	this.refreshTime = function() {
		var date = new Date;
		
		this.set({
			hour: formatDigit(date.getHours()),
			minute: formatDigit(date.getMinutes()),
			second: formatDigit(date.getSeconds())
		});
	}

	this.refreshTime();
	setInterval(this.refreshTime.bind(this), 500);

	function formatDigit(digit) {
		if (typeof digit == "number") digit = digit.toString();
		if (digit.length < 2) digit = "0" + digit;
		return digit;
	}
})

// apply to DOM
.paint(document.body);
```