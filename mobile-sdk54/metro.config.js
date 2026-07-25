// Metro config — Expo defaults plus one resolver override:
//
// maplibre-gl's package `exports` points at its ES-module build, which uses
// `import.meta`. Metro emits classic (non-module) scripts, so bundling the ESM
// build makes the whole web bundle throw "Cannot use 'import.meta' outside a
// module" at parse time and the app never boots. Pin the import to the UMD
// build instead (v5 is the last major that ships one).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'maplibre-gl') {
    return {
      type: 'sourceFile',
      filePath: require.resolve('maplibre-gl/dist/maplibre-gl.js'),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
