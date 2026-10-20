// 配布する JS が Silversearch の tokenizer として読み込めることを確かめる。
// Silversearch は export が init・isTokenizable・tokenize のちょうど 3 つでないと、警告を出すだけで読み込みを拒否し、
// 日本語の検索が黙って効かなくなる。
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { loadTokenizer, TOKENIZER_PATH } from "./silversearch";

describe("配布する JS", () => {
  it("export は init・isTokenizable・tokenize の 3 つだけ", async () => {
    const module = await import(TOKENIZER_PATH);
    expect(Object.keys(module).sort()).toEqual(["init", "isTokenizable", "tokenize"]);
  });

  it("init は Promise を返し、tokenize は同期で文字列の配列を返す", async () => {
    const module = await import(TOKENIZER_PATH);
    expect(module.init({})).toBeInstanceOf(Promise);
    expect(module.tokenize("日本")).toEqual(["日本"]);
  });

  it("Silversearch 本体の読み込み処理で読み込める", async () => {
    const tokenizer = await loadTokenizer();
    expect(tokenizer).not.toBeNull();
    expect(tokenizer!.tryTokenization("東京リージョン")).toEqual(["東京", "京リ", "リー", "ージ", "ジョ", "ョン"]);
    expect(tokenizer!.tryTokenization("hello")).toBeNull();
  });

  it("CONFIG に書いた設定 indexLastCharacter が init で渡されて効く", async () => {
    const enabled = await loadTokenizer({ indexLastCharacter: true });
    expect(enabled!.tryTokenization("日本株")).toEqual(["日本", "本株", "株"]);
    const disabled = await loadTokenizer({});
    expect(disabled!.tryTokenization("日本株")).toEqual(["日本", "本株"]);
  });

  it("版の番号が package.json・PLUG.md・配布する JS の冒頭で一致する", async () => {
    const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
    const plug = await readFile(new URL("../PLUG.md", import.meta.url), "utf8");
    const source = await readFile(TOKENIZER_PATH, "utf8");
    expect(plug).toContain(`Version ${pkg.version}\n`);
    expect(source.split("\n")[0]).toBe(`// Silversearch Japanese Tokenizer ${pkg.version}`);
  });

  it("import も require も使わない（スペースに置いた 1 ファイルだけで動く）", async () => {
    const source = await readFile(TOKENIZER_PATH, "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(/);
  });

  it("正規表現の後読みを使わない（Safari 16.4 より古いブラウザで読み込みに失敗するため）", async () => {
    const source = await readFile(TOKENIZER_PATH, "utf8");
    expect(source).not.toMatch(/\(\?<[=!]/);
  });
});
