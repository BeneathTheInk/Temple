{
	var _ = require("underscore");
}

start = nodes

nodes = nodes:(comment / element / text)* { return _.compact(nodes); }

comment = "<!--" comment_value "-->" { return; }

comment_value =
	& "-->" { return ""; }
	/ text:(. comment_value) { return text.join(""); }

element = start:element_start nodes:nodes end:element_end {
	if (start.name !== end) {
		throw new Error("Element tag mismatch: " + start.name + " !== " + end);
	}

	start.children = nodes;
	return start;
}

element_start = "<" ws tagname:tagname ws attributes:attributes ">" {
	return { name: tagname, attributes: _.object(attributes) };
}

element_end = "</" ws tagname:tagname ws ">" { return tagname; }

tagname = tagname:[a-z0-9\-_]i+ { return tagname.join("").toLowerCase(); }

attributes = (attr:attribute ws { return attr; })*

attribute = key:tagname ws "=" ws value:(double_quotes / single_quotes) { return [ key, value ]; }

double_quotes = "\"" value:(escape / [^"])* "\"" { return value.join(""); }

single_quotes = "'" value:(escape / [^'])* "'" { return value.join(""); }

text = text:[^<]+ { return text.join(""); }

ws "whitespace" = [ \t\n\r]*

escape = "\\" char:. { return char; }