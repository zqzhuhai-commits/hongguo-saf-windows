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
  const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
  if (!versions.length) throw new Error('Windows version information is missing');
  for (const info of versions) {
    for (const language of info.getAllLanguagesForStringValues()) {
      info.setStringValues(language, {ProductName: '红果短剧SAF版', FileDescription: '红果短剧SAF版', InternalName: name, OriginalFilename: name + '.exe'});
      info.setFileVersion(0, 8, 0, 0, language.lang);
      info.setProductVersion(0, 8, 0, 0, language.lang);
    }
    info.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(executable);
  fs.writeFileSync(file, Buffer.from(executable.generate()));
};
