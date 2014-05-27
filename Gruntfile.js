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
			dev: {
				src: "lib/temple.js",
				dest: "dist/temple.dev.js",
				options: {
					watch: true,
					keepAlive: true,
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
				header: "/*\n * Temple.js\n * (c) 2014 Beneath the Ink, Inc.\n * MIT License\n * Version <%= pkg.version %>\n */\n"
			}
		},
		uglify: {
			dist: {
				src: "dist/temple.js",
				dest: "dist/temple.min.js"
			}
		}
	});

	grunt.loadNpmTasks('grunt-browserify');
	grunt.loadNpmTasks('grunt-contrib-uglify');
	grunt.loadNpmTasks('grunt-wrap2000');

	grunt.registerTask('dist', [ 'browserify:dist', 'wrap2000:dist', 'uglify:dist' ]);
	grunt.registerTask('dev', [ 'browserify:dev' ]);

	grunt.registerTask('default', [ 'dist' ]);

}