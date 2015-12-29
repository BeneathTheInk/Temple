import Node from "./node";
import {header,hash,contextHeader} from "./utils";

export default class Expression extends Node {
	get reactive() { return true; }

	compile(data) {
		this.start(data);
		let exp = Expression.render(this.tree);
		let v = ("EXP_" + hash(exp)).replace("-", "_");

		if (Expression.isStatic(this.tree)) {
			if (data.asFn) {
				header(data, `var ${v} = function(){return ${exp};};\n`);
				this.push(`${v}`);
			} else {
				this.push(exp);
			}
		} else {
			header(data, `var ${v} = function(c){return ${exp};};\n`);

			if (data.asFn) {
				let cv = "B" + v;
				contextHeader(data, `var ${cv} = function(){return ${v}(ctx);};`);
				this.push(cv);
			} else {
				this.push(`${v}(ctx)`);
			}
		}

		return this.end();
	}

	static isStatic(tree) {
		let _isStatic = Expression.isStatic;

		switch (tree.type) {
			case "Compound": return tree.body.every(_isStatic);
			case "Identifier": return false;
			case "ThisExpression": return false;
			case "MemberExpression": {
				if (!_isStatic(tree.object)) return false;
				let prop = tree.property;
				if (!tree.computed && prop.type === "Identifier") return true;
				return _isStatic(prop);
			}
			case "Literal": return true;
			case "CallExpression": {
				return _isStatic(tree.callee) && tree.arguments.every(_isStatic);
			}
			case "UnaryExpression": return _isStatic(tree.argument);
			case "LogicalExpression":
			case "BinaryExpression": return _isStatic(tree.left) && _isStatic(tree.right);
			case "ArrayExpression": return tree.elements.every(_isStatic);
			case "ConditionalExpression": {
				return [tree.test,tree.consequent,tree.alternate].every(_isStatic);
			}
			default:
				return false;
		}
	}

	static render(tree) {
		let _render = Expression.render;

		switch (tree.type) {
			case "Compound": { // expressions seperated by comma or semicolon
				return "(" + tree.body.map(_render).join(",") + ")";
			}

			case "Identifier": // plain varable
				return `c.lookup(${JSON.stringify(tree.name)})`;

			case "ThisExpression": // plain varable
				return `c.lookup()`;

			case "MemberExpression": {// object property
				let out = _render(tree.object);
				let prop = tree.property;
				if (!tree.computed && prop.type === "Identifier") out += "." + prop.name;
				else out += "[" + _render(prop) + "]";
				return out;
			}

			case "Literal": // string, number, boolean
				return JSON.stringify(tree.value);

			case "CallExpression": { // function call
				let out = _render(tree.callee);
				if (tree.callee.type === "MemberExpression") out += "(";
				else out += ".call(c.lookup()" + (tree.arguments.length ? ", " : "");
				out += tree.arguments.map(_render).join(", ") + ")";
				return out;
			}

			case "UnaryExpression": { // single operators: ! - ++ --
				let out = _render(tree.argument);
				if (tree.prefix) out = tree.operator + out;
				else out += tree.operator;
				return out;
			}

			case "LogicalExpression":
			case "BinaryExpression": { // math
				return "(" + _render(tree.left) + tree.operator + _render(tree.right) + ")";
			}

			case "ArrayExpression": { // arrays
				return "[" + tree.elements.map(_render).join(",") + "]";
			}

			case "ConditionalExpression": { // if ? then : else
				return "(" + _render(tree.test) +
					"?" + _render(tree.consequent) +
					":" + _render(tree.alternate) + ")";
			}

			default:
				throw new Error("Not supported.");
		}
	}
}
