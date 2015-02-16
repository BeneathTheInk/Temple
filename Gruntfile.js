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
			dev: {
				src: "lib/index.js",
				dest: "dist/temple.dev.js",
				options: {
					browserifyOptions: { debug: true, standalone: "Temple" }
				}
			},
			test: {
				src: "test/*.js",
				dest: "dist/temple.test.js",
				options: {
					browserifyOptions: { debug: true }
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
			dev: {
				src: 'dist/temple.dev.js',
				dest: 'dist/temple.dev.js',
				options: {
					header: "/*\n * Temple (with Source Map)\n * (c) 2014 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			},
			test: {
				src: 'dist/temple.test.js',
				dest: 'dist/temple.test.js',
				options: {
					header: "/* Temple Tests / (c) 2014 Beneath the Ink, Inc. / MIT License / Version <%= pkg.version %> */"
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
			test: {
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

	grunt.registerTask('precompile', [ 'clean', 'copy', 'peg' ]);

	grunt.registerTask('build-dev', [ 'browserify:dev', 'wrap2000:dev' ]);
	grunt.registerTask('build-test', [ 'browserify:test', 'wrap2000:test' ]);
	grunt.registerTask('build-dist', [ 'browserify:dist', 'wrap2000:dist', 'uglify:dist' ]);

	grunt.registerTask('dev', [ 'precompile', 'build-dev' ]);
	grunt.registerTask('test', [ 'precompile', 'build-test' ]);
	grunt.registerTask('dist', [ 'precompile', 'build-dist' ]);

}
