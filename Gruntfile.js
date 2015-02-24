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
					optimize: "speed",
					allowedStartRules: [ "start", "attrValue", "attrArguments", "pathQuery" ]
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
				dest: "dist/temple-mustache.js",
				options: {
					browserifyOptions: { standalone: "Mustache" }
				}
			},
			dev: {
				src: "lib/index.js",
				dest: "dist/temple-mustache.dev.js",
				options: {
					browserifyOptions: { debug: true, standalone: "Mustache" }
				}
			},
			test: {
				src: "test/*.js",
				dest: "dist/temple-mustache.test.js",
				options: {
					browserifyOptions: { debug: true }
				}
			}
		},
		wrap2000: {
			dist: {
				src: 'dist/temple-mustache.js',
				dest: 'dist/temple-mustache.js',
				options: {
					header: "/*\n * Temple Mustache\n * (c) 2014 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			},
			dev: {
				src: 'dist/temple-mustache.dev.js',
				dest: 'dist/temple-mustache.dev.js',
				options: {
					header: "/*\n * Temple Mustache (with Source Map)\n * (c) 2014 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			},
			test: {
				src: 'dist/temple-mustache.test.js',
				dest: 'dist/temple-mustache.test.js',
				options: {
					header: "/* Temple Mustache Tests / (c) 2014 Beneath the Ink, Inc. / MIT License / Version <%= pkg.version %> */"
				}
			}
		},
		uglify: {
			dist: {
				src: "dist/temple-mustache.js",
				dest: "dist/temple-mustache.min.js"
			}
		},
		watch: {
			dev: {
				files: [ "src/**/*.{js,peg}" ],
				tasks: [ 'dev' ],
				options: { spawn: false }
			},
			test: {
				files: [ "src/**/*.{js,peg}", "test/*.js" ],
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

	grunt.registerTask('precompile', [ 'copy', 'peg' ]);

	grunt.registerTask('build-dev', [ 'browserify:dev', 'wrap2000:dev' ]);
	grunt.registerTask('build-test', [ 'browserify:test', 'wrap2000:test' ]);
	grunt.registerTask('build-dist', [ 'browserify:dist', 'wrap2000:dist', 'uglify:dist' ]);

	grunt.registerTask('dev', [ 'clean', 'precompile', 'build-dev' ]);
	grunt.registerTask('test', [ 'clean', 'precompile', 'build-test' ]);
	grunt.registerTask('dist', [ 'clean', 'precompile', 'build-dist' ]);

	grunt.registerTask('default', [ 'clean', 'precompile', 'build-dist', 'build-dev' ]);

}