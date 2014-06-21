var _ = require("underscore"),
	Binding = require("./index"),
	React = require("./react"),
	Scope = require("./scope");

var proto = {}

for (var k in React.prototype) {
	if (_.has(React.prototype, k)) {
		proto[k] = React.prototype[k];
	}
}

for (var k in Scope.prototype) {
	if (_.has(Scope.prototype, k)) {
		proto[k] = Scope.prototype[k];
	}
}

proto.constructor = function(data) {
	React.call(this);
	this.setModel(data);
}

var ReactScope =
module.exports = Binding.extend(proto);