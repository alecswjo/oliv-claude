module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    env: {
      // Jest runs on Node without --experimental-vm-modules, so the lazy
      // `import()` seams (sync, proxyAnalyzer) must compile to require() in
      // tests. Production/Metro builds keep native dynamic imports.
      test: {
        plugins: ['babel-plugin-dynamic-import-node'],
      },
    },
  };
};
