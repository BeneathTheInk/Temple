{
	var _ = require("underscore");
}

start = array

object = o:(
	l:(k:key ":" v:array { return [ k, v ]; })
	r:(";" object?)?
	{ return r != null && r[1] != null ? [l].concat(r[1]) : [l]; }
) { return _.object(o); }

key = ws k:[a-z0-9_-]i+ ws { return k.join(""); }
	
array =
	l:value r:("," array)?  { return r != null && r[1] != null ? [l].concat(r[1]) : l; }

value = ws v:
	(object
	/ string
	/ boolean
	/ null
	/ undefined
	/ number
	/ anything
	) ws { return v; }
	
boolean
	= "true" { return true; }
	/ "false" { return false; }
	
number = i:[0-9]+ d:("." [0-9]+)? { return parseFloat(_.flatten(i.concat(d)).join("")); }
	
string
	= "\"" v:(escape / [^"])* "\"" { return v.join(""); }
	/ "'" v:(escape / [^'])* "'" { return v.join(""); }

anything = v:[^,]* { return v.join(""); }

null = "null" { return null; }
undefined = ("undefined" / "void" ws [^,]+) { return void 0; }
	
ws "whitespace" = [ \t\n\r]*

escape = "\\" char:. { return char; }