const path = require('path');
const webpack = require('webpack');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
  },
  devServer: {
    contentBase: path.resolve(__dirname, 'dist'),
    port: 3000,
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env': {
        'REACT_APP_INFURA_API_KEY': JSON.stringify(process.env.REACT_APP_INFURA_API_KEY),
      },
    }),
  ],
  resolve: {
    extensions: ['.mjs', '.js', '.json'],
    fallback: {
      assert: require.resolve('assert/'),
      buffer: require.resolve('buffer/'),
      crypto: require.resolve('crypto-browserify'),
      http: require.resolve('stream-http'),
      https: require.resolve('https-browserify'),
      os: require.resolve('os-browserify/browser'),
      path: require.resolve('path-browserify'),
      stream: require.resolve('stream-browserify'),
      util: require.resolve('util/'),
      zlib: require.resolve('browserify-zlib'),
      "cbor": require.resolve("cbor"),
      "nofilter": require.resolve("nofilter"),
      "sha3": require.resolve("sha3"),
    },
  },
};
