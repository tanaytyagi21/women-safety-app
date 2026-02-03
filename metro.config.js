const { getDefaultConfig } = require('@expo/metro-config');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);
  config.resolver.sourceExts.push('mjs');
  config.resolver.assetExts.push('cjs');
  return config;
})();