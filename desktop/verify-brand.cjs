// Inspect the packaged Windows resources; this does not execute the Windows app.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ResEdit = require('resedit');
const config = require('./package.json');
const target = process.argv[2] || path.join(__dirname, '../outputs/windows/win-unpacked', config.build.productName + '.exe');
const executable = ResEdit.NtExecutable.from(fs.readFileSync(target));
const resources = ResEdit.NtExecutableResource.from(executable);
const versions = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
assert.ok(versions.length, 'Windows version resource missing');
for (const version of versions) {
  for (const language of version.getAllLanguagesForStringValues()) {
    const values = version.getStringValues(language);
    assert.equal(values.ProductName, config.build.productName);
    assert.equal(values.FileDescription, config.build.productName);
    assert.equal(values.OriginalFilename, config.build.productName + '.exe');
    assert.equal(values.ProductVersion, config.version + '.0');
  }
}
const icon = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(__dirname, 'build/app.ico')));
const bytes = item => Buffer.from(item.isRaw() ? item.bin : item.generate());
const expected = icon.icons.map(item => bytes(item.data));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
assert.ok(groups.length, 'Windows icon resource missing');
for (const group of groups) {
  const actual = group.getIconItemsFromEntries(resources.entries).map(bytes);
  assert.equal(actual.length, expected.length);
  actual.forEach((data, index) => assert.deepEqual(data, expected[index]));
}
assert.ok(resources.entries.some(entry => entry.type === 'INTEGRITY'), 'Electron ASAR integrity resource missing');
console.log(JSON.stringify({name: config.build.productName, version: config.version, iconSizes: icon.icons.map(item => item.data.width), verified: true}));
