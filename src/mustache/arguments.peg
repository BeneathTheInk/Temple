{
	function flatten(arr) {
		return arr.reduce(function(m, v) {
			if (Array.isArray(v)) m = m.concat(flatten(v));
			else m.push(v);
			return m;
		}, []);
	}
}

start = array

// Array
array =
	l:value r:("," array)?  { return r != null && r[1] != null ? [l].concat(r[1]) : [l]; }

// Value
value = ws v:
	( variable
	/ string
	/ boolean
	/ number
	/ null
	/ undefined
	/ dumb_string ) ws { return v; }

// Variables
variable
	= "{{" s:(escape / [^}])+ "}}" { return options.scope.get(s.join("").trim()); }

// Literals
boolean
	= "true" { return true; }
	/ "false" { return false; }
	
number = i:("-"? [0-9]+) d:("." [0-9]+)? { return parseFloat(flatten(i.concat(d)).join("")); }
	
string
	= "\"" v:(escape / [^"])* "\"" { return v.join(""); }
	/ "'" v:(escape / [^'])* "'" { return v.join(""); }

dumb_string = v:[^,]* { return v.join("").trim(); }

null = "null" { return null; }
undefined = ("undefined" / "void" ws [^,]+) { return void 0; }

// Utils
ws "whitespace" = [ \t\n\r]*

escape = "\\" char:. { return char; }