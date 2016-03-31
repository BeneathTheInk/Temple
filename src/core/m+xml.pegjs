import * as AST from "../ast";
import {assign,map,includes,union} from "lodash";
import jsep from "jsep";
#####

{
	options = assign({
		strict: true
	}, options);

	function createNode(type, props) {
		var loc = location();
		if (typeof type !== "function") type = AST[type];
		return new type(loc.start.line, loc.start.column, props);
	}

	function combineText(nodes, type) {
		return nodes.reduce(function(m, n) {
			var last = m.length - 1;
			if (typeof n === "string" && typeof m[last] === "string") {
				m[last] += n;
			} else {
				m.push(n);
			}
			return m;
		}, []).map(function(n) {
			if (typeof n !== "string") return n;
			return createNode(type || "Text", { value: n });
		});
	}

	function createExpression(v) {
		return createNode("Expression", {
			value: v,
			tree: jsep(v)
		});
	}

	var attributeMode = false;
	function enterAttribute() { attributeMode = true; }
	function exitAttribute() { attributeMode = false; }

	var rawTags = union(["script","style"], Object.keys(options.tags || {}));
	var currentRawTag;
}

start = ws nodes:(
	( rawElementNode
	/ includeNode
	/ templateNode
	/ commentNode ) ws)* {
		return createNode("File", {
			filename: options.filename,
			source: text(),
			children: map(nodes, 0)
		});
	}

/*
Templates
*/
templateNode "template"
	= "<" ws "template" attrs:attributes ">" nodes:html "</template>" {
		var name, type, plugins = [];

		attrs = attrs.filter(function(a) {
			switch (a.name) {
				case "name":
					name = a.value;
					break;

				case "type":
					type = a.value;
					break;

				case "use":
					plugins.push(a.value);
					break;

				default:
					return true;
			}
		});

		return createNode("Template", {
			name: name,
			type: type,
			children: nodes,
			plugins: plugins,
			attributes: attrs
		});
	}

/*
Include
*/
includeNode "include"
	= "<" ws "include" attrs:attributes "/>" {
		var src;

		attrs = attrs.filter(function(a) {
			switch (a.name) {
				case "src":
					src = a.value;
					break;

				default:
					return true;
			}
		});

		return createNode("Include", {
			src: src,
			attributes: attrs
		});
	}

/*
Interpolator
*/
variable "interpolator"
	= value:
	( "{-" v:$(!"-}" .)* "-}" { return v; }
	/ "{{" v:$(!"}}" .)* "}}"  { return v; } ) {
		return createExpression(value);
	}

interpolator = expression:variable {
		return createNode("Interpolator", {
			expression: expression
		});
	}

/*
HTML
*/
html = nodes:
	( commentNode
	/ section
	/ interpolator
	/ elementNode
	/ notClosingTag )* { return combineText(nodes); }

tagname = ws k:$[a-z0-9\-$]i+ ws { return k.toLowerCase(); }

notClosingTag = $(!("</" tagname ">") !"{%" !"{{" .)

// Comment Nodes
commentNode "comment"
	= value:
	( "<!--" v:$(!"-->" .)* "-->" { return v; }
	/ "{#" v:$(!"#}" .)* "#}" { return v; }) {
		return createNode("Comment", { value: value });
	}

rawElementNode "raw tag"
	= "<" tagname:tagname &{
		if (tagname[0] === "$") tagname = tagname.substr(1);
		currentRawTag = tagname;
		return includes(rawTags, tagname);
	} attrs:attributes ">" v:$(!(rawElementClosingTag) .)* rawElementClosingTag &{
		currentRawTag = null;
		return true;
	} {
		if (tagname[0] === "$") tagname = tagname.substr(1);

		return createNode("Raw", {
			tagname: tagname,
			attributes: attrs,
			value: v
		});
	}

rawElementClosingTag = "</" t:tagname &{
	if (t[0] === "$") t = t.substr(1);
	return t === currentRawTag;
} ">"

// Element Nodes
elementNode "element"
	= "<" tagname:tagname attrs:attributes "/>" {
		return createNode("Element", {
			tagname: tagname,
			attributes: attrs,
			children: []
		});
	}
	/ "<" starttag:tagname attrs:attributes ">" nodes:html ("</" t:tagname ">" {
		if (starttag !== t) {
			throw expected("</" + starttag + ">");
		}

		return t;
	}) {
		return createNode("Element", {
			tagname: starttag,
			attributes: attrs,
			children: nodes
		});
	}

/*
Attributes
*/
attributes = (attribute)*

// Element Attribute
attribute "attribute"
	= key:attributeName value:("=" ws &{
		enterAttribute();
		return true;
	} v:attributeValue ws {
		return v;
	})? &{
		exitAttribute();
		return true;
	} {
		return createNode("Attribute", assign({
			name: key,
			children: [],
			type: "empty"
		}, value));
	}

attributeName = ws k:$[a-z0-9\-$]i+ ws { return k.toLowerCase(); }

attributeNode
	= escape
	/ section
	/ variable

attributeValue
	= children:(
		"{" exp:$(!"}" .)* "}" {
			var e = jsep(exp);
			var exps = e.type === "Compound" ? e.body : [e];

			return {
				type: "expression",
				children: exps.map(function(e) {
					return createNode("Expression", { tree: e });
				})
			};
		}

		/ "\"" n:( attributeNode / $(!"\"" .))* "\"" {
			return {
				children: combineText(n, "Literal"),
				type: "string"
			};
		}

		/ "'" n:( attributeNode / $(!"'" .))* "'" {
			return {
				children: combineText(n, "Literal"),
				type: "string"
			};
		}
	) {
		var t = text();
		t = t.substr(1, t.length - 2);

		return assign({
			value: t
		}, children);
	}

/*
Sections
*/

section "section"
	= &(sOpen (name:jsVariable {
		if (!includes([
			"render", "if", "endif", "each", "endeach", "with", "endwith", "set"
		], name)) {
			expected("valid template section name");
		}
	})) v:(ifSection
	/ eachSection
	/ renderSection
	/ withSection
	/ setSection) {
		return v;
	}

sOpen = "{%" ws
sClose = ws "%}"

sectionNodes
	= &{ return attributeMode; } n:(attributeNode / $(!sOpen .))* {
		return combineText(n, "Literal");
	}
	/ html

ifSection "if section"
	= sOpen "if"i ws exp:$(sectionChar)* sClose nodes:sectionNodes
	elsifs:(sOpen "else"i gws "if"i ws exp:$(sectionChar)* sClose nodes:sectionNodes { return [exp,nodes]; })*
	els:(sOpen "else"i sClose nodes:sectionNodes { return nodes; })?
	sOpen "endif"i sClose {
		var branches = [ createNode("Branch", {
			expression: createExpression(exp),
			children: nodes
		}) ];

		elsifs.forEach(function(b) {
			branches.push(createNode("Branch", {
				expression: createExpression(b[0]),
				children: b[1]
			}));
		});

		if (els) branches.push(createNode("Branch", {
			expression: null,
			children: els
		}));

		return createNode("If", {
			children: branches,
			attribute: attributeMode
		});
	}

eachSection "each section"
	= sOpen "each"i ws vars:(l:jsVariable r:(ws "," ws jsVariable)* ws "in" {
		return [l].concat(map(r, 3));
	})? ws exp:$(sectionChar)* sClose nodes:sectionNodes sOpen "endeach"i sClose {
		return createNode("Each", {
			expression: createExpression(exp),
			children: nodes,
			variables: vars || [],
			attribute: attributeMode
		});
	}

jsVariable = $([a-z_$]i [a-z0-9_$]i*)

renderSection "render section"
	= &{ return !attributeMode; } sOpen "render"i ws exp:$(sectionChar)* sClose {
		return createNode("Render", {
			expression: createExpression(exp)
		});
	}

withSection "with section"
	= sOpen "with"i ws exp:$(sectionChar)* sClose nodes:sectionNodes sOpen "endwith"i sClose {
		return createNode("With", {
			expression: createExpression(exp),
			children: nodes,
			attribute: attributeMode
		});
	}

setSection "set section"
	= sOpen "set"i ws v:$([a-z]i [a-z0-9_$]i+) ws "=" ws exp:$(sectionChar)* sClose {
		return createNode("Set", {
			variable: v,
			expression: createExpression(exp),
			attribute: attributeMode
		});
	}

sectionChar = !"%}" .

/*
Literals
*/
boolean
	= "true" { return true; }
	/ "false" { return false; }

number = "-"? [0-9]+ ("." [0-9]+)? { return parseFloat(text(), 10); }

integer = [0-9]+ { return parseInt(text(), 10); }

string
	= "\"" v:(escape / [^"])* "\"" { return v.join(""); }
	/ "'" v:(escape / [^'])* "'" { return v.join(""); }

null = "null" { return null; }
undefined = ("undefined" / "void" gws (![,; \t\n\r] .)+) { return void 0; }

/*
Utils
*/
ws "whitespace" = $[ \t\n\r]*
gws "guaranteed whitespace" = $[ \t\n\r]+

escape = "\\" char:. { return char; }
