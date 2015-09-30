import * as _ from "underscore";
import { parse } from "./m+xml";
import { SourceNode } from "source-map";

export default function compile(tree, options) {
	options = _.extend({
		originalFilename: "template.js"
	}, options);

	let src;
	if (typeof tree === "string") {
		src = tree;
		tree = parse(src, options);
	}

	let nodes = _.invoke([].concat(tree), "compile", options);
	let source = new SourceNode(null, null, options.originalFilename, nodes);
	if (!options.sourceMap) return source.toString();

	if (src) source.setSourceContent(options.originalFilename, src);
	let result = source.toStringWithSourceMap();
	let map64 = new Buffer(result.map.toString(), "utf-8").toString("base64");
	return result.code + "//# sourceMappingURL=data:application/json;charset=utf-8;base64," + map64;
}
