import Node from "./node";
import {header,hash} from "./utils";

function render(tree) {
	switch (tree.type) {
		case "Compound": { // expressions seperated by comma or semicolon
			return "(" + tree.body.map(render).join(",") + ")";
		}

		case "Identifier": // plain varable
			return `c.lookup(${JSON.stringify(tree.name)})`;

		case "ThisExpression": // plain varable
			return `c.lookup()`;

		case "MemberExpression": {// object property
			let out = render(tree.object);
			let prop = tree.property;
			if (!tree.computed && prop.type === "Identifier") out += "." + prop.name;
			else out += "[" + render(prop) + "]";
			return out;
		}

		case "Literal": // string, number, boolean
			return JSON.stringify(tree.value);

		case "CallExpression": { // function call
			let out = render(tree.callee);
			if (tree.callee.type === "MemberExpression") out += "(";
			else out += ".call(c.lookup()" + (tree.arguments.length ? ", " : "");
			out += tree.arguments.map(render).join(", ") + ")";
			return out;
		}

		case "UnaryExpression": { // single operators: ! - ++ --
			let out = render(tree.argument);
			if (tree.prefix) out = tree.operator + out;
			else out += tree.operator;
			return out;
		}

		case "LogicalExpression":
		case "BinaryExpression": { // math
			return "(" + render(tree.left) + tree.operator + render(tree.right) + ")";
		}

		case "ArrayExpression": { // arrays
			return "[" + tree.elements.map(render).join(",") + "]";
		}

		case "ConditionalExpression": { // if ? then : else
			return "(" + render(tree.test) +
				"?" + render(tree.consequent) +
				":" + render(tree.alternate) + ")";
		}

		default:
			throw new Error("Not supported.");
	}
}

export default class Expression extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		let exp = render(this.tree);
		let v = ("EXP_" + hash(exp)).replace("-", "_");
		header(data, `var ${v} = function(c){return ${exp};};\n`);
		this.push(data.asFn ? `${v}.bind(null, ctx)` : `${v}(ctx)`);
		return this.end();
	}
}
