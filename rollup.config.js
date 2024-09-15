import deckyPlugin from "@decky/rollup";
import url from "@rollup/plugin-url";
import { readFileSync } from "fs";

const manifest = JSON.parse(readFileSync("plugin.json", "utf-8"));

export default deckyPlugin({
  plugins: [
    url({
      include: ['**/*.webp'],
      emitFiles: true,
      limit: 0,
      destDir: 'dist/assets',
      fileName: '[name][hash][extname]',
      publicPath: `http://127.0.0.1:1337/plugins/${manifest.name}/assets/`
    })
  ]
});
