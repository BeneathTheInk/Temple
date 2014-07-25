module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: [ "dist/*.js" ],
		browserify: {
			dist: {
				src: "lib/index.js",
				dest: "dist/temple.js",
				options: {
					bundleOptions: { standalone: "Temple" }
				}
			},
			test: {
				src: "lib/index.js",
				dest: "dist/temple.dev.js",
				options: {
					bundleOptions: { debug: true, standalone: "Temple" }
				}
			}
		},
		wrap2000: {
			dist: {
				src: 'dist/temple.js',
				dest: 'dist/temple.js'
			},
			options: {
				header: "/*\n * Temple\n * (c) 2014 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
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
				files: [ "lib/**/*.js" ],
				tasks: [ 'test' ],
				options: { spawn: false }
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-wrap2000');

	grunt.registerTask('build-test', [ 'browserify:test' ]);
	grunt.registerTask('build-dist', [ 'browserify:dist', 'wrap2000:dist', 'uglify:dist' ]);

	grunt.registerTask('dist', [ 'clean', 'build-dist'  ]);
	grunt.registerTask('test', [ 'clean', 'build-test' ]);
	grunt.registerTask('dev', [ 'test', 'watch' ]);

	grunt.registerTask('default', [ 'clean', 'build-dist', 'build-test' ]);

}
