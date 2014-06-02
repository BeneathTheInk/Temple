{
	var _ = require("underscore");
}

start = html

/*
HTML
*/
html = nodes:(commentNode / elementNode / textNode)* { return _.compact(nodes); }

// Text Node
textNode
	= text:[^<]+ { return { type: "text", value: text.join("") }; }

// Comment Nodes
commentNode
	= "<!--" v:("-->" / .)* {
		if (v[v.length - 1] !== "-->")
			throw new Error("Unexpected end of input. Comment tag wasn't closed.");

		return { type: "comment", value: v.slice(0, -1).join("").trim() };
	}

// Element Nodes
elementNode
	= start:elementStart nodes:html end:elementEnd {
		if (start.name.toLowerCase() !== end.toLowerCase()) {
			throw new Error("Element tag mismatch: " + start.name + " !== " + end);
		}

		start.type = "element";
		start.children = nodes;
		return start;
	}

elementStart
	= "<" tagname:key attributes:(attribute)* ">" {
		return { name: tagname, attributes: _.object(attributes) };
	}

elementEnd
	= "</" tagname:key ">" { return tagname; }

// Element Attribute
attribute
	= key:key value:("=" ws string ws)? { return [ key, value != null ? value[2] : "" ]; }

/*
Utils
*/
key = ws k:[a-z0-9_-]i+ ws { return k.join(""); }

string
	= "\"" v:(escape / [^"])* "\"" { return v.join(""); }
	/ "'" v:(escape / [^'])* "'" { return v.join(""); }

ws "whitespace" = [ \t\n\r]*

escape = "\\" char:. { return char; }