const {build} = require('./package.json');
module.exports = {
  ...build,
  productName: '红果短剧Mac客户端SAF版',
  directories: {...build.directories, output: '../outputs/macos'},
  mac: {
    target: ['dmg', 'zip'],
    artifactName: 'Hongguo-Mac-SAF-${version}-${arch}.${ext}',
    category: 'public.app-category.entertainment',
    icon: 'build/app.icns',
    identity: '-',
    hardenedRuntime: false,
    notarize: false
  },
  dmg: {title: '红果短剧Mac客户端SAF版', sign: false}
};
