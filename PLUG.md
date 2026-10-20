---
name: Library/rinoshiyo/Silversearch-Japanese-Tokenizer
tags: meta/library
files:
- silversearch-japanese-tokenizer.js
---
# Silversearch Japanese Tokenizer

Version 0.1.0

A Japanese tokenizer for [Silversearch](https://github.com/MrMugame/silversearch). It splits Japanese text into overlapping 2-character tokens (bi-grams), so words in the middle of a sentence can be found. Full-width and half-width forms are treated alike.

After installing, add this to your config and run `Silversearch: Reindex`:

```lua
config.set("silversearch.tokenizers", {
  ["Library/rinoshiyo/silversearch-japanese-tokenizer.js"] = {}
})
```

See https://github.com/rinoshiyo/silversearch-japanese-tokenizer for the limitations.
