# Silversearch Japanese Tokenizer

[日本語](README.md) | English

A Japanese tokenizer for [Silversearch](https://github.com/MrMugame/silversearch), the full-text search plug for [SilverBullet](https://silverbullet.md/).

Japanese has no spaces between words, so with the default tokenizer a word in the middle of a sentence cannot be found. This tokenizer splits runs of Japanese characters (Kanji, Hiragana, Katakana) into overlapping 2-character tokens (bi-grams), the same approach as the CJK bi-gram analyzers used by common full-text search engines:

```
東京リージョン -> 東京 / 京リ / リー / ージ / ジョ / ョン
```

A search term is split the same way, so `リージョン` finds a page containing `東京リージョン`. It has no dictionary and no dependencies.

- Full-width and half-width forms are treated alike (Unicode NFKC): `ＥＣ２` finds `EC2` and the other way round, `ﾐｶﾝ` finds `ミカン`.
- Covers 々 〆 〇 ヶ ゝ ゞ ー and Kanji outside the BMP such as 𠮷.
- Punctuation and symbols split words: `、。・「」（）【】〜` and the ASCII ones.
- Markdown markers between Japanese characters do not split a sentence: `**重要**な話` is found by `重要な話`, `[[会議メモ]]を見る` by `会議メモを見る`.
- English and other text is tokenized as before.

## Install

In the Library Manager, choose **Install from URI** and enter:

```
github:rinoshiyo/silversearch-japanese-tokenizer/PLUG.md
```

Then add this to your config (for example in your `CONFIG` page) and run `Silversearch: Reindex`:

```lua
config.set("silversearch.tokenizers", {
  ["Library/rinoshiyo/silversearch-japanese-tokenizer.js"] = {}
})
```

## Options

Write options in the `{}` after the tokenizer's file name, inside the `config.set` you added when installing. Without any options, the defaults are used.

| Option | Default | Description |
|---|---|---|
| `indexLastCharacter` | `false` | Also indexes the last character of each run of Japanese characters as a single-character token |

```lua
config.set("silversearch.tokenizers", {
  ["Library/rinoshiyo/silversearch-japanese-tokenizer.js"] = {
    indexLastCharacter = true,
  }
})
```

Run `Silversearch: Reindex` after changing an option, because the indexed tokens change.

### indexLastCharacter

Use `true` if you often search with a single character, and keep `false` if you prefer clean highlighting. With `true`, a single-character search no longer misses anything. In exchange, every search of 2 or more characters highlights a little more than the term.

**Single-character search**: Silversearch matches search terms as prefixes. By default, a character in the middle of a run is found through the 2-character token that starts with it. The last character of a run has no such token, so it is not found. With `true`, the last character is also indexed and is found.

| Page | Search | `false` (default) | `true` |
|---|---|---|---|
| `税金の支払い` | `税` | found | found |
| `消費税。` | `税` | not found | found |

**Side effect (highlighting)**: A search term is split by the same rule, so with `true` the last character of the term becomes a token too. Silversearch matches it as a prefix and highlights every word in the page that starts with it. The pages found do not change, only the highlighting.

| Page | Search | `false` (default) | `true` |
|---|---|---|---|
| `インスタンスを東京リージョンで建てた` | `リージョン` | `リージョ` is highlighted | `リージョン`, and also `ンス` in `インスタンス` |

## Reindexing

Silversearch keeps its index in each browser, so run `Silversearch: Reindex` on every device and browser you use, and again after updating this tokenizer or changing an option. Pages you create or edit afterwards are indexed automatically.

## Limitations

These come from the bi-gram approach or from Silversearch itself, and are verified by tests.

- A compound typed without spaces is not found when the text has other characters in between: `請求書送付` does not find `請求書を送付した`. Search for `請求書 送付` instead.
- A term can match inside a longer word (`京都` finds `東京都`), and it matches whenever all of its bi-grams appear in a page, even in a different order (`インスタンス` finds `インスタント`, because both contain `イン`, `ンス`, `スタ` and `タン`). Put the term in quotes (`"インスタンス"`) to match it exactly.
- The prolonged sound mark, Hiragana/Katakana and old/variant Kanji forms are distinguished: `サーバー` does not find `サーバ`, `リンゴ` does not find `りんご`, `高橋` does not find `髙橋`.
- A single character at the end of a run is not found unless `indexLastCharacter` is enabled (see [Options](#options)).
- Silversearch 1.2.5 removes the half-width voiced sound marks and prolonged sound mark (`ﾞ ﾟ ｰ`) from both the page and the search term before tokenizing, so half-width Katakana with these marks is not found (`ﾊﾟｿｺﾝ` and `パソコン` do not find each other). This needs a fix in Silversearch. As a workaround, setting the Silversearch option `ignoreDiacritics` to `false` lets a half-width Katakana search term find full-width text. Pages written in half-width Katakana are still not found, and accented Latin letters are then distinguished (`cafe` no longer finds `café`).
- Quoted search and highlighting compare the raw text, so they distinguish full-width from half-width (`"EC2"` does not find `ＥＣ２`, and `ＥＣ２` is not highlighted when searching `EC2`).
- Highlighting may leave out the last character of a term with an odd number of characters (`リージョン` is highlighted as `リージョ`), because Silversearch skips matches that overlap. The page is still found.

## Development

The tokenizer is written in TypeScript (`src/`) and compiled to the single file `silversearch-japanese-tokenizer.js`, which is committed so that the Library Manager can install it.

```shell
npm ci
npm test   # type check, build, and tests
```

When you change `silversearch-japanese-tokenizer.js`, bump the version too. It appears in three places, `package.json`, `PLUG.md` and the header of `src/silversearch-japanese-tokenizer.ts`, and a test checks that they match. The Library Manager compares only the content of `PLUG.md` when updating, so changing the `.js` without bumping the version does not reach users.

The tests run the tokenizer through the indexing and search code of Silversearch 1.2.5, downloaded from GitHub before the tests run (Silversearch is GPL-3.0 and is not included in this repository).

## License

MIT
