import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@silverbulletmd/silverbullet/syscalls": fileURLToPath(new URL("./test/stubs/syscalls.ts", import.meta.url)),
    },
  },
  test: {
    // md-link-extractor の ESM 版は拡張子なしで import しており、Node では解決できないため Vite 経由で読み込む。
    server: { deps: { inline: ["md-link-extractor"] } },
  },
});
