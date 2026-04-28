const webpack = require('@nativescript/webpack')
const path = require('path')

module.exports = (env) => {
  webpack.init(env)
  webpack.useConfig('vue')

  webpack.chainWebpack((config) => {
    // 1. Prepend the Intl.Segmenter shim as the very first entry so it runs
    //    before any library module evaluates Intl.Segmenter.
    config.entry('bundle').prepend(path.resolve(__dirname, '../src/nativescript/segmenter-shim.ts'))

    // 2. Replace the DOM canvas measurement backend with the NativeScript
    //    Paint-based implementation.  All relative imports of measurement.js
    //    inside layout.ts / line-break.ts resolve to this NS override.
    //    Two aliases are needed:
    //      - the .ts path, which is what webpack resolves from TypeScript source
    //        imports like `from './measurement.js'` when ts-loader is in play
    //      - the .js specifier, in case any import resolves to the emitted JS
    config.resolve.alias
      .set(
        path.resolve(__dirname, '../src/measurement.ts'),
        path.resolve(__dirname, '../src/nativescript/measurement.ts'),
      )
      // Also cover the compiled .js specifier used in the library source.
      .set(
        path.resolve(__dirname, '../src/measurement.js'),
        path.resolve(__dirname, '../src/nativescript/measurement.ts'),
      )

    // 3. Resolve @pretext/* imports to the library source directory.
    //    The library uses .js extensions in imports (for tsc), so we alias the
    //    resolved path and let webpack's ts-loader handle .ts source files.
    config.resolve.alias
      .set('@pretext/layout', path.resolve(__dirname, '../src/layout.ts'))
      .set('@pretext/rich-inline', path.resolve(__dirname, '../src/rich-inline.ts'))
      .set('@pretext/measurement', path.resolve(__dirname, '../src/nativescript/measurement.ts'))
      .set('@pretext', path.resolve(__dirname, '../src'))
  })

  return webpack.resolveConfig()
}
