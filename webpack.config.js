const fs = require('fs');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');

class LegalFilesPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('LegalFilesPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: 'LegalFilesPlugin',
          stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
        },
        () => {
          for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
            const contents = fs.readFileSync(path.resolve(__dirname, file));
            compilation.emitAsset(file, new compiler.webpack.sources.RawSource(contents));
          }
        },
      );
    });
  }
}

module.exports = (env, argv) => {
  const isProd = argv.mode === 'production';
  return {
    entry: './src/main.ts',
    devtool: isProd ? 'source-map' : 'eval-cheap-module-source-map',
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
        {
          test: /\.(glsl|vert|frag)$/,
          type: 'asset/source',
        },
      ],
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    output: {
      filename: isProd ? '[name].[contenthash].js' : '[name].js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
    },
    plugins: [
      new HtmlWebpackPlugin({
        title: 'Nebula Reckoning',
        template: './src/index.html',
      }),
      new webpack.BannerPlugin({
        banner: 'Nebula Reckoning is MIT licensed. See LICENSE and THIRD_PARTY_NOTICES.md.',
        entryOnly: true,
      }),
      new LegalFilesPlugin(),
    ],
    performance: { hints: false },
    devServer: {
      static: false,
      hot: true,
      port: 8080,
      client: { overlay: { warnings: false } },
    },
  };
};
