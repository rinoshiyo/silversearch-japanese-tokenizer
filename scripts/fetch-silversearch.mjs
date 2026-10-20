// Silversearch 本体のソースのうち、検索の流れの再現に必要なファイルを取得する。
// Silversearch は GPL-3 のため、ソースをリポジトリへ取り込まず、テストの実行前に取得する。
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.2.5";
const FILES = [
  "worker/util/tokenizer.ts",
  "worker/util/global.ts",
  "worker/util/utils.ts",
  "worker/util/settings.ts",
  "worker/util/query.ts",
  "worker/util/textprocessing.ts",
  "shared/global.ts",
];

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "test", ".silversearch");
const marker = join(root, "VERSION");

// 同じ版を取得済みなら、取り直さない（オフラインでもテストを回せるように）。
if (existsSync(marker) && readFileSync(marker, "utf8").trim() === VERSION && FILES.every(file => existsSync(join(root, file)))) {
  console.log(`Silversearch ${VERSION} のソースは取得済みです`);
  process.exit(0);
}

for (const file of FILES) {
  const url = `https://raw.githubusercontent.com/MrMugame/silversearch/${VERSION}/${file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} の取得に失敗しました: ${res.status}`);
  const dest = join(root, file);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, await res.text());
}
await writeFile(marker, `${VERSION}\n`);
console.log(`Silversearch ${VERSION} のソースを ${root} に取得しました`);
