var gulp = require("gulp"),
	browserify = require("browserify"),
	through = require("through"),
	path = require("path"),
	uglify = require("gulp-uglify"),
	rename = require("gulp-rename"),
	PEG = require("pegjs");

function buildjs(options) {
	return through(function(data) {
		var b = browserify({ basedir: data.base });
		b.add(data.contents);
		data.contents = b.bundle(options);
		this.emit("data", data);
	});
}

gulp.task("build-peg", function() {
	return gulp.src("lib/parse/xml-parser.pegjs")
		.pipe(rename("xml-parser.js"))
		.pipe(through(function(data) {
			var contents = data.contents.toString("utf-8"),
				parser = PEG.buildParser(contents, { output: "source" });

			data.contents = new Buffer("module.exports = " + parser, "utf-8");
			this.emit("data", data);
		}))
		.pipe(gulp.dest("lib/parse"));
});

gulp.task("build-dev", [ "build-peg" ], function() {
	return gulp.src("lib/temple.js", { buffer: false })
		.pipe(buildjs({ debug: true, standalone: "Temple" }))
		.pipe(gulp.dest('dist'));
});

gulp.task("build-js", [ "build-peg" ], function() {
	return gulp.src("lib/temple.js", { buffer: false })
		.pipe(buildjs({ standalone: "Temple" }))
		.pipe(gulp.dest('dist'));
});

gulp.task("build-min", [ "build-js" ], function() {
	return gulp.src("dist/temple.js")
		.pipe(rename("temple.min.js"))
		.pipe(uglify())
		.pipe(gulp.dest('dist'));
});

gulp.task("build-tests", [ "build-peg" ], function() {
	return gulp.src("test/index.js", { buffer: false })
		.pipe(rename("tests.js"))
		.pipe(buildjs({ debug: true }))
		.pipe(gulp.dest('test/browser'));
});

gulp.task("default", [ "build-js", "build-min" ]);