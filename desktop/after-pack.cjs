// SPDX-License-Identifier: GPL-3.0-only
// Brand Windows file properties without depending on Wine or signing credentials.
const fs = require('node:fs');
const path = require('node:path');
const ResEdit = require('resedit');
module.exports = async context => {
  if (context.electronPlatformName !== 'win32') return;
  const name = context.packager.appInfo.productFilename;
  const file = path.join(context.appOutDir, name + '.exe');
  const executable = ResEdit.NtExecutable.from(fs.readFileSync(file));
  const resources = ResEdit.NtExecutableResource.from(executable);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build/app.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const group of groups) {
    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, iconFile.icons.map(item => item.data));
  }
  const [major, minor, patch] = context.packager.appInfo.version.split('.').map(Number);
  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  if (!versions.length) throw new Error('Windows version information is missing');
  for (const info of versions) {
    for (const language of info.getAllLanguagesForStringValues()) {
      info.setStringValues(language, {ProductName: '红果短剧Win客户端SAF版', FileDescription: '红果短剧Win客户端SAF版', InternalName: name, OriginalFilename: name + '.exe'});
      info.setFileVersion(major, minor, patch, 0, language.lang);
      info.setProductVersion(major, minor, patch, 0, language.lang);
    }
    info.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(executable);
  fs.writeFileSync(file, Buffer.from(executable.generate()));
};
