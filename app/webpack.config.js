const webpack = require('@nativescript/webpack')
const path = require('path')

module.exports = (env) => {
  webpack.init(env)
  webpack.useConfig('vue')

  webpack.chainWebpack((config) => {
    // Resolve @pretext/* imports to the library source directory.
    // The library uses .js extensions in imports (for tsc), so we alias the
    // resolved path and let webpack's ts-loader handle .ts source files.
    config.resolve.alias
      .set('@pretext/layout', path.resolve(__dirname, '../src/layout.ts'))
      .set('@pretext/rich-inline', path.resolve(__dirname, '../src/rich-inline.ts'))
      .set('@pretext/measurement', path.resolve(__dirname, '../src/measurement.ts'))
      .set('@pretext', path.resolve(__dirname, '../src'))
  })

  return webpack.resolveConfig()
}
