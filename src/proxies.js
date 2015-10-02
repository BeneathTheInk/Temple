import * as _ from "underscore";

var slice = Array.prototype.slice;
slice = slice.call.bind(slice);

var proxies = [{
	match: () => true,
	get: (t, k) => t != null ? t[k] : void 0,
	empty: t => !(_.isArray(t) ? t.length : t),
	section: (t, render) => {
		if (_.isArray(t)) {
			t.forEach(render);
		} else {
			render(t);
		}
	}
}];

export function register(proxy) {
	if (typeof proxy !== "object" || proxy == null) throw new Error("Expecting object for proxy.");
	if (typeof proxy.match !== "function") throw new Error("Proxy missing required match method.");
	if (!has(proxy)) proxies.unshift(proxy);
}

export function remove(proxy) {
	proxies = _.without(proxies, proxy);
}

export function has(proxy) {
	return _.contains(proxies, proxy);
}

export function getByTarget(target, methods) {
	methods = [].concat(methods).filter(_.isString);

	outer: for (let p of proxies) {
		if (!p.match(target)) continue;

		for (let name of methods) {
			if (typeof p[name] !== "function") continue outer;
		}

		return p;
	}
}

export function getValue(target, key) {
	return runWithTarget(target, "get", key);
}

export function getMethod(proxy, name) {
	if (proxy && typeof proxy[name] === "function") {
		return proxy[name];
	}
}

export function run(proxy, name) {
	let method = getMethod(proxy, name);
	let args = slice(arguments, 2);
	return method ? method.apply(proxy, args) : void 0;
}

export function runWithTarget(target, name) {
	var proxy = getByTarget(target, name);

	if (proxy) {
		var args = [ proxy, name, target ].concat(slice(arguments, 2));
		return run.apply(null, args);
	}
}
