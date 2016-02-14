/* globals COVERAGE_PORT */

import test from "tape";

// push code coverage details back to the server
test.onFinish(function() {
	if (typeof window !== "undefined" && window.__coverage__ && typeof COVERAGE_PORT !== "undefined") {
		var xhr = new XMLHttpRequest();
		xhr.open("POST", "http://localhost:" + COVERAGE_PORT);
		xhr.setRequestHeader("Content-Type", "application/json");
		xhr.send(JSON.stringify(window.__coverage__));
	}
});
