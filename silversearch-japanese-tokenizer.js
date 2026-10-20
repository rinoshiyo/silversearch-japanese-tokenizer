// Silversearch Japanese Tokenizer 0.1.0
// https://github.com/rinoshiyo/silversearch-japanese-tokenizer
// Copyright (c) 2026 rinoshiyo. MIT License.
//
// Japanese tokenizer for Silversearch (https://github.com/MrMugame/silversearch).
//
// Japanese text has no spaces between words, so the default tokenizer cannot
// find a word in the middle of a sentence. This tokenizer splits runs of
// Japanese characters into overlapping 2-character tokens (bi-grams), so that
// any substring of 2 or more characters can be found:
//
//   "東京リージョン" -> 東京 / 京リ / リー / ージ / ジョ / ョン
//
// Search terms are split the same way and Silversearch combines them with AND,
// so a page matches when it contains every token of the term. Silversearch
// matches every term as a prefix, so a single character also finds the
// bi-grams that start with it, but not the last character of a run.
//
// With the option `indexLastCharacter`, the last character of each run is added
// as a token too, so that a single character is found anywhere. The search term
// then also gets its last character, and Silversearch highlights every word that
// starts with it (searching リージョン also highlights ンス in インスタンス).
//
// Text is normalized with NFKC first, so full-width and half-width forms are
// treated alike (ＥＣ２ = EC2, ﾐｶﾝ = ミカン).
// Characters of the Japanese scripts (Kanji incl. 々〆〇, Hiragana, Katakana incl. ー),
// excluding the punctuation that these scripts share, such as 、。・「」.
const JA_CHAR = "(?=[\\p{L}\\p{N}\\p{M}])[\\p{scx=Han}\\p{scx=Hiragana}\\p{scx=Katakana}]";
// Letters and digits of other scripts (Latin, digits, Hangul, Cyrillic, ...).
const OTHER_CHAR = `(?!${JA_CHAR})[\\p{L}\\p{N}\\p{M}]`;
const HAS_JA = new RegExp(JA_CHAR, "u");
// A Japanese run starts with a base character; combining marks left over after
// normalization (such as a lone ゛) are dropped.
const RUNS = new RegExp(`(?<ja>(?!\\p{M})${JA_CHAR}(?:${JA_CHAR})*)|(?:${OTHER_CHAR})+`, "gu");
// A base character with the combining marks that follow it counts as one character.
const CHARS = /\P{M}\p{M}*/gu;
// Invisible characters (zero-width spaces, joiners, variation selectors) and enclosing
// marks (such as the keycap of 1️⃣) that would otherwise split a word or end up inside a token.
const INVISIBLE = /[\p{Cf}\p{Variation_Selector}\p{Me}]/gu;
// Markdown markers between two Japanese characters, such as **強調**、[[リンク]] and `コード`,
// are removed so that the sentence around them stays one run. A single _ ~ = is
// kept as a separator, because Japanese text uses 〜 (～) for ranges.
// The preceding character is captured and put back instead of using a lookbehind,
// which older browsers (Safari before 16.4) do not support.
const MARKUP_BETWEEN_JA = new RegExp(`(${JA_CHAR})(?:\\*+|_{2,}|~{2,}|={2,}|\`+|\\[\\[|\\]\\])+(?=${JA_CHAR})`, "gu");
function normalize(text) {
    return text.normalize("NFKC").replace(INVISIBLE, "").replace(MARKUP_BETWEEN_JA, "$1");
}
let indexLastCharacter = false;
export async function init(config) {
    indexLastCharacter = typeof config === "object" && config !== null && config.indexLastCharacter === true;
}
export function isTokenizable(text) {
    // Text without Japanese is also taken when normalization changes it, so that
    // a full-width search term such as ＥＣ２ finds EC2.
    return HAS_JA.test(text) || text.normalize("NFKC") !== text;
}
export function tokenize(text) {
    const tokens = [];
    for (const match of normalize(text).matchAll(RUNS)) {
        const run = match[0];
        if (match.groups?.ja === undefined) {
            tokens.push(run);
            continue;
        }
        const chars = run.match(CHARS) ?? [];
        for (let i = 0; i < chars.length - 1; i++) {
            tokens.push(chars[i] + chars[i + 1]);
        }
        if (chars.length === 1 || indexLastCharacter) {
            tokens.push(chars[chars.length - 1]);
        }
    }
    return tokens;
}
