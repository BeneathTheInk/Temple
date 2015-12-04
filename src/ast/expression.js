import Node from "./node";

function render(tree) {
	switch (tree.type) {
		case "Identifier": // plain varable
			return `this.lookup(${JSON.stringify(tree.name)})`;

		case "ThisExpression": // plain varable
			return `this.lookup()`;

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
			else out += ".call(this.lookup()" + (tree.arguments.length ? ", " : "");
			out += tree.arguments.map(render).join(", ") + ")";
			return out;
		}

		case "UnaryExpression": { // single operators: ! - ++ --
			let out = render(tree.argument);
			if (tree.prefix) out = tree.operator + out;
			else out += tree.operator;
			return out;
		}

		default:
			console.log(tree);
			return "";
	}
}

export default class Expression extends Node {
	compile(data) {
		this.start(data);
		this.push(render(this.tree));
		return this.end();
	}
}
