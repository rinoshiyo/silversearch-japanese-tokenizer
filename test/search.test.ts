// Silversearch 1.2.5 の索引と検索の流れを通した結合テスト。
// 「本文 X のページが、検索語 Y で結果に出るか」を確かめる。
import { describe, expect, it } from "vitest";
import { type FixtureOptions, SearchFixture } from "./silversearch";

// 1 ページだけの索引を作り、検索語ごとに当たるかどうかを返す。
async function hits(content: string, queries: string[], options: FixtureOptions = {}): Promise<Record<string, boolean>> {
  const fixture = await SearchFixture.create({ page: content }, options);
  return Object.fromEntries(queries.map(q => [q, fixture.search(q).includes("page")]));
}

function all(queries: string[], value: boolean): Record<string, boolean> {
  return Object.fromEntries(queries.map(q => [q, value]));
}

describe("文の途中の語が当たる", () => {
  it.each([
    ["本番は東京リージョンで動かす", ["東京リージョン", "リージョン", "東京", "リー", "本番", "動かす", "で動"]],
    ["日本株が上がった", ["日本", "日本株", "本株", "上がった", "株が"]],
    ["請求書を送付した", ["請求書", "請求", "求書", "送付", "送付した", "請求書を送付"]],
    ["深夜に決定事項を共有した", ["深夜", "決定事項", "事項", "共有", "決定"]],
    ["社内Wikiの管理サーバーを移す", ["管理サーバー", "サーバー", "サーバ", "管理", "Wiki", "wiki", "社内"]],
    ["東京大学院に進む", ["東京大学", "大学院", "大学", "学院"]],
    ["関西国際空港から出発", ["国際空港", "関西国際空港", "空港", "国際"]],
  ])("%s", async (content, queries) => {
    expect(await hits(content, queries)).toEqual(all(queries, true));
  });

  it("含まれない語は当たらない", async () => {
    const queries = ["大阪", "リージョンX", "東京都", "リーダー", "株価", "米国株"];
    expect(await hits("本番は東京リージョンで動かす。日本株が上がった", queries)).toEqual(all(queries, false));
  });
});

describe("1 文字で検索する", () => {
  // [本文, 連続の途中の字, 連続の末尾の字]
  const rows: [string, string[], string[]][] = [
    ["日本株", ["日", "本"], ["株"]],
    ["東京都", ["東", "京"], ["都"]],
    ["消費税。", ["消", "費"], ["税"]],
    ["税金の支払い", ["税", "金", "支"], ["い"]],
    ["日本、株。", ["日"], ["本"]],
    ["佐々木", ["佐", "々"], ["木"]],
    ["𠮷野家", ["𠮷", "野"], ["家"]],
  ];

  it.each(rows)("%s: 連続の途中の字は当たる", async (content, middle) => {
    expect(await hits(content, middle)).toEqual(all(middle, true));
  });

  it.each(rows)("%s: 連続の末尾の字は、既定では当たらない", async (content, _middle, end) => {
    expect(await hits(content, end)).toEqual(all(end, false));
  });

  it.each(rows)("%s: 連続の末尾の字も、設定 indexLastCharacter を有効にすると当たる", async (content, middle, end) => {
    const queries = [...middle, ...end];
    expect(await hits(content, queries, { indexLastCharacter: true })).toEqual(all(queries, true));
  });

  it.each([{}, { indexLastCharacter: true }])("1 文字だけの連続は当たる %j", async options => {
    expect(await hits("日本、株。鍵", ["株", "鍵"], options)).toEqual({ 株: true, 鍵: true });
  });

  it.each([{}, { indexLastCharacter: true }])("含まれない字は当たらない %j", async options => {
    expect(await hits("日本株", ["米", "債"], options)).toEqual({ 米: false, 債: false });
  });
});

describe("区切りの前後の語が当たり、区切りをまたいだ語は当たらない", () => {
  it.each([
    "東京,大阪", "東京.大阪", "東京、大阪", "東京。大阪", "東京，大阪", "東京．大阪",
    "東京・大阪", "東京･大阪", "東京 大阪", "東京　大阪", "東京\n大阪", "東京\r\n大阪", "東京\t大阪",
    "東京/大阪", "東京／大阪", "東京|大阪", "(東京)(大阪)", "「東京」「大阪」", "【東京】【大阪】",
    "東京〜大阪", "東京～大阪", "東京~大阪", "東京-大阪", "東京🙂大阪",
  ])("%j", async content => {
    expect(await hits(content, ["東京", "大阪", "東", "大", "東京 大阪", "大阪 東京", "京大"]))
      .toEqual({ 東京: true, 大阪: true, 東: true, 大: true, "東京 大阪": true, "大阪 東京": true, 京大: false });
    expect(await hits(content, ["京", "阪", "京大"], { indexLastCharacter: true })).toEqual({ 京: true, 阪: true, 京大: false });
  });

  it("区切りを消して前後をつなげた語は当たらない", async () => {
    expect(await hits("京 都", ["京都"])).toEqual({ 京都: false });
    expect(await hits("京都 大学", ["京都大学"])).toEqual({ 京都大学: false });
  });
});

describe("全角・半角の違いを問わず当たる", () => {
  it.each([
    ["ＥＣ２で建てた", ["EC2", "ec2", "ＥＣ２", "ｅｃ２", "ＥC2"]],
    ["EC2で建てた", ["EC2", "ec2", "ＥＣ２", "ｅｃ２"]],
    ["ＥＣ２", ["EC2", "ec2", "ＥＣ２"]],
    ["EC2", ["ＥＣ２", "ｅｃ２"]],
    ["ＡＷＳの請求書", ["AWS", "aws", "ＡＷＳ", "AWSの請求書", "ＡＷＳの請求書"]],
    ["AWSの請求書", ["ＡＷＳ", "ＡＷＳの請求書"]],
    ["第１２回の会議", ["第12回", "１２", "12", "第１２回"]],
    ["第12回の会議", ["第１２回", "１２"]],
    ["２０２６年１０月の請求", ["2026年", "2026年10月", "10月", "２０２６年"]],
    ["ﾐｶﾝの請求書", ["ミカン", "ミカンの請求書", "ｶﾝ", "カン"]],
    ["ミカンの請求書", ["ﾐｶﾝ", "ﾐｶﾝの請求書", "ｶﾝ"]],
    ["ｶﾀｶﾅの名前", ["カタカナ", "ｶﾀｶﾅ"]],
    ["カタカナの名前", ["ｶﾀｶﾅ"]],
    ["㍿ミカン", ["株式会社", "株式会社ミカン", "ミカン"]],
    ["株式会社ミカン", ["㍿", "㍿ミカン"]],
    ["手順①を実行", ["手順1", "1"]],
    ["10㌔走った", ["10キロ", "キロ"]],
  ])("%s", async (content, queries) => {
    expect(await hits(content, queries)).toEqual(all(queries, true));
  });
});

describe("濁点・半濁点", () => {
  it("合成済みの濁点と、分解された濁点を同じ字として扱う", async () => {
    expect(await hits("がくせい", ["がくせい", "がく"])).toEqual({ "がくせい": true, がく: true });
    expect(await hits("がくせい", ["がくせい", "がく"])).toEqual({ がくせい: true, がく: true });
  });

  it("濁点の有無を区別する", async () => {
    expect(await hits("バグ修正", ["バグ", "ハグ", "ハク"])).toEqual({ バグ: true, ハグ: false, ハク: false });
    expect(await hits("ぱんを焼く", ["はん", "ばん", "ぱん"])).toEqual({ はん: false, ばん: false, ぱん: true });
  });

  it("Silversearch の設定 ignoreDiacritics が false でも当たる", async () => {
    const fixture = await SearchFixture.create({ page: "バグ修正とＥＣ２" }, { ignoreDiacritics: false });
    expect(fixture.search("バグ")).toEqual(["page"]);
    expect(fixture.search("ハグ")).toEqual([]);
    expect(fixture.search("EC2")).toEqual(["page"]);
  });
});

describe("日本語の文字の範囲", () => {
  it.each([
    ["佐々木さんに連絡", ["佐々木", "々木", "佐々木さん"]],
    ["〆切は明日", ["〆切", "〆切は明日"]],
    ["〇月〇日に開催", ["〇月", "〇日"]],
    ["𠮷野家で昼食", ["𠮷野家", "𠮷野"]],
    ["一ヶ月後", ["一ヶ月", "ヶ月"]],
    ["いすゞの車", ["いすゞ", "すゞ"]],
    ["ユーザー管理", ["ユーザー", "ユーザー管理", "ーザ"]],
    ["葛\u{E0100}飾区", ["葛飾", "葛飾区"]],
  ])("%s", async (content, queries) => {
    expect(await hits(content, queries)).toEqual(all(queries, true));
  });
});

describe("Markdown の記号をまたいで当たる", () => {
  it.each([
    ["これは**重要**な話", ["重要な話", "重要", "要な"]],
    ["*強調*された文", ["強調された", "強調"]],
    ["~~削除~~した", ["削除した"]],
    ["==注目==の件", ["注目の件"]],
    ["`設定`を変える", ["設定を変える"]],
    ["詳細は[[会議メモ]]を見る", ["会議メモ", "会議メモを見る", "詳細は会議メモ"]],
    ["[手順書](https://example.com/manual)を読む", ["手順書", "読む", "manual"]],
    ["# 議事録\n- [ ] 宿題を出す", ["議事録", "宿題"]],
  ])("%s", async (content, queries) => {
    expect(await hits(content, queries)).toEqual(all(queries, true));
  });
});

describe("英数字の検索を壊さない", () => {
  const english = {
    a: "Deploy the EC2 instance with Terraform",
    b: "meeting notes about fooBar and foo-bar",
    c: "version v1.2.5 released on 2026-10-20",
    d: "Café menu",
  };
  const mixed = Object.fromEntries(Object.entries(english).map(([k, v]) => [`${k}-ja`, `${v} の議事録`]));
  const queries = ["EC2", "ec2", "instance", "terraform", "Terraform", "deploy", "meeting", "notes", "foo", "bar", "fooBar", "foo-bar", "v1.2.5", "v1", "2026", "released", "cafe", "café", "menu", "inst", "deplo"];

  it.each(queries)("%s で、tokenizer を入れる前に当たっていたページが当たり続ける", async query => {
    const withTokenizer = await SearchFixture.create({ ...english, ...mixed });
    const without = await SearchFixture.create({ ...english, ...mixed }, { withTokenizer: false });
    const before = without.search(query);
    const after = withTokenizer.search(query);
    expect(after).toEqual(expect.arrayContaining(before));
    // 日本語を含むページでも、英語だけのページと同じように当たる
    for (const id of after.filter(id => !id.endsWith("-ja"))) expect(after).toContain(`${id}-ja`);
  });

  it("日本語を含まないが NFKC で変わる文字（全角の空白・™・合字）を含む英語のページも、英語で当たる", async () => {
    const pages = { nbsp: "deploy the\u00a0EC2 instance", tm: "Acme™ tool for teams", ligature: "\ufb01le system notes", apostrophe: "don\u2019t stop\u00a0here" };
    const withTokenizer = await SearchFixture.create(pages);
    const without = await SearchFixture.create(pages, { withTokenizer: false });
    for (const query of ["EC2", "instance", "deploy", "Acme", "tool", "file", "system", "stop", "here", "don"]) {
      expect(withTokenizer.search(query), query).toEqual(expect.arrayContaining(without.search(query)));
    }
    expect(withTokenizer.search("EC2")).toEqual(["nbsp"]);
    expect(withTokenizer.search("file")).toEqual(["ligature"]);
  });

  it("日英が混在する語", async () => {
    const queries = ["AWSの請求書", "S3バケット", "Dockerで起動", "東京API", "東京api", "api"];
    expect(await hits("AWSの請求書。S3バケットはDockerで起動。東京APIの話", queries)).toEqual(all(queries, true));
  });

  it("前方一致は英数字にも効く", async () => {
    expect(await hits("EC20 を使う日本語", ["EC2", "ec", "EC201"])).toEqual({ EC2: true, ec: true, EC201: false });
  });
});

describe("検索の構文", () => {
  it("空白区切りの語はすべてを含むページだけに当たる（順番は問わない）", async () => {
    const fixture = await SearchFixture.create({ a: "東京と大阪", b: "東京だけ", c: "大阪だけ" });
    expect(fixture.search("東京 大阪")).toEqual(["a"]);
    expect(fixture.search("大阪 東京")).toEqual(["a"]);
    expect(fixture.search("東京　大阪")).toEqual(["a"]);
  });

  it("除外（-語）が日本語でも効く", async () => {
    const fixture = await SearchFixture.create({ a: "東京と大阪", b: "東京だけ" });
    expect(fixture.search("東京 -大阪")).toEqual(["b"]);
  });

  it("引用符で囲むと、その並びのとおりに含むページだけに絞る", async () => {
    const fixture = await SearchFixture.create({ a: "東京大学に行く", b: "東京 京大 大学" });
    expect(fixture.search("東京大学")).toEqual(["a", "b"]);
    expect(fixture.search("\"東京大学\"")).toEqual(["a"]);
  });

  it("path: の絞り込みと組み合わせられる", async () => {
    const fixture = await SearchFixture.create({ "議事録/2026-10": "東京の件", "メモ/雑記": "東京の件" });
    expect(fixture.search("東京 path:議事録")).toEqual(["議事録/2026-10"]);
  });

  it.each(["", " ", "　", "・", "🙂", "、。", "!!"])("%j だけの検索ではページが出ない", async query => {
    const fixture = await SearchFixture.create({ a: "東京・大阪🙂、。!!" });
    expect(fixture.search(query)).toEqual([]);
  });

  it("絵文字を添えた検索語でも当たる", async () => {
    expect(await hits("日本株を買った", ["株🙂", "🙂株"])).toEqual({ "株🙂": true, "🙂株": true });
  });
});

describe("本文以外のフィールド", () => {
  it("ページ名で当たる", async () => {
    const fixture = await SearchFixture.create({ "議事録/2026年10月定例会議": "本文なし" });
    expect(fixture.search("定例")).toEqual(["議事録/2026年10月定例会議"]);
    expect(fixture.search("例")).toEqual(["議事録/2026年10月定例会議"]);
    expect(fixture.search("定例会議")).toEqual(["議事録/2026年10月定例会議"]);
  });

  it("別名・表示名で当たる", async () => {
    const fixture = await SearchFixture.create({ a: { content: "x", aliases: ["社内Wiki", "ナレッジベース"] }, b: { content: "y", displayName: "東京リージョン" } });
    expect(fixture.search("ナレッジベース")).toEqual(["a"]);
    expect(fixture.search("ベース")).toEqual(["a"]);
    expect(fixture.search("リージョン")).toEqual(["b"]);
  });

  it("フォルダ名で当たる", async () => {
    const fixture = await SearchFixture.create({ "経理/請求書/2026年10月": "本文", "メモ/雑記": "本文" });
    expect(fixture.search("請求書")).toEqual(["経理/請求書/2026年10月"]);
    expect(fixture.search("経理")).toEqual(["経理/請求書/2026年10月"]);
  });

  it("タグで当たる", async () => {
    const fixture = await SearchFixture.create({ a: { content: "本文", tags: ["議事録", "社内Wiki"] }, b: "本文" });
    expect(fixture.search("議事録")).toEqual(["a"]);
    expect(fixture.search("事録")).toEqual(["a"]);
  });

  it("ページ名に当たったページが上位に来る", async () => {
    const fixture = await SearchFixture.create({ "メモ/雑記": "請求書の話を少しだけ", "経理/請求書の送り方": "手順" });
    expect(fixture.ranking("請求書")[0]).toBe("経理/請求書の送り方");
  });
});

describe("索引の更新と保存", () => {
  it("ページを書き換えると、古い語では当たらなくなる", async () => {
    const fixture = await SearchFixture.create({ page: "日本株" });
    expect(fixture.search("本株")).toEqual(["page"]);
    fixture.put("page", "米国債");
    expect(fixture.search("本株")).toEqual([]);
    expect(fixture.search("国債")).toEqual(["page"]);
  });

  it("索引を保存して読み直しても同じ結果になる", async () => {
    const fixture = await SearchFixture.create({ a: "東京リージョンのＥＣ２", b: "ﾊﾟｿｺﾝ", c: "佐々木さん" });
    const queries = ["リージョン", "EC2", "パソコン", "佐", "リー"];
    const before = queries.map(q => fixture.search(q));
    fixture.roundTrip();
    expect(queries.map(q => fixture.search(q))).toEqual(before);
  });
});

describe("強調表示", () => {
  it("既定では、検索語の範囲だけが強調される", async () => {
    const fixture = await SearchFixture.create({ page: "インスタンスを東京リージョンで建てた" });
    const highlights = await fixture.highlights("リージョン", "page");
    expect(highlights.join(""), JSON.stringify(highlights)).not.toContain("ンス");
    expect(highlights.some(h => h.includes("リー"))).toBe(true);
  });

  it("設定 indexLastCharacter を有効にすると、検索語の末尾の字で始まる語も強調される", async () => {
    const fixture = await SearchFixture.create({ page: "インスタンスを東京リージョンで建てた" }, { indexLastCharacter: true });
    const highlights = await fixture.highlights("リージョン", "page");
    expect(highlights, JSON.stringify(highlights)).toContain("ンス");
  });

  it.each([
    ["本番は東京リージョンで動かす", "リージョン", "リー"],
    ["日本株が上がった", "株", "株"],
    ["日本株が上がった", "日本株", "日本"],
    ["これは**重要**な話", "重要", "重要"],
  ])("%s を %s で検索すると、当たった箇所が強調される", async (content, query, expected) => {
    const fixture = await SearchFixture.create({ page: content });
    const highlights = await fixture.highlights(query, "page");
    expect(highlights.some(h => h.includes(expected)), JSON.stringify(highlights)).toBe(true);
  });
});

describe("既知の制約（bi-gram の方式と Silversearch 本体の仕様による。変わったら README を直す）", () => {
  it("スペースなしでつなげた複合語は、本文に助詞などが挟まると当たらない", async () => {
    expect(await hits("請求書を送付した", ["請求書送付", "請求書 送付"])).toEqual({ 請求書送付: false, "請求書 送付": true });
  });

  it("語の一部として含まれていれば当たる（東京都に京都）", async () => {
    expect(await hits("東京都の予算", ["京都"])).toEqual({ 京都: true });
  });

  it("2 文字の組が離れた場所にそろうと当たる（引用符で囲めば絞れる）", async () => {
    expect(await hits("東京 京大 大学", ["東京大学", "\"東京大学\""])).toEqual({ 東京大学: true, "\"東京大学\"": false });
  });

  it("似た語にも当たる（インスタンスにインスタント）。2 文字の組がそろうためで、あいまい検索を切っても変わらない", async () => {
    const pages = { instant: "インスタント食品", instance: "インスタンスを起動" };
    for (const fuzziness of ["0", "1"] as const) {
      const fixture = await SearchFixture.create(pages, { fuzziness });
      expect(fixture.search("インスタンス")).toEqual(["instance", "instant"]);
      expect(fixture.search("\"インスタンス\"")).toEqual(["instance"]);
    }
  });

  it("長音の有無は区別する（サーバーにサーバは当たるが、逆は当たらない）", async () => {
    expect(await hits("サーバーの設定", ["サーバ"])).toEqual({ サーバ: true });
    expect(await hits("サーバの設定", ["サーバー"])).toEqual({ サーバー: false });
  });

  it("ひらがなとカタカナは区別する", async () => {
    expect(await hits("りんごの育て方", ["リンゴ", "りんご"])).toEqual({ リンゴ: false, りんご: true });
  });

  it("旧字体・異体字は区別する", async () => {
    expect(await hits("髙橋さん", ["高橋"])).toEqual({ 高橋: false });
    expect(await hits("國際線", ["国際"])).toEqual({ 国際: false });
  });

  it("引用符で囲んだ検索は全角・半角を区別する（Silversearch 本体が本文を直接照合するため）", async () => {
    expect(await hits("ＥＣ２で建てた", ["\"EC2\"", "EC2"])).toEqual({ "\"EC2\"": false, EC2: true });
  });

  describe("半角カナの濁点・半濁点・長音（ﾞ ﾟ ｰ）は、Silversearch 本体が tokenizer に渡す前に取り除く", () => {
    // Silversearch の removeDiacritics と removeStrayDiacritics は、全角の ゛゜ー（結合用）を除外しているが、
    // 半角の ﾞ（U+FF9E）ﾟ（U+FF9F）ｰ（U+FF70）は除外していない。本文は索引の前に、検索語は検索の前に消される。
    it("本文の半角カナは、濁点などが消えた形で索引される", async () => {
      expect(await hits("ﾊﾟｿｺﾝを買った", ["パソコン", "ハソコン"])).toEqual({ パソコン: false, ハソコン: true });
      expect(await hits("ｻｰﾊﾞｰの設定", ["サーバー", "サハ"])).toEqual({ サーバー: false, サハ: true });
    });

    it("検索語の半角カナも、濁点などが消えた形で検索される", async () => {
      expect(await hits("パソコンを買った", ["ﾊﾟｿｺﾝ"])).toEqual({ ﾊﾟｿｺﾝ: false });
      expect(await hits("ハソコン", ["ﾊﾟｿｺﾝ"])).toEqual({ ﾊﾟｿｺﾝ: true });
    });

    it("設定 ignoreDiacritics を false にすると、検索語の半角カナは全角の本文に当たる", async () => {
      const fixture = await SearchFixture.create({ page: "パソコンとサーバーとデータベース" }, { ignoreDiacritics: false });
      expect(["ﾊﾟｿｺﾝ", "ｻｰﾊﾞｰ", "ﾃﾞｰﾀﾍﾞｰｽ"].map(q => fixture.search(q))).toEqual([["page"], ["page"], ["page"]]);
    });
  });

  it("全角・半角が違う箇所は、当たっても強調されない（Silversearch 本体が本文を直接照合するため）", async () => {
    const fixture = await SearchFixture.create({ page: "ＥＣ２で建てた" });
    expect(fixture.search("EC2")).toEqual(["page"]);
    expect(await fixture.highlights("EC2", "page")).toEqual([]);
  });
});

describe("索引の大きさ", () => {
  it("日本語のページ 300 枚の索引の語の数を記録する", async () => {
    const base = "本番は東京リージョンで動かす。請求書は毎月ＡＷＳから届く。社内Wikiの管理サーバーを移した。議事録は SilverBullet に置く。";
    const pages = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`p${i}`, `${base}第${i}回の会議で決めた事項。`.repeat(20)]));
    const withTokenizer = await SearchFixture.create(pages);
    const without = await SearchFixture.create(pages, { withTokenizer: false });
    console.log(`索引の語の数: tokenizer あり ${withTokenizer.termCount}、なし ${without.termCount}`);
    expect(withTokenizer.termCount).toBeLessThan(5000);
  });
});
