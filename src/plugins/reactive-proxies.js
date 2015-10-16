import { Map as ReactiveMap, Variable as ReactiveVar, List as ReactiveList } from "trackr-objects";
import { runWithTarget, register } from "../proxies";

register({
	match: t => ReactiveMap.isMap(t),
	get: (t, k) => t.get(k)
});

register({
	match: t => ReactiveList.isList(t),
	get: (t, k) => k === "length" ? t.length : t.get(k),
	empty: t => !t.length,
	section: (t, render) => t.forEach(render)
});

register({
	match: t => ReactiveVar.isVariable(t),
	get: (t, k) => runWithTarget(t.get(), "get", k),
	empty: t => runWithTarget(t.get(), "empty"),
	section: (t, r) => runWithTarget(t.get(), "section", r)
});
