// 乱数で作った入力に対して、tokenize が常に満たすべき性質を確かめる。
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { init, isTokenizable, tokenize } from "../src/silversearch-japanese-tokenizer";

// 再現できるよう、種を固定した疑似乱数を使う。
function random(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

const POOL = Array.from(
  "日本東京大阪株式会社請求書送付々〆〇𠮷𩸽"
  + "あいうえおがぱゃっゝゞ"
  + "アイウエオガパャッヶヴー"
  + "ｱｲｳｶﾞﾊﾟｰｯ"
  + "abcXYZ019ＡＢＣ０１９éü한ж"
  + " 　\t\n,.、。，．・･「」（）()[]*_~`=#-—〜～!?！？/\\|:;"
  + "🙂❤️👨‍👩‍👧"
  + "゙゚​‍️\u{E0100}­①㍿㌔℃",
);

function randomText(next: () => number, maxLength: number): string {
  const length = Math.floor(next() * maxLength);
  let text = "";
  for (let i = 0; i < length; i++) text += POOL[Math.floor(next() * POOL.length)];
  return text;
}

const SAMPLES = (() => {
  const next = random(20261020);
  return Array.from({ length: 3000 }, () => randomText(next, 40));
})();

describe.each([true, false])("indexLastCharacter: %s", last => {
  beforeAll(() => init({ indexLastCharacter: last }));
  afterAll(() => init({}));

  describe("どんな入力でも", () => {
    it("同じ入力には同じ結果を返す", () => {
      for (const text of SAMPLES) expect(tokenize(text)).toEqual(tokenize(text));
    });

    it("空のトークン、空白・句読点・記号・制御文字を含むトークンを作らない", () => {
      for (const text of SAMPLES) {
        for (const token of tokenize(text)) {
          expect(token, JSON.stringify(text)).toMatch(/^[\p{L}\p{N}\p{M}]+$/u);
          expect(token, JSON.stringify(text)).not.toMatch(/^\p{M}/u);
        }
      }
    });

    it("壊れたサロゲートペアを作らない", () => {
      for (const text of SAMPLES) {
        for (const token of tokenize(text)) expect(token.isWellFormed(), JSON.stringify(text)).toBe(true);
      }
    });

    it("全角・半角や濁点の表し方が違っても結果が同じ（NFKC・NFC・NFD）", () => {
      for (const text of SAMPLES) {
        const expected = tokenize(text);
        for (const form of ["NFKC", "NFKD", "NFC", "NFD"] as const) {
          expect(tokenize(text.normalize(form)), `${form} ${JSON.stringify(text)}`).toEqual(expected);
        }
      }
    });

    it("日本語のトークンは 1 文字か 2 文字", () => {
      for (const text of SAMPLES) {
        for (const token of tokenize(text)) {
          if (!/[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]/u.test(token)) continue;
          expect(token.match(/\P{M}\p{M}*/gu)!.length, JSON.stringify(text)).toBeLessThanOrEqual(2);
        }
      }
    });

    it("例外を投げない", () => {
      for (const text of SAMPLES) {
        expect(() => tokenize(text)).not.toThrow();
        expect(() => isTokenizable(text)).not.toThrow();
      }
    });
  });

  describe("検索語の一部分を取り出しても当たる（bi-gram の性質）", () => {
    // 日本語だけの連続について、どの部分文字列のトークンも、元の文字列のトークンに前方一致で含まれる。
    // Silversearch はすべての語を前方一致で照合するので、これが成り立てば部分文字列の検索は必ず当たる。
    // 設定が無効の時は、連続の末尾の 1 文字だけを検索する場合を除く。
    it("部分文字列のトークンは、どれも元のトークンのいずれかの前方と一致する", () => {
      const next = random(42);
      const kana = Array.from("日本東京大阪株式会社請求書送付々〆𠮷あいうえおがアイウエオヴー");
      for (let n = 0; n < 500; n++) {
        const chars = Array.from({ length: 1 + Math.floor(next() * 12) }, () => kana[Math.floor(next() * kana.length)]!);
        const indexed = tokenize(chars.join(""));
        for (let from = 0; from < chars.length; from++) {
          for (let to = from + 1; to <= chars.length; to++) {
            if (!last && to - from === 1 && to === chars.length && chars.length > 1) continue;
            const query = chars.slice(from, to).join("");
            for (const term of tokenize(query)) {
              expect(indexed.some(token => token.startsWith(term)), `${chars.join("")} / ${query} / ${term}`).toBe(true);
            }
          }
        }
      }
    });
  });

  describe("長い入力", () => {
    it("10 万字の本文を 1 秒以内に分割し、トークン数は文字数を超えない", () => {
      const text = "東京リージョンで EC2 を動かす。請求書は毎月 ＡＷＳ から届く。\n".repeat(3000);
      const started = performance.now();
      const tokens = tokenize(text);
      expect(performance.now() - started).toBeLessThan(1000);
      expect(tokens.length).toBeLessThanOrEqual(Array.from(text).length);
    });

    it("区切りだけが続く入力でも 1 秒以内に終わる", () => {
      const text = "、。・「」 　\n".repeat(20000);
      const started = performance.now();
      expect(tokenize(text)).toEqual([]);
      expect(performance.now() - started).toBeLessThan(1000);
    });

    it("同じ文字の繰り返しでも 1 秒以内に終わる", () => {
      const started = performance.now();
      expect(tokenize("あ".repeat(100000))).toHaveLength(last ? 100000 : 99999);
      expect(tokenize("*".repeat(50000) + "あ" + "*".repeat(50000) + "い")).toEqual(last ? ["あい", "い"] : ["あい"]);
      expect(performance.now() - started).toBeLessThan(1000);
    });
  });
});
