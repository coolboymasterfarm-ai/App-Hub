// Builds ClipForge.exe: the same app as App Hub, named ClipForge, so it opens straight into ClipForge
// (main.js checks the name). It shares its install, tools and models with App Hub.
const base = require('./package.json').build;

module.exports = {
  ...base,
  appId: 'com.bryce.clipforge',
  productName: 'ClipForge',
  extraMetadata: { name: 'clipforge', productName: 'ClipForge' },
  nsis: { ...base.nsis, artifactName: 'ClipForge-Setup-${version}.exe' },
  portable: { artifactName: 'ClipForge-Portable-${version}.exe' },
};
