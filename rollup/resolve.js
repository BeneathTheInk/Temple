import _resolve from "rollup-plugin-node-resolve";

const resolve = _resolve({
	jsnext: false,
	main: true,
	browser: false
});

const relPath = /^\.{0,2}\//;
const incremental = /^incremental-dom/;

export default function() {
	return {
		resolveId: function(id, p) {
			// not entry, not incremental dom, and not relative path = external module
			if (p && !incremental.test(id) && !relPath.test(id)) return false;

			// otherwise resolve like node resolves
			return resolve.resolveId.apply(this, arguments);
		}
	};
}
