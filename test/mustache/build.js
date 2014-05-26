var fs = require("fs"),
	path = require("path");

// Theses are tests I'm not including, mainly dues to escaping issues
var exclude = [ "apostrophe", "backslashes", "escaped", "unescaped", "higher_order_sections", "nested_higher_order_sections", "section_functions_in_partials", "partial_whitespace", "partial_view", "partial_template", "partial_array_of_partials_implicit", "partial_array_of_partials", "partial_array" ];

var files = fs.readdirSync(__dirname);

var spec = {};

files.forEach(function(file) {
	if (file === path.basename(__filename)) return;

	var format = path.extname(file)
		id = path.basename(file, format);

	if (exclude.indexOf(id) > -1) return;

	if (spec[id] == null) spec[id] = {};
	spec[id][format.substr(1)] = fs.readFileSync(path.join(__dirname, file), "utf-8");
});

var contents = "window.MustacheTestContent = (" + JSON.stringify(spec, null, "\t") + ");";

fs.writeFileSync(path.resolve(__dirname, "../mustache.js"), contents, "utf-8");