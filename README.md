# Temple.js

A mustache-powered, reactive template framework.

```html
<script type="text/temple" id="template">
	<span style='color: {{ color }};'>{{ message }}</span>
</script>
```

```javascript
// create a template
temple("#template")

// add data
.scope({
	colors: [ "#FF74B8", "#C286DE" ],
	colorIndex: 0,
	message: "Hello World",
	color: function() {
		return this.get("colors." + this.get("colorIndex"));
	}
})

// mix in some async changes
.use(function() {
	this.toggleColor = function() {
		var nindex = (this.get("colorIndex") + 1) % this.get("colors.length")
		this.set("colorIndex", nindex);
		return nindex;
	}

	setInterval(this.toggleColor.bind(this), 500);
})

// apply to DOM
.paint(document.body);
```