module.exports = function (grunt) {

    require('time-grunt')(grunt);

    var fs = require('fs'),
        packageJson = require('./package.json'),
        // provided as 'opts' parameter to the task files in grunt/*.js
        data = {};

    try {
        // the Bitwig installation's dir (Windows)
        data.BITWIG_INSTALL_DIR = fs.realpathSync(process.env.ProgramFiles + '/Bitwig Studio');
    } catch (e) {
        grunt.log.writeln('Unable to determine Bitwig\'s installation dir. If this is unexpected, change Gruntfile.js.'.magenta);
    }
    try {
        // The directory where Bitwig stores Controller scripts (in the user's home directory) (Windows)
        data.BITWIG_CS_BASE_PATH = fs.realpathSync(process.env.USERPROFILE + '/Documents/Bitwig Studio/Controller Scripts');
    } catch (e) {
        data.BITWIG_CS_BASE_PATH = '__NOT_FOUND_BITWIG_INSTALL_DIR__';
        grunt.log.writeln('Unable to determine Bitwig\'s controller scripts dir. If this is unexpected, change Gruntfile.js.'.magenta);
    }

    data.BITWIG_API_SOURCE_PATHS = [
        (data.BITWIG_INSTALL_DIR||'__NOT_FOUND_BITWIG_INSTALL_DIR__') + '/resources/doc/control-surface/js-stubs/**/*.js',
        (data.BITWIG_INSTALL_DIR||'__NOT_FOUND_BITWIG_INSTALL_DIR__') + '/resources/controllers/api/**/*.js'
    ];

    data.RELEASE_PATH_IN_BITWIG = data.BITWIG_CS_BASE_PATH + '/' + packageJson.lep.releaseDirectoryName;
    data.VERSIONED_RELEASE_ZIP_PATH = packageJson.lep.releaseZipFilenamePattern.replace('{version}', packageJson.version);

    require('load-grunt-config')(grunt, {
        init: true,
        data: data
    });

    require('grunt-load-npm-run-tasks')(grunt);
    grunt.loadTasks('grunt/custom-tasks');
};
