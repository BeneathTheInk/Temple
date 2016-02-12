require("./parser");

if (process.browser) {
	require("./dom");
}

// push code coverage details back to the server
var test = require("tape");
test.onFinish(function() {
	if (typeof window !== "undefined" && window.__coverage__) {
		var xhr = new XMLHttpRequest();
		xhr.open("POST", "http://localhost:5000");
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.send(JSON.stringify(window.__coverage__));
	}
});
