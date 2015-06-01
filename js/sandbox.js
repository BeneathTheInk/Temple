(function() {

var tt = Temple.fromSelector;

var Frame = Temple.DOM.iframe.extend({
	window: function() {
		return this.prop("contentWindow");
	},
	reload: function() {
		this.prop("src", "");
		return this;
	}
});

var Editor = Temple.DOM.pre.extend({
	constructor: function(value, options) {
		if (options == null) options = {};

		Temple.DOM.pre.call(this);
		var self = this;
		
		var editor = this.editor = Editor.createAceEditor(value, this.node);
		editor.setTheme("ace/theme/" + (options.theme || "tomorrow"));
		
		var doc = editor.getSession();
		doc.setMode("ace/mode/" + (options.mode || "javascript"));
		doc.setUseWrapMode(options.wrap);
	},
	setValue: function(val) {
		this.editor.setValue(val);
		this.editor.clearSelection();
		this.editor.gotoLine(0, 0, false);
		return this;
	},
	getValue: function() {
		return this.editor.getValue();
	},
	beforeMount: function() {
		var onChange;

		this.editor.on("change", onChange = function() {
			self.trigger("change", editor.getValue());
		});

		this.once("stop", function() {
			this.editor.off("change", onChange);
		});
	}
}, {
	createAceEditor: (function() {
		var AceEditor = ace.require("./editor").Editor,
			AceRenderer = ace.require("./virtual_renderer").VirtualRenderer;

		return function(code, node) {
			var doc = ace.createEditSession(code),
				editor = new AceEditor(new AceRenderer(node));

			editor.setSession(doc);

			var env = {
				document: doc,
				editor: editor,
				onResize: editor.resize.bind(editor, null)
			};

			window.addEventListener("resize", env.onResize);
			
			editor.on("destroy", function() {
				window.removeEventListener("resize", env.onResize);
				env.editor.container.env = null; // prevent memory leak on old ie
			});
			
			editor.container.env = editor.env = env;
			return editor
		}
	})()
});

var Sandbox = Temple.extend({
	render: function(code, height) {
		var editor, origCode, frame,
			exec, reset;

		if (code == null) code = "";
		origCode = code;
		
		if (height == null) height = 100;
		height += "px";

		editor = new Editor(code, { wrap: true }).addClass("source");
		frame = new Frame();
		exec = tt("a.btn.btn-primary.btn-xs[href=#]", tt("i.icon.icon-gears", " Run")),
		reset = tt("a.btn.btn-default.btn-xs.pull-right[href=#]", tt("i.icon.icon-repeat", " Reset"));

		frame.addEventListener("load", function(e) {
			var src = "(function(){" + code + "\n}).call(this);",
				win = frame.window(),
				templeLib, styles, head;

			styles = loadFile("/css/sandbox.css");
			templeLib = loadFile("/js/temple.min.js", function() {
				try {
					win.eval(src);
				} catch(e) {
					win.document.write(e.toString());
					console.error(e.stack);
				}
			});


			head = win.document.querySelector("head");
			head.appendChild(styles);
			head.appendChild(templeLib);
		});

		exec.addEventListener("click", function(e) {
			e.preventDefault();
			code = editor.getValue();
			frame.reload();
		});

		reset.addEventListener("click", function(e) {
			e.preventDefault();
			editor.setValue(code = origCode);
			frame.reload();
		});

		return tt("div.sandbox",
			editor,
			tt("div.btn-toolbar", exec, reset),
			tt("div.frame", frame)
		).style("height", height);
	}
});

$(document).ready(function() {
	var sandboxes = document.querySelectorAll("script[data-sandbox]"),
		sandbox, i;

	for (i = 0; i < sandboxes.length; i++) {
		sandbox = sandboxes[i];
		
		new Sandbox()
			.paint(sandbox.parentNode, sandbox)
			.mount(atob(sandbox.innerHTML), sandbox.getAttribute("data-height"));
	}
});

function loadFile(filepath, onLoad) {
	var file;

	if (typeof BASEURL !== "undefined") filepath = BASEURL + filepath;

	if (filepath.substr(-4) === ".css") {
		file = document.createElement("link");
		file.setAttribute("rel", "stylesheet");
		file.setAttribute("type", "text/css");
		file.setAttribute("href", filepath);
	} else if (filepath.substr(-3) === ".js") {
		file = document.createElement("script");
		file.setAttribute("type", "text/javascript");
		file.setAttribute("src", filepath);
		file.setAttribute("async", "true");
	}

	if (typeof onLoad === "function") file.addEventListener("load", onLoad);

	return file;
}

}).call(this);