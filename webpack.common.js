const path = require('path');

module.exports = {
  entry: './src/slalom-game.ts',
  // devtool: 'inline-source-map',
  // mode: 'development',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: require.resolve('snapsvg/dist/snap.svg.js'),
        use: 'imports-loader?wrapper=window&additionalCode=module.exports=0;',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      snapsvg: 'snapsvg/dist/snap.svg.js',
    },
  },
  output: {
    filename: 'slalom-game-bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
};