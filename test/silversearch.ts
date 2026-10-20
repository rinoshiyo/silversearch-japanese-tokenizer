// Silversearch 1.2.5 の索引と検索の流れを再現する。
// 本体のソースは scripts/fetch-silversearch.mjs が test/.silversearch/ に取得したものを使い、
// worker/util/searchengine.ts の MiniSearch の設定と検索後の絞り込みだけをここで再実装する。
//
// This file is adapted from Silversearch (https://github.com/MrMugame/silversearch),
// worker/util/searchengine.ts, and is licensed under GPL-3.0, unlike the rest of this repository.
import MiniSearch, { type Options, type SearchResult } from "minisearch";
import { fileURLToPath } from "node:url";
import { Query } from "./.silversearch/worker/util/query";
import { getMatches } from "./.silversearch/worker/util/textprocessing";
import type { TokenizerConfig } from "./.silversearch/worker/util/settings";
import { tokenizeForIndexing, tokenizeForSearch, Tokenizer } from "./.silversearch/worker/util/tokenizer";
import { removeDiacritics, removeStrayDiacritics, stripMarkdownCharacters } from "./.silversearch/worker/util/utils";

export const TOKENIZER_PATH = fileURLToPath(new URL("../silversearch-japanese-tokenizer.js", import.meta.url));

// Node の ESM は blob: の URL を import できないため、Silversearch が作る blob: の URL を data: の URL に差し替える。
function installBlobUrlShim(): void {
  const NativeBlob = globalThis.Blob;
  const sources = new WeakMap<Blob, string>();
  class SourceBlob extends NativeBlob {
    constructor(parts: (string | Uint8Array)[], options?: { type?: string }) {
      super(parts, options);
      sources.set(this, parts.map(part => typeof part === "string" ? part : new TextDecoder().decode(part)).join(""));
    }
  }
  globalThis.Blob = SourceBlob as typeof Blob;
  URL.createObjectURL = (blob: Blob) => `data:text/javascript;base64,${Buffer.from(sources.get(blob) ?? "").toString("base64")}`;
  URL.revokeObjectURL = () => {};
}

let shimInstalled = false;

// 配布する JS を、Silversearch 本体の読み込み処理（valibot による export の検査を含む）で読み込む。
// config は CONFIG の silversearch.tokenizers に書く tokenizer ごとの設定。
// 読み込むたびに init が呼ばれ、モジュールの設定が置き換わるので、索引を作る直前に読み込む。
// 読み込んだモジュールはすべての索引で共有されるため、設定の違う索引を 2 つ作って交互に検索してはならない
// （後から作った索引の設定が、先に作った索引の検索にも効いてしまう）。
export function loadTokenizer(config: Record<string, TokenizerConfig> = {}): Promise<Tokenizer | null> {
  if (!shimInstalled) {
    installBlobUrlShim();
    shimInstalled = true;
  }
  return Tokenizer.loadFromPath(TOKENIZER_PATH, config);
}

type Entry = { path: string; basename: string; directory: string; aliases: string[]; displayName: string; unmarkedTags: string[]; content: string };
export type Page = string | { content?: string; aliases?: string[]; displayName?: string; tags?: string[] };

export type FixtureOptions = {
  // false にすると日本語 tokenizer を登録しない（導入前の比較用）。
  withTokenizer?: boolean;
  // Silversearch の設定 ignoreDiacritics（既定 true）。
  ignoreDiacritics?: boolean;
  // Silversearch の設定 fuzziness（既定 "1"）。
  fuzziness?: "0" | "1" | "2";
  // 日本語 tokenizer の設定 indexLastCharacter（既定 false）。
  indexLastCharacter?: boolean;
};

export class SearchFixture {
  private readonly entries = new Map<string, Entry>();

  private constructor(private minisearch: MiniSearch<Entry>, private readonly tokenizers: Tokenizer[], private readonly options: Required<FixtureOptions>) {}

  // pages はページ名から本文（または各フィールド）への対応。
  public static async create(pages: Record<string, Page>, options: FixtureOptions = {}): Promise<SearchFixture> {
    const resolved = { withTokenizer: true, ignoreDiacritics: true, fuzziness: "1" as const, indexLastCharacter: false, ...options };
    const loaded = resolved.withTokenizer ? await loadTokenizer(resolved.indexLastCharacter ? { indexLastCharacter: true } : {}) : null;
    if (resolved.withTokenizer && !loaded) throw new Error("tokenizer の読み込みに失敗しました");
    const tokenizers = loaded ? [loaded] : [];
    const fixture = new SearchFixture(new MiniSearch<Entry>(SearchFixture.indexOptions(tokenizers, resolved)), tokenizers, resolved);
    for (const [name, page] of Object.entries(pages)) fixture.put(name, page);
    return fixture;
  }

  private static indexOptions(tokenizers: Tokenizer[], options: Required<FixtureOptions>): Options<Entry> {
    return {
      tokenize: text => tokenizeForIndexing(text, { tokenizers, tokenizeUrls: true }),
      processTerm: term => (options.ignoreDiacritics ? removeDiacritics(term, false) : term).toLowerCase(),
      idField: "path",
      fields: ["content", "basename", "directory", "aliases", "displayName", "unmarkedTags"],
    };
  }

  // ページを追加する。同じ名前のページがあれば置き換える。
  public put(name: string, page: Page): void {
    const fields = typeof page === "string" ? { content: page } : page;
    const entry: Entry = {
      path: name,
      basename: name.split("/").pop() ?? name,
      directory: name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "",
      aliases: fields.aliases ?? [],
      displayName: fields.displayName ?? "",
      unmarkedTags: fields.tags ?? [],
      // Silversearch は索引の前に本文から発音記号を取り除く（searchengine.ts の pathToIndexableEntry）。
      content: removeStrayDiacritics(fields.content ?? ""),
    };
    this.entries.set(name, entry);
    if (this.minisearch.has(name)) this.minisearch.replace(entry);
    else this.minisearch.add(entry);
  }

  // 索引を JSON に書き出して読み直す（Silversearch のキャッシュの往復）。
  public roundTrip(): void {
    this.minisearch = MiniSearch.loadJSON(JSON.stringify(this.minisearch), SearchFixture.indexOptions(this.tokenizers, this.options));
  }

  // 索引に入っている語の数（索引の大きさの目安）。
  public get termCount(): number {
    return this.minisearch.termCount;
  }

  // 検索窓に text を入れた時の結果を、Silversearch と同じ絞り込みをかけて返す。
  public results(text: string): SearchResult[] {
    const query = new Query(text, { ignoreDiacritics: this.options.ignoreDiacritics, ignoreArabicDiacritics: false });
    if (query.isEmpty()) return [];
    const fuzziness = { "0": 0, "1": 0.1, "2": 0.2 }[this.options.fuzziness];
    let results = this.minisearch.search(tokenizeForSearch(query.segmentsToStr(), { tokenizers: this.tokenizers }), {
      prefix: term => term.length >= 1,
      fuzzy: term => term.length <= 3 ? 0 : term.length <= 5 ? fuzziness / 2 : fuzziness,
      boost: { basename: 10, aliases: 1, displayName: 10, directory: 7, unmarkedTags: 1 },
      tokenize: t => [t],
    });
    if (query.query.ext?.length) {
      results = results.filter(r => {
        const ext = (r.id as string).includes(".") ? "." + (r.id as string).split(".").pop() : ".md";
        return query.query.ext!.some(e => ext.startsWith(e.startsWith(".") ? e : "." + e));
      });
    }
    if (query.query.path) {
      results = results.filter(r => query.query.path!.some(p => (r.id as string).toLowerCase().includes(p.toLowerCase())));
    }
    if (query.query.exclude.path) {
      results = results.filter(r => !query.query.exclude.path!.some(p => (r.id as string).toLowerCase().includes(p.toLowerCase())));
    }
    const exactTerms = query.getExactTerms();
    if (exactTerms.length) {
      results = results.filter(r => {
        const entry = this.entries.get(r.id)!;
        const content = stripMarkdownCharacters(removeDiacritics(entry.content)).toLowerCase();
        const title = removeDiacritics(entry.path.toLowerCase(), false);
        return exactTerms.every(q => content.includes(q) || title.includes(q));
      });
    }
    const exclusions = query.query.exclude.text;
    if (exclusions.length) {
      results = results.filter(r => exclusions.every(q => !this.entries.get(r.id)!.content.toLowerCase().includes(q)));
    }
    return results;
  }

  // 結果に出るページ名（名前順）。
  public search(text: string): string[] {
    return this.results(text).map(r => r.id as string).sort();
  }

  // 結果に出るページ名（Silversearch の表示順）。
  public ranking(text: string): string[] {
    return this.results(text).map(r => r.id as string);
  }

  // 検索結果のページで強調表示される文字列（Silversearch の getMatches と同じ処理）。
  public async highlights(text: string, name: string): Promise<string[]> {
    const result = this.results(text).find(r => r.id === name);
    if (!result) return [];
    const query = new Query(text, { ignoreDiacritics: this.options.ignoreDiacritics, ignoreArabicDiacritics: false });
    const matches = await getMatches(this.entries.get(name)!.content, [...result.terms, ...query.getExactTerms()], query);
    return matches.map(m => m.match);
  }
}
