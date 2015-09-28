import * as _ from "underscore";
import Trackr from "trackr";
import View from "./view";
import Context from "./context";
import { incremental, autopatch } from "./render";

class Row {
	constructor(key, section) {
		this.key = key;
		this.section = section;
	}

	render(data) {
		let self = this;

		this.patcher = autopatch(function() {
			data = typeof data === "function" ? data() : data;
			let ctx = new Context(data, self.section.context);
			return incremental(self.section.template, ctx);
		});
	}

	move(before) {
		// transform before into row object
		before = this.section.has(before) ?
			this.section.get(before) :
			null;

		// remove from row list
		let index = this.section.rows.indexOf(this);
		if (index >= 0) this.section.rows.splice(index, 1);

		// place back in list before
		if (before) {
			this.section.rows.splice(this.section.rows.indexOf(bindex), 0, this);
		} else {
			this.section.rows.push(this);
		}

		if (this.patcher) this.patcher.moveTo(null, before.firstNode());

	}
}

export default class Section {
	constructor(inverted, template, ctx) {
		this.inverted = Boolean(inverted);
		this.template = template;
		this.context = ctx;
		this.rows = [];
		this.rowsByKey = {};
	}

	has(key) {
		return Boolean(this.rowsByKey[key]);
	}

	get(key) {
		let row = this.rowsByKey[key];

		if (!row) {
			row = this.rowsByKey[key] = new Row(key, this);
			this.rows.push(row);
		}

		return row;
	}

	getNodes() {
		let nodes = [];

		// for (let row of this.rows) {
		// 	nodes.push.apply(nodes, )
		// }
	}
}

// export default class Section {
// 	constructor(inverted, template, ctx) {
// 		this.inverted = Boolean(inverted);
// 		this.template = template;
// 		this.context = ctx;
// 		this.rows = [];
// 	}
//
// 	_checkIndex(index, def) {
// 		if (index !== (index | 0) || index < 0) {
// 			if (def !== void 0) return def;
// 			throw new Error("Expecting non-negative integer for index.");
// 		}
//
// 		return index;
// 	}
//
// 	getRow(index) {
// 		this._checkIndex(index);
// 		return this.rows[index];
// 	}
//
// 	addRow(index) {
// 		index = this._checkIndex(index, this.rows.length);
// 		let row = {};
// 		if (index >= this.rows.length) this.rows.push(row);
// 		else this.rows.splice(index, 0, row);
// 		this.touch(row);
// 		return row;
// 	}
//
// 	update(index, fn) {
// 		let self = this;
// 		let row = this.get(index);
// 		if (!row) row = this.addRow(index);
// 		this.touch(row);
//
// 		row.patcher = autopatch(function() {
// 			incremental(self.template, new Context(data, self.context));
// 		});
// 	}
//
// 	// add(index, data) {
// 	// 	this.addRow(index);
// 	// 	return this.update(index, data);
// 	// }
//
// 	remove(index) {
// 		let row = this.get(index);
// 		if (!row) return;
//
// 		this.rows.splice(index, 1);
// 		row.nodes.forEach(function() {
//
// 		});
// 	}
//
// 	clear() {
//
// 	}
//
// 	setNodes(index, nodes) {
// 		let row = this.get(index);
// 		if (!row)
// 		return (row.nodes = [].concat(nodes).filter(Boolean));
// 	}
//
// 	getNodes(index) {
//
// 	}
//
// 	getAllNodes() {
// 		console.log(this.rows);
// 	}
//
// 	record() {
// 		if (!this.touched) this.touched = [];
// 		return this;
// 	}
//
// 	touch(row) {
// 		if (this.touched && !_.contains(this.touched, row)) {
// 			this.touched.push(row);
// 		}
//
// 		return this;
// 	}
//
// 	// remove rows that were not used
// 	clean() {
// 		let clean = _.difference(this.rows, this.touched);
// 		delete this.touched;
// 		_.invoke(clean, "remove");
// 		return this;
// 	}
// }

// export var Row = View.extend({
// 	constructor: function() {
//
// 	},
//
// 	render: function() {
//
// 	},
//
// 	remove: function() {
//
// 	},
//
// 	moveTo: function() {
//
// 	}
// });


// var _ = require("underscore");
// var Trackr = require("trackr");
// var Context = require("./model");
// var View = require("./view");
//
// module.exports = View.extend({
// 	constructor: function() {
// 		this.rows = {};
// 		this._row_deps = {};
// 		View.apply(this, arguments);
// 	},
//
// 	invert: function(val) {
// 		if (!_.isBoolean(val)) val = !this._inverted;
// 		this._inverted = val;
// 		return this;
// 	},
//
// 	isInverted: function() {
// 		return !!this._inverted;
// 	},
//
// 	setPath: function(path) {
// 		this._path = path;
// 		return this;
// 	},
//
// 	onRow: function(fn) {
// 		if (!_.isFunction(fn))
// 			throw new Error("Expecting function for row handler.");
//
// 		this._onRow = fn;
// 		return this;
// 	},
//
// 	addRow: function(key, data) {
// 		// remove existing
// 		this.removeRow(key);
//
// 		// convert data to model
// 		if (!Context.isContext(data)) {
// 			data = this.append(data);
// 		}
//
// 		// create a new row
// 		var row = new View(data);
//
// 		// set up render and mount it
// 		row.render = this._onRow;
// 		this.rows[key] = row;
// 		this.addMember(row);
// 		row.mount();
//
// 		return row;
// 	},
//
// 	hasRow: function(key) {
// 		return this.getRow(key) != null;
// 	},
//
// 	getRow: function(key) {
// 		return this.rows[key];
// 	},
//
// 	removeRow: function(key) {
// 		if (this.rows[key] == null) return this;
//
// 		var row = this.rows[key];
// 		this.removeMember(row);
// 		delete this.rows[key];
//
// 		return this;
// 	},
//
// 	removeAllRows: function() {
// 		Object.keys(this.rows).forEach(this.removeRow, this);
// 		return this;
// 	},
//
// 	render: function() {
// 		if (this._path == null) throw new Error("Missing path.");
//
// 		var val, isEmpty, inverted, isList,
// 			model, proxy, keys;
//
// 		val = this.get(this._path);
// 		model = this.append(val);
// 		proxy = model.getProxyByValue(val);
// 		inverted = this.isInverted();
// 		isList = model.callProxyMethod(proxy, val, "isList");
//
// 		function getEmptiness() {
// 			return model.callProxyMethod(proxy, val, "isEmpty");
// 		}
//
// 		Trackr.nonreactive(function() {
// 			isEmpty = !val || (isList && !getEmptiness());
// 		});
//
// 		if (isEmpty && inverted) {
// 			if (isList) getEmptiness();
// 			this.addRow(0, model);
// 		} else if (!isEmpty && !inverted) {
// 			if (isList) {
// 				keys = [];
//
// 				this.autorun(function(comp) {
// 					var nkeys = model.callProxyMethod(proxy, val, "keys");
//
// 					// trick Trackr so autoruns aren't controlled by this one
// 					Trackr.currentComputation = comp._parent;
//
// 					// remove removed rows
// 					_.difference(keys, nkeys).forEach(function(key) {
// 						if (this._row_deps[key]) {
// 							this._row_deps[key].stop();
// 							delete this._row_deps[key];
// 						}
//
// 						this.removeRow(key);
// 					}, this);
//
// 					// add added rows
// 					_.difference(nkeys, keys).forEach(function(key) {
// 						var row, rmodel;
//
// 						row = this.getRow(key);
// 						rmodel = row != null ? row.model :
// 							this.append({ $key: key }).append(null);
//
// 						this._row_deps[key] = this.autorun(function() {
// 							rmodel.set(model.callProxyMethod(proxy, val, "get", key));
// 							// if (rowSort != null) rowSort.invalidate();
// 						});
//
// 						// add the row after we set the data
// 						if (row == null) this.addRow(key, rmodel);
// 					}, this);
//
// 					// pretend like nothing happened
// 					Trackr.currentComputation = comp;
//
// 					// the new set of keys
// 					keys = nkeys;
// 				});
//
// 				// a reactive context that continuously sorts rows
// 				// rowSort = this.autorun(function() {
// 					// console.log(keys);
// 					// var before = null, i, row;
//
// 					// for (i = keys.length - 1; i >= 0; i--) {
// 					// 	row = this.getRow(keys[i]);
// 					// 	if (row == null) continue;
// 					// 	this.insertBefore(row, before);
// 					// 	before = row;
// 					// }
// 				// });
// 			} else {
// 				this.addRow(0, model);
// 			}
// 		} else if (isList) {
// 			getEmptiness();
// 		}
//
// 		// auto clean
// 		this.once("invalidate", function() {
// 			this._row_deps = {};
// 			this.removeAllRows();
// 		});
// 	}
//
// }, {
//
// 	isEmpty: function(model, proxy) {
// 		if (!model.data) return true;
// 		if (proxy == null) proxy = model.getProxyByValue(model.data);
// 		return model.callProxyMethod(proxy, model.data, "isList") &&
// 			model.callProxyMethod(proxy, model.data, "isEmpty");
// 	}
//
// });
