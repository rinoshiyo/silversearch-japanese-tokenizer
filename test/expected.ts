// 期待値の補助。
const JA = /^[\p{scx=Han}\p{scx=Hiragana}\p{scx=Katakana}]\p{M}*$/u;

// 末尾 1 文字を足した時のトークン列から、足した分（直前の bi-gram の 2 文字目と同じ 1 文字）を取り除く。
export function withoutLastCharacters(tokens: string[]): string[] {
  return tokens.filter((token, i) => {
    const previous = tokens[i - 1];
    if (!JA.test(token) || previous === undefined) return true;
    const chars = previous.match(/\P{M}\p{M}*/gu) ?? [];
    return !(chars.length === 2 && chars[1] === token);
  });
}
