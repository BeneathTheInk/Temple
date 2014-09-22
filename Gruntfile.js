var count;

module.exports = function(grunt) {

	var refreshBuildCount = (function() {
		var running = false;

		return function() {
			if (running) return;
			running = true;
			count = null;

			require("child_process").exec("git rev-list HEAD --count", function(err, stdout, stderr) {
				count = parseInt(stdout, 10);
				if (isNaN(count) || count < 1) count = 0;
				count += 1;
				running = false;
			});
		}
	})();

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		build_count: function() { return count; },
		wait: {
			build_count: {
				options: {
					delay: 500,
					before: function() {
						refreshBuildCount();
					},
					after: function() {
						if (typeof count !== "number") return true;
					}
				}
			}
		},
		clean: [ "lib/", "dist/*.js" ],
		copy: {
			main: {
				files: [{
					expand: true,
					cwd: "src/",
					src: [ "**/*.js" ],
					dest: "lib/",
					filter: 'isFile'
				}]
			}
		},
		peg: {
			main: {
				options: {
					optimize: "size"
				},
				files: [{
					expand: true,
					cwd: "src/",
					src: [ "**/*.peg" ],
					dest: "lib/",
					ext: ".js",
					filter: 'isFile'
				}]
			}
		},
		browserify: {
			dist: {
				src: "lib/index.js",
				dest: "dist/temple.js",
				options: {
					browserifyOptions: { standalone: "Temple" }
				}
			},
			test: {
				src: "lib/index.js",
				dest: "dist/temple.dev.js",
				options: {
					browserifyOptions: { debug: true, standalone: "Temple" }
				}
			}
		},
		wrap2000: {
			dist: {
				src: 'dist/temple.js',
				dest: 'dist/temple.js',
				options: {
					header: "/*\n * Temple\n * (c) 2014 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			},
			test: {
				src: 'dist/temple.dev.js',
				dest: 'dist/temple.dev.js',
				options: {
					header: "/* Temple / (c) 2014 Beneath the Ink, Inc. / MIT License / Version <%= pkg.version %>, Build <%= build_count() %> */"
				}
			}
		},
		uglify: {
			dist: {
				src: "dist/temple.js",
				dest: "dist/temple.min.js"
			}
		},
		watch: {
			main: {
				files: [ "src/**/*.{js,peg}" ],
				tasks: [ 'test' ],
				options: { spawn: false }
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-peg');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-wrap2000');
	grunt.loadNpmTasks('grunt-wait');

	grunt.registerTask('build', [ 'clean', 'copy', 'peg' ]);

	grunt.registerTask('build-test', [ 'wait', 'browserify:test', 'wrap2000:test' ]);
	grunt.registerTask('build-dist', [ 'browserify:dist', 'wrap2000:dist', 'uglify:dist' ]);

	grunt.registerTask('dist', [ 'build', 'build-dist'  ]);
	grunt.registerTask('test', [ 'build', 'build-test' ]);
	grunt.registerTask('dev', [ 'test', 'watch' ]);

	grunt.registerTask('default', [ 'build', 'build-dist', 'build-test' ]);

}
