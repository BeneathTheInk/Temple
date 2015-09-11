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
					optimize: "size",
					allowedStartRules: [ "start", "attrValue", "attrArguments", "pathQuery", "path" ]
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
					header: "/*\n * Temple\n * (c) 2014-2015 Beneath the Ink, Inc.\n * Copyright (C) 2011--2015 Meteor Development Group\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			},
			dev: {
				src: 'dist/temple.dev.js',
				dest: 'dist/temple.dev.js',
				options: {
					header: "/*\n * Temple (with Source Map)\n * (c) 2014-2015 Beneath the Ink, Inc.\n * Copyright (C) 2011--2015 Meteor Development Group\n * MIT License\n * Version <%= pkg.version %>\n */\n"
				}
			},
			test: {
				src: 'dist/temple.test.js',
				dest: 'dist/temple.test.js',
				options: {
					header: "/*\n * Temple Tests\n * (c) 2014-2015 Beneath the Ink, Inc.\n * Copyright (C) 2011--2015 Meteor Development Group\n * MIT License\n * Version <%= pkg.version %>\n */\n"
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

};
