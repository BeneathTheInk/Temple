# Temple.js

A mustache powered reactive template framework.

```javascript
var colors = [ "#FF74B8", "#C286DE" ], i = 1, myview;

myview = new Temple({
	template: "<span style='color: {{ color }};'>{{ message }}</span>",
	data: {
		message: "Hello World"
	}
});

myview.set("color", colors[0]);
myview.paint(document.body);

setInterval(function() {
	myview.set("color", i % 2);
}, 300);
```