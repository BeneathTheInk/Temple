import * as _ from "lodash";

export function header(data, h) {
	if (_.isArray(data.headers) && !_.contains(data.headers, h)) {
		data.headers.push(h);
	}
}

export function hash(str) {
	var h = 0, i, chr, len;

	if (str.length === 0) return h;

	for (i = 0, len = str.length; i < len; i++) {
		chr = str.charCodeAt(i);
		h = ((h << 5) - h) + chr;
		h |= 0; // Convert to 32bit integer
	}

	return h;
}

export function compileGroup(nodes, data) {
	return nodes.map(function(n, i) {
		return n.compile(addKey(data, i.toString()));
	});
}

export function getKey(data) {
	return (data.key || []).reduce(function(memo, v) {
		if (_.isString(v) && _.isString(_.last(memo))) {
			memo.push(memo.pop() + "-" + v);
		} else {
			memo.push(v);
		}

		return memo;
	}, []).map(function(v, i, l) {
		if (typeof v === "object") return v.value;
		if (i !== 0) v = "-" + v;
		if (i !== l.length - 1) v += "-";
		return JSON.stringify(v);
	}).join(" + ");
}

export function addKey(data, key) {
	let base = data.key || [];
	return _.extend({}, data, {
		key: [].concat(base, key)
	});
}

export function resetKey(data) {
	return _.extend({}, data, { key: [] });
}

export function contextHeader(data, h) {
	if (_.isArray(data.contextHeaders) && !_.contains(data.contextHeaders, h)) {
		data.contextHeaders.push(h);
	}
}

export function resetContextHeader(data) {
	return _.extend({}, data, { contextHeaders: [] });
}
