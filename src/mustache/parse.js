var Hogan = require("hogan.js"),
	xml = require('./xml.js'),
	NODE_TYPE = require("../types"),
	HTML_DELIMITERS = [ "[#@!", "!@#]" ];

var parse =
module.exports = function(text, delimiters) {
	var tree = toTree(text.trim(), delimiters);
	
	return {
		type: NODE_TYPE.ROOT,
		children: compileXML(tree)
	}
}

function toTree(text, delimiters){
	return Hogan.parse(Hogan.scan(text, delimiters));
}

function parseXML(tree) {
	var src = "",
		d = HTML_DELIMITERS;

	tree.forEach(function(node, index) {
		if (node.tag === "_t") {
			src += node.text.toString();
		} else {
			src += d[0] + index + d[1];
		}
	});

	return xml.parse(src);
}

function parseXMLText(text, tree) {
	var d = HTML_DELIMITERS;

	return text.split(d[0]).reduce(function(m, v) {
		var end = v.indexOf(d[1]), toPush;
		
		if (end >= 0) {
			var index = parseInt(v.substr(0, end), 10);
			if (!isNaN(index) && index >= 0) m.push(index);
			
			toPush = v.substr(end + d[1].length);
		} else {
			toPush = v;
		}

		if (toPush !== "") m.push(toPush);

		return m;
	}, []).map(function(v) {
		if (typeof v !== "number") return v;
		return tree[v];
	});
}

function appendText(m, text) {
	var last = m[m.length - 1];
	if (last != null && last.type === NODE_TYPE.TEXT) {
		last.value += text;
	} else {
		m.push({
			type: NODE_TYPE.TEXT,
			value: text
		});
	}
}

function compileStash(nodes, isXML) {
	var processNodes = isXML ? compileXML : compileStash;

	return nodes.reduce(function(m, part) {
		if (typeof part === "string") {
			appendText(m, part);
		} else {
			switch (part.tag) {
				case "_t":
					appendText(m, part.text.toString());
					break;

				case "\n":
					appendText(m, "\n");
					break;

				case "_v":
					m.push({
						type: NODE_TYPE.INTERPOLATOR,
						value: part.n
					});
					break;

				case "&":
				case "{":
					m.push({
						type: NODE_TYPE.TRIPLE,
						value: part.n
					});
					break;

				case "#":
					m.push({
						type: NODE_TYPE.SECTION,
						value: part.n,
						children: processNodes(part.nodes, isXML)
					});
					break;

				case "^":
					m.push({
						type: NODE_TYPE.INVERTED,
						value: part.n,
						children: processNodes(part.nodes, isXML)
					});
					break;

				case ">":
					m.push({
						type: NODE_TYPE.PARTIAL,
						value: part.n
					});
					break;

				case "!":
					break;

				default:
					console.log(part);
					break;
			}
		}

		return m;
	}, []);
}

function compileAttributes(attrs, tree) {
	var parsed = [], attr, i;

	for (i in attrs) {
		attr = attrs[i];

		parsed.push({
			type: NODE_TYPE.ATTRIBUTE,
			name: attr.name,
			children: compileStash(parseXMLText(attr.value, tree), false)
		});
	}

	return parsed;
}

function compileElements(nodes, tree) {
	return nodes.map(function(el) {
		if (el.type === "text") {
			return compileStash(parseXMLText(el.value, tree), true);
		} else if (el.type === "element") {
			return {
				type: NODE_TYPE.ELEMENT,
				name: el.name,
				attributes: compileAttributes(el.attributes, tree),
				children: compileElements(el.children, tree)
			}
		}
	}).reduce(function(m, el) {
		if (Array.isArray(el)) m = m.concat(el);
		else m.push(el);
		return m;
	}, []);
}

function compileXML(tree) {
	return compileElements(parseXML(tree), tree);
}