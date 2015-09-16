import * as _ from "underscore";
import { Map as ReactiveMap } from "trackr-objects";

var proxies = [{
	match: t => t instanceof ReactiveMap,
	get: (t, k) => t.get(k)
},{
	match: t => t != null,
	get: (t, k) => t[k]
}];

export function register(proxy) {
	if (typeof proxy !== "object" || proxy == null) throw new Error("Expecting object for proxy.");
	if (typeof proxy.match !== "function") throw new Error("Proxy missing required match method.");
	if (typeof proxy.get !== "function") throw new Error("Proxy missing required get method.");
	if (!has(proxy)) proxies.unshift(proxy);
}

export function has(proxy) {
	return _.contains(proxies, proxy);
}

export function getByTarget(target) {
	for (let p of proxies) if (p.match(target)) return p;
}

export function getValue(target, key) {
	var proxy = getByTarget(target);
	if (proxy) return proxy.get(target, key);
}
