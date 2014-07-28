module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
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
				dest: "dist/temple-mustache.js",
				options: {
					bundleOptions: { standalone: "Mustache" }
				}
			},
			test: {
				src: "lib/index.js",
				dest: "dist/temple-mustache.dev.js",
				options: {
					bundleOptions: { debug: true, standalone: "Mustache" }
				}
			}
		},
		wrap2000: {
			dist: {
				src: 'dist/temple-mustache.js',
				dest: 'dist/temple-mustache.js'
			},
			options: {
				header: "/*\n * Temple Mustache\n * (c) 2014 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
			}
		},
		uglify: {
			dist: {
				src: "dist/temple-mustache.js",
				dest: "dist/temple-mustache.min.js"
			}
		},
		watch: {
			main: {
				files: [ "src/**/*.js", "src/**/*.peg" ],
				tasks: [ 'test' ],
				options: { spawn: false }
			}
		}
	});

	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-peg');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-wrap2000');

	grunt.registerTask('build', [ 'copy', 'peg' ]);
	grunt.registerTask('build-test', [ 'browserify:test' ]);
	grunt.registerTask('build-dist', [ 'browserify:dist', 'wrap2000:dist', 'uglify:dist' ]);
	
	grunt.registerTask('dist', [ 'clean', 'build', 'build-dist'  ]);
	grunt.registerTask('test', [ 'clean', 'build', 'build-test' ]);
	grunt.registerTask('dev', [ 'test', 'watch' ]);

	grunt.registerTask('default', [ 'clean', 'build', 'build-dist', 'build-test' ]);

}