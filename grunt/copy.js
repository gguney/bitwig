module.exports = function (grunt, opts) {

    return {
        sourcesToTarget: {
            files: [
                {
                    cwd: './src',
                    src: ['**/*.js', '!Test.control.js', '!CMD-LC*.js'],
                    dest: './tmp/target/<%= package.lep.releaseDirectoryName %>',
                    expand: true
                },
                {
                    cwd: '.',
                    src: ['doc/**', '!doc/**/wikiOnly/**'],
                    dest: './tmp/target/<%= package.lep.releaseDirectoryName %>',
                    expand: true
                }
            ]
        },
        historyToTarget: {
            files: [{
                src: ['./stable-version-for-download/history.txt'],
                dest: './tmp/target/<%= package.lep.releaseDirectoryName %>',
                expand: true,
                flatten: true
            }]
        },
        toBitwigForLiveTest: {
            files: [
                {
                    cwd: './src',
                    src: ['**/*.js'],
                    dest: opts.RELEASE_PATH_IN_BITWIG,
                    expand: true
                }
            ]
        },
        testScriptToBitwig: {
            files: [
                {
                    cwd: './src',
                    src: ['**/Test.control.js'],
                    dest: opts.RELEASE_PATH_IN_BITWIG,
                    expand: true
                }
            ]
        },
        'apiSourcesFromBitwig': {
            files: [
                {
                    src: opts.BITWIG_API_SOURCE_PATHS,
                    dest: './bitwigApiStubs',
                    flatten: true,
                    expand: true
                }
            ]
        }
    };
};