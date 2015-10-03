var gulp = require("gulp");
var browserify = require("browserify");
var source = require('vinyl-source-stream');
var uglify = require('gulp-uglify');
var sourcemaps = require('gulp-sourcemaps');
var buffer = require('vinyl-buffer');
var header = require("gulp-header");
var del = require("del");
var plumber = require("gulp-plumber");
var babel = require("gulp-babel");
var merge = require("merge-stream");
var peg = require("gulp-peg");
var rename = require("gulp-rename");
var path = require("path");
var pkg = require("./package.json");

var copyright = "/*\n * Temple\n * (c) 2014-2015 Beneath the Ink, Inc.\n * MIT License\n * Version " + pkg.version + "\n */\n\n";

gulp.task("clean", function() {
	return del([ "lib/", "dist/" ]);
});

function errorHandler(crash) {
	return function(e) {
		console.error(e.messageFormatted || e.stack || e.message);
		if (crash) return process.exit(1);
		this.emit('end');
	};
}

gulp.task("copy-scripts", function() {
	var errors = errorHandler(true);

	var idom = gulp.src([
		"vendor/incremental-dom/**/*.js",
		"vendor/incremental-dom/LICENSE",
		"!vendor/incremental-dom/{demo,test,conf}/**",
		"!vendor/incremental-dom/gulpfile.js"
	])
	.pipe(plumber({ errorHandler: errors }))
	.pipe(gulp.dest("lib/incremental-dom"));

	var scripts = gulp.src("src/**/*.js")
		.pipe(plumber({ errorHandler: errors }))
		.pipe(gulp.dest("lib/"));

	return merge(idom, scripts);
});

gulp.task("build-peg", function() {
	return gulp.src("src/*.peg")
		.pipe(plumber({ errorHandler: errorHandler(true) }))
		.pipe(peg({
			optimize: "size",
			allowedStartRules: [ "start", "attrValue", "attrArguments", "pathQuery", "path", "html" ]
		}))
		.pipe(gulp.dest("lib/"));
});

gulp.task("compile", [ "copy-scripts", "build-peg" ], function() {
	var srcdir = path.join(__dirname, "src");

	return gulp.src("lib/**/*.js")
		.pipe(plumber({ errorHandler: errorHandler(true) }))
		.pipe(sourcemaps.init())
		.pipe(babel())
		.pipe(sourcemaps.write({
			sourceRoot: function(file) {
				return path.relative(path.dirname(file.path), srcdir);
			}
		}))
		.pipe(gulp.dest("lib/"));

});

var js = browserify("lib/index.js", {
	debug: true,
	standalone: "Temple",
	cache: {},
	packageCache: {},
	fullPaths: true
});

gulp.task("browser", [ "compile" ], function() {
	var errors = errorHandler(true);

	return js.bundle()
		.on("error", errors)
		.pipe(plumber({ errorHandler: errors }))
		.pipe(source("temple.js"))
		.pipe(buffer())
		.pipe(sourcemaps.init({ loadMaps: true }))
		.pipe(header(copyright))
		.pipe(sourcemaps.write("."))
		.pipe(gulp.dest('dist/'));
});

gulp.task("browser-min", [ "browser" ], function() {
	return gulp.src("dist/temple.js")
		.pipe(plumber({ errorHandler: errorHandler(true) }))
		.pipe(sourcemaps.init({ loadMaps: true }))
		.pipe(uglify())
		.pipe(rename({ suffix: ".min" }))
		.pipe(header(copyright))
		.pipe(sourcemaps.write("."))
		.pipe(gulp.dest("dist/"));
});

gulp.task("default", [ "compile", "browser", "browser-min" ]);
