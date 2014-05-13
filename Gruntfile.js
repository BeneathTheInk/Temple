module.exports = function(grunt) {

	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		browserify: {
			dist: {
				src: "lib/temple.js",
				dest: "dist/temple.js",
				options: {
					bundleOptions: { standalone: "Temple" }
				}
			},
			test: {
				src: "test/index.js",
				dest: "test/browser/tests.js",
				options: {
					watch: true,
					keepAlive: true,
					bundleOptions: { debug: true }
				}
			}
		},
		uglify: {
			dist: {
				src: "dist/temple.js",
				dest: "dist/temple.min.js"
			}
		},
		wrap2000: {
			dist: {
				files: [{
					src: 'dist/temple.js',
					dest: 'dist/temple.js'
				}, {
					src: 'dist/temple.min.js',
					dest: 'dist/temple.min.js'
				}]
			},
			options: {
				header: "/*\n * Temple.js\n * (c) 2014 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
			}
		}
	});

	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-wrap2000');

	grunt.registerTask('dist', [ 'browserify:dist', 'uglify:dist', 'wrap2000:dist' ]);
	grunt.registerTask('dev', [ 'browserify:dev' ]);
	grunt.registerTask('test', [ 'browserify:test' ]);

	grunt.registerTask('default', [ 'dist' ]);

}