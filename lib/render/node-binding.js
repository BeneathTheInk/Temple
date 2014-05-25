var _ = require("underscore"),
	util = require("../util"),
	NODE_TYPE = require("../types"),
	Binding = require("./binding"),
	Section = require("./section"),
	Deps = require("../deps"),
	TAG_DELIMITERS = [ "[#@!", "!@#]" ];

var NodeBinding =
module.exports = Binding.extend({
	initialize: function() {
		this.nodes = [];
		this.render();
		this.detach();
	},

	// render creates the dom parts
	render: function() {},

	// update fires up an autorun context for a live dom
	update: function(scope) {
		var self = this;
		if (this._comp != null) this._comp.stop();
		this._comp = Deps.autorun(function(comp) {
			self._update(scope, comp);
			comp.onInvalidate(function() {
				if (comp.stopped) delete self._comp;
			});
		});
		return this;
	},

	// _update takes data and makes sure the element is up to snuff
	_update: function(scope) {},

	// render the nodes here; update() will continue in place
	appendTo: function(parent, before) {
		this.nodes.forEach(function(node) {
			parent.insertBefore(node, before);
		}, this);

		return this;
	},

	// remove it from dom, but don't destroy
	detach: function() {
		var frag = document.createDocumentFragment();
		return this.appendTo(frag);
	},

	// destroy completely... sort of...
	destroy: function() {
		if (this._comp != null) this._comp.stop();
		this.detach();
		delete this.nodes;
		return this;
	}
});

NodeBinding[NODE_TYPE.SECTION] =
NodeBinding[NODE_TYPE.INVERTED] = NodeBinding.extend({
	render: function() {
		var build = _.bind(function(template) {
			return Binding.buildDOM(template, this.temple);
		}, this);

		this.section = new Section(this.template, build);
		this.placeholder = document.createComment(_.uniqueId("$"));
		this.nodes.push(this.placeholder);
	},

	updateNodes: function() {
		var nodes = [];
		this.section.forEach(function(binding) {
			nodes = nodes.concat(binding.nodes);
		});
		nodes.push(this.placeholder);
		this.nodes = nodes;
		return this;
	},

	_update: function(scope) {
		var len = this.section.length();
		this.section.process(scope);
		this.updateNodes();
		
		if (this.section.length() - len > 0) {
			_.flatten(this.section.rows.slice(len)).forEach(function(binding) {
				binding.appendTo(this.placeholder.parentNode, this.placeholder);
			}, this)
		}
	},

	appendTo: function(parent, before) {
		this.section.forEach(function(binding) {
			binding.appendTo(parent, before);
		});

		return NodeBinding.prototype.appendTo.apply(this, arguments);
	},

	destroy: function() {
		this.section.destroy();
		return NodeBinding.prototype.destroy.apply(this, arguments);
	}
});

NodeBinding[NODE_TYPE.ELEMENT] = NodeBinding.extend({
	setAttribute: function(attr) {
		attr.value = _.pluck(attr.bindings, "value").join("");
		this.node.setAttribute(attr.name, attr.value);
	},

	getArguments: function(attr) {
		var raw = "",
			d = TAG_DELIMITERS,
			val, toUpdate;

		attr.children.forEach(function(child, index) {
			switch(child.type) {
				case NODE_TYPE.TEXT:
					raw += child.value;
					break;
				
				case NODE_TYPE.INTERPOLATOR:
				case NODE_TYPE.TRIPLE:
					raw += d[0] + index + d[1];
					break;

				default: console.log(child);
			}
		});

		val = util.parseTag(raw);
		if (!_.isArray(val)) val = [ val ];

		toUpdate = {};
		walk(val);

		return function(scope) {
			_.each(toUpdate, function(u, i) {
				var child = attr.children[i];
				u.list[u.key] = scope.get(child.value);
			});

			return val;
		}

		function walk(v, k, l) {
			var s, e, index;

			if (_.isString(v)) {
				s = v.indexOf(d[0]);
				e = v.indexOf(d[1]);

				if (s > -1) {
					index = parseInt(v.substring(d[0].length, e > -1 ? e : null));
					if (!isNaN(index) && attr.children[index] != null) {
						toUpdate[index] = { list: l, key: k };
					}
				}
			} else if (_.isObject(v)) {
				_.each(v, walk);
			}
		}
	},

	render: function() {
		var el = this.node = document.createElement(this.template.name);
		this.nodes.push(el);

		// attributes
		this.attributes = [];
		this.template.attributes.forEach(function(attr) {
			var decorators = this.temple._decorators[attr.name],
				attribute = { name: attr.name };
			
			if (!_.isArray(decorators) || !decorators.length) {
				// all attributes MUST be unescaped or else they don't
				// function properly. since buildText is also used to generate
				// plain html, we must instead manually convert all
				// interpolators to triples.
				var children = attr.children.map(function(t) {
					if (t.type === NODE_TYPE.INTERPOLATOR) {
						t = _.extend({}, t, { type: NODE_TYPE.TRIPLE });
					}
					return t;
				});

				attribute.bindings = Binding.buildText(children, this.temple);
				this.setAttribute(attribute);
			} else {
				attribute.children = attr.children;
				attribute.arguments = this.getArguments(attr);
				attribute.decorators = decorators.map(function(fn) {
					return fn.call(this.temple, el, attr.children);
				}, this).filter(_.isObject);
			}

			this.attributes.push(attribute);
		}, this);

		// children nodes
		this.children = Binding.buildDOM(this.template.children, this.temple);
		this.children.forEach(function(child) { child.appendTo(el); });
	},

	_update: function(scope) {
		var self = this;

		this.attributes.forEach(function(attr) {
			if (attr.comp) attr.comp.stop();
			attr.comp = Deps.autorun(function(comp) {
				if (_.isArray(attr.bindings)) {
					attr.bindings.forEach(function(child) { child.update(scope); });
					self.setAttribute(attr);
				} else if (_.isArray(attr.decorators)) {
					var args = attr.arguments(scope);
					attr.decorators.forEach(function(d) {
						if (_.isFunction(d.update)) d.update.apply(scope, args);
					});
				}
				
				comp.onInvalidate(function() {
					if (comp.stopped) delete attr.comp;
				});
			});
		});

		this.children.forEach(function(child) { child.update(scope); });
	},

	destroy: function() {
		var self = this;

		this.attributes.forEach(function(attr) {
			if (_.isArray(attr.bindings)) {
				attr.bindings.forEach(function(child) { child.destroy(); });
			} else if (_.isArray(attr.decorators)) {
				attr.decorators.forEach(function(d) {
					if (_.isFunction(d.destroy)) d.destroy.call(self.temple);
				});
			}

			if (attr.comp) attr.comp.stop();
		});
		delete this.attributes;
		
		this.children.forEach(function(child) { child.destroy(); });
		delete this.children;

		return NodeBinding.prototype.destroy.apply(this, arguments);
	}
});

NodeBinding[NODE_TYPE.TEXT] = NodeBinding.extend({
	render: function() {
		this.nodes.push(document.createTextNode(this.template.value));
	}
});

// Unlike in true mustache, this version can never truly "escape"
// content since escaping is only for the HTML renderer's benefit,
// which we are essentially doing the job of. This means that this
// version converts interpolators to text nodes and parses triples
// as raw html nodes
NodeBinding[NODE_TYPE.INTERPOLATOR] = NodeBinding.extend({
	render: function() {
		this.node = document.createTextNode("");
		this.nodes.push(this.node);
	},

	_update: function(scope) {
		var val = scope.get(this.template.value);
		this.node.nodeValue = val != null ? val : "";
	}
});

NodeBinding[NODE_TYPE.TRIPLE] = NodeBinding.extend({
	render: function() {
		this.placeholder = document.createComment(_.uniqueId("$"));
		this.nodes.push(this.placeholder);
	},

	clean: function() {
		this.nodes.forEach(function(node) {
			if (node.parentNode == null || node === this.placeholder) return;
			node.parentNode.removeChild(node);
		}, this);
		this.nodes = [ this.placeholder ];
	},

	_update: function(scope) {
		var val, cont, nodes, parentNode;

		val = scope.get(this.template.value);
		if (this.value === val) return;
		this.value = val;		

		parentNode = this.placeholder.parentNode;
		cont = document.createElement("div");
		cont.innerHTML = val;
		nodes = _.toArray(cont.childNodes);
		this.clean();

		if (parentNode) {
			nodes.forEach(function(node) {
				parentNode.insertBefore(node, this.placeholder);
			}, this);
		}

		nodes.push(this.placeholder);
		this.nodes = nodes;
	}
});