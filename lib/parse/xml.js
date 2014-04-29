
/**
 * Expose `parse`.
 */

module.exports = parse;

/**
 * Parse the given string of `xml`.
 *
 * @param {String} xml
 * @return {Object}
 * @api public
 */

function parse(xml) {
	// strip comments
	xml = xml.replace(/<!--.*?-->/g, '');

	return children();

	/**
	 * Tag.
	 */

	function tag() {
		var m = match(/^<([\w+:]+)\s*/);
		if (!m) return;

		// name
		var node = {
			name: m[1],
			attributes: {}
		};

		// attributes
		while (!(eos() || is('>') || is('?>'))) {
			var attr = attribute();
			if (!attr) return node;
			node.attributes[attr.name] = attr.value;
		}

		match(/\??>\s*/);

		// children
		node.children = children();

		// closing
		match(/^<\/[\w:]+>\s*/);

		return node;
	}

	function children() {
		var childs = [];

		// initial text node
		var text = content();
		if (text != "") childs.push(text);

		// children
		var child;
		while (child = tag()) {
			childs.push(child);
			if ((text = content()) != "") childs.push(text);
		}

		return childs;
	}

	/**
	 * Text content.
	 */

	function content() {
		var m = match(/^([^<]*)/);
		if (m) return m[1];
		return '';
	}

	/**
	 * Attribute.
	 */

	function attribute() {
		var m = match(/([\w:]+)\s*=\s*("[^"]*"|'[^']*'|\w+)\s*/);
		if (!m) return;
		return { name: m[1], value: strip(m[2]) }
	}

	/**
	 * Strip quotes from `val`.
	 */

	function strip(val) {
		return val.replace(/^['"]|['"]$/g, '');
	}

	/**
	 * Match `re` and advance the string.
	 */

	function match(re) {
		var m = xml.match(re);
		if (!m) return;
		xml = xml.slice(m[0].length);
		return m;
	}

	/**
	 * End-of-source.
	 */

	function eos() {
		return 0 == xml.length;
	}

	/**
	 * Check for `prefix`.
	 */

	function is(prefix) {
		return 0 == xml.indexOf(prefix);
	}
}