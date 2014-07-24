module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clean: [ "dist/*.js" ],
		// copy: {
		// 	main: {
		// 		files: [{
		// 			expand: true,
		// 			cwd: "src/",
		// 			src: [ "**/*.js" ],
		// 			dest: "lib/",
		// 			filter: 'isFile'
		// 		}]
		// 	}
		// },
		// peg: {
		// 	main: {
		// 		files: [{
		// 			expand: true,
		// 			cwd: "src/",
		// 			src: [ "**/*.peg" ],
		// 			dest: "lib/",
		// 			ext: ".js",
		// 			filter: 'isFile'
		// 		}]
		// 	}
		// },
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
			test: {
				src: 'dist/temple.dev.js',
				dest: 'dist/temple.dev.js'
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
	// grunt.loadNpmTasks('grunt-peg');
	// grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-wrap2000');

	// grunt.registerTask('build', [ 'copy', 'peg' ]);
	grunt.registerTask('build-test', [ 'browserify:test', 'wrap2000:test' ]);
	grunt.registerTask('build-dist', [ 'browserify:dist', 'wrap2000:dist', 'uglify:dist' ]);

	grunt.registerTask('dist', [ 'clean', /*'build',*/ 'build-dist'  ]);
	grunt.registerTask('test', [ 'clean', /*'build',*/ 'build-test' ]);
	grunt.registerTask('dev', [ 'test', 'watch' ]);

	grunt.registerTask('default', [ 'clean', /*'build',*/ 'build-dist', 'build-test' ]);

}
