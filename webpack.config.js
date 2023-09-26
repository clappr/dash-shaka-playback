const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')

var NPM_RUN = process.env.npm_lifecycle_event

const externals = () => {
  // By default, only Clappr is defined as external library
  return {
    clappr: {
      amd: 'clappr',
      commonjs: 'clappr',
      commonjs2: 'clappr',
      root: 'Clappr'
    }
  }
}

const webpackConfig = (config) => {
  return {
    devServer: {
      static: {
        directory: path.resolve(__dirname, 'public'),
      },
      allowedHosts: 'all',
      compress: true,
      host: 'localhost',
      port: config.port
    },    
    mode: config.mode,
    devtool: 'eval-source-map',
    entry: path.resolve(__dirname, 'src/clappr-dash-shaka-playback.js'),
    externals: config.externals,
    module: {
      rules: [
        {
          test: /\.js$/,
          loader: 'babel-loader',
          include: [
            path.resolve(__dirname, 'src')
          ]
        },
      ],
    },
    output: {
      path: path.resolve(__dirname, 'public/dist/'),
      publicPath: 'public/dist/',
      filename: config.filename,
      library: 'DashShakaPlayback',
      libraryTarget: 'umd',
    },
    plugins: config.plugins,
  }
}

var configurations = []

if (NPM_RUN === 'build' || NPM_RUN === 'start') {
  // Unminified bundle with shaka-player
  configurations.push(webpackConfig({
    filename: 'dash-shaka-playback.js',
    plugins: [],
    externals: externals(),
    mode: 'development',
    port: '8181',
  }))

  // Unminified bundle without shaka-player
  const customExt = externals()
  customExt['shaka-player'] = 'shaka'
  configurations.push(webpackConfig({
    filename: 'dash-shaka-playback.external.js',
    plugins: [],
    externals: customExt,
    mode: 'development',
    port: '8182',
  }))
}

if (NPM_RUN === 'release') {
  // Minified bundle with shaka-player
  configurations.push(webpackConfig({
    filename: 'dash-shaka-playback.min.js',
    optimization: {
      minimizer: [new TerserPlugin({ 
        extractComments: false,
        terserOptions: {
          format: {
            comments: false,
          },
        },
      })],
    },
    externals: externals(),
    mode: 'production'
  }))

  // Minified bundle without shaka-player
  const customExt = externals()
  customExt['shaka-player'] = 'shaka'
  configurations.push(webpackConfig({
    filename: 'dash-shaka-playback.external.min.js',
    optimization: {
      minimizer: [new TerserPlugin({ 
        extractComments: false,
        terserOptions: {
          format: {
            comments: false,
          },
        },
      })],
    },
    externals: customExt,
    mode: 'production'
  }))
}

// https://webpack.js.org/configuration/configuration-types/#exporting-multiple-configurations
module.exports = configurations
